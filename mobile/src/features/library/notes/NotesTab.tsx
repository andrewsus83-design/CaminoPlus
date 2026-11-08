import { useCallback, useEffect, useMemo, useState } from 'react';
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
  DELETE_FAILED, EMPTY_BUTTON, EMPTY_TEXT, EMPTY_TITLE, FILTER_EMPTY, LOADING_LABEL, MAPS_FAILED, NOTES_PAGE, SHARE_FAILED, SHOW_ALL,
  feedState, filterNotes, identity, moreNotesLabel, nextLimit, noteCounts, notesLeft, pageOf, toggled, type NoteFilter, type Telling,
} from './timeline';

// The Library's Notes tab: the pages of the diary as a feed, like a timeline. They are the same pages as My diary (features/diary), private,
// only on this phone: this tab reads them through useDiary and deletes through the same call; it writes nothing and sends nothing anywhere.
// The only thing that can leave is the words of a note, when the person taps Share and chooses where in the system's share sheet.
//
// HOW THE SHELL HOSTS IT. Two ways, one component:
//   <NotesTab />            in the page that holds it: inside the Library screen's own scroll view, right under the tab strip. The notes are drawn
//                           a page at a time (30, then a button for 30 more), so a diary of 2,000 notes never draws them all at once. It runs from
//                           edge to edge (a margin of -layout.screenMargin: the Screen's own), and leaves room for the gold pen. No pull to
//                           refresh here (that belongs to the scroll view); the list is read again whenever the tab comes back into view.
//   <NotesTab ownScroll />  the tab is the scroller: a virtualised list that draws only the rows on screen, with pull to refresh and the search row
//                           and the tab strip standing still above it. Mount it in a box that has a height of its own (flex: 1 below them, never
//                           inside a ScrollView) and as wide as the screen. It leaves room at the bottom for the floating tab bar and the gold pen.
// The gold pen is the shell's: this tab draws none.

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
 * has been scrolled to, and in either way of hosting the tab. The browser's alert on the web.
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

export function NotesTab({ ownScroll = false }: { ownScroll?: boolean }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { uid, ready, entries, remove, reload } = useDiary();
  const owner = uid ?? '';
  const [now, tick] = useNow();
  const [filter, setFilter] = useState<NoteFilter>('all');
  const [limit, setLimit] = useState(NOTES_PAGE);
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  const [menuFor, setMenuFor] = useState<DiaryEntry | null>(null);
  const [viewing, setViewing] = useState<{ id: string; start: number } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const who = useMemo<NoteWho>(() => ({ ...identity(profile), photo: profile?.avatar_url ?? null, seed: uid ?? 'me' }), [profile, uid]);
  const counts = useMemo(() => noteCounts(entries), [entries]);
  const shown = useMemo(() => filterNotes(entries, filter), [entries, filter]);
  // In the page of the host the notes come a page at a time; in a list of its own all of them are in it, and only those on screen are drawn.
  const drawn = useMemo(() => (ownScroll ? shown : pageOf(shown, limit)), [ownScroll, shown, limit]);
  const left = notesLeft(shown.length, drawn.length);
  const state = feedState({ ready, total: entries.length, shown: shown.length });
  const chooseFilter = useCallback((f: NoteFilter) => { setFilter(f); setLimit(NOTES_PAGE); }, []);

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
  const renderRow = useCallback((item: DiaryEntry) => (
    <NoteRow entry={item} uid={owner} now={now} who={who} open={opened.has(item.id)} actions={actions} />
  ), [owner, now, who, opened, actions]);
  const renderItem = useCallback(({ item }: ListRenderItemInfo<DiaryEntry>) => renderRow(item), [renderRow]);

  const header = (
    <NotesHeader name={who.name} photo={who.photo} seed={who.seed} onWrite={write} filter={filter} counts={counts} onFilter={chooseFilter} />
  );
  const empty = state === 'loading' ? (
    <ActivityIndicator accessibilityLabel={LOADING_LABEL} color={role.action} style={{ marginTop: 40 }} />
  ) : state === 'empty' ? (
    <Empty title={EMPTY_TITLE} text={EMPTY_TEXT} button={EMPTY_BUTTON} onPress={write} />
  ) : state === 'none-for-filter' && filter !== 'all' ? (
    <Empty title={FILTER_EMPTY[filter].title} text={FILTER_EMPTY[filter].text} button={SHOW_ALL} ghost onPress={() => chooseFilter('all')} />
  ) : undefined;
  const overlays = (
    <>
      {menuFor !== null && <NoteMenu title={pageTitle(menuFor)} onClose={() => setMenuFor(null)} onEdit={() => chooseEdit(menuFor)} onDelete={() => chooseDelete(menuFor)} />}
      {viewing !== null && viewed.length > 0 && <MediaViewer uid={owner} items={viewed} start={viewing.start} onClose={() => setViewing(null)} />}
    </>
  );

  if (!ownScroll) {
    return (
      <View style={{ marginHorizontal: -layout.screenMargin, backgroundColor: role.bg }}>
        {header}
        {empty}
        {drawn.map((e, i) => (
          <View key={e.id}>
            {i > 0 && <Separator />}
            {renderRow(e)}
          </View>
        ))}
        {left > 0 && (
          <View style={{ paddingHorizontal: layout.screenMargin, paddingTop: 16 }}>
            <Pill variant="ghost" label={moreNotesLabel(left)} onPress={() => setLimit((n) => nextLimit(n, shown.length))} />
          </View>
        )}
        {/* room under the last note and the button for the gold pen that floats at the bottom right (the host already leaves the room of the tab bar) */}
        <View style={{ height: 56 }} />
        {overlays}
      </View>
    );
  }

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
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={role.action} colors={[role.action]} progressBackgroundColor={role.surface} />}
        contentContainerStyle={{ paddingBottom: layout.tabbarHeight + insets.bottom + 96 }}
        style={{ flex: 1 }}
      />
      {overlays}
    </View>
  );
}
