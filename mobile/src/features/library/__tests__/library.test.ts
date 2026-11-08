// Plain-node checks of the Library's search, of the bookmarks of its rows, and of the reading of bookmarked posts. No React, no
// React Native, no network: the search and the bookmark list are pure functions, and the posts are read through the real code of
// savedPosts.ts against a scripted stand-in for Supabase. Run: npm run test:library
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BOOKMARKS_MAX, BOOKMARK_KEY_MAX, bookmarkKeys, hasBookmark, packBookmarks, parseBookmarks, toggleBookmark, type Bookmark,
} from '../bookmarks';
import {
  POST_COLUMNS, SAVED_POSTS_MAX, buildSavedPosts, changeFailure, makeSavedPostsApi, mediaLabel, packSavedPosts, parseAuthorRows, parsePostRows,
  parseSaveRows, parseSavedCopy, postByline, postHeading, savedView, type SavedPost, type SavedPostsClient, type SavedPostsNet, type SavedPostsQuery,
} from '../savedPosts';
import { BOOKMARKS_PRIVATE_LINE, LIBRARY_TABS, PREVIEW_NOTICE, SAMPLE_PLAYLISTS, SAMPLE_SHELVES, bookmarksNotice, exampleNames, isExampleTab, searchNotice } from '../sample';
import { bookWords, hitCount, hitTabs, hitsForKeys, isSearching, itemKey, resultsLine, searchLibrary, shownQuery, wordsOf } from '../search';
import { libraryBooks, type CatalogBook, type LibraryBook } from '../books';
import { READING_MAX, packReading, parseReading, rememberPlace, resumePoint, type ReadingPlace } from '../reading';
import { bookPlaces } from '../places';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };
const test = async (name: string, fn: () => Promise<void>) => {
  // A test that never finishes must fail, not end the process quietly (node exits when nothing is pending, with code 0).
  await Promise.race([fn(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`"${name}" did not finish in 5 s`)), 5000))]);
  n += 1;
  console.log(`ok   ${name}`);
};
const root = process.cwd(); // npm test runs from mobile/
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const ids = (rows: readonly { id: string }[]) => rows.map((r) => r.id);

// The Books tab is real: its rows are the books of the bundle, handed to the search. These stand in for a few of them.
const cat = (id: string, order: number, kind: 'guide' | 'reflection', title: string, subtitle: string, minutes: number, chapters: [string, string][] = [['00-welcome', 'Welcome']]): CatalogBook => ({
  id, kind, order, title, subtitle, description: 'D', words: minutes * 220, minutes, cover: { colour: kind === 'guide' ? 'sand300' : 'successWash', icon: kind === 'guide' ? 'library' : 'book' },
  chapters: chapters.map(([cid, t]) => ({ id: cid, title: t, minutes: 1 })),
});
const CATALOG: CatalogBook[] = [
  cat('camino-ingles-guide', 6, 'guide', 'The English Way', 'A Pilgrim\'s Guide to the Camino Inglés', 47, [['00-welcome', 'Welcome'], ['01-the-way-in-brief', 'The Way in brief']]),
  cat('imitation-of-christ-readings', 9, 'reflection', 'The Quiet Road', 'Twenty-One Days with The Imitation of Christ for the Pilgrim', 165, [['00-how-to-use-this-book', 'How to use this book'], ['02-day-01-a-stranger-and-a-pilgrim', 'Day 1. A stranger and a pilgrim']]),
  cat('walking-readings', 18, 'reflection', 'Toward the Sunset', 'Five Days with Thoreau on Walking', 40),
  cat('camino-frances-guide', 1, 'guide', 'The French Way', 'A Pilgrim\'s Guide to the Camino Francés', 200),
];
const BOOKS: LibraryBook[] = libraryBooks(CATALOG);
const found = (query: string) => {
  const s = searchLibrary(query, BOOKS);
  return { bible: ids(s.hits.Bible), books: ids(s.hits.Books), music: ids(s.hits.Music), total: s.total };
};

/* ================================================================ search */

check('every row is found by its own title, in capitals and with accents added, and by nothing that is not in it: the examples of the Bible and Music tabs and the real books', () => {
  const accent = (t: string) => t.replace(/e/g, 'é').replace(/o/g, 'ò').toUpperCase();
  for (const s of SAMPLE_SHELVES) for (const q of [s.title, s.title.toUpperCase(), accent(s.title)]) assert.ok(ids(searchLibrary(q, BOOKS).hits.Bible).includes(s.id), `${q} finds the Bible shelf ${s.id}`);
  for (const b of BOOKS) for (const q of [b.title, b.title.toUpperCase(), accent(b.title)]) assert.ok(ids(searchLibrary(q, BOOKS).hits.Books).includes(b.id), `${q} finds the book ${b.id}`);
  for (const p of SAMPLE_PLAYLISTS) for (const q of [p.title, p.title.toUpperCase(), accent(p.title)]) assert.ok(ids(searchLibrary(q, BOOKS).hits.Music).includes(p.id), `${q} finds the playlist ${p.id}`);
  assert.equal(found('zzzz').total, 0);
  assert.equal(found('psalmsx').total, 0, 'a word that is longer than the row\'s word is not found');
});

check('the line under a title is searched too: the note of a shelf or playlist, and for a book its subtitle and its kind', () => {
  assert.deepEqual(found('pilgrim blessing'), { bible: ['prayers'], books: [], music: [], total: 1 });
  assert.deepEqual(found('albergue'), { bible: [], books: [], music: ['evening'], total: 1 });
  assert.deepEqual(found('thoreau'), { bible: [], books: ['walking-readings'], music: [], total: 1 }, 'the subtitle of a book');
  assert.deepEqual(found('imitation christ'), { bible: [], books: ['imitation-of-christ-readings'], music: [], total: 1 });
  assert.deepEqual(found('inglés'), { bible: [], books: ['camino-ingles-guide'], music: [], total: 1 }, 'accents do not matter, in the subtitle either');
  assert.deepEqual(found('ingles'), found('inglés'));
  assert.deepEqual(found('Camino'), { bible: ['plans'], books: ['camino-frances-guide', 'camino-ingles-guide'], music: [], total: 3 }, 'in the order of the catalog (the French Way is the first of the guides)');
});

check('a book is found by its kind: "guide" lists the guides, "readings" and "reflection" the readings, and the length of a book is not a word to search by', () => {
  assert.deepEqual(found('guide').books, ['camino-frances-guide', 'camino-ingles-guide']);
  assert.deepEqual(found('guides').books, [], 'a word that is longer than the row\'s word is not found');
  assert.deepEqual(found('guidebook').books, found('guide').books, 'what a person may type for a guide');
  assert.deepEqual(found('readings').books, ['imitation-of-christ-readings', 'walking-readings']);
  assert.deepEqual(found('reflection').books, ['imitation-of-christ-readings', 'walking-readings']);
  assert.deepEqual(found('reflections').books, found('reflection').books);
  assert.equal(found('min').books.length, 0, '"47 min" is how long it reads, not what it is');
  assert.equal(found('165').total, 0);
  assert.deepEqual(bookWords({ title: 'T', subtitle: 'S', kind: 'Guide · 3 h 20 min' }), ['books', 't', 's', 'guide', 'guidebook']);
  assert.deepEqual(bookWords({ title: 'T', subtitle: 'S', kind: 'Readings · 2 h' }), ['books', 't', 's', 'readings', 'reflection', 'reflections']);
});

check('the name of a tab finds the whole tab, so "bible", "books" and "music" are not dead ends', () => {
  assert.deepEqual(found('bible'), { bible: ids(SAMPLE_SHELVES), books: [], music: [], total: SAMPLE_SHELVES.length });
  assert.deepEqual(found('book'), { bible: [], books: ids(BOOKS), music: [], total: BOOKS.length });
  assert.deepEqual(found('BOOKS'), found('book'));
  assert.deepEqual(found('music'), { bible: [], books: [], music: ids(SAMPLE_PLAYLISTS), total: SAMPLE_PLAYLISTS.length });
});

check('with no books in the bundle the search still finds the examples, and the Books tab has nothing to find', () => {
  const s = searchLibrary('road', []);
  assert.deepEqual(ids(s.hits.Books), []);
  assert.deepEqual(hitTabs(s.hits), ['Bible', 'Music']);
  assert.equal(searchLibrary('book', []).total, 0);
});

check('a word counts when it is the start of a word of the row, and every word of the query has to: "pray", "road pray", not "ray"', () => {
  assert.deepEqual(found('pray'), { bible: ['prayers'], books: [], music: [], total: 1 });
  assert.deepEqual(found('road pray'), { bible: ['prayers'], books: [], music: [], total: 1 }, 'the road AND a prayer: only the Bible shelf has both');
  assert.deepEqual(found('pray road'), found('road pray'), 'the order of the words does not matter');
  assert.equal(found('ray').total, 0, 'the middle of a word is not the start of one');
  assert.deepEqual(found('road'), { bible: ['psalms', 'prayers'], books: ['imitation-of-christ-readings'], music: ['chants'], total: 4 });
  assert.deepEqual(found('for the road').total, 4);
  assert.deepEqual(found('morning wa'), { bible: [], books: [], music: ['morning'], total: 1 }, 'a word still being typed matches');
  assert.deepEqual(found('quiet road'), { bible: [], books: ['imitation-of-christ-readings'], music: [], total: 1 }, 'both words of a title');
});

check('case, accents, punctuation and blanks never matter', () => {
  assert.deepEqual(found('  ROAD.  '), found('road'));
  assert.deepEqual(found('road,'), found('road'));
  assert.deepEqual(found('“road”'), found('road'));
  assert.deepEqual(found('pílgrim'), found('pilgrim'));
  assert.deepEqual(found('Prayers  for\tthe\nroad'), found('prayers for the road'));
  assert.deepEqual(found('quiet-evening'), found('quiet evening'), 'a hyphen is a space');
  assert.deepEqual(wordsOf('Nájera, "La Rioja"!'), ['najera', 'la', 'rioja']);
  assert.deepEqual(wordsOf(null), []);
  assert.deepEqual(wordsOf(undefined), []);
  // letters of other scripts are words too (norm() takes Hangul apart into its letters, in the query and in the rows alike, so they still meet)
  assert.deepEqual(wordsOf('한국어 순례자'), ['한국어', '순례자'].map((w) => w.normalize('NFD')));
  assert.equal(wordsOf('한국어').length, 1);
});

check('no query is not a search, a query of only punctuation is one that finds nothing, and nothing is ever found for either', () => {
  assert.equal(isSearching(''), false);
  assert.equal(isSearching('   \n '), false);
  assert.equal(isSearching('a'), true);
  assert.equal(isSearching('...'), true);
  for (const q of ['', '   ', '...', '?!', '“”']) assert.equal(searchLibrary(q, BOOKS).total, 0, JSON.stringify(q));
});

check('the answer is grouped by tab in the order of the tabs, counts every row once, and does not touch the examples or the books', () => {
  const before = JSON.stringify([SAMPLE_SHELVES, BOOKS, SAMPLE_PLAYLISTS]);
  const s = searchLibrary('road', BOOKS);
  assert.deepEqual(Object.keys(s.hits), [...LIBRARY_TABS]);
  assert.equal(s.total, hitCount(s.hits));
  assert.deepEqual(hitTabs(s.hits), ['Bible', 'Books', 'Music']);
  assert.deepEqual(hitTabs(searchLibrary('music', BOOKS).hits), ['Music']);
  assert.deepEqual(hitTabs(searchLibrary('zzzz', BOOKS).hits), []);
  s.hits.Bible.pop();
  s.hits.Books.pop();
  assert.equal(JSON.stringify([SAMPLE_SHELVES, BOOKS, SAMPLE_PLAYLISTS]), before, 'a result list is a copy');
  assert.equal(searchLibrary('road', BOOKS).total, 4);
});

check('what is said back: one line, no runs of blanks, cut short, and the count in words', () => {
  assert.equal(shownQuery('  a   b \n c '), 'a b c');
  assert.equal(shownQuery('x'.repeat(100)).length, 40);
  assert.ok(shownQuery('x'.repeat(100)).endsWith('…'));
  assert.equal(shownQuery('x'.repeat(40)), 'x'.repeat(40), 'exactly the limit is not cut');
  assert.equal(resultsLine(searchLibrary('psalms', BOOKS)), '1 result for “psalms”');
  assert.equal(resultsLine(searchLibrary('road', BOOKS)), '4 results for “road”');
  assert.equal(resultsLine(searchLibrary('zzz', BOOKS)), 'Nothing found for “zzz”');
  assert.equal(resultsLine(searchLibrary('  zzz   qqq ', BOOKS)), 'Nothing found for “zzz qqq”');
  assert.ok(resultsLine(searchLibrary('q'.repeat(300), BOOKS)).length < 80, 'a pasted paragraph does not break the line');
});

check('only the Bible and Music tabs are examples: their notice says so, and a search or the Bookmarks screen says so only while one of their rows is on it', () => {
  assert.equal(isExampleTab('Bible'), true);
  assert.equal(isExampleTab('Music'), true);
  assert.equal(isExampleTab('Books'), false, 'the books are real');
  assert.deepEqual(Object.keys(PREVIEW_NOTICE), ['Bible', 'Music'], 'there is no Preview notice for the Books tab');
  for (const t of ['Bible', 'Music'] as const) assert.match(PREVIEW_NOTICE[t], /not in the app yet/);
  // a search that finds books alone has no notice at all
  assert.equal(searchNotice(hitTabs(searchLibrary('guide', BOOKS).hits)), null);
  assert.equal(searchNotice(hitTabs(searchLibrary('zzz', BOOKS).hits)), null, 'nothing found: nothing on screen is an example');
  assert.equal(searchNotice(['Books']), null);
  assert.equal(searchNotice(['Bible']), 'The Bible results are examples. The Bible text is not in the app yet.');
  assert.equal(searchNotice(['Music']), 'The Music results are examples. Music is not in the app yet.');
  assert.equal(searchNotice(['Bible', 'Books', 'Music']), 'The Bible and Music results are examples. The Bible text and music are not in the app yet.');
  assert.equal(searchNotice(hitTabs(searchLibrary('road', BOOKS).hits)), 'The Bible and Music results are examples. The Bible text and music are not in the app yet.');
  assert.equal(bookmarksNotice(['Books']), null);
  assert.equal(bookmarksNotice([]), null);
  assert.equal(bookmarksNotice(['Bible']), 'The Bible rows here are examples from the Library preview.');
  assert.equal(bookmarksNotice(['Bible', 'Music']), 'The Bible and Music rows here are examples from the Library preview.');
  assert.equal(exampleNames(['Books']), '');
  assert.equal(exampleNames(['Music', 'Bible']), 'Bible and Music', 'in the order of the tabs');
  assert.match(BOOKMARKS_PRIVATE_LINE, /^Kept only on this phone\. Logging out clears them\.$/);
});

check('a row is bookmarked under its own key: an example row under its tab and id, a book under its anchor (the same one a note on it carries)', () => {
  assert.equal(itemKey('Bible', 'prayers'), 'bible:prayers');
  assert.equal(itemKey('Music', 'chants'), 'music:chants');
  assert.equal(itemKey('Books', 'camino-ingles-guide'), 'book:camino-ingles-guide');
  const all = [
    ...SAMPLE_SHELVES.map((r) => itemKey('Bible', r.id)),
    ...BOOKS.map((r) => itemKey('Books', r.id)),
    ...SAMPLE_PLAYLISTS.map((r) => itemKey('Music', r.id)),
  ];
  assert.equal(new Set(all).size, all.length, 'every key is its own');
  assert.equal(all.length, 12);
  assert.ok(all.every((k) => k.length <= BOOKMARK_KEY_MAX));
});

check('the rows of a list of keys come back by tab, newest bookmark first; a key that is no row any more, and the key of a chapter or a paragraph, show nothing here', () => {
  const h = hitsForKeys(['music:sing', 'book:walking-readings', 'bible:prayers', 'bible:psalms', 'bible:gone', 'nonsense', 'music:morning', 'book:camino-ingles-guide', 'book:withdrawn', 'books:prayers',
    'book:camino-ingles-guide/00-welcome', 'book:camino-ingles-guide/00-welcome#2'], BOOKS);
  assert.deepEqual(ids(h.Bible), ['prayers', 'psalms'], 'in the order of the keys');
  assert.deepEqual(ids(h.Books), ['walking-readings', 'camino-ingles-guide'], 'the books too, and a book that is not in the bundle (or an old example key) is left out');
  assert.deepEqual(ids(h.Music), ['sing', 'morning']);
  assert.equal(hitCount(hitsForKeys([], BOOKS)), 0);
  assert.equal(hitCount(hitsForKeys(['bible:psalms', 'bible:psalms'], BOOKS)), 1, 'a key twice is one row');
  assert.equal(hitCount(hitsForKeys(['book:walking-readings'], [])), 0, 'no books in the bundle: nothing to show for it');
});

/* ================================================================ bookmarks of Library rows */

const at = (key: string, t = 1): Bookmark => ({ key, at: t });

check('bookmarks: a stored list that reads is the list, in its order; anything else is "start empty" (null), never a throw', () => {
  const list = [at('bible:psalms', 30), at('music:sing', 20), at('books:guide', 10)];
  assert.deepEqual(parseBookmarks(packBookmarks(list)), list);
  assert.deepEqual(parseBookmarks(JSON.parse(JSON.stringify(packBookmarks(list)))), list, 'through JSON, as it is stored');
  for (const junk of [undefined, null, 0, 1, 'x', true, [], {}, { v: 2, items: [] }, { v: 1 }, { v: 1, items: 'x' }, { v: 1, items: {} }, { items: [] }]) assert.equal(parseBookmarks(junk), null, JSON.stringify(junk));
  assert.deepEqual(parseBookmarks({ v: 1, items: [] }), []);
});

check('bookmarks: an item that does not read is skipped, a key twice is kept once (the first), a missing time is 0', () => {
  const list = parseBookmarks({ v: 1, items: [null, 7, 'x', {}, { key: '' }, { key: 5 }, { key: 'a:b', at: 5 }, { key: 'a:b', at: 9 }, { key: 'c:d', at: 'soon' }, { key: 'e:f', at: Infinity }, { key: 'x'.repeat(200), at: 1 }] });
  assert.deepEqual(list, [{ key: 'a:b', at: 5 }, { key: 'c:d', at: 0 }, { key: 'e:f', at: 0 }]);
});

check('bookmarks: toggling puts a row in front, or takes it out; the list it was given is not changed; at most BOOKMARKS_MAX', () => {
  const none: Bookmark[] = [];
  const one = toggleBookmark(none, 'bible:psalms', 100);
  assert.deepEqual(one, [{ key: 'bible:psalms', at: 100 }]);
  assert.deepEqual(none, [], 'the original is untouched');
  const two = toggleBookmark(one, 'music:sing', 200);
  assert.deepEqual(bookmarkKeys(two), ['music:sing', 'bible:psalms'], 'newest first');
  assert.equal(hasBookmark(two, 'bible:psalms'), true);
  const back = toggleBookmark(two, 'bible:psalms', 300);
  assert.deepEqual(bookmarkKeys(back), ['music:sing']);
  assert.equal(hasBookmark(back, 'bible:psalms'), false);
  assert.deepEqual(bookmarkKeys(two), ['music:sing', 'bible:psalms'], 'nor this one');
  const again = toggleBookmark(back, 'bible:psalms', 400);
  assert.deepEqual(again[0], { key: 'bible:psalms', at: 400 }, 'put back, it is the newest again');
  let big: Bookmark[] = [];
  for (let i = 0; i < BOOKMARKS_MAX + 20; i++) big = toggleBookmark(big, `k:${i}`, i);
  assert.equal(big.length, BOOKMARKS_MAX);
  assert.equal(big[0].key, `k:${BOOKMARKS_MAX + 19}`, 'the newest stay');
  assert.equal(parseBookmarks({ v: 1, items: Array.from({ length: BOOKMARKS_MAX + 50 }, (_, i) => ({ key: `k:${i}`, at: i })) })!.length, BOOKMARKS_MAX, 'a file that is too long is cut when it is read');
});

check('bookmarks: a book, a chapter or day and a paragraph are bookmarked under their anchors, in the same list as the rows of the tabs, and every anchor a book can make fits the limit', () => {
  let list: Bookmark[] = [];
  const keys = ['book:camino-ingles-guide', 'book:camino-ingles-guide/00-welcome', 'book:camino-ingles-guide/00-welcome#4', 'bible:psalms'];
  keys.forEach((k, i) => { list = toggleBookmark(list, k, i + 1); });
  assert.deepEqual(bookmarkKeys(list), [...keys].reverse(), 'newest first');
  assert.deepEqual(parseBookmarks(JSON.parse(JSON.stringify(packBookmarks(list)))), list);
  assert.equal(hasBookmark(list, 'book:camino-ingles-guide/00-welcome'), true);
  assert.equal(hasBookmark(list, 'book:camino-ingles-guide/00-welcome#5'), false, 'another paragraph is another bookmark');
  const longest = `book:camino-portugues-costero-guide/12-day-10-${'a-very-long-name-'.repeat(4)}for-a-day#9999`;
  assert.ok(longest.length > 80 && longest.length <= BOOKMARK_KEY_MAX, `${longest.length}: longer than the first limit, within the new one`);
  assert.equal(parseBookmarks({ v: 1, items: [{ key: longest, at: 1 }] })![0].key, longest, 'the anchor of a paragraph is kept whole');
  assert.equal(parseBookmarks({ v: 1, items: [{ key: 'k'.repeat(BOOKMARK_KEY_MAX + 1), at: 1 }, { key: 'k'.repeat(BOOKMARK_KEY_MAX), at: 2 }] })!.length, 1, 'a key over the limit is skipped, one at the limit is kept');
});

/* ================================================================ where each book was last read */

const rp = (bookId: string, chapterId: string, t = 1): ReadingPlace => ({ bookId, chapterId, at: t });

check('reading places: what was packed reads back, through JSON as stored; anything else is "start empty" (null), never a throw', () => {
  const list = [rp('a', '00-x', 30), rp('b', '01-y', 20)];
  assert.deepEqual(parseReading(JSON.parse(JSON.stringify(packReading(list)))), list);
  for (const junk of [undefined, null, 0, 'x', true, [], {}, { v: 2, items: [] }, { v: 1 }, { v: 1, items: 'x' }, { items: [] }]) assert.equal(parseReading(junk), null, JSON.stringify(junk));
  assert.deepEqual(parseReading({ v: 1, items: [] }), []);
});

check('reading places: an item that does not read is skipped, a book twice is kept once (the first), a missing time is 0, at most READING_MAX', () => {
  const list = parseReading({ v: 1, items: [null, 7, 'x', {}, { bookId: '', chapterId: 'c' }, { bookId: 'a' }, { bookId: 'a', chapterId: 5 }, { bookId: 'a', chapterId: '00-x', at: 9 }, { bookId: 'a', chapterId: '01-y', at: 99 },
    { bookId: 'b', chapterId: '00-x', at: 'soon' }, { bookId: 'c', chapterId: '00-x', at: Infinity }, { bookId: 'x'.repeat(81), chapterId: '00-x' }, { bookId: 'd', chapterId: 'c'.repeat(121) }] });
  assert.deepEqual(list, [rp('a', '00-x', 9), rp('b', '00-x', 0), rp('c', '00-x', 0)]);
  assert.equal(parseReading({ v: 1, items: Array.from({ length: READING_MAX + 20 }, (_, i) => ({ bookId: `b${i}`, chapterId: '00-x', at: i })) })!.length, READING_MAX);
});

check('reading places: the book that was read last is in front, a book has one place, the list it was given is not changed, and at most READING_MAX books are kept', () => {
  const none: ReadingPlace[] = [];
  const one = rememberPlace(none, 'a', '00-x', 100);
  assert.deepEqual(one, [rp('a', '00-x', 100)]);
  assert.deepEqual(none, []);
  const two = rememberPlace(one, 'b', '01-y', 200);
  assert.deepEqual(two.map((p) => p.bookId), ['b', 'a']);
  const moved = rememberPlace(two, 'a', '03-z', 300);
  assert.deepEqual(moved, [rp('a', '03-z', 300), rp('b', '01-y', 200)], 'the place in a book is replaced, not added');
  assert.deepEqual(two.map((p) => p.chapterId), ['01-y', '00-x'], 'the list it was given is not changed');
  let big: ReadingPlace[] = [];
  for (let i = 0; i < READING_MAX + 5; i++) big = rememberPlace(big, `b${i}`, '00-x', i);
  assert.equal(big.length, READING_MAX);
  assert.equal(big[0].bookId, `b${READING_MAX + 4}`, 'the newest stay');
});

check('Continue reading: the chapter last read when the book still has it, else the first chapter and "Start reading"; nothing for a book with no chapters', () => {
  const b = CATALOG[1]; // two chapters
  assert.deepEqual(resumePoint(b, []), { chapterId: '00-how-to-use-this-book', title: 'How to use this book', resumed: false });
  assert.deepEqual(resumePoint(b, [rp(b.id, '02-day-01-a-stranger-and-a-pilgrim')]), { chapterId: '02-day-01-a-stranger-and-a-pilgrim', title: 'Day 1. A stranger and a pilgrim', resumed: true });
  assert.equal(resumePoint(b, [rp(b.id, '09-a-chapter-the-new-edition-dropped')])?.resumed, false, 'a chapter that is gone is not a place to resume at');
  assert.equal(resumePoint(b, [rp('another-book', '02-day-01-a-stranger-and-a-pilgrim')])?.resumed, false, 'the place in another book is no place in this one');
  assert.equal(resumePoint({ id: 'empty', chapters: [] }, []), null);
});

/* ================================================================ chapters and paragraphs that were bookmarked */

check('the chapters, days and paragraphs bookmarked come back as rows, newest first, with where they are; what is not there any more, and what is not a chapter or a paragraph, shows nothing', () => {
  const texts: Record<string, { chapters: { id: string; title: string; blocks: unknown[] }[] }> = {
    'camino-ingles-guide': { chapters: [{ id: '00-welcome', title: 'Welcome', blocks: [{ t: 'h', level: 2, spans: [{ t: 'Heading' }] }, { t: 'p', spans: [{ t: 'A calm, honest guide ' }, { t: 'to the Camino', i: 1 }, { t: ' Inglés, with every fact in a ledger.' }] }, { t: 'hr' }] }] },
  };
  let loads = 0;
  const load = (id: string) => { loads += 1; return (texts[id] ?? null) as never; };
  const keys = ['book:camino-ingles-guide/00-welcome#1', 'bible:psalms', 'book:camino-ingles-guide', 'book:imitation-of-christ-readings/02-day-01-a-stranger-and-a-pilgrim', 'book:camino-ingles-guide/00-welcome#0', 'book:camino-ingles-guide/00-welcome#2',
    'book:camino-ingles-guide/00-welcome#99', 'book:camino-ingles-guide/09-gone', 'book:withdrawn/00-x', 'book:camino-ingles-guide/00-welcome#1', 'garbage', 'book:imitation-of-christ-readings/02-day-01-a-stranger-and-a-pilgrim#3'];
  const rows = bookPlaces(keys, CATALOG, load);
  assert.deepEqual(rows.map((r) => [r.key, r.level]), [
    ['book:camino-ingles-guide/00-welcome#1', 'paragraph'],
    ['book:imitation-of-christ-readings/02-day-01-a-stranger-and-a-pilgrim', 'chapter'],
  ]);
  assert.deepEqual(rows[0], { key: 'book:camino-ingles-guide/00-welcome#1', level: 'paragraph', bookId: 'camino-ingles-guide', chapterId: '00-welcome', block: 1,
    title: 'A calm, honest guide to the Camino Inglés, with every fact in a ledger.', line: 'Welcome · The English Way' });
  assert.deepEqual(rows[1], { key: 'book:imitation-of-christ-readings/02-day-01-a-stranger-and-a-pilgrim', level: 'chapter', bookId: 'imitation-of-christ-readings', chapterId: '02-day-01-a-stranger-and-a-pilgrim', block: null,
    title: 'Day 1. A stranger and a pilgrim', line: 'The Quiet Road' });
  assert.ok(loads <= 2, `a book's text is read only for a paragraph, and once for each book (${loads})`);
  assert.deepEqual(bookPlaces(['book:camino-ingles-guide/00-welcome'], CATALOG, () => { throw new Error('a chapter needs no text'); }).map((r) => r.level), ['chapter']);
  assert.deepEqual(bookPlaces([], CATALOG, load), []);
  assert.deepEqual(bookPlaces(keys, [], load), [], 'with no books in the bundle there is nothing to open');
  assert.equal(bookPlaces(['book:camino-ingles-guide/00-welcome#1'], CATALOG, () => null).length, 0, 'a book whose text cannot be read has no paragraph to show');
  const long = bookPlaces(['book:camino-ingles-guide/00-welcome#1'], CATALOG, () => ({ chapters: [{ id: '00-welcome', title: 'W', blocks: [{ t: 'p', spans: [{ t: 'word '.repeat(100) }] }, { t: 'p', spans: [{ t: 'word '.repeat(100) }] }] }] }) as never);
  assert.ok(long[0].title.length <= 140 && long[0].title.endsWith('…'), 'a long paragraph is cut for the row');
});

/* ================================================================ bookmarked posts: reading what the database answers */

const ME = '11111111-1111-4111-8111-111111111111';
const HANNAH = '22222222-2222-4222-8222-222222222222';
const LUCAS = '33333333-3333-4333-8333-333333333333';
const P1 = '80000000-0000-4000-8000-000000000001';
const P2 = '80000000-0000-4000-8000-000000000002';
const P3 = '80000000-0000-4000-8000-000000000003';
const NOW = Date.parse('2026-11-07T12:00:00Z');
const row = (o: Record<string, unknown> = {}) => ({
  id: P1, user_id: ME, body: 'Sunrise over the meseta.', place_name: 'Hontanas', published_at: '2026-11-06T07:00:00Z', media_count: 2, status: 'published',
  moderation_status: 'ok', deleted_at: null, expires_at: null, ...o,
});

check('post_saves rows: a list in the order it came, a row without a post id skipped, a post twice kept once; anything but a list is null', () => {
  assert.deepEqual(parseSaveRows([{ post_id: P2, created_at: '2026-11-06T10:00:00Z' }, { post_id: P1, created_at: 'not a date' }, { post_id: P2 }, { post_id: '' }, { post_id: 7 }, {}, null, 'row']),
    [{ postId: P2, savedAt: '2026-11-06T10:00:00Z' }, { postId: P1, savedAt: null }]);
  assert.deepEqual(parseSaveRows([]), []);
  for (const junk of [undefined, null, 'x', 3, {}, { post_id: P1 }]) assert.equal(parseSaveRows(junk), null, JSON.stringify(junk));
});

check('posts rows: only posts that are to be shown: not deleted, published, moderation ok, not an expired story', () => {
  const p = parsePostRows([
    row({ id: P1 }),
    row({ id: P2, deleted_at: '2026-11-06T08:00:00Z' }),
    row({ id: P3, status: 'draft' }),
    row({ id: 'a1', status: 'uploading' }),
    row({ id: 'a2', moderation_status: 'hidden' }),
    row({ id: 'a3', moderation_status: 'removed' }),
    row({ id: 'a4', moderation_status: 'pending' }),
    row({ id: 'a5', expires_at: '2026-11-07T11:59:59Z' }),
    row({ id: 'a6', expires_at: '2026-11-07T12:00:01Z' }),
    row({ id: 'a7', expires_at: 'not a date' }),
  ], NOW)!;
  assert.deepEqual([...p.keys()], [P1, 'a6', 'a7']);
});

check('posts rows: a row that does not read is skipped, text is trimmed and cut, a count that is not one is 0, missing columns are not a reason to hide a post', () => {
  const p = parsePostRows([
    row({ id: P1, body: '  ' + 'x'.repeat(1000) + '  ', place_name: '   ', media_count: -3, published_at: 'soon' }),
    row({ id: P2, body: null, place_name: null, media_count: '2' }),
    { id: P3, user_id: HANNAH },
    { id: 7, user_id: ME }, { id: P1 }, null, 'row', 4,
  ], NOW)!;
  const a = p.get(P1)!;
  assert.equal(a.body!.length, 400);
  assert.ok(a.body!.endsWith('…'));
  assert.equal(a.place, null);
  assert.equal(a.mediaCount, 0);
  assert.equal(a.publishedAt, null);
  assert.deepEqual(p.get(P2), { id: P2, userId: ME, publishedAt: '2026-11-06T07:00:00Z', place: null, body: null, mediaCount: 0 });
  assert.deepEqual(p.get(P3), { id: P3, userId: HANNAH, publishedAt: null, place: null, body: null, mediaCount: 0 }, 'a partial row of the stand-in is still a post');
  assert.equal(p.size, 3);
  for (const junk of [undefined, null, 'x', {}, 5]) assert.equal(parsePostRows(junk, NOW), null);
});

check('author rows: the display name, else the username; a profile without either is not listed', () => {
  const a = parseAuthorRows([{ id: HANNAH, username: 'hannah', display_name: 'Hannah Meyer' }, { id: LUCAS, username: 'lucas', display_name: '  ' }, { id: ME, username: '', display_name: null }, { username: 'x' }, null])!;
  assert.deepEqual([...a], [[HANNAH, 'Hannah Meyer'], [LUCAS, 'lucas']]);
  assert.equal(parseAuthorRows({}), null);
});

check('the list: bookmarks in the order they were made, each with its post, a bookmark of a post that is gone left out, my own posts have no author name', () => {
  const posts = parsePostRows([row({ id: P1 }), row({ id: P3, user_id: HANNAH, body: 'Cruz de Ferro' })], NOW)!;
  const saves = parseSaveRows([{ post_id: P3, created_at: '2026-11-06T10:00:00Z' }, { post_id: P2, created_at: '2026-11-06T09:00:00Z' }, { post_id: P1, created_at: '2026-11-05T09:00:00Z' }])!;
  const list = buildSavedPosts(saves, posts, new Map([[HANNAH, 'Hannah Meyer'], [ME, 'Ana Torres']]), ME);
  assert.deepEqual(list.map((p) => p.id), [P3, P1], 'P2 is not visible any more: not listed');
  assert.equal(list[0].author, 'Hannah Meyer');
  assert.equal(list[0].savedAt, '2026-11-06T10:00:00Z');
  assert.equal(list[1].author, null, 'mine: no name, the line says "Your post"');
  assert.equal(buildSavedPosts(saves, new Map(), new Map(), ME).length, 0);
});

/* ================================================================ bookmarked posts: the saved copy and the words */

const post = (o: Partial<SavedPost> = {}): SavedPost => ({ id: P1, userId: ME, savedAt: '2026-11-06T10:00:00Z', publishedAt: '2026-11-06T07:00:00Z', place: 'Hontanas', body: 'Sunrise over the meseta.', mediaCount: 2, author: null, ...o });

check('the saved copy: what was packed reads back as it was; a copy that is not one, or a post in it that does not read, is dropped; never a throw', () => {
  const list = [post(), post({ id: P3, userId: HANNAH, author: 'Hannah Meyer', place: null, body: null, mediaCount: 0, savedAt: null, publishedAt: null })];
  const packed = packSavedPosts(list, NOW);
  assert.equal(packed.v, 1);
  assert.equal(packed.savedAt, NOW);
  assert.deepEqual(parseSavedCopy(JSON.parse(JSON.stringify(packed))), list);
  for (const junk of [undefined, null, 'x', 4, [], {}, { v: 2, posts: [] }, { v: 1 }, { v: 1, posts: 'x' }]) assert.equal(parseSavedCopy(junk), null, JSON.stringify(junk));
  const messy = parseSavedCopy({ v: 1, savedAt: 1, posts: [null, 5, {}, { id: P1 }, { id: P1, userId: ME, mediaCount: 'x', body: 7 }, { id: P1, userId: ME }, { id: P2, userId: ME, body: 'ok' }] })!;
  assert.deepEqual(messy.map((p) => p.id), [P1, P2], 'a post twice is kept once');
  assert.equal(messy[0].mediaCount, 0);
  assert.equal(messy[0].body, null);
  assert.equal(parseSavedCopy({ v: 1, posts: Array.from({ length: SAVED_POSTS_MAX + 30 }, (_, i) => ({ id: `p${i}`, userId: ME })) })!.length, SAVED_POSTS_MAX);
});

check('the words: heading, line under it, photos and clips, and what a failed change says', () => {
  assert.equal(postHeading('Hontanas', '6 Nov 2026'), 'Hontanas · 6 Nov 2026');
  assert.equal(postHeading(null, '6 Nov 2026'), '6 Nov 2026');
  assert.equal(postHeading('Hontanas', ''), 'Hontanas');
  assert.equal(postHeading(null, ''), 'On the Camino');
  assert.equal(mediaLabel(0), '');
  assert.equal(mediaLabel(1), '1 photo or clip');
  assert.equal(mediaLabel(2), '2 photos or clips');
  assert.equal(postByline(post(), ME), 'Your post · 2 photos or clips');
  assert.equal(postByline(post({ mediaCount: 0 }), ME), 'Your post');
  assert.equal(postByline(post({ userId: HANNAH, author: 'Hannah Meyer', mediaCount: 1 }), ME), 'By Hannah Meyer · 1 photo or clip');
  assert.equal(postByline(post({ userId: HANNAH, author: null, mediaCount: 0 }), ME), 'A pilgrim\'s post');
  assert.equal(postByline(post({ userId: ME, mediaCount: 0 }), null), 'A pilgrim\'s post', 'nobody signed in: never "yours"');
  assert.match(changeFailure(new Error('You are offline.')), /offline.*needs a connection/i);
  assert.match(changeFailure(new TypeError('Failed to fetch')), /offline/i);
  assert.doesNotMatch(changeFailure(new Error('permission denied')), /offline/i);
  assert.match(changeFailure('boom'), /could not be changed/);
});

check('what the Posts part shows: a known list wins, waiting is waiting, and "nothing yet" is said only when it is nothing', () => {
  const some = [post()];
  const v = (posts: SavedPost[] | null, loading: boolean, offline = false, failed = false) => savedView({ posts, loading, offline, failed });
  assert.equal(v(null, false), 'loading', 'before the first read has started');
  assert.equal(v(null, true), 'loading');
  assert.equal(v(some, true), 'list', 'the saved copy while the answer is on its way');
  assert.equal(v(some, false), 'list');
  assert.equal(v(some, false, true), 'list', 'offline with a saved copy: the copy, with a note');
  assert.equal(v(some, false, false, true), 'list', 'a failed refresh with a saved copy: the copy, with a note');
  assert.equal(v([], true), 'loading', 'an empty copy is not "nothing yet" while the answer is on its way');
  assert.equal(v([], false), 'empty');
  assert.equal(v([], false, true), 'empty');
  assert.equal(v(null, false, true), 'offline-empty');
  assert.equal(v(null, false, false, true), 'failed-empty');
});

/* ================================================================ bookmarked posts: the reads, against a scripted stand-in */

type Call = { table: string; select?: string; filters: unknown[][]; order?: unknown[]; limit?: number; writes: string[] };
type Answer = { data: unknown; error: { message: string } | null };
type Script = (call: Call) => Answer | Promise<Answer>;

// A query builder that answers like Supabase: chain anything, await the result at any step. Every request is logged; a method that writes is recorded.
function client(script: Script, log: Call[] = []): SavedPostsClient {
  return {
    from(table) {
      const call: Call = { table, filters: [], writes: [] };
      log.push(call);
      const b = {
        select(cols: string) { call.select = cols; return b; },
        eq(...a: unknown[]) { call.filters.push(['eq', ...a]); return b; },
        in(...a: unknown[]) { call.filters.push(['in', ...a]); return b; },
        order(...a: unknown[]) { call.order = a; return b; },
        limit(count: number) { call.limit = count; return b; },
        insert() { call.writes.push('insert'); return b; },
        update() { call.writes.push('update'); return b; },
        upsert() { call.writes.push('upsert'); return b; },
        delete() { call.writes.push('delete'); return b; },
        then(res: (v: Answer) => unknown, rej: (e: unknown) => unknown) { return Promise.resolve().then(() => script(call)).then(res, rej); },
      };
      return b as unknown as SavedPostsQuery;
    },
  };
}

const online: SavedPostsNet = { assertOnline: async () => {}, isOffline: (e) => /offline|failed to fetch/i.test(String(e instanceof Error ? e.message : e)), message: (e) => (e instanceof Error ? e.message : String(e)) };
const offlineNet: SavedPostsNet = { ...online, assertOnline: async () => { throw new Error('You are offline.'); } };
const api = (script: Script, log: Call[] = [], net: SavedPostsNet = online, timeoutMs?: number) => makeSavedPostsApi(client(script, log), net, { now: () => NOW, timeoutMs });

const SAVES = [{ post_id: P3, created_at: '2026-11-06T10:00:00Z' }, { post_id: P2, created_at: '2026-11-06T09:00:00Z' }, { post_id: P1, created_at: '2026-11-05T09:00:00Z' }];
const POSTS = [row({ id: P1 }), row({ id: P3, user_id: HANNAH, body: 'Cruz de Ferro', place_name: null, media_count: 0 })]; // P2 is not visible: not in the answer
const PROFILES = [{ id: HANNAH, username: 'hannah', display_name: 'Hannah Meyer' }];
const happy: Script = (c) => ({ data: c.table === 'post_saves' ? SAVES : c.table === 'posts' ? POSTS : PROFILES, error: null });

(async () => {
  await test('saved posts: three plain reads under the row level security that exists, nothing else: this person\'s bookmarks, newest first, at most 50; then those posts; then the other authors', async () => {
    const log: Call[] = [];
    const res = await api(happy, log).listMySavedPosts(ME);
    assert.equal(res.ok, true);
    assert.deepEqual(log.map((c) => c.table), ['post_saves', 'posts', 'profiles']);
    assert.equal(log[0].select, 'post_id, created_at');
    assert.deepEqual(log[0].filters, [['eq', 'user_id', ME]]);
    assert.deepEqual(log[0].order, ['created_at', { ascending: false }]);
    assert.equal(log[0].limit, 50);
    assert.equal(log[1].select, POST_COLUMNS);
    assert.deepEqual(log[1].filters, [['in', 'id', [P3, P2, P1]]], 'in the order of the bookmarks');
    assert.equal(log[2].select, 'id, username, display_name');
    assert.deepEqual(log[2].filters, [['in', 'id', [HANNAH]]], 'only authors who are not me, each once');
    for (const c of log) assert.deepEqual(c.writes, [], 'a read never writes');
  });

  await test('saved posts: the answer is the visible ones, in bookmark order, with the other author\'s name and not mine', async () => {
    const res = await api(happy).listMySavedPosts(ME);
    assert.ok(res.ok);
    if (!res.ok) return;
    assert.deepEqual(res.posts.map((p) => p.id), [P3, P1], 'the bookmark of a post that cannot be seen is not listed');
    assert.equal(res.posts[0].author, 'Hannah Meyer');
    assert.equal(res.posts[0].body, 'Cruz de Ferro');
    assert.equal(res.posts[1].author, null);
    assert.equal(res.posts[1].mediaCount, 2);
    assert.equal(res.capped, false);
  });

  await test('saved posts: no bookmarks is an empty list after one request; only my own posts means no request for names; a refused request for names still lists the posts', async () => {
    const log: Call[] = [];
    const none = await api(() => ({ data: [], error: null }), log).listMySavedPosts(ME);
    assert.deepEqual(none, { ok: true, posts: [], capped: false });
    assert.equal(log.length, 1);
    const log2: Call[] = [];
    const mine = await api((c) => ({ data: c.table === 'post_saves' ? [{ post_id: P1, created_at: null }] : [row({ id: P1 })], error: null }), log2).listMySavedPosts(ME);
    assert.ok(mine.ok && mine.posts.length === 1);
    assert.deepEqual(log2.map((c) => c.table), ['post_saves', 'posts']);
    for (const failing of [() => ({ data: null, error: { message: 'permission denied for table profiles' } }), () => { throw new TypeError('Failed to fetch'); }]) {
      const res = await api((c) => (c.table === 'profiles' ? failing() : happy(c))).listMySavedPosts(ME);
      assert.ok(res.ok, 'the names are a nicety');
      if (res.ok) { assert.deepEqual(res.posts.map((p) => p.id), [P3, P1]); assert.equal(res.posts[0].author, null); }
    }
  });

  await test('saved posts: a full page says so (there may be older bookmarks), a page that is not full does not', async () => {
    const many = Array.from({ length: SAVED_POSTS_MAX }, (_, i) => ({ post_id: `70000000-0000-4000-8000-${String(i).padStart(12, '0')}`, created_at: null }));
    const res = await api((c) => ({ data: c.table === 'post_saves' ? many : [], error: null })).listMySavedPosts(ME);
    assert.ok(res.ok && res.capped && res.posts.length === 0);
    const res2 = await api(happy).listMySavedPosts(ME);
    assert.ok(res2.ok && !res2.capped);
  });

  await test('saved posts never throw: offline stops before any request; an error answer, a throw, an answer that is not a list and a timeout are each { ok: false } with the words and whether it was offline', async () => {
    const log: Call[] = [];
    assert.deepEqual(await api(happy, log, offlineNet).listMySavedPosts(ME), { ok: false, offline: true, message: 'You are offline.' });
    assert.equal(log.length, 0, 'nothing went out');

    const refused = await api(() => ({ data: null, error: { message: 'permission denied for table post_saves' } })).listMySavedPosts(ME);
    assert.deepEqual(refused, { ok: false, offline: false, message: 'permission denied for table post_saves' });
    const dropped = await api(() => ({ data: null, error: { message: 'TypeError: Failed to fetch' } })).listMySavedPosts(ME);
    assert.ok(!dropped.ok && dropped.offline, 'supabase-js reports a dropped connection as an error answer');
    const thrown = await api(() => { throw new TypeError('Failed to fetch'); }).listMySavedPosts(ME);
    assert.ok(!thrown.ok && thrown.offline);
    for (const data of [{ not: 'a list' }, null, 'x', 5]) {
      const bad = await api(() => ({ data, error: null })).listMySavedPosts(ME);
      assert.ok(!bad.ok && !bad.offline && /not a list of bookmarks/.test(bad.message), JSON.stringify(data));
    }
    const badPosts = await api((c) => ({ data: c.table === 'post_saves' ? SAVES : { not: 'a list' }, error: null })).listMySavedPosts(ME);
    assert.ok(!badPosts.ok && /not a list of posts/.test(badPosts.message));
    const slow = await api(() => new Promise<Answer>(() => {}), [], online, 30).listMySavedPosts(ME);
    assert.deepEqual(slow, { ok: false, offline: false, message: 'The server took too long to answer.' });
  });

  /* ---------------- the source ---------------- */

  check('savedPosts.ts reads and never writes, and the logic files are pure (wiring.test.ts checks who writes a bookmark of a post)', () => {
    const src = read('src/features/library/savedPosts.ts').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    assert.doesNotMatch(src, /\.(insert|update|upsert|delete|rpc)\(/, 'savedPosts.ts only selects');
    assert.doesNotMatch(src, /from 'react|from 'expo|supabase-js|lib\/supabase|lib\/net'/, 'no React Native and no real client in the logic file');
    for (const f of ['bookmarks.ts', 'search.ts', 'reading.ts', 'places.ts', 'sample.ts']) assert.doesNotMatch(read(`src/features/library/${f}`), /from '(react|react-native|expo|@\/)/, `${f} is pure`);
  });

  console.log(`${n} of ${n} passed`);
})().catch((e) => { console.error(e); process.exit(1); });
