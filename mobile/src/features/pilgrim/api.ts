// What the profile of another pilgrim asks of Supabase. Three small reads, all under the row level security that is already there, so nothing
// is widened and nothing needs a new function in the database:
//   profiles      the basic card of a pilgrim (the policy "profiles readable unless blocked": a blocked or deleted pilgrim is not returned, which is
//                 the same answer as a pilgrim who does not exist)
//   friendships   my own row with them, if there is one (the policy "friendships visible to the two people"); when there is none, also
//                 list_friend_requests(), my own requests only, for a declined request that still reads "Requested" to me (30 days)
//   posts         their published posts that THIS viewer may see (the policy "posts by visibility": friends-only posts only for friends)
// The columns are listed once, here, and only these are asked for. Nothing of their notes, their plan or its day stories, or their health is
// read (those are other tables, and privacy.test.ts fails if this file names one).
import { type Post, listPostEngagement } from '@/lib/api';
import { assertOnline } from '@/lib/net';
import { withEngagement } from '@/lib/postEngagement';
import { supabase } from '@/lib/supabase';
import { SocialError } from '../social/api';
import type { FriendStatus } from '../social/types';
import { type Pilgrim, friendshipPair, hasOutgoingRequest, readPilgrim, readRelation } from './logic';

export const PILGRIM_COLS = 'id, username, display_name, bio, avatar_url, is_private, km_walked, posts_count, stamps_count';
export const FRIENDSHIP_COLS = 'status, requested_by';
export const JOURNEY_COLS = 'id, body, place_name, published_at, like_count, comment_count, media_count';
/** The latest posts, the same number Me reads for your own journey. */
export const JOURNEY_LIMIT = 30;

type PgResult<T> = { data: T | null; error: { message: string; code?: string } | null; status?: number };

// supabase-js answers a request that never got an HTTP reply with status 0.
function must<T>(res: PgResult<T>): T {
  if (res.error) throw new SocialError(res.error.message, { code: res.error.code || undefined, status: res.status, network: res.status === 0 });
  return res.data as T;
}

/** The card of a pilgrim, or null when there is none for this viewer (unknown, deleted, blocked either way). Offline: throws, so the screen says so. */
export async function fetchPilgrim(id: string): Promise<Pilgrim | null> {
  await assertOnline();
  return readPilgrim(must(await supabase.from('profiles').select(PILGRIM_COLS).eq('id', id).maybeSingle()));
}

/** Where I stand with them: friends, a request I sent, a request they sent, or nothing. */
export async function fetchRelation(me: string, other: string): Promise<FriendStatus> {
  await assertOnline();
  const [a, b] = friendshipPair(me, other);
  const relation = readRelation(must(await supabase.from('friendships').select(FRIENDSHIP_COLS).eq('user_a', a).eq('user_b', b).limit(1)), me);
  if (relation !== 'none') return relation;
  // No row: maybe a request of mine that they declined. The server keeps it looking unanswered to me for 30 days (it is in
  // list_friend_requests, never in friendships), so the profile says "Requested" like the Friends list. If that list cannot be
  // read, the answer stays "none", as before.
  const requests = await supabase.rpc('list_friend_requests');
  return !requests.error && hasOutgoingRequest(requests.data, other) ? 'pending_out' : 'none';
}

/** Their journey: the published posts of theirs that this viewer is allowed to see, newest first. Each carries author_id, which is what keeps their words off the share sheet. */
export async function fetchJourney(id: string): Promise<Post[]> {
  await assertOnline();
  const rows = must(
    await supabase
      .from('posts')
      .select(JOURNEY_COLS)
      .eq('user_id', id)
      .eq('status', 'published')
      .neq('kind', 'story')
      .is('deleted_at', null)
      .order('published_at', { ascending: false })
      .limit(JOURNEY_LIMIT),
  );
  const posts = (Array.isArray(rows) ? rows : []).map((r): Post => ({ ...(r as Omit<Post, 'health_summary' | 'author_id'>), health_summary: null, author_id: id }));
  return withEngagement(posts, await listPostEngagement(posts.map((p) => p.id)));
}
