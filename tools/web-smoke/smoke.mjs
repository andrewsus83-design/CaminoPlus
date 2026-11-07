#!/usr/bin/env node
// Web smoke test: opens EVERY screen of the app, in light and dark, signed in and signed out, online and offline, and fails when
// any of them throws, logs a console error, drops a promise, shows an error screen, is blank, or calls a host nobody mocked.
// Then it walks a few paths the way a person would (scenarios.mjs). What it checks, and how to run it: README.md.
//
//   cd mobile && npx expo export --platform web --output-dir ../tools/web-smoke/dist/app
//   cd tools/web-smoke && npm ci && npm run smoke
//
//   --app <dir>          the web export (default dist/app)
//   --concurrency <n>    pages open at once (default 4)
//   --timeout <ms>       limit for one page load or scenario (default 20000)
//   --artifacts <dir>    where a failed check leaves its screenshot, report and trace (default artifacts)
//   --only <text>        run only the checks whose name contains the text (case does not matter)
//   --list               print the routes, the account states that reach them, and the number of checks; run nothing
//   --verbose            also print every check that passed, the allow-listed console errors and the endpoints no fixture answers
//   --trace              record a Playwright trace of every check, keep those of the failed ones (on by default when CI is set)
//   --bail <n>           stop after n failed checks (default 25), so a broken build does not burn the whole time limit
//   --source <dir>       the app directory the routes are read from (default ../../mobile/app); the test of the test uses it
//   --no-scenarios       sweep the routes only
//   SMOKE_SUPABASE_URL   the Supabase URL the export was built with, when it is not the default of mobile/src/lib/config.ts
import { chromium } from 'playwright';
import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveSpa } from './server.mjs';
import { discoverRoutes, PERSONAS } from './routes.mjs';
import { summarize } from './collector.mjs';
import { supabaseUrl } from './fixtures.mjs';
import { runPool, runScenario, sweepRoute, withDeadline } from './harness.mjs';
import { buildTasks, routeName } from './plan.mjs';
import { SCENARIOS } from './scenarios.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const mobile = join(here, '..', '..', 'mobile');

const { values } = parseArgs({
  options: {
    app: { type: 'string', default: join(here, 'dist', 'app') },
    concurrency: { type: 'string', default: '4' },
    timeout: { type: 'string', default: '20000' },
    artifacts: { type: 'string', default: join(here, 'artifacts') },
    only: { type: 'string' },
    list: { type: 'boolean', default: false },
    verbose: { type: 'boolean', default: false },
    trace: { type: 'boolean', default: !!process.env.CI },
    bail: { type: 'string', default: '25' },
    port: { type: 'string' },
    source: { type: 'string', default: join(mobile, 'app') },
    'no-scenarios': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});
if (values.help) { // the comment at the top of this file is the usage text
  const lines = readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1);
  console.log(lines.slice(0, lines.findIndex((l) => !l.startsWith('//'))).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(0);
}
const num = (name, min) => {
  const n = Number(values[name]);
  if (!Number.isInteger(n) || n < min) { console.error(`--${name} must be a whole number of at least ${min}`); process.exit(2); }
  return n;
};
const concurrency = num('concurrency', 1);
const timeout = num('timeout', 1000);
const bail = num('bail', 1);

const started = Date.now();
const seconds = () => ((Date.now() - started) / 1000).toFixed(1);

// 1. what is there to check ------------------------------------------------------------------------------
const { routes, problems } = await discoverRoutes(resolve(values.source));
if (values.list) {
  for (const r of routes) console.log(`${routeName(r).padEnd(52)} ${r.personas.map((p) => PERSONAS[p].label).join(' | ')}`);
}
const tasks = buildTasks({ routes, scenarios: values['no-scenarios'] ? [] : SCENARIOS, only: values.only });
if (values.list) {
  console.log(`\n${routes.length} routes, ${tasks.length} checks (${tasks.filter((t) => t.type === 'route').length} page loads, ${tasks.filter((t) => t.type === 'scenario').length} scenario runs)`);
  process.exit(problems.length ? 1 : 0);
}
if (problems.length) {
  console.error('web-smoke: the routes of the app cannot be swept as they are:\n' + problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}
if (tasks.length === 0) { console.error(`web-smoke: nothing to run${values.only ? ` (no check contains "${values.only}")` : ''}`); process.exit(2); }

// 2. the app and a browser --------------------------------------------------------------------------------
const appDir = resolve(values.app);
if (!(await stat(join(appDir, 'index.html')).catch(() => null))) {
  console.error(`web-smoke: ${appDir}/index.html not found. Make the web export first:\n  cd mobile && npx expo export --platform web --output-dir ../tools/web-smoke/dist/app`);
  process.exit(2);
}
const server = await serveSpa(appDir, { port: values.port ? Number(values.port) : 0 });
const env = {
  origin: server.origin,
  supabaseUrl: supabaseUrl(join(mobile, 'src', 'lib', 'config.ts')),
  timeout,
  artifactsDir: resolve(values.artifacts),
  trace: values.trace,
  endpoints: new Map(),
};
console.log(`web-smoke: ${routes.length} routes, ${tasks.length} checks, ${concurrency} at a time, app served at ${env.origin}, Supabase mocked at ${new URL(env.supabaseUrl).host}`);

const browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });

// 3. run -----------------------------------------------------------------------------------------------------
let failures = 0;
let skipped = 0;
let finished = 0;
const slowest = [];
const results = await runPool(tasks, concurrency, async (task) => {
  if (failures >= bail) { skipped++; return null; }
  const t0 = Date.now();
  const run = task.type === 'route' ? sweepRoute : runScenario;
  const r = await withDeadline(run(browser, env, task), timeout + 20_000, () => ({
    errors: [{ kind: 'timeout', message: `no result after ${((timeout + 20_000) / 1000).toFixed(0)} s: the page is stuck`, stack: '', count: 1 }], ignored: [], blocked: [],
  }));
  const ms = Date.now() - t0;
  slowest.push({ label: task.label, ms });
  if (r.errors.length) failures++;
  finished++;
  if (values.verbose) console.log(`${r.errors.length ? 'FAIL' : 'ok  '}  ${(ms / 1000).toFixed(1).padStart(5)} s  ${task.label}`);
  else process.stdout.write(r.errors.length ? 'F' : '.');
  return { task, ...r };
});
if (!values.verbose) process.stdout.write('\n');
await browser.close();
await server.close();

// 4. report --------------------------------------------------------------------------------------------------
const done = results.filter(Boolean);
const summary = summarize(done.map((r) => ({ task: r.task, errors: r.errors })));
const blockedHosts = new Map();
for (const r of done) for (const b of r.blocked) blockedHosts.set(b.host, (blockedHosts.get(b.host) || 0) + 1);

if (values.verbose) {
  const ignored = new Map();
  for (const r of done) {
    for (const i of r.ignored) {
      const key = `${i.text}${i.at ? ` (${i.at})` : ''}\n      allowed because: ${i.reason}`;
      ignored.set(key, (ignored.get(key) || 0) + 1);
    }
  }
  for (const [what, n] of ignored) console.log(`allow-listed console error, ${n} x: ${what}`);
  for (const [k, n] of [...env.endpoints].sort()) console.log(`no fixture answers ${k} (${n} requests): answered with an empty list`);
  console.log('slowest checks: ' + slowest.sort((a, b) => b.ms - a.ms).slice(0, 5).map((s) => `${(s.ms / 1000).toFixed(1)} s ${s.label}`).join('\n                ').trim());
}
if (summary.failed) {
  console.log('\n' + summary.text + '\n');
  if (blockedHosts.size) console.log(`Hosts the app called that nobody mocked: ${[...blockedHosts].map(([h, n]) => `${h} (${n})`).join(', ')}\n`);
  console.log(`Screenshots, reports${values.trace ? ' and traces' : ''} of the failed checks: ${env.artifactsDir}`);
  if (skipped) console.log(`Stopped after ${failures} failed checks; ${skipped} were not run.`);
  console.log(`web-smoke: FAILED, ${summary.failed} of ${summary.total} checks failed in ${seconds()} s`);
  process.exit(1);
}
const loads = done.filter((r) => r.task.type === 'route').length;
console.log(`web-smoke: OK, ${summary.total} checks in ${seconds()} s (${loads} page loads of ${routes.length} routes in light and dark, online and offline; ${summary.total - loads} scenario runs)`);
process.exit(0);
