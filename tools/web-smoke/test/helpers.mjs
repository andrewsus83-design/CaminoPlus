// A tiny "web export" that misbehaves on purpose, one address per way of going wrong. The harness test and the CLI test sweep it and must
// see exactly the failures that are planted in it, and nothing on the one address that is fine.
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const SUPABASE = 'https://fake.supabase.co';

const INDEX = `<!doctype html>
<html><head><meta charset="utf-8"><title>fake app</title></head>
<body><div id="root"></div>
<script>
  const path = location.pathname;
  const root = document.getElementById('root');
  const say = (t) => { root.textContent = t; };
  const later = (f) => setTimeout(f, 20);
  if (path === '/ok') say('All good here');
  else if (path === '/throws') { say('about to throw'); later(() => { throw new Error('boom from a screen'); }); }
  else if (path === '/rejects') { say('about to reject'); later(() => { Promise.reject(new Error('dropped promise')); }); }
  else if (path === '/console-error') { say('logging an error'); console.error('something is wrong in this screen'); }
  else if (path === '/console-warn') { say('only a warning'); console.warn('just a warning'); console.log('and a log'); }
  else if (path === '/blank') { /* draws nothing */ }
  else if (path === '/error-screen') say('Something went wrong\\nError: x is not a function');
  else if (path === '/third-party') { say('calls out'); fetch('https://tracker.example.test/collect').catch(() => {}); }
  else if (path === '/third-party-socket') { say('opens a socket'); try { new WebSocket('wss://socket.example.test/live'); } catch (e) {} }
  else if (path === '/missing-file') { say('asks for a file that is not there'); const s = document.createElement('script'); s.src = '/missing.js'; document.body.appendChild(s); }
  else if (path === '/redirects') { say('redirecting'); history.replaceState({}, '', '/elsewhere'); }
  else if (path === '/supabase') {
    say('asking the database');
    fetch('${SUPABASE}/rest/v1/profiles').then((r) => r.json()).then((rows) => say('rows: ' + rows.length)).catch((e) => later(() => { throw e; }));
  }
  else say('unknown address ' + path);
</script></body></html>`;

/** Writes the fake export (index.html + a script that is a 404 on purpose) and returns its directory. */
export async function fakeExport() {
  const dir = await mkdtemp(join(tmpdir(), 'web-smoke-export-'));
  await writeFile(join(dir, 'index.html'), INDEX);
  return dir;
}

/** The routes of a made-up app source directory, one file per address of the fake export. */
export async function fakeSource(names) {
  const dir = await mkdtemp(join(tmpdir(), 'web-smoke-source-'));
  await writeFile(join(dir, '_layout.tsx'), '<Stack></Stack>');
  for (const n of names) {
    await mkdir(join(dir, n, '..'), { recursive: true });
    await writeFile(join(dir, `${n}.tsx`), '');
  }
  return dir;
}

export const task = (url, over = {}) => ({
  type: 'route', route: { pattern: url, url }, persona: 'out', scheme: 'light', offline: false, label: `${url}  [test]`, ...over,
});
