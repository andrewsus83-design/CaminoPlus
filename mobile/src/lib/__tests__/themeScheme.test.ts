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
import { applyScheme, c, fixed, role, scrim } from '../../theme';

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
    ['tabInactive on surface (the inactive tab, icon and label)', () => role.tabInactive, () => role.surface, 4.5],
    ['tabActive on surface (the active tab, icon and label)', () => role.tabActive, () => role.surface, 4.5],
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
    const active = ratio(role.tabActive, role.surface);
    const inactive = ratio(role.tabInactive, role.surface);
    assert.ok(active >= 1.5 * inactive, `${scheme}: the active tab is ${active.toFixed(2)}:1 and an inactive one ${inactive.toFixed(2)}:1 on the bar`);
    assert.ok(inactive >= 4.5, `${scheme}: the inactive tabs are ${inactive.toFixed(2)}:1 on the bar, they must stay readable`);
    assert.ok(inactive <= ratio(role.muted, role.surface), `${scheme}: the inactive tabs are quieter than muted text`);
  }
  applyScheme('light');
});

check('the tab bar draws the active tab in role.tabActive and the inactive ones in role.tabInactive: its own roles, never a fixed colour or a role other things share', () => {
  const src = read(join('src', 'components', 'TabBar.tsx'));
  assert.match(src, /focused \? role\.tabActive : role\.tabInactive/);
  assert.doesNotMatch(src, /role\.(muted|action)\b/, 'muted and action are the colours of captions and links: changing them for the tab bar would change those too');
  assert.doesNotMatch(src, /rgba\(\s*20\s*,\s*54\s*,\s*93/);
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b|rgba?\(/, 'no colour of its own in the tab bar: a role from design/tokens.json');
});

check('the tab bar roles exist in both modes of design/tokens.json: the dark section has its own value for each', () => {
  const lightRole = tokens.role as Pal;
  for (const name of ['tabActive', 'tabInactive']) {
    assert.ok(lightRole[name] in light, `role.${name} names a light colour`);
    assert.ok(darkRole[name], `dark.role.${name} is missing: dark mode would fall back to the light mapping`);
  }
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
