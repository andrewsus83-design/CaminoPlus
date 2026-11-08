// The words of the Books tab, the book page and the reader, and what the banner of the tab says in each of its three states, as plain
// data and pure functions: no React, no React Native (plain node tests cover it, npm run test:library). The screens draw these.
//
// Whether a book has a text is never kept here or in the catalog: a screen asks bookText.ts (`hasBookText`) and hands the answer in. A book
// without a text says "Soon" and why (its edition is still being checked); nothing here says "verified" or "official".
import { BOOKS_NOTICE } from '../sample';
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
export const NONE_LINE = 'The texts are being checked.';
/** The small line of the banner while no book has a text: the same word as the covers say. */
export const NONE_LABEL = 'Books · Soon';

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
    return { kind: 'none', label: NONE_LABEL, title: BOOKS_BANNER_TITLE, line: NONE_LINE };
  }
  const again = last ? readable.find((b) => b.id === last.id) : undefined;
  if (again) {
    return { kind: 'continue', label: again.title, title: BOOKS_BANNER_TITLE, note: CONTINUE_NOTE, cta: CONTINUE_CTA, hint: `Opens ${again.title} where you stopped`, bookId: again.id };
  }
  const first = readable[0];
  return { kind: 'start', label: first.title, title: BOOKS_BANNER_TITLE, note: START_NOTE, cta: START_CTA, hint: `Opens ${first.title}`, bookId: first.id };
}

/** What stands under the banner of the Books tab: a card (the Preview notice) while no book has a text, one quiet line while some have, nothing when all have. */
export type BooksNoticeView = { kind: 'card'; title: string; text: string } | { kind: 'line'; text: string };

/** The notice under the banner: what is still missing, said honestly. `readable` of `total` books have a text. */
export function booksNotice(readable: number, total: number): BooksNoticeView | null {
  if (readable >= total) return null;
  if (readable <= 0) return { kind: 'card', title: 'Preview', text: BOOKS_NOTICE };
  const are = readable === 1 ? 'is' : 'are';
  return {
    kind: 'line',
    text: `${readable} of the ${total} books ${are} in the app and can be read with no signal. The others say Soon: we are still checking their editions.`,
  };
}

/** The path of a book page, and of its reader (at a chapter, when one is given). */
export const bookPath = (id: string): string => `/library/book/${id}`;
export const readerPath = (id: string, chapterId?: string): string => `/library/book/${id}/read${chapterId ? `?c=${encodeURIComponent(chapterId)}` : ''}`;
