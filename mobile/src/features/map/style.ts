// One MapLibre style for both modes, in the CaminoPlus palette (same layers as
// tools/offline-maps/viewer/style.js). Both sources use the OpenMapTiles schema:
//   online:  MapTiler "v3" tiles (needs EXPO_PUBLIC_MAPTILER_KEY, never cached offline)
//   offline: our own OSM .pmtiles packs, one source per downloaded stage
// Glyphs are always the bundled Noto Sans files copied to the device (glyphs.ts).
import type { LayerSpecification, StyleSpecification } from '@maplibre/maplibre-react-native';
import { FALLBACK_ATTRIBUTION, MAPTILER_ATTRIBUTION, OSM_ATTRIBUTION, hasMapTiler } from './config';

export const C = {
  parchment: '#F6EFE2', ink: '#2B2A26', gold: '#D9A21B', goldDark: '#7A5A0C', blue: '#14365D', red: '#A63D2F',
  water: '#BFD4E6', wood: '#D6E2C4', grass: '#E4EAD3', farm: '#EEE9D6', built: '#EADFCB', building: '#DCCDB3',
  road: '#FFFFFF', roadCase: '#D3C4A8', path: '#8A6B3D', stone: '#8C8272', success: '#2F6B4F', fountain: '#2E86C1',
} as const;

const REG = ['Noto Sans Regular'];
const MED = ['Noto Sans Medium'];
const ITA = ['Noto Sans Italic'];
const NAME = ['coalesce', ['get', 'name:en'], ['get', 'name']];

export type TileSource = { id: string; url: string; maxzoom?: number };

// Layer specs without a source; typed loosely here and checked by MapLibre at runtime.
type Template = Record<string, unknown> & { id: string };

// Order matters: with several packs, every template is emitted once per source before
// the next template, so pack B's landcover never covers pack A's roads at the seam.
const templates: Template[] = [
  {
    id: 'landcover', type: 'fill', 'source-layer': 'landcover',
    paint: {
      'fill-color': ['match', ['get', 'class'], 'wood', C.wood, 'forest', C.wood, 'grass', C.grass, 'farmland', C.farm, 'rock', '#E2DDD3', C.grass],
      'fill-opacity': 0.9,
    },
  },
  {
    id: 'landuse', type: 'fill', 'source-layer': 'landuse',
    filter: ['in', ['get', 'class'], ['literal', ['residential', 'suburb', 'neighbourhood', 'village', 'cemetery', 'religious']]],
    paint: { 'fill-color': C.built, 'fill-opacity': 0.8 },
  },
  { id: 'park', type: 'fill', 'source-layer': 'park', paint: { 'fill-color': C.grass, 'fill-opacity': 0.5 } },
  { id: 'water', type: 'fill', 'source-layer': 'water', paint: { 'fill-color': C.water } },
  { id: 'waterway', type: 'line', 'source-layer': 'waterway', paint: { 'line-color': C.water, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 15, 2.5] } },
  { id: 'building', type: 'fill', 'source-layer': 'building', minzoom: 13, paint: { 'fill-color': C.building, 'fill-outline-color': C.roadCase } },
  {
    id: 'boundary-country', type: 'line', 'source-layer': 'boundary', filter: ['==', ['get', 'admin_level'], 2],
    paint: { 'line-color': C.blue, 'line-width': 1.5, 'line-dasharray': [4, 2], 'line-opacity': 0.7 },
  },
  {
    id: 'road-case', type: 'line', 'source-layer': 'transportation',
    filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor']]],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': C.roadCase, 'line-width': ['interpolate', ['exponential', 1.4], ['zoom'], 10, 1.5, 16, 12] },
  },
  {
    id: 'road', type: 'line', 'source-layer': 'transportation',
    filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service']]],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], '#F3D27E', C.road],
      'line-width': ['interpolate', ['exponential', 1.4], ['zoom'], 10, 0.8, 16, 9],
    },
  },
  {
    id: 'path', type: 'line', 'source-layer': 'transportation', filter: ['in', ['get', 'class'], ['literal', ['path', 'track']]],
    paint: { 'line-color': C.path, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.6, 16, 2], 'line-dasharray': [2, 1.5] },
  },
  {
    id: 'water-name', type: 'symbol', 'source-layer': 'water_name',
    layout: { 'text-field': NAME, 'text-font': ITA, 'text-size': 12 },
    paint: { 'text-color': C.blue, 'text-halo-color': C.parchment, 'text-halo-width': 1 },
  },
  {
    id: 'road-name', type: 'symbol', 'source-layer': 'transportation_name', minzoom: 13,
    layout: { 'symbol-placement': 'line', 'text-field': NAME, 'text-font': REG, 'text-size': 11 },
    paint: { 'text-color': C.ink, 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
  },
  {
    // Basemap POIs stay small and quiet; our own pins (LiveMap) are the loud ones.
    id: 'poi', type: 'circle', 'source-layer': 'poi', minzoom: 14,
    paint: {
      'circle-radius': 3,
      'circle-color': ['match', ['get', 'class'], 'place_of_worship', C.red, 'lodging', C.blue, 'drinking_water', C.fountain, C.goldDark],
      'circle-stroke-color': '#fff', 'circle-stroke-width': 1, 'circle-opacity': 0.8,
    },
  },
  {
    id: 'poi-name', type: 'symbol', 'source-layer': 'poi', minzoom: 15,
    layout: { 'text-field': NAME, 'text-font': REG, 'text-size': 11, 'text-offset': [0, 1], 'text-anchor': 'top', 'text-optional': true },
    paint: { 'text-color': C.ink, 'text-halo-color': C.parchment, 'text-halo-width': 1.2 },
  },
  {
    id: 'peak', type: 'symbol', 'source-layer': 'mountain_peak', minzoom: 11,
    layout: {
      'text-field': ['concat', '▲ ', NAME, ['case', ['has', 'ele'], ['concat', '\n', ['to-string', ['get', 'ele']], ' m'], '']],
      'text-font': REG, 'text-size': 11,
    },
    paint: { 'text-color': C.goldDark, 'text-halo-color': C.parchment, 'text-halo-width': 1.2 },
  },
  {
    id: 'place', type: 'symbol', 'source-layer': 'place', filter: ['in', ['get', 'class'], ['literal', ['city', 'town', 'village', 'hamlet']]],
    layout: { 'text-field': NAME, 'text-font': MED, 'text-size': ['match', ['get', 'class'], ['city', 'town'], 16, 'village', 14, 12] },
    paint: { 'text-color': C.blue, 'text-halo-color': C.parchment, 'text-halo-width': 1.6 },
  },
];

/** Id of the first label layer, so route/POI overlays can be inserted under labels. */
export const firstLabelLayerId = (sources: TileSource[]) => (sources.length ? `water-name-${sources[0].id}` : undefined);

export function buildStyle({ glyphs, sources, online }: { glyphs: string; sources: TileSource[]; online: boolean }): StyleSpecification {
  const attribution = online ? (hasMapTiler() ? MAPTILER_ATTRIBUTION : FALLBACK_ATTRIBUTION) : OSM_ATTRIBUTION;
  return {
    version: 8,
    name: online ? 'caminoplus-online' : 'caminoplus-offline',
    glyphs,
    sources: Object.fromEntries(
      sources.map((s) => [s.id, { type: 'vector' as const, url: s.url, attribution, ...(s.maxzoom ? { maxzoom: s.maxzoom } : {}) }]),
    ),
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': C.parchment } },
      ...templates.flatMap((t) => sources.map((s) => ({ ...t, id: `${t.id}-${s.id}`, source: s.id }) as unknown as LayerSpecification)),
    ],
  };
}
