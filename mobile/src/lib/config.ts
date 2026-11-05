// Public client config. Only the project URL and the publishable (anon) key
// belong in the app: both are safe to ship, RLS protects the data.
// NEVER put the service_role key here or in any EXPO_PUBLIC_ variable.
// Override per build with EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_KEY (see .env.example).
const EU_PROJECT_URL = 'https://xgikdabgdqmbdgagowva.supabase.co';
const EU_PUBLISHABLE_KEY = 'sb_publishable_tM2U4JVCBMgnMZ86-_DM0g_KxYFGNVQ';

export const config = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || EU_PROJECT_URL,
  supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_KEY || EU_PUBLISHABLE_KEY,
  // Deep link that Supabase sends the user back to (email confirm, reset, Google).
  // Must be listed in Supabase Auth > URL Configuration > Redirect URLs.
  authCallbackPath: 'auth-callback',
  priceLabel: '$12 / year',
} as const;
