import { ReactNode, useCallback } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { useBlockedPilgrims, useNow } from '@/features/social';
import { useDialogs } from '@/features/social/components/dialogs';
import { Btn, ScreenHeader } from '@/features/social/components/primitives';
import { PersonRow } from '@/features/social/components/rows';
import { EmptyState, ErrorState, LoadingRows, Notice } from '@/features/social/components/states';
import { personName, shortDate, unblockMessage } from '@/features/social/logic';
import { goBack } from '@/features/social/nav';
import type { BlockedPilgrim } from '@/features/social/types';
import { layout, role, space } from '@/theme';

// Settings > Privacy and safety > Blocked pilgrims: who you blocked, and a way to undo it. The list comes from a
// database function that a server may not have yet; then this screen says so in one friendly sentence and nothing
// else in the app is affected (see hooks/blocked.ts).
export default function BlockedPilgrims() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const now = useNow();
  const { items, error, loading, refreshing, refresh, retry, busy, unblock: unblockPilgrim } = useBlockedPilgrims();
  const { confirm, toast, host } = useDialogs();

  const unblock = useCallback(async (p: BlockedPilgrim) => {
    const name = personName(p);
    if (!(await confirm({ title: `Unblock ${name}?`, message: unblockMessage(name), confirmLabel: 'Unblock', icon: 'block' }))) return;
    toast((await unblockPilgrim(p.user_id)) ?? `${name} is unblocked.`);
  }, [confirm, toast, unblockPilgrim]);

  // What to show when there is no row: could not load, loading, or a calm "nobody".
  let empty: ReactNode;
  if (error && !items) empty = <ErrorState text={error} onRetry={retry} />;
  else if (loading) empty = <LoadingRows count={3} />;
  else empty = <EmptyState icon="shield" title="No blocked pilgrims" text="You have not blocked anyone. If you block a pilgrim, they will show up here and you can unblock them any time." />;

  return (
    <View style={{ flex: 1, backgroundColor: role.bg }}>
      <View style={{ paddingTop: insets.top + layout.screenTop, paddingHorizontal: layout.screenMargin, paddingBottom: space[3] }}>
        <ScreenHeader title="Blocked pilgrims" variant="h3" onBack={() => goBack(router)} />
      </View>
      <FlatList
        data={items ?? []}
        keyExtractor={(p) => p.user_id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={role.action} colors={[role.action]} />}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40, flexGrow: 1 }}
        ListHeaderComponent={
          !!items && items.length > 0 ? (
            <View>
              {!!error && <Notice icon="info" tone="warn" text={error} />}
              <AppText variant="small" muted style={{ paddingHorizontal: space[6], paddingTop: space[1], paddingBottom: space[2] }}>
                Blocked pilgrims cannot find you in search, send you friend requests or message you directly. Unblocking someone does not make you friends again.
              </AppText>
            </View>
          ) : undefined
        }
        renderItem={({ item: p }) => {
          const name = personName(p);
          return (
            <PersonRow
              name={name} username={p.username} uri={p.avatar_url} seed={p.user_id}
              detail={p.blocked_at ? `Blocked ${shortDate(p.blocked_at, now)}` : null}
              trailing={<Btn label="Unblock" size="sm" variant="ghost" loading={busy.has(p.user_id)} onPress={() => unblock(p)} accessibilityLabel={`Unblock ${name}`} />}
            />
          );
        }}
        ListEmptyComponent={empty}
      />
      {host}
    </View>
  );
}
