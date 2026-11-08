// Scenarios: a person using the app, step by step. Each one runs in a browser of its own, in light and in dark (unless it says
// otherwise), and everything that goes wrong in the page while it runs fails it, exactly as in the route sweep.
//
// They wait for what the person would wait for (an address, a button, a line of text), never for a fixed time.
//
// The diary screens and the Notes tab (mobile/app/diary, mobile/src/features/diary, mobile/src/features/library/notes) belong to the diary: the
// route sweep checks that they load without errors, and the Library scenarios below only check WHERE the pen goes and that Notes has no banner,
// never what is in the notes. The daily reading (/library/daily) is the same: the scenarios check that the banner leads there, not what is on it.
// The Bible side of the Library (the grid of books, the chapters, the reader, the search of verses, Continue reading) is in bible.scenarios.mjs.
import assert from 'node:assert/strict';
import { UID } from './fixtures.mjs';
import { domQuiet, eventually, pathOf } from './harness.mjs';
import { BIBLE_SCENARIOS } from './bible.scenarios.mjs';

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
    name: 'Library: the tabs Bible, Books and Notes sit directly under the search row, before the banner; Bible and Books each have a banner, Books has a notice and Bible none (its text is real), Notes has neither',
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
      step('the tabs come directly under that row, in the order Bible, Books, Notes, and the banner comes after them');
      const [bible, books, notes] = [await box(strip('Bible'), 'the Bible tab'), await box(strip('Books'), 'the Books tab'), await box(strip('Notes'), 'the Notes tab')];
      assert(bible.x < books.x && books.x < notes.x, 'Bible, Books, Notes from left to right');
      assert(Math.abs(bible.y - books.y) < 2 && Math.abs(books.y - notes.y) < 2, 'the three tabs are one row');
      assert(bible.y > search.y + search.height, 'the tabs are under the search row');
      const title = await box(page.getByText('Daily reading', { exact: true }), 'the title of the Bible banner');
      assert(title.y > bible.y + bible.height, 'the banner is under the tabs, not above them');
      step('Bible: the banner (today\'s date, title, a handwritten note, a gold button), no Preview notice, and the one quiet line that says which translation it is');
      await page.getByText(/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday) \d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December)$/i).waitFor();
      await page.getByRole('button', { name: /^Read today/ }).waitFor();
      await page.getByText('World English Bible, Catholic edition · public domain', { exact: true }).waitFor();
      await eventually(() => page.getByText('Preview', { exact: true }).count(), (n) => n === 0, { what: 'the number of Preview notices on the Bible tab' });
      await eventually(() => page.getByText(/The Bible text is not in the app yet/).count(), (n) => n === 0, { what: 'the number of "not in the app yet" lines on the Bible tab' });
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
      step('Notes: the search row and the tabs stay exactly where they were, and there is no banner and no notice');
      await strip('Notes').click();
      await page.getByRole('button', { name: 'Write a note', exact: true }).waitFor();
      const [search2, bible2, books2, notes2] = [await box(page.getByRole('textbox', { name: 'Search the library' }), 'the search field on Notes'), await box(strip('Bible'), 'the Bible tab on Notes'), await box(strip('Books'), 'the Books tab on Notes'), await box(strip('Notes'), 'the Notes tab on Notes')];
      for (const [what, before, now] of [['the search field', search, search2], ['the Bible tab', bible, bible2], ['the Books tab', books, books2], ['the Notes tab', notes, notes2]]) {
        assert(Math.abs(before.x - now.x) < 1.5 && Math.abs(before.y - now.y) < 1.5 && Math.abs(before.width - now.width) < 1.5, `${what} moved when Notes was chosen: ${JSON.stringify(before)} -> ${JSON.stringify(now)}`);
      }
      for (const gone of ['Daily reading', 'Twelve free companions for the road', 'Preview']) {
        await eventually(() => page.getByText(gone, { exact: true }).filter({ visible: true }).count(), (n) => n === 0, { what: `the number of "${gone}" texts on Notes` });
      }
    },
  },
  {
    name: 'Library: the gold pen shows only on Notes, is labelled "Write a note", and opens /diary/new',
    persona: 'in',
    async run({ page, step, go }) {
      const pen = page.getByRole('button', { name: 'Write a note', exact: true });
      const strip = (label) => page.getByText(label, { exact: true }).filter({ visible: true }).first();
      step('open Library: Bible and Books have no pen');
      await go('/library');
      await page.getByText('Daily reading', { exact: true }).first().waitFor();
      await eventually(() => pen.count(), (n) => n === 0, { what: 'the number of pens on Bible' });
      await strip('Books').click();
      await page.getByText('Twelve free companions for the road', { exact: true }).waitFor();
      await eventually(() => pen.count(), (n) => n === 0, { what: 'the number of pens on Books' });
      step('Notes has it');
      await strip('Notes').click();
      await pen.waitFor();
      step('tap the gold pen');
      await pen.click();
      await waitPath(page, '/diary/new', 'the address after the pen');
    },
  },
  {
    name: 'Library: the banner of the Bible tab opens /library/daily, the whole banner and the "Read today" button alike',
    persona: 'in',
    async run({ page, step, go }) {
      step('open Library');
      await go('/library');
      step('tap the title of the banner (not the button)');
      await page.getByText('Daily reading', { exact: true }).first().click();
      await waitPath(page, '/library/daily', 'the address after tapping the banner');
      step('go back, and tap the "Read today" button');
      await page.goBack();
      await waitPath(page, '/library', 'the address after going back');
      await page.getByText('Read today', { exact: true }).click();
      await waitPath(page, '/library/daily', 'the address after tapping the button');
    },
  },
  {
    name: 'Library: the top row is a search field and the Bookmarks button, and no diary button or diary card; Help sends the diary to the Notes tab',
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
      await page.getByText(/Open Library and tap the Notes tab: your diary lives there\./).waitFor();
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
      await page.getByText('Bible · 4', { exact: true }).waitFor();
      await page.getByText('Books · 1', { exact: true }).waitFor();
      await page.getByRole('button', { name: /^1 John, / }).waitFor();
      await page.getByText('Dark Night of the Soul', { exact: true }).waitFor();
      step('the tabs and the banner give way to the results');
      await eventually(() => page.getByText('Daily reading', { exact: true }).count(), (n) => n === 0, { what: 'the number of banners while searching' });
      await page.getByText('The twelve books are examples: they are not in the app yet. The Bible text is.', { exact: true }).waitFor();
      step('type something in the Deuterocanon, then an author');
      await field.fill('maccabees');
      await page.getByText('2 results for “maccabees”', { exact: true }).waitFor();
      step('a book that has its own line is found by it: Susanna is in Daniel');
      await field.fill('susanna');
      await page.getByText('Bible · 1', { exact: true }).waitFor();
      await page.getByRole('button', { name: /^Daniel, / }).waitFor();
      await field.fill('Ávila');
      await page.getByText('2 results for “Ávila”', { exact: true }).waitFor();
      await page.getByText('The Interior Castle', { exact: true }).waitFor();
      step('type something that is nowhere');
      await field.fill('zzz');
      await page.getByText('Nothing found for “zzz”', { exact: true }).waitFor();
      step('tap Clear search');
      await page.getByRole('button', { name: 'Clear search', exact: true }).first().click();
      await page.getByText('Daily reading', { exact: true }).first().waitFor();
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
      step('open Genesis from its tile and bookmark the book (the tile has no bookmark: the book has it on its own screen)');
      await page.getByRole('button', { name: 'Genesis, 50 chapters', exact: true }).click();
      await waitPath(page, '/library/bible/GEN', 'the address after tapping the Genesis tile');
      await page.getByRole('button', { name: 'Bookmark: Genesis', exact: true }).click();
      await page.getByRole('button', { name: 'Remove bookmark: Genesis', exact: true }).waitFor();
      await back(ctx);
      await waitPath(page, '/library', 'the address after Back from the chapters of Genesis');
      step('bookmark a book of the Books tab');
      await page.getByText('Books', { exact: true }).filter({ visible: true }).first().click();
      await page.getByRole('button', { name: 'Bookmark: Confessions', exact: true }).click();
      await page.getByRole('button', { name: 'Remove bookmark: Confessions', exact: true }).waitFor();
      step('tap the Bookmarks button');
      await page.getByRole('button', { name: 'Bookmarks', exact: true }).click();
      await waitPath(page, '/library/bookmarks', 'the address after the Bookmarks button');
      await page.getByRole('heading', { name: 'Bookmarks', exact: true }).waitFor();
      step('the rows, grouped by tab, and the bookmarked post are listed; the book of the Bible is a row that opens its chapters');
      await shown('Bible · 1').waitFor();
      await shown('Books · 1').waitFor();
      await shown('Genesis').waitFor();
      await shown('Confessions').waitFor();
      await page.getByText(/Sunrise over the meseta/).filter({ visible: true }).first().waitFor();
      await eventually(() => page.getByRole('tab').count(), (n) => n === 0, { what: 'the number of tabs shown on Bookmarks (there is no tab bar there)' });
      await page.getByRole('button', { name: /^Genesis, Old Testament/ }).click();
      await waitPath(page, '/library/bible/GEN', 'the address after tapping the bookmarked book');
      await page.getByRole('button', { name: 'Remove bookmark: Genesis', exact: true }).waitFor();
      await back(ctx);
      await waitPath(page, '/library/bookmarks', 'the address after Back from the chapters');
      await back(ctx);
      await waitPath(page, '/library', 'the address after Back');
    },
  },
  {
    name: 'Library: bookmarks kept before the tabs changed (a Music row, an old example row), under the two rows taken out of the Bible list, or for a verse that is not in the text are ignored without an error, and the rest still shows',
    persona: 'in',
    async run({ page, step, go }) {
      const key = `kv:u.${UID}.library.bookmarks`;
      const save = (keys) => page.evaluate(([k, list]) => localStorage.setItem(k, JSON.stringify({ v: 1, items: list.map((name, i) => ({ key: name, at: 100 - i })) })), [key, keys]);
      step('open Library once, so that the app has made its own keys');
      await go('/library');
      step('keep only old marks on the phone: a Music row, an example Bible shelf, an example cover, and open Bookmarks');
      await save(['music:morning', 'music:sing', 'bible:psalms', 'books:guide', 'bible:bible-additions-to-esther', 'bible:bible-additions-to-daniel', 'bible:PSA.999.1', 'bible:PSA.121.99', 'bible:XXX.1.1', 'bible:SIR.11.15-16', 'bible:PSA.0.1']);
      await go('/library/bookmarks');
      await page.getByRole('heading', { name: 'Bookmarks', exact: true }).waitFor();
      await page.getByText('Nothing bookmarked in the Library yet. Tap the bookmark on a row to keep it here.', { exact: true }).waitFor();
      for (const gone of ['Chants for the road', 'Morning walk', 'Psalms for walking', 'Guide to the Way']) await eventually(() => page.getByText(gone, { exact: true }).count(), (n) => n === 0, { what: `the number of "${gone}" rows` });
      step('add a current mark next to them: it shows, and the old ones still do not');
      await save(['music:morning', 'bible:bible-additions-to-daniel', 'books:confessions', 'bible:psalms', 'bible:bible-job', 'bible:PSA.121.3', 'bible:PSA.999.1']);
      await go('/library/bookmarks');
      await page.getByText('Bible · 1', { exact: true }).waitFor();
      await page.getByText('Books · 1', { exact: true }).waitFor();
      await page.getByText('Verses · 1', { exact: true }).waitFor();
      await page.getByText('Job', { exact: true }).waitFor();
      await page.getByText('Confessions', { exact: true }).waitFor();
      await page.getByText('Psalm 121:3', { exact: true }).first().waitFor();
      await eventually(() => page.getByText('Morning walk', { exact: true }).count(), (n) => n === 0, { what: 'the number of Music rows' });
      await eventually(() => page.getByText(/Additions to/).count(), (n) => n === 0, { what: 'the number of rows of the added passages that were taken out' });
    },
  },
  ...BIBLE_SCENARIOS,
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
];
