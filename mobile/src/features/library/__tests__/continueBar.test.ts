// Plain-node checks of the "Continue reading" bar that floats above the tab bar of the Library: which place it continues (the most recent of the Bible's last chapter and
// the books' last place), what it says and where it goes, closing it and bringing it back (a place is hidden only until the saved place changes, a stored value that does not
// read hides nothing), and the numbers that keep it clear of the tab bar. No React, no React Native, no network, nothing stored. The screens are checked in
// continueBarWiring.test.ts. Run: npm run test:library (library.test.ts runs this file too).
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONTINUE_TITLE, LAST_READ_NAME, packLastRead } from '../bible/lastRead';
import { BOOK_CATALOG } from '../books/catalog';
import { READING_NAME, chapterNav, emptyReading, positionLine, savePlace, type ChapterRef } from '../books/reading';
import { BAR_GAP, BAR_HEIGHT, BAR_ROOM, CLOSE_SIZE, TAB_BAR_HEIGHT, barBottom, tabBarBottom } from '../continueBar/barLayout';
import { HIDDEN_NAME, isHidden, markOf, packHidden, parseHidden } from '../continueBar/hidden';
import {
  HIDE_LABEL, OPEN_HINT, barVisible, bibleSpotOf, bookSpotOf, describeBible, describeBook, latestSpot, stampOf, type BibleSpot, type BookSpot, type Spot,
} from '../continueBar/spot';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };

const root = process.cwd(); // npm test runs from mobile/
const bible = (code: string, chapter: number, at: number): BibleSpot => ({ kind: 'bible', code, chapter, at });
const book = (id: string, c: string, y: number, at: number): BookSpot => ({ kind: 'book', id, c, y, at });
const chapters = (count: number): ChapterRef[] => Array.from({ length: count }, (_, i) => ({ id: `c${i + 1}`, title: `Chapter ${i + 1}` }));
/** What a stored value looks like after the phone has written it and read it back, as a restart does. */
const stored = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

/* ================================================================ the most recent place */

check('the bar continues the most recent place: the Bible when its time is later, a book when its time is later', () => {
  const g = bible('GEN', 3, 2000);
  const b = book('imitation-of-christ', 'c2', 0.3, 1000);
  assert.deepEqual(latestSpot(g, b), g, 'the Bible was read last');
  assert.deepEqual(latestSpot(bible('GEN', 3, 1000), book('imitation-of-christ', 'c2', 0.3, 2000)), book('imitation-of-christ', 'c2', 0.3, 2000), 'a book was read last');
});

check('with only one of the two there is only one choice, and with neither there is no bar', () => {
  const g = bible('PSA', 121, 5);
  const b = book('confessions', 'c4', 0.5, 5);
  assert.deepEqual(latestSpot(g, null), g);
  assert.deepEqual(latestSpot(null, b), b);
  assert.equal(latestSpot(null, null), null);
  assert.deepEqual(latestSpot(bible('PSA', 121, 0), null), bible('PSA', 121, 0), 'a place with no time is still a place when it is the only one');
});

check('equal times: the Bible wins (it is the first tab); a place with no time loses to one that has a time, whichever side it is on', () => {
  assert.equal(latestSpot(bible('GEN', 1, 700), book('confessions', 'c1', 0, 700))!.kind, 'bible', 'the same millisecond');
  assert.equal(latestSpot(bible('GEN', 1, 0), book('confessions', 'c1', 0, 0))!.kind, 'bible', 'neither has a time');
  assert.equal(latestSpot(bible('GEN', 1, 0), book('confessions', 'c1', 0, 1))!.kind, 'book', 'the Bible has no time, the book has');
  assert.equal(latestSpot(bible('GEN', 1, 1), book('confessions', 'c1', 0, 0))!.kind, 'bible', 'the book has no time, the Bible has');
});

check('the chapter of the Bible is read from what the Bible keeps (its own parser judges the place), with its time; an older value with no time, or a damaged time, still loads as time 0', () => {
  assert.deepEqual(bibleSpotOf(stored(packLastRead({ code: 'GEN', chapter: 3 }, 1731068400000))), bible('GEN', 3, 1731068400000));
  assert.equal(LAST_READ_NAME, 'library.lastRead', 'the bar reads the key the Bible keeps');
  assert.deepEqual(bibleSpotOf({ v: 1, code: 'PSA', chapter: 121 }), bible('PSA', 121, 0), 'a value from before the time was kept');
  for (const at of ['soon', -5, 0, Number.NaN, Number.POSITIVE_INFINITY, null, undefined, {}, [], true]) {
    assert.deepEqual(bibleSpotOf({ v: 1, code: 'JHN', chapter: 3, at }), bible('JHN', 3, 0), `a time of ${String(at)} is no time, and the place still loads`);
  }
  for (const bad of [undefined, null, 0, 7, 'x', '', true, [], [1], {}, { v: 1 }, { v: 2, code: 'PSA', chapter: 1, at: 1 }, { v: 1, code: 'ZZZ', chapter: 1, at: 1 }, { v: 1, code: 'PSA', chapter: 151, at: 1 }, { v: 1, code: 'PSA', chapter: 0, at: 1 }, { v: 1, code: 'PSA', chapter: 1.5, at: 1 }, { v: 1, code: 'PSA', chapter: '1', at: 1 }, { v: 1, code: 'bible-additions-to-esther', chapter: 1, at: 1 }]) {
    assert.equal(bibleSpotOf(bad), null, `${JSON.stringify(bad)} is no place`);
  }
  assert.equal(stampOf(12), 12);
  assert.equal(stampOf('12'), 0);
});

check('the book is the one read last that still has a text, with where the person stopped and when; a book with no text is never offered', () => {
  assert.equal(READING_NAME, 'library.reading', 'the bar reads the key the books keep');
  let r = savePlace(emptyReading(), 'confessions', 'c4', 0.5, 100);
  r = savePlace(r, 'imitation-of-christ', 'c2', 0.3, 200);
  assert.deepEqual(bookSpotOf(r, () => true), book('imitation-of-christ', 'c2', 0.3, 200));
  assert.deepEqual(bookSpotOf(r, (id) => id === 'confessions'), book('confessions', 'c4', 0.5, 100), 'the newest book has no text: the next newest is offered');
  assert.equal(bookSpotOf(r, () => false), null);
  assert.equal(bookSpotOf(emptyReading(), () => true), null, 'nothing read');
});

/* ================================================================ what the bar says and where it goes */

check('a chapter of the Bible: the place as the Bible names it ("Genesis 3", "Psalm 121", "1 Corinthians 13"), the closed book with a cross, and the address of the reader', () => {
  const a = describeBible(bible('GEN', 3, 1));
  assert.deepEqual(a, { icon: 'book', label: 'Genesis 3', spoken: 'Continue reading, Genesis 3', href: '/library/bible/GEN/3' });
  assert.equal(describeBible(bible('PSA', 121, 1)).label, 'Psalm 121');
  assert.equal(describeBible(bible('1CO', 13, 1)).label, '1 Corinthians 13');
  assert.equal(describeBible(bible('1CO', 13, 1)).spoken, 'Continue reading, 1 Corinthians 13');
  assert.equal(CONTINUE_TITLE, 'Continue reading', 'the words over the place');
});

check('a book: its title and the chapter the reader opens, counted as the reader counts ("Chapter 2 of 114"), the open book, and the address of the reader of the book (which opens where the person stopped)', () => {
  const title = BOOK_CATALOG.find((b) => b.id === 'imitation-of-christ')!.title;
  assert.equal(title, 'The Imitation of Christ');
  const v = describeBook(book('imitation-of-christ', 'c2', 0.3, 1), chapters(114))!;
  assert.deepEqual(v, { icon: 'library', label: 'The Imitation of Christ · Chapter 2', spoken: 'Continue reading, The Imitation of Christ, Chapter 2', href: '/library/book/imitation-of-christ/read' });
  const nav = chapterNav(chapters(114), 1)!;
  assert.equal(positionLine(nav), 'Chapter 2 of 114', 'the reader says the same number in its header');
});

check('a chapter read to its last lines is continued from the next chapter, as the book page does; after the last chapter it stays on the last; a chapter the text does not have gives the first', () => {
  assert.equal(describeBook(book('confessions', 'c4', 0.96, 1), chapters(13))!.label, 'Confessions · Chapter 4', 'not yet finished');
  assert.equal(describeBook(book('confessions', 'c4', 0.97, 1), chapters(13))!.label, 'Confessions · Chapter 5', 'finished: the next one, from its top');
  assert.equal(describeBook(book('confessions', 'c13', 1, 1), chapters(13))!.label, 'Confessions · Chapter 13', 'the last chapter, finished');
  assert.equal(describeBook(book('confessions', 'c999', 0.7, 1), chapters(13))!.label, 'Confessions · Chapter 1', 'the saved chapter is not in the text');
  assert.equal(describeBook(book('confessions', 'c4', 0.5, 1), chapters(13))!.spoken, 'Continue reading, Confessions, Chapter 4');
});

check('a text that cannot be read gives the title alone, and a book that is not in the catalog is not offered', () => {
  for (const none of [null, []]) {
    const v = describeBook(book('confessions', 'c4', 0.5, 1), none)!;
    assert.equal(v.label, 'Confessions');
    assert.equal(v.spoken, 'Continue reading, Confessions');
    assert.equal(v.href, '/library/book/confessions/read');
  }
  assert.equal(describeBook(book('no-such-book', 'c1', 0, 1), chapters(3)), null);
});

check('the same on the real texts in the app: for every book that has one, the first and the last chapter are named by their place in the book, and the title is the catalog\'s', () => {
  const dir = join(root, 'assets', 'books');
  if (!existsSync(join(dir, 'index.json'))) return; // no texts in this checkout: nothing to read
  const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) as Array<{ id: string }>;
  for (const { id } of index) {
    const text = JSON.parse(readFileSync(join(dir, `${id}.json`), 'utf8')) as { chapters: ChapterRef[] };
    const catalog = BOOK_CATALOG.find((b) => b.id === id)!;
    for (const at of [0, text.chapters.length - 1]) {
      const v = describeBook(book(id, text.chapters[at].id, 0.2, 1), text.chapters)!;
      assert.equal(v.label, `${catalog.title} · Chapter ${at + 1}`, id);
      assert.ok(v.spoken.startsWith(`Continue reading, ${catalog.title}`), id);
    }
  }
});

check('the labels of the two buttons: the bar is named by what it continues, and the close button says what it hides', () => {
  assert.equal(HIDE_LABEL, 'Hide Continue reading');
  assert.equal(OPEN_HINT, 'Opens the reader where you stopped');
});

check('the bar is drawn only when there is a place nobody hid, and nobody is typing (the keyboard is open or the search field has the focus)', () => {
  assert.equal(barVisible({ present: true, typing: false }), true);
  assert.equal(barVisible({ present: true, typing: true }), false, 'with the keyboard up the bar would float over the keys');
  assert.equal(barVisible({ present: false, typing: false }), false);
  assert.equal(barVisible({ present: false, typing: true }), false);
});

/* ================================================================ closing it, and bringing it back */

const g3: Spot = bible('GEN', 3, 1731068400000);
const bk2: Spot = book('imitation-of-christ', 'c2', 0.4, 1731068500000);

check('closed, the same place stays closed: also after the phone has written the mark and read it back (a restart), and whatever else is on the screen', () => {
  for (const spot of [g3, bk2]) {
    const mark = parseHidden(stored(packHidden(markOf(spot))));
    assert.ok(mark, 'the mark reads back');
    assert.equal(isHidden(mark, spot), true, `${spot.kind}: still hidden after a restart`);
  }
  assert.equal(HIDDEN_NAME, 'library.continueHidden');
});

check('a different place brings the bar back: another chapter, another book, the same chapter saved again later (the person read on), or the other kind of place', () => {
  const hidG = markOf(g3);
  assert.equal(isHidden(hidG, bible('GEN', 4, g3.at)), false, 'another chapter');
  assert.equal(isHidden(hidG, bible('EXO', 3, g3.at)), false, 'another book of the Bible, the same chapter number');
  assert.equal(isHidden(hidG, bible('GEN', 3, g3.at + 1)), false, 'the same chapter, a newer time');
  assert.equal(isHidden(hidG, bk2), false, 'a book is read now');
  const hidB = markOf(bk2);
  assert.equal(isHidden(hidB, book('imitation-of-christ', 'c3', 0.4, bk2.at)), false, 'another chapter of the book');
  assert.equal(isHidden(hidB, book('confessions', 'c2', 0.4, bk2.at)), false, 'another book, the same chapter id');
  assert.equal(isHidden(hidB, book('imitation-of-christ', 'c2', 0.4, bk2.at + 1)), false, 'the same chapter, a newer time');
  assert.equal(isHidden(hidB, g3), false, 'the Bible is read now');
});

check('how far down a book chapter the person was is not part of what is closed: the time is, and the time moves with every save', () => {
  const hid = markOf(book('imitation-of-christ', 'c2', 0.1, 50));
  assert.equal(isHidden(hid, book('imitation-of-christ', 'c2', 0.9, 50)), true);
  assert.equal(isHidden(hid, book('imitation-of-christ', 'c2', 0.9, 51)), false);
  assert.deepEqual(Object.keys(markOf(bk2)).sort(), ['at', 'c', 'id', 'kind', 'v']);
  assert.deepEqual(Object.keys(markOf(g3)).sort(), ['at', 'chapter', 'code', 'kind', 'v']);
});

check('nothing closed, or nothing to continue, hides nothing', () => {
  assert.equal(isHidden(null, g3), false);
  assert.equal(isHidden(markOf(g3), null), false);
  assert.equal(isHidden(null, null), false);
});

check('a stored value that does not read means "not hidden": nothing stored, another version, a wrong type, a chapter that is no number, a string that is empty or too long, a time that is not a time', () => {
  const long = 'x'.repeat(61);
  const corrupt: unknown[] = [
    undefined, null, 0, 1, 'x', '', 'true', true, [], [1], {}, { v: 1 }, { v: '1', kind: 'bible', code: 'GEN', chapter: 3, at: 1 }, { v: 2, kind: 'bible', code: 'GEN', chapter: 3, at: 1 },
    { v: 1, kind: 'other', code: 'GEN', chapter: 3, at: 1 }, { v: 1, code: 'GEN', chapter: 3, at: 1 }, { v: 1, kind: 'bible', chapter: 3, at: 1 },
    { v: 1, kind: 'bible', code: '', chapter: 3, at: 1 }, { v: 1, kind: 'bible', code: long, chapter: 3, at: 1 }, { v: 1, kind: 'bible', code: 7, chapter: 3, at: 1 },
    { v: 1, kind: 'bible', code: 'GEN', chapter: '3', at: 1 }, { v: 1, kind: 'bible', code: 'GEN', chapter: 0, at: 1 }, { v: 1, kind: 'bible', code: 'GEN', chapter: -1, at: 1 },
    { v: 1, kind: 'bible', code: 'GEN', chapter: 1.5, at: 1 }, { v: 1, kind: 'bible', code: 'GEN', chapter: 1000, at: 1 }, { v: 1, kind: 'bible', code: 'GEN', chapter: Number.NaN, at: 1 },
    { v: 1, kind: 'bible', code: 'GEN', chapter: 3 }, { v: 1, kind: 'bible', code: 'GEN', chapter: 3, at: 'now' }, { v: 1, kind: 'bible', code: 'GEN', chapter: 3, at: -1 },
    { v: 1, kind: 'bible', code: 'GEN', chapter: 3, at: Number.NaN }, { v: 1, kind: 'bible', code: 'GEN', chapter: 3, at: Number.POSITIVE_INFINITY }, { v: 1, kind: 'bible', code: 'GEN', chapter: 3, at: 9e15 },
    { v: 1, kind: 'book', c: 'c2', at: 1 }, { v: 1, kind: 'book', id: 'confessions', at: 1 }, { v: 1, kind: 'book', id: 'confessions', c: 2, at: 1 }, { v: 1, kind: 'book', id: '', c: 'c2', at: 1 },
    { v: 1, kind: 'book', id: long, c: 'c2', at: 1 }, { v: 1, kind: 'book', id: 'confessions', c: long, at: 1 }, { v: 1, kind: 'book', id: 'confessions', c: 'c2' },
  ];
  for (const bad of corrupt) {
    const mark = parseHidden(bad);
    assert.equal(mark, null, `${JSON.stringify(bad)} reads as nothing`);
    assert.equal(isHidden(mark, g3), false);
    assert.equal(isHidden(mark, bk2), false);
  }
});

check('what is read is only the fields of the shape, a new object, whatever else the stored one holds; a time of 0 (a place with no time) can be closed and is hidden only while it is still that place', () => {
  const read = parseHidden({ v: 1, kind: 'bible', code: 'GEN', chapter: 3, at: 5, extra: 'x', y: 0.5 });
  assert.deepEqual(read, { v: 1, kind: 'bible', code: 'GEN', chapter: 3, at: 5 });
  const spot = bible('GEN', 3, 0);
  assert.equal(isHidden(parseHidden(stored(packHidden(markOf(spot)))), spot), true);
  assert.equal(isHidden(parseHidden(stored(packHidden(markOf(spot)))), bible('GEN', 3, 9)), false);
});

/* ================================================================ where it sits */

check('the bar is 8 above the tab bar and 64 high, and never touches it, on every phone from no home indicator to the tallest', () => {
  assert.equal(BAR_HEIGHT, 64);
  assert.equal(BAR_GAP, 8);
  assert.equal(TAB_BAR_HEIGHT, 88);
  for (const inset of [0, 8, 14, 20, 24, 34, 47, 59]) {
    const tabTop = tabBarBottom(inset) + TAB_BAR_HEIGHT;
    assert.equal(barBottom(inset) - tabTop, 8, `inset ${inset}: 8 between the bar and the tab bar`);
    assert.ok(barBottom(inset) > tabTop, `inset ${inset}: the bar is above the tab bar, not over it`);
  }
  assert.equal(tabBarBottom(0), 10, 'the tab bar keeps 10 from the bottom when there is no home indicator');
  assert.equal(tabBarBottom(34), 20, 'and inset - 14 when there is');
});

check('the lists keep the bar\'s room at their end: without it the last row would be under the bar, with it the row ends at least 24 above it, on every phone', () => {
  const tokens = JSON.parse(readFileSync(join(root, 'src', 'theme', 'tokens.json'), 'utf8')) as { layout: { tabbarHeight: number } };
  assert.equal(BAR_ROOM, BAR_HEIGHT + BAR_GAP);
  for (const inset of [0, 20, 34, 47]) {
    const usual = tokens.layout.tabbarHeight + inset + 40; // components/Screen.tsx: what a list keeps free at its end for the tab bar
    const barTop = barBottom(inset) + BAR_HEIGHT;
    assert.ok(usual < barTop + 24, `inset ${inset}: the usual room (${usual}) is not enough to clear the bar (top ${barTop})`);
    assert.ok(usual + BAR_ROOM >= barTop + 24, `inset ${inset}: ${usual} + ${BAR_ROOM} reaches ${barTop} + 24`);
  }
});

check('the button that hides the bar is at least 44 by 44, and fits inside the bar with room to spare', () => {
  assert.ok(CLOSE_SIZE >= 44, `${CLOSE_SIZE}`);
  assert.ok(CLOSE_SIZE <= BAR_HEIGHT - 8, 'it does not touch the top and the bottom of the bar');
});

console.log(`${n} of ${n} passed (Continue reading bar)`);
