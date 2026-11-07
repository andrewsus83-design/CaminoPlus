// Friends screen data: my friends, the requests (received and sent) and the Find search.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { socialApi } from '../api';
import { createLatestGate, friendlyError, isSearchable, normalizeQuery, sortByName, withStatus } from '../logic';
import type { Friend, FriendRequest, FriendStatus, PilgrimResult } from '../types';
import { useDebouncedValue, useLiveRefresh, useMeId } from './base';
import { adjustUnread, refreshUnreadTotals } from './unread';

export function useFriendsData() {
  const uid = useMeId();
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [requests, setRequests] = useState<FriendRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const gate = useRef(createLatestGate()).current;

  const load = useCallback(async () => {
    if (!uid) return;
    const current = gate.next();
    try {
      const [f, r] = await Promise.all([socialApi.listFriends(), socialApi.listFriendRequests()]);
      if (!current()) return;
      setFriends(sortByName(f));
      setRequests(r);
      setError(null);
    } catch (e) {
      if (current()) setError(friendlyError(e, 'Could not load your friends.'));
    }
  }, [uid, gate]);

  useEffect(() => {
    setFriends(null);
    setRequests(null);
    setError(null);
    void load();
  }, [load]);

  useLiveRefresh(load, { match: (e) => e.table === 'friendships' });

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const retry = useCallback(() => {
    setError(null);
    setFriends(null);
    setRequests(null);
    void load();
  }, [load]);

  /** Run a friend action with a busy flag. Returns an error text, or null when it worked. */
  const run = useCallback(async (id: string, job: () => Promise<unknown>, failure: string): Promise<string | null> => {
    setBusy((b) => new Set(b).add(id));
    try {
      await job();
      await load();
      void refreshUnreadTotals();
      return null;
    } catch (e) {
      return friendlyError(e, failure);
    } finally {
      setBusy((b) => { const next = new Set(b); next.delete(id); return next; });
    }
  }, [load]);

  const accept = useCallback((id: string) => run(id, async () => { await socialApi.respondFriendRequest(id, true); adjustUnread({ friendRequests: -1 }); }, 'Could not accept this request.'), [run]);
  const decline = useCallback((id: string) => run(id, async () => { await socialApi.respondFriendRequest(id, false); adjustUnread({ friendRequests: -1 }); }, 'Could not decline this request.'), [run]);
  const cancel = useCallback((id: string) => run(id, () => socialApi.cancelFriendRequest(id), 'Could not cancel this request.'), [run]);
  const unfriend = useCallback((id: string) => run(id, () => socialApi.removeFriend(id), 'Could not remove this friend.'), [run]);

  const incoming = useMemo(() => (requests ?? []).filter((r) => r.direction === 'incoming'), [requests]);
  const outgoing = useMemo(() => (requests ?? []).filter((r) => r.direction === 'outgoing'), [requests]);
  return { friends, incoming, outgoing, error, loading: (friends === null || requests === null) && !error, refreshing, refresh, retry, reload: load, busy, accept, decline, cancel, unfriend };
}

/** Find tab: search as you type (350 ms pause, at least 2 letters), newest answer wins. */
export function usePilgrimSearch(query: string) {
  const uid = useMeId();
  const clean = normalizeQuery(query);
  const settled = useDebouncedValue(clean, 350);
  const [results, setResults] = useState<PilgrimResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const gate = useRef(createLatestGate()).current;

  const search = useCallback(async (q: string) => {
    const current = gate.next();
    setLoading(true);
    setError(null);
    try {
      const list = await socialApi.searchPilgrims(q);
      if (current()) setResults(list);
    } catch (e) {
      if (current()) { setError(friendlyError(e, 'Search did not work. Try again.')); setResults(null); }
    } finally {
      if (current()) setLoading(false);
    }
  }, [gate]);

  useEffect(() => {
    if (!uid || !isSearchable(settled)) {
      gate.invalidate();
      setResults(null);
      setLoading(false);
      setError(null);
      return;
    }
    void search(settled);
  }, [uid, settled, search, gate]);

  const setStatus = useCallback((id: string, status: FriendStatus) => setResults((list) => (list ? withStatus(list, id, status) : list)), []);

  /** Take somebody out of the results at once (just blocked: the server leaves them out of the next search too). */
  const hide = useCallback((id: string) => setResults((list) => (list ? list.filter((p) => p.id !== id) : list)), []);

  const act = useCallback(async (p: PilgrimResult, kind: 'add' | 'cancel' | 'accept'): Promise<string | null> => {
    const before = p.friend_status;
    setBusy((b) => new Set(b).add(p.id));
    try {
      if (kind === 'add') {
        const res = await socialApi.sendFriendRequest(p.id);
        setStatus(p.id, res === 'accepted' || res === 'already_friends' ? 'friends' : 'pending_out');
      } else if (kind === 'cancel') {
        await socialApi.cancelFriendRequest(p.id);
        setStatus(p.id, 'none');
      } else {
        await socialApi.respondFriendRequest(p.id, true);
        setStatus(p.id, 'friends');
      }
      void refreshUnreadTotals();
      return null;
    } catch (e) {
      setStatus(p.id, before);
      return friendlyError(e, 'That did not work. Please try again.');
    } finally {
      setBusy((b) => { const next = new Set(b); next.delete(p.id); return next; });
    }
  }, [setStatus]);

  return { results, loading: loading || (isSearchable(clean) && clean !== settled), error, searchable: isSearchable(clean), busy, act, hide, retry: () => search(settled) };
}

/** Just the list of my friends (pickers for a new chat, a new group, adding people to a group). */
export function useFriendList(enabled = true) {
  const uid = useMeId();
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const gate = useRef(createLatestGate()).current;

  const load = useCallback(async () => {
    if (!uid || !enabled) return;
    const current = gate.next();
    setError(null);
    try {
      const list = await socialApi.listFriends();
      if (current()) setFriends(sortByName(list));
    } catch (e) {
      if (current()) setError(friendlyError(e, 'Could not load your friends.'));
    }
  }, [uid, enabled, gate]);

  useEffect(() => { void load(); }, [load]);
  return { friends, error, loading: friends === null && !error, retry: () => { setFriends(null); void load(); } };
}

/** null while unknown. Used to pick the right empty state (no friends yet vs. no chats yet). */
export function useHasFriends(enabled: boolean): boolean | null {
  const uid = useMeId();
  const [has, setHas] = useState<boolean | null>(null);
  useEffect(() => {
    if (!uid || !enabled) return;
    let live = true;
    socialApi.listFriends(1).then((l) => live && setHas(l.length > 0)).catch(() => live && setHas(null));
    return () => { live = false; };
  }, [uid, enabled]);
  return has;
}
