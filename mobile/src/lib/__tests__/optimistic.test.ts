// Plain-node checks for the optimistic actions of the action rail: show first, ask second, and put the old state back
// when the server says no (no React Native). Run: npm run test:lib
import assert from 'node:assert/strict';
import { failureMessage, flipReaction, looksOffline, optimistic, optimisticToggle, rateLimitMessage } from '../optimistic';
import type { Reaction } from '../optimistic';

let n = 0;
const test = async (name: string, fn: () => Promise<void> | void) => { await fn(); n += 1; console.log(`ok   ${name}`); };

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const tick = () => new Promise<void>((r) => setImmediate(r));

(async () => {
  /* ---------------- flipReaction ---------------- */

  await test('flipReaction: the other state, and the count one more when switched on, one less when switched off', () => {
    assert.deepEqual(flipReaction({ on: false, count: 12 }), { on: true, count: 13 });
    assert.deepEqual(flipReaction({ on: true, count: 13 }), { on: false, count: 12 });
    assert.deepEqual(flipReaction({ on: false, count: 0 }), { on: true, count: 1 });
  });

  await test('flipReaction never goes below 0 and rounds a fractional count down first', () => {
    assert.deepEqual(flipReaction({ on: true, count: 0 }), { on: false, count: 0 });
    assert.deepEqual(flipReaction({ on: false, count: 4.9 }), { on: true, count: 5 });
  });

  await test('flipReaction keeps an unknown count unknown: bookmarking does not make a count of 1 out of nothing', () => {
    for (const unknown of [undefined, null, NaN, -3, '4'] as unknown as (number | undefined)[]) {
      const next = flipReaction({ on: false, count: unknown });
      assert.deepEqual(next, { on: true });
      assert.ok(!('count' in next), 'no count key at all');
    }
  });

  /* ---------------- optimistic ---------------- */

  await test('optimistic: before, then apply, then commit; a success reverts nothing', async () => {
    const calls: string[] = [];
    const r = await optimistic({
      before: async () => { calls.push('before'); },
      apply: () => { calls.push('apply'); },
      commit: async () => { calls.push('commit'); return 42; },
      revert: () => { calls.push('revert'); },
    });
    assert.deepEqual(calls, ['before', 'apply', 'commit']);
    assert.deepEqual(r, { ok: true, value: 42 });
  });

  await test('optimistic: the result is on screen before the request has answered', async () => {
    const answer = deferred();
    let shown = false;
    const pending = optimistic({ apply: () => { shown = true; }, commit: () => answer.promise, revert: () => { shown = false; } });
    await tick();
    assert.equal(shown, true, 'shown while the request is still out');
    answer.resolve();
    assert.equal((await pending).ok, true);
    assert.equal(shown, true);
  });

  await test('optimistic: a failed request puts the old state back, once, and hands over the error', async () => {
    const calls: string[] = [];
    const boom = new Error('boom');
    const r = await optimistic({ apply: () => calls.push('apply'), commit: async () => { throw boom; }, revert: () => calls.push('revert') });
    assert.deepEqual(calls, ['apply', 'revert']);
    assert.deepEqual(r, { ok: false, reason: 'failed', error: boom });
  });

  await test('optimistic: a request that throws before it is even async still reverts', async () => {
    const calls: string[] = [];
    const r = await optimistic({ apply: () => calls.push('apply'), commit: () => { throw new Error('sync boom'); }, revert: () => calls.push('revert') });
    assert.deepEqual(calls, ['apply', 'revert']);
    assert.equal(r.ok, false);
  });

  await test('optimistic: when the pre-check says offline nothing is shown, nothing is sent and nothing needs reverting', async () => {
    const calls: string[] = [];
    const offline = new Error('You are offline.');
    const r = await optimistic({
      before: async () => { throw offline; },
      apply: () => calls.push('apply'),
      commit: async () => { calls.push('commit'); },
      revert: () => calls.push('revert'),
    });
    assert.deepEqual(calls, []);
    assert.deepEqual(r, { ok: false, reason: 'blocked', error: offline });
  });

  /* ---------------- optimisticToggle ---------------- */

  const harness = (from: Reaction) => {
    const shown: Reaction[] = [];
    const sent: boolean[] = [];
    const inFlight = new Set<string>();
    return { shown, sent, inFlight, from };
  };

  await test('toggle: a tap shows the flipped state with its count at once, and writes the flipped state', async () => {
    const h = harness({ on: false, count: 12 });
    const answer = deferred();
    const pending = optimisticToggle({ key: 'p1:love', inFlight: h.inFlight, from: h.from, show: (r) => h.shown.push(r), commit: (on) => { h.sent.push(on); return answer.promise; } });
    await tick();
    assert.deepEqual(h.shown, [{ on: true, count: 13 }], 'shown before the answer');
    assert.deepEqual(h.sent, [true]);
    answer.resolve();
    assert.deepEqual(await pending, { ok: true, value: undefined });
    assert.deepEqual(h.shown, [{ on: true, count: 13 }], 'a success changes nothing more');
  });

  await test('toggle: switching off writes false and takes the count down', async () => {
    const h = harness({ on: true, count: 13 });
    await optimisticToggle({ key: 'p1:save', inFlight: h.inFlight, from: h.from, show: (r) => h.shown.push(r), commit: async (on) => { h.sent.push(on); } });
    assert.deepEqual(h.sent, [false]);
    assert.deepEqual(h.shown, [{ on: false, count: 12 }]);
  });

  await test('toggle: when the request fails the state from before the tap comes back exactly, count included', async () => {
    const h = harness({ on: false, count: 12 });
    const boom = new Error('boom');
    const r = await optimisticToggle({ key: 'p1:love', inFlight: h.inFlight, from: h.from, show: (x) => h.shown.push(x), commit: async () => { throw boom; } });
    assert.deepEqual(h.shown, [{ on: true, count: 13 }, { on: false, count: 12 }], 'shown, then taken back');
    assert.deepEqual(r, { ok: false, reason: 'failed', error: boom });
    // an unknown count comes back unknown
    const u = harness({ on: false });
    await optimisticToggle({ key: 'p1:save', inFlight: u.inFlight, from: u.from, show: (x) => u.shown.push(x), commit: async () => { throw boom; } });
    assert.deepEqual(u.shown, [{ on: true }, { on: false }]);
  });

  await test('toggle: offline does nothing at all (nothing flashes on and off) and hands over the offline error', async () => {
    const h = harness({ on: false, count: 12 });
    const offline = new Error('You are offline.');
    const r = await optimisticToggle({
      key: 'p1:love', inFlight: h.inFlight, from: h.from,
      before: async () => { throw offline; },
      show: (x) => h.shown.push(x), commit: async (on) => { h.sent.push(on); },
    });
    assert.deepEqual(h.shown, []);
    assert.deepEqual(h.sent, []);
    assert.deepEqual(r, { ok: false, reason: 'blocked', error: offline });
    assert.equal(h.inFlight.size, 0, 'the button is free again');
  });

  await test('toggle: a second tap on the same button while the first waits is ignored, so a like and an unlike cannot overtake each other', async () => {
    const h = harness({ on: false, count: 1 });
    const answer = deferred();
    const first = optimisticToggle({ key: 'p1:love', inFlight: h.inFlight, from: h.from, show: (x) => h.shown.push(x), commit: (on) => { h.sent.push(on); return answer.promise; } });
    await tick();
    const second = await optimisticToggle({ key: 'p1:love', inFlight: h.inFlight, from: { on: true, count: 2 }, show: (x) => h.shown.push(x), commit: async (on) => { h.sent.push(on); } });
    assert.deepEqual(second, { ok: false, reason: 'busy' });
    assert.deepEqual(h.sent, [true], 'only the first went out');
    assert.deepEqual(h.shown, [{ on: true, count: 2 }], 'and only the first was shown');
    answer.resolve();
    await first;
    // free again: the next tap works and writes the opposite
    const third = await optimisticToggle({ key: 'p1:love', inFlight: h.inFlight, from: { on: true, count: 2 }, show: (x) => h.shown.push(x), commit: async (on) => { h.sent.push(on); } });
    assert.equal(third.ok, true);
    assert.deepEqual(h.sent, [true, false]);
  });

  await test('toggle: another button, or another post, is independent', async () => {
    const h = harness({ on: false, count: 0 });
    const answer = deferred();
    const first = optimisticToggle({ key: 'p1:love', inFlight: h.inFlight, from: h.from, show: () => {}, commit: () => answer.promise });
    await tick();
    for (const key of ['p1:save', 'p2:love']) {
      const r = await optimisticToggle({ key, inFlight: h.inFlight, from: h.from, show: (x) => h.shown.push(x), commit: async (on) => { h.sent.push(on); } });
      assert.equal(r.ok, true, key);
    }
    assert.deepEqual(h.sent, [true, true]);
    answer.resolve();
    await first;
  });

  await test('toggle: the button is free again after a failure, so the person can try again', async () => {
    const h = harness({ on: false, count: 3 });
    const failed = await optimisticToggle({ key: 'p1:love', inFlight: h.inFlight, from: h.from, show: () => {}, commit: async () => { throw new Error('boom'); } });
    assert.equal(failed.ok, false);
    assert.equal(h.inFlight.size, 0);
    const again = await optimisticToggle({ key: 'p1:love', inFlight: h.inFlight, from: h.from, show: () => {}, commit: async () => {} });
    assert.equal(again.ok, true);
  });

  /* ---------------- failureMessage ---------------- */

  await test('looksOffline recognises the ways "no connection" arrives, and nothing else', () => {
    const offlineError = Object.assign(new Error('You are offline.'), { name: 'OfflineError' });
    for (const e of [offlineError, new TypeError('Network request failed'), new Error('Failed to fetch'), new Error('NetworkError when attempting to fetch resource.'), new TypeError('Load failed'), { network: true }, 'offline', { name: 'AuthRetryableFetchError', message: 'x' }]) {
      assert.equal(looksOffline(e), true, JSON.stringify(e) + String(e));
    }
    for (const e of [new Error('permission denied for table post_likes'), new Error('boom'), null, undefined, {}, 0]) {
      assert.equal(looksOffline(e), false, String(e));
    }
  });

  await test('failureMessage: offline says so, in one short sentence naming what needs a connection', () => {
    const offline = Object.assign(new Error('You are offline.'), { name: 'OfflineError' });
    assert.equal(failureMessage('love', offline), 'You are offline. Likes need a connection.');
    assert.equal(failureMessage('save', offline), 'You are offline. Bookmarks need a connection.');
    assert.equal(failureMessage('comments', offline), 'You are offline. Comments need a connection.');
    assert.equal(failureMessage('share', offline), 'You are offline. Sharing needs a connection.');
  });

  await test('failureMessage: any other failure says what was not saved, and does not show technical text', () => {
    const rls = new Error('new row violates row-level security policy for table "post_likes"');
    assert.equal(failureMessage('love', rls), 'Could not save your like. Try again.');
    assert.equal(failureMessage('save', rls), 'Could not save your bookmark. Try again.');
    assert.equal(failureMessage('comments', rls), 'Could not send your comment. Try again.');
    assert.equal(failureMessage('share', rls), 'Could not open the share sheet. Try again.');
    for (const kind of ['love', 'save', 'comments', 'share'] as const) {
      const m = failureMessage(kind, rls);
      assert.ok(!/row-level|policy|violates|post_likes/.test(m), m);
      assert.ok(m.length < 60, `short: ${m}`);
    }
  });

  await test('failureMessage: a rate limit of the database shows its own sentence (when to try again), nothing technical', () => {
    // what lib/api.ts throws: the message plus the code and hint of the database (migration 20261120010000)
    const likes = Object.assign(new Error('You have liked many posts in the last hour. Please wait a little and try again.'), { code: '54000', hint: 'rate_limited_likes' });
    const comments = Object.assign(new Error('You have written many comments in the last hour. Please wait a little and try again.'), { code: '54000', hint: 'rate_limited_comments' });
    assert.equal(failureMessage('love', likes), likes.message);
    assert.equal(failureMessage('comments', comments), comments.message);
    assert.equal(rateLimitMessage({ code: '54000', message: 'You have saved many posts in the last hour. Please wait a little and try again.' }), 'You have saved many posts in the last hour. Please wait a little and try again.');
    // the same code with technical text, or another code with a sentence, keeps the plain fallback
    assert.equal(failureMessage('love', Object.assign(new Error('statement too complex'), { code: '54000' })), 'Could not save your like. Try again.');
    assert.equal(failureMessage('love', Object.assign(new Error('You are not allowed to do that.'), { code: '42501' })), 'Could not save your like. Try again.');
    assert.equal(rateLimitMessage(null), null);
    assert.equal(rateLimitMessage('54000'), null);
    // offline still wins
    assert.equal(failureMessage('love', { network: true, code: '54000', message: likes.message }), 'You are offline. Likes need a connection.');
  });

  console.log(`${n} of ${n} passed`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
