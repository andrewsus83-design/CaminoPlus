-- Share links of ONE plan or ONE note (migration 20261114100100_share_links).
-- Self-contained: creates its own users (ids start with f5) and removes them at the end.
--
--   1. the migration can be run a second time; the table has no privilege for the API roles; the functions
--      are SECURITY DEFINER with an empty search_path and exactly the grants they need
--   2. create_share_link: checks (signed in, kind, ownership, sizes, expiry, options), the token is 43
--      base64url characters and only its sha256 is stored
--   3. get_shared (as anon, with the token): the plan, field by field (no notes, no booking, no stay unless
--      asked), LIVE; the note, a COPY; view counting; one null for unknown, stopped, expired, deleted
--   4. list_share_links / revoke_share_link: mine only, no token, no hash; stopping is idempotent and wipes a
--      note's copy; nobody else can stop my link
--   5. 50 active links at most; export_my_data lists the links without token or hash; deleting the account
--      removes them
\set ON_ERROR_STOP 1

drop schema if exists share_test cascade;
create schema share_test;
grant usage on schema share_test to anon, authenticated;

delete from auth.users where id::text like 'f5%';

create table share_test.users (name text primary key, id uuid not null);
insert into share_test.users (name, id) values
  ('olga', 'f5000000-0000-0000-0000-000000000001'),   -- shares her plan and a note
  ('fred', 'f5000000-0000-0000-0000-000000000002');   -- her friend: no more than anybody with the link
grant select on share_test.users to anon, authenticated;
-- what a step hands to the next one (tokens are shown once, so the test keeps them here)
create table share_test.kept (k text primary key, v text);
grant all on share_test.kept to anon, authenticated;

create function share_test.u(p_name text) returns uuid language sql stable as $$
  select id from share_test.users where name = p_name
$$;
create function share_test.login(p_name text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', share_test.u(p_name), 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;
create function share_test.anon() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
end $$;
create function share_test.logout() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;
create function share_test.kept(p_k text) returns text language sql stable as $$ select v from share_test.kept where k = p_k $$;
create function share_test.fails(p_sql text, p_state text default null) returns void language plpgsql as $$
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
grant execute on all functions in schema share_test to anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data)
select id, 'zzf5.' || name || '@example.com', jsonb_build_object('full_name', initcap(name) || ' Zzshare') from share_test.users;

begin;
select share_test.login('olga');
insert into public.journeys (id, route_id, status, visibility)
values ('f5100000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'active', 'private');
insert into public.journey_days (journey_id, day_number, planned_date, from_name, to_name, planned_distance_km, stay_id, booking_status, notes) values
  ('f5100000-0000-0000-0000-000000000001', 1, '2026-12-01', 'Saint-Jean', 'Roncesvalles', 24.2, '60000000-0000-0000-0000-000000000001', 'confirmed', 'secret: door code 4711'),
  ('f5100000-0000-0000-0000-000000000001', 2, '2026-12-02', 'Roncesvalles', 'Zubiri', 21.5, null, 'none', 'secret two');
select share_test.login('fred');
insert into public.journeys (id, route_id, status) values ('f5100000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'active');
commit;

-- =============================================================================
-- 1. MIGRATION AGAIN, PRIVILEGES, FUNCTION SETTINGS
-- =============================================================================
\echo '== share links: re-runnable, no table privilege, definer functions with exact grants'
\ir ../migrations/20261114100100_share_links.sql
do $$
declare
  p text;
  f record;
begin
  foreach p in array array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'] loop
    assert not has_table_privilege('anon', 'public.shared_links', p), 'anon has no ' || p;
    assert not has_table_privilege('authenticated', 'public.shared_links', p), 'authenticated has no ' || p;
  end loop;
  assert (select relrowsecurity from pg_class where oid = 'public.shared_links'::regclass), 'row level security is on';
  assert (select count(*) from pg_policies where tablename = 'shared_links') = 1, 'one policy (owner select, defence in depth)';
  for f in select p2.oid::regprocedure as sig, p2.proname, p2.prosecdef, p2.proconfig from pg_proc p2 join pg_namespace n on n.oid = p2.pronamespace
           where n.nspname = 'public' and p2.proname in ('create_share_link', 'list_share_links', 'revoke_share_link', 'get_shared') loop
    assert f.prosecdef, f.proname || ' is security definer';
    assert f.proconfig is not null and 'search_path=""' = any (f.proconfig), f.proname || ' has an empty search_path';
    assert has_function_privilege('authenticated', f.sig, 'execute'), f.proname || ': signed-in people may call it';
    assert has_function_privilege('anon', f.sig, 'execute') = (f.proname = 'get_shared'), f.proname || ': anon only for get_shared';
  end loop;
  assert (select count(*) from pg_proc p2 join pg_namespace n on n.oid = p2.pronamespace
          where n.nspname = 'public' and p2.proname in ('create_share_link', 'list_share_links', 'revoke_share_link', 'get_shared')) = 4, 'four functions, one of each';
  assert pg_get_function_result('public.list_share_links()'::regprocedure) not like '%token%', 'the list has no token or hash';
end $$;

-- =============================================================================
-- 2. CREATE: CHECKS AND THE TOKEN
-- =============================================================================
\echo '== share links: create checks who, what, and how big'
begin;
select share_test.anon();
do $$ begin perform share_test.fails($q$select public.create_share_link('plan', 'f5100000-0000-0000-0000-000000000001')$q$, '42501'); end $$;
select share_test.login('olga');
do $$
begin
  perform share_test.fails($q$select public.create_share_link('diary')$q$, '22023');
  perform share_test.fails($q$select public.create_share_link(null)$q$, '22023');
  -- somebody else's plan, a plan that does not exist, no plan at all
  perform share_test.fails($q$select public.create_share_link('plan', 'f5100000-0000-0000-0000-000000000002')$q$, '42501');
  perform share_test.fails($q$select public.create_share_link('plan', 'f5100000-0000-0000-0000-0000000000ff')$q$, '42501');
  perform share_test.fails($q$select public.create_share_link('plan')$q$, '42501');
  perform share_test.fails($q$select public.create_share_link('plan', 'f5100000-0000-0000-0000-000000000001', '{"body":"x"}')$q$, '22023');
  perform share_test.fails($q$select public.create_share_link('plan', 'f5100000-0000-0000-0000-000000000001', null, '{"stays":"yes"}')$q$, '22023');
  perform share_test.fails($q$select public.create_share_link('plan', 'f5100000-0000-0000-0000-000000000001', null, '[]')$q$, '22023');
  -- notes
  perform share_test.fails($q$select public.create_share_link('note')$q$, '22023');
  perform share_test.fails($q$select public.create_share_link('note', null, '{"body":"  "}')$q$, '22023');
  perform share_test.fails($q$select public.create_share_link('note', null, '{"body": 5}')$q$, '22023');
  perform share_test.fails($q$select public.create_share_link('note', 'f5100000-0000-0000-0000-000000000001', '{"body":"x"}')$q$, '22023');
  perform share_test.fails(format('select public.create_share_link(%L, null, %L)', 'note', jsonb_build_object('body', repeat('a', 20001))), '22001');
  perform share_test.fails(format('select public.create_share_link(%L, null, %L)', 'note', jsonb_build_object('body', 'x', 'title', repeat('a', 201))), '22001');
  perform share_test.fails(format('select public.create_share_link(%L, null, %L)', 'note', jsonb_build_object('body', 'x', 'place', repeat('a', 201))), '22001');
  perform share_test.fails($q$select public.create_share_link('note', null, '{"body":"x","written_at":"yesterday-ish"}')$q$, '22007');
  perform share_test.fails($q$select public.create_share_link('note', null, '{"body":"x"}', '{"stays":true}')$q$, '22023');
  perform share_test.fails(format('select public.create_share_link(%L, null, %L, %L, %L)', 'note', '{"body":"x"}', '{}', repeat('l', 81)), '22001');
  perform share_test.fails($q$select public.create_share_link('note', null, '{"body":"x"}', '{}', null, 0)$q$, '22023');
  perform share_test.fails($q$select public.create_share_link('note', null, '{"body":"x"}', '{}', null, 366)$q$, '22023');
  assert (select count(*) from public.list_share_links()) = 0, 'nothing was made by the failures';
end $$;
-- the biggest allowed note goes through
do $$
declare
  r jsonb := public.create_share_link('note', null, jsonb_build_object('body', repeat('a', 20000), 'title', repeat('t', 200), 'place', repeat('p', 200)));
begin
  assert r ->> 'token' ~ '^[A-Za-z0-9_-]{43}$', 'the token: 43 base64url characters';
end $$;
rollback;

\echo '== share links: the token is shown once and only its hash is kept'
begin;
select share_test.login('olga');
do $$
declare
  r jsonb := public.create_share_link('plan', 'f5100000-0000-0000-0000-000000000001', null, '{}', '  For mum  ', 30);
  r2 jsonb := public.create_share_link('plan', 'f5100000-0000-0000-0000-000000000001');
begin
  assert r ? 'id' and r ? 'token' and r ? 'expires_at', 'id, token, expires_at';
  assert (select count(*) from jsonb_object_keys(r)) = 3, 'and nothing else';
  assert r ->> 'token' <> r2 ->> 'token', 'two links, two tokens';
  assert (r ->> 'expires_at')::timestamptz between now() + interval '29 days 23 hours' and now() + interval '30 days 1 hour', 'expires in 30 days';
  assert r2 -> 'expires_at' = 'null'::jsonb, 'no expiry when none asked';
  insert into share_test.kept values ('plan', r ->> 'token'), ('plan_id', r ->> 'id'), ('plan2', r2 ->> 'token');
end $$;
select share_test.logout();
do $$
begin
  assert (select count(*) from public.shared_links where owner_id = share_test.u('olga')) = 2, 'two rows';
  assert (select token_hash from public.shared_links where id = share_test.kept('plan_id')::uuid) = sha256(convert_to(share_test.kept('plan'), 'UTF8')), 'the hash of the token';
  assert not exists (select 1 from public.shared_links l where position(share_test.kept('plan') in to_jsonb(l)::text) > 0), 'the token itself is nowhere in the row';
  assert (select label from public.shared_links where id = share_test.kept('plan_id')::uuid) = 'For mum', 'the label is trimmed';
  assert (select options from public.shared_links where id = share_test.kept('plan_id')::uuid) = '{"stays": false}', 'stays are off unless asked';
end $$;
commit;

-- =============================================================================
-- 3. WHAT THE LINK SHOWS
-- =============================================================================
\echo '== share links: a plan link shows the plan, field by field, and nothing private'
begin;
select share_test.anon();
do $$
declare
  s jsonb := public.get_shared(share_test.kept('plan'));
  d jsonb;
  k text;
begin
  assert s is not null, 'anon opens the link';
  assert (select array_agg(x order by x) from jsonb_object_keys(s) x) = array['kind', 'note', 'owner', 'plan'], 'the four keys';
  assert s ->> 'kind' = 'plan' and s -> 'note' = 'null'::jsonb, 'a plan, no note';
  assert s -> 'owner' = '{"display_name": "Olga Zzshare"}', 'only the display name of the owner';
  assert (select array_agg(x order by x) from jsonb_object_keys(s -> 'plan') x) = array['days', 'route_name', 'start_date', 'stays_included', 'total_km'], 'the plan keys';
  assert s #>> '{plan,route_name}' = (select name from public.routes where id = '20000000-0000-0000-0000-000000000001'), 'the route name';
  assert s #>> '{plan,start_date}' = '2026-12-01', 'the start date (from the first day)';
  assert (s #>> '{plan,total_km}')::numeric = 45.7, 'the total km';
  assert jsonb_array_length(s #> '{plan,days}') = 2, 'two days';
  d := s #> '{plan,days,0}';
  for k in select jsonb_object_keys(d) loop
    assert k in ('day_number', 'planned_date', 'from_name', 'to_name', 'planned_distance_km', 'status'), 'a day carries only the whitelist, not ' || k;
  end loop;
  assert d ->> 'from_name' = 'Saint-Jean' and d ->> 'to_name' = 'Roncesvalles' and (d ->> 'day_number')::int = 1, 'day one';
  assert s::text not like '%4711%' and s::text not like '%secret%', 'the notes of the days are never in it';
  assert s::text not like '%confirmed%' and s::text not like '%booking%', 'nor the booking';
  assert s::text not like '%Albergue de Roncesvalles%', 'nor the stay, unless asked';
  assert s::text not like '%' || share_test.u('olga')::text || '%', 'nor the owner id';
end $$;
select share_test.logout();
do $$ begin
  assert (select view_count from public.shared_links where id = share_test.kept('plan_id')::uuid) = 1, 'one view counted';
  assert (select last_viewed_at from public.shared_links where id = share_test.kept('plan_id')::uuid) is not null, 'last viewed';
end $$;
commit;

\echo '== share links: a plan link is live, and shows stays only when asked'
begin;
select share_test.login('olga');
update public.journey_days set to_name = 'Burguete' where journey_id = 'f5100000-0000-0000-0000-000000000001' and day_number = 1;
do $$
declare
  r jsonb := public.create_share_link('plan', 'f5100000-0000-0000-0000-000000000001', null, '{"stays": true, "notes": true, "booking": true}');
begin
  insert into share_test.kept values ('plan_stays', r ->> 'token');
end $$;
select share_test.login('fred');
do $$
declare
  s jsonb := public.get_shared(share_test.kept('plan'));
  s2 jsonb := public.get_shared(share_test.kept('plan_stays'));
begin
  assert s #>> '{plan,days,0,to_name}' = 'Burguete', 'the change shows at once: the link reads the plan when it opens';
  assert s2 #>> '{plan,days,0,stay_name}' = 'Albergue de Roncesvalles', 'the stay name when asked';
  assert (s2 #>> '{plan,stays_included}')::boolean, 'and the link says so';
  assert s2 #> '{plan,days,1}' ? 'stay_name' = false, 'a day without a stay has no stay';
  assert s2::text not like '%secret%' and s2::text not like '%confirmed%', 'asking for notes or booking in the options does nothing';
  -- fred is a friend only through the link: the tables stay closed to him
  assert (select count(*) from public.journey_days where journey_id = 'f5100000-0000-0000-0000-000000000001') = 0, 'the link opens no table';
end $$;
select share_test.logout();
do $$ begin
  assert (select options from public.shared_links where owner_id = share_test.u('olga') and options ->> 'stays' = 'true') = '{"stays": true}', 'only the stays option is kept';
end $$;
rollback;

\echo '== share links: a note link is a copy'
begin;
select share_test.login('olga');
do $$
declare
  r jsonb := public.create_share_link('note', null,
    '{"title":" Day 3 ","body":"The bells at dawn.\nThen rain.","place":"Zubiri","written_at":"2026-12-03T07:15:00Z","photos":["x.jpg"],"mood":"tired"}', null, 'Bells');
begin
  insert into share_test.kept values ('note', r ->> 'token'), ('note_id', r ->> 'id');
end $$;
select share_test.anon();
do $$
declare
  s jsonb := public.get_shared(share_test.kept('note'));
begin
  assert s ->> 'kind' = 'note' and s -> 'plan' = 'null'::jsonb, 'a note, no plan';
  assert (select array_agg(x order by x) from jsonb_object_keys(s -> 'note') x) = array['body', 'place', 'title', 'written_at'], 'the four fields';
  assert s #>> '{note,title}' = 'Day 3' and s #>> '{note,body}' = E'The bells at dawn.\nThen rain.' and s #>> '{note,place}' = 'Zubiri', 'the copy';
  assert (s #>> '{note,written_at}')::timestamptz = '2026-12-03T07:15:00Z', 'written at';
  assert s::text not like '%x.jpg%' and s::text not like '%tired%', 'what is not in the whitelist was never kept';
end $$;
commit;

\echo '== share links: one answer, null, for unknown, malformed, stopped, expired and deleted'
begin;
select share_test.anon();
do $$ begin
  assert public.get_shared(null) is null, 'null';
  assert public.get_shared('') is null, 'empty';
  assert public.get_shared('short') is null, 'malformed';
  assert public.get_shared(repeat('A', 43)) is null, 'unknown';
  assert public.get_shared(share_test.kept('plan') || 'A') is null, 'one character too many';
  assert public.get_shared(''' or 1=1 --' || repeat('A', 30)) is null, 'not even a try';
end $$;
-- expired
select share_test.logout();
update public.shared_links set expires_at = now() - interval '1 second' where id = share_test.kept('plan_id')::uuid;
select share_test.anon();
do $$ begin assert public.get_shared(share_test.kept('plan')) is null, 'expired'; end $$;
select share_test.logout();
update public.shared_links set expires_at = null where id = share_test.kept('plan_id')::uuid;
-- a deleted journey
update public.journeys set deleted_at = now() where id = 'f5100000-0000-0000-0000-000000000001';
select share_test.anon();
do $$ begin assert public.get_shared(share_test.kept('plan')) is null, 'the plan was deleted'; end $$;
select share_test.logout();
update public.journeys set deleted_at = null where id = 'f5100000-0000-0000-0000-000000000001';
-- a deleted profile
update public.profiles set deleted_at = now() where id = share_test.u('olga');
select share_test.anon();
do $$ begin
  assert public.get_shared(share_test.kept('plan')) is null, 'the account is being deleted';
  assert public.get_shared(share_test.kept('note')) is null, 'also for a note';
end $$;
select share_test.logout();
do $$ begin
  assert (select view_count from public.shared_links where id = share_test.kept('plan_id')::uuid) = 1, 'no view counted for a link that answered null';
end $$;
rollback;

-- =============================================================================
-- 4. LIST AND STOP
-- =============================================================================
\echo '== share links: my list, and stopping a link'
begin;
select share_test.login('fred');
do $$ begin
  assert (select count(*) from public.list_share_links()) = 0, 'fred sees none of olga''s links';
  perform public.revoke_share_link(share_test.kept('plan_id')::uuid);   -- not his: nothing happens, nothing is said
  perform share_test.fails($q$select count(*) from public.shared_links$q$, '42501');
end $$;
select share_test.anon();
do $$ begin
  assert public.get_shared(share_test.kept('plan')) is not null, 'fred did not stop olga''s link';
  perform share_test.fails($q$select public.list_share_links()$q$, '42501');
  perform share_test.fails(format('select public.revoke_share_link(%L)', share_test.kept('plan_id')), '42501');
end $$;
select share_test.login('olga');
do $$
declare
  r record;
begin
  assert (select count(*) from public.list_share_links()) = 3, 'two plan links and a note link';
  assert (select array_agg(kind order by created_at desc) from public.list_share_links()) is not null, 'listed';
  select * into r from public.list_share_links() where id = share_test.kept('plan_id')::uuid;
  assert r.label = 'For mum' and r.kind = 'plan' and r.view_count >= 1 and r.revoked_at is null, 'what the list says';
  perform public.revoke_share_link(share_test.kept('plan_id')::uuid);
  perform public.revoke_share_link(share_test.kept('plan_id')::uuid);   -- twice is fine
  perform public.revoke_share_link('f5ffffff-0000-0000-0000-000000000000');   -- unknown is fine
  assert (select revoked_at is not null from public.list_share_links() where id = share_test.kept('plan_id')::uuid), 'stopped, and still listed';
  perform public.revoke_share_link(share_test.kept('note_id')::uuid);
end $$;
select share_test.anon();
do $$ begin
  assert public.get_shared(share_test.kept('plan')) is null, 'a stopped plan link answers null';
  assert public.get_shared(share_test.kept('plan2')) is not null, 'the other plan link still works';
  assert public.get_shared(share_test.kept('note')) is null, 'a stopped note link answers null';
end $$;
select share_test.logout();
do $$ begin
  assert (select snapshot is null from public.shared_links where id = share_test.kept('note_id')::uuid), 'stopping a note link wipes its copy';
  assert (select revoked_at from public.shared_links where id = share_test.kept('plan_id')::uuid) <= now(), 'revoked_at kept from the first stop';
end $$;
commit;

-- =============================================================================
-- 5. LIMITS, EXPORT, ACCOUNT DELETION
-- =============================================================================
\echo '== share links: 50 active links at most'
begin;
select share_test.login('olga');
do $$
declare
  i int;
  active int := (select count(*) from public.list_share_links() where revoked_at is null);
begin
  for i in 1 .. 50 - active loop
    perform public.create_share_link('note', null, jsonb_build_object('body', 'note ' || i));
  end loop;
  perform share_test.fails($q$select public.create_share_link('note', null, '{"body":"one more"}')$q$, '54000');
  perform public.revoke_share_link((select id from public.list_share_links() where revoked_at is null limit 1));
  perform public.create_share_link('note', null, '{"body":"now there is room"}');
end $$;
rollback;

\echo '== share links: an expired note link loses its copy at the next create'
begin;
select share_test.login('olga');
do $$
declare
  r jsonb := public.create_share_link('note', null, '{"body":"short lived"}', null, null, 1);
begin
  insert into share_test.kept values ('short', r ->> 'id');
end $$;
select share_test.logout();
update public.shared_links set expires_at = now() - interval '1 minute' where id = share_test.kept('short')::uuid;
select share_test.login('olga');
do $$ begin perform public.create_share_link('note', null, '{"body":"another"}'); end $$;
select share_test.logout();
do $$ begin assert (select snapshot is null from public.shared_links where id = share_test.kept('short')::uuid), 'the old copy is gone'; end $$;
rollback;

\echo '== share links: download my data lists them, never the token or its hash'
begin;
select share_test.login('olga');
do $$
declare
  e jsonb := public.export_my_data();
  l jsonb;
begin
  assert jsonb_array_length(e -> 'shared_links') = 3, 'three links';
  for l in select * from jsonb_array_elements(e -> 'shared_links') loop
    assert not (l ? 'token_hash') and not (l ? 'token'), 'no token, no hash';
  end loop;
  assert e::text not like '%' || share_test.kept('plan2') || '%', 'the token is not in the export';
  assert e ? 'journey_days' and e ? 'stamps' and e ? 'tracks', 'the rest of the export is as before';
end $$;
select share_test.login('fred');
do $$ begin assert jsonb_array_length(public.export_my_data() -> 'shared_links') = 0, 'fred exports none of olga''s'; end $$;
rollback;

\echo '== share links: deleting the account removes the links'
delete from auth.users where id = share_test.u('olga');
do $$ begin
  assert (select count(*) from public.shared_links where owner_id = share_test.u('olga')) = 0, 'gone with the account';
end $$;

-- =============================================================================
-- CLEAN UP
-- =============================================================================
delete from auth.users where id::text like 'f5%';
do $$ begin
  assert (select count(*) from public.profiles where id::text like 'f5%') = 0, 'pilgrims removed';
  assert (select count(*) from public.shared_links where owner_id::text like 'f5%') = 0, 'links removed';
end $$;
drop schema share_test cascade;
