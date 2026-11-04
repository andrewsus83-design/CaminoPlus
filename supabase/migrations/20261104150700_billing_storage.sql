-- =============================================================================
-- CaminoPlus 08: billing (RevenueCat) and per-user cloud storage
-- Plan: CaminoPlus yearly $11.99, includes 5 GB of photo/video storage.
-- Add-on: +5 GB for $5 per year (stackable).
-- Subscription rows are written only by the RevenueCat webhook (an edge
-- function using service_role). Clients read their own state.
-- =============================================================================

create table public.billing_products (
  id                   text primary key,            -- 'plus_yearly', 'storage_5gb_yearly'
  kind                 text not null check (kind in ('subscription', 'storage_addon')),
  name                 text not null,
  price_cents          integer not null,
  currency             char(3) not null default 'USD',
  billing_period       text not null default 'year' check (billing_period in ('month', 'year', 'lifetime')),
  storage_bytes        bigint not null default 0,
  revenuecat_entitlement text,
  store_product_ids    jsonb not null default '{}',  -- {"app_store": "...", "play_store": "..."}
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table public.subscriptions (
  user_id                 uuid primary key references public.profiles (id) on delete cascade,
  product_id              text references public.billing_products (id),
  entitlement             text not null default 'plus',
  status                  text not null default 'none' check (status in (
                            'none', 'trial', 'active', 'grace', 'billing_issue', 'cancelled', 'expired', 'paused')),
  store                   text check (store in ('app_store', 'play_store', 'stripe', 'promotional')),
  environment             text not null default 'production' check (environment in ('production', 'sandbox')),
  will_renew              boolean not null default false,
  period_started_at       timestamptz,
  expires_at              timestamptz,
  grace_expires_at        timestamptz,
  cancelled_at            timestamptz,
  original_transaction_id text,
  revenuecat_app_user_id  text,
  last_event_id           text,
  last_event_at           timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create table public.storage_addons (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  product_id     text not null references public.billing_products (id),
  quantity       integer not null default 1 check (quantity > 0),
  storage_bytes  bigint not null,               -- per unit, copied from the product
  store          text check (store in ('app_store', 'play_store', 'stripe', 'promotional')),
  transaction_id text unique,
  status         text not null default 'active' check (status in ('active', 'expired', 'refunded', 'cancelled')),
  will_renew     boolean not null default true,
  purchased_at   timestamptz not null default now(),
  expires_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index storage_addons_user_idx on public.storage_addons (user_id);

-- Raw RevenueCat webhook log, for idempotency and debugging. Server only.
create table public.revenuecat_events (
  id           text primary key,                -- RevenueCat event.id
  type         text not null,
  app_user_id  text,
  user_id      uuid references public.profiles (id) on delete set null,
  product_id   text,
  payload      jsonb not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  error        text
);

-- Cached usage of the user's cloud storage (bucket `user-media`).
create table public.storage_usage (
  user_id            uuid primary key references public.profiles (id) on delete cascade,
  used_bytes         bigint not null default 0,
  object_count       integer not null default 0,
  last_calculated_at timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger billing_products_touch before update on public.billing_products for each row execute function private.touch_updated_at();
create trigger subscriptions_touch    before update on public.subscriptions    for each row execute function private.touch_updated_at();
create trigger storage_addons_touch   before update on public.storage_addons   for each row execute function private.touch_row();

-- -----------------------------------------------------------------------------
-- Entitlement and quota helpers
-- -----------------------------------------------------------------------------
create or replace function private.has_plus(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = p_user
      and s.status in ('trial', 'active', 'grace', 'billing_issue', 'cancelled')
      and coalesce(s.grace_expires_at, s.expires_at, 'infinity'::timestamptz) > now()
  );
$$;

-- quota = plan storage (if subscribed) + active add-ons, or the free quota.
create or replace function private.storage_quota_bytes(p_user uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select
    case when private.has_plus(p_user)
      then coalesce((select storage_bytes from public.billing_products where id = 'plus_yearly'), 5368709120)
      else private.config_bigint('free_storage_bytes', 0)
    end
    + coalesce((
        select sum(a.storage_bytes * a.quantity)
        from public.storage_addons a
        where a.user_id = p_user and a.status = 'active'
          and coalesce(a.expires_at, 'infinity'::timestamptz) > now()
      ), 0)::bigint;
$$;

create or replace function private.storage_remaining_bytes(p_user uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select private.storage_quota_bytes(p_user)
       - coalesce((select used_bytes from public.storage_usage where user_id = p_user), 0);
$$;
grant execute on function private.has_plus(uuid), private.storage_quota_bytes(uuid),
  private.storage_remaining_bytes(uuid) to authenticated, service_role;

-- Recount a user's bytes from storage.objects (metadata.size).
create or replace function private.recalculate_storage_usage(p_user uuid)
returns public.storage_usage
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.storage_usage;
begin
  insert into public.storage_usage as su (user_id, used_bytes, object_count, last_calculated_at, updated_at)
  select p_user,
         coalesce(sum((o.metadata ->> 'size')::bigint), 0),
         count(*),
         now(), now()
  from storage.objects o
  where o.bucket_id = 'user-media'
    and (storage.foldername(o.name))[1] = p_user::text
  on conflict (user_id) do update set
    used_bytes = excluded.used_bytes,
    object_count = excluded.object_count,
    last_calculated_at = excluded.last_calculated_at,
    updated_at = excluded.updated_at
  returning * into result;
  return result;
end;
$$;

-- Starts every new profile with an empty usage row.
create or replace function private.profiles_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.storage_usage (user_id) values (new.id) on conflict do nothing;
  insert into public.subscriptions (user_id) values (new.id) on conflict do nothing;
  return null;
end;
$$;
create trigger profiles_after_insert after insert on public.profiles
  for each row execute function private.profiles_after_insert();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.billing_products  enable row level security;
alter table public.subscriptions     enable row level security;
alter table public.storage_addons    enable row level security;
alter table public.revenuecat_events enable row level security;
alter table public.storage_usage     enable row level security;

revoke insert, update, delete on public.billing_products, public.subscriptions, public.storage_addons,
  public.storage_usage from anon, authenticated;
revoke all on public.revenuecat_events from anon, authenticated;

create policy "products are public" on public.billing_products for select to anon, authenticated using (is_active);
create policy "own subscription"   on public.subscriptions  for select to authenticated using (user_id = (select auth.uid()));
create policy "own addons"         on public.storage_addons for select to authenticated using (user_id = (select auth.uid()));
create policy "own storage usage"  on public.storage_usage  for select to authenticated using (user_id = (select auth.uid()));
-- revenuecat_events: no policies -> service_role only.

-- -----------------------------------------------------------------------------
-- Storage buckets and policies
--   avatars      public read, owner write, files under <user_id>/...
--   user-media   private; post photos/videos, stamp photos, crowd photos.
--                Counts toward the user's quota. Files under <user_id>/...
--   public-media public read, server write (stay photos, covers, curated)
-- Audio stories and offline map packs are served from Cloudflare R2/CDN.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('user-media', 'user-media', false, 209715200,
     array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4', 'video/quicktime']),
  ('public-media', 'public-media', true, 20971520, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "avatars are public" on storage.objects for select to anon, authenticated
  using (bucket_id = 'avatars');
create policy "upload own avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "replace own avatar" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "delete own avatar" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "public media is public" on storage.objects for select to anon, authenticated
  using (bucket_id = 'public-media');

-- user-media: the owner, or anyone allowed to see the post / stamp / crowd
-- report that references the file (RLS of those tables applies).
create policy "read user media" on storage.objects for select to authenticated
  using (
    bucket_id = 'user-media'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (select 1 from public.post_media m where m.storage_path = name or m.thumb_path = name)
      or exists (select 1 from public.user_stamps s where s.photo_path = name)
      or exists (select 1 from public.crowd_reports c where c.photo_path = name)
    )
  );
create policy "upload own media within quota" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'user-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.storage_remaining_bytes((select auth.uid())) > 0
  );
create policy "update own media" on storage.objects for update to authenticated
  using (bucket_id = 'user-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "delete own media" on storage.objects for delete to authenticated
  using (bucket_id = 'user-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

create index if not exists user_stamps_photo_idx on public.user_stamps (photo_path) where photo_path is not null;
create index if not exists crowd_reports_photo_idx on public.crowd_reports (photo_path) where photo_path is not null;
