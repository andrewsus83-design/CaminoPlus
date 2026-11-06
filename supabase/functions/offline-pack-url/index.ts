// offline-pack-url: hand a Pilgrim Plus subscriber a short-lived download link
// for one offline pack (map tiles, data or audio).
//
// Where the file lives is read from offline_packs.url:
//   supabase://offline-packs/<key>  private Supabase Storage bucket (now)
//   r2://<bucket>/<key>             private Cloudflare R2 bucket (later)
// Moving to R2 = upload the files there and update the url column; the app and
// this function's contract do not change.
//
// POST /functions/v1/offline-pack-url   Authorization: Bearer <user JWT>
//   body: { "pack_id": "<offline_packs.id>" }
// 200 { url, expires_at, size_bytes, sha256, version, format, kind, is_current }
// 400 bad_json | pack_id_required · 401 not_signed_in · 403 subscription_required (+ plan)
// 404 pack_not_found · 405 method_not_allowed
// 500 entitlements_unavailable | lookup_failed | sign_failed
// 503 auth_unavailable (Auth itself is down: retry later, the token may be fine)
//     storage_not_configured (r2:// pack but the R2 secrets are not set)
//
// Two gates, both server side:
//   1. rpc get_my_entitlements().can_download_routes   (private.has_plus)
//   2. RLS on offline_packs ("offline packs need Pilgrim Plus") when reading the row
// Buckets stay private; the link is a signed GET (Storage signed URL or R2
// SigV4 presign) that expires after PACK_URL_TTL_SECONDS (default 15 min, clamped to
// 1 min .. 1 hour). A download that has started finishes even if the link expires
// mid-way; a resumed (Range) request after expiry needs a fresh link, so the app
// simply calls this function again.
//
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are provided by
// Supabase. Only for r2:// packs: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
// R2_SECRET_ACCESS_KEY, R2_BUCKET (an R2 token with Object Read on that bucket).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { AwsClient } from 'npm:aws4fetch@1.0.20';

// Link lifetime in whole seconds: 900 when unset or not a number, never below 60 or above 3600.
export function clampTtl(raw: string | undefined): number {
  const n = raw === undefined || raw.trim() === '' ? NaN : Number(raw);
  const seconds = Number.isFinite(n) ? Math.floor(n) : 900;
  return Math.min(Math.max(seconds, 60), 3600);
}

const TTL = clampTtl(Deno.env.get('PACK_URL_TTL_SECONDS'));
const BUCKET = Deno.env.get('R2_BUCKET') ?? 'caminoplus-packs';
const STORAGE_BUCKET = 'offline-packs';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

class StorageNotConfigured extends Error {}

const r2 = new AwsClient({
  accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID') ?? '',
  secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY') ?? '',
  service: 's3',
  region: 'auto',
});

// One path segment per "/" of the key, percent-encoded the way S3 / R2 and Storage expect
// (RFC 3986: ! ' ( ) * are encoded too). Empty, "." and ".." segments are refused: a URL parser
// would fold them and sign a different object than the one the row names.
export function encodeKey(key: string): string {
  return key
    .split('/')
    .map((seg) => {
      if (seg === '' || seg === '.' || seg === '..') throw new Error('pack key has an empty or dot segment');
      return encodeURIComponent(seg).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
    })
    .join('/');
}

// "r2://bucket/key/with/slashes.pmtiles" -> presigned https URL
export async function presignR2(r2Url: string, ttlSeconds: number): Promise<string> {
  if (!Deno.env.get('R2_ACCOUNT_ID') || !Deno.env.get('R2_ACCESS_KEY_ID') || !Deno.env.get('R2_SECRET_ACCESS_KEY')) {
    throw new StorageNotConfigured('R2 secrets are not set');
  }
  const m = /^r2:\/\/([^/]+)\/(.+)$/.exec(r2Url);
  if (!m || m[1] !== BUCKET) throw new Error(`pack url not in bucket ${BUCKET}`);
  const url = new URL(`https://${Deno.env.get('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com/${BUCKET}/${encodeKey(m[2])}`);
  url.searchParams.set('X-Amz-Expires', String(ttlSeconds));
  const signed = await r2.sign(new Request(url, { method: 'GET' }), { aws: { signQuery: true } });
  return signed.url;
}

// "supabase://offline-packs/camino-frances/stage-01/tiles-v20261103.pmtiles"
// -> Storage signed URL (service role; the plan was checked before this).
async function signSupabase(url: string, ttlSeconds: number): Promise<string> {
  const m = /^supabase:\/\/([^/]+)\/(.+)$/.exec(url);
  if (!m || m[1] !== STORAGE_BUCKET) throw new Error(`pack url not in bucket ${STORAGE_BUCKET}`);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // storage-js puts the path into the request URL as it is, so a "#", "?" or "%" in a key must be encoded here
  const { data, error } = await admin.storage.from(STORAGE_BUCKET).createSignedUrl(encodeKey(m[2]), ttlSeconds);
  if (error || !data?.signedUrl) throw new Error(`storage sign failed: ${error?.message ?? 'no url'}`);
  return data.signedUrl;
}

export function signedDownloadUrl(packUrl: string, ttlSeconds: number): Promise<string> {
  if (packUrl.startsWith('supabase://')) return signSupabase(packUrl, ttlSeconds);
  if (packUrl.startsWith('r2://')) return presignR2(packUrl, ttlSeconds);
  return Promise.reject(new Error('unknown pack storage'));
}

// Auth said "no" (bad, expired or unknown token) or could not answer at all (network error, 5xx,
// rate limit). The first is the pilgrim's problem (401), the second ours (503).
function authIsDown(err: { name?: string; status?: number }): boolean {
  const status = typeof err.status === 'number' ? err.status : 0;
  return err.name === 'AuthRetryableFetchError' || status === 0 || status === 429 || status >= 500;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return json(401, { error: 'not_signed_in' });
  const token = auth.slice('Bearer '.length).trim();
  if (!token) return json(401, { error: 'not_signed_in' });

  let packId: unknown;
  try {
    ({ pack_id: packId } = await req.json());
  } catch {
    return json(400, { error: 'bad_json' });
  }
  if (typeof packId !== 'string' || !UUID.test(packId)) return json(400, { error: 'pack_id_required' });

  // Act as the user, so RLS and auth.uid() apply to the calls below.
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Ask Auth about THIS token (not about whatever session or header the client happens to hold).
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error) return authIsDown(error) ? json(503, { error: 'auth_unavailable' }) : json(401, { error: 'not_signed_in' });
    if (!data?.user) return json(401, { error: 'not_signed_in' });
  } catch (e) {
    console.error('auth check failed', e);
    return json(503, { error: 'auth_unavailable' });
  }

  // Gate 1: plan. Free = basic app, no route downloads.
  const { data: ent, error: entErr } = await supabase.rpc('get_my_entitlements');
  if (entErr) return json(500, { error: 'entitlements_unavailable' });
  if (!ent?.can_download_routes) return json(403, { error: 'subscription_required', plan: ent?.plan ?? 'free' });

  // Gate 2: RLS on offline_packs only returns rows to Pilgrim Plus users.
  const { data: pack, error: packErr } = await supabase
    .from('offline_packs')
    .select('id, kind, format, version, url, size_bytes, sha256, is_current')
    .eq('id', packId)
    .is('deleted_at', null)
    .maybeSingle();
  if (packErr) return json(500, { error: 'lookup_failed' });
  if (!pack) return json(404, { error: 'pack_not_found' });

  try {
    const url = await signedDownloadUrl(pack.url, TTL);
    return json(200, {
      url,
      expires_at: new Date(Date.now() + TTL * 1000).toISOString(),
      size_bytes: pack.size_bytes,
      sha256: pack.sha256, // the app verifies the file before swapping it in
      version: pack.version,
      format: pack.format,
      kind: pack.kind,
      is_current: pack.is_current,
    });
  } catch (e) {
    if (e instanceof StorageNotConfigured) return json(503, { error: 'storage_not_configured' });
    console.error('signing failed', e);
    return json(500, { error: 'sign_failed' });
  }
});
