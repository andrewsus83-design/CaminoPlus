// Plain-node checks of the private diary: what is stored and how it is read (never a throw, never a guess), the limits, writes
// that take turns, the key that survives signing out but not deleting the account, the autosave of the editor with a clock the
// test controls, and the words. No React Native. Run: npm run test:diary
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { AUTOSAVE_MS, createPageSaver, type SaverDeps, type SaverView } from '../autosave';
import { EMPTY_CARD_LINE, PRIVACY_LINE, UNTITLED, clip, dateLine, firstLine, pagePreview, pageTitle, pagesLabel, problemMessage, thousands } from '../present';
import { BODY_MAX, ENTRIES_MAX, TITLE_MAX, createDiaryStore, diaryKey, isEntry, newId, pagesOf, type DiaryEntry, type DiaryStorage, type SaveResult } from '../store';

let n = 0;
// A test that never finishes must fail, not end the process quietly (node exits when nothing is pending, with code 0).
const test = async (name: string, fn: () => Promise<void> | void) => {
  await Promise.race([Promise.resolve().then(fn), new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`"${name}" did not finish in 5 s`)), 5000))]);
  n += 1;
  console.log(`ok   ${name}`);
};
const root = process.cwd(); // npm test runs from mobile/
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const settle = () => new Promise<void>((r) => setImmediate(r));

const UID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

/* ------------------------------------------------------------------ a stand-in for the phone's key-value store */

type Op = 'get' | 'set' | 'remove';
type FakeOpts = {
  /** Milliseconds one call takes, by operation and by how many calls of that kind there were (1-based). */
  latency?: (op: Op, call: number) => number;
  /** Operations that throw (lib/localStore.ts never does; the diary must not depend on that). */
  throwOn?: Op[];
  /** setJSON calls (1-based) that fail by answering false, like a full disk. */
  failSets?: number[];
  /** A file that does not parse throws, instead of answering null like lib/localStore.ts does. */
  throwOnCorrupt?: boolean;
};

// Values are kept as JSON text, as on the phone, so what is stored is what was serialized and nothing is shared by reference.
function fake(opts: FakeOpts = {}) {
  const files = new Map<string, string>();
  const calls = { get: 0, set: 0, remove: 0 };
  const take = async (op: Op) => {
    calls[op] += 1;
    const call = calls[op];
    const ms = opts.latency?.(op, call) ?? 0;
    await (ms > 0 ? sleep(ms) : Promise.resolve());
    if (opts.throwOn?.includes(op)) throw new Error(`${op} failed`);
    return call;
  };
  const storage: DiaryStorage = {
    async getJSON<T>(key: string) {
      await take('get');
      const text = files.get(key);
      if (text === undefined) return null;
      try { return JSON.parse(text) as T; } catch { if (opts.throwOnCorrupt) throw new Error('corrupt'); return null; }
    },
    async setJSON(key, value) {
      const call = await take('set');
      if (opts.failSets?.includes(call)) return false;
      files.set(key, JSON.stringify(value));
      return true;
    },
    async remove(key) {
      await take('remove');
      files.delete(key);
    },
  };
  return {
    storage, files, calls,
    seed: (key: string, value: unknown) => { files.set(key, JSON.stringify(value)); },
    seedText: (key: string, text: string) => { files.set(key, text); },
    stored: (key: string): unknown => { const t = files.get(key); return t === undefined ? undefined : JSON.parse(t); },
  };
}

const page = (id: string, createdAt: string, over: Partial<DiaryEntry> = {}): DiaryEntry => ({ id, createdAt, updatedAt: createdAt, title: '', body: `text of ${id}`, ...over });
const day = (d: number) => new Date(Date.UTC(2026, 10, d, 12, 0, 0)).toISOString();

const GOOD = page('g1', day(1), { title: 'Roncesvalles', body: 'Cold and clear.' });

(async () => {
  /* ---------------------------------------------------------------- the key */

  await test('the diary key never starts with u.: signing out wipes u.<id>.… and cannot touch it', () => {
    for (const uid of [UID, OTHER, 'u', 'u.', 'u.abc', 'abc', '0']) {
      const key = diaryKey(uid);
      assert.ok(!key.startsWith('u.'), key);
      assert.ok(key.startsWith('diary.') && key.endsWith(uid), key);
    }
    assert.notEqual(diaryKey(UID), diaryKey(OTHER), 'each account has its own key');
  });

  await test('a new page id is a fresh uuid every time', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newId()));
    assert.equal(ids.size, 200);
    for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  /* ---------------------------------------------------------------- reading what is there */

  await test('nothing stored, or something that is not a version 1 diary: an empty list, never an error, and nothing is written', async () => {
    const odd: [string, unknown][] = [
      ['text', 'hello'], ['a number', 42], ['true', true], ['a list', []], ['a list of pages', [GOOD]], ['an empty object', {}],
      ['no entries', { v: 1 }], ['entries that is not a list', { v: 1, entries: 'x' }], ['entries that is an object', { v: 1, entries: {} }],
      ['a version that is text', { v: '1', entries: [GOOD] }], ['a newer version', { v: 2, entries: [GOOD] }], ['version 0', { v: 0, entries: [GOOD] }], ['no version', { entries: [GOOD] }],
    ];
    for (const [what, value] of odd) {
      const f = fake();
      f.seed(diaryKey(UID), value);
      const before = f.files.get(diaryKey(UID));
      assert.deepEqual(await createDiaryStore(f.storage).loadEntries(UID), [], what);
      assert.equal(f.files.get(diaryKey(UID)), before, `${what}: a read must not change what is stored`);
      assert.equal(f.calls.set + f.calls.remove, 0, `${what}: a read must not write`);
    }
    const none = fake();
    assert.deepEqual(await createDiaryStore(none.storage).loadEntries(UID), []);
    assert.equal(none.files.size, 0);
  });

  await test('corrupt JSON reads as an empty diary: with lib/localStore.ts (null) and with a storage that throws', async () => {
    const corrupt = '{"v":1,"entries":[{"id":"a"';
    const quiet = fake();
    quiet.seedText(diaryKey(UID), corrupt);
    assert.deepEqual(await createDiaryStore(quiet.storage).loadEntries(UID), []);
    assert.equal(quiet.files.get(diaryKey(UID)), corrupt, 'the damaged file is still there');

    const loud = fake({ throwOnCorrupt: true });
    loud.seedText(diaryKey(UID), corrupt);
    assert.deepEqual(await createDiaryStore(loud.storage).loadEntries(UID), []);
    assert.equal(loud.files.get(diaryKey(UID)), corrupt);
  });

  await test('a storage that throws: a read shows nothing, a save or a delete says it did not happen, and nothing is written', async () => {
    const f = fake({ throwOn: ['get'] });
    f.seed(diaryKey(UID), { v: 1, entries: [GOOD] });
    const before = f.files.get(diaryKey(UID));
    const store = createDiaryStore(f.storage);
    assert.deepEqual(await store.loadEntries(UID), []);
    assert.deepEqual(await store.saveEntry(UID, page('p', day(2))), { ok: false, reason: 'not-saved' });
    assert.equal(await store.deleteEntry(UID, 'g1'), false);
    assert.equal(f.files.get(diaryKey(UID)), before, 'what could not be read is not overwritten');
    assert.equal(f.calls.set, 0);

    const w = fake({ throwOn: ['set'] });
    assert.deepEqual(await createDiaryStore(w.storage).saveEntry(UID, page('p', day(2))), { ok: false, reason: 'not-saved' });
    const r = fake({ throwOn: ['remove'] });
    await createDiaryStore(r.storage).clearDiary(UID); // does not throw
  });

  await test('a value that cannot be read is not overwritten by a read, a delete or a refused page; the first page written replaces it', async () => {
    const f = fake();
    f.seed(diaryKey(UID), { v: 2, entries: [{ id: 'later', body: { blocks: ['rich text of a newer app'] } }] });
    const before = f.files.get(diaryKey(UID));
    const store = createDiaryStore(f.storage);
    assert.deepEqual(await store.loadEntries(UID), []);
    assert.equal(await store.deleteEntry(UID, 'later'), true, 'there is nothing readable to delete');
    assert.deepEqual(await store.saveEntry(UID, page('big', day(2), { body: 'x'.repeat(BODY_MAX + 1) })), { ok: false, reason: 'body-too-long' });
    assert.equal(f.files.get(diaryKey(UID)), before, 'untouched until a page is really written');
    assert.deepEqual(await store.saveEntry(UID, page('first', day(3))), { ok: true });
    assert.deepEqual(f.stored(diaryKey(UID)), { v: 1, entries: [page('first', day(3))] });
  });

  await test('items of a good diary that do not read as pages are not shown, and are kept when the others are saved or deleted', async () => {
    const f = fake();
    const junk = [null, 'x', 7, { id: 5 }, { id: 'no-text', createdAt: day(1), updatedAt: day(1) }, { ...GOOD, id: 'bad-date', createdAt: 'yesterday' }, { ...GOOD, id: '' }];
    const newer = { ...GOOD, id: 'g2', createdAt: day(2), updatedAt: day(2), mood: 'grateful' }; // a field of a newer app
    f.seed(diaryKey(UID), { v: 1, entries: [GOOD, ...junk, newer] });
    const store = createDiaryStore(f.storage);
    assert.deepEqual((await store.loadEntries(UID)).map((e) => e.id), ['g2', 'g1']);

    assert.deepEqual(await store.saveEntry(UID, page('g3', day(3))), { ok: true });
    const raw = (f.stored(diaryKey(UID)) as { entries: unknown[] }).entries;
    assert.equal(raw.length, 1 + junk.length + 1 + 1, 'nothing was dropped');
    assert.deepEqual(raw.slice(1, 1 + junk.length), junk);

    // saving a page over one that a newer app wrote keeps that app's extra fields
    assert.deepEqual(await store.saveEntry(UID, { ...newer, body: 'edited' } as DiaryEntry), { ok: true });
    const again = (f.stored(diaryKey(UID)) as { entries: Record<string, unknown>[] }).entries.find((e) => e && e.id === 'g2');
    assert.equal(again?.mood, 'grateful');
    assert.equal(again?.body, 'edited');

    assert.equal(await store.deleteEntry(UID, 'g1'), true);
    const left = (f.stored(diaryKey(UID)) as { entries: unknown[] }).entries;
    assert.deepEqual(left.slice(0, junk.length), junk, 'the unreadable items are still there after a delete');
  });

  await test('the same id twice in a stored list shows one page', async () => {
    const f = fake();
    f.seed(diaryKey(UID), { v: 1, entries: [GOOD, { ...GOOD, body: 'copy' }] });
    const list = await createDiaryStore(f.storage).loadEntries(UID);
    assert.equal(list.length, 1);
    assert.equal(list[0].body, GOOD.body);
  });

  /* ---------------------------------------------------------------- insert, update, delete, order */

  await test('save inserts, saving the same id updates it in place, delete removes it, and the list is newest first', async () => {
    const f = fake();
    const store = createDiaryStore(f.storage);
    assert.deepEqual(await store.saveEntry(UID, page('b', day(2))), { ok: true });
    assert.deepEqual(await store.saveEntry(UID, page('c', day(3))), { ok: true });
    assert.deepEqual(await store.saveEntry(UID, page('a', day(1))), { ok: true });
    assert.deepEqual((await store.loadEntries(UID)).map((e) => e.id), ['c', 'b', 'a']);

    // an edit changes the text and updatedAt, not the place in the list (the day it was begun)
    assert.deepEqual(await store.saveEntry(UID, { ...page('a', day(1)), title: 'Day one', body: 'edited', updatedAt: day(9) }), { ok: true });
    const list = await store.loadEntries(UID);
    assert.deepEqual(list.map((e) => e.id), ['c', 'b', 'a']);
    assert.deepEqual(list[2], { id: 'a', createdAt: day(1), updatedAt: day(9), title: 'Day one', body: 'edited' });
    assert.equal((f.stored(diaryKey(UID)) as { entries: unknown[] }).entries.length, 3);

    assert.equal(await store.deleteEntry(UID, 'b'), true);
    assert.deepEqual((await store.loadEntries(UID)).map((e) => e.id), ['c', 'a']);
    assert.equal(await store.deleteEntry(UID, 'b'), true, 'deleting what is not there is not an error');
    assert.equal(await store.deleteEntry(UID, 'nope'), true);
    assert.deepEqual((await store.loadEntries(UID)).map((e) => e.id), ['c', 'a']);
  });

  await test('the order is by the moment a page was begun, not by how its date is written; equal moments keep a fixed order', () => {
    const a = page('a', '2026-11-04T23:00:00-05:00'); // 04:00 UTC on the 5th
    const b = page('b', '2026-11-05T01:00:00Z');
    assert.deepEqual(pagesOf([b, a]).map((e) => e.id), ['a', 'b'], 'a later instant first, although its text sorts earlier');
    const tie = pagesOf([page('x', day(1)), page('z', day(1)), page('y', day(1))]).map((e) => e.id);
    assert.deepEqual(tie, pagesOf([page('z', day(1)), page('y', day(1)), page('x', day(1))]).map((e) => e.id));
  });

  await test('a page that does not read as one is refused, not stored', async () => {
    const f = fake();
    const store = createDiaryStore(f.storage);
    const bad = [{ ...GOOD, id: '' }, { ...GOOD, createdAt: 'soon' }, { ...GOOD, updatedAt: 3 }, { ...GOOD, title: null }, { ...GOOD, body: undefined }];
    for (const entry of bad) assert.deepEqual(await store.saveEntry(UID, entry as unknown as DiaryEntry), { ok: false, reason: 'not-saved' });
    assert.deepEqual(await store.saveEntry('', GOOD), { ok: false, reason: 'not-saved' }, 'no person, no diary');
    assert.equal(f.files.size, 0);
    assert.deepEqual(await store.loadEntries(''), []);
    assert.ok(isEntry(GOOD) && !isEntry(null) && !isEntry('x'));
  });

  /* ---------------------------------------------------------------- limits */

  await test('a page holds up to 20,000 characters: exactly that many is saved whole, one more is refused and nothing is stored', async () => {
    const f = fake();
    const store = createDiaryStore(f.storage);
    const full = 'é'.repeat(BODY_MAX);
    assert.deepEqual(await store.saveEntry(UID, page('full', day(1), { body: full })), { ok: true });
    assert.equal((await store.loadEntries(UID))[0].body.length, BODY_MAX);
    const before = f.files.get(diaryKey(UID));
    assert.deepEqual(await store.saveEntry(UID, page('over', day(2), { body: `${full}x` })), { ok: false, reason: 'body-too-long' });
    assert.deepEqual(await store.saveEntry(UID, page('full', day(1), { body: `${full}x` })), { ok: false, reason: 'body-too-long' }, 'an update too');
    assert.equal(f.files.get(diaryKey(UID)), before);
  });

  await test('a title holds up to 120 characters', async () => {
    const store = createDiaryStore(fake().storage);
    assert.deepEqual(await store.saveEntry(UID, page('t', day(1), { title: 't'.repeat(TITLE_MAX) })), { ok: true });
    assert.deepEqual(await store.saveEntry(UID, page('u', day(1), { title: 't'.repeat(TITLE_MAX + 1) })), { ok: false, reason: 'title-too-long' });
  });

  await test('a person keeps up to 2,000 pages: the next new page is refused, a page already there can still be edited, deleting makes room', async () => {
    const f = fake();
    const entries = Array.from({ length: ENTRIES_MAX }, (_, i) => page(`p${i}`, new Date(Date.UTC(2020, 0, 1) + i * 60_000).toISOString()));
    f.seed(diaryKey(UID), { v: 1, entries });
    const store = createDiaryStore(f.storage);
    assert.equal((await store.loadEntries(UID)).length, ENTRIES_MAX);
    assert.deepEqual(await store.saveEntry(UID, page('one-too-many', day(1))), { ok: false, reason: 'too-many-pages' });
    assert.equal((f.stored(diaryKey(UID)) as { entries: unknown[] }).entries.length, ENTRIES_MAX);
    assert.deepEqual(await store.saveEntry(UID, { ...entries[7], body: 'still editable' }), { ok: true });
    assert.equal(await store.deleteEntry(UID, 'p0'), true);
    assert.deepEqual(await store.saveEntry(UID, page('now-there-is-room', day(1))), { ok: true });
    assert.equal((await store.loadEntries(UID)).length, ENTRIES_MAX);
    assert.match(problemMessage('too-many-pages'), /2,000 pages/);
  });

  /* ---------------------------------------------------------------- writes take turns */

  await test('two saves at once both survive, however slowly each one reads (a promise queue around read-modify-write)', async () => {
    // The first read takes 25 ms and the second 1 ms: without taking turns the second page is written first and then lost.
    const f = fake({ latency: (op, call) => (op === 'get' ? (call === 1 ? 25 : 1) : 0) });
    const store = createDiaryStore(f.storage);
    await Promise.all([store.saveEntry(UID, page('a', day(1))), store.saveEntry(UID, page('b', day(2)))]);
    assert.deepEqual((await store.loadEntries(UID)).map((e) => e.id), ['b', 'a']);
  });

  await test('forty quick saves at mixed speeds lose nothing, and a save of one page twice ends with the later text', async () => {
    const f = fake({ latency: (op, call) => (op === 'get' ? (call % 7) * 2 : op === 'set' ? call % 3 : 0) });
    const store = createDiaryStore(f.storage);
    const results = await Promise.all(Array.from({ length: 40 }, (_, i) => store.saveEntry(UID, page(`p${i}`, new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString()))));
    assert.ok(results.every((r) => r.ok));
    assert.equal((await store.loadEntries(UID)).length, 40);
    await Promise.all([store.saveEntry(UID, page('p3', day(1), { body: 'first' })), store.saveEntry(UID, page('p3', day(1), { body: 'second' }))]);
    assert.equal((await store.loadEntries(UID)).find((e) => e.id === 'p3')?.body, 'second');
  });

  await test('a read asked right after a save sees it, and a clear or delete asked after a save comes after it', async () => {
    const f = fake({ latency: (op) => (op === 'set' ? 15 : 0) });
    const store = createDiaryStore(f.storage);
    void store.saveEntry(UID, page('a', day(1)));
    assert.deepEqual((await store.loadEntries(UID)).map((e) => e.id), ['a'], 'the list opened right after Back shows the page written by Back');

    void store.saveEntry(UID, page('b', day(2)));
    void store.deleteEntry(UID, 'a');
    assert.deepEqual((await store.loadEntries(UID)).map((e) => e.id), ['b']);

    void store.saveEntry(UID, page('c', day(3)));
    await store.clearDiary(UID);
    assert.equal(f.files.has(diaryKey(UID)), false, 'cleared after the pending save, not before it');
    void store.clearDiary(UID);
    await store.saveEntry(UID, page('d', day(4)));
    assert.deepEqual((await store.loadEntries(UID)).map((e) => e.id), ['d']);
  });

  await test('a write that fails does not stop the ones after it', async () => {
    const f = fake({ failSets: [1] });
    const store = createDiaryStore(f.storage);
    assert.deepEqual(await store.saveEntry(UID, page('a', day(1))), { ok: false, reason: 'not-saved' });
    assert.deepEqual(await store.saveEntry(UID, page('a', day(1))), { ok: true });
    assert.deepEqual((await store.loadEntries(UID)).map((e) => e.id), ['a']);
  });

  /* ---------------------------------------------------------------- one account, another account, signing out, deleting */

  await test('another account on the same phone never sees the pages, and cannot change them', async () => {
    const f = fake();
    const store = createDiaryStore(f.storage);
    await store.saveEntry(UID, page('mine', day(1)));
    assert.deepEqual(await store.loadEntries(OTHER), []);
    await store.saveEntry(OTHER, page('theirs', day(2)));
    assert.equal(await store.deleteEntry(OTHER, 'mine'), true);
    await store.clearDiary(OTHER);
    assert.deepEqual((await store.loadEntries(UID)).map((e) => e.id), ['mine']);
    assert.deepEqual(await store.loadEntries(OTHER), []);
  });

  // lib/auth.tsx signOut runs localStore.remove(u.<id>.account) and clearUserData(id) = removeByPrefix(`u.${id}.`). On the web a
  // key is stored as `kv:<key>` and removed when it starts with the prefix; on a phone each key is a file `<safe(key)>.json`
  // and a file is removed when its name starts with safe(prefix). Both are re-enacted here (and their source is checked below).
  const safe = (k: string) => k.replace(/[^A-Za-z0-9._-]/g, '_');
  type Wipe = (files: Map<string, string>, prefix: string) => void;
  const wipeWeb: Wipe = (files, prefix) => { for (const k of [...files.keys()]) if (k.startsWith(prefix)) files.delete(k); };
  const wipePhone: Wipe = (files, prefix) => { for (const k of [...files.keys()]) if (`${safe(k)}.json`.startsWith(safe(prefix))) files.delete(k); };

  for (const [where, wipe] of [['on the web', wipeWeb], ['on a phone', wipePhone]] as [string, Wipe][]) {
    await test(`signing out ${where} wipes the account's u.<id>.… keys and leaves the diary; signing in again shows it; deleting the account removes it`, async () => {
      const f = fake();
      const store = createDiaryStore(f.storage);
      await store.saveEntry(UID, page('mine', day(1), { body: 'Hontanas' }));
      await store.saveEntry(OTHER, page('theirs', day(2)));
      for (const key of [`u.${UID}.account`, `u.${UID}.me`, `u.${UID}.places.stage`, `u.${OTHER}.account`, 'theme-scheme']) f.seed(key, { cached: true });

      // signOut for UID
      f.files.delete(`u.${UID}.account`);
      wipe(f.files, `u.${UID}.`);
      assert.deepEqual([...f.files.keys()].filter((k) => k.startsWith(`u.${UID}.`)), [], 'everything cached for the account is gone');
      assert.ok(f.files.has(`u.${OTHER}.account`) && f.files.has('theme-scheme'), 'other accounts and settings are not touched');
      assert.deepEqual((await store.loadEntries(UID)).map((e) => e.body), ['Hontanas'], 'the diary survives signing out');
      assert.deepEqual((await store.loadEntries(OTHER)).map((e) => e.id), ['theirs']);

      // signed in again later: the same pages
      assert.equal((await store.loadEntries(UID))[0].id, 'mine');

      // deleting the account
      await store.clearDiary(UID);
      assert.deepEqual(await store.loadEntries(UID), []);
      assert.equal(f.files.has(diaryKey(UID)), false);
      assert.deepEqual((await store.loadEntries(OTHER)).map((e) => e.id), ['theirs'], "another account's diary stays");
      assert.ok(f.files.has('theme-scheme'));
    });
  }

  await test('clearDiary removes the diary whatever is stored there, also what cannot be read, and is quiet when there is none', async () => {
    const f = fake();
    f.seed(diaryKey(UID), { v: 9, entries: 'from the future' });
    const store = createDiaryStore(f.storage);
    await store.clearDiary(UID);
    assert.equal(f.files.has(diaryKey(UID)), false);
    await store.clearDiary(UID);
    await store.clearDiary('');
  });

  await test('signing out leaves the diary alone (lib/auth.tsx) and the wipe only takes u.<id>.… keys (lib/localStore.ts)', () => {
    const auth = read('src/lib/auth.tsx');
    assert.doesNotMatch(auth, /diary/i, 'auth.tsx must not know about the diary: signing out never deletes it');
    const signOut = /signOut: async \(\) => \{[\s\S]*?\n    \},/.exec(auth)?.[0] ?? '';
    assert.match(signOut, /localStore\.remove\(accountKey\(uid\)\)/);
    assert.match(signOut, /clearUserData\(uid\)/);
    assert.doesNotMatch(signOut, /removeByPrefix|clearDiary|diary/);
    const store = read('src/lib/localStore.ts');
    assert.match(store, /export const userKey = \(uid: string, name: string\) => `u\.\$\{uid\}\.\$\{name\}`;/);
    assert.match(store, /export const clearUserData = \(uid: string\) => localStore\.removeByPrefix\(`u\.\$\{uid\}\.`\);/);
    assert.match(store, /const safe = \(k: string\) => k\.replace\(\/\[\^A-Za-z0-9\._-\]\/g, '_'\);/, 'the file-name rule this test re-enacts');
    assert.match(store, /entry\.name\.startsWith\(want\)/);
    assert.match(store, /k\.startsWith\(`kv:\$\{prefix\}`\)/);
  });

  /* ---------------------------------------------------------------- the words */

  await test('a page is called by its title, else the first line of its text, else "Untitled page"', () => {
    assert.equal(pageTitle({ title: 'Roncesvalles', body: 'Cold.' }), 'Roncesvalles');
    assert.equal(pageTitle({ title: '  Day   one \n', body: 'x' }), 'Day one');
    assert.equal(pageTitle({ title: '', body: '\n\n  We walked   in the rain.\nThen it cleared.' }), 'We walked in the rain.');
    assert.equal(pageTitle({ title: '   ', body: '  \n ' }), UNTITLED);
    assert.equal(pageTitle({ title: '', body: '' }), 'Untitled page');
    assert.equal(firstLine('\n \n second\nthird'), 'second');
    assert.ok(pageTitle({ title: 'w'.repeat(500), body: '' }).length <= 100);
  });

  await test('the preview is the text as one paragraph, never says the first line twice, and is short', () => {
    assert.equal(pagePreview({ title: 'Title', body: 'One.\nTwo.\n\nThree.' }), 'One. Two. Three.');
    assert.equal(pagePreview({ title: '', body: 'One.\nTwo.\n\nThree.' }), 'Two. Three.', 'the first line is already the name');
    assert.equal(pagePreview({ title: '', body: 'Only one line' }), '');
    assert.equal(pagePreview({ title: '', body: '' }), '');
    assert.ok(pagePreview({ title: 'T', body: 'word '.repeat(5000) }).length <= 200);
  });

  await test('text is cut with an ellipsis and never in the middle of an emoji', () => {
    assert.equal(clip('short', 10), 'short');
    assert.equal(clip('abcdefghij', 10), 'abcdefghij');
    assert.equal(clip('abcdefghijk', 10), 'abcdefghi…');
    const cut = clip(`aaaaa🙏bbb`, 7); // the pair sits across the cut
    assert.equal(cut, 'aaaaa…');
    for (let max = 2; max < 12; max++) assert.doesNotMatch(clip('🙏🙏🙏🙏🙏🙏🙏🙏🙏', max), /[\ud800-\udbff](?![\udc00-\udfff])…?$|^[\udc00-\udfff]/);
  });

  await test('the date reads "Tuesday 4 November", with the year only when it is not this year, and is empty when it does not read', () => {
    const at = (y: number, m: number, d: number) => new Date(y, m, d, 21, 30).toISOString(); // local time: the phone's own day
    assert.equal(dateLine(at(2025, 10, 4), new Date(2025, 11, 1)), 'Tuesday 4 November');
    assert.equal(dateLine(at(2025, 10, 4), new Date(2026, 0, 2)), 'Tuesday 4 November 2025');
    assert.equal(dateLine(at(2026, 10, 1), new Date(2026, 10, 7)), 'Sunday 1 November');
    assert.equal(dateLine(at(2026, 0, 31), new Date(2026, 10, 7)), 'Saturday 31 January');
    assert.equal(dateLine('not a date'), '');
    assert.equal(dateLine(''), '');
  });

  await test('the words: counts, thousands, the honest line, the empty card, and a gentle message for every problem', () => {
    assert.deepEqual([0, 1, 2, 3].map(pagesLabel), ['0 pages', '1 page', '2 pages', '3 pages']);
    assert.deepEqual([0, 999, 1000, 20000, 1234567].map(thousands), ['0', '999', '1,000', '20,000', '1,234,567']);
    assert.equal(PRIVACY_LINE, 'Only on this phone. Not uploaded, not shared. If you delete the app or lose this phone, these pages are gone.');
    assert.equal(EMPTY_CARD_LINE, 'Your diary is empty. Tap the pen to write the first page.');
    for (const p of ['body-too-long', 'title-too-long', 'too-many-pages', 'not-saved'] as const) {
      const text = problemMessage(p);
      assert.ok(text.length > 20 && /\.$/.test(text) && !/error|fail|invalid|exception/i.test(text), text);
    }
    assert.match(problemMessage('body-too-long'), /20,000 characters/);
  });

  /* ---------------------------------------------------------------- the autosave of the editor */

  // A clock the test moves by hand, so "600 ms after the last keystroke" is exact and nothing waits.
  const clock = () => {
    let t = 0; let seq = 0;
    const timers = new Map<number, { at: number; fn: () => void }>();
    return {
      setTimer: (fn: () => void, ms: number): unknown => { seq += 1; timers.set(seq, { at: t + ms, fn }); return seq; },
      clearTimer: (id: unknown) => { timers.delete(id as number); },
      advance: async (ms: number) => {
        const end = t + ms;
        for (;;) {
          const next = [...timers.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
          if (!next) break;
          t = next[1].at; timers.delete(next[0]); next[1].fn();
          await settle();
        }
        t = end; await settle();
      },
      pending: () => timers.size,
    };
  };

  // A saver over a recording `save`; `gate` holds the answers back until the test lets them through.
  function harness(opts: { initial?: DiaryEntry | null; answers?: SaveResult[]; gated?: boolean; removeOk?: boolean | boolean[]; gateRemove?: boolean } = {}) {
    const clk = clock();
    const saved: DiaryEntry[] = [];
    const removed: string[] = [];
    const views: SaverView[] = [];
    const gates: (() => void)[] = [];
    let ids = 0; let tick = 0;
    let turn: Promise<unknown> = Promise.resolve(); // like the store: one write after the other, in the order they were handed over
    const deps: SaverDeps = {
      save: (entry) => {
        const run = turn.then(async (): Promise<SaveResult> => {
          saved.push({ ...entry });
          const call = saved.length;
          if (opts.gated) await new Promise<void>((open) => gates.push(open));
          return opts.answers?.[call - 1] ?? { ok: true };
        });
        turn = run.catch(() => undefined);
        return run;
      },
      remove: (id) => {
        const run = turn.then(async () => {
          removed.push(id);
          const call = removed.length;
          if (opts.gateRemove) await new Promise<void>((open) => gates.push(open));
          return Array.isArray(opts.removeOk) ? (opts.removeOk[call - 1] ?? true) : (opts.removeOk ?? true);
        });
        turn = run.catch(() => undefined);
        return run;
      },
      newId: () => `page-${(ids += 1)}`,
      now: () => new Date(Date.UTC(2026, 10, 7, 8, 0, (tick += 1))),
      onChange: (v) => views.push(v),
      setTimer: clk.setTimer, clearTimer: clk.clearTimer,
    };
    const saver = createPageSaver(deps, opts.initial ?? null);
    return { saver, clk, saved, removed, views, gates, open: async () => { while (gates.length) gates.shift()!(); await settle(); } };
  }

  await test('a blank new page is never written: not by the timer, not by flush, not with only spaces and line breaks', async () => {
    const h = harness();
    h.saver.edit({ title: '', body: '' });
    h.saver.edit({ body: '   \n\n \t' });
    assert.equal(h.clk.pending(), 0, 'nothing to wait for');
    await h.clk.advance(5000);
    assert.deepEqual(await h.saver.flush(), { ok: true });
    assert.equal(h.saved.length, 0);
    assert.equal(h.saver.view().stored, false);
    assert.equal(h.saver.view().status, 'saved');
  });

  await test('the first character creates the page, 600 ms after the last keystroke, in one write with all the text typed so far', async () => {
    const h = harness();
    h.saver.edit({ body: 'H' });
    assert.equal(h.saver.view().status, 'saving');
    await h.clk.advance(500);
    h.saver.edit({ body: 'Hel' });
    await h.clk.advance(500);
    h.saver.edit({ body: 'Hello' });
    await h.clk.advance(AUTOSAVE_MS - 1);
    assert.equal(h.saved.length, 0, 'every keystroke restarts the wait');
    await h.clk.advance(1);
    assert.equal(h.saved.length, 1);
    assert.equal(AUTOSAVE_MS, 600);
    assert.deepEqual({ ...h.saved[0], createdAt: '', updatedAt: '' }, { id: 'page-1', createdAt: '', updatedAt: '', title: '', body: 'Hello' });
    assert.equal(h.saver.view().status, 'saved');
    assert.equal(h.saver.view().stored, true);
  });

  await test('flush writes at once and cancels the wait, and a second flush with nothing new writes nothing', async () => {
    const h = harness();
    h.saver.edit({ title: 'Day one', body: 'Cold.' });
    assert.deepEqual(await h.saver.flush(), { ok: true });
    assert.equal(h.saved.length, 1);
    assert.equal(h.clk.pending(), 0);
    await h.saver.flush();
    await h.clk.advance(5000);
    assert.equal(h.saved.length, 1);
    h.saver.edit({ body: 'Cold. Clear.' });
    await h.saver.flush();
    assert.equal(h.saved.length, 2);
  });

  await test('one page has one id and one creation time however often it is written; every write moves the update time', async () => {
    const h = harness();
    h.saver.edit({ body: 'a' }); await h.saver.flush();
    h.saver.edit({ body: 'ab' }); await h.saver.flush();
    h.saver.edit({ title: 'T' }); await h.saver.flush();
    assert.deepEqual(h.saved.map((e) => e.id), ['page-1', 'page-1', 'page-1']);
    assert.equal(new Set(h.saved.map((e) => e.createdAt)).size, 1);
    assert.equal(new Set(h.saved.map((e) => e.updatedAt)).size, 3);
    assert.deepEqual(h.saved.map((e) => [e.title, e.body]), [['', 'a'], ['', 'ab'], ['T', 'ab']]);
    assert.ok(Date.parse(h.saved[2].updatedAt) > Date.parse(h.saved[0].createdAt));
  });

  await test('a stored page keeps its id and day when it is edited, and writing back the text it already has writes nothing', async () => {
    const stored = page('old', day(1), { title: 'T', body: 'Body' });
    const h = harness({ initial: stored });
    assert.equal(h.saver.view().stored, true);
    h.saver.edit({ body: 'Body, and more' });
    h.saver.edit({ body: 'Body' }); // typed it back
    assert.equal(h.clk.pending(), 0, 'the same as what is stored: nothing to write');
    await h.saver.flush();
    assert.equal(h.saved.length, 0);
    h.saver.edit({ body: 'Body, and more' });
    await h.saver.flush();
    assert.equal(h.saved[0].id, 'old');
    assert.equal(h.saved[0].createdAt, stored.createdAt);
    assert.notEqual(h.saved[0].updatedAt, stored.updatedAt);
  });

  await test('a stored page that is emptied stays stored, blank: nothing is deleted unless the person says so', async () => {
    const h = harness({ initial: page('old', day(1), { title: 'T', body: 'Body' }) });
    h.saver.edit({ title: '', body: '' });
    await h.saver.flush();
    assert.equal(h.saved.length, 1);
    assert.deepEqual([h.saved[0].title, h.saved[0].body], ['', '']);
    assert.deepEqual(h.removed, []);
    assert.equal(h.saver.view().stored, true);
  });

  await test('a page begun here that is erased again is taken back, so typing and erasing leaves no trace; typing again brings the same page back', async () => {
    const h = harness();
    h.saver.edit({ body: 'x' });
    await h.clk.advance(AUTOSAVE_MS);
    assert.deepEqual([h.saved.length, h.saver.view().stored], [1, true]);
    h.saver.edit({ body: '' });
    assert.equal(h.saver.view().status, 'saving', 'it is taken back after the same short wait, not at once');
    await h.clk.advance(AUTOSAVE_MS);
    assert.deepEqual(h.removed, ['page-1']);
    assert.equal(h.saved.length, 1, 'the blank text is never written');
    assert.deepEqual([h.saver.view().stored, h.saver.view().status], [false, 'saved']);
    await h.saver.flush();
    await h.clk.advance(5000);
    assert.deepEqual(h.removed, ['page-1'], 'only once');

    h.saver.edit({ body: 'x again' });
    await h.saver.flush();
    assert.deepEqual(h.saved.map((e) => [e.id, e.body]), [['page-1', 'x'], ['page-1', 'x again']], 'the same page');
    assert.equal(h.saved[1].createdAt, h.saved[0].createdAt);
    assert.equal(h.saver.view().stored, true);
  });

  await test('leaving at once after erasing takes the page back before the wait is over, and only a page begun here is ever taken back', async () => {
    const h = harness();
    h.saver.edit({ title: 'T', body: 'x' });
    await h.saver.flush();
    h.saver.edit({ title: '', body: ' \n' });
    assert.deepEqual(await h.saver.flush(), { ok: true });
    assert.deepEqual(h.removed, ['page-1']);
    assert.equal(h.clk.pending(), 0);

    const old = harness({ initial: page('old', day(1), { body: 'Body' }) });
    old.saver.edit({ body: '' });
    await old.saver.flush();
    assert.deepEqual(old.removed, [], 'a page opened from the list is never taken back');
    assert.equal(old.saved.length, 1);
  });

  await test('erased while its first write is still on its way: taken back after that write, never before it', async () => {
    const h = harness({ gated: true });
    h.saver.edit({ body: 'x' });
    await h.clk.advance(AUTOSAVE_MS); // the write starts and is held
    h.saver.edit({ body: '' });
    const flushed = h.saver.flush();
    await settle();
    assert.deepEqual(h.removed, [], 'the page is not removed before it has been written');
    await h.open();
    await flushed;
    assert.deepEqual(h.removed, ['page-1']);
    assert.deepEqual([h.saver.view().stored, h.saver.view().status], [false, 'saved']);
  });

  await test('a page is taken back once, however often the screen asks while the removal is on its way', async () => {
    const h = harness({ gateRemove: true });
    h.saver.edit({ body: 'x' });
    await h.saver.flush();
    h.saver.edit({ body: '' });
    void h.saver.flush();
    await settle();
    void h.saver.flush();
    h.saver.edit({ body: '' });
    void h.saver.flush();
    await settle();
    await h.open();
    await h.clk.advance(5000);
    assert.deepEqual(h.removed, ['page-1']);
    assert.equal(h.saver.view().stored, false);
  });

  await test('a page that cannot be taken back stays as an empty page and the next flush tries again', async () => {
    const h = harness({ removeOk: [false, true] });
    h.saver.edit({ body: 'x' });
    await h.saver.flush();
    h.saver.edit({ body: '' });
    assert.deepEqual(await h.saver.flush(), { ok: true }, 'leaving is not held up by it');
    assert.deepEqual([h.removed.length, h.saver.view().stored, h.saver.view().problem], [1, true, null]);
    await h.saver.flush();
    assert.deepEqual([h.removed.length, h.saver.view().stored], [2, false]);
  });

  await test('"Saving…" from the first keystroke until the write is done; a failed write says so and the next flush tries the same text again', async () => {
    const h = harness({ answers: [{ ok: false, reason: 'not-saved' }, { ok: true }] });
    h.saver.edit({ body: 'Rain on the meseta' });
    assert.equal(h.saver.view().status, 'saving');
    await h.clk.advance(AUTOSAVE_MS);
    assert.deepEqual([h.saver.view().status, h.saver.view().problem, h.saver.view().stored], ['failed', 'not-saved', false]);
    const res = await h.saver.flush(); // nothing was typed since: it is still written again
    assert.deepEqual(res, { ok: true });
    assert.equal(h.saved.length, 2);
    assert.deepEqual(h.saved.map((e) => e.id), ['page-1', 'page-1'], 'the same page, not a second one');
    assert.equal(h.saved[1].createdAt, h.saved[0].createdAt);
    assert.deepEqual([h.saver.view().status, h.saver.view().problem, h.saver.view().stored], ['saved', null, true]);
    assert.deepEqual(h.views.map((v) => v.status), ['saving', 'failed', 'saving', 'saved'], 'the screen is told each change once');
  });

  await test('a page that is refused (too many pages) shows why; emptying a page that was never written clears the complaint', async () => {
    const h = harness({ answers: [{ ok: false, reason: 'too-many-pages' }] });
    h.saver.edit({ body: 'x' });
    await h.clk.advance(AUTOSAVE_MS);
    assert.equal(h.saver.view().problem, 'too-many-pages');
    h.saver.edit({ body: '' });
    assert.equal(h.saver.view().problem, null);
    assert.equal(h.saved.length, 1, 'and nothing more is written');
  });

  await test('flush waits for a write already on its way and answers when everything typed is on the phone; writes keep the typed order', async () => {
    const h = harness({ gated: true });
    h.saver.edit({ body: 'one' });
    await h.clk.advance(AUTOSAVE_MS); // the first write starts and is held
    h.saver.edit({ body: 'one two' });
    let done = false;
    const flushed = h.saver.flush().then((r) => { done = true; return r; });
    await settle();
    assert.equal(done, false, 'the first write has not finished');
    assert.equal(h.saved.length, 1, 'the second does not start before the first has finished');
    await h.open();
    await settle(); await h.open();
    assert.deepEqual(await flushed, { ok: true });
    assert.deepEqual(h.saved.map((e) => e.body), ['one', 'one two']);

    // a flush with nothing new, while a write is still on its way, waits for it as well
    const g = harness({ gated: true });
    g.saver.edit({ body: 'a' });
    await g.clk.advance(AUTOSAVE_MS);
    let waited = true;
    const second = g.saver.flush().then(() => { waited = false; });
    await settle();
    assert.equal(waited, true);
    await g.open();
    await second;
    assert.equal(g.saved.length, 1);
  });

  await test('delete drops what is typed, removes the stored page, and nothing is written afterwards, not by the timer and not by leaving', async () => {
    const h = harness({ initial: page('old', day(1), { body: 'Body' }) });
    h.saver.edit({ body: 'Body, and more' });
    assert.equal(await h.saver.discard(), true);
    assert.deepEqual(h.removed, ['old']);
    await h.clk.advance(5000);
    h.saver.edit({ body: 'typed after deleting' });
    await h.saver.flush();
    assert.equal(h.saved.length, 0);
    assert.equal(h.saver.view().stored, false);
  });

  await test('deleting a page that was only just written removes it after that write, and a blank new page has nothing to delete', async () => {
    const h = harness({ gated: true });
    h.saver.edit({ body: 'a' });
    await h.clk.advance(AUTOSAVE_MS);
    const gone = h.saver.discard();
    await settle();
    assert.deepEqual(h.removed, [], 'not before the write has finished');
    await h.open();
    assert.equal(await gone, true);
    assert.deepEqual(h.removed, ['page-1']);

    const blank = harness();
    assert.equal(await blank.saver.discard(), true);
    assert.deepEqual(blank.removed, []);
  });

  await test('a delete that fails leaves the page there and editable', async () => {
    const h = harness({ initial: page('old', day(1), { body: 'Body' }), removeOk: false });
    assert.equal(await h.saver.discard(), false);
    assert.equal(h.saver.view().stored, true);
    h.saver.edit({ body: 'still here' });
    await h.saver.flush();
    assert.equal(h.saved.length, 1);
  });

  await test('typing, leaving and coming back through the real store: the page is there, and a blank page leaves no trace', async () => {
    const f = fake({ latency: (op) => (op === 'set' ? 5 : 0) });
    const store = createDiaryStore(f.storage);
    const clk = clock();
    const deps = (): SaverDeps => ({ save: (e) => store.saveEntry(UID, e), remove: (id) => store.deleteEntry(UID, id), newId, setTimer: clk.setTimer, clearTimer: clk.clearTimer });

    const blank = createPageSaver(deps());
    blank.edit({ body: '  ' });
    await blank.flush();
    assert.equal(f.files.size, 0, 'no key, nothing: leaving a blank page leaves no trace');

    const first = createPageSaver(deps());
    first.edit({ title: 'Hontanas', body: 'Arrived at noon.' });
    void first.flush(); // leaving: not awaited, like the screen going away
    const list = await store.loadEntries(UID); // the list opening a moment later
    assert.deepEqual(list.map((e) => [e.title, e.body]), [['Hontanas', 'Arrived at noon.']]);

    const again = createPageSaver(deps(), list[0]);
    again.edit({ body: 'Arrived at noon. Soup.' });
    await again.flush();
    const after = await store.loadEntries(UID);
    assert.equal(after.length, 1);
    assert.equal(after[0].id, list[0].id);
    assert.equal(after[0].createdAt, list[0].createdAt);
    assert.equal(after[0].body, 'Arrived at noon. Soup.');

    assert.equal(await again.discard(), true);
    assert.deepEqual(await store.loadEntries(UID), []);

    const false_start = createPageSaver(deps());
    false_start.edit({ body: 'a false start' });
    await false_start.flush();
    assert.equal((await store.loadEntries(UID)).length, 1);
    false_start.edit({ body: '' });
    void false_start.flush(); // leaving, not awaited
    assert.deepEqual(await store.loadEntries(UID), [], 'typed and erased: no page in the diary');
  });

  console.log(`${n} of ${n} passed`);
})().catch((e) => { console.error(e); process.exit(1); });
