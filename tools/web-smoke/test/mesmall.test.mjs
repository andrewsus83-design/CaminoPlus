// The scenarios of Me on small phones (mesmall.scenarios.mjs) are in the plan, in light and in dark, for someone signed in with a journey: a scenario nobody runs would be a measurement nobody takes. They
// name the four phones the owner asked for (360 x 640, 375 x 667, 390 x 844, 320 x 568), one scenario for each, so that a failure names the phone and the deadline of one is not shared with the others;
// they measure what the browser draws (the box of the chat button and the boxes of the strip: never the source of the app), and say in their names what they hold.
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
const names = ME_SMALL_SCENARIOS.map((s) => s.name);

test('nine walks of Me on small phones are in the plan: the strip once for each of four phones, the long description three times, the My Camino card, the grid captions and the highlight names', () => {
  assert.equal(ME_SMALL_SCENARIOS.length, 9);
  for (const s of ME_SMALL_SCENARIOS) {
    assert.ok(SCENARIOS.includes(s), `${s.name} is in the list of scenarios`);
    assert.equal(s.persona, 'in', 'Me is for someone with a journey');
  }
  assert.equal(new Set(names).size, 9, 'every name is its own: a failure says which phone');
  const strips = names.filter((n) => /the strip of four sub-tabs ends above the gold chat button|labels of the strip are above the tab bar/.test(n));
  assert.equal(strips.length, 4, 'one strip scenario for each size');
  for (const size of ['360 x 640', '375 x 667', '390 x 844', '320 x 568']) assert.equal(strips.filter((n) => n.includes(`at ${size} `)).length, 1, `one for ${size}`);
  const joined = names.join('\n');
  for (const must of [/at 320 x 568 the labels of the strip are above the tab bar and Notes, Journey and Plan are clear of the chat button on every sub-tab; Health is covered, held to what it is today/, /with a long description \(160 characters\) at 375 x 667 and the 20 px status bar of an iPhone SE the strip clears the chat button/, /with a long description \(160 characters\) at 360 x 640 and the 24 px status bar of an Android phone the word Health is clear of the chat button/, /with a long description at 390 x 760/, /the My Camino card cuts no word at 320, 344, 348, 352, 356, 360, 375 and 390 wide/, /the words on a tile are 15 px or more/, /Roncesvalles on one line/]) assert.match(joined, must);
  const tasks = buildTasks({ routes: [], scenarios: ME_SMALL_SCENARIOS });
  assert.equal(tasks.length, 18, 'nine scenarios, each in light and in dark');
  assert.deepEqual([...new Set(tasks.map((t) => t.scheme))].sort(), ['dark', 'light']);
  assert.ok(tasks.every((t) => !t.offline), 'online: Me\'s header needs no signal, and the offline sweep already opens it');
});

test('the walks of the long description use the fixture of the long description (data: longbio) and no other walk does', () => {
  const longOnes = ME_SMALL_SCENARIOS.filter((s) => s.data === 'longbio');
  assert.equal(longOnes.length, 3, 'the correction at 390 x 760 and the two phones with a status bar');
  for (const s of longOnes) assert.match(s.name, /long description/);
  assert.ok(SCENARIOS.filter((s) => s.data === 'longbio').every((s) => ME_SMALL_SCENARIOS.includes(s)), 'no scenario outside this file asks for it: the other walks keep the one-line description');
  assert.ok(ME_SMALL_SCENARIOS.filter((s) => s.data !== 'longbio').every((s) => s.data === undefined), 'the others have the default account');
});

test('the walks measure the four phones of the brief on all four sub-tabs, and what they assert is a share of the Health cell, a clear space and the labels above the tab bar', () => {
  for (const size of [/width: 360, height: 640, clears: true/, /width: 375, height: 667, clears: true/, /width: 390, height: 844, clears: true/, /width: 320, height: 568, clears: false/]) assert.match(code, size);
  assert.match(code, /for \(const tab of \['Journey', 'Notes', 'Plan', 'Health'\]\)/, 'on every sub-tab: Notes has its own host (a list), the others share one');
  assert.match(code, /c\.cell === 0/, 'the chat button covers none of the Health cell');
  assert.match(code, /c\.clear >= AIR - 1/, 'with the air the app keeps');
  assert.match(code, /b\.y \+ b\.height <= g\.barTop \+ 1/, 'the labels are above the tab bar: a strip under it cannot be tapped (the old layout at 320 x 568, and at 320 x 640, put it there with a share of 0 percent: the share alone would not have said so)');
  assert.match(code, /await usePhone\(page, s\);\s*step\(/, 'the phone is sized before Me opens, so the first draw is the one measured');
  // 320 x 568 is not a pass and the walk says what it is held to: the known covered share is an upper bound, asserted
  assert.match(code, /const KNOWN_320_568 = \{ cell: 0\.55, word: 0\.8 \};/);
  assert.match(code, /assert\(c\.cell <= KNOWN_320_568\.cell/);
  assert.match(code, /assert\(c\.word <= KNOWN_320_568\.word/);
  assert.match(code, /Emulation\.setSafeAreaInsetsOverride/, 'the status bar of a phone is asked of Chromium, and the walks say which one they have');
});

test('the walks of the long description hold the header to the same height as with one line, and to the clear space of a phone with that status bar', () => {
  assert.match(code, /\{ width: 375, height: 667, top: 20, bottom: 0, what: 'an iPhone SE', clears: true \}/);
  assert.match(code, /\{ width: 360, height: 640, top: 24, bottom: 0, what: 'an Android phone', clears: false, short: 12 \}/, 'the 640 phone with a status bar is held to the known 11 px, with 12 as the bound');
  assert.match(code, /Math\.abs\(short\.stripBottom - ends\.Journey\) <= 1/, 'the strip ends in the same place with 160 characters and with one line');
  assert.match(code, /line\.height <= 26/, 'one line of the description, however long the text');
  assert.match(code, /el\.scrollWidth > el\.clientWidth \+ 1/, 'and its end is cut off: the cue that there is more');
  assert.doesNotMatch(code, /Read more/, 'the web has no onTextLayout, so a walk cannot see that row: nothing here pretends to');
});

test('the walk of the card holds the switch at 352: the button is at the end of the head from there, under the words below it, and the card does not grow by a line at the switch', () => {
  assert.match(code, /const CARD_WIDTHS = \[320, 344, 348, 352, 356, 360, 375, 390\];/);
  assert.match(code, /const CARD_WIDE = 352;/);
  assert.match(code, /pill\.y < route\.y/);
  assert.match(code, /c\.height <= 130/);
});

test('the walks read the screen the way a person sees it: boxes and computed styles, never the source of the app and never a number copied from it', () => {
  assert.doesNotMatch(code, /readFileSync|from '\.\.\/\.\.\/mobile|mobile\/src/, 'no reading of the app\'s files');
  assert.match(code, /boundingBox\(\)/);
  assert.match(code, /getComputedStyle/);
  assert.doesNotMatch(code, /waitForTimeout|setTimeout\(/, 'nothing waits a fixed time: it waits for what a person waits for');
});
