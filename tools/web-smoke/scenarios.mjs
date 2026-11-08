// Scenarios: a person using the app, step by step. Each one runs in a browser of its own, in light and in dark (unless it says
// otherwise), and everything that goes wrong in the page while it runs fails it, exactly as in the route sweep.
//
// They wait for what the person would wait for (an address, a button, a line of text), never for a fixed time.
//
// The diary screens are placeholders while the diary feature is built (mobile/app/diary, mobile/src/features/diary): the route sweep
// checks that they load without errors, and the scenarios below only check WHERE the pen goes, never what is on those screens.
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
    name: 'Library: banner, and the Bible, Books and Music tabs',
    persona: 'in',
    async run({ page, step, go }) {
      step('open Library');
      await go('/library');
      await page.getByRole('heading', { name: 'Library', exact: true }).waitFor();
      step('look for the banner');
      await page.getByText('Scripture for the long road', { exact: true }).waitFor();
      // The Bible and Music tabs are previews and say so. The Books tab is real: it says how many books are in the app, and has no Preview notice.
      const notice = { Bible: /The Bible text is not in the app yet/, Books: /\d+ books? in the app\. They are saved on this phone/, Music: /Music is not in the app yet/ };
      for (const tab of ['Bible', 'Books', 'Music']) {
        step(`tap ${tab}`);
        await page.getByText(tab, { exact: true }).last().click();
        await page.getByText(notice[tab]).first().waitFor();
      }
    },
  },
  {
    name: 'Library: the gold pen opens /diary/new',
    persona: 'in',
    async run({ page, step, go }) {
      step('open Library');
      await go('/library');
      step('tap the gold pen');
      await page.getByRole('button', { name: 'Write in your diary', exact: true }).click();
      await waitPath(page, '/diary/new', 'the address after the pen');
    },
  },
  {
    name: 'Library: no diary card; a search field, the Bookmarks button and the diary button are the top row, and the diary button opens /diary',
    persona: 'in',
    async run(ctx) {
      const { page, step, go } = ctx;
      step('open Library');
      await go('/library');
      step('look for the search field and the two round buttons');
      await page.getByRole('textbox', { name: 'Search the library' }).waitFor();
      await page.getByRole('button', { name: 'Bookmarks', exact: true }).waitFor();
      await page.getByRole('button', { name: 'My diary', exact: true }).waitFor();
      step('the diary card is gone: nothing on the screen has the text "My diary"');
      await eventually(() => page.getByText('My diary', { exact: true }).count(), (n) => n === 0, { what: 'the number of "My diary" texts on Library' });
      step('tap the diary button');
      await page.getByRole('button', { name: 'My diary', exact: true }).click();
      await waitPath(page, '/diary', 'the address after the diary button');
      await back(ctx);
      await waitPath(page, '/library', 'the address after Back');
    },
  },
  {
    name: 'Library search: all three tabs at once, grouped, a notice only while an example is in the results, a calm "nothing found", and Clear search brings the tabs back',
    persona: 'in',
    async run({ page, step, go }) {
      step('open Library');
      await go('/library');
      const field = page.getByRole('textbox', { name: 'Search the library' });
      step('type "pray"');
      await field.fill('pray');
      await page.getByText(/^\d+ results? for “pray”$/).waitFor();
      await page.getByText('Prayers for the road', { exact: true }).waitFor();
      step('a Bible row is an example: the notice says so');
      await page.getByText('The Bible results are examples. The Bible text is not in the app yet.', { exact: true }).waitFor();
      step('type something that is nowhere');
      await field.fill('zzz');
      await page.getByText('Nothing found for “zzz”', { exact: true }).waitFor();
      step('nothing found: nothing on the screen is an example, so there is no Preview notice');
      await eventually(() => page.getByText(/are examples\./).count(), (n) => n === 0, { what: 'the number of "examples" notices when nothing is found' });
      step('tap Clear search');
      await page.getByRole('button', { name: 'Clear search', exact: true }).first().click();
      await page.getByText('Scripture for the long road', { exact: true }).waitFor();
    },
  },
  {
    name: 'Library: the Bookmarks button opens Bookmarks (Back, no tab bar) with the bookmarked row and post, and Back returns to Library',
    persona: 'in',
    async run(ctx) {
      const { page, step, go } = ctx;
      const shown = (text) => page.getByText(text, { exact: true }).filter({ visible: true }).first(); // Library stays mounted under Bookmarks
      step('open Library');
      await go('/library');
      step('bookmark a row of the Bible tab');
      await page.getByRole('button', { name: 'Bookmark: The Gospels', exact: true }).click();
      await page.getByRole('button', { name: 'Remove bookmark: The Gospels', exact: true }).waitFor();
      step('tap the Bookmarks button');
      await page.getByRole('button', { name: 'Bookmarks', exact: true }).click();
      await waitPath(page, '/library/bookmarks', 'the address after the Bookmarks button');
      await page.getByRole('heading', { name: 'Bookmarks', exact: true }).waitFor();
      step('the row and the bookmarked post are listed');
      await shown('The Gospels').waitFor();
      await page.getByText(/Sunrise over the meseta/).filter({ visible: true }).first().waitFor();
      await eventually(() => page.getByRole('tab').count(), (n) => n === 0, { what: 'the number of tabs shown on Bookmarks (there is no tab bar there)' });
      await back(ctx);
      await waitPath(page, '/library', 'the address after Back');
    },
  },
  {
    name: 'Books: a cover opens its book, Start reading opens the reader, Next replaces the chapter, and Back returns to the book',
    persona: 'in',
    async run(ctx) {
      const { page, step, go } = ctx;
      step('open Library, the Books tab');
      await go('/library');
      await page.getByText('Books', { exact: true }).last().click();
      step('tap the first cover');
      const cover = page.getByRole('button', { name: /\. (Guide|Readings) · / }).first();
      await cover.waitFor();
      await cover.click();
      await eventually(() => pathOf(page), (p) => /^\/library\/book\/[a-z0-9-]+$/.test(p), { what: 'the address of the book' });
      await page.getByText('About this edition', { exact: true }).waitFor();
      const book = pathOf(page);
      step('tap Start reading');
      await page.getByRole('button', { name: /^(Start|Continue) reading$/ }).click();
      await eventually(() => pathOf(page), (p) => p.startsWith(`${book}/`) && p.length > book.length + 1, { what: 'the address of the chapter' });
      await page.getByText(/Tap a paragraph to bookmark it or add a note beside it\./).waitFor();
      const first = pathOf(page);
      step('tap Next: it replaces the chapter');
      await page.getByRole('button', { name: /^Next: / }).click();
      await eventually(() => pathOf(page), (p) => p.startsWith(`${book}/`) && p !== first, { what: 'the address of the next chapter' });
      step('tap Back: the book, not the first chapter');
      await page.getByRole('button', { name: 'Back', exact: true }).first().click();
      await waitPath(page, book, 'the address after Back');
      await page.getByRole('button', { name: /^Continue reading$/ }).waitFor();
    },
  },
  {
    name: 'Notes: a note is written beside a paragraph, it shows its mark and is in the Notebook (from Bookmarks) under its book, grows into a Diary page, and is deleted',
    persona: 'in',
    async run(ctx) {
      const { page, step, go } = ctx;
      step('open the first book and its first chapter');
      await go('/library');
      await page.getByText('Books', { exact: true }).last().click();
      const cover = page.getByRole('button', { name: /\. (Guide|Readings) · / }).first();
      await cover.waitFor();
      await cover.click();
      await page.getByRole('button', { name: /^Start reading$/ }).click();
      await page.getByText(/Tap a paragraph to bookmark it or add a note beside it\./).waitFor();
      step('tap a paragraph, then Add a note');
      await page.getByRole('button', { name: /^[A-Z].{80,}/ }).first().click();
      await page.getByRole('button', { name: 'Add a note', exact: true }).click();
      step('write it');
      await page.getByRole('textbox', { name: 'Your note' }).fill('Open hand, not a clenched fist.');
      await page.getByRole('button', { name: 'Save note', exact: true }).click();
      step('the paragraph shows the mark of a note, and it opens the note');
      await page.getByRole('button', { name: /^Note on this paragraph$/ }).waitFor();
      await eventually(() => page.evaluate(() => Object.keys(localStorage).filter((k) => /^kv:u\..*\.notes$/.test(k)).length), (n) => n === 1, { what: 'the notes saved on the phone, under a u.<id>. key' });
      step('open the Notebook from Bookmarks');
      await go('/library/bookmarks');
      await page.getByRole('button', { name: 'Notebook', exact: true }).click();
      await waitPath(page, '/library/notes', 'the address after the Notebook button');
      await page.getByRole('heading', { name: 'Notebook', exact: true }).waitFor();
      await page.getByText(/^Only on this phone\. Notes are not uploaded and not shared\./).waitFor();
      await page.getByText('Open hand, not a clenched fist.').first().waitFor();
      step('grow the note into a Diary page: the page opens with the words, and Back returns to the Notebook');
      await page.getByRole('button', { name: /^Open hand, not a clenched fist\./ }).first().click();
      await page.getByRole('button', { name: 'Grow into a Diary page', exact: true }).click();
      await eventually(() => pathOf(page), (p) => /^\/diary\/[0-9a-f-]{36}$/.test(p), { what: 'the address of the new Diary page' });
      await page.getByText('Open hand, not a clenched fist.').first().waitFor();
      await page.getByRole('button', { name: 'Back', exact: true }).first().click();
      await waitPath(page, '/library/notes', 'the address after Back from the Diary page');
      step('open the note and delete it');
      await page.getByRole('button', { name: /^Open hand, not a clenched fist\./ }).first().click();
      page.once('dialog', (d) => d.accept());
      await page.getByRole('button', { name: 'Delete', exact: true }).click();
      await page.getByText('No notes yet', { exact: true }).waitFor();
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
];
