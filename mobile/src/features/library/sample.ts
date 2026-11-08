// What is real in the Library and what is still an example.
//
// The Bible is real: the World English Bible, Catholic edition (eBible.org, public domain), 73 books, all in the app, so it works with no signal. The
// Bible tab lists its books as tiles, a book opens its chapters, a chapter opens its words (features/library/bible), and a search finds its verses.
// The Books tab is still a preview: it lists twelve free classics, but none of them opens (we are checking the editions first), every row says "Soon",
// and the tab and the search say so (SampleNotice). The daily reading is a sample as well (features/library/daily): which readings we may print is
// not decided, and the text of the Bible here is not the one read at Mass. Nothing here is fetched.
//
// Notes, the third tab, is the diary: real, written on this phone (features/library/notes, features/diary), so it has no notice, no bookmarks and no
// part in the search. `RowTab` is the two tabs that hold rows a pilgrim can bookmark and search.
//
// Plain data on purpose: no theme colours are read here (a colour read at import would never follow light/dark).

export const LIBRARY_TABS = ['Bible', 'Books', 'Notes'] as const;
export type LibraryTab = (typeof LIBRARY_TABS)[number];

/** The tabs that hold rows: the ones that can be searched and bookmarked, and show up in the Bookmarks screen. */
export const ROW_TABS = ['Bible', 'Books'] as const;
export type RowTab = (typeof ROW_TABS)[number];

/** The one line the Bible tab says about its words, quiet, under its heading. */
export const BIBLE_SOURCE_LINE = 'World English Bible, Catholic edition · public domain';

/** Why the Books tab has no text today, in the words the person reads. The Bible tab has no notice any more: its text is in the app. */
export const BOOKS_NOTICE = 'Books are not in the app yet. We are checking the editions before we add them.';

/**
 * The one Preview notice of a search, shown when books of the Books tab are among the results: those are the examples of that tab, and nothing of
 * them opens. What is found in the Bible (verses and books) is real and has no notice.
 */
export const SEARCH_NOTICE = 'The twelve books are examples: they are not in the app yet. The Bible text is.';

/** The same, for the Bookmarks screen, when a book of the Books tab is among the bookmarks. */
export const BOOKMARKS_NOTICE = 'The twelve books are examples: they are not in the app yet. Bookmarks are kept only on this phone, and logging out clears them.';

/** What the Bookmarks screen says under the Library rows when none of them is a book of the Books tab: where they are kept. */
export const BOOKMARKS_KEPT = 'Kept only on this phone. Logging out clears them.';
