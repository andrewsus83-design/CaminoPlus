// The posts query of the Me tab against a database that may not have the newest columns. Run: npm run test:me
//
// CI always builds the schema from every migration, so it cannot tell when the LIVE database is behind: a query that
// names save_count or share_count passes there and then fails for everybody until the migration is applied (that is how
// profiles.friends_count once broke sign-in). So this runs the real listMyPosts from src/lib/api.ts against a scripted
// stand-in for Supabase that behaves like the live database BEFORE the migration (naming a missing column is an error),
// after it, and when the network drops between the two queries. api.ts is read from its source and compiled in memory
// (plain node cannot import it as it is: it pulls in React Native); only ./supabase, ./net and ./uuid are replaced.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

type Call = { table: string; select: string | null; filters: unknown[][] };
type Answer = { data?: unknown; error?: { message: string } | null };
type Script = (call: Call) => Answer | Promise<Answer>;
type Api = { listMyPosts(userId: string): Promise<Record<string, unknown>[]>; listPostEngagement(ids: string[]): Promise<Map<string, unknown> | null> };

const compile = (file: string) =>
  ts.transpileModule(fs.readFileSync(path.join(process.cwd(), file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const run = (code: string, req: (id: string) => unknown) => {
  const m = { exports: {} as Record<string, unknown> };
  new Function('exports', 'require', 'module', code)(m.exports, req, m);
  return m.exports;
};

// A query builder that answers like Supabase: chain anything, await the result.
function client(script: Script, log: Call[]) {
  return {
    from(table: string) {
      const call: Call = { table, select: null, filters: [] };
      log.push(call);
      const b = {
        select(cols: string) { call.select = cols; return b; },
        eq(...a: unknown[]) { call.filters.push(['eq', ...a]); return b; },
        neq(...a: unknown[]) { call.filters.push(['neq', ...a]); return b; },
        is(...a: unknown[]) { call.filters.push(['is', ...a]); return b; },
        in(...a: unknown[]) { call.filters.push(['in', ...a]); return b; },
        order() { return b; },
        limit() { return b; },
        then(res: (v: unknown) => unknown, rej: (e: unknown) => unknown) { return Promise.resolve().then(() => script(call)).then(res, rej); },
      };
      return b;
    },
  };
}

const nothing = () => { throw new Error('this file imports nothing'); };
const postEngagement = run(compile('src/lib/postEngagement.ts'), nothing);
const engagement = run(compile('src/lib/engagement.ts'), nothing);
const postComments = run(compile('src/lib/postComments.ts'), nothing);
const apiCode = compile('src/lib/api.ts');
const load = (script: Script, log: Call[] = [], net: { assertOnline(): Promise<void> } = { assertOnline: async () => {} }) =>
  run(apiCode, (id) => {
    if (id === './supabase') return { supabase: client(script, log) };
    if (id === './net') return net;
    if (id === './uuid') return { uuid: () => 'id' };
    if (id === './postEngagement') return postEngagement;
    if (id === './engagement') return engagement;
    if (id === './postComments') return postComments;
    // the one storage module (uploads and links of photos); the posts query does not touch it
    if (id === './mediaStorage') return { MEDIA_BUCKET: { userMedia: 'user-media', avatars: 'avatars' }, upload: nothing, signedUrls: nothing, deleteMedia: nothing };
    throw new Error(`api.ts imports ${id}: add it to this test`);
  }) as unknown as Api;

const NEW_COLUMNS = /save_count|share_count/;
const POSTS = [
  { id: 'p1', body: 'Day 1', place_name: 'Roncesvalles', published_at: '2026-11-05T10:00:00Z', like_count: 12, comment_count: 3, media_count: 0, health_summary: null },
  { id: 'p2', body: 'Day 2', place_name: 'Zubiri', published_at: '2026-11-06T10:00:00Z', like_count: 0, comment_count: 0, media_count: 1, health_summary: null },
];
const asksForCounts = (c: Call) => NEW_COLUMNS.test(c.select ?? '');
// the live database today: the migration is not applied, so naming either column is an error
const before: Script = (c) => (asksForCounts(c) ? { data: null, error: { message: 'column posts.save_count does not exist' } } : { data: POSTS, error: null });
// the database once the migration is applied
const after: Script = (c) => (asksForCounts(c)
  ? { data: [{ id: 'p1', save_count: 4, share_count: 2 }, { id: 'p2', save_count: 0, share_count: 0 }], error: null }
  : { data: POSTS, error: null });
const bare = (p: Record<string, unknown>) => !('save_count' in p) && !('share_count' in p);

let n = 0;
const test = async (name: string, fn: () => Promise<void>) => {
  await fn();
  n++;
  console.log(`ok ${n} - ${name}`);
};

(async () => {
  await test('before the migration the posts still load, with likes and comments and no made-up counts', async () => {
    const log: Call[] = [];
    const posts = await load(before, log).listMyPosts('u1');
    assert.deepEqual(posts.map((p) => p.like_count), [12, 0]);
    assert.equal(posts.length, 2);
    assert.ok(posts.every(bare), 'no save_count or share_count at all, not even 0');
  });

  await test('the posts query never names the new columns; they have a query of their own', async () => {
    const log: Call[] = [];
    await load(before, log).listMyPosts('u1');
    assert.equal(log.length, 2);
    assert.equal(log[0].select, 'id, body, place_name, published_at, like_count, comment_count, media_count, health_summary');
    assert.ok(!asksForCounts(log[0]));
    assert.equal(log[1].select, 'id, save_count, share_count');
    assert.deepEqual(log[1].filters, [['in', 'id', ['p1', 'p2']]]);
  });

  await test('after the migration both counts are merged, and a real 0 stays 0', async () => {
    const posts = await load(after).listMyPosts('u1');
    assert.deepEqual(posts.map((p) => [p.id, p.save_count, p.share_count]), [['p1', 4, 2], ['p2', 0, 0]]);
    assert.equal(posts[0].like_count, 12);
    assert.equal(posts[1].media_count, 1);
  });

  await test('if the network drops before the counts query, the posts load without counts', async () => {
    const thrown = load((c) => { if (asksForCounts(c)) throw new TypeError('Network request failed'); return { data: POSTS, error: null }; });
    assert.ok((await thrown.listMyPosts('u1')).every(bare));
    const rejected = load((c) => (asksForCounts(c) ? Promise.reject(new Error('boom')) : { data: POSTS, error: null }));
    assert.ok((await rejected.listMyPosts('u1')).every(bare));
  });

  await test('an answer with no rows to read leaves the posts as they are', async () => {
    for (const answer of [{ data: null, error: null }, { data: undefined, error: null }, { data: 'nope', error: null }, { data: {}, error: null }]) {
      const posts = await load((c) => (asksForCounts(c) ? answer : { data: POSTS, error: null })).listMyPosts('u1');
      assert.ok(posts.every(bare), JSON.stringify(answer));
    }
  });

  await test('rows that are not sane give nothing: a null count, a row for a post that is not in the list', async () => {
    const posts = await load((c) => (asksForCounts(c)
      ? { data: [{ id: 'p1', save_count: null, share_count: 1 }, { id: 'p2', save_count: 3, share_count: 1 }, { id: 'ghost', save_count: 9, share_count: 9 }], error: null }
      : { data: POSTS, error: null })).listMyPosts('u1');
    assert.equal(posts.length, 2);
    assert.ok(bare(posts[0]));
    assert.deepEqual([posts[1].save_count, posts[1].share_count], [3, 1]);
  });

  await test('no posts means no second query', async () => {
    const log: Call[] = [];
    assert.deepEqual(await load(() => ({ data: [], error: null }), log).listMyPosts('u1'), []);
    assert.equal(log.length, 1);
  });

  await test('listPostEngagement never throws: null when the counts are unavailable, an empty map for no ids', async () => {
    assert.equal(await load(before).listPostEngagement(['a']), null);
    assert.equal(await load(() => { throw new Error('sync boom'); }).listPostEngagement(['a']), null);
    const none = await load(before).listPostEngagement([]);
    assert.ok(none instanceof Map && none.size === 0);
  });

  await test('what worked before still does: a failing posts query throws, and so does being offline', async () => {
    await assert.rejects(() => load(() => ({ data: null, error: { message: 'permission denied' } })).listMyPosts('u1'), /permission denied/);
    await assert.rejects(() => load(after, [], { assertOnline: async () => { throw new Error('You are offline.'); } }).listMyPosts('u1'), /offline/);
  });

  console.log(`\n${n} passed`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
