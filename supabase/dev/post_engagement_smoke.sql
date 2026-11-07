-- Post engagement counters smoke test (migration 20261108010000_post_engagement_counters).
-- Self-contained: creates its own pilgrims (ids start with 1d) and removes them at the end, so it
-- can run on any database that has the migrations (and be re-run). Every section is one transaction
-- that is rolled back, so no section depends on another.
-- Acts as signed-in people the way PostgREST does: request.jwt.claims + set local role.
--
-- Section 9 applies the migration file a second time: the migration has to be re-runnable. The \ir
-- path is relative to this file, so run the test with psql -f (validate.sh does).
-- Section 8 needs a second database session (dblink, superuser) and is skipped without them.
\set ON_ERROR_STOP 1

-- ---------------------------------------------------------------- helpers
drop schema if exists engage_test cascade;
create schema engage_test;
grant usage on schema engage_test to anon, authenticated;

-- leftovers of a failed earlier run
delete from auth.users where id::text like '1d%';

create table engage_test.users (name text primary key, id uuid not null);
insert into engage_test.users (name, id) values
  ('alice', '1d000000-0000-0000-0000-000000000001'),   -- the author, a public account
  ('bob',   '1d000000-0000-0000-0000-000000000002'),   -- a stranger
  ('carol', '1d000000-0000-0000-0000-000000000003'),   -- follows alice
  ('dave',  '1d000000-0000-0000-0000-000000000004'),   -- followed alice, then alice blocked him
  ('erin',  '1d000000-0000-0000-0000-000000000005'),   -- alice's friend
  ('gina',  '1d000000-0000-0000-0000-000000000006'),   -- a private account
  ('hank',  '1d000000-0000-0000-0000-000000000007'),   -- follows gina
  ('zed',   '1d000000-0000-0000-0000-0000000000f1'),   -- leaves the app in section 3
  ('yan',   '1d000000-0000-0000-0000-0000000000f2');   -- an author who leaves the app in section 3
grant select on engage_test.users to anon, authenticated;

-- the fixture posts (all alice's, except gina_pub)
create table engage_test.posts (label text primary key, id uuid not null);
insert into engage_test.posts (label, id) values
  ('pub',       '1d200000-0000-0000-0000-000000000001'),   -- public, published
  ('followers', '1d200000-0000-0000-0000-000000000002'),   -- followers (and friends)
  ('private',   '1d200000-0000-0000-0000-000000000003'),   -- only alice
  ('draft',     '1d200000-0000-0000-0000-000000000004'),   -- public but not published yet
  ('deleted',   '1d200000-0000-0000-0000-000000000005'),   -- public, soft deleted
  ('hidden',    '1d200000-0000-0000-0000-000000000006'),   -- public, hidden by moderation
  ('story',     '1d200000-0000-0000-0000-000000000007'),   -- a story that is still up
  ('story_old', '1d200000-0000-0000-0000-000000000008'),   -- a story that expired yesterday
  ('gina_pub',  '1d200000-0000-0000-0000-000000000009');   -- public post of a private account
grant select on engage_test.posts to anon, authenticated;

-- Who is allowed to see which fixture post: the ground truth, written by hand from the visibility rules.
-- Your own posts always. Other people's only when published, not deleted, not hidden, not an expired story,
-- and public or followers/friends; a private account's posts only for its followers; a block hides everything.
-- dave sees nothing of alice's (blocked) and nothing of gina's (a private account he does not follow).
create table engage_test.visible (viewer text not null, post text not null);
insert into engage_test.visible (viewer, post) values
  ('alice', 'pub'), ('alice', 'followers'), ('alice', 'private'), ('alice', 'draft'), ('alice', 'deleted'),
  ('alice', 'hidden'), ('alice', 'story'), ('alice', 'story_old'),
  ('bob',   'pub'), ('bob',   'story'),
  ('carol', 'pub'), ('carol', 'followers'), ('carol', 'story'),
  ('erin',  'pub'), ('erin',  'followers'), ('erin',  'story'),
  ('gina',  'pub'), ('gina',  'story'), ('gina',  'gina_pub'),
  ('hank',  'pub'), ('hank',  'story'), ('hank',  'gina_pub');
grant select on engage_test.visible to anon, authenticated;

create function engage_test.u(p_name text) returns uuid language sql stable as $$
  select id from engage_test.users where name = p_name
$$;
create function engage_test.pid(p_label text) returns uuid language sql stable as $$
  select id from engage_test.posts where label = p_label
$$;

-- become a signed-in person (works from the owner and from another test user)
create function engage_test.login(p_name text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', engage_test.u(p_name), 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;
-- the role is there but the token carries no user
create function engage_test.no_user() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '{"role": "authenticated"}', true);
  set local role authenticated;
end $$;
create function engage_test.anon() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
end $$;
create function engage_test.logout() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

-- the statement must fail; optionally with this SQLSTATE and this hint
create function engage_test.fails(p_sql text, p_state text default null, p_hint text default null)
returns void language plpgsql as $$
declare
  v_state text;
  v_hint  text;
  v_msg   text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint, v_msg = message_text;
    v_state := sqlstate;
    if p_state is not null and v_state <> p_state then
      raise exception 'expected SQLSTATE % but got % (%) for: %', p_state, v_state, v_msg, p_sql;
    end if;
    if p_hint is not null and coalesce(v_hint, '') <> p_hint then
      raise exception 'expected hint % but got % (%) for: %', p_hint, coalesce(v_hint, ''), v_msg, p_sql;
    end if;
    return;
  end;
  raise exception 'expected an error but the statement succeeded: %', p_sql;
end $$;

-- rows touched by a statement
create function engage_test.affected(p_sql text) returns integer language plpgsql as $$
declare n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;

-- the two counters of a post as "saves/shares", read as whoever is signed in
create function engage_test.counts(p_label text) returns text language sql stable as $$
  select save_count || '/' || share_count from public.posts where id = engage_test.pid(p_label)
$$;

-- What the migration promises about the catalog. It runs before and after the migration is applied a
-- second time, so a re-run provably leaves everything as it was.
create function engage_test.check_structure() returns void language plpgsql as $$
declare
  r record;
begin
  -- the two counters: integer, not null, start at 0
  for r in select c from unnest(array['save_count', 'share_count']) c loop
    assert exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'posts' and column_name = r.c
                     and data_type = 'integer' and is_nullable = 'NO' and column_default = '0'),
           'posts.' || r.c || ' is integer not null default 0';
  end loop;

  -- clients cannot write them: the guard names both, and still names the old ones
  assert (select pg_get_triggerdef(t.oid) from pg_trigger t
          where t.tgrelid = 'public.posts'::regclass and t.tgname = 'posts_guard' and not t.tgisinternal)
         like '%"save_count": 0%"share_count": 0%', 'posts_guard covers save_count and share_count';
  assert (select pg_get_triggerdef(t.oid) from pg_trigger t
          where t.tgrelid = 'public.posts'::regclass and t.tgname = 'posts_guard' and not t.tgisinternal)
         like '%"like_count": 0%"comment_count": 0%"media_count": 0%"moderation_status": "ok"%', 'posts_guard still covers the old columns';

  -- post_shares: one row per pilgrim and post, goes with the post or the pilgrim, nobody but the server reads it
  assert (select pg_get_constraintdef(c.oid) from pg_constraint c
          where c.conrelid = 'public.post_shares'::regclass and c.contype = 'p') = 'PRIMARY KEY (post_id, user_id)', 'post_shares primary key';
  assert (select count(*) from pg_constraint c
          where c.conrelid = 'public.post_shares'::regclass and c.contype = 'f' and c.confdeltype = 'c') = 2,
         'post_shares: both foreign keys cascade';
  assert exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'post_shares' and indexdef ~ '\(user_id\)'),
         'post_shares.user_id is indexed';
  assert (select relrowsecurity from pg_class where oid = 'public.post_shares'::regclass), 'RLS on post_shares';
  assert not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'post_shares'), 'post_shares has no policy';
  for r in select a.who, p.priv
           from (values ('anon'), ('authenticated')) a(who)
           cross join (values ('select'), ('insert'), ('update'), ('delete'), ('truncate'), ('references'), ('trigger')) p(priv) loop
    assert not has_table_privilege(r.who, 'public.post_shares', r.priv), r.who || ' has ' || r.priv || ' on post_shares';
  end loop;
  assert has_table_privilege('service_role', 'public.post_shares', 'select'), 'the server keeps its access';

  -- the counters are kept by triggers on both tables, and nobody can call the trigger function
  assert (select count(*) from pg_trigger t
          where not t.tgisinternal and t.tgenabled = 'O'
            and ((t.tgrelid = 'public.post_saves'::regclass  and t.tgname = 'post_saves_counter')
              or (t.tgrelid = 'public.post_shares'::regclass and t.tgname = 'post_shares_counter'))) = 2, 'both counter triggers exist and are on';
  assert not has_function_privilege('public', 'private.post_engagement_counters()', 'execute')
     and not has_function_privilege('anon', 'private.post_engagement_counters()', 'execute')
     and not has_function_privilege('authenticated', 'private.post_engagement_counters()', 'execute'), 'the trigger function is nobody''s to call';

  -- record_post_share: signed-in pilgrims only, security definer with an empty search path, answers an integer
  assert (select p.prosecdef from pg_proc p where p.oid = 'public.record_post_share(uuid)'::regprocedure), 'record_post_share is security definer';
  assert (select p.proconfig from pg_proc p where p.oid = 'public.record_post_share(uuid)'::regprocedure) = array['search_path=""'],
         'record_post_share has an empty search_path';
  assert pg_get_function_result('public.record_post_share(uuid)'::regprocedure) = 'integer', 'record_post_share returns integer';
  assert (select p.proacl is not null and not exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0)
          from pg_proc p where p.oid = 'public.record_post_share(uuid)'::regprocedure), 'record_post_share is open to PUBLIC';
  assert not has_function_privilege('anon', 'public.record_post_share(uuid)', 'execute'), 'record_post_share is open to anon';
  assert has_function_privilege('authenticated', 'public.record_post_share(uuid)', 'execute'), 'record_post_share is not granted to authenticated';
end $$;

grant execute on all functions in schema engage_test to anon, authenticated;

-- ---------------------------------------------------------------- people, relations, posts
insert into auth.users (id, email, raw_user_meta_data)
select id, 'zz1d.' || name || '@example.com', jsonb_build_object('full_name', initcap(name) || ' Zzcamino')
from engage_test.users;
update public.profiles set is_private = true where id = engage_test.u('gina');

insert into public.follows (follower_id, followee_id) values
  (engage_test.u('carol'), engage_test.u('alice')),
  (engage_test.u('dave'),  engage_test.u('alice')),
  (engage_test.u('hank'),  engage_test.u('gina'));      -- gina is private: this starts as a request
update public.follows set status = 'accepted' where follower_id = engage_test.u('hank') and followee_id = engage_test.u('gina');
insert into public.friendships (user_a, user_b, requested_by, status, responded_at)
values (least(engage_test.u('alice'), engage_test.u('erin')), greatest(engage_test.u('alice'), engage_test.u('erin')),
        engage_test.u('alice'), 'accepted', now());
insert into public.blocks (blocker_id, blocked_id) values (engage_test.u('alice'), engage_test.u('dave'));   -- also ends dave's follow

insert into public.posts (id, user_id, kind, visibility, status, body, published_at, deleted_at, moderation_status) values
  (engage_test.pid('pub'),       engage_test.u('alice'), 'photo',   'public',    'published', 'public post',        null, null, 'ok'),
  (engage_test.pid('followers'), engage_test.u('alice'), 'journal', 'followers', 'published', 'followers post',     null, null, 'ok'),
  (engage_test.pid('private'),   engage_test.u('alice'), 'journal', 'private',   'published', 'private post',       null, null, 'ok'),
  (engage_test.pid('draft'),     engage_test.u('alice'), 'journal', 'public',    'draft',     'draft post',         null, null, 'ok'),
  (engage_test.pid('deleted'),   engage_test.u('alice'), 'journal', 'public',    'published', 'deleted post',       null, now(), 'ok'),
  (engage_test.pid('hidden'),    engage_test.u('alice'), 'journal', 'public',    'published', 'hidden post',        null, null, 'hidden'),
  (engage_test.pid('story'),     engage_test.u('alice'), 'story',   'public',    'published', 'story still up',     null, null, 'ok'),
  (engage_test.pid('story_old'), engage_test.u('alice'), 'story',   'public',    'published', 'story that expired', now() - interval '2 days', null, 'ok'),
  (engage_test.pid('gina_pub'),  engage_test.u('gina'),  'journal', 'public',    'published', 'gina public post',   null, null, 'ok');

do $$ begin
  assert (select count(*) from public.profiles where id::text like '1d%') = 9, 'test pilgrims created';
  assert (select count(*) from public.posts where id::text like '1d%') = 9, 'test posts created';
  assert (select expires_at < now() from public.posts where id = engage_test.pid('story_old')), 'the old story has expired';
  assert (select expires_at > now() from public.posts where id = engage_test.pid('story')), 'the new story has not';
  assert private.is_friend(engage_test.u('erin'), engage_test.u('alice')) and not private.is_friend(engage_test.u('bob'), engage_test.u('alice')), 'friendship fixture';
  assert (select count(*) from public.follows where follower_id = engage_test.u('dave')) = 0, 'the block ended dave''s follow';
  assert (select count(*) from public.follows where status = 'accepted' and follower_id::text like '1d%') = 2, 'carol follows alice, hank follows gina';
  assert (select count(*) from public.posts where id::text like '1d%' and save_count = 0 and share_count = 0) = 9, 'new posts start at 0 saves and 0 shares';
end $$;

-- =============================================================================
\echo '== 1. what the migration promises'
-- =============================================================================
select engage_test.check_structure();

-- =============================================================================
\echo '== 2. bookmarks: the counter follows inserts, deletes and moves'
-- =============================================================================
begin;
select engage_test.login('bob');
insert into public.post_saves (post_id) values (engage_test.pid('pub'));
select engage_test.login('alice');
do $$
begin
  -- the reason for the counter: the author cannot read other people's bookmarks, but she can read the number
  assert (select count(*) from public.post_saves where post_id = engage_test.pid('pub')) = 0, 'alice cannot read bob''s bookmark';
  assert engage_test.counts('pub') = '1/0', 'one bookmark counted, no shares';
end $$;
select engage_test.login('carol');
insert into public.post_saves (post_id) values (engage_test.pid('pub'));
select engage_test.login('erin');
insert into public.post_saves (post_id) values (engage_test.pid('pub'));
do $$
begin
  assert engage_test.counts('pub') = '3/0', 'three pilgrims, three bookmarks';
  -- a bookmark is saved once
  assert engage_test.affected(format($q$insert into public.post_saves (post_id) values (%L) on conflict do nothing$q$, engage_test.pid('pub'))) = 0,
         'a repeated bookmark inserts nothing';
  perform engage_test.fails(format($q$insert into public.post_saves (post_id) values (%L)$q$, engage_test.pid('pub')), '23505');
  assert engage_test.counts('pub') = '3/0', 'still three';
  assert (select like_count = 0 and comment_count = 0 from public.posts where id = engage_test.pid('pub')), 'likes and comments are untouched';
end $$;
-- removing a bookmark
select engage_test.login('bob');
delete from public.post_saves where post_id = engage_test.pid('pub');
do $$ begin assert engage_test.counts('pub') = '2/0', 'an unsave counts down'; end $$;
select engage_test.login('carol');
delete from public.post_saves where post_id = engage_test.pid('pub');
select engage_test.login('erin');
delete from public.post_saves where post_id = engage_test.pid('pub');
do $$ begin assert engage_test.counts('pub') = '0/0', 'back to zero'; end $$;
-- moving a bookmark to another post moves the count (the policy lets a pilgrim update their own rows)
select engage_test.login('bob');
insert into public.post_saves (post_id) values (engage_test.pid('pub'));
update public.post_saves set post_id = engage_test.pid('story') where post_id = engage_test.pid('pub');
do $$
begin
  assert engage_test.counts('pub') = '0/0' and engage_test.counts('story') = '1/0', 'the count moved with the bookmark';
  perform engage_test.fails(format($q$update public.post_saves set post_id = %L$q$, gen_random_uuid()), '23503');
  assert engage_test.counts('story') = '1/0', 'a failed move changes nothing';
end $$;
rollback;

-- =============================================================================
\echo '== 3. counts go down when a pilgrim or an author leaves, and nothing fails on the way'
-- =============================================================================
begin;
select engage_test.logout();
insert into public.posts (id, user_id, kind, visibility, status, body)
values ('1d200000-0000-0000-0000-0000000000f1', engage_test.u('yan'), 'journal', 'public', 'published', 'yan post');
select engage_test.login('zed');
insert into public.post_saves (post_id) values (engage_test.pid('pub')), ('1d200000-0000-0000-0000-0000000000f1');
select public.record_post_share(engage_test.pid('pub')), public.record_post_share('1d200000-0000-0000-0000-0000000000f1');
select engage_test.login('bob');
insert into public.post_saves (post_id) values (engage_test.pid('pub')), ('1d200000-0000-0000-0000-0000000000f1');
select public.record_post_share(engage_test.pid('pub')), public.record_post_share('1d200000-0000-0000-0000-0000000000f1');
select engage_test.logout();
do $$
begin
  assert engage_test.counts('pub') = '2/2', 'two pilgrims saved and shared pub';
  assert (select save_count || '/' || share_count from public.posts where id = '1d200000-0000-0000-0000-0000000000f1') = '2/2', 'and yan''s post';
end $$;
-- a pilgrim deletes their account: the rows cascade and the counts of the posts they touched go down
delete from auth.users where id = engage_test.u('zed');
do $$
begin
  assert engage_test.counts('pub') = '1/1', 'zed is gone, so are his bookmark and his share';
  assert not exists (select 1 from public.post_saves where user_id = engage_test.u('zed'))
     and not exists (select 1 from public.post_shares where user_id = engage_test.u('zed')), 'no rows of zed are left';
  assert (select save_count || '/' || share_count from public.posts where id = '1d200000-0000-0000-0000-0000000000f1') = '1/1', 'yan''s post went down too';
end $$;
-- an author deletes their account: the post goes with its bookmarks and shares
delete from auth.users where id = engage_test.u('yan');
do $$
begin
  assert not exists (select 1 from public.posts where id = '1d200000-0000-0000-0000-0000000000f1'), 'yan''s post is gone';
  assert not exists (select 1 from public.post_saves where post_id = '1d200000-0000-0000-0000-0000000000f1')
     and not exists (select 1 from public.post_shares where post_id = '1d200000-0000-0000-0000-0000000000f1'), 'with its bookmarks and shares';
  assert engage_test.counts('pub') = '1/1', 'other posts are not affected';
end $$;
rollback;

-- =============================================================================
\echo '== 4. clients cannot write the counters'
-- =============================================================================
begin;
select engage_test.login('bob');
insert into public.post_saves (post_id) values (engage_test.pid('pub'));
select public.record_post_share(engage_test.pid('pub'));
select engage_test.login('alice');
-- the author edits her post and tries to push the numbers up
update public.posts set save_count = 99, share_count = 99, body = 'edited' where id = engage_test.pid('pub');
do $$
begin
  assert (select body from public.posts where id = engage_test.pid('pub')) = 'edited', 'the edit itself went through';
  assert engage_test.counts('pub') = '1/1', 'made-up counters on an update are ignored';
end $$;
-- a new post cannot start with made-up numbers, not by insert and not by the outbox upsert of the same id
insert into public.posts (id, kind, visibility, body, save_count, share_count)
values ('1d200000-0000-0000-0000-0000000000a1', 'photo', 'public', 'forged', 500, 500);
do $$
begin
  assert (select save_count = 0 and share_count = 0 from public.posts where id = '1d200000-0000-0000-0000-0000000000a1'),
         'made-up counters on an insert are ignored';
end $$;
insert into public.posts (id, kind, visibility, body, save_count, share_count)
values ('1d200000-0000-0000-0000-0000000000a1', 'photo', 'public', 'forged again', 900, 900)
on conflict (id) do update set body = excluded.body, save_count = excluded.save_count, share_count = excluded.share_count;
do $$
begin
  assert (select save_count = 0 and share_count = 0 and body = 'forged again' from public.posts where id = '1d200000-0000-0000-0000-0000000000a1'),
         'made-up counters on an upsert are ignored';
end $$;
-- somebody else's post is not theirs to edit at all
select engage_test.login('bob');
do $$
begin
  assert engage_test.affected(format($q$update public.posts set save_count = 99 where id = %L$q$, engage_test.pid('pub'))) = 0, 'bob cannot edit alice''s post';
  assert engage_test.counts('pub') = '1/1', 'the counts are what they were';
end $$;
rollback;

-- =============================================================================
\echo '== 5. sharing: once per pilgrim, and the counter follows'
-- =============================================================================
begin;
select engage_test.login('bob');
do $$
begin
  assert public.record_post_share(engage_test.pid('pub')) = 1, 'bob is the first to share';
  assert public.record_post_share(engage_test.pid('pub')) = 1, 'sharing again does not count twice';
  assert public.record_post_share(engage_test.pid('pub')) = 1, 'not even a third time';
end $$;
select engage_test.login('carol');
do $$ begin assert public.record_post_share(engage_test.pid('pub')) = 2, 'carol is the second pilgrim'; end $$;
select engage_test.login('erin');
do $$ begin assert public.record_post_share(engage_test.pid('pub')) = 3, 'erin is the third'; end $$;
select engage_test.login('alice');
do $$
begin
  assert public.record_post_share(engage_test.pid('pub')) = 4, 'the author can share her own post too';
  assert engage_test.counts('pub') = '0/4', 'the counter is the number of pilgrims, and is read with the post';
  assert (select like_count = 0 and comment_count = 0 from public.posts where id = engage_test.pid('pub')), 'shares do not touch likes or comments';
end $$;
select engage_test.logout();
do $$
begin
  assert (select count(*) from public.post_shares where post_id = engage_test.pid('pub')) = 4, 'one row per pilgrim';
  -- the counter follows deletes too (the server removes a row)
  delete from public.post_shares where user_id = engage_test.u('carol');
  assert engage_test.counts('pub') = '0/3', 'a removed share counts down';
end $$;
select engage_test.login('carol');
do $$ begin assert public.record_post_share(engage_test.pid('pub')) = 4, 'carol shares again after her row was removed, and counts once'; end $$;
rollback;

-- =============================================================================
\echo '== 6. who can share: signed-in pilgrims who can see the post, through the function only'
-- =============================================================================
begin;
select engage_test.login('bob');
do $$
declare
  m_private text;
  m_missing text;
begin
  -- a pilgrim who cannot see a post cannot share it
  perform engage_test.fails(format($q$select public.record_post_share(%L)$q$, engage_test.pid('private')),   'P0002', 'not_found');
  perform engage_test.fails(format($q$select public.record_post_share(%L)$q$, engage_test.pid('followers')), 'P0002', 'not_found');
  perform engage_test.fails(format($q$select public.record_post_share(%L)$q$, engage_test.pid('gina_pub')),  'P0002', 'not_found');
  perform engage_test.fails($q$select public.record_post_share(gen_random_uuid())$q$, 'P0002', 'not_found');
  perform engage_test.fails($q$select public.record_post_share(null)$q$, 'P0002', 'not_found');
  -- and the answer does not tell a private post from one that does not exist
  begin perform public.record_post_share(engage_test.pid('private')); exception when others then m_private := sqlerrm; end;
  begin perform public.record_post_share(gen_random_uuid()); exception when others then m_missing := sqlerrm; end;
  assert m_private is not null and m_private = m_missing, 'a private post and a missing post answer the same';
end $$;
-- the refused calls wrote nothing and moved nothing
select engage_test.logout();
do $$
begin
  assert (select count(*) from public.post_shares where user_id = engage_test.u('bob')) = 0, 'nothing was written for bob';
  assert (select count(*) from public.posts where id::text like '1d%' and (save_count <> 0 or share_count <> 0)) = 0, 'no counter moved';
end $$;

-- access is checked every time: a follower can share a followers post until she stops following
select engage_test.login('carol');
do $$ begin assert public.record_post_share(engage_test.pid('followers')) = 1, 'carol follows alice, so she can share'; end $$;
delete from public.follows where follower_id = engage_test.u('carol');
do $$
begin
  perform engage_test.fails(format($q$select public.record_post_share(%L)$q$, engage_test.pid('followers')), 'P0002', 'not_found');
end $$;
select engage_test.login('alice');
do $$ begin assert engage_test.counts('followers') = '0/1', 'her earlier share stays counted'; end $$;

-- signed in as a role but without a user, and not signed in at all
select engage_test.no_user();
select engage_test.fails(format($q$select public.record_post_share(%L)$q$, engage_test.pid('pub')), '42501', 'not_signed_in');
select engage_test.anon();
select engage_test.fails(format($q$select public.record_post_share(%L)$q$, engage_test.pid('pub')), '42501');
select engage_test.fails($q$select count(*) from public.post_shares$q$, '42501');
select engage_test.fails(format($q$insert into public.post_shares (post_id, user_id) values (%L, %L)$q$, engage_test.pid('pub'), engage_test.u('bob')), '42501');

-- a signed-in pilgrim cannot touch the table either: no counting without the visibility rule, no one else's name
select engage_test.login('bob');
do $$
begin
  perform engage_test.fails($q$select count(*) from public.post_shares$q$, '42501');
  perform engage_test.fails(format($q$insert into public.post_shares (post_id, user_id) values (%L, %L)$q$, engage_test.pid('pub'), engage_test.u('bob')), '42501');
  perform engage_test.fails(format($q$insert into public.post_shares (post_id, user_id) values (%L, %L)$q$, engage_test.pid('pub'), engage_test.u('carol')), '42501');
  perform engage_test.fails($q$update public.post_shares set post_id = post_id$q$, '42501');
  perform engage_test.fails($q$delete from public.post_shares$q$, '42501');
end $$;
select engage_test.logout();
do $$ begin
  assert (select count(*) from public.post_shares where post_id::text like '1d2%' and user_id <> engage_test.u('carol')) = 0, 'no row got in through the table';
end $$;
rollback;

-- =============================================================================
\echo '== 7. record_post_share lets in exactly the pilgrims the posts policy shows the post to'
-- =============================================================================
begin;
do $$
declare
  v record;
  p record;
  expected boolean;
  seen boolean;
  shared boolean;
  tried integer := 0;
begin
  for v in select name from engage_test.users where name not in ('zed', 'yan') order by name loop
    perform engage_test.login(v.name);
    for p in select label from engage_test.posts order by label loop
      expected := exists (select 1 from engage_test.visible x where x.viewer = v.name and x.post = p.label);
      seen := exists (select 1 from public.posts where id = engage_test.pid(p.label));   -- row level security, as this pilgrim
      begin
        perform public.record_post_share(engage_test.pid(p.label));
        shared := true;
      exception when sqlstate 'P0002' then
        shared := false;
      end;
      assert seen = expected, format('the posts policy: %s looking at the %s post, expected %s', v.name, p.label, expected);
      assert shared = expected, format('record_post_share: %s sharing the %s post, expected %s', v.name, p.label, expected);
      tried := tried + 1;
    end loop;
  end loop;
  assert tried = 63, 'every viewer was tried on every post';   -- 7 viewers x 9 posts
end $$;
select engage_test.logout();
do $$
begin
  assert (select count(*) from public.post_shares where post_id::text like '1d2%') = (select count(*) from engage_test.visible),
         'one share per pilgrim who could see the post, none for the others';
  assert (select coalesce(sum(share_count), 0) from public.posts where id::text like '1d2%') = (select count(*) from engage_test.visible),
         'and the counters add up to the same';
end $$;
rollback;

-- =============================================================================
\echo '== 8. two pilgrims bookmark the same post at the same moment'
-- =============================================================================
-- A recount that starts before the other pilgrim's row is committed does not see it and writes a count that is
-- one too low (the way like_count and comment_count are kept). The trigger locks the post first to avoid that.
-- Two sessions are needed to see it, so this uses dblink, a module that ships with Postgres and needs a
-- superuser. Without either the check is skipped.
select exists (select 1 from pg_available_extensions where name = 'dblink')
       and (select rolsuper from pg_roles where rolname = current_user) as can_dblink,
       not exists (select 1 from pg_extension where extname = 'dblink') as add_dblink \gset
\if :can_dblink
  \if :add_dblink
    create extension dblink;
  \endif
  select engage_test.logout();
  -- session A: the first bookmark, not committed yet
  begin;
  insert into public.post_saves (post_id, user_id) values (engage_test.pid('pub'), engage_test.u('bob'));
  -- session B: the second bookmark, from another connection, sent without waiting for the answer
  select dblink_connect('engage_b', format('host=%s port=%s dbname=%s user=%s',
           (select split_part(setting, ',', 1) from pg_settings where name = 'unix_socket_directories'),
           current_setting('port'), current_database(), current_user));
  select set_config('engage.b_pid', b.pid::text, false) from dblink('engage_b', 'select pg_backend_pid()') as b(pid integer);
  select dblink_send_query('engage_b', format('insert into public.post_saves (post_id, user_id) values (%L, %L)',
           engage_test.pid('pub'), engage_test.u('carol')));
  -- wait until B is stuck behind A (at most 10 seconds), so A commits while B is in the middle of its trigger
  do $$
  declare i integer := 0;
  begin
    loop
      exit when exists (select 1 from pg_stat_activity
                        where pid = current_setting('engage.b_pid')::integer and wait_event_type = 'Lock');
      i := i + 1;
      if i > 200 then raise exception 'the second session never waited for the first one'; end if;
      perform pg_sleep(0.05);
    end loop;
  end $$;
  commit;
  select * from dblink_get_result('engage_b') as t(res text);   -- B finishes (and raises here if it failed)
  select dblink_disconnect('engage_b');
  do $$
  begin
    assert (select count(*) from public.post_saves where post_id = engage_test.pid('pub')) = 2, 'both bookmarks are stored';
    assert engage_test.counts('pub') = '2/0', 'and both are counted (a recount that does not wait for the other session says 1)';
  end $$;
  -- put it back the way it was
  delete from public.post_saves where post_id = engage_test.pid('pub');
  do $$ begin assert engage_test.counts('pub') = '0/0', 'back to zero'; end $$;
  \if :add_dblink
    drop extension dblink;
  \endif
\else
  \echo 'skipped: needs dblink and a superuser'
\endif

-- =============================================================================
\echo '== 9. the migration can run again'
-- =============================================================================
begin;
select engage_test.login('bob');
insert into public.post_saves (post_id) values (engage_test.pid('pub')), (engage_test.pid('story'));
select public.record_post_share(engage_test.pid('pub'));
select engage_test.login('carol');
insert into public.post_saves (post_id) values (engage_test.pid('pub'));
select public.record_post_share(engage_test.pid('pub'));
select engage_test.logout();
do $$
begin
  assert engage_test.counts('pub') = '2/2' and engage_test.counts('story') = '1/0' and engage_test.counts('hidden') = '0/0', 'counters before the re-run';
end $$;
-- bookmarks made while nothing counted them (what the live database has today): switch the counter off, save, switch it on
alter table public.post_saves disable trigger post_saves_counter;
insert into public.post_saves (post_id, user_id) values
  (engage_test.pid('pub'),    engage_test.u('erin')),
  (engage_test.pid('hidden'), engage_test.u('alice'));
alter table public.post_saves enable trigger post_saves_counter;
do $$ begin assert engage_test.counts('pub') = '2/2' and engage_test.counts('hidden') = '0/0', 'the counters are behind by two bookmarks'; end $$;
create temp table engage_rows as select id, ctid as tid from public.posts where id::text like '1d%';

set local client_min_messages = warning;
\ir ../migrations/20261108010000_post_engagement_counters.sql
reset client_min_messages;

do $$
begin
  assert engage_test.counts('pub') = '3/2', 'the backfill found erin''s bookmark';
  assert engage_test.counts('hidden') = '1/0', 'and alice''s own';
  assert engage_test.counts('story') = '1/0', 'a post that was right is still right';
  -- only the two wrong posts were rewritten
  assert (select count(*) from public.posts p join engage_rows r on r.id = p.id where p.ctid <> r.tid) = 2, 'the backfill touched only the two posts that were wrong';
end $$;
select engage_test.check_structure();

-- a second run on correct data changes nothing at all
drop table engage_rows;
create temp table engage_rows as select id, ctid as tid from public.posts where id::text like '1d%';
set local client_min_messages = warning;
\ir ../migrations/20261108010000_post_engagement_counters.sql
reset client_min_messages;
do $$
begin
  assert (select count(*) from public.posts p join engage_rows r on r.id = p.id where p.ctid <> r.tid) = 0, 'the second re-run rewrote no post';
  assert engage_test.counts('pub') = '3/2' and engage_test.counts('hidden') = '1/0' and engage_test.counts('story') = '1/0', 'counts unchanged';
end $$;
select engage_test.check_structure();

-- everything still works after the re-runs
select engage_test.login('alice');
update public.posts set save_count = 99, share_count = 99 where id = engage_test.pid('pub');
do $$ begin assert engage_test.counts('pub') = '3/2', 'the guard still ignores made-up counters'; end $$;
select engage_test.login('erin');
do $$
begin
  assert public.record_post_share(engage_test.pid('pub')) = 3, 'sharing still works';
  assert public.record_post_share(engage_test.pid('pub')) = 3, 'and is still counted once';
end $$;
delete from public.post_saves where post_id = engage_test.pid('pub');
do $$ begin assert engage_test.counts('pub') = '2/3', 'the counter triggers still run'; end $$;
select engage_test.anon();
select engage_test.fails(format($q$select public.record_post_share(%L)$q$, engage_test.pid('pub')), '42501');
rollback;

-- =============================================================================
\echo '== 10. invariants over everything, and clean up'
-- =============================================================================
select engage_test.logout();
do $$
begin
  assert not exists (select 1 from public.posts p
                     where p.save_count  <> (select count(*) from public.post_saves  s where s.post_id = p.id)
                        or p.share_count <> (select count(*) from public.post_shares s where s.post_id = p.id)),
         'every counter in the database matches its rows';
end $$;

-- every pilgrim of this test goes, and with them everything they own
delete from auth.users where id::text like '1d%';
do $$
begin
  assert (select count(*) from public.profiles where id::text like '1d%') = 0, 'pilgrims removed';
  assert (select count(*) from public.posts where id::text like '1d%') = 0, 'posts removed';
  assert (select count(*) from public.post_saves where user_id::text like '1d%' or post_id::text like '1d%') = 0, 'bookmarks removed';
  assert (select count(*) from public.post_shares where user_id::text like '1d%' or post_id::text like '1d%') = 0, 'shares removed';
end $$;
set client_min_messages = warning;
drop schema engage_test cascade;
reset client_min_messages;

\echo 'post_engagement_smoke: all assertions passed'
