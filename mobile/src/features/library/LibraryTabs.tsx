import { View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { SampleNotice, SampleTag } from '@/components/SampleNotice';
import { Card, SectionLabel } from '@/components/ui';
import { fixed, radius, role } from '@/theme';
import { BookmarkToggle } from './BookmarkToggle';
import { LibraryTab, PREVIEW_NOTICE, SAMPLE_BOOKS, SAMPLE_PLAYLISTS, SAMPLE_SHELVES, type Book, type Playlist, type Shelf } from './sample';
import { hitTabs, itemKey, type Hits } from './search';
import type { LibraryMarks } from './useLibraryBookmarks';

// The three Library tabs. There is no real content yet (see sample.ts), so each tab starts with an honest notice and
// then shows, with example rows, where the content will go. Colours are read while drawing, never at import.
//
// A row can carry a bookmark button (when `marks` is given): the button is its own component, so a row stays a plain picture of
// what will be there. The rows of one tab are also what a search result and the Bookmarks screen draw (LibraryGroups), so a row
// looks the same wherever it is.

const Notice = ({ tab }: { tab: LibraryTab }) => <SampleNotice title="Preview">{PREVIEW_NOTICE[tab]}</SampleNotice>;

/** A small chip that says a row is not available yet. */
const Soon = () => (
  <View accessibilityLabel="Coming soon" style={{ alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 10, height: 24, borderRadius: radius.pill, backgroundColor: role.sunken, justifyContent: 'center' }}>
    <AppText variant="mono" muted style={{ fontSize: 11, letterSpacing: 1 }}>SOON</AppText>
  </View>
);

/** The padding of a row: 16 at the start, and 6 at the end when the bookmark button (44 wide) is there. */
const rowStyle = (first: boolean, marks?: LibraryMarks) => ({
  minHeight: 64, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14, paddingLeft: 16, paddingRight: marks ? 6 : 16, paddingVertical: 10,
  borderTopWidth: first ? 0 : 1, borderTopColor: role.border,
});

const Mark = ({ marks, tab, id, title, color }: { marks?: LibraryMarks; tab: LibraryTab; id: string; title: string; color?: string }) => {
  if (!marks) return null;
  const key = itemKey(tab, id);
  return <BookmarkToggle on={marks.has(key)} title={title} toggle={() => marks.toggle(key)} color={color} />;
};

export function BibleShelves({ items, marks }: { items: readonly Shelf[]; marks?: LibraryMarks }) {
  return (
    <Card style={{ padding: 4 }}>
      {items.map((s, i) => (
        <View key={s.id} accessibilityState={marks ? undefined : { disabled: true }} style={rowStyle(i === 0, marks)}>
          <Icon name="book" color={role.muted} size={24} />
          <View style={{ flex: 1 }}>
            <AppText variant="label">{s.title}</AppText>
            <AppText variant="caption" muted>{s.note}</AppText>
            <Soon />
          </View>
          <Mark marks={marks} tab="Bible" id={s.id} title={s.title} />
        </View>
      ))}
    </Card>
  );
}

export function BookCovers({ items, marks }: { items: readonly Book[]; marks?: LibraryMarks }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      {items.map((b) => (
        <View key={b.id} accessibilityLabel={`${b.title}, sample cover`} style={{ flexBasis: '47%', flexGrow: 1, gap: 8 }}>
          {/* A cover is a pale picture colour that does not change with light/dark, so what is on it is the fixed navy. */}
          <View style={{ aspectRatio: 3 / 4, borderRadius: radius.md, backgroundColor: fixed[b.colour], padding: 14, justifyContent: 'space-between' }}>
            <Icon name={b.icon} color={fixed.blue} size={28} />
            <AppText variant="h4" color={fixed.blue}>{b.title}</AppText>
            {!!marks && <View style={{ position: 'absolute', top: 4, right: 4 }}><Mark marks={marks} tab="Books" id={b.id} title={b.title} color={fixed.blue} /></View>}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <AppText variant="caption" muted>{b.kind}</AppText>
            <SampleTag />
          </View>
        </View>
      ))}
      {/* An odd last cover keeps its half of the row instead of growing to fill it. */}
      {items.length % 2 === 1 && <View style={{ flexBasis: '47%', flexGrow: 1 }} />}
    </View>
  );
}

export function PlaylistRows({ items, marks }: { items: readonly Playlist[]; marks?: LibraryMarks }) {
  return (
    <Card style={{ padding: 4 }}>
      {items.map((p, i) => (
        <View key={p.id} accessibilityState={marks ? undefined : { disabled: true }} style={{ ...rowStyle(i === 0, marks), minHeight: 72 }}>
          <View style={{ width: 44, height: 44, borderRadius: radius.pill, backgroundColor: role.sunken, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="music" color={role.muted} size={22} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="label">{p.title}</AppText>
            <AppText variant="caption" muted>{p.note}</AppText>
            <Soon />
          </View>
          <Mark marks={marks} tab="Music" id={p.id} title={p.title} />
        </View>
      ))}
    </Card>
  );
}

/**
 * The rows of a list of results, group after group in the order of the tabs, each under its own label ("Bible · 2"). What a search
 * and the Bookmarks screen show; a tab that has no row in it is not drawn.
 */
export function LibraryGroups({ hits, marks }: { hits: Hits; marks: LibraryMarks }) {
  return (
    <>
      {hitTabs(hits).map((tab) => (
        <View key={tab} style={{ gap: 16 }}>
          <SectionLabel>{`${tab} · ${hits[tab].length}`}</SectionLabel>
          {tab === 'Bible' && <BibleShelves items={hits.Bible} marks={marks} />}
          {tab === 'Books' && <BookCovers items={hits.Books} marks={marks} />}
          {tab === 'Music' && <PlaylistRows items={hits.Music} marks={marks} />}
        </View>
      ))}
    </>
  );
}

export function BibleTab({ marks }: { marks?: LibraryMarks }) {
  return (
    <View style={{ gap: 16 }}>
      <Notice tab="Bible" />
      <Card style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <AppText variant="mono" muted style={{ textTransform: 'uppercase', letterSpacing: 1.2, fontSize: 12 }}>Today&apos;s reading</AppText>
          <SampleTag />
        </View>
        <AppText variant="h4">One short reading for today</AppText>
        <AppText variant="small" muted>When the Bible is in the app, today&apos;s reading will be here, and it will work without a signal.</AppText>
      </Card>
      <BibleShelves items={SAMPLE_SHELVES} marks={marks} />
    </View>
  );
}

export function BooksTab({ marks }: { marks?: LibraryMarks }) {
  return (
    <View style={{ gap: 16 }}>
      <Notice tab="Books" />
      <BookCovers items={SAMPLE_BOOKS} marks={marks} />
    </View>
  );
}

export function MusicTab({ marks }: { marks?: LibraryMarks }) {
  return (
    <View style={{ gap: 16 }}>
      <Notice tab="Music" />
      <PlaylistRows items={SAMPLE_PLAYLISTS} marks={marks} />
      <AppText variant="caption" muted>Songs will play only with a licence for them. Until we have one, nothing plays here.</AppText>
    </View>
  );
}
