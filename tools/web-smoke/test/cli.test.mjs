// The command line, end to end: the exit code is what CI sees. A plant of failures must make it non-zero and name them; a clean app must make it zero.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUPABASE, fakeExport, fakeSource } from './helpers.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (args) => spawnSync(process.execPath, ['smoke.mjs', ...args], { cwd: root, env: { ...process.env, SMOKE_SUPABASE_URL: SUPABASE, CI: '' }, encoding: 'utf8', timeout: 240_000 });
const clean = (...dirs) => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));

test('a clean app: exit code 0', async () => {
  const [app, source] = [await fakeExport(), await fakeSource(['ok'])];
  try {
    const r = run(['--app', app, '--source', source, '--no-scenarios', '--timeout', '8000']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /web-smoke: OK, 16 checks/); // 1 route x 3 account states x light/dark x online/offline, plus the empty account of the two signed-in states (light, online and offline)
  } finally {
    await clean(app, source);
  }
});

test('an app that throws, logs an error and calls a stranger: exit code 1, every failure named with its route, scheme and mode', async () => {
  const [app, source, art] = [await fakeExport(), await fakeSource(['ok', 'throws', 'console-error', 'third-party']), await mkdtemp(join(tmpdir(), 'web-smoke-art-'))];
  try {
    const r = run(['--app', app, '--source', source, '--no-scenarios', '--timeout', '8000', '--artifacts', art, '--only', 'online']);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    for (const must of [
      /FAIL {2}\/throws {2}\[light, online, signed out\]/,
      /FAIL {2}\/throws {2}\[dark, online, signed in, with a journey\]/,
      /\[pageerror\] Error: boom from a screen/,
      /FAIL {2}\/console-error/,
      /\[console\.error\] something is wrong in this screen/,
      /\[unexpected-host\] GET https:\/\/tracker\.example\.test\/collect/,
      /Hosts the app called that nobody mocked: tracker\.example\.test/,
      /web-smoke: FAILED, 24 of 32 checks failed/, // 3 broken routes x 8 online checks; /ok is clean
    ]) assert.match(r.stdout, must);
    assert.doesNotMatch(r.stdout, /FAIL {2}\/ok /);
    const files = await readdir(art);
    assert.ok(files.some((f) => f.endsWith('.png')) && files.some((f) => f.endsWith('.txt')), `no screenshot or report kept: ${files}`);
  } finally {
    await clean(app, source, art);
  }
});

test('an export that is not there, and a plan with nothing in it, are not green either', async () => {
  const source = await fakeSource(['ok']);
  const app = await fakeExport();
  try {
    const none = run(['--app', join(tmpdir(), 'web-smoke-no-such-export'), '--source', source, '--no-scenarios']);
    assert.equal(none.status, 2, none.stdout + none.stderr);
    assert.match(none.stderr, /index\.html not found/);
    const empty = run(['--app', app, '--source', source, '--no-scenarios', '--only', 'matches-nothing']);
    assert.equal(empty.status, 2, empty.stdout + empty.stderr);
    assert.match(empty.stderr, /nothing to run/);
  } finally {
    await clean(app, source);
  }
});
