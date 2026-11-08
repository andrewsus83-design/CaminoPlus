import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { IconButton } from '@/components/ui';
import { usePostMedia } from '@/features/me/usePostMedia';
import { FriendBar, PilgrimHeader } from '@/features/pilgrim/PilgrimHeader';
import { JourneyPanel } from '@/features/pilgrim/JourneyPanel';
import { UNAVAILABLE_WORDS, UNFRIEND_MESSAGE, friendDone, menuOptions, pilgrimHandle, pilgrimHref, pilgrimName, sameId } from '@/features/pilgrim/logic';
import { type FriendActionKind, usePilgrim } from '@/features/pilgrim/usePilgrim';
import { refreshUnreadTotals, socialApi, useSafety } from '@/features/social';
import { useDialogs } from '@/features/social/components/dialogs';
import { ScreenHeader } from '@/features/social/components/primitives';
import { EmptyState, ErrorState, Notice } from '@/features/social/components/states';
import { friendlyError } from '@/features/social/logic';
import { goBack } from '@/features/social/nav';
import { role, space } from '@/theme';

/**
 * The profile of another pilgrim, and their journey. Reached from the friends list, a search result, a request, the name of a comment, the owner's name in the
 * viewer and the header of a direct chat. It shows what they published and nothing private: their card, where you stand with them (Message, Add friend,
 * Requested, Accept), and the posts you may see in the grid and viewer of Me's Journey. No notes, no plan, no health: those are not read here at all.
 *
 * One of: loading, ready, a profile that is not available (unknown, deleted, blocked either way: the same card for all, so nobody learns who blocked whom),
 * a read that failed (offline, with a way to try again). A private profile that is not a friend's is a minimal card. Your own id goes to Me.
 */
export default function PilgrimScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const dialogs = useDialogs();
  const { confirm, menu, toast, host } = dialogs;
  const safety = useSafety(dialogs);
  const { view, busy, act, reload, retry, refreshError } = usePilgrim(id);
  const posts = view.status === 'ready' && view.journeys.status === 'ready' ? view.journeys.posts : null;
  const media = usePostMedia(posts);
  const [messaging, setMessaging] = useState(false);

  useEffect(() => { if (view.status === 'self') router.replace('/(tabs)/me'); }, [view.status, router]);

  const ready = view.status === 'ready' ? view : null;
  const name = ready ? pilgrimName(ready.pilgrim) : 'this pilgrim';

  const run = async (kind: FriendActionKind) => {
    const err = await act(kind);
    toast(err ?? friendDone(kind, name));
  };

  const openChat = async () => {
    if (!ready || messaging) return;
    setMessaging(true);
    try {
      router.push(`/chat/${await socialApi.startDirectChat(ready.pilgrim.id)}`);
    } catch (e) {
      toast(friendlyError(e, 'Could not open this chat.'));
    } finally {
      setMessaging(false);
    }
  };

  const openMenu = async () => {
    if (!ready) return;
    const { pilgrim, relation } = ready;
    const choice = await menu({ title: name, options: menuOptions(relation, name) });
    if (choice === 'unfriend') {
      if (await confirm({ title: `Unfriend ${name}?`, message: UNFRIEND_MESSAGE, confirmLabel: 'Unfriend', destructive: true, icon: 'close' })) await run('unfriend');
    } else if (choice === 'report') {
      await safety.reportPerson({ id: pilgrim.id, name });
    } else if (choice === 'block') {
      // Blocking ends a friendship and hides each of you from the other: the profile reloads and becomes the card of a profile that is not available.
      if (await safety.block({ id: pilgrim.id, name })) {
        void refreshUnreadTotals();
        await reload();
      }
    }
  };

  // A name in the viewer: another pilgrim opens their profile; the owner's own name is this screen, so the viewer just closes.
  const openPilgrim = (to: string) => { if (!sameId(to, id)) router.push(pilgrimHref(to)); };

  let body;
  if (ready) {
    body = (
      <>
        <PilgrimHeader pilgrim={ready.pilgrim} minimal={ready.minimal} />
        <FriendBar relation={ready.relation} name={name} busy={busy} messaging={messaging} onAct={(k) => void run(k)} onMessage={() => void openChat()} />
        {!!refreshError && <Notice icon="info" tone="warn" text={refreshError.offline ? 'You are offline. Showing what was loaded.' : 'Could not refresh. Showing what was loaded.'} />}
        <JourneyPanel view={ready} media={media} onRetry={retry} onOpenPilgrim={openPilgrim} />
      </>
    );
  } else if (view.status === 'error') {
    body = <ErrorState title={view.error.offline ? 'You are offline' : 'This profile did not load'} text={view.error.message} onRetry={retry} />;
  } else if (view.status === 'unavailable') {
    body = <EmptyState icon="me" title={UNAVAILABLE_WORDS.title} text={UNAVAILABLE_WORDS.text} action={{ label: 'Go to Friends', icon: 'group', onPress: () => router.replace('/friends') }} />;
  } else {
    body = <ActivityIndicator accessibilityLabel="Loading the profile" color={role.action} style={{ marginTop: space[6] }} />;
  }

  return (
    <View style={{ flex: 1 }}>
      <Screen tabBar={false}>
        <ScreenHeader
          title={ready ? pilgrimHandle(ready.pilgrim) ?? name : 'Profile'}
          variant="h4"
          onBack={() => goBack(router)}
          right={ready ? <IconButton name="more" label={`More options for ${name}`} onPress={() => void openMenu()} /> : undefined}
        />
        {body}
      </Screen>
      {host}
    </View>
  );
}
