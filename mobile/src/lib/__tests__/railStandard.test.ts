// Plain-node checks that the app has ONE action rail (love, bookmark, comments, share), Discover's, and that Discover and the
// full-screen journey viewer both draw it with the shared component, put it on the same spot of the screen, and open the
// shared comments sheet. A second hand-made rail, a screen that gives the rail numbers of its own, or a theme colour that
// flips in dark mode on a surface that does not, fails here. Run: npm run test:lib
//
// The standard is documented in design/index.html ("Action rail"); the data is lib/actionRail.ts, the drawing and the
// position are components/ActionRail.tsx (RAIL_BOTTOM above the safe area, the screen margin from the right edge, set by
// the rail itself), the colours that never flip are components/fixedColors.ts.
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
    // the bookmark icon belongs to the rail: its name is only in the rail model and in the icon set. The one other place is the Library's
    // own bookmark buttons (src/features/library: the button next to the diary, and the one on each row), which are buttons of a list
    // and not a rail: no circles on a photo, no counts, no comments or share.
    if (!['src/lib/actionRail.ts', 'src/components/Icon.tsx'].includes(f) && !f.startsWith('src/features/library/') && /\bname=\{?[^}\n]*['"]bookmark['"]|\bicon:\s*['"]bookmark['"]/.test(src)) offenders.push(`${f}: uses the bookmark icon outside the rail`);
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
  for (const f of [DISCOVER, VIEWER]) assert.match(code(read(f)), /paddingRight: layout\.screenMargin \+ RAIL_CIRCLE \+ 12/, `${f}: the caption keeps clear of the rail`);
  assert.match(code(read(VIEWER)), /padding: small \? 12 : 32, paddingRight: small \? 12 : layout\.screenMargin \+ RAIL_CIRCLE \+ 12/, 'the text of a text-only post keeps clear of the rail in the viewer, as the caption does');
});

// ---- where the rail sits: one place, owned by the rail, the same on every screen that draws it
type Jsx = ts.JsxSelfClosingElement | ts.JsxOpeningElement;
function jsx(file: string, tag: string): { sf: ts.SourceFile; found: Jsx[] } {
  const sf = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: Jsx[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(sf) === tag) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { sf, found };
}
const rails = files.filter((f) => /<ActionRail\b/.test(code(read(f)))); // every screen that draws the rail, not only the two known ones

check('the rail places itself: RAIL_BOTTOM above the safe area and the screen margin from the right, with no prop to change either', () => {
  const src = code(read(RAIL));
  assert.equal([...src.matchAll(/\bRAIL_BOTTOM\s*=/g)].length, 1, 'the offset is defined once');
  assert.match(src, /export const RAIL_BOTTOM = 120;/, "Discover's number: the lowest circle 120 above the safe area, clear of the tab bar");
  assert.match(src, /const insets = useSafeAreaInsets\(\);/, 'the rail reads the safe area itself');
  assert.match(src, /position: 'absolute', right: layout\.screenMargin, bottom: insets\.bottom \+ RAIL_BOTTOM,/, 'the one place: screen margin from the right, RAIL_BOTTOM above the safe area');
  assert.match(src, /export function ActionRail\(\{ items, onPress \}: \{ items: RailItem\[\]; onPress: \(kind: RailKind\) => void \}\)/, 'its props are what to show and what a tap does: no bottom, right or style');
});

check('every screen that draws the rail (Discover, the journey viewer) hands it items and onPress and nothing about where', () => {
  assert.ok(rails.includes(DISCOVER) && rails.includes(VIEWER), `rails are drawn in: ${rails.join(', ')}`);
  for (const f of rails) {
    const { sf, found } = jsx(f, 'ActionRail');
    assert.equal(found.length, 1, `${f} draws the rail once`);
    const names = found[0].attributes.properties.map((p) => (ts.isJsxAttribute(p) ? p.name.getText(sf) : '...spread')).sort();
    assert.deepEqual(names, ['items', 'onPress'], `${f} gives the rail a prop that places it (or spreads one): the rail sits where the rail puts it, on every screen`);
  }
});

check('the rail is drawn straight into a page that fills the window: that page has width and height and no offset, margin or transform', () => {
  const moves = /^(position|top|bottom|left|right|start|end|inset\w*|margin\w*|transform|translate\w*)$/;
  for (const f of rails) {
    const { sf, found } = jsx(f, 'ActionRail');
    let page: ts.Node | undefined = found[0].parent;
    while (page && !ts.isJsxElement(page)) page = page.parent; // the element the rail is a child of
    assert.ok(page && ts.isJsxElement(page), `${f}: the rail is inside an element`);
    const open = (page as ts.JsxElement).openingElement;
    assert.equal(open.tagName.getText(sf), 'View', `${f}: the rail's page is a View`);
    const style = open.attributes.properties.find((p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText(sf) === 'style');
    const lit = style?.initializer && ts.isJsxExpression(style.initializer) ? style.initializer.expression : undefined;
    assert.ok(lit && ts.isObjectLiteralExpression(lit), `${f}: the page has a style object`);
    const keys = (lit as ts.ObjectLiteralExpression).properties.map((p) => (p.name ? p.name.getText(sf) : '...'));
    assert.ok(keys.includes('width') && keys.includes('height'), `${f}: the page is width x height of the window (${keys.join(', ')})`);
    assert.deepEqual(keys.filter((k) => moves.test(k) || k === '...'), [], `${f}: something between the rail and the screen moves it`);
    assert.match(code(read(f)), /const \{ width, height \} = useWindowDimensions\(\);/, `${f}: width and height are the window's`);
  }
});

check("Discover's caption ends where the lowest circle does, through RAIL_BOTTOM: no second copy of the number", () => {
  const discover = code(read(DISCOVER));
  assert.match(discover, /import \{[^}]*\bRAIL_BOTTOM\b[^}]*\} from '@\/components\/ActionRail'/);
  assert.match(discover, /paddingBottom: insets\.bottom \+ RAIL_BOTTOM/, "Discover's caption uses the rail's own number");
  assert.doesNotMatch(discover, /insets\.bottom \+ 120\b/, 'no second copy of the 120');
});

check('the design page says where the rail sits, with the number the component has, and the old "viewer 28" is gone', () => {
  const n = /\bRAIL_BOTTOM = (\d+);/.exec(code(read(RAIL)))![1];
  const page = readFileSync(join(root, '..', 'design', 'index.html'), 'utf8');
  const section = page.slice(page.indexOf('id="actionrail"'), page.indexOf('id="tabbar"'));
  assert.ok(section.length > 1000, 'the Action rail section of the design page was found');
  assert.match(section, new RegExp(`lowest circle ${n} above the safe area`), 'the page states the offset the component uses');
  assert.doesNotMatch(section, /viewer puts it 28/, 'the viewer has no offset of its own any more');
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

check('only other pilgrims\' comments on real posts can be reported, with the chat\'s reasons and the chat\'s report', () => {
  const hook = code(read('src/features/me/usePostRail.ts'));
  assert.match(hook, /report: sample \? undefined : \{/, 'a sample has nobody to report; a real post passes the report');
  assert.match(hook, /reportContent\('comment', comment\.id, reason as ReportReason\)/, 'the report is the one the chat has, for a comment');
  assert.match(hook, /reasons: REPORT_REASONS,[\s\S]*prompt: REPORT_PROMPT,[\s\S]*thanks: REPORT_THANKS/, 'the same words');
  const sheet = code(read('src/components/CommentsSheet.tsx'));
  assert.match(sheet, /!!report && !cm\.mine && !cm\.pending/, 'never on your own comment, never on one that is still being sent (it may not exist yet)');
  assert.match(sheet, /accessibilityLabel=\{`Report comment by @\$\{cm\.user\}`\}/, 'a screen reader hears whose comment');
  assert.equal(code(read(DISCOVER)).includes('report='), false, 'Discover shows sample comments: nothing to report');
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
