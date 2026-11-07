// Plain-node checks for the journey grid maths (no React Native). Run: npm run test:lib
import assert from 'node:assert/strict';
import { GRID_COLUMNS, GRID_LINE, TILE_RATIO, gridMetrics, gridRows } from '../gridLayout';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };

check('the grid is two columns with a 1 px line, as asked', () => {
  assert.equal(GRID_COLUMNS, 2);
  assert.equal(GRID_LINE, 1);
});

check('edge to edge: two tiles and the line fill the screen, never more, and less than one device pixel is left', () => {
  for (const [w, ratio] of [[390, 3], [393, 3], [412, 2.625], [375, 2], [360, 3], [430, 3], [320, 2]] as const) {
    const m = gridMetrics(w, { bleed: true, margin: 8, pixelRatio: ratio });
    assert.equal(m.width, w);
    const used = m.colW * 2 + m.line;
    assert.ok(used <= w + 1e-9, `${w}@${ratio}: ${used} must not exceed ${w}`);
    assert.ok(w - used < 2 / ratio + 1e-9, `${w}@${ratio}: leftover ${w - used} is under two device pixels`);
  }
});

check('every tile edge lands on a whole device pixel (no blurry seams)', () => {
  const ratio = 3;
  const m = gridMetrics(390, { bleed: true, margin: 8, pixelRatio: ratio });
  const onPixel = (v: number) => Math.abs(v * ratio - Math.round(v * ratio)) < 1e-6;
  assert.ok(onPixel(m.colW), `colW ${m.colW}`);
  assert.ok(onPixel(m.tileH), `tileH ${m.tileH}`);
  assert.ok(onPixel(m.colW + m.line), 'left edge of the second tile');
});

check('tiles are portrait 9:16 (to within one device pixel)', () => {
  const m = gridMetrics(390, { bleed: true, margin: 8, pixelRatio: 3 });
  assert.ok(Math.abs(m.tileH - m.colW * TILE_RATIO) < 1 / 3 + 1e-9);
  assert.ok(m.tileH > m.colW * 1.7);
});

check('inside the side padding: the grid is narrower by two margins', () => {
  const inset = gridMetrics(390, { bleed: false, margin: 8, pixelRatio: 3 });
  assert.equal(inset.width, 374);
  assert.ok(inset.colW * 2 + inset.line <= 374 + 1e-9);
  assert.ok(inset.colW < gridMetrics(390, { bleed: true, margin: 8, pixelRatio: 3 }).colW);
});

check('without a pixel ratio the numbers are exact halves minus the line', () => {
  const m = gridMetrics(391, { bleed: true, margin: 8 });
  assert.equal(m.colW, 195);
  assert.equal(m.tileH, Math.floor(195 * TILE_RATIO));
});

check('rows are aligned pairs in reading order, the last row may hold one tile', () => {
  assert.deepEqual(gridRows(0), []);
  assert.deepEqual(gridRows(1), [[0]]);
  assert.deepEqual(gridRows(4), [[0, 1], [2, 3]]);
  assert.deepEqual(gridRows(5), [[0, 1], [2, 3], [4]]);
  const flat = gridRows(37).flat();
  assert.deepEqual(flat, Array.from({ length: 37 }, (_, i) => i), 'every post exactly once, in order');
});

console.log(`${n} of ${n} passed`);
