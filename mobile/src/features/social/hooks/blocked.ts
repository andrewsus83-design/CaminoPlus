// Blocked pilgrims screen: the list, pull to refresh, and unblock.
//
// The list comes from list_blocked_pilgrims(), a function added by migration 20261108020000. A server that does
// not have it yet answers with an error; that is shown as one friendly sentence (blockedListError) and nothing
// else in the app calls this hook or the function. There is no polling: a missing function must not be asked
// again every few seconds. Unblocking is a plain delete on `blocks` and works with or without the function.
import { useCallback, useEffect, useRef, useState } from 'react';
import { socialApi } from '../api';
import { blockedListError, createLatestGate, friendlyError } from '../logic';
import type { BlockedPilgrim } from '../types';
import { useMeId } from './base';

export function useBlockedPilgrims() {
  const uid = useMeId();
  const [items, setItems] = useState<BlockedPilgrim[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const gate = useRef(createLatestGate()).current;

  const load = useCallback(async () => {
    if (!uid) return;
    const current = gate.next();
    try {
      const list = await socialApi.listBlocked();
      if (!current()) return;
      setItems(list);
      setError(null);
    } catch (e) {
      if (current()) setError(blockedListError(e));
    }
  }, [uid, gate]);

  useEffect(() => {
    setItems(null);
    setError(null);
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const retry = useCallback(() => {
    setError(null);
    setItems(null);
    void load();
  }, [load]);

  /** Unblock one pilgrim. Returns an error text, or null when it worked (the row is gone from the list then). */
  const unblock = useCallback(async (userId: string): Promise<string | null> => {
    setBusy((b) => new Set(b).add(userId));
    try {
      await socialApi.unblock(userId);
      setItems((list) => (list ? list.filter((p) => p.user_id !== userId) : list));
      return null;
    } catch (e) {
      return friendlyError(e, 'Could not unblock this pilgrim.');
    } finally {
      setBusy((b) => { const next = new Set(b); next.delete(userId); return next; });
    }
  }, []);

  return { items, error, loading: items === null && !error, refreshing, refresh, retry, busy, unblock };
}
