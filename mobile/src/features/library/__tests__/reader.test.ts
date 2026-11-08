// Plain-node checks of the logic of the Bible reader and of everything that leads to it: places and references (ref.ts), what the reader draws from the verses of
// a chapter (blocks.ts), the reading order and the addresses (order.ts), the book tiles and the chapter tiles (tileFit.ts, gridMath.ts: every one of the 73 names
// is fitted to its tile at the widths of phones, with the real widths of the font read again from the font file), the chapter read last (lastRead.ts), the verse rows
// of search and Bookmarks (verseRows.ts, search.ts), and the words that go out when a verse is copied or shared. No React, no React Native, no network. The text
// is a small one typed in below, in the encoding of textTypes.ts, so that nothing here depends on the files of the text.
// Run: npm run test:library (library.test.ts runs this file too).
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildBlocks, findVerse, labelOfNumber, locateVerse, blocksOfVerse, superscript, verseLabels, verseText, type Block, type PoemLine,
} from '../bible/blocks';
import { BIBLE_BOOKS, bookByCode } from '../bible/books';
import { CHAPTERS_NOTE, NOT_AT_MASS, READER_NOTE, creditLines } from '../bible/credit';
import { CHAPTER_GAP, CHAPTER_TILE_MIN, NARROW_UNDER, SIDE, bookGrid, chapterGrid } from '../bible/gridMath';
import { LAST_READ_NAME, CONTINUE_TITLE, continueLabel, packLastRead, parseLastRead, samePlace } from '../bible/lastRead';
import {
  bookHref, chapterTitle, isPlace, nextLabel, nextPlace, placeFromParams, placeKey, placeLabel, previousLabel, previousPlace, readerHref, refLabel, type Place,
} from '../bible/order';
import { INTER_400, THIN_SPACE_EM, HANG_EM, MONO_ADVANCE as NUMBER_ADVANCE, WRAP_SAFETY, textWidth, wrapPoem, wrapWords } from '../bible/wrap';
import { bookOfTyped, formatRef, labelHolds, parseRef, parseRefKey, refKey, refName, refOfVerse, verseRange, type Ref } from '../bible/ref';
import {
  COUNT_FLOOR, COUNT_MAX, FIT_SAFETY, FRAUNCES_600, MONO_ADVANCE, NAME_FLOOR, NAME_MAX, TEXT_SCALE_CAP, fitCount, fitName, lineWidth, nameLines,
} from '../bible/tileFit';
import type { BookText, Verse } from '../bible/textTypes';
import { COPIED, SHARE_TRANSLATION, chosenAnnouncement, verseShareText } from '../bible/verseActions';
import {
  EXCERPT_MAX, SLOW_SEARCH_MS, VERSES_CAPPED_NOTE, VERSE_RESULTS_MAX, announcesSearch, cleanMarks, excerpt, rowOfHit, rowOfKey, rowsOfHits, segments, verseQuery,
  versesLabel, type TextSource,
} from '../bible/verseRows';
import { BIBLE_SOURCE_LINE, BOOKMARKS_KEPT, BOOKMARKS_NOTICE, BOOKS_NOTICE, SEARCH_NOTICE } from '../sample';
import { emptyHits, hitCount, hitGroups, hitsForKeys, verseKey } from '../search';
import { BOOKMARKS_MAX, bookmarkKeys, packBookmarks, parseBookmarks, toggleBookmark } from '../bookmarks';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };
const root = process.cwd(); // npm test runs from mobile/
const read = (p: string) => readFileSync(join(root, p), 'utf8');

// ------------------------------------------------------------------------------------------------------------------------ a small text

const v = (label: string, t: string, extra: Partial<Verse> = {}): Verse => ({ n: label, t, ...extra });
const TEXT: Record<string, BookText> = {
  PSA: {
    code: 'PSA', name: 'Psalms',
    chapters: [{
      c: 121, title: 'A Song of Ascents.',
      verses: [
        v('1', '\tI will lift up my eyes to the hills.\n\t\tWhere does my help come from?'),
        v('2', '\tMy help comes from the LORD,\n\t\twho made heaven and earth.'),
        v('3', '\tHe will not allow your foot to be moved.\n\t\tHe who keeps you will not slumber.', { b: true }),
      ],
    }],
  },
  JHN: {
    code: 'JHN', name: 'John',
    chapters: [{
      c: 3,
      verses: [
        v('1', 'Now there was a man of the Pharisees, named Nicodemus.', { p: true, h: 'Jesus and Nicodemus' }),
        v('2', 'The same came to him by night.'),
        v('15-16', 'A joined pair, printed with one text.', { p: true }),
        v('17', 'For God didn’t send his Son into the world to judge the world.'),
      ],
    }],
  },
  SIR: {
    code: 'SIR', name: 'Sirach',
    chapters: [{ c: 11, verses: [v('14', '\tGood things and bad, life and death,'), v('15-16', ''), v('17', '\tThe Lord’s gift remains with the godly.')] }],
  },
};
const source: TextSource = {
  hasBook: (code) => code in TEXT,
  loadBook: (code) => { if (!(code in TEXT)) throw new Error(`unknown book ${code}`); return TEXT[code]; },
};
const chapter = (code: string, c: number) => TEXT[code].chapters.find((x) => x.c === c)!;
const nameOf = (code: string) => bookByCode(code)?.name;
const at = (code: string, c: number): Place => ({ code, chapter: c });

/* ================================================================ places and references (ref.ts) */

check('a place in words: "Psalm 121:1-4", "John 3:16", a chapter alone, a joined pair; the Psalms are the one book read in the singular', () => {
  assert.equal(formatRef({ code: 'PSA', chapter: 121, from: 1, to: 4 }, nameOf), 'Psalm 121:1-4');
  assert.equal(formatRef({ code: 'JHN', chapter: 3, from: 16 }, nameOf), 'John 3:16');
  assert.equal(formatRef({ code: 'JHN', chapter: 3 }, nameOf), 'John 3');
  assert.equal(formatRef({ code: '1CO', chapter: 13 }, nameOf), '1 Corinthians 13');
  assert.equal(formatRef({ code: 'SNG', chapter: 2, from: 4 }, nameOf), 'Song of Songs 2:4');
  assert.equal(formatRef({ code: 'SIR', chapter: 11, from: 15, to: 16 }, nameOf), 'Sirach 11:15-16');
  assert.equal(formatRef({ code: 'JUD', chapter: 1, from: 3 }, nameOf), 'Jude 1:3', 'a book of one chapter says its chapter too: nothing to take for another');
  assert.equal(formatRef({ code: 'PSA', chapter: 23 }, nameOf), 'Psalm 23');
  assert.equal(refName('PSA', nameOf), 'Psalm');
  assert.equal(refName('GEN', nameOf), 'Genesis');
  assert.equal(formatRef({ code: 'XXX', chapter: 2, from: 1 }, nameOf), 'XXX 2:1', 'a code with no name is said as it is');
  assert.equal(formatRef({ code: 'JHN', chapter: 3, from: 16, to: 16 }, nameOf), 'John 3:16', 'a run that is not one is its first verse');
  assert.equal(formatRef({ code: 'JHN', chapter: 3, from: 16, to: 9 }, nameOf), 'John 3:16', 'and a run that goes backwards too');
  assert.equal(refLabel({ code: 'PSA', chapter: 121, from: 3 }), 'Psalm 121:3');
  assert.equal(placeLabel(at('1CO', 13)), '1 Corinthians 13');
});

check('the key of a place says nothing about the translation and is made by one function: "PSA.121.3", "PSA.121.1-4", "PSA.121"; and it reads back as the place', () => {
  const refs: Array<[Ref, string]> = [
    [{ code: 'PSA', chapter: 121, from: 3 }, 'PSA.121.3'],
    [{ code: 'PSA', chapter: 121, from: 1, to: 4 }, 'PSA.121.1-4'],
    [{ code: 'PSA', chapter: 121 }, 'PSA.121'],
    [{ code: '1CO', chapter: 13, from: 4, to: 7 }, '1CO.13.4-7'],
    [{ code: 'SIR', chapter: 11, from: 15, to: 16 }, 'SIR.11.15-16'],
    [{ code: 'GEN', chapter: 1, from: 1, to: 1 }, 'GEN.1.1'],
  ];
  for (const [ref, key] of refs) {
    assert.equal(refKey(ref), key);
    const back = parseRefKey(key)!;
    assert.ok(back, key);
    assert.equal(refKey(back), key, 'through the key and back');
  }
  assert.deepEqual(parseRefKey('PSA.121.1-4'), { code: 'PSA', chapter: 121, from: 1, to: 4 });
  assert.deepEqual(parseRefKey('PSA.121.3'), { code: 'PSA', chapter: 121, from: 3 });
  assert.deepEqual(parseRefKey('PSA.121'), { code: 'PSA', chapter: 121 });
  assert.deepEqual(parseRefKey('1SA.3.10'), { code: '1SA', chapter: 3, from: 10 });
  assert.equal(verseKey({ code: 'PSA', chapter: 121, from: 3 }), 'bible:PSA.121.3', 'a bookmark of the Library is "bible:" and the key of the place');
});

check('what is not a key of a place is not read as one: ids of books, keys of other tabs, runs that go backwards, numbers with a zero in front, small letters, a fourth number', () => {
  for (const junk of ['', 'bible-psalms', 'bible:PSA.121.3', 'books:confessions', 'psa.121.3', 'PSA', 'PSA.', 'PSA.121.', 'PSA.0', 'PSA.121.0', 'PSA.121.5-5', 'PSA.121.9-3', 'PSA.121.03', 'PSA.121.3-', 'PSA.121.3.4', 'PSAL.121.3', 'PS.121.3', 'PSA.1210.3', 'PSA.121.1000', 'PSA.-1.3', ' PSA.121.3', 'PSA.121.3 ']) assert.equal(parseRefKey(junk), null, JSON.stringify(junk));
});

check('the printed labels of verses: "7" is one verse, "15-16" is a run; a label that is neither is none; a run holds the verses in it', () => {
  assert.deepEqual(verseRange('7'), { from: 7, to: 7 });
  assert.deepEqual(verseRange('15-16'), { from: 15, to: 16 });
  assert.deepEqual(verseRange('19-27'), { from: 19, to: 27 });
  for (const junk of ['', '0', '1a', '16-15', '5-5x', 'x', '-3', '3-', '1-2-3', ' 4']) assert.equal(verseRange(junk), null, JSON.stringify(junk));
  assert.deepEqual(refOfVerse('SIR', 11, '15-16'), { code: 'SIR', chapter: 11, from: 15, to: 16 });
  assert.deepEqual(refOfVerse('PSA', 121, '3'), { code: 'PSA', chapter: 121, from: 3 });
  assert.equal(refOfVerse('PSA', 121, 'x'), null);
  assert.equal(labelHolds('15-16', 15), true);
  assert.equal(labelHolds('15-16', 16), true);
  assert.equal(labelHolds('15-16', 17), false);
  assert.equal(labelHolds('7', 7), true);
  assert.equal(labelHolds('7', 8), false);
  assert.equal(labelHolds('x', 1), false);
});

check('what a person types: "Ps 121", "john 3:16", "1 Cor 13", "Psalm 23:1-3", short forms, no spaces, dots, capitals and accents; a name alone, a chapter the book has not, a run backwards and words that are no book are nothing', () => {
  const p = (text: string) => parseRef(text);
  assert.deepEqual(p('Ps 121'), { code: 'PSA', chapter: 121 });
  assert.deepEqual(p('john 3:16'), { code: 'JHN', chapter: 3, from: 16 });
  assert.deepEqual(p('1 Cor 13'), { code: '1CO', chapter: 13 });
  assert.deepEqual(p('Psalm 23:1-3'), { code: 'PSA', chapter: 23, from: 1, to: 3 });
  assert.deepEqual(p('Gen 1:1'), { code: 'GEN', chapter: 1, from: 1 });
  assert.deepEqual(p('GEN. 1:1'), { code: 'GEN', chapter: 1, from: 1 });
  assert.deepEqual(p('gen1:1'), { code: 'GEN', chapter: 1, from: 1 });
  assert.deepEqual(p('ps121'), { code: 'PSA', chapter: 121 });
  assert.deepEqual(p('1cor13:4-7'), { code: '1CO', chapter: 13, from: 4, to: 7 });
  assert.deepEqual(p('1 John 4:8'), { code: '1JN', chapter: 4, from: 8 });
  assert.deepEqual(p('  Song of Songs 2:4  '), { code: 'SNG', chapter: 2, from: 4 });
  assert.deepEqual(p('song 2'), { code: 'SNG', chapter: 2 });
  assert.deepEqual(p('Matt 5:3–12'), { code: 'MAT', chapter: 5, from: 3, to: 12 }, 'an en dash is a dash');
  assert.deepEqual(p('John 3.16'), { code: 'JHN', chapter: 3, from: 16 }, 'a dot between numbers is a colon');
  assert.deepEqual(p('Génesis 1'), { code: 'GEN', chapter: 1 }, 'accents do not matter');
  assert.deepEqual(p('revelation 22'), { code: 'REV', chapter: 22 });
  assert.deepEqual(p('Sirach 11:15-16'), { code: 'SIR', chapter: 11, from: 15, to: 16 });
  assert.deepEqual(p('Tobit 14'), { code: 'TOB', chapter: 14 });
  assert.deepEqual(p('2 Macc 7'), { code: '2MA', chapter: 7 });
  assert.deepEqual(p('Esther 10'), { code: 'ESG', chapter: 10 });
  assert.deepEqual(p('Dan 14'), { code: 'DAG', chapter: 14 }, 'Daniel has 14 chapters in this Bible');
  assert.deepEqual(p('1 thess 5'), { code: '1TH', chapter: 5 }, 'the start of a name, when it is the start of one book');
  assert.deepEqual(p('Jude 1:3'), { code: 'JUD', chapter: 1, from: 3 });
  for (const junk of ['', 'john', 'psalms', '121', '3:16', 'john 3:', 'john 3:16-', 'john 22', 'psalm 151', 'psalm 0', 'jude 2', 'john 3:0', 'john 3:16-10', 'john 3:16-16', 'jo 3', 'ma 3', 'zzz 3', 'john three', 'the lord is my shepherd', 'john 3:16 and more', 'x'.repeat(60) + ' 1', '1 1', '1 corinthians', '4 john 1']) {
    assert.equal(p(junk), null, JSON.stringify(junk));
  }
  assert.equal(bookOfTyped('jo'), undefined, 'two letters that start five books name none');
  assert.equal(bookOfTyped('jud'), undefined, 'Judges, Judith and Jude');
  assert.equal(bookOfTyped('1 jo')!.code, '1JN');
  assert.equal(bookOfTyped('jude')!.code, 'JUD');
  assert.equal(bookOfTyped('')?.code, undefined);
  for (const b of BIBLE_BOOKS) assert.equal(bookOfTyped(b.name)?.code, b.code, `${b.name} is found by its own name`);
  for (const b of BIBLE_BOOKS) assert.equal(bookOfTyped(b.name.toUpperCase())?.code, b.code, `${b.name} in capitals`);
  for (const b of BIBLE_BOOKS) assert.deepEqual(parseRef(`${b.name} ${b.chapters}`), { code: b.code, chapter: b.chapters }, `${b.name} ${b.chapters}: the last chapter of every book is typed and found`);
  for (const b of BIBLE_BOOKS) assert.equal(parseRef(`${b.name} ${b.chapters + 1}`), null, `${b.name} ${b.chapters + 1} does not exist`);
});

/* ================================================================ what the reader draws (blocks.ts) */

const kinds = (blocks: Block[]) => blocks.map((b) => b.kind);

check('a psalm is stanzas of lines gone in by their tabs: the number only on the first line of a verse, a break before a verse with `b`, and a stanza is one block', () => {
  const blocks = buildBlocks(chapter('PSA', 121));
  assert.deepEqual(kinds(blocks), ['poem', 'poem']);
  const [first, second] = blocks as Array<Extract<Block, { kind: 'poem' }>>;
  assert.deepEqual(first.lines.map((l) => [l.parts.length, l.parts[0].verse, l.parts[0].n, l.indent, l.parts[0].text]), [
    [1, '1', '1', 1, 'I will lift up my eyes to the hills.'],
    [1, '1', null, 2, 'Where does my help come from?'],
    [1, '2', '2', 1, 'My help comes from the LORD,'],
    [1, '2', null, 2, 'who made heaven and earth.'],
  ]);
  assert.equal(first.gap, 'none', 'the first block has nothing above it');
  assert.equal(second.gap, 'stanza', 'a verse with `b` begins a stanza after a blank line');
  assert.deepEqual(second.lines.map((l) => [l.parts[0].verse, l.indent]), [['3', 1], ['3', 2]]);
});

check('prose is paragraphs: the verses without `p` flow on in the paragraph before them, each with its own number; `p` starts the next paragraph; the first paragraph has no space above it', () => {
  const blocks = buildBlocks(chapter('JHN', 3));
  assert.deepEqual(kinds(blocks), ['heading', 'prose', 'prose']);
  const [heading, first, second] = blocks as [Extract<Block, { kind: 'heading' }>, Extract<Block, { kind: 'prose' }>, Extract<Block, { kind: 'prose' }>];
  assert.equal(heading.text, 'Jesus and Nicodemus');
  assert.deepEqual(first.spans.map((s) => [s.verse, s.n]), [['1', '1'], ['2', '2']], 'verse 2 has no `p`: it goes on in the paragraph of verse 1');
  assert.equal(first.gap, 'none', 'under a heading a block has no space of its own: the heading has it');
  assert.deepEqual(second.spans.map((s) => [s.verse, s.n]), [['15-16', '15-16'], ['17', '17']], 'a joined label is the number of its verse');
  assert.equal(second.gap, 'paragraph');
});

check('a heading is a block of its own and whatever follows starts a new block; a chapter with no verses has no blocks; a verse with no words draws nothing (a few verses of Sirach are omitted)', () => {
  const all = buildBlocks({ c: 1, verses: [v('1', 'One.', { h: 'First' }), v('2', 'Two.', { p: true, h: 'Second' }), v('3', 'Three.')] });
  assert.deepEqual(kinds(all), ['heading', 'prose', 'heading', 'prose']);
  assert.deepEqual(buildBlocks({ c: 1, verses: [] }), []);
  const sir = buildBlocks(chapter('SIR', 11));
  assert.deepEqual(sir.flatMap((b) => (b.kind === 'poem' ? b.lines.flatMap((l) => l.parts.map((p) => p.verse)) : [])), ['14', '17'], 'the verse "15-16" has no words and is not drawn');
  assert.deepEqual(verseLabels(chapter('SIR', 11)), ['14', '17']);
  assert.equal(findVerse(chapter('SIR', 11), '15-16'), undefined, 'and it cannot be chosen, linked to or bookmarked');
  assert.equal(findVerse(chapter('SIR', 11), '14')!.n, '14');
  const lone = buildBlocks({ c: 1, verses: [v('1', '   '), v('2', 'Words.')] });
  assert.equal(lone.length, 1);
});

check('a "\\n" inside a verse of prose is a new paragraph and the number is not said again; a break `b` or a poem above also starts a new block; `p` after poetry starts a paragraph of prose (without it the verse goes on in the last line)', () => {
  const split = buildBlocks({ c: 1, verses: [v('1', 'First part.\nSecond part, a new paragraph.', { p: true }), v('2', 'And on.')] });
  assert.deepEqual(kinds(split), ['prose', 'prose']);
  const [a, b] = split as Array<Extract<Block, { kind: 'prose' }>>;
  assert.deepEqual(a.spans.map((s) => [s.verse, s.n]), [['1', '1']]);
  assert.deepEqual(b.spans.map((s) => [s.verse, s.n]), [['1', null], ['2', '2']], 'the second part has no number; verse 2 goes on after it');
  assert.equal(b.gap, 'paragraph');
  const mixed = buildBlocks({ c: 1, verses: [v('1', 'Prose.', { p: true }), v('2', '\tA poem line.\n\t\tIts second.'), v('3', 'Prose again.', { p: true }), v('4', 'With a break.', { b: true })] });
  assert.deepEqual(kinds(mixed), ['prose', 'poem', 'prose', 'prose']);
  assert.equal(mixed[1].kind === 'poem' && mixed[1].gap, 'paragraph');
  assert.equal(mixed[3].kind === 'prose' && mixed[3].gap, 'stanza', 'a blank line before a verse of prose is a bigger gap than a paragraph');
  const poem = buildBlocks({ c: 1, verses: [v('1', '\tOne.'), v('2', '\tTwo.', { p: true }), v('3', '\tThree.')] });
  assert.deepEqual(kinds(poem), ['poem', 'poem'], '`p` on a verse of poetry begins a stanza too');
});

check('the tabs at the start of a line are its indent, three at the most; a line with none after a "\\n" is a paragraph of prose, also under poetry; other tabs inside a line are blanks', () => {
  const lines = (t: string) => {
    const [b] = buildBlocks({ c: 1, verses: [v('1', t)] });
    return b.kind === 'poem' ? b.lines.map((l) => [l.indent, l.parts[0].text]) : b.kind === 'prose' ? b.spans.map((s) => [0, s.text]) : [];
  };
  assert.deepEqual(lines('\tA\n\t\tB\n\t\t\tC\n\t\t\t\tD'), [[1, 'A'], [2, 'B'], [3, 'C'], [3, 'D']]);
  assert.deepEqual(lines('Plain words.'), [[0, 'Plain words.']]);
  assert.deepEqual(lines('\t  A\tB '), [[1, 'A B']]);
  const tail = buildBlocks({ c: 1, verses: [v('1', '\tA poem line.\n\t\tIts second.\nsays the LORD.')] });
  assert.deepEqual(kinds(tail), ['poem', 'prose'], 'a line with no tab after poetry in the same verse is a new paragraph of prose (John 8:11 is the same in prose)');
  assert.equal(tail[1].kind === 'prose' && tail[1].gap, 'paragraph');
  assert.deepEqual(tail[1].kind === 'prose' && tail[1].spans.map((s) => [s.verse, s.n, s.text]), [['1', null, 'says the LORD.']], 'and the number of the verse is not said again');
  for (const b of tail) if (b.kind === 'poem') assert.ok(b.lines.every((l) => l.indent >= 1), 'a line of poetry always has a tab: a line at the margin is prose');
});

check('a verse with neither `p` nor a tab goes on in the line before it, also a line of poetry that two verses share (Psalm 55:2-3, 66:13-14): one line, a part for each verse, the second number in the middle of it', () => {
  const shared = buildBlocks({
    c: 55,
    verses: [
      v('1', '\tListen to my prayer, God.\n\t\tDon’t hide yourself.'),
      v('2', '\tAttend to me, and answer me.\n\t\tI am restless in my complaint,\n\t\tand moan'),
      v('3', 'because of the voice of the enemy,\n\t\tbecause of the oppression of the wicked.\n\tFor they bring suffering on me.'),
      v('4', '\tMy heart is severely pained within me.'),
    ],
  });
  assert.deepEqual(kinds(shared), ['poem'], 'one stanza: no paragraph of prose in the middle of a psalm');
  const lines = (shared[0] as Extract<Block, { kind: 'poem' }>).lines;
  assert.deepEqual(lines.map((l) => [l.indent, l.parts.map((p) => [p.verse, p.n, p.text])]), [
    [1, [['1', '1', 'Listen to my prayer, God.']]],
    [2, [['1', null, 'Don’t hide yourself.']]],
    [1, [['2', '2', 'Attend to me, and answer me.']]],
    [2, [['2', null, 'I am restless in my complaint,']]],
    [2, [['2', null, 'and moan'], ['3', '3', 'because of the voice of the enemy,']]],
    [2, [['3', null, 'because of the oppression of the wicked.']]],
    [1, [['3', null, 'For they bring suffering on me.']]],
    [1, [['4', '4', 'My heart is severely pained within me.']]],
  ]);
  assert.deepEqual(blocksOfVerse(shared, '3'), [0], 'the verse is in the block');
  assert.deepEqual(locateVerse(shared, '3'), { block: 0, at: 4 / 8 }, 'and its first words are in the fifth line of eight');
  assert.deepEqual(locateVerse(shared, '2'), { block: 0, at: 2 / 8 });
  // in prose it is the usual case: the next words of the paragraph
  const prose = buildBlocks({ c: 1, verses: [v('1', 'One.', { p: true }), v('2', 'Two.')] });
  assert.deepEqual(kinds(prose), ['prose']);
  // `p` or `b` on such a verse starts something new; a heading too
  assert.deepEqual(kinds(buildBlocks({ c: 1, verses: [v('1', '\tA.'), v('2', 'B.', { p: true })] })), ['poem', 'prose']);
  assert.deepEqual(kinds(buildBlocks({ c: 1, verses: [v('1', '\tA.'), v('2', 'B.', { b: true })] })), ['poem', 'prose']);
  assert.deepEqual(kinds(buildBlocks({ c: 1, verses: [v('1', '\tA.'), v('2', 'B.', { h: 'Head' })] })), ['poem', 'heading', 'prose']);
  // a verse of poetry after prose is a poem of its own
  assert.deepEqual(kinds(buildBlocks({ c: 1, verses: [v('1', 'Prose.', { p: true }), v('2', '\tA line.')] })), ['prose', 'poem']);
});

check('a blank line inside a verse is a blank line (a stanza gap) for the lines after it, in poetry and in prose; a verse with no words that begins a paragraph hands that on (Acts 8:37)', () => {
  const stanzas = buildBlocks({ c: 1, verses: [v('1', '\tA.\n\t\tB.\n\n\tC.\n\t\tD.')] });
  assert.deepEqual(kinds(stanzas), ['poem', 'poem']);
  assert.deepEqual(stanzas.map((b) => b.kind === 'poem' && b.gap), ['none', 'stanza'], 'the blank line is the gap of the second stanza');
  assert.deepEqual(stanzas.map((b) => b.kind === 'poem' && b.lines.map((l) => l.parts[0].n)), [['1', null], [null, null]], 'the number is not said again');
  const mixed = buildBlocks({ c: 1, verses: [v('1', '\tA.\n\n\tB.\n\nTail.')] });
  assert.deepEqual(kinds(mixed), ['poem', 'poem', 'prose']);
  assert.deepEqual(mixed.map((b) => b.kind !== 'heading' && b.gap), ['none', 'stanza', 'stanza']);
  const prose = buildBlocks({ c: 1, verses: [v('1', 'First.\n\nSecond.\nThird.', { p: true })] });
  assert.deepEqual(prose.map((b) => b.kind !== 'heading' && b.gap), ['none', 'stanza', 'paragraph'], 'a blank line is more than a paragraph; a "\\n" alone is a paragraph');
  assert.deepEqual(kinds(buildBlocks({ c: 1, verses: [v('1', '\n\nWords.')] })), ['prose'], 'blank lines at the start draw nothing of their own');
  // an empty verse that begins a paragraph or has a blank line above it: the next verse does
  const carried = buildBlocks({ c: 8, verses: [v('36', 'The eunuch said, “Behold, here is water.”', { p: true }), v('37', '', { p: true }), v('38', 'He commanded the chariot to stand still.')] });
  assert.deepEqual(kinds(carried), ['prose', 'prose'], 'verse 38 begins a paragraph because verse 37, which draws nothing, did');
  assert.deepEqual(carried.map((b) => b.kind === 'prose' && b.spans.map((s) => s.verse)), [['36'], ['38']]);
  assert.deepEqual(kinds(buildBlocks({ c: 1, verses: [v('1', 'One.', { p: true }), v('2', ''), v('3', 'Three.')] })), ['prose'], 'an empty verse with nothing on it changes nothing');
  assert.equal(buildBlocks({ c: 1, verses: [v('1', '\tA.'), v('2', '', { b: true }), v('3', '\tB.')] })[1].kind === 'poem', true);
  assert.deepEqual(buildBlocks({ c: 1, verses: [v('1', '\tA.'), v('2', '', { b: true }), v('3', '\tB.')] }).map((b) => b.kind !== 'heading' && b.gap), ['none', 'stanza'], 'the blank line before an empty verse goes to the verse after it');
  // `b` and `h` on one verse: the space first, the heading under it (the heading has its own space above it)
  const both = buildBlocks({ c: 6, verses: [v('3', '\tFirst.'), v('4', '\tSecond.', { b: true, h: 'Beloved' })] });
  assert.deepEqual(kinds(both), ['poem', 'heading', 'poem']);
  assert.equal(both[2].kind === 'poem' && both[2].gap, 'none', 'under a heading a block has no space of its own');
});

check('where a verse is: the block that holds it and how far into it, and which blocks hold it; for a verse that is not drawn, nowhere', () => {
  const blocks = buildBlocks(chapter('JHN', 3));
  assert.deepEqual(blocksOfVerse(blocks, '2'), [1]);
  assert.deepEqual(blocksOfVerse(blocks, '15-16'), [2]);
  assert.deepEqual(blocksOfVerse(blocks, '99'), []);
  assert.equal(locateVerse(blocks, '1')!.block, 1);
  assert.equal(locateVerse(blocks, '1')!.at, 0);
  const mid = locateVerse(blocks, '2')!;
  assert.equal(mid.block, 1);
  assert.ok(mid.at > 0.3 && mid.at < 0.7, `verse 2 is about halfway into its paragraph (${mid.at})`);
  assert.equal(locateVerse(blocks, '99'), null);
  const psalm = buildBlocks(chapter('PSA', 121));
  assert.deepEqual(locateVerse(psalm, '3'), { block: 1, at: 0 });
  assert.deepEqual(locateVerse(psalm, '2'), { block: 0, at: 0.5 }, 'the third line of four');
  assert.deepEqual(blocksOfVerse(psalm, '1'), [0]);
  assert.equal(labelOfNumber(chapter('JHN', 3), 15), '15-16', 'a link to verse 15 opens the printed verse that holds it');
  assert.equal(labelOfNumber(chapter('JHN', 3), 16), '15-16');
  assert.equal(labelOfNumber(chapter('JHN', 3), 2), '2');
  assert.equal(labelOfNumber(chapter('JHN', 3), 40), null);
  assert.equal(labelOfNumber(chapter('SIR', 11), 15), null, 'a verse that is omitted is not one a link can go to');
});

check('the words of a verse as one line, and the number as raised digits (a dash for a joined label)', () => {
  assert.equal(verseText(TEXT.PSA.chapters[0].verses[0]), 'I will lift up my eyes to the hills. Where does my help come from?');
  assert.equal(verseText(v('1', '\n  One.\n\n\t\tTwo. \n')), 'One. Two.');
  assert.equal(verseText(v('1', '')), '');
  assert.equal(superscript('1'), '¹');
  assert.equal(superscript('23'), '²³');
  assert.equal(superscript('119'), '¹¹⁹');
  assert.equal(superscript('176'), '¹⁷⁶');
  assert.equal(superscript('15-16'), '¹⁵–¹⁶');
  assert.equal(superscript('0'), '⁰');
  assert.equal(superscript('1a'), '1a', 'a label that is not made of digits is left as it is');
});

/* ================================================================ the whole text, as the reader draws it, and the breaks of the lines of poetry (wrap.ts) */

const NBSP = String.fromCharCode(0xa0);
const ASSETS = join(root, 'assets', 'bible', 'webc');
const HAVE_TEXT = existsSync(join(ASSETS, 'PSA.json')); // the files of the text are there (a partial checkout has none)
const bookText = (code: string): BookText => JSON.parse(readFileSync(join(ASSETS, `${code}.json`), 'utf8')) as BookText;

check('the table of letter widths of the words is the font file: every character of the text of the Bible, read again from Inter Regular, to 0.0006 em', () => {
  const file = join(root, 'node_modules', '@expo-google-fonts', 'inter', '400Regular', 'Inter_400Regular.ttf');
  if (existsSync(file)) {
    const real = advances(file);
    for (const [ch, w] of Object.entries(INTER_400)) assert.ok(Math.abs((real(ch) ?? NaN) - w) <= 0.0006, `"${ch}": the table says ${w}, the font ${real(ch)}`);
  }
  if (HAVE_TEXT) {
    const used = new Set<string>();
    for (const b of BIBLE_BOOKS) for (const c of bookText(b.code).chapters) for (const verse of c.verses) for (const ch of verse.t.replace(/[\t\n]/g, '')) used.add(ch);
    for (const ch of used) assert.ok(ch in INTER_400, `the text has the character ${JSON.stringify(ch)} (U+${ch.codePointAt(0)!.toString(16)}) and the table has no width for it`);
  }
  assert.equal(NUMBER_ADVANCE, 0.6);
  assert.ok(THIN_SPACE_EM > 0.15 && THIN_SPACE_EM < 0.2);
});

check('a line is cut at spaces only, the first part with its own room and the others with theirs, a word wider than the room stands alone, and a no-break space is no place to cut', () => {
  const text = 'He will not allow your foot to be moved.';
  const em = textWidth(text);
  assert.deepEqual(wrapWords(text, em * 2, em * 2), [text], 'room enough: one line');
  const cut = wrapWords(text, 14, 14);
  assert.ok(cut.length >= 2, 'it has to be cut');
  assert.equal(cut.join(' '), text, 'nothing is lost, nothing is cut inside a word');
  for (const line of cut) assert.ok(textWidth(line) * WRAP_SAFETY <= 14 + 1e-9, `"${line}" is ${textWidth(line)} em`);
  assert.deepEqual(wrapWords('Internationalization is long', 3, 3), ['Internationalization', 'is', 'long'], 'a word that does not fit stands alone');
  assert.deepEqual(wrapWords('one two', 100, 100), ['one two']);
  assert.deepEqual(wrapWords('', 10, 10), []);
  assert.deepEqual(wrapWords('   ', 10, 10), []);
  assert.deepEqual(wrapWords(`a${NBSP}b c`, 2, 2), [`a${NBSP}b`, 'c'], 'the no-break space holds "a" and "b" together');
  const first = wrapWords(text, 8, 20);
  assert.ok(textWidth(first[0]) < textWidth(first[1] ?? ''), 'the first part has less room than the rest here, so it is the shorter');
  assert.equal(textWidth(' '), INTER_400[' ']);
});

const SIZES = { size: 19, numberSize: 17, numberOf: superscript };
const draw = (lines: PoemLine[], width: number, scale = 1) => wrapPoem(lines, { ...SIZES, width, scale });
const lineOf = (verse: string, n: string | null, indent: 1 | 2 | 3, text: string): PoemLine => ({ indent, parts: [{ verse, n, text }] });
/** The words of a drawn row or of a line, as one text. */
const flat = (l: { parts: Array<{ text: string }> }): string => l.parts.map((p) => p.text).join(' ');
/** The room the number of a verse takes in a row, em of the body text. */
const numberRoom = (n: string | null): number => (n === null ? 0 : (superscript(n).length * 0.6 * 17) / 19 + THIN_SPACE_EM);

check('a long line of poetry goes on in the line under it one em further in; a line that fits is as it was; the number of a verse stays on the first line of it and takes room there', () => {
  const fits = lineOf('1', '1', 1, 'I will lift up my eyes');
  const long = lineOf('1', null, 2, 'Where does my help come from, who made heaven and earth and everything in them');
  const wide = draw([fits, long], 1000);
  assert.deepEqual(wide, [{ indent: 1, cont: false, parts: fits.parts }, { indent: 2, cont: false, parts: long.parts }], 'on a page that is wide enough nothing is cut');
  const narrow = draw([fits, long], 358);
  assert.equal(flat(narrow[0]), flat(fits));
  assert.ok(narrow.length > 2, 'the long line is cut');
  assert.deepEqual(narrow.slice(1).map((l) => l.indent), narrow.slice(1).map((_, k) => (k === 0 ? 2 : 3)), 'the first part of the long line is at its own indent (2), the rest one em further (3)');
  assert.deepEqual(narrow.map((l) => l.cont), [false, false, ...narrow.slice(2).map(() => true)], 'the rows after the first of a line are marked');
  assert.equal(narrow.slice(1).map(flat).join(' '), flat(long));
  assert.ok(narrow.every((l) => l.parts.length === 1 && l.parts[0].verse === '1'));
  assert.deepEqual(narrow.map((l) => l.parts[0].n), ['1', ...narrow.slice(1).map(() => null)], 'the number is on the first line only');
  // a number of three digits and a joined label take more room on the first line
  const text = 'Your word is a lamp to my feet and a light for my path in the dark night';
  const five = draw([lineOf('5', '5', 1, text)], 358);
  const hundred = draw([lineOf('105', '105', 1, text)], 358);
  assert.ok(flat(five[0]).length >= flat(hundred[0]).length, 'a longer number leaves less room for the words');
  assert.deepEqual(draw([], 358), []);
  assert.deepEqual(draw([lineOf('1', '1', 1, '')], 358), [], 'a line with no words draws nothing');
});

check('a line that two verses share is cut like any other, with the second number in the middle of it: it takes room there, appears once, and the parts keep their verses', () => {
  const shared: PoemLine = { indent: 2, parts: [{ verse: '2', n: null, text: 'and moan' }, { verse: '3', n: '3', text: 'because of the voice of the enemy,' }] };
  assert.deepEqual(draw([shared], 1000), [{ indent: 2, cont: false, parts: shared.parts }], 'on a wide page the two parts are one row');
  let cut = 0;
  for (let width = 120; width <= 700; width += 3) {
    const rows = draw([shared], width);
    assert.equal(rows.flatMap((r) => r.parts).map((p) => p.text).join(' '), 'and moan because of the voice of the enemy,', `${width}: nothing is lost`);
    assert.deepEqual(rows.flatMap((r) => r.parts.map((p) => p.n)).filter((n) => n !== null), ['3'], `${width}: the number of verse 3 is said once`);
    assert.deepEqual(rows.map((r) => r.indent), rows.map((_, k) => (k === 0 ? 2 : 2 + HANG_EM)), `${width}: the rows after the first hang one em in`);
    // the number is on the row the words of verse 3 begin in, and on that row only
    const start = rows.findIndex((r) => r.parts.some((p) => p.verse === '3'));
    assert.ok(rows[start].parts.find((p) => p.verse === '3')!.n === '3' && rows.slice(start + 1).every((r) => r.parts.every((p) => p.n === null)), `${width}: the number is where the verse begins`);
    // every row fits: the words, the space between the parts and the number, unless it is one word
    rows.forEach((r, k) => {
      const used = textWidth(flat(r)) * WRAP_SAFETY + r.parts.reduce((sum, p) => sum + numberRoom(p.n), 0);
      const room = width / 19 - r.indent;
      assert.ok(flat(r).split(' ').length === 1 || used <= room + 1e-9, `${width} row ${k}: "${flat(r)}" needs ${used.toFixed(2)} em of ${room.toFixed(2)}`);
    });
    if (rows.length > 1) cut += 1;
  }
  assert.ok(cut > 50, 'the line is cut at many of the widths tried');
  // the number in the middle takes room: with it a row holds fewer words than without it, at some width
  const taken = [...Array(200).keys()].some((k) => {
    const width = 120 + k * 3;
    const withNumber = draw([shared], width);
    const without = draw([{ indent: 2, parts: shared.parts.map((p) => ({ ...p, n: null })) }], width);
    return flat(withNumber[0]).length < flat(without[0]).length;
  });
  assert.ok(taken, 'the number took the room of a word at some width');
});

check('in every line of poetry of the whole Bible, at 320, 390, 430 and 768 wide and at text sizes 1 and 1.6, no row is wider than the page by the real widths of the font, none breaks a word, and together the rows are the line', () => {
  const file = join(root, 'node_modules', '@expo-google-fonts', 'inter', '400Regular', 'Inter_400Regular.ttf');
  if (!existsSync(file) || !HAVE_TEXT) return;
  const real = advances(file);
  const cache = new Map<string, number>();
  const realInter = (t: string): number => [...t].reduce((sum, ch) => {
    let w = cache.get(ch);
    if (w === undefined) { w = real(ch) ?? 0.7; cache.set(ch, w); }
    return sum + w;
  }, 0);
  let lines = 0;
  let cut = 0;
  let shared = 0;
  for (const width of [320, 390, 430, 768]) {
    for (const scale of [1, 1.6]) {
      const page = (width - 2 * 16) / (19 * scale); // em of the body text across the page
      for (const b of BIBLE_BOOKS) {
        for (const c of bookText(b.code).chapters) {
          for (const block of buildBlocks(c)) {
            if (block.kind !== 'poem') continue;
            const drawn = draw(block.lines, width - 2 * 16, scale); // the page is the screen less its two margins
            let at = 0;
            for (const line of block.lines) {
              const rows: typeof drawn = [];
              while (at < drawn.length && (rows.length === 0 || drawn[at].cont)) rows.push(drawn[at++]);
              assert.ok(rows.length >= 1, `${b.code} ${c.c}: a line is lost`);
              assert.equal(rows.map(flat).join(' '), flat(line), `${b.code} ${c.c}: the rows are not the line`);
              assert.equal(rows[0].indent, line.indent);
              assert.deepEqual(rows.flatMap((r) => r.parts.map((p) => p.n)).filter((n) => n !== null), line.parts.map((p) => p.n).filter((n) => n !== null), `${b.code} ${c.c}: each number of the line is said once`);
              assert.ok(rows.slice(1).every((r) => r.indent === line.indent + HANG_EM && r.cont), `${b.code} ${c.c}: the rows after the first go in one em further`);
              assert.ok(rows.every((r) => r.parts.every((p) => line.parts.some((q) => q.verse === p.verse))), `${b.code} ${c.c}: the verses of the rows are the verses of the line`);
              lines += 1;
              if (rows.length > 1) cut += 1;
              if (line.parts.length > 1) shared += 1;
              rows.forEach((r) => {
                const used = realInter(flat(r)) + r.parts.reduce((sum, p) => sum + numberRoom(p.n), 0);
                const alone = flat(r).split(' ').length === 1; // a word that is wider than the page cannot be helped
                assert.ok(alone || used <= page - r.indent, `${b.code} ${c.c}:${r.parts[0].verse} at ${width}/${scale}: "${flat(r)}" is ${used.toFixed(2)} em in ${(page - r.indent).toFixed(2)}`);
              });
            }
            assert.equal(at, drawn.length, `${b.code} ${c.c}: rows left over`);
          }
        }
      }
    }
  }
  assert.ok(lines > 100000, `${lines} lines were checked`);
  assert.ok(cut > 10000, `${cut} of them were cut`);
  assert.ok(shared >= 8 * 10, `${shared} lines that two verses share were checked too (each of the lines at each of the eight page sizes)`);
});

// The verses that go on in the line of poetry before them, in the text we have (tools/bible/README.md, "How a reader draws it"): a verse with neither `p` nor a tab.
const SHARED_LINES = [
  'ACT 15:17', 'ECC 10:3', 'ECC 10:4', 'EZR 10:19', 'EZR 10:32', 'EZR 10:35', 'EZR 10:36', 'EZR 10:37', 'EZR 10:38', 'EZR 10:39', 'EZR 10:40', 'EZR 10:41', 'EZR 10:42',
  'ISA 31:7', 'JER 2:24', 'JOL 3:10', 'MIC 4:5', 'PSA 55:3', 'PSA 66:14',
];

check('every chapter of the whole Bible, as the reader draws it: each verse that has words is drawn once with its number, none is lost or doubled, the words are the words, headings are the headings, and the first block has nothing above it', () => {
  if (!HAVE_TEXT) return;
  let chapters = 0;
  let verses = 0;
  const joined: string[] = [];
  const empty: string[] = [];
  for (const b of BIBLE_BOOKS) {
    const text = bookText(b.code);
    assert.equal(text.chapters.length, b.chapters, `${b.code}: the chapters of the file are the chapters of the list`);
    text.chapters.forEach((c, i) => assert.equal(c.c, i + 1, `${b.code}: the chapters are numbered one after the other`));
    for (const c of text.chapters) {
      const blocks = buildBlocks(c);
      chapters += 1;
      const wanted = c.verses.filter((x) => /\S/.test(x.t));
      verses += wanted.length;
      const numbers: string[] = [];
      const words: string[] = [];
      let headings = 0;
      for (const block of blocks) {
        if (block.kind === 'heading') { headings += 1; assert.ok(block.text.length > 0); continue; }
        if (block.kind === 'poem') {
          assert.ok(block.lines.every((l) => l.indent >= 1 && l.indent <= 3), `${b.code} ${c.c}: a line of poetry has one to three tabs; a line at the margin is prose`);
          for (const l of block.lines) for (const p of l.parts.slice(1)) joined.push(`${b.code} ${c.c}:${p.verse}`);
        }
        const pieces = block.kind === 'prose' ? block.spans : block.lines.flatMap((l) => l.parts);
        assert.ok(pieces.length > 0, `${b.code} ${c.c}: a block with nothing in it`);
        for (const p of pieces) {
          if (p.n !== null) numbers.push(p.n);
          assert.ok(p.text.length > 0 && p.text === p.text.trim(), `${b.code} ${c.c}: a piece of words that is empty or has blanks around it`);
          words.push(p.text);
        }
      }
      assert.deepEqual(numbers, wanted.map((x) => x.n), `${b.code} ${c.c}: every verse with words has its number once, in order`);
      assert.equal(words.join(' '), wanted.map((x) => verseText(x)).join(' '), `${b.code} ${c.c}: the words are the words`);
      assert.equal(headings, c.verses.filter((x) => x.h).length, `${b.code} ${c.c}: the headings are the headings`);
      assert.deepEqual(verseLabels(c), wanted.map((x) => x.n));
      if (blocks.length > 0 && blocks[0].kind !== 'heading') assert.equal(blocks[0].gap, 'none');
      for (const x of wanted) assert.ok(blocksOfVerse(blocks, x.n).length >= 1 && locateVerse(blocks, x.n) !== null, `${b.code} ${c.c}:${x.n} is somewhere`);
      for (const x of c.verses.filter((y) => !/\S/.test(y.t))) {
        // a verse with no words draws nothing, has no number, and cannot be chosen, linked to or bookmarked; a link to it falls back to the start of the chapter
        empty.push(`${b.code} ${c.c}:${x.n}`);
        assert.deepEqual(blocksOfVerse(blocks, x.n), [], `${b.code} ${c.c}:${x.n} is drawn`);
        assert.equal(locateVerse(blocks, x.n), null, `${b.code} ${c.c}:${x.n} has a place`);
        assert.equal(findVerse(c, x.n), undefined, `${b.code} ${c.c}:${x.n} can be found`);
        const [lo, hi] = [parseInt(x.n, 10), parseInt(x.n.split('-').pop()!, 10)];
        for (let k = lo; k <= hi; k++) assert.equal(labelOfNumber(c, k), null, `${b.code} ${c.c}:${k} is a place a link can go to`);
      }
    }
  }
  assert.equal(chapters, 1328);
  assert.ok(verses > 35000 && verses <= 35408, `${verses} verses have words`);
  assert.equal(empty.length, 29, `29 verses have no words: ${empty.join(', ')}`);
  assert.deepEqual([...joined].sort(), [...SHARED_LINES].sort(), 'the verses that go on in the line of poetry before them are the ones the text has: Psalm 55:3 and 66:14 among them');
});

check('the shapes the text of the Bible has, as the reader draws them: Psalm 55:2-3 and 66:13-14 share a line; John 8:11 and Esther 1:1 (Greek) have paragraphs inside a verse; Song of Songs 6:4 and 8:6 have a space and a heading; Acts 8:38 follows a verse that begins a paragraph and draws nothing', () => {
  if (!HAVE_TEXT) return;
  const blocksOf = (code: string, chapterNo: number) => buildBlocks(bookText(code).chapters[chapterNo - 1]);
  for (const [code, ch, from, to] of [['PSA', 55, '2', '3'], ['PSA', 66, '13', '14']] as const) {
    const blocks = blocksOf(code, ch);
    assert.ok(blocks.every((b) => b.kind === 'poem'), `${code} ${ch}: a psalm of poetry only: no paragraph of prose is made in the middle of it`);
    const lines = blocks.flatMap((b) => (b.kind === 'poem' ? b.lines : []));
    const at = lines.findIndex((l) => l.parts.length > 1);
    assert.ok(at > 0, `${code} ${ch} has a line that two verses share`);
    assert.deepEqual(lines[at].parts.map((p) => p.verse), [from, to], `${code} ${ch}: the line is shared by ${from} and ${to}`);
    assert.equal(lines[at].parts[0].n, null, 'the line is the last line of the verse before, so it has no number at its start');
    assert.equal(lines[at].parts[1].n, to, 'the number of the second verse is in the middle of the line');
    assert.equal(lines.filter((l) => l.parts.length > 1).length, 1, 'and it is the only one');
  }
  // paragraphs inside a verse
  const john = blocksOf('JHN', 8);
  const eleven = john.filter((b) => b.kind === 'prose' && b.spans.some((s) => s.verse === '11'));
  assert.ok(eleven.length >= 2, 'John 8:11 is in more than one paragraph');
  assert.equal(john.flatMap((b) => (b.kind === 'prose' ? b.spans : [])).filter((s) => s.verse === '11' && s.n === '11').length, 1, 'and its number is said once');
  assert.ok(blocksOf('ESG', 1).filter((b) => b.kind === 'prose').length >= 4, 'the addition at the start of Esther is four paragraphs');
  // a space and a heading on one verse
  for (const [code, ch, label] of [['SNG', 6, '4'], ['SNG', 8, '6']] as const) {
    const blocks = blocksOf(code, ch);
    const i = blocks.findIndex((b) => b.kind === 'poem' && b.lines.some((l) => l.parts[0].verse === label && l.parts[0].n === label));
    assert.ok(i > 1 && blocks[i - 1].kind === 'heading', `${code} ${ch}:${label}: the heading is directly above the verse`);
    assert.equal(blocks[i].kind !== 'heading' && blocks[i].gap, 'none', 'the heading has the space above it, the verse none of its own');
    assert.ok(blocks[i - 2].kind !== 'heading', 'and something is above the heading');
  }
  // Acts 8:37 draws nothing, and Acts 8:38 starts a paragraph in its place
  const acts = blocksOf('ACT', 8);
  const at36 = acts.findIndex((b) => b.kind === 'prose' && b.spans.some((s) => s.verse === '36'));
  const at38 = acts.findIndex((b) => b.kind === 'prose' && b.spans.some((s) => s.verse === '38'));
  assert.ok(at36 >= 0 && at38 > at36, 'Acts 8:38 is in a paragraph after the one of 8:36');
  assert.equal(acts[at38].kind === 'prose' && acts[at38].spans[0].verse, '38', 'and it starts it');
});

/* ================================================================ the order of a straight read and the addresses (order.ts) */

check('Previous and Next cross the books and the three parts: Malachi 4 to Tobit 1, 2 Maccabees 15 to Matthew 1, and back; nothing before Genesis 1 and nothing after Revelation 22', () => {
  assert.deepEqual(nextPlace(at('MAL', 4)), at('TOB', 1));
  assert.deepEqual(previousPlace(at('TOB', 1)), at('MAL', 4));
  assert.deepEqual(nextPlace(at('2MA', 15)), at('MAT', 1));
  assert.deepEqual(previousPlace(at('MAT', 1)), at('2MA', 15));
  assert.deepEqual(nextPlace(at('GEN', 50)), at('EXO', 1));
  assert.deepEqual(previousPlace(at('EXO', 1)), at('GEN', 50));
  assert.deepEqual(nextPlace(at('PSA', 150)), at('PRO', 1));
  assert.deepEqual(nextPlace(at('PSA', 121)), at('PSA', 122));
  assert.deepEqual(previousPlace(at('PSA', 121)), at('PSA', 120));
  assert.deepEqual(nextPlace(at('1CO', 16)), at('2CO', 1));
  assert.deepEqual(previousPlace(at('2CO', 1)), at('1CO', 16));
  assert.deepEqual(nextPlace(at('JUD', 1)), at('REV', 1), 'a book of one chapter is stepped over in one step');
  assert.deepEqual(previousPlace(at('REV', 1)), at('JUD', 1));
  assert.equal(previousPlace(at('GEN', 1)), null);
  assert.equal(nextPlace(at('REV', 22)), null);
  assert.deepEqual(nextPlace(at('GEN', 1)), at('GEN', 2));
  assert.deepEqual(previousPlace(at('REV', 22)), at('REV', 21));
});

check('a straight read of all 73 books: 1,328 chapters, each once, in the order of the list, forward and back, and the same at every step', () => {
  const forward: Place[] = [];
  for (let p: Place | null = at('GEN', 1); p; p = nextPlace(p)) {
    forward.push(p);
    assert.ok(forward.length <= 1328, 'it ends');
  }
  assert.equal(forward.length, 1328);
  assert.deepEqual(forward[0], at('GEN', 1));
  assert.deepEqual(forward[forward.length - 1], at('REV', 22));
  assert.equal(new Set(forward.map(placeKey)).size, 1328, 'no chapter twice');
  // in the order of the list: every book's chapters, one after the other
  const expected: Place[] = BIBLE_BOOKS.flatMap((b) => Array.from({ length: b.chapters }, (_, i) => at(b.code, i + 1)));
  assert.deepEqual(forward, expected);
  const backward: Place[] = [];
  for (let p: Place | null = at('REV', 22); p; p = previousPlace(p)) backward.push(p);
  assert.deepEqual(backward, [...forward].reverse());
  for (const p of forward) {
    const nx = nextPlace(p);
    if (nx) assert.deepEqual(previousPlace(nx), p, `${placeKey(p)} then back`);
  }
});

check('the words of the buttons name the place they go to: "Previous: Psalm 120", "Next: Psalm 122", "Next: Tobit 1"; none where there is none; the title of a chapter', () => {
  assert.equal(previousLabel(at('PSA', 121)), 'Previous: Psalm 120');
  assert.equal(nextLabel(at('PSA', 121)), 'Next: Psalm 122');
  assert.equal(nextLabel(at('MAL', 4)), 'Next: Tobit 1');
  assert.equal(previousLabel(at('TOB', 1)), 'Previous: Malachi 4');
  assert.equal(nextLabel(at('2MA', 15)), 'Next: Matthew 1');
  assert.equal(previousLabel(at('2CO', 1)), 'Previous: 1 Corinthians 16');
  assert.equal(nextLabel(at('JHN', 3)), 'Next: John 4');
  assert.equal(nextLabel(at('SNG', 8)), 'Next: Isaiah 1');
  assert.equal(previousLabel(at('GEN', 1)), null, 'disabled at Genesis 1');
  assert.equal(nextLabel(at('REV', 22)), null, 'disabled at Revelation 22');
  assert.equal(previousLabel(at('XXX', 1)), null);
  assert.equal(chapterTitle(at('PSA', 121)), 'Psalm 121');
  assert.equal(chapterTitle(at('JHN', 3)), 'Chapter 3');
  assert.equal(chapterTitle(at('DAG', 13)), 'Chapter 13');
});

check('a place that is no chapter of the Bible is none: the book must be in the list and the chapter from 1 to its last; never a throw', () => {
  for (const good of [at('GEN', 1), at('PSA', 150), at('DAG', 14), at('ESG', 10), at('JUD', 1), at('1SA', 31)]) assert.equal(isPlace(good), true, placeKey(good));
  for (const bad of [at('PSA', 0), at('PSA', 151), at('PSA', 1.5), at('PSA', -1), at('XXX', 1), at('psa', 1), at('JUD', 2), at('DAG', 15), null, undefined, 'PSA', 7, [], {}, { code: 'PSA' }, { chapter: 1 }, { code: 1, chapter: 1 }, { code: 'PSA', chapter: '1' }]) {
    assert.equal(isPlace(bad), false, JSON.stringify(bad));
  }
  assert.equal(previousPlace(at('XXX', 3)), null);
  assert.equal(nextPlace(at('PSA', 151)), null);
});

check('the addresses: /library/bible/PSA for the chapters, /library/bible/PSA/121 for a chapter and ?v=3 for a verse; read back from the parts of an address, in any case, and never a throw', () => {
  assert.equal(bookHref('PSA'), '/library/bible/PSA');
  assert.equal(readerHref({ code: 'PSA', chapter: 121 }), '/library/bible/PSA/121');
  assert.equal(readerHref({ code: 'PSA', chapter: 121, from: 3 }), '/library/bible/PSA/121?v=3');
  assert.equal(readerHref({ code: 'PSA', chapter: 121, from: 1, to: 4 }), '/library/bible/PSA/121?v=1', 'a run opens at its first verse');
  assert.equal(readerHref({ code: '1CO', chapter: 13 }), '/library/bible/1CO/13');
  assert.deepEqual(placeFromParams('PSA', '121', '3'), { place: at('PSA', 121), verse: 3 });
  assert.deepEqual(placeFromParams('psa', '121'), { place: at('PSA', 121), verse: null }, 'a code in small letters is the same book');
  assert.deepEqual(placeFromParams('1CO', '13', undefined), { place: at('1CO', 13), verse: null });
  assert.deepEqual(placeFromParams('PSA', '121', 'x'), { place: at('PSA', 121), verse: null }, 'a verse that is no number is no verse, the chapter still opens');
  assert.deepEqual(placeFromParams('PSA', '121', '0'), { place: at('PSA', 121), verse: null });
  for (const [code, chap] of [['XXX', '1'], ['PSA', '0'], ['PSA', '151'], ['PSA', 'abc'], ['PSA', '01'], ['PSA', '1.5'], ['PSA', ''], [undefined, '1'], ['PSA', undefined], [['PSA'], '1'], ['PSA', ['1']], [5, 1], ['PSA', '1000']] as Array<[unknown, unknown]>) {
    assert.equal(placeFromParams(code, chap), null, `${JSON.stringify(code)} ${JSON.stringify(chap)}`);
  }
  assert.equal(placeKey(at('PSA', 121)), 'PSA.121');
});

/* ================================================================ the tiles (tileFit.ts, gridMath.ts) */

/** The advance widths of a font file, in em, read the way the font itself says them (head, hhea, hmtx, cmap): so that the table in tileFit.ts is checked against the real file. */
function advances(file: string): (ch: string) => number | undefined {
  const d = readFileSync(file);
  const tables: Record<string, number> = {};
  for (let i = 0; i < d.readUInt16BE(4); i++) tables[d.toString('latin1', 12 + 16 * i, 16 + 16 * i)] = d.readUInt32BE(20 + 16 * i);
  const upm = d.readUInt16BE(tables.head + 18);
  const metrics = d.readUInt16BE(tables.hhea + 34);
  const cmap = tables.cmap;
  let f12 = -1;
  let f4 = -1;
  for (let i = 0; i < d.readUInt16BE(cmap + 2); i++) {
    const pid = d.readUInt16BE(cmap + 4 + 8 * i);
    const eid = d.readUInt16BE(cmap + 6 + 8 * i);
    const sub = cmap + d.readUInt32BE(cmap + 8 + 8 * i);
    const fmt = d.readUInt16BE(sub);
    if (fmt === 12 && ((pid === 3 && eid === 10) || pid === 0)) f12 = sub;
    if (fmt === 4 && ((pid === 3 && eid === 1) || pid === 0) && f4 < 0) f4 = sub;
  }
  const glyphOf = (cp: number): number => {
    if (f12 >= 0) {
      for (let g = 0; g < d.readUInt32BE(f12 + 12); g++) {
        const o = f12 + 16 + 12 * g;
        if (cp >= d.readUInt32BE(o) && cp <= d.readUInt32BE(o + 4)) return d.readUInt32BE(o + 8) + (cp - d.readUInt32BE(o));
      }
      return 0;
    }
    const segs = d.readUInt16BE(f4 + 6) / 2;
    for (let s = 0; s < segs; s++) {
      const end = d.readUInt16BE(f4 + 14 + 2 * s);
      const start = d.readUInt16BE(f4 + 16 + 2 * segs + 2 * s);
      if (cp < start || cp > end) continue;
      const delta = d.readInt16BE(f4 + 16 + 4 * segs + 2 * s);
      const rangeAt = f4 + 16 + 6 * segs + 2 * s;
      const range = d.readUInt16BE(rangeAt);
      if (range === 0) return (cp + delta) & 0xffff;
      const g = d.readUInt16BE(rangeAt + range + 2 * (cp - start));
      return g ? (g + delta) & 0xffff : 0;
    }
    return 0;
  };
  return (ch) => {
    const g = glyphOf(ch.codePointAt(0)!);
    if (!g) return undefined;
    return d.readUInt16BE(tables.hmtx + 4 * Math.min(g, metrics - 1)) / upm;
  };
}

const FRAUNCES_FILE = join(root, 'node_modules', '@expo-google-fonts', 'fraunces', '600SemiBold', 'Fraunces_600SemiBold.ttf');
const MONO_FILE = join(root, 'node_modules', '@expo-google-fonts', 'jetbrains-mono', '400Regular', 'JetBrainsMono_400Regular.ttf');
const REAL_FRAUNCES = existsSync(FRAUNCES_FILE) ? advances(FRAUNCES_FILE) : null; // a partial checkout without node_modules cannot check the table
const realWidth = (line: string): number => [...line].reduce((sum, ch) => sum + (REAL_FRAUNCES!(ch) ?? 0.8), 0);

check('the table of letter widths is the font file: every letter of every book name, the digits and the space, read again from Fraunces SemiBold, to 0.0006 em; and JetBrains Mono is 0.6 wide', () => {
  const chars = new Set(BIBLE_BOOKS.flatMap((b) => [...b.name]));
  for (const ch of chars) assert.ok(ch in FRAUNCES_600, `the table has no width for "${ch}" of a book name`);
  if (!REAL_FRAUNCES) return;
  for (const [ch, w] of Object.entries(FRAUNCES_600)) assert.ok(Math.abs((REAL_FRAUNCES(ch) ?? NaN) - w) <= 0.0006, `"${ch}": the table says ${w}, the font ${REAL_FRAUNCES(ch)}`);
  assert.equal(MONO_ADVANCE, 0.6);
  if (existsSync(MONO_FILE)) {
    const mono = advances(MONO_FILE);
    for (const ch of '0123456789 chapters') assert.equal(mono(ch), 0.6, `JetBrains Mono is monospaced: "${ch}"`);
  }
});

check('names are broken into lines the same way in every book: a number stands on its own line ("1" and "Samuel"), "Song of Songs" in two, any other name of one word in one', () => {
  assert.deepEqual(nameLines('Genesis'), ['Genesis']);
  assert.deepEqual(nameLines('1 Samuel'), ['1', 'Samuel']);
  assert.deepEqual(nameLines('2 Thessalonians'), ['2', 'Thessalonians']);
  assert.deepEqual(nameLines('3 John'), ['3', 'John']);
  assert.deepEqual(nameLines('Song of Songs'), ['Song of', 'Songs']);
  for (const b of BIBLE_BOOKS) {
    const lines = nameLines(b.name);
    assert.ok(lines.length <= 2, b.name);
    assert.equal(lines.join(' '), b.name, 'nothing is lost');
    assert.equal(/^[1-3] /.test(b.name), lines.length === 2 && /^[1-3]$/.test(lines[0]), `${b.name}: a numbered book breaks after its number`);
  }
});

const WIDTHS = [320, 340, 360, 375, 390, 412, 430, 600, 768]; // from the narrowest phone the app is made for (320) to a tablet
const SCALES = [0.85, 1, 1.15, 1.3, 1.6, 2];

check('all 73 names fit their tile without being cut at every phone width from 320 to 768 and at every text size, never drawn under 11, the largest 18: lines at most two, the real width of the font file', () => {
  if (!REAL_FRAUNCES) return;
  for (const width of WIDTHS) {
    const grid = bookGrid(width);
    for (const scale of SCALES) {
      const m = Math.min(Math.max(scale, 1), TEXT_SCALE_CAP);
      for (const b of BIBLE_BOOKS) {
        const fit = fitName(b.name, grid.innerWidth, scale);
        const where = `${b.name} at ${width} wide, text ${scale}`;
        assert.equal(fit.fits, true, where);
        assert.ok(fit.lines.length <= 2, where);
        const widest = Math.max(...fit.lines.map(realWidth));
        assert.ok(widest * fit.size * m <= grid.innerWidth, `${where}: ${(widest * fit.size * m).toFixed(1)} px in ${grid.innerWidth}`);
        const drawn = fit.size * m;
        assert.ok(drawn >= NAME_FLOOR - 1e-9, `${where}: drawn at ${drawn}`);
        assert.ok(drawn <= NAME_MAX + 1e-9, `${where}: drawn at ${drawn}`);
        const count = fitCount(`${b.chapters}\u00a0${b.chapters === 1 ? 'chapter' : 'chapters'}`, grid.innerWidth, scale);
        assert.equal(count.fits, true, `${where}: the count`);
        assert.ok(count.size * m >= COUNT_FLOOR - 1e-9 && count.size * m <= COUNT_MAX + 1e-9, `${where}: the count is drawn at ${count.size * m}`);
        const high = fit.lines.length * fit.lineHeight * m + count.lineHeight * m;
        assert.ok(high <= grid.innerHeight, `${where}: ${high.toFixed(1)} high in ${grid.innerHeight}`);
      }
    }
  }
});

check('the smallest name on each width is pinned: the longest ("Thessalonians") is 11 at 320, 13 at 390 and 15 at 430, and a short name ("Job") is the full 18', () => {
  const size = (width: number, name: string) => fitName(name, bookGrid(width).innerWidth, 1).size;
  assert.equal(size(320, '1 Thessalonians'), 11);
  assert.equal(size(390, '1 Thessalonians'), 13.5);
  assert.equal(size(430, '1 Thessalonians'), 15);
  assert.equal(size(320, 'Job'), 18);
  assert.equal(size(390, 'Job'), 18);
  const smallest = (width: number) => Math.min(...BIBLE_BOOKS.map((b) => fitName(b.name, bookGrid(width).innerWidth, 1).size));
  assert.equal(smallest(320), 11);
  assert.ok(smallest(390) >= 13);
  assert.ok(smallest(430) >= 14.5);
  assert.equal(FIT_SAFETY, 1.03);
  assert.equal(NAME_FLOOR, 11);
  assert.equal(NAME_MAX, 18);
  assert.ok(lineWidth('Thessalonians') > 6.9 && lineWidth('Thessalonians') < 7.0);
});

check('the book grid: three square tiles between the 16 side margins, 12 apart (8 under 352), the tile edge at least 44 from 280 up, padding 6 (4 narrow), and what fits in a row never exceeds the width', () => {
  assert.equal(SIDE, 16);
  assert.equal(NARROW_UNDER, 352);
  assert.deepEqual(bookGrid(320), { columns: 3, gap: 8, tile: 90, pad: 4, innerWidth: 80, innerHeight: 80 });
  assert.deepEqual(bookGrid(390), { columns: 3, gap: 12, tile: 111, pad: 6, innerWidth: 97, innerHeight: 97 });
  assert.deepEqual(bookGrid(430), { columns: 3, gap: 12, tile: 124, pad: 6, innerWidth: 110, innerHeight: 110 });
  for (let width = 280; width <= 1100; width += 3) {
    const g = bookGrid(width);
    assert.ok(g.tile >= 44, `${width}: tile ${g.tile}`);
    assert.ok(3 * g.tile + 2 * g.gap <= width - 2 * SIDE, `${width}: three tiles and two gaps fit between the margins`);
    assert.ok(width - 2 * SIDE - (3 * g.tile + 2 * g.gap) <= 2, `${width}: at most two pixels are left over`);
    assert.equal(g.innerWidth, g.tile - 2 * (g.pad + 1));
  }
  const tokens = JSON.parse(read('src/theme/tokens.json')) as { layout: { screenMargin: number } };
  assert.equal(SIDE, tokens.layout.screenMargin, 'the side margin of the grid is the one of every screen');
});

check('the chapter grid: 4 tiles in a row on 320, 5 on 390, 6 on 430, as many as keep each at 56 or more, filling the row, never under 44 and never wider than the screen', () => {
  assert.equal(CHAPTER_TILE_MIN, 56);
  assert.equal(CHAPTER_GAP, 8);
  assert.deepEqual(chapterGrid(320), { columns: 4, gap: 8, tile: 66 });
  assert.deepEqual(chapterGrid(360), { columns: 5, gap: 8, tile: 59 });
  assert.deepEqual(chapterGrid(390), { columns: 5, gap: 8, tile: 65 });
  assert.deepEqual(chapterGrid(430), { columns: 6, gap: 8, tile: 59 });
  for (let width = 240; width <= 1200; width += 2) {
    const g = chapterGrid(width);
    assert.ok(g.tile >= 44, `${width}: tile ${g.tile}`);
    assert.ok(g.tile >= CHAPTER_TILE_MIN || width < 2 * SIDE + CHAPTER_TILE_MIN, `${width}: tile ${g.tile}`);
    assert.ok(g.columns * g.tile + (g.columns - 1) * g.gap <= Math.max(width - 2 * SIDE, CHAPTER_TILE_MIN), `${width}: a row fits`);
    assert.ok(g.columns >= 1);
  }
  // the Psalms: 150 numbers in 30 rows of 5 at 390
  assert.equal(Math.ceil(150 / chapterGrid(390).columns), 30);
});

/* ================================================================ the chapter read last (lastRead.ts) */

check('the chapter read last is kept as a small value and read back as the place; anything else, a chapter that is not in the Bible any more included, is no place and breaks nothing', () => {
  assert.equal(LAST_READ_NAME, 'library.lastRead');
  const packed = packLastRead(at('PSA', 121), 1234);
  assert.deepEqual(packed, { v: 1, code: 'PSA', chapter: 121, at: 1234 });
  assert.deepEqual(parseLastRead(JSON.parse(JSON.stringify(packed))), at('PSA', 121), 'through JSON, as it is stored');
  assert.deepEqual(parseLastRead({ v: 1, code: 'DAG', chapter: 14 }), at('DAG', 14), 'the time is not needed to read it');
  for (const junk of [undefined, null, 0, 1, 'x', true, [], {}, { v: 2, code: 'PSA', chapter: 1 }, { v: 1 }, { v: 1, code: 'PSA' }, { v: 1, chapter: 1 }, { v: 1, code: 'PSA', chapter: 0 },
    { v: 1, code: 'PSA', chapter: 151 }, { v: 1, code: 'PSA', chapter: 1.5 }, { v: 1, code: 'PSA', chapter: '1' }, { v: 1, code: 7, chapter: 1 }, { v: 1, code: 'psa', chapter: 1 },
    { v: 1, code: 'ZZZ', chapter: 1 }, { v: 1, code: 'bible-additions-to-esther', chapter: 1 }, { v: 1, code: 'JUD', chapter: 2 }]) assert.equal(parseLastRead(junk), null, JSON.stringify(junk));
  assert.equal(samePlace(at('PSA', 121), at('PSA', 121)), true);
  assert.equal(samePlace(at('PSA', 121), at('PSA', 122)), false);
  assert.equal(samePlace(null, at('PSA', 121)), false);
  assert.equal(samePlace(null, null), false);
});

check('the card on the Bible tab says "Continue reading" and the chapter, and a screen reader hears them together', () => {
  assert.equal(CONTINUE_TITLE, 'Continue reading');
  assert.equal(continueLabel(at('PSA', 121)), 'Continue reading, Psalm 121');
  assert.equal(continueLabel(at('1CO', 13)), 'Continue reading, 1 Corinthians 13');
  assert.equal(continueLabel(at('JHN', 3)), 'Continue reading, John 3');
});

/* ================================================================ verse rows of search and Bookmarks (verseRows.ts, search.ts) */

check('the row of a bookmarked verse is looked up in the text: the place in words and the words; a joined verse is found by either number; what is not there shows nothing', () => {
  const row = rowOfKey('PSA.121.3', source)!;
  assert.equal(row.label, 'Psalm 121:3');
  assert.equal(row.text, 'He will not allow your foot to be moved. He who keeps you will not slumber.');
  assert.deepEqual(row.ref, { code: 'PSA', chapter: 121, from: 3 });
  assert.equal(row.key, 'PSA.121.3');
  assert.deepEqual(row.marks, []);
  const joined = rowOfKey('JHN.3.15-16', source)!;
  assert.equal(joined.label, 'John 3:15-16');
  assert.equal(joined.text, 'A joined pair, printed with one text.');
  assert.equal(rowOfKey('JHN.3.15', source)!.label, 'John 3:15-16', 'a key that names one verse of a joined pair finds the pair');
  assert.equal(rowOfKey('JHN.3.15', source)!.key, 'JHN.3.15', 'and keeps the key it was kept under, so that it can be taken off');
  for (const gone of ['PSA.121.9', 'PSA.122.1', 'PSA.121', 'XXX.1.1', 'JHN.4.1', 'SIR.11.15-16', 'SIR.11.15', 'SIR.11.16', 'bible-psalms', 'PSA.121.0', 'psa.121.3', '', 'PSA.121.3-1']) assert.equal(rowOfKey(gone, source), null, `"${gone}" shows nothing`);
  const broken: TextSource = { hasBook: () => true, loadBook: () => { throw new Error('the file cannot be read'); } };
  assert.equal(rowOfKey('PSA.121.3', broken), null, 'a book that cannot be read shows nothing and does not throw');
  const nothing: TextSource = { hasBook: () => false, loadBook: () => { throw new Error('no'); } };
  assert.equal(rowOfKey('PSA.121.3', nothing), null);
});

check('a search hit is a row: the key, the place in words and the words, the marks cleaned; a hit that is no verse of the list is dropped; the list is cut at 100', () => {
  const row = rowOfHit({ code: 'PSA', chapter: 121, verse: '2', text: 'My help comes from the LORD,', marks: [[19, 23]] })!;
  assert.equal(row.key, 'PSA.121.2');
  assert.equal(row.label, 'Psalm 121:2');
  assert.deepEqual(row.marks, [[19, 23]]);
  assert.equal(rowOfHit({ code: 'SIR', chapter: 11, verse: '15-16', text: 'x', marks: [] })!.label, 'Sirach 11:15-16');
  assert.equal(rowOfHit({ code: 'XXX', chapter: 1, verse: '1', text: 'x', marks: [] }), null, 'a code the list does not know');
  assert.equal(rowOfHit({ code: 'PSA', chapter: 1, verse: 'a', text: 'x', marks: [] }), null, 'a label that is no number');
  const hits = Array.from({ length: 150 }, (_, i) => ({ code: 'PSA', chapter: 1 + (i % 150), verse: '1', text: `verse ${i}`, marks: [] as Array<[number, number]> }));
  assert.equal(rowsOfHits(hits).length, VERSE_RESULTS_MAX);
  assert.equal(VERSE_RESULTS_MAX, 100);
  assert.equal(rowsOfHits([hits[0], { code: 'XXX', chapter: 1, verse: '1', text: '', marks: [] }, hits[1]]).length, 2, 'the bad one is skipped, the rest are kept in order');
  assert.deepEqual(rowsOfHits([]), []);
});

check('marks that cannot be drawn are dropped, never thrown at: out of the text, empty, backwards, not whole numbers; overlapping ones are joined; the pieces of a text put the text together again', () => {
  const text = 'He will not allow your foot to be moved.';
  assert.deepEqual(cleanMarks(text, [[3, 7], [20, 24]]), [[3, 7], [20, 24]]);
  assert.deepEqual(cleanMarks(text, [[20, 24], [3, 7]]), [[3, 7], [20, 24]], 'in order');
  assert.deepEqual(cleanMarks(text, [[3, 9], [7, 12]]), [[3, 12]], 'overlapping marks are one');
  assert.deepEqual(cleanMarks(text, [[3, 7], [7, 9]]), [[3, 9]], 'touching marks are one');
  assert.deepEqual(cleanMarks(text, [[-5, 2], [30, 400], [5, 5], [9, 3]]), [[0, 2], [30, 40]], 'clamped to the text; an empty or backwards mark is dropped');
  assert.deepEqual(cleanMarks(text, [[1.5, 3], [NaN, 4], [2, Infinity]] as Array<[number, number]>), [], 'not whole numbers');
  assert.deepEqual(cleanMarks(text, [[100, 200]]), [], 'past the end');
  assert.deepEqual(cleanMarks(text, []), []);
  for (const marks of [[], [[3, 7]], [[0, 2], [30, 40]], [[3, 9], [7, 12]], [[0, 40]], [[-4, 99]]] as Array<Array<[number, number]>>) {
    assert.equal(segments(text, marks).map((s) => s.text).join(''), text, JSON.stringify(marks));
  }
  assert.deepEqual(segments('abcdef', [[1, 3]]), [{ text: 'a', mark: false }, { text: 'bc', mark: true }, { text: 'def', mark: false }]);
  assert.deepEqual(segments('abc', []), [{ text: 'abc', mark: false }]);
  assert.deepEqual(segments('', [[0, 3]]), []);
});

check('a long verse is cut to a piece around its first match, at a word, with an ellipsis where it was cut, and the marks follow the letters they marked', () => {
  const short = excerpt('A short verse.', [[2, 7]]);
  assert.deepEqual(short, { text: 'A short verse.', marks: [[2, 7]] });
  const words = Array.from({ length: 80 }, (_, i) => `word${i}`).join(' ');
  assert.ok(words.length > EXCERPT_MAX * 2);
  const where = words.indexOf('word60');
  const cut = excerpt(words, [[where, where + 6]]);
  assert.ok(cut.text.length <= EXCERPT_MAX + 2, `${cut.text.length}`);
  assert.ok(cut.text.startsWith('…') && cut.text.endsWith('…'));
  assert.equal(cut.marks.length, 1);
  assert.equal(cut.text.slice(cut.marks[0][0], cut.marks[0][1]), 'word60', 'the mark is on the same letters');
  const head = excerpt(words, [[0, 5]]);
  assert.ok(!head.text.startsWith('…') && head.text.endsWith('…'), 'a match at the start is not cut off in front');
  assert.equal(head.text.slice(head.marks[0][0], head.marks[0][1]), 'word0');
  const none = excerpt(words, []);
  assert.ok(none.text.endsWith('…') && none.marks.length === 0);
  const tail = excerpt(words, [[words.length - 6, words.length]]);
  assert.equal(tail.text.slice(tail.marks[0][0], tail.marks[0][1]), 'word79');
  assert.ok(!tail.text.endsWith('…'));
});

check('what is looked for: the words of the query with one space between, nothing for a query that is too short or only punctuation; the line over the verses; when "Searching…" is said', () => {
  assert.equal(verseQuery('  the   Lord, '), 'the Lord');
  assert.equal(verseQuery('“lift” up'), 'lift up');
  assert.equal(verseQuery('john 3 16'), 'john 3 16', 'numbers count as words');
  assert.equal(verseQuery('3 1'), '', 'two numbers of one digit are not a search');
  assert.equal(verseQuery('3 16'), '3 16', 'but a word of two letters or digits is');
  for (const q of ['', ' ', 'a', 'a b c', '...', '?!', '“”', '- -']) assert.equal(verseQuery(q), '', JSON.stringify(q));
  assert.equal(verseQuery('ab'), 'ab');
  assert.equal(versesLabel(12, false), 'Verses · 12');
  assert.equal(versesLabel(100, true), 'Verses · 100+');
  assert.equal(VERSES_CAPPED_NOTE, 'Showing the first 100 verses. Add a word to narrow the search.');
  assert.equal(announcesSearch(null), true, 'the first search reads the books: it says so');
  assert.equal(announcesSearch(SLOW_SEARCH_MS), true);
  assert.equal(announcesSearch(SLOW_SEARCH_MS - 1), false);
  assert.equal(announcesSearch(5), false);
  assert.equal(SLOW_SEARCH_MS, 120);
});

check('Bookmarks: the verses kept are rows in the order they were kept, a book by its id is a row, and everything that has no row (a verse that is not in the text, a book that was taken out) is left out without a word', () => {
  const keys = ['bible:PSA.121.3', 'bible:bible-psalms', 'bible:JHN.3.15-16', 'bible:bible-additions-to-esther', 'bible:PSA.999.1', 'bible:SIR.11.15-16', 'bible:XXX.1.1', 'bible:PSA.121', 'bible:bible-additions-to-daniel', 'books:confessions', 'bible:PSA.121.1'];
  const h = hitsForKeys(keys, source);
  assert.deepEqual(h.Verses.map((r) => r.label), ['Psalm 121:3', 'John 3:15-16', 'Psalm 121:1'], 'in the order of the keys');
  assert.deepEqual(h.Verses.map((r) => r.key), ['PSA.121.3', 'JHN.3.15-16', 'PSA.121.1']);
  assert.deepEqual(h.Bible.map((b) => b.id), ['bible-psalms']);
  assert.deepEqual(h.Books.map((b) => b.id), ['confessions']);
  assert.equal(hitCount(h), 5);
  assert.deepEqual(hitGroups(h), ['Bible', 'Books', 'Verses']);
  // without a text no verse is a row (a book is still one)
  const bare = hitsForKeys(keys);
  assert.deepEqual(bare.Verses, []);
  assert.equal(hitCount(bare), 2);
  // a key twice is one row
  assert.equal(hitsForKeys(['bible:PSA.121.3', 'bible:PSA.121.3'], source).Verses.length, 1);
  // only deleted ids and verses that are not there: an empty list, which the screen says is empty
  const none = hitsForKeys(['bible:bible-additions-to-esther', 'bible:bible-additions-to-daniel', 'bible:PSA.999.1', 'bible:SIR.11.15-16', 'bible:NOPE.1.1', 'bible:PSA.121.99'], source);
  assert.deepEqual(none, emptyHits());
  assert.equal(hitCount(none), 0);
  assert.deepEqual(hitGroups(none), []);
  // the saved list that holds them still reads, nothing is lost, and a verse can be bookmarked and taken off next to them
  const stored = parseBookmarks(JSON.parse(JSON.stringify(packBookmarks(keys.map((key, i) => ({ key, at: 100 - i }))))))!;
  assert.deepEqual(bookmarkKeys(stored), keys);
  const added = toggleBookmark(stored, verseKey({ code: 'PSA', chapter: 121, from: 2 }), 500);
  assert.equal(bookmarkKeys(added)[0], 'bible:PSA.121.2');
  assert.equal(hitsForKeys(bookmarkKeys(added), source).Verses[0].label, 'Psalm 121:2');
  const off = toggleBookmark(added, 'bible:PSA.121.3', 600);
  assert.ok(!bookmarkKeys(off).includes('bible:PSA.121.3'));
  assert.equal(hitsForKeys(bookmarkKeys(off), source).Verses.length, 3, 'one verse taken off, one put on');
  // every key of a verse is short enough to be kept (the list reads keys of up to 80 characters)
  for (const ref of [{ code: '1CO', chapter: 13, from: 4, to: 7 }, { code: 'SIR', chapter: 11, from: 15, to: 16 }, { code: 'PSA', chapter: 119, from: 176 }]) assert.ok(verseKey(ref).length <= 80);
  assert.ok(BOOKMARKS_MAX >= 100);
});

/* ================================================================ copy and share, the credit, the notices */

check('what goes out when a verse is copied or shared: its words, then on a line of its own where it is and "(World English Bible)"; and what a screen reader is told when it is chosen', () => {
  assert.equal(verseShareText('Psalm 121:3', 'He will not allow your foot to be moved.'), 'He will not allow your foot to be moved.\nPsalm 121:3 (World English Bible)');
  assert.equal(verseShareText('John 3:16', '  For God so loved the world.  '), 'For God so loved the world.\nJohn 3:16 (World English Bible)', 'the words are trimmed');
  assert.equal(SHARE_TRANSLATION, 'World English Bible');
  assert.equal(chosenAnnouncement('Psalm 121:3'), 'Psalm 121:3 selected. Bookmark, copy or share it.');
  assert.equal(COPIED, 'Copied');
});

check('the end of a chapter: the credit of the translation, then one plain line that it is not the translation read at Mass; one note in handwriting; and the screen of chapters has its own', () => {
  const credit = 'World English Bible, Catholic edition (eBible.org). Public domain. The name "World English Bible" is a trademark of eBible.org.';
  assert.deepEqual(creditLines(credit), [credit, 'This is not the translation read at Mass.']);
  assert.equal(NOT_AT_MASS, 'This is not the translation read at Mass.');
  assert.doesNotMatch(NOT_AT_MASS + READER_NOTE + CHAPTERS_NOTE, /verified|official|certified|approved/i, 'nothing says verified or official');
  assert.ok(READER_NOTE.split(' ').length <= 5 && CHAPTERS_NOTE.split(' ').length <= 5, 'the handwritten notes are a few words');
});

check('the words of the Bible tab and of the notices: the source line is one quiet line; the notices are honest about what is real (the Bible, and the books marked Free) and what is not in the app yet (the books marked Soon)', () => {
  assert.equal(BIBLE_SOURCE_LINE, 'World English Bible, Catholic edition · public domain');
  assert.equal(BOOKS_NOTICE, 'Books are not in the app yet. We are checking the editions before we add them.');
  assert.equal(SEARCH_NOTICE, 'Books marked Soon are not in the app yet: we are still checking their editions. The Bible text and the books marked Free are.');
  assert.match(BOOKMARKS_NOTICE, /^Books marked Soon are not in the app yet/);
  assert.equal(BOOKMARKS_KEPT, 'Kept only on this phone. Logging out clears them.');
  for (const text of [BIBLE_SOURCE_LINE, BOOKS_NOTICE, SEARCH_NOTICE, BOOKMARKS_NOTICE]) assert.doesNotMatch(text, /verified|official|certified/i, text);
  assert.doesNotMatch(`${BIBLE_SOURCE_LINE} ${SEARCH_NOTICE} ${BOOKMARKS_NOTICE}`, /not in the app yet\. We are choosing a translation/, 'the old "Bible text is not in the app yet" is gone');
});

console.log(`${n} of ${n} passed (Reader)`);
