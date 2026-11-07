// Real places as pins on the map, and which pins the map shows. Pure (no React Native imports): plain node tests cover it
// (npm run test:places).
//
// The map has six kinds of pin (church, albergue, water, cafe, quest, stamp). A real point of interest becomes a pin when
// there is a kind for it; a pharmacy, an ATM or a viewpoint is not drawn yet (it would need a chip and a colour of its own).
// Real stays become "albergue" pins (places to sleep) and "cafe" pins (places to eat). Quests exist only in the bundled
// sample: a real stage never shows one.
import { pois as sampleRoutePois, type Poi, type PoiKind } from '../map/sampleRoute';
import { osmObjectUrl } from './links';
import { offRouteText, placeSourceLine, poiCategoryLabel, stayCategoryLabel, stayGroup } from './present';
import type { PlacePin, PlaceSource, PoiRow, StayModel, StayRow } from './types';

/** The pin a point of interest gets; null = the map has no pin for it yet. */
export function poiPinKind(category: string, hasStamp: boolean): PoiKind | null {
  switch (category) {
    case 'cathedral':
    case 'church':
    case 'chapel':
    case 'monastery':
      return 'church';
    case 'fountain':
    case 'water':
      return 'water';
    case 'tourist_info':
      return hasStamp ? 'stamp' : null; // a tourist office is only a "stamp point" when it has the stamp
    default:
      return null;
  }
}

/** The pin a stay gets: places to sleep are "albergue", places to eat are "cafe"; shops and services have none. */
export function stayPinKind(row: Pick<StayRow, 'category' | 'kind'>): PoiKind | null {
  const g = stayGroup(row.category);
  if (g === 'Café') return 'cafe';
  if (g === 'Albergue' || g === 'Hotel' || row.category === 'camping') return 'albergue';
  if (row.kind === 'stay') return 'albergue';
  if (row.kind === 'food') return 'cafe';
  return null;
}

/** The lines under a pin's name: where it is, when it is open, when the mass is. Falls back to what it is. */
function blurbOf(p: { town: string | null; detourM: number | null; hours: string | null; mass?: string | null; what: string }): string {
  const lines = [
    [p.town, offRouteText(p.detourM)].filter(Boolean).join(' · '),
    p.hours ? `Hours (OpenStreetMap): ${p.hours}` : '',
    p.mass ? `Mass: ${p.mass}` : '',
  ].filter(Boolean);
  return lines.length ? lines.join('\n') : p.what;
}

/** A real point of interest as a pin, or null when the map has no pin for its category. */
export function poiPin(row: PoiRow): PlacePin | null {
  const kind = poiPinKind(row.category, row.has_stamp);
  if (!kind) return null;
  const label = poiCategoryLabel(row.category);
  return {
    id: row.id,
    kind,
    name: row.name,
    at: [row.lng, row.lat],
    blurb: blurbOf({ town: row.place_name, detourM: row.detour_m, hours: row.opening_hours, mass: row.mass_times, what: label }),
    sample: false,
    label,
    sourceLine: placeSourceLine(row.source, row.verification_level, row.verification_at),
    osmUrl: osmObjectUrl(row.osm_type, row.osm_id),
    stayId: null,
  };
}

/** A real stay as a pin, or null for a shop or service. */
export function stayPin(row: StayRow): PlacePin | null {
  const kind = stayPinKind(row);
  if (!kind) return null;
  const label = stayCategoryLabel(row.category);
  return {
    id: row.id,
    kind,
    name: row.name,
    at: [row.lng, row.lat],
    blurb: blurbOf({ town: row.place_name, detourM: row.detour_m, hours: row.opening_hours, what: label }),
    sample: false,
    label,
    sourceLine: placeSourceLine(row.source, row.verification_level, row.verification_at),
    osmUrl: osmObjectUrl(row.osm_type, row.osm_id),
    stayId: row.id,
  };
}

/** A bundled sample pin (hand-placed, approximate). */
export const samplePin = (p: Poi): PlacePin => ({ ...p, sample: true, label: null, sourceLine: null, osmUrl: null, stayId: null });
export const samplePins = (): PlacePin[] => sampleRoutePois.map(samplePin);

type Side<M> = { rows: M[]; source: PlaceSource; loading: boolean };

/**
 * The pins the map draws for a stage, from the answers about its stays and its points of interest:
 *   - the stage has real places (either list is live or saved): only real pins, never mixed with the sample pins;
 *   - it has none and both answers are in: the bundled sample pins (the popup of each says it is a preview);
 *   - an answer is still on its way: nothing yet, so the sample never flashes before the real pins arrive.
 * `pois` is already a list of pins (real points of interest the map can draw); `stays` is the list of stay models.
 */
export function choosePins(input: { stays: Side<StayModel>; pois: Side<PlacePin>; sample: PlacePin[] }): { pins: PlacePin[]; source: PlaceSource } {
  const { stays, pois, sample } = input;
  const realStays = stays.source === 'sample' ? [] : stays.rows.flatMap((m) => (m.row ? [stayPin(m.row)] : [])).filter((p): p is PlacePin => !!p);
  const realPois = pois.source === 'sample' ? [] : pois.rows;
  if (stays.source === 'sample' && pois.source === 'sample') {
    return stays.loading || pois.loading ? { pins: [], source: 'sample' } : { pins: sample, source: 'sample' };
  }
  return { pins: [...realPois, ...realStays], source: stays.source === 'live' || pois.source === 'live' ? 'live' : 'cache' };
}
