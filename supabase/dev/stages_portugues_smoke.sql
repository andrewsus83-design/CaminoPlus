-- The stages of the Camino Portugués Central (migration 20261113000000_camino_portugues_stages): the 11 stages are in the
-- database, hidden, with no distance, and a stage without a distance does not break what reads stages.
-- Runs on any database that has the migrations and the seed. It changes nothing that stays: every write is inside a
-- transaction that is rolled back, and the migration itself is idempotent.
--
--   1. the migration can be run again (twice here) and changes nothing
--   2. the route has 11 main-line stages, numbered 1 to 11 in a row, with the ids the stage files use
--   3. all of them are hidden and have no distance, no places, no geometry: nothing was invented; the Camino Francés is untouched
--   4. what a pilgrim can read: anon and a signed-in person see none of them
--   5. start_journey plans a stage without a distance: no kilometres, no error (once the stages are opened, inside a transaction)
\set ON_ERROR_STOP 1

-- ---------------------------------------------------------------- 1. run it again
\ir ../migrations/20261113000000_camino_portugues_stages.sql
\ir ../migrations/20261113000000_camino_portugues_stages.sql

-- ---------------------------------------------------------------- 2 and 3. the rows
do $$
declare
  pt constant uuid := '20000000-0000-0000-0000-000000000002';
  fr constant uuid := '20000000-0000-0000-0000-000000000001';
  r record;
begin
  assert (select count(*) from public.stages where route_id = pt and variant_of is null and deleted_at is null) = 11, 'eleven stages';
  assert (select count(*) from public.stages where route_id = pt) = 11, 'and no other row on the route';
  assert (select array_agg(stage_number order by stage_number) = (select array_agg(g order by g) from generate_series(1, 11) g)
          from public.stages where route_id = pt and variant_of is null), 'numbered 1 to 11 in a row';
  assert (select bool_and(id = ('40000000-0000-0000-0001-' || lpad(stage_number::text, 12, '0'))::uuid)
          from public.stages where route_id = pt and variant_of is null), 'the ids are the ones of the stage files';
  assert (select count(*) from public.stages where route_id = pt and stage_number = 1) = 1, 'one row per number';
  assert (select is_nullable = 'YES' from information_schema.columns
          where table_schema = 'public' and table_name = 'stages' and column_name = 'distance_km'), 'distance_km accepts null';

  -- every row: a name, hidden, and nothing else
  for r in select * from public.stages where route_id = pt order by stage_number loop
    assert not r.is_published, format('stage %s is hidden', r.stage_number);
    assert r.distance_km is null, format('stage %s has no distance: none is sourced', r.stage_number);
    assert r.start_place_id is null and r.end_place_id is null and r.geom is null and r.elevation_gain_m is null
           and r.difficulty is null and r.description is null, format('stage %s carries nothing that was not looked up', r.stage_number);
    assert r.name ~ '^.+ to .+$' and r.deleted_at is null and r.variant_of is null, format('stage %s has a "A to B" name', r.stage_number);
  end loop;
  -- consecutive stages meet: each one starts in the town where the one before ends
  assert (select bool_and(split_part(n.name, ' to ', 1) = split_part(p.name, ' to ', 2))
          from public.stages n join public.stages p on p.route_id = n.route_id and p.stage_number = n.stage_number - 1
          where n.route_id = pt and n.stage_number between 2 and 11), 'every stage starts where the one before ends';
  assert (select name from public.stages where route_id = pt and stage_number = 1) = 'Porto to Vilarinho', 'the first stage starts in Porto';
  assert (select name from public.stages where route_id = pt and stage_number = 11) = 'Padrón to Santiago de Compostela', 'the last stage ends in Santiago';

  -- the other routes are not touched: the Camino Francés still has its 33 stages (the other ids start 0000, not 0001)
  assert (select count(*) from public.stages where route_id = fr and variant_of is null) = 33, 'the Camino Francés keeps its 33 stages';
  assert (select count(*) from public.stages where id::text like '40000000-0000-0000-0001-%') = 11, 'this id range holds these eleven rows only';
end $$;

-- ---------------------------------------------------------------- 4. what a pilgrim can read
begin;
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
do $$ begin
  assert (select count(*) from public.stages where route_id = '20000000-0000-0000-0000-000000000002') = 0, 'anon sees none of the Camino Portugués stages';
end $$;
reset role;
-- the policy lets an authenticated reader see exactly the same
insert into auth.users (id, email) values ('5d000000-0000-0000-0001-000000000001', 'stages.pt.smoke@example.test');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "5d000000-0000-0000-0001-000000000001", "role": "authenticated"}', true);
do $$ begin
  assert (select count(*) from public.stages where route_id = '20000000-0000-0000-0000-000000000002') = 0, 'a signed-in person sees none of them';
  assert (select count(*) from public.stages where id::text like '40000000-0000-0000-0001-%') = 0, 'and none in the id range of this route';
end $$;
rollback;

-- ---------------------------------------------------------------- 5. a stage without a distance is plannable
begin;
reset role;
insert into auth.users (id, email) values ('5d000000-0000-0000-0001-000000000002', 'stages.pt.smoke2@example.test');
-- open stages 1 and 2 to the readers, inside this transaction only
update public.stages set is_published = true
 where route_id = '20000000-0000-0000-0000-000000000002' and stage_number in (1, 2);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "5d000000-0000-0000-0001-000000000002", "role": "authenticated"}', true);
do $$
declare
  pt constant uuid := '20000000-0000-0000-0000-000000000002';
  jid uuid;
begin
  assert (select count(*) from public.stages where route_id = pt) = 2, 'two stages are readable now';

  -- from stage 1: two days (1 and 2), no kilometres anywhere, and no error
  jid := public.start_journey('5d0e0000-0000-0000-0001-000000000001', pt, '40000000-0000-0000-0001-000000000001', '2027-05-01');
  assert (select planned_distance_km is null and planned_end_date = '2027-05-02' and start_stage_id = '40000000-0000-0000-0001-000000000001'
          from public.journeys where id = jid), 'the journey has no total distance, two days';
  assert (select count(*) from public.journey_days where journey_id = jid) = 2, 'two days: stages 1 and 2';
  assert (select bool_and(planned_distance_km is null) from public.journey_days where journey_id = jid), 'no day carries a made-up distance';
  assert (select array_agg(stage_id order by day_number) = array['40000000-0000-0000-0001-000000000001', '40000000-0000-0000-0001-000000000002']::uuid[]
          from public.journey_days where journey_id = jid), 'day 1 is stage 1, day 2 is stage 2';

  -- from the start of the route (no start stage chosen): the same two days, and still no total
  jid := public.start_journey('5d0e0000-0000-0000-0001-000000000002', pt, null, null);
  assert (select count(*) from public.journey_days where journey_id = jid) = 2, 'two days';
  assert (select planned_distance_km is null from public.journeys where id = jid), 'no kilometres are known, so none are made up';

  -- a stage that is still hidden cannot be chosen as the start
  begin
    perform public.start_journey('5d0e0000-0000-0000-0001-000000000003', pt, '40000000-0000-0000-0001-000000000003', null);
    assert false, 'a hidden stage must not be a starting stage';
  exception when sqlstate '22023' then
    null;
  end;
end $$;
rollback;

do $$ begin
  assert (select count(*) from public.stages where route_id = '20000000-0000-0000-0000-000000000002' and is_published) = 0, 'nothing stayed published';
  assert (select count(*) from auth.users where id::text like '5d000000-0000-0000-0001-%') = 0, 'the test people are gone';
end $$;
\echo 'stages_portugues_smoke: all assertions passed'
