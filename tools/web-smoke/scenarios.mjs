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
      const notice = { Bible: /The Bible text is not in the app yet/, Books: /Books are not in the app yet/, Music: /Music is not in the app yet/ };
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
