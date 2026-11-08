// The words of the Books tab, the book page and the reader, and what the banner of the tab says in each of its three states, as plain data and pure functions: no React,
// no React Native (plain node tests cover it, npm run test:library). The screens draw these.
//
// Every book that is in the bundle has its text, so nothing here says "soon" or "preview": a book is in the list and can be read, or it is not in the list. The notice that
// every book page shows (that the books were written with AI assistance, and what has and has not been checked) is NOT here: it is in notices.ts, a file of its own, so that
// whoever owns the wording changes it in one place.
import type { BookKind } from './index';
import type { BookPlace } from './reading';

export const BOOKS_BANNER_TITLE = 'Books for the road';
export const START_CTA = 'Start reading';
export const CONTINUE_CTA = 'Continue reading';
/**
 * The one handwritten note of the banner (Caveat), only when there is a button beside it. Seven characters at most: the pill takes most of the card on a 320
 * wide phone ("Continue reading" is 172 wide there), and the room left for a note in 24 point handwriting is about 72.
 */
export const START_NOTE = 'No rush';
export const CONTINUE_NOTE = 'Onward!';
/** While the bundle holds no book at all (it never does in a build of the app; a screen still has to say something true). */
export const NONE_LABEL = 'Books';
export const NONE_LINE = 'There are no books to show yet.';

/** The kinds of book, in the order of the shelves. */
export const KIND_ORDER: readonly BookKind[] = ['guide', 'reflection'];
/** What one book of a kind is called: on its cover, its page, and what a screen reader says. */
export const KIND_NAME: Record<BookKind, string> = { guide: "Pilgrim's guide", reflection: 'Readings for the Way' };
/** The short word in a small mark (mono, capitals) on a row and on a page. */
export const KIND_MARK: Record<BookKind, string> = { guide: 'GUIDE', reflection: 'READINGS' };
/** The heading of the shelf of a kind, and the one quiet line under it. */
export const SHELF_TITLE: Record<BookKind, string> = { guide: "Pilgrim's guides", reflection: 'Readings for the Way' };
export const SHELF_LINE: Record<BookKind, string> = {
  guide: 'Practical guides to the Caminos: when to go, the stages, what to carry.',
  reflection: 'A famous book of the past, a few pages a day, paired with a Camino.',
};
/** The shelf of a book whose kind this app does not know (a newer bundle in an older app): it is still shown, and still opens. */
export const OTHER_SHELF_TITLE = 'More books';

const isKind = (kind: string): kind is BookKind => kind === 'guide' || kind === 'reflection';
export const kindName = (kind: string): string => (isKind(kind) ? KIND_NAME[kind] : 'Book');
export const kindMark = (kind: string): string => (isKind(kind) ? KIND_MARK[kind] : 'BOOK');

/** The one short handwritten note of a book page (Caveat): for a guide a wish for the road, for readings a way to read them. */
export const PAGE_NOTE: Record<BookKind, string> = { guide: 'Buen Camino!', reflection: 'A little each day' };
export const pageNote = (kind: string): string => (isKind(kind) ? PAGE_NOTE[kind] : PAGE_NOTE.reflection);

export type Shelf<T> = { kind: string; title: string; line: string; books: T[] };

/**
 * The books on their shelves: the guides, then the readings, each in the order it was given (the order of the shelves), and then, if there are any, the books of a kind
 * that is not one of those two. A shelf with no book is not there, so a bundle with only guides shows only guides.
 */
export function shelves<T extends { kind: string }>(books: readonly T[]): Shelf<T>[] {
  const out: Shelf<T>[] = [];
  for (const kind of KIND_ORDER) {
    const own = books.filter((b) => b.kind === kind);
    if (own.length > 0) out.push({ kind, title: SHELF_TITLE[kind], line: SHELF_LINE[kind], books: own });
  }
  const rest = books.filter((b) => !isKind(b.kind));
  if (rest.length > 0) out.push({ kind: 'other', title: OTHER_SHELF_TITLE, line: '', books: rest });
  return out;
}

/** A book id that is not in the Library (an old or a wrong link). */
export const UNKNOWN_TITLE = 'That book is not in the Library';
export const UNKNOWN_TEXT = 'The link may be old. The books are on the Books tab of the Library.';
/** A book that is in the Library but whose text cannot be read (a damaged file): the page says so instead of a blank. */
export const UNREADABLE_TITLE = 'This book could not be opened';
export const UNREADABLE_TEXT = 'Its text looks damaged. Updating the app should put it right.';
/** A chapter that the text does not have (an old link): the reader says so and offers the table of contents. */
export const NO_CHAPTER_TEXT = 'This book has no such chapter, so here is its table of contents.';

export const END_OF_BOOK = 'End of the book';

export type BannerBook = { id: string; title: string };

/** What the banner of the Books tab shows: nothing to press, a button that opens the first book, or one that goes on where the person stopped. */
export type BooksBannerView =
  | { kind: 'none'; label: string; title: string; line: string }
  | { kind: 'start'; label: string; title: string; note: string; cta: string; hint: string; bookId: string }
  | { kind: 'continue'; label: string; title: string; note: string; cta: string; hint: string; bookId: string };

/**
 * The banner of the Books tab, for the books in the order of the shelves (`books`) and the place read last (`last`). With no book it says so plainly and has no button.
 * Otherwise "Start reading" opens the first book, and once something has been read it is "Continue reading", which opens the book read last at the chapter and the
 * line where the person stopped. The place in a book that is no longer in the list is not used: the banner never offers what cannot open.
 */
export function booksBanner(books: readonly BannerBook[], last: Pick<BookPlace, 'id'> | null): BooksBannerView {
  if (books.length === 0) return { kind: 'none', label: NONE_LABEL, title: BOOKS_BANNER_TITLE, line: NONE_LINE };
  const again = last ? books.find((b) => b.id === last.id) : undefined;
  if (again) {
    return { kind: 'continue', label: again.title, title: BOOKS_BANNER_TITLE, note: CONTINUE_NOTE, cta: CONTINUE_CTA, hint: `Opens ${again.title} where you stopped`, bookId: again.id };
  }
  const first = books[0];
  return { kind: 'start', label: first.title, title: BOOKS_BANNER_TITLE, note: START_NOTE, cta: START_CTA, hint: `Opens ${first.title}`, bookId: first.id };
}

/** The path of a book page, and of its reader (at a chapter, when one is given). */
export const bookPath = (id: string): string => `/library/book/${id}`;
export const readerPath = (id: string, chapterId?: string): string => `/library/book/${id}/read${chapterId ? `?c=${encodeURIComponent(chapterId)}` : ''}`;
