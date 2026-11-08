import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { SubTabs } from '@/components/ui';
import { FormMessage } from '@/components/auth/Field';
import { ContinueCard } from '@/features/library/bible/ContinueCard';
import type { Testament } from '@/features/library/bible/books';
import { bookHref, readerHref } from '@/features/library/bible/order';
import type { Ref } from '@/features/library/bible/ref';
import { prepareSearch } from '@/features/library/bible/searchText';
import { useLastRead } from '@/features/library/bible/useLastRead';
import { BooksBanner } from '@/features/library/books/BooksBanner';
import { useBooksReading } from '@/features/library/books/useBooksReading';
import { DailyBanner } from '@/features/library/LibraryBanner';
import { LibraryHeader } from '@/features/library/LibraryHeader';
import { BibleTab, BooksTab } from '@/features/library/LibraryTabs';
import { SearchResults } from '@/features/library/SearchResults';
import { LIBRARY_TABS, asLibraryTab } from '@/features/library/sample';
import { BOOKMARK_NOT_SAVED } from '@/features/library/bookmarks';
import { isSearching } from '@/features/library/search';
import { useLibraryBookmarks } from '@/features/library/useLibraryBookmarks';

// Library: no title. The row on top is a search field and the round Bookmarks button in the corner; directly under it the two tabs, Bible and
// Books, each of which starts with a banner (the Bible one, compact, opens today's reading). The diary is not here: it is the Notes sub-tab of Me.
// While something is typed in the search field, its results (the books of the Bible, the books of the Library and the verses, grouped) take the place of the tabs and
// the banners; clearing it brings them back as they were.
//
// One host for everything: the rows of the tabs and the search results are in the screen's own scroll (Screen), so the search row and the tabs
// scroll away with them.
//
// The Bible tab, top to bottom: the card that continues the chapter read last (only when something was read), the compact daily reading banner, the
// choice of the part (Old Testament, Deuterocanon, New Testament: a segmented pill in the page, not a floating bar) and the books of that part as tiles.
// A tile opens the chapters of the book (/library/bible/<code>), and a chapter opens the reader (/library/bible/<code>/<chapter>). The Bible is real, and so are the
// books of the Books tab (features/library/books). Nothing floats on the Library: there is no gold pen here, writing is on Me.

// Read by a screen reader (the heading of the screen, "Library") and not drawn: there is no title on the screen, the search field is the
// first thing. 1 x 1 and clipped, with see-through letters, and not opacity 0 or hidden: VoiceOver and TalkBack leave a view that is
// not visible out, and then there would be no heading to jump to.
const VISUALLY_HIDDEN = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', color: 'transparent' } as const;

export default function Library() {
  const router = useRouter();
  // The tab on show is always one of the two: a name that is not (kept by an older version that had a Notes tab, or typed in a link) is the first tab.
  const [picked, setTab] = useState<string>(LIBRARY_TABS[0]);
  const tab = asLibraryTab(picked);
  const [testament, setTestament] = useState<Testament>('old');
  const [query, setQuery] = useState('');
  const marks = useLibraryBookmarks();
  const lastRead = useLastRead();
  // Where the person has got to in the books: read here, with the screen, so that the banner of the Books tab says "Continue" from its first frame.
  const booksReading = useBooksReading();
  const searching = isSearching(query);
  // What a result of the Bible opens: a book its chapters, a verse the reader at it.
  const openBook = (code: string) => router.push(bookHref(code));
  const openVerse = (ref: Ref) => router.push(readerHref(ref));
  // The top of the screen: the heading for a screen reader, the search row, a message when a bookmark could not be kept, the tabs.
  const top = (
    <>
      <AppText accessibilityRole="header" style={VISUALLY_HIDDEN}>Library</AppText>
      <LibraryHeader query={query} onQuery={setQuery} onBookmarks={() => router.push('/library/bookmarks')} onSearchFocus={prepareSearch} />
      {marks.failed && <FormMessage>{BOOKMARK_NOT_SAVED}</FormMessage>}
      {!searching && <SubTabs tabs={LIBRARY_TABS} value={tab} onChange={setTab} />}
    </>
  );

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
          {tab === 'Books' && <BooksBanner reading={booksReading} />}
          {tab === 'Books' && <BooksTab marks={marks} />}
        </>
      )}
    </Screen>
  );
}
