import { AppState, Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { config } from './config';
import { secureStorage } from './secureStorage';
import type { Session } from '@supabase/supabase-js';

export const supabase = createClient(config.supabaseUrl, config.supabaseKey, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // deep links are handled in lib/authLinks.ts
    flowType: 'pkce',
  },
});

// Refresh tokens only while the app is in the foreground (saves battery on the trail).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

// supabase-js derives its storage key from the project host. Reading the stored session directly lets
// the app start offline: getSession() cannot answer while an expired access token is being refreshed
// without a network (it retries for ~30 s and then reports no session even though the refresh token is
// still stored). The returned session may have an expired access token: use it for UI state only.
export const authStorageKey = `sb-${new URL(config.supabaseUrl).hostname.split('.')[0]}-auth-token`;

export async function readStoredSession(): Promise<Session | null> {
  try {
    const raw = await secureStorage.getItem(authStorageKey);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<Session> | null;
    return s && s.refresh_token && s.user?.id ? (s as Session) : null;
  } catch {
    return null;
  }
}
