import { memo, useMemo } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { AppText } from '@/components/AppText';
import { radius, role, shadowStyle } from '@/theme';
import { chaptersLabel, type BibleBook } from './books';
import { bookGrid, type BookGrid } from './gridMath';
import { fitName } from './tileFit';

/** What a screen reader says for a tile: "Genesis, 50 chapters". */
export const tileLabel = (b: BibleBook): string => `${b.name}, ${chaptersLabel(b.chapters).replace(/\u00a0/g, ' ')}`;

type TileProps = { book: BibleBook; grid: BookGrid; onOpen: (code: string) => void };

/**
 * One book: a compact card, ONE button for a screen reader ("Genesis, 50 chapters"). The name is the hero of the tile, in Fraunces, the title font, on one line or two (a
 * number in front of a name stands on a line of its own), and only at the sizes of the type scale: h4 (24) where it fits, else h5 (17), else h6 (15) (tileFit.ts has the sums, and the
 * width of every letter of the font); under it, at the bottom, the chapters in JetBrains Mono at the mono token. The words are space.4 from the hairline (space.3 on a narrow phone),
 * and the tile is as high as its words (gridMath.ts: every number is a token). The words do not grow with the phone's text size: the tile is as high as they are. There is no
 * bookmark here: the 44 touch target of one does not fit a tile this small, so a book is bookmarked on its own screen, and a bookmarked book is a row of Bookmarks. Colours are
 * roles: the card colour with the border of a card, and the sunken colour while it is pressed.
 */
const BookTile = memo(function BookTile({ book, grid, onOpen }: TileProps) {
  const name = fitName(book.name, grid.innerWidth);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tileLabel(book)}
      onPress={() => onOpen(book.code)}
      style={({ pressed }) => ({
        width: grid.tile, height: grid.height, padding: grid.pad, justifyContent: 'space-between', borderRadius: radius.md,
        backgroundColor: pressed ? role.sunken : role.surface, borderWidth: grid.border, borderColor: role.border, ...shadowStyle('sm'),
      })}
    >
      <AppText variant={name.variant} maxFontSizeMultiplier={1} numberOfLines={name.lines.length}>
        {name.lines.join('\n')}
      </AppText>
      <AppText variant="mono" muted maxFontSizeMultiplier={1} numberOfLines={1}>
        {chaptersLabel(book.chapters)}
      </AppText>
    </Pressable>
  );
});

/**
 * The books of a part as a grid of compact tiles, two in a row between the side margins (gridMath.ts: the tile is as wide as half of what is left after the margins and the
 * gap, 12 apart, 8 under 352 wide). It is a plain wrapping row, not a list: 39 tiles at most, and the screen scrolls it with the rest of the page.
 */
export function BibleBookGrid({ books, onOpen }: { books: readonly BibleBook[]; onOpen: (code: string) => void }) {
  const { width } = useWindowDimensions();
  const grid = useMemo(() => bookGrid(width), [width]);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: grid.gap }}>
      {books.map((b) => <BookTile key={b.id} book={b} grid={grid} onOpen={onOpen} />)}
    </View>
  );
}
