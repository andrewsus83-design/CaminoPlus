// offline-pack-url: hand a CaminoPlus subscriber a short-lived download link
// for one offline pack (map tiles, data or audio) stored on Cloudflare R2.
//
// POST /functions/v1/offline-pack-url   Authorization: Bearer <user JWT>
//   body: { "pack_id": "<offline_packs.id>" }
// 200 { url, expires_at, size_bytes, sha256, version, format, kind }
// 401 not signed in · 403 { error: "subscription_required" } · 404 unknown pack
//
// Two gates, both server side:
//   1. rpc get_my_entitlements().can_download_routes   (private.has_plus)
//   2. RLS on offline_packs ("offline packs need CaminoPlus") when reading the row
// The R2 bucket itself stays private; the link is an S3 SigV4 presigned GET
// that expires after PACK_URL_TTL_SECONDS (default 15 min). A download that has
// started finishes even if the link expires mid-way; a resumed (Range) request
// after expiry needs a fresh link, so the app simply calls this function again.
//
// Secrets (supabase secrets set ...): R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
// R2_SECRET_ACCESS_KEY, R2_BUCKET. Use an R2 API token scoped to Object Read
// on that one bucket. SUPABASE_URL and SUPABASE_ANON_KEY are provided by Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { AwsClient } from 'npm:aws4fetch@1.0.20';

const TTL = Math.min(Math.max(Number(Deno.env.get('PACK_URL_TTL_SECONDS') ?? 900), 60), 3600);
const BUCKET = Deno.env.get('R2_BUCKET') ?? 'caminoplus-packs';
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

const r2 = new AwsClient({
  accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID') ?? '',
  secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY') ?? '',
  service: 's3',
  region: 'auto',
});

// "r2://bucket/key/with/slashes.pmtiles" -> presigned https URL
export async function presign(r2Url: string, ttlSeconds: number): Promise<string> {
  const m = /^r2:\/\/([^/]+)\/(.+)$/.exec(r2Url);
  if (!m || m[1] !== BUCKET) throw new Error(`pack url not in bucket ${BUCKET}`);
  const key = m[2].split('/').map(encodeURIComponent).join('/');
  const url = new URL(`https://${Deno.env.get('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com/${BUCKET}/${key}`);
  url.searchParams.set('X-Amz-Expires', String(ttlSeconds));
  const signed = await r2.sign(new Request(url, { method: 'GET' }), { aws: { signQuery: true } });
  return signed.url;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return json(401, { error: 'not_signed_in' });

  let packId: unknown;
  try {
    ({ pack_id: packId } = await req.json());
  } catch {
    return json(400, { error: 'bad_json' });
  }
  if (typeof packId !== 'string' || !UUID.test(packId)) return json(400, { error: 'pack_id_required' });

  // Act as the user, so RLS and auth.uid() apply.
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });

  const { data: user, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user?.user) return json(401, { error: 'not_signed_in' });

  // Gate 1: plan. Free = basic app, no route downloads.
  const { data: ent, error: entErr } = await supabase.rpc('get_my_entitlements');
  if (entErr) return json(500, { error: 'entitlements_unavailable' });
  if (!ent?.can_download_routes) return json(403, { error: 'subscription_required', plan: ent?.plan ?? 'free' });

  // Gate 2: RLS on offline_packs only returns rows to CaminoPlus users.
  const { data: pack, error: packErr } = await supabase
    .from('offline_packs')
    .select('id, kind, format, version, url, size_bytes, sha256, is_current')
    .eq('id', packId)
    .is('deleted_at', null)
    .maybeSingle();
  if (packErr) return json(500, { error: 'lookup_failed' });
  if (!pack) return json(404, { error: 'pack_not_found' });

  try {
    const url = await presign(pack.url, TTL);
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
    console.error('presign failed', e);
    return json(500, { error: 'presign_failed' });
  }
});
