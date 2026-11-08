import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, AppState, FlatList, Platform, RefreshControl, Share, View, type ListRenderItemInfo } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/Pill';
import { confirmDelete } from '@/features/diary/confirm';
import { device } from '@/features/diary/device';
import { MediaViewer } from '@/features/diary/MediaTiles';
import { mediaOf } from '@/features/diary/media';
import type { DiaryPlace } from '@/features/diary/place';
import { metaLine, pageTitle } from '@/features/diary/present';
import type { DiaryEntry } from '@/features/diary/store';
import { useDiary } from '@/features/diary/useDiary';
import { useAuth } from '@/lib/auth';
import { shareAndRecord } from '@/lib/postShare';
import { layout, radius, role } from '@/theme';
import { NoteMenu } from './NoteMenu';
import { NoteRow, type NoteActions, type NoteWho } from './NoteRow';
import { NotesHeader } from './NotesHeader';
import {
  DELETE_FAILED, EMPTY_BUTTON, EMPTY_TEXT, EMPTY_TITLE, FILTER_EMPTY, LOADING_LABEL, MAPS_FAILED, SHARE_FAILED, SHOW_ALL,
  feedState, filterNotes, identity, noteCounts, toggled, type NoteFilter, type Telling,
} from './timeline';

// The Notes feed of Me: the pages of the diary as a feed, like a timeline. They are the same pages as My diary (features/diary), private,
// only on this phone: this tab reads them through useDiary and deletes through the same call; it writes nothing and sends nothing anywhere.
// The only thing that can leave is the words of a note, when the person taps Share and chooses where in the system's share sheet.
//
// HOW ME HOSTS IT: while the Notes sub-tab is on, <NotesTab top={...} /> is the scroll of the screen. It is a virtualised list, so a diary of
// 2,000 notes draws only the rows that are on screen, and pull to refresh belongs to it. Mount it in a box that has a height of its own (flex: 1,
// never inside a ScrollView) and that is as wide as the screen: the rows run from edge to edge and are parted by a hairline. Everything that sits
// above the notes on Me (the profile, the highlights, the strip of sub-tabs) is `top`: the first thing in the list, so it scrolls away with the
// notes, and it brings its own margins. The tab leaves room at the bottom for the floating tab bar and for the gold pen, which Me draws (this
// tab draws no pen of its own).

const keyOf = (e: DiaryEntry) => e.id;

/** The hairline between two notes, the full width. */
function Separator() {
  return <View style={{ height: 1, backgroundColor: role.border }} />;
}

/** What the clock says, read when the tab is shown and when the app comes back to the front: "5m" and "2h" move on with it. */
function useNow(): [Date, () => void] {
  const [now, setNow] = useState(() => new Date());
  const tick = useCallback(() => setNow(new Date()), []);
  useFocusEffect(useCallback(() => { tick(); }, [tick]));
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') tick(); });
    return () => sub.remove();
  }, [tick]);
  return [now, tick];
}

/**
 * Tells the person that something did not work, in the system's own dialog (like the question before a delete): it is seen wherever the list
 * has been scrolled to. The browser's alert on the web.
 */
function tell(m: Telling) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && typeof window.alert === 'function') window.alert(`${m.title}\n\n${m.text}`);
    return;
  }
  Alert.alert(m.title, m.text);
}

/** The friendly page the feed shows when there is nothing to list: the diary has no note, or the filter holds none. */
function Empty({ title, text, button, ghost, onPress }: { title: string; text: string; button: string; ghost?: boolean; onPress: () => void }) {
  return (
    <View style={{ alignItems: 'center', gap: 12, paddingHorizontal: 32, paddingTop: 24, paddingBottom: 24 }}>
      <View style={{ width: 56, height: 56, borderRadius: radius.pill, backgroundColor: role.highlight, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="compose" color={role.onHighlight} size={28} />
      </View>
      <AppText variant="h4" accessibilityRole="header" style={{ textAlign: 'center' }}>{title}</AppText>
      <AppText variant="small" muted style={{ textAlign: 'center' }}>{text}</AppText>
      <View style={{ alignSelf: 'stretch', marginTop: 8 }}>
        <Pill large variant={ghost ? 'ghost' : 'primary'} label={button} onPress={onPress} />
      </View>
    </View>
  );
}

export function NotesTab({ top }: { top?: ReactNode }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { uid, ready, entries, remove, reload } = useDiary();
  const owner = uid ?? '';
  const [now, tick] = useNow();
  const [filter, setFilter] = useState<NoteFilter>('all');
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  const [menuFor, setMenuFor] = useState<DiaryEntry | null>(null);
  const [viewing, setViewing] = useState<{ id: string; start: number } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const who = useMemo<NoteWho>(() => ({ ...identity(profile), photo: profile?.avatar_url ?? null, seed: uid ?? 'me' }), [profile, uid]);
  const counts = useMemo(() => noteCounts(entries), [entries]);
  const shown = useMemo(() => filterNotes(entries, filter), [entries, filter]);
  const state = feedState({ ready, total: entries.length, shown: shown.length });

  const write = useCallback(() => router.push('/diary/new'), [router]);
  const open = useCallback((id: string) => router.push(`/diary/${id}`), [router]);

  const askDelete = useCallback((e: DiaryEntry) => {
    confirmDelete(pageTitle(e), async () => {
      const ok = await remove(e.id);
      if (!ok) tell(DELETE_FAILED);
    }, metaLine(e) !== '');
  }, [remove]);

  const share = useCallback(async (text: string) => {
    if (!text) return;
    // No `record`: nothing is counted and nothing is sent to a server. The share sheet is the phone's; what goes where is the person's choice.
    const res = await shareAndRecord({ share: () => Share.share({ message: text }) });
    if (res.outcome === 'failed') tell(SHARE_FAILED);
  }, []);

  const openPlace = useCallback(async (p: DiaryPlace) => {
    if (!(await device.openMaps(p))) tell(MAPS_FAILED);
  }, []);

  const actions = useMemo<NoteActions>(() => ({
    open,
    edit: open,
    more: setMenuFor,
    remove: askDelete,
    share,
    media: (id, start) => setViewing({ id, start }),
    place: openPlace,
    toggle: (id) => setOpened((s) => toggled(s, id)),
  }), [open, askDelete, share, openPlace]);

  // The menu closes first and the question comes a moment after: a system dialog opened while the sheet is still going away may not show.
  const chooseDelete = (e: DiaryEntry) => { setMenuFor(null); setTimeout(() => askDelete(e), 350); };
  const chooseEdit = (e: DiaryEntry) => { setMenuFor(null); open(e.id); };

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([reload(), new Promise((resolve) => setTimeout(resolve, 400))]);
    tick();
    setRefreshing(false);
  }, [reload, tick]);

  // The viewer shows the photos and videos of one note, the way the page does; a note that is gone (deleted somewhere else) closes it.
  const viewed = useMemo(() => {
    const e = viewing ? entries.find((x) => x.id === viewing.id) : undefined;
    return e ? mediaOf(e) : [];
  }, [viewing, entries]);
  useEffect(() => { if (viewing && viewed.length === 0) setViewing(null); }, [viewing, viewed.length]);

  const extra = useMemo(() => ({ owner, now, who, opened, actions }), [owner, now, who, opened, actions]);
  const renderItem = useCallback(({ item }: ListRenderItemInfo<DiaryEntry>) => (
    <NoteRow entry={item} uid={owner} now={now} who={who} open={opened.has(item.id)} actions={actions} />
  ), [owner, now, who, opened, actions]);

  const header = (
    <>
      {top}
      <NotesHeader name={who.name} photo={who.photo} seed={who.seed} onWrite={write} filter={filter} counts={counts} onFilter={setFilter} />
    </>
  );
  const empty = state === 'loading' ? (
    <ActivityIndicator accessibilityLabel={LOADING_LABEL} color={role.action} style={{ marginTop: 40 }} />
  ) : state === 'empty' ? (
    <Empty title={EMPTY_TITLE} text={EMPTY_TEXT} button={EMPTY_BUTTON} onPress={write} />
  ) : state === 'none-for-filter' && filter !== 'all' ? (
    <Empty title={FILTER_EMPTY[filter].title} text={FILTER_EMPTY[filter].text} button={SHOW_ALL} ghost onPress={() => setFilter('all')} />
  ) : undefined;
  const overlays = (
    <>
      {menuFor !== null && <NoteMenu title={pageTitle(menuFor)} onClose={() => setMenuFor(null)} onEdit={() => chooseEdit(menuFor)} onDelete={() => chooseDelete(menuFor)} />}
      {viewing !== null && viewed.length > 0 && <MediaViewer uid={owner} items={viewed} start={viewing.start} onClose={() => setViewing(null)} />}
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: role.bg }}>
      <FlatList
        data={shown}
        keyExtractor={keyOf}
        renderItem={renderItem}
        extraData={extra}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ItemSeparatorComponent={Separator}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={7}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={role.action} colors={[role.action]} progressBackgroundColor={role.surface} />}
        contentContainerStyle={{ paddingBottom: layout.tabbarHeight + insets.bottom + 96 }}
        style={{ flex: 1 }}
      />
      {overlays}
    </View>
  );
}
