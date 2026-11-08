// TEMPORARY, replaced by the real text.ts of the data branch (assets/bible/webc and the loader that reads it). This stub has the API of the
// contract (textTypes.ts and the notes of the data branch) over the few complete chapters of __fixtures__/bible/fixture.ts, so that the
// reader, the search and the bookmarks can be built and tested before the 73 books are in. It is deleted, with the fixture, when the data
// branch is merged; nothing outside this file and searchText.ts may know that it is a stand-in.
import { BIBLE_BOOKS } from './books';
import { FIXTURE_BOOKS, FIXTURE_VERSE_COUNTS } from '../__fixtures__/bible/fixture';
import type { BookIndexEntry, BookText, TranslationInfo } from './textTypes';

export const TRANSLATION: TranslationInfo = {
  id: 'eng-web-c',
  name: 'World English Bible, Catholic edition',
  short: 'WEB',
  licence: 'Public domain',
  credit: 'World English Bible, Catholic edition (eBible.org). Public domain. The name "World English Bible" is a trademark of eBible.org.',
  source: 'https://ebible.org/eng-web-c/',
};

export const BOOK_INDEX: readonly BookIndexEntry[] = BIBLE_BOOKS.map((b) => ({ code: b.code, name: b.name, chapters: b.chapters, verses: FIXTURE_VERSE_COUNTS[b.code] ?? 0 }));

const CODES = new Set(BOOK_INDEX.map((b) => b.code));

export const hasBook = (code: string): boolean => CODES.has(code);

/** The text of a book. Throws Error("unknown book CODE") for a code that is no book of the list. */
export function loadBook(code: string): BookText {
  if (!CODES.has(code)) throw new Error(`unknown book ${code}`);
  return FIXTURE_BOOKS[code] ?? { code, name: BIBLE_BOOKS.find((b) => b.code === code)?.name ?? code, chapters: [] };
}
