-- Friends, chat and notifications smoke test (migration 20261107010000_friends_chat_notifications).
-- Self-contained: creates its own users (ids start with 1c) and removes them at the end, so it
-- can run on any database that has the migrations (and be re-run).
-- Acts as signed-in people the way PostgREST does: request.jwt.claims + set local role.
\set ON_ERROR_STOP 1

-- ---------------------------------------------------------------- helpers
drop schema if exists social_test cascade;
create schema social_test;
grant usage on schema social_test to anon, authenticated;

-- leftovers of a failed earlier run
delete from auth.users where id::text like '1c%';
delete from public.conversations c
where not exists (select 1 from public.conversation_members m where m.conversation_id = c.id);

create table social_test.users (name text primary key, id uuid not null);
insert into social_test.users (name, id) values
  ('alice',   '1c000000-0000-0000-0000-000000000001'),
  ('bob',     '1c000000-0000-0000-0000-000000000002'),
  ('carol',   '1c000000-0000-0000-0000-000000000003'),
  ('dave',    '1c000000-0000-0000-0000-000000000004'),
  ('erin',    '1c000000-0000-0000-0000-000000000005'),
  ('frank',   '1c000000-0000-0000-0000-000000000006'),
  ('grace',   '1c000000-0000-0000-0000-000000000007'),
  ('heidi',   '1c000000-0000-0000-0000-000000000008'),
  ('ivan',    '1c000000-0000-0000-0000-000000000009'),
  ('judy',    '1c000000-0000-0000-0000-00000000000a'),
  ('mallory', '1c000000-0000-0000-0000-00000000000f');
grant select on social_test.users to anon, authenticated;

-- named things the tests share (conversation ids)
create table social_test.ctx (key text primary key, val uuid);
grant select, insert, update, delete on social_test.ctx to authenticated;

create function social_test.u(p_name text) returns uuid language sql stable as $$
  select id from social_test.users where name = p_name
$$;
create function social_test.bulk(i integer) returns uuid language sql immutable as $$
  select ('1c10' || lpad(i::text, 4, '0') || '-0000-0000-0000-000000000000')::uuid
$$;
create function social_test.set_ctx(p_key text, p_val uuid) returns uuid language plpgsql as $$
begin
  insert into social_test.ctx values (p_key, p_val) on conflict (key) do update set val = excluded.val;
  return p_val;
end $$;
create function social_test.c(p_key text) returns uuid language sql stable as $$
  select val from social_test.ctx where key = p_key
$$;

-- become a signed-in person (works from the owner and from another test user)
create function social_test.login(p_id uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;
create function social_test.login(p_name text) returns void language plpgsql as $$
begin
  perform social_test.login(social_test.u(p_name));
end $$;
create function social_test.anon() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
end $$;
create function social_test.logout() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

-- the statement must fail; optionally with this SQLSTATE and this hint
create function social_test.fails(p_sql text, p_state text default null, p_hint text default null)
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
create function social_test.affected(p_sql text) returns integer language plpgsql as $$
declare n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;

-- accepted friendship without the request dance (call as the owner, not as a signed-in user)
create function social_test.befriend(a uuid, b uuid) returns void language sql as $$
  insert into public.friendships (user_a, user_b, requested_by, status, responded_at)
  values (least(a, b), greatest(a, b), a, 'accepted', now())
  on conflict (user_a, user_b) do update set status = 'accepted', responded_at = now()
$$;

grant execute on all functions in schema social_test to anon, authenticated;

-- ---------------------------------------------------------------- people
insert into auth.users (id, email, raw_user_meta_data)
select id, 'zz1c.' || name || '@example.com', jsonb_build_object('full_name', initcap(name) || ' Zzcamino')
from social_test.users;
-- bulk pilgrims for the limit tests
insert into auth.users (id, email)
select social_test.bulk(i), 'zz1c.bulk' || i || '@example.com' from generate_series(1, 60) i;

do $$ begin
  assert (select count(*) from public.profiles where id::text like '1c%') = 71, 'test pilgrims created';
  assert (select username from public.profiles where id = social_test.u('alice')) = 'zz1c.alice', 'username from email';
  assert (select friends_count from public.profiles where id = social_test.u('alice')) = 0, 'friends_count starts at 0';
end $$;

-- =============================================================================
-- FRIENDS
-- =============================================================================
\echo '== friends: request, accept, counters'
begin;
select social_test.login('alice');
do $$
begin
  assert public.send_friend_request(social_test.u('bob')) = 'pending', 'request is pending';
  assert public.send_friend_request(social_test.u('bob')) = 'pending', 'asking twice is idempotent';
  perform social_test.fails($q$select public.send_friend_request(social_test.u('alice'))$q$, '22023', 'friend_self');
  perform social_test.fails($q$select public.send_friend_request(null)$q$, '22023', 'friend_self');
  perform social_test.fails($q$select public.send_friend_request(gen_random_uuid())$q$, 'P0002', 'not_found');
  perform social_test.fails($q$select public.respond_friend_request(social_test.u('bob'), true)$q$, '42501', 'not_allowed');
  assert (select count(*) from public.list_friend_requests()
          where direction = 'outgoing' and id = social_test.u('bob')) = 1, 'outgoing request listed';
  assert (select count(*) from public.list_friend_requests() where direction = 'incoming') = 0, 'nothing incoming';
  assert not private.is_friend(social_test.u('alice'), social_test.u('bob')), 'pending is not friendship';
  -- friendships are written by RPCs only
  perform social_test.fails($q$insert into public.friendships (user_a, user_b, requested_by, status)
    values (social_test.u('alice'), social_test.u('carol'), social_test.u('alice'), 'accepted')$q$, '42501');
  perform social_test.fails($q$update public.friendships set status = 'accepted'$q$, '42501');
  perform social_test.fails($q$delete from public.friendships$q$, '42501');
  assert (select friends_count from public.profiles where id = social_test.u('alice')) = 0, 'no friends yet';
end $$;

select social_test.login('bob');
do $$
declare v_title text;
begin
  assert (select notifications from public.get_unread_totals()) = 1, 'bob has one unread notification';
  assert (select friend_requests from public.get_unread_totals()) = 1, 'bob has one request waiting';
  select title into v_title from public.notifications where kind = 'friend_request' and actor_id = social_test.u('alice');
  assert v_title = 'Alice Zzcamino sent you a friend request', 'request notification text';
  assert (select data ->> 'friend_id' from public.notifications where kind = 'friend_request')
         = social_test.u('alice')::text, 'request notification data';
  assert (select count(*) from public.list_friend_requests()
          where direction = 'incoming' and id = social_test.u('alice')) = 1, 'incoming request listed';
  perform social_test.fails($q$select public.cancel_friend_request(social_test.u('alice'))$q$, '42501', 'not_allowed');
  assert public.respond_friend_request(social_test.u('alice'), true) = 'accepted', 'bob accepts';
  assert public.respond_friend_request(social_test.u('alice'), true) = 'accepted', 'accepting twice is harmless';
  perform social_test.fails($q$select public.respond_friend_request(social_test.u('alice'), false)$q$, '22023', 'already_friends');
  perform social_test.fails($q$select public.cancel_friend_request(social_test.u('alice'))$q$, '22023', 'already_friends');
  assert private.is_friend(social_test.u('bob'), social_test.u('alice')), 'friends, both directions';
  assert (select friends_count from public.profiles where id = social_test.u('bob')) = 1, 'bob friends_count';
  assert (select friend_requests from public.get_unread_totals()) = 0, 'request answered';
  assert (select read_at is not null from public.notifications where kind = 'friend_request'), 'request notification read';
end $$;

select social_test.login('alice');
do $$
begin
  assert public.send_friend_request(social_test.u('bob')) = 'already_friends', 'already friends';
  assert (select friends_count from public.profiles where id = social_test.u('alice')) = 1, 'alice friends_count';
  assert (select count(*) from public.notifications
          where kind = 'friend_accepted' and actor_id = social_test.u('bob')) = 1, 'alice is told bob said yes';
  assert (select count(*) from public.list_friends()
          where id = social_test.u('bob') and display_name = 'Bob Zzcamino') = 1, 'friend listed';
  assert (select count(*) from public.friendships) = 1, 'alice sees only her own friendship';
  update public.profiles set friends_count = 99, bio = 'walking' where id = social_test.u('alice');
  assert (select friends_count from public.profiles where id = social_test.u('alice')) = 1, 'friends_count is server owned';
  assert (select bio from public.profiles where id = social_test.u('alice')) = 'walking', 'bio is still editable';
  -- the guard still covers every server-owned column of the profile
  update public.profiles set xp = 9, level = 9, followers_count = 9, following_count = 9, posts_count = 9,
         stamps_count = 9, km_walked = 9, deleted_at = now() where id = social_test.u('alice');
  assert (select xp = 0 and level = 1 and followers_count = 0 and following_count = 0 and posts_count = 0
                 and stamps_count = 0 and km_walked = 0 and deleted_at is null
          from public.profiles where id = social_test.u('alice')), 'every server-owned profile column is guarded';
  assert (select count(*) from public.follows where follower_id = social_test.u('alice') or followee_id = social_test.u('alice')) = 0,
         'friendship does not touch follows';
end $$;

select social_test.login('mallory');
do $$
begin
  assert (select count(*) from public.friendships) = 0, 'strangers see no friendships';
  assert (select count(*) from public.notifications) = 0, 'strangers see no notifications';
  assert (select count(*) from public.list_friends()) = 0, 'no friends yet';
end $$;
commit;

\echo '== friends: cancel, asking back, decline and ask again'
begin;
select social_test.login('carol');
do $$ begin assert public.send_friend_request(social_test.u('dave')) = 'pending', 'carol asks dave'; end $$;
select social_test.login('dave');
do $$
begin
  assert (select count(*) from public.notifications
          where kind = 'friend_request' and actor_id = social_test.u('carol')) = 1, 'dave is notified';
  perform social_test.fails($q$select public.cancel_friend_request(social_test.u('carol'))$q$, '42501', 'not_allowed');
end $$;
select social_test.login('carol');
do $$
begin
  assert public.cancel_friend_request(social_test.u('dave')) = 'cancelled', 'carol cancels';
  assert public.cancel_friend_request(social_test.u('dave')) = 'cancelled', 'cancelling twice is harmless';
  assert (select count(*) from public.list_friend_requests()) = 0, 'nothing pending';
  assert public.send_friend_request(social_test.u('dave')) = 'pending', 'carol asks again';
end $$;
select social_test.login('dave');
do $$
begin
  assert (select count(*) from public.notifications
          where kind = 'friend_request' and actor_id = social_test.u('carol')) = 1, 'cancel removed the first notification';
  assert public.send_friend_request(social_test.u('carol')) = 'accepted', 'asking back accepts';
  assert private.is_friend(social_test.u('dave'), social_test.u('carol')), 'friends after asking back';
  assert (select count(*) from public.notifications
          where kind = 'friend_request' and actor_id = social_test.u('carol') and read_at is not null) = 1, 'old request read';
end $$;
select social_test.login('carol');
do $$
begin
  assert (select count(*) from public.notifications
          where kind = 'friend_accepted' and actor_id = social_test.u('dave')) = 1, 'carol is told dave said yes';
  assert (select friends_count from public.profiles where id = social_test.u('carol')) = 1, 'carol friends_count';
end $$;

select social_test.login('erin');
do $$ begin assert public.send_friend_request(social_test.u('alice')) = 'pending', 'erin asks alice'; end $$;
select social_test.login('alice');
do $$
begin
  assert public.respond_friend_request(social_test.u('erin'), false) = 'declined', 'alice declines';
  assert public.respond_friend_request(social_test.u('erin'), false) = 'declined', 'declining twice is harmless';
  assert (select count(*) from public.notifications
          where kind = 'friend_request' and actor_id = social_test.u('erin')) = 0, 'declined request leaves no notification';
  perform social_test.fails($q$select public.respond_friend_request(social_test.u('erin'), true)$q$, 'P0002', 'no_pending_request');
end $$;
select social_test.login('erin');
do $$
begin
  assert (select count(*) from public.list_friend_requests()) = 0, 'declined request is gone for erin too';
  assert public.send_friend_request(social_test.u('alice')) = 'pending', 'erin can ask again';
end $$;
select social_test.login('alice');
do $$
begin
  assert (select count(*) from public.notifications
          where kind = 'friend_request' and actor_id = social_test.u('erin') and read_at is null) = 1, 'alice is notified again';
  assert public.respond_friend_request(social_test.u('erin'), true) = 'accepted', 'alice accepts erin this time';
end $$;
commit;

\echo '== friends: blocks'
begin;
select social_test.login('frank');
do $$ begin assert public.send_friend_request(social_test.u('grace')) = 'pending', 'frank asks grace'; end $$;
select social_test.login('grace');
insert into public.blocks (blocked_id) values (social_test.u('frank'));
do $$
begin
  assert (select count(*) from public.notifications where kind = 'friend_request') = 0, 'block removed the request notification';
  assert (select count(*) from public.list_friend_requests()) = 0, 'block removed the pending request';
  perform social_test.fails($q$select public.send_friend_request(social_test.u('frank'))$q$, 'P0002', 'not_found');
  assert (select count(*) from public.search_pilgrims('zz1c.frank') where id = social_test.u('frank')) = 0, 'blocked pilgrim is not found';
end $$;
select social_test.login('frank');
do $$
begin
  assert (select count(*) from public.list_friend_requests()) = 0, 'frank sees no pending request';
  perform social_test.fails($q$select public.send_friend_request(social_test.u('grace'))$q$, 'P0002', 'not_found');
  assert (select count(*) from public.search_pilgrims('zz1c.grace') where id = social_test.u('grace')) = 0, 'cannot find the pilgrim who blocked you';
end $$;
select social_test.logout();
select social_test.befriend(social_test.u('heidi'), social_test.u('grace'));
do $$ begin assert (select friends_count from public.profiles where id = social_test.u('heidi')) = 1, 'counter follows insert'; end $$;
select social_test.login('heidi');
insert into public.blocks (blocked_id) values (social_test.u('grace'));
do $$
begin
  assert not private.is_friend(social_test.u('heidi'), social_test.u('grace')), 'block removed the friendship';
  assert (select friends_count from public.profiles where id = social_test.u('heidi')) = 0, 'heidi counter after block';
end $$;
select social_test.logout();
do $$ begin assert (select friends_count from public.profiles where id = social_test.u('grace')) = 0, 'grace counter after block'; end $$;
delete from public.blocks where blocker_id in (social_test.u('grace'), social_test.u('heidi'));
commit;

\echo '== friends: 50 pending requests at most'
begin;
select social_test.login(social_test.bulk(51));
do $$ begin assert public.send_friend_request(social_test.u('judy')) = 'pending', 'bulk 51 asks judy first'; end $$;
select social_test.login('judy');
do $$
declare i integer;
begin
  for i in 1..50 loop
    assert public.send_friend_request(social_test.bulk(i)) = 'pending', 'judy request ' || i;
  end loop;
  perform social_test.fails($q$select public.send_friend_request(social_test.bulk(52))$q$, '54000', 'friend_request_limit');
  assert public.send_friend_request(social_test.bulk(51)) = 'accepted', 'asking back works at the limit';
  assert public.send_friend_request(social_test.bulk(1)) = 'pending', 'repeating a pending request is not a new one';
  perform social_test.fails($q$select public.remove_friend(social_test.bulk(2))$q$, '22023', 'not_friends');
end $$;
select social_test.login(social_test.bulk(1));
do $$ begin assert public.respond_friend_request(social_test.u('judy'), true) = 'accepted', 'bulk 1 accepts'; end $$;
select social_test.login('judy');
do $$ begin assert public.send_friend_request(social_test.bulk(52)) = 'pending', 'a slot is free again'; end $$;
commit;

\echo '== friends: search'
begin;
select social_test.login('alice');
do $$
begin
  assert (select count(*) from public.search_pilgrims('z')) = 0, 'one character finds nothing';
  assert (select count(*) from public.search_pilgrims('   ')) = 0, 'blank finds nothing';
  assert (select count(*) from public.search_pilgrims(null)) = 0, 'null finds nothing';
  assert (select count(*) from public.search_pilgrims('%%')) = 0, 'percent signs are literal';
  assert (select count(*) from public.search_pilgrims('__')) = 0, 'underscores are literal';
  assert (select friend_status from public.search_pilgrims('zz1c.bob') where id = social_test.u('bob')) = 'friends', 'friend status: friends';
  assert (select friend_status from public.search_pilgrims('@zz1c.carol') where id = social_test.u('carol')) = 'none', 'leading @ is ignored, status none';
  assert (select id from public.search_pilgrims('zz1c.bob') limit 1) = social_test.u('bob'), 'exact match comes first';
  assert (select count(*) from public.search_pilgrims('zzcamino') where id = social_test.u('erin')) = 1, 'display name match';
  assert (select count(*) from public.search_pilgrims('zz1c') where id = social_test.u('alice')) = 0, 'never returns yourself';
  assert (select count(*) from public.search_pilgrims('zz1c', 3)) = 3, 'limit is honoured';
  assert (select count(*) from public.search_pilgrims('zz1c', 1000)) <= 50, 'limit is capped at 50';
  assert (select is_private from public.search_pilgrims('zz1c.bob') where id = social_test.u('bob')) = false, 'is_private is returned';
  assert pg_get_function_result('public.search_pilgrims(text,integer)'::regprocedure) not ilike '%email%', 'search never returns email';
end $$;
select social_test.login('judy');
do $$ begin
  assert (select friend_status from public.search_pilgrims('zz1c.bulk52') where id = social_test.bulk(52)) = 'pending_out', 'status pending_out';
end $$;
select social_test.login(social_test.bulk(52));
do $$ begin
  assert (select friend_status from public.search_pilgrims('zz1c.judy') where id = social_test.u('judy')) = 'pending_in', 'status pending_in';
end $$;
-- deleted profiles disappear from search and lists
select social_test.logout();
update public.profiles set deleted_at = now() where id = social_test.u('ivan');
select social_test.login('alice');
do $$ begin
  assert (select count(*) from public.search_pilgrims('zz1c.ivan') where id = social_test.u('ivan')) = 0, 'deleted profile is not found';
end $$;
select social_test.logout();
update public.profiles set deleted_at = null where id = social_test.u('ivan');
commit;

\echo '== visibility: a friend counts like a follower'
begin;
select social_test.login('dave');
update public.profiles set is_private = true where id = social_test.u('dave');
insert into public.posts (id, kind, visibility, body) values
  ('1c000000-0000-0000-0000-0000000000d1', 'journal', 'public', 'dave public'),
  ('1c000000-0000-0000-0000-0000000000d2', 'journal', 'followers', 'dave followers'),
  ('1c000000-0000-0000-0000-0000000000d3', 'journal', 'private', 'dave private');
insert into public.journeys (id, route_id, status, visibility)
select '1c000000-0000-0000-0000-0000000000e1', id, 'active', 'followers' from public.routes limit 1;
insert into public.journey_days (journey_id, day_number, status) values ('1c000000-0000-0000-0000-0000000000e1', 1, 'planned');
insert into public.user_stamps (journey_id, place_name, stamped_at) values ('1c000000-0000-0000-0000-0000000000e1', 'Somewhere on the way', now());
select social_test.login('carol');
do $$
begin
  assert (select count(*) from public.posts where user_id = social_test.u('dave')) = 2, 'friend sees public and followers posts of a private account';
  assert (select count(*) from public.posts where id = '1c000000-0000-0000-0000-0000000000d3') = 0, 'but not private posts';
  assert (select count(*) from public.journeys where user_id = social_test.u('dave')) = 1, 'friend sees the journey';
  assert (select count(*) from public.journey_days where user_id = social_test.u('dave')) = 1, 'friend sees the plan';
  assert (select count(*) from public.user_stamps where user_id = social_test.u('dave')) = 1, 'friend sees the passport';
end $$;
select social_test.login('bob');
do $$
begin
  assert (select count(*) from public.posts where user_id = social_test.u('dave')) = 0, 'a stranger sees nothing of a private account';
  assert (select count(*) from public.journeys where user_id = social_test.u('dave')) = 0, 'a stranger sees no journey';
  assert (select count(*) from public.journey_days where user_id = social_test.u('dave')) = 0, 'a stranger sees no plan';
  assert (select count(*) from public.user_stamps where user_id = social_test.u('dave')) = 0, 'a stranger sees no passport';
end $$;
select social_test.login('carol');
select public.remove_friend(social_test.u('dave'));
do $$
begin
  assert (select count(*) from public.posts where user_id = social_test.u('dave')) = 0, 'unfriended: posts hidden again';
  assert (select count(*) from public.journeys where user_id = social_test.u('dave')) = 0, 'unfriended: journey hidden again';
  assert (select count(*) from public.journey_days where user_id = social_test.u('dave')) = 0, 'unfriended: plan hidden again';
  assert (select count(*) from public.user_stamps where user_id = social_test.u('dave')) = 0, 'unfriended: passport hidden again';
  assert public.remove_friend(social_test.u('dave')) = 'removed', 'removing twice is harmless';
  assert (select friends_count from public.profiles where id = social_test.u('carol')) = 0, 'carol counter after unfriend';
  assert public.send_friend_request(social_test.u('dave')) = 'pending', 'carol asks dave again';
end $$;
select social_test.login('dave');
do $$
begin
  assert public.respond_friend_request(social_test.u('carol'), true) = 'accepted', 'dave accepts';
  assert public.remove_friend(social_test.u('mallory')) = 'removed', 'removing a stranger is a no-op';
end $$;
commit;

-- =============================================================================
-- DIRECT CHAT
-- =============================================================================
\echo '== chat: direct chats, sending, retries'
begin;
select social_test.login('alice');
do $$
declare
  v_conv uuid;
  v_m1 uuid := '1c0000a0-0000-0000-0000-000000000001';
  v_m2 uuid := '1c0000a0-0000-0000-0000-000000000002';
  v_m3 uuid := '1c0000a0-0000-0000-0000-000000000003';
  v_m4 uuid := '1c0000a0-0000-0000-0000-000000000004';
begin
  perform social_test.fails($q$select public.start_direct_chat(social_test.u('alice'))$q$, '22023', 'invalid_input');
  perform social_test.fails($q$select public.start_direct_chat(social_test.u('mallory'))$q$, '42501', 'chat_friends_only');
  perform social_test.fails($q$select public.start_direct_chat(gen_random_uuid())$q$, 'P0002', 'not_found');
  v_conv := public.start_direct_chat(social_test.u('bob'));
  perform social_test.set_ctx('ab', v_conv);
  assert public.start_direct_chat(social_test.u('bob')) = v_conv, 'the same chat comes back';
  assert (select count(*) from public.conversations where id = v_conv and kind = 'direct') = 1, 'conversation visible to a member';
  assert (select count(*) from public.conversation_members where conversation_id = v_conv and left_at is null) = 2, 'two members';
  assert (select direct_key from public.conversations where id = v_conv)
         = least(social_test.u('alice'), social_test.u('bob'))::text || ':' || greatest(social_test.u('alice'), social_test.u('bob'))::text,
         'direct_key is the ordered pair';

  insert into public.messages (id, conversation_id, body) values (v_m1, v_conv, 'Hello Bob');
  assert (select sender_id from public.messages where id = v_m1) = social_test.u('alice'), 'sender defaults to me';
  assert (select last_message_preview from public.conversations where id = v_conv) = 'Hello Bob', 'inbox preview';
  assert (select last_message_sender from public.conversations where id = v_conv) = social_test.u('alice'), 'inbox sender';

  -- forged times and tombstones from the client are ignored
  insert into public.messages (id, conversation_id, body, created_at, updated_at, deleted_at, edited_at, client_created_at)
  values (v_m2, v_conv, 'forged', '2000-01-01', '2000-01-01', now(), now(), now() + interval '1 day');
  assert (select created_at > clock_timestamp() - interval '1 minute' and updated_at > clock_timestamp() - interval '1 minute'
                 and deleted_at is null and edited_at is null and client_created_at <= now()
          from public.messages where id = v_m2), 'the server owns the clock and the tombstones';

  -- who may send what
  perform social_test.fails(format($q$insert into public.messages (conversation_id, sender_id, body)
    values (%L, social_test.u('bob'), 'as bob')$q$, v_conv), '42501');
  perform social_test.fails(format($q$insert into public.messages (conversation_id, kind, body)
    values (%L, 'system', 'fake system message')$q$, v_conv), '42501');
  perform social_test.fails(format($q$insert into public.messages (conversation_id, body) values (%L, '   ')$q$, v_conv), '23514');
  perform social_test.fails(format($q$insert into public.messages (conversation_id, kind) values (%L, 'text')$q$, v_conv), '23514');
  perform social_test.fails(format($q$insert into public.messages (conversation_id, body) values (%L, repeat('x', 4001))$q$, v_conv), '23514');
  perform social_test.fails(format($q$insert into public.messages (conversation_id, kind) values (%L, 'image')$q$, v_conv), '23514');
  perform social_test.fails(format($q$insert into public.messages (conversation_id, body, media_path)
    values (%L, 'text with a photo', %L)$q$, v_conv, social_test.u('alice')::text || '/chat/' || v_conv || '/p.jpg'), '23514');
  -- a photo must sit in my own folder, under this conversation
  perform social_test.fails(format($q$insert into public.messages (conversation_id, kind, media_path) values (%L, 'image', %L)$q$,
    v_conv, social_test.u('bob')::text || '/chat/' || v_conv || '/p.jpg'), '23514');
  perform social_test.fails(format($q$insert into public.messages (conversation_id, kind, media_path) values (%L, 'image', %L)$q$,
    v_conv, social_test.u('alice')::text || '/posts/p.jpg'), '23514');
  perform social_test.fails(format($q$insert into public.messages (conversation_id, kind, media_path) values (%L, 'image', %L)$q$,
    v_conv, social_test.u('alice')::text || '/chat/' || gen_random_uuid() || '/p.jpg'), '23514');
  perform social_test.fails(format($q$insert into public.messages (conversation_id, kind, media_path) values (%L, 'image', %L)$q$,
    v_conv, social_test.u('alice')::text || '/chat/' || v_conv || '/../p.jpg'), '23514');

  insert into public.messages (id, conversation_id, kind, media_path, body)
  values (v_m3, v_conv, 'image', social_test.u('alice')::text || '/chat/' || v_conv || '/p1.jpg', 'at the pass');
  assert (select last_message_preview from public.conversations where id = v_conv) = 'Photo: at the pass', 'photo preview with caption';
  insert into public.messages (id, conversation_id, kind, media_path)
  values (v_m4, v_conv, 'image', social_test.u('alice')::text || '/chat/' || v_conv || '/p2.jpg');
  assert (select last_message_preview from public.conversations where id = v_conv) = 'Photo', 'photo preview';
  insert into public.messages (conversation_id, body, reply_to) values (v_conv, 'replying to the first one', v_m1);
  assert (select count(*) from public.messages where reply_to = v_m1) = 1, 'reply stored';

  -- retries (offline outbox): ignoring duplicates is the way, a plain duplicate is a 23505
  assert social_test.affected(format($q$insert into public.messages (id, conversation_id, body)
    values (%L, %L, 'Hello Bob') on conflict (id) do nothing$q$, v_m1, v_conv)) = 0, 'retry with on conflict do nothing is ignored';
  insert into public.messages (id, conversation_id, body)
  select id, conversation_id, body
  from json_populate_recordset(null::public.messages,
    format('[{"id": "%s", "conversation_id": "%s", "body": "Hello Bob"}]', v_m1, v_conv)::json)
  on conflict (id) do nothing;
  assert (select count(*) from public.messages where id = v_m1) = 1, 'no duplicate after retries';
  perform social_test.fails(format($q$insert into public.messages (id, conversation_id, body) values (%L, %L, 'Hello Bob')$q$, v_m1, v_conv), '23505');
  -- with RETURNING (Prefer: return=representation): a new id comes back, a known id does not
  declare v_n integer;
  begin
    with ins as (insert into public.messages (id, conversation_id, body)
                 values ('1c0000a0-0000-0000-0000-000000000008', v_conv, 'returning') on conflict (id) do nothing returning id)
    select count(*) into v_n from ins;
    assert v_n = 1, 'a new message is returned';
    with ins as (insert into public.messages (id, conversation_id, body)
                 values ('1c0000a0-0000-0000-0000-000000000008', v_conv, 'returning') on conflict (id) do nothing returning id)
    select count(*) into v_n from ins;
    assert v_n = 0, 'a known id returns nothing';
  end;
  -- upsert that would rewrite the row needs UPDATE rights, which clients do not have
  perform social_test.fails(format($q$insert into public.messages (id, conversation_id, body) values (%L, %L, 'rewritten')
    on conflict (id) do update set body = excluded.body$q$, v_m1, v_conv), '42501');

  -- everything else is RPC only
  perform social_test.fails(format($q$update public.messages set body = 'edited' where id = %L$q$, v_m1), '42501');
  perform social_test.fails(format($q$delete from public.messages where id = %L$q$, v_m1), '42501');
  perform social_test.fails(format($q$update public.conversations set title = 'x' where id = %L$q$, v_conv), '42501');
  perform social_test.fails(format($q$delete from public.conversations where id = %L$q$, v_conv), '42501');
  perform social_test.fails($q$insert into public.conversations (kind, title) values ('group', 'mine')$q$, '42501');
  perform social_test.fails(format($q$insert into public.conversation_members (conversation_id, user_id) values (%L, social_test.u('mallory'))$q$, v_conv), '42501');
  perform social_test.fails(format($q$update public.conversation_members set role = 'owner' where conversation_id = %L$q$, v_conv), '42501');
  perform social_test.fails(format($q$update public.conversation_members set last_read_at = now() where conversation_id = %L$q$, v_conv), '42501');
  perform social_test.fails(format($q$delete from public.conversation_members where conversation_id = %L$q$, v_conv), '42501');
end $$;

select social_test.login('bob');
do $$
declare
  v_conv uuid := social_test.c('ab');
begin
  assert (select count(*) from public.messages where conversation_id = v_conv) = 6, 'bob reads the six messages';
  assert (select unread_count from public.list_conversations() where id = v_conv) = 6, 'six unread';
  assert (select chats from public.get_unread_totals()) = 6, 'chats badge';
  assert (select title from public.list_conversations() where id = v_conv) = 'Alice Zzcamino', 'direct title is the other person';
  assert (select peer_username from public.list_conversations() where id = v_conv) = 'zz1c.alice', 'peer username';
  assert (select my_role from public.list_conversations() where id = v_conv) = 'member', 'role in a direct chat';
  assert (select member_count from public.list_conversations() where id = v_conv) = 2, 'member count';
  assert (select last_message_preview from public.list_conversations() where id = v_conv) = 'returning', 'last preview';
  assert (select count(*) from public.list_conversation_members(v_conv)) = 2, 'both members listed';
  assert (select count(*) from public.conversation_members where conversation_id = v_conv and user_id = social_test.u('alice')) = 1,
         'members see each other (read receipts)';
  perform public.mark_conversation_read(v_conv);
  assert (select unread_count from public.list_conversations() where id = v_conv) = 0, 'read';
  assert (select chats from public.get_unread_totals()) = 0, 'chats badge cleared';
  insert into public.messages (id, conversation_id, body) values ('1c0000a0-0000-0000-0000-000000000005', v_conv, 'Hi Alice');
end $$;

select social_test.login('mallory');
do $$
declare
  v_conv uuid := social_test.c('ab');
begin
  assert (select count(*) from public.messages) = 0, 'a stranger reads no messages';
  assert (select count(*) from public.conversations) = 0, 'a stranger sees no conversations';
  assert (select count(*) from public.conversation_members) = 0, 'a stranger sees no members';
  assert (select count(*) from public.list_conversations()) = 0, 'empty inbox';
  assert (select count(*) from public.list_conversation_members(v_conv)) = 0, 'member list is empty for strangers';
  perform social_test.fails(format($q$insert into public.messages (conversation_id, body) values (%L, 'let me in')$q$, v_conv), '42501');
  perform social_test.fails(format($q$select public.mark_conversation_read(%L)$q$, v_conv), 'P0002', 'not_found');
  perform social_test.fails(format($q$select public.mute_conversation(%L, now() + interval '1 hour')$q$, v_conv), 'P0002', 'not_found');
  perform social_test.fails(format($q$select public.unsend_message(%L)$q$, '1c0000a0-0000-0000-0000-000000000001'::uuid), '42501', 'not_allowed');
  assert (select count(*) from public.get_unread_totals() where chats = 0 and groups = 0) = 1, 'no unread for a stranger';
end $$;
commit;

\echo '== chat: nobody reads other people''s direct chats'
begin;
select social_test.login('bob');
do $$ begin assert public.send_friend_request(social_test.u('carol')) = 'pending', 'bob asks carol'; end $$;
select social_test.login('carol');
do $$
declare v_conv uuid;
begin
  assert public.respond_friend_request(social_test.u('bob'), true) = 'accepted', 'carol accepts bob';
  v_conv := public.start_direct_chat(social_test.u('bob'));
  perform social_test.set_ctx('bc', v_conv);
  insert into public.messages (id, conversation_id, body) values ('1c0000b0-0000-0000-0000-000000000001', v_conv, 'secret between bob and carol');
end $$;
select social_test.login('alice');
do $$
declare
  v_bc uuid := social_test.c('bc');
  v_ab uuid := social_test.c('ab');
begin
  assert (select count(*) from public.messages where conversation_id = v_bc) = 0, 'alice cannot read bob and carol';
  assert (select count(*) from public.conversations where id = v_bc) = 0, 'alice cannot see their conversation';
  assert (select count(*) from public.conversation_members where conversation_id = v_bc) = 0, 'alice cannot see their members';
  assert (select count(*) from public.list_conversations()) = 1, 'alice has her own chat only';
  assert (select count(*) from public.list_conversation_members(v_bc)) = 0, 'members of another chat are not listed';
  perform social_test.fails(format($q$insert into public.messages (conversation_id, body) values (%L, 'intruder')$q$, v_bc), '42501');
  -- a reply cannot point into another conversation
  perform social_test.fails(format($q$insert into public.messages (conversation_id, body, reply_to) values (%L, 'sneaky', %L)$q$,
    v_ab, '1c0000b0-0000-0000-0000-000000000001'::uuid), '42501');
end $$;
commit;

\echo '== chat: unread maths, mute, unsend'
begin;
select social_test.login('bob');
do $$
declare v_conv uuid := social_test.c('ab');
begin
  insert into public.messages (conversation_id, body) values (v_conv, 'u1'), (v_conv, 'u2'), (v_conv, 'u3');
end $$;
select social_test.login('alice');
do $$
declare v_conv uuid := social_test.c('ab');
begin
  assert (select unread_count from public.list_conversations() where id = v_conv) = 4, 'alice: Hi Alice + three more';
  assert (select chats from public.get_unread_totals()) = 4, 'chats badge';
  assert (select groups from public.get_unread_totals()) = 0, 'groups badge';
  -- mute: the badge goes, the row keeps its count
  perform public.mute_conversation(v_conv, now() + interval '1 hour');
  assert (select chats from public.get_unread_totals()) = 0, 'muted chat is not in the badge';
  assert (select unread_count from public.list_conversations() where id = v_conv) = 4, 'muted row still counts';
  assert (select muted_until > now() from public.list_conversations() where id = v_conv), 'muted_until is returned';
  perform public.mute_conversation(v_conv, null);
  assert (select chats from public.get_unread_totals()) = 4, 'unmuted';
  perform public.mute_conversation(v_conv, now() - interval '1 hour');
  assert (select muted_until is null from public.list_conversations() where id = v_conv), 'a time in the past is no mute';
  perform public.mute_conversation(v_conv, 'infinity');
  assert (select muted_until > now() + interval '10 years' from public.list_conversations() where id = v_conv), 'forever';
  perform public.mute_conversation(v_conv, null);
  perform public.mark_conversation_read(v_conv);
  assert (select unread_count from public.list_conversations() where id = v_conv) = 0, 'read';
  insert into public.messages (id, conversation_id, body) values
    ('1c0000a0-0000-0000-0000-000000000006', v_conv, 'two from me'),
    ('1c0000a0-0000-0000-0000-000000000007', v_conv, 'and another');
  assert (select unread_count from public.list_conversations() where id = v_conv) = 0, 'my own messages never count';
end $$;
select social_test.login('bob');
do $$
declare v_conv uuid := social_test.c('ab');
begin
  assert (select unread_count from public.list_conversations() where id = v_conv) = 2, 'bob: two from alice';
  perform social_test.fails($q$select public.unsend_message('1c0000a0-0000-0000-0000-000000000007')$q$, '42501', 'not_allowed');
  perform social_test.fails($q$select public.unsend_message(gen_random_uuid())$q$, '42501', 'not_allowed');
end $$;
select social_test.login('alice');
do $$
declare v_conv uuid := social_test.c('ab');
begin
  perform public.unsend_message('1c0000a0-0000-0000-0000-000000000007');
  perform public.unsend_message('1c0000a0-0000-0000-0000-000000000007');
  assert (select body is null and media_path is null and deleted_at is not null and kind = 'text'
          from public.messages where id = '1c0000a0-0000-0000-0000-000000000007'), 'unsent: body removed, tombstone stays';
  assert (select last_message_preview from public.conversations where id = v_conv) = 'Message unsent', 'inbox says unsent';
  perform public.unsend_message('1c0000a0-0000-0000-0000-000000000003');
  assert (select media_path is null and body is null from public.messages where id = '1c0000a0-0000-0000-0000-000000000003'), 'unsent photo loses its path';
end $$;
select social_test.login('bob');
do $$
declare v_conv uuid := social_test.c('ab');
begin
  assert (select unread_count from public.list_conversations() where id = v_conv) = 1, 'unsent messages do not count as unread';
  assert (select count(*) from public.messages where id = '1c0000a0-0000-0000-0000-000000000007' and deleted_at is not null) = 1,
         'the other side sees the tombstone';
end $$;
-- the badge is capped at 99 (rows at 100)
select social_test.logout();
insert into public.messages (conversation_id, sender_id, kind, body)
select social_test.c('ab'), social_test.u('bob'), 'text', 'bulk ' || i from generate_series(1, 150) i;
select social_test.login('alice');
do $$
declare v_conv uuid := social_test.c('ab');
begin
  assert (select unread_count from public.list_conversations() where id = v_conv) = 100, 'row count is bounded';
  assert (select chats from public.get_unread_totals()) = 99, 'badge is capped at 99';
  perform public.mark_conversation_read(v_conv);
  assert (select chats from public.get_unread_totals()) = 0, 'read again';
end $$;
-- messages removed for good (account deletion does this): the inbox points at the newest one left
select social_test.logout();
delete from public.messages where conversation_id = social_test.c('ab') and body like 'bulk %';
do $$
declare v_conv uuid := social_test.c('ab');
begin
  assert (select last_message_id from public.conversations where id = v_conv)
         = (select id from public.messages where conversation_id = v_conv order by created_at desc limit 1),
         'inbox pointer follows the newest remaining message';
  assert (select last_message_preview from public.conversations where id = v_conv)
         = (select private.message_preview(kind, body, deleted_at is not null)
            from public.messages where conversation_id = v_conv order by created_at desc limit 1),
         'inbox preview follows too';
end $$;
commit;

\echo '== chat: unfriend, block and the history'
begin;
select social_test.login('bob');
do $$
declare v_conv uuid := social_test.c('ab');
begin
  assert public.remove_friend(social_test.u('alice')) = 'removed', 'bob unfriends alice';
  assert (select friends_count from public.profiles where id = social_test.u('bob')) = 1, 'counter after unfriend (carol is left)';
  perform social_test.fails(format($q$insert into public.messages (conversation_id, body) values (%L, 'still there?')$q$, v_conv), '42501');
  perform social_test.fails(format($q$select public.start_direct_chat(%L)$q$, social_test.u('alice')), '42501', 'chat_friends_only');
  assert (select count(*) from public.messages where conversation_id = v_conv) > 5, 'history stays readable';
  assert (select count(*) from public.list_conversations() where id = v_conv) = 1, 'chat stays in the inbox';
end $$;
select social_test.login('alice');
do $$
declare v_conv uuid := social_test.c('ab');
begin
  perform social_test.fails(format($q$insert into public.messages (conversation_id, body) values (%L, 'hello?')$q$, v_conv), '42501');
  assert (select count(*) from public.messages where conversation_id = v_conv) > 5, 'alice reads the history too';
  assert public.send_friend_request(social_test.u('bob')) = 'pending', 'alice asks again';
end $$;
select social_test.login('bob');
do $$ begin assert public.respond_friend_request(social_test.u('alice'), true) = 'accepted', 'bob accepts again'; end $$;
select social_test.login('alice');
do $$
declare v_conv uuid := social_test.c('ab');
begin
  assert public.start_direct_chat(social_test.u('bob')) = v_conv, 'same chat after becoming friends again';
  insert into public.messages (conversation_id, body) values (v_conv, 'welcome back');
end $$;

-- block: sending stops both ways, the other person is masked, history stays
select social_test.login('alice');
insert into public.blocks (blocked_id) values (social_test.u('bob'));
do $$
declare v_conv uuid := social_test.c('ab');
begin
  assert not private.is_friend(social_test.u('alice'), social_test.u('bob')), 'block removed the friendship';
  perform social_test.fails(format($q$insert into public.messages (conversation_id, body) values (%L, 'blocked')$q$, v_conv), '42501');
  assert (select title from public.list_conversations() where id = v_conv) = 'Pilgrim', 'blocked peer is masked in the inbox';
  assert (select peer_username is null and peer_display_name is null and peer_avatar_url is null and peer_id = social_test.u('bob')
          from public.list_conversations() where id = v_conv), 'masked fields, id stays';
  assert (select count(*) from public.messages where conversation_id = v_conv) > 5, 'history stays readable';
end $$;
select social_test.login('bob');
do $$
declare v_conv uuid := social_test.c('ab');
begin
  perform social_test.fails(format($q$insert into public.messages (conversation_id, body) values (%L, 'am I blocked?')$q$, v_conv), '42501');
  perform social_test.fails(format($q$select public.start_direct_chat(%L)$q$, social_test.u('alice')), 'P0002', 'not_found');
  assert (select title from public.list_conversations() where id = v_conv) = 'Pilgrim', 'the blocker is masked too';
  assert (select count(*) from public.list_conversation_members(v_conv) where username is null) = 1, 'members list masks the blocker';
end $$;
select social_test.login('alice');
delete from public.blocks where blocked_id = social_test.u('bob');
do $$
declare v_conv uuid := social_test.c('ab');
begin
  perform social_test.fails(format($q$insert into public.messages (conversation_id, body) values (%L, 'unblocked but not friends')$q$, v_conv), '42501');
  assert (select title from public.list_conversations() where id = v_conv) = 'Bob Zzcamino', 'unblocked: name is back';
  assert public.send_friend_request(social_test.u('bob')) = 'pending', 'ask again after the block';
end $$;
select social_test.login('bob');
do $$ begin assert public.respond_friend_request(social_test.u('alice'), true) = 'accepted', 'friends again'; end $$;
commit;

\echo '== chat: 60 messages a minute'
begin;
select social_test.logout();
select social_test.befriend(social_test.u('grace'), social_test.u('heidi'));
select social_test.login('grace');
do $$
declare v_conv uuid;
begin
  v_conv := public.start_direct_chat(social_test.u('heidi'));
  perform social_test.set_ctx('gh', v_conv);
  perform social_test.fails(format($q$insert into public.messages (conversation_id, body)
    select %L, 'm' || i from generate_series(1, 61) i$q$, v_conv), '54000', 'rate_limited');
  assert (select count(*) from public.messages where sender_id = social_test.u('grace')) = 0, 'a refused batch inserts nothing';
  insert into public.messages (id, conversation_id, body)
  select ('1c0000c0-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, v_conv, 'm' || i from generate_series(1, 60) i;
  assert (select count(*) from public.messages where sender_id = social_test.u('grace')) = 60, '60 are fine';
  perform social_test.fails(format($q$insert into public.messages (conversation_id, body) values (%L, 'one too many')$q$, v_conv), '54000', 'rate_limited');
  assert social_test.affected(format($q$insert into public.messages (id, conversation_id, body)
    values ('1c0000c0-0000-0000-0000-000000000001', %L, 'm1') on conflict (id) do nothing$q$, v_conv)) = 0,
    'a retry of a delivered message is not refused at the limit';
end $$;
select social_test.login('heidi');
do $$
declare v_conv uuid := social_test.c('gh');
begin
  insert into public.messages (conversation_id, body) values (v_conv, 'the limit is per person');
  assert (select count(*) from public.messages where conversation_id = v_conv) = 61, 'heidi sends and reads';
end $$;
commit;

-- =============================================================================
-- GROUP CHAT
-- =============================================================================
\echo '== groups: create, add, history from joining'
begin;
select social_test.logout();
select social_test.befriend(social_test.u('alice'), social_test.u('carol'));
select social_test.befriend(social_test.u('alice'), social_test.u('dave'));
select social_test.befriend(social_test.u('alice'), social_test.u('frank'));
select social_test.login('alice');
do $$
declare
  v_g uuid;
begin
  perform social_test.fails($q$select public.create_group_chat('   ', array[social_test.u('bob'), social_test.u('carol')])$q$, '22023', 'group_title');
  perform social_test.fails($q$select public.create_group_chat(repeat('x', 61), array[social_test.u('bob'), social_test.u('carol')])$q$, '22023', 'group_title');
  perform social_test.fails($q$select public.create_group_chat('Too small', array[social_test.u('bob')])$q$, '22023', 'group_size');
  perform social_test.fails($q$select public.create_group_chat('Too small', null)$q$, '22023', 'group_size');
  perform social_test.fails($q$select public.create_group_chat('Strangers', array[social_test.u('bob'), social_test.u('carol'), social_test.u('mallory')])$q$, '42501', 'group_friends_only');
  perform social_test.fails($q$select public.create_group_chat('Ghosts', array[social_test.u('bob'), social_test.u('carol'), gen_random_uuid()])$q$, '42501', 'group_friends_only');
  perform social_test.fails($q$select public.create_group_chat('Crowd', (select array_agg(social_test.bulk(i)) from generate_series(1, 50) i))$q$, '22023', 'group_size');

  v_g := public.create_group_chat('  Camino crew  ', array[social_test.u('bob'), social_test.u('carol'), social_test.u('dave'), social_test.u('bob'), social_test.u('alice')]);
  perform social_test.set_ctx('g', v_g);
  assert (select title from public.conversations where id = v_g) = 'Camino crew', 'title is trimmed';
  assert (select count(*) from public.conversation_members where conversation_id = v_g and left_at is null) = 4, 'four members (duplicates and self ignored)';
  assert (select role from public.conversation_members where conversation_id = v_g and user_id = social_test.u('alice')) = 'owner', 'creator is the owner';
  assert (select count(*) from public.conversation_members where conversation_id = v_g and role = 'owner') = 1, 'one owner';
  assert (select count(*) from public.messages
          where conversation_id = v_g and kind = 'system' and body = 'Alice Zzcamino created the group') = 1, 'system message';
  assert (select last_message_sender from public.conversations where id = v_g) is null, 'system messages have no sender in the inbox';
  assert (select member_count from public.list_conversations('group') where id = v_g) = 4, 'member_count';
  assert (select my_role from public.list_conversations('group') where id = v_g) = 'owner', 'my_role';
  assert (select count(*) from public.list_conversations('direct') where id = v_g) = 0, 'not in the direct list';
  assert (select count(*) from public.list_conversations() where id = v_g) = 1, 'in the full list';
  assert (select count(*) from public.list_conversations('bogus')) = 0, 'unknown kind finds nothing';
  assert (select count(*) from public.notifications where kind = 'group_added') = 0, 'the creator is not notified';
  assert (select unread_count from public.list_conversations('group') where id = v_g) = 0, 'system messages are not unread';

  insert into public.messages (id, conversation_id, body) values ('1c0000d0-0000-0000-0000-000000000001', v_g, 'before erin');
  assert (select last_message_sender from public.conversations where id = v_g) = social_test.u('alice'), 'inbox sender';
end $$;

select social_test.login('bob');
do $$
declare v_g uuid := social_test.c('g');
begin
  assert (select count(*) from public.notifications
          where kind = 'group_added' and data ->> 'conversation_id' = v_g::text) = 1, 'bob is notified';
  assert (select title from public.notifications where kind = 'group_added') = 'Alice Zzcamino added you to Camino crew', 'notification text';
  assert (select count(*) from public.messages where conversation_id = v_g) = 2, 'bob reads the group';
  assert (select groups from public.get_unread_totals()) = 1, 'groups badge';
  perform social_test.fails(format($q$select public.add_group_members(%L, array[social_test.u('erin')])$q$, v_g), '42501', 'not_allowed');
  perform social_test.fails(format($q$select public.remove_group_member(%L, social_test.u('carol'))$q$, v_g), '42501', 'not_allowed');
  perform social_test.fails(format($q$select public.rename_group(%L, 'Bob rules')$q$, v_g), '42501', 'not_allowed');
  perform social_test.fails(format($q$select public.set_group_member_role(%L, social_test.u('carol'), 'admin')$q$, v_g), '42501', 'not_allowed');
  assert (select title from public.conversations where id = v_g) = 'Camino crew', 'nothing changed';
end $$;

select social_test.login('mallory');
do $$
declare v_g uuid := social_test.c('g');
begin
  perform social_test.fails(format($q$select public.add_group_members(%L, array[social_test.u('mallory')])$q$, v_g), 'P0002', 'not_found');
  perform social_test.fails(format($q$select public.rename_group(%L, 'Mine now')$q$, v_g), 'P0002', 'not_found');
  perform social_test.fails(format($q$select public.leave_conversation(%L)$q$, v_g), 'P0002', 'not_found');
  perform social_test.fails(format($q$insert into public.messages (conversation_id, body) values (%L, 'hi group')$q$, v_g), '42501');
  assert (select count(*) from public.messages where conversation_id = v_g) = 0, 'strangers read nothing';
  assert (select count(*) from public.list_conversation_members(v_g)) = 0, 'strangers list no members';
end $$;

select social_test.login('alice');
do $$
declare v_g uuid := social_test.c('g');
begin
  perform social_test.fails(format($q$select public.add_group_members(%L, array[social_test.u('mallory')])$q$, v_g), '42501', 'group_friends_only');
  assert public.add_group_members(v_g, array[social_test.u('erin')]) = 1, 'erin is added';
  assert public.add_group_members(v_g, array[social_test.u('erin'), social_test.u('bob'), social_test.u('alice')]) = 0, 'adding people who are in is a no-op';
  assert public.add_group_members(v_g, null) = 0, 'nobody to add';
  assert (select count(*) from public.messages where conversation_id = v_g and kind = 'system' and body = 'Alice Zzcamino added Erin Zzcamino') = 1, 'added message';
  insert into public.messages (id, conversation_id, body) values ('1c0000d0-0000-0000-0000-000000000002', v_g, 'after erin');
end $$;

select social_test.login('erin');
do $$
declare v_g uuid := social_test.c('g');
begin
  assert (select array_agg(body order by created_at) from public.messages where conversation_id = v_g)
         = array['Alice Zzcamino added Erin Zzcamino', 'after erin'], 'history starts when erin joined';
  assert (select count(*) from public.notifications where kind = 'group_added') = 1, 'erin is notified';
  assert (select unread_count from public.list_conversations() where id = v_g) = 1, 'one unread message (not the system line)';
  assert (select count(*) from public.list_conversation_members(v_g)) = 5, 'erin sees the five members';
  assert (select count(*) from public.conversation_members where conversation_id = v_g) = 5, 'and their rows';
end $$;

\echo '== groups: roles, rename, remove'
select social_test.login('alice');
do $$
declare v_g uuid := social_test.c('g');
begin
  perform social_test.fails(format($q$select public.set_group_member_role(%L, social_test.u('bob'), 'owner')$q$, v_g), '22023', 'invalid_input');
  perform social_test.fails(format($q$select public.set_group_member_role(%L, social_test.u('mallory'), 'admin')$q$, v_g), 'P0002', 'not_found');
  perform social_test.fails(format($q$select public.set_group_member_role(%L, social_test.u('alice'), 'admin')$q$, v_g), '22023', 'invalid_input');
  perform public.set_group_member_role(v_g, social_test.u('bob'), 'admin');
  assert (select role from public.conversation_members where conversation_id = v_g and user_id = social_test.u('bob')) = 'admin', 'bob is admin';
end $$;
select social_test.login('bob');
do $$
declare v_g uuid := social_test.c('g');
begin
  perform social_test.fails(format($q$select public.add_group_members(%L, array[social_test.u('frank')])$q$, v_g), '42501', 'group_friends_only');
  perform social_test.fails(format($q$select public.rename_group(%L, repeat('x', 61))$q$, v_g), '22023', 'group_title');
  perform public.rename_group(v_g, 'Camino crew 2', 'https://example.com/crew.png');
  assert (select title || '|' || avatar_url from public.conversations where id = v_g) = 'Camino crew 2|https://example.com/crew.png', 'renamed with a picture';
  perform public.rename_group(v_g, 'Camino crew 2');
  assert (select avatar_url from public.conversations where id = v_g) = 'https://example.com/crew.png', 'null keeps the picture';
  assert (select count(*) from public.messages where conversation_id = v_g and body = 'Bob Zzcamino renamed the group to "Camino crew 2"') = 1,
         'one rename message, none when the name did not change';
  perform public.rename_group(v_g, 'Camino crew 2', '');
  assert (select avatar_url is null from public.conversations where id = v_g), 'empty string removes the picture';
  perform social_test.fails(format($q$select public.remove_group_member(%L, social_test.u('alice'))$q$, v_g), '42501', 'cannot_remove_owner');
  perform social_test.fails(format($q$select public.remove_group_member(%L, social_test.u('bob'))$q$, v_g), '22023', 'use_leave');
  perform public.remove_group_member(v_g, social_test.u('mallory'));   -- not a member: nothing to do
  perform public.remove_group_member(v_g, social_test.u('carol'));
  assert (select count(*) from public.messages where conversation_id = v_g
          and body = 'Bob Zzcamino removed Carol Zzcamino') = 1, 'removed message';
  assert (select count(*) from public.conversation_members where conversation_id = v_g and left_at is null) = 4, 'four members left';
end $$;

-- the removed member: nothing readable, nothing writable, but she can tell she is out
select social_test.login('carol');
do $$
declare v_g uuid := social_test.c('g');
begin
  assert (select count(*) from public.messages where conversation_id = v_g) = 0, 'removed: no messages, not even old ones';
  assert (select count(*) from public.conversations where id = v_g) = 0, 'removed: conversation hidden';
  assert (select count(*) from public.list_conversations() where id = v_g) = 0, 'removed: not in the inbox';
  assert (select count(*) from public.list_conversation_members(v_g)) = 0, 'removed: no member list';
  assert (select count(*) from public.conversation_members where conversation_id = v_g and user_id = social_test.u('carol') and left_at is not null) = 1,
         'removed: her own membership row shows left_at';
  assert (select count(*) from public.conversation_members where conversation_id = v_g and user_id <> social_test.u('carol')) = 0, 'removed: others stay hidden';
  perform social_test.fails(format($q$insert into public.messages (conversation_id, body) values (%L, 'still here?')$q$, v_g), '42501');
  perform social_test.fails(format($q$select public.mark_conversation_read(%L)$q$, v_g), 'P0002', 'not_found');
  perform public.leave_conversation(v_g);   -- already out: harmless
  assert (select count(*) from public.notifications where kind = 'group_added') = 1, 'her notification is still there';
end $$;

select social_test.login('alice');
do $$
declare v_g uuid := social_test.c('g');
begin
  insert into public.messages (conversation_id, body) values (v_g, 'after carol left');
  perform public.set_group_member_role(v_g, social_test.u('dave'), 'admin');
  assert (select count(*) from public.conversation_members where conversation_id = v_g and role = 'admin') = 2, 'two admins';
end $$;
select social_test.login('bob');
do $$
declare v_g uuid := social_test.c('g');
begin
  perform social_test.fails(format($q$select public.remove_group_member(%L, social_test.u('dave'))$q$, v_g), '42501', 'not_allowed');
end $$;
select social_test.login('erin');
do $$
declare v_g uuid := social_test.c('g');
begin
  perform social_test.fails(format($q$select public.remove_group_member(%L, social_test.u('dave'))$q$, v_g), '42501', 'not_allowed');
end $$;

\echo '== groups: unread, mute, direct chats are not groups'
select social_test.login('alice');
do $$
declare v_g uuid := social_test.c('g');
begin
  insert into public.messages (conversation_id, body) values (v_g, 'g1'), (v_g, 'g2'), (v_g, 'g3');
end $$;
select social_test.login('dave');
do $$
declare v_g uuid := social_test.c('g');
begin
  -- dave joined with the group: before erin, after erin, after carol left, g1..g3 (system lines never count)
  assert (select unread_count from public.list_conversations('group') where id = v_g) = 6, 'dave unread in the group';
  assert (select groups from public.get_unread_totals()) = 6, 'groups badge';
  assert (select chats from public.get_unread_totals()) = 0, 'chats badge is separate';
  perform public.mute_conversation(v_g, now() + interval '8 hours');
  assert (select groups from public.get_unread_totals()) = 0, 'muted group is not in the badge';
  perform public.mute_conversation(v_g, null);
  perform public.mark_conversation_read(v_g);
  assert (select groups from public.get_unread_totals()) = 0, 'read';
  assert (select count(*) from public.messages where conversation_id = v_g) >= 8, 'dave reads the whole history since he joined';
end $$;
select social_test.login('bob');
do $$
declare v_ab uuid := social_test.c('ab');
begin
  perform social_test.fails(format($q$select public.add_group_members(%L, array[social_test.u('carol')])$q$, v_ab), '22023', 'direct_chat');
  perform social_test.fails(format($q$select public.remove_group_member(%L, social_test.u('alice'))$q$, v_ab), '22023', 'direct_chat');
  perform social_test.fails(format($q$select public.rename_group(%L, 'a name')$q$, v_ab), '22023', 'direct_chat');
  perform social_test.fails(format($q$select public.leave_conversation(%L)$q$, v_ab), '22023', 'direct_chat');
  perform social_test.fails(format($q$select public.set_group_member_role(%L, social_test.u('alice'), 'admin')$q$, v_ab), '22023', 'direct_chat');
end $$;

\echo '== groups: leaving, ownership, closing'
select social_test.login('erin');
do $$
declare v_g uuid := social_test.c('g');
begin
  perform public.leave_conversation(v_g);
  perform public.leave_conversation(v_g);   -- twice is harmless
  assert (select count(*) from public.messages where conversation_id = v_g) = 0, 'left: nothing readable';
  assert (select count(*) from public.list_conversations() where id = v_g) = 0, 'left: not in the inbox';
  perform social_test.fails(format($q$insert into public.messages (conversation_id, body) values (%L, 'bye')$q$, v_g), '42501');
end $$;
select social_test.login('bob');
do $$
declare v_g uuid := social_test.c('g');
begin
  assert (select count(*) from public.messages where conversation_id = v_g and body = 'Erin Zzcamino left the group') = 1, 'left message';
  assert (select member_count from public.list_conversations() where id = v_g) = 3, 'three members: alice, bob, dave';
end $$;
-- the owner leaves: the oldest admin (bob) takes over
select social_test.login('alice');
do $$
declare v_g uuid := social_test.c('g');
begin
  perform public.leave_conversation(v_g);
  assert (select count(*) from public.messages where conversation_id = v_g) = 0, 'the owner left: nothing readable';
  perform social_test.fails(format($q$insert into public.messages (conversation_id, body) values (%L, 'bye')$q$, v_g), '42501');
end $$;
select social_test.login('bob');
do $$
declare v_g uuid := social_test.c('g');
begin
  assert (select role from public.conversation_members where conversation_id = v_g and user_id = social_test.u('bob')) = 'owner', 'oldest admin is the new owner';
  assert (select count(*) from public.conversation_members where conversation_id = v_g and role = 'owner' and left_at is null) = 1, 'still exactly one owner';
  assert (select my_role from public.list_conversations() where id = v_g) = 'owner', 'my_role follows';
  assert (select count(*) from public.messages where conversation_id = v_g and body = 'Alice Zzcamino left the group') = 1, 'owner left message';
  -- the new owner can add the old one back (they are friends): history starts again from now
  perform social_test.fails(format($q$select public.add_group_members(%L, array[social_test.u('frank')])$q$, v_g), '42501', 'group_friends_only');
  assert public.add_group_members(v_g, array[social_test.u('alice')]) = 1, 'alice is back';
  insert into public.messages (id, conversation_id, body) values ('1c0000d0-0000-0000-0000-000000000003', v_g, 'welcome back, alice');
end $$;
select social_test.login('alice');
do $$
declare v_g uuid := social_test.c('g');
begin
  assert (select role from public.conversation_members where conversation_id = v_g and user_id = social_test.u('alice')) = 'member', 'returns as a member';
  assert (select array_agg(body order by created_at) from public.messages where conversation_id = v_g)
         = array['Bob Zzcamino added Alice Zzcamino', 'welcome back, alice'], 'no history from before she left';
  assert (select count(*) from public.messages where conversation_id = v_g and body = 'before erin') = 0, 'old messages stay hidden';
  perform public.leave_conversation(v_g);
end $$;
select social_test.login('dave');
do $$
declare v_g uuid := social_test.c('g');
begin
  perform public.leave_conversation(v_g);
end $$;
select social_test.login('bob');
do $$
declare v_g uuid := social_test.c('g');
begin
  assert (select count(*) from public.conversation_members where conversation_id = v_g and left_at is null) = 1, 'bob is the last one';
  perform public.leave_conversation(v_g);
  assert (select count(*) from public.list_conversations() where id = v_g) = 0, 'closed group is gone from the inbox';
  assert (select count(*) from public.messages where conversation_id = v_g) = 0, 'and unreadable';
end $$;
select social_test.logout();
do $$
declare v_g uuid := social_test.c('g');
begin
  assert (select deleted_at is not null from public.conversations where id = v_g), 'last member out: the group is soft deleted';
  assert (select count(*) from public.conversation_members where conversation_id = v_g and left_at is null) = 0, 'nobody active';
  assert (select count(*) from public.conversation_members where conversation_id = v_g and role = 'owner' and left_at is null) = 0, 'no active owner';
end $$;
commit;

\echo '== groups: 50 pilgrims at most'
begin;
select social_test.logout();
select social_test.befriend(social_test.u('judy'), social_test.bulk(i)) from generate_series(1, 50) i;
select social_test.login('judy');
do $$
begin
  assert (select count(*) from public.list_friends()) = 51, 'judy has fifty-one friends';
  assert (select count(*) from public.list_friends(p_limit => 10)) = 10, 'page size';
  assert (select count(*) from (select id from public.list_friends(10, 0) intersect select id from public.list_friends(10, 10)) x) = 0, 'pages do not overlap';
  assert (select count(*) from public.list_friends(10, 50)) = 1, 'last page';
  assert (select count(*) from public.list_friends(p_limit => 0)) = 1, 'at least one row when asked for none';
end $$;
do $$
declare v_g uuid;
begin
  v_g := public.create_group_chat('Big group', (select array_agg(social_test.bulk(i)) from generate_series(1, 49) i));
  perform social_test.set_ctx('big', v_g);
  assert (select member_count from public.list_conversations('group') where id = v_g) = 50, 'fifty pilgrims';
  perform social_test.fails(format($q$select public.add_group_members(%L, array[social_test.bulk(50)])$q$, v_g), '54000', 'group_full');
  perform social_test.fails(format($q$select public.add_group_members(%L, array[social_test.bulk(50), social_test.bulk(52)])$q$, v_g), '54000', 'group_full');
  perform public.remove_group_member(v_g, social_test.bulk(49));
  assert public.add_group_members(v_g, array[social_test.bulk(50)]) = 1, 'a freed place can be filled';
  perform social_test.fails(format($q$select public.add_group_members(%L, array[social_test.bulk(49)])$q$, v_g), '54000', 'group_full');
  assert (select count(*) from public.notifications where kind = 'group_added') = 0, 'judy is not notified about her own group';
end $$;
select social_test.login(social_test.bulk(7));
do $$
begin
  assert (select count(*) from public.notifications where kind = 'group_added') = 1, 'members are notified';
  assert (select count(*) from public.list_conversations('group')) = 1, 'and see the group';
end $$;
commit;

-- =============================================================================
-- REPORTS, CHAT PHOTOS, NOTIFICATIONS
-- =============================================================================
\echo '== reports: a message can be reported by people who can read it'
begin;
select social_test.login('bob');
do $$
begin
  insert into public.content_reports (target_type, target_id, reason, details)
  values ('message', '1c0000a0-0000-0000-0000-000000000001', 'harassment', 'rude');
  assert (select message_id from public.content_reports where reporter_id = social_test.u('bob'))
         = '1c0000a0-0000-0000-0000-000000000001', 'message_id follows the target';
  assert (select evidence ->> 'body' from public.content_reports where reporter_id = social_test.u('bob')) = 'Hello Bob', 'evidence keeps the text';
  assert (select evidence ->> 'sender_id' from public.content_reports where reporter_id = social_test.u('bob'))
         = social_test.u('alice')::text, 'evidence keeps the sender';
  perform social_test.fails($q$insert into public.content_reports (target_type, target_id, reason)
    values ('message', '1c0000a0-0000-0000-0000-000000000001', 'spam')$q$, '23505');
  -- message_id alone is enough
  insert into public.content_reports (message_id, reason) values ('1c0000a0-0000-0000-0000-000000000002', 'spam');
  assert (select target_type || ':' || target_id from public.content_reports where message_id = '1c0000a0-0000-0000-0000-000000000002')
         = 'message:1c0000a0-0000-0000-0000-000000000002', 'target filled from message_id';
  -- clients cannot plant evidence or message links on other kinds of reports
  insert into public.content_reports (target_type, target_id, reason, evidence, message_id)
  values ('post', gen_random_uuid(), 'spam', '{"x": 1}', '1c0000a0-0000-0000-0000-000000000001');
  assert (select evidence is null and message_id is null from public.content_reports where target_type = 'post'), 'no planted evidence';
  -- a message of a conversation bob is not in, or one that does not exist
  perform social_test.fails($q$insert into public.content_reports (target_type, target_id, reason)
    values ('message', '1c0000c0-0000-0000-0000-000000000005', 'spam')$q$, '42501');
  perform social_test.fails($q$insert into public.content_reports (target_type, target_id, reason)
    values ('message', gen_random_uuid(), 'spam')$q$, '42501');
  perform social_test.fails($q$insert into public.content_reports (target_type, target_id, reason)
    values ('conversation', gen_random_uuid(), 'spam')$q$, '23514');
end $$;
select social_test.login('alice');
select public.unsend_message('1c0000a0-0000-0000-0000-000000000001');
do $$ begin assert (select count(*) from public.content_reports) = 0, 'the person reported cannot read the report'; end $$;
select social_test.login('bob');
do $$
begin
  assert (select evidence ->> 'body' from public.content_reports where target_id = '1c0000a0-0000-0000-0000-000000000001') = 'Hello Bob',
         'the report keeps what was said, even after the message is unsent';
  assert (select body is null from public.messages where id = '1c0000a0-0000-0000-0000-000000000001'), 'while the message itself is gone';
end $$;
select social_test.login('mallory');
do $$
begin
  perform social_test.fails($q$insert into public.content_reports (target_type, target_id, reason)
    values ('message', '1c0000a0-0000-0000-0000-000000000004', 'spam')$q$, '42501');
  assert (select count(*) from public.content_reports) = 0, 'reports are private';
end $$;
commit;

\echo '== storage: chat photos'
begin;
select social_test.logout();
insert into storage.objects (bucket_id, name, metadata) values
  ('user-media', social_test.u('alice')::text || '/chat/' || social_test.c('ab')::text || '/p1.jpg', '{"size": 100}'),
  ('user-media', social_test.u('alice')::text || '/chat/' || social_test.c('ab')::text || '/p2.jpg', '{"size": 100}'),
  ('user-media', social_test.u('alice')::text || '/posts/private.jpg', '{"size": 100}');
select social_test.login('judy');
do $$
declare v_big uuid := social_test.c('big');
begin
  insert into public.messages (id, conversation_id, kind, media_path)
  values ('1c0000e0-0000-0000-0000-000000000001', v_big, 'image', social_test.u('judy')::text || '/chat/' || v_big::text || '/g1.jpg');
end $$;
select social_test.logout();
insert into storage.objects (bucket_id, name, metadata)
values ('user-media', social_test.u('judy')::text || '/chat/' || social_test.c('big')::text || '/g1.jpg', '{"size": 100}');

select social_test.login('alice');
do $$ begin
  assert (select count(*) from storage.objects where name like '1c%') = 3, 'the owner reads all her files';
end $$;
select social_test.login('bob');
do $$ begin
  assert (select count(*) from storage.objects where name like '1c%/chat/%/p2.jpg') = 1, 'the other person reads the chat photo';
  assert (select count(*) from storage.objects where name like '1c%') = 1, 'and nothing else (p1 was unsent, the other is a private post photo)';
end $$;
select social_test.login('carol');
do $$ begin
  assert (select count(*) from storage.objects where name like '1c%') = 0, 'a friend of bob outside the chat reads nothing';
end $$;
select social_test.login('mallory');
do $$ begin
  assert (select count(*) from storage.objects where name like '1c%') = 0, 'a stranger reads nothing';
end $$;
select social_test.login(social_test.bulk(7));
do $$ begin
  assert (select count(*) from storage.objects where name like '1c%/chat/%/g1.jpg') = 1, 'group members read group photos';
end $$;
select social_test.login(social_test.bulk(49));
do $$ begin
  assert (select count(*) from storage.objects where name like '1c%') = 0, 'a removed member reads no group photos';
end $$;
select social_test.login('alice');
select public.unsend_message(id) from public.messages where id = '1c0000a0-0000-0000-0000-000000000004';
select social_test.login('bob');
do $$ begin
  assert (select count(*) from storage.objects where name like '1c%') = 0, 'an unsent photo is no longer readable by others';
end $$;
select social_test.login('alice');
do $$ begin
  assert (select count(*) from storage.objects where name like '1c%') = 3, 'but it stays the sender''s';
end $$;
commit;

\echo '== notifications: likes, comments, achievements, read state'
begin;
select social_test.login('bob');
insert into public.posts (id, kind, visibility, body)
values ('1c000000-0000-0000-0000-0000000000b1', 'photo', 'public', 'Reached the cathedral');
select social_test.login('alice');
insert into public.post_likes (post_id) values ('1c000000-0000-0000-0000-0000000000b1');
select social_test.login('bob');
do $$
begin
  assert (select count(*) from public.notifications where kind = 'post_like') = 1, 'like notification';
  assert (select title from public.notifications where kind = 'post_like') = 'Alice Zzcamino liked your post', 'like text';
  assert (select body from public.notifications where kind = 'post_like') = 'Reached the cathedral', 'like snippet';
  assert (select data ->> 'post_id' from public.notifications where kind = 'post_like') = '1c000000-0000-0000-0000-0000000000b1', 'like data';
  assert (select read_at is null from public.notifications where kind = 'post_like'), 'unread';
  -- the actor can be embedded (PostgREST: actor:profiles!actor_id(...)) because of this foreign key
  assert exists (select 1 from pg_constraint c
                 where c.conrelid = 'public.notifications'::regclass and c.contype = 'f'
                   and c.confrelid = 'public.profiles'::regclass
                   and c.conkey = array[(select attnum from pg_attribute
                                         where attrelid = 'public.notifications'::regclass and attname = 'actor_id')]),
         'foreign key notifications.actor_id -> profiles';
  assert (select count(*) from public.notifications n join public.profiles a on a.id = n.actor_id
          where n.kind = 'post_like' and a.username = 'zz1c.alice') = 1, 'actor is readable';
  -- a client sets read_at, the server clock decides the value
  update public.notifications set read_at = '2000-01-01' where kind = 'post_like';
  assert (select read_at > now() - interval '1 minute' from public.notifications where kind = 'post_like'), 'server clock for read_at';
  insert into public.post_likes (post_id) values ('1c000000-0000-0000-0000-0000000000b1');
  assert (select count(*) from public.notifications where kind = 'post_like') = 1, 'liking my own post notifies nobody';
end $$;
select social_test.login('alice');
delete from public.post_likes where post_id = '1c000000-0000-0000-0000-0000000000b1';
insert into public.post_likes (post_id) values ('1c000000-0000-0000-0000-0000000000b1');
select social_test.login('bob');
do $$
begin
  assert (select count(*) from public.notifications where kind = 'post_like') = 1, 'unlike and like again: still one row';
  assert (select read_at is not null from public.notifications where kind = 'post_like'), 'and it does not turn unread again';
end $$;

-- comments: a repeat refreshes the same row
select social_test.login('carol');
insert into public.post_comments (post_id, body) values ('1c000000-0000-0000-0000-0000000000b1', 'Ultreia!');
select social_test.login('bob');
do $$
begin
  assert (select count(*) from public.notifications where kind = 'post_comment') = 1, 'comment notification';
  assert (select title || '|' || body from public.notifications where kind = 'post_comment') = 'Carol Zzcamino commented on your post|Ultreia!', 'comment text';
  assert (select data ->> 'comment_id' is not null from public.notifications where kind = 'post_comment'), 'comment id in data';
  perform public.mark_notifications_read((select array_agg(id) from public.notifications where kind = 'post_comment'));
  insert into public.post_comments (post_id, body) values ('1c000000-0000-0000-0000-0000000000b1', 'my own comment');
  assert (select count(*) from public.notifications where kind = 'post_comment') = 1, 'commenting on my own post notifies nobody';
end $$;
select social_test.login('carol');
insert into public.post_comments (post_id, body) values ('1c000000-0000-0000-0000-0000000000b1', 'Buen Camino');
select social_test.login('bob');
do $$
begin
  assert (select count(*) from public.notifications where kind = 'post_comment') = 1, 'one row per person and post';
  assert (select body from public.notifications where kind = 'post_comment') = 'Buen Camino', 'latest comment text';
  assert (select read_at is null from public.notifications where kind = 'post_comment'), 'a new comment is unread again';
end $$;

-- badges
select social_test.logout();
do $$
begin
  assert private.grant_achievement(social_test.u('bob'), 'first-stamp'), 'badge granted';
  assert not private.grant_achievement(social_test.u('bob'), 'first-stamp'), 'badges are granted once';
end $$;
select social_test.login('bob');
do $$
begin
  assert (select count(*) from public.notifications where kind = 'achievement') = 1, 'one badge notification';
  assert (select title from public.notifications where kind = 'achievement') like 'You unlocked %', 'badge text';
  assert (select data ->> 'achievement_slug' from public.notifications where kind = 'achievement') = 'first-stamp', 'badge data';
  assert (select actor_id is null from public.notifications where kind = 'achievement'), 'no actor';
end $$;

-- clients can only mark read
do $$
declare
  v_id uuid;
  v_unread integer;
begin
  select id into v_id from public.notifications where kind = 'achievement';
  perform social_test.set_ctx('note', v_id);
  perform social_test.fails($q$update public.notifications set title = 'hacked'$q$, '42501');
  perform social_test.fails($q$update public.notifications set user_id = social_test.u('alice')$q$, '42501');
  perform social_test.fails($q$update public.notifications set data = '{}'$q$, '42501');
  perform social_test.fails($q$insert into public.notifications (user_id, kind, title) values (social_test.u('bob'), 'system', 'free badge')$q$, '42501');
  perform social_test.fails($q$delete from public.notifications$q$, '42501');
  assert social_test.affected(format($q$update public.notifications set read_at = null where id = %L$q$, v_id)) = 1, 'mark unread is allowed';
  select count(*) into v_unread from public.notifications where read_at is null;
  assert (select notifications from public.get_unread_totals()) = v_unread, 'badge matches the unread rows';
end $$;
select social_test.login('alice');
do $$
begin
  assert social_test.affected(format($q$update public.notifications set read_at = now() where id = %L$q$, social_test.c('note'))) = 0, 'cannot touch somebody else''s row';
  assert public.mark_notifications_read(array[social_test.c('note')]) = 0, 'rpc cannot mark somebody else''s row either';
end $$;
select social_test.login('bob');
do $$
declare v_unread integer;
begin
  assert (select read_at is null from public.notifications where id = social_test.c('note')), 'still unread';
  select count(*) into v_unread from public.notifications where read_at is null;
  assert v_unread >= 2, 'a few unread rows to work with';
  assert public.mark_notifications_read(array[social_test.c('note')]) = 1, 'mark one';
  assert public.mark_notifications_read(array[social_test.c('note')]) = 0, 'marking it again changes nothing';
  assert public.mark_notifications_read(array[]::uuid[]) = 0, 'empty list';
  assert public.mark_notifications_read() = v_unread - 1, 'mark all';
  assert public.mark_notifications_read(null) = 0, 'nothing left';
  assert (select notifications from public.get_unread_totals()) = 0, 'badge is clear';
end $$;
commit;

-- =============================================================================
-- ANON, GRANTS, REALTIME
-- =============================================================================
\echo '== anon can do nothing, grants are explicit'
begin;
select social_test.anon();
do $$
declare
  v_sql text;
begin
  foreach v_sql in array array[
    'select count(*) from public.friendships',
    'select count(*) from public.notifications',
    'select count(*) from public.conversations',
    'select count(*) from public.conversation_members',
    'select count(*) from public.messages',
    'insert into public.messages (conversation_id, body) values (gen_random_uuid(), ''x'')',
    'select * from public.list_friends()',
    'select * from public.list_friend_requests()',
    'select * from public.search_pilgrims(''zz1c'')',
    'select public.send_friend_request(gen_random_uuid())',
    'select public.respond_friend_request(gen_random_uuid(), true)',
    'select public.cancel_friend_request(gen_random_uuid())',
    'select public.remove_friend(gen_random_uuid())',
    'select public.start_direct_chat(gen_random_uuid())',
    'select public.create_group_chat(''x'', array[gen_random_uuid(), gen_random_uuid()])',
    'select public.add_group_members(gen_random_uuid(), array[gen_random_uuid()])',
    'select public.remove_group_member(gen_random_uuid(), gen_random_uuid())',
    'select public.set_group_member_role(gen_random_uuid(), gen_random_uuid(), ''admin'')',
    'select public.leave_conversation(gen_random_uuid())',
    'select public.rename_group(gen_random_uuid(), ''x'')',
    'select public.mark_conversation_read(gen_random_uuid())',
    'select public.mute_conversation(gen_random_uuid(), null)',
    'select public.unsend_message(gen_random_uuid())',
    'select * from public.list_conversations()',
    'select * from public.list_conversation_members(gen_random_uuid())',
    'select * from public.get_unread_totals()',
    'select public.mark_notifications_read()'
  ] loop
    perform social_test.fails(v_sql, '42501');
  end loop;
  assert (select count(*) from storage.objects where name like '1c%') = 0, 'anon reads no chat photos';
end $$;
commit;

do $$
declare
  r record;
begin
  -- public RPCs: signed-in only (no PUBLIC, no anon)
  for r in
    select p.oid::regprocedure as sig, p.proacl
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'send_friend_request', 'respond_friend_request', 'cancel_friend_request', 'remove_friend', 'list_friends',
      'list_friend_requests', 'search_pilgrims', 'start_direct_chat', 'create_group_chat', 'add_group_members',
      'remove_group_member', 'set_group_member_role', 'leave_conversation', 'rename_group', 'mark_conversation_read',
      'mute_conversation', 'unsend_message', 'list_conversations', 'list_conversation_members', 'get_unread_totals',
      'mark_notifications_read')
  loop
    assert r.proacl is not null and not exists (select 1 from aclexplode(r.proacl) a where a.grantee = 0), r.sig || ' is open to PUBLIC';
    assert not has_function_privilege('anon', r.sig, 'execute'), r.sig || ' is open to anon';
    assert has_function_privilege('authenticated', r.sig, 'execute'), r.sig || ' is not granted to authenticated';
  end loop;
  -- private helpers: never PUBLIC or anon (can_see is the one policy helper anon may call)
  for r in
    select p.oid::regprocedure as sig, p.proacl
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname in (
      'display_name_of', 'is_friend', 'notify', 'is_conversation_member', 'can_send_message', 'reply_target_ok',
      'messages_rate_ok', 'message_preview', 'group_after_member_gone', 'can_read_chat_media',
      'friendships_counters', 'notifications_before_update', 'post_likes_notify', 'post_comments_notify',
      'user_achievements_notify', 'blocks_remove_friendship', 'messages_before_insert', 'messages_after_insert',
      'messages_after_unsend', 'messages_after_delete', 'conversation_members_after_delete',
      'content_reports_before_insert')
  loop
    assert r.proacl is not null and not exists (select 1 from aclexplode(r.proacl) a where a.grantee = 0), r.sig || ' is open to PUBLIC';
    assert not has_function_privilege('anon', r.sig, 'execute'), r.sig || ' is open to anon';
  end loop;
  -- what policies call must be executable by signed-in people
  assert has_function_privilege('authenticated', 'private.is_friend(uuid, uuid)', 'execute'), 'is_friend grant';
  assert has_function_privilege('authenticated', 'private.is_conversation_member(uuid, uuid)', 'execute'), 'is_conversation_member grant';
  assert has_function_privilege('authenticated', 'private.can_send_message(uuid, uuid)', 'execute'), 'can_send_message grant';
  assert has_function_privilege('authenticated', 'private.reply_target_ok(uuid, uuid)', 'execute'), 'reply_target_ok grant';
  assert has_function_privilege('authenticated', 'private.messages_rate_ok(uuid, uuid)', 'execute'), 'messages_rate_ok grant';
  assert has_function_privilege('authenticated', 'private.can_read_chat_media(text)', 'execute'), 'can_read_chat_media grant';
  -- RLS on, and no table is open to anon
  assert (select count(*) from pg_class c where c.oid in (
            'public.friendships'::regclass, 'public.notifications'::regclass, 'public.conversations'::regclass,
            'public.conversation_members'::regclass, 'public.messages'::regclass) and c.relrowsecurity) = 5, 'RLS on every new table';
  assert not has_table_privilege('anon', 'public.messages', 'select')
     and not has_table_privilege('anon', 'public.friendships', 'select')
     and not has_table_privilege('anon', 'public.notifications', 'select')
     and not has_table_privilege('anon', 'public.conversations', 'select')
     and not has_table_privilege('anon', 'public.conversation_members', 'select'), 'anon has no table access';
  -- the pair tables publish a surrogate id, not the pair of people, in Realtime DELETE events
  assert (select relreplident from pg_class where oid = 'public.friendships'::regclass) = 'i', 'friendships replica identity';
  assert (select relreplident from pg_class where oid = 'public.conversation_members'::regclass) = 'i', 'members replica identity';
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    assert (select count(*) from pg_publication_tables
            where pubname = 'supabase_realtime' and schemaname = 'public'
              and tablename in ('messages', 'conversation_members', 'notifications', 'friendships')) = 4, 'realtime publication';
  end if;
end $$;

\echo '== constraints that protect the data even from server code'
begin;
select social_test.logout();
do $$
declare
  v_conv uuid := social_test.c('big');
  v_a uuid := social_test.u('alice');
  v_b uuid := social_test.u('bob');
begin
  -- a friendship is stored once, in canonical order, requested by one of the two
  perform social_test.fails(format($q$insert into public.friendships (user_a, user_b, requested_by) values (%L, %L, %L)$q$,
    greatest(v_a, v_b), least(v_a, v_b), v_a), '23514');
  perform social_test.fails(format($q$insert into public.friendships (user_a, user_b, requested_by) values (%L, %L, %L)$q$,
    v_a, v_a, v_a), '23514');
  perform social_test.fails(format($q$insert into public.friendships (user_a, user_b, requested_by) values (%L, %L, %L)$q$,
    least(v_a, social_test.u('mallory')), greatest(v_a, social_test.u('mallory')), v_b), '23514');
  perform social_test.fails(format($q$insert into public.friendships (user_a, user_b, requested_by, status) values (%L, %L, %L, 'blocked')$q$,
    least(v_a, social_test.u('mallory')), greatest(v_a, social_test.u('mallory')), v_a), '23514');
  -- conversations: a direct chat has a key and no title, a group has a title and no key
  perform social_test.fails($q$insert into public.conversations (kind, title) values ('direct', 'a direct chat with a title')$q$, '23514');
  perform social_test.fails($q$insert into public.conversations (kind) values ('group')$q$, '23514');
  perform social_test.fails($q$insert into public.conversations (kind, title, direct_key) values ('group', 'keyed group', 'a:b')$q$, '23514');
  -- one active owner per conversation, roles are a fixed list
  perform social_test.fails(format($q$update public.conversation_members set role = 'owner' where conversation_id = %L and user_id = %L$q$,
    v_conv, social_test.bulk(7)), '23505');
  perform social_test.fails(format($q$update public.conversation_members set role = 'king' where conversation_id = %L and user_id = %L$q$,
    v_conv, social_test.bulk(7)), '23514');
  -- notifications: a fixed list of kinds; system rows are never deduplicated, the others are
  perform social_test.fails($q$insert into public.notifications (user_id, kind, title) values (social_test.u('alice'), 'bogus', 'x')$q$, '23514');
  insert into public.notifications (user_id, kind, title) values (v_a, 'system', 'Welcome'), (v_a, 'system', 'Welcome');
  assert (select count(*) from public.notifications where user_id = v_a and kind = 'system') = 2, 'system notifications repeat';
  insert into public.notifications (user_id, kind, title, dedupe_key) values (v_a, 'post_like', 'x liked', 'post_like:x:y');
  perform social_test.fails(format($q$insert into public.notifications (user_id, kind, title, dedupe_key) values (%L, 'post_like', 'x liked again', 'post_like:x:y')$q$, v_a), '23505');
  delete from public.notifications where user_id = v_a and (kind = 'system' or dedupe_key = 'post_like:x:y');
  -- messages: a reply that points nowhere is cleared when its target is deleted
  insert into public.messages (id, conversation_id, sender_id, body)
  values ('1c0000aa-0000-0000-0000-000000000001', v_conv, social_test.u('judy'), 'target'),
         ('1c0000aa-0000-0000-0000-000000000002', v_conv, social_test.u('judy'), 'reply');
  update public.messages set reply_to = '1c0000aa-0000-0000-0000-000000000001' where id = '1c0000aa-0000-0000-0000-000000000002';
  delete from public.messages where id = '1c0000aa-0000-0000-0000-000000000001';
  assert (select reply_to is null from public.messages where id = '1c0000aa-0000-0000-0000-000000000002'), 'reply_to is cleared with its target';
  delete from public.messages where id = '1c0000aa-0000-0000-0000-000000000002';
end $$;
commit;

-- =============================================================================
-- ACCOUNT DELETION AND CLEAN UP
-- =============================================================================
\echo '== deleting an account (the delete-account function does this) leaves a consistent database'
begin;
select social_test.logout();
select social_test.befriend(social_test.u('frank'), social_test.u('erin'));
select social_test.befriend(social_test.u('frank'), social_test.u('ivan'));
select social_test.login('frank');
do $$
declare v_dm uuid; v_g uuid;
begin
  v_dm := social_test.set_ctx('fa', public.start_direct_chat(social_test.u('alice')));
  insert into public.messages (conversation_id, body) values (v_dm, 'frank to alice');
  v_g := social_test.set_ctx('fg', public.create_group_chat('Frank''s group', array[social_test.u('erin'), social_test.u('ivan')]));
  insert into public.messages (id, conversation_id, body) values ('1c0000f0-0000-0000-0000-000000000001', v_g, 'frank in the group');
end $$;
select social_test.login('alice');
do $$
begin
  insert into public.messages (conversation_id, body) values (social_test.c('fa'), 'alice to frank');
  assert (select count(*) from public.list_conversations() where id = social_test.c('fa')) = 1, 'alice has the chat with frank';
end $$;
select social_test.login('erin');
do $$
begin
  insert into public.messages (id, conversation_id, body) values ('1c0000f0-0000-0000-0000-000000000002', social_test.c('fg'), 'erin in the group');
  insert into public.messages (id, conversation_id, body) values ('1c0000f0-0000-0000-0000-000000000003', social_test.c('fg'), 'last word is franks');
end $$;
select social_test.login('frank');
do $$
begin
  insert into public.messages (id, conversation_id, body) values ('1c0000f0-0000-0000-0000-000000000004', social_test.c('fg'), 'frank says last');
end $$;
select social_test.login('erin');
do $$
begin
  insert into public.content_reports (target_type, target_id, reason)
  values ('message', '1c0000f0-0000-0000-0000-000000000004', 'spam');
  assert (select last_message_id from public.list_conversations() where id = social_test.c('fg')) = '1c0000f0-0000-0000-0000-000000000004', 'frank wrote the last message';
end $$;
commit;

-- the account goes away
select social_test.logout();
delete from auth.users where id = social_test.u('frank');
do $$
begin
  assert (select count(*) from public.profiles where id = social_test.u('frank')) = 0, 'profile is gone';
  assert (select count(*) from public.friendships where user_a = social_test.u('frank') or user_b = social_test.u('frank')) = 0, 'friendships are gone';
  assert (select count(*) from public.conversation_members where user_id = social_test.u('frank')) = 0, 'memberships are gone';
  assert (select count(*) from public.messages where sender_id = social_test.u('frank')) = 0, 'messages are gone';
  assert (select count(*) from public.notifications where user_id = social_test.u('frank')) = 0, 'notifications are gone';
  assert (select friends_count from public.profiles where id = social_test.u('alice'))
         = (select count(*) from public.friendships f where f.status = 'accepted' and social_test.u('alice') in (f.user_a, f.user_b)),
         'friends_count of the others follows';
  -- the direct chat is over for both
  assert (select deleted_at is not null from public.conversations where id = social_test.c('fa')), 'direct chat is closed';
  -- the group lives on with a new owner, and the inbox points at a message that still exists
  assert (select deleted_at is null from public.conversations where id = social_test.c('fg')), 'group stays open';
  assert (select role from public.conversation_members where conversation_id = social_test.c('fg') and user_id = social_test.u('erin')) = 'owner',
         'the oldest member took over';
  assert (select count(*) from public.conversation_members where conversation_id = social_test.c('fg') and left_at is null and role = 'owner') = 1, 'exactly one owner';
  assert (select last_message_id from public.conversations where id = social_test.c('fg')) = '1c0000f0-0000-0000-0000-000000000003',
         'inbox points at the newest message that is left';
  assert (select last_message_preview from public.conversations where id = social_test.c('fg')) = 'last word is franks', 'preview follows';
  assert (select actor_id is null from public.notifications
          where user_id = social_test.u('erin') and kind = 'group_added' and data ->> 'conversation_id' = social_test.c('fg')::text), 'notification outlives its actor';
  assert (select message_id is null and evidence ->> 'body' = 'frank says last' from public.content_reports where target_id = '1c0000f0-0000-0000-0000-000000000004'),
         'a report outlives the message and keeps the evidence';
end $$;
begin;
select social_test.login('alice');
do $$
begin
  assert (select count(*) from public.list_conversations() where id = social_test.c('fa')) = 0, 'alice no longer sees the closed chat';
  assert (select count(*) from public.messages where conversation_id = social_test.c('fa')) = 0, 'nor its messages';
end $$;
select social_test.login('erin');
do $$
begin
  assert (select member_count from public.list_conversations() where id = social_test.c('fg')) = 2, 'two members left';
  assert (select my_role from public.list_conversations() where id = social_test.c('fg')) = 'owner', 'erin owns it now';
end $$;
commit;

\echo '== invariants over everything this test made'
select social_test.logout();
do $$
begin
  assert (select count(*) from public.profiles p
          where p.id::text like '1c%'
            and p.friends_count <> (select count(*) from public.friendships f
                                    where f.status = 'accepted' and p.id in (f.user_a, f.user_b))) = 0, 'friends_count matches the friendships';
  assert (select count(*) from public.conversations c
          where c.kind = 'group' and c.deleted_at is null and exists (select 1 from public.conversation_members m where m.conversation_id = c.id)
            and (select count(*) from public.conversation_members m
                 where m.conversation_id = c.id and m.left_at is null and m.role = 'owner') <> 1) = 0, 'every open group has exactly one owner';
  assert (select count(*) from public.conversations c
          where c.last_message_id is not null and not exists (select 1 from public.messages m where m.id = c.last_message_id)) = 0,
         'no inbox pointer to a missing message';
  assert (select count(*) from public.friendships where user_a >= user_b) = 0, 'friendships are in canonical order';
  assert (select count(*) from public.conversations where kind = 'direct' and deleted_at is null
          and direct_key <> (select min(user_id::text) || ':' || max(user_id::text)
                             from public.conversation_members m where m.conversation_id = conversations.id)) = 0, 'direct_key matches the members';
end $$;

-- clean up: every pilgrim of this test goes, and with them everything they own
delete from storage.objects where name like '1c%';
delete from auth.users where id::text like '1c%';
delete from public.conversations c
where not exists (select 1 from public.conversation_members m where m.conversation_id = c.id);
do $$
begin
  assert (select count(*) from public.profiles where id::text like '1c%') = 0, 'pilgrims removed';
  assert (select count(*) from public.friendships where user_a::text like '1c%' or user_b::text like '1c%') = 0, 'friendships removed';
  assert (select count(*) from public.messages where sender_id::text like '1c%') = 0, 'messages removed';
  assert (select count(*) from public.notifications where user_id::text like '1c%' or actor_id::text like '1c%') = 0, 'notifications removed';
  assert (select count(*) from public.conversation_members where user_id::text like '1c%') = 0, 'memberships removed';
  assert (select count(*) from public.content_reports where reporter_id::text like '1c%') = 0, 'reports removed';
end $$;
drop schema social_test cascade;

\echo 'social_smoke: all assertions passed'
