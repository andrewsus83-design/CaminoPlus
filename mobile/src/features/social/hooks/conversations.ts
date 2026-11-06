// The conversation list behind the Messages and Groups tabs, and a small cache so a chat screen
// can paint its header at once when you open it from the list.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { socialApi } from '../api';
import { createLatestGate, friendlyError } from '../logic';
import type { Conversation } from '../types';
import { useLiveRefresh, useMeId } from './base';

const cache = new Map<string, Conversation>();

export function rememberConversations(list: Conversation[]) {
  for (const c of list) cache.set(c.id, c);
}
export const cachedConversation = (id: string) => cache.get(id) ?? null;
/** Optimistic: the chat was just opened and read. */
export function rememberRead(id: string) {
  const c = cache.get(id);
  if (c && c.unread_count) cache.set(id, { ...c, unread_count: 0 });
}

export function useConversations() {
  const uid = useMeId();
  const [items, setItems] = useState<Conversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const gate = useRef(createLatestGate()).current;

  const load = useCallback(async () => {
    if (!uid) return;
    const current = gate.next();
    try {
      const list = await socialApi.listConversations(null);
      if (!current()) return;
      rememberConversations(list);
      setItems(list);
      setError(null);
    } catch (e) {
      if (current()) setError(friendlyError(e, 'Could not load your chats.'));
    }
  }, [uid, gate]);

  useEffect(() => {
    setItems(null);
    setError(null);
    void load();
  }, [load]);

  useLiveRefresh(load, { match: (e) => e.table === 'messages' || e.table === 'conversation_members' });

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

  const direct = useMemo(() => (items ?? []).filter((c) => c.kind === 'direct'), [items]);
  const groups = useMemo(() => (items ?? []).filter((c) => c.kind === 'group'), [items]);
  return { items, direct, groups, error, loading: items === null && !error, refreshing, refresh, retry, reload: load };
}
