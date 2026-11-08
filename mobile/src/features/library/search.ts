// Searching the Library, and picking out the bookmarked rows, as pure functions: no React, no React Native, so plain node
// tests cover all of it (npm run test:library).
//
// This file searches the ROWS: for a book of the Bible its name, its part (Old Testament, Deuterocanon, New Testament) and its line; for one of
// the twelve books its title, its author, its era and its blurb; and the name of the tab itself, so "bible" lists all the Bible rows and "books" the
// twelve. It looks at both tabs at once and answers with the rows grouped by tab: one list, nothing to switch to. Notes (the diary) are not searched
// here. The verses of the Bible are searched by searchText.ts, which is slower (the first search reads the books), so the screen asks it after the
// keystroke (bible/useVerseSearch.ts) and adds its rows to the third group, Verses.
//
// How a row matches. Case, accents and punctuation do not matter ("Ávila" is "avila", "Kempis." is "kempis"). The query is
// cut into words; every word has to be the start of a word of the row, so "teres" finds "Teresa of Ávila" and "john cross" finds
// "John of the Cross", but "eresa" does not. Someone typing sees the list narrow with every letter, which is why a word that is
// only started counts.
import { norm } from '../me/text';
import { BIBLE_BOOKS, TESTAMENT_SEARCH, type BibleBook } from './bible/books';
import { refKey, type Ref } from './bible/ref';
import { rowOfKey, type TextSource, type VerseRow } from './bible/verseRows';
import { BOOK_CATALOG, type CatalogBook } from './books/catalog';
import type { RowTab } from './sample';

/** The three groups of a list of results or of Bookmarks, in the order they are drawn: the books of the Bible, the twelve books, the verses. */
export const RESULT_GROUPS = ['Bible', 'Books', 'Verses'] as const;
export type ResultGroup = (typeof RESULT_GROUPS)[number];

/** The rows by group: the books of the Bible, the twelve books, and the verses (a search or a bookmark found). */
export type Hits = { Bible: BibleBook[]; Books: CatalogBook[]; Verses: VerseRow[] };

export const emptyHits = (): Hits => ({ Bible: [], Books: [], Verses: [] });
export const hitCount = (h: Hits): number => h.Bible.length + h.Books.length + h.Verses.length;

/** The groups that have rows in `hits`, in order: what a list of results draws, one group after the other. */
export const hitGroups = (h: Hits): ResultGroup[] => RESULT_GROUPS.filter((g) => h[g].length > 0);

/**
 * The key a row is bookmarked under: its tab and its id ("bible:bible-genesis", "books:confessions"). The id alone would not do
 * if two tabs ever used the same one. A verse is kept under its place after "bible:" ("bible:PSA.121.3"), see verseKey.
 */
export const itemKey = (tab: RowTab, id: string): string => `${tab.toLowerCase()}:${id}`;

/** The key a bookmark of a verse (or of a run of verses) is kept under: "bible:PSA.121.3", "bible:PSA.121.1-4". The place is the one of ref.ts, which says nothing about the translation. */
export const verseKey = (ref: Ref): string => itemKey('Bible', refKey(ref));

// Everything that is not a letter or a number in the rows or in a query, as a list: written out (and not \p{L}) so it is the
// same on every phone and leaves letters of every script alone.
const PUNCTUATION = /[.,;:!?'"“”‘’()[\]{}<>\/\\|@#$%^&*_+=~`-]+/g;

/** The words of a text as they are compared: lower case, no accents, no punctuation. Nothing (null, undefined) has no words. */
export const wordsOf = (text: string | null | undefined): string[] => norm(text).replace(PUNCTUATION, ' ').split(/\s+/).filter(Boolean);

/** Every query word starts a word of the row. */
const matches = (query: readonly string[], row: readonly string[]): boolean => query.every((w) => row.some((r) => r.startsWith(w)));

/** What the search reads of a book of the Bible. */
const bibleWords = (b: BibleBook): string[] => wordsOf(`Bible ${b.name} ${b.detail ?? ''} ${TESTAMENT_SEARCH[b.testament]}`);

/** What the search reads of one of the twelve books: what the row shows, and "free", which is on every row. The group and the licence notes are not on screen, so they are not read. */
const bookWords = (b: CatalogBook): string[] => wordsOf(`Books ${b.title} ${b.author} ${b.era} ${b.blurb} free`);

/** The longest query that is repeated back to the person ("Nothing found for ..."): a pasted paragraph must not break the layout. */
export const QUERY_SHOWN_MAX = 40;

/** The query as it is shown back: one line, no runs of spaces, cut short with an ellipsis. */
export function shownQuery(query: string, max: number = QUERY_SHOWN_MAX): string {
  const one = query.replace(/\s+/g, ' ').trim();
  return one.length <= max ? one : `${one.slice(0, max - 1).trimEnd()}…`;
}

/** A search is on when something other than blanks has been typed. */
export const isSearching = (query: string): boolean => query.trim().length > 0;

export type LibrarySearch = { query: string; hits: Hits; total: number };

/**
 * The rows that match, by tab. A query with no words in it (only punctuation) is still a search, and finds nothing;
 * a query of blanks is not a search at all (isSearching), so callers show the tabs then. The Verses group is empty here: the verses are found
 * apart from the rows (see the top of this file) and put in by the screen.
 */
export function searchLibrary(query: string): LibrarySearch {
  const hits = emptyHits();
  const q = wordsOf(query);
  if (q.length > 0) {
    for (const b of BIBLE_BOOKS) if (matches(q, bibleWords(b))) hits.Bible.push(b);
    for (const b of BOOK_CATALOG) if (matches(q, bookWords(b))) hits.Books.push(b);
  }
  return { query: shownQuery(query), hits, total: hitCount(hits) };
}

/** "3 results for “road”", "1 result for “psalms”", "Nothing found for “zzz”". */
export function resultsLine(s: LibrarySearch): string {
  if (s.total === 0) return `Nothing found for “${s.query}”`;
  return `${s.total} ${s.total === 1 ? 'result' : 'results'} for “${s.query}”`;
}

/**
 * The rows of these bookmark keys (newest first, as they are kept), grouped. A key that is no row of the Library any more is left out: it stays in
 * the saved list, it just shows nothing. That is what happens to a bookmark kept before the tabs were Bible, Books and Notes (a Music row such as
 * "music:morning", an example shelf such as "bible:psalms"), to one kept under the id of a row that was taken out of the list ("bible:bible-additions-to-esther":
 * the added passages are inside Esther and Daniel now), and to a verse that the text does not have ("bible:PSA.999.1", a chapter that is not there, a book that
 * cannot be read): nothing breaks, and nothing wrong shows. A Bookmarks screen with only such keys says "Nothing bookmarked in the Library yet",
 * which is true. The verses are looked up in `source` (text.ts); without one no verse is returned.
 */
export function hitsForKeys(keys: readonly string[], source?: TextSource): Hits {
  const rank = new Map<string, number>();
  keys.forEach((k, i) => { if (!rank.has(k)) rank.set(k, i); });
  const pick = <T extends { id: string }>(tab: RowTab, rows: readonly T[]): T[] =>
    rows
      .filter((r) => rank.has(itemKey(tab, r.id)))
      .sort((a, b) => (rank.get(itemKey(tab, a.id)) ?? 0) - (rank.get(itemKey(tab, b.id)) ?? 0));
  const verses: VerseRow[] = [];
  if (source) {
    for (const k of rank.keys()) {
      if (!k.startsWith('bible:')) continue;
      const row = rowOfKey(k.slice('bible:'.length), source);
      if (row) verses.push(row);
    }
  }
  return { Bible: pick('Bible', BIBLE_BOOKS), Books: pick('Books', BOOK_CATALOG), Verses: verses };
}

