// The Library has no real content yet: which Bible translation, which books and which music we may include is not
// decided (licences and sources come first). Everything here is an example that shows where real content will go,
// and every tab says so on screen (SampleNotice). Nothing here is fetched, so the Library works offline.
//
// Plain data on purpose: no theme colours are read here (a colour read at import would never follow light/dark).
// A cover names its colour; the screen looks it up when it draws.

export const LIBRARY_TABS = ['Bible', 'Books', 'Music'] as const;
export type LibraryTab = (typeof LIBRARY_TABS)[number];

/** Why each tab is empty today, in the words the person reads. */
export const PREVIEW_NOTICE: Record<LibraryTab, string> = {
  Bible: 'The Bible text is not in the app yet. We are choosing a translation we are allowed to include. This tab shows how reading will look.',
  Books: 'Books are not in the app yet. We are choosing which guides, pilgrim stories and prayers we may include. These covers are examples.',
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

export const SAMPLE_BOOKS: readonly { id: string; title: string; kind: string; colour: CoverColour; icon: 'library' | 'book' | 'chat' }[] = [
  { id: 'guide', title: 'Guide to the Way', kind: 'Guides', colour: 'goldSoft', icon: 'library' },
  { id: 'stories', title: 'Stories from pilgrims', kind: 'Stories', colour: 'blue100', icon: 'book' },
  { id: 'prayers', title: 'Prayers and blessings', kind: 'Prayer', colour: 'successWash', icon: 'book' },
  { id: 'spanish', title: 'Spanish for the road', kind: 'Language', colour: 'red100', icon: 'chat' },
];

export const SAMPLE_PLAYLISTS = [
  { id: 'morning', title: 'Morning walk', note: 'Easy songs for the first hour' },
  { id: 'evening', title: 'Quiet evening', note: 'For the albergue, after the stamp' },
  { id: 'chants', title: 'Chants for the road', note: 'Slow, simple chants for the road' },
  { id: 'sing', title: 'Songs to sing together', note: 'For when the group is tired' },
] as const;

/** One example row of each tab, as the screens and the search read them. */
export type Shelf = (typeof SAMPLE_SHELVES)[number];
export type Book = (typeof SAMPLE_BOOKS)[number];
export type Playlist = (typeof SAMPLE_PLAYLISTS)[number];

/**
 * The one Preview notice of a search: the results are these examples, so it says what they are, like each tab does.
 * Searching is also an honest "looking through the examples": it never finds, opens or plays anything real.
 */
export const SEARCH_NOTICE = 'Search looks through the examples in this preview. The Bible text, books and music are not in the app yet, so nothing here can be opened or played.';

/** The same, for the Bookmarks screen: the Library rows kept there are these examples. */
export const BOOKMARKS_NOTICE = 'These are examples from the Library preview. They are kept only on this phone, and logging out clears them.';
