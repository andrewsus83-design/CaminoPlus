// deno test --allow-net --allow-env --allow-run --allow-read supabase/functions/_shared/apple.test.ts
//
// The Sign in with Apple client secret and the two Apple calls, with a throwaway P-256 key made inside the test (never a
// real key) and a fake Apple on localhost.
import { assert, assertEquals, assertMatch, assertRejects } from 'jsr:@std/assert@1';
import { throwawayKey } from './testKey.ts';
import { AppleError, appleConfig, clientSecret, exchangeCode, importAppleKey, jwtClaims, revokeToken, type AppleConfig } from './apple.ts';

const b64urlDecode = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));

const cfgWith = (pem: string, baseUrl = 'https://appleid.apple.com'): AppleConfig => ({ teamId: 'TEAM123456', keyId: 'KEY1234567', privateKey: pem, bundleId: 'plus.camino.app', baseUrl });

Deno.test('appleConfig: all four secrets or nothing; the Apple address defaults to appleid.apple.com', () => {
  const all: Record<string, string> = { APPLE_TEAM_ID: 'T', APPLE_KEY_ID: 'K', APPLE_PRIVATE_KEY: 'P', APPLE_BUNDLE_ID: 'plus.camino.app' };
  assertEquals(appleConfig((n) => all[n])?.baseUrl, 'https://appleid.apple.com');
  for (const missing of Object.keys(all)) {
    assertEquals(appleConfig((n) => (n === missing ? undefined : all[n])), null, missing);
    assertEquals(appleConfig((n) => (n === missing ? '  ' : all[n])), null, `${missing} blank`);
  }
  assertEquals(appleConfig((n) => ({ ...all, APPLE_AUTH_URL: 'http://127.0.0.1:9/' })[n])?.baseUrl, 'http://127.0.0.1:9');
});

Deno.test('client secret: an ES256 JWT with the claims Apple asks for, signed with the key, valid five minutes', async () => {
  const { pem, publicKey } = await throwawayKey();
  const jwt = await clientSecret(cfgWith(pem), 1_800_000_000);
  const [h, p, s] = jwt.split('.');
  assertEquals(JSON.parse(new TextDecoder().decode(b64urlDecode(h))), { alg: 'ES256', kid: 'KEY1234567', typ: 'JWT' });
  assertEquals(jwtClaims(jwt), { iss: 'TEAM123456', iat: 1_800_000_000, exp: 1_800_000_300, aud: 'https://appleid.apple.com', sub: 'plus.camino.app' });
  const sig = b64urlDecode(s);
  assertEquals(sig.length, 64, 'a JWS ES256 signature is r || s, 64 bytes');
  assertMatch(jwt, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, 'base64url without padding');
  assert(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, sig, new TextEncoder().encode(`${h}.${p}`)), 'the signature verifies');
  // another key does not verify it
  const other = await throwawayKey();
  assert(!(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, other.publicKey, sig, new TextEncoder().encode(`${h}.${p}`))));
});

Deno.test('the key is accepted as the .p8 file, with "\\n" typed out, or as the base64 alone; anything else is refused', async () => {
  const { pem } = await throwawayKey();
  await importAppleKey(pem);
  await importAppleKey(pem.replace(/\n/g, '\\n'));
  await importAppleKey(pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s/g, ''));
  await assertRejects(() => importAppleKey('not a key'));
  await assertRejects(() => importAppleKey('-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----'));
});

Deno.test('jwtClaims reads a token and gives null for garbage', () => {
  const t = `x.${btoa(JSON.stringify({ sub: '001.abc' })).replace(/=+$/, '')}.y`;
  assertEquals(jwtClaims(t), { sub: '001.abc' });
  assertEquals(jwtClaims('nope'), null);
  assertEquals(jwtClaims('a.%%%.b'), null);
});

Deno.test({ name: 'exchange and revoke talk to Apple as documented', sanitizeOps: false, sanitizeResources: false }, async (t) => {
  const { pem, publicKey } = await throwawayKey();
  const seen: Array<{ path: string; form: Record<string, string> }> = [];
  let answer: () => Response = () => Response.json({});
  const apple = Deno.serve({ hostname: '127.0.0.1', port: 0, onListen() {} }, async (req) => {
    assertEquals(req.headers.get('content-type'), 'application/x-www-form-urlencoded');
    seen.push({ path: new URL(req.url).pathname, form: Object.fromEntries(new URLSearchParams(await req.text())) });
    return answer();
  });
  const cfg = cfgWith(pem, `http://127.0.0.1:${apple.addr.port}`);
  const idToken = `h.${btoa(JSON.stringify({ sub: '001234.apple' })).replace(/=+$/, '')}.s`;
  try {
    await t.step('code -> refresh token and the Apple user id', async () => {
      seen.length = 0;
      answer = () => Response.json({ access_token: 'a', token_type: 'Bearer', expires_in: 3600, refresh_token: 'r-123', id_token: idToken });
      assertEquals(await exchangeCode(cfg, 'code-abc'), { refreshToken: 'r-123', sub: '001234.apple' });
      const { path, form } = seen[0];
      assertEquals(path, '/auth/token');
      assertEquals(form.client_id, 'plus.camino.app');
      assertEquals(form.grant_type, 'authorization_code');
      assertEquals(form.code, 'code-abc');
      assertEquals(form.redirect_uri, undefined, 'a native app sends no redirect_uri');
      const [h, p, s] = form.client_secret.split('.');
      assert(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, b64urlDecode(s), new TextEncoder().encode(`${h}.${p}`)));
    });
    await t.step('revoke sends the refresh token with its hint', async () => {
      seen.length = 0;
      answer = () => new Response(null, { status: 200 });
      await revokeToken(cfg, 'r-123');
      assertEquals(seen[0].path, '/auth/revoke');
      assertEquals({ ...seen[0].form, client_secret: 'x' }, { client_id: 'plus.camino.app', client_secret: 'x', token: 'r-123', token_type_hint: 'refresh_token' });
    });
    await t.step('Apple\'s error word becomes the reason; odd bodies become the status', async () => {
      answer = () => Response.json({ error: 'invalid_grant' }, { status: 400 });
      const e = await assertRejects(() => exchangeCode(cfg, 'old-code'), AppleError);
      assertEquals(e.reason, 'invalid_grant');
      answer = () => new Response('<html>busy</html>', { status: 503 });
      assertEquals((await assertRejects(() => revokeToken(cfg, 'r'), AppleError)).reason, 'http_503');
      answer = () => Response.json({ access_token: 'a' });
      assertEquals((await assertRejects(() => exchangeCode(cfg, 'c'), AppleError)).reason, 'no_refresh_token');
    });
    await t.step('Apple unreachable -> AppleError unreachable', async () => {
      const closed = Deno.listen({ hostname: '127.0.0.1', port: 0 });
      const dead = (closed.addr as Deno.NetAddr).port;
      closed.close();
      assertEquals((await assertRejects(() => revokeToken(cfgWith(pem, `http://127.0.0.1:${dead}`), 'r'), AppleError)).reason, 'unreachable');
    });
    await t.step('no message of an AppleError carries a token or a code', async () => {
      answer = () => Response.json({ error: 'invalid_grant r-123 code-abc' }, { status: 400 });
      const e = await assertRejects(() => exchangeCode(cfg, 'code-abc'), AppleError);
      assert(!e.message.includes('code-abc') && !e.message.includes('r-123'), e.message);
    });
  } finally {
    await apple.shutdown();
  }
});
