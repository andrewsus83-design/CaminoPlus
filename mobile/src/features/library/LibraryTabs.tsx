import { Pressable, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { SampleNotice } from '@/components/SampleNotice';
import { Card, SectionLabel } from '@/components/ui';
import { c, fixed, radius, role } from '@/theme';
import { BookmarkToggle } from './BookmarkToggle';
import { BibleBookGrid } from './bible/BookGrid';
import { TestamentBar } from './bible/TestamentBar';
import { VerseRowList } from './bible/VerseRows';
import { ADDITIONS_NOTE, DEUTERO_NOTE, TESTAMENT_LABEL, bookLine, booksOf, chaptersLabel, countLine, partWords, type BibleBook, type Testament } from './bible/books';
import type { Ref } from './bible/ref';
import { VERSES_CAPPED_NOTE, versesLabel } from './bible/verseRows';
import { BOOK_CATALOG, bookByline, type CatalogBook } from './books/catalog';
import { BIBLE_SOURCE_LINE, BOOKS_NOTICE, type RowTab } from './sample';
import { hitGroups, itemKey, type Hits } from './search';
import type { LibraryMarks } from './useLibraryBookmarks';

// The two Library tabs that hold rows: Bible (the books of the Bible, one part at a time, as a grid of square tiles) and Books (twelve free classics).
// The Bible is real: its text is in the app (see sample.ts). The Books tab is a preview and starts with an honest notice, and its rows say "Soon". The
// third tab, Notes, is the diary and lives in features/library/notes. Colours are read while drawing, never at import.
//
// A row can carry a bookmark button (when `marks` is given): the button is its own component. The rows of a book of the Bible are also what a search
// result and the Bookmarks screen draw (LibraryGroups), where a tap opens the book; the rows of the twelve books are pictures of what will be there.
// The banners are in LibraryBanner.tsx.

const Notice = () => <SampleNotice title="Preview">{BOOKS_NOTICE}</SampleNotice>;

/** A small label on a row, in the style of the "Sample" tag: caps in mono on a pale ground. */
const Chip = ({ label, spoken, bg, fg }: { label: string; spoken: string; bg: string; fg: string }) => (
  <View accessibilityLabel={spoken} style={{ alignSelf: 'flex-start', paddingHorizontal: 10, height: 24, borderRadius: radius.pill, backgroundColor: bg, justifyContent: 'center' }}>
    <AppText variant="mono" color={fg} style={{ fontSize: 12, lineHeight: 16, letterSpacing: 1 }}>{label}</AppText>
  </View>
);

/** The chip that says a row is not available yet. */
const Soon = () => <Chip label="SOON" spoken="Coming soon" bg={role.sunken} fg={role.muted} />;

/** The chip that says a book costs nothing to read. */
const Free = () => <Chip label="FREE" spoken="Free to read" bg={c.successWash} fg={c.success} />;

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
 * The books of the Books tab, one under the other: a cover (a pale colour with a glyph, which does not change with light and dark, so
 * what is on it is the fixed navy), the title, "author · era", the bookmark button; under them the blurb and the chips "Free" and "Soon".
 * Nothing of a book is shown but this: the group, the source and the licence notes of the catalog are data for later.
 */
export function BookRows({ items, marks }: { items: readonly CatalogBook[]; marks?: LibraryMarks }) {
  return (
    <Card style={{ padding: 4 }}>
      {items.map((b, i) => (
        <View key={b.id} accessibilityState={marks ? undefined : { disabled: true }} style={{ ...rowStyle(i === 0, marks), paddingTop: 14, paddingBottom: 14, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
            <View aria-hidden style={{ width: 52, height: 68, borderRadius: radius.xs, backgroundColor: fixed[b.cover], alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={b.icon} color={fixed.blue} size={26} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <AppText variant="label">{b.title}</AppText>
              <AppText variant="caption" muted>{bookByline(b)}</AppText>
            </View>
            <Mark marks={marks} tab="Books" id={b.id} title={b.title} />
          </View>
          <AppText variant="small">{b.blurb}</AppText>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Free />
            <Soon />
          </View>
        </View>
      ))}
    </Card>
  );
}

/**
 * The rows of a list of results, group after group (the books of the Bible, the twelve books, the verses), each under its own label ("Bible · 2",
 * "Verses · 12"). What a search and the Bookmarks screen show; a group that has no row in it is not drawn. A tap on a book of the Bible opens its chapters
 * and a tap on a verse opens the reader at it: the screen says where (`onOpenBook`, `onOpenVerse`). The twelve books open nothing.
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

/** The Books tab under its banner: the Preview notice and the twelve books. */
export function BooksTab({ marks }: { marks?: LibraryMarks }) {
  return (
    <View style={{ gap: 16 }}>
      <Notice />
      <BookRows items={BOOK_CATALOG} marks={marks} />
    </View>
  );
}
