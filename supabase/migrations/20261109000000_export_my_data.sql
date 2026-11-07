-- =============================================================================
-- CaminoPlus 14: "Download my data" (Settings > Account)
--
-- One call returns everything the signed-in person has put into CaminoPlus, as JSON the app
-- hands to the share sheet. Only the caller's own rows are read (auth.uid()); other people appear
-- only as ids (friends, followers, chat senders). Payments are not included: RevenueCat holds those.
-- =============================================================================

create or replace function public.export_my_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  return jsonb_build_object(
    'exported_at', now(),
    'user_id', v_uid,
    'profile',        (select to_jsonb(t) from public.profiles t where t.id = v_uid),
    'settings',       (select to_jsonb(t) from public.user_settings t where t.user_id = v_uid),
    'journeys',       coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.journeys t where t.user_id = v_uid), '[]'),
    'journey_days',   coalesce((select jsonb_agg(to_jsonb(t)) from public.journey_days t where t.user_id = v_uid), '[]'),
    'journey_private',coalesce((select jsonb_agg(to_jsonb(t)) from public.journey_private t where t.user_id = v_uid), '[]'),
    'stamps',         coalesce((select jsonb_agg(to_jsonb(t)) from public.user_stamps t where t.user_id = v_uid), '[]'),
    'tracks',         coalesce((select jsonb_agg(to_jsonb(t)) from public.tracks t where t.user_id = v_uid), '[]'),
    'posts',          coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.posts t where t.user_id = v_uid), '[]'),
    'comments',       coalesce((select jsonb_agg(to_jsonb(t)) from public.post_comments t where t.user_id = v_uid), '[]'),
    'likes',          coalesce((select jsonb_agg(to_jsonb(t)) from public.post_likes t where t.user_id = v_uid), '[]'),
    'saved_posts',    coalesce((select jsonb_agg(to_jsonb(t)) from public.post_saves t where t.user_id = v_uid), '[]'),
    'favorites',      coalesce((select jsonb_agg(to_jsonb(t)) from public.favorites t where t.user_id = v_uid), '[]'),
    'stay_reviews',   coalesce((select jsonb_agg(to_jsonb(t)) from public.stay_reviews t where t.user_id = v_uid), '[]'),
    'crowd_reports',  coalesce((select jsonb_agg(to_jsonb(t)) from public.crowd_reports t where t.user_id = v_uid), '[]'),
    'friendships',    coalesce((select jsonb_agg(to_jsonb(t)) from public.friendships t where v_uid in (t.user_a, t.user_b)), '[]'),
    'following',      coalesce((select jsonb_agg(t.followee_id) from public.follows t where t.follower_id = v_uid), '[]'),
    'followers',      coalesce((select jsonb_agg(t.follower_id) from public.follows t where t.followee_id = v_uid), '[]'),
    'messages_sent',  coalesce((select jsonb_agg(to_jsonb(t)) from (select * from public.messages m where m.sender_id = v_uid order by m.created_at desc limit 5000) t), '[]'),
    'health_daily',   coalesce((select jsonb_agg(to_jsonb(t)) from public.health_daily t where t.user_id = v_uid), '[]'),
    'health_workouts',coalesce((select jsonb_agg(to_jsonb(t)) from public.health_workouts t where t.user_id = v_uid), '[]'),
    'achievements',   coalesce((select jsonb_agg(to_jsonb(t)) from public.user_achievements t where t.user_id = v_uid), '[]'),
    'xp_events',      coalesce((select jsonb_agg(to_jsonb(t)) from public.xp_events t where t.user_id = v_uid), '[]')
  );
end;
$$;

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
