-- =============================================================================
-- CaminoPlus: new pilgrims get a neutral username; picture URLs only from our storage or Google
--
-- WHAT
--   1. private.handle_new_user (runs when somebody signs up) no longer builds the public username from the
--      e-mail address. john.smith@example.com used to become @john.smith, and the same text was the display
--      name when sign-up gave no name: that published part of an e-mail address. Now:
--        username     = the 'username' the sign-up itself asked for (raw_user_meta_data.username, cleaned),
--                       else 'pilgrim' + 8 random digits; on a clash new digits are drawn (unique index
--                       profiles_username_key on lower(username), retried on unique_violation, so two sign-ups
--                       at the same moment cannot both fail)
--        display_name = full_name or name from sign-up (email sign-up sends full_name, Google sends both),
--                       else null (the app then shows the username)
--        avatar_url   = the provider's picture only when it is an allowed URL (see 2), else null
--      Existing profiles are NOT touched.
--   2. private.is_allowed_image_url(text): null, '', this project's public storage URLs
--      (https://xgikdabgdqmbdgagowva.supabase.co/storage/v1/object/public/...), Google profile photos
--      (https://lh3.googleusercontent.com/...) and the local development stack
--      (http://127.0.0.1:54321/... or http://localhost:54321/...). A CHECK with it is added on
--        public.profiles.avatar_url, public.profiles.cover_url, public.conversations.avatar_url (group photo)
--        and public.journeys.cover_url (same risk: a followers-visible picture any client could point anywhere).
--
-- WHY
--   Any client could set avatar_url to https://tracker.example/pixel.png: every pilgrim who then sees that
--   avatar (search, chat, friends list) would load it, which leaks their IP address and the time they looked
--   to a stranger, and could show any image. The app only ever stores getPublicUrl() of the avatars bucket
--   (mobile/src/lib/avatar.ts) or the Google photo that sign-in gives.
--
-- LIVE DATA CHECKED 2026-11-08: 1 profile has an avatar_url (this project's avatars bucket), 0 cover_url,
--   0 group avatar_url, 0 journey cover_url. All pass, so a plain CHECK is safe (added NOT VALID, then
--   VALIDATE, so a row that sneaks in before apply fails loudly at VALIDATE instead of half-applying).
--
-- WHO IS AFFECTED
--   New sign-ups (neutral username). Anybody who tries to save a picture URL from elsewhere gets
--   SQLSTATE 23514 (check_violation). If the project ever moves to a custom domain for storage, add that
--   prefix to private.is_allowed_image_url first.
--
-- DESTRUCTIVE?  No. No row is changed; only new writes are checked.
--
-- UNDO
--   alter table public.profiles drop constraint if exists profiles_avatar_url_allowed,
--     drop constraint if exists profiles_cover_url_allowed;
--   alter table public.conversations drop constraint if exists conversations_avatar_url_allowed;
--   alter table public.journeys drop constraint if exists journeys_cover_url_allowed;
--   re-run private.handle_new_user from 20261104150100_profiles_auth.sql;
--   drop function private.is_allowed_image_url(text);
--
-- Re-runnable. Proof: dev/backend_hardening_smoke.sql.
-- =============================================================================

create or replace function private.is_allowed_image_url(p_url text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_url is null
      or p_url = ''
      or (char_length(p_url) <= 1000
          and p_url !~ '[[:space:]\\]'
          and (p_url ~ '^https://xgikdabgdqmbdgagowva\.supabase\.co/storage/v1/object/public/[a-z0-9-]+/'
               or p_url ~ '^https://lh3\.googleusercontent\.com/'
               or p_url ~ '^http://(127\.0\.0\.1|localhost):54321/storage/v1/object/public/[a-z0-9-]+/'));
$$;
revoke execute on function private.is_allowed_image_url(text) from public;
-- a CHECK runs as the role that writes the row
grant execute on function private.is_allowed_image_url(text) to anon, authenticated, service_role;

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
  picture   text;
  tries     integer := 0;
begin
  -- a username the sign-up asked for explicitly; never anything taken from the e-mail address
  base := left(lower(regexp_replace(coalesce(meta ->> 'username', ''), '[^a-zA-Z0-9_.]', '', 'g')), 22);
  if char_length(base) < 3 then
    base := null;
  end if;
  picture := coalesce(meta ->> 'avatar_url', meta ->> 'picture');
  if not private.is_allowed_image_url(picture) then
    picture := null;
  end if;

  loop
    tries := tries + 1;
    candidate := case
      when base is not null and tries = 1 then base
      when base is not null then base || lpad(floor(random() * 100000000)::bigint::text, 8, '0')
      else 'pilgrim' || lpad(floor(random() * 100000000)::bigint::text, 8, '0')
    end;
    if not exists (select 1 from public.profiles where lower(username) = candidate) then
      begin
        insert into public.profiles (id, username, display_name, avatar_url)
        values (
          new.id,
          candidate,
          left(nullif(btrim(coalesce(meta ->> 'full_name', meta ->> 'name', '')), ''), 60),
          picture
        );
        exit;
      exception when unique_violation then
        if exists (select 1 from public.profiles where id = new.id) then
          raise;   -- not a username clash
        end if;
        -- somebody took the same name a moment ago: draw again
      end;
    end if;
    if tries >= 20 then
      raise exception 'could not pick a free username' using errcode = '23505';
    end if;
  end loop;

  insert into public.user_settings (user_id) values (new.id);
  return new;
end;
$$;

alter table public.profiles drop constraint if exists profiles_avatar_url_allowed;
alter table public.profiles add constraint profiles_avatar_url_allowed
  check (private.is_allowed_image_url(avatar_url)) not valid;
alter table public.profiles validate constraint profiles_avatar_url_allowed;

alter table public.profiles drop constraint if exists profiles_cover_url_allowed;
alter table public.profiles add constraint profiles_cover_url_allowed
  check (private.is_allowed_image_url(cover_url)) not valid;
alter table public.profiles validate constraint profiles_cover_url_allowed;

alter table public.conversations drop constraint if exists conversations_avatar_url_allowed;
alter table public.conversations add constraint conversations_avatar_url_allowed
  check (private.is_allowed_image_url(avatar_url)) not valid;
alter table public.conversations validate constraint conversations_avatar_url_allowed;

alter table public.journeys drop constraint if exists journeys_cover_url_allowed;
alter table public.journeys add constraint journeys_cover_url_allowed
  check (private.is_allowed_image_url(cover_url)) not valid;
alter table public.journeys validate constraint journeys_cover_url_allowed;
