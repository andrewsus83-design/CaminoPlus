// Optimistic actions for the action rail: a tap shows its result at once, the server is asked, and if the server says no
// the old state comes back and the person is told in one short, honest sentence. These actions need the network: when
// the phone is offline nothing is shown and nothing is sent, and it says so. No React Native imports on purpose: plain
// node tests cover all of it (npm run test:lib), including the revert after a failure.
import { isCount } from './engagement';
import type { RailKind } from './actionRail';

/** Love or bookmark of one post: whether this person has done it, and the count when it was read. */
export type Reaction = { on: boolean; count?: number };

/**
 * What a tap shows at once: the other state, and the count one more or one less when it is known. A count that was
 * never read stays unknown: it is not turned into 1 just because this person bookmarked.
 */
export function flipReaction(r: Reaction): Reaction {
  const on = !r.on;
  if (!isCount(r.count)) return { on };
  return { on, count: Math.max(0, Math.floor(r.count) + (on ? 1 : -1)) };
}

export type OptimisticResult<T> =
  | { ok: true; value: T }
  /** blocked: the pre-check said no (offline), so nothing was shown and nothing was sent. failed: it was shown, the request failed and the old state is back. */
  | { ok: false; reason: 'blocked' | 'failed'; error: unknown };

/**
 * Show first, ask second.
 *   before  runs first (assertOnline): if it throws, nothing is shown and commit is never called
 *   apply   shows the result of the tap at once
 *   commit  the request. If it throws, revert puts the old state back
 */
export async function optimistic<T>(o: {
  before?: () => Promise<void>;
  apply: () => void;
  commit: () => Promise<T>;
  revert: () => void;
}): Promise<OptimisticResult<T>> {
  if (o.before) {
    try {
      await o.before();
    } catch (error) {
      return { ok: false, reason: 'blocked', error };
    }
  }
  o.apply();
  try {
    return { ok: true, value: await o.commit() };
  } catch (error) {
    o.revert();
    return { ok: false, reason: 'failed', error };
  }
}

export type ToggleResult = OptimisticResult<void> | { ok: false; reason: 'busy' };

/**
 * A love or bookmark toggle. `from` is what is shown now; the tap shows the flipped state (count included), commit(next)
 * writes it, and a failure puts `from` back exactly. While the same button (`key`: one per post and button) is still
 * waiting for its answer a second tap is ignored (`busy`), so a like and an unlike can never overtake each other.
 */
export async function optimisticToggle(o: {
  key: string;
  inFlight: Set<string>;
  from: Reaction;
  show: (r: Reaction) => void;
  before?: () => Promise<void>;
  commit: (nextOn: boolean) => Promise<void>;
}): Promise<ToggleResult> {
  if (o.inFlight.has(o.key)) return { ok: false, reason: 'busy' };
  o.inFlight.add(o.key);
  try {
    const next = flipReaction(o.from);
    return await optimistic({ before: o.before, apply: () => o.show(next), commit: () => o.commit(next.on), revert: () => o.show(o.from) });
  } finally {
    o.inFlight.delete(o.key);
  }
}

// Mirrors isOfflineError in net.ts (which cannot be imported here: it needs NetInfo), plus Safari's "Load failed".
const OFFLINE = /offline|network request failed|failed to fetch|networkerror|retryablefetch|internet|load failed/i;

/** true for "no connection" style failures: our own offline check, a fetch that never got an answer. */
export function looksOffline(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const e = error as { name?: unknown; message?: unknown; network?: unknown };
    return e.network === true || OFFLINE.test(`${String(e.name ?? '')} ${String(e.message ?? '')}`);
  }
  return OFFLINE.test(String(error ?? ''));
}

const NEEDS: Record<RailKind, string> = { love: 'Likes', save: 'Bookmarks', comments: 'Comments', share: 'Sharing' };
const FAILED: Record<RailKind, string> = {
  love: 'Could not save your like. Try again.',
  save: 'Could not save your bookmark. Try again.',
  comments: 'Could not send your comment. Try again.',
  share: 'Could not open the share sheet. Try again.',
};

/** A rate limit of the database (SQLSTATE 54000, e.g. "You have liked many posts in the last hour. Please wait a little and try again.").
 *  Its message is a sentence written for people, so it is shown as it is. */
export function rateLimitMessage(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const e = error as { code?: unknown; message?: unknown };
  const msg = typeof e.message === 'string' ? e.message.trim() : '';
  return e.code === '54000' && /^[A-Z][^\n]{6,220}[.!]$/.test(msg) ? msg : null;
}

/** One short sentence for the person after a rail action did not work: offline says so, a rate limit says when to try again,
 *  anything else says what was not saved. */
export function failureMessage(kind: RailKind, error: unknown): string {
  if (looksOffline(error)) return `You are offline. ${NEEDS[kind]} ${kind === 'share' ? 'needs' : 'need'} a connection.`;
  return rateLimitMessage(error) ?? FAILED[kind];
}
