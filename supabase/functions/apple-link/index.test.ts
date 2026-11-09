// deno test --allow-net --allow-env --allow-run --allow-read supabase/functions/apple-link/index.test.ts
//
// Runs the real function (a `deno run` child process) against a fake Supabase (Auth and PostgREST) and a fake Apple on
// localhost, with a throwaway signing key made inside the test. TEST_DEBUG=1 prints what the function logs.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { throwawayKey } from '../_shared/testKey.ts';

const ME = 'a1000000-0000-4000-8000-000000000001';
const APPLE_SUB = '001234.abcdef0123456789.0420';
const CODE = 'c0de-from-apple-0123456789';
const REFRESH = 'r-refresh-token-secret-42';

const state = {
  users: {} as Record<string, { id: string; identities: unknown[] }>, // bearer -> user
  authStatus: 0,
  apple: { status: 200, sub: APPLE_SUB, body: null as unknown },
  storeStatus: 201,
  lookupStatus: 200,
  rows: [] as Array<Record<string, unknown>>,
  log: [] as string[],
};
function reset() {
  state.users = {
    'tok-apple': { id: ME, identities: [{ provider: 'apple', id: APPLE_SUB, identity_data: { sub: APPLE_SUB, email: 'x@privaterelay.appleid.com' } }] },
    'tok-email': { id: 'e1000000-0000-4000-8000-000000000002', identities: [{ provider: 'email', id: 'e1', identity_data: { sub: 'e1' } }] },
  };
  state.authStatus = 0;
  state.apple = { status: 200, sub: APPLE_SUB, body: null };
  state.storeStatus = 201;
  state.lookupStatus = 200;
  state.rows = [];
  state.log = [];
}
reset();

const idToken = (sub: string) => `h.${btoa(JSON.stringify({ iss: 'https://appleid.apple.com', aud: 'plus.camino.app', sub })).replace(/=+$/, '')}.s`;

const fake = Deno.serve({ hostname: '127.0.0.1', port: 0, onListen() {} }, async (req) => {
  const u = new URL(req.url);
  const bearer = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  if (u.pathname === '/auth/v1/user') {
    state.log.push('auth.getUser');
    if (state.authStatus) return new Response('{"msg":"down"}', { status: state.authStatus });
    const user = state.users[bearer];
    return user ? Response.json({ ...user, aud: 'authenticated' }) : new Response('{"code":401,"msg":"invalid JWT"}', { status: 401 });
  }
  if (u.pathname === '/auth/token' || u.pathname === '/auth/revoke') {
    const form = Object.fromEntries(new URLSearchParams(await req.text()));
    state.log.push(`apple${u.pathname} ${form.code ?? form.token}`);
    if (u.pathname === '/auth/revoke') return new Response(null, { status: 200 });
    if (state.apple.status !== 200) return Response.json({ error: 'invalid_grant' }, { status: state.apple.status });
    return Response.json(state.apple.body ?? { access_token: 'a', token_type: 'Bearer', expires_in: 3600, refresh_token: REFRESH, id_token: idToken(state.apple.sub) });
  }
  if (u.pathname === '/rest/v1/apple_sign_in_tokens' && req.method === 'GET') {
    if (bearer !== 'service') return new Response('{"message":"permission denied"}', { status: 403 });
    state.log.push('rest.read');
    if (state.lookupStatus !== 200) return Response.json({ code: '42P01', message: 'relation does not exist' }, { status: state.lookupStatus });
    const id = (u.searchParams.get('user_id') ?? '').replace(/^eq\./, '');
    return Response.json(state.rows.filter((r) => r.user_id === id).slice(-1).map((r) => ({ refresh_token: r.refresh_token, updated_at: r.updated_at })));
  }
  if (u.pathname === '/rest/v1/apple_sign_in_tokens' && req.method === 'POST') {
    if (bearer !== 'service') return new Response('{"message":"permission denied"}', { status: 403 });
    state.log.push(`rest.upsert ${u.searchParams.get('on_conflict')}`);
    if (state.storeStatus !== 201) return Response.json({ code: '42P01', message: 'relation does not exist' }, { status: state.storeStatus });
    const body = await req.json();
    state.rows.push(...(Array.isArray(body) ? body : [body]));
    return new Response(null, { status: 201 });
  }
  return new Response('not mocked: ' + req.method + ' ' + u.pathname, { status: 500 });
});
const FAKE = `http://127.0.0.1:${fake.addr.port}`;

type Running = { url: string; stop: () => Promise<void>; logs: () => string };
async function startFunction(extraEnv: Record<string, string>): Promise<Running> {
  const env: Record<string, string> = {
    ...Deno.env.toObject(),
    SUPABASE_URL: FAKE, SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service',
    DENO_SERVE_ADDRESS: 'tcp:127.0.0.1:0',
  };
  for (const k of ['APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY', 'APPLE_BUNDLE_ID', 'APPLE_AUTH_URL']) delete env[k];
  Object.assign(env, extraEnv);
  const child = new Deno.Command(Deno.execPath(), {
    args: ['run', '--allow-net', '--allow-env', '--no-prompt', new URL('./index.ts', import.meta.url).pathname],
    env, clearEnv: true, stdout: 'null', stderr: 'piped',
  }).spawn();
  const reader = child.stderr.pipeThrough(new TextDecoderStream()).getReader();
  let log = '';
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('function did not start in 30 s:\n' + log)), 30_000);
    (async () => {
      let found = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return found ? undefined : reject(new Error('function exited before it listened:\n' + log));
        log += value;
        if (Deno.env.get('TEST_DEBUG')) console.error('[function]', value.trimEnd());
        const m = !found && /Listening on https?:\/\/[^:\s]+:(\d+)/.exec(log);
        if (m) { found = true; clearTimeout(timer); resolve(Number(m[1])); }
      }
    })().catch(reject);
  });
  return {
    url: `http://127.0.0.1:${port}/`,
    logs: () => log,
    stop: async () => { try { child.kill(); } catch { /* gone */ } await child.status; },
  };
}

async function call(fn: Running, token: string | null, body: unknown, init: { method?: string; raw?: string } = {}) {
  const r = await fetch(fn.url, {
    method: init.method ?? 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: init.method === 'GET' ? undefined : init.raw ?? JSON.stringify(body),
  });
  const text = await r.text();
  // deno-lint-ignore no-explicit-any
  let parsed: any = text;
  try { parsed = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body: parsed, headers: r.headers };
}

Deno.test({ name: 'apple-link', sanitizeOps: false, sanitizeResources: false }, async (t) => {
  const { pem } = await throwawayKey();
  const secrets = { APPLE_TEAM_ID: 'TEAM123456', APPLE_KEY_ID: 'KEY1234567', APPLE_PRIVATE_KEY: pem, APPLE_BUNDLE_ID: 'plus.camino.app', APPLE_AUTH_URL: FAKE };
  const fn = await startFunction(secrets);
  const bare = await startFunction({});
  try {
    await t.step('OPTIONS -> CORS; GET -> 405; no token -> 401', async () => {
      reset();
      const o = await fetch(fn.url, { method: 'OPTIONS' });
      await o.body?.cancel();
      assertEquals(o.status, 200);
      assertEquals(o.headers.get('access-control-allow-origin'), '*');
      assertEquals((await call(fn, 'tok-apple', null, { method: 'GET' })).status, 405);
      const r = await call(fn, null, { authorizationCode: CODE });
      assertEquals(r.status, 401);
      assertEquals(r.body.error, 'not_signed_in');
      assertEquals(state.log, []);
    });

    await t.step('no JSON, no code, a code that is not text or far too short -> 400 bad_request, nobody is asked', async () => {
      reset();
      for (const raw of ['{nope', '', '{}', '{"authorizationCode":42}', '{"authorizationCode":"x"}', 'null']) {
        const r = await call(fn, 'tok-apple', null, { raw });
        assertEquals(r.status, 400, raw);
        assertEquals(r.body.error, 'bad_request');
      }
      assertEquals(state.log, []);
    });

    await t.step('a secret missing -> 503 not_configured, and neither Auth nor Apple is asked', async () => {
      reset();
      const r = await call(bare, 'tok-apple', { authorizationCode: CODE });
      assertEquals(r.status, 503);
      assertEquals(r.body.error, 'not_configured');
      assertEquals(state.log, []);
      const partial = await startFunction({ ...secrets, APPLE_KEY_ID: '' });
      try {
        assertEquals((await call(partial, 'tok-apple', { authorizationCode: CODE })).body.error, 'not_configured');
      } finally {
        await partial.stop();
      }
    });

    await t.step('a bad token -> 401; Auth down -> 500 auth_unavailable; Apple is not asked', async () => {
      reset();
      assertEquals((await call(fn, 'tok-bogus', { authorizationCode: CODE })).status, 401);
      state.authStatus = 503;
      const r = await call(fn, 'tok-apple', { authorizationCode: CODE });
      assertEquals(r.status, 500);
      assertEquals(r.body.error, 'auth_unavailable');
      assert(!state.log.some((l) => l.startsWith('apple')));
    });

    await t.step('an account without an Apple identity -> 400 not_apple_account', async () => {
      reset();
      const r = await call(fn, 'tok-email', { authorizationCode: CODE });
      assertEquals(r.status, 400);
      assertEquals(r.body.error, 'not_apple_account');
      assert(!state.log.some((l) => l.startsWith('apple')));
    });

    await t.step('happy path: the code is exchanged and the refresh token stored for the user of the token', async () => {
      reset();
      const r = await call(fn, 'tok-apple', { authorizationCode: CODE, user_id: 'someone-else' });
      assertEquals(r.status, 200);
      assertEquals(r.body, { ok: true });
      assertEquals(r.headers.get('cache-control'), 'no-store');
      assertEquals(state.log, ['auth.getUser', 'rest.read', `apple/auth/token ${CODE}`, 'rest.upsert user_id']);
      assertEquals(state.rows.length, 1);
      assertEquals(state.rows[0].user_id, ME);
      assertEquals(state.rows[0].apple_sub, APPLE_SUB);
      assertEquals(state.rows[0].refresh_token, REFRESH);
    });

    await t.step('a code from another Apple account -> 403 apple_mismatch, the token is revoked and nothing is stored', async () => {
      reset();
      state.apple.sub = '009999.someone.else';
      const r = await call(fn, 'tok-apple', { authorizationCode: CODE });
      assertEquals(r.status, 403);
      assertEquals(r.body.error, 'apple_mismatch');
      assert(state.log.includes(`apple/auth/revoke ${REFRESH}`));
      assertEquals(state.rows, []);
    });

    await t.step('Apple refuses (a used or old code) -> 502 apple_refused, nothing is stored', async () => {
      reset();
      state.apple.status = 400;
      const r = await call(fn, 'tok-apple', { authorizationCode: CODE });
      assertEquals(r.status, 502);
      assertEquals(r.body.error, 'apple_refused');
      assertEquals(state.rows, []);
    });

    await t.step('the table is not there yet (migration not applied) -> 500 store_failed before Apple is asked', async () => {
      reset();
      state.lookupStatus = 404;
      const r = await call(fn, 'tok-apple', { authorizationCode: CODE });
      assertEquals(r.status, 500);
      assertEquals(r.body.error, 'store_failed');
      assert(!state.log.some((l) => l.startsWith('apple')), 'no token was made, so none is left behind');
    });

    await t.step('the store fails after the exchange -> 500 store_failed and the new token is revoked at once', async () => {
      reset();
      state.storeStatus = 500;
      const r = await call(fn, 'tok-apple', { authorizationCode: CODE });
      assertEquals(r.status, 500);
      assertEquals(r.body.error, 'store_failed');
      assertEquals(state.log.slice(-2), ['rest.upsert user_id', `apple/auth/revoke ${REFRESH}`]);
    });

    await t.step('a second sign-in: the new token replaces the old one, which is revoked at Apple', async () => {
      reset();
      state.rows.push({ user_id: ME, apple_sub: APPLE_SUB, refresh_token: 'r-old-token', updated_at: new Date(Date.now() - 60_000).toISOString() });
      const r = await call(fn, 'tok-apple', { authorizationCode: CODE });
      assertEquals(r.status, 200);
      assertEquals(state.log, ['auth.getUser', 'rest.read', `apple/auth/token ${CODE}`, 'rest.upsert user_id', 'apple/auth/revoke r-old-token']);
      assertEquals(state.rows.at(-1)?.refresh_token, REFRESH);
      assert(!state.log.includes(`apple/auth/revoke ${REFRESH}`), 'the new token stays valid');
    });

    await t.step('a stored token less than 20 seconds old -> 429 too_soon, Apple is not asked and nothing changes', async () => {
      reset();
      state.rows.push({ user_id: ME, apple_sub: APPLE_SUB, refresh_token: 'r-fresh', updated_at: new Date(Date.now() - 5_000).toISOString() });
      const r = await call(fn, 'tok-apple', { authorizationCode: CODE });
      assertEquals(r.status, 429);
      assertEquals(r.body.error, 'too_soon');
      assertEquals(state.log, ['auth.getUser', 'rest.read']);
      assertEquals(state.rows.length, 1);
      // the same token twice in a row (an upsert of an equal value) is never revoked: covered by the happy path's log
    });

    await t.step('nothing the function logged contains the code, the refresh token or the key', async () => {
      await new Promise((r) => setTimeout(r, 50));
      const logs = fn.logs() + bare.logs();
      assert(logs.includes('apple-link:'), 'the failures above were logged');
      for (const secret of [CODE, REFRESH, pem.split('\n')[1]]) assert(!logs.includes(secret), 'a secret is in the log');
    });
  } finally {
    await fn.stop();
    await bare.stop();
    await fake.shutdown();
  }
});
