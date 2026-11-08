// The Bible and Music tabs have no real content yet: which Bible translation and which music we may include is not decided
// (licences and sources come first). Everything here is an example that shows where real content will go, and those two tabs say
// so on screen (SampleNotice). The Books tab is real: its covers come from the bundle (books.ts, bookBundle.ts), not from here.
// Nothing here is fetched, so the Library works offline.
//
// Plain data on purpose: no theme colours are read here (a colour read at import would never follow light/dark).
// A cover names its colour; the screen looks it up when it draws.

export const LIBRARY_TABS = ['Bible', 'Books', 'Music'] as const;
export type LibraryTab = (typeof LIBRARY_TABS)[number];

/** The tabs that still show examples. Books is not one of them: its covers are the real books. */
export type ExampleTab = 'Bible' | 'Music';
export const isExampleTab = (t: LibraryTab): t is ExampleTab => t === 'Bible' || t === 'Music';

/** Why each of those tabs is empty today, in the words the person reads. */
export const PREVIEW_NOTICE: Record<ExampleTab, string> = {
  Bible: 'The Bible text is not in the app yet. We are choosing a translation we are allowed to include. This tab shows how reading will look.',
  Music: 'Music is not in the app yet, and nothing plays today. We are choosing where the songs come from. These rows show how playlists will look.',
};

/** The Bible shelves: where reading will start. */
export const SAMPLE_SHELVES = [
  { id: 'psalms', title: 'Psalms for walking', note: 'Short, for a rest by the road' },
  { id: 'gospels', title: 'The Gospels', note: 'One chapter a day' },
  { id: 'prayers', title: 'Prayers for the road', note: 'Morning, evening and the pilgrim blessing' },
  { id: 'plans', title: 'Reading plans', note: 'One reading for each stage of your Camino' },
] as const;

export type CoverColour = 'goldSoft' | 'blue100' | 'successWash' | 'red100' | 'sand300' | 'goldWash';

export const SAMPLE_PLAYLISTS = [
  { id: 'morning', title: 'Morning walk', note: 'Easy songs for the first hour' },
  { id: 'evening', title: 'Quiet evening', note: 'For the albergue, after the stamp' },
  { id: 'chants', title: 'Chants for the road', note: 'Slow, simple chants for the road' },
  { id: 'sing', title: 'Songs to sing together', note: 'For when the group is tired' },
] as const;

/** One example row of each tab, as the screens and the search read them. */
export type Shelf = (typeof SAMPLE_SHELVES)[number];
export type Playlist = (typeof SAMPLE_PLAYLISTS)[number];

const EXAMPLE_ORDER: readonly ExampleTab[] = ['Bible', 'Music'];

/** The example tabs that have a row in `tabs`, in tab order: "Bible", "Music", or "Bible and Music". Empty when the list holds no example. */
export function exampleNames(tabs: readonly LibraryTab[]): string {
  return EXAMPLE_ORDER.filter((t) => tabs.includes(t)).join(' and ');
}

/**
 * The Preview notice of a search: only when a result of an example tab is on screen, and it names only the tabs that are there. The
 * books are real, so a search that finds books alone has no notice at all (null). `tabs` are the tabs that have results.
 */
export function searchNotice(tabs: readonly LibraryTab[]): string | null {
  const names = exampleNames(tabs);
  if (!names) return null;
  const has = EXAMPLE_ORDER.filter((t) => tabs.includes(t));
  const what = has.length === 2 ? 'The Bible text and music are' : has[0] === 'Bible' ? 'The Bible text is' : 'Music is';
  return `The ${names} results are examples. ${what} not in the app yet.`;
}

/** The same, for the Bookmarks screen: the Bible and Music rows kept there are examples. Null when none of them is on screen. */
export function bookmarksNotice(tabs: readonly LibraryTab[]): string | null {
  const names = exampleNames(tabs);
  return names ? `The ${names} rows here are examples from the Library preview.` : null;
}

/** Said on the Bookmarks screen, wherever something is bookmarked: where the bookmarks are and what clears them. */
export const BOOKMARKS_PRIVATE_LINE = 'Kept only on this phone. Logging out clears them.';
