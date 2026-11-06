// Pure logic of the help bell: the message that is sent, link handling for chat bubbles, the position
// policy, the per-chat rate limit, who gets the message (and what is remembered about it) and how a
// send is reported back honestly. No React Native imports on purpose: plain node tests cover all of it
// (npm run test:social).
import { clockTime, conversationName, norm, personName, pilgrimsLabel, sortByName } from '../logic';
import type { Conversation, Friend, OutboxItem } from '../types';

/* ------------------------------------------------------------------ constants and copy */

export const HELP_BELL = '🔔 I need help';
export const HELP_OK = 'I am OK now';
export const HELP_SIGNATURE = 'Sent from CaminoPlus';
export const EMERGENCY_NUMBER = '112';
export const EMERGENCY_URL = `tel:${EMERGENCY_NUMBER}`;

/** At most one help message per chat in this time. (The database also allows 60 messages a minute per person.) */
export const HELP_MIN_GAP_MS = 60_000;
/** "I am OK now" is never held back like a help request, only protected against a double tap. */
export const OK_MIN_GAP_MS = 5_000;
/** Ring + "I am OK now" must fit the database limit of 60 messages a minute: 2 x 25 = 50. */
export const MAX_RECIPIENTS = 25;
export const FIX_TIMEOUT_MS = 10_000;
/** A last known position older than this is not offered: after two hours of walking it points to the wrong place. */
export const LAST_KNOWN_MAX_AGE_MS = 2 * 3_600_000;
/** A bell rung less than this long ago (and not answered with "I am OK now") is still "active". */
export const ALERT_ACTIVE_MS = 3 * 3_600_000;
/** The saved copy of a bell (it holds the position that was sent) is not kept longer than this. */
export const ALERT_KEEP_MS = 24 * 3_600_000;

export const EMERGENCY_NOTE = 'In an emergency call 112 first. CaminoPlus does not call anyone for you and cannot promise that a friend will see your message in time.';
export const URGENT_NOTE = 'Friends see CaminoPlus messages when they open the app. For urgent help also use SMS or WhatsApp.';
export const OFFLINE_NOTE = 'No internet: you can still call 112 or send an SMS.';

/* ------------------------------------------------------------------ position and message */

/** A position the phone measured. `at` = when (ms since epoch). */
export type HelpFix = { lat: number; lng: number; accuracyM: number | null; at: number };
/** What the Maps screen may hand in. Without `at` the position counts as taken just now. */
export type HelpPosition = { lat: number; lng: number; accuracyM?: number | null; at?: number };

/** Real coordinates only: finite, in range, and not 0,0 (what a phone reports when it has nothing). */
export const validCoords = (lat: unknown, lng: unknown): boolean =>
  typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)
  && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

/** Five decimals (about a metre), and never "-0.00000". */
export function coord(n: number): string {
  const s = n.toFixed(5);
  return s === '-0.00000' ? '0.00000' : s;
}

/** "about 12 m". Null when the phone did not say. */
export function accuracyText(m: number | null | undefined): string | null {
  if (typeof m !== 'number' || !Number.isFinite(m) || m <= 0) return null;
  return `about ${Math.max(1, Math.round(m))} m`;
}

export const mapsUrl = (lat: number, lng: number) => `https://maps.google.com/?q=${coord(lat)},${coord(lng)}`;
export const osmUrl = (lat: number, lng: number) => `https://www.openstreetmap.org/?mlat=${coord(lat)}&mlon=${coord(lng)}#map=17/${coord(lat)}/${coord(lng)}`;

/** One line of plain text, 120 characters at most (it goes into a message). Null when empty. */
export function cleanPlace(text: string | null | undefined, max = 120): string | null {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** The message, plain text so it reads anywhere (chat, SMS, WhatsApp):
 *    🔔 I need help
 *    Place: about 2.1 km after Zubiri, stage 3       (only when known)
 *    Position: 42.93012, -1.51044 (about 12 m, 14:32)
 *    <Google Maps link>
 *    <OpenStreetMap link>
 *    Sent from CaminoPlus */
export function buildHelpMessage(o: { fix: HelpFix; place?: string | null }): string {
  const details = [accuracyText(o.fix.accuracyM), clockTime(o.fix.at) || null].filter(Boolean).join(', ');
  const place = cleanPlace(o.place);
  return [
    HELP_BELL,
    ...(place ? [`Place: ${place}`] : []),
    `Position: ${coord(o.fix.lat)}, ${coord(o.fix.lng)}${details ? ` (${details})` : ''}`,
    mapsUrl(o.fix.lat, o.fix.lng),
    osmUrl(o.fix.lat, o.fix.lng),
    HELP_SIGNATURE,
  ].join('\n');
}

/** The chat styles a message as a help request when its first line is the bell line. */
export function isHelpMessage(body: string | null | undefined): boolean {
  if (typeof body !== 'string') return false;
  return (body.trimStart().split(/\r?\n/, 1)[0] ?? '').trimEnd() === HELP_BELL;
}

export type ParsedHelp = {
  place: string | null;
  position: string | null; // the text after "Position:"
  lat: number | null;
  lng: number | null;
  mapUrl: string | null;   // the link behind "Open map": a map link of the message, else built from the coordinates
  rest: string;            // anything else the message says (never the links or the signature)
};

/** Reads a help message back for the chat bubble. Tolerant: whatever it cannot place goes to `rest`. */
export function parseHelpMessage(body: string): ParsedHelp {
  let place: string | null = null;
  let position: string | null = null;
  const rest: string[] = [];
  const lines = body.trim().split(/\r?\n/).slice(1).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const p = /^place:\s*(.+)$/i.exec(line);
    const q = /^position:\s*(.+)$/i.exec(line);
    if (p && !place) place = p[1];
    else if (q && !position) position = q[1];
    else if (/^sent from caminoplus$/i.test(line)) continue;
    else if (linkify(line).every((s) => (s.url ? isMapUrl(s.url) : !s.text.trim()))) continue; // a line of nothing but map links: the "Open map" button stands for them
    else rest.push(line);
  }
  const m = position ? /(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/.exec(position) : null;
  const lat = m ? Number(m[1]) : null;
  const lng = m ? Number(m[2]) : null;
  const good = lat != null && lng != null && validCoords(lat, lng);
  return {
    place, position,
    lat: good ? lat : null, lng: good ? lng : null,
    mapUrl: urlsIn(body).find(isMapUrl) ?? (good ? mapsUrl(lat, lng) : null),
    rest: rest.join('\n'),
  };
}

/* ------------------------------------------------------------------ links in messages */

export type TextPart = { text: string; url?: string };

const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/gi;
const MAX_URL = 2000;
const END_PUNCT = /[.,;:!?'"”’»…。、，！？]/;
const CLOSERS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
const occurrences = (s: string, ch: string) => s.split(ch).length - 1;

/** Sentence punctuation after a link is not part of it, and a closing bracket only is when it has an opener. */
function trimUrl(raw: string): string {
  let s = raw;
  while (s.length > 0) {
    const last = s[s.length - 1];
    if (END_PUNCT.test(last)) { s = s.slice(0, -1); continue; }
    const opener = CLOSERS[last];
    if (opener && occurrences(s, last) > occurrences(s, opener)) { s = s.slice(0, -1); continue; }
    break;
  }
  return s;
}

/** The only links the app ever opens: http or https, one piece, no control characters. */
export const isSafeUrl = (u: unknown): u is string =>
  typeof u === 'string' && u.length <= MAX_URL && /^https?:\/\/[a-z0-9[]\S*$/i.test(u) && !/[\u0000-\u001f\u007f]/.test(u);

/** Splits text into plain parts and http(s) links. Joining the `text` of the parts gives the input back.
 *  Other schemes (javascript:, data:, tel:, ftp:) and addresses without a scheme stay plain text. */
export function linkify(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let at = 0;
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0;
    if (start < at) continue;
    const raw = trimUrl(m[0]);
    const url = raw.replace(/^https?/i, (s) => s.toLowerCase());
    if (!isSafeUrl(url)) continue;
    if (start > at) parts.push({ text: text.slice(at, start) });
    parts.push({ text: raw, url });
    at = start + raw.length;
  }
  if (at < text.length) parts.push({ text: text.slice(at) });
  return parts;
}

export const urlsIn = (text: string): string[] => linkify(text).flatMap((p) => (p.url ? [p.url] : []));

const MAP_HOST = /^https?:\/\/(?:maps\.google\.com|(?:www\.)?google\.com\/maps|(?:www\.)?openstreetmap\.org|maps\.apple\.com)(?:[/?#]|$)/i;
/** Map links of the big map services, host checked exactly (maps.google.com.evil.example does not pass). */
export const isMapUrl = (u: string): boolean => isSafeUrl(u) && MAP_HOST.test(u);

/* ------------------------------------------------------------------ rate limit */

/** How long until a help message may go to this chat again (0 = now). `lastAt` = when the last one was queued. */
export function helpWaitMs(lastAt: number | null | undefined, now: number, gapMs = HELP_MIN_GAP_MS): number {
  if (lastAt == null || !Number.isFinite(lastAt)) return 0;
  const elapsed = now - lastAt;
  if (elapsed < 0) return 0; // the clock went backwards: never block for hours
  return elapsed >= gapMs ? 0 : gapMs - elapsed;
}

export const waitSeconds = (ms: number) => Math.max(1, Math.ceil(ms / 1000));

/** Who may get a help message now and who has to wait. A chat that is not known yet was never messaged. */
export function splitByRateLimit<T extends { chatId: string | null }>(items: readonly T[], lastAt: Readonly<Record<string, number>>, now: number, gapMs = HELP_MIN_GAP_MS) {
  const allowed: T[] = [];
  const waiting: { item: T; waitMs: number }[] = [];
  for (const item of items) {
    const wait = item.chatId ? helpWaitMs(lastAt[item.chatId], now, gapMs) : 0;
    if (wait > 0) waiting.push({ item, waitMs: wait });
    else allowed.push(item);
  }
  return { allowed, waiting };
}

/* ------------------------------------------------------------------ the position policy */

export type FixSource = 'fresh' | 'last-known' | 'map';
export type FixFailure = 'denied' | 'blocked' | 'services-off' | 'timeout' | 'unavailable';

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** The position handed in by the Maps screen, as a fix. Null when it is not a real position. */
export function fixFromSupplied(p: HelpPosition | null | undefined, now: number): HelpFix | null {
  if (!p || !validCoords(p.lat, p.lng)) return null;
  return { lat: p.lat, lng: p.lng, accuracyM: finite(p.accuracyM) && p.accuracyM > 0 ? p.accuracyM : null, at: finite(p.at) ? p.at : now };
}

/** Which position to show and send. A fresh one wins. Otherwise the newest of the last known one and the
 *  one from the map, but only when it is not older than `maxAgeMs`. Null = no honest position. */
export function chooseFix(o: { fresh?: HelpFix | null; lastKnown?: HelpFix | null; supplied?: HelpFix | null; now: number; maxAgeMs?: number }): { fix: HelpFix; source: FixSource } | null {
  const usable = (f: HelpFix | null | undefined): f is HelpFix => !!f && validCoords(f.lat, f.lng) && finite(f.at) && f.at <= o.now + 60_000;
  if (usable(o.fresh)) return { fix: o.fresh, source: 'fresh' };
  const max = o.maxAgeMs ?? LAST_KNOWN_MAX_AGE_MS;
  const options: { fix: HelpFix; source: FixSource }[] = [];
  if (usable(o.lastKnown) && o.now - o.lastKnown.at <= max) options.push({ fix: o.lastKnown, source: 'last-known' });
  if (usable(o.supplied) && o.now - o.supplied.at <= max) options.push({ fix: o.supplied, source: 'map' });
  options.sort((a, b) => b.fix.at - a.fix.at);
  return options[0] ?? null;
}

export const fixAgeMs = (fix: Pick<HelpFix, 'at'>, now: number) => Math.max(0, now - fix.at);

/** "just now", "40 s ago", "4 min ago", "1 h 20 min ago". */
export function ageText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s} s ago`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  return min % 60 === 0 ? `${h} h ago` : `${h} h ${min % 60} min ago`;
}

/** Past this age the sheet calls a position "old" (a fresh one is a few seconds old when it arrives). */
export const FIX_OLD_MS = 2 * 60_000;

export function failureText(why: FixFailure): string {
  switch (why) {
    case 'denied': return 'CaminoPlus needs your permission to use your location. Allow it, then try again.';
    case 'blocked': return 'Location is turned off for CaminoPlus. Turn it on in your phone settings, then come back.';
    case 'services-off': return 'Location is switched off on this phone. Switch it on, then try again.';
    case 'timeout': return 'Your phone could not find your position in 10 seconds. Moving to open sky can help.';
    default: return 'Your phone could not tell us where you are.';
  }
}

/* ------------------------------------------------------------------ who gets it */

export type Recipient = {
  kind: 'friend' | 'group';
  id: string;             // friend: the person's id. group: the conversation id
  name: string;
  chatId: string | null;  // the conversation to write in: known for groups; for a friend once a direct chat exists
};

export const recipientKey = (r: Pick<Recipient, 'kind' | 'id'>) => `${r.kind}:${r.id}`;
export const isChosen = (list: readonly Recipient[], r: Pick<Recipient, 'kind' | 'id'>) => list.some((x) => recipientKey(x) === recipientKey(r));

const directChats = (convs: readonly Conversation[] | null) => {
  const map = new Map<string, string>();
  for (const c of convs ?? []) if (c.kind === 'direct' && c.peer_id) map.set(c.peer_id, c.id);
  return map;
};

const friendWith = (f: Friend, direct: ReadonlyMap<string, string>): Recipient => ({ kind: 'friend', id: f.id, name: personName(f), chatId: direct.get(f.id) ?? null });
export const friendRecipient = (f: Friend, convs: readonly Conversation[] | null): Recipient => friendWith(f, directChats(convs));
export const groupRecipient = (c: Conversation): Recipient => ({ kind: 'group', id: c.id, name: conversationName(c), chatId: c.id });

/** What is saved per account (localStore key u.<id>.help.recipients): the last choice, with names and chat ids,
 *  so that it can be used again at once, also without a connection. */
export function packRecipients(list: readonly Recipient[]): { v: 1; items: Recipient[] } {
  return { v: 1, items: list.slice(0, MAX_RECIPIENTS).map(({ kind, id, name, chatId }) => ({ kind, id, name, chatId })) };
}

/** Reads the saved choice. Anything odd is dropped; duplicates and more than MAX_RECIPIENTS too. */
export function parseSavedRecipients(raw: unknown): Recipient[] {
  const blob = raw as { v?: unknown; items?: unknown } | null;
  if (!blob || blob.v !== 1 || !Array.isArray(blob.items)) return [];
  const out: Recipient[] = [];
  const seen = new Set<string>();
  for (const x of blob.items) {
    const r = x as Partial<Recipient> | null;
    if (!r || typeof r !== 'object' || (r.kind !== 'friend' && r.kind !== 'group')) continue;
    if (typeof r.id !== 'string' || !r.id || r.id.length > 80) continue;
    const name = typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 80) : r.kind === 'group' ? 'Group' : 'Pilgrim';
    const chatId = r.kind === 'group' ? r.id : typeof r.chatId === 'string' && r.chatId ? r.chatId : null;
    const rec: Recipient = { kind: r.kind, id: r.id, name, chatId };
    if (seen.has(recipientKey(rec))) continue;
    seen.add(recipientKey(rec));
    out.push(rec);
    if (out.length >= MAX_RECIPIENTS) break;
  }
  return out;
}

/** Brings a saved choice up to date with what the server says now: people who are no longer friends and groups
 *  I left disappear, names and chat ids are refreshed. A list that could not be loaded (null) is not used. */
export function reconcileRecipients(saved: readonly Recipient[], friends: readonly Friend[] | null, convs: readonly Conversation[] | null): Recipient[] {
  const friendById = new Map((friends ?? []).map((f) => [f.id, f]));
  const direct = directChats(convs);
  const groupById = new Map((convs ?? []).filter((c) => c.kind === 'group').map((c) => [c.id, c]));
  const out: Recipient[] = [];
  for (const r of saved) {
    if (r.kind === 'friend') {
      if (!friends) { out.push(r); continue; }
      const f = friendById.get(r.id);
      if (f) out.push({ ...r, name: personName(f), chatId: direct.get(r.id) ?? r.chatId });
    } else {
      if (!convs) { out.push(r); continue; }
      const g = groupById.get(r.id);
      if (g) out.push({ ...r, name: conversationName(g), chatId: g.id });
    }
  }
  return out;
}

export function toggleRecipient(list: readonly Recipient[], r: Recipient, max = MAX_RECIPIENTS): { list: Recipient[]; limited: boolean } {
  if (isChosen(list, r)) return { list: list.filter((x) => recipientKey(x) !== recipientKey(r)), limited: false };
  if (list.length >= max) return { list: [...list], limited: true };
  return { list: [...list, r], limited: false };
}

export const allFriendsChosen = (list: readonly Recipient[], friends: readonly Recipient[]) => friends.length > 0 && friends.every((f) => isChosen(list, f));

/** "Select all friends" (on) adds every friend up to `max`; off removes every friend and keeps the groups. */
export function setFriendsChosen(list: readonly Recipient[], friends: readonly Recipient[], on: boolean, max = MAX_RECIPIENTS): { list: Recipient[]; limited: boolean } {
  if (!on) return { list: list.filter((r) => r.kind !== 'friend'), limited: false };
  const next = [...list];
  let limited = false;
  for (const f of friends) {
    if (isChosen(next, f)) continue;
    if (next.length >= max) { limited = true; break; }
    next.push(f);
  }
  return { list: next, limited };
}

export type PickerRow = { recipient: Recipient; username: string | null; avatarUrl: string | null; detail: string | null; chosen: boolean };

/** The rows of the picker, filtered by the search text. When the friends (or the chats) could not be loaded the rows
 *  come from the remembered choice, so that "the same people as last time" still works without a connection. */
export function buildPickerRows(o: { friends: readonly Friend[] | null; convs: readonly Conversation[] | null; chosen: readonly Recipient[]; query: string }) {
  const q = norm(o.query);
  const match = (name: string, username?: string | null) => !q || norm(name).includes(q) || norm(username).includes(q);
  const direct = directChats(o.convs);
  const friends: PickerRow[] = o.friends
    ? sortByName([...o.friends]).filter((f) => match(personName(f), f.username)).map((f) => {
      const recipient = friendWith(f, direct);
      return { recipient, username: f.username, avatarUrl: f.avatar_url, detail: null, chosen: isChosen(o.chosen, recipient) };
    })
    : o.chosen.filter((r) => r.kind === 'friend' && match(r.name)).map((recipient) => ({ recipient, username: null, avatarUrl: null, detail: null, chosen: true }));
  const groups: PickerRow[] = o.convs
    ? o.convs.filter((c) => c.kind === 'group' && match(conversationName(c))).sort((a, b) => norm(conversationName(a)).localeCompare(norm(conversationName(b)))).map((c) => {
      const recipient = groupRecipient(c);
      return { recipient, username: null, avatarUrl: c.avatar_url, detail: pilgrimsLabel(c.member_count), chosen: isChosen(o.chosen, recipient) };
    })
    : o.chosen.filter((r) => r.kind === 'group' && match(r.name)).map((recipient) => ({ recipient, username: null, avatarUrl: null, detail: null, chosen: true }));
  return { friends, groups, remembered: !o.friends || !o.convs };
}

/** Why the "Ring the bell" button cannot be used yet (null = it can). People first: that is what the pilgrim can do while the position loads. */
export function ringBlocker(o: { chosen: number; hasFix: boolean; locating: boolean; waitMs: number }): string | null {
  if (o.chosen === 0) return 'Choose who should get it.';
  if (!o.hasFix) return o.locating ? 'Finding your position…' : 'No position yet. Try again above.';
  if (o.waitMs > 0) return `You can send again in ${waitSeconds(o.waitMs)} s.`;
  return null;
}

/** "Ana Torres", "Ana Torres and Lucas Ruiz", "Ana Torres, Lucas Ruiz and 2 more". */
export function namesText(list: readonly Pick<Recipient, 'name'>[], show = 2): string {
  const names = list.map((r) => r.name);
  if (names.length <= show) return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${names.slice(0, show).join(', ')} and ${names.length - show} more`;
}

/* ------------------------------------------------------------------ the bell that was rung */

export type SendKind = 'help' | 'ok';

/** One message queued for one chat. `messageId` is null when the chat could not even be started (`error` says why). */
export type HelpSend = {
  id: string;
  kind: SendKind;
  recipientKey: string;
  chatId: string | null;
  messageId: string | null;
  body: string;           // the text, so that a retry sends exactly what was confirmed
  at: number;             // when it was queued
  sentAt: number | null;  // when the app saw it arrive on the server
  error: string | null;
};

/** The bell as the pilgrim rang it: who was told, every message queued for them, and the "I am OK now". */
export type HelpAlert = { id: string; startedAt: number; recipients: Recipient[]; sends: HelpSend[]; okAt: number | null };

export type DeliveryState = 'sending' | 'waiting' | 'sent' | 'failed' | 'unknown';
export type Delivery = { state: DeliveryState; label: string; detail: string | null; retry: boolean };

type OutboxLike = Pick<OutboxItem, 'id' | 'status' | 'attempts' | 'error'>;

/** What to say about one send, from what the outbox knows. "Sent" only when the app saw it arrive; "Sending" only while it is really on its way. */
export function deliveryOf(send: HelpSend, outbox: readonly OutboxLike[]): Delivery {
  if (!send.messageId) return { state: 'failed', label: 'Not sent', detail: send.error ?? 'This chat could not be started.', retry: true };
  const item = outbox.find((i) => i.id === send.messageId);
  if (!item) {
    return send.sentAt != null
      ? { state: 'sent', label: 'Sent', detail: null, retry: false }
      : { state: 'unknown', label: 'Not confirmed', detail: 'Open the chat to check.', retry: false };
  }
  if (item.status === 'failed') return { state: 'failed', label: 'Not sent', detail: item.error ?? 'This message could not be sent.', retry: true };
  // The outbox stops at the first network failure, so everything queued behind a message that already failed to go out waits with it.
  const stalled = outbox.some((i) => i.status === 'queued' && i.attempts > 0);
  if (item.status === 'queued' && (item.attempts > 0 || stalled)) return { state: 'waiting', label: 'Waiting for signal', detail: 'It goes out when your phone is online again.', retry: false };
  return { state: 'sending', label: 'Sending…', detail: null, retry: false };
}

/** The newest send of each recipient (the "I am OK now" once it was queued, else the newest help message). */
export function latestSends(alert: HelpAlert): Map<string, HelpSend> {
  const out = new Map<string, HelpSend>();
  for (const s of alert.sends) {
    const prev = out.get(s.recipientKey);
    if (!prev || s.at >= prev.at) out.set(s.recipientKey, s);
  }
  return out;
}

export type DeliveryRow = { recipient: Recipient; send: HelpSend | null; delivery: Delivery | null };

/** One row per person told. After "I am OK now" a help message that did not go out is not tried again: it would arrive after the all-clear. */
export function deliveryRows(alert: HelpAlert, outbox: readonly OutboxLike[]): DeliveryRow[] {
  const latest = latestSends(alert);
  return alert.recipients.map((recipient) => {
    const send = latest.get(recipientKey(recipient)) ?? null;
    let delivery = send ? deliveryOf(send, outbox) : null;
    if (send && delivery && alert.okAt != null && send.kind === 'help' && delivery.state === 'failed') {
      delivery = { ...delivery, detail: 'You said you are OK, so it was not sent.', retry: false };
    }
    return { recipient, send, delivery };
  });
}

/** One honest sentence about all rows, for the live region and the top of the list. */
export function summarizeDeliveries(rows: readonly { delivery: Delivery | null }[]): string {
  const ds = rows.flatMap((r) => (r.delivery ? [r.delivery] : []));
  const n = ds.length;
  if (n === 0) return '';
  const count = (s: DeliveryState) => ds.filter((d) => d.state === s).length;
  const sent = count('sent');
  if (sent === n) return n === 1 ? 'Sent to your chat.' : `Sent to all ${n} chats.`;
  const parts: string[] = [];
  if (sent > 0) parts.push(`Sent to ${sent} of ${n} chats.`);
  if (count('sending')) parts.push(`${count('sending')} sending.`);
  if (count('waiting')) parts.push(`${count('waiting')} waiting for signal.`);
  if (count('failed')) parts.push(`${count('failed')} not sent.`);
  if (count('unknown')) parts.push(`${count('unknown')} not confirmed.`);
  return parts.join(' ');
}

export const alertLastAt = (a: HelpAlert) => a.sends.reduce((m, s) => Math.max(m, s.at), a.startedAt);

/** Rung less than ALERT_ACTIVE_MS ago and not answered with "I am OK now". */
export const isAlertActive = (a: HelpAlert | null, now: number): boolean => !!a && a.okAt == null && now - alertLastAt(a) < ALERT_ACTIVE_MS;
export const activeAlert = (a: HelpAlert | null, now: number): HelpAlert | null => (a && isAlertActive(a, now) ? a : null);

/** Old enough to be forgotten: the phone does not keep somebody's old position around. */
export const isAlertStale = (a: HelpAlert, now: number): boolean => now - alertLastAt(a) > ALERT_KEEP_MS;

/** When each chat last got a help message (the input of the rate limit). */
export function lastHelpAt(a: HelpAlert | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of a?.sends ?? []) if (s.kind === 'help' && s.chatId && s.at > (out[s.chatId] ?? 0)) out[s.chatId] = s.at;
  return out;
}

export function lastOkAt(a: HelpAlert | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of a?.sends ?? []) if (s.kind === 'ok' && s.chatId && s.at > (out[s.chatId] ?? 0)) out[s.chatId] = s.at;
  return out;
}

/** The bell was rung (or rung again): the first ring starts an alert, later rings join the active one. */
export function addRing(current: HelpAlert | null, o: { now: number; id: string; recipients: readonly Recipient[]; sends: readonly HelpSend[] }): HelpAlert {
  if (current && isAlertActive(current, o.now)) {
    const known = new Map(current.recipients.map((r) => [recipientKey(r), r]));
    for (const r of o.recipients) known.set(recipientKey(r), r);
    return { ...current, recipients: [...known.values()], sends: [...current.sends, ...o.sends] };
  }
  return { id: o.id, startedAt: o.now, recipients: [...o.recipients], sends: [...o.sends], okAt: null };
}

/** "I am OK now" was queued for these chats. The alert is over; the next ring starts a new one. */
export const addOk = (current: HelpAlert, o: { now: number; sends: readonly HelpSend[] }): HelpAlert => ({ ...current, sends: [...current.sends, ...o.sends], okAt: o.now });

/** A retry replaces the send that did not work. */
export const replaceSend = (current: HelpAlert, oldId: string, next: HelpSend): HelpAlert => ({ ...current, sends: current.sends.map((s) => (s.id === oldId ? next : s)) });

/** Messages that reached the server get their arrival time. The same object comes back when none of them belongs to this alert. */
export function markArrived(current: HelpAlert, messageIds: readonly string[], at: number): HelpAlert {
  const mine = (s: HelpSend) => !!s.messageId && s.sentAt == null && messageIds.includes(s.messageId);
  return current.sends.some(mine) ? { ...current, sends: current.sends.map((s) => (mine(s) ? { ...s, sentAt: at } : s)) } : current;
}

const isSend = (x: unknown): x is HelpSend => {
  const s = x as Partial<HelpSend> | null;
  return !!s && typeof s === 'object' && typeof s.id === 'string' && (s.kind === 'help' || s.kind === 'ok') && typeof s.recipientKey === 'string' && typeof s.at === 'number'
    && (s.chatId == null || typeof s.chatId === 'string') && (s.messageId == null || typeof s.messageId === 'string') && typeof s.body === 'string';
};

/** The saved alert of this account (u.<id>.help.last), or null. */
export function parseAlert(raw: unknown, uid: string): HelpAlert | null {
  const blob = raw as { v?: unknown; user_id?: unknown; alert?: unknown } | null;
  if (!blob || blob.v !== 1 || blob.user_id !== uid) return null;
  const a = blob.alert as Partial<HelpAlert> | null;
  if (!a || typeof a.id !== 'string' || typeof a.startedAt !== 'number' || !Array.isArray(a.recipients) || !Array.isArray(a.sends)) return null;
  return {
    id: a.id, startedAt: a.startedAt, okAt: typeof a.okAt === 'number' ? a.okAt : null,
    recipients: parseSavedRecipients({ v: 1, items: a.recipients }),
    sends: a.sends.filter(isSend).map((s) => ({ id: s.id, kind: s.kind, recipientKey: s.recipientKey, chatId: s.chatId ?? null, messageId: s.messageId ?? null, body: s.body, at: s.at, sentAt: typeof s.sentAt === 'number' ? s.sentAt : null, error: typeof s.error === 'string' ? s.error : null })),
  };
}
