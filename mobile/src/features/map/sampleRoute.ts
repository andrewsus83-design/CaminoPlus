// Sample route data for the map until routes/stages/pois are synced from Supabase into
// the local SQLite store. Ids match supabase/seed.sql. Positions are APPROXIMATE
// (hand-placed), good enough for UI work, not for navigation.
// The pins below (`pois`) are the FALLBACK: the map draws the real stays and points of interest of the stage
// (src/features/places) and uses these only while the database has none for it.
import { LngLat, boundsOf, lineLengthM, pointAlong } from './geo';

export const ROUTE_ID = '20000000-0000-0000-0000-000000000001';
export const ROUTE_NAME = 'Camino Francés';

export type StageInfo = {
  id: string;
  number: number;
  name: string;
  distanceKm: number;
  /** Measured or estimated size of the map pack, shown before the catalog loads. */
  estBytes: number;
  line: LngLat[];
};

// Stage 1 uses the Napoleon route waypoints from tools/offline-maps (fallback route).
const stage1: LngLat[] = [
  [-1.2376, 43.1636], [-1.231, 43.148], [-1.225, 43.13], [-1.219, 43.11], [-1.23, 43.092],
  [-1.248, 43.07], [-1.262, 43.05], [-1.27, 43.04], [-1.295, 43.0215], [-1.3195, 43.0094],
];
const stage2: LngLat[] = [[-1.3195, 43.0094], [-1.36, 42.99], [-1.41, 42.97], [-1.46, 42.95], [-1.5036, 42.93]];
const stage3: LngLat[] = [[-1.5036, 42.93], [-1.54, 42.9], [-1.58, 42.87], [-1.61, 42.84], [-1.6432, 42.8169]];

export const stages: StageInfo[] = [
  { id: '40000000-0000-0000-0000-000000000001', number: 1, name: 'Saint-Jean-Pied-de-Port → Roncesvalles', distanceKm: 24.2, estBytes: 4_590_000, line: stage1 },
  { id: '40000000-0000-0000-0000-000000000002', number: 2, name: 'Roncesvalles → Zubiri', distanceKm: 21.4, estBytes: 3_800_000, line: stage2 },
  { id: '40000000-0000-0000-0000-000000000003', number: 3, name: 'Zubiri → Pamplona', distanceKm: 20.4, estBytes: 5_200_000, line: stage3 },
];

export type Town = { name: string; at: LngLat; major?: boolean };

// Simplified whole-route overview for the Helicopter layer.
export const towns: Town[] = [
  { name: 'St-Jean', at: [-1.2376, 43.1636], major: true },
  { name: 'Roncesvalles', at: [-1.3195, 43.0094] },
  { name: 'Zubiri', at: [-1.5036, 42.93] },
  { name: 'Pamplona', at: [-1.6432, 42.8169], major: true },
  { name: 'Puente la Reina', at: [-1.8146, 42.6719] },
  { name: 'Estella', at: [-2.0281, 42.6714] },
  { name: 'Logroño', at: [-2.445, 42.465], major: true },
  { name: 'Nájera', at: [-2.729, 42.416] },
  { name: 'Sto. Domingo', at: [-2.953, 42.441] },
  { name: 'Burgos', at: [-3.7044, 42.3409], major: true },
  { name: 'Castrojeriz', at: [-4.138, 42.288] },
  { name: 'Frómista', at: [-4.406, 42.267] },
  { name: 'Sahagún', at: [-5.03, 42.371] },
  { name: 'León', at: [-5.5671, 42.5987], major: true },
  { name: 'Astorga', at: [-6.056, 42.458] },
  { name: 'Ponferrada', at: [-6.598, 42.546] },
  { name: 'O Cebreiro', at: [-7.043, 42.708] },
  { name: 'Sarria', at: [-7.414, 42.781] },
  { name: 'Portomarín', at: [-7.616, 42.807] },
  { name: 'Melide', at: [-8.015, 42.914] },
  { name: 'Arzúa', at: [-8.164, 42.927] },
  { name: 'Santiago', at: [-8.5446, 42.8806], major: true },
];

// Detailed first three stages, then straight lines between towns.
export const routeLine: LngLat[] = [...stage1, ...stage2.slice(1), ...stage3.slice(1), ...towns.slice(4).map((t) => t.at)];
export const routeBounds = boundsOf(routeLine);
export const routeLengthKm = Math.round(lineLengthM(routeLine) / 1000);

export type PoiKind = 'church' | 'albergue' | 'water' | 'cafe' | 'quest' | 'stamp';
export type Poi = { id: string; kind: PoiKind; name: string; at: LngLat; blurb: string; xp?: number; audioMin?: number };

export const pois: Poi[] = [
  { id: 'p-sj-church', kind: 'church', name: 'Notre-Dame-du-Bout-du-Pont', at: [-1.237, 43.1627], blurb: 'Gothic church by the Nive bridge, the classic start photo.', audioMin: 2 },
  { id: 'p-sj-office', kind: 'stamp', name: 'Pilgrim office', at: [-1.2372, 43.1638], blurb: 'Get your credencial and first stamp. Opens 07:30.' },
  { id: 'p-sj-water', kind: 'water', name: 'Fountain, Rue de la Citadelle', at: [-1.2366, 43.1632], blurb: 'Fill up: next reliable water is at Orisson (8 km, steep).' },
  { id: 'p-orisson', kind: 'albergue', name: 'Refuge Orisson', at: [-1.2268, 43.1335], blurb: 'Albergue 8 km up. 28 beds, communal dinner. Book ahead.' },
  { id: 'p-vierge', kind: 'quest', name: "Vierge d'Orisson", at: [-1.2195, 43.112], blurb: 'Scavenger hunt: find the statue on the rock and photograph it.', xp: 50 },
  { id: 'p-roland', kind: 'water', name: 'Fontaine de Roland', at: [-1.2625, 43.0495], blurb: 'Last fountain before the border. Drinkable.' },
  { id: 'p-lepoeder', kind: 'quest', name: 'Col de Lepoeder', at: [-1.295, 43.0215], blurb: 'Highest point, 1,430 m. Unlock "Pyrenees Crossed".', xp: 100 },
  { id: 'p-ron-church', kind: 'church', name: 'Royal Collegiate Church', at: [-1.3193, 43.0092], blurb: 'Pilgrim blessing every evening. Audio story 3 min.', audioMin: 3 },
  { id: 'p-ron-albergue', kind: 'albergue', name: 'Albergue de Roncesvalles', at: [-1.3197, 43.0086], blurb: 'Parochial albergue, 183 beds, €14. Stamp at reception.' },
  { id: 'p-ron-water', kind: 'water', name: 'Fountain, Roncesvalles', at: [-1.3189, 43.0099], blurb: 'Drinking water next to the church.' },
  { id: 'p-ron-cafe', kind: 'cafe', name: 'La Posada', at: [-1.3184, 43.0089], blurb: 'Pilgrim menu from 19:00. Opens 07:00 for breakfast.' },
  { id: 'p-ron-hunt', kind: 'quest', name: 'Secrets of Roncesvalles', at: [-1.3201, 43.0097], blurb: 'Hunt: find the road sign and how many km to Santiago. +100 XP.', xp: 100 },
];

// Sample progress until the walker has a real GPS fix on the route: 9 km into stage 1.
export const SAMPLE_PROGRESS_M = 9000;
export const samplePosition = pointAlong(routeLine, SAMPLE_PROGRESS_M);

// Where each stage ends along routeLine (it is the stage lines joined end to end), and the stage that holds a
// distance along the route. Past the last stage: the last one. The Walk view uses this so the stage changes the
// moment the walker passes a stage end, not halfway to the next vertex.
export const stageEndAlongM: number[] = (() => {
  let acc = 0;
  return stages.map((s) => (acc += lineLengthM(s.line)));
})();
export const stageForAlong = (alongM: number) => {
  const i = stageEndAlongM.findIndex((end) => alongM <= end + 30);
  return stages[i < 0 ? stages.length - 1 : i];
};

export const stageForPoint = (p: LngLat) => {
  // Closest stage by its line, or the last one if beyond.
  let best = stages[0];
  let bestD = Infinity;
  for (const s of stages) {
    for (const q of s.line) {
      const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2;
      if (d < bestD) { bestD = d; best = s; }
    }
  }
  return best;
};
