// Share links: ONE plan or ONE note, opened by anybody who has the link, until the pilgrim stops sharing it.
// The database side is supabase/migrations/20261114100100_share_links.sql (create_share_link, list_share_links,
// revoke_share_link, get_shared); the page that opens a link is web/s/index.html. Friends never get the plan or the notes
// any other way: the tables are owner only (20261114100000_plan_private.sql).
//
// This file has no React Native import: the Supabase client and the "are we offline" check come in as arguments
// (shareLinksClient.ts hands in the real ones), so plain node tests run the real code (npm run test:lib).
// Nothing here throws: every call answers { ok: true, ... } or { ok: false, message } in words a person can read.
import { plainText } from '../features/diary/richtext';

/**
 * Where a share link opens. The ONE place a link is built (shareUrl below); a test fails if any other file writes it.
 * It is the website's host today, because the camino.plus domain is not registered yet. When the owner registers the final
 * domain and points the website at it, change this line (old links keep working as long as the old host serves the site).
 * The token goes after '#': the fragment never reaches a server log or a Referer.
 */
export const SHARE_LINK_BASE = 'https://caminoplus-web.vercel.app/s';

export const shareUrl = (token: string) => `${SHARE_LINK_BASE}#${token}`;

/** A token as create_share_link makes it: 32 random bytes in base64url, 43 characters. */
export const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export type ShareKind = 'plan' | 'note';
export type ShareLink = {
  id: string;
  kind: ShareKind;
  label: string | null;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
};
/** The columns of list_share_links(); supabase/dev/check_client_contract.py compares them with the function. */
export const RPC_COLUMNS = {
  list_share_links: ['id', 'kind', 'label', 'created_at', 'expires_at', 'revoked_at', 'last_viewed_at', 'view_count'],
} as const;

/** What a note link carries: a copy of the words, made now. The place is left out (the app promises a note's place never leaves the phone). */
export type NoteCopy = { title: string | null; body: string; place: null; written_at: string | null };
export const NOTE_BODY_MAX = 20_000;
export const NOTE_TITLE_MAX = 200;
export const LINKS_MAX = 50;

export function noteCopy(entry: { title?: unknown; body?: unknown; createdAt?: unknown }): NoteCopy | null {
  const title = typeof entry.title === 'string' ? entry.title.trim().slice(0, NOTE_TITLE_MAX) : '';
  const body = plainText(entry.body).trim().slice(0, NOTE_BODY_MAX);
  if (!title && !body) return null;
  const at = typeof entry.createdAt === 'string' && !Number.isNaN(Date.parse(entry.createdAt)) ? new Date(entry.createdAt).toISOString() : null;
  return { title: title || null, body, place: null, written_at: at };
}

// ---------------------------------------------------------------- the words of the confirmation sheet
export const SHEET = {
  plan: {
    title: 'Share your plan by link',
    shows: ['The route and the start date', 'Each day: the date, where it starts and ends, the distance, and if it is walked'],
    staysOption: 'Also show where I sleep each night',
    hides: 'Not shown: the notes of each day, bookings, health, GPS tracks and stamps.',
    live: 'The link always shows your plan as it is now. If you change the plan, the link changes too.',
  },
  note: {
    title: 'Share this note by link',
    shows: ['A copy of the title, the words and the date of this note'],
    hides: 'Not shown: photos, videos, the place, and your other notes. The note itself stays on this phone.',
    live: 'The link shows the note as it is now. If you change the note later, the link does not change.',
  },
  anyone: 'Anyone who has the link can see it, until you stop sharing it in Settings, Privacy and safety, Shared links.',
  make: 'Make link',
  cancel: 'Cancel',
  needsNetwork: 'Making a link needs a connection.',
} as const;

export const shareText = (kind: ShareKind, url: string) =>
  kind === 'plan' ? `My Camino plan on CaminoPlus: ${url}` : `A note from my Camino on CaminoPlus: ${url}`;

export const linkTitle = (l: Pick<ShareLink, 'kind' | 'label'>) => l.label?.trim() || (l.kind === 'plan' ? 'My plan' : 'A note');

export type LinkState = 'active' | 'stopped' | 'expired';
export function linkState(l: Pick<ShareLink, 'revoked_at' | 'expires_at'>, now: Date = new Date()): LinkState {
  if (l.revoked_at) return 'stopped';
  if (l.expires_at && Date.parse(l.expires_at) <= now.getTime()) return 'expired';
  return 'active';
}

export function viewsLine(l: Pick<ShareLink, 'view_count'>): string {
  const n = Math.max(0, Math.floor(Number(l.view_count) || 0));
  return n === 0 ? 'Not opened yet' : n === 1 ? 'Opened once' : `Opened ${n} times`;
}

// ---------------------------------------------------------------- errors, in words
type RpcError = { code?: string; message: string } | null;
type Answer = { data: unknown; error: RpcError };
export type Rpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<Answer>;
export type Net = { assertOnline: () => Promise<void>; isOffline: (e: unknown) => boolean };

export const MESSAGES = {
  offline: 'You are offline. Sharing by link needs a connection.',
  notReady: 'Sharing by link is not ready yet. Please try again later.',
  tooMany: `You have ${LINKS_MAX} links. Stop sharing one first, in Settings, Privacy and safety, Shared links.`,
  notYours: 'This plan could not be shared. Open your plan again and try once more.',
  tooLong: 'This note is too long to share by link.',
  empty: 'This note is empty. Write something first.',
  failed: 'Something went wrong. Please try again.',
} as const;

export function messageFor(error: RpcError | unknown, net?: Pick<Net, 'isOffline'>): string {
  if (net?.isOffline(error)) return MESSAGES.offline;
  const e = (error ?? {}) as { code?: unknown; message?: unknown };
  const code = typeof e.code === 'string' ? e.code : '';
  const msg = typeof e.message === 'string' ? e.message : '';
  if (code === 'PGRST202' || code === '42883' || /could not find the function/i.test(msg)) return MESSAGES.notReady;
  if (code === '54000') return MESSAGES.tooMany;
  if (code === '42501') return MESSAGES.notYours;
  if (code === '22001') return MESSAGES.tooLong;
  if (/empty/i.test(msg)) return MESSAGES.empty;
  return MESSAGES.failed;
}

export type Made = { ok: true; id: string; token: string; url: string; expires_at: string | null } | { ok: false; message: string };
export type Listed = { ok: true; links: ShareLink[] } | { ok: false; message: string };
export type Done = { ok: true } | { ok: false; message: string };

function parseMade(data: unknown): { id: string; token: string; expires_at: string | null } | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (typeof d.id !== 'string' || typeof d.token !== 'string' || !TOKEN.test(d.token)) return null;
  return { id: d.id, token: d.token, expires_at: typeof d.expires_at === 'string' ? d.expires_at : null };
}

export function parseLinks(data: unknown): ShareLink[] {
  if (!Array.isArray(data)) return [];
  const out: ShareLink[] = [];
  for (const r of data) {
    if (!r || typeof r !== 'object') continue;
    const x = r as Record<string, unknown>;
    if (typeof x.id !== 'string' || (x.kind !== 'plan' && x.kind !== 'note') || typeof x.created_at !== 'string') continue;
    const s = (v: unknown) => (typeof v === 'string' ? v : null);
    out.push({
      id: x.id, kind: x.kind, label: s(x.label), created_at: x.created_at, expires_at: s(x.expires_at), revoked_at: s(x.revoked_at),
      last_viewed_at: s(x.last_viewed_at), view_count: typeof x.view_count === 'number' ? x.view_count : 0,
    });
  }
  return out;
}

/** The four calls. `client.rpc` is supabase-js's (or a stand-in in the tests). */
export function createShareLinks(client: { rpc: Rpc }, net: Net) {
  async function call<T>(run: () => PromiseLike<Answer>, ok: (data: unknown) => T | null): Promise<{ ok: true; value: T } | { ok: false; message: string }> {
    try {
      await net.assertOnline();
      const res = await run();
      if (res.error) return { ok: false, message: messageFor(res.error, net) };
      const value = ok(res.data);
      return value === null ? { ok: false, message: MESSAGES.failed } : { ok: true, value };
    } catch (e) {
      return { ok: false, message: messageFor(e, net) };
    }
  }

  return {
    /** A link to the plan of this journey. `stays`: also the name of the place to sleep each night. */
    async sharePlan(journeyId: string, opts: { stays: boolean; label?: string | null }): Promise<Made> {
      const options = { stays: opts.stays === true }; // the only option a plan link has (the database drops any other)
      const r = await call(
        () => client.rpc('create_share_link', { p_kind: 'plan', p_journey_id: journeyId, p_options: options, p_label: opts.label ?? null }),
        parseMade,
      );
      return r.ok ? { ok: true, ...r.value, url: shareUrl(r.value.token) } : r;
    },
    /** A link to a COPY of this note (made now). The note itself stays on the phone. */
    async shareNote(note: NoteCopy, opts: { label?: string | null } = {}): Promise<Made> {
      if (!note.body && !note.title) return { ok: false, message: MESSAGES.empty };
      const r = await call(
        () => client.rpc('create_share_link', { p_kind: 'note', p_note: note, p_label: opts.label ?? null }),
        parseMade,
      );
      return r.ok ? { ok: true, ...r.value, url: shareUrl(r.value.token) } : r;
    },
    async list(): Promise<Listed> {
      const r = await call(() => client.rpc('list_share_links'), (d) => (Array.isArray(d) ? parseLinks(d) : null));
      return r.ok ? { ok: true, links: r.value } : r;
    },
    /** Stops a link. Stopping it twice is fine. */
    async stop(id: string): Promise<Done> {
      const r = await call(() => client.rpc('revoke_share_link', { p_id: id }), () => true);
      return r.ok ? { ok: true } : r;
    },
  };
}

export type ShareLinksApi = ReturnType<typeof createShareLinks>;
