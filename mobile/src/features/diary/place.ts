// The place of a diary page: where the pilgrim was when they wrote it. Pure logic, no React, no React Native, no location module
// (device.ts reads the position); plain node tests cover it (npm run test:diary).
//
// A page keeps { lat, lon, name?, at }: the coordinates (five decimals, about a metre), a name the phone's map service found or the
// pilgrim typed, and when the position was read. It stays on the phone with the rest of the page and is never sent anywhere by the
// app; the only thing that leaves it is a tap on the chip, which hands the coordinates to the phone's own maps app.

export type DiaryPlace = { lat: number; lon: number; name?: string; at: string };

export const PLACE_NAME_MAX = 80;

/** Why a place could not be added: no permission (and the phone will not ask again, or will), location switched off, no position in time, or no way to ask. */
export type PlaceFailure = 'denied' | 'blocked' | 'services-off' | 'timeout' | 'unavailable' | 'unsupported';

const validDate = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A coordinate rounded to five decimals. */
export const roundCoord = (n: number) => Math.round(n * 1e5) / 1e5;

/** A name as it is kept: white space squashed, not longer than PLACE_NAME_MAX (never cut in the middle of an emoji), or undefined when nothing is left. */
export function cleanName(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  let t = v.replace(/\s+/g, ' ').trim();
  if (t.length > PLACE_NAME_MAX) {
    let end = PLACE_NAME_MAX;
    const last = t.charCodeAt(end - 1);
    if (last >= 0xd800 && last <= 0xdbff) end -= 1;
    t = t.slice(0, end).trimEnd();
  }
  return t === '' ? undefined : t;
}

/** A stored item that reads as a place. */
export function isPlace(v: unknown): v is DiaryPlace {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const p = v as Record<string, unknown>;
  return finite(p.lat) && p.lat >= -90 && p.lat <= 90 && finite(p.lon) && p.lon >= -180 && p.lon <= 180 && validDate(p.at) && (p.name === undefined || typeof p.name === 'string');
}

/** The place as it is kept (rounded, the name cleaned), or null when what was given is not a place. */
export function normalizePlace(v: unknown): DiaryPlace | null {
  if (!isPlace(v)) return null;
  const name = cleanName(v.name);
  return { lat: roundCoord(v.lat), lon: roundCoord(v.lon), ...(name ? { name } : {}), at: v.at };
}

/** A place from a position that was just read: null when the numbers are not a position on the earth. */
export function placeFromFix(fix: { lat: number; lon: number; at?: number | string | null }, name?: string | null, now: () => Date = () => new Date()): DiaryPlace | null {
  const at = typeof fix.at === 'number' && Number.isFinite(fix.at) && fix.at > 0 ? new Date(fix.at) : typeof fix.at === 'string' && validDate(fix.at) ? new Date(fix.at) : now();
  if (Number.isNaN(at.getTime())) return null;
  return normalizePlace({ lat: fix.lat, lon: fix.lon, ...(name ? { name } : {}), at: at.toISOString() });
}

/** The same place with another name; an empty name takes the name away. */
export function withName(p: DiaryPlace, name: string): DiaryPlace {
  const clean = cleanName(name);
  return { lat: p.lat, lon: p.lon, ...(clean ? { name: clean } : {}), at: p.at };
}

/** "42.4172° N, 4.2477° W": the position in words a person can read out, for a place that has no name. */
export function coordsText(p: Pick<DiaryPlace, 'lat' | 'lon'>): string {
  return `${Math.abs(p.lat).toFixed(4)}° ${p.lat >= 0 ? 'N' : 'S'}, ${Math.abs(p.lon).toFixed(4)}° ${p.lon >= 0 ? 'E' : 'W'}`;
}

/** What the chip says: the name, else the coordinates. */
export const placeLabel = (p: DiaryPlace): string => cleanName(p.name) ?? coordsText(p);

/** The parts of an address the phone's map service answers with (expo-location's reverse geocoding). Every one may be missing. */
export type AddressParts = Partial<Record<'name' | 'street' | 'district' | 'city' | 'subregion' | 'region' | 'country', string | null>>;

/**
 * A name for a place from an address: the town and its region ("Hontanas, Castilla y León"), else whichever of them there is, else
 * the street or the name of the spot, else the country. undefined when the address says nothing.
 */
export function nameFromAddress(a: AddressParts | null | undefined): string | undefined {
  if (!a || typeof a !== 'object') return undefined;
  const get = (k: keyof AddressParts) => (typeof a[k] === 'string' ? (a[k] as string).replace(/\s+/g, ' ').trim() : '');
  const town = get('city') || get('district') || get('subregion');
  const region = get('region');
  if (town && region && town.toLowerCase() !== region.toLowerCase()) return cleanName(`${town}, ${region}`);
  return cleanName(town || region || get('street') || get('name') || get('country'));
}

const fixed5 = (n: number) => n.toFixed(5);
const encodeLabel = (s: string) => encodeURIComponent(s).replace(/\(/g, '%28').replace(/\)/g, '%29');

/** The address that hands the place to the phone's maps app: a geo: link on Android, Apple Maps on iOS, OpenStreetMap anywhere else. */
export function mapsUrl(p: DiaryPlace, os: string): string {
  const here = `${fixed5(p.lat)},${fixed5(p.lon)}`;
  const name = cleanName(p.name);
  if (os === 'android') return name ? `geo:${here}?q=${here}(${encodeLabel(name)})` : `geo:${here}?q=${here}`;
  if (os === 'ios') return `https://maps.apple.com/?ll=${here}&q=${encodeURIComponent(name ?? 'Pinned place')}`;
  return `https://www.openstreetmap.org/?mlat=${fixed5(p.lat)}&mlon=${fixed5(p.lon)}#map=17/${fixed5(p.lat)}/${fixed5(p.lon)}`;
}
