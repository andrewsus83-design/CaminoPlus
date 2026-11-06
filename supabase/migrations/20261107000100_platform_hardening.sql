-- =============================================================================
-- CaminoPlus 15: platform hardening
--
-- Found by a security / robustness audit, every item reproduced on Postgres 16:
--   1. `private` functions were executable by PUBLIC (a signed-in user could call
--      private.award_xp(me, 1000000, ...) over a direct connection).
--   2. Account deletion was blocked (businesses.created_by ... on delete restrict),
--      and nothing stopped a manager from pointing created_by at a victim.
--   3. track_stay_event() was callable by anon and counted every call.
--   4. Business module gaps: client-writable claim_stay_id, claim squatting, suspended
--      teams that kept their powers, self-assigned `partner` label, owner-verified
--      stays that still said "Not verified yet", no way to delete proof files.
--   5. TRUNCATE / REFERENCES / TRIGGER (MAINTAIN on 17) were granted to anon and authenticated, sandbox
--      purchases unlocked Plus in production, a stale grace date could lock out a paying
--      subscriber, offline_packs.url accepted any string.
--   6. private.housekeeping() was never scheduled and did not recount storage; 68 foreign
--      keys had no index; four catalog tables had no touch trigger / tombstone.
--   7. New RPCs: start_journey(), register_offline_pack().
--   8. The paid plan is called "Pilgrim Plus".
-- supabase/dev/platform_hardening_smoke.sql has an attack-style assertion for each item.
--
-- Rules for later migrations (this file changes the defaults):
--   * Functions created by `postgres` no longer get EXECUTE for PUBLIC. In schema `public`
--     anon / authenticated / service_role are still granted by the schema default (as on
--     Supabase), so `revoke ... from anon` where a function must need a session. In schema
--     `private` NOBODY but the owner can call a new function until you grant it, which is
--     what you want for everything except what an RLS policy, CHECK constraint, column
--     default or SECURITY INVOKER function calls as the signed-in role.
--   * `create extension` before this point or grant execute on the extension's functions
--     yourself (an extension script also runs with these defaults).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. pg_cron, only where the server ships it (Supabase does, a plain local Postgres
--    does not). Created before the default privileges below change.
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null
     and exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
    exception when others then
      raise notice 'pg_cron could not be enabled (%): schedule private.housekeeping() by hand', sqlerrm;
    end;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1. Defaults for everything created from now on
-- -----------------------------------------------------------------------------
-- A schema-level default cannot take away the built-in "PUBLIC may execute" grant
-- (foundation.sql tried and it was a no-op). Only the global form can.
alter default privileges for role postgres revoke execute on functions from public;
-- public stays callable by the API roles, explicitly (what Supabase and local_stub.sql set)
alter default privileges for role postgres in schema public grant execute on functions to anon, authenticated, service_role;
-- TRUNCATE is not subject to RLS. Nobody but the server needs it, REFERENCES or TRIGGER.
alter default privileges for role postgres in schema public revoke truncate, references, trigger on tables from anon, authenticated;
-- PostgreSQL 17 added MAINTAIN (VACUUM, ANALYZE, REINDEX, LOCK TABLE ...) to "all privileges", so a default grant of
-- ALL to the API roles includes it. Not for them either. (Skipped before 17, where the word does not exist.)
do $$
begin
  if current_setting('server_version_num')::integer >= 170000 then
    execute 'alter default privileges for role postgres in schema public revoke maintain on tables from anon, authenticated';
  end if;
exception when others then
  raise warning 'could not revoke MAINTAIN from the default table privileges: %', sqlerrm;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Small helpers (SECURITY DEFINER ones are only called by other definer code)
-- -----------------------------------------------------------------------------
-- app_config switches. Anything that is not an explicit true is false, a typo in the
-- config can never break has_plus() for everybody.
create or replace function private.platform_flag(p_key text, p_default boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select c.value in ('true'::jsonb, '"true"'::jsonb, '1'::jsonb) from public.app_config c where c.key = p_key),
    p_default);
$$;

create or replace function private.platform_int(p_key text, p_default integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select case when (c.value #>> '{}') ~ '^[0-9]{1,9}$' then (c.value #>> '{}')::integer end
     from public.app_config c where c.key = p_key),
    p_default);
$$;

-- touch trigger for tables that have updated_at but neither `id` nor `created_at`
create or replace function private.touch_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Host of a web address, lower case, without "www." ('https://www.Casa.es/x?y' -> 'casa.es').
create or replace function private.url_host(p_url text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(lower(regexp_replace(
    coalesce(substring(p_url from '^[A-Za-z][A-Za-z0-9+.-]*://(?:[^/?#@]*@)?([^/?#:]+)'), ''),
    '^www\.', '')), '');
$$;

insert into public.app_config (key, value, description) values
  ('allow_sandbox_purchases', 'false',
   'true = store sandbox / TestFlight purchases unlock Pilgrim Plus. Turn on only while testing or during App Review.'),
  ('max_open_stay_claims', '3',
   'How many places one person may be claiming (draft, changes requested, in review) at the same time.'),
  ('stale_claim_days', '60',
   'A claim that nobody sent for review within this many days is released so the real owner can claim the place.')
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- 3. Account deletion must complete (App Store 5.1.1(v), Google Play, GDPR art. 17)
--    Every foreign key that could block deleting a profile / auth user is rewritten
--    so the row it protects is kept without the person (SET NULL) or goes with them.
-- -----------------------------------------------------------------------------
alter table public.businesses             alter column created_by drop not null;
alter table public.business_listings      alter column created_by drop not null;
alter table public.business_verifications alter column created_by drop not null;

alter table public.businesses drop constraint if exists businesses_created_by_fkey;
alter table public.businesses add constraint businesses_created_by_fkey
  foreign key (created_by) references public.profiles (id) on delete set null;
alter table public.business_listings drop constraint if exists business_listings_created_by_fkey;
alter table public.business_listings add constraint business_listings_created_by_fkey
  foreign key (created_by) references public.profiles (id) on delete set null;
alter table public.business_verifications drop constraint if exists business_verifications_created_by_fkey;
alter table public.business_verifications add constraint business_verifications_created_by_fkey
  foreign key (created_by) references public.profiles (id) on delete set null;

-- A seller's photos are deleted with the seller; what a buyer paid stays on record.
alter table public.marketplace_purchases alter column photo_id drop not null;
alter table public.marketplace_purchases drop constraint if exists marketplace_purchases_photo_id_fkey;
alter table public.marketplace_purchases add constraint marketplace_purchases_photo_id_fkey
  foreign key (photo_id) references public.marketplace_photos (id) on delete set null;

-- created_by says who registered a record. Clients cannot rewrite it afterwards (a manager
-- pointing it at someone else would also make that person the "creator" of the business).
create or replace function private.lock_created_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and current_user in ('anon', 'authenticated') then
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;
drop trigger if exists businesses_lock_created_by on public.businesses;
create trigger businesses_lock_created_by before update on public.businesses
  for each row execute function private.lock_created_by();
drop trigger if exists business_listings_lock_created_by on public.business_listings;
create trigger business_listings_lock_created_by before update on public.business_listings
  for each row execute function private.lock_created_by();
drop trigger if exists business_verifications_lock_created_by on public.business_verifications;
create trigger business_verifications_lock_created_by before update on public.business_verifications
  for each row execute function private.lock_created_by();

-- the creator becomes the owner (a row inserted by the server without a creator has no owner yet)
create or replace function private.businesses_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is not null then
    insert into public.business_members (business_id, user_id, role)
    values (new.id, new.created_by, 'owner')
    on conflict do nothing;
  end if;
  return null;
end;
$$;

-- When a team member disappears (account deleted, or removed by an owner):
--   * no owner left but a manager is -> the longest-serving manager becomes owner
--   * nobody who can manage is left   -> the business is closed (deleted_at) and its listings come down
create or replace function private.business_members_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.business_members m where m.business_id = old.business_id and m.role = 'owner') then
    return null;
  end if;
  update public.business_members m set role = 'owner'
  where m.business_id = old.business_id
    and m.user_id = (select m2.user_id from public.business_members m2
                     where m2.business_id = old.business_id and m2.role = 'manager'
                     order by m2.created_at, m2.user_id limit 1);
  if found then
    return null;
  end if;
  update public.businesses set deleted_at = now()
  where id = old.business_id and deleted_at is null;
  return null;
end;
$$;
drop trigger if exists business_members_orphans on public.business_members;
create trigger business_members_orphans after delete on public.business_members
  for each row execute function private.business_members_after_delete();

-- A closed or suspended business takes its listings down with it, so nothing stays live
-- (or holds a claim on a place) without a team behind it.
create or replace function private.businesses_takedown_listings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    update public.business_listings set
      status = case when status = 'rejected' then status else 'suspended' end,
      review_note = case when status = 'rejected' then review_note else 'This business account was closed.' end,
      deleted_at = now()
    where business_id = new.id and deleted_at is null;
  elsif new.status = 'suspended' and old.status is distinct from 'suspended' then
    update public.business_listings set
      status = 'suspended',
      review_note = 'This business was suspended by the CaminoPlus team.'
    where business_id = new.id and deleted_at is null and status not in ('suspended', 'rejected');
  end if;
  return null;
end;
$$;
drop trigger if exists businesses_takedown on public.businesses;
create trigger businesses_takedown after update of deleted_at, status on public.businesses
  for each row
  when ((new.deleted_at is not null and old.deleted_at is null)
        or (new.status = 'suspended' and old.status is distinct from 'suspended'))
  execute function private.businesses_takedown_listings();

-- -----------------------------------------------------------------------------
-- 4. Business module
-- -----------------------------------------------------------------------------

-- 4a. A suspended business keeps READ access (so the team can see why) but cannot act.
--     is_business_member() = "may act for the business"; is_business_viewer() = "may look".
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
      and b.status = 'active'
      and case p_min_role
            when 'owner'   then m.role = 'owner'
            when 'manager' then m.role in ('owner', 'manager')
            else true
          end
  );
$$;

create or replace function private.is_business_viewer(p_business uuid)
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
  );
$$;

drop policy if exists "members read their business" on public.businesses;
create policy "members read their business" on public.businesses for select to authenticated
  using (created_by = (select auth.uid()) or private.is_business_viewer(id));

drop policy if exists "members see the team" on public.business_members;
create policy "members see the team" on public.business_members for select to authenticated
  using (user_id = (select auth.uid()) or private.is_business_viewer(business_id));

drop policy if exists "members read listings" on public.business_listings;
create policy "members read listings" on public.business_listings for select to authenticated
  using (private.is_business_viewer(business_id));

drop policy if exists "members read listing photos" on public.business_listing_photos;
create policy "members read listing photos" on public.business_listing_photos for select to authenticated
  using (exists (select 1 from public.business_listings l
                 where l.id = listing_id and private.is_business_viewer(l.business_id)));

drop policy if exists "members read verifications" on public.business_verifications;
create policy "members read verifications" on public.business_verifications for select to authenticated
  using (private.is_business_viewer(business_id));

drop policy if exists "members read listing timeline" on public.business_listing_events;
create policy "members read listing timeline" on public.business_listing_events for select to authenticated
  using (exists (select 1 from public.business_listings l
                 where l.id = listing_id and private.is_business_viewer(l.business_id)));

-- 4b. Labels. `partner`, `verified_owner` and anything added later are server-only until a
--     label is explicitly marked as something an owner may choose.
alter table public.stay_labels add column if not exists owner_assignable boolean not null default false;
update public.stay_labels set owner_assignable = true
where slug in ('pilgrims_only', 'donativo', 'open_all_year', 'pet_friendly', 'bike_friendly', 'accessible', 'menu_peregrino')
  and not owner_assignable;

create or replace function private.business_listings_labels()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.labels := coalesce(
      (select array_agg(distinct l order by l) from unnest(new.labels) l
       where l in (select slug from public.stay_labels where owner_assignable)),
      '{}');
  end if;
  return new;
end;
$$;
drop trigger if exists business_listings_labels on public.business_listings;
create trigger business_listings_labels before insert or update on public.business_listings
  for each row execute function private.business_listings_labels();

-- 4c. claim_stay_id is set by claim_stay() only (it checks that you manage the business, that
--     the place is free and how many claims you already hold). Same trigger, one more column.
drop trigger if exists business_listings_guard on public.business_listings;
create trigger business_listings_guard before insert or update on public.business_listings
  for each row execute function private.guard_columns(
    '{"status": "draft", "stay_id": null, "claim_stay_id": null, "submitted_at": null, "reviewed_at": null, "reviewed_by": null, "review_note": null}');

-- Web addresses must be web addresses (no javascript:, data:, intent: ...). NOT VALID checks
-- every new or changed row; the VALIDATE below covers old rows when they are clean.
alter table public.business_listings drop constraint if exists business_listings_urls_web;
alter table public.business_listings add constraint business_listings_urls_web check (
  (website is null or website ~* '^https?://[^[:space:]]+$')
  and (booking_url is null or booking_url ~* '^https?://[^[:space:]]+$')) not valid;
alter table public.businesses drop constraint if exists businesses_website_web;
alter table public.businesses add constraint businesses_website_web check (
  website is null or website ~* '^https?://[^[:space:]]+$') not valid;
do $$
begin
  alter table public.business_listings validate constraint business_listings_urls_web;
  alter table public.businesses validate constraint businesses_website_web;
exception when check_violation then
  raise warning 'some existing business web addresses are not http(s) links; the check stays NOT VALID until they are fixed';
end $$;

-- 4d. Edits that go live at once are the "safe" ones. Sending pilgrims to a NEW website is not
--     safe (phishing), so a new web address for the website or the booking link goes to review
--     like a rename does. Another page on the same site stays a safe edit.
create or replace function private.business_listings_resubmit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') and old.status = 'approved'
     and ((new.name, new.category, new.address, new.location::text)
            is distinct from (old.name, old.category, old.address, old.location::text)
          or private.url_host(new.website) is distinct from private.url_host(old.website)
          or private.url_host(new.booking_url) is distinct from private.url_host(old.booking_url)) then
    new.status := 'submitted';
    new.submitted_at := now();
    new.review_note := null;
  end if;
  return new;
end;
$$;

-- 4e. Publishing / taking down a listing.
--     approve : owner-verified level, owner-chosen labels only (server labels survive)
--     takedown: suspend or reject. The team loses the stay (business_id), the owner badge, the owner's
--               photos. To keep a live listing up while the owner fixes something, use changes_requested.
--
--     The listing is read again instead of trusting `new`: when a profile is deleted Postgres runs
--     the foreign key actions (created_by SET NULL) first and fires their AFTER triggers at the very
--     end, so the `new` of such an event can describe a listing that was taken down in between and
--     would publish it again.
create or replace function private.sync_listing_to_stay()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.business_listings;
begin
  select * into l from public.business_listings where id = new.id;
  if l.id is null then
    return null;
  end if;
  if l.status = 'approved' and l.stay_id is not null then
    update public.stays s set
      business_id        = l.business_id,
      owner_verified_at  = coalesce(s.owner_verified_at, now()),
      verification_level = 'owner',
      category           = l.category,
      name               = l.name,
      description        = l.description,
      address            = l.address,
      place_id           = coalesce(l.place_id, s.place_id),
      route_id           = coalesce(l.route_id, s.route_id),
      country_code       = coalesce(l.country_code, s.country_code),
      location           = coalesce(l.location, s.location),
      phone              = l.phone,
      email              = l.email,
      whatsapp           = l.whatsapp,
      website            = l.website,
      booking_method     = l.booking_method,
      booking_url        = l.booking_url,
      beds               = l.beds,
      opening_hours      = l.opening_hours,
      open_months        = l.open_months,
      amenities          = l.amenities,
      labels             = (select coalesce(array_agg(x.lab order by x.lab), '{}'::text[]) from (
                              select t.lab from unnest(s.labels) t(lab)
                              where t.lab in (select sl.slug from public.stay_labels sl where not sl.owner_assignable)
                              union
                              select t.lab from unnest(l.labels) t(lab)
                              where t.lab in (select sl.slug from public.stay_labels sl where sl.owner_assignable)
                              union
                              select 'verified_owner'
                            ) x),
      price_from         = coalesce(l.price_from, s.price_from),
      price_to           = coalesce(l.price_to, s.price_to),
      currency           = l.currency,
      price_updated_at   = case when l.price_from is not null then now() else s.price_updated_at end,
      verified_at        = now(),
      deleted_at         = null
    where s.id = l.stay_id;
    perform private.sync_listing_photos(l.id);
  elsif tg_op = 'UPDATE' and l.status in ('suspended', 'rejected') and l.stay_id is not null then
    -- Taken down (also while a live listing waits for a second review: its old version is still live).
    -- Keep the OSM data, drop everything the owner added. Only while this business still holds the
    -- place, so a later change to an old listing never touches a place another business has claimed
    -- since, and running it twice changes nothing.
    update public.stays s set
      business_id        = null,
      owner_verified_at  = null,
      verified_at        = case when s.verification_level = 'owner' then null else s.verified_at end,
      verification_level = case when s.verification_level <> 'owner' then s.verification_level
                                when s.data_checked_at is not null then 'data_check'
                                else 'unverified' end,
      labels             = array_remove(s.labels, 'verified_owner'),
      deleted_at         = case when s.source = 'owner' then now() else s.deleted_at end
    where s.id = l.stay_id and s.business_id = l.business_id;
    if found then
      update public.stay_photos set deleted_at = coalesce(deleted_at, now())
      where stay_id = l.stay_id and source = 'owner';
    end if;
  end if;
  return null;
end;
$$;

-- Stays that were approved before this migration carry the owner badge but not the level.
update public.stays set
  verification_level = 'owner',
  verified_at = coalesce(verified_at, owner_verified_at)
where owner_verified_at is not null and verification_level = 'unverified';

-- 4f. Claiming a place that is already in the app.
create or replace function public.claim_stay(p_business uuid, p_stay uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me         uuid := auth.uid();
  s          public.stays;
  lid        uuid;
  open_count integer;
  max_open   integer := private.platform_int('max_open_stay_claims', 3);
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if not private.is_business_member(p_business, 'manager') then
    raise exception 'not a manager of this business' using errcode = '42501';
  end if;
  -- one claim at a time per person, so two parallel calls cannot both slip under the limit
  perform pg_advisory_xact_lock(hashtextextended('caminoplus.claim_stay:' || me::text, 0));
  select count(*) into open_count
  from public.business_listings l
  where l.created_by = me and l.claim_stay_id is not null and l.deleted_at is null
    and l.status in ('draft', 'changes_requested', 'submitted', 'in_review');
  if open_count >= max_open then
    raise exception 'you are already claiming % places; finish one or remove it before you claim another', open_count
      using errcode = '23514';
  end if;
  select * into s from public.stays where id = p_stay and deleted_at is null;
  if s.id is null then
    raise exception 'stay not found' using errcode = 'P0002';
  end if;
  if s.business_id is not null then
    raise exception 'this place is already managed by a verified owner' using errcode = '23505';
  end if;
  if exists (select 1 from public.business_listings l
             where l.claim_stay_id = p_stay and l.deleted_at is null and l.status <> 'rejected') then
    raise exception 'someone else is already claiming this place' using errcode = '23505';
  end if;
  insert into public.business_listings (
    business_id, claim_stay_id, category, name, description, address, place_id, route_id, country_code,
    location, phone, email, whatsapp, website, booking_method, booking_url, beds, opening_hours,
    open_months, amenities, labels, price_from, price_to, currency, created_by)
  values (
    p_business, s.id, s.category, s.name, s.description, s.address, s.place_id, s.route_id, s.country_code,
    s.location, s.phone, s.email, s.whatsapp, s.website, s.booking_method, s.booking_url, s.beds, s.opening_hours,
    s.open_months, s.amenities,
    -- the owner starts from the labels they may choose; server labels (partner, ...) stay on the place
    coalesce((select array_agg(distinct t.lab order by t.lab) from unnest(s.labels) t(lab)
              where t.lab in (select sl.slug from public.stay_labels sl where sl.owner_assignable)), '{}'),
    s.price_from, s.price_to, s.currency, me)
  returning id into lid;
  return lid;
end;
$$;

-- 4g. Team review (service_role only). Same decisions as before, and a listing of a closed or
--     suspended business cannot be approved.
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
    if not exists (select 1 from public.businesses b
                   where b.id = l.business_id and b.deleted_at is null and b.status = 'active') then
      raise exception 'the business is closed or suspended' using errcode = '22023';
    end if;
    sid := coalesce(l.stay_id, l.claim_stay_id);
    if sid is null then
      insert into public.stays (source, category, name, location, booking_method, currency)
      values ('owner', l.category, l.name, l.location, l.booking_method, l.currency)
      returning id into sid;
    elsif exists (select 1 from public.stays s
                  where s.id = sid and s.business_id is not null and s.business_id <> l.business_id) then
      raise exception 'this place is already managed by another business' using errcode = '23505';
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

-- 4h. Owner dashboard counters: signed-in pilgrims only, one count per person, place, event
--     and UTC day (1000 anonymous calls used to mean 1000 booking taps).
create table if not exists private.stay_event_log (
  user_id uuid not null references public.profiles (id) on delete cascade,
  stay_id uuid not null references public.stays (id) on delete cascade,
  event   text not null,
  day     date not null,
  primary key (user_id, stay_id, event, day)
);

create or replace function public.track_stay_event(p_stay uuid, p_event text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me    uuid := auth.uid();
  today date := (now() at time zone 'utc')::date;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_event not in ('view', 'save', 'contact', 'directions', 'booking') then
    raise exception 'unknown event %', p_event using errcode = '22023';
  end if;
  -- only places a verified owner manages have a dashboard
  if not exists (select 1 from public.stays s where s.id = p_stay and s.business_id is not null) then
    return;
  end if;
  insert into private.stay_event_log (user_id, stay_id, event, day)
  values (me, p_stay, p_event, today)
  on conflict do nothing;
  if not found then
    return;   -- this pilgrim already counted for today
  end if;
  insert into public.stay_stats_daily as d (stay_id, day, views, saves, contact_taps, directions_taps, booking_taps)
  values (p_stay, today,
          (p_event = 'view')::int, (p_event = 'save')::int, (p_event = 'contact')::int,
          (p_event = 'directions')::int, (p_event = 'booking')::int)
  on conflict (stay_id, day) do update set
    views           = d.views + excluded.views,
    saves           = d.saves + excluded.saves,
    contact_taps    = d.contact_taps + excluded.contact_taps,
    directions_taps = d.directions_taps + excluded.directions_taps,
    booking_taps    = d.booking_taps + excluded.booking_taps;
end;
$$;

revoke execute on function public.claim_stay(uuid, uuid) from public, anon;
grant execute on function public.claim_stay(uuid, uuid) to authenticated;
revoke execute on function public.track_stay_event(uuid, text) from public, anon;
grant execute on function public.track_stay_event(uuid, text) to authenticated;
revoke execute on function public.review_business_listing(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.review_business_listing(uuid, text, text, uuid) to service_role;

-- 4i. Proof files: the team reads them (also while suspended), managers can delete them (a wrong
--     document, an erasure request). The folder is the business id.
--     Inside a sub-select over `businesses` a bare `name` means businesses.name (the trading name),
--     never the file name, so the outer table is always written out: objects.name. The original
--     policies in migration 12 had exactly that bug and no upload or read could ever match.
drop policy if exists "business docs: members read" on storage.objects;
create policy "business docs: members read" on storage.objects for select to authenticated
  using (bucket_id = 'business-docs' and exists (
    select 1 from public.businesses b
    where b.id::text = (storage.foldername(objects.name))[1] and private.is_business_viewer(b.id)));
drop policy if exists "business docs: managers delete" on storage.objects;
create policy "business docs: managers delete" on storage.objects for delete to authenticated
  using (bucket_id = 'business-docs' and exists (
    select 1 from public.businesses b
    where b.id::text = (storage.foldername(objects.name))[1] and private.is_business_member(b.id, 'manager')));

-- -----------------------------------------------------------------------------
-- 5. Billing: who counts as Pilgrim Plus
-- -----------------------------------------------------------------------------
--   * store sandbox / TestFlight purchases only count when allow_sandbox_purchases is on
--   * the end of the paid period is expires_at; grace_expires_at only extends it while the
--     store is retrying a payment (grace / billing_issue). A grace date left over from an
--     old billing problem no longer locks out someone who renewed.
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
      and (s.environment = 'production' or private.platform_flag('allow_sandbox_purchases', false))
      and coalesce(
            case when s.status in ('grace', 'billing_issue')
                 then greatest(s.grace_expires_at, s.expires_at)
                 else s.expires_at end,
            'infinity'::timestamptz) > now()
  );
$$;

-- -----------------------------------------------------------------------------
-- 6. Offline packs
-- -----------------------------------------------------------------------------
-- 6a. url says where the file lives; nothing else is a valid place
alter table public.offline_packs drop constraint if exists offline_packs_url_scheme;
alter table public.offline_packs add constraint offline_packs_url_scheme check (url ~ '^(supabase|r2)://') not valid;
do $$
begin
  alter table public.offline_packs validate constraint offline_packs_url_scheme;
exception when check_violation then
  raise warning 'some offline_packs.url values are not supabase:// or r2:// links; the check stays NOT VALID until they are fixed';
end $$;

-- 6b. one current pack per (route, stage, kind). Older duplicates are retired first so the
--     index can be built on a database that already has several current rows.
update public.offline_packs p set is_current = false
where p.is_current and p.deleted_at is null
  and p.id <> (select q.id from public.offline_packs q
               where q.route_id = p.route_id
                 and coalesce(q.stage_id, '00000000-0000-0000-0000-000000000000'::uuid)
                   = coalesce(p.stage_id, '00000000-0000-0000-0000-000000000000'::uuid)
                 and q.kind = p.kind and q.is_current and q.deleted_at is null
               order by q.version desc, q.published_at desc, q.id limit 1);
create unique index if not exists offline_packs_one_current
  on public.offline_packs (route_id, coalesce(stage_id, '00000000-0000-0000-0000-000000000000'::uuid), kind)
  where is_current and deleted_at is null;

-- 6c. The pipeline registers a pack in ONE call: retire the old current pack and publish the new
--     one in the same transaction, so a failed registration never leaves a route without a pack.
create or replace function public.register_offline_pack(
  p_route_id   uuid,
  p_stage_id   uuid,
  p_kind       text,
  p_format     text,
  p_version    int,
  p_url        text,
  p_size_bytes bigint,
  p_sha256     text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid;
begin
  if p_route_id is null or p_kind is null or p_format is null or p_version is null
     or p_url is null or p_size_bytes is null then
    raise exception 'route, kind, format, version, url and size are required' using errcode = '22023';
  end if;
  if p_version < 1 or p_size_bytes < 1 then
    raise exception 'version and size must be positive' using errcode = '22023';
  end if;
  if p_url !~ '^(supabase|r2)://[^/]+/.+' then
    raise exception 'url must look like supabase://<bucket>/<key> or r2://<bucket>/<key>' using errcode = '22023';
  end if;
  if p_sha256 is not null and p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'sha256 must be 64 lower-case hex characters' using errcode = '22023';
  end if;
  if p_stage_id is not null and not exists (select 1 from public.stages s where s.id = p_stage_id and s.route_id = p_route_id) then
    raise exception 'that stage is not part of this route' using errcode = '22023';
  end if;

  -- two registrations of the same (route, stage, kind) queue up instead of one failing on the unique index
  perform pg_advisory_xact_lock(hashtextextended(
    'caminoplus.offline_pack:' || p_route_id::text || ':' || coalesce(p_stage_id::text, '') || ':' || p_kind, 0));

  -- retire first: the unique index allows one current pack per (route, stage, kind)
  update public.offline_packs set is_current = false
  where route_id = p_route_id and stage_id is not distinct from p_stage_id and kind = p_kind
    and is_current and version <> p_version;

  insert into public.offline_packs (route_id, stage_id, kind, format, version, url, size_bytes, sha256, is_current, published_at, deleted_at)
  values (p_route_id, p_stage_id, p_kind, p_format, p_version, p_url, p_size_bytes, p_sha256, true, now(), null)
  on conflict (route_id, coalesce(stage_id, '00000000-0000-0000-0000-000000000000'::uuid), kind, version)
  do update set format = excluded.format, url = excluded.url, size_bytes = excluded.size_bytes,
                sha256 = excluded.sha256, is_current = true, published_at = now(), deleted_at = null
  returning id into pid;
  return pid;
end;
$$;
revoke execute on function public.register_offline_pack(uuid, uuid, text, text, int, text, bigint, text)
  from public, anon, authenticated;
grant execute on function public.register_offline_pack(uuid, uuid, text, text, int, text, bigint, text)
  to service_role;

-- 6d. catalog for the upgrade screen: newest version first within a (stage, kind)
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
  order by p.stage_id nulls first, p.kind, p.version desc;
$$;

-- -----------------------------------------------------------------------------
-- 7. start_journey(): one call, one transaction, safe to repeat
--    SECURITY INVOKER on purpose: the pilgrim's own RLS decides what may be written.
-- -----------------------------------------------------------------------------
create or replace function public.start_journey(
  p_journey_id     uuid,
  p_route_id       uuid,
  p_start_stage_id uuid default null,
  p_start_date     date default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  me         uuid := auth.uid();
  r          public.routes;
  first_no   integer;
  day_count  integer;
  total_km   numeric;
  first_from uuid;
  last_to    uuid;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_journey_id is null then
    raise exception 'journey id is required' using errcode = '22023';
  end if;

  -- the same request again (offline outbox, double tap): nothing new is created
  if exists (select 1 from public.journeys j where j.id = p_journey_id and j.user_id = me) then
    return p_journey_id;
  end if;

  select * into r from public.routes where id = p_route_id and is_published and deleted_at is null;
  if r.id is null then
    raise exception 'route not found' using errcode = '22023';
  end if;

  if p_start_stage_id is not null then
    select s.stage_number into first_no
    from public.stages s
    where s.id = p_start_stage_id and s.route_id = r.id and s.variant_of is null
      and s.is_published and s.deleted_at is null;
    if first_no is null then
      raise exception 'that stage is not part of this route' using errcode = '22023';
    end if;
  end if;

  -- the published main-line stages from the chosen one (or the first) to the end
  select count(*), sum(s.distance_km),
         (array_agg(s.start_place_id order by s.stage_number))[1],
         (array_agg(s.end_place_id order by s.stage_number desc))[1]
    into day_count, total_km, first_from, last_to
  from public.stages s
  where s.route_id = r.id and s.variant_of is null and s.is_published and s.deleted_at is null
    and (first_no is null or s.stage_number >= first_no);

  insert into public.journeys (id, user_id, route_id, title, start_place_id, end_place_id, start_stage_id,
                               status, planned_start_date, planned_end_date, planned_distance_km)
  values (p_journey_id, me, r.id, r.name, first_from, last_to, p_start_stage_id,
          'planning', p_start_date,
          case when p_start_date is not null and day_count > 0 then p_start_date + (day_count - 1) end,
          case when day_count > 0 then total_km end)
  on conflict (id) do nothing;
  if not found then
    -- lost a race against the same request, or the id belongs to someone else
    if exists (select 1 from public.journeys j where j.id = p_journey_id and j.user_id = me) then
      return p_journey_id;
    end if;
    raise exception 'journey id is already in use' using errcode = '23505';
  end if;

  -- day 1 = the start date, then one stage per day
  insert into public.journey_days (journey_id, user_id, day_number, planned_date, stage_id,
                                   from_place_id, to_place_id, from_name, to_name, planned_distance_km)
  select p_journey_id, me,
         (row_number() over (order by s.stage_number))::integer,
         case when p_start_date is not null then p_start_date + ((row_number() over (order by s.stage_number))::integer - 1) end,
         s.id, s.start_place_id, s.end_place_id,
         coalesce(sp.name, lag(ep.name) over (order by s.stage_number)),
         ep.name,
         s.distance_km
  from public.stages s
  left join public.places sp on sp.id = s.start_place_id
  left join public.places ep on ep.id = s.end_place_id
  where s.route_id = r.id and s.variant_of is null and s.is_published and s.deleted_at is null
    and (first_no is null or s.stage_number >= first_no)
  order by s.stage_number;

  return p_journey_id;
end;
$$;
revoke execute on function public.start_journey(uuid, uuid, uuid, date) from public, anon;
grant execute on function public.start_journey(uuid, uuid, uuid, date) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Sync gaps: catalog link tables and labels get a touch trigger and tombstones, so offline
--    packs can see what changed (updated_at > last sync) and what was removed (deleted_at).
-- -----------------------------------------------------------------------------
alter table public.route_places add column if not exists updated_at timestamptz not null default now();
alter table public.stage_pois   add column if not exists updated_at timestamptz not null default now();
alter table public.stage_stays  add column if not exists updated_at timestamptz not null default now();
alter table public.stay_labels  add column if not exists updated_at timestamptz not null default now();
alter table public.route_places add column if not exists deleted_at timestamptz;
alter table public.stage_pois   add column if not exists deleted_at timestamptz;
alter table public.stage_stays  add column if not exists deleted_at timestamptz;
alter table public.stay_labels  add column if not exists deleted_at timestamptz;

drop trigger if exists route_places_touch on public.route_places;
create trigger route_places_touch before update on public.route_places for each row execute function private.touch_stamp();
drop trigger if exists stage_pois_touch on public.stage_pois;
create trigger stage_pois_touch   before update on public.stage_pois   for each row execute function private.touch_stamp();
drop trigger if exists stage_stays_touch on public.stage_stays;
create trigger stage_stays_touch  before update on public.stage_stays  for each row execute function private.touch_stamp();
drop trigger if exists stay_labels_touch on public.stay_labels;
create trigger stay_labels_touch  before update on public.stay_labels  for each row execute function private.touch_stamp();

create index if not exists route_places_updated_idx on public.route_places (updated_at);
create index if not exists stage_pois_updated_idx   on public.stage_pois (updated_at);
create index if not exists stage_stays_updated_idx  on public.stage_stays (updated_at);

-- -----------------------------------------------------------------------------
-- 9. Operations: housekeeping every 15 minutes
-- -----------------------------------------------------------------------------
create or replace function private.housekeeping()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  has_times boolean;
  uids      uuid[] := '{}';
  uid       uuid;
begin
  -- two overlapping runs would only do the same work twice
  if not pg_try_advisory_xact_lock(hashtextextended('caminoplus.housekeeping', 0)) then
    return;
  end if;

  -- expired crowd reports older than 30 days are deleted for good
  delete from public.crowd_reports where expires_at < now() - interval '30 days';
  -- expired add-ons
  update public.storage_addons set status = 'expired'
  where status = 'active' and expires_at is not null and expires_at < now();
  -- the dashboard de-duplication only needs today and yesterday
  delete from private.stay_event_log where day < (now() at time zone 'utc')::date - 1;
  -- a claim nobody sent for review blocks the real owner for ever: release it
  update public.business_listings set
    deleted_at = now(),
    review_note = 'This claim expired because nothing was sent for review.'
  where claim_stay_id is not null and status in ('draft', 'changes_requested') and deleted_at is null
    and updated_at < now() - make_interval(days => private.platform_int('stale_claim_days', 60));

  -- storage_usage is the cached count of what a pilgrim keeps in user-media. It is recounted by
  -- private.recalculate_storage_usage(), the one place that knows how to count, for
  --   1. everybody who uploaded in the last 30 minutes (needs the timestamps that storage.objects has
  --      on Supabase), and
  --   2. a slice of the people whose last count is a day old (this is what notices deletions),
  --      200 per run.
  -- A failure for one person is logged and does not stop the others.
  select count(*) = 2 into has_times
  from pg_attribute
  where attrelid = 'storage.objects'::regclass and attnum > 0 and not attisdropped
    and attname in ('created_at', 'updated_at');
  if has_times then
    execute $q$
      select coalesce(array_agg(distinct p.id), '{}')
      from storage.objects o
      join public.profiles p on p.id::text = (storage.foldername(o.name))[1]
      where o.bucket_id = 'user-media'
        and coalesce(o.updated_at, o.created_at) > now() - interval '30 minutes'
    $q$ into uids;
  end if;
  uids := uids || coalesce((
    select array_agg(u.user_id)
    from (select su.user_id from public.storage_usage su
          where su.last_calculated_at < now() - interval '1 day' and (su.used_bytes > 0 or su.object_count > 0)
          order by su.last_calculated_at limit 200) u), '{}');
  for uid in select distinct x from unnest(uids) x loop
    begin
      perform private.recalculate_storage_usage(uid);
    exception when others then
      raise warning 'storage usage recount failed for %: %', uid, sqlerrm;
    end;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 10. Foreign keys without an index. Deleting a parent row (and every ON DELETE CASCADE /
--     SET NULL) scans the child table once per row without one. Generated from the catalog
--     so tables added by earlier migrations are covered too; nullable single-column keys get
--     a partial index (where <col> is not null), like favorites_stay_idx.
--
--   Known at the time of writing (name = <table>_<columns>_idx):
--     achievements.route_id             audio_stories.poi_id, route_id
--     business_listing_events.actor_id  business_listings.claim_stay_id, created_by, place_id,
--                                       reviewed_by, route_id, stay_id
--     business_verifications.created_by, reviewed_by
--     crowd_report_votes.user_id        crowd_reports.poi_id, stage_id
--     data_audit_findings.reviewed_by, run_id    face_match_consents.user_id   favorites.poi_id
--     health_daily.journey_day_id       health_workouts.journey_day_id
--     hunt_progress.hunt_id             hunt_step_completions.step_id
--     hunt_steps.poi_id                 hunts.achievement_id, route_id
--     journey_days.from_place_id, stage_id, stay_id, to_place_id
--     journeys.end_place_id, route_id, start_place_id, start_stage_id
--     marketplace_photos.poi_id, stage_id   marketplace_purchases.photo_id
--     offline_packs.stage_id            pois.place_id
--     post_comments.parent_id, user_id  post_media.user_id   post_saves.user_id
--     posts.journey_day_id, journey_id, poi_id, route_id, stay_id
--     revenuecat_events.user_id         route_places.place_id
--     stages.end_place_id, route_id, start_place_id, variant_of
--     stay_availability.updated_by      stay_photos.user_id       stay_prices.reported_by
--     stay_review_replies.author_id     stay_reviews.journey_id
--     stays.place_id, route_id          storage_addons.product_id   subscriptions.product_id
--     tracks.journey_day_id             user_achievements.achievement_id
--     user_stamps.journey_day_id, poi_id, stay_id
--     private.stay_event_log.stay_id
-- -----------------------------------------------------------------------------
do $$
declare
  r        record;
  idx_name text;
begin
  for r in
    select t.relnamespace::regnamespace::text as sch,
           t.relname,
           array_agg(a.attname order by k.ord) as cols,
           (count(*) = 1 and bool_and(not a.attnotnull)) as nullable_single
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace and n.nspname in ('public', 'private')
    cross join lateral unnest(c.conkey) with ordinality k(attnum, ord)
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
    where c.contype = 'f'
      and not exists (
        select 1 from pg_index i
        where i.indrelid = c.conrelid and i.indisvalid
          and (i.indpred is null or pg_get_expr(i.indpred, i.indrelid) ~ '^\(?[a-z_]+ IS NOT NULL\)?$')
          and (select array_agg(x order by x) from unnest((i.indkey::int2[])[0:array_length(c.conkey, 1) - 1]) x)
            = (select array_agg(x order by x) from unnest(c.conkey) x))
    group by c.oid, t.relnamespace, t.relname, c.conname
    order by t.relname, c.conname
  loop
    idx_name := left(r.relname || '_' || array_to_string(r.cols, '_') || '_idx', 63);
    if to_regclass(format('%I.%I', r.sch, idx_name)) is not null then
      idx_name := left(r.relname || '_' || array_to_string(r.cols, '_'), 59) || '_fki';
    end if;
    execute format('create index if not exists %I on %I.%I (%s)%s',
      idx_name, r.sch, r.relname,
      (select string_agg(quote_ident(x), ', ') from unnest(r.cols) x),
      case when r.nullable_single then format(' where %I is not null', r.cols[1]) else '' end);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 11. Grants
-- -----------------------------------------------------------------------------
-- 11a. TRUNCATE (not covered by RLS), REFERENCES and TRIGGER (and MAINTAIN on 17) are for the server only.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
do $$
begin
  if current_setting('server_version_num')::integer >= 170000 then
    execute 'revoke maintain on all tables in schema public from anon, authenticated';
  end if;
exception when others then
  raise warning 'could not revoke MAINTAIN from the API roles: %', sqlerrm;
end $$;

-- 11b. `private` is not an API: no function in it is callable by PUBLIC, anon or a signed-in
--      user except what RLS policies, CHECK constraints, column defaults and SECURITY INVOKER
--      functions call with the caller's own role. (Trigger functions need no grant: Postgres
--      checks EXECUTE when a trigger is created, not when it fires.)
revoke execute on all functions in schema private from public, anon, authenticated;

-- Safety net: whatever an RLS policy, CHECK constraint or column default calls keeps working,
-- including functions added by migrations that ran before this one.
do $$
declare
  r record;
begin
  for r in
    select d.refobjid::regprocedure as fn,
           bool_or(d.classid <> 'pg_policy'::regclass
                   or 0::oid = any (pol.polroles)
                   or (select oid from pg_roles where rolname = 'anon') = any (pol.polroles)) as for_anon
    from pg_depend d
    join pg_proc p on p.oid = d.refobjid and d.refclassid = 'pg_proc'::regclass
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'private'
    left join pg_policy pol on d.classid = 'pg_policy'::regclass and pol.oid = d.objid
    where d.classid in ('pg_policy'::regclass, 'pg_constraint'::regclass, 'pg_attrdef'::regclass)
    group by d.refobjid
  loop
    execute format('grant execute on function %s to authenticated, service_role', r.fn);
    if r.for_anon then
      execute format('grant execute on function %s to anon', r.fn);
    end if;
  end loop;
end $$;

-- The explicit list (verified one by one against pg_policy and the function bodies):
--   used by RLS policies:                      is_blocked, can_see, can_see_journey, has_plus,
--                                              storage_remaining_bytes, is_business_member,
--                                              is_business_viewer, manages_stay
--   called by SECURITY INVOKER trigger/functions: crowd_report_ttl (crowd_reports_before_write),
--                                              url_host (business_listings_resubmit),
--                                              manages_stay (business_stay_summary)
--   kept as before:                            is_follower
grant execute on function private.is_blocked(uuid, uuid)                   to authenticated, service_role;
grant execute on function private.is_follower(uuid, uuid)                  to authenticated, service_role;
grant execute on function private.can_see(uuid, public.visibility)         to anon, authenticated, service_role;
grant execute on function private.can_see_journey(uuid)                    to authenticated, service_role;
grant execute on function private.has_plus(uuid)                           to authenticated, service_role;
grant execute on function private.storage_remaining_bytes(uuid)            to authenticated, service_role;
grant execute on function private.is_business_member(uuid, text)           to authenticated;
grant execute on function private.is_business_viewer(uuid)                 to authenticated;
grant execute on function private.manages_stay(uuid, text)                 to authenticated;
grant execute on function private.crowd_report_ttl(text)                   to authenticated, service_role;
grant execute on function private.url_host(text)                           to authenticated, service_role;

-- 11c. Server-only tables in `private`: RLS on with no policies, so even a mistaken GRANT
--      does not expose them.
do $$
declare
  r record;
begin
  for r in
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private' and c.relkind in ('r', 'p') and not c.relrowsecurity
  loop
    execute format('alter table private.%I enable row level security', r.relname);
  end loop;
end $$;

-- Safety net, as in migration 10: no public table without RLS (also covers earlier migrations).
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

-- -----------------------------------------------------------------------------
-- 12. Naming: the paid plan is "Pilgrim Plus"
-- -----------------------------------------------------------------------------
update public.billing_products set name = 'Pilgrim Plus yearly'
where id = 'plus_yearly' and name <> 'Pilgrim Plus yearly';

do $$
begin
  if exists (select 1 from pg_policies
             where schemaname = 'public' and tablename = 'offline_packs' and policyname = 'offline packs need CaminoPlus') then
    alter policy "offline packs need CaminoPlus" on public.offline_packs rename to "offline packs need Pilgrim Plus";
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 13. Schedule the housekeeping (same name = replaced, so this can run again). On a server
--     without pg_cron nothing is scheduled; run `select private.housekeeping()` from any
--     scheduler every 15 minutes instead.
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'pg_cron is not available here: schedule private.housekeeping() every 15 minutes yourself';
    return;
  end if;
  begin
    perform cron.schedule('caminoplus-housekeeping', '*/15 * * * *', 'select private.housekeeping()');
  exception when others then
    raise notice 'could not schedule private.housekeeping(): %', sqlerrm;
  end;
end $$;
