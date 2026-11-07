// Plain-node checks for the journey grid maths (no React Native). Run: npm run test:lib
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GRID_COLUMNS, GRID_EDGE, GRID_GAP, TILE_RATIO, gridMetrics, gridRows } from '../gridLayout';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };
const onPixel = (v: number, ratio: number) => Math.abs(v * ratio - Math.round(v * ratio)) < 1e-6;
const m = (w: number, ratio?: number) => gridMetrics(w, { margin: 16, pixelRatio: ratio });

check('the grid is two columns, 2 px between tiles and 2 px from the screen edges, as asked', () => {
  assert.equal(GRID_COLUMNS, 2);
  assert.equal(GRID_GAP, 2);
  assert.equal(GRID_EDGE, 2);
});

check('the numbers for common phones: 2 px gap, 2 px edge, two even columns', () => {
  const cases: [width: number, ratio: number, colW: number, tileH: number][] = [
    [402, 2, 198, 352],         // the phone viewport of the web checks: (402 - 2 - 2 - 2) / 2
    [390, 3, 192, 1024 / 3],    // iPhone 12 to 15
    [375, 2, 184.5, 328],       // iPhone SE and 8
    [360, 3, 177, 944 / 3],
    [430, 3, 212, 1130 / 3],
    [320, 2, 157, 279],
  ];
  for (const [w, ratio, colW, tileH] of cases) {
    const g = m(w, ratio);
    assert.equal(g.gap, 2, `${w}@${ratio} gap`);
    assert.equal(g.edge, 2, `${w}@${ratio} edge`);
    assert.equal(g.width, w - 4, `${w}@${ratio} width`);
    assert.ok(Math.abs(g.colW - colW) < 1e-9, `${w}@${ratio} colW ${g.colW}`);
    assert.ok(Math.abs(g.tileH - tileH) < 1e-9, `${w}@${ratio} tileH ${g.tileH}`);
  }
});

check('the grid starts exactly at the edge and ends at the width minus the edge, with at most one device pixel over on the right', () => {
  // Windows that are a whole number of device pixels wide (what a phone reports), at several pixel ratios.
  for (const [w, ratio] of [[390, 3], [393, 3], [402, 2], [375, 2], [360, 3], [430, 3], [320, 2], [411.42857142857144, 2.625], [412, 2], [384, 2.5]] as const) {
    const g = m(w, ratio);
    const used = g.colW * 2 + g.gap;
    const slack = w - 2 * g.edge - used; // what is left between the second tile and the right edge, beyond the edge itself
    assert.ok(slack >= -1e-9, `${w}@${ratio}: ${used} must not exceed ${w - 2 * g.edge}`);
    assert.ok(slack <= 1 / ratio + 1e-9, `${w}@${ratio}: ${slack} px is over one device pixel`);
    // the first tile starts at the edge: screen padding + side margin
    assert.ok(Math.abs(16 + g.marginHorizontal - g.edge) < 1e-9, `${w}@${ratio}: the grid container starts at the edge`);
  }
  // 402 wide (the web check): the right edge is exactly 2 px from the screen edge
  const web = m(402, 2);
  assert.equal(web.edge + web.colW * 2 + web.gap, 402 - 2);
});

check('every tile edge lands on a whole device pixel (no blurry seams) where 2 px is a whole number of device pixels', () => {
  for (const ratio of [1, 1.5, 2, 2.5, 3, 3.5, 4]) {
    for (const w of [320, 360, 375, 390, 393, 402, 412, 430]) {
      const g = m(w, ratio);
      for (const [label, v] of [['edge', g.edge], ['gap', g.gap], ['colW', g.colW], ['tileH', g.tileH], ['left of tile 2', g.edge + g.colW + g.gap], ['right of tile 2', g.edge + 2 * g.colW + g.gap]] as const) {
        assert.ok(onPixel(v, ratio), `${w}@${ratio} ${label} = ${v}`);
      }
      assert.equal(g.gap, 2);
      assert.equal(g.edge, 2);
    }
  }
});

check('where 2 px is not a whole number of device pixels (2.625x) the gap and edge snap to the nearest whole device pixel, and everything still lands on one', () => {
  const g = m(411.42857142857144, 2.625);
  assert.ok(Math.abs(g.gap - 5 / 2.625) < 1e-9, `gap ${g.gap}`);
  assert.equal(g.gap, g.edge);
  assert.ok(Math.abs(g.gap - 2) <= 0.5 / 2.625 + 1e-9, 'within half a device pixel of 2 px');
  for (const v of [g.edge, g.gap, g.colW, g.tileH, g.edge + g.colW + g.gap]) assert.ok(onPixel(v, 2.625), `${v}`);
});

check('tiles are portrait 9:16 (to within one device pixel)', () => {
  const g = m(390, 3);
  assert.ok(Math.abs(g.tileH - g.colW * TILE_RATIO) < 1 / 3 + 1e-9);
  assert.ok(g.tileH > g.colW * 1.7);
});

check('the container is pulled out of the screen padding by padding minus edge (16 - 2 = 14 on the Me tab)', () => {
  assert.equal(m(390, 3).marginHorizontal, -14);
  assert.equal(gridMetrics(390, { margin: 8, pixelRatio: 3 }).marginHorizontal, -6);
  assert.equal(gridMetrics(390, { margin: 2, pixelRatio: 3 }).marginHorizontal, 0);
});

check('without a pixel ratio the numbers are whole logical pixels', () => {
  const g = m(391);
  assert.equal(g.width, 387);
  assert.equal(g.colW, 192); // (387 - 2) / 2 = 192.5, rounded down
  assert.equal(g.tileH, Math.floor(192 * TILE_RATIO));
  assert.equal(g.gap, 2);
});

check('rows are aligned pairs in reading order, the last row may hold one tile', () => {
  assert.deepEqual(gridRows(0), []);
  assert.deepEqual(gridRows(1), [[0]]);
  assert.deepEqual(gridRows(4), [[0, 1], [2, 3]]);
  assert.deepEqual(gridRows(5), [[0, 1], [2, 3], [4]]);
  const flat = gridRows(37).flat();
  assert.deepEqual(flat, Array.from({ length: 37 }, (_, i) => i), 'every post exactly once, in order');
});

check('the screen uses the one gap for the space between rows and between columns, and the one side margin', () => {
  const src = readFileSync(join(process.cwd(), 'src/features/me/JourneyGrid.tsx'), 'utf8'); // npm test runs from mobile/
  assert.match(src, /style=\{\{ marginHorizontal, gap \}\}/, 'the grid: side margin and the gap between rows');
  assert.match(src, /style=\{\{ flexDirection: 'row', gap \}\}/, 'each row: the same gap between columns');
  assert.doesNotMatch(src, /\bbleed\b/, 'no edge-to-edge bleed any more');
});

console.log(`${n} of ${n} passed`);
