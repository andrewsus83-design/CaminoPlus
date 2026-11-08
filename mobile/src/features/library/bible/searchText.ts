// Searching the words of the Bible in the app: `searchVerses("love lord")` is the verses that have a word that starts with "love" and a word
// that starts with "lord", in the order of the Bible, with the places to highlight. The rules (case, accents and curly quotes do not matter;
// a word has to be the start of a word of the verse; the order is the order of the app; no ranking) are in searchCore.ts, which has the
// logic with the index and the loader as parameters so that plain node can run it. This file hands it the real ones.
//
// It is synchronous and it works on the phone, offline, with nothing sent anywhere. The first call has to read all 73 books (the same files
// loadBook reads, so a book that is already open costs nothing) and fold the words of 35,408 verses; every call after it only scans the
// folded words. PLAN for the screen: call `prepareSearch()` once the Library is on screen and the phone is idle, or accept that the first
// search takes longer than the next ones. The times on a laptop, in plain node, are in tools/bible/README.md (measured; a phone is slower and
// has not been measured).
import { makeSearch } from './searchCore';
import { BOOK_INDEX, loadBook } from './text';
import type { VerseHit } from './textTypes';

const search = makeSearch(BOOK_INDEX, loadBook);

/**
 * Every word of `query` must start a word of the verse. Case, accents and curly quotes are ignored. The results are in the order of the app
 * (books, then chapters, then verses), at most `limit` of them (100 by default). `marks` are [start, end) places in `text`, the verse as one
 * line (no tabs, no line breaks). No query words, or a limit below 1, give an empty list.
 */
export const searchVerses: (query: string, limit?: number) => VerseHit[] = search.searchVerses;

/** Reads and folds all the books now, so that the first `searchVerses` does not have to. Safe to call again. */
export const prepareSearch: () => void = search.prepare;
