-- =============================================================================
-- CaminoPlus 12: business owners (Settings > List your business)
-- Owners of albergues, hotels, cafes, shops and services on the Camino register
-- their business, Agoda-extranet style:
--
--   businesses             the owner's company (one account, many listings)
--   business_members       who can manage it (owner / manager / staff)
--   business_listings      a listing being registered or edited; the reviewed
--                          copy is published to public.stays
--   business_listing_photos
--   business_verifications proof of ownership (licence, tourism register, ...)
--   business_listing_events status timeline (draft -> submitted -> approved)
--   stay_availability      owner-set "beds free / full" per day
--   stay_review_replies    owner replies to pilgrim reviews
--   stay_stats_daily       views, saves and contact taps for the dashboard
--
-- Flow: owner fills a draft listing (new, or claims an existing OSM stay),
-- uploads photos + proof, calls submit_business_listing(). The team reviews it
-- with review_business_listing() (service_role only). On approval the listing
-- is copied into public.stays with business_id, owner_verified_at and the
-- `verified_owner` label, so it shows in the Stays tab as "Verified owner".
-- After approval, "safe" edits (description, contact, hours, prices, photos,
-- amenities) go live at once; "sensitive" edits (name, category, location,
-- address) send the listing back to review while the old version stays live.
--
-- Revenue hooks (no billing built yet): businesses.plan, businesses.commission_rate,
-- businesses.billing_customer_id, stays.listing_tier, stays.featured_until.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- stays: more business types, owner link, listing tier
-- -----------------------------------------------------------------------------
alter table public.stays drop constraint stays_category_check;
alter table public.stays add constraint stays_category_check check (category in (
  'albergue_municipal', 'albergue_parochial', 'albergue_private',
  'hostel', 'hotel', 'pension', 'guesthouse', 'casa_rural',
  'apartment', 'camping',
  'cafe', 'bar', 'restaurant', 'bakery',
  'shop', 'pharmacy', 'bike_service', 'luggage_service', 'tour_operator', 'other_service'));

alter table public.stays drop constraint stays_source_check;
alter table public.stays add constraint stays_source_check
  check (source in ('osm', 'tripadvisor', 'ota', 'partner', 'editorial', 'user', 'owner'));

-- kind now has a third value: 'service' (shops, pharmacies, bike and luggage
-- services, tour operators). Generated columns cannot be altered in place.
alter table public.stays drop column kind;
alter table public.stays add column kind text generated always as (
  case
    when category in ('cafe', 'bar', 'restaurant', 'bakery') then 'food'
    when category in ('shop', 'pharmacy', 'bike_service', 'luggage_service', 'tour_operator', 'other_service') then 'service'
    else 'stay'
  end
) stored;
create index stays_kind_idx on public.stays (kind);

-- photos uploaded by owners live in the business-media bucket
alter table public.stay_photos add column storage_bucket text not null default 'user-media'
  check (storage_bucket in ('user-media', 'public-media', 'business-media'));

-- -----------------------------------------------------------------------------
-- businesses and members
-- -----------------------------------------------------------------------------
create table public.businesses (
  id                  uuid primary key default gen_random_uuid(),
  created_by          uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  name                text not null check (char_length(name) between 2 and 120),  -- trading name
  legal_name          text,
  tax_id              text,                -- NIF / CIF / VAT number
  country_code        char(2),
  contact_name        text,
  contact_email       text,
  contact_phone       text,
  website             text,
  status              text not null default 'active' check (status in ('active', 'suspended')),
  -- revenue hooks, server maintained (billing not built yet)
  plan                text not null default 'free' check (plan in ('free', 'premium')),
  commission_rate     numeric(5, 4) not null default 0 check (commission_rate between 0 and 0.5),
  billing_customer_id text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);
create index businesses_created_by_idx on public.businesses (created_by);

create table public.business_members (
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        text not null default 'staff' check (role in ('owner', 'manager', 'staff')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index business_members_user_idx on public.business_members (user_id);

-- Is the current user a member of the business, with at least this role?
create or replace function private.is_business_member(p_business uuid, p_min_role text default 'staff')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.business_members m
    join public.businesses b on b.id = m.business_id
    where m.business_id = p_business
      and m.user_id = (select auth.uid())
      and b.deleted_at is null
      and case p_min_role
            when 'owner'   then m.role = 'owner'
            when 'manager' then m.role in ('owner', 'manager')
            else true
          end
  );
$$;
grant execute on function private.is_business_member(uuid, text) to authenticated;

-- the creator becomes the owner
create or replace function private.businesses_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.business_members (business_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict do nothing;
  return null;
end;
$$;
create trigger businesses_owner after insert on public.businesses
  for each row execute function private.businesses_after_insert();

alter table public.stays add column business_id       uuid references public.businesses (id) on delete set null;
alter table public.stays add column owner_verified_at timestamptz;
alter table public.stays add column listing_tier      text not null default 'standard'
  check (listing_tier in ('standard', 'featured', 'premium'));   -- paid listings later
alter table public.stays add column featured_until    timestamptz;
create index stays_business_idx on public.stays (business_id) where business_id is not null;

-- Does the current user manage this (published) stay?
create or replace function private.manages_stay(p_stay uuid, p_min_role text default 'staff')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.stays s
    where s.id = p_stay and s.business_id is not null
      and private.is_business_member(s.business_id, p_min_role)
  );
$$;
grant execute on function private.manages_stay(uuid, text) to authenticated;


-- -----------------------------------------------------------------------------
-- listings (the owner's editable copy of a stay)
-- -----------------------------------------------------------------------------
create table public.business_listings (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses (id) on delete cascade,
  stay_id         uuid references public.stays (id) on delete set null,   -- set when published
  claim_stay_id   uuid references public.stays (id) on delete set null,   -- existing OSM stay being claimed
  status          text not null default 'draft' check (status in (
                    'draft', 'submitted', 'in_review', 'changes_requested', 'approved', 'rejected', 'suspended')),
  -- what pilgrims will see (same meaning as the columns in public.stays)
  category        text not null check (category in (
                    'albergue_municipal', 'albergue_parochial', 'albergue_private',
                    'hostel', 'hotel', 'pension', 'guesthouse', 'casa_rural',
                    'apartment', 'camping',
                    'cafe', 'bar', 'restaurant', 'bakery',
                    'shop', 'pharmacy', 'bike_service', 'luggage_service', 'tour_operator', 'other_service')),
  name            text not null check (char_length(name) between 2 and 120),
  description     text check (char_length(description) <= 4000),
  address         text,
  place_id        uuid references public.places (id),
  route_id        uuid references public.routes (id),
  country_code    char(2),
  location        extensions.geography(Point, 4326),
  phone           text,
  email           text,
  whatsapp        text,
  website         text,
  booking_method  text not null default 'walk_in' check (booking_method in (
                    'walk_in', 'email', 'whatsapp', 'phone', 'website', 'ota', 'in_app')),
  booking_url     text,
  beds            integer check (beds is null or beds between 0 and 2000),
  opening_hours   text,                 -- OSM opening_hours syntax
  open_months     smallint[],
  amenities       text[] not null default '{}',
  labels          text[] not null default '{}',   -- owner-chosen: donativo, pilgrims_only, pet_friendly, ...
  languages       text[] not null default '{}',   -- ISO 639-1 spoken by staff
  price_from      numeric(8, 2) check (price_from is null or price_from >= 0),
  price_to        numeric(8, 2) check (price_to is null or price_to >= 0),
  currency        char(3) not null default 'EUR',
  -- review workflow, server maintained
  submitted_at    timestamptz,
  reviewed_at     timestamptz,
  reviewed_by     uuid references public.profiles (id) on delete set null,
  review_note     text,                 -- shown to the owner
  created_by      uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index business_listings_business_idx on public.business_listings (business_id);
create index business_listings_status_idx on public.business_listings (status) where deleted_at is null;
create unique index business_listings_one_per_stay on public.business_listings (stay_id)
  where stay_id is not null and deleted_at is null;
create unique index business_listings_one_claim on public.business_listings (claim_stay_id)
  where claim_stay_id is not null and deleted_at is null and status not in ('rejected');

create table public.business_listing_photos (
  id           uuid primary key default gen_random_uuid(),   -- reused as stay_photos.id when published
  listing_id   uuid not null references public.business_listings (id) on delete cascade,
  storage_path text not null,            -- business-media/<business_id>/...
  caption      text check (char_length(caption) <= 200),
  width        integer,
  height       integer,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index business_listing_photos_listing_idx on public.business_listing_photos (listing_id, sort_order);

create table public.business_verifications (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses (id) on delete cascade,
  listing_id    uuid references public.business_listings (id) on delete cascade,
  method        text not null check (method in ('document', 'phone', 'email', 'website', 'site_visit')),
  document_kind text check (document_kind in (
                  'business_licence', 'tourism_register', 'tax_id', 'utility_bill', 'id_document', 'other')),
  storage_path  text,                    -- business-docs/<business_id>/... (private)
  contact_value text,                    -- phone or email that was confirmed
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note   text,
  reviewed_by   uuid references public.profiles (id) on delete set null,
  reviewed_at   timestamptz,
  created_by    uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (method <> 'document' or storage_path is not null)
);
create index business_verifications_business_idx on public.business_verifications (business_id);
create index business_verifications_listing_idx on public.business_verifications (listing_id);

create table public.business_listing_events (
  id          bigint generated always as identity primary key,
  listing_id  uuid not null references public.business_listings (id) on delete cascade,
  from_status text,
  to_status   text not null,
  note        text,
  actor_id    uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index business_listing_events_listing_idx on public.business_listing_events (listing_id, created_at);

-- -----------------------------------------------------------------------------
-- tools for published stays: availability, review replies, stats
-- -----------------------------------------------------------------------------
create table public.stay_availability (
  stay_id    uuid not null references public.stays (id) on delete cascade,
  day        date not null,
  status     text not null check (status in ('available', 'few_left', 'full', 'closed')),
  beds_free  integer check (beds_free is null or beds_free >= 0),
  note       text check (char_length(note) <= 200),
  updated_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (stay_id, day)
);
create index stay_availability_updated_idx on public.stay_availability (updated_at);

create table public.stay_review_replies (
  id         uuid primary key default gen_random_uuid(),
  review_id  uuid not null unique references public.stay_reviews (id) on delete cascade,
  author_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.stay_stats_daily (
  stay_id         uuid not null references public.stays (id) on delete cascade,
  day             date not null default current_date,
  views           integer not null default 0,
  saves           integer not null default 0,
  contact_taps    integer not null default 0,
  directions_taps integer not null default 0,
  booking_taps    integer not null default 0,
  primary key (stay_id, day)
);

-- -----------------------------------------------------------------------------
-- triggers
-- -----------------------------------------------------------------------------
create trigger businesses_touch              before update on public.businesses              for each row execute function private.touch_row();
create trigger business_members_touch        before update on public.business_members        for each row execute function private.touch_updated_at();
create trigger business_listings_touch       before update on public.business_listings       for each row execute function private.touch_row();
create trigger business_listing_photos_touch before update on public.business_listing_photos for each row execute function private.touch_row();
create trigger business_verifications_touch  before update on public.business_verifications  for each row execute function private.touch_row();
create trigger stay_availability_touch       before update on public.stay_availability       for each row execute function private.touch_updated_at();
create trigger stay_review_replies_touch     before update on public.stay_review_replies     for each row execute function private.touch_row();

-- server maintained columns (triggers fire in name order: guard, then the rest)
create trigger businesses_guard before insert or update on public.businesses
  for each row execute function private.guard_columns('{"status": "active", "plan": "free", "commission_rate": 0, "billing_customer_id": null}');
create trigger business_listings_guard before insert or update on public.business_listings
  for each row execute function private.guard_columns('{"status": "draft", "stay_id": null, "submitted_at": null, "reviewed_at": null, "reviewed_by": null, "review_note": null}');
create trigger business_verifications_guard before insert or update on public.business_verifications
  for each row execute function private.guard_columns('{"status": "pending", "review_note": null, "reviewed_by": null, "reviewed_at": null}');

-- An owner edit of name, category, location or address on a live listing sends
-- it back to review. The published stay keeps the old values until approved.
create or replace function private.business_listings_resubmit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') and old.status = 'approved'
     and (new.name, new.category, new.address, new.location::text)
         is distinct from (old.name, old.category, old.address, old.location::text) then
    new.status := 'submitted';
    new.submitted_at := now();
    new.review_note := null;
  end if;
  return new;
end;
$$;
create trigger business_listings_resubmit before update on public.business_listings
  for each row execute function private.business_listings_resubmit();

-- status timeline
create or replace function private.business_listings_log_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.business_listing_events (listing_id, from_status, to_status, note, actor_id)
    values (new.id, case when tg_op = 'UPDATE' then old.status end, new.status,
            case when new.status in ('changes_requested', 'rejected', 'suspended') then new.review_note end,
            (select auth.uid()));
  end if;
  return null;
end;
$$;
create trigger business_listings_log after insert or update on public.business_listings
  for each row execute function private.business_listings_log_status();

-- Copy owner photos of a published listing into stay_photos (same ids).
create or replace function private.sync_listing_photos(p_listing uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  sid uuid;
begin
  select stay_id into sid from public.business_listings where id = p_listing and status = 'approved';
  if sid is null then
    return;
  end if;
  insert into public.stay_photos (id, stay_id, user_id, source, storage_bucket, storage_path, attribution, width, height, sort_order, deleted_at)
  select p.id, sid, null, 'owner', 'business-media', p.storage_path, p.caption, p.width, p.height, p.sort_order, p.deleted_at
  from public.business_listing_photos p
  where p.listing_id = p_listing
  on conflict (id) do update set
    storage_path = excluded.storage_path, attribution = excluded.attribution,
    sort_order = excluded.sort_order, deleted_at = excluded.deleted_at;
end;
$$;

-- Copy the listing into its stay. Called whenever an approved listing changes.
create or replace function private.sync_listing_to_stay()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'approved' and new.stay_id is not null then
    update public.stays s set
      business_id       = new.business_id,
      owner_verified_at = coalesce(s.owner_verified_at, now()),
      category          = new.category,
      name              = new.name,
      description       = new.description,
      address           = new.address,
      place_id          = coalesce(new.place_id, s.place_id),
      route_id          = coalesce(new.route_id, s.route_id),
      country_code      = coalesce(new.country_code, s.country_code),
      location          = coalesce(new.location, s.location),
      phone             = new.phone,
      email             = new.email,
      whatsapp          = new.whatsapp,
      website           = new.website,
      booking_method    = new.booking_method,
      booking_url       = new.booking_url,
      beds              = new.beds,
      opening_hours     = new.opening_hours,
      open_months       = new.open_months,
      amenities         = new.amenities,
      labels            = (select array(select distinct l from unnest(
                             array_remove(s.labels, 'verified_owner') || new.labels || array['verified_owner']) l
                           where l in (select slug from public.stay_labels))),
      price_from        = coalesce(new.price_from, s.price_from),
      price_to          = coalesce(new.price_to, s.price_to),
      currency          = new.currency,
      price_updated_at  = case when new.price_from is not null then now() else s.price_updated_at end,
      verified_at       = now(),
      deleted_at        = null
    where s.id = new.stay_id;
    perform private.sync_listing_photos(new.id);
  elsif tg_op = 'UPDATE' and old.status = 'approved' and new.status in ('suspended', 'rejected') and new.stay_id is not null then
    -- taken down: keep the OSM data, drop the owner badge
    update public.stays s set
      owner_verified_at = null,
      labels = array_remove(s.labels, 'verified_owner'),
      deleted_at = case when s.source = 'owner' then now() else s.deleted_at end
    where s.id = new.stay_id;
  end if;
  return null;
end;
$$;
create trigger business_listings_sync after update on public.business_listings
  for each row execute function private.sync_listing_to_stay();

create or replace function private.business_listing_photos_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sync_listing_photos(new.listing_id);
  return null;
end;
$$;
create trigger business_listing_photos_sync after insert or update on public.business_listing_photos
  for each row execute function private.business_listing_photos_after_write();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.businesses              enable row level security;
alter table public.business_members        enable row level security;
alter table public.business_listings       enable row level security;
alter table public.business_listing_photos enable row level security;
alter table public.business_verifications  enable row level security;
alter table public.business_listing_events enable row level security;
alter table public.stay_availability       enable row level security;
alter table public.stay_review_replies     enable row level security;
alter table public.stay_stats_daily        enable row level security;

-- businesses: private to members
create policy "members read their business" on public.businesses for select to authenticated
  using (created_by = (select auth.uid()) or private.is_business_member(id));
create policy "register a business" on public.businesses for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy "owners and managers edit business" on public.businesses for update to authenticated
  using (private.is_business_member(id, 'manager'))
  with check (private.is_business_member(id, 'manager'));

-- members: visible to co-members; only owners add / change / remove others
create policy "members see the team" on public.business_members for select to authenticated
  using (user_id = (select auth.uid()) or private.is_business_member(business_id));
create policy "owners add members" on public.business_members for insert to authenticated
  with check (private.is_business_member(business_id, 'owner') and user_id <> (select auth.uid()));
create policy "owners change members" on public.business_members for update to authenticated
  using (private.is_business_member(business_id, 'owner') and user_id <> (select auth.uid()))
  with check (private.is_business_member(business_id, 'owner') and user_id <> (select auth.uid()));
create policy "owners remove members" on public.business_members for delete to authenticated
  using (private.is_business_member(business_id, 'owner') and user_id <> (select auth.uid()));

-- listings: members read; owners/managers write while not under review
create policy "members read listings" on public.business_listings for select to authenticated
  using (private.is_business_member(business_id));
create policy "managers create listings" on public.business_listings for insert to authenticated
  with check (private.is_business_member(business_id, 'manager') and created_by = (select auth.uid()));
create policy "managers edit listings" on public.business_listings for update to authenticated
  using (private.is_business_member(business_id, 'manager')
         and status in ('draft', 'changes_requested', 'approved'))
  with check (private.is_business_member(business_id, 'manager'));

create policy "members read listing photos" on public.business_listing_photos for select to authenticated
  using (exists (select 1 from public.business_listings l
                 where l.id = listing_id and private.is_business_member(l.business_id)));
create policy "managers add listing photos" on public.business_listing_photos for insert to authenticated
  with check (exists (select 1 from public.business_listings l
                      where l.id = listing_id and private.is_business_member(l.business_id, 'manager')
                        and split_part(storage_path, '/', 1) = l.business_id::text));
create policy "managers edit listing photos" on public.business_listing_photos for update to authenticated
  using (exists (select 1 from public.business_listings l
                 where l.id = listing_id and private.is_business_member(l.business_id, 'manager')))
  with check (exists (select 1 from public.business_listings l
                      where l.id = listing_id and private.is_business_member(l.business_id, 'manager')
                        and split_part(storage_path, '/', 1) = l.business_id::text));

create policy "members read verifications" on public.business_verifications for select to authenticated
  using (private.is_business_member(business_id));
create policy "managers add verifications" on public.business_verifications for insert to authenticated
  with check (private.is_business_member(business_id, 'manager')
              and created_by = (select auth.uid())
              and (storage_path is null or split_part(storage_path, '/', 1) = business_id::text)
              and (listing_id is null or exists (select 1 from public.business_listings l
                                                 where l.id = listing_id and l.business_id = business_verifications.business_id)));

create policy "members read listing timeline" on public.business_listing_events for select to authenticated
  using (exists (select 1 from public.business_listings l
                 where l.id = listing_id and private.is_business_member(l.business_id)));

-- availability: public read, the stay's team writes
create policy "availability is public" on public.stay_availability for select to anon, authenticated using (true);
create policy "stay team sets availability" on public.stay_availability for insert to authenticated
  with check (private.manages_stay(stay_id) and updated_by = (select auth.uid()));
create policy "stay team updates availability" on public.stay_availability for update to authenticated
  using (private.manages_stay(stay_id))
  with check (private.manages_stay(stay_id) and updated_by = (select auth.uid()));

-- review replies: public read, the stay's managers write
create policy "review replies are public" on public.stay_review_replies for select to anon, authenticated
  using (deleted_at is null or author_id = (select auth.uid()));
create policy "stay managers reply" on public.stay_review_replies for insert to authenticated
  with check (author_id = (select auth.uid())
              and exists (select 1 from public.stay_reviews r
                          where r.id = review_id and private.manages_stay(r.stay_id, 'manager')));
create policy "edit own reply" on public.stay_review_replies for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid())
              and exists (select 1 from public.stay_reviews r
                          where r.id = review_id and private.manages_stay(r.stay_id, 'manager')));

-- stats: only the stay's team; written by track_stay_event()
create policy "stay team reads stats" on public.stay_stats_daily for select to authenticated
  using (private.manages_stay(stay_id));

revoke delete on public.businesses, public.business_listings, public.business_listing_photos,
  public.business_verifications, public.stay_review_replies from anon, authenticated;
revoke insert, update, delete on public.business_listing_events, public.stay_stats_daily from anon, authenticated;
revoke all on public.businesses, public.business_members, public.business_listings,
  public.business_listing_photos, public.business_verifications, public.business_listing_events,
  public.stay_stats_daily from anon;

-- -----------------------------------------------------------------------------
-- RPC
-- -----------------------------------------------------------------------------

-- Start a draft by claiming a stay that is already in the app (from OSM).
create or replace function public.claim_stay(p_business uuid, p_stay uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s   public.stays;
  lid uuid;
begin
  if not private.is_business_member(p_business, 'manager') then
    raise exception 'not a manager of this business' using errcode = '42501';
  end if;
  select * into s from public.stays where id = p_stay and deleted_at is null;
  if s.id is null then
    raise exception 'stay not found' using errcode = 'P0002';
  end if;
  if s.business_id is not null then
    raise exception 'this place is already managed by a verified owner' using errcode = '23505';
  end if;
  insert into public.business_listings (
    business_id, claim_stay_id, category, name, description, address, place_id, route_id, country_code,
    location, phone, email, whatsapp, website, booking_method, booking_url, beds, opening_hours,
    open_months, amenities, labels, price_from, price_to, currency, created_by)
  values (
    p_business, s.id, s.category, s.name, s.description, s.address, s.place_id, s.route_id, s.country_code,
    s.location, s.phone, s.email, s.whatsapp, s.website, s.booking_method, s.booking_url, s.beds, s.opening_hours,
    s.open_months, s.amenities, array_remove(s.labels, 'verified_owner'), s.price_from, s.price_to, s.currency,
    (select auth.uid()))
  returning id into lid;
  return lid;
end;
$$;

-- Owner sends a draft for review. Checks the minimum an Agoda-style listing needs.
create or replace function public.submit_business_listing(p_listing uuid)
returns public.business_listings
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.business_listings;
  missing text[] := '{}';
begin
  select * into l from public.business_listings where id = p_listing and deleted_at is null for update;
  if l.id is null or not private.is_business_member(l.business_id, 'manager') then
    raise exception 'listing not found' using errcode = 'P0002';
  end if;
  if l.status not in ('draft', 'changes_requested', 'rejected') then
    raise exception 'listing is %, it cannot be submitted now', l.status using errcode = '22023';
  end if;
  if l.location is null then missing := array_append(missing, 'location'); end if;
  if coalesce(l.address, '') = '' then missing := array_append(missing, 'address'); end if;
  if coalesce(l.phone, l.email, l.whatsapp, l.website) is null then missing := array_append(missing, 'contact'); end if;
  if (select count(*) from public.business_listing_photos p where p.listing_id = l.id and p.deleted_at is null) < 3 then
    missing := array_append(missing, 'photos (at least 3)');
  end if;
  if not exists (select 1 from public.business_verifications v
                 where v.business_id = l.business_id and (v.listing_id is null or v.listing_id = l.id)
                   and v.method = 'document' and v.status <> 'rejected') then
    missing := array_append(missing, 'proof of ownership');
  end if;
  if cardinality(missing) > 0 then
    raise exception 'missing: %', array_to_string(missing, ', ') using errcode = '23514';
  end if;
  update public.business_listings
  set status = 'submitted', submitted_at = now(), review_note = null
  where id = l.id
  returning * into l;
  return l;
end;
$$;

-- Team review (service_role only: admin tool / dashboard / edge function).
-- p_decision: in_review | approve | changes_requested | reject | suspend
create or replace function public.review_business_listing(p_listing uuid, p_decision text, p_note text default null, p_reviewer uuid default null)
returns public.business_listings
language plpgsql
security definer
set search_path = ''
as $$
declare
  l   public.business_listings;
  sid uuid;
begin
  select * into l from public.business_listings where id = p_listing for update;
  if l.id is null then
    raise exception 'listing not found' using errcode = 'P0002';
  end if;
  if p_decision = 'approve' then
    sid := coalesce(l.stay_id, l.claim_stay_id);
    if sid is null then
      insert into public.stays (source, category, name, location, booking_method, currency)
      values ('owner', l.category, l.name, l.location, l.booking_method, l.currency)
      returning id into sid;
    end if;
    update public.business_verifications set status = 'approved', reviewed_at = now(), reviewed_by = p_reviewer
    where business_id = l.business_id and (listing_id is null or listing_id = l.id) and status = 'pending';
    update public.business_listings set
      status = 'approved', stay_id = sid, reviewed_at = now(), reviewed_by = p_reviewer, review_note = p_note
    where id = l.id returning * into l;
  elsif p_decision in ('in_review', 'changes_requested', 'reject', 'suspend') then
    if p_decision <> 'in_review' and coalesce(p_note, '') = '' then
      raise exception 'a note for the owner is required' using errcode = '22023';
    end if;
    update public.business_listings set
      status = case p_decision when 'reject' then 'rejected' when 'suspend' then 'suspended' else p_decision end,
      reviewed_at = now(), reviewed_by = p_reviewer, review_note = coalesce(p_note, review_note)
    where id = l.id returning * into l;
  else
    raise exception 'unknown decision %', p_decision using errcode = '22023';
  end if;
  return l;
end;
$$;

-- Counts a view / save / contact tap for the owner dashboard.
create or replace function public.track_stay_event(p_stay uuid, p_event text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_event not in ('view', 'save', 'contact', 'directions', 'booking') then
    raise exception 'unknown event %', p_event using errcode = '22023';
  end if;
  insert into public.stay_stats_daily as d (stay_id, day, views, saves, contact_taps, directions_taps, booking_taps)
  select p_stay, current_date,
         (p_event = 'view')::int, (p_event = 'save')::int, (p_event = 'contact')::int,
         (p_event = 'directions')::int, (p_event = 'booking')::int
  where exists (select 1 from public.stays s where s.id = p_stay and s.business_id is not null)
  on conflict (stay_id, day) do update set
    views           = d.views + excluded.views,
    saves           = d.saves + excluded.saves,
    contact_taps    = d.contact_taps + excluded.contact_taps,
    directions_taps = d.directions_taps + excluded.directions_taps,
    booking_taps    = d.booking_taps + excluded.booking_taps;
end;
$$;

-- Dashboard summary for one published stay (RLS applies: team only).
create or replace function public.business_stay_summary(p_stay uuid, p_days integer default 30)
returns table (views bigint, saves bigint, contact_taps bigint, directions_taps bigint, booking_taps bigint,
               rating_avg numeric, review_count integer, unreplied_reviews bigint)
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(d.views), 0), coalesce(sum(d.saves), 0), coalesce(sum(d.contact_taps), 0),
         coalesce(sum(d.directions_taps), 0), coalesce(sum(d.booking_taps), 0),
         s.rating_avg, s.review_count,
         (select count(*) from public.stay_reviews r
          where r.stay_id = s.id and r.deleted_at is null and r.moderation_status = 'ok'
            and not exists (select 1 from public.stay_review_replies x where x.review_id = r.id and x.deleted_at is null))
  from public.stays s
  left join public.stay_stats_daily d on d.stay_id = s.id and d.day > current_date - least(p_days, 365)
  where s.id = p_stay and private.manages_stay(s.id)
  group by s.id, s.rating_avg, s.review_count;
$$;

revoke execute on function public.claim_stay(uuid, uuid), public.submit_business_listing(uuid),
  public.business_stay_summary(uuid, integer) from public, anon;
grant execute on function public.claim_stay(uuid, uuid), public.submit_business_listing(uuid),
  public.business_stay_summary(uuid, integer) to authenticated;
revoke execute on function public.track_stay_event(uuid, text) from public;
grant execute on function public.track_stay_event(uuid, text) to anon, authenticated;
revoke execute on function public.review_business_listing(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.review_business_listing(uuid, text, text, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- Storage
--   business-docs   private: proof of ownership, <business_id>/...; members
--                   upload and read, the team reviews with the service role
--   business-media  public read: listing photos, <business_id>/...; managers write
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('business-docs', 'business-docs', false, 10485760,
     array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('business-media', 'business-media', true, 10485760,
     array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

create policy "business docs: members read" on storage.objects for select to authenticated
  using (bucket_id = 'business-docs' and exists (
    select 1 from public.businesses b
    where b.id::text = (storage.foldername(name))[1] and private.is_business_member(b.id)));
create policy "business docs: managers upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'business-docs' and exists (
    select 1 from public.businesses b
    where b.id::text = (storage.foldername(name))[1] and private.is_business_member(b.id, 'manager')));

create policy "business media is public" on storage.objects for select to anon, authenticated
  using (bucket_id = 'business-media');
create policy "business media: managers upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'business-media' and exists (
    select 1 from public.businesses b
    where b.id::text = (storage.foldername(name))[1] and private.is_business_member(b.id, 'manager')));
create policy "business media: managers replace" on storage.objects for update to authenticated
  using (bucket_id = 'business-media' and exists (
    select 1 from public.businesses b
    where b.id::text = (storage.foldername(name))[1] and private.is_business_member(b.id, 'manager')));
create policy "business media: managers delete" on storage.objects for delete to authenticated
  using (bucket_id = 'business-media' and exists (
    select 1 from public.businesses b
    where b.id::text = (storage.foldername(name))[1] and private.is_business_member(b.id, 'manager')));

-- -----------------------------------------------------------------------------
-- reference data
-- -----------------------------------------------------------------------------
insert into public.stay_labels (slug, name, description, icon, sort_order) values
  ('verified_owner', 'Verified owner', 'The owner manages this listing and was verified by CaminoPlus', 'shield', 5)
on conflict (slug) do nothing;

-- Realtime: owners see review status change live.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.business_listings, public.stay_availability;
  end if;
end $$;
