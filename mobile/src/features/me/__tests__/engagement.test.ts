// Plain-node checks for the engagement stats of a journey post (no React Native). Run: npm run test:me
import assert from 'node:assert/strict';
import { countLabel, formatCount } from '../../../lib/engagement';
import { railCounts, railItems } from '../../../lib/actionRail';
import { parseEngagementRows, withEngagement } from '../../../lib/postEngagement';
import type { PostEngagement } from '../../../lib/postEngagement';

let n = 0;
const test = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log(`ok ${n} - ${name}`);
};

const post = (over: Record<string, unknown> = {}) => ({ id: 'p1', like_count: 12, comment_count: 3, ...over });
const counts = (...rows: [string, number, number][]) => new Map<string, PostEngagement>(rows.map(([id, save_count, share_count]) => [id, { save_count, share_count }]));

/* ---------------- formatCount ---------------- */

test('formatCount: under a thousand it is the number', () => {
  for (const [input, want] of [[0, '0'], [1, '1'], [7, '7'], [12, '12'], [999, '999']] as const) assert.equal(formatCount(input), want);
});

test('formatCount: thousands have one decimal, and a .0 is dropped (1,234 is 1.2K)', () => {
  for (const [input, want] of [[1000, '1K'], [1099, '1K'], [1100, '1.1K'], [1234, '1.2K'], [9500, '9.5K'], [10000, '10K'], [12345, '12.3K'], [100000, '100K'], [123456, '123.4K']] as const) {
    assert.equal(formatCount(input), want);
  }
});

test('formatCount rounds down, so the figure is never more than the real count', () => {
  assert.equal(formatCount(1999), '1.9K');
  assert.equal(formatCount(9999), '9.9K');
  assert.equal(formatCount(999999), '999.9K'); // never "1000K"
  assert.equal(formatCount(1999999), '1.9M');
  assert.equal(formatCount(1234.9), '1.2K');
  assert.equal(formatCount(12.9), '12');
});

test('formatCount: millions and billions', () => {
  for (const [input, want] of [[1000000, '1M'], [1250000, '1.2M'], [12345678, '12.3M'], [999999999, '999.9M'], [1000000000, '1B'], [2500000000, '2.5B']] as const) {
    assert.equal(formatCount(input), want);
  }
});

test('formatCount gives nothing for what is not a count, never a made-up number', () => {
  for (const bad of [NaN, Infinity, -Infinity, -1, -0.5, undefined as unknown as number, null as unknown as number, '12' as unknown as number]) assert.equal(formatCount(bad), '');
});

/* ---------------- countLabel ---------------- */

test('countLabel: the whole number in words, singular only for exactly one', () => {
  assert.equal(countLabel('likes', 12), '12 likes');
  assert.equal(countLabel('likes', 1), '1 like');
  assert.equal(countLabel('likes', 0), '0 likes');
  assert.equal(countLabel('comments', 1), '1 comment');
  assert.equal(countLabel('comments', 2), '2 comments');
  assert.equal(countLabel('shares', 1), '1 share');
  assert.equal(countLabel('shares', 40), '40 shares');
  assert.equal(countLabel('bookmarks', 1), '1 bookmark');
  assert.equal(countLabel('bookmarks', 7), '7 bookmarks');
});

test('countLabel spells out big numbers in full, with thousands separators', () => {
  assert.equal(countLabel('likes', 1234), '1,234 likes');
  assert.equal(countLabel('likes', 999999), '999,999 likes');
  assert.equal(countLabel('comments', 1234567), '1,234,567 comments');
  assert.equal(countLabel('likes', 1000), '1,000 likes');
});

/* ---------------- parseEngagementRows ---------------- */

test('parseEngagementRows: rows of id, save_count and share_count become counts by post id', () => {
  const m = parseEngagementRows([{ id: 'a', save_count: 3, share_count: 1 }, { id: 'b', save_count: 0, share_count: 0 }]);
  assert.ok(m);
  assert.deepEqual([...m.entries()], [['a', { save_count: 3, share_count: 1 }], ['b', { save_count: 0, share_count: 0 }]]);
});

test('parseEngagementRows: a result that is not a list of rows means "not available" (null), an empty list does not', () => {
  for (const bad of [null, undefined, 'x', 7, {}, { data: [] }]) assert.equal(parseEngagementRows(bad), null);
  const empty = parseEngagementRows([]);
  assert.ok(empty);
  assert.equal(empty.size, 0);
});

test('parseEngagementRows skips a row that is not complete and sane, so one odd row cannot give another post a number', () => {
  const m = parseEngagementRows([
    { id: 'ok', save_count: 2, share_count: 5 },
    { id: 'no-share', save_count: 2 },
    { id: 'null-save', save_count: null, share_count: 1 },
    { id: 'text', save_count: '2', share_count: 1 },
    { id: 'nan', save_count: NaN, share_count: 1 },
    { id: 'negative', save_count: -1, share_count: 1 },
    { save_count: 1, share_count: 1 },
    { id: 7, save_count: 1, share_count: 1 },
    null,
    'row',
    42,
  ]);
  assert.ok(m);
  assert.deepEqual([...m.keys()], ['ok']);
});

/* ---------------- withEngagement ---------------- */

test('withEngagement: no counts (the query failed) leaves the very same posts, with no new fields', () => {
  const posts = [post({ id: 'a' }), post({ id: 'b' })];
  const out = withEngagement(posts, null);
  assert.equal(out, posts);
  for (const p of out) {
    assert.ok(!('save_count' in p));
    assert.ok(!('share_count' in p));
  }
});

test('withEngagement: a post gets its two counts when the database answered for it, and only then', () => {
  const posts = [post({ id: 'a' }), post({ id: 'b' }), post({ id: 'c' })];
  const out = withEngagement(posts, counts(['a', 4, 2], ['c', 0, 0], ['zzz', 9, 9]));
  assert.deepEqual(out[0], { id: 'a', like_count: 12, comment_count: 3, save_count: 4, share_count: 2 });
  assert.ok(!('save_count' in out[1]) && !('share_count' in out[1]), 'b has no row, so it gets nothing');
  assert.deepEqual(out[2], { id: 'c', like_count: 12, comment_count: 3, save_count: 0, share_count: 0 }, 'a real 0 stays 0');
  assert.equal(out.length, 3);
});

test('withEngagement does not change the posts it was given, and keeps their order', () => {
  const posts = [post({ id: 'a' }), post({ id: 'b' })];
  const before = JSON.stringify(posts);
  const out = withEngagement(posts, counts(['b', 1, 1], ['a', 2, 2]));
  assert.equal(JSON.stringify(posts), before);
  assert.deepEqual(out.map((p) => p.id), ['a', 'b']);
});

test('end to end: what the rail shows under its icons with and without the two newer counts (the rail itself is tested in lib/__tests__/actionRail.test.ts)', () => {
  const posts = [post({ id: 'a' })];
  const texts = (p: object) => railItems({ counts: railCounts(p) }).map((i) => i.countText); // love, bookmark, comments, share
  assert.deepEqual(texts(withEngagement(posts, null)[0]), ['12', undefined, '3', undefined]);
  assert.deepEqual(texts(withEngagement(posts, counts(['a', 1, 0]))[0]), ['12', '1', '3', '0']);
  assert.deepEqual(texts(withEngagement(posts, parseEngagementRows([]))[0]), ['12', undefined, '3', undefined]);
});

console.log(`\n${n} passed`);
