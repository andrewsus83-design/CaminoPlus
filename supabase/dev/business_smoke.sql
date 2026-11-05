-- Business owner flow smoke test. Runs after rls_smoke.sql (see validate.sh),
-- which created users A (aaaa...) and B (bbbb...). Everything here is rolled
-- back per block or harmless test data on a throwaway database.
\set ON_ERROR_STOP 1

-- ------------------------------------------------ A registers a business + new listing
begin;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "role": "authenticated"}', true);
set local role authenticated;

insert into public.businesses (id, name, tax_id, country_code, contact_email, plan, commission_rate)
values ('b0000000-0000-0000-0000-000000000001', 'Casa Ana Hontanas', 'B12345678', 'ES', 'ana@example.com', 'premium', 0.2);

insert into public.business_listings (id, business_id, category, name, address, location, phone, beds, price_from, status, stay_id)
values ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'albergue_private',
        'Albergue Casa Ana', 'Calle Real 12, Hontanas', 'SRID=4326;POINT(-4.0201 42.3127)', '+34 600 000 000', 24, 12,
        'approved', '60000000-0000-0000-0000-000000000001');

do $$ begin
  assert (select plan from public.businesses where id = 'b0000000-0000-0000-0000-000000000001') = 'free', 'plan is server only';
  assert (select commission_rate from public.businesses where id = 'b0000000-0000-0000-0000-000000000001') = 0, 'commission is server only';
  assert (select role from public.business_members where business_id = 'b0000000-0000-0000-0000-000000000001' and user_id = auth.uid()) = 'owner', 'creator is owner';
  assert (select status from public.business_listings where id = 'b1000000-0000-0000-0000-000000000001') = 'draft', 'status forced to draft';
  assert (select stay_id from public.business_listings where id = 'b1000000-0000-0000-0000-000000000001') is null, 'stay_id is server only';
end $$;

-- submit without photos / proof fails
do $$ begin
  perform public.submit_business_listing('b1000000-0000-0000-0000-000000000001');
  raise exception 'submit should fail';
exception when check_violation then null;
end $$;

insert into public.business_listing_photos (listing_id, storage_path, sort_order) values
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001/p1.jpg', 0),
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001/p2.jpg', 1),
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001/p3.jpg', 2);
insert into public.business_verifications (business_id, listing_id, method, document_kind, storage_path, status)
values ('b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'document', 'tourism_register',
        'b0000000-0000-0000-0000-000000000001/registro.pdf', 'approved');
do $$ begin
  assert (select status from public.business_verifications limit 1) = 'pending', 'verification status is server only';
end $$;

-- photo path outside the business folder is refused
do $$ begin
  insert into public.business_listing_photos (listing_id, storage_path)
  values ('b1000000-0000-0000-0000-000000000001', 'someone-else/p.jpg');
  raise exception 'foreign photo path accepted';
exception when insufficient_privilege then null;
end $$;

select public.submit_business_listing('b1000000-0000-0000-0000-000000000001');
do $$ begin
  assert (select status from public.business_listings where id = 'b1000000-0000-0000-0000-000000000001') = 'submitted', 'submitted';
end $$;

-- locked while under review
update public.business_listings set name = 'Hacked' where id = 'b1000000-0000-0000-0000-000000000001';
do $$ begin
  assert (select name from public.business_listings where id = 'b1000000-0000-0000-0000-000000000001') = 'Albergue Casa Ana', 'locked in review';
end $$;

-- owners cannot approve themselves
do $$ begin
  perform public.review_business_listing('b1000000-0000-0000-0000-000000000001', 'approve');
  raise exception 'owner approved own listing';
exception when insufficient_privilege then null;
end $$;
commit;

-- ------------------------------------------------ B sees nothing of A's business
begin;
select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-0000-0000-0000-000000000002", "role": "authenticated"}', true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.businesses) = 0, 'B cannot see business';
  assert (select count(*) from public.business_listings) = 0, 'B cannot see listing';
  assert (select count(*) from public.business_verifications) = 0, 'B cannot see proof';
end $$;
do $$ begin
  insert into public.business_listings (business_id, category, name)
  values ('b0000000-0000-0000-0000-000000000001', 'cafe', 'Fake');
  raise exception 'B created listing for A';
exception when insufficient_privilege then null;
end $$;
commit;

-- ------------------------------------------------ team approves (service role)
begin;
select set_config('request.jwt.claims', '{"role": "service_role"}', true);
set local role service_role;
select public.review_business_listing('b1000000-0000-0000-0000-000000000001', 'approve', 'Welcome!');
commit;

do $$
declare sid uuid;
begin
  select stay_id into sid from public.business_listings where id = 'b1000000-0000-0000-0000-000000000001';
  assert sid is not null, 'stay created';
  assert (select source from public.stays where id = sid) = 'owner', 'new stay source owner';
  assert (select labels @> '{verified_owner}' from public.stays where id = sid), 'verified owner label';
  assert (select owner_verified_at is not null from public.stays where id = sid), 'owner_verified_at';
  assert (select kind from public.stays where id = sid) = 'stay', 'kind';
  assert (select count(*) from public.stay_photos where stay_id = sid and source = 'owner') = 3, 'photos published';
  assert (select status from public.business_verifications limit 1) = 'approved', 'proof approved';
  assert (select count(*) from public.business_listing_events where listing_id = 'b1000000-0000-0000-0000-000000000001') = 3, 'timeline draft/submitted/approved';
end $$;

-- ------------------------------------------------ A manages the live listing
begin;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "role": "authenticated"}', true);
set local role authenticated;

-- safe edit goes live at once
update public.business_listings set opening_hours = 'Mar-Oct 12:00-22:00', price_from = 13
where id = 'b1000000-0000-0000-0000-000000000001';
do $$ begin
  assert (select s.opening_hours from public.stays s join public.business_listings l on l.stay_id = s.id
          where l.id = 'b1000000-0000-0000-0000-000000000001') = 'Mar-Oct 12:00-22:00', 'safe edit live';
  assert (select status from public.business_listings where id = 'b1000000-0000-0000-0000-000000000001') = 'approved', 'still approved';
end $$;

-- availability + reply + stats
insert into public.stay_availability (stay_id, day, status, beds_free)
select stay_id, current_date, 'few_left', 3 from public.business_listings where id = 'b1000000-0000-0000-0000-000000000001';
select public.track_stay_event(stay_id, 'view') from public.business_listings where id = 'b1000000-0000-0000-0000-000000000001';
select public.track_stay_event(stay_id, 'view') from public.business_listings where id = 'b1000000-0000-0000-0000-000000000001';
do $$ begin
  assert (select views from public.business_stay_summary(
            (select stay_id from public.business_listings where id = 'b1000000-0000-0000-0000-000000000001'))) = 2, 'stats';
end $$;

-- sensitive edit goes back to review, live name unchanged
update public.business_listings set name = 'Albergue Casa Ana Hontanas'
where id = 'b1000000-0000-0000-0000-000000000001';
do $$ begin
  assert (select status from public.business_listings where id = 'b1000000-0000-0000-0000-000000000001') = 'submitted', 'rename needs review';
  assert (select s.name from public.stays s join public.business_listings l on l.stay_id = s.id
          where l.id = 'b1000000-0000-0000-0000-000000000001') = 'Albergue Casa Ana', 'live name unchanged';
end $$;

-- claim the seeded OSM-style stay
insert into public.businesses (id, name) values ('b0000000-0000-0000-0000-000000000002', 'Roncesvalles Hosts');
select public.claim_stay('b0000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001');
do $$ begin
  assert (select name from public.business_listings where claim_stay_id = '60000000-0000-0000-0000-000000000001') = 'Albergue de Roncesvalles', 'claim prefilled';
end $$;
commit;

-- ------------------------------------------------ B cannot touch A's live stay
begin;
select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-0000-0000-0000-000000000002", "role": "authenticated"}', true);
set local role authenticated;
do $$ begin
  insert into public.stay_availability (stay_id, day, status)
  select s.id, current_date + 1, 'full' from public.stays s where s.labels @> '{verified_owner}' limit 1;
  raise exception 'B set availability';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  assert (select count(*) from public.stay_stats_daily) = 0, 'B cannot read stats';
  assert (select count(*) from public.stay_availability) = 1, 'availability is public';
end $$;
commit;

\echo 'business_smoke: all assertions passed'
