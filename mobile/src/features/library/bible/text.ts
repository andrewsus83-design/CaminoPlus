// The text of the Bible, as the screens reach it: the translation, the 73 books in the order of the app, and one book at a time.
//
//   TRANSLATION        which translation this is, how it is licensed and how it is credited (the licences screen, the foot of a chapter)
//   BOOK_INDEX         code, name, number of chapters and of verses of every book, in the order of the app
//   hasBook(code)      is it a book of the index ("PSA")
//   loadBook(code)     the whole book, synchronously; throws Error(`unknown book ${code}`) for a code that is not in the index
//
// The words are the World English Bible, Catholic edition, turned into JSON by tools/bible/import_webc.py (tools/bible/README.md has the
// format and what was left out). They are in the app, one file for each book, so nothing is fetched and it all works offline. A book is
// read from its file the first time it is asked for (webc.generated.ts has one `require` for each, and `require` runs only when the
// function is called); asking again returns the same object, so a screen may call loadBook on every render.
//
// Thin on purpose: the logic is in textCore.ts, which takes the index and the loaders as parameters so plain node can run it. This file
// is the one place that `require`s the assets, so the tests cover it by reading it (bibletext.test.ts, "the wiring").
import { makeBibleText, type TextIndex } from './textCore';
import type { BookIndexEntry, BookText, TranslationInfo } from './textTypes';
import { WEBC_LOADERS } from './webc.generated';

const text = makeBibleText(require('../../../../assets/bible/webc/index.json') as TextIndex, WEBC_LOADERS);

export const TRANSLATION: TranslationInfo = text.TRANSLATION;
export const BOOK_INDEX: readonly BookIndexEntry[] = text.BOOK_INDEX;
export const hasBook: (code: string) => boolean = text.hasBook;
export const loadBook: (code: string) => BookText = text.loadBook;
