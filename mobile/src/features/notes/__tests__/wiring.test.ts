// Source-level checks of how the notes are wired into the app, in the style of the Library's and the diary's wiring tests: they read the files,
// nothing is run. What the pure parts do is checked in notes.test.ts; here it is that the screens use them the way they must: a note never
// leaves the phone, logging out wipes it, a stored value that cannot be read is never written over, a note that could not be saved is not lost,
// every button has a label and a thumb-sized target, the reader and the Notebook are real screens of the app, and nothing needs a new native
// module. Run: npm run test:notes
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };
const root = process.cwd(); // npm test runs from mobile/
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const code = (src: string) => src.split('\n').filter((l) => !/^\s*(\/\/|\/?\*)/.test(l)).join('\n'); // without comment lines

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of fs.readdirSync(path.join(root, dir))) {
    const rel = `${dir}/${name}`;
    if (fs.statSync(path.join(root, rel)).isDirectory()) { if (name !== '__tests__') out.push(...walk(rel)); } else if (/\.tsx?$/.test(name)) out.push(rel);
  }
  return out.sort();
}

const DIR = 'src/features/notes';
const featureFiles = walk(DIR);
// the files outside the folder that draw or keep notes: the reader and its parts, the book screen, the Notebook, the sheet's frame
const screens = ['app/library/notes.tsx', 'app/library/book/[id]/[chapter].tsx', 'app/library/book/[id]/index.tsx'];
const readerParts = ['src/features/library/ReaderBlock.tsx', 'src/features/library/ReflectionCard.tsx', 'src/features/library/BookText.tsx', 'src/features/library/PlaceRows.tsx', 'src/components/SheetModal.tsx'];
const all = [...featureFiles, ...screens, ...readerParts];
const PURE = ['anchor.ts', 'blocks.ts', 'context.ts', 'diary.ts', 'notebook.ts', 'notes.ts', 'present.ts'].map((f) => `${DIR}/${f}`);

check('the feature is the files this test expects, so a new one is looked at (and the scans below see all of them)', () => {
  assert.deepEqual(featureFiles.map((f) => path.basename(f)), [
    'NoteSheet.tsx', 'NotebookLink.tsx', 'NotesSearch.tsx', 'anchor.ts', 'blocks.ts', 'confirm.ts', 'context.ts', 'diary.ts', 'growIntoDiary.ts', 'notebook.ts', 'notes.ts', 'present.ts', 'useGrow.ts', 'useNoteSheet.tsx', 'useNotes.ts',
  ].sort());
  for (const f of all) assert.ok(fs.existsSync(path.join(root, f)), `${f} exists`);
});

check('no new native module: the feature imports React, React Native, expo-router and the app\'s own files, nothing else', () => {
  const allowed = /^(react|react-native|expo-router)$|^\.{1,2}\/|^@\//;
  const offenders: string[] = [];
  for (const f of all) for (const m of read(f).matchAll(/^import [^;]*? from '([^']+)';/gm)) {
    // SheetModal is the one shared component that frames the sheet: it reads the safe area, as the screens' own frame (Screen) does
    if (f === 'src/components/SheetModal.tsx' && m[1] === 'react-native-safe-area-context') continue;
    if (!allowed.test(m[1])) offenders.push(`${f}: ${m[1]}`);
  }
  assert.deepEqual(offenders, []);
});

check('the model is pure: the anchors, the notes, the questions of a day, the Notebook, the context, the Diary page and the words import no React, no React Native and nothing of the app but pure files', () => {
  for (const f of PURE) {
    for (const m of read(f).matchAll(/^import [^;]*? from '([^']+)';/gm)) {
      assert.doesNotMatch(m[1], /^(react|react-native|expo|@\/)/, `${f} imports ${m[1]}`);
      assert.match(m[1], /^\.{1,2}\//, `${f}: ${m[1]}`);
    }
  }
});

check('a note never leaves the phone: nothing in the feature, the reader or the Notebook touches the network, a server, the share sheet or a browser', () => {
  const banned = /supabase|lib\/api|lib\/net|lib\/postShare|fetch\(|XMLHttpRequest|WebSocket|NetInfo|Linking|expo-web-browser|expo-sharing|\bShare\.share|from 'expo-clipboard'/;
  for (const f of [...featureFiles, ...screens, 'src/features/library/ReaderBlock.tsx', 'src/features/library/ReflectionCard.tsx', 'src/features/library/PlaceRows.tsx', 'src/components/SheetModal.tsx']) {
    assert.doesNotMatch(code(read(f)), banned, `${f} reaches out`);
  }
  // what the feature takes from the app's lib: who is signed in, the phone's store, an id, the colours: no api, no network
  for (const f of featureFiles) for (const m of read(f).matchAll(/from '@\/lib\/([^']+)'/g)) assert.ok(['auth', 'localStore', 'uuid'].includes(m[1]), `${f}: @/lib/${m[1]}`);
  // the only thing that is not a plain function over the phone's store: the Diary's own store, on the phone as well
  const diaryImports = featureFiles.filter((f) => /from '(\.\.\/diary|@\/features\/diary)/.test(read(f))).map((f) => path.basename(f)).sort();
  assert.deepEqual(diaryImports, ['diary.ts', 'growIntoDiary.ts'], 'only the Diary page a note grows into reads the Diary');
});

check('there is nothing to share and nothing social: no share button, no share icon, no likes, no comments, no feed', () => {
  for (const f of [...featureFiles, ...screens]) {
    const src = code(read(f));
    assert.doesNotMatch(src, /name="share"|label="Share|>Share<|'Share'|expo-sharing|Share\.share/, `${f} has a share button`);
    assert.doesNotMatch(src, /\bsocial\b|likeCount|like_count|follower|comments?\b.*count|FlatList/i, `${f} looks like a feed`);
  }
});

check('notes are kept per person under u.<userId>.notes, which logging out wipes', () => {
  const hook = code(read(`${DIR}/useNotes.ts`));
  assert.match(hook, /const key = uid \? userKey\(uid, NOTES_NAME\) : null;/);
  assert.match(hook, /localStore\.getJSON<unknown>\(key\)/);
  assert.match(hook, /localStore\.setJSON\(cur\.key, packNotes\(list\)\)/);
  assert.match(read(`${DIR}/notes.ts`), /export const NOTES_NAME = 'notes';/);
  assert.match(read('src/features/library/reading.ts'), /export const READING_NAME = 'library\.reading';/, 'the place in each book is per person under a u.<userId>. key as well');
  assert.match(code(read('src/features/library/useReadingPlaces.ts')), /userKey\(uid, READING_NAME\)/);
  const store = read('src/lib/localStore.ts');
  assert.match(store, /export const userKey = \(uid: string, name: string\) => `u\.\$\{uid\}\.\$\{name\}`;/);
  assert.match(store, /export const clearUserData = \(uid: string\) => localStore\.removeByPrefix\(`u\.\$\{uid\}\.`\);/);
  assert.match(read('src/lib/auth.tsx'), /await clearUserData\(uid\);/, 'signing out wipes every u.<userId>. key');
});

check('the hook reads again when the screen comes back, refuses a change before the notes were read or while something unreadable is stored, shows a change at once, writes in turn and undoes what could not be written', () => {
  const hook = code(read(`${DIR}/useNotes.ts`));
  assert.match(hook, /useFocusEffect\(/);
  assert.match(hook, /const list = raw === null \? \[\] : parseNotes\(raw\);/, 'nothing stored is an empty list, something stored is parsed');
  assert.match(hook, /blocked: raw !== null && list === null/, 'something stored that does not read is "blocked", not "empty"');
  assert.match(hook, /if \(!key \|\| !cur \|\| cur\.key !== key\) return \{ reason: 'not-saved' \};/, 'not read yet: refused');
  assert.match(hook, /return cur\.blocked \? \{ reason: 'blocked' \} : \{ cur \};/, 'blocked: refused, so what is stored is never written over');
  assert.match(hook, /queue\.current\.then\(\(\) => localStore\.setJSON/, 'writes take their turn');
  assert.match(hook, /if \(ok\) \{ setFailed\(false\); return true; \}/);
  assert.match(hook, /latest\.current = \{ \.\.\.next, list: before \}/, 'a failed write is undone');
  assert.match(hook, /setFailed\(true\)/);
  assert.match(hook, /return \(await commit\(cur, cur\.list, res\.notes\)\) \? \{ ok: true, note: res\.note \} : \{ ok: false, reason: 'not-saved' \};/);
  assert.match(hook, /contextFor\(now, journeyRef\.current\)/, 'the context is filled in by the app, from the journey it already has');
  assert.doesNotMatch(hook, /stage/i, 'a stage is never filled in');
  assert.match(code(read(`${DIR}/context.ts`)), /export function contextFor\(now: Date, journey: JourneyContext\): NoteContext/);
});

check('"Grow into a Diary page" uses the Diary\'s own store and its limits, and opens the page it made; the Diary\'s data model is not touched', () => {
  const grow = code(read(`${DIR}/growIntoDiary.ts`));
  assert.match(grow, /import \{ newId, saveEntry \} from '\.\.\/diary\/storage';/);
  assert.match(grow, /import \{ problemMessage \} from '\.\.\/diary\/present';/);
  assert.match(grow, /await saveEntry\(uid, \{ id, createdAt: stamp, updatedAt: stamp, title, body \}\)/);
  assert.match(grow, /message: problemMessage\(res\.reason\)/, 'the Diary\'s own words when its limits say no');
  assert.match(code(read(`${DIR}/useGrow.ts`)), /router\.push\(`\/diary\/\$\{res\.id\}`\);/);
  assert.match(code(read(`${DIR}/diary.ts`)), /import \{ BODY_MAX, TITLE_MAX \} from '\.\.\/diary\/store';/);
  // nothing in the notes feature writes a diary key by hand
  for (const f of featureFiles) assert.doesNotMatch(code(read(f)), /diary\.\$\{|`diary\.|slotKey|createDiaryStore|clearDiary/, `${f} reaches into the Diary's keys`);
});

check('the sheet: framed by SheetModal, a labelled close button of 44, every action a labelled button of at least 44 high, the words kept when a save fails, a delete asked first, the privacy line and the Diary line shown', () => {
  const src = code(read(`${DIR}/NoteSheet.tsx`));
  assert.match(src, /<SheetModal onClose=\{onClose\} closeLabel="Close the note">/);
  assert.match(src, /accessibilityLabel="Close" onPress=\{onClose\} hitSlop=\{4\} style=\{\{ width: 44, height: 44/);
  assert.match(src, /minHeight: 44, paddingHorizontal: 16, borderRadius: radius\.pill/, 'an action is at least 44 high');
  assert.match(src, /if \(problem\) \{ setSaid\(noteProblemMessage\(problem\)\); return; \}\s+onClose\(\);/, 'the sheet closes only after the note is on the phone; otherwise the words stay and the reason is said');
  assert.match(src, /if \(problem\) setSaid\(problem\); else onClose\(\);/, 'a Diary page that could not be written says why and the note stays');
  assert.match(src, /confirmDeleteNote\(reflection \? 'reflection' : 'note'/);
  assert.match(src, /\{NOTE_SHEET_PRIVACY\}/);
  assert.match(src, /\{GROW_NOTE\}/);
  assert.match(src, /label=\{GROW_LABEL\}/);
  assert.match(src, /maxLength=\{NOTE_TEXT_MAX\}/);
  assert.match(src, /accessibilityLabel=\{reflection \? 'Your reflection' : 'Your note'\}/);
  assert.match(src, /label=\{reflection \? 'Save reflection' : 'Save note'\}/);
  assert.match(src, /\{reflection && !!target\.prompts && target\.prompts\.length > 0 && \(/, 'a reflection shows the questions while the pilgrim writes');
  assert.match(src, /writing === null && !reflection && \(\s*<Pill variant="ghost" label="Add another note"/, 'a day has one reflection: no "add another"');
  const confirm = code(read(`${DIR}/confirm.ts`));
  assert.match(confirm, /Platform\.OS === 'web'/);
  assert.match(confirm, /Alert\.alert\(DELETE_TITLE, message, \[/);
  const frame = code(read('src/components/SheetModal.tsx'));
  assert.match(frame, /<Modal visible transparent animationType="slide" onRequestClose=\{onClose\}>/);
  assert.match(frame, /accessibilityLabel=\{closeLabel\}/);
  assert.match(frame, /backgroundColor: scrim/, 'the dimming is the theme\'s scrim');
});

check('the reader: a paragraph shows its marks and its two buttons, a long press writes a note, a screen reader has the same two actions, and the day ends with the reflection prompt', () => {
  const part = code(read('src/features/library/ReaderBlock.tsx'));
  assert.match(part, /onLongPress=\{onNote\}/);
  assert.match(part, /accessibilityActions=\{\[\{ name: 'note', label: 'Add a note' \}/);
  assert.match(part, /onAccessibilityAction=/);
  assert.match(part, /accessibilityLabel=\{notes === 1 \? 'Note on this paragraph' : `\$\{notes\} notes on this paragraph`\}/, 'the side mark of a note is a labelled button');
  assert.match(part, /hitSlop=\{\{ top: 10, bottom: 10, left: 12, right: 6 \}\}/, 'the mark is 24 wide and reached by a 44 target');
  assert.match(part, /minHeight: 44, flexDirection: 'row'/, 'the two buttons under a paragraph are at least 44 high');
  assert.match(part, /export const GUTTER = 28;/);
  const reader = code(read('app/library/book/[id]/[chapter].tsx'));
  assert.match(reader, /const notes = useChapterNotes\(book\.id, chapter\.id\);/);
  assert.match(reader, /const \{ open: openSheet, sheet \} = useNoteSheet\(notes\);/);
  assert.match(reader, /const prompt = useMemo\(\(\) => reflectionPrompt\(chapter\.blocks\), \[chapter\]\);/);
  assert.match(reader, /prompt && i === prompt\.listIndex/);
  assert.match(reader, /<ReflectionCard questions=\{prompt\?\.questions \?\? \[\]\} reflection=\{notes\.here\.reflection\} onOpen=\{writeReflection\} \/>/);
  assert.match(reader, /prompt\.listIndex === null && i === prompt\.endIndex - 1/, 'a day whose end has no list still ends with the button');
  assert.match(reader, /type: 'reflection', prompts: prompt \? questionLines\(prompt\) : undefined/);
  assert.match(reader, /anchor: chapterKey, quote: chapter\.title, type: 'reflection'/, 'the reflection is a note on the day\'s anchor');
  assert.match(reader, /openSheet\(\{ anchor: blockAnchor\(book\.id, chapter\.id, i\), quote: quoteOf\(chapter\.blocks\[i\]\), type: 'note', titles \}\)/, 'a note on a paragraph: its anchor and the words it is made on');
  assert.match(reader, /\{READER_HINT\}/);
  assert.match(reader, /scroller\.current\?\.scrollTo\(/, 'a bookmark or a note opens at its paragraph');
  assert.match(reader, /useEffect\(\(\) => \{ if \(ready\) remember\(book\.id, chapter\.id\); \}/, 'the place is remembered once the places were read');
  assert.match(reader, /\{sheet\}/);
  const card = code(read('src/features/library/ReflectionCard.tsx'));
  assert.match(card, /WRITE_REFLECTION = 'Write your reflection'/);
  assert.match(card, /WROTE_REFLECTION = 'You wrote a reflection'/);
  assert.match(card, /OPEN_REFLECTION = 'Open your reflection'/);
  assert.match(card, /<Pill label=\{WRITE_REFLECTION\} onPress=\{onOpen\} \/>/);
});

check('the Notebook: its own screen with Back and a heading, the privacy line, a search, an empty state in the app\'s voice, notes grouped by book and chapter, and each note opens in the sheet with a way to its place in the book', () => {
  const src = code(read('app/library/notes.tsx'));
  assert.match(src, /<Screen tabBar=\{false\} keyboard>/);
  assert.match(src, /<IconButton name="back" label="Back" onPress=\{goBack\} \/>/);
  assert.match(src, /router\.canGoBack\(\) \? router\.back\(\) : router\.replace\('\/library'\)/);
  assert.match(src, /<AppText variant="h2" accessibilityRole="header">Notebook<\/AppText>/);
  assert.match(src, /\{NOTES_PRIVACY_LINE\}/);
  assert.match(src, /api\.ready && api\.notes\.length === 0 && !api\.blocked && \(/, 'nothing is said about "no notes" before they were read, or when they could not be');
  assert.match(src, /\{NOTEBOOK_EMPTY_TITLE\}/);
  assert.match(src, /api\.blocked && <FormMessage>\{NOTES_BLOCKED\}<\/FormMessage>/);
  assert.match(src, /api\.failed && <FormMessage>\{NOTES_NOT_SAVED\}<\/FormMessage>/);
  assert.match(src, /<NotesSearch value=\{query\} onChangeText=\{setQuery\} \/>/);
  assert.match(src, /searchNotes\(api\.notes, query, CATALOG\)/);
  assert.match(src, /groupNotes\(shown, CATALOG\)/);
  assert.match(src, /accessibilityLiveRegion="polite"/);
  assert.match(src, /label="Clear search"/);
  assert.match(src, /useNoteSheet\(api, \(note\) => \{ const to = noteRoute\(note, CATALOG\); if \(to\) router\.push\(to\); \}\)/);
  assert.match(src, /open\(\{ anchor: n\.anchor, quote: n\.quote, type: n\.type, prompts: promptsFor\(n\), titles: titlesOf\(n, CATALOG\) \}\)/);
  assert.doesNotMatch(src, /createdAt\)\s*\.sort|sort\(.*createdAt/, 'no timeline: the groups follow the books');
  const search = code(read(`${DIR}/NotesSearch.tsx`));
  assert.match(search, /accessibilityLabel=\{NOTES_SEARCH_LABEL\}/);
  assert.match(search, /width: 48, height: 48/, 'the clear button is a 48 touch target');
  assert.match(search, /height: 52, borderRadius: radius\.pill/);
  const link = code(read(`${DIR}/NotebookLink.tsx`));
  assert.match(link, /accessibilityLabel="Notebook"/);
  assert.match(link, /minHeight: 72/);
  const marks = code(read('app/library/bookmarks.tsx'));
  assert.match(marks, /<NotebookLink onPress=\{\(\) => router\.push\(NOTEBOOK_ROUTE\)\} \/>/, 'the way in is the Bookmarks screen: the Library\'s header is full');
  assert.match(code(read(`${DIR}/NotebookLink.tsx`)), /NOTEBOOK_ROUTE = '\/library\/notes'/);
});

check('the screens of the notes and the books are registered for someone with a journey, and every screen the layout declares is a file', () => {
  const layout = read('app/_layout.tsx');
  const guard = layout.indexOf('<Stack.Protected guard={onboarded}>');
  const end = layout.indexOf('</Stack.Protected>', guard);
  for (const name of ['library/bookmarks', 'library/notes', 'library/book/[id]/index', 'library/book/[id]/[chapter]']) {
    const at = layout.indexOf(`<Stack.Screen name="${name}" />`);
    assert.ok(guard > 0 && at > guard && at < end, `${name} is registered inside the screens for someone who has a journey`);
  }
  assert.ok(fs.existsSync(path.join(root, 'app/library/notes.tsx')));
  assert.ok(fs.existsSync(path.join(root, 'app/library/book/[id]/index.tsx')));
  assert.ok(fs.existsSync(path.join(root, 'app/library/book/[id]/[chapter].tsx')));
});

check('every button of the feature has a label for a screen reader', () => {
  for (const f of all) {
    const src = code(read(f));
    for (const m of src.matchAll(/<Pressable\b/g)) assert.match(src.slice(m.index, (m.index ?? 0) + 500), /accessibilityLabel=/, `${f}: a Pressable without a label`);
    for (const m of src.matchAll(/<IconButton\b/g)) assert.match(src.slice(m.index, (m.index ?? 0) + 200), /\blabel="/, `${f}: an IconButton without a label`);
  }
});

check('the feature uses no console, no interval and no StyleSheet.create, and no colour of its own: roles and the theme\'s own colours, read while drawing, so dark mode follows', () => {
  const offenders: string[] = [];
  for (const f of all) {
    code(read(f)).split('\n').forEach((line, i) => {
      if (/\bconsole\.|StyleSheet\.create|\bsetInterval\(/.test(line)) offenders.push(`${f}:${i + 1}  ${line.trim().slice(0, 100)}`);
      if (/#[0-9a-fA-F]{3,8}\b|\brgba?\(/.test(line)) offenders.push(`${f}:${i + 1}  a colour of its own: ${line.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(offenders, []);
});

console.log(`${n} of ${n} passed`);
