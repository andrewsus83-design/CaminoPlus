// The order of steps around uploads, with fakes for storage and the database: nothing is deleted that a row or a
// message may still use, Cancel adds nothing, and a photo that would keep its location is refused. Run: npm run test:lib
import assert from 'node:assert/strict';
import { storeAvatar, AvatarDeps } from '../avatarFlow';
import { PostMediaDeps, PreparedUpload, insertOutcome, uploadPostMediaWith } from '../postMediaUpload';
import { ImageManipulatorLike, MediaCancelled, MediaDeps, MediaRejected, createMedia } from '../media/core';
import { BatchDeps, COULD_NOT_READ, PickedFile, prepareBatch, withTimeout } from '../media/batch';
import { LOCATION_REFUSED_MESSAGE, UNSUPPORTED_TYPE_MESSAGE, VIDEO_LOCATION_REFUSED_MESSAGE, isSupportedPick, looksLikeJpeg } from '../media/limits';
import { discardMediaPlan } from '../../features/social/logic';

let n = 0;
let chain: Promise<void> = Promise.resolve();
const check = (name: string, fn: () => void | Promise<void>) => { chain = chain.then(fn).then(() => { n += 1; console.log(`ok   ${name}`); }); };

/* ------------------------------------------------------------------ the profile picture */

function avatarDeps(log: string[], o: { failProfile?: boolean; failUpload?: boolean } = {}): AvatarDeps {
  return {
    upload: async (path) => { log.push(`upload ${path}`); if (o.failUpload) throw new Error('offline'); },
    publicUrl: (path) => `https://cdn/${path}`,
    updateProfile: async (url) => { log.push(`profile ${url}`); if (o.failProfile) throw new Error('timeout'); },
    deleteOld: async (paths) => { log.push(`delete ${paths.join(',')}`); },
    now: () => 7,
  };
}

check('avatar: upload, then the profile, and only then the old picture is deleted', async () => {
  const log: string[] = [];
  const url = await storeAvatar('u1', 'file:///a.jpg', avatarDeps(log));
  assert.equal(url, 'https://cdn/u1/avatar.jpg?v=7');
  assert.deepEqual(log, ['upload u1/avatar.jpg', 'profile https://cdn/u1/avatar.jpg?v=7', 'delete u1/avatar.png,u1/avatar.webp,u1/avatar.heic']);
});

check('avatar: when the profile cannot be updated, nothing is deleted (the old picture and the link to it stay)', async () => {
  const log: string[] = [];
  await assert.rejects(storeAvatar('u1', 'file:///a.jpg', avatarDeps(log, { failProfile: true })));
  assert.ok(!log.some((l) => l.startsWith('delete')), log.join(' | '));
  const log2: string[] = [];
  await assert.rejects(storeAvatar('u1', 'file:///a.jpg', avatarDeps(log2, { failUpload: true })));
  assert.deepEqual(log2, ['upload u1/avatar.jpg']);
});

/* ------------------------------------------------------------------ post media rows */

const item = (o: Partial<PreparedUpload> = {}): PreparedUpload => ({ uri: 'file:///p.jpg', type: 'image', mimeType: 'image/jpeg', width: 1280, height: 960, durationMs: null, bytes: 300_000, thumbUri: 'file:///t.jpg', ...o });
type Insert = Awaited<ReturnType<PostMediaDeps['insertRow']>> | 'throw';
function postDeps(log: string[], insert: Insert, exists: boolean | 'throw' = false): PostMediaDeps {
  return {
    upload: async (path) => { log.push(`upload ${path}`); return { bytes: 1234 }; },
    insertRow: async (row) => { log.push(`insert ${row.storage_path} ${row.thumb_path} ${row.size_bytes}`); if (insert === 'throw') throw new Error('Network request failed'); return insert; },
    rowExists: async () => { log.push('exists?'); if (exists === 'throw') throw new Error('offline'); return exists; },
    deleteFiles: async (paths) => { log.push(`delete ${paths.join(',')}`); },
  };
}

check('what a failed insert means: a clear refusal deletes, 23505 is stored, no answer / time-out / 5xx is unknown', () => {
  assert.equal(insertOutcome({ status: 403, code: '42501' }), 'rejected');
  assert.equal(insertOutcome({ status: 400, code: '23503' }), 'rejected');
  assert.equal(insertOutcome({ status: 409, code: '23505' }), 'stored');
  assert.equal(insertOutcome({ status: 0, code: '' }), 'unknown');
  assert.equal(insertOutcome({ status: 504, code: null }), 'unknown');
  assert.equal(insertOutcome({ status: 408 }), 'unknown');
  assert.equal(insertOutcome({ status: 429 }), 'unknown');
  assert.equal(insertOutcome({ status: null, code: '08006' }), 'unknown', 'a connection error code');
  assert.equal(insertOutcome({ status: null, code: '22P02' }), 'rejected');
});

check('post media: the row is written with the thumbnail key and the size that is STORED', async () => {
  const log: string[] = [];
  assert.equal((await uploadPostMediaWith(postDeps(log, { ok: true }), 'u1', 'p1', [item()])).failed, 0);
  assert.deepEqual(log, ['upload u1/posts/p1-0.jpg', 'upload u1/posts/p1-0-thumb.jpg', 'insert u1/posts/p1-0.jpg u1/posts/p1-0-thumb.jpg 1234']);
});

check('post media: a clear refusal of the row deletes both files', async () => {
  const log: string[] = [];
  assert.equal((await uploadPostMediaWith(postDeps(log, { ok: false, status: 403, code: '42501' }), 'u1', 'p1', [item()])).failed, 1);
  assert.equal(log.at(-1), 'delete u1/posts/p1-0.jpg,u1/posts/p1-0-thumb.jpg');
  assert.ok(!log.includes('exists?'));
});

check('post media: no answer, and the row IS there (the insert landed): nothing deleted, counted as uploaded', async () => {
  for (const insert of ['throw', { ok: false as const, status: 0, code: '' }, { ok: false as const, status: 503, code: null }] as Insert[]) {
    const log: string[] = [];
    assert.equal((await uploadPostMediaWith(postDeps(log, insert, true), 'u1', 'p1', [item()])).failed, 0);
    assert.ok(log.includes('exists?'));
    assert.ok(!log.some((l) => l.startsWith('delete')), log.join(' | '));
  }
});

check('post media: no answer and no row: the files are deleted; the question fails too: the files stay (the server sweep takes them)', async () => {
  const log: string[] = [];
  assert.equal((await uploadPostMediaWith(postDeps(log, 'throw', false), 'u1', 'p1', [item()])).failed, 1);
  assert.equal(log.at(-1), 'delete u1/posts/p1-0.jpg,u1/posts/p1-0-thumb.jpg');
  const log2: string[] = [];
  assert.equal((await uploadPostMediaWith(postDeps(log2, 'throw', 'throw'), 'u1', 'p1', [item()])).failed, 1);
  assert.ok(!log2.some((l) => l.startsWith('delete')), log2.join(' | '));
});

check('post media: 23505 (an earlier try already stored the row) is uploaded, nothing deleted; names: photos .jpg, clips .mp4 / .mov', async () => {
  const log: string[] = [];
  const items = [item({ mimeType: 'image/heic' }), item({ type: 'video', mimeType: 'video/quicktime', thumbUri: null }), item({ type: 'video', mimeType: 'video/mp4', thumbUri: null })];
  assert.equal((await uploadPostMediaWith(postDeps(log, { ok: false, status: 409, code: '23505' }), 'u1', 'p1', items)).failed, 0);
  assert.ok(!log.some((l) => l.startsWith('delete')));
  assert.ok(log.includes('upload u1/posts/p1-0.jpg') && log.includes('upload u1/posts/p1-1.mov') && log.includes('upload u1/posts/p1-2.mp4'), log.join(' | '));
});

check('post media: a file this phone refused (its place could not be removed) gives its own reason, not "check your connection"', async () => {
  const d = postDeps([], { ok: true });
  d.upload = async () => { throw Object.assign(new Error(VIDEO_LOCATION_REFUSED_MESSAGE), { refused: true }); };
  const r = await uploadPostMediaWith(d, 'u1', 'p1', [item({ type: 'video', mimeType: 'video/mp4', thumbUri: null })]);
  assert.deepEqual(r, { failed: 1, reasons: [VIDEO_LOCATION_REFUSED_MESSAGE] });
  const net = postDeps([], { ok: true });
  net.upload = async () => { throw new Error('Network request failed'); };
  assert.deepEqual(await uploadPostMediaWith(net, 'u1', 'p1', [item()]), { failed: 1, reasons: [] });
});

/* ------------------------------------------------------------------ chat photos that are deleted from the outbox */

check('a discarded chat photo: only a queued one is checked (and deleted when no message is found); a failed or sending one is kept', () => {
  assert.equal(discardMediaPlan({ status: 'queued', media_path: 'u/chat/c/1.jpg' }), 'check', 'may have landed after a lost answer');
  assert.equal(discardMediaPlan({ status: 'failed', media_path: 'u/chat/c/1.jpg' }), 'keep', 'an earlier try may have been delivered, and a 42501 sender cannot see it');
  assert.equal(discardMediaPlan({ status: 'sending', media_path: 'u/chat/c/1.jpg' }), 'keep', 'may land any moment');
  assert.equal(discardMediaPlan({ status: 'failed', media_path: null }), 'none');
});

/* ------------------------------------------------------------------ prepareImage: location, cancel */

function manipulator(saved: string[], o: { fail?: boolean; onRender?: () => void } = {}): ImageManipulatorLike {
  return {
    manipulate() {
      if (o.fail) throw new Error('cannot read this file');
      const ctx = {
        resize() { return ctx; },
        async renderAsync() {
          o.onRender?.();
          return { width: 4000, height: 3000, async saveAsync() { const uri = `file:///cache/out-${saved.length}.jpg`; saved.push(uri); return { uri, width: 1280, height: 960 }; } };
        },
      };
      return ctx;
    },
  };
}
const mediaDeps = (o: Partial<MediaDeps>): MediaDeps => ({ manipulator: () => null, compressor: () => null, byteSize: async () => 300_000, ...o });

check('a photo the module cannot read, or a build without the module: a JPEG goes up as it is (its location is removed on upload); a HEIC, PNG or anything else is refused', async () => {
  for (const m of [createMedia(mediaDeps({})), createMedia(mediaDeps({ manipulator: () => manipulator([], { fail: true }) }))]) {
    assert.equal((await m.prepareImage('file:///a.jpg', 'free', { mimeType: 'image/jpeg' })).processed, false);
    assert.equal((await m.prepareImage('file:///a.JPG', 'free')).mimeType, 'image/jpeg', 'no type, a .jpg name');
    await assert.rejects(m.prepareImage('file:///a.heic', 'free', { mimeType: 'image/heic' }), (e: unknown) => e instanceof MediaRejected && e.kind === 'location' && e.message === LOCATION_REFUSED_MESSAGE);
    await assert.rejects(m.prepareImage('file:///a.png', 'free', { mimeType: 'image/png' }), MediaRejected);
    await assert.rejects(m.prepareImage('file:///a', 'free'), MediaRejected, 'no type and no name: refused');
  }
  assert.equal(looksLikeJpeg('image/jpg', 'x'), true);
});

check('prepareImage stops on Cancel and deletes the files it already made', async () => {
  const saved: string[] = [];
  const removed: string[] = [];
  const ctrl = new AbortController();
  let renders = 0;
  const m = createMedia(mediaDeps({ manipulator: () => manipulator(saved, { onRender: () => { renders += 1; if (renders === 3) ctrl.abort(); } }), removeFile: (u) => removed.push(u) }));
  await assert.rejects(m.prepareImage('file:///a.heic', 'free', { thumb: true, signal: ctrl.signal, mimeType: 'image/heic' }), MediaCancelled);
  assert.ok(saved.length >= 1);
  assert.deepEqual(removed.sort(), saved.sort(), 'every file made is deleted');
  const done = new AbortController(); done.abort();
  await assert.rejects(createMedia(mediaDeps({})).prepareImage('file:///a.jpg', 'free', { signal: done.signal }), MediaCancelled);
});

/* ------------------------------------------------------------------ the composer's batch */

function batchDeps(log: string[], o: { abortAt?: number; ctrl?: AbortController } = {}): BatchDeps {
  let i = 0;
  return {
    prepareImage: async (uri, _t, opts) => {
      i += 1;
      if (o.abortAt === i) o.ctrl?.abort();
      if (opts.signal.aborted) throw new MediaCancelled();
      return { uri: `${uri}.out`, width: 1, height: 1, bytes: 1, mimeType: 'image/jpeg', processed: true, thumb: { uri: `${uri}.thumb`, width: 1, height: 1, bytes: 1 } };
    },
    prepareVideo: async (uri, _t, onProgress) => { onProgress(0.4); return { uri, width: 1, height: 1, bytes: 1, durationMs: 1, mimeType: 'video/mp4', processed: false }; },
    discard: (uris) => log.push(...uris.map((u) => `discard ${u}`)),
  };
}
const pic = (name: string, o: Partial<PickedFile> = {}): PickedFile => ({ uri: `file:///${name}`, type: 'image', mimeType: 'image/jpeg', ...o });

check('Cancel in the middle of a batch adds nothing and deletes every file made for it', async () => {
  const log: string[] = [];
  const ctrl = new AbortController();
  const r = await prepareBatch([pic('a'), pic('b'), pic('c')], 'free', batchDeps(log, { abortAt: 2, ctrl }), ctrl.signal, () => {});
  assert.deepEqual(r, { ready: [], problems: [], cancelled: true });
  assert.deepEqual(log, ['discard file:///a.out', 'discard file:///a.thumb']);
});

check('a batch: progress is passed on, unsupported clips (3GP, WebM) and refused files are left out with a plain reason, the rest is ready', async () => {
  const log: string[] = [];
  const stages: string[] = [];
  const d = batchDeps(log);
  const realImage = d.prepareImage;
  d.prepareImage = async (uri, t, o) => { if (uri.endsWith('bad')) throw new Error('decode'); if (uri.endsWith('heic')) throw new MediaRejected('location', LOCATION_REFUSED_MESSAGE); return realImage(uri, t, o); };
  const r = await prepareBatch([
    pic('a'), pic('bad'), pic('x.heic', { mimeType: 'image/heic' }),
    { uri: 'file:///v.3gp', type: 'video', mimeType: 'video/3gpp' }, { uri: 'file:///v.webm', type: 'video', mimeType: 'video/webm' }, { uri: 'file:///v.mp4', type: 'video', mimeType: 'video/mp4' },
  ], 'plus', d, new AbortController().signal, (s) => stages.push(`${s.label} ${s.fraction}`));
  assert.equal(r.cancelled, false);
  assert.deepEqual(r.ready.map((x) => x.uri), ['file:///a.out', 'file:///v.mp4']);
  assert.deepEqual(r.ready[0].madeFiles, ['file:///a.out', 'file:///a.thumb']);
  assert.deepEqual(r.problems, [COULD_NOT_READ, LOCATION_REFUSED_MESSAGE, UNSUPPORTED_TYPE_MESSAGE, UNSUPPORTED_TYPE_MESSAGE]);
  assert.ok(stages.includes('Preparing your video 0.4'));
  assert.equal(isSupportedPick('video', null, 'file:///clip.MOV'), true);
  assert.equal(isSupportedPick('video', null, 'file:///clip.3gp'), false);
});

check('prepareVideo says at pick time when a clip cannot lose its recording place; a clip that cannot be read here is left to the upload', async () => {
  const bad = createMedia(mediaDeps({ videoReadable: async () => false }));
  await assert.rejects(bad.prepareVideo('file:///v.mp4', 'free', undefined, undefined, { mimeType: 'video/mp4' }), (e: unknown) => e instanceof MediaRejected && e.kind === 'video_location' && e.message === VIDEO_LOCATION_REFUSED_MESSAGE);
  for (const answer of [true, null] as const) {
    const ok = createMedia(mediaDeps({ videoReadable: async () => answer }));
    assert.equal((await ok.prepareVideo('file:///v.mp4', 'free', undefined, undefined, { mimeType: 'video/mp4' })).uri, 'file:///v.mp4');
  }
});

check('withTimeout: the answer in time, else the fallback (also when the work fails)', async () => {
  assert.equal(await withTimeout(Promise.resolve(1), 50, null), 1);
  assert.equal(await withTimeout(new Promise((r) => setTimeout(() => r(1), 200)), 20, null), null);
  assert.equal(await withTimeout(Promise.reject(new Error('x')), 50, 'free'), 'free');
});

check('prepareVideo refuses a clip type the cloud does not take', async () => {
  await assert.rejects(createMedia(mediaDeps({})).prepareVideo('file:///v.webm', 'free', undefined, undefined, { mimeType: 'video/webm' }), (e: unknown) => e instanceof MediaRejected && e.kind === 'unsupported');
});

chain.then(() => console.log(`${n} of ${n} passed`), (e) => { console.error(e); process.exit(1); });
