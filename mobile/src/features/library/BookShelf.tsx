import { Pressable, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { fixed, radius } from '@/theme';
import { coverTitleSize, unbreakableCaption, type LibraryBook } from './books';
import { BookmarkToggle } from './BookmarkToggle';
import { itemKey } from './search';
import type { LibraryMarks } from './useLibraryBookmarks';

/** The route of a book's own screen. */
export const bookRoute = (id: string) => `/library/book/${id}`;

/**
 * The covers of the real books, two across: what the Books tab, a search and the Bookmarks screen draw. A cover is a button that opens the book
 * (the bookmark button sits over its corner, as a sibling, never inside the cover's own press). A cover is a pale picture colour that does not
 * change with light and dark, so what is on it is the fixed navy. Under it, what the book is and how long it reads ("Guide · 3 h 20 min").
 */
export function BookCovers({ items, marks }: { items: readonly LibraryBook[]; marks?: LibraryMarks }) {
  const router = useRouter();
  // Two covers across the screen with its margins and the gap between them, and 14 of padding inside each: the room a title has.
  const room = Math.floor((useWindowDimensions().width - 32 - 12) / 2) - 28;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      {items.map((b) => {
        const key = itemKey('Books', b.id);
        return (
          <View key={b.id} style={{ flexBasis: '47%', flexGrow: 1, gap: 8 }}>
            <View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${b.title}. ${b.kind}`}
                accessibilityHint="Opens the book"
                onPress={() => router.push(bookRoute(b.id))}
                style={({ pressed }) => ({ aspectRatio: 3 / 4, borderRadius: radius.md, backgroundColor: fixed[b.colour], padding: 14, justifyContent: 'space-between', opacity: pressed ? 0.88 : 1 })}
              >
                <Icon name={b.icon} color={fixed.blue} size={28} />
                <CoverTitle title={b.title} room={room} />
              </Pressable>
              {!!marks && (
                <View style={{ position: 'absolute', top: 4, right: 4 }}>
                  <BookmarkToggle on={marks.has(key)} title={b.title} toggle={() => marks.toggle(key)} color={fixed.blue} />
                </View>
              )}
            </View>
            <AppText variant="caption" muted>{unbreakableCaption(b.kind)}</AppText>
          </View>
        );
      })}
      {/* An odd last cover keeps its half of the row instead of growing to fill it. */}
      {items.length % 2 === 1 && <View style={{ flexBasis: '47%', flexGrow: 1 }} />}
    </View>
  );
}

/** The title on a cover, in the app's title style, a little smaller where its longest word would not fit. */
function CoverTitle({ title, room }: { title: string; room: number }) {
  const size = coverTitleSize(title, room);
  return <AppText variant="h4" color={fixed.blue} style={{ fontSize: size, lineHeight: Math.round(size * 1.25) }}>{title}</AppText>;
}
