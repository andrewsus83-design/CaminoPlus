// Plain-node checks that every screen keeps the same distance between the camera / notch (the safe area) and its first
// element, and that it is the distance the Map's "Whole route / Near me" switch has. Run: npm run test:lib
//
// The rule is one token, layout.screenTop (src/theme/tokens.json, copied to ../design/tokens.json). A screen that brings
// its own number back (insets.top + 12) fails here. Camera padding on the map is the one exception: it is not a margin of
// a screen, so its line says "top-gap-ok".
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

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

check('the token exists and the app and the design copy of it agree', () => {
  const app = JSON.parse(read('src/theme/tokens.json')).layout;
  const design = JSON.parse(readFileSync(join(root, '..', 'design', 'tokens.json'), 'utf8')).layout;
  assert.equal(typeof app.screenTop, 'number');
  assert.ok(app.screenTop >= 0 && app.screenTop <= 16, `layout.screenTop is ${app.screenTop}`);
  assert.equal(app.screenTop, design.screenTop, 'mobile/src/theme/tokens.json and design/tokens.json differ');
});

check('no screen or overlay brings its own top number: the gap is insets.top + layout.screenTop', () => {
  const magic = /insets\.top\s*[-+]\s*\d/; // insets.top + 12, insets.top - 8
  const bare = /(?:paddingTop|top):\s*(?:p\.)?insets\.top\s*[,}]/; // paddingTop: insets.top, (no gap at all)
  const offenders: string[] = [];
  for (const f of files) {
    read(f).split('\n').forEach((line, i) => {
      if (line.includes('top-gap-ok')) return;
      if (magic.test(line) || bare.test(line)) offenders.push(`${f}:${i + 1}  ${line.trim().slice(0, 120)}`);
    });
  }
  assert.deepEqual(offenders, [], 'use insets.top + layout.screenTop, or mark camera padding with "top-gap-ok"');
});

check('the camera padding exceptions are few and are the map camera only', () => {
  const marked: string[] = [];
  for (const f of files) {
    read(f).split('\n').forEach((line, i) => { if (line.includes('top-gap-ok')) marked.push(`${f}:${i + 1}`); });
  }
  assert.ok(marked.length <= 3, `${marked.length} exceptions: ${marked.join(', ')}`);
  for (const m of marked) assert.match(m, /maps\.tsx|LiveMap\.tsx/, `${m} is not map camera padding`);
});

check('the shared screens use the token', () => {
  assert.match(read('src/components/Screen.tsx'), /paddingTop: insets\.top \+ layout\.screenTop/);
  assert.match(read('src/components/auth/AuthShell.tsx'), /paddingTop: insets\.top \+ layout\.screenTop/);
});

check('a form screen without a back button (onboarding, new password) starts at the same distance: no margin of its own', () => {
  const shell = read('src/components/auth/AuthShell.tsx');
  assert.match(shell, /marginTop: hero \? 90 : 0/); // only the hero title is pushed down, it sits below the photo
  assert.doesNotMatch(shell, /back \? 0 : \d+/);
});

check('the Map\'s "Whole route / Near me" switch and the Walk view banner start at the token', () => {
  const maps = read('app/(tabs)/maps.tsx');
  assert.equal((maps.match(/top: insets\.top \+ layout\.screenTop,/g) ?? []).length, 2);
  assert.match(maps, /label: 'Whole route'/);
  assert.match(maps, /label: 'Near me'/);
});

console.log(`${n} of ${n} passed`);
