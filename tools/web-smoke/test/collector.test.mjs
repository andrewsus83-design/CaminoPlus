// The collector decides red or green. These tests feed it made-up reports, so a collector that has stopped noticing things fails here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONSOLE_ALLOW_LIST, Collector, checkAllowList, classifyScreen, formatFailure, summarize } from '../collector.mjs';

const kinds = (c) => c.errors.map((e) => e.kind);

test('a page error is a failure, with its message and stack', () => {
  const c = new Collector();
  const err = new Error('boom from a screen');
  c.pageError(err);
  assert.deepEqual(kinds(c), ['pageerror']);
  assert.match(c.errors[0].message, /Error: boom from a screen/);
  assert.match(c.errors[0].stack, /collector\.test\.mjs/);
  assert.equal(c.ok, false);
});

test('a console.error is a failure, a warning or a log is not', () => {
  const c = new Collector();
  c.console('warning', 'just a warning');
  c.console('log', 'hello');
  c.console('info', 'fyi');
  assert.equal(c.ok, true);
  c.console('error', 'Warning: Each child in a list should have a unique "key" prop', { url: 'http://x/app.js', lineNumber: 12, columnNumber: 3 });
  assert.deepEqual(kinds(c), ['console.error']);
  assert.match(c.errors[0].stack, /app\.js:12:3/);
});

test('an unhandled promise rejection is a failure', () => {
  const c = new Collector();
  c.rejection('Error: dropped promise', 'Error: dropped promise\n    at screen.js:1:1');
  assert.deepEqual(kinds(c), ['unhandledrejection']);
  assert.equal(c.ok, false);
});

test('a request to a host that is neither the app nor mocked is a failure, and is recorded', () => {
  const c = new Collector();
  c.unexpectedHost('GET', 'https://tracker.example.test/collect?x=1');
  assert.deepEqual(kinds(c), ['unexpected-host']);
  assert.match(c.errors[0].message, /tracker\.example\.test/);
  assert.deepEqual(c.blocked, [{ method: 'GET', url: 'https://tracker.example.test/collect?x=1', host: 'tracker.example.test' }]);
  assert.equal(c.ok, false);
});

test('a missing file of the app (4xx) and a failed request are failures; a request cancelled by a navigation is not', () => {
  const c = new Collector();
  c.requestFailed('GET', 'http://127.0.0.1/x.js', 'net::ERR_ABORTED');
  assert.equal(c.ok, true);
  c.badResponse('GET', 'http://127.0.0.1/missing.js', 404);
  c.requestFailed('GET', 'http://127.0.0.1/y.js', 'net::ERR_CONNECTION_RESET');
  assert.deepEqual(kinds(c), ['bad-response', 'request-failed']);
});

test('a promise nobody handled, reported both as a page error and as a rejection, is one failure named unhandledrejection', () => {
  const c = new Collector();
  c.pageError(Object.assign(new Error('dropped promise'), { stack: 'Error: dropped promise\n    at a.js:1:1' }));
  c.rejection('Error: dropped promise', '');
  assert.equal(c.errors.length, 1);
  assert.equal(c.errors[0].kind, 'unhandledrejection');
  assert.equal(c.errors[0].count, 1);
  assert.match(c.errors[0].stack, /a\.js/);
  const other = new Collector();
  other.rejection('Error: x', 's');
  other.pageError(new Error('x'));
  assert.deepEqual(other.errors.map((e) => [e.kind, e.count]), [['unhandledrejection', 1]]);
});

test('the same message twice is counted, not listed twice', () => {
  const c = new Collector();
  c.console('error', 'again');
  c.console('error', 'again');
  c.console('error', 'again');
  assert.equal(c.errors.length, 1);
  assert.equal(c.errors[0].count, 3);
});

test('the allow-list lets a listed console error through, and keeps a record of it', () => {
  const allow = [{ pattern: /^harmless thing/, reason: 'This is printed by a library on every start and means nothing.' }];
  const c = new Collector({ allow });
  c.console('error', 'harmless thing happened');
  assert.equal(c.ok, true);
  assert.equal(c.ignored.length, 1);
  c.console('error', 'a harmful thing happened');
  assert.deepEqual(kinds(c), ['console.error']);
});

test('an offline-only allow-list entry applies only to the offline runs', () => {
  const allow = [{ pattern: /^cut request/, offlineOnly: true, reason: 'The offline runs cut requests on purpose and Chromium reports them.' }];
  const online = new Collector({ allow, offline: false });
  online.console('error', 'cut request: net::ERR_X');
  assert.equal(online.ok, false, 'online, a failed request is a real failure');
  const offline = new Collector({ allow, offline: true });
  offline.console('error', 'cut request: net::ERR_X');
  assert.equal(offline.ok, true);
});

test('the real allow-list: every entry has a reason, the cut-request message is only allowed offline, an app error never is', () => {
  checkAllowList(CONSOLE_ALLOW_LIST);
  const cut = 'Failed to load resource: net::ERR_INTERNET_DISCONNECTED';
  const online = new Collector({ offline: false });
  online.console('error', cut);
  assert.equal(online.ok, false);
  const offline = new Collector({ offline: true });
  offline.console('error', cut);
  offline.console('error', 'TypeError: Cannot read properties of undefined');
  assert.deepEqual(kinds(offline), ['console.error']);
  assert.match(offline.errors[0].message, /TypeError/);
});

test('an allow-list entry without a reason (or with a pattern that is not a RegExp) is refused', () => {
  assert.throws(() => checkAllowList([{ pattern: /x/ }]), /reason/);
  assert.throws(() => checkAllowList([{ pattern: /x/, reason: '' }]), /reason/);
  assert.throws(() => checkAllowList([{ pattern: /x/, reason: 'short' }]), /reason/);
  assert.throws(() => checkAllowList([{ pattern: /x/, reason: 'two lines\nof reasons, which is one too many' }]), /reason/);
  assert.throws(() => checkAllowList([{ pattern: 'x', reason: 'This is a string, not a regular expression, so it is refused.' }]), /RegExp/);
  assert.throws(() => new Collector({ allow: [{ pattern: /x/ }] }), /reason/);
});

test('screen: a blank page, the router error screen, "Unmatched Route" and the dev overlay are failures', () => {
  assert.deepEqual(classifyScreen({ text: '   \n ' }).map((p) => p.kind), ['blank']);
  assert.deepEqual(classifyScreen({ text: 'Something went wrong Error: x', routerError: 'Error: x' }).map((p) => p.kind), ['error-screen']);
  assert.deepEqual(classifyScreen({ text: 'Unmatched Route Page could not be found.', unmatched: true }).map((p) => p.kind), ['error-screen']);
  for (const text of ['Unhandled Runtime Error TypeError: x', 'Application error: a client-side exception', 'Minified React error #310', 'Something went wrong']) {
    assert.deepEqual(classifyScreen({ text }).map((p) => p.kind), ['error-screen'], text);
  }
});

test('screen: ordinary screens pass, including the app\'s own "try again" messages', () => {
  assert.deepEqual(classifyScreen({ text: 'Inbox Notifications Messages Groups All quiet on the Way' }), []);
  assert.deepEqual(classifyScreen({ text: 'That did not load You seem to be offline. Check your signal and try again. Try again' }), []);
  assert.deepEqual(classifyScreen({ text: 'No signal right now Connect to Wi-Fi or mobile data once and your Camino will open.' }), []);
});

test('the report names the route, the scheme and the mode, and shows the first 5 errors with their stacks', () => {
  const c = new Collector();
  for (let i = 1; i <= 8; i++) c.pageError(Object.assign(new Error(`failure number ${i}`), { stack: `Error: failure number ${i}\n    at screen${i}.js:1:1\n    at deeper${i}.js:2:2` }));
  const text = formatFailure({ label: '/settings  [dark, offline, signed in, with a journey]' }, c.errors);
  assert.match(text, /^FAIL {2}\/settings {2}\[dark, offline, signed in, with a journey\]/);
  assert.match(text, /failure number 1/);
  assert.match(text, /failure number 5/);
  assert.doesNotMatch(text, /failure number 6/);
  assert.match(text, /at screen1\.js:1:1/);
  assert.match(text, /and 3 more/);
});

test('summarize: green only when every check is clean, red (non-zero) as soon as one is not', () => {
  const clean = { task: { label: 'a' }, errors: [] };
  assert.equal(summarize([clean, clean]).failed, 0);
  const c = new Collector();
  c.pageError(new Error('x'));
  const red = summarize([clean, { task: { label: 'b' }, errors: c.errors }]);
  assert.equal(red.failed, 1);
  assert.equal(red.total, 2);
  assert.match(red.text, /FAIL {2}b/);
  // nothing run is not green either: smoke.mjs refuses to run an empty plan, and an empty result list has no failures to hide
  assert.equal(summarize([]).total, 0);
});
