// Plain-node checks of light and dark mode. Run: npm run test:lib
//
// The palette of both modes is design/tokens.json (copied to src/theme/tokens.json): "color" and "role" for light, the
// "dark" section for dark. tools/tests/test_dark_tokens.py checks the contrast of the token pairs. Here: the app builds
// its theme from that file and from nothing else, the pairs have the same contrast in the running theme, and the
// mistakes that made dark mode unreadable cannot come back (an inactive tab drawn in a fixed navy, a hero card built
// from c.blue, blue text on gold, a colour read once when a file loads so that it never follows the mode).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import tokens from '../../theme/tokens.json';
import { applyScheme, c, fixed, fonts, role, scrim, tabActiveWeight } from '../../theme';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };
const root = process.cwd(); // npm test runs from mobile/
const read = (p: string) => readFileSync(join(root, p), 'utf8');

type Pal = Record<string, string>;
const light = tokens.color as Pal;
const darkColor = tokens.dark.color as Pal;
const darkRole = tokens.dark.role as Pal;
const cur = c as Pal;

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
const outsideTheme = files.filter((f) => !f.startsWith(join('src', 'theme')));

// ---- WCAG contrast of the running theme
const lin = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const lum = (hex: string) => { const h = hex.replace('#', ''); const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
const ratio = (a: string, b: string) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

check('light mode is the light palette of design/tokens.json, color by color and role by role', () => {
  applyScheme('light');
  for (const [k, v] of Object.entries(light)) assert.equal(cur[k], v, `c.${k}`);
  assert.equal(role.bg, light.parchment);
  assert.equal(role.surface, light.white);
  assert.equal(role.muted, light.stone600);
  assert.equal(role.action, light.blue);
  assert.equal(role.inverse, light.blue);
  assert.equal(role.onInverse, light.parchment);
  assert.equal(role.onInverseAccent, light.goldSoft);
  assert.equal(role.onHighlight, light.blue);
  // the tab bar has roles of its own: in light mode the active tab is the action blue it always was, and the inactive tabs are a lighter,
  // quieter stone than muted text (the owner asked on 2026-11-08 for inactive tabs that are lighter and more transparent)
  assert.equal(role.tabActive, light.blue);
  assert.equal(role.tabInactive, light.stone550);
  assert.equal(role.tabActive, role.action, 'light mode: the active tab is the blue it always was');
  assert.notEqual(role.tabInactive, role.muted, 'light mode: the inactive tab is lighter than muted text');
  // light mode is as the owner liked it: the bar is the card white and has no visible edge (the shadow separates it)
  assert.equal(role.tabBar, role.surface, 'light mode: the tab bar is the card white it always was');
  assert.equal(role.tabBarBorder, role.tabBar, 'light mode: no visible edge');
});

check('dark mode is the dark section of design/tokens.json: nothing about it is defined a second time in the app', () => {
  applyScheme('dark');
  for (const k of Object.keys(light)) assert.equal(cur[k], darkColor[k] ?? light[k], `c.${k}`);
  assert.equal(role.bg, cur.parchment);
  assert.equal(role.surface, cur.white);
  assert.equal(role.muted, cur.stone600);
  assert.equal(role.action, cur.blue);
  assert.equal(role.inverse, darkRole.surfaceInverse);
  assert.equal(role.onInverse, darkRole.textInverse);
  assert.equal(role.onInverseAccent, darkRole.textInverseAccent);
  assert.equal(role.onHighlight, darkRole.onHighlight);
  assert.equal(role.tabActive, darkRole.tabActive);
  assert.equal(role.tabInactive, darkRole.tabInactive);
  assert.equal(role.tabBar, darkRole.tabBar);
  assert.equal(role.tabBarBorder, darkRole.tabBarBorder);
  applyScheme('light');
});

check('gold stays gold, and switching back and forth restores every value exactly', () => {
  applyScheme('dark');
  assert.equal(c.gold, light.gold);
  assert.equal(c.goldBright, light.goldBright);
  applyScheme('light');
  assert.deepEqual({ ...c }, { ...light });
  const first = { ...role };
  applyScheme('dark'); applyScheme('dark'); applyScheme('light');
  assert.deepEqual({ ...role }, first);
});

check('fixed is the light palette, frozen, and does not follow the mode', () => {
  applyScheme('dark');
  assert.ok(Object.isFrozen(fixed));
  for (const [k, v] of Object.entries(light)) assert.equal((fixed as Pal)[k], v, `fixed.${k}`);
  assert.notEqual(c.blue, fixed.blue, 'in dark mode c.blue is light blue and fixed.blue stays the brand navy');
  applyScheme('light');
});

check('the pairs a screen draws keep their contrast in the running theme, in both modes (text 4.5, icons 3)', () => {
  const pairs: [string, () => string, () => string, number][] = [
    ['text on bg', () => role.text, () => role.bg, 4.5],
    ['text on surface', () => role.text, () => role.surface, 4.5],
    ['muted on bg', () => role.muted, () => role.bg, 4.5],
    ['muted on surface', () => role.muted, () => role.surface, 4.5],
    ['action on bg', () => role.action, () => role.bg, 4.5],
    ['action on surface', () => role.action, () => role.surface, 4.5],
    ['tabInactive on tabBar (the inactive tab, icon and label)', () => role.tabInactive, () => role.tabBar, 4.5],
    ['tabActive on tabBar (the active tab, icon and label)', () => role.tabActive, () => role.tabBar, 4.5],
    ['onAction on action (a primary button)', () => role.onAction, () => role.action, 4.5],
    ['onHighlight on highlight (text and icons on gold)', () => role.onHighlight, () => role.highlight, 4.5],
    ['onInverse on inverse (text on a hero card)', () => role.onInverse, () => role.inverse, 4.5],
    ['onInverseAccent on inverse (pale gold on a hero card)', () => role.onInverseAccent, () => role.inverse, 4.5],
    ['onDanger on danger', () => role.onDanger, () => role.danger, 4.5],
    ['danger on surface', () => role.danger, () => role.surface, 4.5],
    ['gold icon on a hero card', () => role.highlight, () => role.inverse, 3],
  ];
  for (const scheme of ['light', 'dark'] as const) {
    applyScheme(scheme);
    for (const [name, fg, bg, need] of pairs) {
      const got = ratio(fg(), bg());
      assert.ok(got >= need, `${scheme}: ${name} is ${got.toFixed(2)}:1, needs ${need}:1`);
    }
  }
  applyScheme('light');
});

check('a hero card stands out from the page in dark mode, as it does in light mode', () => {
  applyScheme('dark');
  assert.ok(ratio(role.inverse, role.bg) >= 1.5 && ratio(role.inverse, role.surface) >= 1.5);
  applyScheme('light');
});

check('the scrim is one value and belongs to the theme', () => {
  assert.match(scrim, /^rgba\(\s*20\s*,\s*54\s*,\s*93\s*,\s*0\.\d+\)$/);
});

check('on the tab bar the active tab has at least 1.5 times the contrast of an inactive one, in both modes, and the inactive ones are quieter than muted text but never below 4.5 : 1', () => {
  // The owner asked (2026-11-08) for inactive tabs that are lighter and more transparent in light and dark mode, so the active one stands
  // out. They recede, but they never vanish again (a fixed navy at 42% was 1.1:1 on the dark bar, see the Don't on the design page).
  for (const scheme of ['light', 'dark'] as const) {
    applyScheme(scheme);
    const active = ratio(role.tabActive, role.tabBar);
    const inactive = ratio(role.tabInactive, role.tabBar);
    assert.ok(active >= 1.5 * inactive, `${scheme}: the active tab is ${active.toFixed(2)}:1 and an inactive one ${inactive.toFixed(2)}:1 on the bar`);
    assert.ok(inactive >= 4.5, `${scheme}: the inactive tabs are ${inactive.toFixed(2)}:1 on the bar, they must stay readable`);
    // and they recede (the owner asked twice, for light mode and then for dark mode once the bar was darker): at most 5 : 1 on the bar
    assert.ok(inactive <= 5, `${scheme}: the inactive tabs are ${inactive.toFixed(2)}:1 on the bar, they are meant to recede (at most 5 : 1)`);
    assert.ok(inactive <= ratio(role.muted, role.tabBar), `${scheme}: the inactive tabs are quieter than muted text`);
  }
  applyScheme('light');
});

check('the tab bar draws the active tab in role.tabActive and the inactive ones in role.tabInactive: its own roles, never a fixed colour or a role other things share', () => {
  const src = read(join('src', 'components', 'TabBar.tsx'));
  assert.match(src, /focused \? role\.tabActive : role\.tabInactive/);
  assert.match(src, /backgroundColor: role\.tabBar\b/, 'the bar is filled with its own role, not the card colour a card behind it would match');
  assert.match(src, /borderColor: role\.tabBarBorder\b/);
  assert.doesNotMatch(src, /role\.surface\b/, 'a bar in the card colour is swallowed by any card that scrolls under it in dark mode');
  assert.doesNotMatch(src, /role\.(muted|action)\b/, 'muted and action are the colours of captions and links: changing them for the tab bar would change those too');
  assert.doesNotMatch(src, /rgba\(\s*20\s*,\s*54\s*,\s*93/);
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b|rgba?\(/, 'no colour of its own in the tab bar: a role from design/tokens.json');
});

check('the inactive tabs are thinner and lighter than the active one in weight as well as colour: a thin stroke and a Light label against a thick stroke and a SemiBold label', () => {
  // The owner asked (2026-11-08) for inactive tabs that are lighter and more transparent in light and dark mode; colour alone did not say it all.
  const src = read(join('src', 'components', 'TabBar.tsx'));
  assert.match(src, /strokeWidth=\{focused \? tabActiveWeight\.stroke : 1\.3\}/, 'the active icon is drawn as heavy as tokens.tab says, the inactive ones at 1.3');
  assert.match(src, /fontFamily: focused \? tabActiveWeight\.font : fonts\.bodyLight/, 'the active label is as heavy as tokens.tab says, the inactive ones Light');
  assert.equal(fonts.bodyLight, 'Inter_300Light');
  const layoutSrc = read(join('app', '_layout.tsx'));
  assert.match(layoutSrc, /import \{[^}]*\bInter_300Light\b[^}]*\} from '@expo-google-fonts\/inter'/, 'Inter Light is imported');
  assert.match(layoutSrc, /useFonts\(\{[^}]*\bInter_300Light\b/, 'and loaded with the other fonts, or the label would fall back to the system font');
  const page = readFileSync(join(root, '..', 'design', 'index.html'), 'utf8');
  assert.match(page, /\.cp-tab \{[^}]*font-weight: 300/, 'the design page draws the inactive label Light');
  assert.match(page, /\.cp-tab \.cp-icon \{[^}]*stroke-width: 1\.3px/, 'and the inactive icon thin');
  assert.match(page, /\.cp-tab\.on \.ico \.cp-icon \{[^}]*stroke-width: var\(--cp-tab-active-stroke\)/, 'the active icon thick (the variable of the mode)');
});

check('the active tab is drawn a little heavier in light mode than in dark mode: dark on light looks thinner than light on dark with the same stroke (the ink is the same in both modes, the owner saw light mode as thinner)', () => {
  const t = tokens.tab as { activeStroke: { light: number; dark: number }; activeLabelWeight: { light: number; dark: number } };
  assert.ok(t.activeStroke.light > t.activeStroke.dark, 'a thicker icon in light mode');
  assert.ok(t.activeLabelWeight.light > t.activeLabelWeight.dark, 'a heavier label in light mode');
  for (const s of ['light', 'dark'] as const) assert.ok(t.activeStroke[s] >= 1.3 * 1.5, `${s}: the active icon stays much heavier than the inactive one (1.3)`);
  assert.ok(t.activeStroke.light <= t.activeStroke.dark * 1.3, 'a compensation, not a different weight: at most 30 percent more');
  applyScheme('light');
  assert.equal(tabActiveWeight.stroke, t.activeStroke.light);
  assert.equal(tabActiveWeight.font, 'Inter_700Bold');
  applyScheme('dark');
  assert.equal(tabActiveWeight.stroke, t.activeStroke.dark);
  assert.equal(tabActiveWeight.font, 'Inter_600SemiBold');
  applyScheme('light');
  assert.equal(fonts.bodyStrong, 'Inter_700Bold');
  const layoutSrc = read(join('app', '_layout.tsx'));
  assert.match(layoutSrc, /import \{[^}]*\bInter_700Bold\b[^}]*\} from '@expo-google-fonts\/inter'/, 'Inter Bold is imported');
  assert.match(layoutSrc, /useFonts\(\{[^}]*\bInter_700Bold\b/, 'and loaded with the other fonts, or the active label would fall back to the system font');
  const css = readFileSync(join(root, '..', 'design', 'tokens.css'), 'utf8');
  assert.match(css, new RegExp(`--cp-tab-active-stroke:\\s*${t.activeStroke.light}px`), 'tokens.css has the light stroke');
  assert.match(css, new RegExp(`--cp-tab-active-weight:\\s*${t.activeLabelWeight.light};`), 'tokens.css has the light weight');
  const page = readFileSync(join(root, '..', 'design', 'index.html'), 'utf8');
  assert.match(page, new RegExp(`\\.phone\\.dk \\{[^}]*--cp-tab-active-stroke:${t.activeStroke.dark}px;--cp-tab-active-weight:${t.activeLabelWeight.dark};`), 'the dark phones carry the dark values');
});

check('the tab bar roles exist in both modes of design/tokens.json: the dark section has its own value for each', () => {
  const lightRole = tokens.role as Pal;
  for (const name of ['tabActive', 'tabInactive', 'tabBar', 'tabBarBorder']) {
    assert.ok(lightRole[name] in light, `role.${name} names a light colour`);
    assert.ok(darkRole[name], `dark.role.${name} is missing: dark mode would fall back to the light mapping`);
  }
});

check('in dark mode the tab bar is darker than the page and every card and has a hairline: a card behind it can never be the colour of the bar', () => {
  // Until 2026-11-08 the bar was role.surface (the card colour) with only a shadow, and a shadow cannot be seen on a dark screen: a card
  // scrolling under the bar swallowed it. The owner chose a darker bar with a hairline.
  applyScheme('dark');
  assert.ok(lum(role.tabBar) < lum(role.bg) && lum(role.bg) < lum(role.surface), 'the bar is darker than the page, so darker than every card');
  assert.ok(lum(role.tabBar) < lum(role.sunken));
  assert.notEqual(role.tabBar, role.surface);
  assert.notEqual(role.tabBarBorder, role.surface);
  assert.ok(ratio(role.tabBarBorder, role.tabBar) >= 1.5, `the hairline is ${ratio(role.tabBarBorder, role.tabBar).toFixed(2)}:1 on the bar`);
  applyScheme('light');
});

check('no screen draws the brand navy as a literal: use a role, fixed.*, or scrim', () => {
  const allowed = [join('src', 'features', 'map', 'style.ts'), join('src', 'components', 'auth', 'Wordmark.tsx')]; // the map has its own palette; the logo is a picture
  const offenders: string[] = [];
  for (const f of outsideTheme) {
    if (allowed.includes(f)) continue;
    read(f).split('\n').forEach((line, i) => {
      if (/#14365D|rgba\(\s*20\s*,\s*54\s*,\s*93/i.test(line)) offenders.push(`${f}:${i + 1}  ${line.trim().slice(0, 110)}`);
    });
  }
  assert.deepEqual(offenders, [], 'fixed navy is invisible on a dark surface');
});

check('c.blue is the action colour, not a surface: a control is role.action, a hero card is role.inverse', () => {
  const offenders: string[] = [];
  for (const f of outsideTheme) {
    read(f).split('\n').forEach((line, i) => {
      if (/\b(backgroundColor|bg):\s*c\.blue\b/.test(line)) offenders.push(`${f}:${i + 1}  ${line.trim().slice(0, 110)}`);
    });
  }
  assert.deepEqual(offenders, [], 'in dark mode c.blue is light blue: gold and cream content on it disappears');
});

check('nothing blue is drawn on gold: text and icons on gold are role.onHighlight', () => {
  const offenders: string[] = [];
  for (const f of outsideTheme) {
    read(f).split('\n').forEach((line, i) => {
      if (/(backgroundColor|bg):\s*(c\.gold|role\.highlight)\b/.test(line) && /\b(color=\{|color:\s*|fg:\s*)c\.blue\b/.test(line)) offenders.push(`${f}:${i + 1}  ${line.trim().slice(0, 110)}`);
    });
  }
  assert.deepEqual(offenders, [], 'c.blue on gold is 1.06:1 in dark mode');
});

check('no theme colour is read once when a file loads: it would never follow the light/dark mode', () => {
  // A top-level `const x = { ... c.blue ... }` is evaluated at import and then kept for the life of the app. Getters,
  // functions and components read the colour when they run, which is what is wanted. `theme-ok` on a statement allows one.
  const lazy = /^(async\s*)?(\([^)]*\)\s*(:\s*[^=]+?)?=>|function\b|[A-Za-z_$][\w$]*\s*=>|(React\.)?(memo|forwardRef)\(|use[A-Z])/;
  const offenders: string[] = [];
  for (const f of outsideTheme) {
    const text = read(f);
    if (!/from '@\/theme'/.test(text)) continue;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = /^(export\s+)?(const|let|var)\s+([A-Za-z_$][\w$]*)/.exec(lines[i]);
      if (!m) continue;
      let depth = 0; let j = i; const buf: string[] = [];
      for (; j < lines.length && j - i < 400; j++) {
        const l = lines[j]; buf.push(l);
        for (const ch of l) { if ('([{'.includes(ch)) depth++; else if (')]}'.includes(ch)) depth--; }
        if (depth <= 0 && /[;})\]]\s*$/.test(l)) { j++; break; }
      }
      const stmt = buf.join('\n');
      i = j - 1;
      const eq = /[^=!<>]=(?![=>])/.exec(stmt);
      const init = eq ? stmt.slice(eq.index + 2).trimStart() : '';
      if (lazy.test(init) || stmt.includes('theme-ok')) continue;
      const body = stmt.replace(/get\s+\w+\s*\(\s*\)\s*\{[^}]*\}/g, ''); // getters read the colour when the style is used
      if (/\b(c|role)\.[a-zA-Z]/.test(body)) offenders.push(`${f}:${lines.indexOf(buf[0]) + 1}  ${m[3]}`);
    }
  }
  assert.deepEqual(offenders, [], 'make it a function or a getter, or use fixed.* if the colour must not change');
});

console.log(`${n} checks passed`);
