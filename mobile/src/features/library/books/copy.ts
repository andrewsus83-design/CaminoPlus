// The words of the Books tab, the book page and the reader, and what the banner of the tab says in each of its three states, as plain
// data and pure functions: no React, no React Native (plain node tests cover it, npm run test:library). The screens draw these.
//
// Whether a book has a text is never kept here or in the catalog: a screen asks bookText.ts (`hasBookText`) and hands the answer in. A book
// without a text says "Soon" and why (its edition is still being checked); nothing here says "verified" or "official".
import type { BookPlace } from './reading';

export const BOOKS_BANNER_TITLE = 'Books for the road';
export const START_CTA = 'Start reading';
export const CONTINUE_CTA = 'Continue reading';
/** The one handwritten note of the banner (Caveat), only when there is a button beside it. */
export const START_NOTE = 'Take your time';
export const CONTINUE_NOTE = 'Welcome back';
export const NONE_LINE = 'The texts are being checked.';

/** A book that has no text in the app yet: on its page, and why. */
export const NOT_YET_TITLE = 'Not in the app yet';
export const NOT_YET_TEXT = 'We are checking the edition of this book before we add it.';
/** A book id that is not one of the twelve (an old or a wrong link). */
export const UNKNOWN_TITLE = 'That book is not in the Library';
export const UNKNOWN_TEXT = 'The link may be old. The twelve books are on the Books tab of the Library.';
/** A chapter that the text does not have (an old link): the reader says so and offers the table of contents. */
export const NO_CHAPTER_TEXT = 'This book has no such chapter, so here is its table of contents.';

export const END_OF_BOOK = 'End of the book';

export type BannerBook = { id: string; title: string };

/** What the banner of the Books tab shows: nothing to press, a button that opens the first book with a text, or one that goes on where the person stopped. */
export type BooksBannerView =
  | { kind: 'none'; label: string; title: string; line: string }
  | { kind: 'start'; label: string; title: string; note: string; cta: string; hint: string; bookId: string }
  | { kind: 'continue'; label: string; title: string; note: string; cta: string; hint: string; bookId: string };

/**
 * The banner of the Books tab, in the order of the books (`books`), for the books that have a text (`has`) and the place read last (`last`).
 * No book has a text: it says plainly that the texts are being checked, and has no button. Some have: "Start reading" opens the first of them, and
 * once something has been read it is "Continue reading", which opens the book read last at the chapter where the person stopped. The place of
 * a book that has no text is not used: the banner never offers what cannot open.
 */
export function booksBanner(books: readonly BannerBook[], has: (id: string) => boolean, last: Pick<BookPlace, 'id'> | null): BooksBannerView {
  const readable = books.filter((b) => has(b.id));
  if (readable.length === 0) {
    return { kind: 'none', label: `Books · ${books.length} free`, title: BOOKS_BANNER_TITLE, line: NONE_LINE };
  }
  const again = last ? readable.find((b) => b.id === last.id) : undefined;
  if (again) {
    return { kind: 'continue', label: again.title, title: BOOKS_BANNER_TITLE, note: CONTINUE_NOTE, cta: CONTINUE_CTA, hint: `Opens ${again.title} where you stopped`, bookId: again.id };
  }
  const first = readable[0];
  return { kind: 'start', label: first.title, title: BOOKS_BANNER_TITLE, note: START_NOTE, cta: START_CTA, hint: `Opens ${first.title}`, bookId: first.id };
}

export type BooksNoticeView = { title: string; text: string };

/** The notice under the banner: none once every book has its text, what is still missing otherwise. `readable` of `total` have a text. */
export function booksNotice(readable: number, total: number): BooksNoticeView | null {
  if (readable >= total) return null;
  if (readable <= 0) return { title: 'Preview', text: 'Books are not in the app yet. We are checking the editions before we add them.' };
  const are = readable === 1 ? 'is' : 'are';
  return {
    title: 'More books are coming',
    text: `${readable} of the ${total} books ${are} in the app and can be read with no signal. The others say Soon: we are still checking their editions before we add them.`,
  };
}

/** The path of a book page, and of its reader (at a chapter, when one is given). */
export const bookPath = (id: string): string => `/library/book/${id}`;
export const readerPath = (id: string, chapterId?: string): string => `/library/book/${id}/read${chapterId ? `?c=${encodeURIComponent(chapterId)}` : ''}`;
