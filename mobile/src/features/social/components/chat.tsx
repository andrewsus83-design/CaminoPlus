// Chat building blocks: bubbles (clusters, replies, photos, delivery state), date / system /
// unread rows, the composer and the full-screen photo viewer.
import { ComponentRef, memo, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Keyboard, Modal, Platform, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { FIXED } from '@/components/fixedColors';
import { Icon } from '@/components/Icon';
import { c, fonts, layout, radius, role, space, textStyle } from '@/theme';
import { HelpBody, LinkedText, helpSpoken, linkTarget, openUrl } from '../help/bubble';
import { isHelpMessage } from '../help/logic';
import { MessageAction, clockTime, deliveryLabel, messageActions, nameColor } from '../logic';
import { useChatImage } from '../media';
import type { MessageEntry, SystemEntry } from '../types';
import { Btn, PilgrimAvatar, noOutline } from './primitives';

export type ReplyInfo = { id: string; name: string; text: string };
export type SenderInfo = { id: string; name: string; avatar_url: string | null };

const BIG = radius.md;
const SMALL = radius.xs;
// The room of the words inside a bubble. The photo that fills the top of a bubble pulls itself out by the same numbers (negative margins), so they live in one place.
const PAD_X = space[4];
const PAD_Y = space[2];
const mineTime = () => c.blue100; // function, so it follows the light/dark theme

/* ------------------------------------------------------------ photos */

type Corners = { topLeft: number; topRight: number };

function ChatImage({ id, path, localUri, mine, bleed, corners, onOpen, onLongPress }: { id: string; path: string | null; localUri?: string | null; mine: boolean; bleed: boolean; corners: Corners; onOpen: (uri: string) => void; onLongPress?: () => void }) {
  const { uri, loading, failed, retry } = useChatImage(id, path, localUri);
  // bleed = the photo fills the top of the bubble edge to edge (no caption above it); otherwise a rounded picture inside the padding
  const box = {
    width: 232, height: 174, overflow: 'hidden' as const, backgroundColor: mine ? c.blue700 : role.sunken,
    ...(bleed
      ? { marginHorizontal: -PAD_X, marginTop: -PAD_Y, marginBottom: space[2], borderTopLeftRadius: corners.topLeft, borderTopRightRadius: corners.topRight }
      : { borderRadius: radius.sm }),
  };
  if (failed) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel="Photo could not load. Tap to try again" onPress={retry} style={[box, { alignItems: 'center', justifyContent: 'center', gap: space[2], padding: space[3] }]}>
        <Icon name="image" color={mine ? mineTime() : role.muted} size={32} />
        <AppText variant="caption" color={mine ? mineTime() : role.muted} style={{ textAlign: 'center' }}>Photo did not load. Tap to try again.</AppText>
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
      <View accessibilityViewIsModal style={{ flex: 1, backgroundColor: FIXED.black, justifyContent: 'center' }}>
        {!!uri && <Image source={{ uri }} resizeMode="contain" accessibilityLabel="Photo" style={{ width: '100%', height: '80%' }} />}
        <Pressable
          accessibilityRole="button" accessibilityLabel="Close photo" onPress={onClose}
          // design-lint-ignore: color a pale glass disc on the black of the photo viewer: FIXED.photoChip is a dark chip and would vanish on black, and no token is a light tint on black
          style={{ position: 'absolute', top: insets.top + layout.screenTop, right: layout.screenMargin, width: layout.touchMin, height: layout.touchMin, borderRadius: radius.pill, backgroundColor: 'rgba(255,253,248,0.16)', alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="close" color={FIXED.onPhoto} size={32} strokeWidth={2.2} />
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

// onLight = on the pale red bubble of a help request (the light marks of the blue bubble would disappear there).
function DeliveryMark({ entry, onLight }: { entry: MessageEntry; onLight?: boolean }) {
  switch (entry.delivery) {
    case 'sending': return <Icon name="clock" color={onLight ? role.muted : mineTime()} size={18} strokeWidth={2} />;
    case 'sent': return <Icon name="check" color={onLight ? role.muted : mineTime()} size={18} strokeWidth={2.2} />;
    case 'seen': return <Icon name="check-double" color={onLight ? role.action : role.highlight} size={18} strokeWidth={2.2} />;
    case 'failed': return <Icon name="info" color={onLight ? c.red700 : c.red100} size={18} strokeWidth={2.2} />;
    default: return null;
  }
}

export const MessageBubble = memo(function MessageBubble({ entry, isGroup, sender, reply, onMenu, onAction, onRetry, onOpenImage, onJump }: BubbleProps) {
  const { message: m, mine, first, last, showSender } = entry;
  const unsent = !!m.deleted_at;
  const failed = entry.delivery === 'failed';
  const time = clockTime(m.created_at);
  // A help request from the help bell: its own red bubble. Links in any text message are tappable (http and https only).
  const help = !unsent && m.kind === 'text' && isHelpMessage(m.body);
  const link = unsent ? null : linkTarget(m.body);
  const fg = mine && !help ? role.onAction : role.text;
  const actions = messageActions(m, mine);
  const senderName = sender?.name ?? 'Pilgrim';
  const radii = mine
    ? { borderTopLeftRadius: BIG, borderBottomLeftRadius: BIG, borderTopRightRadius: first ? BIG : SMALL, borderBottomRightRadius: last ? BIG : SMALL }
    : { borderTopRightRadius: BIG, borderBottomRightRadius: BIG, borderTopLeftRadius: first ? BIG : SMALL, borderBottomLeftRadius: last ? BIG : SMALL };
  const spoken = unsent
    ? `${mine ? 'You' : senderName}, ${time}: message unsent`
    : `${mine ? 'You' : senderName}, ${time}: ${help && m.body ? helpSpoken(m.body) : m.kind === 'image' ? `photo${m.body ? `, ${m.body}` : ''}` : m.body ?? ''}${entry.delivery ? `. ${deliveryLabel(entry.delivery, entry.seenLabel)}` : ''}`;

  return (
    <View style={{ marginTop: first ? space[3] : space[1], paddingHorizontal: space[1] }}>
      <View style={{ flexDirection: 'row', justifyContent: mine ? 'flex-end' : 'flex-start', alignItems: 'flex-start', gap: space[2] }}>
        {isGroup && !mine && (
          <View style={{ width: 34 }}>
            {showSender && <PilgrimAvatar name={senderName} uri={sender?.avatar_url} seed={sender?.id ?? m.sender_id ?? senderName} size={34} />}
          </View>
        )}
        <Pressable
          accessible accessibilityRole="button" accessibilityLabel={spoken} accessibilityHint={failed ? 'Tap to try again' : actions.length ? 'Hold for more options' : undefined}
          accessibilityActions={[
            ...actions.map((a) => ({ name: a, label: { reply: 'Reply', copy: 'Copy', unsend: 'Unsend', report: 'Report', retry: 'Try again', delete: 'Delete' }[a] })),
            ...(link ? [{ name: 'openLink', label: help ? 'Open map' : 'Open link' }] : []), // a screen reader cannot reach a link inside the bubble
          ]}
          onAccessibilityAction={(e) => {
            const name = e.nativeEvent.actionName;
            if (name === 'openLink') { if (link) void openUrl(link); } else onAction(entry, name as MessageAction);
          }}
          onPress={failed ? () => onRetry(entry) : undefined}
          onLongPress={actions.length ? () => onMenu(entry) : undefined} delayLongPress={380}
          style={[
            { maxWidth: help ? '90%' : '80%', paddingHorizontal: PAD_X, paddingVertical: PAD_Y, backgroundColor: unsent ? 'transparent' : help ? c.red100 : mine ? role.action : role.surface, borderWidth: failed || help ? 2 : 1, borderColor: failed || help ? role.danger : unsent ? role.borderStrong : mine ? role.action : role.border, borderStyle: unsent ? 'dashed' : 'solid' },
            radii,
          ]}
        >
          {showSender && !mine && <AppText variant="label" numberOfLines={1} color={nameColor(m.sender_id ?? senderName)} style={{ marginBottom: space[1] }}>{senderName}</AppText>}
          {!unsent && reply && (
            <Pressable accessibilityRole="button" accessibilityLabel={`Reply to ${reply.name}: ${reply.text}. Tap to jump to it`} onPress={() => onJump(reply.id)} onLongPress={actions.length ? () => onMenu(entry) : undefined} delayLongPress={380} style={{ flexDirection: 'row', marginBottom: space[2], borderRadius: radius.sm, overflow: 'hidden', backgroundColor: mine ? c.blue700 : role.bg }}>
              <View style={{ width: 4, backgroundColor: mine ? role.highlight : role.action }} />
              <View style={{ paddingHorizontal: space[3], paddingVertical: space[2], flexShrink: 1 }}>
                <AppText variant="caption" numberOfLines={1} color={mine ? c.goldSoft : role.action} style={{ fontFamily: fonts.bodyBold }}>{reply.name}</AppText>
                <AppText variant="caption" numberOfLines={2} color={mine ? role.onAction : role.muted}>{reply.text}</AppText>
              </View>
            </Pressable>
          )}
          {unsent
            ? <AppText variant="small" muted>{mine ? 'You unsent this message' : 'This message was unsent'}</AppText>
            : (
              <>
                {m.kind === 'image' && (
                  <ChatImage
                    id={m.id} path={m.media_path} localUri={m.local_uri} mine={mine} onOpen={onOpenImage} onLongPress={actions.length ? () => onMenu(entry) : undefined}
                    bleed={!(showSender && !mine) && !reply}
                    corners={{ topLeft: Math.max(0, radii.borderTopLeftRadius - 1), topRight: Math.max(0, radii.borderTopRightRadius - 1) }}
                  />
                )}
                {!!m.body && (
                  <View style={{ marginTop: m.kind === 'image' ? space[2] : 0 }}>
                    {help ? <HelpBody body={m.body} /> : <LinkedText text={m.body} color={fg} linkColor={mine ? c.goldSoft : c.blue700} />}
                  </View>
                )}
              </>
            )}
          <View style={{ flexDirection: 'row', alignSelf: 'flex-end', alignItems: 'center', gap: space[1], marginTop: space[1] }}>
            <AppText variant="mono" color={mine && !unsent && !help ? mineTime() : role.muted}>{time}</AppText>
            {mine && !unsent && <DeliveryMark entry={entry} onLight={help} />}
          </View>
        </Pressable>
      </View>
      {(failed || entry.seenLabel || entry.delivery === 'sending') && (
        <View style={{ alignItems: 'flex-end', marginTop: space[1], paddingRight: space[2] }}>
          {failed
            ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`Not sent. ${m.local_error ?? ''} Tap to try again`} onPress={() => onRetry(entry)} hitSlop={8} style={{ minHeight: 48, alignItems: 'flex-end', justifyContent: 'center' }}>
                <AppText variant="caption" color={role.danger} style={{ fontFamily: fonts.bodyBold }}>Not sent. Tap to try again</AppText>
                {!!m.local_error && <AppText variant="caption" muted style={{ textAlign: 'right', maxWidth: 280 }}>{m.local_error}</AppText>}
              </Pressable>
            )
            : <AppText variant="caption" muted>{entry.delivery === 'sending' ? 'Sending…' : entry.seenLabel}</AppText>}
        </View>
      )}
    </View>
  );
});

/* ------------------------------------------------------------ in-between rows */

export function DateChip({ label }: { label: string }) {
  return (
    <View style={{ alignItems: 'center', marginVertical: space[4] }}>
      <View style={{ backgroundColor: role.sunken, borderRadius: radius.pill, paddingHorizontal: space[4], paddingVertical: space[2] }}>
        <AppText variant="caption" muted>{label}</AppText>
      </View>
    </View>
  );
}

export function SystemChip({ entry }: { entry: SystemEntry }) {
  return (
    <View style={{ alignItems: 'center', marginVertical: space[2], paddingHorizontal: layout.screenMargin }}>
      <View style={{ backgroundColor: role.surface, borderWidth: 1, borderColor: role.border, borderRadius: radius.md, paddingHorizontal: space[4], paddingVertical: space[2], maxWidth: '92%' }}>
        <AppText variant="caption" color={role.text} style={{ textAlign: 'center' }}>{entry.message.body ?? ''}</AppText>
      </View>
    </View>
  );
}

export function UnreadDivider() {
  return (
    <View accessibilityRole="header" accessibilityLabel="New messages below" style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], marginVertical: space[4] }}>
      <View style={{ flex: 1, height: 1, backgroundColor: role.highlight, opacity: 0.55 }} />
      <View style={{ backgroundColor: c.goldWash, borderRadius: radius.pill, paddingHorizontal: space[4], paddingVertical: space[2], borderWidth: 1, borderColor: c.goldSoft }}>
        <AppText variant="caption" color={role.accentText} style={{ fontFamily: fonts.bodyBold }}>New messages</AppText>
      </View>
      <View style={{ flex: 1, height: 1, backgroundColor: role.highlight, opacity: 0.55 }} />
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

// One line = 56 dp (the line of the body text, 28, with 12 above and below and the border), the same height as the round buttons: Send is the main action of the screen.
// It grows with the text up to about 4 lines (140 dp) and scrolls inside after that.
const INPUT_MIN = layout.touchMin;
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
      <View style={{ borderTopWidth: 1, borderTopColor: role.border, backgroundColor: role.bg, paddingHorizontal: layout.screenMargin, paddingTop: space[3], paddingBottom: bottom + 4, gap: space[3] }}>
        <AppText variant="small" muted style={{ textAlign: 'center' }}>You blocked {blockedName}. Unblock to send messages again.</AppText>
        <Btn label={`Unblock ${blockedName}`} variant="ghost" onPress={onUnblock} loading={unblocking} />
      </View>
    );
  }

  return (
    <View style={{ borderTopWidth: 1, borderTopColor: role.border, backgroundColor: role.bg, paddingHorizontal: layout.screenMargin, paddingTop: space[2], paddingBottom: bottom }}>
      {reply && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], marginBottom: space[2], marginHorizontal: space[1], backgroundColor: role.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: role.border, overflow: 'hidden' }}>
          <View style={{ width: 4, alignSelf: 'stretch', backgroundColor: role.highlight }} />
          <View style={{ flex: 1, paddingVertical: space[2] }}>
            <AppText variant="caption" numberOfLines={1} color={role.action} style={{ fontFamily: fonts.bodyBold }}>Replying to {reply.name}</AppText>
            <AppText variant="caption" muted numberOfLines={1}>{reply.text}</AppText>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel reply" onPress={onCancelReply} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="close" color={role.muted} size={24} />
          </Pressable>
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space[2] }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Add a photo" onPress={onPhoto} style={({ pressed }) => ({ width: INPUT_MIN, height: INPUT_MIN, borderRadius: radius.pill, backgroundColor: pressed ? role.sunken : role.surface, borderWidth: 1, borderColor: role.border, alignItems: 'center', justifyContent: 'center' })}>
          <Icon name="image" color={role.action} size={24} />
        </Pressable>
        <TextInput
          ref={input} value={text} onChangeText={setText}
          multiline maxLength={4000} placeholder="Write a message" placeholderTextColor={role.muted} accessibilityLabel="Message"
          onKeyPress={Platform.OS === 'web' ? (e) => {
            // Web only (handy for testing): Enter sends, Shift+Enter adds a line. Phones keep Enter = new line.
            const ev = e as unknown as { key?: string; shiftKey?: boolean; nativeEvent?: { key?: string; shiftKey?: boolean }; preventDefault?: () => void };
            if ((ev.nativeEvent?.key ?? ev.key) === 'Enter' && !(ev.nativeEvent?.shiftKey ?? ev.shiftKey)) { ev.preventDefault?.(); submit(); }
          } : undefined}
          style={[{ flex: 1, minHeight: INPUT_MIN, maxHeight: INPUT_MAX, borderRadius: radius.lg, backgroundColor: role.surface, borderWidth: 1, borderColor: role.border, paddingHorizontal: space[5], paddingVertical: space[3], ...textStyle('body'), color: role.text, textAlignVertical: 'center' }, noOutline]}
        />
        <Pressable
          accessibilityRole="button" accessibilityLabel="Send message" accessibilityState={{ disabled: !ready }} disabled={!ready} onPress={submit}
          style={({ pressed }) => ({ width: INPUT_MIN, height: INPUT_MIN, borderRadius: radius.pill, backgroundColor: ready ? role.highlight : role.sunken, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}
        >
          <Icon name="send" color={ready ? role.onHighlight : role.muted} size={24} strokeWidth={2} />
        </Pressable>
      </View>
    </View>
  );
}
