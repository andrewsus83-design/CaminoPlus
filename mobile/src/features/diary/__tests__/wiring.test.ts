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

check('the editor saves when the person leaves: on Back, when the screen goes away, and when the app goes to the background', () => {
  const hook = read('src/features/diary/useDiary.ts');
  assert.match(hook, /AppState\.addEventListener\('change'/);
  assert.match(hook, /state !== 'active'\) void saver\.flush\(\)/);
  assert.match(hook, /return \(\) => \{ alive\.current = false; void saver\.flush\(\); \}/, 'the saver is flushed when the screen goes away');
  const editor = read('app/diary/[id].tsx');
  assert.match(editor, /await saver\.flush\(\)/, 'Back writes before it leaves');
  assert.match(editor, /autoFocus=\{!initial\}/, 'a new page opens ready to write');
  assert.match(editor, /router\.canGoBack\(\) \? router\.back\(\) : router\.replace\('\/library'\)/);
  assert.match(editor, /Saved on this phone/);
  assert.match(editor, /Saving…/);
  assert.match(editor, /This page is not here/);
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
