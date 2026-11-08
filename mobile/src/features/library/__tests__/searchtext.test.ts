// Plain-node checks of the search of the words of the Bible (bible/searchCore.ts, searchText.ts): every word of the query starts a word of the
// verse, case, accents and curly quotes do not matter, the results come in the order of the Bible, there is a limit, and the places to
// highlight are inside the text. The real books are read from assets/bible/webc. No React, no network.
// Run: npm run test:library (library.test.ts runs this file too).
//
// What the matches should be is worked out here a second way, from the words of every verse (cut with a regular expression), and not with the
// code that is under test (which looks for the typed letters in the whole verse and then checks that a word starts there).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_LIMIT, MAX_QUERY_WORDS, foldText, makeSearch, matchVerse, oneLine, queryWords } from '../bible/searchCore';
import type { BookIndexEntry, BookText, VerseHit } from '../bible/textTypes';
import { SAMPLE_READING } from '../daily/sample';
import { run } from './runTs';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };
const root = process.cwd(); // npm test runs from mobile/
const ASSETS = join(root, 'assets/bible/webc');
const BIBLE_DIR = join(root, 'src/features/library/bible');

const index = (JSON.parse(readFileSync(join(ASSETS, 'index.json'), 'utf8')) as { books: BookIndexEntry[] }).books;
const cache = new Map<string, BookText>();
const loadBook = (code: string): BookText => {
  let book = cache.get(code);
  if (!book) {
    book = JSON.parse(readFileSync(join(ASSETS, `${code}.json`), 'utf8')) as BookText;
    cache.set(code, book);
  }
  return book;
};

// The first call has to read the 73 books; the time is printed, because a screen has to know what the first search costs.
const started = Date.now();
const search = makeSearch(index, loadBook);
search.prepare();
const prepared = Date.now() - started;
const { searchVerses } = search;
console.log(`     (reading and folding the 73 books took ${prepared} ms here)`);

type Verse = { code: string; chapter: number; verse: string; text: string };
/** Every verse that has words, in the order of the Bible. */
const verses: Verse[] = [];
for (const info of index) for (const chapter of loadBook(info.code).chapters) for (const v of chapter.verses) {
  const text = oneLine(v.t);
  if (text) verses.push({ code: info.code, chapter: chapter.c, verse: v.n, text });
}
const ref = (h: { code: string; chapter: number; verse: string }) => `${h.code} ${h.chapter}:${h.verse}`;
/** The words of a verse as they are printed, in lower case, a quote at the start or the end of one left off ("’woman,’" is woman). */
const wordsOf = (text: string) => [...text.matchAll(/[A-Za-z0-9’']+/g)].map((m) => m[0].replace(/^[’']+|[’']+$/g, '').toLowerCase().replace(/’/g, "'")).filter(Boolean);

/** The expected hits, worked out from the words of each verse: a second way to the same answer. */
function expected(query: string): Array<Verse & { marks: Array<[number, number]> }> {
  const words = queryWords(query);
  const out: Array<Verse & { marks: Array<[number, number]> }> = [];
  if (words.length === 0) return out;
  for (const v of verses) {
    const marks: Array<[number, number]> = [];
    const found = new Set<string>();
    for (const m of v.text.matchAll(/[A-Za-z0-9’']+/g)) {
      // the words of the verse as they are printed: letters, digits, and the apostrophes of "God’s" (a quote at the start or end of a word is not one)
      const raw = m[0].replace(/^[’']+|[’']+$/g, '');
      const at = m.index! + m[0].indexOf(raw);
      const word = raw.toLowerCase().replace(/’/g, "'");
      for (const w of words) if (word.startsWith(w)) { found.add(w); marks.push([at, at + w.length]); }
    }
    if (found.size === words.length) {
      marks.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const merged: Array<[number, number]> = [];
      for (const mk of marks) {
        const last = merged[merged.length - 1];
        if (last && mk[0] <= last[1]) last[1] = Math.max(last[1], mk[1]);
        else merged.push([mk[0], mk[1]]);
      }
      out.push({ ...v, marks: merged });
    }
  }
  return out;
}

check('every word of the query has to be in the verse: "Jesus wept" is John 11:35, and every hit has both words', () => {
  const hits = searchVerses('Jesus wept');
  assert.ok(hits.length >= 1);
  assert.ok(hits.some((h) => ref(h) === 'JHN 11:35'));
  assert.equal(hits.find((h) => ref(h) === 'JHN 11:35')!.text, 'Jesus wept.');
  for (const h of hits) assert.match(h.text, /\bjesus\b[\s\S]*\bwept\b|\bwept\b[\s\S]*\bjesus\b/i, ref(h));
  assert.ok(searchVerses('Jesus').length > searchVerses('Jesus wept').length, 'a word more, fewer verses');
  assert.deepEqual(searchVerses('wept Jesus').map(ref), hits.map(ref), 'the order of the words of the query does not matter');
  assert.deepEqual(searchVerses('jesus jesus wept').map(ref), hits.map(ref), 'a word twice is one word');
  assert.deepEqual(searchVerses('Jesus wept zzzqx'), [], 'one word that is nowhere: nothing');
});

check('every query gives exactly the verses and the places that the second way of working it out gives (18 queries, all hits)', () => {
  for (const q of ['Jesus wept', 'love', 'lord god', 'bless', 'the', 'a', 'in the beginning', 'God’s', "god's spirit", 'peace be', 'selah', 'fear not', 'ark covenant', 'lift eyes hills', 'i am', 'Mary Martha', 'omitted', 'abraham isaac jacob']) {
    const want = expected(q);
    const got = searchVerses(q, 100000);
    assert.deepEqual(got.map(ref), want.map(ref), `"${q}": which verses`);
    assert.deepEqual(got.map((h) => h.marks), want.map((w) => w.marks), `"${q}": which places`);
    assert.deepEqual(got.map((h) => h.text), want.map((w) => w.text), `"${q}": which words`);
  }
});

check('case, accents and curly quotes do not matter: "God’s Spirit", "god\'s spirit", "GOD\'S SPIRIT" and "Gód’s Spírit" find the same verses', () => {
  const base = searchVerses('God’s Spirit', 500);
  assert.ok(base.length > 10);
  assert.ok(base.some((h) => ref(h) === 'GEN 1:2'), 'Genesis 1:2 is "God’s Spirit was hovering"');
  for (const q of ["god's spirit", "GOD'S SPIRIT", 'Gód’s Spírit', 'god‘s spirit', '  God’s   Spirit  ', 'God’s, Spirit!', '“God’s” (Spirit)']) assert.deepEqual(searchVerses(q, 500), base, q);
  assert.deepEqual(searchVerses('Ávila'), [], 'a word that is not in the Bible');
  assert.deepEqual(searchVerses('Mosés').map(ref), searchVerses('Moses').map(ref), 'an accent in the query');
  // a straight apostrophe in the query finds the curly one of the text, and the verse is returned as printed
  assert.ok(searchVerses("God's", 3).every((h) => h.text.includes('God’s')), 'the text keeps its curly quote');
});

check('a word has to START a word of the verse: "bless" finds "blessed", "ord" does not find "Lord", "s" is not in "God’s"', () => {
  assert.ok(searchVerses('bless', 200).some((h) => /\bblessed\b/i.test(h.text)));
  const ord = searchVerses('ord', 5000);
  for (const h of ord) assert.match(h.text, /\bord/i, `${ref(h)} has a word that starts with ord`);
  assert.ok(ord.length < verses.filter((v) => /ord/i.test(v.text)).length, 'a word that only has "ord" inside it does not count');
  assert.ok(!searchVerses('esus').some((h) => ref(h) === 'JHN 11:35'));
  const gods = searchVerses('gods', 5000).map(ref);
  assert.ok(!gods.includes('GEN 1:2'), '"gods" is not "God’s"');
  const s = searchVerses('s', 100000);
  assert.ok(s.every((h) => wordsOf(h.text).some((w) => w.startsWith('s'))), 'a word that starts with s');
  const onlyPossessive = verses.find((v) => /[a-z]’s/i.test(v.text) && !wordsOf(v.text).some((w) => w.startsWith('s')));
  assert.ok(onlyPossessive, 'a verse whose only s is the one of a name’s');
  assert.ok(!s.some((h) => ref(h) === ref(onlyPossessive!)), `${ref(onlyPossessive!)}: the s of "’s" does not start a word`);
});

check('typing narrows: every longer start of a word finds a subset of the verses of the shorter one', () => {
  let before = searchVerses('b', 100000).map(ref);
  for (const q of ['bl', 'ble', 'bles', 'bless', 'blesse', 'blessed']) {
    const now = searchVerses(q, 100000).map(ref);
    assert.ok(now.length <= before.length, `${q} is no more than before`);
    assert.ok(now.every((r) => before.includes(r)), `${q}: a subset`);
    before = now;
  }
  assert.ok(before.length > 100);
});

check('the results are in the order of the Bible: the books of the app, then the chapters, then the verses', () => {
  const order = new Map(index.map((b, i) => [b.code, i]));
  for (const q of ['the', 'lord', 'and the', 'selah']) {
    const hits = searchVerses(q, 3000);
    const at = (h: VerseHit) => { const book = loadBook(h.code); const c = book.chapters[h.chapter - 1]; return order.get(h.code)! * 1e9 + h.chapter * 1e5 + c.verses.findIndex((v) => v.n === h.verse); };
    for (let i = 1; i < hits.length; i += 1) assert.ok(at(hits[i - 1]) < at(hits[i]), `"${q}": ${ref(hits[i - 1])} before ${ref(hits[i])}`);
  }
  // an Old Testament verse comes before a Deuterocanon verse and that before a New Testament verse, whatever the query
  const codes = searchVerses('wisdom', 5000).map((h) => order.get(h.code)!);
  assert.deepEqual([...codes].sort((a, b) => a - b), codes);
  assert.ok(new Set(searchVerses('wisdom', 5000).map((h) => h.code)).size > 5, 'wisdom is in many books');
});

check('the limit: 100 by default, as many as asked, the first ones of the Bible; less than 1, or not a number, finds nothing', () => {
  assert.equal(DEFAULT_LIMIT, 100);
  const all = searchVerses('the', 100000);
  assert.ok(all.length > 20000, 'a very common word');
  assert.equal(searchVerses('the').length, 100);
  assert.deepEqual(searchVerses('the').map(ref), all.slice(0, 100).map(ref), 'the first 100 of the Bible');
  assert.equal(searchVerses('the', 1).length, 1);
  assert.equal(ref(searchVerses('the', 1)[0]), 'GEN 1:1');
  assert.deepEqual(searchVerses('the', 7).map(ref), all.slice(0, 7).map(ref));
  assert.equal(searchVerses('the', 2.9).length, 2, 'a part of a hit is not a hit');
  assert.equal(searchVerses('the', Infinity).length, all.length);
  for (const limit of [0, -1, 0.5, NaN, -Infinity]) assert.deepEqual(searchVerses('the', limit), [], `limit ${limit}`);
  assert.equal(searchVerses('Jesus wept', 1).length, 1);
});

check('a query with no words in it finds nothing: blanks, punctuation, quotes, dashes, an accent alone', () => {
  for (const q of ['', ' ', '   \n\t ', '...', '“”', '’', '—', '(),;:!?', '\u0301', '😀']) assert.deepEqual(searchVerses(q), [], JSON.stringify(q));
  assert.deepEqual(queryWords('  “Love”, —the LORD’s  love! '), ['love', 'the', "lord's"]);
  assert.deepEqual(queryWords("it's it’s IT'S"), ["it's"]);
  assert.deepEqual(queryWords('3:16'), ['3', '16']);
  assert.deepEqual(queryWords('a'.repeat(5) + ' ' + Array.from({ length: 30 }, (_, i) => `w${i}`).join(' ')).length, MAX_QUERY_WORDS, 'the words after the 16th are not looked at');
});

check('the places to highlight are inside the text, in order, never touching or overlapping, and each starts a word that starts with a word of the query', () => {
  for (const q of ['lord', 'the lord god', 'love your', 'bless', 'God’s Spirit', 'a', 'i am']) {
    for (const h of searchVerses(q, 4000)) {
      assert.ok(h.marks.length >= 1, `${ref(h)}: at least one place`);
      let last = -1;
      for (const [a, b] of h.marks) {
        assert.ok(Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b > a && b <= h.text.length, `${ref(h)}: [${a}, ${b}) is inside the text`);
        assert.ok(a > last, `${ref(h)}: in order, not touching`);
        last = b;
        assert.ok(a === 0 || !/[A-Za-z0-9]/.test(h.text[a - 1]), `${ref(h)}: a place starts a word`);
        assert.ok(queryWords(q).some((w) => foldText(h.text.slice(a, b)).startsWith(w) || w.startsWith(foldText(h.text.slice(a, b)))), `${ref(h)}: "${h.text.slice(a, b)}" is part of a word of the query`);
      }
    }
  }
  const h = searchVerses('lift eyes hills').find((x) => ref(x) === 'PSA 121:1')!;
  assert.equal(h.text, SAMPLE_READING.verses[0].text);
  assert.deepEqual(h.marks.map(([a, b]) => h.text.slice(a, b)), ['lift', 'eyes', 'hills']);
  assert.deepEqual(h.marks, [[h.text.indexOf('lift'), h.text.indexOf('lift') + 4], [h.text.indexOf('eyes'), h.text.indexOf('eyes') + 4], [h.text.indexOf('hills'), h.text.indexOf('hills') + 5]]);
  const typed = searchVerses('lif', 1000).find((x) => ref(x) === 'PSA 121:1')!;
  assert.deepEqual(typed.marks.map(([a, b]) => typed.text.slice(a, b)), ['lif'], 'only what was typed is marked');
  const gods = searchVerses('God’s Spirit', 5).find((x) => ref(x) === 'GEN 1:2')!;
  assert.deepEqual(gods.marks.map(([a, b]) => gods.text.slice(a, b)), ['God’s', 'Spirit'], 'the curly quote is inside the mark');
});

check('a hit is {code, chapter, verse, text, marks}: the label of the verse as printed, the words as one line (no tab, no line break), and verses without words are never found', () => {
  const hits = searchVerses('the', 3000);
  for (const h of hits) {
    assert.deepEqual(Object.keys(h).sort(), ['chapter', 'code', 'marks', 'text', 'verse']);
    assert.equal(typeof h.chapter, 'number');
    assert.equal(typeof h.verse, 'string');
    assert.doesNotMatch(h.text, /[\t\n]/);
    assert.equal(h.text, oneLine(loadBook(h.code).chapters[h.chapter - 1].verses.find((v) => v.n === h.verse)!.t));
  }
  const psalm = searchVerses('blessed man walk', 5).find((x) => ref(x) === 'PSA 1:1')!;
  assert.equal(psalm.text, 'Blessed is the man who doesn’t walk in the counsel of the wicked, nor stand on the path of sinners, nor sit in the seat of scoffers;', 'poetry is joined by a space');
  const empty = new Set(['SIR 1:5', 'SIR 11:15-16', 'LUK 17:36', 'ACT 8:37', 'ROM 16:25']);
  assert.deepEqual(searchVerses('omitted authorities best', 1000).filter((h) => empty.has(ref(h))), [], 'a note that the app does not print is not searched');
  assert.ok(searchVerses('Selah', 1000).length >= 74);
});

check('matchVerse and queryWords on their own: every word is needed, the places are merged, a word starts a word and nothing else', () => {
  assert.deepEqual(matchVerse("in the beginning god's spirit", ['god', 'in']), [[0, 2], [17, 20]]);
  assert.equal(matchVerse('the lord', ['lord', 'god']), null);
  assert.equal(matchVerse('the lord', ['ord']), null);
  assert.equal(matchVerse("god's", ['s']), null, 'the s of god’s is not a word');
  assert.deepEqual(matchVerse("god's", ['god']), [[0, 3]]);
  assert.deepEqual(matchVerse("god's", ["god's"]), [[0, 5]]);
  assert.deepEqual(matchVerse('lord of lords', ['lord']), [[0, 4], [8, 12]], 'every start of a word');
  assert.deepEqual(matchVerse('lord', ['lo', 'lord']), [[0, 4]], 'two words of the query on one word: one place');
  assert.deepEqual(matchVerse("'woman,' she said", ['woman']), [[1, 6]], 'a quote before a word is not part of it');
  assert.deepEqual(matchVerse('a—b', ['b']), [[2, 3]], 'a dash splits words');
  assert.equal(foldText('“It’s—GOD’s\u00a0Spirit”'), '"it\'s—god\'s spirit"');
  assert.equal(foldText('Café Zoë Ávila'), 'cafe zoe avila');
  assert.equal(foldText('Cafe\u0301 Zoe\u0308'), 'cafe zoe', 'decomposed accents are put in composed form first, so the folded words are as long as the composed text');
  assert.ok(verses.every((v) => foldText(v.text).length === v.text.length), 'one character in, one character out, for every verse of the Bible');
});

check('makeSearch on other books: accents in the text are ignored, nothing is read before the first search, and each book is read once', () => {
  const calls: string[] = [];
  const fake: Record<string, BookText> = {
    AAA: { code: 'AAA', name: 'A', chapters: [{ c: 1, verses: [{ n: '1', t: 'The Café of Zoë' }, { n: '2', t: '\tnaïve\n\t\tFAÇADE' }, { n: '3', t: '' }, { n: '4', t: 'Cafe\u0301 decomposed' }] }] },
    BBB: { code: 'BBB', name: 'B', chapters: [{ c: 1, verses: [{ n: '7', t: 'cafe' }] }, { c: 2, verses: [{ n: '1', t: 'Café' }] }] },
  };
  const info: BookIndexEntry[] = [{ code: 'AAA', name: 'A', chapters: 1, verses: 4 }, { code: 'BBB', name: 'B', chapters: 2, verses: 2 }];
  const s = makeSearch(info, (code) => { calls.push(code); return fake[code]; });
  assert.deepEqual(calls, [], 'making the search reads nothing');
  assert.deepEqual(s.searchVerses('cafe').map(ref), ['AAA 1:1', 'AAA 1:4', 'BBB 1:7', 'BBB 2:1']);
  assert.deepEqual(s.searchVerses('Zoe café').map(ref), ['AAA 1:1']);
  assert.deepEqual(s.searchVerses('naive facade').map(ref), ['AAA 1:2']);
  assert.equal(s.searchVerses('cafe')[1].text, 'Café decomposed', 'the text comes back in composed form');
  assert.deepEqual(s.searchVerses('cafe')[0].marks, [[4, 8]]);
  s.prepare();
  s.searchVerses('cafe');
  assert.deepEqual(calls, ['AAA', 'BBB'], 'each book was read once');
  const turkish = makeSearch([{ code: 'AAA', name: 'A', chapters: 1, verses: 1 }], () => ({ code: 'AAA', name: 'A', chapters: [{ c: 1, verses: [{ n: '1', t: '\u0130stanbul' }] }] }));
  assert.deepEqual(turkish.searchVerses('istanbul')[0].marks, [[0, 8]], 'a capital I with a dot is one letter, and one place');
});

check('searchText.ts, run for real through the generated map and the files: the same hits as the search above, and prepareSearch', () => {
  const real = run(join(BIBLE_DIR, 'searchText.ts'));
  assert.deepEqual(Object.keys(real).sort(), ['prepareSearch', 'searchVerses']);
  real.prepareSearch();
  real.prepareSearch();
  for (const q of ['Jesus wept', 'God’s Spirit', 'lift eyes hills', 'zzzqx', '']) assert.deepEqual(real.searchVerses(q), searchVerses(q), q);
  assert.deepEqual(real.searchVerses('the', 3).map(ref), searchVerses('the', 3).map(ref));
  assert.equal(real.searchVerses('the').length, 100);
});

console.log(`${n} of ${n} passed (Bible search)`);

// the second search is a scan of folded text: how long it takes is printed, not asserted (a laptop and a phone differ)
const t0 = process.hrtime.bigint();
for (let i = 0; i < 20; i += 1) searchVerses('the lord');
console.log(`     (a search of "the lord" took ${(Number(process.hrtime.bigint() - t0) / 20 / 1e6).toFixed(1)} ms here, after the books were read)`);
