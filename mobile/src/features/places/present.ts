// The words the app uses for a real place: what it is, where it came from, how far it was checked, how far it is.
// Pure (no React Native imports): plain node tests cover every rule (npm run test:places).
//
// Honesty rules kept here:
//   * the source is always named ("From OpenStreetMap"), and "Data cross-checked" is never worded as "verified":
//     a data check says open sources agree, not that the albergue is open tonight (tools/poi-audit/README.md);
//   * a missing price is "Price not known", a missing rating is nothing at all; a number is never made up;
//   * "0 m off the route" can mean "not measured", so a detour under 50 m is never written as "on the Camino".
import { tints } from '../../data/mock';
import { timeAgo } from '../map/timeAgo';
import type { DataSource, PriceTier, StayGroup, VerificationLevel } from './types';

/* ------------------------------------------------------------------ source and verification */

const SOURCE_LABEL: Record<DataSource, string> = {
  osm: 'From OpenStreetMap',
  editorial: 'From CaminoPlus',
  owner: 'Added by the owner',
  partner: 'From a CaminoPlus partner',
  user: 'Added by a pilgrim',
  tripadvisor: 'From Tripadvisor',
  ota: 'From a booking site',
  unknown: 'Source not known',
};
export const sourceLabel = (s: DataSource) => SOURCE_LABEL[s] ?? SOURCE_LABEL.unknown;

// The same words as public.verification_label() in the database (migration 20261106100000_data_audit.sql).
const LEVEL_LABEL: Record<VerificationLevel, string> = {
  owner: 'Verified by owner',
  pilgrim: 'Confirmed by pilgrims',
  editor: 'Checked by CaminoPlus',
  data_check: 'Data cross-checked',
  unverified: 'Not verified yet',
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Not verified yet", "Data cross-checked · Oct 2026" ... (the month is only added for a level that has a date). */
export function verificationLabel(level: VerificationLevel, at: string | null): string {
  const base = LEVEL_LABEL[level] ?? LEVEL_LABEL.unverified;
  if (level === 'unverified' || !at) return base;
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return base;
  return `${base} · ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** The one line under a real place: "From OpenStreetMap · Not verified yet". */
export const placeSourceLine = (source: DataSource, level: VerificationLevel, at: string | null) => `${sourceLabel(source)} · ${verificationLabel(level, at)}`;

/** "Saved on this phone · updated 3 days ago" for a list that comes from the saved copy. */
export const savedLine = (savedAt: number | null, now = Date.now()) => (savedAt ? `Saved on this phone · updated ${timeAgo(savedAt, now)}` : 'Saved on this phone');

/* ------------------------------------------------------------------ what a place is */

/** "family_run" -> "Family run". */
export function humanize(slug: string): string {
  const t = slug.replace(/[_-]+/g, ' ').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

export const STAY_LABEL: Record<string, string> = {
  albergue_municipal: 'Municipal albergue',
  albergue_parochial: 'Parish albergue',
  albergue_private: 'Private albergue',
  hostel: 'Hostel',
  hotel: 'Hotel',
  pension: 'Pension',
  guesthouse: 'Guesthouse',
  casa_rural: 'Rural house',
  apartment: 'Apartment',
  camping: 'Campsite',
  cafe: 'Café',
  bar: 'Bar',
  restaurant: 'Restaurant',
  bakery: 'Bakery',
  shop: 'Shop',
  pharmacy: 'Pharmacy',
  bike_service: 'Bike service',
  luggage_service: 'Luggage service',
  tour_operator: 'Tour operator',
  other_service: 'Service',
};
export const POI_LABEL: Record<string, string> = {
  cathedral: 'Cathedral',
  church: 'Church',
  chapel: 'Chapel',
  monastery: 'Monastery',
  cross: 'Cross',
  monument: 'Monument',
  museum: 'Museum',
  bridge: 'Bridge',
  viewpoint: 'Viewpoint',
  milestone: 'Milestone',
  fountain: 'Fountain',
  water: 'Drinking water',
  pharmacy: 'Pharmacy',
  hospital: 'Hospital',
  atm: 'ATM',
  supermarket: 'Supermarket',
  bike_shop: 'Bike shop',
  post_office: 'Post office',
  tourist_info: 'Tourist information',
  toilet: 'Toilets',
  other: 'Place',
};
/** What a stay is called on its card ("Municipal albergue"); a category this version does not know is made readable. */
export const stayCategoryLabel = (category: string) => STAY_LABEL[category] ?? humanize(category);
/** What a point of interest is called ("Chapel"). */
export const poiCategoryLabel = (category: string) => POI_LABEL[category] ?? humanize(category);

/** The group of the filter sheet a stay belongs to; null = shown under All only (a campsite, a shop ...). */
export function stayGroup(category: string): StayGroup | null {
  switch (category) {
    case 'albergue_municipal':
    case 'albergue_parochial':
    case 'albergue_private':
    case 'hostel':
      return 'Albergue';
    case 'hotel':
    case 'pension':
    case 'guesthouse':
    case 'casa_rural':
    case 'apartment':
      return 'Hotel';
    case 'cafe':
    case 'bar':
    case 'restaurant':
    case 'bakery':
      return 'Café';
    default:
      return null;
  }
}

/** Placeholder colour of a stay without a photo: by group, so the list still reads at a glance. */
export function stayTint(category: string): string {
  const g = stayGroup(category);
  return g === 'Albergue' ? tints[0] : g === 'Hotel' ? tints[1] : g === 'Café' ? tints[4] : tints[2];
}

/** $ = under €20 (and cafés), $$ = €20 to €50, $$$ = over €50. Only for the bundled samples: a real place has no price here. */
export const priceTier = (price: number | null): PriceTier => (price == null || price < 20 ? '$' : price <= 50 ? '$$' : '$$$');

export const PRICE_NOT_KNOWN = 'Price not known';

export const LABEL_NAME: Record<string, string> = {
  pilgrims_only: 'Pilgrims only',
  donativo: 'Donativo',
  open_all_year: 'Open all year',
  pet_friendly: 'Pet friendly',
  bike_friendly: 'Bike friendly',
  accessible: 'Accessible',
  menu_peregrino: 'Pilgrim menu',
  partner: 'CaminoPlus partner',
};
// shown by the verification line ("Verified by owner") instead of as a chip
const HIDDEN_LABELS = ['verified_owner'];
/** The labels of a stay as people read them, in the order the database sends them; the owner badge is left out. */
export const labelNames = (slugs: string[]) => slugs.filter((s) => !HIDDEN_LABELS.includes(s)).map((s) => LABEL_NAME[s] ?? humanize(s));

const AMENITY_NAME: Record<string, string> = { wifi: 'Wi-Fi' };
export const amenityNames = (slugs: string[]) => slugs.map((s) => AMENITY_NAME[s] ?? humanize(s));

/* ------------------------------------------------------------------ where it is */

/** "300 m off the Camino" / "1.3 km off the Camino"; null under 50 m (0 can mean "not measured"). */
export function offRouteText(detourM: number | null | undefined): string | null {
  if (detourM == null || !Number.isFinite(detourM) || detourM < 50) return null;
  const tens = Math.round(detourM / 10) * 10;
  if (tens < 1000) return `${tens} m off the Camino`;
  return `${(Math.round(detourM / 100) / 10).toFixed(1)} km off the Camino`;
}

/** "12.4 km into the stage"; null when the link does not say. */
export function kmIntoStageText(km: number | null | undefined): string | null {
  if (km == null || !Number.isFinite(km) || km < 0) return null;
  const v = Math.round(km * 10) / 10;
  return v === 0 ? 'At the start of the stage' : `${v} km into the stage`;
}

/** The small line under the name of a real stay: "Municipal albergue · Hontanas · 12.4 km into the stage · 300 m off the Camino". */
export function staySubtitle(p: { kindLabel: string; town: string | null; km: number | null; detourM: number | null }): string {
  return [p.kindLabel, p.town, kmIntoStageText(p.km), offRouteText(p.detourM)].filter(Boolean).join(' · ');
}

/* ------------------------------------------------------------------ the sample notice */

/**
 * What the "Sample stays" notice says, by why the sample is shown: the database has no places for the stage yet (the
 * words the tab always used), the phone is offline with nothing saved, or the places could not be loaded.
 */
export function sampleStaysNotice(why: { offline: boolean; error: string | null }): string {
  const tail = 'The places, prices and reviews below are examples that show how Stays will look.';
  if (why.offline) return `You are offline and no places are saved on this phone yet. ${tail}`;
  if (why.error) return `Real places could not be loaded right now. ${tail}`;
  return `Real albergues, hotels and cafés from OpenStreetMap are coming soon. ${tail}`;
}
