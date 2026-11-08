// delete-account: permanently delete the signed-in pilgrim's account and everything in it
// (App Store 5.1.1(v) and Google Play require this inside the app).
//
// POST /functions/v1/delete-account   Authorization: Bearer <user JWT>
//   body: { "confirm": "DELETE" }
// 200 { ok: true }
// 400 bad_confirm (no JSON, or confirm is not exactly "DELETE")
// 401 not_signed_in · 405 method_not_allowed
// 500 auth_unavailable | lookup_failed | delete_failed
//
// What happens, in this order:
//   1. The token is checked with Auth. The user id comes from the token, never from the body.
//   2. The pilgrim's files are removed from Storage: user-media/<uid>/... and avatars/<uid>/...
//      plus business-docs/<business_id>/... and business-media/<business_id>/... of every business
//      that has no owner or manager left once this pilgrim is gone (the database closes exactly
//      those businesses, see the platform hardening migration). Businesses that live on keep their files.
//      This step is best effort: a failure is logged and does not stop the deletion.
//   3. Sign in with Apple (App Store 5.1.1(v)): when the Apple secrets are set and apple-link stored a refresh token
//      for this pilgrim, it is revoked at Apple. Best effort like the files: a failure is logged (never the token) and
//      the account is still deleted. Without the secrets this step does nothing at all.
//   4. auth.admin.deleteUser(uid). The profile and everything that references it is removed by the
//      database (ON DELETE CASCADE / SET NULL; no foreign key blocks it; the stored Apple token goes with it).
// Files go first and the user last: if the last step fails the pilgrim just tries again, whereas the
// files of an account that is already gone could never be found again.
//
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are provided by Supabase. The optional Apple
// secrets (APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY, APPLE_BUNDLE_ID) are described in ../_shared/apple.ts.
// DELETE_ACCOUNT_STORAGE_BUDGET_MS (default 90000) caps the time spent on files so the user is always
// deleted before the function times out.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { AppleError, appleConfig, revokeToken } from '../_shared/apple.ts';

const USER_BUCKETS = ['user-media', 'avatars'];
const BUSINESS_BUCKETS = ['business-docs', 'business-media'];
const PAGE = 100; // Storage list / remove page size
const MAX_DEPTH = 8; // folders inside folders

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const message = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e));

// Auth said "no" (bad, expired or unknown token) or could not answer at all (network error, 5xx, rate limit).
function authIsDown(err: { name?: string; status?: number }): boolean {
  const status = typeof err.status === 'number' ? err.status : 0;
  return err.name === 'AuthRetryableFetchError' || status === 0 || status === 429 || status >= 500;
}

// Every file under bucket/prefix, folders included (Storage lists one level at a time; folders have id null).
async function listFiles(admin: SupabaseClient, bucket: string, prefix: string, deadline: number, depth = 0): Promise<string[]> {
  const files: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    if (Date.now() > deadline) throw new Error('time budget for files used up');
    const { data, error } = await admin.storage.from(bucket).list(prefix, {
      limit: PAGE,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw error;
    const entries = data ?? [];
    for (const entry of entries) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id === null) {
        if (depth < MAX_DEPTH) files.push(...(await listFiles(admin, bucket, path, deadline, depth + 1)));
      } else {
        files.push(path);
      }
    }
    if (entries.length < PAGE) break;
  }
  return files;
}

// Best effort: never throws. `folder` is a user id or a business id (a uuid), so nothing else is touched.
async function removeFolder(admin: SupabaseClient, bucket: string, folder: string, deadline: number): Promise<void> {
  let files: string[];
  try {
    files = await listFiles(admin, bucket, folder, deadline);
  } catch (e) {
    console.error(`delete-account: could not list ${bucket}:`, message(e));
    return;
  }
  for (let i = 0; i < files.length; i += PAGE) {
    try {
      if (Date.now() > deadline) throw new Error('time budget for files used up');
      const { error } = await admin.storage.from(bucket).remove(files.slice(i, i + PAGE));
      if (error) throw error;
    } catch (e) {
      console.error(`delete-account: could not remove files from ${bucket}:`, message(e));
    }
  }
}

// Businesses where nobody who can manage them is left once `uid` is gone. Same rule as the database
// trigger: another owner keeps a business open, so does a manager (who is promoted to owner).
async function businessesLeftWithoutTeam(admin: SupabaseClient, uid: string): Promise<string[]> {
  const mine = await admin.from('business_members').select('business_id').eq('user_id', uid);
  if (mine.error) throw mine.error;
  const ids = [...new Set((mine.data ?? []).map((r: { business_id: string }) => r.business_id))];
  if (ids.length === 0) return [];
  const others = await admin
    .from('business_members')
    .select('business_id')
    .in('business_id', ids)
    .neq('user_id', uid)
    .in('role', ['owner', 'manager']);
  if (others.error) throw others.error;
  const kept = new Set((others.data ?? []).map((r: { business_id: string }) => r.business_id));
  return ids.filter((id) => !kept.has(id));
}

// Revoke the pilgrim's Sign in with Apple token, if there is one. Never throws; logs only a reason, never the token.
async function revokeAtApple(admin: SupabaseClient, uid: string): Promise<void> {
  const cfg = appleConfig();
  if (!cfg) return; // not configured: nothing was ever stored either
  try {
    const { data, error } = await admin.from('apple_sign_in_tokens').select('refresh_token').eq('user_id', uid).maybeSingle();
    if (error) throw error;
    const token = (data as { refresh_token?: unknown } | null)?.refresh_token;
    if (typeof token !== 'string' || !token) return; // not an Apple account, or signed in before apple-link worked
    await revokeToken(cfg, token);
  } catch (e) {
    console.error('delete-account: Apple revoke failed:', e instanceof AppleError ? e.reason : message(e));
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return json(401, { error: 'not_signed_in' });
  const token = auth.slice('Bearer '.length).trim();
  if (!token) return json(401, { error: 'not_signed_in' });

  // Deleting an account is not something to do by accident: the body must say so, exactly.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'bad_confirm' });
  }
  if ((body as { confirm?: unknown } | null)?.confirm !== 'DELETE') return json(400, { error: 'bad_confirm' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const options = { auth: { persistSession: false, autoRefreshToken: false } };

  // 1. who is asking
  let uid: string;
  try {
    const { data, error } = await createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, options).auth.getUser(token);
    if (error) return authIsDown(error) ? json(500, { error: 'auth_unavailable' }) : json(401, { error: 'not_signed_in' });
    if (!data?.user) return json(401, { error: 'not_signed_in' });
    uid = data.user.id;
  } catch (e) {
    console.error('delete-account: auth check failed:', message(e));
    return json(500, { error: 'auth_unavailable' });
  }

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, options);
  const budget = Number(Deno.env.get('DELETE_ACCOUNT_STORAGE_BUDGET_MS') ?? 90_000);
  const deadline = Date.now() + (Number.isFinite(budget) ? budget : 90_000);

  // Which businesses go with this pilgrim. Asked before anything is deleted: if the database cannot
  // answer, nothing is touched and the pilgrim can try again. (Someone being added to one of these
  // businesses in the next few seconds is the one race left; it would need an owner to invite
  // somebody at the very moment the last owner deletes the account.)
  let closing: string[];
  try {
    closing = await businessesLeftWithoutTeam(admin, uid);
  } catch (e) {
    console.error('delete-account: business lookup failed:', message(e));
    return json(500, { error: 'lookup_failed' });
  }

  // 2. files (best effort)
  for (const bucket of USER_BUCKETS) await removeFolder(admin, bucket, uid, deadline);
  for (const businessId of closing) {
    for (const bucket of BUSINESS_BUCKETS) await removeFolder(admin, bucket, businessId, deadline);
  }

  // 3. Sign in with Apple (best effort)
  await revokeAtApple(admin, uid);

  // 4. the account. A second request that finds the user already gone (Auth answers 404) is a success too.
  try {
    const { error } = await admin.auth.admin.deleteUser(uid);
    if (error && error.status !== 404) throw error;
  } catch (e) {
    console.error('delete-account: deleteUser failed:', message(e));
    return json(500, { error: 'delete_failed' });
  }
  return json(200, { ok: true });
});
