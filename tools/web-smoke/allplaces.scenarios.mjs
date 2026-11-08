// Scenarios of the "All" item on Me: the first highlight under the My Camino card, which opens a stamp for every place of the Camino (the look of the passport),
// and a stamp that opens the pilgrim's own journeys at that place. scenarios.mjs adds them to its own list, so they run in light and in dark with everything else.
//
//   the row           starts with "All" (the shell, pinned at the left, the leftmost button of the row), then the destinations of the plan
//   All               opens the stamps: one for each place of the route (33 stages are 34 places: where the first starts and where each ends), three in a row, each a
//                     button of at least 48, "<place>, N journeys" or "<place>, no journeys yet", and the line "3 of 34 places"
//   a stamp           shows exactly the posts at that place (the pilgrim's own), the card that writes a post once, and the bar "Back to all places"
//   no post there     says "No journeys at <place> yet" over the grid, which is the card alone
//   the way back      the bar goes back to the stamps, not to all the posts; All again closes the stamps
//   other sub-tabs    from Plan and Health, All opens the stamps of Journey, and a destination still shows its posts there
//   no destinations   a plan with none still has the All item, alone in the row; an account whose route has no places has no All item
//
// The data of the walk is made up here (page.route runs before the harness's own answer): the 33 stages of the Camino Francés as the database has them (the first three
// with linked places, the rest with a name only) and six posts of the pilgrim.
import assert from 'node:assert/strict';
import { VIEWPORT, eventually } from './harness.mjs';

const box = async (locator, what) => {
  const b = await locator.boundingBox();
  if (!b) throw new Error(`${what} has no box (it is not on the screen)`);
  return b;
};
const near = (a, b, tolerance, what) => assert(Math.abs(a - b) <= tolerance, `${what}: ${a} is not within ${tolerance} of ${b}`);
const strip = (page, t) => page.getByText(t, { exact: true }).filter({ visible: true }).first();

const FRANCES = [
  'Saint-Jean-Pied-de-Port to Roncesvalles', 'Roncesvalles to Zubiri', 'Zubiri to Pamplona', 'Pamplona to Puente la Reina', 'Puente la Reina to Estella', 'Estella to Los Arcos',
  'Los Arcos to Logroño', 'Logroño to Nájera', 'Nájera to Santo Domingo de la Calzada', 'Santo Domingo de la Calzada to Belorado', 'Belorado to San Juan de Ortega',
  'San Juan de Ortega to Burgos', 'Burgos to Hornillos del Camino', 'Hornillos del Camino to Castrojeriz', 'Castrojeriz to Frómista', 'Frómista to Carrión de los Condes',
  'Carrión de los Condes to Terradillos de los Templarios', 'Terradillos de los Templarios to Bercianos del Real Camino', 'Bercianos del Real Camino to Mansilla de las Mulas',
  'Mansilla de las Mulas to León', 'León to Villadangos del Páramo', 'Villadangos del Páramo to Astorga', 'Astorga to Foncebadón', 'Foncebadón to Ponferrada',
  'Ponferrada to Villafranca del Bierzo', 'Villafranca del Bierzo to O Cebreiro', 'O Cebreiro to Triacastela', 'Triacastela to Sarria', 'Sarria to Portomarín',
  'Portomarín to Palas de Rei', 'Palas de Rei to Arzúa', 'Arzúa to O Pedrouzo', 'O Pedrouzo to Santiago de Compostela',
];
const STAGES = FRANCES.map((name, i) => {
  const [from, to] = name.split(' to ');
  const linked = i < 3; // the seed's stages have their places; stages 4 to 33 have a name only
  return { id: `40000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`, stage_number: i + 1, name, distance_km: linked ? [24.2, 21.5, 20.4][i] : null, elevation_gain_m: null, difficulty: null,
    start: linked ? { name: from } : null, end: linked ? { name: to } : null };
});
const POINTS = 34; // the first start and the 33 ends
export { STAGES as ALL_PLACES_STAGES };

const iso = (hoursAgo) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
const post = (n, place, hoursAgo, body) => ({ id: `81000000-0000-4000-8000-00000000000${n}`, body, place_name: place, published_at: iso(hoursAgo), like_count: 0, comment_count: 0, media_count: 0, health_summary: null,
  save_count: 0, share_count: 0, user_id: '11111111-1111-4111-8111-111111111111', status: 'published', kind: 'journal', deleted_at: null });
const POSTS = [
  post(1, 'Zubiri', 1, 'Zubiri, the first evening'),
  post(2, 'Zubiri', 2, 'Zubiri, the bridge'),
  post(3, 'Pamplona', 20, 'Pamplona, the walls'),
  post(4, 'Burgos', 40, 'Burgos, the cathedral at sunrise'),
  post(5, 'Burgos Cathedral', 41, 'Burgos, inside the cathedral'),
  post(6, null, 60, 'A day with no place written'),
];
export { POSTS as ALL_PLACES_POSTS };
// what the route and the posts say: the points that have a post (Zubiri 2, Pamplona 1, Burgos 2) and the post that names no place
const VISITED = { Zubiri: 2, Pamplona: 1, Burgos: 2 };

const CORS = { 'access-control-allow-origin': '*', 'access-control-expose-headers': '*', 'content-type': 'application/json' };
/** Answers a table of the Supabase project with `rows`, the way the harness does (a GET; the preflight and anything else is left to the harness). */
async function serve(page, table, rows) {
  await page.route((url) => url.pathname === `/rest/v1/${table}`, (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({ status: 200, headers: CORS, body: JSON.stringify(rows) });
  });
}

const allItem = (page) => page.getByRole('button', { name: /^All places, \d+ of \d+ with journeys$/ });
const stamps = (page) => page.getByRole('button', { name: /, (\d+ journeys?|no journeys yet)$/ });
const visitedStamps = (page) => page.getByRole('button', { name: /, \d+ journeys?$/ });
const tiles = (page) => page.getByRole('button', { name: /^Open post from / });
const card = (page) => page.getByRole('button', { name: 'Write a journey post', exact: true });
const backBar = (page) => page.getByRole('button', { name: 'Back to all places', exact: true });
const showAllBar = (page) => page.getByRole('button', { name: 'Show all posts', exact: true });
const count = (locator) => () => locator.count();

/** Opens Me with the route and the posts of this file, waits for the row. */
async function openMe({ page, go }, { days } = {}) {
  await serve(page, 'stages', STAGES);
  await serve(page, 'posts', POSTS);
  if (days) await serve(page, 'journey_days', days);
  await go('/me');
  await allItem(page).waitFor();
}

export const ALL_PLACES_SCENARIOS = [
  {
    name: 'Me: the row starts with "All" (the shell, pinned at the left, the leftmost button of the row, selected only while its stamps are open), then the destinations of the plan',
    persona: 'in',
    async run(ctx) {
      const { page, step } = ctx;
      step('open Me with a route of 33 stages and six posts');
      await openMe(ctx);
      const all = allItem(page);
      await eventually(count(all), (n) => n === 1, { what: 'the number of All items' });
      assert.equal(await all.getAttribute('aria-label'), `All places, ${Object.keys(VISITED).length} of ${POINTS} with journeys`, 'it says how many of the places have journeys');
      step('the All item is the leftmost button of the row, the destinations are to its right, and nothing is hidden under it');
      const a = await box(all, 'the All item');
      const dest = page.getByRole('button', { name: /^(Zubiri|Pamplona|Roncesvalles), / });
      await eventually(count(dest), (n) => n === 3, { what: 'the number of destinations in the row (three days: Roncesvalles, Zubiri, Pamplona)' });
      const boxes = await Promise.all([0, 1, 2].map((i) => box(dest.nth(i), `destination ${i}`)));
      for (const b of boxes) assert(b.x >= a.x + a.width - 1, `a destination starts at ${b.x}, under or left of the All item that ends at ${a.x + a.width}`);
      near(a.x, 16, 6, 'the All item is at the left margin');
      near(a.width, 72, 2, 'it is as wide as the other items (72)');
      near(boxes[0].y, a.y, 4, 'the destinations are on the row of the All item');
      assert.deepEqual(await dest.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label'))), ['Roncesvalles, no posts yet, open the day plan', 'Zubiri, 2 posts, show them', 'Pamplona, 1 post, show it'], 'the destinations are unchanged');
      step('it is not selected, and there are no stamps yet; the Journey grid is the plain one');
      assert.notEqual(await all.getAttribute('aria-selected'), 'true');
      await eventually(count(stamps(page)), (n) => n === 0, { what: 'the number of stamps before All is tapped' });
      await eventually(count(tiles(page)), (n) => n === POSTS.length, { what: 'the number of post tiles (all six posts)' });
      await card(page).waitFor();
      step('tap All: it is selected now');
      await all.click();
      await eventually(() => all.getAttribute('aria-selected'), (v) => v === 'true', { what: 'the All item is selected while its stamps are open' });
    },
  },
  {
    name: 'Me, All: one stamp for every place of the route (33 stages are 34 places), three in a row, each a button of at least 48 that says its place and its journeys, and the line "3 of 34 places"',
    persona: 'in',
    async run(ctx) {
      const { page, step } = ctx;
      await openMe(ctx);
      step('tap All');
      await allItem(page).click();
      const all = stamps(page);
      await eventually(count(all), (n) => n === POINTS, { what: 'the number of stamps' });
      await eventually(count(visitedStamps(page)), (n) => n === Object.keys(VISITED).length, { what: 'the number of filled stamps (a place with journeys)' });
      step('the line on top says how many of how many, and the post tiles are gone');
      await page.getByText('3 of 34 places', { exact: true }).waitFor();
      await page.getByText('All places', { exact: true }).first().waitFor();
      await eventually(count(tiles(page)), (n) => n === 0, { what: 'the number of post tiles while the stamps are open' });
      await eventually(count(card(page)), (n) => n === 0, { what: 'the number of write cards while the stamps are open (it is the first tile of a grid)' });
      step('the places are the route\'s, in walking order: the first stage starts in Saint-Jean-Pied-de-Port and the last ends in Santiago de Compostela, and a place with no post is still a stamp');
      const labels = await all.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
      assert.equal(labels[0], 'Saint-Jean-Pied-de-Port, no journeys yet');
      assert.equal(labels[1], 'Roncesvalles, no journeys yet');
      assert.equal(labels[2], 'Zubiri, 2 journeys');
      assert.equal(labels[3], 'Pamplona, 1 journey');
      assert.equal(labels[POINTS - 1], 'Santiago de Compostela, no journeys yet');
      assert.equal(labels.find((l) => l.startsWith('Burgos')), 'Burgos, 2 journeys', 'both Burgos posts are under Burgos, once');
      assert.equal(labels.find((l) => l.startsWith('León')), 'León, no journeys yet');
      assert.equal(new Set(labels.map((l) => l.split(',')[0])).size, POINTS, 'no place twice');
      step('three in a row, and every stamp is a touch target of 48 or more');
      const boxes = await Promise.all(Array.from({ length: POINTS }, (_, i) => box(all.nth(i), `stamp ${i}`)));
      near(boxes[0].y, boxes[1].y, 2, 'the first two stamps share a row');
      near(boxes[1].y, boxes[2].y, 2, 'and the third');
      assert(boxes[3].y > boxes[0].y + 60, 'the fourth stamp starts a new row');
      near(boxes[0].x, 16, 3, 'the first column is at the screen margin');
      assert(boxes[1].x > boxes[0].x + 100 && boxes[2].x > boxes[1].x + 100, 'three columns');
      for (const [i, b] of boxes.entries()) assert(b.width >= 48 && b.height >= 48, `stamp ${i} is ${Math.round(b.width)} by ${Math.round(b.height)}: smaller than 48`);
      assert(boxes.every((b) => b.x >= 0 && b.x + b.width <= VIEWPORT.width), 'no stamp leaves the screen sideways');
    },
  },
  {
    name: 'Me, All: a stamp with journeys shows exactly the posts at that place, with the card that writes a post once; the bar goes back to the stamps and not to all the posts; All again closes the stamps',
    persona: 'in',
    async run(ctx) {
      const { page, step } = ctx;
      await openMe(ctx);
      await allItem(page).click();
      await eventually(count(stamps(page)), (n) => n === POINTS, { what: 'the number of stamps' });
      step('tap Burgos: both its posts (and no others), the card, the bar');
      await page.getByRole('button', { name: 'Burgos, 2 journeys', exact: true }).click();
      await eventually(count(tiles(page)), (n) => n === 2, { what: 'the number of posts at Burgos' });
      assert.deepEqual((await tiles(page).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).sort(), ['Open post from Burgos', 'Open post from Burgos Cathedral']);
      await eventually(count(card(page)), (n) => n === 1, { what: 'the number of cards that write a post (one, the first tile)' });
      await eventually(count(backBar(page)), (n) => n === 1, { what: 'the number of bars that go back to all places' });
      await eventually(count(stamps(page)), (n) => n === 0, { what: 'the number of stamps while a place is open' });
      await eventually(count(showAllBar(page)), (n) => n === 0, { what: 'the number of "Show all posts" bars (that one is for a destination of the row)' });
      assert.equal(await page.getByText(/^No journeys at /).count(), 0, 'a place with posts has no empty line');
      step('the card is the first tile of the grid, in front of the posts');
      const c = await box(card(page), 'the card');
      const first = await box(tiles(page).first(), 'the first post');
      near(first.y, c.y, 2, 'the first post is on the row of the card');
      assert(first.x > c.x, 'and to its right');
      step('the bar goes back to the stamps (not to all the posts), and the All item is still selected');
      await backBar(page).click();
      await eventually(count(stamps(page)), (n) => n === POINTS, { what: 'the number of stamps after the bar' });
      await eventually(count(tiles(page)), (n) => n === 0, { what: 'the number of post tiles after the bar' });
      assert.equal(await allItem(page).getAttribute('aria-selected'), 'true');
      step('tap Zubiri: two posts; then All closes the whole view: all six posts and no stamps');
      await page.getByRole('button', { name: 'Zubiri, 2 journeys', exact: true }).click();
      await eventually(count(tiles(page)), (n) => n === 2, { what: 'the number of posts at Zubiri' });
      assert.deepEqual((await tiles(page).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))), ['Open post from Zubiri', 'Open post from Zubiri']);
      await allItem(page).click();
      await eventually(count(tiles(page)), (n) => n === POSTS.length, { what: 'the number of posts after All was tapped again' });
      await eventually(count(stamps(page)), (n) => n === 0, { what: 'the number of stamps after All was tapped again' });
      await eventually(count(backBar(page)), (n) => n === 0, { what: 'the number of bars after All was tapped again' });
      assert.notEqual(await allItem(page).getAttribute('aria-selected'), 'true');
    },
  },
  {
    name: 'Me, All: a stamp with no journey says "No journeys at <place> yet" over the grid, which is the card that writes a post alone (one write button, the first tile)',
    persona: 'in',
    async run(ctx) {
      const { page, step } = ctx;
      await openMe(ctx);
      await allItem(page).click();
      step('tap León, where there is no post');
      await page.getByRole('button', { name: 'León, no journeys yet', exact: true }).click();
      await page.getByText('No journeys at León yet', { exact: true }).waitFor();
      await eventually(count(tiles(page)), (n) => n === 0, { what: 'the number of posts at León' });
      await eventually(count(card(page)), (n) => n === 1, { what: 'the number of cards that write a post (the card of the grid, no second button)' });
      await eventually(() => page.getByRole('button', { name: /^Write a / }).count(), (n) => n === 1, { what: 'the number of buttons that write something' });
      await eventually(count(backBar(page)), (n) => n === 1, { what: 'the bar back to the places' });
      const line = await box(page.getByText('No journeys at León yet', { exact: true }), 'the line');
      const c = await box(card(page), 'the card');
      assert(line.y < c.y, 'the line is over the card');
      step('the card opens /write, and Back returns');
      await card(page).click();
      await eventually(() => new URL(page.url()).pathname, (p) => p === '/write', { what: 'the address after the card' });
    },
  },
  {
    name: 'Me, Plan and Health: All opens the stamps on Journey, and a destination of the row still shows its posts there; the same destination again clears it',
    persona: 'in',
    async run(ctx) {
      const { page, step } = ctx;
      await openMe(ctx);
      for (const tab of ['Plan', 'Health']) {
        step(`open ${tab}: no stamps there`);
        await strip(page, tab).click();
        await eventually(count(stamps(page)), (n) => n === 0, { what: `the number of stamps on ${tab}` });
        step(`${tab}: tap All: Journey opens on the stamps`);
        await allItem(page).click();
        await eventually(count(stamps(page)), (n) => n === POINTS, { what: `the number of stamps after All on ${tab}` });
        assert.equal(await allItem(page).getAttribute('aria-selected'), 'true');
        await eventually(count(tiles(page)), (n) => n === 0, { what: 'the number of post tiles under the stamps' });
        step(`${tab} again, with the stamps open behind it: All opens them (it never closes a view that is not on the screen)`);
        await strip(page, tab).click();
        await eventually(count(stamps(page)), (n) => n === 0, { what: `the number of stamps on ${tab}, the stamps being open behind it` });
        await allItem(page).click();
        await eventually(count(stamps(page)), (n) => n === POINTS, { what: 'the number of stamps after All on another sub-tab' });
        step('on Journey the same item closes them');
        await allItem(page).click();
        await eventually(count(stamps(page)), (n) => n === 0, { what: 'the number of stamps once All is tapped again on Journey' });
      }
      step('Health: tap the destination Zubiri: Journey with its two posts');
      await strip(page, 'Health').click();
      await page.getByRole('button', { name: 'Zubiri, 2 posts, show them', exact: true }).click();
      await eventually(count(tiles(page)), (n) => n === 2, { what: 'the number of posts at Zubiri from Health' });
      await eventually(count(showAllBar(page)), (n) => n === 1, { what: 'the bar "Show all posts"' });
      step('the stamps leave the destination: tap All, then the destination Pamplona');
      await allItem(page).click();
      await eventually(count(stamps(page)), (n) => n === POINTS, { what: 'the stamps after All' });
      await page.getByRole('button', { name: 'Pamplona, 1 post, show it', exact: true }).click();
      await eventually(count(tiles(page)), (n) => n === 1, { what: 'the number of posts at Pamplona' });
      await eventually(count(stamps(page)), (n) => n === 0, { what: 'the stamps are gone when a destination is picked' });
      step('the same destination again (now named as the one shown) clears the filter: all six posts');
      await page.getByRole('button', { name: 'Pamplona, 1 post, showing it, tap to show all posts', exact: true }).click();
      await eventually(count(tiles(page)), (n) => n === POSTS.length, { what: 'the number of posts after the same destination again' });
      await eventually(count(showAllBar(page)), (n) => n === 0, { what: 'the bar after the filter was cleared' });
    },
  },
  {
    name: 'Me, All: a plan with no destination yet still has the All item, alone in the row, and it opens the stamps',
    persona: 'in',
    async run(ctx) {
      const { page, step } = ctx;
      step('a plan with no day: the row is the All item alone');
      await openMe(ctx, { days: [] });
      await eventually(() => page.getByRole('button', { name: /, (\d+ posts?|no posts yet)/ }).count(), (n) => n === 0, { what: 'the number of destinations' });
      await allItem(page).click();
      await eventually(count(stamps(page)), (n) => n === POINTS, { what: 'the number of stamps' });
    },
  },
  {
    name: 'Me, All, an account with nothing in it (no stages, no posts): there is no All item and the sample journey is as it was',
    persona: 'in',
    data: 'empty',
    schemes: ['light'],
    async run({ page, step, go }) {
      step('open Me');
      await go('/me');
      await page.getByText('Sample journey: AI-generated pictures and clips. Tap the first card to write your own first post.', { exact: true }).waitFor();
      await eventually(count(allItem(page)), (n) => n === 0, { what: 'the number of All items for a route with no places' });
      await eventually(count(stamps(page)), (n) => n === 0, { what: 'the number of stamps' });
      await card(page).waitFor();
    },
  },
];
