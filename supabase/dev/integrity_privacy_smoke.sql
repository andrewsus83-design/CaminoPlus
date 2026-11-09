-- Integrity and privacy smoke test (migration 14). Runs after the other smoke files (see
-- validate.sh) but is self-contained: it creates its own users (UUIDs start with 1a) and only
-- asserts on rows of those users.
--
-- Every fix has an ATTACK block (named S1a ... S8g, each one worked on the pre-audit schema and
-- sits in its own DO block, so it can be checked on its own) and the LEGITIMATE flow that must
-- keep working next to it: onboarding with a day plan, marking a day done, collecting a stamp
-- near a place, posting your own photo, reading your own and a visible photo, finishing a
-- journey, completing a hunt.
\set ON_ERROR_STOP 1

-- impersonation, like PostgREST does it
\set as_anna  'select set_config(''request.jwt.claims'', ''{"sub": "1a000000-0000-0000-0000-0000000000a1", "role": "authenticated"}'', true); set local role authenticated;'
\set as_ben   'select set_config(''request.jwt.claims'', ''{"sub": "1a000000-0000-0000-0000-0000000000b1", "role": "authenticated"}'', true); set local role authenticated;'
\set as_carla 'select set_config(''request.jwt.claims'', ''{"sub": "1a000000-0000-0000-0000-0000000000c1", "role": "authenticated"}'', true); set local role authenticated;'
\set as_dan   'select set_config(''request.jwt.claims'', ''{"sub": "1a000000-0000-0000-0000-0000000000d1", "role": "authenticated"}'', true); set local role authenticated;'
\set as_eve   'select set_config(''request.jwt.claims'', ''{"sub": "1a000000-0000-0000-0000-0000000000e1", "role": "authenticated"}'', true); set local role authenticated;'
\set as_fay   'select set_config(''request.jwt.claims'', ''{"sub": "1a000000-0000-0000-0000-0000000000f1", "role": "authenticated"}'', true); set local role authenticated;'
\set as_gus   'select set_config(''request.jwt.claims'', ''{"sub": "1a000000-0000-0000-0000-000000000091", "role": "authenticated"}'', true); set local role authenticated;'
\set as_hana  'select set_config(''request.jwt.claims'', ''{"sub": "1a000000-0000-0000-0000-000000000081", "role": "authenticated"}'', true); set local role authenticated;'
\set as_ivan  'select set_config(''request.jwt.claims'', ''{"sub": "1a000000-0000-0000-0000-000000000071", "role": "authenticated"}'', true); set local role authenticated;'

-- ------------------------------------------------------------------ fixtures (postgres)
-- anna: honest pilgrim, ben: second pilgrim / attacker, carla: private account, dan: second
-- person on anna's phone, eve / fay / gus: forgery attackers, hana / ivan: hunters
insert into auth.users (id, email, raw_user_meta_data) values
  ('1a000000-0000-0000-0000-0000000000a1', 'ia-anna@example.test', '{"username": "ia_anna"}'),
  ('1a000000-0000-0000-0000-0000000000b1', 'ia-ben@example.test',  '{"username": "ia_ben"}'),
  ('1a000000-0000-0000-0000-0000000000c1', 'ia-carla@example.test','{"username": "ia_carla"}'),
  ('1a000000-0000-0000-0000-0000000000d1', 'ia-dan@example.test',  '{"username": "ia_dan"}'),
  ('1a000000-0000-0000-0000-0000000000e1', 'ia-eve@example.test',  '{"username": "ia_eve"}'),
  ('1a000000-0000-0000-0000-0000000000f1', 'ia-fay@example.test',  '{"username": "ia_fay"}'),
  ('1a000000-0000-0000-0000-000000000091', 'ia-gus@example.test',  '{"username": "ia_gus"}'),
  ('1a000000-0000-0000-0000-000000000081', 'ia-hana@example.test', '{"username": "ia_hana"}'),
  ('1a000000-0000-0000-0000-000000000071', 'ia-ivan@example.test', '{"username": "ia_ivan"}');
update public.profiles set is_private = true where id = '1a000000-0000-0000-0000-0000000000c1';

-- 45 extra POIs (the seed has only two): a stamp flood needs many places. They sit in Burgos,
-- away from the seeded Roncesvalles area that other smoke files count things in, and this file
-- removes them again at the end.
insert into public.pois (id, source, category, name, location)
select ('1a1b0000-0000-0000-0000-' || lpad(to_hex(i), 12, '0'))::uuid, 'editorial', 'church', 'IA church ' || i,
       extensions.st_setsrid(extensions.st_makepoint(-3.70 + i * 0.0004, 42.35), 4326)::extensions.geography
from generate_series(1, 45) i;

-- a second stay (a review or a price report cannot hop between stays)
insert into public.stays (id, source, category, name, location, currency)
values ('1a5a0000-0000-0000-0000-000000000001', 'editorial', 'albergue_private', 'IA second stay',
        'SRID=4326;POINT(-3.7038 42.3440)', 'EUR');

-- anna has CaminoPlus (5 GB); everybody else is on the free plan (0 GB)
update public.subscriptions set status = 'active', product_id = 'plus_yearly', store = 'app_store',
  will_renew = true, expires_at = now() + interval '1 year'
where user_id = '1a000000-0000-0000-0000-0000000000a1';

-- ================================================================== S1: XP / km / badge forgery
-- S1a: self-made "completed" journeys used to pay 500 XP + the 1000 XP badge each
begin;
:as_eve
insert into public.journeys (route_id, status)
select '20000000-0000-0000-0000-000000000001', 'completed' from generate_series(1, 20);
do $$ begin
  assert (select count(*) from public.journeys where user_id = auth.uid()) = 20, 'S1a: the rows exist';
end $$;
do $$ begin
  assert (select xp from public.profiles where id = auth.uid()) = 0,
    'S1a: 20 self-made completed journeys without any progress must not pay XP';
end $$;
do $$ begin
  assert not exists (select 1 from public.user_achievements where user_id = auth.uid()),
    'S1a: ... nor the first-camino badge';
end $$;
rollback;

-- S1a: a flood of open journeys is refused (20 open at most)
begin;
:as_eve
do $$
begin
  while (select count(*) from public.journeys where user_id = auth.uid() and status in ('planning', 'active', 'paused')) < 20 loop
    insert into public.journeys (route_id, status) values ('20000000-0000-0000-0000-000000000001', 'planning');
  end loop;
  begin
    insert into public.journeys (route_id, status) values ('20000000-0000-0000-0000-000000000001', 'active');
    raise exception 'S1a: the 21st open journey was accepted';
  exception when check_violation then null;
  end;
end $$;
rollback;

-- S1a: ... and 100 journeys in total
begin;
:as_eve
do $$
begin
  while (select count(*) from public.journeys where user_id = auth.uid()) < 100 loop
    insert into public.journeys (route_id, status) values ('20000000-0000-0000-0000-000000000001', 'abandoned');
  end loop;
  begin
    insert into public.journeys (route_id, status) values ('20000000-0000-0000-0000-000000000001', 'abandoned');
    raise exception 'S1a: the 101st journey was accepted';
  exception when check_violation then null;
  end;
end $$;
rollback;

-- S1a: the route of a journey cannot be swapped afterwards (the XP is paid once per route)
begin;
:as_eve
insert into public.journeys (id, route_id) values ('1a100000-0000-0000-0000-0000000000e1', '20000000-0000-0000-0000-000000000001');
do $$ begin
  begin
    update public.journeys set route_id = '20000000-0000-0000-0000-000000000002' where id = '1a100000-0000-0000-0000-0000000000e1';
    raise exception 'S1a: route_id of a journey was changed';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- S1b: 100 stamps with the POI's own coordinates used to be 100 verified stamps (1250 XP)
begin;
:as_fay
do $$ begin
  begin
    insert into public.user_stamps (poi_id, location, stamped_at)
    select p.id, p.location, now()
    from (select id, location from public.pois where id = '50000000-0000-0000-0000-000000000001') p, generate_series(1, 100);
    raise exception 'S1b: 100 stamps at one POI on one day were accepted';
  exception when unique_violation then null;
  end;
end $$;
do $$ begin
  assert (select count(*) from public.user_stamps where user_id = auth.uid()) = 0, 'S1b: the flood left nothing behind';
end $$;
rollback;

-- S1b: the honest stamp works (verified near the POI: 10 XP + the first-stamp badge, 50)
begin;
:as_fay
insert into public.user_stamps (poi_id, location, stamped_at, place_name)
select id, location, now(), 'Colegiata' from public.pois where id = '50000000-0000-0000-0000-000000000001';
do $$ begin
  assert (select verified from public.user_stamps where user_id = auth.uid()), 'S1b: the honest stamp is verified';
  assert (select xp from public.profiles where id = auth.uid()) = 60, 'S1b: 10 XP + first-stamp badge';
end $$;
-- the same place on the same day again is refused
do $$ begin
  begin
    insert into public.user_stamps (poi_id, location, stamped_at)
    select id, location, now() from public.pois where id = '50000000-0000-0000-0000-000000000001';
    raise exception 'S1b: second stamp at the same POI on the same day accepted';
  exception when unique_violation then null;
  end;
end $$;
-- a collected stamp cannot be moved to another place ...
do $$ begin
  begin
    update public.user_stamps set poi_id = '1a1b0000-0000-0000-0000-000000000001' where user_id = auth.uid();
    raise exception 'S1b: stamp was moved to another POI';
  exception when insufficient_privilege then null;
  end;
end $$;
-- ... or re-dated
do $$ begin
  begin
    update public.user_stamps set stamped_at = now() - interval '30 days' where user_id = auth.uid();
    raise exception 'S1b: stamp was re-dated';
  exception when insufficient_privilege then null;
  end;
end $$;
-- the note can still be edited
update public.user_stamps set note = 'beautiful church' where user_id = auth.uid();
rollback;

-- S1b: many places on one day: at most 40 stamps per 24 h, and the stamp XP stops at its cap
begin;
:as_fay
insert into public.user_stamps (poi_id, location, stamped_at)
select id, location, now() from public.pois where id = '50000000-0000-0000-0000-000000000001';
do $$
declare
  i      int;
  failed int := 0;
begin
  for i in 1..45 loop
    begin
      insert into public.user_stamps (poi_id, location, stamped_at)
      select id, location, now() from public.pois where id = ('1a1b0000-0000-0000-0000-' || lpad(to_hex(i), 12, '0'))::uuid;
    exception when check_violation then
      failed := failed + 1;
    end;
  end loop;
  assert failed = 6, 'S1b: the 41st to 46th stamp of the day are refused (refused: ' || failed || ')';
  assert (select count(*) from public.user_stamps where user_id = auth.uid()) = 40, 'S1b: 40 stamps stored';
end $$;
do $$ begin
  assert (select sum(amount) from public.xp_events where user_id = auth.uid() and reason = 'stamp') = 120,
    'S1b: verified stamp XP is capped at 120 per day';
end $$;
do $$ begin
  -- 120 (stamps) + 50 (first-stamp badge) + 200 (stamps-25 badge), instead of 40 * 10 + 250
  assert (select xp from public.profiles where id = auth.uid()) = 370, 'S1b: total XP of the flood';
end $$;
rollback;

-- S1b: free-form stamps (no stay or POI to check) are 2 XP each, 8 a day, and never "verified"
begin;
:as_gus
do $$
declare i int;
begin
  for i in 1..8 loop
    insert into public.user_stamps (place_name, stamped_at, location, verified)
    values ('Somewhere ' || i, now(), 'SRID=4326;POINT(-1.5 42.9)', true);
  end loop;
end $$;
do $$ begin
  assert (select count(*) from public.user_stamps where user_id = auth.uid() and verified) = 0,
    'S1b: a client claimed "verified" is ignored';
  assert (select xp from public.profiles where id = auth.uid()) = 16 + 50,
    'S1b: free-form stamps pay 2 XP each, plus the first-stamp badge';
end $$;
do $$ begin
  begin
    insert into public.user_stamps (place_name, stamped_at) values ('Somewhere 9', now());
    raise exception 'S1b: the 9th free-form stamp of the day was accepted';
  exception when check_violation then null;
  end;
end $$;
rollback;

-- S1c: done days of 9000 km used to give km_walked = 90000
begin;
:as_gus
insert into public.journeys (id, route_id) values ('1a100000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001');
do $$ begin
  begin
    insert into public.journey_days (journey_id, day_number, status, planned_distance_km)
    select '1a100000-0000-0000-0000-000000000001', g, 'done', 9000 from generate_series(1, 10) g;
    raise exception 'S1c: 9000 km days were accepted';
  exception when check_violation then null;
  end;
end $$;
do $$ begin
  begin
    insert into public.journey_days (journey_id, day_number, status, planned_distance_km, actual_distance_km)
    values ('1a100000-0000-0000-0000-000000000001', 1, 'done', 20, -5);
    raise exception 'S1c: a negative distance was accepted';
  exception when check_violation then null;
  end;
end $$;
rollback;

-- S1c: even the largest allowed day, 20 times, only counts what a person can have walked since
-- signing up (1000 km on day zero), and the day XP stops at its daily cap
begin;
:as_gus
insert into public.journeys (id, route_id) values ('1a100000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001');
do $$
declare i int;
begin
  for i in 1..20 loop
    insert into public.journey_days (journey_id, day_number, status, planned_distance_km)
    values ('1a100000-0000-0000-0000-000000000001', i, 'done', 250);
  end loop;
  assert (select walked_km from public.journeys where id = '1a100000-0000-0000-0000-000000000001') = 5000,
    'S1c: journey km is the sum of its days';
end $$;
do $$ begin
  -- 1000 km + 100 km per UTC day since sign-up (day zero unless the run crosses midnight)
  assert (select km_walked from public.profiles where id = auth.uid())
       = 1000 + 100 * ((now() at time zone 'UTC')::date - (select (created_at at time zone 'UTC')::date from public.profiles where id = auth.uid())),
    'S1c: profile km is capped by the allowance (1000 km on day zero)';
end $$;
do $$ begin
  assert (select sum(amount) from public.xp_events where user_id = auth.uid() and reason = 'day_done') = 250,
    'S1c: day XP is capped at 250 per day';
end $$;
rollback;

-- S1c: a journey holds at most 120 days
begin;
:as_gus
insert into public.journeys (id, route_id) values ('1a100000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001');
do $$
declare i int;
begin
  for i in 1..120 loop
    insert into public.journey_days (journey_id, day_number, planned_distance_km)
    values ('1a100000-0000-0000-0000-000000000002', i, 20);
  end loop;
  begin
    insert into public.journey_days (journey_id, day_number, planned_distance_km)
    values ('1a100000-0000-0000-0000-000000000002', 121, 20);
    raise exception 'S1c: the 121st day was accepted';
  exception when check_violation then null;
  end;
end $$;
rollback;

-- S1c (regression guard): a done day without any distance counts for nothing, not for the 250 km ceiling
begin;
:as_gus
insert into public.journeys (id, route_id) values ('1a100000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001');
insert into public.journey_days (journey_id, day_number, status) values ('1a100000-0000-0000-0000-000000000005', 1, 'done');
do $$ begin
  assert (select walked_km from public.journeys where id = '1a100000-0000-0000-0000-000000000005') = 0, 'S1c: a done day without distance counts 0 km';
  assert (select km_walked from public.profiles where id = auth.uid()) = 0, 'S1c: ... also in the profile total';
end $$;
rollback;

-- S1c: a day cannot jump to another journey (the counters of the old one would go stale)
begin;
:as_gus
insert into public.journeys (id, route_id) values
  ('1a100000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001'),
  ('1a100000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001');
insert into public.journey_days (id, journey_id, day_number, planned_distance_km)
values ('1a1d0000-0000-0000-0000-0000000000f1', '1a100000-0000-0000-0000-000000000003', 1, 20);
do $$ begin
  begin
    update public.journey_days set journey_id = '1a100000-0000-0000-0000-000000000004' where id = '1a1d0000-0000-0000-0000-0000000000f1';
    raise exception 'S1c: a day was moved to another journey';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- S1d: the XP daily cap itself (direct unit test of private.award_xp, as server code)
begin;
do $$
declare
  i      int;
  gave   int := 0;
  gave_a int := 0;
  uid    uuid := '1a000000-0000-0000-0000-0000000000d1';
begin
  for i in 1..20 loop
    if private.award_xp(uid, 10, 'stamp', 'test', gen_random_uuid()) then gave := gave + 1; end if;
  end loop;
  assert gave = 12, 'S1d: 12 awards of 10 XP fit into the 120 XP daily cap (gave ' || gave || ')';
  -- the same source never pays twice
  assert private.award_xp(uid, 1, 'unlimited_reason', 'test', '1a000000-0000-0000-0000-00000000cafe'), 'S1d: first award';
  assert not private.award_xp(uid, 1, 'unlimited_reason', 'test', '1a000000-0000-0000-0000-00000000cafe'), 'S1d: the same source twice';
  -- achievements are not capped (they are bounded by their own content)
  for i in 1..3 loop
    if private.award_xp(uid, 1000, 'achievement', 'achievement', gen_random_uuid()) then gave_a := gave_a + 1; end if;
  end loop;
  assert gave_a = 3, 'S1d: achievement XP is not capped';
end $$;
do $$ begin
  assert (select xp from public.profiles where id = '1a000000-0000-0000-0000-0000000000d1') = 120 + 1 + 3000, 'S1d: profile XP follows the ledger';
end $$;
rollback;

-- S1d: and clients cannot call it at all
begin;
:as_dan
do $$ begin
  begin
    perform private.award_xp(auth.uid(), 1000000, 'demo', 'demo', gen_random_uuid());
    raise exception 'S1d: a client called private.award_xp';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- S1d: only server code writes XP (the README says so): ledger, badges and the profile columns
begin;
:as_dan
do $$ begin
  begin
    perform private.grant_achievement(auth.uid(), 'first-camino');
    raise exception 'S1d: a client called private.grant_achievement';
  exception when insufficient_privilege then null;
  end;
end $$;
do $$ begin
  begin
    insert into public.xp_events (user_id, amount, reason, source_type, source_id)
    values (auth.uid(), 5000, 'x', 'x', gen_random_uuid());
    raise exception 'S1d: a client wrote the XP ledger';
  exception when insufficient_privilege then null;
  end;
end $$;
do $$ begin
  begin
    insert into public.user_achievements (user_id, achievement_id) select auth.uid(), id from public.achievements limit 1;
    raise exception 'S1d: a client granted itself a badge';
  exception when insufficient_privilege then null;
  end;
end $$;
update public.profiles set xp = 99999, level = 99, km_walked = 99999, stamps_count = 99999 where id = auth.uid();
do $$ begin
  assert (select xp = 0 and level = 1 and km_walked = 0 and stamps_count = 0 from public.profiles where id = auth.uid()), 'S1d: the profile counters are guarded';
end $$;
rollback;

-- ================================================================== the honest pilgrim (anna)
-- onboarding: a journey with its day plan (what the app does for every new pilgrim)
begin;
:as_anna
insert into public.journeys (id, route_id, start_stage_id, title, planned_start_date, planned_distance_km, client_created_at)
values ('1a100000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-000000000001',
        '40000000-0000-0000-0000-000000000001', 'Camino Frances', current_date, 110, now());
insert into public.journey_days (id, journey_id, user_id, day_number, stage_id, from_name, to_name, planned_distance_km, planned_date) values
  ('1a1d0000-0000-0000-0000-000000000001', '1a100000-0000-0000-0000-0000000000a1', '1a000000-0000-0000-0000-0000000000a1', 1, '40000000-0000-0000-0000-000000000001', 'Saint-Jean', 'Roncesvalles', 24.2, current_date),
  ('1a1d0000-0000-0000-0000-000000000002', '1a100000-0000-0000-0000-0000000000a1', '1a000000-0000-0000-0000-0000000000a1', 2, '40000000-0000-0000-0000-000000000002', 'Roncesvalles', 'Zubiri', 21.4, current_date + 1),
  ('1a1d0000-0000-0000-0000-000000000003', '1a100000-0000-0000-0000-0000000000a1', '1a000000-0000-0000-0000-0000000000a1', 3, '40000000-0000-0000-0000-000000000003', 'Zubiri', 'Pamplona', 20.4, current_date + 2),
  ('1a1d0000-0000-0000-0000-000000000004', '1a100000-0000-0000-0000-0000000000a1', '1a000000-0000-0000-0000-0000000000a1', 4, null, 'Pamplona', 'Puente la Reina', 24, current_date + 3),
  ('1a1d0000-0000-0000-0000-000000000005', '1a100000-0000-0000-0000-0000000000a1', '1a000000-0000-0000-0000-0000000000a1', 5, null, 'Puente la Reina', 'Estella', 20, current_date + 4);
do $$ begin
  assert (select count(*) from public.journeys where user_id = auth.uid()) = 1, 'onboarding: one journey';
  assert (select count(*) from public.journey_days where journey_id = '1a100000-0000-0000-0000-0000000000a1') = 5, 'onboarding: five planned days';
  assert (select xp from public.profiles where id = auth.uid()) = 0, 'onboarding: planning pays nothing';
end $$;
commit;

-- the private notes of the journey live in journey_private (S7)
begin;
:as_anna
insert into public.journey_private (journey_id, credential_number, notes)
values ('1a100000-0000-0000-0000-0000000000a1', 'CRED-A-12345', 'my private diary');
commit;

-- marking a day done: 50 XP and the km; undoing it recounts the km; redoing it pays nothing twice
begin;
:as_anna
update public.journey_days set status = 'done', actual_distance_km = 24.5
where id = '1a1d0000-0000-0000-0000-000000000001';
do $$ begin
  assert (select xp from public.profiles where id = auth.uid()) = 50, 'day done: 50 XP';
  assert (select walked_km from public.journeys where id = '1a100000-0000-0000-0000-0000000000a1') = 24.5, 'day done: journey km';
  assert (select km_walked from public.profiles where id = auth.uid()) = 24.5, 'day done: profile km';
end $$;
update public.journey_days set status = 'planned' where id = '1a1d0000-0000-0000-0000-000000000001';
do $$ begin
  assert (select km_walked from public.profiles where id = auth.uid()) = 0, 'day undone: km recounted';
end $$;
update public.journey_days set status = 'done' where id = '1a1d0000-0000-0000-0000-000000000001';
do $$ begin
  assert (select xp from public.profiles where id = auth.uid()) = 50, 'day done twice: still 50 XP';
end $$;
commit;

-- collecting stamps next to a stay and a church, on the own journey and day
begin;
:as_anna
insert into public.user_stamps (journey_id, journey_day_id, stay_id, location, stamped_at, place_name)
values ('1a100000-0000-0000-0000-0000000000a1', '1a1d0000-0000-0000-0000-000000000001',
        '60000000-0000-0000-0000-000000000001', 'SRID=4326;POINT(-1.3196 43.0090)', now(), 'Albergue de Roncesvalles');
insert into public.user_stamps (journey_id, poi_id, location, stamped_at)
values ('1a100000-0000-0000-0000-0000000000a1', '50000000-0000-0000-0000-000000000001', 'SRID=4326;POINT(-1.3193 43.0092)', now());
do $$ begin
  assert (select count(*) from public.user_stamps where user_id = auth.uid() and verified) = 2, 'stamps near the places are verified';
  assert (select xp from public.profiles where id = auth.uid()) = 50 + 10 + 10 + 50, 'stamps: 2 x 10 XP + first-stamp badge';
  assert (select stamps_count from public.profiles where id = auth.uid()) = 2, 'stamps counter';
end $$;
commit;

-- posting your own photo (with its thumbnail), a private journal entry with a photo, and a crowd report photo
insert into storage.objects (bucket_id, name, metadata) values
  ('user-media', '1a000000-0000-0000-0000-0000000000a1/posts/p1.jpg',   '{"size": 1000}'),
  ('user-media', '1a000000-0000-0000-0000-0000000000a1/posts/p1_t.jpg', '{"size": 100}'),
  ('user-media', '1a000000-0000-0000-0000-0000000000a1/posts/j1.jpg',   '{"size": 1000}'),
  ('user-media', '1a000000-0000-0000-0000-0000000000a1/posts/secret.jpg', '{"size": 1000}'),
  ('user-media', '1a000000-0000-0000-0000-0000000000a1/crowd/c1.jpg',   '{"size": 1000}'),
  ('user-media', '1a000000-0000-0000-0000-0000000000a1/stamps/s1.jpg',  '{"size": 1000}'),
  ('user-media', '1a000000-0000-0000-0000-0000000000b1/posts/own.jpg',  '{"size": 1000}');
begin;
:as_anna
insert into public.posts (id, kind, visibility, body, journey_id, journey_day_id)
values ('1a200000-0000-0000-0000-0000000000a1', 'photo', 'public', 'Over the Pyrenees',
        '1a100000-0000-0000-0000-0000000000a1', '1a1d0000-0000-0000-0000-000000000001');
insert into public.posts (id, kind, visibility, body)
values ('1a200000-0000-0000-0000-0000000000a2', 'journal', 'private', 'Only for me');
insert into public.post_media (post_id, media_type, storage_path, thumb_path) values
  ('1a200000-0000-0000-0000-0000000000a1', 'image', '1a000000-0000-0000-0000-0000000000a1/posts/p1.jpg', '1a000000-0000-0000-0000-0000000000a1/posts/p1_t.jpg'),
  ('1a200000-0000-0000-0000-0000000000a2', 'image', '1a000000-0000-0000-0000-0000000000a1/posts/j1.jpg', null);
insert into public.crowd_reports (id, kind, location, photo_path)
values ('1a300000-0000-0000-0000-0000000000a9', 'water_source', 'SRID=4326;POINT(-1.3197 43.0089)', '1a000000-0000-0000-0000-0000000000a1/crowd/c1.jpg');
update public.user_stamps set photo_path = '1a000000-0000-0000-0000-0000000000a1/stamps/s1.jpg'
where user_id = auth.uid() and stay_id = '60000000-0000-0000-0000-000000000001';
do $$ begin
  assert (select media_count from public.posts where id = '1a200000-0000-0000-0000-0000000000a1') = 1, 'own photo post';
  assert (select count(*) from storage.objects where name like '1a000000-0000-0000-0000-0000000000a1/%') = 6, 'the owner reads the whole own folder';
end $$;
commit;

-- reading media: ben sees the public photo + thumbnail and the crowd report photo, his own file;
-- not the private journal photo, not anna's loose file, and not the stamp photo (her journey is
-- for followers and he does not follow her yet)
begin;
:as_ben
do $$ begin
  assert (select count(*) from storage.objects where name in
          ('1a000000-0000-0000-0000-0000000000a1/posts/p1.jpg', '1a000000-0000-0000-0000-0000000000a1/posts/p1_t.jpg')) = 2,
    'reading: visible post photo + thumbnail';
  assert (select count(*) from storage.objects where name = '1a000000-0000-0000-0000-0000000000a1/crowd/c1.jpg') = 1, 'reading: crowd report photo';
  assert (select count(*) from storage.objects where name = '1a000000-0000-0000-0000-0000000000b1/posts/own.jpg') = 1, 'reading: own file';
  assert (select count(*) from storage.objects where name in
          ('1a000000-0000-0000-0000-0000000000a1/posts/j1.jpg', '1a000000-0000-0000-0000-0000000000a1/posts/secret.jpg',
           '1a000000-0000-0000-0000-0000000000a1/stamps/s1.jpg')) = 0,
    'reading: private journal photo, loose file and a followers-only stamp photo stay private';
end $$;
commit;

-- finishing the journey: days 2-5 done, then status completed -> 500 XP + first-camino (1000)
begin;
:as_anna
update public.journey_days set status = 'done' where journey_id = '1a100000-0000-0000-0000-0000000000a1' and day_number between 2 and 5;
do $$ begin
  assert (select xp from public.profiles where id = auth.uid()) = 120 + 200, 'days 2-5: 4 x 50 XP';
end $$;
update public.journeys set status = 'completed', finished_at = now() where id = '1a100000-0000-0000-0000-0000000000a1';
do $$ begin
  assert (select xp from public.profiles where id = auth.uid()) = 320 + 500 + 1000, 'finished: 500 XP + 1000 XP first-camino badge';
  assert exists (select 1 from public.user_achievements ua join public.achievements a on a.id = ua.achievement_id
                 where ua.user_id = auth.uid() and a.slug = 'first-camino'), 'finished: badge';
  assert (select km_walked from public.profiles where id = auth.uid()) = 24.5 + 21.4 + 20.4 + 24 + 20, 'finished: km';
end $$;
-- the same route again, finished again with real progress: the XP is paid once per route
insert into public.journeys (id, route_id, status) values ('1a100000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-000000000001', 'active');
insert into public.journey_days (journey_id, day_number, status, planned_distance_km)
select '1a100000-0000-0000-0000-0000000000a2', g, 'done', 20 from generate_series(1, 6) g;
update public.journeys set status = 'completed' where id = '1a100000-0000-0000-0000-0000000000a2';
do $$ begin
  assert (select count(*) from public.xp_events where user_id = auth.uid() and reason = 'journey_done') = 1,
    'finished twice on one route: paid once';
end $$;
commit;

-- finishing the journey BEFORE ticking the days (a pilgrim who catches up later): the completion is
-- paid when the 5th day is ticked
begin;
:as_gus
insert into public.journeys (id, route_id, status) values ('1a100000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000002', 'completed');
insert into public.journey_days (journey_id, day_number, planned_distance_km) select '1a100000-0000-0000-0000-000000000006', g, 20 from generate_series(1, 5) g;
do $$ begin
  assert (select count(*) from public.xp_events where user_id = auth.uid() and reason = 'journey_done') = 0, 'catch-up: nothing is paid for a journey without progress';
end $$;
update public.journey_days set status = 'done' where journey_id = '1a100000-0000-0000-0000-000000000006' and day_number <= 4;
do $$ begin
  assert (select count(*) from public.xp_events where user_id = auth.uid() and reason = 'journey_done') = 0, 'catch-up: 4 days are not enough yet';
end $$;
update public.journey_days set status = 'done' where journey_id = '1a100000-0000-0000-0000-000000000006' and day_number = 5;
do $$ begin
  assert (select count(*) from public.xp_events where user_id = auth.uid() and reason = 'journey_done') = 1, 'catch-up: the 5th day pays the completion';
  assert exists (select 1 from public.user_achievements ua join public.achievements a on a.id = ua.achievement_id
                 where ua.user_id = auth.uid() and a.slug = 'first-camino'), 'catch-up: and the badge';
end $$;
rollback;

-- ================================================================== S2: reading other people's private objects
-- the audit's attack: ben writes anna's private path into columns of HIS OWN rows
begin;
:as_ben
insert into public.posts (id, kind, visibility, status, body) values ('1a200000-0000-0000-0000-0000000000b1', 'photo', 'private', 'published', 'my own post');
commit;
begin;
:as_ben
do $$ begin
  assert (select count(*) from storage.objects where name = '1a000000-0000-0000-0000-0000000000a1/posts/secret.jpg') = 0, 'S2: ben cannot read the secret to start with';
end $$;
do $$ begin
  begin
    insert into public.post_media (post_id, media_type, storage_path, thumb_path)
    values ('1a200000-0000-0000-0000-0000000000b1', 'image', '1a000000-0000-0000-0000-0000000000b1/posts/own.jpg',
            '1a000000-0000-0000-0000-0000000000a1/posts/secret.jpg');
    raise exception 'S2: a foreign thumb_path was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
do $$ begin
  begin
    insert into public.post_media (post_id, media_type, storage_path)
    values ('1a200000-0000-0000-0000-0000000000b1', 'image', '1a000000-0000-0000-0000-0000000000a1/posts/secret.jpg');
    raise exception 'S2: a foreign storage_path was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
do $$ begin
  begin
    insert into public.user_stamps (stamped_at, place_name, photo_path)
    values (now(), 'x', '1a000000-0000-0000-0000-0000000000a1/posts/secret.jpg');
    raise exception 'S2: a foreign stamp photo_path was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
do $$ begin
  begin
    insert into public.crowd_reports (kind, location, photo_path)
    values ('other', 'SRID=4326;POINT(-1.3 43.0)', '1a000000-0000-0000-0000-0000000000a1/posts/secret.jpg');
    raise exception 'S2: a foreign crowd report photo_path was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
do $$ begin
  begin
    insert into public.stay_photos (stay_id, storage_bucket, storage_path)
    values ('60000000-0000-0000-0000-000000000001', 'user-media', '1a000000-0000-0000-0000-0000000000a1/posts/secret.jpg');
    raise exception 'S2: a foreign stay photo path was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
-- an update cannot point an own row at the secret either (post_media, stamps, crowd reports)
begin;
:as_ben
insert into public.post_media (id, post_id, media_type, storage_path)
values ('1a400000-0000-0000-0000-0000000000b2', '1a200000-0000-0000-0000-0000000000b1', 'image', '1a000000-0000-0000-0000-0000000000b1/posts/own.jpg');
insert into public.user_stamps (id, stamped_at, place_name) values ('1a410000-0000-0000-0000-0000000000b2', now(), 'mine');
insert into public.crowd_reports (id, kind, location) values ('1a300000-0000-0000-0000-0000000000b2', 'other', 'SRID=4326;POINT(-1.3 43.0)');
do $$ begin
  begin
    update public.post_media set thumb_path = '1a000000-0000-0000-0000-0000000000a1/posts/secret.jpg' where id = '1a400000-0000-0000-0000-0000000000b2';
    raise exception 'S2: an update to a foreign thumb_path was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
do $$ begin
  begin
    update public.user_stamps set photo_path = '1a000000-0000-0000-0000-0000000000a1/posts/secret.jpg' where id = '1a410000-0000-0000-0000-0000000000b2';
    raise exception 'S2: an update to a foreign stamp photo_path was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
do $$ begin
  begin
    update public.crowd_reports set photo_path = '1a000000-0000-0000-0000-0000000000a1/posts/secret.jpg' where id = '1a300000-0000-0000-0000-0000000000b2';
    raise exception 'S2: an update to a foreign report photo_path was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
-- defence in depth: a row that already exists (legacy data, written by the server) does not open
-- anna's object to ben, because the row's owner is not the folder's owner
insert into public.post_media (post_id, user_id, media_type, storage_path, thumb_path)
values ('1a200000-0000-0000-0000-0000000000b1', '1a000000-0000-0000-0000-0000000000b1', 'image',
        '1a000000-0000-0000-0000-0000000000b1/posts/legacy.jpg', '1a000000-0000-0000-0000-0000000000a1/posts/secret.jpg');
insert into public.user_stamps (user_id, stamped_at, place_name, photo_path)
values ('1a000000-0000-0000-0000-0000000000b1', now(), 'legacy', '1a000000-0000-0000-0000-0000000000a1/posts/secret.jpg');
insert into public.crowd_reports (user_id, kind, location, photo_path, expires_at)
values ('1a000000-0000-0000-0000-0000000000b1', 'other', 'SRID=4326;POINT(-1.3 43.0)', '1a000000-0000-0000-0000-0000000000a1/posts/secret.jpg', now() + interval '1 hour');
begin;
:as_ben
do $$ begin
  assert (select count(*) from storage.objects where name = '1a000000-0000-0000-0000-0000000000a1/posts/secret.jpg') = 0,
    'S2: legacy rows of ben pointing at anna''s file do not open it';
end $$;
commit;
delete from public.post_media where storage_path = '1a000000-0000-0000-0000-0000000000b1/posts/legacy.jpg';
delete from public.user_stamps where user_id = '1a000000-0000-0000-0000-0000000000b1';
delete from public.crowd_reports where user_id = '1a000000-0000-0000-0000-0000000000b1';

-- ================================================================== S3: the storage quota is live
-- anna's 6 GB file got in while there was room; nobody refreshed the cached usage
insert into storage.objects (bucket_id, name, metadata)
values ('user-media', '1a000000-0000-0000-0000-0000000000a1/big/huge.mp4', '{"size": 6000000000}');
begin;
:as_anna
do $$ begin
  begin
    insert into storage.objects (bucket_id, name, metadata)
    values ('user-media', '1a000000-0000-0000-0000-0000000000a1/posts/after-huge.jpg', '{"size": 1000}');
    raise exception 'S3: an upload over the quota was accepted (the cached usage is stale)';
  exception when insufficient_privilege then null;
  end;
end $$;
do $$ begin
  assert (public.get_my_storage() ->> 'used_bytes')::bigint = 6000000000 + 1000 * 5 + 100, 'S3: get_my_storage shows the live usage';
  assert (public.get_my_storage() ->> 'remaining_bytes')::bigint < 0, 'S3: no room left';
end $$;
rollback;
-- freeing space brings the uploads back, and refresh_my_storage_usage still works
delete from storage.objects where name = '1a000000-0000-0000-0000-0000000000a1/big/huge.mp4';
begin;
:as_anna
insert into storage.objects (bucket_id, name, metadata)
values ('user-media', '1a000000-0000-0000-0000-0000000000a1/posts/after-huge.jpg', '{"size": 1000}');
do $$
declare s jsonb;
begin
  s := public.refresh_my_storage_usage();
  assert (s ->> 'used_bytes')::bigint = 1000 * 6 + 100, 'S3: refresh_my_storage_usage still works';
  assert (s ->> 'object_count')::int = 7, 'S3: object count';
  assert (select used_bytes from public.storage_usage where user_id = auth.uid()) = 6100, 'S3: the cache follows the refresh';
end $$;
commit;
-- free plan: still 0 GB
begin;
:as_ben
do $$ begin
  begin
    insert into storage.objects (bucket_id, name, metadata)
    values ('user-media', '1a000000-0000-0000-0000-0000000000b1/posts/two.jpg', '{"size": 10}');
    raise exception 'S3: a free user uploaded';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- avatars: at most 10 objects per pilgrim; at the limit, deleting an old one makes room; others are not affected
begin;
:as_anna
do $$
declare i int;
begin
  for i in 1..10 loop
    insert into storage.objects (bucket_id, name, metadata)
    values ('avatars', '1a000000-0000-0000-0000-0000000000a1/avatar-' || i || '.jpg', '{"size": 100}');
  end loop;
end $$;
do $$ begin
  begin
    insert into storage.objects (bucket_id, name, metadata)
    values ('avatars', '1a000000-0000-0000-0000-0000000000a1/avatar-11.jpg', '{"size": 100}');
    raise exception 'S3: the 11th avatar object was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
delete from storage.objects where name = '1a000000-0000-0000-0000-0000000000a1/avatar-1.jpg';
insert into storage.objects (bucket_id, name, metadata)
values ('avatars', '1a000000-0000-0000-0000-0000000000a1/avatar-11.jpg', '{"size": 100}');
rollback;
begin;
:as_dan
insert into storage.objects (bucket_id, name, metadata)
values ('avatars', '1a000000-0000-0000-0000-0000000000d1/avatar-1.jpg', '{"size": 100}');
commit;

-- business media / documents: bounded per business (the business is created by the server here)
insert into public.businesses (id, created_by, name)
values ('1a0b0000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-0000000000a1', 'IA Casa Anna');
begin;
:as_anna
do $$
declare i int;
begin
  for i in 1..200 loop
    insert into storage.objects (bucket_id, name, metadata)
    values ('business-media', '1a0b0000-0000-0000-0000-000000000001/p' || i || '.jpg', '{"size": 100}');
  end loop;
end $$;
do $$ begin
  begin
    insert into storage.objects (bucket_id, name, metadata)
    values ('business-media', '1a0b0000-0000-0000-0000-000000000001/p201.jpg', '{"size": 100}');
    raise exception 'S3: the 201st business media object was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
begin;
:as_anna
do $$
declare i int;
begin
  for i in 1..100 loop
    insert into storage.objects (bucket_id, name, metadata)
    values ('business-docs', '1a0b0000-0000-0000-0000-000000000001/d' || i || '.pdf', '{"size": 100}');
  end loop;
end $$;
do $$ begin
  begin
    insert into storage.objects (bucket_id, name, metadata)
    values ('business-docs', '1a0b0000-0000-0000-0000-000000000001/d101.pdf', '{"size": 100}');
    raise exception 'S3: the 101st business document was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
-- the owner can upload and read; a stranger cannot (the policies used to match nothing at all)
begin;
:as_anna
insert into storage.objects (bucket_id, name, metadata) values
  ('business-media', '1a0b0000-0000-0000-0000-000000000001/cover.jpg', '{"size": 100}'),
  ('business-docs',  '1a0b0000-0000-0000-0000-000000000001/licence.pdf', '{"size": 100}');
do $$ begin
  assert (select count(*) from storage.objects where bucket_id = 'business-docs' and name like '1a0b0000-0000-0000-0000-000000000001/%') = 1, 'S3: the owner reads the proof files';
end $$;
commit;
begin;
:as_ben
do $$ begin
  assert (select count(*) from storage.objects where bucket_id = 'business-docs' and name like '1a0b0000-0000-0000-0000-000000000001/%') = 0, 'S3: a stranger cannot read the proof files';
end $$;
do $$ begin
  begin
    insert into storage.objects (bucket_id, name, metadata) values ('business-media', '1a0b0000-0000-0000-0000-000000000001/evil.jpg', '{"size": 100}');
    raise exception 'S3: a stranger uploaded to a business folder';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- ================================================================== S4: cross-owner references
-- votes: ben confirms anna's report, then re-points the vote at his own report (self-confirm)
insert into public.crowd_reports (id, user_id, kind, location, expires_at) values
  ('1a300000-0000-0000-0000-0000000000a1', '1a000000-0000-0000-0000-0000000000a1', 'beds_full', 'SRID=4326;POINT(-1.3197 43.0089)', now() + interval '6 hours'),
  ('1a300000-0000-0000-0000-0000000000b1', '1a000000-0000-0000-0000-0000000000b1', 'beds_full', 'SRID=4326;POINT(-1.3197 43.0089)', now() + interval '6 hours');
begin;
:as_ben
insert into public.crowd_report_votes (report_id, vote) values ('1a300000-0000-0000-0000-0000000000a1', 1);
do $$ begin
  assert (select confirm_count from public.crowd_reports where id = '1a300000-0000-0000-0000-0000000000a1') = 1, 'vote counted';
end $$;
do $$ begin
  begin
    update public.crowd_report_votes set report_id = '1a300000-0000-0000-0000-0000000000b1'
    where report_id = '1a300000-0000-0000-0000-0000000000a1';
    raise exception 'S4: a vote was re-pointed to another report';
  exception when insufficient_privilege then null;
  end;
end $$;
do $$ begin
  assert (select confirm_count from public.crowd_reports where id = '1a300000-0000-0000-0000-0000000000b1') = 0, 'S4: no self-confirm';
  assert (select confirm_count from public.crowd_reports where id = '1a300000-0000-0000-0000-0000000000a1') = 1, 'S4: the vote stays where it was';
end $$;
-- changing the vote itself still works
update public.crowd_report_votes set vote = -1 where report_id = '1a300000-0000-0000-0000-0000000000a1';
do $$ begin
  assert (select deny_count from public.crowd_reports where id = '1a300000-0000-0000-0000-0000000000a1') = 1, 'a vote can be changed';
end $$;
commit;
-- (and the original rule: nobody votes on their own report)
begin;
:as_ben
do $$ begin
  begin
    insert into public.crowd_report_votes (report_id, vote) values ('1a300000-0000-0000-0000-0000000000b1', 1);
    raise exception 'S4: ben voted on his own report';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- post media: ben moves his media onto anna's public post (it would show there, media_count + 1)
begin;
:as_ben
insert into public.post_media (id, post_id, media_type, storage_path)
values ('1a400000-0000-0000-0000-0000000000b1', '1a200000-0000-0000-0000-0000000000b1', 'image', '1a000000-0000-0000-0000-0000000000b1/posts/own.jpg');
do $$ begin
  begin
    update public.post_media set post_id = '1a200000-0000-0000-0000-0000000000a1' where id = '1a400000-0000-0000-0000-0000000000b1';
    raise exception 'S4: media was moved onto another person''s post';
  exception when insufficient_privilege then null;
  end;
end $$;
do $$ begin
  begin
    insert into public.post_media (post_id, media_type, storage_path)
    values ('1a200000-0000-0000-0000-0000000000a1', 'image', '1a000000-0000-0000-0000-0000000000b1/posts/x.jpg');
    raise exception 'S4: media was added to another person''s post';
  exception when insufficient_privilege then null;
  end;
end $$;
do $$ begin
  assert (select media_count from public.posts where id = '1a200000-0000-0000-0000-0000000000a1') = 1, 'S4: anna''s media_count is untouched';
end $$;
rollback;

-- stamps, tracks, posts and reviews that point at somebody else's journey or day
begin;
:as_ben
do $$ begin
  begin
    insert into public.user_stamps (journey_id, stamped_at, place_name)
    values ('1a100000-0000-0000-0000-0000000000a1', now(), 'spam on anna''s journey');
    raise exception 'S4: a stamp was added to a stranger''s journey';
  exception when insufficient_privilege then null;
  end;
end $$;
do $$ begin
  begin
    insert into public.user_stamps (journey_day_id, stamped_at, place_name)
    values ('1a1d0000-0000-0000-0000-000000000002', now(), 'spam on anna''s day');
    raise exception 'S4: a stamp was added to a stranger''s journey day';
  exception when insufficient_privilege then null;
  end;
end $$;
do $$ begin
  begin
    insert into public.tracks (journey_id, started_at) values ('1a100000-0000-0000-0000-0000000000a1', now());
    raise exception 'S4: a track was added to a stranger''s journey';
  exception when insufficient_privilege then null;
  end;
end $$;
do $$ begin
  begin
    insert into public.tracks (journey_day_id, started_at) values ('1a1d0000-0000-0000-0000-000000000002', now());
    raise exception 'S4: a track was added to a stranger''s journey day';
  exception when insufficient_privilege then null;
  end;
end $$;
do $$ begin
  begin
    insert into public.posts (kind, visibility, body, journey_id) values ('journal', 'public', 'on anna''s journey page', '1a100000-0000-0000-0000-0000000000a1');
    raise exception 'S4: a post was attached to a stranger''s journey';
  exception when insufficient_privilege then null;
  end;
end $$;
do $$ begin
  begin
    insert into public.stay_reviews (stay_id, rating, journey_id) values ('60000000-0000-0000-0000-000000000001', 5, '1a100000-0000-0000-0000-0000000000a1');
    raise exception 'S4: a review was attached to a stranger''s journey';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
-- ... and an update cannot re-point own rows at a stranger's journey
begin;
:as_ben
insert into public.user_stamps (id, stamped_at, place_name) values ('1a410000-0000-0000-0000-0000000000b3', now(), 'mine');
insert into public.tracks (id, started_at) values ('1a420000-0000-0000-0000-0000000000b3', now());
do $$ begin
  begin
    update public.user_stamps set journey_id = '1a100000-0000-0000-0000-0000000000a1' where id = '1a410000-0000-0000-0000-0000000000b3';
    raise exception 'S4: a stamp was re-pointed to a stranger''s journey';
  exception when insufficient_privilege then null;
  end;
end $$;
do $$ begin
  begin
    update public.tracks set journey_id = '1a100000-0000-0000-0000-0000000000a1' where id = '1a420000-0000-0000-0000-0000000000b3';
    raise exception 'S4: a track was re-pointed to a stranger''s journey';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
-- ... while the same rows on his OWN journey work
begin;
:as_ben
insert into public.journeys (id, route_id) values ('1a100000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-000000000001');
insert into public.journey_days (id, journey_id, day_number, planned_distance_km) values ('1a1d0000-0000-0000-0000-0000000000b1', '1a100000-0000-0000-0000-0000000000b1', 1, 20);
insert into public.user_stamps (journey_id, journey_day_id, stamped_at, place_name) values ('1a100000-0000-0000-0000-0000000000b1', '1a1d0000-0000-0000-0000-0000000000b1', now(), 'my stamp');
insert into public.tracks (journey_id, journey_day_id, started_at) values ('1a100000-0000-0000-0000-0000000000b1', '1a1d0000-0000-0000-0000-0000000000b1', now());
insert into public.posts (kind, visibility, body, journey_id) values ('journal', 'private', 'my journey page', '1a100000-0000-0000-0000-0000000000b1');
commit;

-- comments stay on their post, reviews stay on their stay
begin;
:as_ben
insert into public.post_comments (id, post_id, body) values ('1a500000-0000-0000-0000-0000000000b1', '1a200000-0000-0000-0000-0000000000a1', 'Ultreia!');
insert into public.stay_reviews (id, stay_id, rating) values ('1a600000-0000-0000-0000-0000000000b1', '60000000-0000-0000-0000-000000000001', 4);
do $$ begin
  begin
    update public.post_comments set post_id = '1a200000-0000-0000-0000-0000000000b1' where id = '1a500000-0000-0000-0000-0000000000b1';
    raise exception 'S4: a comment was moved to another post';
  exception when insufficient_privilege then null;
  end;
end $$;
do $$ begin
  begin
    insert into public.post_comments (post_id, parent_id, body)
    values ('1a200000-0000-0000-0000-0000000000b1', '1a500000-0000-0000-0000-0000000000b1', 'reply under the wrong post');
    raise exception 'S4: a reply was attached to a comment of another post';
  exception when insufficient_privilege then null;
  end;
end $$;
do $$ begin
  begin
    update public.stay_reviews set stay_id = '1a5a0000-0000-0000-0000-000000000001' where id = '1a600000-0000-0000-0000-0000000000b1';
    raise exception 'S4: a review hopped to another stay';
  exception when insufficient_privilege then null;
  end;
end $$;
-- legit: a reply under the same post, an edited review
insert into public.post_comments (post_id, parent_id, body)
values ('1a200000-0000-0000-0000-0000000000a1', '1a500000-0000-0000-0000-0000000000b1', 'reply under the same post');
update public.stay_reviews set rating = 5 where id = '1a600000-0000-0000-0000-0000000000b1';
commit;

-- ================================================================== S5: forged timestamps
-- a post "from the year 2999" used to be stored as sent (and pinned to the top of the feed)
begin;
:as_ben
insert into public.posts (id, kind, visibility, status, body, created_at, updated_at, published_at, client_created_at)
values ('1a200000-0000-0000-0000-0000000000b2', 'photo', 'public', 'published', 'from the future',
        '2999-01-01', '2999-01-01', '2999-01-01', '2999-01-01');
do $$
declare p public.posts;
begin
  select * into p from public.posts where id = '1a200000-0000-0000-0000-0000000000b2';
  assert p.created_at <= now() and p.updated_at <= now(), 'S5: created_at / updated_at are server time on insert';
end $$;
do $$
declare p public.posts;
begin
  select * into p from public.posts where id = '1a200000-0000-0000-0000-0000000000b2';
  assert p.published_at <= now(), 'S5: published_at cannot be in the future';
end $$;
do $$
declare p public.posts;
begin
  select * into p from public.posts where id = '1a200000-0000-0000-0000-0000000000b2';
  assert p.client_created_at <= now() + interval '5 minutes', 'S5: client_created_at is at most 5 minutes ahead';
end $$;
-- the same through an update
update public.posts set published_at = '2999-01-01', client_created_at = '2999-01-01', created_at = '1999-01-01'
where id = '1a200000-0000-0000-0000-0000000000b2';
do $$
declare p public.posts;
begin
  select * into p from public.posts where id = '1a200000-0000-0000-0000-0000000000b2';
  assert p.published_at <= now() and p.client_created_at <= now() + interval '5 minutes', 'S5: clamped on update too';
end $$;
do $$
declare p public.posts;
begin
  select * into p from public.posts where id = '1a200000-0000-0000-0000-0000000000b2';
  assert p.created_at > now() - interval '1 minute', 'S5: created_at does not move on update';
end $$;
commit;
-- a story published "in 2999" would never expire
begin;
:as_ben
insert into public.posts (id, kind, visibility, status, body, published_at)
values ('1a200000-0000-0000-0000-0000000000b3', 'story', 'public', 'published', 'forever', '2999-01-01');
do $$ begin
  assert (select expires_at from public.posts where id = '1a200000-0000-0000-0000-0000000000b3') <= now() + interval '24 hours',
    'S5: a story expires 24 hours after it was really published';
end $$;
commit;
-- other tables, e.g. favourites
begin;
:as_ben
insert into public.favorites (id, stay_id, created_at, updated_at)
values ('1a210000-0000-0000-0000-0000000000b1', '60000000-0000-0000-0000-000000000001', '2999-01-01', '2999-01-01');
do $$ begin
  assert (select created_at <= now() and updated_at <= now() from public.favorites where id = '1a210000-0000-0000-0000-0000000000b1'),
    'S5: favourites get server time';
end $$;
commit;
-- server code is not restricted: an import can still carry its own dates
insert into public.posts (id, user_id, kind, visibility, status, body, created_at, published_at)
values ('1a200000-0000-0000-0000-0000000000b4', '1a000000-0000-0000-0000-0000000000b1', 'journal', 'private', 'published', 'imported entry',
        '2020-05-01', '2020-05-01');
do $$ begin
  assert (select created_at from public.posts where id = '1a200000-0000-0000-0000-0000000000b4') = '2020-05-01'::timestamptz, 'S5: server code keeps its dates';
end $$;
-- every client-writable table with such columns is covered (the list comes from the catalog).
-- A table that handles server time itself (messages) can be named here; for any other new
-- table: select private.attach_server_time_triggers(); at the end of its migration.
do $$
declare
  missing text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into missing
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and (has_any_column_privilege('authenticated', c.oid, 'INSERT') or has_any_column_privilege('anon', c.oid, 'INSERT'))
    and exists (select 1 from pg_attribute a
                where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
                  and a.attname in ('created_at', 'updated_at', 'published_at', 'client_created_at'))
    and c.relname not in ('messages')
    and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'a_force_server_times' and not t.tgisinternal);
  assert missing is null, 'S5: client-writable tables without the server time trigger: ' || missing
    || ' (run select private.attach_server_time_triggers() at the end of the migration that created them)';
end $$;

-- ================================================================== S6: scavenger hunts
insert into public.hunts (id, route_id, stage_id, title, xp_reward, is_published, starts_at, ends_at) values
  ('1a700000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'IA hunt', 100, true, null, null),
  ('1a700000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'IA ended hunt', 100, true, now() - interval '10 days', now() - interval '2 days'),
  ('1a700000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'IA future hunt', 100, true, now() + interval '2 days', now() + interval '9 days'),
  ('1a700000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'IA id clash hunt', 100, true, null, null);
insert into public.hunt_steps (id, hunt_id, step_number, title, poi_id, radius_m, verification, xp_reward) values
  ('1a710000-0000-0000-0000-000000000001', '1a700000-0000-0000-0000-000000000001', 1, 'photo at the church', '50000000-0000-0000-0000-000000000001', 80, 'photo', 10),
  ('1a710000-0000-0000-0000-000000000002', '1a700000-0000-0000-0000-000000000001', 2, 'photo anywhere', null, 80, 'photo', 10),
  ('1a710000-0000-0000-0000-000000000003', '1a700000-0000-0000-0000-000000000001', 3, 'read the sign', null, 80, 'answer', 10),
  ('1a710000-0000-0000-0000-000000000004', '1a700000-0000-0000-0000-000000000001', 4, 'scan the code', null, 80, 'qr', 10),
  ('1a710000-0000-0000-0000-000000000005', '1a700000-0000-0000-0000-000000000002', 1, 'gps, hunt is over', '50000000-0000-0000-0000-000000000001', 80, 'gps', 10),
  ('1a710000-0000-0000-0000-000000000006', '1a700000-0000-0000-0000-000000000003', 1, 'gps, hunt has not started', '50000000-0000-0000-0000-000000000001', 80, 'gps', 10),
  ('1a710000-0000-0000-0000-000000000007', '1a700000-0000-0000-0000-000000000004', 1, 'gps for the id clash', '50000000-0000-0000-0000-000000000001', 80, 'gps', 10);
insert into private.hunt_step_answers (step_id, answer) values
  ('1a710000-0000-0000-0000-000000000003', 'camino'),
  ('1a710000-0000-0000-0000-000000000004', 'QR-IA-1');
insert into storage.objects (bucket_id, name, metadata) values
  ('user-media', '1a000000-0000-0000-0000-000000000081/hunt/church.jpg', '{"size": 100}'),
  ('user-media', '1a000000-0000-0000-0000-000000000081/hunt/free.jpg', '{"size": 100}');

-- photo steps: the photo must exist in the own folder, and a step with a place needs a GPS fix
begin;
:as_hana
do $$
declare r jsonb;
begin
  r := public.complete_hunt_step('1a710000-0000-0000-0000-000000000001', 43.0093, -1.3194,
         p_photo_path => '1a000000-0000-0000-0000-0000000000b1/hunt/other.jpg');
  assert r ->> 'error' = 'photo_required', 'S6: a photo from somebody else''s folder is refused: ' || r::text;
end $$;
do $$
declare r jsonb;
begin
  r := public.complete_hunt_step('1a710000-0000-0000-0000-000000000001', 43.0093, -1.3194,
         p_photo_path => '1a000000-0000-0000-0000-000000000081/hunt/never-uploaded.jpg');
  assert r ->> 'error' = 'photo_not_found', 'S6: a photo path without a file is refused: ' || r::text;
end $$;
do $$
declare r jsonb;
begin
  r := public.complete_hunt_step('1a710000-0000-0000-0000-000000000001',
         p_photo_path => '1a000000-0000-0000-0000-000000000081/hunt/church.jpg');
  assert r ->> 'error' = 'location_required', 'S6: a photo step at a place needs a GPS fix: ' || r::text;
end $$;
do $$
declare r jsonb;
begin
  r := public.complete_hunt_step('1a710000-0000-0000-0000-000000000001', 43.0, -1.5,
         p_photo_path => '1a000000-0000-0000-0000-000000000081/hunt/church.jpg');
  assert r ->> 'error' = 'verification_failed', 'S6: a photo taken far away is refused: ' || r::text;
end $$;
do $$
declare r jsonb;
begin
  r := public.complete_hunt_step('1a710000-0000-0000-0000-000000000001', 123, -1.3194,
         p_photo_path => '1a000000-0000-0000-0000-000000000081/hunt/church.jpg');
  assert r ->> 'error' = 'bad_coordinates', 'S6: impossible coordinates are refused: ' || r::text;
end $$;
-- the honest ones
do $$
declare r jsonb;
begin
  r := public.complete_hunt_step('1a710000-0000-0000-0000-000000000001', 43.0093, -1.3194,
         p_photo_path => '1a000000-0000-0000-0000-000000000081/hunt/church.jpg');
  assert (r ->> 'ok')::boolean and (r ->> 'remaining_steps')::int = 3, 'S6: photo at the church works: ' || r::text;
  r := public.complete_hunt_step('1a710000-0000-0000-0000-000000000002',
         p_photo_path => '1a000000-0000-0000-0000-000000000081/hunt/free.jpg');
  assert (r ->> 'ok')::boolean and (r ->> 'remaining_steps')::int = 2, 'S6: a photo step without a place needs only the file: ' || r::text;
  r := public.complete_hunt_step('1a710000-0000-0000-0000-000000000001', 43.0093, -1.3194,
         p_photo_path => '1a000000-0000-0000-0000-000000000081/hunt/church.jpg');
  assert (r ->> 'already_completed')::boolean, 'S6: replays stay idempotent';
end $$;
commit;

-- the hunt window
begin;
:as_hana
do $$
declare r jsonb;
begin
  r := public.complete_hunt_step('1a710000-0000-0000-0000-000000000005', 43.0093, -1.3194);
  assert r ->> 'error' = 'hunt_ended', 'S6: a hunt that is over cannot be completed: ' || r::text;
end $$;
do $$
declare r jsonb;
begin
  r := public.complete_hunt_step('1a710000-0000-0000-0000-000000000006', 43.0093, -1.3194);
  assert r ->> 'error' = 'hunt_not_started', 'S6: a hunt that has not started cannot be completed: ' || r::text;
end $$;
-- an outbox item can claim a time inside the window, but not further back than 12 hours
do $$
declare r jsonb;
begin
  r := public.complete_hunt_step('1a710000-0000-0000-0000-000000000005', 43.0093, -1.3194, p_completed_at => now() - interval '5 days');
  assert r ->> 'error' = 'hunt_ended', 'S6: a back-dated completion does not reopen a finished hunt: ' || r::text;
end $$;
rollback;

-- guessing answers and codes: 10 wrong tries per hour and step (ivan guesses, hana is honest)
begin;
:as_ivan
do $$
declare
  r jsonb;
  i int;
begin
  for i in 1..10 loop
    r := public.complete_hunt_step('1a710000-0000-0000-0000-000000000003', p_answer => 'guess ' || i);
    assert r ->> 'error' = 'verification_failed', 'S6: wrong answer ' || i || ': ' || r::text;
  end loop;
end $$;
do $$
declare r jsonb;
begin
  r := public.complete_hunt_step('1a710000-0000-0000-0000-000000000003', p_answer => 'camino');
  assert r ->> 'error' = 'too_many_attempts' and (r ->> 'retry_after_s')::int between 1 and 3600,
    'S6: the 11th try is locked out even with the right answer: ' || r::text;
end $$;
do $$
declare r jsonb;
begin
  r := public.complete_hunt_step('1a710000-0000-0000-0000-000000000004', p_answer => 'QR-IA-1');
  assert (r ->> 'ok')::boolean, 'S6: another step has its own counter: ' || r::text;
end $$;
commit;
begin;
:as_hana
do $$
declare r jsonb;
begin
  r := public.complete_hunt_step('1a710000-0000-0000-0000-000000000003', p_answer => 'wrong');
  assert r ->> 'error' = 'verification_failed', 'S6: one wrong answer';
  r := public.complete_hunt_step('1a710000-0000-0000-0000-000000000003', p_answer => ' CAMINO ');
  assert (r ->> 'ok')::boolean and (r ->> 'remaining_steps')::int = 1, 'S6: the right answer still works (trimmed, any case): ' || r::text;
  r := public.complete_hunt_step('1a710000-0000-0000-0000-000000000004', p_answer => 'qr-ia-1');
  assert r ->> 'error' = 'verification_failed', 'S6: QR codes are exact';
  r := public.complete_hunt_step('1a710000-0000-0000-0000-000000000004', p_answer => 'QR-IA-1');
  assert (r ->> 'hunt_completed')::boolean, 'S6: the last step completes the hunt: ' || r::text;
end $$;
do $$ begin
  assert (select status from public.hunt_progress where user_id = auth.uid() and hunt_id = '1a700000-0000-0000-0000-000000000001') = 'completed', 'S6: progress completed';
  assert (select xp from public.profiles where id = auth.uid()) = 4 * 10 + 100, 'S6: 4 steps + the hunt pay XP';
end $$;
commit;

-- a completed hunt is final: the client used to be able to flip it back to active
begin;
:as_hana
update public.hunt_progress set status = 'active', completed_at = null where hunt_id = '1a700000-0000-0000-0000-000000000001';
update public.hunt_progress set status = 'abandoned' where hunt_id = '1a700000-0000-0000-0000-000000000001';
do $$ begin
  assert (select status from public.hunt_progress where hunt_id = '1a700000-0000-0000-0000-000000000001' and user_id = auth.uid()) = 'completed',
    'S6: a completed hunt cannot be reopened';
end $$;
do $$ begin
  assert (select completed_at from public.hunt_progress where hunt_id = '1a700000-0000-0000-0000-000000000001' and user_id = auth.uid()) is not null,
    'S6: completed_at stays';
end $$;
commit;
-- an active hunt can still be abandoned and resumed, but not re-pointed to another hunt
begin;
:as_hana
insert into public.hunt_progress (user_id, hunt_id) values (auth.uid(), '1a700000-0000-0000-0000-000000000004');
update public.hunt_progress set status = 'abandoned' where hunt_id = '1a700000-0000-0000-0000-000000000004';
update public.hunt_progress set status = 'active' where hunt_id = '1a700000-0000-0000-0000-000000000004';
do $$ begin
  assert (select status from public.hunt_progress where hunt_id = '1a700000-0000-0000-0000-000000000004' and user_id = auth.uid()) = 'active', 'S6: abandon / resume works';
end $$;
do $$ begin
  begin
    update public.hunt_progress set hunt_id = '1a700000-0000-0000-0000-000000000002' where hunt_id = '1a700000-0000-0000-0000-000000000004';
    raise exception 'S6: a progress row was re-pointed to another hunt';
  exception when insufficient_privilege then null;
  end;
end $$;
commit;

-- a client chosen id that is already taken is reported, not swallowed
begin;
:as_hana
do $$
declare r jsonb;
begin
  r := public.complete_hunt_step('1a710000-0000-0000-0000-000000000007', 43.0093, -1.3194, p_id => '1a7f0000-0000-0000-0000-000000000001');
  assert (r ->> 'ok')::boolean, 'S6: completion with a client id: ' || r::text;
end $$;
commit;
begin;
:as_ivan
do $$
declare r jsonb;
begin
  r := public.complete_hunt_step('1a710000-0000-0000-0000-000000000007', 43.0093, -1.3194, p_id => '1a7f0000-0000-0000-0000-000000000001');
  assert r ->> 'error' = 'id_conflict', 'S6: a taken id is reported: ' || r::text;
end $$;
do $$ begin
  assert not exists (select 1 from public.hunt_step_completions where user_id = auth.uid() and step_id = '1a710000-0000-0000-0000-000000000007'),
    'S6: nothing was stored for ivan';
  assert not exists (select 1 from public.xp_events where user_id = auth.uid() and source_id = '1a710000-0000-0000-0000-000000000007'),
    'S6: ... and no XP was paid for it';
end $$;
-- the same call with a fresh id works, and replaying it is idempotent
do $$
declare r jsonb;
begin
  r := public.complete_hunt_step('1a710000-0000-0000-0000-000000000007', 43.0093, -1.3194, p_id => '1a7f0000-0000-0000-0000-000000000002');
  assert (r ->> 'ok')::boolean, 'S6: a fresh id works: ' || r::text;
  r := public.complete_hunt_step('1a710000-0000-0000-0000-000000000007', 43.0093, -1.3194, p_id => '1a7f0000-0000-0000-0000-000000000002');
  assert (r ->> 'already_completed')::boolean, 'S6: replay with the same id';
end $$;
commit;

-- ================================================================== S7: private journey fields
-- ben follows anna (public account) and can read her journey, but not her credential / notes
begin;
:as_ben
insert into public.follows (followee_id) values ('1a000000-0000-0000-0000-0000000000a1');
commit;
begin;
:as_ben
do $$ begin
  assert (select count(*) from public.journeys where id = '1a100000-0000-0000-0000-0000000000a1') = 1, 'S7: the follower can read the journey row';
end $$;
do $$ begin
  begin
    perform credential_number from public.journeys;
    raise exception 'S7: journeys.credential_number is still readable';
  exception when undefined_column then null;
  end;
end $$;
do $$ begin
  begin
    perform notes from public.journeys;
    raise exception 'S7: journeys.notes is still readable';
  exception when undefined_column then null;
  end;
end $$;
do $$ begin
  assert (select count(*) from public.journey_private) = 0, 'S7: the follower sees no private journey fields';
end $$;
do $$ begin
  begin
    insert into public.journey_private (journey_id, credential_number) values ('1a100000-0000-0000-0000-0000000000a1', 'mine now');
    raise exception 'S7: wrote private fields on a stranger''s journey';
  exception when insufficient_privilege or unique_violation then null;
  end;
end $$;
update public.journey_private set notes = 'overwritten' where journey_id = '1a100000-0000-0000-0000-0000000000a1';
-- a follower of a followers-only journey does NOT read its stamp photo: stamps are the owner's alone since
-- 20261114100000_plan_private.sql (the photo follows the stamp row through private.can_read_user_media)
do $$ begin
  assert (select count(*) from storage.objects where name = '1a000000-0000-0000-0000-0000000000a1/stamps/s1.jpg') = 0, 'S7: a follower does not read the stamp photo of the journey';
end $$;
commit;
begin;
:as_anna
do $$ begin
  assert (select credential_number from public.journey_private where journey_id = '1a100000-0000-0000-0000-0000000000a1') = 'CRED-A-12345', 'S7: the owner reads the credential';
  assert (select notes from public.journey_private where journey_id = '1a100000-0000-0000-0000-0000000000a1') = 'my private diary', 'S7: the owner reads the notes (not overwritten)';
end $$;
update public.journey_private set notes = 'my private diary, day 5' where journey_id = '1a100000-0000-0000-0000-0000000000a1';
do $$ begin
  begin
    update public.journey_private set journey_id = '1a100000-0000-0000-0000-0000000000a2' where journey_id = '1a100000-0000-0000-0000-0000000000a1';
    raise exception 'S7: private fields were re-pointed to another journey';
  exception when insufficient_privilege then null;
  end;
end $$;
commit;
do $$ begin
  assert not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'journeys'
                     and column_name in ('credential_number', 'notes')), 'S7: the columns are gone from journeys';
  assert (select relrowsecurity from pg_class where oid = 'public.journey_private'::regclass), 'S7: RLS on journey_private';
end $$;

-- ================================================================== S8: smaller items
-- 8a: a private account's badges are for its followers
begin;
:as_carla
insert into public.user_stamps (stamped_at, place_name) values (now(), 'Carla was here');
commit;
begin;
:as_ben
do $$ begin
  assert exists (select 1 from public.user_achievements where user_id = '1a000000-0000-0000-0000-0000000000a1'), 'S8a: badges of a public account are visible';
end $$;
do $$ begin
  assert (select count(*) from public.user_achievements where user_id = '1a000000-0000-0000-0000-0000000000c1') = 0,
    'S8a: badges of a private account are not visible to everybody';
end $$;
insert into public.follows (followee_id) values ('1a000000-0000-0000-0000-0000000000c1');
do $$ begin
  assert (select status from public.follows where follower_id = auth.uid() and followee_id = '1a000000-0000-0000-0000-0000000000c1') = 'pending', 'S8a: following a private account is a request';
end $$;
do $$ begin
  assert (select count(*) from public.user_achievements where user_id = '1a000000-0000-0000-0000-0000000000c1') = 0, 'S8a: ... a pending request does not open the badges';
end $$;
commit;
begin;
:as_carla
update public.follows set status = 'accepted' where followee_id = auth.uid() and follower_id = '1a000000-0000-0000-0000-0000000000b1';
do $$ begin
  assert (select count(*) from public.user_achievements where user_id = auth.uid()) >= 1, 'S8a: the owner sees her own badges';
end $$;
commit;
begin;
:as_ben
do $$ begin
  assert (select count(*) from public.user_achievements where user_id = '1a000000-0000-0000-0000-0000000000c1') >= 1, 'S8a: an accepted follower sees the badges';
end $$;
commit;
begin;
:as_anna
insert into public.blocks (blocked_id) values ('1a000000-0000-0000-0000-0000000000d1');
commit;
begin;
:as_dan
do $$ begin
  assert (select count(*) from public.user_achievements where user_id = '1a000000-0000-0000-0000-0000000000a1') = 0, 'S8a: a blocked person sees no badges';
end $$;
commit;

-- 8b: price reports skewed price_from / price_to
begin;
:as_ben
do $$ begin
  begin
    insert into public.stay_prices (stay_id, item, amount) values ('60000000-0000-0000-0000-000000000001', 'dorm_bed', 20000);
    raise exception 'S8b: a price of 20000 was accepted';
  exception when check_violation then null;
  end;
end $$;
do $$ begin
  begin
    insert into public.stay_prices (stay_id, item, amount) values ('60000000-0000-0000-0000-000000000001', 'dorm_bed', -1);
    raise exception 'S8b: a negative price was accepted';
  exception when check_violation then null;
  end;
end $$;
do $$ begin
  begin
    insert into public.stay_prices (stay_id, item, amount, observed_on)
    values ('60000000-0000-0000-0000-000000000001', 'dorm_bed', 12, current_date + 5);
    raise exception 'S8b: a price observed in the future was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
do $$ begin
  begin
    insert into public.stay_prices (stay_id, item, amount, currency) values ('60000000-0000-0000-0000-000000000001', 'dorm_bed', 12, 'USD');
    raise exception 'S8b: a price in a currency the stay does not use was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
begin;
:as_ben
insert into public.stay_prices (id, stay_id, item, amount) values ('1a220000-0000-0000-0000-0000000000b1', '60000000-0000-0000-0000-000000000001', 'dorm_bed', 15);
do $$ begin
  assert (select price_to from public.stays where id = '60000000-0000-0000-0000-000000000001') <= 100, 'S8b: price range stays sane';
end $$;
do $$ begin
  begin
    insert into public.stay_prices (stay_id, item, amount) values ('60000000-0000-0000-0000-000000000001', 'dorm_bed', 16);
    raise exception 'S8b: a second report for the same stay, item and day was accepted';
  exception when unique_violation then null;
  end;
end $$;
do $$ begin
  begin
    update public.stay_prices set stay_id = '1a5a0000-0000-0000-0000-000000000001' where id = '1a220000-0000-0000-0000-0000000000b1';
    raise exception 'S8b: a price report hopped to another stay';
  exception when insufficient_privilege then null;
  end;
end $$;
update public.stay_prices set amount = 14 where id = '1a220000-0000-0000-0000-0000000000b1';
do $$ begin
  assert (select amount from public.stay_prices where id = '1a220000-0000-0000-0000-0000000000b1') = 14, 'S8b: an own report can be edited';
end $$;
commit;

-- 8c: consent rows are evidence
begin;
:as_dan
do $$ begin
  begin
    insert into public.face_match_consents (consent_version, granted_at) values ('v1', '2000-01-01');
    raise exception 'S8c: a client chose the consent date';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
begin;
:as_dan
insert into public.face_match_consents (id, consent_version) values ('1a230000-0000-0000-0000-0000000000d1', 'v1');
do $$ begin
  assert (select granted_at from public.face_match_consents where id = '1a230000-0000-0000-0000-0000000000d1') > now() - interval '1 minute', 'S8c: granted_at is server time';
end $$;
do $$ begin
  begin
    update public.face_match_consents set consent_version = 'v9' where id = '1a230000-0000-0000-0000-0000000000d1';
    raise exception 'S8c: the consent version was edited';
  exception when insufficient_privilege then null;
  end;
end $$;
do $$ begin
  begin
    update public.face_match_consents set granted_at = '2000-01-01' where id = '1a230000-0000-0000-0000-0000000000d1';
    raise exception 'S8c: the consent date was edited';
  exception when insufficient_privilege then null;
  end;
end $$;
commit;
begin;
:as_dan
update public.face_match_consents set revoked_at = '2001-01-01' where id = '1a230000-0000-0000-0000-0000000000d1';
do $$ begin
  assert (select revoked_at from public.face_match_consents where id = '1a230000-0000-0000-0000-0000000000d1') > now() - interval '1 minute', 'S8c: the revocation time is server time';
end $$;
update public.face_match_consents set revoked_at = null where id = '1a230000-0000-0000-0000-0000000000d1';
do $$ begin
  assert (select revoked_at is not null from public.face_match_consents where id = '1a230000-0000-0000-0000-0000000000d1'), 'S8c: a revoked consent cannot be switched back on';
end $$;
-- ... but he can give a new one
insert into public.face_match_consents (consent_version) values ('v2');
commit;

-- 8d: marketplace: paths in the seller's folder, original_path hidden from matched people
begin;
:as_anna
do $$ begin
  begin
    insert into public.marketplace_photos (original_path, preview_path, price_cents)
    values ('1a000000-0000-0000-0000-0000000000b1/x.jpg', '1a000000-0000-0000-0000-0000000000a1/p.jpg', 100);
    raise exception 'S8d: a foreign original_path was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
begin;
:as_anna
insert into public.marketplace_photos (id, original_path, preview_path, price_cents, status)
values ('1a240000-0000-0000-0000-0000000000a1', '1a000000-0000-0000-0000-0000000000a1/market/orig.jpg', '1a000000-0000-0000-0000-0000000000a1/market/prev.jpg', 500, 'draft');
commit;
update public.marketplace_photos set status = 'listed' where id = '1a240000-0000-0000-0000-0000000000a1';
insert into public.photo_face_matches (photo_id, user_id, score) values ('1a240000-0000-0000-0000-0000000000a1', '1a000000-0000-0000-0000-0000000000b1', 0.93);
begin;
:as_ben
do $$ begin
  assert (select preview_path from public.marketplace_photos where id = '1a240000-0000-0000-0000-0000000000a1') is not null, 'S8d: the matched person sees the preview';
end $$;
do $$ begin
  begin
    perform original_path from public.marketplace_photos where id = '1a240000-0000-0000-0000-0000000000a1';
    raise exception 'S8d: the matched person can read original_path';
  exception when insufficient_privilege then null;
  end;
end $$;
commit;

-- 8e: stay photos from pilgrims: only our storage, hidden until a moderator approves
begin;
:as_ben
do $$ begin
  begin
    insert into public.stay_photos (stay_id, url) values ('60000000-0000-0000-0000-000000000001', 'https://tracker.example/pixel.gif');
    raise exception 'S8e: a hotlinked photo URL was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
begin;
:as_ben
insert into public.stay_photos (id, stay_id, storage_bucket, storage_path, moderation_status, license, source_url)
values ('1a250000-0000-0000-0000-0000000000b1', '60000000-0000-0000-0000-000000000001', 'user-media',
        '1a000000-0000-0000-0000-0000000000b1/posts/own.jpg', 'ok', 'CC0', 'https://example.test/x');
do $$ begin
  assert (select moderation_status from public.stay_photos where id = '1a250000-0000-0000-0000-0000000000b1') = 'pending', 'S8e: a client cannot approve its own photo';
end $$;
do $$ begin
  assert (select license is null and source_url is null from public.stay_photos where id = '1a250000-0000-0000-0000-0000000000b1'), 'S8e: licence fields are server owned';
end $$;
update public.stay_photos set moderation_status = 'ok', attribution = 'me' where id = '1a250000-0000-0000-0000-0000000000b1';
do $$ begin
  assert (select moderation_status from public.stay_photos where id = '1a250000-0000-0000-0000-0000000000b1') = 'pending', 'S8e: still pending after an update that says ok';
  assert (select attribution from public.stay_photos where id = '1a250000-0000-0000-0000-0000000000b1') = 'me', 'S8e: other fields can be edited';
end $$;
do $$ begin
  begin
    update public.stay_photos set stay_id = '1a5a0000-0000-0000-0000-000000000001' where id = '1a250000-0000-0000-0000-0000000000b1';
    raise exception 'S8e: a stay photo hopped to another stay';
  exception when insufficient_privilege then null;
  end;
end $$;
commit;
begin;
:as_anna
do $$ begin
  assert (select count(*) from public.stay_photos where id = '1a250000-0000-0000-0000-0000000000b1') = 0, 'S8e: pending photos are hidden';
  assert (select count(*) from storage.objects where name = '1a000000-0000-0000-0000-0000000000b1/posts/own.jpg') = 0, 'S8e: ... and so is the file';
end $$;
commit;
update public.stay_photos set moderation_status = 'ok' where id = '1a250000-0000-0000-0000-0000000000b1';
begin;
:as_anna
do $$ begin
  assert (select count(*) from public.stay_photos where id = '1a250000-0000-0000-0000-0000000000b1') = 1, 'S8e: an approved photo is public';
  assert (select count(*) from storage.objects where name = '1a000000-0000-0000-0000-0000000000b1/posts/own.jpg') = 1, 'S8e: ... and its file can be read';
end $$;
commit;
-- the public stay page (anon) sees approved photos only
begin;
select set_config('request.jwt.claims', '', true);
set local role anon;
do $$ begin
  assert (select count(*) from public.stay_photos where id = '1a250000-0000-0000-0000-0000000000b1') = 1, 'S8e: anon sees the approved photo row';
end $$;
commit;

-- 8f: a second person on the same phone can register the push token
begin;
:as_anna
insert into public.user_devices (platform, push_token) values ('ios', 'ExponentPushToken[ia-shared-phone]');
commit;
begin;
:as_dan
insert into public.user_devices (platform, push_token) values ('ios', 'ExponentPushToken[ia-shared-phone]');
do $$ begin
  assert (select count(*) from public.user_devices where push_token = 'ExponentPushToken[ia-shared-phone]') = 1, 'S8f: dan has the token';
end $$;
commit;
do $$ begin
  assert (select user_id from public.user_devices where push_token = 'ExponentPushToken[ia-shared-phone]') = '1a000000-0000-0000-0000-0000000000d1',
    'S8f: the token moved to the new owner';
end $$;
do $$ begin
  assert not exists (select 1 from public.user_devices where user_id = '1a000000-0000-0000-0000-0000000000a1' and push_token = 'ExponentPushToken[ia-shared-phone]'),
    'S8f: and the first owner no longer receives the pushes';
end $$;
-- the same pilgrim registering again (re-install: new device row, same token) is fine too
begin;
:as_dan
insert into public.user_devices (platform, push_token) values ('android', 'ExponentPushToken[ia-shared-phone]');
do $$ begin
  assert (select count(*) from public.user_devices where push_token = 'ExponentPushToken[ia-shared-phone]') = 1, 'S8f: one row per token';
end $$;
commit;

-- 8g: the label depends on the time zone, so it is STABLE
do $$ begin
  assert (select provolatile from pg_proc where oid = 'public.verification_label(text, timestamptz)'::regprocedure) = 's', 'S8g: verification_label is STABLE';
end $$;
do $$ begin
  assert public.verification_label('owner', null) = 'Verified by owner', 'S8g: the label still works';
end $$;

-- ================================================================== clean up, and the erasure path
-- The delete-account function removes the auth user and everything of the pilgrim has to go with
-- it. This also leaves the shared catalog and storage as the other smoke files expect them.
-- (rows that only SET NULL on user deletion, and the test business, are removed first)
delete from public.stay_prices where id = '1a220000-0000-0000-0000-0000000000b1';
delete from public.stay_photos where id = '1a250000-0000-0000-0000-0000000000b1';
delete from public.businesses where id = '1a0b0000-0000-0000-0000-000000000001';
delete from auth.users where id::text like '1a000000-0000-0000-0000-%';
delete from public.hunts where id::text like '1a700000-%';
delete from public.stays where id = '1a5a0000-0000-0000-0000-000000000001';
delete from public.pois where id::text like '1a1b0000-%';
delete from storage.objects where name like '1a000000-%' or name like '1a0b0000-%';
do $$
declare
  left_over text;
begin
  select string_agg(t.what || '=' || t.n, ', ') into left_over
  from (
    select 'profiles' as what, count(*) as n from public.profiles where id::text like '1a000000-%'
    union all select 'journeys', count(*) from public.journeys where user_id::text like '1a000000-%'
    union all select 'journey_days', count(*) from public.journey_days where user_id::text like '1a000000-%'
    union all select 'journey_private', count(*) from public.journey_private where user_id::text like '1a000000-%'
    union all select 'user_stamps', count(*) from public.user_stamps where user_id::text like '1a000000-%'
    union all select 'tracks', count(*) from public.tracks where user_id::text like '1a000000-%'
    union all select 'posts', count(*) from public.posts where user_id::text like '1a000000-%'
    union all select 'post_media', count(*) from public.post_media where user_id::text like '1a000000-%'
    union all select 'crowd_reports', count(*) from public.crowd_reports where user_id::text like '1a000000-%'
    union all select 'xp_events', count(*) from public.xp_events where user_id::text like '1a000000-%'
    union all select 'user_achievements', count(*) from public.user_achievements where user_id::text like '1a000000-%'
    union all select 'hunt_progress', count(*) from public.hunt_progress where user_id::text like '1a000000-%'
    union all select 'hunt_step_attempts', count(*) from private.hunt_step_attempts where user_id::text like '1a000000-%'
    union all select 'face_match_consents', count(*) from public.face_match_consents where user_id::text like '1a000000-%'
    union all select 'marketplace_photos', count(*) from public.marketplace_photos where seller_id::text like '1a000000-%'
    union all select 'user_devices', count(*) from public.user_devices where user_id::text like '1a000000-%'
    union all select 'stay_reviews', count(*) from public.stay_reviews where user_id::text like '1a000000-%'
    union all select 'favorites', count(*) from public.favorites where user_id::text like '1a000000-%'
  ) t
  where t.n > 0;
  assert left_over is null, 'erasure: rows left behind after deleting the users: ' || left_over;
end $$;

\echo 'integrity_privacy_smoke: all assertions passed'
