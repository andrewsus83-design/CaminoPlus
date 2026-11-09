// The scenarios of the Maps tab (maps.scenarios.mjs) are in the plan, in light and in dark, for someone signed in with a journey: a scenario nobody runs would be
// controls nobody measures. And the numbers they measure are the tokens of design/tokens.json (a round control is layout.touchPrimary, the gap between two is space[3], the
// edge is layout.screenMargin): when a token changes, the scenario must be changed with it, on purpose, not left to pass or fail by accident.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTasks } from '../plan.mjs';
import { MAP_SCENARIOS } from '../maps.scenarios.mjs';
import { SCENARIOS } from '../scenarios.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const tokens = JSON.parse(readFileSync(join(here, '..', '..', '..', 'design', 'tokens.json'), 'utf8'));
const src = readFileSync(join(here, '..', 'maps.scenarios.mjs'), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

test('the three walks of the Maps tab are in the plan: the family and the overlaps on four phones, the folded controls, large text', () => {
  assert.equal(MAP_SCENARIOS.length, 3);
  for (const s of MAP_SCENARIOS) {
    assert.ok(SCENARIOS.includes(s), `${s.name} is in the list of scenarios`);
    assert.equal(s.persona, 'in', 'the screen is for someone with a journey');
    assert.ok(s.name.startsWith('Maps: '), s.name);
  }
  const names = MAP_SCENARIOS.map((s) => s.name).join('\n');
  for (const must of [/one family \(56 round buttons with a 28 icon, 12 apart, 16 from the edge/, /"Map options" in the sheet of the flag button/, /1\.5 and 2 times as big/]) assert.match(names, must);
  const tasks = buildTasks({ routes: [], scenarios: MAP_SCENARIOS });
  assert.equal(tasks.length, 5, 'two scenarios in light and in dark, the large text one in light');
  assert.deepEqual([...new Set(tasks.map((t) => t.scheme))].sort(), ['dark', 'light']);
  assert.ok(tasks.every((t) => !t.offline), 'online: the Maps tab draws the same with no signal, and the offline sweep already opens it');
});

test('the numbers of the Maps scenarios are the tokens', () => {
  const num = (name) => Number(new RegExp(`const ${name} = (\\d+);`).exec(src)?.[1]);
  assert.equal(num('BTN'), tokens.layout.touchPrimary, 'a round control');
  assert.equal(num('GAP'), tokens.space['3'], 'the gap between two');
  assert.equal(num('EDGE'), tokens.layout.screenMargin, 'the distance from the edge of the screen');
  assert.equal(tokens.icon.mdPlus, 28, 'the icon of a round control');
  assert.match(src, /c\.icon, 28/, 'the scenarios measure the 28 icon');
});

test('the scenarios never sleep for a fixed time: they wait for the screen to be still', () => {
  assert.doesNotMatch(src, /waitForTimeout|setTimeout\(/, 'no fixed waits');
});
