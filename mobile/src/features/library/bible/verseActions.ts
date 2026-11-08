// What the actions on a chosen verse send out. Pure: no React, no React Native (plain node tests cover it, npm run test:library). The bar that holds the
// buttons is VerseActions.tsx.

/** The name of the translation, as it follows a verse that is copied or shared. */
export const SHARE_TRANSLATION = 'World English Bible';

/** The words that are copied or shared for a verse: the verse, then on a line of its own where it is and which translation ("Psalm 121:3 (World English Bible)"). */
export const verseShareText = (place: string, words: string): string => `${words.trim()}\n${place} (${SHARE_TRANSLATION})`;

/**
 * What a new note starts with when it is written about a verse, as a reply in a chat starts with the message it answers: the verse as a quotation in the marks of the diary
 * ("> " before each line), the line that says where it is and which translation, and an empty line to write on. The quotation stays in the note as text, so the note is a note of the
 * diary like any other, with words, photos and a place, and Notes shows it.
 */
export const verseNoteStart = (place: string, words: string): string =>
  `${words.split('\n').map((l) => l.trim()).filter((l) => l.length > 0).map((l) => `> ${l}`).join('\n')}\n> — ${place} (${SHARE_TRANSLATION})\n\n`;

/** The address of a new note written about a verse: the diary's page for a new note, with the key the verse is bookmarked under ("bible:PSA.121.3"). */
export const verseNoteHref = (key: string): string => `/diary/new?quote=${encodeURIComponent(key)}`;

/** The line a screen reader hears when a verse is chosen: where it is, and what can be done with it. */
export const chosenAnnouncement = (place: string): string => `${place} selected. Bookmark, write a note, copy or share it.`;

/** What a button says after a verse was copied, for a moment. */
export const COPIED = 'Copied';

/** How long "Copied" stays on the button. */
export const COPIED_MS = 1800;
