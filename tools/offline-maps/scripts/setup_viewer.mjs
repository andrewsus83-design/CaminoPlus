// Copy MapLibre GL JS + pmtiles into viewer/vendor and fetch the glyph ranges the
// style uses into viewer/glyphs. Run once while online (npm run setup); after
// that the viewer needs no network at all.
import { cp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const viewer = join(root, 'viewer');
const nm = join(root, 'node_modules');

await cp(join(nm, 'maplibre-gl/dist'), join(viewer, 'vendor/maplibre-gl'), {
  recursive: true,
  filter: (src) => !src.endsWith('.map') && !src.includes('-dev.'),
});
await cp(join(nm, 'maplibre-gl/LICENSE.txt'), join(viewer, 'vendor/maplibre-gl/LICENSE.txt'));
await mkdir(join(viewer, 'vendor/pmtiles'), { recursive: true });
await cp(join(nm, 'pmtiles/dist/pmtiles.js'), join(viewer, 'vendor/pmtiles/pmtiles.js'));

// Glyphs: SDF font ranges from Protomaps basemaps-assets (Noto Sans, OFL licence).
// 0-255 and 256-511 cover French, Spanish, Basque and Galician; 8192-8447 has
// typographic punctuation (– — ’ “ ” …). The app bundles the same files
// (mobile/assets/glyphs, byte for byte).
// Pinned to a commit and checked against SHA-256, so a change upstream cannot slip into a build.
// To update: pick a new commit, run this with the old table, replace the hashes with the new ones
// after comparing them with mobile/assets/glyphs.
const BASEMAPS_ASSETS_COMMIT = '028c18f713baecad011301ff7a69acc39bcc2ae7';
const GLYPHS = `https://raw.githubusercontent.com/protomaps/basemaps-assets/${BASEMAPS_ASSETS_COMMIT}/fonts`;
const FONTS = ['Noto Sans Regular', 'Noto Sans Medium', 'Noto Sans Italic'];
const RANGES = ['0-255', '256-511', '8192-8447'];
const SHA256 = {
  'Noto Sans Regular/0-255': '62c6d49b15fa836eb6aa45e259c7ca6762f44b011b09e47776efbe4a6db1b397',
  'Noto Sans Regular/256-511': '2eca7561f9f566bcacfda5dd04fb5880baec1328ec0f5484678289a13994de8a',
  'Noto Sans Regular/8192-8447': '8ea977a587352fe31b4159ffdbc9a40be79056f2472017c742ea1e4a931864b9',
  'Noto Sans Medium/0-255': 'ba2f0118dd024e3041b158e5f9eb49bc0a658019f53f458e9f5c0b8efcd79b91',
  'Noto Sans Medium/256-511': 'd5e801a1a5b1d409d3298c3a1e1ca76328e2314a751078833a618620e8e66e4d',
  'Noto Sans Medium/8192-8447': 'cc38e4956207f0edba1aaf749b61e8f6f1678ef1ad443d32ee285b21d0eb67aa',
  'Noto Sans Italic/0-255': '43edfca91c285ba1226f09d5e74d68e1473a088c517f02a5212ff6ccb10037dc',
  'Noto Sans Italic/256-511': 'a6f9f6574c86a4a28aba630ca1017857ceadd2370ed32a1293c35f819ab9bd60',
  'Noto Sans Italic/8192-8447': '5dc4e6680116fef01be024e272859d130262613c7e634409a590e5d50ad124ae',
};
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

for (const font of FONTS) {
  const dir = join(viewer, 'glyphs', font);
  await mkdir(dir, { recursive: true });
  for (const range of RANGES) {
    const id = `${font}/${range}`;
    const out = join(dir, `${range}.pbf`);
    // A file from an earlier run is reused only if it still matches the pinned hash.
    const have = await readFile(out).catch(() => null);
    if (have && sha256(have) === SHA256[id]) continue;
    const res = await fetch(`${GLYPHS}/${encodeURIComponent(font)}/${range}.pbf`);
    if (!res.ok) throw new Error(`glyph ${id}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (sha256(buf) !== SHA256[id]) throw new Error(`glyph ${id}: SHA-256 mismatch (got ${sha256(buf)}), refusing to use it`);
    await writeFile(out, buf);
  }
}
console.log('viewer ready: vendor/ and glyphs/ populated');
