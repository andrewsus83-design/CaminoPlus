// Plain-node checks for the pure social logic (no React Native). Run: npm run test:social
import assert from 'node:assert/strict';
import {
  AVATAR_TINTS, CLUSTER_GAP_MS, NAME_COLORS, UUID_RE, avatarTint, badgeLabel, buildTimeline, canCreateGroup, classifySendError, clockTime,
  conversationName, countUnread, muteLabel, createDebouncer, createLatestGate, dayKey, dayLabel, daysBetween, deliveryLabel, filterConversations,
  filterPeople, firstName, friendAction, friendlyError, groupBlocker, initials, isMuted, isOutboxItem, isSearchable,
  mergeMessages, messageActions, nameColor, normalizeQuery, normalizeTotals, notificationAction, notificationHeadline,
  notificationTime, outboxToMessage, parseOutbox, parseStorage, patchOutbox, pilgrimsLabel, previewLine, pruneOutbox, removeOutbox,
  requestState, retryDelayMs, sameTotals, smartTime, snippet, sortByName, splitNotifications, storageGate, timelineMessages, toInverted,
  truncate, ts, uuidV4, upsertOutbox, validGroupTitle, withStatus, newId,
} from '../logic';
import type { ChatMessage, Conversation, MessageEntry, Member, NotificationItem, OutboxItem, PilgrimResult, TimelineMessage } from '../types';

let n = 0;
const test = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log(`ok ${n} - ${name}`);
};

// Local-time constructor on purpose: the labels use the phone's time zone, so the tests do too.
const at = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) => new Date(y, mo - 1, d, h, mi, s).toISOString();
const NOW = new Date(2026, 10, 5, 12, 0, 0).getTime(); // Thu 5 Nov 2026, 12:00
const ME = 'me-1';
const ANA = 'ana-2';
const LUC = 'luc-3';

let seq = 0;
const msg = (sender: string | null, created: string, over: Partial<TimelineMessage> = {}): TimelineMessage => ({
  id: `m${++seq}`, conversation_id: 'c1', sender_id: sender, kind: 'text', body: 'hi', media_path: null, reply_to: null,
  client_created_at: created, created_at: created, deleted_at: null, ...over,
});
const members = (anaRead: string | null, lucRead: string | null = null): Pick<Member, 'user_id' | 'last_read_at'>[] => [
  { user_id: ME, last_read_at: null }, { user_id: ANA, last_read_at: anaRead }, { user_id: LUC, last_read_at: lucRead },
];
const build = (messages: TimelineMessage[], over: Partial<Parameters<typeof buildTimeline>[0]> = {}) =>
  buildTimeline({ messages, meId: ME, isGroup: false, now: NOW, members: members(null), unreadCursor: null, ...over });
const bubbles = (rows: ReturnType<typeof buildTimeline>) => rows.filter((r): r is MessageEntry => r.kind === 'message');

const conv = (over: Partial<Conversation> = {}): Conversation => ({
  id: 'c1', kind: 'direct', title: 'Ana Torres', avatar_url: null, peer_id: ANA, peer_username: 'ana_t', peer_display_name: 'Ana Torres', peer_avatar_url: null,
  member_count: 2, last_message_id: 'm1', last_message_preview: 'See you in Zubiri', last_message_sender: ANA, last_message_sender_name: 'Ana Torres',
  last_message_at: at(2026, 11, 5, 9, 41), unread_count: 0, muted_until: null, my_role: 'member', ...over,
});

const outbox = (over: Partial<OutboxItem> = {}): OutboxItem => ({
  id: 'o1', user_id: ME, conversation_id: 'c1', kind: 'text', body: 'hello', reply_to: null, client_created_at: at(2026, 11, 5, 11, 59),
  local_uri: null, mime: null, media_path: null, status: 'queued', attempts: 0, error: null, ...over,
});

const notif = (over: Partial<NotificationItem> = {}): NotificationItem => ({
  id: 'n1', kind: 'friend_request', title: 'New friend request', body: null, data: {}, read_at: null, created_at: at(2026, 11, 5, 11, 46),
  actor: { id: ANA, username: 'ana_t', display_name: 'Ana Torres', avatar_url: null }, ...over,
});

/* ---------------- ids ---------------- */

test('uuidV4 has the v4 layout and is deterministic for a seeded source', () => {
  let s = 7;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const a = uuidV4(rand);
  assert.match(a, UUID_RE);
  assert.equal(a[14], '4');
  assert.ok('89ab'.includes(a[19]));
  s = 7;
  assert.equal(uuidV4(rand), a);
});

test('newId gives valid, unique ids', () => {
  const ids = new Set(Array.from({ length: 500 }, () => newId()));
  assert.equal(ids.size, 500);
  for (const id of ids) assert.match(id, UUID_RE);
});

/* ---------------- time ---------------- */

test('clockTime pads to HH:mm and survives bad input', () => {
  assert.equal(clockTime(at(2026, 11, 5, 9, 5)), '09:05');
  assert.equal(clockTime(at(2026, 11, 5, 23, 59)), '23:59');
  assert.equal(clockTime('not a date'), '');
});

test('ts accepts Postgres microseconds', () => {
  assert.equal(ts('2026-11-05T10:00:00.123456+00:00'), Date.parse('2026-11-05T10:00:00.123Z'));
  assert.ok(Number.isNaN(ts('nope')));
});

test('daysBetween counts calendar days, not 24 h blocks', () => {
  assert.equal(daysBetween(at(2026, 11, 4, 23, 59), at(2026, 11, 5, 0, 1)), 1);
  assert.equal(daysBetween(at(2026, 11, 5, 0, 1), at(2026, 11, 5, 23, 59)), 0);
  assert.equal(daysBetween(at(2026, 10, 30, 12), at(2026, 11, 5, 12)), 6);
  assert.equal(dayKey(at(2026, 1, 9, 8)), '2026-01-09');
});

test('dayLabel: Today, Yesterday, Mon 3 Nov, and the year when it is not this one', () => {
  assert.equal(dayLabel(at(2026, 11, 5, 8), NOW), 'Today');
  assert.equal(dayLabel(at(2026, 11, 4, 23, 59), NOW), 'Yesterday');
  assert.equal(dayLabel(at(2026, 11, 3, 10), NOW), 'Tue 3 Nov');
  assert.equal(dayLabel(at(2025, 12, 24, 10), NOW), 'Wed 24 Dec 2025');
  assert.equal(dayLabel(at(2026, 11, 6, 10), NOW), 'Today'); // a clock a little ahead is still "today"
});

test('smartTime: HH:mm today, Yesterday, weekday, d MMM', () => {
  assert.equal(smartTime(at(2026, 11, 5, 9, 41), NOW), '09:41');
  assert.equal(smartTime(at(2026, 11, 4, 20), NOW), 'Yesterday');
  assert.equal(smartTime(at(2026, 11, 2, 20), NOW), 'Mon');
  assert.equal(smartTime(at(2026, 10, 30, 20), NOW), 'Fri'); // 6 days ago is still a weekday
  assert.equal(smartTime(at(2026, 10, 29, 20), NOW), '29 Oct');
  assert.equal(smartTime(at(2025, 10, 29, 20), NOW), '29 Oct 2025');
  assert.equal(smartTime(null, NOW), '');
});

test('notificationTime: minutes, hours, yesterday with clock, days, date', () => {
  assert.equal(notificationTime(at(2026, 11, 5, 11, 59, 30), NOW), 'Just now');
  assert.equal(notificationTime(at(2026, 11, 5, 11, 46), NOW), '14 min ago');
  assert.equal(notificationTime(at(2026, 11, 5, 10, 55), NOW), '1 h ago');
  assert.equal(notificationTime(at(2026, 11, 4, 18, 2), NOW), 'Yesterday · 18:02');
  assert.equal(notificationTime(at(2026, 11, 2, 18, 2), NOW), '3 days ago');
  assert.equal(notificationTime(at(2026, 10, 20, 18, 2), NOW), '20 Oct');
});

/* ---------------- names and small helpers ---------------- */

test('initials, firstName, pilgrimsLabel, badgeLabel', () => {
  assert.equal(initials('Ana Torres'), 'AT');
  assert.equal(initials('Ana'), 'A');
  assert.equal(initials('@ana_t'), 'A');
  assert.equal(initials('  '), '?');
  assert.equal(initials('Camino friends and family'), 'CF');
  assert.equal(firstName('Ana Torres'), 'Ana');
  assert.equal(pilgrimsLabel(1), '1 pilgrim');
  assert.equal(pilgrimsLabel(5), '5 pilgrims');
  assert.equal(badgeLabel(0), '');
  assert.equal(badgeLabel(7), '7');
  assert.equal(badgeLabel(99), '99');
  assert.equal(badgeLabel(120), '99+');
});

test('sender colours and avatar tints are stable and come from the palettes', () => {
  assert.equal(nameColor('ana-2'), nameColor('ana-2'));
  assert.ok(NAME_COLORS.includes(nameColor('luc-3') as (typeof NAME_COLORS)[number]));
  assert.ok(AVATAR_TINTS.includes(avatarTint('x') as (typeof AVATAR_TINTS)[number]));
  assert.ok(new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(nameColor)).size > 2);
});

/* ---------------- conversations ---------------- */

test('conversationName and previewLine', () => {
  assert.equal(conversationName(conv()), 'Ana Torres');
  assert.equal(conversationName(conv({ peer_display_name: null })), 'ana_t');
  assert.equal(conversationName(conv({ kind: 'group', title: 'Camino family' })), 'Camino family');
  assert.equal(previewLine(conv(), ME), 'See you in Zubiri');
  assert.equal(previewLine(conv({ last_message_sender: ME }), ME), 'You: See you in Zubiri');
  assert.equal(previewLine(conv({ kind: 'group', last_message_sender_name: 'Lucas Ruiz', last_message_sender: LUC }), ME), 'Lucas: See you in Zubiri');
  assert.equal(previewLine(conv({ kind: 'group', last_message_preview: 'Ana created the group', last_message_sender_name: 'Ana Torres' }), ME), 'Ana created the group');
  assert.equal(previewLine(conv({ last_message_preview: '', last_message_id: 'm9' }), ME), 'Photo');
  assert.equal(previewLine(conv({ last_message_preview: null, last_message_id: null }), ME), 'No messages yet');
});

test('filterConversations ignores case and accents and also searches the last message', () => {
  const list = [conv({ id: 'a', peer_display_name: 'María José', title: 'María José' }), conv({ id: 'b', peer_display_name: 'Lucas', last_message_preview: 'Albergue in Hontanas' })];
  assert.deepEqual(filterConversations(list, 'maria').map((c) => c.id), ['a']);
  assert.deepEqual(filterConversations(list, 'HONTANAS').map((c) => c.id), ['b']);
  assert.equal(filterConversations(list, '  ').length, 2);
  assert.equal(filterConversations(list, 'zzz').length, 0);
});

test('isMuted: future date, past date, none, infinity', () => {
  assert.equal(isMuted({ muted_until: at(2026, 11, 6) }, NOW), true);
  assert.equal(isMuted({ muted_until: at(2026, 11, 4) }, NOW), false);
  assert.equal(isMuted({ muted_until: null }, NOW), false);
  assert.equal(isMuted({ muted_until: 'infinity' }, NOW), true);
});

test('muteLabel: On, Muted, until a time today, until a date', () => {
  assert.equal(muteLabel({ muted_until: null }, NOW), 'On');
  assert.equal(muteLabel({ muted_until: at(2026, 11, 4) }, NOW), 'On'); // expired
  assert.equal(muteLabel({ muted_until: at(2026, 11, 5, 20, 5) }, NOW), 'Muted until 20:05');
  assert.equal(muteLabel({ muted_until: at(2026, 11, 12, 12) }, NOW), 'Muted until 12 Nov');
  assert.equal(muteLabel({ muted_until: '2100-01-01T00:00:00.000Z' }, NOW), 'Muted');
  assert.equal(muteLabel({ muted_until: 'infinity' }, NOW), 'Muted');
});

/* ---------------- unread maths ---------------- */

test('normalizeTotals reads a row or a one-row array, caps and cleans numbers', () => {
  const t = normalizeTotals([{ notifications: 3, chats: 2, groups: 1, friend_requests: 4 }]);
  assert.deepEqual(t, { notifications: 3, chats: 2, groups: 1, friendRequests: 4, total: 6 });
  assert.equal(normalizeTotals({ notifications: '5', chats: 500, groups: -2, friend_requests: null }).chats, 99);
  assert.equal(normalizeTotals({ notifications: '5', chats: 500, groups: -2, friend_requests: null }).total, 104);
  assert.equal(normalizeTotals(null).total, 0);
  assert.equal(normalizeTotals([]).total, 0);
  assert.equal(normalizeTotals('garbage').notifications, 0);
});

test('sameTotals avoids needless re-renders', () => {
  const a = normalizeTotals({ notifications: 1, chats: 2, groups: 3, friend_requests: 0 });
  assert.ok(sameTotals(a, { ...a }));
  assert.ok(!sameTotals(a, { ...a, groups: 4, total: 7 }));
});

test('countUnread counts others, not mine, not system, not unsent, only after the cursor', () => {
  const cursor = at(2026, 11, 5, 10);
  const list: ChatMessage[] = [
    msg(ANA, at(2026, 11, 5, 9)), // before the cursor
    msg(ANA, at(2026, 11, 5, 10, 5)),
    msg(ME, at(2026, 11, 5, 10, 6)),
    msg(ANA, at(2026, 11, 5, 10, 7), { kind: 'system' }),
    msg(ANA, at(2026, 11, 5, 10, 8), { deleted_at: at(2026, 11, 5, 10, 9) }),
    msg(LUC, at(2026, 11, 5, 11)),
  ];
  assert.equal(countUnread(list, cursor, ME), 2);
  assert.equal(countUnread(list, null, ME), 0);
});

/* ---------------- chat timeline ---------------- */

test('cluster: same sender within five minutes shares a cluster, first/last flags are right', () => {
  const rows = bubbles(build([msg(ANA, at(2026, 11, 5, 9, 0)), msg(ANA, at(2026, 11, 5, 9, 2)), msg(ANA, at(2026, 11, 5, 9, 4))]));
  assert.deepEqual(rows.map((r) => [r.first, r.last]), [[true, false], [false, false], [false, true]]);
});

test('cluster breaks on a different sender, a long pause and a new day', () => {
  const rows = bubbles(build([
    msg(ANA, at(2026, 11, 4, 23, 59)), msg(ANA, at(2026, 11, 5, 0, 1)), // new day
    msg(ME, at(2026, 11, 5, 0, 2)),                                      // other sender
    msg(ME, at(2026, 11, 5, 0, 2 + CLUSTER_GAP_MS / 60_000 + 1)),         // pause > 5 min
  ]));
  assert.deepEqual(rows.map((r) => [r.first, r.last]), [[true, true], [true, true], [true, true], [true, true]]);
});

test('date separators: one per day, labelled, in front of the first message of the day', () => {
  const rows = build([msg(ANA, at(2026, 11, 3, 10)), msg(ANA, at(2026, 11, 3, 11)), msg(ME, at(2026, 11, 4, 9)), msg(ANA, at(2026, 11, 5, 8))]);
  assert.deepEqual(rows.filter((r) => r.kind === 'date').map((r) => (r as { label: string }).label), ['Tue 3 Nov', 'Yesterday', 'Today']);
  assert.equal(rows[0].kind, 'date');
  assert.equal(rows[1].kind, 'message');
  assert.equal(rows.length, 7);
});

test('system messages are chips that break clusters', () => {
  const rows = build([msg(ANA, at(2026, 11, 5, 9, 0)), msg(ANA, at(2026, 11, 5, 9, 1), { kind: 'system', body: 'Ana added Lucas' }), msg(ANA, at(2026, 11, 5, 9, 2))]);
  assert.deepEqual(rows.map((r) => r.kind), ['date', 'message', 'system', 'message']);
  assert.deepEqual(bubbles(rows).map((r) => [r.first, r.last]), [[true, true], [true, true]]);
});

test('group chats show the sender on the first bubble of someone else\'s cluster only', () => {
  const rows = bubbles(build([msg(ANA, at(2026, 11, 5, 9, 0)), msg(ANA, at(2026, 11, 5, 9, 1)), msg(ME, at(2026, 11, 5, 9, 2)), msg(LUC, at(2026, 11, 5, 9, 3))], { isGroup: true }));
  assert.deepEqual(rows.map((r) => r.showSender), [true, false, false, true]);
  const dm = bubbles(build([msg(ANA, at(2026, 11, 5, 9, 0))], { isGroup: false }));
  assert.equal(dm[0].showSender, false);
});

test('unread divider sits before the first unread message from others, once', () => {
  const cursor = at(2026, 11, 5, 9, 30);
  const rows = build([msg(ANA, at(2026, 11, 5, 9, 0)), msg(ME, at(2026, 11, 5, 9, 40)), msg(ANA, at(2026, 11, 5, 9, 50)), msg(ANA, at(2026, 11, 5, 9, 51))], { unreadCursor: cursor });
  const kinds = rows.map((r) => r.kind);
  assert.equal(kinds.filter((k) => k === 'unread').length, 1);
  assert.equal(kinds.indexOf('unread'), 3); // date, ana, me, [unread], ana, ana
  assert.equal(bubbles(rows)[2].first, true); // the divider starts a new cluster
});

test('no divider when nothing is unread, the cursor is unknown, or the new messages are mine', () => {
  const list = [msg(ANA, at(2026, 11, 5, 9, 0)), msg(ME, at(2026, 11, 5, 9, 40))];
  assert.ok(!build(list, { unreadCursor: at(2026, 11, 5, 10) }).some((r) => r.kind === 'unread'));
  assert.ok(!build(list, { unreadCursor: null }).some((r) => r.kind === 'unread'));
  assert.ok(!build(list, { unreadCursor: at(2026, 11, 5, 9, 30) }).some((r) => r.kind === 'unread'));
});

test('delivery: sending, failed, sent and seen follow the read cursors', () => {
  const sent = msg(ME, at(2026, 11, 5, 9, 0));
  const seen = msg(ME, at(2026, 11, 5, 9, 30));
  const queued = { ...msg(ME, at(2026, 11, 5, 9, 31)), local: 'queued' as const };
  const failed = { ...msg(ME, at(2026, 11, 5, 9, 32)), local: 'failed' as const };
  const rows = bubbles(build([sent, seen, queued, failed], { members: members(at(2026, 11, 5, 9, 30)) }));
  assert.deepEqual(rows.map((r) => r.delivery), ['seen', 'seen', 'sending', 'failed']);
  const rows2 = bubbles(build([sent], { members: members(at(2026, 11, 5, 8, 59)) }));
  assert.equal(rows2[0].delivery, 'sent');
  assert.equal(bubbles(build([msg(ANA, at(2026, 11, 5, 9, 0))]))[0].delivery, null); // not mine
});

test('seen label: "Seen" in chats, "Seen by N" in groups, only under my newest message', () => {
  const a = msg(ME, at(2026, 11, 5, 9, 0));
  const b = msg(ME, at(2026, 11, 5, 9, 10));
  const read = at(2026, 11, 5, 9, 20);
  const dm = bubbles(build([a, b], { members: members(read) }));
  assert.deepEqual(dm.map((r) => r.seenLabel), [null, 'Seen']);
  const group = bubbles(build([a, b], { isGroup: true, members: members(read, read) }));
  assert.deepEqual(group.map((r) => r.seenLabel), [null, 'Seen by 2']);
  // they answered after: the label would sit in the middle of the thread, so it is hidden
  const answered = bubbles(build([a, msg(ANA, at(2026, 11, 5, 9, 15))], { members: members(read) }));
  assert.deepEqual(answered.map((r) => r.seenLabel), [null, null]);
  // my newest is still sending: no label
  const pending = bubbles(build([a, { ...b, local: 'sending' as const }], { members: members(read) }));
  assert.ok(pending.every((r) => r.seenLabel === null));
});

test('toInverted reverses without touching the input', () => {
  const rows = build([msg(ANA, at(2026, 11, 5, 9, 0)), msg(ME, at(2026, 11, 5, 9, 1))]);
  const inv = toInverted(rows);
  assert.equal(inv[0], rows[rows.length - 1]);
  assert.equal(rows[0].kind, 'date');
  assert.equal(deliveryLabel('seen', 'Seen by 3'), 'Seen by 3');
  assert.equal(deliveryLabel('failed', null), 'Not sent. Tap to try again');
});

/* ---------------- merge, outbox ---------------- */

test('mergeMessages dedupes by id, sorts oldest first and lets the newest copy win', () => {
  const a = msg(ANA, at(2026, 11, 5, 9, 0));
  const b = msg(ME, at(2026, 11, 5, 9, 1));
  const c = msg(ANA, at(2026, 11, 5, 9, 2));
  const merged = mergeMessages([c, a], [b, { ...a, deleted_at: at(2026, 11, 5, 9, 5), body: null }, { ...c }]);
  assert.deepEqual(merged.map((m) => m.id), [a.id, b.id, c.id]);
  assert.equal(merged[0].deleted_at != null, true);
  assert.equal(mergeMessages([], []).length, 0);
});

test('timelineMessages appends my unsent messages and drops the ones the server already echoed', () => {
  const server = [msg(ANA, at(2026, 11, 5, 9, 0)), { ...msg(ME, at(2026, 11, 5, 9, 1)), id: 'o-echoed' }];
  const rows = timelineMessages(
    server,
    [outbox({ id: 'o-echoed' }), outbox({ id: 'o-b', client_created_at: at(2026, 11, 5, 9, 3) }), outbox({ id: 'o-a', client_created_at: at(2026, 11, 5, 9, 2), status: 'failed' }), outbox({ id: 'o-other', conversation_id: 'c2' })],
    'c1',
  );
  assert.deepEqual(rows.map((m) => m.id), [server[0].id, 'o-echoed', 'o-a', 'o-b']);
  assert.equal(rows[2].local, 'failed');
  assert.equal(rows[1].local, undefined);
});

test('outboxToMessage keeps the client time, the local image and the reason a send failed', () => {
  assert.equal(outboxToMessage(outbox({ status: 'failed', error: 'You cannot do that with this pilgrim.' })).local_error, 'You cannot do that with this pilgrim.');
  assert.equal(outboxToMessage(outbox({ status: 'queued', error: 'old' })).local_error, null);
  const m = outboxToMessage(outbox({ kind: 'image', local_uri: 'file:///x.jpg', body: null }));
  assert.equal(m.kind, 'image');
  assert.equal(m.local_uri, 'file:///x.jpg');
  assert.equal(m.created_at, m.client_created_at);
  assert.equal(m.sender_id, ME);
});

test('outbox list helpers: upsert is idempotent, remove, patch, prune', () => {
  let list: OutboxItem[] = [];
  list = upsertOutbox(list, outbox({ id: 'a' }));
  list = upsertOutbox(list, outbox({ id: 'b' }));
  list = upsertOutbox(list, outbox({ id: 'a', attempts: 2 })); // same id twice = one entry
  assert.deepEqual(list.map((x) => [x.id, x.attempts]), [['a', 2], ['b', 0]]);
  assert.equal(patchOutbox(list, 'b', { status: 'failed' })[1].status, 'failed');
  assert.deepEqual(removeOutbox(list, 'a').map((x) => x.id), ['b']);
  assert.deepEqual(pruneOutbox(list, new Set(['b'])).map((x) => x.id), ['a']);
});

test('parseOutbox: only my valid items, sending becomes queued, failed stays failed', () => {
  const blob = { user_id: ME, items: [outbox({ id: 'a', status: 'sending' }), outbox({ id: 'b', status: 'failed', error: 'No' }), { id: 'broken' }, null, outbox({ id: 'c', kind: 'image' })] };
  const items = parseOutbox(blob, ME);
  assert.deepEqual(items.map((i) => [i.id, i.status]), [['a', 'queued'], ['b', 'failed'], ['c', 'queued']]);
  assert.deepEqual(parseOutbox(blob, 'someone-else'), []);
  assert.deepEqual(parseOutbox(null, ME), []);
  assert.deepEqual(parseOutbox({ user_id: ME, items: 'x' }, ME), []);
  assert.ok(isOutboxItem(outbox()));
  assert.ok(!isOutboxItem({ ...outbox(), status: 'nope' }));
});

test('retry delay doubles and stops at a minute', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map(retryDelayMs), [3000, 6000, 12000, 24000, 48000, 60000, 60000]);
});

test('classifySendError: offline and server trouble retry, duplicates succeed, the rest is rejected', () => {
  assert.equal(classifySendError({ network: true }), 'network');
  assert.equal(classifySendError({ status: 0 }), 'network');
  assert.equal(classifySendError({ status: 503 }), 'network');
  assert.equal(classifySendError({ status: 429 }), 'network');
  assert.equal(classifySendError({ status: 409, code: '23505' }), 'duplicate');
  assert.equal(classifySendError({ status: 403, code: '42501' }), 'rejected');
  assert.equal(classifySendError({ status: 400 }), 'rejected');
  assert.equal(classifySendError(null), 'rejected');
});

test('messageActions: what the long-press menu offers', () => {
  assert.deepEqual(messageActions(msg(ANA, at(2026, 11, 5, 9)), false), ['reply', 'copy', 'report']);
  assert.deepEqual(messageActions(msg(ME, at(2026, 11, 5, 9)), true), ['reply', 'copy', 'unsend']);
  assert.deepEqual(messageActions(msg(ME, at(2026, 11, 5, 9), { kind: 'image', body: null, media_path: 'x' }), true), ['reply', 'unsend']);
  assert.deepEqual(messageActions({ ...msg(ME, at(2026, 11, 5, 9)), local: 'failed' }, true), ['retry', 'delete']);
  assert.deepEqual(messageActions({ ...msg(ME, at(2026, 11, 5, 9)), local: 'sending' }, true), ['delete']);
  assert.deepEqual(messageActions(msg(ANA, at(2026, 11, 5, 9), { deleted_at: at(2026, 11, 5, 10) }), false), []);
  assert.deepEqual(messageActions(msg(ANA, at(2026, 11, 5, 9), { kind: 'system' }), false), []);
});

test('snippet and truncate', () => {
  assert.equal(snippet(msg(ANA, at(2026, 11, 5, 9), { body: 'a\n\n b' })), 'a b');
  assert.equal(snippet(msg(ANA, at(2026, 11, 5, 9), { kind: 'image', body: null })), 'Photo');
  assert.equal(snippet(msg(ANA, at(2026, 11, 5, 9), { deleted_at: at(2026, 11, 5, 9) })), 'Message unsent');
  assert.equal(snippet(null), 'Original message');
  assert.equal(truncate('abcdefghij', 5), 'abcd…');
  assert.equal(truncate('abc', 5), 'abc');
});

/* ---------------- notifications ---------------- */

test('notificationHeadline: the server sentence when it starts with the actor name, else one built from the kind', () => {
  // server wording ("<name> sent you a friend request"): bold name + the rest
  assert.deepEqual(notificationHeadline(notif({ title: 'Ana Torres sent you a friend request' })), { name: 'Ana Torres', text: ' sent you a friend request', detail: null });
  assert.deepEqual(notificationHeadline(notif({ kind: 'group_added', title: 'Ana Torres added you to Camino family' })), { name: 'Ana Torres', text: ' added you to Camino family', detail: null });
  assert.equal(notificationHeadline(notif({ kind: 'post_like', title: 'ana torres liked your post', body: 'Reached the cathedral' })).detail, 'Reached the cathedral');
  // a name that is only the start of another word does not count
  assert.equal(notificationHeadline(notif({ title: 'Ana Torresson sent you a friend request' })).text, ' sent you a friend request');
  // title without the name: built from the kind
  assert.deepEqual(notificationHeadline(notif()), { name: 'Ana Torres', text: ' sent you a friend request', detail: null });
  assert.equal(notificationHeadline(notif({ kind: 'group_added' })).text, ' added you to a group');
  assert.equal(notificationHeadline(notif({ kind: 'post_comment', body: 'Save me a bed!' })).detail, 'Save me a bed!');
  // no actor: the title is the bold part
  const badge = notificationHeadline(notif({ kind: 'achievement', actor: null, title: 'You unlocked Meseta Walker', body: 'You earned +100 XP.' }));
  assert.deepEqual(badge, { name: 'You unlocked Meseta Walker', text: '', detail: 'You earned +100 XP.' });
  assert.equal(notificationHeadline(notif({ actor: { id: 'x', username: 'bob', display_name: null, avatar_url: null } })).name, 'bob');
});

test('notificationAction routes by kind', () => {
  assert.deepEqual(notificationAction(notif()), { to: 'requests' });
  assert.deepEqual(notificationAction(notif({ kind: 'friend_accepted', data: { friend_id: 'f1' } })), { to: 'chat-with', userId: 'f1' });
  assert.deepEqual(notificationAction(notif({ kind: 'friend_accepted' })), { to: 'chat-with', userId: ANA });
  assert.deepEqual(notificationAction(notif({ kind: 'group_added', data: { conversation_id: 'c9' } })), { to: 'conversation', id: 'c9' });
  assert.deepEqual(notificationAction(notif({ kind: 'group_added' })), { to: 'none' });
  assert.deepEqual(notificationAction(notif({ kind: 'post_like' })), { to: 'me' });
  assert.deepEqual(notificationAction(notif({ kind: 'achievement' })), { to: 'me' });
  assert.deepEqual(notificationAction(notif({ kind: 'system' })), { to: 'none' });
});

test('splitNotifications: New = unread (or pinned while the screen is open), Earlier = the rest', () => {
  const list = [notif({ id: 'a' }), notif({ id: 'b', read_at: at(2026, 11, 5, 11) }), notif({ id: 'c', read_at: at(2026, 11, 5, 11) })];
  const s = splitNotifications(list);
  assert.deepEqual([s.fresh.map((x) => x.id), s.earlier.map((x) => x.id)], [['a'], ['b', 'c']]);
  const pinned = splitNotifications(list, new Set(['c']));
  assert.deepEqual([pinned.fresh.map((x) => x.id), pinned.earlier.map((x) => x.id)], [['a', 'c'], ['b']]);
});

test('requestState: pending while the request is still incoming, friends once accepted, gone otherwise', () => {
  const n1 = notif();
  assert.equal(requestState(n1, new Set([ANA]), new Set()), 'pending');
  assert.equal(requestState(n1, new Set(), new Set([ANA])), 'friends');
  assert.equal(requestState(n1, new Set(), new Set()), 'gone');
  assert.equal(requestState(n1, new Set([ANA]), new Set(), 'accepted'), 'friends');
  assert.equal(requestState(n1, new Set([ANA]), new Set(), 'declined'), 'declined');
  assert.equal(requestState(notif({ actor: null }), new Set([ANA]), new Set()), 'gone');
});

/* ---------------- search, friends, groups ---------------- */

test('search helpers: normalize and minimum length', () => {
  assert.equal(normalizeQuery('  ana   torres '), 'ana torres');
  assert.ok(!isSearchable('a'));
  assert.ok(!isSearchable(' a '));
  assert.ok(isSearchable('an'));
});

test('debouncer fires once, after the pause, with the last arguments', () => {
  let t = 0;
  let nextId = 0;
  const queue = new Map<number, { at: number; f: () => void }>();
  const timers = {
    set: (f: () => void, ms: number) => { queue.set(++nextId, { at: t + ms, f }); return nextId; },
    clear: (h: unknown) => { queue.delete(h as number); },
  };
  const advance = (ms: number) => {
    t += ms;
    for (const [id, item] of [...queue]) if (item.at <= t) { queue.delete(id); item.f(); }
  };
  const seen: string[] = [];
  const search = createDebouncer((q: string) => seen.push(q), 350, timers);
  search('a'); advance(100); search('an'); advance(100); search('ana');
  assert.deepEqual(seen, []);
  advance(349);
  assert.deepEqual(seen, []);
  advance(1);
  assert.deepEqual(seen, ['ana']);
  search('luc'); search.cancel(); advance(1000);
  assert.deepEqual(seen, ['ana']);
});

test('latest gate lets only the newest request write its result', () => {
  const gate = createLatestGate();
  const first = gate.next();
  const second = gate.next();
  assert.equal(first(), false);
  assert.equal(second(), true);
  gate.invalidate();
  assert.equal(second(), false);
});

test('friendAction: the button follows the friend status', () => {
  assert.deepEqual(friendAction('none'), { kind: 'add', label: 'Add friend' });
  assert.deepEqual(friendAction('pending_out'), { kind: 'cancel', label: 'Requested' });
  assert.deepEqual(friendAction('pending_in'), { kind: 'accept', label: 'Accept' });
  assert.deepEqual(friendAction('friends'), { kind: 'message', label: 'Message' });
});

test('withStatus, sortByName, filterPeople', () => {
  const people: PilgrimResult[] = [
    { id: '1', username: 'zed', display_name: null, avatar_url: null, is_private: false, friend_status: 'none' },
    { id: '2', username: 'ana_t', display_name: 'Ána Torres', avatar_url: null, is_private: false, friend_status: 'none' },
  ];
  assert.equal(withStatus(people, '2', 'pending_out')[1].friend_status, 'pending_out');
  assert.equal(people[1].friend_status, 'none');
  assert.deepEqual(sortByName(people).map((p) => p.id), ['2', '1']);
  assert.deepEqual(filterPeople(people, 'ana').map((p) => p.id), ['2']);
  assert.deepEqual(filterPeople(people, 'ZED').map((p) => p.id), ['1']);
});

test('group rules: 2 to 49 others, title 1 to 60 characters', () => {
  assert.deepEqual([1, 2, 49, 50].map(canCreateGroup), [false, true, true, false]);
  assert.ok(validGroupTitle(' Camino family '));
  assert.ok(!validGroupTitle('   '));
  assert.ok(!validGroupTitle('x'.repeat(61)));
  assert.ok(validGroupTitle('x'.repeat(60)));
  assert.equal(groupBlocker(1), 'Pick at least 2 friends (1 so far).');
  assert.equal(groupBlocker(3), null);
  assert.match(String(groupBlocker(60)), /up to 50/);
});

test('photos in chat need Pilgrim Plus and free space', () => {
  const info = (over: Record<string, unknown>) => parseStorage({ has_plus: true, quota_bytes: 1000, used_bytes: 10, remaining_bytes: 990, ...over });
  assert.equal(storageGate(info({})), 'ok');
  assert.equal(storageGate(info({ has_plus: false, quota_bytes: 0, remaining_bytes: 0 })), 'plus_required');
  assert.equal(storageGate(info({ remaining_bytes: 0 })), 'full');
  assert.equal(storageGate(null), 'unknown');
  assert.equal(parseStorage('x'), null);
  assert.equal(parseStorage({ has_plus: 'yes' })?.has_plus, false);
});

test('friendlyError shows the database\'s own sentences and turns technical or network failures into plain ones', () => {
  assert.match(friendlyError({ network: true, message: 'TypeError: Failed to fetch' }), /offline/);
  assert.match(friendlyError(new Error('Network request failed')), /offline/);
  assert.match(friendlyError({ message: 'You are offline.' }), /offline/);
  // sentences written by the database for people are shown as they are
  assert.equal(friendlyError({ code: '42501', message: 'Only group admins can do this.' }), 'Only group admins can do this.');
  assert.equal(friendlyError({ code: '54000', message: 'You have too many requests waiting. Wait for answers before sending more.' }), 'You have too many requests waiting. Wait for answers before sending more.');
  assert.equal(friendlyError({ message: 'Messages are only for friends. Send a friend request first.' }), 'Messages are only for friends. Send a friend request first.');
  // technical text never reaches the screen
  assert.match(friendlyError({ code: '42501', message: 'new row violates row-level security policy for table "messages"' }), /not allowed/);
  assert.equal(friendlyError({ message: 'duplicate key value violates unique constraint "x".' }, 'Fallback'), 'Fallback');
  assert.match(friendlyError({ message: 'user is blocked' }), /cannot do that/);
  assert.match(friendlyError({ message: 'too many pending friend requests' }), /too many pending/);
  assert.match(friendlyError({ message: 'you must be friends to chat' }), /be friends/);
  assert.equal(friendlyError({ message: 'boom' }, 'Fallback'), 'Fallback');
  assert.equal(friendlyError(undefined), 'Something went wrong. Please try again.');
});

console.log(`\n${n} passed`);
