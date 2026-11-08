import { LayoutChangeEvent, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { SampleNotice } from '@/components/SampleNotice';
import { Card, SectionLabel } from '@/components/ui';
import { c, fixed, radius, role } from '@/theme';
import { BookmarkToggle } from './BookmarkToggle';
import { DEUTERO_NOTE, TESTAMENT_LABEL, bookLine, booksOf, countLine, type BibleBook, type Testament } from './bible/books';
import { BOOK_CATALOG, bookByline, type CatalogBook } from './books/catalog';
import { PREVIEW_NOTICE, type SampleTab } from './sample';
import { hitTabs, itemKey, type Hits } from './search';
import type { LibraryMarks } from './useLibraryBookmarks';

// The two Library tabs that hold rows: Bible (the books of the Bible, one part at a time) and Books (twelve free classics). There is no
// real text yet (see sample.ts), so each tab starts with an honest notice and then shows, with rows that say "Soon", what will be
// there. The third tab, Notes, is the diary and lives in features/library/notes. Colours are read while drawing, never at import.
//
// A row can carry a bookmark button (when `marks` is given): the button is its own component, so a row stays a plain picture of
// what will be there. The rows of one tab are also what a search result and the Bookmarks screen draw (LibraryGroups), so a row
// looks the same wherever it is. The banners, which can be pressed, are in LibraryBanner.tsx, and the three choices of the Bible
// tab in bible/TestamentBar.tsx: nothing in this file acts when it is touched except the bookmark.

const Notice = ({ tab }: { tab: SampleTab }) => <SampleNotice title="Preview">{PREVIEW_NOTICE[tab]}</SampleNotice>;

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

const Mark = ({ marks, tab, id, title, color }: { marks?: LibraryMarks; tab: SampleTab; id: string; title: string; color?: string }) => {
  if (!marks) return null;
  const key = itemKey(tab, id);
  return <BookmarkToggle on={marks.has(key)} title={title} toggle={() => marks.toggle(key)} color={color} />;
};

/**
 * The books of the Bible, one under the other: the name, "50 chapters" and the "Soon" chip, and the bookmark button. `withPart` puts the
 * part (Old Testament, Deuterocanon, New Testament) in front of the chapters, for a list that mixes the three (search, Bookmarks).
 */
export function BibleBookRows({ items, marks, withPart = false }: { items: readonly BibleBook[]; marks?: LibraryMarks; withPart?: boolean }) {
  return (
    <Card style={{ padding: 4 }}>
      {items.map((b, i) => (
        <View key={b.id} accessibilityState={marks ? undefined : { disabled: true }} style={{ ...rowStyle(i === 0, marks), minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <AppText variant="label">{b.name}</AppText>
            {/* The chip sits beside "50 chapters" and goes under the line when the line is long (the part is in it, or a detail): in one list all the rows do the same. */}
            <View style={{ flexDirection: withPart || b.detail ? 'column' : 'row', alignItems: withPart || b.detail ? 'flex-start' : 'center', gap: withPart || b.detail ? 6 : 8 }}>
              <AppText variant="caption" muted>{bookLine(b, withPart)}</AppText>
              <Soon />
            </View>
          </View>
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
 * The rows of a list of results, group after group in the order of the tabs, each under its own label ("Bible · 2"). What a search
 * and the Bookmarks screen show; a tab that has no row in it is not drawn.
 */
export function LibraryGroups({ hits, marks }: { hits: Hits; marks: LibraryMarks }) {
  return (
    <>
      {hitTabs(hits).map((tab) => (
        <View key={tab} style={{ gap: 16 }}>
          <SectionLabel>{`${tab} · ${hits[tab].length}`}</SectionLabel>
          {tab === 'Bible' && <BibleBookRows items={hits.Bible} marks={marks} withPart />}
          {tab === 'Books' && <BookRows items={hits.Books} marks={marks} />}
        </View>
      ))}
    </>
  );
}

/**
 * The Bible tab under its banner: the Preview notice, then "Books of the Bible" with how many the chosen part holds, and the books of
 * that part (and, for the Deuterocanon, the one line about the Orthodox Bibles). The part is chosen with the three choices at the bottom
 * of the screen (bible/TestamentBar.tsx), which the screen draws. The notice and the list are both children of the screen's own column
 * (a fragment, not a wrapper), so `onListLayout` tells the screen where the list starts in it: where to scroll back to when another part
 * is chosen.
 */
export function BibleTab({ marks, testament, onListLayout }: { marks?: LibraryMarks; testament: Testament; onListLayout?: (e: LayoutChangeEvent) => void }) {
  return (
    <>
      <Notice tab="Bible" />
      <View onLayout={onListLayout} style={{ gap: 16 }}>
        <View style={{ gap: 4 }}>
          <AppText variant="h4" accessibilityRole="header">Books of the Bible</AppText>
          {/* A polite live region: a screen reader says the new part and count when a choice at the bottom is made. */}
          <AppText variant="small" muted accessibilityLiveRegion="polite">{`${TESTAMENT_LABEL[testament]} · ${countLine(testament)}`}</AppText>
        </View>
        <BibleBookRows items={booksOf(testament)} marks={marks} />
        {testament === 'deutero' && <AppText variant="caption" muted>{DEUTERO_NOTE}</AppText>}
      </View>
    </>
  );
}

/** The Books tab under its banner: the Preview notice and the twelve books. */
export function BooksTab({ marks }: { marks?: LibraryMarks }) {
  return (
    <View style={{ gap: 16 }}>
      <Notice tab="Books" />
      <BookRows items={BOOK_CATALOG} marks={marks} />
    </View>
  );
}
