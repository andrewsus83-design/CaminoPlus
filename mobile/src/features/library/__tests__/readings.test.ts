// Plain-node checks of the readings of the Daily reading: the references of the lectionary (reference.ts: how they are read, said again and looked up in the Bible inside the
// app), the files that hold them (readingsCore.ts, assets/library/daily), what a day is called (content.ts), and the data of the days we have, set against the calendar that the phone
// works out for itself (liturgy.ts). No React, no React Native, no network. Run: npm run test:library (daily.test.ts runs this file too).
//
// The data of 2026 comes from Pascua (tools/liturgy/README.md says how it was read and what is wrong with it). This file keeps the evidence next to the code: every difference between
// that data and the calendar of the app is listed here BY DATE, so that a change of the data, of the calendar or of the parser shows up as a failure that somebody reads, never as a
// quiet change of what a pilgrim sees. The expected words of the Bible are typed in again on purpose and are not read from the files.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { BIBLE_BOOKS } from '../bible/books';
import { makeBibleText, type TextIndex } from '../bible/textCore';
import type { TextSource } from '../bible/verseRows';
import { pillBesideTitle, INSIDE, OUTSIDE, PILL_WIDTH, ROW_GAP, TITLE_WIDTH } from '../daily/bannerLayout';
import { parseDateKey } from '../daily/datekey';
import { NO_READINGS, READING_KINDS, READING_TITLES, READINGS_SOURCE, WHOLE_PSALM_NOTE, celebrationOf, makeContent, readingsLine, readingsSpoken } from '../daily/content';
import { liturgicalDay, type LiturgicalDay } from '../daily/liturgy';
import { makeReadingsLookup, parseReadingsFile, type DayRecord } from '../daily/readingsCore';
import { NUMBERING_DIFFERS, formatReference, parseReference, psalmOfText, readPassage, runsOf, shortReference, touchesDifferingChapter, type PassageLine } from '../daily/reference';
import { run } from './runTs';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };
const root = process.cwd(); // npm test runs from mobile/
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

// ------------------------------------------------------------------------------------------------------------------ the real files

const BIBLE = path.join(root, 'assets/bible/webc');
const index = JSON.parse(fs.readFileSync(path.join(BIBLE, 'index.json'), 'utf8')) as TextIndex;
const loaders = Object.fromEntries(index.books.map((b) => [b.code, () => JSON.parse(fs.readFileSync(path.join(BIBLE, `${b.code}.json`), 'utf8'))]));
const bible = makeBibleText(index, loaders);
const source: TextSource = { hasBook: bible.hasBook, loadBook: bible.loadBook };

const FILE_2026 = JSON.parse(read('assets/library/daily/readings-2026.json')) as unknown;
const lookup = makeReadingsLookup([() => FILE_2026]);
const content = makeContent({ lookup, source });

type Row = { date: string; liturgical_day: string; feast: string | null; liturgical_color: string; first_reading_ref: string; psalm_ref: string; second_reading_ref: string | null; gospel_ref: string };
const EXPORT = JSON.parse(read('../tools/liturgy/data/pascua-daily-readings.json')) as { about: { read: string }; rows: Row[] };
const ymd = (key: string) => parseDateKey(key)!;
const litOf = (key: string): LiturgicalDay => liturgicalDay(ymd(key).y, ymd(key).m, ymd(key).d);
const texts = (lines: readonly PassageLine[]) => lines.filter((l): l is { n: string; text: string } => !('gap' in l));

/* ================================================================================================== the references */

check('a reference is read in every form the source writes it in, and said again in one plain way', () => {
  const said: Array<[string, string]> = [
    ['Wisdom 6:12-16', 'Wisdom 6:12-16'],
    ['1 Peter 1:10-1:16', '1 Peter 1:10-16'],
    ['Genesis 3:9-15, 3:20', 'Genesis 3:9-15, 20'],
    ['Genesis 3:9-15, 20', 'Genesis 3:9-15, 20'],
    ['Psalm 87', 'Psalm 87'],
    ['John 19:25-34', 'John 19:25-34'],
    ['Exodus 34:4b-6,8-9', 'Exodus 34:4b-6, 8-9'],
    ['Acts 11:21b-26; 13:1-3', 'Acts 11:21b-26; 13:1-3'],
    ['Ezekiel 9:1-9:7;10:18-10:22', 'Ezekiel 9:1-7; 10:18-22'],
    ['Psalm 4:2-4:3, 4:4-4:5, 4:7b-4:8', 'Psalm 4:2-3, 4-5, 7b-8'],
    ['Psalm 145:1-2, 145:8-9, 145:10-11, 145:13-14', 'Psalm 145:1-2, 8-9, 10-11, 13-14'],
    ['Matthew 9:36-10:8', 'Matthew 9:36–10:8'],
    ['Sirach 27:30—28:7', 'Sirach 27:30–28:7'],
    ['Galatians 4:22-24, 26-27, 31–5:1', 'Galatians 4:22-24, 26-27, 31–5:1'],
    ['Revelation 20:1-4, 11—21:2', 'Revelation 20:1-4, 11–21:2'],
    ['Matthew 10:34-11:1', 'Matthew 10:34–11:1'],
    ['Psalm 90:3-4, 5-6, 12-13, 14 and 17', 'Psalm 90:3-4, 5-6, 12-13, 14, 17'],
    ['Psalm 37:3-4, 18 and 23, 27 and 29', 'Psalm 37:3-4, 18, 23, 27, 29'],
    ['Psalm 118:1 and 8-9, 19-21, 25-27a', 'Psalm 118:1, 8-9, 19-21, 25-27a'],
    ['Psalm 98:1, 2-3ab, 3cd-4', 'Psalm 98:1, 2-3ab, 3cd-4'],
    ['Isaiah 38:1-6, 21-22, 7-8', 'Isaiah 38:1-6, 21-22, 7-8'],
    ['Hosea 2:16, 17c-2:18, 2:21-2:22', 'Hosea 2:16, 17c-18, 21-22'],
    ['Hosea 11:1-4, 8e-9', 'Hosea 11:1-4, 8e-9'],
    ['Philemon 7-20', 'Philemon 7-20'],
    ['2 John 4-9', '2 John 4-9'],
    ['3 John 5-8', '3 John 5-8'],
    ['Jude 1:17, 1:20b-1:25', 'Jude 17, 20b-25'],
    ['Song of Solomon 3:1-3:4b', 'Song of Songs 3:1-4b'],
    ['Song of Songs 2:8-14', 'Song of Songs 2:8-14'],
    ['Jeremiah 14:17-22 [^1]', 'Jeremiah 14:17-22'],
    ['Psalm 79:8,9,11,13 [^2] [^11]', 'Psalm 79:8, 9, 11, 13'],
    ['  John   3:16-18  ', 'John 3:16-18'],
    ['psalm 63:2, 3-4', 'Psalm 63:2, 3-4'],
    ['Daniel 3:52-55', 'Daniel 3:52-55'],
    ['Luke 1:46-48, 49-50, 53-54', 'Luke 1:46-48, 49-50, 53-54'],
  ];
  for (const [text, want] of said) {
    const ref = parseReference(text);
    assert.ok(ref, `"${text}" is read`);
    assert.equal(formatReference(ref!), want, text);
    assert.deepEqual(parseReference(formatReference(ref!)), ref, `"${want}" is read back as the same reference`);
  }
  assert.deepEqual(parseReference('1 Peter 1:10-1:16'), { code: '1PE', segments: [{ c1: 1, v1: 10, l1: '', c2: 1, v2: 16, l2: '' }] });
  assert.deepEqual(parseReference('Psalm 87'), { code: 'PSA', segments: [{ c1: 87, v1: null, l1: '', c2: 87, v2: null, l2: '' }] }, 'a whole psalm: no verses');
  assert.deepEqual(parseReference('Exodus 34:4b-6'), { code: 'EXO', segments: [{ c1: 34, v1: 4, l1: 'b', c2: 34, v2: 6, l2: '' }] }, 'a part of a verse keeps its letter');
  assert.deepEqual(parseReference('Matthew 9:36-10:8')!.segments, [{ c1: 9, v1: 36, l1: '', c2: 10, v2: 8, l2: '' }], 'a run over a chapter');
  assert.deepEqual(parseReference('Philemon 7-20')!.segments, [{ c1: 1, v1: 7, l1: '', c2: 1, v2: 20, l2: '' }], 'a book of one chapter: the numbers are verses');
});

check('what is not a reference, or names a place the Bible does not have, is refused', () => {
  const refused = [
    '', '   ', 'Wisdom', 'Wisdom 6:', 'Wisdom 6:16-12', 'Wisdom 20:1', 'Wisdom 0:1', 'Wisdom 6:0', 'Atlantis 1:1', 'Esther C:12, 14-16, 23-25', 'John 3:16-', 'John 3:16,', 'John :16', 'Psalm 151', 'Psalm 0',
    'John 3:1 2', 'John 3:16:17', 'Psalm 85:9-10-11-12, 13-14', 'Psalm/Deuteronomy 32', 'Matthew 10:5-9:1', '12:1-5', 'John', 'x'.repeat(200), 'John 3:16 and', 'John 3;16', 'John 3:1,,2',
  ];
  for (const text of refused) assert.equal(parseReference(text), null, JSON.stringify(text));
  assert.equal(parseReference(7 as unknown as string), null, 'not even text');
  assert.equal(parseReference(`John ${[...Array(13).keys()].map((i) => `1:${i + 1}`).join(', ')}`), null, 'more runs than any reading has');
  assert.equal(psalmOfText('Psalm 85:9-10-11-12, 13-14'), 85, 'the psalm can still be named');
  assert.equal(psalmOfText('Psalm 151:1'), null);
  assert.equal(psalmOfText('Isaiah 12:2-6'), null);
  assert.equal(psalmOfText('Psalms 3'), null);
});

check('the short form is for a line with little room: a psalm is its number, every other reading is said in full', () => {
  assert.equal(shortReference(parseReference('Psalm 63:2, 3-4, 5-6, 7-8')!), 'Psalm 63');
  assert.equal(shortReference(parseReference('Psalm 87')!), 'Psalm 87');
  assert.equal(shortReference(parseReference('Wisdom 6:12-16')!), 'Wisdom 6:12-16');
  assert.equal(shortReference(parseReference('Isaiah 12:2-6')!), 'Isaiah 12:2-6', 'a canticle in the place of the psalm is not a psalm');
});

check('NUMBERING_DIFFERS names books of the list and chapters they have, each once and in order', () => {
  for (const [code, chapters] of Object.entries(NUMBERING_DIFFERS)) {
    const book = BIBLE_BOOKS.find((b) => b.code === code);
    assert.ok(book, `${code} is a book of the list`);
    assert.ok(chapters.every((c) => c >= 1 && c <= book!.chapters), `${code}: chapters of the book`);
    assert.deepEqual([...chapters], [...new Set(chapters)].sort((a, b) => a - b), `${code}: once each, in order`);
  }
  assert.ok(!('PSA' in NUMBERING_DIFFERS), 'the Psalms have their own rule: the title');
  assert.ok(touchesDifferingChapter(parseReference('Micah 5:1-4a')!));
  assert.ok(touchesDifferingChapter(parseReference('Malachi 3:1-4, 23-24')!));
  assert.ok(touchesDifferingChapter(parseReference('Isaiah 8:23-9:3')!), 'a run that goes into a chapter on the list');
  assert.ok(!touchesDifferingChapter(parseReference('Isaiah 25:6-10a')!));
  assert.ok(!touchesDifferingChapter(parseReference('Wisdom 6:12-16')!));
});

/* ===================================================================================================== the words */

check('a passage is read from the Bible inside the app, word for word, every verse of the run and no other', () => {
  const wisdom = readPassage(parseReference('Wisdom 6:12-16')!, source)!;
  assert.deepEqual(texts(wisdom.lines).map((l) => l.n), ['12', '13', '14', '15', '16']);
  assert.equal(wisdom.whole, false);
  assert.ok(!wisdom.lines.some((l) => 'gap' in l), 'one run, no gap');
  assert.match(texts(wisdom.lines)[0].text, /^Wisdom is radiant and doesn’t fade away; and is easily seen by those who love her/);
  assert.equal(texts(wisdom.lines)[1].text, 'She anticipates those who desire her, making herself known.');
  assert.match(texts(wisdom.lines)[4].text, /^because she herself goes around, seeking those who are worthy of her/);
  const gospel = texts(readPassage(parseReference('Matthew 25:1-13')!, source)!.lines);
  assert.equal(gospel.length, 13);
  assert.match(gospel[0].text, /^“Then the Kingdom of Heaven will be like ten virgins who took their lamps/);
  assert.equal(gospel[1].text, 'Five of them were foolish, and five were wise.');
  assert.equal(gospel[12].text, 'Watch therefore, for you don’t know the day nor the hour in which the Son of Man is coming.');
  const second = texts(readPassage(parseReference('1 Thessalonians 4:13-18')!, source)!.lines);
  assert.deepEqual([second[0].n, second[5].n], ['13', '18']);
  assert.equal(second[5].text, 'Therefore comfort one another with these words.');
});

check('the runs of a reference that skips verses have a gap between them, and a part of a verse is the whole verse', () => {
  const gen = readPassage(parseReference('Genesis 3:9-15, 3:20')!, source)!;
  assert.deepEqual(gen.lines.map((l) => ('gap' in l ? '-' : l.n)), ['9', '10', '11', '12', '13', '14', '15', '-', '20']);
  assert.equal(runsOf(gen.lines).length, 2);
  assert.deepEqual(runsOf(gen.lines).map((r) => r.map((l) => l.n).join(',')), ['9,10,11,12,13,14,15', '20']);
  const exodus = readPassage(parseReference('Exodus 34:4b-6, 8-9')!, source)!;
  assert.deepEqual(texts(exodus.lines).map((l) => l.n), ['4', '5', '6', '8', '9'], 'verse 4 whole, though the lectionary starts in its second half');
  assert.match(texts(exodus.lines)[0].text, /^He chiseled two tablets of stone like the first/);
  const jude = readPassage(parseReference('Jude 1:17, 1:20b-1:25')!, source)!;
  assert.deepEqual(texts(jude.lines).map((l) => l.n), ['17', '20', '21', '22', '23', '24', '25']);
  assert.equal(jude.lines.filter((l) => 'gap' in l).length, 1);
  const philemon = readPassage(parseReference('Philemon 7-20')!, source)!;
  assert.deepEqual([texts(philemon.lines)[0].n, texts(philemon.lines).at(-1)!.n], ['7', '20']);
  const over = readPassage(parseReference('Matthew 9:36-10:8')!, source)!;
  assert.equal(texts(over.lines).length, 3 + 8, 'the end of one chapter and the start of the next');
  assert.ok(!over.lines.some((l) => 'gap' in l), 'a run over a chapter has no gap in it');
  assert.deepEqual(texts(over.lines).map((l) => l.n).slice(2, 4), ['38', '1']);
  assert.equal(runsOf([{ gap: true }, { n: '1', text: 'a' }, { gap: true }, { gap: true }, { n: '3', text: 'b' }]).length, 2, 'a gap at the start or two in a row make no empty run');
});

check('a verse that the Bible prints with no words is left out, as the lectionary leaves it, and a joined label stands for its verses', () => {
  const sirach = readPassage(parseReference('Sirach 11:14-17')!, source)!;
  assert.deepEqual(texts(sirach.lines).map((l) => l.n), ['14', '17'], '15-16 has a number and no words in this edition');
  assert.ok(texts(sirach.lines).every((l) => l.text.length > 0));
  assert.ok(readPassage(parseReference('Sirach 11:15-16')!, source) === null, 'a run of nothing but verses with no words has no words');
});

check('a psalm with a title in the Bible is shown whole (the numbers of the lectionary count the title), a psalm with none keeps its verses', () => {
  const titled = readPassage(parseReference('Psalm 63:2, 3-4, 5-6, 7-8')!, source)!;
  assert.equal(titled.whole, true);
  assert.equal(texts(titled.lines).length, 11, 'the 11 verses of the English Psalm 63: the lectionary says 63:2-9');
  assert.ok(texts(titled.lines).every((l) => l.n === ''), 'no verse numbers: they would be the Bible\'s, not the lectionary\'s');
  assert.match(texts(titled.lines)[0].text, /^God, you are my God\. I will earnestly seek you/);
  const bare = readPassage(parseReference('Psalm 87')!, source)!;
  assert.equal(bare.whole, false, 'a whole psalm named whole is not "widened"');
  assert.deepEqual(texts(bare.lines).map((l) => l.n), ['1', '2', '3', '4', '5', '6', '7'], 'the numbers of a psalm named whole are the Bible\'s own');
  const untitled = readPassage(parseReference('Psalm 118:1 and 8-9, 19-21, 25-27a')!, source)!;
  assert.equal(untitled.whole, false, 'Psalm 118 has no title: its numbers are the same in both');
  assert.deepEqual(untitled.lines.map((l) => ('gap' in l ? '-' : l.n)), ['1', '-', '8', '9', '-', '19', '20', '21', '-', '25', '26', '27']);
  assert.match(texts(untitled.lines)[1].text, /^It is better to take refuge in the LORD, than to put confidence in man/);
  const long = readPassage(parseReference('Psalm 119:1, 2, 10, 11, 17, 18')!, source)!;
  assert.deepEqual(texts(long.lines).map((l) => l.n), ['1', '2', '10', '11', '17', '18'], 'the 176 verses of Psalm 119 are not all shown for six of them');
  const titledWords = bible.loadBook('PSA').chapters.filter((c) => c.title).map((c) => c.c);
  const untitledWords = bible.loadBook('PSA').chapters.filter((c) => !c.title).map((c) => c.c);
  assert.deepEqual(untitledWords, [1, 2, 10, 33, 43, 71, 91, 93, 94, 95, 96, 97, 99, 104, 105, 106, 107, 111, 112, 113, 114, 115, 116, 117, 118, 119, 135, 136, 137, 146, 147, 148, 149, 150], 'the psalms that keep their verses (the list at the top of reference.ts)');
  assert.equal(titledWords.length + untitledWords.length, 150);
});

check('a place where the numbers differ, a verse the Bible does not have, a whole chapter of another book and a book that cannot be read have no words: the reference stands alone', () => {
  for (const text of ['Micah 5:1-4a', 'Malachi 3:1-4, 23-24', 'Exodus 22:20-26', 'Isaiah 63:16b-17, 19b; 64:2-7', 'Zechariah 2:14-17', 'Romans 16:25-27', 'Hosea 2:16, 17c-2:18, 2:21-2:22', 'Joel 3:1-5']) {
    assert.equal(readPassage(parseReference(text)!, source), null, text);
  }
  for (const text of ['John 3:99', 'Wisdom 6:12-40', 'Wisdom 6:30-31', 'Genesis 3:9-15, 99']) assert.equal(readPassage(parseReference(text)!, source), null, `${text}: a verse the Bible does not have`);
  assert.equal(readPassage(parseReference('Deuteronomy 32')!, source), null, 'a whole chapter is not a reading, unless it is a psalm');
  assert.equal(readPassage(parseReference('Jeremiah 31')!, source), null);
  const broken: TextSource = { hasBook: () => true, loadBook: () => { throw new Error('damaged'); } };
  assert.equal(readPassage(parseReference('Wisdom 6:12-16')!, broken), null, 'it never throws');
  assert.equal(readPassage(parseReference('Wisdom 6:12-16')!, { hasBook: () => false, loadBook: () => { throw new Error('no'); } }), null);
});

/* ======================================================================================================= the files */

const GOOD = {
  about: { source: 'a test', read: '2026-11-08', nature: 'facts' },
  v: 1,
  year: 2026,
  days: { '2026-11-08': { r: ['Wisdom 6:12-16', 'Psalm 63', null, 'Matthew 25:1-13'], n: 'A name', o: 1 }, '2026-11-09': { r: ['Ezekiel 47:1-2', 'Psalm 46', null, 'John 2:13-22'] } },
};
const mutate = (fn: (copy: any) => void) => { const copy = JSON.parse(JSON.stringify(GOOD)); fn(copy); return copy; };

check('a readings file is accepted only when it is exactly what the importer writes', () => {
  const ok = parseReadingsFile(GOOD)!;
  assert.equal(ok.year, 2026);
  assert.deepEqual(ok.days.get('2026-11-08'), { refs: ['Wisdom 6:12-16', 'Psalm 63', null, 'Matthew 25:1-13'], name: 'A name', own: true });
  assert.deepEqual(ok.days.get('2026-11-09'), { refs: ['Ezekiel 47:1-2', 'Psalm 46', null, 'John 2:13-22'], name: null, own: false });
  const bad: Array<[string, unknown]> = [
    ['not an object', 5], ['null', null], ['an array', []], ['a string', 'x'],
    ['another version', mutate((f) => { f.v = 2; })], ['no version', mutate((f) => { delete f.v; })], ['a year that is a text', mutate((f) => { f.year = '2026'; })], ['a year that is not whole', mutate((f) => { f.year = 2026.5; })],
    ['a year before the calendar', mutate((f) => { f.year = 1500; })], ['no about', mutate((f) => { delete f.about; })], ['an about with no source', mutate((f) => { delete f.about.source; })],
    ['an about with no date it was read', mutate((f) => { delete f.about.read; })], ['an about with no word on what it is', mutate((f) => { delete f.about.nature; })],
    ['a key nobody knows', mutate((f) => { f.extra = 1; })], ['no days', mutate((f) => { f.days = {}; })], ['days as a list', mutate((f) => { f.days = []; })],
    ['a day of another year', mutate((f) => { f.days['2027-01-01'] = { r: ['John 1:1', 'Psalm 1', null, 'John 1:1'] }; })], ['a day that does not exist', mutate((f) => { f.days['2026-02-29'] = { r: ['John 1:1', 'Psalm 1', null, 'John 1:1'] }; })],
    ['a key that is no date', mutate((f) => { f.days['8 November'] = { r: ['John 1:1', 'Psalm 1', null, 'John 1:1'] }; })],
    ['a day that is not an object', mutate((f) => { f.days['2026-11-08'] = 'x'; })], ['a day with a key nobody knows', mutate((f) => { f.days['2026-11-08'].x = 1; })],
    ['three references', mutate((f) => { f.days['2026-11-08'].r = ['a 1:1', 'Psalm 1', 'b 1:1']; })], ['five references', mutate((f) => { f.days['2026-11-08'].r = [null, null, null, null, 'John 1:1']; })],
    ['no reading at all', mutate((f) => { f.days['2026-11-08'].r = [null, null, null, null]; })], ['a reference that is a number', mutate((f) => { f.days['2026-11-08'].r[0] = 5; })],
    ['an empty reference', mutate((f) => { f.days['2026-11-08'].r[0] = ''; })], ['a reference with a space in front', mutate((f) => { f.days['2026-11-08'].r[0] = ' Wisdom 6:12-16'; })],
    ['a reference with a footnote marker', mutate((f) => { f.days['2026-11-08'].r[0] = 'Wisdom 6:12-16 [^1]'; })], ['a reference with a control character', mutate((f) => { f.days['2026-11-08'].r[0] = 'Wisdom\n6:12-16'; })],
    ['a reference that is far too long', mutate((f) => { f.days['2026-11-08'].r[0] = 'W'.repeat(200); })], ['a name that is a number', mutate((f) => { f.days['2026-11-08'].n = 3; })],
    ['an empty name', mutate((f) => { f.days['2026-11-08'].n = ''; })], ['"own" with no name', mutate((f) => { f.days['2026-11-09'].o = 1; })], ['"own" that is not 1', mutate((f) => { f.days['2026-11-08'].o = 2; })],
  ];
  for (const [what, file] of bad) assert.equal(parseReadingsFile(file), null, what);
  assert.ok(parseReadingsFile(mutate((f) => { f.days['2026-11-08'].r = [null, null, null, 'Matthew 25:1-13']; })), 'one reading is enough');
  const many: Record<string, unknown> = {};
  for (let i = 0; i < 400; i++) many[`2026-${String(1 + Math.floor(i / 31)).padStart(2, '0')}-${String(1 + (i % 31)).padStart(2, '0')}`] = { r: ['John 1:1', 'Psalm 1', null, 'John 1:1'] };
  assert.equal(parseReadingsFile({ ...GOOD, days: many }), null, 'more days than a year has');
});

check('the lookup reads its files when first asked, leaves out one that is broken or cannot be loaded, and keeps the first file of a year', () => {
  let loaded = 0;
  const lazy = makeReadingsLookup([() => { loaded += 1; return GOOD; }]);
  assert.equal(loaded, 0, 'nothing is read before the first question');
  assert.deepEqual(lazy.recordFor('2026-11-08')?.name, 'A name');
  assert.equal(lazy.recordFor('2026-11-10'), null, 'a day the file does not have');
  assert.equal(lazy.recordFor('2027-11-08'), null, 'a year no file has');
  assert.deepEqual(lazy.years(), [2026]);
  lazy.recordFor('2026-11-09');
  assert.equal(loaded, 1, 'read once');
  const mixed = makeReadingsLookup([() => { throw new Error('cannot read'); }, () => ({ nonsense: true }), () => GOOD, () => mutate((f) => { f.days['2026-11-08'].n = 'Another name'; })]);
  assert.equal(mixed.recordFor('2026-11-08')?.name, 'A name', 'the first file of the year wins');
  assert.deepEqual(mixed.years(), [2026]);
  assert.equal(makeReadingsLookup([]).recordFor('2026-11-08'), null);
  assert.deepEqual(makeReadingsLookup([]).years(), []);
  assert.equal(makeReadingsLookup([() => GOOD]).recordFor('nonsense'), null);
});

check('the file of 2026 is valid, has the 221 days from 25 May to 31 December, and every day has at least one reading', () => {
  const file = parseReadingsFile(FILE_2026)!;
  assert.ok(file, 'readings-2026.json passes the strict check');
  assert.deepEqual(lookup.years(), [2026]);
  assert.equal(file.days.size, 221);
  const keys = [...file.days.keys()].sort();
  assert.deepEqual([keys[0], keys[keys.length - 1]], ['2026-05-25', '2026-12-31']);
  assert.equal(EXPORT.rows.length, 221);
  assert.deepEqual(keys, EXPORT.rows.map((r) => r.date).sort(), 'the days of the file are the days of the export');
  let second = 0, names = 0, own = 0;
  for (const [key, record] of file.days) {
    assert.ok(record.refs.some((r) => r !== null), key);
    if (record.refs[2] !== null) second += 1;
    if (record.name) names += 1;
    if (record.own) own += 1;
  }
  assert.equal(second, EXPORT.rows.filter((r) => r.second_reading_ref && r.second_reading_ref.trim()).length, 'the days with a second reading');
  assert.equal(names, EXPORT.rows.filter((r) => r.feast && r.feast.trim()).length, 'the days with the name of a celebration');
  assert.equal(second, 40);
  assert.equal(names, 152);
  assert.equal(own, 82, 'the days the source calls by the name of the celebration: the Sundays, the solemnities, the feasts and the memorials it keeps');
  assert.ok(own < names);
  assert.equal(file.days.get('2026-11-08')!.refs[2], '1 Thessalonians 4:13-18');
  assert.equal(file.days.get('2026-07-28')!.refs[0], 'Jeremiah 14:17-22', 'the footnote markers of the source are gone');
  assert.equal(file.days.get('2026-07-27')!.refs[1], 'Deuteronomy 32', 'the book of a canticle in the place of the psalm, without "Psalm/"');
  const text = read('assets/library/daily/readings-2026.json');
  assert.match(text, /^\{"about":\{"made":"tools\/liturgy\/import_readings\.py/);
  assert.match(text, /"read":"2026-11-08"/, 'the header says when it was read');
  assert.match(text, /Pascua, Supabase project diyimabdmsjykvitomgd, table public\.pascua_daily_readings/, 'where it comes from');
  assert.match(text, /facts of the Roman Lectionary[^"]*Pascua's own writing[^"]*is not used/, 'what is used and what is not');
  assert.ok(text.length < 40000, `${text.length} bytes: compact`);
  assert.doesNotMatch(text.slice(text.indexOf('"days":')), /snippet|reflection|prayer|family_story|audio_url|saint_name/i, 'no field of Pascua\'s own writing (the header names them, to say they are not used)');
});

check('the generated list of files names the file of every year the importer wrote, and dayData.ts is the one place that reads them and the Bible', () => {
  const generated = read('src/features/library/daily/readings.generated.ts');
  const years = fs.readdirSync(path.join(root, 'assets/library/daily')).filter((f) => /^readings-\d{4}\.json$/.test(f)).map((f) => Number(f.slice(9, 13))).sort();
  assert.deepEqual(years, [2026]);
  for (const y of years) assert.ok(generated.includes(`require('../../../../assets/library/daily/readings-${y}.json')`), `${y} is listed`);
  assert.match(generated, /^\/\/ GENERATED by tools\/liturgy\/import_readings\.py/);
  const data = run(path.join(root, 'src/features/library/daily/dayData.ts'));
  assert.deepEqual(Object.keys(data).sort(), ['dayBrief', 'dayContent']);
  const real = data.dayContent('2026-11-08');
  assert.equal(real.title, '32nd Sunday in Ordinary Time');
  assert.deepEqual(real.readings.map((r: { reference: string }) => r.reference), ['Wisdom 6:12-16', 'Psalm 63:2, 3-4, 5-6, 7-8', '1 Thessalonians 4:13-18', 'Matthew 25:1-13']);
  assert.ok(real.readings.every((r: { text: unknown }) => r.text), 'the real files give the words');
  assert.deepEqual(data.dayBrief('2026-11-08').readings.map((r: { short: string }) => r.short), ['Wisdom 6:12-16', 'Psalm 63', '1 Thessalonians 4:13-18', 'Matthew 25:1-13']);
  assert.equal(data.dayBrief('2027-03-04').readings, null);
  const src = read('src/features/library/daily/dayData.ts');
  assert.match(src, /makeContent\(\{ lookup: makeReadingsLookup\(READINGS_FILES\), source: \{ hasBook, loadBook \} \}\)/);
});

/* ================================================================================================ what a day is called */

check('a Sunday, a solemnity and a feast of the Lord keep the title of the calendar; a weekday takes the memorial the file names, unless the day is privileged', () => {
  const sunday = litOf('2026-11-08');
  const weekday = litOf('2026-11-11');
  const advent = litOf('2026-12-21');
  const octave = litOf('2026-12-26');
  const lent = litOf('2027-03-10');
  const record = (name: string | null, own = false): DayRecord => ({ refs: ['a 1:1', null, null, null], name, own });
  assert.deepEqual(celebrationOf(sunday, record('Thirty-second Sunday in Ordinary Time', true)), { title: '32nd Sunday in Ordinary Time', under: null });
  assert.deepEqual(celebrationOf(sunday, record('Some Saint')), { title: '32nd Sunday in Ordinary Time', under: null }, 'a Sunday is never renamed');
  assert.deepEqual(celebrationOf(litOf('2026-12-08'), record('Another name', true)), { title: 'The Immaculate Conception of the Blessed Virgin Mary', under: null }, 'a solemnity is never renamed');
  assert.deepEqual(celebrationOf(litOf('2026-11-09'), record('Another name')), { title: 'The Dedication of the Lateran Basilica', under: null }, 'a feast of the Lord');
  assert.deepEqual(celebrationOf(weekday, record('Saint Martin of Tours, Bishop', true)), { title: 'Saint Martin of Tours, Bishop', under: 'Wednesday of the 32nd Week in Ordinary Time' });
  assert.deepEqual(celebrationOf(weekday, record('Saint Martin of Tours, Bishop')), { title: 'Saint Martin of Tours, Bishop', under: 'Wednesday of the 32nd Week in Ordinary Time' }, 'a memorial beside a weekday is the title too');
  assert.deepEqual(celebrationOf(weekday, record(null)), { title: 'Wednesday of the 32nd Week in Ordinary Time', under: null });
  assert.deepEqual(celebrationOf(weekday, null), { title: 'Wednesday of the 32nd Week in Ordinary Time', under: null });
  assert.deepEqual(celebrationOf(advent, record('Saint Peter Canisius, Priest and Doctor of the Church')), { title: 'Advent weekday, 21 December', under: null }, '17 to 24 December keep no memorial');
  assert.deepEqual(celebrationOf(octave, record('Saint Stephen, the First Martyr', true)), { title: 'Saint Stephen, the First Martyr', under: 'Second Day in the Octave of Christmas' }, 'unless the source says the day IS the celebration');
  assert.deepEqual(celebrationOf(litOf('2026-12-29'), record('Saint Thomas Becket, Bishop and Martyr')), { title: 'Fifth Day in the Octave of Christmas', under: null });
  assert.equal(lent.season, 'lent');
  assert.deepEqual(celebrationOf(lent, record('Saint Somebody')), { title: lent.title, under: null }, 'Lent keeps no optional memorial');
  assert.deepEqual(celebrationOf(litOf('2027-02-10'), record('Ash Wednesday names')), { title: 'Ash Wednesday', under: null });
});

check('the day as the screens ask for it: the Sunday, a weekday with a memorial, a solemnity, a privileged weekday, Saint Stephen, and a day the file does not have', () => {
  const sunday = content.dayContent('2026-11-08');
  assert.equal(sunday.title, '32nd Sunday in Ordinary Time');
  assert.equal(sunday.under, null);
  assert.deepEqual(sunday.readings!.map((r) => r.kind), ['first', 'psalm', 'second', 'gospel']);
  assert.deepEqual(sunday.readings!.map((r) => r.title), ['First Reading', 'Responsorial Psalm', 'Second Reading', 'Gospel']);
  assert.deepEqual(sunday.readings!.map((r) => r.reference), ['Wisdom 6:12-16', 'Psalm 63:2, 3-4, 5-6, 7-8', '1 Thessalonians 4:13-18', 'Matthew 25:1-13']);
  assert.ok(sunday.readings!.every((r) => r.text && texts(r.text.lines).length > 0));
  assert.equal(sunday.readings![1].text!.whole, true);
  assert.equal(sunday.readings![0].text!.whole, false);
  const line = readingsLine(sunday.readings!);
  assert.equal(line.replace(/\u00a0/g, ' '), 'Wisdom 6:12-16 · Psalm 63 · 1 Thessalonians 4:13-18 · Matthew 25:1-13');
  assert.equal(line, 'Wisdom\u00a06:12-16\u00a0· Psalm\u00a063\u00a0· 1\u00a0Thessalonians\u00a04:13-18\u00a0· Matthew\u00a025:1-13', 'a line that wraps does it between two references, never inside one');
  assert.equal(readingsLine([]), '');
  assert.equal(readingsSpoken(sunday.readings!), 'Wisdom 6:12-16; Psalm 63:2, 3-4, 5-6, 7-8; 1 Thessalonians 4:13-18; Matthew 25:1-13');

  const memorial = content.dayContent('2026-11-11');
  assert.equal(memorial.title, 'Saint Martin of Tours, Bishop');
  assert.equal(memorial.under, 'Wednesday of the 32nd Week in Ordinary Time');
  assert.deepEqual(memorial.readings!.map((r) => r.kind), ['first', 'psalm', 'gospel'], 'no second reading on a weekday');
  assert.deepEqual(memorial.readings!.map((r) => r.reference), ['Titus 3:1-7', 'Psalm 23:1b-3a, 3bc-4, 5, 6', 'Luke 17:11-19']);

  const solemnity = content.dayContent('2026-12-08');
  assert.equal(solemnity.title, 'The Immaculate Conception of the Blessed Virgin Mary');
  assert.equal(solemnity.under, null);
  assert.deepEqual(solemnity.readings!.map((r) => r.short), ['Genesis 3:9-15, 20', 'Psalm 98', 'Ephesians 1:3-6, 11-12', 'Luke 1:26-38']);

  assert.equal(content.dayContent('2026-12-21').title, 'Advent weekday, 21 December');
  assert.equal(content.dayContent('2026-12-26').title, 'Saint Stephen, the First Martyr');
  assert.equal(content.dayContent('2026-12-26').under, 'Second Day in the Octave of Christmas');

  for (const key of ['2027-01-17', '2026-05-24', '2019-03-03']) {
    const none = content.dayContent(key);
    assert.equal(none.readings, null, `${key}: no file has the day`);
    assert.equal(none.title, litOf(key).title, `${key}: the day of the calendar, worked out on the phone`);
    assert.equal(none.under, null);
    assert.deepEqual(content.dayBrief(key), { dateKey: key, title: litOf(key).title, under: null, readings: null });
  }
  assert.deepEqual(content.dayContent('not a day'), { dateKey: 'not a day', title: '', under: null, readings: null });
  assert.deepEqual(content.dayBrief('2026-02-30'), { dateKey: '2026-02-30', title: '', under: null, readings: null });
  assert.equal(NO_READINGS, 'The readings for this day are not in the app yet.');
  assert.equal(READINGS_SOURCE, 'Readings: the Roman Lectionary (general calendar; your country may differ). Words: World English Bible, Catholic edition, not the lectionary translation.');
  assert.equal(WHOLE_PSALM_NOTE, 'This is the whole psalm. Mass uses only the verses named above.');
  assert.deepEqual(READING_KINDS, ['first', 'psalm', 'second', 'gospel']);
  assert.deepEqual(READING_TITLES, { first: 'First Reading', psalm: 'Responsorial Psalm', second: 'Second Reading', gospel: 'Gospel' });
});

check('the banner asks for the references only: the brief never opens a book of the Bible', () => {
  let opened = 0;
  const counting: TextSource = { hasBook: () => true, loadBook: () => { opened += 1; throw new Error('the banner must not read the Bible'); } };
  const c = makeContent({ lookup, source: counting });
  for (let d = 25; d <= 31; d++) assert.ok(c.dayBrief(`2026-05-${d}`).readings);
  assert.equal(opened, 0);
  c.dayContent('2026-05-25');
  assert.ok(opened > 0, 'the screen does read it');
});

check('a psalm whose verses cannot be read is shown as the source has it, named by its number, and whole; another reading that cannot be read has no words', () => {
  const day = content.dayContent('2026-12-06');
  const psalm = day.readings![1];
  assert.equal(psalm.reference, 'Psalm 85:9-10-11-12, 13-14', 'as the source has it');
  assert.equal(psalm.short, 'Psalm 85');
  assert.equal(psalm.text!.whole, true);
  assert.ok(psalm.text!.lines.length >= 13 && psalm.text!.lines.every((l) => 'gap' in l || l.n === ''));
  const odd = makeContent({
    lookup: makeReadingsLookup([() => mutate((f) => { f.days['2026-11-08'].r = ['Nowhere 1:1', 'Canticle of nothing', null, 'Matthew 25:1-13']; })]),
    source,
  }).dayContent('2026-11-08');
  assert.deepEqual(odd.readings!.map((r) => [r.reference, r.short, r.text === null]), [['Nowhere 1:1', 'Nowhere 1:1', true], ['Canticle of nothing', 'Canticle of nothing', true], ['Matthew 25:1-13', 'Matthew 25:1-13', false]]);
});

/* ================================================================================ the data of 2026 against the calendar */

const WORDS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20, 'twenty-first': 21, 'twenty-second': 22, 'twenty-third': 23, 'twenty-fourth': 24, 'twenty-fifth': 25, 'twenty-sixth': 26, 'twenty-seventh': 27, 'twenty-eighth': 28, 'twenty-ninth': 29, thirtieth: 30, 'thirty-first': 31, 'thirty-second': 32, 'thirty-third': 33, 'thirty-fourth': 34 };
/** A title in the words of one source and of the other, made comparable: "Thirty-second Sunday in Ordinary Time" and "32nd Sunday in Ordinary Time" are the same day. */
function plainTitle(title: string): string {
  let t = title.toLowerCase().replace(/’/g, "'");
  for (const [word, num] of Object.entries(WORDS).sort((a, b) => b[0].length - a[0].length)) t = t.replace(new RegExp(`\\b${word}\\b`, 'g'), String(num));
  t = t.replace(/(\d+)(st|nd|rd|th)\b/g, '$1').replace(/\bweek (in|of) ordinary time/, 'week ordinary time').replace(/\bsunday (in|of) ordinary time/, 'sunday ordinary time');
  t = t.replace(/ of the (\d+) week ordinary time/, ' week $1 ordinary').replace(/\bthe\b /g, '');
  return t.replace(/\s+/g, ' ').trim();
}
const COLOURS: Record<string, string> = { White: 'white', Green: 'green', Red: 'red', Violet: 'violet', Rose: 'rose' };

check('every day of the data has the title, the week and the Sunday of the calendar of the app, except the days listed here, each for the reason given', () => {
  // the days the two name in other words only (the same day): the parentheses of three solemnities, the days from 17 to 24 December that the source calls by their date, the octave of Christmas
  const WORDING: Record<string, string> = {
    '2026-06-04': 'Corpus Christi: the source leaves out "(Corpus Christi)"', '2026-11-02': 'All Souls: the source writes "All Soul’s Day"', '2026-12-25': 'Christmas: "(Christmas)" for "(Christmas Day)"',
    '2026-12-17': 'a day of 17 to 24 December, called by its date', '2026-12-18': 'a day of 17 to 24 December, called by its date', '2026-12-19': 'a day of 17 to 24 December, called by its date',
    '2026-12-21': 'a day of 17 to 24 December, called by its date', '2026-12-22': 'a day of 17 to 24 December, called by its date', '2026-12-23': 'a day of 17 to 24 December, called by its date',
    '2026-12-24': 'a day of 17 to 24 December, called by its date', '2026-12-29': 'the octave of Christmas: "within the Octave of the Nativity of the Lord"',
    '2026-12-30': 'the octave of Christmas: "within the Octave of the Nativity of the Lord"', '2026-12-31': 'the octave of Christmas: "within the Octave of the Nativity of the Lord"',
  };
  const wording: string[] = [];
  const saints: string[] = [];
  let same = 0;
  for (const r of EXPORT.rows) {
    const lit = litOf(r.date);
    if (plainTitle(lit.title) === plainTitle(r.liturgical_day)) { same += 1; continue; }
    const own = !!r.feast && r.feast.toLowerCase() === r.liturgical_day.toLowerCase();
    if (lit.rank === 'weekday' && own) { saints.push(r.date); continue; }
    wording.push(r.date);
  }
  assert.deepEqual(wording, Object.keys(WORDING).sort(), 'the days that are the same day in other words');
  assert.equal(same, 169, 'days that have the same title, week and Sunday in both');
  assert.equal(saints.length, 39, 'days on which the source names a saint or a feast that the calendar of the app leaves out on purpose (liturgy.ts: WHAT IS NOT)');
  assert.equal(same + wording.length + saints.length, EXPORT.rows.length);
  for (const key of saints) {
    const c = content.dayContent(key);
    assert.notEqual(c.under, null, `${key}: the name of the saint is the title, the day of the calendar goes under it`);
    assert.equal(c.under, litOf(key).title);
  }
  assert.equal(EXPORT.about.read, '2026-11-08');
});

check('the colours agree on every day without a celebration name in the data; the days where they differ are the memorials of saints (their own colour) and four days where the source is wrong', () => {
  // the source says Green on four days that are violet or white: 21 and 23 December (Advent) and 29 and 31 December (Christmas time)
  const WRONG = ['2026-12-21', '2026-12-23', '2026-12-29', '2026-12-31'];
  const differ = EXPORT.rows.filter((r) => COLOURS[r.liturgical_color] !== litOf(r.date).colour);
  const withName = differ.filter((r) => r.feast && r.feast.trim());
  const withoutName = differ.filter((r) => !(r.feast && r.feast.trim()));
  assert.deepEqual(withoutName.map((r) => r.date), [], 'no day without a name in the data has another colour than the calendar of the app');
  assert.equal(differ.length, 109, 'days on which the colour of the data is not the colour of the calendar of the app: 105 of a saint, 4 wrong');
  const wrong = differ.filter((r) => litOf(r.date).rank === 'weekday' && ['violet', 'white'].includes(litOf(r.date).colour) && r.liturgical_color === 'Green');
  assert.deepEqual(wrong.map((r) => r.date), WRONG);
  for (const r of withName.filter((x) => !WRONG.includes(x.date))) {
    assert.ok(['White', 'Red'].includes(r.liturgical_color), `${r.date}: the colour of a memorial (${r.liturgical_color})`);
    assert.equal(litOf(r.date).rank, 'weekday', `${r.date}: a weekday of the calendar of the app`);
  }
  // the screen draws the colour of the calendar, never the source's
  assert.doesNotMatch(read('assets/library/daily/readings-2026.json'), /"(c|colour|color|liturgical_color)"/, 'the colour is not in the asset');
});

check('the Sunday cycle and the weekday cycle of the calendar agree with the readings of the data: the Gospel of each Sunday is the one of its cycle, bar three days', () => {
  const book = { A: 'Matthew', B: 'Mark', C: 'Luke' } as const;
  const other: string[] = [];
  let sundays = 0;
  for (const r of EXPORT.rows) {
    const lit = litOf(r.date);
    if (lit.rank !== 'sunday') continue;
    sundays += 1;
    if (!r.gospel_ref.startsWith(book[lit.sundayCycle])) other.push(`${r.date} ${r.gospel_ref}`);
  }
  assert.equal(sundays, 27, 'the Sundays of Ordinary Time and of Advent in the data (Trinity, All Saints, Christ the King and the Holy Family are not Sundays of the calendar: a solemnity, a feast)');
  // 7 June: the readings of Corpus Christi (the United States keeps it on the Sunday: John 6); 13 December: John 1 is the Gospel of the third Sunday of Advent of Year B; 20 December: Luke 1:26-38, the fourth
  assert.deepEqual(other, ['2026-06-07 John 6:51-58', '2026-12-13 John 1:6-8, 19-28', '2026-12-20 Luke 1:26-38']);
  assert.equal(litOf('2026-11-28').sundayCycle, 'A');
  assert.equal(litOf('2026-11-29').sundayCycle, 'B', 'Advent 2026 begins Year B: the first Sunday of Advent has Mark 13:33-37');
  assert.equal(EXPORT.rows.find((r) => r.date === '2026-11-29')!.gospel_ref, 'Mark 13:33-37');
  // Year II: the weeks 10 to 16 of Ordinary Time of 2026 read 1 and 2 Kings, Amos, Hosea, Isaiah and Micah in their weekdays, on the days with no memorial (Year I reads Genesis, Exodus, Leviticus ...)
  const weekday = new Set<string>();
  for (const r of EXPORT.rows) {
    const lit = litOf(r.date);
    if (lit.season === 'ordinary' && lit.rank === 'weekday' && lit.week && lit.week >= 10 && lit.week <= 16 && !r.feast) weekday.add(`${lit.weekdayCycle} ${r.first_reading_ref.replace(/ \d.*$/, '')}`);
  }
  assert.deepEqual([...weekday].sort(), ['II 1 Kings', 'II 2 Chronicles', 'II 2 Kings', 'II Amos', 'II Hosea', 'II Isaiah', 'II Micah', 'II Sirach']);
});

check('the days where the data and the calendar of the app disagree about WHAT is read are named, so that nobody finds them by surprise', () => {
  // Corpus Christi: the calendar of the app keeps it on the Thursday (the universal date) and the source has the readings of the weekday that day, and the readings of Corpus Christi on the Sunday after
  assert.equal(litOf('2026-06-04').title, 'The Most Holy Body and Blood of Christ (Corpus Christi)');
  assert.equal(content.dayContent('2026-06-04').readings![0].reference, '2 Timothy 2:8-15', 'weekday readings under the title of Corpus Christi');
  assert.equal(litOf('2026-06-07').title, '10th Sunday in Ordinary Time');
  assert.equal(content.dayContent('2026-06-07').readings![3].reference, 'John 6:51-58', 'the Gospel of Corpus Christi under the title of the 10th Sunday');
  // Trinity Sunday has no second reading in the data, and the Transfiguration neither
  assert.equal(content.dayContent('2026-05-31').readings!.length, 3);
  assert.equal(content.dayContent('2026-08-06').readings!.length, 3);
  // the only reference that is not one of the forms we read
  const unread = EXPORT.rows.flatMap((r) => [r.first_reading_ref, r.psalm_ref, r.second_reading_ref, r.gospel_ref].filter((x): x is string => !!x && !!x.trim()).map((x) => ({ date: r.date, ref: x })))
    .filter(({ ref }) => parseReference(ref.replace(/\s*\[\^[^\]\s]*\]/g, '').replace(/^Psalm\/(?=\S)/, '').trim()) === null);
  assert.deepEqual(unread, [{ date: '2026-12-06', ref: 'Psalm 85:9-10-11-12, 13-14' }]);
});

/** The words that a reading of the data may start or end in the middle of a sentence with, because the lectionary does: an epistle or a canticle that begins on a verse that goes on from the one before. */
const MID_SENTENCE = new Set([
  '2026-05-27 first', '2026-05-28 first', '2026-08-10 first', '2026-09-14 second', '2026-09-21 first', '2026-10-08 psalm', '2026-10-20 first', '2026-10-21 first', '2026-10-26 first',
  '2026-10-27 first', '2026-11-02 second', '2026-11-30 first', '2026-12-13 psalm',
]);

check('every reading of the data that gets words starts where a sentence starts and ends where one ends, or is one of the readings that the lectionary starts or ends inside a sentence', () => {
  let shown = 0, alone = 0, whole = 0;
  const aloneList: string[] = [];
  const unexpected: string[] = [];
  for (const [key, record] of parseReadingsFile(FILE_2026)!.days) {
    const day = content.dayContent(key);
    for (const reading of day.readings!) {
      const parsed = parseReference(record.refs[READING_KINDS.indexOf(reading.kind)]!);
      if (!reading.text) { alone += 1; aloneList.push(`${key} ${reading.reference}`); continue; }
      shown += 1;
      if (reading.text.whole) { whole += 1; continue; }
      const letters = !!parsed && parsed.segments.some((s) => s.l1 || s.l2);
      if (letters) continue; // a part of a verse: the whole verse is shown, and it may start or end anywhere
      const verses = texts(reading.text.lines);
      const first = verses[0].text, last = verses[verses.length - 1].text;
      const starts = /^[A-Z\u201c\u2018"'(0-9]/.test(first);
      const ends = /[.!?\u201d\u2019"')]$/.test(last);
      if ((!starts || !ends) && !MID_SENTENCE.has(`${key} ${reading.kind}`)) unexpected.push(`${key} ${reading.kind} ${reading.reference}: ${starts ? '' : `starts "${first.slice(0, 40)}" `}${ends ? '' : `ends "${last.slice(-40)}"`}`);
    }
  }
  assert.deepEqual(unexpected, [], 'a reading that starts or ends in the middle of a sentence and is not on the list: a verse may be shifted');
  assert.equal(shown + alone, 703, 'the references of the data');
  assert.equal(alone, 15);
  assert.equal(whole, 66, 'psalms shown whole (65, and the one whose verses cannot be read)');
  assert.deepEqual(aloneList, [
    '2026-06-19 2 Kings 11:1-4, 9-18, 20', '2026-07-06 Hosea 2:16, 17c-18, 21-22', '2026-07-09 Hosea 11:1-4, 8e-9', '2026-07-10 Hosea 14:2-10', '2026-07-24 Jeremiah 31', '2026-07-27 Deuteronomy 32',
    '2026-08-07 Nahum 2:1, 3; 3:1-3, 6-7', '2026-08-17 Deuteronomy 32', '2026-09-08 Micah 5:1-4a', '2026-10-02 Job 38:1, 12-21; 40:3-5', '2026-10-25 Exodus 22:20-26',
    '2026-11-29 Isaiah 63:16b-17, 19b; 64:2-7', '2026-12-12 Zechariah 2:14-17', '2026-12-20 Romans 16:25-27', '2026-12-23 Malachi 3:1-4, 23-24',
  ], 'the readings that are shown by their reference alone, and why: the numbers differ, or the Bible has no such verse, or the source gives a chapter and no verses');
});

/* ======================================================================================== the pill of the banner */

check('the pill of the daily banner shares the row of the title on a phone wide enough, and goes under the last line on a narrow phone or with big text', () => {
  assert.equal(OUTSIDE + INSIDE, 32);
  assert.ok(TITLE_WIDTH > 100 && PILL_WIDTH > 80 && ROW_GAP >= 8);
  assert.equal(pillBesideTitle(390, 1, 1.2), true, 'a phone of 390 at the normal text size');
  assert.equal(pillBesideTitle(430, 1, 1.2), true);
  assert.equal(pillBesideTitle(375, 1, 1.2), true, 'a phone of 375');
  assert.equal(pillBesideTitle(360, 1, 1.2), false, 'a phone of 360: 296 between the padding, and the title and the pill need 299');
  assert.equal(pillBesideTitle(320, 1, 1.2), false, 'a phone of 320: the title and the pill do not fit side by side');
  assert.equal(pillBesideTitle(390, 1.3, 1.2), false, 'the banner follows the text size up to 1.2: then it is too wide at 390');
  assert.equal(pillBesideTitle(390, 1.2, 1.2), false);
  assert.equal(pillBesideTitle(390, 0.85, 1.2), true, 'small text leaves more room');
  assert.equal(pillBesideTitle(1024, 1.2, 1.2), true, 'a tablet');
  let last = false;
  for (let w = 280; w <= 500; w += 4) { const now = pillBesideTitle(w, 1, 1.2); assert.ok(!last || now, `wider is never narrower: ${w}`); last = now; }
});

console.log(`${n} of ${n} passed`);
