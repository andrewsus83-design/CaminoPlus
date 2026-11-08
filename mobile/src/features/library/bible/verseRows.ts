// The verse rows of the Library: a verse that a search found, and a verse that is bookmarked, as what a row needs to draw (its place in words, its
// words, the letters to mark). Pure: no React, no React Native, and the text comes in through a `TextSource` (the real one is text.ts), so plain node
// tests cover it with a text of their own (npm run test:library).
//
// A bookmark of a verse is kept under its place: "bible:PSA.121.3" (ref.ts). The place is looked up in the text when the row is drawn, so what the
// row shows is always what the text says, and a bookmark whose chapter or verse is not in the text (a key from a longer list, a damaged file, a book that
// cannot be read) shows nothing and breaks nothing.
import { bookByCode } from './books';
import { refLabel } from './order';
import { parseRefKey, refKey, refOfVerse, verseRange, type Ref } from './ref';
import { verseText } from './blocks';
import type { BookText, VerseHit } from './textTypes';

/** Where the words of the Bible come from: text.ts. Handed in, so that this file can be tested without the files of the text. */
export type TextSource = { hasBook: (code: string) => boolean; loadBook: (code: string) => BookText };

/** A verse as a row of results or of Bookmarks draws it. `key` is the place as ref.ts writes it ("PSA.121.3"); `label` is the place in words ("Psalm 121:3"). */
export type VerseRow = { key: string; ref: Ref; label: string; text: string; marks: Array<[number, number]> };

/** At most this many verses are listed for a search: a word in a hundred places is "love", not an answer. */
export const VERSE_RESULTS_MAX = 100;

/** The row for one verse a search found. null for a hit that is not a verse of a book of the list or whose label is no number or run. */
export function rowOfHit(h: VerseHit): VerseRow | null {
  const ref = refOfVerse(h.code, h.chapter, h.verse);
  if (!ref || !bookByCode(h.code)) return null; // a code the list does not know has no name to say
  return { key: refKey(ref), ref, label: refLabel(ref), text: h.text, marks: cleanMarks(h.text, h.marks) };
}

/** The rows of the hits, in the order the search gave them, at most VERSE_RESULTS_MAX. */
export function rowsOfHits(hits: readonly VerseHit[]): VerseRow[] {
  const rows: VerseRow[] = [];
  for (const h of hits) {
    if (rows.length >= VERSE_RESULTS_MAX) break;
    const row = rowOfHit(h);
    if (row) rows.push(row);
  }
  return rows;
}

/**
 * The row of a bookmarked verse: the verse is looked up in the text. `key` is what the bookmark is kept under ("PSA.121.3"), the part after "bible:".
 * null when it is not a verse key (a book's id, a chapter), when the book cannot be read, or when the chapter or the verse is not there or has no words.
 */
export function rowOfKey(key: string, source: TextSource): VerseRow | null {
  const ref = parseRefKey(key);
  if (!ref || ref.from === undefined || !source.hasBook(ref.code)) return null;
  try {
    const chapter = source.loadBook(ref.code).chapters.find((c) => c.c === ref.chapter);
    const verse = chapter?.verses.find((v) => {
      const r = verseRange(v.n);
      return !!r && ref.from! >= r.from && ref.from! <= r.to && /\S/.test(v.t);
    });
    if (!verse) return null;
    const own = refOfVerse(ref.code, ref.chapter, verse.n);
    if (!own) return null;
    return { key, ref: own, label: refLabel(own), text: verseText(verse), marks: [] };
  } catch {
    return null;
  }
}

/** The marks that can be drawn: inside the text, not empty, in order, and not overlapping (what overlaps is joined). Bad ones are dropped, never thrown at. */
export function cleanMarks(text: string, marks: ReadonlyArray<readonly [number, number]>): Array<[number, number]> {
  const ok = marks
    .filter((m) => Array.isArray(m) && Number.isInteger(m[0]) && Number.isInteger(m[1]))
    .map(([a, b]): [number, number] => [Math.max(0, a), Math.min(text.length, b)])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const out: Array<[number, number]> = [];
  for (const m of ok) {
    const last = out[out.length - 1];
    if (last && m[0] <= last[1]) last[1] = Math.max(last[1], m[1]);
    else out.push([m[0], m[1]]);
  }
  return out;
}

export type Segment = { text: string; mark: boolean };

/** The text cut into pieces that are marked or not, in order, so that joined they are the text again. */
export function segments(text: string, marks: ReadonlyArray<readonly [number, number]>): Segment[] {
  const out: Segment[] = [];
  let at = 0;
  for (const [a, b] of cleanMarks(text, marks)) {
    if (a > at) out.push({ text: text.slice(at, a), mark: false });
    out.push({ text: text.slice(a, b), mark: true });
    at = b;
  }
  if (at < text.length) out.push({ text: text.slice(at), mark: false });
  return out;
}

/** A verse longer than this is cut to a piece of this size around its first match in a list of results. */
export const EXCERPT_MAX = 160;

/**
 * The piece of a verse that a list draws: the whole verse when it is short, else about EXCERPT_MAX letters that begin a little before the first match (at a
 * word), with an ellipsis where it was cut, and the marks moved to match. So a match is never cut off at the third line of a row.
 */
export function excerpt(text: string, marks: ReadonlyArray<readonly [number, number]>, max: number = EXCERPT_MAX): { text: string; marks: Array<[number, number]> } {
  const clean = cleanMarks(text, marks);
  if (text.length <= max) return { text, marks: clean };
  let start = clean.length > 0 ? Math.max(0, clean[0][0] - Math.floor(max / 4)) : 0;
  if (start > 0) {
    const space = text.indexOf(' ', start);
    start = space >= 0 && space < clean[0]?.[0] ? space + 1 : start;
  }
  let end = Math.min(text.length, start + max);
  if (end < text.length) {
    const space = text.lastIndexOf(' ', end);
    if (space > start + max / 2) end = space;
  }
  const head = start > 0 ? '…' : '';
  const tail = end < text.length ? '…' : '';
  const shift = head.length - start;
  const moved = clean
    .filter(([a, b]) => b > start && a < end)
    .map(([a, b]): [number, number] => [Math.max(a, start) + shift, Math.min(b, end) + shift]);
  return { text: `${head}${text.slice(start, end)}${tail}`, marks: moved };
}

/** The longest a verse is drawn in a list before it is cut with an ellipsis: results and Bookmarks show a few lines, the reader shows all of it. */
export const ROW_TEXT_LINES = 3;

/**
 * What the verse search is run for: the words of the query, one space between them, or '' for a query that is too short to look for (nothing
 * but blanks and punctuation, or letters so few that every verse has them: a word of one letter is not a search). The words that are only
 * numbers do count: "john 3 16" is looked for as it is typed.
 */
export function verseQuery(query: string): string {
  const words = query.replace(/[“”‘’"'.,;:!?()[\]{}<>\\/|@#$%^&*_+=~`-]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  return words.some((w) => w.length >= 2) ? words.join(' ') : '';
}

/** The line over the verses of a search: "Verses · 12", and a word more when the list was cut ("Verses · 100+"). */
export const versesLabel = (rows: number, capped: boolean): string => `Verses · ${rows}${capped ? '+' : ''}`;

/** What is said under a list of verses that was cut. */
export const VERSES_CAPPED_NOTE = `Showing the first ${VERSE_RESULTS_MAX} verses. Add a word to narrow the search.`;

/** How long a search may take before the next one says it is searching: the first search reads the books and takes the longest, later ones are quick. */
export const SLOW_SEARCH_MS = 120;

/** Should the screen say "Searching..." before this search, given how long the last one took (null: there was none yet, the books are still to be read)? */
export const announcesSearch = (previousMs: number | null): boolean => previousMs === null || previousMs >= SLOW_SEARCH_MS;
