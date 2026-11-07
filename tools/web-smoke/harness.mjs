// The machinery behind smoke.mjs: one browser context per check, the network closed off, the page watched, the result
// handed to the Collector. Kept apart from smoke.mjs so test/harness.test.mjs can run it against a tiny app that is
// built to misbehave and prove that every kind of failure is reported.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Collector, formatFailure } from './collector.mjs';
import * as fx from './fixtures.mjs';
import { redirectAllowed } from './plan.mjs';

export const VIEWPORT = { width: 390, height: 844 };

// ---------------------------------------------------------------- scripts that run inside the page

/** Before the app starts: put the saved state on the phone (localStorage), but never over something the app wrote itself. */
const seedStorage = (pairs) => {
  try { for (const [k, v] of pairs) if (localStorage.getItem(k) === null) localStorage.setItem(k, v); } catch { /* storage blocked: the app runs without it */ }
};

/** Promise rejections nobody handled. Also reported by Chromium as a page error, in some versions; the collector counts each message once. */
const watchRejections = () => {
  const describe = (r) => {
    try {
      if (r instanceof Error) return `${r.name}: ${r.message}`;
      if (typeof r === 'string') return r;
      return JSON.stringify(r) ?? String(r);
    } catch { return String(r); }
  };
  window.addEventListener('unhandledrejection', (e) => {
    try { window.__smokeReport(describe(e.reason), (e.reason && e.reason.stack) || ''); } catch { /* the page is closing */ }
  });
};

/** What the screen shows right now. */
const readScreen = () => ({
  text: document.body.innerText,
  routerError: (document.querySelector('[data-testid="router_error_message"]') || {}).innerText ?? null,
  unmatched: !!document.querySelector('[data-testid="expo-router-unmatched"]'),
});

// ---------------------------------------------------------------- a session

const corsHeaders = (req) => ({
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  // echo what the browser asks for: "*" does not cover the Authorization header
  'access-control-allow-headers': req.headers()['access-control-request-headers'] || '*',
  'access-control-expose-headers': '*',
  'access-control-max-age': '600',
});

/**
 * One isolated browser context with the world faked, and a Collector watching the page.
 *  online : the app's own files come from the local server; the Supabase project is answered from fixtures.mjs; any other host is
 *           refused and recorded.
 *  offline: context.setOffline(true), Supabase refused, and the app's own files are handed over by the test instead of the network
 *           (an offline browser cannot even reach localhost), so the app starts the way it does on a phone with no signal.
 * env: { origin, supabaseUrl, timeout, endpoints?: Map (unmodelled endpoints are counted in it) }
 */
export async function openSession(browser, env, { persona, scheme, offline = false, expiredLogin = false, savedAccount, data = 'full', label = '' }) {
  const collector = new Collector({ offline });
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'Europe/Madrid', colorScheme: scheme });
  if (env.trace) await context.tracing.start({ screenshots: true, snapshots: true, title: label }).catch(() => {});
  const supabaseHost = new URL(env.supabaseUrl).host;

  await context.addInitScript(seedStorage, fx.storageSeed({ persona, scheme, offline, url: env.supabaseUrl, expiredLogin, savedAccount, data }));
  await context.addInitScript(watchRejections);
  await context.exposeFunction('__smokeReport', (message, stack) => collector.rejection(message, stack));

  // Online the app's own files are not intercepted at all; offline every request is.
  await context.route((url) => offline || url.origin !== env.origin, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return route.continue();
    if (url.origin === env.origin) {
      // offline: the files of the app are "on the phone". What the app asks of the network (NetInfo probes its own address with HEAD) fails.
      if (req.method() === 'HEAD') return route.abort('internetdisconnected');
      return route.fulfill({ response: await route.fetch() });
    }
    if (url.host === supabaseHost) {
      if (offline) return route.abort('internetdisconnected');
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders(req) });
      let body = null;
      try { body = req.postData() ? JSON.parse(req.postData()) : null; } catch { /* not JSON */ }
      const r = fx.respond({ method: req.method(), url: req.url(), persona, data, accept: req.headers().accept || '', body });
      if (!r.modelled && env.endpoints) { const k = `${req.method()} ${url.pathname}`; env.endpoints.set(k, (env.endpoints.get(k) || 0) + 1); }
      return route.fulfill({ status: r.status, headers: { ...corsHeaders(req), 'content-type': 'application/json' }, body: r.body === null ? '' : JSON.stringify(r.body) });
    }
    collector.unexpectedHost(req.method(), req.url());
    return route.abort(offline ? 'internetdisconnected' : 'blockedbyclient');
  });
  // Realtime is a WebSocket, which context.route does not see: answer it here, or refuse it.
  await context.routeWebSocket(() => true, (ws) => {
    const u = new URL(ws.url());
    if (u.host !== supabaseHost) { collector.unexpectedHost('WS', ws.url()); ws.close({ code: 1006, reason: 'not mocked' }); return; }
    if (offline) { ws.close({ code: 1006, reason: 'offline' }); return; }
    ws.onMessage((m) => { const reply = fx.realtimeReply(String(m)); if (reply) ws.send(reply); });
  });
  if (offline) await context.setOffline(true);

  const page = await context.newPage();
  page.setDefaultTimeout(env.timeout);
  page.on('pageerror', (e) => collector.pageError(e));
  page.on('console', (m) => collector.console(m.type(), m.text(), m.location()));
  page.on('crash', () => collector.add('crash', 'the page crashed'));
  page.on('response', (r) => { if (r.url().startsWith(env.origin) && r.status() >= 400) collector.badResponse(r.request().method(), r.url(), r.status()); });
  page.on('requestfailed', (r) => { if (r.url().startsWith(env.origin)) collector.requestFailed(r.method(), r.url(), r.failure()?.errorText); });
  return { context, page, collector, persona, scheme, offline, label };
}

/** Ends a session; when it failed, keeps a screenshot, the report and the trace in env.artifactsDir. */
export async function closeSession(s, env, failedWith = null) {
  const errors = failedWith ?? s.collector.errors;
  const failed = errors.length > 0;
  const slug = s.label.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 120) || 'check';
  try {
    if (failed && env.artifactsDir) {
      await mkdir(env.artifactsDir, { recursive: true });
      await s.page.screenshot({ path: join(env.artifactsDir, `${slug}.png`), timeout: 5000 }).catch(() => {});
      await writeFile(join(env.artifactsDir, `${slug}.txt`), formatFailure({ label: s.label }, errors, { max: 50, stackLines: 20 }) + '\n').catch(() => {});
    }
    if (env.trace) await s.context.tracing.stop(failed && env.artifactsDir ? { path: join(env.artifactsDir, `${slug}.trace.zip`) } : undefined).catch(() => {});
  } finally {
    await s.context.close().catch(() => {});
  }
}

// ---------------------------------------------------------------- waiting for a screen to be done, without sleeping

/** Resolves once nothing in the document has changed for `ms` (or after `max`, which is not a failure: an animation may never stop). */
export function domQuiet(page, ms = 250, max = 3000) {
  return page.evaluate(({ ms, max }) => new Promise((resolve) => {
    let timer;
    const done = () => { obs.disconnect(); clearTimeout(timer); clearTimeout(cap); resolve(); };
    const obs = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(done, ms); });
    obs.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    timer = setTimeout(done, ms);
    const cap = setTimeout(done, max);
  }), { ms, max });
}

/** The page has loaded, drawn something, stopped asking for files, and stopped changing. */
export async function settle(page, { timeout }) {
  await page.waitForLoadState('load', { timeout });
  // a page that never draws any text is not an error HERE: the screen check that follows reports it as blank, with the right name
  await page.waitForFunction(() => document.body.innerText.trim().length > 0, null, { timeout }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout });
  await domQuiet(page);
}

export const pathOf = (page) => new URL(page.url()).pathname;

// ---------------------------------------------------------------- one page load

/**
 * Loads one route in one state and returns the errors found (an empty list = the screen is fine).
 * task: { route: { pattern, url }, persona, scheme, offline, data, label }
 */
export async function sweepRoute(browser, env, task) {
  const s = await openSession(browser, env, task);
  let errors = null;
  try {
    await s.page.goto(env.origin + task.route.url, { waitUntil: 'load', timeout: env.timeout });
    await settle(s.page, env);
    await s.page.waitForTimeout(150); // a last moment for errors thrown by effects that run after the first draw (the one short sleep of the test)
    if (task.offline) {
      const online = await s.page.evaluate(() => navigator.onLine);
      if (online) s.collector.add('not-offline', 'the page believes it is online (navigator.onLine is true): the offline run is not offline');
    }
    const at = pathOf(s.page);
    const want = new URL(task.route.url, env.origin).pathname;
    // a route must still be on its own address (EXPECTED_REDIRECTS in plan.mjs lists the screens that redirect on purpose)
    if (at !== want && !redirectAllowed(task.route.pattern, task.persona)) {
      s.collector.add('wrong-url', `asked for ${want} and ended on ${at}: a guard or a redirect sent the screen somewhere else, so this screen was not what got checked. If it redirects on purpose, add it to EXPECTED_REDIRECTS in plan.mjs with the reason.`);
    }
    s.collector.screen(await s.page.evaluate(readScreen));
  } catch (e) {
    s.collector.add(/Timeout/i.test(String(e && e.message)) ? 'timeout' : 'navigation', String(e && e.message).split('\n')[0], e && e.stack);
  } finally {
    errors = s.collector.errors;
    await closeSession(s, env);
  }
  return { errors, ignored: s.collector.ignored, blocked: s.collector.blocked };
}

// ---------------------------------------------------------------- a scenario (a person using the app)

/**
 * Runs a scenario function in a session of its own. The scenario gets { page, env, go, step }; everything that goes wrong in the
 * page while it runs (page errors, console errors, a request to the wrong host) counts exactly as it does in a route sweep.
 */
export async function runScenario(browser, env, task) {
  const s = await openSession(browser, env, task);
  let stepName = 'start';
  const api = {
    page: s.page, env, task, collector: s.collector,
    step: (name) => { stepName = name; },
    /** open a path of the app and wait for it to be drawn and still */
    go: async (path) => { await s.page.goto(env.origin + path, { waitUntil: 'load', timeout: env.timeout }); await settle(s.page, env); },
  };
  try {
    await task.scenario.run(api);
    await settle(s.page, env); // the screen the scenario ended on may still be loading its code
    await s.page.waitForTimeout(150);
    s.collector.screen(await s.page.evaluate(readScreen)); // the screen the scenario ended on must not be blank or an error screen
  } catch (e) {
    const msg = String(e && e.message).split('\n')[0];
    s.collector.add('scenario', `${msg} (at step: ${stepName})`, e && e.stack);
  } finally {
    await closeSession(s, env);
  }
  return { errors: s.collector.errors, ignored: s.collector.ignored, blocked: s.collector.blocked };
}

/** Polls `read` until `ok(value)` is true; throws with the last value when `timeout` passes. Polls every 50 ms: no long sleeps. */
export async function eventually(read, ok, { what, timeout = 8000 }) {
  const end = Date.now() + timeout;
  let last;
  for (;;) {
    try { last = await read(); if (ok(last)) return last; } catch (e) { last = `(error: ${String(e && e.message).split('\n')[0]})`; }
    if (Date.now() > end) throw new Error(`${what}: still ${JSON.stringify(last)} after ${timeout} ms`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

// ---------------------------------------------------------------- running many

/** Runs worker(item) for every item, `concurrency` at a time, results in order. */
export async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }));
  return results;
}

/** Rejects after `ms`, so one stuck page cannot hold the whole run. The stuck work is left to fail on its own when its context is closed. */
export function withDeadline(work, ms, onTimeout) {
  let timer;
  const deadline = new Promise((resolve) => { timer = setTimeout(() => resolve(onTimeout()), ms); });
  work.catch(() => {});
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}
