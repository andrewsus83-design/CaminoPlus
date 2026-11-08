import { View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Btn, PilgrimAvatar } from '@/features/social/components/primitives';
import type { FriendStatus } from '@/features/social/types';
import { fonts, space } from '@/theme';
import { type Pilgrim, friendCta, pilgrimHandle, pilgrimName, pilgrimStats } from './logic';
import type { FriendActionKind } from './usePilgrim';

// The card at the top of another pilgrim's profile: picture and numbers, then the name, @username and what they wrote about themselves.
// A minimal card (a private profile, and you are not their friend) has the picture and the name and nothing else.
export function PilgrimHeader({ pilgrim, minimal }: { pilgrim: Pilgrim; minimal: boolean }) {
  const name = pilgrimName(pilgrim);
  const handle = pilgrimHandle(pilgrim);
  return (
    <View style={{ gap: space[4] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[5] }}>
        <PilgrimAvatar name={name} uri={pilgrim.avatar_url} seed={pilgrim.id} size={92} ring />
        {!minimal && (
          <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-around' }}>
            {pilgrimStats(pilgrim).map((s) => (
              <View key={s.label} accessible accessibilityLabel={`${s.value} ${s.label}`} style={{ alignItems: 'center' }}>
                <AppText variant="h3">{s.value}</AppText>
                <AppText variant="small" muted>{s.label}</AppText>
              </View>
            ))}
          </View>
        )}
      </View>
      <View style={{ gap: space[1] }}>
        <AppText variant="body" numberOfLines={2} style={{ fontFamily: fonts.bodyBold }}>{name}</AppText>
        {!!handle && <AppText variant="small" muted numberOfLines={1}>{handle}</AppText>}
        {!minimal && !!pilgrim.bio && <AppText variant="small">{pilgrim.bio}</AppText>}
      </View>
    </View>
  );
}

/** The one button under the card: Message for a friend, Add friend, Requested (tap to take the request back), or Accept and Decline for a request they sent. */
export function FriendBar({ relation, name, busy, messaging, onAct, onMessage }: {
  relation: FriendStatus; name: string; busy: boolean; messaging: boolean; onAct: (kind: FriendActionKind) => void; onMessage: () => void;
}) {
  const cta = friendCta(relation);
  if (cta.kind === 'message') return <Btn label={cta.label} icon="chat" full loading={messaging} onPress={onMessage} accessibilityLabel={`Message ${name}`} />;
  if (cta.kind === 'accept') {
    return (
      <View style={{ flexDirection: 'row', gap: space[3] }}>
        <View style={{ flex: 1 }}><Btn label={cta.label} full loading={busy} onPress={() => onAct('accept')} accessibilityLabel={`Accept ${name}'s friend request`} /></View>
        <View style={{ flex: 1 }}><Btn label="Decline" variant="ghost" full disabled={busy} onPress={() => onAct('decline')} accessibilityLabel={`Decline ${name}'s friend request`} /></View>
      </View>
    );
  }
  if (cta.kind === 'cancel') return <Btn label={cta.label} variant="ghost" full loading={busy} onPress={() => onAct('cancel')} accessibilityLabel={`Cancel your request to ${name}`} hint="Tap to cancel the request" />;
  return <Btn label={cta.label} icon="user-plus" full loading={busy} onPress={() => onAct('add')} accessibilityLabel={`Add ${name} as a friend`} />;
}
