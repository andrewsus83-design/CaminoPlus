// The books of the Bible as plain data: the name, the code of the text, how many chapters, and which of the three parts it is in. The words
// are not here (they are in text.ts, which reads the files of assets/bible): this is the list of books the Bible tab shows as tiles, and
// what the search, the bookmarks and the reader need to know about a book. Pure: no React, no React Native, so plain node tests cover it
// (npm run test:library).
//
// The text is the World English Bible, Catholic edition: 73 books, 1,328 chapters. The three parts, in the order of the choice at the top
// of the Bible tab, which is also the order of a straight read (the reader's Next goes from one book to the next across the parts):
//   Old Testament        39 books, 931 chapters (Esther is the Greek book of 10 chapters and Daniel the Greek book of 14: each holds the
//                        passages that the Hebrew text does not have, Daniel 3 the Prayer of Azariah and the Song of the Three, 13 Susanna,
//                        14 Bel and the Dragon)
//   Deuterocanonical     the seven books of the Catholic canon that are not in the Hebrew Bible (137 chapters)
//   New Testament        27 books, 260 chapters
// Orthodox Bibles include a few more books than these; the tab says so (DEUTERO_NOTE).
//
// An id is stable and lower case, because a bookmark is kept under it ("bible:bible-genesis", see ../search.ts itemKey): never change or
// reuse one. A code is the three characters of the source (USFM) and is what a link carries ("/library/bible/PSA/121"). The two passages
// that used to be rows of their own ("bible-additions-to-esther" and "bible-additions-to-daniel") are gone: a bookmark kept under one of
// them shows nothing and breaks nothing (hitsForKeys). src/features/library/__tests__/bible.test.ts pins every name, code, chapter count
// and id.

export const TESTAMENTS = ['old', 'deutero', 'new'] as const;
export type Testament = (typeof TESTAMENTS)[number];

export type BibleBook = {
  id: string;
  /** The three characters of the source: "PSA", "1SA". The key of the text (text.ts) and of a link. */
  code: string;
  name: string;
  testament: Testament;
  chapters: number;
  /** A short line under the name, for the few rows that need one (search results and Bookmarks; a tile has no room for it). */
  detail?: string;
};

type Entry = Omit<BibleBook, 'testament'>;

const OLD_TESTAMENT: readonly Entry[] = [
  { id: 'bible-genesis', code: 'GEN', name: 'Genesis', chapters: 50 },
  { id: 'bible-exodus', code: 'EXO', name: 'Exodus', chapters: 40 },
  { id: 'bible-leviticus', code: 'LEV', name: 'Leviticus', chapters: 27 },
  { id: 'bible-numbers', code: 'NUM', name: 'Numbers', chapters: 36 },
  { id: 'bible-deuteronomy', code: 'DEU', name: 'Deuteronomy', chapters: 34 },
  { id: 'bible-joshua', code: 'JOS', name: 'Joshua', chapters: 24 },
  { id: 'bible-judges', code: 'JDG', name: 'Judges', chapters: 21 },
  { id: 'bible-ruth', code: 'RUT', name: 'Ruth', chapters: 4 },
  { id: 'bible-1-samuel', code: '1SA', name: '1 Samuel', chapters: 31 },
  { id: 'bible-2-samuel', code: '2SA', name: '2 Samuel', chapters: 24 },
  { id: 'bible-1-kings', code: '1KI', name: '1 Kings', chapters: 22 },
  { id: 'bible-2-kings', code: '2KI', name: '2 Kings', chapters: 25 },
  { id: 'bible-1-chronicles', code: '1CH', name: '1 Chronicles', chapters: 29 },
  { id: 'bible-2-chronicles', code: '2CH', name: '2 Chronicles', chapters: 36 },
  { id: 'bible-ezra', code: 'EZR', name: 'Ezra', chapters: 10 },
  { id: 'bible-nehemiah', code: 'NEH', name: 'Nehemiah', chapters: 13 },
  { id: 'bible-esther', code: 'ESG', name: 'Esther', chapters: 10, detail: 'With the Greek additions' },
  { id: 'bible-job', code: 'JOB', name: 'Job', chapters: 42 },
  { id: 'bible-psalms', code: 'PSA', name: 'Psalms', chapters: 150 },
  { id: 'bible-proverbs', code: 'PRO', name: 'Proverbs', chapters: 31 },
  { id: 'bible-ecclesiastes', code: 'ECC', name: 'Ecclesiastes', chapters: 12 },
  { id: 'bible-song-of-songs', code: 'SNG', name: 'Song of Songs', chapters: 8 },
  { id: 'bible-isaiah', code: 'ISA', name: 'Isaiah', chapters: 66 },
  { id: 'bible-jeremiah', code: 'JER', name: 'Jeremiah', chapters: 52 },
  { id: 'bible-lamentations', code: 'LAM', name: 'Lamentations', chapters: 5 },
  { id: 'bible-ezekiel', code: 'EZK', name: 'Ezekiel', chapters: 48 },
  { id: 'bible-daniel', code: 'DAG', name: 'Daniel', chapters: 14, detail: 'With Susanna, and Bel and the Dragon' },
  { id: 'bible-hosea', code: 'HOS', name: 'Hosea', chapters: 14 },
  { id: 'bible-joel', code: 'JOL', name: 'Joel', chapters: 3 },
  { id: 'bible-amos', code: 'AMO', name: 'Amos', chapters: 9 },
  { id: 'bible-obadiah', code: 'OBA', name: 'Obadiah', chapters: 1 },
  { id: 'bible-jonah', code: 'JON', name: 'Jonah', chapters: 4 },
  { id: 'bible-micah', code: 'MIC', name: 'Micah', chapters: 7 },
  { id: 'bible-nahum', code: 'NAM', name: 'Nahum', chapters: 3 },
  { id: 'bible-habakkuk', code: 'HAB', name: 'Habakkuk', chapters: 3 },
  { id: 'bible-zephaniah', code: 'ZEP', name: 'Zephaniah', chapters: 3 },
  { id: 'bible-haggai', code: 'HAG', name: 'Haggai', chapters: 2 },
  { id: 'bible-zechariah', code: 'ZEC', name: 'Zechariah', chapters: 14 },
  { id: 'bible-malachi', code: 'MAL', name: 'Malachi', chapters: 4 },
];

// The seven books of the Catholic canon that are not in the Hebrew Bible.
const DEUTEROCANON: readonly Entry[] = [
  { id: 'bible-tobit', code: 'TOB', name: 'Tobit', chapters: 14 },
  { id: 'bible-judith', code: 'JDT', name: 'Judith', chapters: 16 },
  { id: 'bible-wisdom', code: 'WIS', name: 'Wisdom', chapters: 19 },
  { id: 'bible-sirach', code: 'SIR', name: 'Sirach', chapters: 51 },
  { id: 'bible-baruch', code: 'BAR', name: 'Baruch', chapters: 6, detail: 'With the Letter of Jeremiah' },
  { id: 'bible-1-maccabees', code: '1MA', name: '1 Maccabees', chapters: 16 },
  { id: 'bible-2-maccabees', code: '2MA', name: '2 Maccabees', chapters: 15 },
];

const NEW_TESTAMENT: readonly Entry[] = [
  { id: 'bible-matthew', code: 'MAT', name: 'Matthew', chapters: 28 },
  { id: 'bible-mark', code: 'MRK', name: 'Mark', chapters: 16 },
  { id: 'bible-luke', code: 'LUK', name: 'Luke', chapters: 24 },
  { id: 'bible-john', code: 'JHN', name: 'John', chapters: 21 },
  { id: 'bible-acts', code: 'ACT', name: 'Acts', chapters: 28 },
  { id: 'bible-romans', code: 'ROM', name: 'Romans', chapters: 16 },
  { id: 'bible-1-corinthians', code: '1CO', name: '1 Corinthians', chapters: 16 },
  { id: 'bible-2-corinthians', code: '2CO', name: '2 Corinthians', chapters: 13 },
  { id: 'bible-galatians', code: 'GAL', name: 'Galatians', chapters: 6 },
  { id: 'bible-ephesians', code: 'EPH', name: 'Ephesians', chapters: 6 },
  { id: 'bible-philippians', code: 'PHP', name: 'Philippians', chapters: 4 },
  { id: 'bible-colossians', code: 'COL', name: 'Colossians', chapters: 4 },
  { id: 'bible-1-thessalonians', code: '1TH', name: '1 Thessalonians', chapters: 5 },
  { id: 'bible-2-thessalonians', code: '2TH', name: '2 Thessalonians', chapters: 3 },
  { id: 'bible-1-timothy', code: '1TI', name: '1 Timothy', chapters: 6 },
  { id: 'bible-2-timothy', code: '2TI', name: '2 Timothy', chapters: 4 },
  { id: 'bible-titus', code: 'TIT', name: 'Titus', chapters: 3 },
  { id: 'bible-philemon', code: 'PHM', name: 'Philemon', chapters: 1 },
  { id: 'bible-hebrews', code: 'HEB', name: 'Hebrews', chapters: 13 },
  { id: 'bible-james', code: 'JAS', name: 'James', chapters: 5 },
  { id: 'bible-1-peter', code: '1PE', name: '1 Peter', chapters: 5 },
  { id: 'bible-2-peter', code: '2PE', name: '2 Peter', chapters: 3 },
  { id: 'bible-1-john', code: '1JN', name: '1 John', chapters: 5 },
  { id: 'bible-2-john', code: '2JN', name: '2 John', chapters: 1 },
  { id: 'bible-3-john', code: '3JN', name: '3 John', chapters: 1 },
  { id: 'bible-jude', code: 'JUD', name: 'Jude', chapters: 1 },
  { id: 'bible-revelation', code: 'REV', name: 'Revelation', chapters: 22 },
];

const tag = (testament: Testament, list: readonly Entry[]): BibleBook[] => list.map((b) => ({ ...b, testament }));

/** Every book of the Bible tab, Old Testament first, then the Deuterocanon, then the New Testament; each in the order of its part. This is also the order of a straight read. */
export const BIBLE_BOOKS: readonly BibleBook[] = [...tag('old', OLD_TESTAMENT), ...tag('deutero', DEUTEROCANON), ...tag('new', NEW_TESTAMENT)];

const BY_CODE = new Map(BIBLE_BOOKS.map((b) => [b.code, b]));
const BY_ID = new Map(BIBLE_BOOKS.map((b) => [b.id, b]));

/** The book with this code ("PSA"), or undefined for a code that is no book of the list. Case matters: codes are upper case. */
export const bookByCode = (code: string): BibleBook | undefined => BY_CODE.get(code);

/** The book with this id ("bible-psalms"), or undefined: a bookmark kept under an id that is gone (the two added passages) finds nothing. */
export const bookById = (id: string): BibleBook | undefined => BY_ID.get(id);

/** The books of one part, in order. */
export const booksOf = (t: Testament): BibleBook[] => BIBLE_BOOKS.filter((b) => b.testament === t);

/** The words on a choice of the selector. The middle one is the short form, so that it fits three to a row on a narrow phone. */
export const TESTAMENT_LABEL: Record<Testament, string> = { old: 'Old Testament', deutero: 'Deuterocanon', new: 'New Testament' };

/** What the search reads for the part of a row: the short form and the long one, so both "deuterocanon" and "deuterocanonical" find the row. */
export const TESTAMENT_SEARCH: Record<Testament, string> = { old: 'Old Testament', deutero: 'Deuterocanon Deuterocanonical', new: 'New Testament' };

/** The one line that goes with the Deuterocanon: the list is the Catholic canon; other churches count more. */
export const DEUTERO_NOTE = 'Orthodox Bibles include a few more books.';

/** The line that says where the two Greek additions are: they are inside the Old Testament books, not rows of their own. Under the Deuterocanon, where a reader looks for Susanna. */
export const ADDITIONS_NOTE = 'Esther and Daniel, in the Old Testament, include their Greek additions: Daniel 3 holds the Prayer of Azariah and the Song of the Three, 13 is Susanna and 14 is Bel and the Dragon.';

/** The sentence that says how many a part holds: "39 books", "7 books". */
export function countLine(t: Testament): string {
  const books = booksOf(t).length;
  return `${books} ${books === 1 ? 'book' : 'books'}`;
}

const NO_BREAK_SPACE = '\u00a0';

/** "50 chapters", "1 chapter". The space is a no-break space: a line that has to wrap does it before "50 chapters", not between 50 and "chapters". */
export const chaptersLabel = (chapters: number): string => `${chapters}${NO_BREAK_SPACE}${chapters === 1 ? 'chapter' : 'chapters'}`;

/** The part of a book as a list that mixes the three says it: "Old Testament", with a no-break space, so that it never breaks inside. */
export const partWords = (b: BibleBook): string => TESTAMENT_LABEL[b.testament].replace(/ /g, NO_BREAK_SPACE);

/** The line under a name: its chapters, then its detail ("6 chapters · With the Letter of Jeremiah"). `withPart` puts the part first, for a list that mixes the three (search, Bookmarks). The part and the chapters never break inside: only the dots are places to wrap. */
export function bookLine(b: BibleBook, withPart = false): string {
  return [withPart ? partWords(b) : '', chaptersLabel(b.chapters), b.detail ?? ''].filter(Boolean).join(' · ');
}
