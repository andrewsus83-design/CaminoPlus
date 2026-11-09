// Typed Supabase queries used by the app. Keep screens free of query strings so
// the offline layer (local SQLite + outbox) can later wrap these same functions.
import { supabase } from './supabase';
import { assertOnline } from './net';
import { uuid } from './uuid';
import { isCount } from './engagement';
import { parseEngagementRows, parsePostIds, withEngagement, type PostEngagement } from './postEngagement';
import { parseComments, type PostComment } from './postComments';

export type Profile = {
  id: string; username: string; display_name: string | null; bio: string | null; avatar_url: string | null;
  xp: number; level: number; followers_count: number; following_count: number; friends_count: number; posts_count: number;
  stamps_count: number; km_walked: number; is_private: boolean;
};
export type Route = { id: string; slug: string; name: string; short_name: string | null; start_name: string | null; end_name: string | null; distance_km: number | null; stage_count: number | null; difficulty: number | null; color: string | null };
export type Stage = { id: string; stage_number: number; name: string; distance_km: number | null; elevation_gain_m: number | null; difficulty: number | null; start: { name: string } | null; end: { name: string } | null };
export type Journey = { id: string; route_id: string; start_stage_id: string | null; status: string; walked_km: number; planned_start_date: string | null; route: { name: string; short_name: string | null; slug: string } | null; start_stage: { stage_number: number; name: string } | null };
export type JourneyDay = { id: string; day_number: number; planned_date: string | null; from_name: string | null; to_name: string | null; planned_distance_km: number | null; actual_distance_km: number | null; started_at: string | null; finished_at: string | null; notes: string | null; status: string; stage: { name: string } | null };
export type Stamp = { id: string; place_name: string | null; stamped_at: string; verified: boolean; method: string };
// save_count and share_count are optional: they are read by a separate query (listPostEngagement) and are missing until the database has them.
// author_id is only set on a post that is somebody else's (the journey of a pilgrim you opened): the rail then never puts their words on the share sheet. Your own posts have none.
export type Post = { id: string; body: string | null; place_name: string | null; published_at: string | null; like_count: number; comment_count: number; media_count: number; health_summary: { km?: number } | null; save_count?: number; share_count?: number; author_id?: string };

const PROFILE_COLS = 'id, username, display_name, bio, avatar_url, xp, level, followers_count, following_count, friends_count, posts_count, stamps_count, km_walked, is_private';

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export async function getProfile(userId: string) {
  await assertOnline();
  return must(await supabase.from('profiles').select(PROFILE_COLS).eq('id', userId).maybeSingle()) as Profile | null;
}

export async function updateProfile(userId: string, patch: Partial<Pick<Profile, 'display_name' | 'bio' | 'username' | 'avatar_url' | 'is_private'>>) {
  await assertOnline();
  return must(await supabase.from('profiles').update(patch).eq('id', userId).select(PROFILE_COLS).single()) as Profile;
}

/** Latest journey that is not deleted. No journey yet = onboarding not done. */
export async function getCurrentJourney(userId: string) {
  await assertOnline();
  return must(
    await supabase
      .from('journeys')
      .select('id, route_id, start_stage_id, status, walked_km, planned_start_date, route:routes(name, short_name, slug), start_stage:stages!journeys_start_stage_id_fkey(stage_number, name)')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ) as unknown as Journey | null;
}

export async function listRoutes() {
  await assertOnline();
  return must(
    await supabase
      .from('routes')
      .select('id, slug, name, short_name, start_name, end_name, distance_km, stage_count, difficulty, color')
      .eq('is_published', true)
      .is('deleted_at', null)
      .order('sort_order'),
  ) as Route[];
}

export async function listStages(routeId: string) {
  await assertOnline();
  return must(
    await supabase
      .from('stages')
      .select('id, stage_number, name, distance_km, elevation_gain_m, difficulty, start:places!stages_start_place_id_fkey(name), end:places!stages_end_place_id_fkey(name)')
      .eq('route_id', routeId)
      .eq('is_published', true)
      .is('variant_of', null)
      .is('deleted_at', null)
      .order('stage_number'),
  ) as unknown as Stage[];
}

/**
 * Onboarding / "Change Camino": one journey on the chosen route plus a day-by-day plan that follows the
 * official stages from the chosen stage. Runs as ONE server call (rpc start_journey) with a client generated
 * id, so a retry after a dropped connection returns the same journey instead of creating a second one.
 * Pass the same `journeyId` when retrying the same attempt.
 */
export async function startJourney(opts: { route: Route; startStageId: string | null; startDate: string | null; journeyId?: string }) {
  await assertOnline();
  const id = opts.journeyId ?? uuid();
  must(await supabase.rpc('start_journey', { p_journey_id: id, p_route_id: opts.route.id, p_start_stage_id: opts.startStageId, p_start_date: opts.startDate }));
  return id;
}

export async function listJourneyDays(journeyId: string) {
  await assertOnline();
  return must(
    await supabase
      .from('journey_days')
      .select('id, day_number, planned_date, from_name, to_name, planned_distance_km, actual_distance_km, started_at, finished_at, notes, status, stage:stages(name)')
      .eq('journey_id', journeyId)
      .is('deleted_at', null)
      .order('day_number'),
  ) as unknown as JourneyDay[];
}

export async function listMyStamps(userId: string) {
  await assertOnline();
  return must(
    await supabase.from('user_stamps').select('id, place_name, stamped_at, verified, method').eq('user_id', userId).is('deleted_at', null).order('stamped_at', { ascending: false }),
  ) as Stamp[];
}

export async function listMyPosts(userId: string) {
  await assertOnline();
  const posts = must(
    await supabase
      .from('posts')
      .select('id, body, place_name, published_at, like_count, comment_count, media_count, health_summary')
      .eq('user_id', userId)
      .eq('status', 'published')
      .neq('kind', 'story')
      .is('deleted_at', null)
      .order('published_at', { ascending: false })
      .limit(30),
  ) as Post[];
  return withEngagement(posts, await listPostEngagement(posts.map((p) => p.id)));
}

/**
 * Bookmark and share counts of posts (supabase/migrations/20261108010000_post_engagement_counters.sql).
 * They are read here, in a query of their own, and NOT in the posts query above: until that migration is applied
 * to the live database the two columns do not exist, and naming a missing column fails the whole query (that is how
 * profiles.friends_count once broke sign-in). This never throws. It answers null when the counts cannot be read,
 * and the posts then stay as they are: the viewer shows only the likes and comments it knows and hides the rest.
 */
export async function listPostEngagement(postIds: string[]): Promise<Map<string, PostEngagement> | null> {
  if (postIds.length === 0) return new Map();
  try {
    const res = await supabase.from('posts').select('id, save_count, share_count').in('id', postIds);
    return res.error ? null : parseEngagementRows(res.data);
  } catch {
    return null;
  }
}

/**
 * Likes, bookmarks, shares and comments of a post: the actions behind the action rail. They write to the tables that
 * already exist (post_likes, post_saves, post_comments and the rpc record_post_share), under their row level security:
 * a pilgrim can like, bookmark and comment as themselves on a post they can see, and remove their own like and bookmark.
 * Every one needs the network (assertOnline), so offline they fail at once, before any request, with OfflineError.
 */

/** Which of these posts this person has liked and bookmarked. A kind that could not be read is null: never guessed, never thrown. */
export type MyReactions = { liked: Set<string> | null; saved: Set<string> | null };

export async function listMyReactions(userId: string, postIds: string[]): Promise<MyReactions> {
  if (postIds.length === 0) return { liked: new Set(), saved: new Set() };
  try {
    await assertOnline();
  } catch {
    return { liked: null, saved: null };
  }
  const read = (q: PromiseLike<{ data: unknown; error: unknown }>) => q.then((res) => (res.error ? null : parsePostIds(res.data)), () => null);
  const [liked, saved] = await Promise.all([
    read(supabase.from('post_likes').select('post_id').eq('user_id', userId).in('post_id', postIds)),
    read(supabase.from('post_saves').select('post_id').eq('user_id', userId).in('post_id', postIds)),
  ]);
  return { liked, saved };
}

// A like and a bookmark are written with "on conflict do nothing", so a second try (a dropped connection, a double tap
// that got through) changes nothing and is not an error. post_saves has no UPDATE for the app at all.
export async function likePost(userId: string, postId: string) {
  await assertOnline();
  must(await supabase.from('post_likes').upsert({ post_id: postId, user_id: userId }, { onConflict: 'post_id,user_id', ignoreDuplicates: true }));
}

export async function unlikePost(userId: string, postId: string) {
  await assertOnline();
  must(await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', userId));
}

export async function savePost(userId: string, postId: string) {
  await assertOnline();
  must(await supabase.from('post_saves').upsert({ post_id: postId, user_id: userId }, { onConflict: 'post_id,user_id', ignoreDuplicates: true }));
}

export async function unsavePost(userId: string, postId: string) {
  await assertOnline();
  must(await supabase.from('post_saves').delete().eq('post_id', postId).eq('user_id', userId));
}

/** The pilgrim shared the post out of the app. Counts once per pilgrim and post. Answers the post's new share_count (null if unreadable). */
export async function recordPostShare(postId: string): Promise<number | null> {
  await assertOnline();
  const n = must(await supabase.rpc('record_post_share', { p_post_id: postId }));
  return isCount(n) ? Math.floor(n) : null;
}

/** The latest comments of a post (newest first, at most 50) with their author's name. Hidden and removed ones are not in it. */
export async function listPostComments(postId: string): Promise<PostComment[]> {
  await assertOnline();
  const rows = must(
    await supabase
      .from('post_comments')
      .select('id, user_id, body, created_at, author:profiles(username, display_name)')
      .eq('post_id', postId)
      .is('deleted_at', null)
      .eq('moderation_status', 'ok')
      .order('created_at', { ascending: false })
      .limit(50),
  );
  const list = parseComments(rows);
  if (!list) throw new Error('Could not read the comments.');
  return list;
}

/**
 * Adds a comment as this pilgrim. The id is made by the app, so sending the same comment again (a connection that dropped
 * after the server had it) answers "already there" (23505), which is what the pilgrim wanted.
 */
export async function addPostComment(o: { id: string; userId: string; postId: string; body: string }) {
  await assertOnline();
  const res = await supabase.from('post_comments').insert({ id: o.id, post_id: o.postId, user_id: o.userId, body: o.body, client_created_at: new Date().toISOString() });
  if (res.error && (res.error as { code?: string }).code !== '23505') throw new Error(res.error.message);
}

/** Text journal post (photos come with the media upload flow). Followers only by default. */
export async function createJournalPost(opts: { userId: string; body: string; journeyId: string | null; routeId: string | null; placeName?: string | null; visibility?: 'followers' | 'public' }) {
  await assertOnline();
  return must(
    await supabase
      .from('posts')
      .insert({ user_id: opts.userId, kind: 'journal', visibility: opts.visibility ?? 'followers', status: 'published', body: opts.body, place_name: opts.placeName ?? null, journey_id: opts.journeyId, route_id: opts.routeId, client_created_at: new Date().toISOString() })
      .select('id')
      .single(),
  ) as { id: string };
}

export type PickedMedia = { uri: string; type: 'image' | 'video'; mimeType?: string | null; width?: number; height?: number; durationMs?: number | null; fileSize?: number | null };

/** Upload photos/videos of a post to the private user-media bucket and register them in post_media.
 *  Returns how many failed (cloud storage quota is 0 on the free plan, so uploads can be refused). */
export async function uploadPostMedia(userId: string, postId: string, items: PickedMedia[]) {
  await assertOnline();
  let failed = 0;
  for (let i = 0; i < items.length; i++) {
    const m = items[i];
    try {
      const ext = m.type === 'video' ? (m.mimeType === 'video/quicktime' ? 'mov' : 'mp4') : m.mimeType === 'image/png' ? 'png' : 'jpg';
      const path = `${userId}/posts/${postId}-${i}.${ext}`;
      const body = await (await fetch(m.uri)).arrayBuffer();
      const up = await supabase.storage.from('user-media').upload(path, body, { contentType: m.mimeType ?? (m.type === 'video' ? 'video/mp4' : 'image/jpeg'), upsert: true });
      if (up.error) throw new Error(up.error.message);
      must(await supabase.from('post_media').insert({ post_id: postId, user_id: userId, sort_order: i, media_type: m.type, storage_path: path, width: m.width ?? null, height: m.height ?? null, duration_ms: m.durationMs ? Math.round(m.durationMs) : null, size_bytes: m.fileSize ?? body.byteLength, upload_status: 'uploaded' }));
    } catch {
      failed++;
    }
  }
  return failed;
}

export type PostMediaUrl = { type: 'image' | 'video'; url: string };
/** Signed URLs (1 h) for the photos and videos of your posts, grouped by post id and in slide order. */
export async function listPostMediaUrls(postIds: string[]) {
  await assertOnline();
  const out: Record<string, PostMediaUrl[]> = {};
  if (postIds.length === 0) return out;
  const rows = must(
    await supabase.from('post_media').select('post_id, media_type, storage_path, sort_order').in('post_id', postIds).is('deleted_at', null).order('sort_order'),
  ) as { post_id: string; media_type: 'image' | 'video'; storage_path: string }[];
  if (rows.length === 0) return out;
  const signed = await supabase.storage.from('user-media').createSignedUrls(rows.map((r) => r.storage_path), 3600);
  if (signed.error || !signed.data) return out;
  rows.forEach((r, i) => {
    const url = signed.data[i]?.signedUrl;
    if (url) (out[r.post_id] ??= []).push({ type: r.media_type, url });
  });
  return out;
}
