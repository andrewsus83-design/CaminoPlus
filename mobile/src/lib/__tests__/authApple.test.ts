// Sign in with Apple: the plain logic (lib/authAppleCore.ts) and the wiring rules around it (lib/authApple.ts, the
// Apple button and the sign-in screens). Run: npm run test:lib
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { appleAvailable, appleErrorMessage, appleFullName, forgetPendingName, isAppleCancel, isPlaceholderName, makeNonce, nameFromAppleOrPending, nameToSave, toHex, triggerDisplayName } from '../authAppleCore';

let n = 0;
const pending: Array<Promise<void>> = [];
const check = (name: string, fn: () => void | Promise<void>) => {
  pending.push(Promise.resolve().then(fn).then(() => { n += 1; console.log(`ok   ${name}`); }));
};
const root = process.cwd(); // npm test runs from mobile/
const read = (f: string) => readFileSync(join(root, f), 'utf8');
function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(root, dir))) {
    const rel = join(dir, name);
    if (statSync(join(root, rel)).isDirectory()) {
      if (name !== '__tests__' && name !== 'node_modules') out.push(...sources(rel));
    } else if (/\.tsx?$/.test(name)) out.push(rel);
  }
  return out;
}
const files = [...sources('src'), ...sources('app')];
const nodeSha = async (t: string) => createHash('sha256').update(t).digest('hex');
const nodeRandom = (k: number) => new Uint8Array(randomBytes(k));

// ---- pure logic -------------------------------------------------------------------------------------------------------
check('the Apple button shows only on iOS with the native module in the app', () => {
  assert.equal(appleAvailable('ios', true), true);
  assert.equal(appleAvailable('ios', false), false); // an app made before build 1.2.0
  assert.equal(appleAvailable('android', true), false);
  assert.equal(appleAvailable('web', true), false);
  assert.equal(appleAvailable('web', false), false);
});

check('hex is lowercase and two digits a byte', () => {
  assert.equal(toHex(new Uint8Array([0, 1, 15, 16, 255])), '00010f10ff');
});

check('the nonce is 32 random bytes as hex; Apple gets its SHA-256 hex, which matches what Supabase computes from the raw one', async () => {
  const a = await makeNonce(nodeRandom, nodeSha);
  const b = await makeNonce(nodeRandom, nodeSha);
  assert.match(a.raw, /^[0-9a-f]{64}$/);
  assert.match(a.hashed, /^[0-9a-f]{64}$/);
  assert.equal(a.hashed, createHash('sha256').update(a.raw).digest('hex'));
  assert.notEqual(a.raw, a.hashed);
  assert.notEqual(a.raw, b.raw);
  // a known vector: the hash of a fixed raw nonce
  const fixed = await makeNonce((k) => new Uint8Array(k).fill(0xab), nodeSha);
  assert.equal(fixed.raw, 'ab'.repeat(32));
  assert.equal(fixed.hashed, createHash('sha256').update('ab'.repeat(32)).digest('hex'));
  // upper-case hex from a backend is normalised
  const upper = await makeNonce(nodeRandom, async (t) => (await nodeSha(t)).toUpperCase());
  assert.match(upper.hashed, /^[0-9a-f]{64}$/);
});

check('a nonce is refused when the random bytes are too few or the hash is not SHA-256 hex', async () => {
  await assert.rejects(makeNonce(() => new Uint8Array(8), nodeSha));
  await assert.rejects(makeNonce(nodeRandom, async () => 'not-a-hash'));
});

check('a cancel is recognised (and says nothing); other codes are not a cancel', () => {
  assert.equal(isAppleCancel({ code: 'ERR_REQUEST_CANCELED' }), true);
  assert.equal(isAppleCancel(Object.assign(new Error('The user canceled the authorization attempt.'), { code: 'ERR_REQUEST_CANCELED' })), true);
  assert.equal(isAppleCancel({ code: 'ERR_REQUEST_FAILED' }), false);
  assert.equal(isAppleCancel(new Error('x')), false);
  assert.equal(isAppleCancel(null), false);
});

check('errors are plain English and never show a code', () => {
  const cases: unknown[] = [
    { code: 'ERR_REQUEST_FAILED', message: 'The authorization attempt failed for an unknown reason' },
    { code: 'ERR_REQUEST_NOT_HANDLED', message: 'ERR_REQUEST_NOT_HANDLED' },
    { code: 'ERR_INVALID_RESPONSE' },
    { message: 'Provider (issuer "https://appleid.apple.com") is not enabled' },
    { message: 'Unacceptable audience in id_token: [plus.camino.app]' },
    { message: 'Nonces mismatch', status: 400 },
    new TypeError('Network request failed'),
    null,
    'weird',
  ];
  for (const e of cases) {
    const m = appleErrorMessage(e);
    assert.ok(m.length > 0 && m.length <= 80, m);
    assert.doesNotMatch(m, /ERR_|[0-9]{3}|issuer|id_token|nonce/i, m);
    assert.match(m, /\.$/);
  }
  assert.match(appleErrorMessage(new TypeError('Network request failed')), /offline/);
  assert.match(appleErrorMessage({ message: 'Provider (issuer "https://appleid.apple.com") is not enabled' }), /not ready/);
  assert.match(appleErrorMessage({ code: 'ERR_REQUEST_FAILED' }), /try again/);
});

check('Apple\'s name becomes one short line, or nothing', () => {
  assert.equal(appleFullName({ givenName: 'Ana', familyName: 'Torres' }), 'Ana Torres');
  assert.equal(appleFullName({ givenName: '  Ana ', middleName: 'María', familyName: 'Torres  ' }), 'Ana María Torres');
  assert.equal(appleFullName({ givenName: null, familyName: null, nickname: 'Peregrina' }), 'Peregrina');
  assert.equal(appleFullName({ givenName: '', familyName: ' ' }), null); // a second sign-in: Apple sends no name
  assert.equal(appleFullName(null), null);
  assert.equal(appleFullName(undefined), null);
  assert.equal(appleFullName({ givenName: 'x'.repeat(80) })!.length, 60);
});

check('the automatic name is what the sign-up trigger makes from the email', () => {
  assert.equal(triggerDisplayName('x7kq2m9pzt@privaterelay.appleid.com'), 'x7kq2m9pzt');
  assert.equal(triggerDisplayName('Ana.Torres+camino@example.com'), 'ana.torrescamino');
  assert.equal(triggerDisplayName('jo@example.com'), 'pilgrim');
  assert.equal(triggerDisplayName('a'.repeat(30) + '@example.com'), 'a'.repeat(22));
  assert.equal(triggerDisplayName(null), 'pilgrim');
});

check('the name is saved only over an exact automatic name, never over a name somebody chose', () => {
  const relay = 'x7kq2m9pzt@privaterelay.appleid.com';
  assert.equal(isPlaceholderName('', relay), true);
  assert.equal(isPlaceholderName(null, relay), true);
  assert.equal(isPlaceholderName('pilgrim', 'jo@example.com'), true);
  assert.equal(isPlaceholderName('x7kq2m9pzt', relay), true); // the private relay name
  assert.equal(isPlaceholderName('ana.torres', 'ana.torres@example.com'), true); // exactly the email local part
  // chosen names, also one that is the start of the username or of the email
  assert.equal(isPlaceholderName('ana', 'ana.torres@example.com'), false);
  assert.equal(isPlaceholderName('Ana Torres', 'ana.torres@example.com'), false);
  assert.equal(isPlaceholderName('x7kq', relay), false);
  assert.equal(isPlaceholderName('ana.torres', null), false); // no email known: only empty or "pilgrim" count
  assert.equal(nameToSave({ display_name: 'x7kq2m9pzt' }, 'Ana Torres', relay), 'Ana Torres');
  assert.equal(nameToSave({ display_name: 'Ana T.' }, 'Ana Torres', relay), null);
  assert.equal(nameToSave({ display_name: 'x7kq2m9pzt' }, null, relay), null);
  assert.equal(nameToSave(null, 'Ana Torres', relay), null);
});

check('a name Apple shared is kept until saved: reused for the same Apple account only, forgotten unless saving failed', () => {
  const kept = { appleUser: '001.abc', name: 'Ana Torres' };
  assert.equal(nameFromAppleOrPending('Ana T', '001.abc', kept), 'Ana T'); // a fresh name wins
  assert.equal(nameFromAppleOrPending(null, '001.abc', kept), 'Ana Torres'); // the second sign-in: Apple sends none
  assert.equal(nameFromAppleOrPending(null, '002.other', kept), null);
  assert.equal(nameFromAppleOrPending(null, '001.abc', null), null);
  assert.equal(forgetPendingName('saved'), true);
  assert.equal(forgetPendingName('kept'), true);
  assert.equal(forgetPendingName('failed'), false);
});

// ---- wiring -----------------------------------------------------------------------------------------------------------
const APPLE = join('src', 'lib', 'authApple.ts');
const BUTTON = join('src', 'components', 'auth', 'AppleButton.tsx');

check('one module talks to Apple: only lib/authApple.ts requires the package, calls signInAsync or signs in with an Apple token', () => {
  for (const f of files) {
    if (f === APPLE) continue;
    const t = read(f);
    assert.doesNotMatch(t, /['"]expo-apple-authentication['"]/, `${f} names expo-apple-authentication: use lib/authApple.ts`);
    assert.doesNotMatch(t, /\bsignInAsync\(|signInWithIdToken\(|apple-link/, `${f} talks to Apple itself: use lib/authApple.ts`);
  }
  const t = read(APPLE);
  assert.equal((t.match(/require\('expo-apple-authentication'\)/g) ?? []).length, 1);
  assert.match(t, /requestedScopes: \[mod\.AppleAuthenticationScope\.FULL_NAME, mod\.AppleAuthenticationScope\.EMAIL\]/);
  assert.match(t, /signInAsync\(\{[\s\S]*?nonce: nonce\.hashed/, 'Apple must get the hashed nonce');
  assert.match(t, /signInWithIdToken\(\{ provider: 'apple', token: credential\.identityToken, nonce: rawNonce \}\)/, 'Supabase must get the raw nonce');
  assert.match(t, /CryptoDigestAlgorithm\.SHA256[\s\S]*?CryptoEncoding\.HEX/);
  assert.match(t, /getRandomBytes/);
  assert.match(t, /isAvailableAsync\(\)/);
});

check('no top-level import of expo-apple-authentication anywhere (only its types), and the require is asked for first', () => {
  for (const f of files) {
    const code = read(f).replace(/^import type .*$/gm, '');
    assert.doesNotMatch(code, /^import[^;]*from 'expo-apple-authentication'/m, `${f} imports expo-apple-authentication at the top`);
  }
  const t = read(APPLE);
  const req = t.indexOf("require('expo-apple-authentication')");
  const ask = t.lastIndexOf('hasNativeModule(NativeName.appleAuthentication)', req);
  const ios = t.lastIndexOf("Platform.OS !== 'ios'", req);
  assert.ok(ask >= 0 && req - ask < 200, 'the require must come right after hasNativeModule(NativeName.appleAuthentication)');
  assert.ok(ios >= 0 && ios < ask, 'Android and the web never even ask');
  assert.match(read(join('src', 'lib', 'optionalNative.ts')), /appleAuthentication: 'ExpoAppleAuthentication'/);
});

check('no token, code or nonce is ever logged', () => {
  for (const f of [APPLE, BUTTON, join('src', 'lib', 'authAppleCore.ts')]) assert.doesNotMatch(read(f), /console\./, `${f} logs something`);
  for (const f of files) {
    for (const line of read(f).split('\n')) {
      if (/console\.\w+\(/.test(line)) assert.doesNotMatch(line, /identityToken|authorizationCode|rawNonce|nonce|refresh_token|id_token/i, `${f} logs a secret: ${line.trim()}`);
    }
  }
});

check('Apple\'s own button: Continue with Apple, black in light mode and white in dark mode, rounded like the Google pill, only when available', () => {
  const t = read(BUTTON);
  assert.match(t, /AppleAuthenticationButtonType\.CONTINUE/);
  assert.match(t, /scheme === 'dark' \? kit\.AppleAuthenticationButtonStyle\.WHITE : kit\.AppleAuthenticationButtonStyle\.BLACK/);
  assert.match(t, /cornerRadius=\{height \/ 2\}/);
  assert.match(t, /const height = large \? 68 : layout\.touchPrimary;/);
  assert.match(t, /isAppleSignInAvailable\(\)/);
  assert.match(t, /if \(!kit\) return null;/);
  assert.match(t, /!res\.ok && !res\.cancelled/, 'a cancel must stay silent');
  assert.doesNotMatch(t, /backgroundColor|borderRadius/, 'Apple\'s rules: colour and corners only through buttonStyle and cornerRadius');
});

check('every screen with the Google button has the Apple button right above it, the same size', () => {
  let screens = 0;
  for (const f of files) {
    const t = read(f);
    const google = t.match(/^\s*<GoogleButton( large)? onError=\{setError\} \/>$/m);
    if (!google || f.endsWith('GoogleButton.tsx')) continue;
    screens += 1;
    const lines = t.split('\n');
    const at = lines.findIndex((l) => l.includes('<GoogleButton'));
    assert.equal(lines[at - 1].trim(), `<AppleButton${google[1] ?? ''} onError={setError} />`, `${f}: Apple button missing or a different size`);
  }
  assert.equal(screens, 3, 'welcome, sign in and sign up');
});

check('Apple\'s name reaches onboarding even when it is saved after the screen opened (and never over what the pilgrim typed)', () => {
  assert.match(read(BUTTON), /if \(res\.ok && res\.nameSaved\) void refresh\(\);/);
  const t = read(join('app', 'onboarding.tsx'));
  assert.match(t, /setName\(\(typed\) => \(typed === shownName \? fresh : typed\)\);/);
});

check('the name is kept on the phone before anything can fail, and written only over the value just read', () => {
  const t = read(APPLE);
  const keep = t.indexOf('localStore.setJSON(PENDING_NAME_KEY');
  assert.ok(keep > 0 && keep < t.indexOf('signInWithIdToken('), 'kept before the Supabase sign-in');
  assert.match(t, /updateDisplayNameIf\(uid, profile\.display_name, next\)/);
  assert.doesNotMatch(t, /updateProfile\(/, 'no unconditional write of the name');
  assert.match(read(join('src', 'lib', 'api.ts')), /q\.is\('display_name', null\) : q\.eq\('display_name', expected\)/);
  assert.match(read(join('src', 'lib', 'auth.tsx')), /void finishPendingAppleName\(uid\)\.then/, 'every account load retries a kept name');
});

check('app.json has the plugin that adds the Sign in with Apple entitlement', () => {
  const app = JSON.parse(read('app.json'));
  assert.ok(app.expo.plugins.includes('expo-apple-authentication'));
  assert.equal(app.expo.ios.bundleIdentifier, 'plus.camino.app');
});

Promise.all(pending).then(() => console.log(`${n} of ${pending.length} passed`), (e) => { console.error(e); process.exit(1); });
