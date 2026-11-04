-- =============================================================================
-- CaminoPlus 01: foundation
-- Extensions, the private schema, shared enums and helper trigger functions.
--
-- Conventions used by every later migration:
--   * Primary keys are uuid. Clients may generate them on the device (UUID v4
--     or v7) so a row created offline keeps the same id when the outbox syncs.
--     Upserting on `id` makes every outbox replay idempotent.
--   * created_at / updated_at are server time. updated_at is bumped by a
--     trigger and is the sync cursor ("give me rows with updated_at > X").
--   * client_created_at stores the device time a thing happened (offline
--     stamp, crowd report, post) so the timeline stays correct after sync.
--   * deleted_at is a soft delete (tombstone) so deletes reach other devices.
--   * Every public table has row level security enabled.
-- =============================================================================

create extension if not exists postgis with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Internal schema: helper functions and secrets. Not exposed by the API.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;
alter default privileges in schema private revoke execute on functions from public;

-- -----------------------------------------------------------------------------
-- Shared enums
-- -----------------------------------------------------------------------------
create type public.visibility as enum ('private', 'followers', 'public');

-- -----------------------------------------------------------------------------
-- Trigger helpers
-- -----------------------------------------------------------------------------

-- Bumps updated_at and protects id / created_at from being rewritten.
create or replace function private.touch_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- Same as touch_row for tables whose key is not called `id`.
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- Small key/value table for tunable app settings (free storage, TTLs, ...).
create table public.app_config (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now()
);
alter table public.app_config enable row level security;
create policy "app_config is readable by everyone"
  on public.app_config for select to anon, authenticated using (true);
revoke insert, update, delete on public.app_config from anon, authenticated;

create or replace function private.config_bigint(p_key text, p_default bigint)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (value #>> '{}')::bigint from public.app_config where key = p_key), p_default);
$$;

-- Protects server-maintained columns (counters, moderation, verification)
-- from client writes, while still allowing upserts from the offline outbox.
-- TG_ARGV[0] is a JSON object of {column: value_on_insert}.
--   INSERT by a client role -> the columns are forced to the given values.
--   UPDATE by a client role -> the columns keep their old values.
-- Server code (service_role, security definer triggers) is not affected.
create or replace function private.guard_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  spec jsonb := tg_argv[0]::jsonb;
  keep jsonb;
  k    text;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    keep := spec;
  else
    keep := '{}'::jsonb;
    for k in select jsonb_object_keys(spec) loop
      keep := keep || jsonb_build_object(k, to_jsonb(old) -> k);
    end loop;
  end if;
  new := jsonb_populate_record(new, keep);
  return new;
end;
$$;
