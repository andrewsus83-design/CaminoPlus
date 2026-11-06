// Plain-node checks for the Walk view style, overlay layers and the preview scene. Run: npm run test:map
import assert from 'node:assert/strict';
import { OSM_ATTRIBUTION } from '../config';
import { C, DAY, NIGHT, buildStyle, firstLabelLayerId, paletteFor } from '../style';
import { makeCamera, buildScene, ribbon, toLocal } from '../walkScene';
import { pointAlong } from '../geo';
import { routeLine } from '../sampleRoute';
import {
  ACCURACY_CAP_M, IMAGE, POI_KINDS, destinationLayers, kindHex, lineFeature, overlayColors, overviewRouteLayers, poiLayers, puckScreenY, stageEndFeature,
  townLayers, walkPadding, walkRouteLayers, walkerFeature, walkerIconName, walkerLayers, walkerOverviewLayers, type LayerSpec,
} from '../walkLayers';

let n = 0;
const test = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log(`ok ${n} - ${name}`);
};
const near = (a: number, b: number, tol: number, msg?: string) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} is not within ${tol} of ${b}`);

// WCAG contrast ratio of two #RRGGBB colours.
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

const packs = [{ id: 'stage1', url: 'pmtiles://file:///a.pmtiles', maxzoom: 15 }, { id: 'stage2', url: 'pmtiles://file:///b.pmtiles', maxzoom: 15 }];
const base = { glyphs: 'file:///g/{fontstack}/{range}.pbf', online: false, sources: packs };
type Layer = { id: string; type: string; minzoom?: number; maxzoom?: number; paint?: Record<string, unknown>; layout?: Record<string, unknown>; 'source-layer'?: string; source?: string };
const layersOf = (s: { layers: unknown[] }) => s.layers as Layer[];

/* ---------------------------------------------------------------- style */

test('3D buildings: a fill-extrusion from z15 with height, base, gradient and about 0.9 opacity, day and night', () => {
  for (const night of [false, true]) {
    const style = buildStyle({ ...base, night, buildings3d: true });
    const ext = layersOf(style).filter((l) => l.type === 'fill-extrusion');
    assert.equal(ext.length, 2, 'one per pack');
    for (const l of ext) {
      assert.equal(l['source-layer'], 'building');
      assert.equal(l.minzoom, 15);
      const p = l.paint as Record<string, unknown>;
      assert.match(JSON.stringify(p['fill-extrusion-height']), /render_height/);
      assert.match(JSON.stringify(p['fill-extrusion-base']), /render_min_height/);
      assert.equal(p['fill-extrusion-vertical-gradient'], true);
      near(p['fill-extrusion-opacity'] as number, 0.9, 0.05);
    }
  }
});

test('3D buildings off: no extrusion layer, and the flat footprint draws at every zoom from 13', () => {
  const off = buildStyle({ ...base, buildings3d: false });
  assert.equal(layersOf(off).filter((l) => l.type === 'fill-extrusion').length, 0);
  const flat = layersOf(off).find((l) => l.id === 'building-stage1') as Layer;
  assert.equal(flat.minzoom, 13);
  assert.equal(flat.maxzoom, undefined);
  const on = buildStyle({ ...base, buildings3d: true });
  assert.equal((layersOf(on).find((l) => l.id === 'building-stage1') as Layer).maxzoom, 15, 'with 3D the flat footprint hands over at z15');
});

test('3D buildings sit above the roads (they hide the street behind them) and below the labels', () => {
  const ids = layersOf(buildStyle({ ...base, buildings3d: true })).map((l) => l.id);
  const at = (id: string) => ids.indexOf(id);
  assert.ok(at('building-3d-stage1') > at('road-stage1') && at('building-3d-stage1') > at('path-stage1'));
  assert.ok(at('building-3d-stage1') < at('road-name-stage1') && at('building-3d-stage1') < at('place-stage1') && at('building-3d-stage1') < at('water-name-stage1'));
  // with two packs every template is emitted once per source before the next template
  assert.deepEqual(ids.slice(ids.indexOf('building-3d-stage1'), ids.indexOf('building-3d-stage1') + 2), ['building-3d-stage1', 'building-3d-stage2']);
});

test('layer ids are unique and the label anchor for the route overlay exists', () => {
  for (const night of [false, true]) {
    const style = buildStyle({ ...base, night, buildings3d: true });
    const ids = layersOf(style).map((l) => l.id);
    assert.equal(new Set(ids).size, ids.length);
    const anchor = firstLabelLayerId(packs);
    assert.equal(anchor, 'water-name-stage1');
    assert.ok(ids.includes(anchor as string));
  }
  assert.equal(firstLabelLayerId([]), undefined);
});

test('roads: wide at street zoom, with casing; street names along the line; paths stay visible', () => {
  const style = buildStyle({ ...base, buildings3d: true });
  const road = layersOf(style).find((l) => l.id === 'road-stage1') as Layer;
  // line-width is ['interpolate', ['exponential', b], ['zoom'], z0, w0, z1, w1, ...]; each width is a match on the road class
  const stops = ((road.paint as Record<string, unknown>)['line-width'] as unknown[]).slice(3);
  const at18 = stops[stops.indexOf(18) + 1] as unknown[];
  assert.ok(at18, 'has a stop at z18, the Walk view zoom range');
  assert.ok((at18[at18.length - 1] as number) >= 15, 'ordinary streets are at least 15 px wide at z18');
  assert.ok((at18[3] as number) > (at18[at18.length - 1] as number), 'major roads are wider than streets');
  assert.ok(layersOf(style).some((l) => l.id === 'road-case-stage1'));
  const names = layersOf(style).find((l) => l.id === 'road-name-stage1') as Layer;
  assert.equal((names.layout as Record<string, unknown>)['symbol-placement'], 'line');
  assert.equal((names.layout as Record<string, unknown>)['text-pitch-alignment'], 'viewport', 'upright street names when the map is tilted');
  const path = layersOf(style).find((l) => l.id === 'path-stage1') as Layer;
  const pw = ((path.paint as Record<string, unknown>)['line-width'] as unknown[]).slice(3);
  assert.equal(pw[pw.indexOf(18) + 1], 5, 'paths are 5 px wide at z18');
});

test('offline style needs no network: only pmtiles:// and file:// URLs, glyphs local, attribution intact', () => {
  for (const night of [false, true]) {
    const style = buildStyle({ ...base, night, buildings3d: true });
    const json = JSON.stringify(style);
    assert.doesNotMatch(json, /https?:\/\//);
    assert.equal(style.glyphs, 'file:///g/{fontstack}/{range}.pbf');
    for (const s of Object.values(style.sources)) {
      assert.match((s as { url: string }).url, /^pmtiles:\/\/file:\/\//);
      assert.equal((s as { attribution?: string }).attribution, OSM_ATTRIBUTION);
    }
  }
});

test('day and night are two palettes of one style', () => {
  const day = buildStyle({ ...base });
  const night = buildStyle({ ...base, night: true });
  assert.equal((layersOf(day)[0].paint as Record<string, unknown>)['background-color'], DAY.bg);
  assert.equal((layersOf(night)[0].paint as Record<string, unknown>)['background-color'], NIGHT.bg);
  assert.notEqual(DAY.bg, NIGHT.bg);
  assert.deepEqual(Object.keys(DAY).sort(), Object.keys(NIGHT).sort());
  assert.equal(paletteFor(true), NIGHT);
  assert.equal(paletteFor(false), DAY);
  assert.equal(day.layers.length, night.layers.length, 'same layers, other colours');
  assert.match(String(night.name), /night/);
  assert.notDeepEqual(day.light, night.light);
});

test('night map is dark but legible: labels, roads and 3D blocks stand out from the navy', () => {
  assert.ok(lum(NIGHT.bg) < 0.02, 'deep navy background');
  assert.ok(contrast(NIGHT.label, NIGHT.labelHalo) >= 7, 'street names vs halo');
  assert.ok(contrast(NIGHT.label, NIGHT.road) >= 4.5, 'street names on a road');
  assert.ok(contrast(NIGHT.place, NIGHT.placeHalo) >= 7, 'place names');
  assert.ok(contrast(NIGHT.poiLabel, NIGHT.poiHalo) >= 7, 'POI names');
  assert.ok(contrast(NIGHT.road, NIGHT.bg) >= 1.6, 'roads read against land');
  assert.ok(contrast(NIGHT.extrusion, NIGHT.bg) >= 2.2, 'blocks read against land');
  assert.ok(lum(NIGHT.extrusionTall) > lum(NIGHT.extrusion), 'taller blocks are lighter');
  assert.ok(contrast(NIGHT.waterName, NIGHT.water) >= 4.5, 'water names');
  assert.ok(contrast(NIGHT.peak, NIGHT.peakHalo) >= 7, 'peaks');
});

test('day map keeps the parchment look and readable names', () => {
  assert.equal(DAY.bg, C.parchment);
  assert.ok(contrast(DAY.label, DAY.labelHalo) >= 7);
  assert.ok(contrast(DAY.place, DAY.placeHalo) >= 7);
  assert.ok(contrast(DAY.poiLabel, DAY.poiHalo) >= 7);
});

/* ---------------------------------------------------------------- overlay layers */

const all = (night: boolean): LayerSpec[] => {
  const wr = walkRouteLayers(night);
  const ov = overviewRouteLayers(night);
  return [...ov.remaining, ...ov.done, ...wr.beyond, ...wr.ahead, ...wr.done, ...destinationLayers(night), ...poiLayers('', undefined, night), ...townLayers(night), ...walkerLayers(night), ...walkerOverviewLayers(night)];
};

test('overlay layer ids are unique across overview and Walk view, so switching never reuses a native id', () => {
  for (const night of [false, true]) {
    const ids = all(night).map((l) => l.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.filter((i) => i.startsWith('ov-')).length >= 6);
    assert.ok(ids.filter((i) => i.startsWith('walk-')).length >= 8);
  }
});

test('route ahead: a bold dotted line with a halo whose dots line up with the dots', () => {
  for (const night of [false, true]) {
    const [halo, dots] = walkRouteLayers(night).ahead;
    const dp = dots.paint as Record<string, unknown>;
    const hp = halo.paint as Record<string, unknown>;
    assert.equal(dots.layout?.['line-cap'], 'round');
    const dash = dp['line-dasharray'] as number[];
    const hdash = hp['line-dasharray'] as number[];
    assert.ok(dash[0] <= 0.05, 'near-zero dashes with round caps make dots');
    // widths are zoom stops [z, w, z, w, ...]: the halo is a constant ratio wider, and spacing (dash + gap) x width is equal
    const wd = (dp['line-width'] as unknown[]).slice(3).filter((_, i) => i % 2 === 1) as number[];
    const wh = (hp['line-width'] as unknown[]).slice(3).filter((_, i) => i % 2 === 1) as number[];
    assert.equal(wd.length, wh.length);
    wd.forEach((w, i) => {
      near((dash[0] + dash[1]) * w, (hdash[0] + hdash[1]) * wh[i], 1e-6, `spacing at stop ${i}`);
      assert.ok(wh[i] > w, 'halo wider than the dots');
    });
    assert.ok(wd[3] >= 8, 'bold at z16.5-17.5 (9.5 px dots at the Walk view zoom)');
  }
});

test('route colours: day is Atlantic Blue with a white halo, night is light blue with a dark halo, both readable on their roads', () => {
  const d = overlayColors(false);
  const k = overlayColors(true);
  assert.equal(d.route, C.blue);
  assert.equal(d.routeHalo, '#FFFFFF');
  assert.ok(contrast(d.route, DAY.road) >= 7);
  assert.ok(contrast(k.route, NIGHT.road) >= 3, 'night dots on a night road');
  assert.ok(contrast(k.route, NIGHT.bg) >= 7, 'night dots on the land');
  assert.ok(contrast(k.routeHalo, NIGHT.road) >= 1.3, 'night halo separates dots from the road');
  assert.equal(d.done, C.gold);
});

test('the part already walked is a thin gold line', () => {
  const [, done] = walkRouteLayers(false).done;
  const w = (done.paint as Record<string, unknown>)['line-width'] as unknown[];
  assert.equal((done.paint as Record<string, unknown>)['line-color'], C.gold);
  assert.ok((w[w.length - 1] as number) <= 4, 'thin');
});

test('destination pin: the red pin image anchored by its tip, with the stage name', () => {
  const [pin] = destinationLayers(false);
  assert.equal(pin.layout?.['icon-image'], IMAGE.pin);
  assert.equal(pin.layout?.['icon-anchor'], 'bottom');
  assert.deepEqual(pin.layout?.['text-field'], ['get', 'name']);
  assert.equal(stageEndFeature(null).features.length, 0);
  const f = stageEndFeature({ at: [-1.3, 43], name: 'Roncesvalles' });
  assert.equal(f.features[0].properties?.name, 'Roncesvalles');
});

test('pins: all kinds shown means no filter; some hidden means an "in" filter; none shown hides everything', () => {
  const kinds = POI_KINDS.map((k) => k.kind);
  const pin = (specs: LayerSpec[]) => specs.find((l) => l.id === 'walk-poi-pin') as LayerSpec;
  const glow = (specs: LayerSpec[]) => specs.find((l) => l.id === 'walk-poi-glow') as LayerSpec;
  assert.equal(pin(poiLayers('', undefined, false)).filter, undefined);
  assert.equal(pin(poiLayers('', kinds, false)).filter, undefined);
  assert.deepEqual(pin(poiLayers('', ['church', 'water'], false)).filter, ['in', ['get', 'kind'], ['literal', ['church', 'water']]]);
  assert.deepEqual(pin(poiLayers('', [], false)).filter, ['in', ['get', 'kind'], ['literal', []]]);
  assert.deepEqual(glow(poiLayers('', undefined, false)).filter, ['==', ['get', 'kind'], 'quest']);
  assert.deepEqual(glow(poiLayers('', ['church'], false)).filter, ['all', ['==', ['get', 'kind'], 'quest'], ['in', ['get', 'kind'], ['literal', ['church']]]]);
  for (const l of poiLayers('p-x', ['cafe'], true)) assert.ok(l.id.startsWith('walk-poi-'));
  assert.equal(POI_KINDS.length, 6);
});

test('pin colours match between map and chips, and the night church pin is lighter than the day one', () => {
  assert.ok(lum(kindHex(true).church) > lum(kindHex(false).church));
  assert.equal(kindHex(false).quest, C.gold);
  assert.ok(contrast(kindHex(true).church, NIGHT.bg) >= 5);
  assert.ok(contrast(kindHex(true).albergue, NIGHT.bg) >= 3);
});

test('walker: arrow puck with heading, grey dot for a sample position, accuracy disc capped for looks', () => {
  assert.equal(walkerIconName(false, true, true), IMAGE.sample);
  assert.equal(walkerIconName(false, false, true), IMAGE.arrowDay);
  assert.equal(walkerIconName(true, false, true), IMAGE.arrowNight);
  assert.equal(walkerIconName(true, false, false), IMAGE.dotNight);
  const real = walkerFeature({ at: [-1.2, 43.1], accuracyM: 30.4, sample: false, headingDeg: 212.6, night: false });
  assert.deepEqual(real.properties, { acc: 30.4, sample: false, heading: 213, icon: IMAGE.arrowDay });
  const sample = walkerFeature({ at: [-1.2, 43.1], accuracyM: 30, sample: true, headingDeg: 90, night: true });
  assert.equal(sample.properties?.icon, IMAGE.sample);
  assert.equal(sample.properties?.acc, 0, 'a sample position has no accuracy disc');
  assert.equal(walkerFeature({ at: [0, 0], accuracyM: 900, sample: false, headingDeg: null, night: false }).properties?.acc, ACCURACY_CAP_M);
  assert.equal(walkerFeature({ at: [0, 0], accuracyM: null, sample: false, headingDeg: null, night: false }).properties?.icon, IMAGE.dotDay);
  const [acc, puck] = walkerLayers(false);
  assert.equal((acc.paint as Record<string, unknown>)['circle-pitch-alignment'], 'map', 'the disc lies on the ground');
  assert.equal(puck.layout?.['icon-rotation-alignment'], 'map', 'the arrow points the way you walk, whatever the map bearing');
  assert.equal(puck.layout?.['icon-pitch-alignment'], 'viewport', 'the puck faces the camera');
  assert.deepEqual(puck.layout?.['icon-rotate'], ['get', 'heading']);
});

test('lineFeature always yields a valid LineString', () => {
  for (const pts of [[], [[1, 2]], [[1, 2], [3, 4]]] as [number, number][][]) {
    const g = lineFeature(pts).geometry as { coordinates: number[][] };
    assert.ok(g.coordinates.length >= 2);
  }
});

/* ---------------------------------------------------------------- camera */

test('walkPadding puts the puck in the lower part of the free map area', () => {
  const H = 844;
  const pad = walkPadding(H, 150, 240);
  const centre = (H + pad.top - pad.bottom) / 2; // where MapLibre puts the camera centre
  near(centre, puckScreenY(H, 150, 240), 1);
  near(puckScreenY(H, 150, 240), 150 + (H - 150 - 240) * 0.68, 1e-9);
  assert.ok(centre > H / 2 - 1, 'below the middle of the screen');
  assert.ok(centre > 150 + (H - 150 - 240) / 2, 'below the middle of the free area');
  assert.ok(centre < H - 240, 'above the card');
  assert.equal(pad.bottom, 0);
  // a tall card pushes the puck up: padding switches to the bottom
  const tall = walkPadding(H, 150, 520);
  assert.ok(tall.top >= 0 && tall.bottom >= 0 && tall.top * tall.bottom === 0);
  near((H + tall.top - tall.bottom) / 2, puckScreenY(H, 150, 520), 1);
  assert.ok(puckScreenY(H, 150, 520) < H - 520 + 1, 'still above the tall card');
});

/* ---------------------------------------------------------------- the preview scene */

test('preview camera: the walker is at the puck spot, ahead is higher and smaller, heading turns the world', () => {
  const cam = makeCamera(390, 560, 0, 3.2);
  const w = cam.project(0, 0, 0) as { sx: number; sy: number; k: number };
  near(w.sx, 195, 1e-9);
  near(w.sy, 560, 1e-9);
  near(w.k, 3.2, 1e-9);
  const a = cam.project(0, 100, 0) as { sx: number; sy: number; k: number };
  const b = cam.project(0, 400, 0) as { sx: number; sy: number; k: number };
  assert.ok(a.sy < w.sy && b.sy < a.sy, 'further ahead is higher on screen');
  assert.ok(a.k < w.k && b.k < a.k, 'and smaller');
  near(a.sx, 195, 1e-9);
  const roof = cam.project(0, 0, 20) as { sy: number };
  assert.ok(roof.sy < w.sy, 'height rises on screen');
  // heading 90 (east): a point 100 m east is straight ahead
  const east = makeCamera(390, 560, 90, 3.2).project(100, 0, 0) as { sx: number; sy: number };
  near(east.sx, 195, 1e-6);
  assert.ok(east.sy < 560);
  assert.equal(cam.project(0, -4000, 0), null, 'behind the camera');
});

test('preview scene: the real route as a road, blocks beside it at fixed places, none on the road', () => {
  const along = 9000;
  const s = buildScene(routeLine, along, 211, true);
  assert.ok(s.route.length >= 2 && s.roads.length >= 1 && s.blocks.length > 20);
  near(s.origin[0], pointAlong(routeLine, along)[0], 1e-9);
  // same place, same blocks (they do not jump when the walker moves a few metres)
  const s2 = buildScene(routeLine, along + 12, 211, true);
  const ids1 = new Set(s.blocks.map((b) => b.id));
  const shared = s2.blocks.filter((b) => ids1.has(b.id)).length;
  assert.ok(shared / s2.blocks.length > 0.8, `${shared} of ${s2.blocks.length} blocks kept`);
  assert.equal(buildScene(routeLine, along, 211, false).blocks.length, 0, 'buildings off draws none');
  // the route is a line: the first point is behind the walker, the walker is at the origin
  const far = s.route[s.route.length - 1];
  assert.ok(Math.hypot(far.x, far.y) > 1000);
  for (const b of s.blocks) {
    assert.equal(b.poly.length, 4);
    assert.ok(b.h >= 7 && b.h <= 31);
  }
  const r = ribbon([{ x: 0, y: 0 }, { x: 0, y: 100 }], 10);
  assert.equal(r.length, 4);
  near(Math.abs(r[0].x - r[3].x), 10, 1e-9);
  const p = toLocal([-1.5, 42.9], [-1.5, 42.901]);
  near(p.y, 110.54, 0.01);
});

console.log(`\n${n} passed`);
