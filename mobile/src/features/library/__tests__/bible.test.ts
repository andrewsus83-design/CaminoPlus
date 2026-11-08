// Plain-node checks of the Bible list of the Library: the books, their chapters and their ids, the three parts and the filter that picks
// one, the words that count and describe them, and the date line of the daily reading banner. No React, no React Native, no network.
// Run: npm run test:library (library.test.ts runs this file too).
//
// The expected data below is typed in again on purpose, from the owner's list, and not read from books.ts: a typo in the data (a name, a
// chapter count, a book missing or twice) then fails here instead of reaching the screen.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BIBLE_BOOKS, DEUTERO_NOTE, TESTAMENTS, TESTAMENT_LABEL, TESTAMENT_SEARCH, bookLine, booksOf, chaptersLabel, countLine, type BibleBook, type Testament,
} from '../bible/books';
import { todayLine } from '../bible/today';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8'); // npm test runs from mobile/

const OLD = 'Genesis 50, Exodus 40, Leviticus 27, Numbers 36, Deuteronomy 34, Joshua 24, Judges 21, Ruth 4, 1 Samuel 31, 2 Samuel 24, 1 Kings 22, 2 Kings 25, 1 Chronicles 29, 2 Chronicles 36, Ezra 10, Nehemiah 13, Esther 10, Job 42, Psalms 150, Proverbs 31, Ecclesiastes 12, Song of Songs 8, Isaiah 66, Jeremiah 52, Lamentations 5, Ezekiel 48, Daniel 12, Hosea 14, Joel 3, Amos 9, Obadiah 1, Jonah 4, Micah 7, Nahum 3, Habakkuk 3, Zephaniah 3, Haggai 2, Zechariah 14, Malachi 4';
const NEW = 'Matthew 28, Mark 16, Luke 24, John 21, Acts 28, Romans 16, 1 Corinthians 16, 2 Corinthians 13, Galatians 6, Ephesians 6, Philippians 4, Colossians 4, 1 Thessalonians 5, 2 Thessalonians 3, 1 Timothy 6, 2 Timothy 4, Titus 3, Philemon 1, Hebrews 13, James 5, 1 Peter 5, 2 Peter 3, 1 John 5, 2 John 1, 3 John 1, Jude 1, Revelation 22';
const DEUTERO = 'Tobit 14, Judith 16, Wisdom 19, Sirach 51, Baruch 6, 1 Maccabees 16, 2 Maccabees 15';

const parse = (list: string) => list.split(', ').map((entry) => {
  const m = /^(.+) (\d+)$/.exec(entry);
  assert.ok(m, `"${entry}" is not "Name 12"`);
  return { name: m![1], chapters: Number(m![2]) };
});
const sum = (rows: readonly { chapters: number | null }[]) => rows.reduce((total, r) => total + (r.chapters ?? 0), 0);
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const shape = (rows: readonly BibleBook[]) => rows.map((b) => ({ name: b.name, chapters: b.chapters }));

check('Old Testament: the 39 books of the list, in order, each with its chapters, 929 in all', () => {
  const rows = booksOf('old');
  assert.equal(rows.length, 39);
  assert.deepEqual(shape(rows), parse(OLD));
  assert.equal(sum(rows), 929);
  assert.ok(rows.every((b) => b.testament === 'old' && b.chapters !== null));
});

check('New Testament: the 27 books of the list, in order, each with its chapters, 260 in all', () => {
  const rows = booksOf('new');
  assert.equal(rows.length, 27);
  assert.deepEqual(shape(rows), parse(NEW));
  assert.equal(sum(rows), 260);
  assert.ok(rows.every((b) => b.testament === 'new' && b.chapters !== null));
});

check('Deuterocanon: the seven books of the Catholic canon (137 chapters), then the added passages of Esther and Daniel, which have no chapter count', () => {
  const rows = booksOf('deutero');
  assert.equal(rows.length, 9);
  assert.deepEqual(shape(rows.slice(0, 7)), parse(DEUTERO));
  assert.equal(sum(rows.slice(0, 7)), 137);
  assert.deepEqual(shape(rows.slice(7)), [{ name: 'Additions to Esther', chapters: null }, { name: 'Additions to Daniel', chapters: null }]);
  assert.equal(sum(rows), 137, 'the added passages add no chapters');
  assert.equal(rows[4].detail, 'With the Letter of Jeremiah', 'Baruch is six chapters with the Letter of Jeremiah');
  assert.equal(`${rows[8].name} (${rows[8].detail})`, 'Additions to Daniel (Susanna; Prayer of Azariah and Song of the Three; Bel and the Dragon)');
  assert.ok(rows.every((b) => b.testament === 'deutero'));
  assert.match(DEUTERO_NOTE, /Orthodox Bibles include a few more books\.$/);
});

check('the whole list is 75 rows (39 + 9 + 27), the three parts partition it, and 1,326 chapters are counted in all', () => {
  assert.equal(BIBLE_BOOKS.length, 75);
  assert.deepEqual([...TESTAMENTS], ['old', 'deutero', 'new']);
  const parts = TESTAMENTS.flatMap((t) => booksOf(t));
  assert.deepEqual(parts.map((b) => b.id), BIBLE_BOOKS.map((b) => b.id), 'Old Testament, Deuterocanon, New Testament, in that order, with nothing left out or twice');
  assert.equal(sum(BIBLE_BOOKS), 929 + 137 + 260);
  assert.equal(booksOf('old').length + booksOf('deutero').length + booksOf('new').length, BIBLE_BOOKS.length);
});

check('ids are stable and lower case: "bible-" and the name ("1 Samuel" is bible-1-samuel), all different, because a bookmark is kept under them', () => {
  const ids = BIBLE_BOOKS.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const b of BIBLE_BOOKS) {
    assert.match(b.id, /^bible-[a-z0-9]+(-[a-z0-9]+)*$/, b.id);
    assert.equal(b.id, `bible-${slug(b.name)}`, `${b.name} has the id ${b.id}`);
  }
  assert.deepEqual([ids[0], ids[8], ids[21], ids[38]], ['bible-genesis', 'bible-1-samuel', 'bible-song-of-songs', 'bible-malachi']);
  assert.deepEqual(ids.slice(39, 48), ['bible-tobit', 'bible-judith', 'bible-wisdom', 'bible-sirach', 'bible-baruch', 'bible-1-maccabees', 'bible-2-maccabees', 'bible-additions-to-esther', 'bible-additions-to-daniel']);
  assert.deepEqual([ids[48], ids[74]], ['bible-matthew', 'bible-revelation']);
});

check('the filter: a part is its own books and nothing else, a copy that can be changed without touching the list', () => {
  for (const t of TESTAMENTS) assert.ok(booksOf(t).length > 0 && booksOf(t).every((b) => b.testament === t), t);
  const before = JSON.stringify(BIBLE_BOOKS);
  booksOf('old').pop();
  booksOf('new').length = 0;
  assert.equal(JSON.stringify(BIBLE_BOOKS), before);
  assert.equal(booksOf('old')[0].name, 'Genesis');
  assert.equal(booksOf('deutero')[0].name, 'Tobit');
  assert.equal(booksOf('new')[0].name, 'Matthew');
});

check('the words: the choices of the selector, the count of a part, "1 chapter", and the line under a name', () => {
  assert.deepEqual(TESTAMENTS.map((t) => TESTAMENT_LABEL[t]), ['Old Testament', 'Deuterocanon', 'New Testament']);
  assert.equal(countLine('old'), '39 books');
  assert.equal(countLine('deutero'), '7 books and 2 added passages');
  assert.equal(countLine('new'), '27 books');
  assert.equal(chaptersLabel(50), '50 chapters');
  assert.equal(chaptersLabel(1), '1 chapter');
  assert.equal(chaptersLabel(null), '');
  const by = (id: string) => BIBLE_BOOKS.find((b) => b.id === id)!;
  assert.equal(bookLine(by('bible-genesis')), '50 chapters');
  assert.equal(bookLine(by('bible-jude')), '1 chapter');
  assert.equal(bookLine(by('bible-genesis'), true), 'Old Testament · 50 chapters');
  assert.equal(bookLine(by('bible-baruch')), '6 chapters · With the Letter of Jeremiah');
  assert.equal(bookLine(by('bible-baruch'), true), 'Deuterocanon · 6 chapters · With the Letter of Jeremiah');
  assert.equal(bookLine(by('bible-additions-to-esther')), 'Added passages', 'no chapter count: the line is what it is');
  assert.equal(bookLine(by('bible-additions-to-daniel')), 'Susanna; Prayer of Azariah and Song of the Three; Bel and the Dragon');
  const single = BIBLE_BOOKS.filter((b) => b.chapters === 1).map((b) => b.name);
  assert.deepEqual(single, ['Obadiah', 'Philemon', '2 John', '3 John', 'Jude']);
});

check('the search reads the part of a row in its short and its long form, for every part', () => {
  assert.match(TESTAMENT_SEARCH.deutero, /Deuterocanon\b/);
  assert.match(TESTAMENT_SEARCH.deutero, /Deuterocanonical/);
  for (const t of ['old', 'new'] as Testament[]) assert.equal(TESTAMENT_SEARCH[t], TESTAMENT_LABEL[t]);
});

check('the date line of the daily reading banner: "Sunday 8 November", in the phone\'s own time, and nothing for a date that does not read', () => {
  assert.equal(todayLine(new Date(2026, 10, 8, 9, 30)), 'Sunday 8 November');
  assert.equal(todayLine(new Date(2026, 10, 8, 0, 0, 1)), 'Sunday 8 November', 'just after midnight is the new day');
  assert.equal(todayLine(new Date(2026, 10, 8, 23, 59, 59)), 'Sunday 8 November', 'just before midnight is still the old one');
  assert.equal(todayLine(new Date(2026, 11, 25, 12)), 'Friday 25 December');
  assert.equal(todayLine(new Date(2027, 0, 1, 12)), 'Friday 1 January');
  assert.equal(todayLine(new Date(2028, 1, 29, 12)), 'Tuesday 29 February');
  assert.equal(todayLine(new Date('not a date')), '');
  assert.match(todayLine(), /^(Sun|Mon|Tues|Wednes|Thurs|Fri|Satur)day \d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December)$/, 'with no argument it is today');
});

check('the data files are pure: no React, no React Native, no theme, nothing that could not run in plain node', () => {
  for (const f of ['bible/books.ts', 'bible/today.ts']) assert.doesNotMatch(read(`src/features/library/${f}`), /from '(react|react-native|expo|@\/)/, `${f} is pure`);
});

console.log(`${n} of ${n} passed (Bible)`);
