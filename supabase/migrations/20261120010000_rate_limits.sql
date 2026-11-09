-- =============================================================================
-- CaminoPlus: rate limits on what one pilgrim can write (anti-spam, anti-harassment, anti-scraping)
--
-- WHAT (each limit is per signed-in pilgrim; a sliding window, not a calendar day)
--   posts            20 per 24 hours     BEFORE INSERT on public.posts
--   comments         60 per hour         BEFORE INSERT on public.post_comments
--   likes           300 per hour         BEFORE INSERT on public.post_likes
--   saves           300 per hour         BEFORE INSERT on public.post_saves
--   follows         100 per 24 hours     BEFORE INSERT on public.follows
--   content reports  30 per 24 hours     BEFORE INSERT on public.content_reports
--   friend requests  30 per 24 hours     inside public.send_friend_request (clients cannot insert friendships)
--   friend request after a decline: 30-day cool-down, silent (see below)
--   search_pilgrims  30 calls per minute, and at least 3 characters (was 2)
--
--   Every limit raises SQLSTATE 54000 (like the chat limit "rate_limited" of messages_before_insert) with a
--   plain English sentence as the message (the app shows the database's own sentences) and a hint the app
--   can test for:
--     rate_limited_posts, rate_limited_comments, rate_limited_likes, rate_limited_saves,
--     rate_limited_follows, rate_limited_reports, rate_limited_friend_requests, rate_limited_search
--
-- HOW (the style of private.messages_rate_ok)
--   The count runs in a SECURITY DEFINER helper (private.recent_writes) so RLS never hides a row the
--   pilgrim wrote (a deleted or hidden post still counts). It is not STABLE on purpose: a bulk insert sees
--   the rows it already inserted. The trigger itself is SECURITY INVOKER so it can see current_user and
--   only applies to clients ('anon', 'authenticated'), never to server code (security definer RPCs, the
--   service role, the SQL editor). A retry is never refused: a row with the same key that already exists
--   (same post id, comment id, like, save, follow or report target) passes, the unique key answers it.
--   created_at is already forced to the server clock by private.force_server_times, so a client cannot
--   back-date rows to slip under a limit.
--   Likes, saves and follows count the rows that exist: like, unlike, like again counts once. That keeps
--   them simple; the notification of a like is sent once per row and the post owner can block.
--
-- FRIEND REQUESTS AFTER A DECLINE (design)
--   Today respond_friend_request(decline) deletes the row and says nothing to the sender, so the sender can
--   ask again at once, and every new request is a new notification and push to the person who said no.
--   Options considered:
--     a) keep the declined row with status 'declined': changes the status CHECK and every function that
--        reads friendships (lists, counters, search status). Too wide for a launch fix.
--     b) tell the sender "you cannot ask again yet": tells them they were declined, which the app promises
--        never to do ("they are not told").
--     c) remember the decline in a private table and, for 30 days, answer a new request from that sender
--        with 'pending' (exactly what a real send answers) but create no row and send no notification.
--   Chosen: c. The person who declined is never bothered again for 30 days; the sender learns nothing: for
--   those 30 days the sender keeps seeing the request as "not answered yet" (list_friend_requests shows it as
--   outgoing, search_pilgrims as pending_out), and can cancel it like any request (it then disappears for them;
--   the cool-down goes on). Old declines are purged when a new decline is written.
--   If the person who declined later sends a request themselves, it works normally and the decline is
--   forgotten. Every real send is also logged (private.friend_request_log) so send, cancel, send again
--   counts each time (that loop used to send a push every time; 30 per day now).
--
-- WHO IS AFFECTED
--   Only very heavy or automated use. A busy pilgrim day (5 posts, 30 comments, 100 likes, 50 saves,
--   20 follows, 3 reports, 10 friend requests, 20 searches) passes: dev/backend_hardening_smoke.sql.
--   The app's search already waits 350 ms after typing; it must ask for 3 letters (mobile change in the
--   same branch: MIN_SEARCH_CHARS 3). An older app sending 2 letters simply gets no results.
--
-- DESTRUCTIVE?  No. Adds 3 private tables, indexes, 4 private functions, 6 triggers; replaces 5 RPC bodies
--   (send_friend_request, respond_friend_request, cancel_friend_request, list_friend_requests, search_pilgrims;
--   same signatures and grants).
--   search_pilgrims changes from STABLE to VOLATILE (it writes its call log): the app calls it with POST
--   (supabase.rpc default), which is right for a volatile function.
--
-- UNDO
--   drop trigger if exists b_rate_limit on public.posts;   (same for post_comments, post_likes,
--   post_saves, follows, content_reports);
--   re-run the bodies of send_friend_request, respond_friend_request, cancel_friend_request,
--   list_friend_requests and search_pilgrims from 20261107010000_friends_chat_notifications.sql (first: they use
--   the objects below);
--   drop function private.rate_limit_before_insert(), private.recent_writes(text, interval),
--   private.write_exists(text, jsonb), private.cooling_request(uuid, uuid);
--   drop table private.friend_request_log, private.friend_request_declines, private.search_log;
--   drop index if exists public.posts_user_created_idx.
--
-- Re-runnable: if not exists, create or replace, drop trigger if exists.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Counting helper and the trigger
-- ---------------------------------------------------------------------------
create index if not exists posts_user_created_idx on public.posts (user_id, created_at);

-- Only the caller's own rows (auth.uid()): the helpers are executable by authenticated (the trigger runs as the
-- caller), so they must not answer questions about other people.
create or replace function private.recent_writes(p_kind text, p_window interval)
returns integer
language sql
security definer
set search_path = ''
as $$
  with me as (select auth.uid() as p_user)
  select case p_kind
    when 'posts'    then (select count(*) from public.posts           where user_id = p_user     and created_at > clock_timestamp() - p_window)
    when 'comments' then (select count(*) from public.post_comments   where user_id = p_user     and created_at > clock_timestamp() - p_window)
    when 'likes'    then (select count(*) from public.post_likes      where user_id = p_user     and created_at > clock_timestamp() - p_window)
    when 'saves'    then (select count(*) from public.post_saves      where user_id = p_user     and created_at > clock_timestamp() - p_window)
    when 'follows'  then (select count(*) from public.follows         where follower_id = p_user and created_at > clock_timestamp() - p_window)
    when 'reports'  then (select count(*) from public.content_reports where reporter_id = p_user and created_at > clock_timestamp() - p_window)
  end::integer
  from me;
$$;

-- true when the row being inserted already exists (a client retry): never refused, the unique key answers.
create or replace function private.write_exists(p_kind text, p_row jsonb)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select case p_kind
    when 'posts'    then exists (select 1 from public.posts         where id = (p_row ->> 'id')::uuid and user_id = auth.uid())
    when 'comments' then exists (select 1 from public.post_comments where id = (p_row ->> 'id')::uuid and user_id = auth.uid())
    when 'likes'    then exists (select 1 from public.post_likes    where post_id = (p_row ->> 'post_id')::uuid and user_id = auth.uid())
    when 'saves'    then exists (select 1 from public.post_saves    where post_id = (p_row ->> 'post_id')::uuid and user_id = auth.uid())
    when 'follows'  then exists (select 1 from public.follows       where follower_id = auth.uid() and followee_id = (p_row ->> 'followee_id')::uuid)
    when 'reports'  then exists (select 1 from public.content_reports
                                 where reporter_id = auth.uid() and target_type = p_row ->> 'target_type'
                                   and target_id = (p_row ->> 'target_id')::uuid)
    else false
  end;
$$;

-- tg_argv: kind, limit, window. Security invoker: current_user is the caller's role.
create or replace function private.rate_limit_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_kind   text     := tg_argv[0];
  v_limit  integer  := tg_argv[1]::integer;
  v_window interval := tg_argv[2]::interval;
  v_me     uuid;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;   -- server code is not limited
  end if;
  v_me := auth.uid();
  if v_me is null then
    return new;   -- anon: refused by RLS anyway
  end if;
  if private.write_exists(v_kind, to_jsonb(new)) then
    return new;
  end if;
  if private.recent_writes(v_kind, v_window) >= v_limit then
    raise exception '%', case v_kind
        when 'posts'    then 'You have shared many posts today. Please try again later.'
        when 'comments' then 'You have written many comments in the last hour. Please wait a little and try again.'
        when 'likes'    then 'You have liked many posts in the last hour. Please wait a little and try again.'
        when 'saves'    then 'You have saved many posts in the last hour. Please wait a little and try again.'
        when 'follows'  then 'You have followed many pilgrims today. Please try again tomorrow.'
        when 'reports'  then 'You have sent many reports today. Thank you. Please try again tomorrow.'
      end
      using errcode = '54000', hint = 'rate_limited_' || v_kind;
  end if;
  return new;
end;
$$;

-- "b_" so it runs after a_force_server_times (triggers of one event fire in name order).
drop trigger if exists b_rate_limit on public.posts;
create trigger b_rate_limit before insert on public.posts
  for each row execute function private.rate_limit_before_insert('posts', '20', '24 hours');
drop trigger if exists b_rate_limit on public.post_comments;
create trigger b_rate_limit before insert on public.post_comments
  for each row execute function private.rate_limit_before_insert('comments', '60', '1 hour');
drop trigger if exists b_rate_limit on public.post_likes;
create trigger b_rate_limit before insert on public.post_likes
  for each row execute function private.rate_limit_before_insert('likes', '300', '1 hour');
drop trigger if exists b_rate_limit on public.post_saves;
create trigger b_rate_limit before insert on public.post_saves
  for each row execute function private.rate_limit_before_insert('saves', '300', '1 hour');
drop trigger if exists b_rate_limit on public.follows;
create trigger b_rate_limit before insert on public.follows
  for each row execute function private.rate_limit_before_insert('follows', '100', '24 hours');
drop trigger if exists b_rate_limit on public.content_reports;
create trigger b_rate_limit before insert on public.content_reports
  for each row execute function private.rate_limit_before_insert('reports', '30', '24 hours');

-- ---------------------------------------------------------------------------
-- 2. Friend requests: a log of sends (30 per day) and a 30-day silent cool-down after a decline
-- ---------------------------------------------------------------------------
create table if not exists private.friend_request_log (
  requester uuid not null references public.profiles (id) on delete cascade,
  target    uuid not null references public.profiles (id) on delete cascade,
  sent_at   timestamptz not null default clock_timestamp()
);
create index if not exists friend_request_log_requester_idx on private.friend_request_log (requester, sent_at);
create index if not exists friend_request_log_target_idx on private.friend_request_log (target);
alter table private.friend_request_log enable row level security;   -- no policy: server functions only

create table if not exists private.friend_request_declines (
  requester     uuid not null references public.profiles (id) on delete cascade,  -- who asked
  decliner      uuid not null references public.profiles (id) on delete cascade,  -- who said no
  declined_at   timestamptz not null default now(),
  requested_at  timestamptz not null default now(),  -- what the requester's "Requested" row shows
  pending_shown boolean not null default true,        -- the requester still sees "Requested" (false after cancel)
  primary key (requester, decliner)
);
create index if not exists friend_request_declines_decliner_idx on private.friend_request_declines (decliner);
create index if not exists friend_request_declines_declined_at_idx on private.friend_request_declines (declined_at);

-- During the cool-down the requester sees the request as "not answered yet": list_friend_requests shows it as
-- outgoing and search_pilgrims as pending_out. Nobody else ever sees it.
create or replace function private.cooling_request(p_requester uuid, p_decliner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.friend_request_declines d
                 where d.requester = p_requester and d.decliner = p_decliner
                   and d.pending_shown and d.declined_at > now() - interval '30 days');
$$;
alter table private.friend_request_declines enable row level security;

revoke all on private.friend_request_log, private.friend_request_declines from public, anon, authenticated;

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
    delete from private.friend_request_declines where requester = p_user and decliner = me;
    return 'accepted';
  end if;

  -- I am asking somebody I once said no to: that decline no longer matters
  delete from private.friend_request_declines where requester = p_user and decliner = me;
  -- they said no to me less than 30 days ago: answer like a real send, but do not bother them
  delete from private.friend_request_declines where requester = me and declined_at < now() - interval '30 days';
  if exists (select 1 from private.friend_request_declines where requester = me and decliner = p_user) then
    update private.friend_request_declines set pending_shown = true, requested_at = now()
    where requester = me and decliner = p_user and not pending_shown;
    return 'pending';
  end if;

  select count(*) into v_pending from public.friendships where requested_by = me and status = 'pending';
  if v_pending >= 50 then
    raise exception 'You have too many requests waiting. Wait for answers before sending more.'
      using errcode = '54000', hint = 'friend_request_limit';
  end if;
  delete from private.friend_request_log where requester = me and sent_at < clock_timestamp() - interval '2 days';
  if (select count(*) from private.friend_request_log
      where requester = me and sent_at > clock_timestamp() - interval '24 hours') >= 30 then
    raise exception 'You have sent many friend requests today. Please try again tomorrow.'
      using errcode = '54000', hint = 'rate_limited_friend_requests';
  end if;
  insert into public.friendships (user_a, user_b, requested_by) values (v_a, v_b, me);
  insert into private.friend_request_log (requester, target) values (me, p_user);
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

  -- declined: the row goes away and they are not told; for 30 days a new request from them is
  -- answered 'pending' without reaching me (send_friend_request)
  delete from public.friendships where user_a = v_a and user_b = v_b;
  delete from public.notifications where user_id = me and kind = 'friend_request' and actor_id = p_user;
  insert into private.friend_request_declines (requester, decliner, requested_at) values (p_user, me, f.created_at)
  on conflict (requester, decliner) do update
    set declined_at = now(), requested_at = excluded.requested_at, pending_shown = true;
  delete from private.friend_request_declines where declined_at < now() - interval '30 days';   -- keep the table small
  return 'declined';
end;
$$;

-- Cancelling a request that is cooling down: it disappears for the requester (the cool-down itself goes on).
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
    update private.friend_request_declines set pending_shown = false
    where requester = me and decliner = p_user and pending_shown;
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

create or replace function public.list_friend_requests()
returns table (direction text, id uuid, username text, display_name text, avatar_url text, requested_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select * from (
    select case when f.requested_by = auth.uid() then 'outgoing' else 'incoming' end,
           p.id, p.username, p.display_name, p.avatar_url, f.created_at
    from public.friendships f
    join public.profiles p on p.id = case when f.user_a = auth.uid() then f.user_b else f.user_a end
    where f.status = 'pending'
      and (f.user_a = auth.uid() or f.user_b = auth.uid())
      and p.deleted_at is null
    union all
    -- declined less than 30 days ago: to the requester it looks like a request not answered yet
    select 'outgoing', p.id, p.username, p.display_name, p.avatar_url, d.requested_at
    from private.friend_request_declines d
    join public.profiles p on p.id = d.decliner
    where d.requester = auth.uid()
      and d.pending_shown and d.declined_at > now() - interval '30 days'
      and p.deleted_at is null
      and not private.is_blocked(auth.uid(), p.id)
      and not exists (select 1 from public.friendships x
                      where x.user_a = least(auth.uid(), p.id) and x.user_b = greatest(auth.uid(), p.id))
  ) r
  order by 6 desc
  limit 200;
$$;

-- ---------------------------------------------------------------------------
-- 3. search_pilgrims: 30 calls per minute, 3 characters minimum
-- ---------------------------------------------------------------------------
create table if not exists private.search_log (
  user_id   uuid not null references public.profiles (id) on delete cascade,
  called_at timestamptz not null default clock_timestamp()
);
create index if not exists search_log_user_idx on private.search_log (user_id, called_at);
alter table private.search_log enable row level security;
revoke all on private.search_log from public, anon, authenticated;

create or replace function public.search_pilgrims(p_query text, p_limit integer default 20)
returns table (id uuid, username text, display_name text, avatar_url text, is_private boolean, friend_status text)
language plpgsql
volatile
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
  if char_length(v_q) < 3 then
    return;
  end if;
  -- at most 30 searches a minute (a person types; a script scrapes)
  delete from private.search_log where user_id = me and called_at < clock_timestamp() - interval '1 minute';
  if (select count(*) from private.search_log where user_id = me) >= 30 then
    raise exception 'You are searching very fast. Wait a moment and try again.'
      using errcode = '54000', hint = 'rate_limited_search';
  end if;
  insert into private.search_log (user_id) values (me);

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
              when f.status is null and private.cooling_request(me, p.id) then 'pending_out'
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

-- ---------------------------------------------------------------------------
-- 4. Grants (explicit)
-- ---------------------------------------------------------------------------
revoke execute on function private.recent_writes(text, interval), private.write_exists(text, jsonb),
  private.rate_limit_before_insert() from public, anon, authenticated;
-- the trigger runs as the caller and calls the two helpers (they only ever look at the caller's own rows)
grant execute on function private.recent_writes(text, interval), private.write_exists(text, jsonb)
  to authenticated, service_role;
revoke execute on function private.cooling_request(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.send_friend_request(uuid), public.respond_friend_request(uuid, boolean),
  public.cancel_friend_request(uuid), public.list_friend_requests(),
  public.search_pilgrims(text, integer) from public, anon;
grant execute on function public.send_friend_request(uuid), public.respond_friend_request(uuid, boolean),
  public.cancel_friend_request(uuid), public.list_friend_requests(),
  public.search_pilgrims(text, integer) to authenticated, service_role;
