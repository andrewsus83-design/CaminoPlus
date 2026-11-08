// Plain-node checks of the twelve free books of the Books tab (books/catalog.ts): which they are and in what order, what is said of each,
// and that the data that is only for later (group, source, licence notes) is kept apart from what is drawn. No React, no network.
// Run: npm run test:library (library.test.ts runs this file too).
//
// The owner's list is typed in again below on purpose, and not read from the catalog: a typo in a title, an author or a blurb, a book
// moved, or a link pasted back in that was found to point at another book, then fails here instead of reaching the screen.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BOOK_CATALOG, bookByline, type CatalogBook } from '../books/catalog';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };
const root = process.cwd(); // npm test runs from mobile/
const read = (p: string) => readFileSync(join(root, p), 'utf8');

// [id, title, author, era, blurb, group]: the owner's twelve, in the owner's order.
const OWNERS_LIST: readonly [string, string, string, string, string, string][] = [
  ['way-of-a-pilgrim', 'The Way of a Pilgrim', 'Anonymous', '19th century', 'A Russian wanderer walks and prays the Jesus Prayer.', 'Pilgrims on foot'],
  ['life-of-st-teresa', 'The Life of St. Teresa of Jesus', 'Teresa of Ávila', '1565', 'Her own story, written in Spain: prayer, struggle and courage.', 'Pilgrims on foot'],
  ['little-flowers', 'The Little Flowers of Saint Francis', 'Anonymous', '14th century', 'Simple, warm stories of Francis and his brothers on the road.', 'Pilgrims on foot'],
  ['dark-night', 'Dark Night of the Soul', 'John of the Cross', '16th century', 'For lonely or doubting days: a poem and its guide, from Spain.', 'Spanish and contemplative'],
  ['interior-castle', 'The Interior Castle', 'Teresa of Ávila', '1577', 'The soul as a castle of seven rooms, to read a chapter at a time.', 'Spanish and contemplative'],
  ['spiritual-exercises', 'The Spiritual Exercises', 'Ignatius of Loyola', '1522 to 1524', 'A guide to prayer begun at Manresa, in Spain.', 'Spanish and contemplative'],
  ['imitation-of-christ', 'The Imitation of Christ', 'Thomas à Kempis', 'c. 1420', 'Short, sharp counsels on humility and the daily cross.', 'Reflection and inner peace'],
  ['devout-life', 'Introduction to the Devout Life', 'Francis de Sales', '1609', 'Practical holiness for ordinary people in the middle of life.', 'Reflection and inner peace'],
  ['abandonment-to-providence', 'Abandonment to Divine Providence', 'Jean-Pierre de Caussade', '18th century', 'Giving each moment to God: calm for tired and lost days.', 'Reflection and inner peace'],
  ['confessions', 'Confessions', 'Augustine of Hippo', 'c. 400', 'The great story of a restless heart finding rest in God.', 'Great classics'],
  ['dialogue-of-st-catherine', 'The Dialogue of Saint Catherine of Siena', 'Catherine of Siena', '1370', 'A conversation with God, and Christ as the bridge.', 'Great classics'],
  ['story-of-a-soul', 'The Story of a Soul', 'Thérèse of Lisieux', '1898', 'The little way: love in small things, even a smile when tired.', 'Great classics'],
];

// The links that were checked (id -> source). A book that is not here has no source yet.
const CHECKED_SOURCES: Record<string, string> = {
  'way-of-a-pilgrim': 'https://ccel.org/ccel/philip_allan/pilgrim',
  'life-of-st-teresa': 'https://www.gutenberg.org/ebooks/8120',
  'imitation-of-christ': 'https://www.gutenberg.org/ebooks/1653',
  'abandonment-to-providence': 'https://www.gutenberg.org/ebooks/52057',
  confessions: 'https://www.gutenberg.org/ebooks/3296',
  'story-of-a-soul': 'https://www.gutenberg.org/ebooks/16772',
};
// Gutenberg numbers that were given first and turned out to be other books: they must not come back.
const WRONG_NUMBERS = ['40375', '14287', '17799', '57173', '43896', '59828', '5069'];

check('twelve books, in the owner\'s order: the title, the author, the era and the blurb of each are the owner\'s words', () => {
  assert.equal(BOOK_CATALOG.length, 12);
  assert.deepEqual(BOOK_CATALOG.map((b) => [b.id, b.title, b.author, b.era, b.blurb, b.group]), OWNERS_LIST.map((r) => [...r]));
});

check('every id is its own, lower case and stable (a bookmark is kept under it), and every book is free and has an author and a blurb', () => {
  const ids = BOOK_CATALOG.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(BOOK_CATALOG.map((b) => b.title)).size, 12, 'no title twice');
  for (const b of BOOK_CATALOG) {
    assert.match(b.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, b.id);
    assert.equal(b.free, true, `${b.title} is free`);
    for (const field of ['title', 'author', 'era', 'blurb'] as const) assert.ok(b[field].trim().length > 0, `${b.id} has a ${field}`);
    assert.equal(b.blurb, b.blurb.trim());
    assert.match(b.blurb, /[.]$/, `${b.id}: a blurb is a sentence`);
    assert.ok(b.blurb.length <= 80, `${b.id}: the blurb is short enough for a row (${b.blurb.length})`);
  }
});

check('the blurbs say nothing the owner did not (no promise of a date, a price or a place to read it, no claim about who walked where)', () => {
  const text = BOOK_CATALOG.map((b) => `${b.title} ${b.blurb}`).join('\n');
  assert.doesNotMatch(text, /\$\d|€\d|offline|download|available|santiago|camino|walked to/i);
});

check('the groups are data only: four of three books, in the owner\'s order, and no heading on screen is made from them', () => {
  const groups = [...new Set(BOOK_CATALOG.map((b) => b.group))];
  assert.deepEqual(groups, ['Pilgrims on foot', 'Spanish and contemplative', 'Reflection and inner peace', 'Great classics']);
  for (const g of groups) assert.equal(BOOK_CATALOG.filter((b) => b.group === g).length, 3, g);
});

check('sources: optional; one that is there is an https link and one of the checked ones; the seven numbers that pointed at other books are not in the data', () => {
  const withSource = BOOK_CATALOG.filter((b) => b.source !== undefined);
  assert.deepEqual(Object.fromEntries(withSource.map((b) => [b.id, b.source])), CHECKED_SOURCES);
  assert.equal(withSource.length, 6);
  for (const b of withSource) {
    const url = new URL(b.source!);
    assert.equal(url.protocol, 'https:', `${b.id}: a source is an https link`);
    assert.ok(['ccel.org', 'www.gutenberg.org'].includes(url.host), `${b.id}: ${url.host}`);
  }
  for (const b of BOOK_CATALOG.filter((x) => x.source === undefined)) assert.ok(!('source' in b), `${b.id}: no source means no key, not an empty one`);
  const all = JSON.stringify(BOOK_CATALOG);
  for (const wrong of WRONG_NUMBERS) assert.ok(!all.includes(`/ebooks/${wrong}`), `the link /ebooks/${wrong} is the wrong book`);
});

check('licence: only The Way of a Pilgrim and The Story of a Soul say "check the edition"; every book has a note and the same line about the edition', () => {
  assert.deepEqual(BOOK_CATALOG.filter((b) => b.licenceFlag === 'check-edition').map((b) => b.id), ['way-of-a-pilgrim', 'story-of-a-soul']);
  assert.ok(BOOK_CATALOG.filter((b) => b.licenceFlag !== 'check-edition').every((b) => b.licenceFlag === 'public-domain-original'));
  for (const b of BOOK_CATALOG) {
    assert.ok(b.licenceNote.trim().length > 0, `${b.id} has a licence note`);
    assert.equal(b.editionToConfirm, 'to confirm: translator and year of the edition at the source');
  }
  const by = (id: string): CatalogBook => BOOK_CATALOG.find((b) => b.id === id)!;
  assert.match(by('way-of-a-pilgrim').licenceNote, /1930 R\. M\. French translation \(Philip Allan\) is only just public domain in the US; other countries unchecked/);
  assert.match(by('story-of-a-soul').licenceNote, /Thomas N\. Taylor \(1873-1963\), 1912; .*until 2033/);
  assert.match(by('spiritual-exercises').licenceNote, /Gutenberg 70790 is a Jesuit adaptation by Coppens, not the plain translation/);
  for (const id of ['little-flowers', 'dark-night', 'interior-castle', 'devout-life']) assert.equal(by(id).licenceNote, 'edition to find', id);
  assert.equal(by('dialogue-of-st-catherine').licenceNote, 'English edition to find');
});

check('the covers: a colour of the palette and a glyph of the app\'s icons for each; the navy that is drawn on them is read in navigation.test.ts', () => {
  const tokens = JSON.parse(read('src/theme/tokens.json')) as { color: Record<string, string> };
  const icons = [...read('src/components/Icon.tsx').split('} as const;')[0].matchAll(/^ {2}(?:'([\w-]+)'|(\w+)):/gm)].map((m) => m[1] ?? m[2]);
  for (const b of BOOK_CATALOG) {
    assert.ok(b.cover in tokens.color, `${b.id}: ${b.cover} is not a colour of the palette`);
    assert.ok(icons.includes(b.icon), `${b.id}: Icon.tsx has no icon "${b.icon}"`);
  }
  assert.ok(new Set(BOOK_CATALOG.map((b) => b.icon)).size >= 10, 'the glyphs are not all alike');
});

check('the line under a title: the author, a dot and the era, which never breaks inside (no-break spaces)', () => {
  const by = (id: string): CatalogBook => BOOK_CATALOG.find((b) => b.id === id)!;
  assert.equal(bookByline(by('imitation-of-christ')).replace(/ /g, ' '), 'Thomas à Kempis · c. 1420');
  assert.equal(bookByline(by('dark-night')), 'John of the Cross · 16th century');
  assert.equal(bookByline(by('spiritual-exercises')), 'Ignatius of Loyola · 1522 to 1524');
  assert.equal(bookByline(by('confessions')), 'Augustine of Hippo · c. 400');
});

check('the data of the catalog is pure: no React, no React Native, no theme', () => {
  assert.doesNotMatch(read('src/features/library/books/catalog.ts'), /from '(react|react-native|expo|@\/)/);
});

/** The screens must not draw a book's group, source, licence flag or notes, nor the edition: they are data for later. */
function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(root, dir))) {
    const rel = join(dir, name);
    if (statSync(join(root, rel)).isDirectory()) {
      if (name !== '__tests__' && name !== 'node_modules') out.push(...sources(rel));
    } else if (/\.tsx?$/.test(name)) out.push(rel);
  }
  return out;
}

check('data only: no screen, component or hook in the app reads or prints the group, the source, the licence flag, the licence note or the edition of a book', () => {
  const offenders: string[] = [];
  const all = [...sources('app'), ...sources('src')].filter((f) => f !== join('src', 'features', 'library', 'books', 'catalog.ts'));
  for (const f of all) {
    const src = read(f).split('\n').filter((l) => !/^\s*(\/\/|\/?\*)/.test(l)).join('\n');
    if (/\b(licenceNote|licenceFlag|editionToConfirm)\b/.test(src)) offenders.push(`${f}: names a licence field`);
    if (/\.(source|group)\b/.test(src) && /books\/catalog|CatalogBook|BOOK_CATALOG/.test(src)) offenders.push(`${f}: reads .source or .group of a book`);
    for (const b of BOOK_CATALOG) {
      if (b.source && src.includes(b.source)) offenders.push(`${f}: has the link of ${b.id}`);
      if (b.licenceNote.length > 20 && src.includes(b.licenceNote)) offenders.push(`${f}: has the licence note of ${b.id}`);
    }
    if (/gutenberg|ccel\.org/i.test(src)) offenders.push(`${f}: names a source site`);
  }
  assert.deepEqual(offenders, []);
});

console.log(`${n} of ${n} passed (Books)`);
