// Plain-node checks of the "Continue reading" bar that floats above the tab bar of the Library: which place it continues (the most recent of the Bible's last chapter and
// the books' last place), what it says and where it goes, closing it and bringing it back (a place is hidden only until the saved place changes, a stored value that does not
// read hides nothing), and the numbers that keep it clear of the tab bar. No React, no React Native, no network, nothing stored. The screens are checked in
// continueBarWiring.test.ts. Run: npm run test:library (library.test.ts runs this file too, after it has set the bundle of the books up).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BIBLE_BOOKS } from '../bible/books';
import { CONTINUE_TITLE, LAST_READ_NAME, packLastRead } from '../bible/lastRead';
import { placeLabel } from '../bible/order';
import { bookById, BOOK_CATALOG } from '../books/catalog';
import { READING_NAME, chapterNav, emptyReading, positionLine, savePlace, type ChapterRef } from '../books/reading';
import { safeText } from '../books/safeText';
import { BAR_GAP, BAR_HEIGHT, BAR_ROOM, CLOSE_SIZE, TAB_BAR_HEIGHT, barBottom, tabBarBottom } from '../continueBar/barLayout';
import { HIDDEN_NAME, isHidden, markOf, packHidden, parseHidden, viewToDraw, type Loaded } from '../continueBar/hidden';
import {
  HIDE_LABEL, OPEN_HINT, barVisible, bibleSpotOf, bookSpotOf, describeBible, describeBook, latestSpot, pickPlace, stampOf, type BibleSpot, type BookSpot, type Spot, type SpotView,
} from '../continueBar/spot';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };

const root = process.cwd(); // npm test runs from mobile/
const bible = (code: string, chapter: number, at: number): BibleSpot => ({ kind: 'bible', code, chapter, at });
const book = (id: string, c: string, y: number, at: number): BookSpot => ({ kind: 'book', id, c, y, at });
const chapters = (count: number): ChapterRef[] => Array.from({ length: count }, (_, i) => ({ id: `c${i + 1}`, title: `Chapter ${i + 1}` }));
/** What a stored value looks like after the phone has written it and read it back, as a restart does. */
const stored = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

// Two books of the Library, by their real ids: a book of readings and a book of readings with a longer title, and a guide.
const QUIET = 'imitation-of-christ-readings';
const HEART = 'confessions-readings';
const FRENCH = 'camino-frances-guide';

/* ================================================================ the most recent place */

check('the bar continues the most recent place: the Bible when its time is later, a book when its time is later', () => {
  const g = bible('GEN', 3, 2000);
  const b = book(QUIET, 'c2', 0.3, 1000);
  assert.deepEqual(latestSpot(g, b), g, 'the Bible was read last');
  assert.deepEqual(latestSpot(bible('GEN', 3, 1000), book(QUIET, 'c2', 0.3, 2000)), book(QUIET, 'c2', 0.3, 2000), 'a book was read last');
});

check('with only one of the two there is only one choice, and with neither there is no bar', () => {
  const g = bible('PSA', 121, 5);
  const b = book(HEART, 'c4', 0.5, 5);
  assert.deepEqual(latestSpot(g, null), g);
  assert.deepEqual(latestSpot(null, b), b);
  assert.equal(latestSpot(null, null), null);
  assert.deepEqual(latestSpot(bible('PSA', 121, 0), null), bible('PSA', 121, 0), 'a place with no time is still a place when it is the only one');
});

check('equal times: the Bible wins (it is the first tab); a place with no time loses to one that has a time, whichever side it is on', () => {
  assert.equal(latestSpot(bible('GEN', 1, 700), book(HEART, 'c1', 0, 700))!.kind, 'bible', 'the same millisecond');
  assert.equal(latestSpot(bible('GEN', 1, 0), book(HEART, 'c1', 0, 0))!.kind, 'bible', 'neither has a time');
  assert.equal(latestSpot(bible('GEN', 1, 0), book(HEART, 'c1', 0, 1))!.kind, 'book', 'the Bible has no time, the book has');
  assert.equal(latestSpot(bible('GEN', 1, 1), book(HEART, 'c1', 0, 0))!.kind, 'bible', 'the book has no time, the Bible has');
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

check('the book is the one read last that can be opened (the caller says which can), with where the person stopped and when; a book that cannot be opened is never offered', () => {
  assert.equal(READING_NAME, 'library.reading', 'the bar reads the key the books keep');
  let r = savePlace(emptyReading(), HEART, 'c4', 0.5, 100);
  r = savePlace(r, QUIET, 'c2', 0.3, 200);
  assert.deepEqual(bookSpotOf(r, () => true), book(QUIET, 'c2', 0.3, 200));
  assert.deepEqual(bookSpotOf(r, (id) => id === HEART), book(HEART, 'c4', 0.5, 100), 'the newest book cannot be opened: the next newest is offered');
  assert.equal(bookSpotOf(r, () => false), null);
  assert.equal(bookSpotOf(emptyReading(), () => true), null, 'nothing read');
});

/* ================================================================ the place the bar continues, from what the phone holds */

/** The text of a book as the bar asks for it: the chapters of the books given (with this many chapters), none for any other (a book that cannot be opened). */
const texts = (...ids: string[]) => (id: string) => (ids.includes(id) ? { chapters: chapters(24) } : null);
const stamped = (code: string, chapter: number, at: number) => ({ v: 1, code, chapter, at });
const readingOf = (...places: Array<[id: string, c: string, y: number, at: number]>) => places.reduce((r, [id, c, y, at]) => savePlace(r, id, c, y, at), emptyReading());

check('pickPlace: the Bible alone, a book alone, both (the more recent wins), and nothing', () => {
  const g = pickPlace(stamped('GEN', 3, 100), emptyReading(), texts())!;
  assert.deepEqual([g.spot.kind, g.view.label, g.view.href], ['bible', 'Genesis 3', '/library/bible/GEN/3']);
  const b = pickPlace(null, readingOf([QUIET, 'c5', 0.3, 100]), texts(QUIET))!;
  assert.deepEqual([b.spot.kind, b.view.label], ['book', 'The Quiet Road · Chapter 5']);
  assert.equal(pickPlace(stamped('GEN', 3, 100), readingOf([QUIET, 'c5', 0.3, 200]), texts(QUIET))!.view.label, 'The Quiet Road · Chapter 5', 'the book was read later');
  assert.equal(pickPlace(stamped('GEN', 3, 300), readingOf([QUIET, 'c5', 0.3, 200]), texts(QUIET))!.view.label, 'Genesis 3', 'the Bible was read later');
  assert.equal(pickPlace(stamped('GEN', 3, 200), readingOf([QUIET, 'c5', 0.3, 200]), texts(QUIET))!.view.label, 'Genesis 3', 'the same millisecond: the Bible');
  assert.equal(pickPlace(null, emptyReading(), texts()), null, 'nothing was read');
  assert.equal(pickPlace('damaged', emptyReading(), texts()), null, 'a value that is not a place is no place');
});

check('pickPlace: a book that cannot be opened is passed over, for the next book, or for the Bible, however recent it is: the bar never offers what cannot open', () => {
  const reading = readingOf([HEART, 'c2', 0.1, 100], [QUIET, 'c5', 0.3, 200]); // the Quiet Road was read last
  assert.equal(pickPlace(null, reading, texts(HEART))!.view.label, 'The Restless Heart · Chapter 2', 'the newest book has no text: the next newest is offered');
  assert.equal(pickPlace(stamped('GEN', 3, 50), reading, texts())!.view.label, 'Genesis 3', 'no book opens: the Bible, though it is the oldest place');
  assert.equal(pickPlace(null, reading, texts()), null, 'no book opens and no Bible place: nothing');
  // a text that opens for an id that is not in the catalog cannot be named: it is not compared with the Bible, so it cannot take the Bible's place away (it is newer here)
  const gone = readingOf(['a-book-of-an-earlier-list', 'c1', 0.2, 900]);
  const found = pickPlace(stamped('GEN', 3, 100), gone, texts('a-book-of-an-earlier-list'))!;
  assert.deepEqual([found.spot.kind, found.view.label], ['bible', 'Genesis 3'], 'the Bible is still offered');
  assert.equal(pickPlace(null, gone, texts('a-book-of-an-earlier-list')), null, 'and with no Bible place there is nothing, not a bar with no words');
});

check('pickPlace: the chapter of a book is the one the reader opens, told from the text it is given (a text that is empty gives the title alone)', () => {
  assert.equal(pickPlace(null, readingOf([QUIET, 'c24', 0.99, 5]), texts(QUIET))!.view.label, 'The Quiet Road · Chapter 24', 'the last chapter, finished: it stays on the last');
  assert.equal(pickPlace(null, readingOf([QUIET, 'c3', 0.99, 5]), texts(QUIET))!.view.label, 'The Quiet Road · Chapter 4', 'a finished chapter goes on to the next');
  const empty = (id: string) => (id === QUIET ? { chapters: [] as ChapterRef[] } : null);
  const v = pickPlace(null, readingOf([QUIET, 'c3', 0.2, 5]), empty)!.view;
  assert.deepEqual([v.label, v.head, v.tail], ['The Quiet Road', 'The Quiet Road', '']);
});

/* ================================================================ what is drawn for what was loaded */

check('viewToDraw: what was loaded for this person and not closed is drawn; nothing loaded, another person\'s, no place, or this very place closed is not', () => {
  const found = pickPlace(stamped('PSA', 121, 1731068400000), emptyReading(), texts())!;
  const loaded = (o: Partial<Loaded> = {}): Loaded => ({ uid: 'ana', found, hidden: null, ...o });
  assert.equal(viewToDraw(loaded(), 'ana'), found.view, 'the place of this person');
  assert.equal(viewToDraw(null, 'ana'), null, 'nothing loaded yet');
  assert.equal(viewToDraw(loaded(), 'ben'), null, 'what was loaded for Ana is not drawn for Ben, who signed in on the same phone');
  assert.equal(viewToDraw(loaded(), null), null, 'nobody is signed in');
  assert.equal(viewToDraw(loaded({ found: null }), 'ana'), null, 'no place to continue from');
  assert.equal(viewToDraw(loaded({ hidden: markOf(found.spot) }), 'ana'), null, 'this very place was closed');
  assert.equal(viewToDraw(loaded({ hidden: markOf({ ...found.spot, at: found.spot.at - 1 }) }), 'ana'), found.view, 'the place was saved again after it was closed: it is back');
  assert.equal(viewToDraw(loaded({ hidden: markOf(bible('PSA', 122, found.spot.at)) }), 'ana'), found.view, 'another chapter was closed');
});

/* ================================================================ what the bar says and where it goes */

check('a chapter of the Bible: the place as the Bible names it ("Genesis 3", "Psalm 121", "1 Corinthians 13"), the closed book with a cross, and the address of the reader', () => {
  const a = describeBible(bible('GEN', 3, 1));
  assert.deepEqual(a, { icon: 'book', label: 'Genesis 3', head: 'Genesis', tail: '3', spoken: 'Continue reading, Genesis 3', href: '/library/bible/GEN/3' });
  assert.equal(describeBible(bible('PSA', 121, 1)).label, 'Psalm 121');
  assert.equal(describeBible(bible('1CO', 13, 1)).label, '1 Corinthians 13');
  assert.equal(describeBible(bible('1CO', 13, 1)).spoken, 'Continue reading, 1 Corinthians 13');
  assert.equal(CONTINUE_TITLE, 'Continue reading', 'the words over the place');
});

check('the name and the chapter of a place in the Bible are two parts of the label for every chapter of every book (a long name is cut, the chapter is not): the Psalms are "Psalm", the rest are named by the list', () => {
  let places = 0;
  for (const b of BIBLE_BOOKS) {
    for (let chapter = 1; chapter <= b.chapters; chapter += 1) {
      const v = describeBible(bible(b.code, chapter, 1));
      assert.equal(v.tail, String(chapter), `${b.code} ${chapter}: the tail is the chapter`);
      assert.equal(v.head, b.code === 'PSA' ? 'Psalm' : b.name, `${b.code} ${chapter}: the head is the name of the book as a place says it`);
      assert.equal(`${v.head} ${v.tail}`, v.label, `${b.code} ${chapter}: head, a space and tail are the label`);
      assert.equal(v.label, placeLabel({ code: b.code, chapter }), `${b.code} ${chapter}: the label is the one the Bible uses on its buttons`);
      assert.equal(v.href, `/library/bible/${b.code}/${chapter}`);
      places += 1;
    }
  }
  assert.equal(places, 1328, 'every chapter of the 73 books');
  assert.equal(describeBible(bible('PSA', 121, 1)).head, 'Psalm');
  assert.equal(describeBible(bible('1CO', 13, 1)).head, '1 Corinthians');
});

check('a book: its title and the chapter the reader opens, counted as the reader counts it ("Chapter 2 of 24"), the open book, and the address of the reader of the book (which opens where the person stopped)', () => {
  const title = bookById(QUIET)!.title;
  assert.equal(title, 'The Quiet Road', 'the title of the Library, not the title of the old book it is made from');
  const v = describeBook(book(QUIET, 'c2', 0.3, 1), chapters(24))!;
  assert.deepEqual(v, { icon: 'library', label: 'The Quiet Road · Chapter 2', head: 'The Quiet Road', tail: '· Chapter 2', spoken: 'Continue reading, The Quiet Road, Chapter 2', href: `/library/book/${QUIET}/read` });
  const nav = chapterNav(chapters(24), 1)!;
  assert.equal(positionLine(nav), 'Chapter 2 of 24', 'the reader says the same number in its header');
  assert.equal(describeBook(book(FRENCH, 'c3', 0, 1), chapters(17))!.label, 'The French Way · Chapter 3', 'a guide is named the same way');
});

check('a chapter read to its last lines is continued from the next chapter, as the book page does; after the last chapter it stays on the last; a chapter the text does not have gives the first', () => {
  assert.equal(describeBook(book(HEART, 'c4', 0.96, 1), chapters(16))!.label, 'The Restless Heart · Chapter 4', 'not yet finished');
  assert.equal(describeBook(book(HEART, 'c4', 0.97, 1), chapters(16))!.label, 'The Restless Heart · Chapter 5', 'finished: the next one, from its top');
  assert.equal(describeBook(book(HEART, 'c16', 1, 1), chapters(16))!.label, 'The Restless Heart · Chapter 16', 'the last chapter, finished');
  assert.equal(describeBook(book(HEART, 'c999', 0.7, 1), chapters(16))!.label, 'The Restless Heart · Chapter 1', 'the saved chapter is not in the text');
  assert.equal(describeBook(book(HEART, 'c4', 0.5, 1), chapters(16))!.spoken, 'Continue reading, The Restless Heart, Chapter 4');
});

check('a text that cannot be read gives the title alone, and a book that is not in the catalog is not offered', () => {
  for (const none of [null, []]) {
    const v = describeBook(book(HEART, 'c4', 0.5, 1), none)!;
    assert.equal(v.label, 'The Restless Heart');
    assert.equal(v.head, 'The Restless Heart');
    assert.equal(v.tail, '', 'no chapter to name');
    assert.equal(v.spoken, 'Continue reading, The Restless Heart');
    assert.equal(v.href, `/library/book/${HEART}/read`);
  }
  assert.equal(describeBook(book('no-such-book', 'c1', 0, 1), chapters(3)), null);
  assert.equal(describeBook(book('confessions', 'c1', 0, 1), chapters(3)), null, 'the id of a book that was in an earlier list of the Library is not in this one');
});

check('the same on the real texts of the app: for every one of the books of the Library, the first and the last chapter are named by their place in the book, the title is the catalog\'s, and head and tail make the label', () => {
  assert.equal(BOOK_CATALOG.length, 26, 'the books of the Library');
  for (const entry of BOOK_CATALOG) {
    const text = safeText(entry.id);
    assert.ok(text && text.chapters.length > 0, `${entry.id}: its text reads`);
    const own: ChapterRef[] = text.chapters;
    for (const index of [0, own.length - 1]) {
      const v: SpotView = describeBook(book(entry.id, own[index].id, 0.2, 1), own)!;
      assert.equal(v.label, `${entry.title} · Chapter ${index + 1}`, entry.id);
      assert.equal(v.head, entry.title, `${entry.id}: the head is the title the Books tab shows`);
      assert.equal(v.tail, `· Chapter ${index + 1}`, entry.id);
      assert.equal(`${v.head} ${v.tail}`, v.label, entry.id);
      assert.equal(v.spoken, `Continue reading, ${entry.title}, Chapter ${index + 1}`, entry.id);
      assert.equal(v.href, `/library/book/${entry.id}/read`, entry.id);
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
const bk2: Spot = book(QUIET, 'c2', 0.4, 1731068500000);

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
  assert.equal(isHidden(hidB, book(QUIET, 'c3', 0.4, bk2.at)), false, 'another chapter of the book');
  assert.equal(isHidden(hidB, book(HEART, 'c2', 0.4, bk2.at)), false, 'another book, the same chapter id');
  assert.equal(isHidden(hidB, book(QUIET, 'c2', 0.4, bk2.at + 1)), false, 'the same chapter, a newer time');
  assert.equal(isHidden(hidB, g3), false, 'the Bible is read now');
});

check('how far down a book chapter the person was is not part of what is closed: the time is, and the time moves with every save', () => {
  const hid = markOf(book(QUIET, 'c2', 0.1, 50));
  assert.equal(isHidden(hid, book(QUIET, 'c2', 0.9, 50)), true);
  assert.equal(isHidden(hid, book(QUIET, 'c2', 0.9, 51)), false);
  assert.deepEqual(Object.keys(markOf(bk2)).sort(), ['at', 'c', 'id', 'kind', 'v']);
  assert.deepEqual(Object.keys(markOf(g3)).sort(), ['at', 'chapter', 'code', 'kind', 'v']);
});

check('nothing closed, or nothing to continue, hides nothing', () => {
  assert.equal(isHidden(null, g3), false);
  assert.equal(isHidden(markOf(g3), null), false);
  assert.equal(isHidden(null, null), false);
});

check('a stored value that does not read means "not hidden": nothing stored, another version, a wrong type, a chapter that is no number, a string that is empty or too long, a time that is not a time', () => {
  const long = 'x'.repeat(81);
  const corrupt: unknown[] = [
    undefined, null, 0, 1, 'x', '', 'true', true, [], [1], {}, { v: 1 }, { v: '1', kind: 'bible', code: 'GEN', chapter: 3, at: 1 }, { v: 2, kind: 'bible', code: 'GEN', chapter: 3, at: 1 },
    { v: 1, kind: 'other', code: 'GEN', chapter: 3, at: 1 }, { v: 1, code: 'GEN', chapter: 3, at: 1 }, { v: 1, kind: 'bible', chapter: 3, at: 1 },
    { v: 1, kind: 'bible', code: '', chapter: 3, at: 1 }, { v: 1, kind: 'bible', code: long, chapter: 3, at: 1 }, { v: 1, kind: 'bible', code: 7, chapter: 3, at: 1 },
    { v: 1, kind: 'bible', code: 'GEN', chapter: '3', at: 1 }, { v: 1, kind: 'bible', code: 'GEN', chapter: 0, at: 1 }, { v: 1, kind: 'bible', code: 'GEN', chapter: -1, at: 1 },
    { v: 1, kind: 'bible', code: 'GEN', chapter: 1.5, at: 1 }, { v: 1, kind: 'bible', code: 'GEN', chapter: 1000, at: 1 }, { v: 1, kind: 'bible', code: 'GEN', chapter: Number.NaN, at: 1 },
    { v: 1, kind: 'bible', code: 'GEN', chapter: 3 }, { v: 1, kind: 'bible', code: 'GEN', chapter: 3, at: 'now' }, { v: 1, kind: 'bible', code: 'GEN', chapter: 3, at: -1 },
    { v: 1, kind: 'bible', code: 'GEN', chapter: 3, at: Number.NaN }, { v: 1, kind: 'bible', code: 'GEN', chapter: 3, at: Number.POSITIVE_INFINITY }, { v: 1, kind: 'bible', code: 'GEN', chapter: 3, at: 9e15 },
    { v: 1, kind: 'book', c: 'c2', at: 1 }, { v: 1, kind: 'book', id: HEART, at: 1 }, { v: 1, kind: 'book', id: HEART, c: 2, at: 1 }, { v: 1, kind: 'book', id: '', c: 'c2', at: 1 },
    { v: 1, kind: 'book', id: long, c: 'c2', at: 1 }, { v: 1, kind: 'book', id: HEART, c: long, at: 1 }, { v: 1, kind: 'book', id: HEART, c: 'c2' },
  ];
  for (const bad of corrupt) {
    const mark = parseHidden(bad);
    assert.equal(mark, null, `${JSON.stringify(bad)} reads as nothing`);
    assert.equal(isHidden(mark, g3), false);
    assert.equal(isHidden(mark, bk2), false);
  }
});

check('the longest an id can be is the longest the books\' own places believe (80), so a place that can be offered can be closed: 80 reads, 81 does not', () => {
  const id = (len: number) => 'x'.repeat(len);
  assert.ok(parseHidden({ v: 1, kind: 'book', id: id(80), c: id(80), at: 1 }), '80 characters');
  assert.equal(parseHidden({ v: 1, kind: 'book', id: id(81), c: 'c1', at: 1 }), null, 'a book id of 81');
  assert.equal(parseHidden({ v: 1, kind: 'book', id: 'a', c: id(81), at: 1 }), null, 'a chapter id of 81');
  assert.ok(parseHidden({ v: 1, kind: 'bible', code: id(80), chapter: 1, at: 1 }));
  assert.equal(parseHidden({ v: 1, kind: 'bible', code: id(81), chapter: 1, at: 1 }), null);
  assert.equal(parseHidden({ v: 1, kind: 'bible', code: 'GEN', chapter: 999, at: 1 })!.kind, 'bible', 'chapter 999');
  assert.equal(parseHidden({ v: 1, kind: 'bible', code: 'GEN', chapter: 1000, at: 1 }), null, 'chapter 1000');
});

check('every place of every book of the Library can be closed and stays closed after a restart (no chapter id of the bundle is too long to be kept), and closing one never hides another', () => {
  let places = 0;
  for (const entry of BOOK_CATALOG) {
    const text = safeText(entry.id)!;
    for (const chapter of text.chapters) {
      const spot = book(entry.id, chapter.id, 0.5, 1731068500000 + places);
      const mark = parseHidden(stored(packHidden(markOf(spot))));
      assert.ok(mark, `${entry.id} / ${chapter.id}: the mark reads back`);
      assert.equal(isHidden(mark, spot), true, `${entry.id} / ${chapter.id}: stays closed`);
      assert.equal(isHidden(mark, { ...spot, at: spot.at + 1 }), false, `${entry.id} / ${chapter.id}: a newer save opens it again`);
      assert.equal(isHidden(mark, g3), false);
      places += 1;
    }
  }
  assert.equal(places, BOOK_CATALOG.reduce((sum, b) => sum + b.chapters.length, 0), 'every chapter of every book');
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
