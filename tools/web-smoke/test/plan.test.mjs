// The plan: what gets checked. A route nobody checks, or a mode nobody runs, would be a hole in the safety net.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXPECTED_REDIRECTS, SCHEMES, buildTasks, redirectAllowed } from '../plan.mjs';
import { discoverRoutes } from '../routes.mjs';
import { SCENARIOS } from '../scenarios.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const route = (pattern, personas) => ({ pattern, url: pattern, files: [pattern], personas });

test('every route is checked in every account state that reaches it, in light and dark, online and offline, with a full account', () => {
  const tasks = buildTasks({ routes: [route('/', ['out', 'in']), route('/me', ['in'])], scenarios: [] }).filter((t) => t.data === 'full');
  const combos = tasks.map((t) => `${t.route.pattern}|${t.persona}|${t.scheme}|${t.offline ? 'offline' : 'online'}`).sort();
  const want = [];
  for (const [p, personas] of [['/', ['out', 'in']], ['/me', ['in']]]) for (const persona of personas) for (const s of SCHEMES) for (const m of ['online', 'offline']) want.push(`${p}|${persona}|${s}|${m}`);
  assert.deepEqual(combos, want.sort());
});

test('signed-in states are also checked with an empty account (light, online and offline); a signed-out visitor has no account to empty', () => {
  const tasks = buildTasks({ routes: [route('/', ['out', 'new', 'in'])], scenarios: [] }).filter((t) => t.data === 'empty');
  assert.deepEqual(tasks.map((t) => `${t.persona}|${t.scheme}|${t.offline ? 'offline' : 'online'}`).sort(), ['in|light|offline', 'in|light|online', 'new|light|offline', 'new|light|online']);
});

test('a check is named by its route, scheme, mode and account state', () => {
  const tasks = buildTasks({ routes: [route('/settings', ['in'])], scenarios: [] });
  assert.equal(tasks.find((x) => x.scheme === 'dark' && x.offline).label, '/settings  [dark, offline, signed in, with a journey]');
  assert.equal(tasks.find((x) => x.data === 'empty' && !x.offline).label, '/settings  [light, online, signed in, with a journey, empty account]');
});

test('scenarios run in light and dark unless they say otherwise; --only narrows by name', () => {
  const sc = [{ name: 'both', persona: 'in' }, { name: 'light only', persona: 'in', schemes: ['light'], offline: true }];
  const tasks = buildTasks({ routes: [], scenarios: sc });
  assert.deepEqual(tasks.map((t) => `${t.scenario.name}:${t.scheme}:${t.offline}`), ['both:light:false', 'both:dark:false', 'light only:light:true']);
  assert.equal(buildTasks({ routes: [], scenarios: sc, only: 'LIGHT ONLY' }).length, 1);
});

test('the real plan: all routes, all modes, and the scenarios the owner asked for', async () => {
  const { routes } = await discoverRoutes(join(here, '..', '..', '..', 'mobile', 'app'));
  const tasks = buildTasks({ routes, scenarios: SCENARIOS });
  const loads = tasks.filter((t) => t.type === 'route');
  const full = routes.reduce((n, r) => n + r.personas.length, 0) * SCHEMES.length * 2;
  const empty = routes.reduce((n, r) => n + r.personas.filter((p) => p !== 'out').length, 0) * 2;
  assert.equal(loads.length, full + empty);
  for (const mode of [true, false]) for (const scheme of SCHEMES) assert.ok(loads.some((t) => t.offline === mode && t.scheme === scheme), `no page load with offline=${mode} in ${scheme}`);
  for (const persona of ['out', 'new', 'in']) assert.ok(loads.some((t) => t.persona === persona), `no page load signed ${persona}`);
  const names = SCENARIOS.map((s) => s.name).join('\n');
  for (const must of [/Tab bar/, /gear on Me opens Settings/, /switching light and dark/i, /Library: banner/, /gold pen opens \/diary\/new/]) assert.match(names, must);
});

test('redirects on purpose are listed with a reason, and only for the account states named', () => {
  for (const r of EXPECTED_REDIRECTS) assert.ok(r.reason && r.reason.length > 20, `${r.route} needs a reason`);
  assert.equal(redirectAllowed('/', 'out'), true);
  assert.equal(redirectAllowed('/auth-callback', 'in'), true);
  assert.equal(redirectAllowed('/auth-callback', 'out'), false);
  assert.equal(redirectAllowed('/settings', 'in'), false);
});
