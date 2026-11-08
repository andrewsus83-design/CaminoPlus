import { useCallback, useMemo } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from '@/components/AppText';
import { layout } from '@/theme';
import { itemKey } from '../search';
import type { LibraryMarks } from '../useLibraryBookmarks';
import { BookCover } from './BookCover';
import type { CatalogBook } from './catalog';
import { bookPath, shelves } from './copy';
import { coverGrid } from './cover';

/** The space between two rows of covers. The columns are GRID_GAP apart (12); a row has a little more under it, where the shadow of the covers falls. */
export const ROW_GAP = 16;

/**
 * The books of the Books tab as covers, two in a row, on one shelf for each kind of book (the guides, then the readings, copy.ts shelves), each shelf with a heading, a quiet
 * line and the number of its books. Each cover is an A5 page (cover.ts sizes them from the width of the screen: 173 by 245 on a 390 phone), ONE button that opens the book
 * page, with its ribbon, the bookmark button of the book (kept under "books:<id>", as the rows always were). On a window wider than a phone the covers stop growing and the
 * pair stays in the middle. However many books there are is how many are shown.
 */
export function BooksGrid({ items, marks }: { items: readonly CatalogBook[]; marks?: LibraryMarks }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const grid = coverGrid(width, layout.screenMargin);
  const toggle = marks?.toggle;
  const open = useCallback((id: string) => router.push(bookPath(id)), [router]);
  const bookmark = useCallback((id: string) => toggle?.(itemKey('Books', id)), [toggle]);
  const onShelves = useMemo(() => shelves(items), [items]);
  return (
    <View style={{ gap: 28 }}>
      {onShelves.map((shelf) => (
        <View key={shelf.kind} style={{ gap: 12 }}>
          <View style={{ gap: 2 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 12 }}>
              <AppText variant="h4" accessibilityRole="header">{shelf.title}</AppText>
              <AppText variant="mono" muted style={{ fontSize: 14, lineHeight: 20 }}>{`${shelf.books.length} ${shelf.books.length === 1 ? 'book' : 'books'}`}</AppText>
            </View>
            {!!shelf.line && <AppText variant="caption" muted>{shelf.line}</AppText>}
          </View>
          <View style={{ width: grid.width, alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', columnGap: grid.gap, rowGap: ROW_GAP }}>
            {shelf.books.map((b) => (
              <BookCover
                key={b.id}
                book={b}
                width={grid.tile}
                onOpen={open}
                bookmarked={marks ? marks.has(itemKey('Books', b.id)) : undefined}
                onBookmark={toggle ? bookmark : undefined}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}
