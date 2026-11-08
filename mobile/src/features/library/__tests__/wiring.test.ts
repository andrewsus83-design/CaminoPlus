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

const DIR = 'src/features/library';
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of fs.readdirSync(path.join(root, dir))) {
    const rel = `${dir}/${name}`;
    if (fs.statSync(path.join(root, rel)).isDirectory()) { if (name !== '__tests__') out.push(...walk(rel)); } else if (/\.tsx?$/.test(name)) out.push(rel);
  }
  return out;
}
const featureFiles = [...walk(DIR), ...walk('app/library')];

check('the feature is the files this test expects, so a new one is looked at (and the scan below sees all of them)', () => {
  assert.deepEqual([...featureFiles].sort(), [
    'BookShelf.tsx', 'BookText.tsx', 'BookmarkToggle.tsx', 'LibraryHeader.tsx', 'LibraryTabs.tsx', 'NotHere.tsx', 'PlaceRows.tsx', 'ReaderBlock.tsx', 'ReflectionCard.tsx', 'SavedPostCard.tsx', 'SearchBar.tsx', 'SearchResults.tsx',
    'bookBundle.ts', 'bookmarks.ts', 'books.ts', 'client.ts', 'places.ts', 'reading.ts', 'sample.ts', 'savedPosts.ts', 'search.ts', 'useBook.ts', 'useLibraryBookmarks.ts', 'useReadingPlaces.ts', 'useSavedPosts.ts',
  ].map((f) => `${DIR}/${f}`).concat(['app/library/bookmarks.tsx', 'app/library/notes.tsx', 'app/library/book/[id]/index.tsx', 'app/library/book/[id]/[chapter].tsx']).sort());
});

check('no new native module: the feature imports React, React Native, expo-router and the app\'s own files, nothing else', () => {
  const allowed = /^(react|react-native|expo-router)$|^\.{1,2}\/|^@\//;
  const offenders: string[] = [];
  for (const f of featureFiles) {
    for (const m of read(f).matchAll(/^import [^;]*? from '([^']+)';/gm)) if (!allowed.test(m[1])) offenders.push(`${f}: ${m[1]}`);
  }
  assert.deepEqual(offenders, []);
});

check('a row of the examples has no press handler of its own, and the bookmark button is the one thing on it that can be pressed; a real book\'s cover is a button that opens the book, with the bookmark button beside it, not inside it', () => {
  const tabs = code(read(`${DIR}/LibraryTabs.tsx`));
  assert.doesNotMatch(tabs, /onPress|Pressable|onClick/);
  assert.match(tabs, /import \{ BookmarkToggle \} from '\.\/BookmarkToggle';/);
  assert.match(tabs, /<BookmarkToggle on=\{marks\.has\(key\)\} title=\{title\} toggle=\{\(\) => marks\.toggle\(key\)\} color=\{color\} \/>/);
  // an example row is bookmarked under the key of its own tab: the Bible rows under "bible:", the playlists under "music:"
  assert.match(tabs, /<Mark marks=\{marks\} tab="Bible" id=\{s\.id\} title=\{s\.title\} \/>/);
  assert.match(tabs, /<Mark marks=\{marks\} tab="Music" id=\{p\.id\} title=\{p\.title\} \/>/);
  assert.match(tabs, /const key = itemKey\(tab, id\);/);
  assert.doesNotMatch(tabs, /<Mark marks=\{marks\} tab="Books"/, 'the covers of the books are not example rows any more');
  // every row of every tab is drawn by the tab and by the results with the same three components
  assert.match(tabs, /\{tab === 'Bible' && <BibleShelves items=\{hits\.Bible\} marks=\{marks\} \/>\}/);
  assert.match(tabs, /\{tab === 'Books' && <BookCovers items=\{hits\.Books\} marks=\{marks\} \/>\}/);
  assert.match(tabs, /\{tab === 'Music' && <PlaylistRows items=\{hits\.Music\} marks=\{marks\} \/>\}/);
  assert.match(tabs, /<BibleShelves items=\{SAMPLE_SHELVES\} marks=\{marks\} \/>/);
  assert.match(tabs, /<BookCovers items=\{books\} marks=\{marks\} \/>/, 'the Books tab shows the books it is given, which are the books of the bundle');
  assert.match(tabs, /<PlaylistRows items=\{SAMPLE_PLAYLISTS\} marks=\{marks\} \/>/);
  assert.match(tabs, /import \{ BookCovers \} from '\.\/BookShelf';/);
  assert.doesNotMatch(tabs, /SAMPLE_BOOKS/, 'there are no example books any more');
  // the Books tab has no Preview notice: nothing on it is an example. The Bible and Music tabs have theirs.
  assert.doesNotMatch(tabs, /<Notice tab="Books" \/>/);
  for (const t of ['Bible', 'Music']) assert.match(tabs, new RegExp(`<Notice tab="${t}" />`), `the ${t} tab starts with its notice`);
  // the covers
  const shelf = code(read(`${DIR}/BookShelf.tsx`));
  assert.equal((shelf.match(/<Pressable\b/g) ?? []).length, 1, 'one button on a cover: the one that opens the book');
  assert.match(shelf, /accessibilityLabel=\{`\$\{b\.title\}\. \$\{b\.kind\}`\}/);
  assert.match(shelf, /accessibilityHint="Opens the book"/);
  assert.match(shelf, /onPress=\{\(\) => router\.push\(bookRoute\(b\.id\)\)\}/);
  assert.match(shelf, /export const bookRoute = \(id: string\) => `\/library\/book\/\$\{id\}`;/);
  assert.match(shelf, /const key = itemKey\('Books', b\.id\);/);
  assert.match(shelf, /<BookmarkToggle on=\{marks\.has\(key\)\} title=\{b\.title\} toggle=\{\(\) => marks\.toggle\(key\)\} color=\{fixed\.blue\} \/>/);
  assert.match(shelf, /position: 'absolute', top: 4, right: 4/, 'the bookmark button sits over the corner of the cover, as a sibling of the cover\'s own button');
  assert.match(shelf, /backgroundColor: fixed\[b\.colour\]/, 'a cover is a picture colour that does not change with light and dark');
  assert.match(shelf, /aspectRatio: 3 \/ 4/);
  assert.match(shelf, /const size = coverTitleSize\(title, room\);/, 'a long word never breaks in the middle on a narrow phone');
  assert.match(shelf, /unbreakableCaption\(b\.kind\)/);
  const toggle = code(read(`${DIR}/BookmarkToggle.tsx`));
  assert.match(toggle, /bookmarkLabel = \(on: boolean, title: string\) => `\$\{on \? 'Remove bookmark' : 'Bookmark'\}: \$\{title\}`/);
  assert.match(toggle, /accessibilityLabel=\{bookmarkLabel\(on, title\)\}/);
  assert.match(toggle, /accessibilityRole="button"/);
  assert.match(toggle, /width: 44, height: 44/);
});

check('the Books tab is the books of the bundle, in the catalog order; the Library screen hands them to the tab, to the search and nothing else is a book', () => {
  const screen = code(read('app/(tabs)/library.tsx'));
  assert.match(screen, /import \{ CATALOG \} from '@\/features\/library\/bookBundle';/);
  assert.match(screen, /const books = useMemo\(\(\) => libraryBooks\(CATALOG\), \[\]\);/);
  assert.match(screen, /\{tab === 'Books' && <BooksTab books=\{books\} marks=\{marks\} \/>\}/);
  assert.match(screen, /<SearchResults query=\{query\} books=\{books\} marks=\{marks\} onClear=\{\(\) => setQuery\(''\)\} \/>/);
  const tabs = code(read(`${DIR}/LibraryTabs.tsx`));
  assert.match(tabs, /booksLine = \(n: number\) => `\$\{n\} \$\{n === 1 \? 'book' : 'books'\} in the app\. They are saved on this phone, so they read without a signal\.`;/, 'said of what is true: the books are in the bundle');
  assert.match(tabs, /BOOKS_NONE = 'No books are in this version of the app yet\.'/);
  // nothing says Preview or example about the books any more: not the banner, not the tab
  assert.doesNotMatch(screen, /eyebrow: 'Preview · Books'/);
  assert.match(screen, /eyebrow: 'Books', title: 'Guides and readings for the Way'/);
  assert.match(screen, /eyebrow: 'Preview · Bible'/);
  assert.match(screen, /eyebrow: 'Preview · Music'/);
  assert.match(code(read(`${DIR}/sample.ts`)), /PREVIEW_NOTICE: Record<ExampleTab, string>/);
});

check('the search says "example" only while an example is in the results: its notice is a function of the tabs that have results, and nothing found has none', () => {
  const src = code(read(`${DIR}/SearchResults.tsx`));
  assert.match(src, /const notice = searchNotice\(hitTabs\(found\.hits\)\);/);
  assert.match(src, /\{!!notice && <SampleNotice title="Preview">\{notice\}<\/SampleNotice>\}/);
  assert.match(src, /searchLibrary\(query, books\)/);
  assert.doesNotMatch(src, /SEARCH_NOTICE/);
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

check('the Bookmarks screen: nothing is said about the Library part before it is read, the examples notice shows only while an example is on it, books, chapters and paragraphs are listed and open at their place, every state of the Posts part has its words, and a post card cannot be pressed', () => {
  const src = code(read('app/library/bookmarks.tsx'));
  assert.match(src, /\) : marks\.ready && \(\s*<Card><AppText variant="small" muted>\{LIBRARY_BOOKMARKS_EMPTY\}<\/AppText><\/Card>/, 'no "nothing bookmarked" while the list is still being read');
  assert.match(src, /\{hitCount\(hits\) > 0 \|\| places\.length > 0 \? \(/, 'something kept in the Library: the books, the places in them, the examples');
  assert.match(src, /const notice = bookmarksNotice\(hitTabs\(hits\)\);/);
  assert.match(src, /\{!!notice && <SampleNotice title="Preview">\{notice\}<\/SampleNotice>\}/, 'the examples notice is only for Bible and Music rows on the screen');
  assert.doesNotMatch(src, /BOOKMARKS_NOTICE/);
  assert.match(src, /<AppText variant="caption" muted>\{BOOKMARKS_PRIVATE_LINE\}<\/AppText>/, 'where the bookmarks are and what clears them, whatever is kept');
  assert.match(src, /const places = useMemo\(\(\) => bookPlaces\(marks\.shown, CATALOG, readBook\), \[marks\.shown\]\);/);
  assert.match(src, /<PlaceRows places=\{places\} marks=\{marks\} \/>/);
  assert.match(src, /const readBook = \(id: string\): BookContent \| null => \{ try \{ return loadBookContent\(id\); \} catch \{ return null; \} \};/, 'a book that cannot be read has no paragraph to show, and never stops the screen');
  for (const view of ['loading', 'offline-empty', 'failed-empty', 'empty', 'list']) assert.match(src, new RegExp(`saved\\.view === '${view}'`), `the ${view} state is drawn`);
  assert.match(src, /saved\.offlineNote && <FormMessage tone="info">\{SAVED_OFFLINE_NOTE\}<\/FormMessage>/);
  assert.match(src, /saved\.failedNote && <FormMessage>\{SAVED_FAILED\}<\/FormMessage>/);
  assert.match(src, /!!saved\.notice && <FormMessage>\{saved\.notice\}<\/FormMessage>/);
  assert.match(src, /marks\.failed && <FormMessage>\{BOOKMARK_NOT_SAVED\}<\/FormMessage>/);
  assert.match(src, /const hits = useMemo\(\(\) => hitsForKeys\(marks\.shown, books\), \[marks\.shown, books\]\);/, 'a row taken off stays until the screen is left');
  assert.match(src, /<ActivityIndicator accessibilityLabel="Loading your bookmarked posts"/);
  const card = code(read(`${DIR}/SavedPostCard.tsx`));
  assert.doesNotMatch(card, /onPress|Pressable/, 'there is no screen for one post yet: the card shows what was kept');
  assert.match(card, /<BookmarkToggle on=\{on\} title=\{heading\} toggle=\{toggle\} \/>/);
  // a place in a book opens the exact place in the reader; its bookmark button is a button of its own beside the row's
  const rows = code(read(`${DIR}/PlaceRows.tsx`));
  assert.match(rows, /export const placeRoute = \(p: Pick<BookPlace, 'bookId' \| 'chapterId' \| 'block'>\) => `\/library\/book\/\$\{p\.bookId\}\/\$\{p\.chapterId\}\$\{p\.block === null \? '' : `\?block=\$\{p\.block\}`\}`;/);
  assert.match(rows, /onPress=\{\(\) => router\.push\(placeRoute\(p\)\)\}/);
  assert.match(rows, /<BookmarkToggle on=\{marks\.has\(p\.key\)\} title=\{p\.title\} toggle=\{\(\) => marks\.toggle\(p\.key\)\} \/>/);
  assert.equal((rows.match(/<Pressable\b/g) ?? []).length, 1);
});

check('the book screen: Continue reading goes to the place that was read last, the chapters open the reader, the bookmark is the book\'s anchor, and the credit, the rights and the AI disclosure are drawn exactly as the bundle has them', () => {
  const src = code(read('app/library/book/[id]/index.tsx'));
  assert.match(src, /const open = useBook\(id\);/);
  assert.match(src, /if \(!open\) return <NotHere title="This book is not here"/, 'a book that is not there is a calm page, not an error');
  assert.match(src, /const resume = resumePoint\(book, reading\.places\);/);
  assert.match(src, /label=\{resume\.resumed \? 'Continue reading' : 'Start reading'\} onPress=\{\(\) => go\(resume\.chapterId\)\}/);
  assert.match(src, /const go = \(chapterId: string\) => router\.push\(`\/library\/book\/\$\{book\.id\}\/\$\{chapterId\}`\);/);
  assert.match(src, /const bookKey = itemKey\('Books', book\.id\);/);
  assert.match(src, /<BookmarkToggle on=\{marks\.has\(bookKey\)\} title=\{book\.title\} toggle=\{\(\) => marks\.toggle\(bookKey\)\} color=\{fixed\.blue\} \/>/);
  assert.match(src, /\{creditLine\(content\)\}/);
  assert.match(src, /\{content\.rights\}/);
  assert.match(src, /\{content\.ai_disclosure\}/);
  assert.match(src, /\{bookLine\(book\)\}/);
  assert.match(src, /\{book\.description\}/);
  assert.match(src, /formatMinutes\(ch\.minutes\)/);
  assert.match(src, /backgroundColor: fixed\[book\.cover\.colour\]/);
  const hook = code(read(`${DIR}/useBook.ts`));
  assert.match(hook, /try \{\s*const content = loadBookContent\(book\.id\);/, 'the text of a book is read when it is opened, and a book that cannot be read is "not here"');
  const places = code(read(`${DIR}/useReadingPlaces.ts`));
  assert.match(places, /const key = uid \? userKey\(uid, READING_NAME\) : null;/);
  assert.match(places, /if \(!key \|\| !cur \|\| cur\.key !== key\) return;/, 'ignored until the places for this person were read');
  assert.match(places, /useFocusEffect\(/);
  assert.doesNotMatch(places, /supabase|lib\/api|lib\/net|fetch\(/, 'where a pilgrim is in a book never leaves the phone');
});

check('the reader draws what a book is made of, with the app\'s own text styles and colours read while drawing, links to the web only through the phone\'s browser, and every paragraph a note or a bookmark can be on', () => {
  const text = code(read(`${DIR}/BookText.tsx`));
  for (const kind of ["'h'", "'p'", "'ul'", "'ol'", "'quote'", "'hr'"]) assert.match(text, new RegExp(`case ${kind}:`), `a block of kind ${kind} is drawn`);
  assert.match(text, /\{!!block\.cite && block\.cite\.length > 0 && \(/, 'a quote shows its attribution');
  assert.match(text, /s\.b && s\.i/);
  assert.match(text, /accessibilityRole="link" onPress=\{\(\) => open\(s\.href as string\)\}/);
  assert.match(text, /Linking\.openURL\(href\)\.catch\(\(\) => undefined\)/, 'a link that cannot open says nothing and breaks nothing');
  assert.match(text, /export const READING = \{ fontSize: 19, lineHeight: 30 \} as const;/);
  assert.match(text, /import \{ BOLD_ITALIC_FACE, ITALIC_FACE \} from '@\/components\/ItalicFaces';/);
  assert.match(text, /overflowWrap: 'anywhere'/, 'a very long word breaks instead of pushing the page wider');
  assert.doesNotMatch(text, /dangerouslySetInnerHTML|WebView|\.html\b/);
  const reader = code(read('app/library/book/[id]/[chapter].tsx'));
  assert.match(reader, /<Screen tabBar=\{false\} scroll=\{false\} margin=\{0\}>/, 'the text scrolls edge to edge, with the way back and the bookmark of the chapter staying on top');
  assert.match(reader, /<IconButton name="back" label="Back" onPress=\{goBack\} \/>/);
  assert.match(reader, /<BookmarkToggle on=\{marks\.has\(chapterKey\)\} title=\{chapter\.title\} toggle=\{\(\) => marks\.toggle\(chapterKey\)\} \/>/);
  assert.match(reader, /const chapterKey = chapterAnchor\(book\.id, chapter\.id\);/);
  assert.match(reader, /bookmarked=\{marks\.has\(key\)\}/);
  assert.match(reader, /onBookmark=\{\(\) => marks\.toggle\(key\)\}/);
  assert.match(reader, /const nav = \(id: string\) => router\.replace\(`\/library\/book\/\$\{book\.id\}\/\$\{id\}`\);/, 'next and previous replace the chapter, so Back still returns to the book');
  assert.match(reader, /accessibilityLabel=\{`\$\{next \? 'Next' : 'Previous'\}: \$\{title\}`\}/);
  assert.match(reader, /minHeight: 68/);
  assert.match(reader, /if \(!chapter\) return <NotHere title="This chapter is not here"/);
  assert.match(reader, /Number\.isInteger\(block\) && block >= 0 && block < chapter\.blocks\.length \? block : null/, 'a block that is not in the chapter is no place to scroll to');
  const part = code(read(`${DIR}/ReaderBlock.tsx`));
  assert.match(part, /blockLabel = \(text: string, notes: number, bookmarked: boolean\): string =>/);
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
