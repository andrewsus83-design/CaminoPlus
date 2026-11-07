// The posts a pilgrim bookmarked (the bookmark button of the journey viewer writes post_saves), read for the Bookmarks screen.
//
// No new table, function or migration: three plain reads, each under the row level security that is already there.
//   1. post_saves  where user_id is me, newest first, at most 50.   Policy "read own saves": only your own bookmarks, nobody else's.
//   2. posts       where id is one of those.                         Policy "posts by visibility": a post you cannot see (any more) is
//                                                                    simply not in the answer, so it is not listed.
//   3. profiles    where id is one of the authors who are not me.    The name of whoever wrote the post, when that profile can be read.
// They are plain reads, the same kind the app already makes (post_saves by person, posts by id), and not one query that
// embeds posts and profiles inside post_saves: a post and a profile are related in several ways here (the author, and every
// like and bookmark), and a plain read leaves nothing for the server to guess.
//
// This file has no React Native imports. The Supabase client and the "are we offline" checks come in as arguments
// (client.ts hands in the real ones), so plain node tests run the real code against a scripted stand-in (npm run test:library).
// Nothing in makeSavedPostsApi throws: every failure comes back as { ok: false }.
import { looksOffline } from '../../lib/optimistic';

/** Posts listed at most. The newest 50 bookmarks: there is no paging yet, and the screen says when it stopped there. */
export const SAVED_POSTS_MAX = 50;

/** A bookmarked post as the Bookmarks screen draws it, and as it is kept on the phone for when there is no signal. */
export type SavedPost = {
  id: string;
  /** Who wrote it. */
  userId: string;
  /** When it was bookmarked (ISO), if the answer said. */
  savedAt: string | null;
  publishedAt: string | null;
  place: string | null;
  body: string | null;
  /** Photos and clips of the post. */
  mediaCount: number;
  /** The name of the author when they are not the person reading and their profile could be read. */
  author: string | null;
};

// ---------------------------------------------------------------- reading what the database answers

const BODY_KEPT = 400;
const NAME_KEPT = 60;

const clipText = (s: string, max: number): string => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);
const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? clipText(v.trim(), max) : null);
const when = (v: unknown): string | null => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null);
const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64;

export type SaveRow = { postId: string; savedAt: string | null };

/** Rows of `select post_id, created_at` from post_saves, in the order they came. null when the answer is not a list (the read failed). A row without a post id is skipped, a post twice is kept once. */
export function parseSaveRows(data: unknown): SaveRow[] | null {
  if (!Array.isArray(data)) return null;
  const out: SaveRow[] = [];
  const seen = new Set<string>();
  for (const row of data) {
    const r = (row && typeof row === 'object' ? row : {}) as { post_id?: unknown; created_at?: unknown };
    if (!isId(r.post_id) || seen.has(r.post_id)) continue;
    seen.add(r.post_id);
    out.push({ postId: r.post_id, savedAt: when(r.created_at) });
  }
  return out;
}

export type PostRow = Omit<SavedPost, 'savedAt' | 'author'>;

/** The columns read from posts, in one place so the test can check the request against what parsePostRows reads. */
export const POST_COLUMNS = 'id, user_id, body, place_name, published_at, media_count, status, moderation_status, deleted_at, expires_at';

/**
 * Rows of `select <POST_COLUMNS>` from posts, by id. null when the answer is not a list. A post is left out when it is not one to show:
 * deleted, not published, hidden or removed by moderation, or a story that has expired. (The database already hides these from other
 * people; the owner of a post still reads their own, so this is also what keeps a deleted post of your own off the list.)
 */
export function parsePostRows(data: unknown, now: number): Map<string, PostRow> | null {
  if (!Array.isArray(data)) return null;
  const out = new Map<string, PostRow>();
  for (const row of data) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    if (!isId(r.id) || !isId(r.user_id)) continue;
    if (r.deleted_at != null) continue;
    if (typeof r.status === 'string' && r.status !== 'published') continue;
    if (typeof r.moderation_status === 'string' && r.moderation_status !== 'ok') continue;
    const expires = when(r.expires_at);
    if (expires !== null && Date.parse(expires) <= now) continue;
    out.set(r.id, { id: r.id, userId: r.user_id, publishedAt: when(r.published_at), place: text(r.place_name, NAME_KEPT), body: text(r.body, BODY_KEPT), mediaCount: count(r.media_count) });
  }
  return out;
}

/** Rows of `select id, username, display_name` from profiles -> the name to show by id (the display name, else the username). null when the answer is not a list. */
export function parseAuthorRows(data: unknown): Map<string, string> | null {
  if (!Array.isArray(data)) return null;
  const out = new Map<string, string>();
  for (const row of data) {
    const r = (row && typeof row === 'object' ? row : {}) as { id?: unknown; username?: unknown; display_name?: unknown };
    const name = text(r.display_name, NAME_KEPT) ?? text(r.username, NAME_KEPT);
    if (isId(r.id) && name) out.set(r.id, name);
  }
  return out;
}

/** The bookmarks in the order they were made (newest first), each joined with its post. A bookmark whose post is not in `posts` (not visible any more, deleted) is left out. */
export function buildSavedPosts(saves: readonly SaveRow[], posts: ReadonlyMap<string, PostRow>, authors: ReadonlyMap<string, string>, me: string): SavedPost[] {
  const out: SavedPost[] = [];
  for (const s of saves) {
    const p = posts.get(s.postId);
    if (p) out.push({ ...p, savedAt: s.savedAt, author: p.userId === me ? null : authors.get(p.userId) ?? null });
  }
  return out;
}

// ---------------------------------------------------------------- the saved copy on the phone

/** The name after `u.<userId>.` (lib/localStore.ts userKey): wiped with everything else of that person when they log out. */
export const SAVED_COPY_NAME = 'library.savedPosts';

export type StoredSavedPosts = { v: 1; savedAt: number; posts: SavedPost[] };

export const packSavedPosts = (posts: readonly SavedPost[], now: number): StoredSavedPosts => ({ v: 1, savedAt: now, posts: [...posts] });

/** The posts of a stored copy, each checked again (a file can be old, cut off or from another version). null when it is not a copy at all. */
export function parseSavedCopy(raw: unknown): SavedPost[] | null {
  if (!raw || typeof raw !== 'object') return null;
  const { v, posts } = raw as { v?: unknown; posts?: unknown };
  if (v !== 1 || !Array.isArray(posts)) return null;
  const out: SavedPost[] = [];
  const seen = new Set<string>();
  for (const row of posts) {
    if (!row || typeof row !== 'object' || out.length >= SAVED_POSTS_MAX) continue;
    const r = row as Record<string, unknown>;
    if (!isId(r.id) || !isId(r.userId) || seen.has(r.id)) continue;
    seen.add(r.id);
    out.push({
      id: r.id, userId: r.userId, savedAt: when(r.savedAt), publishedAt: when(r.publishedAt), place: text(r.place, NAME_KEPT),
      body: text(r.body, BODY_KEPT), mediaCount: count(r.mediaCount), author: text(r.author, NAME_KEPT),
    });
  }
  return out;
}

// ---------------------------------------------------------------- the reads

type Answer = { data: unknown; error: { message: string } | null };

/** The little of supabase-js this file uses: a chain of calls, each of which can also be awaited. */
export type SavedPostsQuery = PromiseLike<Answer> & {
  select(columns: string): SavedPostsQuery;
  eq(column: string, value: unknown): SavedPostsQuery;
  in(column: string, values: unknown[]): SavedPostsQuery;
  order(column: string, options?: { ascending: boolean }): SavedPostsQuery;
  limit(count: number): SavedPostsQuery;
};
export type SavedPostsClient = { from(table: string): SavedPostsQuery };

export type SavedPostsNet = {
  /** Rejects when the phone says it is offline (fails at once instead of waiting for a request to time out). */
  assertOnline(): Promise<void>;
  isOffline(e: unknown): boolean;
  message(e: unknown): string;
};

/** `capped`: the list stopped at the newest SAVED_POSTS_MAX bookmarks, there may be older ones. */
export type SavedPostsResult = { ok: true; posts: SavedPost[]; capped: boolean } | { ok: false; offline: boolean; message: string };

const TIMEOUT_MESSAGE = 'The server took too long to answer.';

function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(TIMEOUT_MESSAGE)), ms);
    Promise.resolve(p).then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

export function makeSavedPostsApi(client: SavedPostsClient, net: SavedPostsNet, opts: { timeoutMs?: number; now?: () => number } = {}) {
  const timeoutMs = opts.timeoutMs ?? 12_000;
  const now = opts.now ?? Date.now;

  // One read: its answer, or a throw with the database's own words. supabase-js reports a dropped connection as an error answer
  // ("Failed to fetch"), not as a throw, so an error answer is thrown here and told apart by net.isOffline in the one catch below.
  async function read<R>(query: SavedPostsQuery, parse: (data: unknown) => R | null, what: string): Promise<R> {
    const res = await withTimeout(query, timeoutMs);
    if (res.error) throw new Error(res.error.message);
    const rows = parse(res.data);
    if (rows === null) throw new Error(`The answer was not a list of ${what}.`);
    return rows;
  }

  return {
    /** The posts this person bookmarked and can still see, newest bookmark first. Never throws. */
    async listMySavedPosts(userId: string): Promise<SavedPostsResult> {
      try {
        await net.assertOnline();
        const saves = await read(client.from('post_saves').select('post_id, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(SAVED_POSTS_MAX), parseSaveRows, 'bookmarks');
        if (saves.length === 0) return { ok: true, posts: [], capped: false };
        const posts = await read(client.from('posts').select(POST_COLUMNS).in('id', saves.map((s) => s.postId)), (d) => parsePostRows(d, now()), 'posts');
        // The names of other authors are a nicety: when they cannot be read the posts are listed without them.
        const others = [...new Set([...posts.values()].map((p) => p.userId).filter((id) => id !== userId))];
        let authors = new Map<string, string>();
        if (others.length > 0) {
          try {
            authors = await read(client.from('profiles').select('id, username, display_name').in('id', others), parseAuthorRows, 'profiles');
          } catch { /* no names */ }
        }
        return { ok: true, posts: buildSavedPosts(saves, posts, authors, userId), capped: saves.length >= SAVED_POSTS_MAX };
      } catch (e) {
        return { ok: false, offline: net.isOffline(e), message: net.message(e) };
      }
    },
  };
}

export type SavedPostsApi = ReturnType<typeof makeSavedPostsApi>;

// ---------------------------------------------------------------- the words

/** What a bookmarked post is called in the list: its place and day, as the full-screen viewer names it, else "On the Camino". */
export const postHeading = (place: string | null, day: string): string => [place, day].filter(Boolean).join(' · ') || 'On the Camino';

/** Photos and clips, in words ("2 photos or clips"), or nothing for a post with none. */
export const mediaLabel = (n: number): string => (n > 0 ? `${n} ${n === 1 ? 'photo or clip' : 'photos or clips'}` : '');

/** The small line under a post: whose it is, and how many pictures it has. */
export function postByline(p: Pick<SavedPost, 'userId' | 'author' | 'mediaCount'>, me: string | null): string {
  const who = me !== null && p.userId === me ? 'Your post' : p.author ? `By ${p.author}` : 'A pilgrim\'s post';
  return [who, mediaLabel(p.mediaCount)].filter(Boolean).join(' · ');
}

export const SAVED_EMPTY = 'No bookmarked posts yet. Tap the bookmark on a post in your journey to keep it here.';
export const SAVED_OFFLINE_EMPTY = 'You are offline. Your bookmarked posts will show up when you are back online.';
export const SAVED_OFFLINE_NOTE = 'You are offline. Showing what is saved on this phone.';
export const SAVED_FAILED = 'Could not load your bookmarked posts. Please try again later.';
export const SAVED_LIMIT_NOTE = `Showing your latest ${SAVED_POSTS_MAX} bookmarked posts.`;

/** One short sentence after a bookmark could not be taken off or put back: offline says so, anything else says what was not changed. */
export const changeFailure = (error: unknown): string =>
  looksOffline(error) ? 'You are offline. Changing a bookmark needs a connection.' : 'That bookmark could not be changed. Please try again.';

export type SavedView = 'loading' | 'list' | 'empty' | 'offline-empty' | 'failed-empty';

/**
 * What the Posts part of the Bookmarks screen shows. `posts` is what is known (the saved copy first, then the answer), null while
 * nothing is known. A list that is known is shown even when the last refresh failed (a note says so); a failure with nothing
 * to show says so in a sentence, and "nothing yet" is said only when it really is nothing, never while still waiting.
 */
export function savedView(s: { posts: readonly SavedPost[] | null; loading: boolean; offline: boolean; failed: boolean }): SavedView {
  if (s.posts && s.posts.length > 0) return 'list';
  if (s.loading) return 'loading';
  if (!s.posts) return s.offline ? 'offline-empty' : s.failed ? 'failed-empty' : 'loading';
  return 'empty';
}
