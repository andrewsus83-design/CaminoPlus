// A reference of the lectionary ("Wisdom 6:12-16", "Genesis 3:9-15, 3:20", "Psalm 87", "1 Peter 1:10-1:16") as data: read from the words the source writes it in, said again in
// one plain way, and looked up in the Bible that is inside the app. Pure: no React, no React Native, nothing fetched; the text comes in through a `TextSource` (the real one is
// bible/text.ts), so plain node tests cover it with the real files (npm run test:library).
//
// THE FORMS IT READS (the ones the source of the days uses; anything else is refused, and a reference that is refused is shown as it is, without words under it):
//   "Wisdom 6:12-16"                   a run of verses
//   "John 19:25-34, 39"                more runs of the same chapter; "Genesis 3:9-15, 3:20" says the chapter again, "Psalm 90:3-4, 14 and 17" has an "and"
//   "1 Peter 1:10-1:16"                the chapter said at both ends of a run
//   "Matthew 9:36-10:8"                a run that goes over a chapter ("Sirach 27:30—28:7" with a long dash, "Galatians 4:22-24, 31–5:1")
//   "Acts 11:21b-26; 13:1-3"           a semicolon starts another chapter
//   "Exodus 34:4b-6,8-9", "Psalm 118:1-2, 12abcd"   a letter after a verse is a part of it (the lectionary reads the first or the second half)
//   "Psalm 87"                         a whole psalm (a whole chapter of any other book is refused: the lectionary does not read one)
//   "Philemon 7-20", "Jude 1:17"       a book of one chapter, with or without its chapter
// A part of a verse (4b, 10a) is read as the whole verse: the text says so under it only where the words are wider than the reference (a psalm); the reference keeps its letter.
//
// WHAT CAN GO WRONG WITH THE WORDS, AND WHAT IS DONE ABOUT IT. The numbers of the lectionary are those of the Hebrew Bible (the Catholic lectionaries follow them), and the words
// of the app are the World English Bible, which numbers the verses the English way. The two agree nearly everywhere and differ in a known set of places, where a verse number of the
// lectionary names another verse of this Bible: the verse before or after, or one that is not there. A shifted verse would put the wrong words under the right name, which is
// worse than no words. So:
//   - the Psalms: a psalm with a title in the Bible (the Hebrew counts the title as one or two verses, so "Psalm 63:2" is the first verse of the English psalm) shows the WHOLE psalm
//     and says so; a psalm with no title (1, 2, 10, 33, 43, 71, 91, 93 to 97, 99, 104 to 107, 111 to 119, 135 to 137, 146 to 150) has the same numbers in both and shows its verses;
//   - the other books: NUMBERING_DIFFERS lists the chapters where the numbers are known to differ; a reference that touches one has no words;
//   - and a verse that the Bible does not have (Malachi 3:23, Micah 5:1 of a chapter that has 15 and means 5:2) has no words either: the whole reference is refused, never cut.
// The list is the usual tables of the differences, kept on the side of caution: a chapter on it only loses its words, a chapter missing from it could show a verse too many or
// too few, so the screen also says that the verse numbers of the Bible can differ from the lectionary's. daily.test.ts reads every reading of the days we have against it.
import { verseText } from '../bible/blocks';
import { BIBLE_BOOKS, bookByCode } from '../bible/books';
import { labelHolds, refName } from '../bible/ref';
import type { Chapter, Verse } from '../bible/textTypes';
import type { TextSource } from '../bible/verseRows';

/** One run of a reference: from chapter `c1` verse `v1` to chapter `c2` verse `v2`. A null verse means the whole chapter. `l1` and `l2` are the letters of a part of a verse ("b", "cd"), or "". */
export type Segment = { c1: number; v1: number | null; l1: string; c2: number; v2: number | null; l2: string };

/** A reference: the book (its code, "WIS") and its runs, in the order the lectionary reads them. */
export type Reference = { code: string; segments: readonly Segment[] };

/** The other names the lectionaries give a book of the list. */
const ALIASES: ReadonlyArray<[string, string]> = [['Psalm', 'PSA'], ['Song of Solomon', 'SNG']];

/** Every name a reference may start with, the longest first, so that "1 John" is found before "John" and "Song of Songs" before "Song". */
const NAMES: ReadonlyArray<[string, string]> = (() => {
  const all = new Map<string, string>();
  for (const b of BIBLE_BOOKS) all.set(b.name.toLowerCase(), b.code);
  for (const [name, code] of ALIASES) all.set(name.toLowerCase(), code);
  return [...all.entries()].sort((a, b) => b[0].length - a[0].length);
})();

/** The most runs a reference may have: the longest of the lectionary has seven. */
const MAX_SEGMENTS = 12;

const DASHES = /[‐-―−]/g;

/** What the source puts in a reference that is no part of it: a footnote marker ("[^1]"), the dashes in all their sizes, runs of spaces. */
const tidy = (text: string): string => text.replace(/\[\^[^\]]*\]/g, ' ').replace(DASHES, '-').replace(/\s+/g, ' ').trim();

const ITEM = /^(?:(\d{1,3}):)?(\d{1,3})([a-z]{0,6})(?:-(?:(\d{1,3}):)?(\d{1,3})([a-z]{0,6}))?$/;

/**
 * The reference a text says, or null when it is not one of the forms above, names a chapter or a book the Bible does not have, or goes backwards. It does not look at the words:
 * whether a verse exists is for readPassage to say.
 */
export function parseReference(text: string): Reference | null {
  if (typeof text !== 'string' || text.length > 160) return null;
  const t = tidy(text);
  const lower = t.toLowerCase();
  let code: string | undefined;
  let rest = '';
  for (const [name, c] of NAMES) {
    if (lower.startsWith(`${name} `)) { code = c; rest = t.slice(name.length + 1).trim(); break; }
  }
  const book = code ? bookByCode(code) : undefined;
  if (!code || !book || !rest) return null;

  // a whole chapter: "Psalm 87"
  if (/^\d{1,3}$/.test(rest) && book.chapters > 1) {
    const c = Number(rest);
    return c >= 1 && c <= book.chapters ? { code, segments: [{ c1: c, v1: null, l1: '', c2: c, v2: null, l2: '' }] } : null;
  }

  const single = book.chapters === 1;
  let cur: number | null = single ? 1 : null;
  const segments: Segment[] = [];
  for (const raw of rest.split(/\s*[;,]\s*|\s+and\s+/)) {
    const item = raw.trim();
    if (!item) return null;
    const m = ITEM.exec(item);
    if (!m) return null;
    const c1 = m[1] !== undefined ? Number(m[1]) : cur;
    if (c1 === null) return null; // a verse before any chapter was named
    const v1 = Number(m[2]);
    const l1 = m[3];
    let c2 = c1;
    let v2 = v1;
    let l2 = l1;
    if (m[5] !== undefined) {
      c2 = m[4] !== undefined ? Number(m[4]) : c1;
      v2 = Number(m[5]);
      l2 = m[6];
    }
    if (c1 < 1 || c2 > book.chapters || v1 < 1 || v2 < 1) return null;
    if (c2 < c1 || (c2 === c1 && v2 < v1)) return null;
    segments.push({ c1, v1, l1, c2, v2, l2 });
    cur = c2;
    if (segments.length > MAX_SEGMENTS) return null;
  }
  return segments.length > 0 ? { code, segments } : null;
}

/**
 * The psalm a reference names when the verses of it cannot be read ("Psalm 85:9-10-11-12, 13-14" has a run that no lectionary writes): its number, or null for anything that does not start
 * "Psalm 85". The psalm can still be shown, whole.
 */
export function psalmOfText(text: string): number | null {
  const m = /^Psalm (\d{1,3})\b/.exec(tidy(text));
  const n = m ? Number(m[1]) : 0;
  return n >= 1 && n <= (bookByCode('PSA')?.chapters ?? 0) ? n : null;
}

/** The name a reference starts with: "Psalm" (the one book that is read in the singular), else the name of the list. */
const nameOf = (code: string): string => refName(code, (c) => bookByCode(c)?.name);

/** The reference said one plain way: "Genesis 3:9-15, 20", "Matthew 9:36–10:8", "Philemon 7-20", "Psalm 87". A run over a chapter has an en dash, so that it cannot be read as two verses. */
export function formatReference(ref: Reference): string {
  const oneChapter = bookByCode(ref.code)?.chapters === 1;
  let out = '';
  let cur: number | null = null;
  ref.segments.forEach((s, i) => {
    if (s.v1 === null) { out += `${i ? '; ' : ' '}${s.c1}`; cur = s.c1; return; }
    const start = `${s.v1}${s.l1}`;
    const same = s.c1 === s.c2;
    const run = same && s.v1 === s.v2 && s.l1 === s.l2 ? start : same ? `${start}-${s.v2}${s.l2}` : `${start}–${s.c2}:${s.v2}${s.l2}`;
    if (oneChapter) out += `${i ? ', ' : ' '}${run}`;
    else if (s.c1 === cur) out += `, ${run}`;
    else out += `${i ? '; ' : ' '}${s.c1}:${run}`;
    cur = s.c2;
  });
  return `${nameOf(ref.code)}${out}`;
}

/** The short form for a line with little room: a psalm is its number alone ("Psalm 63"), every other reading is said in full. */
export function shortReference(ref: Reference): string {
  return ref.code === 'PSA' ? `${nameOf('PSA')} ${ref.segments[0].c1}` : formatReference(ref);
}

/**
 * The chapters where the verse numbers of the lectionary (the Hebrew ones) and those of this Bible (the English ones) are known to differ, by the code of the book. A reference that
 * touches one has no words under it. The Psalms are not here: they have their own rule (the title). The first book of Moses to the second of Chronicles and Nehemiah are the places where
 * English Bibles move a verse or two across a chapter; the prophets from Isaiah on are the usual ones (Isaiah 8 to 9 and 63 to 64, Hosea, Joel, Jonah, Micah, Nahum, Zechariah, Malachi);
 * 2 Corinthians 13 is where the Catholic lectionary joins two verses.
 */
export const NUMBERING_DIFFERS: Readonly<Record<string, readonly number[]>> = {
  GEN: [31, 32], EXO: [7, 8, 21, 22], LEV: [5, 6], NUM: [16, 17, 29, 30], DEU: [12, 13, 22, 23, 28, 29],
  '1SA': [20, 21, 23, 24], '2SA': [18, 19], '1KI': [4, 5], '2KI': [11, 12], '1CH': [5, 6, 12], '2CH': [1, 2, 13, 14], NEH: [3, 4, 9, 10],
  JOB: [40, 41], ECC: [4, 5], SNG: [6, 7], ISA: [8, 9, 63, 64], JER: [8, 9], EZK: [20, 21], DAG: [4, 5, 6],
  HOS: [1, 2, 11, 12, 13, 14], JOL: [2, 3], JON: [1, 2], MIC: [4, 5], NAM: [1, 2], ZEC: [1, 2], MAL: [3, 4],
  ACT: [19], ROM: [16], '2CO': [13],
};

/** Does the reference touch a chapter whose numbers differ? */
export const touchesDifferingChapter = (ref: Reference): boolean => {
  const list = NUMBERING_DIFFERS[ref.code];
  return !!list && ref.segments.some((s) => list.some((c) => c >= s.c1 && c <= s.c2));
};

/** One line of a passage: a verse with its label, or a gap where the lectionary skips verses. In a whole psalm shown for a selection of its verses the label is left out (the numbers are not the lectionary's). */
export type PassageLine = { n: string; text: string } | { gap: true };

/** The words of a reference. `whole` is true when a psalm is shown whole although the reference names some of its verses. */
export type PassageText = { lines: readonly PassageLine[]; whole: boolean };

/** The printed verses of a run that are in the chapters, or null when a chapter or an end of the run is not in the text. A verse with no words is left out, as the lectionary leaves it. */
function versesOf(chapters: readonly Chapter[], s: Segment): Array<{ chapter: number; verse: Verse }> | null {
  const out: Array<{ chapter: number; verse: Verse }> = [];
  for (let c = s.c1; c <= s.c2; c++) {
    const chapter = chapters.find((ch) => ch.c === c);
    if (!chapter) return null;
    const lo = c === s.c1 && s.v1 !== null ? s.v1 : 1;
    const hi = c === s.c2 && s.v2 !== null ? s.v2 : Number.POSITIVE_INFINITY;
    if (s.v1 !== null && c === s.c1 && !chapter.verses.some((v) => labelHolds(v.n, lo))) return null;
    if (Number.isFinite(hi) && !chapter.verses.some((v) => labelHolds(v.n, hi))) return null;
    for (const verse of chapter.verses) {
      const range = /^(\d+)(?:-(\d+))?$/.exec(verse.n);
      if (!range) continue;
      const a = Number(range[1]);
      const b = range[2] === undefined ? a : Number(range[2]);
      if (b >= lo && a <= hi && /\S/.test(verse.t)) out.push({ chapter: c, verse });
    }
  }
  return out.length > 0 ? out : null;
}

/** The first number of a printed label, and the last. */
const labelEnds = (n: string): [number, number] => {
  const m = /^(\d+)(?:-(\d+))?$/.exec(n);
  return m ? [Number(m[1]), Number(m[2] ?? m[1])] : [0, 0];
};

/**
 * The words of a reference, from the Bible inside the app, or null when they cannot be shown with confidence: the book is not in the Bible, a chapter or a verse is not there, the
 * numbers are known to differ (NUMBERING_DIFFERS), or the reference names a whole chapter of a book that is not the Psalms. Never throws.
 */
export function readPassage(ref: Reference, source: TextSource): PassageText | null {
  try {
    if (!source.hasBook(ref.code) || touchesDifferingChapter(ref)) return null;
    const book = source.loadBook(ref.code);
    const chapters: readonly Chapter[] = book.chapters;
    let segments = ref.segments;
    let whole = false;
    if (ref.code === 'PSA') {
      // a psalm with a title is shown whole (the numbers of the lectionary count the title); a psalm without one keeps its verses
      const widened: Segment[] = [];
      for (const s of segments) {
        const titled = s.v1 !== null && !!chapters.find((ch) => ch.c === s.c1)?.title;
        if (titled) {
          whole = true;
          if (!widened.some((w) => w.c1 === s.c1 && w.v1 === null)) widened.push({ c1: s.c1, v1: null, l1: '', c2: s.c1, v2: null, l2: '' });
        } else widened.push(s);
      }
      segments = widened;
    } else if (segments.some((s) => s.v1 === null)) return null;

    const lines: PassageLine[] = [];
    let last: { chapter: number; end: number } | null = null;
    for (const s of segments) {
      const found = versesOf(chapters, s);
      if (!found) return null;
      const first = found[0];
      const startAt = labelEnds(first.verse.n)[0];
      const follows = !!last && ((last.chapter === first.chapter && startAt === last.end + 1) || (last.chapter + 1 === first.chapter && startAt === 1));
      if (last && !follows && !whole) lines.push({ gap: true });
      for (const { chapter, verse } of found) {
        lines.push({ n: whole ? '' : verse.n, text: verseText(verse) });
        last = { chapter, end: labelEnds(verse.n)[1] };
      }
    }
    return { lines, whole };
  } catch {
    return null;
  }
}

/** The verses of a passage in the runs the lectionary reads them in: a gap between two runs ends one. A whole psalm is one run. */
export function runsOf(lines: readonly PassageLine[]): Array<Array<{ n: string; text: string }>> {
  const runs: Array<Array<{ n: string; text: string }>> = [[]];
  for (const line of lines) {
    if ('gap' in line) { if (runs[runs.length - 1].length > 0) runs.push([]); } else runs[runs.length - 1].push(line);
  }
  return runs.filter((run) => run.length > 0);
}
