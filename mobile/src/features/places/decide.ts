// What the screens show, decided from what the server answered and what is saved on the phone. Pure (no React Native
// imports): plain node tests cover every case (npm run test:places). usePlaces.ts only moves the answers in and out.
//
//                          server: places          server: empty list         server: no answer
//   saved copy             live (copy rewritten)   sample (copy dropped)      cache (copy kept)
//   no saved copy          live (copy written)     sample                     sample
//
// "No answer" = offline, a timeout, an error, or an answer that is not a list (for example the database has not got the
// new functions yet). It never clears the saved copy and never crashes a screen. An empty list from a server that DID
// answer is believed: the stage has no places (any more), so the saved copy would only mislead.
import type { Cached, FetchResult, PlaceSource } from './types';

export type Shown<R> = {
  /** Rows to draw, as the server sent them. Empty when the screen should draw the bundled sample. */
  rows: R[];
  source: PlaceSource;
  offline: boolean;
  /** The reason the last refresh failed when it was not simply being offline. */
  error: string | null;
  /** When `rows` were fetched from the server; null for the sample. */
  savedAt: number | null;
  /** What to do with the saved copy: write `rows`, delete it, or leave it. */
  cache: 'write' | 'clear' | 'keep';
};

/** What to show before the server has answered: the saved copy, or nothing (still loading). */
export function beforeAnswer<R>(cached: Cached<R> | null): Shown<R> | null {
  return cached ? { rows: cached.rows, source: 'cache', offline: false, error: null, savedAt: cached.savedAt, cache: 'keep' } : null;
}

/** What to show once the server has answered, or could not. */
export function afterAnswer<R>(res: FetchResult<R>, cached: Cached<R> | null, now: number): Shown<R> {
  if (res.ok) {
    return res.rows.length > 0
      ? { rows: res.rows, source: 'live', offline: false, error: null, savedAt: now, cache: 'write' }
      : { rows: [], source: 'sample', offline: false, error: null, savedAt: null, cache: 'clear' };
  }
  const why = { offline: res.offline, error: res.offline ? null : res.message };
  return cached
    ? { rows: cached.rows, source: 'cache', ...why, savedAt: cached.savedAt, cache: 'keep' }
    : { rows: [], source: 'sample', ...why, savedAt: null, cache: 'keep' };
}

/* ------------------------------------------------------------------ which stage the Stays tab lists */

/** The stage of the day the pilgrim is on (or about to start), as saved on the phone. */
export type PlanStage = { journeyId: string; stageId: string; stageName: string | null };

/**
 * The stage the Stays tab lists: the next day of the plan that is not finished. When the plan cannot be read (offline,
 * first launch) the last one saved for this journey is used, then the stage the journey started at (a guess, but the
 * screen names the stage, so it is never passed off as "today"). A plan that was read and has no day left means the
 * walk is over (or there is no plan): no stage, and the screen shows the sample.
 */
export function chooseMyStage(input: {
  journeyId: string | null;
  /** The plan: its next day, null when it has none left, 'failed' when it could not be read. */
  fetched: PlanStage | null | 'failed';
  cached: PlanStage | null;
  start: { stageId: string | null; stageName: string | null };
}): { stage: PlanStage | null; cache: 'write' | 'clear' | 'keep' } {
  const { journeyId, fetched, cached, start } = input;
  if (!journeyId) return { stage: null, cache: 'keep' };
  if (fetched && fetched !== 'failed') return { stage: fetched, cache: 'write' };
  if (fetched === null) return { stage: null, cache: 'clear' };
  if (cached && cached.journeyId === journeyId) return { stage: cached, cache: 'keep' };
  return { stage: start.stageId ? { journeyId, stageId: start.stageId, stageName: start.stageName } : null, cache: 'keep' };
}
