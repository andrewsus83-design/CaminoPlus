import { memo } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { AppText } from '@/components/AppText';
import { radius, role, shadowStyle } from '@/theme';
import type { BibleBook } from './books';
import { chapterGrid } from './gridMath';

/** What a screen reader says for the tile of a chapter: "Psalm 121" for the Psalms, "Chapter 3" for every other book. */
export const chapterTileLabel = (book: BibleBook, n: number): string => (book.code === 'PSA' ? `Psalm ${n}` : `Chapter ${n}`);

type TileProps = { book: BibleBook; n: number; tile: number; onOpen: (n: number) => void };

/**
 * The tile of one chapter: a square button with its number in JetBrains Mono (the chapter numbers are data), never under 56 (gridMath.ts). The number
 * is held to 1.3 times its size by maxFontSizeMultiplier, so that three digits ("150") still fit a tile of 56 at the largest text.
 */
const ChapterTile = memo(function ChapterTile({ book, n, tile, onOpen }: TileProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={chapterTileLabel(book, n)}
      onPress={() => onOpen(n)}
      style={({ pressed }) => ({
        width: tile, height: tile, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm,
        backgroundColor: pressed ? role.sunken : role.surface, borderWidth: 1, borderColor: role.border, ...shadowStyle('sm'),
      })}
    >
      <AppText variant="mono" maxFontSizeMultiplier={1.3} numberOfLines={1} style={{ fontSize: 20, lineHeight: 26 }}>{n}</AppText>
    </Pressable>
  );
});

/** The chapters of a book as a grid of square tiles: 4 in a row on a 320 wide phone, 5 on 390, 6 on 430 (gridMath.ts), as many rows as the book needs (the Psalms have 150). */
export function ChapterNumbers({ book, onOpen }: { book: BibleBook; onOpen: (n: number) => void }) {
  const { width } = useWindowDimensions();
  const grid = chapterGrid(width);
  const numbers = Array.from({ length: book.chapters }, (_, i) => i + 1);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: grid.gap }}>
      {numbers.map((n) => <ChapterTile key={n} book={book} n={n} tile={grid.tile} onOpen={onOpen} />)}
    </View>
  );
}
