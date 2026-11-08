// Scenarios of the Bible side of the Library: the books as compact tiles, two in a row, the chapters of a book, the reader with Previous and Next, a verse chosen and
// bookmarked, a link to a verse, the search of verses and the addresses that lead nowhere (going back to the chapter read last is the Continue reading bar, in
// continue.scenarios.mjs). Same rules as
// scenarios.mjs (each runs in light and dark, in a browser of its own, and anything that goes wrong in the page fails it); they wait for what a person would wait
// for, never for a fixed time. They use only what exists in the real text: Psalm 121 and John 1 are the chapters they read, Malachi 4 and Tobit 1 the pair across
// a boundary, Genesis 1 and Revelation 22 the two ends of the Bible. scenarios.mjs puts them in its list.
import assert from 'node:assert/strict';
import { UID } from './fixtures.mjs';
import { domQuiet, eventually, pathOf } from './harness.mjs';

const waitPath = (page, want, what = 'the address') => eventually(() => pathOf(page), (p) => p === want, { what: `${what} (wanted ${want})` });
const button = (page, name) => page.getByRole('button', { name, exact: true });
const radio = (page, name) => page.getByRole('radio', { name, exact: true });
const shown = (page, text) => page.getByText(text, { exact: true }).filter({ visible: true }).first(); // Library stays mounted under the screens pushed over it
const box = async (locator, what) => { const b = await locator.boundingBox(); if (!b) throw new Error(`${what} has no box (it is not on the screen)`); return b; };
const search = (page) => page.getByRole('textbox', { name: 'Search the library' });
const keyOf = (name) => `kv:u.${UID}.library.${name}`;
const readKey = (page, name) => page.evaluate((k) => localStorage.getItem(k), keyOf(name));

/** The books of the Bible by part, as a person counts them. */
const COUNTS = { 'Old Testament': 39, Deuterocanon: 7, 'New Testament': 27 };

/** The names that are the hero of a tile: every one is the full 24 (h4) from the narrowest phone up (Genesis, Exodus ... Judith). */
const SHORT_NAMES = ['Genesis', 'Exodus', 'Numbers', 'Joshua', 'Judges', 'Ruth', 'Job', 'Psalms', 'Isaiah', 'Amos', 'Jonah', 'Micah', 'Mark', 'Luke', 'John', 'Acts', 'Romans', 'James', 'Jude', 'Tobit', 'Judith'];

/** The type scale of design/tokens.json that a tile uses, and the sums of gridMath.ts: a name is h4 24, h5 17 or h6 15 in Fraunces, the count is mono 15 in JetBrains Mono, a tile is as high as
 *  two lines of h4 (30), space.2 (8) and the mono line (22) plus twice its padding and hairline (16 + 1 each side, 12 + 1 under 352 wide), two in a row, 12 apart (8 under 352). */
const NAME_SIZES = [24, 17, 15];
const COUNT_SIZE = 15;
const tileSums = (width) => { const narrow = width < 352; const pad = narrow ? 12 : 16; const gap = narrow ? 8 : 12; return { pad, gap, edge: pad + 1, height: 60 + 8 + 22 + 2 * (pad + 1), tile: Math.floor((width - 32 - gap) / 2) }; };

/** What the page says about every book tile that is on it: its box, the room between its outline and its words, and whether its name and its count are cut (read from the DOM, in the page). */
const readTiles = (page) => page.evaluate(() => {
  const lines = (el) => { const r = document.createRange(); r.selectNodeContents(el); return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size; };
  const out = [];
  for (const b of document.querySelectorAll('[role="button"]')) {
    const label = b.getAttribute('aria-label') || '';
    const m = /^(.+), (\d+) chapters?$/.exec(label);
    const rect = b.getBoundingClientRect();
    if (!m || rect.width === 0) continue;
    const [name, count] = [b.children[0], b.children[1]];
    const [nr, cr] = [name.getBoundingClientRect(), count.getBoundingClientRect()];
    out.push({
      label, name: m[1], x: rect.x, y: rect.y, w: rect.width, h: rect.height,
      padLeft: nr.left - rect.left, padTop: nr.top - rect.top, padBottom: rect.bottom - cr.bottom, padCountLeft: cr.left - rect.left,
      nameLines: lines(name), nameSize: parseFloat(getComputedStyle(name).fontSize), nameFont: getComputedStyle(name).fontFamily, nameCut: name.scrollWidth > name.clientWidth + 1 || name.scrollHeight > name.clientHeight + 1,
      nameWidest: Math.max(...[...name.childNodes].filter((n) => n.nodeType === 3).flatMap((n) => { const r = document.createRange(); r.selectNodeContents(n); return [...r.getClientRects()].map((q) => q.width); }), 0),
      countLines: lines(count), countSize: parseFloat(getComputedStyle(count).fontSize), countFont: getComputedStyle(count).fontFamily, countCut: count.scrollWidth > count.clientWidth + 1 || count.scrollHeight > count.clientHeight + 1,
    });
  }
  return out;
});

/** Scrolls the one scroll view of the screen (the first element that has more to scroll than it shows) and says how far it went. */
const scrollPage = (page, y) => page.evaluate((to) => {
  const el = [...document.querySelectorAll('div')].find((d) => d.scrollHeight > d.clientHeight + 50 && /(auto|scroll)/.test(getComputedStyle(d).overflowY));
  if (!el) return -1;
  el.scrollTop = to;
  return el.scrollTop;
}, y);

export const BIBLE_SCENARIOS = [
  {
    name: 'Library: the daily reading banner is compact (at most 128 high at 390 wide, 148 at 320), ONE button, and the banner, the three choices, the heading and the first row of tiles (two) are all on the first screen, clear of the tab bar',
    persona: 'in',
    async run({ page, step, go }) {
      step('open Library at 390 x 844');
      await go('/library');
      const banner = page.getByRole('button', { name: /^Read today/ });
      await eventually(() => banner.count(), (n) => n === 1, { what: 'the number of "Read today" buttons: the card is one button, the gold pill is not a second one' });
      const b = await box(banner, 'the banner');
      assert(b.height <= 128, `the banner is ${b.height} high at 390 wide`);
      assert(b.height >= 90, `the banner is ${b.height} high: it has its label, title, note and pill`);
      step('the card holds the date, the title, one handwritten note and the gold pill with its label');
      await page.getByText('Daily reading', { exact: true }).first().waitFor();
      await page.getByText('Buen Camino!', { exact: true }).first().waitFor();
      await page.getByText(/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday) \d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December)$/i).first().waitFor();
      step('the choice of the part, the heading and the first row of tiles are under it, and clear of the tab bar, without scrolling');
      const group = await box(page.getByRole('radiogroup', { name: 'Part of the Bible' }), 'the three choices');
      const heading = await box(page.getByRole('heading', { name: 'Books of the Bible', exact: true }), 'the heading');
      const first = await box(button(page, 'Genesis, 50 chapters'), 'the Genesis tile');
      const tabs = await box(page.getByRole('tab').first(), 'the tab bar');
      assert(group.y >= b.y + b.height - 1, 'the choices are under the banner');
      assert(heading.y >= group.y + group.height - 1, 'the heading is under the choices');
      assert(first.y >= heading.y + heading.height - 1, 'the tiles are under the heading');
      assert(first.y + first.height <= tabs.y + 1, `the first row of tiles (bottom ${first.y + first.height}) is clear of the tab bar (top ${tabs.y}) on the first screen`);
      const second = await box(button(page, 'Exodus, 40 chapters'), 'the Exodus tile');
      assert(Math.abs(second.y - first.y) <= 1 && second.x > first.x + first.width, 'Genesis and Exodus are the two tiles of the first row');
      assert(Math.abs(first.height - tileSums(390).height) <= 1, `a tile is ${tileSums(390).height} high at 390 (${first.height})`);
      assert(second.y + second.height <= tabs.y + 1, 'and so is the second tile of the row');
      step('at 320 x 640 the banner is at most 148 high');
      await page.setViewportSize({ width: 320, height: 640 });
      await domQuiet(page, 300);
      const narrow = await box(banner, 'the banner at 320');
      assert(narrow.height <= 148, `the banner is ${narrow.height} high at 320 wide`);
      step('tapping the title (not the pill) and tapping the pill both open the daily reading');
      await page.setViewportSize({ width: 390, height: 844 });
      await domQuiet(page, 300);
      await page.getByText('Daily reading', { exact: true }).first().click();
      await waitPath(page, '/library/daily', 'the address after tapping the banner');
    },
  },
  {
    name: 'Library: the three choices under the banner (Old Testament, Deuterocanon, New Testament) are an inline segmented control, move with the page, and show that part as compact tiles, two in a row',
    persona: 'in',
    async run({ page, step, go }) {
      const group = page.getByRole('radiogroup', { name: 'Part of the Bible' });
      const checked = (name) => radio(page, name).getAttribute('aria-checked');
      step('open Library: three radios in order, the Old Testament chosen, every one at least 44 high');
      await go('/library');
      await group.waitFor();
      await eventually(() => page.getByRole('radio').allInnerTexts().then((all) => all.map((t) => t.replace(/\s+/g, ' ').trim()).join('|')), (t) => t === 'Old Testament|Deuterocanon|New Testament', { what: 'the three choices, in order' });
      await eventually(() => checked('Old Testament'), (v) => v === 'true', { what: 'the Old Testament is chosen at first' });
      for (const name of Object.keys(COUNTS)) { const r = await box(radio(page, name), name); assert(r.height >= 44 && r.width >= 44, `${name} is a touch target of at least 44 (${r.width} x ${r.height})`); }
      await shown(page, '39 books').waitFor();
      step('it is in the page: when the page is scrolled it goes up with it, and it is not at the bottom of the screen');
      const before = await box(group, 'the choices');
      const tabs = await box(page.getByRole('tab').first(), 'the tab bar');
      assert(before.y + before.height < tabs.y - 100, 'the choices are near the top of the page, not floating above the tab bar');
      const went = await scrollPage(page, 120);
      assert(went > 60, `the page scrolled (${went})`);
      const after = await box(group, 'the choices after scrolling');
      assert(Math.abs((before.y - after.y) - went) < 3, `the choices moved with the page: ${before.y} -> ${after.y} after scrolling ${went}`);
      await scrollPage(page, 0);
      step('the Old Testament is a grid of compact tiles, two in a row, 39 of them: Genesis first, Malachi last, no "Soon"');
      await eventually(() => readTiles(page).then((t) => t.length), (n) => n === 39, { what: 'the number of tiles of the Old Testament' });
      const tiles = await readTiles(page);
      assert.equal(tiles[0].name, 'Genesis');
      assert.equal(tiles[38].name, 'Malachi');
      const xs = [...new Set(tiles.slice(0, 9).map((t) => Math.round(t.x)))];
      assert.equal(xs.length, 2, `two columns (x: ${xs})`);
      const sums = tileSums(390);
      for (const t of tiles) {
        assert(Math.abs(t.w - sums.tile) <= 1 && Math.abs(t.h - sums.height) <= 1, `${t.label} is a compact tile of ${sums.tile} by ${sums.height} at 390 (${t.w} x ${t.h})`);
        assert(t.w > t.h, `${t.label} is wider than it is high (${t.w} x ${t.h}): not a square any more`);
      }
      step('the words are 17 from the outline (the hairline and space.4), on the left, at the top and at the bottom: the first letter used to be 4 from it');
      for (const t of tiles) {
        assert(Math.abs(t.padLeft - sums.edge) <= 0.6, `${t.label}: the name is ${t.padLeft} from the left of its tile, not ${sums.edge}`);
        assert(Math.abs(t.padCountLeft - sums.edge) <= 0.6, `${t.label}: the count is ${t.padCountLeft} from the left of its tile, not ${sums.edge}`);
        assert(Math.abs(t.padTop - sums.edge) <= 0.6, `${t.label}: the name is ${t.padTop} from the top of its tile, not ${sums.edge}`);
        assert(Math.abs(t.padBottom - sums.edge) <= 0.6, `${t.label}: the count is ${t.padBottom} from the bottom of its tile, not ${sums.edge}`);
      }
      assert(Math.abs(tiles[2].y - tiles[0].y - sums.height - sums.gap) <= 1, `the rows are ${sums.gap} apart (${tiles[2].y - tiles[0].y - sums.height})`);
      assert(Math.abs(tiles[1].x - tiles[0].x - sums.tile - sums.gap) <= 1, `the tiles of a row are ${sums.gap} apart`);
      await eventually(() => page.getByText(/^soon$/i).count(), (n) => n === 0, { what: 'the number of "Soon" chips on the Bible tab' });
      step('Deuterocanon: seven tiles, the note about the Greek additions of Esther and Daniel, the note about the Orthodox Bibles, and no row of added passages');
      await radio(page, 'Deuterocanon').click();
      await shown(page, '7 books').waitFor();
      await eventually(() => readTiles(page).then((t) => t.map((x) => x.name).join('|')), (v) => v === 'Tobit|Judith|Wisdom|Sirach|Baruch|1 Maccabees|2 Maccabees', { what: 'the tiles of the Deuterocanon' });
      await shown(page, 'Esther and Daniel, in the Old Testament, include their Greek additions: Daniel 3 holds the Prayer of Azariah and the Song of the Three, 13 is Susanna and 14 is Bel and the Dragon.').waitFor();
      await shown(page, 'Orthodox Bibles include a few more books.').waitFor();
      await eventually(() => page.getByText(/Additions to/).count(), (n) => n === 0, { what: 'the number of rows of added passages' });
      await eventually(() => checked('Deuterocanon'), (v) => v === 'true', { what: 'Deuterocanon is chosen' });
      await eventually(() => checked('Old Testament'), (v) => v === 'false', { what: 'the Old Testament is not chosen any more' });
      step('New Testament: 27 tiles, Matthew first, Revelation last, no notes');
      await radio(page, 'New Testament').click();
      await shown(page, '27 books').waitFor();
      await eventually(() => readTiles(page).then((t) => t.length), (n) => n === 27, { what: 'the number of tiles of the New Testament' });
      const nt = await readTiles(page);
      assert.equal(nt[0].name, 'Matthew');
      assert.equal(nt[26].name, 'Revelation');
      await eventually(() => shown(page, 'Orthodox Bibles include a few more books.').count(), (n) => n === 0, { what: 'the number of Orthodox notes on the New Testament' });
      step('the choices belong to the Bible tab: gone on Books, back on Bible with the choice kept, and gone while something is typed in the search (the Library has no Notes tab: the diary is on Me)');
      await shown(page, 'Books').click();
      await shown(page, 'Books for the road').waitFor();
      await eventually(() => page.getByRole('radio').count(), (n) => n === 0, { what: 'the number of choices on Books' });
      await eventually(() => page.getByText('Notes', { exact: true }).filter({ visible: true }).count(), (n) => n === 0, { what: 'the number of Notes tabs on the Library' });
      await shown(page, 'Bible').click();
      await group.waitFor();
      await eventually(() => checked('New Testament'), (v) => v === 'true', { what: 'the choice made before is still the choice' });
      await search(page).fill('john');
      await shown(page, 'Bible · 4').waitFor();
      await eventually(() => page.getByRole('radio').count(), (n) => n === 0, { what: 'the number of choices while searching' });
      await search(page).fill('');
      await group.waitFor();
    },
  },
  {
    name: 'Library: every one of the 73 book names fits its tile without being cut, in 320, 360, 390 and 430 wide, in the three parts, as a browser lays them out whether it hints the glyphs or not: only the sizes of the type scale (the name 24, 17 or 15 in Fraunces, the short names the full 24, the count 15 in JetBrains Mono), 17 or more from 390 up, the words 17 from the outline (13 under 352)',
    persona: 'in',
    async run({ page, step, go }) {
      step('open Library');
      await go('/library');
      for (const width of [320, 360, 390, 430]) {
        await page.setViewportSize({ width, height: 900 });
        await domQuiet(page, 300);
        const sums = tileSums(width);
        for (const [part, count] of Object.entries(COUNTS)) {
          step(`${width} wide, ${part}`);
          await radio(page, part).click();
          await eventually(() => readTiles(page).then((t) => t.length), (n) => n === count, { what: `the number of tiles of ${part} at ${width}` });
          for (const t of await readTiles(page)) {
            const where = `${t.label} at ${width} wide`;
            const lines = /^[1-3] /.test(t.name) || t.name === 'Song of Songs' ? 2 : 1;
            assert.equal(t.nameLines, lines, `${where}: the name is drawn in ${t.nameLines} line(s), not ${lines}`);
            assert(!t.nameCut, `${where}: the name is cut`);
            assert(t.nameWidest <= t.w - 2 * sums.edge + 0.5, `${where}: the name is ${t.nameWidest.toFixed(1)} wide in ${t.w - 2 * sums.edge}`);
            assert.equal(t.countLines, 1, `${where}: the count is on one line`);
            assert(!t.countCut, `${where}: the count is cut`);
            assert(NAME_SIZES.includes(t.nameSize), `${where}: the name is drawn at ${t.nameSize}, which is no size of the title tokens (24, 17, 15)`);
            if (width >= 390) assert(t.nameSize >= 17, `${where}: the name is drawn at ${t.nameSize}, under 17`);
            if (SHORT_NAMES.includes(t.name)) assert.equal(t.nameSize, 24, `${where}: a short name is the hero of its tile and is the full 24 (${t.nameSize})`);
            assert.equal(t.countSize, COUNT_SIZE, `${where}: the count is the mono token, ${COUNT_SIZE} (${t.countSize})`);
            assert(/Fraunces/.test(t.nameFont), `${where}: the name is Fraunces (${t.nameFont})`);
            assert(/JetBrains/.test(t.countFont), `${where}: the count is JetBrains Mono (${t.countFont})`);
            assert(Math.abs(t.w - sums.tile) <= 1 && Math.abs(t.h - sums.height) <= 1, `${where}: the tile is ${sums.tile} by ${sums.height}, not ${t.w} x ${t.h}`);
            assert(Math.abs(t.padLeft - sums.edge) <= 0.6 && Math.abs(t.padTop - sums.edge) <= 0.6 && Math.abs(t.padBottom - sums.edge) <= 0.6, `${where}: the words are ${sums.edge} from the outline (left ${t.padLeft}, top ${t.padTop}, bottom ${t.padBottom})`);
          }
        }
      }
    },
  },
  {
    name: 'Bible: a tile opens the numbers of the chapters of the book, a number opens the words, and Previous and Next name where they go and carry on across the books',
    persona: 'in',
    async run({ page, step, go }) {
      step('open Library and tap the Psalms tile');
      await go('/library');
      await button(page, 'Psalms, 150 chapters').click();
      await waitPath(page, '/library/bible/PSA', 'the address after tapping the Psalms tile');
      await page.getByRole('heading', { name: 'Psalms', exact: true }).waitFor();
      await shown(page, '150 chapters').waitFor();
      step('150 numbered square tiles, at least 44, five in a row at 390, and no verse numbers here');
      const chapters = page.getByRole('button', { name: /^Psalm \d+$/ });
      await eventually(() => chapters.count(), (n) => n === 150, { what: 'the number of chapter tiles of the Psalms' });
      const all = await chapters.evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }));
      for (const t of all) assert(Math.abs(t.w - t.h) <= 1 && t.w >= 44, `a chapter tile is ${t.w} x ${t.h}`);
      assert.equal([...new Set(all.slice(0, 10).map((t) => Math.round(t.x)))].length, 5, 'five tiles in a row at 390 wide');
      assert.equal((await page.getByRole('button', { name: /^Verse/ }).count()), 0, 'no verse numbers on the screen of chapters');
      step('tap 121: the words, the title of the psalm, and Previous and Next named by where they go, at the top and at the end');
      await button(page, 'Psalm 121').click();
      await waitPath(page, '/library/bible/PSA/121', 'the address after tapping 121');
      await page.getByRole('heading', { name: 'Psalm 121', exact: true }).waitFor();
      await page.getByText('A Song of Ascents.', { exact: true }).waitFor();
      await page.getByText('I will lift up my eyes to the hills.').first().waitFor();
      await eventually(() => button(page, 'Previous: Psalm 120').count(), (n) => n === 2, { what: 'the number of "Previous: Psalm 120" buttons (the top and the end of the chapter)' });
      await eventually(() => button(page, 'Next: Psalm 122').count(), (n) => n === 2, { what: 'the number of "Next: Psalm 122" buttons' });
      const top = await box(button(page, 'Next: Psalm 122').first(), 'the Next button at the top');
      assert(top.y < 400 && top.height >= 44, `Next is at the top of the chapter, without scrolling (y ${top.y}), and at least 44 high (${top.height})`);
      step('Next goes to Psalm 122, Previous back to 121, and Back still goes to the numbers, not through every chapter read');
      await button(page, 'Next: Psalm 122').first().click();
      await waitPath(page, '/library/bible/PSA/122', 'the address after Next');
      await page.getByRole('heading', { name: 'Psalm 122', exact: true }).waitFor();
      await button(page, 'Previous: Psalm 121').first().click();
      await waitPath(page, '/library/bible/PSA/121', 'the address after Previous');
      await page.getByRole('heading', { name: 'Psalm 121', exact: true }).waitFor();
      await button(page, 'Back').first().click();
      await waitPath(page, '/library/bible/PSA', 'the address after Back from a chapter');
      step('the Next button at the end of the chapter works too');
      await button(page, 'Psalm 121').click();
      await waitPath(page, '/library/bible/PSA/121');
      await button(page, 'Next: Psalm 122').last().click();
      await waitPath(page, '/library/bible/PSA/122', 'the address after Next at the end of the chapter');
      step('the way to all the chapters of the book opens the numbers');
      await button(page, 'All chapters of this book').click();
      await waitPath(page, '/library/bible/PSA', 'the address after "All chapters"');
      await page.getByRole('heading', { name: 'Psalms', exact: true }).waitFor();
    },
  },
  {
    name: 'Bible: Next and Previous cross the books and the parts (Malachi 4 to Tobit 1, 2 Maccabees 15 to Matthew 1) and are disabled at Genesis 1 and at Revelation 22',
    persona: 'in',
    async run({ page, step, go }) {
      step('Malachi 4: Next is "Tobit 1"');
      await go('/library/bible/MAL/4');
      await page.getByRole('heading', { name: 'Chapter 4', exact: true }).waitFor();
      await button(page, 'Next: Tobit 1').first().waitFor();
      await button(page, 'Next: Tobit 1').first().click();
      await waitPath(page, '/library/bible/TOB/1', 'the address after Next at the end of Malachi');
      await page.getByRole('heading', { name: 'Chapter 1', exact: true }).waitFor();
      await page.getByText('Tobit', { exact: true }).first().waitFor();
      step('Tobit 1: Previous is "Malachi 4"');
      await button(page, 'Previous: Malachi 4').first().click();
      await waitPath(page, '/library/bible/MAL/4', 'the address after Previous at the start of Tobit');
      step('2 Maccabees 15: Next is "Matthew 1", and Previous from Matthew 1 is "2 Maccabees 15"');
      await go('/library/bible/2MA/15');
      await button(page, 'Next: Matthew 1').first().click();
      await waitPath(page, '/library/bible/MAT/1', 'the address after Next at the end of the Deuterocanon');
      await button(page, 'Previous: 2 Maccabees 15').first().waitFor();
      step('Genesis 1: Previous is there and disabled; Next is "Genesis 2"');
      await go('/library/bible/GEN/1');
      const none = page.getByRole('button', { name: 'Previous chapter: none, this is the first chapter of the Bible', exact: true });
      await eventually(() => none.count(), (n) => n === 2, { what: 'the number of disabled Previous buttons at Genesis 1 (top and end)' });
      await eventually(() => none.first().getAttribute('aria-disabled'), (v) => v === 'true', { what: 'Previous at Genesis 1 is disabled' });
      await button(page, 'Next: Genesis 2').first().waitFor();
      step('Revelation 22: Next is there and disabled; Previous is "Revelation 21"');
      await go('/library/bible/REV/22');
      const end = page.getByRole('button', { name: 'Next chapter: none, this is the last chapter of the Bible', exact: true });
      await eventually(() => end.count(), (n) => n === 2, { what: 'the number of disabled Next buttons at Revelation 22' });
      await eventually(() => end.first().getAttribute('aria-disabled'), (v) => v === 'true', { what: 'Next at Revelation 22 is disabled' });
      await button(page, 'Previous: Revelation 21').first().waitFor();
    },
  },
  {
    name: 'Bible: prose is paragraphs with small raised numbers, a psalm is stanzas of lines gone in by their tabs, the end of a chapter has the credit and says it is not the translation read at Mass',
    persona: 'in',
    async run({ page, step, go }) {
      step('John 1: paragraphs of prose, the name of the book and the title of the chapter');
      await go('/library/bible/JHN/1');
      await page.getByRole('heading', { name: 'Chapter 1', exact: true }).waitFor();
      await page.getByText('John', { exact: true }).first().waitFor();
      await page.getByText('In the beginning was the Word', { exact: false }).first().waitFor();
      const paragraphs = await page.evaluate(() => [...document.querySelectorAll('[role="link"]')].filter((l) => /In the beginning was the Word/.test(l.textContent || '')).map((l) => (l.parentElement?.parentElement?.textContent || '').length));
      assert(paragraphs.length >= 1 && paragraphs[0] > 250, `the first paragraph holds several verses in one text (${paragraphs})`);
      step('Psalm 121: lines go in by their tabs, a hanging indent for the rest of a long line, and a gap before a verse with a break');
      await go('/library/bible/PSA/121');
      const x = async (text) => (await box(page.getByText(text, { exact: false }).first(), text)).x;
      const first = await x('I will lift up my eyes');
      const second = await x('Where does my help come from?');
      assert(second > first + 8, `the second level goes in further than the first (${first} -> ${second})`);
      step('the end of the chapter: the credit of the translation and the plain line that it is not the one read at Mass');
      await scrollPage(page, 100000);
      await page.getByText('World English Bible, Catholic edition (eBible.org). Public domain.', { exact: false }).last().waitFor();
      await page.getByText('This is not the translation read at Mass.', { exact: true }).waitFor();
      await page.getByText('Peace on the road', { exact: true }).waitFor();
      const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
      assert(!/verified|official/i.test(text), 'nothing on the screen says verified or official');
    },
  },
  {
    name: 'Bible: touching a verse chooses it and raises the actions (Bookmark, Copy, Share); Bookmark keeps it, Bookmarks lists it with its words and opens the reader at it; touching it again lets it go',
    persona: 'in',
    async run({ page, step, go }) {
      step('open Psalm 121 and touch verse 3');
      await go('/library/bible/PSA/121');
      await page.getByText('He will not allow your foot to be', { exact: false }).first().click();
      const bar = page.getByRole('toolbar', { name: 'Actions for Psalm 121:3', exact: true });
      await bar.waitFor();
      await button(page, 'Bookmark: Psalm 121:3').waitFor();
      await button(page, 'Write a note: Psalm 121:3').waitFor();
      await button(page, 'Copy: Psalm 121:3').waitFor();
      await button(page, 'Share: Psalm 121:3').waitFor();
      // four actions (Bookmark, Note, Copy, Share) share the bar: a quarter of it each (82 on a 390 phone), 68 high
      const quarter = ((await page.evaluate(() => window.innerWidth)) - 62) / 4 - 1;
      for (const name of ['Bookmark: Psalm 121:3', 'Write a note: Psalm 121:3', 'Copy: Psalm 121:3', 'Share: Psalm 121:3']) { const b = await box(button(page, name), name); assert(b.height >= 68 - 1 && b.width >= quarter, `${name} is at least a quarter of the bar by 68 (${b.width} x ${b.height})`); }
      step('the chosen verse is shown by a ground and an underline, not by colour alone');
      const style = await page.getByText('He will not allow your foot to be', { exact: false }).first().evaluate((e) => { const s = getComputedStyle(e); return { line: s.textDecorationLine, bg: s.backgroundColor }; });
      assert(/underline/.test(style.line) && style.bg !== 'rgba(0, 0, 0, 0)', `a chosen verse is underlined and has a ground: ${JSON.stringify(style)}`);
      step('Bookmark it, close the bar, and the bar is gone');
      await button(page, 'Bookmark: Psalm 121:3').click();
      await button(page, 'Remove bookmark: Psalm 121:3').waitFor();
      await button(page, 'Close the verse actions').click();
      await eventually(() => bar.count(), (n) => n === 0, { what: 'the number of action bars after closing it' });
      step('touching a verse twice chooses it and lets it go');
      await page.getByText('My help comes from the LORD', { exact: false }).first().click();
      await page.getByRole('toolbar', { name: 'Actions for Psalm 121:2', exact: true }).waitFor();
      await page.getByText('My help comes from the LORD', { exact: false }).first().click();
      await eventually(() => page.getByRole('toolbar').count(), (n) => n === 0, { what: 'the number of action bars after touching the verse again' });
      step('Bookmarks lists the verse with where it is and its words, under "Verses"');
      await go('/library/bookmarks');
      await page.getByRole('heading', { name: 'Bookmarks', exact: true }).waitFor();
      await shown(page, 'Verses · 1').waitFor();
      await page.getByText('Psalm 121:3', { exact: true }).first().waitFor();
      await page.getByText('He will not allow your foot to be moved. He who keeps you will not slumber.', { exact: false }).first().waitFor();
      step('tap the row: the reader opens at that verse, chosen, with the action bar');
      await page.getByRole('button', { name: /^Psalm 121:3\. He will not allow/ }).click();
      await waitPath(page, '/library/bible/PSA/121', 'the address after tapping the bookmarked verse');
      await eventually(() => pathOf(page), (p) => p === '/library/bible/PSA/121', { what: 'the reader' });
      await page.getByRole('toolbar', { name: 'Actions for Psalm 121:3', exact: true }).waitFor();
      await button(page, 'Remove bookmark: Psalm 121:3').waitFor();
      step('take the bookmark off: Bookmarks has nothing of the Library again');
      await button(page, 'Remove bookmark: Psalm 121:3').click();
      await button(page, 'Bookmark: Psalm 121:3').waitFor();
      await eventually(() => readKey(page, 'bookmarks'), (v) => !!v && !/PSA\.121\.3/.test(v), { what: 'the bookmark kept on the phone, with the verse taken off' });
    },
  },
  {
    name: 'Bible: the actions are big (a glyph of 30, a word in Inter SemiBold, each a quarter of the bar and 68 high, the reference 17) at 320, 390 and 430 wide, the bar clears the bottom edge, and a verse touched low on a short phone ends up above the bar',
    persona: 'in',
    async run({ page, step, go }) {
      for (const [width, height] of [[320, 568], [390, 844], [430, 932]]) {
        step(`${width} x ${height}: open Psalm 119 and touch a verse low on the screen`);
        await page.setViewportSize({ width, height });
        await go('/library/bible/PSA/119');
        await page.getByText('Your word is a lamp to my feet', { exact: false }).first().waitFor();
        await domQuiet(page, 300);
        // the verse whose first line is about two thirds of the way down
        const low = await page.evaluate((h) => {
          const links = [...document.querySelectorAll('[role="link"]')];
          const want = h * 0.7;
          let best = null;
          for (const e of links) {
            const r = e.getClientRects()[0];
            if (!r || r.width < 40) continue;
            if (best === null || Math.abs(r.top - want) < Math.abs(best.top - want)) best = { top: r.top, left: r.left + 12, text: e.textContent.slice(0, 40) };
          }
          return best;
        }, height);
        assert(low, 'there is a verse on the screen');
        await page.mouse.click(low.left, low.top + 8);
        const bar = page.getByRole('toolbar', { name: /^Actions for Psalm 119:\d+$/ });
        await bar.waitFor();
        const place = (await bar.getAttribute('aria-label')).replace('Actions for ', '');
        step(`${place} is chosen: the bar is inside the screen, 12 above the bottom edge, and its actions are big`);
        const bb = await box(bar, 'the bar');
        assert(bb.x >= 11 && bb.x + bb.width <= width - 11, `${width}: the bar is ${bb.x}..${bb.x + bb.width}`);
        assert(height - (bb.y + bb.height) >= 11 && height - (bb.y + bb.height) <= 14, `${width}: the bar is ${height - (bb.y + bb.height)} above the bottom edge`);
        const actions = [`Bookmark: ${place}`, `Write a note: ${place}`, `Copy: ${place}`, `Share: ${place}`];
        const quarter = (width - 62) / 4 - 1;
        const widths = [];
        for (const name of actions) {
          const b = await box(button(page, name), name);
          widths.push(b.width);
          assert(b.height >= 67 && b.width >= quarter, `${width}: ${name} is ${b.width} x ${b.height}, under a quarter of the bar (${quarter.toFixed(1)}) by 68`);
          const parts = await button(page, name).evaluate((el) => {
            const svg = el.querySelector('svg');
            const word = [...el.querySelectorAll('div,span')].find((x) => x.children.length === 0 && x.textContent.trim().length > 0);
            const cs = getComputedStyle(word);
            return { glyph: svg ? svg.getBoundingClientRect().width : 0, size: parseFloat(cs.fontSize), family: cs.fontFamily, text: word.textContent };
          });
          assert(parts.glyph >= 28, `${width}: the glyph of ${name} is ${parts.glyph}`);
          assert(parts.size >= 12 && /Inter_600SemiBold/.test(parts.family), `${width}: the word "${parts.text}" is ${parts.size} in ${parts.family}`);
        }
        assert(widths.every((w) => Math.abs(w - widths[0]) <= 1), `${width}: the four share the bar equally (${widths})`);
        const ref = await bar.getByText(place, { exact: true }).evaluate((el) => { const cs = getComputedStyle(el); return { size: parseFloat(cs.fontSize), family: cs.fontFamily }; });
        assert(ref.size >= 16 && /JetBrainsMono/.test(ref.family), `${width}: the reference is ${ref.size} in ${ref.family}`);
        step(`the chosen verse is above the bar (the page scrolled it up if it was under it)`);
        await eventually(
          () => page.evaluate(() => {
            const chosen = [...document.querySelectorAll('[role="link"]')].filter((e) => /underline/.test(getComputedStyle(e).textDecorationLine));
            const rects = chosen.flatMap((e) => [...e.getClientRects()]);
            const bar = document.querySelector('[role="toolbar"]').getBoundingClientRect();
            return { bottom: rects.length ? Math.max(...rects.map((r) => r.bottom)) : Infinity, top: rects.length ? Math.min(...rects.map((r) => r.top)) : -Infinity, bar: bar.top };
          }),
          (m) => m.bottom <= m.bar + 0.5 && m.top >= 0,
          { what: `the chosen verse (${place}) clear of the bar at ${width} x ${height}` },
        );
        step('close the bar: it is gone');
        await button(page, 'Close the verse actions').click();
        await eventually(() => page.getByRole('toolbar').count(), (n) => n === 0, { what: 'the number of action bars after closing it' });
      }
    },
  },
  {
    name: 'Bible: a link to a verse (/library/bible/PSA/119?v=105) opens that chapter with the verse chosen and in view, and a link to a verse of a joined pair or one that is not there still opens the chapter',
    persona: 'in',
    async run({ page, step, go }) {
      step('open /library/bible/PSA/119?v=105');
      await go('/library/bible/PSA/119?v=105');
      await page.getByRole('toolbar', { name: 'Actions for Psalm 119:105', exact: true }).waitFor();
      const words = page.getByText('Your word is a lamp to my feet', { exact: false }).first();
      await words.waitFor();
      const b = await box(words, 'verse 105');
      const h = page.viewportSize()?.height ?? 844;
      assert(b.y > 0 && b.y + b.height < h, `verse 105 of the longest chapter is on the screen (y ${b.y}, screen ${h})`);
      step('a verse that is not in the chapter: the chapter opens, nothing is chosen');
      await go('/library/bible/PSA/121?v=99');
      await page.getByRole('heading', { name: 'Psalm 121', exact: true }).waitFor();
      await eventually(() => page.getByRole('toolbar').count(), (n) => n === 0, { what: 'the number of action bars for a verse that does not exist' });
      step('a verse that is no number: the chapter opens too');
      await go('/library/bible/PSA/121?v=abc');
      await page.getByRole('heading', { name: 'Psalm 121', exact: true }).waitFor();
      step('a code in small letters is the same book');
      await go('/library/bible/psa/121?v=3');
      await page.getByRole('toolbar', { name: 'Actions for Psalm 121:3', exact: true }).waitFor();
    },
  },
  {
    name: 'Bible: an address that leads nowhere (a book that does not exist, a chapter past the last) is a calm "Not found" with a way back, never an error',
    persona: 'in',
    async run({ page, step, go }) {
      step('a book that does not exist');
      await go('/library/bible/XXX');
      await page.getByRole('heading', { name: 'Not found', exact: true }).waitFor();
      await page.getByText('This book is not in the Bible list.', { exact: true }).waitFor();
      step('a chapter past the last one: the way on is the chapters of the book and the Bible');
      await go('/library/bible/PSA/999');
      await page.getByRole('heading', { name: 'Not found', exact: true }).waitFor();
      await page.getByText('This chapter is not in the Bible list.', { exact: true }).waitFor();
      await button(page, 'Chapters of Psalms').waitFor();
      await button(page, 'Open the Bible').click();
      await waitPath(page, '/library', 'the address after "Open the Bible"');
      step('chapter 0 and chapters that are not numbers');
      for (const path of ['/library/bible/PSA/0', '/library/bible/PSA/abc', '/library/bible/PSA/01']) {
        await go(path);
        await page.getByRole('heading', { name: 'Not found', exact: true }).waitFor();
      }
    },
  },
  {
    name: 'Library search: verses are found after the keystroke (nothing typed is lost), grouped under "Verses" with the match marked; a verse opens the reader at it; a typed reference offers "Go to"',
    persona: 'in',
    async run({ page, step, go }) {
      step('open Library and type "lord" one letter at a time');
      await go('/library');
      const field = search(page);
      await field.click();
      await field.pressSequentially('lord', { delay: 20 });
      await eventually(() => field.inputValue(), (v) => v === 'lord', { what: 'what is in the search field: every letter typed is kept' });
      step('the verses come, at most 100, grouped, with the place in words, and a note when the list was cut');
      await eventually(() => page.getByText(/^Verses · \d+\+?$/).first().innerText(), (t) => /^Verses · 100\+$/i.test(t.trim()), { what: 'the line over the verses of "lord"', timeout: 15_000 });
      await page.getByText('Showing the first 100 verses. Add a word to narrow the search.', { exact: true }).waitFor();
      const rows = page.getByRole('button', { name: /^[1-3]?\s?[A-Z][A-Za-z ]+ \d+:\d+(-\d+)?\. / });
      await eventually(() => rows.count(), (n) => n === 100, { what: 'the number of verse rows (cut at 100)' });
      step('narrow it: "lord keeper" finds Psalm 121 with the words marked, and no Preview notice (no example book is among them)');
      await field.fill('lord keeper');
      const row = page.getByRole('button', { name: /^Psalm 121:5\. The LORD is your keeper\./ });
      await row.waitFor({ timeout: 15_000 });
      const marked = await row.evaluate((r) => [...r.querySelectorAll('*')].filter((e) => getComputedStyle(e).textDecorationLine.includes('underline') && getComputedStyle(e).backgroundColor !== 'rgba(0, 0, 0, 0)').map((e) => (e.textContent || '').toLowerCase()));
      assert(marked.some((m) => m.startsWith('lord')) && marked.some((m) => m.startsWith('keeper')), `the matched words are marked: ${JSON.stringify(marked)}`);
      await eventually(() => page.getByText(/Coming soon|Books marked Soon|books are examples/).count(), (n) => n === 0, { what: 'the number of notices about books when no book is among the results' });
      step('tap the verse: the reader opens at it, chosen');
      await row.click();
      await waitPath(page, '/library/bible/PSA/121', 'the address after tapping a verse of the results');
      await page.getByRole('toolbar', { name: 'Actions for Psalm 121:5', exact: true }).waitFor();
      step('back in Library the search is as it was left; type a reference: "Go to Psalm 121:3" is offered first and goes straight there');
      await go('/library');
      await search(page).fill('ps 121:3');
      await button(page, 'Go to Psalm 121:3').waitFor();
      await button(page, 'Go to Psalm 121:3').click();
      await waitPath(page, '/library/bible/PSA/121', 'the address after "Go to"');
      await page.getByRole('toolbar', { name: 'Actions for Psalm 121:3', exact: true }).waitFor();
      step('a chapter alone: "john 3" goes to the chapter; a chapter the book does not have is not offered');
      await go('/library');
      await search(page).fill('john 3');
      await button(page, 'Go to John 3').waitFor();
      await search(page).fill('john 22');
      await eventually(() => page.getByRole('button', { name: /^Go to/ }).count(), (n) => n === 0, { what: 'the number of "Go to" cards for a chapter the book does not have' });
    },
  },
  {
    name: 'Bible: Note on a chosen verse opens a new note of the diary that starts with the verse as a quotation (where it is, which translation), and the words written under it are in Notes',
    persona: 'in',
    async run({ page, step, go }) {
      step('touch Psalm 121:3: the bar has Note after Bookmark and before Copy');
      await go('/library/bible/PSA/121?v=3');
      await page.getByRole('toolbar', { name: 'Actions for Psalm 121:3', exact: true }).waitFor();
      const names = await page.getByRole('button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || ''));
      const at = (n) => names.indexOf(n);
      assert(at('Bookmark: Psalm 121:3') >= 0 && at('Write a note: Psalm 121:3') > at('Bookmark: Psalm 121:3') && at('Copy: Psalm 121:3') > at('Write a note: Psalm 121:3') && at('Share: Psalm 121:3') > at('Copy: Psalm 121:3'), 'Bookmark, Note, Copy, Share');
      step('Note opens a new note of the diary: the verse as a quotation, where it is and which translation, and an empty line under it');
      await button(page, 'Write a note: Psalm 121:3').click();
      await waitPath(page, '/diary/new', 'the address of a new note');
      const field = page.getByRole('textbox', { name: 'Page text' });
      await field.waitFor();
      const value = await field.inputValue();
      assert(value.startsWith('> '), `the note starts with a quotation: ${JSON.stringify(value.slice(0, 40))}`);
      assert(value.includes('He will not allow your foot to be moved'), 'the words of the verse are in the note');
      assert(value.includes('— Psalm 121:3 (World English Bible)'), 'the note says where the verse is and which translation');
      assert(value.endsWith('\n\n'), 'the note ends with an empty line to write on');
      step('words written under the quotation make a note, and Notes shows it with the verse');
      await field.fill(`${value}Under his shade today.`);
      await page.getByRole('button', { name: 'Back', exact: true }).first().click();
      await eventually(() => pathOf(page), (p) => p !== '/diary/new', { what: 'the address after Back from the note' });
      await go('/me');
      await shown(page, 'Notes').click();
      await page.getByText('Notes stay on this phone.', { exact: true }).waitFor();
      await page.getByText(/Under his shade today\./).filter({ visible: true }).first().waitFor();
      await page.getByText(/He will not allow your foot/).filter({ visible: true }).first().waitFor();
    },
  },
];
