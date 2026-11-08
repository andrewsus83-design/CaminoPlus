import { memo } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { AppText } from '@/components/AppText';
import { radius, role, shadowStyle } from '@/theme';
import { chaptersLabel, type BibleBook } from './books';
import { bookGrid, type BookGrid } from './gridMath';
import { TEXT_SCALE_CAP, fitCount, fitName } from './tileFit';

/** What a screen reader says for a tile: "Genesis, 50 chapters". */
export const tileLabel = (b: BibleBook): string => `${b.name}, ${chaptersLabel(b.chapters).replace(/\u00a0/g, ' ')}`;

type TileProps = { book: BibleBook; grid: BookGrid; fontScale: number; onOpen: (code: string) => void };

/**
 * One book: a square tile, ONE button for a screen reader ("Genesis, 50 chapters"). The name is the hero of the tile, in Fraunces, the title font, on one
 * line or two (a number in front of a name stands on a line of its own), 24 where it fits and as large as fits where it does not, and never under 11 (tileFit.ts
 * has the sums, and the width of every letter of the font); under it, at the bottom, the chapters in small JetBrains Mono. There is no bookmark here: the 44 touch target of one does not fit
 * a square of about 90, so a book is bookmarked on its own screen, and a bookmarked book is a row of Bookmarks. Colours are roles: the card colour
 * with the border of a card, and the sunken colour while it is pressed.
 */
const BookTile = memo(function BookTile({ book, grid, fontScale, onOpen }: TileProps) {
  const name = fitName(book.name, grid.innerWidth, fontScale);
  const count = fitCount(chaptersLabel(book.chapters), grid.innerWidth, fontScale);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tileLabel(book)}
      onPress={() => onOpen(book.code)}
      style={({ pressed }) => ({
        width: grid.tile, height: grid.tile, paddingHorizontal: grid.padX, paddingVertical: grid.padY, justifyContent: 'space-between', borderRadius: radius.md,
        backgroundColor: pressed ? role.sunken : role.surface, borderWidth: 1, borderColor: role.border, ...shadowStyle('sm'),
      })}
    >
      <AppText
        variant="h4"
        maxFontSizeMultiplier={TEXT_SCALE_CAP}
        numberOfLines={name.lines.length}
        style={{ fontSize: name.size, lineHeight: name.lineHeight, letterSpacing: name.tracking }}
      >
        {name.lines.join('\n')}
      </AppText>
      <AppText
        variant="mono"
        muted
        maxFontSizeMultiplier={TEXT_SCALE_CAP}
        numberOfLines={1}
        style={{ fontSize: count.size, lineHeight: count.lineHeight }}
      >
        {chaptersLabel(book.chapters)}
      </AppText>
    </Pressable>
  );
});

/**
 * The books of a part as a grid of square tiles, three in a row between the side margins (gridMath.ts: the tile is as wide as a third of what is left
 * after the margins and the two gaps, 12 apart, 8 under 352 wide). It is a plain wrapping row, not a list: 39 tiles at most, and the screen scrolls it
 * with the rest of the page.
 */
export function BibleBookGrid({ books, onOpen }: { books: readonly BibleBook[]; onOpen: (code: string) => void }) {
  const { width, fontScale } = useWindowDimensions();
  const grid = bookGrid(width);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: grid.gap }}>
      {books.map((b) => <BookTile key={b.id} book={b} grid={grid} fontScale={fontScale} onOpen={onOpen} />)}
    </View>
  );
}
