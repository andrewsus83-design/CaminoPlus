// Source-level checks of how the Library (its tabs, search and Bookmarks) is wired into the app, in the style of the diary's wiring test:
// they read the files, nothing is run. What the pure parts do is checked in library.test.ts, bible.test.ts and books.test.ts; here it is
// that the screens use them the way they must (a row keeps its key, a bookmark is cleared when the person logs out, a post is bookmarked
// only through the calls the journey viewer makes, the rows cannot be pressed and the few things that can have a label and a state,
// nothing needs a new native module). The Notes tab (features/library/notes) and the daily reading (features/library/daily,
// app/library/daily.tsx) belong to their own features and their own tests: only the way they are plugged in is checked here.
// Run: npm run test:library
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };
const root = process.cwd(); // npm test runs from mobile/
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const code = (src: string) => src.split('\n').filter((l) => !/^\s*(\/\/|\/?\*)/.test(l)).join('\n'); // without comment lines

const DIR = 'src/features/library';
// The files of this feature: the folder itself, the Bible and Books folders, and the screens of app/library. Not notes/ and daily/, nor
// app/library/daily.tsx: the Notes tab and the daily reading are other features with their own tests.
const OWN_FOLDERS = ['', 'bible/', 'books/'];
const featureFiles = [
  ...OWN_FOLDERS.flatMap((sub) => fs.readdirSync(path.join(root, DIR, sub), { withFileTypes: true }).filter((f) => f.isFile() && /\.tsx?$/.test(f.name)).map((f) => `${DIR}/${sub}${f.name}`)),
  ...fs.readdirSync(path.join(root, 'app/library')).filter((f) => f !== 'daily.tsx').map((f) => `app/library/${f}`),
];

check('the feature is the files this test expects, so a new one is looked at (and the scan below sees all of them)', () => {
  assert.deepEqual([...featureFiles].sort(), [
    'app/library/bookmarks.tsx',
    `${DIR}/BookmarkToggle.tsx`, `${DIR}/LibraryBanner.tsx`, `${DIR}/LibraryHeader.tsx`, `${DIR}/LibraryTabs.tsx`, `${DIR}/SavedPostCard.tsx`, `${DIR}/SearchBar.tsx`,
    `${DIR}/SearchResults.tsx`, `${DIR}/bookmarks.ts`, `${DIR}/client.ts`, `${DIR}/sample.ts`, `${DIR}/savedPosts.ts`, `${DIR}/search.ts`, `${DIR}/useLibraryBookmarks.ts`,
    `${DIR}/useSavedPosts.ts`,
    `${DIR}/bible/TestamentBar.tsx`, `${DIR}/bible/books.ts`, `${DIR}/bible/today.ts`,
    `${DIR}/books/catalog.ts`,
  ].sort());
});

check('no new native module: the feature imports React, React Native, expo-router, the safe-area module the tab bar already uses and the app\'s own files, nothing else', () => {
  const allowed = /^(react|react-native|expo-router|react-native-safe-area-context)$|^\.{1,2}\/|^@\//;
  const offenders: string[] = [];
  for (const f of featureFiles) {
    for (const m of read(f).matchAll(/^import [^;]*? from '([^']+)';/gm)) if (!allowed.test(m[1])) offenders.push(`${f}: ${m[1]}`);
  }
  assert.deepEqual(offenders, []);
});

check('a row has no press handler of its own: the rows of the tabs are pictures, and the bookmark button is the one thing on them that can be pressed', () => {
  const tabs = code(read(`${DIR}/LibraryTabs.tsx`));
  assert.doesNotMatch(tabs, /onPress|Pressable|onClick/);
  assert.match(tabs, /import \{ BookmarkToggle \} from '\.\/BookmarkToggle';/);
  assert.match(tabs, /<BookmarkToggle on=\{marks\.has\(key\)\} title=\{title\} toggle=\{\(\) => marks\.toggle\(key\)\} color=\{color\} \/>/);
  // a row is bookmarked under the key of its own tab: the Bible rows under "bible:", the books under "books:"; there is no Music
  assert.match(tabs, /<Mark marks=\{marks\} tab="Bible" id=\{b\.id\} title=\{b\.name\} \/>/);
  assert.match(tabs, /<Mark marks=\{marks\} tab="Books" id=\{b\.id\} title=\{b\.title\} \/>/);
  assert.match(tabs, /const key = itemKey\(tab, id\);/);
  assert.doesNotMatch(tabs, /Music|Playlist|PLAYLIST/);
  // every row of every tab is drawn by the tab and by the results with the same two components
  assert.match(tabs, /\{tab === 'Bible' && <BibleBookRows items=\{hits\.Bible\} marks=\{marks\} withPart \/>\}/);
  assert.match(tabs, /\{tab === 'Books' && <BookRows items=\{hits\.Books\} marks=\{marks\} \/>\}/);
  assert.match(tabs, /<BibleBookRows items=\{booksOf\(testament\)\} marks=\{marks\} \/>/);
  assert.match(tabs, /<BookRows items=\{BOOK_CATALOG\} marks=\{marks\} \/>/);
  const toggle = code(read(`${DIR}/BookmarkToggle.tsx`));
  assert.match(toggle, /bookmarkLabel = \(on: boolean, title: string\) => `\$\{on \? 'Remove bookmark' : 'Bookmark'\}: \$\{title\}`/);
  assert.match(toggle, /accessibilityLabel=\{bookmarkLabel\(on, title\)\}/);
  assert.match(toggle, /accessibilityRole="button"/);
  assert.match(toggle, /width: 44, height: 44/);
});

check('what can be pressed in the feature: the bookmark button, the search field\'s clear button, the banner of the Bible tab and the three choices at the bottom of it, and nothing else', () => {
  const pressable = featureFiles.filter((f) => /<Pressable\b/.test(code(read(f)))).map((f) => path.basename(f)).sort();
  assert.deepEqual(pressable, ['BookmarkToggle.tsx', 'LibraryBanner.tsx', 'SearchBar.tsx', 'TestamentBar.tsx']);
  // a row of the Bible and of the Books is a View, with the chips "Soon" and "Free" next to its bookmark: it says what will be there and acts like nothing
  const tabs = code(read(`${DIR}/LibraryTabs.tsx`));
  assert.match(tabs, /<View key=\{b\.id\} accessibilityState=\{marks \? undefined : \{ disabled: true \}\}/);
  assert.equal((tabs.match(/<Soon \/>/g) ?? []).length, 2, 'every row of both lists says Soon');
  assert.equal((tabs.match(/<Free \/>/g) ?? []).length, 1, 'every book says Free');
  assert.match(tabs, /const Soon = \(\) => <Chip label="SOON" spoken="Coming soon"/);
  assert.match(tabs, /const Free = \(\) => <Chip label="FREE" spoken="Free to read"/);
  // the sample content never acts like real content: no data file has a handler either
  for (const f of ['sample.ts', 'bible/books.ts', 'books/catalog.ts']) assert.doesNotMatch(code(read(`${DIR}/${f}`)), /onPress|Pressable|onClick|=>\s*router/, f);
});

check('the banner of the Bible tab is ONE button for a screen reader (the gold pill is its look), it opens the daily reading, and the banner of the Books tab has no button because no book opens', () => {
  const src = code(read(`${DIR}/LibraryBanner.tsx`));
  assert.equal((src.match(/<Pressable\b/g) ?? []).length, 1, 'the card is the one Pressable; the gold pill inside it is a View');
  assert.match(src, /if \(!cta \|\| !onOpen\) return card;/, 'without a button the card is only a card');
  assert.match(src, /accessibilityRole="button"\s+accessibilityLabel=\{\[cta, title, line\]\.filter\(Boolean\)\.join\('\. '\)\}/, 'the label is the button\'s words, then the title and the date');
  assert.match(src, /onPress=\{onOpen\}/);
  assert.match(src, /export const DAILY_KICKER = 'Today · Daily reading';/);
  assert.match(src, /export const DAILY_TITLE = "Today's reading and a short reflection";/);
  assert.match(src, /export const DAILY_CTA = 'Read today';/);
  assert.match(src, /<LibraryBanner kicker=\{DAILY_KICKER\} title=\{DAILY_TITLE\} line=\{todayLine\(now\)\} icon="book" cta=\{DAILY_CTA\} onOpen=\{onOpen\} /);
  assert.match(src, /useFocusEffect\(useCallback\(\(\) => \{ setNow\(new Date\(\)\); \}, \[\]\)\);/, 'the date is read again whenever the Library comes into view');
  assert.match(src, /export const BOOKS_KICKER = 'Preview · Books';/);
  assert.match(src, /export const BOOKS_TITLE = 'Twelve free companions for the road';/);
  assert.match(src, /export const BOOKS_LINE = 'Classics to read on the way\. Free to read\.';/);
  assert.match(src, /<LibraryBanner kicker=\{BOOKS_KICKER\} title=\{BOOKS_TITLE\} line=\{BOOKS_LINE\} icon="library" \/>/, 'no cta, no onOpen');
  // the look of the promo banner of the design system, not a second invention (the same numbers as components/PromoBanner.tsx)
  const promo = code(read('src/components/PromoBanner.tsx'));
  for (const part of [
    'minHeight: 190, borderRadius: radius.xl, backgroundColor: role.inverse, padding: 24, overflow: \'hidden\', justifyContent: \'space-between\'',
    'position: \'absolute\', right: -36, bottom: -44, opacity: 0.9',
    'color={c.gold} size={200} strokeWidth={1.2} />',
    'fontFamily: fonts.title, fontSize: 28, lineHeight: 34, color: role.onInverse, maxWidth: 230',
    'height: 48, paddingHorizontal: 24, borderRadius: radius.pill, backgroundColor: c.gold',
    'color={role.onHighlight}',
    'color={role.onInverseAccent} style={{ textTransform: \'uppercase\', letterSpacing: 1.5 }}',
  ]) {
    assert.ok(promo.includes(part), `PromoBanner.tsx no longer has: ${part}`);
    assert.ok(src.includes(part), `the Library banner has drifted from the promo banner: ${part}`);
  }
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b|\bfixed\./, 'colours are roles and the gold, never a literal');
});

check('the three choices at the bottom of the Bible tab: radio buttons in a radio group (not tabs), checked state for web and phone, a label each, never under 44, roles for every colour', () => {
  const src = code(read(`${DIR}/bible/TestamentBar.tsx`));
  assert.match(src, /accessibilityRole="radiogroup"\s+accessibilityLabel="Part of the Bible"/);
  assert.match(src, /accessibilityRole="radio"\s+accessibilityState=\{\{ checked: on \}\}\s+aria-checked=\{on\}\s+accessibilityLabel=\{TESTAMENT_LABEL\[t\]\}\s+onPress=\{\(\) => onChange\(t\)\}/);
  assert.doesNotMatch(src, /accessibilityRole="tab"|role="tab"/, 'the real tab bar is the only "tab" on the screen (the web smoke counts them)');
  assert.match(src, /\{TESTAMENTS\.map\(\(t\) => \{/, 'one choice for each part, in the order of the parts');
  assert.match(src, /export const BAR_DRAWN: Record<Testament, string> = \{ old: 'Old\\nTestament', deutero: 'Deuterocanon', new: 'New\\nTestament' \};/);
  assert.match(src, /\{BAR_DRAWN\[t\]\}<\/AppText>/);
  // size: 56 high with 3 of padding and a border of 1 is a choice 48 high; the middle one keeps its own width, the others share the rest
  const height = Number(/export const BAR_HEIGHT = (\d+);/.exec(src)?.[1]);
  const padding = Number(/gap: 2, padding: (\d+)/.exec(src)?.[1]);
  const border = Number(/borderWidth: (\d+), borderColor: role\.border/.exec(src)?.[1]);
  assert.ok(height - 2 * padding - 2 * border >= 44, `a choice is ${height - 2 * padding - 2 * border} high`);
  assert.match(src, /flexGrow: t === 'deutero' \? 0 : 1, flexShrink: t === 'deutero' \? 0 : 1, flexBasis: t === 'deutero' \? 'auto' : 0/);
  assert.match(src, /export const BAR_ROOM = BAR_HEIGHT;/);
  // colours: roles only
  assert.match(src, /backgroundColor: on \? role\.action : 'transparent'/);
  assert.match(src, /color: on \? role\.onAction : role\.text/);
  assert.match(src, /backgroundColor: role\.surface, borderWidth: 1, borderColor: role\.border/);
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b|\bfixed\.|\bc\.[a-z]/, 'colours are theme roles, never a literal, the fixed palette or a palette colour');
  // it sits where the tab bar says: the same numbers as the tab bar and the gold pen (components/TabBar.tsx, components/Fab.tsx)
  const bar = read('src/components/TabBar.tsx');
  const fab = read('src/components/Fab.tsx');
  assert.match(bar, /Math\.max\(insets\.bottom - 14, 10\)/);
  assert.match(bar, /height: 88/);
  assert.match(src, /bottom: Math\.max\(insets\.bottom - 14, 10\) \+ 88 \+ 8/);
  assert.match(fab, /Math\.max\(insets\.bottom - 14, 10\) \+ 88 \+ 8/);
  // on a phone narrower than the search field's own limit the bar keeps 12 from the edges, so that the three labels fit down to 320
  assert.match(src, /BAR_NARROW_UNDER = 352;/);
  assert.match(code(read(`${DIR}/SearchBar.tsx`)), /NARROW_UNDER = 352;/);
  assert.match(src, /const edge = narrow \? 12 : layout\.screenMargin;/);
});

check('Library bookmarks are kept only on the phone, per person, under a u.<userId>. key, which logging out wipes', () => {
  const hook = code(read(`${DIR}/useLibraryBookmarks.ts`));
  assert.match(hook, /const key = uid \? userKey\(uid, BOOKMARKS_NAME\) : null;/);
  assert.match(hook, /localStore\.getJSON<unknown>\(key\)/);
  assert.match(hook, /localStore\.setJSON\(key, packBookmarks\(next\.list\)\)/);
  assert.doesNotMatch(hook, /supabase|lib\/api|lib\/net|fetch\(/, 'a bookmark of a Library row never leaves the phone');
  assert.match(read(`${DIR}/bookmarks.ts`), /export const BOOKMARKS_NAME = 'library\.bookmarks';/);
  assert.match(read(`${DIR}/savedPosts.ts`), /export const SAVED_COPY_NAME = 'library\.savedPosts';/);
  const store = read('src/lib/localStore.ts');
  assert.match(store, /export const userKey = \(uid: string, name: string\) => `u\.\$\{uid\}\.\$\{name\}`;/);
  assert.match(store, /export const clearUserData = \(uid: string\) => localStore\.removeByPrefix\(`u\.\$\{uid\}\.`\);/);
  assert.match(read('src/lib/auth.tsx'), /await clearUserData\(uid\);/, 'signing out wipes every u.<userId>. key');
});

check('the list is read again when the screen comes back, and a tap before it was read, or a write that failed, never writes over what is saved', () => {
  const hook = code(read(`${DIR}/useLibraryBookmarks.ts`));
  assert.match(hook, /useFocusEffect\(/);
  assert.match(hook, /if \(!key \|\| !cur \|\| cur\.key !== key\) return;/, 'ignored until the list for this person was read');
  assert.match(hook, /parseBookmarks\(raw\) \?\? \[\]/, 'a list that does not read is an empty one');
  assert.match(hook, /if \(ok\) \{ setFailed\(false\); return; \}/);
  assert.match(hook, /latest\.current = \{ \.\.\.next, list: cur\.list \}/, 'a failed write is undone');
  assert.match(hook, /setFailed\(true\)/);
});

check('bookmarked posts: the three reads come from one place, the real client is handed in by client.ts only, and nothing else in the feature touches post_saves', () => {
  assert.match(read(`${DIR}/client.ts`), /makeSavedPostsApi\(supabase as unknown as SavedPostsClient, \{ assertOnline, isOffline: isOfflineError, message: errorMessage \}\)/);
  const offenders: string[] = [];
  for (const f of featureFiles) {
    const src = code(read(f));
    if (/from '(\.\.\/)*(@\/|)lib\/supabase'|from '@\/lib\/supabase'/.test(src) && !f.endsWith('client.ts')) offenders.push(`${f}: imports the client`);
    if (/post_saves/.test(src) && !f.endsWith('savedPosts.ts')) offenders.push(`${f}: names post_saves`);
  }
  assert.deepEqual(offenders, []);
  const hook = code(read(`${DIR}/useSavedPosts.ts`));
  assert.match(hook, /import \{ savePost, unsavePost \} from '@\/lib\/api';/, 'a bookmark is put back and taken off by the calls the journey viewer makes');
  assert.match(hook, /commit: \(on\) => \(on \? savePost : unsavePost\)\(uid, post\.id\)/);
  assert.match(hook, /before: assertOnline,/, 'offline nothing changes and it says so');
  assert.match(hook, /optimisticToggle\(\{/);
  assert.match(hook, /if \(res\.ok\) \{[\s\S]*packSavedPosts\(kept, Date\.now\(\)\)/, 'the saved copy follows a change that went through');
  assert.match(hook, /setNotice\(changeFailure\(res\.error\)\)/);
  assert.match(hook, /userKey\(uid, SAVED_COPY_NAME\)/, 'the copy of the last visit is per person, under a u.<userId>. key');
  assert.match(hook, /parseSavedCopy\(await localStore\.getJSON<unknown>\(userKey\(uid, SAVED_COPY_NAME\)\)\)/);
  assert.match(hook, /useFocusEffect\(/, 'refreshed every time the screen comes into view');
});

check('the Bookmarks screen: nothing is said about the Library part before it is read, every state of the Posts part has its words, and a post card cannot be pressed', () => {
  const src = code(read('app/library/bookmarks.tsx'));
  assert.match(src, /\) : marks\.ready && \(\s*<Card><AppText variant="small" muted>\{LIBRARY_BOOKMARKS_EMPTY\}<\/AppText><\/Card>/, 'no "nothing bookmarked" while the list is still being read');
  for (const view of ['loading', 'offline-empty', 'failed-empty', 'empty', 'list']) assert.match(src, new RegExp(`saved\\.view === '${view}'`), `the ${view} state is drawn`);
  assert.match(src, /saved\.offlineNote && <FormMessage tone="info">\{SAVED_OFFLINE_NOTE\}<\/FormMessage>/);
  assert.match(src, /saved\.failedNote && <FormMessage>\{SAVED_FAILED\}<\/FormMessage>/);
  assert.match(src, /!!saved\.notice && <FormMessage>\{saved\.notice\}<\/FormMessage>/);
  assert.match(src, /marks\.failed && <FormMessage>\{BOOKMARK_NOT_SAVED\}<\/FormMessage>/);
  assert.match(src, /const hits = useMemo\(\(\) => hitsForKeys\(marks\.shown\), \[marks\.shown\]\);/, 'a row taken off stays until the screen is left');
  assert.match(src, /<ActivityIndicator accessibilityLabel="Loading your bookmarked posts"/);
  const card = code(read(`${DIR}/SavedPostCard.tsx`));
  assert.doesNotMatch(card, /onPress|Pressable/, 'there is no screen for one post yet: the card shows what was kept');
  assert.match(card, /<BookmarkToggle on=\{on\} title=\{heading\} toggle=\{toggle\} \/>/);
});

check('every button of the feature has a label for a screen reader, and the search says what it is typed into', () => {
  for (const f of featureFiles) {
    const src = code(read(f));
    for (const m of src.matchAll(/<Pressable\b/g)) assert.match(src.slice(m.index, (m.index ?? 0) + 400), /accessibilityLabel=/, `${f}: a Pressable without a label`);
    for (const m of src.matchAll(/<IconButton\b/g)) assert.match(src.slice(m.index, (m.index ?? 0) + 200), /\blabel="/, `${f}: an IconButton without a label`);
  }
  assert.match(code(read(`${DIR}/SearchResults.tsx`)), /accessibilityLiveRegion="polite"/, 'the number of results is said as the list narrows');
});

check('the feature uses no console, no interval and no StyleSheet.create (colours are read while drawing, so dark mode follows)', () => {
  const offenders: string[] = [];
  for (const f of featureFiles) {
    code(read(f)).split('\n').forEach((line, i) => {
      if (/\bconsole\.|StyleSheet\.create|\bsetInterval\(/.test(line)) offenders.push(`${f}:${i + 1}  ${line.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(offenders, []);
});

check('the Notes tab and the daily reading are plugged in here and built elsewhere: the screen draws NotesTab as the third tab, with no banner, and the banner opens /library/daily', () => {
  const screen = code(read('app/(tabs)/library.tsx'));
  assert.match(screen, /import \{ NotesTab \} from '@\/features\/library\/notes\/NotesTab';/);
  assert.match(screen, /\{tab === 'Notes' && <NotesTab \/>\}/, 'no props, and nothing before it: the notes start right under the tabs');
  assert.doesNotMatch(screen, /<NotesTab\s[^>]*\w+=/, 'NotesTab takes no props');
  assert.doesNotMatch(screen, /tab === 'Notes' && <(?:DailyBanner|BooksBanner|LibraryBanner)/, 'Notes has no banner');
  assert.match(screen, /<DailyBanner onOpen=\{\(\) => router\.push\('\/library\/daily'\)\} \/>/);
  assert.ok(fs.existsSync(path.join(root, 'src/features/library/notes/NotesTab.tsx')), 'the file of the Notes tab is there (a placeholder until the real one is merged)');
  assert.match(read('src/features/library/notes/NotesTab.tsx'), /export function NotesTab\(\)/);
  assert.ok(fs.existsSync(path.join(root, 'app/library/daily.tsx')), 'the route /library/daily is a file (a placeholder until the real screen is merged)');
  assert.match(read('app/library/daily.tsx'), /export default function /);
});

check('there is no Music left: not a tab, not a notice, not a group of the search or of Bookmarks, not a playlist row', () => {
  const offenders: string[] = [];
  for (const f of [...featureFiles, 'app/(tabs)/library.tsx']) {
    code(read(f)).split('\n').forEach((line, i) => {
      if (/music|playlist/i.test(line)) offenders.push(`${f}:${i + 1}  ${line.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(offenders, []);
});

check('the Bookmarks screen groups the Library rows by tab with the same component as the search (Bible, then Books), and says how to bookmark when nothing current is kept', () => {
  const src = code(read('app/library/bookmarks.tsx'));
  assert.match(src, /<LibraryGroups hits=\{hits\} marks=\{marks\} \/>/);
  assert.match(src, /hitCount\(hits\) > 0 \? \(/);
  assert.match(src, /LIBRARY_BOOKMARKS_EMPTY/);
  const tabs = code(read(`${DIR}/LibraryTabs.tsx`));
  assert.match(tabs, /\{hitTabs\(hits\)\.map\(\(tab\) => \(/, 'a tab that has no row in it is not drawn');
  assert.match(code(read(`${DIR}/search.ts`)), /export const hitTabs = \(h: Hits\): SampleTab\[\] => SAMPLE_TABS\.filter\(\(t\) => h\[t\]\.length > 0\);/);
});

console.log(`${n} of ${n} passed`);
