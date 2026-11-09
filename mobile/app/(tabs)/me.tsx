import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, PixelRatio, Platform, Pressable, TextInput, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Pill } from '@/components/Pill';
import { ShellMark } from '@/components/auth/Wordmark';
import { Icon } from '@/components/Icon';
import { Fab } from '@/components/Fab';
import { Avatar, Card, IconButton, Photo, SubTabs } from '@/components/ui';
import { FormMessage } from '@/components/auth/Field';
import { tints } from '@/data/mock';
import { useAuth } from '@/lib/auth';
import { useMeData } from '@/lib/useMeData';
import { useUnreadTotals } from '@/features/social';
import { Empty, ProgressBar, shortDate } from '@/features/me/shared';
import { Health } from '@/features/me/Health';
import { planProgress } from '@/features/me/plan';
import { JourneyGrid } from '@/features/me/JourneyGrid';
import { SampleJourney } from '@/features/me/SampleJourney';
import { Highlights, ShowAllBar } from '@/features/me/Highlights';
import { caminoLine } from '@/features/me/caminoCard';
import { CARD_WIDE, DENSITY, headerDensity, stripOverflows } from '@/features/me/headerFit';
import { AllPlaces, PlaceHeader } from '@/features/me/AllPlaces';
import { buildHighlights } from '@/features/me/highlights';
import { buildRoutePlaces, emptyPlaceLine, visitedCount } from '@/features/me/routePoints';
import { POSTS_VIEW, resolveJourney, stepBack, tapAll, tapDestination, tapPlace, type JourneyView } from '@/features/me/journeyView';
import { DEFAULT_ME_TAB, ME_FAB, ME_TABS, badgeText, inboxLabel, inboxTab, type MeTab } from '@/features/me/tabs';
import { usePostMedia } from '@/features/me/usePostMedia';
import { NotesTab } from '@/features/notes/NotesTab';
import { ShareLinkSheet } from '@/components/ShareLinkSheet';
import { shareLinks } from '@/lib/shareLinksClient';
import { linkLabel } from '@/lib/shareLinks';
import { updateProfile } from '@/lib/api';
import { copyText } from '@/lib/clipboard';
import { PickerUnavailable, pickAndUploadAvatar } from '@/lib/avatar';
import { c, fonts, icon, layout, radius, role, scrim, shadowStyle, space } from '@/theme';

type StampT = NonNullable<ReturnType<typeof useMeData>['stamps']>[number];
type StageT = ReturnType<typeof useMeData>['stages'][number];
type DayT = NonNullable<ReturnType<typeof useMeData>['days']>[number];


/** Plan as a tracker: overall progress on top, then a timeline of days. */
function PlanTracker({ days, journeyId, routeName }: { days: DayT[]; journeyId: string | null; routeName: string | null }) {
  const router = useRouter();
  const [sharing, setSharing] = useState(false);
  if (days.length === 0) return <Empty text="Stages for your route are coming soon. Your day plan will appear here." />;
  // By kilometres when every day has a distance, otherwise by stages walked: some stages have no distance yet.
  const progress = planProgress(days);
  const doneN = progress.doneStages;
  const next = days.find((d) => d.status !== 'done');
  const last = days[days.length - 1];
  const title = (d: DayT) => (d.from_name && d.to_name ? `${d.from_name} → ${d.to_name}` : d.stage?.name ?? `Day ${d.day_number}`);
  return (
    <View style={{ gap: 16 }}>
      <Card style={{ gap: 14 }} onPress={() => router.push({ pathname: '/planner', params: next ? { day: next.id } : {} })}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <AppText variant="h3">{Math.round(progress.value * 100)}%</AppText>
          <AppText variant="label" muted>Day {Math.min(doneN + 1, days.length)} of {days.length}</AppText>
        </View>
        <ProgressBar value={progress.value} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <AppText variant="label" color={role.accentText}>Open day planner</AppText>
          <Icon name="chevron" color={role.accentText} size={18} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <AppText variant="small" muted>{progress.byKm ? `${Math.round(progress.doneKm)} of ${Math.round(progress.totalKm)} km` : `${doneN} of ${days.length} stages`}</AppText>
          <AppText variant="small" muted>{last.planned_date ? `Santiago ${shortDate(last.planned_date)}` : `${days.length - doneN} stages left`}</AppText>
        </View>
      </Card>
      {/* The plan is private (friends never see it). This makes ONE link to it, after a question that says what the link shows. */}
      {journeyId && (
        <Pressable accessibilityRole="button" accessibilityLabel="Share plan link" onPress={() => setSharing(true)} style={({ pressed }) => ({ minHeight: layout.touchPrimary, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], borderRadius: radius.pill, borderWidth: 1, borderColor: role.border, backgroundColor: pressed ? role.sunken : role.surface })}>
          <Icon name="share" color={role.action} size={icon.md} />
          <AppText variant="label" style={{ flex: 1 }}>Share plan link</AppText>
          <Icon name="chevron" color={role.action} size={icon.smPlus} />
        </Pressable>
      )}
      {sharing && journeyId && <ShareLinkSheet kind="plan" onClose={() => setSharing(false)} make={({ stays }) => shareLinks.sharePlan(journeyId, { stays, label: linkLabel(routeName) })} />}
      {next && (
        <Card style={{ gap: 6, backgroundColor: role.inverse }} onPress={() => router.push({ pathname: '/planner', params: { day: next.id } })}>
          <AppText variant="mono" color={role.onInverseAccent} style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.2 }}>Up next · Day {next.day_number}</AppText>
          <AppText variant="h4" color={role.onInverse}>{title(next)}</AppText>
          <AppText variant="small" color={role.onInverse}>{next.planned_distance_km ? `${Number(next.planned_distance_km).toFixed(1)} km` : ''}{next.planned_date ? ` · ${shortDate(next.planned_date)}` : ''}</AppText>
        </Card>
      )}
      <View>
        {days.map((d, i) => {
          const done = d.status === 'done';
          const isNext = next?.id === d.id;
          return (
            <View key={d.id} style={{ flexDirection: 'row', gap: 16 }}>
              <View style={{ alignItems: 'center', width: 36 }}>
                <View style={{ width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? c.success : isNext ? c.gold : role.surface, borderWidth: done || isNext ? 0 : 2, borderColor: c.sand300 }}>
                  {done ? <Icon name="check" color={c.white} size={20} /> : <AppText variant="caption" color={isNext ? role.onHighlight : role.muted} style={{ fontFamily: 'Inter_600SemiBold' }}>{d.day_number}</AppText>}
                </View>
                {i < days.length - 1 && <View style={{ width: 3, flex: 1, minHeight: 28, backgroundColor: done ? c.success : c.sand300 }} />}
              </View>
              <View style={{ flex: 1, paddingBottom: 22 }}>
                <AppText variant="label" color={done ? role.muted : role.text}>{title(d)}</AppText>
                <AppText variant="caption" muted>{d.planned_distance_km ? `${Number(d.planned_distance_km).toFixed(1)} km` : ''}{d.planned_date ? ` · ${shortDate(d.planned_date)}` : ''}{done ? ' · done' : isNext ? ' · up next' : ''}</AppText>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function ago(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  const hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (days <= 0) return `Today · ${hm}`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export default function Me() {
  const [tab, setTab] = useState<MeTab>(DEFAULT_ME_TAB);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // The header is drawn roomy or compact (features/me/headerFit.ts): compact when the strip of sub-tabs would end below the top edge of the chat button, which floats
  // at the bottom right of THIS view. The height is the view's own (measured), the window's until then; the status bar and the home bar are the insets.
  // It is worked out from the numbers first (no flash on a short phone) and checked once it is drawn: a roomy header that came out taller than its room (a long description, a larger text size than
  // the phone reported) turns compact. The height the roomy header measured is kept, so it is roomy again when the screen gets taller, and never flips back and forth.
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [host, setHost] = useState<{ width: number; height: number } | null>(null);
  const [roomyBottom, setRoomyBottom] = useState<number | null>(null);
  const fit = { screenHeight: host?.height ?? windowHeight, insets, fontScale: PixelRatio.getFontScale() };
  const narrow = (host?.width ?? windowWidth) < CARD_WIDE; // the My Camino card: the Change button goes under the words on a very narrow phone
  const predicted = headerDensity(fit);
  const density = predicted === 'roomy' && roomyBottom !== null && stripOverflows({ ...fit, stripBottom: roomyBottom, screenTop: layout.screenTop }) ? 'compact' : predicted;
  const hm = DENSITY[density]; // the numbers of the header in this density
  // The header ends with the strip, so the height of the header is where the strip ends. A height is what the web reports when something changes (a position alone is not reported there), and a phone too.
  // A description that was opened with Read more is the person's own choice and is not measured: closing it again must not leave the header compact.
  const checkStrip = (e: LayoutChangeEvent) => {
    if (density === 'roomy' && !bioOpen) setRoomyBottom(e.nativeEvent.layout.height);
  };
  const { profile, journey, session, refresh, stale } = useAuth();
  const unread = useUnreadTotals();
  const [editBio, setEditBio] = useState(false);
  const [bioDraft, setBioDraft] = useState('');
  const [savingBio, setSavingBio] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [bioOpen, setBioOpen] = useState(false);
  const [bioLines, setBioLines] = useState(0);
  const [copied, setCopied] = useState(false);
  const { posts, stamps, days, stages, error, offline } = useMeData();
  const name = profile?.display_name || profile?.username || 'Pilgrim';
  const stagesDone = days?.filter((d) => d.status === 'done').length ?? 0;
  // Highlights per destination under the My Camino card. Drawn once both the plan and the posts are known: before that
  // every place would look "not visited yet". The pictures are read once (usePostMedia) and shared by the row and the grid.
  const media = usePostMedia(posts);
  const highlights = useMemo(() => (days && posts ? buildHighlights(days, posts) : []), [days, posts]);
  // The places of the whole route (not only the plan) with the posts at each: the stamps of the All view, the first item of the row. Also only once the posts are known.
  const places = useMemo(() => (posts ? buildRoutePlaces(stages, posts) : []), [stages, posts]);
  // What the Journey area shows: all the posts, one destination of the row, the stamps of the All view, or one place of them (features/me/journeyView.ts). A key that
  // names nothing any more (the data was reloaded) is no filter.
  const [view, setView] = useState<JourneyView>(POSTS_VIEW);
  const shown = useMemo(() => resolveJourney(view, highlights, places), [view, highlights, places]);
  const onlyIds = shown.kind === 'destination' || shown.kind === 'place' ? shown.ids : null;
  const activeKey = shown.kind === 'destination' && view.view === 'posts' ? view.destination : null; // the highlight whose posts the grid shows
  const onJourney = tab === 'Journey';
  const pickHighlight = (h: { key: string }) => {
    // From the Plan, Health or Notes tab it brings you to the Journey grid with that destination; on the grid the same one again clears it.
    setTab('Journey');
    setView((v) => tapDestination(v, h.key, onJourney));
  };
  // The All item: from another tab it brings you to the stamps; on the grid it opens them, and on the stamps it closes them.
  const pickAll = () => {
    setTab('Journey');
    setView((v) => tapAll(v, onJourney));
  };
  const changePhoto = async () => {
    if (!session) return;
    setUploading(true);
    try {
      if (await pickAndUploadAvatar(session.user.id)) await refresh();
    } catch (e) {
      Alert.alert(e instanceof PickerUnavailable ? 'Next build' : 'Could not change photo', e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };
  const copyUsername = async () => {
    if (!profile?.username) return;
    if (await copyText(profile.username)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };
  const saveBio = async () => {
    if (!session) return;
    setSavingBio(true);
    try {
      await updateProfile(session.user.id, { bio: bioDraft.trim() || null });
      await refresh();
      setEditBio(false);
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : String(e));
    } finally {
      setSavingBio(false);
    }
  };
  const isPrivate = !!profile?.is_private;
  const askVisibility = () => {
    if (!session) return;
    const next = !isPrivate;
    Alert.alert(
      next ? 'Make your profile private?' : 'Make your profile public?',
      next
        ? 'Private: only your friends see your profile and posts. Other pilgrims can still find you by username to send a friend request.'
        : 'Public: other pilgrims can find you, see your profile and posts, and send you friend requests. Only friends can message you.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: next ? 'Make private' : 'Make public',
          onPress: async () => {
            try {
              await updateProfile(session.user.id, { is_private: next });
              await refresh();
            } catch (e) {
              Alert.alert('Could not change', e instanceof Error ? e.message : String(e));
            }
          },
        },
      ],
    );
  };
  const loading = <ActivityIndicator color={role.action} style={{ marginTop: 24 }} />;

  const onNotes = tab === 'Notes';
  // The one floating button is the chat button, the same on Notes, Journey, Plan and Health (features/me/tabs.ts). It opens the inbox on the tab where
  // something waits (Messages, else Notifications, else Messages) and carries the unread badge that the bell used to carry.
  const openInbox = () => router.push({ pathname: ME_FAB.href, params: { tab: inboxTab(unread) } });
  // The gold Change button of the My Camino card: a look, not a button of its own (the whole card is the button, "Change Camino").
  const change = (
    <View style={{ height: 40, paddingHorizontal: space[4], borderRadius: radius.pill, backgroundColor: c.gold, justifyContent: 'center' }}>
      <AppText variant="label" color={role.onHighlight}>Change</AppText>
    </View>
  );
  // Everything above the content of a sub-tab: the header (handle and gear, avatar and stats, name and bio, the My Camino card, the highlights) and the strip
  // of sub-tabs. Both hosts below draw it, so it looks the same on every sub-tab. One view; the space between its blocks is the density's (16, or 4 when compact).
  const top = (
    <View onLayout={checkStrip}>
      {/* Header follows the design system: handle pill + gear, avatar with stats, name and bio. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: hm.gear }}>
        <AppText variant="h4" numberOfLines={1} style={{ flexShrink: 1 }}>{profile?.username ?? name}</AppText>
        {!!profile?.username && (
          <Pressable accessibilityRole="button" accessibilityLabel={copied ? 'Username copied' : 'Copy username'} hitSlop={10} onPress={copyUsername} style={{ width: 26, height: 26, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={copied ? 'check' : 'copy'} color={copied ? c.success : role.muted} size={16} />
          </Pressable>
        )}
        {/* Top right: Settings only, in the corner. The inbox is the chat button at the bottom right. Settings is a screen of its own, no longer a tab. */}
        <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <IconButton name="settings" label="Settings" onPress={() => router.push('/settings')} size={hm.gear} />
        </View>
      </View>
      <View style={{ marginTop: hm.afterHeader, flexDirection: 'row', alignItems: 'center', gap: hm.avatarGap }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Change profile picture" onPress={changePhoto} disabled={uploading}>
          {profile?.avatar_url
            ? <Image source={{ uri: profile.avatar_url }} style={{ width: hm.avatar, height: hm.avatar, borderRadius: radius.pill, borderWidth: 3, borderColor: c.gold }} />
            : <Avatar size={hm.avatar} ring />}
          <View style={{ position: 'absolute', right: -2, bottom: -2, width: 26, height: 26, borderRadius: 13, backgroundColor: c.gold, borderWidth: 2, borderColor: role.bg, alignItems: 'center', justifyContent: 'center' }}>
            {uploading ? <ActivityIndicator size="small" color={role.onHighlight} /> : <Icon name="camera" color={role.onHighlight} size={13} />}
          </View>
        </Pressable>
        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-around' }}>
          {[[String(Math.round(Number(profile?.km_walked ?? 0))), 'km'], [String(profile?.stamps_count ?? 0), 'stamps'], [String(profile?.friends_count ?? 0), 'friends']].map(([n, l]) => (
            <Pressable key={l} accessibilityRole="button" onPress={() => router.push(l === 'km' ? '/journey' : l === 'stamps' ? '/passport' : '/friends')} style={{ alignItems: 'center' }}>
              <AppText variant={hm.statNumber}>{n}</AppText>
              <AppText variant={hm.statLabel} muted style={{ textDecorationLine: 'underline' }}>{l}</AppText>
            </Pressable>
          ))}
        </View>
      </View>
      {/* The name text sits centred in a 34 high row, 3 px lower than the row top: 4 above the row leave 7 between the profile picture and the name. */}
      <View style={{ gap: 4, marginTop: space[1] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <AppText variant="body" numberOfLines={1} style={{ fontFamily: 'Inter_600SemiBold', flexShrink: 1 }}>{name}</AppText>
          <Pressable accessibilityRole="button" accessibilityLabel="Edit description" hitSlop={8} onPress={() => { setBioDraft(profile?.bio ?? ''); setEditBio(true); }} style={{ width: 34, height: 34, borderRadius: radius.pill, backgroundColor: role.surface, borderWidth: 1, borderColor: role.border, alignItems: 'center', justifyContent: 'center', marginRight: -6 }}>
            <Icon name="pen" color={c.blue} size={16} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={isPrivate ? 'Private profile, tap to change' : 'Public profile, tap to change'} onPress={askVisibility} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: isPrivate ? c.sand200 : c.successWash }}>
            <Icon name={isPrivate ? 'shield' : 'pin'} color={isPrivate ? role.text : c.success} size={16} />
            <AppText variant="caption" color={isPrivate ? role.text : c.success} style={{ fontFamily: 'Inter_600SemiBold' }}>{isPrivate ? 'Private' : 'Public'}</AppText>
          </Pressable>
        </View>
        {/* Smaller text, 4 lines, then "Read more". The invisible copy measures the full length. */}
        <View>
          <AppText variant="small" muted={!profile?.bio} numberOfLines={bioOpen ? undefined : hm.bioLines}>{profile?.bio || 'Add a short description about you'}</AppText>
          {!!profile?.bio && (
            <AppText variant="small" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" onTextLayout={(e) => setBioLines(e.nativeEvent.lines.length)} style={{ position: 'absolute', left: 0, right: 0, opacity: 0 }} pointerEvents="none">{profile.bio}</AppText>
          )}
        </View>
        {bioLines > hm.bioLines && (
          <Pressable accessibilityRole="button" onPress={() => setBioOpen((v) => !v)} hitSlop={8} style={{ alignSelf: 'flex-start' }}>
            <AppText variant="small" color={role.accentText} style={{ fontFamily: 'Inter_600SemiBold' }}>{bioOpen ? 'Show less' : 'Read more'}</AppText>
          </Pressable>
        )}
        {journey?.route ? (
          // The card, in two bands. The head: the shell, "Buen Camino!" over "My Camino", and the Change button at the right end (on a very narrow phone it moves to the end of the body: there
          // the words beside it wrap). The body: the route and how far along it is, with the whole width of the card, so that no word is cut. Compact: a smaller shell and less air.
          <Pressable accessibilityRole="button" accessibilityLabel="Change Camino" onPress={() => router.push('/change-camino')} style={{ marginTop: hm.cardLift, gap: hm.cardGap, padding: space[3], borderRadius: radius.lg, backgroundColor: role.inverse, ...shadowStyle('md') }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space[3], rowGap: space[2] }}>
              {/* design-lint-ignore: color the ring is the gold of the palette at 55 percent over the dark card, as the design page draws it */}
              <View style={{ width: hm.cardRing, height: hm.cardRing, borderRadius: radius.pill, borderWidth: 1.5, borderColor: 'rgba(217,162,27,0.55)', alignItems: 'center', justifyContent: 'center' }}>
                <ShellMark size={hm.cardRing - 4} />
              </View>
              <View style={{ flexGrow: 1, flexShrink: 0 }}>
                <AppText variant="accent" color={c.gold} style={{ fontSize: 24, lineHeight: 28 }}>Buen Camino!</AppText>
                <AppText variant="h4" color={role.onInverseAccent} style={{ fontSize: 17, lineHeight: 21 }}>My Camino</AppText>
              </View>
              {!narrow && <View style={{ marginLeft: 'auto' }}>{change}</View>}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
              <View style={{ flex: 1 }}>
                <AppText variant="label" color={role.onInverse}>{journey.route.name}</AppText>
                <AppText variant="caption" color={role.onInverse} style={{ opacity: 0.85 }}>{caminoLine(journey.start_stage?.stage_number, stagesDone)}</AppText>
              </View>
              {narrow && change}
            </View>
          </Pressable>
        ) : <AppText variant="accent" color={role.accentText}>Buen Camino!</AppText>}
        <Highlights key={session?.user.id ?? 'none'} items={highlights} days={days ?? []} media={media} activeKey={activeKey} userId={session?.user.id} onPick={pickHighlight} all={places.length > 0 ? { visited: visitedCount(places), total: places.length, on: shown.kind === 'stamps' || shown.kind === 'place', onPress: pickAll } : null} dense={density === 'compact'} />
      </View>
      <View style={{ marginTop: hm.beforeStrip }}>
        <SubTabs tabs={ME_TABS} value={tab} onChange={setTab} />
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1 }} onLayout={(e) => setHost({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
      {onNotes ? (
        // The Notes feed owns the scroll of the screen (a virtualised list, features/notes): the header and the strip are the first thing in it, drawn with the
        // margins and the gap that Screen gives them, so they scroll away with the notes. No message about Me's data (offline, could not load) is drawn here:
        // the notes are on this phone and need no signal.
        <NotesTab top={<View style={{ paddingTop: insets.top + layout.screenTop, paddingHorizontal: layout.screenMargin, paddingBottom: 16, gap: 16 }}>{top}</View>} />
      ) : (
        <Screen>
          {top}
          {(offline || stale) && <FormMessage tone="info">You are offline. Showing what is saved on this phone.</FormMessage>}
          {!!error && <FormMessage>{`Could not load your data. ${error}`}</FormMessage>}

          {/* Over the grid while it shows one place, the way back: from a destination of the row (the bar) to all the posts, from a place of the All view (Back) to the stamps. */}
          {tab === 'Journey' && shown.kind === 'destination' && <ShowAllBar name={shown.name} onPress={() => setView(stepBack)} />}
          {tab === 'Journey' && shown.kind === 'place' && <PlaceHeader name={shown.name} onBack={() => setView(stepBack)} />}
          {tab === 'Journey' && shown.kind === 'place' && shown.empty && <Empty text={emptyPlaceLine(shown.name)} />}
          {tab === 'Journey' && shown.kind === 'stamps' && <AllPlaces places={places} onPick={(p) => setView(tapPlace(p.key))} />}
          {tab === 'Journey' && shown.kind !== 'stamps' && (!posts ? (offline ? <Empty text="You are offline. Your journey posts will show up when you are back online." /> : loading) : posts.length === 0 && shown.kind === 'grid'
            ? <SampleJourney />
            : <JourneyGrid posts={posts} media={media} only={onlyIds} />)}

          {tab === 'Plan' && (!days ? (offline ? <Empty text="You are offline and your plan is not saved on this phone yet. Open it once with a connection." /> : loading) : <PlanTracker days={days} journeyId={journey?.id ?? null} routeName={journey?.route?.name ?? null} />)}

          {tab === 'Health' && <Health />}
          {/* Room under the last thing for the chat button over the corner: with the gap above it, 56 more, so the room is the one the Notes feed leaves (the bar, the button, a margin). */}
          <View style={{ height: 40 }} />
        </Screen>
      )}
      <Modal visible={editBio} transparent animationType="slide" onRequestClose={() => setEditBio(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: scrim }}>
          <View style={{ backgroundColor: role.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: layout.screenMargin, paddingTop: 24, paddingBottom: insets.bottom + 24, gap: 16 }}>
            <AppText variant="h4">Your description</AppText>
            <TextInput autoFocus multiline maxLength={160} value={bioDraft} onChangeText={setBioDraft} placeholder="Pilgrim from Jakarta, walking for my family…" placeholderTextColor={role.muted} style={{ minHeight: 110, textAlignVertical: 'top', fontFamily: fonts.body, fontSize: 19, lineHeight: 28, color: role.text, backgroundColor: role.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: role.border, padding: 16 }} />
            <AppText variant="caption" muted style={{ textAlign: 'right' }}>{bioDraft.length} / 160</AppText>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}><Pill large variant="ghost" label="Cancel" onPress={() => setEditBio(false)} /></View>
              <View style={{ flex: 1 }}><Pill large label="Save" onPress={saveBio} loading={savingBio} /></View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <Fab label={inboxLabel(unread.total)} icon={ME_FAB.icon} hint={ME_FAB.hint} badge={badgeText(unread.total)} onPress={openInbox} />
    </View>
  );
}
