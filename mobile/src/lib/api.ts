// Typed Supabase queries used by the app. Keep screens free of query strings so
// the offline layer (local SQLite + outbox) can later wrap these same functions.
import { supabase } from './supabase';

export type Profile = {
  id: string; username: string; display_name: string | null; bio: string | null; avatar_url: string | null;
  xp: number; level: number; followers_count: number; following_count: number; posts_count: number;
  stamps_count: number; km_walked: number; is_private: boolean;
};
export type Route = { id: string; slug: string; name: string; short_name: string | null; start_name: string | null; end_name: string | null; distance_km: number | null; stage_count: number | null; difficulty: number | null; color: string | null };
export type Stage = { id: string; stage_number: number; name: string; distance_km: number; elevation_gain_m: number | null; difficulty: number | null; start: { name: string } | null; end: { name: string } | null };
export type Journey = { id: string; route_id: string; start_stage_id: string | null; status: string; walked_km: number; planned_start_date: string | null; route: { name: string; short_name: string | null } | null; start_stage: { stage_number: number; name: string } | null };
export type JourneyDay = { id: string; day_number: number; planned_date: string | null; from_name: string | null; to_name: string | null; planned_distance_km: number | null; actual_distance_km: number | null; started_at: string | null; finished_at: string | null; notes: string | null; status: string; stage: { name: string } | null };
export type Stamp = { id: string; place_name: string | null; stamped_at: string; verified: boolean; method: string };
export type Post = { id: string; body: string | null; place_name: string | null; published_at: string | null; like_count: number; comment_count: number; media_count: number; health_summary: { km?: number } | null };

const PROFILE_COLS = 'id, username, display_name, bio, avatar_url, xp, level, followers_count, following_count, posts_count, stamps_count, km_walked, is_private';

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export async function getProfile(userId: string) {
  return must(await supabase.from('profiles').select(PROFILE_COLS).eq('id', userId).maybeSingle()) as Profile | null;
}

export async function updateProfile(userId: string, patch: Partial<Pick<Profile, 'display_name' | 'bio' | 'username' | 'avatar_url' | 'is_private'>>) {
  return must(await supabase.from('profiles').update(patch).eq('id', userId).select(PROFILE_COLS).single()) as Profile;
}

/** Latest journey that is not deleted. No journey yet = onboarding not done. */
export async function getCurrentJourney(userId: string) {
  return must(
    await supabase
      .from('journeys')
      .select('id, route_id, start_stage_id, status, walked_km, planned_start_date, route:routes(name, short_name), start_stage:stages!journeys_start_stage_id_fkey(stage_number, name)')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ) as unknown as Journey | null;
}

export async function listRoutes() {
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
 * Onboarding result: one journey on the chosen route, starting at the chosen
 * stage, plus a day-by-day plan that follows the official stages from there.
 */
export async function startJourney(opts: { userId: string; route: Route; stages: Stage[]; startStageId: string | null; startDate: string | null }) {
  const { userId, route, stages, startStageId, startDate } = opts;
  const from = startStageId ? stages.findIndex((s) => s.id === startStageId) : 0;
  const plan = stages.slice(Math.max(from, 0));
  const planned = plan.reduce((sum, s) => sum + Number(s.distance_km), 0);
  const journey = must(
    await supabase
      .from('journeys')
      .insert({
        user_id: userId,
        route_id: route.id,
        start_stage_id: startStageId,
        title: route.name,
        planned_start_date: startDate,
        planned_distance_km: planned || route.distance_km,
        client_created_at: new Date().toISOString(),
      })
      .select('id')
      .single(),
  ) as { id: string };
  if (plan.length) {
    const day0 = startDate ? new Date(`${startDate}T00:00:00Z`) : null;
    must(
      await supabase.from('journey_days').insert(
        plan.map((s, i) => ({
          journey_id: journey.id,
          user_id: userId,
          day_number: i + 1,
          stage_id: s.id,
          from_name: s.start?.name ?? null,
          to_name: s.end?.name ?? null,
          planned_distance_km: s.distance_km,
          planned_date: day0 ? new Date(day0.getTime() + i * 86400000).toISOString().slice(0, 10) : null,
        })),
      ),
    );
  }
  return journey.id;
}

export async function listJourneyDays(journeyId: string) {
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
  return must(
    await supabase.from('user_stamps').select('id, place_name, stamped_at, verified, method').eq('user_id', userId).is('deleted_at', null).order('stamped_at', { ascending: false }),
  ) as Stamp[];
}

export async function listMyPosts(userId: string) {
  return must(
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
}

/** Text journal post (photos come with the media upload flow). Followers only by default. */
export async function createJournalPost(opts: { userId: string; body: string; journeyId: string | null; routeId: string | null; placeName?: string | null; visibility?: 'followers' | 'public' }) {
  return must(
    await supabase
      .from('posts')
      .insert({ user_id: opts.userId, kind: 'journal', visibility: opts.visibility ?? 'followers', status: 'published', body: opts.body, place_name: opts.placeName ?? null, journey_id: opts.journeyId, route_id: opts.routeId, client_created_at: new Date().toISOString() })
      .select('id')
      .single(),
  ) as { id: string };
}

export type Friend = { id: string; username: string | null; display_name: string | null; avatar_url: string | null; km_walked: number | null };
/** People you follow (accepted). */
export async function listFriends(userId: string) {
  const rows = must(
    await supabase
      .from('follows')
      .select('friend:profiles!followee_id(id, username, display_name, avatar_url, km_walked)')
      .eq('follower_id', userId)
      .eq('status', 'accepted'),
  ) as unknown as { friend: Friend | null }[];
  return rows.map((r) => r.friend).filter((f): f is Friend => !!f);
}

export type PickedMedia = { uri: string; type: 'image' | 'video'; mimeType?: string | null; width?: number; height?: number; durationMs?: number | null; fileSize?: number | null };

/** Upload photos/videos of a post to the private user-media bucket and register them in post_media.
 *  Returns how many failed (cloud storage quota is 0 on the free plan, so uploads can be refused). */
export async function uploadPostMedia(userId: string, postId: string, items: PickedMedia[]) {
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
