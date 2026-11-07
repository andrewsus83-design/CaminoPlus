import { View } from 'react-native';
import { IconButton } from '@/components/ui';
import { SearchBar } from './SearchBar';

/**
 * The top of the Library, one row and no title: the search field takes the free width, then the round Bookmarks button, then the
 * round diary button in the corner. The two buttons are the size and the style of the bell and the gear at the top right of Me
 * (IconButton, 52), 8 apart, and they never shrink or wrap; the search field is what gives way on a narrow phone.
 * The screen decides where they lead, so a test can read the routes in one file (app/(tabs)/library.tsx).
 */
export function LibraryHeader({ query, onQuery, onBookmarks, onDiary }: { query: string; onQuery: (text: string) => void; onBookmarks: () => void; onDiary: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52 }}>
      <SearchBar value={query} onChangeText={onQuery} />
      <IconButton name="bookmark" label="Bookmarks" hint="Opens your bookmarks" onPress={onBookmarks} size={52} />
      <IconButton name="diary" label="My diary" hint="Opens your diary" onPress={onDiary} size={52} />
    </View>
  );
}
