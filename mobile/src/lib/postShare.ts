// What the share button sends, and when a share counts. Sample content (the bundled sample journey and Discover's sample
// stories) is never shared outside the app: it sends the invitation to the app instead. A real post sends the pilgrim's
// own words, and is counted (rpc record_post_share) only after the native share sheet was really used. No React Native
// imports on purpose: plain node tests cover all of it (npm run test:lib).
import { isCount } from './engagement';

export const APP_LINK = 'https://camino.plus';
/** What sample content shares: an invitation, never an invented place or caption. */
export const SHARE_APP = `Walking the Camino? CaminoPlus has offline maps, stays and a pilgrim passport: ${APP_LINK}`;

/** The text of the share sheet. `sample` content, or no post at all, sends the invitation. */
export function shareMessage(post: { body?: string | null; place_name?: string | null } | null | undefined, sample: boolean): string {
  if (sample || !post) return SHARE_APP;
  const body = (post.body ?? '').trim();
  const place = (post.place_name ?? '').trim();
  const words = body || place;
  if (!words) return SHARE_APP;
  const from = body && place ? `${place} · CaminoPlus: ${APP_LINK}` : `CaminoPlus: ${APP_LINK}`;
  return `${words}\n\n${from}`;
}

export type ShareOutcome = 'shared' | 'dismissed' | 'failed';

/**
 * What React Native's Share.share answered. The sheet being closed without sharing says dismissedAction (iOS, and
 * Android where the app reports it). Anything else counts as shared, as does the web, which answers nothing.
 */
export function shareOutcome(result: unknown): 'shared' | 'dismissed' {
  const action = (result as { action?: unknown } | null | undefined)?.action;
  return action === 'dismissedAction' ? 'dismissed' : 'shared';
}

// The web share sheet rejects with an AbortError when the person closes it.
const aborted = (e: unknown) => (e as { name?: unknown } | null | undefined)?.name === 'AbortError';

/**
 * Open the share sheet, then (real posts only: pass `record`) count the share. The count that comes back is the
 * database's own answer (record_post_share gives the new share_count). A share that could not be counted is still a
 * share: nothing is shown as counted that was not.
 */
export async function shareAndRecord(o: {
  share: () => Promise<unknown>;
  record?: () => Promise<number | null>;
}): Promise<{ outcome: ShareOutcome; count?: number; error?: unknown }> {
  let result: unknown;
  try {
    result = await o.share();
  } catch (error) {
    return aborted(error) ? { outcome: 'dismissed' } : { outcome: 'failed', error };
  }
  if (shareOutcome(result) === 'dismissed') return { outcome: 'dismissed' };
  if (!o.record) return { outcome: 'shared' };
  try {
    const n = await o.record();
    return isCount(n) ? { outcome: 'shared', count: Math.floor(n) } : { outcome: 'shared' };
  } catch {
    return { outcome: 'shared' };
  }
}
