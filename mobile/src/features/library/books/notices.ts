// THE WORDING OF THE NOTICE ON EVERY BOOK PAGE, by kind of book. This is the one place to change it: BookPage.tsx shows `noticeFor(book.kind)` for every book and nowhere
// else says any of this. Plain data, no React.
//
// What it has to be: short, plain and true. These books were written with AI assistance and no person has checked the facts of the guides yet (see books/series.md, the
// part called "What passes does and does not mean"), so a page says so; the passages of a book of readings are word for word from a public-domain edition (the Licences
// screen names each edition: sources.ts), and the reflections around them are new text. Do not write "reviewed" or "checked by a person" here unless that has happened.
// If who checked what changes, change the sentence, not the screen.

export const GUIDE_NOTICE = 'Written with AI assistance. A person has not yet checked the facts of this guide: confirm distances, water and services before you walk.';

export const READINGS_NOTICE = 'Passages are word for word from the public-domain edition named on the Licences screen. The reflections are original text written with AI assistance.';

/** For a book whose kind this app does not know (a newer bundle in an older app): the most careful of the two things the notices say. */
export const OTHER_NOTICE = 'Written with AI assistance. A person has not yet checked this book: confirm anything you rely on before you walk.';

/** The notice of a book of this kind: never empty, so a page can never be without one. */
export function noticeFor(kind: string): string {
  if (kind === 'guide') return GUIDE_NOTICE;
  if (kind === 'reflection') return READINGS_NOTICE;
  return OTHER_NOTICE;
}
