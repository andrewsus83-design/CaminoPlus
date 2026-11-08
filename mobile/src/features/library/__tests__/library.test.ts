// Plain-node checks of the Library's search, of the bookmarks of its rows, and of the reading of bookmarked posts. No React, no
// React Native, no network: the search and the bookmark list are pure functions, and the posts are read through the real code of
// savedPosts.ts against a scripted stand-in for Supabase. The Bible list and the twelve books have their own files, run from here
// (bible.test.ts, books.test.ts). Run: npm run test:library
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import './bible.test';
import './books.test';
import './reader.test';
import {
  BOOKMARKS_MAX, bookmarkKeys, hasBookmark, packBookmarks, parseBookmarks, toggleBookmark, type Bookmark,
} from '../bookmarks';
import {
  POST_COLUMNS, SAVED_POSTS_MAX, buildSavedPosts, changeFailure, makeSavedPostsApi, mediaLabel, packSavedPosts, parseAuthorRows, parsePostRows,
  parseSaveRows, parseSavedCopy, postByline, postHeading, savedView, type SavedPost, type SavedPostsClient, type SavedPostsNet, type SavedPostsQuery,
} from '../savedPosts';
import { BIBLE_BOOKS, booksOf } from '../bible/books';
import { BOOK_CATALOG } from '../books/catalog';
import { LIBRARY_TABS, ROW_TABS } from '../sample';
import { RESULT_GROUPS, hitCount, hitGroups, hitsForKeys, isSearching, itemKey, resultsLine, searchLibrary, shownQuery, verseKey, wordsOf } from '../search';

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
const found = (query: string) => {
  const s = searchLibrary(query);
  return { bible: ids(s.hits.Bible), books: ids(s.hits.Books), total: s.total };
};
const bibleIds = (...names: string[]) => names.map((name) => BIBLE_BOOKS.find((b) => b.name === name)!.id);
const bookId = (title: string) => BOOK_CATALOG.find((b) => b.title === title)!.id;

/* ================================================================ search */

check('every row is found by its own name or title, in capitals and with accents added, and by nothing that is not in it', () => {
  const accent = (t: string) => t.replace(/e/g, 'é').replace(/o/g, 'ò').toUpperCase();
  for (const b of BIBLE_BOOKS) for (const q of [b.name, b.name.toUpperCase(), accent(b.name)]) assert.ok(ids(searchLibrary(q).hits.Bible).includes(b.id), `${q} finds the Bible row ${b.id}`);
  for (const b of BOOK_CATALOG) for (const q of [b.title, b.title.toUpperCase(), accent(b.title)]) assert.ok(ids(searchLibrary(q).hits.Books).includes(b.id), `${q} finds the book ${b.id}`);
  assert.equal(found('zzzz').total, 0);
  assert.equal(found('psalmsx').total, 0, 'a word that is longer than the row\'s word is not found');
});

check('the search covers all three parts of the Bible: a name of the Old Testament, of the Deuterocanon and of the New Testament each finds its row, and "1 john" the one', () => {
  assert.deepEqual(found('genesis'), { bible: bibleIds('Genesis'), books: [], total: 1 });
  assert.deepEqual(found('tobit'), { bible: bibleIds('Tobit'), books: [], total: 1 });
  assert.deepEqual(found('maccabees'), { bible: bibleIds('1 Maccabees', '2 Maccabees'), books: [], total: 2 });
  assert.deepEqual(found('wisdom'), { bible: bibleIds('Wisdom'), books: [], total: 1 });
  assert.deepEqual(found('revelation'), { bible: bibleIds('Revelation'), books: [], total: 1 });
  assert.deepEqual(found('1 john'), { bible: bibleIds('1 John'), books: [bookId('Dark Night of the Soul')], total: 2 }, 'the epistle, and the book by John of the Cross, whose era is "16th century": a "1" is the start of "16th"');
  assert.deepEqual(found('song songs'), { bible: bibleIds('Song of Songs'), books: [], total: 1 });
  assert.deepEqual(found('susanna'), { bible: bibleIds('Daniel'), books: [], total: 1 }, 'Susanna is inside Daniel (chapter 13), and the line of Daniel says so');
  assert.deepEqual(found('greek additions'), { bible: bibleIds('Esther'), books: [], total: 1 });
  assert.deepEqual(found('bel dragon'), { bible: bibleIds('Daniel'), books: [], total: 1 });
  assert.deepEqual(found('letter jeremiah'), { bible: bibleIds('Baruch'), books: [], total: 1 });
});

check('the part of a row is searched: "new testament", "old testament" and "deuterocanon" (and its long form) list that part', () => {
  assert.deepEqual(found('new testament'), { bible: ids(booksOf('new')), books: [], total: 27 });
  assert.deepEqual(found('old testament'), { bible: ids(booksOf('old')), books: [], total: 39 });
  assert.deepEqual(found('deuterocanon'), { bible: ids(booksOf('deutero')), books: [], total: 7 });
  assert.deepEqual(found('Deuterocanonical'), found('deuterocanon'));
  assert.deepEqual(found('testament'), { bible: [...ids(booksOf('old')), ...ids(booksOf('new'))], books: [], total: 66 }, 'both testaments, in the order of the list');
});

check('the twelve books are searched by title, author, era and blurb: "teresa", "kempis" (without the accent of à), "avila", "spain", "manresa", "19th"', () => {
  assert.deepEqual(found('teresa'), { bible: [], books: [bookId('The Life of St. Teresa of Jesus'), bookId('The Interior Castle')], total: 2 });
  assert.deepEqual(found('Ávila'), found('teresa'), 'accents do not matter, in the query or in the rows');
  assert.deepEqual(found('kempis'), { bible: [], books: [bookId('The Imitation of Christ')], total: 1 });
  assert.deepEqual(found('thomas a kempis'), found('kempis'));
  assert.deepEqual(found('catherine'), { bible: [], books: [bookId('The Dialogue of Saint Catherine of Siena')], total: 1 });
  assert.deepEqual(found('therese'), { bible: [], books: [bookId('The Story of a Soul')], total: 1 });
  assert.deepEqual(found('spain'), { bible: [], books: [bookId('The Life of St. Teresa of Jesus'), bookId('Dark Night of the Soul'), bookId('The Spiritual Exercises')], total: 3 });
  assert.deepEqual(found('manresa'), { bible: [], books: [bookId('The Spiritual Exercises')], total: 1 });
  assert.deepEqual(found('19th century'), { bible: [], books: [bookId('The Way of a Pilgrim')], total: 1 });
  assert.deepEqual(found('russian wanderer'), { bible: [], books: [bookId('The Way of a Pilgrim')], total: 1 });
  assert.deepEqual(found('jesus prayer'), { bible: [], books: [bookId('The Way of a Pilgrim'), bookId('The Life of St. Teresa of Jesus')], total: 2 }, 'the two words may be in different parts of a row: a title and a blurb');
  assert.deepEqual(found('caussade'), { bible: [], books: [bookId('Abandonment to Divine Providence')], total: 1 });
  assert.deepEqual(found('de sales'), { bible: [], books: [bookId('Introduction to the Devout Life')], total: 1 });
});

check('what is not on a row is not searched: the group, the source and the licence notes of a book find nothing', () => {
  for (const q of ['pilgrims on foot', 'contemplative', 'great classics', 'gutenberg', 'ccel', 'licence', 'public domain', 'translator', 'benham', 'pusey', 'coppens']) assert.equal(found(q).total, 0, q);
});

check('the name of a tab finds the whole tab, so "bible" and "books" are not dead ends, and "free" finds the twelve (it is on every row)', () => {
  assert.deepEqual(found('bible'), { bible: ids(BIBLE_BOOKS), books: [], total: 73 });
  assert.deepEqual(found('book'), { bible: [], books: ids(BOOK_CATALOG), total: 12 });
  assert.deepEqual(found('BOOKS'), found('book'));
  assert.deepEqual(found('free'), found('book'));
  assert.equal(found('music').total, 0, 'there is no Music tab, and no row says music');
  assert.equal(found('notes').total, 0, 'Notes are not searched here');
});

check('a word counts when it is the start of a word of the row, and every word of the query has to: "teres", "john cross", not "eresa"', () => {
  assert.equal(found('teres').total, 2);
  assert.equal(found('eresa').total, 0, 'the middle of a word is not the start of one');
  assert.deepEqual(found('john cross'), { bible: [], books: [bookId('Dark Night of the Soul')], total: 1 }, 'John AND a cross: only the book of John of the Cross has both');
  assert.deepEqual(found('cross john'), found('john cross'), 'the order of the words does not matter');
  assert.deepEqual(found('john'), { bible: bibleIds('John', '1 John', '2 John', '3 John'), books: [bookId('Dark Night of the Soul')], total: 5 });
  assert.deepEqual(found('1 sam'), { bible: bibleIds('1 Samuel'), books: [], total: 1 }, 'a number and a word still being typed');
  assert.deepEqual(found('dark nig'), { bible: [], books: [bookId('Dark Night of the Soul')], total: 1 });
  assert.deepEqual(found('1').bible, ids(BIBLE_BOOKS.filter((b) => /^1 /.test(b.name))), '"1" starts only the books of the Bible numbered 1 (and the dates of some books: 1565, 1609)');
});

check('case, accents, punctuation and blanks never matter', () => {
  assert.deepEqual(found('  KEMPIS.  '), found('kempis'));
  assert.deepEqual(found('kempis,'), found('kempis'));
  assert.deepEqual(found('“kempis”'), found('kempis'));
  assert.deepEqual(found('thérèse'), found('therese'));
  assert.deepEqual(found('Jean-Pierre'), found('jean pierre'), 'a hyphen is a space');
  assert.deepEqual(found('St. Teresa'), found('st teresa'));
  assert.deepEqual(found('Dark  Night\tof\nthe Soul'), found('dark night of the soul'));
  assert.deepEqual(wordsOf('Teresa of Ávila, "Interior Castle"!'), ['teresa', 'of', 'avila', 'interior', 'castle']);
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
  for (const q of ['', '   ', '...', '?!', '“”']) assert.equal(searchLibrary(q).total, 0, JSON.stringify(q));
});

check('the answer is grouped by tab in the order of the tabs (Bible, Books; Notes are not rows), counts every row once, and does not touch the data', () => {
  const before = JSON.stringify([BIBLE_BOOKS, BOOK_CATALOG]);
  const s = searchLibrary('john');
  assert.deepEqual(Object.keys(s.hits), [...RESULT_GROUPS]);
  assert.deepEqual([...RESULT_GROUPS], ['Bible', 'Books', 'Verses']);
  assert.deepEqual([...ROW_TABS], ['Bible', 'Books']);
  assert.deepEqual([...LIBRARY_TABS], ['Bible', 'Books', 'Notes']);
  assert.equal(s.total, hitCount(s.hits));
  assert.deepEqual(hitGroups(s.hits), ['Bible', 'Books']);
  assert.deepEqual(hitGroups(searchLibrary('kempis').hits), ['Books']);
  assert.deepEqual(hitGroups(searchLibrary('genesis').hits), ['Bible']);
  assert.deepEqual(hitGroups(searchLibrary('zzzz').hits), []);
  s.hits.Bible.pop();
  assert.equal(JSON.stringify([BIBLE_BOOKS, BOOK_CATALOG]), before, 'a result list is a copy');
  assert.equal(searchLibrary('john').total, 5);
});

check('what is said back: one line, no runs of blanks, cut short, and the count in words', () => {
  assert.equal(shownQuery('  a   b \n c '), 'a b c');
  assert.equal(shownQuery('x'.repeat(100)).length, 40);
  assert.ok(shownQuery('x'.repeat(100)).endsWith('…'));
  assert.equal(shownQuery('x'.repeat(40)), 'x'.repeat(40), 'exactly the limit is not cut');
  assert.equal(resultsLine(searchLibrary('psalms')), '1 result for “psalms”');
  assert.equal(resultsLine(searchLibrary('john')), '5 results for “john”');
  assert.equal(resultsLine(searchLibrary('zzz')), 'Nothing found for “zzz”');
  assert.equal(resultsLine(searchLibrary('  zzz   qqq ')), 'Nothing found for “zzz qqq”');
  assert.ok(resultsLine(searchLibrary('q'.repeat(300))).length < 80, 'a pasted paragraph does not break the line');
});

check('a row is bookmarked under its tab and id: "bible:bible-genesis", "books:confessions", a verse under its place "bible:PSA.121.3", and no two of the 85 rows share a key', () => {
  assert.equal(itemKey('Bible', 'bible-genesis'), 'bible:bible-genesis');
  assert.equal(itemKey('Books', 'confessions'), 'books:confessions');
  assert.equal(verseKey({ code: 'PSA', chapter: 121, from: 3 }), 'bible:PSA.121.3');
  assert.equal(verseKey({ code: 'PSA', chapter: 121, from: 1, to: 4 }), 'bible:PSA.121.1-4');
  assert.equal(verseKey({ code: 'SIR', chapter: 11, from: 15, to: 16 }), 'bible:SIR.11.15-16');
  const all = [...BIBLE_BOOKS.map((r) => itemKey('Bible', r.id)), ...BOOK_CATALOG.map((r) => itemKey('Books', r.id))];
  assert.equal(new Set(all).size, all.length, 'every key is its own');
  assert.equal(all.length, 73 + 12);
  for (const k of BIBLE_BOOKS.map((r) => itemKey('Bible', r.id))) assert.doesNotMatch(k.slice('bible:'.length), /^[0-9A-Z]{3}\./, 'the key of a book can never be taken for the place of a verse');
});

check('the rows of a list of keys come back by tab, newest bookmark first, and a key that is no row any more shows nothing', () => {
  const h = hitsForKeys(['books:confessions', 'books:interior-castle', 'bible:bible-psalms', 'bible:bible-genesis', 'bible:bible-gone', 'nonsense', 'books:story-of-a-soul']);
  assert.deepEqual(ids(h.Bible), ['bible-psalms', 'bible-genesis'], 'in the order of the keys, not the order of the Bible');
  assert.deepEqual(ids(h.Books), ['confessions', 'interior-castle', 'story-of-a-soul']);
  assert.equal(hitCount(hitsForKeys([])), 0);
  assert.equal(hitCount(hitsForKeys(['bible:bible-psalms', 'bible:bible-psalms'])), 1, 'a key twice is one row');
});

check('bookmarks kept before the tabs changed (Music rows, the old example shelves and covers) and under the two rows that were taken out of the Bible list are ignored without a crash: they show nothing and stay in the list', () => {
  const legacy = ['music:morning', 'music:evening', 'music:chants', 'music:sing', 'bible:psalms', 'bible:gospels', 'bible:prayers', 'bible:plans', 'books:guide', 'books:stories', 'books:prayers', 'books:spanish', 'notes:anything', 'bible:bible-additions-to-esther', 'bible:bible-additions-to-daniel'];
  const h = hitsForKeys(legacy);
  assert.deepEqual(h, { Bible: [], Books: [], Verses: [] }, 'no row is left of them');
  assert.equal(hitCount(h), 0);
  assert.deepEqual(hitGroups(h), []);
  assert.deepEqual(Object.keys(h), ['Bible', 'Books', 'Verses'], 'there is no Music group to draw');
  // mixed with current ones: only the current ones show, in their order
  const mixed = hitsForKeys(['music:sing', 'books:confessions', 'bible:psalms', 'bible:bible-job', 'books:guide']);
  assert.deepEqual({ bible: ids(mixed.Bible), books: ids(mixed.Books) }, { bible: ['bible-job'], books: ['confessions'] });
  // a stored file that holds them still reads (the list is kept as it was), and a bookmark can still be taken off or added next to them
  const stored = parseBookmarks(JSON.parse(JSON.stringify(packBookmarks(legacy.map((key, i) => ({ key, at: 100 - i }))))));
  assert.ok(stored);
  assert.deepEqual(bookmarkKeys(stored!), legacy);
  const next = toggleBookmark(stored!, 'books:confessions', 500);
  assert.deepEqual(bookmarkKeys(next).slice(0, 2), ['books:confessions', 'music:morning']);
  assert.equal(hitCount(hitsForKeys(bookmarkKeys(next))), 1);
  // the screens: a Bookmarks screen with only such keys is empty, and says how to bookmark (wiring.test.ts reads the screen)
});

/* ================================================================ bookmarks of Library rows */

const at = (key: string, t = 1): Bookmark => ({ key, at: t });

check('bookmarks: a stored list that reads is the list, in its order; anything else is "start empty" (null), never a throw', () => {
  const list = [at('bible:bible-psalms', 30), at('books:confessions', 20), at('music:sing', 10)];
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
  const one = toggleBookmark(none, 'bible:bible-psalms', 100);
  assert.deepEqual(one, [{ key: 'bible:bible-psalms', at: 100 }]);
  assert.deepEqual(none, [], 'the original is untouched');
  const two = toggleBookmark(one, 'books:confessions', 200);
  assert.deepEqual(bookmarkKeys(two), ['books:confessions', 'bible:bible-psalms'], 'newest first');
  assert.equal(hasBookmark(two, 'bible:bible-psalms'), true);
  const back = toggleBookmark(two, 'bible:bible-psalms', 300);
  assert.deepEqual(bookmarkKeys(back), ['books:confessions']);
  assert.equal(hasBookmark(back, 'bible:bible-psalms'), false);
  assert.deepEqual(bookmarkKeys(two), ['books:confessions', 'bible:bible-psalms'], 'nor this one');
  const again = toggleBookmark(back, 'bible:bible-psalms', 400);
  assert.deepEqual(again[0], { key: 'bible:bible-psalms', at: 400 }, 'put back, it is the newest again');
  let big: Bookmark[] = [];
  for (let i = 0; i < BOOKMARKS_MAX + 20; i++) big = toggleBookmark(big, `k:${i}`, i);
  assert.equal(big.length, BOOKMARKS_MAX);
  assert.equal(big[0].key, `k:${BOOKMARKS_MAX + 19}`, 'the newest stay');
  assert.equal(parseBookmarks({ v: 1, items: Array.from({ length: BOOKMARKS_MAX + 50 }, (_, i) => ({ key: `k:${i}`, at: i })) })!.length, BOOKMARKS_MAX, 'a file that is too long is cut when it is read');
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
    for (const f of ['bookmarks.ts', 'search.ts']) assert.doesNotMatch(read(`src/features/library/${f}`), /from '(react|react-native|expo|@\/)/, `${f} is pure`);
  });

  console.log(`${n} of ${n} passed`);
})().catch((e) => { console.error(e); process.exit(1); });
