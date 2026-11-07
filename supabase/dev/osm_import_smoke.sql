-- OSM import smoke test: the database side of tools/poi-audit/import_osm.py --apply
-- (migration 20261110000000_osm_import_keys.sql, and the rows the importer writes).
-- Self-contained, and every section is one transaction that is rolled back: no section depends on another and the
-- database is left as it was. The rows are the importer's real output for places of the stage 1 fixture
-- (tools/poi-audit/tests/regen_smoke_fixture.py writes the block below; tests/test_smoke_fixture.py checks it),
-- sent the way PostgREST sends an upsert: json_populate_recordset + ON CONFLICT (osm_type, osm_id) DO UPDATE.
--
--   1. the migration changes nothing on a database that has the key, and can be run again
--   2. a database without the key, or with only a partial one, is repaired; only then does ON CONFLICT work
--   3. rows without an OSM key may repeat, the same key twice is refused
--   4. the importer's rows go in: location as EWKT text, every category it can emit, numbers, tags, generated kind
--   5. running again refreshes the OSM columns and leaves the trust columns alone
--   6. the link rows, and the stage that is not there
--   7. what the database refuses, and who may write
-- The \ir paths are relative to this file, so run it with psql -f (validate.sh does).
\set ON_ERROR_STOP 1

-- ---------------------------------------------------------------- the importer's rows
-- BEGIN importer output (tools/poi-audit/tests/regen_smoke_fixture.py writes this block, tests/test_smoke_fixture.py checks it)
create temp table osm_fixture (name text primary key, doc jsonb not null);
insert into osm_fixture (name, doc) values
  ('stays', $json$[
{"source":"osm","osm_type":"node","osm_id":535186428,"category":"hotel","name":"Hotel Roncesvalles","route_id":"20000000-0000-0000-0000-000000000001","address":"Calle Nuestra Señora de Roncesvalles 14, 31650 Roncesvalles","country_code":null,"location":"SRID=4326;POINT(-1.3199122 43.0099837)","phone":"+34 948760105","email":"info@hotelroncesvalles.com","whatsapp":null,"website":"http://www.hotelroncesvalles.com","beds":32,"opening_hours":null,"data_confidence":null,"verification_level":"unverified"},
{"source":"osm","osm_type":"node","osm_id":2408296585,"category":"albergue_municipal","name":"Refuge Municipal Accueil Pelerin","route_id":"20000000-0000-0000-0000-000000000001","address":"64220 Saint-Jean-Pied-de-Port","country_code":"FR","location":"SRID=4326;POINT(-1.2347022 43.1636988)","phone":"+33 5 5937 0509","email":"caminopa@hotmail.com","whatsapp":null,"website":"http://www.aucoeurduchemin.org","beds":32,"opening_hours":null,"data_confidence":null,"verification_level":"unverified"},
{"source":"osm","osm_type":"node","osm_id":2417775370,"category":"albergue_private","name":"Gîte Le Chemin Vers L'Etoile","route_id":"20000000-0000-0000-0000-000000000001","address":"21A Rue d'Espagne, 64220 Saint-Jean-Pied-de-Port","country_code":"FR","location":"SRID=4326;POINT(-1.2375419 43.1616476)","phone":"+33 6 70 20 82 13","email":"eric.viotte@gmail.com","whatsapp":"+33 6 70 20 82 13","website":"http://www.pelerinage-saint-jacques-compostelle.com/en/gite","beds":20,"opening_hours":null,"data_confidence":null,"verification_level":"unverified"},
{"source":"osm","osm_type":"node","osm_id":3337547778,"category":"hostel","name":"Refuge Orisson","route_id":"20000000-0000-0000-0000-000000000001","address":"BP 12, 64220 Uhart-Cize","country_code":null,"location":"SRID=4326;POINT(-1.2392608 43.1087778)","phone":"+33 6 38 26 97 38","email":"refuge.orisson@wanadoo.fr","whatsapp":null,"website":"https://www.refuge-orisson.com","beds":28,"opening_hours":"Mar-Oct","data_confidence":null,"verification_level":"unverified"},
{"source":"osm","osm_type":"node","osm_id":3351832510,"category":"restaurant","name":"Café Ttipia","route_id":"20000000-0000-0000-0000-000000000001","address":"2 Place Floquet, 64220 Saint-Jean-Pied-de-Port","country_code":null,"location":"SRID=4326;POINT(-1.2386387 43.1622966)","phone":"+33 5 59 37 11 96","email":null,"whatsapp":null,"website":"https://www.cafettipia.com/","beds":null,"opening_hours":"Mo-Su 11:30-23:00; Tu 11:30-16:00; We off","data_confidence":null,"verification_level":"unverified"},
{"source":"osm","osm_type":"node","osm_id":3352713679,"category":"guesthouse","name":"Maison Donamaria","route_id":"20000000-0000-0000-0000-000000000001","address":"1 Chemin d'Olhonce, 64220 Saint-Jean-Pied-de-Port","country_code":"FR","location":"SRID=4326;POINT(-1.2351131 43.1588173)","phone":"+33559370232","email":"info@donamaria.fr","whatsapp":null,"website":"http://www.donamaria.fr/","beds":null,"opening_hours":null,"data_confidence":null,"verification_level":"unverified"},
{"source":"osm","osm_type":"node","osm_id":3360162062,"category":"cafe","name":"Ferme Thurburia","route_id":"20000000-0000-0000-0000-000000000001","address":null,"country_code":null,"location":"SRID=4326;POINT(-1.2448026 43.1243834)","phone":null,"email":null,"whatsapp":null,"website":null,"beds":null,"opening_hours":null,"data_confidence":null,"verification_level":"unverified"},
{"source":"osm","osm_type":"node","osm_id":4947441453,"category":"bakery","name":"Ogitegia","route_id":"20000000-0000-0000-0000-000000000001","address":null,"country_code":null,"location":"SRID=4326;POINT(-1.238148 43.1608768)","phone":null,"email":null,"whatsapp":null,"website":null,"beds":null,"opening_hours":"Mo, We-Su 06:00-13:30; Mo, We-Su 16:00-19:30","data_confidence":null,"verification_level":"unverified"},
{"source":"osm","osm_type":"node","osm_id":5051858157,"category":"bar","name":"Bar du Trinquet","route_id":"20000000-0000-0000-0000-000000000001","address":"7 Place du Trinquet, 64220 Saint-Jean-Pied-de-Port","country_code":null,"location":"SRID=4326;POINT(-1.236687 43.1640407)","phone":"+33 5 59 37 09 34","email":null,"whatsapp":null,"website":null,"beds":null,"opening_hours":null,"data_confidence":null,"verification_level":"unverified"},
{"source":"osm","osm_type":"way","osm_id":42798231,"category":"hotel","name":"Orreagako ostatua","route_id":"20000000-0000-0000-0000-000000000001","address":"Orreagako Gure Anderea karrika 2, 31650 Orreaga / Roncesvalles","country_code":null,"location":"SRID=4326;POINT(-1.3194434 43.0084442)","phone":"+34 948760225","email":"laposada@roncesvalles.es","whatsapp":null,"website":"https://laposada.roncesvalles.es","beds":null,"opening_hours":null,"data_confidence":null,"verification_level":"unverified"},
{"source":"osm","osm_type":"way","osm_id":64593408,"category":"casa_rural","name":"Gite Zazpiak-Bat","route_id":"20000000-0000-0000-0000-000000000001","address":null,"country_code":null,"location":"SRID=4326;POINT(-1.2380708 43.1549407)","phone":"+33 6 75 78 36 23","email":null,"whatsapp":null,"website":"http://www.gite-zazpiak-bat.com","beds":null,"opening_hours":null,"data_confidence":null,"verification_level":"unverified"},
{"source":"osm","osm_type":"way","osm_id":117421067,"category":"camping","name":"Camping Municipal Plaza Berri","route_id":"20000000-0000-0000-0000-000000000001","address":"Avenue du Fronton, 64220 Saint-Jean-Pied-de-Port","country_code":"FR","location":"SRID=4326;POINT(-1.2359745 43.1610951)","phone":"+33 5 59 37 11 19","email":"mairie.saintjeanpieddeport@wanadoo.fr","whatsapp":null,"website":null,"beds":null,"opening_hours":"Apr-Oct","data_confidence":null,"verification_level":"unverified"}
]$json$),
  ('pois', $json$[
{"source":"osm","osm_type":"node","osm_id":454408165,"category":"cross","name":"Croix Thibault","location":"SRID=4326;POINT(-1.2673155 43.0583534)","phone":null,"website":"https://resa.tourisme64.com/activites/uhart-cize/PCUAQU064FS000NB-orisson-la-croix-thibault/","opening_hours":null,"wikidata_id":null,"data_confidence":null,"verification_level":"unverified","tags":{}},
{"source":"osm","osm_type":"node","osm_id":478842038,"category":"viewpoint","name":"Viewpoint","location":"SRID=4326;POINT(-1.252034 43.0812123)","phone":null,"website":null,"opening_hours":null,"wikidata_id":null,"data_confidence":null,"verification_level":"unverified","tags":{"name_default":true}},
{"source":"osm","osm_type":"node","osm_id":535186152,"category":"water","name":"Drinking water","location":"SRID=4326;POINT(-1.3193049 43.0080064)","phone":null,"website":null,"opening_hours":null,"wikidata_id":null,"data_confidence":null,"verification_level":"unverified","tags":{"name_default":true}},
{"source":"osm","osm_type":"node","osm_id":535186424,"category":"toilet","name":"Toilets","location":"SRID=4326;POINT(-1.3196999 43.0095645)","phone":null,"website":null,"opening_hours":null,"wikidata_id":null,"data_confidence":null,"verification_level":"unverified","tags":{"name_default":true}},
{"source":"osm","osm_type":"node","osm_id":837930034,"category":"monument","name":"Monument","location":"SRID=4326;POINT(-1.2338282 43.1656354)","phone":null,"website":null,"opening_hours":null,"wikidata_id":null,"data_confidence":null,"verification_level":"unverified","tags":{"name_default":true}},
{"source":"osm","osm_type":"node","osm_id":959122041,"category":"museum","name":"Orreagako museoa","location":"SRID=4326;POINT(-1.3202146 43.0095668)","phone":null,"website":null,"opening_hours":null,"wikidata_id":"Q61069985","data_confidence":null,"verification_level":"unverified","tags":{}},
{"source":"osm","osm_type":"node","osm_id":1627397126,"category":"fountain","name":"Errolanen iturria","location":"SRID=4326;POINT(-1.2646888 43.046881)","phone":null,"website":"https://compostelle2007.pagesperso-orange.fr/pages/sjpp_puente/maxi/fontaine.html","opening_hours":null,"wikidata_id":null,"data_confidence":null,"verification_level":"unverified","tags":{}},
{"source":"osm","osm_type":"node","osm_id":1678352436,"category":"atm","name":"Banque Populaire","location":"SRID=4326;POINT(-1.2334483 43.165839)","phone":"+33 5 59 49 21 90","website":"https://agences.banquepopulaire.fr/banque-assurance/agence-st-jean-pied-de-port-id1090700059","opening_hours":"Tu-We 09:00-12:30,13:45-18:00; Th 09:00-12:30,14:45-18:00; Fr 09:00-12:30,13:45-18:00; Sa 09:00-12:30","wikidata_id":null,"data_confidence":null,"verification_level":"unverified","tags":{}},
{"source":"osm","osm_type":"node","osm_id":2417739884,"category":"tourist_info","name":"Accueil aux Pèlerins (Amis du Chemin de Saint-Jacques)","location":"SRID=4326;POINT(-1.2358289 43.1634508)","phone":"+33 5 59 37 05 09","website":"https://www.aucoeurduchemin.org/","opening_hours":null,"wikidata_id":null,"data_confidence":null,"verification_level":"unverified","tags":{}},
{"source":"osm","osm_type":"node","osm_id":3398124325,"category":"pharmacy","name":"Arreguy Olaizola","location":"SRID=4326;POINT(-1.2371828 43.1637191)","phone":null,"website":null,"opening_hours":null,"wikidata_id":null,"data_confidence":null,"verification_level":"unverified","tags":{}},
{"source":"osm","osm_type":"node","osm_id":7232636987,"category":"supermarket","name":"Eztika","location":"SRID=4326;POINT(-1.2389551 43.1611456)","phone":null,"website":null,"opening_hours":"Mo 09:00-13:00; Tu-Sa 09:00-13:00, 15:00-19:00","wikidata_id":null,"data_confidence":null,"verification_level":"unverified","tags":{}},
{"source":"osm","osm_type":"way","osm_id":42798241,"category":"tourist_info","name":"Turismo bulegoa","location":"SRID=4326;POINT(-1.3207023 43.0096004)","phone":null,"website":null,"opening_hours":null,"wikidata_id":null,"data_confidence":null,"verification_level":"unverified","tags":{}},
{"source":"osm","osm_type":"way","osm_id":42798242,"category":"church","name":"Orreagako Andre Mariaren eliza","location":"SRID=4326;POINT(-1.3194942 43.0099518)","phone":null,"website":null,"opening_hours":null,"wikidata_id":"Q2984058","data_confidence":null,"verification_level":"unverified","tags":{}},
{"source":"osm","osm_type":"way","osm_id":64592980,"category":"post_office","name":"Saint-Jean-Pied-de-Port","location":"SRID=4326;POINT(-1.2379707 43.1652341)","phone":null,"website":null,"opening_hours":"Mo-Fr 09:00-12:00,13:30-16:30; Sa 09:00-12:00; PH off; 2024 May 20 off","wikidata_id":null,"data_confidence":null,"verification_level":"unverified","tags":{}},
{"source":"osm","osm_type":"way","osm_id":64593539,"category":"chapel","name":"Chapel","location":"SRID=4326;POINT(-1.2399084 43.1595099)","phone":null,"website":null,"opening_hours":null,"wikidata_id":null,"data_confidence":null,"verification_level":"unverified","tags":{"name_default":true}},
{"source":"osm","osm_type":"way","osm_id":358219784,"category":"monastery","name":"Orreagako Santa Maria Errege Kolegiata","location":"SRID=4326;POINT(-1.3198424 43.0095276)","phone":null,"website":null,"opening_hours":null,"wikidata_id":"Q2984058","data_confidence":null,"verification_level":"unverified","tags":{}}
]$json$),
  ('stage_stays', $json$[
{"stage_id":"40000000-0000-0000-0000-000000000001","osm_type":"node","osm_id":2408296585,"km_from_stage_start":0.0,"detour_m":255},
{"stage_id":"40000000-0000-0000-0000-000000000001","osm_type":"node","osm_id":5051858157,"km_from_stage_start":0.0,"detour_m":194},
{"stage_id":"40000000-0000-0000-0000-000000000001","osm_type":"node","osm_id":3351832510,"km_from_stage_start":0.05,"detour_m":105},
{"stage_id":"40000000-0000-0000-0000-000000000001","osm_type":"node","osm_id":2417775370,"km_from_stage_start":0.08,"detour_m":6},
{"stage_id":"40000000-0000-0000-0000-000000000001","osm_type":"way","osm_id":117421067,"km_from_stage_start":0.09,"detour_m":147},
{"stage_id":"40000000-0000-0000-0000-000000000001","osm_type":"node","osm_id":4947441453,"km_from_stage_start":0.18,"detour_m":5},
{"stage_id":"40000000-0000-0000-0000-000000000001","osm_type":"node","osm_id":3352713679,"km_from_stage_start":0.39,"detour_m":302},
{"stage_id":"40000000-0000-0000-0000-000000000001","osm_type":"way","osm_id":64593408,"km_from_stage_start":0.77,"detour_m":222},
{"stage_id":"40000000-0000-0000-0000-000000000001","osm_type":"node","osm_id":3360162062,"km_from_stage_start":5.05,"detour_m":11},
{"stage_id":"40000000-0000-0000-0000-000000000001","osm_type":"node","osm_id":3337547778,"km_from_stage_start":7.4,"detour_m":10},
{"stage_id":"40000000-0000-0000-0000-000000000001","osm_type":"way","osm_id":42798231,"km_from_stage_start":24.05,"detour_m":45},
{"stage_id":"40000000-0000-0000-0000-000000000001","osm_type":"node","osm_id":535186428,"km_from_stage_start":24.12,"detour_m":89}
]$json$),
  ('stage_pois', $json$[
{"stage_id":"40000000-0000-0000-0000-000000000001","osm_type":"node","osm_id":837930034,"km_from_stage_start":0.0,"detour_m":459},
{"stage_id":"40000000-0000-0000-0000-000000000001","osm_type":"node","osm_id":1678352436,"km_from_stage_start":0.0,"detour_m":496},
{"stage_id":"40000000-0000-0000-0000-000000000001","osm_type":"node","osm_id":2417739884,"km_from_stage_start":0.0,"detour_m":168},
{"stage_id":"40000000-0000-0000-0000-000000000001","osm_type":"node","osm_id":3398124325,"km_from_stage_start":0.0,"detour_m":153},
{"stage_id":"40000000-0000-0000-0000-000000000001","osm_type":"way","osm_id":64592980,"km_from_stage_start":0.0,"detour_m":327},
{"stage_id":"40000000-0000-0000-0000-000000000001","osm_type":"node","osm_id":7232636987,"km_from_stage_start":0.18,"detour_m":77},
{"stage_id":"40000000-0000-0000-0000-000000000001","osm_type":"way","osm_id":64593539,"km_from_stage_start":0.35,"detour_m":83},
{"stage_id":"40000000-0000-0000-0000-000000000001","osm_type":"node","osm_id":478842038,"km_from_stage_start":11.18,"detour_m":11},
{"stage_id":"40000000-0000-0000-0000-000000000001","osm_type":"node","osm_id":454408165,"km_from_stage_start":14.81,"detour_m":4},
{"stage_id":"40000000-0000-0000-0000-000000000001","osm_type":"node","osm_id":1627397126,"km_from_stage_start":16.27,"detour_m":6},
{"stage_id":"40000000-0000-0000-0000-000000000001","osm_type":"node","osm_id":535186152,"km_from_stage_start":24.05,"detour_m":92},
{"stage_id":"40000000-0000-0000-0000-000000000001","osm_type":"way","osm_id":42798241,"km_from_stage_start":24.11,"detour_m":124},
{"stage_id":"40000000-0000-0000-0000-000000000001","osm_type":"node","osm_id":535186424,"km_from_stage_start":24.12,"detour_m":45},
{"stage_id":"40000000-0000-0000-0000-000000000001","osm_type":"node","osm_id":959122041,"km_from_stage_start":24.12,"detour_m":85},
{"stage_id":"40000000-0000-0000-0000-000000000001","osm_type":"way","osm_id":42798242,"km_from_stage_start":24.12,"detour_m":68},
{"stage_id":"40000000-0000-0000-0000-000000000001","osm_type":"way","osm_id":358219784,"km_from_stage_start":24.12,"detour_m":54}
]$json$),
  ('categories', $json${"stays": ["albergue_municipal", "albergue_parochial", "albergue_private", "apartment", "bakery", "bar", "cafe", "camping", "casa_rural", "guesthouse", "hostel", "hotel", "pension", "restaurant"], "pois": ["atm", "bike_shop", "bridge", "cathedral", "chapel", "church", "cross", "fountain", "hospital", "milestone", "monastery", "monument", "museum", "pharmacy", "post_office", "supermarket", "toilet", "tourist_info", "viewpoint", "water"]}$json$),
  ('insert_only', $json${"stays": ["source", "route_id", "data_confidence", "verification_level"], "pois": ["source", "data_confidence", "verification_level"]}$json$);
-- END importer output
grant select on osm_fixture to service_role;

-- ---------------------------------------------------------------- helpers (temporary: gone with the session)
-- Is there a valid, full unique index on exactly (osm_type, osm_id)? A different formulation from the migration's.
create function pg_temp.has_full_osm_key(t text) returns boolean language sql as $$
  select exists (
    select 1
    from pg_index i
    where i.indrelid = ('public.' || t)::regclass
      and i.indisunique and i.indisvalid and i.indpred is null and i.indexprs is null
      and i.indnkeyatts = 2 and i.indnatts = 2
      and (select array_agg(a.attname::text order by a.attname::text) from pg_attribute a
           where a.attrelid = i.indrelid and a.attnum in (i.indkey[0], i.indkey[1])) = array['osm_id', 'osm_type']);
$$;

-- The statement PostgREST builds for POST /<table>?on_conflict=osm_type,osm_id&columns=<keys of the payload>
-- with Prefer: resolution=merge-duplicates: the columns are the keys of the first object, in order.
-- p_skip leaves columns out (what the importer does for a row that exists already).
create function pg_temp.upsert(p_table text, p_doc json, p_skip text[] default '{}') returns integer language plpgsql as $$
declare
  cols text;
  sets text;
  n    integer;
begin
  select string_agg(quote_ident(k), ', ' order by o), string_agg(quote_ident(k) || ' = excluded.' || quote_ident(k), ', ' order by o)
    into cols, sets
  from json_object_keys(p_doc -> 0) with ordinality as t(k, o)
  where k <> all (p_skip);
  execute format('insert into public.%I (%s) select %s from json_populate_recordset(null::public.%I, $1) _ '
                 'on conflict (osm_type, osm_id) do update set %s', p_table, cols, cols, p_table, sets) using p_doc;
  get diagnostics n = row_count;
  return n;
end $$;

-- the statement must fail with this SQLSTATE
create function pg_temp.fails(p_sql text, p_state text) returns void language plpgsql as $$
declare
  ok boolean := false;
begin
  begin
    execute p_sql;
    ok := true;
  exception when others then
    if sqlstate <> p_state then
      raise exception 'expected SQLSTATE %, got % (%)', p_state, sqlstate, sqlerrm;
    end if;
  end;
  assert not ok, 'the statement was accepted: ' || p_sql;
end $$;

-- new functions are not executable by PUBLIC in this database (platform hardening), and the helpers run as other roles
grant execute on function pg_temp.upsert(text, json, text[]) to public;
grant execute on function pg_temp.fails(text, text) to public;

-- =============================================================================
\echo '== 1. the migration changes nothing on a database that has the key, and can be run again'
-- =============================================================================
begin;
create temp table keys_before as
  select conrelid::regclass::text as tbl, conname, pg_get_constraintdef(oid) as def
  from pg_constraint where contype = 'u' and conrelid in ('public.pois'::regclass, 'public.stays'::regclass);
\ir ../migrations/20261110000000_osm_import_keys.sql
\ir ../migrations/20261110000000_osm_import_keys.sql
do $$
begin
  assert (select count(*) from keys_before where def = 'UNIQUE (osm_type, osm_id)') = 2,
         'pois and stays each have a table-level unique (osm_type, osm_id) from the first migrations';
  assert pg_temp.has_full_osm_key('pois') and pg_temp.has_full_osm_key('stays'), 'both tables have the full key';
  assert not exists (select conrelid::regclass::text, conname, pg_get_constraintdef(oid)
                     from pg_constraint where contype = 'u' and conrelid in ('public.pois'::regclass, 'public.stays'::regclass)
                     except select tbl, conname, def from keys_before), 'the migration added no constraint';
  assert (select count(*) from pg_constraint where contype = 'u' and conrelid in ('public.pois'::regclass, 'public.stays'::regclass))
         = (select count(*) from keys_before), 'and removed none';
end $$;
rollback;

-- =============================================================================
\echo '== 2. a database without the key, or with only a partial one, is repaired'
-- =============================================================================
begin;
-- hand-built databases: pois with a partial unique index only, stays with nothing
alter table public.pois  drop constraint pois_osm_type_osm_id_key;
alter table public.stays drop constraint stays_osm_type_osm_id_key;
create unique index osm_smoke_partial on public.pois (osm_type, osm_id) where osm_id is not null;
do $$
begin
  assert not pg_temp.has_full_osm_key('pois') and not pg_temp.has_full_osm_key('stays'), 'the full keys are gone';
  -- what PostgREST's upsert gets without the key: 42P10, the reason this migration exists
  perform pg_temp.fails($q$insert into public.pois (osm_type, osm_id, category, name, location)
                            values ('node', 9000001, 'water', 'x', 'SRID=4326;POINT(0 0)')
                            on conflict (osm_type, osm_id) do update set name = excluded.name$q$, '42P10');
  perform pg_temp.fails($q$insert into public.stays (osm_type, osm_id, category, name, location)
                            values ('node', 9000001, 'hotel', 'x', 'SRID=4326;POINT(0 0)')
                            on conflict (osm_type, osm_id) do update set name = excluded.name$q$, '42P10');
end $$;
\ir ../migrations/20261110000000_osm_import_keys.sql
create temp table keys_after_first as
  select conrelid::regclass::text as tbl, conname from pg_constraint
  where contype = 'u' and conrelid in ('public.pois'::regclass, 'public.stays'::regclass);
\ir ../migrations/20261110000000_osm_import_keys.sql
do $$
begin
  assert pg_temp.has_full_osm_key('pois') and pg_temp.has_full_osm_key('stays'), 'the migration added both keys (a partial one is not enough)';
  assert exists (select 1 from pg_constraint where conname = 'pois_osm_key_unique' and contype = 'u'), 'pois got its key';
  assert exists (select 1 from pg_constraint where conname = 'stays_osm_key_unique' and contype = 'u'), 'stays got its key';
  assert (select count(*) from pg_constraint where contype = 'u' and conrelid in ('public.pois'::regclass, 'public.stays'::regclass))
         = (select count(*) from keys_after_first), 'the second run added nothing';
  -- and the upsert works, twice, on one row
  for i in 1..2 loop
    insert into public.pois (osm_type, osm_id, category, name, location)
    values ('node', 9000001, 'water', 'run ' || i, 'SRID=4326;POINT(0 0)')
    on conflict (osm_type, osm_id) do update set name = excluded.name;
    insert into public.stays (osm_type, osm_id, category, name, location)
    values ('node', 9000001, 'hotel', 'run ' || i, 'SRID=4326;POINT(0 0)')
    on conflict (osm_type, osm_id) do update set name = excluded.name;
  end loop;
  assert (select count(*) from public.pois where osm_id = 9000001) = 1 and (select name from public.pois where osm_id = 9000001) = 'run 2', 'one pois row, updated';
  assert (select count(*) from public.stays where osm_id = 9000001) = 1 and (select name from public.stays where osm_id = 9000001) = 'run 2', 'one stays row, updated';
end $$;
rollback;
do $$
begin
  assert pg_temp.has_full_osm_key('pois') and pg_temp.has_full_osm_key('stays'), 'rolled back: the original keys are back';
  assert not exists (select 1 from pg_class where relname = 'osm_smoke_partial'), 'rolled back: the partial index is gone';
end $$;

-- =============================================================================
\echo '== 3. rows without an OSM key may repeat, the same key twice is refused'
-- =============================================================================
begin;
do $$
begin
  insert into public.pois (source, category, name, location) values
    ('editorial', 'church', 'osm-smoke A', 'SRID=4326;POINT(0 0)'), ('editorial', 'church', 'osm-smoke B', 'SRID=4326;POINT(0 0)');
  insert into public.stays (source, category, name, location) values
    ('owner', 'hotel', 'osm-smoke A', 'SRID=4326;POINT(0 0)'), ('owner', 'hotel', 'osm-smoke B', 'SRID=4326;POINT(0 0)');
  assert (select count(*) from public.pois where name like 'osm-smoke %' and osm_id is null) = 2, 'two pois rows without a key';
  assert (select count(*) from public.stays where name like 'osm-smoke %' and osm_id is null) = 2, 'two stays rows without a key';

  insert into public.pois (osm_type, osm_id, category, name, location) values ('node', 9000002, 'water', 'one', 'SRID=4326;POINT(0 0)');
  insert into public.stays (osm_type, osm_id, category, name, location) values ('node', 9000002, 'hotel', 'one', 'SRID=4326;POINT(0 0)');
  perform pg_temp.fails($q$insert into public.pois (osm_type, osm_id, category, name, location)
                            values ('node', 9000002, 'water', 'two', 'SRID=4326;POINT(0 0)')$q$, '23505');
  perform pg_temp.fails($q$insert into public.stays (osm_type, osm_id, category, name, location)
                            values ('node', 9000002, 'hotel', 'two', 'SRID=4326;POINT(0 0)')$q$, '23505');
  -- the same number with another type is another place (a node and a way can share an id)
  insert into public.pois (osm_type, osm_id, category, name, location) values ('way', 9000002, 'water', 'a way', 'SRID=4326;POINT(0 0)');
  insert into public.stays (osm_type, osm_id, category, name, location) values ('way', 9000002, 'hotel', 'a way', 'SRID=4326;POINT(0 0)');
end $$;
rollback;

-- =============================================================================
\echo '== 4. the importer''s rows go in, the way PostgREST sends them'
-- =============================================================================
begin;
set local role service_role;      -- the role behind the service key: bypasses row level security
do $$
declare
  d_stays json := (select doc::json from osm_fixture where name = 'stays');
  d_pois json := (select doc::json from osm_fixture where name = 'pois');
  cats  jsonb := (select doc from osm_fixture where name = 'categories');
  c text;
  n bigint := 9100000;
begin
  assert json_array_length(d_stays) >= 10 and json_array_length(d_pois) >= 10, 'the fixture holds a good sample of both';
  assert pg_temp.upsert('stays', d_stays) = json_array_length(d_stays), 'every stays row went in';
  assert pg_temp.upsert('pois', d_pois) = json_array_length(d_pois), 'every pois row went in';

  -- every column of every row is what the file says (location is checked below, it is stored as a geography)
  assert not exists (
    select 1 from jsonb_array_elements((select doc from osm_fixture where name = 'stays')) f(r)
    left join public.stays s on s.osm_type = f.r ->> 'osm_type' and s.osm_id = (f.r ->> 'osm_id')::bigint
    where s.id is null or not (to_jsonb(s) @> (f.r - 'location'))), 'stays rows hold what the importer wrote';
  assert not exists (
    select 1 from jsonb_array_elements((select doc from osm_fixture where name = 'pois')) f(r)
    left join public.pois p on p.osm_type = f.r ->> 'osm_type' and p.osm_id = (f.r ->> 'osm_id')::bigint
    where p.id is null or not (to_jsonb(p) @> (f.r - 'location'))), 'pois rows hold what the importer wrote';

  -- 'SRID=4326;POINT(lon lat)' text was accepted by the geography columns, longitude first
  assert not exists (
    select 1 from jsonb_array_elements((select doc from osm_fixture where name = 'stays')) f(r)
    join public.stays s on s.osm_type = f.r ->> 'osm_type' and s.osm_id = (f.r ->> 'osm_id')::bigint
    cross join lateral regexp_match(f.r ->> 'location', '^SRID=4326;POINT\((\S+) (\S+)\)$') m
    where extensions.st_srid(s.location::extensions.geometry) <> 4326
       or abs(extensions.st_x(s.location::extensions.geometry) - m[1]::float8) > 1e-9
       or abs(extensions.st_y(s.location::extensions.geometry) - m[2]::float8) > 1e-9), 'stays.location: EWKT is read as lon lat in SRID 4326';
  assert not exists (
    select 1 from jsonb_array_elements((select doc from osm_fixture where name = 'pois')) f(r)
    join public.pois p on p.osm_type = f.r ->> 'osm_type' and p.osm_id = (f.r ->> 'osm_id')::bigint
    cross join lateral regexp_match(f.r ->> 'location', '^SRID=4326;POINT\((\S+) (\S+)\)$') m
    where extensions.st_srid(p.location::extensions.geometry) <> 4326
       or abs(extensions.st_x(p.location::extensions.geometry) - m[1]::float8) > 1e-9
       or abs(extensions.st_y(p.location::extensions.geometry) - m[2]::float8) > 1e-9), 'pois.location: EWKT is read as lon lat in SRID 4326';
  assert (select count(*) from public.stays where extensions.st_dwithin(location, 'SRID=4326;POINT(-1.32 43.01)'::extensions.geography, 200000)) >= 1,
         'a stored location answers distance queries';
  -- the fixture is stage 1, in the Pyrenees: a place with its latitude and longitude swapped would be far from it
  assert not exists (select 1 from public.stays s join jsonb_array_elements((select doc from osm_fixture where name = 'stays')) f(r)
                     on s.osm_id = (f.r ->> 'osm_id')::bigint
                     where not extensions.st_dwithin(s.location, 'SRID=4326;POINT(-1.28 43.09)'::extensions.geography, 30000)), 'stays are where stage 1 is';
  assert not exists (select 1 from public.pois p join jsonb_array_elements((select doc from osm_fixture where name = 'pois')) f(r)
                     on p.osm_id = (f.r ->> 'osm_id')::bigint
                     where not extensions.st_dwithin(p.location, 'SRID=4326;POINT(-1.28 43.09)'::extensions.geography, 30000)), 'pois are where stage 1 is';

  -- a new row is an unverified OSM row, not deleted, and stays.kind (generated) says stay or food, never service
  assert not exists (select 1 from public.stays s join jsonb_array_elements((select doc from osm_fixture where name = 'stays')) f(r)
                     on s.osm_id = (f.r ->> 'osm_id')::bigint
                     where s.source <> 'osm' or s.verification_level <> 'unverified' or s.deleted_at is not null
                        or s.kind <> case when s.category in ('cafe', 'bar', 'restaurant', 'bakery') then 'food' else 'stay' end), 'new stays rows';

  -- every category the importer can emit is accepted by the live CHECK constraints
  foreach c in array (select array_agg(x) from jsonb_array_elements_text(cats -> 'stays') x) loop
    n := n + 1;
    insert into public.stays (source, osm_type, osm_id, category, name, location) values ('osm', 'node', n, c, 'category ' || c, 'SRID=4326;POINT(-1.5 43)');
  end loop;
  assert (select count(*) from public.stays where osm_id between 9100001 and 9100999) = jsonb_array_length(cats -> 'stays'), 'every stays category was accepted';
  assert not exists (select 1 from public.stays where osm_id between 9100001 and 9100999 and kind = 'service'), 'none of them is a service kind';
  n := 9200000;
  foreach c in array (select array_agg(x) from jsonb_array_elements_text(cats -> 'pois') x) loop
    n := n + 1;
    insert into public.pois (source, osm_type, osm_id, category, name, location) values ('osm', 'node', n, c, 'category ' || c, 'SRID=4326;POINT(-1.5 43)');
  end loop;
  assert (select count(*) from public.pois where osm_id between 9200001 and 9200999) = jsonb_array_length(cats -> 'pois'), 'every pois category was accepted';

  -- sending the same rows again is an update, not a duplicate, and an id never changes
  assert pg_temp.upsert('stays', d_stays) = json_array_length(d_stays) and pg_temp.upsert('pois', d_pois) = json_array_length(d_pois), 'the second run';
  assert (select count(*) from public.stays where osm_id in (select (r ->> 'osm_id')::bigint from json_array_elements(d_stays) r)) = json_array_length(d_stays), 'no stays row twice';
end $$;
rollback;

-- =============================================================================
\echo '== 5. running again refreshes the OSM columns and leaves the trust columns alone'
-- =============================================================================
begin;
set local role service_role;
do $$
declare
  d_stays json := (select doc::json from osm_fixture where name = 'stays');
  d_pois json := (select doc::json from osm_fixture where name = 'pois');
  skip_stays text[] := (select array_agg(x) from jsonb_array_elements_text((select doc from osm_fixture where name = 'insert_only') -> 'stays') x);
  skip_pois  text[] := (select array_agg(x) from jsonb_array_elements_text((select doc from osm_fixture where name = 'insert_only') -> 'pois') x);
  k1 bigint := ((d_stays -> 0) ->> 'osm_id')::bigint;
  k2 bigint := ((d_stays -> 1) ->> 'osm_id')::bigint;
  p1 bigint := ((d_pois -> 0) ->> 'osm_id')::bigint;
  route uuid := ((d_stays -> 0) ->> 'route_id')::uuid;
begin
  assert skip_stays @> array['source', 'verification_level', 'data_confidence', 'route_id'] and skip_pois @> array['source', 'verification_level', 'data_confidence'],
         'the importer treats the trust columns as written only when a row is created';
  perform pg_temp.upsert('stays', d_stays);
  perform pg_temp.upsert('pois', d_pois);

  -- life happens: an editor verifies one stay; the audit scores another and it is attached to no route; and the OSM
  -- data has changed since the first import (a name, a phone that is gone, a website).
  update public.stays set verification_level = 'editor', data_confidence = 93, verified_at = now() where osm_id = k1;
  update public.stays set verification_level = 'data_check', data_confidence = 88, route_id = null, name = 'old osm name', phone = '+34 000 000 000' where osm_id = k2;
  update public.pois set verification_level = 'data_check', data_confidence = 71, name = 'old osm name', website = 'https://old.example' where osm_id = p1;

  -- the second run, as the importer sends a row that exists: without the insert-only columns
  assert pg_temp.upsert('stays', d_stays, skip_stays) = json_array_length(d_stays), 'the refresh of stays';
  assert pg_temp.upsert('pois', d_pois, skip_pois) = json_array_length(d_pois), 'the refresh of pois';

  assert (select verification_level = 'editor' and data_confidence = 93 from public.stays where osm_id = k1), 'an editor''s level and score survive';
  assert (select verification_level = 'data_check' and data_confidence = 88 and route_id is null from public.stays where osm_id = k2),
         'trust columns and route_id are not touched by a refresh';
  assert (select name from public.stays where osm_id = k2) = (select r ->> 'name' from json_array_elements(d_stays) r where (r ->> 'osm_id')::bigint = k2), 'the OSM columns are refreshed';
  assert (select phone from public.stays where osm_id = k2) is not distinct from (select r ->> 'phone' from json_array_elements(d_stays) r where (r ->> 'osm_id')::bigint = k2),
         'a phone that is no longer in OSM is no longer in the row (null overwrites)';
  assert (select verification_level = 'data_check' and data_confidence = 71 from public.pois where osm_id = p1), 'same for pois';
  assert (select website from public.pois where osm_id = p1) is not distinct from (select r ->> 'website' from json_array_elements(d_pois) r where (r ->> 'osm_id')::bigint = p1), 'pois: the website is refreshed';

  -- a payload that does send the trust columns would lower them: that is why they are left out
  perform pg_temp.upsert('stays', d_stays);
  assert (select verification_level from public.stays where osm_id = k1) = 'unverified', 'sending verification_level on an existing row would have lowered it';
  assert (select count(*) from pg_trigger where tgrelid = 'public.stays'::regclass and tgname = 'stays_touch' and tgenabled <> 'D') = 1,
         'every update goes through the touch trigger: updated_at moves for the apps'' sync';
end $$;
rollback;

-- =============================================================================
\echo '== 6. the link rows, and the stage that is not there'
-- =============================================================================
begin;
set local role service_role;
do $$
declare
  d_stays json := (select doc::json from osm_fixture where name = 'stays');
  d_pois json := (select doc::json from osm_fixture where name = 'pois');
  d_ss json := (select doc::json from osm_fixture where name = 'stage_stays');
  d_sp json := (select doc::json from osm_fixture where name = 'stage_pois');
  n     integer;
begin
  perform pg_temp.upsert('stays', d_stays);
  perform pg_temp.upsert('pois', d_pois);
  -- the importer resolves the OSM key to the id the database made, then upserts on (stage_id, stay_id)
  for i in 1..2 loop
    insert into public.stage_stays (stage_id, stay_id, km_from_stage_start, detour_m)
    select l.stage_id, s.id, l.km_from_stage_start, l.detour_m
    from json_to_recordset(d_ss) as l(stage_id uuid, osm_type text, osm_id bigint, km_from_stage_start numeric, detour_m integer)
    join public.stays s on s.osm_type = l.osm_type and s.osm_id = l.osm_id
    on conflict (stage_id, stay_id) do update set km_from_stage_start = excluded.km_from_stage_start, detour_m = excluded.detour_m;
    get diagnostics n = row_count;
    assert n = json_array_length(d_ss), 'every stage_stays row went in, run ' || i;
    insert into public.stage_pois (stage_id, poi_id, km_from_stage_start, detour_m)
    select l.stage_id, p.id, l.km_from_stage_start, l.detour_m
    from json_to_recordset(d_sp) as l(stage_id uuid, osm_type text, osm_id bigint, km_from_stage_start numeric, detour_m integer)
    join public.pois p on p.osm_type = l.osm_type and p.osm_id = l.osm_id
    on conflict (stage_id, poi_id) do update set km_from_stage_start = excluded.km_from_stage_start, detour_m = excluded.detour_m;
    get diagnostics n = row_count;
    assert n = json_array_length(d_sp), 'every stage_pois row went in, run ' || i;
  end loop;
  assert (select count(*) from public.stage_stays ss2 join public.stays s on s.id = ss2.stay_id
          where s.source = 'osm' and s.osm_id in (select (r ->> 'osm_id')::bigint from json_array_elements(d_stays) r)) = json_array_length(d_ss), 'no link twice';
  -- numeric(6,2) and integer hold what the importer computed
  assert not exists (select 1 from json_to_recordset(d_ss) as l(stage_id uuid, osm_type text, osm_id bigint, km_from_stage_start numeric, detour_m integer)
                     join public.stays s on s.osm_type = l.osm_type and s.osm_id = l.osm_id
                     join public.stage_stays x on x.stage_id = l.stage_id and x.stay_id = s.id
                     where x.km_from_stage_start <> l.km_from_stage_start or x.detour_m <> l.detour_m), 'km and detour are stored as computed';

  -- a stage that is not in the database: the database refuses the link, which is why the importer checks first
  perform pg_temp.fails($q$insert into public.stage_stays (stage_id, stay_id, km_from_stage_start, detour_m)
                            select '40000000-0000-0000-0000-0000000000ee', id, 1.5, 10 from public.stays where osm_type = 'node' and source = 'osm' limit 1$q$, '23503');
end $$;
rollback;

-- =============================================================================
\echo '== 7. what the database refuses, and who may write'
-- =============================================================================
begin;
do $$
begin
  -- the things the importer's own checks (and the test mock) refuse first
  perform pg_temp.fails($q$insert into public.stays (osm_type, osm_id, category, name, location) values ('node', 9300001, 'spaceship', 'x', 'SRID=4326;POINT(0 0)')$q$, '23514');
  perform pg_temp.fails($q$insert into public.pois (osm_type, osm_id, category, name, location) values ('node', 9300001, 'spaceship', 'x', 'SRID=4326;POINT(0 0)')$q$, '23514');
  perform pg_temp.fails($q$insert into public.stays (osm_type, osm_id, category, name, location, kind) values ('node', 9300002, 'hotel', 'x', 'SRID=4326;POINT(0 0)', 'stay')$q$, '428C9');
  perform pg_temp.fails($q$insert into public.stays (osm_type, osm_id, category, name, location) values ('node', 9300003, 'hotel', null, 'SRID=4326;POINT(0 0)')$q$, '23502');
  perform pg_temp.fails($q$insert into public.pois (osm_type, osm_id, category, name, location) values ('node', 9300003, 'water', null, 'SRID=4326;POINT(0 0)')$q$, '23502');
  perform pg_temp.fails($q$insert into public.pois (osm_type, osm_id, category, name, location) values ('area', 9300004, 'water', 'x', 'SRID=4326;POINT(0 0)')$q$, '23514');
  perform pg_temp.fails($q$insert into public.stays (osm_type, osm_id, category, name, location, data_confidence) values ('node', 9300005, 'hotel', 'x', 'SRID=4326;POINT(0 0)', 101)$q$, '23514');
  perform pg_temp.fails($q$insert into public.stays (osm_type, osm_id, category, name, location, verification_level) values ('node', 9300006, 'hotel', 'x', 'SRID=4326;POINT(0 0)', 'verified')$q$, '23514');
  perform pg_temp.fails($q$insert into public.stays (osm_type, osm_id, category, name, location, route_id) values ('node', 9300007, 'hotel', 'x', 'SRID=4326;POINT(0 0)', '20000000-0000-0000-0000-0000000000ee')$q$, '23503');
  perform pg_temp.fails($q$insert into public.stays (osm_type, osm_id, category, name, location) values ('node', 9300008, 'hotel', 'x', 'not a point')$q$, 'XX000');
  perform pg_temp.fails($q$insert into public.stays (osm_type, osm_id, category, name, location, country_code) values ('node', 9300009, 'hotel', 'x', 'SRID=4326;POINT(0 0)', 'FRA')$q$, '22001');
end $$;
-- the importer needs the service role; a signed-in pilgrim or a visitor cannot write the catalog
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "1d000000-0000-0000-0000-0000000000a1", "role": "authenticated"}', true);
do $$
begin
  perform pg_temp.fails($q$insert into public.stays (osm_type, osm_id, category, name, location) values ('node', 9300010, 'hotel', 'x', 'SRID=4326;POINT(0 0)')$q$, '42501');
  perform pg_temp.fails($q$insert into public.pois (osm_type, osm_id, category, name, location) values ('node', 9300010, 'water', 'x', 'SRID=4326;POINT(0 0)')$q$, '42501');
  perform pg_temp.fails($q$insert into public.stage_stays (stage_id, stay_id) values ('40000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001')$q$, '42501');
end $$;
reset role;
set local role anon;
do $$
begin
  perform pg_temp.fails($q$insert into public.pois (osm_type, osm_id, category, name, location) values ('node', 9300011, 'water', 'x', 'SRID=4326;POINT(0 0)')$q$, '42501');
end $$;
reset role;
set local role service_role;
do $$
begin
  insert into public.pois (osm_type, osm_id, category, name, location) values ('node', 9300012, 'water', 'x', 'SRID=4326;POINT(0 0)');
  insert into public.stays (osm_type, osm_id, category, name, location) values ('node', 9300012, 'hotel', 'x', 'SRID=4326;POINT(0 0)');
end $$;
rollback;

\echo 'osm_import_smoke: all assertions passed'
