// The saved copy of a stage's places, on the phone, in the app's own local store (lib/localStore.ts: one small file per
// key on the phone, localStorage on the web; every call resolves to null / false instead of throwing). What the files look
// like and when they are too old is cache.ts, which plain node tests cover.
//
// Public data, so the files are not tied to an account and survive signing out. At most MAX_CACHED_LISTS lists are kept:
// each write notes its key in an index, and the oldest written lists are deleted when there are more.
import { localStore } from '../../lib/localStore';
import { CACHE_INDEX_KEY, cacheKey, makeEnvelope, readEnvelope, touchIndex, type CacheKind } from './cache';
import type { Cached } from './types';

// The index is read, changed and written back: two writes at once (the stays and the points of interest of one stage)
// must not overwrite each other, so they take turns.
let queue: Promise<unknown> = Promise.resolve();
const inTurn = <T,>(job: () => Promise<T>): Promise<T> => {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
};

/** The saved list of a stage, or null when there is none, it is too old, or it no longer reads. Never throws. */
export async function readSaved<R>(kind: CacheKind, stageId: string, parse: (data: unknown) => R[] | null): Promise<Cached<R> | null> {
  try {
    const key = cacheKey(kind, stageId);
    const raw = await localStore.getJSON<unknown>(key);
    if (raw == null) return null;
    const saved = readEnvelope(raw, Date.now(), parse);
    if (!saved) void localStore.remove(key); // too old or damaged: it is of no use to anybody
    return saved;
  } catch {
    return null;
  }
}

/** Saves the list of a stage and makes room for it. Never throws. */
export function writeSaved(kind: CacheKind, stageId: string, rows: unknown[]): Promise<void> {
  return inTurn(async () => {
    const key = cacheKey(kind, stageId);
    if (!(await localStore.setJSON(key, makeEnvelope(rows, Date.now())))) return;
    const { index, evicted } = touchIndex(await localStore.getJSON<unknown>(CACHE_INDEX_KEY), key, Date.now());
    await localStore.setJSON(CACHE_INDEX_KEY, index);
    for (const old of evicted) await localStore.remove(old);
  }).catch(() => undefined);
}

/** Deletes the saved list of a stage (the server says it has no places). Never throws. */
export function clearSaved(kind: CacheKind, stageId: string): Promise<void> {
  return inTurn(() => localStore.remove(cacheKey(kind, stageId))).catch(() => undefined);
}
