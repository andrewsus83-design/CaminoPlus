// Scenarios of the Maps tab: the round controls that sit on the map. scenarios.mjs adds them to its own list, so they run in light and in dark with everything else.
// What a person sees, on the phones from 320 x 568 up to 430 x 932 (the safe area of a phone is added where Chromium can: a notch or a status bar on top, a home
// indicator below):
//
//   one family   every round control is 56 by 56 with a 28 icon, 16 from the right edge of the screen and 12 apart; the zoom pair is ONE capsule 56 wide and 112 high
//                (two halves of 56); the Re-center pill is 56 high with a 24 arrow and "Re-center" in Inter SemiBold at 17, 16 from the left edge, on the same line as
//                the bottom of the column, with a gap of at least 12 to it
//   no overlap   the controls do not touch each other, the banner, the "What is near" chips, the notices, the bottom card, the tab bar (16 clear of it) or the edges of
//                the screen; the Walk view column ends 12 above the card and the whole route column 16 above the tab bar
//   the top row  "Whole route / Near me" and the offline maps button (56 high) sit in one row at 320 wide with 12 between them (QA finding D: they touched)
//   nothing small  no text of the screen under 15 px (the tab bar labels excepted: they are not on the map)
//   folding      a short phone shows the controls that fit, most important first, and the rest are rows of "Map options" in the sheet of the flag button; the zoom pair
//                is always there, and so is the help bell (in the column, or in the row of buttons of the bottom card)
//   large text   the text of the screen 1.5 and 2 times as big (the web has no such setting: the test scales the text and its line height, as a phone does): still no overlap
//
// The unit tests of the arithmetic are in mobile/src/features/map/__tests__/controlLayout.test.ts; this is what the real screen draws.
import assert from 'node:assert/strict';
import { domQuiet, eventually } from './harness.mjs';

const PHONES = [
  { name: '320 x 568', w: 320, h: 568, top: 20, bottom: 0 },
  { name: '360 x 640', w: 360, h: 640, top: 24, bottom: 0 },
  { name: '390 x 844', w: 390, h: 844, top: 59, bottom: 34 },
  { name: '430 x 932', w: 430, h: 932, top: 59, bottom: 34 },
];
const BTN = 56;
const GAP = 12;
const EDGE = 16;
const TABS = ['Me', 'Stays', 'Maps', 'Discover', 'Library'];

/** The phone: its size, and (where Chromium can) the safe area a notch and a home indicator take. */
async function usePhone(page, phone) {
  await page.setViewportSize({ width: phone.w, height: phone.h });
  try {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: phone.top, bottom: phone.bottom, left: 0, right: 0 } });
  } catch { /* an older Chromium has no such override: the page runs with no insets, and the checks of the notch are looser */ }
}

/**
 * What a phone does with a text setting: every text, and its line height, scaled by the factor. The web has no such setting. Registered once; the factor is read from
 * the page's localStorage each time the page loads (setTextScale), so one scenario can try several.
 */
async function enableTextScale(page) {
  await page.context().addInitScript(() => {
    const run = () => {
      let f = 1;
      try { f = Number(localStorage.getItem('__textScale') || 1); } catch { /* storage blocked */ }
      if (f === 1) return;
      const walker = document.createTreeWalker(document.body ?? document.documentElement, NodeFilter.SHOW_TEXT);
      const seen = new Set();
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const el = node.parentElement;
        if (!el || seen.has(el) || !node.nodeValue.trim()) continue;
        seen.add(el);
        const cs = getComputedStyle(el);
        if (el.getAttribute('data-text-scale') === `${f}:${cs.fontSize}`) continue; // already scaled by this script
        const size = parseFloat(cs.fontSize);
        const line = parseFloat(cs.lineHeight);
        el.style.setProperty('font-size', `${(size * f).toFixed(2)}px`, 'important');
        if (!Number.isNaN(line)) el.style.setProperty('line-height', `${(line * f).toFixed(2)}px`, 'important');
        el.setAttribute('data-text-scale', `${f}:${getComputedStyle(el).fontSize}`);
      }
    };
    new MutationObserver(run).observe(document, { subtree: true, childList: true, characterData: true });
    setInterval(run, 250);
  });
}
const setTextScale = (page, factor) => page.evaluate((f) => localStorage.setItem('__textScale', String(f)), factor);

/** The buttons, tabs and switches on the screen with their boxes, the banner, the notices and the text sizes. */
const read = (page) => page.evaluate(() => {
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
  const on = (b) => b.w > 0 && b.h > 0 && b.x + b.w > 0 && b.x < innerWidth && b.y + b.h > 0 && b.y < innerHeight;
  const hidden = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) if (getComputedStyle(e).opacity === '0') return true; return false; };
  const controls = [];
  for (const el of document.querySelectorAll('[role="button"], [role="tab"], [role="switch"], button')) {
    const b = box(el);
    if (!on(b) || hidden(el)) continue;
    const svg = el.querySelector('svg');
    // the part of it that can be seen: a column that scrolls clips what is outside its window
    let vis = { x: b.x, y: b.y, w: b.w, h: b.h };
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const o = getComputedStyle(a);
      if (!/(hidden|auto|scroll)/.test(`${o.overflowX} ${o.overflowY}`)) continue;
      const r = a.getBoundingClientRect();
      const x1 = Math.max(vis.x, r.x), y1 = Math.max(vis.y, r.y), x2 = Math.min(vis.x + vis.w, r.right), y2 = Math.min(vis.y + vis.h, r.bottom);
      vis = { x: x1, y: y1, w: Math.max(0, x2 - x1), h: Math.max(0, y2 - y1) };
    }
    controls.push({ name: (el.getAttribute('aria-label') || el.innerText || '').replace(/\s+/g, ' ').trim(), role: el.getAttribute('role') || 'button', ...b, vis, icon: svg ? svg.getBoundingClientRect().width : null });
  }
  const live = document.querySelector('[aria-live="polite"]');
  const notices = [...document.querySelectorAll('div[dir]')]
    .filter((el) => el.children.length === 0 && /^(Showing a sample position|You are not on the Camino|Preview map\.|Maps for |No map pack|Offline map is out of date)/.test(el.textContent.trim()) && !hidden(el))
    .map((el) => ({ name: el.textContent.trim().slice(0, 30), ...box(el.parentElement) }))
    .filter(on);
  const small = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('svg')) continue; // the drawing of the map is not text of a control
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim())) continue;
    if (el.closest('[role="tab"]') && /^(Me|Stays|Maps|Discover|Library)$/.test(el.textContent.trim())) continue; // the labels of the tab bar are not on the map
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 15) small.push(`${el.textContent.trim().slice(0, 40)} (${fs}px)`);
  }
  return { controls, banner: live ? box(live) : null, notices, small, vw: innerWidth, vh: innerHeight };
});

const by = (list, name) => list.find((c) => (name instanceof RegExp ? name.test(c.name) : c.name === name));
const all = (list, name) => list.filter((c) => (name instanceof RegExp ? name.test(c.name) : c.name === name));
const fmt = (b) => `${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}x${Math.round(b.h)}`;
const hits = (a, b, tol = 0.5) => a.x < b.x + b.w - tol && b.x < a.x + a.w - tol && a.y < b.y + b.h - tol && b.y < a.y + a.h - tol;
const near = (a, b, tol, what) => assert(Math.abs(a - b) <= tol, `${what}: ${Math.round(a * 10) / 10} is not within ${tol} of ${Math.round(b * 10) / 10}`);

function assertApart(items, where) {
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) assert(!hits(items[i], items[j]), `${where}: "${items[i].name}" (${fmt(items[i])}) overlaps "${items[j].name}" (${fmt(items[j])})`);
  }
}

/** The round controls of the column, from the top: what is at the right edge and 56 wide. Not the tabs, the chips, the top row or the buttons of the card. */
const columnOf = (s, vw) => s.controls
  .filter((c) => c.role !== 'tab' && c.w <= BTN + 0.5 && c.h <= BTN + 0.5 && Math.abs(c.x + c.w - (vw - EDGE)) < 1 && !/^(Offline maps|Exit)/.test(c.name))
  .sort((a, b) => a.y - b.y);
/** The column with its zoom pair drawn as the one capsule it is (a box of 56 by 112), and without the second half. */
const asCapsule = (col) => col.filter((c) => c.name !== 'Zoom out').map((c) => (c.name === 'Zoom in' ? { ...c, name: 'the zoom pair', h: 2 * BTN } : c));

const tabBarTop = (s) => Math.min(...s.controls.filter((c) => c.role === 'tab' && TABS.includes(c.name)).map((c) => c.y + c.h / 2)) - 44; // the bar is 88 high and its tabs are in the middle of it, whatever the text does to their height

async function waitForColumn(page, vw) {
  await eventually(async () => { const s = await read(page); const z = by(s.controls, 'Zoom in'); return z ? Math.abs(z.x + z.w - (vw - EDGE)) : 999; }, (d) => d < 1, { what: 'the zoom buttons at the right edge' });
  await domQuiet(page, 400, 4000);
}

/** A drag on a spot of the map that nothing covers: the camera lets go of the walker and the Re-center pill appears. */
async function dragMap(page) {
  const at = await page.evaluate(() => {
    const free = (x, y) => { const el = document.elementFromPoint(x, y); return !!el && !!el.closest('svg') && !el.closest('[role="button"], [role="tab"], [role="switch"]'); };
    for (let y = Math.round(innerHeight * 0.25); y < innerHeight * 0.75; y += 8) {
      for (let x = Math.round(innerWidth * 0.2); x < innerWidth * 0.62; x += 8) {
        if (free(x, y) && free(x - 10, y + 15) && free(x - 20, y + 30) && free(x - 30, y + 45)) return { x, y };
      }
    }
    return null;
  });
  assert(at, 'there is no free spot of the map to drag');
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x - 30, at.y + 45, { steps: 6 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Re-center the map on my position' }).waitFor();
  await domQuiet(page, 300, 3000);
}

/** The whole route on one phone. */
async function checkRoute(page, phone, step) {
  const s = await read(page);
  const col = columnOf(s, phone.w);
  const names = col.map((c) => c.name);
  step(`${phone.name}: the zoom pair and the help bell are in the column (${names.join(' | ')})`);
  assert(names.includes('Zoom in') && names.includes('Zoom out'), `${phone.name}: the zoom pair is in the column (${names.join(' | ')})`);
  assert(names.includes('Need help'), `${phone.name}: the help bell is in the column (${names.join(' | ')})`);
  const zin = by(col, 'Zoom in');
  const zout = by(col, 'Zoom out');
  step(`${phone.name}: every control 56 by 56 with a 28 icon, 16 from the edge; the zoom pair one capsule of 112 (the halves touch)`);
  for (const c of col) {
    near(c.w, BTN, 0.5, `${phone.name}: ${c.name}, the width`);
    near(c.h, BTN, 0.5, `${phone.name}: ${c.name}, the height`);
    near(c.x + c.w, phone.w - EDGE, 0.5, `${phone.name}: ${c.name}, the distance from the right edge`);
    assert.equal(c.icon, 28, `${phone.name}: the icon of ${c.name} is ${c.icon}, not 28`);
  }
  near(zout.y - zin.y, BTN, 0.5, `${phone.name}: the zoom halves, one above the other`);
  step(`${phone.name}: 12 between the controls, the zoom pair last, its bottom 16 above the tab bar`);
  const stack = asCapsule(col);
  for (let i = 1; i < stack.length; i++) near(stack[i].y - (stack[i - 1].y + stack[i - 1].h), GAP, 0.5, `${phone.name}: the gap between ${stack[i - 1].name} and ${stack[i].name}`);
  assert.equal(stack[stack.length - 1].name, 'the zoom pair', `${phone.name}: the zoom pair is the last of the column`);
  near(zout.y + zout.h, tabBarTop(s) - EDGE, 1.5, `${phone.name}: the column ends 16 above the tab bar`);
  step(`${phone.name}: the top row: the switch and the offline maps button, 56 high, the button 16 from the edge and 12 or more from the switch`);
  const tabs = ['Whole route', 'Near me'].map((n) => by(s.controls, n));
  const offline = by(s.controls, 'Offline maps');
  near(offline.w, BTN, 0.5, `${phone.name}: the offline maps button, the width`);
  near(offline.h, BTN, 0.5, `${phone.name}: the offline maps button, the height`);
  near(offline.x + offline.w, phone.w - EDGE, 0.5, `${phone.name}: the offline maps button, the distance from the right edge`);
  assert.equal(offline.icon, 28, `${phone.name}: the icon of the offline maps button`);
  for (const t of tabs) assert(t.h >= 48, `${phone.name}: the tab "${t.name}" is ${t.h} high`);
  const left = Math.min(...tabs.map((t) => t.x)) - 4; // the pill has 4 round its tabs
  const right = Math.max(...tabs.map((t) => t.x + t.w)) + 4;
  assert(left >= EDGE - 0.5, `${phone.name}: the switch starts 16 from the left edge (${left})`);
  near(tabs[0].h + 8, BTN, 0.5, `${phone.name}: the switch is as high as a button`);
  if (Math.abs(tabs[0].y - 4 - offline.y) < BTN / 2) assert(offline.x - right >= GAP - 0.5, `${phone.name}: ${Math.round(offline.x - right)} between the switch and the offline maps button, at least 12`);
  else assert(offline.y >= tabs[0].y + tabs[0].h + 4 + GAP - 0.5, `${phone.name}: the offline maps button wrapped under the switch, a gap below it`);
  assert.deepEqual(s.small, [], `${phone.name}: text under 15 px`);
  step(`${phone.name}: nothing overlaps: the column, the top row, the status`);
  assertApart([...stack, ...tabs.map((t) => ({ ...t, name: `the tab ${t.name}` })), offline, ...s.controls.filter((c) => c !== offline && /^(Online map|Offline map|No map pack)/.test(c.name))], `${phone.name}, whole route`);
  for (const c of col) assert(c.y >= EDGE && c.y + c.h <= phone.h - EDGE, `${phone.name}: ${c.name} is inside the screen`);
  return { col, names };
}

/** The Walk view on one phone, with the Re-center pill. */
async function checkWalk(page, phone, step) {
  const s = await read(page);
  const col = columnOf(s, phone.w);
  const handle = by(s.controls, /^Show more/);
  assert(handle, `${phone.name}: the bottom card has its handle`);
  const cardTop = handle.y;
  const zin = by(col, 'Zoom in');
  const zout = by(col, 'Zoom out');
  assert(zin && zout, `${phone.name}: the zoom pair is in the column of the Walk view (${col.map((c) => c.name).join(' | ')})`);
  step(`${phone.name}: every control 56 by 56 with a 28 icon, 16 from the edge, 12 apart; the zoom capsule 112 with its bottom 12 above the card`);
  for (const c of col) {
    near(c.w, BTN, 0.5, `${phone.name}: ${c.name}, the width`);
    near(c.h, BTN, 0.5, `${phone.name}: ${c.name}, the height`);
    near(c.x + c.w, phone.w - EDGE, 0.5, `${phone.name}: ${c.name}, the distance from the right edge`);
    assert.equal(c.icon, 28, `${phone.name}: the icon of ${c.name} is ${c.icon}, not 28`);
  }
  near(zout.y - zin.y, BTN, 0.5, `${phone.name}: the zoom halves`);
  near(zout.y + zout.h, cardTop - GAP, 1.5, `${phone.name}: the column ends 12 above the card`);
  const stack = asCapsule(col);
  for (let i = 1; i < stack.length; i++) near(stack[i].y - (stack[i - 1].y + stack[i - 1].h), GAP, 0.5, `${phone.name}: the gap between ${stack[i - 1].name} and ${stack[i].name}`);
  step(`${phone.name}: the Re-center pill: 56 high, a 24 arrow, "Re-center" in Inter SemiBold at 17, 16 from the left edge, level with the bottom of the column, 12 or more from it`);
  const pill = by(s.controls, 'Re-center the map on my position');
  near(pill.h, BTN, 0.5, `${phone.name}: the pill, the height`);
  near(pill.x, EDGE, 0.5, `${phone.name}: the pill, the distance from the left edge`);
  near(pill.y + pill.h, cardTop - GAP, 1.5, `${phone.name}: the pill ends 12 above the card, as the column does`);
  assert(zin.x - (pill.x + pill.w) >= GAP - 0.5, `${phone.name}: ${Math.round(zin.x - (pill.x + pill.w))} between the pill and the column, at least 12`);
  const label = await page.getByText('Re-center', { exact: true }).first().evaluate((el) => { const cs = getComputedStyle(el); return { size: cs.fontSize, family: cs.fontFamily }; });
  assert.equal(label.size, '17px', `${phone.name}: the label of the pill is 17`);
  assert(/Inter_600SemiBold/.test(label.family), `${phone.name}: the label of the pill is Inter SemiBold (${label.family})`);
  const arrow = await page.getByRole('button', { name: 'Re-center the map on my position' }).locator('svg').first().evaluate((el) => el.getBoundingClientRect().width);
  assert.equal(arrow, 24, `${phone.name}: the arrow of the pill is 24`);
  step(`${phone.name}: the card: its buttons 56; the help bell once, in the column or in the row of the card`);
  const bells = all(s.controls, 'Need help');
  assert.equal(bells.length, 1, `${phone.name}: ${bells.length} help bells on the screen, not one`);
  const flag = by(s.controls, /^Route details/);
  const exit = by(s.controls, /^Exit Walk view/);
  near(flag.w, BTN, 0.5, `${phone.name}: the flag, the width`);
  near(flag.h, BTN, 0.5, `${phone.name}: the flag, the height`);
  near(exit.h, BTN, 0.5, `${phone.name}: Exit, the height`);
  const bellInCard = bells[0].y > cardTop;
  if (bellInCard) {
    near(bells[0].w, BTN, 0.5, `${phone.name}: the bell in the card, the width`);
    assert(bells[0].x >= flag.x + flag.w + GAP - 0.5 && bells[0].x + bells[0].w <= exit.x - GAP + 0.5, `${phone.name}: the bell is between the flag and Exit, 12 from each`);
  }
  assert.deepEqual(s.small, [], `${phone.name}: text under 15 px`);
  step(`${phone.name}: nothing overlaps: the banner, the chips, the notices, the column, the pill, the card; the card is above the home indicator`);
  assertApart([
    ...(s.banner ? [{ name: 'the banner', ...s.banner }] : []),
    ...s.notices.map((n) => ({ ...n, name: `the notice "${n.name}"` })),
    ...stack, pill, handle, flag, exit, ...(bellInCard ? bells : []),
    ...s.controls.filter((c) => / pins$/.test(c.name)),
  ], `${phone.name}, Walk view`);
  if (s.banner) {
    assert(s.banner.y >= phone.top, `${phone.name}: the banner starts under the notch (${Math.round(s.banner.y)}, the status bar is ${phone.top})`);
    for (const c of col) assert(c.y >= s.banner.y + s.banner.h + GAP - 1, `${phone.name}: ${c.name} is 12 or more under the banner`);
  }
  assert(exit.y + exit.h <= phone.h - phone.bottom + 0.5, `${phone.name}: Exit is above the home indicator (${Math.round(exit.y + exit.h)} of ${phone.h - phone.bottom})`);
  return { col, names: col.map((c) => c.name) };
}

export const MAP_SCENARIOS = [
  {
    name: 'Maps: the round controls are one family (56 round buttons with a 28 icon, 12 apart, 16 from the edge; the zoom pair one capsule of 112; the Re-center pill 56 high) and never overlap, from 320 x 568 up to 430 x 932',
    persona: 'in',
    async run({ page, step, go }) {
      for (const phone of PHONES) {
        await usePhone(page, phone);
        step(`${phone.name}: open Maps`);
        await go('/maps');
        await page.getByRole('tab', { name: 'Whole route' }).waitFor();
        await waitForColumn(page, phone.w);
        await checkRoute(page, phone, step);
        step(`${phone.name}: Near me (the Walk view), then a drag of the map for the Re-center pill`);
        await page.getByRole('tab', { name: 'Near me' }).click();
        await page.getByRole('button', { name: /^Exit Walk view/ }).waitFor();
        await waitForColumn(page, phone.w);
        await dragMap(page);
        const walk = await checkWalk(page, phone, step);
        step(`${phone.name}: the zoom pair is there, and a tall phone shows more of the family than the zoom pair and the bell`);
        assert(walk.names.includes('Zoom in'), `${phone.name}: zoom in`);
        if (phone.h >= 844) assert(walk.names.length >= 4, `${phone.name}: ${walk.names.join(' | ')}`);
      }
    },
  },
  {
    name: 'Maps: a control with no room goes to "Map options" in the sheet of the flag button, and works there (360 x 640, the whole route and the Walk view)',
    persona: 'in',
    async run({ page, step, go }) {
      const phone = PHONES[1];
      await usePhone(page, phone);
      step('open Maps');
      await go('/maps');
      await page.getByRole('tab', { name: 'Whole route' }).waitFor();
      await waitForColumn(page, phone.w);
      const route = await read(page);
      const shown = columnOf(route, phone.w).map((c) => c.name);
      const buttons = [/^Need help$/, /^Show my position$/, /^Map light/, /^Battery saver GPS$/];
      const folded = buttons.filter((re) => !shown.some((n) => re.test(n)));
      step(`the column shows ${shown.join(' | ')}; the ${folded.length} controls it does not show are rows in the sheet`);
      const flag = page.getByRole('button', { name: /^Route details/ }).first();
      assert(await flag.count(), 'the flag button is in the column');
      if (folded.length) assert.equal(await flag.getAttribute('aria-label'), 'Route details and map options', 'the flag says that it opens the options too');
      await flag.click();
      await page.getByRole('button', { name: 'Close details' }).first().waitFor();
      for (const [row, button] of [[/^Show my position\./, /^Show my position$/], [/^Map light\./, /^Map light/], [/^GPS\./, /^Battery saver GPS$/]]) {
        const inColumn = shown.some((n) => button.test(n));
        const inSheet = (await page.getByRole('button', { name: row }).count()) + (await page.getByRole('switch', { name: row }).count()) > 0;
        assert(inColumn || inSheet, `${row}: neither a button of the column nor a row of the sheet`);
        assert(!(inColumn && inSheet), `${row}: both a button of the column and a row of the sheet`);
      }
      if (folded.length) await page.getByText('Map options', { exact: true }).waitFor();
      const light = page.getByRole('button', { name: /^Map light\./ });
      if (await light.count()) {
        step('Map light: a tap on its row changes it (Automatic, Day, Night)');
        const before = await light.getAttribute('aria-label');
        await light.click();
        await eventually(() => page.getByRole('button', { name: /^Map light\./ }).getAttribute('aria-label'), (v) => v !== before, { what: 'the Map light row after a tap' });
      }
      step('close the sheet; in the Walk view the help bell is once on the screen and the zoom pair is there');
      await page.getByRole('button', { name: 'Close details' }).last().click();
      await page.getByRole('tab', { name: 'Near me' }).click();
      await page.getByRole('button', { name: /^Exit Walk view/ }).waitFor();
      await waitForColumn(page, phone.w);
      const walk = await read(page);
      assert.equal(all(walk.controls, 'Need help').length, 1, 'one help bell in the Walk view');
      assert(by(walk.controls, 'Zoom in') && by(walk.controls, 'Zoom out'), 'the zoom pair in the Walk view');
    },
  },
  {
    name: 'Maps: with the text 1.5 and 2 times as big (the large text setting) the controls still overlap nothing, and the zoom pair and the help bell are still there',
    persona: 'in',
    schemes: ['light'],
    async run({ page, step, go }) {
      await enableTextScale(page);
      await go('/maps'); // the page has to be open before its storage can be written
      for (const [phone, factor] of [[PHONES[1], 1.5], [PHONES[0], 1.5], [PHONES[0], 2]]) {
        await setTextScale(page, factor);
        await usePhone(page, phone);
        step(`${phone.name}, text x${factor}: the whole route`);
        await go('/maps');
        await page.getByRole('tab', { name: 'Whole route' }).waitFor();
        await domQuiet(page, 600, 4000);
        const s = await read(page);
        const offline = by(s.controls, 'Offline maps');
        assert(offline.x + offline.w <= phone.w - EDGE + 0.5, `${phone.name} x${factor}: the offline maps button is inside the margin`);
        const bar = tabBarTop(s);
        for (const c of columnOf(s, phone.w)) assert(c.vis.h === 0 || c.vis.y + c.vis.h <= bar - EDGE + 1.5, `${phone.name} x${factor}: ${c.name} ends above the tab bar`);
        for (const n of ['Whole route', 'Near me']) assert(!hits(by(s.controls, n), offline), `${phone.name} x${factor}: the tab "${n}" touches the offline maps button`);
        step(`${phone.name}, text x${factor}: the Walk view`);
        await page.getByRole('tab', { name: 'Near me' }).click();
        await page.getByRole('button', { name: /^Exit Walk view/ }).waitFor();
        await domQuiet(page, 800, 4000);
        const w = await read(page);
        const handle = by(w.controls, /^Show more/);
        const col = columnOf(w, phone.w);
        for (const c of col) {
          // a column that scrolls shows a window of its buttons: the window is what has to clear the card and the banner
          const v = c.vis;
          if (v.h === 0) continue;
          assert(v.y + v.h <= handle.y - GAP + 1.5, `${phone.name} x${factor}: ${c.name} ends above the card`);
          if (w.banner) assert(v.y >= w.banner.y + w.banner.h + GAP - 1.5, `${phone.name} x${factor}: ${c.name} is under the banner`);
          assert(Math.abs(c.w - BTN) < 0.5, `${phone.name} x${factor}: ${c.name} keeps its 56`);
        }
        step(`${phone.name}, text x${factor}: the zoom pair can be reached: its plus is in view and at least 48 high, or, when no button fits, the flag has Zoom in and Zoom out as rows`);
        const plus = by(w.controls, 'Zoom in');
        if (plus) assert(plus.vis.h >= 48 - 0.5, `${phone.name} x${factor}: the visible part of Zoom in is ${Math.round(plus.vis.h)} high`);
        else {
          assert.equal(await by(w.controls, /^Route details/).name, 'Route details and map options', `${phone.name} x${factor}: the flag says it has the options`);
          await page.getByRole('button', { name: /^Route details/ }).first().click();
          await page.getByRole('button', { name: /^Zoom in\./ }).waitFor();
          await page.getByRole('button', { name: /^Zoom out\./ }).waitFor();
          await page.getByRole('button', { name: 'Close details' }).last().click();
        }
        const bells = all(w.controls, 'Need help');
        assert.equal(bells.length, 1, `${phone.name} x${factor}: ${bells.length} help bells, not one`);
        const flag = by(w.controls, /^Route details/);
        const exit = by(w.controls, /^Exit Walk view/);
        assert(!hits(flag, exit), `${phone.name} x${factor}: the flag and Exit do not touch`);
        if (bells[0].y > handle.y) assert(!hits(bells[0], exit) && !hits(bells[0], flag), `${phone.name} x${factor}: the bell in the card touches nothing`);
      }
    },
  },
];
