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
  assert.ok(files.length >= 20, `the scan must see every diary file: ${files.join(', ')}`);
  const offenders: string[] = [];
  for (const f of files) {
    read(f).split('\n').forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '');
      if (/\bfetch\(|XMLHttpRequest|WebSocket|supabase|lib\/api|lib\/net|NetInfo|console\.|StyleSheet\.create/.test(code)) offenders.push(`${f}:${i + 1}  ${line.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(offenders, []);
  for (const f of ['store.ts', 'autosave.ts', 'present.ts', 'richtext.ts', 'media.ts', 'place.ts', 'deviceTypes.ts']) {
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
  assert.match(editor, /router\.canGoBack\(\) \? router\.back\(\) : router\.replace\('\/me'\)/, 'a page opened from a link, with nothing behind it, goes back to Me, where the diary is (its Notes sub-tab), not to the Library');
  assert.doesNotMatch(read('app/diary/index.tsx'), /router\.replace\('\/library'\)/, 'the list of pages too');
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
  assert.match(editor, /<BackButton onPress=\{goBack\} \/>/, 'the Back button (the app\'s) is one of the ways out, not a path of its own');
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
  assert.match(storage, /createDiaryStore\(strictStorage, diaryFiles\)/, 'the photos and videos are files of their own, plugged in here');
  assert.doesNotMatch(storage, /createDiaryStore\(localStore\)/);
});

check('the list reads again when the screen comes back, so a page written a moment ago shows', () => {
  assert.match(read('src/features/diary/useDiary.ts'), /useFocusEffect\(/);
  assert.match(read('app/diary/index.tsx'), /useDiary\(\)/);
});

check('the two pushed screens use the shared Screen without room for a tab bar, and every button has a label', () => {
  for (const f of ['app/diary/index.tsx', 'app/diary/[id].tsx']) {
    const src = read(f);
    assert.match(src, /<Screen tabBar=\{false\}/, f);
    const buttons = [...src.matchAll(/<IconButton\b/g)];
    assert.ok(buttons.length >= 1, f);
    for (const m of buttons) assert.match(src.slice(m.index, src.indexOf('/>', m.index)), /\blabel="|\blabel=\{/, `${f}: an IconButton without a label`);
    // (a wrapper marked accessible={false} is no button for a screen reader: it hides nothing and has no label to give)
    for (const m of src.matchAll(/<Pressable\b/g)) assert.match(src.slice(m.index, (m.index ?? 0) + 400), /accessibilityLabel=|accessible=\{false\}/, `${f}: a Pressable without a label`);
  }
  // the parts the editor is made of: every Pressable says what it does, every field has a label
  for (const f of ['FormatBar.tsx', 'MediaTiles.tsx', 'PlaceParts.tsx', 'PageFooter.tsx']) {
    const src = read(`src/features/diary/${f}`);
    for (const m of src.matchAll(/<Pressable\b/g)) assert.match(src.slice(m.index, (m.index ?? 0) + 520), /accessibilityLabel=/, `${f}: a Pressable without a label`);
    for (const m of src.matchAll(/<TextInput\b/g)) assert.match(src.slice(m.index, (m.index ?? 0) + 700), /accessibilityLabel=/, `${f}: a field without a label`);
  }
  const editor = read('app/diary/[id].tsx');
  for (const m of editor.matchAll(/<TextInput\b/g)) assert.match(editor.slice(m.index, (m.index ?? 0) + 1400), /accessibilityLabel=/, 'a field of the editor without a label');
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
  assert.match(read('app/delete-account.tsx'), /'The pages of your diary on this phone, with their photos, videos and places',/);
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

/* ---------------------------------------------------------------- rich text, photos, videos and the place */

const diaryFiles = (): string[] => [
  ...fs.readdirSync(path.join(root, 'src/features/diary')).filter((f) => /\.tsx?$/.test(f)).map((f) => `src/features/diary/${f}`),
  ...fs.readdirSync(path.join(root, 'app/diary')).map((f) => `app/diary/${f}`),
];
const code = (f: string) => read(f).split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');

check('every native module the diary can use is asked for first (hasNativeModule, which asks requireOptionalNativeModule) and only then required, and nothing imports one at the top: an older app must not crash on a module it does not have', () => {
  const device = code('src/features/diary/device.ts');
  const helper = read('src/lib/optionalNative.ts');
  for (const [key, native, pkg] of [['imagePicker', 'ExponentImagePicker', 'expo-image-picker'], ['location', 'ExpoLocation', 'expo-location'], ['video', 'ExpoVideo', 'expo-video']]) {
    const asked = device.indexOf(`hasNativeModule(NativeName.${key})`);
    const required = device.indexOf(`require('${pkg}')`);
    assert.ok(asked > 0 && required > asked && required - asked < 400, `${pkg}: the phone is asked for ${native} right before the package is required`);
    assert.equal(device.split(`require('${pkg}')`).length - 1, 1, `${pkg} is required in one place`);
    assert.ok(helper.includes(`${key}: '${native}'`), `the helper knows the name ${native}`);
    const build = path.join(root, 'node_modules', pkg, 'build');
    if (fs.existsSync(build)) {
      const text = fs.readdirSync(build).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(build, f), 'utf8')).join('\n');
      assert.ok(text.includes(`('${native}')`), `${pkg} asks for a native module called ${native}: a wrong name would switch the feature off for everybody`);
    }
  }
  assert.match(device, /import \{ NativeName, hasNativeModule \} from '@\/lib\/optionalNative';/);
  assert.match(device, /Platform\.OS === 'web'/, 'and the web is guarded as well');
  for (const f of diaryFiles()) {
    const src = code(f);
    for (const m of src.matchAll(/^import\s+(?!type\b)[^;]*?from\s+'(expo-[\w-]+|@expo\/[\w-]+)'/gm)) {
      assert.ok(['expo-router', 'expo-file-system', 'expo-font'].includes(m[1]), `${f}: imports ${m[1]} at the top (the native ones are required in device.ts after they are asked for)`);
    }
    if (f !== 'src/features/diary/device.ts') assert.doesNotMatch(src, /\brequire\(/, `${f}: no require outside device.ts`);
  }
  for (const f of ['src/features/diary/RichText.tsx']) assert.match(code(f), /import \{ useFonts \} from 'expo-font';/);
});

check('the web gets a device that has none of it, imports nothing, and answers "not here" to every question', () => {
  const web = code('src/features/diary/device.web.ts');
  assert.doesNotMatch(web, /^import (?!type)/m, 'nothing is imported');
  for (const method of ['canPickMedia', 'canFindPlace', 'canPlayVideo', 'pickMedia', 'placeAccess', 'findPlace', 'openMaps', 'openSettings', 'fileUri', 'video']) assert.match(web, new RegExp(`\\b${method}\\b`), method);
  assert.match(web, /canPickMedia: \(\) => false/);
  assert.match(web, /canFindPlace: \(\) => false/);
  assert.match(web, /video: \(\) => null/);
  assert.match(web, /status: 'unavailable'/);
  assert.match(web, /status: 'unsupported'/);
  const types = read('src/features/diary/deviceTypes.ts');
  for (const method of ['canPickMedia', 'canFindPlace', 'canPlayVideo', 'pickMedia', 'placeAccess', 'findPlace', 'openMaps', 'openSettings', 'fileUri', 'video']) assert.match(types, new RegExp(`\\b${method}\\(`), `the shape has ${method}`);
  assert.match(read('src/features/diary/device.ts'), /export const device: Device = \{/);
  assert.match(web, /export const device: Device = \{/);
});

check('the diary needs nothing that is not in the app already: every package it imports is a dependency of the app, so there is no new native module', () => {
  const deps = Object.keys((JSON.parse(read('package.json')) as { dependencies: Record<string, string> }).dependencies);
  const builtIn = new Set(['react', 'react-native']);
  const offenders: string[] = [];
  for (const f of diaryFiles()) {
    for (const m of read(f).matchAll(/(?:from|import|require\()\s*'([^'./@][^']*|@[^'/]+\/[^']+)'/g)) {
      const pkg = m[1].startsWith('@') ? m[1].split('/').slice(0, 2).join('/') : m[1].split('/')[0];
      if (!builtIn.has(pkg) && !deps.includes(pkg)) offenders.push(`${f}: ${pkg}`);
    }
  }
  assert.deepEqual(offenders, []);
  const forbidden = ['react-native-webview', 'expo-av', 'expo-media-library', 'expo-image', 'expo-video-thumbnails', 'expo-image-manipulator', 'expo-document-picker', 'expo-camera'];
  for (const dep of forbidden) assert.ok(!deps.includes(dep), `${dep} is not a dependency, and the diary does not add it`);
});

check('the screens and parts of the diary take their colours from the theme: no colour written out, and no stylesheet', () => {
  const offenders: string[] = [];
  for (const f of diaryFiles().filter((x) => x.endsWith('.tsx'))) {
    code(f).split('\n').forEach((line, i) => {
      if (/#[0-9A-Fa-f]{3,8}\b|\brgba?\(|\bhsla?\(/.test(line)) offenders.push(`${f}:${i + 1}  ${line.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(offenders, []);
});

check('the files of the photos and videos live in a folder of their own (not kv/, which signing out empties), are built from the user id and a checked name, and only deleting the account removes the folder', () => {
  const files = code('src/features/diary/files.ts');
  assert.doesNotMatch(files, /['"`]kv['"`]/, 'not the folder of the small files that signing out wipes');
  assert.match(files, /new Directory\(Paths\.document, \.\.\.mediaDirPieces\(uid\)\)/);
  assert.match(read('src/features/diary/media.ts'), /export const MEDIA_FOLDER = 'diary-media';/);
  assert.equal([...files.matchAll(/isMediaName\(name\)/g)].length, 3, 'copying, removing and finding a file each check the name first');
  assert.doesNotMatch(read('src/lib/auth.tsx'), /diary-media|MEDIA_FOLDER|sweepMedia|attachMedia/, 'signing out knows nothing of the files');
  assert.match(code('src/features/diary/store.ts'), /try \{ await files\.removeAll\(uid\); \}/, 'clearDiary removes the folder');
  // the picker's own copy is only deleted when it is in the app's cache folder: never a file of the person's library
  assert.match(files, /file\.uri\.startsWith\(cache\)/);
  // the path is never kept in a page: the descriptor has a name, not an address
  const media = code('src/features/diary/media.ts');
  assert.doesNotMatch(media, /export type DiaryMedia = \{[^}]*\b(uri|path)\b/, 'a descriptor has no address');
  assert.match(media, /export type DiaryMedia = \{ id: string; kind: MediaKind; name: string; bytes: number;/);
});

check('the editor adds files and the place through the saver (the one queue), formats through the pure functions, and the pickers are asked once per tap', () => {
  const src = read('app/diary/[id].tsx');
  assert.match(src, /saver\.attach\(picked\.assets\)/);
  assert.match(src, /saver\.removeMedia\(/);
  assert.match(src, /saver\.setPlace\(/);
  assert.match(src, /toggleInline\(body, sel, action, BODY_MAX\)/);
  assert.match(src, /toggleBlock\(body, sel,/);
  assert.match(src, /continueList\(body, t,/);
  assert.match(src, /selection=\{forced \?\? undefined\}/, 'the caret is only forced for a moment');
  assert.match(src, /autoFocus=\{!initial\}/);
  assert.doesNotMatch(src, /await saver\.flush\(\)/);
  assert.doesNotMatch(src, /requestPermissionsAsync|requestForegroundPermissionsAsync|launchImageLibraryAsync/, 'permissions and pickers are asked for in device.ts only');
  const device = code('src/features/diary/device.ts');
  assert.equal((device.match(/requestForegroundPermissionsAsync\(\)/g) ?? []).length, 1, 'one prompt in the code, after one tap');
  assert.doesNotMatch(device, /requestBackground|requestMediaLibraryPermissionsAsync|watchPositionAsync|startLocationUpdatesAsync/, 'foreground, once; no tracking; no library permission (the system picker needs none)');
  assert.match(device, /Linking\.openURL\(mapsUrl\(place, Platform\.OS\)\)/);
  assert.match(device, /Linking\.openSettings\(\)/);
  const flow = code('src/features/diary/usePlace.ts');
  assert.match(flow, /step: 'explain'/, 'the explanation comes before the phone asks');
  assert.ok(flow.indexOf("set({ step: 'explain' })") < flow.indexOf('device.findPlace()') || flow.indexOf('const locate') < flow.indexOf('const start'), 'asking is a step the person takes');
});

check('the editor: the marks are inside the text box, Read and Publish are one row at the bottom (a third and two thirds) in both views, and Save draft replaces Read at the top right', () => {
  const src = read('app/diary/[id].tsx');
  const editor = src.slice(src.indexOf('function PageEditor'));
  // the bar is inside the box: after the body field and before the box closes, and no longer on a docked wrapper after the Screen
  const body = editor.indexOf('accessibilityLabel="Page text"');
  const bar = editor.indexOf('<FormatBar ');
  const boxEnds = editor.lastIndexOf('</Screen>'); // the writing view's
  assert.ok(body > 0 && bar > body && bar < boxEnds, 'FormatBar comes after the text field and before the end of the screen content');
  assert.equal([...editor.matchAll(/<FormatBar\b/g)].length, 1, 'one bar');
  assert.match(editor.slice(body, bar), /\/>\s*\{\/\*[^*]*inside the text box[^*]*\*\/\}\s*$/, 'directly under the text field, in the same box');
  assert.doesNotMatch(editor.slice(boxEnds), /<FormatBar\b/, 'not docked after the screen any more');
  // the row at the bottom comes after the Screen, in the reading view and in the writing view
  assert.equal([...editor.matchAll(/\{footerRow\}/g)].length, 2, 'both views have the row');
  for (const m of editor.matchAll(/\{footerRow\}/g)) assert.ok((m.index ?? 0) > editor.lastIndexOf('</Screen>', m.index), 'the row is under the Screen, not inside its scroll');
  const footer = read('src/features/diary/PageFooter.tsx');
  assert.match(footer, /flex: 1, minHeight: FOOTER_BUTTON/, 'the first button is one part');
  assert.match(footer, /flex: 2, minHeight: FOOTER_BUTTON/, 'the second button is two parts');
  assert.match(footer, /accessibilityLabel=\{footer\.toggle === 'Edit' \? 'Edit this page' : 'Read this page'\}/);
  assert.match(footer, /\{primary !== null && \(/, 'a published page that is read has one button only');
  assert.doesNotMatch(editor, /Read this page|Edit this page/, 'the old button of the top bar is gone');
  // the top right
  assert.match(editor, /\{footer\.saveDraft && \(/);
  assert.match(editor, /accessibilityLabel=\{SAVE_DRAFT\}/);
  assert.match(editor, /<AppText variant="label">\{SAVE_DRAFT\}<\/AppText>/);
  assert.match(editor, /const footer = pageFooter\(\{ draft: view\.draft \|\| working === 'publish', reading, hasContent: hasAny \}\);/);
});

check('Publish and Save draft write first and only then go back, through the saver; a write that fails keeps the page and its reason on screen', () => {
  const src = read('app/diary/[id].tsx');
  const editor = src.slice(src.indexOf('function PageEditor'));
  assert.match(editor, /const res = await \(kind === 'publish' \? saver\.publish\(\) : saver\.saveDraft\(\)\);\s*if \(res\.ok && alive\.current\) \{ setLeaving\(true\); disablePrevention\(\); goBack\(\); \}/);
  assert.match(editor, /if \(working !== null\) return;/, 'a second tap while it is written does nothing');
  assert.match(editor, /void finish\('publish'\)/);
  assert.match(editor, /void finish\('draft'\)/);
  assert.doesNotMatch(editor, /await saver\.flush\(\)/);
  const saver = read('src/features/diary/autosave.ts');
  assert.match(saver, /const publish = \(\) => become\('published'\);/);
  assert.match(saver, /const saveDraft = \(\) => become\('draft'\);/);
  assert.match(saver, /let status: NoteStatus = initial \? statusOf\(initial\) : 'draft';/, 'a page begun here is a draft');
  // nothing is sent anywhere: a published note is only a note of the diary on this phone
  for (const f of ['src/features/diary/PageFooter.tsx', 'src/features/diary/autosave.ts']) assert.doesNotMatch(code(f), /\bfetch\(|supabase|lib\/api/, f);
});

check('the list says what is on each page, clean (never a mark), and asks before deleting a page that has photos, videos or a place', () => {
  const list = read('app/diary/index.tsx');
  assert.match(list, /metaLine\(e\)/);
  assert.match(list, /mediaUsageLine\(entries\)/);
  assert.match(list, /confirmDelete\(pageTitle\(e\), async \(\) => setDeleteFailed\(!\(await remove\(e\.id\)\)\), metaLine\(e\) !== ''\)/);
  assert.match(read('src/features/diary/confirm.ts'), /Its photos, videos and place are deleted with it\./);
  const present = read('src/features/diary/present.ts');
  assert.match(present, /plainText\(body, READ_CHARS\)/, 'titles and previews read the page through the rich text reader');
});

check('the rich text and media tests run from diary.test.ts, and the test script of package.json runs diary.test.ts and this file, so none of them can be left out', () => {
  const diary = read('src/features/diary/__tests__/diary.test.ts');
  assert.match(diary, /import '\.\/richtext\.test';/);
  assert.match(diary, /import \{ finished as mediaTests \} from '\.\/media\.test';/);
  assert.match(diary, /await mediaTests;/);
  const script = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts['test:diary'];
  assert.match(script, /tsc -p tsconfig\.diarytest\.json/, 'the tests are compiled first');
  assert.match(script, /diary\.test\.js/, 'the script runs diary.test.js, which runs the rich text and the media tests');
  assert.match(script, /wiring\.test\.js/, 'and this file');
  const tsconfig = read('tsconfig.diarytest.json');
  for (const f of ['diary', 'richtext', 'media', 'wiring']) assert.match(tsconfig, new RegExp(`${f}\\.test\\.ts`), `${f}.test.ts is compiled`);
});

check('every text that says what the diary keeps says it keeps photos, videos and the place too, and that deleting a page or the account removes them', () => {
  const present = read('src/features/diary/present.ts');
  assert.match(present, /Pages, photos, videos and places are not uploaded and not shared/);
  assert.match(read('app/help.tsx'), /Where are my diary pages kept\?'[^}]*photos, videos and places[^}]*Logging out keeps them[^}]*deleting your account deletes the whole diary/);
  // the one thing that leaves the app's hands is said where the place is added and in the help: the phone's own map service may be asked for the name
  assert.match(present, /your phone's own map service may be asked/);
  assert.match(read('app/help.tsx'), /Can I add photos, videos and where I am to a diary page\?'[^}]*map service may be asked[^}]*you can type a name/);
  assert.match(read('app/delete-account.tsx'), /'The pages of your diary on this phone, with their photos, videos and places',/);
  assert.match(read('app/download-data.tsx'), /Your diary is not in the file: its pages, photos, videos and places are only on this phone, and we never receive them\./);
  const auth = read('AUTH.md');
  assert.match(auth, /photos, videos and the place/i);
  assert.match(auth, /diary-media/);
});

console.log(`${n} of ${n} passed`);
