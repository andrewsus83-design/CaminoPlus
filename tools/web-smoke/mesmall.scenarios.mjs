// Scenarios of Me on small phones. The gold chat button floats at the bottom right, 8 px above the tab bar, and the strip of sub-tabs (Notes, Journey, Plan, Health) used to end under it on a short
// phone: measured in a real browser, 58 to 63 percent of the Health cell was covered at 390 and 360 wide and 667 high, and at 360 x 640 the first screen read "Notes Journey Plan H". The web has no
// status bar and no home bar, so a real phone is worse than these numbers: the walks that say so ask Chromium for the safe area of a phone (Emulation.setSafeAreaInsetsOverride), which the app reads
// the way it reads a phone's. scenarios.mjs adds them to its own list, so they run in light and in dark with everything else. One scenario for each size, so a failure names the phone.
//
//   the strip         one scenario for each of 360 x 640, 375 x 667, 390 x 844 and 320 x 568. At the first three the strip ends above the chat button on every sub-tab: 0 percent of the Health cell is
//                     covered, with 8 px of air to spare, and the four labels are one row above the tab bar. At 320 x 568 (the button's top edge is at 402, and no header can end above that) the labels are
//                     still above the tab bar and Notes, Journey and Plan are clear of the button; Health IS covered there, and the walk holds it to what it is today (the cell at most 55 percent, the word at
//                     most 80: today 51 and 73): a known limit that must not get worse, not a pass.
//   a long description  the header's height must not depend on the length of the description (the limit of the field is 160 characters, four lines on a small phone). The compact header shows one line and
//                     nothing under it; the line itself opens the rest. 375 x 667 with the 20 px status bar of an iPhone SE: the strip clears the button, the four labels are above the tab bar, and the strip ends
//                     where it ends with a one-line description. 360 x 640 with the 24 px status bar of an Android phone: the word Health is clear of the button and the labels are above the tab bar; the
//                     strip's own lower edge (the underline and the padding of the cell) is 11 px under the button's top, the known limit of a phone 640 high, held to 12. And 390 x 760, which has room for the
//                     roomy header until the description is read: four lines of it make the strip end under the button, so the header turns compact.
//   the My Camino card  at 320, 344, 348, 352, 356, 360, 375 and 390 wide no word of the card is cut: "Buen Camino!" is one line, the route and "From stage 1 · 1 stage done" are whole, "1 stage done" agrees
//                     with the number, and the Change button is inside the card, at the end of the head from 352 on and at the end of the body under it
//   the Journey grid  the words on a tile are 15 px or more, white over a band that holds 4.5 : 1 over a white picture
//   the highlights    the name under a round is whole where it fits the cell ("Roncesvalles" on one line, never broken in the middle), two lines (never a word cut) when the header is roomy, one line when it is compact
//
// The numbers of the chat button are the app's (components/Fab.tsx: 60 round, 16 from the right, bottom max(inset - 14, 10) + 88 + 8); the check measures what the browser draws, never reads them from the source.
import assert from 'node:assert/strict';
import { domQuiet, eventually } from './harness.mjs';
import { PROFILE } from './fixtures.mjs';

const AIR = 8; // the clear space the app keeps between the strip and the button (features/me/headerFit.ts: STRIP_AIR)
const CORS = { 'access-control-allow-origin': '*', 'access-control-expose-headers': '*', 'content-type': 'application/json' };

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

/** The phone: its size and the safe area its status bar and home bar take (Chromium can add one; the app reads it like a phone's). Set before Me opens, so the first draw is the one measured. */
async function usePhone(page, { width, height, top = 0, bottom = 0 }) {
  await page.setViewportSize({ width, height });
  if (top || bottom) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top, bottom, left: 0, right: 0 } });
  }
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

/** How far the strip ends above the top of the chat button (negative: under it), and how much of the Health cell and of the word the button covers. */
const clearance = (g) => ({ clear: g.fab.y - (g.cells.Health.y + g.cells.Health.height), cell: covered(g.cells.Health, g.fab), word: covered(g.labels.Health, g.fab), stripBottom: g.cells.Health.y + g.cells.Health.height });

/** On a sub-tab, scrolled to the top (the first screen): the geometry. */
async function firstScreen(page, tab) {
  await label(page, tab).click();
  await domQuiet(page, 250);
  await page.evaluate(() => { for (const d of document.querySelectorAll('div')) if (d.scrollTop > 0) d.scrollTop = 0; });
  return geometry(page);
}

/** Four labels in one row, inside the screen, above the tab bar (a strip under the tab bar cannot be tapped), and the three that the button never reaches clear of it. */
function assertStripReadable(g, where, width) {
  const names = ['Notes', 'Journey', 'Plan', 'Health'];
  names.forEach((t, i) => {
    const b = g.labels[t];
    assert(b.x >= 0 && b.x + b.width <= width, `${where}: ${t} is inside the screen ${JSON.stringify(b)}`);
    assert(b.y + b.height <= g.barTop + 1, `${where}: the label ${t} ends at ${Math.round(b.y + b.height)}, under the top of the tab bar (${Math.round(g.barTop)}): the strip is hidden`);
    if (i > 0) assert(b.x > g.labels[names[i - 1]].x && Math.abs(b.y - g.labels.Notes.y) < 2, `${where}: ${t} is to the right of ${names[i - 1]}, on the same row`);
  });
  for (const t of ['Notes', 'Journey', 'Plan']) assert(covered(g.cells[t], g.fab) === 0, `${where}: the chat button covers the ${t} cell`);
}

/* ================================================================ the strip, one scenario for each phone */

const SIZES = [
  { width: 360, height: 640, clears: true },
  { width: 375, height: 667, clears: true },
  { width: 390, height: 844, clears: true },
  { width: 320, height: 568, clears: false },
];
/** What 320 x 568 is held to: today the button covers 51 percent of the Health cell and 73 of the word. A bound, so that it cannot get worse; it is not a pass. */
const KNOWN_320_568 = { cell: 0.55, word: 0.8 };

const stripScenario = (s) => ({
  name: s.clears
    ? `Me on small phones: at ${s.width} x ${s.height} the strip of four sub-tabs ends above the gold chat button (0 percent of the Health cell covered, 8 px of air) on Notes, Journey, Plan and Health, with its four labels above the tab bar`
    : `Me on small phones: at ${s.width} x ${s.height} the labels of the strip are above the tab bar and Notes, Journey and Plan are clear of the chat button on every sub-tab; Health is covered, held to what it is today (the cell at most 55 percent, the word at most 80)`,
  persona: 'in',
  async run(ctx) {
    const { page, step, go } = ctx;
    await usePhone(page, s);
    step(`open Me at ${s.width} x ${s.height}`);
    await go('/me');
    await chat(page).waitFor();
    for (const tab of ['Journey', 'Notes', 'Plan', 'Health']) {
      const where = `${s.width} x ${s.height}, ${tab}`;
      step(`${where}: measure the strip, the chat button and the tab bar`);
      const g = await firstScreen(page, tab);
      assertStripReadable(g, where, s.width);
      const c = clearance(g);
      if (s.clears) {
        assert(c.cell === 0, `${where}: the chat button covers ${pct(c.cell)} of the Health cell (the strip ends at ${Math.round(c.stripBottom)}, the button starts at ${Math.round(g.fab.y)})`);
        assert(c.clear >= AIR - 1, `${where}: the strip ends ${Math.round(c.clear)} px above the button, it should keep ${AIR}`);
        assert(c.word === 0, `${where}: the chat button covers the word Health`);
      } else {
        assert(c.cell <= KNOWN_320_568.cell, `${where}: the chat button covers ${pct(c.cell)} of the Health cell, more than the ${pct(KNOWN_320_568.cell)} this phone is held to (it was 51 percent)`);
        assert(c.word <= KNOWN_320_568.word, `${where}: the chat button covers ${pct(c.word)} of the word Health, more than the ${pct(KNOWN_320_568.word)} this phone is held to (it was 73 percent)`);
      }
    }
  },
});

/* ================================================================ a long description */

/** Phones the walk of the long description tries, with the status bar they have; `clears`: the whole strip ends above the button (else the word Health is clear and the cell is held to `short`). */
const LONG_PHONES = [
  { width: 375, height: 667, top: 20, bottom: 0, what: 'an iPhone SE', clears: true },
  { width: 360, height: 640, top: 24, bottom: 0, what: 'an Android phone', clears: false, short: 12 },
];

const longDescriptionScenario = (p) => ({
  name: p.clears
    ? `Me on small phones: with a long description (160 characters) at ${p.width} x ${p.height} and the ${p.top} px status bar of ${p.what} the strip clears the chat button, its four labels are above the tab bar, and the header is as tall as with one line`
    : `Me on small phones: with a long description (160 characters) at ${p.width} x ${p.height} and the ${p.top} px status bar of ${p.what} the word Health is clear of the chat button, the four labels are above the tab bar, the cell ends at most ${p.short} px under the button, and the header is as tall as with one line`,
  persona: 'in',
  data: 'longbio',
  async run(ctx) {
    const { page, step, go } = ctx;
    await usePhone(page, p);
    step(`open Me at ${p.width} x ${p.height} with the status bar of ${p.what} and the description of 160 characters`);
    await go('/me');
    await chat(page).waitFor();
    const text = page.getByText(/^Walking the Camino Frances for my family/).first();
    await text.waitFor();
    const where = `${p.width} x ${p.height}, status bar ${p.top}`;
    const ends = {};
    for (const tab of ['Journey', 'Notes', 'Plan', 'Health']) {
      step(`${where}, ${tab}: the long description, measured`);
      const g = await firstScreen(page, tab);
      assertStripReadable(g, `${where}, ${tab}`, p.width);
      const c = clearance(g);
      assert(c.word === 0, `${where}, ${tab}: the chat button covers ${pct(c.word)} of the word Health (the strip ends at ${Math.round(c.stripBottom)}, the button starts at ${Math.round(g.fab.y)})`);
      if (p.clears) {
        assert(c.cell === 0, `${where}, ${tab}: the chat button covers ${pct(c.cell)} of the Health cell (the strip ends at ${Math.round(c.stripBottom)}, the button starts at ${Math.round(g.fab.y)})`);
        assert(c.clear >= AIR - 1, `${where}, ${tab}: the strip ends ${Math.round(c.clear)} px above the button, it should keep ${AIR}`);
      } else {
        assert(-c.clear <= p.short, `${where}, ${tab}: the strip ends ${Math.round(-c.clear)} px under the top of the button, more than the ${p.short} this phone is held to (it is 11)`);
      }
      ends[tab] = c.stripBottom;
    }
    step(`${where}: the description is ONE line with the rest cut off (its "…" is the cue)`);
    await firstScreen(page, 'Journey');
    const line = await box(text, 'the description');
    assert(line.height <= 26, `${where}: the description is ${Math.round(line.height)} px high: it should be one line (25), however long the text`);
    assert(await text.evaluate((el) => el.scrollWidth > el.clientWidth + 1), `${where}: the one line shows no cut-off end ("…") to say there is more`);
    step(`${where}: the same screen with a one-line description: the header is exactly as tall`);
    await serve(page, 'profiles', [{ ...PROFILE }]);
    await go('/me');
    await chat(page).waitFor();
    await page.getByText(PROFILE.bio, { exact: true }).first().waitFor();
    const short = clearance(await firstScreen(page, 'Journey'));
    assert(Math.abs(short.stripBottom - ends.Journey) <= 1, `${where}: the strip ends at ${Math.round(ends.Journey)} with 160 characters and at ${Math.round(short.stripBottom)} with one line: the header depends on the length of the description`);
  },
});

/** A phone that has room for the roomy header (the strip would end at 544 and the room is 586) until its description is read: four lines of it make the strip end under the button, so the header turns compact. */
const turnsCompact = {
  name: 'Me on small phones: with a long description at 390 x 760, a phone that has room for the roomy header until the description is read, the header turns compact and the strip still clears the chat button, with one line of the description',
  persona: 'in',
  data: 'longbio',
  async run(ctx) {
    const { page, step, go } = ctx;
    await usePhone(page, { width: 390, height: 760 });
    step('open Me at 390 x 760 with a long description: the header turns compact and the strip still clears the button');
    await go('/me');
    await chat(page).waitFor();
    const text = page.getByText(/^Walking the Camino Frances for my family/).first();
    await text.waitFor();
    await eventually(async () => clearance(await geometry(page)).clear, (c) => c >= AIR - 1, { what: 'the clear space between the strip and the chat button with a long description (the header should turn compact)' });
    const bio = await box(text, 'the description');
    assert(bio.height <= 26, `the compact header shows one line of the description (it is ${Math.round(bio.height)} high)`);
  },
};

/* ================================================================ the My Camino card on narrow phones */

/** Widths at and around the switch of the card (352: the head holds the shell, the words and the pill with 4 percent to spare), and the usual narrow ones. */
const CARD_WIDTHS = [320, 344, 348, 352, 356, 360, 375, 390];
const CARD_WIDE = 352; // features/me/headerFit.ts: cardWide(1)

const cardScenario = {
  name: 'Me: the My Camino card cuts no word at 320, 344, 348, 352, 356, 360, 375 and 390 wide: "Buen Camino!" is one line, the route and "From stage 1 · 1 stage done" are whole, the word agrees with the number, and the Change button is inside the card, in the head from 352 on and under it below',
  persona: 'in',
  async run(ctx) {
    const { page, step, go } = ctx;
    step('open Me at 390 x 844');
    await page.setViewportSize({ width: 390, height: 844 });
    await go('/me'); // once: the phone is made narrower under the open screen, as a phone turned or a window dragged, so that the eight widths take seconds and not a page load each
    const card = page.getByRole('button', { name: 'Change Camino', exact: true });
    await card.waitFor();
    for (const width of CARD_WIDTHS) {
      step(`make the screen ${width} wide`);
      await page.setViewportSize({ width, height: 844 });
      await domQuiet(page, 300);
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
      if (width >= CARD_WIDE) {
        // wide: the button is at the end of the head, beside the words; it must not have dropped to a line of its own (that made the card 48 px taller)
        assert(pill.y < route.y, `${width}: the Change button is in the head of the card, above the route (it is at ${Math.round(pill.y)}, the route at ${Math.round(route.y)})`);
        assert(c.height <= 130, `${width}: the card is ${Math.round(c.height)} high: the head wrapped (it is 123)`);
      } else {
        assert(pill.y >= route.y - 4, `${width}: the Change button is at the end of the body, beside the route (it is at ${Math.round(pill.y)}, the route at ${Math.round(route.y)})`);
      }
    }
  },
};

/* ================================================================ the grid and the highlights */

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

const gridScenario = {
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
};

export const ME_SMALL_SCENARIOS = [
  ...SIZES.map(stripScenario),
  turnsCompact,
  ...LONG_PHONES.map(longDescriptionScenario),
  cardScenario,
  gridScenario,
];
