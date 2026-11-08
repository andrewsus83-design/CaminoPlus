// Plain-node checks for the journey grid maths (no React Native). Run: npm run test:lib
// The first cell of the grid is the "Write a journey post" card, which is not a post: the posts keep their own indexes (the viewer opens at them) and the
// rows hold one cell more than there are posts. The checks below hold that maths for no posts, one, an odd and an even number, the sample journey and a
// destination filter.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GRID_COLUMNS, GRID_EDGE, GRID_GAP, LEADING_CELLS, TILE_RATIO, cellOfPost, gridCellRows, gridMetrics, gridRows, postOfCell, shownPosts, type GridCell } from '../gridLayout';
import { SAMPLE_JOURNEY } from '../sampleJourney';

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

const W: GridCell = { kind: 'write' };
const P = (post: number): GridCell => ({ kind: 'post', post });

check('the write card is cell 0, top left, in front of the posts; post k sits in cell k + 1 and the two maps are each other\'s inverse', () => {
  assert.equal(LEADING_CELLS, 1);
  assert.equal(postOfCell(0), null, 'cell 0 is the card, not a post');
  assert.equal(postOfCell(1), 0);
  assert.equal(postOfCell(7), 6);
  assert.equal(cellOfPost(0), 1);
  assert.equal(cellOfPost(6), 7);
  for (let k = 0; k < 50; k += 1) { assert.equal(postOfCell(cellOfPost(k)), k); assert.equal(cellOfPost(postOfCell(k + 1) as number), k + 1); }
});

check('rows with the card: no post is the card alone, one post is a full row, then pairs; the last row is one cell exactly when the posts are an even number', () => {
  assert.deepEqual(gridCellRows(0), [[W]], 'no post at all: the card alone, in a row of one');
  assert.deepEqual(gridCellRows(1), [[W, P(0)]]);
  assert.deepEqual(gridCellRows(2), [[W, P(0)], [P(1)]], 'two posts: the last post is alone on its row, like any odd tile');
  assert.deepEqual(gridCellRows(3), [[W, P(0)], [P(1), P(2)]], 'an odd number of posts: every row is full');
  assert.deepEqual(gridCellRows(4), [[W, P(0)], [P(1), P(2)], [P(3)]]);
  assert.deepEqual(gridCellRows(5), [[W, P(0)], [P(1), P(2)], [P(3), P(4)]]);
  for (let posts = 0; posts <= 40; posts += 1) {
    const rows = gridCellRows(posts);
    assert.equal(rows.length, Math.ceil((posts + 1) / 2), `${posts} posts`);
    assert.ok(rows.slice(0, -1).every((r) => r.length === GRID_COLUMNS), `${posts} posts: every row but the last is full`);
    assert.equal(rows[rows.length - 1].length, posts % 2 === 0 ? 1 : GRID_COLUMNS, `${posts} posts: the last row`);
  }
});

check('the card is first, every post is there once, in order, whatever the number of posts, and the cells are the same ones gridRows counts', () => {
  const counts: [number, boolean][] = [...Array.from({ length: 61 }, (_, i): [number, boolean] => [i, false]), [-3, true], [Number.NaN, true], [Infinity, true], [2.9, false]];
  for (const [posts, bad] of counts) {
    const flat = gridCellRows(posts).flat();
    const real = bad ? 0 : Math.floor(posts);
    assert.deepEqual(flat[0], W, `${String(posts)}: the card is first`);
    assert.equal(flat.filter((c) => c.kind === 'write').length, 1, `${String(posts)}: one card`);
    assert.deepEqual(flat.slice(1), Array.from({ length: real }, (_, i) => P(i)), `${String(posts)}: the posts, each once, in order`);
    assert.equal(flat.length, gridRows(real + LEADING_CELLS).flat().length, `${String(posts)}: as many cells as gridRows gives`);
    flat.forEach((cell, at) => assert.equal(cell.kind === 'post' ? cell.post : null, postOfCell(at), `${String(posts)}: cell ${at}`));
  }
});

check('the sample journey has the card too: its posts and the card are one cell more than the posts, in 6 rows for the 10 samples, the last post alone at the end', () => {
  const rows = gridCellRows(SAMPLE_JOURNEY.length);
  assert.equal(SAMPLE_JOURNEY.length, 10);
  assert.equal(rows.length, 6);
  assert.deepEqual(rows[0], [W, P(0)], 'the card, then the first sample');
  assert.deepEqual(rows[5], [P(9)], 'an even number of posts leaves the last one alone, as a real journey does');
  assert.deepEqual(rows.flat().slice(1).map((c) => (c.kind === 'post' ? c.post : -1)), SAMPLE_JOURNEY.map((_, i) => i), 'every sample once, in order: the viewer opens at the sample, not at its cell');
});

check('a destination filter works on the posts alone: the card stays in front of what is shown, an empty or stale filter is the card alone, and the order is the journey\'s', () => {
  const posts = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, n: id.toUpperCase() }));
  assert.equal(shownPosts(posts, null), posts, 'no filter: the very list');
  assert.equal(shownPosts(posts, undefined), posts);
  assert.deepEqual(shownPosts(posts, new Set(['b', 'd'])).map((p) => p.id), ['b', 'd']);
  assert.deepEqual(shownPosts(posts, new Set(['d', 'b'])).map((p) => p.id), ['b', 'd'], 'the order of the journey, not of the set');
  assert.deepEqual(shownPosts(posts, new Set(['c'])).map((p) => p.id), ['c'], 'a destination with one post');
  assert.deepEqual(shownPosts(posts, new Set(['zzz', 'a'])).map((p) => p.id), ['a'], 'an id that is no post any more is ignored');
  // zero posts: the destination has nothing (its posts are gone) -> the grid is the card alone
  const none = shownPosts(posts, new Set(['zzz']));
  assert.deepEqual(none, []);
  assert.deepEqual(gridCellRows(none.length), [[W]], 'a filter with zero posts still lets a pilgrim write');
  assert.deepEqual(gridCellRows(shownPosts(posts, new Set()).length), [[W]], 'an empty filter is the same');
  // one post of a destination: a full row of the card and the post; three: the card, then a full row
  assert.deepEqual(gridCellRows(shownPosts(posts, new Set(['c'])).length), [[W, P(0)]]);
  assert.deepEqual(gridCellRows(shownPosts(posts, new Set(['a', 'c', 'e'])).length), [[W, P(0)], [P(1), P(2)]], 'an odd number of posts of a destination');
  assert.deepEqual(gridCellRows(shownPosts(posts, new Set(['a', 'c'])).length), [[W, P(0)], [P(1)]], 'an even number leaves the last post alone');
  // the post of a cell is looked up in what is shown (the viewer pages through the same list), never in the whole journey
  const shown = shownPosts(posts, new Set(['b', 'd', 'e']));
  const rows = gridCellRows(shown.length);
  assert.deepEqual(rows.flat().map((cell) => (cell.kind === 'post' ? shown[cell.post].id : 'card')), ['card', 'b', 'd', 'e']);
});

check('the screen uses the one gap for the space between rows and between columns, and the one side margin', () => {
  const src = readFileSync(join(process.cwd(), 'src/features/me/JourneyGrid.tsx'), 'utf8'); // npm test runs from mobile/
  assert.match(src, /style=\{\{ marginHorizontal, gap \}\}/, 'the grid: side margin and the gap between rows');
  assert.match(src, /style=\{\{ flexDirection: 'row', gap \}\}/, 'each row: the same gap between columns');
  assert.doesNotMatch(src, /\bbleed\b/, 'no edge-to-edge bleed any more');
  assert.match(src, /gridCellRows\(shown\.length\)/, 'the rows are the cells of the card and the posts that are shown');
  assert.match(src, /shownPosts\(posts, only\)/, 'the filter is the pure one tested above');
  assert.match(src, /key="write" width=\{colW\} height=\{tileH\}/, 'the card is exactly the size of a post tile');
  assert.match(src, /style=\{\{ width: colW, height: tileH, overflow: 'hidden', backgroundColor: c\.sand200 \}\}/, 'and the post tile is as it was');
});

console.log(`${n} of ${n} passed`);
