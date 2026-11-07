-- The stages of the Camino Francés (migration 20261112000000_camino_frances_stages): stages 4 to 33 are in the database,
-- hidden, with no distance, and a stage without a distance does not break what reads stages.
-- Runs on any database that has the migrations and the seed. It changes nothing that stays: every write is inside a
-- transaction that is rolled back, and the migration itself is idempotent.
--
--   1. the migration can be run again (twice here) and changes nothing
--   2. the route has 33 main-line stages, numbered 1 to 33 in a row, with the ids the stage files use
--   3. stages 1 to 3 are what the seed says (published, with their kilometres); stages 4 to 33 are hidden and have no
--      distance, no places, no geometry: nothing was invented
--   4. what a pilgrim can read: anon and a signed-in person see the three published stages only
--   5. distance_km accepts null, and start_journey plans a stage without a distance: no kilometres, no error
\set ON_ERROR_STOP 1

-- ---------------------------------------------------------------- 1. run it again
\ir ../migrations/20261112000000_camino_frances_stages.sql
\ir ../migrations/20261112000000_camino_frances_stages.sql

-- ---------------------------------------------------------------- 2 and 3. the rows
do $$
declare
  fr constant uuid := '20000000-0000-0000-0000-000000000001';
  r record;
begin
  assert (select count(*) from public.stages where route_id = fr and variant_of is null and deleted_at is null) = 33, 'thirty-three stages';
  assert (select array_agg(stage_number order by stage_number) = (select array_agg(g order by g) from generate_series(1, 33) g)
          from public.stages where route_id = fr and variant_of is null), 'numbered 1 to 33 in a row';
  assert (select bool_and(id = ('40000000-0000-0000-0000-' || lpad(stage_number::text, 12, '0'))::uuid)
          from public.stages where route_id = fr and variant_of is null), 'the ids are the ones of the stage files';
  assert (select count(*) from public.stages where route_id = fr and stage_number = 4) = 1, 'one row per number';
  assert (select is_nullable = 'YES' from information_schema.columns
          where table_schema = 'public' and table_name = 'stages' and column_name = 'distance_km'), 'distance_km accepts null';

  -- the seed's stages are untouched
  assert (select array_agg(distance_km order by stage_number) = array[24.2, 21.4, 20.4]::numeric[] and bool_and(is_published)
          from public.stages where route_id = fr and stage_number <= 3), 'stages 1 to 3 as seeded';

  -- the rest: a name, hidden, and nothing else
  for r in select * from public.stages where route_id = fr and stage_number between 4 and 33 order by stage_number loop
    assert not r.is_published, format('stage %s is hidden', r.stage_number);
    assert r.distance_km is null, format('stage %s has no distance: none is sourced', r.stage_number);
    assert r.start_place_id is null and r.end_place_id is null and r.geom is null and r.elevation_gain_m is null
           and r.difficulty is null and r.description is null, format('stage %s carries nothing that was not looked up', r.stage_number);
    assert r.name ~ '^.+ to .+$' and r.deleted_at is null and r.variant_of is null, format('stage %s has a "A to B" name', r.stage_number);
  end loop;
  -- consecutive stages meet: each one starts in the town where the one before ends
  assert (select bool_and(split_part(n.name, ' to ', 1) = split_part(p.name, ' to ', 2))
          from public.stages n join public.stages p on p.route_id = n.route_id and p.stage_number = n.stage_number - 1
          where n.route_id = fr and n.stage_number between 4 and 33), 'every stage starts where the one before ends';
  assert (select name from public.stages where route_id = fr and stage_number = 33) = 'O Pedrouzo to Santiago de Compostela', 'the last stage ends in Santiago';
end $$;

-- ---------------------------------------------------------------- 4. what a pilgrim can read
begin;
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
do $$ begin
  assert (select count(*) from public.stages where route_id = '20000000-0000-0000-0000-000000000001') = 3, 'anon sees the three published stages only';
end $$;
reset role;
-- the policy lets an authenticated reader see exactly the same
insert into auth.users (id, email) values ('5d000000-0000-0000-0000-000000000001', 'stages.smoke@example.test');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "5d000000-0000-0000-0000-000000000001", "role": "authenticated"}', true);
do $$ begin
  assert (select count(*) from public.stages where route_id = '20000000-0000-0000-0000-000000000001') = 3, 'a signed-in person sees the three published stages only';
  assert (select max(stage_number) from public.stages where route_id = '20000000-0000-0000-0000-000000000001') = 3, 'and none of the hidden ones';
end $$;
rollback;

-- ---------------------------------------------------------------- 5. a stage without a distance is plannable
begin;
reset role;
insert into auth.users (id, email) values ('5d000000-0000-0000-0000-000000000002', 'stages.smoke2@example.test');
-- open stages 4 and 5 to the readers, inside this transaction only
update public.stages set is_published = true
 where route_id = '20000000-0000-0000-0000-000000000001' and stage_number in (4, 5);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "5d000000-0000-0000-0000-000000000002", "role": "authenticated"}', true);
do $$
declare
  fr constant uuid := '20000000-0000-0000-0000-000000000001';
  jid uuid;
begin
  assert (select count(*) from public.stages where route_id = fr) = 5, 'five stages are readable now';

  -- from stage 4: two days (4 and 5), no kilometres anywhere, and no error
  jid := public.start_journey('5d0e0000-0000-0000-0000-000000000001', fr, '40000000-0000-0000-0000-000000000004', '2027-05-01');
  assert (select planned_distance_km is null and planned_end_date = '2027-05-02' and start_stage_id = '40000000-0000-0000-0000-000000000004'
          from public.journeys where id = jid), 'the journey has no total distance, two days';
  assert (select count(*) from public.journey_days where journey_id = jid) = 2, 'two days: stages 4 and 5';
  assert (select bool_and(planned_distance_km is null) from public.journey_days where journey_id = jid), 'no day carries a made-up distance';
  assert (select array_agg(stage_id order by day_number) = array['40000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000005']::uuid[]
          from public.journey_days where journey_id = jid), 'day 1 is stage 4, day 2 is stage 5';

  -- from the start of the route: the three stages with kilometres and the two without add up to the known ones
  jid := public.start_journey('5d0e0000-0000-0000-0000-000000000002', fr, null, null);
  assert (select count(*) from public.journey_days where journey_id = jid) = 5, 'five days';
  assert (select planned_distance_km = 66.0 from public.journeys where id = jid), 'the total counts only the kilometres that are known (24.2 + 21.4 + 20.4)';
  assert (select count(*) filter (where planned_distance_km is null) = 2 from public.journey_days where journey_id = jid), 'two days without kilometres';
end $$;
rollback;

do $$ begin
  assert (select count(*) from public.stages where route_id = '20000000-0000-0000-0000-000000000001' and is_published) = 3, 'nothing stayed published';
  assert (select count(*) from auth.users where id::text like '5d00%') = 0, 'the test people are gone';
end $$;
\echo 'stages_smoke: all assertions passed'
