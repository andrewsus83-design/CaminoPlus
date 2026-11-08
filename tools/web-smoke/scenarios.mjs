// Scenarios: a person using the app, step by step. Each one runs in a browser of its own, in light and in dark (unless it says
// otherwise), and everything that goes wrong in the page while it runs fails it, exactly as in the route sweep.
//
// They wait for what the person would wait for (an address, a button, a line of text), never for a fixed time.
//
// The diary screens and the Notes feed (mobile/app/diary, mobile/src/features/diary, mobile/src/features/notes) belong to the diary: the route
// sweep checks that they load without errors, and the Me scenarios below only check that Notes is the first sub-tab, that its feed starts with ONE card, WHERE
// that card goes (and that there are no filter tabs) and that one note written there shows up in the feed, never what the notes look like. The header of Me, the
// chat button, and the card that writes a journey post are in me.scenarios.mjs. The daily reading (/library/daily) has its own scenarios, in
// daily.scenarios.mjs (the header, the week strip, the calendar sheet, the bookmark, the date of the address); the Library scenarios below only
// check that the banner leads there.
// The Bible side of the Library (the grid of books, the chapters, the reader, the search of verses) is in bible.scenarios.mjs, the Books side (the covers, the book page, the
// reader of a book) in books.scenarios.mjs, and the Continue reading bar that floats above the tab bar of the Library (one bar for the Bible and the books, with a close
// button) in continue.scenarios.mjs.
import assert from 'node:assert/strict';
import { DAILY_SCENARIOS } from './daily.scenarios.mjs';
import { UID } from './fixtures.mjs';
import { domQuiet, eventually, pathOf } from './harness.mjs';
import { BIBLE_SCENARIOS } from './bible.scenarios.mjs';
import { BOOKS_SCENARIOS, CATALOG, COVER_LABEL } from './books.scenarios.mjs';
import { CONTINUE_SCENARIOS } from './continue.scenarios.mjs';
import { ME_SCENARIOS } from './me.scenarios.mjs';

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
    name: 'Library: the tabs Bible and Books sit directly under the search row, before the banner; each has a banner; neither has a notice (the Bible text is real, and so is every book); there is no Notes tab and no gold pen',
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
      const title = await box(page.getByText('Daily reading', { exact: true }), 'the title of the Bible banner');
      assert(title.y > bible.y + bible.height, 'the banner is under the tabs, not above them');
      step('there are exactly two tabs: no Notes tab, and no gold pen (writing is on Me)');
      await eventually(() => page.getByText('Notes', { exact: true }).filter({ visible: true }).count(), (n) => n === 0, { what: 'the number of "Notes" labels on Library' });
      await eventually(() => page.getByRole('button', { name: /^Write a (note|journey post)$/ }).count(), (n) => n === 0, { what: 'the number of gold pens on Library' });
      step('Bible: the banner (today\'s date, title, a handwritten note, a gold button), no Preview notice, and the one quiet line that says which translation it is');
      await page.getByText(/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday) \d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December)$/i).waitFor();
      await page.getByRole('button', { name: /^Read today/ }).waitFor();
      await page.getByText('World English Bible, Catholic edition · public domain', { exact: true }).waitFor();
      await eventually(() => page.getByText('Preview', { exact: true }).count(), (n) => n === 0, { what: 'the number of Preview notices on the Bible tab' });
      await eventually(() => page.getByText(/The Bible text is not in the app yet/).count(), (n) => n === 0, { what: 'the number of "not in the app yet" lines on the Bible tab' });
      step('Books: its own compact banner, a cover for every book of the bundle (each one button: title, kind, time); the banner and the covers are checked in books.scenarios.mjs');
      await strip('Books').click();
      await page.getByText('Books for the road', { exact: true }).waitFor();
      await eventually(() => page.getByRole('button', { name: COVER_LABEL }).count(), (n) => n === CATALOG.length, { what: 'the number of covers on Books' });
      await eventually(() => page.getByRole('button', { name: /^Read today/ }).count(), (n) => n === 0, { what: 'the number of "Read today" buttons on Books' });
      await page.getByRole('button', { name: new RegExp(`^${CATALOG[0].title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}, `) }).waitFor();
      step('Books: what is only data (rights, links, the id of a source) is nowhere on the screen');
      const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
      assert(!/gutenberg|ai_disclosure|route_slug/i.test(text), `the Books tab shows data that is not meant for the screen: ${text.slice(0, 200)}`);
      await eventually(() => page.getByRole('button', { name: /^Write a (note|journey post)$/ }).count(), (n) => n === 0, { what: 'the number of gold pens on Books' });
    },
  },
  {
    name: 'Me: the strip is Notes, Journey, Plan, Health in that order and Me opens on Journey, with its card "Write a journey post" and not the card of Notes; at 320 px wide the four labels are one row, each on one line',
    persona: 'in',
    async run({ page, step, go }) {
      const label = (t) => page.getByText(t, { exact: true }).filter({ visible: true }).first();
      const box = async (locator, what) => { const b = await locator.boundingBox(); if (!b) throw new Error(`${what} has no box (it is not on the screen)`); return b; };
      const NAMES = ['Notes', 'Journey', 'Plan', 'Health'];
      const cardNote = page.getByRole('button', { name: 'Write a note', exact: true });
      const cardPost = page.getByRole('button', { name: 'Write a journey post', exact: true });
      step('open Me: it opens on Journey, with the card of the journey and not the card of Notes');
      await go('/me');
      await cardPost.waitFor();
      await eventually(() => cardNote.count(), (n) => n === 0, { what: 'the number of "Write a note" cards on Journey' });
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
    name: 'Me: Notes is the first sub-tab and its feed starts with ONE card, "Write a note", under the strip: no filter tabs (All, Photos and videos, Places), no second write button; the card opens /diary/new and writes a note that is in the feed after Back; Plan and Health have no card; Journey has its own',
    persona: 'in',
    async run(ctx) {
      const { page, step, go } = ctx;
      const label = (t) => page.getByText(t, { exact: true }).filter({ visible: true }).first();
      const box = async (locator, what) => { const b = await locator.boundingBox(); if (!b) throw new Error(`${what} has no box (it is not on the screen)`); return b; };
      const cardNote = page.getByRole('button', { name: 'Write a note', exact: true });
      const cardPost = page.getByRole('button', { name: 'Write a journey post', exact: true });
      const cards = async () => [await cardNote.count(), await cardPost.count()].join('+');
      step('open Me and choose Notes');
      await go('/me');
      await cardPost.waitFor();
      await label('Notes').click();
      step('the feed is there, and it starts with ONE card: "Write a note", a button under the strip, and not the card of the journey');
      await cardNote.waitFor();
      await eventually(cards, (v) => v === '1+0', { what: 'the cards on Notes (note + journey)' });
      await page.getByText('No notes yet', { exact: true }).waitFor();
      await eventually(() => page.getByText(/You are offline|Could not load your data/).count(), (n) => n === 0, { what: 'the messages about Me\'s data over the notes' });
      step('the card is full width, at least 64 high, right under the strip, and says under its title that the notes stay on this phone');
      const [strip, c] = [await box(label('Journey'), 'the strip'), await box(cardNote, 'the card')];
      assert(c.y > strip.y + strip.height, `the card is under the strip (${JSON.stringify({ strip, card: c })})`);
      assert(c.width >= 390 - 2 * 16 - 2, `the card is as wide as the page (${c.width})`);
      assert(c.height >= 64, `the card is at least 64 high (${c.height})`);
      assert((await cardNote.innerText()).replace(/\s+/g, ' ').trim() === 'Write a note Notes stay on this phone.', `the card says "Write a note" and, under it, "Notes stay on this phone." (${await cardNote.innerText()})`);
      await eventually(() => page.getByText('Notes stay on this phone.', { exact: true }).count(), (n) => n === 1, { what: 'the number of lines "Notes stay on this phone." (it is in the card)' });
      step('there is no filter row: no tab named All, Photos and videos or Places, and none of those words on the screen');
      for (const name of ['All', 'Photos and videos', 'Places']) {
        await eventually(() => page.getByRole('tab', { name: new RegExp(`^${name}`) }).count(), (n) => n === 0, { what: `the number of tabs named "${name}"` });
        await eventually(() => page.getByText(name, { exact: true }).filter({ visible: true }).count(), (n) => n === 0, { what: `the number of "${name}" labels on Notes` });
      }
      await eventually(() => page.getByRole('tablist').count(), (n) => n === 0, { what: 'the number of tab lists on Notes (there is no filter row)' });
      step('the empty diary has no second write button: the card is the way in');
      await eventually(() => page.getByRole('button', { name: /Write your first note|Write a new note/ }).count(), (n) => n === 0, { what: 'the number of second write buttons' });
      step('Plan and Health have no card');
      await label('Plan').click();
      await eventually(cards, (v) => v === '0+0', { what: 'the cards on Plan' });
      await label('Health').click();
      await eventually(cards, (v) => v === '0+0', { what: 'the cards on Health' });
      step('Journey has its own card again, and not the card of Notes');
      await label('Journey').click();
      await cardPost.waitFor();
      await eventually(cards, (v) => v === '0+1', { what: 'the cards on Journey' });
      step('back on Notes, the card opens a blank page, and what is written there is in the feed after Back');
      await label('Notes').click();
      await cardNote.click();
      await waitPath(page, '/diary/new', 'the address after the card');
      await page.getByRole('textbox', { name: 'Page text' }).fill('Walked to Hontanas, wind in my face.');
      await back(ctx);
      await waitPath(page, '/me', 'the address after Back');
      await page.getByText('Walked to Hontanas, wind in my face.').filter({ visible: true }).first().waitFor();
      await eventually(() => page.getByText('No notes yet', { exact: true }).filter({ visible: true }).count(), (n) => n === 0, { what: 'the number of "No notes yet" once a note is written' });
      await eventually(cards, (v) => v === '1+0', { what: 'the cards on Notes after the note: still the one card' });
    },
  },
  ...ME_SCENARIOS,
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
      step('type "psalm": the Psalms in the Bible, and the book of readings about the Psalms of Ascent');
      await field.fill('psalm');
      await page.getByText('Bible · 1', { exact: true }).waitFor();
      await page.getByText(/^Books · \d+$/).waitFor();
      await page.getByRole('button', { name: /^Psalms, / }).waitFor();
      await page.getByRole('button', { name: /^Songs for the Climb, Readings for the Way, / }).waitFor();
      step('the tabs and the banner give way to the results, and no notice about books comes with them: every book is in the app');
      await eventually(() => page.getByText('Daily reading', { exact: true }).count(), (n) => n === 0, { what: 'the number of banners while searching' });
      await eventually(() => page.getByText(/Coming soon|Books marked Soon/).count(), (n) => n === 0, { what: 'the number of notices about books in a search' });
      step('type something in the Deuterocanon, then an author');
      await field.fill('maccabees');
      await page.getByText('2 results for “maccabees”', { exact: true }).waitFor();
      step('a book that has its own line is found by it: Susanna is in Daniel');
      await field.fill('susanna');
      await page.getByText('Bible · 1', { exact: true }).waitFor();
      await page.getByRole('button', { name: /^Daniel, / }).waitFor();
      await field.fill('Ávila');
      await page.getByText(/^\d+ results? for “Ávila”$/).waitFor();
      await page.getByText('The Road to Ávila', { exact: true }).waitFor();
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
      await page.getByRole('button', { name: `Bookmark: ${CATALOG[0].title}`, exact: true }).click();
      await page.getByRole('button', { name: `Remove bookmark: ${CATALOG[0].title}`, exact: true }).waitFor();
      step('tap the Bookmarks button');
      await page.getByRole('button', { name: 'Bookmarks', exact: true }).click();
      await waitPath(page, '/library/bookmarks', 'the address after the Bookmarks button');
      await page.getByRole('heading', { name: 'Bookmarks', exact: true }).waitFor();
      step('the rows, grouped by tab, and the bookmarked post are listed; the book of the Bible is a row that opens its chapters');
      await shown('Bible · 1').waitFor();
      await shown('Books · 1').waitFor();
      await shown('Genesis').waitFor();
      await shown(CATALOG[0].title).waitFor();
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
    name: 'Library: bookmarks kept before the tabs changed (a Music row, an old example row, a Notes key), under the two rows taken out of the Bible list, or for a verse that is not in the text are ignored without an error, and the rest still shows',
    persona: 'in',
    async run({ page, step, go }) {
      const key = `kv:u.${UID}.library.bookmarks`;
      const save = (keys) => page.evaluate(([k, list]) => localStorage.setItem(k, JSON.stringify({ v: 1, items: list.map((name, i) => ({ key: name, at: 100 - i })) })), [key, keys]);
      step('open Library once, so that the app has made its own keys');
      await go('/library');
      step('keep only old marks on the phone: a Music row, an example Bible shelf, an example cover, two Notes keys, the rows taken out of the Bible list, verses that are not in the text, and open Bookmarks');
      await save(['music:morning', 'music:sing', 'bible:psalms', 'books:guide', 'notes:2f6c1a', 'notes:', 'bible:bible-additions-to-esther', 'bible:bible-additions-to-daniel', 'bible:PSA.999.1', 'bible:PSA.121.99', 'bible:XXX.1.1', 'bible:SIR.11.15-16', 'bible:PSA.0.1']);
      await go('/library/bookmarks');
      await page.getByRole('heading', { name: 'Bookmarks', exact: true }).waitFor();
      await page.getByText('Nothing bookmarked in the Library yet. Tap the bookmark on a row to keep it here.', { exact: true }).waitFor();
      for (const gone of ['Chants for the road', 'Morning walk', 'Psalms for walking', 'Guide to the Way']) await eventually(() => page.getByText(gone, { exact: true }).count(), (n) => n === 0, { what: `the number of "${gone}" rows` });
      step('add a current mark next to them: it shows, and the old ones still do not');
      await save(['music:morning', 'notes:2f6c1a', 'bible:bible-additions-to-daniel', `books:${CATALOG[0].id}`, 'bible:psalms', 'bible:bible-job', 'bible:PSA.121.3', 'bible:PSA.999.1']);
      await go('/library/bookmarks');
      await page.getByText('Bible · 1', { exact: true }).waitFor();
      await page.getByText('Books · 1', { exact: true }).waitFor();
      await page.getByText('Verses · 1', { exact: true }).waitFor();
      await page.getByText('Job', { exact: true }).waitFor();
      await page.getByText(CATALOG[0].title, { exact: true }).waitFor();
      await page.getByText('Psalm 121:3', { exact: true }).first().waitFor();
      await eventually(() => page.getByText('Morning walk', { exact: true }).count(), (n) => n === 0, { what: 'the number of Music rows' });
      await eventually(() => page.getByText(/Additions to/).count(), (n) => n === 0, { what: 'the number of rows of the added passages that were taken out' });
    },
  },
  ...BIBLE_SCENARIOS,
  ...BOOKS_SCENARIOS,
  ...CONTINUE_SCENARIOS,
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
