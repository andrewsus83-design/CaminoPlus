// Renders the phone mock-ups of design/index.html into the screenshots the website uses
// (web/assets/screens/*.webp, 600 x 1300). Run it again whenever the design changes, so the
// site never shows a tab name or a layout the app no longer has.
//
//   cd tools/offline-maps && npm ci        # once: provides Playwright
//   node ../render_screens.mjs [--out web/assets/screens] [--only discover,me-journey]
//
// How: opens design/index.html in headless Chromium, serves the four brand fonts from
// web/assets/fonts (so nothing is fetched from Google), screenshots each `.phone` element at
// 600 px wide, then converts to WebP with Pillow (pip install pillow).
import { mkdir, readFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const { values } = parseArgs({ options: { out: { type: 'string' }, only: { type: 'string' } } });
const outDir = resolve(values.out || join(root, 'web', 'assets', 'screens'));
const only = values.only ? new Set(values.only.split(',')) : null;

// Playwright lives in tools/offline-maps (a dev dependency there).
const require = createRequire(join(root, 'tools', 'offline-maps', 'package.json'));
const { chromium } = require('playwright');

// The label above each phone in design/index.html -> the file name the website uses.
const SCREENS = {
  'Me · Journey': 'me-journey',
  'Me · Write · Caption & Post': 'me-write-caption',
  'Me · Passport': 'me-passport',
  'Me · Plan': 'me-plan',
  'Stays': 'stays',
  'Stay detail · overview': 'stay-detail',
  'Cafe detail': 'cafe-detail',
  'Maps · Helicopter view': 'maps-helicopter',
  'Maps · City view': 'maps-city',
  'Maps · Article popup': 'maps-article',
  'Discover': 'discover',
  'Discover · Photos of you': 'discover-photos',
  'Library': 'library',
};

const fonts = join(root, 'web', 'assets', 'fonts');
const FONT_FILES = {
  'fraunces-normal': 'fraunces-latin-opsz-normal.woff2',
  'fraunces-italic': 'fraunces-latin-opsz-italic.woff2',
  inter: 'inter-latin-wght-normal.woff2',
  mono: 'jetbrains-mono-latin-wght-normal.woff2',
  caveat: 'caveat-latin-wght-normal.woff2',
};
const fontCss = `
@font-face{font-family:"Fraunces";font-style:normal;font-weight:100 900;src:url(https://fonts.gstatic.com/local/${FONT_FILES['fraunces-normal']}) format("woff2")}
@font-face{font-family:"Fraunces";font-style:italic;font-weight:100 900;src:url(https://fonts.gstatic.com/local/${FONT_FILES['fraunces-italic']}) format("woff2")}
@font-face{font-family:"Inter";font-style:normal;font-weight:100 900;src:url(https://fonts.gstatic.com/local/${FONT_FILES.inter}) format("woff2")}
@font-face{font-family:"JetBrains Mono";font-style:normal;font-weight:100 800;src:url(https://fonts.gstatic.com/local/${FONT_FILES.mono}) format("woff2")}
@font-face{font-family:"Caveat";font-style:normal;font-weight:400 700;src:url(https://fonts.gstatic.com/local/${FONT_FILES.caveat}) format("woff2")}
`;

const tmp = await mkdtemp(join(tmpdir(), 'screens-'));
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 600 / 390 });
await context.route('**/*', async (route) => {
  const url = route.request().url();
  if (url.startsWith('file://')) return route.continue();
  if (url.startsWith('https://fonts.googleapis.com/')) return route.fulfill({ body: fontCss, contentType: 'text/css' });
  const m = /^https:\/\/fonts\.gstatic\.com\/local\/([\w.-]+\.woff2)$/.exec(url);
  if (m && Object.values(FONT_FILES).includes(m[1])) {
    return route.fulfill({ body: await readFile(join(fonts, m[1])), contentType: 'font/woff2', headers: { 'Access-Control-Allow-Origin': '*' } });
  }
  return route.abort();
});
const page = await context.newPage();
await page.goto(pathToFileURL(join(root, 'design', 'index.html')).href);
await page.evaluate(() => document.fonts.ready);
// The design page scrolls its phones sideways; let them wrap instead so each one is fully visible.
await page.addStyleTag({ content: '*{animation:none!important;transition:none!important;scroll-behavior:auto!important}.phones{overflow:visible!important;flex-wrap:wrap!important;scroll-snap-type:none!important}' });

const wraps = await page.$$('.phone-wrap');
const done = new Set();
for (const wrap of wraps) {
  const label = (await (await wrap.$('.phone-label b'))?.textContent())?.trim();
  const name = SCREENS[label];
  if (!name || done.has(name) || (only && !only.has(name))) continue;
  done.add(name);
  const phone = await wrap.$('.phone');
  await phone.scrollIntoViewIfNeeded();
  await phone.screenshot({ path: join(tmp, `${name}.png`) });
  console.log(`${label} -> ${name}`);
}
await browser.close();
const missing = Object.values(SCREENS).filter((n) => (!only || only.has(n)) && !done.has(n));
if (missing.length) throw new Error(`design/index.html has no phone for: ${missing.join(', ')}`);

// PNG -> WebP, exactly 600 x 1300, like the screenshots already in the site.
await mkdir(outDir, { recursive: true });
const py = `
import sys, pathlib
from PIL import Image
src, dst = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
for png in sorted(src.glob("*.png")):
    im = Image.open(png).convert("RGB").resize((600, 1300), Image.LANCZOS)
    im.save(dst / (png.stem + ".webp"), "WEBP", quality=82, method=6)
    print("wrote", png.stem + ".webp")
`;
execFileSync('python3', ['-c', py, tmp, outDir], { stdio: 'inherit' });
await rm(tmp, { recursive: true, force: true });
