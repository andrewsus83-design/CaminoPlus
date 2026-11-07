-- =============================================================================
-- CaminoPlus: the places along a stage (Stays tab, stay page, map pins)
--
--   public.list_stage_stays(p_stage)   stays, cafes and bars along one stage, in walking order
--   public.list_stage_pois(p_stage)    churches, fountains and other points of interest along one stage
--
-- Why functions. `location` is a PostGIS geography: PostgREST returns it as hex EWKB, which the app cannot read.
-- And what the app needs is the link between a stage and a place (how many km from the start of the stage, how far
-- off the route), which lives in stage_stays / stage_pois. Each function joins the two and answers plain numbers
-- (lat, lng), so the app never selects a column it cannot use.
--
-- What they answer. What the open data gives and what is cheap to know: name, category, position, contact, opening
-- hours, address, where the place is on the stage, which source it came from (osm_type and osm_id point back to the
-- OpenStreetMap object, for the credit and for "fix it there") and how far it was checked (verification_level,
-- verification_at, data_confidence; see 20261106100000_data_audit.sql). What they do NOT answer: prices, ratings and
-- photos. They are not in OpenStreetMap, and the app must never show a made-up one. (stays.price_from is the lowest
-- of every price point including a coffee and a breakfast, so it is not a price per night either.)
--
-- Who can call them. SECURITY INVOKER: the caller's own row level security decides what is read, as for a select
-- on the tables. Nothing needed fixing: "stays are public", "pois are public", "stage stays are public",
-- "stage pois are public" and "places are public" already let anon and authenticated read every row, and a stage is
-- readable once it is published ("published stages are public"). Both functions go one step further and answer
-- nothing for a stage that is not published or was deleted, and skip soft-deleted places and soft-deleted links
-- (the tombstones stay readable on the tables so offline copies can delete them; these lists are for showing).
-- supabase/dev/stage_places_smoke.sql proves all of it as anon and as authenticated.
--
-- Order and size. Walking order (km_from_stage_start, places without a km last), then the shorter detour, then the
-- name; at most 500 rows (a stage has a few dozen to a few hundred places; the app shows them a page at a time).
-- An unknown stage, a stage without places and NULL all answer an empty list, never an error.
--
-- The app reads exactly the columns listed in RPC_COLUMNS in mobile/src/features/places/api.ts, and
-- supabase/dev/check_client_contract.py compares that list with what these functions return.
--
-- Re-runnable: create or replace, the grants are idempotent. Apply BEFORE the app version that calls them is released.
-- =============================================================================

create or replace function public.list_stage_stays(p_stage uuid)
returns table (
  id                  uuid,
  name                text,
  category            text,
  kind                text,               -- stay | food | service (generated from category)
  place_name          text,               -- the town, when the stay is linked to one
  lat                 double precision,
  lng                 double precision,
  phone               text,
  email               text,
  website             text,
  opening_hours       text,               -- OpenStreetMap opening_hours syntax, shown as it is
  address             text,
  description         text,
  km_from_stage_start numeric,            -- null = the link does not say
  detour_m            integer,            -- 0 also when the importer did not measure it
  beds                integer,
  amenities           text[],
  labels              text[],             -- slugs of stay_labels
  has_stamp           boolean,
  data_confidence     smallint,
  verification_level  text,               -- owner | pilgrim | editor | data_check | unverified
  verification_at     timestamptz,        -- when the level was reached (null for unverified)
  source              text,               -- osm | editorial | partner | owner | user | tripadvisor | ota
  osm_type            text,
  osm_id              bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.id,
         s.name,
         s.category,
         s.kind,
         case when pl.deleted_at is null then pl.name end,
         extensions.st_y(s.location::extensions.geometry),
         extensions.st_x(s.location::extensions.geometry),
         s.phone,
         s.email,
         s.website,
         s.opening_hours,
         s.address,
         s.description,
         ss.km_from_stage_start,
         ss.detour_m,
         s.beds,
         s.amenities,
         s.labels,
         s.has_stamp,
         s.data_confidence,
         s.verification_level,
         case when s.verification_level in ('owner', 'pilgrim', 'editor') then s.verified_at
              when s.verification_level = 'data_check' then s.data_checked_at
         end,
         s.source,
         s.osm_type,
         s.osm_id
  from public.stage_stays ss
  join public.stages st on st.id = ss.stage_id and st.is_published and st.deleted_at is null
  join public.stays s on s.id = ss.stay_id and s.deleted_at is null
  left join public.places pl on pl.id = s.place_id
  where ss.stage_id = p_stage
    and ss.deleted_at is null
  order by ss.km_from_stage_start nulls last, ss.detour_m, s.name, s.id
  limit 500;
$$;

create or replace function public.list_stage_pois(p_stage uuid)
returns table (
  id                  uuid,
  name                text,
  category            text,
  place_name          text,
  lat                 double precision,
  lng                 double precision,
  phone               text,
  website             text,
  opening_hours       text,               -- OpenStreetMap opening_hours syntax, shown as it is
  mass_times          text,
  km_from_stage_start numeric,
  detour_m            integer,
  has_stamp           boolean,
  data_confidence     smallint,
  verification_level  text,
  verification_at     timestamptz,
  source              text,               -- osm | editorial | partner | user
  osm_type            text,
  osm_id              bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id,
         p.name,
         p.category,
         case when pl.deleted_at is null then pl.name end,
         extensions.st_y(p.location::extensions.geometry),
         extensions.st_x(p.location::extensions.geometry),
         p.phone,
         p.website,
         p.opening_hours,
         p.mass_times,
         sp.km_from_stage_start,
         sp.detour_m,
         p.has_stamp,
         p.data_confidence,
         p.verification_level,
         case when p.verification_level in ('owner', 'pilgrim', 'editor') then p.verified_at
              when p.verification_level = 'data_check' then p.data_checked_at
         end,
         p.source,
         p.osm_type,
         p.osm_id
  from public.stage_pois sp
  join public.stages st on st.id = sp.stage_id and st.is_published and st.deleted_at is null
  join public.pois p on p.id = sp.poi_id and p.deleted_at is null
  left join public.places pl on pl.id = p.place_id
  where sp.stage_id = p_stage
    and sp.deleted_at is null
  order by sp.km_from_stage_start nulls last, sp.detour_m, p.name, p.id
  limit 500;
$$;

-- Readable without signing in (like the tables behind them), by nobody else by accident.
revoke execute on function public.list_stage_stays(uuid), public.list_stage_pois(uuid) from public;
grant execute on function public.list_stage_stays(uuid), public.list_stage_pois(uuid) to anon, authenticated, service_role;
