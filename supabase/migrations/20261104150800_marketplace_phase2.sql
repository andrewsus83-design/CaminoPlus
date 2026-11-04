-- =============================================================================
-- CaminoPlus 09: photo marketplace (PHASE 2, tables only, feature off)
-- Photographers list photos taken along the Camino; pilgrims who opted in to
-- face matching get suggestions of photos they appear in and can buy them.
--
-- Face templates are biometric data (GDPR art. 9). They are NOT stored in
-- this schema. Matching runs in a separate service that only writes match
-- results here, and only for users with an active consent row.
-- =============================================================================

create table public.face_match_consents (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  consent_version text not null,
  granted_at      timestamptz not null default now(),
  revoked_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index face_match_consents_active_key on public.face_match_consents (user_id) where revoked_at is null;

create table public.marketplace_photos (
  id            uuid primary key default gen_random_uuid(),
  seller_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  original_path text not null,       -- private bucket, delivered after purchase via signed URL
  preview_path  text not null,       -- watermarked preview
  price_cents   integer not null check (price_cents >= 0),
  currency      char(3) not null default 'USD',
  taken_at      timestamptz,
  location      extensions.geography(Point, 4326),
  stage_id      uuid references public.stages (id),
  poi_id        uuid references public.pois (id),
  status        text not null default 'draft' check (status in ('draft', 'listed', 'removed')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index marketplace_photos_seller_idx on public.marketplace_photos (seller_id);

create table public.photo_face_matches (
  photo_id   uuid not null references public.marketplace_photos (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  score      real not null,
  status     text not null default 'suggested' check (status in ('suggested', 'confirmed', 'rejected')),
  matched_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (photo_id, user_id)
);
create index photo_face_matches_user_idx on public.photo_face_matches (user_id, status);

create table public.marketplace_purchases (
  id              uuid primary key default gen_random_uuid(),
  buyer_id        uuid not null references public.profiles (id) on delete cascade,
  photo_id        uuid not null references public.marketplace_photos (id),
  price_cents     integer not null,
  currency        char(3) not null,
  payment_provider text not null check (payment_provider in ('app_store', 'play_store', 'stripe')),
  payment_ref     text not null unique,
  status          text not null default 'paid' check (status in ('pending', 'paid', 'refunded')),
  purchased_at    timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index marketplace_purchases_buyer_idx on public.marketplace_purchases (buyer_id);

create trigger face_match_consents_touch before update on public.face_match_consents for each row execute function private.touch_row();
create trigger marketplace_photos_touch  before update on public.marketplace_photos  for each row execute function private.touch_row();
create trigger photo_face_matches_touch  before update on public.photo_face_matches  for each row execute function private.touch_updated_at();

-- Revoking consent deletes pending matches right away.
create or replace function private.face_consent_revoked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.revoked_at is not null and old.revoked_at is null then
    delete from public.photo_face_matches where user_id = new.user_id and status <> 'confirmed';
  end if;
  return null;
end;
$$;
create trigger face_match_consents_revoked after update of revoked_at on public.face_match_consents
  for each row execute function private.face_consent_revoked();

alter table public.face_match_consents   enable row level security;
alter table public.marketplace_photos    enable row level security;
alter table public.photo_face_matches    enable row level security;
alter table public.marketplace_purchases enable row level security;

create policy "own consents" on public.face_match_consents for select to authenticated
  using (user_id = (select auth.uid()));
create policy "give consent" on public.face_match_consents for insert to authenticated
  with check (user_id = (select auth.uid()) and revoked_at is null);
create policy "revoke consent" on public.face_match_consents for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- A listed photo is visible to its seller, to people matched in it, and to buyers.
create policy "seller, matched people and buyers see photos" on public.marketplace_photos for select to authenticated
  using (
    seller_id = (select auth.uid())
    or (status = 'listed' and deleted_at is null and exists (
          select 1 from public.photo_face_matches m
          where m.photo_id = marketplace_photos.id and m.user_id = (select auth.uid()) and m.status <> 'rejected'))
    or exists (select 1 from public.marketplace_purchases p
               where p.photo_id = marketplace_photos.id and p.buyer_id = (select auth.uid()) and p.status = 'paid')
  );
create policy "sellers manage own listings" on public.marketplace_photos for insert to authenticated
  with check (seller_id = (select auth.uid()));
create policy "sellers edit own listings" on public.marketplace_photos for update to authenticated
  using (seller_id = (select auth.uid())) with check (seller_id = (select auth.uid()));

create policy "own matches" on public.photo_face_matches for select to authenticated
  using (user_id = (select auth.uid()));
create policy "confirm or reject own matches" on public.photo_face_matches for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own purchases" on public.marketplace_purchases for select to authenticated
  using (buyer_id = (select auth.uid()));

revoke delete on public.face_match_consents, public.marketplace_photos from anon, authenticated;
revoke insert, delete on public.photo_face_matches from anon, authenticated;
revoke update on public.photo_face_matches from anon, authenticated;
grant update (status) on public.photo_face_matches to authenticated;
revoke insert, update, delete on public.marketplace_purchases from anon, authenticated;
