// The scenarios of Me on small phones (mesmall.scenarios.mjs) are in the plan, in light and in dark, for someone signed in with a journey: a scenario nobody runs would be a measurement nobody takes. They
// name the four phones the owner asked for (360 x 640, 375 x 667, 390 x 844, 320 x 568), measure what the browser draws (the box of the chat button and the boxes of the strip: never the source of the app),
// and say in their names what they hold, so that a failure names the screen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTasks } from '../plan.mjs';
import { ME_SMALL_SCENARIOS } from '../mesmall.scenarios.mjs';
import { SCENARIOS } from '../scenarios.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'mesmall.scenarios.mjs'), 'utf8');
const code = source.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

test('the three walks of Me on small phones are in the plan: the strip against the chat button, the My Camino card, the grid captions and the highlight names', () => {
  assert.equal(ME_SMALL_SCENARIOS.length, 3);
  for (const s of ME_SMALL_SCENARIOS) {
    assert.ok(SCENARIOS.includes(s), `${s.name} is in the list of scenarios`);
    assert.equal(s.persona, 'in', 'Me is for someone with a journey');
  }
  const names = ME_SMALL_SCENARIOS.map((s) => s.name).join('\n');
  for (const must of [/at 360 x 640, 375 x 667 and 390 x 844 the strip of four sub-tabs ends above the gold chat button/, /at 320 x 568 its labels are above the tab bar/, /the My Camino card cuts no word at 320, 360, 375 and 390 wide/, /the words on a tile are 15 px or more/, /Roncesvalles on one line/]) assert.match(names, must);
  const tasks = buildTasks({ routes: [], scenarios: ME_SMALL_SCENARIOS });
  assert.equal(tasks.length, 6, 'three scenarios, each in light and in dark');
  assert.deepEqual([...new Set(tasks.map((t) => t.scheme))].sort(), ['dark', 'light']);
  assert.ok(tasks.every((t) => !t.offline), 'online: Me\'s header needs no signal, and the offline sweep already opens it');
});

test('the strip walk measures the four phones of the brief on all four sub-tabs, and what it asserts is a share of the Health cell, a clear space and the labels above the tab bar', () => {
  for (const size of [/width: 360, height: 640, clears: true/, /width: 375, height: 667, clears: true/, /width: 390, height: 844, clears: true/, /width: 320, height: 568, clears: false/]) assert.match(code, size);
  assert.match(code, /for \(const tab of \['Journey', 'Notes', 'Plan', 'Health'\]\)/, 'on every sub-tab: Notes has its own host (a list), the others share one');
  assert.match(code, /share === 0/, 'the chat button covers none of the Health cell');
  assert.match(code, /clear >= AIR - 1/, 'with the air the app keeps');
  assert.match(code, /b\.y \+ b\.height <= g\.barTop \+ 1/, 'the labels are above the tab bar: a strip under it cannot be tapped (the old layout at 320 x 568, and at 320 x 640, put it there with a share of 0 percent: the share alone would not have said so)');
  assert.match(code, /await page\.setViewportSize\(\{ width: s\.width, height: s\.height \}\);\s*step\(/, 'the phone is sized before Me opens, so the first draw is the one measured');
});

test('the walks read the screen the way a person sees it: boxes and computed styles, never the source of the app and never a number copied from it', () => {
  assert.doesNotMatch(code, /readFileSync|from '\.\.\/\.\.\/mobile|mobile\/src/, 'no reading of the app\'s files');
  assert.match(code, /boundingBox\(\)/);
  assert.match(code, /getComputedStyle/);
  assert.doesNotMatch(code, /waitForTimeout|setTimeout\(/, 'nothing waits a fixed time: it waits for what a person waits for');
});
