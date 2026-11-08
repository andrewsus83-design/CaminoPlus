import { useCallback } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { layout } from '@/theme';
import { itemKey } from '../search';
import type { LibraryMarks } from '../useLibraryBookmarks';
import { BookCover } from './BookCover';
import { hasBookText } from './bookText';
import type { CatalogBook } from './catalog';
import { bookPath } from './copy';
import { coverGrid } from './cover';

/** The space between two rows of covers. The columns are GRID_GAP apart (12); a row has a little more under it, where the shadow of the covers falls. */
export const ROW_GAP = 16;

/**
 * The books of the Books tab as covers, two in a row: each an A5 page (cover.ts sizes them from the width of the screen: 173 by 245 on a 390 phone), each ONE
 * button that opens the book page, each with its ribbon, the bookmark button of the book (kept under "books:<id>", as the rows always were). On a window wider
 * than a phone the covers stop growing and the pair stays in the middle. A book with no text is a cover like the others, with "Soon" on it.
 */
export function BooksGrid({ items, marks }: { items: readonly CatalogBook[]; marks?: LibraryMarks }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const grid = coverGrid(width, layout.screenMargin);
  const toggle = marks?.toggle;
  const open = useCallback((id: string) => router.push(bookPath(id)), [router]);
  const bookmark = useCallback((id: string) => toggle?.(itemKey('Books', id)), [toggle]);
  return (
    <View style={{ width: grid.width, alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', columnGap: grid.gap, rowGap: ROW_GAP }}>
      {items.map((b) => (
        <BookCover
          key={b.id}
          book={b}
          width={grid.tile}
          hasText={hasBookText(b.id)}
          onOpen={open}
          bookmarked={marks ? marks.has(itemKey('Books', b.id)) : undefined}
          onBookmark={toggle ? bookmark : undefined}
        />
      ))}
    </View>
  );
}
