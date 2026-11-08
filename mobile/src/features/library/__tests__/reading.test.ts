// Plain-node checks of how a book is read and how its covers are drawn: the neighbours of a chapter across parts, the table of contents, how far
// down a chapter someone is, the saved place and every way it can be wrong, the text sizes and their cap, the A5 covers in two columns at every
// phone width from 320 to 430, the title and the author fitted into their covers, and the three states of the banner of the Books tab.
// No React, no React Native, no network. Run: npm run test:library (library.test.ts runs this file too).
import assert from 'node:assert/strict';
import { BOOK_CATALOG } from '../books/catalog';
import {
  CONTINUE_CTA, CONTINUE_NOTE, NONE_LINE, START_CTA, START_NOTE, booksBanner, booksNotice, bookPath, readerPath,
} from '../books/copy';
import {
  A5_RATIO, GRID_COLUMNS, TILE_MAX, TITLE_MAX_LINES, a5Height, coverGrid, coverLabel, coverMetrics, coverText, fitAuthor, fitTitle, withAlpha,
} from '../books/cover';
import {
  DEFAULT_STEP, LAST_STEP, MAX_BODY, MAX_TITLE, READER_SIZES, canGrow, canShrink, clampStep, drawnSize, grow, packStep, parseStep, readerType, shrink, sizeLine,
} from '../books/readerType';
import {
  FINISHED_AT, PIECE_MAX, READING_MAX_BOOKS, READING_MAX_READ, READ_AT, blockWords, bookFacts, chapterIndex, chapterNav, countWords, destination, emptyReading, groupThousands,
  hasParts, isRead, lastRead, markRead, nextLabel, offsetFor, packReading, parseReading, pieces, placeOf, positionLine, previousLabel, readButtonLabel, readButtonSpoken,
  readSet, readingTime, resumeAt, savePlace, scrollProgress, shortTitle, splitMarker, startAt, tocGroups, type ChapterRef,
} from '../books/reading';
import { textWidth, wrap } from '../books/typeMetrics';

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

check('the button of a book page: "Start reading" the first time, "Continue: Chapter 7" after, and the whole title with its part for a screen reader', () => {
  assert.equal(readButtonLabel(plain, null), 'Start reading');
  assert.equal(readButtonLabel(plain, { c: 'c3', y: 0.4 }).replace(/\xa0/g, ' '), 'Continue: Chapter 3');
  assert.equal(readButtonSpoken(imitation, { c: 'c4', y: 0.1 }), 'Continue: Book Two, Chapter I. Of inward things 0');
  assert.equal(readButtonSpoken(imitation, null), 'Start reading');
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

check('words and reading time: runs of non-space, 200 a minute, minutes under an hour, hours and minutes over it rounded to five', () => {
  assert.equal(countWords(''), 0);
  assert.equal(countWords('   '), 0);
  assert.equal(countWords('one'), 1);
  assert.equal(countWords(' Thou  art\ngreat, O Lord. '), 5);
  assert.equal(blockWords([{ k: 'p', t: 'a b c' }, { k: 'hr' }, { k: 'q', t: 'd\ne' }, { k: 'h', t: 'f' }, { k: 'li', t: '1. g' }]), 8);
  assert.equal(readingTime(10), '1 min');
  assert.equal(readingTime(1200), '6 min');
  assert.equal(readingTime(11800), '59 min');
  assert.equal(readingTime(12000), '1 h');
  assert.equal(readingTime(55000), '4 h 35 min');
  assert.equal(readingTime(54000), '4 h 30 min');
  assert.equal(groupThousands(55000), '55,000');
  assert.equal(groupThousands(999), '999');
  assert.equal(groupThousands(1234567), '1,234,567');
  assert.equal(bookFacts(114, 55000), '114 chapters · 55,000 words · 4 h 35 min');
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
});

check('a numbered point keeps its marker apart from its text, and a text with no marker has none', () => {
  assert.deepEqual(splitMarker('12. Of the love of God'), { marker: '12.', rest: 'Of the love of God' });
  assert.deepEqual(splitMarker('(3) The third'), { marker: '(3)', rest: 'The third' });
  assert.deepEqual(splitMarker('4) Fourth'), { marker: '4)', rest: 'Fourth' });
  assert.deepEqual(splitMarker('• A bullet'), { marker: '•', rest: 'A bullet' });
  assert.deepEqual(splitMarker('a. First of letters'), { marker: 'a.', rest: 'First of letters' });
  assert.deepEqual(splitMarker('No marker here'), { marker: '', rest: 'No marker here' });
  assert.deepEqual(splitMarker('1.5 million'), { marker: '', rest: '1.5 million' }, 'a number inside a word is not a marker');
  assert.deepEqual(splitMarker(''), { marker: '', rest: '' });
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
      { id: 'x'.repeat(61), c: 'c1', y: 0, at: 0, read: [] },
    ],
  })!;
  assert.deepEqual(read.items.map((p) => p.id), ['confessions', 'dark-night']);
  assert.deepEqual(read.items[0], { id: 'confessions', c: 'c2', y: 1, at: 5, read: ['c1', 'c2'] }, 'the first of two is kept; 9 is the end; marks that are not texts, empty or twice are dropped');
  assert.deepEqual(read.items[1], { id: 'dark-night', c: 'c1', y: 0, at: 0, read: [] });
  assert.equal(read.last, 'confessions', 'a last book that is not among the places is the newest place');
  assert.equal(parseReading({ v: 1, last: 'dark-night', items: [{ id: 'confessions', c: 'c1', y: 0, at: 1, read: [] }, { id: 'dark-night', c: 'c1', y: 0, at: 0, read: [] }] })!.last, 'dark-night');
});

check('the lists are bounded: at most 40 books and 1200 read marks, so a hostile file cannot grow them', () => {
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

check('where a book opens: the saved chapter and how far down, or its start when there is no place, a place that does not read, or a chapter the text no longer has', () => {
  assert.deepEqual(resumeAt(plain, { c: 'c3', y: 0.4 }), { index: 2, y: 0.4, fresh: false });
  for (const bad of [null, undefined, { c: 'c99', y: 0.5 }, { c: '', y: 0.5 }]) assert.deepEqual(resumeAt(plain, bad), { index: 0, y: 0, fresh: true });
  assert.deepEqual(resumeAt(plain, { c: 'c2', y: Number.NaN }), { index: 1, y: 0, fresh: false }, 'a chapter that is there with a damaged offset opens at its top');
  assert.deepEqual(resumeAt([], { c: 'c1', y: 0 }), { index: 0, y: 0, fresh: true });
  assert.deepEqual(resumeAt(plain, { c: 'c2', y: 3 }), { index: 2, y: 0, fresh: false }, 'a chapter read to its end opens the next one from its top');
  assert.deepEqual(resumeAt(plain, { c: 'c4', y: 1 }), { index: 3, y: 0, fresh: false }, 'after the last chapter: that chapter, from its top');
  assert.deepEqual(resumeAt(plain, { c: 'c2', y: FINISHED_AT - 0.001 }), { index: 1, y: FINISHED_AT - 0.001, fresh: false });
});

check('how far down to open a chapter: where the person was in it when it is the saved one and not finished, else the top', () => {
  assert.equal(startAt({ c: 'c3', y: 0.4 }, 'c3'), 0.4);
  assert.equal(startAt({ c: 'c3', y: 0.4 }, 'c4'), 0);
  assert.equal(startAt({ c: 'c3', y: 0.99 }, 'c3'), 0);
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

check('every title of the twelve fits its cover as large as it can be, in at most four lines, with no word cut, from 320 to 430 wide and at the widest', () => {
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
      assert.ok(t.author.fits, `${b.author} at ${w}: ${t.author.lines.length} lines`);
      assert.ok(t.author.lines.length <= 2);
      assert.ok(t.author.size >= 8.5);
      assert.ok(t.eraFits, `${b.era} at ${w} is one line`);
    }
  }
});

check('the longest title, "The Dialogue of Saint Catherine of Siena", fits at 320, 390 and 430 in three or four lines, and a short title is set larger than a long one', () => {
  const dialogue = BOOK_CATALOG.find((b) => b.id === 'dialogue-of-st-catherine')!;
  for (const screen of [320, 390, 430]) {
    const t = coverText(dialogue, coverGrid(screen, 16).tile).title;
    assert.ok(t.fits && t.lines.length >= 2 && t.lines.length <= 4, `${screen}: ${t.lines.join(' / ')}`);
  }
  const conf = BOOK_CATALOG.find((b) => b.id === 'confessions')!;
  const w = coverGrid(390, 16).tile;
  assert.ok(coverText(conf, w).title.size > coverText(dialogue, w).title.size);
  assert.deepEqual(coverText(conf, w).title.lines, ['Confessions']);
});

check('a title that cannot fit says so instead of being cut: a word wider than the cover, or more lines than the cover has room for', () => {
  const m = coverMetrics(138);
  assert.equal(fitTitle('Supercalifragilisticexpialidocious', m.text, m.titleBox, m.title.max, m.title.min).fits, false);
  assert.equal(fitTitle('word '.repeat(60), m.text, m.titleBox, m.title.max, m.title.min).fits, false);
  assert.equal(fitAuthor('A very long author name that goes on and on and on and on and on', m.text, m).fits, false);
  const ok = fitTitle('The Way of a Pilgrim', m.text, m.titleBox, m.title.max, m.title.min);
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

check('the shades of a cover come from its colours: the same colour with an alpha, and the label of a cover for a screen reader says free or soon', () => {
  assert.equal(withAlpha('#14365D', 0.5), 'rgba(20,54,93,0.5)');
  assert.equal(withAlpha('#FFFFFF', 1), 'rgba(255,255,255,1)');
  assert.equal(coverLabel({ title: 'The Way of a Pilgrim', author: 'Anonymous' }, true), 'The Way of a Pilgrim, Anonymous, free');
  assert.equal(coverLabel({ title: 'The Way of a Pilgrim', author: 'Anonymous' }, false), 'The Way of a Pilgrim, Anonymous, soon');
});

/* ================================================================ the banner and the notice of the Books tab */

const books = BOOK_CATALOG.map((b) => ({ id: b.id, title: b.title }));

check('the banner with no text in any book says plainly that the texts are being checked, and has no button and no note', () => {
  const v = booksBanner(books, () => false, null);
  assert.equal(v.kind, 'none');
  assert.equal(v.title, 'Books for the road');
  assert.equal((v as { line: string }).line, NONE_LINE);
  assert.equal(NONE_LINE, 'The texts are being checked.');
  assert.ok(!('cta' in v) && !('note' in v));
  assert.equal(v.label, 'Books · 12 free');
  const lastIsGone = booksBanner(books, () => false, { id: 'confessions' });
  assert.equal(lastIsGone.kind, 'none', 'a place in a book without a text opens nothing');
});

check('the banner offers "Start reading" for the first book that has a text, and "Continue reading" for the book read last, with a note beside the button', () => {
  const has = (id: string) => id === 'confessions' || id === 'imitation-of-christ' || id === 'story-of-a-soul';
  const start = booksBanner(books, has, null);
  assert.equal(start.kind, 'start');
  assert.deepEqual(start.kind === 'start' && [start.bookId, start.cta, start.note, start.label, start.hint], ['imitation-of-christ', START_CTA, START_NOTE, 'The Imitation of Christ', 'Opens The Imitation of Christ']);
  const again = booksBanner(books, has, { id: 'confessions' });
  assert.equal(again.kind, 'continue');
  assert.deepEqual(again.kind === 'continue' && [again.bookId, again.cta, again.note, again.label, again.hint], ['confessions', CONTINUE_CTA, CONTINUE_NOTE, 'Confessions', 'Opens Confessions where you stopped']);
  assert.equal(START_CTA, 'Start reading');
  assert.equal(CONTINUE_CTA, 'Continue reading');
  assert.equal(booksBanner(books, has, { id: 'dark-night' }).kind, 'start', 'the last book has no text: the first that has one');
  assert.equal(booksBanner(books, () => true, null).kind === 'start' && (booksBanner(books, () => true, null) as { bookId: string }).bookId, 'way-of-a-pilgrim');
});

check('the notice under the banner: the old preview words with no text, how many are in the app with some, nothing when all twelve are', () => {
  assert.deepEqual(booksNotice(0, 12), { title: 'Preview', text: 'Books are not in the app yet. We are checking the editions before we add them.' });
  const some = booksNotice(3, 12)!;
  assert.equal(some.title, 'More books are coming');
  assert.match(some.text, /^3 of the 12 books are in the app and can be read with no signal\. The others say Soon/);
  assert.match(booksNotice(1, 12)!.text, /^1 of the 12 books is in the app/);
  assert.equal(booksNotice(12, 12), null);
  assert.doesNotMatch(JSON.stringify([booksNotice(0, 12), booksNotice(5, 12)]), /verified|official|certified/i);
});

check('the path of a book page and of its reader, with the chapter in the query', () => {
  assert.equal(bookPath('imitation-of-christ'), '/library/book/imitation-of-christ');
  assert.equal(readerPath('imitation-of-christ'), '/library/book/imitation-of-christ/read');
  assert.equal(readerPath('imitation-of-christ', 'c12'), '/library/book/imitation-of-christ/read?c=c12');
  assert.equal(readerPath('x', 'a b&c'), '/library/book/x/read?c=a%20b%26c');
});

console.log(`${n} of ${n} passed (Reading)`);
