// What the actions on a chosen verse send out. Pure: no React, no React Native (plain node tests cover it, npm run test:library). The bar that holds the
// buttons is VerseActions.tsx.

/** The name of the translation, as it follows a verse that is copied or shared. */
export const SHARE_TRANSLATION = 'World English Bible';

/** The words that are copied or shared for a verse: the verse, then on a line of its own where it is and which translation ("Psalm 121:3 (World English Bible)"). */
export const verseShareText = (place: string, words: string): string => `${words.trim()}\n${place} (${SHARE_TRANSLATION})`;

/** The line a screen reader hears when a verse is chosen: where it is, and what can be done with it. */
export const chosenAnnouncement = (place: string): string => `${place} selected. Bookmark, copy or share it.`;

/** What a button says after a verse was copied, for a moment. */
export const COPIED = 'Copied';

/** How long "Copied" stays on the button. */
export const COPIED_MS = 1800;
