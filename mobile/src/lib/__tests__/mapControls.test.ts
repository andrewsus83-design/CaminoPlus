// Plain-node checks that the controls on the map are ONE family, in the code. Run: npm run test:lib
//
// The owner asked for the map's re-center and zoom controls to be as big as Google Maps': round buttons of 56 (layout.touchPrimary) with a 28 icon (icon.mdPlus), the Re-center pill 56
// high with its label at the `label` variant, 16 from the edge of the screen, 12 apart; the zoom pair one capsule of 56 by 112. features/map/WalkUi.tsx draws them, app/(tabs)/maps.tsx puts
// them on the screen, features/map/controlLayout.ts says how many fit. This reads those files, so that a control that goes back to its own size, a text under 15 or a colour that
// follows the app's dark mode fails here. The browser run that measures the real screen is tools/web-smoke/maps.scenarios.mjs; the arithmetic is
// features/map/__tests__/controlLayout.test.ts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };
const root = process.cwd(); // npm test runs from mobile/
const read = (p: string) => readFileSync(join(root, p), 'utf8');
/** The file without its comments, so that a rule written in a comment cannot satisfy a check. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const walk = read('src/features/map/WalkUi.tsx');
const maps = read('app/(tabs)/maps.tsx');
const bell = read('src/features/social/help/HelpBellButton.tsx');
const liveMap = read('src/features/map/LiveMap.tsx');
const tokens = JSON.parse(read('src/theme/tokens.json')) as { layout: Record<string, number>; icon: Record<string, number>; space: Record<string, number> };
const between = (s: string, from: string, to: string) => {
  const a = s.indexOf(from);
  const b = s.indexOf(to, a + from.length);
  assert.ok(a >= 0 && b > a, `${from} ... ${to}`);
  return s.slice(a, b);
};

check('the numbers of the family are tokens: 56, 28, 12 and 16', () => {
  assert.equal(tokens.layout.touchPrimary, 56);
  assert.equal(tokens.icon.mdPlus, 28);
  assert.equal(tokens.space['3'], 12);
  assert.equal(tokens.layout.screenMargin, 16);
  const w = code(walk);
  assert.match(w, /export const BTN = layout\.touchPrimary;/);
  assert.match(w, /export const ICON = icon\.mdPlus;/);
  assert.match(w, /export const GAP = space\[3\];/);
  assert.match(w, /export const EDGE = layout\.screenMargin;/);
});

check('every round control is BTN: the round button, the two halves of the zoom capsule (the capsule is two of them), the Re-center pill and the buttons of the card', () => {
  const w = code(walk);
  assert.match(between(w, 'export function RoundBtn', 'export function CompassIcon'), /width: BTN, height: BTN, borderRadius: radius\.pill/);
  const zoom = between(w, 'export function ZoomPair', 'export function NearChips');
  assert.match(zoom, /width: BTN, height: 2 \* BTN, borderRadius: radius\.pill/, 'the capsule is 56 by 112');
  assert.match(zoom, /width: BTN, height: BTN, alignItems: 'center'/, 'each half is 56 by 56');
  assert.match(zoom, /MapIcon name=\{name\} color=\{t\.icon\} size=\{ICON\}/, 'the icons of the zoom pair are the 28 of the family');
  const pill = between(w, 'export function RecenterPill', 'type CardProps');
  assert.match(pill, /height: BTN, maxWidth/, 'the pill is 56 high and never wider than the room the column leaves it');
  assert.match(pill, /size=\{icon\.md\}/, 'a 24 arrow');
  assert.match(pill, /variant="label"/, 'the label at the label variant (17, SemiBold)');
  assert.match(pill, /maxFontSizeMultiplier=\{CONTROL_TEXT_MAX\}/, 'the label stops growing at 1.3 so the pill keeps its place');
  const card = between(w, 'export function WalkCard', 'Next on the way');
  assert.match(card, /width: BTN, height: BTN, borderRadius: radius\.pill, backgroundColor: c\.gold/, 'the flag button of the card');
  assert.match(card, /flex: 1, height: BTN, borderRadius: radius\.pill, backgroundColor: c\.red/, 'Exit');
  assert.doesNotMatch(card, /width: 60|height: 60/, 'no 60 left in the row of buttons of the card');
});

check('every icon of a control is ICON: no icon with a size of its own in maps.tsx, and the compass and the sun are drawn at the same size', () => {
  const m = code(maps);
  const onMap = between(m, 'export default function Maps', 'function PoiPopup'); // the pop-up card of a place is not a control of the map
  assert.doesNotMatch(onMap, /size=\{\d+\}/, 'no number as an icon size in the controls of maps.tsx');
  assert.doesNotMatch(onMap, /size=\{(?!ICON\b|BTN\b|icon\.sm\b)\w+\}/, 'only ICON (28), icon.sm (the status pill) and BTN (the bell, which draws half of it)');
  const w = code(walk);
  assert.match(w, /export function CompassIcon\(\{ bearing, night, size = ICON \}/);
  assert.match(w, /export function LightIcon\(\{ night, auto, size = ICON, color \}/);
  // the help bell draws half its size: 56 gives 28
  assert.match(code(bell), /size=\{Math\.round\(size \* 0\.5\)\}/);
  assert.equal(Math.round(tokens.layout.touchPrimary * 0.5), tokens.icon.mdPlus);
  assert.match(m, /<HelpBellButton key="bell" tone=\{night \? 'night' : 'day'\} size=\{BTN\}/);
});

check('no text of the map controls is under 15: no fontSize of its own, the badge and the labels are AppText variants', () => {
  for (const [name, src] of [['WalkUi.tsx', walk], ['maps.tsx', maps], ['HelpBellButton.tsx', bell]] as const) {
    assert.doesNotMatch(code(src), /fontSize:\s*\d/, `${name} has a fontSize of its own`);
    assert.doesNotMatch(code(src), /letterSpacing:\s*\d/, `${name} has a letterSpacing of its own`);
  }
  const badge = between(code(walk), 'export function LightIcon', 'export function ZoomPair');
  assert.match(badge, /<AppText variant="label"[^>]*>A<\/AppText>/, 'the A of the automatic light is a label (17), not a 11');
  assert.match(code(walk), /<AppText variant="mono"[^>]*textTransform: 'uppercase'[^>]*>Next on the way<\/AppText>/, 'the heading of the card is mono 15, not a 12');
});

check('the overlay has its own day and night: its palette is the fixed one, never c.* (which flips with the app\'s dark mode and left the night icons dark on dark)', () => {
  const theme = between(code(walk), 'export function walkTheme', 'export type WalkTheme');
  assert.doesNotMatch(theme, /\bc\.\w+/, 'walkTheme reads c.*');
  assert.match(theme, /fixed\.parchment/);
  assert.match(code(bell), /fixed\.parchment/, 'the bell button on the map: the fixed cream');
  assert.doesNotMatch(code(bell), /\bc\.(parchment|red)\b/);
  const layer = between(code(maps), 'function LayerSwitch', 'function OptionRow');
  assert.doesNotMatch(layer, /\bc\.(blue|parchment)\b/, 'the switch of the layers follows the map light, not the app mode');
});

check('QA finding D: the top row of the whole route wraps instead of overflowing, so "Whole route / Near me" and the offline maps button never touch (320 wide)', () => {
  const m = code(maps);
  assert.match(m, /flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: GAP/, 'one row that wraps, GAP apart');
  assert.match(m, /<RoundBtn night=\{night\} label="Offline maps"/, 'the offline maps button is a round control, 56');
  const layer = between(m, 'function LayerSwitch', 'function OptionRow');
  assert.match(layer, /height: layout\.touchHard/, 'the tabs of the switch are 48 high (were 40), 56 with the 4 round them: as high as a round control');
  assert.match(layer, /padding: space\[1\]/);
  assert.match(layer, /maxFontSizeMultiplier=\{CONTROL_TEXT_MAX\}/);
  assert.match(m, /compact=\{screenW < 350\}/, 'a narrow phone gets the narrow padding');
  // "Whole route" and "Near me" at 17 px SemiBold are about 100 and 66: with 8 beside each word, the 4 round them and the 12 gap, the row is 206 + 12 + 56 = 274 of the 288 of a 320 phone
  assert.ok(2 * 8 * 2 + 100 + 66 + 8 + tokens.space['3'] + tokens.layout.touchPrimary <= 320 - 2 * tokens.layout.screenMargin, 'fits in one row at 320');
});

check('the column and the pill: 16 from the right edge, level at the bottom (12 above the card), 16 above the tab bar on the whole route; the notices leave the column its width', () => {
  const m = code(maps);
  assert.match(m, /position: 'absolute', right: EDGE, bottom: cardH \+ GAP/, 'the Walk view column');
  assert.match(m, /position: 'absolute', left: EDGE, bottom: cardH \+ GAP/, 'the pill');
  assert.match(m, /position: 'absolute', right: EDGE, bottom: tabTop \+ EDGE/, 'the whole route column');
  assert.match(m, /maxWidth=\{pillMaxWidth\(screenW, BTN, GAP, EDGE\)\}/);
  assert.match(m, /marginTop: space\[2\], marginRight: BTN \+ GAP/, 'the notices end a gap before the column');
  assert.match(m, /<NoticeStack maxH=\{noticeRoom\}>/, 'the notices that do not fit above the pill and the card are not drawn');
  // the tab bar: components/TabBar.tsx floats 88 high at max(inset - 14, 10); the screen reads the same top
  assert.match(code(read('src/components/TabBar.tsx')), /bottom: Math\.max\(insets\.bottom - 14, 10\), height: 88/);
  assert.match(m, /const tabTop = Math\.max\(insets\.bottom - 14, 10\) \+ TAB_H;/);
  assert.match(m, /const TAB_H = 88;/);
});

check('a control with no room is not lost: the flag opens "Map options" (rows), the bell moves into the row of the card, the zoom pair never folds', () => {
  const m = code(maps);
  assert.match(m, /fitControls\(walk \? walkRank\(nearOpen && !poi\) : ROUTE_RANK, room, \{ gap: GAP, pinned: walk \? undefined : 'details', must: walk \? \['zoom'\] : \['zoom', 'bell'\] \}\)/);
  assert.match(m, /const bellInCard = walk && \(fit\.scroll \|\| !fit\.shown\.includes\('bell'\)\);/);
  assert.match(m, /fit\.scroll \? \['zoom', \.\.\.order\.filter\(\(id\) => id !== 'zoom' && !\(bellInCard && id === 'bell'\)\)\]/, 'when the column scrolls the zoom pair is first, so it is what is in view');
  assert.match(m, /extra=\{bellInCard \? nodes\.bell : undefined\}/);
  assert.match(m, /foldedIds\.some\(\(id\) => optionRows\[id\]\)/);
  assert.match(m, /const columnHidden = fit\.scroll && room < BTN;/, 'when not even one button fits, the column is not drawn and the zoom pair is two rows of Map options');
  assert.match(m, /Route details and map options/);
  for (const id of ['bell', 'compass', 'near', 'locate', 'light', 'gps', 'zoomIn', 'zoomOut']) assert.match(m, new RegExp(`${id}: \\{ label:`), `${id} has a row of Map options`);
  assert.match(read('src/features/map/controlLayout.ts'), /export function fitControls/);
});

check('the map\'s own compass (the native one, whole route) is under the offline maps button and not on it', () => {
  const l = code(liveMap);
  assert.match(l, /compassPosition=\{\{ top: p\.insets\.top \+ layout\.screenTop \+ layout\.touchPrimary \+ space\[3\], right: layout\.screenMargin \}\}/);
});

console.log(`${n} of ${n} passed`);
