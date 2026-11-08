// The words at the end of a chapter that say whose text it is. Pure: no React, no React Native (plain node tests cover it, npm run test:library).
//
// The credit line itself is the one of the translation (text.ts, TRANSLATION.credit: the World English Bible, Catholic edition, from eBible.org, public domain, and
// the note that its name is a trademark of eBible.org). Next to it one plain line says what the text is not: it is not the translation read at Mass, so nobody
// takes the daily readings of the Library for it or the other way round.

/** The one plain line, under the credit. */
export const NOT_AT_MASS = 'This is not the translation read at Mass.';

/** The lines at the end of a chapter, in order: the credit, then what it is not. */
export const creditLines = (credit: string): string[] => [credit, NOT_AT_MASS];

/** The one short handwritten note at the end of a chapter (the one Caveat note of the reader). */
export const READER_NOTE = 'Peace on the road';

/** The one handwritten note of the screen of chapters (under the name of the book). */
export const CHAPTERS_NOTE = 'Pick a chapter';
