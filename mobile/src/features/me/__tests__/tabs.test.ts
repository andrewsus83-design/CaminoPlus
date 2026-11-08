// Plain-node checks of the sub-tabs of Me and of the one gold button that floats over them: Me has exactly Notes, Journey, Plan, Health in that order and
// opens on Journey, and ONE gold button floats over Me, the chat button, the same on every sub-tab (it opens the inbox, on the tab where something waits,
// and carries the unread badge that the bell used to carry). The bell is gone from the header, whose top right keeps only the gear. Writing does not float
// any more: the first card of the Journey grid writes a journey post and the card of Notes writes a note. The data and the numbers are features/me/tabs.ts
// (pure); the rest is source read as text, in the style of the other wiring tests: nothing is run. No React, no React Native, no network.
// Run: npm run test:me (it is run from highlights.test.ts).
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BADGE_MAX, DEFAULT_ME_TAB, INBOX_LABEL, JOURNEY_WRITE, ME_FAB, ME_TABS, badgeText, inboxLabel, inboxTab } from '../tabs';

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
  // Updated on purpose with the All item: the sub-tab is always Journey after a tap on a highlight or on All, and what the grid shows is decided by features/me/journeyView.ts
  // (tapDestination, tapAll: from another sub-tab they always open the destination / the stamps; on Journey the same one again closes it).
  assert.match(me, /const pickHighlight = \(h: \{ key: string \}\) => \{\n(?:\s*\/\/[^\n]*\n)*\s*setTab\('Journey'\);\n\s*setView\(\(v\) => tapDestination\(v, h\.key, onJourney\)\);/, 'from any other tab, Notes included, a highlight brings you to the grid with that destination');
  assert.match(me, /const pickAll = \(\) => \{\n(?:\s*\/\/[^\n]*\n)*\s*setTab\('Journey'\);\n\s*setView\(\(v\) => tapAll\(v, onJourney\)\);/, 'from Plan, Health and Notes the All item brings you to the stamps of the Journey area');
  assert.match(me, /const onJourney = tab === 'Journey';/);
});

/* ================================================================ the chat button */

check('the floating button of Me is the chat button, one for every sub-tab: the chat icon, the inbox, "Inbox", and a hint that says what it holds', () => {
  assert.deepEqual(ME_FAB, { icon: 'chat', href: '/inbox', label: 'Inbox', hint: 'Opens your notifications, messages and groups' });
  assert.equal(INBOX_LABEL, 'Inbox');
  assert.ok(!Array.isArray(ME_FAB) && !('Notes' in ME_FAB), 'it is not a table per sub-tab: there is one button and it is the same on Notes, Journey, Plan and Health');
  // the icon and the screen are real
  assert.match(read('src/components/Icon.tsx'), /^ {2}chat: \[/m, 'Icon.tsx has the chat icon');
  assert.ok(existsSync(join(root, 'app', 'inbox.tsx')), '/inbox is a screen');
  assert.match(read('app/_layout.tsx'), /<Stack\.Screen name="inbox" \/>/, 'and it is registered');
});

check('the tab of the inbox the button opens on: Messages when a chat or a group has something unread, else Notifications when a notification has, else Messages', () => {
  assert.equal(inboxTab({ notifications: 0, chats: 0, groups: 0 }), 'messages', 'nothing is new: the chats');
  assert.equal(inboxTab({ notifications: 4, chats: 0, groups: 0 }), 'notifications', 'only notifications wait');
  assert.equal(inboxTab({ notifications: 0, chats: 2, groups: 0 }), 'messages');
  assert.equal(inboxTab({ notifications: 0, chats: 0, groups: 3 }), 'messages', 'a group message is a message');
  assert.equal(inboxTab({ notifications: 9, chats: 1, groups: 0 }), 'messages', 'messages win over notifications');
  assert.equal(inboxTab({ notifications: 9, chats: 0, groups: 1 }), 'messages', 'a group counts too');
  assert.equal(inboxTab({ notifications: 1, chats: 2, groups: 3 }), 'messages');
  assert.equal(inboxTab({}), 'messages', 'the parts not known yet are 0');
  assert.equal(inboxTab(null), 'messages');
  assert.equal(inboxTab(undefined), 'messages');
  // what should never count: a negative number, NaN, a string, a fraction below 1
  assert.equal(inboxTab({ notifications: 2, chats: -5, groups: Number.NaN }), 'notifications');
  assert.equal(inboxTab({ notifications: 0, chats: 0.4, groups: 0 }), 'messages');
  assert.equal(inboxTab({ notifications: '7' as unknown as number, chats: 0, groups: 0 }), 'messages', 'a string is not a count');
  assert.equal(inboxTab({ notifications: Infinity, chats: 0, groups: 0 }), 'messages', 'an infinite number is not a count either');
  // every answer is a tab that app/inbox.tsx reads from ?tab=, so the button never opens a tab that does not exist
  const inbox = read('app/inbox.tsx');
  assert.match(inbox, /const parseTab = \(v: unknown\): InboxTab => \(v === 'messages' \|\| v === 'groups' \? v : 'notifications'\);/, 'the inbox reads ?tab=messages|groups and anything else is Notifications');
  assert.match(inbox, /type InboxTab = 'notifications' \| 'messages' \| 'groups';/);
  for (const t of ['messages', 'notifications'] as const) assert.match(inbox, new RegExp(`key: '${t}' as const`), `the inbox has the tab ${t}`);
});

check('the badge: nothing for none, the number up to 99, "99+" above; the label says the real number; garbage is no badge', () => {
  assert.equal(BADGE_MAX, 99);
  assert.equal(badgeText(0), '');
  assert.equal(badgeText(1), '1');
  assert.equal(badgeText(3), '3');
  assert.equal(badgeText(12), '12');
  assert.equal(badgeText(98), '98');
  assert.equal(badgeText(99), '99');
  assert.equal(badgeText(100), '99+');
  assert.equal(badgeText(5000), '99+');
  for (const bad of [-1, -50, Number.NaN, Infinity, -Infinity, undefined, null, '3', {}, 0.6]) assert.equal(badgeText(bad), '', `no badge for ${String(bad)}`);
  assert.equal(badgeText(3.9), '3', 'a whole number: the fraction is dropped');
  assert.equal(inboxLabel(0), 'Inbox');
  assert.equal(inboxLabel(1), 'Inbox, 1 unread');
  assert.equal(inboxLabel(3), 'Inbox, 3 unread');
  assert.equal(inboxLabel(99), 'Inbox, 99 unread');
  assert.equal(inboxLabel(150), 'Inbox, 150 unread', 'a screen reader hears the real number: only the badge is capped');
  for (const bad of [-1, Number.NaN, undefined, null, '3']) assert.equal(inboxLabel(bad), 'Inbox', `just "Inbox" for ${String(bad)}`);
  // the words of the badge and of the label never disagree: when there is a badge the label has a number, when there is none it has none
  for (let total = 0; total <= 260; total += 1) assert.equal(badgeText(total) !== '', inboxLabel(total) !== 'Inbox', `${total}`);
});

check('the screen draws exactly ONE Fab, with no condition: never none, never two, on Notes, Journey, Plan and Health alike; with the label and badge of the unread count and the route of the inbox', () => {
  const src = code(me);
  assert.equal((src.match(/<Fab\b/g) ?? []).length, 1, 'one Fab element in the whole of the screen');
  assert.doesNotMatch(src, /ME_FAB\[/, 'no table of buttons by sub-tab');
  assert.doesNotMatch(src, /const fab = /, 'no `fab` that could be null');
  assert.doesNotMatch(src, /\{fab &&|tab === '\w+' && <Fab|onNotes && <Fab/, 'the button has no condition on the sub-tab');
  assert.match(src, /<Fab label=\{inboxLabel\(unread\.total\)\} icon=\{ME_FAB\.icon\} hint=\{ME_FAB\.hint\} badge=\{badgeText\(unread\.total\)\} onPress=\{openInbox\} \/>/);
  assert.match(src, /const openInbox = \(\) => router\.push\(\{ pathname: ME_FAB\.href, params: \{ tab: inboxTab\(unread\) \} \}\);/, 'it opens /inbox on the tab where something waits');
  assert.match(src, /const unread = useUnreadTotals\(\);/, 'the numbers are the shared ones the inbox uses');
  assert.doesNotMatch(src, /label="Inbox|Inbox, \$\{|Math\.min\(unread/, 'no label or cap written a second time in the screen: tabs.ts has them');
  // the Fab is outside both hosts (it floats over whichever scroll is on), after the modal, as the last thing of the screen
  const fabAt = src.indexOf('<Fab ');
  assert.ok(fabAt > src.indexOf('</Modal>') && fabAt > src.indexOf('</Screen>') && fabAt > src.indexOf('<NotesTab'), 'drawn after both hosts, so it floats over them');
  assert.match(src, /<Fab [^\n]*\/>\s*<\/View>\s*\);\s*\}\s*$/, 'the last thing in the screen');
  // no other tab draws a gold button next to it
  const others = ['app/(tabs)/library.tsx', 'app/(tabs)/stays.tsx', 'app/(tabs)/maps.tsx', 'app/(tabs)/explore.tsx'].filter((f) => /<Fab\b/.test(code(read(f))));
  assert.deepEqual(others, [], 'the other tabs have no gold button');
  // nothing else of Me floats: no second Fab, and the Notes tab and the Journey grid draw none
  for (const f of ['src/features/notes/NotesTab.tsx', 'src/features/notes/NotesHeader.tsx', 'src/features/me/JourneyGrid.tsx', 'src/features/me/WriteCard.tsx', 'src/features/me/SampleJourney.tsx']) assert.doesNotMatch(code(read(f)), /\bFab\b/, `${f} draws no floating button`);
  // Plan and Health have the room the button needs under their last thing: the screen's own, and 56 more (the gap and a spacer), the room of the Notes feed
  assert.match(me, /<View style=\{\{ height: 40 \}\} \/>\s*<\/Screen>/, 'room under the last thing of Journey, Plan and Health');
});

check('the Fab component draws what it is given: the badge is optional, ringed in the page colour, in the roles danger and onDanger, and it stays inside the screen edge', () => {
  const fab = code(read('src/components/Fab.tsx'));
  assert.match(fab, /badge, hint \}: \{ label: string; onPress: \(\) => void; icon\?: IconName; badge\?: string; hint\?: string \}\)/);
  assert.match(fab, /accessibilityLabel=\{label\}/);
  assert.match(fab, /accessibilityHint=\{hint\}/);
  assert.match(fab, /\{!!badge && \(/, 'no badge when there is no text');
  assert.match(fab, /backgroundColor: role\.danger, borderWidth: 2, borderColor: role\.bg/, 'red on the page-colour ring, so the red and the gold never touch');
  assert.match(fab, /color=\{role\.onDanger\}/, 'the text on the red is onDanger');
  assert.match(fab, /\{badge\}<\/AppText>/, 'it draws the text it was given: the caps are not its business');
  assert.match(fab, /top: -4, right: -4, minWidth: 26, height: 26/, 'a round label of 26 on the top right rim, sticking out 4');
  assert.match(fab, /numberOfLines=\{1\}/, 'one line, so "99+" never wraps');
  assert.match(fab, /accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none"/, 'a screen reader hears the number in the label, not twice');
  // 4 px sticks out and the button is 16 from the edge: 12 px stay inside the screen. The button itself did not move (the tab bar's numbers, 60 round).
  const tokens = JSON.parse(read('src/theme/tokens.json')) as { layout: { screenMargin: number } };
  assert.ok(tokens.layout.screenMargin - 4 >= 12, 'the badge keeps at least 12 px from the screen edge');
  assert.match(fab, /right: layout\.screenMargin, bottom: Math\.max\(insets\.bottom - 14, 10\) \+ 88 \+ 8, width: 60, height: 60/);
  assert.doesNotMatch(fab, /#[0-9A-Fa-f]{3,8}\b|\brgba?\(/, 'no colour written out');
});

check('the bell is gone: the header of Me has Settings at the top right and nothing next to it, and the handle and the copy button stay on the left', () => {
  const src = code(me);
  assert.doesNotMatch(src, /name="bell"|<IconButton name="bell"|bell/i, 'no bell anywhere in the screen');
  assert.equal((src.match(/<IconButton\b/g) ?? []).length, 1, 'one IconButton in the screen: the gear');
  const gear = src.indexOf('<IconButton name="settings"');
  assert.ok(gear > 0);
  assert.match(src.slice(gear, gear + 200), /label="Settings" onPress=\{\(\) => router\.push\('\/settings'\)\} size=\{52\} \/>/);
  const row = src.slice(src.indexOf("style={{ marginLeft: 'auto', flexDirection: 'row'"), gear + 200);
  assert.doesNotMatch(row, /badge=/, 'no badge in the header: it moved to the chat button');
  assert.match(src, /accessibilityLabel=\{copied \? 'Username copied' : 'Copy username'\}/, 'the left of the row is as it was');
  assert.doesNotMatch(src, /Math\.min\(unread\.total, 99\)/, 'the old bell badge is gone');
});

/* ================================================================ the write cards */

check('the write card of Journey is cell 0 of the grid and nothing else changes about the posts: one component, one button, "Write a journey post", to /write', () => {
  assert.deepEqual(JOURNEY_WRITE, { label: 'Write a journey post', href: '/write' });
  assert.ok(existsSync(join(root, 'app', 'write.tsx')), '/write is a screen');
  const card = code(read('src/features/me/WriteCard.tsx'));
  assert.equal((card.match(/<Pressable\b/g) ?? []).length, 1, 'the whole tile is ONE button');
  assert.match(card, /accessibilityRole="button"/);
  assert.match(card, /accessibilityLabel=\{JOURNEY_WRITE\.label\}/);
  assert.match(card, /export function WriteCard\(\{ width, height, onPress \}: \{ width: number; height: number; onPress: \(\) => void \}\)/, 'its size is the size of a post tile: the grid gives it');
  assert.match(card, /style=\{\(\{ pressed \}\) => \(\{ width, height, /);
  assert.match(card, /<Icon name="pen" color=\{role\.onHighlight\} size=\{32\}/, 'the pen on the gold circle, 32 px: a step of the icon scale (it was 30, which is not one)');
  assert.match(card, /gap: space\[4\], paddingHorizontal: space\[3\]/, 'the room inside the card is steps of the space scale (the gap was 14)');
  assert.match(card, /backgroundColor: role\.highlight/, 'a gold circle');
  assert.match(card, /<AppText variant="label" style=\{\{ textAlign: 'center' \}\}>\{JOURNEY_WRITE\.label\}<\/AppText>/, 'the words are the label style: 17 px');
  assert.deepEqual([...card.matchAll(/borderRadius: ([\w.]+)/g)].map((m) => m[1]), ['radius.pill'], 'square corners, like the post tiles: only the gold circle is round');
  assert.doesNotMatch(card, /#[0-9A-Fa-f]{3,8}\b|\brgba?\(|\bc\.\w+/, 'colours from the roles only');
  assert.match(read('src/components/Icon.tsx'), /^ {2}pen: \[/m, 'the pen is an icon of the app');
  assert.equal(tokensText('text', 'label', 'size'), 17, 'the label style is 17 px: readable');
  // the grid draws it as its first cell, in every journey: the sample, a real one, and one filtered to a destination (they are all JourneyGrid)
  const grid = code(read('src/features/me/JourneyGrid.tsx'));
  assert.match(grid, /const rows = useMemo\(\(\) => gridCellRows\(shown\.length\), \[shown\.length\]\);/, 'one cell more than there are posts');
  assert.match(grid, /if \(cell\.kind === 'write'\) return <WriteCard key="write" width=\{colW\} height=\{tileH\} onPress=\{\(\) => router\.push\(JOURNEY_WRITE\.href\)\} \/>;/);
  assert.match(grid, /const i = cell\.post;\s*const p = shown\[i\];/, 'the post of a cell is looked up by its own index among the posts shown');
  assert.match(grid, /onPress=\{\(\) => setOpenAt\(i\)\}/, 'the viewer opens at the index of the post, never at the cell');
  assert.match(grid, /<Viewer posts=\{shown\} media=\{media\} start=\{openAt\}/, 'the viewer pages through the posts shown, without the card');
  assert.match(grid, /const shown = useMemo\(\(\) => shownPosts\(posts, only\), \[posts, only\]\);/, 'the destination filter works on the posts alone');
  assert.match(grid, /const rail = usePostRail\(\{ posts, sample: !!sample \}\);/, 'the rail works on the posts alone');
  assert.doesNotMatch(grid, /gridRows\(/, 'no row maths of its own: the cells come from gridCellRows');
  assert.equal((grid.match(/<WriteCard\b/g) ?? []).length, 1, 'one card per grid');
  assert.match(code(read('src/features/me/SampleJourney.tsx')), /<JourneyGrid posts=\{SAMPLE\.posts\} sample=\{SAMPLE\.media\} \/>/, 'the sample journey is the same grid, so a pilgrim with no post yet has the card');
  // Updated on purpose with the All view: the sample journey is only for the plain grid (no filter, no post); a destination or a place, empty or not, is the same grid with the card in front
  assert.match(me, /posts\.length === 0 && shown\.kind === 'grid'\s*\? <SampleJourney \/>\s*: <JourneyGrid posts=\{posts\} media=\{media\} only=\{onlyIds\} \/>/, 'a destination filter, and a place of the All view, is still the same grid, with the card in front');
});

check('the card keeps its contrast in light and in dark: the words on the card and while it is pressed, the pen on the gold, the red badge, the quiet line and the arrow of the Notes card', () => {
  type Tokens = { color: Record<string, string>; role: Record<string, string>; dark: { color: Record<string, string>; role: Record<string, string> } };
  const tokens = JSON.parse(read('src/theme/tokens.json')) as Tokens;
  const palette = (dark: boolean): Record<string, string> => ({ ...tokens.color, ...(dark ? tokens.dark.color : {}) });
  const roleColour = (name: string, dark: boolean): string => {
    const literal = dark ? tokens.dark.role[name] : undefined;
    if (literal) return literal.startsWith('#') ? literal : palette(dark)[literal];
    return palette(dark)[tokens.role[name]];
  };
  const lin = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  const lum = (hex: string) => { const h = hex.replace('#', ''); const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
  const ratio = (a: string, b: string) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  const pairs: [string, string, string, number][] = [
    ['the words of the Journey card on its surface', 'text', 'surface', 4.5],
    ['the words of the Journey card while it is pressed (sunken)', 'text', 'surfaceSunken', 4.5],
    ['the pen on the gold circle (onHighlight on highlight)', 'onHighlight', 'highlight', 4.5],
    ['the title of the Notes card on its surface', 'text', 'surface', 4.5],
    ['the quiet line of the Notes card (muted on surface)', 'textMuted', 'surface', 4.5],
    ['the quiet line while the card is pressed (muted on sunken)', 'textMuted', 'surfaceSunken', 4.5],
    ['the arrow of the Notes card (muted on surface)', 'textMuted', 'surface', 3],
    ['the text of the badge on its red (onDanger on danger)', 'onDanger', 'danger', 4.5],
  ];
  for (const dark of [false, true]) {
    for (const [what, fg, bg, need] of pairs) {
      const got = ratio(roleColour(fg, dark), roleColour(bg, dark));
      assert.ok(got >= need, `${dark ? 'dark' : 'light'}: ${what} is ${got.toFixed(2)} : 1, needs ${need} : 1`);
    }
  }
  // the gold of the button is the palette gold in both modes (it never changes), and the pen on it is the role onHighlight
  assert.match(read('src/components/Fab.tsx'), /backgroundColor: c\.gold/);
  assert.match(read('src/components/Fab.tsx'), /<Icon name=\{icon\} color=\{role\.onHighlight\}/);
});

/* ================================================================ the rest of the screen */

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
  assert.match(code(read('src/features/notes/NotesTab.tsx')), /contentContainerStyle=\{\{ paddingBottom: layout\.tabbarHeight \+ insets\.bottom \+ 96 \}\}/, 'the feed leaves room for the tab bar and the chat button');
});

check('the header (handle, gear, avatar, bio, My Camino, highlights) is one piece drawn by both hosts, and the strip is its last child', () => {
  const src = code(me);
  const top = src.indexOf('const top = (');
  const strip = src.indexOf('<SubTabs tabs={ME_TABS}', top);
  const hl = src.indexOf('<Highlights', top);
  const gear = src.indexOf('<IconButton name="settings"', top);
  assert.ok(top > 0 && gear > top && hl > gear && strip > hl, 'the gear, then the highlights, then the strip, all in `top`');
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
  assert.equal(tokensText('text', 'label', 'size'), 17);
  assert.equal((JSON.parse(read('src/theme/tokens.json')) as { layout: { screenMargin: number } }).layout.screenMargin, 16);
});

check('the words: Help says the diary is in the Notes tab of Me, and nothing in the app sends anyone to the Library for it', () => {
  assert.match(read('app/help.tsx'), /Open Me and tap the Notes tab: your diary lives there\./);
  assert.doesNotMatch(code(read('app/(tabs)/library.tsx')), /Notes/);
  assert.match(read('app/diary/[id].tsx'), /router\.replace\('\/me'\)/);
  assert.match(read('app/diary/index.tsx'), /<BackButton fallback="\/me" \/>/);
});

function tokensText(group: string, name: string, key: string): number {
  const tokens = JSON.parse(read('src/theme/tokens.json')) as Record<string, Record<string, Record<string, number>>>;
  return tokens[group][name][key];
}

console.log(`${n} of ${n} passed (Me sub-tabs)`);
