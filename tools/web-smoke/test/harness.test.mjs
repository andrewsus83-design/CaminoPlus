// The harness against an app that is built to misbehave: every kind of failure must be reported, and a clean screen must stay clean.
// Needs Chromium (the same one the sweep uses). A missing browser FAILS this test: a harness that cannot run must not look green.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serveSpa } from '../server.mjs';
import { runScenario, sweepRoute } from '../harness.mjs';
import { SUPABASE, fakeExport, task } from './helpers.mjs';

let browser;
let server;
let dir;
let env;
before(async () => {
  dir = await fakeExport();
  server = await serveSpa(dir);
  browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });
  env = { origin: server.origin, supabaseUrl: SUPABASE, timeout: 15_000, endpoints: new Map() };
});
after(async () => {
  await browser?.close();
  await server?.close();
  if (dir) await rm(dir, { recursive: true, force: true });
});

const sweep = (url, over, timeout) => sweepRoute(browser, timeout ? { ...env, timeout } : env, task(url, over));
const kinds = (r) => r.errors.map((e) => e.kind).sort();

test('a clean screen passes in all four modes (light and dark, online and offline)', async () => {
  for (const scheme of ['light', 'dark']) for (const offline of [false, true]) {
    const r = await sweep('/ok', { scheme, offline });
    assert.deepEqual(r.errors, [], `${scheme} ${offline ? 'offline' : 'online'}`);
  }
});

test('a warning and a log are not failures', async () => {
  assert.deepEqual((await sweep('/console-warn')).errors, []);
});

test('an exception thrown by a screen is reported, with its message and stack', async () => {
  const r = await sweep('/throws');
  assert.deepEqual(kinds(r), ['pageerror']);
  assert.match(r.errors[0].message, /boom from a screen/);
  assert.match(r.errors[0].stack, /at /);
});

test('an unhandled promise rejection is reported', async () => {
  const r = await sweep('/rejects');
  assert.ok(r.errors.some((e) => e.kind === 'unhandledrejection' && /dropped promise/.test(e.message)), JSON.stringify(r.errors));
});

test('a console.error is reported', async () => {
  const r = await sweep('/console-error');
  assert.deepEqual(kinds(r), ['console.error']);
  assert.match(r.errors[0].message, /something is wrong in this screen/);
});

test('a blank page and an error screen are reported', async () => {
  assert.deepEqual(kinds(await sweep('/blank', {}, 2500)), ['blank']);
  const e = await sweep('/error-screen');
  assert.deepEqual(kinds(e), ['error-screen']);
});

test('a request to a host nobody mocked is refused, recorded and reported (http and websocket)', async () => {
  const http = await sweep('/third-party');
  const stranger = http.errors.find((e) => e.kind === 'unexpected-host'); // the browser also logs the refused request as a console error
  assert.ok(stranger, JSON.stringify(http.errors));
  assert.match(stranger.message, /tracker\.example\.test/);
  assert.deepEqual(http.blocked.map((b) => b.host), ['tracker.example.test']);
  const ws = await sweep('/third-party-socket');
  assert.deepEqual(kinds(ws), ['unexpected-host']);
  assert.match(ws.errors[0].message, /socket\.example\.test/);
});

test('an unexpected host is reported in the offline run as well', async () => {
  const r = await sweep('/third-party', { offline: true });
  assert.ok(r.errors.some((e) => e.kind === 'unexpected-host'), JSON.stringify(r.errors));
});

test('a file the app asks for that is not in the export is reported (404, not index.html)', async () => {
  const r = await sweep('/missing-file');
  assert.ok(r.errors.some((e) => e.kind === 'bad-response' && /missing\.js .* 404/.test(e.message)), JSON.stringify(r.errors));
});

test('a screen that ends on another address is reported unless it is listed as a redirect on purpose', async () => {
  const r = await sweep('/redirects');
  assert.deepEqual(kinds(r), ['wrong-url']);
  assert.match(r.errors[0].message, /ended on \/elsewhere/);
  assert.deepEqual((await sweep('/redirects', { route: { pattern: '/', url: '/redirects' } })).errors.map((e) => e.kind), [], 'the entry point may redirect');
});

test('the project is answered from the fixtures online, and out of reach offline', async () => {
  assert.deepEqual((await sweep('/supabase')).errors, [], 'online');
  const off = await sweep('/supabase', { offline: true });
  assert.ok(off.errors.some((e) => e.kind === 'pageerror' || e.kind === 'unhandledrejection'), `offline, the request must fail and the page must notice: ${JSON.stringify(off.errors)}`);
});

test('a scenario fails when a step cannot be done, and says at which step', async () => {
  const bad = await runScenario(browser, env, { ...task('/ok'), type: 'scenario', scenario: { name: 'x', persona: 'out', run: async ({ go, step, page }) => { step('open the page'); await go('/ok'); step('tap a button that is not there'); await page.getByRole('button', { name: 'Nope' }).click({ timeout: 500 }); } } });
  assert.deepEqual(kinds(bad), ['scenario']);
  assert.match(bad.errors[0].message, /at step: tap a button that is not there/);
  const good = await runScenario(browser, env, { ...task('/ok'), type: 'scenario', scenario: { name: 'y', persona: 'out', run: async ({ go }) => { await go('/ok'); } } });
  assert.deepEqual(good.errors, []);
});

test('a scenario also fails on what the page does while it runs', async () => {
  const r = await runScenario(browser, env, { ...task('/throws'), type: 'scenario', scenario: { name: 'z', persona: 'out', run: async ({ go }) => { await go('/throws'); } } });
  assert.ok(r.errors.some((e) => e.kind === 'pageerror'), JSON.stringify(r.errors));
});
