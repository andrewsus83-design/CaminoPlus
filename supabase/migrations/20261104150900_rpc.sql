-- =============================================================================
-- CaminoPlus 10: RPC functions used by the app (supabase.rpc(...))
-- Read functions are SECURITY INVOKER so normal RLS applies.
-- =============================================================================

-- Stays tab search: distance, category, rating, price, labels, favourites.
create or replace function public.search_stays(
  p_lat            double precision,
  p_lng            double precision,
  p_radius_m       integer default 20000,
  p_kind           text default null,          -- 'stay' | 'food'
  p_categories     text[] default null,
  p_min_rating     numeric default null,
  p_max_price      numeric default null,
  p_labels         text[] default null,        -- must have all
  p_only_favorites boolean default false,
  p_query          text default null,
  p_limit          integer default 50,
  p_offset         integer default 0
)
returns table (stay public.stays, distance_m double precision, is_favorite boolean)
language sql
stable
set search_path = public, extensions
as $$
  with origin as (
    select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as g
  )
  select s,
         st_distance(s.location, origin.g) as distance_m,
         exists (select 1 from public.favorites f
                 where f.stay_id = s.id and f.user_id = auth.uid() and f.deleted_at is null) as is_favorite
  from public.stays s, origin
  where s.deleted_at is null
    and st_dwithin(s.location, origin.g, least(p_radius_m, 200000))
    and (p_kind is null or s.kind = p_kind)
    and (p_categories is null or s.category = any (p_categories))
    and (p_min_rating is null or s.rating_avg >= p_min_rating)
    and (p_max_price is null or s.price_from <= p_max_price)
    and (p_labels is null or s.labels @> p_labels)
    and (p_query is null or s.name ilike '%' || p_query || '%')
    and (not p_only_favorites or exists (
          select 1 from public.favorites f
          where f.stay_id = s.id and f.user_id = auth.uid() and f.deleted_at is null))
  order by s.location <-> origin.g
  limit least(p_limit, 200) offset p_offset;
$$;

-- Maps tab: POIs around a point.
create or replace function public.nearby_pois(
  p_lat        double precision,
  p_lng        double precision,
  p_radius_m   integer default 5000,
  p_categories text[] default null,
  p_limit      integer default 200
)
returns table (poi public.pois, distance_m double precision)
language sql
stable
set search_path = public, extensions
as $$
  with origin as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as g)
  select p, st_distance(p.location, origin.g)
  from public.pois p, origin
  where p.deleted_at is null
    and st_dwithin(p.location, origin.g, least(p_radius_m, 100000))
    and (p_categories is null or p.category = any (p_categories))
  order by p.location <-> origin.g
  limit least(p_limit, 500);
$$;

-- Maps tab: live crowd reports around a point (RLS hides expired ones).
create or replace function public.nearby_crowd_reports(
  p_lat      double precision,
  p_lng      double precision,
  p_radius_m integer default 10000
)
returns setof public.crowd_reports
language sql
stable
set search_path = public, extensions
as $$
  select r.*
  from public.crowd_reports r
  where r.deleted_at is null
    and r.expires_at > now()
    and st_dwithin(r.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, least(p_radius_m, 100000))
  order by r.created_at desc
  limit 300;
$$;

-- Scavenger hunt step completion. Idempotent: replaying the same outbox item
-- returns the same result. Verification happens here, on the server.
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
  ok        boolean := false;
  remaining integer;
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

  if p_lat is not null and p_lng is not null then
    here := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  end if;
  target := coalesce(step.location, (select location from public.pois where id = step.poi_id));

  ok := case step.verification
    when 'gps'    then here is not null and target is not null and extensions.st_dwithin(here, target, step.radius_m)
    when 'photo'  then p_photo_path is not null and p_photo_path like me::text || '/%'
                       and (target is null or here is null or extensions.st_dwithin(here, target, step.radius_m * 3))
    when 'answer' then exists (select 1 from private.hunt_step_answers a
                               where a.step_id = step.id and lower(trim(a.answer)) = lower(trim(coalesce(p_answer, ''))))
    when 'qr'     then exists (select 1 from private.hunt_step_answers a
                               where a.step_id = step.id and a.answer = coalesce(p_answer, ''))
    else false
  end;
  if not ok then
    return jsonb_build_object('ok', false, 'error', 'verification_failed');
  end if;

  insert into public.hunt_progress (user_id, hunt_id) values (me, hunt.id) on conflict do nothing;
  insert into public.hunt_step_completions (id, user_id, step_id, completed_at, location, photo_path)
  values (coalesce(p_id, gen_random_uuid()), me, step.id, least(coalesce(p_completed_at, now()), now()), here, p_photo_path)
  on conflict do nothing;
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

-- Settings tab: plan, quota and usage in one call.
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
    'used_bytes',      coalesce(u.used_bytes, 0),
    'object_count',    coalesce(u.object_count, 0),
    'remaining_bytes', private.storage_quota_bytes(auth.uid()) - coalesce(u.used_bytes, 0),
    'calculated_at',   u.last_calculated_at
  )
  from (select 1) one
  left join public.storage_usage u on u.user_id = auth.uid();
$$;

-- Called by the app after an upload batch (and nightly by a cron job).
create or replace function public.refresh_my_storage_usage()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  perform private.recalculate_storage_usage(auth.uid());
  return public.get_my_storage();
end;
$$;
revoke execute on function public.get_my_storage(), public.refresh_my_storage_usage() from public, anon;
grant execute on function public.get_my_storage(), public.refresh_my_storage_usage() to authenticated;

-- What the current user is entitled to (free basic app vs CaminoPlus).
create or replace function public.get_my_entitlements()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'plan',                case when private.has_plus(auth.uid()) then 'plus' else 'free' end,
    'has_plus',            private.has_plus(auth.uid()),
    'can_download_routes', private.has_plus(auth.uid()),
    'storage_quota_bytes', private.storage_quota_bytes(auth.uid())
  );
$$;

-- Offline pack catalog without download URLs (for the upgrade screen).
create or replace function public.offline_pack_catalog(p_route_id uuid)
returns table (id uuid, route_id uuid, stage_id uuid, kind text, format text,
               version integer, size_bytes bigint, published_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.route_id, p.stage_id, p.kind, p.format, p.version, p.size_bytes, p.published_at
  from public.offline_packs p
  where p.route_id = p_route_id and p.is_current and p.deleted_at is null
  order by p.stage_id nulls first, p.kind;
$$;
revoke execute on function public.get_my_entitlements(), public.offline_pack_catalog(uuid) from public, anon;
grant execute on function public.get_my_entitlements(), public.offline_pack_catalog(uuid) to authenticated;

-- Housekeeping for a scheduled job (pg_cron), e.g. every 15 minutes:
--   select cron.schedule('caminoplus-housekeeping', '*/15 * * * *', 'select private.housekeeping()');
create or replace function private.housekeeping()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- expired crowd reports older than 30 days are deleted for good
  delete from public.crowd_reports where expires_at < now() - interval '30 days';
  -- expired add-ons
  update public.storage_addons set status = 'expired'
  where status = 'active' and expires_at is not null and expires_at < now();
end;
$$;

-- Realtime for the live map and comments (publication exists on Supabase).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.crowd_reports, public.post_comments;
  end if;
end $$;

-- Safety net: fail the migration if any public table is missing RLS.
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
