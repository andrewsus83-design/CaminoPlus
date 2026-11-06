// One MapLibre style for both modes, in the CaminoPlus palette (same layers as
// tools/offline-maps/viewer/style.js). Both sources use the OpenMapTiles schema:
//   online:  MapTiler "v3" tiles (needs EXPO_PUBLIC_MAPTILER_KEY, never cached offline)
//   offline: our own OSM .pmtiles packs, one source per downloaded stage
// Glyphs are always the bundled Noto Sans files copied to the device (glyphs.ts).
//
// Two palettes: day (parchment) and night (deep navy, see isNight in nav.ts). Optional 3D buildings
// (fill-extrusion from the `building` layer, z15 and up) for the Walk view. Nothing here needs the network.
import type { LayerSpecification, StyleSpecification } from '@maplibre/maplibre-react-native';
import { FALLBACK_ATTRIBUTION, MAPTILER_ATTRIBUTION, OSM_ATTRIBUTION, hasMapTiler } from './config';

export const C = {
  parchment: '#F6EFE2', ink: '#2B2A26', gold: '#D9A21B', goldDark: '#7A5A0C', blue: '#14365D', red: '#A63D2F',
  water: '#BFD4E6', wood: '#D6E2C4', grass: '#E4EAD3', farm: '#EEE9D6', built: '#EADFCB', building: '#DCCDB3',
  road: '#FFFFFF', roadCase: '#D3C4A8', path: '#8A6B3D', stone: '#8C8272', success: '#2F6B4F', fountain: '#2E86C1',
} as const;

export type Light = { anchor: 'viewport' | 'map'; color: string; intensity: number; position: [number, number, number] };

/** Everything the base map paints, so day and night are two values of one style. */
export type Palette = {
  name: 'day' | 'night';
  bg: string; wood: string; grass: string; farm: string; rock: string; built: string;
  water: string; waterLine: string; waterName: string;
  buildingFlat: string; buildingEdge: string;
  /** colour of 3D blocks: low buildings, and the colour they blend to at 60 m and more */
  extrusion: string; extrusionTall: string; extrusionOpacity: number;
  road: string; roadMajor: string; roadCase: string; roadMajorCase: string; path: string;
  boundary: string;
  label: string; labelHalo: string; place: string; placeHalo: string; poiLabel: string; poiHalo: string; peak: string; peakHalo: string;
  poiStroke: string;
  light: Light;
};

export const DAY: Palette = {
  name: 'day',
  bg: C.parchment, wood: C.wood, grass: C.grass, farm: C.farm, rock: '#E2DDD3', built: C.built,
  water: C.water, waterLine: C.water, waterName: C.blue,
  buildingFlat: C.building, buildingEdge: C.roadCase,
  extrusion: '#E6D9C0', extrusionTall: '#D4C3A2', extrusionOpacity: 0.9,
  road: C.road, roadMajor: '#F3D27E', roadCase: C.roadCase, roadMajorCase: '#D9B55C', path: C.path,
  boundary: C.blue,
  label: C.ink, labelHalo: '#FFFFFF', place: C.blue, placeHalo: C.parchment, poiLabel: C.ink, poiHalo: C.parchment, peak: C.goldDark, peakHalo: C.parchment,
  poiStroke: '#FFFFFF',
  light: { anchor: 'viewport', color: '#FFFFFF', intensity: 0.5, position: [1.15, 210, 30] },
};

export const NIGHT: Palette = {
  name: 'night',
  bg: '#0C1626', wood: '#10272F', grass: '#112033', farm: '#122238', rock: '#17263A', built: '#15263C',
  water: '#0A2F55', waterLine: '#0F4070', waterName: '#8CC0F2',
  buildingFlat: '#1F375A', buildingEdge: '#2B4871',
  extrusion: '#355987', extrusionTall: '#4A74AA', extrusionOpacity: 0.92,
  road: '#3B5780', roadMajor: '#6A8FC4', roadCase: '#070E19', roadMajorCase: '#0A1424', path: '#D2A95E',
  boundary: '#8CC0F2',
  label: '#E6EEF9', labelHalo: '#08111E', place: '#F6EFE2', placeHalo: '#08111E', poiLabel: '#C9D8EC', poiHalo: '#08111E', peak: '#E8B53A', peakHalo: '#08111E',
  poiStroke: '#08111E',
  light: { anchor: 'viewport', color: '#B7CDEE', intensity: 0.42, position: [1.15, 210, 32] },
};

export const paletteFor = (night: boolean) => (night ? NIGHT : DAY);

const REG = ['Noto Sans Regular'];
const MED = ['Noto Sans Medium'];
const ITA = ['Noto Sans Italic'];
const NAME = ['coalesce', ['get', 'name:en'], ['get', 'name']];

export type TileSource = { id: string; url: string; maxzoom?: number };

// Layer specs without a source; typed loosely here and checked by MapLibre at runtime.
type Template = Record<string, unknown> & { id: string };

// Road widths in px by zoom: [zoom, major roads, secondary and tertiary, everything else]. Wide enough at the Walk
// view's zoom (17.5) to read as streets; the casing is a little wider on each side.
const ROAD_W: [number, number, number, number][] = [
  [10, 1.4, 0.9, 0.5], [13, 3.2, 2.2, 1.4], [15, 6.5, 5, 3.6], [16, 10, 8, 6], [17, 15, 12, 9.5], [18, 26, 21, 17], [20, 60, 48, 38],
];
const MAJOR = ['motorway', 'trunk', 'primary'];
const MID = ['secondary', 'tertiary'];
const roadWidth = (casing: boolean) => [
  'interpolate', ['exponential', 1.4], ['zoom'],
  ...ROAD_W.flatMap(([z, a, b, c]) => {
    const k = casing ? (z < 13 ? 0.7 : z < 16 ? 1.4 : z < 18 ? 2 : 3) : 0;
    return [z, ['match', ['get', 'class'], MAJOR, a + k, MID, b + k, c + k]];
  }),
];
const ROAD_CLASSES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service'];

const sized = (base: number, big: number, from = 12, to = 17) => ['interpolate', ['linear'], ['zoom'], from, base, to, big];

// Order matters: with several packs, every template is emitted once per source before
// the next template, so pack B's landcover never covers pack A's roads at the seam.
function templates(p: Palette, buildings3d: boolean): Template[] {
  return [
    {
      id: 'landcover', type: 'fill', 'source-layer': 'landcover',
      paint: {
        'fill-color': ['match', ['get', 'class'], 'wood', p.wood, 'forest', p.wood, 'grass', p.grass, 'farmland', p.farm, 'rock', p.rock, p.grass],
        'fill-opacity': 0.9,
      },
    },
    {
      id: 'landuse', type: 'fill', 'source-layer': 'landuse',
      filter: ['in', ['get', 'class'], ['literal', ['residential', 'suburb', 'neighbourhood', 'village', 'cemetery', 'religious']]],
      paint: { 'fill-color': p.built, 'fill-opacity': 0.8 },
    },
    { id: 'park', type: 'fill', 'source-layer': 'park', paint: { 'fill-color': p.grass, 'fill-opacity': 0.5 } },
    { id: 'water', type: 'fill', 'source-layer': 'water', paint: { 'fill-color': p.water } },
    { id: 'waterway', type: 'line', 'source-layer': 'waterway', paint: { 'line-color': p.waterLine, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 15, 2.5, 18, 6] } },
    // The flat footprint. With 3D buildings it only draws below z15, where the extrusions take over.
    { id: 'building', type: 'fill', 'source-layer': 'building', minzoom: 13, ...(buildings3d ? { maxzoom: 15 } : {}), paint: { 'fill-color': p.buildingFlat, 'fill-outline-color': p.buildingEdge } },
    {
      id: 'boundary-country', type: 'line', 'source-layer': 'boundary', filter: ['==', ['get', 'admin_level'], 2],
      paint: { 'line-color': p.boundary, 'line-width': 1.5, 'line-dasharray': [4, 2], 'line-opacity': 0.7 },
    },
    {
      id: 'road-case', type: 'line', 'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ROAD_CLASSES]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['match', ['get', 'class'], MAJOR, p.roadMajorCase, p.roadCase], 'line-width': roadWidth(true) },
    },
    {
      id: 'road', type: 'line', 'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ROAD_CLASSES]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['match', ['get', 'class'], MAJOR, p.roadMajor, p.road], 'line-width': roadWidth(false) },
    },
    {
      // Paths and tracks are most of the Camino: they stay readable at street zoom.
      id: 'path', type: 'line', 'source-layer': 'transportation', filter: ['in', ['get', 'class'], ['literal', ['path', 'track']]],
      layout: { 'line-cap': 'butt' },
      paint: { 'line-color': p.path, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.6, 16, 2.4, 18, 5, 20, 8], 'line-dasharray': [2, 1.5] },
    },
    // 3D buildings. They come after the roads so a building in front hides the street behind it (extrusions are
    // depth-tested against each other, flat layers are not), and before the labels so names stay readable.
    ...(buildings3d
      ? [{
        id: 'building-3d', type: 'fill-extrusion', 'source-layer': 'building', minzoom: 15,
        filter: ['!=', ['get', 'hide_3d'], true],
        paint: {
          'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6], 0, p.extrusion, 60, p.extrusionTall],
          // Blocks rise from the ground between z15 and z15.6 instead of popping in.
          'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.6, ['coalesce', ['get', 'render_height'], 6]],
          'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.6, ['coalesce', ['get', 'render_min_height'], 0]],
          'fill-extrusion-opacity': p.extrusionOpacity,
          'fill-extrusion-vertical-gradient': true,
        },
      } as Template]
      : []),
    {
      id: 'water-name', type: 'symbol', 'source-layer': 'water_name',
      layout: { 'text-field': NAME, 'text-font': ITA, 'text-size': 12 },
      paint: { 'text-color': p.waterName, 'text-halo-color': p.placeHalo, 'text-halo-width': 1 },
    },
    {
      id: 'road-name', type: 'symbol', 'source-layer': 'transportation_name', minzoom: 13,
      layout: {
        'symbol-placement': 'line', 'text-field': NAME, 'text-font': REG, 'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10, 15, 11.5, 17, 14, 19, 17],
        'text-letter-spacing': 0.04, 'symbol-spacing': 280, 'text-padding': 3,
        // Upright glyphs along the street: names laid flat on the ground are squashed to half height at a 60 degree tilt.
        'text-pitch-alignment': 'viewport',
      },
      paint: { 'text-color': p.label, 'text-halo-color': p.labelHalo, 'text-halo-width': 1.8 },
    },
    {
      // Basemap POIs stay small and quiet; our own pins (LiveMap) are the loud ones.
      id: 'poi', type: 'circle', 'source-layer': 'poi', minzoom: 14,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 3, 18, 5],
        'circle-color': ['match', ['get', 'class'], 'place_of_worship', C.red, 'lodging', p.name === 'night' ? '#6FA8E8' : C.blue, 'drinking_water', C.fountain, p.name === 'night' ? '#E8B53A' : C.goldDark],
        'circle-stroke-color': p.poiStroke, 'circle-stroke-width': 1, 'circle-opacity': 0.85,
      },
    },
    {
      id: 'poi-name', type: 'symbol', 'source-layer': 'poi', minzoom: 15,
      layout: { 'text-field': NAME, 'text-font': REG, 'text-size': sized(11, 14, 15, 18), 'text-offset': [0, 1], 'text-anchor': 'top', 'text-optional': true },
      paint: { 'text-color': p.poiLabel, 'text-halo-color': p.poiHalo, 'text-halo-width': 1.4 },
    },
    {
      id: 'peak', type: 'symbol', 'source-layer': 'mountain_peak', minzoom: 11,
      layout: {
        'text-field': ['concat', '▲ ', NAME, ['case', ['has', 'ele'], ['concat', '\n', ['to-string', ['get', 'ele']], ' m'], '']],
        'text-font': REG, 'text-size': 11,
      },
      paint: { 'text-color': p.peak, 'text-halo-color': p.peakHalo, 'text-halo-width': 1.2 },
    },
    {
      id: 'place', type: 'symbol', 'source-layer': 'place', filter: ['in', ['get', 'class'], ['literal', ['city', 'town', 'village', 'hamlet']]],
      layout: {
        'text-field': NAME, 'text-font': MED,
        // The zoom interpolation must be the outermost expression; the class match goes inside each stop.
        'text-size': ['interpolate', ['linear'], ['zoom'], 12, ['match', ['get', 'class'], ['city', 'town'], 16, 'village', 14, 12], 17, ['match', ['get', 'class'], ['city', 'town'], 20, 'village', 18, 15]],
      },
      paint: { 'text-color': p.place, 'text-halo-color': p.placeHalo, 'text-halo-width': 1.8 },
    },
  ];
}

/** Id of the first label layer, so route/POI overlays can be inserted under labels. */
export const firstLabelLayerId = (sources: TileSource[]) => (sources.length ? `water-name-${sources[0].id}` : undefined);

export type StyleOptions = {
  glyphs: string;
  sources: TileSource[];
  online: boolean;
  /** the dark palette (see isNight in nav.ts); default day */
  night?: boolean;
  /** 3D building blocks from z15 (Walk view); default on. Off keeps the flat footprints, cheaper on small phones. */
  buildings3d?: boolean;
};

export function buildStyle({ glyphs, sources, online, night = false, buildings3d = true }: StyleOptions): StyleSpecification {
  const attribution = online ? (hasMapTiler() ? MAPTILER_ATTRIBUTION : FALLBACK_ATTRIBUTION) : OSM_ATTRIBUTION;
  const p = paletteFor(night);
  const tpl = templates(p, buildings3d);
  return {
    version: 8,
    name: `${online ? 'caminoplus-online' : 'caminoplus-offline'}-${p.name}${buildings3d ? '-3d' : ''}`,
    glyphs,
    light: p.light,
    sources: Object.fromEntries(
      sources.map((s) => [s.id, { type: 'vector' as const, url: s.url, attribution, ...(s.maxzoom ? { maxzoom: s.maxzoom } : {}) }]),
    ),
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': p.bg } },
      ...tpl.flatMap((t) => sources.map((s) => ({ ...t, id: `${t.id}-${s.id}`, source: s.id }) as unknown as LayerSpecification)),
    ],
  };
}
