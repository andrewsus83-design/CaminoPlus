// deno test --allow-net --allow-env --allow-run --allow-read supabase/functions/offline-pack-url/index.test.ts
//
// Runs the real function (a `deno run` child process) against a fake Supabase (Auth, PostgREST and
// Storage) on localhost. No real Supabase or R2 is needed.
//
// Ports: every server listens on an ephemeral port (port 0) and the function is started with
// DENO_SERVE_ADDRESS=tcp:127.0.0.1:0 and tells us where it ended up, so two test runs on one machine
// (or CI jobs next to each other) can never collide. FAKE_SUPABASE_PORT and FUNCTION_PORT pin a port
// when you want to debug with curl.
// TEST_DEBUG=1 prints what the function logs to stderr and which requests the fake did not know.
import { assert, assertEquals, assertMatch } from 'jsr:@std/assert@1';

const PACK_R2 = '11111111-1111-4111-8111-111111111111';
const PACK_SB = '33333333-3333-4333-8333-333333333333';
const PACK_OLD = '44444444-4444-4444-8444-444444444444'; // not current any more
const PACK_R2_SPECIAL = '55555555-5555-4555-8555-555555555555';
const PACK_SB_SPECIAL = '66666666-6666-4666-8666-666666666666';
const PACK_R2_OTHER_BUCKET = '77777777-7777-4777-8777-777777777777';
const PACK_SB_OTHER_BUCKET = '88888888-8888-4888-8888-888888888888';
const PACK_UNKNOWN_SCHEME = '99999999-9999-4999-8999-999999999999';
const PACK_DOT_SEGMENTS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PACK_SIGN_FAILS = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PACK_MISSING = '22222222-2222-4222-8222-222222222222';

const KEY = 'camino-frances/stage-01/tiles-v20261103.pmtiles';
const SPECIAL_KEY = "camino frances/stage #1 (v2)/it's 100%+ ä & b=c?.pmtiles";
const R2_SECRET = 'secret';

// ---- fake Supabase -----------------------------------------------------------------------------
type Who = { plus: boolean; rpcError?: boolean; lookupError?: boolean };
const users: Record<string, Who> = {
  'tok-free': { plus: false },
  'tok-plus': { plus: true },
  'tok-plus-rpc-error': { plus: true, rpcError: true },
  'tok-plus-lookup-error': { plus: true, lookupError: true },
};
const authStatus: Record<string, number> = { 'tok-auth-503': 503, 'tok-auth-500': 500, 'tok-auth-429': 429, 'tok-auth-403': 403 };

const base = { kind: 'tiles', format: 'pmtiles', version: 20261103, size_bytes: 3145728, sha256: 'ab'.repeat(32), is_current: true };
const packs: Record<string, Record<string, unknown>> = {
  [PACK_R2]: { ...base, id: PACK_R2, url: `r2://caminoplus-packs/${KEY}` },
  [PACK_SB]: { ...base, id: PACK_SB, url: `supabase://offline-packs/${KEY}` },
  [PACK_OLD]: { ...base, id: PACK_OLD, version: 20260101, is_current: false, url: `supabase://offline-packs/${KEY}` },
  [PACK_R2_SPECIAL]: { ...base, id: PACK_R2_SPECIAL, url: `r2://caminoplus-packs/${SPECIAL_KEY}` },
  [PACK_SB_SPECIAL]: { ...base, id: PACK_SB_SPECIAL, url: `supabase://offline-packs/${SPECIAL_KEY}` },
  [PACK_R2_OTHER_BUCKET]: { ...base, id: PACK_R2_OTHER_BUCKET, url: `r2://somebody-elses-bucket/${KEY}` },
  [PACK_SB_OTHER_BUCKET]: { ...base, id: PACK_SB_OTHER_BUCKET, url: `supabase://user-media/${KEY}` },
  [PACK_UNKNOWN_SCHEME]: { ...base, id: PACK_UNKNOWN_SCHEME, url: `https://evil.example/${KEY}` },
  [PACK_DOT_SEGMENTS]: { ...base, id: PACK_DOT_SEGMENTS, url: 'r2://caminoplus-packs/camino-frances/../../other/secret.pmtiles' },
  [PACK_SIGN_FAILS]: { ...base, id: PACK_SIGN_FAILS, url: 'supabase://offline-packs/refused/by-storage.pmtiles' },
};

const seen = { auth: [] as string[], signPaths: [] as string[], signBodies: [] as { expiresIn?: number }[], signAuth: [] as string[], rest: [] as string[] };

const fake = Deno.serve(
  { hostname: '127.0.0.1', port: Number(Deno.env.get('FAKE_SUPABASE_PORT') ?? 0), onListen() {} },
  async (req) => {
    const u = new URL(req.url);
    const bearer = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const who = users[bearer];
    if (u.pathname === '/auth/v1/user') {
      seen.auth.push(bearer);
      if (authStatus[bearer]) return new Response(JSON.stringify({ msg: 'auth says no' }), { status: authStatus[bearer] });
      return who ? Response.json({ id: bearer, aud: 'authenticated' }) : new Response('{"code":401,"msg":"invalid JWT"}', { status: 401 });
    }
    if (u.pathname === '/rest/v1/rpc/get_my_entitlements') {
      seen.rest.push(`rpc:${bearer}`);
      if (who?.rpcError) return new Response('{"message":"boom"}', { status: 500 });
      return Response.json({ plan: who?.plus ? 'plus' : 'free', has_plus: !!who?.plus, can_download_routes: !!who?.plus });
    }
    if (u.pathname === '/rest/v1/offline_packs') {
      seen.rest.push(`packs:${bearer}`);
      if (who?.lookupError) return new Response('{"message":"boom"}', { status: 500 });
      // RLS: only Pilgrim Plus users see rows; the function must ask for live packs only
      if (u.searchParams.get('deleted_at') !== 'is.null') return new Response('{"message":"deleted_at filter missing"}', { status: 400 });
      const id = (u.searchParams.get('id') ?? '').replace('eq.', '');
      const row = who?.plus ? packs[id] : undefined;
      return Response.json(row ? [row] : []);
    }
    if (u.pathname.startsWith('/storage/v1/object/sign/offline-packs/')) {
      seen.signPaths.push(u.pathname);
      seen.signAuth.push(bearer);
      seen.signBodies.push(await req.json().catch(() => ({})));
      if (bearer !== 'service') return new Response('{"message":"unauthorized"}', { status: 403 }); // only the service role may sign
      if (u.pathname.includes('/refused/')) return new Response('{"message":"Object not found"}', { status: 404 });
      return Response.json({ signedURL: `${u.pathname.replace('/storage/v1', '')}?token=signed-token` });
    }
    if (Deno.env.get('TEST_DEBUG')) console.error('[fake] not mocked:', req.method, u.pathname);
    return new Response('not mocked: ' + u.pathname, { status: 500 });
  },
);
const FAKE = `http://127.0.0.1:${fake.addr.port}`;

// ---- the function under test -------------------------------------------------------------------
type Running = { url: string; stop: () => Promise<void> };

async function startFunction(extraEnv: Record<string, string> = {}, supabaseUrl = FAKE): Promise<Running> {
  const env = Deno.env.toObject();
  for (const k of ['PACK_URL_TTL_SECONDS', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']) delete env[k];
  Object.assign(env, {
    SUPABASE_URL: supabaseUrl, SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service',
    R2_ACCOUNT_ID: 'acct123', R2_ACCESS_KEY_ID: 'AKIDEXAMPLE', R2_SECRET_ACCESS_KEY: R2_SECRET, R2_BUCKET: 'caminoplus-packs',
    DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${Deno.env.get('FUNCTION_PORT') ?? 0}`,
    ...extraEnv,
  });
  const child = new Deno.Command(Deno.execPath(), {
    args: ['run', '--allow-net', '--allow-env', '--no-prompt', new URL('./index.ts', import.meta.url).pathname],
    env, clearEnv: true, stdout: 'null', stderr: 'piped',
  }).spawn();

  // Deno prints "Listening on http://127.0.0.1:<port>/" when the server is up.
  const reader = child.stderr.pipeThrough(new TextDecoderStream()).getReader();
  let log = '';
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('function did not start in 30 s:\n' + log)), 30_000);
    (async () => {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return reject(new Error('function exited before it listened:\n' + log));
        log += value;
        const m = /Listening on https?:\/\/[^:\s]+:(\d+)/.exec(log);
        if (m) {
          clearTimeout(timer);
          resolve(Number(m[1]));
          break;
        }
      }
      // keep draining so the child never blocks on a full pipe (TEST_DEBUG=1 shows what it logs)
      for (;;) {
        const next = await reader.read();
        if (next.done) return;
        if (Deno.env.get('TEST_DEBUG')) console.error('[function]', next.value.trimEnd());
      }
    })().catch(reject);
  });
  return {
    url: `http://127.0.0.1:${port}/`,
    stop: async () => {
      try { child.kill(); } catch { /* already gone */ }
      await child.status;
    },
  };
}

async function call(fn: Running, token: string | null, body: unknown, init: { method?: string; raw?: string; headers?: Record<string, string> } = {}) {
  const r = await fetch(fn.url, {
    method: init.method ?? 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
    body: init.method === 'GET' ? undefined : init.raw ?? JSON.stringify(body),
  });
  const text = await r.text();
  // deno-lint-ignore no-explicit-any
  let parsed: any = text;
  try { parsed = JSON.parse(text); } catch { /* keep text */ }
  return { status: r.status, body: parsed, headers: r.headers };
}

// ---- an independent SigV4 (S3, query string) so we know a presigned URL really is valid ----------
const enc = new TextEncoder();
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const rfc3986 = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
async function hmac(key: BufferSource | string, data: string): Promise<Uint8Array<ArrayBuffer>> {
  const raw = typeof key === 'string' ? enc.encode(key) : key;
  const k = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(data)));
}
async function expectedSignature(u: URL, secret: string): Promise<string> {
  const q = new URLSearchParams(u.search);
  const amzDate = q.get('X-Amz-Date')!;
  const day = amzDate.slice(0, 8);
  q.delete('X-Amz-Signature');
  const query = [...q.entries()].map(([k, v]) => [rfc3986(k), rfc3986(v)])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('&');
  // S3: the path the server decodes is encoded once, segment by segment
  const path = u.pathname.split('/').map((seg) => rfc3986(decodeURIComponent(seg))).join('/');
  const canonical = ['GET', path, query, `host:${u.host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const hash = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(canonical))));
  const toSign = ['AWS4-HMAC-SHA256', amzDate, `${day}/auto/s3/aws4_request`, hash].join('\n');
  let key: BufferSource = await hmac('AWS4' + secret, day);
  for (const part of ['auto', 's3', 'aws4_request']) key = await hmac(key, part);
  return hex(await hmac(key, toSign));
}

// ---- tests -------------------------------------------------------------------------------------
Deno.test({ name: 'offline-pack-url', sanitizeOps: false, sanitizeResources: false }, async (t) => {
  const running: Running[] = [];
  const start = async (env: Record<string, string> = {}, supabaseUrl = FAKE) => {
    const r = await startFunction(env, supabaseUrl);
    running.push(r);
    return r;
  };
  try {
    const fn = await start();

    await t.step('OPTIONS -> 200 with CORS headers, no auth needed', async () => {
      const r = await fetch(fn.url, { method: 'OPTIONS' });
      assertEquals(r.status, 200);
      assertEquals(await r.text(), 'ok');
      assertEquals(r.headers.get('access-control-allow-origin'), '*');
      assertMatch(r.headers.get('access-control-allow-methods') ?? '', /POST/);
      assertMatch(r.headers.get('access-control-allow-headers') ?? '', /authorization/);
    });

    await t.step('GET, PUT and DELETE -> 405', async () => {
      for (const method of ['GET', 'PUT', 'DELETE']) {
        const r = await call(fn, 'tok-plus', { pack_id: PACK_SB }, { method });
        assertEquals(r.status, 405, method);
        assertEquals(r.body.error, 'method_not_allowed');
      }
    });

    await t.step('no token, a non-Bearer header, an empty Bearer -> 401 not_signed_in (Auth is not even asked)', async () => {
      const before = seen.auth.length;
      assertEquals((await call(fn, null, { pack_id: PACK_SB })).status, 401);
      const basic = await call(fn, null, { pack_id: PACK_SB }, { headers: { Authorization: 'Basic dXNlcjpwYXNz' } });
      assertEquals(basic.status, 401);
      assertEquals(basic.body.error, 'not_signed_in');
      const empty = await call(fn, null, { pack_id: PACK_SB }, { headers: { Authorization: 'Bearer ' } });
      assertEquals(empty.status, 401);
      assertEquals(seen.auth.length, before);
    });

    await t.step('invalid token -> 401 not_signed_in', async () => {
      const r = await call(fn, 'tok-bogus', { pack_id: PACK_SB });
      assertEquals(r.status, 401);
      assertEquals(r.body.error, 'not_signed_in');
      const forbidden = await call(fn, 'tok-auth-403', { pack_id: PACK_SB }); // Auth answers 403 (user gone): still the pilgrim's problem
      assertEquals(forbidden.status, 401);
    });

    await t.step('the bearer token itself is what Auth is asked about', async () => {
      seen.auth.length = 0;
      await call(fn, 'tok-plus', { pack_id: PACK_SB });
      assertEquals(seen.auth, ['tok-plus']);
    });

    await t.step('Auth down (503, 500, 429) -> 503 auth_unavailable, not 401', async () => {
      for (const tok of ['tok-auth-503', 'tok-auth-500', 'tok-auth-429']) {
        const r = await call(fn, tok, { pack_id: PACK_SB });
        assertEquals(r.status, 503, tok);
        assertEquals(r.body, { error: 'auth_unavailable' }, tok);
      }
    });

    await t.step('Auth unreachable (connection refused) -> 503 auth_unavailable', async () => {
      const closed = Deno.listen({ hostname: '127.0.0.1', port: 0 });
      const deadPort = (closed.addr as Deno.NetAddr).port;
      closed.close();
      const dead = await start({}, `http://127.0.0.1:${deadPort}`);
      const r = await call(dead, 'tok-plus', { pack_id: PACK_SB });
      assertEquals(r.status, 503);
      assertEquals(r.body, { error: 'auth_unavailable' });
    });

    await t.step('malformed JSON, a null body -> 400 bad_json', async () => {
      const bad = await call(fn, 'tok-plus', null, { raw: '{not json' });
      assertEquals(bad.status, 400);
      assertEquals(bad.body.error, 'bad_json');
      const nul = await call(fn, 'tok-plus', null, { raw: 'null' });
      assertEquals(nul.status, 400);
      assertEquals(nul.body.error, 'bad_json');
      const empty = await call(fn, 'tok-plus', null, { raw: '' });
      assertEquals(empty.status, 400);
    });

    await t.step('missing or malformed pack_id -> 400 pack_id_required', async () => {
      for (const body of [{}, { pack_id: 'x' }, { pack_id: 42 }, { pack_id: null }, { pack_id: `${PACK_SB}/../x` }]) {
        const r = await call(fn, 'tok-plus', body);
        assertEquals(r.status, 400, JSON.stringify(body));
        assertEquals(r.body.error, 'pack_id_required');
      }
    });

    await t.step('free user -> 403 subscription_required with the plan', async () => {
      const r = await call(fn, 'tok-free', { pack_id: PACK_R2 });
      assertEquals(r.status, 403);
      assertEquals(r.body, { error: 'subscription_required', plan: 'free' });
    });

    await t.step('entitlement RPC error -> 500 entitlements_unavailable', async () => {
      const r = await call(fn, 'tok-plus-rpc-error', { pack_id: PACK_SB });
      assertEquals(r.status, 500);
      assertEquals(r.body.error, 'entitlements_unavailable');
    });

    await t.step('pack lookup error -> 500 lookup_failed', async () => {
      const r = await call(fn, 'tok-plus-lookup-error', { pack_id: PACK_SB });
      assertEquals(r.status, 500);
      assertEquals(r.body.error, 'lookup_failed');
    });

    await t.step('unknown pack -> 404 pack_not_found', async () => {
      const r = await call(fn, 'tok-plus', { pack_id: PACK_MISSING });
      assertEquals(r.status, 404);
      assertEquals(r.body.error, 'pack_not_found');
    });

    await t.step('subscriber, Supabase Storage pack -> signed Storage URL, signed by the service role', async () => {
      seen.signPaths.length = 0; seen.signAuth.length = 0;
      const r = await call(fn, 'tok-plus', { pack_id: PACK_SB });
      assertEquals(r.status, 200);
      const u = new URL(r.body.url);
      assertEquals(u.pathname, `/storage/v1/object/sign/offline-packs/${KEY}`);
      assertEquals(u.searchParams.get('token'), 'signed-token');
      assertEquals(seen.signAuth, ['service']);
      assertEquals(r.body.size_bytes, 3145728);
      assertEquals(r.body.sha256, 'ab'.repeat(32));
      assertEquals(r.body.version, 20261103);
      assertEquals(r.body.format, 'pmtiles');
      assertEquals(r.body.kind, 'tiles');
      assertEquals(r.body.is_current, true);
      assertEquals(r.headers.get('cache-control'), 'no-store');
      assertMatch(r.headers.get('content-type') ?? '', /application\/json/);
    });

    await t.step('an older pack is still served, flagged is_current: false', async () => {
      const r = await call(fn, 'tok-plus', { pack_id: PACK_OLD });
      assertEquals(r.status, 200);
      assertEquals(r.body.is_current, false);
    });

    await t.step('subscriber -> presigned R2 URL that a real S3 would accept', async () => {
      const r = await call(fn, 'tok-plus', { pack_id: PACK_R2 });
      assertEquals(r.status, 200);
      const u = new URL(r.body.url);
      assertEquals(u.host, 'acct123.r2.cloudflarestorage.com');
      assertEquals(u.pathname, '/caminoplus-packs/camino-frances/stage-01/tiles-v20261103.pmtiles');
      assertEquals(u.searchParams.get('X-Amz-Expires'), '900');
      assertMatch(u.searchParams.get('X-Amz-Signature') ?? '', /^[0-9a-f]{64}$/);
      assertMatch(u.searchParams.get('X-Amz-Credential') ?? '', /^AKIDEXAMPLE\/\d{8}\/auto\/s3\/aws4_request$/);
      assertEquals(u.searchParams.get('X-Amz-SignedHeaders'), 'host');
      assertEquals(u.searchParams.get('X-Amz-Signature'), await expectedSignature(u, R2_SECRET));
      assertEquals(r.body.size_bytes, 3145728);
      assert(Date.parse(r.body.expires_at) > Date.now());
      assert(Math.abs(Date.parse(r.body.expires_at) - (Date.now() + 900_000)) < 10_000, 'expires_at is now + TTL');
    });

    await t.step('keys with spaces, #, ?, %, +, quotes, parentheses and non-ASCII: R2 signature is valid', async () => {
      const r = await call(fn, 'tok-plus', { pack_id: PACK_R2_SPECIAL });
      assertEquals(r.status, 200);
      const u = new URL(r.body.url);
      assertEquals(decodeURIComponent(u.pathname), `/caminoplus-packs/${SPECIAL_KEY}`);
      assert(!u.pathname.includes('#') && !u.pathname.includes('?') && !u.pathname.includes(' '), 'path has no raw #, ? or space: ' + u.pathname);
      assertEquals(u.hash, '');
      assertEquals(u.searchParams.get('X-Amz-Signature'), await expectedSignature(u, R2_SECRET));
    });

    await t.step('keys with special characters: Storage is asked for the encoded path', async () => {
      seen.signPaths.length = 0;
      const r = await call(fn, 'tok-plus', { pack_id: PACK_SB_SPECIAL });
      assertEquals(r.status, 200);
      assertEquals(seen.signPaths.length, 1);
      const expected = "/storage/v1/object/sign/offline-packs/camino%20frances/stage%20%231%20%28v2%29/it%27s%20100%25%2B%20%C3%A4%20%26%20b%3Dc%3F.pmtiles";
      assertEquals(seen.signPaths[0], expected);
    });

    await t.step('a key with "." or ".." segments is refused (a URL parser would fold it into another object)', async () => {
      const r = await call(fn, 'tok-plus', { pack_id: PACK_DOT_SEGMENTS });
      assertEquals(r.status, 500);
      assertEquals(r.body.error, 'sign_failed');
    });

    await t.step('bucket mismatch (R2 and Supabase) and unknown storage -> 500 sign_failed', async () => {
      for (const id of [PACK_R2_OTHER_BUCKET, PACK_SB_OTHER_BUCKET, PACK_UNKNOWN_SCHEME]) {
        const r = await call(fn, 'tok-plus', { pack_id: id });
        assertEquals(r.status, 500, id);
        assertEquals(r.body.error, 'sign_failed', id);
      }
    });

    await t.step('Storage refuses to sign -> 500 sign_failed', async () => {
      const r = await call(fn, 'tok-plus', { pack_id: PACK_SIGN_FAILS });
      assertEquals(r.status, 500);
      assertEquals(r.body.error, 'sign_failed');
    });

    await t.step('R2 not configured -> 503 storage_not_configured (Supabase packs still work)', async () => {
      const noR2 = await start({ R2_ACCOUNT_ID: '', R2_ACCESS_KEY_ID: '', R2_SECRET_ACCESS_KEY: '' });
      const r = await call(noR2, 'tok-plus', { pack_id: PACK_R2 });
      assertEquals(r.status, 503);
      assertEquals(r.body.error, 'storage_not_configured');
      assertEquals((await call(noR2, 'tok-plus', { pack_id: PACK_SB })).status, 200);
    });

    await t.step('TTL: default 15 min, clamped to 60..3600 seconds, garbage means the default', async () => {
      const cases: [string | null, number][] = [
        [null, 900], ['', 900], ['10', 60], ['59', 60], ['60', 60], ['1800', 1800], ['1800.9', 1800],
        ['3600', 3600], ['99999', 3600], ['-5', 60], ['abc', 900], ['Infinity', 900],
      ];
      for (const [raw, want] of cases) {
        const f = raw === null ? fn : await start({ PACK_URL_TTL_SECONDS: raw });
        seen.signBodies.length = 0;
        const r2 = await call(f, 'tok-plus', { pack_id: PACK_R2 });
        assertEquals(new URL(r2.body.url).searchParams.get('X-Amz-Expires'), String(want), `R2, PACK_URL_TTL_SECONDS=${raw}`);
        assert(Math.abs(Date.parse(r2.body.expires_at) - (Date.now() + want * 1000)) < 10_000, `expires_at, TTL ${raw}`);
        await call(f, 'tok-plus', { pack_id: PACK_SB });
        assertEquals(seen.signBodies[0]?.expiresIn, want, `Storage, PACK_URL_TTL_SECONDS=${raw}`);
      }
    });
  } finally {
    for (const r of running) await r.stop();
    await fake.shutdown();
  }
});
