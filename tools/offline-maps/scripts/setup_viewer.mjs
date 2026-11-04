// Copy MapLibre GL JS + pmtiles into viewer/vendor and fetch the glyph ranges the
// style uses into viewer/glyphs. Run once while online (npm run setup); after
// that the viewer needs no network at all.
import { cp, mkdir, writeFile, access } from 'node:fs/promises';
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
// typographic punctuation (– — ’ “ ” …). The app bundles the same files.
const GLYPHS = 'https://raw.githubusercontent.com/protomaps/basemaps-assets/main/fonts';
const FONTS = ['Noto Sans Regular', 'Noto Sans Medium', 'Noto Sans Italic'];
const RANGES = ['0-255', '256-511', '8192-8447'];
for (const font of FONTS) {
  const dir = join(viewer, 'glyphs', font);
  await mkdir(dir, { recursive: true });
  for (const range of RANGES) {
    const out = join(dir, `${range}.pbf`);
    try { await access(out); continue; } catch {}
    const res = await fetch(`${GLYPHS}/${encodeURIComponent(font)}/${range}.pbf`);
    if (!res.ok) throw new Error(`glyph ${font} ${range}: HTTP ${res.status}`);
    await writeFile(out, Buffer.from(await res.arrayBuffer()));
  }
}
console.log('viewer ready: vendor/ and glyphs/ populated');
