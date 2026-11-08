// Plain-node checks of the text of the Bible in the app: the 73 books of the World English Bible, Catholic edition, as the importer
// (tools/bible/import_webc.py) wrote them to assets/bible/webc, and the code that hands them to the screens (bible/textCore.ts, text.ts).
// No React, no React Native, no network. Run: npm run test:library (library.test.ts runs this file too).
//
// The expected numbers are typed in again on purpose and are not read from the files: a book that lost a chapter, a verse that was cut
// in two, a word that turned into a marker, an asset that was edited without running the importer fails here instead of on a phone.
// The table of chapters and verses was read against a second source (the list of eBible.org's translation in the helloao API, which
// counts the same 35,408 verses), so it does not only repeat what the importer made.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BIBLE_BOOKS } from '../bible/books';
import { makeBibleText, type BookLoaders, type TextIndex } from '../bible/textCore';
import type { BookText } from '../bible/textTypes';
import { SAMPLE_READING } from '../daily/sample';
import { run } from './runTs';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };
const root = process.cwd(); // npm test runs from mobile/
const ASSETS = join(root, 'assets/bible/webc');
const BIBLE_DIR = join(root, 'src/features/library/bible');
const sha256 = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');

// ------------------------------------------------------------------------------------------------------------ what is typed in again

/** The books in the order of the app: the Old Testament (Esther where the Hebrew Bible has it, Daniel after Ezekiel, both from the Greek), the Deuterocanon, the New Testament. */
const ORDER = 'GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH ESG JOB PSA PRO ECC SNG ISA JER LAM EZK DAG HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC MAL TOB JDT WIS SIR BAR 1MA 2MA MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV'.split(' ');

/** code chapters/verses, for every book. */
const COUNTS = 'GEN 50/1533, EXO 40/1213, LEV 27/859, NUM 36/1288, DEU 34/959, JOS 24/658, JDG 21/618, RUT 4/85, 1SA 31/810, 2SA 24/695, 1KI 22/816, 2KI 25/719, 1CH 29/942, 2CH 36/822, EZR 10/280, NEH 13/406, ESG 10/205, JOB 42/1070, PSA 150/2461, PRO 31/915, ECC 12/222, SNG 8/117, ISA 66/1292, JER 52/1364, LAM 5/154, EZK 48/1273, DAG 14/530, HOS 14/197, JOL 3/73, AMO 9/146, OBA 1/21, JON 4/48, MIC 7/105, NAM 3/47, HAB 3/56, ZEP 3/53, HAG 2/38, ZEC 14/211, MAL 4/55, TOB 14/244, JDT 16/339, WIS 19/436, SIR 51/1383, BAR 6/213, 1MA 16/924, 2MA 15/555, MAT 28/1071, MRK 16/678, LUK 24/1151, JHN 21/879, ACT 28/1007, ROM 16/434, 1CO 16/437, 2CO 13/257, GAL 6/149, EPH 6/155, PHP 4/104, COL 4/95, 1TH 5/89, 2TH 3/47, 1TI 6/113, 2TI 4/83, TIT 3/46, PHM 1/25, HEB 13/303, JAS 5/108, 1PE 5/105, 2PE 3/61, 1JN 5/105, 2JN 1/13, 3JN 1/14, JUD 1/25, REV 22/404';

/** The name the translation gives each book, in the same order. */
const NAMES = 'Genesis, Exodus, Leviticus, Numbers, Deuteronomy, Joshua, Judges, Ruth, 1 Samuel, 2 Samuel, 1 Kings, 2 Kings, 1 Chronicles, 2 Chronicles, Ezra, Nehemiah, Esther (Greek), Job, Psalms, Proverbs, Ecclesiastes, Song of Solomon, Isaiah, Jeremiah, Lamentations, Ezekiel, Daniel (Greek), Hosea, Joel, Amos, Obadiah, Jonah, Micah, Nahum, Habakkuk, Zephaniah, Haggai, Zechariah, Malachi, Tobit, Judith, Wisdom, Sirach, Baruch, 1 Maccabees, 2 Maccabees, Matthew, Mark, Luke, John, Acts, Romans, 1 Corinthians, 2 Corinthians, Galatians, Ephesians, Philippians, Colossians, 1 Thessalonians, 2 Thessalonians, 1 Timothy, 2 Timothy, Titus, Philemon, Hebrews, James, 1 Peter, 2 Peter, 1 John, 2 John, 3 John, Jude, Revelation'.split(', ');

/** The verses that have a number and no words: the edition prints only a note under them (the verse is left out of the best manuscripts). */
const NO_WORDS = 'SIR 1:5, SIR 1:7, SIR 1:21, SIR 3:19, SIR 10:21, SIR 11:15-16, SIR 13:14, SIR 16:15-16, SIR 17:5, SIR 17:9, SIR 17:16, SIR 17:18, SIR 17:21, SIR 18:3, SIR 19:18-19, SIR 19:21, SIR 20:3, SIR 20:32, SIR 22:9-10, SIR 23:28, SIR 24:18, SIR 24:24, SIR 25:12, SIR 26:19-27, LUK 17:36, ACT 8:37, ACT 15:34, ACT 24:7, ROM 16:25'.split(', ');

const SOURCE_SHA256 = '85a6599ccd65c8d71a62fb0d7e1739e4c776a970e05f25d5f881684550e7620c'; // the zip of eBible.org the importer is pinned to

const table = COUNTS.split(', ').map((entry) => {
  const m = /^([0-9A-Z]{3}) (\d+)\/(\d+)$/.exec(entry);
  assert.ok(m, `"${entry}" is not "CODE 12/345"`);
  return { code: m![1], chapters: Number(m![2]), verses: Number(m![3]) };
});

// ------------------------------------------------------------------------------------------------------------------ the files

const files = readdirSync(ASSETS).sort();
const json = <T>(name: string): T => JSON.parse(readFileSync(join(ASSETS, name), 'utf8')) as T;
const index = json<TextIndex>('index.json');
const manifest = json<{
  books: { bytes: number; chapters: number; code: string; file: string; name: string; sha256: string; sourceFile: string; sourceSha256: string; verses: number }[];
  dropped: Record<string, any>;
  emptyVerses: { note: string; verse: string }[];
  files: Record<string, { bytes: number; sha256: string }>;
  kept: Record<string, number>;
  source: { bytes: number; date: string; licencePage: { file: string; sha256: string }; sha256: string; url: string };
  totals: { books: number; bytes: number; chapters: number; verses: number };
  translation: Record<string, string>;
  format: number;
  generator: string;
}>('manifest.json');
const books = new Map<string, BookText>(ORDER.map((code) => [code, json<BookText>(`${code}.json`)]));
const book = (code: string): BookText => books.get(code)!;
const verseOf = (code: string, chapter: number, label: string) => {
  const found = book(code).chapters[chapter - 1].verses.find((v) => v.n === label);
  assert.ok(found, `${code} ${chapter}:${label} is there`);
  return found!;
};
/** The words of a verse as one line: no tabs, no line breaks. */
const oneLine = (t: string) => t.split('\n').map((l) => l.replace(/^\t+/, '')).filter(Boolean).join(' ');
const everyVerse = function* () {
  for (const code of ORDER) for (const chapter of book(code).chapters) for (const verse of chapter.verses) yield { code, chapter, verse };
};
/** Every piece of text the screens can print: the words, the headings, the titles, the names. */
const everyText = function* () {
  for (const code of ORDER) {
    yield { where: `${code} name`, text: book(code).name };
    for (const chapter of book(code).chapters) {
      if (chapter.title !== undefined) yield { where: `${code} ${chapter.c} title`, text: chapter.title };
      for (const verse of chapter.verses) {
        yield { where: `${code} ${chapter.c}:${verse.n}`, text: verse.t };
        if (verse.h !== undefined) yield { where: `${code} ${chapter.c}:${verse.n} heading`, text: verse.h };
      }
    }
  }
};

check('the folder holds the 73 books, index.json and manifest.json, and nothing else', () => {
  assert.deepEqual(files, [...ORDER.map((c) => `${c}.json`), 'index.json', 'manifest.json'].sort());
  assert.equal(ORDER.length, 73);
  assert.equal(new Set(ORDER).size, 73);
});

check('73 books, 1,328 chapters, 35,408 verses, counted in the files and not read from the index', () => {
  let chapters = 0;
  let verses = 0;
  for (const code of ORDER) {
    chapters += book(code).chapters.length;
    verses += book(code).chapters.reduce((sum, c) => sum + c.verses.length, 0);
  }
  assert.equal(books.size, 73);
  assert.equal(chapters, 1328);
  assert.equal(verses, 35408);
  assert.deepEqual(manifest.totals, { books: 73, bytes: manifest.totals.bytes, chapters: 1328, verses: 35408 });
  assert.equal(index.books.length, 73);
  assert.equal(index.books.reduce((s, b) => s + b.chapters, 0), 1328);
  assert.equal(index.books.reduce((s, b) => s + b.verses, 0), 35408);
});

check('every book has the chapters and the verses of the pinned table, in the files, in the index and in the manifest', () => {
  assert.deepEqual(table.map((t) => t.code), ORDER, 'the table is in the order of the app');
  for (const t of table) {
    const b = book(t.code);
    assert.equal(b.code, t.code);
    assert.equal(b.chapters.length, t.chapters, `${t.code}: chapters`);
    assert.equal(b.chapters.reduce((s, c) => s + c.verses.length, 0), t.verses, `${t.code}: verses`);
    const i = index.books.find((e) => e.code === t.code);
    assert.deepEqual(i && { chapters: i.chapters, verses: i.verses }, { chapters: t.chapters, verses: t.verses }, `${t.code}: index.json`);
    const m = manifest.books.find((e) => e.code === t.code);
    assert.deepEqual(m && { chapters: m.chapters, verses: m.verses }, { chapters: t.chapters, verses: t.verses }, `${t.code}: manifest.json`);
  }
});

check('the Deuterocanon is 137 chapters (Tobit 14, Judith 16, Wisdom 19, Sirach 51, Baruch 6, 1 Maccabees 16, 2 Maccabees 15), the New Testament 260 and the Old Testament 929 with Esther and Daniel from the Greek (ESG 10, DAG 14)', () => {
  const sum = (codes: string[]) => codes.reduce((s, c) => s + book(c).chapters.length, 0);
  assert.equal(sum(['TOB', 'JDT', 'WIS', 'SIR', 'BAR', '1MA', '2MA']), 137);
  assert.equal(sum(ORDER.slice(ORDER.indexOf('MAT'))), 260);
  assert.equal(ORDER.slice(ORDER.indexOf('MAT')).length, 27);
  const old = ORDER.slice(0, ORDER.indexOf('TOB'));
  assert.equal(old.length, 39);
  assert.equal(sum(old), 931, '929 chapters of the Old Testament in the list of the app, plus the two chapters of Daniel (13 and 14) that the app lists as added passages');
  assert.equal(book('ESG').chapters.length, 10);
  assert.equal(book('DAG').chapters.length, 14);
});

check('the index lists the 73 books in the order of the app, with the name the translation gives each, and the translation as the screens print it', () => {
  assert.deepEqual(index.books.map((b) => b.code), ORDER);
  assert.deepEqual(index.books.map((b) => b.name), NAMES);
  assert.deepEqual(ORDER.map((c) => book(c).name), NAMES, 'a file says the same name as the index');
  assert.deepEqual(index.translation, {
    id: 'eng-web-c',
    name: 'World English Bible, Catholic edition',
    short: 'WEB',
    licence: 'Public domain',
    credit: 'World English Bible, Catholic edition (eBible.org). Public domain. The name "World English Bible" is a trademark of eBible.org.',
    source: 'https://ebible.org/eng-web-c/',
  });
  assert.deepEqual(manifest.translation, index.translation);
});

check('the chapters of the app list (bible/books.ts) are the chapters of the files, but for Daniel (12 there, 14 here: Susanna and Bel and the Dragon are chapters 13 and 14) and the two rows of added passages, which the files hold inside Esther and Daniel', () => {
  const by = new Map(BIBLE_BOOKS.map((b) => [b.name, b]));
  const appName: Record<string, string> = { 'Song of Solomon': 'Song of Songs', 'Esther (Greek)': 'Esther', 'Daniel (Greek)': 'Daniel', Wisdom: 'Wisdom' };
  const differs: string[] = [];
  for (const t of table) {
    const name = NAMES[ORDER.indexOf(t.code)];
    const row = by.get(appName[name] ?? name);
    assert.ok(row, `the app list has a row for ${name}`);
    if (row!.chapters !== t.chapters) differs.push(`${name} ${row!.chapters} / ${t.chapters}`);
  }
  assert.deepEqual(differs, ['Daniel (Greek) 12 / 14']);
  assert.deepEqual(BIBLE_BOOKS.filter((b) => b.chapters === null).map((b) => b.name), ['Additions to Esther', 'Additions to Daniel']);
});

// ------------------------------------------------------------------------------------------------------------- what the files are

check('manifest.json: the size and the sha256 of every file, the source and its hash, and what was left out, in numbers', () => {
  assert.equal(manifest.format, 1);
  assert.equal(manifest.generator, 'tools/bible/import_webc.py');
  assert.equal(manifest.source.sha256, SOURCE_SHA256);
  assert.equal(manifest.source.url, 'https://ebible.org/Scriptures/eng-web-c_usfm.zip');
  assert.equal(manifest.source.bytes, 3090996);
  assert.match(manifest.source.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(manifest.source.licencePage.file, 'copr.htm');
  assert.match(manifest.source.licencePage.sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(manifest.books.map((b) => b.code), ORDER);
  let total = 0;
  for (const m of manifest.books) {
    const data = readFileSync(join(ASSETS, m.file));
    assert.equal(m.file, `${m.code}.json`);
    assert.equal(data.length, m.bytes, `${m.file}: bytes`);
    assert.equal(sha256(data), m.sha256, `${m.file} is not what the importer wrote (edited by hand? run tools/bible/import_webc.py)`);
    assert.match(m.sourceSha256, /^[0-9a-f]{64}$/);
    assert.match(m.sourceFile, /^\d\d-[0-9A-Z]{3}eng-web-c\.usfm$/);
    total += data.length;
  }
  assert.equal(total, manifest.totals.bytes);
  const data = readFileSync(join(ASSETS, 'index.json'));
  assert.deepEqual(manifest.files, { 'index.json': { bytes: data.length, sha256: sha256(data) } }, 'index.json is what the importer wrote');
  // what was left out, counted: the apparatus the owner decided against, and the front matter. The numbers are a snapshot of the pinned zip.
  const d = manifest.dropped;
  assert.equal(d.footnotes, 1678);
  assert.equal(d.crossReferences, 343);
  assert.equal(d.strongsTags, 669389);
  assert.deepEqual(d.frontMatter, { bytes: 9459, file: '00-FRTeng-web-c.usfm', lines: 37 });
  assert.deepEqual(d.introductions.lines, 12);
  assert.deepEqual(Object.keys(d.introductions.byBook), ['1MA', '2MA', 'BAR', 'ESG', 'JDT', 'SIR', 'TOB', 'WIS'], 'the books that have an introduction written by the translators (left out)');
  assert.deepEqual(manifest.kept, { bookNames: 10, selah: 74, wordsOfJesus: 2290 });
});

check('every file is JSON in the compact form the importer writes: sorted keys, no spaces, one line, one newline at the end', () => {
  for (const f of files) {
    const text = readFileSync(join(ASSETS, f), 'utf8');
    if (f === 'manifest.json') continue; // people read this one: it has one value to a line
    assert.ok(text.endsWith('}\n') && text.indexOf('\n') === text.length - 1, `${f}: one line, one newline at the end`);
    assert.equal(JSON.stringify(JSON.parse(text)), text.slice(0, -1).replace(/\\u00a0/g, '\u00a0'), `${f}: compact`);
  }
});

// ------------------------------------------------------------------------------------------------------------------- the words

check('no marker of the source is left in anything the screens print: no backslash, no "strong=", no "|", no straight double quote', () => {
  const offenders: string[] = [];
  for (const { where, text } of everyText()) if (/[\\|"]|strong=/.test(text)) offenders.push(`${where}: ${text.slice(0, 50)}`);
  assert.deepEqual(offenders, []);
});

check('the text uses only the characters this edition uses: printable ASCII, the curly quotes, the two dashes and the no-break space (so the search can fold it letter by letter)', () => {
  const allowed = /^[ -~\t\n‘’“”–—\u00a0]*$/;
  const odd: string[] = [];
  for (const { where, text } of everyText()) if (!allowed.test(text)) odd.push(`${where}: ${[...text].filter((c) => !allowed.test(c)).join('')}`);
  assert.deepEqual(odd, []);
  const nbsp = [...everyVerse()].filter((v) => v.verse.t.includes('\u00a0')).map((v) => `${v.code} ${v.chapter.c}:${v.verse.n}`);
  assert.deepEqual(nbsp, ['JHN 5:11', 'ACT 20:35', 'ACT 22:21'], 'the three verses that keep a no-break space between a closing single and a closing double quote');
});

check('the curly quotes stay as they are in the source: not one straight apostrophe, and the words of Genesis 1 are the words of the printed edition', () => {
  assert.ok(![...everyText()].some(({ text }) => text.includes("'")), 'no straight apostrophe anywhere');
  assert.deepEqual(book('GEN').chapters[0].verses.slice(0, 5).map((v) => v.t), [
    'In the beginning, God created the heavens and the earth.',
    'The earth was formless and empty. Darkness was on the surface of the deep and God’s Spirit was hovering over the surface of the waters.',
    'God said, “Let there be light,” and there was light.',
    'God saw the light, and saw that it was good. God divided the light from the darkness.',
    'God called the light “day”, and the darkness he called “night”. There was evening and there was morning, the first day.',
  ]);
  assert.equal(oneLine(verseOf('JHN', 11, '35').t), 'Jesus wept.');
  assert.equal(oneLine(verseOf('REV', 22, '21').t), 'The grace of the Lord Jesus Christ be with all the saints. Amen.');
});

check('no verse is empty but the ones the edition prints as a number and a note: the 29 of the pinned list (24 in Sirach, 5 in the New Testament), which the manifest lists with the words of the note', () => {
  const empty = [...everyVerse()].filter((v) => v.verse.t === '').map((v) => `${v.code} ${v.chapter.c}:${v.verse.n}`);
  assert.deepEqual(empty, NO_WORDS);
  assert.deepEqual(manifest.emptyVerses.map((e) => e.verse), NO_WORDS);
  assert.ok(manifest.emptyVerses.every((e) => e.note.length > 10 && !/[\\|]/.test(e.note)), 'a note is words');
  assert.equal(manifest.emptyVerses.find((e) => e.verse === 'SIR 11:15-16')?.note, 'Verses 15 and 16 are omitted by the best authorities.');
  assert.equal(manifest.emptyVerses.find((e) => e.verse === 'LUK 17:36')?.note, 'Some Greek manuscripts add: “Two will be in the field: the one taken, and the other left.”');
  for (const { code, chapter, verse } of everyVerse()) {
    if (verse.t === '') continue;
    assert.ok(oneLine(verse.t).length > 0, `${code} ${chapter.c}:${verse.n} has words`);
  }
});

check('the chapters are 1, 2, 3 ... in order and the verse labels are in order inside each chapter: numbers that grow, a joined label ("15-16") that ends after it starts', () => {
  for (const code of ORDER) {
    book(code).chapters.forEach((chapter, i) => {
      assert.equal(chapter.c, i + 1, `${code}: chapter ${i + 1}`);
      assert.ok(chapter.verses.length > 0, `${code} ${chapter.c} has verses`);
      let last = 0;
      for (const verse of chapter.verses) {
        const m = /^(\d+)(?:-(\d+))?$/.exec(verse.n);
        assert.ok(m, `${code} ${chapter.c}: "${verse.n}" is not a number or two numbers with a hyphen`);
        const from = Number(m![1]);
        const to = m![2] === undefined ? from : Number(m![2]);
        assert.ok(from > last, `${code} ${chapter.c}:${verse.n} comes after ${last}`);
        assert.ok(to >= from && (m![2] === undefined || to > from), `${code} ${chapter.c}:${verse.n} ends after it starts`);
        last = to;
      }
    });
  }
});

check('the five joined labels are all Sirach, all verses without words (11:15-16, 16:15-16, 19:18-19, 22:9-10, 26:19-27), and no other label is not a plain number', () => {
  const joined = [...everyVerse()].filter((v) => !/^\d+$/.test(v.verse.n)).map((v) => `${v.code} ${v.chapter.c}:${v.verse.n}`);
  assert.deepEqual(joined, ['SIR 11:15-16', 'SIR 16:15-16', 'SIR 19:18-19', 'SIR 22:9-10', 'SIR 26:19-27']);
  for (const j of joined) assert.ok(NO_WORDS.includes(j), `${j} has only a note in the edition`);
});

check('Psalm 121, verses 1 to 4, are the sample of the Daily reading, word for word, and the title of the psalm is the one the sample gives', () => {
  const psalm = book('PSA').chapters[120];
  assert.equal(psalm.c, 121);
  assert.equal(psalm.title, SAMPLE_READING.title);
  assert.equal(psalm.title, 'A Song of Ascents.');
  assert.equal(psalm.verses.length, 8);
  for (const sample of SAMPLE_READING.verses) assert.equal(oneLine(psalm.verses[sample.n - 1].t), sample.text, `Psalm 121:${sample.n}`);
  assert.equal(SAMPLE_READING.verses.length, 4);
});

// ------------------------------------------------------------------------------------------------------- lines, paragraphs, headings

check('poetry is lines that start with tabs: one for a first level line (and a list item), two for the second, three for the third; prose has none', () => {
  assert.equal(verseOf('PSA', 1, '1').t, '\tBlessed is the man who doesn’t walk in the counsel of the wicked,\n\t\tnor stand on the path of sinners,\n\t\tnor sit in the seat of scoffers;');
  assert.equal(verseOf('PSA', 121, '1').t, '\tI will lift up my eyes to the hills.\n\t\tWhere does my help come from?');
  assert.equal(verseOf('GEN', 1, '1').t, 'In the beginning, God created the heavens and the earth.', 'prose: no tab');
  assert.equal(verseOf('EZR', 8, '2').t, '\tOf the sons of Phinehas, Gershom.\n\tOf the sons of Ithamar, Daniel.\n\tOf the sons of David, Hattush.', 'a list: a tab for every item');
  assert.match(verseOf('SIR', 43, '12').t, /^\t/, 'Sirach is poetry');
  assert.ok([...everyVerse()].some((v) => /(^|\n)\t\t\t[^\t]/.test(v.verse.t)), 'there are third level lines (Sirach)');
  // A verse that starts when no line marker came before it goes on in the line before it: no tab in front, and no `p`.
  const noTab = [...everyVerse()].filter((v) => v.code === 'PSA' && v.verse.t !== '' && !v.verse.t.startsWith('\t')).map((v) => `${v.chapter.c}:${v.verse.n}`);
  assert.deepEqual(noTab, ['55:3', '66:14', '72:20'], 'all the other verses of the Psalms start a line of poetry');
});

check('a verse that starts inside a line of poetry goes on in that line: no tab in front and no `p` (Psalms 55:3 and 66:14); Psalm 72:20 is a paragraph of prose', () => {
  assert.ok(verseOf('PSA', 55, '2').t.endsWith('\n\t\tand moan'), 'the verse before stops in the middle of the line');
  assert.equal(verseOf('PSA', 55, '3').t.split('\n')[0], 'because of the voice of the enemy,', 'and this one carries it on');
  assert.equal(verseOf('PSA', 55, '3').p, undefined);
  assert.equal(verseOf('PSA', 66, '14').t.split('\n')[0], 'which my lips promised,');
  assert.equal(verseOf('PSA', 66, '14').p, undefined);
  assert.equal(verseOf('PSA', 72, '20').p, true);
  assert.equal(verseOf('PSA', 72, '20').t, 'This ends the prayers by David, the son of Jesse.');
});

check('the lines of a verse: tabs only at the start of a line (one to three), a line never starts or ends with a space, a blank line is empty and never the first or the last, never two in a row', () => {
  const bad: string[] = [];
  for (const { code, chapter, verse } of everyVerse()) {
    const where = `${code} ${chapter.c}:${verse.n}`;
    const lines = verse.t.split('\n');
    if (verse.t === '') continue;
    if (lines[0] === '' || lines[lines.length - 1] === '') bad.push(`${where}: blank edge`);
    lines.forEach((line, i) => {
      if (line !== '' && !/^\t{0,3}\S/.test(line)) bad.push(`${where} line ${i + 1}: ${JSON.stringify(line.slice(0, 30))}`);
      if (/\t/.test(line.replace(/^\t+/, ''))) bad.push(`${where} line ${i + 1}: a tab inside the line`);
      if (/ $/.test(line) || / {2}/.test(line)) bad.push(`${where} line ${i + 1}: space at the end or doubled`);
      if (line === '' && lines[i - 1] === '') bad.push(`${where}: two blank lines`);
    });
    if (verse.p && verse.t.startsWith('\t')) bad.push(`${where}: a paragraph of prose that starts with a tab`);
  }
  assert.deepEqual(bad.slice(0, 10), []);
});

check('a paragraph that starts inside a verse is a new line without tabs; a blank line inside a verse is an empty line', () => {
  assert.equal(verseOf('JHN', 8, '11').t.split('\n').length, 2, 'John 8:11 goes on in a new paragraph');
  assert.match(verseOf('JHN', 8, '11').t, /“No one, Lord\.”\nJesus said,/);
  assert.equal(verseOf('EZR', 4, '11').t, 'This is the copy of the letter that they sent:\n\nTo King Artaxerxes, from your servants, the people beyond the River.', 'a letter starts after a blank line');
  assert.equal(verseOf('ESG', 1, '1').t.split('\n').length, 4, 'Esther 1:1 holds the first addition: four paragraphs');
  assert.ok(verseOf('ESG', 1, '1').t.startsWith('[In the second year of the reign of Ahasuerus'));
  assert.equal([...everyVerse()].filter((v) => v.verse.t.includes('\n\n')).length, 22, 'verses with a blank line inside');
});

check('paragraphs and blank lines: `p` on the verse that starts a paragraph of prose, `b` on the verse after a blank line; nothing at the top or the end of a chapter', () => {
  let p = 0;
  let b = 0;
  let h = 0;
  for (const { verse } of everyVerse()) {
    if (verse.p) p += 1;
    if (verse.b) b += 1;
    if (verse.h) h += 1;
    assert.ok(verse.p === undefined || verse.p === true);
    assert.ok(verse.b === undefined || verse.b === true);
  }
  assert.deepEqual({ p, b, h }, { p: 7987, b: 929, h: 63 });
  assert.equal(manifest.dropped.blankLinesAtChapterStart, 12);
  assert.equal(manifest.dropped.blankLinesAtChapterEnd, 104);
  for (const code of ORDER) for (const chapter of book(code).chapters) assert.equal(chapter.verses[0].b, undefined, `${code} ${chapter.c}: no blank line before the first verse`);
  assert.equal(verseOf('GEN', 1, '1').p, true);
  assert.equal(verseOf('GEN', 1, '2').p, undefined, 'a verse that goes on in the paragraph');
  assert.equal(verseOf('JHN', 8, '1').p, undefined, 'a chapter that goes on in the paragraph of the one before (no break)');
  assert.equal(verseOf('PSA', 121, '3').b, true, 'a blank line between two stanzas');
});

check('titles: a line over a chapter. The 116 psalms that have one, and the prayer of Sirach 51; nothing else', () => {
  const titles = ORDER.flatMap((code) => book(code).chapters.filter((c) => c.title !== undefined).map((c) => `${code} ${c.c}`));
  assert.equal(titles.length, 117);
  assert.equal(titles.filter((t) => t.startsWith('PSA ')).length, 116);
  assert.deepEqual(titles.filter((t) => !t.startsWith('PSA ')), ['SIR 51']);
  assert.equal(book('SIR').chapters[50].title, 'A Prayer of Jesus the son of Sirach.');
  assert.equal(book('PSA').chapters[2].title, 'A Psalm by David, when he fled from Absalom his son.');
  assert.equal(book('PSA').chapters[41].title, 'For the Chief Musician. A contemplation by the sons of Korah.');
  assert.deepEqual(book('PSA').chapters.filter((c) => c.title === undefined).map((c) => c.c), [1, 2, 10, 33, 43, 71, 91, 93, 94, 95, 96, 97, 99, 104, 105, 106, 107, 111, 112, 113, 114, 115, 116, 117, 118, 119, 135, 136, 137, 146, 147, 148, 149, 150]);
});

check('headings, `h` on the verse they stand before: BOOK 1 to 5 over Psalms 1, 42, 73, 90 and 107; the 22 letters of Psalm 119; the speakers of the Song of Songs; the three sections of Daniel and the Letter of Jeremiah', () => {
  const headings = (code: string) => book(code).chapters.flatMap((c) => c.verses.filter((v) => v.h !== undefined).map((v) => [c.c, v.n, v.h] as const));
  assert.deepEqual(headings('PSA').filter(([, , h]) => h!.startsWith('BOOK')), [[1, '1', 'BOOK 1'], [42, '1', 'BOOK 2'], [73, '1', 'BOOK 3'], [90, '1', 'BOOK 4'], [107, '1', 'BOOK 5']]);
  assert.deepEqual(headings('PSA').filter(([c]) => c === 119).map(([, n, h]) => `${n} ${h}`), [
    '1 ALEPH', '9 BETH', '17 GIMEL', '25 DALETH', '33 HE', '41 VAV', '49 ZAYIN', '57 HETH', '65 TETH', '73 YODH', '81 KAPF', '89 LAMEDH', '97 MEM', '105 NUN', '113 SAMEKH',
    '121 AYIN', '129 PE', '137 TZADHE', '145 QOPH', '153 RESH', '161 SIN AND SHIN', '169 TAV',
  ]);
  assert.equal(book('PSA').chapters[118].title, undefined, 'Psalm 119 has no title: ALEPH is the first of its 22 headings');
  assert.equal(headings('PSA').length, 5 + 22);
  assert.equal(headings('SNG').length, 31);
  assert.deepEqual(headings('SNG').slice(0, 4), [[1, '2', 'Beloved'], [1, '5', 'Beloved'], [1, '8', 'Lover'], [1, '11', 'Friends']]);
  assert.deepEqual(new Set(headings('SNG').map(([, , h]) => h)), new Set(['Beloved', 'Lover', 'Friends', 'Brothers']));
  assert.deepEqual(headings('DAG'), [[3, '24', 'THE SONG OF THE THREE HOLY CHILDREN'], [3, '91', 'Deliverance from the Furnace'], [13, '1', 'THE HISTORY OF SUSANNA'], [14, '1', 'Bel and the Dragon']]);
  assert.deepEqual(headings('BAR'), [[6, '1', 'The Letter of Jeremy (Jeremiah)']]);
  assert.deepEqual(ORDER.filter((c) => !['PSA', 'SNG', 'DAG', 'BAR'].includes(c)).flatMap(headings), [], 'no other book has a heading');
});

check('a heading in the middle of a verse cannot stand there (the format has a heading before a verse): the Song of Songs has five, three are put before the next verse and two, which a verse has no room for, are left out, and the manifest says which', () => {
  const m = manifest.dropped.headingsInTheMiddleOfAVerse;
  assert.deepEqual(m.movedToTheNextVerse.map((e: any) => `${e.text} before ${e.before}`), ['Beloved before SNG 1:5', 'Lover before SNG 7:1', 'Beloved before SNG 8:6']);
  assert.deepEqual(m.dropped.map((e: any) => `${e.text} before ${e.before}`), ['Friends before SNG 1:5', 'Friends before SNG 5:2']);
  assert.equal(verseOf('SNG', 1, '5').h, 'Beloved');
  assert.equal(verseOf('SNG', 7, '1').h, 'Lover');
  assert.equal(verseOf('SNG', 8, '6').h, 'Beloved');
  assert.match(verseOf('SNG', 1, '4').t, /\n\tWe will be glad and rejoice in you\.\n\t\tWe will praise your love more than wine!\n\tThey are right to love you\.$/, 'the words of the speakers stay in the verse');
});

check('ESG (Esther from the Greek) is 10 chapters and 205 verses with its five additions inside the verses; DAG (Daniel from the Greek) is 14 chapters and 530 verses, Susanna is chapter 13 and Bel and the Dragon chapter 14', () => {
  assert.deepEqual(book('ESG').chapters.map((c) => c.verses.length), [22, 23, 15, 46, 14, 14, 10, 17, 30, 14]);
  assert.equal(book('ESG').chapters.reduce((s, c) => s + c.verses.length, 0), 205);
  assert.deepEqual(book('DAG').chapters.map((c) => c.verses.length), [21, 49, 97, 37, 31, 28, 28, 27, 27, 21, 45, 13, 64, 42]);
  assert.equal(book('DAG').chapters.reduce((s, c) => s + c.verses.length, 0), 530);
  assert.ok(oneLine(verseOf('DAG', 13, '1').t).startsWith('A man lived in Babylon, and his name was Joakim.'));
  assert.ok(oneLine(verseOf('DAG', 14, '1').t).startsWith('King Astyages was gathered to his fathers'));
  assert.equal(verseOf('DAG', 13, '1').h, 'THE HISTORY OF SUSANNA');
  assert.equal(book('BAR').chapters.length, 6, 'Baruch is six chapters, the sixth the Letter of Jeremiah');
  assert.equal(book('BAR').chapters[5].verses.length, 73);
});

check('what the markup of the source says is kept as plain words: the words of Jesus, Selah and the names of books lose their markers and keep every word', () => {
  assert.equal(verseOf('MAT', 5, '3').t, '\t“Blessed are the poor in spirit,\n\t\tfor theirs is the Kingdom of Heaven.');
  assert.equal(verseOf('PSA', 3, '2').t, '\tMany there are who say of my soul,\n\t\t“There is no help for him in God.” Selah.');
  assert.ok([...everyVerse()].filter((v) => /\bSelah\b/.test(v.verse.t)).length >= 74);
  assert.equal(oneLine(verseOf('JHN', 3, '16').t), 'For God so loved the world, that he gave his only born Son, that whoever believes in him should not perish, but have eternal life.');
});

// ------------------------------------------------------------------------------------------------------------ the code that serves it

const loaders: BookLoaders = Object.fromEntries(ORDER.map((code) => [code, () => book(code)]));

check('makeBibleText: the translation and the index as they are, hasBook for the 73 codes and no other, loadBook returns the book of the code and throws for any other', () => {
  const text = makeBibleText(index, loaders);
  assert.equal(text.TRANSLATION, index.translation);
  assert.equal(text.BOOK_INDEX, index.books);
  assert.deepEqual(ORDER.filter((c) => !text.hasBook(c)), []);
  for (const code of ['', 'psa', 'PSA ', 'XXX', 'FRT', 'EST', 'DAN', '__proto__', 'constructor', 'toString']) assert.equal(text.hasBook(code), false, `"${code}" is not a book`);
  for (const code of ORDER) assert.equal(text.loadBook(code).code, code);
  assert.equal(text.loadBook('PSA'), text.loadBook('PSA'), 'the same object every time');
  assert.throws(() => text.loadBook('XXX'), { name: 'Error', message: 'unknown book XXX' });
  assert.throws(() => text.loadBook('constructor'), { message: 'unknown book constructor' });
  assert.throws(() => text.loadBook(''), { message: 'unknown book ' });
});

check('makeBibleText catches a generated map that does not match the index: a book without a loader, a loader that returns another book', () => {
  const { GEN: _gen, ...fewer } = loaders;
  assert.throws(() => makeBibleText(index, fewer).loadBook('GEN'), { message: 'no text for book GEN' });
  assert.throws(() => makeBibleText(index, { ...loaders, GEN: () => book('EXO') }).loadBook('GEN'), { message: 'the file of GEN holds EXO' });
});

// ----------------------------------------------------------------------------------------------------------------- the wiring
// text.ts is the one file that `require`s the assets, so it cannot run where the tests run (rootDir is src). Its source and the generated
// map are read here, and then both are run, through the same TypeScript the app is compiled with and a `require` that reads the files.

check('webc.generated.ts has one lazy require for each of the 73 codes of the index, in the order of the app, each of a file that exists and holds that book', () => {
  const src = readFileSync(join(BIBLE_DIR, 'webc.generated.ts'), 'utf8');
  assert.match(src, /^\/\/ GENERATED by tools\/bible\/import_webc\.py/);
  const rows = [...src.matchAll(/^ {2}(?:'([0-9A-Z]{3})'|([A-Z]{3})): \(\) => require\('([^']+)'\) as BookText,$/gm)];
  assert.deepEqual(rows.map((r) => r[1] ?? r[2]), ORDER);
  assert.equal(rows.length, 73);
  assert.equal((src.match(/require\(/g) ?? []).length, 73, 'nothing else is required');
  for (const r of rows) {
    const code = r[1] ?? r[2];
    assert.equal(r[3], `../../../../assets/bible/webc/${code}.json`);
    const path = resolve(BIBLE_DIR, r[3]);
    assert.ok(existsSync(path), `${path} exists`);
    assert.equal((JSON.parse(readFileSync(path, 'utf8')) as BookText).code, code);
  }
});

check('text.ts, run for real: the translation, the 73 books of the index in order, hasBook and loadBook through the generated map', () => {
  const text = run(join(BIBLE_DIR, 'text.ts'));
  assert.deepEqual(Object.keys(text).sort(), ['BOOK_INDEX', 'TRANSLATION', 'hasBook', 'loadBook']);
  assert.deepEqual(text.TRANSLATION, index.translation);
  assert.deepEqual(text.BOOK_INDEX.map((b: any) => b.code), ORDER);
  assert.deepEqual(text.BOOK_INDEX, index.books);
  for (const code of ORDER) assert.equal(text.hasBook(code), true);
  assert.equal(text.hasBook('XXX'), false);
  for (const t of table) {
    const loaded = text.loadBook(t.code) as BookText;
    assert.equal(loaded.code, t.code);
    assert.equal(loaded.chapters.length, t.chapters);
  }
  assert.throws(() => text.loadBook('XXX'), { message: 'unknown book XXX' });
  const generated = run(join(BIBLE_DIR, 'webc.generated.ts'));
  assert.deepEqual(Object.keys(generated.WEBC_LOADERS), ORDER, 'the generated map has exactly the codes of the index');
});

check('the files of the text are pure and fetch nothing: no React, no React Native, no network, no storage', () => {
  for (const f of ['textTypes.ts', 'textCore.ts', 'text.ts', 'webc.generated.ts']) {
    const src = readFileSync(join(BIBLE_DIR, f), 'utf8');
    assert.doesNotMatch(src, /from '(react|react-native|expo|@\/)|\bfetch\(|XMLHttpRequest|localStorage|AsyncStorage|SecureStore|FileSystem|supabase/, `${f} is pure`);
  }
  assert.ok(statSync(ASSETS).isDirectory());
});

// ----------------------------------------------------------------------------------------------------------------- the licences screen

check('the licences screen has an entry for the translation: its name, "Public domain", the trademark sentence, the link, and what is not included; it says what the credit of the index says', () => {
  const src = readFileSync(join(root, 'app/licences.tsx'), 'utf8');
  const m = /const TEXT: Item\[\] = \[\s*\{ name: '([^']*)', what: '([^']*)', licence: '([^']*)', url: '([^']*)' \},\s*\];/.exec(src);
  assert.ok(m, 'one entry in a group of its own');
  const [, name, what, licence, url] = m!;
  assert.equal(name, index.translation.name);
  assert.equal(url, 'https://ebible.org/eng-web-c/');
  assert.equal(url, index.translation.source);
  assert.equal(licence, 'Public domain. The name “World English Bible” is a trademark of eBible.org.');
  assert.ok(index.translation.credit.endsWith(licence.replace(/[“”]/g, '"')), 'the same sentences as TRANSLATION.credit (straight quotes there, curly ones on the screen)');
  assert.ok(licence.startsWith(index.translation.licence));
  assert.match(what, /^The text of the Bible in the Library: 73 books, kept in the app, so it reads without a signal\./);
  assert.match(what, /Strong’s numbers, footnotes and cross references are not included\.$/);
  assert.match(src, /<Group title="MAPS AND DATA" items=\{DATA\} \/>\s*<Group title="THE BIBLE TEXT" items=\{TEXT\} \/>\s*<Group title="FONTS AND SOFTWARE" items=\{SOFTWARE\} \/>/, 'its own group, between the data and the software');
  assert.doesNotMatch(src, /^import .*(library\/bible|assets\/bible)|\brequire\(/m, 'the screen does not pull the text of the Bible into its own code: the entry is plain text');
  assert.match(src, /Pressable key=\{i\.name\} accessibilityRole="link" accessibilityLabel=\{`\$\{i\.name\}: open licence details`\} onPress=\{\(\) => \{ void WebBrowser\.openBrowserAsync\(i\.url\); \}\}/, 'it opens the page of the translation like every other entry');
});

console.log(`${n} of ${n} passed (Bible text)`);
