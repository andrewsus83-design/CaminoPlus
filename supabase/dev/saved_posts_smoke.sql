-- Saved posts smoke test: the three reads of the Bookmarks screen of the app (mobile/src/features/library/savedPosts.ts) against the row
-- level security that exists. The app lists the posts a pilgrim bookmarked (the bookmark button of the journey viewer writes post_saves) with
-- three plain selects and no migration of its own:
--   1. post_saves  where user_id is me, newest first, at most 50
--   2. posts       where id is one of those
--   3. profiles    where id is one of the authors who are not me
-- This file checks what the app relies on: the columns it asks for exist and are readable by the role the app uses, post_saves answers
-- only the pilgrim's own bookmarks (nobody else's, even when asked for), posts answers only the posts the pilgrim can see (one that was
-- deleted, hidden or made private since is simply not there; a pilgrim's own deleted post still is, marked deleted_at, which is why the
-- app drops those itself), and the name of an author can be read. If a later migration changes any of that, this test says so before the
-- Bookmarks screen shows the wrong list.
-- Self-contained: creates its own pilgrims (ids start with 1e) and removes them at the end. Acts as signed-in people the way PostgREST
-- does: request.jwt.claims + set local role.
\set ON_ERROR_STOP 1

drop schema if exists saved_test cascade;
create schema saved_test;
grant usage on schema saved_test to authenticated;
delete from auth.users where id::text like '1e%';

create table saved_test.users (name text primary key, id uuid not null);
insert into saved_test.users values
  ('alice', '1e000000-0000-0000-0000-000000000001'),   -- an author with a public account
  ('bob',   '1e000000-0000-0000-0000-000000000002'),   -- a stranger who also bookmarks
  ('carol', '1e000000-0000-0000-0000-000000000003'),   -- the pilgrim whose Bookmarks screen this is
  ('gina',  '1e000000-0000-0000-0000-000000000004');   -- a private account
grant select on saved_test.users to authenticated;
create function saved_test.u(n text) returns uuid language sql stable as $$ select id from saved_test.users where name = n $$;
grant execute on function saved_test.u(text) to authenticated;

-- become a signed-in person (works from the owner and from another test user)
create function saved_test.login(n text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', saved_test.u(n), 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;
grant execute on function saved_test.login(text) to authenticated;

insert into auth.users (id, email, raw_user_meta_data)
select id, 'zz1e.' || name || '@example.com', jsonb_build_object('full_name', initcap(name) || ' Zzcamino') from saved_test.users;
update public.profiles set is_private = true where id = saved_test.u('gina');

-- P1 public (alice), P2 public but deleted later, P3 public but hidden later, P4 public but made private later, P5 carol's own,
-- P6 carol's own but deleted later, P7 a public post of the private account (carol does not follow gina)
insert into public.posts (id, user_id, kind, visibility, status, body, place_name, published_at, media_count) values
  ('1e100000-0000-0000-0000-000000000001', saved_test.u('alice'), 'journal', 'public', 'published', 'Sunrise over the meseta', 'Hontanas', now() - interval '1 day', 0),
  ('1e100000-0000-0000-0000-000000000002', saved_test.u('alice'), 'journal', 'public', 'published', 'Deleted later', null, now(), 0),
  ('1e100000-0000-0000-0000-000000000003', saved_test.u('alice'), 'journal', 'public', 'published', 'Hidden later', null, now(), 0),
  ('1e100000-0000-0000-0000-000000000004', saved_test.u('alice'), 'journal', 'public', 'published', 'Private later', null, now(), 0),
  ('1e100000-0000-0000-0000-000000000005', saved_test.u('carol'), 'journal', 'public', 'published', 'My own post', 'Burgos', now() - interval '2 days', 0),
  ('1e100000-0000-0000-0000-000000000006', saved_test.u('carol'), 'journal', 'public', 'published', 'My own deleted post', null, now(), 0),
  ('1e100000-0000-0000-0000-000000000007', saved_test.u('gina'),  'journal', 'public', 'published', 'Gina public post', null, now(), 0);

-- The bookmarks are made as the pilgrims make them: the policy "save as yourself" asks that the post can be seen when it is saved. One
-- transaction each, because the server stamps created_at itself (trigger a_force_server_times): bookmarks of one transaction share a time.
begin; select saved_test.login('carol'); insert into public.post_saves (post_id) values ('1e100000-0000-0000-0000-000000000001'); commit; select pg_sleep(0.05);
begin; select saved_test.login('carol'); insert into public.post_saves (post_id) values ('1e100000-0000-0000-0000-000000000002'); commit; select pg_sleep(0.05);
begin; select saved_test.login('carol'); insert into public.post_saves (post_id) values ('1e100000-0000-0000-0000-000000000003'); commit; select pg_sleep(0.05);
begin; select saved_test.login('carol'); insert into public.post_saves (post_id) values ('1e100000-0000-0000-0000-000000000004'); commit; select pg_sleep(0.05);
begin; select saved_test.login('carol'); insert into public.post_saves (post_id) values ('1e100000-0000-0000-0000-000000000005'); commit; select pg_sleep(0.05);
begin; select saved_test.login('carol'); insert into public.post_saves (post_id) values ('1e100000-0000-0000-0000-000000000006'); commit; select pg_sleep(0.05);
-- bob bookmarks the same post as carol did first: carol must never see it
begin; select saved_test.login('bob'); insert into public.post_saves (post_id) values ('1e100000-0000-0000-0000-000000000001'); commit;
-- carol cannot bookmark what she cannot see (the post of the private account): the app never gets that far
begin;
do $$ begin
  begin
    perform saved_test.login('carol');
    insert into public.post_saves (post_id) values ('1e100000-0000-0000-0000-000000000007');
    raise exception 'expected the policy to refuse';
  exception when insufficient_privilege then null;   -- 42501 new row violates row-level security policy
  end;
end $$;
rollback;

-- afterwards the authors change their minds (as the owner of the database, the way the server or the author would)
reset role;
update public.posts set deleted_at = now() where id = '1e100000-0000-0000-0000-000000000002';
update public.posts set moderation_status = 'hidden' where id = '1e100000-0000-0000-0000-000000000003';
update public.posts set visibility = 'private' where id = '1e100000-0000-0000-0000-000000000004';
update public.posts set deleted_at = now() where id = '1e100000-0000-0000-0000-000000000006';

\echo '== the reads, as carol'
begin;
select saved_test.login('carol');

-- read 1: post_saves of this person, newest first, at most 50
create temp table r1 on commit drop as
  select post_id, created_at from public.post_saves where user_id = saved_test.u('carol') order by created_at desc limit 50;
do $$
begin
  assert (select count(*) from r1) = 6, 'carol sees her six bookmarks';
  assert (select array_agg(post_id::text order by created_at desc) from r1) = array[
    '1e100000-0000-0000-0000-000000000006', '1e100000-0000-0000-0000-000000000005', '1e100000-0000-0000-0000-000000000004',
    '1e100000-0000-0000-0000-000000000003', '1e100000-0000-0000-0000-000000000002', '1e100000-0000-0000-0000-000000000001'], 'newest bookmark first';
  -- the policy alone, without the filter on user_id, already hides bob's: the filter in the app is belt and braces
  assert (select count(*) from public.post_saves) = 6, 'without the filter carol still sees only her own six, never bob''s';
end $$;

-- read 2: the posts those bookmarks name, with the columns the app asks for (POST_COLUMNS in savedPosts.ts)
create temp table r2 on commit drop as
  select id, user_id, body, place_name, published_at, media_count, status, moderation_status, deleted_at, expires_at
  from public.posts where id in (select post_id from r1);
do $$
declare ids text;
begin
  ids := (select string_agg(id::text, ',' order by id) from r2);
  -- carol can see P1 (public) and P5 and P6 (her own: the owner always reads her own, deleted or not)
  assert ids = '1e100000-0000-0000-0000-000000000001,1e100000-0000-0000-0000-000000000005,1e100000-0000-0000-0000-000000000006',
         'only the posts carol can see come back: ' || ids;
  -- the deleted post of someone else, the hidden one and the one made private are simply not in the answer
  assert not exists (select 1 from r2 where id in ('1e100000-0000-0000-0000-000000000002', '1e100000-0000-0000-0000-000000000003', '1e100000-0000-0000-0000-000000000004')),
         'a post that was deleted, hidden or made private since is not there';
  -- her own deleted post IS there, with deleted_at set: this is why the app drops posts with deleted_at on its own side
  assert (select deleted_at is not null from r2 where id = '1e100000-0000-0000-0000-000000000006'), 'her own deleted post comes back marked deleted';
  assert (select status = 'published' and moderation_status = 'ok' and expires_at is null from r2 where id = '1e100000-0000-0000-0000-000000000001'),
         'the columns the app filters on are there';
end $$;

-- read 3: the names of the authors who are not carol
do $$
declare names text;
begin
  names := (select string_agg(username || ':' || coalesce(display_name, ''), ',' order by username)
            from public.profiles where id in (saved_test.u('alice')));
  assert names is not null and names like '%:Alice Zzcamino', 'alice''s name can be read: ' || coalesce(names, '(nothing)');
end $$;
rollback;

\echo '== and as bob: his own bookmarks, never those of carol'
begin;
select saved_test.login('bob');
do $$
begin
  assert (select count(*) from public.post_saves where user_id = saved_test.u('bob')) = 1, 'bob has one bookmark';
  assert (select count(*) from public.post_saves where user_id = saved_test.u('carol')) = 0, 'and cannot read carol''s, even when he asks for them';
end $$;
rollback;

\echo '== the column privileges of the role the app uses'
do $$
declare c text;
begin
  foreach c in array array['id', 'user_id', 'body', 'place_name', 'published_at', 'media_count', 'status', 'moderation_status', 'deleted_at', 'expires_at'] loop
    assert has_column_privilege('authenticated', 'public.posts', c, 'select'), 'authenticated can read posts.' || c;
  end loop;
  foreach c in array array['post_id', 'created_at', 'user_id'] loop
    assert has_column_privilege('authenticated', 'public.post_saves', c, 'select'), 'authenticated can read post_saves.' || c;
  end loop;
  foreach c in array array['id', 'username', 'display_name'] loop
    assert has_column_privilege('authenticated', 'public.profiles', c, 'select'), 'authenticated can read profiles.' || c;
  end loop;
  -- the read by user_id is served by an index (the hardening migration indexes every foreign key)
  assert exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'post_saves' and indexdef ~ '\(user_id\)'), 'post_saves.user_id is indexed';
end $$;

-- clean up: every pilgrim of this test goes, and with them everything they own
reset role;
delete from auth.users where id::text like '1e%';
do $$
begin
  assert (select count(*) from public.profiles where id::text like '1e%') = 0, 'pilgrims removed';
  assert (select count(*) from public.posts where id::text like '1e%') = 0, 'posts removed';
  assert (select count(*) from public.post_saves where user_id::text like '1e%' or post_id::text like '1e%') = 0, 'bookmarks removed';
end $$;
set client_min_messages = warning;
drop schema saved_test cascade;
reset client_min_messages;

\echo 'saved_posts_smoke: all assertions passed'
