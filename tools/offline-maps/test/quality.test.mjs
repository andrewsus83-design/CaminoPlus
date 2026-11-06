// Unit tests for the quality gates. Run: npm test (node --test "test/*.test.mjs")
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkManifest, compareWithPrevious } from '../scripts/lib/quality.mjs';

const MB = 1048576;
const NOW = new Date('2026-11-05T00:00:00Z');
const Q = {
  min_tiles: 900, max_tiles: 2600, min_size_mb: 2, max_size_mb: 9,
  required_layers: ['building', 'place', 'poi'], max_change_ratio: 1.5, max_osm_age_days: 45,
};
const good = () => ({
  file: 'camino-frances-01-3km-z15.pmtiles', size_bytes: Math.round(4.59 * MB), tiles: 1536,
  route_source: 'osm', maxzoom: 15, pack_max_zoom: 15, layers: ['building', 'place', 'poi', 'water'],
  osm_timestamp: '2026-11-03T20:21:00Z',
});
const run = (m, opts = {}) => checkManifest(m, Q, { publishing: true, now: NOW, ...opts });

test('a healthy build passes every gate', () => {
  const r = run(good());
  assert.deepEqual(r.errors, []);
});

test('the hand-drawn fallback route blocks publishing but not a measurement run', () => {
  const m = { ...good(), route_source: 'fallback' };
  assert.match(run(m).errors.join('\n'), /route_source is 'fallback', not 'osm'/);
  assert.deepEqual(run(m, { publishing: false }).errors, []);
});

test('tile count outside the band is an error, in both directions', () => {
  assert.match(run({ ...good(), tiles: 120 }).errors.join('\n'), /120 tiles, below the minimum of 900/);
  assert.match(run({ ...good(), tiles: 9000 }).errors.join('\n'), /9000 tiles, above the maximum of 2600/);
});

test('a manifest without a tile count is rejected (old build script)', () => {
  const m = good();
  delete m.tiles;
  assert.match(run(m).errors.join('\n'), /no tile count/);
});

test('size outside the band is an error, in both directions', () => {
  assert.match(run({ ...good(), size_bytes: 1 * MB }).errors.join('\n'), /below the minimum of 2 MB/);
  assert.match(run({ ...good(), size_bytes: 25 * MB }).errors.join('\n'), /above the maximum of 9 MB/);
});

test('missing vector layers are named', () => {
  const r = run({ ...good(), layers: ['building', 'water'] });
  assert.match(r.errors.join('\n'), /missing vector layers: place, poi/);
  assert.match(run({ ...good(), layers: [] }).errors.join('\n'), /lists no vector layers/);
});

test('a pack that stops below the requested zoom is an error', () => {
  assert.match(run({ ...good(), pack_max_zoom: 13 }).errors.join('\n'), /stops at z13 but z15 was requested/);
});

test('stale OSM data blocks publishing only', () => {
  const m = { ...good(), osm_timestamp: '2026-08-01T00:00:00Z' };
  assert.match(run(m).errors.join('\n'), /OSM data is 96 days old \(limit 45\)/);
  assert.deepEqual(run(m, { publishing: false }).errors, []);
  assert.match(run({ ...good(), osm_timestamp: 'not a date' }).errors.join('\n'), /no valid osm_timestamp/);
});

test('a stage without a quality band cannot be published', () => {
  assert.match(checkManifest(good(), undefined, { publishing: true, now: NOW }).errors.join('\n'), /no "quality" band/);
  const soft = checkManifest(good(), undefined, { publishing: false, now: NOW });
  assert.deepEqual(soft.errors, []);
  assert.equal(soft.warnings.length, 1);
});

test('comparison with the live pack: small monthly change passes, a jump fails', () => {
  const prev = { version: 20261003, size_bytes: Math.round(4.5 * MB) };
  assert.deepEqual(compareWithPrevious(good(), prev, Q).errors, []);
  const big = compareWithPrevious({ ...good(), size_bytes: 12 * MB }, prev, Q);
  assert.match(big.errors.join('\n'), /Pack size changed 2\.67x against the published pack v20261003/);
  const small = compareWithPrevious({ ...good(), size_bytes: 2.2 * MB }, prev, Q);
  assert.match(small.errors.join('\n'), /Pack size changed 0\.49x/);
});

test('comparison with a previous manifest also checks the tile count; no previous pack is fine', () => {
  const prev = { size_bytes: good().size_bytes, tiles: 1500 };
  assert.deepEqual(compareWithPrevious(good(), prev, Q).errors, []);
  assert.match(compareWithPrevious({ ...good(), tiles: 400 }, prev, Q).errors.join('\n'), /Tile count changed 0\.27x/);
  assert.deepEqual(compareWithPrevious(good(), null, Q).errors, []);
});
