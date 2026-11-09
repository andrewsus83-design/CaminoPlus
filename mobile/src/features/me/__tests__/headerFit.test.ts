// Plain-node checks of the header of Me on a short phone, and of the words of the My Camino card. The gold chat button floats at the bottom right, 8 px above the tab bar, and the strip of
// sub-tabs (Notes, Journey, Plan, Health) used to end under it on a short phone: the owner's QA measured 58 to 63 percent of the Health cell covered at 390 and 360 wide and 667 high, and the
// first screen read "Notes Journey Plan H". The button and the strip are as they were; the header above the strip is drawn compact when it would not clear the button (features/me/headerFit.ts).
// The numbers are pure; the walls (the button's own numbers, the wiring in me.tsx) are source read as text, in the style of the other wiring tests; what the browser draws, and how much of the Health
// cell is covered at 360 x 640, 375 x 667, 390 x 844 and 320 x 568, is the web smoke (tools/web-smoke/mesmall.scenarios.mjs). No React, no React Native, no network.
// Run: npm run test:me (it is run from highlights.test.ts).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NBSP, caminoLine, stagesDoneText } from '../caminoCard';
import { CARD_WIDE, DENSITY, FAB_ABOVE_BAR, FAB_SIZE, ROOMY_STRIP_BOTTOM, STRIP_AIR, TAB_BAR_HEIGHT, chatButtonTop, headerDensity, headerRoom, stripOverflows } from '../headerFit';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };
const root = process.cwd(); // npm test runs from mobile/
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const code = (src: string) => src.split('\n').filter((l) => !/^\s*(\/\/|\/?\*)/.test(l)).join('\n'); // without comment lines
const me = read('app/(tabs)/me.tsx');
const tokens = JSON.parse(read('src/theme/tokens.json')) as { space: Record<string, number>; layout: Record<string, number> };
const plain = (s: string) => s.split(NBSP).join(' ');

/* ================================================================ where the chat button is */

check('the numbers of the chat button are the ones of Fab.tsx and TabBar.tsx: 60 round, 8 above a bar of 88 that sits max(inset - 14, 10) above the bottom edge', () => {
  const fab = read('src/components/Fab.tsx');
  const bar = read('src/components/TabBar.tsx');
  assert.match(fab, /bottom: Math\.max\(insets\.bottom - 14, 10\) \+ 88 \+ 8, width: 60, height: 60/, 'the button: if this moves, headerFit.ts must move with it');
  assert.match(bar, /bottom: Math\.max\(insets\.bottom - 14, 10\), height: 88/, 'the tab bar');
  assert.equal(FAB_SIZE, 60);
  assert.equal(TAB_BAR_HEIGHT, 88);
  assert.equal(FAB_ABOVE_BAR, 8);
  assert.match(code(read('src/features/me/headerFit.ts')), /Math\.max\(bottomInset - 14, 10\) \+ TAB_BAR_HEIGHT \+ FAB_ABOVE_BAR/, 'headerFit.ts does the same sum');
});

check('the top edge of the chat button, as the browser measures it (tools/web-smoke): 678 on a 390 x 844 screen with no home bar, 501 at 667, 474 at 640, and 668 with a home bar of 34', () => {
  assert.equal(chatButtonTop(844, 0), 678);
  assert.equal(chatButtonTop(667, 0), 501);
  assert.equal(chatButtonTop(640, 0), 474);
  assert.equal(chatButtonTop(568, 0), 402);
  assert.equal(chatButtonTop(844, 34), 668, 'a home bar of 34: the bar and the button sit 10 higher');
  assert.equal(chatButtonTop(844, 20), 678, 'a home bar of 20 or less changes nothing (max(inset - 14, 10) is 10 up to 24)');
  assert.equal(chatButtonTop(800, 48), 800 - (34 + 96) - 60, 'three buttons at the bottom of an Android phone');
});

/* ================================================================ roomy or compact */

check('a phone with room for the whole header gets the roomy one; a short phone, with its status bar, gets the compact one', () => {
  const roomy = (screenHeight: number, top = 0, bottom = 0, fontScale = 1) => headerDensity({ screenHeight, insets: { top, bottom }, fontScale }) === 'roomy';
  // tall phones: room above the button for the 568 of the roomy header, the status bar included
  assert.ok(roomy(844, 0, 0), '390 x 844 as the browser has it (no inset)');
  assert.ok(roomy(844, 47, 34), 'an iPhone 14: status bar 47, home bar 34');
  assert.ok(roomy(812, 50, 34), 'an iPhone 13 mini');
  assert.ok(roomy(915, 24, 0), 'a Pixel 7');
  assert.ok(roomy(800, 24, 10), '360 x 800 with gesture navigation');
  // short ones: compact
  assert.ok(!roomy(667, 20, 0), 'an iPhone SE: status bar 20, 667 high');
  assert.ok(!roomy(667, 0, 0), '375 x 667 as the browser has it');
  assert.ok(!roomy(640, 0, 0), '360 x 640');
  assert.ok(!roomy(736, 0, 0), '390 x 736: the roomy strip (565) was clear of the button by 5 px there, not by the 8 px of air: compact, which clears it by 100');
  assert.ok(!roomy(740, 24, 48), '360 x 740 with the three buttons at the bottom');
  assert.ok(!roomy(720, 24, 0), '360 x 720');
  assert.ok(!roomy(568, 20, 0), 'the smallest phone');
  // a larger text size draws a taller header: a phone that has room at the normal size goes compact at 1.3
  assert.ok(roomy(844, 47, 34, 1), 'normal text');
  assert.ok(!roomy(844, 47, 34, 1.3), 'text set to 1.3 times: 568 x 1.3 is more than the room');
  assert.ok(roomy(844, 47, 34, 0.8), 'smaller text is not smaller than the header: the same as normal');
  assert.ok(roomy(844, 47, 34, undefined), 'no text size given: normal');
});

check('the room is counted from the top of the content, below the status bar, up to 8 px of air above the button; the strip that ends below it overflows', () => {
  assert.equal(STRIP_AIR, 8);
  assert.equal(headerRoom({ screenHeight: 844, insets: { top: 0, bottom: 0 } }), 678 - 8);
  assert.equal(headerRoom({ screenHeight: 667, insets: { top: 20, bottom: 0 } }), 501 - 20 - 8, 'an iPhone SE: 473');
  const fit = { screenHeight: 667, insets: { top: 20, bottom: 0 } };
  assert.equal(stripOverflows({ ...fit, stripBottom: 465, screenTop: 8 }), false, '8 + 465 = 473: exactly the room');
  assert.equal(stripOverflows({ ...fit, stripBottom: 466, screenTop: 8 }), true, 'one more px and the strip is closer than 8 px to the button');
  assert.equal(stripOverflows({ screenHeight: 844, insets: { top: 0, bottom: 0 }, stripBottom: 536, screenTop: 8 }), false, 'the roomy strip (544 with the 8) on 844: 670 of room');
  assert.ok(ROOMY_STRIP_BOTTOM >= 565, 'the roomy header of a plan with a long name is 565 (the strip of a short name is 544): the room asked for covers it');
});

check('what the two headers are made of: spacing from the space scale, the compact one smaller in every number that takes height, the gear never under the hard minimum of 48', () => {
  const steps = new Set(Object.values(tokens.space));
  for (const [density, m] of Object.entries(DENSITY)) {
    for (const k of ['afterHeader', 'beforeStrip', 'avatarGap', 'cardLift', 'cardGap', 'hlLift', 'hlLabelGap'] as const) assert.ok(steps.has(m[k]), `${density}.${k} = ${m[k]} is a step of the space scale`);
    assert.ok(m.gear >= tokens.layout.touchHard, `${density}: the gear is a touch target of at least 48`);
    assert.ok(m.avatar >= tokens.layout.touchHard, `${density}: the picture is a button (change profile picture), at least 48`);
    assert.ok(m.cardRing - 4 >= 36, `${density}: the shell on the card is at least 36`);
  }
  const [r, c] = [DENSITY.roomy, DENSITY.compact];
  for (const k of ['afterHeader', 'beforeStrip', 'gear', 'avatar', 'avatarGap', 'bioLines', 'cardLift', 'cardGap', 'cardRing', 'hlLift', 'hlLabelGap', 'hlLines'] as const) assert.ok(c[k] <= r[k], `compact.${k} (${c[k]}) is not more than roomy.${k} (${r[k]})`);
  assert.deepEqual([r.afterHeader, r.beforeStrip, r.gear, r.avatar, r.avatarGap, r.bioLines, r.cardRing], [16, 16, 52, 92, 20, 4, 52], 'the roomy header is the header as it was: 16 between its blocks, the 52 gear, the 92 picture, 4 lines of description, the 52 ring');
  assert.equal(r.statNumber, 'h3');
  assert.equal(r.statLabel, 'small');
  assert.equal(c.statNumber, 'h4', 'the counters of the compact header: the numbers one step smaller (24), the words the caption (15)');
  assert.equal(c.statLabel, 'caption');
  assert.ok(c.statLabel === 'caption' && c.avatar >= 56, 'and nothing is under 15 px');
  assert.equal(r.hlLines, 2);
  assert.equal(c.hlLines, 1);
});

check('Me draws the header in the density it is given: the numbers of the table, never its own, and both hosts get the same one', () => {
  const src = code(me);
  assert.match(src, /import \{ CARD_WIDE, DENSITY, headerDensity, stripOverflows \} from '@\/features\/me\/headerFit';/);
  assert.match(src, /const predicted = headerDensity\(fit\);/);
  assert.match(src, /const hm = DENSITY\[density\];/);
  assert.match(src, /const fit = \{ screenHeight: host\?\.height \?\? windowHeight, insets, fontScale: PixelRatio\.getFontScale\(\) \};/, 'the height the chat button floats over is the root view\'s own (measured), the window\'s until then');
  assert.match(src, /<View style=\{\{ flex: 1 \}\} onLayout=\{\(e\) => setHost\(\{ width: e\.nativeEvent\.layout\.width, height: e\.nativeEvent\.layout\.height \}\)\}>/, 'the root view is the one the button floats over');
  // the strip is measured once it is drawn: a roomy header that came out too tall turns compact, and the height it measured is kept (so it is not worked out again from the compact one, which would flip it back)
  assert.match(src, /const density = predicted === 'roomy' && roomyBottom !== null && stripOverflows\(\{ \.\.\.fit, stripBottom: roomyBottom, screenTop: layout\.screenTop \}\) \? 'compact' : predicted;/);
  assert.match(src, /if \(density === 'roomy'\) setRoomyBottom\(e\.nativeEvent\.layout\.height\);/, 'only a roomy header is measured, by its height: the strip is the last thing in it, and a height is what the web reports when something grows (a position alone it does not)');
  assert.match(src, /const top = \(\n    <View onLayout=\{checkStrip\}>/, 'the header is the view that is measured');
  assert.match(src, /<View style=\{\{ marginTop: hm\.beforeStrip \}\}>\s*<SubTabs tabs=\{ME_TABS\} value=\{tab\} onChange=\{setTab\} \/>\s*<\/View>\s*<\/View>\s*\);/, 'the strip is still the four tabs of ME_TABS, in one strip, the last thing of the header');
  // every number of the header that changes with the density comes from the table
  for (const use of ['hm.afterHeader', 'hm.beforeStrip', 'hm.gear', 'hm.avatar', 'hm.avatarGap', 'hm.bioLines', 'hm.cardLift', 'hm.cardGap', 'hm.cardRing', 'hm.statNumber', 'hm.statLabel']) assert.ok(src.includes(use), `me.tsx uses ${use}`);
  assert.match(src, /<Highlights [^\n]*dense=\{density === 'compact'\} \/>/, 'the row is told');
  // the hosts: `top` is one view, drawn once in each host, and it is the same node in both
  assert.equal((src.match(/\{top\}/g) ?? []).length, 2, 'drawn in the two hosts: once in each');
  assert.doesNotMatch(src, /Dimensions\.get|useWindowDimensions\(\)\.width < |Platform\.OS === 'web' \? /, 'no size and no platform decides the density but the maths of headerFit.ts');
});

/* ================================================================ the My Camino card */

check('the card says "1 stage done" and "0 stages done": the word agrees with the number (it said "1 stages done")', () => {
  assert.equal(plain(stagesDoneText(0)), '0 stages done');
  assert.equal(plain(stagesDoneText(1)), '1 stage done');
  assert.equal(plain(stagesDoneText(2)), '2 stages done');
  assert.equal(plain(stagesDoneText(11)), '11 stages done');
  assert.equal(plain(stagesDoneText(33)), '33 stages done');
  assert.equal(plain(stagesDoneText(1.9)), '1 stage done', 'a fraction is dropped: stages are whole');
  for (const junk of [-1, -7, Number.NaN, Infinity, -Infinity, 0.4]) assert.equal(plain(stagesDoneText(junk)), '0 stages done', `${junk} is none`);
  assert.equal(plain(stagesDoneText(undefined as unknown as number)), '0 stages done', 'no number yet (the plan has not loaded): none');
});

check('the line under the route: "From stage 3 · 12 stages done", and without the start of the journey just the stages; the parts do not break in the middle', () => {
  assert.equal(plain(caminoLine(1, 1)), 'From stage 1 · 1 stage done');
  assert.equal(plain(caminoLine(1, 0)), 'From stage 1 · 0 stages done');
  assert.equal(plain(caminoLine(3, 12)), 'From stage 3 · 12 stages done');
  assert.equal(plain(caminoLine(null, 4)), '4 stages done');
  assert.equal(plain(caminoLine(undefined, 1)), '1 stage done');
  assert.equal(plain(caminoLine(Number.NaN, 2)), '2 stages done', 'a start that is no number is left out');
  // the only spaces that can break the line are the ones around the dot: "From stage 3 ·" over "12 stages done"
  assert.deepEqual(caminoLine(3, 12).split(' '), [`From${NBSP}stage${NBSP}3`, '·', `12${NBSP}stages${NBSP}done`]);
  assert.deepEqual(caminoLine(null, 12).split(' '), [`12${NBSP}stages${NBSP}done`]);
});

check('the card keeps its words and its look on every phone: Buen Camino! in the gold of Caveat (the accent variant), My Camino in Fraunces, the route in white, the Change button gold, and nothing is cut', () => {
  const src = code(me);
  const card = src.slice(src.indexOf('accessibilityLabel="Change Camino"'), src.indexOf(') : <AppText variant="accent" color={role.accentText}>Buen Camino!'));
  assert.ok(card.length > 800, 'the card was found');
  assert.match(card, /<AppText variant="accent" color=\{c\.gold\} style=\{\{ fontSize: 24, lineHeight: 28 \}\}>Buen Camino!<\/AppText>/, 'the gold handwriting stays where it was: the first line of the card, beside the shell');
  assert.match(card, /<AppText variant="h4" color=\{role\.onInverseAccent\} style=\{\{ fontSize: 17, lineHeight: 21 \}\}>My Camino<\/AppText>/);
  assert.match(card, /<AppText variant="label" color=\{role\.onInverse\}>\{journey\.route\.name\}<\/AppText>/);
  assert.match(card, /<AppText variant="caption" color=\{role\.onInverse\} style=\{\{ opacity: 0\.85 \}\}>\{caminoLine\(/);
  assert.doesNotMatch(card, /numberOfLines|ellipsizeMode|adjustsFontSizeToFit/, 'no word of the card is cut, shrunk or ended with "…": it wraps');
  assert.ok(card.indexOf('Buen Camino!') < card.indexOf('My Camino') && card.indexOf('My Camino') < card.indexOf('{journey.route.name}'), 'the order: Buen Camino!, My Camino, the route, how far');
  assert.match(me, /const change = \(\s*<View style=\{\{ height: 40, paddingHorizontal: space\[4\], borderRadius: radius\.pill, backgroundColor: c\.gold, justifyContent: 'center' \}\}>\s*<AppText variant="label" color=\{role\.onHighlight\}>Change<\/AppText>/, 'the gold pill, 40 high');
  assert.match(card, /\{!narrow && <View style=\{\{ marginLeft: 'auto' \}\}>\{change\}<\/View>\}/, 'at the end of the head ...');
  assert.match(card, /\{narrow && change\}/, '... or at the end of the body on a very narrow phone');
  assert.ok(CARD_WIDE >= 336 && CARD_WIDE <= 360, 'the switch lies between 320 (the pill would squeeze "Buen Camino!" into two lines) and 360, where the head holds the shell, the words and the pill');
  assert.equal((card.match(/Buen Camino!/g) ?? []).length, 1, 'once, in the card: the owner only asked to take it off the daily card');
  assert.match(card, /alignItems: 'center', columnGap: space\[3\], rowGap: space\[2\]/, 'the head wraps by itself when the phone is narrower than its three parts');
});

console.log(`${n} of ${n} passed (Me header fit)`);
