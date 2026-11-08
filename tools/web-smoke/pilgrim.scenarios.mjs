// Scenarios of the profile of ANOTHER pilgrim and their journey (mobile/app/pilgrim/[id].tsx). scenarios.mjs adds them to its own list, so they run in light and in dark
// with everything else. What a person sees and does:
//
//   a friend       the profile opens from the friends list: Back, the three dots, the card (name, @username, what they wrote, km, posts, stamps), the Message button, then
//                  their journey in the grid of Me without the card that writes a post; a tile opens the viewer with the action rail and their name; Message opens the chat
//   private        NO Notes, Plan or Health control on it (no tab, no text with those names), and the share button of the viewer sends the invitation, never their words
//   a stranger     found in the Find tab: Add friend (the request is sent and the button says Requested), no Unfriend in the menu, and the journey says that journeys shared
//                  with friends are not shown here
//   a private one  a stranger with a private profile is a minimal card: the name and the button, none of the numbers or the words they wrote, and no journey
//   not there      an id nobody has, a blocked pilgrim, a link that is not an id: "This profile is not available", never an error; your own id goes to Me
//   offline        with no signal it says so, with a way to try again
//   comments       the name of the author of a comment opens that pilgrim (here one who asked to be a friend: Accept and Decline), and the name in a chat header opens a friend
import assert from 'node:assert/strict';
import { HANNAH_CARD, INES, MARTA, UID } from './fixtures.mjs';
import { VIEWPORT, eventually, pathOf } from './harness.mjs';
import { SAMPLE_PARAM } from './routes.mjs';

const HANNAH_ID = '22222222-2222-4222-8222-222222222222';
const LUCAS_ID = '33333333-3333-4333-8333-333333333333';
const CORS = { 'access-control-allow-origin': '*', 'access-control-expose-headers': '*', 'content-type': 'application/json' };

const waitPath = (page, want, what = 'the address') => eventually(() => pathOf(page), (p) => p === want, { what: `${what} (wanted ${want})` });
const box = async (locator, what) => {
  const b = await locator.boundingBox();
  if (!b) throw new Error(`${what} has no box (it is not on the screen)`);
  return b;
};
const near = (a, b, tolerance, what) => assert(Math.abs(a - b) <= tolerance, `${what}: ${a} is not within ${tolerance} of ${b}`);
const buttons = (page, name) => page.getByRole('button', { name, exact: typeof name === 'string' });
const back = async ({ page, step }) => {
  step('tap Back');
  await page.getByRole('button', { name: 'Back', exact: true }).first().click();
};
/** The text of the whole screen, one line. */
const screenText = async (page) => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
/** A text that is on the screen now (the screen under this one, the friends list, stays mounted and hidden). */
const seen = (page, t) => page.getByText(t, { exact: true }).filter({ visible: true }).first();
/** The tiles of the grid of posts. */
const tiles = (page) => page.getByRole('button', { name: /^Open post from / });
/** A tap on the picture-and-name end of a row (the middle of a row can be a button of its own). */
const tapRow = (locator) => locator.click({ position: { x: 70, y: 22 } });
/** The words that must not be on the profile of somebody else: the tabs of Me. */
const noPrivateControls = async (page, what) => {
  await eventually(() => page.getByRole('tab').count(), (n) => n === 0, { what: `${what}: the number of tabs` });
  for (const word of ['Notes', 'Plan', 'Health']) {
    await eventually(() => page.getByText(new RegExp(`^${word}$`)).filter({ visible: true }).count(), (n) => n === 0, { what: `${what}: the number of texts that say "${word}"` });
    await eventually(() => page.getByRole('button', { name: new RegExp(`^${word}$`) }).count(), (n) => n === 0, { what: `${what}: the number of buttons named "${word}"` });
  }
  await eventually(() => page.getByRole('button', { name: /^Write a (note|journey post)$/ }).count(), (n) => n === 0, { what: `${what}: the number of write cards` });
};

export const PILGRIM_SCENARIOS = [
  {
    name: 'Pilgrim profile of a friend: from the friends list, with Back, the three dots, the card (name, @username, words, km, posts, stamps), Message, and their journey in the grid with no write card; no Notes, Plan or Health anywhere on it',
    persona: 'in',
    async run(ctx) {
      const { page, step, go } = ctx;
      step('open Friends and tap the friend (the picture and the name), not the chat button');
      await go('/friends');
      const row = buttons(page, 'Hannah Meyer, @hannah. Open profile');
      await row.waitFor();
      await eventually(() => buttons(page, 'Message Hannah Meyer').count(), (n) => n === 1, { what: 'the round chat button stays on the row of a friend' });
      await eventually(() => buttons(page, 'More options for Hannah Meyer').count(), (n) => n === 1, { what: 'and so do the three dots' });
      await tapRow(row);
      await waitPath(page, `/pilgrim/${HANNAH_ID}`, 'the address after the friend');
      step('the top row: Back at the left, @hannah, the three dots at the right');
      await page.getByRole('heading', { name: '@hannah', exact: true }).waitFor();
      const [bk, more] = [await box(buttons(page, 'Back'), 'Back'), await box(buttons(page, 'More options for Hannah Meyer'), 'the three dots')];
      near(bk.x, 16, 1, 'Back is 16 from the left edge');
      near(bk.width, 48, 1, 'and 48 wide, the app\'s one Back button');
      near(more.x + more.width, VIEWPORT.width - 16, 1, 'the three dots end 16 from the right edge');
      assert(more.width >= 48 && more.height >= 48, `the three dots are at least 48 by 48 (${JSON.stringify(more)})`);
      step('the card: name, @username, what they wrote, and the three numbers');
      await seen(page, 'Hannah Meyer').waitFor();
      await seen(page, HANNAH_CARD.bio).waitFor();
      for (const t of [String(Math.round(HANNAH_CARD.km_walked)), 'km', String(HANNAH_CARD.posts_count), 'posts', String(HANNAH_CARD.stamps_count), 'stamps']) await seen(page, t).waitFor();
      step('the button under the card is Message, 56 high, and the person is not offered to be added');
      const message = buttons(page, 'Message Hannah Meyer');
      await message.waitFor();
      near((await box(message, 'Message')).height, 56, 1, 'the main action is 56 high');
      await eventually(() => buttons(page, /^Add Hannah Meyer as a friend$/).count(), (n) => n === 0, { what: 'the number of Add friend buttons on a friend' });
      step('their journey: the heading, and a tile for each of their three posts');
      await page.getByRole('heading', { name: 'Journey', exact: true }).waitFor();
      await eventually(() => tiles(page).count(), (n) => n === 3, { what: 'the number of tiles (a friend has three posts)' });
      step('no card that writes a post: the first tile is top left and the second is on the same row, 2 px away; every tile is 9:16');
      const [t0, t1] = [await box(tiles(page).nth(0), 'the first tile'), await box(tiles(page).nth(1), 'the second tile')];
      near(t0.x, 2, 1, 'the first tile is 2 px from the left edge');
      near(t1.y, t0.y, 1, 'the second tile is on the first row: there is no card in front');
      near(t1.x, t0.x + t0.width + 2, 1.5, 'and 2 px to its right');
      near(t0.height / t0.width, 16 / 9, 0.02, 'a tile is 9:16');
      step('nothing private: no tab, no Notes, Plan or Health, no write card');
      await noPrivateControls(page, 'the profile of a friend');
      step('a tile opens the viewer: their name beside the close button, and the action rail (love, bookmark, comments, share)');
      await tiles(page).nth(0).click();
      const viewer = page.getByRole('dialog');
      await viewer.waitFor();
      await viewer.getByText(/Cruz de Ferro/).first().waitFor();
      for (const rail of [/^Love/, /^Bookmark/, /^Comments/, /^Share/]) await viewer.getByRole('button', { name: rail }).first().waitFor();
      await viewer.getByRole('button', { name: 'Hannah Meyer. Open profile', exact: true }).waitFor();
      step('the viewer has no controls of Notes, Plan or Health either');
      await eventually(() => viewer.getByRole('button', { name: /^(Notes|Plan|Health|Write a note|Write a journey post)$/ }).count(), (n) => n === 0, { what: 'the number of private controls in the viewer' });
      step('tap their name in the viewer: it closes, and the profile is still the screen (it is theirs)');
      await viewer.getByRole('button', { name: 'Hannah Meyer. Open profile', exact: true }).click();
      await eventually(() => page.getByRole('dialog').count(), (n) => n === 0, { what: 'the number of viewers once their name was tapped' });
      assert.equal(pathOf(page), `/pilgrim/${HANNAH_ID}`, 'still on the profile of the pilgrim whose journey it was');
      step('Message opens the chat; Back is the profile again');
      await message.click();
      await waitPath(page, `/chat/${SAMPLE_PARAM}`, 'the address after Message');
      await back(ctx);
      await waitPath(page, `/pilgrim/${HANNAH_ID}`, 'the address after Back from the chat');
      step('Back returns to the friends list');
      await back(ctx);
      await waitPath(page, '/friends', 'the address after Back');
    },
  },
  {
    name: 'Pilgrim profile of a friend: the share button of the viewer sends the invitation to the app, never their words, and counts no share of their post',
    persona: 'in',
    schemes: ['light'],
    async run({ page, step, go }) {
      const recorded = [];
      await page.addInitScript(() => { window.__shared = []; navigator.share = async (data) => { window.__shared.push(data); }; });
      await page.route('**/rest/v1/rpc/record_post_share', (route) => {
        recorded.push(route.request().method());
        return route.method() === 'OPTIONS' ? route.fallback() : route.fulfill({ status: 200, headers: CORS, body: '1' });
      });
      step('open the profile of the friend and their first post');
      await go(`/pilgrim/${HANNAH_ID}`);
      await eventually(() => tiles(page).count(), (n) => n === 3, { what: 'the number of tiles' });
      await tiles(page).nth(0).click();
      const viewer = page.getByRole('dialog');
      await viewer.getByText(/Cruz de Ferro/).first().waitFor();
      step('tap Share');
      await viewer.getByRole('button', { name: /^Share/ }).first().click();
      const shared = await eventually(() => page.evaluate(() => window.__shared), (list) => list.length > 0, { what: 'what the share sheet was given' });
      const words = String(shared[0].text ?? '') + ' ' + String(shared[0].title ?? '') + ' ' + String(shared[0].url ?? '');
      assert.match(words, /CaminoPlus has offline maps, stays and a pilgrim passport/, 'the invitation to the app');
      assert.doesNotMatch(words, /Cruz de Ferro|father|stone/, 'nothing they wrote');
      assert.deepEqual(recorded.filter((m) => m !== 'OPTIONS'), [], 'a share of the app is not a share of their post: nothing is counted');
    },
  },
  {
    name: 'Pilgrim profile, the three dots: a friend can be unfriended, reported or blocked; blocking makes the profile "not available" at once',
    persona: 'in',
    async run({ page, step, go }) {
      let blocked = false;
      await page.route('**/rest/v1/blocks*', (route) => {
        if (route.request().method() === 'OPTIONS') return route.fallback();
        if (route.request().method() === 'POST') blocked = true;
        return route.fulfill({ status: 201, headers: CORS, body: '[]' });
      });
      await page.route('**/rest/v1/profiles*', (route) => {
        if (!blocked || route.request().method() === 'OPTIONS') return route.fallback(); // once blocked, a profile of theirs is not returned to me, as the policy says
        return route.fulfill({ status: 200, headers: CORS, body: '[]' });
      });
      step('open the profile of a friend and the three dots');
      await go(`/pilgrim/${HANNAH_ID}`);
      await buttons(page, 'More options for Hannah Meyer').click();
      for (const label of ['Unfriend Hannah Meyer', 'Report Hannah Meyer', 'Block Hannah Meyer']) await buttons(page, label).waitFor();
      step('Report: asks what is wrong with the reasons of the chat, and says thank you');
      await buttons(page, 'Report Hannah Meyer').click();
      await buttons(page, 'Spam or scam').click();
      await page.getByText('Thank you. We will take a look.', { exact: true }).waitFor();
      step('Block: asks first, then the profile is not available (the three dots are gone with it)');
      await buttons(page, 'More options for Hannah Meyer').click();
      await buttons(page, 'Block Hannah Meyer').click();
      await page.getByText('Block Hannah Meyer?', { exact: true }).waitFor();
      await buttons(page, 'Block').click();
      await page.getByText('This profile is not available', { exact: true }).waitFor();
      await eventually(() => buttons(page, /^More options for/).count(), (n) => n === 0, { what: 'the number of three-dot buttons on a profile that is not available' });
      await eventually(() => tiles(page).count(), (n) => n === 0, { what: 'the number of tiles on a profile that is not available' });
      step('and nothing of theirs is left on the screen: not the name of the card, not a word they wrote');
      await eventually(async () => (await screenText(page)).includes(HANNAH_CARD.bio), (v) => v === false, { what: 'whether their words are still on the screen' });
    },
  },
  {
    name: 'Pilgrim profile of a stranger, found in the Find tab: Add friend sends a request and the button says Requested; the three dots have no Unfriend; the journey says that journeys shared with friends are not shown here',
    persona: 'in',
    async run({ page, step, go }) {
      let sent = false;
      await page.route('**/rest/v1/rpc/search_pilgrims', (route) => {
        if (route.request().method() === 'OPTIONS') return route.fallback();
        return route.fulfill({ status: 200, headers: CORS, body: JSON.stringify([{ id: MARTA.id, username: MARTA.username, display_name: MARTA.display_name, avatar_url: null, is_private: false, friend_status: sent ? 'pending_out' : 'none' }]) });
      });
      await page.route('**/rest/v1/rpc/send_friend_request', (route) => {
        if (route.request().method() === 'OPTIONS') return route.fallback();
        sent = true;
        return route.fulfill({ status: 200, headers: CORS, body: JSON.stringify('pending') });
      });
      await page.route('**/rest/v1/friendships*', (route) => {
        if (!sent || route.request().method() === 'OPTIONS') return route.fallback();
        return route.fulfill({ status: 200, headers: CORS, body: JSON.stringify([{ status: 'pending', requested_by: UID }]) });
      });
      step('Friends, Find: search for her and tap her picture and name');
      await go('/friends?tab=find');
      await page.getByRole('textbox', { name: 'Search pilgrims' }).fill('marta');
      const row = buttons(page, 'Marta Vidal, @marta. Open profile');
      await row.waitFor();
      await tapRow(row);
      await waitPath(page, `/pilgrim/${MARTA.id}`, 'the address after the search result');
      step('the card, and Add friend in place of Message');
      await page.getByRole('heading', { name: '@marta', exact: true }).waitFor();
      await seen(page, MARTA.bio).waitFor();
      await eventually(() => buttons(page, /^Message /).count(), (n) => n === 0, { what: 'the number of Message buttons on a stranger' });
      step('her journey: nothing this pilgrim may see, and it says why in words');
      await seen(page, 'No journeys to show yet').waitFor();
      await seen(page, 'Journeys shared with friends are not shown here. Add Marta Vidal as a friend to see them.').waitFor();
      await eventually(() => tiles(page).count(), (n) => n === 0, { what: 'the number of tiles' });
      await noPrivateControls(page, 'the profile of a stranger');
      step('the three dots: Report and Block, and no Unfriend');
      await buttons(page, 'More options for Marta Vidal').click();
      await buttons(page, 'Report Marta Vidal').waitFor();
      await buttons(page, 'Block Marta Vidal').waitFor();
      await eventually(() => buttons(page, /^Unfriend /).count(), (n) => n === 0, { what: 'the number of Unfriend options for a stranger' });
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      step('Add friend: the request goes out, the person is told, and the button becomes Requested');
      await buttons(page, 'Add Marta Vidal as a friend').click();
      await page.getByText('Request sent to Marta Vidal.', { exact: true }).waitFor();
      await buttons(page, 'Cancel your request to Marta Vidal').waitFor();
      assert.equal(await buttons(page, 'Cancel your request to Marta Vidal').innerText(), 'Requested');
    },
  },
  {
    name: 'Pilgrim profile of a private stranger: the minimal card (name and the button, none of the numbers or the words they wrote) and no journey',
    persona: 'in',
    async run({ page, step, go }) {
      step('open the profile of a pilgrim whose profile is private and who is not a friend');
      await go(`/pilgrim/${INES.id}`);
      await page.getByRole('heading', { name: '@ines', exact: true }).waitFor();
      await seen(page, 'Ines Duarte').waitFor();
      await seen(page, 'This profile is private').waitFor();
      await seen(page, 'Ines Duarte shares journeys with friends only. Send a friend request to see them.').waitFor();
      await buttons(page, 'Add Ines Duarte as a friend').waitFor();
      step('none of what they keep for friends: the words they wrote, the numbers, a journey');
      const text = await screenText(page);
      assert.doesNotMatch(text, /Only my friends read this/, 'their bio is not shown');
      for (const hidden of ['220', 'km', 'stamps', 'posts', 'Journey']) assert(!new RegExp(`(^| )${hidden}( |$)`).test(text), `"${hidden}" is on a minimal card: ${text.slice(0, 200)}`);
      await eventually(() => tiles(page).count(), (n) => n === 0, { what: 'the number of tiles' });
      await noPrivateControls(page, 'the profile of a private stranger');
    },
  },
  {
    name: 'Pilgrim profile that is not available: an id nobody has, a link that is not an id and a blocked pilgrim are one calm card with a way back, never an error; your own id goes to Me',
    persona: 'in',
    schemes: ['light'],
    async run({ page, step, go }) {
      step('an id nobody has');
      await go(`/pilgrim/${SAMPLE_PARAM}`);
      await page.getByText('This profile is not available', { exact: true }).waitFor();
      await page.getByText('The pilgrim may have left the app, or this profile cannot be shown to you.', { exact: true }).waitFor();
      await eventually(() => buttons(page, /^More options for/).count(), (n) => n === 0, { what: 'the number of three-dot buttons' });
      await buttons(page, 'Back').waitFor();
      step('a link that is not an id: the same card, with nothing asked of the network');
      await go('/pilgrim/hannah');
      await page.getByText('This profile is not available', { exact: true }).waitFor();
      step('the way out of it: Go to Friends');
      await buttons(page, 'Go to Friends').click();
      await waitPath(page, '/friends', 'the address after Go to Friends');
      step('your own id is your profile, which is Me');
      await go(`/pilgrim/${UID}`);
      await waitPath(page, '/me', 'the address of your own profile');
    },
  },
  {
    name: 'Pilgrim profile with no signal: it says you are offline, with a way to try again, and the page is not an error screen',
    persona: 'in',
    offline: true,
    schemes: ['light'],
    async run({ page, step, go }) {
      step('open the profile of a friend without a connection');
      await go(`/pilgrim/${HANNAH_ID}`);
      await page.getByText('You are offline', { exact: true }).waitFor();
      await page.getByText('You seem to be offline. Check your signal and try again.', { exact: true }).waitFor();
      await buttons(page, 'Try again').waitFor();
      await buttons(page, 'Back').waitFor();
      await eventually(() => buttons(page, /^More options for/).count(), (n) => n === 0, { what: 'the number of three-dot buttons while nothing is known about the pilgrim' });
    },
  },
  {
    name: 'Pilgrim profile: the name of the author of a comment opens that pilgrim (here one who asked to be a friend: Accept and Decline), and the name in the header of a direct chat opens the friend',
    persona: 'in',
    async run({ page, step, go }) {
      step('open the friend\'s profile, their first post, and the comments');
      await go(`/pilgrim/${HANNAH_ID}`);
      await eventually(() => tiles(page).count(), (n) => n === 3, { what: 'the number of tiles' });
      await tiles(page).nth(0).click();
      await page.getByRole('dialog').getByRole('button', { name: /^Comments/ }).first().click();
      step('the comment is by @lucas, whose name is a button that says where it goes');
      const author = buttons(page, 'Open profile of @lucas');
      await author.waitFor();
      step('tap it: the sheet and the viewer close and the profile of Lucas opens, with his request waiting');
      await author.click();
      await waitPath(page, `/pilgrim/${LUCAS_ID}`, 'the address after the name of a comment author');
      await page.getByRole('heading', { name: '@lucas', exact: true }).waitFor();
      await buttons(page, "Accept Lucas Ferreira's friend request").waitFor();
      await buttons(page, "Decline Lucas Ferreira's friend request").waitFor();
      await eventually(() => page.getByRole('dialog').count(), (n) => n === 0, { what: 'the number of viewers and sheets left open' });
      step('the name in the header of a direct chat opens that friend (the info button next to it is the chat\'s own settings)');
      await go(`/chat/${SAMPLE_PARAM}`);
      await buttons(page, 'Chat info').waitFor();
      await buttons(page, 'Hannah Meyer. Friend. Open profile').click();
      await waitPath(page, `/pilgrim/${HANNAH_ID}`, 'the address after the name in the chat header');
    },
  },
];
