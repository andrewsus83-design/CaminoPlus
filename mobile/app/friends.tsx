import { ReactElement, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, SectionList, Share, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Card } from '@/components/ui';
import { socialApi, useFriendsData, useNow, usePilgrimSearch, useUnreadTotals } from '@/features/social';
import { useDialogs } from '@/features/social/components/dialogs';
import { Btn, RoundBtn, ScreenHeader, SearchField, SegmentedTabs } from '@/features/social/components/primitives';
import { PersonRow } from '@/features/social/components/rows';
import { EmptyState, ErrorState, LoadingRows, Notice, Section } from '@/features/social/components/states';
import { friendAction, friendlyError, notificationTime, personName } from '@/features/social/logic';
import { goBack } from '@/features/social/nav';
import type { Friend, FriendRequest, PilgrimResult } from '@/features/social/types';
import { useAuth } from '@/lib/auth';
import { c, layout, role } from '@/theme';

type FriendsTab = 'friends' | 'requests' | 'find';
const parseTab = (v: unknown): FriendsTab => (v === 'requests' || v === 'find' ? v : 'friends');

type Row = { kind: 'friend'; friend: Friend } | { kind: 'incoming'; request: FriendRequest } | { kind: 'outgoing'; request: FriendRequest } | { kind: 'found'; person: PilgrimResult };
type Sec = { key: string; title: string | null; data: Row[] };

export default function FriendsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { profile } = useAuth();
  const now = useNow();
  const totals = useUnreadTotals();
  const data = useFriendsData();
  const { confirm, menu, toast, host } = useDialogs();
  const [tab, setTab] = useState<FriendsTab>(parseTab(params.tab));
  useEffect(() => { setTab(parseTab(params.tab)); }, [params.tab]);
  const [query, setQuery] = useState('');
  const search = usePilgrimSearch(query);
  const [opening, setOpening] = useState<string | null>(null);

  const invite = useCallback(() => {
    Share.share({ message: `Walk the Camino with me on CaminoPlus: https://camino.plus${profile?.username ? `/${profile.username}` : ''}` }).catch(() => {});
  }, [profile?.username]);

  const openChat = useCallback(async (userId: string) => {
    if (opening) return;
    setOpening(userId);
    try {
      router.push(`/chat/${await socialApi.startDirectChat(userId)}`);
    } catch (e) {
      toast(friendlyError(e, 'Could not open this chat.'));
    } finally {
      setOpening(null);
    }
  }, [opening, router, toast]);

  const say = async (job: Promise<string | null>, ok: string) => { const err = await job; toast(err ?? ok); };

  const friendMenu = async (f: Friend) => {
    const name = personName(f);
    const choice = await menu({
      title: name,
      options: [
        { key: 'unfriend', label: `Unfriend ${name}`, icon: 'close', destructive: true },
        { key: 'block', label: `Block ${name}`, icon: 'block', destructive: true },
      ],
    });
    if (choice === 'unfriend') {
      const ok = await confirm({ title: `Unfriend ${name}?`, message: 'You will stop seeing each other\'s friends-only posts and cannot chat until you are friends again.', confirmLabel: 'Unfriend', destructive: true, icon: 'close' });
      if (ok) await say(data.unfriend(f.id), `${name} is no longer your friend.`);
    } else if (choice === 'block') {
      const ok = await confirm({ title: `Block ${name}?`, message: `${name} will not be able to message you or find you in search, and you will stop being friends. You can unblock them any time.`, confirmLabel: 'Block', destructive: true, icon: 'block' });
      if (ok) {
        try { await socialApi.block(f.id); await data.reload(); toast(`${name} is blocked.`); } catch (e) { toast(friendlyError(e, 'Could not block this pilgrim.')); }
      }
    }
  };

  const sections: Sec[] = useMemo(() => {
    if (tab === 'friends') return (data.friends ?? []).length ? [{ key: 'friends', title: null, data: (data.friends ?? []).map((friend) => ({ kind: 'friend' as const, friend })) }] : [];
    if (tab === 'requests') {
      return [
        { key: 'in', title: 'Received', data: data.incoming.map((request) => ({ kind: 'incoming' as const, request })) },
        { key: 'out', title: 'Sent', data: data.outgoing.map((request) => ({ kind: 'outgoing' as const, request })) },
      ].filter((s) => s.data.length > 0);
    }
    return (search.results ?? []).length ? [{ key: 'found', title: null, data: (search.results ?? []).map((person) => ({ kind: 'found' as const, person })) }] : [];
  }, [tab, data.friends, data.incoming, data.outgoing, search.results]);

  const renderRow = ({ item }: { item: Row }): ReactElement => {
    if (item.kind === 'friend') {
      const f = item.friend;
      const name = personName(f);
      return (
        <PersonRow
          name={name} username={f.username} uri={f.avatar_url} seed={f.id} detail={`${Math.round(Number(f.km_walked ?? 0))} km walked`}
          accessibilityLabel={`${name}${f.username ? `, @${f.username}` : ''}. Open chat`} onPress={() => openChat(f.id)}
          trailing={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <RoundBtn icon="chat" label={`Message ${name}`} onPress={() => openChat(f.id)} loading={opening === f.id} />
              <Pressable accessibilityRole="button" accessibilityLabel={`More options for ${name}`} onPress={() => friendMenu(f)} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="more" color={role.muted} size={24} />
              </Pressable>
            </View>
          }
        />
      );
    }
    if (item.kind === 'incoming') {
      const r = item.request;
      const name = personName(r);
      const busy = data.busy.has(r.id);
      return (
        <PersonRow
          name={name} username={r.username} uri={r.avatar_url} seed={r.id} detail={notificationTime(r.requested_at, now)}
          below={
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Btn label="Accept" full loading={busy} onPress={() => say(data.accept(r.id), `You and ${name} are now friends.`)} accessibilityLabel={`Accept ${name}'s friend request`} /></View>
              <View style={{ flex: 1 }}><Btn label="Decline" variant="ghost" full disabled={busy} onPress={() => say(data.decline(r.id), 'Request declined.')} accessibilityLabel={`Decline ${name}'s friend request`} /></View>
            </View>
          }
        />
      );
    }
    if (item.kind === 'outgoing') {
      const r = item.request;
      const name = personName(r);
      return (
        <PersonRow
          name={name} username={r.username} uri={r.avatar_url} seed={r.id} detail={`Sent ${notificationTime(r.requested_at, now).replace(/^Just now$/, 'just now')}`}
          trailing={<Btn label="Cancel" size="sm" variant="ghost" loading={data.busy.has(r.id)} onPress={() => say(data.cancel(r.id), 'Request cancelled.')} accessibilityLabel={`Cancel your request to ${name}`} />}
        />
      );
    }
    const p = item.person;
    const name = personName(p);
    const act = friendAction(p.friend_status);
    const busy = search.busy.has(p.id);
    const press = () => {
      if (act.kind === 'message') return void openChat(p.id);
      return say(search.act(p, act.kind), act.kind === 'add' ? `Request sent to ${name}.` : act.kind === 'cancel' ? 'Request cancelled.' : `You and ${name} are now friends.`);
    };
    const label = { add: `Add ${name} as a friend`, cancel: `Cancel your request to ${name}`, accept: `Accept ${name}'s friend request`, message: `Message ${name}` }[act.kind];
    return (
      <PersonRow
        name={name} username={p.username} uri={p.avatar_url} seed={p.id} accessibilityLabel={`${name}${p.username ? `, @${p.username}` : ''}`}
        trailing={<Btn label={act.label} size="sm" icon={act.kind === 'add' ? 'user-plus' : undefined} variant={act.kind === 'add' ? 'primary' : act.kind === 'accept' ? 'gold' : act.kind === 'message' ? 'soft' : 'ghost'} loading={busy || opening === p.id} onPress={press} accessibilityLabel={label} hint={act.kind === 'cancel' ? 'Tap to cancel the request' : undefined} />}
      />
    );
  };

  // What to show when the current tab has no rows: loading, an error, or a warm invitation.
  let empty: ReactNode = null;
  if (tab === 'find') {
    if (!search.searchable) empty = <EmptyState icon="search" title="Find your Camino family" text="Search by name or @username. Type at least 2 letters." />;
    else if (search.error) empty = <ErrorState text={search.error} onRetry={search.retry} title="Search did not work" />;
    else if (search.loading || search.results === null) empty = <LoadingRows count={3} />;
    else empty = <EmptyState icon="search" title="No pilgrims found" text="Check the spelling, or invite them with the link above." action={{ label: 'Invite friends', icon: 'share', onPress: invite }} />;
  } else if (data.loading) {
    empty = <LoadingRows count={4} />;
  } else if (data.error && !data.friends) {
    empty = <ErrorState text={data.error} onRetry={data.retry} />;
  } else if (tab === 'friends') {
    empty = <EmptyState icon="group" title="Walk together" text="Your friends will appear here once they accept your request." action={{ label: 'Find pilgrims', icon: 'search', onPress: () => setTab('find') }} />;
  } else {
    empty = <EmptyState icon="user-plus" title="No requests right now" text="When a pilgrim asks to be your friend, you will see it here. Requests you send show up here too." action={{ label: 'Find pilgrims', icon: 'search', onPress: () => setTab('find') }} />;
  }

  const tabs = useMemo(() => [
    { key: 'friends' as const, label: 'Friends' },
    { key: 'requests' as const, label: 'Requests', badge: data.incoming.length || totals.friendRequests },
    { key: 'find' as const, label: 'Find' },
  ], [data.incoming.length, totals.friendRequests]);

  const count = data.friends?.length ?? 0;
  return (
    <View style={{ flex: 1, backgroundColor: role.bg }}>
      <View style={{ paddingTop: insets.top + layout.screenTop, paddingHorizontal: layout.screenMargin, paddingBottom: 12 }}>
        <ScreenHeader title="Friends" onBack={() => goBack(router)} />
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(r) => (r.kind === 'friend' ? r.friend.id : r.kind === 'found' ? r.person.id : `${r.kind}-${r.request.id}`)}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        refreshControl={tab === 'find' ? undefined : <RefreshControl refreshing={data.refreshing} onRefresh={data.refresh} tintColor={c.blue} colors={[c.blue]} />}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40, flexGrow: 1 }}
        ListHeaderComponent={
          <View style={{ gap: 16, paddingTop: 4 }}>
            <View style={{ paddingHorizontal: layout.screenMargin }}>
              <Card style={{ gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <AppText variant="h4">Camino friends</AppText>
                  <AppText variant="small" muted>{count} {count === 1 ? 'friend' : 'friends'}</AppText>
                </View>
                <AppText variant="small" muted>Walk together: chat, make group plans and share the way with people you trust.</AppText>
                <Btn label="Invite friends" icon="share" variant="gold" onPress={invite} />
              </Card>
            </View>
            <View style={{ paddingHorizontal: 12 }}><SegmentedTabs tabs={tabs} value={tab} onChange={(k) => { setTab(k); router.setParams({ tab: k }); }} /></View>
            {data.error && !!data.friends && tab !== 'find' && <Notice icon="info" tone="warn" text="Could not refresh. Pull down to try again." />}
            {tab === 'find' && <View style={{ paddingHorizontal: layout.screenMargin }}><SearchField value={query} onChangeText={setQuery} placeholder="Search by name or @username" label="Search pilgrims" /></View>}
          </View>
        }
        renderSectionHeader={({ section }) => (section.title ? <Section>{section.title}</Section> : null)}
        renderItem={renderRow}
        ListEmptyComponent={empty}
      />
      {host}
    </View>
  );
}
