// Plain-node checks of the sub-tabs of Me and of the one gold pen that follows them: Me has exactly Notes, Journey, Plan, Health in that
// order and opens on Journey, each sub-tab has at most one floating button (a note on Notes, a journey post on Journey, none on Plan and
// Health), and the screen draws exactly one at a time. The data is features/me/tabs.ts (pure); the rest is source read as text, in the style of
// the other wiring tests: nothing is run. No React, no React Native, no network. Run: npm run test:me (it is run from highlights.test.ts).
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_ME_TAB, ME_FAB, ME_TABS } from '../tabs';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };
const root = process.cwd(); // npm test runs from mobile/
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const code = (src: string) => src.split('\n').filter((l) => !/^\s*(\/\/|\/?\*)/.test(l)).join('\n'); // without comment lines
const me = read('app/(tabs)/me.tsx');

check('Me has exactly the sub-tabs Notes, Journey, Plan, Health, in that order, and Notes is simply the first label', () => {
  assert.deepEqual([...ME_TABS], ['Notes', 'Journey', 'Plan', 'Health']);
  assert.equal(ME_TABS[0], 'Notes');
  assert.match(me, /<SubTabs tabs=\{ME_TABS\} value=\{tab\} onChange=\{setTab\} \/>/, 'the strip is drawn from the list, not from a copy of it');
  assert.equal((me.match(/<SubTabs\b/g) ?? []).length, 1, 'one strip');
  assert.doesNotMatch(me, /const TABS = /, 'no second list of the tabs in the screen');
});

check('Me opens on Journey, not on the first label: the highlights of Plan, Health and Notes lead to the Journey grid and that must keep working', () => {
  assert.equal(DEFAULT_ME_TAB, 'Journey');
  assert.ok((ME_TABS as readonly string[]).includes(DEFAULT_ME_TAB));
  assert.match(me, /const \[tab, setTab\] = useState<MeTab>\(DEFAULT_ME_TAB\);/);
  assert.match(me, /if \(tab !== 'Journey'\) \{ setTab\('Journey'\); setFilterKey\(h\.key\); return; \}/, 'from any other tab, Notes included, a highlight brings you to the grid with that destination');
});

check('each sub-tab has at most one floating button: a note on Notes, a journey post on Journey, none on Plan and Health, and every entry is complete', () => {
  assert.deepEqual(Object.keys(ME_FAB), [...ME_TABS], 'an entry for every sub-tab, in the order of the strip');
  assert.deepEqual(ME_FAB.Notes, { label: 'Write a note', icon: 'compose', href: '/diary/new' });
  assert.deepEqual(ME_FAB.Journey, { label: 'Write a journey post', icon: 'pen', href: '/write' });
  assert.equal(ME_FAB.Plan, null);
  assert.equal(ME_FAB.Health, null);
  const labels = Object.values(ME_FAB).filter((f): f is NonNullable<typeof f> => f !== null).map((f) => f.label);
  assert.equal(new Set(labels).size, labels.length, 'two sub-tabs never share a button');
  // the icons and the routes are real
  const icons = read('src/components/Icon.tsx');
  for (const f of Object.values(ME_FAB)) if (f) assert.match(icons, new RegExp(`^  '?${f.icon}'?: \\[`, 'm'), `Icon.tsx has no icon "${f.icon}"`);
  assert.ok(existsSync(join(root, 'app', 'write.tsx')), '/write is a screen');
  assert.ok(existsSync(join(root, 'app', 'diary', '[id].tsx')), '/diary/new is the diary page screen with the id "new"');
});

check('the screen draws exactly one Fab, and only the one of the sub-tab that is on: never two, never one on Plan or Health', () => {
  const src = code(me);
  assert.equal((src.match(/<Fab\b/g) ?? []).length, 1, 'one Fab element in the whole of the screen');
  assert.match(src, /const fab = ME_FAB\[tab\];/);
  assert.match(src, /\{fab && <Fab label=\{fab\.label\} icon=\{fab\.icon\} onPress=\{\(\) => router\.push\(fab\.href\)\} \/>\}/);
  assert.doesNotMatch(src, /label="Write a (?:note|journey post)"/, 'no label is written twice: the table has them');
  // the Fab is outside both hosts (it floats over whichever scroll is on), after the modal, as the last thing of the screen
  const fabAt = src.indexOf('{fab && <Fab');
  assert.ok(fabAt > src.indexOf('</Modal>') && fabAt > src.indexOf('</Screen>') && fabAt > src.indexOf('<NotesTab'), 'drawn after both hosts, so it floats over them');
  // no other file draws a gold pen next to it
  const others = ['app/(tabs)/library.tsx', 'app/(tabs)/stays.tsx', 'app/(tabs)/maps.tsx', 'app/(tabs)/explore.tsx'].filter((f) => /<Fab\b/.test(code(read(f))));
  assert.deepEqual(others, [], 'the other tabs have no gold pen');
});

check('the Notes sub-tab is the feed in the screen: NotesTab owns the scroll, gets the header and the strip as `top` with the margins Screen gives, and the messages about Me\'s data stay out of it', () => {
  const src = code(me);
  assert.match(src, /import \{ NotesTab \} from '@\/features\/notes\/NotesTab';/);
  assert.equal((src.match(/<NotesTab\b/g) ?? []).length, 1);
  assert.match(src, /const onNotes = tab === 'Notes';/);
  assert.match(src, /\{onNotes \? \(\s*<NotesTab top=\{<View style=\{\{ paddingTop: insets\.top \+ layout\.screenTop, paddingHorizontal: layout\.screenMargin, paddingBottom: 16, gap: 16 \}\}>\{top\}<\/View>\} \/>\s*\) : \(\s*<Screen>\s*\{top\}/);
  const notesHost = src.slice(src.indexOf('<NotesTab'), src.indexOf('<Screen>'));
  assert.doesNotMatch(notesHost, /FormMessage|offline|stale|error/, 'Notes needs no signal: no "You are offline" and no "Could not load your data" over it');
  const screenHost = src.slice(src.indexOf('<Screen>'), src.indexOf('</Screen>'));
  assert.match(screenHost, /\{\(offline \|\| stale\) && <FormMessage tone="info">/, 'Journey, Plan and Health keep their messages');
  assert.match(screenHost, /\{!!error && <FormMessage>/);
  for (const tab of ['Journey', 'Plan', 'Health']) assert.match(screenHost, new RegExp(`\\{tab === '${tab}' &&`), `${tab} is in the screen's own scroll`);
  assert.doesNotMatch(screenHost, /tab === 'Notes'/, 'Notes is not drawn in the other host');
  assert.match(code(read('src/features/notes/NotesTab.tsx')), /contentContainerStyle=\{\{ paddingBottom: layout\.tabbarHeight \+ insets\.bottom \+ 96 \}\}/, 'the feed leaves room for the tab bar and the pen');
});

check('the header (handle, bell and gear, avatar, bio, My Camino, highlights) is one piece drawn by both hosts, and the strip is its last child', () => {
  const src = code(me);
  const top = src.indexOf('const top = (');
  const strip = src.indexOf('<SubTabs tabs={ME_TABS}', top);
  const hl = src.indexOf('<Highlights', top);
  const bell = src.indexOf('<IconButton name="bell"', top);
  assert.ok(top > 0 && bell > top && hl > bell && strip > hl, 'the bell, then the highlights, then the strip, all in `top`');
  assert.equal((src.match(/\{top\}/g) ?? []).length, 2, 'drawn in the two hosts: once in each');
  assert.doesNotMatch(src.slice(strip, src.indexOf('</>', strip)), /<Fab|<JourneyGrid|<Health/, 'nothing but the strip after the highlights, inside the header');
});

check('four labels fit in a row at 320: the strip gives each one a quarter of the width with no side padding of its own, and a label is one short word', () => {
  const ui = code(read('src/components/ui.tsx'));
  const strip = ui.slice(ui.indexOf('export function SubTabs'), ui.indexOf('export function Photo'));
  assert.match(strip, /flexDirection: 'row'/);
  assert.match(strip, /flex: 1, alignItems: 'center', paddingTop: 14, paddingBottom: 12/, 'equal columns that share the row, and no horizontal padding that would take room from the label');
  assert.doesNotMatch(strip, /paddingHorizontal|paddingLeft|paddingRight|minWidth/);
  const room = (320 - 2 * 16) / ME_TABS.length; // the screen's margins are 16; 72 px a label
  assert.equal(room, 72);
  for (const t of ME_TABS) assert.ok(t.length <= 7 && !/\s/.test(t), `"${t}" is one short word`);
  // the longest, "Journey", at 17 px in Inter SemiBold (the label style) is about 62 px: the web smoke measures it in a browser at 320 (tools/web-smoke/scenarios.mjs)
  assert.equal((JSON.parse(read('src/theme/tokens.json')) as { text: { label: { size: number } } }).text.label.size, 17);
  assert.equal((JSON.parse(read('src/theme/tokens.json')) as { layout: { screenMargin: number } }).layout.screenMargin, 16);
});

check('the words: Help says the diary is in the Notes tab of Me, and nothing in the app sends anyone to the Library for it', () => {
  assert.match(read('app/help.tsx'), /Open Me and tap the Notes tab: your diary lives there\./);
  assert.doesNotMatch(code(read('app/(tabs)/library.tsx')), /Notes/);
  assert.match(read('app/diary/[id].tsx'), /router\.replace\('\/me'\)/);
  assert.match(read('app/diary/index.tsx'), /router\.replace\('\/me'\)/);
});

console.log(`${n} of ${n} passed (Me sub-tabs)`);
