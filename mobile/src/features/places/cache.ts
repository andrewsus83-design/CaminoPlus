// The saved copy of a stage's places: what the file looks like, when it is too old, and which saved lists to drop so the
// phone does not fill up. Pure (no React Native imports): plain node tests cover it (npm run test:places). Reading and
// writing the files is store.ts, on top of the app's local store (lib/localStore.ts).
//
// Why a saved copy: the Camino has long stretches without signal, and a pilgrim opens the Stays tab at the albergue
// door. The copy is shown at once while the server is asked again (stale-while-revalidate), and on its own when the
// server cannot be reached. It is public data, so it is not tied to an account and survives signing out.
import type { Cached } from './types';

/** Bump when the envelope changes in a way an old file cannot be read. */
export const CACHE_VERSION = 1;
/** A saved list older than this is not shown any more: an albergue may have closed in a month. */
export const CACHE_MAX_AGE_MS = 30 * 86_400_000;
/** A list fetched less than this long ago in this session is not fetched again when a screen opens. */
export const FRESH_MS = 10 * 60_000;
/** How far into the future a saved time may be before the file is distrusted (a clock that was set wrong). */
export const CLOCK_SKEW_MS = 10 * 60_000;
/** Saved lists kept on the phone; the ones written longest ago go first (a stage has two: stays and points of interest). */
export const MAX_CACHED_LISTS = 24;

export type CacheKind = 'stays' | 'pois';
export type Envelope = { v: typeof CACHE_VERSION; savedAt: number; rows: unknown[] };
export type IndexEntry = { key: string; at: number };

export const cacheKey = (kind: CacheKind, stageId: string) => `places.${kind}.${stageId}`;
export const CACHE_INDEX_KEY = 'places.index';

export const makeEnvelope = (rows: unknown[], now: number): Envelope => ({ v: CACHE_VERSION, savedAt: now, rows });

/**
 * The rows of a saved file, or null when there is nothing worth showing: not an envelope of this version, a time that
 * is not a time or lies in the future, older than CACHE_MAX_AGE_MS, no rows, or rows that no longer pass `parse`
 * (the rows are read again as if they had just come from the server).
 */
export function readEnvelope<R>(raw: unknown, now: number, parse: (data: unknown) => R[] | null): Cached<R> | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Partial<Envelope>;
  if (e.v !== CACHE_VERSION || typeof e.savedAt !== 'number' || !Number.isFinite(e.savedAt) || !Array.isArray(e.rows)) return null;
  if (e.savedAt > now + CLOCK_SKEW_MS) return null;
  if (now - e.savedAt > CACHE_MAX_AGE_MS) return null;
  const rows = parse(e.rows);
  return rows && rows.length > 0 ? { rows, savedAt: Math.min(e.savedAt, now) } : null;
}

/** True when a list fetched at `savedAt` is recent enough not to be fetched again. */
export const isFresh = (savedAt: number, now: number) => now - savedAt >= 0 && now - savedAt < FRESH_MS;

/**
 * The list of saved lists after `key` was written: `key` goes to the end (newest), and what falls out of the
 * `max` newest is returned in `evicted` so the caller can delete those files. A damaged index counts as empty.
 */
export function touchIndex(index: unknown, key: string, now: number, max = MAX_CACHED_LISTS): { index: IndexEntry[]; evicted: string[] } {
  // one entry per key (the newest), whatever the file holds
  const newest = new Map<string, number>();
  if (Array.isArray(index)) {
    for (const e of index as unknown[]) {
      const entry = e as Partial<IndexEntry> | null;
      if (entry && typeof entry.key === 'string' && typeof entry.at === 'number' && Number.isFinite(entry.at) && entry.key !== key) {
        newest.set(entry.key, Math.max(entry.at, newest.get(entry.key) ?? -Infinity));
      }
    }
  }
  const known: IndexEntry[] = [...newest].map(([k, at]) => ({ key: k, at }));
  const next = [...known.sort((a, b) => a.at - b.at), { key, at: now }];
  const evicted = next.length > max ? next.slice(0, next.length - max).map((e) => e.key) : [];
  return { index: next.slice(evicted.length), evicted };
}
