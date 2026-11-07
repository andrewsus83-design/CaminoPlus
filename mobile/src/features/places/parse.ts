// Reading the answer of list_stage_stays / list_stage_pois. Pure on purpose (no Supabase or React Native imports), so plain
// node tests cover it (npm run test:places).
//
// The rows come from OpenStreetMap, which anybody can edit, so every field is treated as untrusted text: control
// characters and line breaks become spaces, long values are cut, numbers must be real numbers in a sane range, and a
// row that has no usable id, name or position is skipped (one odd row never hides the rest). Something that is not a
// list at all answers null: the call failed or the function is not what the app expects.

import type { DataSource, OsmType, PoiRow, StayRow, VerificationLevel } from './types';

/** The id of a row: the app puts it in a screen address, so only a real uuid is accepted. */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// line breaks, tabs and the other control characters are not part of a name or a phone number
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;

/** At most what the server sends (the functions cap at 500). */
export const MAX_ROWS = 500;

const LEVELS: readonly VerificationLevel[] = ['owner', 'pilgrim', 'editor', 'data_check', 'unverified'];
const SOURCES: readonly DataSource[] = ['osm', 'editorial', 'partner', 'owner', 'user', 'tripadvisor', 'ota'];
const OSM_TYPES: readonly OsmType[] = ['node', 'way', 'relation'];
const KINDS = ['stay', 'food', 'service'] as const;

/** Cuts to `max` characters without leaving half a surrogate pair at the end. */
function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}

/** A short piece of text: control characters and runs of blanks become one space; null when nothing is left. */
export function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
  return t ? clip(t, max) : null;
}

/** A finite number. PostgREST sends numeric and bigint as numbers; a numeric string is accepted too. */
export function cleanNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && /^-?\d{1,15}(\.\d{1,12})?$/.test(v.trim())) return Number(v);
  return null;
}

function cleanInt(v: unknown, min: number, max: number): number | null {
  const n = cleanNumber(v);
  if (n === null) return null;
  const i = Math.round(n);
  return i >= min && i <= max ? i : null;
}

/** An ISO time from anything Date understands, or null. */
function cleanTime(v: unknown): string | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** A list of short slugs (labels, amenities): trimmed, no blanks, no repeats, bounded. */
function cleanSlugs(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    const t = cleanText(item, 40);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= 20) break;
  }
  return out;
}

type Raw = Record<string, unknown>;

/** The fields both kinds of row share. Null when the row has no usable id, name, category or position. */
function common(r: Raw) {
  const id = typeof r.id === 'string' && UUID.test(r.id) ? r.id.toLowerCase() : null;
  const name = cleanText(r.name, 200);
  const category = cleanText(r.category, 40);
  const lat = cleanNumber(r.lat);
  const lng = cleanNumber(r.lng);
  if (!id || !name || !category || lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null; // "null island": an import that never got a position
  const level = typeof r.verification_level === 'string' && (LEVELS as readonly string[]).includes(r.verification_level) ? (r.verification_level as VerificationLevel) : 'unverified';
  const source = typeof r.source === 'string' && (SOURCES as readonly string[]).includes(r.source) ? (r.source as DataSource) : 'unknown';
  const osmType = typeof r.osm_type === 'string' && (OSM_TYPES as readonly string[]).includes(r.osm_type) ? (r.osm_type as OsmType) : null;
  const osmId = cleanInt(r.osm_id, 1, Number.MAX_SAFE_INTEGER);
  const km = cleanNumber(r.km_from_stage_start);
  const at = cleanTime(r.verification_at);
  return {
    id,
    name,
    category,
    place_name: cleanText(r.place_name, 120),
    lat,
    lng,
    phone: cleanText(r.phone, 60),
    website: cleanText(r.website, 300),
    opening_hours: cleanText(r.opening_hours, 400),
    km_from_stage_start: km !== null && km >= 0 && km <= 2000 ? km : null,
    detour_m: cleanInt(r.detour_m, 0, 200_000),
    has_stamp: r.has_stamp === true,
    data_confidence: cleanInt(r.data_confidence, 0, 100),
    verification_level: level,
    // a date only makes sense for a level that was reached
    verification_at: level === 'unverified' ? null : at,
    source,
    // an OpenStreetMap id means nothing without its type, and the other way round
    osm_type: osmType && osmId !== null ? osmType : null,
    osm_id: osmType && osmId !== null ? osmId : null,
  };
}

export function parseStayRow(row: unknown): StayRow | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Raw;
  const c = common(r);
  if (!c) return null;
  const kind = typeof r.kind === 'string' && (KINDS as readonly string[]).includes(r.kind) ? (r.kind as StayRow['kind']) : null;
  return {
    ...c,
    kind,
    email: cleanText(r.email, 200),
    address: cleanText(r.address, 300),
    description: cleanText(r.description, 800),
    beds: cleanInt(r.beds, 0, 100_000),
    amenities: cleanSlugs(r.amenities),
    labels: cleanSlugs(r.labels),
  };
}

export function parsePoiRow(row: unknown): PoiRow | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Raw;
  const c = common(r);
  if (!c) return null;
  return { ...c, mass_times: cleanText(r.mass_times, 300) };
}

function parseRows<R extends { id: string }>(data: unknown, one: (row: unknown) => R | null): R[] | null {
  if (!Array.isArray(data)) return null;
  const out: R[] = [];
  const seen = new Set<string>();
  for (const row of data.slice(0, MAX_ROWS)) {
    const parsed = one(row);
    if (parsed && !seen.has(parsed.id)) {
      seen.add(parsed.id);
      out.push(parsed);
    }
  }
  return out;
}

/** The rows of list_stage_stays, or null when `data` is not a list. */
export const parseStayRows = (data: unknown): StayRow[] | null => parseRows(data, parseStayRow);
/** The rows of list_stage_pois, or null when `data` is not a list. */
export const parsePoiRows = (data: unknown): PoiRow[] | null => parseRows(data, parsePoiRow);
