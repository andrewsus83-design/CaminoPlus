// Chat building blocks: bubbles (clusters, replies, photos, delivery state), date / system /
// unread rows, the composer and the full-screen photo viewer.
import { ComponentRef, memo, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Keyboard, Modal, Platform, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { c, fonts, radius, role } from '@/theme';
import { MessageAction, clockTime, deliveryLabel, messageActions, nameColor } from '../logic';
import { useChatImage } from '../media';
import type { MessageEntry, SystemEntry } from '../types';
import { Btn, PilgrimAvatar, noOutline } from './primitives';

export type ReplyInfo = { id: string; name: string; text: string };
export type SenderInfo = { id: string; name: string; avatar_url: string | null };

const BIG = 20;
const SMALL = 6;
const MINE_TIME = c.blue100;

/* ------------------------------------------------------------ photos */

type Corners = { topLeft: number; topRight: number };

function ChatImage({ id, path, localUri, mine, bleed, corners, onOpen, onLongPress }: { id: string; path: string | null; localUri?: string | null; mine: boolean; bleed: boolean; corners: Corners; onOpen: (uri: string) => void; onLongPress?: () => void }) {
  const { uri, loading, failed, retry } = useChatImage(id, path, localUri);
  // bleed = the photo fills the top of the bubble edge to edge (no caption above it); otherwise a rounded picture inside the padding
  const box = {
    width: 232, height: 174, overflow: 'hidden' as const, backgroundColor: mine ? c.blue700 : c.sand200,
    ...(bleed
      ? { marginHorizontal: -14, marginTop: -9, marginBottom: 6, borderTopLeftRadius: corners.topLeft, borderTopRightRadius: corners.topRight }
      : { borderRadius: 14 }),
  };
  if (failed) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel="Photo could not load. Tap to try again" onPress={retry} style={[box, { alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12 }]}>
        <Icon name="image" color={mine ? MINE_TIME : role.muted} size={30} />
        <AppText variant="caption" color={mine ? MINE_TIME : role.muted} style={{ textAlign: 'center', letterSpacing: 0 }}>Photo did not load. Tap to try again.</AppText>
      </Pressable>
    );
  }
  return (
    <Pressable accessibilityRole="imagebutton" accessibilityLabel="Photo. Tap to open full screen" onPress={() => uri && onOpen(uri)} onLongPress={onLongPress} delayLongPress={380} style={box}>
      {uri ? <Image source={{ uri }} resizeMode="cover" style={{ width: '100%', height: '100%' }} /> : null}
      {(loading || !uri) && <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' } as object}><ActivityIndicator color={mine ? c.parchment : role.action} /></View>}
    </Pressable>
  );
}

export function ImageViewer({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View accessibilityViewIsModal style={{ flex: 1, backgroundColor: 'rgba(8,20,36,0.96)', justifyContent: 'center' }}>
        {!!uri && <Image source={{ uri }} resizeMode="contain" accessibilityLabel="Photo" style={{ width: '100%', height: '80%' }} />}
        <Pressable accessibilityRole="button" accessibilityLabel="Close photo" onPress={onClose} style={{ position: 'absolute', top: insets.top + 10, right: 16, width: 56, height: 56, borderRadius: radius.pill, backgroundColor: 'rgba(255,253,248,0.16)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="close" color={c.white} size={30} strokeWidth={2.2} />
        </Pressable>
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------ bubbles */

type BubbleProps = {
  entry: MessageEntry;
  isGroup: boolean;
  sender: SenderInfo | null;
  reply: ReplyInfo | null;
  onMenu: (entry: MessageEntry) => void;
  onAction: (entry: MessageEntry, action: MessageAction) => void;
  onRetry: (entry: MessageEntry) => void;
  onOpenImage: (uri: string) => void;
  onJump: (messageId: string) => void;
};

function DeliveryMark({ entry }: { entry: MessageEntry }) {
  switch (entry.delivery) {
    case 'sending': return <Icon name="clock" color={MINE_TIME} size={14} strokeWidth={2} />;
    case 'sent': return <Icon name="check" color={MINE_TIME} size={15} strokeWidth={2.2} />;
    case 'seen': return <Icon name="check-double" color={c.gold} size={17} strokeWidth={2.2} />;
    case 'failed': return <Icon name="info" color="#FFB4A8" size={15} strokeWidth={2.2} />;
    default: return null;
  }
}

export const MessageBubble = memo(function MessageBubble({ entry, isGroup, sender, reply, onMenu, onAction, onRetry, onOpenImage, onJump }: BubbleProps) {
  const { message: m, mine, first, last, showSender } = entry;
  const unsent = !!m.deleted_at;
  const failed = entry.delivery === 'failed';
  const time = clockTime(m.created_at);
  const fg = mine ? c.parchment : role.text;
  const actions = messageActions(m, mine);
  const senderName = sender?.name ?? 'Pilgrim';
  const radii = mine
    ? { borderTopLeftRadius: BIG, borderBottomLeftRadius: BIG, borderTopRightRadius: first ? BIG : SMALL, borderBottomRightRadius: last ? BIG : SMALL }
    : { borderTopRightRadius: BIG, borderBottomRightRadius: BIG, borderTopLeftRadius: first ? BIG : SMALL, borderBottomLeftRadius: last ? BIG : SMALL };
  const spoken = unsent
    ? `${mine ? 'You' : senderName}, ${time}: message unsent`
    : `${mine ? 'You' : senderName}, ${time}: ${m.kind === 'image' ? `photo${m.body ? `, ${m.body}` : ''}` : m.body ?? ''}${entry.delivery ? `. ${deliveryLabel(entry.delivery, entry.seenLabel)}` : ''}`;

  return (
    <View style={{ marginTop: first ? 10 : 2, paddingHorizontal: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: mine ? 'flex-end' : 'flex-start', alignItems: 'flex-start', gap: 8 }}>
        {isGroup && !mine && (
          <View style={{ width: 34 }}>
            {showSender && <PilgrimAvatar name={senderName} uri={sender?.avatar_url} seed={sender?.id ?? m.sender_id ?? senderName} size={34} />}
          </View>
        )}
        <Pressable
          accessible accessibilityRole="button" accessibilityLabel={spoken} accessibilityHint={failed ? 'Tap to try again' : actions.length ? 'Hold for more options' : undefined}
          accessibilityActions={actions.map((a) => ({ name: a, label: { reply: 'Reply', copy: 'Copy', unsend: 'Unsend', report: 'Report', retry: 'Try again', delete: 'Delete' }[a] }))}
          onAccessibilityAction={(e) => onAction(entry, e.nativeEvent.actionName as MessageAction)}
          onPress={failed ? () => onRetry(entry) : undefined}
          onLongPress={actions.length ? () => onMenu(entry) : undefined} delayLongPress={380}
          style={[
            { maxWidth: '80%', paddingHorizontal: 14, paddingTop: 9, paddingBottom: 7, backgroundColor: unsent ? 'transparent' : mine ? c.blue : role.surface, borderWidth: failed ? 2 : 1, borderColor: failed ? c.red : unsent ? c.sand400 : mine ? c.blue : role.border, borderStyle: unsent ? 'dashed' : 'solid' },
            radii,
          ]}
        >
          {showSender && !mine && <AppText variant="label" numberOfLines={1} color={nameColor(m.sender_id ?? senderName)} style={{ fontSize: 15, lineHeight: 20, marginBottom: 2 }}>{senderName}</AppText>}
          {!unsent && reply && (
            <Pressable accessibilityRole="button" accessibilityLabel={`Reply to ${reply.name}: ${reply.text}. Tap to jump to it`} onPress={() => onJump(reply.id)} onLongPress={actions.length ? () => onMenu(entry) : undefined} delayLongPress={380} style={{ flexDirection: 'row', marginBottom: 6, borderRadius: 10, overflow: 'hidden', backgroundColor: mine ? 'rgba(255,253,248,0.14)' : c.parchment }}>
              <View style={{ width: 4, backgroundColor: mine ? c.gold : c.blue }} />
              <View style={{ paddingHorizontal: 10, paddingVertical: 6, flexShrink: 1 }}>
                <AppText variant="label" numberOfLines={1} color={mine ? c.goldSoft : c.blue} style={{ fontSize: 14, lineHeight: 18 }}>{reply.name}</AppText>
                <AppText variant="small" numberOfLines={2} color={mine ? c.parchment : role.muted} style={{ fontSize: 15, lineHeight: 20 }}>{reply.text}</AppText>
              </View>
            </Pressable>
          )}
          {unsent
            ? <AppText variant="small" muted style={{ fontStyle: 'italic', fontSize: 16, lineHeight: 22 }}>{mine ? 'You unsent this message' : 'This message was unsent'}</AppText>
            : (
              <>
                {m.kind === 'image' && (
                  <ChatImage
                    id={m.id} path={m.media_path} localUri={m.local_uri} mine={mine} onOpen={onOpenImage} onLongPress={actions.length ? () => onMenu(entry) : undefined}
                    bleed={!(showSender && !mine) && !reply}
                    corners={{ topLeft: Math.max(0, radii.borderTopLeftRadius - 1), topRight: Math.max(0, radii.borderTopRightRadius - 1) }}
                  />
                )}
                {!!m.body && <AppText variant="body" color={fg} style={{ fontSize: 18, lineHeight: 26, marginTop: m.kind === 'image' ? 6 : 0 }}>{m.body}</AppText>}
              </>
            )}
          <View style={{ flexDirection: 'row', alignSelf: 'flex-end', alignItems: 'center', gap: 5, marginTop: 2 }}>
            <AppText variant="mono" color={mine && !unsent ? MINE_TIME : role.muted} style={{ fontSize: 12, lineHeight: 16 }}>{time}</AppText>
            {mine && !unsent && <DeliveryMark entry={entry} />}
          </View>
        </Pressable>
      </View>
      {(failed || entry.seenLabel || entry.delivery === 'sending') && (
        <View style={{ alignItems: 'flex-end', marginTop: 3, paddingRight: 6 }}>
          {failed
            ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`Not sent. ${m.local_error ?? ''} Tap to try again`} onPress={() => onRetry(entry)} hitSlop={8} style={{ alignItems: 'flex-end' }}>
                <AppText variant="caption" color={c.red} style={{ letterSpacing: 0, fontFamily: fonts.bodyBold }}>Not sent. Tap to try again</AppText>
                {!!m.local_error && <AppText variant="caption" muted style={{ letterSpacing: 0, fontSize: 14, lineHeight: 18, textAlign: 'right', maxWidth: 280 }}>{m.local_error}</AppText>}
              </Pressable>
            )
            : <AppText variant="caption" muted style={{ letterSpacing: 0 }}>{entry.delivery === 'sending' ? 'Sending…' : entry.seenLabel}</AppText>}
        </View>
      )}
    </View>
  );
});

/* ------------------------------------------------------------ in-between rows */

export function DateChip({ label }: { label: string }) {
  return (
    <View style={{ alignItems: 'center', marginVertical: 14 }}>
      <View style={{ backgroundColor: c.sand200, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 5 }}>
        <AppText variant="caption" muted style={{ letterSpacing: 0 }}>{label}</AppText>
      </View>
    </View>
  );
}

export function SystemChip({ entry }: { entry: SystemEntry }) {
  return (
    <View style={{ alignItems: 'center', marginVertical: 8, paddingHorizontal: 16 }}>
      <View style={{ backgroundColor: role.surface, borderWidth: 1, borderColor: role.border, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 8, maxWidth: '92%' }}>
        <AppText variant="caption" color={role.text} style={{ letterSpacing: 0, textAlign: 'center', fontSize: 15, lineHeight: 20 }}>{entry.message.body ?? ''}</AppText>
      </View>
    </View>
  );
}

export function UnreadDivider() {
  return (
    <View accessibilityRole="header" accessibilityLabel="New messages below" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 14 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: c.gold, opacity: 0.55 }} />
      <View style={{ backgroundColor: c.goldWash, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 5, borderWidth: 1, borderColor: c.goldSoft }}>
        <AppText variant="caption" color={c.goldInk} style={{ letterSpacing: 0, fontFamily: fonts.bodyBold }}>New messages</AppText>
      </View>
      <View style={{ flex: 1, height: 1, backgroundColor: c.gold, opacity: 0.55 }} />
    </View>
  );
}

/* ------------------------------------------------------------ composer */

type ComposerProps = {
  onSend: (text: string) => boolean | void;
  onPhoto: () => void;
  reply: { name: string; text: string } | null;
  onCancelReply: () => void;
  blockedName?: string | null;
  onUnblock?: () => void;
  unblocking?: boolean;
  focusToken?: number; // bump to put the cursor in the box (after choosing Reply)
};

// One line = exactly 52 dp (13 + 24 line + 13 padding + 2 border), the same height as the round buttons.
// It grows with the text up to about 5 lines (140 dp) and scrolls inside after that.
const INPUT_MIN = 52;
const INPUT_MAX = 140;

export function Composer({ onSend, onPhoto, reply, onCancelReply, blockedName, onUnblock, unblocking, focusToken }: ComposerProps) {
  const insets = useSafeAreaInsets();
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const [text, setText] = useState('');
  const [keyboard, setKeyboard] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboard(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboard(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  useEffect(() => { if (focusToken) input.current?.focus(); }, [focusToken]);

  // Phones grow a multiline TextInput by themselves (minHeight .. maxHeight). A web textarea does not:
  // shrink it to nothing first so scrollHeight is the height of the text (soft-wrapped lines included), then fit it.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el = input.current as unknown as { style?: { height: string }; scrollHeight?: number } | null;
    if (!el?.style || el.scrollHeight == null) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(INPUT_MAX, Math.max(INPUT_MIN, (el.scrollHeight ?? 0) + 2))}px`;
  }, [text]);

  const ready = text.trim().length > 0;
  const submit = () => {
    if (!ready) return;
    if (onSend(text) !== false) setText('');
  };
  const bottom = keyboard ? 8 : Math.max(insets.bottom, 8);

  if (blockedName) {
    return (
      <View style={{ borderTopWidth: 1, borderTopColor: role.border, backgroundColor: role.bg, paddingHorizontal: 16, paddingTop: 12, paddingBottom: bottom + 4, gap: 10 }}>
        <AppText variant="small" muted style={{ textAlign: 'center' }}>You blocked {blockedName}. Unblock to send messages again.</AppText>
        <Btn label={`Unblock ${blockedName}`} variant="ghost" onPress={onUnblock} loading={unblocking} />
      </View>
    );
  }

  return (
    <View style={{ borderTopWidth: 1, borderTopColor: role.border, backgroundColor: role.bg, paddingHorizontal: 10, paddingTop: 8, paddingBottom: bottom }}>
      {reply && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8, marginHorizontal: 4, backgroundColor: role.surface, borderRadius: 14, borderWidth: 1, borderColor: role.border, overflow: 'hidden' }}>
          <View style={{ width: 4, alignSelf: 'stretch', backgroundColor: c.gold }} />
          <View style={{ flex: 1, paddingVertical: 8 }}>
            <AppText variant="label" numberOfLines={1} color={c.blue} style={{ fontSize: 14, lineHeight: 18 }}>Replying to {reply.name}</AppText>
            <AppText variant="small" muted numberOfLines={1} style={{ fontSize: 15, lineHeight: 20 }}>{reply.text}</AppText>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel reply" onPress={onCancelReply} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="close" color={role.muted} size={22} />
          </Pressable>
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Add a photo" onPress={onPhoto} style={({ pressed }) => ({ width: INPUT_MIN, height: INPUT_MIN, borderRadius: radius.pill, backgroundColor: pressed ? c.sand200 : role.surface, borderWidth: 1, borderColor: role.border, alignItems: 'center', justifyContent: 'center' })}>
          <Icon name="image" color={c.blue} size={24} />
        </Pressable>
        <TextInput
          ref={input} value={text} onChangeText={setText}
          multiline maxLength={4000} placeholder="Write a message" placeholderTextColor={role.muted} accessibilityLabel="Message"
          onKeyPress={Platform.OS === 'web' ? (e) => {
            // Web only (handy for testing): Enter sends, Shift+Enter adds a line. Phones keep Enter = new line.
            const ev = e as unknown as { key?: string; shiftKey?: boolean; nativeEvent?: { key?: string; shiftKey?: boolean }; preventDefault?: () => void };
            if ((ev.nativeEvent?.key ?? ev.key) === 'Enter' && !(ev.nativeEvent?.shiftKey ?? ev.shiftKey)) { ev.preventDefault?.(); submit(); }
          } : undefined}
          style={[{ flex: 1, minHeight: INPUT_MIN, maxHeight: INPUT_MAX, borderRadius: 26, backgroundColor: role.surface, borderWidth: 1, borderColor: role.border, paddingHorizontal: 18, paddingTop: 13, paddingBottom: 13, fontFamily: fonts.body, fontSize: 18, lineHeight: 24, color: role.text, textAlignVertical: 'center' }, noOutline]}
        />
        <Pressable
          accessibilityRole="button" accessibilityLabel="Send message" accessibilityState={{ disabled: !ready }} disabled={!ready} onPress={submit}
          style={({ pressed }) => ({ width: INPUT_MIN, height: INPUT_MIN, borderRadius: radius.pill, backgroundColor: ready ? c.gold : c.sand200, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}
        >
          <Icon name="send" color={ready ? c.blue : role.muted} size={24} strokeWidth={2} />
        </Pressable>
      </View>
    </View>
  );
}
