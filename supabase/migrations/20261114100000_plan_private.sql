-- =============================================================================
-- CaminoPlus: the plan, the stamps and the GPS tracks belong to their owner alone
--
-- WHY. The owner's rule: friends (and followers) see only a pilgrim's JOURNEY: the posts the pilgrim
-- publishes, the profile card and its counters, and the journey row (route, status) as its visibility
-- setting says. The PLAN (every day: dates, from/to, stay, booking status, the notes of the day), the
-- passport STAMPS (note, place, photo, GPS point) and the GPS TRACKS are private. They can only be shown
-- to somebody else through a share link that opens ONE plan (20261114100100_share_links.sql).
--
-- Until now three SELECT policies of 20261104150500_me_journey.sql let anybody for whom
-- private.can_see_journey(journey_id) is true read every column of these rows. can_see() counts a friend
-- AND a follower (a follow of a non-private profile is accepted at once), and journeys default to
-- visibility 'followers', so in practice any pilgrim who tapped Follow could read the whole plan,
-- the notes of each day, the stamps and the tracks.
--
-- WHAT. Not destructive: no row and no column is removed or changed.
--   1. journey_days, user_stamps and tracks: the SELECT policy becomes "owner only".
--   2. anon loses its (unused) table grants on the three tables. anon had no policy, so it could read
--      nothing already; this is defence in depth.
--   INSERT and UPDATE policies are NOT touched (DELETE stays revoked from the API roles, as before).
--   The storage policy "read user media" calls private.can_read_user_media(), a SECURITY INVOKER
--   function that looks up user_stamps under the caller's row level security: once the stamp rows are
--   owner only, a stamp PHOTO is readable by its owner only too. No storage policy is changed.
--
-- AUDIT (every policy, view and SECURITY DEFINER function that reads a private table; read on the live
-- database on 2026-11-08 from pg_policies and pg_proc; there are no views in public or private):
--
--   object                                   who can read today              after this migration
--   ---------------------------------------  ------------------------------  -----------------------------
--   journey_days (plan + notes of the day)   owner, friends, followers,      owner only
--     policy "plan follows journey            everybody signed in when the
--     visibility"                             journey and profile are public
--   user_stamps (note, place, GPS, photo)    same as above                    owner only
--     policy "passport follows journey visibility"
--   tracks (GPS geometry)                    same as above                    owner only
--     policy "tracks follow journey visibility"
--   storage user-media: stamp photos         same as above (via the stamp     owner only (via the stamp
--     ("read user media" ->                  row)                             row; no policy changed)
--     can_read_user_media, invoker)
--   journey_private (credential number,      owner only                       owner only (unchanged)
--     journey notes)
--   health_daily, health_workouts,           owner only                       owner only (unchanged)
--     wearable_connections
--   journeys (route, status, title,          owner + can_see(visibility)      unchanged: this is the
--     planned dates and km, walked km)                                        "journey" (see NOT COVERED)
--   posts, post_media (+ their photos)       owner + can_see(visibility)      unchanged: published journey
--   profiles (card and counters)             every signed-in person not       unchanged (see NOT COVERED)
--                                            blocked, also for private
--                                            profiles
--   user_achievements (badges)               owner + can_see(owner,'public')  unchanged: profile card
--   private.can_see_journey (DEFINER)        used only by the 3 policies      no longer used by a policy;
--                                            above                            kept, granted as before
--   private.journey_progress (DEFINER)       counts only, not granted to      unchanged
--                                            the API roles
--   private.recompute_journey_km, *_after_   triggers / server only           unchanged
--     write, *_limits (DEFINER)
--   public.export_my_data (DEFINER)          the caller's own rows only       unchanged here
--   public.start_journey (INVOKER)           writes the caller's own plan     unchanged
--   private.owns_journey_day (INVOKER)       checks the caller's own day      unchanged
--   The notes and the diary of the app are not on the server at all (they stay on the phone).
--   None of the friend-facing functions (list_friends, search_pilgrims, list_friend_requests,
--   list_conversations, ...) reads journey_days, user_stamps or tracks.
--
-- NOT COVERED (listed for the owner, out of scope tonight):
--   * profiles: every column of a PRIVATE profile is readable by any signed-in person who is not
--     blocked (the app shows a minimal card; the database does not enforce that).
--   * journeys: a follower can still read planned_start_date, planned_end_date, planned_distance_km
--     and walked_km of a journey whose visibility allows it.
--   * posts: a post's health_summary and location are readable by whoever may read the post (the
--     friend screen never asks for them).
--
-- Who reads these tables in the app (grep of mobile/ and supabase/functions, 2026-11-08): only the
-- owner's own rows: mobile/src/lib/api.ts listJourneyDays (the current journey of the signed-in
-- pilgrim) and listMyStamps(uid of the signed-in pilgrim), mobile/src/features/places/api.ts
-- getPlanStage (own journey). The friend profile (mobile/app/pilgrim/[id].tsx, src/features/pilgrim)
-- reads profiles, friendships and posts only. No edge function reads them.
--
-- Tests: supabase/dev/plan_private_smoke.sql (friend, follower, stranger, anon, owner, writes).
-- Idempotent: drop policy if exists + create.
-- =============================================================================

drop policy if exists "plan follows journey visibility" on public.journey_days;
drop policy if exists "plan: owner only" on public.journey_days;
create policy "plan: owner only" on public.journey_days for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "passport follows journey visibility" on public.user_stamps;
drop policy if exists "stamps: owner only" on public.user_stamps;
create policy "stamps: owner only" on public.user_stamps for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "tracks follow journey visibility" on public.tracks;
drop policy if exists "tracks: owner only" on public.tracks;
create policy "tracks: owner only" on public.tracks for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.journey_days, public.user_stamps, public.tracks from anon;

comment on policy "plan: owner only" on public.journey_days is
  'The plan and the notes of each day are private. Share ONE plan with public.create_share_link(''plan'', ...).';
comment on policy "stamps: owner only" on public.user_stamps is
  'Stamp notes, places, GPS points and photos are private. The profile card shows only profiles.stamps_count.';
comment on policy "tracks: owner only" on public.tracks is 'GPS tracks are private.';
