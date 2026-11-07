// Plain-node checks that the app has ONE action rail (love, bookmark, comments, share), Discover's, and that Discover and the
// full-screen journey viewer both draw it with the shared component and open the shared comments sheet. A second hand-made
// rail, or a theme colour that flips in dark mode on a surface that does not, fails here. Run: npm run test:lib
//
// The standard is documented in design/index.html ("Action rail"); the data is lib/actionRail.ts, the drawing is
// components/ActionRail.tsx, the colours that never flip are components/fixedColors.ts.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };
const root = process.cwd(); // npm test runs from mobile/
const read = (p: string) => readFileSync(join(root, p), 'utf8');

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(root, dir))) {
    const rel = join(dir, name);
    if (statSync(join(root, rel)).isDirectory()) {
      if (name !== '__tests__' && name !== 'node_modules') out.push(...sources(rel));
    } else if (/\.tsx?$/.test(name)) {
      out.push(rel);
    }
  }
  return out;
}
const files = [...sources('app'), ...sources('src')];
const code = (src: string) => src.split('\n').filter((l) => !/^\s*(\/\/|\/?\*)/.test(l)).join('\n'); // without comment lines

const DISCOVER = 'app/(tabs)/explore.tsx';
const VIEWER = 'src/features/me/JourneyGrid.tsx';
const RAIL = 'src/components/ActionRail.tsx';

check('Discover and the journey viewer both render the shared ActionRail', () => {
  for (const f of [DISCOVER, VIEWER]) {
    const src = code(read(f));
    assert.match(src, /import \{[^}]*\bActionRail\b[^}]*\} from '@\/components\/ActionRail'/, `${f} imports the shared rail`);
    assert.match(src, /<ActionRail\b/, `${f} renders it`);
  }
});

check('both open the shared CommentsSheet, and Discover no longer has a comments sheet of its own', () => {
  for (const f of [DISCOVER, VIEWER]) {
    const src = code(read(f));
    assert.match(src, /import \{[^}]*\bCommentsSheet\b[^}]*\} from '@\/components\/CommentsSheet'/, `${f} imports the shared sheet`);
    assert.match(src, /<CommentsSheet\b/, `${f} renders it`);
  }
  const discover = code(read(DISCOVER));
  assert.doesNotMatch(discover, /<Modal\b/, 'no hand-made sheet in Discover');
  assert.doesNotMatch(discover, /<TextInput\b/, 'no comment input in Discover');
});

check('the rail is rendered for every post of the viewer, sample or real: nothing hides it', () => {
  const line = code(read(VIEWER)).split('\n').find((l) => l.includes('<ActionRail'))!;
  assert.ok(line, 'the viewer renders the rail');
  assert.doesNotMatch(line, /&&|\?|sample/, `the rail is not conditional: ${line.trim()}`);
});

check('no second hand-made rail: the old read-only pill is gone and nothing else draws the rail\'s circles or icons', () => {
  assert.equal(existsSync(join(root, 'src/features/me/EngagementRail.tsx')), false, 'the old read-only pill is deleted');
  const offenders: string[] = [];
  for (const f of files) {
    const src = code(read(f));
    if (/EngagementRail|engagementItems/.test(src)) offenders.push(`${f}: still names the old rail`);
    if (f !== RAIL && /rgba\(255,\s*253,\s*248,\s*0?\.85\)|FIXED\.railCircle/.test(src) && f !== 'src/components/fixedColors.ts') offenders.push(`${f}: draws the rail's cream circle`);
    // the bookmark icon belongs to the rail: its name is only in the rail model and in the icon set
    if (!['src/lib/actionRail.ts', 'src/components/Icon.tsx'].includes(f) && /\bname=\{?[^}\n]*['"]bookmark['"]|\bicon:\s*['"]bookmark['"]/.test(src)) offenders.push(`${f}: uses the bookmark icon outside the rail`);
  }
  assert.deepEqual(offenders, [], 'use components/ActionRail.tsx (data: lib/actionRail.ts) instead');
});

check('the rail is the standard: 56 px circles, 14 px apart, at the screen margin, in the cream colour, blue icons, red heart', () => {
  const src = code(read(RAIL));
  assert.match(src, /RAIL_CIRCLE = 56\b/);
  assert.match(src, /RAIL_GAP = 14\b/);
  assert.match(src, /right: layout\.screenMargin/);
  assert.match(src, /backgroundColor: FIXED\.railCircle/);
  assert.match(src, /it\.tone === 'love' \? FIXED\.red : FIXED\.blue/);
  assert.match(src, /fontSize: 11, lineHeight: 13/, 'the count under the icon');
  assert.match(code(read(DISCOVER)), /bottom=\{insets\.bottom \+ 120\}/, 'Discover keeps the rail above the tab bar');
});

check('on a surface that does not change in dark mode no colour changes: the rail and Discover use FIXED, never the flipping theme colours', () => {
  const flipping = /\bc\.(blue|blue900|blue700|blue100|blue50|red|red700|red100|white|parchment|goldInk|goldSoft|ink|inkStrong|sand\d+|stone\d+)\b|\brole\./;
  for (const f of [RAIL, DISCOVER]) {
    const src = code(read(f));
    const bad = src.split('\n').filter((l) => flipping.test(l)).map((l) => l.trim().slice(0, 100));
    assert.deepEqual(bad, [], `${f} uses a theme colour that flips in dark mode`);
    assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b|rgba?\(/, `${f} has a colour of its own: name it once in components/fixedColors.ts`);
  }
  // the viewer's overlay: white on a scrim stays white, the scrims are named once
  const viewer = code(read(VIEWER));
  assert.doesNotMatch(viewer, /'#FFFFFF'|"#FFFFFF"|'#000'|"#000"|rgba\(/, 'the viewer uses FIXED.onPhoto, FIXED.black and the named scrims');
  assert.doesNotMatch(viewer, /\bc\.goldSoft\b/, 'the sample label sits on a dark scrim: FIXED.goldSoft');
});

check('the comments sheet sits on the theme background, so it keeps the theme colours; only the dimmed page and the gold button are fixed', () => {
  const src = code(read('src/components/CommentsSheet.tsx'));
  assert.match(src, /backgroundColor: role\.bg/);
  assert.match(src, /backgroundColor: FIXED\.sheetScrim/);
  assert.match(src, /color=\{FIXED\.blue\}>Send</, 'the label on the gold button never flips');
  assert.doesNotMatch(src, /rgba?\(|#[0-9a-fA-F]{3,8}\b/, 'no colour of its own');
});

check('the fixed colours are the LIGHT token values read straight from tokens.json (the cream circle is Discover\'s rgba(255,253,248,0.85))', () => {
  const tokens = JSON.parse(read('src/theme/tokens.json')) as { color: Record<string, string> };
  const js = ts.transpileModule(read('src/components/fixedColors.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const m = { exports: {} as Record<string, unknown> };
  new Function('exports', 'require', 'module', js)(m.exports, (id: string) => {
    if (id === '@/theme/tokens.json') return tokens; // the module itself: TypeScript's import helper wraps it as the default export
    throw new Error(`fixedColors.ts imports ${id}: it should only read the tokens`);
  }, m);
  const FIXED = m.exports.FIXED as Record<string, string>;
  for (const k of ['blue', 'blue900', 'red', 'white', 'parchment', 'goldInk', 'goldSoft']) assert.equal(FIXED[k], tokens.color[k], k);
  assert.equal(FIXED.railCircle, 'rgba(255,253,248,0.85)');
  assert.equal(FIXED.pill, 'rgba(255,253,248,0.92)');
  assert.equal(FIXED.tutorialScrim, 'rgba(12,35,64,0.6)');
  assert.equal(FIXED.sheetScrim, 'rgba(12,35,64,0.5)');
  assert.ok(!/\bc\.|\brole\./.test(code(read('src/components/fixedColors.ts'))), 'it never reads the theme colours');
});

check('sample content shares the invitation to the app, from one place, and nothing re-defines it', () => {
  for (const f of [DISCOVER, 'src/features/me/usePostRail.ts']) {
    const src = code(read(f));
    assert.doesNotMatch(src, /const SHARE_APP\s*=/, `${f} must import SHARE_APP / shareMessage, not define its own`);
  }
  assert.match(code(read(DISCOVER)), /import \{ SHARE_APP \} from '@\/lib\/postShare'/);
  assert.match(code(read('src/features/me/usePostRail.ts')), /shareMessage\(post, sample\)/);
});

check('the sample journey uses the same hook as real posts, with the sample flag: local toggles, no database', () => {
  assert.match(code(read(VIEWER)), /usePostRail\(\{ posts, sample: !!sample \}\)/);
  const hook = code(read('src/features/me/usePostRail.ts'));
  assert.match(hook, /if \(sample\) \{\s*return railItems\(/, 'a sample rail is built from the phone');
  assert.match(hook, /else if \(sample\) local\.toggle\(/, 'a sample toggle is local');
  assert.match(hook, /record: sample \|\| !uid \? undefined/, 'a sample share is never counted');
  assert.match(hook, /if \(sample \|\| !uid \|\| posts\.length === 0\) return;/, 'a sample never reads reactions from the database');
});

console.log(`${n} of ${n} passed`);
