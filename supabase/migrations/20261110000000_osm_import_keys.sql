-- =============================================================================
-- CaminoPlus 21: a full unique key on (osm_type, osm_id) for pois and stays
--
-- tools/poi-audit/import_osm.py --apply upserts through PostgREST with
-- on_conflict=osm_type,osm_id. PostgREST turns that into
--   INSERT ... ON CONFLICT (osm_type, osm_id) DO UPDATE SET ...
-- and Postgres can only find the arbiter for that clause in a UNIQUE constraint, or a unique index, on
-- exactly those two columns, with no WHERE and no expression. A partial index such as
--   create unique index ... on public.stays (osm_type, osm_id) where osm_id is not null
-- is not enough: PostgREST cannot send the predicate, so every upsert would fail with
-- "there is no unique or exclusion constraint matching the ON CONFLICT specification" (42P10).
--
-- Both tables already have such a key: the table-level `unique (osm_type, osm_id)` of
-- 20261104150200_routes_maps.sql (pois) and 20261104150300_stays.sql (stays). On a database built from the
-- migrations this file therefore changes nothing, and says so. It exists for a database that was built or
-- edited by hand, or restored without the constraint: it adds the key only when no valid, full, unique
-- index on exactly (osm_type, osm_id) is there, and can be run any number of times.
--
-- Rows without an OSM key (editorial, partner, user and owner rows: osm_type and osm_id both null) may
-- repeat: NULLs are distinct in a unique constraint, which is what we want. If adding the key fails with
-- "could not create unique index ... Key (osm_type, osm_id)=(node, 123) is duplicated", two rows share an
-- OSM key: merge or delete one, then run this again (the transaction rolled back, nothing was changed).
-- =============================================================================

do $$
declare
  t     text;
  found text;
begin
  foreach t in array array['pois', 'stays'] loop
    select i.indexrelid::regclass::text into found
    from pg_index i
    where i.indrelid = ('public.' || t)::regclass
      and i.indisunique and i.indisvalid
      and i.indpred is null and i.indexprs is null            -- not partial, no expression
      and i.indnkeyatts = 2 and i.indnatts = 2                -- exactly the two columns, no INCLUDE
      and (i.indkey[0], i.indkey[1]) in (
            ((select attnum from pg_attribute where attrelid = i.indrelid and attname = 'osm_type'),
             (select attnum from pg_attribute where attrelid = i.indrelid and attname = 'osm_id')),
            ((select attnum from pg_attribute where attrelid = i.indrelid and attname = 'osm_id'),
             (select attnum from pg_attribute where attrelid = i.indrelid and attname = 'osm_type')))
    limit 1;

    if found is not null then
      raise notice 'public.%: (osm_type, osm_id) is already a full unique key (%), nothing to do', t, found;
    else
      execute format('alter table public.%I add constraint %I unique (osm_type, osm_id)', t, t || '_osm_key_unique');
      raise notice 'public.%: added the full unique key % on (osm_type, osm_id)', t, t || '_osm_key_unique';
    end if;
  end loop;
end $$;
