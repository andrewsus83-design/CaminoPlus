// useUnreadTotals(): the numbers behind the bell badge and the Inbox tab badges. One shared
// store, so the Me tab and the Inbox always agree. Updates come from realtime events, from
// the app returning to the foreground and, while realtime is down, from a slow poll.
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { socialApi } from '../api';
import { NO_UNREAD, createDebouncer, sameTotals } from '../logic';
import { getRealtimeStatus, subscribeSocial } from '../realtime';
import type { UnreadTotals } from '../types';
import { useMeId } from './base';

let totals: UnreadTotals = NO_UNREAD;
let owner: string | null = null;
let inflight: Promise<void> | null = null;
const subs = new Set<() => void>();

function set(next: UnreadTotals) {
  if (sameTotals(next, totals)) return;
  totals = next;
  subs.forEach((f) => f());
}

/** Fetch the totals now (shared: callers that arrive while a fetch is running wait for that one). */
export function refreshUnreadTotals(): Promise<void> {
  if (!owner) return Promise.resolve();
  if (inflight) return inflight;
  inflight = socialApi.unreadTotals()
    .then(set)
    .catch(() => { /* keep the last numbers; a failed badge refresh is not worth an error */ })
    .finally(() => { inflight = null; });
  return inflight;
}

/** I just read something: lower the numbers at once, the server confirms right after. */
export function adjustUnread(delta: Partial<Pick<UnreadTotals, 'notifications' | 'chats' | 'groups' | 'friendRequests'>>) {
  const next = { ...totals };
  for (const k of ['notifications', 'chats', 'groups', 'friendRequests'] as const) next[k] = Math.max(0, next[k] + (delta[k] ?? 0));
  next.total = next.notifications + next.chats + next.groups;
  set(next);
}

export function useUnreadTotals(): UnreadTotals {
  const uid = useMeId();
  const value = useSyncExternalStore(
    (cb) => { subs.add(cb); return () => { subs.delete(cb); }; },
    () => totals,
    () => NO_UNREAD,
  );

  useEffect(() => {
    if (!uid) return;
    if (owner !== uid) { owner = uid; totals = NO_UNREAD; subs.forEach((f) => f()); } // another account: start from zero
    void refreshUnreadTotals();
    const soon = createDebouncer(() => { void refreshUnreadTotals(); }, 500);
    const off = subscribeSocial(uid, () => soon());
    const poll = setInterval(() => { if (getRealtimeStatus() !== 'live') void refreshUnreadTotals(); }, 45_000);
    const app = AppState.addEventListener('change', (s) => { if (s === 'active') void refreshUnreadTotals(); });
    return () => { soon.cancel(); off(); clearInterval(poll); app.remove(); };
  }, [uid]);

  return uid ? value : NO_UNREAD;
}
