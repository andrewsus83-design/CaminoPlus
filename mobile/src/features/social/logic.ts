// Pure logic of the social module: ids, time labels, chat timeline (clusters, date
// separators, unread divider, delivery state), outbox merge, unread maths, notification text,
// search helpers. No React Native imports on purpose: plain node tests cover all of it
// (npm run test:social).
import type {
  BlockedPilgrim, ChatMessage, Conversation, Delivery, FriendStatus, MessageEntry, Member, NotificationItem,
  OutboxItem, OutboxStatus, PilgrimResult, ReportReason, ReportTarget, StorageInfo, TimelineEntry, TimelineMessage, UnreadTotals,
} from './types';

/* ------------------------------------------------------------------ ids */

export type Rand = () => number;

/** RFC 4122 version 4 uuid from a random source (Math.random by default). */
export function uuidV4(rand: Rand = Math.random): string {
  const b = Array.from({ length: 16 }, () => Math.min(255, Math.floor(rand() * 256)));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.map((x) => x.toString(16).padStart(2, '0'));
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10).join('')}`;
}

/** New client generated id: crypto.randomUUID when the runtime has it, else the helper above. */
export function newId(): string {
  try {
    const g = globalThis as { crypto?: { randomUUID?: () => string } };
    if (typeof g.crypto?.randomUUID === 'function') return g.crypto.randomUUID();
  } catch {
    /* fall through to the Math.random version */
  }
  return uuidV4();
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/* ------------------------------------------------------------------ time */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const pad2 = (n: number) => String(n).padStart(2, '0');

export type TimeInput = string | number | Date;

/** Milliseconds since epoch, NaN when the text is not a date. Postgres sends microseconds
 *  (".123456+00:00"); some JS engines only like three digits, so retry with the fraction trimmed. */
export function ts(t: TimeInput): number {
  if (t instanceof Date) return t.getTime();
  if (typeof t === 'number') return t;
  const direct = Date.parse(t);
  if (!Number.isNaN(direct)) return direct;
  return Date.parse(t.replace(/(\.\d{3})\d+/, '$1'));
}

const toDate = (t: TimeInput) => new Date(ts(t));
const valid = (d: Date) => !Number.isNaN(d.getTime());

/** HH:mm in the phone's time zone. */
export function clockTime(t: TimeInput): string {
  const d = toDate(t);
  return valid(d) ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}` : '';
}

export function dayKey(t: TimeInput): string {
  const d = toDate(t);
  return valid(d) ? `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` : 'unknown';
}

/** Whole calendar days from `from` to `to` (local dates, so 23:59 -> 00:01 is 1). */
export function daysBetween(from: TimeInput, to: TimeInput): number {
  const a = toDate(from), b = toDate(to);
  if (!valid(a) || !valid(b)) return 0;
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86_400_000);
}

const dayMonth = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;

/** "3 Nov", or "3 Nov 2025" when it is not this year. */
export function shortDate(t: TimeInput, now: TimeInput = Date.now()): string {
  const d = toDate(t);
  if (!valid(d)) return '';
  return d.getFullYear() === toDate(now).getFullYear() ? dayMonth(d) : `${dayMonth(d)} ${d.getFullYear()}`;
}

/** Date separator in a chat: Today / Yesterday / Mon 3 Nov (/ Mon 3 Nov 2025). */
export function dayLabel(t: TimeInput, now: TimeInput = Date.now()): string {
  const d = toDate(t);
  if (!valid(d)) return '';
  const diff = daysBetween(d, now);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return `${WEEKDAYS[d.getDay()]} ${shortDate(d, now)}`;
}

/** Time on a conversation row: HH:mm today, Yesterday, weekday within a week, else 3 Nov. */
export function smartTime(t: TimeInput | null | undefined, now: TimeInput = Date.now()): string {
  if (t == null) return '';
  const d = toDate(t);
  if (!valid(d)) return '';
  const diff = daysBetween(d, now);
  if (diff <= 0) return clockTime(d);
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return WEEKDAYS[d.getDay()];
  return shortDate(d, now);
}

/** Time on a notification: 2 min ago, 1 h ago, Yesterday · 18:02, 3 days ago, 3 Nov. */
export function notificationTime(t: TimeInput, now: TimeInput = Date.now()): string {
  const d = toDate(t);
  if (!valid(d)) return '';
  const ms = ts(now) - d.getTime();
  if (ms < 60_000) return 'Just now';
  const diff = daysBetween(d, now);
  if (diff <= 0) {
    const mins = Math.floor(ms / 60_000);
    return mins < 60 ? `${mins} min ago` : `${Math.floor(mins / 60)} h ago`;
  }
  if (diff === 1) return `Yesterday · ${clockTime(d)}`;
  if (diff < 7) return `${diff} days ago`;
  return shortDate(d, now);
}

/* ------------------------------------------------------------------ names, colours, text */

export const AVATAR_TINTS = ['#E9C987', '#9DB4CC', '#BFD0C4', '#D7C6E0', '#F2D8B6', '#C9A48A'] as const;
// Sender names in group chats. All readable (>= 4.5:1) on the white bubble and on parchment.
export const NAME_COLORS = ['#A63D2F', '#1E4A7A', '#2F6B4F', '#7A5A0C', '#6B3F7A', '#0F6670', '#8A4B1F', '#4F5F1C'] as const;

export function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
export const nameColor = (id: string) => NAME_COLORS[hashString(id) % NAME_COLORS.length];
export const avatarTint = (id: string) => AVATAR_TINTS[hashString(id) % AVATAR_TINTS.length];

/** "Ana Torres" -> "AT", "Ana" -> "A", "@ana_t" -> "A". */
export function initials(name: string | null | undefined): string {
  const words = (name ?? '').replace(/^@/, '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = Array.from(words[0])[0] ?? '?';
  const last = words.length > 1 ? Array.from(words[words.length - 1])[0] ?? '' : '';
  return (first + last).toUpperCase();
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** Lower case without accents, for local search. */
export const norm = (t: string | null | undefined) => (t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

export const pilgrimsLabel = (n: number) => `${n} ${n === 1 ? 'pilgrim' : 'pilgrims'}`;

export const personName = (p: { display_name?: string | null; username?: string | null } | null | undefined, fallback = 'Pilgrim') =>
  p?.display_name?.trim() || p?.username?.trim() || fallback;

/** 0 -> "", 7 -> "7", 120 -> "99+". */
export const badgeLabel = (n: number, cap = 99) => (n <= 0 ? '' : n > cap ? `${cap}+` : String(Math.floor(n)));

/* ------------------------------------------------------------------ conversations */

export function conversationName(c: Conversation): string {
  if (c.kind === 'group') return c.title?.trim() || 'Group';
  return c.peer_display_name?.trim() || c.peer_username?.trim() || c.title?.trim() || 'Pilgrim';
}

export function isMuted(c: Pick<Conversation, 'muted_until'>, now: TimeInput = Date.now()): boolean {
  if (!c.muted_until) return false;
  if (/infinity/i.test(c.muted_until)) return true;
  return ts(c.muted_until) > ts(now);
}

/** "On", "Muted" or "Muted until 18:00 / 12 Nov" for the info screen. */
export function muteLabel(c: Pick<Conversation, 'muted_until'>, now: TimeInput = Date.now()): string {
  if (!isMuted(c, now) || !c.muted_until) return 'On';
  if (/infinity/i.test(c.muted_until) || ts(c.muted_until) - ts(now) > 5 * 365 * 86_400_000) return 'Muted';
  return daysBetween(now, c.muted_until) <= 0 ? `Muted until ${clockTime(c.muted_until)}` : `Muted until ${shortDate(c.muted_until, now)}`;
}

/** Last message line for a conversation row: "You: text", "Ana: text" in groups, plain in chats. */
export function previewLine(c: Conversation, meId: string): string {
  const raw = (c.last_message_preview ?? '').trim();
  if (!c.last_message_id && !raw) return 'No messages yet';
  const text = raw || 'Photo';
  if (c.last_message_sender && c.last_message_sender === meId) return `You: ${text}`;
  if (c.kind === 'group' && c.last_message_sender_name) {
    const who = firstName(c.last_message_sender_name);
    // System lines ("Ana created the group") already start with the name.
    if (!text.toLowerCase().startsWith(who.toLowerCase())) return `${who}: ${text}`;
  }
  return text;
}

export function filterConversations(list: Conversation[], query: string): Conversation[] {
  const q = norm(query);
  if (!q) return list;
  return list.filter((c) => norm(conversationName(c)).includes(q) || norm(c.peer_username).includes(q) || norm(c.last_message_preview).includes(q));
}

/* ------------------------------------------------------------------ unread maths */

export const NO_UNREAD: UnreadTotals = { notifications: 0, chats: 0, groups: 0, friendRequests: 0, total: 0 };

const count = (v: unknown, cap: number) => {
  const x = Math.floor(Number(v));
  return Number.isFinite(x) && x > 0 ? Math.min(x, cap) : 0;
};

/** get_unread_totals() row (or one-row array) -> UnreadTotals. Bad numbers become 0. */
export function normalizeTotals(row: unknown): UnreadTotals {
  const r = ((Array.isArray(row) ? row[0] : row) ?? {}) as Record<string, unknown>;
  const notifications = count(r.notifications, 999);
  const chats = count(r.chats, 99);
  const groups = count(r.groups, 99);
  return { notifications, chats, groups, friendRequests: count(r.friend_requests ?? r.friendRequests, 99), total: notifications + chats + groups };
}

export const sameTotals = (a: UnreadTotals, b: UnreadTotals) =>
  a.notifications === b.notifications && a.chats === b.chats && a.groups === b.groups && a.friendRequests === b.friendRequests && a.total === b.total;

/** Messages from other people (not system lines, not unsent) after my read cursor. */
export function countUnread(messages: Pick<ChatMessage, 'sender_id' | 'kind' | 'created_at' | 'deleted_at'>[], cursor: string | null, meId: string): number {
  if (!cursor) return 0;
  const at = ts(cursor);
  return messages.filter((m) => m.sender_id !== meId && m.kind !== 'system' && !m.deleted_at && ts(m.created_at) > at).length;
}

/* ------------------------------------------------------------------ chat timeline */

export const CLUSTER_GAP_MS = 5 * 60_000;

export type TimelineInput = {
  messages: TimelineMessage[];       // oldest first
  meId: string;
  isGroup: boolean;
  now: TimeInput;
  members: Pick<Member, 'user_id' | 'last_read_at'>[];
  unreadCursor: string | null;       // my last_read_at when the chat was opened
};

/** Chronological (oldest first) rows for the chat: date separators, the unread divider, system
 *  chips and message bubbles with cluster flags and delivery state. Reverse it for an inverted list. */
export function buildTimeline(o: TimelineInput): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  const others = o.members.filter((m) => m.user_id !== o.meId);
  const cursor = o.unreadCursor ? ts(o.unreadCursor) : null;
  let lastDay = '';
  let open: MessageEntry | null = null; // newest bubble that the next message may join
  let divider = false;

  for (const m of o.messages) {
    const day = dayKey(m.created_at);
    if (day !== lastDay) {
      out.push({ kind: 'date', key: `date-${day}`, label: dayLabel(m.created_at, o.now) });
      lastDay = day;
      open = null;
    }
    const mine = m.sender_id === o.meId;
    if (!divider && cursor != null && !mine && m.kind !== 'system' && !m.local && !m.deleted_at && ts(m.created_at) > cursor) {
      out.push({ kind: 'unread', key: 'unread-divider' });
      divider = true;
      open = null;
    }
    if (m.kind === 'system') {
      out.push({ kind: 'system', key: m.id, message: m });
      open = null;
      continue;
    }
    const joins = !!open && open.message.sender_id === m.sender_id && ts(m.created_at) - ts(open.message.created_at) <= CLUSTER_GAP_MS;
    const entry: MessageEntry = { kind: 'message', key: m.id, message: m, mine, first: !joins, last: true, showSender: !mine && o.isGroup && !joins, delivery: null, seenBy: 0, seenLabel: null };
    if (joins && open) open.last = false;
    if (mine) {
      if (m.local === 'failed') entry.delivery = 'failed';
      else if (m.local) entry.delivery = 'sending';
      else {
        const at = ts(m.created_at);
        entry.seenBy = others.filter((x) => x.last_read_at && ts(x.last_read_at) >= at).length;
        entry.delivery = entry.seenBy > 0 ? 'seen' : 'sent';
      }
    }
    out.push(entry);
    open = entry;
  }

  // "Seen" only under the newest thing in the thread, and only when it is mine.
  for (let i = out.length - 1; i >= 0; i--) {
    const e = out[i];
    if (e.kind !== 'message') continue;
    if (e.mine && e.delivery === 'seen') e.seenLabel = o.isGroup ? `Seen by ${e.seenBy}` : 'Seen';
    break;
  }
  return out;
}

export const toInverted = <T>(rows: T[]): T[] => [...rows].reverse();

export const messageKey = (m: Pick<ChatMessage, 'id'>) => m.id;

/** Merge server rows into the list I already have: same id = the newest copy wins; oldest first. */
export function mergeMessages(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const m of existing) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, { ...byId.get(m.id), ...m });
  return [...byId.values()].sort((a, b) => ts(a.created_at) - ts(b.created_at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function outboxToMessage(o: OutboxItem): TimelineMessage {
  return {
    id: o.id, conversation_id: o.conversation_id, sender_id: o.user_id, kind: o.kind, body: o.body, media_path: o.media_path,
    reply_to: o.reply_to, client_created_at: o.client_created_at, created_at: o.client_created_at, deleted_at: null,
    local: o.status, local_uri: o.local_uri, local_error: o.status === 'failed' ? o.error : null,
  };
}

/** Server rows first, then my unsent messages (they are the newest by definition). An outbox
 *  item whose id already arrived from the server is dropped, so a message never shows twice. */
export function timelineMessages(server: ChatMessage[], outbox: OutboxItem[], conversationId: string): TimelineMessage[] {
  const have = new Set(server.map((m) => m.id));
  const pending = outbox
    .filter((o) => o.conversation_id === conversationId && !have.has(o.id))
    .sort((a, b) => ts(a.client_created_at) - ts(b.client_created_at))
    .map(outboxToMessage);
  return [...server, ...pending];
}

/** Insert or replace by id (a retry must not create a second entry). */
export function upsertOutbox(list: OutboxItem[], item: OutboxItem): OutboxItem[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i < 0) return [...list, item];
  const next = list.slice();
  next[i] = item;
  return next;
}
export const removeOutbox = (list: OutboxItem[], id: string) => list.filter((x) => x.id !== id);
export const patchOutbox = (list: OutboxItem[], id: string, patch: Partial<OutboxItem>) => list.map((x) => (x.id === id ? { ...x, ...patch } : x));
/** Drop items the server already has (it echoed them back through realtime or a refetch). */
export const pruneOutbox = (list: OutboxItem[], serverIds: ReadonlySet<string>) => list.filter((x) => !serverIds.has(x.id));

const STATUSES: OutboxStatus[] = ['queued', 'sending', 'failed'];
export function isOutboxItem(x: unknown): x is OutboxItem {
  const o = x as Partial<OutboxItem> | null;
  return !!o && typeof o === 'object' && typeof o.id === 'string' && typeof o.conversation_id === 'string' && typeof o.user_id === 'string'
    && (o.kind === 'text' || o.kind === 'image') && typeof o.client_created_at === 'string' && STATUSES.includes(o.status as OutboxStatus);
}

/** Read the persisted outbox. Only this user's items; "sending" cannot survive a restart, so it becomes "queued". */
export function parseOutbox(raw: unknown, userId: string): OutboxItem[] {
  const blob = raw as { user_id?: unknown; items?: unknown } | null;
  if (!blob || blob.user_id !== userId || !Array.isArray(blob.items)) return [];
  return blob.items.filter(isOutboxItem).map((i) => ({ ...i, attempts: Number(i.attempts) || 0, error: i.error ?? null, status: i.status === 'failed' ? 'failed' : 'queued' }));
}

/** Wait before the next automatic retry: 3 s, 6 s, 12 s ... at most a minute. */
export const retryDelayMs = (attempts: number) => Math.min(60_000, 3_000 * 2 ** Math.max(0, Math.min(attempts, 5)));

export type SendFailure = 'network' | 'duplicate' | 'rejected';
/** network = keep it queued and try again; duplicate = an earlier try already landed (success); rejected = tell the pilgrim. */
export function classifySendError(e: { status?: number; code?: string; network?: boolean } | null | undefined): SendFailure {
  if (e?.code === '23505') return 'duplicate';
  if (e?.network || e?.status === 0 || (e?.status != null && e.status >= 500 && e.status !== 501) || e?.status === 408 || e?.status === 429) return 'network';
  return 'rejected';
}

/**
 * What to do with the uploaded photo of an outbox item that the person deletes. Only a QUEUED item is checked (its last
 * try failed for lack of an answer, so the message may or may not be there): when the check finds no message, the photo
 * is deleted. A FAILED item was refused, but an earlier try may already have been delivered (a refusal such as 42501
 * comes when the person was blocked or left the group, and then they cannot even see their own message), so its photo
 * is kept; so is the photo of an item being sent right now. Only a later server job (not built yet) can remove kept photos.
 */
export function discardMediaPlan(item: { status: OutboxStatus; media_path: string | null }): 'none' | 'check' | 'keep' {
  if (!item.media_path) return 'none';
  return item.status === 'queued' ? 'check' : 'keep';
}

export type MessageAction = 'reply' | 'copy' | 'unsend' | 'report' | 'retry' | 'delete';
/** What the long-press menu offers for a message. */
export function messageActions(m: TimelineMessage, mine: boolean): MessageAction[] {
  if (m.local === 'failed') return ['retry', 'delete'];
  if (m.local) return ['delete'];
  if (m.deleted_at || m.kind === 'system') return [];
  const out: MessageAction[] = ['reply'];
  if (m.kind === 'text' && m.body) out.push('copy');
  out.push(mine ? 'unsend' : 'report');
  return out;
}

/** One-line text for a reply preview or a notification. */
export function snippet(m: Pick<ChatMessage, 'kind' | 'body' | 'deleted_at'> | null | undefined, max = 90): string {
  if (!m) return 'Original message';
  if (m.deleted_at) return 'Message unsent';
  if (m.kind === 'image') return m.body?.trim() ? `Photo · ${truncate(m.body.trim(), max)}` : 'Photo';
  return truncate((m.body ?? '').replace(/\s+/g, ' ').trim(), max);
}
export const truncate = (s: string, max: number) => (s.length > max ? `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…` : s);

export const deliveryLabel = (d: Delivery | null, seenLabel: string | null) =>
  d === 'sending' ? 'Sending' : d === 'failed' ? 'Not sent. Tap to try again' : d === 'seen' ? seenLabel ?? 'Seen' : d === 'sent' ? 'Sent' : '';

/* ------------------------------------------------------------------ notifications */

export type NotificationAction =
  | { to: 'requests' }
  | { to: 'chat-with'; userId: string }
  | { to: 'conversation'; id: string }
  | { to: 'me' }
  | { to: 'none' };

const str = (v: unknown) => (typeof v === 'string' && v ? v : null);

/** Who a friend notification is about: data.friend_id, else the actor. */
export const notificationPeer = (n: NotificationItem): string | null => str(n.data?.friend_id) ?? n.actor?.id ?? null;

/** Where a tap on a notification goes. */
export function notificationAction(n: NotificationItem): NotificationAction {
  switch (n.kind) {
    case 'friend_request':
      return { to: 'requests' };
    case 'friend_accepted': {
      const userId = notificationPeer(n);
      return userId ? { to: 'chat-with', userId } : { to: 'requests' };
    }
    case 'group_added': {
      const id = str(n.data?.conversation_id);
      return id ? { to: 'conversation', id } : { to: 'none' };
    }
    case 'post_like':
    case 'post_comment':
    case 'achievement':
      return { to: 'me' };
    default:
      return { to: 'none' };
  }
}

/** Bold name + the rest of the sentence. The server writes the title as a sentence that starts with the
 *  actor's name ("Ana sent you a friend request"), so we use that; if it does not, we build the sentence
 *  from the kind. Without an actor (badges, system) the whole title is the bold part. */
export function notificationHeadline(n: NotificationItem): { name: string; text: string; detail: string | null } {
  const name = n.actor ? personName(n.actor, 'A pilgrim') : null;
  const detail = n.body?.trim() || null;
  if (!name) return { name: n.title, text: '', detail };
  const title = n.title.trim();
  if (title.length > name.length && title.toLowerCase().startsWith(name.toLowerCase()) && /\s/.test(title[name.length])) {
    return { name: title.slice(0, name.length), text: title.slice(name.length), detail };
  }
  switch (n.kind) {
    case 'friend_request': return { name, text: ' sent you a friend request', detail };
    case 'friend_accepted': return { name, text: ' accepted your friend request', detail };
    case 'group_added': return { name, text: ' added you to a group', detail };
    case 'post_like': return { name, text: ' liked your post', detail };
    case 'post_comment': return { name, text: ' commented on your post', detail };
    default: return { name, text: ` ${title}`.trimEnd(), detail };
  }
}

/** Split into the "New" and "Earlier" sections. `pinned` keeps rows in New while the screen is open. */
export function splitNotifications(items: NotificationItem[], pinned: ReadonlySet<string> = new Set()) {
  const fresh: NotificationItem[] = [];
  const earlier: NotificationItem[] = [];
  for (const n of items) (!n.read_at || pinned.has(n.id) ? fresh : earlier).push(n);
  return { fresh, earlier };
}

export type RequestState = 'pending' | 'friends' | 'declined' | 'gone';
/** What a friend_request notification row should show right now. */
export function requestState(n: NotificationItem, incomingIds: ReadonlySet<string>, friendIds: ReadonlySet<string>, local?: 'accepted' | 'declined'): RequestState {
  if (local === 'accepted') return 'friends';
  if (local === 'declined') return 'declined';
  const peer = notificationPeer(n);
  if (!peer) return 'gone';
  if (incomingIds.has(peer)) return 'pending';
  return friendIds.has(peer) ? 'friends' : 'gone';
}

/* ------------------------------------------------------------------ friends, search, groups */

export const MIN_SEARCH_CHARS = 2;
export const normalizeQuery = (q: string) => q.trim().replace(/\s+/g, ' ');
export const isSearchable = (q: string) => normalizeQuery(q).length >= MIN_SEARCH_CHARS;

type Timers = { set: (f: () => void, ms: number) => unknown; clear: (h: unknown) => void };
const realTimers: Timers = { set: (f, ms) => setTimeout(f, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };

/** Calls `fn` once, `ms` after the last call. Timers can be injected for tests. */
export function createDebouncer<A extends unknown[]>(fn: (...a: A) => void, ms: number, timers: Timers = realTimers) {
  let handle: unknown = null;
  const call = (...a: A) => {
    if (handle != null) timers.clear(handle);
    handle = timers.set(() => { handle = null; fn(...a); }, ms);
  };
  call.cancel = () => { if (handle != null) { timers.clear(handle); handle = null; } };
  return call;
}

/** Only the newest request may write its result: `const ok = gate.next(); await ...; if (ok()) setState(...)`. */
export function createLatestGate() {
  let n = 0;
  return { next: () => { const id = ++n; return () => id === n; }, invalidate: () => { n++; } };
}

export function friendAction(status: FriendStatus): { kind: 'add' | 'cancel' | 'accept' | 'message'; label: string } {
  switch (status) {
    case 'pending_out': return { kind: 'cancel', label: 'Requested' };
    case 'pending_in': return { kind: 'accept', label: 'Accept' };
    case 'friends': return { kind: 'message', label: 'Message' };
    default: return { kind: 'add', label: 'Add friend' };
  }
}

/** A result row after I did something (so the button changes at once, before the server answers). */
export const withStatus = (list: PilgrimResult[], id: string, friend_status: FriendStatus): PilgrimResult[] =>
  list.map((p) => (p.id === id ? { ...p, friend_status } : p));

export function sortByName<T extends { display_name?: string | null; username?: string | null }>(list: T[]): T[] {
  return [...list].sort((a, b) => norm(personName(a)).localeCompare(norm(personName(b))));
}

export function filterPeople<T extends { display_name?: string | null; username?: string | null }>(list: T[], query: string): T[] {
  const q = norm(query);
  if (!q) return list;
  return list.filter((p) => norm(p.display_name).includes(q) || norm(p.username).includes(q));
}

export const MIN_GROUP_OTHERS = 2;
export const MAX_GROUP_OTHERS = 49;
export const MAX_GROUP_TITLE = 60;
export const canCreateGroup = (others: number) => others >= MIN_GROUP_OTHERS && others <= MAX_GROUP_OTHERS;
export const validGroupTitle = (t: string) => t.trim().length >= 1 && t.trim().length <= MAX_GROUP_TITLE;

export function groupBlocker(others: number): string | null {
  if (others < MIN_GROUP_OTHERS) return `Pick at least ${MIN_GROUP_OTHERS} friends (${others} so far).`;
  if (others > MAX_GROUP_OTHERS) return `A group can have up to ${MAX_GROUP_OTHERS + 1} pilgrims.`;
  return null;
}

/** Photos in chat need cloud storage, which is part of Pilgrim Plus. */
export function storageGate(info: StorageInfo | null): 'ok' | 'plus_required' | 'full' | 'unknown' {
  if (!info) return 'unknown';
  if (!info.has_plus) return 'plus_required';
  return info.remaining_bytes <= 0 ? 'full' : 'ok';
}

export function parseStorage(raw: unknown): StorageInfo | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== 'object') return null;
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return { has_plus: r.has_plus === true, quota_bytes: num(r.quota_bytes), used_bytes: num(r.used_bytes), remaining_bytes: num(r.remaining_bytes) };
}

/** Reason texts used by the report sheet (value = content_reports.reason). */
export const REPORT_REASONS = [
  { key: 'spam', label: 'Spam or scam' },
  { key: 'harassment', label: 'Harassment or bullying' },
  { key: 'nudity', label: 'Nudity or sexual content' },
  { key: 'violence', label: 'Violence or threats' },
  { key: 'hate', label: 'Hate speech' },
  { key: 'privacy', label: 'Shares private information' },
  { key: 'other', label: 'Something else' },
] as const;

/* ------------------------------------------------------------------ safety: reports and blocks */

/** What the report sheet says, and what comes back (the same wherever a pilgrim reports something). */
export const REPORT_PROMPT = 'Tell us what is wrong. We review every report.';
export const REPORT_THANKS = 'Thank you. We will take a look.';

/** The sentence under "Block Ana?" in the chat, the friends list and everywhere else a pilgrim can block. */
export const blockMessage = (name: string) =>
  `${name} will not be able to message you or find you in search, and you will stop being friends. You can unblock them any time.`;
/** The sentence under "Unblock Ana?" in Blocked pilgrims. Unblocking does not bring a friendship back. */
export const unblockMessage = (name: string) =>
  `${name} will be able to find you in search and send you a friend request again. You will not be friends until you both agree.`;

/** What can be reported: content_reports.target_type. */
export const REPORT_TARGETS: readonly ReportTarget[] = ['message', 'profile', 'post', 'comment'];
/** Every reason the database accepts (content_reports.reason). The sheet offers REPORT_REASONS, a subset of these. */
export const REPORT_REASON_KEYS: readonly ReportReason[] = ['spam', 'nudity', 'harassment', 'violence', 'hate', 'misinformation', 'privacy', 'other'];
/** content_reports.details holds at most 1000 characters. */
export const REPORT_DETAILS_MAX = 1000;

export type ReportRequest = { type: ReportTarget; targetId: string; reason: ReportReason; details?: string | null };
/** The row sent to content_reports. Who reports and the status are the server's (default auth.uid(), trigger). */
export type ReportRow = { target_type: ReportTarget; target_id: string; reason: ReportReason; details: string | null; message_id?: string };

const ANY_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The row for one report. The words of the pilgrim are trimmed, cut at 1000 characters (whole characters: an emoji is
 *  never split) and null when empty. A message also names itself in message_id. Anything the database would refuse
 *  (an unknown kind or reason, an id that is not a uuid) throws here, with a sentence the screen can show. */
export function buildReportRow(o: ReportRequest): ReportRow {
  const targetId = String(o.targetId ?? '').trim();
  if (!REPORT_TARGETS.includes(o.type) || !REPORT_REASON_KEYS.includes(o.reason) || !ANY_UUID.test(targetId)) {
    throw new Error('That cannot be reported.');
  }
  const details = Array.from(String(o.details ?? '').trim()).slice(0, REPORT_DETAILS_MAX).join('').trimEnd();
  const row: ReportRow = { target_type: o.type, target_id: targetId, reason: o.reason, details: details || null };
  if (o.type === 'message') row.message_id = targetId;
  return row;
}

/** list_blocked_pilgrims() rows, cleaned: rows without a user id are dropped, text that is not text becomes null. */
export function parseBlocked(raw: unknown): BlockedPilgrim[] {
  const out: BlockedPilgrim[] = [];
  for (const r of Array.isArray(raw) ? raw : raw ? [raw] : []) {
    const x = r as Record<string, unknown> | null;
    if (!x || typeof x !== 'object' || typeof x.user_id !== 'string' || !x.user_id) continue;
    out.push({ user_id: x.user_id, username: str(x.username), display_name: str(x.display_name), avatar_url: str(x.avatar_url), blocked_at: typeof x.blocked_at === 'string' ? x.blocked_at : '' });
  }
  return out;
}

/** Shown on Blocked pilgrims when the list cannot be read, whatever the reason (also a server that does not have
 *  the function yet, which must never read as "update the app"). */
export const BLOCKED_LIST_ERROR = 'Could not load your blocked list, try again later.';

/** Offline says so (the pilgrim can fix that); everything else is the one friendly sentence above. */
export function blockedListError(e: unknown): string {
  const err = (e ?? {}) as ErrLike;
  const offline = !!err.network || /network request failed|failed to fetch|networkerror|load failed|you are offline/i.test(String(err.message ?? ''));
  return offline ? friendlyError(e) : BLOCKED_LIST_ERROR;
}

/** Friendly text for an error from the data layer. */
export type ErrLike = { message?: string; code?: string; status?: number; network?: boolean };

// The database raises its own errors as short sentences for people ("Only group admins can do this.").
// Technical Postgres text ("new row violates row-level security policy ...") never ends like a sentence.
const looksHuman = (m: string) => /^[A-Z][^\n]{6,220}[.!]$/.test(m) && !/violates|constraint|relation|column|syntax|permission denied|row-level|policy|sqlstate|pg_/i.test(m);

export function friendlyError(e: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const err = (e ?? {}) as ErrLike;
  const msg = String(err.message ?? '').trim();
  if (err.network || /network request failed|failed to fetch|networkerror|load failed|you are offline/i.test(msg)) return 'You seem to be offline. Check your signal and try again.';
  if (looksHuman(msg)) return msg;
  if (err.code === 'PGRST202' || err.status === 404) return 'This is not available yet. Please update the app and try again.';
  if (/blocked/i.test(msg)) return 'You cannot do that with this pilgrim.';
  if (/too many/i.test(msg) && /request/i.test(msg)) return 'You have too many pending requests. Wait for some answers first.';
  if (/not (accepted )?friends|must be friends|need to be friends/i.test(msg)) return 'You need to be friends first.';
  if (/rate limit|too many messages|slow down/i.test(msg)) return 'Slow down a little and try again in a moment.';
  if (/storage|quota/i.test(msg)) return 'Photos in chat are part of Pilgrim Plus.';
  if (err.code === '42501' || /permission denied|row-level security/i.test(msg)) return 'You are not allowed to do that.';
  return fallback;
}
