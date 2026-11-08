// The queries behind the action rail (like, bookmark, share, comments) against a scripted stand-in for Supabase. Run: npm run test:me
//
// What is checked is what goes over the wire and what the app does with the answers, because the live database cannot be
// reached from a test and CI's schema cannot tell what the app asks of it: a like and a bookmark are written with "on
// conflict do nothing" (post_saves has no UPDATE for the app), an unlike and an unbookmark only ever remove the pilgrim's own
// row, a share goes through the rpc record_post_share, comments are read newest first without the hidden ones, and every one
// of them stops at the offline check before any request. api.ts is read from its source and compiled in memory (plain node
// cannot import it as it is: it pulls in React Native); only ./supabase, ./net and ./uuid are replaced.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

type Call = { op: 'select' | 'insert' | 'upsert' | 'delete' | 'rpc'; table?: string; rpc?: string; select?: string; row?: unknown; opts?: unknown; args?: unknown; filters: unknown[][]; order?: unknown[]; limit?: number };
type Answer = { data?: unknown; error?: { message: string; code?: string } | null };
type Script = (call: Call) => Answer | Promise<Answer>;
type Api = {
  listMyReactions(userId: string, ids: string[]): Promise<{ liked: Set<string> | null; saved: Set<string> | null }>;
  likePost(userId: string, postId: string): Promise<void>;
  unlikePost(userId: string, postId: string): Promise<void>;
  savePost(userId: string, postId: string): Promise<void>;
  unsavePost(userId: string, postId: string): Promise<void>;
  recordPostShare(postId: string): Promise<number | null>;
  listPostComments(postId: string): Promise<Record<string, unknown>[]>;
  addPostComment(o: { id: string; userId: string; postId: string; body: string }): Promise<void>;
};

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');
const compile = (file: string) => ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const run = (code: string, req: (id: string) => unknown) => {
  const m = { exports: {} as Record<string, unknown> };
  new Function('exports', 'require', 'module', code)(m.exports, req, m);
  return m.exports;
};

// A query builder that answers like Supabase: chain anything, await the result. Every call is logged.
function client(script: Script, log: Call[]) {
  const builder = (call: Call) => {
    const b = {
      select(cols: string) { if (call.op === 'select') call.select = cols; return b; },
      insert(row: unknown) { call.op = 'insert'; call.row = row; return b; },
      upsert(row: unknown, opts: unknown) { call.op = 'upsert'; call.row = row; call.opts = opts; return b; },
      delete() { call.op = 'delete'; return b; },
      eq(...a: unknown[]) { call.filters.push(['eq', ...a]); return b; },
      is(...a: unknown[]) { call.filters.push(['is', ...a]); return b; },
      in(...a: unknown[]) { call.filters.push(['in', ...a]); return b; },
      order(...a: unknown[]) { call.order = a; return b; },
      limit(n: number) { call.limit = n; return b; },
      then(res: (v: unknown) => unknown, rej: (e: unknown) => unknown) { return Promise.resolve().then(() => script(call)).then(res, rej); },
    };
    return b;
  };
  return {
    from(table: string) {
      const call: Call = { op: 'select', table, filters: [] };
      log.push(call);
      return builder(call);
    },
    rpc(name: string, args: unknown) {
      const call: Call = { op: 'rpc', rpc: name, args, filters: [] };
      log.push(call);
      return builder(call);
    },
  };
}

const nothing = () => { throw new Error('this file imports nothing'); };
const modules: Record<string, unknown> = {
  './postEngagement': run(compile('src/lib/postEngagement.ts'), nothing),
  './engagement': run(compile('src/lib/engagement.ts'), nothing),
  './postComments': run(compile('src/lib/postComments.ts'), nothing),
};
const apiCode = compile('src/lib/api.ts');
const online = { assertOnline: async () => {} };
const offline = { assertOnline: async () => { throw Object.assign(new Error('You are offline.'), { name: 'OfflineError' }); } };
const load = (script: Script, log: Call[] = [], net: { assertOnline(): Promise<void> } = online) =>
  run(apiCode, (id) => {
    if (id === './supabase') return { supabase: client(script, log) };
    if (id === './net') return net;
    if (id === './uuid') return { uuid: () => 'id' };
    if (id in modules) return modules[id];
    // the one storage module (uploads and links of photos); post actions do not touch it
    if (id === './mediaStorage') return { MEDIA_BUCKET: { userMedia: 'user-media', avatars: 'avatars' }, upload: nothing, signedUrls: nothing, deleteMedia: nothing };
    if (id === './postMediaUpload') return { uploadPostMediaWith: nothing };
    throw new Error(`api.ts imports ${id}: add it to this test`);
  }) as unknown as Api;

const ME = '11111111-1111-4111-8111-111111111111';
const P1 = '22222222-0000-4000-8000-000000000001';
const P2 = '22222222-0000-4000-8000-000000000002';
const ok: Script = () => ({ data: null, error: null });

let n = 0;
const test = async (name: string, fn: () => Promise<void>) => { await fn(); n++; console.log(`ok ${n} - ${name}`); };

(async () => {
  /* ---------------- like ---------------- */

  await test('like: one write to post_likes, as this pilgrim, with "on conflict do nothing" (so a second try is not an error)', async () => {
    const log: Call[] = [];
    await load(ok, log).likePost(ME, P1);
    assert.equal(log.length, 1);
    assert.deepEqual(log[0], { op: 'upsert', table: 'post_likes', row: { post_id: P1, user_id: ME }, opts: { onConflict: 'post_id,user_id', ignoreDuplicates: true }, filters: [] });
  });

  await test('unlike: removes only this pilgrim\'s row of this post, never a delete without both filters', async () => {
    const log: Call[] = [];
    await load(ok, log).unlikePost(ME, P1);
    assert.equal(log.length, 1);
    assert.equal(log[0].op, 'delete');
    assert.equal(log[0].table, 'post_likes');
    assert.deepEqual(log[0].filters, [['eq', 'post_id', P1], ['eq', 'user_id', ME]]);
  });

  /* ---------------- bookmark ---------------- */

  await test('bookmark: an insert into post_saves that does nothing on conflict, and never an update (UPDATE is taken away from the app)', async () => {
    const log: Call[] = [];
    await load(ok, log).savePost(ME, P1);
    assert.equal(log.length, 1);
    assert.equal(log[0].table, 'post_saves');
    assert.equal(log[0].op, 'upsert');
    assert.deepEqual(log[0].row, { post_id: P1, user_id: ME });
    assert.deepEqual(log[0].opts, { onConflict: 'post_id,user_id', ignoreDuplicates: true }, 'ignoreDuplicates is "on conflict do nothing"; without it an upsert would need UPDATE');
  });

  await test('unbookmark: removes only this pilgrim\'s row of this post', async () => {
    const log: Call[] = [];
    await load(ok, log).unsavePost(ME, P2);
    assert.equal(log[0].op, 'delete');
    assert.equal(log[0].table, 'post_saves');
    assert.deepEqual(log[0].filters, [['eq', 'post_id', P2], ['eq', 'user_id', ME]]);
  });

  await test('the app never updates post_likes, post_saves or post_comments rows, and every upsert in api.ts is "on conflict do nothing"', async () => {
    const src = read('src/lib/api.ts');
    assert.doesNotMatch(src, /from\('(post_likes|post_saves|post_comments)'\)\s*\.update/);
    const upserts = src.match(/\.upsert\(/g) ?? [];
    const ignoring = src.match(/ignoreDuplicates: true/g) ?? [];
    assert.ok(upserts.length >= 2);
    assert.equal(ignoring.length, upserts.length, 'an upsert that may update would need UPDATE, which post_saves does not give the app');
  });

  /* ---------------- failures and offline ---------------- */

  await test('a write that the database refuses throws its message (the rail then puts the old state back)', async () => {
    const refuse: Script = () => ({ data: null, error: { message: 'permission denied for table post_likes' } });
    for (const call of [(a: Api) => a.likePost(ME, P1), (a: Api) => a.unlikePost(ME, P1), (a: Api) => a.savePost(ME, P1), (a: Api) => a.unsavePost(ME, P1)]) {
      await assert.rejects(() => call(load(refuse)), /permission denied/);
    }
  });

  await test('offline every action stops at the offline check: no request is made, and the error says so', async () => {
    const log: Call[] = [];
    const api = load(ok, log, offline);
    for (const call of [
      () => api.likePost(ME, P1), () => api.unlikePost(ME, P1), () => api.savePost(ME, P1), () => api.unsavePost(ME, P1),
      () => api.recordPostShare(P1), () => api.listPostComments(P1), () => api.addPostComment({ id: 'c', userId: ME, postId: P1, body: 'hi' }),
    ]) {
      await assert.rejects(call, /offline/i);
    }
    assert.equal(log.length, 0, 'nothing went out');
  });

  /* ---------------- share ---------------- */

  await test('share: the rpc record_post_share with the post id, answering the new share_count', async () => {
    const log: Call[] = [];
    const n2 = await load(() => ({ data: 7, error: null }), log).recordPostShare(P1);
    assert.equal(n2, 7);
    assert.deepEqual(log, [{ op: 'rpc', rpc: 'record_post_share', args: { p_post_id: P1 }, filters: [] }]);
    assert.equal(await load(() => ({ data: 0, error: null })).recordPostShare(P1), 0, 'a real 0 is a real answer');
  });

  await test('share: an answer that is not a count is null (no number made up), and an error throws', async () => {
    for (const data of [null, undefined, 'x', -1, NaN, {}]) assert.equal(await load(() => ({ data, error: null })).recordPostShare(P1), null, String(data));
    await assert.rejects(() => load(() => ({ data: null, error: { message: 'Could not find the function public.record_post_share', code: 'PGRST202' } })).recordPostShare(P1), /record_post_share/);
  });

  /* ---------------- reactions of this pilgrim ---------------- */

  await test('my reactions: likes and bookmarks of these posts, only this pilgrim\'s, in two reads', async () => {
    const log: Call[] = [];
    const script: Script = (c) => ({ data: c.table === 'post_likes' ? [{ post_id: P1 }] : [{ post_id: P2 }, { post_id: P1 }], error: null });
    const r = await load(script, log).listMyReactions(ME, [P1, P2]);
    assert.deepEqual([...r.liked!], [P1]);
    assert.deepEqual([...r.saved!].sort(), [P1, P2]);
    assert.equal(log.length, 2);
    for (const c of log) {
      assert.equal(c.select, 'post_id');
      assert.deepEqual(c.filters, [['eq', 'user_id', ME], ['in', 'post_id', [P1, P2]]]);
    }
    assert.deepEqual(log.map((c) => c.table).sort(), ['post_likes', 'post_saves']);
  });

  await test('my reactions: no posts means no request; none liked is an empty set, which is not the same as unknown', async () => {
    const log: Call[] = [];
    const none = await load(ok, log).listMyReactions(ME, []);
    assert.deepEqual([none.liked!.size, none.saved!.size], [0, 0]);
    assert.equal(log.length, 0);
    const empty = await load(() => ({ data: [], error: null })).listMyReactions(ME, [P1]);
    assert.deepEqual([empty.liked!.size, empty.saved!.size], [0, 0]);
  });

  await test('my reactions: a row without a post id is skipped, so one odd row cannot mark a post', async () => {
    const r = await load(() => ({ data: [{ post_id: P1 }, { post_id: '' }, { post_id: 7 }, {}, null, 'row'], error: null })).listMyReactions(ME, [P1, P2]);
    assert.deepEqual([...r.liked!], [P1]);
  });

  await test('my reactions never throw: what could not be read is null for that kind only, and offline is null for both without a request', async () => {
    const half = await load((c) => (c.table === 'post_saves' ? { data: null, error: { message: 'boom' } } : { data: [{ post_id: P1 }], error: null })).listMyReactions(ME, [P1]);
    assert.deepEqual([...half.liked!], [P1]);
    assert.equal(half.saved, null);
    const thrown = await load(() => { throw new TypeError('Network request failed'); }).listMyReactions(ME, [P1]);
    assert.deepEqual(thrown, { liked: null, saved: null });
    const garbage = await load(() => ({ data: { not: 'a list' }, error: null })).listMyReactions(ME, [P1]);
    assert.deepEqual(garbage, { liked: null, saved: null });
    const log: Call[] = [];
    assert.deepEqual(await load(ok, log, offline).listMyReactions(ME, [P1]), { liked: null, saved: null });
    assert.equal(log.length, 0);
  });

  /* ---------------- comments ---------------- */

  const rows = [
    { id: 'c2', user_id: 'u2', body: 'Buen Camino!', created_at: '2026-11-05T13:00:00Z', author: { username: 'hannah', display_name: 'Hannah' } },
    { id: 'c1', user_id: 'u1', body: 'Golden light!', created_at: '2026-11-05T12:00:00Z', author: { username: 'lucas', display_name: 'Lucas' } },
  ];

  await test('comments: the latest 50 of one post, newest first, without deleted or hidden ones, with the author\'s name', async () => {
    const log: Call[] = [];
    const list = await load(() => ({ data: rows, error: null }), log).listPostComments(P1);
    assert.deepEqual(list.map((c) => c.id), ['c2', 'c1']);
    assert.equal(log.length, 1);
    assert.equal(log[0].table, 'post_comments');
    assert.equal(log[0].select, 'id, user_id, body, created_at, author:profiles(username, display_name)');
    assert.deepEqual(log[0].filters, [['eq', 'post_id', P1], ['is', 'deleted_at', null], ['eq', 'moderation_status', 'ok']]);
    assert.deepEqual(log[0].order, ['created_at', { ascending: false }]);
    assert.equal(log[0].limit, 50);
  });

  await test('comments: a failing read throws, and so does an answer that is not a list; an empty thread is an empty list', async () => {
    await assert.rejects(() => load(() => ({ data: null, error: { message: 'permission denied' } })).listPostComments(P1), /permission denied/);
    await assert.rejects(() => load(() => ({ data: { x: 1 }, error: null })).listPostComments(P1), /Could not read the comments/);
    assert.deepEqual(await load(() => ({ data: [], error: null })).listPostComments(P1), []);
  });

  await test('add comment: one insert as this pilgrim with the app\'s own id, so the same comment sent twice is one comment', async () => {
    const log: Call[] = [];
    await load(ok, log).addPostComment({ id: 'c9', userId: ME, postId: P1, body: 'Ultreia!' });
    assert.equal(log.length, 1);
    assert.equal(log[0].op, 'insert');
    assert.equal(log[0].table, 'post_comments');
    const row = log[0].row as Record<string, unknown>;
    assert.deepEqual(Object.keys(row).sort(), ['body', 'client_created_at', 'id', 'post_id', 'user_id']);
    assert.equal(row.id, 'c9');
    assert.equal(row.post_id, P1);
    assert.equal(row.user_id, ME);
    assert.equal(row.body, 'Ultreia!');
    assert.ok(!Number.isNaN(Date.parse(String(row.client_created_at))));
    // "already there" (a retry of the same comment) is a success; anything else is an error
    await load(() => ({ data: null, error: { message: 'duplicate key value violates unique constraint "post_comments_pkey"', code: '23505' } })).addPostComment({ id: 'c9', userId: ME, postId: P1, body: 'Ultreia!' });
    await assert.rejects(() => load(() => ({ data: null, error: { message: 'new row violates row-level security policy', code: '42501' } })).addPostComment({ id: 'c9', userId: ME, postId: P1, body: 'x' }), /row-level security/);
  });

  console.log(`\n${n} passed`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
