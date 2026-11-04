-- =============================================================================
-- CaminoPlus 02: auth, profiles, social graph, settings
-- Sign-in is Supabase Auth with email (+ password / magic link) and Google.
-- A profile row is created automatically for every new auth user.
-- =============================================================================

create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  username         text not null check (username ~ '^[a-z0-9_.]{3,30}$'),
  display_name     text check (char_length(display_name) <= 60),
  bio              text check (char_length(bio) <= 300),
  avatar_url       text,
  cover_url        text,
  home_country     char(2),
  languages        text[] not null default '{}',
  is_private       boolean not null default false,
  -- server maintained (clients cannot write these, see grants below)
  xp               integer not null default 0,
  level            integer not null default 1,
  followers_count  integer not null default 0,
  following_count  integer not null default 0,
  posts_count      integer not null default 0,
  stamps_count     integer not null default 0,
  km_walked        numeric(9, 2) not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create unique index profiles_username_key on public.profiles (lower(username));
create index profiles_username_trgm on public.profiles using gin (username extensions.gin_trgm_ops);
create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_row();

-- App settings per user (Settings tab).
create table public.user_settings (
  user_id                   uuid primary key references public.profiles (id) on delete cascade,
  units                     text not null default 'metric' check (units in ('metric', 'imperial')),
  language                  text not null default 'en',
  map_style                 text not null default 'default',
  gps_mode                  text not null default 'balanced' check (gps_mode in ('high', 'balanced', 'saver')),
  auto_download_next_stage  boolean not null default true,
  notifications             jsonb not null default '{"social": true, "crowd": true, "hunts": true, "marketing": false}',
  explore_tutorial_seen     smallint not null default 0,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create trigger user_settings_touch before update on public.user_settings
  for each row execute function private.touch_updated_at();

-- Push tokens / installed devices.
create table public.user_devices (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  platform     text not null check (platform in ('ios', 'android', 'web')),
  push_token   text unique,
  app_version  text,
  os_version   text,
  last_seen_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index user_devices_user_idx on public.user_devices (user_id);
create trigger user_devices_touch before update on public.user_devices
  for each row execute function private.touch_row();

-- Follow graph. Following a private profile creates a pending request.
create table public.follows (
  follower_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  status      text not null default 'accepted' check (status in ('pending', 'accepted')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index follows_followee_idx on public.follows (followee_id, status);
create trigger follows_touch before update on public.follows
  for each row execute function private.touch_updated_at();

create table public.blocks (
  blocker_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks (blocked_id);

-- -----------------------------------------------------------------------------
-- Visibility helpers (security definer so they can be used inside policies
-- without recursive RLS checks).
-- -----------------------------------------------------------------------------
create or replace function private.is_blocked(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

create or replace function private.is_follower(p_follower uuid, p_followee uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.follows
    where follower_id = p_follower and followee_id = p_followee and status = 'accepted'
  );
$$;

-- Can the current user see content owned by `p_owner` with visibility `p_vis`?
--   private   -> owner only
--   followers -> owner and accepted followers
--   public    -> everyone signed in, unless the owner's account is private
--                (then followers only, like Instagram)
-- Blocks always win.
create or replace function private.can_see(p_owner uuid, p_vis public.visibility)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is not null and p_owner = me then
    return true;
  end if;
  if p_vis = 'private' or me is null then
    return false;
  end if;
  if private.is_blocked(p_owner, me) then
    return false;
  end if;
  if p_vis = 'public'
     and not coalesce((select is_private from public.profiles where id = p_owner), true) then
    return true;
  end if;
  return private.is_follower(me, p_owner);
end;
$$;

grant execute on function private.is_blocked(uuid, uuid) to authenticated, service_role;
grant execute on function private.is_follower(uuid, uuid) to authenticated, service_role;
grant execute on function private.can_see(uuid, public.visibility) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- New user -> profile + settings. Works for email and Google sign-up.
-- Google puts full_name / name / avatar_url / picture in raw_user_meta_data.
-- -----------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta      jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  base      text;
  candidate text;
begin
  base := lower(regexp_replace(
            coalesce(meta ->> 'username', split_part(coalesce(new.email, ''), '@', 1)),
            '[^a-zA-Z0-9_.]', '', 'g'));
  if char_length(base) < 3 then
    base := 'pilgrim';
  end if;
  base := left(base, 22);
  candidate := base;
  while exists (select 1 from public.profiles where lower(username) = candidate) loop
    candidate := base || (floor(random() * 90000000) + 10000000)::bigint::text;
  end loop;

  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    candidate,
    left(coalesce(meta ->> 'full_name', meta ->> 'name', base), 60),
    coalesce(meta ->> 'avatar_url', meta ->> 'picture')
  );
  insert into public.user_settings (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- -----------------------------------------------------------------------------
-- Follow bookkeeping: pending for private profiles, counters.
-- -----------------------------------------------------------------------------
create or replace function private.follows_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_blocked(new.follower_id, new.followee_id) then
    raise exception 'cannot follow this user';
  end if;
  new.status := case
    when (select is_private from public.profiles where id = new.followee_id) then 'pending'
    else 'accepted'
  end;
  return new;
end;
$$;
create trigger follows_before_insert before insert on public.follows
  for each row execute function private.follows_before_insert();

create or replace function private.follows_counters()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select coalesce(new.follower_id, old.follower_id) as follower,
           coalesce(new.followee_id, old.followee_id) as followee
  loop
    update public.profiles p set
      following_count = (select count(*) from public.follows f where f.follower_id = r.follower and f.status = 'accepted')
    where p.id = r.follower;
    update public.profiles p set
      followers_count = (select count(*) from public.follows f where f.followee_id = r.followee and f.status = 'accepted')
    where p.id = r.followee;
  end loop;
  return null;
end;
$$;
create trigger follows_counters after insert or update or delete on public.follows
  for each row execute function private.follows_counters();

-- Blocking someone removes follows in both directions.
create or replace function private.blocks_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.follows
  where (follower_id = new.blocker_id and followee_id = new.blocked_id)
     or (follower_id = new.blocked_id and followee_id = new.blocker_id);
  return null;
end;
$$;
create trigger blocks_after_insert after insert on public.blocks
  for each row execute function private.blocks_after_insert();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.user_settings enable row level security;
alter table public.user_devices  enable row level security;
alter table public.follows       enable row level security;
alter table public.blocks        enable row level security;

-- Basic profile card is visible to signed-in users unless blocked.
create policy "profiles readable unless blocked"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (deleted_at is null and not private.is_blocked(id, (select auth.uid())))
  );
create policy "profiles updatable by owner"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Profiles are created by the auth trigger only; clients edit their own
-- descriptive columns, never XP or counters.
revoke insert, delete on public.profiles from anon, authenticated;
create trigger profiles_guard before update on public.profiles
  for each row execute function private.guard_columns(
    '{"xp": 0, "level": 1, "followers_count": 0, "following_count": 0, "posts_count": 0, "stamps_count": 0, "km_walked": 0, "deleted_at": null}');

create policy "settings owner only"
  on public.user_settings for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "devices owner only"
  on public.user_devices for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "follows visible to the two people or when accepted"
  on public.follows for select to authenticated
  using (
    follower_id = (select auth.uid())
    or followee_id = (select auth.uid())
    or (status = 'accepted'
        and private.can_see(followee_id, 'public')
        and not private.is_blocked(follower_id, (select auth.uid())))
  );
create policy "follow as yourself"
  on public.follows for insert to authenticated
  with check (follower_id = (select auth.uid()));
create policy "followee accepts requests"
  on public.follows for update to authenticated
  using (followee_id = (select auth.uid()))
  with check (followee_id = (select auth.uid()));
create policy "either side removes a follow"
  on public.follows for delete to authenticated
  using (follower_id = (select auth.uid()) or followee_id = (select auth.uid()));
revoke update on public.follows from authenticated;
grant update (status) on public.follows to authenticated;

create policy "blocks owner only"
  on public.blocks for all to authenticated
  using (blocker_id = (select auth.uid()))
  with check (blocker_id = (select auth.uid()));
