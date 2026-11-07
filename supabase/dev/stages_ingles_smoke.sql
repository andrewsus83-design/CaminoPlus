-- The stages of the Camino Inglés (migration 20261113010000_camino_ingles_stages): the six stages of the main line from
-- Ferrol are in the database, hidden, with no distance, and nothing else changed.
-- Runs on any database that has the migrations and the seed. It changes nothing that stays: every write is inside a
-- transaction that is rolled back, and the migration itself is idempotent.
--
--   1. the migration can be run again (twice here) and changes nothing: the route row and the stages of every other route
--      stay as they are
--   2. the route has six main-line stages, numbered 1 to 6 in a row, with the ids the stage files use
--   3. every one is hidden and has no distance, no places, no geometry: nothing was invented; they meet end to start,
--      from the start of the route to its end
--   4. what a pilgrim can read: anon and a signed-in person see none of them
--   5. a hidden stage cannot be chosen as the start of a journey; once opened (inside this transaction only), a stage
--      without a distance is plannable: start_journey plans six days, no kilometres, no error
\set ON_ERROR_STOP 1

-- the route row and every other route's stages as they are now (a temp table lasts for the whole file)
create temp table ingles_before as
select (select to_jsonb(r) from public.routes r where r.id = '20000000-0000-0000-0000-000000000006') as route_row,
       (select count(*) from public.stages where route_id <> '20000000-0000-0000-0000-000000000006') as other_stages,
       (select md5(string_agg(s.id::text || '/' || s.stage_number || '/' || s.name || '/' || s.is_published::text
                              || '/' || coalesce(s.distance_km::text, '-'), ',' order by s.id))
          from public.stages s where s.route_id <> '20000000-0000-0000-0000-000000000006') as other_digest;

-- ---------------------------------------------------------------- 1. run it again
\ir ../migrations/20261113010000_camino_ingles_stages.sql
\ir ../migrations/20261113010000_camino_ingles_stages.sql

do $$
declare
  b record;
begin
  select * into b from ingles_before;
  assert b.route_row is not null, 'the route row of the Camino Inglés exists (the foreign key needs it)';
  assert b.route_row is not distinct from (select to_jsonb(r) from public.routes r where r.id = '20000000-0000-0000-0000-000000000006'),
         'running the migration again left the route row as it was';
  assert b.other_stages > 0, 'fixture: other routes have stages';
  assert b.other_stages = (select count(*) from public.stages where route_id <> '20000000-0000-0000-0000-000000000006'),
         'running the migration again added no stage to another route';
  assert b.other_digest is not distinct from
         (select md5(string_agg(s.id::text || '/' || s.stage_number || '/' || s.name || '/' || s.is_published::text
                                || '/' || coalesce(s.distance_km::text, '-'), ',' order by s.id))
            from public.stages s where s.route_id <> '20000000-0000-0000-0000-000000000006'),
         'running the migration again changed no stage of another route';
end $$;

-- ---------------------------------------------------------------- 2 and 3. the rows
do $$
declare
  ing constant uuid := '20000000-0000-0000-0000-000000000006';
  r record;
begin
  assert (select count(*) from public.stages where route_id = ing and variant_of is null and deleted_at is null) = 6, 'six stages';
  assert (select array_agg(stage_number order by stage_number) = (select array_agg(g order by g) from generate_series(1, 6) g)
          from public.stages where route_id = ing and variant_of is null), 'numbered 1 to 6 in a row';
  assert (select bool_and(id = ('40000000-0000-0000-0005-' || lpad(stage_number::text, 12, '0'))::uuid)
          from public.stages where route_id = ing and variant_of is null), 'the ids are the ones of the stage files';
  assert (select count(*) from public.stages where route_id = ing and stage_number = 1) = 1, 'one row per number';
  assert (select is_nullable = 'YES' from information_schema.columns
          where table_schema = 'public' and table_name = 'stages' and column_name = 'distance_km'), 'distance_km accepts null';

  -- a name, hidden, and nothing else
  for r in select * from public.stages where route_id = ing order by stage_number loop
    assert not r.is_published, format('stage %s is hidden', r.stage_number);
    assert r.distance_km is null, format('stage %s has no distance: none is cited', r.stage_number);
    assert r.start_place_id is null and r.end_place_id is null and r.geom is null and r.elevation_gain_m is null
           and r.difficulty is null and r.description is null, format('stage %s carries nothing that was not looked up', r.stage_number);
    assert r.name ~ '^.+ to .+$' and r.deleted_at is null and r.variant_of is null, format('stage %s has a "A to B" name', r.stage_number);
  end loop;
  -- consecutive stages meet: each one starts in the town where the one before ends
  assert (select bool_and(split_part(n.name, ' to ', 1) = split_part(p.name, ' to ', 2))
          from public.stages n join public.stages p on p.route_id = n.route_id and p.stage_number = n.stage_number - 1
          where n.route_id = ing and n.stage_number between 2 and 6), 'every stage starts where the one before ends';
  -- and the whole run is the route: it starts where the route row says and ends where it says
  assert (select split_part(name, ' to ', 1) from public.stages where route_id = ing and stage_number = 1)
         = (select start_name from public.routes where id = ing), 'the first stage starts at the route''s start';
  assert (select split_part(name, ' to ', 2) from public.stages where route_id = ing and stage_number = 6)
         = (select end_name from public.routes where id = ing), 'the last stage ends at the route''s end';
  assert (select name from public.stages where route_id = ing and stage_number = 6) = 'Sigüeiro to Santiago de Compostela', 'the last stage ends in Santiago';
end $$;

-- ---------------------------------------------------------------- 4. what a pilgrim can read
begin;
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
do $$ begin
  assert (select count(*) from public.stages where route_id = '20000000-0000-0000-0000-000000000006') = 0, 'anon sees none of the Camino Inglés stages';
end $$;
reset role;
-- the policy lets an authenticated reader see exactly the same
insert into auth.users (id, email) values ('5d060000-0000-0000-0000-000000000001', 'stages.ingles.smoke@example.test');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "5d060000-0000-0000-0000-000000000001", "role": "authenticated"}', true);
do $$ begin
  assert (select count(*) from public.stages where route_id = '20000000-0000-0000-0000-000000000006') = 0, 'a signed-in person sees none of them either';
end $$;
rollback;

-- ---------------------------------------------------------------- 5. a hidden stage is not a start; an open one without a distance is plannable
begin;
reset role;
insert into auth.users (id, email) values ('5d060000-0000-0000-0000-000000000002', 'stages.ingles.smoke2@example.test');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "5d060000-0000-0000-0000-000000000002", "role": "authenticated"}', true);
do $$
declare
  refused boolean := false;
begin
  begin
    perform public.start_journey('5d0e0600-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000006',
                                 '40000000-0000-0000-0005-000000000001', '2027-05-01');
  exception when sqlstate '22023' then
    refused := true;
  end;
  assert refused, 'a hidden stage cannot be chosen as the start of a journey';
  assert (select count(*) from public.journeys where id = '5d0e0600-0000-0000-0000-000000000001') = 0, 'and nothing was created';
end $$;

-- open the six stages to the readers, inside this transaction only
reset role;
update public.stages set is_published = true
 where route_id = '20000000-0000-0000-0000-000000000006' and stage_number between 1 and 6;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "5d060000-0000-0000-0000-000000000002", "role": "authenticated"}', true);
do $$
declare
  ing constant uuid := '20000000-0000-0000-0000-000000000006';
  jid uuid;
begin
  assert (select count(*) from public.stages where route_id = ing) = 6, 'six stages are readable now';

  -- from stage 1: six days, no kilometres anywhere, and no error
  jid := public.start_journey('5d0e0600-0000-0000-0000-000000000002', ing, '40000000-0000-0000-0005-000000000001', '2027-05-01');
  assert (select planned_distance_km is null and planned_end_date = '2027-05-06' and start_stage_id = '40000000-0000-0000-0005-000000000001'
          from public.journeys where id = jid), 'the journey has no total distance, six days';
  assert (select count(*) from public.journey_days where journey_id = jid) = 6, 'six days: stages 1 to 6';
  assert (select bool_and(planned_distance_km is null) from public.journey_days where journey_id = jid), 'no day carries a made-up distance';
  assert (select array_agg(stage_id order by day_number) = array['40000000-0000-0000-0005-000000000001', '40000000-0000-0000-0005-000000000002',
                                                                 '40000000-0000-0000-0005-000000000003', '40000000-0000-0000-0005-000000000004',
                                                                 '40000000-0000-0000-0005-000000000005', '40000000-0000-0000-0005-000000000006']::uuid[]
          from public.journey_days where journey_id = jid), 'day 1 is stage 1, day 6 is stage 6';

  -- from the middle of the route
  jid := public.start_journey('5d0e0600-0000-0000-0000-000000000003', ing, '40000000-0000-0000-0005-000000000003', '2027-06-01');
  assert (select count(*) from public.journey_days where journey_id = jid) = 4, 'four days from Pontedeume';
  assert (select planned_distance_km is null and planned_end_date = '2027-06-04' from public.journeys where id = jid), 'no distance, ends on day 4';

  -- from the start of the route
  jid := public.start_journey('5d0e0600-0000-0000-0000-000000000004', ing, null, null);
  assert (select count(*) from public.journey_days where journey_id = jid) = 6, 'six days';
  assert (select planned_distance_km is null from public.journeys where id = jid), 'no total: no stage has a distance';
end $$;
rollback;

do $$ begin
  assert (select count(*) from public.stages where route_id = '20000000-0000-0000-0000-000000000006' and is_published) = 0, 'nothing stayed published';
  assert (select count(*) from public.stages where route_id = '20000000-0000-0000-0000-000000000006') = 6, 'the six rows are still there';
  assert (select count(*) from auth.users where id::text like '5d06%') = 0, 'the test people are gone';
  assert (select count(*) from public.journeys where id::text like '5d0e06%') = 0, 'and their journeys';
end $$;
\echo 'stages_ingles_smoke: all assertions passed'
