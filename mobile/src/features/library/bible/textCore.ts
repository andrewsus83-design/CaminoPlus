// The logic of text.ts, with the index and the loaders as parameters instead of `require`s of the assets, so that plain node tests can run it
// against the real files (npm run test:library). No React, no React Native, nothing fetched.
import type { BookIndexEntry, BookText, TranslationInfo } from './textTypes';

/** What index.json holds: the translation and the books in the order of the app. */
export type TextIndex = { translation: TranslationInfo; books: readonly BookIndexEntry[] };

/** One function for each book of the index: it returns the text of that book. The generated webc.generated.ts has them. */
export type BookLoaders = Readonly<Record<string, () => BookText>>;

export type BibleText = {
  TRANSLATION: TranslationInfo;
  BOOK_INDEX: readonly BookIndexEntry[];
  hasBook: (code: string) => boolean;
  loadBook: (code: string) => BookText;
};

export function makeBibleText(index: TextIndex, loaders: BookLoaders): BibleText {
  const codes = new Set(index.books.map((b) => b.code));
  const hasBook = (code: string): boolean => codes.has(code);
  const loadBook = (code: string): BookText => {
    if (!hasBook(code)) throw new Error(`unknown book ${code}`);
    const load = loaders[code];
    if (!load) throw new Error(`no text for book ${code}`); // the index lists it and the generated map does not: caught by the wiring test
    const book = load();
    if (book.code !== code) throw new Error(`the file of ${code} holds ${book.code}`);
    return book;
  };
  return { TRANSLATION: index.translation, BOOK_INDEX: index.books, hasBook, loadBook };
}
