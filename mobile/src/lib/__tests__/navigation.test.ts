// Plain-node checks of how the app is laid out: which tabs there are, where Settings lives, and that nothing a screen
// opens is missing. Run: npm run test:lib
//
// The tab bar is Me, Stays, Maps, Discover, Library. Settings is not a tab: it is a screen of its own, opened from the
// gear at the top right of Me. Library has no title: its top row is a search field and the round Bookmarks button in the corner
// (the size of Me's bell and gear); directly under it the two tabs Bible and Books, then the banner of the tab (both have one). On Bible three
// choices sit in the page under the compact banner (Old Testament, Deuterocanon, New Testament, a segmented pill) and the books of that part are
// square tiles. The diary is not in the Library: it is the first sub-tab of Me (Notes, Journey, Plan, Health), and the one gold pen of Me follows
// the sub-tab. These checks fail when someone brings a tab back without its icon (the tab bar would crash on it), when a route file and the tab
// list disagree, when a link still points at the old Settings tab, or when the Library or Me drift from the design page.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import '../../features/library/__tests__/bundleShim'; // first: the compiled bookBundle.ts finds the files of the books through it
import { BOOK_CATALOG } from '../../features/library/books/catalog';
import { shelves } from '../../features/library/books/copy';
import { coverLabel } from '../../features/library/books/cover';
import { BIBLE_SOURCE_LINE, LIBRARY_TABS, ROW_TABS } from '../../features/library/sample';
import { ME_FAB, ME_TABS } from '../../features/me/tabs';

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

check('one Fab for every floating gold button, and Me draws exactly one at a time: a note on Notes, a journey post on Journey, none on Plan and Health; the Library has none; both sit just above the tab bar', () => {
  const fab = read(join('src', 'components', 'Fab.tsx'));
  const bar = read(join('src', 'components', 'TabBar.tsx'));
  const me = read(join('app', '(tabs)', 'me.tsx'));
  assert.equal((me.match(/<Fab\b/g) ?? []).length, 1, 'one Fab element in the whole of Me: never two at once');
  assert.match(me, /const fab = ME_FAB\[tab\];/);
  assert.match(me, /\{fab && <Fab label=\{fab\.label\} icon=\{fab\.icon\} onPress=\{\(\) => router\.push\(fab\.href\)\} \/>\}/, 'the label, the icon and the route come from the table of the sub-tabs');
  assert.deepEqual(ME_FAB.Notes, { label: 'Write a note', icon: 'compose', href: '/diary/new' });
  assert.deepEqual(ME_FAB.Journey, { label: 'Write a journey post', icon: 'pen', href: '/write' });
  assert.equal(ME_FAB.Plan, null);
  assert.equal(ME_FAB.Health, null);
  assert.deepEqual(Object.keys(ME_FAB), [...ME_TABS], 'every sub-tab has an entry, so none is forgotten');
  assert.equal(Object.values(ME_FAB).filter(Boolean).length, 2, 'two sub-tabs have a button and each has one');
  assert.doesNotMatch(read(join('app', '(tabs)', 'library.tsx')), /<Fab\b|\bFab\b/, 'the Library has no gold pen: writing is on Me');
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
  assert.doesNotMatch(screen, /onDiary|router\.push\('\/diary'\)/, 'the diary button is gone from the top right: the diary is the Notes sub-tab of Me');
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
  // and not the bookmark next to it (the Notes feed of Me, or anything else, may use it)
  assert.ok(iconPaths('diary').length >= 2);
  assert.notDeepEqual(iconPaths('diary'), iconPaths('book'));
  assert.notDeepEqual(iconPaths('diary'), iconPaths('library'));
  assert.notDeepEqual(iconPaths('bookmark'), iconPaths('diary'));
});

check('Library: directly under the search row the two tabs Bible and Books, and only then the banner of the tab; a search takes the place of all of it; there is no Notes tab, no Notes host and no second scroll view', () => {
  assert.deepEqual([...LIBRARY_TABS], ['Bible', 'Books']);
  assert.deepEqual([...ROW_TABS], ['Bible', 'Books']);
  assert.equal(BIBLE_SOURCE_LINE, 'World English Bible, Catholic edition · public domain');
  const screen = read(join('app', '(tabs)', 'library.tsx'));
  assert.match(screen, /<Screen keyboard>/, 'a button can be tapped while the keyboard is up');
  assert.doesNotMatch(screen, /PromoBanner/, 'the carousel with dots is gone from Library: one banner for each of two tabs');
  assert.doesNotMatch(screen, /MusicTab|'Music'/);
  // the Notes tab is gone from the screen for good: no tab, no feed, no host, no pen, no keyboard special case
  assert.doesNotMatch(screen.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n'), /Notes|NotesTab|<Fab\b/, 'nothing of the Notes tab is left in the Library screen');
  assert.doesNotMatch(screen, /if \(tab === '/, 'one return: no tab has a host of its own');
  assert.equal((screen.match(/\breturn \(/g) ?? []).length, 1, 'the screen has one layout, for every tab and for the results');
  assert.doesNotMatch(screen, /<ScrollView\b/, 'the screen\'s own scroll (Screen) is the only one');
  assert.match(screen, /import \{ LIBRARY_TABS, asLibraryTab \} from '@\/features\/library\/sample';/);
  assert.match(screen, /const \[picked, setTab\] = useState<string>\(LIBRARY_TABS\[0\]\);\s*const tab = asLibraryTab\(picked\);/, 'a stale tab name is the first tab');
  // the top of the screen is one piece, `top`: the heading, the search row, the message, and then the tab strip (not while searching)
  const at = (needle: string, from = 0) => { const i = screen.indexOf(needle, from); assert.ok(i > 0, `library.tsx has no ${needle}`); return i; };
  const top = at('const top = ('), header = at('<LibraryHeader ', top), strip = at('<SubTabs tabs={LIBRARY_TABS}', top);
  assert.ok(header < strip, 'the search row comes first, the tab strip directly after it');
  assert.match(screen, /\{!searching && <SubTabs tabs=\{LIBRARY_TABS\} value=\{tab\} onChange=\{setTab\} \/>\}/, 'the tab strip is drawn unless something is typed, and it is drawn before any banner or content');
  assert.equal((screen.match(/\{top\}/g) ?? []).length, 1, 'the top is drawn once, in the screen\'s own scroll');
  // Bible and Books and the results: rows in the screen's own scroll, after the top: on Bible the card that continues the chapter, the compact banner, then the Bible tab (the choice of the part, the tiles)
  const screenAt = at('<Screen keyboard');
  const card = at('<ContinueCard', screenAt), daily = at('<DailyBanner', screenAt), bible = at('<BibleTab', screenAt), books = at('<BooksBanner reading={booksReading} />', screenAt), booksTab = at('<BooksTab', screenAt);
  assert.ok(at('{top}', screenAt) < card && card < daily && daily < bible && bible < books && books < booksTab, 'the top, the continue card, the Bible banner, Bible, the Books banner, Books');
  assert.match(screen, /\{searching \? \(\s*<SearchResults[^]*?\/>\s*\) : \(\s*<>\s*\{tab === 'Bible' && lastRead\.place && <ContinueCard/, 'the results take the place of the banners and the tab content, and clearing the field brings them back');
  assert.match(screen, /const searching = isSearching\(query\);/);
  // each banner is shown under its own tab only
  assert.match(screen, /\{tab === 'Bible' && <DailyBanner onOpen=\{\(\) => router\.push\('\/library\/daily'\)\} \/>\}/);
  assert.match(screen, /\{tab === 'Books' && <BooksBanner reading=\{booksReading\} \/>\}/);
  assert.equal((screen.match(/<DailyBanner/g) ?? []).length + (screen.match(/<BooksBanner/g) ?? []).length, 2, 'two banners, one for each tab that has one');
  // neither tab has a notice: the text of the Bible is in the app (one quiet source line instead) and so are the books (each book page says how they were written, notices.ts)
  const tabsSrc = read(join('src', 'features', 'library', 'LibraryTabs.tsx'));
  assert.doesNotMatch(tabsSrc, /BooksNotice|booksNotice/, 'the Books tab has no notice above its covers');
  const results = read(join('src', 'features', 'library', 'SearchResults.tsx'));
  assert.doesNotMatch(results, /SampleNotice|SEARCH_NOTICE|hasBookText/, 'a search has no notice about books: every book found is in the app');
  assert.match(results, /Clear search/);
  assert.doesNotMatch(results, /Notes|diary/i, 'the search shows no notes: it never did');
  assert.match(read(join('src', 'components', 'Screen.tsx')), /keyboardShouldPersistTaps=\{keyboard \? 'handled' : 'never'\}/);
});

check('what floats at the bottom of the Library: nothing. The three choices of the Bible are in the page, directly under the banner, and the gold pen moved to Me', () => {
  const screen = read(join('app', '(tabs)', 'library.tsx'));
  assert.equal((screen.match(/<Fab\b/g) ?? []).length, 0, 'the gold pen moved to Me: one pen there, following the sub-tab');
  assert.equal((screen.match(/<TestamentBar\b/g) ?? []).length, 0, 'the screen draws no bar of its own: the Bible tab draws the choices in the page');
  // Default: the Old Testament
  assert.match(screen, /useState<Testament>\('old'\)/);
  // no floating logic left: no room kept for a bar, no scroll back to the list, no offsets read; one scroll view for every tab and for the results
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
  for (const b of BOOK_CATALOG) assert.ok(contrast(tokens.color.blue, tokens.color[b.cover.colour]) >= 4.5, `the navy on the ${b.cover.colour} cover (covers do not change with dark)`);
});

check('the design page shows the same Library: the two tabs Bible and Books, the compact banner, the three parts as a segmented pill under it, the books as tiles, the covers of the Books tab, the chapters, the reader, the verses of a search and of Bookmarks, in light and dark', () => {
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

  // Bible: the tab strip, then the compact banner, then the three parts, the heading and the count, the source line, the tiles, the tab bar; no notice, no chip, no floating bar, no gold pen
  const order = ['class="lib-head"', 'class="cp-subtabs"', 'class="cp-banner cmp"', 'class="lib-seg"', 'class="lib-hrow"', 'class="lib-src"', 'class="lib-grid"', 'class="lib-tile"', 'class="tabdock"'].map((needle) => bible.indexOf(needle));
  assert.ok(order.every((i) => i > 0) && order.every((i, k) => k === 0 || i > order[k - 1]), `Bible: head, tabs, banner, the three parts, heading, source line, tiles, the tab bar (${order})`);
  assert.match(bible, /<div class="cp-subtabs"[^>]*><span class="on">Bible<\/span><span>Books<\/span><\/div>/, 'two tabs: there is no Notes tab in the Library');
  assert.match(bible, /<div class="cp-banner cmp" role="button" aria-label="Read today\. Daily reading\. Sunday 8 November">\s*<div class="ey">Sunday 8 November<\/div>\s*<h4>Daily reading<\/h4>\s*<div class="row"><span class="hw">Buen Camino!<\/span><span class="pill">Read today<\/span><\/div>/);
  assert.doesNotMatch(bible, /cp-dots|cp-banner lib|art"/, 'the banner is one compact card: no dots, no big glyph');
  assert.match(bible, /<h4 class="lib-h">Books of the Bible<\/h4><span class="cnt" aria-label="Old Testament, 39 books">39 books<\/span>/);
  assert.match(bible, /<p class="lib-src">World English Bible, Catholic edition · public&nbsp;domain<\/p>/);
  assert.doesNotMatch(bible, /lib-notice|lib-chip|lib-bar|fab-slot|cp-fab-write|Write a note|Write in your diary|The Bible text is not in the app yet|Soon/, 'no notice, no chip, nothing floating, no gold pen (writing is on Me): the Bible is in the app');
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
  assert.match(cont, /aria-label="1 Thessalonians, 5 chapters"><span class="nm" style="font-size:14px;/, 'the longest word of all comes down to 14 on a phone of 390: the fit counts every letter rounded up to a pixel, as a browser that hints the glyphs draws it');
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

  // Books: Books on, the compact banner with the words of the tab (Start reading, and no second button), the shelves with their headings and the counts of their books, a cover for every book
  // (A5, two in a row, each ONE button named title, kind, time, and a ribbon of its own), no mark of free, soon or preview; no choices at the bottom, no gold pen. The phones of the Books are drawn
  // from the bundle by designBooks.ts and checked closer in designBooks.test.ts
  assert.match(books, /<div class="cp-subtabs"[^>]*><span>Bible<\/span><span class="on">Books<\/span><\/div>/);
  const banner = books.slice(books.indexOf('class="cp-banner cmp"'), books.indexOf('class="bk-shelf"'));
  assert.match(banner, /^class="cp-banner cmp" role="button" aria-label="Start reading\. Books for the road\. [^"]+"><div class="ey">[^<]+<\/div><h4>Books for the road<\/h4><div class="row"><span class="hw">No rush<\/span><span class="pill">Start reading<\/span><\/div><\/div>/);
  assert.doesNotMatch(banner, /<button|cp-btn/, 'the Books banner is one button for a screen reader, the pill is only its look');
  const shelf = shelves(BOOK_CATALOG)[0];
  assert.match(books, new RegExp(`<div class="hd"><h4>${shelf.title.replace(/'/g, "'")}</h4><span class="ct">${shelf.books.length} books</span></div>`), 'the heading of the first shelf, with the number of its books');
  assert.equal(count(books, /class="bk-cover"/g), shelf.books.length, 'a cover for every book of the first shelf');
  assert.ok(books.includes(`aria-label="${coverLabel(BOOK_CATALOG[0]).replace(/"/g, '&quot;')}"`), 'a cover is one button named title, kind, time');
  assert.doesNotMatch(books, /lib-seg|role="radiogroup"|lib-tile|fab-slot|cp-fab-write|lib-book|lib-chip|lib-notice|Soon|SOON|FREE|Free to read|Preview/, 'Books has neither the choices of the Bible nor the gold pen, nor the old rows, nor a mark of free or soon');
  assert.doesNotMatch(books, /gutenberg|ccel|licen[cs]e|translator|public domain/i, 'the data that is only for later is not on the Books tab of the design page either');

  // Search: the books of the Bible and the verses of a word that finds no book of the Library, grouped, and no notice (everything found is in the app); no choices, no gold pen. The word that
  // finds books has a phone of its own ("Library · Search, books"), checked in designBooks.test.ts
  assert.match(search, /<p class="lib-count" style="margin:16px 0 0">104 results for “john”<\/p>/);
  assert.match(search, /class="lib-label"[^>]*>Bible · 4<\/div>[\s\S]*class="lib-label"[^>]*>Verses · 100\+<\/div>/);
  assert.doesNotMatch(search, /class="lib-label"[^>]*>Books · |lib-notice|Coming soon|Preview|lib-chip/, 'no group of books for this word, and no notice');
  assert.match(search, /<div class="lib-bk">1 John<\/div><div class="lib-line">New&nbsp;Testament · <span class="mn">5&nbsp;chapters<\/span><\/div>/, 'a book of the Bible in a list: its name in Fraunces, the count in JetBrains Mono');
  assert.match(search, /<div class="vl">1 Maccabees 2:1<\/div><div class="vt">/, 'a verse in a list: the place in JetBrains Mono, then the words');
  assert.match(phoneOf('Library · Search, books'), /class="lib-label"[^>]*>Books · \d+<\/div>[\s\S]*class="bk-brow"/, 'a book in a list: a small cover, the title, the subtitle, the description, the kind and the time');
  // the verses of a search: the match is marked, and no notice because no example book is among the results
  assert.match(verses, /20 results for “love one another”/);
  assert.match(verses, /class="lib-label"[^>]*>Verses · 20<\/div>/);
  assert.match(verses, /<div class="vl">John 13:34<\/div><div class="vt">[^]*?<mark>love<\/mark> <mark>one<\/mark> <mark>another<\/mark>[^]*?<\/div>/, 'the words that matched are marked');
  assert.doesNotMatch(verses, /lib-notice|Preview/);
  assert.match(goto, /<div class="lib-goto" role="button" aria-label="Go to Psalm 121:3"><span class="g">Go to <span class="m">Psalm 121:3<\/span><\/span>/);
  assert.match(nothing, /Nothing found for “zzz”/);
  assert.doesNotMatch(nothing, /lib-notice/, 'nothing found has no Preview notice: no example is among the results');
  for (const [name, phone] of Object.entries({ search, verses, goto, nothing })) assert.doesNotMatch(phone, /lib-seg|role="radiogroup"|fab-slot|cp-fab-write/, `${name}: nothing floats while results show`);

  // Bookmarks: the groups Bible (a row that opens the chapters), Books, Verses and Passages, then the posts; one line says where they are kept, and no notice about books
  assert.match(marks, /class="lib-label">Bible · 1<\/div>[\s\S]*Old&nbsp;Testament · <span class="mn">150&nbsp;chapters<\/span>[\s\S]*class="lib-label">Books · 1<\/div>[\s\S]*class="lib-label">Verses · 2<\/div>[\s\S]*class="lib-label">Passages · 1<\/div>/);
  assert.match(marks, /<div class="vl">Psalm 121:3<\/div>[\s\S]*<div class="vl">John 3:16<\/div>/);
  assert.match(marks, /<p class="bk-cap" style="margin:0">Kept only on this phone\. Logging out clears them\.<\/p>/, 'where they are kept, said once');
  assert.doesNotMatch(marks, /Music|lib-notice|lib-chip|Coming soon|Preview|Soon<|SOON/, 'no notice, no mark of soon');

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
  assert.match(chosen, /<div class="rd-act four" role="toolbar" aria-label="Actions for Psalm 121:3">\s*<div class="top"><span class="pl">Psalm 121:3<\/span><button class="x" aria-label="Close the verse actions">/);
  assert.match(chosen, /aria-label="Bookmark: Psalm 121:3">[^]*?<span>Bookmark<\/span><\/button><button aria-label="Write a note: Psalm 121:3">[^]*?<span>Note<\/span><\/button><button aria-label="Copy: Psalm 121:3">[^]*?<span>Copy<\/span><\/button><button aria-label="Share: Psalm 121:3">[^]*?<span>Share<\/span>/);
  assert.match(phoneOf('Reader · Verse bookmarked'), /<button class="on" aria-label="Remove bookmark: Psalm 121:3">[^]*?<span>Bookmark<\/span>/, 'the word stays, the glyph is filled and the button tinted');
  // the bar is made to be hit: a glyph of 30, a word of 16 (Inter SemiBold), each action at least 88 by 68 (with Note, four actions share the bar: a quarter each, the word 13 under 360 wide), the reference 17, 12 from the sides, 8 between the actions
  assert.match(design, /\.rd-act\.four \.btns button \{ min-width: 0; \}/);
  assert.equal(count(design, /class="rd-act four" role="toolbar"/g), 3, 'every bar of the Bible phones (the verse chosen, bookmarked, and the dark one) has Note');
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
  assert.doesNotMatch(all, /<span>Notes<\/span>|<span class="on">Notes<\/span>/, 'no phone of the Library has a Notes tab: the diary is the first sub-tab of Me');
  assert.equal(count(all, /class="cp-subtabs"/g), 5, 'five Library phones have the tab strip (Library, Continue, Dark, Deuterocanon, Books), and each of them has the two tabs Bible and Books');
  assert.equal(count(all, /<div class="cp-subtabs"[^>]*>(?:<span class="on">Bible<\/span><span>Books<\/span>|<span>Bible<\/span><span class="on">Books<\/span>)<\/div>/g), 5);
  assert.doesNotMatch(all, /verified|official/i, 'nothing says verified or official');
  // the gold pen is on Me (the Me · Notes phones are checked below); the Fab note on the design page says where it is
  assert.match(design, /Me: one pen at a time, and it follows the sub-tab: on Notes the note icon writes a note, on Journey the pen writes a journey post, on Plan and Health there is none\./);
  assert.doesNotMatch(design, /Library: on the Notes tab/, 'the design page no longer sends the pen to the Library');
  const sprite = /<symbol id="i-diary"[^>]*>(.*?)<\/symbol>/.exec(design);
  assert.ok(sprite, 'the sprite of the design page has no i-diary');
  assert.deepEqual([...sprite![1].matchAll(/ d="([^"]+)"/g)].map((m) => m[1]), iconPaths('diary'), 'the diary glyph of the design page and of the app are the same drawing');
  // the sprite has the glyphs of the covers, the same drawings as the app's (the building is the one the design page did not have)
  const building = /<symbol id="i-building"[^>]*>(.*?)<\/symbol>/.exec(design);
  assert.ok(building, 'the sprite of the design page has no i-building');
  assert.deepEqual([...building![1].matchAll(/ d="([^"]+)"/g)].map((m) => m[1]), iconPaths('building'));
  for (const b of BOOK_CATALOG) assert.ok(new RegExp(`<symbol id="i-${b.cover.icon}"`).test(design), `the design page sprite has no glyph for the cover of ${b.id}`);
});

check('the design page shows Me with the strip Notes, Journey, Plan, Health (Notes first), and the Me · Notes phones: one pen that writes a note, Me on in the tab bar, a dark twin, and no Library tab strip', () => {
  const design = readFileSync(join(root, '..', 'design', 'index.html'), 'utf8');
  const phoneOf = (label: string): string => {
    const start = design.indexOf(`<p class="phone-label"><b>${label}</b>`);
    assert.ok(start > 0, `the design page has no phone "${label}"`);
    const next = design.indexOf('<p class="phone-label">', start + 10);
    return design.slice(start, next > 0 ? next : undefined);
  };
  const strip = (on: string) => ['Notes', 'Journey', 'Plan', 'Health'].map((t) => (t === on ? `<span class="on">${t}</span>` : `<span>${t}</span>`)).join('');
  const journey = phoneOf('Me · Journey');
  const plan = phoneOf('Me · Plan');
  assert.ok(journey.includes(`<div class="cp-subtabs" style="margin:22px -24px 20px;padding:0 12px">${strip('Journey')}</div>`), 'Me · Journey: the four labels, Journey on');
  assert.ok(plan.includes(`<div class="cp-subtabs" style="margin:22px -24px 20px;padding:0 12px">${strip('Plan')}</div>`), 'Me · Plan: the four labels, Plan on');
  assert.ok(design.includes(`<div class="cp-subtabs" style="margin:0">${strip('Journey')}</div>`), 'the component sample of the strip');
  assert.match(journey, /aria-label="Write a journey post"/, 'on Journey the pen writes a journey post');
  assert.equal((journey.match(/cp-fab-write/g) ?? []).length, 1);
  assert.doesNotMatch(plan, /cp-fab-write/, 'Plan has no pen');
  // the Me · Notes phones
  const labels = ['Me · Notes', 'Me · Notes, dark', 'Me · Notes, scrolled', 'Me · Notes, photo grids', 'Me · Notes, empty', 'Me · Notes, menu'];
  for (const label of labels) {
    const phone = phoneOf(label);
    assert.ok(phone.length > 3000, `${label} is too short to be a screen`);
    assert.ok(phone.includes(`<div class="cp-subtabs" style="margin:22px -24px 0;padding:0 12px">${strip('Notes')}</div>`), `${label}: the four labels, Notes on and first`);
    assert.match(phone, /<div class="nt-metop">/, `${label}: it is the Me header over the feed, not the Library's search row`);
    assert.doesNotMatch(phone, /class="lib-search"|aria-label="Bookmarks"/, `${label}: no Library search row`);
    assert.doesNotMatch(phone, /<span>Bible<\/span>|<span>Books<\/span>/, `${label}: no Library tab strip`);
    assert.ok((phone.match(/cp-fab-write/g) ?? []).length <= 1, `${label}: never two pens`);
    if (label !== 'Me · Notes, menu') {
      assert.equal((phone.match(/cp-fab-write/g) ?? []).length, 1, `${label}: one pen`);
      assert.match(phone, /<button class="cp-fab-write" aria-label="Write a note"><svg class="cp-icon"><use href="#i-compose"\/><\/svg><\/button>/, `${label}: the pen writes a note`);
      assert.match(phone, /<div class="cp-tab on"><span class="ico"><svg class="cp-icon"><use href="#i-me"\/>/, `${label}: Me is the tab that is on`);
    }
    assert.doesNotMatch(phone, /Write in your diary|Library · Notes/);
  }
  assert.match(phoneOf('Me · Notes, dark'), /<div class="phone dk">/, 'the dark twin');
  assert.match(phoneOf('Me · Notes, empty'), /<h4>No notes yet<\/h4>/);
  assert.match(phoneOf('Me · Notes'), /Notes stay on this phone\./);
  assert.doesNotMatch(design, /<b>Library · Notes/, 'no Notes phone is labelled as a Library phone');
  const all = labels.map((l) => design.indexOf(`<b>${l}</b>`));
  assert.ok(all.every((i) => i > 0), 'every Me · Notes phone is on the page');
  assert.equal(new Set([...design.matchAll(/<p class="phone-label"><b>([^<]+)<\/b>/g)].map((m) => m[1])).size, [...design.matchAll(/<p class="phone-label"><b>([^<]+)<\/b>/g)].length, 'no two phones share a label');
});

check('the sample content never claims to be real: no price, no rating, no "available", no download, nothing in the data or the rows of the books that acts when touched', () => {
  const lib = (f: string) => read(join('src', 'features', 'library', f));
  const tabs = lib('LibraryTabs.tsx');
  const books = tabs.slice(tabs.indexOf('export function BookRows'), tabs.indexOf('export function LibraryGroups'));
  const data = [lib('sample.ts'), lib(join('books', 'catalog.ts')), books].join('\n');
  assert.doesNotMatch(data, /\$\d|€\d|\brating\b|★|available now|download|onPress/i);
  // and the one thing in the Library that acts at the top of the Bible tab (the banner) says only what it does
  assert.match(lib('LibraryBanner.tsx'), /export const DAILY_CTA = 'Read today';/);
});

check('the diary is reachable: its routes exist and are registered, the Notes sub-tab of Me is where it is, and the one pen of Me on that sub-tab opens a blank page', () => {
  assert.ok(exists(join('app', 'diary', 'index.tsx')));
  assert.ok(exists(join('app', 'diary', '[id].tsx')));
  const layout = read(join('app', '_layout.tsx'));
  assert.match(layout, /<Stack\.Screen name="diary\/index" \/>/);
  assert.match(layout, /<Stack\.Screen name="diary\/\[id\]" \/>/);
  const me = read(join('app', '(tabs)', 'me.tsx'));
  assert.equal(ME_FAB.Notes?.href, '/diary/new', 'the pen of the Notes sub-tab opens a blank page');
  assert.match(me, /import \{ NotesTab \} from '@\/features\/notes\/NotesTab';/, 'the diary\'s feed is the Notes sub-tab of Me');
  assert.match(me, /\{onNotes \? \(/);
  assert.doesNotMatch(me, /router\.push\('\/diary'\)/, 'no button of Me opens the list of pages: that list is the Notes sub-tab');
  const screen = read(join('app', '(tabs)', 'library.tsx'));
  assert.doesNotMatch(screen, /\/diary/, 'nothing of the Library opens the diary');
});

check('the words that point at the diary say it is in the Notes tab of Me: Help sends no one to the Library, or to a button that is gone', () => {
  const help = read(join('app', 'help.tsx'));
  assert.match(help, /Open Me and tap the Notes tab: your diary lives there\./);
  assert.doesNotMatch(help, /Library and tap the Notes tab|Library > Notes|Library, Notes/);
  assert.doesNotMatch(help, /diary button/i);
  const pointing = files.filter((f) => /(?:Library|library)\s*(?:>|→|›|,)\s*Notes|Notes tab of (?:the )?Library|Library's Notes|Library > My diary|three tabs/.test(read(f).split('\n').filter((l) => !/^\s*(\/\/|\/?\*)/.test(l)).join('\n')));
  assert.deepEqual(pointing, [], 'a screen or a help text that still sends someone to Notes in the Library');
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
  for (const b of BOOK_CATALOG) assert.ok(contrast(tokens.color.blue, tokens.color[b.cover.colour]) >= 4.5, `the navy glyph on the ${b.cover.colour} cover of ${b.id}`);
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
  assert.doesNotMatch(src, /SampleNotice|BOOKMARKS_NOTICE/, 'no notice about books on Bookmarks');
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
  // the compact banner and the daily banner are all that LibraryBanner.tsx has now (the Books tab's banner is books/BooksBanner.tsx, on the compact one)
  const banner = strip(read(join(L, 'LibraryBanner.tsx')));
  const compact = banner.slice(banner.indexOf('export function CompactBanner'), banner.indexOf('export function DailyBanner'));
  assert.doesNotMatch(compact + banner.slice(banner.indexOf('export function DailyBanner')), /fontFamily|\bfonts\./);
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
