// Proves a stage pack renders with no internet, and that it holds what the map style needs.
//
//   node test/render_offline.mjs dist/camino-frances-01-3km-z15.pmtiles \
//        [--stage stages/camino-frances-01.json] \
//        [--route dist/x.route.geojson] [--corridor dist/x.corridor.geojson] \
//        [--at -1.3195,43.0094,15] [--allow-error <regex>] [--out dist/render]
//
// Check 1 (no outside requests): every request that is not to the local viewer
//   server is aborted and counted. The map must render and the count must be 0.
// Check 2 (device offline): the browser is switched offline (navigator.onLine =
//   false, all network refused, localhost too), then the pack is opened from disk
//   through the file picker, the way the app reads a downloaded pack. Map label
//   glyphs come from files on disk instead of the network, like the glyphs bundled in the app.
//   Labels (place names, POI names) must still be drawn, otherwise a missing glyph range
//   would ship as a map with no text.
// --stage reads "render_checks" (and an optional "render_allow_errors") from the stage file: views to visit, and for each the minimum
//   number of rendered features per source layer ("min_features") and per style layer
//   ("min_labels", the symbol layers that draw text). Both checks run with every view.
// Fails (exit 1) on: a request that left the device, nothing rendered, the browser not offline,
//   any console / page / map error ("errors" must be empty), a view below its minimums.
// Writes screenshots and a JSON report.
import { chromium } from 'playwright';
import { mkdir, writeFile, stat, readFile } from 'node:fs/promises';
import { resolve, relative, join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { serve } from '../scripts/serve.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    stage: { type: 'string' }, route: { type: 'string' }, corridor: { type: 'string' }, out: { type: 'string' },
    at: { type: 'string', multiple: true, default: [] }, 'allow-error': { type: 'string', multiple: true, default: [] },
  },
});
if (!positionals[0]) {
  console.error('usage: render_offline.mjs <pack.pmtiles> [--stage f] [--route f] [--corridor f] [--at lon,lat,zoom]... [--allow-error regex]...');
  process.exit(1);
}
const pack = resolve(positionals[0]);
const outDir = resolve(values.out || join(root, 'dist', 'render'));
const rel = (p) => {
  if (!p) return undefined;
  const r = relative(root, resolve(p));
  // The viewer server only serves tools/offline-maps (dist/ is the usual place for packs).
  if (r.startsWith('..')) { console.error(`${p} is outside tools/offline-maps: copy it into dist/ first`); process.exit(1); }
  return '/' + r;
};

// Views: the stage file's render_checks, then any --at given on the command line (no minimums).
const stage = values.stage ? JSON.parse(await readFile(values.stage, 'utf8')) : {};
// Console / map messages that are known to be harmless can be listed (regexes) in the stage file
// ("render_allow_errors") or with --allow-error. Keep the list empty unless a real build proves it needs one.
const allowed = [...(stage.render_allow_errors || []), ...values['allow-error']].map((r) => new RegExp(r));
const views = [
  ...(stage.render_checks || []).map((c) => ({ name: c.name || c.at.join(','), at: c.at, min_features: c.min_features || {}, min_labels: c.min_labels || {} })),
  ...values.at.map((a) => { const at = a.split(',').map(Number); return { name: a, at, min_features: {}, min_labels: {} }; }),
];
for (const v of views) {
  if (!Array.isArray(v.at) || v.at.length < 2 || v.at.some((n) => !Number.isFinite(n))) { console.error(`bad view: ${JSON.stringify(v.at)}`); process.exit(1); }
}
await mkdir(outDir, { recursive: true });

const server = await serve(0);
const origin = `http://127.0.0.1:${server.address().port}`;
const qs = new URLSearchParams({ pack: rel(pack) });
if (values.route) qs.set('route', rel(values.route));
if (values.corridor) qs.set('corridor', rel(values.corridor));

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 900, height: 1100 }, deviceScaleFactor: 1 });
const blocked = [];
await context.route('**/*', (route) => {
  const url = route.request().url();
  if (url.startsWith(origin) || url.startsWith('blob:') || url.startsWith('data:')) return route.continue();
  blocked.push(url);
  return route.abort('internetdisconnected');
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
// Which request failed (the console message alone does not say).
const failedRequests = [];
page.on('requestfailed', (r) => { if (!blocked.includes(r.url())) failedRequests.push(`${r.url()} (${r.failure()?.errorText})`); });
page.on('response', (r) => { if (r.status() >= 400) failedRequests.push(`${r.url()} (HTTP ${r.status()})`); });

async function settle() {
  await page.waitForFunction(() => window.__map && window.__map.loaded() && window.__map.areTilesLoaded(), null, { timeout: 60000 });
  // Labels are placed a few frames after the tiles load and then fade in: wait for MapLibre's "idle"
  // (nothing loading, no transition running) so counts and screenshots show the finished map.
  await page.evaluate(() => new Promise((resolve) => {
    const map = window.__map;
    const timer = setTimeout(resolve, 8000);
    map.once('idle', () => { clearTimeout(timer); resolve(); });
    map.triggerRepaint();
  }));
  await page.waitForTimeout(300);
}
// Rendered features per source layer ("poi") and per style layer ("poi-name": the text of the POIs).
const counts = () => page.evaluate(() => {
  const bySource = {};
  const byLayer = {};
  for (const f of window.__map.queryRenderedFeatures()) {
    const k = f.sourceLayer || f.source;
    bySource[k] = (bySource[k] || 0) + 1;
    byLayer[f.layer.id] = (byLayer[f.layer.id] || 0) + 1;
  }
  return { bySource, byLayer };
});
const total = (c) => Object.values(c).reduce((a, b) => a + b, 0);
const failures = [];

// A view fails when a source layer or label layer has fewer rendered features than the stage file says.
function expect(phase, view, got) {
  for (const [layer, min] of Object.entries(view.min_features)) {
    const n = got.bySource[layer] || 0;
    if (n < min) failures.push(`${phase}, view "${view.name}": ${n} rendered features in source layer "${layer}", expected at least ${min}`);
  }
  for (const [layer, min] of Object.entries(view.min_labels)) {
    const n = got.byLayer[layer] || 0;
    if (n < min) failures.push(`${phase}, view "${view.name}": ${n} labels drawn by style layer "${layer}", expected at least ${min} (glyphs missing?)`);
  }
}
async function visit(phase, tag) {
  const out = [];
  for (const [i, view] of [{ name: 'overview', at: null, min_features: {}, min_labels: {} }, ...views].entries()) {
    if (view.at) { await page.evaluate(([lon, lat, z]) => window.__map.jumpTo({ center: [lon, lat], zoom: z ?? 15 }), view.at); await settle(); }
    const shot = join(outDir, `${basename(pack, '.pmtiles')}-${tag}${i === 0 ? 'overview' : `view${i}`}.png`);
    await page.screenshot({ path: shot });
    const got = await counts();
    expect(phase, view, got);
    out.push({ name: view.name, at: view.at || 'fit', zoom: await page.evaluate(() => window.__map.getZoom()), features: got.bySource, layers: got.byLayer, screenshot: relative(root, shot) });
  }
  return out;
}

const report = { pack: basename(pack), size_bytes: (await stat(pack)).size, views: [] };

// Check 1 -------------------------------------------------------------------
await page.goto(`${origin}/viewer/?${qs}`);
await settle();
report.header = await page.evaluate(() => ({ minZoom: window.__header.minZoom, maxZoom: window.__header.maxZoom, tiles: window.__header.numAddressedTiles }));
report.views = await visit('with the outside network blocked', '');
report.blocked_requests = blocked;
const mapErrors = await page.evaluate(() => window.__mapErrors || []);

// Check 2 -------------------------------------------------------------------
await context.setOffline(true);
// The app has its glyphs on the device; serve ours from disk, not through the (now dead) network.
await context.route(/\/viewer\/glyphs\//, async (route) => {
  const path = decodeURIComponent(new URL(route.request().url()).pathname);
  const file = join(root, path);
  if (!file.startsWith(join(root, 'viewer', 'glyphs'))) return route.abort();
  // Same rule as the app: a glyph range that is not bundled is an empty file, not an error.
  const body = await readFile(file).catch(() => Buffer.alloc(0));
  return route.fulfill({ body, contentType: 'application/x-protobuf' });
});
report.navigator_online = await page.evaluate(() => navigator.onLine);
await page.setInputFiles('#file', pack);
await page.waitForFunction((name) => window.__source === name, basename(pack), { timeout: 15000 });
await settle();
report.device_offline = { views: await visit('with the device offline', 'device-offline-') };
report.device_offline.features = report.device_offline.views[0].features;
report.device_offline.screenshot = report.device_offline.views[0].screenshot;

mapErrors.push(...(await page.evaluate(() => window.__mapErrors || [])));
for (const m of mapErrors) errors.push(`map: ${m}`);
report.errors = [...new Set(errors)].filter((e) => !allowed.some((rx) => rx.test(e)));
report.failed_requests = failedRequests;

await browser.close();
server.close();

if (blocked.length) failures.push(`${blocked.length} request(s) tried to leave the device`);
if (!total(report.views[0].features)) failures.push('nothing rendered with outside network blocked');
if (report.navigator_online !== false) failures.push('browser did not go offline');
if (!total(report.device_offline.features)) failures.push('nothing rendered with the device offline');
if (report.errors.length) failures.push(`${report.errors.length} console / page / map error(s): ${report.errors.slice(0, 3).join(' | ')}${failedRequests.length ? ` (failed requests: ${failedRequests.slice(0, 3).join(', ')})` : ''}`);
report.ok = failures.length === 0;
report.failures = failures;
await writeFile(join(outDir, `${basename(pack, '.pmtiles')}.report.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
