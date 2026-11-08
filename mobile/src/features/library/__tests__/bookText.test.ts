// Plain-node checks of the text of the books (assets/books, made by tools/books/import_books.py, see tools/books/README.md): which books have
// text, how each is built (chapters c1..cN, blocks of five kinds), that nothing of the digital editions is left in it (markup, footnote marks,
// the name of the library, page numbers, double spaces, stray line breaks), that every asset is the one the manifest names (sha256), that every
// text is public domain everywhere with its translator and source named, and that the glue (bookText.ts, books.generated.ts) is wired to
// exactly those files. No React, no network, nothing is run through Metro: the JSON files are read as files.
// Run: npm run test:library (library.test.ts runs this file too).
//
// The chapter counts and the first words of each book are typed in again below on purpose, from the sources, and not read from the manifest:
// a chapter lost by a cleaning rule, or a text that is another book, then fails here.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { makeBookTextApi } from '../books/bookTextApi';
import type { BookBlock, BookText, BookTextIndexEntry } from '../books/bookTextTypes';
import { BOOK_CATALOG } from '../books/catalog';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };
const root = process.cwd(); // npm test runs from mobile/
const ASSETS = 'assets/books';
const GLUE = 'src/features/library/books';
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const sha256 = (p: string) => createHash('sha256').update(readFileSync(join(root, p))).digest('hex');
const json = <T,>(p: string) => JSON.parse(read(p)) as T;

type ManifestEntry = {
  id: string; title: string; author: string; translator: string | null; translatorDied: number | null; translatorSource: string;
  firstPublished: number; edition: string; source: string; rawUrl: string; rawSha256: string; outputSha256: string; chapters: number;
  words: number; verdict: string; basis: string; credit: string; leftOut: string[]; counts: Record<string, number>;
};
type Manifest = { books: ManifestEntry[]; leftOut: { id: string; verdict: string; why: string }[] };

const index = json<BookTextIndexEntry[]>(`${ASSETS}/index.json`);
const manifest = json<Manifest>(`${ASSETS}/manifest.json`);
const book = (id: string) => json<BookText>(`${ASSETS}/${id}.json`);
const ids = index.map((e) => e.id);
const catalogIds = BOOK_CATALOG.map((b) => b.id);
const allBlocks = (b: BookText) => b.chapters.flatMap((c) => c.blocks);
const textOf = (blk: BookBlock) => ('t' in blk ? blk.t : '');
const wordsOf = (b: BookText) => allBlocks(b).reduce((total, blk) => total + textOf(blk).split(/\s+/).filter(Boolean).length, 0);

// id -> chapters, parts, words, the first words of the first chapter's first paragraph and the title of the last chapter. Typed in from the editions.
const PINNED: Record<string, { chapters: number; parts: number; words: number; opens: string; lastTitle: string }> = {
  'spiritual-exercises': { chapters: 88, parts: 7, words: 27321, opens: 'First Annotation. The first Annotation is that by this name of Spiritual Exercises is meant', lastTitle: 'To Have the True Sentiment Which We Ought to Have in the Church. Militant' },
  'devout-life': { chapters: 120, parts: 5, words: 80423, opens: 'Dear reader, I request you to read this Preface for your own satisfaction as well as mine.', lastTitle: 'Chapter XVIII. Three Important and Final Counsels.' },
  'dialogue-of-st-catherine': { chapters: 94, parts: 4, words: 81926, opens: 'The soul, who is lifted by a very great and yearning desire for the honor of God and the s', lastTitle: 'Letter of Ser Barduccio di Piero Canigiani, containing the Transit of the Seraphic Virgin, Saint Catherine of Siena, to Sister Catherine Petriboni in the Monastery of San Piero a Monticelli near Florence. In the Name of Jesus Christ.' },
  'life-of-st-teresa': { chapters: 41, parts: 0, words: 138690, opens: 'As I have been commanded and left at liberty to describe at length my way of prayer', lastTitle: 'Chapter XL. Visions, Revelations, and Locutions.' },
  'imitation-of-christ': { chapters: 114, parts: 4, words: 59423, opens: 'He that followeth me shall not walk in darkness, saith the Lord.', lastTitle: 'Chapter XVIII. That a man should not be a curious searcher of the Sacrament, but a humble imitator of Christ, submitting his sense to holy faith' },
  confessions: { chapters: 13, parts: 0, words: 111775, opens: 'Great art Thou, O Lord, and greatly to be praised; great is Thy power', lastTitle: 'Book XIII' },
};

/* ================================================================ the API, with a stand-in index and loaders */

const sample = (id: string): BookText => ({ id, title: id, author: 'A', credit: 'c', chapters: [{ id: 'c1', title: 'One', blocks: [{ k: 'p', t: 'Text.' }] }] });
const api = makeBookTextApi([{ id: 'a', chapters: 1, words: 1 }, { id: 'b', chapters: 1, words: 1 }], { a: () => sample('a'), b: () => sample('b'), stray: () => sample('stray') });

check('the API: the index is what it was given, hasBookText is true for exactly the books of the index, and loadBookText returns that book at once', () => {
  assert.deepEqual(api.index.map((e) => e.id), ['a', 'b']);
  assert.equal(api.hasBookText('a'), true);
  assert.equal(api.hasBookText('b'), true);
  assert.equal(api.hasBookText('stray'), false, 'a loader that is not in the index does not make a book that has text');
  assert.equal(api.hasBookText('missing'), false);
  assert.equal(api.hasBookText(''), false);
  assert.equal(api.hasBookText('toString'), false, 'a name of Object.prototype is not a book');
  assert.equal(api.loadBookText('b').id, 'b');
  assert.deepEqual(api.loadBookText('a'), sample('a'));
});

check('the API: a book without text throws Error("no text for <id>") and never returns a made-up text', () => {
  for (const id of ['missing', 'stray', '', 'constructor']) assert.throws(() => api.loadBookText(id), (e: unknown) => e instanceof Error && e.message === `no text for ${id}`, id);
  const noLoader = makeBookTextApi([{ id: 'x', chapters: 1, words: 1 }], {});
  assert.equal(noLoader.hasBookText('x'), false, 'an index entry with no loader is not a book that has text');
  assert.throws(() => noLoader.loadBookText('x'), /^Error: no text for x$/);
});

check('the API: with nothing in the index there is no book (0 entries is a valid state)', () => {
  const empty = makeBookTextApi([], {});
  assert.deepEqual([...empty.index], []);
  assert.equal(empty.hasBookText('confessions'), false);
  assert.throws(() => empty.loadBookText('confessions'), /no text for confessions/);
});

/* ================================================================ which books have text */

check('the index lists exactly the books that have text, once each, in the order of the catalogue, and every id is a book of the catalogue', () => {
  assert.deepEqual(ids, catalogIds.filter((id) => ids.includes(id)), 'catalogue order');
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.ok(catalogIds.includes(id), `${id} is a book of the catalogue`);
  assert.deepEqual(ids, Object.keys(PINNED).sort((a, b) => catalogIds.indexOf(a) - catalogIds.indexOf(b)), 'the books this test pins are the books of the index');
  assert.deepEqual(manifest.books.map((b) => b.id), ids, 'the manifest and the index agree');
});

check('every book of the catalogue is either in the index or in the manifest as left out with a verdict and a reason, never both and never neither', () => {
  const left = manifest.leftOut.map((l) => l.id);
  assert.deepEqual([...ids, ...left].sort(), [...catalogIds].sort());
  for (const l of manifest.leftOut) {
    assert.notEqual(l.verdict, 'public domain everywhere', `${l.id}: a book that is left out is not public domain everywhere`);
    assert.ok(['US only', 'unclear', 'no clean text'].includes(l.verdict), l.id);
    assert.ok(l.why.trim().length > 40, `${l.id} says why`);
  }
});

check('the files of the assets folder are exactly the index, the manifest and one file per book of the index', () => {
  const files = readdirSync(join(root, ASSETS)).sort();
  assert.deepEqual(files, ['index.json', 'manifest.json', ...ids.map((id) => `${id}.json`)].sort());
});

/* ================================================================ the shape of every book */

check('every book is a BookText of the contract: id, title and author as the catalogue has them, its translator when it has a named one, a credit, and chapters c1..cN in reading order', () => {
  for (const id of ids) {
    const b = book(id);
    const m = manifest.books.find((x) => x.id === id)!;
    assert.deepEqual(Object.keys(b), m.translator === null ? ['id', 'title', 'author', 'credit', 'chapters'] : ['id', 'title', 'author', 'translator', 'credit', 'chapters'], id);
    assert.equal(b.id, id);
    const cat = BOOK_CATALOG.find((c) => c.id === id)!;
    assert.equal(b.title, cat.title, `${id}: the title of the text is the title of the catalogue`);
    assert.equal(b.author, cat.author, `${id}: the author of the text is the author of the catalogue`);
    assert.ok(m.translator === null ? b.translator === undefined : b.translator === m.translator && b.translator.trim() === b.translator, `${id} names its translator, or has none named`);
    assert.deepEqual(b.chapters.map((c) => c.id), b.chapters.map((_, i) => `c${i + 1}`), `${id}: ids are c1..cN`);
  }
});

check('the chapter count of each book is the one pinned from its source, and the index and the manifest say the same', () => {
  for (const id of ids) {
    const b = book(id);
    assert.equal(b.chapters.length, PINNED[id].chapters, `${id}: chapters`);
    assert.equal(index.find((e) => e.id === id)!.chapters, PINNED[id].chapters, `${id}: index`);
    assert.equal(manifest.books.find((m) => m.id === id)!.chapters, PINNED[id].chapters, `${id}: manifest`);
  }
  assert.equal(book('imitation-of-christ').chapters.length, 114, 'the Imitation of Christ: 25 + 12 + 59 + 18 chapters in 4 books');
  assert.equal(book('confessions').chapters.length, 13, 'the Confessions: 13 books');
});

check('the words are counted the same way everywhere: the index, the manifest and the text itself agree, and each book has the length pinned from its source', () => {
  for (const id of ids) {
    const words = wordsOf(book(id));
    assert.equal(words, PINNED[id].words, `${id}: words`);
    assert.equal(index.find((e) => e.id === id)!.words, words, `${id}: index`);
    assert.equal(manifest.books.find((m) => m.id === id)!.words, words, `${id}: manifest`);
  }
});

check('the parts: the Imitation of Christ is in its four books, a chapter that belongs to no part has no "part" key, and a part is never empty or untrimmed', () => {
  for (const id of ids) {
    const parts = new Set(book(id).chapters.map((c) => c.part).filter((p) => p !== undefined));
    assert.equal(parts.size, PINNED[id].parts, `${id}: parts`);
    for (const c of book(id).chapters) {
      assert.deepEqual(Object.keys(c).filter((k) => k !== 'blocks'), 'part' in c ? ['id', 'title', 'part'] : ['id', 'title'], `${id} ${c.id}: keys`);
      if ('part' in c) assert.ok(c.part && c.part.trim() === c.part, `${id} ${c.id}: part`);
    }
  }
  const imitation = book('imitation-of-christ').chapters;
  assert.deepEqual([...new Set(imitation.map((c) => c.part))], [
    'The First Book. Admonitions Profitable for the Spiritual Life', 'The Second Book. Admonitions Concerning the Inner Life',
    'The Third Book. On Inward Consolation', 'The Fourth Book. Of the Sacrament of the Altar']);
  assert.deepEqual([25, 12, 59, 18], ['The First', 'The Second', 'The Third', 'The Fourth'].map((p) => imitation.filter((c) => c.part!.startsWith(p)).length));
  assert.deepEqual(imitation.slice(0, 3).map((c) => c.title), [
    'Chapter I. Of the imitation of Christ, and of contempt of the world and all its vanities', 'Chapter II. Of thinking humbly of oneself', 'Chapter III. Of the knowledge of truth']);
});

check('every chapter has at least one paragraph, a title, and blocks of the five kinds only; a "q" has its lines, an "hr" has nothing else, nothing has a key that is not in the contract', () => {
  for (const id of ids) {
    for (const c of book(id).chapters) {
      assert.ok(c.title.trim() === c.title && c.title.length > 0, `${id} ${c.id}: title`);
      assert.ok(c.blocks.some((blk) => blk.k === 'p'), `${id} ${c.id} has a paragraph`);
      for (const blk of c.blocks) {
        assert.ok(['p', 'h', 'q', 'li', 'hr'].includes(blk.k), `${id} ${c.id}: kind ${blk.k}`);
        assert.deepEqual(Object.keys(blk), blk.k === 'hr' ? ['k'] : ['k', 't'], `${id} ${c.id}: keys of a ${blk.k}`);
      }
    }
  }
});

check('the first words and the last chapter of each book are the ones pinned: a text that is another book, or is cut short, fails here', () => {
  for (const id of ids) {
    const b = book(id);
    assert.ok(textOf(b.chapters[0].blocks[0]).startsWith(PINNED[id].opens), `${id} opens with "${PINNED[id].opens}", it opens with "${textOf(b.chapters[0].blocks[0]).slice(0, 80)}"`);
    assert.equal(b.chapters[b.chapters.length - 1].title, PINNED[id].lastTitle, `${id}: last chapter`);
  }
});

/* ================================================================ nothing of the digital editions is left in the text */

const blocksWithId = () => ids.flatMap((id) => book(id).chapters.flatMap((c) => c.blocks.map((blk) => ({ id, chapter: c.id, blk }))));
const offenders = (test: (t: string, k: BookBlock['k']) => boolean) => blocksWithId().filter(({ blk }) => test(textOf(blk), blk.k)).map(({ id, chapter, blk }) => `${id} ${chapter}: ${textOf(blk).slice(0, 70)}`);

check('no markup: no "<" or ">", no "_" emphasis marks, no curly brackets, no [Illustration] or [Footnote] notes of the digital edition', () => {
  assert.deepEqual(offenders((t) => /[<>]/.test(t)), []);
  assert.deepEqual(offenders((t) => t.includes('_')), []);
  assert.deepEqual(offenders((t) => /[{}]/.test(t)), []);
  assert.deepEqual(offenders((t) => /\[(Illustration|Footnote|Sidenote|Transcriber|Note)/i.test(t)), []);
  assert.deepEqual(offenders((t) => /&[a-z]+;|&#\d+;/i.test(t)), [], 'no HTML entity');
});

check('no library stamp: the words "Project Gutenberg", its trademark line and any web address are in no block, in no title, in no credit', () => {
  assert.deepEqual(offenders((t) => /gutenberg|trademark|www\.|https?:/i.test(t)), []);
  for (const id of ids) {
    const b = book(id);
    for (const s of [b.title, b.author, b.translator ?? '', ...b.chapters.map((c) => c.title), ...b.chapters.map((c) => c.part ?? '')]) assert.doesNotMatch(s, /gutenberg/i, id);
    assert.doesNotMatch(b.credit, /project gutenberg/i, `${id}: the credit names the source by its address, the library's name is not used as a stamp`);
  }
});

check('no double space, no tab or no-break space, no space at an end, and no stray line break in a paragraph, a heading or a point; a quotation has lines and no empty one', () => {
  assert.deepEqual(offenders((t) => / {2}/.test(t)), []);
  assert.deepEqual(offenders((t) => /[\t\u00a0\u200b\ufeff\u2028\u2029\f\r]/.test(t)), []);
  assert.deepEqual(offenders((t, k) => k !== 'q' && /\n/.test(t)), []);
  assert.deepEqual(offenders((t) => t.split('\n').some((line) => line !== line.trim() || line === '')), []);
  assert.deepEqual(offenders((t, k) => k !== 'hr' && t.length === 0), []);
});

// The mark each edition used for its footnotes, which the importer took out with the notes: (1) in the Imitation, [1] in the others. Where the author
// himself writes "(1) ... (2) ..." in a sentence (the Devout Life does) that is his text and stays.
const NOTE_MARK: Record<string, RegExp> = { 'imitation-of-christ': /\(\d{1,2}\)/ };
const noteMark = (id: string) => NOTE_MARK[id] ?? /\[\d{1,3}\]/;

check('no footnote marks and no page numbers: none of the mark the edition used is left in a book whose footnotes were dropped, and no block is only a number', () => {
  assert.deepEqual(offenders((t) => /^[\[(]?\d+[\])]?\.?$/.test(t) || /^[IVXLCDM]+\.?$/.test(t)), []);
  const dropped = ids.filter((id) => (manifest.books.find((m) => m.id === id)!.counts.footnotes ?? 0) > 0);
  assert.ok(dropped.length >= 4, 'the books whose footnotes were dropped are checked');
  assert.deepEqual(dropped.flatMap((id) => blocksWithId().filter((x) => x.id === id && noteMark(id).test(textOf(x.blk))).map((x) => `${id} ${x.chapter}: ${textOf(x.blk).slice(0, 60)}`)), []);
});

check('the text is not scraps: every paragraph is a sentence or part of one (no paragraph of one or two characters, none that is only punctuation)', () => {
  assert.deepEqual(offenders((t, k) => k === 'p' && (t.length < 3 || !/[A-Za-z]/.test(t))), []);
  assert.deepEqual(offenders((t, k) => k === 'p' && t.length > 12000), [], 'no paragraph so long that a wrapped line was joined with a whole chapter');
});

check('the text keeps its accents and dashes (a cleaning step that turned them into "?" or "\\u" would show here)', () => {
  assert.deepEqual(offenders((t) => /\?{2,}|\\u[0-9a-f]{4}|\ufffd/i.test(t)), []);
  assert.deepEqual(offenders((t) => /(?<!-)-{2,3}(?!-)/.test(t)), [], 'a dash made of two or three hyphens is an em dash (a longer run is a blank line of a form)');
  assert.ok(blocksWithId().some(({ blk }) => textOf(blk).includes('\u2014')), 'em dashes are there');
});

/* ================================================================ the manifest: hashes, verdicts, credits */

check('the manifest names the sha256 of every asset, and it is the sha256 of the file (a text changed by hand fails here)', () => {
  for (const m of manifest.books) {
    assert.match(m.outputSha256, /^[0-9a-f]{64}$/, m.id);
    assert.equal(sha256(`${ASSETS}/${m.id}.json`), m.outputSha256, `${m.id}: the file is not the one the manifest names`);
    assert.match(m.rawSha256, /^[0-9a-f]{64}$/, `${m.id}: the download that was cleaned is named by its sha256`);
    assert.notEqual(m.rawSha256, m.outputSha256);
  }
});

check('every book of the index has the licence verdict "public domain everywhere": a translator who died in 1955 or earlier, or none named in an edition older than 1900, and a first publication in 1930 or earlier', () => {
  for (const id of ids) {
    const m = manifest.books.find((x) => x.id === id)!;
    assert.equal(m.verdict, 'public domain everywhere', id);
    assert.ok(m.firstPublished <= 1930, `${id}: first published in ${m.firstPublished}`);
    if (m.translator === null) {
      assert.ok(m.firstPublished < 1900 && m.translatorDied === null && /not named/.test(m.basis), `${id}: an anonymous translation must be older than 1900 (it is of ${m.firstPublished})`);
    } else {
      assert.ok(m.translatorDied !== null && m.translatorDied <= 1955, `${id}: the translator died in ${m.translatorDied}`);
    }
    assert.equal(m.translator, book(id).translator ?? null, id);
    assert.ok(m.basis.length > 20, `${id}: the rule applied to this book is written down`);
    assert.match(m.translatorSource, /^https:\/\//, `${id}: the page where the translator's dates were read`);
    assert.match(m.source, /^https:\/\//, id);
    assert.ok(m.edition.length > 20 && m.leftOut.length > 0, `${id}: the edition and what was left out are written down`);
  }
});

check('the credit line names the translator, the year, the source and the licence, and the manifest and the book print the same one', () => {
  for (const id of ids) {
    const b = book(id);
    const m = manifest.books.find((x) => x.id === id)!;
    assert.equal(b.credit, m.credit, id);
    if (m.translator !== null) {
      assert.ok(b.credit.includes(m.translator), `${id}: the credit names ${m.translator}`);
      assert.ok(b.credit.includes(String(m.translatorDied)), `${id}: the credit names the year the translator died`);
    } else assert.match(b.credit, /translator not named/, `${id}: the credit says the translator is not named`);
    assert.ok(b.credit.includes(String(m.firstPublished)), `${id}: the credit names the year`);
    assert.ok(/gutenberg\.org\/ebooks\/\d+|ccel\.org\/ccel\//.test(b.credit), `${id}: the credit names the source`);
    assert.match(m.source, /gutenberg\.org\/ebooks\/\d+$|ccel\.org\/ccel\//, id);
    assert.match(b.credit, /Public domain\.$/, id);
    assert.ok(b.credit.length < 520 && !/\n/.test(b.credit), `${id}: one line`);
  }
});

check('the books that are left out say why in words that name the translator and the rule, and none of them has a file', () => {
  for (const l of manifest.leftOut) {
    assert.ok(!existsSync(join(root, ASSETS, `${l.id}.json`)), `${l.id} has no text file`);
    assert.ok(!ids.includes(l.id));
  }
  const us = manifest.leftOut.filter((l) => l.verdict === 'US only');
  for (const l of us) assert.match(l.why, /died in \d{4}|life plus 70/, `${l.id}: says which translator and why it is protected`);
});

check('the size of the assets is known and kept in check: under 8 MB all together (the Bible text is about 5.9 MB more)', () => {
  const bytes = readdirSync(join(root, ASSETS)).reduce((t, f) => t + statSync(join(root, ASSETS, f)).size, 0);
  assert.ok(bytes > 100_000 && bytes < 8_000_000, `${bytes} bytes`);
});

/* ================================================================ the licences screen */

check('the licences screen has one entry for every book that has text: it is made from the manifest, so it cannot fall behind, and each entry is "Public domain" with the translator, the year and the page of the edition', () => {
  const src = read('app/licences.tsx');
  const code = src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  assert.match(code, /type ManifestBook = \{ title: string; author: string; translator: string \| null; firstPublished: number; source: string \};/);
  assert.match(code, /const BOOKS: Item\[\] = \(require\('\.\.\/assets\/books\/manifest\.json'\) as \{ books: ManifestBook\[\] \}\)\.books\.map\(\(b\) => \(\{/);
  assert.match(code, /name: b\.title,/);
  assert.match(code, /what: `\$\{b\.author\}, \$\{b\.translator \? `translated by \$\{b\.translator\}` : 'translator not named'\} \(\$\{b\.firstPublished\}\)\. The full text of the book, to read offline`,/);
  assert.match(code, /licence: 'Public domain',/);
  assert.match(code, /url: b\.source,/);
  assert.match(code, /\{BOOKS\.length > 0 && <Group title="BOOKS IN THE LIBRARY" items=\{BOOKS\} \/>\}/, 'drawn only when there is a book');
  assert.equal(existsSync(join(root, 'assets/books/manifest.json')), true, 'the file the screen requires is there');
  // what the screen will print for each book of the manifest is complete: no "undefined" and no "null" can reach it
  for (const m of manifest.books) {
    assert.ok(m.title && m.author && Number.isInteger(m.firstPublished) && (m.translator === null || m.translator.length > 0), `${m.id}: the fields the entry prints`);
    assert.match(m.source, /^https:\/\//, `${m.id}: the link opens`);
    assert.equal(m.verdict, 'public domain everywhere', `${m.id}: an entry that says "Public domain" is only made for a book that is`);
  }
  assert.doesNotMatch(code, /gutenberg|ccel\.org/i, 'no address of a source is written in the screen: books.test.ts keeps the screens free of it, the manifest has it');
  for (const l of manifest.leftOut) assert.ok(!manifest.books.some((b) => b.id === l.id), `${l.id} has no text and no entry`);
});

/* ================================================================ the glue */

const loaderPaths = () => [...read(`${GLUE}/books.generated.ts`).matchAll(/'([a-z0-9-]+)': \(\) => require\('([^']+)'\) as BookText,/g)].map((m) => ({ id: m[1], path: m[2] }));

check('books.generated.ts has a lazy loader for exactly the ids of the index, in the same order, with a literal path that exists in each', () => {
  const rows = loaderPaths();
  assert.deepEqual(rows.map((r) => r.id), ids);
  for (const r of rows) {
    assert.equal(r.path, `../../../../assets/books/${r.id}.json`, r.id);
    assert.ok(existsSync(resolve(join(root, GLUE), r.path)), `${r.id}: ${r.path} exists`);
    assert.equal(resolve(join(root, GLUE), r.path), join(root, ASSETS, `${r.id}.json`), r.id);
  }
  const src = read(`${GLUE}/books.generated.ts`);
  const code = src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  assert.equal((code.match(/require\(/g) ?? []).length, ids.length, 'one require per book and nothing else');
  assert.match(src, /^\/\/ Generated by tools\/books\/import_books\.py: do not edit by hand/);
  assert.match(src, /import type \{ BookText \} from '\.\/bookTextTypes';/);
});

check('bookText.ts is thin glue: it requires the index and the generated loaders, builds the API with makeBookTextApi, and exports the three names of the contract', () => {
  const src = read(`${GLUE}/bookText.ts`);
  assert.match(src, /import \{ BOOK_TEXT_LOADERS \} from '\.\/books\.generated';/);
  assert.match(src, /import \{ makeBookTextApi \} from '\.\/bookTextApi';/);
  assert.match(src, /require\('\.\.\/\.\.\/\.\.\/\.\.\/assets\/books\/index\.json'\) as BookTextIndexEntry\[\]/);
  assert.match(src, /export const BOOK_TEXT_INDEX: readonly BookTextIndexEntry\[\] = api\.index;/);
  assert.match(src, /export function hasBookText\(id: string\): boolean \{/);
  assert.match(src, /export function loadBookText\(id: string\): BookText \{/);
  assert.equal(existsSync(resolve(join(root, GLUE), '../../../../assets/books/index.json')), true);
  assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|http/, 'no network at runtime');
  assert.doesNotMatch(src, /\bimport [^;]*\.json'/, 'the JSON is required lazily where Metro needs it, never imported at the top of a screen');
});

check('the types file is the contract: five block kinds, the chapter and book shapes, and the index entry, with no React in it', () => {
  const src = read(`${GLUE}/bookTextTypes.ts`);
  for (const part of [
    "| { k: 'p'; t: string }", "| { k: 'h'; t: string }", "| { k: 'q'; t: string }", "| { k: 'li'; t: string }", "| { k: 'hr' };",
    'export type BookChapter = {', '  id: string;', '  title: string;', '  part?: string;', '  blocks: BookBlock[];',
    'export type BookText = {', '  translator?: string;', '  credit: string;', '  chapters: BookChapter[];',
    'export type BookTextIndexEntry = { id: string; chapters: number; words: number };',
  ]) assert.ok(src.includes(part), `bookTextTypes.ts lacks: ${part}`);
  assert.doesNotMatch(src, /^import /m);
});

check('the glue adds no new native module, no dependency and no script: the files it adds import only each other', () => {
  for (const f of ['bookText.ts', 'bookTextApi.ts', 'bookTextTypes.ts', 'books.generated.ts']) {
    for (const m of read(`${GLUE}/${f}`).matchAll(/^import [^;]*? from '([^']+)';/gm)) assert.match(m[1], /^\.\//, `${f} imports ${m[1]}`);
  }
  const pkg = read('package.json');
  assert.doesNotMatch(pkg, /"(postinstall|preinstall|prepare|prebuild|eas-build[a-z-]*)"/);
  assert.equal(dirname(join(root, GLUE, 'x')), join(root, GLUE));
});

console.log(`${n} of ${n} bookText checks passed`);
