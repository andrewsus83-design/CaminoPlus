// Plain-node checks for the pure map logic (no React Native). Run: npm run test:map
import assert from 'node:assert/strict';
import { distanceM, lineLengthM, nearestOnLine, pointAlong, splitLine, type LngLat } from '../geo';
import { buildStyle } from '../style';
import { pois, routeBounds, routeLine, samplePosition, stageEndAlongM, stageForAlong, stageForPoint, stages } from '../sampleRoute';
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

test('stage 1 sample line is ~20 km (real path 24.2 km)', () => {
  const km = lineLengthM(stages[0].line) / 1000;
  assert.ok(km > 18 && km < 26, String(km));
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

test('stageForPoint finds stage 1 near Orisson and stage 3 near Pamplona', () => {
  assert.equal(stageForPoint([-1.2268, 43.1335]).number, 1);
  assert.equal(stageForPoint([-1.62, 42.83]).number, 3);
});

test('stageForAlong changes stage the moment the walker passes a stage end', () => {
  assert.equal(stageForAlong(0).number, 1);
  assert.equal(stageForAlong(9000).number, 1);
  assert.equal(stageForAlong(stageEndAlongM[0] - 5).number, 1);
  assert.equal(stageForAlong(stageEndAlongM[0] + 100).number, 2, '100 m into stage 2 (stageForPoint would still say stage 1 here)');
  assert.equal(stageForAlong(stageEndAlongM[1] + 100).number, 3);
  assert.equal(stageForAlong(stageEndAlongM[2] + 5000).number, 3, 'past the last stage: the last one');
  assert.equal(stageForPoint(pointAlong(routeLine, stageEndAlongM[0] + 100)).number, 1);
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
