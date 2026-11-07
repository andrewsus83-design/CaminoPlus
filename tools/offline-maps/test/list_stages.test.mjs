// Unit tests for the stage planner of the offline-maps workflow (scripts/list_stages.mjs) and for the
// rules of the workflow that uses it. Run: npm test  (node --test "test/*.test.mjs")
//
// What they prove: which stages each mode picks, that the canary is added and survives the cap, that a
// stage without a quality band is never planned for publishing, that a stage file that cannot be built
// fails the plan early, and that the workflow keeps its safety rules (JSON-only artifacts, secrets only
// in the publish job, gentle matrices).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CANARY, DEFAULT_CAP, PlanError, classifyChanges, cli, isCalibrated, parseChangedList, parseOnly, planStages, readStages,
} from '../scripts/list_stages.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(root, '..', '..');
const script = join(root, 'scripts', 'list_stages.mjs');

const QUALITY = { min_tiles: 900, max_tiles: 2600, min_size_mb: 2, max_size_mb: 9 };
const P = 'tools/offline-maps/stages/';
const slugOf = (n) => `camino-frances-${String(n).padStart(2, '0')}`;

// A stage as readStages returns it (planner tests), and as a stage file's content (file tests).
const desc = (n, calibrated = false) => ({
  file: `${slugOf(n)}.json`, stage: `stages/${slugOf(n)}.json`, slug: slugOf(n), number: n, pack: `${slugOf(n)}-3km-z15`, calibrated,
});
const stage = (n, extra = {}) => ({
  slug: slugOf(n), name: `Stage ${n}`, stage_number: n, buffer_km: 3, maxzoom: 15,
  osm_extracts: ['https://download.geofabrik.de/europe/spain/navarra-latest.osm.pbf'], ...extra,
});
const slugs = (plan) => plan.include.map((i) => i.slug);
const STAGES = [desc(10), desc(2, true), desc(1, true), desc(3), desc(11)]; // deliberately not in order

const cleanups = [];
test.after(() => Promise.all(cleanups.map((dir) => rm(dir, { recursive: true, force: true }))));
async function tempDir() {
  const dir = await mkdtemp(join(tmpdir(), 'list-stages-'));
  cleanups.push(dir);
  return dir;
}
// A stages folder on disk: an object per file is written as JSON, a string as it is (for broken files).
async function folder(files) {
  const dir = await tempDir();
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(dir, name), typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  }
  return dir;
}
const stageFiles = (...numbers) => Object.fromEntries(numbers.map((n) => [`${slugOf(n)}.json`, stage(n)]));
async function changedFile(text) {
  const file = join(await tempDir(), 'changed-files.txt');
  await writeFile(file, text);
  return file;
}
const runScript = (args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
const planError = (fn) => {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof PlanError, `expected a PlanError, got ${err}`);
    return err.message;
  }
  return assert.fail('expected a PlanError');
};

// ---- modes -------------------------------------------------------------------------------------

test('all lists every stage, sorted by stage number (a number, not text) and then by slug', () => {
  const sibling = { ...desc(2), slug: 'camino-aaa-02', file: 'camino-aaa-02.json', stage: 'stages/camino-aaa-02.json' };
  const plan = planStages({ stages: [desc(10), sibling, desc(2), desc(1)], mode: 'all' });
  assert.deepEqual(slugs(plan), ['camino-frances-01', 'camino-aaa-02', 'camino-frances-02', 'camino-frances-10']);
  assert.equal(plan.count, 4);
  assert.deepEqual(plan.include[0], { stage: 'stages/camino-frances-01.json', slug: 'camino-frances-01', pack: 'camino-frances-01-3km-z15' });
});

test('publish lists only stages with a quality band, and names the ones it left out', () => {
  const plan = planStages({ stages: STAGES, mode: 'publish' });
  assert.deepEqual(slugs(plan), ['camino-frances-01', 'camino-frances-02']);
  assert.match(plan.notes.join('\n'), /3 stage\(s\) have no quality band.*camino-frances-03, camino-frances-10, camino-frances-11/);
});

test('a quality band counts only when it is a non-empty object', () => {
  assert.equal(isCalibrated(QUALITY), true);
  for (const bad of [undefined, null, {}, [], [QUALITY], 'yes', 7, true]) assert.equal(isCalibrated(bad), false, JSON.stringify(bad));
});

test('pr: only changed stages/<slug>.json files count, not their route files, nested files or the catalog', () => {
  const plan = planStages({
    stages: STAGES,
    mode: 'pr',
    changed: [
      `${P}camino-frances-03.json`,
      `${P}camino-frances-10.route.geojson`,
      `${P}sub/camino-frances-11.json`,
      'tools/offline-maps/catalog/camino-frances.json',
      'tools/offline-maps/catalog/more/camino-frances-02.json',
    ],
  });
  assert.deepEqual(slugs(plan), ['camino-frances-03']);
  assert.deepEqual(plan.notes, [], 'route files and the catalog are not stage files, so they are not even mentioned');
});

test('pr: build tooling adds the canary; stage-only, catalog-only and unrelated changes do not', () => {
  const plan = (path) => slugs(planStages({ stages: STAGES, mode: 'pr', changed: [path] }));
  for (const path of [
    'tools/offline-maps/scripts/build_stage.sh',
    'tools/offline-maps/scripts/lib/quality.mjs',
    'tools/offline-maps/test/render_offline.mjs',
    'tools/offline-maps/requirements.txt',
    'tools/offline-maps/package-lock.json',
    'tools/offline-maps/README.md',
    'tools/offline-maps/docs/ci-matrix.md',
    '.github/workflows/offline-maps.yml',
    '.github/actions/build-offline-pack/action.yml',
  ]) assert.deepEqual(plan(path), [CANARY], path);
  for (const path of [
    'tools/offline-maps/catalog/camino-frances.json',
    'tools/offline-maps/stages/camino-frances-03.route.geojson',
    '.github/workflows/ci.yml',
    '.github/workflows/offline-maps.yml.bak',
    '.github/actions/build-offline-pack-other/action.yml',
    'tools/offline-maps-other/script.sh',
    'tools/poi-audit/audit.py',
    'README.md',
  ]) assert.deepEqual(plan(path), [], path);
});

test('pr: the canary is listed once even when the pull request changes it and the tooling', () => {
  const plan = planStages({
    stages: STAGES,
    mode: 'pr',
    changed: [`${P}camino-frances-03.json`, 'tools/offline-maps/scripts/corridor.py', `${P}camino-frances-01.json`],
  });
  assert.deepEqual(slugs(plan), ['camino-frances-01', 'camino-frances-03']);
});

test('pr: a pull request with nothing relevant plans nothing', () => {
  const plan = planStages({ stages: STAGES, mode: 'pr', changed: [] });
  assert.deepEqual(plan, { include: [], count: 0, notes: [] });
});

test('pr: a changed stage file that no longer exists is skipped with a note, not an error', () => {
  const plan = planStages({ stages: STAGES, mode: 'pr', changed: [`${P}camino-frances-99.json`, `${P}camino-frances-02.json`] });
  assert.deepEqual(slugs(plan), ['camino-frances-02']);
  assert.match(plan.notes.join('\n'), /camino-frances-99\.json changed but is not in the stages folder/);
});

test('pr: tooling changed but the canary stage does not exist says so instead of failing', () => {
  const plan = planStages({ stages: [desc(2)], mode: 'pr', changed: ['tools/offline-maps/scripts/corridor.py'] });
  assert.equal(plan.count, 0);
  assert.match(plan.notes.join('\n'), /canary stage camino-frances-01 does not exist/);
});

// ---- the cap -----------------------------------------------------------------------------------

test('pr: the cap keeps the canary, stays sorted, and says what it left out', () => {
  const stages = Array.from({ length: 20 }, (_, i) => desc(i + 1));
  const changed = ['tools/offline-maps/scripts/build_stage.sh', ...stages.slice(1).map((s) => `${P}${s.file}`)]; // stages 2 to 20, plus tooling
  const plan = planStages({ stages, mode: 'pr', changed, cap: 5 });
  assert.deepEqual(slugs(plan), ['camino-frances-01', 'camino-frances-02', 'camino-frances-03', 'camino-frances-04', 'camino-frances-05']);
  assert.equal(plan.count, 5);
  assert.match(plan.notes.join('\n'), /capped at 5 stage\(s\); 15 not built in this run: camino-frances-06, camino-frances-07/);
  assert.match(plan.notes.join('\n'), /Run the workflow by hand/);
});

test('pr: the canary survives the cap even when other stages sort before it', () => {
  const early = { ...desc(1), slug: 'camino-aaa-01', file: 'camino-aaa-01.json', stage: 'stages/camino-aaa-01.json' };
  const plan = planStages({
    stages: [early, desc(1), desc(2)],
    mode: 'pr',
    cap: 1,
    changed: [`${P}camino-aaa-01.json`, `${P}camino-frances-01.json`, `${P}camino-frances-02.json`],
  });
  assert.deepEqual(slugs(plan), [CANARY]);
});

test('pr: without a canary the cap just keeps the first stages', () => {
  const plan = planStages({ stages: STAGES, mode: 'pr', cap: 1, changed: [`${P}camino-frances-03.json`, `${P}camino-frances-10.json`] });
  assert.deepEqual(slugs(plan), ['camino-frances-03']);
  assert.match(plan.notes.join('\n'), /1 not built in this run: camino-frances-10/);
});

test('pr: the default cap is 12, and a list that fits says nothing', () => {
  const stages = Array.from({ length: 20 }, (_, i) => desc(i + 1));
  const all = stages.map((s) => `${P}${s.file}`);
  assert.equal(DEFAULT_CAP, 12);
  assert.equal(planStages({ stages, mode: 'pr', changed: all }).count, 12);
  const exact = planStages({ stages, mode: 'pr', changed: all.slice(0, 12) });
  assert.equal(exact.count, 12);
  assert.deepEqual(exact.notes, []);
});

test('the cap belongs to pr mode: all and publish list everything', () => {
  const stages = Array.from({ length: 20 }, (_, i) => desc(i + 1, true));
  assert.equal(planStages({ stages, mode: 'all', cap: 2 }).count, 20);
  assert.equal(planStages({ stages, mode: 'publish', cap: 2 }).count, 20);
});

// ---- --only (the workflow's "stages" input) ----------------------------------------------------

test('--only narrows to the listed slugs; "all" narrows nothing; an unknown slug is an error', () => {
  assert.equal(parseOnly(undefined), null);
  assert.equal(parseOnly('all'), null);
  assert.deepEqual(parseOnly('camino-frances-02,camino-frances-01,camino-frances-02'), ['camino-frances-02', 'camino-frances-01']);
  assert.deepEqual(slugs(planStages({ stages: STAGES, mode: 'all', only: ['camino-frances-11', 'camino-frances-02'] })), ['camino-frances-02', 'camino-frances-11']);
  assert.match(planError(() => planStages({ stages: STAGES, mode: 'all', only: ['camino-frances-77'] })), /unknown stage slug\(s\): camino-frances-77/);
  assert.match(planError(() => parseOnly('all,camino-frances-01')), /"all" cannot be combined/);
  assert.match(planError(() => parseOnly(',')), /needs "all" or at least one stage slug/);
  assert.match(planError(() => parseOnly('Camino_Frances;rm -rf')), /not a stage slug/);
});

test('publish with --only publishes the calibrated stages among those selected and names the rest', () => {
  const plan = planStages({ stages: STAGES, mode: 'publish', only: ['camino-frances-02', 'camino-frances-03'] });
  assert.deepEqual(slugs(plan), ['camino-frances-02']);
  assert.match(plan.notes.join('\n'), /1 stage\(s\) have no quality band.*camino-frances-03/);
});

test('pr with --only keeps only the changed stages that were asked for', () => {
  const changed = [`${P}camino-frances-02.json`, `${P}camino-frances-03.json`];
  assert.deepEqual(slugs(planStages({ stages: STAGES, mode: 'pr', changed, only: ['camino-frances-03', 'camino-frances-11'] })), ['camino-frances-03']);
});

// ---- changed-file lists ------------------------------------------------------------------------

test('a changed-file list may have CRLF line ends, blank lines, padding and a leading ./', () => {
  const text = `  ${P}camino-frances-02.json \r\n\r\n./tools/offline-maps/scripts/x.sh\r\n\n`;
  assert.deepEqual(parseChangedList(text), [`${P}camino-frances-02.json`, 'tools/offline-maps/scripts/x.sh']);
  const { stageFiles: files, touchesBuild } = classifyChanges(parseChangedList(text));
  assert.deepEqual([...files], ['camino-frances-02.json']);
  assert.equal(touchesBuild, true);
});

// ---- stage files -------------------------------------------------------------------------------

test('readStages reads valid files, ignores what is not <slug>.json, and spells the pack like build_stage.sh', async () => {
  const dir = await folder({
    'camino-frances-02.json': stage(2, { buffer_km: 2.5, maxzoom: 14, quality: {} }),
    'camino-frances-01.json': stage(1, { quality: QUALITY }),
    'camino-frances-01.route.geojson': '{"type":"FeatureCollection","features":[]}',
    'README.md': '# not a stage',
  });
  await mkdir(join(dir, 'looks-like-a-stage.json')); // a folder is not a stage file
  assert.deepEqual(readStages(dir).map((s) => [s.slug, s.stage, s.pack, s.calibrated]), [
    ['camino-frances-01', 'stages/camino-frances-01.json', 'camino-frances-01-3km-z15', true],
    ['camino-frances-02', 'stages/camino-frances-02.json', 'camino-frances-02-2.5km-z14', false],
  ]);
});

test('stage files that cannot be built fail the plan, every problem listed at once', async () => {
  const wrongDecimal = JSON.stringify(stage(8)).replace('"buffer_km":3,', '"buffer_km":3.0,');
  assert.match(wrongDecimal, /"buffer_km":3\.0,/);
  const dir = await folder({
    'camino-frances-05.json': stage(5, { slug: 'camino-frances-06' }),
    'Camino_Frances_06.json': stage(6),
    'camino-frances-07.json': '{ not json',
    'camino-frances-08.json': wrongDecimal,
    'camino-frances-09.json': stage(9, { stage_number: 'nine', osm_extracts: [] }),
    'camino-frances-10.json': '[1, 2]',
    'camino-frances-11.json': stage(11, { maxzoom: '15' }),
    'camino-frances-12.json': stage(12, { buffer_km: -1 }),
    'camino-frances-13.json': stage(13), // the one good file does not hide the others
  });
  const message = planError(() => readStages(dir));
  assert.match(message, /^9 problem\(s\) in the stage files:/);
  assert.match(message, /camino-frances-05\.json: "slug" is "camino-frances-06" but must be camino-frances-05/);
  assert.match(message, /Camino_Frances_06\.json: a stage file is named <slug>\.json with a lower-case slug/);
  assert.match(message, /camino-frances-07\.json: not valid JSON/);
  assert.match(message, /camino-frances-08\.json: "buffer_km" is written 3\.0.*so write 3/);
  assert.match(message, /camino-frances-09\.json: "stage_number" must be a whole number/);
  assert.match(message, /camino-frances-09\.json: "osm_extracts" must list at least one http\(s\) URL/);
  assert.match(message, /camino-frances-10\.json: the file must hold one JSON object/);
  assert.match(message, /camino-frances-11\.json: "maxzoom" must be a whole number from 0 to 22/);
  assert.match(message, /camino-frances-12\.json: "buffer_km" must be a number above 0/);
  assert.doesNotMatch(message, /camino-frances-13/);
});

test('a stages folder that cannot be read is a plain error', () => {
  assert.match(planError(() => readStages(join(tmpdir(), 'list-stages-no-such-folder'))), /cannot read the stages folder/);
});

// ---- the command line --------------------------------------------------------------------------

test('the script prints exactly one JSON line, nothing else on stdout, and the notes on stderr', async () => {
  const dir = await folder({ ...stageFiles(3, 1, 2), [`${slugOf(2)}.route.geojson`]: '{}' });
  const r = runScript(['--mode', 'all', '--stages-dir', dir]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^\{"include":\[.*\],"count":3\}\n$/);
  assert.deepEqual(JSON.parse(r.stdout).include.map((i) => i.slug), ['camino-frances-01', 'camino-frances-02', 'camino-frances-03']);
  assert.equal(r.stderr, '');
  const pub = runScript(['--mode', 'publish', '--stages-dir', dir]);
  assert.equal(pub.status, 0);
  assert.equal(pub.stdout, '{"include":[],"count":0}\n');
  assert.match(pub.stderr, /^list_stages: publish: 3 stage\(s\) have no quality band/);
});

test('an empty stages folder, or a pull request that changed nothing relevant, is a valid empty plan', async () => {
  const empty = await folder({});
  for (const mode of ['all', 'publish']) {
    const r = runScript(['--mode', mode, '--stages-dir', empty]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, '{"include":[],"count":0}\n');
  }
  const dir = await folder(stageFiles(1, 2));
  const list = await changedFile('tools/offline-maps/catalog/camino-frances.json\nweb/index.html\n');
  const r = runScript(['--mode', 'pr', '--changed-file', list, '--stages-dir', dir]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '{"include":[],"count":0}\n');
});

test('pr through the script: changed stages plus the canary, capped, with the note on stderr', async () => {
  const dir = await folder(stageFiles(...Array.from({ length: 15 }, (_, i) => i + 1)));
  const lines = ['tools/offline-maps/scripts/build_stage.sh', ...Array.from({ length: 14 }, (_, i) => `${P}${slugOf(i + 2)}.json`)];
  const list = await changedFile(`${lines.join('\r\n')}\r\n`);
  const r = runScript(['--mode', 'pr', '--changed-file', list, '--cap', '4', '--stages-dir', dir]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout).include.map((i) => i.slug), ['camino-frances-01', 'camino-frances-02', 'camino-frances-03', 'camino-frances-04']);
  assert.match(r.stderr, /list_stages: pr: capped at 4 stage\(s\); 11 not built in this run: camino-frances-05/);
});

test('--cap and --changed-file belong to pr mode: elsewhere they are ignored, with a note', async () => {
  const dir = await folder(stageFiles(1, 2, 3));
  const list = await changedFile('');
  const r = cli(['--mode', 'all', '--cap', '1', '--changed-file', list], { stagesDir: dir });
  assert.equal(r.code, 0);
  assert.equal(JSON.parse(r.stdout).count, 3);
  assert.match(r.stderr, /--changed-file only applies to --mode pr/);
  assert.match(r.stderr, /--cap only applies to --mode pr/);
});

test('--only through the script narrows the plan, and a typo fails it', async () => {
  const dir = await folder(stageFiles(1, 2, 3));
  const some = runScript(['--mode', 'all', '--only', 'camino-frances-03,camino-frances-01', '--stages-dir', dir]);
  assert.equal(some.status, 0, some.stderr);
  assert.deepEqual(JSON.parse(some.stdout).include.map((i) => i.slug), ['camino-frances-01', 'camino-frances-03']);
  const typo = runScript(['--mode', 'all', '--only', 'camino-frances-3', '--stages-dir', dir]);
  assert.equal(typo.status, 2);
  assert.equal(typo.stdout, '');
  assert.match(typo.stderr, /unknown stage slug\(s\): camino-frances-3/);
});

test('usage errors and broken stage files exit 2 with a message and print no JSON', async () => {
  const dir = await folder(stageFiles(1));
  const broken = await folder({ 'camino-frances-01.json': '{' });
  const cases = [
    [['--stages-dir', dir], /--mode must be one of pr, all, publish/],
    [['--mode', 'everything', '--stages-dir', dir], /--mode must be one of/],
    [['--mode', 'pr', '--stages-dir', dir], /--mode pr needs --changed-file/],
    [['--mode', 'pr', '--changed-file', join(dir, 'no-such-list.txt'), '--stages-dir', dir], /cannot read the changed-file list/],
    [['--mode', 'all', '--cap', '0', '--stages-dir', dir], /--cap must be a whole number/],
    [['--mode', 'all', '--cap', 'many', '--stages-dir', dir], /--cap must be a whole number/],
    [['--mode', 'all', '--only', 'a;b', '--stages-dir', dir], /not a stage slug/],
    [['--mode', 'all', '--nonsense', '--stages-dir', dir], /^list_stages: /],
    [['--mode', 'all', 'extra', '--stages-dir', dir], /^list_stages: /],
    [['--mode', 'all', '--stages-dir', broken], /1 problem\(s\) in the stage files/],
    [['--mode', 'all', '--stages-dir', join(dir, 'missing')], /cannot read the stages folder/],
  ];
  for (const [args, pattern] of cases) {
    const r = runScript(args);
    assert.equal(r.status, 2, `${args.join(' ')}: exit ${r.status}`);
    assert.equal(r.stdout, '', args.join(' '));
    assert.match(r.stderr, pattern, args.join(' '));
  }
  assert.equal(runScript(['--help']).status, 0);
});

test('the stage files in this repository can all be built, and the canary is calibrated', () => {
  const files = readdirSync(join(root, 'stages')).filter((f) => f.endsWith('.json'));
  const all = cli(['--mode', 'all']);
  assert.equal(all.code, 0, all.stderr);
  const plan = JSON.parse(all.stdout);
  assert.equal(plan.count, files.length);
  assert.ok(plan.include.some((i) => i.slug === CANARY), `${CANARY} must exist`);
  for (const i of plan.include) assert.ok(existsSync(join(root, i.stage)), `${i.stage} exists`);
  const publish = JSON.parse(cli(['--mode', 'publish']).stdout);
  assert.ok(publish.include.some((i) => i.slug === CANARY), `${CANARY} has a quality band`);
  assert.ok(publish.count <= plan.count);
});

// ---- the workflow: rules that must survive future edits ----------------------------------------

const workflow = readFileSync(join(repo, '.github', 'workflows', 'offline-maps.yml'), 'utf8');
const code = workflow.split('\n').filter((line) => !/^\s*#/.test(line)).join('\n'); // without comment lines
const indentOf = (line) => line.length - line.trimStart().length;

// The text of each job (a key at two spaces under "jobs:").
function jobsOf(text) {
  const jobs = {};
  let current = null;
  let inJobs = false;
  for (const line of text.split('\n')) {
    if (/^jobs:\s*$/.test(line)) { inJobs = true; continue; }
    if (!inJobs) continue;
    const key = /^ {2}([a-z][a-z0-9_-]*):\s*$/.exec(line);
    if (key) { current = key[1]; jobs[current] = []; continue; }
    if (current) jobs[current].push(line);
  }
  return Object.fromEntries(Object.entries(jobs).map(([name, lines]) => [name, lines.join('\n')]));
}
// The steps of a job: each starts at a "- " line of the first step's indentation.
function stepsOf(job) {
  const lines = job.split('\n');
  const first = lines.findIndex((l) => /^\s*- (uses|name|id|run):/.test(l));
  const indent = indentOf(lines[first]);
  const steps = [];
  for (const line of lines.slice(first)) {
    if (indentOf(line) === indent && line.trimStart().startsWith('- ')) steps.push([]);
    steps[steps.length - 1].push(line);
  }
  return steps.map((s) => s.join('\n'));
}

test('workflow: no pack file is named anywhere, and every artifact path is a JSON file (public repository)', () => {
  assert.doesNotMatch(code, /pmtiles/i);
  const uploads = Object.values(jobsOf(code)).flatMap((job) => stepsOf(job)).filter((s) => s.includes('actions/upload-artifact@'));
  assert.equal(uploads.length, 2, 'the build job and the publish job upload their reports');
  for (const step of uploads) {
    const paths = [...step.matchAll(/tools\/offline-maps\/\S+/g)].map((m) => m[0]);
    assert.ok(paths.length > 0, 'an upload step lists its paths');
    for (const p of paths) assert.match(p, /\.json$/, `${p} must be JSON`);
    assert.match(step, /name: offline-pack-reports-\$\{\{ matrix\.slug \}\}/);
  }
});

test('workflow: secret values live in one step of the publish job, which runs in the pack-publish environment', () => {
  const jobs = jobsOf(code);
  assert.deepEqual(Object.keys(jobs), ['plan', 'build', 'publish']);
  assert.doesNotMatch(code.slice(0, code.indexOf('\njobs:')), /secrets\./, 'no secret at workflow level');
  for (const name of ['plan', 'build']) assert.doesNotMatch(jobs[name], /secrets\./, `${name} must not see a secret`);
  assert.match(jobs.publish, /\n {4}environment: pack-publish\n/);
  // Two steps name a secret. The first step of the job only asks whether the Supabase secrets are set (a boolean, so a
  // missing secret stops the job in seconds, not after the build); the value goes to the publishing step and nowhere else.
  const steps = stepsOf(jobs.publish);
  const withSecrets = steps.filter((s) => s.includes('secrets.'));
  assert.equal(withSecrets.length, 2);
  const [check, publishStep] = withSecrets;
  assert.equal(steps[0], check, 'the secret check is the first step of the job, before any download or build');
  const asked = [...check.matchAll(/secrets\.[A-Z0-9_]+(.{0,6})/g)];
  assert.ok(asked.length >= 2, 'the check asks about both Supabase secrets');
  for (const m of asked) assert.match(m[1], /^ != ''/, `${m[0]} is only compared with '', never passed on`);
  assert.doesNotMatch(check, /publish_pack|checkout|build-offline-pack/);
  assert.match(publishStep, /scripts\/publish_pack\.mjs/);
  assert.match(jobs.publish, /route-fallback: deny/);
  assert.match(jobs.publish, /ocean-fallback: deny/);
  assert.match(jobs.publish, /publishing: 'true'/);
  // the measurement build may fall back, for the route and for the sea of a coastal stage; the publish build never does
  assert.match(jobs.build, /route-fallback: allow/);
  assert.match(jobs.build, /ocean-fallback: allow/);
  assert.doesNotMatch(jobs.build, /ocean-fallback: deny/);
});

test('workflow: a publish job without its Supabase secrets stops at once, red, with the place to add them (never green with nothing uploaded)', async () => {
  const jobs = jobsOf(code);
  // Nothing in the publish job may turn "no secrets" into a dry run that ends green.
  assert.doesNotMatch(jobs.publish, /--dry-run/);
  assert.doesNotMatch(jobs.publish, /\bexit 0\b/);
  // Run the real script of the check step, as GitHub does (bash -eo pipefail), for each way the secrets can be set.
  const check = stepsOf(jobs.publish)[0];
  assert.match(check, /HAVE_SUPABASE_URL: \$\{\{ secrets\.SUPABASE_URL != '' \}\}/);
  assert.match(check, /HAVE_SUPABASE_SERVICE_ROLE_KEY: \$\{\{ secrets\.SUPABASE_SERVICE_ROLE_KEY != '' \}\}/);
  const lines = check.split('\n');
  const at = lines.findIndex((l) => /^\s*run: \|\s*$/.test(l));
  assert.ok(at >= 0, 'the check has a run block');
  const indent = indentOf(lines[at + 1]);
  const script = lines.slice(at + 1).filter((l) => l.trim() === '' || indentOf(l) >= indent).map((l) => l.slice(indent)).join('\n');
  const dir = await mkdtemp(join(tmpdir(), 'secret-check-'));
  try {
    const file = join(dir, 'check.sh');
    const summary = join(dir, 'summary.md');
    await writeFile(file, `${script}\n`);
    const run = (url, key) => spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', file], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH, SLUG: 'camino-frances-01', GITHUB_STEP_SUMMARY: summary, HAVE_SUPABASE_URL: url, HAVE_SUPABASE_SERVICE_ROLE_KEY: key },
    });
    for (const [url, key] of [['false', 'false'], ['true', 'false'], ['false', 'true'], ['', '']]) {
      const r = run(url, key);
      const how = `url=${JSON.stringify(url)} key=${JSON.stringify(key)}`;
      assert.equal(r.status, 1, `${how}: the job must stop (stderr: ${r.stderr})`);
      assert.match(r.stdout, /^::error title=publish secrets missing::camino-frances-01: nothing can be published/m, how);
      assert.match(r.stdout, /SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/, how);
      assert.match(r.stdout, /GitHub Environment pack-publish/, `${how}: says where to add the secrets`);
    }
    assert.match(readFileSync(summary, 'utf8'), /camino-frances-01: nothing can be published/, 'the run page says it too');
    const ok = run('true', 'true');
    assert.equal(ok.status, 0, `both secrets set: the job goes on (stdout: ${ok.stdout}, stderr: ${ok.stderr})`);
    assert.equal(ok.stdout, '', 'and says nothing');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('workflow: the matrices are independent, capped, and skipped when there is nothing to run', () => {
  const jobs = jobsOf(code);
  for (const [name, parallel] of [['build', 6], ['publish', 2]]) {
    assert.match(jobs[name], /\n {6}fail-fast: false/, name);
    assert.match(jobs[name], new RegExp(`\\n {6}max-parallel: ${parallel}\\b`), name);
    assert.match(jobs[name], /\n {6}matrix: \$\{\{ fromJson\(needs\.plan\.outputs\.matrix\) \}\}/, name);
    assert.match(jobs[name], /\n {4}if: needs\.plan\.outputs\.count != '0' && /, name);
    // A job-level concurrency group is shared by every leg: it must name the stage.
    assert.match(jobs[name], /group: offline-maps-(build|publish)-[^\n]*\$\{\{ matrix\.slug \}\}/, name);
    for (const key of ['STAGE: ${{ matrix.stage }}', 'SLUG: ${{ matrix.slug }}', 'PACK: ${{ matrix.pack }}']) assert.ok(jobs[name].includes(key), `${name} has ${key}`);
  }
  assert.match(jobs.publish, /cancel-in-progress: false/);
});

test('workflow: only the canary gets the corridor measurements and the size report', () => {
  const steps = stepsOf(jobsOf(code).build);
  for (const name of ['Measure other corridor widths and zooms', 'Size report']) {
    const step = steps.find((s) => s.includes(`name: ${name}`));
    assert.ok(step, name);
    assert.match(step, /if: .*matrix\.slug == 'camino-frances-01'/, name);
  }
});

test('workflow: the stages input is validated through the environment before it is used', () => {
  assert.match(workflow, /stages:\n {8}description: [^\n]*\n {8}type: string\n {8}default: 'all'/);
  const plan = stepsOf(jobsOf(code).plan).find((s) => s.includes('id: plan'));
  assert.match(plan, /STAGES: \$\{\{ inputs\.stages \|\| 'all' \}\}/);
  assert.match(plan, /\[\[ "\$STAGES" =~ \^\[a-z0-9,-\]\+\$ \]\]/);
  assert.doesNotMatch(plan.split('run: |')[1], /\$\{\{/, 'no expression inside the script text');
});
