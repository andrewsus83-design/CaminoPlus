import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Fab } from '@/components/Fab';
import { PromoBanner } from '@/components/PromoBanner';
import { SubTabs } from '@/components/ui';
import { FormMessage } from '@/components/auth/Field';
import { CATALOG } from '@/features/library/bookBundle';
import { libraryBooks } from '@/features/library/books';
import { LibraryHeader } from '@/features/library/LibraryHeader';
import { BibleTab, BooksTab, MusicTab } from '@/features/library/LibraryTabs';
import { SearchResults } from '@/features/library/SearchResults';
import { LIBRARY_TABS, LibraryTab } from '@/features/library/sample';
import { BOOKMARK_NOT_SAVED } from '@/features/library/bookmarks';
import { isSearching } from '@/features/library/search';
import { useLibraryBookmarks } from '@/features/library/useLibraryBookmarks';

// Library: no title. The row on top is a search field, the round Bookmarks button and the round diary button in the corner; under it a
// banner and three tabs: Bible, Books, Music. The gold pen writes a diary page. While something is typed in the search field, its
// results (all three tabs at once, grouped by tab) take the place of the banner and the tabs; clearing it brings them back as they were.
// The Books tab is real: the books of the bundle (features/library/bookBundle.ts), each cover opens its book. The Bible and Music tabs hold
// example content until we have chosen what we may include (features/library/sample.ts); those two tabs say so, and so does a search or the
// Bookmarks screen while one of their rows is on it. The diary is real: it is written and kept on this phone (features/diary), and its card
// is gone from here, the button leads to it. The Notebook, where the notes on the books are listed, is reached from the Bookmarks screen.

// Read by a screen reader (the heading of the screen, "Library") and not drawn: there is no title on the screen, the search field is the
// first thing. 1 x 1 and clipped, with see-through letters, and not opacity 0 or hidden: VoiceOver and TalkBack leave a view that is
// not visible out, and then there would be no heading to jump to.
const VISUALLY_HIDDEN = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', color: 'transparent' } as const;

export default function Library() {
  const router = useRouter();
  const [tab, setTab] = useState<LibraryTab>('Bible');
  const [query, setQuery] = useState('');
  const marks = useLibraryBookmarks();
  const books = useMemo(() => libraryBooks(CATALOG), []);
  return (
    <View style={{ flex: 1 }}>
      <Screen keyboard>
        <AppText accessibilityRole="header" style={VISUALLY_HIDDEN}>Library</AppText>
        <LibraryHeader query={query} onQuery={setQuery} onBookmarks={() => router.push('/library/bookmarks')} onDiary={() => router.push('/diary')} />
        {marks.failed && <FormMessage>{BOOKMARK_NOT_SAVED}</FormMessage>}
        {isSearching(query) ? (
          <SearchResults query={query} books={books} marks={marks} onClear={() => setQuery('')} />
        ) : (
          <>
            <PromoBanner promos={[
              { id: 'bible', eyebrow: 'Preview · Bible', title: 'Scripture for the long road', cta: 'See the Bible tab', icon: 'book', onPress: () => setTab('Bible') },
              { id: 'books', eyebrow: 'Books', title: 'Guides and readings for the Way', cta: 'See the Books tab', icon: 'library', onPress: () => setTab('Books') },
              { id: 'music', eyebrow: 'Preview · Music', title: 'Songs for the walk', cta: 'See the Music tab', icon: 'music', onPress: () => setTab('Music') },
            ]} />
            <SubTabs tabs={LIBRARY_TABS} value={tab} onChange={setTab} />
            {tab === 'Bible' && <BibleTab marks={marks} />}
            {tab === 'Books' && <BooksTab books={books} marks={marks} />}
            {tab === 'Music' && <MusicTab marks={marks} />}
          </>
        )}
      </Screen>
      <Fab label="Write in your diary" icon="compose" onPress={() => router.push('/diary/new')} />
    </View>
  );
}
