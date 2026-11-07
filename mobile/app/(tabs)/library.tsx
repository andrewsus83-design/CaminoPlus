import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Fab } from '@/components/Fab';
import { PromoBanner } from '@/components/PromoBanner';
import { SubTabs } from '@/components/ui';
import { FormMessage } from '@/components/auth/Field';
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
// The tabs hold example content until we have chosen what we may include (see features/library/sample.ts); each tab and the search
// say so. The diary is real: it is written and kept on this phone (features/diary), and its card is gone from here, the button leads to it.

// Read by a screen reader (the heading of the screen, "Library") and not drawn: there is no title on the screen, the search field is the first thing.
const VISUALLY_HIDDEN = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 } as const;

export default function Library() {
  const router = useRouter();
  const [tab, setTab] = useState<LibraryTab>('Bible');
  const [query, setQuery] = useState('');
  const marks = useLibraryBookmarks();
  return (
    <View style={{ flex: 1 }}>
      <Screen keyboard>
        <AppText accessibilityRole="header" style={VISUALLY_HIDDEN}>Library</AppText>
        <LibraryHeader query={query} onQuery={setQuery} onBookmarks={() => router.push('/library/bookmarks')} onDiary={() => router.push('/diary')} />
        {marks.failed && <FormMessage>{BOOKMARK_NOT_SAVED}</FormMessage>}
        {isSearching(query) ? (
          <SearchResults query={query} marks={marks} onClear={() => setQuery('')} />
        ) : (
          <>
            <PromoBanner promos={[
              { id: 'bible', eyebrow: 'Preview · Bible', title: 'Scripture for the long road', cta: 'See the Bible tab', icon: 'book', onPress: () => setTab('Bible') },
              { id: 'books', eyebrow: 'Preview · Books', title: 'Guides and stories from the Way', cta: 'See the Books tab', icon: 'library', onPress: () => setTab('Books') },
              { id: 'music', eyebrow: 'Preview · Music', title: 'Songs for the walk', cta: 'See the Music tab', icon: 'music', onPress: () => setTab('Music') },
            ]} />
            <SubTabs tabs={LIBRARY_TABS} value={tab} onChange={setTab} />
            {tab === 'Bible' && <BibleTab marks={marks} />}
            {tab === 'Books' && <BooksTab marks={marks} />}
            {tab === 'Music' && <MusicTab marks={marks} />}
          </>
        )}
      </Screen>
      <Fab label="Write in your diary" icon="compose" onPress={() => router.push('/diary/new')} />
    </View>
  );
}
