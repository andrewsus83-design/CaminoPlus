// The books of the Books tab: whatever tools/build_books.py put in the bundle (bookBundle.ts, generated from books/), in the order of the shelves. Nothing here is written
// by hand: the list, the titles, the subtitles, the covers (a pale colour and a glyph), the chapters and the times all come from the books themselves, so the tab shows
// exactly the books the app has, however many that is. A book's id is stable and lower case (the folder of the book): a bookmark is kept under it ("books:<id>", see
// ../search.ts itemKey) and so is the place where a person stopped reading it (reading.ts).
//
// The words for a kind of book ("Pilgrim's guide") are in copy.ts, which is pure; this file reads the bundle and so is for the screens (and for a test that sets the
// bundle up first, see __tests__/bundleShim.ts).
import { CATALOG } from '../bookBundle';
import type { CatalogBook } from './index';

export type { BookKind, CatalogBook, CoverColour, CoverIcon } from './index';

/** The books in the order of the shelves (`order` in book.json), and by id for two that share a number. */
export const BOOK_CATALOG: readonly CatalogBook[] = [...CATALOG].sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

/** The book with this id, or nothing (an old link, a bookmark of a book that was taken out). */
export const bookById = (id: string | null | undefined): CatalogBook | undefined => BOOK_CATALOG.find((b) => b.id === id);
