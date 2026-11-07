// Plain-node checks of the private diary: what is stored and how it is read (two slots, strict reads, never a throw, never a
// guess), the limits, writes that take turns, the keys that survive signing out but not deleting the account, the autosave of
// the editor with a clock the test controls, and the words. No React Native. Run: npm run test:diary
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { AUTOSAVE_MS, createPageSaver, type SaverDeps, type SaverView } from '../autosave';
import { EMPTY_CARD_LINE, PRIVACY_LINE, UNTITLED, clip, dateLine, firstLine, pagePreview, pageTitle, pagesLabel, problemMessage, thousands } from '../present';
import { BODY_MAX, ENTRIES_MAX, TITLE_MAX, TOTAL_MAX, createDiaryStore, isEntry, newId, oldKey, pagesOf, slotKey, type DiaryEntry, type DiaryStorage, type SaveResult } from '../store';

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
  /** Operations that throw for every key (a disk that does not answer). */
  throwOn?: Op[];
  /** setJSON calls (1-based) that answer false, like a full disk. */
  failSets?: number[];
  /** setJSON calls (1-based) that die half way: half of the text is left in the file and the call throws, as if the process was killed. */
  crashSets?: number[];
};

// Values are kept as JSON text, as on the phone. getJSON reads the way storage.ts does, strictly: nothing there is null, a key
// that cannot be read throws, and text that does not parse (cut off, damaged, empty) throws.
function fake(opts: FakeOpts = {}) {
  const files = new Map<string, string>();
  const unreadable = new Set<string>(); // keys the disk refuses to read
  const unremovable = new Set<string>(); // keys the disk refuses to delete
  const calls = { get: 0, set: 0, remove: 0 };
  const writes: { key: string; seq: number | null; cut: boolean }[] = [];
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
      if (unreadable.has(key)) throw new Error(`${key} cannot be read`);
      const text = files.get(key);
      if (text === undefined) return null;
      return JSON.parse(text) as T;
    },
    async setJSON(key, value) {
      const call = await take('set');
      const text = JSON.stringify(value);
      const seq = (value as { seq?: number } | null)?.seq ?? null;
      if (opts.crashSets?.includes(call)) {
        files.set(key, text.slice(0, Math.floor(text.length / 2)));
        writes.push({ key, seq, cut: true });
        throw new Error('the process was killed');
      }
      if (opts.failSets?.includes(call)) return false;
      files.set(key, text);
      writes.push({ key, seq, cut: false });
      return true;
    },
    async remove(key) {
      await take('remove');
      if (unremovable.has(key)) throw new Error(`${key} cannot be removed`);
      files.delete(key);
    },
  };
  return {
    storage, files, calls, writes, unreadable, unremovable,
    seed: (key: string, value: unknown) => { files.set(key, JSON.stringify(value)); },
    seedText: (key: string, text: string) => { files.set(key, text); },
    stored: (key: string): unknown => { const t = files.get(key); return t === undefined ? undefined : JSON.parse(t); },
  };
}
type Fake = ReturnType<typeof fake>;

const page = (id: string, createdAt: string, over: Partial<DiaryEntry> = {}): DiaryEntry => ({ id, createdAt, updatedAt: createdAt, title: '', body: `text of ${id}`, ...over });
const day = (d: number) => new Date(Date.UTC(2026, 10, d, 12, 0, 0)).toISOString();
const slot = (seq: number, entries: unknown[]) => ({ v: 1, seq, entries });
const A = (uid = UID) => slotKey(uid, 'a');
const B = (uid = UID) => slotKey(uid, 'b');
const ids = (list: DiaryEntry[]) => list.map((e) => e.id);
const seqOf = (value: unknown) => (value as { seq?: number } | undefined)?.seq;
const entriesOf = (value: unknown) => (value as { entries: unknown[] }).entries;
const untouched = (f: Fake) => [f.files.get(A()), f.files.get(B()), f.files.get(oldKey(UID))];

const GOOD = page('g1', day(1), { title: 'Roncesvalles', body: 'Cold and clear.' });

(async () => {
  /* ---------------------------------------------------------------- the keys */

  await test('the diary keys never start with u.: signing out wipes u.<id>.… and cannot touch them', () => {
    for (const uid of [UID, OTHER, 'u', 'u.', 'u.abc', 'abc', '0']) {
      for (const key of [slotKey(uid, 'a'), slotKey(uid, 'b'), oldKey(uid)]) {
        assert.ok(!key.startsWith('u.'), key);
        assert.ok(key.startsWith('diary.') && key.includes(uid), key);
      }
    }
    const keys = [UID, OTHER].flatMap((uid) => [slotKey(uid, 'a'), slotKey(uid, 'b'), oldKey(uid)]);
    assert.equal(new Set(keys).size, 6, 'each account has its own keys, and the two slots differ');
  });

  await test('a new page id is a fresh uuid every time', () => {
    const made = new Set(Array.from({ length: 200 }, () => newId()));
    assert.equal(made.size, 200);
    for (const id of made) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  /* ---------------------------------------------------------------- reading what is there */

  await test('nothing stored: an empty list, and a read writes nothing', async () => {
    const f = fake();
    assert.deepEqual(await createDiaryStore(f.storage).loadEntries(UID), []);
    assert.equal(f.files.size, 0);
    assert.equal(f.calls.set + f.calls.remove, 0);
  });

  await test('a slot that is not a version 1 slot is ignored, in either place: an empty list, never an error, and nothing is written', async () => {
    const odd: [string, unknown][] = [
      ['text', 'hello'], ['a number', 42], ['true', true], ['a list', []], ['a list of pages', [GOOD]], ['an empty object', {}],
      ['no entries', { v: 1, seq: 1 }], ['entries that is not a list', { v: 1, seq: 1, entries: 'x' }], ['entries that is an object', { v: 1, seq: 1, entries: {} }],
      ['a version that is text', { v: '1', seq: 1, entries: [GOOD] }], ['a newer version', { v: 2, seq: 1, entries: [GOOD] }], ['version 0', { v: 0, seq: 1, entries: [GOOD] }],
      ['no version', { seq: 1, entries: [GOOD] }], ['no seq (the first build wrote none)', { v: 1, entries: [GOOD] }], ['a seq that is text', { v: 1, seq: '3', entries: [GOOD] }],
      ['a negative seq', { v: 1, seq: -1, entries: [GOOD] }], ['a seq that is not whole', { v: 1, seq: 1.5, entries: [GOOD] }], ['a seq that is null', { v: 1, seq: null, entries: [GOOD] }],
    ];
    for (const key of [A(), B()]) {
      for (const [what, value] of odd) {
        const f = fake();
        f.seed(key, value);
        const before = f.files.get(key);
        assert.deepEqual(await createDiaryStore(f.storage).loadEntries(UID), [], what);
        assert.equal(f.files.get(key), before, `${what}: a read must not change what is stored`);
        assert.equal(f.calls.set + f.calls.remove, 0, `${what}: a read must not write`);
      }
    }
  });

  await test('the diary is the readable slot with the higher seq; equal numbers take slot a', async () => {
    const x = page('x', day(1)); const y = page('y', day(2));
    const at = async (a: unknown, b: unknown) => { const f = fake(); f.seed(A(), a); f.seed(B(), b); return ids(await createDiaryStore(f.storage).loadEntries(UID)); };
    assert.deepEqual(await at(slot(5, [x]), slot(6, [y])), ['y']);
    assert.deepEqual(await at(slot(7, [x]), slot(6, [y])), ['x']);
    assert.deepEqual(await at(slot(6, [x]), slot(6, [y])), ['x']);
    assert.deepEqual(await at(slot(0, [x]), slot(1, [y])), ['y']);
  });

  const damages: [string, (f: Fake, key: string) => void][] = [
    ['missing', () => undefined],
    ['damaged text', (f, key) => f.seedText(key, 'not json at all {{{')],
    ['cut off in the middle', (f, key) => f.seedText(key, JSON.stringify(slot(9, [GOOD, page('g2', day(2))])).slice(0, 60))],
    ['empty', (f, key) => f.seedText(key, '')],
    ['of another version', (f, key) => f.seed(key, { v: 2, seq: 9, entries: [GOOD] })],
    ['unreadable (the disk says no)', (f, key) => { f.seed(key, slot(9, [GOOD])); f.unreadable.add(key); }],
  ];

  for (const [which, other] of [['b', 'a'], ['a', 'b']] as const) {
    await test(`slot ${which} missing, damaged, cut off, empty, of another version or unreadable: the pages of slot ${other} are shown, and a read writes nothing`, async () => {
      for (const [what, damage] of damages) {
        const f = fake();
        const good = page('good', day(3));
        f.seed(which === 'a' ? B() : A(), slot(4, [good]));
        damage(f, which === 'a' ? A() : B());
        assert.deepEqual(ids(await createDiaryStore(f.storage).loadEntries(UID)), ['good'], what);
        assert.equal(f.calls.set + f.calls.remove, 0, `${what}: a read must not write`);
      }
    });
  }

  await test('the next save replaces a slot that was damaged, and the pages of the good one are carried over', async () => {
    for (const [what, damage] of damages.filter(([w]) => !w.startsWith('unreadable'))) {
      const f = fake();
      f.seed(A(), slot(4, [page('old', day(1))]));
      damage(f, B());
      const store = createDiaryStore(f.storage);
      assert.deepEqual(await store.saveEntry(UID, page('new', day(2))), { ok: true }, what);
      assert.equal(seqOf(f.stored(B())), 5, `${what}: written to the damaged slot, one after the newest`);
      assert.equal(seqOf(f.stored(A())), 4, `${what}: the good slot is not touched`);
      assert.deepEqual(ids(await store.loadEntries(UID)), ['new', 'old'], what);
    }
  });

  await test('the slots take turns: every write goes to the older slot with the next seq, and the other still holds the state before', async () => {
    const f = fake();
    const store = createDiaryStore(f.storage);
    for (let i = 1; i <= 5; i++) assert.deepEqual(await store.saveEntry(UID, page(`p${i}`, day(i))), { ok: true });
    assert.deepEqual(f.writes.map((w) => [w.key === A() ? 'a' : 'b', w.seq]), [['a', 1], ['b', 2], ['a', 3], ['b', 4], ['a', 5]]);
    assert.equal(entriesOf(f.stored(A())).length, 5);
    assert.equal(entriesOf(f.stored(B())).length, 4, 'the slot that was not written still holds the previous state');
    assert.deepEqual(ids(await store.loadEntries(UID)), ['p5', 'p4', 'p3', 'p2', 'p1']);
  });

  await test('a write that dies half way costs at most that write: after a restart the pages before it are there, and the next save replaces the cut-off slot', async () => {
    const f = fake({ crashSets: [3] });
    const first = createDiaryStore(f.storage);
    assert.deepEqual(await first.saveEntry(UID, page('p1', day(1))), { ok: true });
    assert.deepEqual(await first.saveEntry(UID, page('p2', day(2))), { ok: true });
    assert.deepEqual(await first.saveEntry(UID, page('p3', day(3))), { ok: false, reason: 'not-saved' }, 'the third write was killed');
    assert.throws(() => f.stored(A()), 'slot a is cut off');
    assert.equal(seqOf(f.stored(B())), 2, 'slot b has the state before it');

    const restarted = createDiaryStore(f.storage); // a new run of the app over the same files
    assert.deepEqual(ids(await restarted.loadEntries(UID)), ['p2', 'p1']);
    assert.deepEqual(await restarted.saveEntry(UID, page('p4', day(4))), { ok: true });
    assert.deepEqual([seqOf(f.stored(A())), seqOf(f.stored(B()))], [3, 2], 'the cut-off slot is replaced');
    assert.deepEqual(ids(await restarted.loadEntries(UID)), ['p4', 'p2', 'p1']);
  });

  await test('a kill during the very first write leaves a cut-off slot and nothing else: the diary is empty and can be written again, not stuck', async () => {
    const f = fake({ crashSets: [1] });
    assert.deepEqual(await createDiaryStore(f.storage).saveEntry(UID, page('p1', day(1))), { ok: false, reason: 'not-saved' });
    assert.throws(() => f.stored(A()));
    const restarted = createDiaryStore(f.storage);
    assert.deepEqual(await restarted.loadEntries(UID), []);
    assert.deepEqual(await restarted.saveEntry(UID, page('p2', day(2))), { ok: true });
    assert.deepEqual(ids(await restarted.loadEntries(UID)), ['p2']);
    assert.equal(seqOf(f.stored(A())), 1);
  });

  await test('a failed write (a full disk) leaves the state before it, and the next save carries on from there', async () => {
    const f = fake({ failSets: [3] });
    const store = createDiaryStore(f.storage);
    await store.saveEntry(UID, page('p1', day(1)));
    await store.saveEntry(UID, page('p2', day(2)));
    assert.deepEqual(await store.saveEntry(UID, page('p3', day(3))), { ok: false, reason: 'not-saved' });
    assert.deepEqual(ids(await store.loadEntries(UID)), ['p2', 'p1']);
    assert.deepEqual(await store.saveEntry(UID, page('p3', day(3))), { ok: true });
    assert.deepEqual(ids(await store.loadEntries(UID)), ['p3', 'p2', 'p1']);
  });

  await test('neither slot can be read: an empty list, saves and deletes say they did not happen, and nothing is ever written over what is there', async () => {
    // a disk that does not answer, for every key
    const mute = fake({ throwOn: ['get'] });
    mute.seed(A(), slot(7, [GOOD])); mute.seed(B(), slot(6, [GOOD]));
    const before = untouched(mute);
    const store = createDiaryStore(mute.storage);
    assert.deepEqual(await store.loadEntries(UID), []);
    assert.deepEqual(await store.saveEntry(UID, page('p', day(2))), { ok: false, reason: 'not-saved' });
    assert.equal(await store.deleteEntry(UID, 'g1'), false);
    assert.deepEqual(untouched(mute), before);
    assert.equal(mute.calls.set, 0);

    // both slots refuse to be read now, and give the pages back when the disk recovers
    const f = fake();
    f.seed(A(), slot(7, [page('newest', day(3))])); f.seed(B(), slot(6, [page('older', day(2))]));
    f.unreadable.add(A()); f.unreadable.add(B());
    const s = createDiaryStore(f.storage);
    assert.deepEqual(await s.loadEntries(UID), []);
    assert.deepEqual(await s.saveEntry(UID, page('p', day(4))), { ok: false, reason: 'not-saved' });
    assert.equal(await s.deleteEntry(UID, 'newest'), false);
    assert.equal(f.calls.set + f.calls.remove, 0);
    f.unreadable.clear();
    assert.deepEqual(ids(await s.loadEntries(UID)), ['newest'], 'nothing was lost while it could not be read');

    // both damaged
    const g = fake();
    g.seedText(A(), '{"v":1,"seq":7,"entries":[{"id"'); g.seedText(B(), 'garbage');
    const before2 = untouched(g);
    const t = createDiaryStore(g.storage);
    assert.deepEqual(await t.loadEntries(UID), []);
    assert.deepEqual(await t.saveEntry(UID, page('p', day(4))), { ok: false, reason: 'not-saved' });
    assert.deepEqual(untouched(g), before2);
  });

  await test('with no valid slot and none unreadable, a new diary starts at seq 1 in slot a and slot b is left alone', async () => {
    const f = fake();
    const newer = { v: 2, seq: 9, entries: [{ id: 'later', body: { blocks: ['rich text of a newer app'] } }] };
    f.seed(B(), newer);
    const before = f.files.get(B());
    const store = createDiaryStore(f.storage);
    assert.deepEqual(await store.loadEntries(UID), []);
    assert.deepEqual(await store.saveEntry(UID, page('first', day(3))), { ok: true });
    assert.deepEqual(f.stored(A()), slot(1, [page('first', day(3))]));
    assert.equal(f.files.get(B()), before, 'what a newer app wrote is not touched');
    assert.equal(await store.deleteEntry(UID, 'later'), true, 'there is nothing readable to delete');
    assert.equal(f.files.get(B()), before);
  });

  await test('a refused page leaves both slots exactly as they were', async () => {
    const f = fake();
    const store = createDiaryStore(f.storage);
    await store.saveEntry(UID, page('p1', day(1)));
    await store.saveEntry(UID, page('p2', day(2)));
    const before = untouched(f);
    assert.deepEqual(await store.saveEntry(UID, page('big', day(3), { body: 'x'.repeat(BODY_MAX + 1) })), { ok: false, reason: 'body-too-long' });
    assert.deepEqual(await store.saveEntry(UID, page('long', day(3), { title: 't'.repeat(TITLE_MAX + 1) })), { ok: false, reason: 'title-too-long' });
    assert.deepEqual(untouched(f), before);
  });

  await test('items of a good slot that do not read as pages are not shown, and are kept when the others are saved or deleted', async () => {
    const f = fake();
    const junk = [null, 'x', 7, { id: 5 }, { id: 'no-text', createdAt: day(1), updatedAt: day(1) }, { ...GOOD, id: 'bad-date', createdAt: 'yesterday' }, { ...GOOD, id: '' }];
    const newer = { ...GOOD, id: 'g2', createdAt: day(2), updatedAt: day(2), mood: 'grateful' }; // a field of a newer app
    f.seed(A(), slot(3, [GOOD, ...junk, newer]));
    const store = createDiaryStore(f.storage);
    assert.deepEqual(ids(await store.loadEntries(UID)), ['g2', 'g1']);

    assert.deepEqual(await store.saveEntry(UID, page('g3', day(3))), { ok: true });
    const raw = entriesOf(f.stored(B()));
    assert.equal(seqOf(f.stored(B())), 4);
    assert.equal(raw.length, 1 + junk.length + 1 + 1, 'nothing was dropped');
    assert.deepEqual(raw.slice(1, 1 + junk.length), junk);

    // saving a page over one that a newer app wrote keeps that app's extra fields
    assert.deepEqual(await store.saveEntry(UID, { ...newer, body: 'edited' } as DiaryEntry), { ok: true });
    const again = entriesOf(f.stored(A())).find((e) => e && (e as { id?: string }).id === 'g2') as Record<string, unknown>;
    assert.equal(again.mood, 'grateful');
    assert.equal(again.body, 'edited');

    assert.equal(await store.deleteEntry(UID, 'g1'), true);
    const left = entriesOf(f.stored(B()));
    assert.deepEqual(left.slice(0, junk.length), junk, 'the unreadable items are still there after a delete');
  });

  await test('the same id twice in a stored list shows one page', async () => {
    const f = fake();
    f.seed(A(), slot(1, [GOOD, { ...GOOD, body: 'copy' }]));
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
    assert.deepEqual(ids(await store.loadEntries(UID)), ['c', 'b', 'a']);

    // an edit changes the text and updatedAt, not the place in the list (the day it was begun)
    assert.deepEqual(await store.saveEntry(UID, { ...page('a', day(1)), title: 'Day one', body: 'edited', updatedAt: day(9) }), { ok: true });
    const list = await store.loadEntries(UID);
    assert.deepEqual(ids(list), ['c', 'b', 'a']);
    assert.deepEqual(list[2], { id: 'a', createdAt: day(1), updatedAt: day(9), title: 'Day one', body: 'edited' });

    assert.equal(await store.deleteEntry(UID, 'b'), true);
    assert.deepEqual(ids(await store.loadEntries(UID)), ['c', 'a']);
    const writes = f.writes.length;
    assert.equal(await store.deleteEntry(UID, 'b'), true, 'deleting what is not there is not an error');
    assert.equal(await store.deleteEntry(UID, 'nope'), true);
    assert.equal(f.writes.length, writes, 'and writes nothing');
    assert.deepEqual(ids(await store.loadEntries(UID)), ['c', 'a']);
    assert.equal(await createDiaryStore(fake().storage).deleteEntry(UID, 'x'), true, 'nothing stored, nothing to delete');
  });

  await test('a delete leaves no copy of the page on the phone: the slot that held the state before is written with the new state too', async () => {
    const f = fake();
    const store = createDiaryStore(f.storage);
    await store.saveEntry(UID, page('keep', day(1), { body: 'Keep me' }));
    await store.saveEntry(UID, page('gone', day(2), { body: 'Secret words' }));
    assert.ok(f.files.get(A())?.includes('Keep me') && f.files.get(B())?.includes('Secret words'), 'the slot of the state before holds it, which is why a delete has to scrub it');
    assert.equal(await store.deleteEntry(UID, 'gone'), true);
    for (const key of [A(), B()]) assert.ok(!f.files.get(key)?.includes('Secret words'), `${key} still holds the deleted page`);
    assert.deepEqual(f.writes.map((w) => [w.key === A() ? 'a' : 'b', w.seq]).slice(2), [['a', 3], ['b', 4]], 'the new state first, then the scrub, one seq later');
    assert.deepEqual(ids(await store.loadEntries(UID)), ['keep']);
    assert.equal(entriesOf(f.stored(A())).length, 1);
    assert.equal(entriesOf(f.stored(B())).length, 1);
  });

  await test('a kill, or a refusal, during the scrub of a delete costs nothing: the page is gone from the state that was committed', async () => {
    for (const opts of [{ crashSets: [4] }, { failSets: [4] }]) {
      const f = fake(opts);
      const store = createDiaryStore(f.storage);
      await store.saveEntry(UID, page('keep', day(1)));
      await store.saveEntry(UID, page('gone', day(2), { body: 'Secret words' }));
      assert.equal(await store.deleteEntry(UID, 'gone'), true, 'the delete went through');
      assert.ok(!f.files.get(A())?.includes('Secret words'), 'slot a, the new state, does not hold it');
      const restarted = createDiaryStore(f.storage);
      assert.deepEqual(ids(await restarted.loadEntries(UID)), ['keep'], 'and that is the state the next run reads');
    }
  });

  await test('a delete in a diary that is new, or carried over from the first build, has no slot to scrub and writes once', async () => {
    const f = fake();
    f.seed(oldKey(UID), { v: 1, entries: [GOOD, page('g2', day(2))] });
    const store = createDiaryStore(f.storage);
    assert.equal(await store.deleteEntry(UID, 'g2'), true);
    assert.deepEqual(f.writes.map((w) => [w.key === A() ? 'a' : 'b', w.seq]), [['a', 1]]);
    assert.equal(f.files.has(B()), false, 'slot b is not created');
    assert.equal(f.files.has(oldKey(UID)), false);
    assert.deepEqual(ids(await store.loadEntries(UID)), ['g1']);
  });

  await test('the order is by the moment a page was begun, not by how its date is written; equal moments keep a fixed order', () => {
    const a = page('a', '2026-11-04T23:00:00-05:00'); // 04:00 UTC on the 5th
    const b = page('b', '2026-11-05T01:00:00Z');
    assert.deepEqual(ids(pagesOf([b, a])), ['a', 'b'], 'a later instant first, although its text sorts earlier');
    const tie = ids(pagesOf([page('x', day(1)), page('z', day(1)), page('y', day(1))]));
    assert.deepEqual(tie, ids(pagesOf([page('z', day(1)), page('y', day(1)), page('x', day(1))])));
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
    const before = untouched(f);
    assert.deepEqual(await store.saveEntry(UID, page('over', day(2), { body: `${full}x` })), { ok: false, reason: 'body-too-long' });
    assert.deepEqual(await store.saveEntry(UID, page('full', day(1), { body: `${full}x` })), { ok: false, reason: 'body-too-long' }, 'an update too');
    assert.deepEqual(untouched(f), before);
  });

  await test('a title holds up to 120 characters', async () => {
    const store = createDiaryStore(fake().storage);
    assert.deepEqual(await store.saveEntry(UID, page('t', day(1), { title: 't'.repeat(TITLE_MAX) })), { ok: true });
    assert.deepEqual(await store.saveEntry(UID, page('u', day(1), { title: 't'.repeat(TITLE_MAX + 1) })), { ok: false, reason: 'title-too-long' });
  });

  await test('a person keeps up to 2,000 pages: the next new page is refused, a page already there can still be edited, deleting makes room', async () => {
    const f = fake();
    const entries = Array.from({ length: ENTRIES_MAX }, (_, i) => page(`p${i}`, new Date(Date.UTC(2020, 0, 1) + i * 60_000).toISOString()));
    f.seed(A(), slot(1, entries));
    const store = createDiaryStore(f.storage);
    assert.equal((await store.loadEntries(UID)).length, ENTRIES_MAX);
    const before = untouched(f);
    assert.deepEqual(await store.saveEntry(UID, page('one-too-many', day(1))), { ok: false, reason: 'too-many-pages' });
    assert.deepEqual(untouched(f), before);
    assert.deepEqual(await store.saveEntry(UID, { ...entries[7], body: 'still editable' }), { ok: true });
    assert.equal(await store.deleteEntry(UID, 'p0'), true);
    assert.deepEqual(await store.saveEntry(UID, page('now-there-is-room', day(1))), { ok: true });
    assert.equal((await store.loadEntries(UID)).length, ENTRIES_MAX);
    assert.match(problemMessage('too-many-pages'), /2,000 pages/);
  });

  await test('the whole diary holds up to 2,000,000 characters: a save that would pass it is refused gently and writes nothing, a save that is not bigger always goes through', async () => {
    const big = (i: number, size = BODY_MAX, ch = 'x') => page(`big${i}`, new Date(Date.UTC(2024, 0, 1) + i * 3_600_000).toISOString(), { body: ch.repeat(size) });
    const f = fake();
    f.seed(A(), slot(1, Array.from({ length: 99 }, (_, i) => big(i)))); // 1,980,000 characters
    const store = createDiaryStore(f.storage);
    assert.deepEqual(await store.saveEntry(UID, big(99)), { ok: true }, 'exactly 2,000,000 is allowed');
    const full = untouched(f);

    assert.deepEqual(await store.saveEntry(UID, page('one-more', day(1), { body: 'y' })), { ok: false, reason: 'diary-full' }, 'one character more is not');
    assert.deepEqual(await store.saveEntry(UID, { ...big(3), body: `${'x'.repeat(BODY_MAX - 1)}z`, title: 't' }), { ok: false, reason: 'diary-full' }, 'a page that grows is refused too');
    assert.deepEqual(untouched(f), full, 'a refusal writes nothing');

    assert.deepEqual(await store.saveEntry(UID, big(3, BODY_MAX, 'q')), { ok: true }, 'a page that is not bigger is saved, even in a full diary');
    assert.deepEqual(await store.saveEntry(UID, big(3, 100)), { ok: true }, 'and one that gets shorter');
    assert.deepEqual(await store.saveEntry(UID, page('one-more', day(1), { body: 'y'.repeat(100) })), { ok: true }, 'which makes room again');
    assert.equal(await store.deleteEntry(UID, 'big4'), true, 'deleting is always possible');
    assert.equal((await store.loadEntries(UID)).reduce((sum, e) => sum + e.title.length + e.body.length, 0) <= TOTAL_MAX, true);
    assert.match(problemMessage('diary-full'), /^Your diary is full/);
    assert.match(problemMessage('diary-full'), /2,000,000 characters/);
    assert.ok(TOTAL_MAX === 2_000_000 && TOTAL_MAX < ENTRIES_MAX * BODY_MAX, 'the total, not the page count, is what bounds a save');

    // a diary that is over the cap already (written by something else): shrinking is allowed, growing is not
    const over = fake();
    over.seed(A(), slot(1, Array.from({ length: 105 }, (_, i) => big(i)))); // 2,100,000 characters
    const s = createDiaryStore(over.storage);
    assert.deepEqual(await s.saveEntry(UID, page('new', day(1), { body: 'y' })), { ok: false, reason: 'diary-full' });
    assert.deepEqual(await s.saveEntry(UID, big(1, 10)), { ok: true });
    assert.deepEqual(await s.saveEntry(UID, big(2, BODY_MAX - 1)), { ok: true });
  });

  /* ---------------------------------------------------------------- writes take turns */

  await test('two saves at once both survive, however slowly each one reads (a promise queue around read-modify-write)', async () => {
    // The first save reads its two slots in 25 ms and the second in 1 ms: without taking turns both start from an empty diary
    // and the second page is lost.
    const f = fake({ latency: (op, call) => (op === 'get' ? (call <= 2 ? 25 : 1) : 0) });
    const store = createDiaryStore(f.storage);
    await Promise.all([store.saveEntry(UID, page('a', day(1))), store.saveEntry(UID, page('b', day(2)))]);
    assert.deepEqual(ids(await store.loadEntries(UID)), ['b', 'a']);
  });

  await test('forty quick saves at mixed speeds lose nothing, and a save of one page twice ends with the later text', async () => {
    const f = fake({ latency: (op, call) => (op === 'get' ? (call % 7) * 2 : op === 'set' ? call % 3 : 0) });
    const store = createDiaryStore(f.storage);
    const results = await Promise.all(Array.from({ length: 40 }, (_, i) => store.saveEntry(UID, page(`p${i}`, new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString()))));
    assert.ok(results.every((r) => r.ok));
    assert.equal((await store.loadEntries(UID)).length, 40);
    assert.deepEqual(f.writes.map((w) => w.seq).slice(0, 40), Array.from({ length: 40 }, (_, i) => i + 1), 'one seq after the other, none twice');
    await Promise.all([store.saveEntry(UID, page('p3', day(1), { body: 'first' })), store.saveEntry(UID, page('p3', day(1), { body: 'second' }))]);
    assert.equal((await store.loadEntries(UID)).find((e) => e.id === 'p3')?.body, 'second');
  });

  await test('a read asked right after a save sees it, and a clear or delete asked after a save comes after it', async () => {
    const f = fake({ latency: (op) => (op === 'set' ? 15 : 0) });
    const store = createDiaryStore(f.storage);
    void store.saveEntry(UID, page('a', day(1)));
    assert.deepEqual(ids(await store.loadEntries(UID)), ['a'], 'the list opened right after Back shows the page written by Back');

    void store.saveEntry(UID, page('b', day(2)));
    void store.deleteEntry(UID, 'a');
    assert.deepEqual(ids(await store.loadEntries(UID)), ['b']);

    void store.saveEntry(UID, page('c', day(3)));
    await store.clearDiary(UID);
    assert.deepEqual([f.files.has(A()), f.files.has(B())], [false, false], 'cleared after the pending save, not before it');
    void store.clearDiary(UID);
    await store.saveEntry(UID, page('d', day(4)));
    assert.deepEqual(ids(await store.loadEntries(UID)), ['d']);
  });

  await test('a write that fails does not stop the ones after it', async () => {
    const f = fake({ failSets: [1] });
    const store = createDiaryStore(f.storage);
    assert.deepEqual(await store.saveEntry(UID, page('a', day(1))), { ok: false, reason: 'not-saved' });
    assert.deepEqual(await store.saveEntry(UID, page('a', day(1))), { ok: true });
    assert.deepEqual(ids(await store.loadEntries(UID)), ['a']);
  });

  /* ---------------------------------------------------------------- one account, another account, signing out, deleting */

  await test('another account on the same phone never sees the pages, and cannot change them', async () => {
    const f = fake();
    const store = createDiaryStore(f.storage);
    await store.saveEntry(UID, page('mine', day(1)));
    await store.saveEntry(UID, page('mine2', day(2)));
    assert.deepEqual(await store.loadEntries(OTHER), []);
    await store.saveEntry(OTHER, page('theirs', day(2)));
    assert.equal(await store.deleteEntry(OTHER, 'mine'), true);
    await store.clearDiary(OTHER);
    assert.deepEqual(ids(await store.loadEntries(UID)), ['mine2', 'mine']);
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
    await test(`signing out ${where} wipes the account's u.<id>.… keys and leaves both slots of the diary; signing in again shows it; deleting the account removes them`, async () => {
      const f = fake();
      const store = createDiaryStore(f.storage);
      await store.saveEntry(UID, page('mine', day(1), { body: 'Hontanas' }));
      await store.saveEntry(UID, page('mine2', day(2), { body: 'Burgos' })); // both slots hold a state now
      await store.saveEntry(OTHER, page('theirs', day(2)));
      for (const key of [`u.${UID}.account`, `u.${UID}.me`, `u.${UID}.places.stage`, `u.${OTHER}.account`, 'theme-scheme']) f.seed(key, { cached: true });
      assert.ok(f.files.has(A()) && f.files.has(B()));

      // signOut for UID
      f.files.delete(`u.${UID}.account`);
      wipe(f.files, `u.${UID}.`);
      assert.deepEqual([...f.files.keys()].filter((k) => k.startsWith(`u.${UID}.`)), [], 'everything cached for the account is gone');
      assert.ok(f.files.has(`u.${OTHER}.account`) && f.files.has('theme-scheme'), 'other accounts and settings are not touched');
      assert.ok(f.files.has(A()) && f.files.has(B()), 'both slots are still there');
      assert.deepEqual((await store.loadEntries(UID)).map((e) => e.body), ['Burgos', 'Hontanas'], 'the diary survives signing out');
      assert.deepEqual(ids(await store.loadEntries(OTHER)), ['theirs']);

      // deleting the account
      await store.clearDiary(UID);
      assert.deepEqual(await store.loadEntries(UID), []);
      assert.deepEqual([f.files.has(A()), f.files.has(B()), f.files.has(oldKey(UID))], [false, false, false]);
      assert.deepEqual(ids(await store.loadEntries(OTHER)), ['theirs'], "another account's diary stays");
      assert.ok(f.files.has('theme-scheme'));
    });
  }

  await test('clearDiary removes both slots and the old key whatever is stored there, also what cannot be read; one that cannot be removed does not stop the others', async () => {
    const f = fake();
    f.seed(A(), { v: 9, seq: 'from the future', entries: 'x' });
    f.seedText(B(), 'cut o');
    f.seed(oldKey(UID), { v: 1, entries: [GOOD] });
    f.seed(A(OTHER), slot(1, [GOOD]));
    const store = createDiaryStore(f.storage);
    await store.clearDiary(UID);
    assert.deepEqual([f.files.has(A()), f.files.has(B()), f.files.has(oldKey(UID))], [false, false, false]);
    assert.ok(f.files.has(A(OTHER)), "another account's diary stays");
    await store.clearDiary(UID);
    await store.clearDiary('');

    const stubborn = fake();
    stubborn.seed(A(), slot(2, [GOOD])); stubborn.seed(B(), slot(1, [GOOD])); stubborn.seed(oldKey(UID), { v: 1, entries: [GOOD] });
    stubborn.unremovable.add(A());
    await createDiaryStore(stubborn.storage).clearDiary(UID); // does not throw
    assert.deepEqual([stubborn.files.has(A()), stubborn.files.has(B()), stubborn.files.has(oldKey(UID))], [true, false, false], 'the others are removed anyway');
    await createDiaryStore(fake({ throwOn: ['remove'] }).storage).clearDiary(UID); // nor when the disk does not answer at all
  });

  await test('a diary the first build kept in one key is carried over by the first write and removed then; a stale copy is never read again; clearDiary removes it too', async () => {
    const f = fake();
    f.seed(oldKey(UID), { v: 1, entries: [GOOD] });
    const store = createDiaryStore(f.storage);
    assert.deepEqual(ids(await store.loadEntries(UID)), ['g1'], 'its pages show');
    assert.equal(f.calls.set + f.calls.remove, 0, 'a read does not move or remove them');
    assert.deepEqual(await store.saveEntry(UID, page('p2', day(2))), { ok: true });
    assert.deepEqual(f.stored(A()), slot(1, [GOOD, page('p2', day(2))]), 'carried over into slot a');
    assert.equal(f.files.has(oldKey(UID)), false, 'and the old key is gone, so a deleted page cannot come back from it');

    f.seed(oldKey(UID), { v: 1, entries: [page('stale', day(5))] }); // a stale copy turns up
    assert.deepEqual(ids(await store.loadEntries(UID)), ['p2', 'g1'], 'a slot that is valid wins');

    const torn = fake({ crashSets: [1] });
    torn.seed(oldKey(UID), { v: 1, entries: [GOOD] });
    assert.deepEqual(await createDiaryStore(torn.storage).saveEntry(UID, page('p2', day(2))), { ok: false, reason: 'not-saved' });
    assert.ok(torn.files.has(oldKey(UID)), 'the old key is only removed after the write went through');
    assert.deepEqual(ids(await createDiaryStore(torn.storage).loadEntries(UID)), ['g1'], 'so after a kill the pages are still there');

    const damaged = fake();
    damaged.seedText(oldKey(UID), '{"v":1,"entries":[');
    const before = damaged.files.get(oldKey(UID));
    const d = createDiaryStore(damaged.storage);
    assert.deepEqual(await d.loadEntries(UID), []);
    assert.deepEqual(await d.saveEntry(UID, page('p', day(2))), { ok: true }, 'an old key that cannot be read does not stop a new diary');
    assert.equal(damaged.files.get(oldKey(UID)), before, 'and is left alone');

    await store.clearDiary(UID);
    f.seed(oldKey(UID), { v: 1, entries: [GOOD] });
    await store.clearDiary(UID);
    assert.equal(f.files.has(oldKey(UID)), false);
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
    for (const p of ['body-too-long', 'title-too-long', 'too-many-pages', 'diary-full', 'not-saved'] as const) {
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

  await test('leaving: when everything is on the phone the answer is "leave" at once, also for a page that is blank', async () => {
    const h = harness();
    assert.equal(await h.saver.tryLeave(), 'leave');
    h.saver.edit({ body: 'Rain on the meseta' });
    assert.equal(await h.saver.tryLeave(), 'leave');
    assert.equal(h.saved.length, 1, 'it was written first');
    assert.equal(h.clk.pending(), 0);
    assert.equal(await h.saver.tryLeave(), 'leave');
    assert.equal(h.saved.length, 1);
  });

  await test('leaving when the write fails stays once, so the reason on screen is seen, and leaves the next time; typing again starts the warning over', async () => {
    const no: SaveResult = { ok: false, reason: 'not-saved' };
    const h = harness({ answers: [no, no, no, no, no, no] });
    h.saver.edit({ body: 'x' });
    assert.equal(await h.saver.tryLeave(), 'stay');
    assert.deepEqual([h.saver.view().status, h.saver.view().problem], ['failed', 'not-saved']);
    assert.equal(await h.saver.tryLeave(), 'leave', 'the second try leaves anyway');
    assert.equal(await h.saver.tryLeave(), 'leave');
    h.saver.edit({ body: 'xy' });
    assert.equal(await h.saver.tryLeave(), 'stay', 'something was typed since: the warning is given again');
    assert.equal(await h.saver.tryLeave(), 'leave');
  });

  await test('a write that goes through after a warning ends it: a later failure warns again', async () => {
    const no: SaveResult = { ok: false, reason: 'not-saved' };
    const h = harness({ answers: [no, { ok: true }, no] });
    h.saver.edit({ body: 'a' });
    assert.equal(await h.saver.tryLeave(), 'stay');
    assert.equal(await h.saver.tryLeave(), 'leave'); // the retry (second write) went through
    assert.equal(h.saver.view().status, 'saved');
    h.saver.edit({ body: 'ab' });
    assert.equal(await h.saver.tryLeave(), 'stay', 'a new failure is a new warning');
  });

  await test('asking to leave twice at once (a double tap, the swipe and the button) is asking once', async () => {
    const no: SaveResult = { ok: false, reason: 'not-saved' };
    const h = harness({ answers: [no, no, no] });
    h.saver.edit({ body: 'x' });
    const [first, second] = await Promise.all([h.saver.tryLeave(), h.saver.tryLeave()]);
    assert.deepEqual([first, second], ['stay', 'stay']);
    assert.equal(h.saved.length, 1, 'written once');
    assert.equal(await h.saver.tryLeave(), 'leave');
  });

  await test('a page that is deleted has nothing left to complain about, so leaving it is free', async () => {
    const no: SaveResult = { ok: false, reason: 'not-saved' };
    const h = harness({ initial: page('old', day(1), { body: 'Body' }), answers: [no] });
    h.saver.edit({ body: 'Body, and more' });
    await h.saver.flush();
    assert.equal(h.saver.view().status, 'failed');
    assert.equal(await h.saver.discard(), true);
    assert.deepEqual([h.saver.view().status, h.saver.view().problem], ['saved', null]);
    assert.equal(await h.saver.tryLeave(), 'leave');
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
