// Anchors: the one way every note and bookmark says what it is about. A pure module (no React, no React Native, nothing stored here;
// plain node tests cover it, npm run test:notes).
//
// The scheme (the design is in .claude/skills/book-publisher/SKILL.md, "In the app"):
//
//   book:<bookId>/<chapterId>#<blockIndex>   a paragraph (a quote or a list) of a chapter or day of a book
//   book:<bookId>/<chapterId>                a whole chapter or day
//   book:<bookId>                            a book
//
// `chapterId` is the chapter's file name without .md; `blockIndex` is the index of the block in the chapter's `blocks` (the quote a note
// stores is what finds the place again if a book is revised: block indexes are not guaranteed to be stable, chapter ids and the text are).
//
// Later kinds join the same scheme without a migration: bible:<translation>/<book>/<chapter>:<verse>, daily:<date>, stage:<routeSlug>/<n>,
// place:<id>. This build reads only `book:`. Anything else that looks like an anchor (a kind, a colon and something after it) is an
// `other` anchor and is kept exactly as it was written: it parses, it formats back to the same text, it is stored, listed and deleted
// like any other, and no code here changes a character of it. So a note written by a build that knows `bible:` survives a build that
// does not, and the day this build learns `bible:` its notes are already there.
//
// The same strings are the keys of bookmarks (library/bookmarks.ts), which also hold the keys of the example rows of the Bible and
// Music tabs ("bible:psalms"): those parse as `other` anchors and are never taken for a place in a book.

/** The longest anchor kept. Far above the longest a book makes (book id, chapter file name, block index), it only bounds a damaged file. */
export const ANCHOR_MAX = 160;

export type BookAnchor = { kind: 'book'; bookId: string; chapterId: string | null; block: number | null };
/** An anchor of a kind this build does not read. `raw` is the whole anchor, kept as it is. */
export type OtherAnchor = { kind: 'other'; raw: string };
export type Anchor = BookAnchor | OtherAnchor;

// Ids are what tools/build_books.py and tools/check_books.py allow: a book id is lower-case words joined by hyphens, a chapter id
// starts with its two digit number (02-day-01-a-stranger-and-a-pilgrim).
const BOOK_ID = '[a-z0-9]+(?:-[a-z0-9]+)*';
const CHAPTER_ID = '[a-z0-9][a-z0-9-]*';
const BLOCK = '(?:0|[1-9][0-9]{0,3})';
const BOOK_ANCHOR = new RegExp(`^book:(${BOOK_ID})(?:/(${CHAPTER_ID})(?:#(${BLOCK}))?)?$`);
// Anything that is at least "kind:something" without blanks or control characters.
const LOOKS_LIKE_AN_ANCHOR = /^[a-z][a-z0-9]*:[^\s\u0000-\u001f\u007f]+$/;

/**
 * The anchor in a string, or null when it is not an anchor at all (not a string, empty, too long, no "kind:" in front, blanks or control
 * characters in it). A `book:` anchor in exactly the forms above is a BookAnchor; every other kind, and a `book:` text that is not in one
 * of those forms (`book:x#3`, `book:x/y#03`), is an OtherAnchor with its text untouched. Never throws.
 */
export function parseAnchor(text: unknown): Anchor | null {
  if (typeof text !== 'string' || text.length === 0 || text.length > ANCHOR_MAX) return null;
  const m = BOOK_ANCHOR.exec(text);
  if (m) return { kind: 'book', bookId: m[1], chapterId: m[2] ?? null, block: m[3] === undefined ? null : Number(m[3]) };
  return LOOKS_LIKE_AN_ANCHOR.test(text) ? { kind: 'other', raw: text } : null;
}

/** The text of an anchor. `formatAnchor(parseAnchor(s))` is `s` for every string that parses. */
export function formatAnchor(a: Anchor): string {
  if (a.kind === 'other') return a.raw;
  if (a.chapterId === null) return `book:${a.bookId}`;
  return a.block === null ? `book:${a.bookId}/${a.chapterId}` : `book:${a.bookId}/${a.chapterId}#${a.block}`;
}

/** The anchor of a book. */
export const bookAnchor = (bookId: string): string => formatAnchor({ kind: 'book', bookId, chapterId: null, block: null });
/** The anchor of a chapter or day of a book. */
export const chapterAnchor = (bookId: string, chapterId: string): string => formatAnchor({ kind: 'book', bookId, chapterId, block: null });
/** The anchor of one block (paragraph, quote or list) of a chapter. */
export const blockAnchor = (bookId: string, chapterId: string, block: number): string => formatAnchor({ kind: 'book', bookId, chapterId, block });

/** The anchor as a place in a book, or null when it is not one (another kind, or not an anchor). */
export function bookPlaceOf(text: unknown): BookAnchor | null {
  const a = parseAnchor(text);
  return a && a.kind === 'book' ? a : null;
}

/** "book", "chapter" or "paragraph": how small the place is. Null for an anchor that is not a place in a book. */
export function bookLevel(a: BookAnchor): 'book' | 'chapter' | 'paragraph' {
  return a.chapterId === null ? 'book' : a.block === null ? 'chapter' : 'paragraph';
}

/** The anchor of the chapter this paragraph is in (the same anchor when it is a chapter already); a book and anything else stay as they are. */
export function chapterOf(text: string): string {
  const a = bookPlaceOf(text);
  return a && a.chapterId !== null ? chapterAnchor(a.bookId, a.chapterId) : text;
}
