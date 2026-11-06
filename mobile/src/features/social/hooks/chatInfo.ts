// Chat info screen (group or direct): the conversation, its members and every action on them.
// Each action returns an error text (or null when it worked) so the screen can show a toast.
import { useCallback, useEffect, useRef, useState } from 'react';
import { socialApi } from '../api';
import { createLatestGate, friendlyError } from '../logic';
import type { Conversation, Member, ReportReason } from '../types';
import { useIsScreenFocused, useMeId } from './base';
import { cachedConversation, rememberConversations } from './conversations';
import { refreshUnreadTotals } from './unread';

export type InfoPhase = 'loading' | 'ready' | 'error' | 'missing';

export function useChatInfo(conversationId: string) {
  const uid = useMeId();
  const focused = useIsScreenFocused();
  const [conversation, setConversation] = useState<Conversation | null>(() => cachedConversation(conversationId));
  const [members, setMembers] = useState<Member[] | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [phase, setPhase] = useState<InfoPhase>(conversation ? 'ready' : 'loading');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const gate = useRef(createLatestGate()).current;

  const load = useCallback(async () => {
    if (!uid) return;
    const current = gate.next();
    try {
      const [convs, memberList] = await Promise.all([socialApi.listConversations(null), socialApi.listMembers(conversationId)]);
      if (!current()) return;
      rememberConversations(convs);
      const conv = convs.find((c) => c.id === conversationId) ?? null;
      if (!conv) { setPhase('missing'); return; }
      setConversation(conv);
      setMembers(memberList);
      setError(null);
      setPhase('ready');
      if (conv.kind === 'direct' && conv.peer_id) setBlocked(await socialApi.isBlocked(conv.peer_id).catch(() => false));
    } catch (e) {
      if (!current()) return;
      setError(friendlyError(e, 'Could not load this chat.'));
      setPhase((p) => (p === 'ready' ? p : 'error'));
    }
  }, [uid, conversationId, gate]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (focused && phase === 'ready') void load(); }, [focused]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Run an action, reload afterwards, and turn a failure into text. */
  const act = useCallback(async (job: () => Promise<unknown>, failure: string, reload = true): Promise<string | null> => {
    setBusy(true);
    try {
      await job();
      if (reload) await load();
      return null;
    } catch (e) {
      return friendlyError(e, failure);
    } finally {
      setBusy(false);
    }
  }, [load]);

  const rename = useCallback((title: string) => act(() => socialApi.renameGroup(conversationId, title), 'Could not rename the group.'), [act, conversationId]);
  const mute = useCallback((until: string | null) => act(() => socialApi.mute(conversationId, until), 'Could not change notifications.'), [act, conversationId]);
  const leave = useCallback(() => act(async () => { await socialApi.leave(conversationId); void refreshUnreadTotals(); }, 'Could not leave the group.', false), [act, conversationId]);
  const removeMember = useCallback((userId: string) => act(() => socialApi.removeMember(conversationId, userId), 'Could not remove this pilgrim.'), [act, conversationId]);
  const addMembers = useCallback((userIds: string[]) => act(() => socialApi.addMembers(conversationId, userIds), 'Could not add these pilgrims.'), [act, conversationId]);
  const block = useCallback((userId: string) => act(async () => { await socialApi.block(userId); setBlocked(true); }, 'Could not block this pilgrim.', false), [act]);
  const unblock = useCallback((userId: string) => act(async () => { await socialApi.unblock(userId); setBlocked(false); }, 'Could not unblock this pilgrim.', false), [act]);
  const report = useCallback((userId: string, reason: ReportReason) => act(() => socialApi.report({ type: 'profile', targetId: userId, reason }), 'Could not send your report.', false), [act]);

  return { uid, conversation, members, blocked, phase, error, busy, retry: load, rename, mute, leave, removeMember, addMembers, block, unblock, report };
}

/** Report a single message (long-press menu in the chat). */
export const reportMessage = (messageId: string, reason: ReportReason) =>
  socialApi.report({ type: 'message', targetId: messageId, reason }).then(() => null, (e) => friendlyError(e, 'Could not send your report.'));
