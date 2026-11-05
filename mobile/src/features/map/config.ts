// Map module settings. Public values only (they ship inside the app).
const env = (k: string) => (process.env[k] ?? '').trim();

export const mapConfig = {
  supabaseUrl: env('EXPO_PUBLIC_SUPABASE_URL').replace(/\/$/, ''),
  supabaseAnonKey: env('EXPO_PUBLIC_SUPABASE_ANON_KEY'),
  // MapTiler is used ONLINE only. Its terms forbid bulk/offline caching of its tiles,
  // so offline packs always come from our own OSM build (tools/offline-maps).
  maptilerKey: env('EXPO_PUBLIC_MAPTILER_KEY'),
};

export const hasSupabase = () => !!mapConfig.supabaseUrl && !!mapConfig.supabaseAnonKey;
export const hasMapTiler = () => !!mapConfig.maptilerKey;

// MapTiler "v3" tiles use the OpenMapTiles schema, the same schema as our packs, so one
// style (style.ts) draws both and switching online/offline does not change the look.
export const maptilerTilesUrl = () => `https://api.maptiler.com/tiles/v3/tiles.json?key=${encodeURIComponent(mapConfig.maptilerKey)}`;

export const OSM_ATTRIBUTION = '© OpenMapTiles © OpenStreetMap contributors';
export const MAPTILER_ATTRIBUTION = '© MapTiler © OpenStreetMap contributors';
