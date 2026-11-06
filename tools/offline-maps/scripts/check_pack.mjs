// Quality gates for a built pack, no network needed.
//
//   node scripts/check_pack.mjs dist/camino-frances-01-3km-z15.json \
//        [--stage stages/camino-frances-01.json] [--publishing] [--previous old-manifest.json]
//
// Checks the manifest that build_stage.sh wrote against the "quality" band in the stage file
// (size, tile count, required layers; see scripts/lib/quality.mjs). With --publishing it also
// requires route_source 'osm' and fresh OSM data. With --previous it compares size and tile
// count with an earlier manifest. Exits 1 with a plain message per problem.
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { checkManifest, compareWithPrevious, report } from './lib/quality.mjs';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { stage: { type: 'string' }, previous: { type: 'string' }, publishing: { type: 'boolean', default: false } },
});
const manifestPath = positionals.find((a) => a.endsWith('.json'));
if (!manifestPath) {
  console.error('usage: check_pack.mjs <pack manifest .json> [--stage stage.json] [--publishing] [--previous manifest.json]');
  process.exit(2);
}

const here = dirname(fileURLToPath(import.meta.url));
const m = JSON.parse(await readFile(manifestPath, 'utf8'));
const stagePath = values.stage || join(here, '..', 'stages', `${m.slug}.json`);
const stage = JSON.parse(await readFile(stagePath, 'utf8'));

const result = checkManifest(m, stage.quality, { publishing: values.publishing });
if (values.previous) {
  const prev = JSON.parse(await readFile(values.previous, 'utf8'));
  const cmp = compareWithPrevious(m, prev, stage.quality);
  result.errors.push(...cmp.errors);
  result.warnings.push(...cmp.warnings);
}

const text = report(result);
if (text) console.log(text);
if (result.errors.length) {
  console.error(`\n${m.file}: ${result.errors.length} quality gate(s) failed (stage file ${stagePath})`);
  process.exit(1);
}
console.log(`${m.file}: quality gates passed (${m.size_bytes} bytes, ${m.tiles ?? '?'} tiles, route ${m.route_source}${values.publishing ? ', publishing' : ''})`);
