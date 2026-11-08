// The real line of each stage, from OpenStreetMap, as the Maps tab draws it.
//
// One GeoJSON LineString per stage is bundled in assets/map/lines (stages 1 to 3 today), made by tools/poi-audit/build_route_lines.py
// from the same OSM route ways that tools/poi-audit/import_osm.py measures the stays and points of interest of the stage against,
// thinned to within 5 m of them; manifest.json next to the files says which OSM data they are from. This file only reads and checks
// them. A stage without a usable line has none here (osmLine gives null) and sampleRoute.ts draws its hand-placed line instead, so a
// stage nobody has made a line for yet, or a damaged file, never breaks the map.
// Data (c) OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright).
import type { LngLat } from './geo';

/** Where the line a stage is drawn with comes from. */
export type LineSource = 'osm' | 'hand-placed';

// One require() per file: Metro needs the path as a literal, and each runs only when the line is first asked for.
const FILES: Record<number, () => unknown> = {
  1: () => require('../../../assets/map/lines/camino-frances-01.json'),
  2: () => require('../../../assets/map/lines/camino-frances-02.json'),
  3: () => require('../../../assets/map/lines/camino-frances-03.json'),
};
const MANIFEST = () => require('../../../assets/map/lines/manifest.json');

/** The stage numbers the bundle has a file for. */
export const OSM_STAGES: readonly number[] = Object.keys(FILES).map(Number);

/**
 * The positions of a GeoJSON LineString as [lng, lat] pairs, or null when `doc` is not one: not a LineString, fewer than two
 * positions, a position that is not two finite numbers, or one that is not on Earth (longitude and latitude swapped, say).
 * A third number in a position (an elevation) is dropped.
 */
export function parseLine(doc: unknown): LngLat[] | null {
  if (!doc || typeof doc !== 'object') return null;
  const g = doc as { type?: unknown; coordinates?: unknown };
  if (g.type !== 'LineString' || !Array.isArray(g.coordinates) || g.coordinates.length < 2) return null;
  const out: LngLat[] = [];
  for (const p of g.coordinates as unknown[]) {
    if (!Array.isArray(p) || typeof p[0] !== 'number' || typeof p[1] !== 'number') return null;
    const [lng, lat] = p as [number, number];
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) return null;
    out.push([lng, lat]);
  }
  return out;
}

const loaded = new Map<number, LngLat[] | null>();

/**
 * The OSM line of a stage, start town to end town, or null when the bundle has none for it (or the file is not a usable line).
 * The same array is returned every time: nav.ts caches distances per array, so a line is never changed after it is handed out.
 */
export function osmLine(stageNumber: number): LngLat[] | null {
  const have = loaded.get(stageNumber);
  if (have !== undefined) return have;
  let line: LngLat[] | null = null;
  try {
    const load = FILES[stageNumber];
    line = load ? parseLine(load()) : null;
  } catch {
    line = null; // the file cannot be read: no line, and the hand-placed one is drawn
  }
  loaded.set(stageNumber, line);
  return line;
}

/** "2026-08-19" from an OSM timestamp such as "2026-08-19T03:16:35Z", or null when it is not one. */
export function dataDate(timestamp: unknown): string | null {
  const m = typeof timestamp === 'string' ? /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/.exec(timestamp) : null;
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** The day of the OSM data the bundled lines are from (the oldest of the stages), or null when the manifest cannot be read. */
export function osmDataDate(): string | null {
  try {
    return dataDate((MANIFEST() as { osm_timestamp?: unknown }).osm_timestamp);
  } catch {
    return null;
  }
}
