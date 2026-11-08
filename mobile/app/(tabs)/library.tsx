import { ComponentRef, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { SubTabs } from '@/components/ui';
import { FormMessage } from '@/components/auth/Field';
import { BAR_ROOM, TestamentBar } from '@/features/library/bible/TestamentBar';
import type { Testament } from '@/features/library/bible/books';
import { BooksBanner, DailyBanner } from '@/features/library/LibraryBanner';
import { LibraryHeader } from '@/features/library/LibraryHeader';
import { BibleTab, BooksTab } from '@/features/library/LibraryTabs';
import { SearchResults } from '@/features/library/SearchResults';
import { LIBRARY_TABS, asLibraryTab } from '@/features/library/sample';
import { BOOKMARK_NOT_SAVED } from '@/features/library/bookmarks';
import { isSearching } from '@/features/library/search';
import { useLibraryBookmarks } from '@/features/library/useLibraryBookmarks';

// Library: no title. The row on top is a search field and the round Bookmarks button in the corner; directly under it the two tabs, Bible and
// Books, each of which starts with a banner (the Bible one opens today's reading). The diary is not here: it is the Notes sub-tab of Me.
// While something is typed in the search field, its results (Bible and Books at once, grouped by tab) take the place of the tabs and the
// banners; clearing it brings them back as they were.
//
// One host for everything: the rows of the tabs and the search results are in the screen's own scroll (Screen), so the search row and the tabs
// scroll away with them.
//
// What floats at the bottom depends on the tab, and only one thing at a time: on Bible the three choices Old Testament, Deuterocanon and
// New Testament sit just above the tab bar (and the list ends with room for them); on Books nothing. They do not show while search results
// do. There is no gold pen on the Library: writing is on Me. The Bible and Books tabs hold example rows until we have chosen what we may
// include (see features/library/sample.ts); each tab and the search say so.

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
  const searching = isSearching(query);
  // Choosing another part of the Bible from deep in the list brings the list back to its first books; from the top of the screen nothing moves.
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const offset = useRef(0);
  const listTop = useRef(0);
  const choose = (t: Testament) => {
    setTestament(t);
    if (offset.current > listTop.current) scroller.current?.scrollTo({ y: Math.max(listTop.current - 8, 0), animated: false });
  };
  // The top of the screen: the heading for a screen reader, the search row, a message when a bookmark could not be kept, the tabs.
  const top = (
    <>
      <AppText accessibilityRole="header" style={VISUALLY_HIDDEN}>Library</AppText>
      <LibraryHeader query={query} onQuery={setQuery} onBookmarks={() => router.push('/library/bookmarks')} />
      {marks.failed && <FormMessage>{BOOKMARK_NOT_SAVED}</FormMessage>}
      {!searching && <SubTabs tabs={LIBRARY_TABS} value={tab} onChange={setTab} />}
    </>
  );

  return (
    <View style={{ flex: 1 }}>
      <Screen keyboard scrollRef={scroller} onScroll={(e) => { offset.current = e.nativeEvent.contentOffset.y; }}>
        {top}
        {searching ? (
          <SearchResults query={query} marks={marks} onClear={() => setQuery('')} />
        ) : (
          <>
            {tab === 'Bible' && <DailyBanner onOpen={() => router.push('/library/daily')} />}
            {tab === 'Bible' && <BibleTab marks={marks} testament={testament} onListLayout={(e) => { listTop.current = e.nativeEvent.layout.y; }} />}
            {tab === 'Bible' && <View style={{ height: BAR_ROOM }} />}
            {tab === 'Books' && <BooksBanner />}
            {tab === 'Books' && <BooksTab marks={marks} />}
          </>
        )}
      </Screen>
      {!searching && tab === 'Bible' && <TestamentBar value={testament} onChange={choose} />}
    </View>
  );
}
