// Where a chapter is in the straight read of the Bible, and the address of a chapter. Pure: no React, no React Native (plain node tests cover it,
// npm run test:library).
//
// The order is the order of the Bible tab: the Old Testament, then the Deuterocanon, then the New Testament, each book after the book before
// it (books.ts). "Next" from the last chapter of a book is the first chapter of the book after it, across the three parts, so nothing is
// skipped and one can read the 73 books in a row: Malachi 4 is followed by Tobit 1 and 2 Maccabees 15 by Matthew 1. Genesis 1 has no
// previous chapter and Revelation 22 has no next one.
import { BIBLE_BOOKS, bookByCode } from './books';
import { formatRef, refKey, type Ref } from './ref';

/** A chapter of a book. */
export type Place = { code: string; chapter: number };

const INDEX = new Map(BIBLE_BOOKS.map((b, i) => [b.code, i]));

/** Is this a chapter that exists in the list (a book of the list, a chapter from 1 to its last)? A place from outside (a link, a saved place) is asked before it is used. */
export function isPlace(p: unknown): p is Place {
  if (!p || typeof p !== 'object') return false;
  const { code, chapter } = p as { code?: unknown; chapter?: unknown };
  if (typeof code !== 'string' || typeof chapter !== 'number' || !Number.isInteger(chapter)) return false;
  const book = bookByCode(code);
  return !!book && chapter >= 1 && chapter <= book.chapters;
}

/** The chapter before this one: the one above it in its book, else the last of the book before it. null at Genesis 1 (and for a place that does not exist). */
export function previousPlace(p: Place): Place | null {
  if (!isPlace(p)) return null;
  if (p.chapter > 1) return { code: p.code, chapter: p.chapter - 1 };
  const at = INDEX.get(p.code) ?? 0;
  if (at === 0) return null;
  const before = BIBLE_BOOKS[at - 1];
  return { code: before.code, chapter: before.chapters };
}

/** The chapter after this one: the next in its book, else the first of the book after it. null at Revelation 22 (and for a place that does not exist). */
export function nextPlace(p: Place): Place | null {
  if (!isPlace(p)) return null;
  const book = bookByCode(p.code)!;
  if (p.chapter < book.chapters) return { code: p.code, chapter: p.chapter + 1 };
  const at = INDEX.get(p.code) ?? BIBLE_BOOKS.length - 1;
  if (at >= BIBLE_BOOKS.length - 1) return null;
  return { code: BIBLE_BOOKS[at + 1].code, chapter: 1 };
}

const nameOf = (code: string): string | undefined => bookByCode(code)?.name;

/** "Psalm 121", "John 3", "1 Corinthians 13": a chapter named the way a reference says it. For the words of a button ("Next: Psalm 122") and the Continue reading bar. */
export const placeLabel = (p: Place): string => formatRef({ code: p.code, chapter: p.chapter }, nameOf);

/** The reference to a place and a verse the way a reference says it: "Psalm 121:3". */
export const refLabel = (r: Ref): string => formatRef(r, nameOf);

/** The line over a chapter: "Psalm 121" for the Psalms, "Chapter 3" for every other book. */
export const chapterTitle = (p: Place): string => (p.code === 'PSA' ? `Psalm ${p.chapter}` : `Chapter ${p.chapter}`);

/** What a screen reader says for the button to the chapter before: "Previous: Psalm 120"; without one, there is no button to say it for. */
export const previousLabel = (p: Place): string | null => { const to = previousPlace(p); return to ? `Previous: ${placeLabel(to)}` : null; };

/** The same for the one after: "Next: Psalm 122", "Next: Tobit 1". */
export const nextLabel = (p: Place): string | null => { const to = nextPlace(p); return to ? `Next: ${placeLabel(to)}` : null; };

// ------------------------------------------------------------------------------------------------------------------------- addresses

/** The address of the chapters of a book: "/library/bible/PSA". */
export const bookHref = (code: string): string => `/library/bible/${code}`;

/** The address of a chapter, or of a verse in it: "/library/bible/PSA/121", "/library/bible/PSA/121?v=3". A run of verses keeps its first verse: the reader opens there. */
export function readerHref(r: Ref): string {
  const base = `/library/bible/${r.code}/${r.chapter}`;
  return r.from === undefined ? base : `${base}?v=${r.from}`;
}

/** The place a screen was opened on, from the parts of its address: the code (any case), the chapter, and the verse if there is one. null for a place that is none: never a throw. */
export function placeFromParams(code: unknown, chapter: unknown, verse?: unknown): { place: Place; verse: number | null } | null {
  const c = typeof code === 'string' ? code.toUpperCase() : '';
  const n = typeof chapter === 'string' && /^[1-9]\d{0,2}$/.test(chapter) ? Number(chapter) : NaN;
  const place = { code: c, chapter: n };
  if (!isPlace(place)) return null;
  const v = typeof verse === 'string' && /^[1-9]\d{0,2}$/.test(verse) ? Number(verse) : null;
  return { place, verse: v };
}

/** The key of a chapter, for a place a screen remembers (the chapter last read). */
export const placeKey = (p: Place): string => refKey({ code: p.code, chapter: p.chapter });
