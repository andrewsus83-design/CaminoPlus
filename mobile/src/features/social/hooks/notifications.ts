// Notifications tab: the list, "New" / "Earlier" sections, mark as read, and the inline
// Accept / Decline of friend requests.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { socialApi } from '../api';
import { createLatestGate, friendlyError, notificationPeer, requestState, splitNotifications } from '../logic';
import type { NotificationItem } from '../types';
import { useLiveRefresh, useMeId } from './base';
import { adjustUnread, refreshUnreadTotals } from './unread';

export type Answer = 'accepted' | 'declined';

export function useNotifications() {
  const uid = useMeId();
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [incoming, setIncoming] = useState<ReadonlySet<string>>(new Set());
  const [friends, setFriends] = useState<ReadonlySet<string>>(new Set());
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  // Rows that were unread when the screen loaded stay under "New" until you refresh, so a row
  // does not jump away while you are tapping it.
  const [pinned, setPinned] = useState<ReadonlySet<string>>(new Set());
  const gate = useRef(createLatestGate()).current;

  const load = useCallback(async (resetPins = false) => {
    if (!uid) return;
    const current = gate.next();
    try {
      const [list, requests, friendList] = await Promise.all([
        socialApi.listNotifications(uid),
        socialApi.listFriendRequests().catch(() => null),
        socialApi.listFriends().catch(() => null),
      ]);
      if (!current()) return;
      setItems(list);
      if (requests) setIncoming(new Set(requests.filter((r) => r.direction === 'incoming').map((r) => r.id)));
      if (friendList) setFriends(new Set(friendList.map((f) => f.id)));
      setPinned((old) => {
        const unread = list.filter((n) => !n.read_at).map((n) => n.id);
        return new Set(resetPins ? unread : [...old, ...unread]);
      });
      setError(null);
    } catch (e) {
      if (current()) setError(friendlyError(e, 'Could not load your notifications.'));
    }
  }, [uid, gate]);

  useEffect(() => {
    setItems(null);
    setError(null);
    void load(true);
  }, [load]);

  useLiveRefresh(() => load(false), { match: (e) => e.table === 'notifications' || e.table === 'friendships' });

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  const retry = useCallback(() => {
    setError(null);
    setItems(null);
    void load(true);
  }, [load]);

  const markRead = useCallback(async (ids: string[]) => {
    const now = new Date().toISOString();
    const unread = (items ?? []).filter((n) => ids.includes(n.id) && !n.read_at).length;
    if (unread === 0) return;
    setItems((list) => (list ? list.map((n) => (ids.includes(n.id) && !n.read_at ? { ...n, read_at: now } : n)) : list));
    adjustUnread({ notifications: -unread });
    try {
      await socialApi.markNotificationsRead(ids);
    } catch {
      /* the next refresh brings the true state back */
    }
    void refreshUnreadTotals();
  }, [items]);

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    setItems((list) => (list ? list.map((n) => (n.read_at ? n : { ...n, read_at: now })) : list));
    setPinned(new Set());
    adjustUnread({ notifications: -999 });
    try {
      await socialApi.markNotificationsRead(null);
    } catch {
      /* the next refresh brings the true state back */
    }
    void refreshUnreadTotals();
  }, []);

  /** Accept or decline the friend request behind a notification. Returns an error text, or null. */
  const answer = useCallback(async (n: NotificationItem, accept: boolean): Promise<string | null> => {
    const peer = notificationPeer(n);
    if (!peer) return 'This request is no longer available.';
    setBusy((b) => new Set(b).add(n.id));
    try {
      await socialApi.respondFriendRequest(peer, accept);
      setAnswers((a) => ({ ...a, [n.id]: accept ? 'accepted' : 'declined' }));
      if (accept) setFriends((f) => new Set(f).add(peer));
      setIncoming((s) => { const next = new Set(s); next.delete(peer); return next; });
      void markRead([n.id]);
      return null;
    } catch (e) {
      void load(false); // probably already handled somewhere else: show the real state
      return friendlyError(e, 'Could not answer this request.');
    } finally {
      setBusy((b) => { const next = new Set(b); next.delete(n.id); return next; });
    }
  }, [load, markRead]);

  const sections = useMemo(() => splitNotifications(items ?? [], pinned), [items, pinned]);
  const stateOf = useCallback((n: NotificationItem) => requestState(n, incoming, friends, answers[n.id]), [incoming, friends, answers]);

  return { items, sections, error, loading: items === null && !error, refreshing, refresh, retry, markRead, markAllRead, answer, stateOf, busy };
}
