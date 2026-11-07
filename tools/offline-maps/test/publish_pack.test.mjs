// End-to-end tests of scripts/publish_pack.mjs against a mock Supabase (Storage + PostgREST).
// Run: npm test  (node --test "test/*.test.mjs")
//
// What they prove: nothing is uploaded when a quality gate fails, a bad upload is never
// registered, and registering is ONE call to the register_offline_pack function (never the old
// "retire the old rows first, insert the new one second" sequence).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROUTE_ID = '20000000-0000-0000-0000-0000000000ff';
const STAGE_ID = '40000000-0000-0000-0000-0000000000ff';

// The read-back the mock serves when it pretends the stored object was damaged. The last byte is flipped,
// so the result differs from the original whatever that byte is. (It used to be replaced with 0x00, which left a
// random pack that happens to end in 0x00 unchanged: the test failed about once in 256 runs.)
function corruptLastByte(bytes) {
  const out = Buffer.from(bytes);
  out[out.length - 1] ^= 0xff;
  return out;
}

function mockSupabase({ current = null, readBack = 'ok', rpcStatus = 200, stage = 'ok' } = {}) {
  const calls = [];
  const objects = new Map();
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    calls.push({ method: req.method, url: req.url, body, headers: req.headers });
    const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(value)); };
    if (req.method === 'GET' && req.url.startsWith('/rest/v1/stages?')) {
      const row = { id: STAGE_ID, route_id: ROUTE_ID, stage_number: 1, deleted_at: null };
      if (stage === 'missing') return json(200, []);
      if (stage === 'deleted') return json(200, [{ ...row, deleted_at: '2026-11-01T00:00:00Z' }]);
      if (stage === 'other_route') return json(200, [{ ...row, route_id: '20000000-0000-0000-0000-000000000002' }]);
      if (stage === 'other_number') return json(200, [{ ...row, stage_number: 9 }]);
      if (stage === 'error') return json(500, { message: 'boom' });
      return json(200, [row]);
    }
    if (req.method === 'GET' && req.url.startsWith('/rest/v1/offline_packs?')) return json(200, current ? [current] : []);
    if (req.method === 'POST' && req.url.startsWith('/storage/v1/object/offline-packs/')) {
      objects.set(req.url.replace('/storage/v1/object/', ''), body);
      return json(200, { Key: req.url });
    }
    if (req.method === 'GET' && req.url.startsWith('/storage/v1/object/authenticated/')) {
      const stored = objects.get(req.url.replace('/storage/v1/object/authenticated/', ''));
      if (!stored) return json(404, { error: 'not found' });
      res.writeHead(200).end(readBack === 'corrupt' ? corruptLastByte(stored) : stored);
      return undefined;
    }
    if (req.method === 'POST' && req.url === '/rest/v1/rpc/register_offline_pack') {
      return rpcStatus === 200 ? json(200, '6f0c1c1e-1111-4222-8333-444455556666') : json(rpcStatus, { message: 'Could not find the function public.register_offline_pack' });
    }
    return json(500, { error: `unexpected ${req.method} ${req.url}` });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    url: `http://127.0.0.1:${server.address().port}`, calls, server,
    close: () => new Promise((r) => server.close(r)),
  })));
}

// A fake pack on disk with its manifest and a stage file whose band fits the fake.
async function fixture(manifestPatch = {}, qualityPatch = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'publish-test-'));
  const bytes = randomBytes(3000);
  await writeFile(join(dir, 'pack.pmtiles'), bytes);
  const day = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const manifest = {
    file: 'pack.pmtiles', slug: 'mini-test', route_id: ROUTE_ID, stage_id: STAGE_ID, route_slug: 'mini-test', stage_number: 1,
    kind: 'tiles', format: 'pmtiles', size_bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
    maxzoom: 15, pack_max_zoom: 15, route_source: 'osm', osm_timestamp: day, tiles: 21,
    layers: ['building', 'place', 'poi', 'transportation', 'transportation_name'], ...manifestPatch,
  };
  const stage = {
    slug: 'mini-test',
    quality: { min_tiles: 10, max_tiles: 40, min_size_mb: 0.001, max_size_mb: 1, required_layers: ['place', 'poi'], max_change_ratio: 1.5, ...qualityPatch },
  };
  await writeFile(join(dir, 'pack.json'), JSON.stringify(manifest));
  await writeFile(join(dir, 'stage.json'), JSON.stringify(stage));
  return { dir, manifest, manifestPath: join(dir, 'pack.json'), stagePath: join(dir, 'stage.json'), bytes, version: Number(day.slice(0, 10).replaceAll('-', '')) };
}

function publish(f, mock, extra = []) {
  const env = { PATH: process.env.PATH, HOME: process.env.HOME };
  if (mock) Object.assign(env, { SUPABASE_URL: mock.url, SUPABASE_SERVICE_ROLE_KEY: 'test-service-key' });
  const child = spawn(process.execPath, ['scripts/publish_pack.mjs', f.manifestPath, '--stage', f.stagePath, ...extra], { cwd: root, env });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  return new Promise((resolve) => child.on('close', (code) => resolve({ code, out })));
}

test('happy path: stage row, gates, comparison, upload, read-back, then ONE register call', async () => {
  const mock = await mockSupabase({ current: { version: 20261003, size_bytes: 3100, sha256: 'old' } });
  const f = await fixture();
  const r = await publish(f, mock);
  await mock.close();
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(mock.calls.map((c) => `${c.method} ${c.url.split('?')[0]}`), [
    'GET /rest/v1/stages',
    'GET /rest/v1/offline_packs',
    `POST /storage/v1/object/offline-packs/mini-test/stage-01/tiles-v${f.version}.pmtiles`,
    `GET /storage/v1/object/authenticated/offline-packs/mini-test/stage-01/tiles-v${f.version}.pmtiles`,
    'POST /rest/v1/rpc/register_offline_pack',
  ]);
  const rpc = JSON.parse(mock.calls[4].body.toString());
  assert.deepEqual(rpc, {
    p_route_id: ROUTE_ID, p_stage_id: STAGE_ID, p_kind: 'tiles', p_format: 'pmtiles', p_version: f.version,
    p_url: `supabase://offline-packs/mini-test/stage-01/tiles-v${f.version}.pmtiles`,
    p_size_bytes: f.bytes.length, p_sha256: f.manifest.sha256,
  });
  assert.equal(mock.calls[4].headers.authorization, 'Bearer test-service-key');
  assert.ok(!mock.calls.some((c) => c.method === 'PATCH' || c.method === 'DELETE'), 'must not retire rows by hand');
});

test('the SQL fallback is a single register_offline_pack call', async () => {
  const f = await fixture();
  const r = await publish(f, null, ['--dry-run']);
  assert.equal(r.code, 0, r.out);
  const sql = await readFile(f.manifestPath.replace(/\.json$/, '.offline_packs.sql'), 'utf8');
  const statements = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').split(';').filter((s) => s.trim());
  assert.equal(statements.length, 1, sql);
  assert.match(statements[0], /^\s*select public\.register_offline_pack\(\s*'20000000-0000-0000-0000-0000000000ff'::uuid, '40000000-0000-0000-0000-0000000000ff'::uuid, 'tiles', 'pmtiles', \d{8},/);
  assert.doesNotMatch(sql, /\bupdate\b|\binsert\b/i);
});

test('a fallback route is refused before anything touches the network', async () => {
  const mock = await mockSupabase();
  const f = await fixture({ route_source: 'fallback' });
  const r = await publish(f, mock);
  await mock.close();
  assert.equal(r.code, 1);
  assert.match(r.out, /route_source is 'fallback', not 'osm'/);
  assert.equal(mock.calls.length, 0);
});

test('a dry run enforces the gates too', async () => {
  const f = await fixture({ tiles: 3 });
  const r = await publish(f, null, ['--dry-run']);
  assert.equal(r.code, 1);
  assert.match(r.out, /3 tiles, below the minimum of 10/);
});

test('a pack that jumped in size against the live one is refused before the upload', async () => {
  const mock = await mockSupabase({ current: { version: 20261003, size_bytes: 600, sha256: 'old' } });
  const f = await fixture();
  const r = await publish(f, mock);
  await mock.close();
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /Pack size changed 5\.00x against the published pack v20261003/);
  assert.deepEqual(mock.calls.map((c) => c.method), ['GET', 'GET'], 'the stage row and the live pack are read, nothing is written');
});

test('the damaged read-back differs from the stored bytes for every possible last byte', () => {
  for (let last = 0; last < 256; last += 1) {
    const stored = Buffer.from([1, 2, 3, last]);
    assert.notDeepEqual(corruptLastByte(stored), stored, `last byte ${last}`);
    assert.deepEqual(stored, Buffer.from([1, 2, 3, last]), 'the stored buffer itself is not modified');
  }
});

test('an upload that does not read back identical is never registered', async () => {
  const mock = await mockSupabase({ readBack: 'corrupt' });
  const f = await fixture();
  const r = await publish(f, mock);
  await mock.close();
  assert.equal(r.code, 1);
  assert.match(r.out, /uploaded object differs from the pack/);
  assert.ok(!mock.calls.some((c) => c.url.includes('/rpc/')), 'register must not be called');
});

test('a missing register_offline_pack function gives a hint, not a stack trace', async () => {
  const mock = await mockSupabase({ rpcStatus: 404 });
  const f = await fixture();
  const r = await publish(f, mock);
  await mock.close();
  assert.equal(r.code, 1);
  assert.match(r.out, /register_offline_pack: HTTP 404/);
  assert.match(r.out, /latest migrations/);
});

test('a pack file that does not match its manifest is refused', async () => {
  const f = await fixture({ sha256: 'f'.repeat(64) });
  const r = await publish(f, null, ['--dry-run']);
  assert.equal(r.code, 1);
  assert.match(r.out, /does not match its manifest/);
});

test('bad version argument is rejected', async () => {
  const f = await fixture();
  const r = await publish(f, null, ['--dry-run', '--version', '2026-11-04']);
  assert.equal(r.code, 1);
  assert.match(r.out, /bad version/);
});

test('a manifest with a path in "file" or ids that are not uuids is refused', async () => {
  const f1 = await fixture({ file: '../pack.pmtiles' });
  const r1 = await publish(f1, null, ['--dry-run']);
  assert.equal(r1.code, 1);
  assert.match(r1.out, /plain file name/);
  const f2 = await fixture({ stage_id: "x'; drop table offline_packs; --" });
  const r2 = await publish(f2, null, ['--dry-run']);
  assert.equal(r2.code, 1);
  assert.match(r2.out, /must be uuids/);
});

// A pack for a stage that is not in the database can never be registered, so it must not be uploaded either (it would
// be an orphan file in Storage). Only 3 of the 33 Camino Francés stages have a row today.
for (const [stage, pattern] of [
  ['missing', /is not in the database, so a pack cannot be registered for it/],
  ['deleted', /is not in the database \(it is deleted\)/],
  ['other_route', /belongs to route 20000000-0000-0000-0000-000000000002/],
  ['other_number', /says this is stage number 9, the pack says 1/],
]) {
  test(`a stage row that is ${stage.replace('_', ' ')} is refused before anything is uploaded`, async () => {
    const mock = await mockSupabase({ stage });
    const f = await fixture();
    const r = await publish(f, mock);
    await mock.close();
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, pattern);
    assert.match(r.out, /Nothing was uploaded/);
    assert.deepEqual(mock.calls.map((c) => `${c.method} ${c.url.split('?')[0]}`), ['GET /rest/v1/stages'], 'no pack lookup, no upload, no register');
  });
}

test('a stage row that cannot be read stops the publish too', async () => {
  const mock = await mockSupabase({ stage: 'error' });
  const f = await fixture();
  const r = await publish(f, mock);
  await mock.close();
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /could not read the stage row: HTTP 500/);
  assert.ok(!mock.calls.some((c) => c.method === 'POST'), 'nothing is uploaded or registered');
});
