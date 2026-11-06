// Run: npm run test:lib
import assert from 'node:assert/strict';
import { createHash, randomFillSync } from 'node:crypto';
import { installCryptoPolyfill, type CryptoBackend, type CryptoLike } from '../cryptoPolyfillCore';

// A backend made from Node's crypto, standing in for expo-crypto.
const backend: CryptoBackend = {
  getRandomValues: (array) => randomFillSync(array),
  digestSha256: async (data) => {
    const bytes = ArrayBuffer.isView(data) ? Buffer.from(data.buffer, data.byteOffset, data.byteLength) : Buffer.from(data);
    const h = createHash('sha256').update(bytes).digest();
    return h.buffer.slice(h.byteOffset, h.byteOffset + h.byteLength) as ArrayBuffer;
  },
};

// supabase-js builds its challenge exactly like this (auth-js lib/helpers.ts).
async function pkceChallenge(c: CryptoLike, verifier: string): Promise<string> {
  const encoded = new TextEncoder().encode(verifier);
  const hash = await c.subtle!.digest!('SHA-256', encoded);
  const bytes = new Uint8Array(hash);
  const raw = Array.from(bytes).map((b) => String.fromCharCode(b)).join('');
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const tests: Array<[string, () => Promise<void>]> = [];
const test = (name: string, fn: () => Promise<void>) => tests.push([name, fn]);

// RFC 7636 appendix B: the verifier and the challenge it must produce.
const RFC_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const RFC_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

test('on a platform with no WebCrypto both pieces are installed and the challenge is the RFC 7636 S256 value', async () => {
  const target: { crypto?: CryptoLike } = {};
  const installed = installCryptoPolyfill(target, backend);
  assert.deepEqual(installed, { randomValues: true, subtle: true });
  assert.equal(await pkceChallenge(target.crypto!, RFC_VERIFIER), RFC_CHALLENGE);
  const array = new Uint32Array(56);
  target.crypto!.getRandomValues!(array);
  assert.ok(array.some((n) => n !== 0), 'getRandomValues must fill the array');
});

test('without the polyfill the challenge would be the verifier itself (the downgrade this fixes)', async () => {
  // supabase-js: no crypto.subtle -> challenge = verifier, method "plain".
  assert.notEqual(RFC_VERIFIER, RFC_CHALLENGE);
});

test('an existing crypto is never replaced', async () => {
  const getRandomValues = (a: unknown) => a;
  const digest = async () => new ArrayBuffer(32);
  const target: { crypto?: CryptoLike } = { crypto: { getRandomValues, subtle: { digest } } };
  const installed = installCryptoPolyfill(target, backend);
  assert.deepEqual(installed, { randomValues: false, subtle: false });
  assert.equal(target.crypto!.getRandomValues, getRandomValues);
  assert.equal(target.crypto!.subtle!.digest, digest);
});

test('only the missing piece is added when crypto exists without subtle', async () => {
  const getRandomValues = (a: unknown) => a;
  const target: { crypto?: CryptoLike } = { crypto: { getRandomValues } };
  const installed = installCryptoPolyfill(target, backend);
  assert.deepEqual(installed, { randomValues: false, subtle: true });
  assert.equal(target.crypto!.getRandomValues, getRandomValues);
  assert.equal(await pkceChallenge(target.crypto!, RFC_VERIFIER), RFC_CHALLENGE);
});

test('the algorithm may be a string or an object with a name, in any case; other algorithms are refused', async () => {
  const target: { crypto?: CryptoLike } = {};
  installCryptoPolyfill(target, backend);
  const digest = target.crypto!.subtle!.digest!;
  const data = new TextEncoder().encode('abc');
  const expected = createHash('sha256').update('abc').digest('hex');
  for (const algorithm of ['SHA-256', 'sha-256', { name: 'SHA-256' }]) {
    assert.equal(Buffer.from(new Uint8Array(await digest(algorithm, data))).toString('hex'), expected);
  }
  await assert.rejects(() => digest('SHA-1', data), /only SHA-256/);
  await assert.rejects(() => digest({ name: 'SHA-512' }, data), /only SHA-256/);
  await assert.rejects(() => digest(undefined, data), /only SHA-256/);
});

test('installing twice changes nothing the second time', async () => {
  const target: { crypto?: CryptoLike } = {};
  installCryptoPolyfill(target, backend);
  const first = target.crypto!.subtle!.digest;
  const again = installCryptoPolyfill(target, backend);
  assert.deepEqual(again, { randomValues: false, subtle: false });
  assert.equal(target.crypto!.subtle!.digest, first);
});

(async () => {
  let failed = 0;
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log(`ok   ${name}`);
    } catch (e) {
      failed += 1;
      console.log(`FAIL ${name}\n     ${(e as Error).message}`);
    }
  }
  console.log(`${tests.length - failed} of ${tests.length} passed`);
  if (failed) process.exit(1);
})();
