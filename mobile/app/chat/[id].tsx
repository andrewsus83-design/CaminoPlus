import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, NativeScrollEvent, NativeSyntheticEvent, Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Icon, IconName } from '@/components/Icon';
import { IconButton } from '@/components/ui';
import { reportMessage, socialApi, useChat, useOnlineStatus } from '@/features/social';
import { Composer, DateChip, ImageViewer, MessageBubble, ReplyInfo, SenderInfo, SystemChip, UnreadDivider } from '@/features/social/components/chat';
import { useDialogs } from '@/features/social/components/dialogs';
import { CountBadge, PilgrimAvatar } from '@/features/social/components/primitives';
import { EmptyState, ErrorState, Notice, OFFLINE_TEXT } from '@/features/social/components/states';
import { MessageAction, buildTimeline, conversationName, friendlyError, messageActions, pilgrimsLabel, REPORT_REASONS, snippet, storageGate, toInverted, ts } from '@/features/social/logic';
import { goBack } from '@/features/social/nav';
import { MAX_PHOTO_BYTES, PickerUnavailable, pickPhoto } from '@/features/social/pick';
import type { ChatMessage, MessageEntry, ReportReason, TimelineEntry } from '@/features/social/types';
import { copyText } from '@/lib/clipboard';
import { config } from '@/lib/config';
import { c, radius, role, shadowStyle, layout } from '@/theme';

const ACTION: Record<MessageAction, { label: string; icon: IconName; danger?: boolean }> = {
  reply: { label: 'Reply', icon: 'reply' },
  copy: { label: 'Copy text', icon: 'copy' },
  unsend: { label: 'Unsend', icon: 'trash', danger: true },
  report: { label: 'Report', icon: 'flag', danger: true },
  retry: { label: 'Try sending again', icon: 'send' },
  delete: { label: 'Delete message', icon: 'trash', danger: true },
};

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const chat = useChat(String(id));
  const online = useOnlineStatus();
  const { confirm, menu, notice, toast, host } = useDialogs();
  const listRef = useRef<FlatList<TimelineEntry>>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const [viewer, setViewer] = useState<string | null>(null);
  const [showJump, setShowJump] = useState(false);
  const [missed, setMissed] = useState(0);
  const [unblocking, setUnblocking] = useState(false);
  const nearBottom = useRef(true);
  const lastSeen = useRef<number | null>(null);
  const storage = useRef<{ at: number; gate: ReturnType<typeof storageGate> } | null>(null);

  const conv = chat.conversation;
  const group = conv?.kind === 'group';
  const title = conv ? conversationName(conv) : 'Chat';
  const meId = chat.uid ?? '';

  const entries = useMemo(
    () => buildTimeline({ messages: chat.messages, meId, isGroup: !!group, now: Date.now(), members: chat.members, unreadCursor: chat.cursor ?? null }),
    [chat.messages, chat.members, chat.cursor, meId, group],
  );
  const rows = useMemo(() => toInverted(entries), [entries]);

  const nameOf = useCallback((userId: string | null) => (userId === meId ? 'You' : (userId && chat.people.get(userId)?.name) || 'Pilgrim'), [chat.people, meId]);
  const senderFor = useCallback((userId: string | null): SenderInfo | null => {
    const p = userId ? chat.people.get(userId) : null;
    return userId ? { id: userId, name: p?.name ?? 'Pilgrim', avatar_url: p?.avatar_url ?? null } : null;
  }, [chat.people]);
  const { replyOf, retry: retryMessage } = chat;
  const replyFor = useCallback((m: ChatMessage): ReplyInfo | null => {
    if (!m.reply_to) return null;
    const original = replyOf(m.reply_to);
    return { id: m.reply_to, name: original ? nameOf(original.sender_id) : 'Message', text: snippet(original) };
  }, [replyOf, nameOf]);

  // New messages from others while the pilgrim is reading older ones: count them on the jump button.
  useEffect(() => {
    const latest = chat.messages.length ? ts(chat.messages[chat.messages.length - 1].created_at) : null;
    if (latest == null) return;
    const before = lastSeen.current;
    lastSeen.current = latest;
    if (before == null || nearBottom.current) return;
    const fresh = chat.messages.filter((m) => !('local' in m && m.local) && m.sender_id !== meId && ts(m.created_at) > before).length;
    if (fresh > 0) setMissed((n) => n + fresh);
  }, [chat.messages, meId]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    nearBottom.current = y < 120;
    const far = y > 360;
    setShowJump((v) => (v === far ? v : far));
    if (y < 120) setMissed((n) => (n === 0 ? n : 0));
  }, []);

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    setMissed(0);
  }, []);

  const jumpTo = useCallback((messageId: string) => {
    const index = rows.findIndex((r) => r.kind === 'message' && r.message.id === messageId);
    if (index < 0) { toast('That message is further up. Scroll to load older messages.'); return; }
    listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
  }, [rows, toast]);

  const onSend = useCallback((text: string) => {
    const ok = chat.send(text, replyTo?.id ?? null);
    if (ok) { setReplyTo(null); scrollToBottom(); }
    return ok;
  }, [chat, replyTo, scrollToBottom]);

  const addPhoto = useCallback(async () => {
    // Photos need cloud storage (Pilgrim Plus). Ask once a minute at most; offline we let the upload decide.
    let gate = storage.current && Date.now() - storage.current.at < 60_000 ? storage.current.gate : null;
    if (!gate) {
      gate = storageGate(await socialApi.storage().catch(() => null));
      storage.current = { at: Date.now(), gate };
    }
    if (gate === 'plus_required') {
      const go = await notice({
        title: 'Photos in chat are part of Pilgrim Plus', icon: 'image',
        message: `Pilgrim Plus (${config.priceLabel}) includes cloud storage for your photos, so you can share them with friends right here.`,
        primary: { label: 'See Pilgrim Plus', value: 'plus' },
      });
      if (go === 'plus') router.push('/(tabs)/settings');
      return;
    }
    if (gate === 'full') {
      await notice({ title: 'Your cloud storage is full', icon: 'image', message: 'Free up some space in Settings, then try again.' });
      return;
    }
    try {
      const photo = await pickPhoto();
      if (!photo) return;
      if ((photo.fileSize ?? 0) > MAX_PHOTO_BYTES) { toast('That photo is bigger than 15 MB. Pick a smaller one.'); return; }
      chat.sendImage(photo, replyTo?.id ?? null);
      setReplyTo(null);
      scrollToBottom();
    } catch (e) {
      toast(e instanceof PickerUnavailable ? e.message : friendlyError(e, 'Could not add that photo.'));
    }
  }, [chat, notice, replyTo, router, scrollToBottom, toast]);

  const runAction = useCallback(async (entry: MessageEntry, action: MessageAction) => {
    const m = entry.message;
    if (action === 'reply') {
      setReplyTo(m);
      setFocusTick((n) => n + 1);
    } else if (action === 'copy') {
      if (m.body) toast((await copyText(m.body)) ? 'Copied' : 'Choose Copy in the share sheet');
    } else if (action === 'retry') {
      chat.retry(m.id);
    } else if (action === 'delete') {
      if (await confirm({ title: 'Delete this message?', message: 'It has not been sent yet. It will be removed from this phone.', confirmLabel: 'Delete', destructive: true, icon: 'trash' })) chat.discard(m.id);
    } else if (action === 'unsend') {
      if (await confirm({ title: 'Unsend this message?', message: 'It will disappear for everyone in this chat.', confirmLabel: 'Unsend', destructive: true, icon: 'trash' })) {
        const err = await chat.unsend(m.id);
        if (err) toast(err);
      }
    } else if (action === 'report') {
      const reason = await menu({ title: 'Report this message', message: 'Tell us what is wrong. We review every report.', options: REPORT_REASONS.map((r) => ({ key: r.key, label: r.label })) });
      if (reason) toast((await reportMessage(m.id, reason as ReportReason)) ?? 'Thank you. We will take a look.');
    }
  }, [chat, confirm, menu, toast]);

  const openMenu = useCallback(async (entry: MessageEntry) => {
    const acts = messageActions(entry.message, entry.mine);
    if (acts.length === 0) return;
    const choice = await menu({ options: acts.map((a) => ({ key: a, label: ACTION[a].label, icon: ACTION[a].icon, destructive: ACTION[a].danger })) });
    if (choice) await runAction(entry, choice as MessageAction);
  }, [menu, runAction]);

  const unblock = useCallback(async () => {
    if (!conv?.peer_id) return;
    setUnblocking(true);
    try {
      await socialApi.unblock(conv.peer_id);
      chat.refresh();
      toast(`${title} is unblocked.`);
    } catch (e) {
      toast(friendlyError(e, 'Could not unblock this pilgrim.'));
    } finally {
      setUnblocking(false);
    }
  }, [chat, conv?.peer_id, title, toast]);

  const renderItem = useCallback(({ item }: { item: TimelineEntry }) => {
    if (item.kind === 'date') return <DateChip label={item.label} />;
    if (item.kind === 'unread') return <UnreadDivider />;
    if (item.kind === 'system') return <SystemChip entry={item} />;
    return (
      <MessageBubble
        entry={item} isGroup={!!group} sender={item.mine ? null : senderFor(item.message.sender_id)} reply={replyFor(item.message)}
        onMenu={openMenu} onAction={runAction} onRetry={(e) => retryMessage(e.message.id)} onOpenImage={setViewer} onJump={jumpTo}
      />
    );
  }, [group, senderFor, replyFor, openMenu, runAction, retryMessage, jumpTo]);

  let body;
  if (chat.phase === 'missing') {
    body = <EmptyState icon="chat" title="This chat is not available" text="You may have left the group, or it was removed." action={{ label: 'Back to inbox', onPress: () => router.replace('/inbox') }} />;
  } else if (chat.phase === 'error') {
    body = <ErrorState text={chat.error ?? 'Please try again.'} onRetry={chat.retryLoad} />;
  } else if (chat.phase === 'loading') {
    body = <LoadingBubbles />;
  } else if (entries.length === 0) {
    body = <EmptyState icon="shell" title="Say hello" text={group ? 'Be the first to write in this group.' : `Send the first message to ${title}. Buen Camino!`} />;
  } else {
    body = (
      <FlatList
        ref={listRef} inverted data={rows} keyExtractor={(r) => r.key} renderItem={renderItem} extraData={chat.people}
        onEndReached={chat.loadOlder} onEndReachedThreshold={0.5} onScroll={onScroll} scrollEventThrottle={64}
        keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" maintainVisibleContentPosition={{ minIndexForVisible: 1, autoscrollToTopThreshold: 80 }}
        onScrollToIndexFailed={(info) => {
          listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true });
          setTimeout(() => listRef.current?.scrollToIndex({ index: info.index, viewPosition: 0.5, animated: true }), 350);
        }}
        contentContainerStyle={{ paddingHorizontal: layout.screenMargin, paddingVertical: 10 }}
        ListFooterComponent={chat.loadingMore ? <ActivityIndicator color={role.action} style={{ margin: 16 }} /> : !chat.hasMore ? <StartOfChat text={group ? 'This is the start of the group' : `This is the start of your chat with ${title}`} /> : undefined}
      />
    );
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: role.bg }}>
      <View style={{ paddingTop: insets.top + 8, paddingBottom: 10, paddingHorizontal: layout.screenMargin, flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: 1, borderBottomColor: role.border, backgroundColor: role.bg }}>
        <IconButton name="back" label="Back" flat onPress={() => goBack(router)} />
        <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${group ? pilgrimsLabel(conv?.member_count ?? 0) : 'Friend'}. Open chat info`} onPress={() => router.push(`/chat/info/${id}`)} style={{ flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {conv
            ? <PilgrimAvatar name={title} uri={group ? conv.avatar_url : conv.peer_avatar_url} seed={conv.peer_id ?? String(id)} size={44} group={group} />
            : <View style={{ width: 44, height: 44, borderRadius: radius.pill, backgroundColor: c.sand200 }} />}
          <View style={{ flex: 1 }}>
            <AppText variant="label" numberOfLines={1} style={{ fontSize: 18, lineHeight: 23 }}>{title}</AppText>
            {!!conv && <AppText variant="caption" muted numberOfLines={1} style={{ letterSpacing: 0, fontSize: 14, lineHeight: 18 }}>{group ? pilgrimsLabel(conv.member_count) : 'Friend'}</AppText>}
          </View>
        </Pressable>
        <IconButton name="info" label="Chat info" flat onPress={() => router.push(`/chat/info/${id}`)} />
      </View>
      {(!online || chat.stalled) && <Notice icon="wifi-off" text={OFFLINE_TEXT} />}
      <View style={{ flex: 1 }}>
        {body}
        {showJump && chat.phase === 'ready' && (
          <Pressable
            accessibilityRole="button" accessibilityLabel={missed ? `Go to the newest messages, ${missed} new` : 'Go to the newest messages'} onPress={scrollToBottom}
            style={{ position: 'absolute', right: layout.screenMargin, bottom: 12, width: 52, height: 52, borderRadius: radius.pill, backgroundColor: role.surface, borderWidth: 1, borderColor: role.border, alignItems: 'center', justifyContent: 'center', ...shadowStyle('md') }}
          >
            <Icon name="arrow-down" color={c.blue} size={26} />
            {missed > 0 && <CountBadge count={missed} tone="blue" style={{ position: 'absolute', top: -9, left: -7 }} />}
          </Pressable>
        )}
      </View>
      {chat.phase === 'ready' && (
        <Composer
          onSend={onSend} onPhoto={addPhoto} focusToken={focusTick}
          reply={replyTo ? { name: nameOf(replyTo.sender_id), text: snippet(replyTo) } : null} onCancelReply={() => setReplyTo(null)}
          blockedName={chat.blocked ? title : null} onUnblock={unblock} unblocking={unblocking}
        />
      )}
      {host}
      <ImageViewer uri={viewer} onClose={() => setViewer(null)} />
    </KeyboardAvoidingView>
  );
}

function StartOfChat({ text }: { text: string }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 20, paddingHorizontal: layout.screenMargin, gap: 8 }}>
      <Icon name="shell" color={c.gold} size={26} />
      <AppText variant="caption" muted style={{ textAlign: 'center', letterSpacing: 0 }}>{text}</AppText>
    </View>
  );
}

function LoadingBubbles() {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Loading messages" style={{ flex: 1, justifyContent: 'flex-end', padding: 14, gap: 10 }}>
      {[[false, 190], [false, 120], [true, 150], [false, 230], [true, 100], [true, 210]].map(([mine, w], i) => (
        <View key={i} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', width: w as number, height: 46, borderRadius: 20, backgroundColor: mine ? c.blue100 : c.sand200 }} />
      ))}
    </View>
  );
}
