import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { socialApi, useFriendList } from '@/features/social';
import { useDialogs } from '@/features/social/components/dialogs';
import { ScreenHeader, SearchField } from '@/features/social/components/primitives';
import { PersonRow } from '@/features/social/components/rows';
import { EmptyState, ErrorState, LoadingRows } from '@/features/social/components/states';
import { filterPeople, friendlyError, personName } from '@/features/social/logic';
import { goBack } from '@/features/social/nav';
import type { Friend } from '@/features/social/types';
import { layout, radius, role, space } from '@/theme';

// Pick a friend, open (or find) the chat with them, and replace this screen with it.
export default function NewChat() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { friends, error, loading, retry } = useFriendList();
  const { toast, host } = useDialogs();
  const [query, setQuery] = useState('');
  const [starting, setStarting] = useState<string | null>(null);
  const shown = useMemo(() => filterPeople(friends ?? [], query), [friends, query]);

  const start = async (f: Friend) => {
    if (starting) return;
    setStarting(f.id);
    try {
      router.replace(`/chat/${await socialApi.startDirectChat(f.id)}`);
    } catch (e) {
      toast(friendlyError(e, 'Could not start this chat.'));
      setStarting(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: role.bg }}>
      <View style={{ paddingTop: insets.top + layout.screenTop, paddingHorizontal: layout.screenMargin, paddingBottom: space[3] }}>
        <ScreenHeader title="New chat" onBack={() => goBack(router)} />
      </View>
      {loading && <LoadingRows />}
      {!!error && !friends && <ErrorState text={error} onRetry={retry} />}
      {!!friends && (
        <FlatList
          data={shown}
          keyExtractor={(f) => f.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 32, flexGrow: 1 }}
          ListHeaderComponent={
            <View>
              <Pressable
                accessibilityRole="button" accessibilityLabel="New group" accessibilityHint="Chat with several friends at once" onPress={() => router.push('/chat/new-group')}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[4], paddingHorizontal: layout.screenMargin, minHeight: 76, backgroundColor: pressed ? role.sunken : 'transparent' })}
              >
                <View style={{ width: 52, height: 52, borderRadius: radius.pill, backgroundColor: role.highlight, alignItems: 'center', justifyContent: 'center' }}><Icon name="group" color={role.onHighlight} size={28} /></View>
                <View style={{ flex: 1 }}>
                  <AppText variant="label">New group</AppText>
                  <AppText variant="caption" muted>Chat with several friends at once</AppText>
                </View>
                <Icon name="chevron" color={role.muted} size={24} />
              </Pressable>
              {friends.length > 0 && <View style={{ paddingHorizontal: layout.screenMargin, paddingVertical: space[3] }}><SearchField value={query} onChangeText={setQuery} placeholder="Search your friends" label="Search your friends" /></View>}
              {friends.length > 0 && <AppText variant="mono" muted style={{ textTransform: 'uppercase', paddingHorizontal: layout.screenMargin, paddingTop: space[3], paddingBottom: space[1] }} accessibilityRole="header">Friends</AppText>}
            </View>
          }
          renderItem={({ item: f }) => (
            <PersonRow
              name={personName(f)} username={f.username} uri={f.avatar_url} seed={f.id} onPress={() => start(f)}
              accessibilityLabel={`Chat with ${personName(f)}`}
              trailing={starting === f.id ? <ActivityIndicator color={role.action} /> : <Icon name="chat" color={role.action} size={24} />}
            />
          )}
          ListEmptyComponent={
            friends.length === 0
              ? <EmptyState icon="group" title="Walk together" text="Your friends will appear here once they accept. Add a pilgrim to start chatting." action={{ label: 'Find pilgrims', icon: 'search', onPress: () => router.replace({ pathname: '/friends', params: { tab: 'find' } }) }} />
              : <EmptyState icon="search" title="No friend found" text={`Nobody matches "${query.trim()}". Try a different name.`} />
          }
        />
      )}
      {host}
    </View>
  );
}
