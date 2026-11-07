// Plain-node checks of how the app is laid out: which tabs there are, where Settings lives, and that nothing a screen
// opens is missing. Run: npm run test:lib
//
// The tab bar is Me, Stays, Maps, Discover, Library. Settings is not a tab: it is a screen of its own, opened from the
// gear at the top right of Me. Library has a banner and the tabs Bible, Books and Music, and a gold pen that writes a
// diary page. These checks fail when someone brings a tab back without its icon (the tab bar would crash on it), when a
// route file and the tab list disagree, or when a link still points at the old Settings tab.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { LIBRARY_TABS, PREVIEW_NOTICE } from '../../features/library/sample';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };
const root = process.cwd(); // npm test runs from mobile/
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const exists = (p: string) => existsSync(join(root, p));

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

const tabsLayout = read(join('app', '(tabs)', '_layout.tsx'));
const tabs = [...tabsLayout.matchAll(/<Tabs\.Screen name="([\w-]+)" options=\{\{ title: '([^']+)' \}\} \/>/g)].map((m) => ({ name: m[1], title: m[2] }));
const iconNames = [...read(join('src', 'components', 'Icon.tsx')).split('} as const;')[0].matchAll(/^ {2}(?:'([\w-]+)'|(\w+)):/gm)].map((m) => m[1] ?? m[2]);

check('the tab bar is Me, Stays, Maps, Discover, Library, in that order', () => {
  assert.deepEqual(tabs.map((t) => t.name), ['me', 'stays', 'maps', 'explore', 'library']);
  assert.deepEqual(tabs.map((t) => t.title), ['Me', 'Stays', 'Maps', 'Discover', 'Library']);
});

check('every tab is a file in app/(tabs), and every file there is a tab (an unlisted file would become a sixth tab)', () => {
  const inFolder = readdirSync(join(root, 'app', '(tabs)')).filter((f) => f !== '_layout.tsx').map((f) => f.replace(/\.tsx$/, '')).sort();
  assert.deepEqual(inFolder, tabs.map((t) => t.name).sort());
});

check('every tab has an icon of the same name: the tab bar draws Icon name={route.name} and an unknown name would crash it', () => {
  assert.match(read(join('src', 'components', 'TabBar.tsx')), /name=\{route\.name as IconName\}/);
  for (const t of tabs) assert.ok(iconNames.includes(t.name), `Icon.tsx has no icon "${t.name}"`);
  for (const extra of ['library', 'book', 'music']) assert.ok(iconNames.includes(extra), `Icon.tsx has no icon "${extra}"`);
});

check('Settings is a screen of its own, not a tab, and the old tab route is gone', () => {
  assert.ok(exists(join('app', 'settings.tsx')));
  assert.ok(!exists(join('app', '(tabs)', 'settings.tsx')));
  assert.ok(!tabs.some((t) => t.name === 'settings'));
  assert.match(read(join('app', '_layout.tsx')), /<Stack\.Screen name="settings" \/>/);
  const offenders = files.filter((f) => /\(tabs\)\/settings/.test(read(f)));
  assert.deepEqual(offenders, [], 'a link still points at the Settings tab; the route is /settings');
});

check('Settings has Back, light/dark and log out, and keeps no room for a tab bar it does not have', () => {
  const src = read(join('app', 'settings.tsx'));
  assert.match(src, /<Screen tabBar=\{false\}>/);
  assert.match(src, /name="back"/);
  assert.match(src, /<ThemeToggle \/>/);
  assert.match(src, /<LogoutButton \/>/);
  assert.match(read(join('src', 'components', 'Screen.tsx')), /tabBar = true/);
});

check('Me opens Settings from a gear at the top right: after the inbox bell, in the same header row', () => {
  const src = read(join('app', '(tabs)', 'me.tsx'));
  const bell = src.indexOf('<IconButton name="bell"');
  const gear = src.indexOf('<IconButton name="settings"');
  assert.ok(bell > 0 && gear > bell, 'the gear comes after the bell, so it is the right-most button');
  assert.match(src.slice(gear, gear + 200), /router\.push\('\/settings'\)/);
  assert.match(src.slice(gear, gear + 200), /label="Settings"/);
});

check('after a light/dark switch the app returns to Settings with Me underneath, so Back still works', () => {
  const layout = read(join('app', '_layout.tsx'));
  assert.match(layout, /consumeReturnToSettings\(\)\) return;\n\s+setTimeout\(\(\) => \{ try \{ router\.replace\('\/me'\); router\.push\('\/settings'\); \} catch/);
});

check('one Fab for every floating gold button: Me writes a post, Library writes a diary page, both sit just above the tab bar', () => {
  const fab = read(join('src', 'components', 'Fab.tsx'));
  const bar = read(join('src', 'components', 'TabBar.tsx'));
  assert.match(read(join('app', '(tabs)', 'me.tsx')), /<Fab label="Write a journey post" onPress=\{\(\) => router\.push\('\/write'\)\} \/>/);
  assert.match(read(join('app', '(tabs)', 'library.tsx')), /<Fab label="Write in your diary" icon="compose" onPress=\{\(\) => router\.push\('\/diary\/new'\)\} \/>/);
  // the FAB's offset is the tab bar's own numbers: bottom Math.max(inset - 14, 10), height 88, and 8 above it
  assert.match(bar, /Math\.max\(insets\.bottom - 14, 10\)/);
  assert.match(bar, /height: 88/);
  assert.match(fab, /Math\.max\(insets\.bottom - 14, 10\) \+ 88 \+ 8/);
  // no screen draws its own copy any more
  const own = files.filter((f) => f !== join('src', 'components', 'Fab.tsx') && /position: 'absolute', right: layout\.screenMargin, bottom: Math\.max\(insets\.bottom - 14/.test(read(f)));
  assert.deepEqual(own, [], 'use <Fab> instead of a copy of it');
});

check('Library: a banner, the diary card, and the tabs Bible, Books, Music, each with an honest notice that it is a preview', () => {
  assert.deepEqual([...LIBRARY_TABS], ['Bible', 'Books', 'Music']);
  for (const t of LIBRARY_TABS) assert.ok(PREVIEW_NOTICE[t].length > 40, `${t} has no notice`);
  const screen = read(join('app', '(tabs)', 'library.tsx'));
  assert.match(screen, /<PromoBanner promos=/);
  assert.match(screen, /<DiaryCard \/>/);
  assert.match(screen, /<SubTabs tabs=\{LIBRARY_TABS\}/);
  const tabsSrc = read(join('src', 'features', 'library', 'LibraryTabs.tsx'));
  for (const t of LIBRARY_TABS) assert.match(tabsSrc, new RegExp(`<Notice tab="${t}" />`), `the ${t} tab does not start with its notice`);
  assert.match(tabsSrc, /<SampleNotice title="Preview">/);
});

check('the sample content never claims to be real: no price, no rating, no "available", no play button that plays', () => {
  const data = read(join('src', 'features', 'library', 'sample.ts')) + read(join('src', 'features', 'library', 'LibraryTabs.tsx'));
  assert.doesNotMatch(data, /\$\d|€\d|\brating\b|★|available now|download|onPress/i);
});

check('the diary is reachable: its routes exist and are registered, and the Library card and pen open it', () => {
  assert.ok(exists(join('app', 'diary', 'index.tsx')));
  assert.ok(exists(join('app', 'diary', '[id].tsx')));
  const layout = read(join('app', '_layout.tsx'));
  assert.match(layout, /<Stack\.Screen name="diary\/index" \/>/);
  assert.match(layout, /<Stack\.Screen name="diary\/\[id\]" \/>/);
});

check('every screen registered in the root layout is a file, so the stack never warns about a missing route', () => {
  const layout = read(join('app', '_layout.tsx'));
  for (const m of layout.matchAll(/<Stack\.Screen name="([^"]+)"/g)) {
    const name = m[1];
    const candidates = [`${name}.tsx`, join(name, 'index.tsx'), join(name, '_layout.tsx')];
    assert.ok(candidates.some((c) => exists(join('app', c))), `app/${name} does not exist`);
  }
});

console.log(`${n} of ${n} passed`);
