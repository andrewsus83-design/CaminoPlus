// apple-link: right after a pilgrim signs in with Apple, the app sends Apple's one-time authorization code here. The code
// is exchanged with Apple for a refresh token, which is kept where no app can read it (public.apple_sign_in_tokens: RLS on
// and no policy, so only the service role reaches it). delete-account revokes that token at Apple before it deletes the
// account (App Store 5.1.1(v)). mobile/docs/APPLE-SIGN-IN.md explains the setup.
//
// POST /functions/v1/apple-link   Authorization: Bearer <user JWT>
//   body: { "authorizationCode": "<one-time code from Apple>" }
// 200 { ok: true }
// 400 bad_request (no JSON, no code) | not_apple_account (this account has no Apple identity)
// 401 not_signed_in · 403 apple_mismatch (the code belongs to another Apple account) · 405 method_not_allowed
// 429 too_soon (this pilgrim's token was stored less than 20 seconds ago; Apple is not asked)
// 502 apple_refused (Apple said no: an old or reused code, a wrong key ...) · 500 auth_unavailable | store_failed
// 503 not_configured (one of the Apple secrets is missing)
//
// Tokens are never left behind at Apple without a row here: a token that replaces an older one revokes the older one, and a
// token that cannot be stored is revoked at once (both best effort).
// The app calls this and ignores the answer: sign-in has already worked. Nothing here logs a token or a code.
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (from Supabase) and the Apple secrets of ../_shared/apple.ts.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { AppleError, appleConfig, exchangeCode, revokeToken } from '../_shared/apple.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const message = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e));

function authIsDown(err: { name?: string; status?: number }): boolean {
  const status = typeof err.status === 'number' ? err.status : 0;
  return err.name === 'AuthRetryableFetchError' || status === 0 || status === 429 || status >= 500;
}

const MIN_INTERVAL_MS = 20_000; // one stored token per pilgrim per 20 seconds

type Identity = { provider?: string; id?: string; identity_data?: { sub?: unknown } };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const auth = req.headers.get('Authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
  if (!token) return json(401, { error: 'not_signed_in' });

  let code: unknown;
  try {
    code = ((await req.json()) as { authorizationCode?: unknown } | null)?.authorizationCode;
  } catch {
    return json(400, { error: 'bad_request' });
  }
  if (typeof code !== 'string' || code.length < 10 || code.length > 4096) return json(400, { error: 'bad_request' });

  const cfg = appleConfig();
  if (!cfg) return json(503, { error: 'not_configured' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const options = { auth: { persistSession: false, autoRefreshToken: false } };

  // who is asking, and which Apple account is theirs (the user id comes from the token, never from the body)
  let uid: string;
  let appleSub: string | null;
  try {
    const { data, error } = await createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, options).auth.getUser(token);
    if (error) return authIsDown(error) ? json(500, { error: 'auth_unavailable' }) : json(401, { error: 'not_signed_in' });
    if (!data?.user) return json(401, { error: 'not_signed_in' });
    uid = data.user.id;
    const apple = ((data.user.identities ?? []) as Identity[]).find((i) => i.provider === 'apple');
    const sub = apple?.identity_data?.sub ?? apple?.id;
    appleSub = typeof sub === 'string' && sub ? sub : null;
  } catch (e) {
    console.error('apple-link: auth check failed:', message(e));
    return json(500, { error: 'auth_unavailable' });
  }
  if (!appleSub) return json(400, { error: 'not_apple_account' });

  // What is stored already: the token a new one replaces, and when (a cheap limit, no table of its own).
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, options);
  const before = await admin.from('apple_sign_in_tokens').select('refresh_token, updated_at').eq('user_id', uid).maybeSingle();
  if (before.error) {
    console.error('apple-link: could not read the stored token:', before.error.code ?? 'error');
    return json(500, { error: 'store_failed' }); // Apple not asked yet: no token is left behind
  }
  const old = before.data as { refresh_token?: string; updated_at?: string } | null;
  const lastAt = old?.updated_at ? Date.parse(old.updated_at) : NaN;
  if (Number.isFinite(lastAt) && Date.now() - lastAt < MIN_INTERVAL_MS) return json(429, { error: 'too_soon' });

  let refreshToken: string;
  try {
    const got = await exchangeCode(cfg, code);
    if (got.sub !== appleSub) {
      // A code from somebody else's Apple sign-in: give the token straight back to Apple and keep nothing.
      await revokeToken(cfg, got.refreshToken).catch(() => undefined);
      return json(403, { error: 'apple_mismatch' });
    }
    refreshToken = got.refreshToken;
  } catch (e) {
    console.error('apple-link: code exchange failed:', e instanceof AppleError ? e.reason : 'error');
    return json(502, { error: 'apple_refused' });
  }

  const { error } = await admin
    .from('apple_sign_in_tokens')
    .upsert({ user_id: uid, apple_sub: appleSub, refresh_token: refreshToken, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) {
    console.error('apple-link: could not store the token:', error.code ?? 'error');
    await revokeToken(cfg, refreshToken).catch(() => undefined); // nobody could revoke it later
    return json(500, { error: 'store_failed' });
  }
  if (old?.refresh_token && old.refresh_token !== refreshToken) {
    // The older token of this pilgrim is not stored anywhere any more: revoke it now (best effort).
    await revokeToken(cfg, old.refresh_token).catch((e) => console.error('apple-link: could not revoke the replaced token:', e instanceof AppleError ? e.reason : 'error'));
  }
  return json(200, { ok: true });
});
