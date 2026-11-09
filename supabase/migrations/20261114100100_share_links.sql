-- =============================================================================
-- CaminoPlus: share ONE plan or ONE note through a link
--
-- WHY. The plan and the notes are private (20261114100000_plan_private.sql). The owner's rule: they are
-- not open to friends; a pilgrim may share ONE plan or ONE note through a link that opens just that item.
-- Anybody who has the link can see it until the pilgrim stops sharing it.
--
-- WHAT. Not destructive: one new table and four new functions, and export_my_data() lists the links.
--   public.shared_links   one row per link. Owner-only row level security, and no table privilege for
--                         anon or authenticated at all: rows are made, listed and stopped only through the
--                         functions below. The token is NEVER stored: only sha256(token).
--   create_share_link()   signed in; makes a link and returns {id, token, expires_at}. The token is shown
--                         once (32 random bytes, base64url, 43 characters).
--   list_share_links()    signed in; my links, without token or hash.
--   revoke_share_link()   signed in; stops one of my links (idempotent). A stopped note link loses its copy.
--   get_shared(token)     anon and signed in; what the link shows, or null. One generic null for an unknown,
--                         stopped or expired link (nobody learns which). Counts the view (once a minute at most). An expired
--                         note link loses its copy when it is opened (and at its owner's next create_share_link).
--
--   A PLAN link is LIVE: it reads the plan when it is opened. It shows, field by field, ONLY: the route name,
--   the start date, the total km, and per day: day number, planned date, from, to, planned km, status; the
--   name of the stay of each day only when the pilgrim chose it (options.stays, default false). Never the
--   notes of a day, the booking status, a contact, health, GPS, stamps or tasks.
--   A NOTE link is a COPY made when it is shared ({title, body, place, written_at}); the note itself stays on
--   the phone. Photos and videos are not part of a link (v1).
--
-- Limits: note body 20,000 characters, title 200, place 200, label 80, the copy 100 KB (22001 with a hint); at most 50 active
-- links per person; views are counted at most once a minute per link;
-- expiry 1 to 365 days or none. Account deletion removes the links (owner_id references auth.users on
-- delete cascade). Tests: supabase/dev/share_links_smoke.sql.
-- Idempotent: if not exists / create or replace / drop policy if exists.
-- =============================================================================

-- pgcrypto (gen_random_bytes) is on the hosted project already (schema extensions); this is for a fresh database.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.shared_links (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users (id) on delete cascade,
  kind           text not null check (kind in ('plan', 'note')),
  journey_id     uuid references public.journeys (id) on delete cascade,
  snapshot       jsonb,
  options        jsonb not null default '{}'::jsonb check (jsonb_typeof(options) = 'object'),
  label          text check (char_length(label) <= 80),
  token_hash     bytea not null unique check (octet_length(token_hash) = 32),
  created_at     timestamptz not null default now(),
  expires_at     timestamptz,
  revoked_at     timestamptz,
  last_viewed_at timestamptz,
  view_count     integer not null default 0 check (view_count >= 0),
  -- a plan link points at a journey and carries no copy; a note link carries a copy (wiped when it is stopped)
  constraint shared_links_shape check (
    (kind = 'plan' and journey_id is not null and snapshot is null)
    or (kind = 'note' and journey_id is null and (snapshot is not null or revoked_at is not null))
  ),
  constraint shared_links_snapshot_size check (snapshot is null or octet_length(snapshot::text) <= 100000)
);
create index if not exists shared_links_owner_idx on public.shared_links (owner_id, created_at desc);
create index if not exists shared_links_journey_idx on public.shared_links (journey_id) where journey_id is not null;

alter table public.shared_links enable row level security;
revoke all on public.shared_links from public, anon, authenticated;
-- Defence in depth only: there is no table privilege for the API roles, so this policy is never reached
-- unless somebody grants one later. Then it still shows nobody else's links.
drop policy if exists "shared links: owner only" on public.shared_links;
create policy "shared links: owner only" on public.shared_links for select to authenticated
  using (owner_id = (select auth.uid()));

comment on table public.shared_links is
  'Share links of ONE plan or ONE note. Only sha256(token) is stored. Use create_share_link / list_share_links / revoke_share_link / get_shared.';

-- -----------------------------------------------------------------------------
-- create_share_link
-- -----------------------------------------------------------------------------
create or replace function public.create_share_link(
  p_kind text,
  p_journey_id uuid default null,
  p_note jsonb default null,
  p_options jsonb default '{}'::jsonb,
  p_label text default null,
  p_expires_days integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_token text;
  v_hash bytea;
  v_id uuid;
  v_expires timestamptz;
  v_snapshot jsonb := null;
  v_options jsonb := '{}'::jsonb;
  v_label text := nullif(btrim(coalesce(p_label, '')), '');
  v_title text;
  v_body text;
  v_place text;
  v_written timestamptz;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if p_kind is null or p_kind not in ('plan', 'note') then
    raise exception 'kind must be plan or note' using errcode = '22023';
  end if;
  if v_label is not null and char_length(v_label) > 80 then
    raise exception 'label is too long (80 characters at most)' using errcode = '22001';
  end if;
  if p_expires_days is not null and (p_expires_days < 1 or p_expires_days > 365) then
    raise exception 'expiry must be 1 to 365 days, or none' using errcode = '22023';
  end if;
  if p_options is not null and jsonb_typeof(p_options) <> 'object' then
    raise exception 'options must be an object' using errcode = '22023';
  end if;

  if p_kind = 'plan' then
    if p_note is not null then
      raise exception 'a plan link carries no note' using errcode = '22023';
    end if;
    if p_journey_id is null or not exists (
      select 1 from public.journeys j where j.id = p_journey_id and j.user_id = v_uid and j.deleted_at is null
    ) then
      raise exception 'that plan is not yours' using errcode = '42501';
    end if;
    -- whitelist: the only option of a plan link is whether the stay names are shown
    if p_options ? 'stays' and jsonb_typeof(p_options -> 'stays') <> 'boolean' then
      raise exception 'options.stays must be true or false' using errcode = '22023';
    end if;
    v_options := jsonb_build_object('stays', coalesce((p_options ->> 'stays')::boolean, false));
  else
    if p_journey_id is not null then
      raise exception 'a note link points at no plan' using errcode = '22023';
    end if;
    if p_note is null or jsonb_typeof(p_note) <> 'object' then
      raise exception 'a note link needs the note' using errcode = '22023';
    end if;
    if (p_note ? 'title' and jsonb_typeof(p_note -> 'title') not in ('string', 'null'))
       or (p_note ? 'body' and jsonb_typeof(p_note -> 'body') not in ('string', 'null'))
       or (p_note ? 'place' and jsonb_typeof(p_note -> 'place') not in ('string', 'null'))
       or (p_note ? 'written_at' and jsonb_typeof(p_note -> 'written_at') not in ('string', 'null')) then
      raise exception 'title, body, place and written_at are text' using errcode = '22023';
    end if;
    v_title := nullif(btrim(coalesce(p_note ->> 'title', '')), '');
    v_body := coalesce(p_note ->> 'body', '');
    v_place := nullif(btrim(coalesce(p_note ->> 'place', '')), '');
    if btrim(v_body) = '' and v_title is null then
      raise exception 'the note is empty' using errcode = '22023';
    end if;
    if char_length(v_body) > 20000 then
      raise exception 'the note is too long (20,000 characters at most)' using errcode = '22001';
    end if;
    if char_length(coalesce(v_title, '')) > 200 then
      raise exception 'the title is too long (200 characters at most)' using errcode = '22001';
    end if;
    if char_length(coalesce(v_place, '')) > 200 then
      raise exception 'the place is too long (200 characters at most)' using errcode = '22001';
    end if;
    if nullif(p_note ->> 'written_at', '') is not null then
      begin
        v_written := (p_note ->> 'written_at')::timestamptz;
      exception when others then
        raise exception 'written_at is not a date' using errcode = '22007';
      end;
    end if;
    -- whitelist: exactly these four keys are kept; anything else the app sends is dropped
    v_snapshot := jsonb_build_object('title', v_title, 'body', v_body, 'place', v_place, 'written_at', v_written);
    -- characters are not bytes: 20,000 control characters are 120 KB of JSON. Say so plainly, before the 100 KB CHECK would.
    if octet_length(v_snapshot::text) > 100000 then
      raise exception 'the note is too long to share' using errcode = '22001', hint = 'Make the note shorter and share it again.';
    end if;
    if p_options is not null and p_options <> '{}'::jsonb then
      raise exception 'a note link has no options' using errcode = '22023';
    end if;
  end if;

  -- one person at a time, so two quick taps cannot both pass the limit
  perform pg_advisory_xact_lock(hashtextextended('shared_links:' || v_uid::text, 0));
  -- copies of note links that have expired are wiped (the link already answers nothing)
  update public.shared_links set snapshot = null, revoked_at = coalesce(revoked_at, now())
  where owner_id = v_uid and kind = 'note' and snapshot is not null and expires_at is not null and expires_at <= now();
  if (select count(*) from public.shared_links l
      where l.owner_id = v_uid and l.revoked_at is null and (l.expires_at is null or l.expires_at > now())) >= 50 then
    raise exception 'you have 50 links: stop sharing one first' using errcode = '54000';
  end if;

  v_token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  v_hash := sha256(convert_to(v_token, 'UTF8'));
  v_expires := case when p_expires_days is null then null else now() + make_interval(days => p_expires_days) end;

  insert into public.shared_links (owner_id, kind, journey_id, snapshot, options, label, token_hash, expires_at)
  values (v_uid, p_kind, case when p_kind = 'plan' then p_journey_id end, v_snapshot, v_options, v_label, v_hash, v_expires)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'token', v_token, 'expires_at', v_expires);
end;
$$;

-- -----------------------------------------------------------------------------
-- list_share_links
-- -----------------------------------------------------------------------------
create or replace function public.list_share_links()
returns table (
  id uuid, kind text, label text, created_at timestamptz, expires_at timestamptz,
  revoked_at timestamptz, last_viewed_at timestamptz, view_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.kind, l.label, l.created_at, l.expires_at, l.revoked_at, l.last_viewed_at, l.view_count
  from public.shared_links l
  where l.owner_id = auth.uid()
  order by l.created_at desc
  limit 200;
$$;

-- -----------------------------------------------------------------------------
-- revoke_share_link
-- -----------------------------------------------------------------------------
create or replace function public.revoke_share_link(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  -- somebody else's id, or an unknown one, changes nothing and says nothing
  update public.shared_links l
  set revoked_at = coalesce(l.revoked_at, now()),
      snapshot = case when l.kind = 'note' then null else l.snapshot end
  where l.id = p_id and l.owner_id = v_uid;
end;
$$;

-- -----------------------------------------------------------------------------
-- get_shared: the one function the web page calls, with the publishable key
-- -----------------------------------------------------------------------------
create or replace function public.get_shared(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_link public.shared_links;
  v_owner text;
  v_plan jsonb;
  v_stays boolean;
begin
  -- 32 bytes in base64url without padding are exactly 43 characters of this alphabet; anything else is unknown
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    return null;
  end if;

  -- a note link that has expired loses its copy the first time anybody opens it (the answer is null either way)
  update public.shared_links l
  set snapshot = null, revoked_at = coalesce(l.revoked_at, now())
  where l.token_hash = sha256(convert_to(p_token, 'UTF8'))
    and l.kind = 'note' and l.snapshot is not null and l.expires_at is not null and l.expires_at <= now();

  select l.* into v_link
  from public.shared_links l
  where l.token_hash = sha256(convert_to(p_token, 'UTF8'))
    and l.revoked_at is null
    and (l.expires_at is null or l.expires_at > now());
  if not found then
    return null;
  end if;

  select coalesce(nullif(btrim(p.display_name), ''), 'A pilgrim') into v_owner
  from public.profiles p where p.id = v_link.owner_id and p.deleted_at is null;
  if not found then
    return null;
  end if;

  if v_link.kind = 'plan' then
    v_stays := coalesce((v_link.options ->> 'stays')::boolean, false);
    select jsonb_build_object(
             'route_name', r.name,
             'start_date', coalesce(j.planned_start_date, (select min(d.planned_date) from public.journey_days d
                                                            where d.journey_id = j.id and d.deleted_at is null)),
             'total_km', coalesce((select sum(d.planned_distance_km) from public.journey_days d
                                   where d.journey_id = j.id and d.deleted_at is null), j.planned_distance_km),
             'stays_included', v_stays,
             'days', coalesce((
               select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                        'day_number', d.day_number,
                        'planned_date', d.planned_date,
                        'from_name', d.from_name,
                        'to_name', d.to_name,
                        'planned_distance_km', d.planned_distance_km,
                        'status', d.status,
                        'stay_name', case when v_stays then s.name end
                      )) order by d.day_number)
               from (select * from public.journey_days dd
                     where dd.journey_id = j.id and dd.deleted_at is null
                     order by dd.day_number limit 400) d
               left join public.stays s on s.id = d.stay_id
             ), '[]'::jsonb))
      into v_plan
    from public.journeys j
    join public.routes r on r.id = j.route_id
    where j.id = v_link.journey_id and j.user_id = v_link.owner_id and j.deleted_at is null;
    if v_plan is null then
      return null;
    end if;
  elsif v_link.snapshot is null then
    return null;
  end if;

  -- counted at most once a minute: opening a link is not a write each time
  if v_link.last_viewed_at is null or v_link.last_viewed_at < now() - interval '1 minute' then
    update public.shared_links set view_count = view_count + 1, last_viewed_at = now() where id = v_link.id;
  end if;

  return jsonb_build_object(
    'kind', v_link.kind,
    'owner', jsonb_build_object('display_name', v_owner),
    'plan', v_plan,
    'note', case when v_link.kind = 'note' then jsonb_build_object(
              'title', v_link.snapshot ->> 'title',
              'body', v_link.snapshot ->> 'body',
              'place', v_link.snapshot ->> 'place',
              'written_at', v_link.snapshot ->> 'written_at') end
  );
end;
$$;

revoke all on function public.create_share_link(text, uuid, jsonb, jsonb, text, integer) from public, anon;
revoke all on function public.list_share_links() from public, anon;
revoke all on function public.revoke_share_link(uuid) from public, anon;
revoke all on function public.get_shared(text) from public;
grant execute on function public.create_share_link(text, uuid, jsonb, jsonb, text, integer) to authenticated, service_role;
grant execute on function public.list_share_links() to authenticated, service_role;
grant execute on function public.revoke_share_link(uuid) to authenticated, service_role;
grant execute on function public.get_shared(text) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- export_my_data: the same as 20261109000000_export_my_data.sql plus "shared_links" (what each link is and
-- shows; never the token or its hash).
-- -----------------------------------------------------------------------------
create or replace function public.export_my_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  return jsonb_build_object(
    'exported_at', now(),
    'user_id', v_uid,
    'profile',        (select to_jsonb(t) from public.profiles t where t.id = v_uid),
    'settings',       (select to_jsonb(t) from public.user_settings t where t.user_id = v_uid),
    'journeys',       coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.journeys t where t.user_id = v_uid), '[]'),
    'journey_days',   coalesce((select jsonb_agg(to_jsonb(t)) from public.journey_days t where t.user_id = v_uid), '[]'),
    'journey_private',coalesce((select jsonb_agg(to_jsonb(t)) from public.journey_private t where t.user_id = v_uid), '[]'),
    'stamps',         coalesce((select jsonb_agg(to_jsonb(t)) from public.user_stamps t where t.user_id = v_uid), '[]'),
    'tracks',         coalesce((select jsonb_agg(to_jsonb(t)) from public.tracks t where t.user_id = v_uid), '[]'),
    'posts',          coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.posts t where t.user_id = v_uid), '[]'),
    'comments',       coalesce((select jsonb_agg(to_jsonb(t)) from public.post_comments t where t.user_id = v_uid), '[]'),
    'likes',          coalesce((select jsonb_agg(to_jsonb(t)) from public.post_likes t where t.user_id = v_uid), '[]'),
    'saved_posts',    coalesce((select jsonb_agg(to_jsonb(t)) from public.post_saves t where t.user_id = v_uid), '[]'),
    'favorites',      coalesce((select jsonb_agg(to_jsonb(t)) from public.favorites t where t.user_id = v_uid), '[]'),
    'stay_reviews',   coalesce((select jsonb_agg(to_jsonb(t)) from public.stay_reviews t where t.user_id = v_uid), '[]'),
    'crowd_reports',  coalesce((select jsonb_agg(to_jsonb(t)) from public.crowd_reports t where t.user_id = v_uid), '[]'),
    'friendships',    coalesce((select jsonb_agg(to_jsonb(t)) from public.friendships t where v_uid in (t.user_a, t.user_b)), '[]'),
    'following',      coalesce((select jsonb_agg(t.followee_id) from public.follows t where t.follower_id = v_uid), '[]'),
    'followers',      coalesce((select jsonb_agg(t.follower_id) from public.follows t where t.followee_id = v_uid), '[]'),
    'messages_sent',  coalesce((select jsonb_agg(to_jsonb(t)) from (select * from public.messages m where m.sender_id = v_uid order by m.created_at desc limit 5000) t), '[]'),
    'health_daily',   coalesce((select jsonb_agg(to_jsonb(t)) from public.health_daily t where t.user_id = v_uid), '[]'),
    'health_workouts',coalesce((select jsonb_agg(to_jsonb(t)) from public.health_workouts t where t.user_id = v_uid), '[]'),
    'achievements',   coalesce((select jsonb_agg(to_jsonb(t)) from public.user_achievements t where t.user_id = v_uid), '[]'),
    'xp_events',      coalesce((select jsonb_agg(to_jsonb(t)) from public.xp_events t where t.user_id = v_uid), '[]'),
    'shared_links',   coalesce((select jsonb_agg(jsonb_build_object(
                         'id', t.id, 'kind', t.kind, 'journey_id', t.journey_id, 'note_copy', t.snapshot,
                         'options', t.options, 'label', t.label, 'created_at', t.created_at,
                         'expires_at', t.expires_at, 'revoked_at', t.revoked_at,
                         'last_viewed_at', t.last_viewed_at, 'view_count', t.view_count) order by t.created_at)
                       from public.shared_links t where t.owner_id = v_uid), '[]')
  );
end;
$$;

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
