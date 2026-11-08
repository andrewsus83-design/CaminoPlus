// How the screens reach the text of a book: BOOK_TEXT_INDEX (which books have text, how long each is), hasBookText and loadBookText. The text
// is in the app, in mobile/assets/books/<id>.json, made by tools/books/import_books.py from public domain editions (tools/books/README.md).
// This file is only the glue to the bundled assets: the logic is in bookTextApi.ts (tested in plain node), the list of loaders in
// books.generated.ts (written by the importer, with a literal path in every require() because Metro needs one). A book is read from its
// file when it is first opened, not when the app starts.
import type { BookText, BookTextIndexEntry } from './bookTextTypes';
import { makeBookTextApi } from './bookTextApi';
import { BOOK_TEXT_LOADERS } from './books.generated';

const api = makeBookTextApi(require('../../../../assets/books/index.json') as BookTextIndexEntry[], BOOK_TEXT_LOADERS);

/** The books that have text, in the order of the catalogue (0 to 12). */
export const BOOK_TEXT_INDEX: readonly BookTextIndexEntry[] = api.index;

export function hasBookText(id: string): boolean {
  return api.hasBookText(id);
}

/** The text of a book, at once. Throws Error(`no text for ${id}`) when the book has none (check hasBookText first). */
export function loadBookText(id: string): BookText {
  return api.loadBookText(id);
}
