import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';
import { config } from './config';

WebBrowser.maybeCompleteAuthSession();

/** caminoplus://auth-callback in a build, exp://.../--/auth-callback in Expo Go. */
export const authRedirectUrl = (next?: string) => Linking.createURL(config.authCallbackPath, next ? { queryParams: { next } } : undefined);

/**
 * Finish a Supabase redirect (email confirm, password reset, Google). The app uses the PKCE flow, so the
 * only thing a valid link carries is a one-time `code`, which can be exchanged only on the phone that
 * started the flow (it holds the matching code verifier). Errors come back as `error_description`.
 *
 * Raw `access_token` / `refresh_token` values in a link are deliberately NOT accepted: any web page or app
 * can open caminoplus://auth-callback#access_token=..., and accepting tokens would silently sign this phone
 * into someone else's account (login CSRF) so the pilgrim's posts and photos would land in that account.
 */
export async function completeAuthFromUrl(url: string): Promise<{ ok: boolean; error?: string }> {
  let p: URLSearchParams;
  try {
    p = new URL(url.replace('#', url.includes('?') ? '&' : '?')).searchParams;
  } catch {
    return { ok: false, error: 'This link is incomplete or has expired.' };
  }
  const err = p.get('error_description') || p.get('error');
  if (err) return { ok: false, error: err.replace(/\+/g, ' ') };
  const code = p.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
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
