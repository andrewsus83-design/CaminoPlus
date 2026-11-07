// Playwright is pinned to one exact version here and in tools/offline-maps (a new version changes what a test sees: see .github/dependabot.yml).
// The two must agree, so they fetch the same Chromium and a bump of one cannot leave the other behind.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const json = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

test('playwright is pinned to an exact version, the same as tools/offline-maps pins, and the lockfile agrees', () => {
  const mine = json('package.json').devDependencies.playwright;
  const theirs = json('../offline-maps/package.json').devDependencies.playwright;
  assert.match(mine, /^\d+\.\d+\.\d+$/, `"${mine}" is not an exact version (no ^ or ~)`);
  assert.equal(mine, theirs, 'tools/web-smoke and tools/offline-maps pin different Playwright versions');
  const lock = json('package-lock.json');
  assert.equal(lock.packages['node_modules/playwright'].version, mine);
  assert.equal(lock.packages['node_modules/playwright-core'].version, mine);
});
