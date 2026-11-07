// Source-level checks of how the diary is wired into the app, in the style of src/lib/__tests__/themeScheme.test.ts: the code
// stays offline and the logic files stay pure, the screens save when the person leaves, and (below) deleting the account
// clears the diary. They read the files; nothing is run. Run: npm run test:diary
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };
const root = process.cwd(); // npm test runs from mobile/
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

check('the diary uses no network and no console, and the logic files import nothing from React or React Native', () => {
  const files = [
    ...fs.readdirSync(path.join(root, 'src/features/diary')).filter((f) => /\.tsx?$/.test(f)).map((f) => `src/features/diary/${f}`),
    ...fs.readdirSync(path.join(root, 'app/diary')).map((f) => `app/diary/${f}`),
  ];
  assert.ok(files.length >= 9, `the scan must see every diary file: ${files.join(', ')}`);
  const offenders: string[] = [];
  for (const f of files) {
    read(f).split('\n').forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '');
      if (/\bfetch\(|XMLHttpRequest|WebSocket|supabase|lib\/api|lib\/net|NetInfo|console\.|StyleSheet\.create/.test(code)) offenders.push(`${f}:${i + 1}  ${line.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(offenders, []);
  for (const f of ['store.ts', 'autosave.ts', 'present.ts']) {
    for (const l of read(`src/features/diary/${f}`).split('\n').filter((line) => /^import /.test(line))) assert.doesNotMatch(l, /from '(react|react-native|expo|@\/)/, `${f}: ${l}`);
  }
  assert.match(read('src/features/diary/storage.ts'), /from '\.\.\/\.\.\/lib\/localStore'/, 'the phone store is plugged in by storage.ts only');
  assert.doesNotMatch(read('src/features/diary/store.ts').split('\n').filter((l) => /^import /.test(l)).join('\n'), /localStore/, 'store.ts imports no phone store');
});

check('the editor saves when the screen goes away and when the app goes to the background', () => {
  const hook = read('src/features/diary/useDiary.ts');
  assert.match(hook, /AppState\.addEventListener\('change'/);
  assert.match(hook, /state !== 'active'\) void saver\.flush\(\)/);
  assert.match(hook, /return \(\) => \{ alive\.current = false; void saver\.flush\(\); \}/, 'the saver is flushed when the screen goes away');
  const editor = read('app/diary/[id].tsx');
  assert.match(editor, /autoFocus=\{!initial\}/, 'a new page opens ready to write');
  assert.match(editor, /router\.canGoBack\(\) \? router\.back\(\) : router\.replace\('\/library'\)/);
  assert.match(editor, /Saved on this phone/);
  assert.match(editor, /Saving…/);
  assert.match(editor, /This page is not here/);
});

check('every way of leaving the editor goes through one guard while something typed is not safely on the phone: the Back button, the system back, the swipe, the browser back', () => {
  const src = read('app/diary/[id].tsx');
  const editor = src.slice(src.indexOf('function PageEditor'));
  assert.ok(editor.length > 200, 'PageEditor is there');
  assert.match(src, /import \{[^}]*\busePreventRemove\b[^}]*\} from 'expo-router';/);
  assert.match(editor, /const disablePrevention = usePreventRemove\(view\.status !== 'saved' && !leaving, \(\{ repeat \}\) => \{/, 'held while a write is pending or the last one failed, and only then');
  assert.match(editor, /saver\.tryLeave\(\)/, 'it writes first, and says leave or stay');
  assert.match(editor, /if \(answer !== 'leave' \|\| left\.current\) return;\s*left\.current = true;\s*setLeaving\(true\);\s*repeat\(\);/, 'on leave it lifts the hold and takes the way out that was held, once');
  assert.match(editor, /<IconButton name="back" label="Back" onPress=\{goBack\} \/>/, 'the Back button is one of the ways out, not a path of its own');
  assert.doesNotMatch(editor, /await saver\.flush\(\)/, 'no second, different way of leaving');
  assert.match(editor, /if \(await saver\.discard\(\)\) \{ setLeaving\(true\); disablePrevention\(\); goBack\(\); \}/, 'a deleted page lifts the hold before it goes back');
  // the hook this relies on comes with the installed expo-router, which blocks the pop of the stack, the Android back and (through
  // react-native-screens' preventNativeDismiss) the iOS swipe, and hands the blocked action to the callback
  const exported = read('node_modules/expo-router/build/exports.d.ts');
  assert.match(exported, /usePreventRemove/);
  assert.match(read('node_modules/expo-router/build/react-navigation/native-stack/views/NativeStackView.native.js'), /preventNativeDismiss: isRemovalPrevented/);
});

check('the editor is keyed by the person and the page, so an editor made for one account can never be reused by another', () => {
  const src = read('app/diary/[id].tsx');
  assert.match(src, /<PageEditor key=\{`\$\{page\.uid\}:\$\{page\.entry\?\.id \?\? NEW_PAGE\}`\} uid=\{page\.uid\}/);
  assert.doesNotMatch(src, /<PageEditor key=\{page\.entry/);
  assert.match(read('src/features/diary/useDiary.ts'), /usePageSaver\(uid: string, initial: DiaryEntry \| null\)/, 'the saver is made once for one uid, which is why the key matters');
});

check('storage.ts reads strictly, in the same places localStore writes: nothing there is null, anything that cannot be read throws', () => {
  const storage = read('src/features/diary/storage.ts');
  const local = read('src/lib/localStore.ts');
  const get = /async getJSON<T>\(key: string\): Promise<T \| null> \{[\s\S]*?\n  \},/.exec(storage)?.[0] ?? '';
  assert.ok(get.length > 100, 'the strict getJSON is there');
  assert.doesNotMatch(get, /\bcatch\b|\.catch\(/, 'no error is swallowed on the way in');
  assert.match(get, /text === null \? null : \(JSON\.parse\(text\) as T\)/, 'web: missing is null, damaged text throws');
  assert.match(get, /file\.exists \? \(JSON\.parse\(await file\.text\(\)\) as T\) : null/, 'phone: missing is null, a read or parse error throws');
  // the same places as localStore.ts: the layout is localStore's, the diary only reads it strictly
  const safeRule = "const safe = (k: string) => k.replace(/[^A-Za-z0-9._-]/g, '_');";
  assert.ok(local.includes(safeRule) && storage.includes(safeRule), 'the same file-name rule');
  assert.ok(local.includes("new Directory(Paths.document, 'kv')") && storage.includes("new Directory(Paths.document, 'kv')"), 'the same folder');
  assert.ok(local.includes('`${safe(k)}.json`') && storage.includes('`${safe(key)}.json`'), 'the same file name');
  assert.ok(local.includes('`kv:${key}`') && storage.includes('`kv:${key}`'), 'the same web key');
  // writes and removals are localStore's own, and the store is made over the strict reader, never over localStore itself
  assert.match(storage, /setJSON: \(key, value\) => localStore\.setJSON\(key, value\)/);
  assert.match(storage, /remove: \(key\) => localStore\.remove\(key\)/);
  assert.match(storage, /createDiaryStore\(strictStorage\)/);
  assert.doesNotMatch(storage, /createDiaryStore\(localStore\)/);
});

check('the list and the Library card read again when the screen comes back, so a page written a moment ago shows', () => {
  assert.match(read('src/features/diary/useDiary.ts'), /useFocusEffect\(/);
  assert.match(read('src/features/diary/DiaryCard.tsx'), /useDiary\(\)/);
  assert.match(read('app/diary/index.tsx'), /useDiary\(\)/);
});

check('the two pushed screens use the shared Screen without room for a tab bar, and every button has a label', () => {
  for (const f of ['app/diary/index.tsx', 'app/diary/[id].tsx']) {
    const src = read(f);
    assert.match(src, /<Screen tabBar=\{false\}/, f);
    const buttons = [...src.matchAll(/<IconButton\b/g)];
    assert.ok(buttons.length >= 1, f);
    for (const m of buttons) assert.match(src.slice(m.index, src.indexOf('/>', m.index)), /\blabel="|\blabel=\{/, `${f}: an IconButton without a label`);
    for (const m of src.matchAll(/<Pressable\b/g)) assert.match(src.slice(m.index, (m.index ?? 0) + 400), /accessibilityLabel=/, `${f}: a Pressable without a label`);
  }
  assert.match(read('src/features/diary/DiaryCard.tsx'), /<Pressable accessibilityRole="button" accessibilityLabel=/);
  assert.match(read('app/diary/index.tsx'), /Write a new page/);
});

check('deleting a page asks first: the system alert on a phone, the browser confirm on the web (Alert.alert with buttons does nothing there)', () => {
  const src = read('src/features/diary/confirm.ts');
  assert.match(src, /Platform\.OS === 'web'[\s\S]*window\.confirm/);
  assert.match(src, /Alert\.alert\(title, message, \[[\s\S]*style: 'destructive'/);
  for (const f of ['app/diary/index.tsx', 'app/diary/[id].tsx']) assert.match(read(f), /confirmDelete\(/, f);
});

check('deleting the account clears the diary: after the server said yes, never before, and nothing there can stop the sign-out', () => {
  const src = read('app/delete-account.tsx');
  assert.match(src, /import \{ clearDiary \} from '@\/features\/diary\/storage';/);
  const uidAt = src.indexOf('session?.user.id');
  const askAt = src.indexOf("supabase.functions.invoke('delete-account'");
  const failAt = src.indexOf('if (e) throw e;');
  const calls = [...src.matchAll(/clearDiary\(/g)].map((m) => m.index ?? -1);
  assert.equal(calls.length, 1, 'one call, in one place');
  const clearAt = src.indexOf('await clearDiary(uid)');
  assert.equal(clearAt + 'await '.length, calls[0], 'and it is `await clearDiary(uid)`');
  const signOutAt = src.indexOf('await signOut()');
  assert.ok(uidAt > 0 && askAt > uidAt, 'the user id is read before the server is asked (signing out empties the session)');
  assert.ok(failAt > askAt && clearAt > failAt, 'clearDiary comes after the server answered, and only when it did not fail');
  assert.ok(signOutAt > clearAt, 'and before the sign-out');
  assert.match(src, /try \{ await clearDiary\(uid\); \} catch \{/, 'a failure while clearing is swallowed');
  assert.match(src, /if \(uid\) \{\s*try \{ await clearDiary\(uid\)/, 'no session, no call');
});

check('the delete screen tells the person the diary goes with the account, before they type DELETE', () => {
  assert.match(read('app/delete-account.tsx'), /'The pages of your diary on this phone',/);
});

check('account deletion is the only place that clears a diary, and nothing in the app clears one on sign-out', () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(path.join(root, dir))) {
      const rel = path.join(dir, name);
      if (fs.statSync(path.join(root, rel)).isDirectory()) { if (name !== 'node_modules' && name !== '__tests__') walk(rel); continue; }
      if (!/\.tsx?$/.test(name)) continue;
      if (/\bclearDiary\b/.test(read(rel)) && !/delete-account\.tsx$|features\/diary\/(storage|store)\.ts$/.test(rel)) offenders.push(rel);
    }
  };
  walk('app'); walk('src');
  assert.deepEqual(offenders, []);
});

console.log(`${n} of ${n} passed`);
