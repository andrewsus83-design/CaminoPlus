// Every Supabase call of the social module lives here (typed by hand against the database
// contract: friendships, conversations, messages, notifications and their RPCs). Screens and
// hooks never write query strings, so the offline layer can wrap these functions later.
import { OfflineError, assertOnline } from '@/lib/net';
import { supabase } from '@/lib/supabase';
import { normalizeTotals, parseStorage } from './logic';
import type {
  ChatMessage, Conversation, Friend, FriendRequest, Member, NotificationItem, OutboxItem, PilgrimResult, ReportReason, StorageInfo, UnreadTotals,
} from './types';

/** An error from the data layer. `network` = the request never got an answer (offline, timeout). */
export class SocialError extends Error {
  code?: string;
  status?: number;
  network: boolean;
  constructor(message: string, o: { code?: string; status?: number; network?: boolean } = {}) {
    super(message);
    this.name = 'SocialError';
    this.code = o.code;
    this.status = o.status;
    this.network = !!o.network;
  }
}

type PgResult<T> = { data: T | null; error: { message: string; code?: string } | null; status?: number };

// supabase-js reports a request that never got an HTTP answer with status 0.
function must<T>(res: PgResult<T>): T {
  if (res.error) throw new SocialError(res.error.message, { code: res.error.code || undefined, status: res.status, network: res.status === 0 });
  return res.data as T;
}

const rows = <T>(data: unknown): T[] => (Array.isArray(data) ? (data as T[]) : data ? [data as T] : []);

export const PAGE_SIZE = 40;
const MESSAGE_COLS = 'id, conversation_id, sender_id, kind, body, media_path, reply_to, client_created_at, created_at, edited_at, deleted_at';
const NOTIFICATION_COLS = 'id, kind, title, body, data, read_at, created_at, actor:profiles!actor_id(id, username, display_name, avatar_url)';
export const CHAT_BUCKET = 'user-media';

const raw = {
  /* ---------------- unread ---------------- */
  async unreadTotals(): Promise<UnreadTotals> {
    return normalizeTotals(must(await supabase.rpc('get_unread_totals')));
  },

  /* ---------------- conversations ---------------- */
  async listConversations(kind: 'direct' | 'group' | null = null): Promise<Conversation[]> {
    return rows<Conversation>(must(await supabase.rpc('list_conversations', { p_kind: kind }))).map((c) => ({ ...c, unread_count: Number(c.unread_count) || 0, member_count: Number(c.member_count) || 0 }));
  },
  async startDirectChat(userId: string): Promise<string> {
    return String(must(await supabase.rpc('start_direct_chat', { p_user: userId })));
  },
  async createGroup(title: string, memberIds: string[]): Promise<string> {
    return String(must(await supabase.rpc('create_group_chat', { p_title: title.trim(), p_members: memberIds })));
  },
  async listMembers(conversationId: string): Promise<Member[]> {
    return rows<Member>(must(await supabase.rpc('list_conversation_members', { p_conversation: conversationId })));
  },
  async addMembers(conversationId: string, userIds: string[]): Promise<number> {
    return Number(must(await supabase.rpc('add_group_members', { p_conversation: conversationId, p_members: userIds }))) || 0;
  },
  async removeMember(conversationId: string, userId: string): Promise<void> {
    must(await supabase.rpc('remove_group_member', { p_conversation: conversationId, p_user: userId }));
  },
  async leave(conversationId: string): Promise<void> {
    must(await supabase.rpc('leave_conversation', { p_conversation: conversationId }));
  },
  async renameGroup(conversationId: string, title: string): Promise<void> {
    must(await supabase.rpc('rename_group', { p_conversation: conversationId, p_title: title.trim() }));
  },
  async markRead(conversationId: string): Promise<void> {
    must(await supabase.rpc('mark_conversation_read', { p_conversation: conversationId }));
  },
  /** until = null unmutes. */
  async mute(conversationId: string, until: string | null): Promise<void> {
    must(await supabase.rpc('mute_conversation', { p_conversation: conversationId, p_until: until }));
  },

  /* ---------------- messages ---------------- */
  /** Newest `limit` messages (oldest first), or the page before `before`. */
  async listMessages(conversationId: string, o: { before?: string | null; limit?: number } = {}): Promise<ChatMessage[]> {
    let q = supabase.from('messages').select(MESSAGE_COLS).eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(o.limit ?? PAGE_SIZE);
    if (o.before) q = q.lt('created_at', o.before);
    return rows<ChatMessage>(must(await q)).reverse();
  },
  async getMessages(ids: string[]): Promise<ChatMessage[]> {
    if (ids.length === 0) return [];
    return rows<ChatMessage>(must(await supabase.from('messages').select(MESSAGE_COLS).in('id', ids)));
  },
  /** Sends one outbox item. The client id makes it idempotent: a second try answers 23505, which the caller treats as sent. */
  async sendMessage(item: OutboxItem): Promise<void> {
    must(await supabase.from('messages').insert({
      id: item.id, conversation_id: item.conversation_id, kind: item.kind, body: item.body, media_path: item.media_path,
      reply_to: item.reply_to, client_created_at: item.client_created_at,
    }));
  },
  async unsend(messageId: string): Promise<void> {
    must(await supabase.rpc('unsend_message', { p_message: messageId }));
  },
  /** Uploads the photo of an outbox item to the private user-media bucket and returns its path. */
  async uploadChatImage(item: OutboxItem): Promise<string> {
    if (!item.local_uri) throw new SocialError('The photo is no longer on this phone.', { status: 400 });
    const mime = item.mime ?? 'image/jpeg';
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : mime === 'image/heic' ? 'heic' : 'jpg';
    const path = `${item.user_id}/chat/${item.conversation_id}/${item.id}.${ext}`;
    let body: ArrayBuffer;
    try {
      body = await (await fetch(item.local_uri)).arrayBuffer();
    } catch {
      throw new SocialError('The photo is no longer on this phone.', { status: 400 });
    }
    const up = await supabase.storage.from(CHAT_BUCKET).upload(path, body, { contentType: mime, upsert: true });
    if (up.error) {
      // StorageApiError carries an HTTP status; a failed fetch (offline) does not.
      const e = up.error as { status?: number; statusCode?: string | number };
      const raw = e.status ?? e.statusCode;
      const status = raw == null ? NaN : Number(raw);
      throw new SocialError(up.error.message, { status: Number.isFinite(status) ? status : undefined, network: !Number.isFinite(status) });
    }
    return path;
  },
  async signedUrls(paths: string[]): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    if (paths.length === 0) return out;
    const res = await supabase.storage.from(CHAT_BUCKET).createSignedUrls(paths, 3600);
    if (res.error || !res.data) throw new SocialError(res.error?.message ?? 'Could not load the photo.', { network: true });
    for (const r of res.data) if (r.path && r.signedUrl) out[r.path] = r.signedUrl;
    return out;
  },
  async storage(): Promise<StorageInfo | null> {
    return parseStorage(must(await supabase.rpc('get_my_storage')));
  },

  /* ---------------- notifications ---------------- */
  async listNotifications(userId: string, limit = 60): Promise<NotificationItem[]> {
    const list = rows<NotificationItem>(must(await supabase.from('notifications').select(NOTIFICATION_COLS).eq('user_id', userId).order('created_at', { ascending: false }).limit(limit)));
    return list.map((n) => ({ ...n, data: (n.data && typeof n.data === 'object' ? n.data : {}) as Record<string, unknown> }));
  },
  /** ids = null marks every notification of mine as read. */
  async markNotificationsRead(ids: string[] | null): Promise<number> {
    return Number(must(await supabase.rpc('mark_notifications_read', ids ? { p_ids: ids } : {}))) || 0;
  },

  /* ---------------- friends ---------------- */
  async listFriends(limit = 200): Promise<Friend[]> {
    return rows<Friend>(must(await supabase.rpc('list_friends', { p_limit: limit, p_offset: 0 }))).map((f) => ({ ...f, km_walked: f.km_walked == null ? null : Number(f.km_walked) }));
  },
  async listFriendRequests(): Promise<FriendRequest[]> {
    return rows<FriendRequest>(must(await supabase.rpc('list_friend_requests')));
  },
  async searchPilgrims(query: string, limit = 20): Promise<PilgrimResult[]> {
    return rows<PilgrimResult>(must(await supabase.rpc('search_pilgrims', { p_query: query, p_limit: limit })));
  },
  /** 'pending' | 'accepted' | 'already_friends' */
  async sendFriendRequest(userId: string): Promise<string> {
    return String(must(await supabase.rpc('send_friend_request', { p_user: userId })));
  },
  async respondFriendRequest(userId: string, accept: boolean): Promise<string> {
    return String(must(await supabase.rpc('respond_friend_request', { p_user: userId, p_accept: accept })));
  },
  async cancelFriendRequest(userId: string): Promise<void> {
    must(await supabase.rpc('cancel_friend_request', { p_user: userId }));
  },
  async removeFriend(userId: string): Promise<void> {
    must(await supabase.rpc('remove_friend', { p_user: userId }));
  },

  /* ---------------- safety ---------------- */
  async block(userId: string): Promise<void> {
    const res = await supabase.from('blocks').insert({ blocked_id: userId });
    if (res.error && res.error.code !== '23505') must(res); // already blocked is fine
  },
  async unblock(userId: string): Promise<void> {
    must(await supabase.from('blocks').delete().eq('blocked_id', userId));
  },
  async isBlocked(userId: string): Promise<boolean> {
    const list = rows<{ blocked_id: string }>(must(await supabase.from('blocks').select('blocked_id').eq('blocked_id', userId).limit(1)));
    return list.length > 0;
  },
  /** Report a message, or a person. A second report of the same thing counts as sent. */
  async report(o: { type: 'message' | 'profile'; targetId: string; reason: ReportReason; details?: string }): Promise<void> {
    const row: Record<string, unknown> = { target_type: o.type, target_id: o.targetId, reason: o.reason, details: o.details?.trim() || null };
    if (o.type === 'message') row.message_id = o.targetId;
    const res = await supabase.from('content_reports').insert(row);
    if (res.error && res.error.code !== '23505') must(res);
  },
  /** Profiles of people whose name is not in the member list (someone who left a group). Best effort. */
  async profiles(ids: string[]): Promise<{ id: string; username: string | null; display_name: string | null; avatar_url: string | null }[]> {
    if (ids.length === 0) return [];
    return rows(must(await supabase.from('profiles').select('id, username, display_name, avatar_url').in('id', ids)));
  },
};

// Offline with an expired login, supabase-js can wait ~30 s per request before it gives up. Loads and
// button presses should say "you are offline" at once instead. NOT applied to sendMessage and
// uploadChatImage: the outbox must keep trying (and queueing) whatever NetInfo thinks.
const UNGUARDED = new Set<string>(['sendMessage', 'uploadChatImage']);

async function failFastWhenOffline() {
  try {
    await assertOnline();
  } catch (e) {
    if (e instanceof OfflineError) throw new SocialError('You are offline.', { network: true, status: 0 });
    throw e;
  }
}

function guard<T extends Record<string, (...a: never[]) => Promise<unknown>>>(api: T): T {
  const out: Record<string, unknown> = {};
  for (const [name, fn] of Object.entries(api)) {
    out[name] = UNGUARDED.has(name) ? fn : async (...args: never[]) => { await failFastWhenOffline(); return fn(...args); };
  }
  return out as T;
}

export const socialApi = guard(raw);
