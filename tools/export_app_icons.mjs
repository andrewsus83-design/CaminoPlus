// Exports the app icons, the splash mark and the Play Store icon as PNG from the brand SVG pack
// (brand/svg/app-icon/, written by tools/build_brand_svg.py, which never makes a PNG).
//
//   cd tools/offline-maps && npm ci        # once: provides Playwright (the same one render_og.mjs uses)
//   node tools/export_app_icons.mjs            # render and write every file below, and the manifest
//   node tools/export_app_icons.mjs --check    # render again and compare with the files in the repository; writes nothing
//
// Never edit one of these PNGs by hand: change the SVG (or this table), run the exporter, commit the result.
// tools/tests/test_store_assets.py fails when a PNG or an SVG no longer matches the manifest this script writes.
//
// What it makes (the rules each file has to meet are why the table below has the columns it has):
//   mobile/assets/icon.png                      iOS app icon, 1024 x 1024, RGB, NO alpha (App Store Connect refuses an icon with an alpha
//                                               channel), square corners (iOS rounds them itself).
//   mobile/assets/android-icon-foreground.png   Android adaptive icon, front layer, 1024 x 1024 RGBA. Android masks the 108 dp layer to a
//                                               circle, square or squircle and keeps only the middle: everything must lie inside the circle of
//                                               66 dp (61 percent of the width). The script measures it and stops if the art is outside.
//   mobile/assets/android-icon-background.png   Android adaptive icon, back layer, 1024 x 1024, opaque.
//   mobile/assets/android-icon-monochrome.png   Android 13 themed icon: the same shell as one colour; only its alpha is used (the phone
//                                               colours it). Same safe circle.
//   mobile/assets/splash-icon.png               The mark for the launch screen, 1024 x 1024 RGBA, transparent around it. expo-splash-screen
//                                               shows the whole square 200 wide (app.json, imageWidth), so the mark fills about 60 percent of it.
//   brand/store/play-store-icon-512.png         Google Play's store icon: 512 x 512, 32-bit PNG with alpha, full square without rounded
//                                               corners (Google Play puts its own mask on it). Not part of the app bundle.
//
// How: Chromium (Playwright) draws each SVG into a canvas, the script reads the pixels and writes the PNG itself with Node's zlib, so
// no image library and no PNG tool is needed, and the colour type of every file is exactly the one asked for.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { deflateSync, inflateSync } from 'node:zlib';
import { parseArgs } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SVG_DIR = 'brand/svg/app-icon';
const MANIFEST = 'brand/store/exported-icons.json';

// Brand colours the transparent pixels of a layer are filled with (their alpha stays 0). A program that shrinks the picture without
// premultiplying the alpha (Expo's Jimp does) would otherwise mix the black of the empty pixels into the edge of the art.
const GOLD = '#D9A21B'; // Shell Gold
const NAVY = '#14365D'; // Atlantic Blue
const BLACK = '#000000';

// Android: the safe circle of an adaptive icon is 66 dp of the 108 dp layer.
const SAFE_RADIUS = 33 / 108;

/**
 * out: where the PNG goes; svg: the file of the pack it is made from; size: pixels each way;
 * alpha: true makes an RGBA PNG, false an RGB one (the script refuses to drop an alpha channel that is not fully opaque);
 * fill: the colour under the transparent pixels (RGBA files only); safe: the art must stay inside the Android safe circle;
 * zoom: draw the SVG this many times larger around its centre (the splash mark is small in its SVG, see the header).
 */
const ASSETS = [
  { out: 'mobile/assets/icon.png', svg: 'app-icon-ios-1024.svg', size: 1024, alpha: false },
  { out: 'mobile/assets/android-icon-foreground.png', svg: 'android-adaptive-foreground.svg', size: 1024, alpha: true, fill: GOLD, safe: true },
  { out: 'mobile/assets/android-icon-background.png', svg: 'android-adaptive-background.svg', size: 1024, alpha: false },
  { out: 'mobile/assets/android-icon-monochrome.png', svg: 'android-adaptive-monochrome.svg', size: 1024, alpha: true, fill: BLACK, safe: true },
  { out: 'mobile/assets/splash-icon.png', svg: 'splash-icon.svg', size: 1024, alpha: true, fill: NAVY, zoom: 1.5 },
  { out: 'brand/store/play-store-icon-512.png', svg: 'app-icon-ios-1024.svg', size: 512, alpha: true },
];

// ---------------------------------------------------------------------------------------------------------------------------------
// PNG: 8 bits per channel, colour type 2 (RGB) or 6 (RGBA), not interlaced. Just enough for these files.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}

/** pixels: Buffer of width * height * channels bytes (channels 3 = RGB, 4 = RGBA). */
export function encodePng(width, height, channels, pixels) {
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height); // each row starts with its filter byte: 0 = none
  for (let y = 0; y < height; y++) pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = channels === 4 ? 6 : 2; // colour type
  // compression 0, filter method 0, interlace 0: the three bytes left at 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('sRGB', Buffer.from([0])), // the pixels are sRGB; rendering intent 0 = perceptual
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let pos = 8;
  let ihdr = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') ihdr = data;
    else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const [depth, colorType, , , interlace] = [ihdr[8], ihdr[9], ihdr[10], ihdr[11], ihdr[12]];
  if (depth !== 8 || (colorType !== 2 && colorType !== 6) || interlace !== 0) throw new Error('only 8-bit RGB and RGBA PNG files without interlacing');
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= channels ? prev[i - channels] : 0;
      let p;
      if (filter === 0) p = 0;
      else if (filter === 1) p = a;
      else if (filter === 2) p = b;
      else if (filter === 3) p = (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else throw new Error(`unknown PNG filter ${filter}`);
      cur[i] = (line[i] + p) & 0xff;
    }
  }
  return { width, height, channels, colorType, pixels: out };
}

// ---------------------------------------------------------------------------------------------------------------------------------

function loadPlaywright() {
  const tries = [join(root, 'tools', 'offline-maps', 'package.json'), import.meta.url];
  for (const base of tries) {
    try {
      return createRequire(base)('playwright');
    } catch {
      // try the next place
    }
  }
  throw new Error('Playwright is not installed. Run:  cd tools/offline-maps && npm ci');
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const rel = (p) => relative(root, p).split('\\').join('/');
const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Draws the SVG into a size x size canvas in the page and returns the RGBA bytes (not premultiplied). */
async function renderRgba(page, svg, size, zoom = 1) {
  const b64 = await page.evaluate(
    async ({ svg, size, zoom }) => {
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true });
      ctx.imageSmoothingQuality = 'high';
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const sw = w / zoom;
      const sh = h / zoom;
      ctx.drawImage(img, (w - sw) / 2, (h - sh) / 2, sw, sh, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;
      let bin = '';
      for (let i = 0; i < data.length; i += 0x8000) bin += String.fromCharCode.apply(null, data.subarray(i, i + 0x8000));
      return btoa(bin);
    },
    { svg, size, zoom },
  );
  return Buffer.from(b64, 'base64');
}

/** The distance of the farthest pixel with any colour in it from the centre, in pixels. */
function farthestPixel(rgba, size) {
  const c = size / 2;
  let far = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (rgba[(y * size + x) * 4 + 3] === 0) continue;
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      if (d > far) far = d;
    }
  }
  return far;
}

/** Renders one entry of ASSETS and returns { png, channels, pixels, note }. Throws when the picture breaks a rule of its file. */
async function makeAsset(page, asset, svg) {
  const rgba = await renderRgba(page, svg, asset.size, asset.zoom);
  const n = asset.size * asset.size;
  let note = '';
  if (asset.safe) {
    const far = farthestPixel(rgba, asset.size);
    const limit = SAFE_RADIUS * asset.size;
    if (far > limit) throw new Error(`${asset.out}: the art reaches ${far.toFixed(0)} px from the centre, the Android safe circle ends at ${limit.toFixed(0)} px`);
    note = `art ${((far / limit) * 100).toFixed(0)}% of the safe circle`;
  }
  if (!asset.alpha) {
    const rgb = Buffer.alloc(n * 3);
    for (let i = 0; i < n; i++) {
      if (rgba[i * 4 + 3] !== 255) throw new Error(`${asset.out}: pixel ${i % asset.size},${Math.floor(i / asset.size)} is not opaque (alpha ${rgba[i * 4 + 3]}); this file may have no transparency`);
      rgb[i * 3] = rgba[i * 4];
      rgb[i * 3 + 1] = rgba[i * 4 + 1];
      rgb[i * 3 + 2] = rgba[i * 4 + 2];
    }
    return { channels: 3, pixels: rgb, note };
  }
  if (asset.fill) {
    const [r, g, b] = hexToRgb(asset.fill);
    for (let i = 0; i < n; i++) {
      if (rgba[i * 4 + 3] === 0) {
        rgba[i * 4] = r;
        rgba[i * 4 + 1] = g;
        rgba[i * 4 + 2] = b;
      }
    }
  }
  return { channels: 4, pixels: rgba, note };
}

/** How far the committed file is from the fresh render: the largest difference in any channel, and the number of pixels that differ by more than 2. */
function compare(a, b) {
  let max = 0;
  let pixels = 0;
  const ch = a.channels;
  for (let i = 0; i < a.pixels.length; i += ch) {
    let worst = 0;
    for (let k = 0; k < ch; k++) worst = Math.max(worst, Math.abs(a.pixels[i + k] - b.pixels[i + k]));
    if (worst > max) max = worst;
    if (worst > 2) pixels++;
  }
  return { max, pixels };
}

async function main() {
  const { values } = parseArgs({ options: { check: { type: 'boolean', default: false } } });
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ deviceScaleFactor: 1 })).newPage();
  await page.setContent('<!doctype html><meta charset="utf-8"><title>icons</title>');

  // What this run made, from what: the test (tools/tests/test_store_assets.py) fails when a PNG or an SVG is not the one written here,
  // and when this script changed without a new run (its table of sizes and colours decides what the PNG files look like).
  const exporter = { path: rel(fileURLToPath(import.meta.url)), sha256: sha256(await readFile(fileURLToPath(import.meta.url))) };
  const manifest = { note: 'Written by tools/export_app_icons.mjs. tools/tests/test_store_assets.py checks it.', exporter, files: [] };
  let failed = 0;
  try {
    for (const asset of ASSETS) {
      const svgPath = join(root, SVG_DIR, asset.svg);
      const svgBytes = await readFile(svgPath);
      const made = await makeAsset(page, asset, svgBytes.toString('utf8'));
      const png = encodePng(asset.size, asset.size, made.channels, made.pixels);
      const label = `${asset.out}  ${asset.size}x${asset.size} ${made.channels === 4 ? 'RGBA' : 'RGB'}`;
      const outPath = join(root, asset.out);
      if (values.check) {
        let have;
        try {
          have = decodePng(await readFile(outPath));
        } catch (err) {
          failed++;
          console.log(`MISSING or unreadable  ${label}  (${err.message})`);
          continue;
        }
        const shape = have.width === asset.size && have.height === asset.size && have.channels === made.channels;
        const diff = shape ? compare(have, { channels: made.channels, pixels: made.pixels }) : null;
        // A different Chromium may anti-alias an edge by a level or two; more than that, or many pixels, is a real change.
        const same = shape && diff.max <= 8 && diff.pixels < asset.size;
        if (!same) failed++;
        console.log(`${same ? 'ok     ' : 'DIFFERS'}  ${label}${diff ? `  (largest difference ${diff.max}, ${diff.pixels} pixels over 2)` : '  (size or colour type is not as expected)'}`);
        continue;
      }
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, png);
      manifest.files.push({ png: asset.out, svg: `${SVG_DIR}/${asset.svg}`, width: asset.size, height: asset.size, colorType: made.channels === 4 ? 6 : 2, svgSha256: sha256(svgBytes), pngSha256: sha256(png) });
      console.log(`wrote  ${label}  ${png.length} bytes  sha256 ${sha256(png).slice(0, 12)}${made.note ? `  ${made.note}` : ''}`);
    }
  } finally {
    await browser.close();
  }
  if (values.check) {
    console.log(failed ? `${failed} file(s) differ from what the SVGs give. Run: node tools/export_app_icons.mjs` : 'every PNG is what the SVGs give');
    process.exitCode = failed ? 1 : 0;
    return;
  }
  await mkdir(join(root, 'brand', 'store'), { recursive: true });
  await writeFile(join(root, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`wrote  ${MANIFEST}`);
}

if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) await main();
