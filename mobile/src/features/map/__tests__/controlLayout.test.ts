// Plain-node checks for the room of the round controls on the map (controlLayout.ts). Run: npm run test:map
//
// The family is 56 round buttons, 12 apart, the zoom pair one 56 x 112 capsule (the numbers of design/tokens.json: layout.touchPrimary, space[3]). A column of them
// is as tall as its buttons and gaps. These checks run the fit for every phone from 320 x 568 up to 430 x 932, with the banner and the card at the heights they
// really have (measured on the web export: a banner of one to four lines, a card of 229 to 288) and with large text, and prove that the column never needs more
// room than it has, that the zoom pair is never the one that goes, and that the help bell is in the column or in the card, never nowhere.
import assert from 'node:assert/strict';
import { columnHeight, fitControls, pillMaxWidth, routeRoom, walkRoom, type Slot } from '../controlLayout';

let n = 0;
const test = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log(`ok ${n} - ${name}`);
};

const BTN = 56;
const GAP = 12;
const EDGE = 16;
const SCREEN_TOP = 8;
const one = (id: string): Slot => ({ id, h: BTN });
const ZOOM: Slot = { id: 'zoom', h: 2 * BTN };
const walkRank = (nearOpen = false): Slot[] => [ZOOM, one('bell'), ...(nearOpen ? [one('near'), one('compass')] : [one('compass'), one('near')]), one('light'), one('gps')];
const ROUTE: Slot[] = [ZOOM, one('bell'), one('locate'), one('light'), one('gps'), one('details')];
const height = (ids: string[], rank: Slot[]) => columnHeight(ids.map((id) => rank.find((s) => s.id === id)!.h), GAP);

test('a column is its buttons and the gaps between them: two buttons 124, the whole walk family 452', () => {
  assert.equal(columnHeight([], GAP), 0);
  assert.equal(columnHeight([BTN], GAP), 56);
  assert.equal(columnHeight([BTN, BTN], GAP), 124);
  assert.equal(columnHeight([2 * BTN, BTN, BTN], GAP), 112 + 56 + 56 + 24);
  assert.equal(height(['zoom', 'bell', 'compass', 'near', 'light', 'gps'], walkRank()), 452);
});

test('with all the room it needs, nothing folds', () => {
  for (const room of [452, 453, 600, 900]) {
    const f = fitControls(walkRank(), room, { gap: GAP });
    assert.deepEqual(f.shown, ['zoom', 'bell', 'compass', 'near', 'light', 'gps']);
    assert.deepEqual(f.folded, []);
    assert.equal(f.overflow, false);
  }
});

test('less room folds from the bottom of the ranking: the zoom pair first, then the bell, the compass, near, light, GPS', () => {
  const at = (room: number) => fitControls(walkRank(), room, { gap: GAP, must: ['zoom'] }).shown;
  assert.deepEqual(at(451), ['zoom', 'bell', 'compass', 'near', 'light']);
  assert.deepEqual(at(384), ['zoom', 'bell', 'compass', 'near', 'light']);
  assert.deepEqual(at(383), ['zoom', 'bell', 'compass', 'near']);
  assert.deepEqual(at(316), ['zoom', 'bell', 'compass', 'near']);
  assert.deepEqual(at(315), ['zoom', 'bell', 'compass']);
  assert.deepEqual(at(248), ['zoom', 'bell', 'compass']);
  assert.deepEqual(at(247), ['zoom', 'bell']);
  assert.deepEqual(at(180), ['zoom', 'bell']);
  assert.deepEqual(at(179), ['zoom']);
  assert.deepEqual(at(112), ['zoom']);
});

test('a less important control never stays when a more important one folded (no skipping ahead to a smaller one)', () => {
  for (let room = 100; room <= 480; room++) {
    const f = fitControls(walkRank(), room, { gap: GAP });
    const ranked = walkRank().map((s) => s.id);
    const lastShown = Math.max(-1, ...f.shown.map((id) => ranked.indexOf(id)));
    assert.deepEqual(f.shown, ranked.slice(0, lastShown + 1), `room ${room}`);
  }
});

test('when not even the zoom pair fits, that is an overflow: nothing is shown in the column and every control is folded (no scrolling window on half a zoom pair)', () => {
  const f = fitControls(walkRank(), 111, { gap: GAP, must: ['zoom'] });
  assert.equal(f.overflow, true);
  assert.deepEqual(f.shown, []);
  assert.equal(f.folded.length, 6);
  assert.equal(fitControls(walkRank(), 0, { gap: GAP, must: ['zoom'] }).overflow, true);
  assert.equal(fitControls(walkRank(), 112, { gap: GAP, must: ['zoom'] }).overflow, false);
});

test('while the chips of "What is near" are open, the button that closes them moves up and stays (it is not the one that folds)', () => {
  assert.deepEqual(fitControls(walkRank(true), 316, { gap: GAP }).shown, ['zoom', 'bell', 'near', 'compass']);
  assert.deepEqual(fitControls(walkRank(true), 248, { gap: GAP }).shown, ['zoom', 'bell', 'near']);
  assert.deepEqual(fitControls(walkRank(false), 248, { gap: GAP }).shown, ['zoom', 'bell', 'compass']);
});

test('the whole route: the flag is the way to the folded controls, so it moves up behind the zoom pair and the bell whenever something folds', () => {
  assert.deepEqual(fitControls(ROUTE, 452, { gap: GAP, pinned: 'details' }).shown, ['zoom', 'bell', 'locate', 'light', 'gps', 'details']);
  const f = fitControls(ROUTE, 316, { gap: GAP, pinned: 'details', must: ['zoom', 'bell'] });
  assert.deepEqual(f.shown, ['zoom', 'bell', 'details', 'locate']);
  assert.deepEqual(f.folded, ['light', 'gps']);
  assert.deepEqual(fitControls(ROUTE, 248, { gap: GAP, pinned: 'details', must: ['zoom', 'bell'] }).shown, ['zoom', 'bell', 'details']);
  // no room for the flag: the zoom pair and the bell still stay, and the rest is what is left
  const tight = fitControls(ROUTE, 247, { gap: GAP, pinned: 'details', must: ['zoom', 'bell'] });
  assert.deepEqual(tight.shown, ['zoom', 'bell']);
  assert.equal(tight.overflow, false);
  // not even the zoom pair and the bell: overflow
  assert.equal(fitControls(ROUTE, 179, { gap: GAP, pinned: 'details', must: ['zoom', 'bell'] }).overflow, true);
});

// ---------------------------------------------------------------------------------------------------------------------- the phones

type Phone = { name: string; w: number; h: number; top: number; bottom: number };
const PHONES: Phone[] = [
  { name: '320 x 568 (iPhone SE, first generation)', w: 320, h: 568, top: 20, bottom: 0 },
  { name: '360 x 640 (a small Android)', w: 360, h: 640, top: 24, bottom: 0 },
  { name: '375 x 667 (iPhone SE 2 and 3)', w: 375, h: 667, top: 20, bottom: 0 },
  { name: '390 x 844 (iPhone 14, 15)', w: 390, h: 844, top: 59, bottom: 34 },
  { name: '393 x 852 (iPhone 15 Pro)', w: 393, h: 852, top: 59, bottom: 34 },
  { name: '412 x 915 (a tall Android)', w: 412, h: 915, top: 32, bottom: 24 },
  { name: '430 x 932 (iPhone 15 Pro Max)', w: 430, h: 932, top: 59, bottom: 34 },
];
// What the banner takes (a one-line instruction at its minimum of 92, a two-line one, the chips of "What is near" under it) and what the card takes collapsed
// (handle 48, time 42, the distance 28, the stage one or two lines of 25, the buttons 56 with 12 above and below; 229 with one line and no inset at the bottom).
const BANNERS = [92, 108, 140];
const CHIPS = 48 + 8 + 8; // a row of chips of 48 with 4 above and below, and the gap of 8
const cardAt = (bottom: number, stageLines: 1 | 2) => 48 + 42 + 28 + 25 * stageLines + 12 + 56 + 12 + bottom;

test('every phone, every banner: what the Walk view column shows fits its room, and the zoom pair is there whenever there is room for it', () => {
  for (const p of PHONES) {
    for (const banner of BANNERS) {
      for (const chips of [0, CHIPS]) {
        for (const lines of [1, 2] as const) {
          const aboveH = banner + chips;
          const cardH = cardAt(p.bottom, lines);
          const room = walkRoom({ screenH: p.h, topInset: p.top, screenTop: SCREEN_TOP, aboveH, cardH, gap: GAP, edge: GAP });
          const rank = walkRank(chips > 0);
          const f = fitControls(rank, room, { gap: GAP, must: ['zoom'] });
          const where = `${p.name}, banner ${banner}, chips ${chips}, card ${cardH}, room ${room}`;
          if (f.overflow) assert.ok(room < 2 * BTN, `${where}: overflows only when the zoom pair does not fit`);
          else assert.ok(height(f.shown, rank) <= room, `${where}: ${f.shown.join(',')} is ${height(f.shown, rank)} high`);
          if (room >= 2 * BTN) assert.ok(f.shown.includes('zoom'), `${where}: the zoom pair is shown`);
          if (room >= 2 * BTN + GAP + BTN) assert.ok(f.shown.includes('bell'), `${where}: the bell is in the column`);
          // the column never reaches the banner or the card: its top is under the banner, its bottom is one gap above the card
          const used = height(f.shown, rank);
          assert.ok(p.top + SCREEN_TOP + aboveH + GAP + used <= p.h - cardH - GAP + 1, `${where}: the column ends above the card`);
        }
      }
    }
  }
});

test('a 390 x 844 phone has the zoom pair, the bell, the compass and "What is near" in the column with a normal banner, and the first three with chips open', () => {
  const p = PHONES.find((q) => q.w === 390)!;
  const room = walkRoom({ screenH: p.h, topInset: p.top, screenTop: SCREEN_TOP, aboveH: 92, cardH: cardAt(p.bottom, 1), gap: GAP, edge: GAP });
  assert.deepEqual(fitControls(walkRank(), room, { gap: GAP, must: ['zoom'] }).shown.slice(0, 4), ['zoom', 'bell', 'compass', 'near']);
  const withChips = walkRoom({ screenH: p.h, topInset: p.top, screenTop: SCREEN_TOP, aboveH: 92 + CHIPS, cardH: cardAt(p.bottom, 1), gap: GAP, edge: GAP });
  assert.deepEqual(fitControls(walkRank(true), withChips, { gap: GAP, must: ['zoom'] }).shown.slice(0, 3), ['zoom', 'bell', 'near']);
});

test('large text: the banner and the card grow with the text, the room shrinks, and the column folds more (it never overlaps; at the very end it is not drawn and Map options has the controls)', () => {
  const p = PHONES[1]; // 360 x 640
  let last = Infinity;
  for (const scale of [1, 1.15, 1.3, 1.5, 2]) {
    const banner = Math.round(92 * scale + 20);
    const cardH = Math.round(cardAt(p.bottom, 2) * scale);
    const room = walkRoom({ screenH: p.h, topInset: p.top, screenTop: SCREEN_TOP, aboveH: banner, cardH, gap: GAP, edge: GAP });
    const f = fitControls(walkRank(), room, { gap: GAP, must: ['zoom'] });
    assert.ok(room <= last, `scale ${scale}: the room does not grow with the text`);
    last = room;
    assert.ok(height(f.shown, walkRank()) <= room, `scale ${scale}: fits in ${room}`);
    assert.ok(f.shown.includes('zoom') || f.overflow, `scale ${scale}: the zoom pair is in the column, or it is an overflow and the zoom pair is a row of Map options`);
  }
});

test('the help bell is reachable in one tap in the Walk view: in the column when it has room, else in the row of buttons of the card, which keeps room for Exit', () => {
  for (const p of PHONES) {
    for (const banner of [92, 140, 220]) {
      const room = walkRoom({ screenH: p.h, topInset: p.top, screenTop: SCREEN_TOP, aboveH: banner, cardH: cardAt(p.bottom, 2), gap: GAP, edge: GAP });
      const f = fitControls(walkRank(), room, { gap: GAP, must: ['zoom'] });
      if (!f.shown.includes('bell')) {
        // the row of the card is: the flag, the bell, Exit (the rest of the width); a 17 px "Exit" at 1.3 times needs about 50
        const exit = p.w - 2 * EDGE - 2 * BTN - 2 * GAP;
        assert.ok(exit >= 96, `${p.name}, banner ${banner}: Exit is ${exit} wide next to the flag and the bell`);
      }
    }
  }
  // and on the shortest phone with a plain banner the bell does move to the card, so the row really has to hold it
  const short = PHONES[0];
  const room = walkRoom({ screenH: short.h, topInset: short.top, screenTop: SCREEN_TOP, aboveH: 108, cardH: cardAt(short.bottom, 2), gap: GAP, edge: GAP });
  assert.ok(!fitControls(walkRank(), room, { gap: GAP, must: ['zoom'] }).shown.includes('bell'), `320 x 568: room ${room}`);
});

test('the whole route: the column keeps the zoom pair and the bell, and the flag whenever there is room for it, on every phone', () => {
  for (const p of PHONES) {
    for (const topH of [56 + GAP + 37, 56 + GAP + 37 + GAP + 58]) { // the top row and the status pill; with a two-line notice as well
      const room = routeRoom({ screenH: p.h, topInset: p.top, screenTop: SCREEN_TOP, topH, tabBarH: Math.max(p.bottom - 14, 10) + 88, gap: GAP, edge: EDGE });
      const f = fitControls(ROUTE, room, { gap: GAP, pinned: 'details', must: ['zoom', 'bell'] });
      const where = `${p.name}, top block ${topH}, room ${room}`;
      if (f.overflow) assert.ok(room < 2 * BTN + GAP + BTN, `${where}: overflows only when the zoom pair and the bell do not fit`);
      else {
        assert.ok(f.shown.includes('zoom') && f.shown.includes('bell'), `${where}: zoom pair and bell`);
        assert.ok(height(f.shown, ROUTE) <= room, `${where}: ${f.shown.join(',')} fits`);
        if (f.folded.length && room >= 2 * BTN + 2 * (GAP + BTN)) assert.ok(f.shown.includes('details'), `${where}: the flag is the way to the folded ones`);
      }
    }
  }
  // the tall phones show the whole family on the whole route
  const tall = PHONES.find((q) => q.w === 390)!;
  const room = routeRoom({ screenH: tall.h, topInset: tall.top, screenTop: SCREEN_TOP, topH: 56 + GAP + 37, tabBarH: Math.max(tall.bottom - 14, 10) + 88, gap: GAP, edge: EDGE });
  assert.deepEqual(fitControls(ROUTE, room, { gap: GAP, pinned: 'details', must: ['zoom', 'bell'] }).folded, []);
});

test('the Re-center pill: a gap stays between it and the column on every phone, even at the largest text of a control (its label stops growing at 1.3)', () => {
  for (const p of PHONES) {
    const room = pillMaxWidth(p.w, BTN, GAP, EDGE);
    assert.equal(room, p.w - 2 * EDGE - BTN - GAP, p.name);
    // 20 each side, the 24 arrow, 8, and "Re-center" at 17 px SemiBold (about 85 px) up to 1.3 times
    const widest = 20 + 24 + 8 + Math.ceil(85 * 1.3) + 20;
    assert.ok(widest <= room, `${p.name}: the pill (${widest}) fits the room (${room})`);
  }
  assert.equal(pillMaxWidth(320, BTN, GAP, EDGE), 220);
});

console.log(`${n} of ${n} passed`);
