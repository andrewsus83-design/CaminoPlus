// The Notebook as data: the notes grouped by what they are about (a book, then a chapter or day of it) and searched with the Library's own
// word matching. A pure module (no React, no React Native; plain node tests cover it, npm run test:notes). There is no timeline here: the
// groups follow the order of the books and of their chapters, never the date.
import { findBook, findChapter, type CatalogBook } from '../library/books';
import { matchesWords, wordsOf } from '../library/search';
import { bookPlaceOf } from './anchor';
import type { Note } from './notes';

/** The notes of one chapter or day (or of the book as a whole, when `chapterId` is null), first those on the whole chapter, then by paragraph. */
export type ChapterGroup = { chapterId: string | null; title: string; notes: Note[] };

/** The notes of one book. `bookId` is null for notes on something this build cannot place: they are kept together, in the order they were written. */
export type BookGroup = { bookId: string | null; title: string; subtitle: string; chapters: ChapterGroup[] };

/** What the group of notes that cannot be placed is called. */
export const OTHER_NOTES_TITLE = 'Other notes';
export const OTHER_NOTES_LINE = 'On a book or a place this version of the app does not have.';

const blockOf = (n: Note): number => bookPlaceOf(n.anchor)?.block ?? -1;
const byTime = (a: Note, b: Note) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || (a.id < b.id ? -1 : 1);

/**
 * The notes by book (in the order of the catalog) and, in each book, by chapter or day (in the order of the book): within a chapter the notes on
 * the whole chapter come first, then those on its paragraphs from the top of the text down, a tie by the time they were written. Notes that
 * are not on a book of the catalog (another kind of anchor, a book that is not in the app any more) are one last group, "Other notes".
 * Empty groups are not made. The notes it is given are not changed.
 */
export function groupNotes(notes: readonly Note[], catalog: readonly CatalogBook[]): BookGroup[] {
  const groups: BookGroup[] = [];
  const known = new Map(catalog.map((b) => [b.id, b]));
  const placed = new Map<string, Note[]>();
  const loose: Note[] = [];
  for (const n of notes) {
    const a = bookPlaceOf(n.anchor);
    if (a && known.has(a.bookId)) (placed.get(a.bookId) ?? placed.set(a.bookId, []).get(a.bookId)!).push(n);
    else loose.push(n);
  }
  for (const book of [...catalog].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))) {
    const mine = placed.get(book.id);
    if (!mine) continue;
    const chapters: ChapterGroup[] = [];
    const whole = mine.filter((n) => bookPlaceOf(n.anchor)?.chapterId === null).sort(byTime);
    if (whole.length > 0) chapters.push({ chapterId: null, title: 'The whole book', notes: whole });
    for (const ch of book.chapters) {
      const inChapter = mine.filter((n) => bookPlaceOf(n.anchor)?.chapterId === ch.id).sort((a, b) => blockOf(a) - blockOf(b) || byTime(a, b));
      if (inChapter.length > 0) chapters.push({ chapterId: ch.id, title: ch.title, notes: inChapter });
    }
    // a note on a chapter the book does not have any more still shows, after the chapters it has
    const strays = mine.filter((n) => { const c = bookPlaceOf(n.anchor)?.chapterId; return c != null && !book.chapters.some((x) => x.id === c); }).sort(byTime);
    if (strays.length > 0) chapters.push({ chapterId: null, title: 'A chapter that is not in this edition', notes: strays });
    groups.push({ bookId: book.id, title: book.title, subtitle: book.subtitle, chapters });
  }
  if (loose.length > 0) groups.push({ bookId: null, title: OTHER_NOTES_TITLE, subtitle: OTHER_NOTES_LINE, chapters: [{ chapterId: null, title: '', notes: [...loose].sort(byTime) }] });
  return groups;
}

/** The words a note is found by: its own words, the words it was made on, and the names of its book and chapter. */
export function noteWords(n: Note, catalog: readonly CatalogBook[]): string[] {
  const a = bookPlaceOf(n.anchor);
  const book = a ? catalog.find((b) => b.id === a.bookId) : undefined;
  const chapter = book && a?.chapterId ? book.chapters.find((c) => c.id === a.chapterId) : undefined;
  return wordsOf(`${n.text} ${n.quote} ${book?.title ?? ''} ${chapter?.title ?? ''} ${n.type === 'reflection' ? 'reflection' : ''}`);
}

/**
 * The notes that match a query, in the same order they were given. The rule is the Library search's: case, accents and punctuation do not
 * matter, every word of the query has to start a word of the note. A query with no words in it finds nothing; callers do not search at all
 * for a blank one (isSearching in library/search.ts).
 */
export function searchNotes(notes: readonly Note[], query: string, catalog: readonly CatalogBook[]): Note[] {
  const q = wordsOf(query);
  if (q.length === 0) return [];
  return notes.filter((n) => matchesWords(q, noteWords(n, catalog)));
}

/** The names that title a Diary page grown from a note, and the sheet of the note: its book and its chapter or day, when the catalog has them. */
export function titlesOf(n: Pick<Note, 'anchor'>, catalog: readonly CatalogBook[]): { book: string | null; chapter: string | null } {
  const a = bookPlaceOf(n.anchor);
  const book = a ? findBook(catalog, a.bookId) : null;
  const chapter = book && a?.chapterId ? findChapter(book.chapters, a.chapterId) : null;
  return { book: book?.title ?? null, chapter: chapter?.title ?? null };
}

/**
 * Where a note is in the app: the reader at its chapter (and its paragraph), or the book's own screen for a note on the whole book. Null for a
 * note that is not on a book, or on a book or a chapter the app does not have: there is nowhere to go.
 */
export function noteRoute(n: Pick<Note, 'anchor'>, catalog: readonly CatalogBook[]): string | null {
  const a = bookPlaceOf(n.anchor);
  const book = a ? findBook(catalog, a.bookId) : null;
  if (!a || !book) return null;
  if (a.chapterId === null) return `/library/book/${book.id}`;
  if (!findChapter(book.chapters, a.chapterId)) return null;
  return `/library/book/${book.id}/${a.chapterId}${a.block === null ? '' : `?block=${a.block}`}`;
}
