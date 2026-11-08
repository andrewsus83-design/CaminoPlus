// The scenarios of the Books tab: the twelve covers in two columns, a book page, the reader, the places kept on the phone, a book with no text, links, bookmarks and
// the whole of it with no signal. A person using the app, step by step, in light and in dark, written the way scenarios.mjs writes them (they wait for what a person
// would wait for, never for a fixed time). They are imported by scenarios.mjs.
//
// Which books have a text is not decided here: it is read from mobile/assets/books/index.json, as the app reads it (the texts are checked one at a time, so there are
// 0 to 12). Every scenario works with any of them: with none the tab says plainly that the texts are being checked and the scenarios that need a text say so and stop;
// with all twelve there is no book that says Soon, and the one that needs one stops the same way.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UID } from './fixtures.mjs';
import { eventually, pathOf } from './harness.mjs';

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'mobile', 'assets', 'books');
/** The books that have a text, in the order of the catalog: what mobile/assets/books/index.json says. */
const index = existsSync(join(ASSETS, 'index.json')) ? JSON.parse(readFileSync(join(ASSETS, 'index.json'), 'utf8')) : [];
const readBook = (id) => JSON.parse(readFileSync(join(ASSETS, `${id}.json`), 'utf8'));
const withParts = (book) => book.chapters.some((c, i) => i > 0 && c.part !== book.chapters[i - 1].part);
const partName = (part) => { const m = /\.\s+(?=[A-Z0-9])/.exec(part); return m ? part.slice(0, m.index) : part; };

const A5 = 148 / 210;
const FREE = /, free$/;
const SOON = /, soon$/;
const COVER = /, (free|soon)$/;
const POSITION = /^Chapter \d+ of \d+$/;

const strip = (page, label) => page.getByText(label, { exact: true }).filter({ visible: true }).first();
const box = async (locator, what) => { const b = await locator.boundingBox(); if (!b) throw new Error(`${what} has no box (it is not on the screen)`); return b; };
const near = (a, b, by, what) => assert(Math.abs(a - b) <= by, `${what}: ${a} is not within ${by} of ${b}`);

/** Library, the Books tab, with the covers drawn. */
async function openBooks({ page, go }) {
  await go('/library');
  await strip(page, 'Books').click();
  await page.getByRole('button', { name: COVER }).first().waitFor();
}

/** The scroll view of the reader or of the page: the box that scrolls. */
const scroller = (page) => page.evaluate(() => {
  const el = [...document.querySelectorAll('div')].find((d) => { const o = getComputedStyle(d).overflowY; return (o === 'auto' || o === 'scroll') && d.scrollHeight > d.clientHeight + 100; });
  return el ? { top: Math.round(el.scrollTop), height: el.scrollHeight, client: el.clientHeight } : null;
});
const scrollTo = (page, fraction) => page.evaluate((f) => {
  const el = [...document.querySelectorAll('div')].find((d) => { const o = getComputedStyle(d).overflowY; return (o === 'auto' || o === 'scroll') && d.scrollHeight > d.clientHeight + 100; });
  el.scrollTop = Math.round((el.scrollHeight - el.clientHeight) * f);
}, fraction);
/** The font size of the first long paragraph of the chapter on the screen. */
const paragraphSize = (page) => page.evaluate(() => {
  const p = [...document.querySelectorAll('div[dir]')].find((d) => d.children.length === 0 && (d.textContent || '').length > 200);
  return p ? getComputedStyle(p).fontSize : null;
});
const saved = (page, uid) => page.evaluate((k) => localStorage.getItem(k), `kv:u.${uid}.library.reading`);

/** Opens the first book that has a text from its cover; returns its id (from the address), or null when no book has one. */
async function openFirstBook({ page, step, go }) {
  step('open the Books tab');
  await openBooks({ page, go });
  const free = page.getByRole('button', { name: FREE });
  if ((await free.count()) === 0) return null;
  step('tap the cover of the first book that is free');
  await free.first().click();
  await eventually(() => pathOf(page), (p) => /^\/library\/book\/[a-z0-9-]+$/.test(p), { what: 'the address after tapping a cover' });
  return pathOf(page).split('/').pop();
}

const noData = (text, where) => assert(!/gutenberg|ccel\.org|licen[cs]e flag|check-edition|public-domain-original|Pilgrims on foot|Spanish and contemplative|Reflection and inner peace|Great classics|verified|official/i.test(text), `${where} shows data that is not meant for the screen or a word we do not use: ${text.slice(0, 160)}`);

export const BOOKS_SCENARIOS = [
  {
    name: 'Books: the tab is a compact banner, a notice and twelve A5 covers in two columns, each ONE button with its own ribbon, at 320, 390 and 430 wide',
    persona: 'in',
    async run(ctx) {
      const { page, step } = ctx;
      await openBooks(ctx);
      step('twelve covers, each one button named "title, author, free" or "…, soon", and as many free ones as there are texts in the app');
      await eventually(() => page.getByRole('button', { name: COVER }).count(), (n) => n === 12, { what: 'the number of covers' });
      await eventually(() => page.getByRole('button', { name: FREE }).count(), (n) => n === index.length, { what: `the number of books that say free (the app has ${index.length} texts)` });
      await eventually(() => page.getByRole('button', { name: SOON }).count(), (n) => n === 12 - index.length, { what: 'the number of books that say soon' });
      await page.getByRole('button', { name: 'The Way of a Pilgrim, Anonymous, free' }).or(page.getByRole('button', { name: 'The Way of a Pilgrim, Anonymous, soon' })).waitFor();
      step('a banner with a button when a book can be read, plainly saying the texts are checked when none can, and a notice for what is missing');
      if (index.length === 0) {
        await page.getByText('The texts are being checked.', { exact: true }).waitFor();
        await eventually(() => page.getByRole('button', { name: /^(Start|Continue) reading/ }).count(), (n) => n === 0, { what: 'the number of banner buttons while no book has a text' });
        await page.getByText('Preview', { exact: true }).waitFor();
      } else {
        const banner = page.getByRole('button', { name: /^(Start|Continue) reading\. Books for the road/ });
        await banner.waitFor();
        const b = await box(banner, 'the banner');
        assert(b.height <= 120, `the banner is ${b.height} high (at most 120 on a 390 phone)`);
        near(b.width, 358, 2, 'the banner fills the margins');
        await page.getByText('Books for the road', { exact: true }).waitFor();
      }
      const line = `${index.length} of the 12 books ${index.length === 1 ? 'is' : 'are'} in the app and can be read with no signal. The others say Soon: we are still checking their editions.`;
      if (index.length > 0 && index.length < 12) await page.getByText(line, { exact: true }).waitFor();
      if (index.length === 12) await eventually(() => page.getByText(/ in the app and can be read with no signal\. The others say Soon/).count(), (n) => n === 0, { what: 'the number of notices once every book has a text' });
      step('the covers are A5 (148 by 210), two in a row, 16 from the edge and 12 apart: 173 by 245 on this 390 phone');
      const covers = page.getByRole('button', { name: COVER });
      const boxes = [];
      for (let i = 0; i < 12; i += 1) boxes.push(await box(covers.nth(i), `cover ${i + 1}`));
      for (const b of boxes) { near(b.width / b.height, A5, 0.01, 'width over height'); near(b.width, 173, 1.5, 'the width of a cover at 390'); near(b.height, 245, 2, 'the height of a cover at 390'); }
      const xs = [...new Set(boxes.map((b) => Math.round(b.x)))];
      assert.equal(xs.length, 2, `two columns, not ${xs.length}: ${xs}`);
      near(xs[0], 16, 1, 'the first column starts at the margin');
      near(boxes[1].x - (boxes[0].x + boxes[0].width), 12, 1.5, 'the gap between the columns');
      assert(boxes[2].y >= boxes[0].y + boxes[0].height + 11, 'the second row is under the first');
      step('every cover has a ribbon of 44 by 44 that is the bookmark button of that book, inside the cover');
      const ribbons = page.getByRole('button', { name: /^(Remove bookmark|Bookmark): / });
      await eventually(() => ribbons.count(), (n) => n === 12, { what: 'the number of ribbons on the Books tab' });
      for (let i = 0; i < 12; i += 1) {
        const r = await box(ribbons.nth(i), `ribbon ${i + 1}`);
        near(r.width, 44, 0.5, 'the ribbon button is 44 wide');
        near(r.height, 44, 0.5, 'and 44 high');
        const c = boxes[i];
        assert(r.x >= c.x && r.y >= c.y - 1 && r.x + r.width <= c.x + c.width + 0.5 && r.y + r.height <= c.y + c.height, `ribbon ${i + 1} is inside its cover`);
      }
      step('the four fonts of the brand: Fraunces for the title of a cover, Inter for the author, JetBrains Mono for the era and the mark, and at most one handwritten (Caveat) note on the screen');
      const fonts = await page.evaluate(() => {
        const family = (text) => { const el = [...document.querySelectorAll('div')].find((d) => d.children.length === 0 && d.textContent === text && d.getBoundingClientRect().width > 0); return el ? getComputedStyle(el).fontFamily : null; };
        const caveat = [...document.querySelectorAll('div')].filter((d) => d.children.length === 0 && d.getBoundingClientRect().width > 0 && /Caveat/.test(getComputedStyle(d).fontFamily)).map((d) => d.textContent);
        return { banner: family('Books for the road'), era: family('19th century'), mark: family('SOON') ?? family('FREE'), caveat };
      });
      assert(/Fraunces/.test(fonts.banner ?? ''), `the title of the banner is Fraunces (${fonts.banner})`);
      assert(/JetBrains/.test(fonts.era ?? ''), `the era is JetBrains Mono (${fonts.era})`);
      assert(/JetBrains/.test(fonts.mark ?? ''), `the mark is JetBrains Mono (${fonts.mark})`);
      assert.equal(fonts.caveat.length, index.length > 0 ? 1 : 0, `the handwritten notes on the tab: ${JSON.stringify(fonts.caveat)}`);
      const coverFonts = await page.evaluate(() => {
        const el = [...document.querySelectorAll('div')].find((d) => d.children.length === 0 && /^ANONYMOUS$/.test(d.textContent || '') && d.getBoundingClientRect().width > 0);
        const title = [...document.querySelectorAll('div')].find((d) => d.children.length === 0 && /^The Way of\s*a Pilgrim$/.test((d.textContent || '').replace(/\n/g, ' ')) && d.getBoundingClientRect().width > 0);
        return { author: el ? getComputedStyle(el).fontFamily : null, title: title ? getComputedStyle(title).fontFamily : null };
      });
      assert(/Inter/.test(coverFonts.author ?? ''), `the author on a cover is Inter (${coverFonts.author})`);
      assert(/Fraunces/.test(coverFonts.title ?? ''), `the title on a cover is Fraunces (${coverFonts.title})`);
      step('what is only data for later is nowhere on the tab');
      noData((await page.locator('body').innerText()).replace(/\s+/g, ' '), 'the Books tab');
      step('the same at 320 and at 430: two columns, A5, 138 by 196 and 193 by 274, nothing wider than the screen');
      for (const [width, w, h] of [[320, 138, 196], [430, 193, 274]]) {
        await page.setViewportSize({ width, height: 844 });
        await eventually(async () => Math.round((await box(covers.first(), 'the first cover')).width), (n) => Math.abs(n - w) <= 1, { what: `the width of a cover at ${width}` });
        const first = await box(covers.nth(0), 'cover 1');
        const second = await box(covers.nth(1), 'cover 2');
        const third = await box(covers.nth(2), 'cover 3');
        near(first.height, h, 2, `the height of a cover at ${width}`);
        near(first.y, second.y, 1, 'two covers in a row');
        assert(third.y > first.y + first.height, 'the third is in the next row');
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert(over <= 0, `the page is ${over} wider than a ${width} screen`);
      }
    },
  },
  {
    name: 'Books: a cover opens the book page (the cover, the title, the blurb, "Start reading", the contents under their parts, the credit of the edition) and Back returns to the tab',
    persona: 'in',
    async run(ctx) {
      const { page, step } = ctx;
      const id = await openFirstBook(ctx);
      if (id === null) { step('no book has a text in the app yet: there is no page of a book to read'); return; }
      const book = readBook(id);
      const entry = index.find((e) => e.id === id);
      step('the page: the title as a heading, the author, the facts, the gold button, and the handwritten note');
      await page.getByRole('heading', { name: book.title, exact: true }).first().waitFor();
      await page.getByText(`${entry.chapters} chapters`, { exact: false }).first().waitFor();
      const start = page.getByRole('button', { name: /^Start reading$/ });
      await start.waitFor();
      assert((await box(start, 'the button')).height >= 56, 'the gold button is at least 56 high');
      await page.getByText('A little each day', { exact: true }).waitFor();
      step('the contents: a button for every chapter, the parts as headings, and the credit of the edition');
      const chapters = book.chapters;
      await eventually(() => page.getByRole('button', { name: new RegExp(`^${chapters[0].title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).count(), (n) => n >= 1, { what: 'the first chapter in the contents' });
      const rows = await page.getByRole('button').evaluateAll((els, titles) => els.filter((e) => titles.some((t) => (e.getAttribute('aria-label') || '').startsWith(t))).length, chapters.map((c) => c.title));
      assert(rows >= chapters.length, `${rows} chapters in the contents, ${chapters.length} in the book`);
      if (withParts(book)) {
        const parts = [...new Set(chapters.map((c) => c.part).filter(Boolean))];
        for (const part of parts) await page.getByRole('heading', { name: part, exact: true }).first().waitFor();
      }
      await page.getByText(book.credit.slice(0, 60), { exact: false }).first().waitFor();
      const full = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
      assert(!/Not in the app yet/.test(full), 'a book with a text does not say it is not in the app');
      noData(full.replace(book.credit.replace(/\s+/g, ' '), ''), 'the page of a book');
      step('Back returns to the Library, still on the Books tab');
      await page.getByRole('button', { name: 'Back', exact: true }).first().click();
      await eventually(() => pathOf(page), (p) => p === '/library', { what: 'the address after Back' });
      await page.getByRole('button', { name: COVER }).first().waitFor();
    },
  },
  {
    name: 'Books: the reader opens at the first chapter, Next and Previous go through the chapters and across a part (their labels name where they go), at the first chapter Previous is off and at the last Next is, and Contents goes back to the page',
    persona: 'in',
    async run(ctx) {
      const { page, step, go } = ctx;
      const id = await openFirstBook(ctx);
      if (id === null) { step('no book has a text in the app yet: there is no reader'); return; }
      const book = readBook(id);
      const total = book.chapters.length;
      step('tap "Start reading": the reader at chapter 1, with the title of the book and "Chapter 1 of N" in the header');
      await page.getByRole('button', { name: /^Start reading$/ }).click();
      await eventually(() => pathOf(page), (p) => p === `/library/book/${id}/read`, { what: 'the address of the reader' });
      await eventually(() => new URL(page.url()).search, (s) => s === '?c=c1', { what: 'the chapter in the address' });
      await page.getByText(`Chapter 1 of ${total}`, { exact: true }).waitFor();
      await page.getByText(book.title, { exact: true }).filter({ visible: true }).first().waitFor();
      await page.getByRole('button', { name: 'Contents', exact: true }).waitFor();
      step('at the first chapter Previous is dimmed and disabled (in the header and at the end), and Next is not');
      const previous = page.getByRole('button', { name: /^Previous chapter\. This is the first chapter$/ });
      await eventually(() => previous.count(), (n) => n === 2, { what: 'the number of Previous buttons at the first chapter' });
      for (let i = 0; i < 2; i += 1) assert.equal(await previous.nth(i).getAttribute('aria-disabled'), 'true', 'Previous is disabled at the first chapter');
      assert(total > 1, 'a book with a text has more than one chapter');
      step('Next in the header goes to chapter 2, named by its title, and Previous comes back');
      const second = book.chapters[1];
      const nextName = new RegExp(`^Next: ${(second.part && second.part !== book.chapters[0].part ? `${partName(second.part)}, ` : '')}${second.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
      await page.getByRole('button', { name: nextName }).first().click();
      await eventually(() => new URL(page.url()).search, (s) => s === '?c=c2', { what: 'the chapter after Next' });
      await page.getByText(`Chapter 2 of ${total}`, { exact: true }).waitFor();
      await page.getByRole('button', { name: /^Previous: / }).first().click();
      await eventually(() => new URL(page.url()).search, (s) => s === '?c=c1', { what: 'the chapter after Previous' });
      step('Back from the reader goes where it came from (the page), not through the chapters that were read');
      await page.getByRole('button', { name: nextName }).first().click();
      await eventually(() => new URL(page.url()).search, (s) => s === '?c=c2', { what: 'the chapter again' });
      await page.goBack();
      await eventually(() => pathOf(page), (p) => p === `/library/book/${id}`, { what: 'the address after the browser Back' });
      step('the end of a chapter has Next and Previous too, and one handwritten note');
      await go(`/library/book/${id}/read?c=c2`);
      await scrollTo(page, 1);
      await page.getByRole('button', { name: /^Next: / }).last().waitFor();
      await page.getByText('Rest a little', { exact: true }).waitFor();
      step('across a part: the last chapter of a part and the first of the next, with the part named on the button');
      const at = book.chapters.findIndex((c, i) => i > 0 && c.part !== book.chapters[i - 1].part);
      if (at > 0) {
        await go(`/library/book/${id}/read?c=${book.chapters[at - 1].id}`);
        await page.getByText(`Chapter ${at} of ${total}`, { exact: true }).waitFor();
        await page.getByRole('button', { name: new RegExp(`^Next: ${partName(book.chapters[at].part).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}, `) }).first().click();
        await eventually(() => new URL(page.url()).search, (s) => s === `?c=${book.chapters[at].id}`, { what: 'the chapter across the part' });
        await page.getByText(`Chapter ${at + 1} of ${total}`, { exact: true }).waitFor();
        await page.getByText(partName(book.chapters[at].part), { exact: true }).first().waitFor();
        await page.getByRole('button', { name: new RegExp(`^Previous: ${partName(book.chapters[at - 1].part).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}, `) }).first().waitFor();
      }
      step('the last chapter: Next is disabled, the end of the book is said, and the credit of the edition is printed');
      await go(`/library/book/${id}/read?c=${book.chapters[total - 1].id}`);
      const last = page.getByRole('button', { name: /^Next chapter\. This is the last chapter$/ });
      await eventually(() => last.count(), (n) => n === 2, { what: 'the number of Next buttons at the last chapter' });
      assert.equal(await last.first().getAttribute('aria-disabled'), 'true');
      await scrollTo(page, 1);
      await page.getByRole('heading', { name: 'End of the book', exact: true }).waitFor();
      await page.getByText(book.credit.slice(0, 60), { exact: false }).first().waitFor();
      await page.getByText('Buen Camino!', { exact: true }).waitFor();
      step('Contents goes back to the page of the book');
      await page.getByRole('button', { name: 'Contents', exact: true }).click();
      await eventually(() => pathOf(page), (p) => p === `/library/book/${id}`, { what: 'the address after Contents' });
      await page.getByRole('button', { name: /^(Start reading|Continue: )/ }).first().waitFor();
    },
  },
  {
    name: 'Books: the reader remembers where you stopped (Continue on the page and on the Books tab, the same line), the size of the text (five steps, kept), and a damaged place opens the book at its start',
    persona: 'in',
    async run(ctx) {
      const { page, step, go } = ctx;
      const id = await openFirstBook(ctx);
      if (id === null) { step('no book has a text in the app yet: nothing to remember'); return; }
      const book = readBook(id);
      const longest = book.chapters.map((c, i) => ({ i, w: c.blocks.length })).sort((a, b) => b.w - a.w)[0].i;
      const chapter = book.chapters[longest];
      step(`open chapter ${longest + 1}, the one with the most blocks, and scroll to the middle`);
      await go(`/library/book/${id}/read?c=${chapter.id}`);
      await page.getByText(`Chapter ${longest + 1} of ${book.chapters.length}`, { exact: true }).waitFor();
      await eventually(() => scroller(page), (s) => s && s.height > s.client * 2, { what: 'a chapter longer than two screens' });
      await scrollTo(page, 0.5);
      step('the place is written a moment later, only on the phone, under the person\'s own key');
      await eventually(() => saved(page, UID), (v) => !!v && JSON.parse(v).items.some((p) => p.id === id && p.c === chapter.id && Math.abs(p.y - 0.5) < 0.03), { what: 'the saved place', timeout: 10000 });
      step('the page of the book says "Continue: …" and the Continue reading bar above the tab bar names this book and chapter');
      await go(`/library/book/${id}`);
      const cont = page.getByRole('button', { name: /^Continue: / });
      await cont.first().waitFor();
      assert(!(await page.getByRole('button', { name: /^Start reading$/ }).count()), 'no "Start reading" once something was read');
      await page.getByText('LAST READ', { exact: true }).first().waitFor();
      await openBooks(ctx);
      await page.getByRole('button', { name: `Continue reading, ${book.title}, Chapter ${longest + 1}`, exact: true }).waitFor();
      step('"Continue" opens the same chapter at the same line');
      await page.getByRole('button', { name: /^Continue reading, / }).click();
      await eventually(() => new URL(page.url()).pathname, (p) => p === `/library/book/${id}/read`, { what: 'the address of the reader' });
      await eventually(() => scroller(page), (s) => s && Math.abs(s.top / (s.height - s.client) - 0.5) < 0.03, { what: 'the line where the person stopped', timeout: 10000 });
      step('the text size: Larger makes it bigger, five steps, the buttons stop at the ends, and the size is kept when the reader is opened again');
      const before = parseFloat(await paragraphSize(page));
      assert(before >= 17 && before <= 28, `the size at the first step is ${before}`);
      const larger = page.getByRole('button', { name: 'Larger text', exact: true });
      await larger.click();
      await eventually(async () => parseFloat(await paragraphSize(page)), (s) => s > before, { what: 'the text after Larger' });
      await eventually(() => saved(page, UID), (v) => !!v, { what: 'the reading is still kept' });
      await eventually(() => page.evaluate(() => localStorage.getItem('kv:library.books.size')), (v) => !!v && JSON.parse(v).step === 2, { what: 'the size kept on the phone (the phone itself, not the person)' });
      const lineAfter = await scroller(page);
      assert(Math.abs(lineAfter.top / (lineAfter.height - lineAfter.client) - 0.5) < 0.06, 'the same line stays on the screen when the text changes size');
      for (let i = 0; i < 4; i += 1) await larger.click({ force: true });
      assert.equal(await larger.getAttribute('aria-disabled'), 'true', 'Larger stops at the last step');
      await page.getByText('Text size 5 of 5', { exact: true }).waitFor();
      const biggest = parseFloat(await paragraphSize(page));
      assert(biggest <= 28.5 && biggest > before, `the biggest step is ${biggest}`);
      await go(`/library/book/${id}/read?c=${chapter.id}`);
      await eventually(async () => parseFloat(await paragraphSize(page)), (s) => Math.abs(s - biggest) < 0.5, { what: 'the size kept after opening the reader again' });
      const smaller = page.getByRole('button', { name: 'Smaller text', exact: true });
      for (let i = 0; i < 6; i += 1) await smaller.click({ force: true });
      assert.equal(await smaller.getAttribute('aria-disabled'), 'true', 'Smaller stops at the first step');
      await page.getByText('Text size 1 of 5', { exact: true }).waitFor();
      step('a damaged place: text that is not a place, and a place in a chapter the text does not have, open the book at its start without an error');
      const key = `kv:u.${UID}.library.reading`;
      // The damaged value is put on the phone when the next page starts, before the app runs: the page that is being left may still write its own place on its way out.
      await page.addInitScript((k) => { try { const bad = sessionStorage.getItem('damagedPlace'); if (bad !== null) localStorage.setItem(k, bad); } catch { /* storage blocked */ } }, key);
      for (const bad of ['not json at all', JSON.stringify({ v: 1, last: id, items: [{ id, c: 'c999', y: 0.7, at: 1, read: ['c999'] }] }), JSON.stringify({ v: 9, items: 'x' }), JSON.stringify({ v: 1, items: [{ id, c: 7, y: 'far' }] })]) {
        await page.evaluate((v) => sessionStorage.setItem('damagedPlace', v), bad);
        await go(`/library/book/${id}`);
        await page.getByRole('button', { name: /^Start reading$/ }).waitFor();
        await page.getByRole('button', { name: /^Start reading$/ }).click();
        await page.getByText(`Chapter 1 of ${book.chapters.length}`, { exact: true }).waitFor();
        await eventually(() => new URL(page.url()).search, (s) => s === '?c=c1', { what: 'the start of the book after a damaged place' });
      }
      await page.evaluate((v) => sessionStorage.setItem('damagedPlace', v), JSON.stringify({ v: 1, last: id, items: [{ id, c: 'c999', y: 0.7, at: 1, read: [] }] }));
      await go(`/library/book/${id}/read`);
      await page.getByText(`Chapter 1 of ${book.chapters.length}`, { exact: true }).waitFor();
    },
  },
  {
    name: 'Books: a book with no text says Soon on its cover, "Not in the app yet" and why on its page, has no button and no contents, and a link to its reader shows the page',
    persona: 'in',
    async run(ctx) {
      const { page, step, go } = ctx;
      step('open the Books tab');
      await openBooks(ctx);
      const soon = page.getByRole('button', { name: SOON });
      if ((await soon.count()) === 0) { step('every book has a text in the app: none says Soon'); return; }
      const label = await soon.first().getAttribute('aria-label');
      const title = label.split(', ')[0];
      step(`the cover of "${title}" says Soon; tap it`);
      await soon.first().click();
      await eventually(() => pathOf(page), (p) => /^\/library\/book\/[a-z0-9-]+$/.test(p), { what: 'the address after tapping a cover' });
      const id = pathOf(page).split('/').pop();
      await page.getByRole('heading', { name: title, exact: true }).first().waitFor();
      await page.getByText('SOON', { exact: true }).filter({ visible: true }).first().waitFor();
      await page.getByRole('heading', { name: 'Not in the app yet', exact: true }).waitFor();
      await page.getByText('We are checking the edition of this book before we add it.', { exact: true }).waitFor();
      step('no button to read, no contents, no handwritten note');
      await eventually(() => page.getByRole('button', { name: /^(Start reading|Continue)/ }).count(), (n) => n === 0, { what: 'the number of reading buttons' });
      await eventually(() => page.getByRole('heading', { name: 'Contents', exact: true }).count(), (n) => n === 0, { what: 'the number of contents' });
      await eventually(() => page.getByText('A little each day', { exact: true }).count(), (n) => n === 0, { what: 'the number of notes' });
      noData((await page.locator('body').innerText()).replace(/\s+/g, ' '), 'the page of a book without a text');
      step('its ribbon still bookmarks it');
      await page.getByRole('button', { name: `Bookmark: ${title}`, exact: true }).click();
      await page.getByRole('button', { name: `Remove bookmark: ${title}`, exact: true }).waitFor();
      step('a link to its reader shows the same page, never a blank or an error');
      await go(`/library/book/${id}/read`);
      await page.getByRole('heading', { name: 'Not in the app yet', exact: true }).waitFor();
      await go(`/library/book/${id}/read?c=c1`);
      await page.getByRole('heading', { name: 'Not in the app yet', exact: true }).waitFor();
    },
  },
  {
    name: 'Books: links go where they say (?c= goes on to the reader), a chapter that is not in the book and a book that is not one of the twelve are calm sentences with a way on, never a crash',
    persona: 'in',
    async run(ctx) {
      const { page, step, go } = ctx;
      if (index.length > 0) {
        const id = index[0].id;
        const book = readBook(id);
        step('/library/book/<id>?c=c2 goes on to the reader at chapter 2');
        await go(`/library/book/${id}?c=c2`);
        await eventually(() => pathOf(page), (p) => p === `/library/book/${id}/read`, { what: 'the address after the link' });
        await eventually(() => new URL(page.url()).search, (s) => s === '?c=c2', { what: 'the chapter of the link' });
        await page.getByText(`Chapter 2 of ${book.chapters.length}`, { exact: true }).waitFor();
        step('a chapter that is not in the book: the page of the book, with one sentence that says so');
        await go(`/library/book/${id}/read?c=zzz`);
        await page.getByText('This book has no such chapter, so here is its table of contents.', { exact: true }).waitFor();
        await page.getByRole('heading', { name: book.title, exact: true }).first().waitFor();
        await go(`/library/book/${id}?c=zzz`);
        await page.getByText('This book has no such chapter, so here is its table of contents.', { exact: true }).waitFor();
      }
      step('a book that is not one of the twelve: a calm sentence and the way to the Library');
      await go('/library/book/not-a-book');
      await page.getByRole('heading', { name: 'That book is not in the Library', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Open the Library', exact: true }).click();
      await eventually(() => pathOf(page), (p) => p === '/library', { what: 'the address after "Open the Library"' });
      await go('/library/book/not-a-book/read?c=c1');
      await page.getByRole('heading', { name: 'That book is not in the Library', exact: true }).waitFor();
    },
  },
  {
    name: 'Books: the ribbon of a cover bookmarks the book, Bookmarks lists it as a row that opens its page, and a search lists it and opens its page too',
    persona: 'in',
    async run(ctx) {
      const { page, step, go } = ctx;
      step('open the Books tab and bookmark Confessions with its ribbon (the key is the one the rows always had)');
      await openBooks(ctx);
      await page.getByRole('button', { name: 'Bookmark: Confessions', exact: true }).click();
      await page.getByRole('button', { name: 'Remove bookmark: Confessions', exact: true }).waitFor();
      await eventually(() => page.evaluate((k) => localStorage.getItem(k), `kv:u.${UID}.library.bookmarks`), (v) => !!v && JSON.parse(v).items.some((b) => b.key === 'books:confessions'), { what: 'the bookmark kept under books:confessions' });
      step('Bookmarks lists the book as a row that says free or soon, and the row opens the page of the book');
      await page.getByRole('button', { name: 'Bookmarks', exact: true }).click();
      await eventually(() => pathOf(page), (p) => p === '/library/bookmarks', { what: 'the address of Bookmarks' });
      const row = page.getByRole('button', { name: /^Confessions, Augustine of Hippo, (free|soon)$/ }).first();
      await row.waitFor();
      const spoken = await row.getAttribute('aria-label');
      assert.equal(spoken, `Confessions, Augustine of Hippo, ${index.some((e) => e.id === 'confessions') ? 'free' : 'soon'}`);
      await row.click();
      await eventually(() => pathOf(page), (p) => p === '/library/book/confessions', { what: 'the address of the book from Bookmarks' });
      step('a search for the author lists the book as a row that opens the page, too');
      await go('/library');
      await page.getByRole('textbox', { name: 'Search the library' }).fill('augustine');
      await page.getByText(/^1 result for “augustine”$/).waitFor();
      await page.getByRole('button', { name: /^Confessions, Augustine of Hippo, (free|soon)$/ }).click();
      await eventually(() => pathOf(page), (p) => p === '/library/book/confessions', { what: 'the address of the book from a search' });
      step('only a book that says Soon brings the Soon notice with it');
      await go('/library');
      await page.getByRole('textbox', { name: 'Search the library' }).fill('confessions');
      await page.getByText(/^1 result for “confessions”$/).waitFor();
      const has = index.some((e) => e.id === 'confessions');
      if (has) await eventually(() => page.getByText('Coming soon', { exact: true }).count(), (n) => n === 0, { what: 'the number of Soon notices for a book with a text' });
      else await page.getByText('Coming soon', { exact: true }).first().waitFor();
    },
  },
  {
    name: 'Books with no signal: the Books tab, a book page and the reader work offline, and the place is kept',
    persona: 'in',
    offline: true,
    schemes: ['light'],
    async run(ctx) {
      const { page, step, go } = ctx;
      step('open the Books tab with no signal: the covers are drawn from what is in the app');
      await openBooks(ctx);
      await eventually(() => page.getByRole('button', { name: COVER }).count(), (n) => n === 12, { what: 'the number of covers with no signal' });
      const free = page.getByRole('button', { name: FREE });
      if ((await free.count()) === 0) { step('no book has a text yet: the tab says so plainly'); await page.getByText('The texts are being checked.', { exact: true }).waitFor(); return; }
      step('a book opens, and so does its reader, and the place is kept');
      await free.first().click();
      await eventually(() => pathOf(page), (p) => /^\/library\/book\/[a-z0-9-]+$/.test(p), { what: 'the address of the book page' });
      const id = pathOf(page).split('/').pop();
      const book = readBook(id);
      await page.getByRole('button', { name: /^Start reading$/ }).click();
      await page.getByText(`Chapter 1 of ${book.chapters.length}`, { exact: true }).waitFor();
      await eventually(() => scroller(page), (s) => !!s, { what: 'the words of the chapter' });
      await page.getByRole('button', { name: /^Next: / }).first().click();
      await page.getByText(`Chapter 2 of ${book.chapters.length}`, { exact: true }).waitFor();
      await eventually(() => saved(page, UID), (v) => !!v && JSON.parse(v).items.some((p) => p.id === id && p.c === 'c2'), { what: 'the place kept with no signal', timeout: 10000 });
      await go(`/library/book/${id}`);
      await page.getByRole('button', { name: /^Continue: / }).first().waitFor();
    },
  },
];
