// Tests of the calibration tool: scripts/lib/calibrate.mjs (pure functions) and scripts/calibrate_stage.mjs (the CLI).
// Run: npm test  (node --test "test/*.test.mjs")
//
// What they prove: floors and bands come from a real build with margin and never from a guess (golden test with the
// real stage-1 numbers, so the 30 / 5 mistake cannot come back); a broken build is refused; numbers already in a stage
// file are never changed silently; the stage file keeps every byte that is not a number being set; running twice
// changes nothing.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkManifest } from '../scripts/lib/quality.mjs';
import {
  STANDARD_LAYERS, applyPlan, measuredViews, pairViews, patchStageText, planCalibration,
  proposeFloors, proposeQuality, refusalReasons, refuseReason, viewName,
} from '../scripts/lib/calibrate.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MB = 1048576;

// ---- fixtures ------------------------------------------------------------------------------------------------------
// REAL numbers of stage 1: README "Measured sizes" (4.59 MB, 1,536 tiles; the brief rounds the size to 4,800,000 bytes,
// both give the same band) and the first real CI render (2026-11-06): Saint-Jean z15 had 570 poi, 322 transportation and
// 12 building features and 10 place labels, Roncesvalles z15 had 4 buildings, Orisson z13 had 12 mountain peaks. The
// report did not record a few other counts (Roncesvalles place labels, Orisson peak labels): they are set to 1, the
// floor CI already enforced and passed. The overview content is made up, it only has to be non-empty.
const GOLDEN_MANIFEST = {
  file: 'camino-frances-01-3km-z15.pmtiles', slug: 'camino-frances-01', stage_id: '40000000-0000-0000-0000-000000000001',
  route_source: 'osm', size_bytes: 4800000, tiles: 1536, maxzoom: 15, pack_min_zoom: 0, pack_max_zoom: 15,
  osm_timestamp: '2026-11-03T20:21:00Z',
  layers: ['boundary', 'building', 'landcover', 'landuse', 'mountain_peak', 'park', 'place', 'poi', 'transportation', 'transportation_name', 'water', 'water_name', 'waterway'],
};
const OVERVIEW = { name: 'overview', at: 'fit', zoom: 11, features: { landcover: 240, transportation: 410, water: 12 }, layers: { place: 3 } };
const SAINT_JEAN = { name: 'Saint-Jean-Pied-de-Port z15', at: [-1.2376, 43.1636, 15], zoom: 15, features: { poi: 570, transportation: 322, building: 12 }, layers: { place: 10 } };
const RONCESVALLES = { name: 'Roncesvalles z15', at: [-1.3195, 43.0094, 15], zoom: 15, features: { building: 4 }, layers: { place: 1 } };
const ORISSON = { name: 'Orisson z13', at: [-1.2185, 43.1097, 13], zoom: 13, features: { mountain_peak: 12 }, layers: { peak: 1 } };
const NOW = new Date('2026-11-05T00:00:00Z');

const clone = (v) => structuredClone(v);
function deepFreeze(o) {
  if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); }
  return o;
}
/** A render report as test/render_offline.mjs writes it: both phases, nothing wrong. */
function makeReport({ views = [OVERVIEW, SAINT_JEAN, RONCESVALLES, ORISSON], offline = views, ...patch } = {}) {
  return clone({
    pack: GOLDEN_MANIFEST.file, size_bytes: GOLDEN_MANIFEST.size_bytes, header: { minZoom: 0, maxZoom: 15, tiles: GOLDEN_MANIFEST.tiles },
    views, blocked_requests: [], failed_requests: [], navigator_online: false,
    device_offline: { views: offline, features: offline[0].features }, errors: [], ok: true, failures: [], ...patch,
  });
}
/** A stage file in measure mode: no quality band, views with empty floors. */
function measureStage(patch = {}) {
  return {
    slug: 'camino-frances-01', name: 'Saint-Jean-Pied-de-Port to Roncesvalles', route_slug: 'camino-frances', stage_number: 1,
    route_id: '20000000-0000-0000-0000-000000000001', stage_id: '40000000-0000-0000-0000-000000000001', buffer_km: 3, maxzoom: 15,
    render_checks: [SAINT_JEAN, RONCESVALLES, ORISSON].map((v) => ({ name: v.name, at: v.at, min_features: {}, min_labels: {} })),
    ...patch,
  };
}
const canonical = (obj) => `${JSON.stringify(obj, null, 2)}\n`;
const GOLDEN_BAND = {
  min_tiles: 920, max_tiles: 2460, min_size_mb: 2.7, max_size_mb: 7.4,
  required_layers: ['building', 'place', 'poi', 'transportation', 'transportation_name'], max_change_ratio: 1.5, max_osm_age_days: 45,
};
/** measureStage() after calibrating it from the golden build, written independently of the code under test. */
function goldenCalibratedStage() {
  const { render_checks: views, ...rest } = measureStage();
  const floors = [
    [{ poi: 228, transportation: 128, building: 4 }, { place: 1 }],
    [{}, { place: 1 }], // 4 buildings are fewer than 5: no floor
    [{ mountain_peak: 4 }, { peak: 1 }],
  ];
  return { ...rest, quality: GOLDEN_BAND, render_checks: views.map((v, i) => ({ ...v, min_features: floors[i][0], min_labels: floors[i][1] })) };
}

// ---- proposeQuality ------------------------------------------------------------------------------------------------
test('the band of the real stage-1 build: 0.6x to 1.6x, rounded outward, standard layers it has', () => {
  const band = proposeQuality(deepFreeze(clone(GOLDEN_MANIFEST)));
  assert.deepEqual(band, GOLDEN_BAND);
  // key order is the order of the stage files
  assert.deepEqual(Object.keys(band), ['min_tiles', 'max_tiles', 'min_size_mb', 'max_size_mb', 'required_layers', 'max_change_ratio', 'max_osm_age_days']);
});

test('the band rounds outward: size to 0.1 MB, tiles to 10, and the build it came from always passes the existing gate', () => {
  // 4,800,000 B = 4.578 MB: 0.6x = 2.746 -> 2.7 (down), 1.6x = 7.324 -> 7.4 (up); 1536 tiles: 921.6 -> 920, 2457.6 -> 2460
  const band = proposeQuality(GOLDEN_MANIFEST);
  assert.equal(band.min_size_mb, 2.7);
  assert.equal(band.max_size_mb, 7.4);
  assert.equal(band.min_tiles, 920);
  assert.equal(band.max_tiles, 2460);
  assert.deepEqual(checkManifest(GOLDEN_MANIFEST, band, { publishing: true, now: NOW }).errors, []);
  for (const size_bytes of [1, 7, 1000, 123456, 4800000, 9 * MB]) {
    for (const tiles of [1, 9, 17, 100, 1536, 9999]) {
      const m = { ...GOLDEN_MANIFEST, size_bytes, tiles };
      const b = proposeQuality(m);
      assert.ok(b.min_size_mb * MB <= size_bytes * 0.6 + 1e-6 && b.max_size_mb * MB >= size_bytes * 1.6 - 1e-6, `size ${size_bytes}`);
      assert.ok(b.min_tiles <= tiles * 0.6 + 1e-9 && b.max_tiles >= tiles * 1.6 - 1e-9, `tiles ${tiles}`);
      assert.deepEqual(checkManifest(m, b, { publishing: false }).errors, [], `the band must hold its own build (${size_bytes} B, ${tiles} tiles)`);
    }
  }
});

test('the band does not drift in floating point: exact tenths stay exact', () => {
  // 0.6 * 4.5 is 2.6999999999999997 and 1.6 * 1.5 is 2.4000000000000004 in floating point: plain arithmetic gives 2.6 and 2.5
  assert.equal(proposeQuality({ ...GOLDEN_MANIFEST, size_bytes: 4.5 * MB }).min_size_mb, 2.7);
  assert.equal(proposeQuality({ ...GOLDEN_MANIFEST, size_bytes: 1.5 * MB }).max_size_mb, 2.4);
  assert.equal(proposeQuality({ ...GOLDEN_MANIFEST, size_bytes: 3 * MB }).max_size_mb, 4.8);
  assert.equal(proposeQuality({ ...GOLDEN_MANIFEST, tiles: 1000 }).min_tiles, 600);
  assert.equal(proposeQuality({ ...GOLDEN_MANIFEST, tiles: 1000 }).max_tiles, 1600);
  assert.equal(proposeQuality({ ...GOLDEN_MANIFEST, tiles: 1500 }).min_tiles, 900);
  // against exact integer arithmetic (BigInt) over thousands of sizes and tile counts
  for (let k = 1; k <= 3000; k++) {
    const bytes = Math.round((k * MB) / 10);
    const b = proposeQuality({ ...GOLDEN_MANIFEST, size_bytes: bytes });
    assert.equal(b.min_size_mb, Number((BigInt(bytes) * 6n) / BigInt(MB)) / 10, `min at ${bytes} B`);
    assert.equal(b.max_size_mb, Number((BigInt(bytes) * 16n + BigInt(MB) - 1n) / BigInt(MB)) / 10, `max at ${bytes} B`);
  }
  for (let tiles = 1; tiles <= 3000; tiles++) {
    const b = proposeQuality({ ...GOLDEN_MANIFEST, tiles });
    assert.equal(b.min_tiles, Number((BigInt(tiles) * 6n) / 100n) * 10);
    assert.equal(b.max_tiles, Number((BigInt(tiles) * 16n + 99n) / 100n) * 10);
  }
});

test('required_layers is the standard list limited to what the pack has: never a layer it lacks', () => {
  const layers = (list) => proposeQuality({ ...GOLDEN_MANIFEST, layers: list }).required_layers;
  assert.deepEqual(STANDARD_LAYERS, ['building', 'place', 'poi', 'transportation', 'transportation_name']);
  assert.deepEqual(layers(['water', 'transportation', 'building', 'poi', 'place', 'transportation_name', 'landcover']), STANDARD_LAYERS, 'standard order, extra layers not added');
  assert.deepEqual(layers(['building', 'place', 'transportation', 'transportation_name']), ['building', 'place', 'transportation', 'transportation_name'], 'no poi layer: not required');
  assert.deepEqual(layers(['water']), []);
  assert.deepEqual(layers([]), []);
  assert.deepEqual(proposeQuality({ size_bytes: 5 * MB, tiles: 100 }).required_layers, [], 'a manifest without layers requires none');
});

test('proposeQuality needs a real size and tile count', () => {
  assert.throws(() => proposeQuality({ ...GOLDEN_MANIFEST, size_bytes: 0 }), /size_bytes must be a positive number/);
  assert.throws(() => proposeQuality({ ...GOLDEN_MANIFEST, tiles: 0 }), /tiles must be a positive integer/);
  assert.throws(() => proposeQuality({ ...GOLDEN_MANIFEST, tiles: undefined }), /tiles must be a positive integer/);
  assert.throws(() => proposeQuality(undefined), /size_bytes/);
});

// ---- proposeFloors -------------------------------------------------------------------------------------------------
test('golden: the floors of the real stage-1 views, and the 30 / 5 mistake cannot repeat', () => {
  const sj = proposeFloors(deepFreeze(clone(SAINT_JEAN)));
  assert.deepEqual(sj.min_features, { poi: 228, transportation: 128, building: 4 }); // floor(0.4 x 570), 322, 12
  assert.deepEqual(sj.min_labels, { place: 1 });
  const ron = proposeFloors(deepFreeze(clone(RONCESVALLES)));
  assert.equal('building' in ron.min_features, false, '4 buildings are fewer than 5: no floor, floor(0.4 x 4) = 1 is not proposed');
  assert.deepEqual(ron.min_features, {});
  assert.deepEqual(ron.min_labels, { place: 1 });
  assert.deepEqual(proposeFloors(ORISSON), { min_features: { mountain_peak: 4 }, min_labels: { peak: 1 } });
  // The guessed floors were 30 and 5 for a pack that renders 12 and 4. Whatever is measured, a proposed floor is
  // below what was measured, so a healthy pack can never fail its own floor.
  assert.ok(sj.min_features.building < SAINT_JEAN.features.building);
  assert.notEqual(sj.min_features.building, 30);
});

test('a floor needs at least 5 rendered features and is 40 percent of them, rounded down, never below 1', () => {
  const building = (n) => proposeFloors({ features: { building: n } }).min_features.building;
  for (const n of [0, 1, 2, 3, 4]) assert.equal(building(n), undefined, `${n} is too few for a floor`);
  assert.deepEqual([5, 6, 7, 8, 9, 10, 12, 15, 25, 570].map(building), [2, 2, 2, 3, 3, 4, 4, 6, 10, 228]);
  for (let n = 5; n <= 3000; n++) {
    const floor = building(n);
    assert.equal(floor, (n * 2 - ((n * 2) % 5)) / 5, `floor for ${n}`); // integer arithmetic only
    assert.ok(floor >= 1 && floor * 5 <= n * 2 && floor < n);
  }
  assert.equal(proposeFloors({ features: { poi: NaN, building: '12', transportation: undefined } }).min_features.building, undefined);
});

test('only poi, transportation, building and mountain_peak get min_features; only place and peak get min_labels', () => {
  const view = {
    features: { poi: 50, transportation: 50, building: 50, mountain_peak: 50, water: 99, landcover: 99, place: 99, boundary: 99 },
    layers: { place: 3, peak: 2, 'poi-name': 40, 'road-name': 40, road: 80 },
  };
  assert.deepEqual(proposeFloors(view), {
    min_features: { poi: 20, transportation: 20, building: 20, mountain_peak: 20 },
    min_labels: { place: 1, peak: 1 },
  });
  assert.deepEqual(proposeFloors({ layers: { place: 0, peak: 0 } }).min_labels, {}, 'no label drawn: no label floor');
  assert.deepEqual(proposeFloors({ layers: { peak: 1 } }).min_labels, { peak: 1 });
  assert.deepEqual(proposeFloors({}), { min_features: {}, min_labels: {} });
  assert.deepEqual(proposeFloors(undefined), { min_features: {}, min_labels: {} });
});

// ---- refuseReason --------------------------------------------------------------------------------------------------
test('a healthy build is not refused', () => {
  assert.equal(refuseReason(GOLDEN_MANIFEST, makeReport()), null);
  assert.deepEqual(refusalReasons(GOLDEN_MANIFEST, makeReport()), []);
  // a minimal report with only the keys the brief names is fine too
  assert.equal(refuseReason(GOLDEN_MANIFEST, { ok: true, errors: [], blocked_requests: [], failed_requests: [], views: [OVERVIEW, SAINT_JEAN], device_offline: { features: OVERVIEW.features } }), null);
});

test('every reason to refuse a baseline, one at a time', () => {
  const m = (patch) => ({ ...clone(GOLDEN_MANIFEST), ...patch });
  const withViews = (views, offline) => makeReport({ views, offline });
  const cases = [
    ['hand-drawn fallback route', m({ route_source: 'fallback' }), makeReport(), /route_source is 'fallback', not 'osm'/],
    ['no route_source at all', m({ route_source: undefined }), makeReport(), /route_source is missing/],
    ['a coastal stage built on the placeholder sea', m({ coastal: true, ocean_polygons: 'placeholder' }), makeReport(), /ocean_polygons is 'placeholder' on a coastal stage: the sea is missing/],
    ['a coastal stage that records no ocean_polygons', m({ coastal: true, ocean_polygons: undefined }), makeReport(), /ocean_polygons is missing on a coastal stage/],
    ['report not ok, with the failures that say why', m(), makeReport({ ok: false, failures: ['with the device offline, view "x": 3 rendered features in source layer "building", expected at least 30'] }), /says ok: false.*rendered features in source layer "building"/],
    ['report without ok', m(), makeReport({ ok: undefined }), /says ok: undefined/],
    ['console errors', m(), makeReport({ errors: ['console: boom'] }), /1 console, page or map error\(s\), the first: console: boom/],
    ['a request that tried to leave the device', m(), makeReport({ blocked_requests: ['https://example.com/x'] }), /1 request\(s\) tried to leave the device, the first: https:\/\/example\.com\/x/],
    ['a failed request', m(), makeReport({ failed_requests: ['http://127.0.0.1/a.pbf (HTTP 404)'] }), /1 request\(s\) failed, the first: http:\/\/127\.0\.0\.1\/a\.pbf \(HTTP 404\)/],
    ['size 0', m({ size_bytes: 0 }), makeReport({ size_bytes: undefined }), /no usable size_bytes \(0\)/],
    ['no size', m({ size_bytes: undefined }), makeReport({ size_bytes: undefined }), /no usable size_bytes \(undefined\)/],
    ['0 tiles', m({ tiles: 0 }), makeReport({ header: undefined }), /no usable tile count \(0\)/],
    ['no tile count (old build script)', m({ tiles: undefined }), makeReport({ header: undefined }), /no usable tile count \(undefined\)/],
    ['pack stops below the requested zoom', m({ pack_max_zoom: 13 }), makeReport(), /stops at z13 but z15 was requested/],
    ['a view with nothing drawn (network blocked)', m(), withViews([OVERVIEW, SAINT_JEAN, { ...ORISSON, features: {} }], [OVERVIEW, SAINT_JEAN, ORISSON]), /view "Orisson z13" rendered 0 features with the outside network blocked/],
    ['a view with nothing drawn (device offline)', m(), withViews([OVERVIEW, SAINT_JEAN, ORISSON], [OVERVIEW, { ...SAINT_JEAN, features: { poi: 0, building: 0 } }, ORISSON]), /view "Saint-Jean-Pied-de-Port z15" rendered 0 features with the device offline/],
    ['an overview with nothing drawn', m(), withViews([{ ...OVERVIEW, features: {} }, SAINT_JEAN]), /view "overview" rendered 0 features/],
    // CI draws the route and the corridor on top (--route, --corridor): a view on the route always has those, empty pack or not
    ['a view with only the route and corridor overlays', m(), withViews([OVERVIEW, { ...SAINT_JEAN, features: { route: 4, corridor: 2 } }, ORISSON]), /view "Saint-Jean-Pied-de-Port z15" rendered 0 features with the outside network blocked.*the route and corridor lines do not count/],
    ['nothing rendered offline (report without offline views)', m(), makeReport({ device_offline: { features: {} } }), /nothing rendered with the device offline/],
    ['a report with no views', m(), makeReport({ views: [], offline: [OVERVIEW] }), /has no views/],
    ['a report of another pack', m(), makeReport({ pack: 'camino-frances-02-3km-z15.pmtiles' }), /is for camino-frances-02-3km-z15\.pmtiles but the manifest is for camino-frances-01-3km-z15\.pmtiles/],
    ['a report of a pack of another size', m(), makeReport({ size_bytes: 1234 }), /saw a pack of 1234 bytes but the manifest says 4800000/],
    ['a report of a pack with other tiles', m(), makeReport({ header: { tiles: 999 } }), /saw 999 tiles but the manifest says 1536/],
  ];
  for (const [what, manifest, report, expected] of cases) {
    const reason = refuseReason(manifest, report);
    assert.equal(typeof reason, 'string', `${what}: must be refused`);
    assert.match(reason, expected, what);
  }
});

test('the placeholder sea only matters for a coastal stage', () => {
  // an inland stage never needs the sea, a coastal stage with the real polygons is fine, and a manifest from before the keys existed is not judged
  assert.equal(refuseReason({ ...GOLDEN_MANIFEST, coastal: false, ocean_polygons: 'placeholder' }, makeReport()), null);
  assert.equal(refuseReason({ ...GOLDEN_MANIFEST, coastal: true, ocean_polygons: 'osmdata' }, makeReport()), null);
  assert.equal(refuseReason(GOLDEN_MANIFEST, makeReport()), null);
});

test('refuseReason lists every problem of a very broken build, one per line', () => {
  const reason = refuseReason({ ...GOLDEN_MANIFEST, route_source: 'fallback', pack_max_zoom: 12 }, makeReport({ ok: false, blocked_requests: ['https://a.example/x'] }));
  assert.equal(reason.split('\n').length, 4);
  assert.match(reason, /fallback/);
  assert.match(reason, /ok: false/);
  assert.match(reason, /leave the device/);
  assert.match(reason, /z12/);
});

test('map features count, overlay features are ignored: one real feature next to the overlays is enough', () => {
  const view = { ...ORISSON, features: { route: 4, corridor: 2, mountain_peak: 1 } };
  assert.equal(refuseReason(GOLDEN_MANIFEST, makeReport({ views: [OVERVIEW, SAINT_JEAN, view] })), null);
  assert.deepEqual(proposeFloors(view), { min_features: {}, min_labels: { peak: 1 } }, 'overlays never produce a floor');
  const offlineOnly = makeReport({ device_offline: { features: { route: 3, corridor: 1 } } });
  assert.match(refuseReason(GOLDEN_MANIFEST, offlineOnly), /nothing rendered with the device offline/);
});

test('a pack that reaches the requested zoom, or has no zoom data, is not refused for zoom', () => {
  assert.equal(refuseReason({ ...GOLDEN_MANIFEST, pack_max_zoom: 15, maxzoom: 15 }, makeReport()), null);
  assert.equal(refuseReason({ ...GOLDEN_MANIFEST, pack_max_zoom: undefined }, makeReport()), null);
});

// ---- matching report views to the stage file -----------------------------------------------------------------------
test('views are paired by name and coordinates; the overview and views the stage does not list are left out', () => {
  const checks = [SAINT_JEAN, RONCESVALLES, ORISSON].map((v) => ({ name: v.name, at: v.at }));
  const extra = { name: '-1.2,43.1,14', at: [-1.2, 43.1, 14], features: { poi: 9 }, layers: {} };
  const pairs = pairViews(checks, [OVERVIEW, SAINT_JEAN, RONCESVALLES, ORISSON, extra]);
  assert.deepEqual(pairs.map((p) => [p.index, p.status, p.reportIndex]), [[0, 'matched', 1], [1, 'matched', 2], [2, 'matched', 3]]);
  assert.equal(pairs[1].view, RONCESVALLES);
});

test('a renamed or moved view is never matched, and neither is a name with another case', () => {
  const [renamed] = pairViews([{ name: 'Saint-Jean z15', at: SAINT_JEAN.at }], [OVERVIEW, SAINT_JEAN]);
  assert.equal(renamed.status, 'unmatched');
  assert.match(renamed.reason, /no view of that name/);
  const [moved] = pairViews([{ name: SAINT_JEAN.name, at: [-1.24, 43.16, 15] }], [OVERVIEW, SAINT_JEAN]);
  assert.equal(moved.status, 'unmatched');
  assert.match(moved.reason, /moved since the run.*-1\.24.*-1\.2376/);
  const [zoomed] = pairViews([{ name: SAINT_JEAN.name, at: [-1.2376, 43.1636, 14] }], [OVERVIEW, SAINT_JEAN]);
  assert.equal(zoomed.status, 'unmatched', 'another zoom is another place');
  const [cased] = pairViews([{ name: 'saint-jean-pied-de-port z15', at: SAINT_JEAN.at }], [OVERVIEW, SAINT_JEAN]);
  assert.equal(cased.status, 'unmatched');
  const [none] = pairViews([{ name: 'x', at: [1, 2, 3] }], undefined);
  assert.equal(none.status, 'unmatched');
});

test('repeated names pair by position, reordered views pair by their unique name', () => {
  const a = { ...SAINT_JEAN, name: 'village' };
  const b = { ...RONCESVALLES, name: 'village' };
  const pairs = pairViews([{ name: 'village', at: a.at }, { name: 'village', at: b.at }], [OVERVIEW, a, b]);
  assert.deepEqual(pairs.map((p) => p.reportIndex), [1, 2]);
  const swapped = pairViews([SAINT_JEAN, ORISSON].map((v) => ({ name: v.name, at: v.at })), [OVERVIEW, ORISSON, SAINT_JEAN]);
  assert.deepEqual(swapped.map((p) => [p.status, p.reportIndex]), [['matched', 2], ['matched', 1]]);
  const ambiguous = pairViews([{ name: 'village', at: a.at }], [OVERVIEW, { ...a, name: 'x' }, a, b]);
  assert.equal(ambiguous[0].status, 'unmatched', 'two views of that name and not at its position: do not guess');
});

test('a view without a name is called by its coordinates, like the render test does', () => {
  assert.equal(viewName({ at: [-1.5, 43.2, 14] }), '-1.5,43.2,14');
  assert.equal(viewName({ name: 'Zubiri', at: [1, 2, 3] }), 'Zubiri');
  assert.equal(viewName({}), undefined);
  const unnamed = { at: [-1.5, 43.2, 14] };
  const [p] = pairViews([unnamed], [OVERVIEW, { name: '-1.5,43.2,14', at: [-1.5, 43.2, 14], features: { poi: 1 } }]);
  assert.equal(p.status, 'matched');
});

test('a report that does not start with the overview is paired from its first view', () => {
  const [p] = pairViews([{ name: SAINT_JEAN.name, at: SAINT_JEAN.at }], [SAINT_JEAN, RONCESVALLES]);
  assert.deepEqual([p.status, p.reportIndex], ['matched', 0]);
});

test('the two render phases are merged to the lower number, since a floor must hold in both', () => {
  const offline = { ...SAINT_JEAN, features: { poi: 400, transportation: 322, building: 12 }, layers: { place: 3 } };
  const [, merged] = measuredViews(makeReport({ views: [OVERVIEW, SAINT_JEAN], offline: [OVERVIEW, offline] }));
  assert.deepEqual(merged.features, { poi: 400, transportation: 322, building: 12 });
  assert.deepEqual(merged.layers, { place: 3 });
  // a layer drawn in only one phase counts as 0 in the other
  const [, lost] = measuredViews(makeReport({ views: [OVERVIEW, SAINT_JEAN], offline: [OVERVIEW, { ...SAINT_JEAN, features: { poi: 570 } }] }));
  assert.deepEqual(lost.features, { poi: 570, transportation: 0, building: 0 });
  // no offline views, or offline views that do not line up: the first phase as it is
  assert.deepEqual(measuredViews({ views: [SAINT_JEAN] })[0], SAINT_JEAN);
  assert.deepEqual(measuredViews(makeReport({ views: [OVERVIEW, SAINT_JEAN], offline: [OVERVIEW, { ...offline, name: 'other' }] }))[1], SAINT_JEAN);
});

// ---- planCalibration -----------------------------------------------------------------------------------------------
const plan = (stage, patch = {}) => planCalibration({ stage: deepFreeze(clone(stage)), manifest: deepFreeze(clone(GOLDEN_MANIFEST)), report: deepFreeze(makeReport()), ...patch });

test('a stage in measure mode gets the band and the floors of the real build, and nothing else changes', () => {
  const p = plan(measureStage());
  assert.deepEqual(p.model, goldenCalibratedStage());
  assert.deepEqual(p.conflicts, []);
  assert.deepEqual(p.warnings, []);
  assert.equal(p.changed, true);
  assert.deepEqual(p.writes.quality, GOLDEN_BAND);
  assert.deepEqual(p.writes.views.map((w) => w.index), [0, 1, 2]);
  assert.equal('min_features' in p.writes.views[1], false, 'Roncesvalles has no floor to write');
  // 7 band keys, Saint-Jean 3 features + 1 label, Roncesvalles 1 label, Orisson 1 feature + 1 label
  assert.deepEqual(p.counts, { set: 7 + 4 + 1 + 2, replaced: 0, kept: 0, same: 0, conflict: 0 });
});

test('floors that exist stay, an empty min_features or min_labels is filled independently', () => {
  const stage = measureStage();
  stage.render_checks[0].min_features = { poi: 100 }; // someone gated poi only
  delete stage.render_checks[1].min_labels; // and one view has no min_labels key at all
  const p = plan(stage);
  assert.deepEqual(p.model.render_checks[0].min_features, { poi: 100 }, 'existing floors are kept as they are, nothing added to them');
  assert.deepEqual(p.model.render_checks[0].min_labels, { place: 1 }, 'the empty min_labels of the same view is filled');
  assert.deepEqual(p.model.render_checks[1].min_labels, { place: 1 });
  const row = p.views[0].rows.find((r) => r.field === 'min_features.transportation');
  assert.match(row.result, /not added: the view already has floors/);
  assert.equal(p.conflicts.length, 0);
});

test('an existing floor above what the build rendered is a conflict, not silently kept: the stage-1 mistake', () => {
  const stage = measureStage();
  stage.render_checks[0].min_features = { poi: 100, transportation: 60, building: 30 };
  stage.render_checks[1].min_features = { building: 5 };
  const p = plan(stage);
  assert.equal(p.conflicts.length, 2);
  assert.match(p.conflicts[0], /view "Saint-Jean-Pied-de-Port z15": min_features\.building is 30 in the stage file but this build rendered 12, so CI would fail/);
  assert.match(p.conflicts[1], /"Roncesvalles z15": min_features\.building is 5 .* rendered 4/);
  assert.equal(p.counts.conflict, 2);
  assert.deepEqual(p.model.render_checks[0].min_features, { poi: 100, transportation: 60, building: 30 }, 'nothing is replaced behind your back');
  // a label floor that nothing drew
  const labels = measureStage();
  labels.render_checks[2].min_labels = { peak: 2 };
  assert.match(plan(labels).conflicts[0], /min_labels\.peak is 2 .* rendered 1/);
});

test('an existing band is kept, and is a conflict when it does not hold the build', () => {
  const kept = plan(measureStage({ quality: { ...GOLDEN_BAND, min_size_mb: 2, max_size_mb: 9, min_tiles: 900, max_tiles: 2600 } }));
  assert.deepEqual(kept.conflicts, []);
  assert.deepEqual(kept.model.quality, { ...GOLDEN_BAND, min_size_mb: 2, max_size_mb: 9, min_tiles: 900, max_tiles: 2600 });
  assert.equal(kept.band.find((r) => r.field === 'min_size_mb').result, 'kept');
  assert.equal(kept.band.find((r) => r.field === 'max_change_ratio').result, 'same');
  const tight = plan(measureStage({ quality: { ...GOLDEN_BAND, max_size_mb: 4, min_tiles: 2000 } }));
  assert.equal(tight.conflicts.length, 2);
  assert.match(tight.conflicts.join('\n'), /quality band: .*pack is 4\.58 MB, above the maximum of 4 MB/);
  assert.match(tight.conflicts.join('\n'), /1536 tiles, below the minimum of 2000/);
  const partial = plan(measureStage({ quality: { min_size_mb: 2, max_size_mb: 9 } }));
  assert.deepEqual(partial.model.quality, { min_size_mb: 2, max_size_mb: 9 }, 'a band that exists is not completed behind your back');
  assert.match(partial.band.find((r) => r.field === 'min_tiles').result, /not set: the band exists without it/);
  const empty = plan(measureStage({ quality: {} }));
  assert.deepEqual(empty.model.quality, GOLDEN_BAND, 'an empty band counts as no band');
});

test('--recalibrate replaces what is derived, prints old -> new, flags every floor that goes down, leaves the rest', () => {
  const stage = measureStage({ quality: { min_tiles: 900, max_tiles: 2600, min_size_mb: 2, max_size_mb: 9, required_layers: ['place'], max_change_ratio: 2, max_osm_age_days: 30, owner: 'ops' } });
  stage.render_checks[0].min_features = { poi: 100, building: 30, water: 3 };
  stage.render_checks[0].min_labels = { place: 1, 'poi-name': 1 };
  stage.render_checks[1].min_features = { building: 5 };
  // this build drew 5 water features and 20 POI names in Saint-Jean, so those hand-added floors still hold
  const sj = { ...SAINT_JEAN, features: { ...SAINT_JEAN.features, water: 5 }, layers: { ...SAINT_JEAN.layers, 'poi-name': 20 } };
  const p = plan(stage, { recalibrate: true, report: makeReport({ views: [OVERVIEW, sj, RONCESVALLES, ORISSON] }) });
  assert.deepEqual(p.model.quality, { ...GOLDEN_BAND, max_change_ratio: 2, max_osm_age_days: 30, owner: 'ops' }, 'policy keys and unknown keys stay');
  assert.deepEqual(p.model.render_checks[0].min_features, { poi: 228, building: 4, water: 3, transportation: 128 }, 'water is not derived by this tool: untouched');
  assert.deepEqual(p.model.render_checks[0].min_labels, { place: 1, 'poi-name': 1 });
  assert.deepEqual(p.model.render_checks[1].min_features, {}, 'measured 4 is below 5: the floor of 5 is removed');
  const results = Object.fromEntries(p.views.flatMap((v) => v.rows.map((r) => [`${v.name}|${r.field}`, r.result])));
  assert.equal(results['Saint-Jean-Pied-de-Port z15|min_features.poi'], 'replaced: 100 -> 228');
  assert.equal(results['Saint-Jean-Pied-de-Port z15|min_features.building'], 'replaced: 30 -> 4 LOWERED');
  assert.match(results['Roncesvalles z15|min_features.building'], /^removed: 5 -> none LOWERED/);
  assert.equal(p.band.find((r) => r.field === 'min_tiles').result, 'replaced: 900 -> 920');
  assert.equal(p.band.find((r) => r.field === 'max_change_ratio').result, 'same');
  assert.equal(p.conflicts.length, 0);
});

test('a floor this tool does not derive is still reported when the build contradicts it', () => {
  const stage = measureStage();
  stage.render_checks[0].min_features = { water: 50 };
  const p = plan(stage, { recalibrate: true });
  assert.equal(p.conflicts.length, 1);
  assert.match(p.conflicts[0], /min_features\.water is 50 .* rendered 0/);
});

test('two render phases that disagree: the floors use the lower numbers, with a warning', () => {
  const offline = { ...SAINT_JEAN, features: { poi: 40, transportation: 322, building: 12 }, layers: { place: 0 } };
  const p = planCalibration({
    stage: measureStage(), manifest: GOLDEN_MANIFEST, report: makeReport({ views: [OVERVIEW, SAINT_JEAN, RONCESVALLES, ORISSON], offline: [OVERVIEW, offline, RONCESVALLES, ORISSON] }),
  });
  assert.deepEqual(p.model.render_checks[0].min_features, { poi: 16, transportation: 128, building: 4 });
  assert.deepEqual(p.model.render_checks[0].min_labels, {}, 'no place label in one phase: no label floor');
  assert.match(p.warnings.join('\n'), /view "Saint-Jean-Pied-de-Port z15": the two render phases .* measured different numbers; the floors use the lower of the two/);
});

test('a view the report does not measure is left alone with a warning; the rest is calibrated', () => {
  const stage = measureStage();
  stage.render_checks.push({ name: 'Zubiri z15', at: [-1.5, 42.93, 15], min_features: {}, min_labels: {} });
  stage.render_checks[1].at = [-1.32, 43.01, 15]; // Roncesvalles moved since the run
  const p = plan(stage);
  assert.deepEqual(p.writes.views.map((w) => w.index), [0, 2]);
  assert.deepEqual(p.model.render_checks[1], stage.render_checks[1]);
  assert.deepEqual(p.model.render_checks[3], stage.render_checks[3]);
  assert.equal(p.warnings.length, 2);
  assert.match(p.warnings[0], /view "Roncesvalles z15" was NOT calibrated: the view moved since the run/);
  assert.match(p.warnings[1], /view "Zubiri z15" was NOT calibrated: the report has no view of that name/);
  assert.deepEqual(p.views.map((v) => v.status), ['matched', 'unmatched', 'matched', 'unmatched']);
  assert.deepEqual(plan(measureStage(), { report: makeReport({ views: [OVERVIEW, SAINT_JEAN, RONCESVALLES, ORISSON, { name: 'extra', at: [1, 2, 3], features: { poi: 1 } }] }) }).unusedReportViews, ['extra']);
});

test('a stage without render_checks still gets its band; a pack without a standard layer says so', () => {
  const { render_checks: _unused, ...bare } = measureStage();
  const p = plan(bare);
  assert.deepEqual(p.writes.views, []);
  assert.deepEqual(p.model.quality, GOLDEN_BAND);
  assert.match(p.warnings.join('\n'), /no render_checks/);
  const noPoi = planCalibration({ stage: measureStage(), manifest: { ...GOLDEN_MANIFEST, layers: ['building', 'place', 'transportation', 'transportation_name'] }, report: makeReport() });
  assert.deepEqual(noPoi.model.quality.required_layers, ['building', 'place', 'transportation', 'transportation_name']);
  assert.match(noPoi.warnings.join('\n'), /no "poi" layer, so it is not required/);
  const none = planCalibration({ stage: measureStage(), manifest: { ...GOLDEN_MANIFEST, layers: undefined }, report: makeReport() });
  assert.deepEqual(none.model.quality.required_layers, []);
  assert.match(none.warnings.join('\n'), /lists no vector layers/);
});

test('running the plan on its own result changes nothing (idempotence), also with --recalibrate', () => {
  for (const recalibrate of [false, true]) {
    const first = plan(measureStage(), { recalibrate });
    const second = planCalibration({ stage: first.model, manifest: GOLDEN_MANIFEST, report: makeReport(), recalibrate });
    assert.equal(second.changed, false, `recalibrate=${recalibrate}`);
    assert.deepEqual(second.writes, { quality: undefined, views: [] });
    assert.deepEqual(second.model, first.model);
    assert.deepEqual(second.conflicts, []);
  }
});

// ---- writing: the text of the stage file ---------------------------------------------------------------------------
test('the canonical measure-mode file becomes the golden file, byte for byte', () => {
  const text = canonical(measureStage());
  const out = applyPlan(text, plan(measureStage()));
  const { render_checks: views, ...rest } = goldenCalibratedStage();
  assert.equal(out, canonical({ ...rest, render_checks: views }));
  assert.ok(out.indexOf('"quality"') < out.indexOf('"render_checks"'), 'quality sits before render_checks, as in stage 1');
  assert.ok(out.endsWith('}\n'));
});

test('on a generated stage file `quality` goes right after maxzoom, byte for byte where make_stages.py writes it (the committed stage 7)', async () => {
  // CI runs `make_stages.py --check`, which compares text: a calibrated file must come out of this tool exactly as the generator
  // would write it. (The tool used to insert quality before render_checks, i.e. after `waypoints`, and CI rejected the result.)
  const original = await readFile(new URL('../stages/camino-frances-07.json', import.meta.url), 'utf8');
  const { quality } = JSON.parse(original);
  assert.ok(quality, 'stage 7 is calibrated in the repository');
  const start = original.indexOf('  "quality": {');
  const end = original.indexOf('\n  },\n', start) + '\n  },\n'.length;
  assert.ok(start > 0 && end > start, 'found the quality member');
  const stripped = original.slice(0, start) + original.slice(end);
  assert.ok(!stripped.includes('"quality"'));
  assert.equal(patchStageText(stripped, { quality, views: [] }), original);
});

test('nothing to write: the text is returned untouched', () => {
  const text = canonical(goldenCalibratedStage());
  assert.equal(patchStageText(text, { quality: undefined, views: [] }), text);
  const p = plan(goldenCalibratedStage());
  assert.equal(p.changed, false);
  assert.equal(applyPlan(text, p), text);
});

function isSubsequence(small, big) {
  let i = 0;
  for (const line of big) if (line === small[i]) i++;
  return i === small.length;
}

test('every other byte survives: key order, \\u escapes, 3.0, CRLF, four-space indent, no final newline', () => {
  // As Python writes it with ensure_ascii, indent=4, Windows line endings, floats that happen to be whole numbers.
  const lines = [
    '{',
    '    "slug": "camino-frances-01",',
    '    "name": "Pamplona to Logro\\u00f1o \\u2013 N\\u00e1jera",',
    '    "stage_id": "40000000-0000-0000-0000-000000000001",',
    '    "search_bbox": [',
    '        -2.0,',
    '        42.0,',
    '        -1.0,',
    '        43.0',
    '    ],',
    '    "route_name_regex": "camino|\\\\bgr ?65\\\\b",',
    '    "coastal": false,',
    '    "buffer_km": 3.0,',
    '    "notes": {"keep": [1, 2.50, 3e2], "empty": {}, "none": null},',
    '    "render_checks": [',
    '        {',
    '            "name": "Saint-Jean-Pied-de-Port z15",',
    '            "at": [-1.2376, 43.1636, 15],',
    '            "min_features": {},',
    '            "min_labels": {}',
    '        },',
    '        {',
    '            "name": "Roncesvalles z15",',
    '            "at": [-1.3195, 43.0094, 15]',
    '        }',
    '    ]',
    '}',
  ];
  const text = lines.join('\r\n'); // no newline at the end
  const stage = JSON.parse(text);
  const report = makeReport({ views: [OVERVIEW, SAINT_JEAN, { ...RONCESVALLES, features: { building: 40, poi: 9 } }] });
  const p = planCalibration({ stage, manifest: GOLDEN_MANIFEST, report });
  const out = applyPlan(text, p);

  assert.deepEqual(JSON.parse(out), p.model);
  assert.deepEqual(JSON.parse(out).render_checks[1].min_features, { building: 16, poi: 3 }, 'a view without floor keys gets them');
  assert.ok(!/(^|[^\r])\n/.test(out), 'every line ending is still CRLF');
  assert.ok(!out.endsWith('\n'), 'no final newline was added');
  for (const kept of ['"name": "Pamplona to Logro\\u00f1o \\u2013 N\\u00e1jera",', '        -2.0,', '        43.0', '"route_name_regex": "camino|\\\\bgr ?65\\\\b",', '"buffer_km": 3.0,', '"notes": {"keep": [1, 2.50, 3e2], "empty": {}, "none": null},']) {
    assert.ok(out.includes(kept), `kept: ${kept}`);
  }
  assert.ok(out.includes('\r\n    "quality": {\r\n        "min_tiles": 920,'), 'new lines follow the file: four-space unit');
  assert.ok(out.includes('\r\n            "min_features": {\r\n                "poi": 228,'));
  // every original line that is not one of the replaced ones is still there, in the same order
  const replaced = new Set(['            "min_features": {},', '            "min_labels": {}', '            "at": [-1.3195, 43.0094, 15]']);
  assert.ok(isSubsequence(lines.filter((l) => !replaced.has(l)), out.split('\r\n')));
});

test('tab-indented files get tab-indented additions', () => {
  const text = '{\n\t"slug": "s",\n\t"render_checks": [\n\t\t{\n\t\t\t"name": "Orisson z13",\n\t\t\t"at": [-1.2185, 43.1097, 13],\n\t\t\t"min_features": {},\n\t\t\t"min_labels": {}\n\t\t}\n\t]\n}\n';
  const out = applyPlan(text, planCalibration({ stage: JSON.parse(text), manifest: GOLDEN_MANIFEST, report: makeReport() }));
  assert.equal(out, '{\n\t"slug": "s",\n\t"quality": {\n\t\t"min_tiles": 920,\n\t\t"max_tiles": 2460,\n\t\t"min_size_mb": 2.7,\n\t\t"max_size_mb": 7.4,\n\t\t"required_layers": [\n\t\t\t"building",\n\t\t\t"place",\n\t\t\t"poi",\n\t\t\t"transportation",\n\t\t\t"transportation_name"\n\t\t],\n\t\t"max_change_ratio": 1.5,\n\t\t"max_osm_age_days": 45\n\t},\n\t"render_checks": [\n\t\t{\n\t\t\t"name": "Orisson z13",\n\t\t\t"at": [-1.2185, 43.1097, 13],\n\t\t\t"min_features": {\n\t\t\t\t"mountain_peak": 4\n\t\t\t},\n\t\t\t"min_labels": {\n\t\t\t\t"peak": 1\n\t\t\t}\n\t\t}\n\t]\n}\n');
});

test('hand-written one-line floors stay one line, also when they are replaced', () => {
  const text = [
    '{',
    '  "slug": "camino-frances-01",',
    '  "render_checks": [',
    '    {',
    '      "name": "Saint-Jean-Pied-de-Port z15",',
    '      "at": [-1.2376, 43.1636, 15],',
    '      "min_features": { "poi": 3, "transportation": 3 },',
    '      "min_labels": { "place": 1, "road-name": 1 }',
    '    },',
    '    { "name": "Orisson z13", "at": [-1.2185, 43.1097, 13] }',
    '  ]',
    '}',
    '',
  ].join('\n');
  const stage = JSON.parse(text);
  const report = makeReport({ views: [OVERVIEW, SAINT_JEAN, ORISSON] });
  const out = applyPlan(text, planCalibration({ stage, manifest: GOLDEN_MANIFEST, report, recalibrate: true }));
  assert.ok(out.includes('      "min_features": { "poi": 228, "transportation": 128, "building": 4 },\n'), out);
  assert.ok(out.includes('      "min_labels": { "place": 1, "road-name": 1 }\n'));
  assert.ok(out.includes('{ "name": "Orisson z13", "at": [-1.2185, 43.1097, 13], "min_features": { "mountain_peak": 4 }, "min_labels": { "peak": 1 } }\n'));
});

test('a stage with no render_checks gets quality at the end; an empty quality object is filled in place', () => {
  const bare = '{\n  "slug": "s",\n  "maxzoom": 15\n}\n';
  assert.equal(
    applyPlan(bare, planCalibration({ stage: JSON.parse(bare), manifest: GOLDEN_MANIFEST, report: makeReport() })),
    `{\n  "slug": "s",\n  "maxzoom": 15,\n  "quality": ${JSON.stringify(GOLDEN_BAND, null, 2).split('\n').join('\n  ')}\n}\n`,
  );
  const emptyQuality = '{\n  "quality": {},\n  "slug": "s"\n}\n';
  const out = applyPlan(emptyQuality, planCalibration({ stage: JSON.parse(emptyQuality), manifest: GOLDEN_MANIFEST, report: makeReport() }));
  assert.deepEqual(JSON.parse(out).quality, GOLDEN_BAND);
  assert.ok(out.startsWith('{\n  "quality": {\n    "min_tiles": 920,'));
  assert.ok(out.endsWith('  },\n  "slug": "s"\n}\n'));
});

test('a compact empty object is replaced, an empty root gets its first member', () => {
  assert.equal(patchStageText('{}', { quality: { a: 1 }, views: [] }), '{\n  "quality": {\n    "a": 1\n  }\n}');
  assert.equal(patchStageText('{"a":1}', { quality: { b: 2 }, views: [] }), '{"a":1,"quality": { "b": 2 }}', 'a one-line file stays on one line');
});

test('the edited text must match the plan: a wrong edit is caught before anything is written', () => {
  const text = canonical(measureStage());
  const p = plan(measureStage());
  assert.throws(() => applyPlan(text, { ...p, model: { ...p.model, slug: 'something else' } }), /internal error: the edited stage file would not match the calibration plan/);
});

test('the text edit works on every stage file in stages/, whatever tool wrote it, and is idempotent', async () => {
  const dir = join(root, 'stages');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
  let checked = 0;
  for (const f of files) {
    const text = await readFile(join(dir, f), 'utf8');
    const stage = JSON.parse(text);
    if (typeof stage?.slug !== 'string') continue; // not a stage file
    checked++;
    const views = (stage.render_checks ?? []).map((c) => ({ name: viewName(c), at: c.at, features: { poi: 100, transportation: 100, building: 100, mountain_peak: 20, landcover: 10 }, layers: { place: 5, peak: 3 } }));
    const manifest = { ...GOLDEN_MANIFEST, slug: stage.slug, stage_id: stage.stage_id };
    const report = makeReport({ views: [OVERVIEW, ...views] });
    // recalibrate writes into files with floors and into files without: both paths run on the real formatting
    const first = planCalibration({ stage, manifest, report, recalibrate: true });
    const out = applyPlan(text, first); // throws unless the edited text parses to exactly the planned stage file
    assert.equal(out.endsWith('\n'), text.endsWith('\n'), `${f}: final newline`);
    const again = planCalibration({ stage: JSON.parse(out), manifest, report, recalibrate: true });
    assert.equal(applyPlan(out, again), out, `${f}: a second run changes nothing`);
  }
  assert.ok(checked >= 1, 'at least stage 1 is there');
});

// ---- the command line ----------------------------------------------------------------------------------------------
const dirs = [];
after(async () => { await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))); });

function runNode(args) {
  const child = spawn(process.execPath, args, { cwd: root, env: { PATH: process.env.PATH, HOME: process.env.HOME } });
  let out = '';
  let err = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { err += d; });
  return new Promise((resolve) => child.on('close', (code) => resolve({ code, out, err, all: out + err })));
}

/** A work directory with a stage file (object, or exact text), a manifest and a report; run() calls the CLI on them. */
async function setup({ stage = measureStage(), manifest = GOLDEN_MANIFEST, report = makeReport() } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'calibrate-test-'));
  dirs.push(dir);
  await mkdir(join(dir, 'dist', 'render'), { recursive: true });
  const f = {
    stage: join(dir, 'stage.json'),
    manifest: join(dir, 'dist', 'pack.json'),
    report: join(dir, 'dist', 'render', 'pack.report.json'),
  };
  await writeFile(f.stage, typeof stage === 'string' ? stage : canonical(stage));
  await writeFile(f.manifest, typeof manifest === 'string' ? manifest : JSON.stringify(manifest, null, 2));
  await writeFile(f.report, typeof report === 'string' ? report : JSON.stringify(report, null, 2));
  return {
    ...f, dir,
    run: (extra = []) => runNode(['scripts/calibrate_stage.mjs', f.stage, '--manifest', f.manifest, '--report', f.report, ...extra]),
    read: () => readFile(f.stage, 'utf8'),
  };
}

test('cli: a measure-mode stage is calibrated from the real build, and the table shows the measured value next to each number', async () => {
  const t = await setup();
  const r = await t.run();
  assert.equal(r.code, 0, r.all);
  assert.equal(await t.read(), canonical(goldenCalibratedStage()));
  assert.match(r.out, /min_features\.building\s+12\s+-\s+4\s+set/);
  assert.match(r.out, /min_features\.poi\s+570\s+-\s+228\s+set/);
  assert.match(r.out, /min_features\.transportation\s+322\s+-\s+128\s+set/);
  assert.match(r.out, /min_labels\.place\s+10\s+-\s+1\s+set/);
  assert.match(r.out, /view "Roncesvalles z15"[\s\S]*min_features\.building\s+4\s+-\s+-\s+no floor \(a count needs 5 or more\)/);
  assert.match(r.out, /min_size_mb\s+4\.58 MB\s+-\s+2\.7\s+set/);
  assert.match(r.out, /min_tiles\s+1536 tiles\s+-\s+920\s+set/);
  assert.match(r.out, /14 set, 0 replaced, 0 kept, 0 already equal, 0 contradicted/);
  assert.match(r.out, /Wrote .*stage\.json\. Review it \(git diff\), commit it, then re-run CI: it must be green before this stage is published\./);
});

test('cli: running it twice changes nothing', async () => {
  const t = await setup();
  assert.equal((await t.run()).code, 0);
  const once = await t.read();
  const r = await t.run();
  assert.equal(r.code, 0, r.all);
  assert.equal(await t.read(), once);
  assert.match(r.out, /Nothing to change: the stage file already holds these numbers\./);
  assert.match(r.out, /0 set, 0 replaced, 0 kept, 14 already equal/);
  const again = await t.run(['--recalibrate']);
  assert.equal(again.code, 0, again.all);
  assert.equal(await t.read(), once, '--recalibrate with the same build is a no-op too');
});

test('cli: --dry-run prints the table and writes nothing', async () => {
  const t = await setup();
  const before = await t.read();
  const r = await t.run(['--dry-run']);
  assert.equal(r.code, 0, r.all);
  assert.equal(await t.read(), before);
  assert.match(r.out, /min_features\.building\s+12\s+-\s+4\s+set/);
  assert.match(r.out, /Dry run: nothing written\./);
  assert.doesNotMatch(r.out, /Wrote /);
  const leftovers = (await readdir(t.dir)).filter((f) => f.endsWith('.tmp'));
  assert.deepEqual(leftovers, []);
});

test('cli: a build that must not be a baseline is refused with a plain message and nothing is written', async () => {
  const refused = [
    ['hand-drawn route', { manifest: { ...GOLDEN_MANIFEST, route_source: 'fallback' } }, /route_source is 'fallback', not 'osm'/],
    ['a coastal pack built on the placeholder sea', { manifest: { ...GOLDEN_MANIFEST, coastal: true, ocean_polygons: 'placeholder' } }, /ocean_polygons is 'placeholder' on a coastal stage/],
    ['request that left the device', { report: makeReport({ blocked_requests: ['https://tiles.example/0/0/0.pbf'] }) }, /1 request\(s\) tried to leave the device, the first: https:\/\/tiles\.example/],
    ['render report not ok', { report: makeReport({ ok: false, failures: ['1 request(s) tried to leave the device'] }) }, /render report says ok: false/],
    ['console errors', { report: makeReport({ errors: ['console: Failed to load glyphs'] }) }, /1 console, page or map error\(s\), the first: console: Failed to load glyphs/],
    ['an empty view', { report: makeReport({ views: [OVERVIEW, SAINT_JEAN, { ...RONCESVALLES, features: {} }, ORISSON], offline: [OVERVIEW, SAINT_JEAN, RONCESVALLES, ORISSON] }) }, /view "Roncesvalles z15" rendered 0 features/],
    ['a pack with 0 tiles', { manifest: { ...GOLDEN_MANIFEST, tiles: 0 }, report: makeReport({ header: undefined }) }, /no usable tile count \(0\)/],
    ['a pack that stops at z12', { manifest: { ...GOLDEN_MANIFEST, pack_max_zoom: 12 } }, /stops at z12 but z15 was requested/],
  ];
  for (const [what, patch, expected] of refused) {
    const t = await setup(patch);
    const before = await t.read();
    for (const flags of [[], ['--recalibrate'], ['--force-keep-existing'], ['--dry-run']]) {
      const r = await t.run(flags);
      assert.equal(r.code, 1, `${what} ${flags}: ${r.all}`);
      assert.match(r.err, /calibrate_stage: refusing to use camino-frances-01-3km-z15\.pmtiles as a baseline:/);
      assert.match(r.err, expected, what);
      assert.match(r.err, /Nothing was changed\. Fix the cause, rebuild, and calibrate from the new run\. There is no flag to override this\./);
      assert.equal(await t.read(), before, `${what}: the stage file must not change`);
    }
  }
});

test('cli: numbers that are already there are kept and shown, never changed', async () => {
  // the stage-1 file as it was committed after the first real build: floors about half of what was measured
  const stage = measureStage({ quality: { ...GOLDEN_BAND, min_tiles: 900, max_tiles: 2600, min_size_mb: 2, max_size_mb: 9 } });
  stage.render_checks[0].min_features = { poi: 100, transportation: 60, building: 6 };
  stage.render_checks[0].min_labels = { place: 1 };
  stage.render_checks[1].min_features = { building: 2 };
  stage.render_checks[1].min_labels = { place: 1 };
  stage.render_checks[2].min_features = { mountain_peak: 4 };
  stage.render_checks[2].min_labels = { peak: 1 };
  const t = await setup({ stage });
  const before = await t.read();
  const r = await t.run();
  assert.equal(r.code, 0, r.all);
  assert.equal(await t.read(), before);
  assert.match(r.out, /min_features\.building\s+12\s+6\s+4\s+kept/);
  assert.match(r.out, /min_size_mb\s+4\.58 MB\s+2\s+2\.7\s+kept/);
  assert.match(r.out, /Nothing to change/);
});

test('cli: a floor above what the real build rendered (the stage-1 guess, 30 and 5) stops the run', async () => {
  const stage = measureStage();
  stage.render_checks[0].min_features = { poi: 100, transportation: 60, building: 30 };
  stage.render_checks[1].min_features = { building: 5 };
  const t = await setup({ stage });
  const before = await t.read();
  for (const flags of [[], ['--dry-run']]) {
    const r = await t.run(flags);
    assert.equal(r.code, 1, r.all);
    assert.match(r.err, /2 existing number\(s\) in .* are contradicted by this build, so CI would fail on them:/);
    assert.match(r.err, /view "Saint-Jean-Pied-de-Port z15": min_features\.building is 30 in the stage file but this build rendered 12/);
    assert.match(r.err, /view "Roncesvalles z15": min_features\.building is 5 in the stage file but this build rendered 4/);
    assert.match(r.err, /Nothing was written\./);
    assert.match(r.err, /--recalibrate .*prints old -> new/);
    assert.match(r.err, /--force-keep-existing/);
    assert.match(r.out, /min_features\.building\s+12\s+30\s+4\s+CONFLICT/);
    assert.equal(await t.read(), before);
  }
});

test('cli: --force-keep-existing keeps the contradicted floors, still fills what is empty, and exits 0', async () => {
  const stage = measureStage();
  stage.render_checks[0].min_features = { building: 30 };
  const t = await setup({ stage });
  const r = await t.run(['--force-keep-existing']);
  assert.equal(r.code, 0, r.all);
  const out = JSON.parse(await t.read());
  assert.deepEqual(out.render_checks[0].min_features, { building: 30 }, 'kept anyway');
  assert.deepEqual(out.render_checks[0].min_labels, { place: 1 }, 'the empty min_labels is filled');
  assert.deepEqual(out.quality, GOLDEN_BAND);
  assert.match(r.out, /kept anyway \(--force-keep-existing\): 1 number\(s\) that CI will reject unless the build changes\./);
});

test('cli: --recalibrate replaces the floors, prints old -> new, and flags every floor that goes down', async () => {
  const stage = measureStage();
  stage.render_checks[0].min_features = { poi: 100, transportation: 60, building: 30 };
  stage.render_checks[1].min_features = { building: 5 };
  const t = await setup({ stage });
  const r = await t.run(['--recalibrate']);
  assert.equal(r.code, 0, r.all);
  assert.match(r.out, /min_features\.poi\s+570\s+100\s+228\s+replaced: 100 -> 228\n/);
  assert.match(r.out, /min_features\.building\s+12\s+30\s+4\s+replaced: 30 -> 4 LOWERED/);
  assert.match(r.out, /min_features\.building\s+4\s+5\s+-\s+removed: 5 -> none LOWERED/);
  // 7 band keys + 2 empty min_labels + 2 Orisson floors are set; poi, transportation, building (Saint-Jean) and
  // the removed Roncesvalles building floor are replaced, and 2 of those go down
  assert.match(r.out, /11 set, 4 replaced \(2 LOWERED\)/);
  const out = JSON.parse(await t.read());
  assert.deepEqual(out.render_checks[0].min_features, { poi: 228, transportation: 128, building: 4 });
  assert.deepEqual(out.render_checks[1].min_features, {});
  assert.deepEqual(out.quality, GOLDEN_BAND);
});

test('cli: a view that moved or was renamed since the run is not calibrated, the others are', async () => {
  const stage = measureStage();
  stage.render_checks[1].name = 'Roncesvalles (renamed)';
  stage.render_checks[2].at = [-1.2, 43.1, 13];
  const t = await setup({ stage });
  const r = await t.run();
  assert.equal(r.code, 0, r.all);
  assert.match(r.out, /view "Roncesvalles \(renamed\)": NOT calibrated, the report has no view of that name/);
  assert.match(r.out, /view "Orisson z13": NOT calibrated, the view moved since the run/);
  assert.match(r.out, /warning: view "Orisson z13" was NOT calibrated/);
  assert.match(r.out, /contradicted by this build, 2 view\(s\) NOT calibrated\n/, 'a partial calibration is visible in the summary line');
  assert.match(r.out, /2 view\(s\) were not calibrated and still have no floors: after the CI re-run, calibrate again from its report\./);
  const out = JSON.parse(await t.read());
  assert.deepEqual(out.render_checks[0].min_features, { poi: 228, transportation: 128, building: 4 });
  assert.deepEqual(out.render_checks[1].min_features, {});
  assert.deepEqual(out.render_checks[2].min_labels, {});
  assert.deepEqual(out.quality, GOLDEN_BAND);
});

test('cli: a manifest of another stage, or of an older version of this stage, is refused', async () => {
  const other = await setup({ manifest: { ...GOLDEN_MANIFEST, slug: 'camino-frances-02' } });
  const r1 = await other.run();
  assert.equal(r1.code, 1);
  assert.match(r1.err, /the manifest is for stage 'camino-frances-02' but .* is stage 'camino-frances-01'/);
  const changed = await setup({ manifest: { ...GOLDEN_MANIFEST, stage_id: '40000000-0000-0000-0000-0000000000aa' } });
  const r2 = await changed.run();
  assert.equal(r2.code, 1);
  assert.match(r2.err, /stage file changed after the build/);
  assert.equal(await changed.read(), canonical(measureStage()));
});

test('cli: the stage file keeps unrelated keys and formatting (Python style, CRLF, escapes)', async () => {
  const lines = [
    '{',
    '    "slug": "camino-frances-01",',
    '    "name": "Logro\\u00f1o to N\\u00e1jera",',
    '    "stage_id": "40000000-0000-0000-0000-000000000001",',
    '    "buffer_km": 3.0,',
    '    "render_checks": [',
    '        {',
    '            "name": "Orisson z13",',
    '            "at": [-1.2185, 43.1097, 13],',
    '            "min_features": {},',
    '            "min_labels": {}',
    '        }',
    '    ]',
    '}',
    '',
  ];
  const text = lines.join('\r\n');
  const t = await setup({ stage: text });
  const r = await t.run();
  assert.equal(r.code, 0, r.all);
  const out = await t.read();
  assert.ok(out.includes('"name": "Logro\\u00f1o to N\\u00e1jera",\r\n    "stage_id"'));
  assert.ok(out.includes('"buffer_km": 3.0,'));
  assert.ok(!/(^|[^\r])\n/.test(out));
  assert.ok(out.endsWith('}\r\n'));
  assert.equal(JSON.parse(out).render_checks[0].min_features.mountain_peak, 4);
  const replaced = new Set(['            "min_features": {},', '            "min_labels": {}']);
  assert.ok(isSubsequence(lines.filter((l) => !replaced.has(l)), out.split('\r\n')));
  const second = await t.run();
  assert.equal(second.code, 0);
  assert.equal(await t.read(), out, 'a second run changes nothing');
});

test('cli: wrong usage exits 2 and says how to call it', async () => {
  const t = await setup();
  const cases = [
    [['scripts/calibrate_stage.mjs'], /a stage file, --manifest and --report are required/],
    [['scripts/calibrate_stage.mjs', t.stage, '--manifest', t.manifest], /a stage file, --manifest and --report are required/],
    [['scripts/calibrate_stage.mjs', t.stage, '--report', t.report], /a stage file, --manifest and --report are required/],
    [['scripts/calibrate_stage.mjs', t.stage, t.stage, '--manifest', t.manifest, '--report', t.report], /a stage file, --manifest and --report are required/],
    [['scripts/calibrate_stage.mjs', t.stage, '--manifest', t.manifest, '--report', t.report, '--nope'], /Unknown option '--nope'/],
    [['scripts/calibrate_stage.mjs', t.stage, '--manifest', t.manifest, '--report', t.report, '--recalibrate', '--force-keep-existing'], /pick one/],
  ];
  for (const [args, expected] of cases) {
    const r = await runNode(args);
    assert.equal(r.code, 2, `${args.slice(1).join(' ')}: ${r.all}`);
    assert.match(r.err, expected);
    assert.match(r.err, /usage: calibrate_stage\.mjs <stage\.json> --manifest <dist\/pack\.json> --report <dist\/render\/pack\.report\.json>|pick one/);
  }
  const help = await runNode(['scripts/calibrate_stage.mjs', '--help']);
  assert.equal(help.code, 0);
  assert.match(help.out, /usage: calibrate_stage\.mjs/);
  assert.equal(await t.read(), canonical(measureStage()));
});

test('cli: unreadable or invalid input is a plain message, exit 1, and nothing is written', async () => {
  const missing = await setup();
  const r1 = await runNode(['scripts/calibrate_stage.mjs', missing.stage, '--manifest', join(missing.dir, 'nope.json'), '--report', missing.report]);
  assert.equal(r1.code, 1);
  assert.match(r1.err, /calibrate_stage: cannot read the manifest .*nope\.json \(ENOENT\)\./);
  const broken = await setup({ report: '{ not json' });
  const r2 = await broken.run();
  assert.equal(r2.code, 1);
  assert.match(r2.err, /the render report .* is not valid JSON/);
  const notObject = await setup({ manifest: '[]' });
  const r3 = await notObject.run();
  assert.equal(r3.code, 1);
  assert.match(r3.err, /the manifest must hold a JSON object/);
  assert.equal(await broken.read(), canonical(measureStage()));
});
