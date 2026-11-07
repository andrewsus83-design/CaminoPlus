// The bookmark and share counts of posts: reading them out of a query result and putting them on the
// posts. Pure on purpose (no Supabase or React Native imports), so plain node tests cover it
// (npm run test:me). The query itself is listPostEngagement in api.ts.
//
// These two numbers come from their own query, never from the main posts query. The live database only
// has the columns once supabase/migrations/20261108010000_post_engagement_counters.sql is applied, and
// naming a column that does not exist makes a whole query fail (that is how profiles.friends_count once
// broke sign-in). So everything here is built around "unknown": no result means the posts stay exactly as
// they were, and a post only gets the two fields when the database really answered for it. A missing
// count is never turned into 0.

export type PostEngagement = { save_count: number; share_count: number };

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/**
 * Rows of `select id, save_count, share_count` -> counts by post id. Answers null when the result is not a
 * list of rows (the query failed or the columns are not there). A row that is not complete and sane is
 * skipped, so one odd row cannot give another post a number.
 */
export function parseEngagementRows(data: unknown): Map<string, PostEngagement> | null {
  if (!Array.isArray(data)) return null;
  const out = new Map<string, PostEngagement>();
  for (const row of data) {
    if (!row || typeof row !== 'object') continue;
    const r = row as { id?: unknown; save_count?: unknown; share_count?: unknown };
    if (typeof r.id === 'string' && isCount(r.save_count) && isCount(r.share_count)) {
      out.set(r.id, { save_count: Math.floor(r.save_count), share_count: Math.floor(r.share_count) });
    }
  }
  return out;
}

/** The posts with their counts. Without counts (null) it is the same list, untouched; a post without a row stays as it is. */
export function withEngagement<T extends { id: string }>(posts: T[], counts: Map<string, PostEngagement> | null): T[] {
  if (!counts) return posts;
  return posts.map((p) => {
    const c = counts.get(p.id);
    return c ? { ...p, ...c } : p;
  });
}
