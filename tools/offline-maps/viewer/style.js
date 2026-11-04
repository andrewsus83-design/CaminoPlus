// MapLibre style for an offline stage pack (OpenMapTiles schema), in the
// CaminoPlus palette. Everything it needs is local: tiles (PMTiles), glyphs
// (./glyphs) and no sprite (POIs are drawn as circles). The mobile app will
// use the same layers with bundled glyphs and a bundled sprite.
const C = {
  parchment: '#F6EFE2',
  ink: '#2B2A26',
  gold: '#D9A21B',
  goldDark: '#7A5A0C',
  blue: '#14365D',
  red: '#A63D2F',
  water: '#BFD4E6',
  wood: '#D6E2C4',
  grass: '#E4EAD3',
  farm: '#EEE9D6',
  built: '#EADFCB',
  building: '#DCCDB3',
  road: '#FFFFFF',
  roadCase: '#D3C4A8',
  path: '#8A6B3D',
};

const REG = ['Noto Sans Regular'];
const MED = ['Noto Sans Medium'];
const ITA = ['Noto Sans Italic'];
const NAME = ['coalesce', ['get', 'name:en'], ['get', 'name']];

export function stageStyle(packUrl) {
  // Glyphs must be an absolute URL; they sit next to this page.
  const base = location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '');
  return {
    version: 8,
    glyphs: base + 'glyphs/{fontstack}/{range}.pbf',
    sources: {
      camino: {
        type: 'vector',
        url: packUrl,
        attribution: '© <a href="https://openmaptiles.org/">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': C.parchment } },
      {
        id: 'landcover', type: 'fill', source: 'camino', 'source-layer': 'landcover',
        paint: {
          'fill-color': ['match', ['get', 'class'],
            'wood', C.wood, 'forest', C.wood, 'grass', C.grass, 'farmland', C.farm, 'rock', '#E2DDD3', C.grass],
          'fill-opacity': 0.9,
        },
      },
      {
        id: 'landuse', type: 'fill', source: 'camino', 'source-layer': 'landuse',
        filter: ['in', ['get', 'class'], ['literal', ['residential', 'suburb', 'neighbourhood', 'village', 'cemetery', 'religious']]],
        paint: { 'fill-color': C.built, 'fill-opacity': 0.8 },
      },
      { id: 'park', type: 'fill', source: 'camino', 'source-layer': 'park', paint: { 'fill-color': C.grass, 'fill-opacity': 0.5 } },
      { id: 'water', type: 'fill', source: 'camino', 'source-layer': 'water', paint: { 'fill-color': C.water } },
      {
        id: 'waterway', type: 'line', source: 'camino', 'source-layer': 'waterway',
        paint: { 'line-color': C.water, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 15, 2.5] },
      },
      {
        id: 'building', type: 'fill', source: 'camino', 'source-layer': 'building', minzoom: 13,
        paint: { 'fill-color': C.building, 'fill-outline-color': C.roadCase },
      },
      {
        id: 'boundary-country', type: 'line', source: 'camino', 'source-layer': 'boundary',
        filter: ['==', ['get', 'admin_level'], 2],
        paint: { 'line-color': C.blue, 'line-width': 1.5, 'line-dasharray': [4, 2], 'line-opacity': 0.7 },
      },
      {
        id: 'road-case', type: 'line', source: 'camino', 'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': C.roadCase, 'line-width': ['interpolate', ['exponential', 1.4], ['zoom'], 10, 1.5, 16, 12] },
      },
      {
        id: 'road', type: 'line', source: 'camino', 'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], '#F3D27E', C.road],
          'line-width': ['interpolate', ['exponential', 1.4], ['zoom'], 10, 0.8, 16, 9],
        },
      },
      {
        id: 'path', type: 'line', source: 'camino', 'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ['path', 'track']]],
        paint: {
          'line-color': C.path,
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.6, 16, 2],
          'line-dasharray': [2, 1.5],
        },
      },
      {
        id: 'water-name', type: 'symbol', source: 'camino', 'source-layer': 'water_name',
        layout: { 'text-field': NAME, 'text-font': ITA, 'text-size': 12 },
        paint: { 'text-color': C.blue, 'text-halo-color': C.parchment, 'text-halo-width': 1 },
      },
      {
        id: 'road-name', type: 'symbol', source: 'camino', 'source-layer': 'transportation_name', minzoom: 13,
        layout: { 'symbol-placement': 'line', 'text-field': NAME, 'text-font': REG, 'text-size': 11 },
        paint: { 'text-color': C.ink, 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
      },
      {
        id: 'poi', type: 'circle', source: 'camino', 'source-layer': 'poi', minzoom: 13,
        paint: {
          'circle-radius': 4,
          'circle-color': ['match', ['get', 'class'], 'place_of_worship', C.red, 'lodging', C.blue, 'drinking_water', '#2E86C1', C.goldDark],
          'circle-stroke-color': '#fff', 'circle-stroke-width': 1,
        },
      },
      {
        id: 'poi-name', type: 'symbol', source: 'camino', 'source-layer': 'poi', minzoom: 14,
        layout: { 'text-field': NAME, 'text-font': REG, 'text-size': 11, 'text-offset': [0, 1], 'text-anchor': 'top', 'text-optional': true },
        paint: { 'text-color': C.ink, 'text-halo-color': C.parchment, 'text-halo-width': 1.2 },
      },
      {
        id: 'peak', type: 'symbol', source: 'camino', 'source-layer': 'mountain_peak', minzoom: 11,
        layout: {
          'text-field': ['concat', '▲ ', NAME, ['case', ['has', 'ele'], ['concat', '\n', ['to-string', ['get', 'ele']], ' m'], '']],
          'text-font': REG, 'text-size': 11,
        },
        paint: { 'text-color': C.goldDark, 'text-halo-color': C.parchment, 'text-halo-width': 1.2 },
      },
      {
        id: 'place', type: 'symbol', source: 'camino', 'source-layer': 'place',
        filter: ['in', ['get', 'class'], ['literal', ['city', 'town', 'village', 'hamlet']]],
        layout: {
          'text-field': NAME,
          'text-font': MED,
          'text-size': ['match', ['get', 'class'], ['city', 'town'], 16, 'village', 14, 12],
        },
        paint: { 'text-color': C.blue, 'text-halo-color': C.parchment, 'text-halo-width': 1.6 },
      },
    ],
  };
}

// Route and corridor overlays (the app will draw these from stages.geom).
export function addOverlays(map, { route, corridor }) {
  if (corridor) {
    map.addSource('corridor', { type: 'geojson', data: corridor });
    map.addLayer({ id: 'corridor-line', type: 'line', source: 'corridor',
      paint: { 'line-color': C.blue, 'line-width': 1, 'line-dasharray': [3, 3], 'line-opacity': 0.6 } }, 'water-name');
  }
  if (route) {
    map.addSource('route', { type: 'geojson', data: route });
    map.addLayer({ id: 'route-halo', type: 'line', source: 'route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#fff', 'line-width': 7, 'line-opacity': 0.8 } }, 'water-name');
    map.addLayer({ id: 'route-line', type: 'line', source: 'route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': C.gold, 'line-width': 4 } }, 'water-name');
  }
}
