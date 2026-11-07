-- The places of a stage (migration 20261111000000_stage_places): list_stage_stays() and list_stage_pois().
-- Self-contained: creates its own stages, stays, POIs and places (ids start with 5e) and removes them at the end,
-- so it can run on any database that has the migrations and the seed (and be re-run). Reads as anon and as a
-- signed-in person the way PostgREST does: request.jwt.claims + set local role.
--
--   1. the migration can be run a second time; the functions are SECURITY INVOKER, STABLE, search_path = '', open to
--      anon, authenticated and service_role and to nobody else; they answer exactly the columns the app reads
--   2. public data is readable by anon (the policies the functions rely on), and still not writable by anon
--   3. what a stage answers: walking order and its tie-breaks, the numbers (lat and lng, km, detour), contact, labels,
--      the town, verification and its date, the source and the OpenStreetMap ids
--   4. what it never answers: soft-deleted places, soft-deleted links, a stage that is not published or was deleted;
--      an unknown stage, an empty stage and NULL give an empty list, not an error
--      (also as the service role, which bypasses row level security: only the functions' own conditions hide a row from it)
--   5. the cap of 500 rows, and the same answer for anon and for a signed-in person
--   6. the seed (Roncesvalles) answers for stage 1
\set ON_ERROR_STOP 1

-- ---------------------------------------------------------------- helpers
drop schema if exists places_test cascade;
create schema places_test;
grant usage on schema places_test to anon, authenticated, service_role;

create function places_test.as_anon() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  set local role anon;
end $$;
create function places_test.as_user() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '{"sub": "5e000000-0000-0000-0000-0000000000f1", "role": "authenticated"}', true);
  set local role authenticated;
end $$;
create function places_test.as_postgres() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;
-- the server's own role: it bypasses row level security, so only the functions' own conditions can hide a row from it
create function places_test.as_service() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '{"role": "service_role"}', true);
  set local role service_role;
end $$;
-- the statement must fail; optionally with this SQLSTATE and a message that matches this pattern
create function places_test.fails(p_sql text, p_state text default null, p_msg_like text default null) returns void language plpgsql as $$
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
    if p_msg_like is not null and v_msg not like p_msg_like then
      raise exception 'expected a message like "%" but got "%" for: %', p_msg_like, v_msg, p_sql;
    end if;
    return;
  end;
  raise exception 'expected an error but the statement succeeded: %', p_sql;
end $$;
grant execute on all functions in schema places_test to anon, authenticated, service_role;

-- leftovers of a failed earlier run
delete from public.stages where id::text like '5e0a%';
delete from public.stays  where id::text like '5e0d%';
delete from public.pois   where id::text like '5e0b%';
delete from public.places where id::text like '5e0c%';

-- ---------------------------------------------------------------- fixtures
-- Stage A holds the places the assertions look at. B is not published, C is deleted, D is published and empty,
-- E holds 510 places (the cap).
insert into public.places (id, name, kind, country_code, location, deleted_at) values
  ('5e0c0000-0000-0000-0000-000000000001', 'Zzplaces Village',  'village', 'ES', 'SRID=4326;POINT(-1.40 42.98)', null),
  ('5e0c0000-0000-0000-0000-000000000002', 'Zzplaces Gone',     'hamlet',  'ES', 'SRID=4326;POINT(-1.45 42.96)', now());

insert into public.stages (id, route_id, stage_number, name, distance_km, is_published, deleted_at) values
  ('5e0a0000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000002', 5901, 'Zzplaces A', 20, true,  null),
  ('5e0a0000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-000000000002', 5902, 'Zzplaces B (not published)', 20, false, null),
  ('5e0a0000-0000-0000-0000-00000000000c', '20000000-0000-0000-0000-000000000002', 5903, 'Zzplaces C (deleted)', 20, true,  now()),
  ('5e0a0000-0000-0000-0000-00000000000d', '20000000-0000-0000-0000-000000000002', 5904, 'Zzplaces D (empty)', 20, true,  null),
  ('5e0a0000-0000-0000-0000-00000000000e', '20000000-0000-0000-0000-000000000002', 5905, 'Zzplaces E (many)', 20, true,  null);

insert into public.stays (id, source, osm_type, osm_id, category, name, description, place_id, address, location, phone, email, website,
                          opening_hours, beds, amenities, labels, has_stamp, deleted_at) values
  -- S1: everything filled in, checked by the audit
  ('5e0d0000-0000-0000-0000-000000000001', 'osm', 'node', 5000001, 'albergue_municipal', 'Zz Albergue Km3', 'A quiet albergue', '5e0c0000-0000-0000-0000-000000000001',
   'Calle Zz 1', 'SRID=4326;POINT(-1.3197 43.0089)', '+34 600 000 001', 'zz1@example.test', 'https://zz1.example.test',
   'Mo-Su 14:00-22:00', 24, '{wifi,kitchen}', '{donativo,pilgrims_only}', true, null),
  -- S2: a hotel, nothing but the basics, owner verified
  ('5e0d0000-0000-0000-0000-000000000002', 'osm', 'way', 5000002, 'hotel', 'Zz Hotel Km12', null, null,
   null, 'SRID=4326;POINT(-1.40 42.98)', null, null, null, null, null, '{}', '{verified_owner}', false, null),
  -- S3: a cafe with no km on the link
  ('5e0d0000-0000-0000-0000-000000000003', 'editorial', null, null, 'cafe', 'Zz Cafe No Km', null, null,
   null, 'SRID=4326;POINT(-1.50 42.93)', null, null, null, null, null, '{}', '{}', false, null),
  -- S4: soft-deleted stay, linked to A
  ('5e0d0000-0000-0000-0000-000000000004', 'osm', 'node', 5000004, 'bar', 'Zz Deleted Stay', null, null,
   null, 'SRID=4326;POINT(-1.30 43.00)', null, null, null, null, null, '{}', '{}', false, now()),
  -- S5: alive, but its link to A is soft-deleted
  ('5e0d0000-0000-0000-0000-000000000005', 'osm', 'node', 5000005, 'pension', 'Zz Unlinked Stay', null, null,
   null, 'SRID=4326;POINT(-1.31 43.01)', null, null, null, null, null, '{}', '{}', false, null),
  -- S6: a shop (kind service), in the town that was deleted
  ('5e0d0000-0000-0000-0000-000000000006', 'osm', 'node', 5000006, 'shop', 'Zz Shop', null, '5e0c0000-0000-0000-0000-000000000002',
   null, 'SRID=4326;POINT(-1.45 42.96)', null, null, null, null, null, '{}', '{}', false, null),
  -- S7: same km as S1, shorter detour, so it comes first
  ('5e0d0000-0000-0000-0000-000000000007', 'osm', 'node', 5000007, 'hostel', 'Zz Hostel Km3 Near', null, null,
   null, 'SRID=4326;POINT(-1.32 43.00)', null, null, null, null, null, '{}', '{}', false, null),
  -- S8: only linked to the stages that must answer nothing
  ('5e0d0000-0000-0000-0000-000000000008', 'osm', 'node', 5000008, 'casa_rural', 'Zz Elsewhere', null, null,
   null, 'SRID=4326;POINT(-1.33 43.00)', null, null, null, null, null, '{}', '{}', false, null);

insert into public.stage_stays (stage_id, stay_id, km_from_stage_start, detour_m, deleted_at) values
  ('5e0a0000-0000-0000-0000-00000000000a', '5e0d0000-0000-0000-0000-000000000001',  3.10, 120, null),
  ('5e0a0000-0000-0000-0000-00000000000a', '5e0d0000-0000-0000-0000-000000000002', 12.50,   0, null),
  ('5e0a0000-0000-0000-0000-00000000000a', '5e0d0000-0000-0000-0000-000000000003', null,  700, null),
  ('5e0a0000-0000-0000-0000-00000000000a', '5e0d0000-0000-0000-0000-000000000004',  5.00,   0, null),
  ('5e0a0000-0000-0000-0000-00000000000a', '5e0d0000-0000-0000-0000-000000000005',  6.00,   0, now()),
  ('5e0a0000-0000-0000-0000-00000000000a', '5e0d0000-0000-0000-0000-000000000006', 20.00,  30, null),
  ('5e0a0000-0000-0000-0000-00000000000a', '5e0d0000-0000-0000-0000-000000000007',  3.10,  50, null),
  -- the same stay on a stage that is not published, and on one that was deleted
  ('5e0a0000-0000-0000-0000-00000000000b', '5e0d0000-0000-0000-0000-000000000008',  1.00,   0, null),
  ('5e0a0000-0000-0000-0000-00000000000c', '5e0d0000-0000-0000-0000-000000000008',  1.00,   0, null),
  ('5e0a0000-0000-0000-0000-00000000000b', '5e0d0000-0000-0000-0000-000000000001',  1.00,   0, null);

-- the audit and the owner flow set the level (clients cannot): do it here as the server
update public.stays set verification_level = 'data_check', data_checked_at = '2026-10-15T10:00:00Z', data_confidence = 82
  where id = '5e0d0000-0000-0000-0000-000000000001';
update public.stays set verification_level = 'owner', verified_at = '2026-09-01T08:30:00Z', data_checked_at = '2026-10-15T10:00:00Z'
  where id = '5e0d0000-0000-0000-0000-000000000002';
-- the audit looked at the cafe and did not find enough agreement: it stays "unverified" but has a check date and a verified_at
-- left over from an earlier owner, neither of which says anything about the level
update public.stays set data_checked_at = '2026-10-16T10:00:00Z', data_confidence = 40, verified_at = '2025-01-01T00:00:00Z'
  where id = '5e0d0000-0000-0000-0000-000000000003';

-- 510 places on stage E, km 0.1 .. 51.0
insert into public.stays (id, source, category, name, location)
select ('5e0d0000-0000-0000-0001-' || lpad(i::text, 12, '0'))::uuid, 'osm', 'cafe', 'Zz Many ' || lpad(i::text, 3, '0'), 'SRID=4326;POINT(-3 42)'
from generate_series(1, 510) i;
insert into public.stage_stays (stage_id, stay_id, km_from_stage_start)
select '5e0a0000-0000-0000-0000-00000000000e', ('5e0d0000-0000-0000-0001-' || lpad(i::text, 12, '0'))::uuid, i / 10.0
from generate_series(1, 510) i;

insert into public.pois (id, source, osm_type, osm_id, category, name, place_id, location, phone, website, opening_hours, mass_times, has_stamp, deleted_at) values
  ('5e0b0000-0000-0000-0000-000000000001', 'osm', 'node', 6000001, 'chapel', 'Zz Chapel', '5e0c0000-0000-0000-0000-000000000001',
   'SRID=4326;POINT(-1.3193 43.0092)', '+34 600 000 002', 'https://chapel.example.test', 'Mo-Su 09:00-19:00', 'Su 11:00', true, null),
  ('5e0b0000-0000-0000-0000-000000000002', 'osm', 'node', 6000002, 'fountain', 'Zz Fountain', null,
   'SRID=4326;POINT(-1.3189 43.0099)', null, null, null, null, false, null),
  ('5e0b0000-0000-0000-0000-000000000003', 'osm', 'node', 6000003, 'church', 'Zz Deleted Poi', null,
   'SRID=4326;POINT(-1.30 43.00)', null, null, null, null, false, now()),
  ('5e0b0000-0000-0000-0000-000000000004', 'osm', 'node', 6000004, 'water', 'Zz Unlinked Poi', null,
   'SRID=4326;POINT(-1.31 43.00)', null, null, null, null, false, null),
  ('5e0b0000-0000-0000-0000-000000000005', 'editorial', null, null, 'cathedral', 'Zz Elsewhere Poi', null,
   'SRID=4326;POINT(-1.32 43.00)', null, null, null, null, false, null);
insert into public.stage_pois (stage_id, poi_id, km_from_stage_start, detour_m, deleted_at) values
  ('5e0a0000-0000-0000-0000-00000000000a', '5e0b0000-0000-0000-0000-000000000001',  5.00, 0, null),
  ('5e0a0000-0000-0000-0000-00000000000a', '5e0b0000-0000-0000-0000-000000000002',  1.00, 40, null),
  ('5e0a0000-0000-0000-0000-00000000000a', '5e0b0000-0000-0000-0000-000000000003',  2.00, 0, null),
  ('5e0a0000-0000-0000-0000-00000000000a', '5e0b0000-0000-0000-0000-000000000004',  3.00, 0, now()),
  ('5e0a0000-0000-0000-0000-00000000000b', '5e0b0000-0000-0000-0000-000000000005',  1.00, 0, null),
  ('5e0a0000-0000-0000-0000-00000000000c', '5e0b0000-0000-0000-0000-000000000005',  1.00, 0, null);
update public.pois set verification_level = 'editor', verified_at = '2026-08-20T00:00:00Z'
  where id = '5e0b0000-0000-0000-0000-000000000002';

do $$
begin
  assert (select count(*) from public.stage_stays where stage_id::text like '5e0a%') = 10 + 510, 'fixture: stage_stays';
  assert (select count(*) from public.stage_pois  where stage_id::text like '5e0a%') = 6, 'fixture: stage_pois';
end $$;

-- =============================================================================
-- 1. THE MIGRATION CAN BE RUN AGAIN; WHAT THE FUNCTIONS ARE
-- =============================================================================
\echo '== stage places: the migration is re-runnable'
\ir ../migrations/20261111000000_stage_places.sql
\ir ../migrations/20261111000000_stage_places.sql

\echo '== stage places: invoker, stable, empty search_path, grants, and exactly the columns the app reads'
do $$
declare
  fn text;
  r record;
  cols text[];
begin
  foreach fn in array array['list_stage_stays', 'list_stage_pois'] loop
    assert (select count(*) from pg_proc where proname = fn and pronamespace = 'public'::regnamespace) = 1, fn || ': one function, not two';
    select p.oid::regprocedure as sig, p.proacl, p.prosecdef, p.proconfig, p.provolatile, p.proretset into r
    from pg_proc p where p.proname = fn and p.pronamespace = 'public'::regnamespace;
    assert not r.prosecdef, fn || ': SECURITY INVOKER (row level security of the caller applies)';
    assert r.provolatile = 's', fn || ': STABLE';
    assert r.proretset, fn || ': returns a set';
    assert r.proconfig = array['search_path=""'], fn || ': search_path is empty';
    assert r.proacl is not null and not exists (select 1 from aclexplode(r.proacl) a where a.grantee = 0), fn || ': not open to PUBLIC';
    assert has_function_privilege('anon', r.sig, 'execute'), fn || ': anon may call it';
    assert has_function_privilege('authenticated', r.sig, 'execute'), fn || ': signed-in people may call it';
    assert has_function_privilege('service_role', r.sig, 'execute'), fn || ': the service role may call it';
    assert pg_get_function_arguments(r.sig) = 'p_stage uuid', fn || ': one argument, p_stage uuid';
    assert pg_get_function_result(r.sig) not ilike '%geography%' and pg_get_function_result(r.sig) not ilike '%geometry%',
      fn || ': no PostGIS column (the app cannot read hex EWKB)';
  end loop;

  -- the columns, in order: the list RPC_COLUMNS in mobile/src/features/places/api.ts says what the app reads
  select array_agg(t.n order by t.i) into cols
  from pg_proc p, unnest(p.proargnames, p.proargmodes) with ordinality as t(n, m, i)
  where p.proname = 'list_stage_stays' and p.pronamespace = 'public'::regnamespace and t.m = 't';
  assert cols = array['id', 'name', 'category', 'kind', 'place_name', 'lat', 'lng', 'phone', 'email', 'website', 'opening_hours', 'address',
                      'description', 'km_from_stage_start', 'detour_m', 'beds', 'amenities', 'labels', 'has_stamp', 'data_confidence',
                      'verification_level', 'verification_at', 'source', 'osm_type', 'osm_id'], 'list_stage_stays columns: ' || cols::text;
  select array_agg(t.n order by t.i) into cols
  from pg_proc p, unnest(p.proargnames, p.proargmodes) with ordinality as t(n, m, i)
  where p.proname = 'list_stage_pois' and p.pronamespace = 'public'::regnamespace and t.m = 't';
  assert cols = array['id', 'name', 'category', 'place_name', 'lat', 'lng', 'phone', 'website', 'opening_hours', 'mass_times',
                      'km_from_stage_start', 'detour_m', 'has_stamp', 'data_confidence', 'verification_level', 'verification_at',
                      'source', 'osm_type', 'osm_id'], 'list_stage_pois columns: ' || cols::text;
end $$;

-- =============================================================================
-- 2. PUBLIC DATA IS READABLE BY ANON, AND STILL NOT WRITABLE BY ANON
-- =============================================================================
\echo '== stage places: the policies the functions rely on let anon read, and nothing else'
do $$
declare t text;
begin
  -- a select policy that applies to anon and to authenticated, on every table the functions read
  foreach t in array array['stays', 'pois', 'stage_stays', 'stage_pois', 'places', 'stages'] loop
    assert exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and cmd in ('SELECT', 'ALL')
                   and 'anon' = any (roles) and 'authenticated' = any (roles)), t || ': a select policy for anon and authenticated';
  end loop;
end $$;
begin;
select places_test.as_anon();
do $$
begin
  assert (select count(*) from public.stays where id = '5e0d0000-0000-0000-0000-000000000001') = 1, 'anon reads a stay';
  assert (select count(*) from public.pois where id = '5e0b0000-0000-0000-0000-000000000001') = 1, 'anon reads a POI';
  assert (select count(*) from public.stage_stays where stay_id = '5e0d0000-0000-0000-0000-000000000001') = 2, 'anon reads the stage links';
  assert (select count(*) from public.stage_pois where poi_id = '5e0b0000-0000-0000-0000-000000000001') = 1, 'anon reads the POI links';
  assert (select count(*) from public.places where id = '5e0c0000-0000-0000-0000-000000000001') = 1, 'anon reads a place';
  assert (select count(*) from public.stages where id = '5e0a0000-0000-0000-0000-00000000000a') = 1, 'anon reads a published stage';
  assert (select count(*) from public.stages where id = '5e0a0000-0000-0000-0000-00000000000b') = 0, 'anon does not read an unpublished stage';
  -- but the catalogue is read only
  perform places_test.fails($q$insert into public.stage_stays (stage_id, stay_id) values ('5e0a0000-0000-0000-0000-00000000000a', '5e0d0000-0000-0000-0000-000000000008')$q$, '42501', 'permission denied%');
  perform places_test.fails($q$insert into public.stage_pois (stage_id, poi_id) values ('5e0a0000-0000-0000-0000-00000000000a', '5e0b0000-0000-0000-0000-000000000005')$q$, '42501', 'permission denied%');
  perform places_test.fails($q$update public.stays set name = 'hijacked' where id = '5e0d0000-0000-0000-0000-000000000001'$q$, '42501', 'permission denied%');
  perform places_test.fails($q$update public.stage_stays set km_from_stage_start = 0 where stay_id = '5e0d0000-0000-0000-0000-000000000001'$q$, '42501', 'permission denied%');
  perform places_test.fails($q$delete from public.pois where id = '5e0b0000-0000-0000-0000-000000000001'$q$, '42501', 'permission denied%');
end $$;
rollback;

-- =============================================================================
-- 3. WHAT A STAGE ANSWERS
-- =============================================================================
\echo '== stage places: stays of a stage, as anon: which ones, in which order, with which numbers'
begin;
select places_test.as_anon();
do $$
declare
  r record;
begin
  assert (select count(*) from public.list_stage_stays('5e0a0000-0000-0000-0000-00000000000a')) = 5, 'five places on stage A';
  -- walking order: the km, the shorter detour first on a tie, places without a km last
  assert (select array_agg(x.name order by x.ordinality) from public.list_stage_stays('5e0a0000-0000-0000-0000-00000000000a') with ordinality x)
         = array['Zz Hostel Km3 Near', 'Zz Albergue Km3', 'Zz Hotel Km12', 'Zz Shop', 'Zz Cafe No Km'], 'walking order';

  select * into r from public.list_stage_stays('5e0a0000-0000-0000-0000-00000000000a') where id = '5e0d0000-0000-0000-0000-000000000001';
  assert r.name = 'Zz Albergue Km3' and r.category = 'albergue_municipal' and r.kind = 'stay', 'name, category, kind';
  assert round(r.lat::numeric, 4) = 43.0089 and round(r.lng::numeric, 4) = -1.3197, 'lat and lng are plain numbers: ' || r.lat || ', ' || r.lng;
  assert r.phone = '+34 600 000 001' and r.email = 'zz1@example.test' and r.website = 'https://zz1.example.test', 'contact';
  assert r.opening_hours = 'Mo-Su 14:00-22:00' and r.address = 'Calle Zz 1' and r.description = 'A quiet albergue', 'hours, address, description';
  assert r.km_from_stage_start = 3.10 and r.detour_m = 120, 'where on the stage, and how far off';
  assert r.beds = 24 and r.amenities = '{wifi,kitchen}' and r.labels = '{donativo,pilgrims_only}' and r.has_stamp, 'beds, amenities, labels, stamp';
  assert r.place_name = 'Zzplaces Village', 'the town';
  assert r.source = 'osm' and r.osm_type = 'node' and r.osm_id = 5000001, 'where it came from';
  assert r.verification_level = 'data_check' and r.data_confidence = 82, 'level and confidence';
  assert r.verification_at = '2026-10-15T10:00:00Z', 'a data check is dated by data_checked_at';

  select * into r from public.list_stage_stays('5e0a0000-0000-0000-0000-00000000000a') where id = '5e0d0000-0000-0000-0000-000000000002';
  assert r.verification_level = 'owner' and r.verification_at = '2026-09-01T08:30:00Z', 'an owner level is dated by verified_at, not by the data check';
  assert r.osm_type = 'way' and r.osm_id = 5000002 and r.phone is null and r.email is null and r.website is null and r.beds is null, 'missing things stay null';
  assert r.place_name is null and r.description is null and r.km_from_stage_start = 12.5, 'no town, no description';
  assert r.labels = '{verified_owner}', 'labels are the slugs';

  select * into r from public.list_stage_stays('5e0a0000-0000-0000-0000-00000000000a') where id = '5e0d0000-0000-0000-0000-000000000003';
  assert r.km_from_stage_start is null and r.detour_m = 700 and r.kind = 'food' and r.source = 'editorial' and r.osm_type is null and r.osm_id is null,
    'a cafe with no km, from the editors, with no OpenStreetMap id';
  assert r.verification_level = 'unverified' and r.verification_at is null and r.data_confidence = 40,
    'unverified: no date, even when the audit checked it and an old verified_at is left over';

  select * into r from public.list_stage_stays('5e0a0000-0000-0000-0000-00000000000a') where id = '5e0d0000-0000-0000-0000-000000000006';
  assert r.kind = 'service' and r.place_name is null, 'a shop is a service; the name of a deleted town is not shown';
end $$;
commit;

\echo '== stage places: POIs of a stage'
begin;
select places_test.as_anon();
do $$
declare
  r record;
begin
  assert (select count(*) from public.list_stage_pois('5e0a0000-0000-0000-0000-00000000000a')) = 2, 'two POIs on stage A';
  assert (select array_agg(x.name order by x.ordinality) from public.list_stage_pois('5e0a0000-0000-0000-0000-00000000000a') with ordinality x)
         = array['Zz Fountain', 'Zz Chapel'], 'walking order';
  select * into r from public.list_stage_pois('5e0a0000-0000-0000-0000-00000000000a') where id = '5e0b0000-0000-0000-0000-000000000001';
  assert r.category = 'chapel' and r.name = 'Zz Chapel' and r.place_name = 'Zzplaces Village', 'category, name, town';
  assert round(r.lat::numeric, 4) = 43.0092 and round(r.lng::numeric, 4) = -1.3193, 'lat and lng';
  assert r.phone = '+34 600 000 002' and r.website = 'https://chapel.example.test' and r.opening_hours = 'Mo-Su 09:00-19:00' and r.mass_times = 'Su 11:00', 'contact, hours, mass times';
  assert r.km_from_stage_start = 5.00 and r.detour_m = 0 and r.has_stamp, 'km, detour, stamp';
  assert r.source = 'osm' and r.osm_type = 'node' and r.osm_id = 6000001, 'where it came from';
  assert r.verification_level = 'unverified' and r.verification_at is null, 'unverified';
  select * into r from public.list_stage_pois('5e0a0000-0000-0000-0000-00000000000a') where id = '5e0b0000-0000-0000-0000-000000000002';
  assert r.verification_level = 'editor' and r.verification_at = '2026-08-20T00:00:00Z' and not r.has_stamp and r.detour_m = 40, 'an editor level is dated by verified_at';
end $$;
commit;

-- =============================================================================
-- 4. WHAT IT NEVER ANSWERS
-- =============================================================================
\echo '== stage places: tombstones, unpublished and deleted stages, unknown and empty stages'
begin;
select places_test.as_anon();
do $$
begin
  assert not exists (select 1 from public.list_stage_stays('5e0a0000-0000-0000-0000-00000000000a') where id = '5e0d0000-0000-0000-0000-000000000004'), 'a deleted stay is not listed';
  assert not exists (select 1 from public.list_stage_stays('5e0a0000-0000-0000-0000-00000000000a') where id = '5e0d0000-0000-0000-0000-000000000005'), 'a deleted link is not listed';
  assert not exists (select 1 from public.list_stage_pois('5e0a0000-0000-0000-0000-00000000000a') where id = '5e0b0000-0000-0000-0000-000000000003'), 'a deleted POI is not listed';
  assert not exists (select 1 from public.list_stage_pois('5e0a0000-0000-0000-0000-00000000000a') where id = '5e0b0000-0000-0000-0000-000000000004'), 'a deleted POI link is not listed';
  -- the tombstones are still on the tables (offline copies need them): the lists skip them, nothing deleted them
  assert (select count(*) from public.stays where id = '5e0d0000-0000-0000-0000-000000000004') = 1, 'the tombstone is still readable on the table';

  assert (select count(*) from public.list_stage_stays('5e0a0000-0000-0000-0000-00000000000b')) = 0, 'a stage that is not published has no stays';
  assert (select count(*) from public.list_stage_pois('5e0a0000-0000-0000-0000-00000000000b')) = 0, 'a stage that is not published has no POIs';
  assert (select count(*) from public.list_stage_stays('5e0a0000-0000-0000-0000-00000000000c')) = 0, 'a deleted stage has no stays';
  assert (select count(*) from public.list_stage_pois('5e0a0000-0000-0000-0000-00000000000c')) = 0, 'a deleted stage has no POIs';
  assert (select count(*) from public.list_stage_stays('5e0a0000-0000-0000-0000-00000000000d')) = 0, 'a published stage with no places answers an empty list';
  assert (select count(*) from public.list_stage_pois('5e0a0000-0000-0000-0000-00000000000d')) = 0, 'same for POIs';
  assert (select count(*) from public.list_stage_stays('5e0a0000-0000-0000-0000-0000000000ff')) = 0, 'an unknown stage answers an empty list';
  assert (select count(*) from public.list_stage_pois('5e0a0000-0000-0000-0000-0000000000ff')) = 0, 'same for POIs';
  assert (select count(*) from public.list_stage_stays(null)) = 0, 'NULL answers an empty list';
  assert (select count(*) from public.list_stage_pois(null)) = 0, 'NULL answers an empty list';
end $$;
commit;

-- a stage that gets unpublished or deleted stops answering at once, and answers again when it is back
\echo '== stage places: unpublishing and deleting a stage'
begin;
select places_test.as_postgres();
update public.stages set is_published = false where id = '5e0a0000-0000-0000-0000-00000000000a';
select places_test.as_anon();
do $$ begin
  assert (select count(*) from public.list_stage_stays('5e0a0000-0000-0000-0000-00000000000a')) = 0, 'unpublished: no stays';
  assert (select count(*) from public.list_stage_pois('5e0a0000-0000-0000-0000-00000000000a')) = 0, 'unpublished: no POIs';
end $$;
select places_test.as_postgres();
update public.stages set is_published = true, deleted_at = now() where id = '5e0a0000-0000-0000-0000-00000000000a';
select places_test.as_anon();
do $$ begin
  assert (select count(*) from public.list_stage_stays('5e0a0000-0000-0000-0000-00000000000a')) = 0, 'deleted: no stays';
  assert (select count(*) from public.list_stage_pois('5e0a0000-0000-0000-0000-00000000000a')) = 0, 'deleted: no POIs';
end $$;
rollback;

-- The server's own role bypasses row level security, so for it the functions' own conditions are all there is: a stage
-- that is not published or was deleted still answers nothing, and the tombstones are still skipped.
\echo '== stage places: the service role (no row level security) sees the same lists'
begin;
select places_test.as_service();
do $$
begin
  assert (select count(*) from public.stages where id = '5e0a0000-0000-0000-0000-00000000000b') = 1, 'fixture: the service role does read the unpublished stage itself';
  assert (select count(*) from public.list_stage_stays('5e0a0000-0000-0000-0000-00000000000a')) = 5, 'five places on stage A';
  assert (select count(*) from public.list_stage_pois('5e0a0000-0000-0000-0000-00000000000a')) = 2, 'two POIs on stage A';
  assert (select count(*) from public.list_stage_stays('5e0a0000-0000-0000-0000-00000000000b')) = 0, 'unpublished stage: no stays, with or without row level security';
  assert (select count(*) from public.list_stage_pois('5e0a0000-0000-0000-0000-00000000000b')) = 0, 'unpublished stage: no POIs, with or without row level security';
  assert (select count(*) from public.list_stage_stays('5e0a0000-0000-0000-0000-00000000000c')) = 0, 'deleted stage: no stays';
  assert (select count(*) from public.list_stage_pois('5e0a0000-0000-0000-0000-00000000000c')) = 0, 'deleted stage: no POIs';
  assert not exists (select 1 from public.list_stage_stays('5e0a0000-0000-0000-0000-00000000000a') where id in ('5e0d0000-0000-0000-0000-000000000004', '5e0d0000-0000-0000-0000-000000000005')), 'tombstones are skipped';
  assert not exists (select 1 from public.list_stage_pois('5e0a0000-0000-0000-0000-00000000000a') where id in ('5e0b0000-0000-0000-0000-000000000003', '5e0b0000-0000-0000-0000-000000000004')), 'POI tombstones are skipped';
end $$;
rollback;

-- =============================================================================
-- 5. THE CAP, AND THE SAME ANSWER FOR EVERYBODY
-- =============================================================================
\echo '== stage places: at most 500 rows, in walking order'
begin;
select places_test.as_anon();
do $$
begin
  assert (select count(*) from public.list_stage_stays('5e0a0000-0000-0000-0000-00000000000e')) = 500, '510 links answer 500 rows';
  assert (select min(km_from_stage_start) from public.list_stage_stays('5e0a0000-0000-0000-0000-00000000000e')) = 0.1, 'from the start of the stage';
  assert (select max(km_from_stage_start) from public.list_stage_stays('5e0a0000-0000-0000-0000-00000000000e')) = 50.0, 'the last ten fall off the end';
end $$;
commit;

\echo '== stage places: a signed-in person gets the same answer as anon'
begin;
select places_test.as_anon();
create temp table places_anon_stays on commit drop as select * from public.list_stage_stays('5e0a0000-0000-0000-0000-00000000000a');
create temp table places_anon_pois  on commit drop as select * from public.list_stage_pois('5e0a0000-0000-0000-0000-00000000000a');
grant select on places_anon_stays, places_anon_pois to authenticated;
select places_test.as_user();
do $$
begin
  assert (select count(*) from public.list_stage_stays('5e0a0000-0000-0000-0000-00000000000a')) = 5, 'five places for a signed-in person';
  assert not exists (select 1 from (select * from public.list_stage_stays('5e0a0000-0000-0000-0000-00000000000a') except select * from places_anon_stays) d), 'the same stays';
  assert not exists (select 1 from (select * from public.list_stage_pois('5e0a0000-0000-0000-0000-00000000000a') except select * from places_anon_pois) d), 'the same POIs';
  assert (select count(*) from public.list_stage_pois('5e0a0000-0000-0000-0000-00000000000a')) = 2, 'two POIs for a signed-in person';
end $$;
rollback;

-- =============================================================================
-- 6. THE SEED
-- =============================================================================
\echo '== stage places: the seed (Roncesvalles) answers for stage 1'
begin;
select places_test.as_anon();
do $$
declare
  r record;
begin
  select * into r from public.list_stage_stays('40000000-0000-0000-0000-000000000001') where id = '60000000-0000-0000-0000-000000000001';
  assert r.name = 'Albergue de Roncesvalles' and r.category = 'albergue_parochial' and r.source = 'editorial', 'the seed stay';
  assert round(r.lat::numeric, 4) = 43.0089 and round(r.lng::numeric, 4) = -1.3197, 'its position';
  assert r.beds = 183 and r.labels = '{pilgrims_only}' and r.has_stamp and r.km_from_stage_start = 24.2, 'beds, labels, stamp, km';
  select * into r from public.list_stage_pois('40000000-0000-0000-0000-000000000001') where id = '50000000-0000-0000-0000-000000000001';
  assert r.name = 'Royal Collegiate Church of Roncesvalles' and r.category = 'church' and r.has_stamp and r.km_from_stage_start = 24.0, 'the seed POI';
end $$;
commit;

-- =============================================================================
-- CLEAN UP
-- =============================================================================
delete from public.stages where id::text like '5e0a%';   -- the links go with their stage
delete from public.stays  where id::text like '5e0d%';
delete from public.pois   where id::text like '5e0b%';
delete from public.places where id::text like '5e0c%';
do $$
begin
  assert (select count(*) from public.stages where id::text like '5e0a%') = 0, 'stages removed';
  assert (select count(*) from public.stage_stays where stage_id::text like '5e0a%' or stay_id::text like '5e0d%') = 0, 'stay links removed';
  assert (select count(*) from public.stage_pois where stage_id::text like '5e0a%' or poi_id::text like '5e0b%') = 0, 'POI links removed';
  assert (select count(*) from public.stays where id::text like '5e0d%') = 0, 'stays removed';
  assert (select count(*) from public.pois where id::text like '5e0b%') = 0, 'POIs removed';
  assert (select count(*) from public.places where id::text like '5e0c%') = 0, 'places removed';
end $$;
drop schema places_test cascade;
