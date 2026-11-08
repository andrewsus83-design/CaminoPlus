// TEMPORARY, replaced by the real searchText.ts of the data branch. The same API over the few chapters of the fixture: every word of the
// query has to occur in the verse (case, accents and curly quotes do not matter); the answer is in the order of the books of the app, then
// the chapter, then the verse; the marks are [start, end) offsets into the words of the verse as one line.
import { BIBLE_BOOKS } from './books';
import { loadBook } from './text';
import type { VerseHit } from './textTypes';

/** One character at a time, so that an offset in the folded text is an offset in the original: accents and curly quotes become their plain letter. */
const fold = (s: string): string => {
  let out = '';
  for (const ch of s) {
    const plain = ch.normalize('NFD')[0].toLowerCase();
    out += plain === '‘' || plain === '’' ? "'" : plain === '“' || plain === '”' ? '"' : plain;
  }
  return out;
};

const oneLine = (t: string): string => t.replace(/[\t\n]+/g, ' ').replace(/ {2,}/g, ' ').trim();

export function searchVerses(query: string, limit = 100): VerseHit[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const hits: VerseHit[] = [];
  if (words.length === 0) return hits;
  for (const b of BIBLE_BOOKS) {
    for (const ch of loadBook(b.code).chapters) {
      for (const v of ch.verses) {
        const text = oneLine(v.t);
        if (!text) continue;
        const folded = fold(text);
        if (!words.every((w) => folded.includes(w))) continue;
        const marks: Array<[number, number]> = [];
        for (const w of words) for (let at = folded.indexOf(w); at >= 0; at = folded.indexOf(w, at + w.length)) marks.push([at, at + w.length]);
        marks.sort((a, z) => a[0] - z[0]);
        hits.push({ code: b.code, chapter: ch.c, verse: v.n, text, marks });
        if (hits.length >= limit) return hits;
      }
    }
  }
  return hits;
}
