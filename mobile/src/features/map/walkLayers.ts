// What the app draws on top of the base map: the route, the destination pin, our own pins and the walker.
// Pure data (no React, no native modules): LiveMap renders each spec with <Layer {...spec} />, and the tests and the
// GL JS render check use exactly the same specs, so what is validated is what ships.
import type { Feature, FeatureCollection } from 'geojson';
import type { LngLat } from './geo';
import type { PoiKind } from './sampleRoute';
import { C } from './style';

export type LayerSpec = {
  id: string;
  type: 'line' | 'circle' | 'symbol';
  filter?: unknown[];
  layout?: Record<string, unknown>;
  paint?: Record<string, unknown>;
  minzoom?: number;
  maxzoom?: number;
};

/* ------------------------------------------------------------------ camera */

export const WALK_ZOOM = 17.5;
export const WALK_PITCH = 60;
export const WALK_MIN_ZOOM = 15;
export const WALK_MAX_ZOOM = 18;

/**
 * Camera padding that puts the walker in the lower part of the free map area (between the banner and the card),
 * so there is look-ahead space above. MapLibre centres the camera in the padded rectangle:
 * centre y = (screenH + top - bottom) / 2. `puckAt` is how far down the free area the puck sits (0.68 = lower third).
 */
export const puckScreenY = (screenH: number, topUi: number, bottomUi: number, puckAt = 0.68) => topUi + Math.max(120, screenH - topUi - bottomUi) * puckAt;

export function walkPadding(screenH: number, topUi: number, bottomUi: number, puckAt = 0.68) {
  const y = puckScreenY(screenH, topUi, bottomUi, puckAt);
  return { top: Math.round(Math.max(0, 2 * y - screenH)), bottom: Math.round(Math.max(0, screenH - 2 * y)), left: 0, right: 0 };
}

/* ------------------------------------------------------------------ colours */

export type OverlayColors = {
  route: string; routeHalo: string; done: string; doneHalo: string; accuracy: string;
  label: string; labelHalo: string; town: string; townStroke: string; townFill: string;
};

export const overlayColors = (night: boolean): OverlayColors =>
  night
    ? { route: '#8CC8FF', routeHalo: '#06101C', done: C.gold, doneHalo: '#06101C', accuracy: '#4C9BFF', label: '#F6EFE2', labelHalo: '#08111E', town: '#F6EFE2', townStroke: '#8CC8FF', townFill: '#0C2340' }
    : { route: C.blue, routeHalo: '#FFFFFF', done: C.gold, doneHalo: '#FFFFFF', accuracy: C.blue, label: C.blue, labelHalo: C.parchment, town: C.blue, townStroke: C.blue, townFill: '#FFFFFF' };

/** Pin colours by kind: used by the map pins and by the "What is near" chips, so they match. */
export const KIND_HEX: Record<PoiKind, string> = { church: C.blue, albergue: C.red, water: C.fountain, cafe: C.goldDark, quest: C.gold, stamp: C.success };
export const POI_KINDS: { kind: PoiKind; label: string }[] = [
  { kind: 'church', label: 'Church' }, { kind: 'albergue', label: 'Albergue' }, { kind: 'water', label: 'Water' },
  { kind: 'cafe', label: 'Café' }, { kind: 'quest', label: 'Quest' }, { kind: 'stamp', label: 'Stamp' },
];
/** On the dark map the church and albergue pins are lighter so they do not sink into the navy. */
export const kindHex = (night: boolean): Record<PoiKind, string> => (night ? { ...KIND_HEX, church: '#6FA8E8', albergue: '#D4574A' } : KIND_HEX);
const kindColorExpr = (night: boolean) => ['match', ['get', 'kind'], ...Object.entries(kindHex(night)).flat(), C.stone];

const MED = ['Noto Sans Medium'];
const ROUND = { 'line-cap': 'round', 'line-join': 'round' } as const;

/* ------------------------------------------------------------------ route */

// Dotted route: round caps on near-zero-length dashes make dots. The halo is wider, so its dash pattern is scaled
// to give the same spacing in pixels (spacing = (dash + gap) x line width) and the dots line up.
const DOT_W = ['interpolate', ['linear'], ['zoom'], 13, 3.5, 15, 5.5, 16.5, 8, 17.5, 9.5, 19, 12];
const HALO_RATIO = 1.5;
const haloW = ['interpolate', ['linear'], ['zoom'], 13, 3.5 * HALO_RATIO, 15, 5.5 * HALO_RATIO, 16.5, 8 * HALO_RATIO, 17.5, 9.5 * HALO_RATIO, 19, 12 * HALO_RATIO];
const SPACING = 1.7;

/** Whole-route overview (Helicopter): thin dashed line with a halo, gold for the part already walked. */
export function overviewRouteLayers(night: boolean) {
  const k = overlayColors(night);
  return {
    remaining: [
      { id: 'ov-remaining-halo', type: 'line', layout: ROUND, paint: { 'line-color': k.routeHalo, 'line-width': 6, 'line-opacity': 0.85 } },
      { id: 'ov-remaining', type: 'line', layout: ROUND, paint: { 'line-color': k.route, 'line-width': 3, 'line-dasharray': [1.2, 1.6], 'line-opacity': night ? 0.9 : 0.75 } },
    ] as LayerSpec[],
    done: [
      { id: 'ov-done-halo', type: 'line', layout: ROUND, paint: { 'line-color': k.doneHalo, 'line-width': 8 } },
      { id: 'ov-done', type: 'line', layout: ROUND, paint: { 'line-color': k.done, 'line-width': 5 } },
    ] as LayerSpec[],
  };
}

/** Walk view: the way ahead to the end of the stage as a bold dotted line, a faint line beyond, a thin gold line behind. */
export function walkRouteLayers(night: boolean) {
  const k = overlayColors(night);
  return {
    beyond: [
      { id: 'walk-beyond', type: 'line', layout: ROUND, paint: { 'line-color': k.route, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 17, 4], 'line-dasharray': [2, 2], 'line-opacity': 0.5 } },
    ] as LayerSpec[],
    ahead: [
      { id: 'walk-ahead-halo', type: 'line', layout: ROUND, paint: { 'line-color': k.routeHalo, 'line-width': haloW, 'line-dasharray': [0.01, (SPACING * 1) / HALO_RATIO - 0.01], 'line-opacity': night ? 0.9 : 0.95 } },
      { id: 'walk-ahead', type: 'line', layout: ROUND, paint: { 'line-color': k.route, 'line-width': DOT_W, 'line-dasharray': [0.01, SPACING - 0.01] } },
    ] as LayerSpec[],
    done: [
      { id: 'walk-done-halo', type: 'line', layout: ROUND, paint: { 'line-color': k.doneHalo, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 3.5, 17, 6.5], 'line-opacity': 0.8 } },
      { id: 'walk-done', type: 'line', layout: ROUND, paint: { 'line-color': k.done, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.8, 17, 3.6] } },
    ] as LayerSpec[],
  };
}

/** Red pin at the end of the stage, with its name. The image is `pin-destination` (assets/map). */
export function destinationLayers(night: boolean): LayerSpec[] {
  const k = overlayColors(night);
  return [
    {
      id: 'walk-end', type: 'symbol',
      layout: {
        'icon-image': 'pin-destination', 'icon-anchor': 'bottom', 'icon-allow-overlap': true, 'icon-ignore-placement': true,
        'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.55, 15, 0.8, 17.5, 1],
        'text-field': ['get', 'name'], 'text-font': MED, 'text-size': ['interpolate', ['linear'], ['zoom'], 8, 12, 17, 16], 'text-anchor': 'left', 'text-offset': [1.5, -1.6], 'text-optional': true, 'text-max-width': 9,
      },
      paint: { 'text-color': k.label, 'text-halo-color': k.labelHalo, 'text-halo-width': 2 },
    },
  ];
}

/* ------------------------------------------------------------------ our pins (church, albergue, water, cafe, quest, stamp) */

/** `kinds` undefined = show all. An empty list hides every pin. */
const kindFilter = (kinds?: PoiKind[]) => (kinds && kinds.length < POI_KINDS.length ? ['in', ['get', 'kind'], ['literal', kinds]] : undefined);
const withKinds = (base: unknown[] | undefined, kinds?: PoiKind[]) => {
  const f = kindFilter(kinds);
  if (!f) return base;
  return base ? ['all', base, f] : f;
};

export function poiLayers(selectedId: string, kinds: PoiKind[] | undefined, night: boolean): LayerSpec[] {
  const k = overlayColors(night);
  const sel = ['==', ['get', 'id'], selectedId];
  const spec = (s: LayerSpec, filter?: unknown[]) => ({ ...s, ...(filter ? { filter } : {}) }) as LayerSpec;
  return [
    // RPG-style pins: quests get a soft gold glow ring.
    spec({ id: 'walk-poi-glow', type: 'circle', paint: { 'circle-radius': 22, 'circle-color': C.gold, 'circle-opacity': 0.22, 'circle-blur': 0.4 } }, withKinds(['==', ['get', 'kind'], 'quest'], kinds)),
    spec({
      id: 'walk-poi-pin', type: 'circle',
      paint: {
        'circle-radius': ['case', sel, 15, 11],
        'circle-color': kindColorExpr(night),
        'circle-stroke-color': ['case', sel, C.gold, '#FFFFFF'],
        'circle-stroke-width': ['case', sel, 4, 3],
      },
    }, withKinds(undefined, kinds)),
    spec({ id: 'walk-poi-core', type: 'circle', paint: { 'circle-radius': 3.5, 'circle-color': '#FFFFFF' } }, withKinds(undefined, kinds)),
    spec({
      id: 'walk-poi-label', type: 'symbol', minzoom: 14,
      layout: { 'text-field': ['get', 'name'], 'text-font': MED, 'text-size': ['interpolate', ['linear'], ['zoom'], 14, 12, 18, 15], 'text-offset': [0, 1.6], 'text-anchor': 'top', 'text-optional': true, 'text-max-width': 9 },
      paint: { 'text-color': k.label, 'text-halo-color': k.labelHalo, 'text-halo-width': 1.8 },
    }, withKinds(undefined, kinds)),
  ];
}

/** Towns of the whole-route overview. */
export function townLayers(night: boolean): LayerSpec[] {
  const k = overlayColors(night);
  return [
    { id: 'ov-town-dot', type: 'circle', paint: { 'circle-radius': ['case', ['get', 'major'], 7, 4.5], 'circle-color': k.townFill, 'circle-stroke-color': k.townStroke, 'circle-stroke-width': 2.5 } },
    {
      id: 'ov-town-label', type: 'symbol', filter: ['any', ['get', 'major'], ['>=', ['zoom'], 7]],
      layout: { 'text-field': ['get', 'name'], 'text-font': MED, 'text-size': ['case', ['get', 'major'], 15, 12], 'text-offset': [0.9, 0], 'text-anchor': 'left' },
      paint: { 'text-color': k.town, 'text-halo-color': k.labelHalo, 'text-halo-width': 1.8 },
    },
  ];
}

/* ------------------------------------------------------------------ the walker */

/** Image names the walker and destination layers use; LiveMap registers the PNGs from assets/map under these names. */
export const IMAGE = {
  pin: 'pin-destination',
  arrowDay: 'puck-arrow-day', arrowNight: 'puck-arrow-night', dotDay: 'puck-dot-day', dotNight: 'puck-dot-night', sample: 'puck-sample',
} as const;

export function walkerIconName(night: boolean, sample: boolean, hasHeading: boolean) {
  if (sample) return IMAGE.sample;
  if (hasHeading) return night ? IMAGE.arrowNight : IMAGE.arrowDay;
  return night ? IMAGE.dotNight : IMAGE.dotDay;
}

/** Walk view: translucent accuracy disc lying on the ground, and the puck (a disc with a heading arrow) facing the camera. */
export function walkerLayers(night: boolean): LayerSpec[] {
  const k = overlayColors(night);
  return [
    {
      id: 'walk-walker-accuracy', type: 'circle',
      paint: {
        // metres -> pixels (512 px tiles, latitude ~43 degrees: 57,243 m/px at z0)
        'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 10, ['/', ['get', 'acc'], 55.9], 20, ['/', ['get', 'acc'], 0.0546]],
        'circle-color': k.accuracy, 'circle-opacity': night ? 0.16 : 0.1,
        'circle-stroke-color': k.accuracy, 'circle-stroke-width': 1.2, 'circle-stroke-opacity': night ? 0.5 : 0.35,
        'circle-pitch-alignment': 'map', 'circle-pitch-scale': 'map',
      },
    },
    {
      id: 'walk-walker-puck', type: 'symbol',
      layout: {
        'icon-image': ['get', 'icon'], 'icon-rotate': ['get', 'heading'], 'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'viewport',
        'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-size': 1,
      },
    },
  ];
}

/** Overview: a plain dot (grey when it is only a sample position). */
export function walkerOverviewLayers(night: boolean): LayerSpec[] {
  return [
    { id: 'ov-walker-halo', type: 'circle', paint: { 'circle-radius': 10, 'circle-color': night ? '#06101C' : '#FFFFFF' } },
    { id: 'ov-walker-dot', type: 'circle', paint: { 'circle-radius': 6.5, 'circle-color': ['case', ['get', 'sample'], C.stone, night ? '#4C9BFF' : C.blue] } },
  ];
}

/* ------------------------------------------------------------------ GeoJSON for the sources */

const emptyLine: LngLat[] = [[0, 0], [0, 0]];
/** A LineString feature (at least two points, so an empty route is a harmless zero-length line). */
export const lineFeature = (coords: LngLat[]): Feature => ({
  type: 'Feature', properties: {},
  geometry: { type: 'LineString', coordinates: coords.length >= 2 ? coords : coords.length === 1 ? [coords[0], coords[0]] : emptyLine },
});

/** A visual cap on the accuracy disc: past 150 m it would cover the whole screen and say nothing more. */
export const ACCURACY_CAP_M = 150;

export function walkerFeature(o: { at: LngLat; accuracyM: number | null; sample: boolean; headingDeg: number | null; night: boolean }): Feature {
  const hasHeading = o.headingDeg != null && Number.isFinite(o.headingDeg);
  return {
    type: 'Feature',
    properties: {
      acc: o.sample ? 0 : Math.min(Math.max(o.accuracyM ?? 0, 0), ACCURACY_CAP_M),
      sample: o.sample,
      heading: hasHeading ? Math.round(o.headingDeg as number) : 0,
      icon: walkerIconName(o.night, o.sample, hasHeading && !o.sample),
    },
    geometry: { type: 'Point', coordinates: o.at },
  };
}

export const stageEndFeature = (end: { at: LngLat; name: string } | null): FeatureCollection => ({
  type: 'FeatureCollection',
  features: end ? [{ type: 'Feature', properties: { name: end.name }, geometry: { type: 'Point', coordinates: end.at } }] : [],
});
