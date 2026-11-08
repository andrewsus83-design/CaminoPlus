// Plain-node checks of what a pilgrim can keep from a book, the way the Bible keeps a verse: the key a passage is bookmarked under and how it reads back (for every
// passage of every book of the bundle), which blocks are passages, the words that are copied and shared, the rows of the Bookmarks screen (newest first, a passage that
// is gone is left out), and the address of the reader that names a passage. No React, no React Native, no network. Run: npm run test:library (library.test.ts runs this
// file too).
import './bundleShim';
import assert from 'node:assert/strict';
import { BOOKMARKS_MAX, packBookmarks, parseBookmarks, toggleBookmark } from '../bookmarks';
import { CATALOG, loadBookContent } from '../bookBundle';
import { readerPath } from '../books/copy';
import type { BookContent } from '../books';
import { cleanBook, layoutBlocks } from '../books/reading';
import {
  CHAPTER_KEY_LENGTH, EXCERPT_MAX, blockOfItem, chapterLabel, chapterOfKey, chosenAnnouncement, excerpt, isPassageBlock, parsePassageKey, passageKey, passageLabel, passageNumber,
  passageParam, passageRowsForKeys, passageShareText, passageWords,
} from '../books/passages';
import { itemKey } from '../search';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };

const sp = (t: string) => [{ t }];

/** A small book: a heading, three paragraphs, a quotation of two paragraphs and an attribution, a break, a list of two points and a numbered list, in two chapters. */
const book: BookContent = {
  id: 'demo-guide',
  kind: 'guide',
  title: 'The Demo Way',
  subtitle: 'A guide',
  author: null,
  credit: 'Test edition.',
  chapters: [
    {
      id: '03-where-to-start-and-how-many-days',
      title: 'Chapter III. Of the knowledge of truth',
      blocks: [
        { t: 'h', level: 2, spans: sp('A heading') },
        { t: 'p', spans: [{ t: 'Happy is the man   ' }, { t: 'whom Truth', b: 1 }, { t: ' by itself doth teach.' }] },
        { t: 'p', spans: sp('Second paragraph.') },
        { t: 'hr' },
        { t: 'quote', paras: [sp('First line of a prayer,'), sp('  second   line of it.')], cite: sp('— A pilgrim') },
        { t: 'ul', items: [sp('A point.'), sp('Another point.')] },
        { t: 'ol', items: [sp('First.'), sp('Second.')] },
        { t: 'p', spans: sp('   ') },
      ],
    },
    { id: '04-the-prologue', title: 'The Prologue', blocks: [{ t: 'p', spans: sp('Words.') }] },
  ],
};
const texts = (id: string): BookContent | null => (id === book.id ? book : null);

/* ================================================================ the key */

check('a passage is bookmarked under "books:<book>.<chapter>.<block>": the same "books:" as a row of the Books tab, and it reads back', () => {
  const key = passageKey('camino-frances-guide', '05-before-you-go', 12);
  assert.equal(key, 'books:camino-frances-guide.05-before-you-go.12');
  assert.ok(key.startsWith(itemKey('Books', '')), 'under the Books tab, like a row');
  assert.deepEqual(parsePassageKey(key), { bookId: 'camino-frances-guide', chapter: '05-before-you-go', block: 12 });
});

check('the chapter of a key is the first 24 characters of its id, so that a key always fits the 80 characters of a stored bookmark', () => {
  const id = '05-zamora-granja-de-moreruela-to-rionegro-del-puente';
  const key = passageKey('camino-portugues-lisboa-guide', id, 99999);
  assert.equal(key, 'books:camino-portugues-lisboa-guide.05-zamora-granja-de-more.99999');
  assert.deepEqual(parsePassageKey(key), { bookId: 'camino-portugues-lisboa-guide', chapter: id.slice(0, CHAPTER_KEY_LENGTH), block: 99999 });
  assert.equal(CHAPTER_KEY_LENGTH, 24);
  const longest = passageKey('a'.repeat(40), 'C'.repeat(60), 99999);
  assert.ok(longest.length <= 80, `${longest.length} characters`);
  assert.notEqual(parsePassageKey(longest), null);
});

check('what is not the key of a passage reads as nothing: a row of the Books tab, a verse, a key with a wrong part, an empty one', () => {
  for (const k of ['books:confessions-readings', 'bible:PSA.121.3', 'books:.c1.2', 'books:confessions..2', 'books:confessions.c1.', 'books:confessions.c1.x', 'books:Confessions.c1.2',
    'books:confessions.c1.2.3', 'books:confessions.c1.-1', 'books:confessions.c1.1234567', '', 'music:morning', 'books:a.b c.1', `books:a.${'c'.repeat(25)}.1`]) {
    assert.equal(parsePassageKey(k), null, `"${k}"`);
  }
});

check('a passage is kept, toggled and read back like any other bookmark', () => {
  const key = passageKey('demo-guide', '03-where-to-start-and-how-many-days', 1);
  const list = toggleBookmark([], key, 1000);
  assert.deepEqual(list, [{ key, at: 1000 }]);
  assert.deepEqual(parseBookmarks(JSON.parse(JSON.stringify(packBookmarks(list)))), list, 'it survives the file');
  assert.deepEqual(toggleBookmark(list, key, 2000), [], 'a second tap takes it off');
  assert.ok(BOOKMARKS_MAX >= 500);
});

check('a key names ONE chapter: the first characters of its id, when no other chapter of the book starts with them; two that do are never guessed between', () => {
  const chapters = [{ id: '01-welcome' }, { id: '02-the-way-in-brief' }, { id: '02-the-way-in-brief-again' }, { id: '10-the-end' }];
  assert.equal(chapterOfKey(chapters, '01-welcome'), 0);
  assert.equal(chapterOfKey(chapters, '10-the-end'), 3);
  assert.equal(chapterOfKey(chapters, '02-the-way-in-brief'), -1, 'two chapters start with it');
  assert.equal(chapterOfKey(chapters, '02-the-way-in-brief-a'), 2);
  assert.equal(chapterOfKey(chapters, '99-nothing'), -1);
  assert.equal(chapterOfKey([], '01-welcome'), -1);
});

check('the reader\'s pieces name their block: "12" and "12.3" are block 12', () => {
  assert.equal(blockOfItem('12'), 12);
  assert.equal(blockOfItem('12.3'), 12);
  assert.equal(blockOfItem('0.0'), 0);
});

check('every passage of every book of the Library has a key that reads back to it, in a chapter that its key names alone, and fits the 80 characters of a stored bookmark', () => {
  let passages = 0;
  for (const entry of CATALOG) {
    const content = cleanBook(loadBookContent(entry.id));
    assert.ok(content && content.chapters.length > 0, `${entry.id} reads`);
    const prefixes = new Set(content!.chapters.map((c) => c.id.slice(0, CHAPTER_KEY_LENGTH)));
    assert.equal(prefixes.size, content!.chapters.length, `${entry.id}: the chapters of a book have different first 24 characters`);
    content!.chapters.forEach((c, at) => {
      c.blocks.forEach((b, block) => {
        if (!isPassageBlock(b)) return;
        passages += 1;
        const key = passageKey(entry.id, c.id, block);
        assert.ok(key.length <= 80, `${key} (${key.length})`);
        const ref = parsePassageKey(key);
        assert.ok(ref, key);
        assert.deepEqual([ref!.bookId, chapterOfKey(content!.chapters, ref!.chapter), ref!.block], [entry.id, at, block], key);
        assert.ok(passageWords(b).length > 0, `${key} has words`);
      });
      // the pieces the reader draws name blocks that are the ones of the chapter
      for (const item of layoutBlocks(c.blocks)) assert.ok(blockOfItem(item.key) < c.blocks.length, `${entry.id} ${c.id} ${item.key}`);
    });
  }
  assert.ok(passages > 3000, `${passages} passages in the books of the Library`);
});

check('the address of the reader can name a passage, and only a whole number of a sensible size does', () => {
  assert.equal(readerPath('camino-frances-guide', '05-before-you-go', 12), '/library/book/camino-frances-guide/read?c=05-before-you-go&p=12');
  assert.equal(readerPath('camino-frances-guide', '05-before-you-go', 0), '/library/book/camino-frances-guide/read?c=05-before-you-go&p=0');
  assert.equal(readerPath('camino-frances-guide', '05-before-you-go'), '/library/book/camino-frances-guide/read?c=05-before-you-go', 'as before');
  assert.equal(readerPath('camino-frances-guide'), '/library/book/camino-frances-guide/read', 'as before');
  assert.equal(readerPath('camino-frances-guide', undefined, 4), '/library/book/camino-frances-guide/read', 'a passage without a chapter is no place');
  assert.equal(readerPath('camino-frances-guide', '05-before-you-go', -1), '/library/book/camino-frances-guide/read?c=05-before-you-go');
  assert.equal(readerPath('camino-frances-guide', '05-before-you-go', 1.5), '/library/book/camino-frances-guide/read?c=05-before-you-go');
  assert.equal(passageParam('12'), 12);
  assert.equal(passageParam('0'), 0);
  for (const bad of [undefined, null, '', '-1', '1.5', 'x', '12x', '123456', 12, ['1']]) assert.equal(passageParam(bad), undefined, String(bad));
});

/* ================================================================ which blocks, which words */

check('a paragraph, a quotation and a list are passages when they have words; a heading, a break, an empty block and a damaged one are not', () => {
  assert.equal(isPassageBlock({ t: 'p', spans: sp('Words.') }), true);
  assert.equal(isPassageBlock({ t: 'quote', paras: [sp('A prayer.')], cite: null }), true);
  assert.equal(isPassageBlock({ t: 'ul', items: [sp('A point.')] }), true);
  assert.equal(isPassageBlock({ t: 'ol', items: [sp('A point.')] }), true);
  for (const b of [{ t: 'h', level: 2, spans: sp('Heading') }, { t: 'hr' }, { t: 'p', spans: sp('   ') }, { t: 'p', spans: [] }, { t: 'p' }, { t: 'ul', items: [] }, { t: 'x', spans: sp('Words') }, null, undefined, 'p', 4]) {
    assert.equal(isPassageBlock(b), false, JSON.stringify(b));
  }
});

check('the number of a passage counts the passages only: a heading, a break and an empty block before it do not count, and a block that is no passage is 0', () => {
  const blocks = book.chapters[0].blocks;
  assert.equal(passageNumber(blocks, 1), 1);
  assert.equal(passageNumber(blocks, 2), 2);
  assert.equal(passageNumber(blocks, 4), 3, 'the quotation is the third passage, after a heading and a break');
  assert.equal(passageNumber(blocks, 5), 4);
  assert.equal(passageNumber(blocks, 6), 5);
  assert.equal(passageNumber(blocks, 0), 0, 'a heading');
  assert.equal(passageNumber(blocks, 3), 0, 'a break');
  assert.equal(passageNumber(blocks, 7), 0, 'an empty block');
  assert.equal(passageNumber(blocks, 99), 0, 'a block that is not there');
});

check('the words of a passage are copied clean: bold and italic are only words, one space between them, a line for each paragraph of a quotation and its attribution and for each point of a list', () => {
  const blocks = book.chapters[0].blocks;
  assert.equal(passageWords(blocks[1]), 'Happy is the man whom Truth by itself doth teach.');
  assert.equal(passageWords(blocks[4]), 'First line of a prayer,\nsecond line of it.\n— A pilgrim');
  assert.equal(passageWords(blocks[5]), '• A point.\n• Another point.');
  assert.equal(passageWords(blocks[6]), '1. First.\n2. Second.');
  assert.equal(passageWords(blocks[3]), '', 'a break has no words');
});

check('where a passage is, in words: the chapter as the edition numbers it or its title (plain spaces, so a screen reader and a share read it well), and which passage', () => {
  assert.equal(chapterLabel(book.chapters[0]), 'Chapter III');
  assert.ok(!chapterLabel(book.chapters[0]).includes(' '));
  assert.equal(chapterLabel(book.chapters[1]), 'The Prologue', 'a title with no number is its own label');
  assert.equal(chapterLabel({ title: 'Zamora, Granja de Moreruela to Rionegro del Puente' }), 'Zamora, Granja de…', 'a long title is cut');
  assert.equal(passageLabel(book.chapters[0], 4), 'Chapter III, passage 3');
  assert.equal(chosenAnnouncement('Chapter III, passage 3'), 'Chapter III, passage 3 selected. Bookmark, copy or share it.');
});

check('what is shared is the passage, then on a line of its own where it is and which book; nothing about the edition is invented', () => {
  assert.equal(passageShareText(book.title, book.chapters[0], 5), '• A point.\n• Another point.\nChapter III, passage 4, The Demo Way');
  assert.equal(passageShareText(book.title, book.chapters[0], 1), 'Happy is the man whom Truth by itself doth teach.\nChapter III, passage 1, The Demo Way');
});

check('an excerpt is the first words on one line, cut at a space with an ellipsis, and short words are left alone', () => {
  assert.equal(excerpt('A short one.'), 'A short one.');
  assert.equal(excerpt('Two\nlines   here'), 'Two lines here');
  const long = 'word '.repeat(80).trim();
  const e = excerpt(long);
  assert.ok(e.endsWith('…'));
  assert.ok(e.length <= EXCERPT_MAX + 1, `${e.length}`);
  assert.ok(!/\s…$/.test(e), 'no space before the ellipsis');
  assert.ok(e.slice(0, -1).split(' ').every((w) => w === 'word'), 'cut between words');
  assert.equal(excerpt('x'.repeat(300)).length, EXCERPT_MAX + 1, 'a text with no space is cut at the limit');
});

/* ================================================================ the rows of the Bookmarks screen */

check('the rows come newest first, as the keys are kept, each with the book, where it is, the first words and the whole id of the chapter for the address', () => {
  const k = (chapterId: string, block: number) => passageKey('demo-guide', chapterId, block);
  const keys = [k('03-where-to-start-and-how-many-days', 4), k('03-where-to-start-and-how-many-days', 1), k('04-the-prologue', 0)];
  const rows = passageRowsForKeys(keys, texts);
  assert.deepEqual(rows.map((r) => r.key), keys);
  assert.deepEqual(rows[0], {
    key: keys[0], bookId: 'demo-guide', chapterId: '03-where-to-start-and-how-many-days', block: 4, bookTitle: 'The Demo Way', label: 'Chapter III, passage 3',
    excerpt: 'First line of a prayer, second line of it. — A pilgrim',
  });
  assert.equal(rows[1].excerpt, 'Happy is the man whom Truth by itself doth teach.');
  assert.equal(rows[2].label, 'The Prologue, passage 1');
});

check('what is gone shows nothing and breaks nothing: another kind of key, a key twice, a book that cannot be read, a chapter or a block that is not there, a block that is no passage any more', () => {
  const id = '03-where-to-start-and-how-many-days';
  const good = passageKey('demo-guide', id, 1);
  const keys = [
    'books:demo-guide', 'bible:PSA.121.3', 'nonsense', good, good,
    passageKey('no-such-book', id, 1), passageKey('demo-guide', '99-nothing-here', 1), passageKey('demo-guide', id, 99),
    passageKey('demo-guide', id, 0), passageKey('demo-guide', id, 3), passageKey('demo-guide', id, 7),
  ];
  assert.deepEqual(passageRowsForKeys(keys, texts).map((r) => r.key), [good]);
  assert.deepEqual(passageRowsForKeys([good], () => { throw new Error('damaged'); }), [], 'a text that throws shows nothing');
  assert.deepEqual(passageRowsForKeys([good], () => ({ ...book, chapters: undefined as never })), [], 'a text with no chapters shows nothing');
  assert.deepEqual(passageRowsForKeys([good], () => ({ ...book, chapters: [{ id, title: 'Chapter I', blocks: undefined as never }] })), [], 'a chapter with no blocks shows nothing');
  assert.deepEqual(passageRowsForKeys([], texts), []);
});

check('a book is read once for all the passages of it', () => {
  let loads = 0;
  const counting = (id: string) => { loads += 1; return texts(id); };
  const id = '03-where-to-start-and-how-many-days';
  const keys = [1, 2, 4, 5].map((block) => passageKey('demo-guide', id, block));
  assert.equal(passageRowsForKeys(keys, counting).length, 4);
  assert.equal(loads, 1);
});

console.log(`${n} of ${n} passed (Passages)`);
