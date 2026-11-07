// Plain-node checks for the real places: reading the rows, the words, the links, the models and pins, the saved copy and
// the choice between live, saved and sample. No React Native. Run: npm run test:places
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { stays as bundledStays } from '../../../data/mock';
import { pois as bundledPois } from '../../map/sampleRoute';
import { RPC_COLUMNS } from '../api';
import { CACHE_INDEX_KEY, CACHE_MAX_AGE_MS, CACHE_VERSION, CLOCK_SKEW_MS, FRESH_MS, MAX_CACHED_LISTS, cacheKey, isFresh, makeEnvelope, readEnvelope, touchIndex } from '../cache';
import { afterAnswer, beforeAnswer, chooseMyStage, type PlanStage } from '../decide';
import { OSM_CREDIT, cleanEmail, mailtoUrl, osmObjectUrl, safeWebUrl, telUrl, webLabel } from '../links';
import { isListedStay, sampleStayModels, toStayModel } from '../models';
import { MAX_ROWS, cleanNumber, cleanText, parsePoiRow, parsePoiRows, parseStayRow, parseStayRows } from '../parse';
import { choosePins, poiPin, poiPinKind, samplePins, stayPin, stayPinKind } from '../pins';
import {
  LABEL_NAME, POI_LABEL, PRICE_NOT_KNOWN, STAY_LABEL, amenityNames, humanize, kmIntoStageText, labelNames, offRouteText, placeSourceLine, poiCategoryLabel, priceTier, sampleStaysNotice, savedLine, sourceLabel,
  stayCategoryLabel, stayGroup, staySubtitle, stayTint, verificationLabel,
} from '../present';
import type { Cached, DataSource, PlacePin, PlaceSource, StayModel, StayRow } from '../types';

// UTC+14, the farthest time zone from UTC: the month and year of a check date are read in UTC, so a phone's own time zone
// must make no difference (in a test run in UTC it could not).
process.env.TZ = 'Pacific/Kiritimati';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };
const root = process.cwd(); // npm test runs from mobile/
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

/* ------------------------------------------------------------------ fixtures */

const ID = '5e0d0000-0000-4000-8000-000000000001';
const wire = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: ID, name: 'Albergue El Puntido', category: 'albergue_municipal', kind: 'stay', place_name: 'Hontanas',
  lat: 42.3093, lng: -4.0463, phone: '+34 947 377 138', email: 'info@example.es', website: 'https://puntido.example.es',
  opening_hours: 'Mo-Su 12:00-22:00', address: 'Calle Real 1', description: 'A pilgrim albergue', km_from_stage_start: 12.4, detour_m: 300,
  beds: 24, amenities: ['wifi', 'kitchen'], labels: ['donativo', 'pilgrims_only'], has_stamp: true, data_confidence: 82,
  verification_level: 'data_check', verification_at: '2026-10-15T10:00:00+00:00', source: 'osm', osm_type: 'node', osm_id: 1234567890, ...over,
});
const poiWire = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: '5e0b0000-0000-4000-8000-000000000001', name: 'Ermita de San Miguel', category: 'chapel', place_name: 'Hontanas',
  lat: 42.31, lng: -4.05, phone: null, website: null, opening_hours: 'Mo-Su 09:00-19:00', mass_times: 'Su 11:00',
  km_from_stage_start: 5, detour_m: 0, has_stamp: false, data_confidence: null, verification_level: 'unverified', verification_at: null,
  source: 'osm', osm_type: 'way', osm_id: 42, ...over,
});
const stay = (over: Record<string, unknown> = {}): StayRow => {
  const r = parseStayRow(wire(over));
  assert.ok(r, 'the fixture row must parse');
  return r;
};
const stayModel = (over: Record<string, unknown> = {}) => toStayModel(stay(over));

/* ------------------------------------------------------------------ reading the rows */

check('a complete stay row is read field by field', () => {
  const r = stay();
  assert.deepEqual(r, {
    id: ID, name: 'Albergue El Puntido', category: 'albergue_municipal', place_name: 'Hontanas', lat: 42.3093, lng: -4.0463,
    phone: '+34 947 377 138', website: 'https://puntido.example.es', opening_hours: 'Mo-Su 12:00-22:00', km_from_stage_start: 12.4, detour_m: 300,
    has_stamp: true, data_confidence: 82, verification_level: 'data_check', verification_at: '2026-10-15T10:00:00.000Z', source: 'osm',
    osm_type: 'node', osm_id: 1234567890, kind: 'stay', email: 'info@example.es', address: 'Calle Real 1', description: 'A pilgrim albergue', beds: 24,
    amenities: ['wifi', 'kitchen'], labels: ['donativo', 'pilgrims_only'],
  });
});

check('a complete point-of-interest row is read, and has no stay-only fields', () => {
  const r = parsePoiRow(poiWire());
  assert.ok(r);
  assert.equal(r.category, 'chapel');
  assert.equal(r.mass_times, 'Su 11:00');
  assert.equal(r.osm_type, 'way');
  assert.equal('email' in r, false);
  assert.equal('beds' in r, false);
});

check('the parser reads exactly the columns of RPC_COLUMNS, the list the contract check compares with the database', () => {
  const seen = (data: Record<string, unknown>, parse: (row: unknown) => unknown) => {
    const keys = new Set<string>();
    parse(new Proxy(data, { get: (t, k) => { keys.add(String(k)); return t[k as string]; } }));
    return [...keys].sort();
  };
  assert.deepEqual(seen(wire(), parseStayRow), [...RPC_COLUMNS.list_stage_stays].sort());
  assert.deepEqual(seen(poiWire(), parsePoiRow), [...RPC_COLUMNS.list_stage_pois].sort());
});

check('RPC_COLUMNS is the list of columns the migration returns, in the same order', () => {
  const sql = read('../supabase/migrations/20261111000000_stage_places.sql');
  const columns = (fn: string) => {
    const m = new RegExp(`create or replace function public\\.${fn}\\(p_stage uuid\\)\\s*returns table \\(([\\s\\S]*?)\\)\\s*language sql`).exec(sql);
    assert.ok(m, `${fn} not found in the migration`);
    return m[1].split('\n').map((l) => l.replace(/--.*$/, '').trim()).filter(Boolean).map((l) => l.split(/\s+/)[0]);
  };
  assert.deepEqual(columns('list_stage_stays'), [...RPC_COLUMNS.list_stage_stays]);
  assert.deepEqual(columns('list_stage_pois'), [...RPC_COLUMNS.list_stage_pois]);
});

check('text from OpenStreetMap is cleaned: control characters and line breaks, runs of blanks, edges, length', () => {
  assert.equal(cleanText('  Albergue\n\tSan   Antón\u0000  ', 50), 'Albergue San Antón');
  assert.equal(cleanText('a b\u0085c', 50), 'a b c');
  assert.equal(cleanText('   ', 50), null);
  assert.equal(cleanText('', 50), null);
  assert.equal(cleanText(42, 50), null);
  assert.equal(cleanText({ toString: () => 'x' }, 50), null);
  assert.equal(cleanText('x'.repeat(500), 200)?.length, 200);
  // a cut must not leave half of an emoji
  const cut = cleanText('ab😀cd', 3);
  assert.equal(cut, 'ab');
  const r = stay({ name: 'Albergue\nCasa\u0007 Nueva', address: 'x'.repeat(1000), description: 'y'.repeat(5000), website: 'z'.repeat(1000) });
  assert.equal(r.name, 'Albergue Casa Nueva');
  assert.equal(r.address?.length, 300);
  assert.equal(r.description?.length, 800);
  assert.equal(r.website?.length, 300);
});

check('numbers must be real numbers: numeric strings are accepted, NaN, Infinity and text are not', () => {
  assert.equal(cleanNumber(3), 3);
  assert.equal(cleanNumber('43.0089'), 43.0089);
  assert.equal(cleanNumber(' -1.3197 '), -1.3197);
  assert.equal(cleanNumber(NaN), null);
  assert.equal(cleanNumber(Infinity), null);
  assert.equal(cleanNumber('abc'), null);
  assert.equal(cleanNumber('1e9'), null);
  assert.equal(cleanNumber(''), null);
  assert.equal(cleanNumber(null), null);
  assert.equal(cleanNumber(undefined), null);
  assert.equal(cleanNumber({}), null);
  assert.equal(stay({ lat: '42.3093', lng: '-4.0463', km_from_stage_start: '12.40', beds: '24' }).lat, 42.3093);
});

check('a row without a usable id, name, category or position is skipped, and the others still come through', () => {
  const bad: Record<string, unknown>[] = [
    { id: 'not-a-uuid' }, { id: 42 }, { id: null }, { id: `${ID}/../x` }, { id: `${ID};drop` },
    { name: '' }, { name: '   ' }, { name: null }, { category: null }, { category: '' },
    { lat: null }, { lat: 'north' }, { lat: 90.5 }, { lat: -91 }, { lng: 180.5 }, { lng: -181 }, { lat: NaN }, { lng: Infinity },
    { lat: 0, lng: 0 },
  ];
  for (const b of bad) assert.equal(parseStayRow(wire(b)), null, JSON.stringify(b));
  assert.equal(parseStayRow(null), null);
  assert.equal(parseStayRow('row'), null);
  assert.equal(parseStayRow(7), null);
  assert.equal(parseStayRow([]), null);
  const rows = parseStayRows([wire({ id: 'bad' }), wire({ id: '5e0d0000-0000-4000-8000-000000000002', name: 'Second' }), null, wire({ lat: 0, lng: 0 })]);
  assert.deepEqual(rows?.map((r) => r.name), ['Second']);
  // the edges of the world are allowed, and the equator or the meridian alone are not "null island"
  assert.ok(parseStayRow(wire({ lat: 90, lng: 180 })));
  assert.ok(parseStayRow(wire({ lat: 0, lng: -4 })));
  assert.ok(parseStayRow(wire({ lat: 42, lng: 0 })));
});

check('something that is not a list gives null (the call failed), a list gives rows, duplicates and overflow are cut', () => {
  assert.equal(parseStayRows(null), null);
  assert.equal(parseStayRows(undefined), null);
  assert.equal(parseStayRows({ message: 'x' }), null);
  assert.equal(parseStayRows('[]'), null);
  assert.deepEqual(parseStayRows([]), []);
  assert.equal(parsePoiRows({}), null);
  assert.deepEqual(parsePoiRows([]), []);
  assert.equal(parseStayRows([wire(), wire(), wire({ name: 'Same id again' })])?.length, 1);
  const many = Array.from({ length: MAX_ROWS + 50 }, (_, i) => wire({ id: `5e0d0000-0000-4000-8000-${String(i).padStart(12, '0')}` }));
  assert.equal(parseStayRows(many)?.length, MAX_ROWS);
});

check('the level, the source and the dates are checked: unknown values never become "verified"', () => {
  assert.equal(stay({ verification_level: 'verified' }).verification_level, 'unverified');
  assert.equal(stay({ verification_level: 'OWNER' }).verification_level, 'unverified');
  assert.equal(stay({ verification_level: null }).verification_level, 'unverified');
  assert.equal(stay({ verification_level: undefined }).verification_level, 'unverified');
  for (const l of ['owner', 'pilgrim', 'editor', 'data_check', 'unverified']) assert.equal(stay({ verification_level: l }).verification_level, l);
  assert.equal(stay({ source: 'google' }).source, 'unknown');
  assert.equal(stay({ source: null }).source, 'unknown');
  for (const s of ['osm', 'editorial', 'partner', 'owner', 'user', 'tripadvisor', 'ota']) assert.equal(stay({ source: s }).source, s);
  // a date goes with a level that was reached; an unverified place has none, a bad date is dropped
  assert.equal(stay({ verification_level: 'unverified', verification_at: '2026-10-15T10:00:00Z' }).verification_at, null);
  assert.equal(stay({ verification_level: 'owner', verification_at: 'yesterday' }).verification_at, null);
  assert.equal(stay({ verification_level: 'owner', verification_at: '' }).verification_at, null);
  assert.equal(stay({ verification_level: 'owner', verification_at: '2026-09-01T08:30:00Z' }).verification_at, '2026-09-01T08:30:00.000Z');
});

check('an OpenStreetMap id needs its type, and a type needs its id', () => {
  assert.deepEqual([stay().osm_type, stay().osm_id], ['node', 1234567890]);
  for (const o of [{ osm_type: 'planet' }, { osm_type: null }, { osm_id: null }, { osm_id: 0 }, { osm_id: -5 }, { osm_id: 'abc' }, { osm_id: 1.5e300 }]) {
    const r = stay(o);
    assert.deepEqual([r.osm_type, r.osm_id], [null, null], JSON.stringify(o));
  }
  assert.equal(stay({ osm_id: '987654321' }).osm_id, 987654321);
});

check('km, detour and confidence are bounded; missing values stay null, not 0', () => {
  const r = stay({ km_from_stage_start: null, detour_m: null, data_confidence: null, beds: null });
  assert.deepEqual([r.km_from_stage_start, r.detour_m, r.data_confidence, r.beds], [null, null, null, null]);
  assert.equal(stay({ km_from_stage_start: -1 }).km_from_stage_start, null);
  assert.equal(stay({ km_from_stage_start: 5000 }).km_from_stage_start, null);
  assert.equal(stay({ detour_m: -10 }).detour_m, null);
  assert.equal(stay({ data_confidence: 101 }).data_confidence, null);
  assert.equal(stay({ data_confidence: 0 }).data_confidence, 0);
  assert.equal(stay({ beds: -3 }).beds, null);
  assert.equal(stay({ detour_m: 0 }).detour_m, 0);
});

check('labels and amenities: slugs only, no blanks, no repeats, no more than 20; not a list gives none', () => {
  assert.deepEqual(stay({ labels: ['donativo', ' donativo ', '', null, 7, 'pilgrims_only'] }).labels, ['donativo', 'pilgrims_only']);
  assert.deepEqual(stay({ labels: 'donativo' }).labels, []);
  assert.deepEqual(stay({ labels: null }).labels, []);
  assert.deepEqual(stay({ amenities: undefined }).amenities, []);
  assert.equal(stay({ labels: Array.from({ length: 50 }, (_, i) => `l${i}`) }).labels.length, 20);
});

check('kind is stay, food or service; anything else is unknown (null)', () => {
  assert.equal(stay({ kind: 'food' }).kind, 'food');
  assert.equal(stay({ kind: 'service' }).kind, 'service');
  assert.equal(stay({ kind: 'hotel' }).kind, null);
  assert.equal(stay({ kind: undefined }).kind, null);
});

/* ------------------------------------------------------------------ the words */

check('the source is always named', () => {
  const all: DataSource[] = ['osm', 'editorial', 'partner', 'owner', 'user', 'tripadvisor', 'ota', 'unknown'];
  assert.deepEqual(all.map(sourceLabel), [
    'From OpenStreetMap', 'From CaminoPlus', 'From a CaminoPlus partner', 'Added by the owner', 'Added by a pilgrim', 'From Tripadvisor', 'From a booking site', 'Source not known',
  ]);
  assert.equal(sourceLabel('mapbox' as DataSource), 'Source not known');
});

check('verification labels are the words of the database function, and a data check is never "verified"', () => {
  const sql = read('../supabase/migrations/20261106100000_data_audit.sql');
  for (const [level, words] of [['owner', 'Verified by owner'], ['pilgrim', 'Confirmed by pilgrims'], ['editor', 'Checked by CaminoPlus'], ['data_check', 'Data cross-checked'], ['unverified', 'Not verified yet']] as const) {
    assert.ok(sql.includes(`'${words}'`), `the database says "${words}"`);
    assert.equal(verificationLabel(level, null), words);
  }
  assert.doesNotMatch(verificationLabel('data_check', '2026-10-15T10:00:00Z'), /verified/i);
  assert.equal(verificationLabel('unverified', null), 'Not verified yet');
  assert.equal(verificationLabel('bogus' as never, null), 'Not verified yet');
});

check('verification date: month and year in UTC, only for a level that was reached', () => {
  assert.equal(verificationLabel('data_check', '2026-10-15T10:00:00Z'), 'Data cross-checked · Oct 2026');
  assert.equal(verificationLabel('owner', '2026-09-01T08:30:00.000Z'), 'Verified by owner · Sep 2026');
  assert.equal(verificationLabel('data_check', '2026-12-31T23:30:00Z'), 'Data cross-checked · Dec 2026');
  assert.equal(verificationLabel('data_check', '2027-01-01T00:00:00+01:00'), 'Data cross-checked · Dec 2026', 'UTC, not the phone\'s time zone');
  assert.equal(verificationLabel('unverified', '2026-10-15T10:00:00Z'), 'Not verified yet');
  assert.equal(verificationLabel('data_check', null), 'Data cross-checked');
  assert.equal(verificationLabel('data_check', 'not a date'), 'Data cross-checked');
});

check('the one-line source label of a real place', () => {
  assert.equal(placeSourceLine('osm', 'unverified', null), 'From OpenStreetMap · Not verified yet');
  assert.equal(placeSourceLine('osm', 'data_check', '2026-10-15T10:00:00Z'), 'From OpenStreetMap · Data cross-checked · Oct 2026');
  assert.equal(placeSourceLine('editorial', 'editor', '2026-08-20T00:00:00Z'), 'From CaminoPlus · Checked by CaminoPlus · Aug 2026');
});

check('"saved on this phone" says how old the copy is', () => {
  const now = Date.UTC(2026, 10, 7, 12, 0, 0);
  assert.equal(savedLine(now - 3 * 86_400_000, now), 'Saved on this phone · updated 3 days ago');
  assert.equal(savedLine(now - 60_000 * 5, now), 'Saved on this phone · updated 5 min ago');
  assert.equal(savedLine(null, now), 'Saved on this phone');
});

check('every category the database allows has its own name in the app', () => {
  const quoted = (block: string) => [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  const stayCats = quoted(/stays_category_check check \(category in \(([\s\S]*?)\)\);/.exec(read('../supabase/migrations/20261105100000_business_owners.sql'))?.[1] ?? '');
  const poiCats = quoted(/category\s+text not null check \(category in \(([\s\S]*?)\)\),?\s*\n\s*name/.exec(read('../supabase/migrations/20261104150200_routes_maps.sql'))?.[1] ?? '');
  assert.ok(stayCats.length >= 20 && poiCats.length >= 20, `${stayCats.length} stay and ${poiCats.length} POI categories found`);
  for (const c of stayCats) assert.ok(c in STAY_LABEL, `stay category ${c} has no name in present.ts`);
  for (const c of poiCats) assert.ok(c in POI_LABEL, `POI category ${c} has no name in present.ts`);
  // and the app names nothing the database does not have
  for (const c of Object.keys(STAY_LABEL)) assert.ok(stayCats.includes(c), `present.ts names stay category ${c} that the database does not have`);
  for (const c of Object.keys(POI_LABEL)) assert.ok(poiCats.includes(c), `present.ts names POI category ${c} that the database does not have`);
  // the names people read
  assert.equal(stayCategoryLabel('albergue_municipal'), 'Municipal albergue');
  assert.equal(stayCategoryLabel('albergue_parochial'), 'Parish albergue');
  assert.equal(stayCategoryLabel('albergue_private'), 'Private albergue');
  assert.equal(stayCategoryLabel('casa_rural'), 'Rural house');
  assert.equal(stayCategoryLabel('cafe'), 'Café');
  assert.equal(poiCategoryLabel('water'), 'Drinking water');
  // a category this version does not know is made readable, never blank
  assert.equal(stayCategoryLabel('glamping_dome'), 'Glamping dome');
  assert.equal(poiCategoryLabel('wind_turbine'), 'Wind turbine');
  assert.equal(humanize('__'), '');
});

check('the groups of the filter sheet: albergues, hotels and rooms, cafes; a campsite or a shop is under All only', () => {
  for (const c of ['albergue_municipal', 'albergue_parochial', 'albergue_private', 'hostel']) assert.equal(stayGroup(c), 'Albergue', c);
  for (const c of ['hotel', 'pension', 'guesthouse', 'casa_rural', 'apartment']) assert.equal(stayGroup(c), 'Hotel', c);
  for (const c of ['cafe', 'bar', 'restaurant', 'bakery']) assert.equal(stayGroup(c), 'Café', c);
  for (const c of ['camping', 'shop', 'pharmacy', 'bike_service', 'luggage_service', 'tour_operator', 'other_service', 'glamping_dome']) assert.equal(stayGroup(c), null, c);
  assert.equal(new Set(['albergue_municipal', 'hotel', 'cafe', 'camping'].map(stayTint)).size, 4, 'a colour per group');
});

check('price tiers of the samples are what the filter sheet always said: $ under 20 and cafes, $$ up to 50, $$$ above', () => {
  assert.deepEqual([null, 0, 12, 19.99, 20, 42, 50, 50.01, 68].map(priceTier), ['$', '$', '$', '$', '$$', '$$', '$$', '$$$', '$$$']);
});

check('distance off the Camino: never "on the Camino", rounded to 10 m, then in km', () => {
  assert.equal(offRouteText(null), null);
  assert.equal(offRouteText(undefined), null);
  assert.equal(offRouteText(NaN), null);
  assert.equal(offRouteText(0), null, '0 can mean "not measured"');
  assert.equal(offRouteText(49), null);
  assert.equal(offRouteText(50), '50 m off the Camino');
  assert.equal(offRouteText(123), '120 m off the Camino');
  assert.equal(offRouteText(300), '300 m off the Camino');
  assert.equal(offRouteText(994), '990 m off the Camino');
  assert.equal(offRouteText(996), '1.0 km off the Camino');
  assert.equal(offRouteText(1250), '1.3 km off the Camino');
  assert.equal(offRouteText(12_000), '12.0 km off the Camino');
});

check('position on the stage in km; null when the link does not say', () => {
  assert.equal(kmIntoStageText(null), null);
  assert.equal(kmIntoStageText(-2), null);
  assert.equal(kmIntoStageText(0), 'At the start of the stage');
  assert.equal(kmIntoStageText(0.04), 'At the start of the stage');
  assert.equal(kmIntoStageText(12.4), '12.4 km into the stage');
  assert.equal(kmIntoStageText(12.449), '12.4 km into the stage');
  assert.equal(kmIntoStageText(24), '24 km into the stage');
});

check('the line under the name of a real stay leaves out what is not known', () => {
  assert.equal(staySubtitle({ kindLabel: 'Municipal albergue', town: 'Hontanas', km: 12.4, detourM: 300 }), 'Municipal albergue · Hontanas · 12.4 km into the stage · 300 m off the Camino');
  assert.equal(staySubtitle({ kindLabel: 'Café', town: null, km: null, detourM: 0 }), 'Café');
  assert.equal(staySubtitle({ kindLabel: 'Hotel', town: 'Burgos', km: null, detourM: 80 }), 'Hotel · Burgos · 80 m off the Camino');
});

check('labels: names people read, the owner badge is the verification line instead, unknown ones are made readable', () => {
  assert.deepEqual(labelNames(['donativo', 'pilgrims_only', 'verified_owner', 'menu_peregrino', 'family_run']), ['Donativo', 'Pilgrims only', 'Pilgrim menu', 'Family run']);
  assert.deepEqual(labelNames([]), []);
  assert.deepEqual(amenityNames(['wifi', 'kitchen', 'air_conditioning']), ['Wi-Fi', 'Kitchen', 'Air conditioning']);
  // every label the database defines has a name here (or is the owner badge)
  const slugs = (sql: string, from: string, to: string) => [...sql.slice(sql.indexOf(from), sql.indexOf(to, sql.indexOf(from))).matchAll(/^\s*\('([a-z_]+)',/gm)].map((m) => m[1]);
  const defined = [
    ...slugs(read('../supabase/seed.sql'), 'insert into public.stay_labels', 'on conflict'),
    ...slugs(read('../supabase/migrations/20261105100000_business_owners.sql'), "('verified_owner'", ';'),
  ];
  assert.ok(defined.length >= 9, `${defined.length} labels found`);
  for (const slug of defined) assert.ok(slug in LABEL_NAME || slug === 'verified_owner', `label ${slug} has no name in present.ts`);
});

check('the "Sample stays" notice says why the sample is shown, and keeps the words the tab always used when there are simply no places yet', () => {
  const tail = 'The places, prices and reviews below are examples that show how Stays will look.';
  assert.equal(sampleStaysNotice({ offline: false, error: null }), `Real albergues, hotels and cafés from OpenStreetMap are coming soon. ${tail}`);
  assert.equal(sampleStaysNotice({ offline: true, error: null }), `You are offline and no places are saved on this phone yet. ${tail}`);
  assert.equal(sampleStaysNotice({ offline: false, error: 'Could not find the function' }), `Real places could not be loaded right now. ${tail}`);
  assert.equal(sampleStaysNotice({ offline: true, error: 'x' }), `You are offline and no places are saved on this phone yet. ${tail}`, 'offline wins');
});

/* ------------------------------------------------------------------ links the phone may open */

check('a web address is opened only when it is http or https with a real host', () => {
  assert.equal(safeWebUrl('https://puntido.example.es'), 'https://puntido.example.es');
  assert.equal(safeWebUrl('http://Puntido.Example.ES/Reservas?x=1#top'), 'http://puntido.example.es/Reservas?x=1#top');
  assert.equal(safeWebUrl('www.albergue.es/camino'), 'https://www.albergue.es/camino');
  assert.equal(safeWebUrl('albergue.es'), 'https://albergue.es');
  assert.equal(safeWebUrl('  https://albergue.es:8443/x  '), 'https://albergue.es:8443/x');
  assert.equal(safeWebUrl('albergue.es:8443/x'), null, 'a bare host:port reads as a scheme ("albergue.es:") and is refused: only http(s) is ever opened');
  for (const bad of [
    'javascript:alert(1)', 'JavaScript:alert(1)', ' javascript:alert(1)', 'java\nscript:alert(1)', 'data:text/html,<b>x</b>', 'file:///etc/passwd',
    'intent://scan/#Intent;scheme=zxing;end', 'mailto:a@b.es', 'tel:+34600000000', 'ftp://albergue.es', 'vbscript:x', 'blob:https://x.es/1',
    '//evil.example.com', 'https:///evil.example.com', 'https://user:pass@albergue.es', 'https://albergue.es@evil.example.com', 'https://albergue.es\\@evil.example.com',
    'https://localhost/x', 'https://albergue', 'albergue', 'not a url', 'https://alber gue.es', '', '   ', 'https://.es', 'https://-bad.es', 'x'.repeat(301),
  ]) assert.equal(safeWebUrl(bad), null, JSON.stringify(bad));
  assert.equal(safeWebUrl(null), null);
  assert.equal(safeWebUrl(undefined), null);
  assert.equal(webLabel('https://www.casa.es/'), 'casa.es');
  assert.equal(webLabel('http://casa.es/camino'), 'casa.es/camino');
});

check('a phone number becomes a tel: link only when it looks like a number, and only its first number', () => {
  assert.equal(telUrl('+34 947 37 71 38'), 'tel:+34947377138');
  assert.equal(telUrl('947 377 138'), 'tel:947377138');
  assert.equal(telUrl('+34 947 377 138; +34 600 000 000'), 'tel:+34947377138');
  assert.equal(telUrl('(+34) 947-377-138'), 'tel:+34947377138');
  assert.equal(telUrl('(947) 377 138'), 'tel:947377138');
  assert.equal(telUrl('+34947377138 / 947 000 000'), 'tel:+34947377138');
  for (const bad of ['', 'call me', '123', '12345', '1234567890123456', '+', '###', '+++', 'tel:']) assert.equal(telUrl(bad), null, JSON.stringify(bad));
  assert.equal(telUrl(null), null);
  assert.equal(telUrl(undefined), null);
  // whatever the text, the result is a plain number: no second scheme, no extra part
  for (const odd of ['tel:+34600000000;x', 'javascript:alert(1) 600000000', '600000000?body=x', '+34 600 000 000 ext. 5']) {
    assert.match(telUrl(odd) ?? 'tel:0', /^tel:\+?\d{1,15}$/, odd);
  }
});

check('an e-mail address becomes a mailto: link only when it is a plain address: nothing else rides along', () => {
  assert.equal(mailtoUrl('info@albergue.es'), 'mailto:info@albergue.es');
  assert.equal(cleanEmail('Info@Albergue.ES; other@x.es'), 'Info@Albergue.ES');
  assert.equal(mailtoUrl('a.b+c@sub.albergue.es'), 'mailto:a.b+c@sub.albergue.es');
  for (const bad of ['a?b@y.es', 'a&b@y.es', 'a%0Ab@y.es', 'a?cc=z@y.es', 'a&bcc=z@y.es', 'a%0Abcc:z@y.es', 'a@b', 'a b@c.es', 'x@y.es?cc=z@w.es', 'x@y.es&bcc=a@b.es', '<x@y.es>', 'x@y.es%0Abcc:a@b.es', 'javascript:alert(1)@x.es', '@y.es', 'x@', '', 'albergue.es', 'x@y.es?subject=1']) {
    assert.equal(mailtoUrl(bad), null, bad);
  }
  assert.equal(mailtoUrl(null), null);
});

check('the OpenStreetMap page of a place needs a type and a positive integer id', () => {
  assert.equal(osmObjectUrl('node', 1234567890), 'https://www.openstreetmap.org/node/1234567890');
  assert.equal(osmObjectUrl('way', 42), 'https://www.openstreetmap.org/way/42');
  assert.equal(osmObjectUrl('relation', 7), 'https://www.openstreetmap.org/relation/7');
  for (const [t, i] of [[null, 5], ['node', null], ['node', 0], ['node', -1], ['node', 1.5], ['planet', 5], ['node', Number.MAX_SAFE_INTEGER + 2], [undefined, undefined]] as const) {
    assert.equal(osmObjectUrl(t as never, i as never), null, `${t} ${i}`);
  }
  assert.equal(OSM_CREDIT, '© OpenStreetMap contributors');
});

/* ------------------------------------------------------------------ models */

check('a real stay never carries a rating, a review count or a price', () => {
  const sources: DataSource[] = ['osm', 'editorial', 'partner', 'owner', 'user', 'tripadvisor', 'ota', 'unknown'];
  const levels = ['owner', 'pilgrim', 'editor', 'data_check', 'unverified'];
  for (const source of sources) for (const level of levels) {
    const m = stayModel({ source, verification_level: level });
    assert.equal(m.rating, null);
    assert.equal(m.reviews, null);
    assert.equal(m.priceText, 'Price not known');
    assert.equal(m.priceText, PRICE_NOT_KNOWN);
    assert.equal(m.priceTier, null, 'an unknown price matches no price filter');
    assert.equal(m.sample, false);
    assert.doesNotMatch(m.subtitle, /€|review|★/);
  }
});

check('a real stay as the card draws it', () => {
  const m = stayModel();
  assert.equal(m.id, ID);
  assert.equal(m.name, 'Albergue El Puntido');
  assert.equal(m.group, 'Albergue');
  assert.equal(m.kindLabel, 'Municipal albergue');
  assert.equal(m.town, 'Hontanas');
  assert.equal(m.subtitle, 'Municipal albergue · Hontanas · 12.4 km into the stage · 300 m off the Camino');
  assert.equal(m.sourceLine, 'From OpenStreetMap · Data cross-checked · Oct 2026');
  assert.equal(m.chip, 'Donativo');
  assert.equal(m.distanceKm, 0.3);
  assert.equal(m.verifiedOwner, false);
  assert.equal(m.row?.id, ID);
  assert.equal(stayModel({ labels: [] }).chip, null);
  assert.equal(stayModel({ labels: ['verified_owner'] }).chip, null, 'the owner badge is not a chip');
  assert.equal(stayModel({ detour_m: null }).distanceKm, null);
  assert.equal(stayModel({ place_name: null }).town, null);
});

check('only an owner-verified stay gets the "Verified owner" badge', () => {
  for (const l of ['pilgrim', 'editor', 'data_check', 'unverified']) assert.equal(stayModel({ verification_level: l }).verifiedOwner, false, l);
  assert.equal(stayModel({ verification_level: 'owner' }).verifiedOwner, true);
});

check('the bundled sample stays are drawn exactly as the Stays tab always drew them', () => {
  const models = sampleStayModels();
  assert.equal(models.length, bundledStays.length);
  assert.deepEqual(models.map((m) => m.id), ['st1', 'st2', 'st3', 'st4'], 'the sample ids do not change');
  bundledStays.forEach((s, i) => {
    const m = models[i];
    assert.equal(m.sample, true);
    assert.equal(m.subtitle, `${s.kind} · ${s.town} · ${s.distanceKm} km away · ${s.reviews} reviews`);
    assert.equal(m.priceText, s.price ? `€${s.price} / night` : 'Café');
    assert.equal(m.priceTier, s.price == null || s.price < 20 ? '$' : s.price <= 50 ? '$$' : '$$$');
    assert.equal(m.rating, s.rating);
    assert.equal(m.reviews, s.reviews);
    assert.equal(m.chip, s.label);
    assert.equal(m.group, s.kind);
    assert.equal(m.kindLabel, s.kind);
    assert.equal(m.distanceKm, s.distanceKm);
    assert.equal(m.tint, s.tint);
    assert.equal(m.verifiedOwner, !!s.verifiedOwner);
    assert.equal(m.sourceLine, null);
    assert.equal(m.row, null);
  });
});

check('shops, pharmacies and services are not listed as stays; a row of unknown kind is', () => {
  assert.equal(isListedStay(stay({ kind: 'service', category: 'shop' })), false);
  assert.equal(isListedStay(stay({ kind: 'stay' })), true);
  assert.equal(isListedStay(stay({ kind: 'food', category: 'cafe' })), true);
  assert.equal(isListedStay(stay({ kind: null })), true);
});

/* ------------------------------------------------------------------ pins */

check('which pin a point of interest gets, for every category the database has', () => {
  const expected: Record<string, string | null> = {
    cathedral: 'church', church: 'church', chapel: 'church', monastery: 'church', fountain: 'water', water: 'water',
    cross: null, monument: null, museum: null, bridge: null, viewpoint: null, milestone: null, pharmacy: null, hospital: null, atm: null,
    supermarket: null, bike_shop: null, post_office: null, toilet: null, other: null,
  };
  for (const [category, kind] of Object.entries(expected)) assert.equal(poiPinKind(category, false), kind, category);
  assert.equal(poiPinKind('tourist_info', false), null, 'a tourist office is only a stamp point when it has the stamp');
  assert.equal(poiPinKind('tourist_info', true), 'stamp');
  assert.equal(poiPinKind('church', true), 'church', 'a church with a stamp is still a church pin');
  assert.equal(poiPinKind('something_new', false), null);
});

check('which pin a stay gets: albergue for a place to sleep, cafe for a place to eat, none for a shop', () => {
  const kind = (category: string, k: StayRow['kind'] = null) => stayPinKind({ category, kind: k });
  for (const c of ['albergue_municipal', 'albergue_parochial', 'albergue_private', 'hostel', 'hotel', 'pension', 'guesthouse', 'casa_rural', 'apartment', 'camping']) assert.equal(kind(c), 'albergue', c);
  for (const c of ['cafe', 'bar', 'restaurant', 'bakery']) assert.equal(kind(c), 'cafe', c);
  for (const c of ['shop', 'pharmacy', 'bike_service', 'luggage_service', 'tour_operator', 'other_service']) assert.equal(kind(c, 'service'), null, c);
  assert.equal(kind('glamping_dome', 'stay'), 'albergue', 'an unknown category falls back on the kind the database derived');
  assert.equal(kind('food_truck', 'food'), 'cafe');
  assert.equal(kind('glamping_dome', null), null);
});

check('a real point of interest as a pin: [lng, lat], what it is, where it is, where it came from', () => {
  const p = poiPin(parsePoiRow(poiWire({ place_name: 'Hontanas', detour_m: 120 }))!);
  assert.ok(p);
  assert.deepEqual(p.at, [-4.05, 42.31]);
  assert.equal(p.kind, 'church');
  assert.equal(p.label, 'Chapel');
  assert.equal(p.name, 'Ermita de San Miguel');
  assert.equal(p.blurb, 'Hontanas · 120 m off the Camino\nHours (OpenStreetMap): Mo-Su 09:00-19:00\nMass: Su 11:00');
  assert.equal(p.sourceLine, 'From OpenStreetMap · Not verified yet');
  assert.equal(p.osmUrl, 'https://www.openstreetmap.org/way/42');
  assert.equal(p.sample, false);
  assert.equal(p.stayId, null);
  assert.equal(p.xp, undefined);
  assert.equal(p.audioMin, undefined, 'a real pin has no audio story or quest');
  assert.equal(poiPin(parsePoiRow(poiWire({ category: 'pharmacy' }))!), null, 'no pin for a pharmacy yet');
  // with nothing else to say the pin says what it is
  const bare = poiPin(parsePoiRow(poiWire({ place_name: null, detour_m: 0, opening_hours: null, mass_times: null, category: 'fountain' }))!);
  assert.equal(bare?.blurb, 'Fountain');
  assert.equal(bare?.osmUrl, 'https://www.openstreetmap.org/way/42');
});

check('a real stay as a pin remembers which stay it is, a shop is no pin', () => {
  const p = stayPin(stay({ category: 'cafe', opening_hours: 'Mo-Fr 08:00-15:00', detour_m: 800, place_name: null }));
  assert.ok(p);
  assert.equal(p.kind, 'cafe');
  assert.equal(p.stayId, ID);
  assert.equal(p.label, 'Café');
  assert.equal(p.blurb, '800 m off the Camino\nHours (OpenStreetMap): Mo-Fr 08:00-15:00');
  assert.deepEqual(p.at, [-4.0463, 42.3093]);
  assert.equal(stayPin(stay({ category: 'shop', kind: 'service' })), null);
});

check('the bundled sample pins are the twelve hand-placed ones, marked as samples', () => {
  const pins = samplePins();
  assert.equal(pins.length, bundledPois.length);
  assert.deepEqual(pins.map((p) => p.id), bundledPois.map((p) => p.id));
  for (const p of pins) { assert.equal(p.sample, true); assert.equal(p.sourceLine, null); assert.equal(p.osmUrl, null); assert.equal(p.stayId, null); }
  assert.ok(pins.some((p) => p.kind === 'quest' && p.xp), 'the quests keep their XP');
});

check('which pins the map draws: real ones when the stage has places, the sample when it has none, nothing while it asks', () => {
  const sample = samplePins();
  const realStay = stayModel();
  const realPoi = poiPin(parsePoiRow(poiWire())!)!;
  const side = <M,>(rows: M[], source: PlaceSource, loading = false) => ({ rows, source, loading });
  const run = (stays: ReturnType<typeof side<StayModel>>, pois: ReturnType<typeof side<PlacePin>>) => choosePins({ stays, pois, sample });

  // nothing real, both answers in: the sample
  assert.deepEqual(run(side([], 'sample'), side([], 'sample')), { pins: sample, source: 'sample' });
  // nothing real, one answer still on its way: nothing yet (the sample must not flash before the real pins)
  assert.deepEqual(run(side([], 'sample', true), side([], 'sample')), { pins: [], source: 'sample' });
  assert.deepEqual(run(side([], 'sample'), side([], 'sample', true)), { pins: [], source: 'sample' });
  assert.deepEqual(run(side([], 'sample', true), side([], 'sample', true)), { pins: [], source: 'sample' });
  // real stays, no points of interest: only the real stay, never mixed with sample pins
  const staysOnly = run(side([realStay], 'live'), side([], 'sample'));
  assert.deepEqual(staysOnly.pins.map((p) => p.id), [ID]);
  assert.equal(staysOnly.source, 'live');
  assert.ok(staysOnly.pins.every((p) => !p.sample));
  // real points of interest, no stays
  const poisOnly = run(side([], 'sample'), side([realPoi], 'live'));
  assert.deepEqual(poisOnly.pins.map((p) => p.id), [realPoi.id]);
  // both, saved copy: points of interest first, then the stays
  const both = run(side([realStay], 'cache'), side([realPoi], 'cache'));
  assert.deepEqual(both.pins.map((p) => p.id), [realPoi.id, ID]);
  assert.equal(both.source, 'cache');
  assert.equal(run(side([realStay], 'cache'), side([realPoi], 'live')).source, 'live');
  // a stay model that is a sample (no row) never becomes a real pin
  const fakeSample = sampleStayModels();
  assert.deepEqual(run(side(fakeSample, 'live'), side([], 'sample')).pins, []);
  // the stage has real places but none the map can draw: an empty map, NOT the sample
  const none = run(side([stayModel({ category: 'shop', kind: 'service' })], 'live'), side([], 'sample'));
  assert.deepEqual(none, { pins: [], source: 'live' });
});

/* ------------------------------------------------------------------ the saved copy */

check('the saved copy: what is written is what is read, rows are checked again on the way out', () => {
  const rows = [wire(), wire({ id: '5e0d0000-0000-4000-8000-000000000002', name: 'Second' })];
  const now = Date.UTC(2026, 10, 7);
  const env = makeEnvelope(rows, now);
  assert.deepEqual(env, { v: CACHE_VERSION, savedAt: now, rows });
  const back = readEnvelope(JSON.parse(JSON.stringify(env)), now + 1000, parseStayRows);
  assert.equal(back?.rows.length, 2);
  assert.equal(back?.savedAt, now);
  assert.equal(back?.rows[1].name, 'Second');
  // a row that is no longer sane (the file was edited, or an older version wrote it) is dropped, not trusted
  const damaged = readEnvelope({ ...env, rows: [wire({ lat: 500 }), wire({ id: 'x' }), wire()] }, now, parseStayRows);
  assert.equal(damaged?.rows.length, 1);
  assert.equal(readEnvelope({ ...env, rows: [wire({ lat: 500 })] }, now, parseStayRows), null, 'nothing usable left: nothing to show');
});

check('the saved copy is ignored when it cannot be trusted: wrong version, wrong shape, empty, unreadable times', () => {
  const now = Date.UTC(2026, 10, 7);
  const ok = makeEnvelope([wire()], now);
  assert.ok(readEnvelope(ok, now, parseStayRows));
  for (const bad of [null, undefined, 'x', 7, [], {}, { ...ok, v: 0 }, { ...ok, v: 2 }, { ...ok, v: '1' }, { ...ok, savedAt: 'yesterday' }, { ...ok, savedAt: NaN }, { ...ok, savedAt: null },
    { ...ok, rows: {} }, { ...ok, rows: 'x' }, { ...ok, rows: [] }, { v: CACHE_VERSION, rows: [wire()] }]) {
    assert.equal(readEnvelope(bad, now, parseStayRows), null, JSON.stringify(bad));
  }
  assert.equal(readEnvelope(ok, now, () => null), null, 'rows that do not parse as a list');
});

check('cache expiry: shown up to 30 days, not a millisecond longer; a time in the future is distrusted', () => {
  const t = Date.UTC(2026, 10, 7, 12);
  const at = (savedAt: number) => makeEnvelope([wire()], savedAt);
  assert.equal(CACHE_MAX_AGE_MS, 30 * 86_400_000);
  assert.ok(readEnvelope(at(t), t, parseStayRows), 'just saved');
  assert.ok(readEnvelope(at(t - 29 * 86_400_000), t, parseStayRows), '29 days');
  assert.ok(readEnvelope(at(t - CACHE_MAX_AGE_MS), t, parseStayRows), 'exactly 30 days');
  assert.equal(readEnvelope(at(t - CACHE_MAX_AGE_MS - 1), t, parseStayRows), null, '30 days and a millisecond');
  assert.equal(readEnvelope(at(t - 400 * 86_400_000), t, parseStayRows), null, 'a year');
  assert.ok(readEnvelope(at(t + CLOCK_SKEW_MS), t, parseStayRows), 'a clock a little ahead is fine');
  assert.equal(readEnvelope(at(t + CLOCK_SKEW_MS + 1), t, parseStayRows), null, 'a clock set far ahead: the file is distrusted');
  assert.equal(readEnvelope(at(t + 5 * 60_000), t, parseStayRows)?.savedAt, t, 'a time slightly ahead reads as now, so the age is never negative');
});

check('fresh: a list fetched less than 10 minutes ago in this session is not fetched again', () => {
  const t = 1_000_000_000_000;
  assert.equal(FRESH_MS, 600_000);
  assert.equal(isFresh(t, t), true);
  assert.equal(isFresh(t - FRESH_MS + 1, t), true);
  assert.equal(isFresh(t - FRESH_MS, t), false);
  assert.equal(isFresh(t - 3 * FRESH_MS, t), false);
  assert.equal(isFresh(t + 1, t), false, 'a time in the future is never "fresh"');
});

check('the saved lists are bounded: the least recently used go first', () => {
  assert.equal(cacheKey('stays', ID), `places.stays.${ID}`);
  assert.equal(cacheKey('pois', ID), `places.pois.${ID}`);
  assert.equal(CACHE_INDEX_KEY, 'places.index');
  let r = touchIndex(null, 'a', 1, 3);
  assert.deepEqual(r, { index: [{ key: 'a', at: 1 }], evicted: [] });
  r = touchIndex(r.index, 'b', 2, 3);
  r = touchIndex(r.index, 'c', 3, 3);
  assert.deepEqual(r.index.map((e) => e.key), ['a', 'b', 'c']);
  // reading or writing a again makes it the newest
  r = touchIndex(r.index, 'a', 4, 3);
  assert.deepEqual(r.index.map((e) => e.key), ['b', 'c', 'a']);
  assert.deepEqual(r.evicted, []);
  // a fourth one pushes the oldest (b) out, and says so
  r = touchIndex(r.index, 'd', 5, 3);
  assert.deepEqual(r.index.map((e) => e.key), ['c', 'a', 'd']);
  assert.deepEqual(r.evicted, ['b']);
  // a damaged index counts as empty, repeated and odd entries are tidied
  assert.deepEqual(touchIndex('garbage', 'x', 9).index, [{ key: 'x', at: 9 }]);
  assert.deepEqual(touchIndex({ key: 'x' }, 'x', 9).evicted, []);
  const messy = touchIndex([{ key: 'a', at: 1 }, { key: 'a', at: 5 }, null, 7, { key: 3, at: 1 }, { key: 'z', at: 'x' }, { key: 'b', at: NaN }, { key: 'c', at: 2 }], 'd', 10, 5);
  assert.deepEqual(messy.index, [{ key: 'c', at: 2 }, { key: 'a', at: 5 }, { key: 'd', at: 10 }]);
  assert.equal(MAX_CACHED_LISTS, 24);
  // many writes never grow past the limit
  let idx: unknown = [];
  const gone: string[] = [];
  for (let i = 0; i < 100; i++) { const t = touchIndex(idx, `k${i}`, i); idx = t.index; gone.push(...t.evicted); }
  assert.equal((idx as unknown[]).length, MAX_CACHED_LISTS);
  assert.equal(gone.length, 100 - MAX_CACHED_LISTS);
  assert.equal(gone[0], 'k0');
});

/* ------------------------------------------------------------------ live, saved or sample */

check('what to show before the server answers: the saved copy, or nothing', () => {
  const cached: Cached<number> = { rows: [1, 2], savedAt: 123 };
  assert.deepEqual(beforeAnswer(cached), { rows: [1, 2], source: 'cache', offline: false, error: null, savedAt: 123, cache: 'keep' });
  assert.equal(beforeAnswer<number>(null), null);
});

check('live, saved or sample: every combination of what the server said and what is saved', () => {
  const cached: Cached<number> = { rows: [7, 8], savedAt: 111 };
  const now = 5000;
  // the server answers with places
  assert.deepEqual(afterAnswer({ ok: true, rows: [1, 2, 3] }, cached, now), { rows: [1, 2, 3], source: 'live', offline: false, error: null, savedAt: now, cache: 'write' });
  assert.deepEqual(afterAnswer({ ok: true, rows: [1] }, null, now), { rows: [1], source: 'live', offline: false, error: null, savedAt: now, cache: 'write' });
  // the server answers with an empty list: believed, the saved copy is dropped, the sample is shown
  assert.deepEqual(afterAnswer({ ok: true, rows: [] }, cached, now), { rows: [], source: 'sample', offline: false, error: null, savedAt: null, cache: 'clear' });
  assert.deepEqual(afterAnswer({ ok: true, rows: [] }, null, now), { rows: [], source: 'sample', offline: false, error: null, savedAt: null, cache: 'clear' });
  // offline: the saved copy, kept; without one the sample
  assert.deepEqual(afterAnswer({ ok: false, offline: true, message: 'You are offline.' }, cached, now), { rows: [7, 8], source: 'cache', offline: true, error: null, savedAt: 111, cache: 'keep' });
  assert.deepEqual(afterAnswer({ ok: false, offline: true, message: 'You are offline.' }, null, now), { rows: [], source: 'sample', offline: true, error: null, savedAt: null, cache: 'keep' });
  // an error (the function is missing, a timeout, an odd answer): the saved copy, kept, with the reason; without one the sample
  const err = { ok: false as const, offline: false, message: 'Could not find the function public.list_stage_stays(p_stage) in the schema cache' };
  assert.deepEqual(afterAnswer(err, cached, now), { rows: [7, 8], source: 'cache', offline: false, error: err.message, savedAt: 111, cache: 'keep' });
  assert.deepEqual(afterAnswer(err, null, now), { rows: [], source: 'sample', offline: false, error: err.message, savedAt: null, cache: 'keep' });
});

check('a failed answer never throws the saved copy away', () => {
  const cached: Cached<string> = { rows: ['x'], savedAt: 1 };
  for (const offline of [true, false]) assert.equal(afterAnswer({ ok: false, offline, message: 'm' }, cached, 2).cache, 'keep');
});

const PLAN: PlanStage = { journeyId: 'j1', stageId: '40000000-0000-4000-8000-000000000002', stageName: 'Roncesvalles to Zubiri' };
const START = { stageId: '40000000-0000-4000-8000-000000000001', stageName: 'Saint-Jean-Pied-de-Port to Roncesvalles' };

check('the stage the Stays tab lists: the next day of the plan, then what is saved, then where the journey started', () => {
  // the plan was read: it wins (and is saved)
  assert.deepEqual(chooseMyStage({ journeyId: 'j1', fetched: PLAN, cached: null, start: START }), { stage: PLAN, cache: 'write' });
  assert.deepEqual(chooseMyStage({ journeyId: 'j1', fetched: PLAN, cached: { ...PLAN, stageId: 'old' }, start: START }), { stage: PLAN, cache: 'write' });
  // the plan was read and no day is left: the walk is over, no stage, and the saved one is dropped
  assert.deepEqual(chooseMyStage({ journeyId: 'j1', fetched: null, cached: PLAN, start: START }), { stage: null, cache: 'clear' });
  // the plan could not be read: the saved one of this journey, then the start stage
  assert.deepEqual(chooseMyStage({ journeyId: 'j1', fetched: 'failed', cached: PLAN, start: START }), { stage: PLAN, cache: 'keep' });
  assert.deepEqual(chooseMyStage({ journeyId: 'j1', fetched: 'failed', cached: { ...PLAN, journeyId: 'other' }, start: START }), { stage: { journeyId: 'j1', ...START }, cache: 'keep' });
  assert.deepEqual(chooseMyStage({ journeyId: 'j1', fetched: 'failed', cached: null, start: START }), { stage: { journeyId: 'j1', ...START }, cache: 'keep' });
  assert.deepEqual(chooseMyStage({ journeyId: 'j1', fetched: 'failed', cached: null, start: { stageId: null, stageName: null } }), { stage: null, cache: 'keep' });
  // no journey, no stage
  assert.deepEqual(chooseMyStage({ journeyId: null, fetched: PLAN, cached: PLAN, start: START }), { stage: null, cache: 'keep' });
});

console.log(`${n} of ${n} passed`);
