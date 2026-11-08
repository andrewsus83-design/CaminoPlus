// Searching the Library, and picking out the bookmarked rows, as pure functions: no React, no React Native, so plain node
// tests cover all of it (npm run test:library).
//
// The Library holds example rows only (see sample.ts), so this searches them: for a book of the Bible its name, its part (Old
// Testament, Deuterocanon, New Testament) and its line; for one of the twelve books its title, its author, its era and its blurb;
// and the name of the tab itself, so "bible" lists all the Bible rows and "books" the twelve. It looks at both tabs at once and
// answers with the rows grouped by tab: one list, nothing to switch to. The diary is not searched here: it is not in the Library (it is the Notes
// sub-tab of Me).
//
// How a row matches. Case, accents and punctuation do not matter ("Ávila" is "avila", "Kempis." is "kempis"). The query is
// cut into words; every word has to be the start of a word of the row, so "teres" finds "Teresa of Ávila" and "john cross" finds
// "John of the Cross", but "eresa" does not. Someone typing sees the list narrow with every letter, which is why a word that is
// only started counts.
import { norm } from '../me/text';
import { BIBLE_BOOKS, TESTAMENT_SEARCH, type BibleBook } from './bible/books';
import { BOOK_CATALOG, type CatalogBook } from './books/catalog';
import { SAMPLE_TABS, type SampleTab } from './sample';

/** The rows of the two tabs that hold rows, by tab, in the order of the tabs (Bible, Books). */
export type Hits = { Bible: BibleBook[]; Books: CatalogBook[] };

export const emptyHits = (): Hits => ({ Bible: [], Books: [] });
export const hitCount = (h: Hits): number => h.Bible.length + h.Books.length;

/** The tabs that have rows in `hits`, in tab order: what a list of results draws, one group after the other. */
export const hitTabs = (h: Hits): SampleTab[] => SAMPLE_TABS.filter((t) => h[t].length > 0);

/**
 * The key a row is bookmarked under: its tab and its id ("bible:bible-genesis", "books:confessions"). The id alone would not do
 * if two tabs ever used the same one.
 */
export const itemKey = (tab: SampleTab, id: string): string => `${tab.toLowerCase()}:${id}`;

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
 * a query of blanks is not a search at all (isSearching), so callers show the tabs then.
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
 * The rows of these bookmark keys (newest first, as they are kept), grouped by tab. A key that is no row of the Library any more
 * is left out: it stays in the saved list, it just shows nothing. That is what happens to a bookmark kept before the tabs were
 * Bible and Books (a Music row such as "music:morning", an example shelf such as "bible:psalms", or a key of a tab that is not in the
 * Library any more, such as "notes:..."): nothing breaks, and nothing shows. A Bookmarks screen with only such keys says "Nothing
 * bookmarked in the Library yet", which is true.
 */
export function hitsForKeys(keys: readonly string[]): Hits {
  const rank = new Map<string, number>();
  keys.forEach((k, i) => { if (!rank.has(k)) rank.set(k, i); });
  const pick = <T extends { id: string }>(tab: SampleTab, rows: readonly T[]): T[] =>
    rows
      .filter((r) => rank.has(itemKey(tab, r.id)))
      .sort((a, b) => (rank.get(itemKey(tab, a.id)) ?? 0) - (rank.get(itemKey(tab, b.id)) ?? 0));
  return { Bible: pick('Bible', BIBLE_BOOKS), Books: pick('Books', BOOK_CATALOG) };
}
