// Where "Continue reading" goes: the place read most recently, in the Bible or in one of the books. Pure: no React, no React Native, nothing stored here (plain node
// tests cover it, npm run test:library). useContinueBar.ts reads the two stores and hands what it found in.
//
// The two places are kept by things that already exist and are not changed here: the Bible keeps the chapter read last under `u.<userId>.library.lastRead`
// (bible/lastRead.ts) and the books keep every book's place under `u.<userId>.library.reading` (books/reading.ts). Both write the time of the place in milliseconds,
// so the most recent is the one with the larger time. A place with no time (an older file, a time that does not read) counts as time 0: it still loads, and it loses to
// any place that has a time. When the two are equal (both unknown, or the same millisecond) the Bible wins: it is the first tab.
//
// What is drawn for a place is also worked out here: the words ("Genesis 3", "The French Way · Chapter 2"), what a screen reader says for the bar, the glyph and the
// address the bar opens. The address is the one the two cards had before the bar replaced them: the reader of the chapter for the Bible, the reader of the book (which opens
// where the person stopped) for a book. A book is named by the title the Books tab shows for it (books/catalog.ts: each of the 26 books of the Library has a title of its
// own, and some are long: "The Mountain of the Heart").
import { bookByCode } from '../bible/books';
import { CONTINUE_TITLE, continueLabel, parseLastRead } from '../bible/lastRead';
import { placeLabel, readerHref } from '../bible/order';
import { bookById } from '../books/catalog';
import { readerPath } from '../books/copy';
import { lastRead, resumeAt, type ChapterRef, type StoredReading } from '../books/reading';

/** The chapter of the Bible read last, and when. */
export type BibleSpot = { kind: 'bible'; code: string; chapter: number; at: number };
/** The book read last, the chapter and how far down it (0 to 1), and when. */
export type BookSpot = { kind: 'book'; id: string; c: string; y: number; at: number };
export type Spot = BibleSpot | BookSpot;

/** A time kept on the phone as a number of milliseconds, or 0 when it is missing or is no time (a string, NaN, a negative number). */
export function stampOf(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : 0;
}

/**
 * The chapter of the Bible in a stored value, with its time. The place is judged by bible/lastRead.ts (parseLastRead): a value that is not its shape, or names a chapter
 * that is not in the Bible, is no place. The time is read apart, so a value from before the time was kept, or with a damaged time, still loads (as time 0).
 */
export function bibleSpotOf(raw: unknown): BibleSpot | null {
  const place = parseLastRead(raw);
  if (!place) return null;
  return { kind: 'bible', code: place.code, chapter: place.chapter, at: stampOf((raw as { at?: unknown }).at) };
}

/** The book read last that `has` a text to open (the caller says which books do), from the places kept for the books (books/reading.ts parseReading), or null. */
export function bookSpotOf(stored: StoredReading, has: (id: string) => boolean): BookSpot | null {
  const p = lastRead(stored, has);
  return p ? { kind: 'book', id: p.id, c: p.c, y: p.y, at: p.at } : null;
}

/** The place read most recently of the two, or null when there is none. The Bible wins a tie. */
export function latestSpot(bible: BibleSpot | null, book: BookSpot | null): Spot | null {
  if (!bible) return book;
  if (!book) return bible;
  return book.at > bible.at ? book : bible;
}

/** What the bar draws and does for a place. */
export type SpotView = {
  /** Names of icons of components/Icon.tsx: the closed book with a cross (the Bible) or the open book (a book of the Books tab). */
  icon: 'book' | 'library';
  /** The place on the second line of the bar, whole: "Genesis 3", "The French Way · Chapter 2". */
  label: string;
  /**
   * The same place in two parts, so that a title too long for the bar is cut and the chapter is not: the bar draws `head` (it may end in an ellipsis) and then `tail` (it never
   * does). `head`, a space and `tail` are `label`. The Bible: "Genesis" and "3". A book: its title and "· Chapter 2", and the title alone (an empty tail) when the chapter is not known.
   */
  head: string;
  tail: string;
  /** What a screen reader says for the bar: "Continue reading, Genesis 3". */
  spoken: string;
  /** The address the bar opens. */
  href: string;
};

export function describeBible(spot: BibleSpot): SpotView {
  const place = { code: spot.code, chapter: spot.chapter };
  const label = placeLabel(place);
  // placeLabel is the name of the book, a space and the chapter: the head is what is left of it without the chapter, so the two parts can never disagree with the whole
  const tail = String(spot.chapter);
  const head = label.endsWith(` ${tail}`) ? label.slice(0, label.length - tail.length - 1) : (bookByCode(spot.code)?.name ?? label);
  return { icon: 'book', label, head, tail, spoken: continueLabel(place), href: readerHref(place) };
}

/**
 * A book's place in words. The chapter is the one the reader will open, counted the way the reader counts it ("Chapter 2 of 24", whatever the parts): where the
 * person stopped, or the next chapter when that one was read to its last lines, or the first when the saved chapter is not in the text (books/reading.ts resumeAt, the
 * same function the book page uses for "Continue: Chapter 7"). `chapters` is the text of the book; without it (a text that cannot be read) only the title is said.
 * null for a book that is not in the catalog: it cannot be named, so it is not offered.
 */
export function describeBook(spot: BookSpot, chapters: readonly ChapterRef[] | null): SpotView | null {
  const book = bookById(spot.id);
  if (!book) return null;
  const chapter = chapters && chapters.length > 0 ? `Chapter ${resumeAt(chapters, { c: spot.c, y: spot.y }).index + 1}` : '';
  return {
    icon: 'library',
    label: chapter ? `${book.title} · ${chapter}` : book.title,
    head: book.title,
    tail: chapter ? `· ${chapter}` : '',
    spoken: `${CONTINUE_TITLE}, ${book.title}${chapter ? `, ${chapter}` : ''}`,
    href: readerPath(spot.id),
  };
}

/** The word on the first line of the bar, the same words the Bible card used. */
export { CONTINUE_TITLE };

/** What a screen reader says for the button that hides the bar. */
export const HIDE_LABEL = 'Hide Continue reading';
/** What a screen reader adds after the name of the bar. */
export const OPEN_HINT = 'Opens the reader where you stopped';

/**
 * Whether the bar is drawn: there is a place, nobody has hidden this very place, and nobody is typing (the keyboard is open or the search field has the focus: the bar would
 * float over the keys).
 */
export function barVisible(input: { present: boolean; typing: boolean }): boolean {
  return input.present && !input.typing;
}
