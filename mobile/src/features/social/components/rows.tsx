// List rows: a conversation, a person, a notification.
import { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon, IconName } from '@/components/Icon';
import { c, fonts, radius, role, layout } from '@/theme';
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
  const empty = !cv.last_message_id && !cv.last_message_preview;
  const label = [name, group ? pilgrimsLabel(cv.member_count) : null, unread > 0 ? `${unread} unread ${unread === 1 ? 'message' : 'messages'}` : null, muted ? 'muted' : null, preview, time || null].filter(Boolean).join('. ');
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Opens the chat" onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: layout.screenMargin, paddingVertical: 12, minHeight: 80, backgroundColor: pressed ? c.sand200 : 'transparent' })}>
      <PilgrimAvatar name={name} uri={group ? cv.avatar_url : cv.peer_avatar_url} seed={cv.peer_id ?? cv.id} size={56} group={group} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <AppText variant="label" numberOfLines={1} style={{ flex: 1, fontSize: 18, lineHeight: 24 }}>{name}</AppText>
          {!!time && <AppText variant="mono" color={unread > 0 && !muted ? role.text : role.muted} style={{ fontSize: 13, lineHeight: 17 }}>{time}</AppText>}
        </View>
        {group && <AppText variant="caption" muted style={{ letterSpacing: 0, fontSize: 14, lineHeight: 18 }}>{pilgrimsLabel(cv.member_count)}</AppText>}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <AppText variant="small" numberOfLines={1} color={unread > 0 && !muted ? role.text : role.muted} style={{ flex: 1, fontSize: 16, lineHeight: 21, fontFamily: unread > 0 && !muted ? fonts.bodyBold : fonts.body, fontStyle: empty ? 'italic' : 'normal' }}>{preview}</AppText>
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
    <View style={{ paddingHorizontal: inset, paddingVertical: 12, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <PilgrimAvatar name={name} uri={uri} seed={seed} size={size} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant="label" numberOfLines={1} style={{ fontSize: 18, lineHeight: 24 }}>{name}</AppText>
          {!!username && <AppText variant="caption" muted numberOfLines={1} style={{ letterSpacing: 0 }}>@{username}</AppText>}
          {!!detail && <AppText variant="caption" muted numberOfLines={1} style={{ letterSpacing: 0 }}>{detail}</AppText>}
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
      style={({ pressed }) => ({ backgroundColor: pressed ? c.sand200 : selected ? c.goldWash : 'transparent' })}
    >
      {body}
    </Pressable>
  );
}

/* ------------------------------------------------------------ notifications */

const KINDS: Record<string, { icon: IconName; bg: string; fg: string }> = {
  friend_request: { icon: 'user-plus', bg: c.blue, fg: c.parchment },
  friend_accepted: { icon: 'check', bg: c.success, fg: c.white },
  group_added: { icon: 'group', bg: c.gold, fg: c.blue },
  post_like: { icon: 'heart', bg: c.red, fg: c.white },
  post_comment: { icon: 'chat', bg: c.blue, fg: c.parchment },
  achievement: { icon: 'star', bg: c.gold, fg: c.blue },
  system: { icon: 'bell', bg: c.blue100, fg: c.blue },
};

type NotificationRowProps = {
  n: NotificationItem; now: number; request: RequestState | null; busy: boolean;
  onPress: () => void; onAccept: () => void; onDecline: () => void; onMessage: () => void;
};

export function NotificationRow({ n, now, request, busy, onPress, onAccept, onDecline, onMessage }: NotificationRowProps) {
  const kind = KINDS[n.kind] ?? KINDS.system;
  const unread = !n.read_at;
  const { name, text, detail } = notificationHeadline(n);
  const when = notificationTime(n.created_at, now);
  const actor = n.actor;
  const label = [`${name}${text}`, detail, when, unread ? 'unread' : null].filter(Boolean).join('. ');
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingHorizontal: layout.screenMargin, paddingVertical: 14, backgroundColor: pressed ? c.sand200 : unread ? c.goldWash : 'transparent' })}>
      <View style={{ width: 52, height: 52 }}>
        {actor
          ? <PilgrimAvatar name={personName(actor)} uri={actor.avatar_url} seed={actor.id} size={52} />
          : <View style={{ width: 52, height: 52, borderRadius: radius.pill, backgroundColor: kind.bg, alignItems: 'center', justifyContent: 'center' }}><Icon name={kind.icon} color={kind.fg} size={26} /></View>}
        {actor && (
          <View style={{ position: 'absolute', right: -6, bottom: -5, width: 26, height: 26, borderRadius: radius.pill, backgroundColor: kind.bg, borderWidth: 2, borderColor: unread ? c.goldWash : role.bg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={kind.icon} color={kind.fg} size={13} strokeWidth={2.6} />
          </View>
        )}
      </View>
      <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
        <AppText variant="small" style={{ lineHeight: 23 }}>
          <AppText variant="label" style={{ lineHeight: 23 }}>{name}</AppText>
          {text}
        </AppText>
        {!!detail && <AppText variant="small" muted numberOfLines={2} style={{ lineHeight: 22 }}>{detail}</AppText>}
        <AppText variant="mono" muted style={{ fontSize: 12, lineHeight: 16 }}>{when}</AppText>
        {n.kind === 'friend_request' && request === 'pending' && (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
            <Btn label="Accept" size="sm" onPress={onAccept} loading={busy} hint={`Accept ${personName(actor, 'this pilgrim')} as a friend`} accessibilityLabel={`Accept ${personName(actor, 'this pilgrim')}`} />
            <Btn label="Decline" size="sm" variant="ghost" onPress={onDecline} disabled={busy} accessibilityLabel={`Decline ${personName(actor, 'this pilgrim')}`} />
          </View>
        )}
        {n.kind === 'friend_request' && request === 'friends' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="check" color={c.success} size={20} strokeWidth={2.4} />
              <AppText variant="label" color={c.success}>You are now friends</AppText>
            </View>
            <Btn label="Message" size="sm" variant="soft" icon="chat" onPress={onMessage} accessibilityLabel={`Message ${personName(actor, 'your new friend')}`} />
          </View>
        )}
        {n.kind === 'friend_request' && request === 'declined' && <AppText variant="small" muted style={{ marginTop: 4 }}>Request declined</AppText>}
        {n.kind === 'friend_request' && request === 'gone' && <AppText variant="small" muted style={{ marginTop: 4 }}>This request is no longer open</AppText>}
      </View>
      {unread && <View accessibilityElementsHidden style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.blue, marginTop: 8 }} />}
    </Pressable>
  );
}
