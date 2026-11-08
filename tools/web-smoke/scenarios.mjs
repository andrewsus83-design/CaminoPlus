// Scenarios: a person using the app, step by step. Each one runs in a browser of its own, in light and in dark (unless it says
// otherwise), and everything that goes wrong in the page while it runs fails it, exactly as in the route sweep.
//
// They wait for what the person would wait for (an address, a button, a line of text), never for a fixed time.
//
// The diary screens and the Notes feed (mobile/app/diary, mobile/src/features/diary, mobile/src/features/notes) belong to the diary: the route
// sweep checks that they load without errors, and the Me scenarios below only check that Notes is the first sub-tab, WHERE its pen goes and that one
// note written there shows up in the feed, never what the notes look like. The daily reading (/library/daily) has its own scenarios, in
// daily.scenarios.mjs (the header, the week strip, the calendar sheet, the bookmark, the date of the address); the Library scenarios below only
// check that the banner leads there.
import assert from 'node:assert/strict';
import { DAILY_SCENARIOS } from './daily.scenarios.mjs';
import { UID } from './fixtures.mjs';
import { domQuiet, eventually, pathOf } from './harness.mjs';

const TABS = ['Me', 'Stays', 'Maps', 'Discover', 'Library'];
const TAB_PATH = { Me: '/me', Stays: '/stays', Maps: '/maps', Discover: '/explore', Library: '/library' };

const texts = (locator) => locator.allInnerTexts().then((all) => all.map((t) => t.replace(/\s+/g, ' ').trim()));
const waitPath = (page, want, what = 'the address') => eventually(() => pathOf(page), (p) => p === want, { what: `${what} (wanted ${want})` });

/** Me -> the gear -> Settings. */
async function openSettings({ page, step, go }) {
  step('open Me');
  await go('/me');
  step('tap the gear at the top right');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await waitPath(page, '/settings', 'the address after the gear');
  await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
}

const back = async ({ page, step }) => {
  step('tap Back');
  await page.getByRole('button', { name: 'Back', exact: true }).first().click();
};

export const SCENARIOS = [
  {
    name: 'Tab bar: Me, Stays, Maps, Discover and Library, and each tab opens',
    persona: 'in',
    async run({ page, step, go }) {
      step('open Me');
      await go('/me');
      await eventually(() => texts(page.getByRole('tab')), (t) => t.join('|') === TABS.join('|'), { what: 'the tabs of the tab bar' });
      for (const label of TABS) {
        step(`tap ${label}`);
        await page.getByRole('tab', { name: label, exact: true }).click();
        await waitPath(page, TAB_PATH[label], `the address after tapping ${label}`);
        await eventually(() => texts(page.getByRole('tab')), (t) => t.join('|') === TABS.join('|'), { what: `the tab bar after tapping ${label}` });
      }
    },
  },
  {
    name: 'Settings: the gear on Me opens Settings (no tab bar there) and Back returns to Me',
    persona: 'in',
    async run(ctx) {
      const { page } = ctx;
      await openSettings(ctx);
      await eventually(() => page.getByRole('tab').count(), (n) => n === 0, { what: 'the number of tabs shown on Settings (there is no tab bar there)' });
      await back(ctx);
      await waitPath(page, '/me', 'the address after Back');
      await eventually(() => texts(page.getByRole('tab')), (t) => t.length === TABS.length, { what: 'the tab bar is back on Me' });
    },
  },
  {
    name: 'Settings opened from a link (nothing behind it): Back still goes to Me',
    persona: 'in',
    async run(ctx) {
      const { page, step, go } = ctx;
      step('open /settings directly');
      await go('/settings');
      await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
      await back(ctx);
      await waitPath(page, '/me', 'the address after Back');
    },
  },
  {
    name: 'Settings: switching light and dark returns to Settings, and Back goes to Me',
    persona: 'in',
    async run(ctx) {
      const { page, step, task } = ctx;
      const from = task.scheme;
      const to = from === 'light' ? 'dark' : 'light';
      await openSettings(ctx);
      step(`tap "Switch to ${to} mode"`);
      await page.getByRole('button', { name: `Switch to ${to} mode`, exact: true }).click();
      step('wait for Settings to come back in the new mode');
      await page.getByRole('button', { name: `Switch to ${from} mode`, exact: true }).waitFor(); // the toggle now offers the way back: the new mode is on
      await domQuiet(page, 400); // the app rebuilt its screens and went back to Settings: let that finish
      await waitPath(page, '/settings', 'the address after the switch');
      await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
      await eventually(() => page.evaluate(() => localStorage.getItem('kv:theme-scheme')), (v) => v === JSON.stringify(to), { what: 'the colour scheme saved on the phone' });
      await back(ctx);
      await waitPath(page, '/me', 'the address after Back (with Me under Settings)');
    },
  },
  {
    name: 'Library: the tabs Bible and Books sit directly under the search row, before the banner; each has a banner and a notice; there is no Notes tab and no gold pen',
    persona: 'in',
    async run({ page, step, go }) {
      const strip = (label) => page.getByText(label, { exact: true }).filter({ visible: true }).first();
      const box = async (locator, what) => { const b = await locator.boundingBox(); if (!b) throw new Error(`${what} has no box (it is not on the screen)`); return b; };
      step('open Library');
      await go('/library');
      await page.getByRole('heading', { name: 'Library', exact: true }).waitFor();
      step('the search field and the Bookmarks button are the top row, and there is no diary button');
      const search = await box(page.getByRole('textbox', { name: 'Search the library' }), 'the search field');
      const bookmarks = await box(page.getByRole('button', { name: 'Bookmarks', exact: true }), 'the Bookmarks button');
      assert(bookmarks.x > search.x + search.width - 2, 'the Bookmarks button is after the search field, in the corner');
      assert(Math.abs(bookmarks.y - search.y) < 12, 'the two are one row');
      await eventually(() => page.getByRole('button', { name: /diary/i }).count(), (n) => n === 0, { what: 'the number of diary buttons on Library' });
      step('the tabs come directly under that row, in the order Bible, Books, and the banner comes after them');
      const [bible, books] = [await box(strip('Bible'), 'the Bible tab'), await box(strip('Books'), 'the Books tab')];
      assert(bible.x < books.x, 'Bible, Books from left to right');
      assert(Math.abs(bible.y - books.y) < 2, 'the two tabs are one row');
      assert(bible.y > search.y + search.height, 'the tabs are under the search row');
      const title = await box(page.getByText("Today's reading and a short reflection", { exact: true }), 'the title of the Bible banner');
      assert(title.y > bible.y + bible.height, 'the banner is under the tabs, not above them');
      step('there are exactly two tabs: no Notes tab, and no gold pen (writing is on Me)');
      await eventually(() => page.getByText('Notes', { exact: true }).filter({ visible: true }).count(), (n) => n === 0, { what: 'the number of "Notes" labels on Library' });
      await eventually(() => page.getByRole('button', { name: /^Write a (note|journey post)$/ }).count(), (n) => n === 0, { what: 'the number of gold pens on Library' });
      step('Bible: the banner (kicker, title, today\'s date, a gold button) and the Preview notice');
      await page.getByText('Today · Daily reading', { exact: true }).waitFor();
      await page.getByText(/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday) \d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December)$/).waitFor();
      await page.getByRole('button', { name: /^Read today/ }).waitFor();
      await page.getByText(/The Bible text is not in the app yet/).first().waitFor();
      step('Books: its own banner without a button, the notice, twelve books');
      await strip('Books').click();
      await page.getByText('Twelve free companions for the road', { exact: true }).waitFor();
      await page.getByText('Classics to read on the way. Free to read.', { exact: true }).waitFor();
      await page.getByText(/Books are not in the app yet/).first().waitFor();
      await eventually(() => page.getByRole('button', { name: /^Read today/ }).count(), (n) => n === 0, { what: 'the number of "Read today" buttons on Books' });
      await eventually(() => page.getByLabel('Free to read').count(), (n) => n === 12, { what: 'the number of books marked Free' });
      await eventually(() => page.getByLabel('Coming soon').count(), (n) => n === 12, { what: 'the number of books marked Soon' });
      await page.getByText('The Way of a Pilgrim', { exact: true }).waitFor();
      await page.getByText('The Story of a Soul', { exact: true }).waitFor();
      step('Books: what is only data for later (links, licence notes, groups) is nowhere on the screen');
      const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
      assert(!/gutenberg|ccel\.org|licen[cs]e|translator|public domain|check-edition|Pilgrims on foot|Spanish and contemplative|Reflection and inner peace|Great classics/i.test(text), `the Books tab shows data that is not meant for the screen: ${text.slice(0, 200)}`);
      await eventually(() => page.getByRole('button', { name: /^Write a (note|journey post)$/ }).count(), (n) => n === 0, { what: 'the number of gold pens on Books' });
    },
  },
  {
    name: 'Me: the strip is Notes, Journey, Plan, Health in that order and Me opens on Journey with one gold pen, "Write a journey post"; at 320 px wide the four labels are one row, each on one line',
    persona: 'in',
    async run({ page, step, go }) {
      const label = (t) => page.getByText(t, { exact: true }).filter({ visible: true }).first();
      const box = async (locator, what) => { const b = await locator.boundingBox(); if (!b) throw new Error(`${what} has no box (it is not on the screen)`); return b; };
      const NAMES = ['Notes', 'Journey', 'Plan', 'Health'];
      const penNote = page.getByRole('button', { name: 'Write a note', exact: true });
      const penPost = page.getByRole('button', { name: 'Write a journey post', exact: true });
      step('open Me: it opens on Journey, with its pen and not the pen of Notes');
      await go('/me');
      await penPost.waitFor();
      await eventually(() => penNote.count(), (n) => n === 0, { what: 'the number of "Write a note" pens on Journey' });
      await eventually(() => page.getByText('Notes stay on this phone.', { exact: true }).count(), (n) => n === 0, { what: 'the number of Notes feeds while Journey is on' });
      step('the four labels sit in one row, left to right: Notes, Journey, Plan, Health');
      const row = [];
      for (const t of NAMES) row.push(await box(label(t), `the ${t} label`));
      for (let i = 1; i < row.length; i++) {
        assert(row[i].x > row[i - 1].x + row[i - 1].width - 1, `${NAMES[i]} is to the right of ${NAMES[i - 1]}`);
        assert(Math.abs(row[i].y - row[0].y) < 2, `${NAMES[i]} is on the row of ${NAMES[0]}`);
      }
      step('at 320 px wide the four labels are still one row, each on one line, inside the screen and clear of each other');
      await page.setViewportSize({ width: 320, height: 700 });
      await domQuiet(page, 400);
      const narrow = [];
      for (const t of NAMES) narrow.push(await box(label(t), `the ${t} label at 320`));
      narrow.forEach((b, i) => {
        assert(b.height < 30, `${NAMES[i]} is one line at 320 (its box is ${Math.round(b.height)} high)`);
        assert(b.x >= 0 && b.x + b.width <= 320, `${NAMES[i]} is inside the 320 px screen: ${JSON.stringify(b)}`);
        if (i > 0) assert(b.x >= narrow[i - 1].x + narrow[i - 1].width - 1 && Math.abs(b.y - narrow[0].y) < 2, `${NAMES[i]} does not touch ${NAMES[i - 1]} and is on the same row`);
      });
      for (const t of NAMES) {
        const clipped = await label(t).evaluate((el) => el.scrollWidth > el.clientWidth + 1);
        assert(!clipped, `${t} is clipped at 320`);
      }
    },
  },
  {
    name: 'Me: Notes is the first sub-tab and shows the feed with one gold pen, "Write a note", that opens /diary/new and writes a note that is in the feed after Back; Plan and Health have no pen; Journey has its own',
    persona: 'in',
    async run(ctx) {
      const { page, step, go } = ctx;
      const label = (t) => page.getByText(t, { exact: true }).filter({ visible: true }).first();
      const penNote = page.getByRole('button', { name: 'Write a note', exact: true });
      const penPost = page.getByRole('button', { name: 'Write a journey post', exact: true });
      const pens = async () => [await penNote.count(), await penPost.count()].join('+');
      step('open Me and choose Notes');
      await go('/me');
      await penPost.waitFor();
      await label('Notes').click();
      step('the feed is there ("Notes stay on this phone."), with ONE pen: the note pen, and not the journey pen');
      await page.getByText('Notes stay on this phone.', { exact: true }).waitFor();
      await penNote.waitFor();
      await eventually(pens, (v) => v === '1+0', { what: 'the pens on Notes (note + journey)' });
      await page.getByText('No notes yet', { exact: true }).waitFor();
      await eventually(() => page.getByText(/You are offline|Could not load your data/).count(), (n) => n === 0, { what: 'the messages about Me\'s data over the notes' });
      step('Plan and Health have no pen at all');
      await label('Plan').click();
      await eventually(pens, (v) => v === '0+0', { what: 'the pens on Plan' });
      await label('Health').click();
      await eventually(pens, (v) => v === '0+0', { what: 'the pens on Health' });
      step('Journey has its own pen again, and not the note pen');
      await label('Journey').click();
      await penPost.waitFor();
      await eventually(pens, (v) => v === '0+1', { what: 'the pens on Journey' });
      step('back on Notes, the pen opens a blank page, and what is written there is in the feed after Back');
      await label('Notes').click();
      await penNote.click();
      await waitPath(page, '/diary/new', 'the address after the pen');
      await page.getByRole('textbox', { name: 'Page text' }).fill('Walked to Hontanas, wind in my face.');
      await back(ctx);
      await waitPath(page, '/me', 'the address after Back');
      await page.getByText('Walked to Hontanas, wind in my face.').filter({ visible: true }).first().waitFor();
      await eventually(() => page.getByText('No notes yet', { exact: true }).filter({ visible: true }).count(), (n) => n === 0, { what: 'the number of "No notes yet" once a note is written' });
      await eventually(pens, (v) => v === '1+0', { what: 'the pens on Notes after the note' });
    },
  },
  {
    name: 'Library: the three choices at the bottom of Bible (Old Testament, Deuterocanon, New Testament) list that part, and exist on Bible only, never while searching',
    persona: 'in',
    async run({ page, step, go }) {
      const group = page.getByRole('radiogroup', { name: 'Part of the Bible' });
      const radio = (name) => page.getByRole('radio', { name, exact: true });
      const strip = (label) => page.getByText(label, { exact: true }).filter({ visible: true }).first();
      const shown = (text) => page.getByText(text, { exact: true }).filter({ visible: true });
      const checked = (name) => radio(name).getAttribute('aria-checked');
      step('open Library: the Bible tab has three choices, the Old Testament chosen');
      await go('/library');
      await group.waitFor();
      await eventually(() => page.getByRole('radio').allInnerTexts().then((all) => all.map((t) => t.replace(/\s+/g, ' ').trim()).join('|')), (t) => t === 'Old Testament|Deuterocanon|New Testament', { what: 'the three choices, in order' });
      await eventually(() => checked('Old Testament'), (v) => v === 'true', { what: 'the Old Testament is chosen at first' });
      await shown('39 books').first().waitFor();
      await shown('Genesis').first().waitFor();
      await shown('Malachi').first().waitFor();
      step('they float between the list and the tab bar, clear of both, and every choice is at least 44 high');
      const bar = await group.boundingBox();
      const tabs = await page.getByRole('tab').first().boundingBox();
      assert(bar && tabs && bar.y + bar.height <= tabs.y, `the choices (bottom ${bar && bar.y + bar.height}) are above the tab bar (top ${tabs && tabs.y})`);
      for (const name of ['Old Testament', 'Deuterocanon', 'New Testament']) { const b = await radio(name).boundingBox(); assert(b && b.height >= 44 && b.width >= 44, `${name} is a touch target of at least 44`); }
      step('choose Deuterocanon: seven books and two added passages, and the note about the Orthodox Bibles');
      await radio('Deuterocanon').click();
      await shown('7 books and 2 added passages').first().waitFor();
      await shown('Tobit').first().waitFor();
      await shown('Additions to Daniel').first().waitFor();
      await shown('Orthodox Bibles include a few more books.').first().waitFor();
      await eventually(() => checked('Deuterocanon'), (v) => v === 'true', { what: 'Deuterocanon is chosen' });
      await eventually(() => checked('Old Testament'), (v) => v === 'false', { what: 'the Old Testament is not chosen any more' });
      await eventually(() => shown('Genesis').count(), (n) => n === 0, { what: 'the number of Genesis rows once the Deuterocanon is chosen' });
      step('choose New Testament: 27 books, Matthew to Revelation');
      await radio('New Testament').click();
      await shown('27 books').first().waitFor();
      await shown('Matthew').first().waitFor();
      await shown('Revelation').first().waitFor();
      await eventually(() => shown('Orthodox Bibles include a few more books.').count(), (n) => n === 0, { what: 'the number of Orthodox notes on the New Testament' });
      step('the choices follow nothing but their own tab: gone on Books, back on Bible with the choice kept');
      await strip('Books').click();
      await page.getByText('Twelve free companions for the road', { exact: true }).waitFor();
      await eventually(() => page.getByRole('radio').count(), (n) => n === 0, { what: 'the number of choices on Books' });
      await strip('Bible').click();
      await group.waitFor();
      await eventually(() => checked('New Testament'), (v) => v === 'true', { what: 'the choice made before is still the choice' });
      step('while something is typed in the search field the choices are gone, and Clear search brings them back');
      await page.getByRole('textbox', { name: 'Search the library' }).fill('john');
      await page.getByText('5 results for “john”', { exact: true }).waitFor();
      await eventually(() => page.getByRole('radio').count(), (n) => n === 0, { what: 'the number of choices while searching' });
      await page.getByRole('textbox', { name: 'Search the library' }).fill('');
      await group.waitFor();
    },
  },
  {
    name: 'Library: the banner of the Bible tab opens /library/daily, the whole banner and the "Read today" button alike',
    persona: 'in',
    async run({ page, step, go }) {
      step('open Library');
      await go('/library');
      step('tap the title of the banner (not the button)');
      await page.getByText("Today's reading and a short reflection", { exact: true }).click();
      await waitPath(page, '/library/daily', 'the address after tapping the banner');
      step('go back, and tap the "Read today" button');
      await page.goBack();
      await waitPath(page, '/library', 'the address after going back');
      await page.getByText('Read today', { exact: true }).click();
      await waitPath(page, '/library/daily', 'the address after tapping the button');
    },
  },
  {
    name: 'Library: the top row is a search field and the Bookmarks button, and no diary button or diary card; Help sends the diary to the Notes tab of Me',
    persona: 'in',
    async run(ctx) {
      const { page, step, go } = ctx;
      step('open Library');
      await go('/library');
      await page.getByRole('textbox', { name: 'Search the library' }).waitFor();
      await page.getByRole('button', { name: 'Bookmarks', exact: true }).waitFor();
      step('there is no diary button, and nothing on the screen has the text "My diary"');
      await eventually(() => page.getByRole('button', { name: /diary/i }).count(), (n) => n === 0, { what: 'the number of diary buttons on Library' });
      await eventually(() => page.getByText('My diary', { exact: true }).count(), (n) => n === 0, { what: 'the number of "My diary" texts on Library' });
      step('Help says where the diary is');
      await go('/help');
      await page.getByRole('button', { name: 'Where are my diary pages kept?', exact: true }).click();
      await page.getByText(/Open Me and tap the Notes tab: your diary lives there\./).waitFor();
    },
  },
  {
    name: 'Library search: Bible and Books at once, grouped, a calm "nothing found", and Clear search brings the tabs and the banner back',
    persona: 'in',
    async run({ page, step, go }) {
      step('open Library');
      await go('/library');
      const field = page.getByRole('textbox', { name: 'Search the library' });
      step('type "john": the four books of John in the Bible, the book by John of the Cross');
      await field.fill('john');
      await page.getByText('5 results for “john”', { exact: true }).waitFor();
      await page.getByText('Bible · 4', { exact: true }).waitFor();
      await page.getByText('Books · 1', { exact: true }).waitFor();
      await page.getByText('1 John', { exact: true }).waitFor();
      await page.getByText('Dark Night of the Soul', { exact: true }).waitFor();
      step('the tabs and the banner give way to the results');
      await eventually(() => page.getByText("Today's reading and a short reflection", { exact: true }).count(), (n) => n === 0, { what: 'the number of banners while searching' });
      step('type something in the Deuterocanon, then an author');
      await field.fill('maccabees');
      await page.getByText('2 results for “maccabees”', { exact: true }).waitFor();
      await field.fill('Ávila');
      await page.getByText('2 results for “Ávila”', { exact: true }).waitFor();
      await page.getByText('The Interior Castle', { exact: true }).waitFor();
      step('type something that is nowhere');
      await field.fill('zzz');
      await page.getByText('Nothing found for “zzz”', { exact: true }).waitFor();
      step('tap Clear search');
      await page.getByRole('button', { name: 'Clear search', exact: true }).first().click();
      await page.getByText("Today's reading and a short reflection", { exact: true }).waitFor();
      await page.getByRole('radiogroup', { name: 'Part of the Bible' }).waitFor();
    },
  },
  {
    name: 'Library: the Bookmarks button opens Bookmarks (Back, no tab bar) with the bookmarked rows of Bible and Books and the post, and Back returns to Library',
    persona: 'in',
    async run(ctx) {
      const { page, step, go } = ctx;
      const shown = (text) => page.getByText(text, { exact: true }).filter({ visible: true }).first(); // Library stays mounted under Bookmarks
      step('open Library');
      await go('/library');
      step('bookmark a book of the Bible and a book of the Books tab');
      await page.getByRole('button', { name: 'Bookmark: Genesis', exact: true }).click();
      await page.getByRole('button', { name: 'Remove bookmark: Genesis', exact: true }).waitFor();
      await page.getByText('Books', { exact: true }).filter({ visible: true }).first().click();
      await page.getByRole('button', { name: 'Bookmark: Confessions', exact: true }).click();
      await page.getByRole('button', { name: 'Remove bookmark: Confessions', exact: true }).waitFor();
      step('tap the Bookmarks button');
      await page.getByRole('button', { name: 'Bookmarks', exact: true }).click();
      await waitPath(page, '/library/bookmarks', 'the address after the Bookmarks button');
      await page.getByRole('heading', { name: 'Bookmarks', exact: true }).waitFor();
      step('the rows, grouped by tab, and the bookmarked post are listed');
      await shown('Bible · 1').waitFor();
      await shown('Books · 1').waitFor();
      await shown('Genesis').waitFor();
      await shown('Confessions').waitFor();
      await page.getByText(/Sunrise over the meseta/).filter({ visible: true }).first().waitFor();
      await eventually(() => page.getByRole('tab').count(), (n) => n === 0, { what: 'the number of tabs shown on Bookmarks (there is no tab bar there)' });
      await back(ctx);
      await waitPath(page, '/library', 'the address after Back');
    },
  },
  {
    name: 'Library: bookmarks kept before the tabs changed (a Music row, an old example row, a Notes key) are ignored without an error, and the rest still shows',
    persona: 'in',
    async run({ page, step, go }) {
      const key = `kv:u.${UID}.library.bookmarks`;
      const save = (keys) => page.evaluate(([k, list]) => localStorage.setItem(k, JSON.stringify({ v: 1, items: list.map((name, i) => ({ key: name, at: 100 - i })) })), [key, keys]);
      step('open Library once, so that the app has made its own keys');
      await go('/library');
      step('keep only old marks on the phone: a Music row, an example Bible shelf, an example cover, two Notes keys, and open Bookmarks');
      await save(['music:morning', 'music:sing', 'bible:psalms', 'books:guide', 'notes:2f6c1a', 'notes:']);
      await go('/library/bookmarks');
      await page.getByRole('heading', { name: 'Bookmarks', exact: true }).waitFor();
      await page.getByText('Nothing bookmarked in the Library yet. Tap the bookmark on a row to keep it here.', { exact: true }).waitFor();
      for (const gone of ['Chants for the road', 'Morning walk', 'Psalms for walking', 'Guide to the Way']) await eventually(() => page.getByText(gone, { exact: true }).count(), (n) => n === 0, { what: `the number of "${gone}" rows` });
      step('add a current mark next to them: it shows, and the old ones still do not');
      await save(['music:morning', 'notes:2f6c1a', 'books:confessions', 'bible:psalms', 'bible:bible-job']);
      await go('/library/bookmarks');
      await page.getByText('Bible · 1', { exact: true }).waitFor();
      await page.getByText('Books · 1', { exact: true }).waitFor();
      await page.getByText('Job', { exact: true }).waitFor();
      await page.getByText('Confessions', { exact: true }).waitFor();
      await eventually(() => page.getByText('Morning walk', { exact: true }).count(), (n) => n === 0, { what: 'the number of Music rows' });
    },
  },
  {
    name: 'Stays: the stays of the stage are listed, and one opens with its details',
    persona: 'in',
    async run({ page, step, go }) {
      step('open Stays');
      await go('/stays');
      step('look for a stay of stage 1');
      const shown = (text) => page.getByText(text, { exact: true }).filter({ visible: true }).first(); // the list stays mounted under the stay page
      await shown('Albergue Zz Orisson').waitFor();
      await shown('Albergue Zz Parroquial').waitFor();
      step('open the first one');
      await shown('Albergue Zz Orisson').click();
      await eventually(() => pathOf(page), (p) => p.startsWith('/stay/5e0d0000-'), { what: 'the address after tapping a stay' });
      await shown('Albergue Zz Orisson').waitFor();
      await page.getByText(/^Details$/i).filter({ visible: true }).first().waitFor();
    },
  },
  {
    name: 'Log out: Settings, the round log-out button, and the app is back on Welcome',
    persona: 'in',
    async run(ctx) {
      const { page, step } = ctx;
      await openSettings(ctx);
      step('tap the log-out button and confirm');
      page.once('dialog', (dialog) => dialog.accept()); // the web build asks with window.confirm
      await page.getByRole('button', { name: 'Log out', exact: true }).click();
      await waitPath(page, '/welcome', 'where the app lands after logging out');
      await page.getByText(/Buen Camino/).first().waitFor();
    },
  },
  {
    name: 'Launch: signed out lands on Welcome',
    persona: 'out',
    async run({ page, step, go }) {
      step('open the app');
      await go('/');
      await waitPath(page, '/welcome', 'where the app lands');
    },
  },
  {
    name: 'Launch: signed in without a journey lands on Onboarding',
    persona: 'new',
    async run({ page, step, go }) {
      step('open the app');
      await go('/');
      await waitPath(page, '/onboarding', 'where the app lands');
    },
  },
  {
    name: 'Launch: signed in with a journey lands on Me',
    persona: 'in',
    async run({ page, step, go }) {
      step('open the app');
      await go('/');
      await waitPath(page, '/me', 'where the app lands');
    },
  },
  {
    name: 'Offline: with the account saved on the phone, the app opens on Me and says it is offline',
    persona: 'in',
    offline: true,
    async run({ page, step, go }) {
      step('open the app with no signal');
      await go('/');
      await waitPath(page, '/me', 'where the app lands');
      await page.getByText(/You are offline/).first().waitFor();
    },
  },
  {
    name: 'Online with a login that has expired: it is renewed and the app opens on Me',
    persona: 'in',
    expiredLogin: true,
    savedAccount: false,
    schemes: ['light'],
    async run({ page, step, go }) {
      step('open the app with an expired login');
      await go('/');
      await eventually(() => pathOf(page), (p) => p === '/me', { what: 'where the app lands', timeout: 15_000 });
    },
  },
  {
    name: 'Offline with a login that has expired: the account saved on the phone still opens',
    persona: 'in',
    offline: true,
    expiredLogin: true,
    schemes: ['light'],
    async run({ page, step, go }) {
      step('open the app with no signal and an expired login');
      await go('/');
      await eventually(() => pathOf(page), (p) => p === '/me', { what: 'where the app lands (it must not wait for the network)', timeout: 15_000 });
    },
  },
  {
    name: 'Offline with an expired login and nothing saved: "No signal right now", not a crash',
    persona: 'in',
    offline: true,
    expiredLogin: true,
    savedAccount: false,
    schemes: ['light'],
    async run({ page, step, go }) {
      step('open the app with no signal, an expired login and nothing saved');
      await go('/');
      await page.getByText('No signal right now', { exact: true }).waitFor({ timeout: 15_000 });
    },
  },
  ...DAILY_SCENARIOS,
];
