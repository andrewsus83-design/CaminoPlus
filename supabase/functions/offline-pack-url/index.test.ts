// deno test --allow-net --allow-env --allow-run --allow-read supabase/functions/offline-pack-url/index.test.ts
//
// Runs the function against a fake Supabase (auth + PostgREST) on localhost and
// checks: free user -> 403, subscriber -> signed Storage or presigned R2 URL, unknown pack -> 404,
// no token -> 401. No real Supabase or R2 needed.
import { assert, assertEquals, assertMatch } from 'jsr:@std/assert@1';

const PACK = '11111111-1111-4111-8111-111111111111'; // on R2
const SB_PACK = '33333333-3333-4333-8333-333333333333'; // on Supabase Storage
const KEY = 'camino-frances/stage-01/tiles-v20261103.pmtiles';
const users: Record<string, { plus: boolean }> = { 'tok-free': { plus: false }, 'tok-plus': { plus: true } };

const fake = Deno.serve({ port: 54399, onListen() {} }, (req) => {
  const u = new URL(req.url);
  const tok = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const who = users[tok];
  if (u.pathname === '/auth/v1/user') {
    return who ? Response.json({ id: tok, aud: 'authenticated' }) : new Response('{}', { status: 401 });
  }
  if (u.pathname === '/rest/v1/rpc/get_my_entitlements') {
    return Response.json({ plan: who?.plus ? 'plus' : 'free', has_plus: !!who?.plus, can_download_routes: !!who?.plus });
  }
  if (u.pathname === '/rest/v1/offline_packs') {
    // RLS: only CaminoPlus users see rows.
    const id = u.searchParams.get('id');
    const base = { kind: 'tiles', format: 'pmtiles', version: 20261103, size_bytes: 3145728, sha256: 'ab'.repeat(32), is_current: true };
    const rows = !who?.plus ? []
      : id === `eq.${PACK}` ? [{ ...base, id: PACK, url: `r2://caminoplus-packs/${KEY}` }]
      : id === `eq.${SB_PACK}` ? [{ ...base, id: SB_PACK, url: `supabase://offline-packs/${KEY}` }]
      : [];
    return Response.json(rows);
  }
  if (u.pathname === `/storage/v1/object/sign/offline-packs/${KEY}`) {
    // Only the service role may sign.
    if (tok !== 'service') return new Response('{"message":"unauthorized"}', { status: 403 });
    return Response.json({ signedURL: `/object/sign/offline-packs/${KEY}?token=signed-token` });
  }
  return new Response('not mocked: ' + u.pathname, { status: 500 });
});

const fn = new Deno.Command(Deno.execPath(), {
  args: ['run', '--allow-net', '--allow-env', new URL('./index.ts', import.meta.url).pathname],
  env: {
    SUPABASE_URL: 'http://127.0.0.1:54399', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service',
    R2_ACCOUNT_ID: 'acct123', R2_ACCESS_KEY_ID: 'AKIDEXAMPLE', R2_SECRET_ACCESS_KEY: 'secret', R2_BUCKET: 'caminoplus-packs',
  },
  stdout: 'null', stderr: 'inherit',
}).spawn();

async function call(token: string | null, body: unknown) {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch('http://127.0.0.1:8000/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      });
      return { status: r.status, body: await r.json() };
    } catch {
      await new Promise((r) => setTimeout(r, 200)); // function still starting
    }
  }
  throw new Error('function did not start');
}

Deno.test({ name: 'offline-pack-url', sanitizeOps: false, sanitizeResources: false }, async (t) => {
  try {
    await t.step('no token -> 401', async () => {
      assertEquals((await call(null, { pack_id: PACK })).status, 401);
    });
    await t.step('free user -> 403 subscription_required', async () => {
      const r = await call('tok-free', { pack_id: PACK });
      assertEquals(r.status, 403);
      assertEquals(r.body.error, 'subscription_required');
    });
    await t.step('bad pack id -> 400', async () => {
      assertEquals((await call('tok-plus', { pack_id: 'x' })).status, 400);
    });
    await t.step('unknown pack -> 404', async () => {
      assertEquals((await call('tok-plus', { pack_id: '22222222-2222-4222-8222-222222222222' })).status, 404);
    });
    await t.step('subscriber, Supabase Storage pack -> signed Storage URL', async () => {
      const r = await call('tok-plus', { pack_id: SB_PACK });
      assertEquals(r.status, 200);
      const u = new URL(r.body.url);
      assertEquals(u.pathname, `/storage/v1/object/sign/offline-packs/${KEY}`);
      assertEquals(u.searchParams.get('token'), 'signed-token');
    });
    await t.step('subscriber -> presigned R2 URL', async () => {
      const r = await call('tok-plus', { pack_id: PACK });
      assertEquals(r.status, 200);
      const u = new URL(r.body.url);
      assertEquals(u.host, 'acct123.r2.cloudflarestorage.com');
      assertEquals(u.pathname, '/caminoplus-packs/camino-frances/stage-01/tiles-v20261103.pmtiles');
      assertEquals(u.searchParams.get('X-Amz-Expires'), '900');
      assertMatch(u.searchParams.get('X-Amz-Signature') ?? '', /^[0-9a-f]{64}$/);
      assertMatch(u.searchParams.get('X-Amz-Credential') ?? '', /^AKIDEXAMPLE\/\d{8}\/auto\/s3\/aws4_request$/);
      assertEquals(r.body.size_bytes, 3145728);
      assert(Date.parse(r.body.expires_at) > Date.now());
    });
  } finally {
    fn.kill();
    await fn.status;
    await fake.shutdown();
  }
});
