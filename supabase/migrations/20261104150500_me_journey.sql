-- =============================================================================
-- CaminoPlus 06: Me tab (plan/tracker, GPS tracks, passport & stamps, health)
-- A "journey" is one pilgrimage attempt. Its visibility also governs who can
-- see its day plan and passport stamps.
-- =============================================================================

create table public.journeys (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  route_id               uuid not null references public.routes (id),
  title                  text check (char_length(title) <= 120),
  start_place_id         uuid references public.places (id),
  end_place_id           uuid references public.places (id),
  start_stage_id         uuid references public.stages (id),
  mode                   text not null default 'walk' check (mode in ('walk', 'bike', 'horse', 'wheelchair')),
  status                 text not null default 'planning' check (status in ('planning', 'active', 'paused', 'completed', 'abandoned')),
  visibility             public.visibility not null default 'followers',
  planned_start_date     date,
  planned_end_date       date,
  started_at             timestamptz,
  finished_at            timestamptz,
  planned_distance_km    numeric(7, 2),
  walked_km              numeric(7, 2) not null default 0,
  credential_number      text,           -- physical credencial / pilgrim passport number
  compostela_received_at timestamptz,
  cover_url              text,
  notes                  text,
  client_created_at      timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  deleted_at             timestamptz
);
create index journeys_user_idx on public.journeys (user_id, updated_at);

alter table public.stay_reviews
  add constraint stay_reviews_journey_fk foreign key (journey_id) references public.journeys (id) on delete set null;

-- Day-by-day plan. A day can follow an official stage or be custom
-- (users often split or merge stages).
create table public.journey_days (
  id                  uuid primary key default gen_random_uuid(),
  journey_id          uuid not null references public.journeys (id) on delete cascade,
  user_id             uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  day_number          integer not null,
  planned_date        date,
  stage_id            uuid references public.stages (id),
  from_place_id       uuid references public.places (id),
  to_place_id         uuid references public.places (id),
  from_name           text,
  to_name             text,
  planned_distance_km numeric(6, 2),
  actual_distance_km  numeric(6, 2),
  stay_id             uuid references public.stays (id),
  booking_status      text not null default 'none' check (booking_status in ('none', 'requested', 'confirmed', 'cancelled')),
  status              text not null default 'planned' check (status in ('planned', 'in_progress', 'done', 'skipped', 'rest')),
  started_at          timestamptz,
  finished_at         timestamptz,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);
create index journey_days_journey_idx on public.journey_days (journey_id, day_number);
create index journey_days_user_idx on public.journey_days (user_id, updated_at);

-- Recorded GPS tracks (phone or watch). Stored simplified.
create table public.tracks (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  journey_id       uuid references public.journeys (id) on delete cascade,
  journey_day_id   uuid references public.journey_days (id) on delete set null,
  source           text not null default 'phone' check (source in ('phone', 'apple_watch', 'garmin', 'import')),
  started_at       timestamptz not null,
  ended_at         timestamptz,
  distance_m       integer,
  duration_s       integer,
  moving_time_s    integer,
  elevation_gain_m integer,
  point_count      integer,
  geom             extensions.geography(LineString, 4326),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create index tracks_user_idx on public.tracks (user_id, updated_at);
create index tracks_journey_idx on public.tracks (journey_id);

-- Digital passport stamps (sellos). Collected at a stay, a church/POI or any
-- place. `verified` is set by the server when the GPS fix is near the place.
create table public.user_stamps (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  journey_id        uuid references public.journeys (id) on delete set null,
  journey_day_id    uuid references public.journey_days (id) on delete set null,
  stay_id           uuid references public.stays (id) on delete set null,
  poi_id            uuid references public.pois (id) on delete set null,
  place_name        text,
  location          extensions.geography(Point, 4326),
  stamped_at        timestamptz not null,      -- device time
  method            text not null default 'gps_checkin' check (method in ('gps_checkin', 'photo', 'qr', 'manual')),
  photo_path        text,                      -- photo of the physical stamp (user-media bucket)
  note              text check (char_length(note) <= 500),
  verified          boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
create index user_stamps_user_idx on public.user_stamps (user_id, updated_at);
create index user_stamps_journey_idx on public.user_stamps (journey_id);

-- -----------------------------------------------------------------------------
-- Smartwatch / health. Apple Health (on device, HealthKit), Garmin (server
-- side Garmin Health API) and Android Health Connect. Only the metrics the
-- device provides are filled; everything else stays null.
-- Health data is special-category personal data (GDPR): owner-only access.
-- -----------------------------------------------------------------------------
create table public.wearable_connections (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  provider         text not null check (provider in ('apple_health', 'garmin', 'health_connect')),
  status           text not null default 'connected' check (status in ('connected', 'revoked', 'error')),
  external_user_id text,
  scopes           text[] not null default '{}',
  connected_at     timestamptz not null default now(),
  last_synced_at   timestamptz,
  last_error       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, provider)
);

-- OAuth tokens (Garmin) are kept server-side only, as Supabase Vault secrets.
create table private.wearable_credentials (
  connection_id    uuid primary key references public.wearable_connections (id) on delete cascade,
  vault_secret_id  uuid not null,
  expires_at       timestamptz,
  updated_at       timestamptz not null default now()
);

create table public.health_daily (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  day                date not null,
  source             text not null check (source in ('apple_health', 'garmin', 'health_connect', 'phone')),
  journey_day_id     uuid references public.journey_days (id) on delete set null,
  steps              integer,
  distance_m         integer,
  floors             integer,
  active_energy_kcal integer,
  resting_hr         smallint,
  avg_hr             smallint,
  max_hr             smallint,
  hrv_ms             smallint,
  vo2max             numeric(4, 1),
  sleep_minutes      integer,
  stress_avg         smallint,        -- Garmin
  body_battery_min   smallint,        -- Garmin
  body_battery_max   smallint,        -- Garmin
  spo2_avg           smallint,
  extra              jsonb not null default '{}',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (user_id, day, source)
);
create index health_daily_user_idx on public.health_daily (user_id, updated_at);

create table public.health_workouts (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  source             text not null check (source in ('apple_health', 'garmin', 'health_connect', 'phone')),
  external_id        text not null,
  journey_day_id     uuid references public.journey_days (id) on delete set null,
  activity_type      text not null default 'walking',
  started_at         timestamptz not null,
  ended_at           timestamptz,
  distance_m         integer,
  duration_s         integer,
  steps              integer,
  active_energy_kcal integer,
  avg_hr             smallint,
  max_hr             smallint,
  elevation_gain_m   integer,
  extra              jsonb not null default '{}',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (user_id, source, external_id)
);
create index health_workouts_user_idx on public.health_workouts (user_id, updated_at);

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------
create trigger journeys_touch     before update on public.journeys     for each row execute function private.touch_row();
create trigger journey_days_touch before update on public.journey_days for each row execute function private.touch_row();
create trigger tracks_touch       before update on public.tracks       for each row execute function private.touch_row();
create trigger user_stamps_touch  before update on public.user_stamps  for each row execute function private.touch_row();
create trigger wearables_touch    before update on public.wearable_connections for each row execute function private.touch_row();
create trigger health_daily_touch before update on public.health_daily for each row execute function private.touch_row();
create trigger health_workouts_touch before update on public.health_workouts for each row execute function private.touch_row();

-- Stamp verification, XP and passport counter.
create or replace function private.user_stamps_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target extensions.geography;
begin
  new.verified := false;
  if new.location is not null then
    if new.stay_id is not null then
      select location into target from public.stays where id = new.stay_id;
    elsif new.poi_id is not null then
      select location into target from public.pois where id = new.poi_id;
    end if;
    if target is not null then
      new.verified := extensions.st_dwithin(new.location, target, 300);
    end if;
  end if;
  return new;
end;
$$;
-- (fires before user_stamps_verify: triggers run in name order)
create trigger user_stamps_guard before insert or update on public.user_stamps
  for each row execute function private.guard_columns('{"verified": false}');
create trigger user_stamps_verify before insert or update of location, stay_id, poi_id on public.user_stamps
  for each row execute function private.user_stamps_before_write();

create or replace function private.user_stamps_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := coalesce(new.user_id, old.user_id);
  n   integer;
begin
  select count(*) into n from public.user_stamps where user_id = uid and deleted_at is null;
  update public.profiles set stamps_count = n where id = uid;
  if tg_op = 'INSERT' and new.deleted_at is null then
    perform private.award_xp(uid, case when new.verified then 10 else 2 end, 'stamp', 'user_stamp', new.id);
    if n >= 1 then perform private.grant_achievement(uid, 'first-stamp', 'user_stamp', new.id); end if;
    if n >= 25 then perform private.grant_achievement(uid, 'stamps-25', 'user_stamp', new.id); end if;
  end if;
  return null;
end;
$$;
create trigger user_stamps_after_write after insert or update or delete on public.user_stamps
  for each row execute function private.user_stamps_after_write();

-- Day completion gives XP; finished journeys update km walked.
create or replace function private.journey_days_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'done' and new.deleted_at is null then
    perform private.award_xp(new.user_id, 50, 'day_done', 'journey_day', new.id);
  end if;
  update public.journeys j set walked_km = coalesce((
    select sum(coalesce(actual_distance_km, planned_distance_km))
    from public.journey_days d
    where d.journey_id = new.journey_id and d.status = 'done' and d.deleted_at is null), 0)
  where j.id = new.journey_id;
  update public.profiles p set km_walked = coalesce((
    select sum(walked_km) from public.journeys j where j.user_id = new.user_id and j.deleted_at is null), 0)
  where p.id = new.user_id;
  return null;
end;
$$;
create trigger journey_days_after_write after insert or update on public.journey_days
  for each row execute function private.journey_days_after_write();

create or replace function private.journeys_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed' and new.deleted_at is null
     and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    perform private.award_xp(new.user_id, 500, 'journey_done', 'journey', new.id);
    perform private.grant_achievement(new.user_id, 'first-camino', 'journey', new.id);
  end if;
  return null;
end;
$$;
create trigger journeys_after_write after insert or update of status on public.journeys
  for each row execute function private.journeys_after_write();

create trigger journeys_guard before insert or update on public.journeys
  for each row execute function private.guard_columns('{"walked_km": 0}');

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.journeys             enable row level security;
alter table public.journey_days         enable row level security;
alter table public.tracks               enable row level security;
alter table public.user_stamps          enable row level security;
alter table public.wearable_connections enable row level security;
alter table public.health_daily         enable row level security;
alter table public.health_workouts      enable row level security;

create or replace function private.can_see_journey(p_journey uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.journeys j
    where j.id = p_journey
      and (j.user_id = auth.uid() or (j.deleted_at is null and private.can_see(j.user_id, j.visibility)))
  );
$$;
grant execute on function private.can_see_journey(uuid) to authenticated, service_role;

create policy "journeys by visibility" on public.journeys for select to authenticated
  using (user_id = (select auth.uid()) or (deleted_at is null and private.can_see(user_id, visibility)));
create policy "create own journeys" on public.journeys for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "edit own journeys" on public.journeys for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "plan follows journey visibility" on public.journey_days for select to authenticated
  using (user_id = (select auth.uid()) or (deleted_at is null and private.can_see_journey(journey_id)));
create policy "plan own days" on public.journey_days for insert to authenticated
  with check (user_id = (select auth.uid())
              and exists (select 1 from public.journeys j where j.id = journey_id and j.user_id = (select auth.uid())));
create policy "edit own days" on public.journey_days for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
              and exists (select 1 from public.journeys j where j.id = journey_id and j.user_id = (select auth.uid())));

create policy "tracks follow journey visibility" on public.tracks for select to authenticated
  using (user_id = (select auth.uid()) or (deleted_at is null and journey_id is not null and private.can_see_journey(journey_id)));
create policy "record own tracks" on public.tracks for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "edit own tracks" on public.tracks for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "passport follows journey visibility" on public.user_stamps for select to authenticated
  using (user_id = (select auth.uid()) or (deleted_at is null and journey_id is not null and private.can_see_journey(journey_id)));
create policy "collect own stamps" on public.user_stamps for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "edit own stamps" on public.user_stamps for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "wearables owner only" on public.wearable_connections for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "health daily owner only" on public.health_daily for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "workouts owner only" on public.health_workouts for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Soft delete only for synced user content; health rows may be hard deleted
-- (the user should be able to wipe health data completely).
revoke delete on public.journeys, public.journey_days, public.tracks, public.user_stamps from anon, authenticated;
revoke all on public.health_daily, public.health_workouts, public.wearable_connections from anon;
