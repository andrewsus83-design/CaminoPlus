-- =============================================================================
-- CaminoPlus 03: routes, places, POIs, audio, offline packs (Maps tab)
-- Route-agnostic: a "network" is a pilgrimage family (Camino de Santiago,
-- later Via Francigena, Shikoku, ...). A network has many routes, a route has
-- ordered places (towns) and stages. Users can start from any place.
-- All catalog tables are read-only for clients and readable without login
-- (the camino.plus website can render them). Writes go through service_role.
-- =============================================================================

create table public.route_networks (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text not null unique,
  name                 text not null,
  kind                 text not null default 'camino' check (kind in ('camino', 'pilgrimage', 'trail')),
  destination_name     text,
  destination_location extensions.geography(Point, 4326),
  description          text,
  sort_order           integer not null default 0,
  is_published         boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz
);

create table public.routes (
  id            uuid primary key default gen_random_uuid(),
  network_id    uuid not null references public.route_networks (id),
  slug          text not null unique,
  name          text not null,
  short_name    text,
  description   text,
  countries     char(2)[] not null default '{}',
  start_name    text,
  end_name      text,
  distance_km   numeric(7, 2),
  stage_count   smallint,
  difficulty    smallint check (difficulty between 1 and 5),
  color         text check (color ~ '^#[0-9A-Fa-f]{6}$'),
  cover_url     text,
  geom          extensions.geography(LineString, 4326),
  sort_order    integer not null default 0,
  is_published  boolean not null default false,
  data_version  integer not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index routes_network_idx on public.routes (network_id);
create index routes_geom_idx on public.routes using gist (geom);

-- Towns / villages / cities. Shared by routes, stays, POIs.
create table public.places (
  id            uuid primary key default gen_random_uuid(),
  osm_type      text check (osm_type in ('node', 'way', 'relation')),
  osm_id        bigint,
  name          text not null,
  kind          text not null default 'town' check (kind in ('city', 'town', 'village', 'hamlet', 'locality')),
  country_code  char(2),
  region        text,
  location      extensions.geography(Point, 4326) not null,
  description   text,
  image_url     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  unique (osm_type, osm_id)
);
create index places_location_idx on public.places using gist (location);
create index places_name_trgm on public.places using gin (name extensions.gin_trgm_ops);

-- Ordered places along a route. Lets the user start anywhere and shows
-- "km to Santiago" for every town.
create table public.route_places (
  route_id      uuid not null references public.routes (id) on delete cascade,
  place_id      uuid not null references public.places (id) on delete cascade,
  seq           integer not null,
  km_from_start numeric(7, 2) not null,
  km_to_end     numeric(7, 2) not null,
  is_stage_end  boolean not null default false,
  updated_at    timestamptz not null default now(),
  primary key (route_id, place_id)
);
create index route_places_seq_idx on public.route_places (route_id, seq);

create table public.stages (
  id                uuid primary key default gen_random_uuid(),
  route_id          uuid not null references public.routes (id) on delete cascade,
  stage_number      integer not null,
  variant_of        uuid references public.stages (id),
  name              text not null,
  start_place_id    uuid references public.places (id),
  end_place_id      uuid references public.places (id),
  distance_km       numeric(6, 2) not null,
  elevation_gain_m  integer,
  elevation_loss_m  integer,
  min_elevation_m   integer,
  max_elevation_m   integer,
  est_duration_min  integer,
  difficulty        smallint check (difficulty between 1 and 5),
  description       text,
  geom              extensions.geography(LineString, 4326),
  elevation_profile jsonb,
  is_published      boolean not null default false,
  data_version      integer not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
create unique index stages_main_number_key on public.stages (route_id, stage_number) where variant_of is null;
create index stages_geom_idx on public.stages using gist (geom);

-- Points of interest: churches, iconic places, fountains, pharmacies, ...
-- (Stays and cafes live in their own table, see migration 04.)
create table public.pois (
  id              uuid primary key default gen_random_uuid(),
  source          text not null default 'osm' check (source in ('osm', 'editorial', 'partner', 'user')),
  osm_type        text check (osm_type in ('node', 'way', 'relation')),
  osm_id          bigint,
  category        text not null check (category in (
                    'cathedral', 'church', 'chapel', 'monastery', 'cross', 'monument',
                    'museum', 'bridge', 'viewpoint', 'milestone', 'fountain', 'water',
                    'pharmacy', 'hospital', 'atm', 'supermarket', 'bike_shop',
                    'post_office', 'tourist_info', 'toilet', 'other')),
  name            text not null,
  description     text,
  story           text,
  place_id        uuid references public.places (id),
  location        extensions.geography(Point, 4326) not null,
  is_iconic       boolean not null default false,
  has_stamp       boolean not null default false,
  stamp_image_url text,
  opening_hours   text,          -- OSM opening_hours syntax
  mass_times      text,
  website         text,
  phone           text,
  image_url       text,
  tags            jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (osm_type, osm_id)
);
create index pois_location_idx on public.pois using gist (location);
create index pois_category_idx on public.pois (category);
create index pois_updated_idx on public.pois (updated_at);

create table public.stage_pois (
  stage_id            uuid not null references public.stages (id) on delete cascade,
  poi_id              uuid not null references public.pois (id) on delete cascade,
  km_from_stage_start numeric(6, 2),
  detour_m            integer not null default 0,
  updated_at          timestamptz not null default now(),
  primary key (stage_id, poi_id)
);
create index stage_pois_poi_idx on public.stage_pois (poi_id);

-- Audio guides / stories, downloaded per stage (~1.5 MB each).
create table public.audio_stories (
  id               uuid primary key default gen_random_uuid(),
  route_id         uuid references public.routes (id),
  stage_id         uuid references public.stages (id),
  poi_id           uuid references public.pois (id),
  title            text not null,
  summary          text,
  narrator         text,
  language         text not null default 'en',
  duration_s       integer,
  audio_url        text not null,
  size_bytes       bigint,
  transcript       text,
  location         extensions.geography(Point, 4326),
  trigger_radius_m integer not null default 75,
  is_premium       boolean not null default false,
  sort_order       integer not null default 0,
  is_published     boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create index audio_stories_stage_idx on public.audio_stories (stage_id);
create index audio_stories_location_idx on public.audio_stories using gist (location);

-- Downloadable offline packs (map tiles, catalog data, audio) per route/stage.
-- Files live on Cloudflare R2/CDN; this table is the manifest.
create table public.offline_packs (
  id              uuid primary key default gen_random_uuid(),
  route_id        uuid not null references public.routes (id) on delete cascade,
  stage_id        uuid references public.stages (id) on delete cascade,
  kind            text not null check (kind in ('tiles', 'data', 'audio', 'bundle')),
  format          text not null check (format in ('pmtiles', 'mbtiles', 'sqlite', 'json', 'zip')),
  version         integer not null,
  url             text not null,
  size_bytes      bigint not null,
  sha256          text,
  min_app_version text,
  is_current      boolean not null default true,
  published_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create unique index offline_packs_version_key
  on public.offline_packs (route_id, coalesce(stage_id, '00000000-0000-0000-0000-000000000000'::uuid), kind, version);

-- touch triggers
create trigger route_networks_touch before update on public.route_networks for each row execute function private.touch_row();
create trigger routes_touch         before update on public.routes         for each row execute function private.touch_row();
create trigger places_touch         before update on public.places         for each row execute function private.touch_row();
create trigger stages_touch         before update on public.stages         for each row execute function private.touch_row();
create trigger pois_touch           before update on public.pois           for each row execute function private.touch_row();
create trigger audio_stories_touch  before update on public.audio_stories  for each row execute function private.touch_row();
create trigger offline_packs_touch  before update on public.offline_packs  for each row execute function private.touch_row();

-- RLS: read-only catalog. Tombstones (deleted_at) stay readable so offline
-- copies can delete them.
do $$
declare
  t text;
begin
  foreach t in array array['route_networks', 'routes', 'places', 'route_places', 'stages',
                           'pois', 'stage_pois', 'audio_stories', 'offline_packs']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke insert, update, delete on public.%I from anon, authenticated', t);
  end loop;
end $$;

create policy "published networks are public" on public.route_networks for select to anon, authenticated using (is_published);
create policy "published routes are public"   on public.routes         for select to anon, authenticated using (is_published);
create policy "places are public"             on public.places         for select to anon, authenticated using (true);
create policy "route places are public"       on public.route_places   for select to anon, authenticated using (true);
create policy "published stages are public"   on public.stages         for select to anon, authenticated using (is_published);
create policy "pois are public"               on public.pois           for select to anon, authenticated using (true);
create policy "stage pois are public"         on public.stage_pois     for select to anon, authenticated using (true);
create policy "published audio is public"     on public.audio_stories  for select to anon, authenticated using (is_published);
create policy "offline packs are public"      on public.offline_packs  for select to anon, authenticated using (true);
