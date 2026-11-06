// Turn the numbers of ONE real CI build into the gates of a stage file.
//
//   node scripts/calibrate_stage.mjs stages/camino-frances-02.json \
//        --manifest dist/camino-frances-02-3km-z15.json \
//        --report dist/render/camino-frances-02-3km-z15.report.json \
//        [--dry-run] [--recalibrate | --force-keep-existing]
//
// A new stage file starts in measure mode: no "quality" band and render_checks whose min_features /
// min_labels are empty. After the first real build this writes
//   - "quality": a band of 0.6x to 1.6x of the measured size and tile count, and the standard layers the pack has
//   - for every render_check the report measured (matched by name AND coordinates): min_features of 40 percent of
//     what the view rendered, min_labels of 1 for place / peak labels that were drawn
// and prints a table of every number next to the value it came from. Procedure and rationale: docs/calibration.md.
//
// It refuses (exit 1, nothing written) when the build must not be a baseline: route from the hand-drawn
// fallback, render report not ok or with errors or blocked requests, an empty pack or view, a pack that stops
// below the requested zoom, a report that belongs to another build, a manifest of another stage. There is no flag
// to override a refusal: fix the build, rebuild, calibrate from the new run.
//
// Numbers that are already in the stage file are never changed silently:
//   default              fills only what is empty. Existing numbers are kept. If one of them contradicts this build
//                        (a floor above what the view rendered, a band that does not hold the pack) nothing is
//                        written and the exit code is 1, because CI would fail on it: that is what happened to the
//                        guessed floors of stage 1.
//   --recalibrate        replaces the numbers this tool derives (band, floors) with new ones, prints old -> new and
//                        flags every floor that goes DOWN. Floors for other layers and the policy keys of the band
//                        (max_change_ratio, max_osm_age_days) stay as they are.
//   --force-keep-existing  keeps a contradicted number anyway (exit 0) and still fills what is empty.
//   --dry-run            prints the table and writes nothing.
//
// Exit codes: 0 done (or nothing to change), 1 refused / contradicted / unreadable input, 2 wrong usage.
// Only the values being set are written into the file's text: every other byte (key order, \u escapes, 3.0,
// line endings) stays as it was, and running it twice changes nothing.
import { readFile, writeFile, rename } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { applyPlan, planCalibration, refusalReasons } from './lib/calibrate.mjs';

const MB = 1024 * 1024;
const USAGE = [
  'usage: calibrate_stage.mjs <stage.json> --manifest <dist/pack.json> --report <dist/render/pack.report.json>',
  '                           [--dry-run] [--recalibrate | --force-keep-existing]',
].join('\n');

const fail = (message, code = 1) => {
  console.error(`calibrate_stage: ${message}`);
  process.exit(code);
};

let args;
try {
  args = parseArgs({
    allowPositionals: true,
    options: {
      manifest: { type: 'string' },
      report: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      recalibrate: { type: 'boolean', default: false },
      'force-keep-existing': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
} catch (e) {
  fail(`${e.message}\n${USAGE}`, 2);
}
const { values, positionals } = args;
if (values.help) {
  console.log(USAGE);
  process.exit(0);
}
if (positionals.length !== 1 || !values.manifest || !values.report) fail(`a stage file, --manifest and --report are required\n${USAGE}`, 2);
if (values.recalibrate && values['force-keep-existing']) {
  fail('--recalibrate replaces existing numbers and --force-keep-existing keeps them: pick one.', 2);
}
const stagePath = positionals[0];
const dryRun = values['dry-run'];

async function readJson(path, what) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (e) {
    fail(`cannot read the ${what} ${path} (${e.code ?? e.message}).`);
  }
  try {
    return { text, json: JSON.parse(text) };
  } catch (e) {
    fail(`the ${what} ${path} is not valid JSON: ${e.message}`);
  }
  return undefined;
}

const stageFile = await readJson(stagePath, 'stage file');
const manifest = (await readJson(values.manifest, 'manifest')).json;
const report = (await readJson(values.report, 'render report')).json;
const stage = stageFile.json;
for (const [what, v] of [['stage file', stage], ['manifest', manifest], ['render report', report]]) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) fail(`the ${what} must hold a JSON object.`);
}

// Is this build of this stage? 32 stage files and 32 manifests are easy to mix up.
if (manifest.slug !== stage.slug) {
  fail(`the manifest is for stage '${manifest.slug}' but ${stagePath} is stage '${stage.slug}'. Use the manifest and report of the same stage.`);
}
if (stage.stage_id && manifest.stage_id && stage.stage_id !== manifest.stage_id) {
  fail(`the manifest was built for stage_id ${manifest.stage_id} but ${stagePath} now says ${stage.stage_id}: the stage file changed after the build.`);
}

const why = refusalReasons(manifest, report);
if (why.length) {
  fail([
    `refusing to use ${manifest.file ?? values.manifest} as a baseline:`,
    ...why.map((w) => `  - ${w}`),
    'Nothing was changed. Fix the cause, rebuild, and calibrate from the new run. There is no flag to override this.',
  ].join('\n'));
}

const plan = planCalibration({ stage, manifest, report, recalibrate: values.recalibrate });

// ---- print -------------------------------------------------------------------------------------
function table(rows) {
  const head = ['field', 'measured', 'existing', 'proposed', 'result'];
  const cells = [head, ...rows.map((r) => [r.field, r.measured, r.existing, r.proposed, r.result])];
  const widths = head.map((_, c) => Math.max(...cells.map((row) => row[c].length)));
  return cells.map((row) => `  ${row.map((cell, c) => (c === row.length - 1 ? cell : cell.padEnd(widths[c]))).join('  ')}`).join('\n');
}

const mode = values.recalibrate ? 'recalibrate: replace the numbers this tool derives (old -> new)' : 'fill what is empty, keep what is there';
console.log(`Stage ${stage.slug} (${stagePath}), from ${manifest.file ?? values.manifest}`);
console.log(`  pack    ${(manifest.size_bytes / MB).toFixed(2)} MB, ${manifest.tiles} tiles, z${manifest.pack_min_zoom ?? '?'} to z${manifest.pack_max_zoom ?? '?'}, route from ${manifest.route_source}, OSM data of ${manifest.osm_timestamp ?? 'unknown date'}`);
const measured = report.views.length - (report.views[0]?.name === 'overview' ? 1 : 0);
const phases = Array.isArray(report.device_offline?.views) ? 'in two phases (network blocked, device offline)' : 'with the network blocked only';
console.log(`  render  ok, no errors, no request left the device, ${measured} view(s) measured ${phases}`);
console.log(`  mode    ${mode}${dryRun ? ' (dry run)' : ''}`);
console.log('\nquality band');
console.log(table(plan.band));
for (const v of plan.views) {
  if (v.status !== 'matched') {
    console.log(`\nview "${v.name}": NOT calibrated, ${v.reason}`);
    continue;
  }
  console.log(`\nview "${v.name}" at ${v.at.join(', ')}`);
  console.log(v.rows.length ? table(v.rows) : '  nothing measured that a floor is made for');
}
for (const name of plan.unusedReportViews) console.log(`\nnote: the report has a view "${name}" that the stage file does not list (ignored).`);
if (plan.warnings.length) console.log(`\n${plan.warnings.map((w) => `warning: ${w}`).join('\n')}`);

const rows = [...plan.band, ...plan.views.flatMap((v) => v.rows)];
const lowered = rows.filter((r) => r.result.includes('LOWERED')).length;
const c = plan.counts;
const skipped = plan.views.filter((v) => v.status !== 'matched').length;
console.log(`\n${c.set} set, ${c.replaced} replaced${lowered ? ` (${lowered} LOWERED)` : ''}, ${c.kept} kept, ${c.same} already equal, ${c.conflict} contradicted by this build${skipped ? `, ${skipped} view(s) NOT calibrated` : ''}`);

// ---- decide ------------------------------------------------------------------------------------
if (plan.conflicts.length && !values['force-keep-existing']) {
  fail([
    `${plan.conflicts.length} existing number(s) in ${stagePath} are contradicted by this build, so CI would fail on them:`,
    ...plan.conflicts.map((x) => `  - ${x}`),
    'Nothing was written.',
    ...(values.recalibrate
      ? ['The numbers above are not derived by this tool: fix them by hand, or remove them and run again.']
      : [
        'Either --recalibrate (replace the existing floors and band with ones derived from this build: it prints old -> new and flags every floor that goes down),',
        'or --force-keep-existing (keep them anyway, only when you know why this build differs).',
      ]),
  ].join('\n'));
}
if (plan.conflicts.length) console.log(`kept anyway (--force-keep-existing): ${plan.conflicts.length} number(s) that CI will reject unless the build changes.`);

if (!plan.changed) {
  console.log('Nothing to change: the stage file already holds these numbers.');
  process.exit(0);
}
let text;
try {
  text = applyPlan(stageFile.text, plan);
} catch (e) {
  fail(e.message);
}
if (dryRun) {
  console.log('Dry run: nothing written.');
  process.exit(0);
}
const tmp = `${stagePath}.${process.pid}.tmp`;
await writeFile(tmp, text);
await rename(tmp, stagePath);
console.log(`Wrote ${stagePath}. Review it (git diff), commit it, then re-run CI: it must be green before this stage is published.`);
if (skipped) console.log(`${skipped} view(s) were not calibrated and still have no floors: after the CI re-run, calibrate again from its report.`);
