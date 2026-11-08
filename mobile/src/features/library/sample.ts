// The Library has no real text yet: which Bible translation and which editions of the books we may include is not decided (licences
// and sources come first). The Bible tab lists the books of the Bible and the Books tab lists twelve free classics, but none of them
// opens: every row says "Soon", and every tab and the search say that this is a preview (SampleNotice). Nothing here is fetched, so
// the Library works offline. The rows themselves are data: bible/books.ts and books/catalog.ts.
//
// Notes, the third tab, is not a sample. It is the diary: real, written on this phone (features/library/notes, features/diary), so
// it has no notice, no bookmarks and no part in the search. `SampleTab` is the two tabs that hold rows like these.
//
// Plain data on purpose: no theme colours are read here (a colour read at import would never follow light/dark).

export const LIBRARY_TABS = ['Bible', 'Books', 'Notes'] as const;
export type LibraryTab = (typeof LIBRARY_TABS)[number];

/** The tabs that hold example rows: the ones that have a Preview notice, can be searched and bookmarked, and show up in the Bookmarks screen. */
export const SAMPLE_TABS = ['Bible', 'Books'] as const;
export type SampleTab = (typeof SAMPLE_TABS)[number];

/** Why each of those tabs has no text today, in the words the person reads. */
export const PREVIEW_NOTICE: Record<SampleTab, string> = {
  Bible: 'The Bible text is not in the app yet. We are choosing a translation we are allowed to include. This tab shows how reading will look.',
  Books: 'Books are not in the app yet. We are checking the editions before we add them, so none of these twelve opens today.',
};

/**
 * The one Preview notice of a search: the results are these rows, and nothing opens, so it says what they are, like each tab does.
 * A search never finds, opens or plays anything real.
 */
export const SEARCH_NOTICE = 'These results are examples. The Bible text and books are not in the app yet.';

/** The same, for the Bookmarks screen: the Library rows kept there are these examples. */
export const BOOKMARKS_NOTICE = 'These are examples from the Library preview. They are kept only on this phone, and logging out clears them.';
