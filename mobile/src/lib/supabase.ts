import { AppState, Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { config } from './config';
import { secureStorage } from './secureStorage';

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
