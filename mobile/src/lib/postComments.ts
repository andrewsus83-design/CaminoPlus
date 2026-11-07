// The comments of a post as the comments sheet shows them: reading them out of a query result and checking a new one.
// Pure on purpose (no Supabase or React Native imports), so plain node tests cover it (npm run test:lib). The queries
// themselves are listPostComments and addPostComment in api.ts.

/** A comment row of the post_comments table, with the name of its author (null when that profile cannot be read). */
export type PostComment = {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  author: { username: string | null; display_name: string | null } | null;
};

/** A comment as the sheet draws it. `pending`: sent, not confirmed yet. */
export type SheetComment = { id: string; user: string; text: string; pending?: boolean; mine?: boolean };

/** The database allows 1 to 1000 characters (post_comments.body). */
export const COMMENT_MAX = 1000;
/** The sheet's own limit: short comments, the same in Discover and in the journey viewer. */
export const COMMENT_INPUT_MAX = 200;

/** The text to send: trimmed. null when there is nothing to send or it is longer than the database takes. */
export function commentText(raw: string): string | null {
  const t = String(raw ?? '').trim();
  return t.length > 0 && t.length <= COMMENT_MAX ? t : null;
}

const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const orNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * Rows of `select id, user_id, body, created_at, author:profiles(username, display_name)` -> comments. null when the
 * result is not a list of rows (the query failed). A row that is not complete is skipped. The author may come as an
 * object, as a one-item list, or not at all.
 */
export function parseComments(data: unknown): PostComment[] | null {
  if (!Array.isArray(data)) return null;
  const out: PostComment[] = [];
  for (const row of data) {
    if (!row || typeof row !== 'object') continue;
    const r = row as { id?: unknown; user_id?: unknown; body?: unknown; created_at?: unknown; author?: unknown };
    if (!str(r.id) || !str(r.user_id) || !str(r.body) || !str(r.created_at)) continue;
    const a = (Array.isArray(r.author) ? r.author[0] : r.author) as { username?: unknown; display_name?: unknown } | null | undefined;
    out.push({
      id: r.id,
      user_id: r.user_id,
      body: r.body,
      created_at: r.created_at,
      author: a && typeof a === 'object' ? { username: orNull(a.username), display_name: orNull(a.display_name) } : null,
    });
  }
  return out;
}

/** The name shown above a comment: @username, else the display name, else "pilgrim". */
export const commentAuthor = (c: Pick<PostComment, 'author'>): string => c.author?.username ?? c.author?.display_name ?? 'pilgrim';

/**
 * The comments for the sheet, oldest first. The query asks for the newest ones first (so a long thread shows the latest
 * page), so the list is turned around here. `meId` marks the person's own comments.
 */
export function toSheetComments(rows: PostComment[], meId: string | null): SheetComment[] {
  return rows
    .slice()
    .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))
    .map((c) => ({ id: c.id, user: commentAuthor(c), text: c.body, mine: meId !== null && c.user_id === meId }));
}
