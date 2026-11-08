// Renders what only a browser can: the cover PNG of a book and its reading PDF. tools/build_books.py writes the HTML
// and calls this once with a jobs file; run it by hand only to debug.
//
//   cd tools/offline-maps && npm ci        # once: provides Playwright (or have `playwright` installed globally)
//   node tools/render_books.mjs jobs.json
//
// jobs.json: [{ "cover_html": "...", "cover_png": "...", "pdf_html": "...", "pdf": "...", "title": "..." }, ...]
// Every path is absolute. A job may hold a cover, a pdf or both. Fonts come from web/assets/fonts through file:// URLs
// written into the HTML, so nothing is fetched from the network.
import { readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

function loadPlaywright() {
  for (const base of [join(root, 'tools', 'offline-maps', 'package.json'), join(root, 'package.json'), import.meta.url]) {
    try {
      return createRequire(base)('playwright');
    } catch { /* try the next place */ }
  }
  throw new Error('Playwright not found: run `npm ci` in tools/offline-maps, or install playwright');
}

const jobsFile = process.argv[2];
if (!jobsFile) {
  console.error('usage: node tools/render_books.mjs jobs.json');
  process.exit(2);
}
const jobs = JSON.parse(await readFile(jobsFile, 'utf8'));
const { chromium } = loadPlaywright();
const browser = await chromium.launch();
let failed = 0;
try {
  for (const job of jobs) {
    try {
      if (job.cover_html && job.cover_png) {
        const page = await browser.newPage({ viewport: { width: 1600, height: 2560 }, deviceScaleFactor: 1 });
        await page.goto(pathToFileURL(job.cover_html).href, { waitUntil: 'load' });
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: job.cover_png, type: 'png', clip: { x: 0, y: 0, width: 1600, height: 2560 } });
        await page.close();
        console.log(`cover  ${job.title}`);
      }
      if (job.pdf_html && job.pdf) {
        const page = await browser.newPage();
        await page.goto(pathToFileURL(job.pdf_html).href, { waitUntil: 'load' });
        await page.evaluate(() => document.fonts.ready);
        await page.pdf({
          path: job.pdf,
          width: '6in',
          height: '9in',
          margin: { top: '0.8in', bottom: '0.9in', left: '0.7in', right: '0.7in' },
          printBackground: true,
          displayHeaderFooter: true,
          headerTemplate: '<span></span>',
          footerTemplate: '<div style="width:100%;text-align:center;font-size:8px;color:#556274;font-family:serif"><span class="pageNumber"></span></div>',
        });
        await page.close();
        console.log(`pdf    ${job.title}`);
      }
    } catch (e) {
      failed += 1;
      console.error(`FAILED ${job.title}: ${e.message}`);
    }
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
