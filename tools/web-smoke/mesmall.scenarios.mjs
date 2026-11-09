// Scenarios of Me on small phones. The gold chat button floats at the bottom right, 8 px above the tab bar, and the strip of sub-tabs (Notes, Journey, Plan, Health) used to end under it on a short
// phone: measured in a real browser, 58 to 63 percent of the Health cell was covered at 390 and 360 wide and 667 high, and at 360 x 640 the first screen read "Notes Journey Plan H". The web has no
// status bar and no home bar, so a real phone is worse than these numbers. scenarios.mjs adds them to its own list, so they run in light and in dark with everything else.
//
//   the strip         at 360 x 640, 375 x 667 and 390 x 844 the strip ends above the chat button on every sub-tab: 0 percent of the Health cell is covered, with 8 px of air to spare, and the four labels are
//                     one row above the tab bar. At 320 x 568 (a phone that cannot hold the header above a 60 px button: the button's top edge is at 402) the labels are still above the tab bar, and
//                     Notes, Journey and Plan are clear of the button. A long description at 390 x 760 (a phone that has room for the roomy header until the description is read) turns the header compact.
//   the My Camino card  at 320, 360, 375 and 390 wide no word of the card is cut: "Buen Camino!" is one line, the route and "From stage 1 · 1 stage done" are whole, "1 stage done" agrees with the number,
//                     and the Change button is inside the card
//   the Journey grid  the words on a tile are 15 px or more, white over a band that holds 4.5 : 1 over a white picture
//   the highlights    the name under a round is whole where it fits the cell ("Roncesvalles" on one line, never broken in the middle), two lines (never a word cut) when the header is roomy, one line when it is compact
//
// The numbers of the chat button are the app's (components/Fab.tsx: 60 round, 16 from the right, bottom max(inset - 14, 10) + 88 + 8); the check measures what the browser draws, never reads them from the source.
import assert from 'node:assert/strict';
import { domQuiet, eventually } from './harness.mjs';

const AIR = 8; // the clear space the app keeps between the strip and the button (features/me/headerFit.ts: STRIP_AIR)
const CORS = { 'access-control-allow-origin': '*', 'access-control-expose-headers': '*', 'content-type': 'application/json' };
const UID = '11111111-1111-4111-8111-111111111111';

const chat = (page) => page.getByRole('button', { name: /^Inbox(, \d+ unread)?$/ });
const label = (page, t) => page.getByText(t, { exact: true }).filter({ visible: true }).first();
const box = async (locator, what) => {
  const b = await locator.boundingBox();
  if (!b) throw new Error(`${what} has no box (it is not on the screen)`);
  return b;
};
/** The area of the part of `a` that `b` covers, as a share of the area of `a`. */
const covered = (a, b) => {
  const w = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return (w * h) / (a.width * a.height);
};
const pct = (x) => `${(x * 100).toFixed(0)} percent`;

/** Answers a table of the Supabase project with `rows` (a list, or the one object a .single() asks for): page.route runs before the harness's own answer. */
async function serve(page, table, rows) {
  await page.route((url) => url.pathname === `/rest/v1/${table}`, (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const one = /pgrst\.object/.test(route.request().headers().accept || '');
    return route.fulfill({ status: 200, headers: CORS, body: JSON.stringify(one ? rows[0] : rows) });
  });
}

/** The strip's four cells (the Pressable that holds each label), the labels, the chat button and the top of the tab bar, in px of the viewport. */
async function geometry(page) {
  const out = { cells: {}, labels: {} };
  for (const t of ['Notes', 'Journey', 'Plan', 'Health']) {
    const l = label(page, t);
    out.labels[t] = await box(l, `the ${t} label`);
    out.cells[t] = await box(l.locator('xpath=..'), `the ${t} cell`);
  }
  out.fab = await box(chat(page), 'the chat button');
  out.barTop = (await box(page.getByRole('tab', { name: 'Me', exact: true }), 'the Me tab of the tab bar')).y;
  return out;
}

const SIZES = [
  { width: 360, height: 640, clears: true },
  { width: 375, height: 667, clears: true },
  { width: 390, height: 844, clears: true },
  { width: 320, height: 568, clears: false },
];

/** The line a failure prints for a size. */
const where = (s, tab) => `${s.width} x ${s.height}, ${tab}`;

const LONG_BIO = 'Walking the Camino Frances for my family in Jakarta, one stage at a time. I carry a small stone from home for the Cruz de Ferro and I write every night. Ultreia and buen camino to every pilgrim!';
const PROFILE = { id: UID, username: 'ana_t', display_name: 'Ana Torres', avatar_url: null, xp: 120, level: 2, followers_count: 3, following_count: 5, friends_count: 2, posts_count: 2, stamps_count: 2, km_walked: 41.5, is_private: false };

/** A plan whose destinations have long names, two of them walked. */
const NAMES = ['Roncesvalles', 'Zubiri', 'Hornillos del Camino', 'San Juan de Ortega', 'Villafranca del Bierzo', 'Puente la Reina'];
const DAYS = NAMES.map((to, i) => ({
  id: `61000000-0000-4000-8000-0000000000${String(i + 1).padStart(2, '0')}`, journey_id: '50000000-0000-4000-8000-000000000001', stage_id: `40000000-0000-0000-0000-0000000000${String(i + 1).padStart(2, '0')}`,
  day_number: i + 1, status: i < 2 ? 'done' : 'planned', planned_date: `2026-11-${String(10 + i).padStart(2, '0')}`, from_name: 'Somewhere', to_name: to, planned_distance_km: 20 + i, actual_distance_km: null,
  started_at: null, finished_at: null, notes: null, deleted_at: null, stage: { name: `Somewhere to ${to}` },
}));

/** Every word of a text element on one line: a word that has to break in the middle has two boxes. Returns the words that are cut. */
const brokenWords = (locator) => locator.evaluate((el) => {
  const text = [...el.childNodes].find((n) => n.nodeType === 3);
  if (!text) return [];
  const cut = [];
  const s = text.textContent;
  for (const m of s.matchAll(/\S+/g)) {
    const r = document.createRange();
    r.setStart(text, m.index);
    r.setEnd(text, m.index + m[0].length);
    if (r.getClientRects().length > 1) cut.push(m[0]);
  }
  return cut;
});

export const ME_SMALL_SCENARIOS = [
  {
    name: 'Me on small phones: at 360 x 640, 375 x 667 and 390 x 844 the strip of four sub-tabs ends above the gold chat button (0 percent of the Health cell covered, 8 px of air) on Notes, Journey, Plan and Health; at 320 x 568 its labels are above the tab bar and clear of the button but Health; a long description turns the header compact',
    persona: 'in',
    async run(ctx) {
      const { page, step, go } = ctx;
      for (const s of SIZES) {
        await page.setViewportSize({ width: s.width, height: s.height });
        step(`open Me at ${s.width} x ${s.height}`);
        await go('/me');
        await chat(page).waitFor();
        for (const tab of ['Journey', 'Notes', 'Plan', 'Health']) {
          step(`${where(s, tab)}: measure the strip, the chat button and the tab bar`);
          await label(page, tab).click();
          await domQuiet(page, 250);
          await page.evaluate(() => { for (const d of document.querySelectorAll('div')) if (d.scrollTop > 0) d.scrollTop = 0; }); // the first screen: scrolled to the top
          const g = await geometry(page);
          const health = g.cells.Health;
          const share = covered(health, g.fab);
          const clear = g.fab.y - (health.y + health.height);
          // always: four labels in one row, inside the screen, above the tab bar (a strip under the tab bar cannot be tapped)
          const names = ['Notes', 'Journey', 'Plan', 'Health'];
          names.forEach((t, i) => {
            const b = g.labels[t];
            assert(b.x >= 0 && b.x + b.width <= s.width, `${where(s, tab)}: ${t} is inside the screen ${JSON.stringify(b)}`);
            assert(b.y + b.height <= g.barTop + 1, `${where(s, tab)}: the label ${t} ends at ${Math.round(b.y + b.height)}, under the top of the tab bar (${Math.round(g.barTop)}): the strip is hidden`);
            if (i > 0) assert(b.x > g.labels[names[i - 1]].x && Math.abs(b.y - g.labels.Notes.y) < 2, `${where(s, tab)}: ${t} is to the right of ${names[i - 1]}, on the same row`);
          });
          for (const t of ['Notes', 'Journey', 'Plan']) assert(covered(g.cells[t], g.fab) === 0, `${where(s, tab)}: the chat button covers the ${t} cell`);
          if (s.clears) {
            assert(share === 0, `${where(s, tab)}: the chat button covers ${pct(share)} of the Health cell (the strip ends at ${Math.round(health.y + health.height)}, the button starts at ${Math.round(g.fab.y)})`);
            assert(clear >= AIR - 1, `${where(s, tab)}: the strip ends ${Math.round(clear)} px above the button, it should keep ${AIR}`);
            assert(covered(g.labels.Health, g.fab) === 0, `${where(s, tab)}: the chat button covers the word Health`);
          }
        }
      }
      // a phone that has room for the roomy header (the strip would end at 544 and the room is 586) until its description is read: four lines of it make the strip end under the button, so the header turns compact
      step('open Me at 390 x 760 with a long description: the header turns compact and the strip still clears the button');
      await page.setViewportSize({ width: 390, height: 760 });
      await serve(page, 'profiles', [{ ...PROFILE, bio: LONG_BIO }]);
      await go('/me');
      await chat(page).waitFor();
      await page.getByText(/^Walking the Camino Frances for my family/).first().waitFor();
      await eventually(async () => { const g = await geometry(page); return g.fab.y - (g.cells.Health.y + g.cells.Health.height); }, (c) => c >= AIR - 1, { what: 'the clear space between the strip and the chat button with a long description (the header should turn compact)' });
      const bio = await box(page.getByText(/^Walking the Camino Frances for my family/).first(), 'the description');
      assert(bio.height <= 2 * 25 + 1, `the compact header shows two lines of the description (it is ${Math.round(bio.height)} high; the web has no Read more, a phone has: onTextLayout)`);
    },
  },
  {
    name: 'Me: the My Camino card cuts no word at 320, 360, 375 and 390 wide: "Buen Camino!" is one line, the route and "From stage 1 · 1 stage done" are whole, the word agrees with the number, and the Change button is inside the card',
    persona: 'in',
    async run(ctx) {
      const { page, step, go } = ctx;
      for (const width of [320, 360, 375, 390]) {
        await page.setViewportSize({ width, height: 844 });
        step(`open Me at ${width} wide`);
        await go('/me');
        const card = page.getByRole('button', { name: 'Change Camino', exact: true });
        await card.waitFor();
        const c = await box(card, 'the card');
        const text = (await card.innerText()).replace(/\s+/g, ' ').trim();
        assert.match(text, /^Buen Camino! My Camino Change Camino Frances From stage 1 · 1 stage done$|^Buen Camino! My Camino Camino Frances From stage 1 · 1 stage done Change$/, `${width}: the words of the card are all there, in order (${text})`);
        assert.doesNotMatch(text, /1 stages/, `${width}: "1 stage done", not "1 stages done"`);
        step(`${width}: every word is whole: nothing is clipped, ended in an ellipsis, or outside the card`);
        const problems = await card.evaluate((root) => {
          const out = [];
          const r = root.getBoundingClientRect();
          for (const el of root.querySelectorAll('*')) {
            if (el.childElementCount > 0 || !el.textContent.trim()) continue;
            const cs = getComputedStyle(el);
            const b = el.getBoundingClientRect();
            const t = el.textContent.trim();
            if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) out.push(`"${t}" is clipped (${el.scrollWidth} x ${el.scrollHeight} in ${el.clientWidth} x ${el.clientHeight})`);
            if (cs.textOverflow === 'ellipsis' && cs.overflow === 'hidden') out.push(`"${t}" can end in an ellipsis`);
            if (b.left < r.left - 1 || b.right > r.right + 1 || b.top < r.top - 1 || b.bottom > r.bottom + 1) out.push(`"${t}" is outside the card`);
            if (parseFloat(cs.fontSize) < 15) out.push(`"${t}" is ${cs.fontSize}, under 15 px`);
          }
          return out;
        });
        assert.deepEqual(problems, [], `${width}: ${problems.join('; ')}`);
        const accent = await box(card.getByText('Buen Camino!', { exact: true }), 'Buen Camino!');
        assert(accent.height < 40, `${width}: Buen Camino! is one line (it is ${Math.round(accent.height)} high)`);
        const pill = await box(card.getByText('Change', { exact: true }), 'the Change label');
        assert(pill.x >= c.x && pill.x + pill.width <= c.x + c.width, `${width}: the Change button is inside the card`);
        const route = await box(card.getByText('Camino Frances', { exact: true }), 'the route');
        assert(route.width > 100, `${width}: the route has room (${Math.round(route.width)} wide)`);
      }
    },
  },
  {
    name: 'Me, Journey: the words on a tile are 15 px or more, white over a band of 60 percent black that holds 4.5 : 1 over a white picture; the names under the highlights are whole where they fit (Roncesvalles on one line, no word broken in the middle), on two lines when the header is roomy and on one when it is compact',
    persona: 'in',
    async run(ctx) {
      const { page, step, go } = ctx;
      await serve(page, 'journey_days', DAYS);
      step('open Me at 390 x 844, a roomy header, with a plan of long names');
      await page.setViewportSize({ width: 390, height: 844 });
      await go('/me');
      const tiles = page.getByRole('button', { name: /^Open post from / });
      await eventually(() => tiles.count(), (n) => n >= 2, { what: 'the number of post tiles' });
      step('every text on a tile is at least 15 px, white, and the band under it is dark enough');
      const found = await tiles.evaluateAll((els) => els.map((tile) => [...tile.querySelectorAll('*')].filter((n) => n.childElementCount === 0 && n.textContent.trim()).map((n) => {
        const cs = getComputedStyle(n);
        const band = n.parentElement && getComputedStyle(n.parentElement).backgroundColor;
        return { text: n.textContent.trim(), size: parseFloat(cs.fontSize), color: cs.color, band };
      })));
      const rgba = (s) => (s.match(/[\d.]+/g) ?? []).map(Number);
      const lin = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
      const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
      let captions = 0;
      for (const tile of found) {
        for (const t of tile) {
          assert(t.size >= 15, `"${t.text}" on a tile is ${t.size} px, under 15`);
          const color = rgba(t.color);
          const band = rgba(t.band ?? '');
          if (band.length === 4 && color.length >= 3 && color[0] === 255 && color[1] === 255 && color[2] === 255) {
            captions += 1;
            const alpha = band[3];
            const worst = [255, 255, 255].map((v) => v * (1 - alpha)); // the band over a white picture
            const ratio = 1.05 / (lum(worst) + 0.05);
            assert(ratio >= 4.5, `the caption "${t.text}" is ${ratio.toFixed(2)} : 1 over a white picture (the band is ${t.band})`);
          }
        }
      }
      assert(captions >= 1, 'a tile has a white caption on a dark band (the post of Hontanas)');
      step('roomy: Roncesvalles on one line, whole; the long names on two lines, no word cut in the middle');
      const names = page.getByRole('button', { name: /^(Roncesvalles|Zubiri|Hornillos del Camino|San Juan de Ortega|Villafranca del Bierzo|Puente la Reina), / });
      await eventually(() => names.count(), (n) => n === NAMES.length, { what: 'the number of destinations in the row' });
      for (const n of NAMES) {
        const text = names.filter({ hasText: n }).first().getByText(n, { exact: true });
        const b = await box(text, `the name ${n}`);
        const cut = await brokenWords(text);
        assert.deepEqual(cut, [], `${n}: a word is broken in the middle (${cut.join(', ')})`);
        const clipped = await text.evaluate((el) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
        assert(!clipped, `${n} is clipped in the roomy row`);
        const lines = Math.round(b.height / 21);
        assert(lines <= 2, `${n} takes ${lines} lines`);
        if (n === 'Roncesvalles') assert.equal(lines, 1, 'Roncesvalles fits the cell on one line');
        if (n === 'Hornillos del Camino') assert.equal(lines, 2, 'Hornillos del Camino takes two lines');
      }
      step('compact (375 x 667): the same names on one line each, Roncesvalles still whole');
      await page.setViewportSize({ width: 375, height: 667 });
      await domQuiet(page, 400);
      const ron = names.filter({ hasText: 'Roncesvalles' }).first().getByText('Roncesvalles', { exact: true });
      const b2 = await box(ron, 'Roncesvalles, compact');
      assert(b2.height < 25, `Roncesvalles is one line when compact (it is ${Math.round(b2.height)} high)`);
      assert.equal(await ron.evaluate((el) => el.scrollWidth > el.clientWidth + 1), false, 'and whole');
      const hor = names.filter({ hasText: 'Hornillos del Camino' }).first().getByText('Hornillos del Camino', { exact: true });
      assert((await box(hor, 'Hornillos, compact')).height < 25, 'a long name is one line when compact (its end is "…", the screen reader says it whole)');
      assert.match(await names.filter({ hasText: 'Hornillos del Camino' }).first().getAttribute('aria-label'), /^Hornillos del Camino, /, 'the screen reader says the whole name');
    },
  },
];
