// The Library has no real text yet: which Bible translation and which editions of the books we may include is not decided (licences
// and sources come first). The Bible tab lists the books of the Bible and the Books tab lists twelve free classics, but none of them
// opens: every row says "Soon", and every tab and the search say that this is a preview (SampleNotice). Nothing here is fetched, so
// the Library works offline. The rows themselves are data: bible/books.ts and books/catalog.ts.
//
// The Library has two tabs, Bible and Books, and no more: the diary is not in the Library. It is the Notes sub-tab of Me (features/notes,
// features/diary), where the pilgrim's own writing sits next to the journey. `SampleTab` is the tabs that hold rows like these.
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

/** The tabs that hold example rows: the ones that have a Preview notice, can be searched and bookmarked, and show up in the Bookmarks screen. */
export const SAMPLE_TABS = ['Bible', 'Books'] as const;
export type SampleTab = (typeof SAMPLE_TABS)[number];

/** Why each of those tabs has no text today, in the words the person reads. */
export const PREVIEW_NOTICE: Record<SampleTab, string> = {
  Bible: 'The Bible text is not in the app yet. We are choosing a translation we are allowed to include.',
  Books: 'Books are not in the app yet. We are checking the editions before we add them.',
};

/**
 * The one Preview notice of a search: the results are these rows, and nothing opens, so it says what they are, like each tab does.
 * A search never finds, opens or plays anything real.
 */
export const SEARCH_NOTICE = 'These results are examples. The Bible text and books are not in the app yet.';

/** The same, for the Bookmarks screen: the Library rows kept there are these examples. */
export const BOOKMARKS_NOTICE = 'These are examples from the Library preview. They are kept only on this phone, and logging out clears them.';
