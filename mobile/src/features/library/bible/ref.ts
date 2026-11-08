// A place in the Bible as plain data: the book, the chapter and, for a verse, its number or a run of verses. Pure: no React, no React Native, no
// text (plain node tests cover it, npm run test:library).
//
// Three things are made from a place here, and nothing else in the app writes them by hand:
//   the words a person reads        formatRef       "Psalm 121:1-4", "John 3:16", "1 Corinthians 13"
//   the key a bookmark (or a note) is kept under        refKey / parseRefKey      "PSA.121.1-4", "JHN.3.16", "1CO.13"
//   what a person types             parseRef        "Ps 121", "john 3:16", "1 Cor 13:4-7"
//
// The key is made of the code of the source (the three characters of the USFM name, "PSA"), the chapter and the verses, joined by dots. It says
// nothing about the translation, on purpose: a bookmark or a note kept under "PSA.121.3" is still right if the words of the app change. A bookmark
// of the Library carries it after "bible:" ("bible:PSA.121.3", see ../search.ts itemKey): a book is kept under its id ("bible:bible-psalms"), a
// verse under its place, and the two cannot be mistaken for each other (an id has dashes and lower case letters, a place has dots and capitals).
//
// The label of a verse is "7" or, for the few verses printed joined, "15-16" (a run of verses with one text): a run is [from, to] here too.
import { BIBLE_BOOKS, bookByCode, type BibleBook } from './books';

/** A place: the chapter of a book, or from one verse of it, or a run of verses (`to` is the last, and is above `from`). */
export type Ref = { code: string; chapter: number; from?: number; to?: number };

/** The name of a book as a place says it: "Psalm 121" (the one book that is read in the singular), else the name the list gives it. A code with no name is said as it is. */
export const refName = (code: string, nameOf: (code: string) => string | undefined): string => (code === 'PSA' ? 'Psalm' : (nameOf(code) ?? code));

/** "Psalm 121", "Psalm 121:3", "Psalm 121:1-4", "John 3:16". A run that is not one (the last verse not above the first) is said as the first verse alone. */
export function formatRef(ref: Ref, nameOf: (code: string) => string | undefined): string {
  const head = `${refName(ref.code, nameOf)} ${ref.chapter}`;
  if (ref.from === undefined) return head;
  return ref.to !== undefined && ref.to > ref.from ? `${head}:${ref.from}-${ref.to}` : `${head}:${ref.from}`;
}

/** "PSA.121", "PSA.121.3", "PSA.121.1-4". */
export function refKey(ref: Ref): string {
  const head = `${ref.code}.${ref.chapter}`;
  if (ref.from === undefined) return head;
  return ref.to !== undefined && ref.to > ref.from ? `${head}.${ref.from}-${ref.to}` : `${head}.${ref.from}`;
}

const KEY = /^([0-9A-Z]{3})\.([1-9]\d{0,2})(?:\.([1-9]\d{0,2})(?:-([1-9]\d{0,2}))?)?$/;

/** The place of a key made by refKey, or null for anything else (an id of a book, a key of another tab, a run that goes backwards, a number with a zero in front). */
export function parseRefKey(key: string): Ref | null {
  const m = KEY.exec(key);
  if (!m) return null;
  const ref: Ref = { code: m[1], chapter: Number(m[2]) };
  if (m[3] !== undefined) {
    ref.from = Number(m[3]);
    if (m[4] !== undefined) {
      if (Number(m[4]) <= ref.from) return null;
      ref.to = Number(m[4]);
    }
  }
  return ref;
}

/** The verses a label stands for: "7" is [7, 7], "15-16" is [15, 16]; null for a label that is no number or run ("1a", "", "16-15"). */
export function verseRange(label: string): { from: number; to: number } | null {
  const m = /^([1-9]\d{0,2})(?:-([1-9]\d{0,2}))?$/.exec(label);
  if (!m) return null;
  const from = Number(m[1]);
  const to = m[2] === undefined ? from : Number(m[2]);
  return to >= from ? { from, to } : null;
}

/** The place of one printed verse: its label, in its chapter. null for a label that is no number or run. */
export function refOfVerse(code: string, chapter: number, label: string): Ref | null {
  const r = verseRange(label);
  if (!r) return null;
  return r.to > r.from ? { code, chapter, from: r.from, to: r.to } : { code, chapter, from: r.from };
}

/** Does the printed verse with this label hold the verse `n`? ("15-16" holds 15 and 16.) */
export function labelHolds(label: string, n: number): boolean {
  const r = verseRange(label);
  return !!r && n >= r.from && n <= r.to;
}

// ---------------------------------------------------------------------------------------------------------------- what a person types

// Other ways to write a book: the short forms of the books that are known by one. A name that is not here is still found by its start ("gen",
// "revel", "1 thess"), when the start belongs to one book only. Written as typed, in lower case, without dots and accents.
const SHORT: Record<string, string[]> = {
  GEN: ['gen', 'ge', 'gn'], EXO: ['exod', 'ex', 'exo'], LEV: ['lev', 'le', 'lv'], NUM: ['num', 'nu', 'nm', 'nb'], DEU: ['deut', 'dt', 'de'],
  JOS: ['josh', 'jos'], JDG: ['judg', 'jdg', 'jg'], RUT: ['ru', 'rth'],
  '1SA': ['1 sam', '1 sa'], '2SA': ['2 sam', '2 sa'], '1KI': ['1 kgs', '1 ki'], '2KI': ['2 kgs', '2 ki'],
  '1CH': ['1 chron', '1 chr', '1 ch'], '2CH': ['2 chron', '2 chr', '2 ch'], EZR: ['ezr'], NEH: ['neh', 'ne'], ESG: ['esth', 'est'],
  JOB: ['jb'], PSA: ['ps', 'psa', 'psalm', 'pss', 'psalms'], PRO: ['prov', 'pr', 'prv'], ECC: ['eccl', 'eccles', 'qoh', 'qoheleth'],
  SNG: ['song', 'sos', 'ss', 'song of solomon', 'canticles', 'cant'], ISA: ['isa', 'is'], JER: ['jer', 'je'], LAM: ['lam', 'la'],
  EZK: ['ezek', 'eze', 'ezk'], DAG: ['dan', 'da', 'dn'], HOS: ['hos', 'ho'], JOL: ['joel', 'jl'], AMO: ['am'], OBA: ['obad', 'ob'], JON: ['jnh'],
  MIC: ['mic', 'mc'], NAM: ['nah', 'na'], HAB: ['hab', 'hb'], ZEP: ['zeph', 'zep'], HAG: ['hag', 'hg'], ZEC: ['zech', 'zec'], MAL: ['mal', 'ml'],
  TOB: ['tob', 'tb'], JDT: ['jdt', 'judith'], WIS: ['wis', 'wisd'], SIR: ['sir', 'ecclus', 'ecclesiasticus'], BAR: ['bar'],
  '1MA': ['1 macc', '1 mac', '1 ma'], '2MA': ['2 macc', '2 mac', '2 ma'],
  MAT: ['matt', 'mt'], MRK: ['mark', 'mrk', 'mk'], LUK: ['luke', 'luk', 'lk'], JHN: ['john', 'jn', 'jhn'], ACT: ['act', 'ac'],
  ROM: ['rom', 'ro', 'rm'], '1CO': ['1 cor', '1 co'], '2CO': ['2 cor', '2 co'], GAL: ['gal', 'ga'], EPH: ['eph', 'ep'], PHP: ['phil', 'php', 'pp'],
  COL: ['col'], '1TH': ['1 thess', '1 thes', '1 th'], '2TH': ['2 thess', '2 thes', '2 th'], '1TI': ['1 tim', '1 ti'], '2TI': ['2 tim', '2 ti'],
  TIT: ['tit'], PHM: ['philem', 'phm', 'pm'], HEB: ['heb'], JAS: ['jas', 'jm'], '1PE': ['1 pet', '1 pe', '1 pt'], '2PE': ['2 pet', '2 pe', '2 pt'],
  '1JN': ['1 jn', '1 jo', '1 joh'], '2JN': ['2 jn', '2 jo', '2 joh'], '3JN': ['3 jn', '3 jo', '3 joh'], JUD: ['jude'], REV: ['rev', 're', 'revelations', 'apocalypse'],
};

/** Lower case, no accents, no dots, one space between words; a number in front of a name stands apart ("1cor" is "1 cor"). */
function plainBook(t: string): string {
  const s = t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\./g, '').replace(/\s+/g, ' ').trim();
  return s.replace(/^([123])\s*(?=[a-z])/, '$1 ');
}

let lookup: { exact: Map<string, string>; names: Array<[string, string]> } | null = null;
function books(): { exact: Map<string, string>; names: Array<[string, string]> } {
  if (lookup) return lookup;
  const exact = new Map<string, string>();
  const names: Array<[string, string]> = [];
  for (const b of BIBLE_BOOKS) {
    const full = plainBook(b.name);
    names.push([full, b.code]);
    exact.set(full, b.code);
    exact.set(full.replace(/ /g, ''), b.code);
    for (const s of SHORT[b.code] ?? []) { exact.set(s, b.code); exact.set(s.replace(/ /g, ''), b.code); }
  }
  lookup = { exact, names };
  return lookup;
}

/** The book a typed name stands for: its name or a short form of it, or the start of one name only ("revel", "1 thess"); undefined when it is none or more than one ("jo"). */
export function bookOfTyped(typed: string): BibleBook | undefined {
  const t = plainBook(typed);
  if (!t) return undefined;
  const { exact, names } = books();
  const direct = exact.get(t);
  if (direct) return bookByCode(direct);
  if (t.replace(/[^a-z]/g, '').length < 3) return undefined;
  const hits = names.filter(([name]) => name.startsWith(t));
  return hits.length === 1 ? bookByCode(hits[0][1]) : undefined;
}

/**
 * The place a person typed: "Ps 121", "john 3:16", "1 Cor 13", "Psalm 23:1-3", "gen1:1". A book (by its name, a short form or the start of its
 * name), a chapter that the book has, and, if there is a colon, a verse or a run of verses ("3:16-18"). null for anything else: a name alone, a
 * chapter the book does not have, a run that goes backwards, words that are no book. It does not look in the text: whether the verse exists is
 * for the reader to say.
 */
export function parseRef(text: string): Ref | null {
  if (text.length > 40) return null;
  // the dot of a short form ("Gen. 1:1", "1 Cor. 13") is not a separator: only a dot between two numbers is ("John 3.16")
  const m = /^\s*([123]?\s*[^\d:.\-–—]*?[^\d\s:.\-–—])\s*(\d{1,3})(?:\s*[:.]\s*(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?)?\s*$/.exec(text.replace(/([A-Za-z])\./g, '$1 '));
  if (!m) return null;
  const book = bookOfTyped(m[1]);
  if (!book) return null;
  const chapter = Number(m[2]);
  if (chapter < 1 || chapter > book.chapters) return null;
  if (m[3] === undefined) return { code: book.code, chapter };
  const from = Number(m[3]);
  if (from < 1) return null;
  if (m[4] === undefined) return { code: book.code, chapter, from };
  const to = Number(m[4]);
  return to > from ? { code: book.code, chapter, from, to } : null;
}
