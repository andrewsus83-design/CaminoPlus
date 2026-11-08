// The books of the Bible as plain data: the name, how many chapters, and which of the three parts it is in. No text of the
// Bible is here (which translation we may include is not decided, see ../sample.ts): this is the list of books the Bible tab
// shows, each as a row that says "Soon". Pure: no React, no React Native, so plain node tests cover it (npm run test:library).
//
// The three parts, in the order of the selector at the bottom of the Bible tab:
//   Old Testament        39 books, 929 chapters
//   Deuterocanonical     the seven books of the Catholic canon (137 chapters) and the two added passages of Esther and Daniel
//   New Testament        27 books, 260 chapters
// Orthodox Bibles include a few more books than these; the tab says so (DEUTERO_NOTE).
//
// An id is stable and lower case, because a bookmark is kept under it ("bible:bible-genesis", see ../search.ts itemKey): never
// change or reuse one. src/features/library/__tests__/bible.test.ts pins every name, every chapter count and every id.

export const TESTAMENTS = ['old', 'deutero', 'new'] as const;
export type Testament = (typeof TESTAMENTS)[number];

export type BibleBook = {
  id: string;
  name: string;
  testament: Testament;
  /** null for the two added passages (of Esther and of Daniel): they have no chapters of their own in this list. */
  chapters: number | null;
  /** A short line under the name, for the few rows that need one. */
  detail?: string;
};

type Entry = Omit<BibleBook, 'testament'>;

const OLD_TESTAMENT: readonly Entry[] = [
  { id: 'bible-genesis', name: 'Genesis', chapters: 50 },
  { id: 'bible-exodus', name: 'Exodus', chapters: 40 },
  { id: 'bible-leviticus', name: 'Leviticus', chapters: 27 },
  { id: 'bible-numbers', name: 'Numbers', chapters: 36 },
  { id: 'bible-deuteronomy', name: 'Deuteronomy', chapters: 34 },
  { id: 'bible-joshua', name: 'Joshua', chapters: 24 },
  { id: 'bible-judges', name: 'Judges', chapters: 21 },
  { id: 'bible-ruth', name: 'Ruth', chapters: 4 },
  { id: 'bible-1-samuel', name: '1 Samuel', chapters: 31 },
  { id: 'bible-2-samuel', name: '2 Samuel', chapters: 24 },
  { id: 'bible-1-kings', name: '1 Kings', chapters: 22 },
  { id: 'bible-2-kings', name: '2 Kings', chapters: 25 },
  { id: 'bible-1-chronicles', name: '1 Chronicles', chapters: 29 },
  { id: 'bible-2-chronicles', name: '2 Chronicles', chapters: 36 },
  { id: 'bible-ezra', name: 'Ezra', chapters: 10 },
  { id: 'bible-nehemiah', name: 'Nehemiah', chapters: 13 },
  { id: 'bible-esther', name: 'Esther', chapters: 10 },
  { id: 'bible-job', name: 'Job', chapters: 42 },
  { id: 'bible-psalms', name: 'Psalms', chapters: 150 },
  { id: 'bible-proverbs', name: 'Proverbs', chapters: 31 },
  { id: 'bible-ecclesiastes', name: 'Ecclesiastes', chapters: 12 },
  { id: 'bible-song-of-songs', name: 'Song of Songs', chapters: 8 },
  { id: 'bible-isaiah', name: 'Isaiah', chapters: 66 },
  { id: 'bible-jeremiah', name: 'Jeremiah', chapters: 52 },
  { id: 'bible-lamentations', name: 'Lamentations', chapters: 5 },
  { id: 'bible-ezekiel', name: 'Ezekiel', chapters: 48 },
  { id: 'bible-daniel', name: 'Daniel', chapters: 12 },
  { id: 'bible-hosea', name: 'Hosea', chapters: 14 },
  { id: 'bible-joel', name: 'Joel', chapters: 3 },
  { id: 'bible-amos', name: 'Amos', chapters: 9 },
  { id: 'bible-obadiah', name: 'Obadiah', chapters: 1 },
  { id: 'bible-jonah', name: 'Jonah', chapters: 4 },
  { id: 'bible-micah', name: 'Micah', chapters: 7 },
  { id: 'bible-nahum', name: 'Nahum', chapters: 3 },
  { id: 'bible-habakkuk', name: 'Habakkuk', chapters: 3 },
  { id: 'bible-zephaniah', name: 'Zephaniah', chapters: 3 },
  { id: 'bible-haggai', name: 'Haggai', chapters: 2 },
  { id: 'bible-zechariah', name: 'Zechariah', chapters: 14 },
  { id: 'bible-malachi', name: 'Malachi', chapters: 4 },
];

// The seven books of the Catholic canon that are not in the Hebrew Bible, then the passages added to Esther and to Daniel.
const DEUTEROCANON: readonly Entry[] = [
  { id: 'bible-tobit', name: 'Tobit', chapters: 14 },
  { id: 'bible-judith', name: 'Judith', chapters: 16 },
  { id: 'bible-wisdom', name: 'Wisdom', chapters: 19 },
  { id: 'bible-sirach', name: 'Sirach', chapters: 51 },
  { id: 'bible-baruch', name: 'Baruch', chapters: 6, detail: 'With the Letter of Jeremiah' },
  { id: 'bible-1-maccabees', name: '1 Maccabees', chapters: 16 },
  { id: 'bible-2-maccabees', name: '2 Maccabees', chapters: 15 },
  { id: 'bible-additions-to-esther', name: 'Additions to Esther', chapters: null, detail: 'Added passages' },
  { id: 'bible-additions-to-daniel', name: 'Additions to Daniel', chapters: null, detail: 'Susanna; Prayer of Azariah and Song of the Three; Bel and the Dragon' },
];

const NEW_TESTAMENT: readonly Entry[] = [
  { id: 'bible-matthew', name: 'Matthew', chapters: 28 },
  { id: 'bible-mark', name: 'Mark', chapters: 16 },
  { id: 'bible-luke', name: 'Luke', chapters: 24 },
  { id: 'bible-john', name: 'John', chapters: 21 },
  { id: 'bible-acts', name: 'Acts', chapters: 28 },
  { id: 'bible-romans', name: 'Romans', chapters: 16 },
  { id: 'bible-1-corinthians', name: '1 Corinthians', chapters: 16 },
  { id: 'bible-2-corinthians', name: '2 Corinthians', chapters: 13 },
  { id: 'bible-galatians', name: 'Galatians', chapters: 6 },
  { id: 'bible-ephesians', name: 'Ephesians', chapters: 6 },
  { id: 'bible-philippians', name: 'Philippians', chapters: 4 },
  { id: 'bible-colossians', name: 'Colossians', chapters: 4 },
  { id: 'bible-1-thessalonians', name: '1 Thessalonians', chapters: 5 },
  { id: 'bible-2-thessalonians', name: '2 Thessalonians', chapters: 3 },
  { id: 'bible-1-timothy', name: '1 Timothy', chapters: 6 },
  { id: 'bible-2-timothy', name: '2 Timothy', chapters: 4 },
  { id: 'bible-titus', name: 'Titus', chapters: 3 },
  { id: 'bible-philemon', name: 'Philemon', chapters: 1 },
  { id: 'bible-hebrews', name: 'Hebrews', chapters: 13 },
  { id: 'bible-james', name: 'James', chapters: 5 },
  { id: 'bible-1-peter', name: '1 Peter', chapters: 5 },
  { id: 'bible-2-peter', name: '2 Peter', chapters: 3 },
  { id: 'bible-1-john', name: '1 John', chapters: 5 },
  { id: 'bible-2-john', name: '2 John', chapters: 1 },
  { id: 'bible-3-john', name: '3 John', chapters: 1 },
  { id: 'bible-jude', name: 'Jude', chapters: 1 },
  { id: 'bible-revelation', name: 'Revelation', chapters: 22 },
];

const tag = (testament: Testament, list: readonly Entry[]): BibleBook[] => list.map((b) => ({ ...b, testament }));

/** Every row of the Bible tab, Old Testament first, then the Deuterocanon, then the New Testament; each in the order of its part. */
export const BIBLE_BOOKS: readonly BibleBook[] = [...tag('old', OLD_TESTAMENT), ...tag('deutero', DEUTEROCANON), ...tag('new', NEW_TESTAMENT)];

/** The rows of one part, in order. */
export const booksOf = (t: Testament): BibleBook[] => BIBLE_BOOKS.filter((b) => b.testament === t);

/** The words on a choice of the selector. The middle one is the short form, so that it fits three to a row on a narrow phone. */
export const TESTAMENT_LABEL: Record<Testament, string> = { old: 'Old Testament', deutero: 'Deuterocanon', new: 'New Testament' };

/** What the search reads for the part of a row: the short form and the long one, so both "deuterocanon" and "deuterocanonical" find the row. */
export const TESTAMENT_SEARCH: Record<Testament, string> = { old: 'Old Testament', deutero: 'Deuterocanon Deuterocanonical', new: 'New Testament' };

/** The one line that goes with the Deuterocanon: the list is the Catholic canon; other churches count more. */
export const DEUTERO_NOTE = 'Orthodox Bibles include a few more books.';

/** The sentence that says how many a part holds: "39 books", "7 books and 2 added passages". */
export function countLine(t: Testament): string {
  const rows = booksOf(t);
  const added = rows.filter((b) => b.chapters === null).length;
  const books = rows.length - added;
  const bookWords = `${books} ${books === 1 ? 'book' : 'books'}`;
  return added === 0 ? bookWords : `${bookWords} and ${added} added ${added === 1 ? 'passage' : 'passages'}`;
}

/** "50 chapters", "1 chapter"; empty for a row that has no chapters of its own. */
export const chaptersLabel = (chapters: number | null): string => (chapters === null ? '' : `${chapters} ${chapters === 1 ? 'chapter' : 'chapters'}`);

/** The line under a name: its chapters, then its detail ("6 chapters · With the Letter of Jeremiah"). `withPart` puts the part first, for a list that mixes the three (search, Bookmarks). */
export function bookLine(b: BibleBook, withPart = false): string {
  return [withPart ? TESTAMENT_LABEL[b.testament] : '', chaptersLabel(b.chapters), b.detail ?? ''].filter(Boolean).join(' · ');
}
