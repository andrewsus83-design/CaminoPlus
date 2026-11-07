// Plain-node checks for the build text of Settings > This build. Run: npm run test:lib
import assert from 'node:assert/strict';
import { describeBuild, formatWhen, type BuildInput } from '../buildInfo';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };

const base: BuildInput = {
  version: '1.0.0',
  stamp: { sha: '70ad36c2c3658a86257af2d4ff043e1b55cffcf4', shortSha: '70ad36c', dirty: false, committedAt: '2026-11-07T05:37:40+00:00', builtAt: '2026-11-07T06:00:00.000Z', source: 'git' },
  updatesEnabled: true, embedded: true, updateId: null, channel: 'preview', platform: 'ios',
};

check('times are shown in UTC, the same on every phone, and garbage shows nothing', () => {
  assert.equal(formatWhen('2026-11-07T05:37:40+00:00'), '7 Nov 2026, 05:37 UTC');
  assert.equal(formatWhen('2026-11-07T12:37:40+07:00'), '7 Nov 2026, 05:37 UTC');
  assert.equal(formatWhen('not a time'), '');
  assert.equal(formatWhen(''), '');
  assert.equal(formatWhen(undefined), '');
});

check('the commit and its time are named, and the version leads', () => {
  const t = describeBuild(base);
  assert.equal(t.title, 'CaminoPlus 1.0.0');
  assert.equal(t.code, 'Build 70ad36c · committed 7 Nov 2026, 05:37 UTC');
});

check('without a commit time the build time is used and called that', () => {
  const t = describeBuild({ ...base, stamp: { ...base.stamp, committedAt: '' } });
  assert.equal(t.code, 'Build 70ad36c · built 7 Nov 2026, 06:00 UTC');
});

check('uncommitted changes are never hidden', () => {
  assert.match(describeBuild({ ...base, stamp: { ...base.stamp, dirty: true } }).code, /^Build 70ad36c \+ local changes/);
});

check('a missing commit says unknown instead of inventing one', () => {
  assert.equal(describeBuild({ ...base, stamp: null }).code, 'Build: commit unknown');
  assert.equal(describeBuild({ ...base, stamp: { sha: '', shortSha: '', source: 'unknown' } }).code, 'Build: commit unknown');
});

check('a full sha is shortened when only that is known', () => {
  assert.match(describeBuild({ ...base, stamp: { sha: 'abcdef0123456789abcdef0123456789abcdef01' } }).code, /^Build abcdef0/);
});

check('updates: off, installed version, or the update that is running', () => {
  assert.equal(describeBuild({ ...base, updatesEnabled: false }).update, 'Updates: off in this build');
  assert.equal(describeBuild(base).update, 'Update: none yet, this is the installed version · channel preview');
  assert.equal(describeBuild({ ...base, embedded: false, updateId: 'a1b2c3d4-0000-4000-8000-000000000000' }).update, 'Update a1b2c3d4 · channel preview');
  assert.equal(describeBuild({ ...base, embedded: false, updateId: 'a1b2c3d4-0000-4000-8000-000000000000', channel: null }).update, 'Update a1b2c3d4');
});

check('the text to copy for a bug report holds all of it, one line each', () => {
  const t = describeBuild(base);
  assert.deepEqual(t.copy.split('\n'), [t.title, t.code, t.update, 'Platform: ios']);
});

console.log(`${n} of ${n} passed`);
