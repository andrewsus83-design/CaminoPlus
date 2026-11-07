// Plain-node checks of the photos, videos and place of a diary page: what a page keeps (media.ts, place.ts), the limits, how a file is
// named and found, the words (present.ts), and the rules of the store over an injected file system (store.ts): a copy that fails
// leaves nothing behind, a page that cannot be written keeps no copy, a deleted page or a removed file is gone from the phone, the
// account's deletion removes the folder, and the sweep only ever removes what no page refers to. Then the editor's saver with files
// (autosave.ts) through the real store. No React Native. Run: npm run test:diary
import assert from 'node:assert/strict';
import { AUTOSAVE_MS, createPageSaver, type SaverDeps } from '../autosave';
import {
  DIARY_MEDIA_BYTES_MAX, DIARY_MEDIA_COUNT_MAX, MEDIA_FOLDER, MEDIA_PER_PAGE_MAX, MIN_FREE_BYTES, PHOTO_BYTES_MAX, VIDEO_BYTES_MAX, descriptorFor, extensionFor, fileCapFor, isMedia, isMediaName, looksFull, mediaDirPieces,
  mediaNamesOf, mediaOf, mediaPath, mediaStatsOf, newMediaName, parseMediaList, pathPiece, planAttach, unreferenced, type DiaryMedia, type MediaFiles, type MediaKind, type PickedAsset,
} from '../media';
import { cleanName, coordsText, isPlace, mapsUrl, nameFromAddress, normalizePlace, placeFromFix, placeLabel, roundCoord, withName, PLACE_NAME_MAX, type DiaryPlace } from '../place';
import { PLACE_EXPLAIN, PLACE_LOOKUP_NOTE, PRIVACY_LINE, attachMessage, formatBytes, formatDuration, metaLine, pageMeta, pagePreview, pageTitle, placeProblemMessage, problemMessage } from '../present';
import { ENTRIES_MAX, createDiaryStore, oldKey, slotKey, type DiaryEntry, type DiaryStorage, type SaveProblem } from '../store';

let n = 0;
const test = async (name: string, fn: () => Promise<void> | void) => {
  await Promise.race([Promise.resolve().then(fn), new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`"${name}" did not finish in 5 s`)), 5000))]);
  n += 1;
  console.log(`ok   ${name}`);
};
const settle = () => new Promise<void>((r) => setImmediate(r));
const MB = 1024 * 1024;
const UID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const day = (d: number) => new Date(Date.UTC(2026, 10, d, 12, 0, 0)).toISOString();

/* ------------------------------------------------------------------------------------------------ stand-ins for the phone */

type Event = string;
type StorageOpts = { failSets?: number[]; throwOnGet?: boolean; log?: Event[] };
/** The key-value store of the phone, as JSON text; every write is written to `log`, so a test can say what came before what. */
function memStorage(opts: StorageOpts = {}) {
  const map = new Map<string, string>();
  const unreadable = new Set<string>();
  let sets = 0;
  const storage: DiaryStorage = {
    async getJSON<T>(key: string) {
      if (opts.throwOnGet || unreadable.has(key)) throw new Error('cannot read');
      const t = map.get(key);
      return t === undefined ? null : (JSON.parse(t) as T);
    },
    async setJSON(key, value) {
      sets += 1;
      const seq = (value as { seq?: number }).seq;
      if (opts.failSets?.includes(sets)) { opts.log?.push(`write ${seq} refused`); return false; }
      map.set(key, JSON.stringify(value));
      opts.log?.push(`write ${seq}`);
      return true;
    },
    async remove(key) { map.delete(key); },
  };
  return { storage, map, unreadable, seed: (key: string, value: unknown) => { map.set(key, JSON.stringify(value)); }, stored: (key: string) => (map.has(key) ? JSON.parse(map.get(key) as string) : undefined) };
}

type FilesOpts = { free?: number | null; sizes?: Record<string, number>; modes?: Record<string, 'fail' | 'full' | 'zero' | 'stub'>; failRemove?: string[]; noList?: boolean; log?: Event[] };
/** The folder of the diary's files: name -> bytes, per person. A copy can be made to fail in the ways a phone does. */
function memFiles(opts: FilesOpts = {}) {
  const disk = new Map<string, number>();
  const calls = { copy: 0, remove: 0 };
  const key = (uid: string, name: string) => `${uid}/${name}`;
  const files: MediaFiles = {
    async copyIn(uid, source, name) {
      calls.copy += 1;
      opts.log?.push(`copy ${name}`);
      const mode = opts.modes?.[source];
      if (mode === 'fail') throw new Error('The file could not be copied');
      if (mode === 'full') throw new Error('ENOSPC: No space left on device');
      if (mode === 'stub') { disk.set(key(uid, name), 17); throw new Error('cut off half way'); }
      if (mode === 'zero') { disk.set(key(uid, name), 0); return 0; }
      const bytes = opts.sizes?.[source] ?? MB;
      disk.set(key(uid, name), bytes);
      return bytes;
    },
    async remove(uid, name) {
      calls.remove += 1;
      opts.log?.push(`remove ${name}`);
      if (opts.failRemove?.includes(name)) throw new Error('busy');
      disk.delete(key(uid, name));
      return true;
    },
    async removeAll(uid) { opts.log?.push('removeAll'); for (const k of [...disk.keys()]) if (k.startsWith(`${uid}/`)) disk.delete(k); return true; },
    async list(uid) { return opts.noList ? null : [...disk.keys()].filter((k) => k.startsWith(`${uid}/`)).map((k) => k.slice(uid.length + 1)); },
    freeSpace: () => (opts.free === undefined ? null : opts.free),
  };
  return {
    files, disk, calls,
    names: (uid = UID) => [...disk.keys()].filter((k) => k.startsWith(`${uid}/`)).map((k) => k.slice(uid.length + 1)).sort(),
    put: (uid: string, name: string, bytes = MB) => { disk.set(key(uid, name), bytes); },
    has: (uid: string, name: string) => disk.has(key(uid, name)),
  };
}

const asset = (uri: string, kind: MediaKind = 'image', over: Partial<PickedAsset> = {}): PickedAsset => ({ uri, kind, fileName: uri.split('/').pop() ?? null, mimeType: kind === 'video' ? 'video/mp4' : 'image/jpeg', width: 4000, height: 3000, bytes: 2 * MB, ...(kind === 'video' ? { durationMs: 42_000 } : {}), ...over });
const med = (id: string, kind: MediaKind = 'image', bytes = MB, over: Partial<DiaryMedia> = {}): DiaryMedia => ({ id, kind, name: `${id}.${kind === 'video' ? 'mp4' : 'jpg'}`, bytes, ...over });
const here: DiaryPlace = { lat: 42.41723, lon: -4.24771, name: 'Hontanas', at: day(5) };
const page = (id: string, createdAt: string, over: Partial<DiaryEntry> = {}): DiaryEntry => ({ id, createdAt, updatedAt: createdAt, title: '', body: `text of ${id}`, ...over });
const slotOf = (seq: number, entries: unknown[]) => ({ v: 1, seq, entries });
const A = () => slotKey(UID, 'a');
const B = () => slotKey(UID, 'b');
const ids = (list: DiaryEntry[]) => list.map((e) => e.id);
/** A store with sequential file ids (m1, m2, ...), so names are known: m1.jpg, m2.mp4. */
function setup(storageOpts: StorageOpts = {}, filesOpts: FilesOpts = {}) {
  const log: Event[] = [];
  const st = memStorage({ log, ...storageOpts });
  const fs = memFiles({ log, ...filesOpts });
  let k = 0;
  const store = createDiaryStore(st.storage, fs.files, { newId: () => `m${(k += 1)}` });
  return { st, fs, store, log };
}

// Run from diary.test.ts (the package's test script names only that file and wiring.test.ts, and its scripts are part of the app's native fingerprint).
export const finished = (async () => {
  /* ---------------------------------------------------------------- what a page keeps */

  await test('a file name is one of ours or it is nothing: it can never leave the folder', () => {
    for (const ok of ['m1.jpg', 'a0000000-0000-4000-8000-000000000001.mp4', 'IMG_2041.jpeg', 'x.heic', '0.3gp', 'a-b_c.webm']) assert.ok(isMediaName(ok), ok);
    for (const bad of ['', '.jpg', 'a', 'a.', 'a.b.jpg', '../x.jpg', '..', 'a/b.jpg', 'a\\b.jpg', 'a b.jpg', 'a.JPG', '-a.jpg', '_a.jpg', 'a.jpeg22', 'notes.txt', 'a.exe', 'a.html', 'a.mp3', 'x'.repeat(65) + '.jpg', 'é.jpg', 'a\u0000.jpg', 'a.jpg\n', ' a.jpg', 'a.j', 7, null, undefined, {}, []]) assert.ok(!isMediaName(bad), String(bad));
  });

  await test('a descriptor is strict (it decides what may become a path), reading a list of them is lenient, saving one is strict again', () => {
    assert.ok(isMedia(med('m1')) && isMedia(med('m2', 'video', 5 * MB, { width: 1920, height: 1080, durationMs: 12_000 })));
    for (const bad of [null, 'x', 7, [], {}, { ...med('m1'), id: '' }, { ...med('m1'), id: 'x'.repeat(65) }, { ...med('m1'), kind: 'audio' }, { ...med('m1'), name: '../m1.jpg' }, { ...med('m1'), bytes: 0 }, { ...med('m1'), bytes: -3 },
      { ...med('m1'), bytes: 1.5 }, { ...med('m1'), bytes: '3' }, { ...med('m1'), bytes: Infinity }, { ...med('m1'), width: 0 }, { ...med('m1'), width: 1.5 }, { ...med('m1'), height: -1 }, { ...med('m1'), durationMs: -1 }, { ...med('m1'), durationMs: NaN }]) {
      assert.ok(!isMedia(bad), JSON.stringify(bad));
    }
    const extra = { ...med('m1'), caption: 'from a newer app' };
    assert.deepEqual(mediaOf({ media: [extra, null, 'x', med('m1', 'image', 9), { ...med('m2'), name: 'm1.jpg' }, med('m3', 'video'), { id: 'bad' }] }), [med('m1'), med('m3', 'video')], 'junk, the same id twice and the same name twice are left out; extra fields are not kept');
    assert.deepEqual(mediaOf({}), []);
    assert.deepEqual(mediaOf(null), []);
    assert.deepEqual(mediaOf({ media: 'x' }), []);
    assert.equal(mediaOf({ media: Array.from({ length: 30 }, (_, i) => med(`m${i}`)) }).length, MEDIA_PER_PAGE_MAX, 'at most one page of them');
    assert.deepEqual(parseMediaList(undefined), { ok: true, media: [] });
    assert.deepEqual(parseMediaList(null), { ok: true, media: [] });
    assert.deepEqual(parseMediaList([med('m1')]), { ok: true, media: [med('m1')] });
    assert.deepEqual(parseMediaList('x'), { ok: false, reason: 'invalid' });
    assert.deepEqual(parseMediaList([med('m1'), { ...med('m1'), name: 'other.jpg' }]), { ok: false, reason: 'invalid' }, 'the same id twice');
    assert.deepEqual(parseMediaList([med('m1'), { ...med('m2'), name: 'm1.jpg' }]), { ok: false, reason: 'invalid' }, 'the same name twice');
    assert.deepEqual(parseMediaList([med('m1'), { nope: 1 }]), { ok: false, reason: 'invalid' });
    assert.deepEqual(parseMediaList(Array.from({ length: MEDIA_PER_PAGE_MAX + 1 }, (_, i) => med(`m${i}`))), { ok: false, reason: 'too-many' });
    assert.equal((parseMediaList(Array.from({ length: MEDIA_PER_PAGE_MAX }, (_, i) => med(`m${i}`))) as { ok: true }).ok, true);
  });

  await test('the numbers: 12 on a page, 100 MB a video, 30 MB a photo, 1,000 and 2 GB in the diary, 200 MB kept free', () => {
    assert.deepEqual([MEDIA_PER_PAGE_MAX, VIDEO_BYTES_MAX / MB, PHOTO_BYTES_MAX / MB, DIARY_MEDIA_COUNT_MAX, DIARY_MEDIA_BYTES_MAX / MB, MIN_FREE_BYTES / MB], [12, 100, 30, 1000, 2048, 200]);
    assert.equal(fileCapFor('video'), VIDEO_BYTES_MAX);
    assert.equal(fileCapFor('image'), PHOTO_BYTES_MAX);
  });

  await test('files and bytes in a diary are counted from the stored items, leaving out the page that is being changed, and once per file', () => {
    const items = [{ id: 'a', media: [med('m1', 'image', 3 * MB), med('m2', 'video', 40 * MB)] }, { id: 'b', media: [med('m3', 'image', MB), { id: 'bad' }] }, 'junk', null, { id: 'c' }, { id: 'd', media: [med('m1', 'image', 3 * MB)] }];
    assert.deepEqual(mediaStatsOf(items), { bytes: 47 * MB, count: 4 }, 'a file listed by two pages is counted for each page (it is on disk once, but it is a limit)');
    assert.deepEqual(mediaStatsOf(items, 'a'), { bytes: 4 * MB, count: 2 });
    assert.deepEqual(mediaStatsOf([]), { bytes: 0, count: 0 });
    assert.deepEqual(mediaNamesOf({ media: [med('m1'), { name: 'm2.mp4', junk: true }, { name: '../x.jpg' }, null, 'x'] }), ['m1.jpg', 'm2.mp4'], 'every real name is found, even in a descriptor that is not valid');
    assert.deepEqual(unreferenced([{ media: [med('m1')] }, { id: 'x', media: [{ name: 'm9.jpg' }] }], ['m1.jpg', 'm2.jpg', 'm9.jpg', 'm2.jpg']), ['m2.jpg'], 'what no page still refers to, once');
    assert.deepEqual(unreferenced([], []), []);
  });

  await test('a copy is named after its id with an extension from the file, the address or the type, and the name always passes the check', () => {
    assert.equal(newMediaName('abc', 'image', { fileName: 'IMG_0001.JPG' }), 'abc.jpg');
    assert.equal(newMediaName('abc', 'image', { uri: 'file:///x/ImagePicker/9f2.png?token=1#frag' }), 'abc.png');
    assert.equal(newMediaName('abc', 'video', { mimeType: 'video/quicktime' }), 'abc.mov');
    assert.equal(newMediaName('abc', 'image', { mimeType: 'image/heic' }), 'abc.heic');
    assert.equal(newMediaName('abc', 'image', { fileName: 'notes.txt', mimeType: 'image/webp' }), 'abc.webp', 'an extension that is not a picture one is ignored');
    assert.equal(newMediaName('abc', 'image', {}), 'abc.jpg');
    assert.equal(newMediaName('abc', 'video', {}), 'abc.mp4');
    assert.equal(newMediaName('abc', 'video', { fileName: 'a.jpg' }), 'abc.mp4', 'a picture extension on a video is ignored');
    assert.equal(extensionFor('image', { fileName: null, uri: null, mimeType: null }), 'jpg');
    for (const id of ['../../x', 'a/b', '', ' ', '-.-', '日本', 'x'.repeat(200), 'a b', '__', '.']) {
      const name = newMediaName(id, 'image', { fileName: '../../evil.jpg' });
      assert.ok(isMediaName(name), `${JSON.stringify(id)} -> ${name}`);
    }
  });

  await test('paths are built from the user id and the name each time, never stored, and nothing can climb out of the folder', () => {
    assert.deepEqual(mediaPath(UID, 'm1.jpg'), [MEDIA_FOLDER, UID, 'm1.jpg']);
    assert.deepEqual(mediaDirPieces(UID), ['diary-media', UID]);
    assert.equal(mediaPath(UID, '../m1.jpg'), null);
    assert.equal(mediaPath(UID, 'a/b.jpg'), null);
    assert.equal(mediaPath('', 'm1.jpg'), null);
    for (const hostile of ['..', '.', '../..', 'a/../b', '/etc', 'C:\\x', '', 'a b', '日本', '.hidden']) {
      const pieces = mediaDirPieces(hostile);
      assert.equal(pieces.length, 2);
      assert.ok(!/[\\/]/.test(pieces[1]) && !/^\.+$/.test(pieces[1]) && pieces[1] !== '', `${hostile} -> ${pieces[1]}`);
    }
    assert.equal(pathPiece('..'), '_');
    assert.equal(pathPiece('11111111-1111-4111-8111-111111111111'), '11111111-1111-4111-8111-111111111111');
    assert.deepEqual(mediaDirPieces(UID).slice(0, 1), ['diary-media'], 'a folder of its own: not the kv folder that signing out wipes');
  });

  await test('which of the chosen files are taken: in order, while the page has room, the file and the diary have room, and the phone keeps its 200 MB free', () => {
    const budget = { pageCount: 0, diaryBytes: 0, diaryCount: 0, freeBytes: null };
    const ok = planAttach([asset('a.jpg'), asset('b.mp4', 'video')], budget);
    assert.deepEqual([ok.accepted.length, ok.refused], [2, []]);
    // a page: 12
    const full = planAttach(Array.from({ length: 5 }, (_, i) => asset(`p${i}.jpg`)), { ...budget, pageCount: 9 });
    assert.deepEqual([full.accepted.map((a) => a.uri), full.refused.map((r) => r.reason)], [['p0.jpg', 'p1.jpg', 'p2.jpg'], ['page-full', 'page-full']]);
    // a video and a photo
    const big = planAttach([asset('v.mp4', 'video', { bytes: VIDEO_BYTES_MAX + 1 }), asset('v2.mp4', 'video', { bytes: VIDEO_BYTES_MAX }), asset('p.jpg', 'image', { bytes: PHOTO_BYTES_MAX + 1 }), asset('p2.jpg', 'image', { bytes: PHOTO_BYTES_MAX })], budget);
    assert.deepEqual(big.accepted.map((a) => a.uri), ['v2.mp4', 'p2.jpg'], 'exactly the limit is allowed');
    assert.deepEqual(big.refused.map((r) => [r.reason, r.fileName]), [['video-too-big', 'v.mp4'], ['photo-too-big', 'p.jpg']]);
    // the diary: bytes and count
    const bytes = planAttach([asset('a.mp4', 'video', { bytes: 60 * MB }), asset('b.mp4', 'video', { bytes: 60 * MB }), asset('c.jpg', 'image', { bytes: MB })], { ...budget, diaryBytes: DIARY_MEDIA_BYTES_MAX - 100 * MB });
    assert.deepEqual([bytes.accepted.map((a) => a.uri), bytes.refused.map((r) => r.reason)], [['a.mp4', 'c.jpg'], ['diary-bytes']], 'the second video does not fit, the small photo after it does');
    const count = planAttach([asset('a.jpg'), asset('b.jpg')], { ...budget, diaryCount: DIARY_MEDIA_COUNT_MAX - 1 });
    assert.deepEqual([count.accepted.length, count.refused.map((r) => r.reason)], [1, ['diary-count']]);
    // the phone
    const room = planAttach([asset('a.mp4', 'video', { bytes: 50 * MB }), asset('b.mp4', 'video', { bytes: 50 * MB })], { ...budget, freeBytes: MIN_FREE_BYTES + 60 * MB });
    assert.deepEqual([room.accepted.map((a) => a.uri), room.refused.map((r) => r.reason)], [['a.mp4'], ['disk-full']], 'the second one would leave less than 200 MB');
    assert.equal(planAttach([asset('a.jpg', 'image', { bytes: null })], { ...budget, freeBytes: MIN_FREE_BYTES - 1 }).refused[0].reason, 'disk-full', 'a size nobody told still cannot be copied into a full phone');
    assert.equal(planAttach([asset('a.jpg', 'image', { bytes: null })], { ...budget, freeBytes: null }).accepted.length, 1, 'free space not known: it is tried, and a failed copy says so');
    // nonsense
    const odd = planAttach([null as unknown as PickedAsset, { uri: '', kind: 'image' }, { uri: 'x', kind: 'audio' as MediaKind }, asset('ok.jpg')], budget);
    assert.deepEqual([odd.accepted.length, odd.refused.map((r) => r.reason)], [1, ['unusable', 'unusable', 'unusable']]);
    assert.deepEqual(planAttach([], budget), { accepted: [], refused: [] });
  });

  await test('a copy that failed because the phone is full is told from one that failed for another reason', () => {
    for (const e of [new Error('ENOSPC: no space left on device'), new Error('No space left on device'), new Error('There is not enough storage'), new Error('out of space'), new Error('Disk full'), { toString: () => 'NSFileWriteOutOfSpaceError' }, 'storage is full']) assert.ok(looksFull(e), String(e));
    for (const e of [new Error('permission denied'), new Error('not found'), null, undefined, 'x']) assert.ok(!looksFull(e), String(e));
  });

  await test('a new descriptor: the size of the copy, the size of the picture and the length of the clip when the picker told them', () => {
    assert.deepEqual(descriptorFor('m1', 'm1.jpg', asset('a.jpg'), 777), { id: 'm1', kind: 'image', name: 'm1.jpg', bytes: 777, width: 4000, height: 3000 });
    assert.deepEqual(descriptorFor('m2', 'm2.mp4', asset('a.mp4', 'video', { width: 1920.4, height: 1080 }), 5 * MB), { id: 'm2', kind: 'video', name: 'm2.mp4', bytes: 5 * MB, width: 1920, height: 1080, durationMs: 42_000 });
    assert.deepEqual(descriptorFor('m3', 'm3.jpg', asset('a.jpg', 'image', { width: 0, height: 0, durationMs: 9 }), 5), { id: 'm3', kind: 'image', name: 'm3.jpg', bytes: 5 }, 'a size the picker did not know (0) is left out, and a picture has no length');
    assert.deepEqual(descriptorFor('m4', 'm4.jpg', asset('a.jpg', 'image', { width: 10, height: null }), 5), { id: 'm4', kind: 'image', name: 'm4.jpg', bytes: 5 }, 'both sides or none');
    assert.ok(isMedia(descriptorFor('m5', 'm5.mp4', asset('a.mp4', 'video', { durationMs: -4, width: NaN }), 9)));
  });

  /* ---------------------------------------------------------------- the place */

  await test('a place is a position on the earth with the time it was read, and may have a name; the coordinates are kept to five decimals', () => {
    assert.ok(isPlace(here) && isPlace({ lat: 0, lon: 0, at: day(1) }) && isPlace({ lat: -90, lon: 180, at: day(1) }));
    for (const bad of [null, 'x', [], {}, { ...here, lat: 91 }, { ...here, lat: -90.1 }, { ...here, lon: 180.5 }, { ...here, lat: NaN }, { ...here, lon: '4' }, { ...here, at: 'yesterday' }, { ...here, at: 5 }, { ...here, name: 4 }]) assert.ok(!isPlace(bad), JSON.stringify(bad));
    assert.deepEqual(normalizePlace({ lat: 42.4172312345, lon: -4.2477098765, name: '  Hon   tanas ', at: day(1), extra: 1 }), { lat: 42.41723, lon: -4.24771, name: 'Hon tanas', at: day(1) });
    assert.deepEqual(normalizePlace({ lat: 1, lon: 2, name: '   ', at: day(1) }), { lat: 1, lon: 2, at: day(1) }, 'an empty name is no name');
    assert.equal(normalizePlace({ lat: 100, lon: 0, at: day(1) }), null);
    assert.equal(normalizePlace(undefined), null);
    assert.equal(roundCoord(1.000004), 1);
    assert.equal(roundCoord(-4.247709), -4.24771);
  });

  await test('a name is squashed and cut at 80 characters, never in the middle of an emoji', () => {
    assert.equal(cleanName('  a \n b  '), 'a b');
    assert.equal(cleanName(''), undefined);
    assert.equal(cleanName(undefined), undefined);
    assert.equal(cleanName(5), undefined);
    assert.equal(cleanName('x'.repeat(200))?.length, PLACE_NAME_MAX);
    const cut = cleanName(`${'x'.repeat(PLACE_NAME_MAX - 1)}🙏🙏`) as string;
    assert.ok(cut.length <= PLACE_NAME_MAX && !/[\ud800-\udbff]$/.test(cut), 'the pair that sat across the cut is left out');
    assert.deepEqual(withName(here, '  Hontanas, Burgos '), { ...here, name: 'Hontanas, Burgos' });
    assert.deepEqual(withName(here, '   '), { lat: here.lat, lon: here.lon, at: here.at }, 'an empty name takes the name away');
  });

  await test('a place from a position that was read: its own time when it has one, else now; nothing for numbers that are not a position', () => {
    const now = () => new Date(Date.UTC(2026, 10, 7, 8, 0, 0));
    assert.deepEqual(placeFromFix({ lat: 42.4, lon: -4.2, at: Date.UTC(2026, 10, 5, 10, 0, 0) }, 'Hontanas', now), { lat: 42.4, lon: -4.2, name: 'Hontanas', at: '2026-11-05T10:00:00.000Z' });
    assert.deepEqual(placeFromFix({ lat: 42.4, lon: -4.2 }, undefined, now), { lat: 42.4, lon: -4.2, at: '2026-11-07T08:00:00.000Z' });
    assert.deepEqual(placeFromFix({ lat: 42.4, lon: -4.2, at: '2026-11-06T09:00:00Z' }, null, now)?.at, '2026-11-06T09:00:00.000Z');
    assert.equal(placeFromFix({ lat: 95, lon: 0 }, null, now), null);
    assert.equal(placeFromFix({ lat: NaN, lon: 0 }, null, now), null);
    assert.equal(placeFromFix({ lat: 1, lon: 2, at: 'x' }, null, now)?.at, '2026-11-07T08:00:00.000Z', 'a time that does not read is now');
  });

  await test('the coordinates in words: degrees, and north or south, east or west', () => {
    assert.equal(coordsText({ lat: 42.41723, lon: -4.24771 }), '42.4172° N, 4.2477° W');
    assert.equal(coordsText({ lat: -33.8688, lon: 151.2093 }), '33.8688° S, 151.2093° E');
    assert.equal(coordsText({ lat: 0, lon: 0 }), '0.0000° N, 0.0000° E');
    assert.equal(placeLabel(here), 'Hontanas');
    assert.equal(placeLabel({ lat: 42.41723, lon: -4.24771, at: day(1) }), '42.4172° N, 4.2477° W', 'no name: the coordinates');
    assert.equal(placeLabel({ lat: 1, lon: 2, name: '   ', at: day(1) }), '1.0000° N, 2.0000° E');
  });

  await test('a name from an address: the town and its region, else what there is', () => {
    assert.equal(nameFromAddress({ city: 'Hontanas', region: 'Castilla y León', subregion: 'Burgos', country: 'Spain' }), 'Hontanas, Castilla y León');
    assert.equal(nameFromAddress({ city: 'Madrid', region: 'Madrid' }), 'Madrid', 'not said twice');
    assert.equal(nameFromAddress({ city: ' ', district: 'Triacastela', region: null }), 'Triacastela');
    assert.equal(nameFromAddress({ subregion: 'Lugo', region: 'Galicia' }), 'Lugo, Galicia');
    assert.equal(nameFromAddress({ region: 'Navarra', street: 'Camino' }), 'Navarra');
    assert.equal(nameFromAddress({ street: 'Calle Mayor', name: '12' }), 'Calle Mayor');
    assert.equal(nameFromAddress({ name: 'Fuente del Vino', country: 'Spain' }), 'Fuente del Vino');
    assert.equal(nameFromAddress({ country: 'Spain' }), 'Spain');
    assert.equal(nameFromAddress({}), undefined);
    assert.equal(nameFromAddress(null), undefined);
    assert.equal(nameFromAddress(undefined), undefined);
    assert.equal(nameFromAddress('x' as never), undefined);
    assert.ok((nameFromAddress({ city: 'x'.repeat(100), region: 'y'.repeat(100) }) as string).length <= PLACE_NAME_MAX);
  });

  await test('the maps link: a geo: link on Android, Apple Maps on iOS, OpenStreetMap elsewhere; names are encoded so they cannot break the link', () => {
    assert.equal(mapsUrl(here, 'android'), 'geo:42.41723,-4.24771?q=42.41723,-4.24771(Hontanas)');
    assert.equal(mapsUrl({ ...here, name: undefined }, 'android'), 'geo:42.41723,-4.24771?q=42.41723,-4.24771');
    assert.equal(mapsUrl(here, 'ios'), 'https://maps.apple.com/?ll=42.41723,-4.24771&q=Hontanas');
    assert.equal(mapsUrl({ ...here, name: undefined }, 'ios'), 'https://maps.apple.com/?ll=42.41723,-4.24771&q=Pinned%20place');
    assert.equal(mapsUrl(here, 'web'), 'https://www.openstreetmap.org/?mlat=42.41723&mlon=-4.24771#map=17/42.41723/-4.24771');
    assert.equal(mapsUrl(here, 'windows'), mapsUrl(here, 'web'));
    const tricky = { ...here, name: 'Albergue (San Juan) & "Casa" ?q=1#x, León' };
    const android = mapsUrl(tricky, 'android');
    assert.ok(!/[ "&#]/.test(android) && (android.match(/\(/g) ?? []).length === 1 && (android.match(/\)/g) ?? []).length === 1, android);
    assert.ok(android.endsWith('(Albergue%20%28San%20Juan%29%20%26%20%22Casa%22%20%3Fq%3D1%23x%2C%20Le%C3%B3n)'), android);
    assert.ok(!/[ "#]/.test(mapsUrl(tricky, 'ios')) && mapsUrl(tricky, 'ios').split('&').length === 2, mapsUrl(tricky, 'ios'));
    assert.equal(mapsUrl({ lat: 1e-7, lon: -0.000001, at: day(1) }, 'android'), 'geo:0.00000,-0.00000?q=0.00000,-0.00000', 'never an exponent');
  });

  /* ---------------------------------------------------------------- the words */

  await test('sizes and lengths in the words a phone uses', () => {
    assert.deepEqual([0, 512, 1536, 1024 * 1024, 38 * MB, 1.5 * 1024 * MB, 2048 * MB, 100 * MB].map(formatBytes), ['0 B', '512 B', '1.5 KB', '1 MB', '38 MB', '1.5 GB', '2 GB', '100 MB']);
    assert.equal(formatBytes(-1), '');
    assert.equal(formatBytes(NaN), '');
    assert.deepEqual([0, 999, 42_000, 725_000, 3_723_000, 36_000_000].map(formatDuration), ['0:00', '0:01', '0:42', '12:05', '1:02:03', '10:00:00']);
    assert.equal(formatDuration(-1), '');
    assert.equal(formatDuration(NaN), '');
  });

  await test('a title and a preview never show a mark of the rich text; what is attached to a page is said in a short line', () => {
    assert.equal(pageTitle({ title: '', body: '# **Hontanas** at _dusk_\nmore' }), 'Hontanas at dusk');
    assert.equal(pageTitle({ title: '', body: '- \n\n> **Slow** down' }), 'Slow down');
    assert.equal(pageTitle({ title: 'A **title** typed by hand', body: '' }), 'A **title** typed by hand', 'a title is plain text: nothing in it is a mark');
    assert.equal(pagePreview({ title: '', body: '# Hontanas\n**Cold** and _clear_.\n- soup\n- bread' }), 'Cold and clear. soup bread');
    assert.equal(pagePreview({ title: 'T', body: '**a** _b_ `c`' }), 'a b `c`');
    assert.equal(pagePreview({ title: '', body: '**only one line**' }), '');
    assert.ok(pagePreview({ title: 'T', body: `**${'word '.repeat(5000)}x**` }).length <= 200);
    assert.ok(!/[*_]{2}|^# |^- |^> /.test(pageTitle({ title: '', body: '**_x_** y' })));
    assert.equal(metaLine({}), '');
    assert.equal(metaLine({ media: [med('m1')] }), '1 photo');
    assert.equal(metaLine({ media: [med('m1'), med('m2'), med('m3', 'video')], place: here }), '2 photos · 1 video · Hontanas');
    assert.equal(metaLine({ media: [med('m1', 'video'), med('m2', 'video')] }), '2 videos');
    assert.equal(metaLine({ place: { lat: 1, lon: 2, at: day(1) } }), 'A place');
    assert.equal(metaLine({ media: [{ junk: true } as unknown as DiaryMedia], place: { lat: 999 } as unknown as DiaryPlace }), '', 'a damaged page says nothing rather than something wrong');
    assert.deepEqual(pageMeta({ media: [med('m1'), med('m2', 'video')], place: here }), { photos: 1, videos: 1, place: true, placeName: 'Hontanas' });
  });

  await test('the privacy line, and a gentle message for every refusal, with the numbers in it', () => {
    assert.equal(PRIVACY_LINE, 'Only on this phone. Pages, photos, videos and places are not uploaded and not shared. If you delete the app or lose this phone, they are gone.');
    assert.match(PLACE_EXPLAIN, /only on this phone/);
    assert.match(PLACE_EXPLAIN, /never uploaded or shared/);
    assert.match(PLACE_LOOKUP_NOTE, /map service/);
    assert.equal(attachMessage({ added: 3, refused: [], failed: null }), null, 'all went in: nothing to say');
    assert.equal(attachMessage({ added: 0, refused: [], failed: null }), null);
    const some = attachMessage({ added: 2, refused: [{ reason: 'video-too-big' }, { reason: 'video-too-big' }, { reason: 'page-full' }], failed: null });
    assert.equal(some?.tone, 'info');
    assert.match(some?.text ?? '', /^Added 2 of 5\. A video can be up to 100 MB/);
    assert.match(some?.text ?? '', /12 photos and videos/);
    const none = attachMessage({ added: 0, refused: [{ reason: 'disk-full' }], failed: null });
    assert.equal(none?.tone, 'error');
    assert.match(none?.text ?? '', /phone is almost full.*words are safe/);
    assert.deepEqual(attachMessage({ added: 0, refused: [], failed: 'not-saved' }), { tone: 'error', text: problemMessage('not-saved') });
    assert.match(attachMessage({ added: 0, refused: [{ reason: 'diary-bytes' }], failed: null })?.text ?? '', /2 GB/);
    assert.match(attachMessage({ added: 0, refused: [{ reason: 'diary-count' }], failed: null })?.text ?? '', /1,000 photos and videos/);
    assert.match(attachMessage({ added: 0, refused: [{ reason: 'photo-too-big' }], failed: null })?.text ?? '', /30 MB/);
    for (const p of ['too-many-media', 'media-full'] as SaveProblem[]) assert.ok(problemMessage(p).length > 20 && /\.$/.test(problemMessage(p)) && !/error|fail|invalid|exception/i.test(problemMessage(p)), problemMessage(p));
    for (const f of ['denied', 'blocked', 'services-off', 'timeout', 'unavailable', 'unsupported'] as const) assert.ok(placeProblemMessage(f).length > 20 && !/error|fail|invalid|exception|denied/i.test(placeProblemMessage(f)), placeProblemMessage(f));
    assert.match(placeProblemMessage('blocked'), /Settings/);
    assert.match(placeProblemMessage('services-off'), /Settings/);
  });

  /* ---------------------------------------------------------------- the store: what a page keeps */

  await test('a page keeps its photos, videos and place; saving other pages leaves them alone; a page of an earlier build reads as it did', async () => {
    const { st, store } = setup();
    const media = [med('m1', 'image', 2 * MB, { width: 4000, height: 3000 }), med('m2', 'video', 30 * MB, { durationMs: 42_000 })];
    assert.deepEqual(await store.saveEntry(UID, page('p1', day(1), { media, place: here })), { ok: true });
    assert.deepEqual(await store.saveEntry(UID, page('p2', day(2))), { ok: true });
    assert.deepEqual(await store.saveEntry(UID, page('p3', day(3), { body: 'new text' })), { ok: true });
    const list = await store.loadEntries(UID);
    assert.deepEqual(ids(list), ['p3', 'p2', 'p1']);
    assert.deepEqual(list[2].media, media);
    assert.deepEqual(list[2].place, here);
    assert.deepEqual(list[1], { id: 'p2', createdAt: day(2), updatedAt: day(2), title: '', body: 'text of p2' }, 'a page without files has no media and no place key at all');
    const a = (st.stored(A()) as { entries: Record<string, unknown>[] }).entries.find((e) => e.id === 'p2') as Record<string, unknown>;
    assert.ok(!('media' in a) && !('place' in a));
    // an edit of the text, as the editor sends it (the files and place it has)
    assert.deepEqual(await store.saveEntry(UID, { ...list[2], body: 'edited', updatedAt: day(9) }), { ok: true });
    const again = (await store.loadEntries(UID)).find((e) => e.id === 'p1') as DiaryEntry;
    assert.deepEqual([again.body, again.media, again.place], ['edited', media, here]);
  });

  await test('a page that is saved with no files and no place has none: the editor owns those two fields, and fields of a newer app stay', async () => {
    const { st, store } = setup();
    st.seed(A(), slotOf(1, [{ ...page('p1', day(1)), media: [med('m1')], place: here, mood: 'grateful' }]));
    assert.deepEqual(await store.saveEntry(UID, page('p1', day(1), { body: 'no files now' })), { ok: true });
    const raw = (st.stored(B()) as { entries: Record<string, unknown>[] }).entries[0];
    assert.ok(!('media' in raw) && !('place' in raw), 'taken off');
    assert.equal(raw.mood, 'grateful', 'a field of a newer app stays');
  });

  await test('files or a place that are not what they say are refused and nothing is stored; damaged ones in storage are left out when reading, and the page still opens', async () => {
    const { st, store, fs } = setup();
    const bad: Partial<DiaryEntry>[] = [
      { media: 'x' as never }, { media: [{ junk: 1 }] as never }, { media: [med('m1'), med('m1', 'video')] }, { media: [{ ...med('m1'), name: '../m1.jpg' }] }, { media: [{ ...med('m1'), bytes: 0 }] },
      { place: { lat: 100, lon: 0, at: day(1) } as never }, { place: 'here' as never }, { place: { lat: 1, lon: 2 } as never },
    ];
    for (const over of bad) assert.deepEqual(await store.saveEntry(UID, page('p1', day(1), over)), { ok: false, reason: 'not-saved' }, JSON.stringify(over));
    assert.deepEqual(await store.saveEntry(UID, page('p1', day(1), { media: Array.from({ length: MEDIA_PER_PAGE_MAX + 1 }, (_, i) => med(`m${i}`)) })), { ok: false, reason: 'too-many-media' });
    assert.equal(st.map.size, 0, 'nothing was written');
    assert.equal(fs.calls.remove, 0);
    st.seed(A(), slotOf(1, [{ ...page('p1', day(1)), media: [med('m1'), { junk: true }, 'x', { ...med('m2'), bytes: -1 }], place: { lat: 'x' } }, { ...page('p2', day(2)), place: here, media: 'nope' }]));
    const list = await store.loadEntries(UID);
    assert.deepEqual(ids(list), ['p2', 'p1']);
    assert.deepEqual(list[1].media, [med('m1')]);
    assert.ok(!('place' in list[1]));
    assert.deepEqual(list[0].place, here);
    assert.ok(!('media' in list[0]));
  });

  await test('a file taken off a page is deleted after the page without it is written, never before; a page that cannot be written keeps its files', async () => {
    const { store, fs, log } = setup({ failSets: [3] });
    fs.put(UID, 'm1.jpg'); fs.put(UID, 'm2.mp4', 5 * MB);
    assert.deepEqual(await store.saveEntry(UID, page('p1', day(1), { media: [med('m1'), med('m2', 'video', 5 * MB)] })), { ok: true });
    log.length = 0;
    assert.deepEqual(await store.saveEntry(UID, page('p1', day(1), { media: [med('m2', 'video', 5 * MB)] })), { ok: true });
    assert.deepEqual(log, ['write 2', 'remove m1.jpg'], 'the page first, the file after');
    assert.deepEqual(fs.names(), ['m2.mp4']);
    // the next write is the third: refused. The page keeps its file, and the file is still there.
    log.length = 0;
    assert.deepEqual(await store.saveEntry(UID, page('p1', day(1), { media: [] })), { ok: false, reason: 'not-saved' });
    assert.deepEqual(log, ['write 3 refused']);
    assert.deepEqual(fs.names(), ['m2.mp4']);
    assert.deepEqual((await store.loadEntries(UID))[0].media, [med('m2', 'video', 5 * MB)]);
    assert.deepEqual(await store.saveEntry(UID, page('p1', day(1), { media: [] })), { ok: true }, 'and the next try goes through');
    assert.deepEqual(fs.names(), []);
  });

  await test('a file that cannot be deleted does not stop the save, and the sweep takes it later', async () => {
    const { store, fs } = setup({}, { failRemove: ['m1.jpg'] });
    fs.put(UID, 'm1.jpg');
    await store.saveEntry(UID, page('p1', day(1), { media: [med('m1')] }));
    assert.deepEqual(await store.saveEntry(UID, page('p1', day(1), { media: [] })), { ok: true });
    assert.deepEqual(fs.names(), ['m1.jpg'], 'still there');
    assert.deepEqual(await store.sweepMedia(UID), 0, 'the sweep tries and it is still busy');
    assert.deepEqual(fs.names(), ['m1.jpg']);
    const { store: s2, fs: f2 } = setup();
    f2.put(UID, 'm1.jpg');
    assert.equal(await s2.sweepMedia(UID), 0, 'with no diary at all (not read from a slot) nothing is swept');
  });

  await test('the limits are checked on what a save makes of the diary: files on a page, in all, and bytes; a save that is not bigger always goes through', async () => {
    const { st, store } = setup();
    const huge = (i: number, bytes: number) => ({ ...page(`h${i}`, day(1)), media: [med(`h${i}`, 'image', bytes)] });
    st.seed(A(), slotOf(1, Array.from({ length: 63 }, (_, i) => huge(i, 32 * MB)))); // 63 x 32 MB = 2016 MB
    assert.deepEqual(await store.saveEntry(UID, page('big', day(2), { media: [med('big1', 'image', 32 * MB)] })), { ok: true }, 'exactly 2048 MB is allowed');
    const before = JSON.stringify(st.stored(A())) + JSON.stringify(st.stored(B()));
    assert.deepEqual(await store.saveEntry(UID, page('more', day(3), { media: [med('more1', 'image', 1)] })), { ok: false, reason: 'media-full' }, 'one byte more is not');
    assert.equal(JSON.stringify(st.stored(A())) + JSON.stringify(st.stored(B())), before, 'a refusal writes nothing');
    assert.deepEqual(await store.saveEntry(UID, page('big', day(2), { media: [med('big1', 'image', 16 * MB)] })), { ok: true }, 'a page that gets smaller is saved, in a full diary');
    assert.deepEqual(await store.saveEntry(UID, page('more', day(3), { media: [med('more1', 'image', MB)] })), { ok: true }, 'which makes room again');
    // the count
    const { st: s2, store: store2 } = setup();
    s2.seed(A(), slotOf(1, Array.from({ length: 100 }, (_, i) => ({ ...page(`c${i}`, day(1)), media: Array.from({ length: 10 }, (_, k) => med(`c${i}k${k}`, 'image', 1)) }))));
    assert.deepEqual(await store2.saveEntry(UID, page('last', day(2), { media: [med('l1', 'image', 1)] })), { ok: false, reason: 'media-full' }, '1,000 files in all');
    assert.deepEqual(await store2.saveEntry(UID, page('c0', day(1), { media: Array.from({ length: 9 }, (_, k) => med(`c0k${k}`, 'image', 1)) })), { ok: true });
    assert.deepEqual(await store2.saveEntry(UID, page('last', day(2), { media: [med('l1', 'image', 1)] })), { ok: true });
  });

  /* ---------------------------------------------------------------- the store: adding files */

  await test('adding files copies them into the diary folder, writes their descriptors with the real size, and creates the page when it is new', async () => {
    const { store, fs, st } = setup({}, { sizes: { 'file:///tmp/a.jpg': 3 * MB, 'file:///tmp/b.mov': 20 * MB } });
    const entry = page('p1', day(1), { title: 'Day one', body: 'Cold and clear.' });
    const res = await store.attachMedia(UID, entry, [asset('file:///tmp/a.jpg', 'image', { bytes: null }), asset('file:///tmp/b.mov', 'video', { mimeType: 'video/quicktime', fileName: 'b.mov' })]);
    assert.ok(res.ok);
    if (!res.ok) return;
    assert.deepEqual(res.added, [{ id: 'm1', kind: 'image', name: 'm1.jpg', bytes: 3 * MB, width: 4000, height: 3000 }, { id: 'm2', kind: 'video', name: 'm2.mov', bytes: 20 * MB, width: 4000, height: 3000, durationMs: 42_000 }]);
    assert.deepEqual(res.refused, []);
    assert.deepEqual(fs.names(), ['m1.jpg', 'm2.mov']);
    const stored = (await store.loadEntries(UID))[0];
    assert.deepEqual([stored.id, stored.title, stored.body], ['p1', 'Day one', 'Cold and clear.'], 'the page was created, with the text typed so far');
    assert.deepEqual(stored.media, res.added);
    assert.ok(st.stored(A()), 'written');
    // more, onto the page as the editor now has it
    const more = await store.attachMedia(UID, { ...entry, media: res.added }, [asset('file:///tmp/c.png', 'image')]);
    assert.ok(more.ok && more.added.length === 1);
    assert.deepEqual((await store.loadEntries(UID))[0].media?.map((m) => m.id), ['m1', 'm2', 'm3']);
    assert.deepEqual(fs.names(), ['m1.jpg', 'm2.mov', 'm3.png']);
  });

  await test('the limits when adding: 12 on a page, 100 MB a video, 30 MB a photo, the diary and the phone; each refused file says why, the others are added', async () => {
    const { store, fs } = setup({}, { free: MIN_FREE_BYTES + 500 * MB });
    const entry = page('p1', day(1));
    const first = await store.attachMedia(UID, entry, [asset('v.mp4', 'video', { bytes: VIDEO_BYTES_MAX + 1 }), asset('p.jpg', 'image', { bytes: PHOTO_BYTES_MAX + 1 }), asset('ok.jpg')]);
    assert.ok(first.ok && first.added.length === 1 && first.refused.map((r) => r.reason).join() === 'video-too-big,photo-too-big');
    // the page: 12
    const eleven = Array.from({ length: 11 }, (_, i) => asset(`f${i}.jpg`));
    const fill = await store.attachMedia(UID, { ...entry, media: first.ok ? first.added : [] }, eleven);
    assert.ok(fill.ok && fill.added.length === 11 && fill.refused.length === 0);
    const all = [...(first.ok ? first.added : []), ...(fill.ok ? fill.added : [])];
    assert.equal(all.length, MEDIA_PER_PAGE_MAX);
    const copiesBefore = fs.calls.copy;
    const over = await store.attachMedia(UID, { ...entry, media: all }, [asset('x.jpg'), asset('y.mp4', 'video')]);
    assert.ok(over.ok && over.added.length === 0 && over.refused.map((r) => r.reason).join() === 'page-full,page-full');
    assert.equal(fs.calls.copy, copiesBefore, 'a refused file is not even copied');
    assert.equal(fs.names().length, 12);
    // the phone: 500 MB of room over its own 200 MB, and the first 60 MB video takes it from 500 to 440
    const { store: s2, fs: f2 } = setup({}, { free: MIN_FREE_BYTES + 100 * MB });
    const room = await s2.attachMedia(UID, page('p2', day(2)), [asset('a.mp4', 'video', { bytes: 60 * MB }), asset('b.mp4', 'video', { bytes: 60 * MB })]);
    assert.ok(room.ok && room.added.length === 1 && room.refused[0].reason === 'disk-full');
    assert.equal(f2.names().length, 1);
  });

  await test('the whole diary: when the other pages already use the room, a new file is refused with the numbers in the message', async () => {
    const { st, store, fs } = setup();
    st.seed(A(), slotOf(1, Array.from({ length: 64 }, (_, i) => ({ ...page(`h${i}`, day(1)), media: [med(`h${i}`, 'image', 32 * MB)] })))); // 2048 MB: full
    const res = await store.attachMedia(UID, page('p1', day(2)), [asset('a.jpg')]);
    assert.ok(res.ok && res.added.length === 0);
    assert.equal(res.ok && res.refused[0].reason, 'diary-bytes');
    assert.equal(fs.calls.copy, 0);
    const msg = attachMessage({ added: 0, refused: res.ok ? res.refused : [], failed: null });
    assert.match(msg?.text ?? '', /2 GB/);
    // the page being changed does not count against itself
    const { st: s2, store: store2 } = setup();
    s2.seed(A(), slotOf(1, [{ ...page('p1', day(1)), media: [med('m0', 'image', 30 * MB)] }, ...Array.from({ length: 63 }, (_, i) => ({ ...page(`h${i}`, day(2)), media: [med(`h${i}`, 'image', 32 * MB)] }))]));
    const ok = await store2.attachMedia(UID, page('p1', day(1), { media: [med('m0', 'image', 30 * MB)] }), [asset('a.jpg', 'image', { bytes: 2 * MB })]);
    assert.ok(ok.ok && ok.added.length === 1, 'exactly 2048 MB with the new file');
  });

  await test('a copy that fails leaves nothing behind and the others still go in: not copied, phone full, nothing copied, or cut off half way', async () => {
    const { store, fs } = setup({}, { modes: { 'bad.jpg': 'fail', 'full.jpg': 'full', 'zero.jpg': 'zero', 'stub.jpg': 'stub' } });
    const res = await store.attachMedia(UID, page('p1', day(1)), [asset('bad.jpg'), asset('full.jpg'), asset('zero.jpg'), asset('stub.jpg'), asset('good.jpg')]);
    assert.ok(res.ok);
    if (!res.ok) return;
    assert.equal(res.added.length, 1);
    assert.deepEqual(res.refused.map((r) => [r.reason, r.fileName]), [['copy-failed', 'bad.jpg'], ['disk-full', 'full.jpg'], ['copy-failed', 'zero.jpg'], ['copy-failed', 'stub.jpg']]);
    assert.deepEqual(fs.names(), ['m5.jpg'], 'only the good one is on the phone: no stub, no empty file');
    assert.deepEqual((await store.loadEntries(UID))[0].media, res.added);
    const all = await store.attachMedia(UID, page('p2', day(2)), [asset('bad.jpg'), asset('stub.jpg')]);
    assert.ok(all.ok && all.added.length === 0 && all.refused.length === 2);
    assert.deepEqual(ids(await store.loadEntries(UID)), ['p1'], 'when none went in, no page was created for them');
    assert.deepEqual(fs.names(), ['m5.jpg']);
  });

  await test('a size the picker did not tell is measured on the copy: a file over its limit is deleted again and refused', async () => {
    const { store, fs } = setup({}, { sizes: { 'big.mp4': VIDEO_BYTES_MAX + 1, 'bigphoto.jpg': PHOTO_BYTES_MAX + 1, 'ok.jpg': MB } });
    const res = await store.attachMedia(UID, page('p1', day(1)), [asset('big.mp4', 'video', { bytes: null }), asset('bigphoto.jpg', 'image', { bytes: 0 }), asset('ok.jpg', 'image', { bytes: undefined })]);
    assert.ok(res.ok);
    if (!res.ok) return;
    assert.deepEqual(res.refused.map((r) => r.reason), ['video-too-big', 'photo-too-big']);
    assert.deepEqual(fs.names(), ['m3.jpg']);
    const { st, store: s2, fs: f2 } = setup({}, { sizes: { 'a.jpg': 20 * MB, 'b.jpg': 20 * MB } });
    st.seed(A(), slotOf(1, Array.from({ length: 63 }, (_, i) => ({ ...page(`h${i}`, day(1)), media: [med(`h${i}`, 'image', 32 * MB)] }))));
    const tight = await s2.attachMedia(UID, page('p', day(2)), [asset('a.jpg', 'image', { bytes: null }), asset('b.jpg', 'image', { bytes: null })]);
    assert.ok(tight.ok && tight.added.length === 1 && tight.refused[0].reason === 'diary-bytes', 'the second would pass the 2 GB of the diary once measured');
    assert.deepEqual(f2.names(), ['m1.jpg']);
  });

  await test('when the page cannot be written, every copy made for it is deleted, nothing is added, and the page is as it was', async () => {
    const { store, fs } = setup({ failSets: [2] });
    await store.saveEntry(UID, page('p1', day(1), { body: 'before' }));
    const res = await store.attachMedia(UID, page('p1', day(1), { body: 'before, and more words' }), [asset('a.jpg'), asset('b.mp4', 'video'), asset('c.jpg')]);
    assert.deepEqual(res, { ok: false, reason: 'not-saved' });
    assert.deepEqual(fs.names(), [], 'no copy is left');
    assert.equal(fs.calls.copy, 3);
    assert.deepEqual((await store.loadEntries(UID)).map((e) => [e.body, e.media]), [['before', undefined]]);
    const ok = await store.attachMedia(UID, page('p1', day(1), { body: 'before, and more words' }), [asset('a.jpg')]);
    assert.ok(ok.ok && ok.added.length === 1, 'and the next try goes through');
    assert.equal((await store.loadEntries(UID))[0].body, 'before, and more words', 'with the text that went along');
  });

  await test('adding files when neither slot can be read does nothing: no copy is made, nothing is written', async () => {
    const { st, store, fs } = setup();
    st.seed(A(), slotOf(7, [page('p1', day(1))])); st.seed(B(), slotOf(6, [page('p1', day(1))]));
    st.unreadable.add(A()); st.unreadable.add(B());
    const before = [st.map.get(A()), st.map.get(B())];
    assert.deepEqual(await store.attachMedia(UID, page('p2', day(2)), [asset('a.jpg')]), { ok: false, reason: 'not-saved' });
    assert.equal(fs.calls.copy, 0);
    assert.deepEqual([st.map.get(A()), st.map.get(B())], before);
    // and the page itself must be one that can be written
    const { store: s2, fs: f2 } = setup();
    assert.deepEqual(await s2.attachMedia(UID, page('p', day(1), { body: 'x'.repeat(20_001) }), [asset('a.jpg')]), { ok: false, reason: 'body-too-long' });
    assert.deepEqual(await s2.attachMedia('', page('p', day(1)), [asset('a.jpg')]), { ok: false, reason: 'not-saved' });
    assert.deepEqual(await s2.attachMedia(UID, page('p', day(1), { media: 'x' as never }), [asset('a.jpg')]), { ok: false, reason: 'not-saved' });
    assert.equal(f2.calls.copy, 0);
    const none = await s2.attachMedia(UID, page('p', day(1)), 'not a list' as never);
    assert.ok(none.ok && none.added.length === 0);
  });

  await test('a file system that throws for everything cannot break saving words: the page is saved, the files are refused', async () => {
    const files: MediaFiles = { copyIn: () => { throw new Error('no'); }, remove: () => { throw new Error('no'); }, removeAll: () => { throw new Error('no'); }, list: () => { throw new Error('no'); }, freeSpace: () => { throw new Error('no'); } };
    const st = memStorage();
    const store = createDiaryStore(st.storage, files);
    assert.deepEqual(await store.saveEntry(UID, page('p1', day(1), { media: [med('m1')] })), { ok: true });
    assert.deepEqual(await store.saveEntry(UID, page('p1', day(1), { media: [] })), { ok: true }, 'a file that cannot be removed is no reason to lose the words');
    const res = await store.attachMedia(UID, page('p1', day(1)), [asset('a.jpg')]);
    assert.deepEqual(res, { ok: false, reason: 'not-saved' }, 'even the free-space question throwing is an answer, not a crash');
    assert.equal(await store.sweepMedia(UID), 0);
    assert.equal(await store.deleteEntry(UID, 'p1'), true);
    await store.clearDiary(UID);
    assert.deepEqual(await store.loadEntries(UID), []);
  });

  /* ---------------------------------------------------------------- the store: deleting */

  await test('deleting a page deletes its files, after the page is gone from both slots; the files of other pages stay', async () => {
    const { store, fs, log } = setup();
    fs.put(UID, 'm1.jpg'); fs.put(UID, 'm2.mp4'); fs.put(UID, 'm3.jpg');
    await store.saveEntry(UID, page('keep', day(1), { media: [med('m3')] }));
    await store.saveEntry(UID, page('gone', day(2), { media: [med('m1'), med('m2', 'video')], place: here }));
    log.length = 0;
    assert.equal(await store.deleteEntry(UID, 'gone'), true);
    assert.deepEqual(log, ['write 3', 'write 4', 'remove m1.jpg', 'remove m2.mp4'], 'the new state, the scrub of the older slot, and only then the files');
    assert.deepEqual(fs.names(), ['m3.jpg']);
    assert.deepEqual(ids(await store.loadEntries(UID)), ['keep']);
  });

  await test('a delete that cannot be written keeps the files, and a name still used by another page is not deleted', async () => {
    const { store, fs } = setup({ failSets: [3] });
    fs.put(UID, 'm1.jpg');
    await store.saveEntry(UID, page('a', day(1), { media: [med('m1')] }));
    await store.saveEntry(UID, page('b', day(2), { media: [med('m1')] }), );
    assert.equal(await store.deleteEntry(UID, 'b'), false, 'the write was refused');
    assert.deepEqual(fs.names(), ['m1.jpg']);
    assert.equal(await store.deleteEntry(UID, 'b'), true);
    assert.deepEqual(fs.names(), ['m1.jpg'], 'page a still refers to it');
    assert.equal(await store.deleteEntry(UID, 'a'), true);
    assert.deepEqual(fs.names(), []);
    assert.equal(await store.deleteEntry(UID, 'never-there'), true);
  });

  await test('deleting the account removes the whole folder of the diary and nothing of another account; signing out does not touch it', async () => {
    const { st, store, fs } = setup();
    fs.put(UID, 'm1.jpg'); fs.put(UID, 'orphan.jpg'); fs.put(OTHER, 'o1.jpg');
    await store.saveEntry(UID, page('p1', day(1), { media: [med('m1')] }));
    await store.saveEntry(OTHER, page('q1', day(1), { media: [med('o1')] }));
    // signing out wipes the keys that start with u.<id>. (lib/auth.tsx) and nothing else: neither the slots nor the folder
    for (const key of [...st.map.keys()]) if (key.startsWith(`u.${UID}.`)) st.map.delete(key);
    assert.deepEqual(fs.names(), ['m1.jpg', 'orphan.jpg'], 'the files are not keys of the phone store at all');
    assert.deepEqual(ids(await store.loadEntries(UID)), ['p1']);
    await store.clearDiary(UID);
    assert.deepEqual(fs.names(), [], 'the folder is gone, also what no page referred to');
    assert.deepEqual(fs.names(OTHER), ['o1.jpg'], "another account's files stay");
    assert.deepEqual(await store.loadEntries(UID), []);
    assert.ok(!st.map.has(A()) && !st.map.has(B()) && !st.map.has(oldKey(UID)));
    await store.clearDiary('');
  });

  /* ---------------------------------------------------------------- the store: the sweep */

  await test('the sweep deletes the files no page refers to, only names this diary makes, and leaves everything else', async () => {
    const { store, fs } = setup();
    await store.saveEntry(UID, page('p1', day(1), { media: [med('m1'), med('m2', 'video')] }));
    fs.put(UID, 'm1.jpg'); fs.put(UID, 'm2.mp4'); fs.put(UID, 'orphan1.jpg'); fs.put(UID, 'orphan2.mov'); fs.put(UID, 'notes.txt'); fs.put(UID, 'Weird Name.JPG'); fs.put(OTHER, 'theirs.jpg');
    assert.equal(await store.sweepMedia(UID), 2);
    assert.deepEqual(fs.names(), ['Weird Name.JPG', 'm1.jpg', 'm2.mp4', 'notes.txt']);
    assert.deepEqual(fs.names(OTHER), ['theirs.jpg'], "another account's folder is not looked at");
    assert.equal(await store.sweepMedia(UID), 0, 'and a second sweep has nothing to do');
    assert.equal(await store.sweepMedia(''), 0);
  });

  await test('the sweep keeps a name that a stored item still lists, whatever else is wrong with the item or the page', async () => {
    const { st, store, fs } = setup();
    st.seed(A(), slotOf(1, [{ id: 'x', media: [{ name: 'future.jpg', kind: 'sticker' }] }, 'junk', { id: 'p', title: 1, media: [med('m1')] }]));
    fs.put(UID, 'future.jpg'); fs.put(UID, 'm1.jpg'); fs.put(UID, 'orphan.jpg');
    assert.equal(await store.sweepMedia(UID), 1);
    assert.deepEqual(fs.names(), ['future.jpg', 'm1.jpg']);
  });

  await test('the sweep only runs when the diary was read from a valid slot and no slot is unreadable or from a newer app, or when the folder cannot be listed', async () => {
    const cases: [string, (st: ReturnType<typeof memStorage>) => void][] = [
      ['no slot at all', () => undefined],
      ['one slot unreadable', (st) => { st.seed(A(), slotOf(2, [page('p', day(1))])); st.seed(B(), slotOf(1, [page('p', day(1))])); st.unreadable.add(B()); }],
      ['one slot from a newer app', (st) => { st.seed(A(), slotOf(2, [page('p', day(1))])); st.seed(B(), { v: 2, seq: 9, entries: [{ id: 'later', media: [{ name: 'orphan.jpg' }] }] }); }],
      ['one slot damaged', (st) => { st.seed(A(), slotOf(2, [page('p', day(1))])); st.map.set(B(), '{"v":1,"seq":'); st.unreadable.add(B()); }],
      ['the old single key only', (st) => { st.seed(oldKey(UID), { v: 1, entries: [page('p', day(1))] }); }],
      ['neither readable', (st) => { st.seed(A(), slotOf(2, [])); st.seed(B(), slotOf(1, [])); st.unreadable.add(A()); st.unreadable.add(B()); }],
    ];
    for (const [what, arrange] of cases) {
      const { st, store, fs } = setup();
      arrange(st);
      fs.put(UID, 'orphan.jpg');
      assert.equal(await store.sweepMedia(UID), 0, what);
      assert.deepEqual(fs.names(), ['orphan.jpg'], `${what}: nothing was deleted`);
    }
    const noList = setup({}, { noList: true });
    await noList.store.saveEntry(UID, page('p', day(1)));
    noList.fs.put(UID, 'orphan.jpg');
    assert.equal(await noList.store.sweepMedia(UID), 0, 'a folder that cannot be listed');
    assert.deepEqual(noList.fs.names(), ['orphan.jpg']);
  });

  await test('everything the store does with files takes its turn: a sweep or a save asked while files are being copied waits for them, so a file is never swept before its page is written', async () => {
    const log: Event[] = [];
    const st = memStorage({ log });
    const slow = memFiles({ log });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    const files: MediaFiles = { ...slow.files, copyIn: async (uid, source, name) => { log.push(`copy start ${name}`); await gate; return slow.files.copyIn(uid, source, name); } };
    let k = 0;
    const store = createDiaryStore(st.storage, files, { newId: () => `m${(k += 1)}` });
    const adding = store.attachMedia(UID, page('p1', day(1)), [asset('a.jpg')]);
    await settle();
    const swept = store.sweepMedia(UID);
    const saved = store.saveEntry(UID, page('p2', day(2)));
    const listed = store.loadEntries(UID);
    await settle();
    assert.deepEqual(log, ['copy start m1.jpg'], 'nothing else has started');
    release();
    const [added, gone, ok, pages] = await Promise.all([adding, swept, saved, listed]);
    assert.ok(added.ok && added.added.length === 1);
    assert.equal(gone, 0, 'the sweep saw the page with its file');
    assert.deepEqual(ok, { ok: true });
    assert.deepEqual(ids(pages), ['p2', 'p1']);
    assert.deepEqual(slow.names(), ['m1.jpg']);
    assert.deepEqual(log, ['copy start m1.jpg', 'copy m1.jpg', 'write 1', 'write 2']);
  });

  await test('a diary with 2,000 pages and a thousand files still saves, and the number of pages is still the limit', async () => {
    const { st, store } = setup();
    st.seed(A(), slotOf(1, Array.from({ length: ENTRIES_MAX }, (_, i) => ({ ...page(`p${i}`, new Date(Date.UTC(2020, 0, 1) + i * 60_000).toISOString()), ...(i < 100 ? { media: Array.from({ length: 10 }, (_, k) => med(`k${i}x${k}`, 'image', 1000)) } : {}) }))));
    assert.deepEqual(await store.saveEntry(UID, page('one-too-many', day(1))), { ok: false, reason: 'too-many-pages' });
    assert.deepEqual(await store.saveEntry(UID, page('p500', new Date(Date.UTC(2020, 0, 1) + 500 * 60_000).toISOString(), { body: 'edited' })), { ok: true });
  });

  /* ---------------------------------------------------------------- the saver with files, through the real store */

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
  function saverOver(setupOpts: { storage?: StorageOpts; files?: FilesOpts } = {}, initial: DiaryEntry | null = null) {
    const s = setup(setupOpts.storage, setupOpts.files);
    const clk = clock();
    let ids = 0;
    const deps: SaverDeps = {
      save: (e) => s.store.saveEntry(UID, e),
      remove: (id) => s.store.deleteEntry(UID, id),
      attach: (e, picked) => s.store.attachMedia(UID, e, picked),
      newId: () => `page-${(ids += 1)}`,
      setTimer: clk.setTimer, clearTimer: clk.clearTimer,
    };
    const saver = createPageSaver(deps, initial);
    return { ...s, saver, clk };
  }

  await test('adding files takes its turn with the text: a save pending before it and text typed after it both land, in order, and nothing races', async () => {
    const h = saverOver({ files: { sizes: {} } });
    h.saver.edit({ body: 'Morning in Hontanas.' });
    const adding = h.saver.attach([asset('a.jpg'), asset('b.mp4', 'video')]);
    h.saver.edit({ body: 'Morning in Hontanas. Soup at noon.' }); // typed while the files are being copied
    const outcome = await adding;
    assert.deepEqual([outcome.added, outcome.refused, outcome.failed], [2, [], null]);
    assert.equal(h.saver.view().media.length, 2);
    assert.equal(h.saver.view().stored, true);
    await h.clk.advance(AUTOSAVE_MS);
    const saved = (await h.store.loadEntries(UID))[0];
    assert.equal(saved.body, 'Morning in Hontanas. Soup at noon.', 'the text typed during the copy is there');
    assert.deepEqual(saved.media?.map((m) => m.name), ['m1.jpg', 'm2.mp4']);
    assert.equal(saved.id, 'page-1');
    assert.equal(h.saver.view().status, 'saved');
    // 2 writes: the files with the text typed before them, then the text typed after
    assert.deepEqual(h.log.filter((e) => e.startsWith('write')), ['write 1', 'write 2']);
  });

  await test('a page with only a photo is a page: leaving does not take it back; taking the photo off a page begun here takes the page back', async () => {
    const h = saverOver();
    const out = await h.saver.attach([asset('a.jpg')]);
    assert.equal(out.added, 1);
    assert.equal(h.saver.view().stored, true, 'created by the photo, with no text');
    assert.equal(await h.saver.tryLeave(), 'leave');
    assert.deepEqual(ids(await h.store.loadEntries(UID)), ['page-1']);
    assert.deepEqual(h.fs.names(), ['m1.jpg']);
    h.saver.removeMedia('m1');
    await h.saver.flush();
    assert.deepEqual(await h.store.loadEntries(UID), [], 'blank again: it leaves no trace');
    assert.deepEqual(h.fs.names(), [], 'nor does its file');
    assert.equal(h.saver.view().stored, false);
    assert.equal(h.saver.view().media.length, 0);
  });

  await test('a page opened from the list is never taken back, even when its last photo is removed and no words are left', async () => {
    const h0 = setup();
    await h0.store.saveEntry(UID, page('old', day(1), { body: '', media: [med('m9')] }));
    h0.fs.put(UID, 'm9.jpg');
    const clk = clock();
    const initial = (await h0.store.loadEntries(UID))[0];
    const saver = createPageSaver({ save: (e) => h0.store.saveEntry(UID, e), remove: (id) => h0.store.deleteEntry(UID, id), attach: (e, p) => h0.store.attachMedia(UID, e, p), newId: () => 'x', setTimer: clk.setTimer, clearTimer: clk.clearTimer }, initial);
    assert.deepEqual(saver.view().media.map((m) => m.id), ['m9']);
    saver.removeMedia('m9');
    await saver.flush();
    assert.deepEqual(ids(await h0.store.loadEntries(UID)), ['old']);
    assert.equal(h0.fs.names().length, 0, 'the file went');
  });

  await test('a refused file says why and changes nothing; a page that cannot be written says so, keeps no file, and the next flush writes the text again', async () => {
    const h = saverOver({ files: { modes: { 'bad.jpg': 'fail' } } });
    h.saver.edit({ body: 'words' });
    const out = await h.saver.attach([asset('bad.jpg')]);
    assert.deepEqual([out.added, out.refused.map((r) => r.reason), out.failed], [0, ['copy-failed'], null]);
    assert.equal(h.saver.view().media.length, 0);
    assert.equal(h.saver.view().problem, null);
    // a page that cannot be written
    const g = saverOver({ storage: { failSets: [1, 2] } }); // the write of the files, and the retry when leaving
    g.saver.edit({ body: 'words that must not be lost' });
    const failed = await g.saver.attach([asset('a.jpg'), asset('b.jpg')]);
    assert.deepEqual([failed.added, failed.failed], [0, 'not-saved']);
    assert.deepEqual(g.fs.names(), [], 'no copy is kept');
    assert.deepEqual([g.saver.view().status, g.saver.view().problem, g.saver.view().media.length], ['failed', 'not-saved', 0]);
    assert.equal(await g.saver.tryLeave(), 'stay', 'the reason is on screen first');
    assert.deepEqual(await g.saver.flush(), { ok: true }, 'the next write goes through with the same words');
    assert.equal((await g.store.loadEntries(UID))[0].body, 'words that must not be lost');
    assert.deepEqual([g.saver.view().status, g.saver.view().stored], ['saved', true]);
  });

  await test('removing a file, and putting a place on the page or taking it off, is written at once; a name typed for the place waits like text; nothing changed writes nothing', async () => {
    const h = saverOver();
    h.saver.edit({ body: 'Hontanas' });
    await h.clk.advance(AUTOSAVE_MS);
    await h.saver.attach([asset('a.jpg')]);
    const writes = () => h.log.filter((e) => e.startsWith('write ')).length;
    const w0 = writes();
    h.saver.setPlace({ lat: 42.4172, lon: -4.2477, at: day(5) });
    await settle();
    assert.equal(writes(), w0 + 1, 'at once');
    assert.deepEqual((await h.store.loadEntries(UID))[0].place, { lat: 42.4172, lon: -4.2477, at: day(5) });
    assert.equal(h.saver.view().place?.lat, 42.4172);
    h.saver.setPlace({ lat: 42.4172, lon: -4.2477, name: 'Hon', at: day(5) }, { soon: true });
    h.saver.setPlace({ lat: 42.4172, lon: -4.2477, name: 'Hontanas', at: day(5) }, { soon: true });
    await settle();
    assert.equal(writes(), w0 + 1, 'a name being typed waits');
    assert.equal(h.saver.view().status, 'saving');
    await h.clk.advance(AUTOSAVE_MS);
    assert.equal(writes(), w0 + 2, 'and then one write for all of it');
    assert.equal((await h.store.loadEntries(UID))[0].place?.name, 'Hontanas');
    const w2 = writes();
    h.saver.setPlace({ lat: 999, lon: 0, at: 'x' } as never);
    await settle();
    assert.equal(h.saver.view().place?.name, 'Hontanas', 'a place that is not one is ignored: the place that is on the page stays');
    assert.equal(writes(), w2, 'and nothing is written for it');
    h.saver.setPlace(null);
    await settle();
    assert.ok(!(await h.store.loadEntries(UID))[0].place, 'taken off');
    h.saver.setPlace({ lat: 999, lon: 0, at: 'x' } as never);
    assert.equal(h.saver.view().place, null, 'a place that is not one puts nothing on the page');
    const w1 = writes();
    h.saver.removeMedia('does-not-exist');
    await h.saver.flush();
    assert.equal(writes(), w1, 'nothing changed: nothing written');
    h.saver.removeMedia('m1');
    await settle();
    assert.equal(writes(), w1 + 1);
    assert.deepEqual(h.fs.names(), [], 'the file went with it');
    assert.equal(h.saver.view().rev > 0, true);
  });

  await test('the view tells the screen about every change of the files and the place, once each, and says "Saving…" while files are copied', async () => {
    const h = saverOver();
    const views: string[] = [];
    // wrap by polling the view around operations: rev goes up on each change
    const revs: number[] = [h.saver.view().rev];
    h.saver.edit({ body: 'x' });
    await h.clk.advance(AUTOSAVE_MS);
    revs.push(h.saver.view().rev);
    const adding = h.saver.attach([asset('a.jpg')]);
    views.push(h.saver.view().status);
    await adding;
    revs.push(h.saver.view().rev);
    h.saver.setPlace(here);
    revs.push(h.saver.view().rev);
    h.saver.removeMedia('m1');
    revs.push(h.saver.view().rev);
    assert.deepEqual(views, ['saving']);
    assert.deepEqual(revs, [0, 0, 1, 2, 3], 'typing does not move it; each change of the files or the place does');
    await h.saver.flush();
    assert.equal(h.saver.view().status, 'saved');
  });

  await test('a deleted page goes with its files while an add is still running: the add finishes first, then the page and every file are gone', async () => {
    const h = saverOver();
    h.saver.edit({ body: 'words' });
    await h.saver.flush();
    const adding = h.saver.attach([asset('a.jpg'), asset('b.jpg')]);
    const gone = h.saver.discard();
    assert.equal(await gone, true);
    await adding;
    assert.deepEqual(await h.store.loadEntries(UID), []);
    assert.deepEqual(h.fs.names(), [], 'no file of a deleted page stays on the phone');
    const late = await h.saver.attach([asset('c.jpg')]);
    assert.deepEqual([late.added, h.fs.names()], [0, []], 'and nothing can be added to a page that is gone');
  });

  await test('typing, adding photos, leaving and coming back through the real store: the page has its words, photos, video and place, and a second editor sees the same', async () => {
    const h = saverOver({ files: { sizes: { 'v.mp4': 30 * MB } } });
    h.saver.edit({ title: 'Hontanas', body: '# Hontanas\n**Cold** and clear.\n- soup\n- bread' });
    const out = await h.saver.attach([asset('p.jpg'), asset('v.mp4', 'video')]);
    assert.equal(out.added, 2);
    h.saver.setPlace(here);
    void h.saver.flush(); // leaving: not awaited, like the screen going away
    const list = await h.store.loadEntries(UID);
    assert.equal(list.length, 1);
    assert.deepEqual([list[0].title, list[0].body], ['Hontanas', '# Hontanas\n**Cold** and clear.\n- soup\n- bread']);
    assert.deepEqual(list[0].media?.map((m) => [m.kind, m.bytes]), [['image', MB], ['video', 30 * MB]]);
    assert.deepEqual(list[0].place, here);
    assert.equal(metaLine(list[0]), '1 photo · 1 video · Hontanas');
    assert.equal(pageTitle(list[0]), 'Hontanas');
    assert.equal(pagePreview(list[0]), 'Hontanas Cold and clear. soup bread', 'the title is a title typed, so the preview is the text, without its marks');
    // another editor opens the page and takes the video off
    const clk = clock();
    const second = createPageSaver({ save: (e) => h.store.saveEntry(UID, e), remove: (id) => h.store.deleteEntry(UID, id), attach: (e, p) => h.store.attachMedia(UID, e, p), newId: () => 'z', setTimer: clk.setTimer, clearTimer: clk.clearTimer }, list[0]);
    assert.deepEqual(second.view().media.map((m) => m.id), ['m1', 'm2']);
    second.removeMedia('m2');
    await second.flush();
    assert.deepEqual(h.fs.names(), ['m1.jpg']);
    assert.deepEqual((await h.store.loadEntries(UID))[0].media?.map((m) => m.id), ['m1']);
    assert.equal(await second.discard(), true);
    assert.deepEqual(h.fs.names(), []);
    assert.deepEqual(await h.store.loadEntries(UID), []);
  });

  console.log(`${n} of ${n} passed`);
})().catch((e) => { console.error(e); process.exit(1); });
