-- =============================================================================
-- CaminoPlus 14: data integrity and privacy hardening
-- Closes the holes a security audit found in migrations 01-13. Everything below
-- was reproduced on Postgres 16 with `set local role authenticated` first.
--
--   1  XP / km / badge forgery        award_xp caps, natural keys, journey progress rules
--   2  cross-user private object read  *_path columns must live in the caller's folder,
--                                      storage policy goes through private.can_read_user_media
--   3  storage quota was advisory      the quota check recounts storage.objects live
--   4  cross-owner references          parents must belong to the caller, keys are immutable
--   5  forged timestamps               server-time trigger on every client-writable table
--   6  complete_hunt_step              photo proof, time window, attempt limit, terminal, id clash
--   7  private journey fields          credential_number / notes move to journey_private
--   8  smaller items                   badge privacy, price spam, consent rows, original_path,
--                                      stay photos, push tokens, verification_label volatility
--
-- Re-runnable: every statement is `create or replace`, `if not exists`, `drop ... if exists`
-- or guarded by a catalog check. Server code (service_role, security definer functions) is
-- never restricted by the guards below: they only look at `current_user in ('anon', 'authenticated')`
-- (same convention as private.guard_columns).
-- =============================================================================

-- (the many "drop ... if exists" would otherwise print a notice each on a first run)
set client_min_messages = warning;

-- -----------------------------------------------------------------------------
-- 0. Generic helpers
-- -----------------------------------------------------------------------------

-- Key columns that a client may never change after the row exists (re-pointing a row at
-- another parent skews counters and puts content on somebody else's page).
-- TG_ARGV[0] is a JSON array of column names.
create or replace function private.immutable_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  k text;
  o jsonb;
  n jsonb;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  o := to_jsonb(old);
  n := to_jsonb(new);
  for k in select jsonb_array_elements_text(tg_argv[0]::jsonb) loop
    if o -> k is distinct from n -> k then
      raise exception 'column "%" of "%" cannot be changed after creation', k, tg_table_name
        using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

-- Client roles get server time: created_at / updated_at are set by the server (the touch
-- triggers only run BEFORE UPDATE, so an INSERT used to accept any value), published_at can
-- not be in the future and client_created_at may run at most 5 minutes ahead of the server.
-- TG_ARGV lists the columns the table really has (see attach_server_time_triggers), so the
-- row is only serialised for tables that need a clamp.
create or replace function private.force_server_times()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  patch jsonb := '{}'::jsonb;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if 'created_at' = any (tg_argv) then
    if tg_op = 'INSERT' then
      patch := patch || jsonb_build_object('created_at', now());
    else
      patch := patch || jsonb_build_object('created_at', old.created_at);
    end if;
  end if;
  if 'updated_at' = any (tg_argv) then
    patch := patch || jsonb_build_object('updated_at', now());
  end if;
  if 'published_at' = any (tg_argv) then
    if new.published_at > now() then
      patch := patch || jsonb_build_object('published_at', now());
    end if;
  end if;
  if 'client_created_at' = any (tg_argv) then
    if new.client_created_at > now() + interval '5 minutes' then
      patch := patch || jsonb_build_object('client_created_at', now() + interval '5 minutes');
    end if;
  end if;
  if patch <> '{}'::jsonb then
    new := jsonb_populate_record(new, patch);
  end if;
  return new;
end;
$$;

-- Attaches private.force_server_times to every public table a client can insert into and
-- that has created_at / updated_at / published_at / client_created_at. The list comes from
-- the catalog (so nothing is forgotten); the trigger is named a_force_server_times so it
-- fires first. Call it again at the end of any later migration that adds a client-writable
-- table:  select private.attach_server_time_triggers();
create or replace function private.attach_server_time_triggers()
returns text
language plpgsql
set search_path = ''
as $$
declare
  t     record;
  args  text;
  names text[] := '{}';
begin
  for t in
    select c.oid, c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and (has_any_column_privilege('authenticated', c.oid, 'INSERT')
           or has_any_column_privilege('anon', c.oid, 'INSERT'))
      and exists (select 1 from pg_attribute a
                  where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
                    and a.attname in ('created_at', 'updated_at', 'published_at', 'client_created_at'))
    order by c.relname
  loop
    select string_agg(quote_literal(a.attname), ', ' order by a.attname) into args
    from pg_attribute a
    where a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
      and a.attname in ('created_at', 'updated_at', 'published_at', 'client_created_at');
    execute format('drop trigger if exists a_force_server_times on public.%I', t.relname);
    execute format(
      'create trigger a_force_server_times before insert or update on public.%I '
      'for each row execute function private.force_server_times(%s)', t.relname, args);
    names := names || t.relname::text;
  end loop;
  return array_to_string(names, ', ');
end;
$$;

-- "Is this journey / journey day mine?" for WITH CHECK clauses. SECURITY INVOKER on purpose:
-- the caller's own RLS decides what they can see. Null = no reference = fine.
create or replace function private.owns_journey(p_journey uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_journey is null or exists (
    select 1 from public.journeys j
    where j.id = p_journey and j.user_id = (select auth.uid()));
$$;

create or replace function private.owns_journey_day(p_day uuid, p_journey uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_day is null or exists (
    select 1 from public.journey_days d
    where d.id = p_day and d.user_id = (select auth.uid())
      and (p_journey is null or d.journey_id = p_journey));
$$;

-- (trigger functions need no grant; attach_server_time_triggers runs DDL, so only the migration role
-- that owns the tables can use it)
revoke execute on function private.immutable_columns(), private.force_server_times(),
  private.attach_server_time_triggers() from public, anon, authenticated, service_role;
revoke execute on function private.owns_journey(uuid), private.owns_journey_day(uuid, uuid) from public, anon;
grant execute on function private.owns_journey(uuid), private.owns_journey_day(uuid, uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 1. XP, km and badges
--    Clients can insert unlimited source rows (journeys, stamps, days), so the ledger key
--    (reason, source id) alone is not enough. Layers: natural keys on the source tables,
--    hard CHECK bounds, a progress rule for journey completion, and a daily cap per reason
--    here. Only server code writes XP (xp_events has no client grants, profiles.xp is guarded).
-- -----------------------------------------------------------------------------

-- Award XP once per (reason, source), and never more than the daily cap of that reason in
-- any 24 h window. Caps can be tuned in app_config as "xp_daily_cap.<reason>". A capped
-- award returns false (it is not queued: the row that asked for it can ask again later).
-- Reasons without a cap (achievement) are bounded by their own content.
create or replace function private.award_xp(
  p_user uuid, p_amount integer, p_reason text, p_source_type text, p_source_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  cap   bigint;
  given bigint;
begin
  if p_user is null or p_amount is null or p_amount = 0 then
    return false;
  end if;
  if p_amount > 0 then
    cap := private.config_bigint('xp_daily_cap.' || p_reason,
      case p_reason
        when 'stamp'        then 120     -- 12 verified stamps
        when 'stamp_manual' then 20      -- unverified / free-form stamps, 2 XP each
        when 'day_done'     then 250     -- 5 finished days
        when 'journey_done' then 500     -- one finished journey
        when 'hunt_step'    then 300
        when 'hunt'         then 1000
        else null
      end);
    if cap is not null then
      select coalesce(sum(e.amount), 0) into given
      from public.xp_events e
      where e.user_id = p_user and e.reason = p_reason and e.created_at > now() - interval '24 hours';
      if given + p_amount > cap then
        return false;
      end if;
    end if;
  end if;
  insert into public.xp_events (user_id, amount, reason, source_type, source_id)
  values (p_user, p_amount, p_reason, p_source_type, p_source_id)
  on conflict do nothing;
  if not found then
    return false;
  end if;
  update public.profiles set
    xp = xp + p_amount,
    level = floor(sqrt(greatest(xp + p_amount, 0) / 100.0))::int + 1
  where id = p_user;
  return true;
end;
$$;
revoke execute on function private.award_xp(uuid, integer, text, text, uuid) from public, anon, authenticated;
grant execute on function private.award_xp(uuid, integer, text, text, uuid) to service_role;
-- badges pay XP too: the same rule for the function that grants them
revoke execute on function private.grant_achievement(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function private.grant_achievement(uuid, text, text, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 7. Private journey fields
--    credential_number and notes were columns of journeys, a row that followers can read
--    (RLS is row level). They move to an owner-only table.
-- -----------------------------------------------------------------------------
create table if not exists public.journey_private (
  journey_id        uuid primary key references public.journeys (id) on delete cascade,
  user_id           uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  credential_number text check (char_length(credential_number) <= 200),   -- physical credencial / pilgrim passport number
  notes             text check (char_length(notes) <= 20000),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists journey_private_user_idx on public.journey_private (user_id);

alter table public.journey_private enable row level security;
drop policy if exists "journey private: owner only" on public.journey_private;
create policy "journey private: owner only" on public.journey_private for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
              and exists (select 1 from public.journeys j where j.id = journey_id and j.user_id = (select auth.uid())));
revoke all on public.journey_private from anon;

drop trigger if exists journey_private_touch on public.journey_private;
create trigger journey_private_touch before update on public.journey_private
  for each row execute function private.touch_updated_at();
drop trigger if exists journey_private_immutable on public.journey_private;
create trigger journey_private_immutable before update on public.journey_private
  for each row execute function private.immutable_columns('["journey_id", "user_id"]');

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'journeys' and column_name = 'credential_number') then
    insert into public.journey_private (journey_id, user_id, credential_number, notes)
    select id, user_id, left(credential_number, 200), left(notes, 20000)
    from public.journeys
    where credential_number is not null or notes is not null
    on conflict (journey_id) do nothing;
  end if;
end $$;
alter table public.journeys
  drop column if exists credential_number,
  drop column if exists notes;

-- -----------------------------------------------------------------------------
-- 1 + 4. journeys, journey_days, user_stamps, tracks
-- -----------------------------------------------------------------------------

-- Sane bounds (existing garbage is cleared first so the constraints can be validated).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'journeys_planned_km_range'
                 and conrelid = 'public.journeys'::regclass) then
    update public.journeys set planned_distance_km = null
    where planned_distance_km < 0 or planned_distance_km > 6000;
    alter table public.journeys add constraint journeys_planned_km_range
      check (planned_distance_km is null or planned_distance_km between 0 and 6000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'journey_days_planned_km_range'
                 and conrelid = 'public.journey_days'::regclass) then
    update public.journey_days set planned_distance_km = null
    where planned_distance_km < 0 or planned_distance_km > 250;
    alter table public.journey_days add constraint journey_days_planned_km_range
      check (planned_distance_km is null or planned_distance_km between 0 and 250);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'journey_days_actual_km_range'
                 and conrelid = 'public.journey_days'::regclass) then
    update public.journey_days set actual_distance_km = null
    where actual_distance_km < 0 or actual_distance_km > 250;
    alter table public.journey_days add constraint journey_days_actual_km_range
      check (actual_distance_km is null or actual_distance_km between 0 and 250);
  end if;
end $$;

-- One passport stamp per user and place and (server) day. Duplicates that already exist are
-- soft-deleted first (the earliest one stays). The day comes from created_at, which clients
-- cannot choose, not from stamped_at, which they can.
update public.user_stamps s set deleted_at = now()
where s.deleted_at is null
  and exists (
    select 1 from public.user_stamps o
    where o.user_id = s.user_id and o.deleted_at is null
      and ((o.stay_id is not null and o.stay_id = s.stay_id) or (o.poi_id is not null and o.poi_id = s.poi_id))
      and (o.created_at at time zone 'UTC')::date = (s.created_at at time zone 'UTC')::date
      and (o.created_at, o.id) < (s.created_at, s.id));
create unique index if not exists user_stamps_one_per_stay_day
  on public.user_stamps (user_id, stay_id, ((created_at at time zone 'UTC')::date))
  where stay_id is not null and deleted_at is null;
create unique index if not exists user_stamps_one_per_poi_day
  on public.user_stamps (user_id, poi_id, ((created_at at time zone 'UTC')::date))
  where poi_id is not null and deleted_at is null;

-- Journeys: bounded count, and the route can not be swapped under a finished journey.
create or replace function private.journeys_limits()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  n         integer;
  max_open  constant integer := 20;
  max_total constant integer := 100;
begin
  if current_user not in ('anon', 'authenticated') or new.deleted_at is not null then
    return new;
  end if;
  if tg_op = 'INSERT' or old.deleted_at is not null then
    select count(*) into n from public.journeys
    where user_id = new.user_id and deleted_at is null and id <> new.id;
    if n >= max_total then
      raise exception 'you can keep at most % journeys', max_total using errcode = '23514';
    end if;
  end if;
  if new.status in ('planning', 'active', 'paused')
     and (tg_op = 'INSERT' or old.deleted_at is not null or old.status not in ('planning', 'active', 'paused')) then
    select count(*) into n from public.journeys
    where user_id = new.user_id and deleted_at is null and id <> new.id
      and status in ('planning', 'active', 'paused');
    if n >= max_open then
      raise exception 'you can have at most % open journeys, finish or archive one first', max_open
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists journeys_limits on public.journeys;
create trigger journeys_limits before insert or update on public.journeys
  for each row execute function private.journeys_limits();
drop trigger if exists journeys_immutable on public.journeys;
create trigger journeys_immutable before update on public.journeys
  for each row execute function private.immutable_columns('["user_id", "route_id"]');

-- Journey days: at most 120 per journey, and a day stays in the journey it was created in.
create or replace function private.journey_days_limits()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  n integer;
begin
  if current_user not in ('anon', 'authenticated') or new.deleted_at is not null then
    return new;
  end if;
  if tg_op = 'INSERT' or old.deleted_at is not null then
    select count(*) into n from public.journey_days
    where journey_id = new.journey_id and deleted_at is null and id <> new.id;
    if n >= 120 then
      raise exception 'a journey can have at most 120 days' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists journey_days_limits on public.journey_days;
create trigger journey_days_limits before insert or update on public.journey_days
  for each row execute function private.journey_days_limits();
drop trigger if exists journey_days_immutable on public.journey_days;
create trigger journey_days_immutable before update on public.journey_days
  for each row execute function private.immutable_columns('["user_id", "journey_id"]');

-- Stamps: the place and the time of a collected stamp do not change (delete it and collect
-- it again), a stamp cannot come from the future, and a pilgrim collects at most 40 stamps
-- (8 of them free-form, without a stay or POI to check) in 24 hours.
create or replace function private.user_stamps_limits()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  n_all  integer;
  n_free integer;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.stamped_at > now() + interval '5 minutes' then
      new.stamped_at := now();
    end if;
  elsif new.user_id is distinct from old.user_id
     or new.stay_id is distinct from old.stay_id
     or new.poi_id is distinct from old.poi_id
     or new.stamped_at is distinct from old.stamped_at
     or (old.location is not null and new.location is distinct from old.location) then
    raise exception 'a collected stamp cannot be moved or re-dated, delete it and collect it again'
      using errcode = '42501';
  end if;
  if new.deleted_at is null and (tg_op = 'INSERT' or old.deleted_at is not null) then
    select count(*), count(*) filter (where stay_id is null and poi_id is null)
      into n_all, n_free
    from public.user_stamps
    where user_id = new.user_id and deleted_at is null and id <> new.id
      and created_at > now() - interval '24 hours';
    if n_all >= 40 then
      raise exception 'too many stamps today' using errcode = '23514';
    end if;
    if new.stay_id is null and new.poi_id is null and n_free >= 8 then
      raise exception 'too many stamps without a place today, pick the albergue or church from the map'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists user_stamps_limits on public.user_stamps;
create trigger user_stamps_limits before insert or update on public.user_stamps
  for each row execute function private.user_stamps_limits();

-- (tracks need no immutability trigger: RLS already pins user_id to the caller, and serialising
-- a row with a long geometry on every update would cost more than it protects)

-- km and progress. A day counts for km when it is done, not deleted and 0..250 km (the CHECKs
-- above); the profile total is also capped by what one person can have walked since signing
-- up: 1000 km (an earlier Camino, logged at once) plus 100 km per day since the account exists
-- (app_config: km_allowance_base, km_allowance_per_day).
create or replace function private.recompute_journey_km(p_journey uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  with s as (
    -- (least() ignores NULL, so a day without any distance must fall back to 0 first)
    select coalesce(sum(least(coalesce(d.actual_distance_km, d.planned_distance_km, 0), 250)), 0) as km
    from public.journey_days d
    where d.journey_id = p_journey and d.status = 'done' and d.deleted_at is null)
  update public.journeys j set walked_km = s.km
  from s
  where j.id = p_journey and j.walked_km is distinct from s.km;
$$;

create or replace function private.recompute_profile_km(p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  with s as (
    select least(
             coalesce((select sum(j.walked_km) from public.journeys j
                       where j.user_id = p_user and j.deleted_at is null), 0),
             private.config_bigint('km_allowance_base', 1000)
               + private.config_bigint('km_allowance_per_day', 100)
                 * greatest((now() at time zone 'UTC')::date - (p.created_at at time zone 'UTC')::date, 0)
           ) as km
    from public.profiles p where p.id = p_user)
  update public.profiles p set km_walked = s.km
  from s
  where p.id = p_user and p.km_walked is distinct from s.km;
$$;

-- Journey progress = days marked done + verified stamps. A journey only counts as finished
-- (500 XP, the "first Camino" badge) with at least 5 of those (the shortest walk for a
-- Compostela is 5 stages), and the XP is paid once per user and route, not once per journey.
create or replace function private.journey_progress(p_journey uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select ((select count(*) from public.journey_days d
           where d.journey_id = p_journey and d.status = 'done' and d.deleted_at is null)
        + (select count(*) from public.user_stamps s
           where s.journey_id = p_journey and s.verified and s.deleted_at is null))::int;
$$;

create or replace function private.award_journey_completion(p_journey uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.journeys;
begin
  select * into j from public.journeys where id = p_journey;
  if not found or j.status <> 'completed' or j.deleted_at is not null then
    return;
  end if;
  if private.journey_progress(j.id) < private.config_bigint('journey_min_progress', 5) then
    return;
  end if;
  -- earlier versions keyed the award by journey id: do not pay a route twice
  if not exists (
       select 1 from public.xp_events e
       join public.journeys o on o.id = e.source_id
       where e.user_id = j.user_id and e.reason = 'journey_done' and e.source_type = 'journey'
         and o.route_id = j.route_id) then
    perform private.award_xp(j.user_id, 500, 'journey_done', 'route', j.route_id);
  end if;
  perform private.grant_achievement(j.user_id, 'first-camino', 'journey', j.id);
end;
$$;

revoke execute on function private.recompute_journey_km(uuid), private.recompute_profile_km(uuid),
  private.journey_progress(uuid), private.award_journey_completion(uuid) from public, anon, authenticated;
grant execute on function private.recompute_journey_km(uuid), private.recompute_profile_km(uuid),
  private.journey_progress(uuid), private.award_journey_completion(uuid) to service_role;

create or replace function private.journeys_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed' and new.deleted_at is null
     and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    perform private.award_journey_completion(new.id);
  end if;
  if tg_op = 'UPDATE' and new.deleted_at is distinct from old.deleted_at then
    perform private.recompute_profile_km(new.user_id);
  end if;
  return null;
end;
$$;
drop trigger if exists journeys_after_write on public.journeys;
create trigger journeys_after_write after insert or update of status, deleted_at on public.journeys
  for each row execute function private.journeys_after_write();

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
  -- planned days (onboarding inserts a whole plan) do not move any counter
  if new.status = 'done' or (tg_op = 'UPDATE' and old.status = 'done') then
    perform private.recompute_journey_km(new.journey_id);
    perform private.recompute_profile_km(new.user_id);
    if new.status = 'done' then
      perform private.award_journey_completion(new.journey_id);
    end if;
  end if;
  return null;
end;
$$;

-- Stamp XP is paid once per user and place (a stay or POI), 10 for a verified stamp and 2 for
-- an unverified one; free-form stamps pay 2 each. Daily caps live in award_xp.
create or replace function private.user_stamps_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid        uuid := coalesce(new.user_id, old.user_id);
  n          integer;
  place_id   uuid;
  place_type text;
begin
  select count(*) into n from public.user_stamps where user_id = uid and deleted_at is null;
  update public.profiles set stamps_count = n where id = uid;
  if tg_op = 'INSERT' and new.deleted_at is null then
    place_id := coalesce(new.stay_id, new.poi_id);
    place_type := case when new.stay_id is not null then 'stay' when new.poi_id is not null then 'poi' end;
    if place_id is not null then
      perform private.award_xp(uid, case when new.verified then 10 else 2 end,
                               case when new.verified then 'stamp' else 'stamp_manual' end,
                               place_type, place_id);
    else
      perform private.award_xp(uid, 2, 'stamp_manual', 'user_stamp', new.id);
    end if;
    if n >= 1 then perform private.grant_achievement(uid, 'first-stamp', 'user_stamp', new.id); end if;
    if n >= 25 then perform private.grant_achievement(uid, 'stamps-25', 'user_stamp', new.id); end if;
    if new.verified and new.journey_id is not null then
      perform private.award_journey_completion(new.journey_id);
    end if;
  end if;
  return null;
end;
$$;

-- Trigger functions need no EXECUTE grant (Postgres checks it when the trigger is created, not
-- when it fires), so nobody else gets one.
revoke execute on function private.journeys_limits(), private.journey_days_limits(), private.user_stamps_limits(),
  private.journeys_after_write(), private.journey_days_after_write(), private.user_stamps_after_write()
  from public, anon, authenticated;

-- One-off: apply the km rules to the numbers stored so far.
do $$
declare
  r record;
begin
  for r in select j.id from public.journeys j
           where exists (select 1 from public.journey_days d where d.journey_id = j.id and d.status = 'done') loop
    perform private.recompute_journey_km(r.id);
  end loop;
  for r in select distinct j.user_id from public.journeys j loop
    perform private.recompute_profile_km(r.user_id);
  end loop;
end $$;

-- RLS: parents must be the caller's own (journey / day references used to be unchecked, so a
-- stranger's stamp could show up on a victim's public journey).
drop policy if exists "collect own stamps" on public.user_stamps;
create policy "collect own stamps" on public.user_stamps for insert to authenticated
  with check (user_id = (select auth.uid())
              and (photo_path is null or photo_path like (select auth.uid())::text || '/%')
              and private.owns_journey(journey_id)
              and private.owns_journey_day(journey_day_id, journey_id));
drop policy if exists "edit own stamps" on public.user_stamps;
create policy "edit own stamps" on public.user_stamps for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
              and (photo_path is null or photo_path like (select auth.uid())::text || '/%')
              and private.owns_journey(journey_id)
              and private.owns_journey_day(journey_day_id, journey_id));

drop policy if exists "record own tracks" on public.tracks;
create policy "record own tracks" on public.tracks for insert to authenticated
  with check (user_id = (select auth.uid())
              and private.owns_journey(journey_id)
              and private.owns_journey_day(journey_day_id, journey_id));
drop policy if exists "edit own tracks" on public.tracks;
create policy "edit own tracks" on public.tracks for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
              and private.owns_journey(journey_id)
              and private.owns_journey_day(journey_day_id, journey_id));

-- -----------------------------------------------------------------------------
-- 2 + 4. Paths, media, votes, comments, reviews: ownership and immutability
-- -----------------------------------------------------------------------------

-- post_media: every path column starts with the caller's folder, the post is the caller's,
-- and the media cannot be moved to another post later.
drop policy if exists "add media to own posts" on public.post_media;
create policy "add media to own posts" on public.post_media for insert to authenticated
  with check (user_id = (select auth.uid())
              and exists (select 1 from public.posts p where p.id = post_id and p.user_id = (select auth.uid()))
              and storage_path like (select auth.uid())::text || '/%'
              and (thumb_path is null or thumb_path like (select auth.uid())::text || '/%'));
drop policy if exists "edit own media" on public.post_media;
create policy "edit own media" on public.post_media for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
              and exists (select 1 from public.posts p where p.id = post_id and p.user_id = (select auth.uid()))
              and storage_path like (select auth.uid())::text || '/%'
              and (thumb_path is null or thumb_path like (select auth.uid())::text || '/%'));
drop trigger if exists post_media_immutable on public.post_media;
create trigger post_media_immutable before update on public.post_media
  for each row execute function private.immutable_columns('["post_id", "user_id"]');

-- crowd reports: photo path in the caller's folder
drop policy if exists "report as yourself" on public.crowd_reports;
create policy "report as yourself" on public.crowd_reports for insert to authenticated
  with check (user_id = (select auth.uid())
              and (photo_path is null or photo_path like (select auth.uid())::text || '/%'));
drop policy if exists "edit own report" on public.crowd_reports;
create policy "edit own report" on public.crowd_reports for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
              and (photo_path is null or photo_path like (select auth.uid())::text || '/%'));

-- votes: a vote could be re-pointed at the voter's own report (self-confirm) and left stale
-- counts behind on the old one. The report is fixed once the vote exists, and a changed vote
-- must still be on somebody else's report.
drop policy if exists "change own vote" on public.crowd_report_votes;
create policy "change own vote" on public.crowd_report_votes for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
              and exists (select 1 from public.crowd_reports r
                          where r.id = report_id and r.user_id <> (select auth.uid())));
drop trigger if exists crowd_report_votes_immutable on public.crowd_report_votes;
create trigger crowd_report_votes_immutable before update on public.crowd_report_votes
  for each row execute function private.immutable_columns('["report_id", "user_id"]');

-- comments: stay on their post; a reply's parent is a comment of the same post. (A policy
-- cannot select from its own table, so the parent lookup is a SECURITY DEFINER helper.)
create or replace function private.is_comment_of_post(p_comment uuid, p_post uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_comment is null or exists (
    select 1 from public.post_comments c where c.id = p_comment and c.post_id = p_post);
$$;
revoke execute on function private.is_comment_of_post(uuid, uuid) from public, anon;
grant execute on function private.is_comment_of_post(uuid, uuid) to authenticated, service_role;

drop policy if exists "comment as yourself" on public.post_comments;
create policy "comment as yourself" on public.post_comments for insert to authenticated
  with check (user_id = (select auth.uid())
              and exists (select 1 from public.posts p where p.id = post_id)
              and private.is_comment_of_post(parent_id, post_id));
drop trigger if exists post_comments_immutable on public.post_comments;
create trigger post_comments_immutable before update on public.post_comments
  for each row execute function private.immutable_columns('["post_id", "user_id", "parent_id"]');

-- posts and reviews that point at a journey: it has to be the caller's
drop policy if exists "post as yourself" on public.posts;
create policy "post as yourself" on public.posts for insert to authenticated
  with check (user_id = (select auth.uid())
              and private.owns_journey(journey_id)
              and private.owns_journey_day(journey_day_id, journey_id));
drop policy if exists "edit own posts" on public.posts;
create policy "edit own posts" on public.posts for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
              and private.owns_journey(journey_id)
              and private.owns_journey_day(journey_day_id, journey_id));

drop policy if exists "write own review" on public.stay_reviews;
create policy "write own review" on public.stay_reviews for insert to authenticated
  with check (user_id = (select auth.uid()) and private.owns_journey(journey_id));
drop policy if exists "edit own review" on public.stay_reviews;
create policy "edit own review" on public.stay_reviews for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and private.owns_journey(journey_id));
-- (the rating trigger only recounts the new stay, so a review must not hop between stays)
drop trigger if exists stay_reviews_immutable on public.stay_reviews;
create trigger stay_reviews_immutable before update on public.stay_reviews
  for each row execute function private.immutable_columns('["stay_id", "user_id"]');

-- -----------------------------------------------------------------------------
-- 2 + 3. Storage: who can read user-media, live quota, bounded buckets
-- -----------------------------------------------------------------------------

-- Bytes and objects in a user's folder of user-media, counted live. The name range
-- [uid/, uid0) in C collation is the same as "starts with uid/" but can use the (bucket_id,
-- name) btree of storage.objects.
create or replace function private.storage_usage_now(p_user uuid)
returns table (used_bytes bigint, object_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(case when o.metadata ->> 'size' ~ '^[0-9]{1,15}$'
                           then (o.metadata ->> 'size')::bigint else 0 end), 0)::bigint,
         count(*)::integer
  from storage.objects o
  where o.bucket_id = 'user-media'
    and o.name collate "C" >= p_user::text || '/'
    and o.name collate "C" < p_user::text || '0';
$$;

-- The upload policy asks this. It used to subtract storage_usage.used_bytes, a cache that
-- only refresh_my_storage_usage() updated, so the quota was advisory. The size of the file
-- being uploaded is not known when the policy runs (Storage creates the row first), so the
-- check is "is there room left", and a big file can overshoot by its own size.
create or replace function private.storage_remaining_bytes(p_user uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select private.storage_quota_bytes(p_user)
       - (select u.used_bytes from private.storage_usage_now(p_user) u);
$$;

-- The cache table stays (refresh_my_storage_usage, dashboards), fed from the same count.
create or replace function private.recalculate_storage_usage(p_user uuid)
returns public.storage_usage
language plpgsql
security definer
set search_path = ''
as $$
declare
  u      record;
  result public.storage_usage;
begin
  select * into u from private.storage_usage_now(p_user);
  insert into public.storage_usage as su (user_id, used_bytes, object_count, last_calculated_at, updated_at)
  values (p_user, u.used_bytes, u.object_count, now(), now())
  on conflict (user_id) do update set
    used_bytes = excluded.used_bytes,
    object_count = excluded.object_count,
    last_calculated_at = excluded.last_calculated_at,
    updated_at = excluded.updated_at
  returning * into result;
  return result;
end;
$$;

-- Settings screen: shows the same live numbers the upload policy uses.
create or replace function public.get_my_storage()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'has_plus',        private.has_plus(auth.uid()),
    'quota_bytes',     private.storage_quota_bytes(auth.uid()),
    'used_bytes',      u.used_bytes,
    'object_count',    u.object_count,
    'remaining_bytes', private.storage_quota_bytes(auth.uid()) - u.used_bytes,
    'calculated_at',   now()
  )
  from private.storage_usage_now(auth.uid()) u;
$$;
revoke execute on function public.get_my_storage() from public, anon;
grant execute on function public.get_my_storage() to authenticated;

-- Objects in a folder of a bucket whose uploads are bounded by count (see policies below).
create or replace function private.storage_folder_count(p_bucket text, p_folder text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from storage.objects o
  where p_bucket in ('avatars', 'business-media', 'business-docs')
    and o.bucket_id = p_bucket
    and o.name collate "C" >= p_folder || '/'
    and o.name collate "C" < p_folder || '0';
$$;

-- Can the signed-in user read this object of user-media? The owner can. Anyone else can only
-- if a row that is visible to them (RLS of that table applies, SECURITY INVOKER) points at the
-- object AND that row belongs to the folder owner. The second condition is what stops user B
-- from "publishing" user A's private object by writing its path into B's own row.
create or replace function private.can_read_user_media(p_name text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select (storage.foldername(p_name))[1] = (select auth.uid())::text
      or exists (select 1 from public.post_media m
                 where (m.storage_path = p_name or m.thumb_path = p_name)
                   and m.user_id::text = (storage.foldername(p_name))[1])
      or exists (select 1 from public.user_stamps s
                 where s.photo_path = p_name
                   and s.user_id::text = (storage.foldername(p_name))[1])
      or exists (select 1 from public.crowd_reports c
                 where c.photo_path = p_name
                   and c.user_id::text = (storage.foldername(p_name))[1])
      or exists (select 1 from public.stay_photos sp
                 where sp.storage_bucket = 'user-media' and sp.storage_path = p_name
                   and sp.user_id::text = (storage.foldername(p_name))[1]);
$$;

revoke execute on function private.storage_usage_now(uuid), private.storage_remaining_bytes(uuid),
  private.recalculate_storage_usage(uuid), private.storage_folder_count(text, text),
  private.can_read_user_media(text) from public, anon;
grant execute on function private.storage_remaining_bytes(uuid), private.storage_folder_count(text, text),
  private.can_read_user_media(text) to authenticated, service_role;
grant execute on function private.storage_usage_now(uuid), private.recalculate_storage_usage(uuid) to service_role;

drop policy if exists "read user media" on storage.objects;
create policy "read user media" on storage.objects for select to authenticated
  using (bucket_id = 'user-media' and private.can_read_user_media(name));

-- Lookup behind the policy for stay photos kept in user-media.
create index if not exists stay_photos_user_media_path_idx on public.stay_photos (storage_path)
  where storage_bucket = 'user-media' and storage_path is not null;

-- The business bucket policies of migration 12 could never match: inside their sub-select the
-- unqualified `name` is businesses.name, not the object's name, so nobody could upload or read
-- listing photos or proof files. Same rules, with the column qualified.
drop policy if exists "business docs: members read" on storage.objects;
create policy "business docs: members read" on storage.objects for select to authenticated
  using (bucket_id = 'business-docs' and exists (
    select 1 from public.businesses b
    where b.id::text = (storage.foldername(objects.name))[1] and private.is_business_member(b.id)));
drop policy if exists "business docs: managers upload" on storage.objects;
create policy "business docs: managers upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'business-docs' and exists (
    select 1 from public.businesses b
    where b.id::text = (storage.foldername(objects.name))[1] and private.is_business_member(b.id, 'manager')));
drop policy if exists "business media: managers upload" on storage.objects;
create policy "business media: managers upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'business-media' and exists (
    select 1 from public.businesses b
    where b.id::text = (storage.foldername(objects.name))[1] and private.is_business_member(b.id, 'manager')));
drop policy if exists "business media: managers replace" on storage.objects;
create policy "business media: managers replace" on storage.objects for update to authenticated
  using (bucket_id = 'business-media' and exists (
    select 1 from public.businesses b
    where b.id::text = (storage.foldername(objects.name))[1] and private.is_business_member(b.id, 'manager')));
drop policy if exists "business media: managers delete" on storage.objects;
create policy "business media: managers delete" on storage.objects for delete to authenticated
  using (bucket_id = 'business-media' and exists (
    select 1 from public.businesses b
    where b.id::text = (storage.foldername(objects.name))[1] and private.is_business_member(b.id, 'manager')));

-- Bounded buckets: 10 avatar objects per user, 200 listing photos and 100 proof files per
-- business (a business has many listings with 3+ photos each). RESTRICTIVE policies are AND-ed
-- with the existing upload policies, so the rules hold whatever the permissive policies say.
-- An upload that would replace an existing name counts too (the check runs on the insert half
-- of an upsert): at the limit, delete the old object first.
drop policy if exists "cap avatar objects per user" on storage.objects;
create policy "cap avatar objects per user" on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'avatars'
              or private.storage_folder_count('avatars', (storage.foldername(name))[1]) < 10);
drop policy if exists "cap business media per business" on storage.objects;
create policy "cap business media per business" on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'business-media'
              or private.storage_folder_count('business-media', (storage.foldername(name))[1]) < 200);
drop policy if exists "cap business docs per business" on storage.objects;
create policy "cap business docs per business" on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'business-docs'
              or private.storage_folder_count('business-docs', (storage.foldername(name))[1]) < 100);

-- -----------------------------------------------------------------------------
-- 6. Scavenger hunts
-- -----------------------------------------------------------------------------

-- Wrong answers / QR codes, for the attempt limit. Server only.
create table if not exists private.hunt_step_attempts (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  step_id      uuid not null references public.hunt_steps (id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index if not exists hunt_step_attempts_idx on private.hunt_step_attempts (user_id, step_id, attempted_at desc);
alter table private.hunt_step_attempts enable row level security;
revoke all on private.hunt_step_attempts from public, anon, authenticated;

-- Completing a hunt is final: the client could flip a completed hunt back to active.
drop policy if exists "abandon a hunt" on public.hunt_progress;
create policy "abandon a hunt" on public.hunt_progress for update to authenticated
  using (user_id = (select auth.uid()) and status in ('active', 'abandoned'))
  with check (user_id = (select auth.uid()) and status in ('active', 'abandoned'));
drop trigger if exists hunt_progress_immutable on public.hunt_progress;
create trigger hunt_progress_immutable before update on public.hunt_progress
  for each row execute function private.immutable_columns('["user_id", "hunt_id"]');

-- complete_hunt_step, same signature and replay behaviour as before, plus:
--   * photo steps need a photo that really is in the caller's folder of user-media, and a GPS
--     fix near the place when the step has one
--   * the hunt window (starts_at / ends_at) is enforced; a device that was offline may report
--     up to 12 hours late
--   * answer and QR steps allow 10 wrong tries per hour
--   * a client chosen p_id that is already taken is reported instead of silently dropped
create or replace function public.complete_hunt_step(
  p_step_id      uuid,
  p_lat          double precision default null,
  p_lng          double precision default null,
  p_answer       text default null,
  p_photo_path   text default null,
  p_completed_at timestamptz default null,
  p_id           uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me        uuid := auth.uid();
  step      public.hunt_steps;
  hunt      public.hunts;
  here      extensions.geography;
  target    extensions.geography;
  ts        timestamptz;
  ok        boolean := false;
  remaining integer;
  fails     integer;
  wait_s    integer;
  max_fails constant integer := 10;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select * into step from public.hunt_steps where id = p_step_id and deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'step_not_found');
  end if;
  select * into hunt from public.hunts where id = step.hunt_id and is_published and deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'hunt_not_found');
  end if;

  if exists (select 1 from public.hunt_step_completions where user_id = me and step_id = p_step_id) then
    return jsonb_build_object('ok', true, 'already_completed', true);
  end if;

  ts := greatest(least(coalesce(p_completed_at, now()), now()), now() - interval '12 hours');
  if hunt.starts_at is not null and ts < hunt.starts_at then
    return jsonb_build_object('ok', false, 'error', 'hunt_not_started');
  end if;
  if hunt.ends_at is not null and ts > hunt.ends_at then
    return jsonb_build_object('ok', false, 'error', 'hunt_ended');
  end if;

  if (p_lat is null) <> (p_lng is null) or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    return jsonb_build_object('ok', false, 'error', 'bad_coordinates');
  end if;
  if p_lat is not null then
    here := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  end if;
  target := coalesce(step.location, (select location from public.pois where id = step.poi_id));

  if step.verification in ('answer', 'qr') then
    select count(*), coalesce(ceil(extract(epoch from (min(attempted_at) + interval '1 hour' - now())))::int, 0)
      into fails, wait_s
    from private.hunt_step_attempts
    where user_id = me and step_id = step.id and attempted_at > now() - interval '1 hour';
    if fails >= max_fails then
      return jsonb_build_object('ok', false, 'error', 'too_many_attempts', 'retry_after_s', wait_s);
    end if;
  end if;

  if step.verification = 'gps' then
    ok := here is not null and target is not null and extensions.st_dwithin(here, target, step.radius_m);
  elsif step.verification = 'photo' then
    if p_photo_path is null or p_photo_path not like me::text || '/%' then
      return jsonb_build_object('ok', false, 'error', 'photo_required');
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'user-media' and o.name = p_photo_path) then
      return jsonb_build_object('ok', false, 'error', 'photo_not_found');
    end if;
    if target is not null then
      if here is null then
        return jsonb_build_object('ok', false, 'error', 'location_required');
      end if;
      ok := extensions.st_dwithin(here, target, step.radius_m * 3);
    else
      ok := true;
    end if;
  elsif step.verification = 'answer' then
    ok := exists (select 1 from private.hunt_step_answers a
                  where a.step_id = step.id and lower(trim(a.answer)) = lower(trim(coalesce(p_answer, ''))));
  elsif step.verification = 'qr' then
    ok := exists (select 1 from private.hunt_step_answers a
                  where a.step_id = step.id and a.answer = coalesce(p_answer, ''));
  end if;

  if not ok then
    if step.verification in ('answer', 'qr') then
      delete from private.hunt_step_attempts
      where user_id = me and step_id = step.id and attempted_at < now() - interval '1 day';
      insert into private.hunt_step_attempts (user_id, step_id) values (me, step.id);
    end if;
    return jsonb_build_object('ok', false, 'error', 'verification_failed');
  end if;

  begin
    insert into public.hunt_step_completions (id, user_id, step_id, completed_at, location, photo_path)
    values (coalesce(p_id, gen_random_uuid()), me, step.id, ts, here, p_photo_path);
  exception when unique_violation then
    -- either a parallel replay of this very completion, or p_id belongs to some other row
    if exists (select 1 from public.hunt_step_completions where user_id = me and step_id = step.id) then
      return jsonb_build_object('ok', true, 'already_completed', true);
    end if;
    return jsonb_build_object('ok', false, 'error', 'id_conflict');
  end;
  insert into public.hunt_progress (user_id, hunt_id) values (me, hunt.id) on conflict do nothing;
  perform private.award_xp(me, step.xp_reward, 'hunt_step', 'hunt_step', step.id);

  select count(*) into remaining
  from public.hunt_steps s
  where s.hunt_id = hunt.id and s.deleted_at is null
    and not exists (select 1 from public.hunt_step_completions c where c.step_id = s.id and c.user_id = me);

  if remaining = 0 then
    update public.hunt_progress set status = 'completed', completed_at = now()
    where user_id = me and hunt_id = hunt.id and status <> 'completed';
    perform private.award_xp(me, hunt.xp_reward, 'hunt', 'hunt', hunt.id);
    if hunt.achievement_id is not null then
      perform private.grant_achievement(me, (select slug from public.achievements where id = hunt.achievement_id), 'hunt', hunt.id);
    end if;
  end if;

  return jsonb_build_object('ok', true, 'remaining_steps', remaining, 'hunt_completed', remaining = 0);
end;
$$;
revoke execute on function public.complete_hunt_step(uuid, double precision, double precision, text, text, timestamptz, uuid) from public, anon;
grant execute on function public.complete_hunt_step(uuid, double precision, double precision, text, text, timestamptz, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Smaller items
-- -----------------------------------------------------------------------------

-- 8a. A private account's badges are not for everybody (same rule as its posts).
drop policy if exists "badges visible unless blocked" on public.user_achievements;
drop policy if exists "badges follow profile privacy" on public.user_achievements;
create policy "badges follow profile privacy" on public.user_achievements for select to authenticated
  using (user_id = (select auth.uid()) or private.can_see(user_id, 'public'));

-- 8b. Price reports: bounded amount, no future dates, in the stay's own currency (the
-- price_from / price_to aggregate mixes amounts without converting), one report per user,
-- stay, item and day.
update public.stay_prices set amount = 10000, deleted_at = coalesce(deleted_at, now())
where amount > 10000;
update public.stay_prices p set deleted_at = now()
where p.deleted_at is null and p.source = 'user' and p.reported_by is not null
  and exists (
    select 1 from public.stay_prices o
    where o.deleted_at is null and o.source = 'user' and o.reported_by = p.reported_by
      and o.stay_id = p.stay_id and o.item = p.item and o.observed_on = p.observed_on
      and (o.created_at, o.id) < (p.created_at, p.id));
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'stay_prices_amount_range'
                 and conrelid = 'public.stay_prices'::regclass) then
    alter table public.stay_prices add constraint stay_prices_amount_range check (amount between 0 and 10000);
  end if;
end $$;
create unique index if not exists stay_prices_one_report_per_day
  on public.stay_prices (reported_by, stay_id, item, observed_on)
  where source = 'user' and deleted_at is null and reported_by is not null;

drop policy if exists "report a price as yourself" on public.stay_prices;
create policy "report a price as yourself" on public.stay_prices for insert to authenticated
  with check (reported_by = (select auth.uid()) and source = 'user'
              and observed_on <= current_date + 1
              and currency = (select s.currency from public.stays s where s.id = stay_prices.stay_id));
drop policy if exists "edit own price reports" on public.stay_prices;
create policy "edit own price reports" on public.stay_prices for update to authenticated
  using (reported_by = (select auth.uid()))
  with check (reported_by = (select auth.uid()) and source = 'user'
              and observed_on <= current_date + 1
              and currency = (select s.currency from public.stays s where s.id = stay_prices.stay_id));
-- (the price trigger only recounts the new stay)
drop trigger if exists stay_prices_immutable on public.stay_prices;
create trigger stay_prices_immutable before update on public.stay_prices
  for each row execute function private.immutable_columns('["stay_id"]');

-- 8c. Face-match consent rows are evidence: clients can add one (choosing only the consent
-- version the app showed) and revoke it once, with server time. Nothing else is writable.
drop policy if exists "give consent" on public.face_match_consents;
create policy "give consent" on public.face_match_consents for insert to authenticated
  with check (user_id = (select auth.uid()) and revoked_at is null);
drop policy if exists "revoke consent" on public.face_match_consents;
create policy "revoke consent" on public.face_match_consents for update to authenticated
  using (user_id = (select auth.uid()) and revoked_at is null)
  with check (user_id = (select auth.uid()) and revoked_at is not null);
revoke insert, update on public.face_match_consents from anon, authenticated;
grant insert (id, user_id, consent_version) on public.face_match_consents to authenticated;
grant update (revoked_at) on public.face_match_consents to authenticated;

create or replace function private.face_consent_revoke_time()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.revoked_at := now();
  end if;
  return new;
end;
$$;
revoke execute on function private.face_consent_revoke_time() from public, anon, authenticated;
drop trigger if exists face_match_consents_revoke_time on public.face_match_consents;
create trigger face_match_consents_revoke_time before update on public.face_match_consents
  for each row execute function private.face_consent_revoke_time();

-- 8d. Marketplace listings: paths in the seller's folder, and original_path (the full
-- resolution file) is not readable through the API at all: people who were matched in a
-- photo could read it. Delivery after a purchase happens server side (service_role).
-- Because of the column privileges, clients must name the columns they select
-- (select=id,preview_path,... instead of select=*).
drop policy if exists "sellers manage own listings" on public.marketplace_photos;
create policy "sellers manage own listings" on public.marketplace_photos for insert to authenticated
  with check (seller_id = (select auth.uid())
              and original_path like (select auth.uid())::text || '/%'
              and preview_path like (select auth.uid())::text || '/%');
drop policy if exists "sellers edit own listings" on public.marketplace_photos;
create policy "sellers edit own listings" on public.marketplace_photos for update to authenticated
  using (seller_id = (select auth.uid()))
  with check (seller_id = (select auth.uid())
              and original_path like (select auth.uid())::text || '/%'
              and preview_path like (select auth.uid())::text || '/%');
revoke all on public.marketplace_photos from anon;
revoke select on public.marketplace_photos from authenticated;
grant select (id, seller_id, preview_path, price_cents, currency, taken_at, location, stage_id, poi_id,
              status, created_at, updated_at, deleted_at)
  on public.marketplace_photos to authenticated;

-- 8e. Stay photos from pilgrims: only files in our storage (no hotlinked URLs), in the
-- caller's folder of user-media, and invisible to others until a moderator sets
-- moderation_status = 'ok' (clients cannot: the guard forces 'pending' on insert and keeps
-- the value on update). Rows written by the server (owner photos, imports) keep the default.
alter table public.stay_photos
  add column if not exists moderation_status text not null default 'ok'
    check (moderation_status in ('ok', 'pending', 'hidden', 'removed'));
drop trigger if exists stay_photos_guard on public.stay_photos;
create trigger stay_photos_guard before insert or update on public.stay_photos
  for each row execute function private.guard_columns(
    '{"moderation_status": "pending", "license": null, "source_url": null}');
drop trigger if exists stay_photos_immutable on public.stay_photos;
create trigger stay_photos_immutable before update on public.stay_photos
  for each row execute function private.immutable_columns('["stay_id", "user_id"]');

drop policy if exists "stay photos are public" on public.stay_photos;
create policy "stay photos are public" on public.stay_photos for select to anon, authenticated
  using ((deleted_at is null and moderation_status = 'ok') or user_id = (select auth.uid()));
drop policy if exists "add own stay photos" on public.stay_photos;
create policy "add own stay photos" on public.stay_photos for insert to authenticated
  with check (user_id = (select auth.uid()) and source = 'user'
              and url is null and storage_bucket = 'user-media'
              and storage_path like (select auth.uid())::text || '/%');
drop policy if exists "edit own stay photos" on public.stay_photos;
create policy "edit own stay photos" on public.stay_photos for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and source = 'user'
              and url is null and storage_bucket = 'user-media'
              and storage_path like (select auth.uid())::text || '/%');

-- 8f. Push tokens: registering a token moves it to the new owner (a second pilgrim on the
-- same phone, or a re-install) instead of failing on the unique index while the first
-- account keeps receiving the pushes.
create or replace function private.user_devices_claim_token()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.push_token is not null then
    delete from public.user_devices d where d.push_token = new.push_token and d.id <> new.id;
  end if;
  return new;
end;
$$;
revoke execute on function private.user_devices_claim_token() from public, anon, authenticated;
drop trigger if exists user_devices_claim_token on public.user_devices;
create trigger user_devices_claim_token before insert or update of push_token on public.user_devices
  for each row execute function private.user_devices_claim_token();

-- 8g. to_char(timestamptz) depends on the session time zone, so the label is STABLE, not IMMUTABLE.
create or replace function public.verification_label(p_level text, p_at timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select case p_level
    when 'owner'      then 'Verified by owner'
    when 'pilgrim'    then 'Confirmed by pilgrims'
    when 'editor'     then 'Checked by CaminoPlus'
    when 'data_check' then 'Data cross-checked'
    else 'Not verified yet'
  end || case when p_at is null or p_level = 'unverified' then '' else ' · ' || to_char(p_at, 'Mon YYYY') end;
$$;
grant execute on function public.verification_label(text, timestamptz) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Server time on every client-writable table (list = the catalog, see the function)
--    Result when this migration was written (the function returns it), 34 tables:
--      blocks, business_listing_photos, business_listings, business_members, business_verifications,
--      businesses, content_reports, crowd_report_votes, crowd_reports, face_match_consents, favorites,
--      follows, health_daily, health_workouts, hunt_progress, journey_days, journey_private, journeys,
--      marketplace_photos, post_comments, post_likes, post_media, post_saves, posts, stay_availability,
--      stay_photos, stay_prices, stay_review_replies, stay_reviews, tracks, user_devices,
--      user_settings, user_stamps, wearable_connections
-- -----------------------------------------------------------------------------
do $$
begin
  perform private.attach_server_time_triggers();
end $$;

-- Safety net: every public table still has RLS.
do $$
declare
  missing text;
begin
  select string_agg(c.relname, ', ') into missing
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
    and c.relname not in ('spatial_ref_sys');
  if missing is not null then
    raise exception 'RLS not enabled on: %', missing;
  end if;
end $$;

reset client_min_messages;
