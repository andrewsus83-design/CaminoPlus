// Source-level checks of how the Library (its tabs, search and Bookmarks) is wired into the app, in the style of the diary's wiring test:
// they read the files, nothing is run. What the pure parts do is checked in library.test.ts, bible.test.ts, reader.test.ts and books.test.ts; here it is
// that the screens use them the way they must (a row keeps its key, a bookmark is cleared when the person logs out, a post is bookmarked
// only through the calls the journey viewer makes, the rows of the example books cannot be pressed and the few things that can have a label and a state,
// nothing needs a new native module). The Notes tab (features/library/notes) and the daily reading (features/library/daily,
// app/library/daily.tsx) belong to their own features and their own tests: only the way they are plugged in is checked here. The Bible
// screens (the grid of books, the chapters, the reader) are checked in readerWiring.test.ts, which runs from here.
// Run: npm run test:library
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };
const root = process.cwd(); // npm test runs from mobile/
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const code = (src: string) => src.split('\n').filter((l) => !/^\s*(\/\/|\/?\*)/.test(l)).join('\n'); // without comment lines
import './notes.test'; // the Notes tab (src/features/library/notes): its logic and its wiring, run here so no script has to name it
import './readerWiring.test'; // the Bible screens: the book grid, the chapters, the reader, the search of verses
import './booksWiring.test'; // the Books screens: the covers, the banner, the book page, the reader and the places kept on the phone
import './continueBarWiring.test'; // the Continue reading bar above the tab bar: one bar, one mount, its two buttons, its colours, its place, no card left in the pages

const DIR = 'src/features/library';
// The files of this feature: the folder itself, the Bible and Books folders, and the screens of app/library (the Bible screens too). Not notes/ and daily/,
// nor app/library/daily.tsx: the Notes tab and the daily reading are other features with their own tests. The files that bring the text itself in (text.ts,
// searchText.ts and what the importer generates for them) are scanned like the rest; what they do is checked in bibletext.test.ts and searchtext.test.ts.
const OWN_FOLDERS = ['', 'bible/', 'books/'];
const sourcesIn = (dir: string) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).filter((f) => f.isFile() && /\.tsx?$/.test(f.name)).map((f) => `${dir}/${f.name}`);
const featureFiles = [
  ...OWN_FOLDERS.flatMap((sub) => sourcesIn(`${DIR}/${sub}`.replace(/\/$/, ''))),
  ...sourcesIn('app/library').filter((f) => !path.basename(f).startsWith('daily')),
  ...sourcesIn('app/library/bible/[code]'),
  ...sourcesIn('app/library/book/[id]'),
];

check('the feature is the files this test expects, so a new one is looked at (and the scan below sees all of them)', () => {
  assert.deepEqual([...featureFiles].sort(), [
    'app/library/bible/[code]/[chapter].tsx', 'app/library/bible/[code]/index.tsx', 'app/library/book/[id]/index.tsx', 'app/library/book/[id]/read.tsx', 'app/library/bookmarks.tsx',
    `${DIR}/BookmarkToggle.tsx`, `${DIR}/LibraryBanner.tsx`, `${DIR}/LibraryHeader.tsx`, `${DIR}/LibraryTabs.tsx`, `${DIR}/SavedPostCard.tsx`, `${DIR}/SearchBar.tsx`,
    `${DIR}/SearchResults.tsx`, `${DIR}/bookmarks.ts`, `${DIR}/client.ts`, `${DIR}/sample.ts`, `${DIR}/savedPosts.ts`, `${DIR}/search.ts`, `${DIR}/useLibraryBookmarks.ts`,
    `${DIR}/useSavedPosts.ts`,
    `${DIR}/bible/BookGrid.tsx`, `${DIR}/bible/ChapterGrid.tsx`, `${DIR}/bible/ChapterNav.tsx`, `${DIR}/bible/PlaceMissing.tsx`,
    `${DIR}/bible/Reader.tsx`, `${DIR}/bible/ReaderText.tsx`, `${DIR}/bible/TestamentBar.tsx`, `${DIR}/bible/VerseActions.tsx`, `${DIR}/bible/VerseRows.tsx`,
    `${DIR}/bible/blocks.ts`, `${DIR}/bible/books.ts`, `${DIR}/bible/credit.ts`, `${DIR}/bible/gridMath.ts`, `${DIR}/bible/lastRead.ts`, `${DIR}/bible/order.ts`,
    `${DIR}/bible/ref.ts`, `${DIR}/bible/tileFit.ts`, `${DIR}/bible/today.ts`, `${DIR}/bible/useLastRead.ts`, `${DIR}/bible/useVerseSearch.ts`, `${DIR}/bible/verseActions.ts`,
    `${DIR}/bible/verseRows.ts`, `${DIR}/bible/wrap.ts`,
    `${DIR}/bible/searchCore.ts`, `${DIR}/bible/searchText.ts`,
    `${DIR}/bible/text.ts`, `${DIR}/bible/textCore.ts`, `${DIR}/bible/textTypes.ts`, `${DIR}/bible/webc.generated.ts`,
    `${DIR}/books/BookCover.tsx`, `${DIR}/books/BookPage.tsx`, `${DIR}/books/BookRows.tsx`, `${DIR}/books/BookUi.tsx`, `${DIR}/books/BooksBanner.tsx`, `${DIR}/books/BooksGrid.tsx`,
    `${DIR}/books/BooksNotice.tsx`, `${DIR}/books/ChapterFooter.tsx`, `${DIR}/books/Reader.tsx`, `${DIR}/books/ReaderBlocks.tsx`, `${DIR}/books/ReaderHeader.tsx`,
    `${DIR}/books/bookText.ts`, `${DIR}/books/bookTextApi.ts`, `${DIR}/books/bookTextTypes.ts`, `${DIR}/books/books.generated.ts`, `${DIR}/books/catalog.ts`, `${DIR}/books/copy.ts`,
    `${DIR}/books/cover.ts`, `${DIR}/books/readerType.ts`, `${DIR}/books/reading.ts`, `${DIR}/books/readingStore.ts`, `${DIR}/books/safeText.ts`, `${DIR}/books/typeMetrics.ts`,
    `${DIR}/books/useBooksReading.ts`, `${DIR}/books/useReaderSize.ts`, `${DIR}/books/useReadingWriter.ts`,
  ].sort());
  for (const f of ['text.ts', 'searchText.ts', 'textTypes.ts']) assert.ok(fs.existsSync(path.join(root, DIR, 'bible', f)), `${f} is the text layer of the Bible: the screens read the words only through it`);
});

check('no new native module: the feature imports React, React Native, expo-router, the safe-area module the tab bar already uses and the app\'s own files, nothing else', () => {
  const allowed = /^(react|react-native|expo-router|react-native-safe-area-context)$|^\.{1,2}\/|^@\//;
  const offenders: string[] = [];
  for (const f of featureFiles) {
    for (const m of read(f).matchAll(/^import [^;]*? from '([^']+)';/gm)) if (!allowed.test(m[1])) offenders.push(`${f}: ${m[1]}`);
  }
  assert.deepEqual(offenders, []);
});

check('the rows of the twelve books (a search, Bookmarks) are books/BookRows.tsx, the covers of the tab are books/BooksGrid.tsx, and the Books files are checked in booksWiring.test.ts; a book of the Bible has no chip and no "Soon" anywhere', () => {
  const tabs = code(read(`${DIR}/LibraryTabs.tsx`));
  assert.match(tabs, /import \{ BookRows \} from '\.\/books\/BookRows';/);
  assert.doesNotMatch(tabs, /export function BookRows|const Soon =|const Free =/, 'the rows of the books, and their chips, are in books/');
  assert.match(tabs, /import \{ BookmarkToggle \} from '\.\/BookmarkToggle';/);
  assert.match(tabs, /<BookmarkToggle on=\{marks\.has\(key\)\} title=\{title\} toggle=\{\(\) => marks\.toggle\(key\)\} color=\{color\} \/>/);
  assert.match(tabs, /const key = itemKey\(tab, id\);/);
  assert.doesNotMatch(tabs, /Music|Playlist|PLAYLIST/);
  // the Bible is real: no "Soon" on a tile, a row of a book, a verse or in the Bible tab
  const bible = tabs.slice(tabs.indexOf('export function BibleBookRows'), tabs.indexOf('export function LibraryGroups')) + tabs.slice(tabs.indexOf('export function BibleTab'), tabs.indexOf('export function BooksTab'));
  assert.doesNotMatch(bible, /Soon|Free|Notice|SampleNotice|Preview/, 'a book of the Bible is not an example');
  for (const f of ['BookGrid.tsx', 'ChapterGrid.tsx', 'VerseRows.tsx', 'Reader.tsx', 'ReaderText.tsx']) assert.doesNotMatch(code(read(`${DIR}/bible/${f}`)), /Soon|SOON|Coming soon|SampleNotice|Preview/, `${f}: the Bible is in the app`);
  // the books of the Bible are marked in a row under the key of their own tab ("bible:"), whoever draws them
  assert.match(tabs, /<Mark marks=\{marks\} tab="Bible" id=\{b\.id\} title=\{b\.name\} \/>/);
  assert.match(tabs, /\{group === 'Bible' && <BibleBookRows items=\{hits\.Bible\} marks=\{marks\} withPart onOpen=\{onOpenBook\} \/>\}/);
  assert.match(tabs, /\{group === 'Books' && <BookRows items=\{hits\.Books\} marks=\{marks\} \/>\}/);
  assert.match(tabs, /\{group === 'Verses' && <VerseRowList rows=\{hits\.Verses\} marks=\{marks\} onOpen=\{onOpenVerse\} \/>\}/);
  assert.match(tabs, /<BooksGrid items=\{BOOK_CATALOG\} marks=\{marks\} \/>/);
  const toggle = code(read(`${DIR}/BookmarkToggle.tsx`));
  assert.match(toggle, /bookmarkLabel = \(on: boolean, title: string\) => `\$\{on \? 'Remove bookmark' : 'Bookmark'\}: \$\{title\}`/);
  assert.match(toggle, /accessibilityLabel=\{bookmarkLabel\(on, title\)\}/);
  assert.match(toggle, /accessibilityRole="button"/);
  assert.match(toggle, /width: 44, height: 44/);
});

check('a book of the Bible in a list of results or of Bookmarks is ONE button that opens its chapters, the bookmark button is another beside it (never inside), and the name is in Fraunces with the count in JetBrains Mono', () => {
  const tabs = code(read(`${DIR}/LibraryTabs.tsx`));
  const rows = tabs.slice(tabs.indexOf('export function BibleBookRows'), tabs.indexOf('export function LibraryGroups'));
  assert.match(rows, /<Pressable accessibilityRole="button" accessibilityLabel=\{`\$\{b\.name\}, \$\{bookLine\(b, withPart\)\.replace\(\/\\u00a0\/g, ' '\)\}`\} accessibilityHint="Opens the chapters" onPress=\{\(\) => onOpen\(b\.code\)\}/);
  assert.match(rows, /<\/Pressable>\s*<Mark marks=\{marks\} tab="Bible" id=\{b\.id\} title=\{b\.name\} \/>/, 'the bookmark button follows the row button, outside of it');
  assert.match(rows, /<AppText variant="h4" style=\{\{ fontSize: 20, lineHeight: 26 \}\}>\{b\.name\}<\/AppText>/);
  assert.match(tabs, /<AppText variant="mono" muted style=\{\{ fontSize: 14, lineHeight: 21 \}\}>\{chaptersLabel\(book\.chapters\)\}<\/AppText>/);
  assert.match(tabs, /import \{ Pressable, View \} from 'react-native';/);
});

check('what can be pressed in the feature: the bookmark button, the search field, the banner, the three choices, the tiles, the rows of books and verses, the covers, the book page, the readers\' buttons, and nothing else (the buttons of the Continue reading bar are in its own folder, checked in continueBarWiring.test.ts)', () => {
  const pressable = featureFiles.filter((f) => /<Pressable\b/.test(code(read(f)))).map((f) => path.basename(f)).sort();
  assert.deepEqual(pressable, [
    'BookCover.tsx', 'BookGrid.tsx', 'BookPage.tsx', 'BookRows.tsx', 'BookUi.tsx', 'BookmarkToggle.tsx', 'ChapterFooter.tsx', 'ChapterGrid.tsx', 'ChapterNav.tsx',
    'LibraryBanner.tsx', 'LibraryTabs.tsx', 'Reader.tsx', 'ReaderHeader.tsx', 'SearchBar.tsx', 'SearchResults.tsx', 'TestamentBar.tsx', 'VerseActions.tsx', 'VerseRows.tsx',
  ]);
  // the sample content never acts like real content: no data file has a handler either
  for (const f of ['sample.ts', 'bible/books.ts', 'books/catalog.ts', 'search.ts', 'bookmarks.ts']) assert.doesNotMatch(code(read(`${DIR}/${f}`)), /onPress|Pressable|onClick|=>\s*router/, f);
});

check('the compact banner of the Bible tab is ONE button for a screen reader (the gold pill is its look), it opens the daily reading, and the same component is the base of the banner of the Books tab', () => {
  const src = code(read(`${DIR}/LibraryBanner.tsx`));
  const compact = src.slice(src.indexOf('export function CompactBanner'), src.indexOf('type BannerProps'));
  assert.equal((compact.match(/<Pressable\b/g) ?? []).length, 1, 'the card is the one Pressable; the gold pill inside it is a View');
  assert.match(compact, /if \(!cta \|\| !onPress\) return card;/, 'without a pill and something to do the card is only a card');
  assert.match(compact, /accessibilityRole="button"\s+accessibilityLabel=\{\[cta, title, label, line\]\.filter\(Boolean\)\.join\('\. '\)\}\s+accessibilityHint=\{hint\}\s+onPress=\{onPress\}/, 'the label is the pill\'s words, then the title and the date; the note is not said');
  assert.match(src, /export const DAILY_TITLE = 'Daily reading';/);
  assert.match(src, /export const DAILY_NOTE = 'Buen Camino!';/);
  assert.match(src, /export const DAILY_CTA = 'Read today';/);
  assert.match(src, /<CompactBanner label=\{todayLine\(now\)\} title=\{DAILY_TITLE\} note=\{DAILY_NOTE\} cta=\{DAILY_CTA\} onPress=\{onOpen\} hint="Opens today's reading and the calendar" \/>/);
  assert.match(src, /useFocusEffect\(useCallback\(\(\) => \{ setNow\(new Date\(\)\); \}, \[\]\)\);/, 'the date is read again whenever the Library comes into view');
  assert.match(src, /export const BOOKS_KICKER = 'Preview · Books';/);
  assert.match(src, /export const BOOKS_TITLE = 'Twelve free companions for the road';/);
  assert.match(src, /export const BOOKS_LINE = 'Classics to read on the way\. Free to read\.';/);
  assert.match(src, /<LibraryBanner kicker=\{BOOKS_KICKER\} title=\{BOOKS_TITLE\} line=\{BOOKS_LINE\} icon="library" \/>/, 'the Books tab banner is not changed here: it has no cta, no onOpen');
  // the props a base banner needs: the mono label, the title, an optional line, an optional single Caveat note, an optional gold pill and what it does
  assert.match(src, /export type CompactBannerProps = \{\s+label: string;\s+title: string;\s+line\?: string;\s+note\?: string;\s+cta\?: string;\s+onPress\?: \(\) => void;\s+hint\?: string;\s+\};/);
  // the four fonts, by variant, never a font of its own: JetBrains Mono for the label, Fraunces for the title, Inter for the line and the pill, Caveat for the note
  assert.match(compact, /<AppText variant="mono"[^>]*>\{label\}<\/AppText>/);
  assert.match(compact, /<AppText variant="h4"[^>]*>\{title\}<\/AppText>/);
  assert.match(compact, /<AppText variant="small"[^>]*>\{line\}<\/AppText>/);
  assert.match(compact, /<AppText variant="accent"[^>]*>\{note\}<\/AppText>/);
  assert.match(compact, /<AppText variant="label"[^>]*>\{cta\}<\/AppText>/);
  assert.equal((compact.match(/variant="accent"/g) ?? []).length, 1, 'one handwritten note, never two');
  assert.doesNotMatch(compact, /fontFamily|#[0-9a-fA-F]{3,8}\b|\bfixed\./, 'colours are roles and the gold, never a literal');
  // the size: 12 above and below + the label (16) + the title (28) + the two gaps and the margin of the bottom row (6) + the pill (44) is under 120
  const padV = Number(/paddingVertical: (\d+)/.exec(compact)?.[1]);
  const gap = Number(/paddingVertical: \d+, gap: (\d+)/.exec(compact)?.[1]);
  const rowTop = Number(/alignItems: 'center', gap: 12, marginTop: (\d+)/.exec(compact)?.[1]);
  const labelLine = Number(/fontSize: 12, lineHeight: (\d+), textTransform/.exec(compact)?.[1]);
  const titleLine = Number(/fontSize: 24, lineHeight: (\d+) \}\}>\{title\}/.exec(compact)?.[1]);
  const pill = Number(/height: (\d+), paddingHorizontal: 16, borderRadius: radius\.pill, backgroundColor: c\.gold/.exec(compact)?.[1]);
  assert.ok(pill >= 44, `the gold pill is ${pill} high`);
  const height = 2 * padV + labelLine + titleLine + 2 * gap + rowTop + pill;
  assert.ok(height <= Number(/export const COMPACT_BANNER_MAX_HEIGHT = (\d+);/.exec(src)![1]), `the banner is ${height} high (with the phone's text at its normal size)`);
  assert.equal(Number(/COMPACT_BANNER_MAX_HEIGHT = (\d+)/.exec(src)![1]), 120);
  assert.equal(Number(/COMPACT_BANNER_MAX_HEIGHT_NARROW = (\d+)/.exec(src)![1]), 140);
  assert.match(src, /COMPACT_BANNER_MAX_FONT_SCALE = 1\.2;/);
  assert.match(compact, /adjustsFontSizeToFit minimumFontScale=\{0\.8\}/, 'a handwritten note beside a pill shrinks a little before it is cut');
  // contrast of what is on the card is checked in navigation.test.ts, for light and dark
});

check('the three choices of the Bible tab are an inline segmented pill: radio buttons in a radio group (not tabs), checked state for web and phone, a label each, never under 44, roles for every colour, and nothing floats', () => {
  const src = code(read(`${DIR}/bible/TestamentBar.tsx`));
  assert.match(src, /accessibilityRole="radiogroup"\s+accessibilityLabel="Part of the Bible"/);
  assert.match(src, /accessibilityRole="radio"\s+accessibilityState=\{\{ checked: on \}\}\s+aria-checked=\{on\}\s+accessibilityLabel=\{TESTAMENT_LABEL\[t\]\}\s+onPress=\{\(\) => onChange\(t\)\}/);
  assert.doesNotMatch(src, /accessibilityRole="tab"|role="tab"/, 'the real tab bar is the only "tab" on the screen (the web smoke counts them)');
  assert.match(src, /\{TESTAMENTS\.map\(\(t\) => \{/, 'one choice for each part, in the order of the parts');
  assert.match(src, /export const BAR_DRAWN: Record<Testament, string> = \{ old: 'Old\\nTestament', deutero: 'Deuterocanon', new: 'New\\nTestament' \};/, 'the labels stay as they were');
  assert.match(src, /\{BAR_DRAWN\[t\]\}<\/AppText>/);
  assert.match(src, /export const BAR_MAX_FONT_SCALE = 1\.2;/);
  assert.match(src, /<AppText variant="label" maxFontSizeMultiplier=\{BAR_MAX_FONT_SCALE\} color=\{on \? role\.onAction : role\.text\} style=\{\{ fontSize: 14, lineHeight: 18, textAlign: 'center' \}\}>/, 'Inter, the same for the filled one and the others, and larger text still fits three labels in a row');
  // size: 56 high with 4 of padding is a choice 48 high; the middle one keeps its own width, the others share the rest
  const height = Number(/export const BAR_HEIGHT = (\d+);/.exec(src)?.[1]);
  const padding = Number(/gap: 2, padding: (\d+)/.exec(src)?.[1]);
  assert.ok(height - 2 * padding >= 44, `a choice is ${height - 2 * padding} high`);
  assert.match(src, /flexGrow: t === 'deutero' \? 0 : 1, flexShrink: t === 'deutero' \? 0 : 1, flexBasis: t === 'deutero' \? 'auto' : 0/);
  // colours: roles only; the track is the sunken colour, the filled choice the action colour
  assert.match(src, /backgroundColor: role\.sunken \}\}/);
  assert.match(src, /backgroundColor: on \? role\.action : 'transparent'/);
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b|\bfixed\.|\bc\.[a-z]/, 'colours are theme roles, never a literal, the fixed palette or a palette colour');
  // it is in the page: nothing floats, nothing is placed by the tab bar's numbers any more
  assert.doesNotMatch(src, /position: 'absolute'|useSafeAreaInsets|useWindowDimensions|BAR_ROOM|BAR_NARROW_UNDER|bottom:|shadowStyle|fontFamily/, 'an inline control: no floating logic left');
  assert.doesNotMatch(read('app/(tabs)/library.tsx'), /BAR_ROOM|TestamentBar|scrollRef|onListLayout|scroller|listTop|useRef/, 'and none left in the screen');
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

check('the Bookmarks screen: nothing is said about the Library part before it is read, every state of the Posts part has its words, a post card cannot be pressed, and the verses are looked up in the text', () => {
  const src = code(read('app/library/bookmarks.tsx'));
  assert.match(src, /\) : marks\.ready && \(\s*<Card><AppText variant="small" muted>\{LIBRARY_BOOKMARKS_EMPTY\}<\/AppText><\/Card>/, 'no "nothing bookmarked" while the list is still being read');
  for (const view of ['loading', 'offline-empty', 'failed-empty', 'empty', 'list']) assert.match(src, new RegExp(`saved\\.view === '${view}'`), `the ${view} state is drawn`);
  assert.match(src, /saved\.offlineNote && <FormMessage tone="info">\{SAVED_OFFLINE_NOTE\}<\/FormMessage>/);
  assert.match(src, /saved\.failedNote && <FormMessage>\{SAVED_FAILED\}<\/FormMessage>/);
  assert.match(src, /!!saved\.notice && <FormMessage>\{saved\.notice\}<\/FormMessage>/);
  assert.match(src, /marks\.failed && <FormMessage>\{BOOKMARK_NOT_SAVED\}<\/FormMessage>/);
  assert.match(src, /const hits = useMemo\(\(\) => hitsForKeys\(marks\.shown, \{ hasBook, loadBook \}\), \[marks\.shown\]\);/, 'a row taken off stays until the screen is left; the verses come from the text');
  assert.match(src, /import \{ hasBook, loadBook \} from '@\/features\/library\/bible\/text';/);
  assert.match(src, /<ActivityIndicator accessibilityLabel="Loading your bookmarked posts"/);
  const card = code(read(`${DIR}/SavedPostCard.tsx`));
  assert.doesNotMatch(card, /onPress|Pressable/, 'there is no screen for one post yet: the card shows what was kept');
  assert.match(card, /<BookmarkToggle on=\{on\} title=\{heading\} toggle=\{toggle\} \/>/);
});

check('every button of the feature has a label for a screen reader, and the search says what it is typed into', () => {
  for (const f of featureFiles) {
    const src = code(read(f));
    for (const m of src.matchAll(/<Pressable\b/g)) assert.match(src.slice(m.index, (m.index ?? 0) + 500), /accessibilityLabel=/, `${f}: a Pressable without a label`);
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
  assert.match(screen, /<View style=\{\{ flex: 1 \}\}><NotesTab \/><\/View>/, 'no props, in a box of its own that fills what is under the tabs: the notes start right under them');
  assert.doesNotMatch(screen, /<NotesTab\s[^>]*\w+=/, 'NotesTab takes no props');
  const notesHost = screen.slice(screen.indexOf("if (tab === 'Notes') {"), screen.indexOf('<Screen keyboard'));
  assert.ok(notesHost.includes('<NotesTab />'), 'the host of the Notes tab is found');
  assert.doesNotMatch(notesHost.slice(notesHost.indexOf(') : (')), /Banner|<Screen\b|ScrollView/, 'Notes has no banner and no scroll view around it: the feed scrolls by itself');
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

check('the Bookmarks screen groups the Library rows with the same component as the search (the Bible, the twelve books, the verses), says where they are kept, and says how to bookmark when nothing current is kept', () => {
  const src = code(read('app/library/bookmarks.tsx'));
  assert.match(src, /<LibraryGroups hits=\{hits\} marks=\{marks\} onOpenBook=\{\(code\) => router\.push\(bookHref\(code\)\)\} onOpenVerse=\{\(ref\) => router\.push\(readerHref\(ref\)\)\} \/>/, 'a book opens its chapters, a verse opens the reader at it');
  assert.match(src, /hitCount\(hits\) > 0 \? \(/);
  assert.match(src, /hits\.Books\.some\(\(b\) => !hasBookText\(b\.id\)\)\s+\? <SampleNotice title="Coming soon">\{BOOKMARKS_NOTICE\}<\/SampleNotice>\s+: <AppText variant="caption" muted>\{BOOKMARKS_KEPT\}<\/AppText>/, 'the examples notice only when a book of the Books tab is among them');
  assert.match(src, /LIBRARY_BOOKMARKS_EMPTY/);
  const tabs = code(read(`${DIR}/LibraryTabs.tsx`));
  assert.match(tabs, /\{hitGroups\(hits\)\.map\(\(group\) => \(/, 'a group that has no row in it is not drawn');
  assert.match(code(read(`${DIR}/search.ts`)), /export const hitGroups = \(h: Hits\): ResultGroup\[\] => RESULT_GROUPS\.filter\(\(g\) => h\[g\]\.length > 0\);/);
});

console.log(`${n} of ${n} passed`);
