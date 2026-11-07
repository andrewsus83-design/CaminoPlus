// What counts as a failure, and the one place that decides it. smoke.mjs feeds this with what the browser reports;
// test/collector.test.mjs feeds it synthetic reports to prove it cannot stay green when it should be red.

/**
 * console.error messages that are NOT a failure. Keep this list short. Every entry needs a one-line reason: a
 * pattern with no reason is refused at start-up (checkAllowList), so nobody can silence a message without saying why.
 *   pattern     a RegExp tested against the message text
 *   reason      one line: why this message is harmless
 *   offlineOnly true when it is only expected in the runs where the network is cut on purpose
 */
export const CONSOLE_ALLOW_LIST = [
  {
    pattern: /^Failed to load resource: net::ERR_INTERNET_DISCONNECTED/,
    offlineOnly: true,
    reason: 'In the offline runs the test cuts every request to the outside on purpose, and Chromium reports each cut request as a console error.',
  },
];

export function checkAllowList(list) {
  for (const [i, e] of list.entries()) {
    if (!e || !(e.pattern instanceof RegExp)) throw new Error(`console allow-list entry ${i}: "pattern" must be a RegExp`);
    if (typeof e.reason !== 'string' || e.reason.trim().length < 15 || /\n/.test(e.reason.trim())) {
      throw new Error(`console allow-list entry ${i} (${e.pattern}): "reason" must be one line saying why the message is harmless`);
    }
  }
  return list;
}
checkAllowList(CONSOLE_ALLOW_LIST);

// ---------------------------------------------------------------- what the screen shows

/** Text that only an error screen shows. expo-router's own error boundary and not-found screen, a React production error, the dev overlay. */
export const ERROR_SCREEN_TEXT = /Unhandled Runtime Error|Something went wrong|Application error|Unmatched Route|Page could not be found|Minified React error|Uncaught (?:Error|TypeError|ReferenceError)/i;

/**
 * What a screen shows, as measured in the page: { text, routerError, unmatched }.
 * Returns the problems: a list of { kind, message } (empty = a screen with something to read and no error on it).
 */
export function classifyScreen({ text = '', routerError = null, unmatched = false } = {}) {
  const problems = [];
  const t = String(text).replace(/\s+/g, ' ').trim();
  if (t.length === 0) problems.push({ kind: 'blank', message: 'the page shows no text (a blank screen)' });
  if (routerError !== null) problems.push({ kind: 'error-screen', message: `expo-router's error screen is showing: ${String(routerError).slice(0, 300)}` });
  if (unmatched) problems.push({ kind: 'error-screen', message: 'expo-router\'s "Unmatched Route" screen is showing' });
  const m = ERROR_SCREEN_TEXT.exec(t);
  if (m && routerError === null && !unmatched) problems.push({ kind: 'error-screen', message: `the page shows "${m[0]}": ${t.slice(Math.max(0, m.index - 30), m.index + 120)}` });
  return problems;
}

// ---------------------------------------------------------------- the collector

/** One collector per page load. Everything that goes wrong is added to it; `errors` is what the report shows. */
export class Collector {
  /**
   * @param {object} o
   * @param {boolean} [o.offline]    the run has the network cut (offline-only allow-list entries apply)
   * @param {object[]} [o.allow]     console.error allow-list (default CONSOLE_ALLOW_LIST)
   */
  constructor({ offline = false, allow = CONSOLE_ALLOW_LIST } = {}) {
    this.offline = offline;
    this.allow = checkAllowList(allow);
    this.errors = [];
    this.blocked = []; // requests to hosts that are neither the app nor mocked: aborted, and recorded here
    this.ignored = []; // console errors the allow-list let through (shown with --verbose so the list can be audited)
    this._seen = new Map();
  }

  /**
   * @returns the entry, or null when it was a repeat (counted on the first one instead).
   * Chromium reports a promise nobody handled twice: as a page error and as an unhandledrejection event. That is one problem, listed once, under
   * the name unhandledrejection.
   */
  add(kind, message, stack = '') {
    const thrown = kind === 'pageerror' || kind === 'unhandledrejection';
    const key = `${thrown ? 'thrown' : kind}\u0000${message}`;
    const old = this._seen.get(key);
    if (old) {
      if (old._kinds.has(kind)) old.count++;
      else old._kinds.add(kind); // the same problem seen through the other door
      if (kind === 'unhandledrejection') old.kind = kind;
      if (!old.stack && stack) old.stack = String(stack);
      return null;
    }
    const e = { kind, message: String(message), stack: String(stack || ''), count: 1 };
    Object.defineProperty(e, '_kinds', { value: new Set([kind]), enumerable: false });
    this._seen.set(key, e);
    this.errors.push(e);
    return e;
  }

  /** page.on('pageerror'): an exception nobody caught */
  pageError(err) {
    const message = err && err.message !== undefined ? `${err.name || 'Error'}: ${err.message}` : String(err);
    this.add('pageerror', message, err && err.stack);
  }

  /** page.on('console') */
  console(type, text, location) {
    if (type !== 'error') return;
    const hit = this.allow.find((a) => a.pattern.test(text) && (!a.offlineOnly || this.offline));
    if (hit) { this.ignored.push({ text, at: location && location.url, reason: hit.reason }); return; }
    const at = location && location.url ? `    at ${location.url}:${location.lineNumber}:${location.columnNumber}` : '';
    this.add('console.error', text, at);
  }

  /** the page's own unhandledrejection hook (see smoke.mjs) */
  rejection(message, stack) {
    this.add('unhandledrejection', message, stack);
  }

  /** A request to somewhere that is neither the local server nor a mocked host. The caller aborts it; this records it. */
  unexpectedHost(method, url) {
    let host = url;
    try { host = new URL(url).host; } catch { /* keep the raw text */ }
    this.blocked.push({ method, url, host });
    this.add('unexpected-host', `${method} ${url}: the app called ${host}, which is not the local server and not mocked. Mock it in fixtures.mjs (with a reason) or remove the call.`);
  }

  /** The local server answered 4xx / 5xx: a file the app asks for is not in the export. */
  badResponse(method, url, status) {
    this.add('bad-response', `${method} ${url} answered HTTP ${status}`);
  }

  /** A request to the local server failed (not merely cancelled by a navigation). */
  requestFailed(method, url, reason) {
    if (/ERR_ABORTED/.test(reason || '')) return; // the page moved on or reloaded: not a failure
    this.add('request-failed', `${method} ${url} failed: ${reason}`);
  }

  /** Problems found in what the screen shows (see classifyScreen). */
  screen(report) {
    for (const p of classifyScreen(report)) this.add(p.kind, p.message);
  }

  get ok() { return this.errors.length === 0; }
}

// ---------------------------------------------------------------- the report

const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** The lines that describe one failed check: what was checked, then up to `max` errors with their stacks. */
export function formatFailure(task, errors, { max = 5, stackLines = 6 } = {}) {
  const out = [`FAIL  ${task.label}`];
  for (const e of errors.slice(0, max)) {
    out.push(`      [${e.kind}]${e.count > 1 ? ` (x${e.count})` : ''} ${clip(e.message.replace(/\s*\n\s*/g, ' '), 400)}`);
    const stack = e.stack.split('\n').map((l) => l.trimEnd()).filter(Boolean).filter((l) => !e.message.startsWith(l.trim())).slice(0, stackLines);
    for (const l of stack) out.push(`          ${clip(l.trim(), 200)}`);
  }
  if (errors.length > max) out.push(`      ... and ${errors.length - max} more`);
  return out.join('\n');
}

/** { failed, text } for a list of results [{ task, errors }]: the exit code and the report. */
export function summarize(results) {
  const failed = results.filter((r) => r.errors.length > 0);
  return { failed: failed.length, total: results.length, text: failed.map((r) => formatFailure(r.task, r.errors)).join('\n\n') };
}
