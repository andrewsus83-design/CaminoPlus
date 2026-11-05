import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';
import { config } from './config';

WebBrowser.maybeCompleteAuthSession();

/** caminoplus://auth-callback in a build, exp://.../--/auth-callback in Expo Go. */
export const authRedirectUrl = (next?: string) => Linking.createURL(config.authCallbackPath, next ? { queryParams: { next } } : undefined);

/**
 * Finish a Supabase redirect. Handles the PKCE `code` (email confirm, password
 * reset, Google) and the older `#access_token=` fragment, and surfaces errors.
 */
export async function completeAuthFromUrl(url: string): Promise<{ ok: boolean; error?: string }> {
  const parsed = new URL(url.replace('#', url.includes('?') ? '&' : '?'));
  const p = parsed.searchParams;
  const err = p.get('error_description') || p.get('error');
  if (err) return { ok: false, error: err.replace(/\+/g, ' ') };
  const code = p.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return error ? { ok: false, error: error.message } : { ok: true };
  }
  const access_token = p.get('access_token');
  const refresh_token = p.get('refresh_token');
  if (access_token && refresh_token) {
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    return error ? { ok: false, error: error.message } : { ok: true };
  }
  return { ok: false, error: 'This link is incomplete or has expired.' };
}

/** Google sign-in through the system browser (works in Expo Go and dev builds). */
export async function signInWithGoogle(): Promise<{ ok: boolean; error?: string; cancelled?: boolean }> {
  const redirectTo = authRedirectUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  });
  if (error || !data?.url) return { ok: false, error: error?.message ?? 'Google sign-in is not available yet.' };
  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (res.type !== 'success') return { ok: false, cancelled: true };
  return completeAuthFromUrl(res.url);
}
