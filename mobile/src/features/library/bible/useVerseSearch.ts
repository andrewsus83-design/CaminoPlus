import { useEffect, useState } from 'react';
import { searchVerses } from './searchText';
import type { VerseHit } from './textTypes';
import { VERSE_RESULTS_MAX, announcesSearch, rowsOfHits, verseQuery, type VerseRow } from './verseRows';

/** How long the typing has to stop before the verses are looked for. */
export const VERSE_SEARCH_DEBOUNCE_MS = 250;

export type VerseSearch = {
  /** The verses of the last search that finished (kept while the next one runs, so the list does not blink at every letter). */
  rows: VerseRow[];
  /** The list was cut at VERSE_RESULTS_MAX: there are more. */
  capped: boolean;
  /** idle: nothing to look for · waiting: the typing has not stopped · searching: the search is on, and says so · done: the rows are for what is typed. */
  state: 'idle' | 'waiting' | 'searching' | 'done';
};

/** How long the last search took, in milliseconds (null before the first). The first reads the books of the text and takes the longest. */
let lastTook: number | null = null;

/**
 * The verses that match what is typed in the Library's search field. searchVerses is synchronous (the first call reads the books), so nothing about it may
 * stand between a keystroke and the screen: the letter is drawn first (this runs from an effect), the search waits until the typing has stopped for
 * VERSE_SEARCH_DEBOUNCE_MS, and then it runs from a timer of its own. When the search is likely to take a moment (it is the first, or the last one was slow)
 * the state says "searching" a beat before it starts, so the screen can draw a quiet "Searching..." that is on screen while the thread is busy. The words
 * of a query that is too short to look for (verseQuery) are not searched at all. The list is cut at VERSE_RESULTS_MAX.
 */
export function useVerseSearch(query: string): VerseSearch {
  const wanted = verseQuery(query);
  const [found, setFound] = useState<{ query: string; rows: VerseRow[]; capped: boolean } | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!wanted) { setFound(null); setSearching(false); return; }
    let alive = true;
    let run: ReturnType<typeof setTimeout> | undefined;
    const wait = setTimeout(() => {
      const say = announcesSearch(lastTook);
      if (say) setSearching(true);
      run = setTimeout(() => {
        const started = Date.now();
        let hits: VerseHit[] = [];
        try { hits = searchVerses(wanted, VERSE_RESULTS_MAX); } catch { hits = []; }
        lastTook = Date.now() - started;
        if (!alive) return;
        setFound({ query: wanted, rows: rowsOfHits(hits), capped: hits.length >= VERSE_RESULTS_MAX });
        setSearching(false);
      }, say ? 50 : 0);
    }, VERSE_SEARCH_DEBOUNCE_MS);
    return () => { alive = false; clearTimeout(wait); if (run) clearTimeout(run); };
  }, [wanted]);

  const state: VerseSearch['state'] = !wanted ? 'idle' : found?.query === wanted ? 'done' : searching ? 'searching' : 'waiting';
  return { rows: wanted ? (found?.rows ?? []) : [], capped: wanted ? !!found?.capped : false, state };
}
