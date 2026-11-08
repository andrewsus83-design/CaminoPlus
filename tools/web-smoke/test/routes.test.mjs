// Route discovery and the account-state guards: first on a made-up app directory where every rule is visible, then on the real one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PERSONAS, SAMPLE_PARAM, classifyFile, discoverRoutes, evalGuard, parseBool, patternOf, scanLayout, urlOf } from '../routes.mjs';

const here = dirname(fileURLToPath(import.meta.url));

test('files: layouts, +special files, API routes and other platforms are not routes', () => {
  assert.equal(classifyFile('(tabs)/me.tsx').kind, 'route');
  assert.equal(classifyFile('(tabs)/_layout.tsx').kind, 'layout');
  assert.equal(classifyFile('_layout.tsx').kind, 'layout');
  for (const f of ['+not-found.tsx', '+html.tsx', '+native-intent.ts', 'hello+api.ts', 'a/b+api.tsx', 'thing.native.tsx', 'thing.ios.tsx', 'thing.android.js', '.DS_Store', 'types.d.ts', 'notes.md', 'image.png']) {
    assert.equal(classifyFile(f).kind, 'skip', f);
  }
  assert.equal(classifyFile('thing.web.tsx').kind, 'route');
  assert.equal(classifyFile('thing.web.tsx').stem, 'thing');
});

test('patterns: (group) folders vanish, index is the folder, [param] stays in the pattern', () => {
  assert.equal(patternOf('index'), '/');
  assert.equal(patternOf('(tabs)/me'), '/me');
  assert.equal(patternOf('(tabs)/(deep,er)/me'), '/me');
  assert.equal(patternOf('business/index'), '/business');
  assert.equal(patternOf('chat/info/[id]'), '/chat/info/[id]');
  assert.equal(patternOf('(auth)/sign-in'), '/sign-in');
});

test('urls: [param] gets the sample value, a catch-all gets two segments, an override wins', () => {
  assert.equal(urlOf('/me'), '/me');
  assert.equal(urlOf('/chat/info/[id]'), `/chat/info/${SAMPLE_PARAM}`);
  assert.equal(urlOf('/docs/[...rest]'), '/docs/a/b');
  assert.equal(urlOf('/docs/[[...rest]]'), '/docs/a/b');
  assert.equal(urlOf('/stay/[id]', { '/stay/[id]': 'st1' }), '/stay/st1');
  assert.equal(urlOf('/a/[x]/b/[y]', { '/a/[x]/b/[y]': { x: '1', y: '2' } }), '/a/1/b/2');
});

test('guards: names, !, &&, || and parentheses, evaluated per account state', () => {
  const consts = { signedIn: '!!session', onboarded: 'signedIn && !!journey' };
  const at = (expr, p) => evalGuard(expr, PERSONAS[p].facts, consts);
  assert.deepEqual(['out', 'new', 'in'].map((p) => at('!signedIn', p)), [true, false, false]);
  assert.deepEqual(['out', 'new', 'in'].map((p) => at('signedIn', p)), [false, true, true]);
  assert.deepEqual(['out', 'new', 'in'].map((p) => at('signedIn && !onboarded', p)), [false, true, false]);
  assert.deepEqual(['out', 'new', 'in'].map((p) => at('onboarded', p)), [false, false, true]);
  assert.deepEqual(['out', 'new', 'in'].map((p) => at('!(signedIn && !onboarded) || false', p)), [true, false, true]);
});

test('guards: something the test cannot read is an error, never a silent "true"', () => {
  assert.throws(() => evalGuard('mystery', PERSONAS.in.facts, {}), /does not know/);
  assert.throws(() => parseBool('a === b'), /cannot read/);
  assert.throws(() => parseBool('user?.id'), /cannot read/);
  assert.throws(() => parseBool('(a && b'), /missing \)/);
  assert.throws(() => evalGuard('a', {}, { a: 'a' }), /itself/);
});

test('layouts: screens keep the guards of the blocks around them, comments are ignored', () => {
  const src = `
    export default function L() {
      const { session, journey } = useAuth();
      const signedIn = !!session;
      const onboarded = signedIn && !!journey;
      const router = useRouter();
      return (
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          {/* <Stack.Screen name="commented-out" /> */}
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
          <Stack.Protected guard={onboarded}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="write" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
            <Stack.Protected guard={signedIn}>
              <Stack.Screen name="deep" />
            </Stack.Protected>
          </Stack.Protected>
        </Stack>
      );
    }`;
  const { screens, consts } = scanLayout(src);
  assert.deepEqual(screens.map((s) => [s.name, s.guards]), [
    ['index', []],
    ['(auth)', ['!signedIn']],
    ['(tabs)', ['onboarded']],
    ['write', ['onboarded']],
    ['deep', ['onboarded', 'signedIn']],
  ]);
  assert.deepEqual(consts, { signedIn: '!!session', onboarded: 'signedIn && !!journey' });
});

async function fakeApp(files) {
  const dir = await mkdtemp(join(tmpdir(), 'web-smoke-routes-'));
  for (const [name, text] of Object.entries(files)) {
    await mkdir(dirname(join(dir, name)), { recursive: true });
    await writeFile(join(dir, name), text);
  }
  return dir;
}

const LAYOUT = `
  const { session, journey } = useAuth();
  const signedIn = !!session;
  const onboarded = signedIn && !!journey;
  <Stack>
    <Stack.Screen name="index" />
    <Stack.Protected guard={!signedIn}><Stack.Screen name="(auth)" /></Stack.Protected>
    <Stack.Protected guard={signedIn && !onboarded}><Stack.Screen name="onboarding" /></Stack.Protected>
    <Stack.Protected guard={onboarded}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="item/[id]" />
    </Stack.Protected>
  </Stack>`;

test('discovery on a made-up app: every file becomes the right route in the right account states', async () => {
  const dir = await fakeApp({
    '_layout.tsx': LAYOUT,
    'index.tsx': '', '+not-found.tsx': '', 'hello+api.ts': '', 'onboarding.tsx': '', 'item/[id].tsx': '', 'new-screen.tsx': '', 'thing.native.tsx': '',
    '(auth)/_layout.tsx': '', '(auth)/sign-in.tsx': '',
    '(tabs)/_layout.tsx': '<Tabs><Tabs.Screen name="home" /></Tabs>', '(tabs)/home.tsx': '', '(tabs)/more/index.tsx': '',
  });
  try {
    const { routes, problems } = await discoverRoutes(dir);
    const got = Object.fromEntries(routes.map((r) => [r.pattern, r.personas.join(',')]));
    assert.deepEqual(got, {
      '/': 'out,new,in',
      '/sign-in': 'out',
      '/onboarding': 'new',
      '/home': 'in',
      '/more': 'in',
      '/item/[id]': 'in',
      '/new-screen': 'out,new,in', // a screen no layout mentions is open to everyone: it is swept in every state
    });
    assert.equal(routes.find((r) => r.pattern === '/item/[id]').url, `/item/${SAMPLE_PARAM}`);
    assert.deepEqual(problems, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('discovery reports a screen a layout declares that has no file, and a route nobody can reach', async () => {
  const dir = await fakeApp({
    '_layout.tsx': `<Stack><Stack.Screen name="ghost" /><Stack.Protected guard={signedIn && !signedIn}><Stack.Screen name="never" /></Stack.Protected></Stack>
      const signedIn = !!session;`,
    'never.tsx': '',
  });
  try {
    const { problems } = await discoverRoutes(dir);
    assert.equal(problems.length, 2, problems.join('\n'));
    assert.ok(problems.some((p) => /declares the screen "ghost"/.test(p)));
    assert.ok(problems.some((p) => /\/never .*cannot be reached/.test(p)));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the real app: no problems, and the routes sit in the account states the guards of app/_layout.tsx put them in', async () => {
  const { routes, problems } = await discoverRoutes(join(here, '..', '..', '..', 'mobile', 'app'));
  assert.deepEqual(problems, []);
  const personas = (pattern) => routes.find((r) => r.pattern === pattern)?.personas.join(',');
  // signed out only
  for (const p of ['/welcome', '/sign-in', '/sign-up', '/forgot-password']) assert.equal(personas(p), 'out', p);
  // the account states between: signed in without a journey sees onboarding, and only that of the main flow
  assert.equal(personas('/onboarding'), 'new');
  // the app proper needs an account and a journey
  for (const p of ['/me', '/stays', '/maps', '/explore', '/library', '/settings', '/diary', '/stay/[id]', '/chat/[id]']) assert.equal(personas(p), 'in', p);
  // the Bible screens (the chapters of a book, and the reader) are swept as the real screens: with the Psalms and Psalm 121, not with a made-up id that would be "Not found"
  for (const [pattern, url] of [['/library/bible/[code]', '/library/bible/PSA'], ['/library/bible/[code]/[chapter]', '/library/bible/PSA/121']]) {
    assert.equal(personas(pattern), 'in', pattern);
    assert.equal(routes.find((r) => r.pattern === pattern)?.url, url, pattern);
  }
  // open to every state
  for (const p of ['/', '/licences', '/auth-callback', '/reset-password']) assert.equal(personas(p), 'out,new,in', p);
  assert.ok(routes.length >= 30, `only ${routes.length} routes found`);
  for (const r of routes) assert.ok(r.personas.length > 0, `${r.pattern} is reachable in no account state`);
});
