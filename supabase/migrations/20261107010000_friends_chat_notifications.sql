-- =============================================================================
-- CaminoPlus: friends, chat (direct + group) and notifications
--
--   friendships            mutual friends: A asks, B accepts, only then they are friends.
--                          One row per pair (user_a < user_b). Not the follow model.
--   notifications          the Inbox "Notifications" tab (server written, clients only read
--                          and mark as read)
--   conversations          direct chats and group chats share these three tables
--   conversation_members   who is in, role, read cursor, mute
--   messages               text / image / system messages, soft deleted ("unsend")
--
-- Everything that changes social state goes through the RPCs at the end of each section,
-- so the rules (mutual friends, friends-only chat, group limits, blocks) live in one place.
-- Clients only read the tables, and insert messages (RLS decides who may send).
--
-- Visibility: `visibility = 'followers'` now means "followers and friends" (private.can_see).
-- Block: removes a friendship or pending request and stops direct chat sending.
--
-- Re-runnable: tables, indexes, policies and triggers are created idempotently.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Small helpers
-- -----------------------------------------------------------------------------

-- Name shown in notification and system message texts.
create or replace function private.display_name_of(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select coalesce(nullif(btrim(p.display_name), ''), p.username) from public.profiles p where p.id = p_user),
    'A pilgrim');
$$;

-- -----------------------------------------------------------------------------
-- Profiles: friends counter (server maintained). The guard trigger is recreated with the
-- full existing spec plus friends_count, so clients cannot write it.
-- -----------------------------------------------------------------------------
alter table public.profiles add column if not exists friends_count integer not null default 0;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function private.guard_columns(
    '{"xp": 0, "level": 1, "followers_count": 0, "following_count": 0, "posts_count": 0, "stamps_count": 0, "km_walked": 0, "deleted_at": null, "friends_count": 0}');

-- =============================================================================
-- 1. FRIENDSHIPS
-- =============================================================================
create table if not exists public.friendships (
  user_a       uuid not null references public.profiles (id) on delete cascade,
  user_b       uuid not null references public.profiles (id) on delete cascade,
  requested_by uuid not null,
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),   -- when the request was sent
  responded_at timestamptz,                          -- when it was accepted
  updated_at   timestamptz not null default now(),
  -- surrogate id: lets Realtime DELETE events carry a random uuid instead of the pair of people
  id           uuid not null default gen_random_uuid(),
  primary key (user_a, user_b),
  constraint friendships_canonical_order check (user_a < user_b),
  constraint friendships_requester_is_a_member check (requested_by = user_a or requested_by = user_b)
);
create unique index if not exists friendships_id_key on public.friendships (id);
alter table public.friendships replica identity using index friendships_id_key;
create index if not exists friendships_user_b_idx on public.friendships (user_b, status);
create index if not exists friendships_pending_by_idx on public.friendships (requested_by) where status = 'pending';

drop trigger if exists friendships_touch on public.friendships;
create trigger friendships_touch before update on public.friendships
  for each row execute function private.touch_updated_at();

-- Accepted friends only.
create or replace function private.is_friend(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
    where f.user_a = least(a, b) and f.user_b = greatest(a, b) and f.status = 'accepted'
  );
$$;

-- An accepted friend counts like an accepted follower (visibility 'followers' = friends + followers).
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
  return private.is_follower(me, p_owner) or private.is_friend(me, p_owner);
end;
$$;
-- (private.can_see_journey delegates to can_see, so journeys, days, tracks and stamps follow along.)

-- Friend counter on both profiles.
create or replace function private.friendships_counters()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a uuid := case when tg_op = 'DELETE' then old.user_a else new.user_a end;
  v_b uuid := case when tg_op = 'DELETE' then old.user_b else new.user_b end;
  v_u uuid;
begin
  -- requests (pending rows) do not change anybody's count
  if (tg_op = 'INSERT' and new.status <> 'accepted')
     or (tg_op = 'DELETE' and old.status <> 'accepted')
     or (tg_op = 'UPDATE' and old.status = new.status) then
    return null;
  end if;
  foreach v_u in array array[v_a, v_b] loop
    update public.profiles p set friends_count = (
      select count(*) from public.friendships f
      where f.status = 'accepted' and (f.user_a = v_u or f.user_b = v_u)
    ) where p.id = v_u;
  end loop;
  return null;
end;
$$;
drop trigger if exists friendships_counters on public.friendships;
create trigger friendships_counters after insert or update of status or delete on public.friendships
  for each row execute function private.friendships_counters();

-- =============================================================================
-- 2. NOTIFICATIONS (written by the server only)
-- =============================================================================
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,   -- recipient
  kind       text not null check (kind in (
               'friend_request', 'friend_accepted', 'group_added', 'post_like', 'post_comment',
               'achievement', 'system')),
  actor_id   uuid references public.profiles (id) on delete set null,
  -- title is a full sentence that starts with the actor's name ("Ana sent you a friend request");
  -- body is optional detail (comment text, post snippet, "+50 XP")
  title      text not null check (char_length(title) between 1 and 200),
  body       text check (char_length(body) <= 500),
  data       jsonb not null default '{}',     -- {"friend_id"|"conversation_id"|"post_id"|"achievement_slug": ...}
  -- one row per (recipient, kind, actor, subject) so spamming likes does not spam; null = never deduped
  dedupe_key text,
  read_at    timestamptz,
  created_at timestamptz not null default now(),   -- time of the latest occurrence (refreshed notifications move up)
  updated_at timestamptz not null default now()
);
create unique index if not exists notifications_dedupe_key on public.notifications (user_id, dedupe_key);
create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where read_at is null;
create index if not exists notifications_actor_idx on public.notifications (actor_id) where actor_id is not null;

-- Clients may only flip read_at on their own rows (column grants below); the server clock sets
-- the time. Server code may refresh created_at (a repeated notification moves to the top).
create or replace function private.notifications_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.id := old.id;
  new.updated_at := now();
  if current_user in ('anon', 'authenticated') then
    new.user_id := old.user_id;
    new.kind := old.kind;
    new.actor_id := old.actor_id;
    new.title := old.title;
    new.body := old.body;
    new.data := old.data;
    new.dedupe_key := old.dedupe_key;
    new.created_at := old.created_at;
    if new.read_at is not null then
      new.read_at := coalesce(old.read_at, now());
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists notifications_before_update on public.notifications;
create trigger notifications_before_update before update on public.notifications
  for each row execute function private.notifications_before_update();

-- The one place that writes notifications. p_refresh: a repeat of the same event re-notifies
-- (unread again, moves to the top) instead of being ignored.
create or replace function private.notify(
  p_user    uuid,
  p_kind    text,
  p_actor   uuid,
  p_title   text,
  p_body    text default null,
  p_data    jsonb default '{}',
  p_refresh boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  if p_user is null or p_user = p_actor then
    return;
  end if;
  if p_actor is not null and private.is_blocked(p_user, p_actor) then
    return;
  end if;
  if not exists (select 1 from public.profiles where id = p_user and deleted_at is null) then
    return;
  end if;
  v_key := case when p_kind = 'system' then null else
    p_kind || ':' || coalesce(p_actor::text, '-') || ':' ||
    coalesce(p_data ->> 'post_id', p_data ->> 'friend_id', p_data ->> 'conversation_id',
             p_data ->> 'achievement_slug', '-')
  end;
  if p_refresh then
    insert into public.notifications (user_id, kind, actor_id, title, body, data, dedupe_key)
    values (p_user, p_kind, p_actor, p_title, p_body, coalesce(p_data, '{}'), v_key)
    on conflict (user_id, dedupe_key) do update set
      title = excluded.title, body = excluded.body, data = excluded.data,
      actor_id = excluded.actor_id, read_at = null, created_at = now();
  else
    insert into public.notifications (user_id, kind, actor_id, title, body, data, dedupe_key)
    values (p_user, p_kind, p_actor, p_title, p_body, coalesce(p_data, '{}'), v_key)
    on conflict (user_id, dedupe_key) do nothing;
  end if;
end;
$$;

-- Someone liked / commented on my post.
create or replace function private.post_likes_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner   uuid;
  v_snippet text;
begin
  select p.user_id, left(p.body, 80) into v_owner, v_snippet
  from public.posts p where p.id = new.post_id and p.deleted_at is null;
  if v_owner is not null then
    perform private.notify(v_owner, 'post_like', new.user_id,
      private.display_name_of(new.user_id) || ' liked your post',
      nullif(btrim(v_snippet), ''), jsonb_build_object('post_id', new.post_id), false);
  end if;
  return null;
end;
$$;
drop trigger if exists post_likes_notify on public.post_likes;
create trigger post_likes_notify after insert on public.post_likes
  for each row execute function private.post_likes_notify();

create or replace function private.post_comments_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if new.deleted_at is not null or new.moderation_status <> 'ok' then
    return null;
  end if;
  select p.user_id into v_owner from public.posts p where p.id = new.post_id and p.deleted_at is null;
  if v_owner is not null then
    perform private.notify(v_owner, 'post_comment', new.user_id,
      private.display_name_of(new.user_id) || ' commented on your post',
      left(new.body, 140), jsonb_build_object('post_id', new.post_id, 'comment_id', new.id), true);
  end if;
  return null;
end;
$$;
drop trigger if exists post_comments_notify on public.post_comments;
create trigger post_comments_notify after insert on public.post_comments
  for each row execute function private.post_comments_notify();

-- A badge was earned (private.grant_achievement inserts here exactly once per user and badge).
create or replace function private.user_achievements_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.achievements;
begin
  select * into a from public.achievements where id = new.achievement_id;
  if found then
    perform private.notify(new.user_id, 'achievement', null,
      'You unlocked ' || a.name,
      case when a.xp_reward > 0 then 'You earned +' || a.xp_reward || ' XP.' end,
      jsonb_build_object('achievement_slug', a.slug, 'achievement_id', a.id), false);
  end if;
  return null;
end;
$$;
drop trigger if exists user_achievements_notify on public.user_achievements;
create trigger user_achievements_notify after insert on public.user_achievements
  for each row execute function private.user_achievements_notify();

-- Block: friendship and pending request go away, and so do their notifications.
create or replace function private.blocks_remove_friendship()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('friendship:' || least(new.blocker_id, new.blocked_id)::text
    || ':' || greatest(new.blocker_id, new.blocked_id)::text, 0));
  delete from public.friendships
  where user_a = least(new.blocker_id, new.blocked_id) and user_b = greatest(new.blocker_id, new.blocked_id);
  delete from public.notifications
  where kind = 'friend_request'
    and ((user_id = new.blocker_id and actor_id = new.blocked_id)
      or (user_id = new.blocked_id and actor_id = new.blocker_id));
  return null;
end;
$$;
drop trigger if exists blocks_remove_friendship on public.blocks;
create trigger blocks_remove_friendship after insert on public.blocks
  for each row execute function private.blocks_remove_friendship();

-- =============================================================================
-- 3. FRIEND RPCs
-- Errors carry a stable machine code in `hint` (and a friendly sentence in the message).
-- =============================================================================
create or replace function public.send_friend_request(p_user uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me         uuid := auth.uid();
  v_a        uuid;
  v_b        uuid;
  f          public.friendships;
  v_pending  integer;
begin
  if me is null then
    raise exception 'Sign in to continue.' using errcode = '42501', hint = 'not_signed_in';
  end if;
  if p_user is null or p_user = me then
    raise exception 'You cannot add yourself as a friend.' using errcode = '22023', hint = 'friend_self';
  end if;

  v_a := least(me, p_user);
  v_b := greatest(me, p_user);
  -- serialises two people asking each other at the same moment, and a block against a request
  perform pg_advisory_xact_lock(hashtextextended('friendship:' || v_a::text || ':' || v_b::text, 0));
  -- unknown, deleted and blocked (either way) look the same, so nobody learns who blocked whom
  if not exists (select 1 from public.profiles where id = p_user and deleted_at is null)
     or private.is_blocked(me, p_user) then
    raise exception 'We could not find that pilgrim.' using errcode = 'P0002', hint = 'not_found';
  end if;

  select * into f from public.friendships where user_a = v_a and user_b = v_b;
  if found then
    if f.status = 'accepted' then
      return 'already_friends';
    end if;
    if f.requested_by = me then
      return 'pending';
    end if;
    -- they asked me first: asking back is the same as saying yes
    update public.friendships set status = 'accepted', responded_at = now()
    where user_a = v_a and user_b = v_b;
    update public.notifications set read_at = coalesce(read_at, now())
    where user_id = me and kind = 'friend_request' and actor_id = p_user;
    perform private.notify(p_user, 'friend_accepted', me,
      private.display_name_of(me) || ' accepted your friend request',
      null, jsonb_build_object('friend_id', me), true);
    return 'accepted';
  end if;

  select count(*) into v_pending from public.friendships where requested_by = me and status = 'pending';
  if v_pending >= 50 then
    raise exception 'You have too many requests waiting. Wait for answers before sending more.'
      using errcode = '54000', hint = 'friend_request_limit';
  end if;
  insert into public.friendships (user_a, user_b, requested_by) values (v_a, v_b, me);
  perform private.notify(p_user, 'friend_request', me,
    private.display_name_of(me) || ' sent you a friend request',
    null, jsonb_build_object('friend_id', me), true);
  return 'pending';
end;
$$;

create or replace function public.respond_friend_request(p_user uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me  uuid := auth.uid();
  v_a uuid;
  v_b uuid;
  f   public.friendships;
begin
  if me is null then
    raise exception 'Sign in to continue.' using errcode = '42501', hint = 'not_signed_in';
  end if;
  if p_user is null or p_accept is null then
    raise exception 'Accept or decline a request from a pilgrim.' using errcode = '22023', hint = 'invalid_input';
  end if;
  v_a := least(me, p_user);
  v_b := greatest(me, p_user);
  perform pg_advisory_xact_lock(hashtextextended('friendship:' || v_a::text || ':' || v_b::text, 0));

  select * into f from public.friendships where user_a = v_a and user_b = v_b and me <> p_user;
  if not found then
    if not p_accept then
      return 'declined';   -- nothing left to decline (already declined or cancelled)
    end if;
    raise exception 'There is no friend request from this pilgrim.' using errcode = 'P0002', hint = 'no_pending_request';
  end if;
  if f.status = 'accepted' then
    if p_accept then
      return 'accepted';   -- double tap or retry
    end if;
    raise exception 'You are already friends.' using errcode = '22023', hint = 'already_friends';
  end if;
  if f.requested_by = me then
    raise exception 'Only the pilgrim who was asked can answer a request.' using errcode = '42501', hint = 'not_allowed';
  end if;

  if p_accept then
    update public.friendships set status = 'accepted', responded_at = now()
    where user_a = v_a and user_b = v_b;
    update public.notifications set read_at = coalesce(read_at, now())
    where user_id = me and kind = 'friend_request' and actor_id = p_user;
    perform private.notify(p_user, 'friend_accepted', me,
      private.display_name_of(me) || ' accepted your friend request',
      null, jsonb_build_object('friend_id', me), true);
    return 'accepted';
  end if;

  -- declined: the row goes away so they can ask again later; they are not told
  delete from public.friendships where user_a = v_a and user_b = v_b;
  delete from public.notifications where user_id = me and kind = 'friend_request' and actor_id = p_user;
  return 'declined';
end;
$$;

create or replace function public.cancel_friend_request(p_user uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me  uuid := auth.uid();
  v_a uuid;
  v_b uuid;
  f   public.friendships;
begin
  if me is null then
    raise exception 'Sign in to continue.' using errcode = '42501', hint = 'not_signed_in';
  end if;
  if p_user is null then
    raise exception 'Pick a pilgrim.' using errcode = '22023', hint = 'invalid_input';
  end if;
  v_a := least(me, p_user);
  v_b := greatest(me, p_user);
  perform pg_advisory_xact_lock(hashtextextended('friendship:' || v_a::text || ':' || v_b::text, 0));

  select * into f from public.friendships where user_a = v_a and user_b = v_b and me <> p_user;
  if not found then
    return 'cancelled';   -- already gone: retries are harmless
  end if;
  if f.status = 'accepted' then
    raise exception 'You are already friends.' using errcode = '22023', hint = 'already_friends';
  end if;
  if f.requested_by <> me then
    raise exception 'Only the pilgrim who sent a request can cancel it.' using errcode = '42501', hint = 'not_allowed';
  end if;
  delete from public.friendships where user_a = v_a and user_b = v_b;
  delete from public.notifications where user_id = p_user and kind = 'friend_request' and actor_id = me;
  return 'cancelled';
end;
$$;

create or replace function public.remove_friend(p_user uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me  uuid := auth.uid();
  v_a uuid;
  v_b uuid;
  f   public.friendships;
begin
  if me is null then
    raise exception 'Sign in to continue.' using errcode = '42501', hint = 'not_signed_in';
  end if;
  if p_user is null then
    raise exception 'Pick a pilgrim.' using errcode = '22023', hint = 'invalid_input';
  end if;
  v_a := least(me, p_user);
  v_b := greatest(me, p_user);
  perform pg_advisory_xact_lock(hashtextextended('friendship:' || v_a::text || ':' || v_b::text, 0));

  select * into f from public.friendships where user_a = v_a and user_b = v_b and me <> p_user;
  if not found then
    return 'removed';
  end if;
  if f.status <> 'accepted' then
    raise exception 'You are not friends with this pilgrim yet.' using errcode = '22023', hint = 'not_friends';
  end if;
  delete from public.friendships where user_a = v_a and user_b = v_b;
  return 'removed';
end;
$$;

create or replace function public.list_friends(p_limit integer default 200, p_offset integer default 0)
returns table (id uuid, username text, display_name text, avatar_url text, km_walked numeric, since timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.km_walked::numeric,
         coalesce(f.responded_at, f.created_at)
  from public.friendships f
  join public.profiles p on p.id = case when f.user_a = auth.uid() then f.user_b else f.user_a end
  where f.status = 'accepted'
    and (f.user_a = auth.uid() or f.user_b = auth.uid())
    and p.deleted_at is null
  order by lower(coalesce(nullif(btrim(p.display_name), ''), p.username)), p.username
  limit least(greatest(coalesce(p_limit, 200), 1), 500)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function public.list_friend_requests()
returns table (direction text, id uuid, username text, display_name text, avatar_url text, requested_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select case when f.requested_by = auth.uid() then 'outgoing' else 'incoming' end,
         p.id, p.username, p.display_name, p.avatar_url, f.created_at
  from public.friendships f
  join public.profiles p on p.id = case when f.user_a = auth.uid() then f.user_b else f.user_a end
  where f.status = 'pending'
    and (f.user_a = auth.uid() or f.user_b = auth.uid())
    and p.deleted_at is null
  order by f.created_at desc
  limit 200;
$$;

-- Find pilgrims by username (prefix) or display name (contains). Never returns email, yourself,
-- blocked people (either way) or deleted profiles. Each branch reads at most 100 rows through an
-- index (prefix: btree on lower(username); contains: trigram), so a very common query stays cheap.
create index if not exists profiles_username_prefix
  on public.profiles (lower(username) text_pattern_ops);
create index if not exists profiles_display_name_trgm
  on public.profiles using gin (display_name extensions.gin_trgm_ops);

create or replace function public.search_pilgrims(p_query text, p_limit integer default 20)
returns table (id uuid, username text, display_name text, avatar_url text, is_private boolean, friend_status text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me      uuid := auth.uid();
  v_q     text := btrim(coalesce(p_query, ''));
  v_lq    text;
  v_like  text;
begin
  if me is null then
    raise exception 'Sign in to continue.' using errcode = '42501', hint = 'not_signed_in';
  end if;
  if left(v_q, 1) = '@' then
    v_q := btrim(substr(v_q, 2));
  end if;
  if char_length(v_q) < 2 then
    return;
  end if;
  v_q := left(v_q, 60);
  v_lq := lower(v_q);
  -- literal match: % _ and \ typed by the user are not wildcards
  v_like := replace(replace(replace(v_lq, '\', '\\'), '%', '\%'), '_', '\_');

  return query
  with cand as (
    (select c.id from public.profiles c
     where c.deleted_at is null and lower(c.username) like v_like || '%' escape '\'
     order by lower(c.username) limit 100)
    union
    (select c.id from public.profiles c
     where c.deleted_at is null and c.display_name ilike '%' || v_like || '%' escape '\'
     limit 100)
  )
  select p.id, p.username, p.display_name, p.avatar_url, p.is_private,
         case when f.status = 'accepted' then 'friends'
              when f.status = 'pending' and f.requested_by = me then 'pending_out'
              when f.status = 'pending' then 'pending_in'
              else 'none' end
  from cand
  join public.profiles p on p.id = cand.id
  left join public.friendships f on f.user_a = least(me, p.id) and f.user_b = greatest(me, p.id)
  where p.id <> me
    and not private.is_blocked(me, p.id)
  order by (lower(p.username) = v_lq) desc,
           (lower(p.username) like v_like || '%' escape '\') desc,
           extensions.similarity(coalesce(p.display_name, p.username), v_lq) desc,
           lower(coalesce(nullif(btrim(p.display_name), ''), p.username)),
           p.username
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

-- =============================================================================
-- 4. CHAT TABLES
-- =============================================================================
create table if not exists public.conversations (
  id                   uuid primary key default gen_random_uuid(),
  kind                 text not null check (kind in ('direct', 'group')),
  title                text check (char_length(btrim(title)) between 1 and 60),
  avatar_url           text check (char_length(avatar_url) <= 1000),
  created_by           uuid references public.profiles (id) on delete set null,
  -- direct chats only: least(a,b) || ':' || greatest(a,b), so a pair has exactly one chat
  direct_key           text unique,
  -- denormalised by trigger for the inbox (no foreign keys on purpose: no circular FK and no
  -- scan of conversations when messages are deleted)
  last_message_id      uuid,
  last_message_at      timestamptz,
  last_message_preview text,
  last_message_sender  uuid,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz,
  constraint conversations_kind_shape check (
    (kind = 'direct' and direct_key is not null and title is null)
    or (kind = 'group' and direct_key is null and title is not null))
);
create index if not exists conversations_created_by_idx on public.conversations (created_by);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  role            text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at       timestamptz not null default now(),   -- history starts here
  left_at         timestamptz,                          -- null while a member
  last_read_at    timestamptz not null default now(),   -- read cursor, doubles as read receipt
  muted_until     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  id              uuid not null default gen_random_uuid(),   -- see friendships.id
  primary key (conversation_id, user_id)
);
create unique index if not exists conversation_members_id_key on public.conversation_members (id);
alter table public.conversation_members replica identity using index conversation_members_id_key;
create index if not exists conversation_members_user_idx on public.conversation_members (user_id, conversation_id);
-- exactly one active owner per conversation
create unique index if not exists conversation_members_one_owner
  on public.conversation_members (conversation_id) where role = 'owner' and left_at is null;

create table if not exists public.messages (
  id                uuid primary key default gen_random_uuid(),
  conversation_id   uuid not null references public.conversations (id) on delete cascade,
  sender_id         uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind              text not null default 'text' check (kind in ('text', 'image', 'system')),
  body              text check (char_length(body) <= 4000),
  media_path        text check (char_length(media_path) <= 400),   -- user-media bucket
  reply_to          uuid references public.messages (id) on delete set null,
  client_created_at timestamptz,
  created_at        timestamptz not null default clock_timestamp(),   -- distinct per row: stable message order
  updated_at        timestamptz not null default clock_timestamp(),
  edited_at         timestamptz,
  deleted_at        timestamptz,                                   -- unsend: body and media_path are nulled
  constraint messages_content_shape check (
    deleted_at is not null
    or (kind = 'text' and body is not null and char_length(btrim(body)) > 0 and media_path is null)
    or (kind = 'image' and media_path is not null)
    or (kind = 'system' and body is not null and media_path is null)),
  -- a chat image lives in the sender's own folder, under this conversation
  constraint messages_media_path_shape check (
    media_path is null
    or media_path ~ ('^' || sender_id::text || '/chat/' || conversation_id::text || '/[^/]+$'))
);
create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at desc);
create index if not exists messages_sender_idx on public.messages (sender_id, created_at desc);
create index if not exists messages_reply_to_idx on public.messages (reply_to) where reply_to is not null;
create index if not exists messages_media_path_idx on public.messages (media_path) where media_path is not null;

drop trigger if exists conversations_touch on public.conversations;
create trigger conversations_touch before update on public.conversations
  for each row execute function private.touch_row();
drop trigger if exists conversation_members_touch on public.conversation_members;
create trigger conversation_members_touch before update on public.conversation_members
  for each row execute function private.touch_updated_at();
drop trigger if exists messages_touch on public.messages;
create trigger messages_touch before update on public.messages
  for each row execute function private.touch_row();

-- -----------------------------------------------------------------------------
-- Chat helpers (used by policies and triggers)
-- -----------------------------------------------------------------------------

-- Current member (left_at is null). Security definer: policies on conversation_members cannot
-- query conversation_members themselves without recursing.
create or replace function private.is_conversation_member(p_conversation uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_members m
    where m.conversation_id = p_conversation and m.user_id = p_user and m.left_at is null
  );
$$;

-- May this user write into this conversation right now?
--   member, not left, conversation alive; direct chat: the other person must still be an
--   accepted friend (not blocked, not deleted). Groups only need membership.
create or replace function private.can_send_message(p_conversation uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversations c
    join public.conversation_members me
      on me.conversation_id = c.id and me.user_id = p_user and me.left_at is null
    where c.id = p_conversation
      and c.deleted_at is null
      and (
        c.kind = 'group'
        or exists (
          select 1
          from public.conversation_members o
          join public.profiles pr on pr.id = o.user_id and pr.deleted_at is null
          where o.conversation_id = c.id and o.user_id <> p_user and o.left_at is null
            and private.is_friend(p_user, o.user_id)
            and not private.is_blocked(p_user, o.user_id)
        )
      )
  );
$$;

-- A reply must point at a message of the same conversation. (Security definer: a policy on
-- messages cannot query messages itself without recursing.)
create or replace function private.reply_target_ok(p_reply uuid, p_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.messages r where r.id = p_reply and r.conversation_id = p_conversation);
$$;

-- Abuse guard: 60 messages per minute per sender. Not stable on purpose: a bulk insert must see
-- the rows it has already inserted. An id that already exists is a client retry, never refused.
create or replace function private.messages_rate_ok(p_sender uuid, p_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (select 1 from public.messages where id = p_id)
      or (select count(*) from public.messages m
          where m.sender_id = p_sender and m.kind <> 'system'
            and m.created_at > clock_timestamp() - interval '1 minute') < 60;
$$;

-- Text shown in the inbox row.
create or replace function private.message_preview(p_kind text, p_body text, p_deleted boolean default false)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_deleted then 'Message unsent'
    when p_kind = 'image' then
      case when nullif(btrim(coalesce(p_body, '')), '') is null then 'Photo'
           else 'Photo: ' || left(regexp_replace(btrim(p_body), '\s+', ' ', 'g'), 100) end
    else left(regexp_replace(btrim(coalesce(p_body, '')), '\s+', ' ', 'g'), 120)
  end;
$$;

-- Groups: after somebody is gone (left, removed, account deleted) make sure the group still
-- has an owner, or close it when nobody is left. Owner leaves -> oldest admin, else oldest member.
create or replace function private.group_after_member_gone(p_conversation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_remaining integer;
  v_has_owner boolean;
  v_new_owner uuid;
begin
  select count(*), coalesce(bool_or(role = 'owner'), false) into v_remaining, v_has_owner
  from public.conversation_members
  where conversation_id = p_conversation and left_at is null;
  if v_remaining = 0 then
    update public.conversations set deleted_at = coalesce(deleted_at, now())
    where id = p_conversation and kind = 'group';
    return;
  end if;
  if not v_has_owner then
    select user_id into v_new_owner
    from public.conversation_members
    where conversation_id = p_conversation and left_at is null
    order by (role = 'admin') desc, joined_at, user_id
    limit 1;
    update public.conversation_members set role = 'owner'
    where conversation_id = p_conversation and user_id = v_new_owner;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Message triggers
-- -----------------------------------------------------------------------------

-- Clients get the server clock, no tombstones, and the rate limit. Server code (security definer
-- RPCs, service role) is not affected, like private.guard_columns.
create or replace function private.messages_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.created_at := clock_timestamp();
    new.updated_at := new.created_at;
    new.edited_at := null;
    new.deleted_at := null;
    if new.client_created_at is not null then
      new.client_created_at := least(new.client_created_at, now());   -- never from the future
    end if;
    if not private.messages_rate_ok(new.sender_id, new.id) then
      raise exception 'You are sending messages too fast. Wait a moment and try again.'
        using errcode = '54000', hint = 'rate_limited';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists messages_before_insert on public.messages;
create trigger messages_before_insert before insert on public.messages
  for each row execute function private.messages_before_insert();

-- Inbox columns on the conversation. Never moves backwards (two sends in flight).
create or replace function private.messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations c set
    last_message_id = new.id,
    last_message_at = new.created_at,
    last_message_preview = private.message_preview(new.kind, new.body),
    last_message_sender = case when new.kind = 'system' then null else new.sender_id end
  where c.id = new.conversation_id
    and (c.last_message_at is null or c.last_message_at <= new.created_at);
  return null;
end;
$$;
drop trigger if exists messages_after_insert on public.messages;
create trigger messages_after_insert after insert on public.messages
  for each row execute function private.messages_after_insert();

-- Unsent message that is the last one: the inbox says so.
create or replace function private.messages_after_unsend()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations set last_message_preview = private.message_preview(new.kind, null, true)
  where id = new.conversation_id and last_message_id = new.id;
  return null;
end;
$$;
drop trigger if exists messages_after_unsend on public.messages;
create trigger messages_after_unsend after update of deleted_at on public.messages
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function private.messages_after_unsend();

-- Messages deleted for good (account deletion): point the inbox at the newest one that is left.
create or replace function private.messages_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations c set
    (last_message_id, last_message_at, last_message_preview, last_message_sender) = (
      select m.id, m.created_at, private.message_preview(m.kind, m.body, m.deleted_at is not null),
             case when m.kind = 'system' then null else m.sender_id end
      from public.messages m
      where m.conversation_id = c.id
      order by m.created_at desc
      limit 1)
  where c.id = old.conversation_id and c.last_message_id = old.id;
  return null;
end;
$$;
drop trigger if exists messages_after_delete on public.messages;
create trigger messages_after_delete after delete on public.messages
  for each row execute function private.messages_after_delete();

-- A member row disappears only when a profile is deleted (people leave with left_at).
-- Direct chat: it is over. Group: keep an owner, close it when empty.
create or replace function private.conversation_members_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
begin
  select kind into v_kind from public.conversations where id = old.conversation_id;
  if v_kind = 'direct' then
    -- the chat is over for the person who is left as well (their member row closes, so RLS
    -- hides the old messages too)
    update public.conversations set deleted_at = coalesce(deleted_at, now()) where id = old.conversation_id;
    update public.conversation_members set left_at = coalesce(left_at, clock_timestamp())
    where conversation_id = old.conversation_id and left_at is null;
  elsif v_kind = 'group' and old.left_at is null then
    perform private.group_after_member_gone(old.conversation_id);
  end if;
  return null;
end;
$$;
drop trigger if exists conversation_members_after_delete on public.conversation_members;
create trigger conversation_members_after_delete after delete on public.conversation_members
  for each row execute function private.conversation_members_after_delete();

-- -----------------------------------------------------------------------------
-- Chat RLS. Members read; only messages can be inserted by clients (the rest is RPC only).
-- -----------------------------------------------------------------------------
alter table public.friendships          enable row level security;
alter table public.notifications        enable row level security;
alter table public.conversations        enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages             enable row level security;

drop policy if exists "friendships visible to the two people" on public.friendships;
create policy "friendships visible to the two people" on public.friendships for select to authenticated
  using (user_a = (select auth.uid()) or user_b = (select auth.uid()));

drop policy if exists "read own notifications" on public.notifications;
create policy "read own notifications" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "mark own notifications read" on public.notifications;
create policy "mark own notifications read" on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "members read their conversations" on public.conversations;
create policy "members read their conversations" on public.conversations for select to authenticated
  using (deleted_at is null and private.is_conversation_member(id, (select auth.uid())));

-- Members see each other (read receipts need last_read_at). Your own row stays visible after you
-- leave or are removed, so the app can tell the conversation is gone.
drop policy if exists "members see who is in their conversations" on public.conversation_members;
create policy "members see who is in their conversations" on public.conversation_members for select to authenticated
  using (user_id = (select auth.uid())
         or (left_at is null and private.is_conversation_member(conversation_id, (select auth.uid()))));

-- History starts when you joined; nothing after you leave or are removed.
drop policy if exists "members read messages since they joined" on public.messages;
create policy "members read messages since they joined" on public.messages for select to authenticated
  using (exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = messages.conversation_id
      and cm.user_id = (select auth.uid())
      and cm.left_at is null
      and cm.joined_at <= messages.created_at));

-- Send as yourself, as text or image, into a conversation you can write to.
-- Retry-safe path for the offline outbox: insert ... on conflict (id) do nothing
-- (PostgREST: Prefer: resolution=ignore-duplicates; supabase-js upsert with ignoreDuplicates: true).
drop policy if exists "members send messages" on public.messages;
create policy "members send messages" on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and kind in ('text', 'image')
    and private.can_send_message(conversation_id, (select auth.uid()))
    and (reply_to is null or private.reply_target_ok(reply_to, conversation_id)));

-- Grants: read for everybody signed in (RLS filters), writes only where listed.
-- Everything else (members, roles, read cursor, mute, unsend, notifications) goes through RPCs.
revoke all on public.friendships, public.notifications, public.conversations,
  public.conversation_members, public.messages from anon, authenticated;
grant select on public.friendships, public.conversations, public.conversation_members to authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select, insert on public.messages to authenticated;
grant all on public.friendships, public.notifications, public.conversations,
  public.conversation_members, public.messages to service_role;

-- =============================================================================
-- 5. CHAT RPCs
-- =============================================================================
create or replace function public.start_direct_chat(p_user uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me    uuid := auth.uid();
  v_key text;
  v_id  uuid;
begin
  if me is null then
    raise exception 'Sign in to continue.' using errcode = '42501', hint = 'not_signed_in';
  end if;
  if p_user is null or p_user = me then
    raise exception 'Pick a friend to message.' using errcode = '22023', hint = 'invalid_input';
  end if;
  if not exists (select 1 from public.profiles where id = p_user and deleted_at is null)
     or private.is_blocked(me, p_user) then
    raise exception 'We could not find that pilgrim.' using errcode = 'P0002', hint = 'not_found';
  end if;
  if not private.is_friend(me, p_user) then
    raise exception 'Messages are only for friends. Send a friend request first.'
      using errcode = '42501', hint = 'chat_friends_only';
  end if;

  v_key := least(me, p_user)::text || ':' || greatest(me, p_user)::text;
  insert into public.conversations (kind, created_by, direct_key) values ('direct', me, v_key)
  on conflict (direct_key) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.conversations where direct_key = v_key;
  end if;
  insert into public.conversation_members (conversation_id, user_id, role, joined_at, last_read_at)
  values (v_id, me, 'member', clock_timestamp(), clock_timestamp()),
         (v_id, p_user, 'member', clock_timestamp(), clock_timestamp())
  on conflict (conversation_id, user_id) do nothing;
  return v_id;
end;
$$;

create or replace function public.create_group_chat(p_title text, p_members uuid[], p_avatar_url text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me      uuid := auth.uid();
  v_title text := btrim(coalesce(p_title, ''));
  v_ids   uuid[];
  v_id    uuid;
  v_u     uuid;
  v_name  text;
begin
  if me is null then
    raise exception 'Sign in to continue.' using errcode = '42501', hint = 'not_signed_in';
  end if;
  if char_length(v_title) not between 1 and 60 then
    raise exception 'Give your group a name of 1 to 60 characters.' using errcode = '22023', hint = 'group_title';
  end if;
  if char_length(p_avatar_url) > 1000 then
    raise exception 'That picture address is too long.' using errcode = '22023', hint = 'invalid_input';
  end if;
  if cardinality(coalesce(p_members, '{}')) > 100 then
    raise exception 'A group needs 2 to 49 other pilgrims.' using errcode = '22023', hint = 'group_size';
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_ids
  from unnest(coalesce(p_members, '{}')) x where x is not null and x <> me;
  if cardinality(v_ids) not between 2 and 49 then
    raise exception 'A group needs 2 to 49 other pilgrims.' using errcode = '22023', hint = 'group_size';
  end if;
  if exists (
    select 1 from unnest(v_ids) x
    where not private.is_friend(me, x)
       or not exists (select 1 from public.profiles pr where pr.id = x and pr.deleted_at is null)
  ) then
    raise exception 'You can only add your own friends.' using errcode = '42501', hint = 'group_friends_only';
  end if;

  insert into public.conversations (kind, title, avatar_url, created_by)
  values ('group', v_title, nullif(btrim(coalesce(p_avatar_url, '')), ''), me)
  returning id into v_id;
  insert into public.conversation_members (conversation_id, user_id, role, joined_at, last_read_at)
  select v_id, me, 'owner', clock_timestamp(), clock_timestamp()
  union all
  select v_id, x, 'member', clock_timestamp(), clock_timestamp() from unnest(v_ids) x;

  v_name := private.display_name_of(me);
  insert into public.messages (conversation_id, sender_id, kind, body)
  values (v_id, me, 'system', v_name || ' created the group');
  foreach v_u in array v_ids loop
    perform private.notify(v_u, 'group_added', me,
      v_name || ' added you to ' || v_title, null, jsonb_build_object('conversation_id', v_id), true);
  end loop;
  return v_id;
end;
$$;

create or replace function public.add_group_members(p_conversation uuid, p_members uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me        uuid := auth.uid();
  v_conv    public.conversations;
  v_role    text;
  v_want    uuid[];
  v_fresh   uuid[];
  v_active  integer;
  v_added   uuid[];
  v_u       uuid;
  v_names   text;
  v_extra   integer;
  v_me_name text;
begin
  if me is null then
    raise exception 'Sign in to continue.' using errcode = '42501', hint = 'not_signed_in';
  end if;
  select * into v_conv from public.conversations where id = p_conversation and deleted_at is null for update;
  select role into v_role from public.conversation_members
  where conversation_id = p_conversation and user_id = me and left_at is null;
  if v_conv.id is null or v_role is null then
    raise exception 'We could not find that conversation.' using errcode = 'P0002', hint = 'not_found';
  end if;
  if v_conv.kind <> 'group' then
    raise exception 'A direct chat cannot have more people.' using errcode = '22023', hint = 'direct_chat';
  end if;
  if v_role not in ('owner', 'admin') then
    raise exception 'Only group admins can do this.' using errcode = '42501', hint = 'not_allowed';
  end if;
  if cardinality(coalesce(p_members, '{}')) > 100 then
    raise exception 'A group holds up to 50 pilgrims.' using errcode = '54000', hint = 'group_full';
  end if;

  select coalesce(array_agg(distinct x), '{}') into v_want
  from unnest(coalesce(p_members, '{}')) x where x is not null and x <> me;
  select coalesce(array_agg(x), '{}') into v_fresh
  from unnest(v_want) x
  where not exists (select 1 from public.conversation_members m
                    where m.conversation_id = p_conversation and m.user_id = x and m.left_at is null);
  if cardinality(v_fresh) = 0 then
    return 0;   -- everybody is in already
  end if;

  select count(*) into v_active from public.conversation_members
  where conversation_id = p_conversation and left_at is null;
  if v_active + cardinality(v_fresh) > 50 then
    raise exception 'This group is full. A group holds up to 50 pilgrims.' using errcode = '54000', hint = 'group_full';
  end if;
  if exists (
    select 1 from unnest(v_fresh) x
    where not private.is_friend(me, x)
       or not exists (select 1 from public.profiles pr where pr.id = x and pr.deleted_at is null)
  ) then
    raise exception 'You can only add your own friends.' using errcode = '42501', hint = 'group_friends_only';
  end if;

  -- someone who left or was removed comes back as a new member: history starts now
  with ins as (
    insert into public.conversation_members as cm (conversation_id, user_id, role, joined_at, last_read_at)
    select p_conversation, x, 'member', clock_timestamp(), clock_timestamp() from unnest(v_fresh) x
    on conflict (conversation_id, user_id) do update set
      left_at = null, role = 'member', joined_at = excluded.joined_at,
      last_read_at = excluded.last_read_at, muted_until = null
      where cm.left_at is not null
    returning cm.user_id
  )
  select coalesce(array_agg(user_id), '{}') into v_added from ins;
  if cardinality(v_added) = 0 then
    return 0;   -- somebody else added them a moment ago
  end if;

  v_me_name := private.display_name_of(me);
  select string_agg(private.display_name_of(x), ', ' order by private.display_name_of(x)) into v_names
  from (select x from unnest(v_added) x order by private.display_name_of(x) limit 3) s;
  v_extra := cardinality(v_added) - 3;
  insert into public.messages (conversation_id, sender_id, kind, body)
  values (p_conversation, me, 'system',
          v_me_name || ' added ' || v_names || case when v_extra > 0 then ' and ' || v_extra || ' more' else '' end);
  foreach v_u in array v_added loop
    perform private.notify(v_u, 'group_added', me,
      v_me_name || ' added you to ' || v_conv.title, null,
      jsonb_build_object('conversation_id', p_conversation), true);
  end loop;
  return cardinality(v_added);
end;
$$;

create or replace function public.remove_group_member(p_conversation uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me       uuid := auth.uid();
  v_conv   public.conversations;
  v_role   text;
  v_target text;
begin
  if me is null then
    raise exception 'Sign in to continue.' using errcode = '42501', hint = 'not_signed_in';
  end if;
  select * into v_conv from public.conversations where id = p_conversation and deleted_at is null for update;
  select role into v_role from public.conversation_members
  where conversation_id = p_conversation and user_id = me and left_at is null;
  if v_conv.id is null or v_role is null then
    raise exception 'We could not find that conversation.' using errcode = 'P0002', hint = 'not_found';
  end if;
  if v_conv.kind <> 'group' then
    raise exception 'A direct chat has no members to remove.' using errcode = '22023', hint = 'direct_chat';
  end if;
  if v_role not in ('owner', 'admin') then
    raise exception 'Only group admins can do this.' using errcode = '42501', hint = 'not_allowed';
  end if;
  if p_user is null or p_user = me then
    raise exception 'Use "Leave group" to leave a group yourself.' using errcode = '22023', hint = 'use_leave';
  end if;

  select role into v_target from public.conversation_members
  where conversation_id = p_conversation and user_id = p_user and left_at is null;
  if v_target is null then
    return;   -- already gone
  end if;
  if v_target = 'owner' then
    raise exception 'The owner cannot be removed from the group.' using errcode = '42501', hint = 'cannot_remove_owner';
  end if;
  if v_target = 'admin' and v_role <> 'owner' then
    raise exception 'Only the owner can remove an admin.' using errcode = '42501', hint = 'not_allowed';
  end if;

  update public.conversation_members set left_at = clock_timestamp(), role = 'member'
  where conversation_id = p_conversation and user_id = p_user;
  insert into public.messages (conversation_id, sender_id, kind, body)
  values (p_conversation, me, 'system',
          private.display_name_of(me) || ' removed ' || private.display_name_of(p_user));
end;
$$;

-- Not in the original contract: the owner makes somebody admin (or member again).
create or replace function public.set_group_member_role(p_conversation uuid, p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me       uuid := auth.uid();
  v_conv   public.conversations;
  v_role   text;
  v_target text;
begin
  if me is null then
    raise exception 'Sign in to continue.' using errcode = '42501', hint = 'not_signed_in';
  end if;
  if p_role is null or p_role not in ('admin', 'member') then
    raise exception 'A member can be an admin or a member.' using errcode = '22023', hint = 'invalid_input';
  end if;
  select * into v_conv from public.conversations where id = p_conversation and deleted_at is null for update;
  select role into v_role from public.conversation_members
  where conversation_id = p_conversation and user_id = me and left_at is null;
  if v_conv.id is null or v_role is null then
    raise exception 'We could not find that conversation.' using errcode = 'P0002', hint = 'not_found';
  end if;
  if v_conv.kind <> 'group' then
    raise exception 'A direct chat has no roles.' using errcode = '22023', hint = 'direct_chat';
  end if;
  if v_role <> 'owner' then
    raise exception 'Only the owner can do this.' using errcode = '42501', hint = 'not_allowed';
  end if;
  select role into v_target from public.conversation_members
  where conversation_id = p_conversation and user_id = p_user and left_at is null;
  if v_target is null then
    raise exception 'We could not find that member.' using errcode = 'P0002', hint = 'not_found';
  end if;
  if v_target = 'owner' then
    raise exception 'The owner stays the owner.' using errcode = '22023', hint = 'invalid_input';
  end if;
  update public.conversation_members set role = p_role
  where conversation_id = p_conversation and user_id = p_user;
end;
$$;

create or replace function public.leave_conversation(p_conversation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me       uuid := auth.uid();
  v_conv   public.conversations;
  v_left   timestamptz;
  v_found  boolean;
begin
  if me is null then
    raise exception 'Sign in to continue.' using errcode = '42501', hint = 'not_signed_in';
  end if;
  select * into v_conv from public.conversations where id = p_conversation for update;
  select left_at, true into v_left, v_found from public.conversation_members
  where conversation_id = p_conversation and user_id = me;
  if v_conv.id is null or v_found is null then
    raise exception 'We could not find that conversation.' using errcode = 'P0002', hint = 'not_found';
  end if;
  if v_conv.kind <> 'group' then
    raise exception 'You cannot leave a direct chat. Block or unfriend instead.' using errcode = '22023', hint = 'direct_chat';
  end if;
  if v_left is not null then
    return;   -- already out: retries are harmless
  end if;

  update public.conversation_members set left_at = clock_timestamp(), role = 'member'
  where conversation_id = p_conversation and user_id = me;
  -- tell the others while the group is still open (the helper closes it when nobody is left)
  if exists (select 1 from public.conversation_members
             where conversation_id = p_conversation and left_at is null) then
    insert into public.messages (conversation_id, sender_id, kind, body)
    values (p_conversation, me, 'system', private.display_name_of(me) || ' left the group');
  end if;
  perform private.group_after_member_gone(p_conversation);
end;
$$;

-- p_avatar_url: null keeps the current picture, '' removes it.
create or replace function public.rename_group(p_conversation uuid, p_title text, p_avatar_url text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me      uuid := auth.uid();
  v_conv  public.conversations;
  v_role  text;
  v_title text := btrim(coalesce(p_title, ''));
begin
  if me is null then
    raise exception 'Sign in to continue.' using errcode = '42501', hint = 'not_signed_in';
  end if;
  select * into v_conv from public.conversations where id = p_conversation and deleted_at is null for update;
  select role into v_role from public.conversation_members
  where conversation_id = p_conversation and user_id = me and left_at is null;
  if v_conv.id is null or v_role is null then
    raise exception 'We could not find that conversation.' using errcode = 'P0002', hint = 'not_found';
  end if;
  if v_conv.kind <> 'group' then
    raise exception 'Only groups have a name.' using errcode = '22023', hint = 'direct_chat';
  end if;
  if v_role not in ('owner', 'admin') then
    raise exception 'Only group admins can do this.' using errcode = '42501', hint = 'not_allowed';
  end if;
  if char_length(v_title) not between 1 and 60 then
    raise exception 'Give your group a name of 1 to 60 characters.' using errcode = '22023', hint = 'group_title';
  end if;
  if char_length(p_avatar_url) > 1000 then
    raise exception 'That picture address is too long.' using errcode = '22023', hint = 'invalid_input';
  end if;

  update public.conversations set
    title = v_title,
    avatar_url = case when p_avatar_url is null then avatar_url else nullif(btrim(p_avatar_url), '') end
  where id = p_conversation;
  if v_title is distinct from v_conv.title then
    insert into public.messages (conversation_id, sender_id, kind, body)
    values (p_conversation, me, 'system',
            private.display_name_of(me) || ' renamed the group to "' || v_title || '"');
  end if;
end;
$$;

create or replace function public.mark_conversation_read(p_conversation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Sign in to continue.' using errcode = '42501', hint = 'not_signed_in';
  end if;
  update public.conversation_members set last_read_at = greatest(last_read_at, clock_timestamp())
  where conversation_id = p_conversation and user_id = me and left_at is null;
  if not found then
    raise exception 'We could not find that conversation.' using errcode = 'P0002', hint = 'not_found';
  end if;
end;
$$;

-- p_until: null (or a time in the past) unmutes. 'infinity' means "until I say so" (stored as year 9999).
create or replace function public.mute_conversation(p_conversation uuid, p_until timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Sign in to continue.' using errcode = '42501', hint = 'not_signed_in';
  end if;
  update public.conversation_members set muted_until = case
      when p_until is null or p_until <= now() then null
      when p_until = 'infinity'::timestamptz then timestamptz '9999-12-31 00:00:00+00'
      else p_until end
  where conversation_id = p_conversation and user_id = me and left_at is null;
  if not found then
    raise exception 'We could not find that conversation.' using errcode = 'P0002', hint = 'not_found';
  end if;
end;
$$;

-- Sender only. Body and photo are removed, the row stays so other devices show "unsent".
-- (The photo file stays in the sender's storage folder until the app deletes it; nobody else can
-- read it once the message no longer points at it.)
create or replace function public.unsend_message(p_message uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me  uuid := auth.uid();
  m   public.messages;
begin
  if me is null then
    raise exception 'Sign in to continue.' using errcode = '42501', hint = 'not_signed_in';
  end if;
  select * into m from public.messages where id = p_message for update;
  -- same answer for "not yours" and "does not exist"
  if not found or m.sender_id <> me or m.kind = 'system' then
    raise exception 'You can only unsend your own messages.' using errcode = '42501', hint = 'not_allowed';
  end if;
  if m.deleted_at is not null then
    return;
  end if;
  update public.messages set deleted_at = now(), body = null, media_path = null where id = p_message;
end;
$$;

-- Inbox rows. Direct chats show the other person (masked when blocked either way or deleted).
create or replace function public.list_conversations(p_kind text default null)
returns table (
  id uuid, kind text, title text, avatar_url text,
  peer_id uuid, peer_username text, peer_display_name text, peer_avatar_url text,
  member_count integer,
  last_message_id uuid, last_message_preview text, last_message_sender uuid, last_message_sender_name text,
  last_message_at timestamptz, unread_count integer, muted_until timestamptz, my_role text)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select auth.uid() as uid)
  select
    c.id,
    c.kind,
    case when c.kind = 'group' then c.title
         else case when peer.hidden then 'Pilgrim'
                   else coalesce(nullif(btrim(peer.display_name), ''), peer.username, 'Pilgrim') end end,
    case when c.kind = 'group' then c.avatar_url
         when peer.hidden then null else peer.avatar_url end,
    peer.id,
    case when peer.hidden then null else peer.username end,
    case when peer.hidden then null else peer.display_name end,
    case when peer.hidden then null else peer.avatar_url end,
    mc.n,
    c.last_message_id,
    c.last_message_preview,
    c.last_message_sender,
    case when ls.hidden then null else coalesce(nullif(btrim(ls.display_name), ''), ls.username) end,
    c.last_message_at,
    unread.n,
    case when cm.muted_until > now() then cm.muted_until end,
    cm.role
  from me
  join public.conversation_members cm on cm.user_id = me.uid and cm.left_at is null
  join public.conversations c on c.id = cm.conversation_id and c.deleted_at is null
  left join lateral (
    select p.id, p.username, p.display_name, p.avatar_url,
           (p.deleted_at is not null or private.is_blocked(me.uid, p.id)) as hidden
    from public.conversation_members pm
    join public.profiles p on p.id = pm.user_id
    where c.kind = 'direct' and pm.conversation_id = c.id and pm.user_id <> me.uid and pm.left_at is null
    limit 1
  ) peer on true
  left join lateral (
    select p.username, p.display_name,
           (p.deleted_at is not null or private.is_blocked(me.uid, p.id)) as hidden
    from public.profiles p
    where p.id = c.last_message_sender
  ) ls on true
  cross join lateral (
    select count(*)::integer as n from public.conversation_members x
    where x.conversation_id = c.id and x.left_at is null
  ) mc
  cross join lateral (
    -- bounded: the badge shows 99+ anyway
    select count(*)::integer as n from (
      select 1 from public.messages m
      where m.conversation_id = c.id
        and m.created_at > greatest(cm.last_read_at, cm.joined_at)
        and m.sender_id <> me.uid and m.deleted_at is null and m.kind <> 'system'
      limit 100) u
  ) unread
  where p_kind is null or c.kind = p_kind
  order by coalesce(c.last_message_at, c.created_at) desc, c.id
  limit 500;
$$;

create or replace function public.list_conversation_members(p_conversation uuid)
returns table (user_id uuid, username text, display_name text, avatar_url text, role text,
               joined_at timestamptz, last_read_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id,
         case when h.hidden then null else p.username end,
         case when h.hidden then null else p.display_name end,
         case when h.hidden then null else p.avatar_url end,
         m.role, m.joined_at, m.last_read_at
  from public.conversation_members m
  join public.profiles p on p.id = m.user_id
  cross join lateral (select (p.deleted_at is not null or private.is_blocked(auth.uid(), p.id)) as hidden) h
  where m.conversation_id = p_conversation and m.left_at is null
    and private.is_conversation_member(p_conversation, auth.uid())
  order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, m.joined_at, m.user_id;
$$;

-- Bell and tab badges in one call. Chats and groups count unread messages of conversations that
-- are not muted, capped at 99 each.
create or replace function public.get_unread_totals()
returns table (notifications integer, chats integer, groups integer, friend_requests integer)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select auth.uid() as uid),
  per as (
    select c.kind, u.n
    from me
    join public.conversation_members cm on cm.user_id = me.uid and cm.left_at is null
      and (cm.muted_until is null or cm.muted_until <= now())
    join public.conversations c on c.id = cm.conversation_id and c.deleted_at is null
    cross join lateral (
      select count(*)::integer as n from (
        select 1 from public.messages m
        where m.conversation_id = c.id
          and m.created_at > greatest(cm.last_read_at, cm.joined_at)
          and m.sender_id <> me.uid and m.deleted_at is null and m.kind <> 'system'
        limit 99) x
    ) u
  )
  select
    (select count(*)::integer from public.notifications n, me where n.user_id = me.uid and n.read_at is null),
    least(99, coalesce((select sum(n) from per where kind = 'direct'), 0))::integer,
    least(99, coalesce((select sum(n) from per where kind = 'group'), 0))::integer,
    (select count(*)::integer from public.friendships f, me
     where f.status = 'pending' and f.requested_by <> me.uid and (f.user_a = me.uid or f.user_b = me.uid));
$$;

-- Notifications: null = all of mine. Returns how many rows changed.
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me  uuid := auth.uid();
  v_n integer;
begin
  if me is null then
    raise exception 'Sign in to continue.' using errcode = '42501', hint = 'not_signed_in';
  end if;
  update public.notifications set read_at = now()
  where user_id = me and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- =============================================================================
-- 6. REPORTS: a message can be reported by the people who can read it
-- =============================================================================
alter table public.content_reports add column if not exists message_id uuid references public.messages (id) on delete set null;
-- what the message said when it was reported: the sender may unsend it afterwards
alter table public.content_reports add column if not exists evidence jsonb;
create index if not exists content_reports_message_idx on public.content_reports (message_id) where message_id is not null;

-- Add 'message' to the target check without dropping values other migrations may have added.
do $$
declare
  c record;
begin
  for c in
    select conname, pg_get_constraintdef(oid) as def
    from pg_constraint
    where conrelid = 'public.content_reports'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%target_type%'
  loop
    if c.def not like '%''message''%' then
      execute format('alter table public.content_reports drop constraint %I', c.conname);
      execute format('alter table public.content_reports add constraint %I %s', c.conname,
        regexp_replace(c.def, '::text\]\)', '::text, ''message''::text])'));
    end if;
  end loop;
end $$;

create or replace function private.content_reports_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.messages;
begin
  if new.target_type is null and new.message_id is not null then
    new.target_type := 'message';
  end if;
  if new.target_type = 'message' then
    new.target_id := coalesce(new.target_id, new.message_id);
    new.message_id := new.target_id;
    select * into m from public.messages where id = new.target_id;
    new.evidence := case when found then jsonb_build_object(
      'message_id', m.id, 'conversation_id', m.conversation_id, 'sender_id', m.sender_id,
      'kind', m.kind, 'body', m.body, 'media_path', m.media_path, 'sent_at', m.created_at) end;
  else
    new.message_id := null;
    new.evidence := null;
  end if;
  return new;
end;
$$;
drop trigger if exists content_reports_message on public.content_reports;
create trigger content_reports_message before insert on public.content_reports
  for each row execute function private.content_reports_before_insert();

-- Restrictive: ANDed with the existing "report as yourself" policy. Messages RLS decides what
-- the reporter can read (members, since they joined).
drop policy if exists "report only messages you can read" on public.content_reports;
create policy "report only messages you can read" on public.content_reports as restrictive for insert to authenticated
  with check (target_type <> 'message'
              or exists (select 1 from public.messages m where m.id = content_reports.target_id));

-- =============================================================================
-- 7. CHAT IMAGES (bucket user-media, path <sender>/chat/<conversation>/<file>)
-- Own policy next to "read user media" (permissive policies are ORed). Security invoker, so the
-- messages policy decides: members of the conversation, from the time they joined.
-- =============================================================================
create or replace function private.can_read_chat_media(p_name text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (select 1 from public.messages m where m.media_path = p_name);
$$;

drop policy if exists "read chat media" on storage.objects;
create policy "read chat media" on storage.objects for select to authenticated
  using (bucket_id = 'user-media' and private.can_read_chat_media(name));

-- =============================================================================
-- 8. GRANTS (explicit, nothing relies on default privileges)
-- =============================================================================
-- private helpers that policies, triggers or other roles call directly
revoke execute on function
  private.display_name_of(uuid), private.is_friend(uuid, uuid),
  private.notify(uuid, text, uuid, text, text, jsonb, boolean),
  private.is_conversation_member(uuid, uuid), private.can_send_message(uuid, uuid),
  private.reply_target_ok(uuid, uuid), private.messages_rate_ok(uuid, uuid),
  private.message_preview(text, text, boolean), private.group_after_member_gone(uuid),
  private.can_read_chat_media(text)
  from public, anon, authenticated;
grant execute on function private.is_friend(uuid, uuid) to authenticated, service_role;
grant execute on function
  private.is_conversation_member(uuid, uuid), private.can_send_message(uuid, uuid),
  private.reply_target_ok(uuid, uuid), private.messages_rate_ok(uuid, uuid),
  private.can_read_chat_media(text)
  to authenticated, service_role;

-- trigger functions: nobody calls them directly
revoke execute on function
  private.friendships_counters(), private.notifications_before_update(),
  private.post_likes_notify(), private.post_comments_notify(), private.user_achievements_notify(),
  private.blocks_remove_friendship(), private.messages_before_insert(), private.messages_after_insert(),
  private.messages_after_unsend(), private.messages_after_delete(),
  private.conversation_members_after_delete(), private.content_reports_before_insert()
  from public, anon, authenticated;

-- public RPCs: signed-in people only
revoke execute on function
  public.send_friend_request(uuid), public.respond_friend_request(uuid, boolean),
  public.cancel_friend_request(uuid), public.remove_friend(uuid),
  public.list_friends(integer, integer), public.list_friend_requests(),
  public.search_pilgrims(text, integer),
  public.start_direct_chat(uuid), public.create_group_chat(text, uuid[], text),
  public.add_group_members(uuid, uuid[]), public.remove_group_member(uuid, uuid),
  public.set_group_member_role(uuid, uuid, text), public.leave_conversation(uuid),
  public.rename_group(uuid, text, text), public.mark_conversation_read(uuid),
  public.mute_conversation(uuid, timestamptz), public.unsend_message(uuid),
  public.list_conversations(text), public.list_conversation_members(uuid),
  public.get_unread_totals(), public.mark_notifications_read(uuid[])
  from public, anon;
grant execute on function
  public.send_friend_request(uuid), public.respond_friend_request(uuid, boolean),
  public.cancel_friend_request(uuid), public.remove_friend(uuid),
  public.list_friends(integer, integer), public.list_friend_requests(),
  public.search_pilgrims(text, integer),
  public.start_direct_chat(uuid), public.create_group_chat(text, uuid[], text),
  public.add_group_members(uuid, uuid[]), public.remove_group_member(uuid, uuid),
  public.set_group_member_role(uuid, uuid, text), public.leave_conversation(uuid),
  public.rename_group(uuid, text, text), public.mark_conversation_read(uuid),
  public.mute_conversation(uuid, timestamptz), public.unsend_message(uuid),
  public.list_conversations(text), public.list_conversation_members(uuid),
  public.get_unread_totals(), public.mark_notifications_read(uuid[])
  to authenticated, service_role;

-- =============================================================================
-- 9. REALTIME (publication exists on Supabase, not on a plain local Postgres)
-- =============================================================================
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['messages', 'conversation_members', 'notifications', 'friendships'] loop
      if not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- Safety net: fail the migration if one of the new tables is missing RLS.
do $$
declare
  missing text;
begin
  select string_agg(c.relname, ', ') into missing
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
    and c.relname in ('friendships', 'notifications', 'conversations', 'conversation_members', 'messages');
  if missing is not null then
    raise exception 'RLS not enabled on: %', missing;
  end if;
end $$;
