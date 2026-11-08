// Plain-node checks for the real lines of the stages, from OpenStreetMap: the bundled files (assets/map/lines, made by
// tools/poi-audit/build_route_lines.py), how routeLines.ts reads them, and what sampleRoute.ts makes of them (the stage lines, the route, the
// towns, the sample position), with the hand-placed lines as the fallback and nothing else. No React, no network.
// Run: npm run test:map (map.test.ts runs this file too).
import './lineShim'; // first: it lets the compiled routeLines find the files in assets/map/lines
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { type LngLat, distanceM, lineLengthM, nearestOnLine, pointAlong } from '../geo';
import { cumulative, progressAlong } from '../nav';
import { OSM_STAGES, dataDate, osmDataDate, osmLine, parseLine } from '../routeLines';
import {
  HAND_PLACED_LINES, ROUTE_NOTICE, SAMPLE_PROGRESS_M, lineSources, makeRoute, routeLine, routeNotice, samplePosition, stageEndAlongM, stageForAlong, stageForPoint, stages, towns,
} from '../sampleRoute';

let n = 0;
const check = (name: string, fn: () => void) => {
  try {
    fn();
  } catch (e) {
    console.error(`FAILED - ${name}`);
    throw e;
  }
  n++;
  console.log(`ok ${n} - ${name}`);
};
const near = (a: number, b: number, tol: number, msg?: string) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} is not within ${tol} of ${b}`);

const root = process.cwd(); // npm run test:map runs from mobile/
const DIR = join(root, 'assets', 'map', 'lines');
type Entry = {
  stage: number; slug: string; file: string; osm_timestamp: string | null; relations: { id: number; name: string | null; share: number }[];
  start: LngLat; end: LngLat; length_km: number; points: number; bytes: number; sha256: string;
};
type Manifest = {
  generator: string; generator_version: number; licence: string; osm_timestamp: string; tolerance_m: number; stages: Entry[];
  joins: { from: number; to: number; gap_m: number; closed: boolean }[];
};
const manifest = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8')) as Manifest;
const last = <T>(a: readonly T[]): T => a[a.length - 1];
/** The stage lines end to end, the first point of a stage being the last of the one before: the detailed part of routeLine. */
const detail = (lines: LngLat[][]) => lines.flatMap((l, i) => (i ? l.slice(1) : l));

/* ================================================================ the files */

check('the bundle is a manifest and a file for each stage routeLines.ts knows, and those are stages 1 to 3', () => {
  const files = readdirSync(DIR).filter((f) => /^camino-frances-\d\d\.json$/.test(f)).sort();
  assert.deepEqual(files, manifest.stages.map((e) => e.file).sort(), 'every file is in the manifest and every manifest entry has its file');
  assert.deepEqual(manifest.stages.map((e) => e.stage), [...OSM_STAGES], 'routeLines.ts loads exactly the stages of the manifest');
  for (const stage of [1, 2, 3]) assert.ok(OSM_STAGES.includes(stage), `stage ${stage}`);
  for (const e of manifest.stages) assert.equal(e.file, `camino-frances-${String(e.stage).padStart(2, '0')}.json`);
});

check('each file is what the manifest says (sha256, size, points, first and last point): a line edited by hand fails here', () => {
  for (const e of manifest.stages) {
    const data = readFileSync(join(DIR, e.file));
    assert.equal(createHash('sha256').update(data).digest('hex'), e.sha256, `${e.file} is not what the manifest says: run tools/poi-audit/build_route_lines.py again`);
    assert.equal(data.length, e.bytes, e.file);
    const line = osmLine(e.stage);
    assert.ok(line, `stage ${e.stage} has a line`);
    assert.equal(line.length, e.points, e.file);
    assert.deepEqual(line[0], e.start, e.file);
    assert.deepEqual(last(line), e.end, e.file);
  }
  assert.equal(manifest.generator, 'tools/poi-audit/build_route_lines.py');
  assert.ok(manifest.generator_version >= 1 && manifest.tolerance_m > 0 && manifest.tolerance_m <= 10, 'thinned to a few metres');
});

check('the lines are OpenStreetMap data and say so: the credit and the licence in the manifest, the relations the lines run along, the date of the data', () => {
  assert.match(manifest.licence, /OpenStreetMap contributors/);
  assert.match(manifest.licence, /ODbL/);
  assert.match(manifest.osm_timestamp, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  assert.equal(osmDataDate(), manifest.osm_timestamp.slice(0, 10));
  for (const e of manifest.stages) {
    assert.ok(Number.isInteger(e.relations[0].id) && e.relations[0].id > 0 && e.relations[0].share > 0.5, `${e.file}: the line runs along an OSM route relation`);
  }
});

check('the files are small: a few kilobytes a stage, not the many that thousands of untouched OSM points would be', () => {
  const total = manifest.stages.reduce((sum, e) => sum + e.bytes, 0);
  assert.ok(total < 40_000, `${total} bytes`);
  for (const e of manifest.stages) assert.ok(e.points >= 100 && e.points <= 600, `${e.file}: ${e.points} points`);
});

/* ================================================================ the lines */

check('every stage line is a real line: over 100 points (the hand-placed ones have 10 and 5), inside the box of the first three stages, no repeated point, no hop over 1 km', () => {
  for (const stage of OSM_STAGES) {
    const line = osmLine(stage)!;
    assert.ok(line.length > 100, `stage ${stage}: ${line.length} points`);
    for (const [lng, lat] of line) assert.ok(lng >= -1.7 && lng <= -1.2 && lat >= 42.78 && lat <= 43.2, `stage ${stage}: ${lng}, ${lat} is not near Saint-Jean to Pamplona`);
    for (let i = 1; i < line.length; i++) {
      const hop = distanceM(line[i - 1], line[i]);
      assert.ok(hop > 0 && hop < 1000, `stage ${stage}: ${hop} m between points ${i - 1} and ${i}`);
    }
  }
});

check('the lines are in walking order, start town to end town: the ends are within 200 m of the towns, and every point is where its distance along the line says', () => {
  stages.forEach((s, i) => {
    assert.ok(distanceM(s.line[0], towns[i].at) <= 200, `stage ${s.number} starts ${distanceM(s.line[0], towns[i].at)} m from ${towns[i].name}`);
    assert.ok(distanceM(last(s.line), towns[i + 1].at) <= 200, `stage ${s.number} ends ${distanceM(last(s.line), towns[i + 1].at)} m from ${towns[i + 1].name}`);
    const along = cumulative(s.line);
    for (let v = 0; v < s.line.length; v++) near(progressAlong(s.line, s.line[v]).alongM, along[v], 1, `stage ${s.number}, point ${v} snaps to another part of the line:`);
  });
});

check('the stages are joined: the end of a stage is the start of the next, exactly, and routeLine is the stage lines end to end and then the towns', () => {
  for (let i = 0; i + 1 < stages.length; i++) assert.deepEqual(last(stages[i].line), stages[i + 1].line[0], `stage ${i + 1} to ${i + 2}`);
  for (const j of manifest.joins) assert.equal(j.gap_m, 0, `the manifest says stage ${j.from} meets stage ${j.to} exactly`);
  const lines = stages.map((s) => s.line);
  const joined = detail(lines);
  assert.deepEqual(routeLine.slice(0, joined.length), joined);
  assert.deepEqual(routeLine.slice(joined.length), towns.slice(4).map((t) => t.at));
  stages.forEach((_, i) => near(stageEndAlongM[i], lineLengthM(detail(lines.slice(0, i + 1))), 1e-6, `where stage ${i + 1} ends along the route:`));
  assert.ok(stageEndAlongM.every((m, i) => i === 0 || m > stageEndAlongM[i - 1]));
});

check('the length of each line is within 5 percent of the distance of its stage (24.2, 21.4 and 20.4 km in the seed data) and is the length the manifest says', () => {
  stages.forEach((s, i) => {
    const km = lineLengthM(s.line) / 1000;
    assert.ok(Math.abs(km - s.distanceKm) < s.distanceKm * 0.05, `stage ${s.number}: ${km} km against ${s.distanceKm}`);
    near(km, manifest.stages[i].length_km, manifest.stages[i].length_km * 0.002, `stage ${s.number} against the manifest:`);
  });
});

check('the towns and the sample position lie on the new line: each of the four towns within 300 m, the sample position on the line 9 km into stage 1', () => {
  for (const t of towns.slice(0, 4)) assert.ok(nearestOnLine(routeLine, t.at).distanceM <= 300, `${t.name} is ${nearestOnLine(routeLine, t.at).distanceM} m from the line`);
  assert.equal(SAMPLE_PROGRESS_M, 9000);
  near(nearestOnLine(routeLine, samplePosition).distanceM, 0, 0.5, 'the sample position is on the line:');
  near(progressAlong(routeLine, samplePosition).alongM, 9000, 5);
  assert.equal(stageForPoint(samplePosition).number, 1);
});

check('the line is where the Camino is: it passes within 40 m of six places OSM maps on the stages, at the kilometre they are at (real nodes, not the hand-placed pins)', () => {
  // [stage, OSM object, [lng, lat], km along the stage, tolerance in km]. The old hand-placed line was kilometres away from the first two.
  const places: [number, string, LngLat, number, number][] = [
    [1, 'node/3337547778 Le Refuge Orisson', [-1.2392608, 43.1087778], 7.4, 0.4],
    [1, 'node/454408165 Croix Thibault', [-1.2673155, 43.0583534], 14.8, 0.4],
    [2, 'way/216608590 Hostal Burguete', [-1.33496, 42.99071], 2.8, 0.3],
    [2, 'node/8251756989 Erroko Gaineko begiratokia', [-1.47081, 42.94139], 17.9, 0.4],
    [3, 'way/1165661339 La Parada de Zuriain', [-1.56602, 42.87851], 9.1, 0.4],
    [3, 'node/2418865141 Albergue de la Trinidad de Arre', [-1.60426, 42.83619], 15.8, 0.4],
  ];
  for (const [stage, what, at, km, tol] of places) {
    const line = osmLine(stage)!;
    const p = progressAlong(line, at);
    assert.ok(p.offM <= 40, `${what} is ${p.offM} m from the line of stage ${stage}`);
    near(p.alongM / 1000, km, tol, `${what}: km along stage ${stage}`);
  }
});

/* ================================================================ the hand-placed lines are the fallback, and only that */

const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? (f === 'node_modules' ? [] : walk(join(dir, f))) : [join(dir, f)]));
const code = (src: string) => src.split('\n').filter((l) => !/^\s*(\/\/|\/?\*)/.test(l)).join('\n'); // without comment lines

check('a stage that has an OSM line is drawn with it: no hand-placed point is in the detailed part of the route', () => {
  assert.deepEqual(lineSources, ['osm', 'osm', 'osm']);
  stages.forEach((s) => {
    assert.equal(s.lineSource, 'osm');
    assert.equal(s.line, osmLine(s.number), 'the OSM line itself');
    assert.notEqual(s.line, HAND_PLACED_LINES[s.number]);
    assert.ok(s.line.length > 10 * HAND_PLACED_LINES[s.number].length);
  });
  const used = new Set(routeLine.slice(0, detail(stages.map((s) => s.line)).length).map((p) => `${p[0]},${p[1]}`));
  for (const stage of [1, 2, 3]) for (const p of HAND_PLACED_LINES[stage]) assert.ok(!used.has(`${p[0]},${p[1]}`), `the hand-placed point ${p} of stage ${stage} is in the route`);
});

check('the hand-placed lines are read in one place, makeRoute, and only through "osm ?? hand-placed": no other file of the app imports them', () => {
  const holders = [...walk(join(root, 'src')), ...walk(join(root, 'app'))]
    .filter((f) => /\.tsx?$/.test(f) && !f.includes('__tests__'))
    .filter((f) => readFileSync(f, 'utf8').includes('HAND_PLACED_LINES'))
    .map((f) => relative(root, f).split('\\').join('/'));
  assert.deepEqual(holders, ['src/features/map/sampleRoute.ts']);
  const src = code(readFileSync(join(root, 'src/features/map/sampleRoute.ts'), 'utf8'));
  assert.equal((src.match(/HAND_PLACED_LINES/g) ?? []).length, 2, 'its declaration and its one use');
  assert.match(src, /line: osm \?\? HAND_PLACED_LINES\[def\.number\]/);
});

check('the fallback works: with no line for a stage the hand-placed one is drawn (and with none at all the route is what it was before the OSM lines)', () => {
  const none = makeRoute(() => null);
  assert.deepEqual(none.stages.map((s) => s.lineSource), ['hand-placed', 'hand-placed', 'hand-placed']);
  none.stages.forEach((s) => assert.equal(s.line, HAND_PLACED_LINES[s.number]));
  assert.deepEqual(none.routeLine, [...HAND_PLACED_LINES[1], ...HAND_PLACED_LINES[2].slice(1), ...HAND_PLACED_LINES[3].slice(1), ...towns.slice(4).map((t) => t.at)]);
  near(none.stageEndAlongM[0], 20274.6, 1, 'the end of the hand-placed stage 1:');
  assert.equal(none.stages[0].line.length, 10);
  // stageForPoint measures to the line, not to its points: on these lines (a point every few kilometres) 100 m into stage 2 is still stage 2
  assert.equal(none.stageForPoint(pointAlong(none.routeLine, none.stageEndAlongM[0] + 100)).number, 2);
  assert.equal(none.stageForPoint(pointAlong(none.routeLine, none.stageEndAlongM[0] - 100)).number, 1);

  const mixed = makeRoute((stage) => (stage === 2 ? null : osmLine(stage)));
  assert.deepEqual(mixed.stages.map((s) => s.lineSource), ['osm', 'hand-placed', 'osm']);
  assert.equal(mixed.stages[0].line, osmLine(1));
  assert.equal(mixed.stages[1].line, HAND_PLACED_LINES[2]);
  assert.equal(mixed.stages[2].line, osmLine(3));
});

check('every route the fallback can make is one piece: each stage ends where stageEndAlongM says, and stageForAlong and stageForPoint agree on the middle of each stage', () => {
  const variants = [makeRoute(), makeRoute(() => null), makeRoute((stage) => (stage === 2 ? null : osmLine(stage))), makeRoute((stage) => (stage === 1 ? osmLine(1) : null))];
  for (const v of variants) {
    v.stages.forEach((s, i) => {
      const end = progressAlong(v.routeLine, last(s.line));
      near(end.offM, 0, 1e-6, `the end of stage ${s.number} is on the route:`);
      near(end.alongM, v.stageEndAlongM[i], 1e-6, `where stage ${s.number} ends:`);
      const start = i === 0 ? 0 : v.stageEndAlongM[i - 1];
      assert.equal(v.stageForAlong((start + v.stageEndAlongM[i]) / 2).number, s.number);
      assert.equal(v.stageForPoint(s.line[Math.floor(s.line.length / 2)]).number, s.number);
    });
    assert.ok(v.stageEndAlongM.every((m, i) => i === 0 || m > v.stageEndAlongM[i - 1]));
  }
  assert.equal(stageForAlong(stageEndAlongM[0] - 10).number, 1);
});

/* ================================================================ reading a file, and what the sheet says */

check('a damaged file is no line: parseLine refuses what is not a LineString, and a stage the bundle does not have gets null', () => {
  const ok = parseLine({ type: 'LineString', coordinates: [[-1.2, 43.1], [-1.3, 43.0], [-1.31, 43.01, 950]] });
  assert.deepEqual(ok, [[-1.2, 43.1], [-1.3, 43.0], [-1.31, 43.01]], 'an elevation is dropped');
  for (const bad of [
    null, undefined, 5, 'LineString', [], {}, { type: 'Point', coordinates: [-1.2, 43.1] }, { type: 'LineString' }, { type: 'LineString', coordinates: 5 },
    { type: 'LineString', coordinates: [[-1.2, 43.1]] }, { type: 'LineString', coordinates: [[-1.2, 43.1], [-1.3]] },
    { type: 'LineString', coordinates: [[-1.2, 43.1], [-1.3, '43.0']] }, { type: 'LineString', coordinates: [[-1.2, 43.1], [NaN, 43]] },
    { type: 'LineString', coordinates: [[-1.2, 43.1], [Infinity, 43]] }, { type: 'LineString', coordinates: [[-1.2, 43.1], [43, -1300]] },
    { type: 'LineString', coordinates: [[-1.2, 43.1], [190, 43]] }, { type: 'LineString', coordinates: [[-1.2, 43.1], null] },
  ]) assert.equal(parseLine(bad), null, JSON.stringify(bad));
  for (const stage of [0, 4, 99, -1, NaN]) assert.equal(osmLine(stage), null, `stage ${stage}`);
  assert.equal(osmLine(1), osmLine(1), 'the same array every time: nav.ts caches distances per array');
});

check('the date of the data: a day from an OSM timestamp, else nothing', () => {
  assert.equal(dataDate('2026-08-19T03:16:35Z'), '2026-08-19');
  assert.equal(dataDate('2026-08-19'), '2026-08-19');
  for (const bad of [null, undefined, 5, '', 'yesterday', '19-08-2026', '2026-8-19']) assert.equal(dataDate(bad), null, String(bad));
});

check('the route sheet says what is drawn: OSM and its credit for an OSM stage, "placed by hand" for the others, and never OpenStreetMap for a hand-placed line', () => {
  assert.equal(
    routeNotice(['osm', 'osm', 'osm'], 'Pamplona', '2026-08-19'),
    'Stages 1 to 3 follow the Camino as OpenStreetMap has it (data of 19 August 2026). Beyond Pamplona the route is still drawn as straight lines between towns: do not navigate with it yet. © OpenStreetMap contributors.',
  );
  assert.equal(
    routeNotice(['osm', 'hand-placed', 'osm'], 'Pamplona', '2026-08-19'),
    'Stages 1 and 3 follow the Camino as OpenStreetMap has it (data of 19 August 2026). Stage 2 is placed by hand. Beyond Pamplona the route is still drawn as straight lines between towns: do not navigate with it yet. © OpenStreetMap contributors.',
  );
  assert.match(routeNotice(['osm', 'hand-placed', 'hand-placed'], 'Pamplona', null), /^Stage 1 follows the Camino as OpenStreetMap has it\. Stages 2 and 3 are placed by hand\./);
  const none = routeNotice(['hand-placed', 'hand-placed', 'hand-placed'], 'Pamplona', '2026-08-19');
  assert.equal(none, 'Stages 1 to 3 are placed by hand. Beyond Pamplona the route is still drawn as straight lines between towns: do not navigate with it yet.');
  assert.doesNotMatch(none, /OpenStreetMap|©/);
  assert.doesNotMatch(routeNotice(['osm'], 'X', '2026-13-40'), /data of/, 'a day that is not a day is left out');
  // and what the app says today, from the lines it really draws
  assert.match(ROUTE_NOTICE, /^Stages 1 to 3 follow the Camino as OpenStreetMap has it \(data of \d{1,2} [A-Z][a-z]+ 20\d\d\)\. Beyond Pamplona the route is still drawn as straight lines between towns: do not navigate with it yet\. © OpenStreetMap contributors\.$/);
  assert.equal(ROUTE_NOTICE, routeNotice(lineSources, 'Pamplona', osmDataDate()));
  assert.doesNotMatch(ROUTE_NOTICE, /hand/);
});

check('the Maps tab shows that sheet text, from the model, and no longer says by itself that the first stages are hand-placed', () => {
  const screen = readFileSync(join(root, 'app', '(tabs)', 'maps.tsx'), 'utf8');
  assert.match(screen, /\{m\.routeNotice\}/);
  assert.doesNotMatch(screen, /hand-placed/);
  const model = code(readFileSync(join(root, 'src/features/map/useMapModel.ts'), 'utf8'));
  assert.match(model, /routeNotice: ROUTE_NOTICE/);
});

console.log(`\n${n} passed`);
