// The scenarios of the Books tab: the covers in two columns on a shelf for each kind of book, a book page with the notice of its kind, the reader, the places kept on the
// phone, links, bookmarks and the whole of it with no signal. A person using the app, step by step, in light and in dark, written the way scenarios.mjs writes them (they
// wait for what a person would wait for, never for a fixed time). They are imported by scenarios.mjs.
//
// Which books there are is not decided here: it is read from mobile/assets/library/catalog.json, the bundle that tools/build_books.py makes from books/, as the app reads
// it. Every scenario works with whatever that holds (26 books today, more when a batch is added): it picks the first guide and the first book of readings, and counts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UID } from './fixtures.mjs';
import { eventually, pathOf } from './harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LIB = join(ROOT, 'mobile', 'assets', 'library');
/** The books in the order of the shelves: what catalog.json says. */
export const CATALOG = JSON.parse(readFileSync(join(LIB, 'catalog.json'), 'utf8')).books.sort((a, b) => a.order - b.order);
const readBook = (id) => JSON.parse(readFileSync(join(LIB, 'books', `${id}.json`), 'utf8'));
const notices = readFileSync(join(ROOT, 'mobile', 'src', 'features', 'library', 'books', 'notices.ts'), 'utf8');
/** The notice of a kind, as notices.ts says it (the one place that has the wording). */
const NOTICE = { guide: /GUIDE_NOTICE = '([^']+)'/.exec(notices)[1], reflection: /READINGS_NOTICE = '([^']+)'/.exec(notices)[1] };
const guide = CATALOG.find((b) => b.kind === 'guide');
const readings = CATALOG.find((b) => b.kind === 'reflection');

const A5 = 148 / 210;
/** What a screen reader says for a cover: "The French Way, Pilgrim's guide, 51 minutes". */
export const COVER_LABEL = /, (Pilgrim's guide|Readings for the Way), (\d+ hours?( \d+ minutes?)?|\d+ minutes?)$/;
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const coverOf = (page, book) => page.getByRole('button', { name: new RegExp(`^${esc(book.title)}, (Pilgrim's guide|Readings for the Way), `) });

const strip = (page, label) => page.getByText(label, { exact: true }).filter({ visible: true }).first();
const box = async (locator, what) => { const b = await locator.boundingBox(); if (!b) throw new Error(`${what} has no box (it is not on the screen)`); return b; };
const near = (a, b, by, what) => assert(Math.abs(a - b) <= by, `${what}: ${a} is not within ${by} of ${b}`);

/** Library, the Books tab, with the covers drawn. */
async function openBooks({ page, go }) {
  await go('/library');
  await strip(page, 'Books').click();
  await page.getByRole('button', { name: COVER_LABEL }).first().waitFor();
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
  // a paragraph holds only inline elements (the words of a passage are a link inside it, bold and italic are spans), never a box
  const p = [...document.querySelectorAll('div[dir]')].find((d) => [...d.children].every((x) => x.tagName !== 'DIV') && (d.textContent || '').length > 200);
  return p ? getComputedStyle(p).fontSize : null;
});
const saved = (page, uid) => page.evaluate((k) => localStorage.getItem(k), `kv:u.${uid}.library.reading`);

const noData = (text, where) => assert(!/gutenberg|ai_disclosure|route_slug|\bSOON\b|\bFREE\b|Preview/.test(text), `${where} shows data that is not meant for the screen or a word we do not use: ${text.slice(0, 160)}`);

export const BOOKS_SCENARIOS = [
  {
    name: 'Books: the tab is a compact banner and the covers, A5 in two columns, on a shelf for each kind of book, each ONE button with its own ribbon, at 320, 390 and 430 wide',
    persona: 'in',
    async run(ctx) {
      const { page, step } = ctx;
      await openBooks(ctx);
      step('as many covers as there are books, each one button named "title, kind of book, time"');
      await eventually(() => page.getByRole('button', { name: COVER_LABEL }).count(), (n) => n === CATALOG.length, { what: `the number of covers (the bundle holds ${CATALOG.length} books)` });
      await coverOf(page, guide).waitFor();
      await coverOf(page, readings).waitFor();
      step('a shelf for each kind: a heading and the number of its books');
      const guides = CATALOG.filter((b) => b.kind === 'guide').length;
      await page.getByRole('heading', { name: "Pilgrim's guides", exact: true }).waitFor();
      await page.getByRole('heading', { name: 'Readings for the Way', exact: true }).waitFor();
      await page.getByText(`${guides} books`, { exact: true }).first().waitFor();
      step('a banner with a button, no notice above the covers, and no book that says Soon or Free');
      const banner = page.getByRole('button', { name: /^(Start|Continue) reading\. Books for the road/ });
      await banner.waitFor();
      const b = await box(banner, 'the banner');
      assert(b.height <= 120, `the banner is ${b.height} high (at most 120 on a 390 phone)`);
      near(b.width, 358, 2, 'the banner fills the margins');
      await page.getByText('Books for the road', { exact: true }).waitFor();
      for (const word of ['SOON', 'FREE', 'Preview', 'Coming soon']) await eventually(() => page.getByText(word, { exact: true }).count(), (n) => n === 0, { what: `the number of "${word}" marks on the Books tab` });
      step('the covers are A5 (148 by 210), two in a row, 16 from the edge and 12 apart: 173 by 245 on this 390 phone');
      const covers = page.getByRole('button', { name: COVER_LABEL });
      const boxes = [];
      for (let i = 0; i < CATALOG.length; i += 1) boxes.push(await box(covers.nth(i), `cover ${i + 1}`));
      for (const c of boxes) { near(c.width / c.height, A5, 0.01, 'width over height'); near(c.width, 173, 1.5, 'the width of a cover at 390'); near(c.height, 245, 2, 'the height of a cover at 390'); }
      const xs = [...new Set(boxes.map((c) => Math.round(c.x)))];
      assert.equal(xs.length, 2, `two columns, not ${xs.length}: ${xs}`);
      near(xs[0], 16, 1, 'the first column starts at the margin');
      near(boxes[1].x - (boxes[0].x + boxes[0].width), 12, 1.5, 'the gap between the columns');
      assert(boxes[2].y >= boxes[0].y + boxes[0].height + 11, 'the second row is under the first');
      step('every cover has a ribbon of 44 by 44 that is the bookmark button of that book, inside the cover');
      const ribbons = page.getByRole('button', { name: /^(Remove bookmark|Bookmark): / });
      await eventually(() => ribbons.count(), (n) => n === CATALOG.length, { what: 'the number of ribbons on the Books tab' });
      for (let i = 0; i < CATALOG.length; i += 1) {
        const r = await box(ribbons.nth(i), `ribbon ${i + 1}`);
        near(r.width, 44, 0.5, 'the ribbon button is 44 wide');
        near(r.height, 44, 0.5, 'and 44 high');
        const c = boxes[i];
        assert(r.x >= c.x && r.y >= c.y - 1 && r.x + r.width <= c.x + c.width + 0.5 && r.y + r.height <= c.y + c.height, `ribbon ${i + 1} is inside its cover`);
      }
      step('the four fonts of the brand: Fraunces for the title of a cover, JetBrains Mono for its time, and at most one handwritten (Caveat) note on the screen');
      const fonts = await page.evaluate((time) => {
        const family = (text) => { const el = [...document.querySelectorAll('div')].find((d) => d.children.length === 0 && d.textContent === text && d.getBoundingClientRect().width > 0); return el ? getComputedStyle(el).fontFamily : null; };
        const caveat = [...document.querySelectorAll('div')].filter((d) => d.children.length === 0 && d.getBoundingClientRect().width > 0 && /Caveat/.test(getComputedStyle(d).fontFamily)).map((d) => d.textContent);
        return { banner: family('Books for the road'), time: family(time), caveat };
      }, ((m) => (m < 60 ? `${m} min` : m % 60 === 0 ? `${m / 60} h` : `${Math.floor(m / 60)} h ${m % 60} min`))(CATALOG[0].minutes));
      assert(/Fraunces/.test(fonts.banner ?? ''), `the title of the banner is Fraunces (${fonts.banner})`);
      assert(/JetBrains/.test(fonts.time ?? ''), `the time on a cover is JetBrains Mono (${fonts.time})`);
      assert.equal(fonts.caveat.length, 1, `the handwritten notes on the tab: ${JSON.stringify(fonts.caveat)}`);
      noData((await page.locator('body').innerText()).replace(/\s+/g, ' '), 'the Books tab');
      for (const width of [320, 430]) {
        step(`on a ${width} phone the covers are A5 and two in a row`);
        await page.setViewportSize({ width, height: 800 });
        const tile = Math.floor((width - 32 - 12) / 2);
        await eventually(async () => Math.round((await box(covers.first(), 'the first cover')).width), (w) => Math.abs(w - tile) <= 1.5, { what: `the width of a cover at ${width}` });
        const a = await box(covers.nth(0), 'cover 1');
        const c = await box(covers.nth(1), 'cover 2');
        near(a.width / a.height, A5, 0.01, `width over height at ${width}`);
        assert(c.x > a.x + a.width && Math.abs(c.y - a.y) < 2, `two in a row at ${width}`);
        assert(c.x + c.width <= width - 16 + 1, `inside the right margin at ${width}`);
      }
    },
  },
  {
    name: 'Books: a cover opens the book page (the cover, the title, the subtitle, the kind, THE NOTICE OF ITS KIND, "Start reading", the contents with the minutes of each chapter, the credit) and Back returns to the tab',
    persona: 'in',
    async run(ctx) {
      const { page, step, go } = ctx;
      step('open the Books tab and tap the cover of the first guide');
      await openBooks(ctx);
      await coverOf(page, guide).click();
      await eventually(() => pathOf(page), (p) => p === `/library/book/${guide.id}`, { what: 'the address after tapping a cover' });
      const book = readBook(guide.id);
      step('the page: the title as a heading, the subtitle, the kind, how long it is, the description, the notice of a guide, the gold button and the handwritten note');
      await page.getByRole('heading', { name: guide.title, exact: true }).first().waitFor();
      await page.getByText(guide.subtitle, { exact: true }).first().waitFor();
      await page.getByText("PILGRIM'S GUIDE", { exact: true }).filter({ visible: true }).first().waitFor(); // the Books tab stays mounted under the page
      await page.getByText(`${guide.chapters.length} chapters`, { exact: false }).first().waitFor();
      await page.getByText(NOTICE.guide, { exact: true }).waitFor();
      const start = page.getByRole('button', { name: /^Start reading$/ });
      await start.waitFor();
      assert((await box(start, 'the button')).height >= 56, 'the gold button is at least 56 high');
      await page.getByText('Buen Camino!', { exact: true }).waitFor();
      step('the notice is above the button: it is read before the book is');
      const notice = await box(page.getByText(NOTICE.guide, { exact: true }), 'the notice');
      assert(notice.y < (await box(start, 'the button')).y, 'the notice is above the button');
      step('the contents: a button for every chapter, with the minutes of each, and the credit of the book');
      await page.getByRole('heading', { name: 'Contents', exact: true }).waitFor();
      const rows = await page.getByRole('button').evaluateAll((els, titles) => els.filter((e) => titles.some((t) => (e.getAttribute('aria-label') || '').startsWith(t))).length, book.chapters.map((c) => c.title));
      assert(rows >= book.chapters.length, `${rows} chapters in the contents, ${book.chapters.length} in the book`);
      await page.getByRole('button', { name: new RegExp(`^${esc(book.chapters[0].title)}, ${guide.chapters[0].minutes} min`) }).first().waitFor();
      await page.getByText(book.credit, { exact: true }).first().waitFor();
      const full = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
      assert(!/could not be opened/.test(full), 'a book of the bundle opens');
      noData(full, 'the page of a guide');
      step('a book of readings has its own notice, its own note, and names the edition of its passages');
      await go(`/library/book/${readings.id}`);
      await page.getByRole('heading', { name: readings.title, exact: true }).first().waitFor();
      await page.getByText(NOTICE.reflection, { exact: true }).waitFor();
      await page.getByText('READINGS FOR THE WAY', { exact: true }).first().waitFor(); // on the cover and in the mark under the title
      await page.getByText('A little each day', { exact: true }).waitFor();
      await eventually(() => page.getByText(NOTICE.guide, { exact: true }).count(), (n) => n === 0, { what: 'the number of guide notices on a book of readings' });
      await page.getByText(readBook(readings.id).credit.slice(0, 40), { exact: false }).first().waitFor();
      step('Back returns to the Library');
      await page.getByRole('button', { name: 'Back', exact: true }).first().click();
      await eventually(() => pathOf(page), (p) => p !== `/library/book/${readings.id}`, { what: 'the address after Back' });
    },
  },
  {
    name: 'Books: every kind of book has its notice on its page: the first and the last book of each kind show the wording of notices.ts, and nothing else says how the books were written',
    persona: 'in',
    async run({ page, step, go }) {
      const kinds = ['guide', 'reflection'];
      for (const kind of kinds) {
        const of = CATALOG.filter((b) => b.kind === kind);
        for (const book of [of[0], of[of.length - 1]]) {
          step(`${book.title} (${kind}): its page says what its kind says`);
          await go(`/library/book/${book.id}`);
          await page.getByRole('heading', { name: book.title, exact: true }).first().waitFor();
          await page.getByText(NOTICE[kind], { exact: true }).waitFor();
          const other = NOTICE[kind === 'guide' ? 'reflection' : 'guide'];
          await eventually(() => page.getByText(other, { exact: true }).count(), (n) => n === 0, { what: `the number of notices of the other kind on ${book.id}` });
        }
      }
    },
  },
  {
    name: 'Books: the reader opens at the first chapter, Next and Previous go through the chapters (their labels name where they go), at the first chapter Previous is off and at the last Next is, and Contents goes back to the page',
    persona: 'in',
    async run(ctx) {
      const { page, step, go } = ctx;
      const id = readings.id;
      const book = readBook(id);
      const total = book.chapters.length;
      const first = book.chapters[0];
      step('open the page of a book of readings and tap "Start reading": the reader at chapter 1, with the title of the book and "Chapter 1 of N" in the bar at the bottom');
      await go(`/library/book/${id}`);
      await page.getByRole('button', { name: /^Start reading$/ }).click();
      await eventually(() => pathOf(page), (p) => p === `/library/book/${id}/read`, { what: 'the address of the reader' });
      await eventually(() => new URL(page.url()).search, (s) => s === `?c=${first.id}`, { what: 'the chapter in the address' });
      await page.getByText(`Chapter 1 of ${total}`, { exact: true }).waitFor();
      const title = page.getByText(book.title, { exact: true }).filter({ visible: true });
      await title.first().waitFor();
      const height = await page.evaluate(() => window.innerHeight);
      const titleBox = await title.first().boundingBox();
      assert(titleBox && titleBox.y > height * 0.75, `the title of the book is at the bottom of the screen, as on a Kindle (it is at ${titleBox?.y} of ${height})`);
      const contents = page.getByRole('button', { name: 'Contents', exact: true });
      await contents.waitFor();
      const contentsBox = await contents.boundingBox();
      assert(contentsBox && contentsBox.y < height * 0.25, `the way back is at the top (it is at ${contentsBox?.y} of ${height})`);
      step('at the first chapter Previous is dimmed and disabled (in the bar and at the end), and Next is not');
      const previous = page.getByRole('button', { name: /^Previous chapter\. This is the first chapter$/ });
      await eventually(() => previous.count(), (n) => n === 2, { what: 'the number of Previous buttons at the first chapter' });
      for (let i = 0; i < 2; i += 1) assert.equal(await previous.nth(i).getAttribute('aria-disabled'), 'true', 'Previous is disabled at the first chapter');
      step('Next in the bar goes to chapter 2, named by its title, and Previous comes back');
      const second = book.chapters[1];
      const nextName = new RegExp(`^Next: ${esc(second.title)}$`);
      await page.getByRole('button', { name: nextName }).last().click();
      await eventually(() => new URL(page.url()).search, (s) => s === `?c=${second.id}`, { what: 'the chapter after Next' });
      await page.getByText(`Chapter 2 of ${total}`, { exact: true }).waitFor();
      await page.getByRole('button', { name: /^Previous: / }).last().click();
      await eventually(() => new URL(page.url()).search, (s) => s === `?c=${first.id}`, { what: 'the chapter after Previous' });
      step('Back from the reader goes where it came from (the page), not through the chapters that were read');
      await page.getByRole('button', { name: nextName }).last().click();
      await eventually(() => new URL(page.url()).search, (s) => s === `?c=${second.id}`, { what: 'the chapter again' });
      await page.goBack();
      await eventually(() => pathOf(page), (p) => p === `/library/book/${id}`, { what: 'the address after the browser Back' });
      step('a day of readings has its passage as a quotation, the headings of its parts, and at the end of the chapter Next, Previous and one handwritten note');
      const day = book.chapters[2];
      await go(`/library/book/${id}/read?c=${day.id}`);
      await page.getByText(`Chapter 3 of ${total}`, { exact: true }).waitFor();
      await page.getByRole('heading', { name: 'The passage', exact: true }).waitFor();
      await page.getByRole('heading', { name: 'Reflection', exact: true }).waitFor();
      await scrollTo(page, 1);
      await eventually(() => page.getByRole('button', { name: /^Next: / }).count(), (n) => n === 2, { what: 'the number of Next buttons (the end of the chapter and the bar)' });
      await page.getByText('Rest a little', { exact: true }).waitFor();
      step('the last chapter: Next is disabled, the end of the book is said, and the credit is printed');
      await go(`/library/book/${id}/read?c=${book.chapters[total - 1].id}`);
      const last = page.getByRole('button', { name: /^Next chapter\. This is the last chapter$/ });
      await eventually(() => last.count(), (n) => n === 2, { what: 'the number of Next buttons at the last chapter' });
      assert.equal(await last.first().getAttribute('aria-disabled'), 'true');
      await scrollTo(page, 1);
      await page.getByRole('heading', { name: 'End of the book', exact: true }).waitFor();
      await page.getByText(book.credit.slice(0, 40), { exact: false }).first().waitFor();
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
      const id = readings.id;
      const book = readBook(id);
      const longest = book.chapters.map((c, i) => ({ i, w: c.blocks.length })).sort((a, b) => b.w - a.w)[0].i;
      const chapter = book.chapters[longest];
      step(`open chapter ${longest + 1}, the one with the most blocks, and scroll to the middle`);
      await go(`/library/book/${id}/read?c=${chapter.id}`);
      await page.getByText(`Chapter ${longest + 1} of ${book.chapters.length}`, { exact: true }).waitFor();
      await eventually(() => scroller(page), (s) => s && s.height > s.client * 2, { what: 'a chapter longer than two screens' });
      await scrollTo(page, 0.5);
      step('the place is written a moment later, only on the phone, under the person\'s own key, with the time');
      await eventually(() => saved(page, UID), (v) => !!v && JSON.parse(v).items.some((p) => p.id === id && p.c === chapter.id && Math.abs(p.y - 0.5) < 0.03 && p.at > 0), { what: 'the saved place', timeout: 10000 });
      step('the page of the book says "Continue: …" and the Books tab "Continue reading", for this book');
      await go(`/library/book/${id}`);
      await page.getByRole('button', { name: /^Continue: / }).first().waitFor();
      assert(!(await page.getByRole('button', { name: /^Start reading$/ }).count()), 'no "Start reading" once something was read');
      await page.getByText('LAST READ', { exact: true }).first().waitFor();
      await openBooks(ctx);
      await page.getByRole('button', { name: new RegExp(`^Continue reading\\. Books for the road\\. ${esc(book.title)}`) }).waitFor();
      step('"Continue" opens the same chapter at the same line');
      await page.getByRole('button', { name: /^Continue reading/ }).click();
      await eventually(() => new URL(page.url()).pathname, (p) => p === `/library/book/${id}/read`, { what: 'the address of the reader' });
      await eventually(() => scroller(page), (s) => s && Math.abs(s.top / (s.height - s.client) - 0.5) < 0.03, { what: 'the line where the person stopped', timeout: 10000 });
      step('the text size: Larger makes it bigger, five steps, the buttons stop at the ends, and the size is kept when the reader is opened again');
      const before = parseFloat(await paragraphSize(page));
      assert(before >= 17 && before <= 28, `the size at the first step is ${before}`);
      const larger = page.getByRole('button', { name: 'Larger text', exact: true });
      await larger.click();
      await eventually(async () => parseFloat(await paragraphSize(page)), (s) => s > before, { what: 'the text after Larger' });
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
      step('a damaged place: text that is not a place, and a place in a chapter the book does not have, open the book at its start without an error');
      const key = `kv:u.${UID}.library.reading`;
      // The damaged value is put on the phone when the next page starts, before the app runs: the page that is being left may still write its own place on its way out.
      await page.addInitScript((k) => { try { const bad = sessionStorage.getItem('damagedPlace'); if (bad !== null) localStorage.setItem(k, bad); } catch { /* storage blocked */ } }, key);
      for (const bad of ['not json at all', JSON.stringify({ v: 1, last: id, items: [{ id, c: 'zz-no-such-chapter', y: 0.7, at: 1, read: ['zz-no-such-chapter'] }] }), JSON.stringify({ v: 9, items: 'x' }), JSON.stringify({ v: 1, items: [{ id, c: 7, y: 'far' }] })]) {
        await page.evaluate((v) => sessionStorage.setItem('damagedPlace', v), bad);
        await go(`/library/book/${id}`);
        await page.getByRole('button', { name: /^Start reading$/ }).waitFor();
        await page.getByRole('button', { name: /^Start reading$/ }).click();
        await page.getByText(`Chapter 1 of ${book.chapters.length}`, { exact: true }).waitFor();
        await eventually(() => new URL(page.url()).search, (s) => s === `?c=${book.chapters[0].id}`, { what: 'the start of the book after a damaged place' });
      }
      await page.evaluate((v) => sessionStorage.setItem('damagedPlace', v), JSON.stringify({ v: 1, last: id, items: [{ id, c: 'zz-no-such-chapter', y: 0.7, at: 1, read: [] }] }));
      await go(`/library/book/${id}/read`);
      await page.getByText(`Chapter 1 of ${book.chapters.length}`, { exact: true }).waitFor();
    },
  },
  {
    name: 'Books: links go where they say (?c= goes on to the reader), a chapter that is not in the book and a book that is not in the Library are calm sentences with a way on, never a crash',
    persona: 'in',
    async run({ page, step, go }) {
      const id = guide.id;
      const book = readBook(id);
      const second = book.chapters[1];
      step(`/library/book/<id>?c=${second.id} goes on to the reader at chapter 2`);
      await go(`/library/book/${id}?c=${second.id}`);
      await eventually(() => pathOf(page), (p) => p === `/library/book/${id}/read`, { what: 'the address after the link' });
      await eventually(() => new URL(page.url()).search, (s) => s === `?c=${second.id}`, { what: 'the chapter of the link' });
      await page.getByText(`Chapter 2 of ${book.chapters.length}`, { exact: true }).waitFor();
      step('a chapter that is not in the book: the page of the book, with one sentence that says so');
      await go(`/library/book/${id}/read?c=zzz`);
      await page.getByText('This book has no such chapter, so here is its table of contents.', { exact: true }).waitFor();
      await page.getByRole('heading', { name: book.title, exact: true }).first().waitFor();
      await go(`/library/book/${id}?c=zzz`);
      await page.getByText('This book has no such chapter, so here is its table of contents.', { exact: true }).waitFor();
      step('a book that is not in the Library: a calm sentence and the way to the Library');
      await go('/library/book/not-a-book');
      await page.getByRole('heading', { name: 'That book is not in the Library', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Open the Library', exact: true }).click();
      await eventually(() => pathOf(page), (p) => p === '/library', { what: 'the address after "Open the Library"' });
      await go('/library/book/not-a-book/read?c=zzz');
      await page.getByRole('heading', { name: 'That book is not in the Library', exact: true }).waitFor();
      step('the old books of the Library (the twelve classics of an earlier plan) are not in it either');
      await go('/library/book/imitation-of-christ');
      await page.getByRole('heading', { name: 'That book is not in the Library', exact: true }).waitFor();
    },
  },
  {
    name: 'Books: the ribbon of a cover bookmarks the book, Bookmarks lists it as a row that opens its page, and a search lists it by its title, its subtitle and the titles of its chapters and opens its page too',
    persona: 'in',
    async run(ctx) {
      const { page, step, go } = ctx;
      step(`open the Books tab and bookmark ${readings.title} with its ribbon (the key is the one the rows always had)`);
      await openBooks(ctx);
      await page.getByRole('button', { name: `Bookmark: ${readings.title}`, exact: true }).click();
      await page.getByRole('button', { name: `Remove bookmark: ${readings.title}`, exact: true }).waitFor();
      await eventually(() => page.evaluate((k) => localStorage.getItem(k), `kv:u.${UID}.library.bookmarks`), (v) => !!v && JSON.parse(v).items.some((b) => b.key === `books:${readings.id}`), { what: `the bookmark kept under books:${readings.id}` });
      step('Bookmarks lists the book as a row (title, kind, time), and the row opens the page of the book');
      await page.getByRole('button', { name: 'Bookmarks', exact: true }).click();
      await eventually(() => pathOf(page), (p) => p === '/library/bookmarks', { what: 'the address of Bookmarks' });
      const row = coverOf(page, readings).first();
      await row.waitFor();
      await page.getByText(readings.subtitle, { exact: true }).first().waitFor();
      await row.click();
      await eventually(() => pathOf(page), (p) => p === `/library/book/${readings.id}`, { what: 'the address of the book from Bookmarks' });
      step('a search for its title lists the book as a row that opens the page, with no notice about books');
      await go('/library');
      const field = page.getByRole('textbox', { name: 'Search the library' });
      await field.fill(readings.title);
      await page.getByText(/^\d+ results? for /).waitFor();
      await coverOf(page, readings).first().click();
      await eventually(() => pathOf(page), (p) => p === `/library/book/${readings.id}`, { what: 'the address of the book from a search' });
      step('a word of a chapter title finds the book, and a word of its kind finds the shelf');
      await go('/library');
      const word = readings.chapters[3].title.replace(/^Day \d+\.\s*/, '').split(/\s+/).find((w) => w.length > 6) ?? readings.chapters[3].title.split(/\s+/)[0];
      await field.fill(word);
      await page.getByText(/^\d+ results? for /).waitFor();
      await coverOf(page, readings).first().waitFor();
      await eventually(() => page.getByText(/Coming soon|Books marked Soon/).count(), (n) => n === 0, { what: 'the number of notices about books in a search' });
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
      await eventually(() => page.getByRole('button', { name: COVER_LABEL }).count(), (n) => n === CATALOG.length, { what: 'the number of covers with no signal' });
      step('a book opens, and so does its reader, and the place is kept');
      await coverOf(page, readings).click();
      await eventually(() => pathOf(page), (p) => p === `/library/book/${readings.id}`, { what: 'the address of the book page' });
      const book = readBook(readings.id);
      await page.getByRole('button', { name: /^Start reading$/ }).click();
      await page.getByText(`Chapter 1 of ${book.chapters.length}`, { exact: true }).waitFor();
      await eventually(() => scroller(page), (s) => !!s, { what: 'the words of the chapter' });
      await page.getByRole('button', { name: /^Next: / }).last().click();
      await page.getByText(`Chapter 2 of ${book.chapters.length}`, { exact: true }).waitFor();
      await eventually(() => saved(page, UID), (v) => !!v && JSON.parse(v).items.some((p) => p.id === readings.id && p.c === book.chapters[1].id), { what: 'the place kept with no signal', timeout: 10000 });
      await go(`/library/book/${readings.id}`);
      await page.getByRole('button', { name: /^Continue: / }).first().waitFor();
    },
  },
  {
    name: 'Books: a touch on a passage chooses it (gold ground, underline, a bar with Bookmark, Copy and Share), a second touch lets it go, Bookmark keeps it, Bookmarks lists it, and its row opens the reader at that passage, chosen and in view',
    persona: 'in',
    async run(ctx) {
      const { page, step, go } = ctx;
      const book = readBook(guide.id);
      const flat = (s) => s.replace(/\s+/g, ' ').trim();
      const plain = (spans) => flat(spans.map((x) => x.t).join(''));
      // a chapter with at least four paragraphs of a good length: the passage to keep is the fourth, so it is not at the top and a link has to scroll to it
      const longOnes = (c) => c.blocks.map((b, i) => ({ b, i })).filter(({ b }) => b.t === 'p' && plain(b.spans).length > 80 && plain(b.spans).length < 900);
      const chapter = book.chapters.find((c) => longOnes(c).length >= 4);
      assert(chapter, 'a guide has a chapter with four paragraphs of a good length');
      const target = longOnes(chapter)[3];
      const first = plain(target.b.spans).slice(0, 40);
      const key = `books:${guide.id}.${chapter.id.slice(0, 24)}.${target.i}`;
      const words = page.getByRole('link', { name: new RegExp(esc(first)) });
      const bar = page.getByRole('toolbar', { name: /^Actions for / });
      const stored = () => page.evaluate((k) => localStorage.getItem(k), `kv:u.${UID}.library.bookmarks`);
      const keptKeys = async () => { const raw = await stored(); return raw ? JSON.parse(raw).items.map((x) => x.key) : []; };

      step('the reader at that chapter: nothing is chosen, and no bar of actions');
      await go(`/library/book/${guide.id}/read?c=${chapter.id}`);
      await words.first().waitFor();
      assert.equal(await bar.count(), 0, 'no bar of actions before a passage is chosen');

      step('a touch on the words chooses the passage: a gold ground and an underline, and a bar with Bookmark, Copy or Share named by where the passage is');
      await words.first().scrollIntoViewIfNeeded();
      await words.first().click();
      await bar.waitFor();
      const label = (await bar.getAttribute('aria-label')).replace(/^Actions for /, '');
      assert(/^.+, passage \d+$/.test(label), `where the passage is: "${label}"`);
      const look = await words.first().evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, line: getComputedStyle(el).textDecorationLine }));
      assert(look.line.includes('underline'), 'the chosen passage is underlined, so that it is not the colour alone that says so');
      assert(!/rgba\(0, 0, 0, 0\)|transparent/.test(look.bg), `the chosen passage has a ground (${look.bg})`);
      await page.getByRole('button', { name: `Bookmark: ${label}`, exact: true }).waitFor();
      await page.getByRole('button', { name: `Share: ${label}`, exact: true }).waitFor();
      const barBox = await box(bar, 'the bar of actions');
      const readerBar = await box(page.getByRole('button', { name: /^Next: / }).last(), 'Next in the bar at the bottom');
      assert(barBox.y + barBox.height <= readerBar.y + 2, 'the bar of actions is above the bar at the bottom, not over it');
      const height = await page.evaluate(() => window.innerHeight);
      const under = await box(words.first(), 'the chosen passage');
      assert(under.y + 20 < barBox.y, `the chosen passage is not hidden under the bar of actions (it starts at ${under.y}, the bar at ${barBox.y} of ${height})`);

      step('a second touch lets it go, and a touch on the close button does too');
      await words.first().click();
      await eventually(() => bar.count(), (c) => c === 0, { what: 'the bar of actions after a second touch' });
      await words.first().click();
      await bar.waitFor();
      await page.getByRole('button', { name: 'Close the passage actions', exact: true }).click();
      await eventually(() => bar.count(), (c) => c === 0, { what: 'the bar of actions after Close' });

      step('Bookmark keeps the passage in the Library\'s bookmarks, under its key; the button says so');
      await words.first().click();
      await bar.waitFor();
      await page.getByRole('button', { name: `Bookmark: ${label}`, exact: true }).click();
      await page.getByRole('button', { name: `Remove bookmark: ${label}`, exact: true }).waitFor();
      await eventually(keptKeys, (keys) => keys.includes(key), { what: 'the key of the passage in the bookmarks kept on the phone' });

      step('Bookmarks lists it under "Passages · 1", with the book, where it is and the first words');
      await go('/library/bookmarks');
      await page.getByText('Passages · 1', { exact: true }).waitFor();
      const row = page.getByRole('button', { name: new RegExp(`^${esc(book.title)}, ${esc(label)}: `) });
      await row.waitFor();
      assert((await row.getAttribute('aria-label')).includes(first.slice(0, 30)), 'the row shows the first words of the passage');

      step('a tap on the row opens the reader at that passage: the address names it, it is chosen, bookmarked and in view');
      await row.click();
      await eventually(() => pathOf(page), (p) => p === `/library/book/${guide.id}/read`, { what: 'the address of the reader' });
      await eventually(() => new URL(page.url()).search, (s) => s === `?c=${chapter.id}&p=${target.i}`, { what: 'the address names the passage' });
      await bar.waitFor();
      assert.equal((await bar.getAttribute('aria-label')), `Actions for ${label}`, 'the passage of the address is the one that is chosen');
      await page.getByRole('button', { name: `Remove bookmark: ${label}`, exact: true }).waitFor();
      const at = await box(words.first(), 'the linked passage');
      assert(at.y >= 0 && at.y < height - barBox.height, `the linked passage is in view (at ${at.y} of ${height})`);

      step('Back goes to Bookmarks, and taking the bookmark off there leaves the row in its place until the screen is left');
      await page.goBack();
      await eventually(() => pathOf(page), (p) => p === '/library/bookmarks', { what: 'the address after Back' });
      await row.waitFor();
      await page.getByRole('button', { name: `Remove bookmark: ${book.title}, ${label}`, exact: true }).click();
      await page.getByRole('button', { name: `Bookmark: ${book.title}, ${label}`, exact: true }).waitFor();
      await row.waitFor();
      await eventually(keptKeys, (keys) => !keys.includes(key), { what: 'the passage taken off the bookmarks kept on the phone' });
    },
  },
];
