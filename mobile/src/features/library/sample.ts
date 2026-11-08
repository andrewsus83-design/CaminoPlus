// What is real in the Library and what is still an example.
//
// The Bible is real: the World English Bible, Catholic edition (eBible.org, public domain), 73 books, all in the app, so it works with no signal. The
// Bible tab lists its books as tiles, a book opens its chapters, a chapter opens its words (features/library/bible), and a search finds its verses.
// The Books tab lists the books written for the app (the bundle that tools/build_books.py makes from books/): every one has its text in the app and opens in the
// reader, and every book page says how the books were written (books/notices.ts). The daily reading is a sample: which readings we may print is
// not decided, and the text of the Bible here is not the one read at Mass. Nothing here is fetched.
//
// The Library has two tabs, Bible and Books, and no more: the diary is not in the Library. It is the Notes sub-tab of Me (features/notes,
// features/diary), where the pilgrim's own writing sits next to the journey. `RowTab` is the two tabs that hold rows a pilgrim can bookmark and search.
//
// Plain data on purpose: no theme colours are read here (a colour read at import would never follow light/dark).

export const LIBRARY_TABS = ['Bible', 'Books'] as const;
export type LibraryTab = (typeof LIBRARY_TABS)[number];

/**
 * The tab to show for a value that may not be one of the tabs: a name kept by an older version of the app (when there was a third tab, Notes),
 * something typed in a link, nothing at all. Anything that is not exactly the name of a tab is the first tab, so the screen never shows no tab.
 */
export function asLibraryTab(value: unknown): LibraryTab {
  return (LIBRARY_TABS as readonly unknown[]).includes(value) ? (value as LibraryTab) : LIBRARY_TABS[0];
}

/** The tabs that hold rows: the ones that can be searched and bookmarked, and show up in the Bookmarks screen. */
export const ROW_TABS = ['Bible', 'Books'] as const;
export type RowTab = (typeof ROW_TABS)[number];

/** The one line the Bible tab says about its words, quiet, under its heading. */
export const BIBLE_SOURCE_LINE = 'World English Bible, Catholic edition · public domain';

/** What the Bookmarks screen says under the Library rows: where they are kept. */
export const BOOKMARKS_KEPT = 'Kept only on this phone. Logging out clears them.';
