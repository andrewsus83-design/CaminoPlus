// Plain-node checks of the Library's books: the small pure functions of books.ts, and the contract of the bundle the app ships
// (mobile/assets/library, written by tools/build_books.py): every book in the catalog has its text, the catalog and the text say the same
// about the chapters, and nothing the reader cannot draw is in a book. No React, no network. Run: npm run test:library
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chapterPlace, coverCaption, creditLine, findBook, formatMinutes, kindLabel, libraryBooks, spansText, type BookContent, type CatalogBook } from '../books';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };
const root = process.cwd(); // npm test runs from mobile/
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const book = (over: Partial<CatalogBook>): CatalogBook => ({
  id: 'b', kind: 'guide', order: 1, title: 'B', subtitle: 'S', description: 'D', words: 100, minutes: 1, cover: { colour: 'goldSoft', icon: 'library' },
  chapters: [{ id: '00-a', title: 'A', minutes: 1 }, { id: '01-b', title: 'B', minutes: 1 }, { id: '02-c', title: 'C', minutes: 1 }], ...over,
});

check('minutes are written as the build writes them', () => {
  assert.equal(formatMinutes(0), '0 min');
  assert.equal(formatMinutes(45), '45 min');
  assert.equal(formatMinutes(60), '1 h');
  assert.equal(formatMinutes(144), '2 h 24 min');
  assert.equal(formatMinutes(180), '3 h');
  assert.equal(formatMinutes(-5), '0 min');
});

check('the line under a cover says what the book is and how long it reads', () => {
  assert.equal(kindLabel('guide'), 'Guide');
  assert.equal(kindLabel('reflection'), 'Readings');
  assert.equal(coverCaption({ kind: 'guide', minutes: 200 }), 'Guide · 3 h 20 min');
  assert.equal(coverCaption({ kind: 'reflection', minutes: 150 }), 'Readings · 2 h 30 min');
});

check('the rows of the Books tab follow the catalog order, guides before readings, and copy nothing it should not', () => {
  const rows = libraryBooks([book({ id: 'r', kind: 'reflection', order: 9, title: 'Readings' }), book({ id: 'g2', order: 2, title: 'Two' }), book({ id: 'g1', order: 1, title: 'One' })]);
  assert.deepEqual(rows.map((r) => r.id), ['g1', 'g2', 'r']);
  assert.deepEqual(rows[0], { id: 'g1', title: 'One', kind: 'Guide · 1 min', colour: 'goldSoft', icon: 'library', subtitle: 'S', minutes: 1 });
  const input = [book({ id: 'x', order: 2 }), book({ id: 'y', order: 1 })];
  libraryBooks(input);
  assert.deepEqual(input.map((b) => b.id), ['x', 'y'], 'the catalog itself is not reordered');
});

check('a book and a chapter are found by id, and an id that is not there is null, never a throw', () => {
  const cat = [book({ id: 'one' }), book({ id: 'two' })];
  assert.equal(findBook(cat, 'two')?.id, 'two');
  assert.equal(findBook(cat, 'gone'), null);
  assert.equal(findBook(cat, undefined), null);
  assert.equal(findBook([], 'one'), null);
  const ch = cat[0].chapters;
  assert.deepEqual(chapterPlace(ch, '00-a'), { index: 0, count: 3, prev: null, next: '01-b' });
  assert.deepEqual(chapterPlace(ch, '01-b'), { index: 1, count: 3, prev: '00-a', next: '02-c' });
  assert.deepEqual(chapterPlace(ch, '02-c'), { index: 2, count: 3, prev: '01-b', next: null });
  assert.equal(chapterPlace(ch, 'nope'), null);
  assert.equal(chapterPlace(ch, undefined), null);
  assert.equal(chapterPlace([], '00-a'), null);
});

check('the credit of a reflection book names the work, the author, the translator and the licence; a guide names its author', () => {
  assert.equal(
    creditLine({ author: 'CaminoPlus', sources: [{ work: 'The Imitation of Christ', author: 'Thomas à Kempis', translator: 'William Benham', year: '1886', licence: 'Public domain' }] }),
    'The Imitation of Christ, Thomas à Kempis. Translated by William Benham (1886). Public domain.');
  assert.equal(creditLine({ author: 'CaminoPlus' }), 'By CaminoPlus.');
  assert.equal(spansText([{ t: 'a ' }, { t: 'b', i: 1 }, { t: '.' }]), 'a b.');
});

check('books.ts is pure: it imports a type and nothing else', () => {
  const imports = [...read('src/features/library/books.ts').matchAll(/^import [^;]*? from '([^']+)';/gm)].map((m) => m[0]);
  assert.deepEqual(imports, ["import type { CoverColour } from './sample';"]);
});

// ---- the bundle the app ships ------------------------------------------------------------------------------------------------------------

const BUNDLE = 'assets/library';
const COLOURS = ['goldSoft', 'blue100', 'successWash', 'red100', 'sand300', 'goldWash'];
const ICONS = ['library', 'book', 'chat'];
const BLOCKS = new Set(['h', 'p', 'ul', 'ol', 'quote', 'hr']);

type Cat = { version: number; books: CatalogBook[] };
const catalog = (): Cat => JSON.parse(read(`${BUNDLE}/catalog.json`));
const content = (id: string): BookContent => JSON.parse(read(`${BUNDLE}/books/${id}.json`));

check('the bundle: the catalog is there, and every book of it has its text and no text is left over', () => {
  assert.ok(existsSync(join(root, BUNDLE, 'catalog.json')), 'run: python3 tools/build_books.py --no-render');
  const cat = catalog();
  assert.equal(cat.version, 1);
  const ids = cat.books.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  const files = readdirSync(join(root, BUNDLE, 'books')).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
  assert.deepEqual([...files].sort(), [...ids].sort());
  for (const id of ids) assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${id} is a safe id`);
});

check('the bundle: the catalog and the text of each book say the same about its chapters', () => {
  for (const b of catalog().books) {
    const c = content(b.id);
    assert.equal(c.id, b.id);
    assert.equal(c.title, b.title);
    assert.equal(c.kind, b.kind);
    assert.deepEqual(c.chapters.map((x) => ({ id: x.id, title: x.title })), b.chapters.map((x) => ({ id: x.id, title: x.title })), `${b.id}: chapters`);
    assert.ok(b.chapters.length > 0 && b.chapters.every((x) => x.title.length > 0 && x.minutes >= 1), `${b.id}: every chapter has a title and a time`);
    assert.ok(COLOURS.includes(b.cover.colour) && ICONS.includes(b.cover.icon), `${b.id}: a cover the Library can draw`);
    assert.ok(b.kind === 'guide' || b.kind === 'reflection');
    if (b.kind === 'guide') assert.ok(b.route_slug, `${b.id}: a guide names its route`);
    assert.ok(c.rights.length > 0 && c.ai_disclosure.length > 0, `${b.id}: the rights and the AI disclosure travel with the text`);
    if (b.kind === 'reflection') assert.ok((c.sources?.length ?? 0) > 0, `${b.id}: a reflection book credits its sources`);
  }
});

check('the bundle: the promises of the books hold (a guide is at most 12,000 words, a reflection book at most 3 hours)', () => {
  for (const b of catalog().books) {
    if (b.kind === 'guide') assert.ok(b.words <= 12000, `${b.id}: ${b.words} words`);
    else assert.ok(b.minutes <= 180, `${b.id}: ${b.minutes} minutes`);
    assert.equal(b.minutes, Math.max(1, Math.ceil(b.words / 220)), `${b.id}: the time is the words at 220 a minute`);
  }
});

check('the bundle: nothing the reader cannot draw is in a book (only the known blocks, text as strings, links to the web only)', () => {
  const spans = (s: unknown, where: string) => {
    assert.ok(Array.isArray(s), `${where}: spans`);
    for (const x of s as { t: unknown; href?: unknown }[]) {
      assert.equal(typeof x.t, 'string', where);
      if (x.href !== undefined) assert.match(String(x.href), /^https?:\/\//, `${where}: a link goes to the web`);
    }
  };
  for (const b of catalog().books) {
    for (const ch of content(b.id).chapters) {
      assert.ok(ch.blocks.length > 0, `${b.id}/${ch.id}: has text`);
      ch.blocks.forEach((blk, i) => {
        const where = `${b.id}/${ch.id}#${i}`;
        assert.ok(BLOCKS.has(blk.t), `${where}: block ${blk.t}`);
        if (blk.t === 'h') { spans(blk.spans, where); assert.ok(blk.level === 2 || blk.level === 3, `${where}: heading level`); }
        if (blk.t === 'p') spans(blk.spans, where);
        if (blk.t === 'ul' || blk.t === 'ol') { assert.ok(blk.items.length > 0, where); blk.items.forEach((it) => spans(it, where)); }
        if (blk.t === 'quote') { blk.paras.forEach((p) => spans(p, where)); if (blk.cite) spans(blk.cite, where); }
        assert.ok(!('unbalanced' in blk), `${where}: no unclosed emphasis`);
      });
    }
  }
});

check('the bundle: bookBundle.ts is the one module that reads it, and it lists every book of the catalog and reads none of them when it loads', () => {
  const src = read('src/features/library/bookBundle.ts');
  assert.match(src, /^\/\/ GENERATED by tools\/build_books\.py/);
  for (const b of catalog().books) assert.ok(src.includes(`'${b.id}': () => require('../../../assets/library/books/${b.id}.json') as BookContent,`), `${b.id} is loadable`);
  assert.doesNotMatch(src, /^import .*\.json/m, 'a book is required when it is opened, never imported');
});

console.log(`${n} of ${n} passed`);
