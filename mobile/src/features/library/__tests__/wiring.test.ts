// Source-level checks of how the Library search and Bookmarks are wired into the app, in the style of the diary's wiring test: they
// read the files, nothing is run. What the pure parts do is checked in library.test.ts; here it is that the screens use them the way
// they must (a row keeps its key, a bookmark is cleared when the person logs out, a post is bookmarked only through the calls the
// journey viewer makes, every button has a label, nothing needs a new native module). Run: npm run test:library
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };
const root = process.cwd(); // npm test runs from mobile/
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const code = (src: string) => src.split('\n').filter((l) => !/^\s*(\/\/|\/?\*)/.test(l)).join('\n'); // without comment lines
import './notes.test'; // the Notes tab (src/features/library/notes): its logic and its wiring, run here so no script has to name it

const DIR = 'src/features/library';
const featureFiles = [
  ...fs.readdirSync(path.join(root, DIR)).filter((f) => /\.tsx?$/.test(f)).map((f) => `${DIR}/${f}`),
  ...fs.readdirSync(path.join(root, 'app/library')).map((f) => `app/library/${f}`),
];

check('the feature is the files this test expects, so a new one is looked at (and the scan below sees all of them)', () => {
  const names = featureFiles.map((f) => path.basename(f)).sort();
  assert.deepEqual(names, [
    'BookmarkToggle.tsx', 'LibraryHeader.tsx', 'LibraryTabs.tsx', 'SavedPostCard.tsx', 'SearchBar.tsx', 'SearchResults.tsx', 'bookmarks.tsx', 'bookmarks.ts', 'client.ts',
    'sample.ts', 'savedPosts.ts', 'search.ts', 'useLibraryBookmarks.ts', 'useSavedPosts.ts',
  ].sort());
});

check('no new native module: the feature imports React, React Native, expo-router and the app\'s own files, nothing else', () => {
  const allowed = /^(react|react-native|expo-router)$|^\.{1,2}\/|^@\//;
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
  // a row is bookmarked under the key of its own tab: the Bible rows under "bible:", the covers under "books:", the playlists under "music:"
  assert.match(tabs, /<Mark marks=\{marks\} tab="Bible" id=\{s\.id\} title=\{s\.title\} \/>/);
  assert.match(tabs, /<Mark marks=\{marks\} tab="Books" id=\{b\.id\} title=\{b\.title\} color=\{fixed\.blue\} \/>/);
  assert.match(tabs, /<Mark marks=\{marks\} tab="Music" id=\{p\.id\} title=\{p\.title\} \/>/);
  assert.match(tabs, /const key = itemKey\(tab, id\);/);
  // every example of every tab is drawn by the tab and by the results with the same three components
  assert.match(tabs, /\{tab === 'Bible' && <BibleShelves items=\{hits\.Bible\} marks=\{marks\} \/>\}/);
  assert.match(tabs, /\{tab === 'Books' && <BookCovers items=\{hits\.Books\} marks=\{marks\} \/>\}/);
  assert.match(tabs, /\{tab === 'Music' && <PlaylistRows items=\{hits\.Music\} marks=\{marks\} \/>\}/);
  assert.match(tabs, /<BibleShelves items=\{SAMPLE_SHELVES\} marks=\{marks\} \/>/);
  assert.match(tabs, /<BookCovers items=\{SAMPLE_BOOKS\} marks=\{marks\} \/>/);
  assert.match(tabs, /<PlaylistRows items=\{SAMPLE_PLAYLISTS\} marks=\{marks\} \/>/);
  const toggle = code(read(`${DIR}/BookmarkToggle.tsx`));
  assert.match(toggle, /bookmarkLabel = \(on: boolean, title: string\) => `\$\{on \? 'Remove bookmark' : 'Bookmark'\}: \$\{title\}`/);
  assert.match(toggle, /accessibilityLabel=\{bookmarkLabel\(on, title\)\}/);
  assert.match(toggle, /accessibilityRole="button"/);
  assert.match(toggle, /width: 44, height: 44/);
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

console.log(`${n} of ${n} passed`);
