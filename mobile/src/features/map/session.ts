// The map module never talks to Supabase Auth directly. Whoever owns login (the auth
// module) registers a token provider once, e.g. in the root layout:
//
//   import { setMapSession } from '@/features/map';
//   setMapSession({ getAccessToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null });
//
// Until then the map works fully offline with already-downloaded packs, and the
// download manager shows "Sign in to download".
export type MapSession = {
  /** Current user's Supabase access token (JWT), or null when signed out. */
  getAccessToken: () => Promise<string | null>;
};

let session: MapSession = { getAccessToken: async () => null };

export function setMapSession(s: MapSession) {
  session = s;
}

export function getAccessToken() {
  return session.getAccessToken();
}
