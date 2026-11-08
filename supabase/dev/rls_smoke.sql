-- RLS / trigger smoke test. Runs after migrations + seed (see validate.sh).
-- Uses request.jwt.claims like PostgREST does, so it also works on a
-- Supabase branch database (run as postgres, then roll back).
\set ON_ERROR_STOP 1

-- Users: A (Google style metadata), B (email), C (email that collides with A's username)
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'ana.garcia@gmail.com', '{"full_name": "Ana Garcia", "avatar_url": "https://example.com/a.png"}'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'ben@example.com', '{}'),
  ('cccccccc-0000-0000-0000-000000000003', 'ana.garcia@example.com', '{}');

do $$
begin
  assert (select username from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'ana.garcia', 'username from email';
  assert (select display_name from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'Ana Garcia', 'google full_name';
  assert (select avatar_url from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'https://example.com/a.png', 'google avatar';
  assert (select username from public.profiles where id = 'cccccccc-0000-0000-0000-000000000003') <> 'ana.garcia', 'username collision resolved';
  assert (select count(*) from public.user_settings) = 3, 'settings rows';
  assert (select count(*) from public.storage_usage) = 3, 'storage usage rows';
  assert (select count(*) from public.subscriptions where status = 'none') = 3, 'subscription rows';
end $$;

-- Fixture for the offline pack checks below. The seed ships no pack (a demo row would point at a
-- file that does not exist); the pipeline registers real ones with register_offline_pack().
insert into public.offline_packs (route_id, stage_id, kind, format, version, url, size_bytes, sha256) values
  ('20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'tiles', 'pmtiles', 1,
   'supabase://offline-packs/test/rls-smoke-tiles-v1.pmtiles', 3145728, repeat('ab', 32));

-- ---------------------------------------------------------------- user A
begin;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "role": "authenticated"}', true);
set local role authenticated;

-- cannot cheat XP, can edit bio
update public.profiles set xp = 99999, bio = 'Buen Camino!' where id = auth.uid();
do $$ begin
  assert (select xp from public.profiles where id = auth.uid()) = 0, 'xp is protected';
  assert (select bio from public.profiles where id = auth.uid()) = 'Buen Camino!', 'bio editable';
end $$;

-- offline outbox style upsert of a post with a client generated id, forged counters
insert into public.posts (id, kind, visibility, body, like_count, client_created_at)
values ('d0000000-0000-0000-0000-000000000001', 'photo', 'public', 'Day 1 over the Pyrenees', 500, now() - interval '3 hours')
on conflict (id) do update set body = excluded.body, like_count = excluded.like_count;
insert into public.posts (id, kind, visibility, body, like_count)
values ('d0000000-0000-0000-0000-000000000001', 'photo', 'public', 'Day 1 over the Pyrenees (edited)', 900)
on conflict (id) do update set body = excluded.body, like_count = excluded.like_count;
insert into public.posts (id, kind, visibility, body) values
  ('d0000000-0000-0000-0000-000000000002', 'journal', 'private', 'My private notes');
insert into public.post_media (post_id, media_type, storage_path)
values ('d0000000-0000-0000-0000-000000000001', 'image', 'aaaaaaaa-0000-0000-0000-000000000001/posts/p1.jpg');
do $$ begin
  assert (select like_count from public.posts where id = 'd0000000-0000-0000-0000-000000000001') = 0, 'like_count protected';
  assert (select body from public.posts where id = 'd0000000-0000-0000-0000-000000000001') like '%edited%', 'upsert works';
  assert (select media_count from public.posts where id = 'd0000000-0000-0000-0000-000000000001') = 1, 'media counter';
end $$;

-- cannot attach media stored in someone else's folder
do $$ begin
  begin
    insert into public.post_media (post_id, media_type, storage_path)
    values ('d0000000-0000-0000-0000-000000000001', 'image', 'bbbbbbbb-0000-0000-0000-000000000002/x.jpg');
    raise exception 'foreign storage path accepted';
  exception when insufficient_privilege then null;
  end;
end $$;

-- passport stamp near the Roncesvalles albergue -> verified + XP + achievement
insert into public.journeys (id, route_id, status, visibility)
values ('e0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'active', 'public');
insert into public.user_stamps (journey_id, stay_id, location, stamped_at, verified)
values ('e0000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001',
        'SRID=4326;POINT(-1.3196 43.0090)', now(), false);
insert into public.user_stamps (journey_id, place_name, location, stamped_at, verified)
values ('e0000000-0000-0000-0000-000000000001', 'Somewhere', 'SRID=4326;POINT(-1.5 42.9)', now(), true);
do $$ begin
  assert (select count(*) from public.user_stamps where verified) = 1, 'only the near stamp is verified';
  assert (select stamps_count from public.profiles where id = auth.uid()) = 2, 'stamps counter';
  assert (select xp from public.profiles where id = auth.uid()) = 10 + 2 + 50, 'stamp xp + first-stamp achievement';
end $$;

-- plan: finishing a day gives XP and km
insert into public.journey_days (id, journey_id, day_number, stage_id, planned_distance_km, status)
values ('e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 1,
        '40000000-0000-0000-0000-000000000001', 24.2, 'done');
do $$ begin
  assert (select walked_km from public.journeys where id = 'e0000000-0000-0000-0000-000000000001') = 24.2, 'walked km';
  assert (select km_walked from public.profiles where id = auth.uid()) = 24.2, 'profile km';
end $$;

-- scavenger hunt
do $$
declare r jsonb;
begin
  r := public.complete_hunt_step('71000000-0000-0000-0000-000000000001', 43.0, -1.5);
  assert (r ->> 'ok')::boolean = false, 'too far away fails';
  r := public.complete_hunt_step('71000000-0000-0000-0000-000000000001', 43.0093, -1.3194);
  assert (r ->> 'ok')::boolean and (r ->> 'remaining_steps')::int = 1, 'gps step ok';
  r := public.complete_hunt_step('71000000-0000-0000-0000-000000000001', 43.0093, -1.3194);
  assert (r ->> 'already_completed')::boolean, 'idempotent replay';
  r := public.complete_hunt_step('71000000-0000-0000-0000-000000000002', p_answer => '12');
  assert (r ->> 'ok')::boolean = false, 'wrong answer';
  r := public.complete_hunt_step('71000000-0000-0000-0000-000000000002', p_answer => ' 790 ');
  assert (r ->> 'hunt_completed')::boolean, 'hunt completed';
  assert (select status from public.hunt_progress where user_id = auth.uid()) = 'completed', 'progress completed';
  assert exists (select 1 from public.user_achievements ua join public.achievements a on a.id = ua.achievement_id
                 where a.slug = 'roncesvalles-hunt' and ua.user_id = auth.uid()), 'hunt badge';
end $$;

-- secret answers are not readable
do $$ begin
  begin
    perform * from private.hunt_step_answers;
    raise exception 'answers readable';
  exception when insufficient_privilege then null;
  end;
end $$;

-- crowd report gets an expiry
insert into public.crowd_reports (id, kind, stay_id, location, confirm_count)
values ('c0000000-0000-0000-0000-000000000001', 'beds_full', '60000000-0000-0000-0000-000000000001',
        'SRID=4326;POINT(-1.3197 43.0089)', 42);
do $$ begin
  assert (select expires_at between now() + interval '11 hours' and now() + interval '13 hours'
          from public.crowd_reports where id = 'c0000000-0000-0000-0000-000000000001'), 'beds_full ttl ~12h';
  assert (select confirm_count from public.crowd_reports where id = 'c0000000-0000-0000-0000-000000000001') = 0, 'votes protected';
end $$;

-- health data
insert into public.health_daily (day, source, steps, avg_hr) values (current_date, 'apple_health', 31000, 98);

-- stays search
do $$ begin
  assert (select count(*) from public.search_stays(43.0094, -1.3195, 2000)) = 1, 'search finds the albergue';
  assert (select count(*) from public.search_stays(43.0094, -1.3195, 2000, p_max_price => 10)) = 0, 'price filter';
  assert (select count(*) from public.search_stays(43.0094, -1.3195, 2000, p_labels => '{pilgrims_only}')) = 1, 'label filter';
  assert (select count(*) from public.nearby_pois(43.0094, -1.3195, 1000)) = 1, 'nearby pois';
end $$;

-- storage: no plan, free quota is 500 MB (migration 20261114030000): a small file gets in, a pilgrim cannot write into
-- somebody else's folder, and once the quota is used up the next upload is blocked
do $$ begin
  assert (public.get_my_storage() ->> 'quota_bytes')::bigint = 500000000, 'free quota is 500 MB';
  insert into storage.objects (bucket_id, name, metadata)
  values ('user-media', 'aaaaaaaa-0000-0000-0000-000000000001/posts/free1.jpg', '{"size": 1000}');
  begin
    insert into storage.objects (bucket_id, name, metadata)
    values ('user-media', 'bbbbbbbb-0000-0000-0000-000000000002/posts/not-mine.jpg', '{"size": 1000}');
    raise exception 'upload into somebody else''s folder allowed';
  exception when insufficient_privilege then null;
  end;
  insert into storage.objects (bucket_id, name, metadata)
  values ('user-media', 'aaaaaaaa-0000-0000-0000-000000000001/posts/free2.mp4', '{"size": 500000000}');   -- room was left: the last file may overshoot
  begin
    insert into storage.objects (bucket_id, name, metadata)
    values ('user-media', 'aaaaaaaa-0000-0000-0000-000000000001/posts/free3.jpg', '{"size": 1000}');
    raise exception 'upload allowed over the free quota';
  exception when insufficient_privilege then null;
  end;
  -- leave nothing behind: the checks below count A's files
  delete from storage.objects where bucket_id = 'user-media' and name like 'aaaaaaaa-0000-0000-0000-000000000001/posts/free%';
  assert (select count(*) from storage.objects where bucket_id = 'user-media' and name like 'aaaaaaaa-0000-0000-0000-000000000001/posts/free%') = 0, 'the free-quota test files are gone';
end $$;

-- free plan: no route downloads, but the catalog (without URLs) is visible
do $$ begin
  assert (select count(*) from public.offline_packs) = 0, 'free user cannot read pack URLs';
  assert (select count(*) from public.offline_pack_catalog('20000000-0000-0000-0000-000000000001')) = 1, 'catalog visible';
  assert (public.get_my_entitlements() ->> 'can_download_routes')::boolean = false, 'free cannot download';
end $$;

-- cannot grant yourself a subscription
do $$ begin
  begin
    update public.subscriptions set status = 'active' where user_id = auth.uid();
    raise exception 'subscription writable';
  exception when insufficient_privilege then null;
  end;
end $$;
commit;

-- RevenueCat webhook (service role) activates A's plan
update public.subscriptions set status = 'active', product_id = 'plus_yearly', store = 'app_store',
  will_renew = true, expires_at = now() + interval '1 year'
where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
insert into public.storage_addons (user_id, product_id, storage_bytes, transaction_id, expires_at)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'storage_addon_yearly', 10000000000, 'tx-1', now() + interval '1 year');

begin;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "role": "authenticated"}', true);
set local role authenticated;
insert into storage.objects (bucket_id, name, metadata)
values ('user-media', 'aaaaaaaa-0000-0000-0000-000000000001/posts/p1.jpg', '{"size": 1000}');
do $$
declare s jsonb;
begin
  s := public.refresh_my_storage_usage();
  assert (s ->> 'has_plus')::boolean, 'plus active';
  assert (s ->> 'quota_bytes')::bigint = 20000000000, '10 GB plan + 10 GB add-on';
  assert (s ->> 'used_bytes')::bigint = 1000, 'usage counted';
  assert (select count(*) from public.offline_packs) = 1, 'plus user reads pack URLs';
  assert (public.get_my_entitlements() ->> 'plan') = 'plus', 'plus entitlement';
end $$;
-- A goes private
update public.profiles set is_private = true where id = auth.uid();
commit;

-- ---------------------------------------------------------------- user B
begin;
select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-0000-0000-0000-000000000002", "role": "authenticated"}', true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.posts) = 0, 'private account hides public posts from non-followers';
  assert (select count(*) from public.health_daily) = 0, 'health is owner only';
  assert (select count(*) from public.storage_usage) = 1, 'only own storage usage';
  assert (select count(*) from public.crowd_reports) = 1, 'crowd reports are shared';
  assert (select count(*) from storage.objects) = 0, 'cannot see media of hidden posts';
end $$;
insert into public.follows (followee_id) values ('aaaaaaaa-0000-0000-0000-000000000001');
do $$ begin
  assert (select status from public.follows where follower_id = auth.uid()) = 'pending', 'follow request pending';
end $$;
commit;

begin;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "role": "authenticated"}', true);
set local role authenticated;
update public.follows set status = 'accepted' where followee_id = auth.uid();
do $$ begin
  assert (select followers_count from public.profiles where id = auth.uid()) = 1, 'followers counter';
end $$;
commit;

begin;
select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-0000-0000-0000-000000000002", "role": "authenticated"}', true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.posts) = 1, 'follower sees the public post but not the private journal';
  assert (select count(*) from storage.objects) = 1, 'follower can read the post photo';
  assert (select count(*) from public.user_stamps) = 2, 'follower sees passport of a public journey';
end $$;
insert into public.post_likes (post_id) values ('d0000000-0000-0000-0000-000000000001');
insert into public.post_comments (post_id, body) values ('d0000000-0000-0000-0000-000000000001', 'Ultreia!');
insert into public.crowd_report_votes (report_id, vote) values ('c0000000-0000-0000-0000-000000000001', 1);
do $$ begin
  assert (select like_count from public.posts where id = 'd0000000-0000-0000-0000-000000000001') = 1, 'like counter';
  assert (select comment_count from public.posts where id = 'd0000000-0000-0000-0000-000000000001') = 1, 'comment counter';
  assert (select confirm_count from public.crowd_reports where id = 'c0000000-0000-0000-0000-000000000001') = 1, 'vote counter';
end $$;
commit;

-- A blocks B -> B loses access
begin;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "role": "authenticated"}', true);
set local role authenticated;
insert into public.blocks (blocked_id) values ('bbbbbbbb-0000-0000-0000-000000000002');
commit;
begin;
select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-0000-0000-0000-000000000002", "role": "authenticated"}', true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.posts) = 0, 'blocked user sees no posts';
  assert (select count(*) from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0, 'blocked user cannot see profile';
  assert (select count(*) from public.follows) = 0, 'block removed follows';
end $$;
commit;

-- ---------------------------------------------------------------- anon
begin;
select set_config('request.jwt.claims', '', true);
set local role anon;
do $$ begin
  assert (select count(*) from public.routes) = 15, 'anon reads routes (2 seeded + 13 from more_caminos)';
  assert (select count(*) from public.stays) = 1, 'anon reads stays';
  begin
    perform count(*) from public.posts;
    raise exception 'anon read posts';
  exception when insufficient_privilege then null;
  end;
end $$;
commit;

\echo 'rls_smoke: all assertions passed'
