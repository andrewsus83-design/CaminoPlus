// Plain-node checks for the pure map logic (no React Native). Run: npm run test:map
import './lineShim'; // first: it lets the compiled sampleRoute find the OSM lines in assets/map/lines
import assert from 'node:assert/strict';
import { distanceM, lineLengthM, nearestOnLine, pointAlong, splitLine, type LngLat } from '../geo';
import { buildStyle } from '../style';
import { makeRoute, pois, routeBounds, routeLine, samplePosition, stageEndAlongM, stageForAlong, stageForPoint, stages } from '../sampleRoute';
import { formatMb, timeAgo } from '../timeAgo';

let n = 0;
const test = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log(`ok ${n} - ${name}`);
};

test('distance SJPdP to Roncesvalles is ~17 km as the crow flies', () => {
  const d = distanceM([-1.2376, 43.1636], [-1.3195, 43.0094]);
  assert.ok(d > 16_000 && d < 19_000, String(d));
});

test('stage 1 line is ~24 km, the real path (24.2 km in the seed data)', () => {
  const km = lineLengthM(stages[0].line) / 1000;
  assert.ok(Math.abs(km - stages[0].distanceKm) < stages[0].distanceKm * 0.05, String(km));
});

test('split at the sample position: done + remaining = whole route', () => {
  const [done, rest] = splitLine(routeLine, samplePosition);
  const total = lineLengthM(routeLine);
  assert.ok(Math.abs(lineLengthM(done) + lineLengthM(rest) - total) < 1);
  assert.ok(Math.abs(lineLengthM(done) - 9000) < 50, String(lineLengthM(done)));
  assert.deepEqual(done[done.length - 1], rest[0]);
});

test('a point 1 km off the route snaps back with ~1 km distance', () => {
  const on = pointAlong(routeLine, 5000);
  const off: LngLat = [on[0] + 0.0123, on[1]]; // ~1 km east at lat 43
  const near = nearestOnLine(routeLine, off);
  assert.ok(near.distanceM < 1100, String(near.distanceM));
});

test('nearestOnLine gives the answer of measuring every segment exactly (it only measures the winner now, for the speed of the 800-point OSM route): to a millimetre within 5 km of the line', () => {
  // the function as it was: the exact (haversine) distance to every segment's nearest point, the first of equals wins
  const everySegment = (line: LngLat[], p: LngLat) => {
    const k = Math.cos((p[1] * Math.PI) / 180);
    let best = { point: line[0], index: 0, distanceM: Infinity };
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1];
      const b = line[i];
      const ax = (a[0] - p[0]) * k, ay = a[1] - p[1];
      const bx = (b[0] - p[0]) * k, by = b[1] - p[1];
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
      const q: LngLat = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const d = distanceM(q, p);
      if (d < best.distanceM) best = { point: q, index: i - 1, distanceM: d };
    }
    return best;
  };
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  for (const line of [routeLine, stages[0].line, makeRoute(() => null).routeLine]) {
    for (let i = 0; i < 400; i++) {
      const on = pointAlong(line, rnd() * lineLengthM(line));
      const reach = [0, 30, 400, 3000, 40_000][i % 5]; // on the line, near it, and far from it
      const p: LngLat = [on[0] + ((rnd() - 0.5) * 2 * reach) / 81_000, on[1] + ((rnd() - 0.5) * 2 * reach) / 111_000];
      const want = everySegment(line, p);
      const got = nearestOnLine(line, p);
      // far from the line (where the walker is just "not on the Camino") the two can pick another one of two nearly equal segments
      const tol = want.distanceM < 5000 ? 1e-3 : want.distanceM * 1e-3;
      assert.ok(Math.abs(got.distanceM - want.distanceM) < tol, `${got.distanceM} against ${want.distanceM}`);
      if (got.index !== want.index) assert.ok(Math.abs(everySegment(line.slice(got.index, got.index + 2), p).distanceM - want.distanceM) < tol, 'another segment is the nearest only when it is as near');
      else assert.ok(distanceM(got.point, want.point) < 1e-3);
    }
  }
  assert.equal(nearestOnLine([], [0, 0]).distanceM, Infinity);
  assert.equal(nearestOnLine([[1, 1]], [0, 0]).distanceM, Infinity);
  assert.equal(nearestOnLine([[0, 0], [0, 0]], [0, 0.001]).index, 0, 'a segment of no length is a point');
  assert.ok(Math.abs(nearestOnLine([[0, 0], [0, 0]], [0, 0.001]).distanceM - distanceM([0, 0], [0, 0.001])) < 1e-9);
});

test('stageForPoint finds stage 1 near Orisson and stage 3 near Pamplona', () => {
  assert.equal(stageForPoint([-1.2268, 43.1335]).number, 1);
  assert.equal(stageForPoint([-1.62, 42.83]).number, 3);
});

test('stageForAlong changes stage the moment the walker passes a stage end', () => {
  assert.equal(stageForAlong(0).number, 1);
  assert.equal(stageForAlong(9000).number, 1);
  assert.equal(stageForAlong(stageEndAlongM[0] - 5).number, 1);
  assert.equal(stageForAlong(stageEndAlongM[0] + 100).number, 2, '100 m into stage 2');
  assert.equal(stageForAlong(stageEndAlongM[1] + 100).number, 3);
  assert.equal(stageForAlong(stageEndAlongM[2] + 5000).number, 3, 'past the last stage: the last one');
  // stageForPoint measures to the line, so a point on stage 2 is stage 2 (it measured to the vertices, and the hand-placed lines had one
  // every few kilometres: 100 m into stage 2 it still said stage 1)
  assert.equal(stageForPoint(pointAlong(routeLine, stageEndAlongM[0] + 100)).number, 2);
  assert.equal(stageForPoint(pointAlong(routeLine, stageEndAlongM[0] - 100)).number, 1);
  assert.equal(stageForPoint(pointAlong(routeLine, stageEndAlongM[1] + 100)).number, 3);
  assert.ok(Math.abs(stageEndAlongM[0] - lineLengthM(stages[0].line)) < 1e-6);
});

test('route bounds cover St-Jean and Santiago', () => {
  const [w, s, e, nn] = routeBounds;
  assert.ok(w <= -8.5446 && e >= -1.2376 && s <= 42.34 && nn >= 43.1636);
});

test('POIs are near the route (sample data sanity)', () => {
  for (const p of pois) assert.ok(nearestOnLine(routeLine, p.at).distanceM < 2500, p.name);
});

test('offline style: one layer set per pack, ordered by template then pack', () => {
  const style = buildStyle({ glyphs: 'file:///g/{fontstack}/{range}.pbf', online: false, sources: [{ id: 'stage1', url: 'pmtiles://file:///a.pmtiles' }, { id: 'stage2', url: 'pmtiles://file:///b.pmtiles' }] });
  assert.equal(Object.keys(style.sources).length, 2);
  const ids = style.layers.map((l) => l.id);
  assert.equal(ids[0], 'background');
  assert.deepEqual(ids.slice(1, 3), ['landcover-stage1', 'landcover-stage2']);
  assert.ok(ids.indexOf('place-stage2') > ids.indexOf('road-stage1'));
  assert.match(String((style.sources.stage1 as { attribution?: string }).attribution), /OpenStreetMap/);
});

test('style with no packs is just the parchment background (route still drawn on top)', () => {
  const style = buildStyle({ glyphs: 'x', online: false, sources: [] });
  assert.equal(style.layers.length, 1);
});

test('timeAgo and formatMb', () => {
  const now = Date.parse('2026-11-05T12:00:00Z');
  assert.equal(timeAgo('2026-11-05T10:00:00Z', now), '2 h ago');
  assert.equal(timeAgo('2026-11-04T10:00:00Z', now), 'yesterday');
  assert.equal(timeAgo(undefined, now), 'never');
  assert.equal(formatMb(4_590_000), '4.6 MB');
});

console.log(`\n${n} passed`);

// The real lines of the stages from OpenStreetMap, and the hand-placed ones as the fallback: their own file, run from here so that `npm run test:map` runs it.
import './routeLines.test';
