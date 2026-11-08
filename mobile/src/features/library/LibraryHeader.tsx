import { View } from 'react-native';
import { IconButton } from '@/components/ui';
import { SearchBar } from './SearchBar';

/**
 * The top of the Library, one row and no title: the search field takes the free width, then the round Bookmarks button in the
 * corner. The button is the size and the style of the bell and the gear at the top right of Me (IconButton, 52), 8 from the
 * search field, and it never shrinks or wraps; the search field is what gives way on a narrow phone. The diary has no button here
 * any more: it is the Notes tab, directly under this row.
 * The screen decides where the button leads, so a test can read the route in one file (app/(tabs)/library.tsx). It also decides what happens when the
 * search field is touched (`onSearchFocus`): it gets the search of the Bible ready, so that the first letter does not wait for it.
 */
export function LibraryHeader({ query, onQuery, onBookmarks, onSearchFocus }: { query: string; onQuery: (text: string) => void; onBookmarks: () => void; onSearchFocus?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52 }}>
      <SearchBar value={query} onChangeText={onQuery} onFocus={onSearchFocus} />
      <IconButton name="bookmark" label="Bookmarks" hint="Opens your bookmarks" onPress={onBookmarks} size={52} />
    </View>
  );
}
