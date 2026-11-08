-- The plan, the stamps and the tracks are the owner's alone (migration 20261114100000_plan_private).
-- Self-contained: creates its own users (ids start with 1f) and removes them at the end. Acts as signed-in
-- people the way PostgREST does (request.jwt.claims + set local role).
--
--   1. the migration can be run a second time; exactly one SELECT policy per table, and it is owner only;
--      the INSERT and UPDATE policies are the ones of before
--   2. olga's journey is PUBLIC and her profile is public (the widest case): a friend, a follower, a
--      stranger and anon read none of her plan, day notes, stamps (nor a stamp photo) and tracks
--   3. the owner still reads and writes all of it
--   4. the journey a friend sees is still there: the profile card, the friendship, the published posts
--      (the exact queries of mobile/src/features/pilgrim/api.ts), the post photo, the journey row
\set ON_ERROR_STOP 1

drop schema if exists plan_test cascade;
create schema plan_test;
grant usage on schema plan_test to anon, authenticated;

delete from auth.users where id::text like '1f%';

create table plan_test.users (name text primary key, id uuid not null);
insert into plan_test.users (name, id) values
  ('olga', '1f000000-0000-0000-0000-000000000001'),   -- the owner
  ('fred', '1f000000-0000-0000-0000-000000000002'),   -- olga's friend (accepted friendship)
  ('fola', '1f000000-0000-0000-0000-000000000003'),   -- follows olga (accepted at once: olga is not private)
  ('sam',  '1f000000-0000-0000-0000-000000000004');   -- a stranger, signed in
grant select on plan_test.users to anon, authenticated;

create function plan_test.u(p_name text) returns uuid language sql stable as $$
  select id from plan_test.users where name = p_name
$$;
create function plan_test.login(p_name text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', plan_test.u(p_name), 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;
create function plan_test.anon() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
end $$;
create function plan_test.logout() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;
-- how many rows of olga's private tables the current role can read, all three together
create function plan_test.private_rows() returns integer language sql as $$
  select ((select count(*) from public.journey_days where user_id = plan_test.u('olga'))
        + (select count(*) from public.user_stamps where user_id = plan_test.u('olga'))
        + (select count(*) from public.tracks where user_id = plan_test.u('olga')))::int
$$;
grant execute on all functions in schema plan_test to anon, authenticated;

-- ---------------------------------------------------------------- people and olga's journey
insert into auth.users (id, email, raw_user_meta_data)
select id, 'zz1f.' || name || '@example.com', jsonb_build_object('full_name', initcap(name) || ' Zzplan') from plan_test.users;
insert into public.friendships (user_a, user_b, requested_by, status, responded_at)
values (least(plan_test.u('olga'), plan_test.u('fred')), greatest(plan_test.u('olga'), plan_test.u('fred')), plan_test.u('fred'), 'accepted', now());

begin;
select plan_test.login('fola');
insert into public.follows (followee_id) values (plan_test.u('olga'));
select plan_test.login('olga');
insert into public.journeys (id, route_id, status, visibility)
values ('1f100000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'active', 'public');
insert into public.journey_days (id, journey_id, day_number, planned_date, from_name, to_name, planned_distance_km, stay_id, booking_status, notes)
values ('1f200000-0000-0000-0000-000000000001', '1f100000-0000-0000-0000-000000000001', 1, '2026-12-01', 'Saint-Jean', 'Roncesvalles', 24.2,
        '60000000-0000-0000-0000-000000000001', 'confirmed', 'secret: door code 4711');
insert into public.user_stamps (id, journey_id, journey_day_id, place_name, stamped_at, note, photo_path)
values ('1f300000-0000-0000-0000-000000000001', '1f100000-0000-0000-0000-000000000001', '1f200000-0000-0000-0000-000000000001',
        'Roncesvalles', now(), 'secret stamp note', '1f000000-0000-0000-0000-000000000001/stamps/s1.jpg');
insert into public.tracks (id, journey_id, journey_day_id, started_at, distance_m)
values ('1f400000-0000-0000-0000-000000000001', '1f100000-0000-0000-0000-000000000001', '1f200000-0000-0000-0000-000000000001', now() - interval '1 hour', 24200);
insert into public.posts (id, kind, visibility, body, journey_id) values
  ('1f500000-0000-0000-0000-000000000001', 'journal', 'public', 'olga for everybody', '1f100000-0000-0000-0000-000000000001'),
  ('1f500000-0000-0000-0000-000000000002', 'journal', 'followers', 'olga for friends', '1f100000-0000-0000-0000-000000000001');
insert into public.post_media (post_id, media_type, storage_path)
values ('1f500000-0000-0000-0000-000000000001', 'image', '1f000000-0000-0000-0000-000000000001/posts/p1.jpg');
commit;
-- the files themselves (written by the server here; the quota is not what this test is about)
insert into storage.objects (bucket_id, name, metadata) values
  ('user-media', '1f000000-0000-0000-0000-000000000001/stamps/s1.jpg', '{"size": 1000}'),
  ('user-media', '1f000000-0000-0000-0000-000000000001/posts/p1.jpg', '{"size": 1000}');

-- =============================================================================
-- 1. THE MIGRATION, AGAIN, AND THE POLICIES
-- =============================================================================
\echo '== plan private: the migration is re-runnable and the policies are the right ones'
\ir ../migrations/20261114100000_plan_private.sql
do $$
declare
  t text;
begin
  foreach t in array array['journey_days', 'user_stamps', 'tracks'] loop
    assert (select count(*) from pg_policies where schemaname = 'public' and tablename = t and cmd in ('SELECT', 'ALL')) = 1,
      t || ': exactly one policy that reads';
    assert (select qual from pg_policies where schemaname = 'public' and tablename = t and cmd = 'SELECT')
           = '(user_id = ( SELECT auth.uid() AS uid))', t || ': and it is owner only';
    assert not has_table_privilege('anon', 'public.' || t, 'select'), t || ': anon has no privilege';
    assert not has_table_privilege('authenticated', 'public.' || t, 'delete'), t || ': nobody deletes through the API (as before)';
  end loop;
  -- the writes are those of before (20261104150500_me_journey + 20261107000000_integrity_privacy)
  assert (select array_agg(policyname || ':' || cmd order by policyname) from pg_policies where schemaname = 'public' and tablename = 'journey_days' and cmd <> 'SELECT')
         = array['edit own days:UPDATE', 'plan own days:INSERT'], 'journey_days writes unchanged';
  assert (select array_agg(policyname || ':' || cmd order by policyname) from pg_policies where schemaname = 'public' and tablename = 'user_stamps' and cmd <> 'SELECT')
         = array['collect own stamps:INSERT', 'edit own stamps:UPDATE'], 'user_stamps writes unchanged';
  assert (select array_agg(policyname || ':' || cmd order by policyname) from pg_policies where schemaname = 'public' and tablename = 'tracks' and cmd <> 'SELECT')
         = array['edit own tracks:UPDATE', 'record own tracks:INSERT'], 'tracks writes unchanged';
  assert (select with_check from pg_policies where tablename = 'user_stamps' and policyname = 'collect own stamps') like '%owns_journey_day%',
    'the stamp insert still checks the journey and day';
  assert (select with_check from pg_policies where tablename = 'tracks' and policyname = 'record own tracks') like '%owns_journey_day%',
    'the track insert still checks the journey and day';
end $$;

-- =============================================================================
-- 2. NOBODY BUT OLGA READS THE PLAN, THE STAMPS, THE TRACKS
-- =============================================================================
\echo '== plan private: a friend, a follower, a stranger and anon read none of it'
begin;
select plan_test.logout();
do $$ begin
  assert private.is_friend(plan_test.u('fred'), plan_test.u('olga')), 'fred is a friend';
  assert private.is_follower(plan_test.u('fola'), plan_test.u('olga')), 'fola is a follower';
  assert (select count(*) from public.journey_days where user_id = plan_test.u('olga')) = 1, 'the plan exists';
end $$;
select plan_test.login('fred');
do $$ begin
  assert private.can_see_journey('1f100000-0000-0000-0000-000000000001'), 'the friend may see the journey (the old rule would have shown the plan)';
  assert plan_test.private_rows() = 0, 'friend: no plan, no stamp, no track';
  assert (select count(*) from public.journey_days where journey_id = '1f100000-0000-0000-0000-000000000001') = 0, 'friend: not by journey either';
  assert (select count(*) from public.journey_days where notes like '%4711%') = 0, 'friend: the note of the day stays hidden';
  assert (select count(*) from storage.objects where name like '1f000000-0000-0000-0000-000000000001/stamps/%') = 0, 'friend: no stamp photo';
end $$;
-- a write to a row you cannot see changes nothing
update public.journey_days set notes = 'hacked' where id = '1f200000-0000-0000-0000-000000000001';
update public.user_stamps set note = 'hacked' where id = '1f300000-0000-0000-0000-000000000001';
update public.tracks set distance_m = 1 where id = '1f400000-0000-0000-0000-000000000001';
select plan_test.login('fola');
do $$ begin
  assert plan_test.private_rows() = 0, 'follower: no plan, no stamp, no track';
  assert (select count(*) from storage.objects where name like '1f000000-0000-0000-0000-000000000001/stamps/%') = 0, 'follower: no stamp photo';
end $$;
select plan_test.login('sam');
do $$ begin
  assert plan_test.private_rows() = 0, 'stranger: no plan, no stamp, no track (the journey is public!)';
  assert (select count(*) from storage.objects where name like '1f000000-0000-0000-0000-000000000001/stamps/%') = 0, 'stranger: no stamp photo';
end $$;
select plan_test.anon();
do $$
begin
  begin
    perform count(*) from public.journey_days;
    raise exception 'anon could select from journey_days';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from public.user_stamps;
    raise exception 'anon could select from user_stamps';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from public.tracks;
    raise exception 'anon could select from tracks';
  exception when insufficient_privilege then null;
  end;
end $$;
select plan_test.logout();
do $$ begin
  assert (select notes from public.journey_days where id = '1f200000-0000-0000-0000-000000000001') = 'secret: door code 4711', 'the friend changed nothing';
  assert (select note from public.user_stamps where id = '1f300000-0000-0000-0000-000000000001') = 'secret stamp note', 'nor the stamp';
  assert (select distance_m from public.tracks where id = '1f400000-0000-0000-0000-000000000001') = 24200, 'nor the track';
end $$;
rollback;

-- =============================================================================
-- 3. OLGA STILL HAS ALL OF IT
-- =============================================================================
\echo '== plan private: the owner reads and writes as before'
begin;
select plan_test.login('olga');
do $$ begin
  assert plan_test.private_rows() = 3, 'owner: the day, the stamp, the track';
  assert (select notes from public.journey_days where id = '1f200000-0000-0000-0000-000000000001') = 'secret: door code 4711', 'owner reads the note of the day';
  assert (select count(*) from storage.objects where name = '1f000000-0000-0000-0000-000000000001/stamps/s1.jpg') = 1, 'owner reads the stamp photo';
end $$;
update public.journey_days set notes = 'new note', status = 'done' where id = '1f200000-0000-0000-0000-000000000001';
update public.user_stamps set note = 'new stamp note' where id = '1f300000-0000-0000-0000-000000000001';
update public.tracks set distance_m = 25000 where id = '1f400000-0000-0000-0000-000000000001';
insert into public.journey_days (journey_id, day_number, from_name, to_name) values ('1f100000-0000-0000-0000-000000000001', 2, 'Roncesvalles', 'Zubiri');
do $$ begin
  assert (select notes from public.journey_days where id = '1f200000-0000-0000-0000-000000000001') = 'new note', 'owner edits the plan';
  assert (select note from public.user_stamps where id = '1f300000-0000-0000-0000-000000000001') = 'new stamp note', 'owner edits a stamp';
  assert (select distance_m from public.tracks where id = '1f400000-0000-0000-0000-000000000001') = 25000, 'owner edits a track';
  assert (select count(*) from public.journey_days where journey_id = '1f100000-0000-0000-0000-000000000001') = 2, 'owner adds a day';
  -- the Me tab query (mobile/src/lib/api.ts listJourneyDays) and the plan-stage query (features/places/api.ts)
  assert (select count(*) from (select id, day_number, planned_date, from_name, to_name, planned_distance_km, actual_distance_km, started_at, finished_at, notes, status
                                from public.journey_days where journey_id = '1f100000-0000-0000-0000-000000000001' and deleted_at is null order by day_number) q) = 2, 'the Me tab plan';
  assert (select count(*) from public.user_stamps where user_id = plan_test.u('olga') and deleted_at is null) = 1, 'the Me tab stamps';
  assert (select (public.export_my_data() -> 'journey_days') ->> 0 is not null), 'export still has the plan';
end $$;
-- a friend cannot add a day to olga's plan (unchanged)
select plan_test.login('fred');
do $$ begin
  begin
    insert into public.journey_days (journey_id, day_number, user_id) values ('1f100000-0000-0000-0000-000000000001', 9, plan_test.u('olga'));
    raise exception 'a friend added a day to the plan';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- =============================================================================
-- 4. THE JOURNEY A FRIEND SEES IS STILL THERE
-- =============================================================================
\echo '== plan private: the friend profile and its Journey grid still work'
begin;
select plan_test.login('fred');
do $$ begin
  -- PILGRIM_COLS of mobile/src/features/pilgrim/api.ts
  assert (select count(*) from (select id, username, display_name, bio, avatar_url, is_private, km_walked, posts_count, stamps_count
                                from public.profiles where id = plan_test.u('olga')) q) = 1, 'the profile card';
  assert (select stamps_count from public.profiles where id = plan_test.u('olga')) = 1, 'the counter of stamps is on the card';
  -- FRIENDSHIP_COLS
  assert (select status from public.friendships where plan_test.u('olga') in (user_a, user_b) and plan_test.u('fred') in (user_a, user_b)) = 'accepted', 'the friendship';
  -- JOURNEY_COLS: published posts, no stories, not deleted
  assert (select count(*) from (select id, body, place_name, published_at, like_count, comment_count, media_count from public.posts
                                where user_id = plan_test.u('olga') and status = 'published' and kind <> 'story' and deleted_at is null) q) = 2, 'both posts in the grid';
  assert (select count(*) from public.post_media where post_id = '1f500000-0000-0000-0000-000000000001') = 1, 'the post photo row';
  assert (select count(*) from storage.objects where name = '1f000000-0000-0000-0000-000000000001/posts/p1.jpg') = 1, 'the post photo file';
  assert (select count(*) from public.journeys where user_id = plan_test.u('olga')) = 1, 'the journey row, as its visibility says';
end $$;
insert into public.post_likes (post_id) values ('1f500000-0000-0000-0000-000000000001');
insert into public.post_comments (post_id, body) values ('1f500000-0000-0000-0000-000000000001', 'Buen camino!');
do $$ begin
  assert (select like_count from public.posts where id = '1f500000-0000-0000-0000-000000000001') = 1, 'a friend likes a post';
end $$;
select plan_test.login('fola');
do $$ begin
  assert (select count(*) from public.posts where user_id = plan_test.u('olga')) = 2, 'a follower sees the posts';
end $$;
select plan_test.login('sam');
do $$ begin
  assert (select count(*) from public.posts where user_id = plan_test.u('olga')) = 1, 'a stranger sees only the public post';
end $$;
rollback;

-- =============================================================================
-- CLEAN UP
-- =============================================================================
delete from storage.objects where name like '1f000000-%';
delete from auth.users where id::text like '1f%';
do $$ begin
  assert (select count(*) from public.profiles where id::text like '1f%') = 0, 'pilgrims removed';
  assert (select count(*) from public.journey_days where user_id::text like '1f%') = 0, 'days removed';
end $$;
drop schema plan_test cascade;
