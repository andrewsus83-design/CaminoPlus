// Plain-node checks for the sample journey (no React Native). Run: npm run test:lib
// Besides the data, they check the bundled files next to it: a sample must never point at a missing file, and the
// whole set must stay small enough to ship inside the app.
import assert from 'node:assert/strict';
import { existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { LEADING_CELLS, gridRows } from '../gridLayout';
import { SAMPLE_BANNER, SAMPLE_JOURNEY, SAMPLE_VIEWER_LABEL, isSampleId, sampleId } from '../sampleJourney';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };
const dir = join(process.cwd(), 'assets', 'journey-sample'); // npm test runs from mobile/

check('at least 8 samples; the write card is the first cell of their grid, so ten samples and the card are 11 cells and the last sample stands alone on its row, as it does for any even number of real posts', () => {
  assert.ok(SAMPLE_JOURNEY.length >= 8);
  assert.equal(SAMPLE_JOURNEY.length, 10);
  assert.equal(gridRows(SAMPLE_JOURNEY.length + LEADING_CELLS).at(-1)?.length, 1, 'the last row: one tile (by design: the grid already ends on one tile for an odd number of cells)');
});

check('keys and ids are unique, ids are recognised as samples and real ids are not', () => {
  const keys = SAMPLE_JOURNEY.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const s of SAMPLE_JOURNEY) assert.ok(isSampleId(sampleId(s.key)));
  assert.equal(isSampleId('0f9c2f3a-7d0e-4c1b-9a53-6f2d3b1c0a11'), false);
});

check('every sample has a short place and caption', () => {
  for (const s of SAMPLE_JOURNEY) {
    assert.ok(s.place.trim().length > 0 && s.place.length <= 30, `place of ${s.key}`);
    assert.ok(s.body.trim().length > 0 && s.body.length <= 90, `caption of ${s.key}`);
  }
});

check('clips are mixed in between stills: several of each, never three clips in a row', () => {
  const clips = SAMPLE_JOURNEY.filter((s) => s.video).length;
  assert.ok(clips >= 4 && clips <= SAMPLE_JOURNEY.length - 3, `${clips} clips`);
  for (let i = 0; i + 2 < SAMPLE_JOURNEY.length; i += 1) {
    assert.ok(!(SAMPLE_JOURNEY[i].video && SAMPLE_JOURNEY[i + 1].video && SAMPLE_JOURNEY[i + 2].video), `three clips in a row at ${i}`);
  }
});

check('the labels say Sample and AI-generated (the pictures are never passed off as pilgrims photos)', () => {
  assert.match(SAMPLE_BANNER, /Sample/);
  assert.match(SAMPLE_BANNER, /AI-generated/);
  assert.match(SAMPLE_BANNER, /Tap the first card to write your own first post\./, 'the way to write is the first card of the grid');
  assert.doesNotMatch(SAMPLE_BANNER, /\bpen\b/, 'there is no pen on this tab any more: the gold button of Me is the chat button');
  assert.match(SAMPLE_VIEWER_LABEL, /Sample/);
  assert.match(SAMPLE_VIEWER_LABEL, /AI-generated/);
  assert.ok(!SAMPLE_BANNER.includes('—') && !SAMPLE_VIEWER_LABEL.includes('—'), 'no em dashes in the copy');
});

check('every sample has its picture, every clip has its file, and there are no stray files', () => {
  const expected = new Set<string>();
  for (const s of SAMPLE_JOURNEY) {
    const img = `${s.key}.webp`;
    assert.ok(existsSync(join(dir, img)), `missing ${img}`);
    expected.add(img);
    if (s.video) {
      const vid = `${s.key}.mp4`;
      assert.ok(existsSync(join(dir, vid)), `missing ${vid}`);
      expected.add(vid);
    }
  }
  const extra = readdirSync(dir).filter((f) => /\.(webp|mp4)$/.test(f) && !expected.has(f));
  assert.deepEqual(extra, [], 'files that no sample uses would only make the app bigger');
});

check('the set stays small: a picture under 400 KB, a clip under 2 MB, everything under 10 MB', () => {
  let total = 0;
  for (const f of readdirSync(dir).filter((x) => /\.(webp|mp4)$/.test(x))) {
    const size = statSync(join(dir, f)).size;
    total += size;
    assert.ok(size <= (f.endsWith('.mp4') ? 2_000_000 : 400_000), `${f} is ${Math.round(size / 1024)} KB`);
  }
  assert.ok(total <= 10_000_000, `${(total / 1e6).toFixed(1)} MB in total`);
});

console.log(`${n} of ${n} passed`);
