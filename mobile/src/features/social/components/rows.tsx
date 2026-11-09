// List rows: a conversation, a person, a notification.
import { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon, IconName } from '@/components/Icon';
import { c, fonts, layout, radius, role, space } from '@/theme';
import { RequestState, conversationName, isMuted, notificationHeadline, notificationTime, personName, pilgrimsLabel, previewLine, smartTime } from '../logic';
import type { Conversation, NotificationItem } from '../types';
import { Btn, CountBadge, PilgrimAvatar } from './primitives';

/* ------------------------------------------------------------ conversations */

export function ConversationRow({ conversation: cv, meId, now, onPress }: { conversation: Conversation; meId: string; now: number; onPress: () => void }) {
  const group = cv.kind === 'group';
  const name = conversationName(cv);
  const preview = previewLine(cv, meId);
  const time = smartTime(cv.last_message_at, now);
  const unread = cv.unread_count;
  const muted = isMuted(cv, now);
  const label = [name, group ? pilgrimsLabel(cv.member_count) : null, unread > 0 ? `${unread} unread ${unread === 1 ? 'message' : 'messages'}` : null, muted ? 'muted' : null, preview, time || null].filter(Boolean).join('. ');
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Opens the chat" onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[4], paddingHorizontal: layout.screenMargin, paddingVertical: space[3], minHeight: 80, backgroundColor: pressed ? role.sunken : 'transparent' })}>
      <PilgrimAvatar name={name} uri={group ? cv.avatar_url : cv.peer_avatar_url} seed={cv.peer_id ?? cv.id} size={56} group={group} />
      <View style={{ flex: 1, gap: space[1] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <AppText variant="label" numberOfLines={1} style={{ flex: 1 }}>{name}</AppText>
          {!!time && <AppText variant="mono" color={unread > 0 && !muted ? role.text : role.muted}>{time}</AppText>}
        </View>
        {group && <AppText variant="caption" muted>{pilgrimsLabel(cv.member_count)}</AppText>}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <AppText variant="small" numberOfLines={1} color={unread > 0 && !muted ? role.text : role.muted} style={{ flex: 1, fontFamily: unread > 0 && !muted ? fonts.bodyBold : fonts.body }}>{preview}</AppText>
          {muted && <Icon name="mute" color={role.muted} size={18} />}
          <CountBadge count={unread} tone={muted ? 'sand' : 'blue'} />
        </View>
      </View>
    </Pressable>
  );
}

/* ------------------------------------------------------------ people */

type PersonProps = {
  name: string; username?: string | null; uri?: string | null; seed: string; detail?: string | null; trailing?: ReactNode;
  onPress?: () => void; accessibilityLabel?: string; hint?: string; size?: number; below?: ReactNode;
  selected?: boolean; // set = the row is a checkbox (pickers)
  inset?: number;     // horizontal padding (24 on a screen, 16 inside a card)
};

/** Avatar, name, @username and a slot on the right (button, check, menu). */
export function PersonRow({ name, username, uri, seed, detail, trailing, onPress, accessibilityLabel, hint, size = 52, below, selected, inset = 24 }: PersonProps) {
  const body = (
    <View style={{ paddingHorizontal: inset, paddingVertical: space[3], gap: space[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[4] }}>
        <PilgrimAvatar name={name} uri={uri} seed={seed} size={size} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant="label" numberOfLines={1}>{name}</AppText>
          {!!username && <AppText variant="caption" muted numberOfLines={1}>@{username}</AppText>}
          {!!detail && <AppText variant="caption" muted numberOfLines={1}>{detail}</AppText>}
        </View>
        {trailing}
      </View>
      {below}
    </View>
  );
  if (!onPress) return body;
  const picker = selected !== undefined;
  return (
    <Pressable
      accessibilityRole={picker ? 'checkbox' : 'button'} accessibilityState={picker ? { checked: selected } : undefined}
      accessibilityLabel={accessibilityLabel ?? name} accessibilityHint={hint} onPress={onPress}
      style={({ pressed }) => ({ backgroundColor: pressed ? role.sunken : selected ? c.goldWash : 'transparent' })}
    >
      {body}
    </Pressable>
  );
}

/* ------------------------------------------------------------ notifications */

// A function, not a constant: the colours follow the light/dark mode.
const kinds = (): Record<string, { icon: IconName; bg: string; fg: string }> => ({
  friend_request: { icon: 'user-plus', bg: role.action, fg: role.onAction },
  friend_accepted: { icon: 'check', bg: c.success, fg: c.white },
  group_added: { icon: 'group', bg: role.highlight, fg: role.onHighlight },
  post_like: { icon: 'heart', bg: role.danger, fg: role.onDanger },
  post_comment: { icon: 'chat', bg: role.action, fg: role.onAction },
  achievement: { icon: 'star', bg: role.highlight, fg: role.onHighlight },
  system: { icon: 'bell', bg: c.blue100, fg: role.action },
});

type NotificationRowProps = {
  n: NotificationItem; now: number; request: RequestState | null; busy: boolean;
  onPress: () => void; onAccept: () => void; onDecline: () => void; onMessage: () => void;
  onLongPress?: () => void; // hold the row: report or block the pilgrim behind it (and a comment, when it is about one)
};

export function NotificationRow({ n, now, request, busy, onPress, onAccept, onDecline, onMessage, onLongPress }: NotificationRowProps) {
  const all = kinds();
  const kind = all[n.kind] ?? all.system;
  const unread = !n.read_at;
  const { name, text, detail } = notificationHeadline(n);
  const when = notificationTime(n.created_at, now);
  const actor = n.actor;
  const label = [`${name}${text}`, detail, when, unread ? 'unread' : null].filter(Boolean).join('. ');
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={label} accessibilityHint={onLongPress ? 'Hold for more options' : undefined}
      accessibilityActions={onLongPress ? [{ name: 'more', label: 'Report or block' }] : undefined}
      onAccessibilityAction={onLongPress ? (e) => { if (e.nativeEvent.actionName === 'more') onLongPress(); } : undefined}
      onPress={onPress} onLongPress={onLongPress} delayLongPress={380}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'flex-start', gap: space[4], paddingHorizontal: layout.screenMargin, paddingVertical: space[4], backgroundColor: pressed ? role.sunken : unread ? c.goldWash : 'transparent' })}
    >
      <View style={{ width: 52, height: 52 }}>
        {actor
          ? <PilgrimAvatar name={personName(actor)} uri={actor.avatar_url} seed={actor.id} size={52} />
          : <View style={{ width: 52, height: 52, borderRadius: radius.pill, backgroundColor: kind.bg, alignItems: 'center', justifyContent: 'center' }}><Icon name={kind.icon} color={kind.fg} size={28} /></View>}
        {actor && (
          <View style={{ position: 'absolute', right: -6, bottom: -5, width: 26, height: 26, borderRadius: radius.pill, backgroundColor: kind.bg, borderWidth: 2, borderColor: unread ? c.goldWash : role.bg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={kind.icon} color={kind.fg} size={18} strokeWidth={2.2} />
          </View>
        )}
      </View>
      <View style={{ flex: 1, gap: space[1], minWidth: 0 }}>
        <AppText variant="small">
          <AppText variant="label">{name}</AppText>
          {text}
        </AppText>
        {!!detail && <AppText variant="small" muted numberOfLines={2}>{detail}</AppText>}
        <AppText variant="mono" muted>{when}</AppText>
        {n.kind === 'friend_request' && request === 'pending' && (
          <View style={{ flexDirection: 'row', gap: space[3], marginTop: space[2] }}>
            <Btn label="Accept" size="sm" onPress={onAccept} loading={busy} hint={`Accept ${personName(actor, 'this pilgrim')} as a friend`} accessibilityLabel={`Accept ${personName(actor, 'this pilgrim')}`} />
            <Btn label="Decline" size="sm" variant="ghost" onPress={onDecline} disabled={busy} accessibilityLabel={`Decline ${personName(actor, 'this pilgrim')}`} />
          </View>
        )}
        {n.kind === 'friend_request' && request === 'friends' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], marginTop: space[2], flexWrap: 'wrap' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
              <Icon name="check" color={c.success} size={20} strokeWidth={2.4} />
              <AppText variant="label" color={c.success}>You are now friends</AppText>
            </View>
            <Btn label="Message" size="sm" variant="soft" icon="chat" onPress={onMessage} accessibilityLabel={`Message ${personName(actor, 'your new friend')}`} />
          </View>
        )}
        {n.kind === 'friend_request' && request === 'declined' && <AppText variant="small" muted style={{ marginTop: space[1] }}>Request declined</AppText>}
        {n.kind === 'friend_request' && request === 'gone' && <AppText variant="small" muted style={{ marginTop: space[1] }}>This request is no longer open</AppText>}
      </View>
      {unread && <View accessibilityElementsHidden style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: role.action, marginTop: space[2] }} />}
    </Pressable>
  );
}
