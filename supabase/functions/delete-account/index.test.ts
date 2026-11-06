// deno test --allow-net --allow-env --allow-run --allow-read supabase/functions/delete-account/index.test.ts
//
// Runs the real function (a `deno run` child process) against a fake Supabase (Auth admin, PostgREST and
// Storage) on localhost. No real Supabase is needed.
//
// Ports: every server listens on an ephemeral port (port 0) and the function is started with
// DENO_SERVE_ADDRESS=tcp:127.0.0.1:0 and tells us where it ended up, so test runs can never collide.
// FAKE_SUPABASE_PORT and FUNCTION_PORT pin a port when you want to debug with curl.
// TEST_DEBUG=1 prints what the function logs to stderr and which requests the fake did not know.
import { assert, assertEquals } from 'jsr:@std/assert@1';

const ME = 'd1000000-0000-4000-8000-000000000001';
const NEIGHBOUR = 'd1000000-0000-4000-8000-000000000011'; // another pilgrim whose id starts the same way
const OTHER = 'd2000000-0000-4000-8000-000000000002';
const B_SOLE = 'b1000000-0000-4000-8000-000000000001'; // I am the only owner            -> closes
const B_CO = 'b1000000-0000-4000-8000-000000000002'; // another owner exists            -> lives on
const B_STAFF = 'b1000000-0000-4000-8000-000000000003'; // I am staff, an owner exists   -> lives on
const B_MGR = 'b1000000-0000-4000-8000-000000000004'; // only a staff member remains     -> closes
const B_PROMOTE = 'b1000000-0000-4000-8000-000000000005'; // a manager remains (becomes owner) -> lives on
const B_STRANGER = 'b1000000-0000-4000-8000-000000000009'; // not mine at all

// ---- fake Supabase -----------------------------------------------------------------------------
type Member = { business_id: string; user_id: string; role: string };
const state = {
  tokens: {} as Record<string, string>, // token -> user id
  authStatus: {} as Record<string, number>, // token -> forced Auth status (503 ...)
  members: [] as Member[],
  objects: {} as Record<string, string[]>, // bucket -> object names
  failList: new Set<string>(), // buckets whose list call fails
  failRemove: new Set<string>(), // buckets whose remove call fails
  failMembers: false,
  deleteUserStatus: 200,
  userGone: false, // Auth no longer knows the user
  removeCalls: 0,
  failRemoveCall: 0, // the Nth remove call (1-based) fails once
  log: [] as string[],
  calls: 0, // every request that is not the Auth token check
};
function reset() {
  state.tokens = { 'tok-me': ME };
  state.authStatus = {};
  state.members = [];
  state.objects = { 'user-media': [], avatars: [], 'business-docs': [], 'business-media': [], 'public-media': [] };
  state.failList = new Set();
  state.failRemove = new Set();
  state.failMembers = false;
  state.deleteUserStatus = 200;
  state.userGone = false;
  state.removeCalls = 0;
  state.failRemoveCall = 0;
  state.log = [];
  state.calls = 0;
}
reset();

const names = (bucket: string) => state.objects[bucket] ?? [];

const fake = Deno.serve(
  { hostname: '127.0.0.1', port: Number(Deno.env.get('FAKE_SUPABASE_PORT') ?? 0), onListen() {} },
  async (req) => {
    const u = new URL(req.url);
    const bearer = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const unauthorised = new Response('{"message":"only the service role may do this"}', { status: 403 });

    if (u.pathname === '/auth/v1/user') {
      state.log.push(`auth.getUser ${bearer}`);
      if (state.authStatus[bearer]) return new Response('{"msg":"auth says no"}', { status: state.authStatus[bearer] });
      const id = state.tokens[bearer];
      return id ? Response.json({ id, aud: 'authenticated', email: 'pilgrim@example.test' }) : new Response('{"code":401,"msg":"invalid JWT"}', { status: 401 });
    }

    state.calls++;
    if (u.pathname.startsWith('/auth/v1/admin/users/')) {
      if (bearer !== 'service') return unauthorised;
      const id = decodeURIComponent(u.pathname.split('/').pop()!);
      if (req.method === 'GET') {
        // supabase-js 2.119 looks the user up before it deletes it (to return it from deleteUser)
        state.log.push(`auth.getUserById ${id}`);
        if (state.userGone) return new Response('{"code":404,"error_code":"user_not_found","msg":"User not found"}', { status: 404 });
        return Response.json({ id, aud: 'authenticated', email: 'pilgrim@example.test' });
      }
      if (req.method === 'DELETE') {
        state.log.push(`auth.deleteUser ${id}`);
        if (state.deleteUserStatus !== 200) return new Response('{"msg":"nope"}', { status: state.deleteUserStatus });
        return Response.json({});
      }
    }

    if (u.pathname === '/rest/v1/business_members') {
      if (bearer !== 'service') return unauthorised;
      state.log.push('rest.business_members');
      if (state.failMembers) return new Response('{"message":"boom"}', { status: 500 });
      const q = u.searchParams;
      const eq = (k: string) => (q.get(k) ?? '').replace(/^(eq|neq)\./, '');
      let rows = state.members;
      const bizIn = q.get('business_id');
      if (bizIn?.startsWith('in.(')) {
        const ids = bizIn.slice(4, -1).split(',');
        rows = rows.filter((m) => ids.includes(m.business_id));
      }
      if (q.get('user_id')?.startsWith('eq.')) rows = rows.filter((m) => m.user_id === eq('user_id'));
      if (q.get('user_id')?.startsWith('neq.')) rows = rows.filter((m) => m.user_id !== eq('user_id'));
      const roles = q.get('role');
      if (roles?.startsWith('in.(')) rows = rows.filter((m) => roles.slice(4, -1).split(',').includes(m.role));
      return Response.json(rows.map((m) => ({ business_id: m.business_id })));
    }

    let m = /^\/storage\/v1\/object\/list\/([^/]+)$/.exec(u.pathname);
    if (m && req.method === 'POST') {
      if (bearer !== 'service') return unauthorised;
      const bucket = m[1];
      const { prefix, limit, offset } = await req.json();
      state.log.push(`storage.list ${bucket}/${prefix}`);
      if (state.failList.has(bucket)) return new Response('{"message":"boom"}', { status: 500 });
      // one level of the "folder" `prefix`: folders have id null, files have an id
      const level = new Map<string, boolean>(); // name -> isFolder
      for (const name of names(bucket)) {
        if (!name.startsWith(prefix + '/')) continue;
        const rest = name.slice(prefix.length + 1);
        const slash = rest.indexOf('/');
        level.set(slash === -1 ? rest : rest.slice(0, slash), slash !== -1);
      }
      const entries = [...level.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).slice(offset, offset + limit)
        .map(([name, folder]) => ({ name, id: folder ? null : `id-${name}`, metadata: folder ? null : { size: 1 } }));
      return Response.json(entries);
    }

    m = /^\/storage\/v1\/object\/([^/]+)$/.exec(u.pathname);
    if (m && req.method === 'DELETE') {
      if (bearer !== 'service') return unauthorised;
      const bucket = m[1];
      const { prefixes } = await req.json();
      state.removeCalls++;
      state.log.push(`storage.remove ${bucket} ${prefixes.length}`);
      if (state.failRemove.has(bucket) || state.failRemoveCall === state.removeCalls) return new Response('{"message":"boom"}', { status: 500 });
      state.objects[bucket] = names(bucket).filter((n) => !prefixes.includes(n));
      return Response.json(prefixes.map((name: string) => ({ name })));
    }
    if (Deno.env.get('TEST_DEBUG')) console.error('[fake] not mocked:', req.method, u.pathname);
    return new Response('not mocked: ' + req.method + ' ' + u.pathname, { status: 500 });
  },
);
const FAKE = `http://127.0.0.1:${fake.addr.port}`;

// ---- the function under test -------------------------------------------------------------------
type Running = { url: string; stop: () => Promise<void> };

async function startFunction(extraEnv: Record<string, string> = {}, supabaseUrl = FAKE): Promise<Running> {
  const env = Deno.env.toObject();
  delete env.DELETE_ACCOUNT_STORAGE_BUDGET_MS;
  Object.assign(env, {
    SUPABASE_URL: supabaseUrl, SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service',
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
        const found = /Listening on https?:\/\/[^:\s]+:(\d+)/.exec(log);
        if (found) {
          clearTimeout(timer);
          resolve(Number(found[1]));
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

const DELETE = { confirm: 'DELETE' };
const files = (...n: string[]) => n;
const deleted = () => state.log.filter((l) => l.startsWith('auth.deleteUser'));  // the DELETE call itself
const untouched = () => state.calls === 0;

// ---- tests -------------------------------------------------------------------------------------
Deno.test({ name: 'delete-account', sanitizeOps: false, sanitizeResources: false }, async (t) => {
  const running: Running[] = [];
  const start = async (env: Record<string, string> = {}, supabaseUrl = FAKE) => {
    const r = await startFunction(env, supabaseUrl);
    running.push(r);
    return r;
  };
  try {
    const fn = await start();

    await t.step('OPTIONS -> 200 with CORS headers', async () => {
      const r = await fetch(fn.url, { method: 'OPTIONS' });
      assertEquals(r.status, 200);
      assertEquals(r.headers.get('access-control-allow-origin'), '*');
      assert((r.headers.get('access-control-allow-methods') ?? '').includes('POST'));
      assert((r.headers.get('access-control-allow-headers') ?? '').includes('authorization'));
    });

    await t.step('GET, PUT and DELETE -> 405', async () => {
      reset();
      for (const method of ['GET', 'PUT', 'DELETE']) {
        const r = await call(fn, 'tok-me', DELETE, { method });
        assertEquals(r.status, 405, method);
        assertEquals(r.body.error, 'method_not_allowed');
      }
      assert(untouched());
    });

    await t.step('no token, a non-Bearer header, an empty Bearer -> 401, nothing is touched', async () => {
      reset();
      assertEquals((await call(fn, null, DELETE)).status, 401);
      const basic = await call(fn, null, DELETE, { headers: { Authorization: 'Basic dXNlcjpwYXNz' } });
      assertEquals(basic.status, 401);
      assertEquals(basic.body.error, 'not_signed_in');
      assertEquals((await call(fn, null, DELETE, { headers: { Authorization: 'Bearer ' } })).status, 401);
      assert(untouched() && state.log.length === 0);
    });

    await t.step('invalid or unknown token -> 401, nothing is touched', async () => {
      reset();
      state.objects['user-media'] = files(`${ME}/a.jpg`);
      const r = await call(fn, 'tok-bogus', DELETE);
      assertEquals(r.status, 401);
      assertEquals(r.body.error, 'not_signed_in');
      assert(untouched());
      assertEquals(state.objects['user-media'], [`${ME}/a.jpg`]);
    });

    await t.step('a wrong or missing confirmation -> 400 bad_confirm, Auth is not even asked', async () => {
      reset();
      state.objects['user-media'] = files(`${ME}/a.jpg`);
      const bodies: [unknown, string?][] = [[{}], [{ confirm: 'delete' }], [{ confirm: 'YES' }], [{ confirm: true }], [{ confirm: ' DELETE' }], [null, 'null'], [[]], ['DELETE', '"DELETE"']];
      for (const [body, raw] of bodies) {
        const r = await call(fn, 'tok-me', body, { raw });
        assertEquals(r.status, 400, JSON.stringify(body));
        assertEquals(r.body.error, 'bad_confirm');
      }
      assertEquals((await call(fn, 'tok-me', null, { raw: '{not json' })).status, 400);
      assertEquals((await call(fn, 'tok-me', null, { raw: '' })).status, 400);
      assertEquals(state.log, []);
      assertEquals(state.objects['user-media'], [`${ME}/a.jpg`]);
    });

    await t.step('Auth down -> 500 auth_unavailable, nothing is deleted', async () => {
      reset();
      state.tokens['tok-down'] = ME;
      state.authStatus['tok-down'] = 503;
      const r = await call(fn, 'tok-down', DELETE);
      assertEquals(r.status, 500);
      assertEquals(r.body.error, 'auth_unavailable');
      assert(untouched());
    });

    await t.step('Auth unreachable -> 500 auth_unavailable', async () => {
      const closed = Deno.listen({ hostname: '127.0.0.1', port: 0 });
      const deadPort = (closed.addr as Deno.NetAddr).port;
      closed.close();
      const dead = await start({}, `http://127.0.0.1:${deadPort}`);
      const r = await call(dead, 'tok-me', DELETE);
      assertEquals(r.status, 500);
      assertEquals(r.body.error, 'auth_unavailable');
    });

    await t.step('happy path: files first (nested folders, more than one page), the user last, 200 { ok: true }', async () => {
      reset();
      const many = Array.from({ length: 230 }, (_, i) => `${ME}/posts/p${String(i).padStart(3, '0')}.jpg`);
      state.objects['user-media'] = [...many, `${ME}/chat/c1/x.jpg`, `${ME}/chat/c1/deeper/y.jpg`, `${ME}/stamps/s.jpg`, `${OTHER}/posts/keep.jpg`, `${NEIGHBOUR}/posts/keep-too.jpg`];
      state.objects.avatars = files(`${ME}/avatar.png`, `${OTHER}/avatar.png`, `${NEIGHBOUR}/avatar.png`);
      state.objects['public-media'] = files(`${ME}/should-not-be-touched.jpg`);
      const r = await call(fn, 'tok-me', DELETE);
      assertEquals(r.status, 200);
      assertEquals(r.body, { ok: true });
      assertEquals(state.objects['user-media'], [`${OTHER}/posts/keep.jpg`, `${NEIGHBOUR}/posts/keep-too.jpg`]);
      assertEquals(state.objects.avatars, [`${OTHER}/avatar.png`, `${NEIGHBOUR}/avatar.png`]);
      assertEquals(state.objects['public-media'], [`${ME}/should-not-be-touched.jpg`]);
      assertEquals(deleted(), [`auth.deleteUser ${ME}`]);
      const lastRemove = state.log.map((l, i) => [l, i] as const).filter(([l]) => l.startsWith('storage.remove')).pop()![1];
      assert(lastRemove < state.log.indexOf(`auth.deleteUser ${ME}`), 'all files are removed before the user');
      assert(state.log.filter((l) => l.startsWith('storage.remove user-media')).length >= 3, 'removed in pages of 100');
      assertEquals(r.headers.get('cache-control'), 'no-store');
    });

    await t.step('the user id comes from the token, not from the body', async () => {
      reset();
      state.objects['user-media'] = files(`${ME}/a.jpg`, `${OTHER}/b.jpg`);
      const r = await call(fn, 'tok-me', { confirm: 'DELETE', user_id: OTHER, id: OTHER, uid: OTHER });
      assertEquals(r.status, 200);
      assertEquals(deleted(), [`auth.deleteUser ${ME}`]);
      assertEquals(state.objects['user-media'], [`${OTHER}/b.jpg`]);
    });

    await t.step('businesses: only those with nobody left to manage them lose their files', async () => {
      reset();
      state.members = [
        { business_id: B_SOLE, user_id: ME, role: 'owner' },
        { business_id: B_CO, user_id: ME, role: 'owner' }, { business_id: B_CO, user_id: OTHER, role: 'owner' },
        { business_id: B_STAFF, user_id: ME, role: 'staff' }, { business_id: B_STAFF, user_id: OTHER, role: 'owner' },
        { business_id: B_MGR, user_id: ME, role: 'owner' }, { business_id: B_MGR, user_id: OTHER, role: 'staff' },
        { business_id: B_PROMOTE, user_id: ME, role: 'owner' }, { business_id: B_PROMOTE, user_id: OTHER, role: 'manager' },
        { business_id: B_STRANGER, user_id: OTHER, role: 'owner' },
      ];
      const everyBusiness = [B_SOLE, B_CO, B_STAFF, B_MGR, B_PROMOTE, B_STRANGER];
      state.objects['business-docs'] = everyBusiness.map((b) => `${b}/proof.pdf`);
      state.objects['business-media'] = everyBusiness.flatMap((b) => [`${b}/1.jpg`, `${b}/2.jpg`]);
      const r = await call(fn, 'tok-me', DELETE);
      assertEquals(r.status, 200);
      const left = (bucket: string) => state.objects[bucket].map((n) => n.split('/')[0]).filter((v, i, a) => a.indexOf(v) === i).sort();
      assertEquals(left('business-docs'), [B_CO, B_STAFF, B_PROMOTE, B_STRANGER].sort(), 'business-docs of businesses that live on');
      assertEquals(left('business-media'), [B_CO, B_STAFF, B_PROMOTE, B_STRANGER].sort(), 'business-media of businesses that live on');
      assertEquals(deleted(), [`auth.deleteUser ${ME}`]);
    });

    await t.step('storage is best effort: list and remove failures are logged, the account is still deleted', async () => {
      reset();
      state.objects['user-media'] = files(`${ME}/a.jpg`);
      state.objects.avatars = files(`${ME}/avatar.png`);
      state.failList.add('user-media');
      state.failRemove.add('avatars');
      const r = await call(fn, 'tok-me', DELETE);
      assertEquals(r.status, 200);
      assertEquals(deleted(), [`auth.deleteUser ${ME}`]);
      assertEquals(state.objects['user-media'], [`${ME}/a.jpg`], 'could not be listed, so it stays');
      assertEquals(state.objects.avatars, [`${ME}/avatar.png`], 'could not be removed, so it stays');
    });

    await t.step('one failing page does not stop the next pages', async () => {
      reset();
      state.objects['user-media'] = Array.from({ length: 250 }, (_, i) => `${ME}/p${String(i).padStart(3, '0')}.jpg`);
      state.failRemoveCall = 1; // the first remove call fails once
      const r = await call(fn, 'tok-me', DELETE);
      assertEquals(r.status, 200);
      assertEquals(state.objects['user-media'].length, 100, 'two of three pages were removed');
      assertEquals(deleted().length, 1);
    });

    await t.step('the business lookup fails -> 500 lookup_failed and NOTHING is deleted', async () => {
      reset();
      state.members = [{ business_id: B_SOLE, user_id: ME, role: 'owner' }];
      state.objects['user-media'] = files(`${ME}/a.jpg`);
      state.failMembers = true;
      const r = await call(fn, 'tok-me', DELETE);
      assertEquals(r.status, 500);
      assertEquals(r.body.error, 'lookup_failed');
      assertEquals(state.objects['user-media'], [`${ME}/a.jpg`]);
      assertEquals(deleted(), []);
    });

    await t.step('deleteUser fails -> 500 delete_failed (the pilgrim can simply try again)', async () => {
      reset();
      state.objects['user-media'] = files(`${ME}/a.jpg`);
      state.deleteUserStatus = 500;
      const r = await call(fn, 'tok-me', DELETE);
      assertEquals(r.status, 500);
      assertEquals(r.body.error, 'delete_failed');
      assertEquals(deleted(), [`auth.deleteUser ${ME}`]);
      // the retry works once Auth is back: no files are left, the user goes
      state.deleteUserStatus = 200;
      const again = await call(fn, 'tok-me', DELETE);
      assertEquals(again.status, 200);
    });

    await t.step('the user is already gone (404 from Auth, before or during the delete) -> still 200 { ok: true }', async () => {
      reset();
      state.userGone = true; // a second request after the first one finished
      const r = await call(fn, 'tok-me', DELETE);
      assertEquals(r.status, 200);
      assertEquals(r.body, { ok: true });
      reset();
      state.deleteUserStatus = 404; // gone between the look-up and the delete
      assertEquals((await call(fn, 'tok-me', DELETE)).status, 200);
    });

    await t.step('the time budget for files caps the cleanup, the account is still deleted', async () => {
      reset();
      state.objects['user-media'] = files(`${ME}/a.jpg`);
      const slow = await start({ DELETE_ACCOUNT_STORAGE_BUDGET_MS: '0' });
      await new Promise((r) => setTimeout(r, 5));
      const r = await call(slow, 'tok-me', DELETE);
      assertEquals(r.status, 200);
      assertEquals(deleted(), [`auth.deleteUser ${ME}`]);
      assertEquals(state.objects['user-media'], [`${ME}/a.jpg`], 'no time was left for files');
    });
  } finally {
    for (const r of running) await r.stop();
    await fake.shutdown();
  }
});
