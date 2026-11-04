-- =============================================================================
-- CaminoPlus 04: stays and cafes (Stays tab)
-- Seeded from OpenStreetMap first; other sources (TripAdvisor, OTA APIs,
-- partners) are added later and tracked in `source` / `external_ids`.
-- Booking is mixed and labeled per stay with `booking_method`.
-- =============================================================================

create table public.stays (
  id               uuid primary key default gen_random_uuid(),
  source           text not null default 'osm' check (source in ('osm', 'tripadvisor', 'ota', 'partner', 'editorial', 'user')),
  osm_type         text check (osm_type in ('node', 'way', 'relation')),
  osm_id           bigint,
  external_ids     jsonb not null default '{}',   -- {"tripadvisor": "...", "booking": "..."}
  category         text not null check (category in (
                     'albergue_municipal', 'albergue_parochial', 'albergue_private',
                     'hostel', 'hotel', 'pension', 'guesthouse', 'casa_rural',
                     'apartment', 'camping',
                     'cafe', 'bar', 'restaurant', 'bakery')),
  kind             text generated always as (
                     case when category in ('cafe', 'bar', 'restaurant', 'bakery') then 'food' else 'stay' end
                   ) stored,
  name             text not null,
  description      text,
  place_id         uuid references public.places (id),
  route_id         uuid references public.routes (id),  -- nearest route, for quick filtering
  address          text,
  country_code     char(2),
  location         extensions.geography(Point, 4326) not null,
  phone            text,
  email            text,
  whatsapp         text,
  website          text,
  -- booking
  booking_method   text not null default 'walk_in' check (booking_method in (
                     'walk_in', 'email', 'whatsapp', 'phone', 'website', 'ota', 'in_app')),
  booking_url      text,
  ota_provider     text,
  -- capacity, hours, labels
  beds             integer,
  opening_hours    text,          -- OSM opening_hours syntax
  open_months      smallint[],    -- 1..12, null = all year
  amenities        text[] not null default '{}',   -- wifi, kitchen, laundry, lockers, ...
  labels           text[] not null default '{}',   -- see stay_labels
  is_partner       boolean not null default false,
  has_stamp        boolean not null default false,
  stamp_image_url  text,
  cover_url        text,
  -- prices (denormalised from stay_prices for filtering)
  price_from       numeric(8, 2),
  price_to         numeric(8, 2),
  currency         char(3) not null default 'EUR',
  price_updated_at timestamptz,
  -- server maintained aggregates
  rating_avg       numeric(3, 2),
  review_count     integer not null default 0,
  favorite_count   integer not null default 0,
  verified_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  unique (osm_type, osm_id)
);
create index stays_location_idx on public.stays using gist (location);
create index stays_category_idx on public.stays (category);
create index stays_labels_idx on public.stays using gin (labels);
create index stays_amenities_idx on public.stays using gin (amenities);
create index stays_name_trgm on public.stays using gin (name extensions.gin_trgm_ops);
create index stays_updated_idx on public.stays (updated_at);

-- Display info for labels used in stays.labels (donativo, pilgrims_only,
-- pet_friendly, bike_friendly, partner, ...).
create table public.stay_labels (
  slug        text primary key,
  name        text not null,
  description text,
  icon        text,
  color       text,
  sort_order  integer not null default 0,
  updated_at  timestamptz not null default now()
);

create table public.stage_stays (
  stage_id            uuid not null references public.stages (id) on delete cascade,
  stay_id             uuid not null references public.stays (id) on delete cascade,
  km_from_stage_start numeric(6, 2),
  detour_m            integer not null default 0,
  updated_at          timestamptz not null default now(),
  primary key (stage_id, stay_id)
);
create index stage_stays_stay_idx on public.stage_stays (stay_id);

-- Price points (official or reported by pilgrims).
create table public.stay_prices (
  id          uuid primary key default gen_random_uuid(),
  stay_id     uuid not null references public.stays (id) on delete cascade,
  item        text not null check (item in (
                'dorm_bed', 'private_room', 'single', 'double', 'menu_peregrino', 'breakfast', 'coffee', 'other')),
  amount      numeric(8, 2) not null check (amount >= 0),
  currency    char(3) not null default 'EUR',
  observed_on date not null default current_date,
  source      text not null default 'user' check (source in ('osm', 'owner', 'ota', 'editorial', 'user')),
  reported_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index stay_prices_stay_idx on public.stay_prices (stay_id, observed_on desc);

create table public.stay_photos (
  id           uuid primary key default gen_random_uuid(),
  stay_id      uuid not null references public.stays (id) on delete cascade,
  user_id      uuid default auth.uid() references public.profiles (id) on delete set null,
  source       text not null default 'user' check (source in ('osm', 'owner', 'partner', 'editorial', 'user')),
  url          text,               -- external/CDN image
  storage_path text,               -- or a file in the user-media bucket
  attribution  text,
  width        integer,
  height       integer,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  check (url is not null or storage_path is not null)
);
create index stay_photos_stay_idx on public.stay_photos (stay_id);

-- One review per user per stay (re-reviewing updates the row).
create table public.stay_reviews (
  id                uuid primary key default gen_random_uuid(),
  stay_id           uuid not null references public.stays (id) on delete cascade,
  user_id           uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  rating            smallint not null check (rating between 1 and 5),
  cleanliness       smallint check (cleanliness between 1 and 5),
  comfort           smallint check (comfort between 1 and 5),
  value             smallint check (value between 1 and 5),
  hospitality       smallint check (hospitality between 1 and 5),
  body              text check (char_length(body) <= 2000),
  stayed_on         date,
  journey_id        uuid,           -- FK added in migration 05
  client_created_at timestamptz,
  moderation_status text not null default 'ok' check (moderation_status in ('ok', 'pending', 'hidden', 'removed')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  unique (stay_id, user_id)
);
create index stay_reviews_user_idx on public.stay_reviews (user_id, updated_at);

-- Favourites and bookmarks for stays and POIs (Stays filter + Maps).
-- Tip for offline clients: derive `id` as UUID v5 of (user, list, target) so
-- two devices favouriting the same stay offline produce the same row.
create table public.favorites (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  list       text not null default 'favorites' check (list in ('favorites', 'bookmarks')),
  stay_id    uuid references public.stays (id) on delete cascade,
  poi_id     uuid references public.pois (id) on delete cascade,
  note       text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (num_nonnulls(stay_id, poi_id) = 1),
  unique (user_id, list, stay_id),
  unique (user_id, list, poi_id)
);
create index favorites_user_idx on public.favorites (user_id, updated_at);
create index favorites_stay_idx on public.favorites (stay_id) where stay_id is not null;

create trigger stays_touch        before update on public.stays        for each row execute function private.touch_row();
create trigger stay_prices_touch  before update on public.stay_prices  for each row execute function private.touch_row();
create trigger stay_photos_touch  before update on public.stay_photos  for each row execute function private.touch_row();
create trigger stay_reviews_touch before update on public.stay_reviews for each row execute function private.touch_row();
create trigger favorites_touch    before update on public.favorites    for each row execute function private.touch_row();

-- -----------------------------------------------------------------------------
-- Aggregates
-- -----------------------------------------------------------------------------
create or replace function private.refresh_stay_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sid uuid := coalesce(new.stay_id, old.stay_id);
begin
  update public.stays s set
    rating_avg   = agg.avg_rating,
    review_count = agg.n
  from (
    select round(avg(rating)::numeric, 2) as avg_rating, count(*)::int as n
    from public.stay_reviews
    where stay_id = sid and deleted_at is null and moderation_status = 'ok'
  ) agg
  where s.id = sid;
  return null;
end;
$$;
create trigger stay_reviews_rating after insert or update or delete on public.stay_reviews
  for each row execute function private.refresh_stay_rating();

create or replace function private.refresh_stay_prices()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sid uuid := coalesce(new.stay_id, old.stay_id);
begin
  update public.stays s set
    price_from = agg.lo,
    price_to = agg.hi,
    price_updated_at = agg.last_seen
  from (
    select min(amount) as lo, max(amount) as hi, max(observed_on)::timestamptz as last_seen
    from public.stay_prices
    where stay_id = sid and deleted_at is null
      and item <> 'other'
      and observed_on > current_date - 540
  ) agg
  where s.id = sid;
  return null;
end;
$$;
create trigger stay_prices_refresh after insert or update or delete on public.stay_prices
  for each row execute function private.refresh_stay_prices();

create or replace function private.refresh_favorite_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sid uuid := coalesce(new.stay_id, old.stay_id);
begin
  if sid is not null then
    update public.stays set favorite_count = (
      select count(*) from public.favorites where stay_id = sid and deleted_at is null and list = 'favorites'
    ) where id = sid;
  end if;
  return null;
end;
$$;
create trigger favorites_count after insert or update or delete on public.favorites
  for each row execute function private.refresh_favorite_count();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.stays        enable row level security;
alter table public.stay_labels  enable row level security;
alter table public.stage_stays  enable row level security;
alter table public.stay_prices  enable row level security;
alter table public.stay_photos  enable row level security;
alter table public.stay_reviews enable row level security;
alter table public.favorites    enable row level security;

revoke insert, update, delete on public.stays, public.stay_labels, public.stage_stays from anon, authenticated;
create policy "stays are public"       on public.stays       for select to anon, authenticated using (true);
create policy "stay labels are public" on public.stay_labels for select to anon, authenticated using (true);
create policy "stage stays are public" on public.stage_stays for select to anon, authenticated using (true);

create policy "prices are public" on public.stay_prices for select to anon, authenticated
  using (deleted_at is null or reported_by = (select auth.uid()));
create policy "report a price as yourself" on public.stay_prices for insert to authenticated
  with check (reported_by = (select auth.uid()) and source = 'user');
create policy "edit own price reports" on public.stay_prices for update to authenticated
  using (reported_by = (select auth.uid()))
  with check (reported_by = (select auth.uid()) and source = 'user');

create policy "stay photos are public" on public.stay_photos for select to anon, authenticated
  using (deleted_at is null or user_id = (select auth.uid()));
create policy "add own stay photos" on public.stay_photos for insert to authenticated
  with check (user_id = (select auth.uid()) and source = 'user');
create policy "edit own stay photos" on public.stay_photos for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and source = 'user');

create policy "reviews are public" on public.stay_reviews for select to anon, authenticated
  using (user_id = (select auth.uid()) or (deleted_at is null and moderation_status = 'ok'));
create policy "write own review" on public.stay_reviews for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "edit own review" on public.stay_reviews for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create trigger stay_reviews_guard before insert or update on public.stay_reviews
  for each row execute function private.guard_columns('{"moderation_status": "ok"}');

create policy "favorites owner only" on public.favorites for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- no hard deletes from clients on user content (soft delete via deleted_at)
revoke delete on public.stay_prices, public.stay_photos, public.stay_reviews, public.favorites from anon, authenticated;
