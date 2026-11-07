// Real places (stays, cafes, churches, fountains ...) along a stage, as the app holds them. No React Native imports in
// this folder's pure files (types, parse, present, links, models, cache, decide, api): plain node tests cover them
// (npm run test:places). The React and storage parts are usePlaces.ts, store.ts and client.ts.
import type { LngLat } from '../map/geo';
import type { PoiKind } from '../map/sampleRoute';

/**
 * Where the rows on screen come from:
 *   live    the server answered during this app session
 *   cache   the copy saved on this phone (the server could not be reached, or it has not answered yet)
 *   sample  the bundled examples: the database has no places for this stage yet (or there is nothing saved and no
 *           connection). Screens must label them as examples.
 */
export type PlaceSource = 'live' | 'cache' | 'sample';

/** What a place is based on (stays.source / pois.source). `unknown` = a value this app version does not know. */
export type DataSource = 'osm' | 'editorial' | 'partner' | 'owner' | 'user' | 'tripadvisor' | 'ota' | 'unknown';
/** How far a place was checked, strongest first (supabase/migrations/20261106100000_data_audit.sql). */
export type VerificationLevel = 'owner' | 'pilgrim' | 'editor' | 'data_check' | 'unverified';
export type OsmType = 'node' | 'way' | 'relation';

/** What both functions answer about a place. Missing things are null, never an empty string or a made-up value. */
type RowCommon = {
  id: string;
  name: string;
  category: string;
  /** The town the place is linked to, when it is linked to one. */
  place_name: string | null;
  lat: number;
  lng: number;
  phone: string | null;
  website: string | null;
  /** OpenStreetMap opening_hours syntax, shown as it is (never parsed into "open now"). */
  opening_hours: string | null;
  km_from_stage_start: number | null;
  /** Metres off the route. 0 also means "not measured": it is never shown as "on the Camino". */
  detour_m: number | null;
  has_stamp: boolean;
  data_confidence: number | null;
  verification_level: VerificationLevel;
  /** When the level was reached (ISO time); null for unverified. */
  verification_at: string | null;
  source: DataSource;
  osm_type: OsmType | null;
  osm_id: number | null;
};

/** One row of rpc list_stage_stays. */
export type StayRow = RowCommon & {
  kind: 'stay' | 'food' | 'service' | null;
  email: string | null;
  address: string | null;
  description: string | null;
  beds: number | null;
  /** Slugs (wifi, kitchen ...). */
  amenities: string[];
  /** Slugs of stay_labels (donativo, pilgrims_only ...). */
  labels: string[];
};

/** One row of rpc list_stage_pois. */
export type PoiRow = RowCommon & {
  mass_times: string | null;
};

/** The groups of the filter sheet in the Stays tab. A place in none of them (a campsite) shows under All only. */
export type StayGroup = 'Albergue' | 'Hotel' | 'Café';
export type PriceTier = '$' | '$$' | '$$$';

/**
 * A stay as the Stays tab and the stay page draw it. Real rows and the bundled samples both become one of these, so
 * the screens have one code path; `sample` says which, and rating / reviews / price are null when they are not known.
 */
export type StayModel = {
  id: string;
  sample: boolean;
  name: string;
  group: StayGroup | null;
  /** What it is, for the card: "Albergue", "Pension", "Café". */
  kindLabel: string;
  town: string | null;
  tint: string;
  verifiedOwner: boolean;
  rating: number | null;
  reviews: number | null;
  /** "€14 / night", "Café" (samples) or "Price not known" (real places). */
  priceText: string;
  /** For the price filter. Null = not known: it matches no tier. */
  priceTier: PriceTier | null;
  /** The small chip at the bottom right of the card; null = none. */
  chip: string | null;
  /** What the distance filter compares: how far away (samples) or how far off the Camino (real). Null = not known. */
  distanceKm: number | null;
  /** The small line under the name. */
  subtitle: string;
  /** "From OpenStreetMap · Not verified yet". Null for samples. */
  sourceLine: string | null;
  /** The row behind a real stay (null for samples): the stay page reads its details from it. */
  row: StayRow | null;
};

/** A pin on the map: a real stay, a real point of interest, or one of the bundled sample pins. */
export type PlacePin = {
  id: string;
  kind: PoiKind;
  name: string;
  at: LngLat;
  /** Short text under the name (one or more lines). */
  blurb: string;
  xp?: number;
  audioMin?: number;
  sample: boolean;
  /** What it is, for the card chip ("Chapel"). Null = use the name of the kind. */
  label: string | null;
  /** "From OpenStreetMap · Not verified yet". Null for samples. */
  sourceLine: string | null;
  /** The OpenStreetMap object the pin came from. */
  osmUrl: string | null;
  /** Set when the pin is a stay: the id the stay page opens with. */
  stayId: string | null;
};

/** What the hooks answer. */
export type PlacesState<M> = {
  /** What to draw. For source 'sample' these are the bundled examples; empty while `loading`. */
  rows: M[];
  source: PlaceSource;
  /** Nothing to show yet and the first answer (saved copy or server) is still on its way. Refreshes in the background do not set it. */
  loading: boolean;
  /** The last refresh failed for a reason other than being offline (a message for logs, not for pilgrims). */
  error: string | null;
  /** The last refresh could not reach the server. */
  offline: boolean;
  /** When the rows on screen were fetched from the server (ms since epoch); null for samples. */
  savedAt: number | null;
};

/** The server's answer to one list call, never thrown. */
export type FetchResult<R> = { ok: true; rows: R[] } | { ok: false; offline: boolean; message: string };

/** A saved list and when it was saved. */
export type Cached<R> = { rows: R[]; savedAt: number };
