// Plain-node checks for the one action rail: its items, their order, their states and the honesty of its counts
// (no React Native). Run: npm run test:lib
import assert from 'node:assert/strict';
import { RAIL_ORDER, railCounts, railItems } from '../actionRail';
import type { RailKind } from '../actionRail';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };
const byKind = (items: ReturnType<typeof railItems>, kind: RailKind) => items.find((i) => i.kind === kind)!;

check('the rail is love, bookmark, comments, share, in that order (the order Discover has)', () => {
  assert.deepEqual([...RAIL_ORDER], ['love', 'save', 'comments', 'share']);
  assert.deepEqual(railItems().map((i) => i.kind), ['love', 'save', 'comments', 'share']);
  assert.deepEqual(railItems({ loved: true, saved: true, counts: { share: 3 } }).map((i) => i.kind), ['love', 'save', 'comments', 'share'], 'the order never depends on the state');
});

check('the icons and sizes are Discover\'s: heart 28, bookmark 28, chat 26, share 26; love is red, the rest blue', () => {
  const items = railItems();
  assert.deepEqual(items.map((i) => i.icon), ['heart', 'bookmark', 'chat', 'share']);
  assert.deepEqual(items.map((i) => i.iconSize), [28, 28, 26, 26]);
  assert.deepEqual(items.map((i) => i.tone), ['love', 'action', 'action', 'action']);
});

check('with no state every button is off, has no count and the plain label Discover always had', () => {
  const items = railItems();
  assert.deepEqual(items.map((i) => i.on), [false, false, false, false]);
  assert.deepEqual(items.map((i) => i.label), ['Love', 'Bookmark', 'Comments', 'Share']);
  assert.deepEqual(items.map((i) => i.disabled), [false, false, false, false]);
  for (const i of items) {
    assert.equal(i.count, undefined);
    assert.equal(i.countText, undefined);
  }
});

check('love and bookmark show when they are on (filled) and say how to undo them; comments and share are never "on"', () => {
  const on = railItems({ loved: true, saved: true });
  assert.deepEqual(on.map((i) => i.on), [true, true, false, false]);
  assert.equal(byKind(on, 'love').label, 'Remove love');
  assert.equal(byKind(on, 'save').label, 'Remove bookmark');
  assert.equal(byKind(on, 'comments').label, 'Comments');
  const loveOnly = railItems({ loved: true });
  assert.deepEqual(loveOnly.map((i) => i.on), [true, false, false, false]);
  const saveOnly = railItems({ saved: true });
  assert.deepEqual(saveOnly.map((i) => i.on), [false, true, false, false]);
});

check('a count that was read shows compact under the icon, and whole in the screen reader label', () => {
  const items = railItems({ counts: { love: 1234, save: 56, comments: 1, share: 0 } });
  assert.deepEqual(items.map((i) => i.count), [1234, 56, 1, 0]);
  assert.deepEqual(items.map((i) => i.countText), ['1.2K', '56', '1', '0']);
  assert.deepEqual(items.map((i) => i.label), ['Love, 1,234 likes', 'Bookmark, 56 bookmarks', 'Comments, 1 comment', 'Share, 0 shares']);
  const on = railItems({ loved: true, saved: true, counts: { love: 1234, save: 1 } });
  assert.equal(byKind(on, 'love').label, 'Remove love, 1,234 likes');
  assert.equal(byKind(on, 'save').label, 'Remove bookmark, 1 bookmark');
});

check('a real 0 is shown, because it was read', () => {
  const items = railItems({ counts: { love: 0, save: 0, comments: 0, share: 0 } });
  assert.deepEqual(items.map((i) => i.countText), ['0', '0', '0', '0']);
  assert.deepEqual(items.map((i) => i.label), ['Love, 0 likes', 'Bookmark, 0 bookmarks', 'Comments, 0 comments', 'Share, 0 shares']);
});

check('a count that was never read is never shown as 0: undefined, null, NaN, negative, text and Infinity show nothing', () => {
  for (const bad of [undefined, null, NaN, -1, -0.5, '12', '', Infinity, {}, [], true]) {
    const items = railItems({ counts: { love: bad, save: bad, comments: bad, share: bad } });
    for (const i of items) {
      assert.equal(i.count, undefined, `${String(bad)}: count`);
      assert.equal(i.countText, undefined, `${String(bad)}: text`);
    }
    assert.deepEqual(items.map((i) => i.label), ['Love', 'Bookmark', 'Comments', 'Share'], `${String(bad)}: labels carry no number`);
  }
});

check('only the counts that were read show: Discover has just the comments of the phone, the others stay bare', () => {
  const items = railItems({ counts: { comments: 2 } });
  assert.deepEqual(items.map((i) => i.countText), [undefined, undefined, '2', undefined]);
  assert.deepEqual(items.map((i) => i.label), ['Love', 'Bookmark', 'Comments, 2 comments', 'Share']);
});

check('a fractional count is rounded down, so the figure is never more than the real count', () => {
  const items = railItems({ counts: { love: 1234.9, comments: 12.9 } });
  assert.equal(byKind(items, 'love').count, 1234);
  assert.equal(byKind(items, 'love').countText, '1.2K');
  assert.equal(byKind(items, 'comments').countText, '12');
});

check('a button that cannot work yet stays in the rail, disabled, and its label says "not available yet"', () => {
  const items = railItems({ unavailable: { comments: true } });
  assert.deepEqual(items.map((i) => i.disabled), [false, false, true, false]);
  assert.equal(byKind(items, 'comments').label, 'Comments, not available yet');
  assert.equal(byKind(items, 'love').label, 'Love', 'the others are untouched');
  assert.equal(items.length, 4, 'it is still in the rail, in its place');
  const withCount = railItems({ counts: { comments: 3 }, unavailable: { comments: true } });
  assert.equal(byKind(withCount, 'comments').label, 'Comments, 3 comments, not available yet');
  const all = railItems({ unavailable: { love: true, save: true, comments: true, share: true } });
  assert.ok(all.every((i) => i.disabled));
  assert.equal(byKind(all, 'save').label, 'Bookmark, not available yet');
});

check('railCounts maps a post: likes to love, bookmarks to save, and what the post does not have stays unknown', () => {
  assert.deepEqual(railCounts({ like_count: 12, comment_count: 3 }), { love: 12, save: undefined, comments: 3, share: undefined });
  assert.deepEqual(railCounts({ like_count: 1, comment_count: 0, save_count: 4, share_count: 2 }), { love: 1, save: 4, comments: 0, share: 2 });
  assert.deepEqual(railCounts({}), { love: undefined, save: undefined, comments: undefined, share: undefined });
});

check('what a pilgrim sees on a real post: the counts the database has, and nothing for the two it does not have yet', () => {
  const before = railItems({ counts: railCounts({ like_count: 12, comment_count: 3 }) });
  assert.deepEqual(before.map((i) => i.countText), ['12', undefined, '3', undefined]);
  const after = railItems({ counts: railCounts({ like_count: 12, comment_count: 3, save_count: 0, share_count: 1200 }) });
  assert.deepEqual(after.map((i) => i.countText), ['12', '0', '3', '1.2K']);
  assert.deepEqual(after.map((i) => i.label), ['Love, 12 likes', 'Bookmark, 0 bookmarks', 'Comments, 3 comments', 'Share, 1,200 shares']);
});

check('railItems does not change what it is given', () => {
  const input = Object.freeze({ loved: true, counts: Object.freeze({ love: 5 }), unavailable: Object.freeze({ share: true }) });
  const a = railItems(input);
  const b = railItems(input);
  assert.deepEqual(a, b);
  assert.deepEqual(input, { loved: true, counts: { love: 5 }, unavailable: { share: true } });
});

console.log(`${n} of ${n} passed`);
