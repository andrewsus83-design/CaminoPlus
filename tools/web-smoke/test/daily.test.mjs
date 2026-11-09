// The scenarios of the Daily reading (daily.scenarios.mjs) are in the plan, in light and in dark, for someone signed in with a journey: a scenario
// nobody runs would be a screen nobody walks through. And they never name a date, because the browser's clock is the phone's: "today" is whatever
// day the run is on, so a date written in a scenario would turn the check red on another day.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTasks } from '../plan.mjs';
import { DAILY_SCENARIOS } from '../daily.scenarios.mjs';
import { SCENARIOS } from '../scenarios.mjs';

const here = dirname(fileURLToPath(import.meta.url));

test('the five walks of the Daily reading are in the plan: the header and the strip, the calendar sheet, the bookmark, the readings, the date of the address', () => {
  assert.equal(DAILY_SCENARIOS.length, 5);
  for (const s of DAILY_SCENARIOS) {
    assert.ok(SCENARIOS.includes(s), `${s.name} is in the list of scenarios`);
    assert.equal(s.persona, 'in', 'the screen is for someone with a journey');
    assert.ok(s.name.startsWith('Daily reading: '), s.name);
  }
  const names = DAILY_SCENARIOS.map((s) => s.name).join('\n');
  for (const must of [/one row of 44 pt buttons; the strip has exactly seven days of 44 pt/, /Calendar button opens the sheet; Escape, Close and a tap outside close it/, /Bookmark button toggles and the day is kept/, /the readings of a day are references of the Lectionary for Mass used in the United States with the words of the Bible in the app/, /\?date= opens that day/]) assert.match(names, must);
  const tasks = buildTasks({ routes: [], scenarios: DAILY_SCENARIOS });
  assert.equal(tasks.length, 10, 'five scenarios, each in light and in dark');
  assert.deepEqual([...new Set(tasks.map((t) => t.scheme))].sort(), ['dark', 'light']);
  assert.ok(tasks.every((t) => !t.offline), 'online: the screen asks the network for nothing, and the offline sweep already opens it');
});

test('no scenario of the Daily reading names a day of the calendar by its date, except the dates it hands to the address on purpose', () => {
  const src = readFileSync(join(here, '..', 'daily.scenarios.mjs'), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const dates = [...src.matchAll(/\b\d{4}-\d{1,2}-\d{1,2}\b/g)].map((m) => m[0]).sort();
  assert.deepEqual(dates, ['2019-03-03', '2026-02-30', '2026-12-25', '2026-1-5', '2026-13-01', '2026-11-08', '2026-11-08', '2026-11-11', '2026-09-08', '2026-05-31', '2026-11-12', '2026-11-26', '2027-01-17', '2026-12-06', '2026-12-24', '2026-12-25', '2026-12-26'].sort(), 'only the dates given to ?date=: the days whose readings the scenario knows (a Sunday, a memorial, a reference with no words, a day with no readings)');
  assert.doesNotMatch(src, /new Date\(|Date\.now\(/, 'the clock is the browser\'s, found through the day that says "today"');
});
