// What is real in the Library and what is still an example.
//
// The Bible is real: the World English Bible, Catholic edition (eBible.org, public domain), 73 books, all in the app, so it works with no signal. The
// Bible tab lists its books as tiles, a book opens its chapters, a chapter opens its words (features/library/bible), and a search finds its verses.
// The Books tab lists twelve free classics. A book whose edition is confirmed has its text in the app (books/bookText.ts says which) and opens in the reader;
// the others say "Soon" on their cover while their editions are checked, and the tab, the search and Bookmarks say so (SampleNotice) only when such a book is
// shown. The daily reading is a sample as well (features/library/daily): which readings we may print is
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

/** Why the Books tab has no text at all while none of the twelve has one, in the words the person reads (books/copy.ts booksNotice says the rest). The Bible tab has no notice any more: its text is in the app. */
export const BOOKS_NOTICE = 'Books are not in the app yet. We are checking the editions before we add them.';

/**
 * The notice of a search, shown only when a book that has no text yet (it says "Soon") is among the results: the page of such a book says it is not in the app
 * yet. What is found in the Bible (verses and books) and the books marked "Free" are real and need no notice.
 */
export const SEARCH_NOTICE = 'Books marked Soon are not in the app yet: we are still checking their editions. The Bible text and the books marked Free are.';

/** The same, for the Bookmarks screen, when a book that says "Soon" is among the bookmarks. */
export const BOOKMARKS_NOTICE = 'Books marked Soon are not in the app yet: we are still checking their editions. Bookmarks are kept only on this phone, and logging out clears them.';

/** What the Bookmarks screen says under the Library rows when none of them is a book of the Books tab: where they are kept. */
export const BOOKMARKS_KEPT = 'Kept only on this phone. Logging out clears them.';
