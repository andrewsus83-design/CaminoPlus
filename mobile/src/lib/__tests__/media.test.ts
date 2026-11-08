// Plain-node checks of the media rules (src/lib/media) and of the wiring: every upload goes through prepareImage /
// prepareVideo and the one storage module. Run: npm run test:lib
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as L from '../media/limits';
import { ImageManipulatorLike, MediaCancelled, MediaDeps, MediaRejected, VideoCompressorLike, createMedia } from '../media/core';
import { pickerQuality, pickerVideoPreset } from '../media/picker';
import { SIGNED_URL_REUSE_MS, createUrlMemo } from '../media/urlMemo';
import { jpegHasLocation, stripJpegLocation } from '../media/exif';

let n = 0;
let chain: Promise<void> = Promise.resolve();
const check = (name: string, fn: () => void | Promise<void>) => {
  chain = chain.then(fn).then(() => { n += 1; console.log(`ok   ${name}`); });
};
const root = process.cwd(); // npm test runs from mobile/
const read = (f: string) => readFileSync(join(root, f), 'utf8');
const MB = 1024 * 1024;

/* ------------------------------------------------------------------ the table */

check('the tier table: Free 1280 px photos and 720p video, Plus 3840 px photos and 1080p video, 60 s for both, avatar 512 and chat 1280 for everybody', () => {
  assert.deepEqual(L.photoRule('free', 'post'), { maxEdge: 1280, quality: 0.8, capBytes: L.FREE_PHOTO_CAP_BYTES });
  assert.equal(L.photoRule('plus', 'post').maxEdge, 3840);
  assert.equal(L.photoRule('free', 'avatar').maxEdge, 512);
  assert.equal(L.photoRule('plus', 'avatar').maxEdge, 512);
  assert.equal(L.photoRule('free', 'chat').maxEdge, 1280);
  assert.equal(L.photoRule('plus', 'chat').maxEdge, 1280);
  assert.equal(L.videoRule('free').maxEdge, 1280);
  assert.equal(L.videoRule('plus').maxEdge, 1920);
  assert.equal(L.videoRule('free').maxSeconds, 60);
  assert.equal(L.videoRule('plus').maxSeconds, 60);
  assert.equal(L.MAX_VIDEO_SECONDS, 60);
  assert.equal(L.THUMB_EDGE, 480);
});

check('every per-file cap is at or under the 50 MB Storage file limit, the avatar cap matches its bucket, and a 60 s clip at the plan bitrate fits its cap', () => {
  assert.equal(L.STORAGE_FILE_LIMIT_BYTES, 50 * MB);
  for (const cap of [L.AVATAR_CAP_BYTES, L.FREE_PHOTO_CAP_BYTES, L.PLUS_PHOTO_CAP_BYTES, L.FREE_VIDEO_CAP_BYTES, L.PLUS_VIDEO_CAP_BYTES]) assert.ok(cap <= L.STORAGE_FILE_LIMIT_BYTES);
  assert.equal(L.AVATAR_CAP_BYTES, 5 * MB, 'the avatars bucket refuses more than 5 MB');
  for (const t of ['free', 'plus'] as const) assert.ok(L.estimateVideoBytes(60, t) < L.videoRule(t).capBytes, `${t}: 60 s fits`);
  const plus60 = L.estimateVideoBytes(60, 'plus') / MB;
  assert.ok(plus60 > 36 && plus60 < 40, `60 s of 1080p at 5 Mbit/s is about 38 MB (got ${plus60.toFixed(1)})`);
});

check('every rule has one sentence: each exported number of limits.ts has a doc comment', () => {
  const src = read('src/lib/media/limits.ts');
  for (const m of src.matchAll(/^export const ([A-Z_]+) = /gm)) {
    const before = src.slice(0, m.index).trimEnd();
    assert.ok(before.endsWith('*/') || /BITRATE/.test(m[1]), `${m[1]} has no sentence`);
  }
});

check('tierFor reads has_plus, the answer Settings shows; anything unknown is Free', () => {
  assert.equal(L.tierFor({ has_plus: true }), 'plus');
  assert.equal(L.tierFor({ has_plus: false }), 'free');
  assert.equal(L.tierFor(null), 'free');
  assert.equal(L.tierFor(undefined), 'free');
  assert.equal(L.tierFor('plus'), 'plus');
  assert.equal(L.tierFor({}), 'free');
});

check('fitWithin keeps the shape, never upscales, and copes with nonsense', () => {
  assert.deepEqual(L.fitWithin(4032, 3024, 1280), { width: 1280, height: 960, scaled: true });
  assert.deepEqual(L.fitWithin(3024, 4032, 1280), { width: 960, height: 1280, scaled: true });
  assert.deepEqual(L.fitWithin(8000, 6000, 3840), { width: 3840, height: 2880, scaled: true });
  assert.deepEqual(L.fitWithin(800, 600, 1280), { width: 800, height: 600, scaled: false });
  assert.deepEqual(L.fitWithin(1280, 720, 1280), { width: 1280, height: 720, scaled: false });
  assert.deepEqual(L.fitWithin(0, 0, 1280), { width: 0, height: 0, scaled: false });
  assert.deepEqual(L.fitWithin(NaN, 10, 1280), { width: 0, height: 10, scaled: false });
  assert.deepEqual(L.fitWithin(10000, 1, 1280), { width: 1280, height: 1, scaled: true }, 'a panorama never gets a zero side');
});

check('size estimates: a 12 MP photo is about 0.3 MB on Free and a few MB on Plus', () => {
  const free = L.estimatePhotoBytes(4032, 3024, 'free') / MB;
  const plus = L.estimatePhotoBytes(4032, 3024, 'plus') / MB;
  assert.ok(free > 0.2 && free < 0.5, String(free));
  assert.ok(plus > 2 && plus < 4, String(plus));
  assert.equal(L.estimateVideoBytes(-5, 'free'), 0);
});

check('the quota check: unknown lets the server decide, no storage and too little storage say so plainly', () => {
  assert.deepEqual(L.quotaCheck(10, null), { ok: true });
  assert.deepEqual(L.quotaCheck(10, { remaining_bytes: 100 }), { ok: true });
  const none = L.quotaCheck(10, { quota_bytes: 0, remaining_bytes: 0 });
  assert.equal(none.ok, false);
  const little = L.quotaCheck(30 * MB, { quota_bytes: 500 * MB, remaining_bytes: 2 * MB });
  assert.ok(!little.ok && /30 MB/.test(little.message) && /2 MB left/.test(little.message), JSON.stringify(little));
  const full = L.quotaCheck(1, { quota_bytes: 500 * MB, remaining_bytes: 0 });
  assert.ok(!full.ok && /full/.test(full.message));
});

check('the wording: plain limits and "higher resolution" only; no comparison words and no "4K" in what the app says', () => {
  const texts = [L.problemMessage('too_long'), L.problemMessage('too_big', { capBytes: 45 * MB }), L.problemMessage('quota', { neededBytes: 1, remainingBytes: 0 }), L.NO_CLOUD_STORAGE_MESSAGE];
  for (const t of texts) {
    assert.doesNotMatch(t, /better than|best|more than|unlimited|\b4K\b/i, t);
    assert.ok(t.length < 200);
  }
  assert.match(L.problemMessage('too_long'), /60 seconds/);
  assert.match(L.problemMessage('too_big', { capBytes: 45 * MB }), /45 MB/);
});

check('the picker: full quality when this build resizes itself, the plan quality when it cannot; the iPhone export preset by plan', () => {
  assert.equal(pickerQuality('free', 'post', true), 1);
  assert.equal(pickerQuality('free', 'post', false), 0.8);
  assert.equal(pickerQuality('plus', 'post', false), 0.85);
  const presets = { Passthrough: 0, H264_1280x720: 6, H264_1920x1080: 7 };
  assert.equal(pickerVideoPreset(presets, 'free', 'ios'), 6);
  assert.equal(pickerVideoPreset(presets, 'plus', 'ios'), 7);
  assert.equal(pickerVideoPreset(presets, 'plus', 'android'), undefined);
  assert.equal(pickerVideoPreset(undefined, 'plus', 'ios'), undefined);
});

/* ------------------------------------------------------------------ prepareImage / prepareVideo with fakes */

type Call = { op: string; arg?: unknown };
function fakeManipulator(w: number, h: number, calls: Call[], fail = false): ImageManipulatorLike {
  return {
    manipulate(uri: string) {
      calls.push({ op: 'manipulate', arg: uri });
      if (fail) throw new Error('native failure');
      let cw = w; let ch = h;
      const ctx = {
        resize(s: { width?: number | null; height?: number | null }) { calls.push({ op: 'resize', arg: s }); cw = s.width ?? cw; ch = s.height ?? ch; return ctx; },
        async renderAsync() {
          const rw = cw; const rh = ch;
          return { width: rw, height: rh, async saveAsync(o: { compress: number; format: 'jpeg' }) { calls.push({ op: 'save', arg: o }); return { uri: `file:///out-${rw}x${rh}.jpg`, width: rw, height: rh }; } };
        },
      };
      return ctx;
    },
  };
}
const deps = (o: Partial<MediaDeps> & { sizes?: Record<string, number> }): MediaDeps => ({
  manipulator: o.manipulator ?? (() => null),
  compressor: o.compressor ?? (() => null),
  byteSize: o.byteSize ?? (async (uri) => o.sizes?.[uri] ?? 300_000),
});

check('prepareImage shrinks a 12 MP photo to 1280 px on Free and 3840 px on Plus, saves JPEG, and makes a 480 px thumbnail', async () => {
  const calls: Call[] = [];
  const m = createMedia(deps({ manipulator: () => fakeManipulator(4032, 3024, calls) }));
  const free = await m.prepareImage('file:///in.heic', 'free', { thumb: true, mimeType: 'image/heic' });
  assert.equal(free.processed, true);
  assert.equal(free.mimeType, 'image/jpeg', 'HEIC comes out as JPEG');
  assert.deepEqual([free.width, free.height], [1280, 960]);
  assert.deepEqual([free.thumb?.width, free.thumb?.height], [480, 360]);
  assert.ok(calls.some((c) => c.op === 'save' && (c.arg as { compress: number }).compress === 0.8));
  assert.ok(calls.some((c) => c.op === 'save' && (c.arg as { compress: number }).compress === L.THUMB_JPEG_QUALITY));
  const plus = await createMedia(deps({ manipulator: () => fakeManipulator(4032, 3024, []) })).prepareImage('file:///in.jpg', 'plus');
  assert.deepEqual([plus.width, plus.height], [3840, 2880]);
  assert.equal(plus.thumb, null, 'no thumbnail unless asked');
});

check('prepareImage never upscales: a small photo is saved again (EXIF gone) at its own size', async () => {
  const calls: Call[] = [];
  const m = createMedia(deps({ manipulator: () => fakeManipulator(800, 600, calls) }));
  const r = await m.prepareImage('file:///small.jpg', 'plus');
  assert.deepEqual([r.width, r.height], [800, 600]);
  assert.equal(calls.filter((c) => c.op === 'resize').length, 0);
  assert.equal(calls.filter((c) => c.op === 'save').length, 1, 'saved again all the same');
});

check('fallback: without the module, or when it fails, the original goes up if it is within the cap, and is refused with a plain message if not', async () => {
  const none = createMedia(deps({ sizes: { 'file:///a.jpg': 4 * MB } }));
  const r = await none.prepareImage('file:///a.jpg', 'free', { width: 4032, height: 3024, mimeType: 'image/jpeg' });
  assert.deepEqual([r.uri, r.processed, r.bytes, r.thumb], ['file:///a.jpg', false, 4 * MB, null]);
  const failing = createMedia(deps({ manipulator: () => fakeManipulator(10, 10, [], true), sizes: { 'file:///a.jpg': 4 * MB } }));
  assert.equal((await failing.prepareImage('file:///a.jpg', 'free')).processed, false);
  const big = createMedia(deps({ sizes: { 'file:///b.jpg': 30 * MB } }));
  await assert.rejects(big.prepareImage('file:///b.jpg', 'free'), (e: unknown) => e instanceof MediaRejected && e.kind === 'too_big' && /10 MB/.test(e.message));
  await assert.rejects(big.prepareImage('file:///b.jpg', 'free', { use: 'avatar' }), (e: unknown) => e instanceof MediaRejected && /5 MB/.test(e.message));
  const unknown = createMedia(deps({ byteSize: async () => null }));
  assert.equal((await unknown.prepareImage('file:///c.jpg', 'free')).bytes, null, 'a size that cannot be read lets the server decide');
});

check('prepareVideo: over 60 s is refused, too big is refused, cancel stops, progress reaches 100 %', async () => {
  const m = createMedia(deps({ sizes: { 'file:///v.mp4': 20 * MB, 'file:///big.mp4': 60 * MB } }));
  await assert.rejects(m.prepareVideo('file:///v.mp4', 'plus', undefined, undefined, { durationMs: 61_000 }), (e: unknown) => e instanceof MediaRejected && e.kind === 'too_long' && /60 seconds/.test(e.message));
  const seen: number[] = [];
  const ok = await m.prepareVideo('file:///v.mp4', 'free', (f) => seen.push(f), undefined, { durationMs: 60_000, width: 1920, height: 1080 });
  assert.equal(ok.uri, 'file:///v.mp4');
  assert.equal(ok.processed, false);
  assert.deepEqual([seen[0], seen[seen.length - 1]], [0, 1]);
  await assert.rejects(m.prepareVideo('file:///big.mp4', 'plus'), (e: unknown) => e instanceof MediaRejected && e.kind === 'too_big' && /45 MB/.test(e.message));
  assert.equal((await m.prepareVideo('file:///v.mp4', 'free')).bytes, 20 * MB, '20 MB is within the 25 MB Free cap');
  const ctrl = new AbortController(); ctrl.abort();
  await assert.rejects(m.prepareVideo('file:///v.mp4', 'free', undefined, ctrl.signal), (e: unknown) => e instanceof MediaCancelled);
});

check('prepareVideo with a compressor: plan size and bitrate handed in, progress passed on, a failing compressor falls back, cancel during compression stops', async () => {
  let asked: unknown = null;
  const good: VideoCompressorLike = { async compress(_u, o, p) { asked = o; p(0.4); p(1); return 'file:///small.mp4'; } };
  const seen: number[] = [];
  const m = createMedia(deps({ compressor: () => good, sizes: { 'file:///small.mp4': 10 * MB } }));
  const r = await m.prepareVideo('file:///raw.mov', 'free', (f) => seen.push(f), undefined, { width: 3840, height: 2160, durationMs: 30_000 });
  assert.deepEqual(asked, { maxEdge: 1280, bitrate: L.FREE_VIDEO_BITRATE });
  assert.deepEqual([r.uri, r.processed, r.width, r.height, r.mimeType], ['file:///small.mp4', true, 1280, 720, 'video/mp4']);
  assert.ok(seen.includes(0.4));
  const broken: VideoCompressorLike = { async compress() { throw new Error('codec'); } };
  const f = await createMedia(deps({ compressor: () => broken, sizes: { 'file:///raw.mov': 10 * MB } })).prepareVideo('file:///raw.mov', 'plus');
  assert.equal(f.processed, false);
  const ctrl = new AbortController();
  const slow: VideoCompressorLike = { async compress() { ctrl.abort(); throw new Error('aborted'); } };
  await assert.rejects(createMedia(deps({ compressor: () => slow })).prepareVideo('file:///raw.mov', 'plus', undefined, ctrl.signal), (e: unknown) => e instanceof MediaCancelled);
});

/* ------------------------------------------------------------------ signed links */

check('signed links are reused for 50 minutes, then asked again; a replaced file forgets its link', () => {
  let t = 1_000_000;
  const memo = createUrlMemo(() => t);
  assert.deepEqual(memo.split('b', ['x', 'y', 'x']), { have: {}, need: ['x', 'y'] });
  memo.put('b', 'x', 'u1');
  assert.deepEqual(memo.split('b', ['x', 'y']), { have: { x: 'u1' }, need: ['y'] });
  assert.deepEqual(memo.split('other', ['x']).need, ['x'], 'per bucket');
  t += SIGNED_URL_REUSE_MS - 1;
  assert.deepEqual(memo.split('b', ['x']).have, { x: 'u1' });
  t += 2;
  assert.deepEqual(memo.split('b', ['x']).need, ['x']);
  memo.put('b', 'x', 'u2');
  memo.forget('b', ['x']);
  assert.deepEqual(memo.split('b', ['x']).need, ['x']);
});

/* ------------------------------------------------------------------ the location is removed */

const fixture = () => new Uint8Array(readFileSync(join(root, 'src', 'lib', '__tests__', 'fixtures', 'gps-exif.jpg')));
const has = (b: Uint8Array, text: string) => Buffer.from(b).includes(Buffer.from(text, 'latin1'));

check('a real camera-style JPEG with a GPS position (fixture) loses the position and keeps its orientation and the picture', () => {
  const src = fixture();
  assert.equal(jpegHasLocation(src), true, 'the fixture carries GPS data');
  const { bytes, removed } = stripJpegLocation(src);
  assert.equal(removed, true);
  assert.equal(jpegHasLocation(bytes), false);
  assert.equal(bytes.length, src.length, 'emptied in place: the picture data is untouched');
  assert.ok(has(bytes, 'TestCam'), 'other EXIF data stays');
  // orientation 6 (the fixture is a big-endian "MM" TIFF block): tag 0x0112, type SHORT, count 1, value 6
  assert.ok(Buffer.from(bytes).includes(Buffer.from([0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06])), 'orientation kept');
  const tail = (b: Uint8Array) => Buffer.from(b.subarray(b.length - 200)).toString('hex');
  assert.equal(tail(bytes), tail(src));
  assert.equal(jpegHasLocation(src), true, 'the input is not changed');
});

check('XMP data (it can hold a position too) is removed; a file without location, or that is not a JPEG, comes back as it was', () => {
  const src = fixture();
  const xmpBody = Buffer.from('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta><exif:GPSLatitude>42,52.95N</exif:GPSLatitude></x:xmpmeta>', 'latin1');
  const seg = Buffer.concat([Buffer.from([0xff, 0xe1, (xmpBody.length + 2) >> 8, (xmpBody.length + 2) & 0xff]), xmpBody]);
  const withXmp = new Uint8Array(Buffer.concat([Buffer.from(src.subarray(0, 2)), seg, Buffer.from(src.subarray(2))]));
  assert.equal(jpegHasLocation(withXmp), true);
  const out = stripJpegLocation(withXmp);
  assert.equal(jpegHasLocation(out.bytes), false);
  assert.equal(has(out.bytes, 'GPSLatitude'), false);
  assert.equal(out.bytes.length, src.length, 'exactly the XMP segment is gone');
  const clean = stripJpegLocation(out.bytes);
  assert.equal(clean.removed, false);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  assert.equal(stripJpegLocation(png).bytes, png);
  const broken = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 0x00]);
  assert.doesNotThrow(() => stripJpegLocation(broken), 'a broken file does not throw');
});

check('a little-endian (Intel "II") EXIF block loses its GPS entries too', () => {
  // TIFF "II", IFD0 with one entry: GPS pointer -> GPS IFD with one RATIONAL[3] latitude stored outside the entry.
  const tiff = Buffer.alloc(8 + 2 + 12 + 4 + 2 + 12 + 4 + 24);
  tiff.write('II', 0, 'latin1'); tiff.writeUInt16LE(42, 2); tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8);
  tiff.writeUInt16LE(0x8825, 10); tiff.writeUInt16LE(4, 12); tiff.writeUInt32LE(1, 14); tiff.writeUInt32LE(26, 18);
  tiff.writeUInt32LE(0, 22);
  tiff.writeUInt16LE(1, 26);
  tiff.writeUInt16LE(2, 28); tiff.writeUInt16LE(5, 30); tiff.writeUInt32LE(3, 32); tiff.writeUInt32LE(44, 36);
  tiff.writeUInt32LE(0, 40);
  for (let i = 0; i < 6; i++) tiff.writeUInt32LE(42 + i, 44 + i * 4);
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const jpeg = new Uint8Array(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 0xff]), body, Buffer.from([0xff, 0xd9])]));
  assert.equal(jpegHasLocation(jpeg), true);
  const out = stripJpegLocation(jpeg).bytes;
  assert.equal(jpegHasLocation(out), false);
  assert.ok(!Buffer.from(out).includes(Buffer.from([42, 0, 0, 0, 43, 0, 0, 0])), 'the latitude numbers are gone');
});

/* ------------------------------------------------------------------ wiring pins */

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(root, dir))) {
    const rel = join(dir, name);
    if (statSync(join(root, rel)).isDirectory()) {
      if (name !== '__tests__' && name !== 'node_modules') out.push(...sources(rel));
    } else if (/\.tsx?$/.test(name)) out.push(rel);
  }
  return out;
}
const all = [...sources('src'), ...sources('app')];
const STORAGE_MODULE = join('src', 'lib', 'mediaStorage.ts');

check('no file but mediaStorage.ts talks to Storage (upload, signed links, public links, delete)', () => {
  for (const f of all) {
    if (f === STORAGE_MODULE) continue;
    const text = read(f);
    assert.doesNotMatch(text, /\.storage\s*\.from\(|\bcreateSignedUrls?\(|getPublicUrl\(/, `${f} calls Storage directly: use src/lib/mediaStorage.ts`);
  }
  const storage = read(STORAGE_MODULE);
  assert.match(storage, /stripJpegLocation\(/, 'every JPEG loses its location on the way up');
});

check('every upload site prepares its media first: the post composer, the avatar, chat photos', () => {
  const composer = read(join('app', 'write.tsx'));
  assert.match(composer, /prepareImage\(/);
  assert.match(composer, /prepareVideo\(/);
  assert.match(composer, /thumb: true/, 'a post photo gets its thumbnail');
  assert.match(composer, /quotaCheck\(/);
  assert.match(composer, /<MediaPreparing /);
  const api = read(join('src', 'lib', 'api.ts'));
  assert.match(api, /uploadPostMedia\(userId: string, postId: string, items: PreparedMedia\[\]\)/, 'only prepared media can be uploaded');
  assert.match(api, /thumb_path: thumbPath/);
  assert.match(read(join('src', 'lib', 'avatar.ts')), /prepareImage\([^)]*use: 'avatar'/);
  assert.match(read(join('src', 'features', 'social', 'pick.ts')), /prepareImage\([^)]*use: 'chat'/);
  const uploaders = all.filter((f) => /\bupload\(MEDIA_BUCKET\./.test(read(f)) || /\bupload\(CHAT_BUCKET/.test(read(f)));
  assert.deepEqual(uploaders.sort(), [join('src', 'features', 'social', 'api.ts'), join('src', 'lib', 'api.ts'), join('src', 'lib', 'avatar.ts')].sort(), 'the known upload sites');
});

check('files no message or post uses any more are deleted: a failed post row, a discarded chat photo, an unsent photo, an old avatar', () => {
  assert.match(read(join('src', 'lib', 'api.ts')), /deleteMedia\(MEDIA_BUCKET\.userMedia, uploaded\)/);
  assert.match(read(join('src', 'features', 'social', 'outbox.ts')), /deleteChatImage\(gone\.media_path\)/);
  assert.match(read(join('src', 'features', 'social', 'api.ts')), /if \(mediaPath\) void deleteMedia\(CHAT_BUCKET/);
  assert.match(read(join('src', 'lib', 'avatar.ts')), /deleteMedia\(MEDIA_BUCKET\.avatars/);
});

check('the photo picker is opened without asking for library permission first (the system picker needs none)', () => {
  for (const f of all) assert.doesNotMatch(read(f), /requestMediaLibraryPermissionsAsync/, `${f} asks for library permission`);
});

check('expo-image-manipulator is never imported at the top of a file, and is required only after asking hasNativeModule', () => {
  for (const f of all) {
    const text = read(f).replace(/^import type .*$/gm, '');
    assert.doesNotMatch(text, /^import[^;]*from 'expo-image-manipulator'/m, `${f} imports expo-image-manipulator statically`);
    assert.doesNotMatch(text, /^export[^;]*from 'expo-image-manipulator'/m, `${f} re-exports expo-image-manipulator`);
  }
  const idx = read(join('src', 'lib', 'media', 'index.ts'));
  const req = idx.indexOf("require('expo-image-manipulator')");
  const ask = idx.lastIndexOf('hasNativeModule(NativeName.imageManipulator)', req);
  assert.ok(req > 0 && ask > 0 && req - ask < 300);
  for (const pure of ['limits.ts', 'core.ts', 'picker.ts', 'urlMemo.ts', 'exif.ts']) {
    assert.doesNotMatch(read(join('src', 'lib', 'media', pure)), /from 'react-native'|from 'expo|require\(/, `${pure} stays pure`);
  }
});

check('the diary keeps its media on the phone: it does not use the upload path', () => {
  for (const f of all.filter((x) => x.includes(join('features', 'diary')))) assert.doesNotMatch(read(f), /mediaStorage|uploadPostMedia/, f);
});

chain.then(() => console.log(`${n} of ${n} passed`), (e) => { console.error(e); process.exit(1); });
