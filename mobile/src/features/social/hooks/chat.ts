// Everything a conversation screen needs: messages (paged, merged with my unsent ones), members
// and their read cursors, realtime + polling, read marking, sending (through the outbox),
// unsend, replies. Pure decisions (clusters, dates, delivery) live in ../logic.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { PAGE_SIZE, socialApi } from '../api';
import { createDebouncer, createLatestGate, friendlyError, mergeMessages, personName, timelineMessages } from '../logic';
import { discardItem, enqueue, getOutbox, onMessageSent, retryItem, subscribeOutbox } from '../outbox';
import { subscribeSocial } from '../realtime';
import type { ChatMessage, Conversation, MessageKind, Member, TimelineMessage } from '../types';
import { newId } from '../logic';
import { useIsScreenFocused, useLiveRefresh, useMeId } from './base';
import { cachedConversation, rememberConversations, rememberRead } from './conversations';
import { refreshUnreadTotals } from './unread';

export type ChatPerson = { id: string; name: string; avatar_url: string | null; username: string | null };
export type ChatPhase = 'loading' | 'ready' | 'error' | 'missing';

const text = (v: unknown) => (typeof v === 'string' ? v : null);

/** A realtime row (raw table columns) as a ChatMessage. */
function toChatMessage(row: Record<string, unknown>): ChatMessage | null {
  if (typeof row.id !== 'string' || typeof row.conversation_id !== 'string' || typeof row.created_at !== 'string') return null;
  return {
    id: row.id, conversation_id: row.conversation_id, sender_id: text(row.sender_id), kind: (text(row.kind) as MessageKind) ?? 'text',
    body: text(row.body), media_path: text(row.media_path), reply_to: text(row.reply_to), client_created_at: text(row.client_created_at),
    created_at: row.created_at, edited_at: text(row.edited_at), deleted_at: text(row.deleted_at),
  };
}

export function useChat(conversationId: string) {
  const uid = useMeId();
  const focused = useIsScreenFocused();
  const [conversation, setConversation] = useState<Conversation | null>(() => cachedConversation(conversationId));
  const [members, setMembers] = useState<Member[]>([]);
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [phase, setPhase] = useState<ChatPhase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined); // my read cursor when the chat was opened
  const [extra, setExtra] = useState<Record<string, ChatMessage>>({});         // replied-to messages outside the loaded pages
  const [fetched, setFetched] = useState<Record<string, ChatPerson>>({});      // senders who are no longer members
  const [blocked, setBlocked] = useState(false);
  const pending = useSyncExternalStore(subscribeOutbox, getOutbox, getOutbox);
  const gate = useRef(createLatestGate()).current;
  const phaseRef = useRef<ChatPhase>('loading');
  phaseRef.current = phase;
  const focusedRef = useRef(focused);
  focusedRef.current = focused;
  const askedReplies = useRef(new Set<string>());
  const askedPeople = useRef(new Set<string>());

  /** First load (and "Try again"): fails loudly. Later refreshes keep what is on screen. */
  const load = useCallback(async (quiet: boolean) => {
    if (!uid) return;
    const current = gate.next();
    if (!quiet) { setPhase('loading'); setError(null); }
    try {
      const [list, convs, memberList] = await Promise.all([
        socialApi.listMessages(conversationId),
        socialApi.listConversations(null),
        socialApi.listMembers(conversationId).catch(() => null),
      ]);
      if (!current()) return;
      rememberConversations(convs);
      const conv = convs.find((c) => c.id === conversationId) ?? null;
      if (!conv) { setPhase('missing'); return; }
      setConversation(conv);
      setMsgs((old) => mergeMessages(old, list));
      if (phaseRef.current !== 'ready') setHasMore(list.length >= PAGE_SIZE);
      if (memberList) setMembers(memberList);
      setCursor((c) => (c === undefined ? memberList?.find((m) => m.user_id === uid)?.last_read_at ?? null : c));
      setError(null);
      setPhase('ready');
    } catch (e) {
      if (!current()) return;
      if (quiet && phaseRef.current === 'ready') return; // keep showing the chat; the banner already says we are offline
      setError(friendlyError(e, 'Could not load this chat.'));
      setPhase('error');
    }
  }, [uid, conversationId, gate]);

  useEffect(() => {
    setMsgs([]); setMembers([]); setCursor(undefined); setExtra({}); setFetched({}); setHasMore(false);
    askedReplies.current.clear(); askedPeople.current.clear();
    void load(false);
  }, [load]);

  // Read marking: when the chat is shown, and for new messages while it is in front.
  const markReadSoon = useMemo(() => createDebouncer(() => {
    if (!focusedRef.current || AppState.currentState !== 'active' || phaseRef.current !== 'ready') return;
    socialApi.markRead(conversationId)
      .then(() => { rememberRead(conversationId); return refreshUnreadTotals(); })
      .catch(() => { /* offline: the next message or refocus tries again */ });
  }, 600), [conversationId]);
  useEffect(() => () => markReadSoon.cancel(), [markReadSoon]);
  useEffect(() => { if (phase === 'ready' && focused) markReadSoon(); }, [phase, focused, markReadSoon]);

  // Realtime: messages and read cursors of this conversation. Polling / foreground / refocus
  // refreshes come from useLiveRefresh (it also forwards a "reconnected" resync).
  useEffect(() => {
    if (!uid) return;
    return subscribeSocial(uid, (e) => {
      if (e.table === 'messages' && e.row) {
        const m = toChatMessage(e.row);
        if (!m || m.conversation_id !== conversationId) return;
        setMsgs((list) => mergeMessages(list, [m]));
        if (e.type === 'INSERT' && m.sender_id !== uid) markReadSoon();
      } else if (e.table === 'conversation_members' && e.row && e.row.conversation_id === conversationId) {
        const row = e.row;
        if (e.type === 'UPDATE' && typeof row.user_id === 'string' && !row.left_at) {
          setMembers((list) => list.map((x) => (x.user_id === row.user_id ? { ...x, last_read_at: text(row.last_read_at) ?? x.last_read_at } : x)));
        } else {
          void load(true); // someone joined or left
        }
      }
    });
  }, [uid, conversationId, markReadSoon, load]);
  useLiveRefresh(() => load(true), { match: () => false, enabled: phase !== 'loading' });

  // Echo of my own sends (the server copy replaces it when it arrives).
  useEffect(() => onMessageSent((m) => {
    if (m.conversation_id === conversationId) setMsgs((list) => (list.some((x) => x.id === m.id) ? list : mergeMessages(list, [m])));
  }), [conversationId]);

  const loadOlder = useCallback(async () => {
    if (!hasMore || loadingMore || phaseRef.current !== 'ready') return;
    setLoadingMore(true);
    try {
      const before = msgs[0]?.created_at ?? null;
      const older = await socialApi.listMessages(conversationId, { before });
      setHasMore(older.length >= PAGE_SIZE);
      setMsgs((list) => mergeMessages(list, older));
    } catch {
      /* the next scroll to the top tries again */
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, msgs, conversationId]);

  // Messages that are replied to but not in the loaded pages.
  const known = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    for (const k of Object.keys(extra)) map.set(k, extra[k]);
    for (const m of msgs) map.set(m.id, m);
    return map;
  }, [msgs, extra]);
  useEffect(() => {
    const wanted = new Set<string>();
    for (const m of msgs) if (m.reply_to && !known.has(m.reply_to) && !askedReplies.current.has(m.reply_to)) wanted.add(m.reply_to);
    for (const o of pending) if (o.reply_to && !known.has(o.reply_to) && !askedReplies.current.has(o.reply_to)) wanted.add(o.reply_to);
    if (wanted.size === 0) return;
    const ids = [...wanted];
    ids.forEach((id) => askedReplies.current.add(id));
    socialApi.getMessages(ids)
      .then((rows) => setExtra((old) => ({ ...old, ...Object.fromEntries(rows.map((r) => [r.id, r])) })))
      .catch(() => ids.forEach((id) => askedReplies.current.delete(id)));
  }, [msgs, pending, known]);

  // Names and photos of senders: members first, then a best-effort profile lookup for people who left.
  const people = useMemo(() => {
    const map = new Map<string, ChatPerson>();
    for (const [id, p] of Object.entries(fetched)) map.set(id, p);
    for (const m of members) map.set(m.user_id, { id: m.user_id, name: personName(m), avatar_url: m.avatar_url, username: m.username });
    return map;
  }, [members, fetched]);
  useEffect(() => {
    if (phase !== 'ready') return;
    const unknown = new Set<string>();
    for (const m of msgs) if (m.sender_id && m.sender_id !== uid && !people.has(m.sender_id) && !askedPeople.current.has(m.sender_id)) unknown.add(m.sender_id);
    if (unknown.size === 0) return;
    const ids = [...unknown];
    ids.forEach((id) => askedPeople.current.add(id));
    socialApi.profiles(ids)
      .then((rows) => setFetched((old) => ({ ...old, ...Object.fromEntries(rows.map((r) => [r.id, { id: r.id, name: personName(r), avatar_url: r.avatar_url, username: r.username }])) })))
      .catch(() => { /* they stay "Pilgrim" */ });
  }, [msgs, people, phase, uid]);

  // Did I block this person? (direct chats; re-checked when coming back from the info screen)
  const peerId = conversation?.kind === 'direct' ? conversation.peer_id : null;
  useEffect(() => {
    if (!peerId || !focused) return;
    let live = true;
    socialApi.isBlocked(peerId).then((b) => live && setBlocked(b)).catch(() => {});
    return () => { live = false; };
  }, [peerId, focused]);

  const replyOf = useCallback((id: string) => known.get(id) ?? null, [known]);
  const messages: TimelineMessage[] = useMemo(() => timelineMessages(msgs, pending, conversationId), [msgs, pending, conversationId]);
  // A send already failed to reach the server and is waiting to retry: we are effectively offline, whatever the phone says.
  const stalled = useMemo(() => pending.some((o) => o.conversation_id === conversationId && o.status === 'queued' && o.attempts > 0), [pending, conversationId]);

  const send = useCallback((body: string, replyTo: string | null = null) => {
    const clean = body.trim();
    if (!clean || !uid) return false;
    enqueue({ id: newId(), user_id: uid, conversation_id: conversationId, kind: 'text', body: clean, reply_to: replyTo, client_created_at: new Date().toISOString(), local_uri: null, mime: null, media_path: null });
    return true;
  }, [uid, conversationId]);

  const sendImage = useCallback((asset: { uri: string; mimeType?: string | null }, replyTo: string | null = null) => {
    if (!uid) return;
    enqueue({ id: newId(), user_id: uid, conversation_id: conversationId, kind: 'image', body: null, reply_to: replyTo, client_created_at: new Date().toISOString(), local_uri: asset.uri, mime: asset.mimeType ?? 'image/jpeg', media_path: null });
  }, [uid, conversationId]);

  /** Unsend one of my messages. Returns an error text, or null. */
  const unsend = useCallback(async (id: string, mediaPath: string | null = null): Promise<string | null> => {
    try {
      await socialApi.unsend(id, mediaPath);
      setMsgs((list) => list.map((m) => (m.id === id ? { ...m, deleted_at: new Date().toISOString(), body: null, media_path: null } : m)));
      return null;
    } catch (e) {
      return friendlyError(e, 'Could not unsend this message.');
    }
  }, []);

  return {
    uid, conversation, members, people, phase, error, hasMore, loadingMore, loadOlder, retryLoad: () => load(false), refresh: () => load(true),
    cursor, blocked, messages, stalled, replyOf, send, sendImage, retry: retryItem, discard: discardItem, unsend,
    markReadNow: markReadSoon,
  };
}
