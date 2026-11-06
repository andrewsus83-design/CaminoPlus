import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, Share, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Pill } from '@/components/Pill';
import { Avatar, Card, IconButton } from '@/components/ui';
import { Empty } from '@/features/me/shared';
import { useAuth } from '@/lib/auth';
import { Friend, listFriends } from '@/lib/api';
import { layout, radius, role } from '@/theme';

/** People you follow, under the Camino friends card. */
function FriendList() {
  const { session } = useAuth();
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (!session) return;
    listFriends(session.user.id).then(setFriends).catch(() => { setErr(true); setFriends([]); });
  }, [session]);
  if (!friends) return <ActivityIndicator color={role.action} style={{ marginTop: 12 }} />;
  if (friends.length === 0) return <Empty text={err ? 'Could not load your friends. Pull to retry later.' : 'No friends yet. Invite someone to walk with you.'} />;
  return (
    <View style={{ gap: 10 }}>
      {friends.map((f) => (
        <Card key={f.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 }}>
          {f.avatar_url ? <Image source={{ uri: f.avatar_url }} style={{ width: 56, height: 56, borderRadius: radius.pill }} /> : <Avatar size={56} />}
          <View style={{ flex: 1 }}>
            <AppText variant="label" numberOfLines={1}>{f.display_name || f.username || 'Pilgrim'}</AppText>
            <AppText variant="caption" muted>{f.username ? `@${f.username} · ` : ''}{Math.round(Number(f.km_walked ?? 0))} km walked</AppText>
          </View>
        </Card>
      ))}
    </View>
  );
}

export default function FriendsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  return (
    <View style={{ flex: 1, backgroundColor: role.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + layout.screenTop, paddingHorizontal: layout.screenMargin, paddingBottom: insets.bottom + 40, gap: 16 }}>
        <IconButton name="back" label="Back" onPress={() => router.back()} />
        <AppText variant="h2">Friends</AppText>
        <Card style={{ gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <AppText variant="h4">Camino friends</AppText>
            <AppText variant="small" muted>{profile?.followers_count ?? 0} friends</AppText>
          </View>
          <AppText variant="small" muted>Walk together, share stamps and see where your friends are on the way.</AppText>
          <Pill variant="gold" label="Invite friends" onPress={() => Share.share({ message: `Walk the Camino with me on CaminoPlus: https://camino.plus${profile?.username ? `/${profile.username}` : ''}` }).catch(() => {})} />
        </Card>
        <FriendList />
      </ScrollView>
    </View>
  );
}
