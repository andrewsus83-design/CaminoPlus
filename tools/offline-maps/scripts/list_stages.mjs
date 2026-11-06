// Which stages does the offline-maps workflow build or publish? The "plan" job runs this and hands
// the result to the build and publish jobs as their matrix.
//
//   node scripts/list_stages.mjs --mode pr|all|publish
//        [--changed-file <file>] [--cap 12] [--only all|slug,slug] [--stages-dir <dir>]
//
// Prints exactly one line of JSON on stdout (the matrix) and nothing else:
//   {"include":[{"stage":"stages/camino-frances-01.json","slug":"camino-frances-01","pack":"camino-frances-01-3km-z15"}],"count":1}
// sorted by stage number, then slug. Notes for people (a cap that cut the list, a stage that was left
// out) go to stderr. Exit code 0 = planned (an empty plan is fine: {"include":[],"count":0}),
// 2 = usage error or a stage file that cannot be built, 1 = a bug in this script.
//
// Modes
//   pr       The stage files a pull request changed, plus the canary (camino-frances-01) when the
//            pull request touched what every build runs on. --changed-file holds one repo-relative
//            path per line, the way `git diff --name-only` prints it. Only
//            tools/offline-maps/stages/<slug>.json counts as a stage file: the .route.geojson next
//            to it and everything under catalog/ do not. The canary is added when any other file under
//            tools/offline-maps (outside stages/ and catalog/), .github/workflows/offline-maps.yml or
//            .github/actions/build-offline-pack/ changed. At most --cap stages (default 12);
//            the canary always stays in.
//   all      Every stage file (manual runs).
//   publish  The stage files with a non-empty "quality" band. A stage without one can never be
//            published (check_pack.mjs and publish_pack.mjs refuse it), so it is never planned here.
//
// --only narrows any mode to the listed slugs (the workflow's "stages" input); "all" means no
// narrowing. An unknown slug is an error, so a typo in a manual run fails in the plan job instead of
// quietly building nothing. --cap and --changed-file belong to pr mode; elsewhere they are ignored
// (with a note). --stages-dir is for tests and dry runs; the output paths stay "stages/<file>".
//
// Every stage file is checked whichever mode runs, because its values end up in file names, an
// artifact name and the cache key of the matrix jobs: the slug is the file name, stage_number a whole
// number, buffer_km and maxzoom plain numbers (the pack is <slug>-<buffer_km>km-z<maxzoom>, spelled the
// way build_stage.sh spells it), osm_extracts at least one URL. One broken file fails the plan, with
// every problem listed.
import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export const CANARY = 'camino-frances-01';
export const DEFAULT_CAP = 12;
export const MODES = ['pr', 'all', 'publish'];
export const DEFAULT_STAGES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'stages');

const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const STAGE_FILE = /^[a-z0-9][a-z0-9-]*\.json$/;
const PACK = /^[a-z0-9][a-z0-9.-]*$/;
const CHANGED_STAGE = /^tools\/offline-maps\/stages\/([^/]+\.json)$/;
const NOT_A_BUILD_INPUT = /^tools\/offline-maps\/(stages|catalog)\//;
const BUILD_INPUTS = [
  /^tools\/offline-maps\//,
  /^\.github\/workflows\/offline-maps\.yml$/,
  /^\.github\/actions\/build-offline-pack\//,
];

const USAGE = 'usage: list_stages.mjs --mode pr|all|publish [--changed-file <file>] [--cap 12] [--only all|slug,slug] [--stages-dir <dir>]';

/** A problem the caller can fix (bad flag, bad stage file). The CLI exits 2 for these. */
export class PlanError extends Error {}

// Text that comes from a file or a flag is printed into CI logs: no control characters, so it cannot
// start a new log line (and with it a "::" workflow command), and not too long.
const safe = (text) => String(text).replace(/[\u0000-\u001f\u007f]/g, '?').slice(0, 200);
const bySequence = (a, b) => a.number - b.number || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
const names = (stages) => [...stages].sort(bySequence).map((s) => s.slug).join(', ');

/** The "quality" band that makes a stage publishable: a non-empty object (see scripts/lib/quality.mjs). */
export const isCalibrated = (quality) => (
  quality !== null && typeof quality === 'object' && !Array.isArray(quality) && Object.keys(quality).length > 0
);

/** Raw text of a top-level number in the stage file ("3" or "3.0"): JSON.parse cannot tell them apart. */
const rawNumber = (text, key) => new RegExp(`"${key}"\\s*:\\s*([^\\s,}\\]]+)`).exec(text)?.[1];

/**
 * Read and check every stage file in a folder.
 * @returns {{file: string, stage: string, slug: string, number: number, pack: string, calibrated: boolean}[]}
 */
export function readStages(dir) {
  let files;
  try {
    files = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith('.json')).map((e) => e.name).sort();
  } catch (err) {
    throw new PlanError(`cannot read the stages folder: ${safe(err.message)}`);
  }
  const stages = [];
  const problems = [];
  for (const file of files) {
    const where = `stages/${safe(file)}`;
    if (!STAGE_FILE.test(file)) {
      problems.push(`${where}: a stage file is named <slug>.json with a lower-case slug (letters, digits, hyphens)`);
      continue;
    }
    let text;
    let data;
    try {
      text = readFileSync(join(dir, file), 'utf8').replace(/^﻿/, '');
      data = JSON.parse(text);
    } catch (err) {
      problems.push(`${where}: not valid JSON (${safe(err.message)})`);
      continue;
    }
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      problems.push(`${where}: the file must hold one JSON object`);
      continue;
    }
    const slug = file.slice(0, -'.json'.length);
    const bad = [];
    if (data.slug !== slug) {
      bad.push(`"slug" is ${safe(JSON.stringify(data.slug))} but must be ${slug}, the file name (check_pack.mjs and publish_pack.mjs find the stage file by slug)`);
    }
    if (!Number.isInteger(data.stage_number) || data.stage_number < 1) bad.push('"stage_number" must be a whole number, 1 or more');
    if (typeof data.buffer_km !== 'number' || !Number.isFinite(data.buffer_km) || data.buffer_km <= 0) bad.push('"buffer_km" must be a number above 0');
    if (!Number.isInteger(data.maxzoom) || data.maxzoom < 0 || data.maxzoom > 22) bad.push('"maxzoom" must be a whole number from 0 to 22');
    for (const key of ['buffer_km', 'maxzoom']) {
      const raw = rawNumber(text, key);
      if (typeof data[key] === 'number' && raw !== undefined && raw !== String(data[key])) {
        bad.push(`"${key}" is written ${safe(raw)}: build_stage.sh names the pack from that text, so write ${data[key]}`);
      }
    }
    const extracts = data.osm_extracts;
    if (!Array.isArray(extracts) || extracts.length === 0 || !extracts.every((u) => typeof u === 'string' && /^https?:\/\/\S+$/.test(u))) {
      bad.push('"osm_extracts" must list at least one http(s) URL (the extract cache key is built from them)');
    }
    const pack = `${slug}-${data.buffer_km}km-z${data.maxzoom}`;
    if (!bad.length && !PACK.test(pack)) bad.push(`the pack name ${safe(pack)} is not a plain file name`);
    if (bad.length) {
      problems.push(...bad.map((b) => `${where}: ${b}`));
      continue;
    }
    stages.push({ file, stage: `stages/${file}`, slug, number: data.stage_number, pack, calibrated: isCalibrated(data.quality) });
  }
  if (problems.length) throw new PlanError(`${problems.length} problem(s) in the stage files:\n  - ${problems.join('\n  - ')}`);
  return stages;
}

/** Lines of a changed-file list (git diff --name-only output): trimmed, "./" dropped, blanks skipped. */
export const parseChangedList = (text) => text.split('\n').map((line) => line.trim().replace(/^\.\//, '')).filter(Boolean);

/** What a list of changed repo paths means for the build. */
export function classifyChanges(changed) {
  const stageFiles = new Set();
  let touchesBuild = false;
  for (const path of changed) {
    const stage = CHANGED_STAGE.exec(path);
    if (stage) stageFiles.add(stage[1]);
    else if (!NOT_A_BUILD_INPUT.test(path) && BUILD_INPUTS.some((rx) => rx.test(path))) touchesBuild = true;
  }
  return { stageFiles, touchesBuild };
}

/** The workflow's "stages" input: null for "all", otherwise the list of slugs. */
export function parseOnly(value) {
  if (value === undefined || value === null) return null;
  const slugs = [...new Set(String(value).split(',').map((s) => s.trim()).filter(Boolean))];
  if (slugs.length === 0) throw new PlanError('--only needs "all" or at least one stage slug');
  if (slugs.includes('all')) {
    if (slugs.length > 1) throw new PlanError('--only: "all" cannot be combined with slugs');
    return null;
  }
  const bad = slugs.filter((s) => !SLUG.test(s));
  if (bad.length) throw new PlanError(`--only: not a stage slug: ${bad.map(safe).join(', ')} (lower-case letters, digits, hyphens)`);
  return slugs;
}

/**
 * The plan, from data only (no files, no environment, no clock).
 * @param {object} p
 * @param {ReturnType<typeof readStages>} p.stages every stage file there is
 * @param {'pr'|'all'|'publish'} p.mode
 * @param {string[]} [p.changed] repo-relative paths changed by the pull request (pr mode)
 * @param {number} [p.cap] most stages in pr mode, the canary included
 * @param {string[]|null} [p.only] slugs to narrow to, null for all
 * @returns {{include: {stage: string, slug: string, pack: string}[], count: number, notes: string[]}}
 */
export function planStages({ stages, mode, changed = [], cap = DEFAULT_CAP, only = null }) {
  if (!MODES.includes(mode)) throw new PlanError(`--mode must be one of ${MODES.join(', ')}`);
  const notes = [];
  const bySlug = new Map(stages.map((s) => [s.slug, s]));
  if (only) {
    const unknown = only.filter((slug) => !bySlug.has(slug));
    if (unknown.length) throw new PlanError(`unknown stage slug(s): ${unknown.map(safe).join(', ')} (${stages.length} stage file(s) exist, see tools/offline-maps/stages/)`);
  }
  const wanted = only ? only.map((slug) => bySlug.get(slug)) : stages;

  let picked;
  if (mode === 'all') {
    picked = wanted;
  } else if (mode === 'publish') {
    picked = wanted.filter((s) => s.calibrated);
    const left = wanted.filter((s) => !s.calibrated);
    if (left.length) notes.push(`publish: ${left.length} stage(s) have no quality band and are never published: ${names(left)}`);
  } else {
    const { stageFiles, touchesBuild } = classifyChanges(changed);
    const have = new Set(stages.map((s) => s.file));
    for (const file of [...stageFiles].sort()) {
      if (!have.has(file)) notes.push(`pr: stages/${safe(file)} changed but is not in the stages folder (deleted?): nothing to build`);
    }
    const chosen = new Set(stages.filter((s) => stageFiles.has(s.file)));
    if (touchesBuild) {
      const canary = bySlug.get(CANARY);
      if (canary) chosen.add(canary);
      else notes.push(`pr: build tooling changed but the canary stage ${CANARY} does not exist`);
    }
    picked = wanted.filter((s) => chosen.has(s));
  }
  picked = [...picked].sort(bySequence);

  if (mode === 'pr' && picked.length > cap) {
    const canary = picked.find((s) => s.slug === CANARY);
    const rest = picked.filter((s) => s !== canary);
    const room = canary ? cap - 1 : cap;
    const dropped = rest.slice(room);
    picked = [...(canary ? [canary] : []), ...rest.slice(0, room)].sort(bySequence);
    notes.push(
      `pr: capped at ${cap} stage(s); ${dropped.length} not built in this run: ${names(dropped)}. ` +
      'Run the workflow by hand (Actions, offline-maps, Run workflow, stages=<slugs or all>) to build them.',
    );
  }
  return { include: picked.map(({ stage, slug, pack }) => ({ stage, slug, pack })), count: picked.length, notes };
}

/** The command line. Returns what to print instead of printing, so tests can call it directly. */
export function cli(argv, { stagesDir = DEFAULT_STAGES_DIR } = {}) {
  const fail = (message) => ({ code: 2, stdout: '', stderr: `list_stages: ${message}\n` });
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      allowPositionals: false,
      options: {
        mode: { type: 'string' },
        'changed-file': { type: 'string' },
        cap: { type: 'string' },
        only: { type: 'string' },
        'stages-dir': { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    }));
  } catch (err) {
    return fail(`${safe(err.message)}\n${USAGE}`);
  }
  if (values.help) return { code: 0, stdout: `${USAGE}\n`, stderr: '' };

  try {
    if (!MODES.includes(values.mode)) throw new PlanError(`--mode must be one of ${MODES.join(', ')}\n${USAGE}`);
    const mode = values.mode;
    const notes = [];

    let cap = DEFAULT_CAP;
    if (values.cap !== undefined) {
      if (!/^[1-9][0-9]*$/.test(values.cap)) throw new PlanError(`--cap must be a whole number, 1 or more (got ${safe(values.cap)})`);
      cap = Number(values.cap);
    }

    let changed = [];
    if (mode === 'pr') {
      const file = values['changed-file'];
      if (!file) throw new PlanError('--mode pr needs --changed-file <file with one repo-relative path per line>');
      try {
        changed = parseChangedList(readFileSync(file, 'utf8'));
      } catch (err) {
        throw new PlanError(`cannot read the changed-file list: ${safe(err.message)}`);
      }
    } else {
      if (values['changed-file'] !== undefined) notes.push('--changed-file only applies to --mode pr: ignored');
      if (values.cap !== undefined) notes.push('--cap only applies to --mode pr: ignored');
    }

    const stages = readStages(values['stages-dir'] ?? stagesDir);
    const plan = planStages({ stages, mode, changed, cap, only: parseOnly(values.only) });
    return {
      code: 0,
      stdout: `${JSON.stringify({ include: plan.include, count: plan.count })}\n`,
      stderr: [...notes, ...plan.notes].map((n) => `list_stages: ${n}\n`).join(''),
    };
  } catch (err) {
    if (err instanceof PlanError) return fail(err.message);
    throw err;
  }
}

// Run as a script, not when a test imports the functions above.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const result = cli(process.argv.slice(2));
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.code;
}
