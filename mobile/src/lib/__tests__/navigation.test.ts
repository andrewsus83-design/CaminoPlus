// Plain-node checks of how the app is laid out: which tabs there are, where Settings lives, and that nothing a screen
// opens is missing. Run: npm run test:lib
//
// The tab bar is Me, Stays, Maps, Discover, Library. Settings is not a tab: it is a screen of its own, opened from the
// gear at the top right of Me. Library has no title: its top row is a search field, the round Bookmarks button and the round
// diary button in the corner (the size of Me's bell and gear); under it a banner and the tabs Bible, Books and Music, and a
// gold pen that writes a diary page. These checks fail when someone brings a tab back without its icon (the tab bar would crash
// on it), when a route file and the tab list disagree, when a link still points at the old Settings tab, or when the Library
// header drifts from the design page.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { LIBRARY_TABS, PREVIEW_NOTICE, searchNotice } from '../../features/library/sample';

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
/** The path strings of one icon of Icon.tsx (each icon is one line of PATHS). */
const iconPaths = (name: string): string[] => {
  const line = read(join('src', 'components', 'Icon.tsx')).split('\n').find((l) => new RegExp(`^ {2}'?${name}'?: \\[`).test(l));
  assert.ok(line, `Icon.tsx has no line for the icon "${name}"`);
  return [...line!.matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((s) => s !== name);
};
// WCAG contrast of two colours of src/theme/tokens.json, for a colour role, in light and in dark (the same resolution as theme/index.ts).
type Tokens = { color: Record<string, string>; role: Record<string, string>; dark: { color: Record<string, string>; role: Record<string, string> } };
const tokens = JSON.parse(read(join('src', 'theme', 'tokens.json'))) as Tokens;
const roleColour = (role: string, dark: boolean): string => {
  const literal = dark ? tokens.dark.role[role] : undefined;
  if (literal) return literal.startsWith('#') ? literal : (tokens.dark.color[literal] ?? tokens.color[literal]);
  const name = tokens.role[role];
  return (dark ? tokens.dark.color[name] : undefined) ?? tokens.color[name];
};
const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

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
  for (const extra of ['library', 'book', 'music', 'diary', 'bookmark', 'search', 'close']) assert.ok(iconNames.includes(extra), `Icon.tsx has no icon "${extra}"`);
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

check('the My Camino card stays on Me, with its Change button, in the app and in the design page', () => {
  const me = read(join('app', '(tabs)', 'me.tsx'));
  assert.match(me, /accessibilityLabel="Change Camino"/);
  assert.match(me, /My Camino/);
  assert.match(me, /<AppText variant="label" color=\{role\.onHighlight\}>Change<\/AppText>/);
  assert.match(me, /router\.push\('\/change-camino'\)/);
  const design = readFileSync(join(root, '..', 'design', 'index.html'), 'utf8');
  const phone = design.slice(design.indexOf('<b>Me · Journey</b>'), design.indexOf('<b>Me · Write · Pick photos</b>'));
  assert.ok(phone.length > 1000, 'the Me · Journey phone was not found in design/index.html');
  assert.match(phone, />My Camino</, 'the design page lost the My Camino card');
  assert.match(phone, />Change</, 'the design page lost the Change button');
});

check('"My Camino" on the card is set in Fraunces, the brand title font, in the app and in the design page', () => {
  const me = read(join('app', '(tabs)', 'me.tsx'));
  const line = me.split('\n').find((l) => />My Camino<\/AppText>/.test(l)) ?? '';
  assert.match(line, /variant="h4"/, 'the My Camino label is not an h4 (Fraunces 600) AppText');
  assert.doesNotMatch(line, /textTransform|fontFamily/, 'the My Camino label carries a font of its own');
  assert.match(read(join('src', 'theme', 'index.ts')), /title: 'Fraunces_600SemiBold'/);
  const design = readFileSync(join(root, '..', 'design', 'index.html'), 'utf8');
  const phone = design.slice(design.indexOf('<b>Me · Journey</b>'), design.indexOf('<b>Me · Write · Pick photos</b>'));
  assert.match(phone, /font-family:var\(--cp-font-title\);[^"]*">My Camino</, 'the design card label is not Fraunces');
});

check('Buen Camino! is Caveat Bold, as the brand design system says: the accent variant in the app, the accent font at 700 in the design page, and one Caveat note on the Me phone', () => {
  // app: every display "Buen Camino!" is an AppText with variant="accent" (Caveat_700Bold in src/theme), never a font of its own
  for (const f of files) {
    read(f).split('\n').forEach((line) => {
      if (/>Buen Camino!</.test(line) && /<AppText\b/.test(line)) assert.match(line, /variant="accent"/, `${f}: Buen Camino! is not drawn in the accent font`);
    });
  }
  assert.match(read(join('src', 'theme', 'index.ts')), /accent: 'Caveat_700Bold'/);
  // design page: the card uses the accent font at weight 700, and the phone has no second Caveat (brand: max one per design)
  const design = readFileSync(join(root, '..', 'design', 'index.html'), 'utf8');
  const phone = design.slice(design.indexOf('<b>Me · Journey</b>'), design.indexOf('<b>Me · Write · Pick photos</b>'));
  assert.match(phone, /font-family:var\(--cp-font-accent\);font-weight:700;[^"]*">Buen Camino!</, 'the design card is not Caveat Bold');
  assert.equal((phone.match(/--cp-font-accent/g) ?? []).length, 1, 'more than one Caveat note on the Me phone');
  assert.match(design, /--cp-font-accent|tokens\.css/);
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

check('Library has no title and no diary card: its first row is the search field, then the round Bookmarks button, then the round diary button in the corner', () => {
  const screen = read(join('app', '(tabs)', 'library.tsx'));
  assert.doesNotMatch(screen, /<AppText variant="(?:display|h[1-4])"[^>]*>\s*Library\s*<\/AppText>/, 'a visible "Library" title is back');
  assert.doesNotMatch(screen, /DiaryCard/, 'the diary card is back');
  assert.ok(!exists(join('src', 'features', 'diary', 'DiaryCard.tsx')), 'the DiaryCard component is meant to be gone');
  assert.deepEqual(files.filter((f) => /DiaryCard/.test(read(f))), [], 'something still refers to the DiaryCard');
  // a screen reader still gets the heading of the screen: hidden (1 x 1, clipped, see-through letters: not opacity 0 or hidden, which a
  // screen reader leaves out) and first in the screen
  assert.match(screen, /const VISUALLY_HIDDEN = \{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', color: 'transparent' \} as const;/);
  const hidden = screen.indexOf('<AppText accessibilityRole="header" style={VISUALLY_HIDDEN}>Library</AppText>');
  const header = screen.indexOf('<LibraryHeader ');
  assert.ok(hidden > 0 && header > hidden, 'the hidden heading comes first, then the header row');
  // where the two buttons lead: decided by the screen, in one place
  assert.match(screen, /<LibraryHeader query=\{query\} onQuery=\{setQuery\} onBookmarks=\{\(\) => router\.push\('\/library\/bookmarks'\)\} onDiary=\{\(\) => router\.push\('\/diary'\)\} \/>/);
  // the row: search field, Bookmarks, diary, in that order, both buttons the size of Me's bell and gear (52) and labelled with a hint
  const row = read(join('src', 'features', 'library', 'LibraryHeader.tsx'));
  const search = row.indexOf('<SearchBar ');
  const bookmarks = row.indexOf('<IconButton name="bookmark"');
  const diary = row.indexOf('<IconButton name="diary"');
  assert.ok(search > 0 && bookmarks > search && diary > bookmarks, 'order: search field, Bookmarks, diary (the diary is the right-most, in the corner)');
  assert.match(row.slice(bookmarks, bookmarks + 150), /label="Bookmarks" hint="Opens your bookmarks" onPress=\{onBookmarks\} size=\{52\} \/>/);
  assert.match(row.slice(diary, diary + 150), /label="My diary" hint="Opens your diary" onPress=\{onDiary\} size=\{52\} \/>/);
  assert.match(row, /import \{ IconButton \} from '@\/components\/ui';/, 'the same button as Me\'s');
  assert.match(row, /flexDirection: 'row', alignItems: 'center', gap: 8/);
  const me = read(join('app', '(tabs)', 'me.tsx'));
  assert.match(me.slice(me.indexOf('<IconButton name="bell"')), /size=\{52\}/, 'Me\'s buttons are 52 too');
  assert.match(read(join('src', 'components', 'ui.tsx')), /accessibilityHint=\{hint\}/);
  // the diary glyph is its own: not the Bible's closed book with a cross, not the open book of the tab
  assert.ok(iconPaths('diary').length >= 2);
  assert.notDeepEqual(iconPaths('diary'), iconPaths('book'));
  assert.notDeepEqual(iconPaths('diary'), iconPaths('library'));
  assert.notDeepEqual(iconPaths('bookmark'), iconPaths('diary'), 'the two buttons next to each other do not look alike');
});

check('Library: below the header a banner and the tabs Bible, Books, Music; Bible and Music say honestly that they are previews, the Books tab is real and says nothing of the kind; a search takes their place while something is typed, and says "examples" only while an example is in it', () => {
  assert.deepEqual([...LIBRARY_TABS], ['Bible', 'Books', 'Music']);
  assert.deepEqual(Object.keys(PREVIEW_NOTICE), ['Bible', 'Music'], 'the books are real: no Preview notice for the Books tab');
  for (const t of ['Bible', 'Music'] as const) assert.ok(PREVIEW_NOTICE[t].length > 40, `${t} has no notice`);
  const withExamples = searchNotice(['Bible', 'Books', 'Music']);
  assert.ok(withExamples && withExamples.length > 40 && /examples/i.test(withExamples), 'a search that lists examples says so');
  assert.equal(searchNotice(['Books']), null, 'a search that lists only books has no notice: nothing on it is an example');
  const screen = read(join('app', '(tabs)', 'library.tsx'));
  assert.match(screen, /<Screen keyboard>/, 'a button can be tapped while the keyboard is up');
  assert.match(screen, /<PromoBanner promos=/);
  assert.match(screen, /<SubTabs tabs=\{LIBRARY_TABS\}/);
  assert.match(screen, /isSearching\(query\) \? \(\s*<SearchResults query=\{query\} books=\{books\} marks=\{marks\} onClear=\{\(\) => setQuery\(''\)\} \/>\s*\) : \(\s*<>\s*<PromoBanner promos=/, 'the results take the place of the banner and the tabs, and clearing the field brings them back');
  assert.doesNotMatch(screen, /Preview · Books/, 'the banner does not call the books a preview');
  const tabsSrc = read(join('src', 'features', 'library', 'LibraryTabs.tsx'));
  for (const t of ['Bible', 'Music']) assert.match(tabsSrc, new RegExp(`<Notice tab="${t}" />`), `the ${t} tab does not start with its notice`);
  assert.doesNotMatch(tabsSrc, /<Notice tab="Books" \/>/, 'the Books tab starts with no notice');
  assert.match(tabsSrc, /<SampleNotice title="Preview">/);
  const results = read(join('src', 'features', 'library', 'SearchResults.tsx'));
  assert.match(results, /\{!!notice && <SampleNotice title="Preview">\{notice\}<\/SampleNotice>\}/, 'the search keeps the Preview notice while an example is in the results, and has none when nothing is');
  assert.match(results, /Clear search/);
  assert.match(read(join('src', 'components', 'Screen.tsx')), /keyboardShouldPersistTaps=\{keyboard \? 'handled' : 'never'\}/);
});

check('the search field: placeholder and label, the "search" key, no autocorrect, a clear button when there is text, roles for every colour, 52 high and shrinking, and its colours reach 4.5 : 1 in light and dark', () => {
  const src = read(join('src', 'features', 'library', 'SearchBar.tsx'));
  assert.match(src, /SEARCH_PLACEHOLDER = 'Search the Library'/);
  assert.match(src, /SEARCH_LABEL = 'Search the library'/);
  assert.match(src, /placeholder=\{narrow \? SEARCH_PLACEHOLDER_NARROW : SEARCH_PLACEHOLDER\}/, 'the whole sentence, or "Search" on a phone under 352 wide where it would be cut in the middle of a word');
  assert.match(src, /SEARCH_PLACEHOLDER_NARROW = 'Search'/);
  assert.match(src, /NARROW_UNDER = 352/);
  assert.match(src, /accessibilityLabel=\{SEARCH_LABEL\}/);
  assert.match(src, /returnKeyType="search"/);
  assert.match(src, /autoCorrect=\{false\}/);
  assert.match(src, /autoCapitalize="none"/);
  assert.match(src, /placeholderTextColor=\{role\.muted\}/);
  assert.match(src, /color: role\.text\b/);
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b|\bfixed\./, 'colours are theme roles (and the gold of the focus ring), never a literal or the fixed palette');
  assert.match(src, /height: 52, borderRadius: radius\.pill/, 'as high as the two round buttons next to it, and never under 48');
  assert.equal((src.match(/minWidth: 0/g) ?? []).length, 2, 'the pill and the input both shrink (a web input keeps its own width otherwise)');
  assert.match(src, /CLEAR_LABEL = 'Clear search'/);
  assert.match(src, /\{value\.length > 0 && \(\s*<Pressable\s+accessibilityRole="button"\s+accessibilityLabel=\{CLEAR_LABEL\}/);
  assert.match(src, /width: 48, height: 48/, 'the clear button is a 48 touch target');
  for (const dark of [false, true]) {
    const mode = dark ? 'dark' : 'light';
    const surface = roleColour('surface', dark);
    assert.ok(contrast(roleColour('text', dark), surface) >= 4.5, `typed text on the pill in ${mode}`);
    assert.ok(contrast(roleColour('textMuted', dark), surface) >= 4.5, `the placeholder (role.muted) on the pill in ${mode}`);
    assert.ok(contrast(roleColour('action', dark), surface) >= 3, `the bookmark icon on a row in ${mode}`);
  }
  for (const colour of ['goldSoft', 'blue100', 'successWash', 'red100', 'sand300', 'goldWash']) assert.ok(contrast(tokens.color.blue, tokens.color[colour]) >= 4.5, `the navy on the ${colour} cover (covers do not change with dark)`);
});

check('the design page shows the same Library: a search pill, the Bookmarks and diary buttons, no title and no diary card, and the diary glyph of its sprite is the app\'s', () => {
  const design = readFileSync(join(root, '..', 'design', 'index.html'), 'utf8');
  const at = design.indexOf('<b>Library</b>Search · bookmarks · diary');
  const phone = design.slice(at, design.indexOf('<b>Library · Search</b>'));
  assert.ok(at > 0 && phone.length > 2000, 'the Library phone was not found in design/index.html');
  assert.match(phone, /class="lib-search"[^>]*><svg[^>]*><use href="#i-search"\/><\/svg><span class="t">Search the Library<\/span>/);
  const bookmarks = phone.indexOf('aria-label="Bookmarks"');
  const diary = phone.indexOf('aria-label="My diary"');
  assert.ok(phone.indexOf('class="lib-search"') > 0 && bookmarks > phone.indexOf('class="lib-search"') && diary > bookmarks, 'search, then Bookmarks, then the diary');
  assert.match(phone.slice(bookmarks, bookmarks + 120), /#i-bookmark/);
  assert.match(phone.slice(diary, diary + 120), /#i-diary/);
  assert.doesNotMatch(phone, /scr-title|<h1/, 'a title is back on the Library phone');
  assert.doesNotMatch(phone, />My diary<\/div>/, 'the diary card is back on the Library phone');
  assert.match(phone, /aria-label="Write in your diary"/, 'the gold pen stays');
  const sprite = /<symbol id="i-diary"[^>]*>(.*?)<\/symbol>/.exec(design);
  assert.ok(sprite, 'the sprite of the design page has no i-diary');
  assert.deepEqual([...sprite![1].matchAll(/ d="([^"]+)"/g)].map((m) => m[1]), iconPaths('diary'), 'the diary glyph of the design page and of the app are the same drawing');
  for (const label of ['Library · Books', 'Library · Search', 'Library · Nothing found', 'Library · Bookmarks', 'Library · Bookmarks, empty']) assert.ok(design.includes(`<b>${label}</b>`), `the design page has no phone "${label}"`);
});

check('the sample content never claims to be real: no price, no rating, no "available", no play button that plays', () => {
  const data = read(join('src', 'features', 'library', 'sample.ts')) + read(join('src', 'features', 'library', 'LibraryTabs.tsx'));
  assert.doesNotMatch(data, /\$\d|€\d|\brating\b|★|available now|download|onPress/i);
});

check('the diary is reachable: its routes exist and are registered, and the diary button at the top right of Library and the gold pen open it', () => {
  assert.ok(exists(join('app', 'diary', 'index.tsx')));
  assert.ok(exists(join('app', 'diary', '[id].tsx')));
  const layout = read(join('app', '_layout.tsx'));
  assert.match(layout, /<Stack\.Screen name="diary\/index" \/>/);
  assert.match(layout, /<Stack\.Screen name="diary\/\[id\]" \/>/);
  const screen = read(join('app', '(tabs)', 'library.tsx'));
  assert.match(screen, /onDiary=\{\(\) => router\.push\('\/diary'\)\}/, 'the button opens the list of pages');
  assert.match(screen, /<Fab label="Write in your diary" icon="compose" onPress=\{\(\) => router\.push\('\/diary\/new'\)\} \/>/, 'the pen opens a blank page');
});

check('Bookmarks is a screen of its own: the file exists, it is registered next to the diary routes for a pilgrim with a journey, it has Back and a heading and no room for a tab bar', () => {
  assert.ok(exists(join('app', 'library', 'bookmarks.tsx')));
  const layout = read(join('app', '_layout.tsx'));
  assert.match(layout, /<Stack\.Screen name="diary\/\[id\]" \/>\n\s+<Stack\.Screen name="library\/bookmarks" \/>/);
  const guard = layout.indexOf('<Stack.Protected guard={onboarded}>');
  const at = layout.indexOf('<Stack.Screen name="library/bookmarks" />');
  assert.ok(guard > 0 && at > guard && layout.indexOf('</Stack.Protected>', guard) > at, 'registered inside the block of screens for someone who has a journey');
  const src = read(join('app', 'library', 'bookmarks.tsx'));
  assert.match(src, /<Screen tabBar=\{false\}>/);
  assert.match(src, /<IconButton name="back" label="Back" onPress=\{goBack\} \/>/);
  assert.match(src, /router\.canGoBack\(\) \? router\.back\(\) : router\.replace\('\/library'\)/);
  assert.match(src, /<AppText variant="h2" accessibilityRole="header">Bookmarks<\/AppText>/);
  assert.match(src, /<AppText variant="h4" accessibilityRole="header">Library<\/AppText>/);
  assert.match(src, /<AppText variant="h4" accessibilityRole="header" style=\{\{ marginTop: 8 \}\}>Posts<\/AppText>/);
  assert.match(src, /\{!!notice && <SampleNotice title="Preview">\{notice\}<\/SampleNotice>\}/, 'the Bible and Music rows kept here are still examples, and it says so while one is on the screen');
  const design = readFileSync(join(root, '..', 'design', 'index.html'), 'utf8');
  const phone = design.slice(design.indexOf('<b>Library · Bookmarks</b>'), design.indexOf('<b>Library · Bookmarks, empty</b>'));
  assert.ok(phone.length > 2000);
  assert.match(phone, />Bookmarks<\/h1>/);
  assert.match(phone, /class="lib-h">Library<\/h4>/);
  assert.match(phone, /class="lib-h"[^>]*>Posts<\/h4>/);
});

check('the books and the notes are screens of their own: the book, the reader and the Notebook are files, registered for someone with a journey, each with Back and no room for a tab bar, and the design page has a phone for each', () => {
  const screens = ['library/notes', 'library/book/[id]/index', 'library/book/[id]/[chapter]'];
  const layout = read(join('app', '_layout.tsx'));
  const guard = layout.indexOf('<Stack.Protected guard={onboarded}>');
  const end = layout.indexOf('</Stack.Protected>', guard);
  for (const name of screens) {
    assert.ok(exists(join('app', `${name}.tsx`)), `app/${name}.tsx exists`);
    const at = layout.indexOf(`<Stack.Screen name="${name}" />`);
    assert.ok(guard > 0 && at > guard && at < end, `${name} is registered inside the block of screens for someone who has a journey`);
  }
  for (const f of ['library/notes', 'library/book/[id]/index', 'library/book/[id]/[chapter]']) {
    const src = read(join('app', `${f}.tsx`));
    assert.match(src, /<Screen tabBar=\{false\}/, `${f}: no room for a tab bar it does not have`);
    assert.match(src, /name="back" label="Back"/, `${f}: a Back button`);
    assert.match(src, /router\.canGoBack\(\) \? router\.back\(\) : (router\.replace\(|toBook\(\))/, `${f}: Back works also when the screen was opened from a link (it goes to the book, or to the Library)`);
  }
  const design = readFileSync(join(root, '..', 'design', 'index.html'), 'utf8');
  const phone = (label: string, next: string) => {
    const a = design.indexOf(`<b>${label}</b>`);
    assert.ok(a > 0, `the design page has no phone "${label}"`);
    const b = design.indexOf(`<b>${next}</b>`, a);
    assert.ok(b > a, `the phone "${next}" does not follow "${label}"`);
    return design.slice(a, b);
  };
  assert.match(phone('Library · Books', 'Book'), /3 books in the app\. They are saved on this phone, so they read without a signal\./);
  assert.doesNotMatch(phone('Library · Books', 'Book'), /lib-notice|Sample</, 'the Books tab shows no Preview notice and no Sample tag: its covers are real');
  const book = phone('Book', 'Reader');
  for (const text of ['Continue reading', 'Contents', 'About this edition', 'Written with AI assistance']) assert.ok(book.includes(text), `the Book phone says "${text}"`);
  const reader = phone('Reader', 'Reader · Note');
  assert.match(reader, /class="bk-mark"[^>]*aria-label="Note on this paragraph"/, 'the side mark of a note');
  assert.match(reader, /Add a note<\/span><span>[^<]*<svg[^>]*><use href="#i-bookmark"\/><\/svg>Bookmark</, 'the two buttons under a selected paragraph');
  const sheet = phone('Reader · Note', 'Reader · Reflection');
  for (const text of ['Grow into a Diary page', 'Add another note', 'Only on this phone, never uploaded. Logging out clears your notes.']) assert.ok(sheet.includes(text), `the Note phone says "${text}"`);
  const reflect = phone('Reader · Reflection', 'Reader · Reflection sheet');
  for (const text of ['Write your reflection', 'You wrote a reflection', 'Open your reflection']) assert.ok(reflect.includes(text), `the Reflection phone says "${text}"`);
  assert.ok(phone('Reader · Reflection sheet', 'Notebook').includes('The questions for tonight'));
  const notebook = phone('Notebook', 'Notebook, empty');
  assert.ok(notebook.includes('Only on this phone. Notes are not uploaded and not shared. Logging out clears them, and if you delete the app or lose this phone, they are gone.'));
  assert.ok(notebook.includes('Search your notes'));
  assert.doesNotMatch(notebook.slice(notebook.indexOf('<div class="phone">')), /Share|share<|#i-share|likes|followers/, 'nothing to share in the Notebook');
  assert.ok(design.indexOf('<b>Notebook, empty</b>') > 0);
  // the Bookmarks phones show the way into the Notebook
  assert.match(phone('Library · Bookmarks', 'Library · Bookmarks, empty'), /<div style="font-weight:600;font-size:17px;line-height:22px">Notebook<\/div>/);
  assert.doesNotMatch(phone('Library · Nothing found', 'Library · Bookmarks'), /lib-notice/, 'nothing found: nothing on screen is an example, so no Preview notice');
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
