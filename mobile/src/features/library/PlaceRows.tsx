import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Card } from '@/components/ui';
import { role } from '@/theme';
import { BookmarkToggle } from './BookmarkToggle';
import type { BookPlace } from './places';
import type { LibraryMarks } from './useLibraryBookmarks';

/** The route of a place in a book: the reader at its chapter, and for a paragraph the block to scroll to. */
export const placeRoute = (p: Pick<BookPlace, 'bookId' | 'chapterId' | 'block'>) => `/library/book/${p.bookId}/${p.chapterId}${p.block === null ? '' : `?block=${p.block}`}`;

/**
 * The chapters, days and paragraphs a pilgrim bookmarked, one row each: what it is (the title of the chapter, or the first words of the
 * paragraph), where it is under that, and the bookmark button at the end. A tap on the row opens the exact place in the reader. The bookmark
 * button is its own button beside the row's, never inside it.
 */
export function PlaceRows({ places, marks }: { places: readonly BookPlace[]; marks: LibraryMarks }) {
  const router = useRouter();
  return (
    <Card style={{ padding: 4 }}>
      {places.map((p, i) => (
        <View key={p.key} style={{ flexDirection: 'row', alignItems: 'center', paddingRight: 6, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: role.border }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${p.title}. ${p.line}`}
            accessibilityHint={p.level === 'paragraph' ? 'Opens this paragraph in the book' : 'Opens this chapter in the book'}
            onPress={() => router.push(placeRoute(p))}
            style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 14, paddingLeft: 16, paddingVertical: 10, opacity: pressed ? 0.8 : 1 })}
          >
            <Icon name={p.level === 'chapter' ? 'library' : 'quote'} color={role.muted} size={24} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant={p.level === 'chapter' ? 'label' : 'small'} numberOfLines={p.level === 'chapter' ? 2 : 3}>{p.title}</AppText>
              <AppText variant="caption" muted numberOfLines={2}>{p.line}</AppText>
            </View>
          </Pressable>
          <BookmarkToggle on={marks.has(p.key)} title={p.title} toggle={() => marks.toggle(p.key)} />
        </View>
      ))}
    </Card>
  );
}
