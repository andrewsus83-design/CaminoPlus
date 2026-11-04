// Proves a stage pack renders with no internet.
//
//   node test/render_offline.mjs dist/camino-frances-01-3km-z15.pmtiles \
//        [--route dist/x.route.geojson] [--corridor dist/x.corridor.geojson] \
//        [--at -1.3195,43.0094,15] [--out dist/render]
//
// Check 1 (no outside requests): every request that is not to the local viewer
//   server is aborted and counted. The map must render and the count must be 0.
// Check 2 (device offline): the browser is switched offline (navigator.onLine =
//   false, all network refused, localhost too), then the pack is opened from disk
//   through the file picker, the way the app reads a downloaded pack. Glyphs are
//   already cached from check 1, which matches the app where they are bundled.
// Writes screenshots and a JSON report; exits non-zero if a check fails.
import { chromium } from 'playwright';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { resolve, relative, join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '../scripts/serve.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const pack = resolve(argv[0] || '');
const opt = (k) => { const i = argv.indexOf(k); return i > 0 ? argv[i + 1] : undefined; };
const views = argv.flatMap((a, i) => (argv[i - 1] === '--at' ? [a.split(',').map(Number)] : []));
const outDir = resolve(opt('--out') || join(root, 'dist', 'render'));
const rel = (p) => (p ? '/' + relative(root, resolve(p)) : undefined);

if (!argv[0]) { console.error('usage: render_offline.mjs <pack.pmtiles> [--route f] [--corridor f] [--at lon,lat,zoom]...'); process.exit(1); }
await mkdir(outDir, { recursive: true });

const server = await serve(0);
const origin = `http://127.0.0.1:${server.address().port}`;
const qs = new URLSearchParams({ pack: rel(pack) });
if (opt('--route')) qs.set('route', rel(opt('--route')));
if (opt('--corridor')) qs.set('corridor', rel(opt('--corridor')));

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
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

async function settle() {
  await page.waitForFunction(() => window.__map && window.__map.loaded() && window.__map.areTilesLoaded(), null, { timeout: 60000 });
  await page.waitForTimeout(500);
}
const counts = () => page.evaluate(() => {
  const out = {};
  for (const f of window.__map.queryRenderedFeatures()) {
    const k = f.sourceLayer || f.source;
    out[k] = (out[k] || 0) + 1;
  }
  return out;
});

const report = { pack: basename(pack), size_bytes: (await stat(pack)).size, views: [] };

// Check 1 -------------------------------------------------------------------
await page.goto(`${origin}/viewer/?${qs}`);
await settle();
report.header = await page.evaluate(() => ({ minZoom: window.__header.minZoom, maxZoom: window.__header.maxZoom, tiles: window.__header.numAddressedTiles }));
for (const [i, v] of [[null], ...views.map((x) => [x])].entries()) {
  const at = v[0];
  if (at) { await page.evaluate(([lon, lat, z]) => window.__map.jumpTo({ center: [lon, lat], zoom: z ?? 15 }), at); await settle(); }
  const shot = join(outDir, `${basename(pack, '.pmtiles')}-${i === 0 ? 'overview' : `view${i}`}.png`);
  await page.screenshot({ path: shot });
  report.views.push({ at: at || 'fit', zoom: await page.evaluate(() => window.__map.getZoom()), features: await counts(), screenshot: relative(root, shot) });
}
report.blocked_requests = blocked;

// Check 2 -------------------------------------------------------------------
await context.setOffline(true);
report.navigator_online = await page.evaluate(() => navigator.onLine);
await page.setInputFiles('#file', pack);
await page.waitForFunction((name) => window.__source === name, basename(pack), { timeout: 15000 });
await settle();
const offlineFeatures = await counts();
const offShot = join(outDir, `${basename(pack, '.pmtiles')}-device-offline.png`);
await page.screenshot({ path: offShot });
report.device_offline = { features: offlineFeatures, screenshot: relative(root, offShot) };
report.errors = errors;

await browser.close();
server.close();

const total = (c) => Object.values(c).reduce((a, b) => a + b, 0);
const failures = [];
if (blocked.length) failures.push(`${blocked.length} request(s) tried to leave the device`);
if (!total(report.views[0].features)) failures.push('nothing rendered with outside network blocked');
if (report.navigator_online !== false) failures.push('browser did not go offline');
if (!total(offlineFeatures)) failures.push('nothing rendered with the device offline');
report.ok = failures.length === 0;
report.failures = failures;
await writeFile(join(outDir, `${basename(pack, '.pmtiles')}.report.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
