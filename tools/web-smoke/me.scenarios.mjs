// Scenarios of the Me tab as it is now: the header, the chat button, and the two cards that write. scenarios.mjs adds them to its own list, so they run in light
// and in dark with everything else. What a person sees and does:
//
//   the header       the top right of Me has the gear and nothing else (no bell): the inbox is the chat button at the bottom right
//   the chat button  ONE gold round button floats at the bottom right of Notes, Journey, Plan and Health, labelled "Inbox" or "Inbox, N unread" with the badge
//                    ("99+" above 99); it opens the inbox on Messages when a chat or a group has something unread, on Notifications when only notifications
//                    do, and on Messages when nothing does; offline it says just "Inbox"
//   Journey          the first tile of the grid, top left, is the card "Write a journey post": a tile like a post (9:16, the same size, 2 px from the edge and
//                    2 px from the next tile), one button that opens /write; the posts follow, and a post opens the viewer at that post, never at the card;
//                    a pilgrim with no post yet (the sample journey) has the card too
//   Notes            the feed starts with ONE card, "Write a note", under the strip: no filter tabs (All, Photos and videos, Places) and no second write button
//
// The first of the Notes walks and the strip walk are in scenarios.mjs (they were there before the cards); the rest are here.
import assert from 'node:assert/strict';
import { VIEWPORT, domQuiet, eventually, pathOf } from './harness.mjs';

const waitPath = (page, want, what = 'the address') => eventually(() => pathOf(page), (p) => p === want, { what: `${what} (wanted ${want})` });
const box = async (locator, what) => {
  const b = await locator.boundingBox();
  if (!b) throw new Error(`${what} has no box (it is not on the screen)`);
  return b;
};
const near = (a, b, tolerance, what) => assert(Math.abs(a - b) <= tolerance, `${what}: ${a} is not within ${tolerance} of ${b}`);
const strip = (page, t) => page.getByText(t, { exact: true }).filter({ visible: true }).first();
const back = async ({ page, step }) => {
  step('tap Back');
  await page.getByRole('button', { name: 'Back', exact: true }).first().click();
};

/** The chat button, whatever it says: "Inbox" or "Inbox, 3 unread". */
const chatButton = (page) => page.getByRole('button', { name: /^Inbox(, \d+ unread)?$/ });
const cardPost = (page) => page.getByRole('button', { name: 'Write a journey post', exact: true });
const cardNote = (page) => page.getByRole('button', { name: 'Write a note', exact: true });

/** The names of the buttons on the row of `anchor` (their middle is within 20 px of its middle, and they are on the screen), left to right. */
async function buttonsOnRowOf(page, anchor) {
  const a = await box(anchor, 'the button to read the row from');
  return page.evaluate((mid) => [...document.querySelectorAll('[role="button"], button')]
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && r.height > 0 && r.x >= 0 && r.x < window.innerWidth && Math.abs(r.y + r.height / 2 - mid) <= 20)
    .sort((x, y) => x.r.x - y.r.x)
    .map(({ el, r }) => `${el.getAttribute('aria-label') || el.innerText.trim()}@${Math.round(r.x)}`), a.y + a.height / 2);
}

/** What the inbox shows under its tabs: the tab that is open is the one whose rows are on the screen. */
async function inboxOpensOn(page) {
  const messages = page.getByText('See you in Hontanas!', { exact: true });
  const notifications = page.getByText('Lucas Ferreira sent you a friend request', { exact: true });
  const which = async () => `${(await messages.count()) > 0 ? 'messages' : ''}${(await notifications.count()) > 0 ? 'notifications' : ''}`;
  try {
    await eventually(which, (v) => v === 'messages' || v === 'notifications', { what: 'the rows the inbox shows (Messages or Notifications, one of them)' });
  } catch (e) {
    throw new Error(`${e.message}; the screen says: ${(await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 400)}`);
  }
  return which();
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-expose-headers': '*', 'content-type': 'application/json' };
const ZERO = { notifications: 0, chats: 0, groups: 0, friend_requests: 0 };

export const ME_SCENARIOS = [
  {
    name: 'Me: the top right of the header is the gear alone (no bell), and ONE gold chat button, "Inbox, 3 unread", floats at the bottom right of Notes, Journey, Plan and Health and opens the inbox on Messages, where a chat is unread',
    persona: 'in',
    async run(ctx) {
      const { page, step, go } = ctx;
      step('open Me');
      await go('/me');
      const gear = page.getByRole('button', { name: 'Settings', exact: true });
      await gear.waitFor();
      step('the right half of the header row has the gear and nothing else: no bell, no inbox button, no badge');
      const row = await buttonsOnRowOf(page, gear);
      const right = row.filter((b) => Number(b.split('@')[1]) > 200).map((b) => b.split('@')[0]);
      assert.deepEqual(right, ['Settings'], `the buttons on the right of the header row: ${JSON.stringify(row)}`);
      await eventually(() => page.getByRole('button', { name: /bell|notifications/i }).count(), (n) => n === 0, { what: 'the number of bell or notification buttons on Me' });
      for (const tab of ['Notes', 'Journey', 'Plan', 'Health']) {
        step(`${tab}: one chat button, bottom right, above the tab bar, 60 round, and it is the only gold button that floats`);
        await strip(page, tab).click();
        const chat = chatButton(page);
        await eventually(() => chat.count(), (n) => n === 1, { what: `the number of chat buttons on ${tab}` });
        await page.getByRole('button', { name: 'Inbox, 3 unread', exact: true }).waitFor(); // the full account: a notification and two chats are unread
        const b = await box(chat, `the chat button on ${tab}`);
        near(b.x + b.width, VIEWPORT.width - 16, 2, `${tab}: the right edge of the chat button is 16 from the screen edge`);
        near(b.width, 60, 1, `${tab}: the chat button is 60 wide`);
        near(b.height, 60, 1, `${tab}: and 60 high`);
        assert(b.y + b.height <= VIEWPORT.height - 90 && b.y > VIEWPORT.height - 260, `${tab}: it floats above the tab bar, at the bottom (${JSON.stringify(b)})`);
        const text = (await chat.innerText()).replace(/\s+/g, '');
        assert.equal(text, '3', `${tab}: the badge says 3`);
        const badge = await box(chat.locator('div').filter({ hasText: /^3$/ }).first(), `the badge on ${tab}`);
        assert(badge.x >= 0 && badge.x + badge.width <= VIEWPORT.width - 8 && badge.y >= 0, `${tab}: the badge stays inside the screen (${JSON.stringify(badge)})`);
        assert(badge.height >= 24 && badge.width >= 24, `${tab}: the badge is a round label of 24 or more (${JSON.stringify(badge)})`);
        await eventually(() => page.getByRole('button', { name: /^Write a (note|journey post)$/ }).count(), (n) => n === (tab === 'Notes' || tab === 'Journey' ? 1 : 0), { what: `the number of write cards on ${tab} (one on Notes and on Journey, none on Plan and Health)` });
      }
      step('Health: tap the chat button: the inbox opens on Messages (a chat is unread)');
      await chatButton(page).click();
      await waitPath(page, '/inbox', 'the address after the chat button');
      assert.equal(new URL(page.url()).searchParams.get('tab'), 'messages', 'the inbox is asked for the Messages tab');
      await page.getByRole('heading', { name: 'Inbox', exact: true }).waitFor();
      assert.equal(await inboxOpensOn(page), 'messages', 'the rows of Messages are on the screen');
      await back(ctx);
      await waitPath(page, '/me', 'the address after Back');
      step('Notes: the same button opens the same inbox');
      await strip(page, 'Notes').click();
      await chatButton(page).click();
      await waitPath(page, '/inbox', 'the address after the chat button on Notes');
      assert.equal(new URL(page.url()).searchParams.get('tab'), 'messages');
    },
  },
  {
    name: 'Me: the chat button opens the inbox where something waits (Messages for a chat or a group, Notifications when only notifications wait, Messages when nothing does), and says the number: the label has the real count, the badge stops at 99+',
    persona: 'in',
    schemes: ['light'],
    async run(ctx) {
      const { page, step, go } = ctx;
      const holder = { totals: ZERO };
      // what the server says is unread; page.route runs before the harness's own answer, and the preflight is left to the harness (fallback)
      await page.route('**/rest/v1/rpc/get_unread_totals', (route) => {
        if (route.request().method() !== 'POST' && route.request().method() !== 'GET') return route.fallback();
        return route.fulfill({ status: 200, headers: CORS, body: JSON.stringify([holder.totals]) });
      });
      const CASES = [
        { what: 'only notifications wait', totals: { ...ZERO, notifications: 4 }, label: 'Inbox, 4 unread', badge: '4', tab: 'notifications' },
        { what: 'a group message waits', totals: { ...ZERO, groups: 3 }, label: 'Inbox, 3 unread', badge: '3', tab: 'messages' },
        { what: 'a chat and a notification wait', totals: { ...ZERO, notifications: 2, chats: 1 }, label: 'Inbox, 3 unread', badge: '3', tab: 'messages' },
        { what: 'nothing waits', totals: ZERO, label: 'Inbox', badge: '', tab: 'messages' },
        { what: 'more than 99 notifications wait', totals: { ...ZERO, notifications: 120 }, label: 'Inbox, 120 unread', badge: '99+', tab: 'notifications' },
        { what: '99 notifications wait', totals: { ...ZERO, notifications: 99 }, label: 'Inbox, 99 unread', badge: '99', tab: 'notifications' },
      ];
      for (const c of CASES) {
        holder.totals = c.totals;
        step(`${c.what}: open Me`);
        await go('/me');
        const chat = page.getByRole('button', { name: c.label, exact: true });
        await chat.waitFor();
        assert.equal((await chat.innerText()).replace(/\s+/g, ''), c.badge, `${c.what}: the badge says "${c.badge}"`);
        await eventually(() => chatButton(page).count(), (n) => n === 1, { what: `the number of chat buttons (${c.what})` });
        step(`${c.what}: tap it`);
        await chat.click();
        await waitPath(page, '/inbox', `the address after the chat button (${c.what})`);
        assert.equal(new URL(page.url()).searchParams.get('tab'), c.tab, `${c.what}: the inbox is asked for ${c.tab}`);
        await page.getByRole('heading', { name: 'Inbox', exact: true }).waitFor();
        assert.equal(await inboxOpensOn(page), c.tab, `${c.what}: the inbox shows the rows of ${c.tab}`);
      }
    },
  },
  {
    name: 'Me, with no signal: the chat button is just "Inbox" with no badge, and it still opens the inbox',
    persona: 'in',
    offline: true,
    schemes: ['light'],
    async run(ctx) {
      const { page, step, go } = ctx;
      step('open Me with no signal');
      await go('/me');
      await page.getByText(/You are offline/).first().waitFor();
      const chat = page.getByRole('button', { name: 'Inbox', exact: true });
      await chat.waitFor();
      assert.equal((await chat.innerText()).trim(), '', 'no badge: nothing is known to be unread');
      await eventually(() => page.getByRole('button', { name: /^Inbox, / }).count(), (n) => n === 0, { what: 'the number of chat buttons that claim an unread count' });
      step('tap it');
      await chat.click();
      await waitPath(page, '/inbox', 'the address after the chat button');
      assert.equal(new URL(page.url()).searchParams.get('tab'), 'messages', 'nothing waits: the chats');
      await page.getByRole('heading', { name: 'Inbox', exact: true }).waitFor();
    },
  },
  {
    name: 'Me, Journey: the first tile of the grid is the card "Write a journey post", a tile like a post (9:16, the same size, 2 px from the edge, 2 px from the next tile) that opens /write; the posts follow and open the viewer at themselves',
    persona: 'in',
    async run(ctx) {
      const { page, step, go } = ctx;
      step('open Me: it opens on Journey');
      await go('/me');
      const card = cardPost(page);
      await card.waitFor();
      const posts = page.getByRole('button', { name: /^Open post from / });
      await eventually(() => posts.count(), (n) => n === 2, { what: 'the number of post tiles (the full account has two posts)' });
      step('the card is ONE button, the first tile: top left, the size of a post tile, 2 px from the screen edge and from the next tile');
      await eventually(() => card.count(), (n) => n === 1, { what: 'the number of cards that write a journey post' });
      const [c, first, second] = [await box(card, 'the card'), await box(posts.nth(0), 'the first post'), await box(posts.nth(1), 'the second post')];
      near(c.x, 2, 1, 'the card is 2 px from the left screen edge');
      near(c.width, 192, 1, 'the card is a column wide (192 on a 390 screen)');
      near(c.height, 341, 2, 'and 9:16 high');
      near(c.height / c.width, 16 / 9, 0.02, 'the ratio of a tile');
      near(first.width, c.width, 1, 'the first post is as wide as the card');
      near(first.height, c.height, 1, 'and as high');
      near(first.y, c.y, 1, 'the first post is on the row of the card');
      near(first.x, c.x + c.width + 2, 1.5, 'the first post is 2 px to the right of the card');
      near(second.x, c.x, 1, 'the second post is under the card, in the left column');
      near(second.y, c.y + c.height + 2, 1.5, 'and 2 px below it');
      near(second.width, c.width, 1, 'as wide as the card');
      const size = await card.evaluate((el) => Math.min(...[...el.querySelectorAll('*')].filter((n) => n.childElementCount === 0 && n.textContent.trim()).map((n) => parseFloat(getComputedStyle(n).fontSize))));
      assert(size >= 16, `the words of the card are at least 16 px (they are ${size})`);
      assert.equal((await card.innerText()).replace(/\s+/g, ' ').trim(), 'Write a journey post', 'the card says what it does, and nothing else');
      step('the posts keep their own indexes: the second post opens the viewer at the second post, the first at the first (the page that is on the screen, not one above or below it)');
      // the viewer is a column of pages as high as the screen; the page of the post that was opened is the one whose words are on the screen
      const onScreen = async (words) => {
        const el = page.getByRole('dialog').getByText(words).first();
        await el.waitFor({ state: 'attached' });
        const b = await el.boundingBox();
        return !!b && b.y >= 0 && b.y + b.height <= VIEWPORT.height && b.x >= 0 && b.x + b.width <= VIEWPORT.width;
      };
      const FIRST = /Sunrise over the meseta/;
      const SECOND = /Pilgrim menu in Zubiri/;
      await posts.nth(1).click();
      await eventually(() => onScreen(SECOND), (v) => v === true, { what: 'the second post is on the screen of the viewer it opened' });
      assert.equal(await onScreen(FIRST), false, 'the first post is not on the screen while the second is open');
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      await eventually(() => page.getByRole('dialog').count(), (n) => n === 0, { what: 'the number of viewers once it is shut' });
      await posts.nth(0).click();
      await eventually(() => onScreen(FIRST), (v) => v === true, { what: 'the first post is on the screen of the viewer it opened' });
      assert.equal(await onScreen(SECOND), false, 'the second post is not on the screen while the first is open');
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      await eventually(() => page.getByRole('dialog').count(), (n) => n === 0, { what: 'the number of viewers once it is shut' });
      step('tap the card: /write opens');
      await card.click();
      await waitPath(page, '/write', 'the address after the card');
      await back(ctx).catch(() => {});
    },
  },
  {
    name: 'Me, Journey with no post yet: the sample journey has the card too, as its first tile, and its banner says to tap it; the chat button is just "Inbox" when nothing is unread',
    persona: 'in',
    data: 'empty',
    schemes: ['light'],
    async run(ctx) {
      const { page, step, go } = ctx;
      step('open Me with an account that has no post: the sample journey');
      await go('/me');
      await page.getByText('Sample journey: AI-generated pictures and clips. Tap the first card to write your own first post.', { exact: true }).waitFor();
      const card = cardPost(page);
      await eventually(() => card.count(), (n) => n === 1, { what: 'the number of cards that write a journey post on the sample journey' });
      const tiles = page.getByRole('button', { name: /^Open post from / });
      await eventually(() => tiles.count(), (n) => n === 10, { what: 'the number of sample tiles' });
      const [c, first] = [await box(card, 'the card'), await box(tiles.nth(0), 'the first sample')];
      near(c.x, 2, 1, 'the card is 2 px from the left screen edge');
      near(first.y, c.y, 1, 'the first sample is on the row of the card');
      near(first.x, c.x + c.width + 2, 1.5, 'and 2 px to its right');
      near(first.width, c.width, 1, 'the same width');
      near(first.height, c.height, 1, 'the same height');
      const last = await box(tiles.nth(9), 'the last sample');
      near(last.x, c.x, 1, 'ten samples and the card are 11 tiles: the last sample is alone on its row, on the left');
      step('no unread: the chat button says just "Inbox", with no badge');
      const chat = page.getByRole('button', { name: 'Inbox', exact: true });
      await chat.waitFor();
      assert.equal((await chat.innerText()).trim(), '');
      step('tap the card: /write opens');
      await card.click();
      await waitPath(page, '/write', 'the address after the card');
    },
  },
  {
    name: 'Library: the chat button and the cards are Me\'s, not the Library\'s: the Library has no chat button and no write card',
    persona: 'in',
    schemes: ['light'],
    async run({ page, step, go }) {
      step('open Library');
      await go('/library');
      await page.getByRole('heading', { name: 'Library', exact: true }).waitFor();
      await domQuiet(page, 300);
      await eventually(() => page.getByRole('button', { name: /^Inbox/ }).count(), (n) => n === 0, { what: 'the number of chat buttons on Library' });
      await eventually(() => page.getByRole('button', { name: /^Write a (note|journey post)$/ }).count(), (n) => n === 0, { what: 'the number of write cards on Library' });
    },
  },
];
