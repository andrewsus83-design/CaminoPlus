import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Fab } from '@/components/Fab';
import { SubTabs } from '@/components/ui';
import { FormMessage } from '@/components/auth/Field';
import { ContinueCard } from '@/features/library/bible/ContinueCard';
import type { Testament } from '@/features/library/bible/books';
import { bookHref, readerHref } from '@/features/library/bible/order';
import type { Ref } from '@/features/library/bible/ref';
import { prepareSearch } from '@/features/library/bible/searchText';
import { useLastRead } from '@/features/library/bible/useLastRead';
import { BooksBanner, DailyBanner } from '@/features/library/LibraryBanner';
import { LibraryHeader } from '@/features/library/LibraryHeader';
import { BibleTab, BooksTab } from '@/features/library/LibraryTabs';
import { NotesTab } from '@/features/library/notes/NotesTab';
import { SearchResults } from '@/features/library/SearchResults';
import { LIBRARY_TABS, LibraryTab } from '@/features/library/sample';
import { BOOKMARK_NOT_SAVED } from '@/features/library/bookmarks';
import { isSearching } from '@/features/library/search';
import { useLibraryBookmarks } from '@/features/library/useLibraryBookmarks';
import { layout, role } from '@/theme';

// Library: no title. The row on top is a search field and the round Bookmarks button in the corner; directly under it the three tabs,
// Bible, Books and Notes. Bible and Books each start with a banner (the Bible one, compact, opens today's reading); Notes, which is the diary,
// has none: its notes start right under the tabs. While something is typed in the search field, its results (the books of the Bible, the twelve
// books and the verses, grouped) take the place of the tabs and the banners; clearing it brings them back as they were.
//
// Two ways to host a tab. Bible, Books and the search results are rows in the screen's own scroll (Screen), so the search row and the tabs
// scroll away with them. Notes is a feed that owns its scroll (a virtualised list with pull to refresh, features/library/notes): the search
// row and the tabs stay at the top, in the same place and the same size, and NotesTab fills the box under them, edge to edge.
//
// The Bible tab, top to bottom: the card that continues the chapter read last (only when something was read), the compact daily reading banner, the
// choice of the part (Old Testament, Deuterocanon, New Testament: a segmented pill in the page, not a floating bar) and the books of that part as tiles.
// A tile opens the chapters of the book (/library/bible/<code>), and a chapter opens the reader (/library/bible/<code>/<chapter>). The Bible is real; the
// Books tab holds example rows until we have chosen what we may include (features/library/sample.ts) and says so. Notes is real too: written and kept
// on this phone (features/diary). On Notes the gold pen writes a note; nothing else floats.

// Read by a screen reader (the heading of the screen, "Library") and not drawn: there is no title on the screen, the search field is the
// first thing. 1 x 1 and clipped, with see-through letters, and not opacity 0 or hidden: VoiceOver and TalkBack leave a view that is
// not visible out, and then there would be no heading to jump to.
const VISUALLY_HIDDEN = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', color: 'transparent' } as const;

export default function Library() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<LibraryTab>('Bible');
  const [testament, setTestament] = useState<Testament>('old');
  const [query, setQuery] = useState('');
  const marks = useLibraryBookmarks();
  const lastRead = useLastRead();
  const searching = isSearching(query);
  // What a result of the Bible opens, the same in both hosts (the results are drawn on Notes too): a book its chapters, a verse the reader at it.
  const openBook = (code: string) => router.push(bookHref(code));
  const openVerse = (ref: Ref) => router.push(readerHref(ref));
  // The top of the screen, the same in both hosts: the heading for a screen reader, the search row, a message when a bookmark could not be kept, the tabs.
  const top = (
    <>
      <AppText accessibilityRole="header" style={VISUALLY_HIDDEN}>Library</AppText>
      <LibraryHeader query={query} onQuery={setQuery} onBookmarks={() => router.push('/library/bookmarks')} onSearchFocus={prepareSearch} />
      {marks.failed && <FormMessage>{BOOKMARK_NOT_SAVED}</FormMessage>}
      {!searching && <SubTabs tabs={LIBRARY_TABS} value={tab} onChange={setTab} />}
    </>
  );

  if (tab === 'Notes') {
    // The pinned host is used for Notes also while something is typed, so the search field stays the same element: a field that moves to another
    // parent when the first letter arrives is made again, and the keyboard goes away. The results take the place of the feed, in a scroll view of
    // their own that is set up like Screen's (a tap on a button works while the keyboard is up, a scroll closes it), and the pen is not drawn over them.
    return (
      <View style={{ flex: 1, backgroundColor: role.bg }}>
        <View style={{ paddingTop: insets.top + layout.screenTop, paddingHorizontal: layout.screenMargin, paddingBottom: 16, gap: 16 }}>{top}</View>
        {searching ? (
          <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingHorizontal: layout.screenMargin, paddingBottom: layout.tabbarHeight + insets.bottom + 40, gap: 16 }}>
            <SearchResults query={query} marks={marks} onClear={() => setQuery('')} onOpenBook={openBook} onOpenVerse={openVerse} />
          </ScrollView>
        ) : (
          <View style={{ flex: 1 }}><NotesTab /></View>
        )}
        {!searching && <Fab label="Write a note" icon="compose" onPress={() => router.push('/diary/new')} />}
      </View>
    );
  }
  return (
    <Screen keyboard>
      {top}
      {searching ? (
        <SearchResults query={query} marks={marks} onClear={() => setQuery('')} onOpenBook={openBook} onOpenVerse={openVerse} />
      ) : (
        <>
          {tab === 'Bible' && lastRead.place && <ContinueCard place={lastRead.place} onOpen={() => router.push(readerHref({ code: lastRead.place!.code, chapter: lastRead.place!.chapter }))} />}
          {tab === 'Bible' && <DailyBanner onOpen={() => router.push('/library/daily')} />}
          {tab === 'Bible' && <BibleTab testament={testament} onTestament={setTestament} onOpenBook={(code) => router.push(bookHref(code))} />}
          {tab === 'Books' && <BooksBanner />}
          {tab === 'Books' && <BooksTab marks={marks} />}
        </>
      )}
    </Screen>
  );
}
