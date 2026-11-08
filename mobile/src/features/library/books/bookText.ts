// TEMPORARY, replaced by the real bookText.ts of the texts branch. It has the same API (BOOK_TEXT_INDEX, hasBookText, loadBookText) over a
// small fixture made only to try the reader (fixtures.ts): three books, a few chapters each. The real one reads assets/books/<id>.json,
// only for the books whose text is confirmed everywhere, so the screens work with any of the twelve, or none.
import { BOOK_CATALOG } from './catalog';
import type { BookText, BookTextIndexEntry } from './bookTextTypes';
import { FIXTURE_IDS, fixtureText } from './fixtures';
import { blockWords } from './reading';

/** The books that have a text, in the order of the catalog. */
export const BOOK_TEXT_INDEX: readonly BookTextIndexEntry[] = BOOK_CATALOG.filter((b) => FIXTURE_IDS.includes(b.id)).map((b) => {
  const text = fixtureText(b.id)!;
  return { id: b.id, chapters: text.chapters.length, words: text.chapters.reduce((sum, c) => sum + blockWords(c.blocks), 0) };
});

/** The book has a text in the app. */
export const hasBookText = (id: string): boolean => BOOK_TEXT_INDEX.some((e) => e.id === id);

/** The text of a book, at once. Throws for a book that has none: ask hasBookText first. */
export function loadBookText(id: string): BookText {
  const text = fixtureText(id);
  if (!text) throw new Error(`The book "${id}" has no text`);
  return text;
}
