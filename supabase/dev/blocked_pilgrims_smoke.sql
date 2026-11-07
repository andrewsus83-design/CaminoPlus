-- Blocked pilgrims and content reports (migration 20261108020000_blocked_pilgrims).
-- Self-contained: creates its own users (ids start with 1d) and removes them at the end, so it can run on any
-- database that has the migrations (and be re-run). Acts as signed-in people the way PostgREST does:
-- request.jwt.claims + set local role.
--
--   1. the migration can be run a second time
--   2. list_blocked_pilgrims(): only my own blocks, newest first, with who they are; nobody learns from it who
--      blocked them; grants and search_path
--   3. the app reports a person, a post and a comment (and a message, see social_smoke.sql): the trigger and the
--      policies of content_reports accept them for things the reporter can see, also right after a block
\set ON_ERROR_STOP 1

-- ---------------------------------------------------------------- helpers
drop schema if exists blocked_test cascade;
create schema blocked_test;
grant usage on schema blocked_test to anon, authenticated;

-- leftovers of a failed earlier run
delete from auth.users where id::text like '1d%';

create table blocked_test.users (name text primary key, id uuid not null);
insert into blocked_test.users (name, id) values
  ('alice', '1d000000-0000-0000-0000-000000000001'),   -- blocks bob and carol
  ('bob',   '1d000000-0000-0000-0000-000000000002'),   -- blocked by alice, writes the posts
  ('carol', '1d000000-0000-0000-0000-000000000003'),   -- blocked by alice, a stranger to bob
  ('dave',  '1d000000-0000-0000-0000-000000000004'),   -- never blocks anyone, comments
  ('erin',  '1d000000-0000-0000-0000-000000000005');   -- bob's friend
grant select on blocked_test.users to anon, authenticated;

create function blocked_test.u(p_name text) returns uuid language sql stable as $$
  select id from blocked_test.users where name = p_name
$$;
create function blocked_test.login(p_name text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', blocked_test.u(p_name), 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;
create function blocked_test.anon() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
end $$;
create function blocked_test.logout() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;
-- the statement must fail; optionally with this SQLSTATE
create function blocked_test.fails(p_sql text, p_state text default null) returns void language plpgsql as $$
declare
  v_msg text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if p_state is not null and sqlstate <> p_state then
      raise exception 'expected SQLSTATE % but got % (%) for: %', p_state, sqlstate, v_msg, p_sql;
    end if;
    return;
  end;
  raise exception 'expected an error but the statement succeeded: %', p_sql;
end $$;
grant execute on all functions in schema blocked_test to anon, authenticated;

-- ---------------------------------------------------------------- people
insert into auth.users (id, email, raw_user_meta_data)
select id, 'zz1d.' || name || '@example.com', jsonb_build_object('full_name', initcap(name) || ' Zzblocked')
from blocked_test.users;
update public.profiles set avatar_url = 'https://example.com/zz1d-bob.png' where id = blocked_test.u('bob');
do $$ begin
  assert (select count(*) from public.profiles where id::text like '1d%') = 5, 'test pilgrims created';
end $$;

-- =============================================================================
-- 1. THE MIGRATION CAN BE RUN AGAIN
-- =============================================================================
\echo '== blocked pilgrims: the migration is re-runnable'
\ir ../migrations/20261108020000_blocked_pilgrims.sql
do $$
begin
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'list_blocked_pilgrims') = 1, 'one list_blocked_pilgrims, not two';
end $$;

-- =============================================================================
-- 2. list_blocked_pilgrims()
-- =============================================================================
\echo '== blocked pilgrims: my own list, newest first'
begin;
select blocked_test.login('alice');
do $$ begin assert (select count(*) from public.list_blocked_pilgrims()) = 0, 'nobody blocked yet'; end $$;
insert into public.blocks (blocked_id) values (blocked_test.u('bob')), (blocked_test.u('carol'));
-- both inserts share one transaction clock: bob's block is made two days older (the server clock cannot be set by a client)
select blocked_test.logout();
update public.blocks set created_at = now() - interval '2 days'
where blocker_id = blocked_test.u('alice') and blocked_id = blocked_test.u('bob');
select blocked_test.login('alice');
do $$
begin
  -- why the function exists: once you block somebody their profile is hidden from you as well
  assert (select count(*) from public.profiles where id = blocked_test.u('bob')) = 0, 'a blocked profile is hidden from the blocker';
  assert (select count(*) from public.profiles where id = blocked_test.u('carol')) = 0, 'so is the second one';
  -- ... and the function still names them
  assert (select count(*) from public.list_blocked_pilgrims()) = 2, 'both blocks are listed';
  assert (select array_agg(user_id) from public.list_blocked_pilgrims()) = array[blocked_test.u('carol'), blocked_test.u('bob')], 'newest first';
  assert (select username from public.list_blocked_pilgrims() where user_id = blocked_test.u('bob')) = 'zz1d.bob', 'username';
  assert (select display_name from public.list_blocked_pilgrims() where user_id = blocked_test.u('bob')) = 'Bob Zzblocked', 'display name';
  assert (select avatar_url from public.list_blocked_pilgrims() where user_id = blocked_test.u('bob')) = 'https://example.com/zz1d-bob.png', 'avatar';
  assert (select avatar_url is null from public.list_blocked_pilgrims() where user_id = blocked_test.u('carol')), 'no avatar stays null';
  assert (select blocked_at < now() - interval '1 day' from public.list_blocked_pilgrims() where user_id = blocked_test.u('bob')), 'blocked_at is when the block was made';
  assert (select blocked_at > now() - interval '1 minute' from public.list_blocked_pilgrims() where user_id = blocked_test.u('carol')), 'and it is the server clock';
  -- blocking twice is one block
  perform blocked_test.fails($q$insert into public.blocks (blocked_id) values (blocked_test.u('bob'))$q$, '23505');
  assert (select count(*) from public.list_blocked_pilgrims()) = 2, 'still two';
end $$;
commit;

\echo '== blocked pilgrims: nobody learns who blocked them, nobody reads somebody else''s list'
begin;
select blocked_test.login('bob');
do $$
begin
  assert (select count(*) from public.list_blocked_pilgrims()) = 0, 'the blocked person gets an empty list, not alice''s';
  assert (select count(*) from public.blocks) = 0, 'and cannot read the blocks table';
  assert (select count(*) from public.profiles where id = blocked_test.u('alice')) = 0, 'alice is hidden from bob, as before';
end $$;
select blocked_test.login('dave');
do $$
begin
  assert (select count(*) from public.list_blocked_pilgrims()) = 0, 'a stranger gets an empty list';
  assert (select count(*) from public.blocks) = 0, 'a stranger reads no blocks';
  -- the function takes no argument: there is nobody else's list to ask for
  assert (select pronargs from pg_proc where oid = 'public.list_blocked_pilgrims()'::regprocedure) = 0, 'no user id argument';
  assert pg_get_function_result('public.list_blocked_pilgrims()'::regprocedure) not ilike '%email%', 'never returns an email';
end $$;
commit;

\echo '== blocked pilgrims: unblock takes the person off the list'
begin;
select blocked_test.login('alice');
delete from public.blocks where blocked_id = blocked_test.u('bob');
do $$
begin
  assert (select array_agg(user_id) from public.list_blocked_pilgrims()) = array[blocked_test.u('carol')], 'bob is off the list';
  assert (select count(*) from public.profiles where id = blocked_test.u('bob')) = 1, 'and his profile is readable again';
  assert not private.is_friend(blocked_test.u('alice'), blocked_test.u('bob')), 'unblocking does not make friends';
end $$;
-- the other direction: nobody blocked alice, so the list of bob stays empty even though alice blocked him once
select blocked_test.login('bob');
do $$ begin assert (select count(*) from public.list_blocked_pilgrims()) = 0, 'bob still has no list'; end $$;
select blocked_test.login('alice');
insert into public.blocks (blocked_id) values (blocked_test.u('bob'));
do $$ begin assert (select count(*) from public.list_blocked_pilgrims()) = 2, 'blocking again lists him again'; end $$;
commit;

\echo '== blocked pilgrims: a deleted profile is listed without a name'
begin;
select blocked_test.logout();
update public.profiles set deleted_at = now() where id = blocked_test.u('carol');
select blocked_test.login('alice');
do $$
begin
  assert (select count(*) from public.list_blocked_pilgrims() where user_id = blocked_test.u('carol')) = 1, 'the block can still be undone';
  assert (select username is null and display_name is null and avatar_url is null
          from public.list_blocked_pilgrims() where user_id = blocked_test.u('carol')), 'but the identity is masked';
  assert (select username is not null from public.list_blocked_pilgrims() where user_id = blocked_test.u('bob')), 'others are not masked';
end $$;
rollback;

\echo '== blocked pilgrims: grants, search_path, no session no answer'
begin;
select blocked_test.logout();
do $$
declare
  r record;
begin
  select p.oid::regprocedure as sig, p.proacl, p.prosecdef, p.proconfig, p.provolatile into r
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'list_blocked_pilgrims';
  assert r.prosecdef, 'security definer';
  assert r.provolatile = 's', 'stable';
  assert r.proconfig is not null and 'search_path=""' = any (r.proconfig), 'search_path is empty';
  assert r.proacl is not null and not exists (select 1 from aclexplode(r.proacl) a where a.grantee = 0), 'not open to PUBLIC';
  assert not has_function_privilege('anon', r.sig, 'execute'), 'not open to anon';
  assert has_function_privilege('authenticated', r.sig, 'execute'), 'signed-in people may call it';
  assert has_function_privilege('service_role', r.sig, 'execute'), 'the service role may call it';
end $$;
select blocked_test.anon();
do $$ begin perform blocked_test.fails($q$select * from public.list_blocked_pilgrims()$q$, '42501'); end $$;
-- signed in with a token that has no user (should not happen): an empty list, never somebody's rows
select blocked_test.logout();
select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
set local role authenticated;
do $$ begin assert (select count(*) from public.list_blocked_pilgrims()) = 0, 'no user, no rows'; end $$;
commit;

-- =============================================================================
-- 3. REPORTS: a person, a post, a comment
-- =============================================================================
\echo '== reports: post, comment and profile reports of things the reporter can see'
begin;
select blocked_test.logout();
-- bob and erin are friends
insert into public.friendships (user_a, user_b, requested_by, status, responded_at)
values (least(blocked_test.u('bob'), blocked_test.u('erin')), greatest(blocked_test.u('bob'), blocked_test.u('erin')), blocked_test.u('bob'), 'accepted', now());
select blocked_test.login('bob');
insert into public.posts (id, kind, visibility, body) values
  ('1d100000-0000-0000-0000-000000000001', 'journal', 'public', 'bob for everybody'),
  ('1d100000-0000-0000-0000-000000000002', 'journal', 'followers', 'bob for friends');
select blocked_test.login('dave');
insert into public.post_comments (id, post_id, body)
values ('1d200000-0000-0000-0000-000000000001', '1d100000-0000-0000-0000-000000000001', 'a rude comment');

-- carol (a stranger to bob, who alice blocked, which does not matter to her) reports what she can read
select blocked_test.login('carol');
do $$
begin
  assert (select count(*) from public.posts where id = '1d100000-0000-0000-0000-000000000001') = 1, 'carol sees the public post';
  assert (select count(*) from public.post_comments where id = '1d200000-0000-0000-0000-000000000001') = 1, 'carol sees the comment';
  assert (select count(*) from public.profiles where id = blocked_test.u('bob')) = 1, 'carol sees bob''s profile';
  insert into public.content_reports (target_type, target_id, reason, details)
  values ('post', '1d100000-0000-0000-0000-000000000001', 'spam', '  selling things  ');
  insert into public.content_reports (target_type, target_id, reason)
  values ('comment', '1d200000-0000-0000-0000-000000000001', 'harassment');
  insert into public.content_reports (target_type, target_id, reason)
  values ('profile', blocked_test.u('bob'), 'privacy');
  assert (select count(*) from public.content_reports) = 3, 'carol sent three reports and reads her own back';
  assert (select count(*) from public.content_reports where target_type = 'post' and target_id = '1d100000-0000-0000-0000-000000000001'
            and reason = 'spam' and status = 'open' and reporter_id = blocked_test.u('carol')) = 1, 'post report: reporter and status are the server''s';
  -- a second report of the same thing is refused by the unique key (the app counts that as sent)
  perform blocked_test.fails($q$insert into public.content_reports (target_type, target_id, reason)
    values ('post', '1d100000-0000-0000-0000-000000000001', 'hate')$q$, '23505');
  perform blocked_test.fails($q$insert into public.content_reports (target_type, target_id, reason)
    values ('profile', blocked_test.u('bob'), 'spam')$q$, '23505');
  -- the client cannot plant evidence or a message link on these kinds, nor report as somebody else
  insert into public.content_reports (target_type, target_id, reason, evidence, message_id)
  values ('profile', blocked_test.u('dave'), 'other', '{"x": 1}', null);
  assert (select evidence is null and message_id is null from public.content_reports where target_id = blocked_test.u('dave')), 'no planted evidence';
  perform blocked_test.fails(format($q$insert into public.content_reports (reporter_id, target_type, target_id, reason)
    values (%L, 'profile', %L, 'spam')$q$, blocked_test.u('bob'), blocked_test.u('erin')), '42501');
  -- the list of reasons and kinds is closed
  perform blocked_test.fails(format($q$insert into public.content_reports (target_type, target_id, reason)
    values ('conversation', %L, 'spam')$q$, gen_random_uuid()), '23514');
  perform blocked_test.fails(format($q$insert into public.content_reports (target_type, target_id, reason)
    values ('post', %L, 'because')$q$, gen_random_uuid()), '23514');
  perform blocked_test.fails(format($q$insert into public.content_reports (target_type, target_id, reason, details)
    values ('post', %L, 'spam', repeat('x', 1001))$q$, gen_random_uuid()), '23514');
end $$;

-- erin is bob's friend: she sees the friends-only post, so she can report it
select blocked_test.login('erin');
do $$
begin
  assert (select count(*) from public.posts where id = '1d100000-0000-0000-0000-000000000002') = 1, 'a friend sees the friends-only post';
  insert into public.content_reports (target_type, target_id, reason)
  values ('post', '1d100000-0000-0000-0000-000000000002', 'misinformation');
  assert (select count(*) from public.content_reports) = 1, 'erin reads only her own report';
end $$;
select blocked_test.login('carol');
do $$ begin assert (select count(*) from public.posts where id = '1d100000-0000-0000-0000-000000000002') = 0, 'a stranger does not see the friends-only post'; end $$;

-- report after block: alice blocked bob, can no longer read his profile, and can still report him
select blocked_test.login('alice');
do $$
begin
  assert (select count(*) from public.profiles where id = blocked_test.u('bob')) = 0, 'alice cannot read bob''s profile';
  insert into public.content_reports (target_type, target_id, reason) values ('profile', blocked_test.u('bob'), 'harassment');
  assert (select count(*) from public.content_reports where target_id = blocked_test.u('bob') and target_type = 'profile') = 1, 'report after a block went through';
end $$;
-- the same from the other side: bob, who was blocked, reports alice
select blocked_test.login('bob');
do $$
begin
  insert into public.content_reports (target_type, target_id, reason) values ('profile', blocked_test.u('alice'), 'harassment');
  assert (select count(*) from public.content_reports) = 1, 'bob reads only his own report';
  assert (select count(*) from public.content_reports where reporter_id = blocked_test.u('carol')) = 0, 'never somebody else''s';
end $$;
-- the pilgrim who is reported never sees the report, and the team does
select blocked_test.login('dave');
do $$ begin assert (select count(*) from public.content_reports where target_id = blocked_test.u('dave') or target_id = '1d200000-0000-0000-0000-000000000001') = 0, 'the person reported cannot read the report'; end $$;
select blocked_test.logout();
set local role service_role;
do $$ begin assert (select count(*) from public.content_reports where reporter_id::text like '1d%') = 7, 'the team reads every report'; end $$;
reset role;
commit;

\echo '== reports: every reason and kind the app sends is allowed by the database'
do $$
declare
  def_reason text := (select pg_get_constraintdef(oid) from pg_constraint
                      where conrelid = 'public.content_reports'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%reason%');
  def_target text := (select pg_get_constraintdef(oid) from pg_constraint
                      where conrelid = 'public.content_reports'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%target_type%');
  k text;
begin
  -- the list of REPORT_REASONS in mobile/src/features/social/logic.ts (and the type ReportReason)
  foreach k in array array['spam', 'harassment', 'nudity', 'violence', 'hate', 'privacy', 'other', 'misinformation'] loop
    assert def_reason like '%''' || k || '''%', 'reason ' || k || ' is allowed';
  end loop;
  -- ReportTarget in mobile/src/features/social/types.ts
  foreach k in array array['message', 'profile', 'post', 'comment'] loop
    assert def_target like '%''' || k || '''%', 'target ' || k || ' is allowed';
  end loop;
end $$;

-- =============================================================================
-- CLEAN UP: every pilgrim of this test goes, and with them everything they own
-- =============================================================================
delete from auth.users where id::text like '1d%';
do $$
begin
  assert (select count(*) from public.profiles where id::text like '1d%') = 0, 'pilgrims removed';
  assert (select count(*) from public.blocks where blocker_id::text like '1d%' or blocked_id::text like '1d%') = 0, 'blocks removed';
  assert (select count(*) from public.content_reports where reporter_id::text like '1d%') = 0, 'reports removed';
  assert (select count(*) from public.posts where id::text like '1d1%') = 0, 'posts removed';
  assert (select count(*) from public.post_comments where id::text like '1d2%') = 0, 'comments removed';
  assert (select count(*) from public.friendships where user_a::text like '1d%' or user_b::text like '1d%') = 0, 'friendships removed';
end $$;
drop schema blocked_test cascade;
