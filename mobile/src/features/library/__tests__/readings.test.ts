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
import {
  FEASTS_ON_PRIVILEGED_DAYS, MASS_LINES, NO_READINGS, NO_SECOND_READING, NO_WORDS, PART_VERSE_NOTE, PASSAGE_NOTES, PSALM_ONLY_NOTE, READING_KINDS, READING_TITLES, READINGS_DIFFER, READINGS_SOURCE, UNCLEAR_PSALM_NOTE,
  WHOLE_PSALM_NOTE,
  celebrationOf, hasSecondReading, makeContent, readingsLine, readingsSpoken,
} from '../daily/content';
import { liturgicalDay, type LiturgicalDay } from '../daily/liturgy';
import { makeReadingsLookup, parseReadingsFile, type DayRecord } from '../daily/readingsCore';
import {
  NUMBERING_DIFFERS, formatReference, parseReference, psalmOfText, readPassage, runsOf, shortReference, spokenReference, spokenShort, touchesDifferingChapter, type PassageLine,
} from '../daily/reference';
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
type Verse = { n: string; c: number; text: string };
const texts = (lines: readonly PassageLine[]) => lines.filter((l): l is Verse => !('gap' in l));
/** The labels of a passage as it is drawn: a verse is its label, a gap between two runs is "-". */
const drawn = (lines: readonly PassageLine[]) => lines.map((l) => ('gap' in l ? '-' : l.n));
/** The days the importer leaves out because the source has the readings of the United States there (tools/liturgy/import_readings.py, NOT_GENERAL). */
const LEFT_OUT = ['2026-06-04', '2026-06-07', '2026-11-26', '2026-12-12'];
/** The days of the export that have readings in the app. */
const KEPT = EXPORT.rows.filter((r) => !LEFT_OUT.includes(r.date));

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

check('a reference is said in words for a screen reader: chapter and verses, "to" and "and", the letters kept, a psalm by its number, a book of one chapter with no chapter', () => {
  const said: Array<[string, string]> = [
    ['Wisdom 6:12-16', 'Wisdom, chapter 6, verses 12 to 16'],
    ['Psalm 63:2, 3-4, 5-6, 7-8', 'Psalm 63, verses 2, 3 to 4, 5 to 6 and 7 to 8'],
    ['1 Thessalonians 4:13-18', 'First Thessalonians, chapter 4, verses 13 to 18'],
    ['2 Peter 3:8-14', 'Second Peter, chapter 3, verses 8 to 14'],
    ['3 John 5-8', 'Third John, verses 5 to 8'],
    ['Genesis 3:9-15, 3:20', 'Genesis, chapter 3, verses 9 to 15 and 20'],
    ['Acts 11:21b-26; 13:1-3', 'Acts, chapter 11, verses 21b to 26; chapter 13, verses 1 to 3'],
    ['Matthew 9:36-10:8', 'Matthew, chapter 9, verse 36 to chapter 10, verse 8'],
    ['Galatians 4:22-24, 26-27, 31–5:1', 'Galatians, chapter 4, verses 22 to 24 and 26 to 27; chapter 4, verse 31 to chapter 5, verse 1'],
    ['Philemon 7-20', 'Philemon, verses 7 to 20'],
    ['Jude 1:17, 1:20b-1:25', 'Jude, verses 17 and 20b to 25'],
    ['John 3:16', 'John, chapter 3, verse 16'],
    ['Psalm 87', 'Psalm 87'],
    ['Jeremiah 31', 'Jeremiah, chapter 31'],
    ['Psalm 146:7, 8-9a, 9bc-10', 'Psalm 146, verses 7, 8 to 9a and 9bc to 10'],
    ['Song of Solomon 3:1-3:4b', 'Song of Songs, chapter 3, verses 1 to 4b'],
    ['Wisdom 3:1-6, 9', 'Wisdom, chapter 3, verses 1 to 6 and 9'],
  ];
  for (const [text, want] of said) assert.equal(spokenReference(parseReference(text)!), want, text);
  assert.equal(spokenShort(parseReference('Psalm 63:2, 3-4, 5-6, 7-8')!), 'Psalm 63', 'a psalm by its number');
  assert.equal(spokenShort(parseReference('Luke 1:46-48, 49-50, 53-54')!), 'Luke, chapter 1, verses 46 to 48, 49 to 50 and 53 to 54', 'a canticle in the place of the psalm is said in full');
  assert.equal(spokenShort(parseReference('Wisdom 6:12-16')!), 'Wisdom, chapter 6, verses 12 to 16');
  // every reference of the data is said in words: no colon, no pair of numbers joined by a hyphen, nothing a voice would read as a time or a sum
  const parsed = [...parseReadingsFile(FILE_2026)!.days.values()].flatMap((d) => d.refs.filter((r): r is string => r !== null).map((r) => parseReference(r)));
  assert.ok(parsed.every((p) => p !== null), 'every reference of the data is read');
  for (const ref of parsed) {
    const words = spokenReference(ref!);
    assert.doesNotMatch(words, /:|\d-\d|\d–\d|undefined|null/, words);
    assert.match(words, /^(First |Second |Third )?[A-Z][A-Za-z ]+(?:, | \d)/, words);
  }
  assert.equal(parsed.length, 689, 'the references of the 217 days that have readings');
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
  assert.equal(wisdom.note, null, 'the words are what the reference names: no note');
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
  assert.equal(runsOf([{ gap: true }, { n: '1', c: 1, text: 'a' }, { gap: true }, { gap: true }, { n: '3', c: 1, text: 'b' }]).length, 2, 'a gap at the start or two in a row make no empty run');
});

check('a verse that two runs share (the lectionary reads it in two halves: "8-9a, 9bc-10") is shown once, and the two runs join with no gap between them', () => {
  const psalm146 = readPassage(parseReference('Psalm 146:7, 8-9a, 9bc-10')!, source)!; // 12 November 2026: it showed 7, 8, 9, 9, 10
  assert.deepEqual(texts(psalm146.lines).map((l) => l.n), ['7', '8', '9', '10']);
  assert.deepEqual(drawn(psalm146.lines), ['7', '8', '9', '10'], 'no gap: the second half of 9 follows its first half');
  assert.equal(runsOf(psalm146.lines).length, 1, 'one run');
  assert.equal(psalm146.note, 'part', 'and it says that a verse with a letter is shown whole');
  assert.ok(texts(psalm146.lines).every((l) => l.text.length > 10), 'every verse has its words');
  assert.deepEqual(drawn(readPassage(parseReference('Psalm 96:1-2a, 2b-3, 5b-6')!, source)!.lines), ['1', '2', '3', '-', '5', '6'], '29 December: 2a and 2b are one verse, 4 is skipped');
  assert.deepEqual(drawn(readPassage(parseReference('Psalm 96:7-8a, 8b-9, 10')!, source)!.lines), ['7', '8', '9', '10'], '30 December');
  assert.deepEqual(drawn(readPassage(parseReference('Psalm 93:1ab, 1cd-2, 5')!, source)!.lines), ['1', '2', '-', '5'], '11 July: 1ab and 1cd are one verse, 3 and 4 are skipped');
  assert.deepEqual(drawn(readPassage(parseReference('Deuteronomy 32:26-27ab, 27cd-28, 30, 35cd-36ab')!, source)!.lines), ['26', '27', '28', '-', '30', '-', '35', '36'], '18 August');
  // a run made only of a verse already given adds nothing and breaks nothing; a verse is in the words once however the runs are cut
  assert.deepEqual(drawn(readPassage(parseReference('Psalm 93:1ab, 1cd, 2')!, source)!.lines), ['1', '2']);
  assert.deepEqual(drawn(readPassage(parseReference('Wisdom 6:12a, 12b-13, 15')!, source)!.lines), ['12', '13', '-', '15']);
  // the same chapter and verse is never twice in the words of a reading, and a gap is only ever where verses are skipped: checked on every reference of the data (the test of the sentences below
  // leaves out every reference with a letter, which is where a verse was given twice)
  let checked = 0, withLetters = 0;
  for (const day of parseReadingsFile(FILE_2026)!.days.values()) {
    for (const text of day.refs) {
      if (text === null) continue;
      const parsed = parseReference(text)!;
      const words = readPassage(parsed, source);
      if (!words) continue;
      checked += 1;
      if (parsed.segments.some((s) => s.l1 || s.l2)) withLetters += 1;
      const seen = new Set<string>();
      let last: Verse | null = null;
      let skipped = false;
      for (const line of words.lines) {
        if ('gap' in line) { skipped = true; continue; }
        if (words.note !== 'whole') assert.ok(!seen.has(`${line.c}:${line.n}`), `${text}: ${line.c}:${line.n} is in the words twice`);
        seen.add(`${line.c}:${line.n}`);
        const from: number = Number(line.n.split('-')[0]);
        const prevEnd: number = last ? Number(last.n.split('-').pop()) : 0;
        if (skipped && last && last.c === line.c && words.note !== 'whole') assert.notEqual(from, prevEnd + 1, `${text}: a gap before ${line.c}:${line.n}, which follows the verse before it (the lectionary may read out of order: Isaiah 38:1-6, 21-22, 7-8)`);
        skipped = false;
        last = line;
      }
    }
  }
  assert.equal(checked, 689 - 14, 'the references of the data that have words');
  assert.equal(withLetters, 89, 'of them have a letter in them: the check covers the references that the test of the sentences leaves out');
});

check('a verse that the Bible prints with no words is left out, as the lectionary leaves it, and a joined label stands for its verses', () => {
  const sirach = readPassage(parseReference('Sirach 11:14-17')!, source)!;
  assert.deepEqual(texts(sirach.lines).map((l) => l.n), ['14', '17'], '15-16 has a number and no words in this edition');
  assert.ok(texts(sirach.lines).every((l) => l.text.length > 0));
  assert.ok(readPassage(parseReference('Sirach 11:15-16')!, source) === null, 'a run of nothing but verses with no words has no words');
});

check('a psalm with a title in the Bible is shown whole (the numbers of the lectionary count the title), a psalm with none keeps its verses', () => {
  const titled = readPassage(parseReference('Psalm 63:2, 3-4, 5-6, 7-8')!, source)!;
  assert.equal(titled.note, 'whole', 'the note over a psalm shown whole although verses are named');
  assert.equal(texts(titled.lines).length, 11, 'the 11 verses of the English Psalm 63: the lectionary says 63:2-9');
  assert.ok(texts(titled.lines).every((l) => l.n === ''), 'no verse numbers: they would be the Bible\'s, not the lectionary\'s');
  assert.match(texts(titled.lines)[0].text, /^God, you are my God\. I will earnestly seek you/);
  const bare = readPassage(parseReference('Psalm 87')!, source)!;
  assert.equal(bare.note, 'psalm', 'a psalm named with no verses: shown whole, and the note says the source names the psalm only');
  assert.deepEqual(texts(bare.lines).map((l) => l.n), ['1', '2', '3', '4', '5', '6', '7'], 'the numbers of a psalm named whole are the Bible\'s own');
  const untitled = readPassage(parseReference('Psalm 118:1 and 8-9, 19-21, 25-27a')!, source)!;
  assert.equal(untitled.note, 'part', 'Psalm 118 has no title: its numbers are the same in both, so it keeps its verses; it has a letter (27a), and the note says that verse is whole');
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
  assert.deepEqual(ok.days.get('2026-11-08'), { refs: ['Wisdom 6:12-16', 'Psalm 63', null, 'Matthew 25:1-13'], name: 'A name', own: true, unclear: [], mass: null });
  assert.deepEqual(ok.days.get('2026-11-09'), { refs: ['Ezekiel 47:1-2', 'Psalm 46', null, 'John 2:13-22'], name: null, own: false, unclear: [], mass: null });
  const marked = parseReadingsFile(mutate((f) => { f.days['2026-11-09'].r = ['Ezekiel 47:1-2', 'Psalm 85', null, 'John 2:13-22']; f.days['2026-11-09'].u = [1]; f.days['2026-11-09'].m = 'day'; }))!;
  assert.deepEqual(marked.days.get('2026-11-09'), { refs: ['Ezekiel 47:1-2', 'Psalm 85', null, 'John 2:13-22'], name: null, own: false, unclear: [1], mass: 'day' }, 'the places where the list of verses was not clear, and the Mass the readings are of');
  assert.equal(parseReadingsFile(mutate((f) => { f.days['2026-11-09'].m = 'morning'; }))!.days.get('2026-11-09')!.mass, 'morning');
  assert.deepEqual([...ok.differ], [], 'no day that differs, unless the file lists it');
  assert.deepEqual([...parseReadingsFile(mutate((f) => { f.differ = ['2026-11-10', '2026-12-12']; }))!.differ], ['2026-11-10', '2026-12-12'], 'the days that differ are listed, in order');
  const bad: Array<[string, unknown]> = [
    ['"u" that is not a list', mutate((f) => { f.days['2026-11-09'].u = 1; })], ['an empty "u"', mutate((f) => { f.days['2026-11-09'].u = []; })],
    ['a place of "u" that is not a number', mutate((f) => { f.days['2026-11-09'].u = ['1']; })], ['a place of "u" that is past the four readings', mutate((f) => { f.days['2026-11-09'].u = [4]; })],
    ['a place of "u" that is not whole', mutate((f) => { f.days['2026-11-09'].u = [0.5]; })], ['a place of "u" that is negative', mutate((f) => { f.days['2026-11-09'].u = [-1]; })],
    ['a place of "u" that has no reference', mutate((f) => { f.days['2026-11-09'].u = [2]; })], ['a place of "u" that is not a psalm named alone', mutate((f) => { f.days['2026-11-09'].u = [0]; })],
    ['a place of "u" that is a psalm with verses', mutate((f) => { f.days['2026-11-09'].r[1] = 'Psalm 46:2-3'; f.days['2026-11-09'].u = [1]; })],
    ['"u" with a place twice', mutate((f) => { f.days['2026-11-09'].r[1] = 'Psalm 46'; f.days['2026-11-09'].u = [1, 1]; })], ['"u" not in order', mutate((f) => { f.days['2026-11-09'].r = ['Psalm 1', 'Psalm 46', null, 'John 2:13-22']; f.days['2026-11-09'].u = [1, 0]; })],
    ['"m" that is another Mass', mutate((f) => { f.days['2026-11-09'].m = 'night'; })], ['"m" that is a number', mutate((f) => { f.days['2026-11-09'].m = 1; })], ['"m" that is empty', mutate((f) => { f.days['2026-11-09'].m = ''; })],
    ['"differ" that is not a list', mutate((f) => { f.differ = '2026-11-10'; })], ['an empty "differ"', mutate((f) => { f.differ = []; })], ['a day of "differ" that is a number', mutate((f) => { f.differ = [20261110]; })],
    ['a day of "differ" in another year', mutate((f) => { f.differ = ['2027-01-01']; })], ['a day of "differ" that does not exist', mutate((f) => { f.differ = ['2026-02-30']; })],
    ['a day of "differ" that is a day with readings', mutate((f) => { f.differ = ['2026-11-08']; })], ['"differ" not in order', mutate((f) => { f.differ = ['2026-12-12', '2026-11-10']; })],
    ['a day twice in "differ"', mutate((f) => { f.differ = ['2026-11-10', '2026-11-10']; })], ['more days in "differ" than a year has', mutate((f) => { f.differ = Array.from({ length: 400 }, () => '2026-11-10'); })],
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
  const differing = makeReadingsLookup([() => mutate((f) => { f.differ = ['2026-11-10']; })]);
  assert.equal(differing.differs('2026-11-10'), true, 'a day the file lists as one that differs');
  assert.equal(differing.recordFor('2026-11-10'), null, 'and it has no readings');
  assert.equal(differing.differs('2026-11-08'), false, 'a day with readings does not differ');
  assert.equal(differing.differs('2026-11-11'), false, 'a day the file does not know is not one that differs, it is one we have nothing for');
  assert.equal(differing.differs('2027-11-10'), false, 'a year no file has');
  assert.equal(makeReadingsLookup([]).differs('2026-11-10'), false);
  assert.equal(makeReadingsLookup([() => ({ nonsense: true })]).differs('2026-11-10'), false, 'a file that is broken lists nothing');
});

check('the file of 2026 is valid, has the 217 days from 25 May to 31 December that have readings, lists the 4 that differ, and every day has at least one reading', () => {
  const file = parseReadingsFile(FILE_2026)!;
  assert.ok(file, 'readings-2026.json passes the strict check');
  assert.deepEqual(lookup.years(), [2026]);
  assert.equal(file.days.size, 217);
  assert.deepEqual([...file.differ], LEFT_OUT, 'the days that the importer leaves out (tools/liturgy/import_readings.py, NOT_GENERAL), in order');
  assert.ok(LEFT_OUT.every((key) => !file.days.has(key)), 'none of them is a day with readings');
  const keys = [...file.days.keys()].sort();
  assert.deepEqual([keys[0], keys[keys.length - 1]], ['2026-05-25', '2026-12-31']);
  assert.equal(EXPORT.rows.length, 221);
  assert.equal(KEPT.length, 217);
  assert.deepEqual(keys, KEPT.map((r) => r.date).sort(), 'the days of the file are the days of the export, less the days that differ');
  assert.deepEqual([...keys, ...file.differ].sort(), EXPORT.rows.map((r) => r.date).sort(), 'and together with them, all of them');
  let second = 0, names = 0, own = 0;
  for (const [key, record] of file.days) {
    assert.ok(record.refs.some((r) => r !== null), key);
    if (record.refs[2] !== null) second += 1;
    if (record.name) names += 1;
    if (record.own) own += 1;
  }
  assert.equal(second, KEPT.filter((r) => r.second_reading_ref && r.second_reading_ref.trim()).length, 'the days with a second reading');
  assert.equal(names, KEPT.filter((r) => r.feast && r.feast.trim()).length, 'the days with the name of a celebration');
  assert.equal(second, 38);
  assert.equal(names, 149);
  assert.equal(own, 80, 'the days the source calls by the name of the celebration: the Sundays, the solemnities, the feasts and the memorials it keeps');
  assert.ok(own < names);
  assert.equal(file.days.get('2026-11-08')!.refs[2], '1 Thessalonians 4:13-18');
  assert.equal(file.days.get('2026-07-28')!.refs[0], 'Jeremiah 14:17-22', 'the footnote markers of the source are gone');
  assert.equal(file.days.get('2026-07-27')!.refs[1], 'Deuteronomy 32', 'the book of a canticle in the place of the psalm, without "Psalm/"');
  assert.equal(file.days.get('2026-12-06')!.refs[1], 'Psalm 85', 'a psalm whose verses are written in a form no lectionary writes (9-10-11-12) is the psalm alone');
  const text = read('assets/library/daily/readings-2026.json');
  assert.match(text, /^\{"about":\{"made":"tools\/liturgy\/import_readings\.py/);
  assert.match(text, /"read":"2026-11-08"/, 'the header says when it was read');
  assert.match(text, /Pascua, Supabase project diyimabdmsjykvitomgd, table public\.pascua_daily_readings/, 'where it comes from');
  assert.match(text, /facts of the Lectionary for Mass used in the United States[^"]*Pascua's own writing[^"]*is not used/, 'what is used (the lectionary of the United States, not the Roman Lectionary of every country) and what is not');
  assert.doesNotMatch(text, /facts of the Roman Lectionary/, 'the header does not call the lectionary of one country the Roman one');
  assert.match(text, /"differ":\["2026-06-04","2026-06-07","2026-11-26","2026-12-12"\]/, 'the days that differ are in the file');
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

check('a Sunday, a solemnity and a feast of the Lord keep the title of the calendar; a weekday takes the memorial the file names; a privileged weekday takes only the feasts of the General Calendar, on their date', () => {
  const sunday = litOf('2026-11-08');
  const weekday = litOf('2026-11-11');
  const advent = litOf('2026-12-21');
  const octave = litOf('2026-12-26');
  const lent = litOf('2027-03-10');
  const record = (name: string | null, own = false): DayRecord => ({ refs: ['a 1:1', null, null, null], name, own, unclear: [], mass: null });
  const at = (key: string) => ymd(key);
  assert.deepEqual(celebrationOf(sunday, record('Thirty-second Sunday in Ordinary Time', true), at('2026-11-08')), { title: '32nd Sunday in Ordinary Time', under: null });
  assert.deepEqual(celebrationOf(sunday, record('Some Saint'), at('2026-11-08')), { title: '32nd Sunday in Ordinary Time', under: null }, 'a Sunday is never renamed');
  assert.deepEqual(celebrationOf(litOf('2026-12-08'), record('Another name', true), at('2026-12-08')), { title: 'The Immaculate Conception of the Blessed Virgin Mary', under: null }, 'a solemnity is never renamed');
  assert.deepEqual(celebrationOf(litOf('2026-11-09'), record('Another name'), at('2026-11-09')), { title: 'The Dedication of the Lateran Basilica', under: null }, 'a feast of the Lord');
  assert.deepEqual(celebrationOf(weekday, record('Saint Martin of Tours, Bishop', true), at('2026-11-11')), { title: 'Saint Martin of Tours, Bishop', under: 'Wednesday of the 32nd Week in Ordinary Time' });
  assert.deepEqual(celebrationOf(weekday, record('Saint Martin of Tours, Bishop'), at('2026-11-11')), { title: 'Saint Martin of Tours, Bishop', under: 'Wednesday of the 32nd Week in Ordinary Time' }, 'a memorial beside a weekday is the title too');
  assert.deepEqual(celebrationOf(weekday, record(null), at('2026-11-11')), { title: 'Wednesday of the 32nd Week in Ordinary Time', under: null });
  assert.deepEqual(celebrationOf(weekday, null, at('2026-11-11')), { title: 'Wednesday of the 32nd Week in Ordinary Time', under: null });
  assert.deepEqual(celebrationOf(advent, record('Saint Peter Canisius, Priest and Doctor of the Church'), at('2026-12-21')), { title: 'Advent weekday, 21 December', under: null }, '17 to 24 December keep no memorial');
  assert.deepEqual(celebrationOf(advent, record('Saint Peter Canisius, Priest and Doctor of the Church', true), at('2026-12-21')), { title: 'Advent weekday, 21 December', under: null }, 'not even one the source calls the day itself');
  assert.deepEqual(celebrationOf(octave, record('Saint Stephen, the First Martyr', true), at('2026-12-26')), { title: 'Saint Stephen, the First Martyr', under: 'Second Day in the Octave of Christmas' }, 'a feast of the General Calendar on its own date, when the source says the day IS the celebration');
  assert.deepEqual(celebrationOf(octave, record('Saint Stephen, the First Martyr'), at('2026-12-26')), { title: 'Second Day in the Octave of Christmas', under: null }, 'but only then');
  assert.deepEqual(celebrationOf(litOf('2026-12-29'), record('Saint Thomas Becket, Bishop and Martyr', true), at('2026-12-29')), { title: 'Fifth Day in the Octave of Christmas', under: null }, 'a memorial in the octave is not a feast: not even when the source calls the day by its name');
  assert.equal(lent.season, 'lent');
  assert.deepEqual(celebrationOf(lent, record('Saint Somebody'), at('2027-03-10')), { title: lent.title, under: null }, 'Lent keeps no optional memorial');
  assert.deepEqual(celebrationOf(lent, record('Saint Somebody', true), at('2027-03-10')), { title: lent.title, under: null }, 'an obligatory memorial that the source calls by its name keeps no Lent weekday either');
  assert.deepEqual(celebrationOf(litOf('2027-02-10'), record('Ash Wednesday names', true), at('2027-02-10')), { title: 'Ash Wednesday', under: null });
  // the Chair of Saint Peter is a feast: it takes a weekday of Lent on 22 February and no other day of it
  const chair = litOf('2027-02-22');
  assert.equal(chair.season, 'lent');
  assert.equal(chair.rank, 'weekday');
  assert.deepEqual(celebrationOf(chair, record('The Chair of Saint Peter the Apostle', true), at('2027-02-22')), { title: 'The Chair of Saint Peter the Apostle', under: chair.title }, 'a feast on a weekday of Lent');
  assert.deepEqual(celebrationOf(litOf('2027-02-23'), record('The Chair of Saint Peter the Apostle', true), at('2027-02-23')), { title: litOf('2027-02-23').title, under: null }, 'on its date only');
  assert.deepEqual(celebrationOf(litOf('2027-03-23'), record('The Chair of Saint Peter the Apostle', true), { m: 2, d: 22 }), { title: litOf('2027-03-23').title, under: null }, 'no feast takes Holy Week');
  assert.deepEqual(celebrationOf(litOf('2027-02-10'), record('The Chair of Saint Peter the Apostle', true), { m: 2, d: 22 }), { title: 'Ash Wednesday', under: null }, 'and none takes Ash Wednesday');
  assert.deepEqual([...FEASTS_ON_PRIVILEGED_DAYS].sort(), ['12-26', '12-27', '12-28', '2-22'], 'the feasts of the General Calendar that fall on a privileged weekday');
  // a sweep from 1 December 2026 to 30 April 2027, with a name and "own" on every day: the days that take the name are the weekdays that are not privileged, and three privileged ones (the two feasts
  // of the octave that are weekdays this year, and the Chair of Saint Peter)
  const privileged = /^(advent_december_|christmas_octave_day_|lent_|holy_|ash_wednesday$|.*_after_ash_wednesday$)/;
  const named: string[] = [];
  for (let t = Date.UTC(2026, 11, 1); t <= Date.UTC(2027, 3, 30); t += 86400000) {
    const key = new Date(t).toISOString().slice(0, 10);
    const lit = litOf(key);
    const got = celebrationOf(lit, record('A name', true), at(key));
    const takes = lit.rank === 'weekday' && (!privileged.test(lit.id) || ['2026-12-26', '2026-12-28', '2027-02-22'].includes(key));
    assert.equal(got.title === 'A name', takes, key);
    if (takes && privileged.test(lit.id)) named.push(key);
  }
  assert.deepEqual(named, ['2026-12-26', '2026-12-28', '2027-02-22']);
});

check('the day as the screens ask for it: the Sunday, a weekday with a memorial, a solemnity, a privileged weekday, Saint Stephen, and a day the file does not have', () => {
  const sunday = content.dayContent('2026-11-08');
  assert.equal(sunday.title, '32nd Sunday in Ordinary Time');
  assert.equal(sunday.under, null);
  assert.deepEqual(sunday.readings!.map((r) => r.kind), ['first', 'psalm', 'second', 'gospel']);
  assert.deepEqual(sunday.readings!.map((r) => r.title), ['First Reading', 'Responsorial Psalm', 'Second Reading', 'Gospel']);
  assert.deepEqual(sunday.readings!.map((r) => r.reference), ['Wisdom 6:12-16', 'Psalm 63:2, 3-4, 5-6, 7-8', '1 Thessalonians 4:13-18', 'Matthew 25:1-13']);
  assert.ok(sunday.readings!.every((r) => r.text && texts(r.text.lines).length > 0));
  assert.equal(sunday.readings![1].text!.note, 'whole');
  assert.equal(sunday.readings![0].text!.note, null);
  const line = readingsLine(sunday.readings!);
  assert.equal(line.replace(/\u00a0/g, ' '), 'Wisdom 6:12-16 · Psalm 63 · 1 Thessalonians 4:13-18 · Matthew 25:1-13');
  assert.equal(line, 'Wisdom\u00a06:12-16\u00a0· Psalm\u00a063\u00a0· 1\u00a0Thessalonians\u00a04:13-18\u00a0· Matthew\u00a025:1-13', 'a line that wraps does it between two references, never inside one');
  assert.equal(readingsLine([]), '');
  assert.equal(readingsSpoken(sunday.readings!), 'Wisdom, chapter 6, verses 12 to 16; Psalm 63; First Thessalonians, chapter 4, verses 13 to 18; Matthew, chapter 25, verses 1 to 13', 'the banner says each reference in words, a psalm by its number');
  assert.deepEqual(sunday.readings!.map((r) => r.spoken), ['Wisdom, chapter 6, verses 12 to 16', 'Psalm 63, verses 2, 3 to 4, 5 to 6 and 7 to 8', 'First Thessalonians, chapter 4, verses 13 to 18', 'Matthew, chapter 25, verses 1 to 13'], 'a row of the screen says the whole psalm reference');
  assert.equal(readingsSpoken([]), '');
  assert.equal(sunday.noSecond, false);
  assert.equal(sunday.unavailable, null, 'a day with readings has nothing to apologise for');

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
    assert.deepEqual(content.dayBrief(key), { dateKey: key, title: litOf(key).title, under: null, readings: null, unavailable: NO_READINGS });
    assert.equal(none.unavailable, NO_READINGS, `${key}: the honest line`);
    assert.equal(none.noSecond, false);
  }
  assert.deepEqual(content.dayContent('not a day'), { dateKey: 'not a day', title: '', under: null, readings: null, unavailable: NO_READINGS, noSecond: false, mass: null });
  assert.deepEqual(content.dayBrief('2026-02-30'), { dateKey: '2026-02-30', title: '', under: null, readings: null, unavailable: NO_READINGS });
  assert.equal(NO_READINGS, 'The readings for this day are not in the app yet.');
  assert.equal(READINGS_DIFFER, 'The readings for this day differ from country to country and are not in the app yet.');
  assert.equal(READINGS_SOURCE, 'Readings: the Lectionary for Mass used in the United States. Words: World English Bible, Catholic edition, not the lectionary translation.', 'the source is named for what it is: the lectionary of one country');
  assert.doesNotMatch(READINGS_SOURCE, /Roman|general calendar|may differ/, 'the small print does not call it the Roman one');
  assert.equal(WHOLE_PSALM_NOTE, 'This is the whole psalm. Mass uses only the verses named above.');
  assert.equal(PSALM_ONLY_NOTE, 'The source names the psalm only, not the verses Mass uses: this is the whole psalm.');
  assert.equal(PART_VERSE_NOTE, 'A verse with a letter after its number is shown whole; the reading uses only part of it.');
  assert.equal(UNCLEAR_PSALM_NOTE, "The source's list of verses for this day is not clear, so the whole psalm is shown.");
  assert.deepEqual(PASSAGE_NOTES, { whole: WHOLE_PSALM_NOTE, psalm: PSALM_ONLY_NOTE, part: PART_VERSE_NOTE, unclear: UNCLEAR_PSALM_NOTE });
  assert.deepEqual(MASS_LINES, { morning: 'These are the readings of the Mass of the morning. The evening Mass has other readings.', day: 'These are the readings of the Mass during the Day. The other Masses of Christmas have other readings.' });
  assert.equal(NO_SECOND_READING, 'The source lists no second reading for this day.');
  assert.deepEqual(NO_WORDS, { numbering: 'Words not shown: this Bible may number these verses differently.', chapter: 'Words not shown: the source names the chapter and no verses.', form: 'Words not shown: this reference could not be read.' });
  assert.deepEqual(READING_KINDS, ['first', 'psalm', 'second', 'gospel']);
  assert.deepEqual(READING_TITLES, { first: 'First Reading', psalm: 'Responsorial Psalm', second: 'Second Reading', gospel: 'Gospel' });
});

check('24 December says that its readings are those of the Mass of the morning and 25 December those of the Mass during the Day, over the readings; no other day says it; and the rows of the source are ones the line is true of', () => {
  const morning = content.dayContent('2026-12-24');
  const day = content.dayContent('2026-12-25');
  assert.equal(morning.mass, MASS_LINES.morning);
  assert.equal(day.mass, MASS_LINES.day);
  assert.equal(morning.mass, 'These are the readings of the Mass of the morning. The evening Mass has other readings.');
  assert.equal(day.mass, 'These are the readings of the Mass during the Day. The other Masses of Christmas have other readings.');
  const file = parseReadingsFile(FILE_2026)!;
  assert.deepEqual([...file.days].filter(([, d]) => d.mass !== null).map(([k, d]) => [k, d.mass]), [['2026-12-24', 'morning'], ['2026-12-25', 'day']], 'two days of the file, marked by the importer');
  for (const key of file.days.keys()) if (key !== '2026-12-24' && key !== '2026-12-25') assert.equal(content.dayContent(key).mass, null, `${key} says nothing of a Mass`);
  assert.equal(content.dayContent('2026-12-23').mass, null);
  assert.equal(content.dayContent('2026-12-26').mass, null);
  assert.equal(content.dayContent('2027-12-25').mass, null, 'a day the file does not have says nothing');
  assert.equal(content.dayContent('2026-11-26').mass, null, 'nor does a day that differs');
  // the evidence, in the source: one row for each of the two days, and the Gospel of each is that of the Mass the line names (the importer refuses the export if either changes)
  const row = (key: string) => EXPORT.rows.find((r) => r.date === key)!;
  assert.equal(row('2026-12-24').liturgical_day, 'December 24');
  assert.equal(row('2026-12-24').gospel_ref, 'Luke 1:67-79', 'the Benedictus: the Mass of the morning of 24 December');
  assert.equal(row('2026-12-24').second_reading_ref, null);
  assert.equal(row('2026-12-25').gospel_ref, 'John 1:1-18', 'the Prologue of John: the Mass during the Day');
  assert.equal(row('2026-12-25').first_reading_ref, 'Isaiah 52:7-10');
  assert.equal(row('2026-12-25').second_reading_ref, 'Hebrews 1:1-6');
  assert.deepEqual(day.readings!.map((r) => r.kind), ['first', 'psalm', 'second', 'gospel'], 'the screen still gives the four readings of the source');
  // the banner lists references only: it has no such line
  assert.ok(!('mass' in content.dayBrief('2026-12-25')));
  // the line is made from the mark of the file and from nothing else: a made-up day with the mark has it, and the same day without the mark has none
  const made = (m?: string) => makeContent({ lookup: makeReadingsLookup([() => mutate((f) => { if (m) f.days['2026-11-09'].m = m; })]), source }).dayContent('2026-11-09');
  assert.equal(made('morning').mass, MASS_LINES.morning);
  assert.equal(made('day').mass, MASS_LINES.day);
  assert.equal(made().mass, null);
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

check('a psalm the source names with no verses (or whose verses it writes in a form nobody reads) is shown by its number and whole, with a note; a reference that cannot be read has no words and says so', () => {
  const day = content.dayContent('2026-12-06');
  const psalm = day.readings![1];
  assert.equal(psalm.reference, 'Psalm 85', 'the importer reduced "Psalm 85:9-10-11-12, 13-14", a run no lectionary writes, to the psalm');
  assert.equal(psalm.short, 'Psalm 85');
  assert.equal(psalm.spoken, 'Psalm 85');
  assert.equal(psalm.text!.note, 'unclear', 'the source DID give verses, in a form nobody reads: the note says the list is not clear, and does not say that the source names the psalm only');
  assert.equal(PASSAGE_NOTES[psalm.text!.note!], "The source's list of verses for this day is not clear, so the whole psalm is shown.");
  assert.equal(psalm.noWords, null);
  assert.deepEqual(parseReadingsFile(FILE_2026)!.days.get('2026-12-06')!.unclear, [1], 'the importer marked the day: the line is not guessed from the words of the reference');
  // every other psalm that is named alone is named alone by the source: its note is the other one
  let alone = 0;
  for (const [key, record] of parseReadingsFile(FILE_2026)!.days) {
    if (key === '2026-12-06' || !record.refs[1] || !/^Psalm \d+$/.test(record.refs[1])) continue;
    alone += 1;
    assert.deepEqual(record.unclear, [], key);
    assert.equal(content.dayContent(key).readings!.find((r) => r.kind === 'psalm')!.text!.note, 'psalm', `${key}: the source names the psalm only`);
  }
  assert.equal(alone, 108);
  assert.ok(texts(psalm.text!.lines).length >= 13, 'the whole psalm');
  assert.equal(texts(psalm.text!.lines)[0].n, '1', 'with the numbers of the Bible, which are the Bible\'s own');
  // the same psalm, if a file ever held the form nobody reads: the parser refuses it, the psalm is named by its number and shown whole, without numbers (they would be a guess)
  const odd = makeContent({
    lookup: makeReadingsLookup([() => mutate((f) => { f.days['2026-11-08'].r = ['Nowhere 1:1', 'Psalm 85:9-10-11-12, 13-14', null, 'Matthew 25:1-13']; })]),
    source,
  }).dayContent('2026-11-08');
  assert.deepEqual(odd.readings!.map((r) => [r.reference, r.short, r.spoken, r.text === null, r.noWords]), [['Nowhere 1:1', 'Nowhere 1:1', 'Nowhere 1:1', true, 'form'], ['Psalm 85', 'Psalm 85', 'Psalm 85', false, null], ['Matthew 25:1-13', 'Matthew 25:1-13', 'Matthew, chapter 25, verses 1 to 13', false, null]]);
  assert.equal(odd.readings![1].text!.note, 'unclear', 'a psalm the source gave verses for, in a form that cannot be read: the list is not clear (a hand-made file has no mark, the form says it)');
  assert.ok(texts(odd.readings![1].text!.lines).every((l) => l.n === ''));
  // a canticle the file gives in a form that is not read: the reference as it is, no words, and the line that says it could not be read
  const canticle = makeContent({
    lookup: makeReadingsLookup([() => mutate((f) => { f.days['2026-11-08'].r = ['Wisdom 6:12-16', 'Canticle of nothing', null, 'Matthew 25:1-13']; })]),
    source,
  }).dayContent('2026-11-08');
  assert.deepEqual(canticle.readings!.map((r) => [r.reference, r.text === null, r.noWords]), [['Wisdom 6:12-16', false, null], ['Canticle of nothing', true, 'form'], ['Matthew 25:1-13', false, null]]);
});

check('a reference with no words says why: the numbers of this Bible differ, the source names a chapter and no verses, or the form is not read', () => {
  const lonely = (key: string) => content.dayContent(key).readings!.filter((r) => r.text === null).map((r) => [r.reference, r.noWords]);
  assert.deepEqual(lonely('2026-09-08'), [['Micah 5:1-4a', 'numbering']], 'Micah 5:1 of the lectionary is 5:2 of this Bible');
  assert.deepEqual(lonely('2026-11-29'), [['Isaiah 63:16b-17, 19b; 64:2-7', 'numbering']]);
  assert.deepEqual(lonely('2026-07-24'), [['Jeremiah 31', 'chapter']], 'a canticle in the place of the psalm that the source gives as a chapter');
  assert.deepEqual(lonely('2026-07-27'), [['Deuteronomy 32', 'chapter']]);
  assert.deepEqual(lonely('2026-12-20'), [['Romans 16:25-27', 'numbering']]);
  assert.deepEqual(lonely('2026-11-08'), [], 'a Sunday whose four readings all have words says nothing of the kind');
  // the verses of these three have the same numbers in both Bibles, and only later verses of the chapter move: so the line says "may", for them and for every other reference of its kind
  assert.deepEqual(lonely('2026-06-19'), [['2 Kings 11:1-4, 9-18, 20', 'numbering']]);
  assert.deepEqual(lonely('2026-07-09'), [['Hosea 11:1-4, 8e-9', 'numbering']]);
  assert.deepEqual(lonely('2026-10-02'), [['Job 38:1, 12-21; 40:3-5', 'numbering']]);
  assert.match(NO_WORDS.numbering, /\bmay number\b/, 'it does not say that this Bible numbers them differently: it may');
  assert.doesNotMatch(NO_WORDS.numbering, /numbers these verses differently/);
  for (const key of ['2026-09-08', '2026-07-24']) assert.ok(content.dayContent(key).readings!.filter((r) => r.noWords).every((r) => !r.text));
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

// the days the two name in other words only (the same day): the parentheses of two solemnities, the days from 17 to 24 December that the source calls by their date, the octave of Christmas
const WORDING: Record<string, string> = {
  '2026-11-02': 'All Souls: the source writes "All Soul’s Day"', '2026-12-25': 'Christmas: "(Christmas)" for "(Christmas Day)"',
  '2026-12-17': 'a day of 17 to 24 December, called by its date', '2026-12-18': 'a day of 17 to 24 December, called by its date', '2026-12-19': 'a day of 17 to 24 December, called by its date',
  '2026-12-21': 'a day of 17 to 24 December, called by its date', '2026-12-22': 'a day of 17 to 24 December, called by its date', '2026-12-23': 'a day of 17 to 24 December, called by its date',
  '2026-12-24': 'a day of 17 to 24 December, called by its date', '2026-12-29': 'the octave of Christmas: "within the Octave of the Nativity of the Lord"',
  '2026-12-30': 'the octave of Christmas: "within the Octave of the Nativity of the Lord"', '2026-12-31': 'the octave of Christmas: "within the Octave of the Nativity of the Lord"',
};

check('every day of the data that has readings has the title, the week and the Sunday of the calendar of the app, except the days listed here, each for the reason given', () => {
  const wording: string[] = [];
  const saints: string[] = [];
  let same = 0;
  for (const r of KEPT) {
    const lit = litOf(r.date);
    if (plainTitle(lit.title) === plainTitle(r.liturgical_day)) { same += 1; continue; }
    const own = !!r.feast && r.feast.toLowerCase() === r.liturgical_day.toLowerCase();
    if (lit.rank === 'weekday' && own) { saints.push(r.date); continue; }
    wording.push(r.date);
  }
  assert.deepEqual(wording, Object.keys(WORDING).sort(), 'the days that are the same day in other words');
  assert.equal(same, 166, 'days that have the same title, week and Sunday in both');
  assert.equal(saints.length, 39, 'days on which the source names a saint or a feast that the calendar of the app leaves out on purpose (liturgy.ts: WHAT IS NOT)');
  assert.equal(same + wording.length + saints.length, KEPT.length);
  for (const key of saints) {
    const c = content.dayContent(key);
    assert.notEqual(c.under, null, `${key}: the name of the saint is the title, the day of the calendar goes under it`);
    assert.equal(c.under, litOf(key).title);
  }
  assert.equal(EXPORT.about.read, '2026-11-08');
});

check('on every day that has readings a Sunday or a solemnity has the title the source gives it, a weekday has no second reading, and a Sunday or a solemnity has one but for the day listed', () => {
  const titles: string[] = [];
  const four: string[] = [];
  const noSecond: string[] = [];
  let big = 0;
  for (const r of KEPT) {
    const lit = litOf(r.date);
    const hasSecond = !!r.second_reading_ref && !!r.second_reading_ref.trim();
    if (lit.rank === 'sunday' || lit.rank === 'solemnity') {
      big += 1;
      if (plainTitle(lit.title) !== plainTitle(r.liturgical_day) && !(r.date in WORDING)) titles.push(`${r.date} ${lit.title} | ${r.liturgical_day}`);
      if (hasSecondReading(lit) && !hasSecond) noSecond.push(r.date);
      assert.equal(content.dayContent(r.date).noSecond, hasSecondReading(lit) && !hasSecond, `${r.date}: the screen says that the source lists no second reading exactly there`);
    }
    if (lit.rank === 'weekday' && hasSecond) four.push(`${r.date} ${lit.title}`);
  }
  assert.deepEqual(titles, [], 'a Sunday or a solemnity that the source calls by another name than the calendar does: the readings may be those of another day (these are the days the importer leaves out)');
  assert.deepEqual(four, [], 'a weekday with four readings: the readings of a Mass of one country (the importer leaves such a day out)');
  assert.deepEqual(noSecond, ['2026-05-31'], 'Trinity Sunday: the source lists no second reading (the lectionary has one); a person with a lectionary has to look at it');
  assert.equal(big, 36, 'Sundays and solemnities looked at: 26 Sundays and 10 solemnities (Trinity, the Sacred Heart, John the Baptist, Peter and Paul, the Assumption, All Saints, All Souls, Christ the King, the Immaculate Conception, Christmas)');
  // and the days the importer left out are exactly the ones this test would have found
  assert.deepEqual(EXPORT.rows.filter((r) => LEFT_OUT.includes(r.date)).map((r) => [r.date, litOf(r.date).rank, !!r.second_reading_ref]), [
    ['2026-06-04', 'solemnity', false], ['2026-06-07', 'sunday', true], ['2026-11-26', 'weekday', true], ['2026-12-12', 'weekday', false],
  ]);
  assert.equal(plainTitle(litOf('2026-06-07').title), plainTitle(EXPORT.rows.find((r) => r.date === '2026-06-07')!.liturgical_day), 'the 10th Sunday by title, Corpus Christi by readings (John 6)');
  assert.equal(EXPORT.rows.find((r) => r.date === '2026-06-07')!.gospel_ref, 'John 6:51-58');
  // the weekday weeks and the octave of Easter read as weekdays: no second reading is expected on them
  assert.equal(hasSecondReading(litOf('2027-03-30')), false, 'Tuesday in the Octave of Easter (a solemnity of this calendar that reads as a weekday)');
  assert.equal(hasSecondReading(litOf('2027-03-28')), true, 'Easter Sunday');
  assert.equal(hasSecondReading(litOf('2027-04-04')), true, 'a Sunday of Easter');
  assert.equal(hasSecondReading(litOf('2026-11-11')), false, 'a weekday');
  assert.equal(hasSecondReading(litOf('2026-12-08')), true, 'a solemnity');
});

check('the colours agree on every day without a celebration name in the data; the days where they differ are the memorials of saints (their own colour) and four days where the source is wrong', () => {
  // the source says Green on four days that are violet or white: 21 and 23 December (Advent) and 29 and 31 December (Christmas time)
  const WRONG = ['2026-12-21', '2026-12-23', '2026-12-29', '2026-12-31'];
  const differ = KEPT.filter((r) => COLOURS[r.liturgical_color] !== litOf(r.date).colour);
  const withName = differ.filter((r) => r.feast && r.feast.trim());
  const withoutName = differ.filter((r) => !(r.feast && r.feast.trim()));
  assert.deepEqual(withoutName.map((r) => r.date), [], 'no day without a name in the data has another colour than the calendar of the app');
  assert.equal(differ.length, 108, 'days on which the colour of the data is not the colour of the calendar of the app: 104 of a saint, 4 wrong');
  const wrong = differ.filter((r) => litOf(r.date).rank === 'weekday' && ['violet', 'white'].includes(litOf(r.date).colour) && r.liturgical_color === 'Green');
  assert.deepEqual(wrong.map((r) => r.date), WRONG);
  for (const r of withName.filter((x) => !WRONG.includes(x.date))) {
    assert.ok(['White', 'Red'].includes(r.liturgical_color), `${r.date}: the colour of a memorial (${r.liturgical_color})`);
    assert.equal(litOf(r.date).rank, 'weekday', `${r.date}: a weekday of the calendar of the app`);
  }
  // the screen draws the colour of the calendar, never the source's
  assert.doesNotMatch(read('assets/library/daily/readings-2026.json'), /"(c|colour|color|liturgical_color)"/, 'the colour is not in the asset');
});

check('the Sunday cycle and the weekday cycle of the calendar agree with the readings of the data: the Gospel of each Sunday is the one of its cycle, bar two days', () => {
  const book = { A: 'Matthew', B: 'Mark', C: 'Luke' } as const;
  const other: string[] = [];
  let sundays = 0;
  for (const r of KEPT) {
    const lit = litOf(r.date);
    if (lit.rank !== 'sunday') continue;
    sundays += 1;
    if (!r.gospel_ref.startsWith(book[lit.sundayCycle])) other.push(`${r.date} ${r.gospel_ref}`);
  }
  assert.equal(sundays, 26, 'the Sundays of Ordinary Time and of Advent in the data that has readings (Trinity, All Saints, Christ the King and the Holy Family are not Sundays of the calendar: a solemnity, a feast; 7 June, the Sunday with the readings of Corpus Christi, is left out)');
  // 13 December: John 1 is the Gospel of the third Sunday of Advent of Year B; 20 December: Luke 1:26-38, the fourth. (7 June had John 6, the readings of Corpus Christi, and is one of the days the importer leaves out.)
  assert.deepEqual(other, ['2026-12-13 John 1:6-8, 19-28', '2026-12-20 Luke 1:26-38']);
  assert.equal(litOf('2026-11-28').sundayCycle, 'A');
  assert.equal(litOf('2026-11-29').sundayCycle, 'B', 'Advent 2026 begins Year B: the first Sunday of Advent has Mark 13:33-37');
  assert.equal(EXPORT.rows.find((r) => r.date === '2026-11-29')!.gospel_ref, 'Mark 13:33-37');
  // Year II: the weeks 10 to 16 of Ordinary Time of 2026 read 1 and 2 Kings, Amos, Hosea, Isaiah and Micah in their weekdays, on the days with no memorial (Year I reads Genesis, Exodus, Leviticus ...)
  const weekday = new Set<string>();
  for (const r of KEPT) {
    const lit = litOf(r.date);
    if (lit.season === 'ordinary' && lit.rank === 'weekday' && lit.week && lit.week >= 10 && lit.week <= 16 && !r.feast) weekday.add(`${lit.weekdayCycle} ${r.first_reading_ref.replace(/ \d.*$/, '')}`);
  }
  assert.deepEqual([...weekday].sort(), ['II 1 Kings', 'II 2 Chronicles', 'II 2 Kings', 'II Amos', 'II Hosea', 'II Isaiah', 'II Micah', 'II Sirach']);
});

check('the days where the source has the readings of the United States and not those of the General Roman Calendar are left out: the day of the calendar, and one line that says the readings differ from country to country', () => {
  const row = (key: string) => EXPORT.rows.find((r) => r.date === key)!;
  // what the calendar of the app says on those days, and what the source has instead
  assert.equal(litOf('2026-06-04').title, 'The Most Holy Body and Blood of Christ (Corpus Christi)');
  assert.equal(row('2026-06-04').first_reading_ref, '2 Timothy 2:8-15', 'weekday readings on the day the calendar calls Corpus Christi (the United States keeps Corpus Christi on the Sunday)');
  assert.equal(litOf('2026-06-07').title, '10th Sunday in Ordinary Time');
  assert.equal(row('2026-06-07').gospel_ref, 'John 6:51-58', 'the Gospel of Corpus Christi on the 10th Sunday');
  assert.equal(litOf('2026-11-26').title, 'Thursday of the 34th Week in Ordinary Time');
  assert.equal(row('2026-11-26').second_reading_ref, '1 Corinthians 1:3-9', 'four readings on a weekday: the Mass of Thanksgiving Day of the United States');
  assert.equal(litOf('2026-12-12').title, 'Saturday of the 2nd Week of Advent');
  assert.equal(row('2026-12-12').first_reading_ref, 'Zechariah 2:14-17', 'the readings of Our Lady of Guadalupe, a feast in the United States, on a weekday of Advent');
  for (const key of LEFT_OUT) {
    const c = content.dayContent(key);
    assert.equal(c.readings, null, `${key}: no readings`);
    assert.equal(c.unavailable, READINGS_DIFFER, `${key}: they differ from country to country`);
    assert.equal(c.title, litOf(key).title, `${key}: the day of the calendar, worked out on the phone, not the name the source gives it`);
    assert.equal(c.under, null);
    assert.equal(c.noSecond, false);
    assert.deepEqual(content.dayBrief(key), { dateKey: key, title: litOf(key).title, under: null, readings: null, unavailable: READINGS_DIFFER });
    assert.equal(lookup.recordFor(key), null);
    assert.equal(lookup.differs(key), true);
  }
  // the days next to them are the ordinary ones, with readings and nothing to apologise for
  for (const key of ['2026-06-03', '2026-06-05', '2026-06-06', '2026-06-08', '2026-11-25', '2026-11-27', '2026-12-11', '2026-12-13']) {
    assert.ok(content.dayContent(key).readings, key);
    assert.equal(content.dayContent(key).unavailable, null, key);
    assert.equal(lookup.differs(key), false, key);
  }
  // and the days outside the data are "not in the app yet", not "differ": we know nothing of them
  assert.equal(content.dayContent('2027-01-17').unavailable, NO_READINGS);
  assert.equal(content.dayContent('2026-05-24').unavailable, NO_READINGS);
  // Trinity Sunday has no second reading in the data (it says so), and the Transfiguration neither (a feast: the rule of the line is for Sundays and solemnities)
  assert.equal(content.dayContent('2026-05-31').readings!.length, 3);
  assert.equal(content.dayContent('2026-05-31').noSecond, true);
  assert.equal(content.dayContent('2026-08-06').readings!.length, 3);
  assert.equal(content.dayContent('2026-08-06').noSecond, false);
  // the only reference of the export that is not one of the forms we read: the importer reduces it to its psalm, so every reference of the file is read
  const unread = EXPORT.rows.flatMap((r) => [r.first_reading_ref, r.psalm_ref, r.second_reading_ref, r.gospel_ref].filter((x): x is string => !!x && !!x.trim()).map((x) => ({ date: r.date, ref: x })))
    .filter(({ ref }) => parseReference(ref.replace(/\s*\[\^[^\]\s]*\]/g, '').replace(/^Psalm\/(?=\S)/, '').trim()) === null);
  assert.deepEqual(unread, [{ date: '2026-12-06', ref: 'Psalm 85:9-10-11-12, 13-14' }]);
  const inFile = [...parseReadingsFile(FILE_2026)!.days].flatMap(([key, d]) => d.refs.filter((x): x is string => x !== null).map((x) => ({ date: key, ref: x }))).filter(({ ref }) => parseReference(ref) === null);
  assert.deepEqual(inFile, [], 'every reference of the file is read');
  assert.doesNotMatch(read('assets/library/daily/readings-2026.json'), /\d+-\d+-\d+-\d+/, 'no run of four numbers joined by hyphens, which no lectionary writes');
});

/** The words that a reading of the data may start or end in the middle of a sentence with, because the lectionary does: an epistle or a canticle that begins on a verse that goes on from the one before. */
const MID_SENTENCE = new Set([
  '2026-05-27 first', '2026-05-28 first', '2026-08-10 first', '2026-09-14 second', '2026-09-21 first', '2026-10-08 psalm', '2026-10-20 first', '2026-10-21 first', '2026-10-26 first',
  '2026-10-27 first', '2026-11-02 second', '2026-11-30 first', '2026-12-13 psalm',
]);

check('every reading of the data that gets words starts where a sentence starts and ends where one ends, or is one of the readings that the lectionary starts or ends inside a sentence', () => {
  let shown = 0, alone = 0;
  const notes = { whole: 0, psalm: 0, unclear: 0, part: 0, none: 0 };
  const aloneList: string[] = [];
  const unexpected: string[] = [];
  for (const [key, record] of parseReadingsFile(FILE_2026)!.days) {
    const day = content.dayContent(key);
    for (const reading of day.readings!) {
      const parsed = parseReference(record.refs[READING_KINDS.indexOf(reading.kind)]!);
      if (!reading.text) { alone += 1; aloneList.push(`${key} ${reading.reference}`); assert.ok(reading.noWords, `${key} ${reading.reference}: a reference with no words says why`); continue; }
      assert.equal(reading.noWords, null, `${key} ${reading.reference}: words, and nothing to say about their absence`);
      shown += 1;
      notes[reading.text.note ?? 'none'] += 1;
      if (reading.text.note === 'whole' || reading.text.note === 'psalm' || reading.text.note === 'unclear') continue;
      const letters = !!parsed && parsed.segments.some((s) => s.l1 || s.l2);
      assert.equal(letters, reading.text.note === 'part', `${key} ${reading.reference}: the note that a verse is shown whole is there when the reference has a letter, and only then`);
      if (letters) continue; // a part of a verse: the whole verse is shown, and it may start or end anywhere
      const verses = texts(reading.text.lines);
      const first = verses[0].text, last = verses[verses.length - 1].text;
      const starts = /^[A-Z“‘"'(0-9]/.test(first);
      const ends = /[.!?”’"')]$/.test(last);
      if ((!starts || !ends) && !MID_SENTENCE.has(`${key} ${reading.kind}`)) unexpected.push(`${key} ${reading.kind} ${reading.reference}: ${starts ? '' : `starts "${first.slice(0, 40)}" `}${ends ? '' : `ends "${last.slice(-40)}"`}`);
    }
  }
  assert.deepEqual(unexpected, [], 'a reading that starts or ends in the middle of a sentence and is not on the list: a verse may be shifted');
  assert.equal(shown + alone, 689, 'the references of the 217 days that have readings');
  assert.equal(alone, 14);
  assert.deepEqual(notes, { whole: 63, psalm: 108, unclear: 1, part: 60, none: 443 }, 'what the words say about themselves: a psalm shown whole for named verses, a psalm the source names with no verses, a verse shown whole where the reference has a letter, and words that are what the reference names');
  assert.deepEqual(aloneList, [
    '2026-06-19 2 Kings 11:1-4, 9-18, 20', '2026-07-06 Hosea 2:16, 17c-18, 21-22', '2026-07-09 Hosea 11:1-4, 8e-9', '2026-07-10 Hosea 14:2-10', '2026-07-24 Jeremiah 31', '2026-07-27 Deuteronomy 32',
    '2026-08-07 Nahum 2:1, 3; 3:1-3, 6-7', '2026-08-17 Deuteronomy 32', '2026-09-08 Micah 5:1-4a', '2026-10-02 Job 38:1, 12-21; 40:3-5', '2026-10-25 Exodus 22:20-26',
    '2026-11-29 Isaiah 63:16b-17, 19b; 64:2-7', '2026-12-20 Romans 16:25-27', '2026-12-23 Malachi 3:1-4, 23-24',
  ], 'the readings that are shown by their reference alone, and why: the numbers differ, or the Bible has no such verse, or the source gives a chapter and no verses (a person with a lectionary has to look at each)');
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

/* ===================================================================================== when the data runs out */

/** Is `today` plus `within` days past the last day of the data? (Whole days on the phone's calendar: a date as the three numbers it is, no clock time.) */
const runsOutSoon = (today: Date, last: string, within = 30): boolean => {
  const end = ymd(last);
  return Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + within) > Date.UTC(end.y, end.m - 1, end.d);
};

check('the notice that the readings run out is worked out in whole days, 30 before the last day of the data', () => {
  assert.equal(runsOutSoon(new Date(2026, 10, 9), '2026-12-31'), false, '9 November 2026: 52 days to go');
  assert.equal(runsOutSoon(new Date(2026, 11, 1), '2026-12-31'), false, '1 December: 30 days to go');
  assert.equal(runsOutSoon(new Date(2026, 11, 2), '2026-12-31'), true, '2 December: 29 days to go');
  assert.equal(runsOutSoon(new Date(2026, 11, 31, 23, 59), '2026-12-31'), true);
  assert.equal(runsOutSoon(new Date(2027, 0, 5), '2026-12-31'), true, 'and after the last day');
  assert.equal(runsOutSoon(new Date(2026, 11, 2), '2027-12-31'), false, 'a file of 2027 would put it off a year');
});

// A NOTICE and never a failure: a test that failed on a date would turn every pull request red from the first of December. It only says, in the output of the run, that the readings are running out.
{
  const last = [...parseReadingsFile(FILE_2026)!.days.keys()].sort().at(-1)!;
  if (runsOutSoon(new Date(), last)) {
    const end = ymd(last);
    const left = Math.round((Date.UTC(end.y, end.m - 1, end.d) - Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())) / 86400000);
    console.log(`NOTICE (not a failure): the readings of the Daily reading ${left >= 0 ? `run out in ${left} days, on ${last}` : `ran out ${-left} days ago, on ${last}`}. Add the days after it to Pascua's table and run tools/liturgy/import_readings.py (tools/liturgy/README.md, "Dates after 31 December 2026").`);
  }
}

console.log(`${n} of ${n} passed`);
