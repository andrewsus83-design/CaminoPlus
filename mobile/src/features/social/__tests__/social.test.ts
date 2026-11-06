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
import type { ChatMessage, Conversation, Friend, MessageEntry, Member, NotificationItem, OutboxItem, PilgrimResult, TimelineMessage } from '../types';
import {
  ALERT_ACTIVE_MS, ALERT_KEEP_MS, EMERGENCY_URL, FIX_OLD_MS, HELP_BELL, HELP_MIN_GAP_MS, HELP_OK, HELP_SIGNATURE, LAST_KNOWN_MAX_AGE_MS, MAX_RECIPIENTS, OK_MIN_GAP_MS,
  accuracyText, addOk, addRing, ageText, allFriendsChosen, buildHelpMessage, buildPickerRows, chooseFix, cleanPlace, coord, deliveryOf, deliveryRows,
  failureText, fixFromSupplied, friendRecipient, groupRecipient, helpWaitMs, isAlertActive, isAlertStale, isChosen, isHelpMessage, isMapUrl, isSafeUrl, lastHelpAt, lastOkAt,
  linkify, mapsUrl, markArrived, namesText, osmUrl, packRecipients, parseAlert, parseHelpMessage, parseSavedRecipients, reconcileRecipients,
  recipientKey, replaceSend, ringBlocker, setFriendsChosen, splitByRateLimit, summarizeDeliveries, toggleRecipient, urlsIn, validCoords, waitSeconds,
} from '../help/logic';
import type { HelpAlert, HelpFix, HelpSend, Recipient } from '../help/logic';

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

/* ================================================================ help bell ================================================================ */

const FIX_AT = new Date(2026, 10, 5, 14, 32).getTime(); // 14:32 local
const fixA: HelpFix = { lat: 42.930123, lng: -1.510447, accuracyM: 12.4, at: FIX_AT };
const GOOGLE_A = 'https://maps.google.com/?q=42.93012,-1.51045';
const OSM_A = 'https://www.openstreetmap.org/?mlat=42.93012&mlon=-1.51045#map=17/42.93012/-1.51045';

test('help message: bell line, place, position with accuracy and time, both map links, signature', () => {
  assert.equal(buildHelpMessage({ fix: fixA, place: 'about 2.1 km after Zubiri, stage 3' }), [
    '🔔 I need help',
    'Place: about 2.1 km after Zubiri, stage 3',
    'Position: 42.93012, -1.51045 (about 12 m, 14:32)',
    GOOGLE_A,
    OSM_A,
    'Sent from CaminoPlus',
  ].join('\n'));
  // without a place there is no place line
  assert.equal(buildHelpMessage({ fix: fixA }), ['🔔 I need help', 'Position: 42.93012, -1.51045 (about 12 m, 14:32)', GOOGLE_A, OSM_A, 'Sent from CaminoPlus'].join('\n'));
  assert.equal(buildHelpMessage({ fix: fixA, place: '   ' }).split('\n').length, 5);
  assert.equal(HELP_BELL, '🔔 I need help');
  assert.equal(HELP_SIGNATURE, 'Sent from CaminoPlus');
});

test('help message: coordinates have 5 decimals, accuracy is rounded or left out, the time is the fix time', () => {
  assert.equal(coord(42.9301249), '42.93012');
  assert.equal(coord(-1.5), '-1.50000');
  assert.equal(coord(-0.000001), '0.00000'); // never "-0.00000"
  assert.equal(mapsUrl(42.93, -1.5), 'https://maps.google.com/?q=42.93000,-1.50000');
  assert.equal(osmUrl(42.93, -1.5), 'https://www.openstreetmap.org/?mlat=42.93000&mlon=-1.50000#map=17/42.93000/-1.50000');
  assert.equal(accuracyText(12.4), 'about 12 m');
  assert.equal(accuracyText(12.6), 'about 13 m');
  assert.equal(accuracyText(0.2), 'about 1 m');
  assert.equal(accuracyText(1500), 'about 1500 m');
  for (const bad of [0, -3, NaN, Infinity, null, undefined]) assert.equal(accuracyText(bad as number | null), null);
  assert.match(buildHelpMessage({ fix: { ...fixA, accuracyM: null } }), /\nPosition: 42\.93012, -1\.51045 \(14:32\)\n/);
  assert.match(buildHelpMessage({ fix: { ...fixA, at: new Date(2026, 10, 5, 7, 5).getTime() } }), /\(about 12 m, 07:05\)/);
  assert.match(buildHelpMessage({ fix: { lat: -33.8688, lng: 151.2093, accuracyM: 5, at: FIX_AT } }), /Position: -33\.86880, 151\.20930 /);
});

test('help message: a place text cannot add lines or run on (it goes into a message)', () => {
  assert.equal(cleanPlace('  about 2 km   after\nZubiri  '), 'about 2 km after Zubiri');
  assert.equal(cleanPlace(null), null);
  assert.equal(cleanPlace('\n \t'), null);
  assert.equal(cleanPlace('x'.repeat(300))!.length, 120);
  assert.ok(cleanPlace('x'.repeat(300))!.endsWith('…'));
  const msg = buildHelpMessage({ fix: fixA, place: 'Zubiri\nhttps://evil.example\nSent from CaminoPlus' });
  assert.equal(msg.split('\n').length, 6);
  assert.equal(msg.split('\n')[1], 'Place: Zubiri https://evil.example Sent from CaminoPlus');
});

test('isHelpMessage: the first line is the bell line', () => {
  assert.ok(isHelpMessage(buildHelpMessage({ fix: fixA })));
  assert.ok(isHelpMessage('🔔 I need help'));
  assert.ok(isHelpMessage('  \n🔔 I need help\r\nPosition: 1, 2'));
  assert.ok(isHelpMessage('🔔 I need help   \nmore'));
  for (const no of ['I need help', '🔔 I need help!', 'Hi 🔔 I need help', '🔔 I need helpers', '', '   ', 'Position: 42.1, -1.2', HELP_OK]) assert.ok(!isHelpMessage(no), no);
  assert.ok(!isHelpMessage(null));
  assert.ok(!isHelpMessage(undefined));
});

test('parseHelpMessage reads a message back for the bubble and never trusts a link it cannot place', () => {
  const p = parseHelpMessage(buildHelpMessage({ fix: fixA, place: 'about 2.1 km after Zubiri, stage 3' }));
  assert.deepEqual(p, { place: 'about 2.1 km after Zubiri, stage 3', position: '42.93012, -1.51045 (about 12 m, 14:32)', lat: 42.93012, lng: -1.51045, mapUrl: GOOGLE_A, rest: '' });
  // no map link in the text: built from the coordinates
  assert.equal(parseHelpMessage('🔔 I need help\nPosition: 42.5, -1.25 (14:00)').mapUrl, 'https://maps.google.com/?q=42.50000,-1.25000');
  // nothing to place: no button, the words stay
  const bare = parseHelpMessage('🔔 I need help\nPlease call me back');
  assert.equal(bare.mapUrl, null);
  assert.equal(bare.rest, 'Please call me back');
  assert.equal(bare.position, null);
  // a link that is not a map is never behind "Open map"
  const evil = parseHelpMessage('🔔 I need help\nhttps://evil.example/login\nSee https://evil.example/login now');
  assert.equal(evil.mapUrl, null);
  assert.equal(evil.rest, 'https://evil.example/login\nSee https://evil.example/login now'); // a link that is not a map stays visible as a plain link, never behind a button
  assert.equal(parseHelpMessage('🔔 I need help\nhttps://maps.google.com.evil.example/?q=1,2').mapUrl, null);
  // impossible coordinates do not make a link
  assert.equal(parseHelpMessage('🔔 I need help\nPosition: 91.0, 400.0').mapUrl, null);
});

/* ---------------- links in bubbles ---------------- */

const asText = (t: string) => linkify(t).map((p) => p.text).join('');

test('linkify: http and https links become links, everything else stays text', () => {
  assert.deepEqual(linkify('no links here'), [{ text: 'no links here' }]);
  assert.deepEqual(linkify(''), []);
  assert.deepEqual(linkify('see https://camino.plus/faq please'), [{ text: 'see ' }, { text: 'https://camino.plus/faq', url: 'https://camino.plus/faq' }, { text: ' please' }]);
  assert.deepEqual(linkify('http://a.example'), [{ text: 'http://a.example', url: 'http://a.example' }]);
  assert.deepEqual(linkify('one https://a.example/x two http://b.example/y'), [
    { text: 'one ' }, { text: 'https://a.example/x', url: 'https://a.example/x' }, { text: ' two ' }, { text: 'http://b.example/y', url: 'http://b.example/y' },
  ]);
  assert.deepEqual(urlsIn(`${GOOGLE_A}\n${OSM_A}`), [GOOGLE_A, OSM_A]);
});

test('linkify: the splitter loses no text, also on odd input', () => {
  for (const t of ['', 'a', 'https://a.example', 'x https://a.example, y (https://b.example/p_(q)). z', buildHelpMessage({ fix: fixA, place: 'Zubiri' }), '\n\nhttps://a.example\n', 'ftp://x javascript:alert(1) https://ok.example!']) {
    assert.equal(asText(t), t);
  }
});

test('linkify: punctuation after a link is not part of it, brackets only when they belong to it', () => {
  assert.equal(linkify('Go to https://a.example/x.')[1].url, 'https://a.example/x');
  assert.equal(linkify('Is it https://a.example/x?')[1].url, 'https://a.example/x');
  assert.equal(linkify('https://a.example/x, https://b.example/y;')[0].url, 'https://a.example/x');
  assert.equal(linkify('(see https://a.example/x)')[1].url, 'https://a.example/x');
  assert.equal(linkify('"https://a.example/x"')[1].url, 'https://a.example/x');
  assert.equal(linkify('https://en.example/wiki/Foo_(bar)')[0].url, 'https://en.example/wiki/Foo_(bar)');
  assert.equal(linkify('(https://en.example/wiki/Foo_(bar))')[1].url, 'https://en.example/wiki/Foo_(bar)');
  assert.equal(linkify('<https://a.example/x>')[1].url, 'https://a.example/x');
  assert.equal(linkify('https://a.example/x…')[0].url, 'https://a.example/x');
  // inside the link they stay: commas, question marks, hashes, ampersands
  assert.equal(linkify(`${OSM_A}.`)[0].url, OSM_A);
  assert.equal(linkify('https://a.example/p?x=1&y=2#top!')[0].url, 'https://a.example/p?x=1&y=2#top');
  // the text of the tail goes to the next part
  assert.deepEqual(linkify('https://a.example/x.').map((p) => p.text), ['https://a.example/x', '.']);
});

test('linkify: javascript:, data:, tel:, ftp:, file: and bare addresses are never links', () => {
  for (const t of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<b>x</b>', 'tel:112', 'mailto:a@b.example', 'ftp://a.example/x', 'file:///etc/passwd', 'www.camino.plus', 'camino.plus/faq', 'caminoplus://friends', 'intent://x#Intent;end', 'https://', 'http://', 'https:// ', 'https:///x']) {
    assert.deepEqual(urlsIn(t), [], t);
  }
  // a scheme glued to a word is not a link either
  assert.deepEqual(urlsIn('xhttps://a.example'), []);
  // but a link with a harmless script-looking tail is only a link to that address
  assert.deepEqual(urlsIn('https://a.example/javascript:alert(1)'), ['https://a.example/javascript:alert(1)']);
  assert.deepEqual(urlsIn('click javascript:alert(1) or https://a.example'), ['https://a.example']);
});

test('linkify: scheme case does not matter and the opened url has a lower case scheme', () => {
  const parts = linkify('Visit HTTPS://Camino.Plus/FAQ now');
  assert.equal(parts[1].text, 'HTTPS://Camino.Plus/FAQ');
  assert.equal(parts[1].url, 'https://Camino.Plus/FAQ');
  assert.equal(linkify('Http://a.example')[0].url, 'http://a.example');
});

test('isSafeUrl is the last check before a link is opened', () => {
  assert.ok(isSafeUrl('https://a.example/x'));
  assert.ok(isSafeUrl('http://localhost:3000/x'));
  assert.ok(isSafeUrl('https://[::1]/x'));
  for (const bad of ['javascript:alert(1)', 'tel:112', 'https://', 'https:// x', 'https://a.example/\nx', 'https://a.example/\u0000', '', 'x', ' https://a.example', null, undefined, 42, `https://a.example/${'x'.repeat(2100)}`]) assert.ok(!isSafeUrl(bad), String(bad));
  assert.deepEqual(urlsIn(`https://a.example/${'x'.repeat(2100)}`), []); // absurdly long: stays text
});

test('isMapUrl: only the big map services, host checked exactly', () => {
  for (const ok of [GOOGLE_A, OSM_A, 'https://www.google.com/maps/place/Zubiri', 'https://google.com/maps?q=1,2', 'https://maps.apple.com/?ll=1,2', 'https://www.openstreetmap.org/#map=17/1/2']) assert.ok(isMapUrl(ok), ok);
  for (const no of ['https://maps.google.com.evil.example/?q=1,2', 'https://evil.example/?https://maps.google.com/', 'https://maps.google.com@evil.example/', 'https://www.google.com/mapsx', 'https://openstreetmap.org.evil.example/', 'https://evil.example/maps.google.com', 'tel:112']) assert.ok(!isMapUrl(no), no);
});

/* ---------------- rate limit ---------------- */

test('rate limit: one help message per chat per 60 seconds', () => {
  const T = 1_000_000;
  assert.equal(HELP_MIN_GAP_MS, 60_000);
  assert.equal(helpWaitMs(undefined, T), 0);
  assert.equal(helpWaitMs(null, T), 0);
  assert.equal(helpWaitMs(T - 1_000, T), 59_000);
  assert.equal(helpWaitMs(T - 59_999, T), 1);
  assert.equal(helpWaitMs(T - 60_000, T), 0);
  assert.equal(helpWaitMs(T - 600_000, T), 0);
  assert.equal(helpWaitMs(T + 5 * 3_600_000, T), 0); // the clock moved back: never block for hours
  assert.equal(helpWaitMs(T - 1_000, T, OK_MIN_GAP_MS), 4_000);
  assert.deepEqual([1, 1_000, 59_001, 60_000].map(waitSeconds), [1, 1, 60, 60]);
});

test('rate limit: a chat that is waiting is held back, the others go, unknown chats were never messaged', () => {
  const T = 5_000_000;
  const list = [{ chatId: 'a', n: 1 }, { chatId: 'b', n: 2 }, { chatId: null, n: 3 }, { chatId: 'c', n: 4 }];
  const r = splitByRateLimit(list, { a: T - 10_000, c: T - 61_000 }, T);
  assert.deepEqual(r.allowed.map((x) => x.n), [2, 3, 4]);
  assert.deepEqual(r.waiting.map((x) => [x.item.n, x.waitMs]), [[1, 50_000]]);
  assert.deepEqual(splitByRateLimit([], {}, T), { allowed: [], waiting: [] });
});

/* ---------------- the position policy ---------------- */

test('validCoords: real positions only', () => {
  assert.ok(validCoords(42.93, -1.51));
  assert.ok(validCoords(90, 180));
  assert.ok(validCoords(0, 12));
  for (const [a, b] of [[0, 0], [91, 0], [0, 181], [NaN, 1], [1, Infinity], ['1', 2], [null, 2], [undefined, undefined]] as [unknown, unknown][]) assert.ok(!validCoords(a, b), `${a},${b}`);
});

test('chooseFix: a fresh fix wins; else the newest of the last known and the map, never older than two hours', () => {
  const now = FIX_AT + 10 * 60_000;
  const fresh: HelpFix = { lat: 1, lng: 2, accuracyM: 8, at: now - 3_000 };
  const last: HelpFix = { lat: 3, lng: 4, accuracyM: 30, at: now - 20 * 60_000 };
  const map: HelpFix = { lat: 5, lng: 6, accuracyM: 20, at: now - 5 * 60_000 };
  assert.deepEqual(chooseFix({ fresh, lastKnown: last, supplied: map, now }), { fix: fresh, source: 'fresh' });
  assert.deepEqual(chooseFix({ lastKnown: last, supplied: map, now }), { fix: map, source: 'map' });
  assert.deepEqual(chooseFix({ lastKnown: last, now }), { fix: last, source: 'last-known' });
  assert.deepEqual(chooseFix({ lastKnown: { ...last, at: now - 60_000 }, supplied: map, now })?.source, 'last-known'); // the newer one wins
  // too old: no honest position
  assert.equal(chooseFix({ lastKnown: { ...last, at: now - LAST_KNOWN_MAX_AGE_MS - 1 }, now }), null);
  assert.equal(chooseFix({ lastKnown: { ...last, at: now - LAST_KNOWN_MAX_AGE_MS }, now })?.source, 'last-known');
  assert.equal(chooseFix({ now }), null);
  // an old map position loses to a younger last known one, and neither is used when both are too old
  assert.equal(chooseFix({ lastKnown: last, supplied: { ...map, at: now - 3 * 3_600_000 }, now })?.source, 'last-known');
  assert.equal(chooseFix({ lastKnown: { ...last, at: now - 3 * 3_600_000 }, supplied: { ...map, at: now - 3 * 3_600_000 }, now }), null);
});

test('chooseFix: bad coordinates and timestamps from the future are never used', () => {
  const now = FIX_AT;
  const bad = (over: Partial<HelpFix>): HelpFix => ({ lat: 1, lng: 2, accuracyM: 5, at: now, ...over });
  assert.equal(chooseFix({ fresh: bad({ lat: 0, lng: 0 }), now }), null);
  assert.equal(chooseFix({ fresh: bad({ lat: NaN }), now }), null);
  assert.equal(chooseFix({ fresh: bad({ lat: 120 }), now }), null);
  assert.equal(chooseFix({ lastKnown: bad({ at: now + 3_600_000 }), now }), null); // from the future
  assert.equal(chooseFix({ lastKnown: bad({ at: now + 30_000 }), now })?.source, 'last-known'); // a clock a few seconds off is fine
  assert.equal(chooseFix({ lastKnown: bad({ at: NaN }), now }), null);
  // a bad fresh fix does not hide a good older one
  assert.equal(chooseFix({ fresh: bad({ lat: 0, lng: 0 }), lastKnown: bad({ at: now - 1000 }), now })?.source, 'last-known');
});

test('fixFromSupplied: the map position as a fix; without a time it counts as taken now', () => {
  assert.deepEqual(fixFromSupplied({ lat: 42.9, lng: -1.5, accuracyM: 9, at: 123 }, 999), { lat: 42.9, lng: -1.5, accuracyM: 9, at: 123 });
  assert.deepEqual(fixFromSupplied({ lat: 42.9, lng: -1.5 }, 999), { lat: 42.9, lng: -1.5, accuracyM: null, at: 999 });
  assert.equal(fixFromSupplied({ lat: 42.9, lng: -1.5, accuracyM: 0 }, 1)?.accuracyM, null);
  assert.equal(fixFromSupplied({ lat: 0, lng: 0 }, 1), null);
  assert.equal(fixFromSupplied(null, 1), null);
  assert.equal(fixFromSupplied(undefined, 1), null);
});

test('ageText and failureText say it plainly', () => {
  assert.deepEqual([0, 4_000, 9_999].map(ageText), ['just now', 'just now', 'just now']);
  assert.deepEqual([10_000, 40_000, 59_000].map(ageText), ['10 s ago', '40 s ago', '59 s ago']);
  assert.deepEqual([60_000, 4 * 60_000 + 20_000, 59 * 60_000].map(ageText), ['1 min ago', '4 min ago', '59 min ago']);
  assert.deepEqual([3_600_000, 80 * 60_000, 2 * 3_600_000].map(ageText), ['1 h ago', '1 h 20 min ago', '2 h ago']);
  assert.equal(ageText(-5_000), 'just now');
  assert.ok(FIX_OLD_MS < LAST_KNOWN_MAX_AGE_MS);
  for (const f of ['denied', 'blocked', 'services-off', 'timeout', 'unavailable'] as const) assert.ok(failureText(f).length > 20 && !/error|exception/i.test(failureText(f)), f);
  assert.match(failureText('timeout'), /10 seconds/);
  assert.equal(EMERGENCY_URL, 'tel:112');
});

/* ---------------- who gets it, and what is remembered ---------------- */

const fr = (id: string, name: string | null, username: string | null = null): Friend => ({ id, username, display_name: name, avatar_url: null, km_walked: null, since: null });
const FRIENDS = [fr('f-luc', 'Lucas Ruiz', 'lucas_r'), fr('f-ana', 'Ana Torres', 'ana_t'), fr('f-mar', 'María José', 'mj'), fr('f-tom', null, 'tom_b')];
const group = (id: string, title: string, n = 5): Conversation => conv({ id, kind: 'group', title, member_count: n, peer_id: null, peer_username: null, peer_display_name: null });
const CONVS = [conv({ id: 'c-ana', peer_id: 'f-ana' }), group('g-fam', 'Camino family', 5), group('g-bur', 'Burgos crew', 3), conv({ id: 'c-luc', peer_id: 'f-luc', peer_display_name: 'Lucas Ruiz' })];
const rec = (kind: 'friend' | 'group', id: string, name: string, chatId: string | null = null): Recipient => ({ kind, id, name, chatId });

test('recipients: friends and groups have their own keys, a friend gets the chat id of an existing direct chat', () => {
  assert.equal(recipientKey(rec('friend', 'x', 'X')), 'friend:x');
  assert.notEqual(recipientKey(rec('friend', 'x', 'X')), recipientKey(rec('group', 'x', 'X')));
  assert.deepEqual(friendRecipient(FRIENDS[1], CONVS), rec('friend', 'f-ana', 'Ana Torres', 'c-ana'));
  assert.deepEqual(friendRecipient(FRIENDS[2], CONVS), rec('friend', 'f-mar', 'María José', null)); // no chat yet: start_direct_chat will make one
  assert.deepEqual(friendRecipient(FRIENDS[3], null), rec('friend', 'f-tom', 'tom_b', null));
  assert.deepEqual(groupRecipient(CONVS[1]), rec('group', 'g-fam', 'Camino family', 'g-fam'));
  assert.ok(isChosen([rec('friend', 'f-ana', 'Ana')], rec('friend', 'f-ana', 'other name')));
  assert.ok(!isChosen([rec('friend', 'f-ana', 'Ana')], rec('group', 'f-ana', 'Ana')));
});

test('recipients: the saved choice survives a round trip, keeps names and chat ids, and starts empty', () => {
  const list = [rec('friend', 'f-ana', 'Ana Torres', 'c-ana'), rec('friend', 'f-mar', 'María José'), rec('group', 'g-fam', 'Camino family', 'g-fam')];
  const saved = JSON.parse(JSON.stringify(packRecipients(list)));
  assert.equal(saved.v, 1);
  assert.deepEqual(parseSavedRecipients(saved), list);
  // the first time there is nothing: nothing is chosen
  for (const nothing of [null, undefined, {}, [], 'x', 42, { v: 1 }, { v: 1, items: 'x' }, { v: 2, items: [{ kind: 'friend', id: 'a', name: 'A' }] }]) assert.deepEqual(parseSavedRecipients(nothing), []);
});

test('recipients: odd saved data is dropped, duplicates collapse, a group always writes in its own chat, the list is capped', () => {
  const items = [
    { kind: 'friend', id: 'a', name: '  Ana  ', chatId: 'c1' }, { kind: 'friend', id: 'a', name: 'Ana again', chatId: 'c2' },
    { kind: 'group', id: 'g', name: 'Fam', chatId: 'something-else' }, { kind: 'robot', id: 'r', name: 'R' }, { kind: 'friend', id: '', name: 'No id' },
    { kind: 'friend', id: 'x'.repeat(81), name: 'Long id' }, null, 'junk', { kind: 'friend', id: 'n', name: '', chatId: 42 },
  ];
  const out = parseSavedRecipients({ v: 1, items });
  assert.deepEqual(out, [rec('friend', 'a', 'Ana', 'c1'), rec('group', 'g', 'Fam', 'g'), rec('friend', 'n', 'Pilgrim', null)]);
  const many = Array.from({ length: 40 }, (_, i) => ({ kind: 'friend', id: `p${i}`, name: `P${i}` }));
  assert.equal(parseSavedRecipients({ v: 1, items: many }).length, MAX_RECIPIENTS);
  assert.equal(packRecipients(many.map((m) => rec('friend', m.id, m.name))).items.length, MAX_RECIPIENTS);
  assert.equal(MAX_RECIPIENTS * 2 <= 60, true); // ring + "I am OK now" fit the database limit of 60 messages a minute
});

test('recipients: a saved choice is brought up to date: unfriended people and left groups drop out, names and chats refresh', () => {
  const saved = [rec('friend', 'f-ana', 'Old name', null), rec('friend', 'f-gone', 'Gone Friend', 'c-gone'), rec('group', 'g-fam', 'Old group', 'g-fam'), rec('group', 'g-left', 'Left group', 'g-left')];
  assert.deepEqual(reconcileRecipients(saved, FRIENDS, CONVS), [rec('friend', 'f-ana', 'Ana Torres', 'c-ana'), rec('group', 'g-fam', 'Camino family', 'g-fam')]);
  // offline or a failed list: what was remembered is kept as it is (the whole point of remembering)
  assert.deepEqual(reconcileRecipients(saved, null, null), saved);
  // only the friends loaded: groups stay; only the chats loaded: friends stay
  assert.deepEqual(reconcileRecipients(saved, FRIENDS, null).map((r) => r.id), ['f-ana', 'g-fam', 'g-left']);
  assert.deepEqual(reconcileRecipients(saved, null, CONVS).map((r) => r.id), ['f-ana', 'f-gone', 'g-fam']);
  assert.deepEqual(reconcileRecipients([], FRIENDS, CONVS), []);
});

test('recipients: choosing and unchoosing, with a limit', () => {
  let r = toggleRecipient([], rec('friend', 'a', 'A'));
  assert.deepEqual(r.list.map((x) => x.id), ['a']);
  r = toggleRecipient(r.list, rec('group', 'g', 'G'));
  r = toggleRecipient(r.list, rec('friend', 'a', 'A'));
  assert.deepEqual(r.list.map((x) => x.id), ['g']);
  assert.equal(r.limited, false);
  const full = Array.from({ length: 3 }, (_, i) => rec('friend', `p${i}`, `P${i}`));
  const blocked = toggleRecipient(full, rec('friend', 'new', 'New'), 3);
  assert.deepEqual([blocked.list.length, blocked.limited], [3, true]);
  assert.equal(toggleRecipient(full, full[0], 3).limited, false); // taking one out is always possible
  const input = [rec('friend', 'a', 'A')];
  toggleRecipient(input, rec('friend', 'b', 'B'));
  assert.equal(input.length, 1); // the input is not changed
});

test('recipients: "Select all friends" adds every friend, keeps groups, honours the limit, and unselects only friends', () => {
  const friends = FRIENDS.map((f) => friendRecipient(f, CONVS));
  const g = groupRecipient(CONVS[1]);
  const all = setFriendsChosen([g], friends, true);
  assert.deepEqual(all.list.map((x) => x.id), ['g-fam', 'f-luc', 'f-ana', 'f-mar', 'f-tom']);
  assert.equal(all.limited, false);
  assert.ok(allFriendsChosen(all.list, friends));
  assert.ok(!allFriendsChosen([g], friends));
  assert.ok(!allFriendsChosen([], []));
  assert.deepEqual(setFriendsChosen(all.list, friends, false).list.map((x) => x.id), ['g-fam']);
  const capped = setFriendsChosen([g], friends, true, 3);
  assert.deepEqual([capped.list.length, capped.limited], [3, true]);
  assert.deepEqual(setFriendsChosen(all.list, friends, true).list.length, 5); // no duplicates when pressed twice
});

test('recipient picker: friends by name, groups by name, search ignores case and accents, chosen rows are marked', () => {
  const chosen = [rec('friend', 'f-ana', 'Ana Torres', 'c-ana'), rec('group', 'g-bur', 'Burgos crew', 'g-bur')];
  const rows = buildPickerRows({ friends: FRIENDS, convs: CONVS, chosen, query: '' });
  assert.deepEqual(rows.friends.map((r) => r.recipient.name), ['Ana Torres', 'Lucas Ruiz', 'María José', 'tom_b']);
  assert.deepEqual(rows.friends.map((r) => r.chosen), [true, false, false, false]);
  assert.deepEqual(rows.groups.map((r) => [r.recipient.name, r.detail, r.chosen]), [['Burgos crew', '3 pilgrims', true], ['Camino family', '5 pilgrims', false]]);
  assert.equal(rows.remembered, false);
  assert.deepEqual(buildPickerRows({ friends: FRIENDS, convs: CONVS, chosen, query: 'MARIA' }).friends.map((r) => r.recipient.id), ['f-mar']);
  assert.deepEqual(buildPickerRows({ friends: FRIENDS, convs: CONVS, chosen, query: 'lucas_r' }).friends.map((r) => r.recipient.id), ['f-luc']);
  assert.deepEqual(buildPickerRows({ friends: FRIENDS, convs: CONVS, chosen, query: 'fam' }).groups.map((r) => r.recipient.id), ['g-fam']);
  const none = buildPickerRows({ friends: FRIENDS, convs: CONVS, chosen, query: 'zzz' });
  assert.deepEqual([none.friends.length, none.groups.length], [0, 0]);
});

test('recipient picker: when the lists could not load, the remembered choice is what you see (and can use)', () => {
  const chosen = [rec('friend', 'f-ana', 'Ana Torres', 'c-ana'), rec('group', 'g-fam', 'Camino family', 'g-fam')];
  const rows = buildPickerRows({ friends: null, convs: null, chosen, query: '' });
  assert.deepEqual(rows.friends.map((r) => [r.recipient.name, r.chosen]), [['Ana Torres', true]]);
  assert.deepEqual(rows.groups.map((r) => [r.recipient.name, r.chosen]), [['Camino family', true]]);
  assert.equal(rows.remembered, true);
  assert.deepEqual(buildPickerRows({ friends: null, convs: null, chosen, query: 'camino' }).friends, []);
  // only the chats failed: friends from the server, groups from memory
  const half = buildPickerRows({ friends: FRIENDS, convs: null, chosen, query: '' });
  assert.equal(half.friends.length, 4);
  assert.deepEqual(half.groups.map((r) => r.recipient.id), ['g-fam']);
});

test('ringBlocker: who first, then the position, then the wait; null when it can go', () => {
  assert.equal(ringBlocker({ chosen: 0, hasFix: false, locating: true, waitMs: 0 }), 'Choose who should get it.');
  assert.equal(ringBlocker({ chosen: 2, hasFix: false, locating: true, waitMs: 0 }), 'Finding your position…');
  assert.match(ringBlocker({ chosen: 2, hasFix: false, locating: false, waitMs: 0 })!, /No position yet/);
  assert.equal(ringBlocker({ chosen: 2, hasFix: true, locating: false, waitMs: 12_300 }), 'You can send again in 13 s.');
  assert.equal(ringBlocker({ chosen: 2, hasFix: true, locating: true, waitMs: 0 }), null); // a position (the map's) is there while a better one is looked for
  assert.equal(ringBlocker({ chosen: 1, hasFix: true, locating: false, waitMs: 0 }), null);
});

test('namesText: one, two, three and more people', () => {
  assert.equal(namesText([]), '');
  assert.equal(namesText([{ name: 'Ana' }]), 'Ana');
  assert.equal(namesText([{ name: 'Ana' }, { name: 'Lucas' }]), 'Ana and Lucas');
  assert.equal(namesText([{ name: 'Ana' }, { name: 'Lucas' }, { name: 'Marta' }]), 'Ana, Lucas and 1 more');
  assert.equal(namesText([{ name: 'Ana' }, { name: 'Lucas' }, { name: 'Marta' }, { name: 'João' }, { name: 'Tom' }]), 'Ana, Lucas and 3 more');
  assert.equal(namesText([{ name: 'A' }, { name: 'B' }, { name: 'C' }], 3), 'A, B and C');
});

/* ---------------- the bell that was rung ---------------- */

const T0 = new Date(2026, 10, 5, 14, 32).getTime();
const send = (over: Partial<HelpSend> = {}): HelpSend => ({
  id: 's1', kind: 'help', recipientKey: 'friend:f-ana', chatId: 'c-ana', messageId: 'm1', body: '🔔 I need help', at: T0, sentAt: null, error: null, ...over,
});
const ob = (id: string, status: 'queued' | 'sending' | 'failed', attempts = 0, error: string | null = null) => ({ id, status, attempts, error });

test('delivery status comes from the outbox and is "Sent" only when the app saw the message arrive', () => {
  assert.deepEqual(deliveryOf(send(), [ob('m1', 'sending')]), { state: 'sending', label: 'Sending…', detail: null, retry: false });
  assert.equal(deliveryOf(send(), [ob('m1', 'queued', 0)]).state, 'sending'); // queued, not tried yet
  // the outbox stops at the first network failure: what waits behind it is waiting too, not "sending"
  assert.equal(deliveryOf(send(), [ob('m0', 'queued', 3), ob('m1', 'queued', 0)]).state, 'waiting');
  assert.equal(deliveryOf(send(), [ob('m0', 'failed', 1, 'No.'), ob('m1', 'queued', 0)]).state, 'sending'); // a rejected message does not stop the queue
  const waiting = deliveryOf(send(), [ob('m1', 'queued', 2)]);
  assert.deepEqual([waiting.state, waiting.label], ['waiting', 'Waiting for signal']);
  assert.deepEqual(deliveryOf(send(), [ob('m1', 'failed', 1, 'You can only message friends who are in this chat and have not blocked you.')]), {
    state: 'failed', label: 'Not sent', detail: 'You can only message friends who are in this chat and have not blocked you.', retry: true,
  });
  assert.equal(deliveryOf(send(), [ob('m1', 'failed')]).detail, 'This message could not be sent.');
  // gone from the outbox: sent when the app saw it arrive, otherwise we do not claim it
  assert.deepEqual(deliveryOf(send({ sentAt: T0 + 2000 }), []), { state: 'sent', label: 'Sent', detail: null, retry: false });
  const unknown = deliveryOf(send(), []);
  assert.deepEqual([unknown.state, unknown.label, unknown.retry], ['unknown', 'Not confirmed', false]);
  assert.equal(deliveryOf(send(), [ob('other', 'sending')]).state, 'unknown');
  // the chat could not even be started
  const noChat = deliveryOf(send({ chatId: null, messageId: null, error: 'This chat can only be started with a connection.' }), []);
  assert.deepEqual([noChat.state, noChat.retry, noChat.detail], ['failed', true, 'This chat can only be started with a connection.']);
});

test('summarizeDeliveries says what is true, in one sentence', () => {
  const d = (state: 'sending' | 'waiting' | 'sent' | 'failed' | 'unknown') => ({ delivery: { state, label: '', detail: null, retry: false } });
  assert.equal(summarizeDeliveries([]), '');
  assert.equal(summarizeDeliveries([{ delivery: null }]), '');
  assert.equal(summarizeDeliveries([d('sent')]), 'Sent to your chat.');
  assert.equal(summarizeDeliveries([d('sent'), d('sent'), d('sent')]), 'Sent to all 3 chats.');
  assert.equal(summarizeDeliveries([d('sent'), d('waiting'), d('sent')]), 'Sent to 2 of 3 chats. 1 waiting for signal.');
  assert.equal(summarizeDeliveries([d('waiting'), d('waiting')]), '2 waiting for signal.');
  assert.equal(summarizeDeliveries([d('sending'), d('failed'), d('sent'), d('unknown')]), 'Sent to 1 of 4 chats. 1 sending. 1 not sent. 1 not confirmed.');
});

const R_ANA = rec('friend', 'f-ana', 'Ana Torres', 'c-ana');
const R_LUC = rec('friend', 'f-luc', 'Lucas Ruiz', null);
const R_FAM = rec('group', 'g-fam', 'Camino family', 'g-fam');

test('the first ring starts an alert, later rings join the active one, "I am OK now" closes it', () => {
  const s1 = send({ id: 's1', recipientKey: recipientKey(R_ANA), chatId: 'c-ana', messageId: 'm1' });
  const s2 = send({ id: 's2', recipientKey: recipientKey(R_FAM), chatId: 'g-fam', messageId: 'm2' });
  const a1 = addRing(null, { now: T0, id: 'alert-1', recipients: [R_ANA, R_FAM], sends: [s1, s2] });
  assert.deepEqual([a1.id, a1.startedAt, a1.okAt, a1.sends.length], ['alert-1', T0, null, 2]);
  assert.ok(isAlertActive(a1, T0 + 60_000));
  assert.ok(isAlertActive(a1, T0 + ALERT_ACTIVE_MS - 1));
  assert.ok(!isAlertActive(a1, T0 + ALERT_ACTIVE_MS + 1));
  assert.ok(!isAlertActive(null, T0));
  // a new ring while active: same alert, recipients are the union, the newest data wins
  const s3 = send({ id: 's3', recipientKey: recipientKey(R_LUC), chatId: 'c-luc', messageId: 'm3', at: T0 + 90_000 });
  const a2 = addRing(a1, { now: T0 + 90_000, id: 'alert-2', recipients: [{ ...R_LUC, chatId: 'c-luc' }, { ...R_ANA, name: 'Ana T.' }], sends: [s3] });
  assert.equal(a2.id, 'alert-1');
  assert.deepEqual(a2.recipients.map((r) => [r.id, r.name]), [['f-ana', 'Ana T.'], ['g-fam', 'Camino family'], ['f-luc', 'Lucas Ruiz']]);
  assert.equal(a2.sends.length, 3);
  assert.equal(a1.sends.length, 2); // not changed in place
  // OK: the alert is over, so the next ring is a new alert
  const ok = addOk(a2, { now: T0 + 200_000, sends: [send({ id: 's4', kind: 'ok', messageId: 'm4', at: T0 + 200_000, body: HELP_OK })] });
  assert.equal(ok.okAt, T0 + 200_000);
  assert.ok(!isAlertActive(ok, T0 + 201_000));
  const next = addRing(ok, { now: T0 + 300_000, id: 'alert-3', recipients: [R_ANA], sends: [send({ id: 's5', at: T0 + 300_000 })] });
  assert.deepEqual([next.id, next.recipients.length, next.sends.length, next.okAt], ['alert-3', 1, 1, null]);
  // an old alert is also replaced
  assert.equal(addRing(a1, { now: T0 + ALERT_ACTIVE_MS + 5000, id: 'fresh', recipients: [R_ANA], sends: [] }).id, 'fresh');
});

test('the one-a-minute rule looks at the newest help message per chat; "I am OK now" has its own short guard', () => {
  const a = addRing(null, { now: T0, id: 'a', recipients: [R_ANA, R_FAM], sends: [
    send({ id: 's1', chatId: 'c-ana', at: T0 }), send({ id: 's2', chatId: 'c-ana', at: T0 + 70_000 }), send({ id: 's3', chatId: 'g-fam', at: T0 + 10_000 }),
    send({ id: 's4', kind: 'ok', chatId: 'c-ana', at: T0 + 80_000 }), send({ id: 's5', chatId: null, messageId: null, at: T0 + 5 }),
  ] });
  assert.deepEqual(lastHelpAt(a), { 'c-ana': T0 + 70_000, 'g-fam': T0 + 10_000 });
  assert.deepEqual(lastOkAt(a), { 'c-ana': T0 + 80_000 });
  assert.deepEqual(lastHelpAt(null), {});
  // 5 s after the OK another OK waits, 5 s later it does not
  assert.equal(helpWaitMs(lastOkAt(a)['c-ana'], T0 + 82_000, OK_MIN_GAP_MS), 3_000);
  assert.equal(helpWaitMs(lastOkAt(a)['c-ana'], T0 + 85_000, OK_MIN_GAP_MS), 0);
  const { allowed, waiting } = splitByRateLimit([R_ANA, R_FAM], lastHelpAt(a), T0 + 75_000);
  assert.deepEqual([allowed.map((r) => r.id), waiting.map((w) => [w.item.id, w.waitMs])], [['g-fam'], [['f-ana', 55_000]]]);
});

test('rows after the bell: the newest send of each person; once OK was said, a help message that did not go is not offered again', () => {
  const helpA = send({ id: 'h-a', recipientKey: recipientKey(R_ANA), chatId: 'c-ana', messageId: 'm-a', sentAt: T0 + 1000 });
  const helpL = send({ id: 'h-l', recipientKey: recipientKey(R_LUC), chatId: 'c-luc', messageId: 'm-l' });
  const helpF = send({ id: 'h-f', recipientKey: recipientKey(R_FAM), chatId: null, messageId: null, error: 'No connection.' });
  let a = addRing(null, { now: T0, id: 'a', recipients: [R_ANA, R_LUC, R_FAM], sends: [helpA, helpL, helpF] });
  const outbox = [ob('m-l', 'failed', 1, 'You cannot do that with this pilgrim.')];
  let rows = deliveryRows(a, outbox);
  assert.deepEqual(rows.map((r) => [r.recipient.id, r.delivery?.state, r.delivery?.retry]), [['f-ana', 'sent', false], ['f-luc', 'failed', true], ['g-fam', 'failed', true]]);
  assert.equal(summarizeDeliveries(rows), 'Sent to 1 of 3 chats. 2 not sent.');
  // a second send to Ana replaces the first one in the row
  a = addRing(a, { now: T0 + 70_000, id: 'x', recipients: [R_ANA], sends: [send({ id: 'h-a2', recipientKey: recipientKey(R_ANA), chatId: 'c-ana', messageId: 'm-a2', at: T0 + 70_000 })] });
  assert.equal(deliveryRows(a, outbox)[0].send?.id, 'h-a2');
  // OK was said: Ana gets her OK row; the ones whose help message never went out are not retried
  a = addOk(a, { now: T0 + 100_000, sends: [send({ id: 'o-a', kind: 'ok', recipientKey: recipientKey(R_ANA), chatId: 'c-ana', messageId: 'm-oa', at: T0 + 100_000, body: HELP_OK })] });
  rows = deliveryRows(a, outbox);
  assert.equal(rows[0].send?.kind, 'ok');
  assert.deepEqual(rows.slice(1).map((r) => [r.delivery?.state, r.delivery?.retry, r.delivery?.detail]), [
    ['failed', false, 'You said you are OK, so it was not sent.'], ['failed', false, 'You said you are OK, so it was not sent.'],
  ]);
  // a person without any send yet
  assert.equal(deliveryRows({ ...a, recipients: [...a.recipients, rec('friend', 'f-new', 'New')] }, outbox).pop()?.delivery, null);
});

test('replaceSend swaps a retried send, markArrived stamps only the messages of this alert', () => {
  const a = addRing(null, { now: T0, id: 'a', recipients: [R_ANA, R_LUC], sends: [send({ id: 's1', messageId: 'm1' }), send({ id: 's2', recipientKey: recipientKey(R_LUC), chatId: null, messageId: null, error: 'x' })] });
  const retried = replaceSend(a, 's2', send({ id: 's2b', recipientKey: recipientKey(R_LUC), chatId: 'c-luc', messageId: 'm2b' }));
  assert.deepEqual(retried.sends.map((s) => s.id), ['s1', 's2b']);
  const stamped = markArrived(retried, ['m1', 'unrelated'], T0 + 5000);
  assert.deepEqual(stamped.sends.map((s) => s.sentAt), [T0 + 5000, null]);
  assert.equal(markArrived(stamped, ['m1'], T0 + 9000).sends[0].sentAt, T0 + 5000); // already stamped: unchanged
  assert.equal(markArrived(retried, ['nope'], T0), retried); // the same object: no needless save or render
  assert.equal(markArrived(retried, [], T0), retried);
});

test('a saved bell is forgotten after a day: the phone does not keep somebody\'s old position', () => {
  const a = addRing(null, { now: T0, id: 'a', recipients: [R_ANA], sends: [send({ at: T0 + 60_000 })] });
  assert.ok(!isAlertStale(a, T0 + 60_000 + ALERT_KEEP_MS));
  assert.ok(isAlertStale(a, T0 + 60_000 + ALERT_KEEP_MS + 1));
  assert.ok(ALERT_KEEP_MS > ALERT_ACTIVE_MS);
});

test('the saved alert is read back for the right account only, and bad data gives nothing', () => {
  const a = addRing(null, { now: T0, id: 'a', recipients: [R_ANA, R_FAM], sends: [send({ id: 's1', sentAt: T0 + 2000 }), send({ id: 's2', recipientKey: recipientKey(R_FAM), chatId: 'g-fam', messageId: 'm2', error: null })] });
  const blob = JSON.parse(JSON.stringify({ v: 1, user_id: ME, alert: a }));
  assert.deepEqual(parseAlert(blob, ME), a);
  assert.equal(parseAlert(blob, 'someone-else'), null);
  for (const bad of [null, undefined, 'x', {}, { v: 2, user_id: ME, alert: a }, { v: 1, user_id: ME }, { v: 1, user_id: ME, alert: { id: 'a' } }, { v: 1, user_id: ME, alert: { ...a, sends: 'x' } }]) assert.equal(parseAlert(bad, ME), null);
  // broken sends are dropped, the rest is kept
  const half = parseAlert({ v: 1, user_id: ME, alert: { ...a, sends: [...a.sends, { id: 'junk' }, null, { ...a.sends[0], kind: 'robot' }] } }, ME) as HelpAlert;
  assert.equal(half.sends.length, 2);
  assert.equal(parseAlert({ v: 1, user_id: ME, alert: { ...a, okAt: 'soon' } }, ME)?.okAt, null);
});

console.log(`\n${n} passed`);
