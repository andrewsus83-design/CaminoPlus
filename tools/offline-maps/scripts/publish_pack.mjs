// Upload a built pack and register it in public.offline_packs.
//
//   node scripts/publish_pack.mjs dist/camino-frances-01-3km-z15.json \
//        [--target supabase|r2] [--version 20261104] [--stage stages/x.json] [--dry-run]
//
// --target supabase (default for now): private Storage bucket "offline-packs",
//   url 'supabase://offline-packs/<key>'.
// --target r2 (later, Cloudflare): bucket $R2_BUCKET, url 'r2://<bucket>/<key>'.
// The offline-pack-url edge function signs either kind, so moving to R2 is:
// re-publish with --target r2 (or copy the files) and the url column follows.
//
// Reads the manifest that build_stage.sh wrote next to the .pmtiles file.
//
// Key:  <route_slug>/stage-<NN>/tiles-v<version>.pmtiles   (immutable; a new build = a new key)
//
// Order of work, so a failure never leaves a stage without a usable pack:
//   1. Integrity: recompute size + sha256 of the file against the manifest.
//   2. Quality gates (scripts/lib/quality.mjs): route_source must be 'osm', size / tile count /
//      layers / OSM age inside the band of the stage file. Nothing is uploaded if one fails.
//   3. Compare with the pack that is live now (size must not jump); needs the service key.
//   4. Upload, then download it again and compare sha256 (a truncated upload is caught here).
//   5. Register with ONE call to public.register_offline_pack(...) (service_role only). The
//      database does "insert the new row as current, retire the old ones" in a single
//      transaction, so a cancelled run can never leave the stage with no current pack.
//
// Env:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  upload (target supabase), comparison and registering
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET  only for --target r2
//
// Always writes <manifest>.offline_packs.sql: a single `select public.register_offline_pack(...)`
// that can be run by hand (SQL editor, as postgres) if the API keys are not set.
import { AwsClient } from 'aws4fetch';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { checkManifest, compareWithPrevious, report } from './lib/quality.mjs';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    target: { type: 'string', default: 'supabase' },
    version: { type: 'string' },
    stage: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});
const manifestPath = positionals.find((a) => a.endsWith('.json'));
const dryRun = values['dry-run'];
const target = values.target;

const fail = (msg) => { console.error(`publish_pack: ${msg}`); process.exit(1); };
if (!['supabase', 'r2'].includes(target)) fail('--target must be supabase or r2');
if (!manifestPath) fail('usage: publish_pack.mjs <pack manifest .json> [--target supabase|r2] [--version N] [--stage stage.json] [--dry-run]');

const here = dirname(fileURLToPath(import.meta.url));
const m = JSON.parse(await readFile(manifestPath, 'utf8'));
if (typeof m.file !== 'string' || basename(m.file) !== m.file) fail('manifest "file" must be a plain file name next to the manifest');
const body = await readFile(join(dirname(manifestPath), m.file));

// 1. Integrity: recompute, never trust the manifest blindly.
const sha256 = createHash('sha256').update(body).digest('hex');
if (sha256 !== m.sha256 || body.length !== m.size_bytes) fail('pack file does not match its manifest');

// 2. Quality gates. A stage without a "quality" band cannot be published.
const stagePath = values.stage || join(here, '..', 'stages', `${m.slug}.json`);
const stage = JSON.parse(await readFile(stagePath, 'utf8'));
const gates = checkManifest(m, stage.quality, { publishing: true });
if (gates.warnings.length || gates.errors.length) console.log(report(gates));
if (gates.errors.length) fail(`${gates.errors.length} quality gate(s) failed, nothing was uploaded or registered`);

// Version = OSM data date as YYYYMMDD (fits the integer column, sorts, one per monthly build).
const version = values.version ? Number(values.version) : Number((m.osm_timestamp || new Date().toISOString()).slice(0, 10).replaceAll('-', ''));
if (!Number.isInteger(version) || version < 20200101 || version > 21001231) fail(`bad version ${values.version ?? version}: expected YYYYMMDD`);
if (!/^[a-z0-9-]+$/.test(m.route_slug) || !Number.isInteger(m.stage_number)) fail('manifest route_slug / stage_number look wrong');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!UUID.test(m.route_id) || !UUID.test(m.stage_id)) fail('manifest route_id / stage_id must be uuids');

const bucket = target === 'r2' ? (process.env.R2_BUCKET || 'caminoplus-packs') : 'offline-packs';
const key = `${m.route_slug}/stage-${String(m.stage_number).padStart(2, '0')}/tiles-v${version}.pmtiles`;
const url = `${target === 'r2' ? 'r2' : 'supabase'}://${bucket}/${key}`;

const q = (s) => `'${String(s).replaceAll("'", "''")}'`;
const sql = `-- offline_packs row for ${m.file} (generated by publish_pack.mjs)
-- One transaction inside the function: the new row becomes current, the older ones are retired.
-- Run as postgres / service_role (the function is not callable by app users).
select public.register_offline_pack(
  ${q(m.route_id)}::uuid, ${q(m.stage_id)}::uuid, 'tiles', 'pmtiles', ${version},
  ${q(url)}, ${m.size_bytes}, ${q(sha256)}
);
`;
const sqlPath = manifestPath.replace(/\.json$/, '.offline_packs.sql');
await writeFile(sqlPath, sql);
console.log(`pack ${m.file}: ${body.length} bytes, sha256 ${sha256}`);
console.log(`target ${url}`);
console.log(`wrote ${sqlPath}`);
if (dryRun) { console.log('dry run: quality gates passed, nothing uploaded'); process.exit(0); }

const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const haveSupabase = Boolean(supabaseUrl && serviceKey);
if (target === 'supabase' && !haveSupabase) fail('missing env SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');

const rest = (path, init = {}) => fetch(`${supabaseUrl}/rest/v1/${path}`, {
  ...init,
  headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
});

// 3. Compare with the live pack (service role bypasses RLS). Done BEFORE the upload.
if (haveSupabase) {
  const scope = `route_id=eq.${m.route_id}&stage_id=eq.${m.stage_id}&kind=eq.tiles&is_current=eq.true&deleted_at=is.null`;
  const r = await rest(`offline_packs?${scope}&select=version,size_bytes,sha256&order=version.desc&limit=1`);
  if (!r.ok) fail(`could not read the current pack: HTTP ${r.status} ${await r.text()}`);
  const [prev] = await r.json();
  if (prev) {
    console.log(`live pack: v${prev.version}, ${prev.size_bytes} bytes`);
    const cmp = compareWithPrevious(m, prev, stage.quality);
    if (cmp.errors.length || cmp.warnings.length) console.log(report(cmp));
    if (cmp.errors.length) fail('the new pack differs too much from the live one, nothing was uploaded or registered');
  } else console.log('live pack: none yet (first publish for this stage)');
} else console.log('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set: skipping the comparison with the live pack');

// 4. Upload, then read it back. Single request is fine: stage packs are a few MB.
const common = {
  'Content-Type': 'application/vnd.pmtiles',
  // Keys are versioned, so the object never changes: cache it forever.
  'Cache-Control': 'public, max-age=31536000, immutable',
};
const sha256Of = (buf) => createHash('sha256').update(buf).digest('hex');
let readBack;
if (target === 'supabase') {
  const up = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${key}`, {
    method: 'POST',
    body,
    headers: { ...common, 'x-upsert': 'true', apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!up.ok) fail(`Storage upload ${up.status}: ${await up.text()}`);
  console.log(`uploaded to Supabase Storage (${up.status})`);
  readBack = () => fetch(`${supabaseUrl}/storage/v1/object/authenticated/${bucket}/${key}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
} else {
  for (const k of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) {
    if (!process.env[k]) fail(`missing env ${k}`);
  }
  const r2 = new AwsClient({
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto',
  });
  const objectUrl = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${bucket}/${key}`;
  const put = await r2.fetch(objectUrl, {
    method: 'PUT',
    body,
    headers: { ...common, 'x-amz-meta-sha256': sha256, 'x-amz-meta-osm-timestamp': m.osm_timestamp || '' },
  });
  if (!put.ok) fail(`R2 PUT ${put.status}: ${await put.text()}`);
  console.log(`uploaded to R2 (${put.status})`);
  readBack = () => r2.fetch(objectUrl, { method: 'GET' });
}
const back = await readBack();
if (!back.ok) fail(`could not read the uploaded pack back: HTTP ${back.status}`);
const backBytes = Buffer.from(await back.arrayBuffer());
if (backBytes.length !== body.length || sha256Of(backBytes) !== sha256) {
  fail(`uploaded object differs from the pack (${backBytes.length} vs ${body.length} bytes): not registering it`);
}
console.log('read the object back: size and sha256 match');

// 5. Register through the database function: one transaction, service role only.
if (!haveSupabase) {
  console.log('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set: run the SQL file by hand');
  process.exit(0);
}
const reg = await rest('rpc/register_offline_pack', {
  method: 'POST',
  body: JSON.stringify({
    p_route_id: m.route_id, p_stage_id: m.stage_id, p_kind: 'tiles', p_format: 'pmtiles',
    p_version: version, p_url: url, p_size_bytes: m.size_bytes, p_sha256: sha256,
  }),
});
if (!reg.ok) {
  const text = await reg.text();
  const hint = reg.status === 404 || reg.status === 403
    ? ' (does the database have the latest migrations with public.register_offline_pack, and is this the service role key?)'
    : '';
  fail(`register_offline_pack: HTTP ${reg.status} ${text}${hint}`);
}
console.log(`registered offline_packs version ${version} as current (id ${JSON.stringify(await reg.json())})`);
