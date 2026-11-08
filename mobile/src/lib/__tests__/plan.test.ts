// Plain-node checks of the plan numbers (src/lib/plan.ts): the one place the app takes them from. The same numbers are in the
// migration, the seed, the website and the design page; tools/tests/test_plan_numbers.py compares all of them. This test covers
// the app side: what the app's own formatter prints for each number, and the words of the plan lines. Run: npm run test:lib
import assert from 'node:assert/strict';
import { config } from '../config';
import { formatBytes } from '../format';
import {
  ADDON_PRICE_LABEL, ADDON_PRICE_USD, ADDON_STORAGE_BYTES, ADDON_STORAGE_LABEL, FREE_MEDIA_FACTS, FREE_STORAGE_BYTES, FREE_STORAGE_LABEL, MEDIA_HEADLINE,
  NO_CLOUD_STORAGE_TEXT, PLUS_MEDIA_FACTS, PLUS_PRICE_LABEL, PLUS_PRICE_USD, PLUS_STORAGE_BYTES, PLUS_STORAGE_LABEL,
} from '../plan';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };

check('the numbers: Free 500 MB, Plus 10 GB, one add-on of 10 GB, in DECIMAL bytes (the database stores the same)', () => {
  assert.equal(FREE_STORAGE_BYTES, 500_000_000);
  assert.equal(PLUS_STORAGE_BYTES, 10_000_000_000);
  assert.equal(ADDON_STORAGE_BYTES, 10_000_000_000);
  assert.equal(PLUS_PRICE_USD, 12);
  assert.equal(ADDON_PRICE_USD, 5);
});

check('the formatter of the app prints exactly the marketing words for every number: "500 MB" and "10 GB"', () => {
  assert.equal(formatBytes(FREE_STORAGE_BYTES), '500 MB');
  assert.equal(formatBytes(PLUS_STORAGE_BYTES), '10 GB');
  assert.equal(formatBytes(ADDON_STORAGE_BYTES), '10 GB');
  assert.equal(formatBytes(PLUS_STORAGE_BYTES + ADDON_STORAGE_BYTES), '20 GB'); // what Settings shows for Plus with the add-on
  assert.equal(FREE_STORAGE_LABEL, '500 MB');
  assert.equal(PLUS_STORAGE_LABEL, '10 GB');
  assert.equal(ADDON_STORAGE_LABEL, '10 GB');
});

check('why the numbers are decimal: the binary ones would print "537 MB" and "11 GB", not the marketing numbers', () => {
  assert.equal(formatBytes(536_870_912), '537 MB');
  assert.equal(formatBytes(10_737_418_240), '11 GB');
  assert.equal(formatBytes(5_368_709_120), '5.4 GB'); // the old number of the plan, as it printed
});

check('prices: $12 a year and $5 a year; the price label the app already used is the same constant', () => {
  assert.equal(PLUS_PRICE_LABEL, '$12 / year');
  assert.equal(ADDON_PRICE_LABEL, '$5 / year');
  assert.equal(config.priceLabel, PLUS_PRICE_LABEL);
});

check('the lines about photos and video: the headline, then facts that hold on every phone (no 720p or 1080p, 4K is only "planned")', () => {
  assert.equal(MEDIA_HEADLINE, 'Higher resolution photos and video');
  assert.equal(FREE_MEDIA_FACTS, 'Photos up to 1,280 px on the long side. Video up to 60 seconds, up to 25 MB.');
  assert.equal(PLUS_MEDIA_FACTS, 'Photos up to 3,840 px on the long side. Video up to 60 seconds, up to 45 MB. 4K video is planned.');
  for (const t of [FREE_MEDIA_FACTS, PLUS_MEDIA_FACTS, MEDIA_HEADLINE]) {
    assert.ok(!/\b(720p|1080p|2160p|8K)\b/i.test(t), `no promise of a video size class as a rule of the app: ${t}`);
    assert.ok(!/up to 4K/i.test(t), `never "up to 4K" near video: ${t}`);
  }
  assert.ok(!/4K/.test(FREE_MEDIA_FACTS), 'nothing about 4K on the free plan');
});

check('no comparison and no "unlimited" in anything the plan constants say', () => {
  const words = /\b(more than|less than|better than|cheaper|best|unlimited|biggest|largest)\b/i;
  for (const t of [FREE_STORAGE_LABEL, PLUS_STORAGE_LABEL, ADDON_STORAGE_LABEL, PLUS_PRICE_LABEL, ADDON_PRICE_LABEL, MEDIA_HEADLINE, FREE_MEDIA_FACTS, PLUS_MEDIA_FACTS, NO_CLOUD_STORAGE_TEXT]) {
    assert.ok(!words.test(t), t);
  }
});

check('the line under the storage meter, for an account without cloud storage, does not offer or promise anything', () => {
  assert.equal(NO_CLOUD_STORAGE_TEXT, 'Cloud storage is switched off for now. Photos and videos cannot be saved yet.');
  assert.ok(!/Pilgrim Plus|\$/.test(NO_CLOUD_STORAGE_TEXT), 'no sales line');
});

console.log(`${n} of ${n} passed`);
