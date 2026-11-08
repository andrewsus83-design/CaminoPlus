import { View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { SampleNotice, SampleTag } from '@/components/SampleNotice';
import { Card, SectionLabel } from '@/components/ui';
import { radius, role } from '@/theme';
import type { LibraryBook } from './books';
import { BookCovers } from './BookShelf';
import { BookmarkToggle } from './BookmarkToggle';
import { PREVIEW_NOTICE, SAMPLE_PLAYLISTS, SAMPLE_SHELVES, type ExampleTab, type LibraryTab, type Playlist, type Shelf } from './sample';
import { hitTabs, itemKey, type Hits } from './search';
import type { LibraryMarks } from './useLibraryBookmarks';

// The three Library tabs. The Bible and Music tabs have no real content yet (see sample.ts), so each starts with an honest notice and then
// shows, with example rows, where the content will go. The Books tab is real: its covers are the books of the bundle (BookShelf.tsx), they
// open the book, and there is no notice because nothing on it is an example. Colours are read while drawing, never at import.
//
// An example row can carry a bookmark button (when `marks` is given): the button is its own component, so a row stays a plain picture of
// what will be there. The rows of one tab are also what a search result and the Bookmarks screen draw (LibraryGroups), so a row
// looks the same wherever it is.

const Notice = ({ tab }: { tab: ExampleTab }) => <SampleNotice title="Preview">{PREVIEW_NOTICE[tab]}</SampleNotice>;

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

/** The line under the Books tab's covers' heading: how many books there are, and that they are in the app. */
export const booksLine = (n: number) => `${n} ${n === 1 ? 'book' : 'books'} in the app. They are saved on this phone, so they read without a signal.`;
/** The Books tab when the bundle has no book (a build made before the books were added). */
export const BOOKS_NONE = 'No books are in this version of the app yet.';

export function BooksTab({ books, marks }: { books: readonly LibraryBook[]; marks?: LibraryMarks }) {
  return (
    <View style={{ gap: 16 }}>
      {books.length > 0 ? (
        <>
          <AppText variant="small" muted>{booksLine(books.length)}</AppText>
          <BookCovers items={books} marks={marks} />
        </>
      ) : (
        <Card><AppText variant="small" muted>{BOOKS_NONE}</AppText></Card>
      )}
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
