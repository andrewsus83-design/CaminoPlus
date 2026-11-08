import { Pressable, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Card, SectionLabel } from '@/components/ui';
import { role } from '@/theme';
import { BookmarkToggle } from './BookmarkToggle';
import { BibleBookGrid } from './bible/BookGrid';
import { TestamentBar } from './bible/TestamentBar';
import { VerseRowList } from './bible/VerseRows';
import { ADDITIONS_NOTE, DEUTERO_NOTE, TESTAMENT_LABEL, bookLine, booksOf, chaptersLabel, countLine, partWords, type BibleBook, type Testament } from './bible/books';
import type { Ref } from './bible/ref';
import { VERSES_CAPPED_NOTE, versesLabel } from './bible/verseRows';
import { BOOK_CATALOG } from './books/catalog';
import { BookRows } from './books/BookRows';
import { BooksGrid } from './books/BooksGrid';
import { BooksNotice } from './books/BooksNotice';
import { BIBLE_SOURCE_LINE, type RowTab } from './sample';
import { hitGroups, itemKey, type Hits } from './search';
import type { LibraryMarks } from './useLibraryBookmarks';

// The two Library tabs that hold rows: Bible (the books of the Bible, one part at a time, as a grid of square tiles) and Books (twelve free classics, as a grid
// of A5 covers, books/BooksGrid.tsx). The Bible is real: its text is in the app (see sample.ts). The Books tab has the text of the books whose edition is
// confirmed, and says "Soon" on the others, with a notice that says so honestly (books/BooksNotice.tsx). The third tab, Notes, is the diary and lives in
// features/library/notes. Colours are read while drawing, never at import.
//
// A row can carry a bookmark button (when `marks` is given): the button is its own component. The rows of a book of the Bible and of the twelve books are also
// what a search result and the Bookmarks screen draw (LibraryGroups), where a tap opens the book (books/BookRows.tsx for the twelve). The banners are in
// LibraryBanner.tsx (the Bible tab's) and books/BooksBanner.tsx (the Books tab's).

/** The padding of a row: 16 at the start, and 6 at the end when the bookmark button (44 wide) is there. */
const rowStyle = (first: boolean, marks?: LibraryMarks) => ({
  paddingLeft: 16, paddingRight: marks ? 6 : 16, paddingVertical: 10,
  borderTopWidth: first ? 0 : 1, borderTopColor: role.border,
});

const Mark = ({ marks, tab, id, title, color }: { marks?: LibraryMarks; tab: RowTab; id: string; title: string; color?: string }) => {
  if (!marks) return null;
  const key = itemKey(tab, id);
  return <BookmarkToggle on={marks.has(key)} title={title} toggle={() => marks.toggle(key)} color={color} />;
};

/** The line under the name of a book of the Bible in a list that mixes the parts: "Old Testament · 150 chapters · detail". The count is data, so it is in JetBrains Mono; the rest is Inter. */
const BibleBookLine = ({ book, withPart }: { book: BibleBook; withPart: boolean }) => (
  <AppText variant="caption" muted>
    {withPart ? `${partWords(book)} · ` : ''}
    <AppText variant="mono" muted style={{ fontSize: 14, lineHeight: 21 }}>{chaptersLabel(book.chapters)}</AppText>
    {book.detail ? ` · ${book.detail}` : ''}
  </AppText>
);

/**
 * The books of the Bible as rows, one under the other, for a list of results or of Bookmarks (the Bible tab itself shows them as tiles): the name in
 * Fraunces, "Old Testament · 50 chapters" under it, the bookmark button at the end. The row is ONE button that opens the chapters of the book (`onOpen` says
 * where); the bookmark button is another beside it, not inside it. `withPart` puts the part (Old Testament, Deuterocanon, New Testament) in front of the chapters.
 */
export function BibleBookRows({ items, marks, withPart = false, onOpen }: { items: readonly BibleBook[]; marks?: LibraryMarks; withPart?: boolean; onOpen: (code: string) => void }) {
  return (
    <Card style={{ padding: 4 }}>
      {items.map((b, i) => (
        <View key={b.id} style={{ ...rowStyle(i === 0, marks), minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${b.name}, ${bookLine(b, withPart).replace(/\u00a0/g, ' ')}`} accessibilityHint="Opens the chapters" onPress={() => onOpen(b.code)} style={{ flex: 1, minWidth: 0, gap: 2, paddingVertical: 6 }}>
            <AppText variant="h4" style={{ fontSize: 20, lineHeight: 26 }}>{b.name}</AppText>
            <BibleBookLine book={b} withPart={withPart} />
          </Pressable>
          <Mark marks={marks} tab="Bible" id={b.id} title={b.name} />
        </View>
      ))}
    </Card>
  );
}

/**
 * The rows of a list of results, group after group (the books of the Bible, the twelve books, the verses), each under its own label ("Bible · 2",
 * "Verses · 12"). What a search and the Bookmarks screen show; a group that has no row in it is not drawn. A tap on a book of the Bible opens its chapters
 * and a tap on a verse opens the reader at it: the screen says where (`onOpenBook`, `onOpenVerse`). A tap on one of the twelve books opens its page.
 */
export function LibraryGroups({ hits, marks, onOpenBook, onOpenVerse, versesCapped = false }: { hits: Hits; marks: LibraryMarks; onOpenBook: (code: string) => void; onOpenVerse: (ref: Ref) => void; versesCapped?: boolean }) {
  return (
    <>
      {hitGroups(hits).map((group) => (
        <View key={group} style={{ gap: 16 }}>
          <SectionLabel>{group === 'Verses' ? versesLabel(hits.Verses.length, versesCapped) : `${group} · ${hits[group].length}`}</SectionLabel>
          {group === 'Bible' && <BibleBookRows items={hits.Bible} marks={marks} withPart onOpen={onOpenBook} />}
          {group === 'Books' && <BookRows items={hits.Books} marks={marks} />}
          {group === 'Verses' && <VerseRowList rows={hits.Verses} marks={marks} onOpen={onOpenVerse} />}
          {group === 'Verses' && versesCapped && <AppText variant="caption" muted>{VERSES_CAPPED_NOTE}</AppText>}
        </View>
      ))}
    </>
  );
}

/**
 * The Bible tab under its banner: the choice of the part (Old Testament, Deuterocanon, New Testament, a segmented pill that scrolls with the page), then
 * "Books of the Bible" with how many the chosen part holds, the one quiet line that says which translation it is, and the books of that part as a grid of
 * square tiles, three in a row. Under the Deuterocanon, where a reader looks for Susanna, two lines: where the Greek additions of Esther and Daniel are, and the
 * one about the Orthodox Bibles. A tap on a tile opens the chapters of the book (the screen says where: `onOpenBook`). The count is a polite live region that says
 * the part with it: a screen reader answers a choice with "Old Testament, 39 books".
 */
export function BibleTab({ testament, onTestament, onOpenBook }: { testament: Testament; onTestament: (t: Testament) => void; onOpenBook: (code: string) => void }) {
  return (
    <>
      <TestamentBar value={testament} onChange={onTestament} />
      <View style={{ gap: 16 }}>
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 12, rowGap: 2 }}>
            <AppText variant="h4" accessibilityRole="header">Books of the Bible</AppText>
            <AppText variant="mono" muted accessibilityLiveRegion="polite" accessibilityLabel={`${TESTAMENT_LABEL[testament]}, ${countLine(testament)}`} style={{ fontSize: 14, lineHeight: 20 }}>{countLine(testament)}</AppText>
          </View>
          <AppText variant="caption" muted>{BIBLE_SOURCE_LINE.replace('public domain', 'public\u00a0domain')}</AppText>
        </View>
        <BibleBookGrid books={booksOf(testament)} onOpen={onOpenBook} />
        {testament === 'deutero' && <AppText variant="caption" muted>{ADDITIONS_NOTE}</AppText>}
        {testament === 'deutero' && <AppText variant="caption" muted>{DEUTERO_NOTE}</AppText>}
      </View>
    </>
  );
}

/**
 * The Books tab under its banner: the notice about what is still missing (none once every book has its text), and the twelve books as covers, two in a row,
 * each an A5 page that opens its book (books/BooksGrid.tsx). Whether a book has a text is asked of bookText.ts; nothing about it is kept here.
 */
export function BooksTab({ marks }: { marks?: LibraryMarks }) {
  return (
    <View style={{ gap: 16 }}>
      <BooksNotice />
      <BooksGrid items={BOOK_CATALOG} marks={marks} />
    </View>
  );
}
