// Renders the social share image web/assets/og.png (1200 x 630) from the current app screens and the
// self-hosted fonts, so the tab names in it never lag behind the design.
//
//   cd tools/offline-maps && npm ci        # once: provides Playwright
//   node ../render_screens.mjs             # first, if the design changed
//   node ../render_og.mjs [--out web/assets/og.png]
//
// Needs Pillow for the final PNG optimisation (pip install pillow).
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({ options: { out: { type: 'string' } } });
const out = resolve(values.out || join(root, 'web', 'assets', 'og.png'));
const { chromium } = createRequire(join(root, 'tools', 'offline-maps', 'package.json'))('playwright');

const url = (...p) => pathToFileURL(join(root, 'web', 'assets', ...p)).href;
const faviconSvg = await readFile(join(root, 'web', 'favicon.svg'), 'utf8');
const mark = faviconSvg.replace('<svg ', '<svg width="56" height="56" ');
const range = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215';

const page = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:"Fraunces";font-style:normal;font-weight:100 900;src:url(${url('fonts', 'fraunces-latin-opsz-normal.woff2')});unicode-range:${range}}
@font-face{font-family:"Fraunces";font-style:italic;font-weight:100 900;src:url(${url('fonts', 'fraunces-latin-opsz-italic.woff2')});unicode-range:${range}}
@font-face{font-family:"Inter";font-weight:100 900;src:url(${url('fonts', 'inter-latin-wght-normal.woff2')});unicode-range:${range}}
@font-face{font-family:"Caveat";font-weight:400 700;src:url(${url('fonts', 'caveat-latin-wght-normal.woff2')});unicode-range:${range}}
html,body{margin:0}
body{width:1200px;height:630px;background:#14365D;position:relative;overflow:hidden;color:#F6EFE2;font-family:"Inter",sans-serif}
.brand{position:absolute;left:76px;top:70px;display:flex;align-items:center;gap:16px;font:700 44px/1 "Fraunces",serif;letter-spacing:-.02em}
.brand .plus{color:#D9A21B;font-family:"Inter",sans-serif;font-size:1.12em;-webkit-text-stroke:1px #D9A21B;position:relative;top:-.1em}
h1{position:absolute;left:72px;top:170px;margin:0;font:600 86px/1.04 "Fraunces",serif;letter-spacing:-.02em;width:620px}
h1 em{color:#E8B53A;font-style:italic}
p{position:absolute;left:76px;top:362px;margin:0;width:560px;font:400 26px/1.5 "Inter",sans-serif;color:#C9D3E0}
.sign{position:absolute;left:76px;top:530px;font:700 46px/1 "Caveat",cursive;color:#E8B53A}
.phone{position:absolute;width:262px;height:567px;border-radius:13% / 6%;overflow:hidden;background:#0C2340;box-shadow:0 28px 60px rgba(0,0,0,.38);transform-origin:50% 50%}
.phone img{width:100%;height:100%;display:block;object-fit:cover}
.a{left:690px;top:112px;transform:rotate(-5deg)}
.b{left:912px;top:46px;transform:rotate(-4deg)}
</style>
<div class="brand">${mark}<span>Camino<span class="plus">+</span></span></div>
<h1>Every step of the Way, <em>even offline.</em></h1>
<p>Offline maps, stays, stamps and stories for every Camino de Santiago route.</p>
<div class="sign">Buen Camino</div>
<div class="phone a"><img src="${url('screens', 'me-passport.webp')}" alt=""></div>
<div class="phone b"><img src="${url('screens', 'maps-helicopter.webp')}" alt=""></div>`;

const tmp = await mkdtemp(join(tmpdir(), 'og-'));
const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
const pg = await ctx.newPage();
const file = join(tmp, 'og.html');
await (await import('node:fs/promises')).writeFile(file, page);
await pg.goto(pathToFileURL(file).href);
await pg.evaluate(() => document.fonts.ready);
await pg.waitForTimeout(300);
await pg.screenshot({ path: join(tmp, 'og.png') });
await browser.close();
execFileSync('python3', ['-c', 'import sys; from PIL import Image; Image.open(sys.argv[1]).convert("RGB").save(sys.argv[2], optimize=True)', join(tmp, 'og.png'), out], { stdio: 'inherit' });
await rm(tmp, { recursive: true, force: true });
console.log('wrote', out);
