-- Backend hardening smoke test (migrations 20261120000000 .. 20261120030000):
--   S3 storage listing, S4 rate limits, S2 neutral usernames and picture URLs, B4 moderation queue.
-- The whole file is ONE transaction that ends with ROLLBACK: it leaves nothing behind, on a local
-- database (validate.sh) and on a live one. Users have ids that start with be.
-- Acts as signed-in people the way PostgREST does: request.jwt.claims + set local role.
\set ON_ERROR_STOP 1
begin;

-- ---------------------------------------------------------------- helpers
create schema hard_test;
grant usage on schema hard_test to anon, authenticated;

create function hard_test.u(i integer) returns uuid language sql immutable as $$
  select ('be000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid
$$;
create function hard_test.login(p_id uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;
create function hard_test.anon() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
end $$;
create function hard_test.logout() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;
-- the statement must fail with this SQLSTATE (and this hint); returns the message
create function hard_test.fails(p_sql text, p_state text, p_hint text default null, p_msg_like text default null) returns text language plpgsql as $$
declare v_state text; v_hint text; v_msg text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint, v_msg = message_text;
    v_state := sqlstate;
    if v_state <> p_state then
      raise exception 'expected SQLSTATE % but got % (%) for: %', p_state, v_state, v_msg, p_sql;
    end if;
    if p_hint is not null and coalesce(v_hint, '') <> p_hint then
      raise exception 'expected hint % but got % (%) for: %', p_hint, coalesce(v_hint, ''), v_msg, p_sql;
    end if;
    if p_msg_like is not null and v_msg not like p_msg_like then
      raise exception 'expected a message like % but got % for: %', p_msg_like, v_msg, p_sql;
    end if;
    return v_msg;
  end;
  raise exception 'expected an error but the statement succeeded: %', p_sql;
end $$;
grant execute on all functions in schema hard_test to anon, authenticated;

-- the stand-in storage schema of validate.sh has no unique key on (bucket_id, name); Supabase has one
do $$ begin
  if not exists (select 1 from pg_indexes where schemaname = 'storage' and tablename = 'objects'
                 and indexdef ilike '%unique%(bucket_id, name%') then
    create unique index hard_test_objects_bucket_name on storage.objects (bucket_id, name);
  end if;
end $$;

-- ---------------------------------------------------------------- S2a: neutral usernames for new pilgrims
-- 1 plain e-mail sign-up without a name, 2 e-mail sign-up with a name, 3 Google (name + photo),
-- 4 a sign-up with a picture from elsewhere, 5 and 6 ask for the same username
insert into auth.users (id, email, raw_user_meta_data) values
  (hard_test.u(1), 'john.smith.be@example.com', '{}'),
  (hard_test.u(2), 'maria.lopez.be@example.com', '{"full_name": "Maria Lopez"}'),
  (hard_test.u(3), 'g.user.be@gmail.com', '{"name": "Gina User", "full_name": "Gina User", "picture": "https://lh3.googleusercontent.com/a/ACg8ocbe=s96-c"}'),
  (hard_test.u(4), 'tracker.be@example.com', '{"full_name": "Tom", "avatar_url": "https://tracker.example/pixel.png"}'),
  (hard_test.u(5), 'one.be@example.com', '{"username": "camino_be"}'),
  (hard_test.u(6), 'two.be@example.com', '{"username": "Camino_BE"}');
do $$ begin
  assert (select username from public.profiles where id = hard_test.u(1)) ~ '^pilgrim[0-9]{8}$', 'S2: neutral username';
  assert (select display_name from public.profiles where id = hard_test.u(1)) is null, 'S2: no display name taken from the e-mail';
  assert not exists (select 1 from public.profiles where id between hard_test.u(1) and hard_test.u(4)
                     and (username ilike '%john%' or username ilike '%maria%' or username ilike '%tracker%'
                          or coalesce(display_name, '') ilike '%john%' or coalesce(display_name, '') ilike '%tracker%')),
    'S2: nothing of the e-mail address is public';
  assert (select display_name from public.profiles where id = hard_test.u(2)) = 'Maria Lopez', 'S2: full_name from sign-up stays the display name';
  assert (select username from public.profiles where id = hard_test.u(2)) ~ '^pilgrim[0-9]{8}$', 'S2: neutral username with a name';
  assert (select display_name from public.profiles where id = hard_test.u(3)) = 'Gina User', 'S2: Google name';
  assert (select avatar_url from public.profiles where id = hard_test.u(3)) = 'https://lh3.googleusercontent.com/a/ACg8ocbe=s96-c', 'S2: Google photo kept';
  assert (select avatar_url from public.profiles where id = hard_test.u(4)) is null, 'S2: a picture from elsewhere is dropped, sign-up still works';
  assert (select username from public.profiles where id = hard_test.u(5)) = 'camino_be', 'S2: a username asked for at sign-up is kept';
  assert (select username from public.profiles where id = hard_test.u(6)) ~ '^camino_be[0-9]{8}$', 'S2: a taken username gets digits';
  assert (select count(distinct username) from public.profiles where id between hard_test.u(1) and hard_test.u(6)) = 6, 'S2: all unique';
  assert exists (select 1 from public.user_settings where user_id = hard_test.u(1)), 'S2: settings row still made';
end $$;

-- many more pilgrims (targets for follows, reports, friend requests); all get distinct neutral names
insert into auth.users (id, email, raw_user_meta_data)
select hard_test.u(i), 'bulk' || i || '.be@example.com', '{}' from generate_series(100, 450) i;
do $$ begin
  assert (select count(distinct lower(username)) from public.profiles where id between hard_test.u(100) and hard_test.u(450)) = 351, 'S2: 351 unique neutral names';
end $$;

-- ---------------------------------------------------------------- S2b: picture URLs
select hard_test.login(hard_test.u(1));
update public.profiles set avatar_url = 'https://xgikdabgdqmbdgagowva.supabase.co/storage/v1/object/public/avatars/' || hard_test.u(1) || '/avatar.jpg?v=1793969430777' where id = hard_test.u(1);
update public.profiles set avatar_url = 'https://lh3.googleusercontent.com/a/x=s96-c' where id = hard_test.u(1);
update public.profiles set avatar_url = '' where id = hard_test.u(1);
update public.profiles set avatar_url = null, cover_url = null where id = hard_test.u(1);
update public.profiles set avatar_url = 'http://127.0.0.1:54321/storage/v1/object/public/avatars/x/avatar.jpg' where id = hard_test.u(1);
select hard_test.fails($q$update public.profiles set avatar_url = 'https://tracker.example/pixel.png' where id = auth.uid()$q$, '23514', null, '%url_allowed%');
select hard_test.fails($q$update public.profiles set avatar_url = 'https://xgikdabgdqmbdgagowva.supabase.co.evil.example/storage/v1/object/public/avatars/a.jpg' where id = auth.uid()$q$, '23514', null, '%url_allowed%');
select hard_test.fails($q$update public.profiles set avatar_url = 'https://lh3.googleusercontent.com@evil.example/a.jpg' where id = auth.uid()$q$, '23514', null, '%url_allowed%');
select hard_test.fails($q$update public.profiles set avatar_url = 'http://xgikdabgdqmbdgagowva.supabase.co/storage/v1/object/public/avatars/a.jpg' where id = auth.uid()$q$, '23514', null, '%url_allowed%');
select hard_test.fails($q$update public.profiles set avatar_url = 'https://xgikdabgdqmbdgagowva.supabase.co/storage/v1/object/sign/user-media/a.jpg' where id = auth.uid()$q$, '23514', null, '%url_allowed%');
select hard_test.fails($q$update public.profiles set cover_url = 'https://tracker.example/c.png' where id = auth.uid()$q$, '23514', null, '%url_allowed%');
select hard_test.logout();
-- the group photo and the journey cover: checked for everybody (here the server writes)
select hard_test.fails($q$insert into public.conversations (kind, title, avatar_url, created_by) values ('group', 'G', 'https://tracker.example/g.png', 'be000000-0000-0000-0000-000000000001')$q$, '23514', null, '%conversations_avatar_url_allowed%');
do $$ begin
  assert exists (select 1 from pg_constraint where conname = 'journeys_cover_url_allowed' and convalidated), 'S2: journey cover checked';
  assert exists (select 1 from pg_constraint where conname = 'profiles_cover_url_allowed' and convalidated), 'S2: profile cover checked';
  assert not private.is_allowed_image_url('https://tracker.example/j.png'), 'S2: a stranger host is refused';
  assert not private.is_allowed_image_url('https://lh3.googleusercontent.com/a b.jpg'), 'S2: no spaces';
  assert private.is_allowed_image_url(null) and private.is_allowed_image_url(''), 'S2: null and empty are fine';
  -- the one avatar on the live database today (checked 2026-11-08) still passes
  assert private.is_allowed_image_url('https://xgikdabgdqmbdgagowva.supabase.co/storage/v1/object/public/avatars/f83a6279-7b83-4eca-9b85-4887ddd8e6d0/avatar-1793969430777.jpg'), 'S2: the live avatar passes';
  assert private.is_allowed_image_url('https://lh4.googleusercontent.com/a/x') and private.is_allowed_image_url('https://lh6.googleusercontent.com/a/x'), 'S2: Google lh3 to lh6';
  assert not private.is_allowed_image_url('https://lh7.googleusercontent.com/a/x'), 'S2: not lh7';
  assert private.is_allowed_image_url('https://xgikdabgdqmbdgagowva.supabase.co/storage/v1/object/public/business-media/b/cover.jpg')
     and private.is_allowed_image_url('https://xgikdabgdqmbdgagowva.supabase.co/storage/v1/object/public/public-media/x.jpg'), 'S2: the three public buckets';
  assert not private.is_allowed_image_url('https://xgikdabgdqmbdgagowva.supabase.co/storage/v1/object/public/user-media/u/posts/p.jpg'), 'S2: no other bucket';
  assert not private.is_allowed_image_url('https://xgikdabgdqmbdgagowva.supabase.co/storage/v1/object/public/avatars/../user-media/p.jpg'), 'S2: no ..';
  assert not private.is_allowed_image_url('https://xgikdabgdqmbdgagowva.supabase.co/storage/v1/object/public/avatars/%2E%2E/user-media/p.jpg'), 'S2: no %2e';
  assert not private.is_allowed_image_url('https://xgikdabgdqmbdgagowva.supabase.co/storage/v1/object/public/avatars/%2e./p.jpg'), 'S2: no %2e (lower case)';
end $$;

-- ---------------------------------------------------------------- S3: nobody lists the public buckets
insert into public.businesses (id, created_by, name) values ('be0b0000-0000-0000-0000-000000000001', hard_test.u(1), 'BE Casa');
select hard_test.login(hard_test.u(1));
insert into storage.objects (bucket_id, name, metadata) values
  ('avatars', hard_test.u(1) || '/avatar.jpg', '{"size": 100}'),
  ('business-media', 'be0b0000-0000-0000-0000-000000000001/cover.jpg', '{"size": 100}');
select hard_test.login(hard_test.u(2));
insert into storage.objects (bucket_id, name, metadata) values ('avatars', hard_test.u(2) || '/avatar.jpg', '{"size": 100}');
select hard_test.logout();
insert into storage.objects (bucket_id, name, metadata) values ('public-media', 'be-site/hero.jpg', '{"size": 100}');

select hard_test.anon();
do $$ begin
  assert (select count(*) from storage.objects where bucket_id in ('avatars', 'business-media', 'public-media')) = 0,
    'S3: anon lists nothing in the public buckets';
end $$;
do $$ declare n integer; begin
  -- the storage API's list endpoint (Supabase only; the local stand-in has no storage.search)
  if to_regprocedure('storage.search(text, text, integer, integer, integer, text, text, text)') is not null then
    execute $q$select count(*) from storage.search('', 'avatars')$q$ into n;
    assert n = 0, 'S3: anon storage.search(avatars) returns nothing';
  end if;
end $$;

select hard_test.login(hard_test.u(2));
do $$ begin
  assert (select count(*) from storage.objects where bucket_id = 'avatars') = 1, 'S3: a pilgrim lists only her own avatar folder';
  assert (select count(*) from storage.objects where bucket_id = 'avatars' and name like 'be000000-0000-0000-0000-000000000001/%') = 0, 'S3: not somebody else''s';
  assert (select count(*) from storage.objects where bucket_id in ('business-media', 'public-media')) = 0, 'S3: a stranger lists no business or site media';
end $$;
do $$ declare n integer; begin
  if to_regprocedure('storage.search(text, text, integer, integer, integer, text, text, text)') is not null then
    execute $q$select count(*) from storage.search('', 'avatars')$q$ into n;
    assert n = 1, 'S3: storage.search(avatars) shows only the caller''s own folder';
  end if;
end $$;

select hard_test.login(hard_test.u(1));
do $$ begin
  assert (select count(*) from storage.objects where bucket_id = 'avatars') = 1, 'S3: the owner lists her avatar';
  assert (select count(*) from storage.objects where bucket_id = 'business-media') = 1, 'S3: a business member lists the business folder';
end $$;
-- the app's upload(..., { upsert: true }): INSERT ... ON CONFLICT DO UPDATE on the same name
insert into storage.objects (bucket_id, name, metadata) values ('avatars', hard_test.u(1) || '/avatar.jpg', '{"size": 222}')
on conflict (bucket_id, name) do update set metadata = excluded.metadata;
do $$ begin
  assert (select metadata ->> 'size' from storage.objects where bucket_id = 'avatars' and name = hard_test.u(1) || '/avatar.jpg') = '222', 'S3: the owner replaces her avatar (upsert)';
end $$;
select hard_test.fails(format($q$insert into storage.objects (bucket_id, name, metadata) values ('avatars', %L, '{"size": 1}')$q$, hard_test.u(2) || '/avatar.jpg'), '42501');
delete from storage.objects where bucket_id = 'avatars' and name = hard_test.u(1) || '/avatar.jpg';
do $$ begin
  assert (select count(*) from storage.objects where bucket_id = 'avatars') = 0, 'S3: the owner deletes her avatar';
end $$;
select hard_test.logout();
-- why the owner-scoped SELECT stays: without any SELECT policy the upsert of an existing avatar is refused
drop policy "read own avatars" on storage.objects;
select hard_test.login(hard_test.u(2));
select hard_test.fails(format($q$insert into storage.objects (bucket_id, name, metadata) values ('avatars', %L, '{"size": 3}') on conflict (bucket_id, name) do update set metadata = excluded.metadata$q$, hard_test.u(2) || '/avatar.jpg'), '42501');
select hard_test.logout();
create policy "read own avatars" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
do $$ begin
  -- pictures keep loading: the buckets stay public (served by URL without any policy)
  assert (select bool_and(public) from storage.buckets where id in ('avatars', 'business-media', 'public-media')), 'S3: buckets still public';
  assert not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                     and cmd = 'SELECT' and 'anon' = any (roles)), 'S3: no SELECT policy for anon is left';
end $$;

-- ---------------------------------------------------------------- S4: rate limits
-- 400 public posts by others to like and save; pilgrim 10 (the spammer) and 11 (a busy, normal pilgrim)
insert into auth.users (id, email, raw_user_meta_data) values
  (hard_test.u(10), 'spammer.be@example.com', '{}'), (hard_test.u(11), 'busy.be@example.com', '{}'),
  (hard_test.u(12), 'asker.be@example.com', '{}'),   (hard_test.u(13), 'decliner.be@example.com', '{}'),
  (hard_test.u(14), 'searcher.be@example.com', '{}');
insert into public.posts (id, user_id, kind, visibility, status, body)
select ('be0a0000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, hard_test.u(100 + i % 50), 'journal', 'public', 'published', 'Post ' || i
from generate_series(1, 400) i;
create function hard_test.p(i integer) returns uuid language sql immutable as $$
  select ('be0a0000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid
$$;
grant execute on function hard_test.p(integer) to authenticated;

-- posts: 20 a day
select hard_test.login(hard_test.u(10));
insert into public.posts (id, kind, visibility, status, body)
select ('be0c0000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'journal', 'public', 'published', 'Mine ' || i from generate_series(1, 20) i;
select hard_test.fails($q$insert into public.posts (kind, visibility, status, body) values ('journal', 'public', 'published', 'one too many')$q$, '54000', 'rate_limited_posts');
-- a retry of a post that went through is not refused by the limit (the primary key answers it)
select hard_test.fails($q$insert into public.posts (id, kind, visibility, status, body) values ('be0c0000-0000-0000-0000-000000000001', 'journal', 'public', 'published', 'retry')$q$, '23505');
-- deleting a post does not give the slot back
update public.posts set deleted_at = now() where id = 'be0c0000-0000-0000-0000-000000000001';
select hard_test.fails($q$insert into public.posts (kind, visibility, status, body) values ('journal', 'public', 'published', 'after delete')$q$, '54000', 'rate_limited_posts');

-- comments: 60 an hour
insert into public.post_comments (id, post_id, body)
select ('be0d0000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, hard_test.p(1), 'c' || i from generate_series(1, 60) i;
select hard_test.fails($q$insert into public.post_comments (post_id, body) values ('be0a0000-0000-0000-0000-000000000001', 'too many')$q$, '54000', 'rate_limited_comments');
select hard_test.fails($q$insert into public.post_comments (id, post_id, body) values ('be0d0000-0000-0000-0000-000000000001', 'be0a0000-0000-0000-0000-000000000001', 'retry')$q$, '23505');

-- likes and saves: 300 an hour; the app's upsert of a like that exists is not refused
insert into public.post_likes (post_id) select hard_test.p(i) from generate_series(1, 300) i;
select hard_test.fails($q$insert into public.post_likes (post_id) values ('be0a0000-0000-0000-0000-000000000301')$q$, '54000', 'rate_limited_likes');
insert into public.post_likes (post_id, user_id) values (hard_test.p(1), hard_test.u(10)) on conflict (post_id, user_id) do nothing;
insert into public.post_saves (post_id) select hard_test.p(i) from generate_series(1, 300) i;
select hard_test.fails($q$insert into public.post_saves (post_id) values ('be0a0000-0000-0000-0000-000000000301')$q$, '54000', 'rate_limited_saves');
insert into public.post_saves (post_id, user_id) values (hard_test.p(1), hard_test.u(10)) on conflict (post_id, user_id) do nothing;

-- follows: 100 a day
insert into public.follows (followee_id) select hard_test.u(i) from generate_series(100, 199) i;
select hard_test.fails(format($q$insert into public.follows (followee_id) values (%L)$q$, hard_test.u(200)), '54000', 'rate_limited_follows');
insert into public.follows (follower_id, followee_id) values (hard_test.u(10), hard_test.u(100)) on conflict do nothing;

-- content reports: 30 a day; a second report of the same thing is still answered by the unique key
insert into public.content_reports (target_type, target_id, reason) select 'profile', hard_test.u(i), 'spam' from generate_series(100, 129) i;
select hard_test.fails(format($q$insert into public.content_reports (target_type, target_id, reason) values ('profile', %L, 'spam')$q$, hard_test.u(130)), '54000', 'rate_limited_reports');
select hard_test.fails(format($q$insert into public.content_reports (target_type, target_id, reason) values ('profile', %L, 'spam')$q$, hard_test.u(100)), '23505');

-- friend requests: 30 a day, counted on every send (send, cancel, send again counts twice)
select public.send_friend_request(hard_test.u(i)) from generate_series(300, 328) i;
select public.cancel_friend_request(hard_test.u(300));
select public.send_friend_request(hard_test.u(300));
select hard_test.fails(format($q$select public.send_friend_request(%L)$q$, hard_test.u(329)), '54000', 'rate_limited_friend_requests');
do $$ begin
  assert (select public.send_friend_request(hard_test.u(301))) = 'pending', 'S4: asking again about a waiting request is not a new send';
end $$;

-- the messages of every limit read as sentences for people (the app shows them as they are)
do $$ declare m text; begin
  m := hard_test.fails($q$insert into public.posts (kind, visibility, status, body) values ('journal', 'public', 'published', 'x')$q$, '54000');
  assert m ~ '^[A-Z][^\n]{6,220}[.!]$' and m !~* 'violates|constraint|relation|column|syntax|permission denied|row-level|policy|sqlstate|pg_', 'S4: plain sentence: ' || m;
end $$;
select hard_test.logout();

-- server code is never limited (security definer RPCs, the service role, the SQL editor)
insert into public.posts (user_id, kind, visibility, status, body)
select hard_test.u(10), 'journal', 'private', 'published', 'server ' || i from generate_series(1, 5) i;

-- a decline is remembered: for 30 days a new request from the same pilgrim is answered 'pending' and reaches nobody
select hard_test.login(hard_test.u(12));
do $$ begin assert public.send_friend_request(hard_test.u(13)) = 'pending', 'S4: first request'; end $$;
select hard_test.login(hard_test.u(13));
do $$ begin assert public.respond_friend_request(hard_test.u(12), false) = 'declined', 'S4: declined'; end $$;
select hard_test.login(hard_test.u(12));
do $$ begin assert public.send_friend_request(hard_test.u(13)) = 'pending', 'S4: asking again looks the same to the sender'; end $$;
select hard_test.logout();
do $$ begin
  assert not exists (select 1 from public.friendships where user_a = least(hard_test.u(12), hard_test.u(13)) and user_b = greatest(hard_test.u(12), hard_test.u(13))),
    'S4: but no request was made';
  assert not exists (select 1 from public.notifications where user_id = hard_test.u(13) and kind = 'friend_request' and actor_id = hard_test.u(12)),
    'S4: and the pilgrim who said no was not told again';
end $$;
-- during the cool-down the sender sees a request that is simply not answered yet: outgoing in the list, pending_out in search
create table hard_test.names as select id, username from public.profiles where id in (hard_test.u(12), hard_test.u(13));
grant select on hard_test.names to authenticated;
select hard_test.login(hard_test.u(12));
do $$ declare v_name text := (select username from hard_test.names where id = hard_test.u(13)); begin
  assert (select count(*) from public.list_friend_requests() where direction = 'outgoing' and id = hard_test.u(13)) = 1, 'S4: cool-down: still "Requested" in the list';
  assert (select friend_status from public.search_pilgrims(v_name) where id = hard_test.u(13)) = 'pending_out', 'S4: cool-down: pending_out in search';
  -- cancelling works like any request: it is gone for the sender (and the cool-down goes on)
  assert public.cancel_friend_request(hard_test.u(13)) = 'cancelled', 'S4: cool-down: cancel';
  assert (select count(*) from public.list_friend_requests() where id = hard_test.u(13)) = 0, 'S4: cool-down: gone after cancel';
  assert (select friend_status from public.search_pilgrims(v_name) where id = hard_test.u(13)) = 'none', 'S4: cool-down: none after cancel';
  -- asking again: "Requested" again, still without reaching the other one
  assert public.send_friend_request(hard_test.u(13)) = 'pending', 'S4: cool-down: ask again';
  assert (select count(*) from public.list_friend_requests() where direction = 'outgoing' and id = hard_test.u(13)) = 1, 'S4: cool-down: "Requested" again';
  assert (select friend_status from public.search_pilgrims(v_name) where id = hard_test.u(13)) = 'pending_out', 'S4: cool-down: pending_out again';
  -- the declines stay closed to the app
  perform hard_test.fails('select * from private.friend_request_declines', '42501');
end $$;
select hard_test.login(hard_test.u(13));
do $$ declare v_name text := (select username from hard_test.names where id = hard_test.u(12)); begin
  assert (select count(*) from public.list_friend_requests() where id = hard_test.u(12)) = 0, 'S4: cool-down: the one who said no sees no request';
  assert (select friend_status from public.search_pilgrims(v_name) where id = hard_test.u(12)) = 'none', 'S4: cool-down: and no pending_in in search';
end $$;
select hard_test.logout();
do $$ begin
  assert not exists (select 1 from public.notifications where user_id = hard_test.u(13) and actor_id = hard_test.u(12)), 'S4: cool-down: never a notification';
end $$;
-- old declines are purged when a new decline is written
insert into private.friend_request_declines (requester, decliner, declined_at) values (hard_test.u(130), hard_test.u(131), now() - interval '40 days');
select hard_test.login(hard_test.u(132)); select public.send_friend_request(hard_test.u(133));
select hard_test.login(hard_test.u(133)); select public.respond_friend_request(hard_test.u(132), false);
select hard_test.logout();
do $$ begin
  assert not exists (select 1 from private.friend_request_declines where requester = hard_test.u(130)), 'S4: a decline older than 30 days is purged';
  assert exists (select 1 from private.friend_request_declines where requester = hard_test.u(132) and decliner = hard_test.u(133)), 'S4: the new decline is kept';
end $$;
-- 31 days later the sender may ask again
update private.friend_request_declines set declined_at = now() - interval '31 days' where requester = hard_test.u(12);
select hard_test.login(hard_test.u(12));
do $$ begin assert public.send_friend_request(hard_test.u(13)) = 'pending', 'S4: after the cool-down'; end $$;
select hard_test.logout();
do $$ begin
  assert exists (select 1 from public.friendships where requested_by = hard_test.u(12) and status = 'pending'), 'S4: a real request again';
  assert not exists (select 1 from private.friend_request_declines where requester = hard_test.u(12)), 'S4: old decline forgotten';
end $$;
-- the pilgrim who declined can always ask the other one herself
select hard_test.login(hard_test.u(12)); select public.cancel_friend_request(hard_test.u(13));
select hard_test.login(hard_test.u(13)); select public.send_friend_request(hard_test.u(12));
select hard_test.login(hard_test.u(12));
do $$ begin assert public.respond_friend_request(hard_test.u(13), false) = 'declined', 'S4: 12 declines 13'; end $$;
select hard_test.login(hard_test.u(13));
do $$ begin assert public.send_friend_request(hard_test.u(12)) = 'pending', 'S4: 13 is cooled down'; end $$;
select hard_test.login(hard_test.u(12));
do $$ begin assert public.send_friend_request(hard_test.u(13)) = 'pending', 'S4: but 12 can ask 13'; end $$;
select hard_test.logout();
do $$ begin
  assert exists (select 1 from public.friendships where requested_by = hard_test.u(12) and status = 'pending'
                 and user_a = least(hard_test.u(12), hard_test.u(13))), 'S4: the request of the one who declined is real';
  assert not exists (select 1 from private.friend_request_declines where requester = hard_test.u(13) and decliner = hard_test.u(12)),
    'S4: and her own request cleared her decline';
end $$;
select hard_test.login(hard_test.u(13));
do $$ begin
  assert (select count(*) from public.list_friend_requests() where direction = 'incoming' and id = hard_test.u(12)) = 1, 'S4: 13 now sees the real request';
end $$;
select hard_test.logout();

-- the rate-limit helpers only ever look at the caller's own rows (no counting other people)
select hard_test.login(hard_test.u(11));
do $$ begin
  assert private.recent_writes('posts', interval '1 day') = 0, 'S4: helper counts my own posts only (11 has none yet)';
  assert not private.write_exists('likes', jsonb_build_object('post_id', hard_test.p(1), 'user_id', hard_test.u(10))), 'S4: helper does not tell whether somebody else liked a post';
  assert not private.write_exists('follows', jsonb_build_object('follower_id', hard_test.u(10), 'followee_id', hard_test.u(100))), 'S4: nor whom somebody follows';
  assert to_regprocedure('private.recent_writes(text, uuid, interval)') is null, 'S4: no helper takes a user id';
end $$;
select hard_test.logout();

-- search_pilgrims: 3 characters, 30 a minute; too short does not count
select hard_test.login(hard_test.u(14));
do $$ declare i integer; begin
  assert (select count(*) from public.search_pilgrims('pi')) = 0, 'S4: two letters find nothing';
  assert (select count(*) from public.search_pilgrims('@pi')) = 0, 'S4: @ + two letters find nothing';
  for i in 1..30 loop
    perform * from public.search_pilgrims('pilgrim');
  end loop;
  assert (select count(*) from public.search_pilgrims('xy')) = 0, 'S4: a short query is still answered (empty) at the limit';
end $$;
select hard_test.fails($q$select * from public.search_pilgrims('pilgrim')$q$, '54000', 'rate_limited_search');
select hard_test.logout();
update private.search_log set called_at = called_at - interval '61 seconds' where user_id = hard_test.u(14);
select hard_test.login(hard_test.u(14));
do $$ begin
  assert (select count(*) from public.search_pilgrims('pilgrim', 5)) between 1 and 5, 'S4: a minute later search works again';
end $$;
select hard_test.logout();

-- a busy but normal day is never blocked: 5 posts, 30 comments, 100 likes, 50 saves, 20 follows,
-- 3 reports, 10 friend requests, 20 searches
select hard_test.login(hard_test.u(11));
insert into public.posts (kind, visibility, status, body) select 'journal', 'followers', 'published', 'Day ' || i from generate_series(1, 5) i;
insert into public.post_comments (post_id, body) select hard_test.p(i), 'Buen Camino ' || i from generate_series(1, 30) i;
insert into public.post_likes (post_id) select hard_test.p(i) from generate_series(1, 100) i;
insert into public.post_saves (post_id) select hard_test.p(i) from generate_series(1, 50) i;
insert into public.follows (followee_id) select hard_test.u(i) from generate_series(200, 219) i;
insert into public.content_reports (target_type, target_id, reason) select 'profile', hard_test.u(i), 'spam' from generate_series(200, 202) i;
select public.send_friend_request(hard_test.u(i)) from generate_series(400, 409) i;
do $$ declare i integer; begin
  for i in 1..20 loop perform * from public.search_pilgrims('pilgrim'); end loop;
end $$;
select hard_test.logout();
do $$ begin
  assert (select count(*) from public.posts where user_id = hard_test.u(11)) = 5, 'S4: normal day: posts';
  assert (select count(*) from public.post_comments where user_id = hard_test.u(11)) = 30, 'S4: normal day: comments';
  assert (select count(*) from public.post_likes where user_id = hard_test.u(11)) = 100, 'S4: normal day: likes';
  assert (select count(*) from public.post_saves where user_id = hard_test.u(11)) = 50, 'S4: normal day: saves';
  assert (select count(*) from public.follows where follower_id = hard_test.u(11)) = 20, 'S4: normal day: follows';
  assert (select count(*) from public.content_reports where reporter_id = hard_test.u(11)) = 3, 'S4: normal day: reports';
  assert (select count(*) from public.friendships where requested_by = hard_test.u(11)) = 10, 'S4: normal day: friend requests';
  -- nobody can read the logs from the app
  assert not has_table_privilege('authenticated', 'private.search_log', 'select'), 'S4: search log is private';
  assert not has_table_privilege('authenticated', 'private.friend_request_log', 'select'), 'S4: request log is private';
  assert not has_table_privilege('authenticated', 'private.friend_request_declines', 'select'), 'S4: declines are private';
end $$;

-- ---------------------------------------------------------------- B4: moderation queue
insert into public.posts (id, user_id, kind, visibility, status, body)
values ('be0e0000-0000-0000-0000-000000000001', hard_test.u(1), 'journal', 'public', 'published', 'Buy   cheap
pills here');
insert into public.post_comments (id, post_id, user_id, body)
values ('be0e0000-0000-0000-0000-000000000002', 'be0e0000-0000-0000-0000-000000000001', hard_test.u(1), 'Rude comment');
-- the oldest report waits 30 hours (written by the server: a client cannot choose created_at)
insert into public.content_reports (reporter_id, target_type, target_id, reason, details, created_at)
values (hard_test.u(2), 'post', 'be0e0000-0000-0000-0000-000000000001', 'spam', 'selling things', now() - interval '30 hours');
select hard_test.login(hard_test.u(3));
insert into public.content_reports (target_type, target_id, reason) values ('post', 'be0e0000-0000-0000-0000-000000000001', 'spam');
insert into public.content_reports (target_type, target_id, reason) values ('comment', 'be0e0000-0000-0000-0000-000000000002', 'harassment');
insert into public.content_reports (target_type, target_id, reason) values ('profile', hard_test.u(1), 'harassment');
-- the app cannot read the queue
select hard_test.fails($q$select * from private.moderation_queue$q$, '42501');
select hard_test.anon();
select hard_test.fails($q$select * from private.moderation_queue$q$, '42501');
select hard_test.logout();
do $$
declare first_row record;
begin
  assert has_table_privilege('service_role', 'private.moderation_queue', 'select'), 'B4: the service role reads the queue';
  select * into first_row from private.moderation_queue where target_owner_id = hard_test.u(1) limit 1;
  assert first_row.target_type = 'post' and first_row.reason = 'spam', 'B4: oldest first';
  assert first_row.age_hours between 29.9 and 30.1, 'B4: age in hours ' || first_row.age_hours;
  assert first_row.open_reports_on_target = 2, 'B4: two reports on the post';
  assert first_row.preview = 'Buy cheap pills here', 'B4: post preview (one line): ' || first_row.preview;
  assert first_row.target_moderation = 'ok', 'B4: moderation status of the post';
  assert first_row.details = 'selling things', 'B4: details';
  assert (select preview from private.moderation_queue where target_type = 'comment' and target_owner_id = hard_test.u(1)) = 'Rude comment', 'B4: comment preview';
  assert (select preview from private.moderation_queue where target_type = 'profile' and target_id = hard_test.u(1)) like '@pilgrim%', 'B4: profile preview';
  assert (select count(*) from private.moderation_queue where target_owner_id = hard_test.u(1)) = 4, 'B4: four open reports';
end $$;
-- one report whose evidence is odd (sender_id is not a uuid) never breaks the queue
insert into public.content_reports (id, reporter_id, target_type, target_id, reason)
values ('be0f0000-0000-0000-0000-000000000001', hard_test.u(2), 'post', 'be0f0000-0000-0000-0000-0000000000ff', 'spam');
-- made into a message report by hand (the insert trigger would link a real message)
update public.content_reports set target_type = 'message', evidence = '{"sender_id": "not-a-uuid", "kind": "text", "body": "odd"}'
where id = 'be0f0000-0000-0000-0000-000000000001';
do $$ begin
  assert (select count(*) from private.moderation_queue where report_id = 'be0f0000-0000-0000-0000-000000000001') = 1, 'B4: the odd report is listed';
  assert (select target_owner_id is null and preview = 'odd' from private.moderation_queue where report_id = 'be0f0000-0000-0000-0000-000000000001'), 'B4: without an owner';
  assert (select count(*) from private.moderation_queue where target_owner_id = hard_test.u(1)) = 4, 'B4: and the rest of the queue still reads';
end $$;
update public.content_reports set status = 'dismissed', resolved_at = now() where id = 'be0f0000-0000-0000-0000-000000000001';
-- the routine of MODERATION.md: hide the post, resolve its reports; it leaves the queue
update public.posts set moderation_status = 'hidden' where id = 'be0e0000-0000-0000-0000-000000000001';
update public.content_reports set status = 'actioned', resolved_at = now()
where target_type = 'post' and target_id = 'be0e0000-0000-0000-0000-000000000001' and status in ('open', 'reviewing');
update public.content_reports set status = 'dismissed', resolved_at = now()
where target_type = 'profile' and target_id = hard_test.u(1) and status in ('open', 'reviewing');
do $$ begin
  assert (select count(*) from private.moderation_queue where target_owner_id = hard_test.u(1)) = 1, 'B4: resolved reports leave the queue';
end $$;
select hard_test.login(hard_test.u(2));
do $$ begin
  assert not exists (select 1 from public.posts where id = 'be0e0000-0000-0000-0000-000000000001'), 'B4: a hidden post is gone for others';
end $$;
select hard_test.login(hard_test.u(1));
do $$ begin
  assert exists (select 1 from public.posts where id = 'be0e0000-0000-0000-0000-000000000001'), 'B4: the author still sees it';
end $$;
select hard_test.logout();
-- the daily digest query of MODERATION.md runs
do $$ begin
  perform count(*), min(reported_at), max(age_hours) from private.moderation_queue where age_hours >= 12;
end $$;

rollback;
