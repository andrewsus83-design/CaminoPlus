// Plain-node checks of how the app is laid out: which tabs there are, where Settings lives, and that nothing a screen
// opens is missing. Run: npm run test:lib
//
// The tab bar is Me, Stays, Maps, Discover, Library. Settings is not a tab: it is a screen of its own, opened from the
// gear at the top right of Me. Library has no title: its top row is a search field and the round Bookmarks button in the corner
// (the size of Me's bell and gear); directly under it the tabs Bible, Books and Notes, then the banner of the tab (Bible and Books
// have one, Notes, the diary, has none). On Bible three choices float above the tab bar (Old Testament, Deuterocanon, New
// Testament); on Notes a gold pen writes a note. These checks fail when someone brings a tab back without its icon (the tab bar would
// crash on it), when a route file and the tab list disagree, when a link still points at the old Settings tab, or when the Library
// drifts from the design page.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BOOK_CATALOG } from '../../features/library/books/catalog';
import { LIBRARY_TABS, PREVIEW_NOTICE, SAMPLE_TABS, SEARCH_NOTICE } from '../../features/library/sample';

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

check('one Fab for every floating gold button: Me writes a post, the Notes tab of Library writes a note, both sit just above the tab bar', () => {
  const fab = read(join('src', 'components', 'Fab.tsx'));
  const bar = read(join('src', 'components', 'TabBar.tsx'));
  assert.match(read(join('app', '(tabs)', 'me.tsx')), /<Fab label="Write a journey post" onPress=\{\(\) => router\.push\('\/write'\)\} \/>/);
  assert.match(read(join('app', '(tabs)', 'library.tsx')), /<Fab label="Write a note" icon="compose" onPress=\{\(\) => router\.push\('\/diary\/new'\)\} \/>/);
  // the FAB's offset is the tab bar's own numbers: bottom Math.max(inset - 14, 10), height 88, and 8 above it
  assert.match(bar, /Math\.max\(insets\.bottom - 14, 10\)/);
  assert.match(bar, /height: 88/);
  assert.match(fab, /Math\.max\(insets\.bottom - 14, 10\) \+ 88 \+ 8/);
  // no screen draws its own copy any more
  const own = files.filter((f) => f !== join('src', 'components', 'Fab.tsx') && /position: 'absolute', right: layout\.screenMargin, bottom: Math\.max\(insets\.bottom - 14/.test(read(f)));
  assert.deepEqual(own, [], 'use <Fab> instead of a copy of it');
});

check('Library has no title and no diary button: its first row is the search field, then the one round Bookmarks button in the corner', () => {
  const screen = read(join('app', '(tabs)', 'library.tsx'));
  assert.doesNotMatch(screen, /<AppText variant="(?:display|h[1-4])"[^>]*>\s*Library\s*<\/AppText>/, 'a visible "Library" title is back');
  assert.doesNotMatch(screen, /DiaryCard/, 'the diary card is back');
  assert.ok(!exists(join('src', 'features', 'diary', 'DiaryCard.tsx')), 'the DiaryCard component is meant to be gone');
  assert.deepEqual(files.filter((f) => /DiaryCard/.test(read(f))), [], 'something still refers to the DiaryCard');
  assert.doesNotMatch(screen, /onDiary|router\.push\('\/diary'\)/, 'the diary button is gone from the top right: the diary is the Notes tab, directly under the search row');
  // a screen reader still gets the heading of the screen: hidden (1 x 1, clipped, see-through letters: not opacity 0 or hidden, which a
  // screen reader leaves out) and first in the screen
  assert.match(screen, /const VISUALLY_HIDDEN = \{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', color: 'transparent' \} as const;/);
  const hidden = screen.indexOf('<AppText accessibilityRole="header" style={VISUALLY_HIDDEN}>Library</AppText>');
  const header = screen.indexOf('<LibraryHeader ');
  assert.ok(hidden > 0 && header > hidden, 'the hidden heading comes first, then the header row');
  // where the button leads: decided by the screen, in one place
  assert.match(screen, /<LibraryHeader query=\{query\} onQuery=\{setQuery\} onBookmarks=\{\(\) => router\.push\('\/library\/bookmarks'\)\} \/>/);
  // the row: search field, then Bookmarks and nothing else; the button is the size of Me's bell and gear (52) and labelled with a hint
  const row = read(join('src', 'features', 'library', 'LibraryHeader.tsx'));
  const search = row.indexOf('<SearchBar ');
  const bookmarks = row.indexOf('<IconButton name="bookmark"');
  assert.ok(search > 0 && bookmarks > search, 'order: search field, Bookmarks (in the corner)');
  assert.equal((row.match(/<IconButton\b/g) ?? []).length, 1, 'Bookmarks is the only button of the row');
  assert.doesNotMatch(row.replace(/\/\*[\s\S]*?\*\//g, ''), /diary|onDiary|My diary/i, 'no diary button, no prop for it');
  assert.match(row.slice(bookmarks, bookmarks + 150), /label="Bookmarks" hint="Opens your bookmarks" onPress=\{onBookmarks\} size=\{52\} \/>/);
  assert.match(row, /import \{ IconButton \} from '@\/components\/ui';/, 'the same button as Me\'s');
  assert.match(row, /flexDirection: 'row', alignItems: 'center', gap: 8/);
  const me = read(join('app', '(tabs)', 'me.tsx'));
  assert.match(me.slice(me.indexOf('<IconButton name="bell"')), /size=\{52\}/, 'Me\'s buttons are 52 too');
  assert.match(read(join('src', 'components', 'ui.tsx')), /accessibilityHint=\{hint\}/);
  // the glyphs stay: the diary's spiral notebook is its own drawing, not the Bible's closed book with a cross, not the open book of the tab,
  // and not the bookmark next to it (the Notes tab, or anything else, may use it)
  assert.ok(iconPaths('diary').length >= 2);
  assert.notDeepEqual(iconPaths('diary'), iconPaths('book'));
  assert.notDeepEqual(iconPaths('diary'), iconPaths('library'));
  assert.notDeepEqual(iconPaths('bookmark'), iconPaths('diary'));
});

check('Library: directly under the search row the tabs Bible, Books, Notes, and only then the banner of the tab; Notes has no banner; a search takes the place of all of it, and says its results are examples', () => {
  assert.deepEqual([...LIBRARY_TABS], ['Bible', 'Books', 'Notes']);
  assert.deepEqual([...SAMPLE_TABS], ['Bible', 'Books']);
  assert.deepEqual(Object.keys(PREVIEW_NOTICE), ['Bible', 'Books'], 'the tabs that hold example rows have a notice; Notes is real and has none');
  for (const t of SAMPLE_TABS) assert.ok(PREVIEW_NOTICE[t].length > 40, `${t} has no notice`);
  assert.equal(SEARCH_NOTICE, 'These results are examples. The Bible text and books are not in the app yet.');
  const screen = read(join('app', '(tabs)', 'library.tsx'));
  assert.match(screen, /<Screen keyboard scrollRef=\{scroller\}/, 'a button can be tapped while the keyboard is up');
  assert.doesNotMatch(screen, /PromoBanner/, 'the carousel with dots is gone from Library: one banner for each of two tabs');
  assert.doesNotMatch(screen, /MusicTab|'Music'/);
  // the top of the screen is one piece, `top`, drawn by both hosts: the heading, the search row, the message, and then the tab strip (not while searching)
  const at = (needle: string, from = 0) => { const i = screen.indexOf(needle, from); assert.ok(i > 0, `library.tsx has no ${needle}`); return i; };
  const top = at('const top = ('), header = at('<LibraryHeader ', top), strip = at('<SubTabs tabs={LIBRARY_TABS}', top);
  assert.ok(header < strip, 'the search row comes first, the tab strip directly after it');
  assert.match(screen, /\{!searching && <SubTabs tabs=\{LIBRARY_TABS\} value=\{tab\} onChange=\{setTab\} \/>\}/, 'the tab strip is drawn unless something is typed, and it is drawn before any banner or content');
  assert.equal((screen.match(/\{top\}/g) ?? []).length, 2, 'both hosts draw the same top');
  // Bible and Books and the results: rows in the screen's own scroll, after the top
  const screenAt = at('<Screen keyboard');
  const daily = at('<DailyBanner', screenAt), bible = at('<BibleTab', screenAt), books = at('<BooksBanner />', screenAt), booksTab = at('<BooksTab', screenAt);
  assert.ok(at('{top}', screenAt) < daily && daily < bible && bible < books && books < booksTab, 'the top, the Bible banner, Bible, the Books banner, Books');
  assert.match(screen, /\{searching \? \(\s*<SearchResults query=\{query\} marks=\{marks\} onClear=\{\(\) => setQuery\(''\)\} \/>\s*\) : \(\s*<>\s*\{tab === 'Bible' && <DailyBanner/, 'the results take the place of the banners and the tab content, and clearing the field brings them back');
  assert.match(screen, /const searching = isSearching\(query\);/);
  // each banner is shown under its own tab only
  assert.match(screen, /\{tab === 'Bible' && <DailyBanner onOpen=\{\(\) => router\.push\('\/library\/daily'\)\} \/>\}/);
  assert.match(screen, /\{tab === 'Books' && <BooksBanner \/>\}/);
  assert.equal((screen.match(/<DailyBanner/g) ?? []).length + (screen.match(/<BooksBanner/g) ?? []).length, 2, 'two banners, one for each tab that has one');
  // Notes, the third tab: no banner, no Screen (the feed owns its scroll), the top pinned above it, NotesTab filling the box under it
  const notesHost = screen.slice(at("if (tab === 'Notes') {"), screenAt);
  assert.match(notesHost, /paddingTop: insets\.top \+ layout\.screenTop, paddingHorizontal: layout\.screenMargin, paddingBottom: 16, gap: 16 \}\}>\{top\}<\/View>/, 'the same top, in the same place and the same size as in the other host');
  assert.match(notesHost, /<View style=\{\{ flex: 1 \}\}><NotesTab \/><\/View>/, 'NotesTab fills the box under the tabs: a height of its own, as wide as the screen');
  assert.doesNotMatch(notesHost, /<Screen\b|Banner|SubTabs/, 'no banner, not in the scroll of the screen, and the strip comes from `top`');
  assert.doesNotMatch(notesHost.slice(notesHost.indexOf(') : (')), /ScrollView/, 'no scroll view around the feed: it scrolls by itself');
  assert.match(notesHost, /\{searching \? \(\s*<ScrollView\b[^>]*keyboardShouldPersistTaps="handled"[^>]*>\s*<SearchResults\b[\s\S]*?\/>\s*<\/ScrollView>\s*\) : \(/, 'a search on Notes keeps this host: the top, and the search field in it, is not made again when the first letter is typed (a field that is made again loses the keyboard); the results take the place of the feed');
  assert.ok(notesHost.indexOf('{top}') < notesHost.indexOf('<NotesTab'), 'the notes start right under the tabs');
  // each tab with example rows starts with its notice
  const tabsSrc = read(join('src', 'features', 'library', 'LibraryTabs.tsx'));
  for (const t of SAMPLE_TABS) assert.match(tabsSrc, new RegExp(`<Notice tab="${t}" />`), `the ${t} tab does not start with its notice`);
  assert.match(tabsSrc, /<SampleNotice title="Preview">/);
  const results = read(join('src', 'features', 'library', 'SearchResults.tsx'));
  assert.match(results, /<SampleNotice title="Preview">\{SEARCH_NOTICE\}<\/SampleNotice>/, 'the search keeps the Preview notice, also when nothing is found');
  assert.match(results, /Clear search/);
  assert.match(read(join('src', 'components', 'Screen.tsx')), /keyboardShouldPersistTaps=\{keyboard \? 'handled' : 'never'\}/);
});

check('what floats at the bottom: the three choices of the Bible only on Bible, the gold pen only on Notes, nothing on Books, and neither while search results show; room is kept for the choices', () => {
  const screen = read(join('app', '(tabs)', 'library.tsx'));
  assert.equal((screen.match(/<TestamentBar\b/g) ?? []).length, 1);
  assert.equal((screen.match(/<Fab\b/g) ?? []).length, 1);
  // the gold pen is in the Notes host, and it is not drawn over the search results that take the place of the feed there
  const notesHost = screen.slice(screen.indexOf("if (tab === 'Notes') {"), screen.indexOf('<Screen keyboard'));
  assert.match(notesHost, /\{!searching && <Fab label="Write a note" icon="compose" onPress=\{\(\) => router\.push\('\/diary\/new'\)\} \/>\}/);
  assert.ok(notesHost.includes('<Fab') && !screen.slice(screen.indexOf('<Screen keyboard')).includes('<Fab'), 'the pen is not in the other host');
  // the bar is drawn outside the scroll view, after it (so it floats over the list), only on Bible and not while searching, and the list ends with its room
  assert.match(screen, /<\/Screen>\s*\{!searching && tab === 'Bible' && <TestamentBar value=\{testament\} onChange=\{choose\} \/>\}/);
  assert.match(screen, /\{tab === 'Bible' && <View style=\{\{ height: BAR_ROOM \}\} \/>\}/, 'room under the last book for the bar');
  // Default: the Old Testament
  assert.match(screen, /useState<Testament>\('old'\)/);
  // choosing another part from deep in the list brings the list back to its first books, and from the top of the screen nothing moves
  assert.match(screen, /if \(offset\.current > listTop\.current\) scroller\.current\?\.scrollTo\(\{ y: Math\.max\(listTop\.current - 8, 0\), animated: false \}\);/);
  assert.match(screen, /onScroll=\{\(e\) => \{ offset\.current = e\.nativeEvent\.contentOffset\.y; \}\}/);
  assert.match(screen, /useEffect\(\(\) => \{ offset\.current = 0; \}, \[searching, tab\]\);/, 'a scroll view that was left starts again from the top, and so does what is remembered of it');
  assert.match(screen, /onListLayout=\{\(e\) => \{ listTop\.current = e\.nativeEvent\.layout\.y; \}\}/);
  assert.match(read(join('src', 'components', 'Screen.tsx')), /scrollRef\?: Ref<ComponentRef<typeof ScrollView>>/);
  assert.match(read(join('src', 'components', 'Screen.tsx')), /<ScrollView ref=\{scrollRef\} onScroll=\{onScroll\} scrollEventThrottle=\{onScroll \? 16 : undefined\}/);
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
  for (const b of BOOK_CATALOG) assert.ok(contrast(tokens.color.blue, tokens.color[b.cover]) >= 4.5, `the navy on the ${b.cover} cover (covers do not change with dark)`);
});

check('the design page shows the same Library: a search pill and one Bookmarks button, the tabs Bible, Books, Notes right under them and before the banner, the three choices at the bottom of Bible only, no gold pen outside Notes, no Music, no diary button', () => {
  const design = readFileSync(join(root, '..', 'design', 'index.html'), 'utf8');
  /** The phone with this label, as the text between its label and the label of the next phone. */
  const phoneOf = (label: string): string => {
    const start = design.indexOf(`<p class="phone-label"><b>${label}</b>`);
    assert.ok(start > 0, `the design page has no phone "${label}"`);
    const next = design.indexOf('<p class="phone-label">', start + 10);
    return design.slice(start, next > 0 ? next : undefined);
  };
  const bible = phoneOf('Library');
  const deutero = phoneOf('Library · Deuterocanon');
  const books = phoneOf('Library · Books');
  const search = phoneOf('Library · Search');
  const nothing = phoneOf('Library · Nothing found');
  const marks = phoneOf('Library · Bookmarks');
  phoneOf('Library · Bookmarks, empty');
  for (const [name, phone] of Object.entries({ bible, deutero, books, search, nothing })) assert.ok(phone.length > 1500, `the phone "${name}" is too short to be a screen`);

  // the top row: the search pill, then Bookmarks, and nothing else (no diary button), on every screen that has the search field
  for (const [name, phone] of Object.entries({ bible, books, search, nothing })) {
    assert.match(phone, /class="lib-search"[^>]*><svg[^>]*><use href="#i-search"\/><\/svg><span class="t[^"]*">/, `${name}: the search pill`);
    const pill = phone.indexOf('class="lib-search"');
    const button = phone.indexOf('aria-label="Bookmarks"');
    assert.ok(pill > 0 && button > pill, `${name}: search, then Bookmarks`);
    assert.match(phone.slice(button, button + 120), /#i-bookmark/);
    assert.doesNotMatch(phone, /aria-label="My diary"|#i-diary|>My diary</, `${name}: the diary button is back`);
  }
  assert.match(bible, /<span class="t">Search the Library<\/span>/);
  assert.doesNotMatch(bible, /scr-title|<h1/, 'a title is back on the Library phone');

  // Bible: the tab strip comes directly after the row and before the banner; the banner is one card with no dots and one button; then the notice, the heading, the rows
  const order = ['class="lib-head"', 'class="cp-subtabs"', 'class="cp-banner lib"', 'class="lib-notice"', 'class="lib-hrow"', 'class="lib-row"', 'class="lib-bar"', 'class="tabdock"'].map((needle) => bible.indexOf(needle));
  assert.ok(order.every((i) => i > 0) && order.every((i, k) => k === 0 || i > order[k - 1]), `Bible: head, tabs, banner, notice, heading, rows, the three choices, the tab bar (${order})`);
  assert.match(bible, /<div class="cp-subtabs"[^>]*><span class="on">Bible<\/span><span>Books<\/span><span>Notes<\/span><\/div>/);
  assert.match(bible, /<div class="ey">Today · Daily reading<\/div>\s*<h4>Today's reading and a short reflection<\/h4>\s*<p class="line">Sunday 8 November<\/p>\s*<span class="cp-btn sm">Read today<\/span>/);
  assert.doesNotMatch(bible, /cp-dots/, 'the banner is one card: no dots');
  assert.match(bible, /<h4 class="lib-h">Books of the Bible<\/h4><span class="cnt" aria-label="Old Testament, 39 books">39 books<\/span>/);
  assert.match(bible, /<div class="p">The Bible text is not in the app yet\. We are choosing a translation we are allowed to include\.<\/div>/);
  assert.doesNotMatch(bible, /fab-slot|cp-fab-write|Write a note|Write in your diary/, 'the gold pen is on Notes only');
  // the three choices: a radio group, in the order of the parts, the Old Testament on
  const radios = (phone: string) => [...phone.matchAll(/<button role="radio" aria-checked="(true|false)" aria-label="([^"]+)"/g)].map((m) => `${m[2]}:${m[1]}`);
  assert.match(bible, /<div class="lib-bar" role="radiogroup" aria-label="Part of the Bible">/);
  assert.deepEqual(radios(bible), ['Old Testament:true', 'Deuterocanon:false', 'New Testament:false']);
  assert.deepEqual(radios(deutero), ['Old Testament:false', 'Deuterocanon:true', 'New Testament:false']);
  assert.match(bible, /Genesis[\s\S]*50 chapters[\s\S]*Exodus[\s\S]*40 chapters/);
  assert.match(bible, /<span class="lib-chip soon">Soon<\/span>/);

  // Deuterocanon: the seven books, the two added passages, the note
  assert.match(deutero, /7 books and 2 added passages/);
  assert.match(deutero, /Baruch[\s\S]*6 chapters · With the Letter of Jeremiah/);
  assert.match(deutero, />Additions to Esther<[\s\S]*Added passages/);
  assert.match(deutero, />Additions to Daniel<[\s\S]*Susanna; Prayer of Azariah and Song of the Three; Bel and the Dragon/);
  assert.match(deutero, /Orthodox Bibles include a few more books\./);

  // Books: Books on, a banner with no button, the notice, rows with a cover, title, author and era, the blurb, and the chips Free and Soon; no choices at the bottom, no gold pen
  assert.match(books, /<div class="cp-subtabs"[^>]*><span>Bible<\/span><span class="on">Books<\/span><span>Notes<\/span><\/div>/);
  const banner = books.slice(books.indexOf('class="cp-banner lib"'), books.indexOf('class="lib-notice"'));
  assert.match(banner, /<div class="ey">Preview · Books<\/div>\s*<h4>Twelve free companions for the road<\/h4>\s*<p class="line">Classics to read on the way\. Free to read\.<\/p>/);
  assert.doesNotMatch(banner, /cp-btn|<button|role="button"/, 'the Books banner has no button');
  assert.match(books, /<div class="p">Books are not in the app yet\. We are checking the editions before we add them\.<\/div>/);
  assert.match(books, /class="t">The Way of a Pilgrim<\/div><div class="a">Anonymous · 19th century<\/div>[\s\S]*A Russian wanderer walks and prays the Jesus Prayer\.[\s\S]*<span class="lib-chip free">Free<\/span><span class="lib-chip soon">Soon<\/span>/);
  assert.doesNotMatch(books, /lib-bar|role="radiogroup"|fab-slot|cp-fab-write/, 'Books has neither the choices of the Bible nor the gold pen');
  assert.doesNotMatch(books, /gutenberg|ccel|licen[cs]e|translator|public domain/i, 'the data that is only for later is not on the design page either');

  // Search and Nothing found: results of both tabs under one notice, no choices, no gold pen
  assert.match(search, /5 results for “john”/);
  assert.match(search, /class="lib-label"[^>]*>Bible · 4<\/div>[\s\S]*class="lib-label"[^>]*>Books · 1<\/div>/);
  assert.match(search, /These results are examples\. The Bible text and books are not in the app yet\./);
  assert.match(nothing, /Nothing found for “zzz”/);
  assert.match(nothing, /These results are examples\. The Bible text and books are not in the app yet\./);
  for (const [name, phone] of Object.entries({ search, nothing })) assert.doesNotMatch(phone, /lib-bar|role="radiogroup"|fab-slot|cp-fab-write/, `${name}: nothing floats while results show`);

  // Bookmarks: the groups Bible and Books, with the part in front of the chapters, and the posts
  assert.match(marks, /class="lib-label">Bible · 2<\/div>[\s\S]*Old Testament · 150 chapters[\s\S]*class="lib-label">Books · 1<\/div>/);
  assert.doesNotMatch(marks, /Music/);

  // no Music anywhere in the Library phones, and no diary button or card
  const all = design.slice(design.indexOf('<p class="phone-label"><b>Library</b>'), design.indexOf('<p class="phone-label"><b>Diary</b>'));
  assert.ok(all.length > 20000);
  assert.doesNotMatch(all, /music|playlist/i, 'Music is gone from the Library phones');
  assert.doesNotMatch(all, /aria-label="My diary"|>My diary</);
  // the gold pen of Library is on Notes (its phone is the Notes section's, not checked here); the Fab note on the design page says where it is
  assert.match(design, /Library: on the Notes tab the note icon writes a note\./);
  const sprite = /<symbol id="i-diary"[^>]*>(.*?)<\/symbol>/.exec(design);
  assert.ok(sprite, 'the sprite of the design page has no i-diary');
  assert.deepEqual([...sprite![1].matchAll(/ d="([^"]+)"/g)].map((m) => m[1]), iconPaths('diary'), 'the diary glyph of the design page and of the app are the same drawing');
  // the sprite has the glyphs of the covers, the same drawings as the app's (the building is the one the design page did not have)
  const building = /<symbol id="i-building"[^>]*>(.*?)<\/symbol>/.exec(design);
  assert.ok(building, 'the sprite of the design page has no i-building');
  assert.deepEqual([...building![1].matchAll(/ d="([^"]+)"/g)].map((m) => m[1]), iconPaths('building'));
  for (const b of BOOK_CATALOG) assert.ok(new RegExp(`<symbol id="i-${b.icon === 'pen' ? 'pencil' : b.icon}"`).test(design), `the design page sprite has no glyph for the cover of ${b.id}`);
});

check('the sample content never claims to be real: no price, no rating, no "available", no download, nothing in the data or the rows that acts when touched', () => {
  const data = ['sample.ts', 'LibraryTabs.tsx', join('bible', 'books.ts'), join('books', 'catalog.ts')].map((f) => read(join('src', 'features', 'library', f))).join('\n');
  assert.doesNotMatch(data, /\$\d|€\d|\brating\b|★|available now|download|onPress/i);
  // and the one thing in the Library that does act (the banner of the Bible tab) says only what it does
  assert.match(read(join('src', 'features', 'library', 'LibraryBanner.tsx')), /export const DAILY_CTA = 'Read today';/);
});

check('the diary is reachable: its routes exist and are registered, and the gold pen on the Notes tab opens a blank page', () => {
  assert.ok(exists(join('app', 'diary', 'index.tsx')));
  assert.ok(exists(join('app', 'diary', '[id].tsx')));
  const layout = read(join('app', '_layout.tsx'));
  assert.match(layout, /<Stack\.Screen name="diary\/index" \/>/);
  assert.match(layout, /<Stack\.Screen name="diary\/\[id\]" \/>/);
  const screen = read(join('app', '(tabs)', 'library.tsx'));
  assert.match(screen, /<Fab label="Write a note" icon="compose" onPress=\{\(\) => router\.push\('\/diary\/new'\)\} \/>/, 'the pen opens a blank page');
  assert.doesNotMatch(screen, /\/diary'/, 'no button of Library opens the list of pages any more: that list is the Notes tab');
});

check('the words that point at the diary say it is in the Notes tab: Help does not send anyone to a button that is gone', () => {
  const help = read(join('app', 'help.tsx'));
  assert.match(help, /Open Library and tap the Notes tab: your diary lives there\./);
  assert.doesNotMatch(help, /diary button/i);
  const stale = files.filter((f) => /diary button|diary card|My diary button/i.test(read(f).split('\n').filter((l) => !/^\s*(\/\/|\/?\*)/.test(l)).join('\n')));
  assert.deepEqual(stale, [], 'text that still says "the diary button" or "diary card"');
  assert.doesNotMatch(read(join('src', 'features', 'diary', 'present.ts')), /diary card/i);
  assert.doesNotMatch(read(join('src', 'features', 'diary', 'useDiary.ts')), /card on the Library/i);
});

check('what is new in Library keeps its contrast in light and dark: text 4.5 : 1, icons and the glyph on a cover 3 : 1 and better', () => {
  const colour = (name: string, dark: boolean): string => (dark ? tokens.dark.color[name] : undefined) ?? tokens.color[name];
  for (const dark of [false, true]) {
    const mode = dark ? 'dark' : 'light';
    const c = (name: string) => colour(name, dark);
    const r = (name: string) => roleColour(name, dark);
    // the three choices at the bottom: the filled one, the others, and the label of the filled one
    assert.ok(contrast(r('onAction'), r('action')) >= 4.5, `the label of the chosen part on its fill in ${mode}`);
    assert.ok(contrast(r('text'), r('surface')) >= 4.5, `the labels of the other parts on the bar in ${mode}`);
    assert.ok(contrast(r('action'), r('surface')) >= 3, `the filled choice against the bar in ${mode}`);
    // the banner: cream on the card, the gold caps line, the gold button with its navy label, and the gold glyph that is only a picture
    assert.ok(contrast(r('textInverse'), r('surfaceInverse')) >= 4.5, `the title and the date on the banner in ${mode}`);
    assert.ok(contrast(r('textInverseAccent'), r('surfaceInverse')) >= 4.5, `the caps line on the banner in ${mode}`);
    assert.ok(contrast(r('onHighlight'), c('gold')) >= 4.5, `"Read today" on the gold button in ${mode}`);
    assert.ok(contrast(c('gold'), r('surfaceInverse')) >= 3, `the gold button and glyph against the banner in ${mode}`);
    // the rows: the name, the lines under it, the chips, the bookmark
    assert.ok(contrast(r('text'), r('surface')) >= 4.5, `a name on a row in ${mode}`);
    assert.ok(contrast(r('textMuted'), r('surface')) >= 4.5, `the chapters, author and era on a row in ${mode}`);
    assert.ok(contrast(r('textMuted'), r('surfaceSunken')) >= 4.5, `SOON on its chip in ${mode}`);
    assert.ok(contrast(c('success'), c('successWash')) >= 4.5, `FREE on its chip in ${mode}`);
    assert.ok(contrast(r('textMuted'), r('bg')) >= 4.5, `the count under "Books of the Bible" on the page in ${mode}`);
  }
  // a cover does not change with light and dark, and neither does the navy glyph on it
  for (const b of BOOK_CATALOG) assert.ok(contrast(tokens.color.blue, tokens.color[b.cover]) >= 4.5, `the navy glyph on the ${b.cover} cover of ${b.id}`);
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
  assert.match(src, /<SampleNotice title="Preview">\{BOOKMARKS_NOTICE\}<\/SampleNotice>/, 'the Library rows kept here are still examples, and it says so');
  const design = readFileSync(join(root, '..', 'design', 'index.html'), 'utf8');
  const phone = design.slice(design.indexOf('<b>Library · Bookmarks</b>'), design.indexOf('<b>Library · Bookmarks, empty</b>'));
  assert.ok(phone.length > 2000);
  assert.match(phone, />Bookmarks<\/h1>/);
  assert.match(phone, /class="lib-h">Library<\/h4>/);
  assert.match(phone, /class="lib-h"[^>]*>Posts<\/h4>/);
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
