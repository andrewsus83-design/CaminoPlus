-- =============================================================================
-- CaminoPlus 05: RPG layer and live map (Maps tab)
-- XP ledger, achievements, scavenger hunts, crowd reports with expiry.
-- XP and achievements are only granted server-side (triggers / RPCs), so the
-- client can show them optimistically offline but cannot forge them.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- XP ledger
-- -----------------------------------------------------------------------------
create table public.xp_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  amount      integer not null,
  reason      text not null,          -- 'stamp', 'hunt_step', 'hunt', 'achievement', 'stage_done', ...
  source_type text not null,
  source_id   uuid not null,
  created_at  timestamptz not null default now(),
  unique (user_id, reason, source_type, source_id)   -- idempotent awards
);
create index xp_events_user_idx on public.xp_events (user_id, created_at desc);

-- Award XP once per (reason, source). Returns true if it was new.
create or replace function private.award_xp(
  p_user uuid, p_amount integer, p_reason text, p_source_type text, p_source_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted boolean;
begin
  if p_amount is null or p_amount = 0 then
    return false;
  end if;
  insert into public.xp_events (user_id, amount, reason, source_type, source_id)
  values (p_user, p_amount, p_reason, p_source_type, p_source_id)
  on conflict do nothing;
  inserted := found;
  if inserted then
    update public.profiles set
      xp = xp + p_amount,
      level = floor(sqrt(greatest(xp + p_amount, 0) / 100.0))::int + 1
    where id = p_user;
  end if;
  return inserted;
end;
$$;

-- -----------------------------------------------------------------------------
-- Achievements
-- -----------------------------------------------------------------------------
create table public.achievements (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text,
  icon_url    text,
  category    text not null check (category in ('journey', 'stamps', 'social', 'hunt', 'explore', 'health', 'special')),
  tier        smallint not null default 1,
  xp_reward   integer not null default 0,
  route_id    uuid references public.routes (id),
  criteria    jsonb not null default '{}',   -- evaluated by server code, e.g. {"stamps": 10}
  is_secret   boolean not null default false,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table public.user_achievements (
  user_id        uuid not null references public.profiles (id) on delete cascade,
  achievement_id uuid not null references public.achievements (id) on delete cascade,
  earned_at      timestamptz not null default now(),
  source_type    text,
  source_id      uuid,
  primary key (user_id, achievement_id)
);
create index user_achievements_user_idx on public.user_achievements (user_id, earned_at desc);

create or replace function private.grant_achievement(
  p_user uuid, p_slug text, p_source_type text default null, p_source_id uuid default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.achievements;
begin
  select * into a from public.achievements where slug = p_slug and is_active and deleted_at is null;
  if not found then
    return false;
  end if;
  insert into public.user_achievements (user_id, achievement_id, source_type, source_id)
  values (p_user, a.id, p_source_type, p_source_id)
  on conflict do nothing;
  if not found then
    return false;
  end if;
  perform private.award_xp(p_user, a.xp_reward, 'achievement', 'achievement', a.id);
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- Scavenger hunts
-- -----------------------------------------------------------------------------
create table public.hunts (
  id             uuid primary key default gen_random_uuid(),
  route_id       uuid references public.routes (id),
  stage_id       uuid references public.stages (id),
  title          text not null,
  description    text,
  cover_url      text,
  xp_reward      integer not null default 0,
  achievement_id uuid references public.achievements (id),
  starts_at      timestamptz,
  ends_at        timestamptz,
  is_published   boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create index hunts_stage_idx on public.hunts (stage_id);

create table public.hunt_steps (
  id           uuid primary key default gen_random_uuid(),
  hunt_id      uuid not null references public.hunts (id) on delete cascade,
  step_number  integer not null,
  title        text not null,
  clue         text,
  poi_id       uuid references public.pois (id),
  location     extensions.geography(Point, 4326),
  radius_m     integer not null default 60,
  verification text not null default 'gps' check (verification in ('gps', 'photo', 'answer', 'qr')),
  xp_reward    integer not null default 10,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  unique (hunt_id, step_number)
);

-- Answers / QR codes are secret: private schema, never exposed to clients.
create table private.hunt_step_answers (
  step_id uuid primary key references public.hunt_steps (id) on delete cascade,
  answer  text not null     -- compared lowercased and trimmed
);

create table public.hunt_progress (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  hunt_id      uuid not null references public.hunts (id) on delete cascade,
  status       text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  started_at   timestamptz not null default now(),
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, hunt_id)
);

create table public.hunt_step_completions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  step_id      uuid not null references public.hunt_steps (id) on delete cascade,
  completed_at timestamptz not null,       -- device time (may be offline)
  location     extensions.geography(Point, 4326),
  photo_path   text,
  created_at   timestamptz not null default now(),
  unique (user_id, step_id)
);

-- -----------------------------------------------------------------------------
-- Crowd reports (Waze style). Each kind has a time to live; confirmations
-- extend it, denials hide it once they clearly outweigh confirmations.
-- -----------------------------------------------------------------------------
create table public.crowd_reports (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind              text not null check (kind in (
                      'crowd_level', 'beds_full', 'beds_available', 'closed', 'open',
                      'trail_hazard', 'water_source', 'weather', 'detour', 'other')),
  crowd_level       smallint check (crowd_level between 1 and 5),
  stay_id           uuid references public.stays (id) on delete cascade,
  poi_id            uuid references public.pois (id) on delete cascade,
  stage_id          uuid references public.stages (id),
  location          extensions.geography(Point, 4326) not null,
  note              text check (char_length(note) <= 280),
  photo_path        text,
  client_created_at timestamptz,
  expires_at        timestamptz not null,
  confirm_count     integer not null default 0,
  deny_count        integer not null default 0,
  last_confirmed_at timestamptz,
  moderation_status text not null default 'ok' check (moderation_status in ('ok', 'pending', 'hidden', 'removed')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
create index crowd_reports_location_idx on public.crowd_reports using gist (location);
create index crowd_reports_expires_idx on public.crowd_reports (expires_at);
create index crowd_reports_stay_idx on public.crowd_reports (stay_id) where stay_id is not null;
create index crowd_reports_user_idx on public.crowd_reports (user_id, updated_at);

create table public.crowd_report_votes (
  report_id  uuid not null references public.crowd_reports (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  vote       smallint not null check (vote in (-1, 1)),   -- 1 = still there, -1 = gone
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (report_id, user_id)
);

-- TTL per kind, overridable in app_config ("crowd_ttl_minutes.<kind>").
create or replace function private.crowd_report_ttl(p_kind text)
returns interval
language sql
stable
security definer
set search_path = ''
as $$
  select make_interval(mins => private.config_bigint('crowd_ttl_minutes.' || p_kind,
    case p_kind
      when 'crowd_level'    then 120
      when 'beds_full'      then 720
      when 'beds_available' then 240
      when 'weather'        then 180
      when 'trail_hazard'   then 1440
      when 'closed'         then 10080
      when 'open'           then 10080
      when 'water_source'   then 10080
      when 'detour'         then 10080
      else 360
    end)::int);
$$;

create or replace function private.crowd_reports_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  started timestamptz;
begin
  if tg_op = 'INSERT' then
    -- never trust a device clock that is in the future or very old
    started := least(coalesce(new.client_created_at, now()), now());
    started := greatest(started, now() - interval '12 hours');
    new.expires_at := started + private.crowd_report_ttl(new.kind);
  elsif current_user in ('anon', 'authenticated') then
    -- clients cannot change the kind or extend a report themselves
    new.expires_at := old.expires_at;
    new.kind := old.kind;
  end if;
  return new;
end;
$$;
create trigger crowd_reports_expiry before insert or update on public.crowd_reports
  for each row execute function private.crowd_reports_before_write();
create trigger crowd_reports_guard before insert or update on public.crowd_reports
  for each row execute function private.guard_columns(
    '{"confirm_count": 0, "deny_count": 0, "last_confirmed_at": null, "moderation_status": "ok"}');

create or replace function private.crowd_votes_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rid uuid := coalesce(new.report_id, old.report_id);
begin
  update public.crowd_reports r set
    confirm_count = v.ups,
    deny_count = v.downs
  from (
    select count(*) filter (where vote = 1) as ups, count(*) filter (where vote = -1) as downs
    from public.crowd_report_votes where report_id = rid
  ) v
  where r.id = rid;

  if tg_op <> 'DELETE' and new.vote = 1 then
    update public.crowd_reports set
      last_confirmed_at = now(),
      expires_at = greatest(expires_at, now() + private.crowd_report_ttl(kind))
    where id = rid;
  end if;
  return null;
end;
$$;
create trigger crowd_votes_after_write after insert or update or delete on public.crowd_report_votes
  for each row execute function private.crowd_votes_after_write();

-- touch triggers
create trigger achievements_touch  before update on public.achievements  for each row execute function private.touch_row();
create trigger hunts_touch         before update on public.hunts         for each row execute function private.touch_row();
create trigger hunt_steps_touch    before update on public.hunt_steps    for each row execute function private.touch_row();
create trigger hunt_progress_touch before update on public.hunt_progress for each row execute function private.touch_updated_at();
create trigger crowd_reports_touch before update on public.crowd_reports for each row execute function private.touch_row();
create trigger crowd_votes_touch   before update on public.crowd_report_votes for each row execute function private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.xp_events             enable row level security;
alter table public.achievements          enable row level security;
alter table public.user_achievements     enable row level security;
alter table public.hunts                 enable row level security;
alter table public.hunt_steps            enable row level security;
alter table public.hunt_progress         enable row level security;
alter table public.hunt_step_completions enable row level security;
alter table public.crowd_reports         enable row level security;
alter table public.crowd_report_votes    enable row level security;

revoke insert, update, delete on public.xp_events, public.achievements, public.user_achievements,
  public.hunts, public.hunt_steps, public.hunt_step_completions from anon, authenticated;

create policy "own xp history" on public.xp_events for select to authenticated
  using (user_id = (select auth.uid()));

create policy "achievements are public" on public.achievements for select to anon, authenticated
  using (not is_secret or exists (
    select 1 from public.user_achievements ua
    where ua.achievement_id = achievements.id and ua.user_id = (select auth.uid())));

create policy "badges visible unless blocked" on public.user_achievements for select to authenticated
  using (user_id = (select auth.uid()) or not private.is_blocked(user_id, (select auth.uid())));

create policy "published hunts are public" on public.hunts for select to anon, authenticated using (is_published);
create policy "steps of published hunts" on public.hunt_steps for select to anon, authenticated
  using (exists (select 1 from public.hunts h where h.id = hunt_id));

create policy "own hunt progress" on public.hunt_progress for select to authenticated
  using (user_id = (select auth.uid()));
create policy "start a hunt" on public.hunt_progress for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'active' and completed_at is null);
create policy "abandon a hunt" on public.hunt_progress for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and status in ('active', 'abandoned'));
revoke delete on public.hunt_progress from anon, authenticated;
create trigger hunt_progress_guard before insert or update on public.hunt_progress
  for each row execute function private.guard_columns('{"completed_at": null}');

create policy "own completions" on public.hunt_step_completions for select to authenticated
  using (user_id = (select auth.uid()));

-- Others see live, non-hidden reports; the author also sees their history.
create policy "active crowd reports" on public.crowd_reports for select to authenticated
  using (
    user_id = (select auth.uid())
    or (deleted_at is null
        and moderation_status = 'ok'
        and expires_at > now()
        and deny_count < confirm_count + 3
        and not private.is_blocked(user_id, (select auth.uid())))
  );
create policy "report as yourself" on public.crowd_reports for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "edit own report" on public.crowd_reports for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke delete on public.crowd_reports from anon, authenticated;

create policy "own votes" on public.crowd_report_votes for select to authenticated
  using (user_id = (select auth.uid()));
create policy "vote as yourself" on public.crowd_report_votes for insert to authenticated
  with check (user_id = (select auth.uid())
              and exists (select 1 from public.crowd_reports r where r.id = report_id and r.user_id <> (select auth.uid())));
create policy "change own vote" on public.crowd_report_votes for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "remove own vote" on public.crowd_report_votes for delete to authenticated
  using (user_id = (select auth.uid()));
