// Plain-node checks of the Bible list of the Library: the 73 books, their codes, chapters and ids, the three parts and the filter that picks
// one, the words that count and describe them, and the date line of the daily reading banner. No React, no React Native, no network.
// Run: npm run test:library (library.test.ts runs this file too).
//
// The expected data below is typed in again on purpose, from the owner's list and the source of the text (the World English Bible, Catholic
// edition: 73 books, 1,328 chapters), and not read from books.ts: a typo in the data (a name, a code, a chapter count, a book missing or twice)
// then fails here instead of reaching the screen.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ADDITIONS_NOTE, BIBLE_BOOKS, DEUTERO_NOTE, TESTAMENTS, TESTAMENT_LABEL, TESTAMENT_SEARCH, bookByCode, bookById, bookLine, booksOf, chaptersLabel, countLine, partWords,
  type BibleBook, type Testament,
} from '../bible/books';
import { msUntilTomorrow, todayLine } from '../bible/today';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8'); // npm test runs from mobile/

const OLD = 'Genesis 50, Exodus 40, Leviticus 27, Numbers 36, Deuteronomy 34, Joshua 24, Judges 21, Ruth 4, 1 Samuel 31, 2 Samuel 24, 1 Kings 22, 2 Kings 25, 1 Chronicles 29, 2 Chronicles 36, Ezra 10, Nehemiah 13, Esther 10, Job 42, Psalms 150, Proverbs 31, Ecclesiastes 12, Song of Songs 8, Isaiah 66, Jeremiah 52, Lamentations 5, Ezekiel 48, Daniel 14, Hosea 14, Joel 3, Amos 9, Obadiah 1, Jonah 4, Micah 7, Nahum 3, Habakkuk 3, Zephaniah 3, Haggai 2, Zechariah 14, Malachi 4';
const NEW = 'Matthew 28, Mark 16, Luke 24, John 21, Acts 28, Romans 16, 1 Corinthians 16, 2 Corinthians 13, Galatians 6, Ephesians 6, Philippians 4, Colossians 4, 1 Thessalonians 5, 2 Thessalonians 3, 1 Timothy 6, 2 Timothy 4, Titus 3, Philemon 1, Hebrews 13, James 5, 1 Peter 5, 2 Peter 3, 1 John 5, 2 John 1, 3 John 1, Jude 1, Revelation 22';
const DEUTERO = 'Tobit 14, Judith 16, Wisdom 19, Sirach 51, Baruch 6, 1 Maccabees 16, 2 Maccabees 15';
const OLD_CODES = 'GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH ESG JOB PSA PRO ECC SNG ISA JER LAM EZK DAG HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC MAL';
const DEUTERO_CODES = 'TOB JDT WIS SIR BAR 1MA 2MA';
const NEW_CODES = 'MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV';

const parse = (list: string) => list.split(', ').map((entry) => {
  const m = /^(.+) (\d+)$/.exec(entry);
  assert.ok(m, `"${entry}" is not "Name 12"`);
  return { name: m![1], chapters: Number(m![2]) };
});
const sum = (rows: readonly { chapters: number }[]) => rows.reduce((total, r) => total + r.chapters, 0);
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const shape = (rows: readonly BibleBook[]) => rows.map((b) => ({ name: b.name, chapters: b.chapters }));
const plain = (text: string) => text.replace(/\u00a0/g, ' '); // the lines under a name use no-break spaces, so that a wrapping line never splits "50 chapters"

check('Old Testament: the 39 books of the list, in order, each with its chapters, 931 in all (Daniel is the Greek book of 14, Esther the Greek book of 10)', () => {
  const rows = booksOf('old');
  assert.equal(rows.length, 39);
  assert.deepEqual(shape(rows), parse(OLD));
  assert.equal(sum(rows), 931);
  assert.ok(rows.every((b) => b.testament === 'old'));
  assert.equal(bookById('bible-daniel')!.chapters, 14, 'Daniel holds the Prayer of Azariah (3), Susanna (13), Bel and the Dragon (14)');
  assert.equal(bookById('bible-esther')!.chapters, 10);
});

check('New Testament: the 27 books of the list, in order, each with its chapters, 260 in all', () => {
  const rows = booksOf('new');
  assert.equal(rows.length, 27);
  assert.deepEqual(shape(rows), parse(NEW));
  assert.equal(sum(rows), 260);
  assert.ok(rows.every((b) => b.testament === 'new'));
});

check('Deuterocanon: the seven books of the Catholic canon, 137 chapters, and nothing else: the added passages are inside Esther and Daniel and are no rows', () => {
  const rows = booksOf('deutero');
  assert.equal(rows.length, 7);
  assert.deepEqual(shape(rows), parse(DEUTERO));
  assert.equal(sum(rows), 137);
  assert.equal(rows[4].detail, 'With the Letter of Jeremiah', 'Baruch is six chapters with the Letter of Jeremiah');
  assert.ok(rows.every((b) => b.testament === 'deutero'));
  assert.match(DEUTERO_NOTE, /Orthodox Bibles include a few more books\.$/);
  assert.equal(ADDITIONS_NOTE, 'Esther and Daniel, in the Old Testament, include their Greek additions: Daniel 3 holds the Prayer of Azariah and the Song of the Three, 13 is Susanna and 14 is Bel and the Dragon.');
  assert.equal(bookById('bible-additions-to-esther'), undefined, 'the row of the added passages of Esther is gone');
  assert.equal(bookById('bible-additions-to-daniel'), undefined, 'the row of the added passages of Daniel is gone');
  assert.equal(BIBLE_BOOKS.filter((b) => /^Additions to/.test(b.name)).length, 0);
});

check('the whole list is 73 rows (39 + 7 + 27), the three parts partition it, and 1,328 chapters are counted in all', () => {
  assert.equal(BIBLE_BOOKS.length, 73);
  assert.deepEqual([...TESTAMENTS], ['old', 'deutero', 'new']);
  const parts = TESTAMENTS.flatMap((t) => booksOf(t));
  assert.deepEqual(parts.map((b) => b.id), BIBLE_BOOKS.map((b) => b.id), 'Old Testament, Deuterocanon, New Testament, in that order, with nothing left out or twice');
  assert.equal(sum(BIBLE_BOOKS), 931 + 137 + 260);
  assert.equal(sum(BIBLE_BOOKS), 1328, 'the chapters of the source: the World English Bible, Catholic edition');
  assert.equal(booksOf('old').length + booksOf('deutero').length + booksOf('new').length, BIBLE_BOOKS.length);
});

check('every book has the code of the source (USFM), typed in again here: unique, three characters, in the order of the list; Esther is ESG and Daniel DAG', () => {
  assert.deepEqual(booksOf('old').map((b) => b.code), OLD_CODES.split(' '));
  assert.deepEqual(booksOf('deutero').map((b) => b.code), DEUTERO_CODES.split(' '));
  assert.deepEqual(booksOf('new').map((b) => b.code), NEW_CODES.split(' '));
  const codes = BIBLE_BOOKS.map((b) => b.code);
  assert.equal(new Set(codes).size, 73);
  for (const code of codes) assert.match(code, /^[0-9A-Z]{3}$/, code);
  assert.equal(bookById('bible-esther')!.code, 'ESG');
  assert.equal(bookById('bible-daniel')!.code, 'DAG');
  assert.equal(bookByCode('PSA')!.name, 'Psalms');
  assert.equal(bookByCode('1SA')!.id, 'bible-1-samuel');
  assert.equal(bookByCode('psa'), undefined, 'a code is upper case');
  assert.equal(bookByCode('XYZ'), undefined);
  assert.equal(bookById('bible-psalms')!.code, 'PSA');
  assert.equal(bookById('bible-nothing'), undefined);
});

check('ids are stable and lower case: "bible-" and the name ("1 Samuel" is bible-1-samuel), all different, because a bookmark is kept under them', () => {
  const ids = BIBLE_BOOKS.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const b of BIBLE_BOOKS) {
    assert.match(b.id, /^bible-[a-z0-9]+(-[a-z0-9]+)*$/, b.id);
    assert.equal(b.id, `bible-${slug(b.name)}`, `${b.name} has the id ${b.id}`);
  }
  assert.deepEqual([ids[0], ids[8], ids[21], ids[38]], ['bible-genesis', 'bible-1-samuel', 'bible-song-of-songs', 'bible-malachi']);
  assert.deepEqual(ids.slice(39, 46), ['bible-tobit', 'bible-judith', 'bible-wisdom', 'bible-sirach', 'bible-baruch', 'bible-1-maccabees', 'bible-2-maccabees']);
  assert.deepEqual([ids[46], ids[72]], ['bible-matthew', 'bible-revelation']);
  // every id the earlier list had (except the two rows that are gone) is still a row, with the same id
  const earlier = ['bible-genesis', 'bible-exodus', 'bible-esther', 'bible-daniel', 'bible-psalms', 'bible-song-of-songs', 'bible-malachi', 'bible-tobit', 'bible-2-maccabees', 'bible-matthew', 'bible-john', 'bible-revelation'];
  for (const id of earlier) assert.ok(ids.includes(id), id);
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
  assert.equal(countLine('deutero'), '7 books');
  assert.equal(countLine('new'), '27 books');
  assert.equal(chaptersLabel(50), '50\u00a0chapters', 'a no-break space: a line wraps before "50 chapters", never between 50 and "chapters"');
  assert.equal(plain(chaptersLabel(50)), '50 chapters');
  assert.equal(plain(chaptersLabel(1)), '1 chapter');
  const by = (id: string) => BIBLE_BOOKS.find((b) => b.id === id)!;
  assert.equal(plain(bookLine(by('bible-genesis'))), '50 chapters');
  assert.equal(plain(bookLine(by('bible-jude'))), '1 chapter');
  assert.equal(plain(bookLine(by('bible-genesis'), true)), 'Old Testament · 50 chapters');
  assert.equal(bookLine(by('bible-genesis'), true), 'Old\u00a0Testament · 50\u00a0chapters', 'the part and the chapters do not break inside: only the dots are places to wrap');
  assert.equal(partWords(by('bible-genesis')), 'Old\u00a0Testament');
  assert.equal(plain(bookLine(by('bible-baruch'))), '6 chapters · With the Letter of Jeremiah');
  assert.equal(plain(bookLine(by('bible-baruch'), true)), 'Deuterocanon · 6 chapters · With the Letter of Jeremiah');
  assert.equal(plain(bookLine(by('bible-daniel'))), '14 chapters · With Susanna, and Bel and the Dragon', 'Susanna is found by searching "susanna": the detail of Daniel says so');
  assert.equal(plain(bookLine(by('bible-esther'))), '10 chapters · With the Greek additions');
  const single = BIBLE_BOOKS.filter((b) => b.chapters === 1).map((b) => b.name);
  assert.deepEqual(single, ['Obadiah', 'Philemon', '2 John', '3 John', 'Jude']);
  const detailed = BIBLE_BOOKS.filter((b) => b.detail).map((b) => b.id);
  assert.deepEqual(detailed, ['bible-esther', 'bible-daniel', 'bible-baruch'], 'only these three rows carry a line of their own');
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

check('the banner reads its date again at the next midnight of the phone: the milliseconds to the start of the next day, by the calendar and not by 24 hours, and never under a second', () => {
  assert.equal(msUntilTomorrow(new Date(2026, 10, 8, 23, 59, 59)), 1000, 'a second before midnight');
  assert.equal(msUntilTomorrow(new Date(2026, 10, 8, 23, 59, 59, 500)), 1000, 'under a second is a second: a timer that fires early does not spin');
  assert.equal(msUntilTomorrow(new Date(2026, 10, 8, 12)), 12 * 3600 * 1000, 'noon');
  assert.equal(msUntilTomorrow(new Date(2026, 10, 8, 0, 0, 0)), 24 * 3600 * 1000, 'midnight itself: a whole day');
  assert.equal(msUntilTomorrow(new Date(2026, 11, 31, 18)), 6 * 3600 * 1000, 'the end of a year');
  assert.equal(msUntilTomorrow(new Date(2028, 1, 28, 12)), 12 * 3600 * 1000, 'the day before a 29 February');
  assert.equal(msUntilTomorrow(new Date('not a date')), 60000, 'a date that does not read waits a minute');
  const sooner = msUntilTomorrow(new Date(2026, 10, 8, 20));
  assert.ok(sooner < 24 * 3600 * 1000 && sooner > 0);
  assert.ok(msUntilTomorrow() > 0 && msUntilTomorrow() <= 25 * 3600 * 1000, 'with no argument it is now (at most 25 hours, the longest day)');
});

check('the data files are pure: no React, no React Native, no theme, nothing that could not run in plain node', () => {
  const pure = ['books.ts', 'today.ts', 'ref.ts', 'blocks.ts', 'order.ts', 'gridMath.ts', 'tileFit.ts', 'lastRead.ts', 'verseRows.ts', 'verseActions.ts', 'credit.ts', 'wrap.ts', 'actionBar.ts', 'textTypes.ts'];
  for (const f of pure) assert.doesNotMatch(read(`src/features/library/bible/${f}`), /from '(react|react-native|expo|@\/)/, `${f} is pure`);
});

console.log(`${n} of ${n} passed (Bible)`);
