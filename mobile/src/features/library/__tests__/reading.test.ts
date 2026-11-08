// Plain-node checks of how a book is read and how its covers are drawn: the neighbours of a chapter across parts, the table of contents, how far
// down a chapter someone is, the saved place and every way it can be wrong, the text sizes and their cap, the A5 covers in two columns at every
// phone width from 320 to 430, the title and the author fitted into their covers, and the three states of the banner of the Books tab.
// No React, no React Native, no network. Run: npm run test:library (library.test.ts runs this file too).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { BookContent, CatalogBook, Block, Span } from '../books';
import {
  CONTINUE_CTA, CONTINUE_NOTE, KIND_ORDER, NONE_LINE, START_CTA, START_NOTE, booksBanner, bookPath, kindMark, kindName, pageNote, readerPath, shelves,
} from '../books/copy';
import {
  A5_RATIO, GRID_COLUMNS, TILE_MAX, TITLE_MAX_LINES, a5Height, coverGrid, coverLabel, coverMetrics, coverText, fitKind, fitTitle, withAlpha,
} from '../books/cover';
import { noticeFor, GUIDE_NOTICE, READINGS_NOTICE, OTHER_NOTICE } from '../books/notices';
import {
  DEFAULT_STEP, LAST_STEP, MAX_BODY, MAX_TITLE, READER_SIZES, canGrow, canShrink, clampStep, drawnSize, grow, packStep, parseStep, readerType, shrink, sizeLine,
} from '../books/readerType';
import * as reading from '../books/reading';
import {
  FINISHED_AT, PIECE_MAX, READING_MAX_BOOKS, READING_MAX_READ, READ_AT, blockText, blockWords, bookFacts, chapterIndex, chapterNav, chapterWords, cleanBlocks, cleanBook, countWords, destination, emptyReading,
  formatMinutes, groupThousands, hasParts, isRead, lastRead, layoutBlocks, LONG_LABEL, LONG_TITLE, markRead, nextLabel, offsetFor, packReading, parseReading, partName, partSubtitle, pieces, placeOf,
  plainText, positionLine, previousLabel, readButtonLabel, readButtonSpoken, readSet, readingMinutes, readingTime, resumeAt, savePlace, scrollProgress, shortTitle, spanPieces, splitTitle, spokenMinutes, startAt,
  tocGroups, type ChapterRef,
} from '../books/reading';
import { textWidth, wrap } from '../books/typeMetrics';

/** The bundle of the books (mobile/assets/library, made by tools/build_books.py from books/): read from the files, so this test needs no app code to load it. */
const LIB = join(process.cwd(), 'assets', 'library');
const BOOK_CATALOG: CatalogBook[] = (JSON.parse(readFileSync(join(LIB, 'catalog.json'), 'utf8')) as { books: CatalogBook[] }).books.slice().sort((a, b) => a.order - b.order);
const content = (id: string): BookContent => JSON.parse(readFileSync(join(LIB, 'books', `${id}.json`), 'utf8')) as BookContent;

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };

/** The Imitation, as the edition has it: four books, each with its own chapter numbers. */
const imitation: ChapterRef[] = [
  ...Array.from({ length: 3 }, (_, i) => ({ id: `c${i + 1}`, title: `Chapter ${['I', 'II', 'III'][i]}. Of things ${i}`, part: 'Book One' })),
  ...Array.from({ length: 2 }, (_, i) => ({ id: `c${i + 4}`, title: `Chapter ${['I', 'II'][i]}. Of inward things ${i}`, part: 'Book Two' })),
];
const plain: ChapterRef[] = Array.from({ length: 4 }, (_, i) => ({ id: `c${i + 1}`, title: `Chapter ${i + 1}` }));

/* ================================================================ neighbours */

check('the next chapter crosses a part: the last of Book One is followed by the first of Book Two, and the previous goes back across it', () => {
  const last = chapterNav(imitation, 2)!;
  assert.equal(last.next?.id, 'c4');
  assert.equal(last.next?.part, 'Book Two');
  assert.equal(last.part, 'Book One');
  const first = chapterNav(imitation, 3)!;
  assert.equal(first.prev?.id, 'c3');
  assert.equal(first.prev?.part, 'Book One');
});

check('the first chapter has no previous, the last has no next, and a chapter in the middle has both', () => {
  const a = chapterNav(imitation, 0)!;
  assert.equal(a.prev, null);
  assert.equal(a.next?.id, 'c2');
  const z = chapterNav(imitation, imitation.length - 1)!;
  assert.equal(z.next, null);
  assert.equal(z.prev?.id, 'c4');
  const mid = chapterNav(plain, 1)!;
  assert.deepEqual([mid.prev?.id, mid.next?.id], ['c1', 'c3']);
  assert.deepEqual([mid.index, mid.position, mid.total], [1, 2, 4]);
});

check('a chapter that is not there has no navigation: a negative index, one past the end, a fraction, NaN, an empty book', () => {
  for (const i of [-1, imitation.length, 1.5, Number.NaN, Infinity]) assert.equal(chapterNav(imitation, i), null, String(i));
  assert.equal(chapterNav([], 0), null);
});

check('"Chapter 7 of 40" counts the chapters of the whole book, whatever the parts', () => {
  assert.equal(positionLine(chapterNav(imitation, 3)!), 'Chapter 4 of 5');
  assert.equal(positionLine({ position: 7, total: 40 }), 'Chapter 7 of 40');
});

check('the Previous and Next labels name the destination, with its part when it is another one, and say why there is none at the ends', () => {
  const mid = chapterNav(imitation, 1)!;
  assert.equal(previousLabel(mid), 'Previous: Chapter I. Of things 0');
  assert.equal(nextLabel(mid), 'Next: Chapter III. Of things 2');
  assert.equal(nextLabel(chapterNav(imitation, 2)!), 'Next: Book Two, Chapter I. Of inward things 0');
  assert.equal(previousLabel(chapterNav(imitation, 3)!), 'Previous: Book One, Chapter III. Of things 2');
  assert.match(previousLabel(chapterNav(imitation, 0)!), /first chapter/);
  assert.match(nextLabel(chapterNav(imitation, imitation.length - 1)!), /last chapter/);
  assert.equal(nextLabel(chapterNav(plain, 0)!), 'Next: Chapter 2');
  assert.equal(destination({ index: 1, id: 'c2', title: 'T', part: null }, null), 'T');
  assert.equal(destination({ index: 1, id: 'c2', title: 'T', part: 'A' }, 'A'), 'T');
});

check('a chapter is found by its id, and an id that is not there, empty or not a text is -1', () => {
  assert.equal(chapterIndex(imitation, 'c4'), 3);
  for (const id of ['c99', '', null, undefined]) assert.equal(chapterIndex(imitation, id), -1);
  assert.equal(chapterIndex([], 'c1'), -1);
});

/* ================================================================ table of contents */

check('the table of contents groups the chapters by part, in reading order, and a part that comes back is a new group', () => {
  const groups = tocGroups(imitation);
  assert.deepEqual(groups.map((g) => [g.part, g.entries.map((e) => e.id)]), [['Book One', ['c1', 'c2', 'c3']], ['Book Two', ['c4', 'c5']]]);
  assert.deepEqual(groups[1].entries.map((e) => e.index), [3, 4], 'an entry knows its place in the whole book');
  const back = tocGroups([{ id: 'a', title: 'A', part: 'X' }, { id: 'b', title: 'B', part: 'Y' }, { id: 'c', title: 'C', part: 'X' }]);
  assert.deepEqual(back.map((g) => g.part), ['X', 'Y', 'X']);
});

check('a book with no parts is one group with no heading, a preface before the first part has none either, and an empty book has nothing', () => {
  assert.deepEqual(tocGroups(plain).map((g) => [g.part, g.entries.length]), [[null, 4]]);
  const preface = tocGroups([{ id: 'p', title: 'Preface' }, { id: 'a', title: 'A', part: 'Book One' }]);
  assert.deepEqual(preface.map((g) => g.part), [null, 'Book One']);
  assert.deepEqual(tocGroups([]), []);
  assert.equal(hasParts(plain), false);
  assert.equal(hasParts(imitation), true);
  assert.deepEqual(tocGroups([{ id: 'a', title: 'A', part: '  ' }]).map((g) => g.part), [null], 'a part of blanks is no part');
});

/* ================================================================ titles */

check('a short title: "Chapter VII" for a numbered chapter, the title for a short one, cut at a word with an ellipsis for a long one', () => {
  const nb = (s: string) => s.replace(/\xa0/g, ' ');
  assert.equal(nb(shortTitle('Chapter VII. Of fleeing from vain hope and pride')), 'Chapter VII');
  assert.equal(nb(shortTitle('Chapter 7')), 'Chapter 7');
  assert.equal(nb(shortTitle('Book Two')), 'Book Two');
  assert.equal(shortTitle('The Preface'), 'The Preface');
  const long = shortTitle('A treatise on the prayer of quiet and recollection in the soul', 28);
  assert.ok(long.endsWith('…') && long.length <= 28, long);
  assert.ok(!long.slice(0, -1).endsWith(' '));
  assert.equal(shortTitle('Chapters of the matter that are many'), 'Chapters of the matter that are many'.length <= 28 ? 'Chapters of the matter that are many' : shortTitle('Chapters of the matter that are many'));
  assert.doesNotMatch(shortTitle('Chapter VII. x'), /Chapter VII\./);
});

check('a long title is split in two: "Chapter XXXVI" and what the chapter is about, a title with no number is only a label, and a part is shortened to its name', () => {
  const nb = (t: string) => t.replace(/\xa0/g, ' ');
  const long = 'Chapter XXXVI. The Foundation of the Monastery of St. Joseph. Persecution and Temptations. Great Interior Trial of the Saint, and Her Deliverance.';
  const split = splitTitle(long);
  assert.equal(nb(split.label), 'Chapter XXXVI');
  assert.equal(split.subtitle, 'The Foundation of the Monastery of St. Joseph. Persecution and Temptations. Great Interior Trial of the Saint, and Her Deliverance.');
  assert.deepEqual(splitTitle('Prologue'), { label: 'Prologue', subtitle: '' });
  assert.deepEqual(splitTitle('Book X'), { label: 'Book\xa0X', subtitle: '' });
  assert.equal(nb(splitTitle('Chapter 7: A short one').label), 'Chapter 7');
  assert.equal(splitTitle('Chapter 7: A short one').subtitle, 'A short one');
  assert.deepEqual(splitTitle('  Book  Divine   Things '), { label: 'Book Divine Things', subtitle: '' }, 'a word that only starts like a numeral is not one');
  // a long title with no number: a short first sentence is the label, the rest what it is about; with no short first sentence it is a label
  const annotations = splitTitle('Annotations. To Give Some Understanding of the Spiritual Exercises Which Follow, and to Enable Him Who Is to Give and Him Who Is to Receive Them to Help Themselves');
  assert.equal(annotations.label, 'Annotations');
  assert.equal(annotations.subtitle, 'To Give Some Understanding of the Spiritual Exercises Which Follow, and to Enable Him Who Is to Give and Him Who Is to Receive Them to Help Themselves');
  const sentence = 'Of the excellence, virtues, and holy works of virtuous and holy ministers; and how such are like the sun.';
  assert.deepEqual(splitTitle(sentence), { label: sentence, subtitle: '' });
  assert.deepEqual(splitTitle('Prelude for Making Election'), { label: 'Prelude for Making Election', subtitle: '' }, 'a short title is only a label');
  assert.deepEqual(splitTitle('A long title without any full stop in its first words, so it stays whole'), { label: 'A long title without any full stop in its first words, so it stays whole', subtitle: '' });
  const wholeSentence = 'Concerning the great and wonderful mercy of God towards sinners. How it works in the soul';
  assert.deepEqual(splitTitle(wholeSentence), { label: wholeSentence, subtitle: '' }, 'a first sentence that is itself long is not a name: the title stays whole');
  assert.ok(LONG_TITLE === 40 && LONG_LABEL === 44);
  assert.equal(partSubtitle('The First Book. Admonitions Profitable for the Spiritual Life'), 'Admonitions Profitable for the Spiritual Life');
  assert.equal(partSubtitle("Part I. Counsels and Practices Suitable for the Soul's Guidance."), "Counsels and Practices Suitable for the Soul's Guidance");
  assert.equal(partSubtitle('Book One'), '');
  assert.equal(partSubtitle('A Treatise of Prayer'), '');
  assert.equal(partName('The First Book. Admonitions Profitable for the Spiritual Life'), 'The First Book');
  assert.equal(partName('Book One'), 'Book One');
  assert.equal(partName("St. Joseph's Mansion"), "St. Joseph's Mansion", 'a full stop after St is not the end of a sentence');
  assert.equal(partName('The Third Mansions. Chapter of St. Peter'), 'The Third Mansions');
  assert.equal(partName('  The  Fourth   Book.   Of the Altar '), 'The Fourth Book');
  assert.equal(partName('The Life of St. Teresa. Of her childhood'), 'The Life of St. Teresa', 'a full stop after St is not the end of the name, wherever St stands');
  assert.equal(partName(''), '');
});

const sp = (t: string, extra: Partial<Span> = {}): Span => ({ t, ...extra });

check('the blocks of a chapter become the things to draw: a long paragraph in pieces that say the same words in the same bold and italic, every other block whole, and no key is used twice', () => {
  const long = 'The soul rests in God alone. '.repeat(400).trim();
  const blocks: Block[] = [
    { t: 'h', level: 2, spans: [sp('A heading')] },
    { t: 'p', spans: [sp(long.slice(0, 5000)), sp(long.slice(5000, 5100), { b: 1 }), sp(long.slice(5100), { i: 1 })] },
    { t: 'quote', paras: [[sp('one')], [sp('two')]], cite: [sp('— Someone')] },
    { t: 'hr' },
    { t: 'ul', items: [[sp('a point')], [sp('another')]] },
    { t: 'ol', items: [[sp('first')]] },
    { t: 'p', spans: [sp('short')] },
  ];
  const items = layoutBlocks(blocks);
  const pieces1 = items.filter((i) => i.key.startsWith('1.'));
  assert.deepEqual(items.map((i) => i.k), ['h', ...Array(pieces1.length).fill('p'), 'q', 'hr', 'list', 'list', 'p']);
  assert.ok(pieces1.length >= 3, 'the long paragraph is in several pieces');
  const spansOf = (i: (typeof items)[number]) => (i.k === 'p' ? i.spans : []);
  assert.equal(pieces1.map((i) => plainText(spansOf(i))).join(''), long, 'the same words');
  assert.ok(pieces1.every((i) => plainText(spansOf(i)).length <= PIECE_MAX), 'no piece is longer than the limit');
  // the bold and the italic are where they were: the words of each style, put together, are the words that had that style
  const styled = (key: 'b' | 'i') => pieces1.flatMap((i) => spansOf(i)).filter((x) => x[key]).map((x) => x.t).join('');
  assert.equal(styled('b'), long.slice(5000, 5100));
  assert.equal(styled('i'), long.slice(5100));
  assert.deepEqual(pieces1.map((i) => (i.k === 'p' ? [i.cont, i.end] : [])), pieces1.map((_, k) => [k > 0, k === pieces1.length - 1]), 'a piece after the first continues; the last one ends the paragraph');
  assert.deepEqual(items.find((i) => i.k === 'hr'), { key: '3', k: 'hr' });
  const quote = items.find((i) => i.k === 'q');
  assert.ok(quote && quote.k === 'q' && quote.paras.length === 2 && plainText(quote.cite ?? []) === '— Someone');
  const lists = items.filter((i) => i.k === 'list');
  assert.deepEqual(lists.map((i) => (i.k === 'list' ? [i.ordered, i.items.length] : [])), [[false, 2], [true, 1]]);
  assert.equal(new Set(items.map((i) => i.key)).size, items.length, 'every item has a key of its own');
  assert.deepEqual(layoutBlocks([]), []);
  assert.deepEqual(spanPieces([sp('short')]), [[sp('short')]]);
});

check('a book read from its file is made safe: what is not a book is nothing, a chapter without an id or a title or with an id seen before is left out, and blocks that do not read are left out, so the reader never throws', () => {
  for (const bad of [null, undefined, 7, 'x', [], {}, { id: 'a', title: 'T' }, { id: 'a', title: 'T', chapters: [] }, { id: 'a', title: 'T', chapters: [{ id: '', title: 'x', blocks: [] }] }]) assert.equal(cleanBook(bad), null);
  const raw = {
    id: 'a-book', kind: 'guide', title: 'A book', subtitle: 7, credit: 'By us.', author: 'Us',
    chapters: [
      { id: 'one', title: 'One', blocks: [{ t: 'p', spans: [{ t: 'fine', b: 1 }, { t: 3 }, null] }, { t: 'x' }, { t: 'p' }, null, 7, { t: 'h', level: 'two', spans: [{ t: 'Head' }] }, { t: 'ul', items: [[{ t: 'a' }], 'nope', []] }, { t: 'quote', paras: [], cite: null }, { t: 'hr' }] },
      { id: 'one', title: 'Again', blocks: [] },
      { id: 'two', title: 'Two', part: 'Part A', blocks: 'not a list' },
      { title: 'no id' },
    ],
    sources: [{ work: 'W', author: 'A', licence: 'L', translator: 'T', extra: 1 }, { work: 'only a work' }],
  };
  const book = cleanBook(raw)!;
  assert.deepEqual(book.chapters.map((c) => c.id), ['one', 'two'], 'a chapter seen before and one without an id are left out');
  assert.deepEqual(book.chapters[0].blocks, [{ t: 'p', spans: [{ t: 'fine', b: 1 }] }, { t: 'h', level: 2, spans: [{ t: 'Head' }] }, { t: 'ul', items: [[{ t: 'a' }]] }, { t: 'hr' }]);
  assert.deepEqual(book.chapters[1], { id: 'two', title: 'Two', part: 'Part A', blocks: [] });
  assert.equal(book.subtitle, '');
  assert.deepEqual(book.sources, [{ work: 'W', author: 'A', licence: 'L', translator: 'T' }]);
  assert.deepEqual(cleanBlocks('nope'), []);
  assert.deepEqual(cleanBlocks([{ t: 'h', level: 1, spans: [{ t: 'x' }] }, { t: 'h', level: 9, spans: [{ t: 'y' }] }]).map((b) => (b.t === 'h' ? b.level : 0)), [2, 6], 'a heading level is held between 2 and 6');
});

check('the button of a book page: "Start reading" the first time, "Continue: Chapter 7" after, and the whole title with its part for a screen reader', () => {
  assert.equal(readButtonLabel(plain, null), 'Start reading');
  assert.equal(readButtonLabel(plain, { c: 'c3', y: 0.4 }).replace(/\xa0/g, ' '), 'Continue: Chapter 3');
  assert.equal(readButtonSpoken(imitation, { c: 'c4', y: 0.1 }), 'Continue: Book Two, Chapter I. Of inward things 0');
  assert.equal(readButtonSpoken(imitation, null), 'Start reading');
  assert.equal(readButtonLabel(imitation, { c: 'c4', y: 0.1 }).replace(/\xa0/g, ' '), 'Continue: Chapter I', 'the button is short: the number of the chapter, and not its whole title (which is for a screen reader)');
  assert.equal(readButtonLabel(plain, { c: 'gone', y: 0.4 }), 'Start reading', 'a place in a chapter that is not there starts the book');
});

/* ================================================================ progress */

check('how far down a chapter: the offset over what can be scrolled, 0 before anything has a size, 1 for a chapter that fits, never out of 0 to 1', () => {
  assert.equal(scrollProgress(0, 2000, 800), 0);
  assert.equal(scrollProgress(600, 2000, 800), 0.5);
  assert.equal(scrollProgress(1200, 2000, 800), 1);
  assert.equal(scrollProgress(5000, 2000, 800), 1, 'an overscroll is the end');
  assert.equal(scrollProgress(-80, 2000, 800), 0, 'a pull at the top is the top');
  assert.equal(scrollProgress(0, 0, 0), 0, 'no size yet: not read');
  assert.equal(scrollProgress(0, 500, 0), 0);
  assert.equal(scrollProgress(0, 600, 800), 1, 'all of it is on the screen');
  for (const bad of [Number.NaN, Infinity, -Infinity]) assert.equal(scrollProgress(bad, 2000, 800), 0);
  assert.equal(scrollProgress(10, Number.NaN, 800), 0);
});

check('the offset of a progress is the inverse of it, and a chapter counts as read from 90 %', () => {
  assert.equal(offsetFor(0.5, 2000, 800), 600);
  assert.equal(offsetFor(0, 2000, 800), 0);
  assert.equal(offsetFor(1, 2000, 800), 1200);
  assert.equal(offsetFor(2, 2000, 800), 1200);
  assert.equal(offsetFor(-1, 2000, 800), 0);
  assert.equal(offsetFor(0.5, 500, 800), 0, 'a chapter shorter than the screen has nothing to scroll to');
  assert.equal(offsetFor(Number.NaN, 2000, 800), 0);
  assert.equal(READ_AT, 0.9);
  assert.equal(isRead(0.89), false);
  assert.equal(isRead(0.9), true);
  assert.equal(isRead(1), true);
  assert.equal(isRead(Number.NaN), false);
  assert.ok(FINISHED_AT > READ_AT && FINISHED_AT < 1);
});

/* ================================================================ size of a text */

check('words and reading time are the rules of tools/book_kit.py: a word is a run of letters and numbers (an inner apostrophe or hyphen stays in it), 220 a minute, rounded up', () => {
  assert.equal(countWords(''), 0);
  assert.equal(countWords('   '), 0);
  assert.equal(countWords('one'), 1);
  assert.equal(countWords(' Thou  art\ngreat, O Lord. '), 5);
  assert.equal(countWords("don't well-known ‘quoted’ — a dash and 12 numbers"), 8, 'an inner apostrophe or hyphen stays in the word; a dash and quote marks are not words');
  assert.equal(countWords('Ávila Müller 日本'), 3, 'letters of any script');
  const blocks: Block[] = [
    { t: 'p', spans: [sp('a b'), sp(' c', { b: 1 })] }, { t: 'hr' }, { t: 'quote', paras: [[sp('d e')]], cite: [sp('— f')] }, { t: 'h', level: 2, spans: [sp('g')] }, { t: 'ul', items: [[sp('h i')], [sp('j')]] },
  ];
  assert.equal(blockText(blocks[2]), 'd e\n— f');
  assert.equal(blockWords(blocks), 3 + 0 + 3 + 1 + 3, 'the dash of an attribution is not a word');
  assert.equal(chapterWords('Day 1. A start', blocks), 4 + 10, 'the title counts, as the tool counts it');
  assert.equal(readingMinutes(0), 0);
  assert.equal(readingMinutes(1), 1);
  assert.equal(readingMinutes(220), 1);
  assert.equal(readingMinutes(221), 2, 'rounded up');
  assert.equal(formatMinutes(25), '25 min');
  assert.equal(formatMinutes(60), '1 h');
  assert.equal(formatMinutes(160), '2 h 40 min');
  assert.equal(formatMinutes(180), '3 h');
  assert.equal(readingTime(10), '1 min');
  assert.equal(readingTime(1100), '5 min');
  assert.equal(readingTime(1101), '6 min', 'a word more than the minute is another minute');
  assert.equal(readingTime(32748), '2 h 29 min');
  assert.equal(spokenMinutes(1), '1 minute');
  assert.equal(spokenMinutes(51), '51 minutes');
  assert.equal(spokenMinutes(60), '1 hour');
  assert.equal(spokenMinutes(68), '1 hour 8 minutes');
  assert.equal(spokenMinutes(180), '3 hours');
  assert.equal(groupThousands(55000), '55,000');
  assert.equal(groupThousands(999), '999');
  assert.equal(groupThousands(1234567), '1,234,567');
  assert.equal(bookFacts(17, 11077), '17 chapters · 11,077 words · 51 min');
  assert.equal(bookFacts(1, 800), '1 chapter · 800 words · 4 min');
});

check('a very long paragraph is cut into pieces that make the same text again, at the end of a sentence when there is one, and none is longer than the limit', () => {
  const sentence = 'The soul rests in God alone. ';
  const long = sentence.repeat(1000).trim();
  const parts = pieces(long);
  assert.ok(parts.length > 5);
  assert.equal(parts.join(''), long, 'nothing lost, nothing added');
  assert.ok(parts.every((p) => p.length <= PIECE_MAX), 'no piece over the limit');
  assert.ok(parts.slice(0, -1).every((p) => /[.]$/.test(p.trimEnd())), 'every piece but the last ends at the end of a sentence');
  assert.deepEqual(pieces('short'), ['short']);
  assert.deepEqual(pieces(''), ['']);
  const noSpaces = 'x'.repeat(PIECE_MAX * 2 + 5);
  const cut = pieces(noSpaces);
  assert.equal(cut.join(''), noSpaces, 'a text with no space in it is cut where it must');
  assert.ok(cut.every((p) => p.length <= PIECE_MAX));
  const words = 'word '.repeat(2000).trim();
  assert.equal(pieces(words, 500).join(''), words);
  assert.ok(pieces(words, 500).every((p) => p.length <= 500));
  // where a cut falls: at a full stop in the last fifth of a piece; without one, at the last space (a word is never cut); only a text with no space at all is cut anywhere
  const early = `${'x'.repeat(48)}. ${'word '.repeat(60)}`.trim();
  assert.ok(pieces(early, 100)[0].length > 80, 'a full stop in the first half of a piece is not where it is cut: the piece goes on to the last space');
  const spaced = 'abcdefg '.repeat(40).trim();
  const spacedParts = pieces(spaced, 100);
  assert.ok(spacedParts.length > 2);
  assert.ok(spacedParts.slice(1).every((p) => p.startsWith(' ')), 'a piece starts where the one before stopped, at a space, so no word is cut in two');
});

/* ================================================================ the saved place */

check('a place is saved per book, newest first, with the book read last; saving again moves the book to the front and keeps what was read', () => {
  let r = emptyReading();
  r = savePlace(r, 'confessions', 'c2', 0.3, 1000);
  r = markRead(r, 'confessions', 'c1', 1001);
  r = savePlace(r, 'imitation-of-christ', 'c5', 0.6, 2000);
  assert.equal(r.last, 'imitation-of-christ');
  assert.deepEqual(r.items.map((p) => p.id), ['imitation-of-christ', 'confessions']);
  r = savePlace(r, 'confessions', 'c3', 0.1, 3000);
  assert.deepEqual(r.items.map((p) => p.id), ['confessions', 'imitation-of-christ']);
  assert.deepEqual(placeOf(r, 'confessions'), { id: 'confessions', c: 'c3', y: 0.1, at: 3000, read: ['c1'] });
  assert.equal(placeOf(r, 'gone'), null);
  assert.equal(r.last, 'confessions');
});

check('saving does not change what it is given, ignores an empty book or chapter, and brings how far down a chapter is into 0 to 1', () => {
  const before = savePlace(emptyReading(), 'confessions', 'c2', 0.3, 1);
  const frozen = JSON.stringify(before);
  savePlace(before, 'confessions', 'c3', 0.9, 2);
  markRead(before, 'confessions', 'c9', 3);
  assert.equal(JSON.stringify(before), frozen);
  assert.equal(savePlace(before, '', 'c1', 0.1, 4), before);
  assert.equal(savePlace(before, 'confessions', '', 0.1, 4), before);
  assert.equal(placeOf(savePlace(before, 'confessions', 'c2', 7, 5), 'confessions')!.y, 1);
  assert.equal(placeOf(savePlace(before, 'confessions', 'c2', -7, 5), 'confessions')!.y, 0);
  assert.equal(placeOf(savePlace(before, 'confessions', 'c2', Number.NaN, 5), 'confessions')!.y, 0);
});

check('a chapter is marked read once, the mark does not move the place, a book that was never opened gets a place when a chapter is marked, and the marks are a set', () => {
  let r = savePlace(emptyReading(), 'confessions', 'c4', 0.5, 10);
  r = markRead(r, 'confessions', 'c1', 11);
  r = markRead(r, 'confessions', 'c2', 12);
  const again = markRead(r, 'confessions', 'c2', 13);
  assert.equal(again, r, 'marking a chapter that is marked changes nothing');
  assert.deepEqual(placeOf(r, 'confessions')!.read, ['c1', 'c2']);
  assert.equal(placeOf(r, 'confessions')!.c, 'c4', 'the place stays where the person is');
  assert.deepEqual([...readSet(r, 'confessions')], ['c1', 'c2']);
  assert.equal(readSet(r, 'gone').size, 0);
  const fresh = markRead(emptyReading(), 'devout-life', 'c1', 20);
  assert.deepEqual(placeOf(fresh, 'devout-life'), { id: 'devout-life', c: 'c1', y: 0, at: 20, read: ['c1'] });
  assert.equal(fresh.last, 'devout-life');
  assert.equal(markRead(r, '', 'c1', 1), r);
});

check('the stored shape round trips, and a stored value that is not that shape reads as nothing (the reader starts from nothing)', () => {
  let r = savePlace(emptyReading(), 'confessions', 'c2', 0.25, 5);
  r = markRead(r, 'confessions', 'c1', 6);
  assert.deepEqual(parseReading(JSON.parse(JSON.stringify(packReading(r)))), r);
  for (const bad of [null, undefined, 0, 'x', [], {}, { v: 2, items: [] }, { v: 1 }, { v: 1, items: 'no' }, { items: [] }]) assert.equal(parseReading(bad), null, JSON.stringify(bad));
  assert.deepEqual(parseReading({ v: 1, items: [] }), { v: 1, last: null, items: [] });
});

check('a damaged place never throws: bad items are left out, a book twice is kept once, how far down is clamped, and the marks are cleaned', () => {
  const read = parseReading({
    v: 1, last: 'nope',
    items: [
      null, 7, 'x', [],
      { id: 'confessions', c: 'c2', y: 9, at: 5, read: ['c1', 'c1', 3, '', 'c2', null] },
      { id: 'confessions', c: 'c9', y: 0.1, at: 6, read: [] },
      { id: 'Not An Id', c: 'c1', y: 0, at: 0, read: [] },
      { id: '__proto__', c: 'c1', y: 0, at: 0, read: [] },
      { id: 'devout-life', c: '', y: 0, at: 0, read: [] },
      { id: 'dark-night', c: 'c1', y: 'far', at: 'then', read: 'all' },
      { id: 'x'.repeat(81), c: 'c1', y: 0, at: 0, read: [] },
    ],
  })!;
  assert.deepEqual(read.items.map((p) => p.id), ['confessions', 'dark-night']);
  assert.deepEqual(read.items[0], { id: 'confessions', c: 'c2', y: 1, at: 5, read: ['c1', 'c2'] }, 'the first of two is kept; 9 is the end; marks that are not texts, empty or twice are dropped');
  assert.deepEqual(read.items[1], { id: 'dark-night', c: 'c1', y: 0, at: 0, read: [] });
  assert.equal(read.last, 'confessions', 'a last book that is not among the places is the newest place');
  assert.equal(parseReading({ v: 1, last: 'dark-night', items: [{ id: 'confessions', c: 'c1', y: 0, at: 1, read: [] }, { id: 'dark-night', c: 'c1', y: 0, at: 0, read: [] }] })!.last, 'dark-night');
});

check('the lists are bounded: at most 40 books and 1200 read marks, so a hostile file cannot grow them', () => {
  assert.deepEqual([READING_MAX_BOOKS, READING_MAX_READ], [40, 1200], 'room for the twelve books and then some; the longest book has about 170 chapters');
  const items = Array.from({ length: READING_MAX_BOOKS + 20 }, (_, i) => ({ id: `book-${i}`, c: 'c1', y: 0, at: i, read: [] }));
  assert.equal(parseReading({ v: 1, items })!.items.length, READING_MAX_BOOKS);
  const read = Array.from({ length: READING_MAX_READ + 50 }, (_, i) => `c${i}`);
  assert.equal(parseReading({ v: 1, items: [{ id: 'confessions', c: 'c1', y: 0, at: 0, read }] })!.items[0].read.length, READING_MAX_READ);
  let r = emptyReading();
  for (let i = 0; i < READING_MAX_BOOKS + 5; i += 1) r = savePlace(r, `book-${i}`, 'c1', 0, i);
  assert.equal(r.items.length, READING_MAX_BOOKS);
  assert.equal(r.items[0].id, `book-${READING_MAX_BOOKS + 4}`, 'the newest are kept');
});

check('"Continue reading" is the book read last that still has a text: a place in a book without one is never offered', () => {
  let r = savePlace(emptyReading(), 'confessions', 'c2', 0.3, 100);
  r = savePlace(r, 'dark-night', 'c1', 0.1, 200);
  assert.equal(lastRead(r, () => true)!.id, 'dark-night');
  assert.equal(lastRead(r, (id) => id === 'confessions')!.id, 'confessions', 'the newest book has no text any more: the next newest is offered');
  assert.equal(lastRead(r, () => false), null);
  assert.equal(lastRead(emptyReading(), () => true), null);
});

check('what other screens rely on stays (the floating Continue bar reads the places): every place that is saved carries the time it was saved, in milliseconds, the book read last comes with that time, and the names and shapes below do not change', () => {
  const a = savePlace(emptyReading(), 'confessions', 'c3', 0.4, 1234);
  assert.equal(placeOf(a, 'confessions')!.at, 1234, 'a place saved by savePlace carries its time');
  const b = markRead(emptyReading(), 'devout-life', 'c1', 5678);
  assert.equal(placeOf(b, 'devout-life')!.at, 5678, 'so does a place made by marking a chapter read');
  const c = markRead(a, 'confessions', 'c1', 9999);
  assert.equal(placeOf(c, 'confessions')!.at, 1234, 'marking a chapter read does not move the place in time: it is the time the person stopped');
  const d = savePlace(a, 'imitation-of-christ', 'c1', 0, 2000);
  assert.equal(lastRead(d, () => true)!.at, 2000, 'the book read last comes with its time');
  assert.deepEqual(Object.keys(placeOf(d, 'confessions')!).sort(), ['at', 'c', 'id', 'read', 'y'], 'a place has these fields (more may be added, none taken away)');
  // what was written is read back, and a later version may write more than this one reads
  const stored = JSON.parse(JSON.stringify(packReading(d))) as { items: Array<Record<string, unknown>>; [k: string]: unknown };
  stored.items[0].later = 'a field from a later version';
  stored.later = 1;
  assert.deepEqual(parseReading(stored), parseReading(packReading(d)), 'fields it does not know are left out, the rest loads as before');
  assert.equal(reading.READING_NAME, 'library.reading');
  const api = reading as unknown as Record<string, unknown>;
  const arity: Record<string, number> = { savePlace: 5, markRead: 4, lastRead: 2, placeOf: 2, readSet: 2, parseReading: 1, packReading: 1, resumeAt: 2, startAt: 2, emptyReading: 0 };
  for (const [name, n] of Object.entries(arity)) {
    assert.equal(typeof api[name], 'function', `${name} is exported`);
    assert.equal((api[name] as (...x: unknown[]) => unknown).length, n, `${name} takes ${n} arguments`);
  }
  for (const name of ['chapterIndex', 'chapterNav', 'positionLine', 'destination', 'previousLabel', 'nextLabel', 'tocGroups', 'hasParts', 'shortTitle', 'partName', 'splitTitle', 'partSubtitle', 'scrollProgress', 'offsetFor', 'isRead', 'countWords', 'blockWords', 'groupThousands', 'readingTime', 'bookFacts', 'pieces', 'layoutBlocks', 'cleanBook', 'chapterWords', 'readButtonLabel', 'readButtonSpoken']) {
    assert.equal(typeof api[name], 'function', `${name} is exported`);
  }
});

check('where a book opens: the saved chapter and how far down, or its start when there is no place, a place that does not read, or a chapter the text no longer has', () => {
  assert.deepEqual(resumeAt(plain, { c: 'c3', y: 0.4 }), { index: 2, y: 0.4, fresh: false });
  for (const bad of [null, undefined, { c: 'c99', y: 0.5 }, { c: '', y: 0.5 }]) assert.deepEqual(resumeAt(plain, bad), { index: 0, y: 0, fresh: true });
  assert.deepEqual(resumeAt(plain, { c: 'c2', y: Number.NaN }), { index: 1, y: 0, fresh: false }, 'a chapter that is there with a damaged offset opens at its top');
  assert.deepEqual(resumeAt([], { c: 'c1', y: 0 }), { index: 0, y: 0, fresh: true });
  assert.deepEqual(resumeAt(plain, { c: 'c2', y: 3 }), { index: 2, y: 0, fresh: false }, 'a chapter read to its end opens the next one from its top');
  assert.deepEqual(resumeAt(plain, { c: 'c4', y: 1 }), { index: 3, y: 0, fresh: false }, 'after the last chapter: that chapter, from its top');
  assert.deepEqual(resumeAt(plain, { c: 'c2', y: FINISHED_AT - 0.001 }), { index: 1, y: FINISHED_AT - 0.001, fresh: false });
  assert.equal(FINISHED_AT, 0.97);
  assert.deepEqual(resumeAt(plain, { c: 'c2', y: 0.97 }), { index: 2, y: 0, fresh: false }, 'from 97 % down a chapter counts as finished');
  assert.deepEqual(resumeAt(plain, { c: 'c2', y: 0.96 }), { index: 1, y: 0.96, fresh: false }, 'and at 96 % it does not');
});

check('how far down to open a chapter: where the person was in it when it is the saved one and not finished, else the top', () => {
  assert.equal(startAt({ c: 'c3', y: 0.4 }, 'c3'), 0.4);
  assert.equal(startAt({ c: 'c3', y: 0.4 }, 'c4'), 0);
  assert.equal(startAt({ c: 'c3', y: 0.99 }, 'c3'), 0);
  assert.equal(startAt({ c: 'c3', y: 0.97 }, 'c3'), 0, 'a chapter read to 97 % opens at its top');
  assert.equal(startAt({ c: 'c3', y: 0.96 }, 'c3'), 0.96);
  assert.equal(startAt(null, 'c3'), 0);
  assert.equal(startAt({ c: 'c3', y: Number.NaN }, 'c3'), 0);
});

/* ================================================================ text sizes */

check('five text sizes, the second is the app\'s own 19, and a size that is not a step is the default (nothing, text, NaN, a step from a later version)', () => {
  assert.deepEqual([...READER_SIZES], [17, 19, 21, 24, 28]);
  assert.equal(DEFAULT_STEP, 1);
  assert.equal(READER_SIZES[DEFAULT_STEP], 19);
  assert.equal(LAST_STEP, 4);
  for (const bad of [undefined, null, 'big', Number.NaN, Infinity, {}]) assert.equal(clampStep(bad), DEFAULT_STEP, String(bad));
  assert.equal(clampStep(-3), 0);
  assert.equal(clampStep(99), LAST_STEP);
  assert.equal(clampStep(2.6), 3);
});

check('the two buttons stop at the ends: smaller from the first step is not possible, larger from the last is not, and each moves one step', () => {
  assert.equal(canShrink(0), false);
  assert.equal(canGrow(LAST_STEP), false);
  assert.equal(canShrink(1), true);
  assert.equal(canGrow(3), true);
  assert.equal(shrink(0), 0);
  assert.equal(grow(LAST_STEP), LAST_STEP);
  assert.equal(shrink(3), 2);
  assert.equal(grow(1), 2);
  assert.equal(sizeLine(0), 'Text size 1 of 5');
  assert.equal(sizeLine(4), 'Text size 5 of 5');
});

check('the stored size round trips and a stored value that is not that shape is nothing', () => {
  assert.equal(parseStep(packStep(3)), 3);
  assert.equal(parseStep({ v: 1, step: 99 }), LAST_STEP);
  for (const bad of [null, 3, 'x', {}, { v: 2, step: 1 }, { v: 1, step: 'big' }, { v: 1, step: Number.NaN }]) assert.equal(parseStep(bad), null, JSON.stringify(bad));
});

check('the combination of a step and the phone\'s own text size is capped: running text is never drawn over 36, titles never over 46, whatever the two are', () => {
  for (let step = 0; step <= LAST_STEP; step += 1) {
    const t = readerType(step);
    for (const scale of [0.8, 1, 1.15, 1.3, 1.5, 2, 3]) {
      assert.ok(drawnSize(t.body, scale) <= MAX_BODY + 1e-9, `body, step ${step}, phone ${scale}`);
      assert.ok(drawnSize(t.quote, scale) <= MAX_BODY + 1e-9, `quote, step ${step}, phone ${scale}`);
      assert.ok(drawnSize(t.title, scale) <= Math.max(MAX_TITLE, t.title.size) + 1e-9, `title, step ${step}, phone ${scale}`);
      assert.ok(drawnSize(t.heading, scale) <= Math.max(MAX_TITLE, t.heading.size) + 1e-9, `heading, step ${step}, phone ${scale}`);
    }
    assert.equal(drawnSize(t.body, 0.8), t.body.size * 0.8, 'a phone set smaller still makes it smaller');
    assert.equal(drawnSize(t.body, 1), t.body.size);
    assert.ok(t.body.maxMultiplier >= 1 && t.title.maxMultiplier >= 1);
  }
  assert.equal(drawnSize(readerType(4).body, 1.3), 35.84, 'the largest step on a phone set to 1.3 is just under the cap');
  assert.equal(drawnSize(readerType(4).body, 2), 35.84, 'and so it is on a phone set to twice');
  assert.ok(drawnSize(readerType(1).body, 1.3) > 19 * 1.29, 'the default step still follows a phone set to 1.3');
});

check('each step is larger than the one before in every face, a line is about 1.6 of the text, and a line holds about 70 characters on a wide window', () => {
  for (let step = 1; step <= LAST_STEP; step += 1) {
    const a = readerType(step - 1);
    const b = readerType(step);
    for (const k of ['body', 'quote', 'heading', 'title'] as const) assert.ok(b[k].size > a[k].size, `${k} grows from step ${step - 1} to ${step}`);
    assert.ok(b.gap > a.gap && b.measure > a.measure);
  }
  for (let step = 0; step <= LAST_STEP; step += 1) {
    const t = readerType(step);
    assert.ok(t.body.lineHeight / t.body.size >= 1.55 && t.body.lineHeight / t.body.size <= 1.65);
    const chars = t.measure / (t.body.size * 0.5);
    assert.ok(chars >= 60 && chars <= 80, `step ${step}: a line of ${t.measure} holds about ${Math.round(chars)} characters`);
    assert.ok(t.title.size > t.body.size && t.heading.size > t.body.size && t.title.size > t.heading.size);
  }
});

/* ================================================================ the A5 covers in two columns */

check('a cover is an A5 page, portrait: 148 over 210, so as high as 210/148 of its width', () => {
  assert.equal(A5_RATIO, 148 / 210);
  assert.equal(a5Height(148), 210);
  assert.equal(a5Height(173), 245);
  assert.equal(a5Height(0), 0);
});

check('two columns of covers with the 16 px margins and a 12 px gap: 173 by 245 on a 390 phone, 138 by 196 on 320, 193 by 274 on 430', () => {
  const g390 = coverGrid(390, 16);
  assert.deepEqual([g390.columns, g390.tile, g390.height, g390.gap, g390.width], [2, 173, 245, 12, 358]);
  const g320 = coverGrid(320, 16);
  assert.deepEqual([g320.tile, g320.height, g320.width], [138, 196, 288]);
  const g430 = coverGrid(430, 16);
  assert.deepEqual([g430.tile, g430.height, g430.width], [193, 274, 398]);
  assert.equal(GRID_COLUMNS, 2);
});

check('on every width from 320 to 430 the pair fits inside the margins, and the covers are A5 to within a point', () => {
  for (let screen = 320; screen <= 430; screen += 1) {
    const g = coverGrid(screen, 16);
    assert.ok(g.width <= screen - 32, `${screen}: ${g.width} wide inside ${screen - 32}`);
    assert.ok(screen - 32 - g.width <= 1, `${screen}: no more than a point left over`);
    assert.ok(Math.abs(g.tile / g.height - A5_RATIO) < 0.005, `${screen}: ${g.tile} by ${g.height} is A5`);
    assert.ok(g.tile >= 138, `${screen}: a cover is at least 138 wide`);
  }
});

check('on a tablet or a browser window the covers stop at 232 wide and the pair is as wide as two of them and the gap; a screen that is not a number gives no cover', () => {
  const wide = coverGrid(1200, 16);
  assert.deepEqual([wide.tile, wide.height, wide.width], [TILE_MAX, 329, 2 * TILE_MAX + 12]);
  assert.equal(coverGrid(Number.NaN, 16).tile, 0);
  assert.equal(coverGrid(10, 16).tile, 0);
});

check('every cover is a book: a spine, page edges, a small radius, a ribbon of a 44 touch target that stays inside the cover, and the ring and the glyph clear of it', () => {
  for (let w = 138; w <= TILE_MAX; w += 1) {
    const m = coverMetrics(w);
    assert.ok(m.spine >= 8 && m.spine <= 16 && m.edge >= 3 && m.edge <= 4);
    assert.ok(m.radius >= 3 && m.radius <= 4, `${w}: a small corner radius`);
    assert.equal(m.ribbon.touch, 44);
    assert.equal(m.ribbon.height, 44);
    // the button is 44 wide and centred on the ribbon: it must stay inside the cover, on its right
    const reach = m.ribbon.right - (m.ribbon.touch - m.ribbon.width) / 2;
    assert.ok(reach >= 0, `${w}: the ribbon button reaches ${reach} from the right edge`);
    const left = m.width - m.ribbon.right - m.ribbon.width - (m.ribbon.touch - m.ribbon.width) / 2;
    assert.ok(left > m.spine, `${w}: the ribbon button stays off the spine`);
    // the ring is in the middle of the text area and the ribbon is to the right of it
    const ringRight = m.spine + m.padX + m.text / 2 + m.medallion / 2;
    const ribbonLeft = m.width - m.ribbon.right - m.ribbon.width;
    assert.ok(ribbonLeft > ringRight, `${w}: the ribbon (${ribbonLeft}) is clear of the ring (${ringRight})`);
    assert.ok(m.padTop + m.medallion + m.gapTop >= m.ribbon.height, `${w}: the title starts under the ribbon`);
    assert.ok(m.text > 90, `${w}: the text area is ${m.text}`);
    assert.ok(m.titleBox > 55, `${w}: the room for the title is ${m.titleBox}`);
  }
});

check('every title of every book fits its cover as large as it can be, in at most four lines, with no word cut, from 320 to 430 wide and at the widest', () => {
  assert.equal(TITLE_MAX_LINES, 4, 'a title is at most four lines');
  assert.equal(coverMetrics(173).kind.maxLines, 2, 'and the kind of book at most two');
  const widths: number[] = [];
  for (let screen = 320; screen <= 430; screen += 1) widths.push(coverGrid(screen, 16).tile);
  widths.push(TILE_MAX);
  for (const w of new Set(widths)) {
    for (const b of BOOK_CATALOG) {
      const t = coverText(b, w);
      assert.ok(t.title.fits, `${b.title} at ${w}: ${t.title.lines.length} lines at ${t.title.size} do not fit`);
      assert.ok(t.title.lines.length <= TITLE_MAX_LINES && t.title.lines.length >= 1);
      assert.ok(t.title.lines.length * t.title.lineHeight <= t.m.titleBox, `${b.title} at ${w}: ${t.title.lines.length * t.title.lineHeight} high in ${t.m.titleBox}`);
      assert.ok(t.title.size >= 12, `${b.title} at ${w}: the title is ${t.title.size} (never under 12)`);
      for (const line of t.title.lines) assert.ok(textWidth('fraunces', line, t.title.size) <= t.m.text, `${b.title} at ${w}: "${line}" is too wide`);
      assert.equal(t.title.lines.join(' '), b.title.replace(/\s+/g, ' '), 'the lines are the title, nothing cut');
      assert.ok(t.kind.fits, `${b.kind} at ${w}: ${t.kind.lines.length} lines`);
      assert.ok(t.kind.lines.length <= 2);
      assert.ok(t.kind.size >= 8.5);
      assert.ok(t.timeFits, `${t.time} at ${w} is one line`);
    }
  }
});

check('the longest title of the books fits at 320, 390 and 430, and a short title is set larger than a long one', () => {
  const longest = BOOK_CATALOG.reduce((a, b) => (b.title.length > a.title.length ? b : a));
  const shortest = BOOK_CATALOG.reduce((a, b) => (b.title.length < a.title.length ? b : a));
  for (const screen of [320, 390, 430]) {
    const t = coverText(longest, coverGrid(screen, 16).tile).title;
    assert.ok(t.fits && t.lines.length >= 1 && t.lines.length <= 4, `${screen}: ${t.lines.join(' / ')}`);
  }
  const w = coverGrid(390, 16).tile;
  assert.ok(coverText(shortest, w).title.size >= coverText(longest, w).title.size, 'a short title is not set smaller than a long one');
  assert.deepEqual(coverText({ title: 'Confessions', kind: 'reflection', minutes: 109 }, w).title.lines, ['Confessions']);
});

check('a title that cannot fit says so instead of being cut: a word wider than the cover, or more lines than the cover has room for', () => {
  const m = coverMetrics(138);
  assert.equal(fitTitle('Supercalifragilisticexpialidocious', m.text, m.titleBox, m.title.max, m.title.min).fits, false);
  assert.equal(fitTitle('word '.repeat(60), m.text, m.titleBox, m.title.max, m.title.min).fits, false);
  assert.equal(fitKind('A very long kind of book that goes on and on and on and on and on', m.text, m).fits, false);
  const ok = fitTitle('The Quiet Road', m.text, m.titleBox, m.title.max, m.title.min);
  assert.ok(ok.fits && ok.size <= m.title.max && ok.size >= m.title.min);
});

check('the width of a text comes from the real fonts: a wide letter is wider than a narrow one, an accent does not change a letter, and a space is a quarter of a em', () => {
  assert.ok(textWidth('fraunces', 'W', 20) > textWidth('fraunces', 'i', 20) * 2);
  assert.equal(textWidth('fraunces', 'é', 20), textWidth('fraunces', 'e', 20));
  assert.equal(textWidth('fraunces', 'Á', 20), textWidth('fraunces', 'A', 20));
  assert.equal(textWidth('mono', 'abcde', 10), 5 * 6 * 1.04, 'JetBrains Mono: every character is 0.6 of the size');
  assert.ok(Math.abs(textWidth('inter', ' ', 1000) / 1.04 - 252) < 1e-6, 'an Inter SemiBold space');
  assert.equal(textWidth('fraunces', '', 20), 0);
  assert.ok(textWidth('fraunces', '日本', 20) > 0, 'an unknown character is counted as a wide one');
  assert.ok(textWidth('inter', 'ABC', 10, 2) > textWidth('inter', 'ABC', 10) + 5, 'letter spacing counts after every character');
  const { lines, fits } = wrap('fraunces', 'The Dialogue of Saint Catherine of Siena', 100, 16);
  assert.ok(fits && lines.length >= 3);
  assert.equal(lines.join(' '), 'The Dialogue of Saint Catherine of Siena');
  assert.deepEqual(wrap('fraunces', '', 100, 16), { lines: [], fits: true });
});

check('the shades of a cover come from its colours: the same colour with an alpha; the label of a cover says all the cover shows: the title, the kind of book and the time', () => {
  assert.equal(withAlpha('#14365D', 0.5), 'rgba(20,54,93,0.5)');
  assert.equal(withAlpha('#FFFFFF', 1), 'rgba(255,255,255,1)');
  assert.equal(coverLabel({ title: 'The French Way', kind: 'guide', minutes: 51 }), "The French Way, Pilgrim's guide, 51 minutes");
  assert.equal(coverLabel({ title: 'The Quiet Road', kind: 'reflection', minutes: 149 }), 'The Quiet Road, Readings for the Way, 2 hours 29 minutes');
  assert.equal(coverLabel({ title: 'X', kind: 'essay', minutes: 1 }), 'X, Book, 1 minute', 'a kind this app does not know is still a book');
  assert.deepEqual(coverText({ title: 'The Quiet Road', kind: 'reflection', minutes: 149 }, 173).kind.lines.join(' '), 'READINGS FOR THE WAY');
  assert.equal(coverText({ title: 'The Quiet Road', kind: 'reflection', minutes: 149 }, 173).time, '2 h 29 min');
});

/* ================================================================ the banner, the shelves and the notices of the Books tab */

const books = BOOK_CATALOG.map((b) => ({ id: b.id, title: b.title }));

check('the banner with no book says plainly that there is none to show, and has no button and no note', () => {
  const v = booksBanner([], null);
  assert.equal(v.kind, 'none');
  assert.equal(v.title, 'Books for the road');
  assert.equal((v as { line: string }).line, NONE_LINE);
  assert.ok(!('cta' in v) && !('note' in v));
});

check('the banner offers "Start reading" for the first book, and "Continue reading" for the book read last, with a note beside the button; a place in a book that is gone is not used', () => {
  const start = booksBanner(books, null);
  assert.equal(start.kind, 'start');
  assert.deepEqual(start.kind === 'start' && [start.bookId, start.cta, start.note, start.label, start.hint], [books[0].id, START_CTA, START_NOTE, books[0].title, `Opens ${books[0].title}`]);
  const second = books[1];
  const again = booksBanner(books, { id: second.id });
  assert.equal(again.kind, 'continue');
  assert.deepEqual(again.kind === 'continue' && [again.bookId, again.cta, again.note, again.label, again.hint], [second.id, CONTINUE_CTA, CONTINUE_NOTE, second.title, `Opens ${second.title} where you stopped`]);
  assert.equal(START_CTA, 'Start reading');
  assert.equal(CONTINUE_CTA, 'Continue reading');
  assert.equal(booksBanner(books, { id: 'a-book-that-was-taken-out' }).kind, 'start', 'the book of the place is not in the list: the first book');
  assert.ok(START_NOTE.length <= 7 && CONTINUE_NOTE.length <= 7, 'the note has room for seven characters beside the pill at 320');
});

check('the books are on shelves, one for each kind in the order guides then readings, each in the order of the books; a shelf with no book is not there, and a kind this app does not know has a shelf of its own', () => {
  const on = shelves(BOOK_CATALOG);
  assert.deepEqual(on.map((x) => x.kind), [...KIND_ORDER].filter((k) => BOOK_CATALOG.some((b) => b.kind === k)));
  assert.equal(on.reduce((sum, x) => sum + x.books.length, 0), BOOK_CATALOG.length, 'every book is on a shelf');
  for (const x of on) assert.deepEqual(x.books.map((b) => b.order), x.books.map((b) => b.order).slice().sort((p, q) => p - q), `${x.kind}: in the order of the shelves`);
  assert.deepEqual(shelves([{ kind: 'reflection' }]).map((x) => x.kind), ['reflection']);
  assert.deepEqual(shelves([{ kind: 'guide' }, { kind: 'essay' }]).map((x) => x.kind), ['guide', 'other']);
  assert.deepEqual(shelves([]), []);
  assert.deepEqual([kindName('guide'), kindName('reflection'), kindName('essay')], ["Pilgrim's guide", 'Readings for the Way', 'Book']);
  assert.deepEqual([kindMark('guide'), kindMark('reflection'), kindMark('essay')], ['GUIDE', 'READINGS', 'BOOK']);
  assert.deepEqual([pageNote('guide'), pageNote('reflection')], ['Buen Camino!', 'A little each day']);
});

check('every book page has its notice, chosen by kind and never empty: the guides say that no person has checked the facts yet, the readings say what is word for word and what is original, an unknown kind gets the careful one; none says verified or official', () => {
  assert.equal(noticeFor('guide'), GUIDE_NOTICE);
  assert.equal(noticeFor('reflection'), READINGS_NOTICE);
  assert.equal(noticeFor('essay'), OTHER_NOTICE);
  assert.equal(noticeFor(''), OTHER_NOTICE);
  for (const b of BOOK_CATALOG) assert.ok(noticeFor(b.kind).trim().length > 40, `${b.id}: a notice`);
  assert.match(GUIDE_NOTICE, /^Written with AI assistance\. A person has not yet checked the facts of this guide/);
  assert.match(READINGS_NOTICE, /^Passages are word for word from the public-domain edition named on the Licences screen\. The reflections are original text written with AI assistance\.$/);
  assert.doesNotMatch([GUIDE_NOTICE, READINGS_NOTICE, OTHER_NOTICE].join(' '), /verified|official|certified|reviewed/i);
});

check('the path of a book page and of its reader, with the chapter in the query', () => {
  assert.equal(bookPath('imitation-of-christ'), '/library/book/imitation-of-christ');
  assert.equal(readerPath('imitation-of-christ'), '/library/book/imitation-of-christ/read');
  assert.equal(readerPath('imitation-of-christ', 'c12'), '/library/book/imitation-of-christ/read?c=c12');
  assert.equal(readerPath('x', 'a b&c'), '/library/book/x/read?c=a%20b%26c');
});

/* ================================================================ the real books */

// The bundle of the books (mobile/assets/library): however many books there are, 1 to 100, the logic must work on every one of them.
const ids = (dir: string) => readdirSync(join(LIB, dir)).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();

check('the bundle holds a file for every book of the catalog and none besides; ids are unique and lower case; the kinds, the covers and the numbers are what the app can draw', () => {
  assert.ok(BOOK_CATALOG.length > 0);
  assert.deepEqual(ids('books'), BOOK_CATALOG.map((b) => b.id).sort());
  assert.equal(new Set(BOOK_CATALOG.map((b) => b.id)).size, BOOK_CATALOG.length);
  const COLOURS = ['goldSoft', 'blue100', 'successWash', 'red100', 'sand300', 'goldWash'];
  const GLYPHS = ['library', 'book', 'chat'];
  for (const b of BOOK_CATALOG) {
    assert.match(b.id, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.ok(b.id.length <= 80);
    assert.ok(['guide', 'reflection'].includes(b.kind), `${b.id}: kind ${b.kind}`);
    assert.ok(COLOURS.includes(b.cover.colour) && GLYPHS.includes(b.cover.icon), `${b.id}: cover ${JSON.stringify(b.cover)}`);
    assert.ok(b.title.trim() && b.subtitle.trim() && b.description.trim().length > 40, `${b.id}: title, subtitle and description`);
    assert.ok(b.chapters.length > 0 && b.words > 0 && b.minutes > 0, `${b.id}: chapters, words, minutes`);
    assert.ok(Number.isInteger(b.order));
  }
  assert.ok(Object.keys(JSON.parse(readFileSync(join(LIB, 'catalog.json'), 'utf8')).books[0]).every((k) => ['id', 'kind', 'order', 'title', 'subtitle', 'description', 'words', 'minutes', 'cover', 'chapters', 'route_slug'].includes(k)), 'the catalog has only the fields the app knows');
});

check('every real book reads as it is: cleanBook keeps every chapter and every block, the chapters are the catalog\'s (ids and titles, in order), no chapter is empty, and every block is of a kind the reader draws', () => {
  for (const entry of BOOK_CATALOG) {
    const raw = content(entry.id);
    const book = cleanBook(raw)!;
    assert.ok(book, `${entry.id} reads`);
    assert.equal(book.id, entry.id);
    assert.equal(book.kind, entry.kind);
    assert.deepEqual(book.chapters.map((c) => [c.id, c.title]), entry.chapters.map((c) => [c.id, c.title]), `${entry.id}: the chapters of the file are those of the catalog`);
    assert.ok(book.chapters.length <= READING_MAX_READ, `${entry.id}: the marks of read chapters hold ${READING_MAX_READ}`);
    book.chapters.forEach((c, i) => {
      assert.ok(c.id.length <= 80, `${entry.id} ${c.id}: an id the saved place can hold`);
      assert.ok(c.title.trim().length > 0 && c.blocks.length > 0, `${entry.id} ${c.id} has a title and blocks`);
      assert.deepEqual(c.blocks, raw.chapters[i].blocks, `${entry.id} ${c.id}: nothing of a real chapter is dropped`);
      for (const b of c.blocks) assert.ok(['p', 'h', 'ul', 'ol', 'quote', 'hr'].includes(b.t), `${entry.id} ${c.id}: block kind ${b.t}`);
    });
    assert.ok(book.credit.trim().length > 0, `${entry.id}: a credit line`);
    if (entry.kind === 'reflection') assert.ok((book.sources ?? []).length > 0 && book.credit.length > 40, `${entry.id}: a book of readings names its editions`);
  }
});

check('on every real book the words and the minutes are the catalog\'s: a chapter (its title and its blocks) at 220 a minute, rounded up, is the minutes the catalog gives it, and the chapters add up to the words of the book', () => {
  for (const entry of BOOK_CATALOG) {
    const book = content(entry.id);
    let total = 0;
    book.chapters.forEach((c, i) => {
      const words = chapterWords(c.title, c.blocks);
      total += words;
      assert.equal(readingMinutes(words), entry.chapters[i].minutes, `${entry.id} ${c.id}: ${words} words`);
    });
    assert.equal(total, entry.words, `${entry.id}: the words`);
    assert.equal(readingMinutes(total), entry.minutes, `${entry.id}: the minutes`);
  }
});

check('on every real book the contents hold each chapter once in order, Next walks the whole book and Previous undoes it, and "Continue" works from every chapter', () => {
  for (const entry of BOOK_CATALOG) {
    const book = content(entry.id);
    const groups = tocGroups(book.chapters);
    assert.deepEqual(groups.flatMap((g) => g.entries.map((x) => x.id)), book.chapters.map((c) => c.id), `${entry.id}: the contents`);
    let i = 0;
    for (let steps = 0; steps < book.chapters.length - 1; steps += 1) {
      const nav = chapterNav(book.chapters, i)!;
      assert.ok(nav.next, `${entry.id}: no next at ${i}`);
      assert.equal(chapterNav(book.chapters, nav.next!.index)!.prev!.index, i, `${entry.id}: Previous undoes Next at ${i}`);
      i = nav.next!.index;
    }
    assert.equal(i, book.chapters.length - 1, `${entry.id}: Next reaches the last chapter`);
    assert.equal(chapterNav(book.chapters, i)!.next, null);
    assert.equal(chapterNav(book.chapters, 0)!.prev, null);
    book.chapters.forEach((c, k) => {
      assert.deepEqual(resumeAt(book.chapters, { c: c.id, y: 0.5 }), { index: k, y: 0.5, fresh: false }, `${entry.id}: Continue at ${c.id}`);
      assert.ok(readButtonLabel(book.chapters, { c: c.id, y: 0.5 }).startsWith('Continue: '));
    });
  }
});

check('on every real book a title fits a button and splits in a label and a line without losing a word, and every block can be drawn: a paragraph is the same words in pieces, a list and a quotation are whole', () => {
  const words = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  for (const entry of BOOK_CATALOG) {
    const book = content(entry.id);
    for (const c of book.chapters) {
      assert.ok(shortTitle(c.title).length <= 28, `${entry.id} ${c.id}: "${shortTitle(c.title)}"`);
      const { label, subtitle } = splitTitle(c.title);
      assert.ok(label.length > 0, `${entry.id} ${c.id}: label "${label}"`);
      assert.equal(words(`${label} ${subtitle}`), words(c.title), `${entry.id} ${c.id}: the label and the line under it are the title, nothing lost`);
      if (/^day [0-9]+\b/i.test(c.title)) assert.match(label.replace(/\xa0/g, ' '), /^Day [0-9]+$/, `${entry.id} ${c.id}: a day has "Day N" for a label`);
      const items = layoutBlocks(c.blocks);
      assert.ok(items.length >= c.blocks.length, `${entry.id} ${c.id}: every block is drawn`);
      for (const b of c.blocks) if (b.t === 'p') assert.equal(pieces(plainText(b.spans)).join(''), plainText(b.spans), `${entry.id} ${c.id}: a paragraph is the same words in pieces`);
      assert.equal(items.filter((i) => i.k === 'p').reduce((sum, i) => sum + (i.k === 'p' ? plainText(i.spans).length : 0), 0), c.blocks.filter((b) => b.t === 'p').reduce((sum, b) => sum + (b.t === 'p' ? plainText(b.spans).length : 0), 0), `${entry.id} ${c.id}: the pieces keep every letter`);
    }
  }
});

check('the covers of the real books fit: every title at every width, and the kind and the time of each, were checked above for the whole catalog; here, that no two books share a cover colour and glyph with the same title', () => {
  const seen = new Set<string>();
  for (const b of BOOK_CATALOG) {
    assert.ok(!seen.has(b.title), `${b.id}: a title used twice`);
    seen.add(b.title);
  }
});

console.log(`${n} of ${n} passed (Reading)`);
