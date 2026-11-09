// The two rules of lib/accountLoad.ts as behaviour, plus pins that lib/auth.tsx uses them. They exist for Sign in with Apple:
// its button calls refresh() from a render where nobody was signed in, after saving the name Apple shares once, while the
// load that started with the new session may still be running. Run: npm run test:lib
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { latestGate, reloadCurrent } from '../accountLoad';

let n = 0;
const pending: Array<Promise<void>> = [];
const check = (name: string, fn: () => void | Promise<void>) => {
  pending.push(Promise.resolve().then(fn).then(() => { n += 1; console.log(`ok   ${name}`); }));
};
const deferred = <T>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
};

check('refresh() made while signed out loads the user signed in when it is called', async () => {
  const current: { uid?: string } = {}; // the ref of AuthProvider
  const loaded: string[] = [];
  const refresh = reloadCurrent(() => current.uid, async (uid) => { loaded.push(uid); });
  await refresh(); // still signed out: nothing
  assert.deepEqual(loaded, []);
  current.uid = 'u-apple'; // the sign-in happened after the render that made refresh()
  await refresh();
  assert.deepEqual(loaded, ['u-apple']);
});

check('the old closure (user id of its own render) did nothing here: the bug this replaces', async () => {
  const loaded: string[] = [];
  const renderUid: string | undefined = undefined; // the render where the Apple button was pressed
  const oldRefresh = async () => { if (renderUid) loaded.push(renderUid); };
  await oldRefresh();
  assert.deepEqual(loaded, []);
});

check('retry() runs its "before" step only when somebody is signed in', async () => {
  const current: { uid?: string } = {};
  let before = 0;
  const retry = reloadCurrent(() => current.uid, async () => {}, () => { before += 1; });
  await retry();
  current.uid = 'u1';
  await retry();
  assert.equal(before, 1);
});

check('two loads at once: the newer one wins even when the older one finishes last', async () => {
  const gate = latestGate();
  let shown = '';
  const load = async (answer: Promise<string>) => {
    const ticket = gate.begin();
    const value = await answer;
    if (gate.isLatest(ticket)) shown = value;
  };
  const first = deferred<string>(); // the load that started with the new session: reads the automatic name
  const second = deferred<string>(); // refresh() after Apple's name was saved
  const a = load(first.promise);
  const b = load(second.promise);
  second.resolve('Ana Torres');
  await b;
  first.resolve('x7kq2m9pzt');
  await a;
  assert.equal(shown, 'Ana Torres');
});

check('one load alone always writes; a later load is the latest again', () => {
  const gate = latestGate();
  const t1 = gate.begin();
  assert.equal(gate.isLatest(t1), true);
  const t2 = gate.begin();
  assert.equal(gate.isLatest(t1), false);
  assert.equal(gate.isLatest(t2), true);
});

check('lib/auth.tsx uses both rules (and still loads the saved copy first and wipes the user on sign-out)', () => {
  const t = readFileSync(join(process.cwd(), 'src', 'lib', 'auth.tsx'), 'utf8');
  assert.match(t, /retry: reloadCurrent\(\(\) => currentUid\.current,/);
  assert.match(t, /refresh: reloadCurrent\(\(\) => currentUid\.current,/);
  assert.doesNotMatch(t, /if \(userId\) await loadRef\.current\(userId\)/, 'refresh must not use the user id of a render');
  assert.match(t, /const ticket = gate\.begin\(\);/);
  assert.match(t, /const mine = \(\) => currentUid\.current === uid && gate\.isLatest\(ticket\);/);
  assert.equal((t.match(/if \(!mine\(\)\) return;/g) ?? []).length, 2, 'both the answer and the error of an old load are dropped');
  assert.match(t, /if \(mine\(\)\) setLoadedFor\(uid\);/);
  assert.match(t, /const cached = await localStore\.getJSON<CachedAccount>\(accountKey\(userId\)\);/);
  assert.match(t, /await clearUserData\(uid\);/);
});

Promise.all(pending).then(() => console.log(`${n} of ${pending.length} passed`), (e) => { console.error(e); process.exit(1); });
