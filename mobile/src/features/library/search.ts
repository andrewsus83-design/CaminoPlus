// Searching the Library, and picking out the bookmarked rows, as pure functions: no React, no React Native, so plain node
// tests cover all of it (npm run test:library).
//
// What is searched. The Books tab is real: its rows come from the bundle (books.ts libraryBooks), handed in by the screen, and are found
// by their title, their subtitle and their kind ("guide", "readings"). The Bible and Music tabs still hold examples (see sample.ts): the
// title and the line under it of every row. For every tab the name of the tab itself counts too, so "music" lists the music rows and
// "bible" the Bible ones. It looks at all three tabs at once and answers with the rows grouped by tab: one list, nothing to switch to.
//
// How a row matches. Case, accents and punctuation do not matter ("Nájera" is "najera", "road." is "road"). The query is
// cut into words; every word has to be the start of a word of the row, so "pray" finds "Prayers for the road" and "road
// pray" finds it too, but "ray" does not. Someone typing sees the list narrow with every letter, which is why a word that is
// only started counts.
import { norm } from '../me/text';
import { bookAnchor } from '../notes/anchor';
import type { LibraryBook } from './books';
import { LIBRARY_TABS, SAMPLE_PLAYLISTS, SAMPLE_SHELVES, type LibraryTab, type Playlist, type Shelf } from './sample';

/** The rows of the three tabs, by tab, in the order of the tabs (Bible, Books, Music). */
export type Hits = { Bible: Shelf[]; Books: LibraryBook[]; Music: Playlist[] };

export const emptyHits = (): Hits => ({ Bible: [], Books: [], Music: [] });
export const hitCount = (h: Hits): number => h.Bible.length + h.Books.length + h.Music.length;

/** The tabs that have rows in `hits`, in tab order: what a list of results draws, one group after the other. */
export const hitTabs = (h: Hits): LibraryTab[] => LIBRARY_TABS.filter((t) => h[t].length > 0);

/**
 * The key a row is bookmarked under. An example row of the Bible and Music tabs: its tab and its id ("bible:psalms"; the id alone is not
 * enough, a shelf and a playlist could share one). A book: its anchor ("book:camino-frances-guide", notes/anchor.ts), the same string a
 * note on that book carries, so a book, a chapter and a paragraph are bookmarked in one scheme.
 */
export const itemKey = (tab: LibraryTab, id: string): string => (tab === 'Books' ? bookAnchor(id) : `${tab.toLowerCase()}:${id}`);

// Everything that is not a letter or a number in the rows or in a query, as a list: written out (and not \p{L}) so it is the
// same on every phone and leaves letters of every script alone.
const PUNCTUATION = /[.,;:!?'"“”‘’()[\]{}<>\/\\|@#$%^&*_+=~`-]+/g;

/** The words of a text as they are compared: lower case, no accents, no punctuation. Nothing (null, undefined) has no words. */
export const wordsOf = (text: string | null | undefined): string[] => norm(text).replace(PUNCTUATION, ' ').split(/\s+/).filter(Boolean);

/** Every query word starts a word of the row. */
const matches = (query: readonly string[], row: readonly string[]): boolean => query.every((w) => row.some((r) => r.startsWith(w)));

const rowWords = (tab: LibraryTab, title: string, line: string): string[] => wordsOf(`${tab} ${title} ${line}`);

/** What else a person may type for a kind: "reflection" finds the readings (the book's own word for them is "Readings"), "guidebook" the guides. */
const KIND_SYNONYMS: Record<string, string> = { guide: 'guidebook', readings: 'reflection reflections' };

/**
 * The words of a book: its tab, its title, its subtitle and its kind. The duration after the kind ("Guide · 3 h 20 min") is not a word to
 * search by, so only the kind label is read.
 */
export function bookWords(b: Pick<LibraryBook, 'title' | 'subtitle' | 'kind'>): string[] {
  const label = b.kind.split(' · ')[0].trim();
  return wordsOf(`Books ${b.title} ${b.subtitle} ${label} ${KIND_SYNONYMS[label.toLowerCase()] ?? ''}`);
}

/** Every word of `query` (already split with wordsOf) starts a word of the row: the rule of the whole Library, shared with the Notebook. */
export const matchesWords = matches;

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
export function searchLibrary(query: string, books: readonly LibraryBook[]): LibrarySearch {
  const hits = emptyHits();
  const q = wordsOf(query);
  if (q.length > 0) {
    for (const s of SAMPLE_SHELVES) if (matches(q, rowWords('Bible', s.title, s.note))) hits.Bible.push(s);
    for (const b of books) if (matches(q, bookWords(b))) hits.Books.push(b);
    for (const p of SAMPLE_PLAYLISTS) if (matches(q, rowWords('Music', p.title, p.note))) hits.Music.push(p);
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
 * (an example that was replaced by real content, a book that is not in the bundle any more) is left out: it stays in the saved list, it just
 * shows nothing. The keys of chapters and paragraphs are not rows of a tab at all (places.ts reads those).
 */
export function hitsForKeys(keys: readonly string[], books: readonly LibraryBook[]): Hits {
  const rank = new Map<string, number>();
  keys.forEach((k, i) => { if (!rank.has(k)) rank.set(k, i); });
  const pick = <T extends { id: string }>(tab: LibraryTab, rows: readonly T[]): T[] =>
    rows
      .filter((r) => rank.has(itemKey(tab, r.id)))
      .sort((a, b) => (rank.get(itemKey(tab, a.id)) ?? 0) - (rank.get(itemKey(tab, b.id)) ?? 0));
  return { Bible: pick('Bible', SAMPLE_SHELVES), Books: pick('Books', books), Music: pick('Music', SAMPLE_PLAYLISTS) };
}
