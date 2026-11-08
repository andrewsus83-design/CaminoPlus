// Plain-node checks of how the app is laid out: which tabs there are, where Settings lives, and that nothing a screen
// opens is missing. Run: npm run test:lib
//
// The tab bar is Me, Stays, Maps, Discover, Library. Settings is not a tab: it is a screen of its own, opened from the
// gear at the top right of Me. Library has no title: its top row is a search field and the round Bookmarks button in the corner
// (the size of Me's bell and gear); directly under it the tabs Bible, Books and Notes, then the banner of the tab (Bible and Books
// have one, Notes, the diary, has none). On Bible three choices sit in the page under the compact banner (Old Testament, Deuterocanon,
// New Testament, a segmented pill) and the books of that part are square tiles; on Notes a gold pen writes a note. These checks fail when someone brings a tab back without its icon (the tab bar would
// crash on it), when a route file and the tab list disagree, when a link still points at the old Settings tab, or when the Library
// drifts from the design page.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BOOK_CATALOG } from '../../features/library/books/catalog';
import { BIBLE_SOURCE_LINE, BOOKS_NOTICE, LIBRARY_TABS, ROW_TABS, SEARCH_NOTICE } from '../../features/library/sample';

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
  assert.match(screen, /<LibraryHeader query=\{query\} onQuery=\{setQuery\} onBookmarks=\{\(\) => router\.push\('\/library\/bookmarks'\)\} onSearchFocus=\{prepareSearch\} \/>/);
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

check('Library: directly under the search row the tabs Bible, Books, Notes, and only then the banner of the tab; Notes has no banner; a search takes the place of all of it, and says its example books are examples', () => {
  assert.deepEqual([...LIBRARY_TABS], ['Bible', 'Books', 'Notes']);
  assert.deepEqual([...ROW_TABS], ['Bible', 'Books']);
  assert.equal(BOOKS_NOTICE, 'Books are not in the app yet. We are checking the editions before we add them.');
  assert.equal(SEARCH_NOTICE, 'The twelve books are examples: they are not in the app yet. The Bible text is.');
  assert.equal(BIBLE_SOURCE_LINE, 'World English Bible, Catholic edition · public domain');
  const screen = read(join('app', '(tabs)', 'library.tsx'));
  assert.match(screen, /<Screen keyboard>/, 'a button can be tapped while the keyboard is up');
  assert.doesNotMatch(screen, /PromoBanner/, 'the carousel with dots is gone from Library: one banner for each of two tabs');
  assert.doesNotMatch(screen, /MusicTab|'Music'/);
  // the top of the screen is one piece, `top`, drawn by both hosts: the heading, the search row, the message, and then the tab strip (not while searching)
  const at = (needle: string, from = 0) => { const i = screen.indexOf(needle, from); assert.ok(i > 0, `library.tsx has no ${needle}`); return i; };
  const top = at('const top = ('), header = at('<LibraryHeader ', top), strip = at('<SubTabs tabs={LIBRARY_TABS}', top);
  assert.ok(header < strip, 'the search row comes first, the tab strip directly after it');
  assert.match(screen, /\{!searching && <SubTabs tabs=\{LIBRARY_TABS\} value=\{tab\} onChange=\{setTab\} \/>\}/, 'the tab strip is drawn unless something is typed, and it is drawn before any banner or content');
  assert.equal((screen.match(/\{top\}/g) ?? []).length, 2, 'both hosts draw the same top');
  // Bible and Books and the results: rows in the screen's own scroll, after the top: on Bible the card that continues the chapter, the compact banner, then the Bible tab (the choice of the part, the tiles)
  const screenAt = at('<Screen keyboard');
  const card = at('<ContinueCard', screenAt), daily = at('<DailyBanner', screenAt), bible = at('<BibleTab', screenAt), books = at('<BooksBanner />', screenAt), booksTab = at('<BooksTab', screenAt);
  assert.ok(at('{top}', screenAt) < card && card < daily && daily < bible && bible < books && books < booksTab, 'the top, the continue card, the Bible banner, Bible, the Books banner, Books');
  assert.match(screen, /\{searching \? \(\s*<SearchResults[^]*?\/>\s*\) : \(\s*<>\s*\{tab === 'Bible' && lastRead\.place && <ContinueCard/, 'the results take the place of the banners and the tab content, and clearing the field brings them back');
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
  // the Books tab starts with its notice; the Bible tab has none (its text is in the app: one quiet source line instead)
  const tabsSrc = read(join('src', 'features', 'library', 'LibraryTabs.tsx'));
  assert.match(tabsSrc, /export function BooksTab[^]*?<Notice \/>/, 'the Books tab starts with its notice');
  assert.match(tabsSrc, /const Notice = \(\) => <SampleNotice title="Preview">\{BOOKS_NOTICE\}<\/SampleNotice>;/);
  const results = read(join('src', 'features', 'library', 'SearchResults.tsx'));
  assert.match(results, /\{found\.hits\.Books\.length > 0 && <SampleNotice title="Preview">\{SEARCH_NOTICE\}<\/SampleNotice>\}/, 'the search keeps the Preview notice when the example books are among the results, and only then');
  assert.match(results, /Clear search/);
  assert.match(read(join('src', 'components', 'Screen.tsx')), /keyboardShouldPersistTaps=\{keyboard \? 'handled' : 'never'\}/);
});

check('what floats at the bottom: only the gold pen on Notes; the three choices of the Bible are in the page, directly under the banner, and nothing of them floats', () => {
  const screen = read(join('app', '(tabs)', 'library.tsx'));
  assert.equal((screen.match(/<Fab\b/g) ?? []).length, 1);
  assert.equal((screen.match(/<TestamentBar\b/g) ?? []).length, 0, 'the screen draws no bar of its own: the Bible tab draws the choices in the page');
  // the gold pen is in the Notes host, and it is not drawn over the search results that take the place of the feed there
  const notesHost = screen.slice(screen.indexOf("if (tab === 'Notes') {"), screen.indexOf('<Screen keyboard'));
  assert.match(notesHost, /\{!searching && <Fab label="Write a note" icon="compose" onPress=\{\(\) => router\.push\('\/diary\/new'\)\} \/>\}/);
  assert.ok(notesHost.includes('<Fab') && !screen.slice(screen.indexOf('<Screen keyboard')).includes('<Fab'), 'the pen is not in the other host');
  // no floating logic left: no room kept for a bar, no scroll back to the list, no offsets read
  assert.doesNotMatch(screen, /BAR_ROOM|scrollRef|onScroll|onListLayout|scroller|listTop|useRef|useEffect|TestamentBar/);
  // the choices come right after the banner and before the heading and the tiles, inside the Bible tab
  const tabs = read(join('src', 'features', 'library', 'LibraryTabs.tsx'));
  const tab = tabs.slice(tabs.indexOf('export function BibleTab'), tabs.indexOf('export function BooksTab'));
  assert.match(tab, /<TestamentBar value=\{testament\} onChange=\{onTestament\} \/>/);
  assert.ok(tab.indexOf('<TestamentBar') < tab.indexOf('Books of the Bible') && tab.indexOf('Books of the Bible') < tab.indexOf('<BibleBookGrid'), 'the choices, the heading, the tiles');
  const bar = read(join('src', 'features', 'library', 'bible', 'TestamentBar.tsx'));
  assert.doesNotMatch(bar, /position: 'absolute'|bottom:|useSafeAreaInsets|BAR_ROOM|insets/, 'the control is a plain row in the page');
  // the screen keeps the props that move its scroll for the reader, which scrolls to the verse of a link, and nothing else uses them
  assert.match(read(join('src', 'components', 'Screen.tsx')), /scrollRef\?: Ref<ComponentRef<typeof ScrollView>>/);
  assert.match(read(join('src', 'components', 'Screen.tsx')), /<ScrollView ref=\{scrollRef\} onScroll=\{onScroll\} scrollEventThrottle=\{onScroll \? 16 : undefined\}/);
  assert.match(read(join('src', 'features', 'library', 'bible', 'Reader.tsx')), /<Screen tabBar=\{false\} scrollRef=\{scroller\} onScroll=\{onScroll\}>/);
  const users = files.filter((f) => /\bscrollRef=\{/.test(read(f)) && f !== join('src', 'components', 'Screen.tsx'));
  assert.deepEqual(users, [join('src', 'features', 'library', 'bible', 'Reader.tsx')], 'only the reader moves the scroll of a screen');
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

check('the design page shows the same Library: the compact banner, the three parts as a segmented pill under it, the books as tiles, the chapters, the reader, the verses of a search and of Bookmarks, in light and dark', () => {
  const design = readFileSync(join(root, '..', 'design', 'index.html'), 'utf8');
  /** The phone with this label, as the text between its label and the label of the next phone. */
  const phoneOf = (label: string): string => {
    const start = design.indexOf(`<p class="phone-label"><b>${label}</b>`);
    assert.ok(start > 0, `the design page has no phone "${label}"`);
    const next = design.indexOf('<p class="phone-label">', start + 10);
    return design.slice(start, next > 0 ? next : undefined);
  };
  const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;
  const bible = phoneOf('Library');
  const cont = phoneOf('Library · Continue');
  const dark = phoneOf('Library · Dark');
  const deutero = phoneOf('Library · Deuterocanon');
  const books = phoneOf('Library · Books');
  const search = phoneOf('Library · Search');
  const verses = phoneOf('Library · Search, verses');
  const goto = phoneOf('Library · Go to');
  const nothing = phoneOf('Library · Nothing found');
  const marks = phoneOf('Library · Bookmarks');
  phoneOf('Library · Bookmarks, empty');
  for (const [name, phone] of Object.entries({ bible, cont, dark, deutero, books, search })) assert.ok(phone.length > 1500, `the phone "${name}" is too short to be a screen`);

  // the top row: the search pill, then Bookmarks, and nothing else (no diary button), on every screen that has the search field
  for (const [name, phone] of Object.entries({ bible, cont, dark, deutero, books, search, verses, goto, nothing })) {
    assert.match(phone, /class="lib-search"[^>]*><svg[^>]*><use href="#i-search"\/><\/svg><span class="t[^"]*">/, `${name}: the search pill`);
    const pill = phone.indexOf('class="lib-search"');
    const button = phone.indexOf('aria-label="Bookmarks"');
    assert.ok(pill > 0 && button > pill, `${name}: search, then Bookmarks`);
    assert.match(phone.slice(button, button + 120), /#i-bookmark/);
    assert.doesNotMatch(phone, /aria-label="My diary"|#i-diary|>My diary</, `${name}: the diary button is back`);
  }
  assert.match(bible, /<span class="t">Search the Library<\/span>/);
  assert.doesNotMatch(bible, /scr-title|<h1/, 'a title is back on the Library phone');

  // Bible: the tab strip, then the compact banner, then the three parts, the heading and the count, the source line, the tiles, the tab bar; no notice, no chip, no floating bar
  const order = ['class="lib-head"', 'class="cp-subtabs"', 'class="cp-banner cmp"', 'class="lib-seg"', 'class="lib-hrow"', 'class="lib-src"', 'class="lib-grid"', 'class="lib-tile"', 'class="tabdock"'].map((needle) => bible.indexOf(needle));
  assert.ok(order.every((i) => i > 0) && order.every((i, k) => k === 0 || i > order[k - 1]), `Bible: head, tabs, banner, the three parts, heading, source line, tiles, the tab bar (${order})`);
  assert.match(bible, /<div class="cp-subtabs"[^>]*><span class="on">Bible<\/span><span>Books<\/span><span>Notes<\/span><\/div>/);
  assert.match(bible, /<div class="cp-banner cmp" role="button" aria-label="Read today\. Daily reading\. Sunday 8 November">\s*<div class="ey">Sunday 8 November<\/div>\s*<h4>Daily reading<\/h4>\s*<div class="row"><span class="hw">Buen Camino!<\/span><span class="pill">Read today<\/span><\/div>/);
  assert.doesNotMatch(bible, /cp-dots|cp-banner lib|art"/, 'the banner is one compact card: no dots, no big glyph');
  assert.match(bible, /<h4 class="lib-h">Books of the Bible<\/h4><span class="cnt" aria-label="Old Testament, 39 books">39 books<\/span>/);
  assert.match(bible, /<p class="lib-src">World English Bible, Catholic edition · public&nbsp;domain<\/p>/);
  assert.doesNotMatch(bible, /lib-notice|lib-chip|lib-bar|fab-slot|cp-fab-write|Write a note|The Bible text is not in the app yet|Soon/, 'no notice, no chip, nothing floating: the Bible is in the app');
  const radios = (phone: string) => [...phone.matchAll(/<button role="radio" aria-checked="(true|false)" aria-label="([^"]+)"/g)].map((m) => `${m[2]}:${m[1]}`);
  assert.match(bible, /<div class="lib-seg" role="radiogroup" aria-label="Part of the Bible">/);
  assert.deepEqual(radios(bible), ['Old Testament:true', 'Deuterocanon:false', 'New Testament:false']);
  assert.deepEqual(radios(deutero), ['Old Testament:false', 'Deuterocanon:true', 'New Testament:false']);
  assert.deepEqual(radios(cont), ['Old Testament:false', 'Deuterocanon:false', 'New Testament:true']);
  assert.equal(count(bible, /class="lib-tile"/g), 39, 'the 39 books of the Old Testament, as tiles');
  assert.match(bible, /aria-label="Genesis, 50 chapters"><span class="nm" style="font-size:24px;line-height:29px;letter-spacing:-0\.48px">Genesis<\/span><span class="ct" style="font-size:12px;line-height:17px">50&nbsp;chapters<\/span>/, 'the name is the hero of the tile: 24 where it fits, set a little closer');
  assert.match(bible, /aria-label="Deuteronomy, 34 chapters"><span class="nm" style="font-size:15px/, 'a long name is drawn smaller to fit the tile, and never under 15 on a phone of 390');
  assert.match(design, /\.lib-tile \{ width: 111px; height: 111px; padding: 7px 4px;/, 'the padding of a tile is the app\'s: 3 across and 6 down, and the border of 1');
  assert.doesNotMatch(bible, /font-size:(1[0-4](\.5)?|[0-9](\.5)?)px;line-height:\d+px;letter-spacing:-0\.\d+px">/, 'no name on a tile of the Bible is drawn under 15 on a phone of 390');
  assert.match(bible, /aria-label="1 Samuel, 31 chapters"><span class="nm" style="[^"]*">1<br>Samuel<\/span>/, 'a number stands on a line of its own');
  assert.match(bible, /aria-label="Song of Songs, 8 chapters"><span class="nm" style="[^"]*">Song of<br>Songs<\/span>/);
  assert.equal(count(bible, /class="hw"/g), 1, 'one handwritten note on the screen');

  // Continue: the card above the banner, with the chapter in JetBrains Mono; the New Testament chosen, 27 tiles
  assert.match(cont, /<div class="cont-card" role="button" aria-label="Continue reading, Psalm 121">\s*<span class="ic">[^]*?<div class="k">Continue reading<\/div><div class="r">Psalm 121<\/div>/);
  assert.ok(cont.indexOf('class="cont-card"') > cont.indexOf('class="cp-subtabs"') && cont.indexOf('class="cont-card"') < cont.indexOf('class="cp-banner cmp"'), 'the card is under the tabs and above the banner');
  assert.equal(count(cont, /class="lib-tile"/g), 27);
  assert.equal(count(bible, /cont-card/g), 0, 'without a chapter read there is no card');
  // Dark: the same screen in the dark palette
  assert.match(dark, /^[^]*?<div class="phone dk">/);
  assert.equal(count(dark, /class="lib-tile"/g), 39);
  // Deuterocanon: seven tiles, the two notes, no row of added passages
  assert.match(deutero, /<span class="cnt" aria-label="Deuterocanon, 7 books">7 books<\/span>/);
  assert.equal(count(deutero, /class="lib-tile"/g), 7);
  assert.match(deutero, /aria-label="Baruch, 6 chapters"/);
  assert.match(deutero, /aria-label="2 Maccabees, 15 chapters"><span class="nm" style="[^"]*">2<br>Maccabees<\/span>/);
  assert.match(deutero, /<p class="lib-note">Esther and Daniel, in the Old Testament, include their Greek additions: Daniel 3 holds the Prayer of Azariah and the Song of the Three, 13 is Susanna and 14 is Bel and the Dragon\.<\/p>\s*<p class="lib-note">Orthodox Bibles include a few more books\.<\/p>/);
  assert.doesNotMatch(deutero, /Additions to|Added passages/);

  // Books: Books on, a banner with no button, the notice, rows with a cover, title, author and era, the blurb, and the chips Free and Soon; no choices at the bottom, no gold pen
  assert.match(books, /<div class="cp-subtabs"[^>]*><span>Bible<\/span><span class="on">Books<\/span><span>Notes<\/span><\/div>/);
  const banner = books.slice(books.indexOf('class="cp-banner lib"'), books.indexOf('class="lib-notice"'));
  assert.match(banner, /<div class="ey">Preview · Books<\/div>\s*<h4>Twelve free companions for the road<\/h4>\s*<p class="line">Classics to read on the way\. Free to read\.<\/p>/);
  assert.doesNotMatch(banner, /cp-btn|<button|role="button"/, 'the Books banner has no button');
  assert.match(books, /<div class="p">Books are not in the app yet\. We are checking the editions before we add them\.<\/div>/);
  assert.match(books, /class="t">The Way of a Pilgrim<\/div><div class="a">Anonymous · 19th century<\/div>[\s\S]*A Russian wanderer walks and prays the Jesus Prayer\.[\s\S]*<span class="lib-chip free">Free<\/span><span class="lib-chip soon">Soon<\/span>/);
  assert.doesNotMatch(books, /lib-seg|role="radiogroup"|lib-tile|fab-slot|cp-fab-write/, 'Books has neither the choices of the Bible nor the gold pen');
  assert.doesNotMatch(books, /gutenberg|ccel|licen[cs]e|translator|public domain/i, 'the data that is only for later is not on the design page either');

  // Search: the books of the Bible, the example books and the verses under one notice; no choices, no gold pen
  assert.match(search, /105 results for “john”/);
  assert.match(search, /class="lib-label"[^>]*>Bible · 4<\/div>[\s\S]*class="lib-label"[^>]*>Books · 1<\/div>[\s\S]*class="lib-label"[^>]*>Verses · 100\+<\/div>/);
  assert.match(search, /The twelve books are examples: they are not in the app yet\. The Bible text is\./);
  assert.match(search, /<div class="lib-bk">1 John<\/div><div class="lib-line">New&nbsp;Testament · <span class="mn">5&nbsp;chapters<\/span><\/div>/, 'a book of the Bible in a list: its name in Fraunces, the count in JetBrains Mono');
  assert.match(search, /<div class="vl">1 Maccabees 2:1<\/div><div class="vt">/, 'a verse in a list: the place in JetBrains Mono, then the words');
  // the verses of a search: the match is marked, and no notice because no example book is among the results
  assert.match(verses, /20 results for “love one another”/);
  assert.match(verses, /class="lib-label"[^>]*>Verses · 20<\/div>/);
  assert.match(verses, /<div class="vl">John 13:34<\/div><div class="vt">[^]*?<mark>love<\/mark> <mark>one<\/mark> <mark>another<\/mark>[^]*?<\/div>/, 'the words that matched are marked');
  assert.doesNotMatch(verses, /lib-notice|Preview/);
  assert.match(goto, /<div class="lib-goto" role="button" aria-label="Go to Psalm 121:3"><span class="g">Go to <span class="m">Psalm 121:3<\/span><\/span>/);
  assert.match(nothing, /Nothing found for “zzz”/);
  assert.doesNotMatch(nothing, /lib-notice/, 'nothing found has no Preview notice: no example is among the results');
  for (const [name, phone] of Object.entries({ search, verses, goto, nothing })) assert.doesNotMatch(phone, /lib-seg|role="radiogroup"|fab-slot|cp-fab-write/, `${name}: nothing floats while results show`);

  // Bookmarks: the groups Bible (a row that opens the chapters), Books and Verses, then the posts
  assert.match(marks, /class="lib-label">Bible · 1<\/div>[\s\S]*Old&nbsp;Testament · <span class="mn">150&nbsp;chapters<\/span>[\s\S]*class="lib-label">Books · 1<\/div>[\s\S]*class="lib-label">Verses · 2<\/div>/);
  assert.match(marks, /<div class="vl">Psalm 121:3<\/div>[\s\S]*<div class="vl">John 3:16<\/div>/);
  assert.match(marks, /The twelve books are examples: they are not in the app yet\. Bookmarks are kept only on this phone, and logging out clears them\./);
  assert.doesNotMatch(marks, /Music|Soon<\/span><\/div><button/);

  // the chapters of the Psalms
  const chapters = phoneOf('Library · Chapters');
  assert.match(chapters, /aria-label="Back"[^]*aria-label="Bookmark: Psalms"/, 'Back, and the bookmark of the book in the corner');
  assert.match(chapters, /<h1 class="scr-title" style="margin:0">Psalms<\/h1><p class="rd-count">150&nbsp;chapters<\/p><p class="hw" style="margin:0">Pick a chapter<\/p>/);
  assert.equal(count(chapters, /class="ch-tile"/g), 150, 'the 150 psalms, as numbered tiles');
  assert.match(chapters, /<button class="ch-tile" aria-label="Psalm 121">121<\/button>/);
  assert.equal(count(chapters, /class="hw"/g), 1);
  assert.match(phoneOf('Library · Chapters, dark'), /<div class="phone dk">/);

  // the reader: a psalm, a chosen verse, the same bookmarked, a prose chapter, the dark one and the end of a chapter that goes on to the next book
  const psalm = phoneOf('Reader · Psalm 121');
  assert.match(psalm, /<p class="rd-kick">Psalms<\/p><h1 class="rd-title">Psalm 121<\/h1><p class="rd-sub">A Song of Ascents\.<\/p>/);
  assert.match(psalm, /<button class="rd-step previous" aria-label="Previous: Psalm 120">[^]*?<span>Psalm 120<\/span><\/button><button class="rd-step next" aria-label="Next: Psalm 122"><span>Psalm 122<\/span>/, 'Previous and Next at the top name where they go');
  assert.match(psalm, /<button class="rd-step previous foot" aria-label="Previous: Psalm 120">[^]*?<span>Previous: <span class="m">Psalm 120<\/span><\/span>/, 'and at the end of the chapter');
  assert.match(psalm, /<span class="rd-v"><span class="rd-n">¹<\/span>\u2009I will lift up my eyes to the hills\.<\/span>/);
  assert.match(psalm, /\u2003<span class="rd-v">Where does my help come from\?<\/span>/, 'the second level goes in by two em spaces (one for each tab)');
  assert.match(psalm, /class="rd-p g-s"/, 'a stanza after a blank line');
  assert.match(psalm, /<p class="hw" style="margin:16px 0 0">Peace on the road<\/p>/);
  assert.match(psalm, /<div class="rd-credit"><p>World English Bible, Catholic edition \(eBible\.org\)\. Public domain\. The name &quot;World English Bible&quot; is a trademark of eBible\.org\.<\/p><p>This is not the translation read at Mass\.<\/p><\/div>/);
  assert.equal(count(psalm, /class="hw"/g), 1);
  const chosen = phoneOf('Reader · Verse chosen');
  assert.match(chosen, /<span class="rd-v sel"><span class="rd-n">³<\/span>/);
  assert.match(chosen, /<div class="rd-act" role="toolbar" aria-label="Actions for Psalm 121:3">\s*<div class="top"><span class="pl">Psalm 121:3<\/span><button class="x" aria-label="Close the verse actions">/);
  assert.match(chosen, /aria-label="Bookmark: Psalm 121:3">[^]*?<span>Bookmark<\/span><\/button><button aria-label="Copy: Psalm 121:3">[^]*?<span>Copy<\/span><\/button><button aria-label="Share: Psalm 121:3">[^]*?<span>Share<\/span>/);
  assert.match(phoneOf('Reader · Verse bookmarked'), /<button class="on" aria-label="Remove bookmark: Psalm 121:3">[^]*?<span>Bookmark<\/span>/, 'the word stays, the glyph is filled and the button tinted');
  // the bar is made to be hit: a glyph of 30, a word of 16 (Inter SemiBold), each action at least 88 by 68, the reference 17, 12 from the sides, 8 between the actions
  assert.match(design, /\.rd-act \{ position: absolute; left: 12px; right: 12px; bottom: 26px;/);
  assert.match(design, /\.rd-act \.pl \{ flex: 1; font-family: var\(--cp-font-mono\); font-size: 17px;/);
  assert.match(design, /\.rd-act \.btns \{ display: flex; gap: 8px; margin-top: 4px; \}/);
  assert.match(design, /\.rd-act \.btns button \{ flex: 1; min-width: 88px; min-height: 68px;[^}]*font: 600 16px\/20px var\(--cp-font-body\); \}/);
  assert.match(design, /\.rd-act \.btns \.cp-icon \{ width: 30px; height: 30px; color: var\(--cp-action\); \}/);
  assert.match(design, /\.rd-act \.btns button\.on \.cp-icon \{ fill: currentColor; \}/);
  const john = phoneOf('Reader · John 1');
  assert.match(john, /<p class="rd-kick">John<\/p><h1 class="rd-title">Chapter 1<\/h1>/);
  assert.match(john, /aria-label="Previous: Luke 24"[^]*aria-label="Next: John 2"/, 'across the books: the chapter before John 1 is Luke 24');
  assert.match(john, /<p class="rd-p"><span class="rd-v"><span class="rd-n">¹<\/span>\u2009In the beginning was the Word/);
  assert.match(phoneOf('Reader · Dark'), /<div class="phone dk">[^]*class="rd-v sel"[^]*role="toolbar" aria-label="Actions for John 1:5"/);
  const boundary = phoneOf('Reader · Across a boundary');
  assert.match(boundary, /aria-label="Next: Tobit 1"/);
  assert.match(boundary, /<span>Next: <span class="m">Tobit 1<\/span><\/span>/);
  for (const [name, phone] of Object.entries({ psalm, chosen, john, boundary })) assert.equal(count(phone, /class="hw"/g), 1, `${name}: one handwritten note`);

  // no Music anywhere in the Library phones, and no diary button or card
  const all = design.slice(design.indexOf('<p class="phone-label"><b>Library</b>'), design.indexOf('<p class="phone-label"><b>Diary</b>'));
  assert.ok(all.length > 100000);
  assert.doesNotMatch(all, /music|playlist/i, 'Music is gone from the Library phones');
  assert.doesNotMatch(all, /aria-label="My diary"|>My diary</);
  assert.doesNotMatch(all, /verified|official/i, 'nothing says verified or official');
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

check('the sample content never claims to be real: no price, no rating, no "available", no download, nothing in the data or the rows of the example books that acts when touched', () => {
  const lib = (f: string) => read(join('src', 'features', 'library', f));
  const tabs = lib('LibraryTabs.tsx');
  const books = tabs.slice(tabs.indexOf('export function BookRows'), tabs.indexOf('export function LibraryGroups'));
  const data = [lib('sample.ts'), lib(join('books', 'catalog.ts')), books].join('\n');
  assert.doesNotMatch(data, /\$\d|€\d|\brating\b|★|available now|download|onPress/i);
  // and the one thing in the Library that acts at the top of the Bible tab (the banner) says only what it does
  assert.match(lib('LibraryBanner.tsx'), /export const DAILY_CTA = 'Read today';/);
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

check('what is new in Library keeps its contrast in light and dark: text 4.5 : 1, icons and the glyph on a cover 3 : 1 and better; the choices, the compact banner, the tiles, the reader, the marked verse, the action bar', () => {
  const colour = (name: string, dark: boolean): string => (dark ? tokens.dark.color[name] : undefined) ?? tokens.color[name];
  for (const dark of [false, true]) {
    const mode = dark ? 'dark' : 'light';
    const c = (name: string) => colour(name, dark);
    const r = (name: string) => roleColour(name, dark);
    // the three choices, in the page: the filled one, the others on the sunken track, and the filled one against the track
    assert.ok(contrast(r('onAction'), r('action')) >= 4.5, `the label of the chosen part on its fill in ${mode}`);
    assert.ok(contrast(r('text'), r('surfaceSunken')) >= 4.5, `the labels of the other parts on the track in ${mode}`);
    assert.ok(contrast(r('action'), r('surfaceSunken')) >= 3, `the filled choice against the track in ${mode}`);
    assert.ok(contrast(r('surfaceSunken'), r('bg')) >= 1.05, `the track is told from the page in ${mode} (as a card is: the choices themselves are told by their labels and the filled one)`);
    // the compact banner: cream on the card, the pale gold line and note, the gold pill with its navy label, and the pill against the card
    assert.ok(contrast(r('textInverse'), r('surfaceInverse')) >= 4.5, `the title on the banner in ${mode}`);
    assert.ok(contrast(r('textInverseAccent'), r('surfaceInverse')) >= 4.5, `the date line and the handwritten note on the banner in ${mode}`);
    assert.ok(contrast(r('onHighlight'), c('gold')) >= 4.5, `"Read today" on the gold pill in ${mode}`);
    assert.ok(contrast(c('gold'), r('surfaceInverse')) >= 3, `the gold pill against the banner in ${mode}`);
    // the tiles and the rows: the name, the count, the bookmark, the chapter numbers, the marked words
    assert.ok(contrast(r('text'), r('surface')) >= 4.5, `a name on a tile or a row in ${mode}`);
    assert.ok(contrast(r('textMuted'), r('surface')) >= 4.5, `the count and the lines under a name in ${mode}`);
    assert.ok(contrast(r('textMuted'), r('surfaceSunken')) >= 4.5, `SOON on its chip in ${mode}`);
    assert.ok(contrast(c('success'), c('successWash')) >= 4.5, `FREE on its chip in ${mode}`);
    assert.ok(contrast(r('textMuted'), r('bg')) >= 4.5, `the count under "Books of the Bible" on the page in ${mode}`);
    assert.ok(contrast(r('border'), r('surface')) >= 1.1 && contrast(r('border'), r('bg')) >= 1.05, `the edge of a tile is there in ${mode}`);
    assert.ok(contrast(r('text'), c('goldSoft')) >= 4.5, `a verse that is chosen or a word that matched, on its gold ground, in ${mode}`);
    assert.ok(contrast(r('textAccent'), r('surface')) >= 4.5, `the place of a verse in a row, and in the action bar, in ${mode}`);
    // the reader: the words, the raised numbers, the name of the book and the handwritten notes on the page
    assert.ok(contrast(r('text'), r('bg')) >= 4.5, `the words on the page in ${mode}`);
    assert.ok(contrast(r('textAccent'), r('bg')) >= 4.5, `the name of the book and the handwritten note on the page in ${mode}`);
    assert.ok(contrast(r('action'), r('surface')) >= 3, `the glyphs of the buttons of the reader in ${mode}`);
    assert.ok(contrast(r('textMuted'), r('surface')) >= 4.5, `the credit and the muted lines in ${mode}`);
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
  assert.match(src, /<SampleNotice title="Preview">\{BOOKMARKS_NOTICE\}<\/SampleNotice>/, 'the example books kept here are still examples, and it says so');
  const design = readFileSync(join(root, '..', 'design', 'index.html'), 'utf8');
  const phone = design.slice(design.indexOf('<b>Library · Bookmarks</b>'), design.indexOf('<b>Library · Bookmarks, empty</b>'));
  assert.ok(phone.length > 2000);
  assert.match(phone, />Bookmarks<\/h1>/);
  assert.match(phone, /class="lib-h">Library<\/h4>/);
  assert.match(phone, /class="lib-h"[^>]*>Posts<\/h4>/);
});

// The four fonts of the brand design system (design/tokens.json "font": title Fraunces, body Inter, mono JetBrains Mono, accent Caveat; brand/BRAND_GUIDELINE.md section 5):
// Fraunces SemiBold for titles (sentence case, tight spacing), Inter for the words and the interface, JetBrains Mono for data (counts, numbers, references: "Stage 07 · 24.6 km"), and
// Caveat Bold for ONE short handwritten accent per design, never more, never inside a button label or running text. On the Bible side of the Library every font is a variant of
// AppText (h1 to h4 are Fraunces, the others Inter, mono is JetBrains Mono, accent is Caveat), never a font of its own, and each screen has the handwritten notes it should.
check('the four fonts by role on the Bible side of the Library: Fraunces for names, titles and headings, Inter for the words and the interface, JetBrains Mono for counts, numbers and references, and one short Caveat note per screen at most, always by variant, never a font of its own', () => {
  const theme = read(join('src', 'theme', 'index.ts'));
  assert.match(theme, /title: 'Fraunces_600SemiBold'/);
  assert.match(theme, /body: 'Inter_400Regular'/);
  assert.match(theme, /mono: 'JetBrainsMono_400Regular'/);
  assert.match(theme, /accent: 'Caveat_700Bold'/);
  const fontOf = (variant: string) => (tokens as unknown as { text: Record<string, { font: string }> }).text[variant].font;
  for (const v of ['display', 'h1', 'h2', 'h3', 'h4']) assert.equal(fontOf(v), 'title', `${v} is the title font`);
  for (const v of ['lead', 'body', 'small', 'label', 'caption']) assert.equal(fontOf(v), 'body', `${v} is the body font`);
  assert.equal(fontOf('mono'), 'mono');
  assert.equal(fontOf('accent'), 'accent');
  assert.deepEqual(Object.keys((tokens as unknown as { font: Record<string, string> }).font).filter((k) => ['title', 'body', 'mono', 'accent'].includes(k)), ['title', 'body', 'mono', 'accent']);
  // all four families are loaded and nothing else: no new family, no new package. Inter is also loaded in Light (Inter_300Light, from the same
  // package), used only for the labels of the inactive tabs of the tab bar (see themeScheme.test.ts).
  assert.match(read(join('app', '_layout.tsx')), /Fraunces_600SemiBold, Inter_300Light, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, JetBrainsMono_400Regular, Caveat_700Bold/, 'all four families are loaded (Inter also in Light for the inactive tabs): no new family, no new package');
  // the roles, element by element: [file, what must be there, what it says]
  const L = join('src', 'features', 'library');
  const roles: Array<[string, RegExp, string]> = [
    [join(L, 'bible', 'BookGrid.tsx'), /<AppText\s+variant="h4"[^>]*numberOfLines=\{name\.lines\.length\}/, 'the name of a book on a tile is Fraunces (h4)'],
    [join(L, 'bible', 'BookGrid.tsx'), /<AppText\s+variant="mono"\s+muted[^>]*numberOfLines=\{1\}/, 'the count on a tile is JetBrains Mono'],
    [join(L, 'bible', 'ChapterGrid.tsx'), /<AppText variant="mono" maxFontSizeMultiplier=\{1\.3\}[^>]*>\{n\}<\/AppText>/, 'a chapter number is JetBrains Mono'],
    [join(L, 'LibraryTabs.tsx'), /<AppText variant="h4" accessibilityRole="header">Books of the Bible<\/AppText>/, 'the heading of the Bible tab is Fraunces'],
    [join(L, 'LibraryTabs.tsx'), /<AppText variant="mono" muted accessibilityLiveRegion="polite"[^>]*>\{countLine\(testament\)\}<\/AppText>/, 'the count of books of a part is JetBrains Mono'],
    [join(L, 'LibraryTabs.tsx'), /<AppText variant="caption" muted>\{BIBLE_SOURCE_LINE/, 'the source line is Inter'],
    [join(L, 'LibraryTabs.tsx'), /<AppText variant="h4" style=\{\{ fontSize: 20, lineHeight: 26 \}\}>\{b\.name\}<\/AppText>/, 'the name of a book of the Bible in a row of results is Fraunces'],
    [join(L, 'LibraryTabs.tsx'), /<AppText variant="mono" muted style=\{\{ fontSize: 14, lineHeight: 21 \}\}>\{chaptersLabel\(book\.chapters\)\}<\/AppText>/, 'its count is JetBrains Mono'],
    [join(L, 'bible', 'TestamentBar.tsx'), /<AppText variant="label" maxFontSizeMultiplier=\{BAR_MAX_FONT_SCALE\}/, 'the three choices are Inter'],
    [join(L, 'LibraryBanner.tsx'), /<AppText variant="mono"[^>]*>\{label\}<\/AppText>/, 'the date line of the banner is JetBrains Mono'],
    [join(L, 'LibraryBanner.tsx'), /<AppText variant="h4"[^>]*>\{title\}<\/AppText>/, 'the title of the banner is Fraunces'],
    [join(L, 'LibraryBanner.tsx'), /<AppText variant="accent"[^>]*>\{note\}<\/AppText>/, 'the one note of the banner is Caveat'],
    [join(L, 'LibraryBanner.tsx'), /<AppText variant="label"[^>]*>\{cta\}<\/AppText>/, 'the label of the gold pill is Inter, never the handwriting'],
    [join(L, 'bible', 'ContinueCard.tsx'), /<AppText variant="mono"[^>]*>\{placeLabel\(place\)\}<\/AppText>/, 'the chapter on the continue card is a reference: JetBrains Mono'],
    [join(L, 'bible', 'ContinueCard.tsx'), /<AppText variant="label" muted[^>]*>\{CONTINUE_TITLE\}<\/AppText>/, 'the words over it are Inter'],
    [join(L, 'bible', 'Reader.tsx'), /<AppText variant="h4" color=\{role\.accentText\}[^>]*>\{book\.name\}<\/AppText>/, 'the name of the book over the chapter is Fraunces'],
    [join(L, 'bible', 'Reader.tsx'), /<AppText variant="h2" accessibilityRole="header"[^>]*>\{chapterTitle\(place\)\}<\/AppText>/, 'the title of the chapter is Fraunces'],
    [join(L, 'bible', 'Reader.tsx'), /\{!!chapter\.title && <AppText variant="h4" muted /, 'the title of a psalm is Fraunces'],
    [join(L, 'bible', 'ReaderText.tsx'), /<AppText variant="h4" accessibilityRole="header"[^>]*>\{block\.text\}<\/AppText>/, 'a heading in the text is Fraunces'],
    [join(L, 'bible', 'ReaderText.tsx'), /<AppText variant="mono"[^>]*>\s+\{digits\.length > 0 && <Text style=\{\{ letterSpacing: NUMBER_TRACKING \}\}>\{digits\.join\(''\)\}<\/Text>\}\s+\{last\}\s+<\/AppText>/, 'the raised number of a verse is JetBrains Mono'],
    [join(L, 'bible', 'ReaderText.tsx'), /<AppText maxFontSizeMultiplier=\{READER_MAX_FONT_SCALE\} style=\{\{ fontSize: BODY_SIZE, lineHeight: BODY_LINE \}\}>/, 'the words of a verse are Inter (the body font of AppText)'],
    [join(L, 'bible', 'ChapterNav.tsx'), /<AppText variant="mono"[^>]*>\{placeLabel\(to\)\}<\/AppText>/, 'the chapter a button goes to is a reference: JetBrains Mono'],
    [join(L, 'bible', 'VerseActions.tsx'), /<AppText variant="mono"[^>]*color=\{role\.accentText\}[^>]*>\{place\}<\/AppText>/, 'the place of the chosen verse is a reference: JetBrains Mono'],
    [join(L, 'bible', 'VerseRows.tsx'), /<AppText variant="mono" color=\{role\.accentText\}[^>]*>\{row\.label\}<\/AppText>/, 'the place of a verse in a list is JetBrains Mono'],
    [join(L, 'bible', 'VerseRows.tsx'), /<AppText variant="small" numberOfLines=\{ROW_TEXT_LINES\}>/, 'the words of a verse in a list are Inter'],
    [join('app', 'library', 'bible', '[code]', 'index.tsx'), /<AppText variant="h2" accessibilityRole="header">\{book\.name\}<\/AppText>/, 'the name of a book as the title of its screen of chapters is Fraunces'],
    [join('app', 'library', 'bible', '[code]', 'index.tsx'), /<AppText variant="mono" muted[^>]*>\{chaptersLabel\(book\.chapters\)\}<\/AppText>/, 'its count is JetBrains Mono'],
    [join('app', 'library', 'bible', '[code]', 'index.tsx'), /<AppText variant="accent" color=\{role\.accentText\}>\{CHAPTERS_NOTE\}<\/AppText>/, 'its one note is Caveat'],
  ];
  for (const [file, re, what] of roles) assert.match(read(file), re, `${file}: ${what}`);
  // a font of its own, or a font token written out, is not allowed on the Bible side: the variants have the fonts
  const bibleSide = [
    ...readdirSync(join(root, L, 'bible')).filter((f) => /\.tsx$/.test(f)).map((f) => join(L, 'bible', f)),
    join(L, 'SearchResults.tsx'), join('app', 'library', 'bible', '[code]', 'index.tsx'), join('app', 'library', 'bible', '[code]', '[chapter].tsx'),
  ];
  const strip = (src: string) => src.split('\n').filter((l) => !/^\s*(\/\/|\/?\*)/.test(l)).join('\n');
  const own = bibleSide.filter((f) => /fontFamily|\bfonts\./.test(strip(read(f))));
  assert.deepEqual(own, [], 'these files name a font of their own: use the variant of AppText that has it');
  // the compact banner and the daily banner are the Bible side of LibraryBanner.tsx; the earlier tall banner (the Books tab) is not touched here
  const banner = strip(read(join(L, 'LibraryBanner.tsx')));
  const compact = banner.slice(banner.indexOf('export function CompactBanner'), banner.indexOf('type BannerProps'));
  assert.doesNotMatch(compact + banner.slice(banner.indexOf('export function DailyBanner'), banner.indexOf('export function BooksBanner')), /fontFamily|\bfonts\./);
  // Caveat: ONE short note per screen, never more (the brand: max one per design), counted over the files each screen draws
  const accent = (files: string[]) => files.reduce((sum, f) => sum + (strip(read(f)).match(/variant="accent"/g) ?? []).length, 0);
  const screens: Record<string, { files: string[]; notes: number }> = {
    'the Bible tab': { files: [join('app', '(tabs)', 'library.tsx'), join(L, 'LibraryBanner.tsx'), join(L, 'LibraryTabs.tsx'), join(L, 'bible', 'BookGrid.tsx'), join(L, 'bible', 'TestamentBar.tsx'), join(L, 'bible', 'ContinueCard.tsx')], notes: 1 },
    'the chapters of a book': { files: [join('app', 'library', 'bible', '[code]', 'index.tsx'), join(L, 'bible', 'ChapterGrid.tsx')], notes: 1 },
    'the reader': { files: [join(L, 'bible', 'Reader.tsx'), join(L, 'bible', 'ReaderText.tsx'), join(L, 'bible', 'ChapterNav.tsx'), join(L, 'bible', 'VerseActions.tsx')], notes: 1 },
    'the results of a search': { files: [join(L, 'SearchResults.tsx'), join(L, 'bible', 'VerseRows.tsx')], notes: 0 },
    'Bookmarks': { files: [join('app', 'library', 'bookmarks.tsx'), join(L, 'bible', 'VerseRows.tsx')], notes: 0 },
  };
  for (const [screen, { files, notes }] of Object.entries(screens)) assert.equal(accent(files), notes, `${screen} has ${accent(files)} handwritten notes, it should have ${notes}`);
  // the note is a few words, and it is never inside a button label or running text
  const notes = [...strip(read(join(L, 'bible', 'credit.ts'))).matchAll(/NOTE = '([^']+)'/g)].map((m) => m[1]).concat(['Buen Camino!']);
  for (const note of notes) assert.ok(note.split(' ').length <= 4 && note.length <= 20, `"${note}" is a few words`);
  assert.doesNotMatch(compact, /accessibilityLabel=\{[^}]*note/, 'the note is not said as part of the button');
  // the same on the design page: one handwritten note on each of its Bible phones that has one, never two
  const design = readFileSync(join(root, '..', 'design', 'index.html'), 'utf8');
  const phones = [...design.matchAll(/<p class="phone-label"><b>((?:Library|Reader)[^<]*)<\/b>/g)].map((m) => m[1]).filter((label) => !/Notes/.test(label));
  assert.ok(phones.length >= 19, `${phones.length} phones of the Library and the Reader`);
  const handwriting = (label: string) => {
    const start = design.indexOf(`<p class="phone-label"><b>${label}</b>`);
    const next = design.indexOf('<p class="phone-label">', start + 10);
    return (design.slice(start, next > 0 ? next : undefined).match(/class="hw"/g) ?? []).length;
  };
  for (const label of phones) assert.ok(handwriting(label) <= 1, `the phone "${label}" has ${handwriting(label)} handwritten notes`);
  for (const label of ['Library', 'Library · Continue', 'Library · Dark', 'Library · Deuterocanon', 'Library · Chapters', 'Reader · Psalm 121', 'Reader · John 1']) assert.equal(handwriting(label), 1, `the phone "${label}" has its handwritten note`);
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
