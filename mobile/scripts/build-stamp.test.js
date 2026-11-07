// Plain-node checks of what goes into the app when it is built: the commit stamp, the switch-on of over-the-air
// updates and, the one that matters most, that Expo's native fingerprint does NOT move when the stamp does.
// (If it moved, every build and every update would get a different fingerprint and no phone would ever accept
// an update.) Run: npm run test:config
const assert = require('node:assert/strict');
const path = require('node:path');
const { buildStamp } = require('./build-stamp');
const appConfig = require('../app.config.js');

const SHA = '70ad36c2c3658a86257af2d4ff043e1b55cffcf4';
const NOW = new Date('2026-11-07T06:00:00.000Z');

// A fake `git` that answers by its arguments and fails for anything it was not told about.
const fakeGit = (answers) => (cmd, args) => {
  assert.equal(cmd, 'git');
  const key = args.join(' ');
  if (!(key in answers)) throw new Error(`git ${key} is not expected here`);
  const v = answers[key];
  if (v instanceof Error) throw v;
  return `${v}\n`;
};
const noGit = () => { throw new Error('git: not found'); };
const stamp = () => ({ sha: SHA, shortSha: '70ad36c', dirty: false, committedAt: '', builtAt: NOW.toISOString(), source: 'git' });
const cfg = { name: 'CaminoPlus', slug: 'caminoplus', version: '1.0.0', plugins: ['expo-router'], extra: { other: 1 } };

let n = 0;
const checks = [];
const check = (name, fn) => checks.push([name, fn]);

check('in a git checkout the stamp is the commit, its time and whether there are uncommitted changes', () => {
  const run = fakeGit({ 'rev-parse HEAD': SHA, 'status --porcelain': '', 'log -1 --format=%cI': '2026-11-07T05:37:40+00:00' });
  assert.deepEqual(buildStamp({}, run, NOW), { sha: SHA, shortSha: '70ad36c', dirty: false, committedAt: '2026-11-07T05:37:40+00:00', builtAt: '2026-11-07T06:00:00.000Z', source: 'git' });
  const dirty = fakeGit({ 'rev-parse HEAD': SHA, 'status --porcelain': ' M mobile/app.json', 'log -1 --format=%cI': '' });
  assert.equal(buildStamp({}, dirty, NOW).dirty, true);
});

check('on EAS Build, which has no .git folder, the commit comes from EAS_BUILD_GIT_COMMIT_HASH', () => {
  const s = buildStamp({ EAS_BUILD_GIT_COMMIT_HASH: SHA }, noGit, NOW);
  assert.equal(s.sha, SHA);
  assert.equal(s.source, 'eas-build');
  assert.equal(s.dirty, false);
});

check('in GitHub Actions without git it comes from GITHUB_SHA', () => {
  assert.equal(buildStamp({ GITHUB_SHA: SHA }, noGit, NOW).source, 'ci');
});

check('something that is not a commit is ignored and nothing is invented', () => {
  const s = buildStamp({ EAS_BUILD_GIT_COMMIT_HASH: 'rm -rf /', GITHUB_SHA: 'zzz' }, noGit, NOW);
  assert.equal(s.sha, '');
  assert.equal(s.source, 'unknown');
  assert.equal(buildStamp({}, () => '', NOW).source, 'unknown');
});

check('the app config keeps what app.json says and adds the stamp under extra.build', () => {
  const out = appConfig({ config: cfg }, stamp);
  assert.equal(out.name, 'CaminoPlus');
  assert.deepEqual(out.plugins, ['expo-router']);
  assert.equal(out.extra.other, 1);
  assert.deepEqual(out.extra.build, stamp());
});

check('before the project is linked to EAS nothing about updates is switched on', () => {
  const out = appConfig({ config: cfg }, stamp);
  assert.equal(out.updates, undefined);
  assert.equal(out.runtimeVersion, undefined);
});

check('once extra.eas.projectId is there, updates switch on with the fingerprint policy', () => {
  const out = appConfig({ config: { ...cfg, extra: { eas: { projectId: 'abc-123' } }, updates: { checkAutomatically: 'ON_LOAD' } } }, stamp);
  assert.equal(out.updates.url, 'https://u.expo.dev/abc-123');
  assert.equal(out.updates.checkAutomatically, 'ON_LOAD');
  assert.deepEqual(out.runtimeVersion, { policy: 'fingerprint' });
  assert.equal(out.extra.eas.projectId, 'abc-123');
});

check('Expo\'s native fingerprint does not move when the stamp does', async () => {
  const { createFingerprintAsync } = require('@expo/fingerprint');
  const root = path.resolve(__dirname, '..');
  const a = await createFingerprintAsync(root);
  await new Promise((r) => setTimeout(r, 1500)); // the stamp holds the time, so the second evaluation is different
  const b = await createFingerprintAsync(root);
  assert.equal(a.hash, b.hash, 'the fingerprint moved between two evaluations: something in the app config changes on every build and fingerprint.config.js does not skip it');
  assert.ok(!JSON.stringify(a.sources).includes('builtAt'), 'the build stamp is part of what the fingerprint hashes');
});

(async () => {
  for (const [name, fn] of checks) {
    await fn();
    n += 1;
    console.log(`ok   ${name}`);
  }
  console.log(`${n} of ${n} passed`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
