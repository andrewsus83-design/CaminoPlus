// The share-link page of the website (web/s/index.html + web/assets/share.js), in a real browser with the database mocked.
// It serves web/ the way the host does (/s is s/index.html, /faq is faq.html) and answers get_shared() from the cases below.
// Fails on: a request to any other host, a console error or page error (a Content-Security-Policy violation is one), a token
// sent anywhere but in the body of the one POST, text of a note drawn as HTML, or a case that does not show what it must.
//
//   node tools/web-smoke/share-page.mjs                 the checks (light and dark, 390 and 320 wide)
//   node tools/web-smoke/share-page.mjs --shots DIR     the same, and a picture of each case in DIR
//
// The website has no dark theme of its own: in dark mode the page looks as in light; it is run in both so a change that adds one is seen.
import http from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// tools/web-smoke/node_modules when it is installed (npm ci there); otherwise a Playwright found through NODE_PATH.
const { chromium } = await import('playwright').catch(() => createRequire(import.meta.url)('playwright'));

const WEB = resolve(fileURLToPath(new URL('../../web/', import.meta.url)));
const API = 'https://xgikdabgdqmbdgagowva.supabase.co';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp' };
const shotsAt = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;

const T = (c) => c.repeat(43);
const CASES = {
  plan: {
    token: T('P'),
    answer: {
      kind: 'plan', owner: { display_name: 'Maria' }, note: null,
      plan: {
        route_name: 'Camino Francés', start_date: '2026-12-01', total_km: 45.7, stays_included: true,
        days: [
          { day_number: 1, planned_date: '2026-12-01', from_name: 'Saint-Jean-Pied-de-Port', to_name: 'Roncesvalles', planned_distance_km: 24.2, status: 'done', stay_name: 'Albergue de Roncesvalles' },
          { day_number: 2, planned_date: '2026-12-02', from_name: 'Roncesvalles', to_name: 'Zubiri', planned_distance_km: 21.5, status: 'in_progress' },
          { day_number: 3, planned_date: '2026-12-03', from_name: 'Zubiri', to_name: 'Pamplona', planned_distance_km: 20.4, status: 'planned' },
          { day_number: 4, status: 'rest' },
        ],
      },
    },
  },
  note: {
    token: T('N'),
    answer: {
      kind: 'note', owner: { display_name: 'Maria <img src=x onerror=alert(1)>' }, plan: null,
      note: { title: 'The bells at dawn', place: null, written_at: '2026-12-03T07:15:00Z',
        body: 'We left Zubiri before the sun.\n\nThe bells rang twice. <script>alert(1)</script> is just words here.\n\nBuen Camino.' },
    },
  },
  unavailable: { token: T('U'), answer: null },
  malformed: { token: 'not-a-token', answer: 'never asked' },
  failed: { token: T('F'), status: 503 },
};

function serve() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    let p = decodeURIComponent(url.pathname);
    if (p.endsWith('/')) p += 'index.html';
    let file = join(WEB, p);
    if (!file.startsWith(WEB + sep) && file !== WEB) { res.writeHead(403).end(); return; }
    if (!extname(file)) {
      const dir = await stat(file).catch(() => null);
      file = dir?.isDirectory() ? join(file, 'index.html') : file + '.html';
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ origin: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })));
}

const { origin, close } = await serve();
const browser = await chromium.launch();
let checks = 0;
const ok = (name) => { checks += 1; console.log(`ok   ${name}`); };

try {
  if (shotsAt) await mkdir(shotsAt, { recursive: true });
  for (const scheme of ['light', 'dark']) {
    for (const width of [390, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, colorScheme: scheme, deviceScaleFactor: shotsAt ? 2 : 1 });
      for (const [name, c] of Object.entries(CASES)) {
        const page = await context.newPage();
        const problems = [];
        const calls = [];
        // the browser itself logs the 503 of the case that tests it; nothing else may log an error
        page.on('console', (m) => { if (m.type() === 'error' && !(c.status && /status of 503/.test(m.text()))) problems.push(`console: ${m.text()}`); });
        page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
        page.on('dialog', (d) => { problems.push(`a dialog opened: ${d.message()}`); void d.dismiss(); });
        await page.route('**/*', async (route) => {
          const u = new URL(route.request().url());
          if (u.origin === origin) {
            if (u.search.includes(c.token)) problems.push('the token was sent to the web server');
            return route.continue();
          }
          if (u.origin === API && u.pathname === '/rest/v1/rpc/get_shared') {
            const r = route.request();
            calls.push({ method: r.method(), body: r.postDataJSON(), headers: r.headers(), url: r.url() });
            if (c.status) return route.fulfill({ status: c.status, body: 'down' });
            return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(c.answer) });
          }
          problems.push(`request to a host nobody mocked: ${u.href}`);
          return route.abort();
        });
        await page.goto(`${origin}/s#${c.token}`);
        await page.waitForFunction(() => document.getElementById('share')?.getAttribute('aria-busy') === 'false', null, { timeout: 10000 });
        const text = await page.locator('#share').innerText();
        const tag = `${name} ${scheme} ${width}`;

        if (name === 'malformed') assert.equal(calls.length, 0, `${tag}: a malformed token is never sent`);
        else {
          assert.equal(calls.length, 1, `${tag}: one call`);
          assert.equal(calls[0].method, 'POST');
          assert.deepEqual(calls[0].body, { p_token: c.token }, `${tag}: the token goes in the body`);
          assert.ok(!calls[0].url.includes(c.token), `${tag}: never in the address`);
          assert.equal(calls[0].headers.apikey?.startsWith('sb_publishable_'), true, `${tag}: the publishable key`);
          assert.equal(calls[0].headers.authorization, undefined, `${tag}: no user token`);
          assert.equal(calls[0].headers.referer, undefined, `${tag}: no Referer`);
          assert.equal(calls[0].headers.cookie, undefined, `${tag}: no cookie`);
        }
        if (name === 'plan') {
          for (const words of ['Camino Francés', 'Shared by Maria', 'Starts Tue, 1 Dec 2026', '4 days', '45.7 km', 'Saint-Jean-Pied-de-Port to Roncesvalles',
            'Sleeps at Albergue de Roncesvalles', 'Walked', 'Walking', 'Planned', 'Rest day', 'What this link shows', 'the name of the place to sleep',
            'What it does not show', 'Notes, bookings, contact details, health, GPS tracks, stamps and photos.', 'This plan is live']) {
            assert.ok(text.includes(words), `${tag}: shows "${words}"\n${text}`);
          }
          assert.equal(await page.title(), 'Camino Francés · CaminoPlus');
        }
        if (name === 'note') {
          for (const words of ['The bells at dawn', 'Shared by Maria <img src=x onerror=alert(1)>', '3 December 2026', '<script>alert(1)</script> is just words here.',
            'A copy of this one note, made when it was shared.', 'Photos, videos, the other notes and the rest of the journey.']) {
            assert.ok(text.includes(words), `${tag}: shows "${words}"\n${text}`);
          }
          assert.equal(await page.locator('#share img, #share script').count(), 0, `${tag}: the words of a note are never HTML`);
        }
        if (name === 'unavailable' || name === 'malformed') {
          assert.ok(text.includes('This link is not available'), `${tag}: ${text}`);
          assert.ok(!text.includes('Shared by'), `${tag}: nothing else`);
        }
        if (name === 'failed') {
          assert.ok(text.includes('We could not open the link') && text.includes('Try again'), `${tag}: ${text}`);
          await page.unroute('**/*');
          await page.route('**/*', (route) => {
            const u = new URL(route.request().url());
            if (u.origin === origin) return route.continue();
            if (u.origin === API) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'null' });
            problems.push(`request to a host nobody mocked: ${u.href}`);
            return route.abort();
          });
          await page.getByRole('button', { name: 'Try again' }).click();
          await page.waitForFunction(() => document.getElementById('share')?.innerText.includes('This link is not available'));
        }
        // the layout fits the phone: no sideways scroll, text 15 px or more inside the card
        const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(wide <= 0, `${tag}: no sideways scroll (${wide} px too wide)`);
        const small = await page.evaluate(() => [...document.querySelectorAll('#share *')].filter((e) => e.childElementCount === 0 && e.textContent.trim() && parseFloat(getComputedStyle(e).fontSize) < 15).map((e) => `${e.textContent.trim().slice(0, 30)}: ${getComputedStyle(e).fontSize}`));
        assert.deepEqual(small, [], `${tag}: text under 15 px`);
        assert.equal(await page.evaluate(() => document.cookie), '', `${tag}: no cookie`);
        assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0, `${tag}: nothing stored`);
        assert.deepEqual(problems, [], `${tag}: ${problems.join('\n')}`);
        if (shotsAt) await page.screenshot({ path: join(shotsAt, `share-${name}-${scheme}-${width}.png`), fullPage: true });
        ok(tag);
        await page.close();
      }
      await context.close();
    }
  }
  console.log(`${checks} of ${checks} passed`);
} finally {
  await browser.close();
  close();
}
