// Searching the words of the Bible, as pure functions: the index of the books and the function that loads one are parameters, so plain node
// tests run it against the real files (npm run test:library). No React, no React Native, nothing fetched. searchText.ts hands in the real ones.
//
// How a verse matches. The query is cut into words (letters and numbers, with an apostrophe inside a word: "God's"). Case, accents and
// the shape of quotes do not matter: "GOD’S", "god's" and "Gód's" are the same word, and so are the curly and the straight apostrophe.
// Every word of the query has to be the START of a word of the verse, so "bless" finds "blessed" and "Blessings" and "love lord" finds the
// verses that have a word that starts with "love" and a word that starts with "lord": someone who types sees the list narrow with every
// letter. That is the rule of the search of the Library (search.ts), so the two searches agree. A word in the middle of another does not
// count ("ord" finds nothing in "Lord"). A query with no words in it finds nothing.
//
// The results come in the order of the app: the books of the index, then the chapters, then the verses, so the first `limit` are the first
// verses of the Bible that match, not the best ones: there is no ranking. `marks` are the places of the matches inside `text`, which is
// the words of the verse as one line (no tabs, no line breaks): [start, end) pairs, in order, never overlapping, one for the start of
// every word that matched, as long as the part of the word that was typed.
import type { BookIndexEntry, BookText, VerseHit } from './textTypes';

/** The longest list of words a query may have. The words after it are not looked at: nobody means more, and a pasted page must not make the phone scan the Bible for a minute. */
export const MAX_QUERY_WORDS = 16;

/** The number of hits when a caller does not say. */
export const DEFAULT_LIMIT = 100;

/** The words of a verse as one line: the lines of the verse joined by a space, without the tabs of poetry and without blank lines. */
export const oneLine = (t: string): string => t.split('\n').map((line) => line.replace(/^\t+/, '')).filter(Boolean).join(' ');

const isLetter = (code: number): boolean => (code >= 97 && code <= 122) || (code >= 48 && code <= 57); // a-z 0-9 of the folded text

/**
 * One character in, one character out (so a place in the folded text is the same place in the text): lower case, the curly quotes straight,
 * the no-break space a space, an accented letter its letter. A mark that is a character of its own (a decomposed accent) cannot be dropped
 * without moving the places after it, so it becomes a space: `foldText` is only called on text that has been put in composed form.
 */
function foldUnit(u: string): string {
  if (u === '\u2018' || u === '\u2019') return "'";
  if (u === '\u201c' || u === '\u201d') return '"';
  if (u === '\u00a0') return ' ';
  const lower = u.normalize('NFD')[0].toLowerCase()[0]; // [0] twice: the letter without its accent, and one unit of its lower case, so the length cannot change
  return lower >= '\u0300' && lower <= '\u036f' ? ' ' : lower;
}

/** Folds a verse, a character at a time: the result is as long as the text, so a match found in it is a place in the text. */
export function foldText(text: string): string {
  const composed = text.normalize('NFC');
  if (/^[\u0000-\u007f\u2013\u2014\u2018-\u201d\u00a0]*$/.test(composed)) {
    // The text of this edition: ASCII, the curly quotes, the dashes, the no-break space. Same result as the loop below, a lot faster.
    return composed.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\u00a0/g, ' ');
  }
  let out = '';
  for (let i = 0; i < composed.length; i += 1) out += foldUnit(composed[i]);
  return out;
}

/** The words of a query, folded: a-z, 0-9 and an apostrophe between two of them. Not the same word twice. */
export function queryWords(query: string): string[] {
  const folded = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[\u2018\u2019]/g, "'");
  const words = folded.match(/[a-z0-9]+(?:'[a-z0-9]+)*/g) ?? [];
  return [...new Set(words)].slice(0, MAX_QUERY_WORDS);
}

/** `i` starts a word of the folded text `f`: nothing of a word before it ("god's": the s does not start a word). */
function startsWord(f: string, i: number): boolean {
  if (i === 0) return true;
  if (isLetter(f.charCodeAt(i - 1))) return false;
  return !(f.charCodeAt(i - 1) === 39 && i >= 2 && isLetter(f.charCodeAt(i - 2)));
}

/** The places of the matches of every word in the folded verse, or null when one of the words is not there. */
export function matchVerse(f: string, words: readonly string[]): Array<[number, number]> | null {
  const marks: Array<[number, number]> = [];
  for (const w of words) {
    let found = false;
    for (let i = f.indexOf(w); i >= 0; i = f.indexOf(w, i + 1)) {
      if (startsWord(f, i)) {
        marks.push([i, i + w.length]);
        found = true;
      }
    }
    if (!found) return null;
  }
  marks.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: Array<[number, number]> = [];
  for (const m of marks) {
    const last = merged[merged.length - 1];
    if (last && m[0] <= last[1]) last[1] = Math.max(last[1], m[1]);
    else merged.push([m[0], m[1]]);
  }
  return merged;
}

export type VerseSearch = {
  /** The verses that match, in the order of the Bible, at most `limit` (100 when it is not given; nothing when it is less than 1). Reads and folds all 73 books on the first call. */
  searchVerses: (query: string, limit?: number) => VerseHit[];
  /** Reads and folds the books now, so that the first search does not have to. Safe to call again. */
  prepare: () => void;
};

/** What the search keeps of a verse: where it is, and its words folded (the words themselves are read from the book again for the few that match). */
type Entry = { b: number; c: number; v: number; f: string };

export function makeSearch(index: readonly BookIndexEntry[], loadBook: (code: string) => BookText): VerseSearch {
  let entries: Entry[] | null = null;
  const books: BookText[] = [];

  const prepare = (): void => {
    if (entries) return;
    const list: Entry[] = [];
    index.forEach((info, b) => {
      const book = loadBook(info.code);
      books[b] = book;
      book.chapters.forEach((chapter, c) => {
        chapter.verses.forEach((verse, v) => {
          const text = oneLine(verse.t).normalize('NFC');
          if (!text) return; // a verse the edition prints only as a note has no words to find
          list.push({ b, c, v, f: foldText(text) });
        });
      });
    });
    entries = list;
  };

  const searchVerses = (query: string, limit: number = DEFAULT_LIMIT): VerseHit[] => {
    const words = queryWords(query);
    const most = Math.floor(limit);
    if (words.length === 0 || !(most >= 1)) return [];
    prepare();
    const hits: VerseHit[] = [];
    for (const e of entries as Entry[]) {
      const marks = matchVerse(e.f, words);
      if (!marks) continue;
      const book = books[e.b];
      const chapter = book.chapters[e.c];
      const verse = chapter.verses[e.v];
      hits.push({ code: book.code, chapter: chapter.c, verse: verse.n, text: oneLine(verse.t).normalize('NFC'), marks });
      if (hits.length >= most) break;
    }
    return hits;
  };

  return { searchVerses, prepare };
}
