// Source-level checks of the "Continue reading" bar that floats above the tab bar of the Library: they read the files, nothing is run. What the pure parts do (the most
// recent place, closing the bar and bringing it back, the numbers) is checked in continueBar.test.ts; here it is that the screens use them the way they must: ONE bar, mounted
// ONCE (on the Library, not on the readers, not on the other tabs), the two cards it replaced are gone from the pages, the bar and its close button are two buttons side by side
// with the labels a screen reader needs, the colours are roles and the fonts are variants, it sits where the tab bar's own numbers put it and the lists keep its room, it steps
// aside while somebody types, and what it keeps stays on the phone. Run from wiring.test.ts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };
const root = process.cwd(); // npm test runs from mobile/
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p: string) => fs.existsSync(path.join(root, p));
const code = (src: string) => src.split('\n').filter((l) => !/^\s*(\/\/|\/?\*)/.test(l)).join('\n'); // without comment lines
const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;

const DIR = 'src/features/library/continueBar';
const FILES = ['ContinueBar.tsx', 'barLayout.ts', 'hidden.ts', 'searchFocus.ts', 'spot.ts', 'useContinueBar.ts', 'useTyping.ts'];
const src = Object.fromEntries(FILES.map((f) => [f, code(read(`${DIR}/${f}`))])) as Record<string, string>;
const bar = src['ContinueBar.tsx'];

/** Every .ts and .tsx file of app/ and src/ (the tests are not the app). */
function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) { if (entry.name !== '__tests__' && entry.name !== 'node_modules') out.push(...sources(rel)); } else if (/\.tsx?$/.test(entry.name)) out.push(rel);
  }
  return out;
}
const appFiles = [...sources('app'), ...sources('src')];

/* ================================================================ one bar, one mount, no card left */

check('the bar is one folder of the files this test expects, so a new one is looked at', () => {
  assert.deepEqual(fs.readdirSync(path.join(root, DIR)).sort(), [...FILES].sort());
});

check('ONE bar and ONE mount: the Library screen draws <ContinueBar /> once, as the overlay of its Screen, and nothing else in the app draws one: not a reader, not another tab', () => {
  assert.equal(appFiles.filter((f) => /export function ContinueBar\b/.test(read(f))).length, 1, 'one component');
  const mounts = appFiles.filter((f) => /<ContinueBar\b/.test(code(read(f))));
  assert.deepEqual(mounts, ['app/(tabs)/library.tsx']);
  const screen = code(read('app/(tabs)/library.tsx'));
  assert.equal(count(screen, /<ContinueBar\b/g), 1);
  assert.match(screen, /<Screen keyboard overlay=\{<ContinueBar \/>\}>/, 'one line, no props: it brings its own data, place and room, so it could be moved to the tabs layout as it is');
  assert.match(screen, /import \{ ContinueBar \} from '@\/features\/library\/continueBar\/ContinueBar';/);
  // the readers are screens of their own (no tab bar there); the other tabs never mount it
  for (const f of appFiles.filter((x) => x.startsWith('app/library/') || /\/Reader\.tsx$/.test(x) || /app\/\(tabs\)\/(me|stays|maps|explore)\.tsx$/.test(x))) assert.doesNotMatch(code(read(f)), /ContinueBar/, f);
  // and it is not in the Notes host, where the gold pen floats
  assert.ok(!screen.slice(screen.indexOf("if (tab === 'Notes') {"), screen.indexOf('<Screen keyboard')).includes('ContinueBar'));
});

check('the two inline cards are gone: the Bible tab has no card in its page, the banner of the Books tab no longer says "Continue reading", and nothing imports the card that was deleted', () => {
  assert.ok(!exists('src/features/library/bible/ContinueCard.tsx'), 'the card is deleted');
  assert.deepEqual(appFiles.filter((f) => /ContinueCard/.test(read(f))), [], 'nothing in the app mentions it');
  const screen = code(read('app/(tabs)/library.tsx'));
  assert.doesNotMatch(screen, /useLastRead|useBooksReading|lastRead\b|booksReading/, 'the screen does not read the places any more: the bar reads them itself');
  const banner = code(read('src/features/library/books/BooksBanner.tsx'));
  assert.match(banner, /booksBanner\(BOOK_CATALOG, hasBookText, null\)/, 'the banner is never given a place to continue');
  // the words "Continue reading" are drawn by the bar alone (the book page says "Continue: Chapter 7", which is another thing)
  const drawing = appFiles.filter((f) => /\.tsx$/.test(f) && /CONTINUE_TITLE|CONTINUE_CTA/.test(code(read(f)))).sort();
  assert.deepEqual(drawing, [`${DIR}/ContinueBar.tsx`], 'only the bar draws "Continue reading"');
});

/* ================================================================ the two buttons */

check('the bar is ONE button for a screen reader ("Continue reading, Genesis 3") that opens the reader at the place, and the X is a button of its own: side by side, the bar first, never one inside the other', () => {
  assert.equal(count(bar, /<Pressable\b/g), 2, 'two buttons and nothing else can be pressed');
  const first = bar.indexOf('<Pressable');
  const second = bar.indexOf('<Pressable', first + 1);
  assert.ok(bar.indexOf('</Pressable>') > first && bar.indexOf('</Pressable>') < second, 'the first button is closed before the second opens: not nested');
  assert.match(bar, /<Pressable\s+accessibilityRole="button"\s+accessibilityLabel=\{view\.spoken\}\s+accessibilityHint=\{OPEN_HINT\}\s+onPress=\{\(\) => router\.push\(view\.href\)\}/, 'the bar is a button named by what it continues, and a push: Back returns to the Library');
  assert.match(bar, /<Pressable\s+accessibilityRole="button"\s+accessibilityLabel=\{HIDE_LABEL\}\s+onPress=\{hide\}/, 'the X is a button that says what it hides');
  assert.match(src['spot.ts'], /export const HIDE_LABEL = 'Hide Continue reading';/);
  assert.match(src['spot.ts'], /spoken: continueLabel\(place\)/, 'the Bible says "Continue reading, Genesis 3" with the label the Bible already had');
  assert.match(src['spot.ts'], /spoken: `\$\{CONTINUE_TITLE\}, \$\{book\.title\}\$\{chapter \? `, \$\{chapter\}` : ''\}`/, 'and a book "Continue reading, The Imitation of Christ, Chapter 2"');
});

check('the close button is at least 44 by 44 (48), the bar at least 64 high, and both icons are in the icon set of the app', () => {
  assert.match(src['barLayout.ts'], /export const CLOSE_SIZE = 48;/);
  assert.match(bar, /width: CLOSE_SIZE, height: CLOSE_SIZE/);
  assert.match(src['barLayout.ts'], /export const BAR_HEIGHT = 64;/);
  assert.match(bar, /minHeight: BAR_HEIGHT/, 'at least 64: it grows, a little, with the phone\'s text size');
  assert.match(bar, /minHeight: BAR_HEIGHT, flexDirection: 'row'/, 'the bar button is as high as the bar');
  const icons = read('src/components/Icon.tsx');
  for (const name of ['book', 'library', 'close']) assert.match(icons, new RegExp(`^\\s+(?:'${name}'|${name}): \\[`, 'm'), `the icon set has ${name}`);
  assert.match(bar, /<Icon name=\{view\.icon\} color=\{role\.highlight\} size=\{28\}/, 'the Bible or a book, in gold');
  assert.match(bar, /<Icon name="close" color=\{role\.onInverse\}/);
  assert.match(src['spot.ts'], /icon: 'book'/, 'the closed book with a cross for the Bible');
  assert.match(src['spot.ts'], /icon: 'library'/, 'the open book for a book');
});

check('the words: "Continue reading" small over the place on one line each, cut with an ellipsis; at most 1.2 times the phone\'s text size, so the bar stays a bar', () => {
  assert.match(bar, /<AppText variant="label" maxFontSizeMultiplier=\{1\.2\} numberOfLines=\{1\} color=\{role\.onInverseAccent\} style=\{\{ fontSize: 14, lineHeight: 18 \}\}>\{CONTINUE_TITLE\}<\/AppText>/);
  assert.match(bar, /<AppText variant="h4" maxFontSizeMultiplier=\{1\.2\} numberOfLines=\{1\} color=\{role\.onInverse\} style=\{\{ fontSize: 18, lineHeight: 24 \}\}>\{view\.label\}<\/AppText>/);
  assert.match(bar, /<View style=\{\{ flex: 1, minWidth: 0 \}\}>/, 'minWidth 0: a long title is cut, it does not push the X out of the bar');
  assert.equal(count(bar, /<AppText\b/g), 2, 'two lines');
});

/* ================================================================ how it looks */

check('colours are roles only (the hero card with its own text, gold for the glyph) and the fonts are variants of AppText: Fraunces for the place, Inter for the line over it, no handwriting; nothing moves', () => {
  assert.match(bar, /backgroundColor: role\.inverse/);
  for (const name of ['role.inverse', 'role.onInverse', 'role.onInverseAccent', 'role.highlight']) assert.ok(bar.includes(name), name);
  assert.doesNotMatch(bar, /#[0-9a-fA-F]{3,8}\b|rgba?\(|\bfixed\.|\bc\.[a-z]|\bscrim\b/, 'no colour of its own');
  assert.doesNotMatch(bar, /role\.(surface|muted|action|text|border|sunken|tabActive|tabInactive)\b/, 'not the tab bar\'s colours: it is a hero card');
  assert.doesNotMatch(bar, /fontFamily|\bfonts\./, 'the variants have the fonts');
  assert.doesNotMatch(bar, /variant="accent"|Caveat/, 'the screen already has its one handwritten note, the banner\'s');
  assert.doesNotMatch(bar, /Animated|LayoutAnimation|withTiming|withSpring|useNativeDriver|transition|Easing/, 'no motion, so there is nothing to reduce: it appears and goes at once');
  assert.match(bar, /borderRadius: radius\.pill/, 'a pill');
  assert.match(bar, /\.\.\.shadowStyle\('lg'\)/, 'the tab bar\'s shadow');
});

/* ================================================================ where it sits */

check('it sits above the tab bar with the same side margins, from the tab bar\'s own numbers (a test fails when they drift apart), 8 above the pill', () => {
  const tabs = read('src/components/TabBar.tsx');
  assert.match(tabs, /left: layout\.screenMargin, right: layout\.screenMargin, bottom: Math\.max\(insets\.bottom - 14, 10\), height: 88/);
  assert.match(src['barLayout.ts'], /export const TAB_BAR_HEIGHT = 88;/);
  assert.match(src['barLayout.ts'], /export const tabBarBottom = \(insetBottom: number\): number => Math\.max\(insetBottom - 14, 10\);/);
  assert.match(src['barLayout.ts'], /export const BAR_GAP = 8;/);
  assert.match(src['barLayout.ts'], /export const barBottom = \(insetBottom: number\): number => tabBarBottom\(insetBottom\) \+ TAB_BAR_HEIGHT \+ BAR_GAP;/);
  assert.match(bar, /position: 'absolute', left: layout\.screenMargin, right: layout\.screenMargin, bottom: barBottom\(insets\.bottom\)/);
  assert.match(bar, /const insets = useSafeAreaInsets\(\);/);
  // the gold button has the same numbers; the bar is not a copy of it
  assert.match(read('src/components/Fab.tsx'), /Math\.max\(insets\.bottom - 14, 10\) \+ 88 \+ 8/);
  assert.doesNotMatch(bar, /Math\.max\(insets\.bottom - 14/, 'the bar asks barLayout.ts, not a copy of the numbers');
});

check('the lists keep the bar\'s room: Screen takes an overlay (drawn over the scroll, not in it) and adds the room the bar says it takes to the end of its list; the bar says it while it is on the screen and gives it back when the screen goes', () => {
  const screen = code(read('src/components/Screen.tsx'));
  assert.match(screen, /import \{ useAboveTabBar \} from '@\/lib\/aboveTabBar';/);
  assert.match(screen, /overlay\?: ReactNode/);
  assert.match(screen, /const above = useAboveTabBar\(\);/);
  assert.match(screen, /paddingBottom: \(tabBar \? layout\.tabbarHeight \+ above : 0\) \+ insets\.bottom \+ 40/, 'only a screen with a tab bar keeps the room');
  assert.match(screen, /return overlay \? <View style=\{\{ flex: 1 \}\}>\{list\}\{overlay\}<\/View> : list;/, 'a screen with no overlay is drawn exactly as before');
  assert.match(bar, /useFocusEffect\(useCallback\(\(\) => \{\s+setAboveTabBar\(present \? BAR_ROOM : 0\);\s+return \(\) => setAboveTabBar\(0\);\s+\}, \[present\]\)\);/);
  assert.match(src['barLayout.ts'], /export const BAR_ROOM = BAR_HEIGHT \+ BAR_GAP;/);
  const store = code(read('src/lib/aboveTabBar.ts'));
  assert.match(store, /export const setAboveTabBar = \(value: number\) => \{\s+const next = Number\.isFinite\(value\) && value > 0 \? value : 0;/, 'anything that is not a positive number is no room');
  assert.match(store, /export const useAboveTabBar = \(\): number =>\s+useSyncExternalStore\(/);
  assert.doesNotMatch(bar, /marginBottom|paddingBottom/, 'the bar does not push the page itself: the screen keeps the room');
});

check('it steps aside while somebody types (the keyboard is open or the search field has the focus), while the tab bar is hidden, and while there is nothing to continue', () => {
  assert.match(bar, /const typing = useTyping\(\);/);
  assert.match(bar, /const tabBarHidden = useTabBarHidden\(\);/);
  assert.match(bar, /const present = !!view && !tabBarHidden;/);
  assert.match(bar, /if \(!view \|\| !barVisible\(\{ present, typing \}\)\) return null;/);
  const typing = src['useTyping.ts'];
  assert.match(typing, /Keyboard\.addListener\(ios \? 'keyboardWillShow' : 'keyboardDidShow', \(\) => setKeyboard\(true\)\)/);
  assert.match(typing, /Keyboard\.addListener\(ios \? 'keyboardWillHide' : 'keyboardDidHide', \(\) => setKeyboard\(false\)\)/);
  assert.match(typing, /shown\.remove\(\); hidden\.remove\(\);/, 'the listeners are removed');
  assert.match(typing, /return searching \|\| keyboard;/);
  assert.match(typing, /const searching = useSearchFocused\(\);/);
  // the search field says when it has the focus, and gives it back when it goes away; the bar gives it back when its screen goes out of view
  const field = code(read('src/features/library/SearchBar.tsx'));
  assert.match(field, /import \{ setSearchFocused \} from '\.\/continueBar\/searchFocus';/);
  assert.match(field, /useEffect\(\(\) => \{ setSearchFocused\(focus\); return \(\) => setSearchFocused\(false\); \}, \[focus\]\);/);
  assert.match(bar, /useFocusEffect\(useCallback\(\(\) => \(\) => setSearchFocused\(false\), \[\]\)\);/);
  // the room is kept while the bar only steps aside, so the page does not jump when the field is touched
  assert.match(bar, /setAboveTabBar\(present \? BAR_ROOM : 0\)/);
  assert.doesNotMatch(bar, /setAboveTabBar\([^)]*typing/);
});

/* ================================================================ what it keeps, and where */

check('closing is kept only on this phone, under a per-person key, in the way the other Library stores are kept; the places themselves are never changed or deleted by the bar', () => {
  const hook = src['useContinueBar.ts'];
  assert.match(hook, /localStore\.getJSON<unknown>\(userKey\(uid, LAST_READ_NAME\)\)/, 'the Bible\'s place, from its own key');
  assert.match(hook, /loadReading\(userKey\(uid, READING_NAME\)\)/, 'the books\' places, through the reader\'s own queue (a read waits for the writes before it)');
  assert.match(hook, /localStore\.getJSON<unknown>\(userKey\(uid, HIDDEN_NAME\)\)/);
  assert.match(hook, /hidden: parseHidden\(hiddenRaw\)/, 'a value that does not read hides nothing');
  assert.match(hook, /void localStore\.setJSON\(userKey\(cur\.uid, HIDDEN_NAME\), packHidden\(mark\)\);/);
  assert.equal(count(hook, /localStore\.setJSON\(/g), 1, 'the one thing it writes is the mark of what was closed');
  assert.doesNotMatch(hook, /localStore\.remove|removeByPrefix|saveReading|packLastRead|packReading/, 'the places are the readers\'; the bar only reads them');
  assert.match(hook, /useFocusEffect\(/, 'read again whenever the screen comes into view, because the readers change the places under it');
  assert.match(hook, /const uid = session\?\.user\.id \?\? null;/);
  assert.match(hook, /const bookView = book \? describeBook\(book, safeText\(book\.id\)\?\.chapters \?\? null\) : null;/, 'a book is named from its text, and a text that cannot be read still gives the title');
  assert.match(hook, /bookSpotOf\(reading, hasBookText\)/, 'a book that has no text is never offered');
  assert.match(hook, /const closed = mine\.current && mine\.current\.uid === uid \? mine\.current\.mark : null;/, 'a tap on X is not undone by a read that began a moment before');
  assert.doesNotMatch(hook, /supabase|lib\/api|lib\/net|fetch\(/, 'nothing leaves the phone');
  assert.match(src['hidden.ts'], /export const HIDDEN_NAME = 'library\.continueHidden';/);
  assert.match(read('src/lib/auth.tsx'), /await clearUserData\(uid\);/, 'logging out wipes it with every u.<userId>. key');
});

check('the bar compares what both stores already keep: the Bible\'s chapter has a time and a book\'s place has a time, so no stored file is changed', () => {
  assert.match(read('src/features/library/bible/lastRead.ts'), /export type StoredLastRead = \{ v: 1; code: string; chapter: number; at: number \};/);
  assert.match(read('src/features/library/books/reading.ts'), /export type BookPlace = \{ id: string; c: string; y: number; at: number; read: string\[\] \};/);
  assert.match(src['spot.ts'], /\(raw as \{ at\?: unknown \}\)\.at/, 'the time of the Bible\'s chapter is read apart from its place, so an older value with no time still loads');
  assert.match(src['spot.ts'], /return book\.at > bible\.at \? book : bible;/, 'the larger time wins, and the Bible wins a tie');
});

check('the pure files import nothing of React, React Native or the app; the others import React, React Native, expo-router, the safe-area module the tab bar uses and the app\'s own files, nothing else (no new native module)', () => {
  for (const f of ['barLayout.ts', 'hidden.ts', 'spot.ts']) {
    for (const m of src[f].matchAll(/from '([^']+)'/g)) assert.match(m[1], /^\.{1,2}\//, `${f} imports ${m[1]}: a pure file imports only its neighbours`);
  }
  const allowed = /^(react|react-native|expo-router|react-native-safe-area-context)$|^\.{1,2}\/|^@\//;
  for (const f of FILES) for (const m of src[f].matchAll(/from '([^']+)'/g)) assert.match(m[1], allowed, `${f} imports ${m[1]}`);
  for (const f of ['barLayout.ts', 'hidden.ts', 'spot.ts']) assert.doesNotMatch(src[f], /\bconsole\b|\bsetTimeout\b|\bsetInterval\b|\buse[A-Z]\w+\(/, `${f}: no timer, no hook`);
});

console.log(`${n} of ${n} passed (Continue reading bar wiring)`);
