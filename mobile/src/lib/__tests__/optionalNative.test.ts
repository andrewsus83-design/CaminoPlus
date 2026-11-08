// Plain-node check of one rule: a package whose native part an older installed app may not have is never required
// without asking first (src/lib/optionalNative.ts). Metro reports a lazily required module that throws as a FATAL
// error, so a try/catch around the require does not protect: this crashed Settings in a development build made before
// expo-updates was added. Run: npm run test:lib
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };
const root = process.cwd(); // npm test runs from mobile/

// package -> the name of its native module, as the package itself asks for it
const GUARDED: Record<string, string> = {
  'expo-updates': 'ExpoUpdates',
  'expo-clipboard': 'ExpoClipboard',
  'expo-image-picker': 'ExponentImagePicker',
  'expo-video': 'ExpoVideo',
  'expo-apple-authentication': 'ExpoAppleAuthentication',
};

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
const files = [...sources('src'), ...sources('app')].filter((f) => !f.endsWith(join('lib', 'optionalNative.ts')));
const read = (f: string) => readFileSync(join(root, f), 'utf8');

check('the helper names the native module of each package exactly as the package asks for it', () => {
  const helper = read(join('src', 'lib', 'optionalNative.ts'));
  for (const [pkg, native] of Object.entries(GUARDED)) {
    assert.ok(helper.includes(`'${native}'`), `optionalNative.ts does not name ${native}`);
    const build = join(root, 'node_modules', pkg, 'build');
    if (!existsSync(build)) continue; // packages not installed (a partial checkout): nothing to compare with
    const text = readdirSync(build).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(build, f), 'utf8')).join('\n');
    assert.ok(text.includes(`('${native}')`), `${pkg} does not ask for a native module called ${native}: a wrong name would switch the feature off for everybody`);
  }
});

check('every require of such a package comes after a hasNativeModule() question in the same file', () => {
  let seen = 0;
  for (const f of files) {
    const text = read(f);
    for (const pkg of Object.keys(GUARDED)) {
      const req = text.indexOf(`require('${pkg}')`);
      if (req < 0) continue;
      seen += 1;
      const ask = text.indexOf(`hasNativeModule(NativeName.`);
      assert.ok(ask >= 0 && ask < req, `${f} requires ${pkg} without asking hasNativeModule(NativeName...) first`);
      assert.ok(/from '(@\/lib|\.)\/optionalNative'/.test(text), `${f} does not import the helper`);
    }
  }
  assert.ok(seen >= 7, `expected the known dynamic requires (updates, clipboard, image picker x3, video x2, apple authentication), found ${seen}`);
});

check('the question names the right package in each file', () => {
  const expectations: Array<[string, string, string]> = [
    [join('src', 'lib', 'useBuildInfo.ts'), 'expo-updates', 'NativeName.updates'],
    [join('src', 'lib', 'clipboard.ts'), 'expo-clipboard', 'NativeName.clipboard'],
    [join('src', 'lib', 'avatar.ts'), 'expo-image-picker', 'NativeName.imagePicker'],
    [join('src', 'features', 'social', 'pick.ts'), 'expo-image-picker', 'NativeName.imagePicker'],
    [join('app', 'write.tsx'), 'expo-image-picker', 'NativeName.imagePicker'],
    [join('app', 'write.tsx'), 'expo-video', 'NativeName.video'],
    [join('src', 'features', 'me', 'JourneyGrid.tsx'), 'expo-video', 'NativeName.video'],
    [join('src', 'lib', 'authApple.ts'), 'expo-apple-authentication', 'NativeName.appleAuthentication'],
  ];
  for (const [f, pkg, name] of expectations) {
    const text = read(f);
    const req = text.indexOf(`require('${pkg}')`);
    assert.ok(req >= 0, `${f} no longer requires ${pkg}: update this test`);
    const ask = text.lastIndexOf(`hasNativeModule(${name})`, req);
    assert.ok(ask >= 0, `${f} requires ${pkg} without hasNativeModule(${name}) just before`);
    assert.ok(req - ask < 400, `${f}: the question about ${pkg} is too far from its require to protect it`);
  }
});

check('no file imports such a package statically (a static import runs at start-up and cannot be asked first)', () => {
  for (const f of files) {
    const text = read(f);
    for (const pkg of Object.keys(GUARDED)) {
      assert.ok(!new RegExp(`^import[^;]*from '${pkg}'`, 'm').test(text.replace(/^import type .*$/gm, '')), `${f} imports ${pkg} statically`);
    }
  }
});

console.log(`${n} of ${n} passed`);
