// The scenarios of the "Continue reading" bar: the one bar that floats above the tab bar of the Library (Bible and Books), takes the place of the two cards that sat in the pages,
// and has a close button. A person using the app, step by step, in light and in dark, written the way scenarios.mjs writes them (they wait for what a person would wait for,
// never for a fixed time; a thing that must NOT be there is waited out with domQuiet). They are imported by scenarios.mjs.
//
// They read the real texts: the place of a book is the one a reader of mobile/assets/books keeps (which books have a text is read from index.json, 0 to 12: with none, the
// walks that need a book say so and stop), and the Bible is Psalm 121, John 3 and Genesis 3.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UID } from './fixtures.mjs';
import { domQuiet, eventually, pathOf } from './harness.mjs';

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'mobile', 'assets', 'books');
const index = existsSync(join(ASSETS, 'index.json')) ? JSON.parse(readFileSync(join(ASSETS, 'index.json'), 'utf8')) : [];
const readBook = (id) => JSON.parse(readFileSync(join(ASSETS, `${id}.json`), 'utf8'));

const waitPath = (page, want, what = 'the address') => eventually(() => pathOf(page), (p) => p === want, { what: `${what} (wanted ${want})` });
const keyOf = (name) => `kv:u.${UID}.library.${name}`;
const setKey = (page, name, value) => page.evaluate(([k, v]) => localStorage.setItem(k, typeof v === 'string' && v.startsWith('RAW:') ? v.slice(4) : JSON.stringify(v)), [keyOf(name), value]);
const readKey = (page, name) => page.evaluate((k) => localStorage.getItem(k), keyOf(name));
const box = async (locator, what) => { const b = await locator.boundingBox(); if (!b) throw new Error(`${what} has no box (it is not on the screen)`); return b; };
const near = (a, b, by, what) => assert(Math.abs(a - b) <= by, `${what}: ${a} is not within ${by} of ${b}`);
const search = (page) => page.getByRole('textbox', { name: 'Search the library' });
const strip = (page, label) => page.getByText(label, { exact: true }).filter({ visible: true }).first(); // Library stays mounted under the screens pushed over it

/** The bar by what a screen reader says, any bar, and its close button. */
const bar = (page, name) => page.getByRole('button', { name, exact: true });
const anyBar = (page) => page.getByRole('button', { name: /^Continue reading, / });
const closeButton = (page) => page.getByRole('button', { name: 'Hide Continue reading', exact: true });
/** The round bar itself (the parent of its button), and the pill of the tab bar. */
const barBox = (page, name) => box(bar(page, name).locator('xpath=..'), 'the bar');
const tabBarBox = (page) => box(page.getByRole('tab').first().locator('xpath=..'), 'the tab bar');

/** Scrolls the one scroll view of the screen (the first element that has more to scroll than it shows) and says how far it went. */
const scrollPage = (page, y) => page.evaluate((to) => {
  const el = [...document.querySelectorAll('div')].find((d) => d.scrollHeight > d.clientHeight + 50 && /(auto|scroll)/.test(getComputedStyle(d).overflowY));
  if (!el) return -1;
  el.scrollTop = to;
  return el.scrollTop;
}, y);

/** Library, with the Bible tab drawn. */
async function openLibrary({ page, go }) {
  await go('/library');
  await page.getByRole('radiogroup', { name: 'Part of the Bible' }).waitFor();
}

/** Nothing must show: wait until the page has been still for a moment, then count. */
async function noBar(page, what) {
  await domQuiet(page, 400);
  await eventually(() => anyBar(page).count(), (n) => n === 0, { what });
}

/** The book with the longest title among those that have a text, and its longest chapter (so the reader opens on a chapter that is longer than a screen). */
function longBook() {
  const books = index.map(({ id }) => readBook(id));
  const book = books.sort((a, b) => b.title.length - a.title.length)[0];
  const at = book.chapters.map((c, i) => ({ i, w: c.blocks.length })).sort((a, b) => b.w - a.w)[0].i;
  return { id: book.id, title: book.title, count: book.chapters.length, chapter: book.chapters[at], position: at + 1 };
}

export const CONTINUE_SCENARIOS = [
  {
    name: 'Library: the bar "Continue reading" floats above the tab bar only when something was read, is 8 above it and never over a row, opens that place, can be closed, stays closed after a restart, and comes back when another place is read',
    persona: 'in',
    async run(ctx) {
      const { page, step, go } = ctx;
      step('nothing read: no bar, and no card in the page');
      await openLibrary(ctx);
      await noBar(page, 'the number of Continue reading bars before anything was read');
      await eventually(() => page.getByText('Continue reading', { exact: true }).count(), (n) => n === 0, { what: 'the number of "Continue reading" texts before anything was read' });

      step('read Psalm 121 (the place is kept on the phone, under a key of this person)');
      await go('/library/bible/PSA/121');
      await page.getByRole('heading', { name: 'Psalm 121', exact: true }).waitFor();
      await eventually(() => readKey(page, 'lastRead'), (v) => !!v && JSON.parse(v).code === 'PSA' && JSON.parse(v).chapter === 121, { what: 'the chapter kept on the phone' });

      step('back in the Library the bar is there, ONE button named "Continue reading, Psalm 121", and nothing of it is in the page above');
      await openLibrary(ctx);
      const name = 'Continue reading, Psalm 121';
      await bar(page, name).waitFor();
      await eventually(() => anyBar(page).count(), (n) => n === 1, { what: 'the number of bars: one' });
      await page.getByText('Psalm 121', { exact: true }).filter({ visible: true }).first().waitFor();
      step('it floats 8 above the tab bar, with the tab bar\'s side margins, 64 high, and the X is a button of its own, at least 44 by 44, after it');
      const b = await barBox(page, name);
      const tabs = await tabBarBox(page);
      near(tabs.y - (b.y + b.height), 8, 1.2, 'the space between the bar and the tab bar');
      near(b.height, 64, 1.5, 'the height of the bar');
      near(b.x, tabs.x, 1, 'the left edge of the bar and of the tab bar');
      near(b.width, tabs.width, 1.5, 'the width of the bar and of the tab bar');
      const x = await box(closeButton(page), 'the close button');
      assert(x.width >= 44 && x.height >= 44, `the close button is ${x.width} by ${x.height}`);
      assert(x.x >= b.x && x.x + x.width <= b.x + b.width + 0.5 && x.y >= b.y - 0.5 && x.y + x.height <= b.y + b.height + 0.5, 'the close button is inside the bar');
      const order = await page.evaluate(() => {
        const open = [...document.querySelectorAll('[role="button"]')].find((e) => /^Continue reading, /.test(e.getAttribute('aria-label') || ''));
        const close = document.querySelector('[aria-label="Hide Continue reading"]');
        return { follows: !!(open.compareDocumentPosition(close) & Node.DOCUMENT_POSITION_FOLLOWING), siblings: open.parentElement === close.parentElement };
      });
      assert(order.follows && order.siblings, `the bar comes first and the X second, side by side: ${JSON.stringify(order)}`);

      step('it covers nothing: scrolled to the end, the last tile of the Bible ends above the bar');
      const went = await scrollPage(page, 100000);
      assert(went > 100, `the page scrolled (${went})`);
      const last = await box(page.getByRole('button', { name: 'Malachi, 4 chapters', exact: true }), 'the last tile');
      assert(last.y + last.height <= b.y - 16 + 1, `the last tile ends at ${last.y + last.height}, the bar starts at ${b.y}`);
      await scrollPage(page, 0);

      step('it is a hero card: Fraunces for the place, Inter over it, no handwriting, and every colour readable on it (4.5 : 1 for the words, 3 : 1 for the glyphs)');
      const look = await page.evaluate(() => {
        const open = [...document.querySelectorAll('[role="button"]')].find((e) => /^Continue reading, /.test(e.getAttribute('aria-label') || ''));
        const pill = open.parentElement;
        const rgb = (c) => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
        const lum = (c) => { const [r, g, bl] = rgb(c).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
        const ratio = (a, c) => { const [hi, lo] = [lum(a), lum(c)].sort((m, n) => n - m); return (hi + 0.05) / (lo + 0.05); };
        const bg = getComputedStyle(pill).backgroundColor;
        const leaf = (text) => [...pill.querySelectorAll('div')].find((d) => d.children.length === 0 && d.textContent === text);
        const label = leaf('Continue reading');
        const place = leaf('Psalm 121');
        const stroke = (el) => getComputedStyle(el.querySelector('path') || el).stroke;
        const glyph = open.querySelector('svg');
        const x = document.querySelector('[aria-label="Hide Continue reading"] svg');
        return {
          bg, labelFont: getComputedStyle(label).fontFamily, placeFont: getComputedStyle(place).fontFamily,
          labelRatio: ratio(getComputedStyle(label).color, bg), placeRatio: ratio(getComputedStyle(place).color, bg), glyphRatio: ratio(stroke(glyph), bg), closeRatio: ratio(stroke(x), bg),
          caveat: [...pill.querySelectorAll('div')].filter((d) => /Caveat/.test(getComputedStyle(d).fontFamily)).length,
        };
      });
      assert(/Inter/.test(look.labelFont), `the first line is Inter (${look.labelFont})`);
      assert(/Fraunces/.test(look.placeFont), `the place is Fraunces (${look.placeFont})`);
      assert.equal(look.caveat, 0, 'no handwriting on the bar');
      assert(look.labelRatio >= 4.5 && look.placeRatio >= 4.5, `the words on the bar: ${look.labelRatio.toFixed(2)} and ${look.placeRatio.toFixed(2)} : 1 on ${look.bg}`);
      assert(look.glyphRatio >= 3 && look.closeRatio >= 3, `the glyphs on the bar: ${look.glyphRatio.toFixed(2)} and ${look.closeRatio.toFixed(2)} : 1`);

      step('the bar is on the Books tab too, and not on the other tabs');
      await strip(page, 'Books').click();
      await bar(page, name).waitFor();
      await page.getByRole('tab', { name: 'Me', exact: true }).click();
      await waitPath(page, '/me');
      await noBar(page, 'the number of bars on Me');
      await page.getByRole('tab', { name: 'Library', exact: true }).click();
      await waitPath(page, '/library');
      await bar(page, name).waitFor();
      await strip(page, 'Bible').click();

      step('while the search field has the focus the bar steps aside (it would float over the keyboard); when the field is left it is back, over the results');
      await search(page).click();
      await eventually(() => anyBar(page).count(), (n) => n === 0, { what: 'the number of bars while the search field has the focus' });
      await search(page).pressSequentially('lord', { delay: 20 });
      await eventually(() => anyBar(page).count(), (n) => n === 0, { what: 'the number of bars while typing' });
      await search(page).blur();
      await bar(page, name).waitFor();
      await page.getByRole('button', { name: 'Clear search', exact: true }).first().click();
      await page.getByRole('radiogroup', { name: 'Part of the Bible' }).waitFor();
      await eventually(() => anyBar(page).count(), (n) => n === 0, { what: 'the number of bars: Clear search gives the field the focus again, so the bar stays aside' });
      await search(page).blur();
      await bar(page, name).waitFor();

      step('tap the bar: the reader opens at Psalm 121, and there is no tab bar and no bar on it');
      await bar(page, name).click();
      await waitPath(page, '/library/bible/PSA/121', 'the address after tapping the bar');
      await page.getByRole('heading', { name: 'Psalm 121', exact: true }).waitFor();
      await eventually(() => page.getByRole('tab').count(), (n) => n === 0, { what: 'the number of tabs on the reader' });
      await eventually(() => anyBar(page).count(), (n) => n === 0, { what: 'the number of bars on the reader' });
      await page.getByRole('button', { name: 'Back', exact: true }).first().click();
      await bar(page, name).waitFor();

      step('close it: it goes, and what was closed (this chapter) is kept on the phone');
      await closeButton(page).click();
      await eventually(() => anyBar(page).count(), (n) => n === 0, { what: 'the number of bars after closing' });
      await eventually(() => readKey(page, 'continueHidden'), (v) => { const m = v && JSON.parse(v); return !!m && m.kind === 'bible' && m.code === 'PSA' && m.chapter === 121; }, { what: 'the mark kept on the phone' });
      assert(await readKey(page, 'lastRead'), 'closing the bar does not delete the place');

      step('the app is started again: it stays closed');
      await openLibrary(ctx);
      await noBar(page, 'the number of bars after a restart');

      step('read another chapter: the bar comes back, with it');
      await go('/library/bible/JHN/3');
      await page.getByRole('heading', { name: 'Chapter 3', exact: true }).waitFor();
      await eventually(() => readKey(page, 'lastRead'), (v) => !!v && JSON.parse(v).code === 'JHN', { what: 'the new chapter kept on the phone' });
      await openLibrary(ctx);
      await bar(page, 'Continue reading, John 3').waitFor();
      await eventually(() => bar(page, name).count(), (n) => n === 0, { what: 'the number of bars for the older chapter' });
    },
  },
  {
    name: 'Library: the bar "Continue reading" continues the most recent place of the Bible and the books: a book read later is named with its chapter, a chapter read later takes over, and a long title is cut on one line and the X stays in the bar at 320 wide',
    persona: 'in',
    async run(ctx) {
      const { page, step, go } = ctx;
      if (index.length === 0) { step('no book has a text in the app yet: nothing to name'); return; }
      const book = longBook();
      const bookBar = `Continue reading, ${book.title}, Chapter ${book.position}`;
      step('read a chapter of the Bible, then a book: the book is the most recent place, and the bar says its title and the chapter');
      await go('/library/bible/PSA/121');
      await page.getByRole('heading', { name: 'Psalm 121', exact: true }).waitFor();
      await eventually(() => readKey(page, 'lastRead'), (v) => !!v && JSON.parse(v).code === 'PSA', { what: 'the chapter of the Bible kept on the phone' });
      await go(`/library/book/${book.id}/read?c=${book.chapter.id}`);
      await page.getByText(`Chapter ${book.position} of ${book.count}`, { exact: true }).waitFor();
      await eventually(() => readKey(page, 'reading'), (v) => !!v && JSON.parse(v).items.some((p) => p.id === book.id && p.c === book.chapter.id), { what: 'the place kept for the book', timeout: 10000 });
      await openLibrary(ctx);
      await bar(page, bookBar).waitFor();
      await eventually(() => anyBar(page).count(), (n) => n === 1, { what: 'the number of bars: one, not one for the Bible and one for the book' });
      await bar(page, bookBar).locator('xpath=..').getByText(`${book.title} · Chapter ${book.position}`, { exact: true }).waitFor();

      step('the banner of the Books tab no longer says "Continue reading": the bar does, and it is the same bar on this tab');
      await strip(page, 'Books').click();
      await bar(page, bookBar).waitFor();
      await eventually(() => page.getByRole('button', { name: /^Continue reading\. / }).count(), (n) => n === 0, { what: 'the number of banner buttons that say Continue reading' });
      await page.getByRole('button', { name: /^Start reading\. Books for the road/ }).waitFor();

      step('a long title is cut on one line with the X still inside the bar, at 320 wide, and nothing is wider than the screen');
      await page.setViewportSize({ width: 320, height: 640 });
      await domQuiet(page, 300);
      const b = await barBox(page, bookBar);
      const x = await box(closeButton(page), 'the close button');
      assert(b.x >= 15 && b.x + b.width <= 320 - 15, `the bar is inside the margins at 320 (${b.x}, ${b.width})`);
      assert(x.x + x.width <= b.x + b.width + 0.5 && x.width >= 44, `the X is inside the bar (${x.x + x.width} of ${b.x + b.width}) and ${x.width} wide`);
      const line = await bar(page, bookBar).locator('xpath=..').getByText(`${book.title} · Chapter ${book.position}`, { exact: true }).evaluate((el) => ({ height: el.getBoundingClientRect().height, lineHeight: parseFloat(getComputedStyle(el).lineHeight) }));
      assert(line.height <= line.lineHeight + 1, `the place is one line (${line.height} high, a line is ${line.lineHeight})`);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert(over <= 0, `the page is ${over} wider than a 320 screen`);
      await page.setViewportSize({ width: 390, height: 844 });
      await domQuiet(page, 300);

      step('tap the bar: the reader of the book opens where the person stopped');
      await bar(page, bookBar).click();
      await eventually(() => pathOf(page), (p) => p === `/library/book/${book.id}/read`, { what: 'the address of the reader of the book' });
      await page.getByText(`Chapter ${book.position} of ${book.count}`, { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Back', exact: true }).first().click().catch(() => {});

      step('read a chapter of the Bible later: it takes over, and closing it does not bring the older place of the book back');
      await go('/library/bible/GEN/3');
      await page.getByRole('heading', { name: 'Chapter 3', exact: true }).waitFor();
      await eventually(() => readKey(page, 'lastRead'), (v) => !!v && JSON.parse(v).code === 'GEN', { what: 'the new chapter kept on the phone' });
      await openLibrary(ctx);
      await bar(page, 'Continue reading, Genesis 3').waitFor();
      await closeButton(page).click();
      await noBar(page, 'the number of bars after closing Genesis 3');
      await openLibrary(ctx);
      await noBar(page, 'the number of bars after a restart');
    },
  },
  {
    name: 'Library: a closed bar is told apart by the place and its time: a newer time brings it back, a value that does not read hides nothing, and a place that no longer exists gives no bar',
    persona: 'in',
    async run(ctx) {
      const { page, step } = ctx;
      const psalm = { v: 1, code: 'PSA', chapter: 121, at: 5000 };
      const closed = (at, extra = {}) => ({ v: 1, kind: 'bible', code: 'PSA', chapter: 121, at, ...extra });
      const gone = async (what) => { await openLibrary(ctx); await noBar(page, what); };
      const shownNow = async (what) => { await openLibrary(ctx); await bar(page, 'Continue reading, Psalm 121').waitFor(); await eventually(() => anyBar(page).count(), (n) => n === 1, { what }); };
      await openLibrary(ctx);
      step('a place with a mark for the very same place and time stays closed');
      await setKey(page, 'lastRead', psalm);
      await setKey(page, 'continueHidden', closed(5000));
      await gone('the number of bars for a closed place');
      step('the same chapter saved again later (a newer time) brings it back');
      await setKey(page, 'lastRead', { ...psalm, at: 5001 });
      await shownNow('the number of bars for a newer time');
      step('another chapter than the closed one brings it back');
      await setKey(page, 'lastRead', { v: 1, code: 'PSA', chapter: 122, at: 5000 });
      await openLibrary(ctx);
      await bar(page, 'Continue reading, Psalm 122').waitFor();
      step('a stored mark that does not read hides nothing: text that is not JSON, another version, a chapter that is a word, a time that is not a time');
      await setKey(page, 'lastRead', psalm);
      for (const bad of ['RAW:not json at all', { v: 2, kind: 'bible', code: 'PSA', chapter: 121, at: 5000 }, closed(5000, { chapter: '121' }), closed(-1), closed('now'), { v: 1, kind: 'other' }, 'RAW:null', 'RAW:[]']) {
        await setKey(page, 'continueHidden', bad);
        await shownNow(`the number of bars for the stored mark ${JSON.stringify(bad)}`);
      }
      step('a place that no longer exists gives no bar and no error: a book that is gone, a chapter past the last, another version, a damaged value');
      await setKey(page, 'continueHidden', 'RAW:null');
      for (const bad of [{ v: 1, code: 'ZZZ', chapter: 1, at: 1 }, { v: 1, code: 'PSA', chapter: 151, at: 1 }, { v: 2, code: 'PSA', chapter: 1 }, 'x', { v: 1, code: 'bible-additions-to-esther', chapter: 1 }]) {
        await setKey(page, 'lastRead', bad);
        await gone(`the number of bars for ${JSON.stringify(bad)}`);
      }
      step('a place from before the time was kept still loads: the bar is there');
      await setKey(page, 'lastRead', { v: 1, code: 'PSA', chapter: 121 });
      await shownNow('the number of bars for a place with no time');
    },
  },
];
