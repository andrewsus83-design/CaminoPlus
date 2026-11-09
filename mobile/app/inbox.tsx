import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, SectionList, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { IconButton } from '@/components/ui';
import {
  socialApi, useConversations, useHasFriends, useMeId, useNotifications, useNow, useOnlineStatus, useSafety, useUnreadTotals,
} from '@/features/social';
import { useDialogs } from '@/features/social/components/dialogs';
import { Btn, CountBadge, ScreenHeader, SearchField, SegmentedTabs } from '@/features/social/components/primitives';
import { ConversationRow, NotificationRow } from '@/features/social/components/rows';
import { EmptyState, ErrorState, LoadingRows, Notice, Section } from '@/features/social/components/states';
import { filterConversations, friendlyError, notificationAction, notificationPeer, personName } from '@/features/social/logic';
import { goBack } from '@/features/social/nav';
import type { Conversation, NotificationItem } from '@/features/social/types';
import { c, layout, radius, role, space } from '@/theme';

type InboxTab = 'notifications' | 'messages' | 'groups';
const parseTab = (v: unknown): InboxTab => (v === 'messages' || v === 'groups' ? v : 'notifications');

export default function Inbox() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<InboxTab>(parseTab(params.tab));
  useEffect(() => { setTab(parseTab(params.tab)); }, [params.tab]);

  const meId = useMeId();
  const totals = useUnreadTotals();
  const online = useOnlineStatus();
  const now = useNow();
  const convs = useConversations();
  const notifs = useNotifications();
  const dialogs = useDialogs();
  const { menu, toast, host } = dialogs;
  const safety = useSafety(dialogs);
  const { refresh: refreshNotifications } = notifs;
  const [opening, setOpening] = useState(false);

  const openChatWith = useCallback(async (userId: string) => {
    if (opening) return;
    setOpening(true);
    try {
      router.push(`/chat/${await socialApi.startDirectChat(userId)}`);
    } catch (e) {
      toast(friendlyError(e, 'Could not open this chat.'));
    } finally {
      setOpening(false);
    }
  }, [opening, router, toast]);

  const openNotification = useCallback((n: NotificationItem) => {
    void notifs.markRead([n.id]);
    const go = notificationAction(n);
    if (go.to === 'requests') router.push({ pathname: '/friends', params: { tab: 'requests' } });
    else if (go.to === 'chat-with') void openChatWith(go.userId);
    else if (go.to === 'conversation') router.push(`/chat/${go.id}`);
    else if (go.to === 'me') router.navigate('/(tabs)/me');
  }, [notifs, router, openChatWith]);

  // Hold a notification: report or block the pilgrim behind it, and report the comment when it is about one.
  const notificationMenu = useCallback(async (n: NotificationItem) => {
    const actor = n.actor;
    if (!actor) return;
    const who = { id: actor.id, name: personName(actor) };
    const commentId = n.kind === 'post_comment' && typeof n.data?.comment_id === 'string' ? n.data.comment_id : null;
    const choice = await menu({
      title: who.name,
      options: [
        ...(commentId ? [{ key: 'comment', label: 'Report this comment', icon: 'flag' as const, destructive: true }] : []),
        { key: 'report', label: `Report ${who.name}`, icon: 'flag' as const, destructive: true },
        { key: 'block', label: `Block ${who.name}`, icon: 'block' as const, destructive: true },
      ],
    });
    if (choice === 'comment' && commentId) await safety.report({ type: 'comment', targetId: commentId, title: 'Report this comment' });
    else if (choice === 'report') await safety.reportPerson(who);
    else if (choice === 'block' && (await safety.block(who))) void refreshNotifications();
  }, [menu, safety, refreshNotifications]);

  const answer = useCallback(async (n: NotificationItem, accept: boolean) => {
    const err = await notifs.answer(n, accept);
    toast(err ?? (accept ? `You and ${personName(n.actor, 'your new friend')} are now friends.` : 'Request declined.'));
  }, [notifs, toast]);

  const tabs = useMemo(() => [
    { key: 'notifications' as const, label: 'Notifications', badge: totals.notifications },
    { key: 'messages' as const, label: 'Messages', badge: totals.chats },
    { key: 'groups' as const, label: 'Groups', badge: totals.groups },
  ], [totals.notifications, totals.chats, totals.groups]);

  const bottom = insets.bottom + 32;
  return (
    <View style={{ flex: 1, backgroundColor: role.bg }}>
      <View style={{ paddingTop: insets.top + layout.screenTop, paddingHorizontal: layout.screenMargin, paddingBottom: space[3] }}>
        <ScreenHeader title="Inbox" onBack={() => goBack(router)} right={<IconButton name="compose" label="New chat" onPress={() => router.push('/chat/new')} />} />
      </View>
      <View style={{ paddingHorizontal: layout.screenMargin }}><SegmentedTabs tabs={tabs} value={tab} onChange={(k) => { setTab(k); router.setParams({ tab: k }); }} /></View>
      {!online && <Notice icon="wifi-off" text="You are offline. Showing what was loaded last." />}

      {tab === 'notifications' && (
        <NotificationsTab
          notifs={notifs} now={now} bottom={bottom} onOpen={openNotification} onMore={notificationMenu}
          onAccept={(n) => answer(n, true)} onDecline={(n) => answer(n, false)}
          onMessage={(n) => { const peer = notificationPeer(n); if (peer) void openChatWith(peer); }}
        />
      )}
      {tab === 'messages' && (
        <MessagesTab
          list={convs.direct} convs={convs} meId={meId} now={now} bottom={bottom} requests={totals.friendRequests}
          onOpen={(cv) => router.push(`/chat/${cv.id}`)}
          onRequests={() => router.push({ pathname: '/friends', params: { tab: 'requests' } })}
          onFind={() => router.push({ pathname: '/friends', params: { tab: 'find' } })}
          onNew={() => router.push('/chat/new')}
        />
      )}
      {tab === 'groups' && (
        <GroupsTab list={convs.groups} convs={convs} meId={meId} now={now} bottom={bottom} onOpen={(cv) => router.push(`/chat/${cv.id}`)} onNew={() => router.push('/chat/new-group')} />
      )}
      {host}
    </View>
  );
}

/* ------------------------------------------------------------ Notifications */

function NotificationsTab({ notifs, now, bottom, onOpen, onMore, onAccept, onDecline, onMessage }: {
  notifs: ReturnType<typeof useNotifications>; now: number; bottom: number;
  onOpen: (n: NotificationItem) => void; onMore: (n: NotificationItem) => void; onAccept: (n: NotificationItem) => void; onDecline: (n: NotificationItem) => void; onMessage: (n: NotificationItem) => void;
}) {
  const { sections, items, error, loading, refreshing, refresh, retry, markAllRead, stateOf, busy } = notifs;
  const hasUnread = (items ?? []).some((n) => !n.read_at);
  const data = [
    ...(sections.fresh.length ? [{ key: 'new', title: 'New', data: sections.fresh }] : []),
    ...(sections.earlier.length ? [{ key: 'earlier', title: 'Earlier', data: sections.earlier }] : []),
  ];
  if (loading) return <LoadingRows avatar={52} />;
  if (error && !items) return <ErrorState text={error} onRetry={retry} />;
  return (
    <SectionList
      sections={data}
      keyExtractor={(n) => n.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={role.action} colors={[role.action]} />}
      contentContainerStyle={{ paddingBottom: bottom, flexGrow: 1 }}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={error ? <Notice icon="info" tone="warn" text="Could not refresh. Pull down to try again." /> : undefined}
      renderSectionHeader={({ section }) => (
        <Section
          right={section.key === 'new' && hasUnread ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Mark all as read" onPress={markAllRead} hitSlop={6} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
              <Icon name="check-double" color={role.accentText} size={20} />
              <AppText variant="label" color={role.accentText}>Mark all as read</AppText>
            </Pressable>
          ) : undefined}
        >
          {section.title}
        </Section>
      )}
      renderItem={({ item: n }) => (
        <NotificationRow
          n={n} now={now} request={n.kind === 'friend_request' ? stateOf(n) : null} busy={busy.has(n.id)}
          onPress={() => onOpen(n)} onAccept={() => onAccept(n)} onDecline={() => onDecline(n)} onMessage={() => onMessage(n)}
          onLongPress={n.actor ? () => onMore(n) : undefined}
        />
      )}
      ListEmptyComponent={<EmptyState icon="bell" title="All quiet on the Way" text="Friend requests, likes, comments and new badges will show up here." />}
    />
  );
}

/* ------------------------------------------------------------ Messages and Groups */

type ListProps = { convs: ReturnType<typeof useConversations>; meId: string | null; now: number; bottom: number; onOpen: (cv: Conversation) => void };

function MessagesTab({ list, convs, meId, now, bottom, requests, onOpen, onRequests, onFind, onNew }: ListProps & { list: Conversation[]; requests: number; onRequests: () => void; onFind: () => void; onNew: () => void }) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => filterConversations(list, query), [list, query]);
  const empty = !convs.loading && !convs.error && list.length === 0;
  const hasFriends = useHasFriends(empty);
  if (convs.loading) return <LoadingRows />;
  if (convs.error && !convs.items) return <ErrorState text={convs.error} onRetry={convs.retry} />;
  return (
    <FlatList
      data={shown}
      keyExtractor={(cv) => cv.id}
      refreshControl={<RefreshControl refreshing={convs.refreshing} onRefresh={convs.refresh} tintColor={role.action} colors={[role.action]} />}
      contentContainerStyle={{ paddingBottom: bottom, flexGrow: 1 }}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View>
          {convs.error && <Notice icon="info" tone="warn" text="Could not refresh. Pull down to try again." />}
          {list.length > 0 && <View style={{ paddingHorizontal: layout.screenMargin, paddingTop: space[4], paddingBottom: space[2] }}><SearchField value={query} onChangeText={setQuery} placeholder="Search chats" label="Search chats" /></View>}
          {requests > 0 && (
            <Pressable
              accessibilityRole="button" accessibilityLabel={`Friend requests, ${requests} waiting`} accessibilityHint="Opens your friend requests" onPress={onRequests}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], marginHorizontal: layout.screenMargin, marginTop: space[3], marginBottom: space[1], minHeight: 64, paddingHorizontal: space[4], borderRadius: radius.md, backgroundColor: pressed ? c.goldSoft : c.goldWash })}
            >
              <View style={{ width: 40, height: 40, borderRadius: radius.pill, backgroundColor: role.action, alignItems: 'center', justifyContent: 'center' }}><Icon name="user-plus" color={role.onAction} size={20} /></View>
              <AppText variant="label" style={{ flex: 1 }}>Friend requests</AppText>
              <CountBadge count={requests} />
              <Icon name="chevron" color={role.muted} size={20} />
            </Pressable>
          )}
        </View>
      }
      renderItem={({ item: cv }) => <ConversationRow conversation={cv} meId={meId ?? ''} now={now} onPress={() => onOpen(cv)} />}
      ListEmptyComponent={
        list.length > 0
          ? <EmptyState icon="search" title="No chats found" text={`Nothing matches "${query.trim()}". Try a different name.`} />
          : hasFriends === false
            ? <EmptyState icon="group" title="Walk together" text="Add friends first. When they accept, you can chat right here." action={{ label: 'Find pilgrims', icon: 'search', onPress: onFind }} />
            : <EmptyState icon="chat" title="No chats yet" text="Say hello to a friend and start the conversation." action={{ label: 'Start a chat', icon: 'compose', onPress: onNew }} />
      }
    />
  );
}

function GroupsTab({ list, convs, meId, now, bottom, onOpen, onNew }: ListProps & { list: Conversation[]; onNew: () => void }) {
  if (convs.loading) return <LoadingRows />;
  if (convs.error && !convs.items) return <ErrorState text={convs.error} onRetry={convs.retry} />;
  return (
    <FlatList
      data={list}
      keyExtractor={(cv) => cv.id}
      refreshControl={<RefreshControl refreshing={convs.refreshing} onRefresh={convs.refresh} tintColor={role.action} colors={[role.action]} />}
      contentContainerStyle={{ paddingBottom: bottom, flexGrow: 1 }}
      ListHeaderComponent={
        <View>
          {convs.error && <Notice icon="info" tone="warn" text="Could not refresh. Pull down to try again." />}
          {list.length > 0 && <View style={{ paddingHorizontal: layout.screenMargin, paddingTop: space[4], paddingBottom: space[2] }}><Btn label="New group" icon="group" variant="gold" full onPress={onNew} /></View>}
        </View>
      }
      renderItem={({ item: cv }) => <ConversationRow conversation={cv} meId={meId ?? ''} now={now} onPress={() => onOpen(cv)} />}
      ListEmptyComponent={<EmptyState icon="group" title="Walk in good company" text="Start a group for your Camino family or friends. Everyone you add needs to be your friend first." action={{ label: 'New group', icon: 'group', onPress: onNew }} />}
    />
  );
}
