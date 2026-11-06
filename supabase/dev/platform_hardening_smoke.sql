-- Platform hardening smoke test (migration 20261107000100). Runs after migrations + seed (validate.sh).
--
-- Self-contained: it creates its own users (ids start with 1b) and its own catalog fixtures, and every
-- section is one transaction that is rolled back, so nothing is left behind for other smoke files and no
-- section depends on another. Each block is attack-style: first the thing an attacker or a bug could do
-- (it must fail), then the legitimate flow next to it (it must still work).
\set ON_ERROR_STOP 1

\set as_postgres 'reset role; select set_config(''request.jwt.claims'', ''{}'', true);'
\set as_anon     'reset role; select set_config(''request.jwt.claims'', ''{"role": "anon"}'', true); set local role anon;'
\set as_service  'reset role; select set_config(''request.jwt.claims'', ''{"role": "service_role"}'', true); set local role service_role;'
\set as_u1  'reset role; select set_config(''request.jwt.claims'', ''{"sub": "1b000000-0000-0000-0000-000000000001", "role": "authenticated"}'', true); set local role authenticated;'
\set as_u2  'reset role; select set_config(''request.jwt.claims'', ''{"sub": "1b000000-0000-0000-0000-000000000002", "role": "authenticated"}'', true); set local role authenticated;'
\set as_u3  'reset role; select set_config(''request.jwt.claims'', ''{"sub": "1b000000-0000-0000-0000-000000000003", "role": "authenticated"}'', true); set local role authenticated;'
\set as_u4  'reset role; select set_config(''request.jwt.claims'', ''{"sub": "1b000000-0000-0000-0000-000000000004", "role": "authenticated"}'', true); set local role authenticated;'
\set as_u7  'reset role; select set_config(''request.jwt.claims'', ''{"sub": "1b000000-0000-0000-0000-000000000007", "role": "authenticated"}'', true); set local role authenticated;'
\set as_u8  'reset role; select set_config(''request.jwt.claims'', ''{"sub": "1b000000-0000-0000-0000-000000000008", "role": "authenticated"}'', true); set local role authenticated;'
\set as_u9  'reset role; select set_config(''request.jwt.claims'', ''{"sub": "1b000000-0000-0000-0000-000000000009", "role": "authenticated"}'', true); set local role authenticated;'
\set as_u10 'reset role; select set_config(''request.jwt.claims'', ''{"sub": "1b000000-0000-0000-0000-00000000000a", "role": "authenticated"}'', true); set local role authenticated;'
\set as_u11 'reset role; select set_config(''request.jwt.claims'', ''{"sub": "1b000000-0000-0000-0000-00000000000b", "role": "authenticated"}'', true); set local role authenticated;'
\set as_u12 'reset role; select set_config(''request.jwt.claims'', ''{"sub": "1b000000-0000-0000-0000-00000000000c", "role": "authenticated"}'', true); set local role authenticated;'
\set as_u13 'reset role; select set_config(''request.jwt.claims'', ''{"sub": "1b000000-0000-0000-0000-00000000000d", "role": "authenticated"}'', true); set local role authenticated;'
\set as_u14 'reset role; select set_config(''request.jwt.claims'', ''{"sub": "1b000000-0000-0000-0000-00000000000e", "role": "authenticated"}'', true); set local role authenticated;'

-- ============================================================================
-- 1. `private` is not an API
-- ============================================================================
begin;
:as_postgres
insert into auth.users (id, email) values
  ('1b000000-0000-0000-0000-000000000003', 'ph.attacker@example.test'),
  ('1b000000-0000-0000-0000-00000000000a', 'ph.plus@example.test');

do $$
declare bad text;
begin
  select string_agg(p.oid::regprocedure::text, ', ') into bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and has_function_privilege('public', p.oid, 'execute');
  assert bad is null, 'private functions executable by PUBLIC: ' || coalesce(bad, '');

  -- trigger functions never need a grant (Postgres checks EXECUTE when the trigger is created)
  select string_agg(p.oid::regprocedure::text, ', ') into bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.prorettype = 'trigger'::regtype
    and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
  assert bad is null, 'trigger functions callable by API roles: ' || coalesce(bad, '');

  -- the mutators and internals are server-only
  select string_agg(p.oid::regprocedure::text, ', ') into bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname in ('award_xp', 'grant_achievement', 'recalculate_storage_usage', 'housekeeping', 'config_bigint',
                      'platform_flag', 'platform_int', 'sync_listing_photos', 'storage_quota_bytes')
    and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
  assert bad is null, 'internal private functions callable by API roles: ' || coalesce(bad, '');

  -- no SECURITY DEFINER function in public is open to PUBLIC or anon (they all check auth.uid() themselves
  -- or are service_role only, but they must also be unreachable without a session)
  select string_agg(p.oid::regprocedure::text, ', ') into bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and (has_function_privilege('public', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'));
  assert bad is null, 'SECURITY DEFINER functions in public callable without a session: ' || coalesce(bad, '');

  -- nothing broke: every private function that an RLS policy, CHECK constraint or column default calls is
  -- executable by the roles it runs as (policies: the roles they apply to; constraints and defaults: signed-in users)
  select string_agg(distinct d.refobjid::regprocedure::text || ' for ' || r.rolname, ', ') into bad
  from pg_depend d
  join pg_proc p on p.oid = d.refobjid and d.refclassid = 'pg_proc'::regclass
  join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'private'
  left join pg_policy pol on d.classid = 'pg_policy'::regclass and pol.oid = d.objid
  cross join (values ('anon'), ('authenticated')) r(rolname)
  where d.classid in ('pg_policy'::regclass, 'pg_constraint'::regclass, 'pg_attrdef'::regclass)
    and (case when d.classid = 'pg_policy'::regclass
              then 0::oid = any (pol.polroles) or (select oid from pg_roles where rolname = r.rolname) = any (pol.polroles)
              else r.rolname = 'authenticated' end)
    and not has_function_privilege(r.rolname, p.oid, 'execute');
  assert bad is null, 'private functions called by policies, constraints or defaults but not executable by their role: ' || coalesce(bad, '');
end $$;

-- the attack: a signed-in user calls the internals
:as_u3
do $$
declare before_xp integer := (select xp from public.profiles where id = auth.uid());
begin
  if to_regprocedure('private.award_xp(uuid,integer,text,text,uuid)') is not null then
    begin
      perform private.award_xp(auth.uid(), 1000000, 'attack', 'attack', gen_random_uuid());
      raise exception 'private.award_xp ran as a signed-in user';
    exception when insufficient_privilege then null;
    end;
  end if;
  assert (select xp from public.profiles where id = auth.uid()) = before_xp, 'xp was changed through private.award_xp';
  begin
    perform private.recalculate_storage_usage(auth.uid());
    raise exception 'private.recalculate_storage_usage ran as a signed-in user';
  exception when insufficient_privilege then null;
  end;
  begin
    perform private.housekeeping();
    raise exception 'private.housekeeping ran as a signed-in user';
  exception when insufficient_privilege then null;
  end;
end $$;

:as_anon
do $$ begin
  if to_regprocedure('private.award_xp(uuid,integer,text,text,uuid)') is not null then
    begin
      perform private.award_xp(gen_random_uuid(), 5, 'attack', 'attack', gen_random_uuid());
      raise exception 'private.award_xp ran as anon';
    exception when insufficient_privilege then null;
    end;
  end if;
  perform private.can_see(gen_random_uuid(), 'public');   -- explicitly granted, still works
end $$;

-- and everything RLS, triggers and invoker functions call as the signed-in role still works
:as_u3
do $$
declare msg text;
begin
  perform count(*) from public.posts;          -- policy -> private.can_see
  perform count(*) from public.profiles;       -- policy -> private.is_blocked
  perform count(*) from public.journeys;
  perform count(*) from public.follows;
  -- security invoker trigger -> private.crowd_report_ttl
  insert into public.crowd_reports (kind, location) values ('beds_full', 'SRID=4326;POINT(-1.3 43.0)');
  assert (select expires_at > now() + interval '10 hours' from public.crowd_reports where user_id = auth.uid()),
         'crowd report expiry (private.crowd_report_ttl as invoker)';
  -- upload policy -> private.storage_remaining_bytes: a free user is refused by the POLICY, not by a missing grant
  begin
    insert into storage.objects (bucket_id, name, metadata)
    values ('user-media', auth.uid()::text || '/posts/a.jpg', '{"size": 10}');
    raise exception 'a free user uploaded to user-media';
  exception when insufficient_privilege then
    get stacked diagnostics msg = message_text;
    assert msg like 'new row violates row-level security policy%', 'upload refused for the wrong reason: ' || msg;
  end;
end $$;

:as_postgres
update public.subscriptions set status = 'active', expires_at = now() + interval '1 year'
where user_id = '1b000000-0000-0000-0000-00000000000a';
:as_u10
do $$ begin
  insert into storage.objects (bucket_id, name, metadata)
  values ('user-media', auth.uid()::text || '/posts/a.jpg', '{"size": 10}');   -- a Plus pilgrim may
  assert private.has_plus(auth.uid()), 'plus user';
end $$;

-- defaults for what is created from now on
:as_postgres
create function private.zz_probe() returns int language sql as 'select 1';
create function public.zz_probe() returns int language sql as 'select 1';
do $$ begin
  assert not has_function_privilege('public', 'private.zz_probe()', 'execute'), 'new private function is executable by PUBLIC';
  assert not has_function_privilege('anon', 'private.zz_probe()', 'execute')
     and not has_function_privilege('authenticated', 'private.zz_probe()', 'execute'), 'new private function is callable by API roles';
  assert not has_function_privilege('public', 'public.zz_probe()', 'execute'), 'new public function is executable by PUBLIC';
  assert has_function_privilege('anon', 'public.zz_probe()', 'execute')
     and has_function_privilege('authenticated', 'public.zz_probe()', 'execute')
     and has_function_privilege('service_role', 'public.zz_probe()', 'execute'), 'new public function lost the explicit API grants';
end $$;

-- server-only tables: RLS on, so even a mistaken GRANT shows nothing
do $$
declare bad text;
begin
  select string_agg(c.relname, ', ') into bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'private' and c.relkind in ('r', 'p') and not c.relrowsecurity;
  assert bad is null, 'tables in private without RLS: ' || coalesce(bad, '');
end $$;
insert into public.stays (id, source, category, name, location, business_id)
values ('1b0d0000-0000-0000-0000-000000000001', 'osm', 'cafe', 'Probe', 'SRID=4326;POINT(0 0)', null);
insert into private.stay_event_log (user_id, stay_id, event, day)
values ('1b000000-0000-0000-0000-000000000003', '1b0d0000-0000-0000-0000-000000000001', 'view', current_date);
grant select on private.stay_event_log to authenticated;
:as_u3
do $$ begin
  assert (select count(*) from private.stay_event_log) = 0, 'RLS did not hide the rows of a private table';
end $$;
rollback;

-- ============================================================================
-- 2. Account deletion must complete, and leave nothing orphaned
-- ============================================================================
begin;
:as_postgres
-- 2.0 no foreign key can block deleting a profile (or the rows deleted with it)
do $$
declare bad text;
begin
  with recursive closure(tbl) as (
    select 'public.profiles'::regclass
    union
    select c.conrelid from pg_constraint c join closure on c.confrelid = closure.tbl
    where c.contype = 'f' and c.confdeltype = 'c')
  select string_agg(c.conrelid::regclass::text || '.' || c.conname, ', ') into bad
  from pg_constraint c
  where c.contype = 'f' and c.confdeltype in ('r', 'a')
    and c.confrelid in (select tbl from closure union select 'auth.users'::regclass);
  assert bad is null, 'foreign keys that can block account deletion (RESTRICT / NO ACTION): ' || coalesce(bad, '');

  -- ON DELETE SET NULL on a NOT NULL column fails the same way
  select string_agg(c.conrelid::regclass::text || '.' || a.attname, ', ') into bad
  from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
  where c.contype = 'f' and c.confdeltype = 'n' and a.attnotnull
    and c.confrelid in (select tbl from (
      with recursive closure(tbl) as (
        select 'public.profiles'::regclass
        union
        select c2.conrelid from pg_constraint c2 join closure on c2.confrelid = closure.tbl
        where c2.contype = 'f' and c2.confdeltype = 'c')
      select tbl from closure) k);
  assert bad is null, 'SET NULL on NOT NULL columns would block account deletion: ' || coalesce(bad, '');
end $$;

insert into auth.users (id, email) values
  ('1b000000-0000-0000-0000-000000000001', 'ph.sole.owner@example.test'),
  ('1b000000-0000-0000-0000-000000000002', 'ph.manager@example.test'),
  ('1b000000-0000-0000-0000-000000000003', 'ph.victim@example.test'),
  ('1b000000-0000-0000-0000-000000000004', 'ph.owner.two@example.test'),
  ('1b000000-0000-0000-0000-000000000005', 'ph.seller@example.test'),
  ('1b000000-0000-0000-0000-000000000006', 'ph.buyer@example.test'),
  ('1b000000-0000-0000-0000-000000000007', 'ph.staff@example.test'),
  ('1b000000-0000-0000-0000-00000000000b', 'ph.owner.three@example.test');
-- the labels this section needs, whether or not the seed was loaded
insert into public.stay_labels (slug, name, owner_assignable) values
  ('pilgrims_only', 'Pilgrims only', true), ('partner', 'CaminoPlus partner', false)
on conflict (slug) do update set owner_assignable = excluded.owner_assignable;
insert into public.stays (id, source, category, name, location, labels, data_checked_at, verification_level) values
  ('1b0d0000-0000-0000-0000-000000000002', 'osm', 'albergue_private', 'Albergue Dos', 'SRID=4326;POINT(-4.1 42.3)', '{partner,pilgrims_only}', null, 'unverified'),
  ('1b0d0000-0000-0000-0000-000000000003', 'osm', 'albergue_private', 'Albergue Tres', 'SRID=4326;POINT(-4.2 42.3)', '{pilgrims_only}', now(), 'data_check');

-- 2.1 A manager cannot point created_by at somebody else (that would make the victim "the creator" of
--     the business and, before this fix, undeletable)
:as_u4
insert into public.businesses (id, name) values ('1b0b0000-0000-0000-0000-000000000002', 'Casa Dos');
:as_postgres
insert into public.business_members (business_id, user_id, role)
values ('1b0b0000-0000-0000-0000-000000000002', '1b000000-0000-0000-0000-000000000002', 'manager');
:as_u2
do $$ begin
  update public.businesses set created_by = '1b000000-0000-0000-0000-000000000003', name = 'Casa Dos Hontanas'
  where id = '1b0b0000-0000-0000-0000-000000000002';
  assert (select name from public.businesses where id = '1b0b0000-0000-0000-0000-000000000002') = 'Casa Dos Hontanas', 'a manager still edits the business';
  assert (select created_by from public.businesses where id = '1b0b0000-0000-0000-0000-000000000002') = '1b000000-0000-0000-0000-000000000004',
         'created_by of a business was rewritten by a manager';
  begin
    insert into public.business_listings (business_id, category, name, created_by)
    values ('1b0b0000-0000-0000-0000-000000000002', 'cafe', 'Forged', '1b000000-0000-0000-0000-000000000003');
    raise exception 'a manager created a listing in somebody else''s name';
  exception when insufficient_privilege then null;
  end;
  insert into public.business_listings (id, business_id, category, name)
  values ('1b0c0000-0000-0000-0000-000000000002', '1b0b0000-0000-0000-0000-000000000002', 'cafe', 'Cafe Dos');
  update public.business_listings set created_by = '1b000000-0000-0000-0000-000000000003'
  where id = '1b0c0000-0000-0000-0000-000000000002';
  assert (select created_by from public.business_listings where id = '1b0c0000-0000-0000-0000-000000000002') = '1b000000-0000-0000-0000-000000000002',
         'created_by of a listing was rewritten';
  insert into public.business_verifications (id, business_id, method, document_kind, storage_path)
  values ('1b0f0000-0000-0000-0000-000000000002', '1b0b0000-0000-0000-0000-000000000002', 'document', 'tax_id', '1b0b0000-0000-0000-0000-000000000002/nif.pdf');
  update public.business_verifications set created_by = '1b000000-0000-0000-0000-000000000003'
  where id = '1b0f0000-0000-0000-0000-000000000002';
  assert (select created_by from public.business_verifications where id = '1b0f0000-0000-0000-0000-000000000002') = '1b000000-0000-0000-0000-000000000002',
         'created_by of a verification was rewritten';
end $$;

-- 2.2 sole owner of a live business with a new place and photos deletes the account
:as_u1
insert into public.businesses (id, name) values ('1b0b0000-0000-0000-0000-000000000001', 'Casa Uno');
insert into public.business_listings (id, business_id, category, name, address, location, phone, website)
values ('1b0c0000-0000-0000-0000-000000000001', '1b0b0000-0000-0000-0000-000000000001', 'albergue_private', 'Albergue Uno',
        'Calle Real 1', 'SRID=4326;POINT(-4.0 42.3)', '+34 600 000 001', 'https://uno.example/');
insert into public.business_listing_photos (listing_id, storage_path, sort_order) values
  ('1b0c0000-0000-0000-0000-000000000001', '1b0b0000-0000-0000-0000-000000000001/1.jpg', 0),
  ('1b0c0000-0000-0000-0000-000000000001', '1b0b0000-0000-0000-0000-000000000001/2.jpg', 1);
:as_service
select public.review_business_listing('1b0c0000-0000-0000-0000-000000000001', 'approve', 'welcome');
:as_postgres
do $$
declare sid uuid := (select stay_id from public.business_listings where id = '1b0c0000-0000-0000-0000-000000000001');
begin
  assert sid is not null and (select business_id from public.stays where id = sid) = '1b0b0000-0000-0000-0000-000000000001', 'live stay is managed by the business';
  assert (select count(*) from public.stay_photos where stay_id = sid and source = 'owner' and deleted_at is null) = 2, 'owner photos are live';
end $$;
delete from auth.users where id = '1b000000-0000-0000-0000-000000000001';       -- <- used to fail with 23503
do $$
declare sid uuid := (select stay_id from public.business_listings where id = '1b0c0000-0000-0000-0000-000000000001');
begin
  assert not exists (select 1 from public.profiles where id = '1b000000-0000-0000-0000-000000000001'), 'profile deleted';
  assert (select deleted_at is not null and created_by is null from public.businesses where id = '1b0b0000-0000-0000-0000-000000000001'),
         'business without any team is closed, created_by cleared';
  assert not exists (select 1 from public.business_members where business_id = '1b0b0000-0000-0000-0000-000000000001'), 'members removed';
  assert (select status = 'suspended' and deleted_at is not null from public.business_listings where id = '1b0c0000-0000-0000-0000-000000000001'),
         'listing of a closed business is suspended and released';
  assert (select deleted_at is not null and business_id is null and owner_verified_at is null and not labels @> '{verified_owner}'
                 and verification_level = 'unverified' and verified_at is null
          from public.stays where id = sid), 'a stay created by the owner comes down with the business';
  assert not exists (select 1 from public.stay_photos where stay_id = sid and deleted_at is null), 'owner photos are hidden';
  assert exists (select 1 from public.business_listing_events where listing_id = '1b0c0000-0000-0000-0000-000000000001' and to_status = 'suspended'),
         'the takedown is on the listing timeline';
end $$;

-- 2.3 the owner leaves a business that has a manager: the manager takes over, the place stays live
:as_u4
select public.claim_stay('1b0b0000-0000-0000-0000-000000000002', '1b0d0000-0000-0000-0000-000000000002');
:as_service
select public.review_business_listing(id, 'approve') from public.business_listings
where claim_stay_id = '1b0d0000-0000-0000-0000-000000000002';
:as_postgres
do $$ begin
  assert (select business_id from public.stays where id = '1b0d0000-0000-0000-0000-000000000002') = '1b0b0000-0000-0000-0000-000000000002', 'claimed place is live';
end $$;
delete from auth.users where id = '1b000000-0000-0000-0000-000000000004';
do $$ begin
  assert (select role from public.business_members where business_id = '1b0b0000-0000-0000-0000-000000000002'
          and user_id = '1b000000-0000-0000-0000-000000000002') = 'owner', 'the manager became owner';
  assert (select deleted_at is null and created_by is null from public.businesses where id = '1b0b0000-0000-0000-0000-000000000002'), 'the business lives on';
  assert (select business_id from public.stays where id = '1b0d0000-0000-0000-0000-000000000002') = '1b0b0000-0000-0000-0000-000000000002', 'the place stays managed';
end $$;
:as_u2
do $$ begin
  update public.business_listings set opening_hours = 'Apr-Oct' where claim_stay_id = '1b0d0000-0000-0000-0000-000000000002';
  assert (select opening_hours from public.stays where id = '1b0d0000-0000-0000-0000-000000000002') = 'Apr-Oct', 'the new owner keeps editing';
end $$;

-- 2.4 the owner leaves a business with only staff: it closes, the claimed place goes back to its data
:as_postgres
insert into public.businesses (id, name, created_by) values ('1b0b0000-0000-0000-0000-000000000003', 'Casa Tres', '1b000000-0000-0000-0000-00000000000b');
insert into public.business_members (business_id, user_id, role)
values ('1b0b0000-0000-0000-0000-000000000003', '1b000000-0000-0000-0000-000000000007', 'staff');
insert into public.business_listings (id, business_id, claim_stay_id, category, name, labels, created_by)
values ('1b0c0000-0000-0000-0000-000000000003', '1b0b0000-0000-0000-0000-000000000003', '1b0d0000-0000-0000-0000-000000000003',
        'albergue_private', 'Albergue Tres', '{pilgrims_only}', '1b000000-0000-0000-0000-00000000000b');
:as_service
select public.review_business_listing('1b0c0000-0000-0000-0000-000000000003', 'approve');
:as_postgres
do $$ begin
  assert (select verification_level = 'owner' and labels @> '{verified_owner,pilgrims_only}' from public.stays where id = '1b0d0000-0000-0000-0000-000000000003'),
         'approved: owner level and badge';
end $$;
delete from auth.users where id = '1b000000-0000-0000-0000-00000000000b';
do $$ begin
  assert (select deleted_at is not null from public.businesses where id = '1b0b0000-0000-0000-0000-000000000003'), 'staff-only business is closed';
  assert (select status = 'suspended' and deleted_at is not null from public.business_listings where id = '1b0c0000-0000-0000-0000-000000000003'), 'its listing is suspended';
  assert (select deleted_at is null and business_id is null and owner_verified_at is null and not labels @> '{verified_owner}'
                 and labels @> '{pilgrims_only}' and verification_level = 'data_check' and verified_at is null
          from public.stays where id = '1b0d0000-0000-0000-0000-000000000003'), 'the OSM place stays, minus the owner badge, back to its data check';
end $$;
:as_u7
do $$ begin
  assert (select count(*) from public.businesses) = 0, 'staff of a closed business see nothing';
end $$;
-- the closed business no longer holds a claim: the real owner can claim the place now
:as_u3
insert into public.businesses (id, name) values ('1b0b0000-0000-0000-0000-000000000008', 'Casa Tres de verdad');
select public.claim_stay('1b0b0000-0000-0000-0000-000000000008', '1b0d0000-0000-0000-0000-000000000003') is not null;

-- 2.5 a seller whose photo somebody bought can delete the account; the buyer's record stays
:as_postgres
insert into public.marketplace_photos (id, seller_id, original_path, preview_path, price_cents)
values ('1b100000-0000-0000-0000-000000000001', '1b000000-0000-0000-0000-000000000005', 'o.jpg', 'p.jpg', 500);
insert into public.marketplace_purchases (id, buyer_id, photo_id, price_cents, currency, payment_provider, payment_ref)
values ('1b110000-0000-0000-0000-000000000001', '1b000000-0000-0000-0000-000000000006', '1b100000-0000-0000-0000-000000000001', 500, 'USD', 'stripe', 'ph-ref-1');
delete from auth.users where id = '1b000000-0000-0000-0000-000000000005';
do $$ begin
  assert not exists (select 1 from public.marketplace_photos where id = '1b100000-0000-0000-0000-000000000001'), 'seller photo deleted';
  assert (select photo_id is null and buyer_id = '1b000000-0000-0000-0000-000000000006' from public.marketplace_purchases
          where id = '1b110000-0000-0000-0000-000000000001'), 'the purchase record is kept';
end $$;
rollback;

-- ============================================================================
-- 3. Owner dashboard counters
-- ============================================================================
begin;
:as_postgres
insert into auth.users (id, email) values
  ('1b000000-0000-0000-0000-000000000003', 'ph.visitor@example.test'),
  ('1b000000-0000-0000-0000-00000000000c', 'ph.dash.owner@example.test'),
  ('1b000000-0000-0000-0000-00000000000d', 'ph.visitor.two@example.test');
insert into public.businesses (id, name, created_by) values ('1b0b0000-0000-0000-0000-000000000004', 'Casa Cuatro', '1b000000-0000-0000-0000-00000000000c');
insert into public.stays (id, source, category, name, location, business_id) values
  ('1b0d0000-0000-0000-0000-000000000004', 'owner', 'albergue_private', 'Albergue Cuatro', 'SRID=4326;POINT(-4.3 42.3)', '1b0b0000-0000-0000-0000-000000000004'),
  ('1b0d0000-0000-0000-0000-000000000005', 'osm', 'albergue_private', 'Albergue Cinco (no owner)', 'SRID=4326;POINT(-4.4 42.3)', null);

-- the attack: 1000 anonymous calls
:as_anon
do $$
declare i integer;
begin
  for i in 1..1000 loop
    begin
      perform public.track_stay_event('1b0d0000-0000-0000-0000-000000000004', 'booking');
      raise exception 'anon counted a booking tap';
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;
:as_postgres
do $$ begin
  assert coalesce((select sum(booking_taps) from public.stay_stats_daily where stay_id = '1b0d0000-0000-0000-0000-000000000004'), 0) = 0,
         'anonymous calls were counted';
end $$;

-- a signed-in pilgrim counts once per place, event and day, however often the screen asks
:as_u3
do $$
declare i integer;
begin
  for i in 1..50 loop
    perform public.track_stay_event('1b0d0000-0000-0000-0000-000000000004', 'booking');
  end loop;
  perform public.track_stay_event('1b0d0000-0000-0000-0000-000000000004', 'view');
  perform public.track_stay_event('1b0d0000-0000-0000-0000-000000000004', 'view');
  perform public.track_stay_event('1b0d0000-0000-0000-0000-000000000005', 'view');     -- no owner: nothing to count
  begin
    perform public.track_stay_event('1b0d0000-0000-0000-0000-000000000004', 'hack');
    raise exception 'unknown event accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform count(*) from private.stay_event_log;
    raise exception 'the de-duplication table is readable';
  exception when insufficient_privilege then null;
  end;
end $$;
:as_u13
select public.track_stay_event('1b0d0000-0000-0000-0000-000000000004', 'booking');
:as_postgres
do $$ begin
  assert (select booking_taps from public.stay_stats_daily where stay_id = '1b0d0000-0000-0000-0000-000000000004') = 2, 'one booking tap per pilgrim (2 pilgrims)';
  assert (select views from public.stay_stats_daily where stay_id = '1b0d0000-0000-0000-0000-000000000004') = 1, 'one view per pilgrim and day';
  assert not exists (select 1 from public.stay_stats_daily where stay_id = '1b0d0000-0000-0000-0000-000000000005'), 'places without an owner have no counters';
  assert (select count(*) from private.stay_event_log where stay_id = '1b0d0000-0000-0000-0000-000000000005') = 0, 'and no de-duplication rows';
end $$;
-- the dashboard still works for the team and is closed to everybody else
:as_u12
do $$ begin
  assert (select booking_taps from public.business_stay_summary('1b0d0000-0000-0000-0000-000000000004')) = 2, 'the owner sees the booking taps';
  assert (select views from public.business_stay_summary('1b0d0000-0000-0000-0000-000000000004')) = 1, 'and the views';
end $$;
:as_u3
do $$ begin
  assert (select count(*) from public.business_stay_summary('1b0d0000-0000-0000-0000-000000000004')) = 0, 'a visitor sees no dashboard';
end $$;
rollback;

-- ============================================================================
-- 4. Business module
-- ============================================================================
begin;
:as_postgres
insert into auth.users (id, email) values
  ('1b000000-0000-0000-0000-000000000003', 'ph.intruder@example.test'),
  ('1b000000-0000-0000-0000-000000000007', 'ph.biz.staff@example.test'),
  ('1b000000-0000-0000-0000-00000000000c', 'ph.biz.owner@example.test'),
  ('1b000000-0000-0000-0000-00000000000d', 'ph.biz.owner.two@example.test');
-- the labels this section needs, whether or not the seed was loaded
insert into public.stay_labels (slug, name, owner_assignable) values
  ('pilgrims_only', 'Pilgrims only', true), ('pet_friendly', 'Pet friendly', true),
  ('bike_friendly', 'Bike friendly', true), ('partner', 'CaminoPlus partner', false)
on conflict (slug) do update set owner_assignable = excluded.owner_assignable;
insert into public.stays (id, source, category, name, location, labels) values
  ('1b0d0000-0000-0000-0000-000000000011', 'osm', 'albergue_private', 'Claim 1', 'SRID=4326;POINT(-5.01 42.3)', '{}'),
  ('1b0d0000-0000-0000-0000-000000000012', 'osm', 'albergue_private', 'Claim 2', 'SRID=4326;POINT(-5.02 42.3)', '{}'),
  ('1b0d0000-0000-0000-0000-000000000013', 'osm', 'albergue_private', 'Claim 3', 'SRID=4326;POINT(-5.03 42.3)', '{}'),
  ('1b0d0000-0000-0000-0000-000000000014', 'osm', 'albergue_private', 'Claim 4', 'SRID=4326;POINT(-5.04 42.3)', '{}'),
  ('1b0d0000-0000-0000-0000-000000000015', 'osm', 'albergue_private', 'Claim 5', 'SRID=4326;POINT(-5.05 42.3)', '{}'),
  ('1b0d0000-0000-0000-0000-000000000018', 'osm', 'albergue_private', 'Server labels', 'SRID=4326;POINT(-5.08 42.3)', '{partner,pilgrims_only}');

-- 4.1 claim_stay_id is only set by claim_stay(); claims are limited so nobody can squat the map
:as_u12
insert into public.businesses (id, name) values ('1b0b0000-0000-0000-0000-000000000005', 'Hosts Cinco');
do $$
declare lid uuid;
begin
  insert into public.business_listings (id, business_id, category, name, claim_stay_id)
  values ('1b0c0000-0000-0000-0000-000000000010', '1b0b0000-0000-0000-0000-000000000005', 'cafe', 'Direct claim', '1b0d0000-0000-0000-0000-000000000011');
  assert (select claim_stay_id is null from public.business_listings where id = '1b0c0000-0000-0000-0000-000000000010'),
         'claim_stay_id was set by a direct insert (bypasses the ownership check of claim_stay)';
  update public.business_listings set claim_stay_id = '1b0d0000-0000-0000-0000-000000000011' where id = '1b0c0000-0000-0000-0000-000000000010';
  assert (select claim_stay_id is null from public.business_listings where id = '1b0c0000-0000-0000-0000-000000000010'),
         'claim_stay_id was changed by a direct update';

  perform public.claim_stay('1b0b0000-0000-0000-0000-000000000005', '1b0d0000-0000-0000-0000-000000000011');
  perform public.claim_stay('1b0b0000-0000-0000-0000-000000000005', '1b0d0000-0000-0000-0000-000000000012');
  perform public.claim_stay('1b0b0000-0000-0000-0000-000000000005', '1b0d0000-0000-0000-0000-000000000013');
  begin
    perform public.claim_stay('1b0b0000-0000-0000-0000-000000000005', '1b0d0000-0000-0000-0000-000000000014');
    raise exception 'a fourth open claim was accepted';
  exception when check_violation then null;
  end;
end $$;
:as_u13
insert into public.businesses (id, name) values ('1b0b0000-0000-0000-0000-000000000006', 'Hosts Seis');
do $$ begin
  begin
    perform public.claim_stay('1b0b0000-0000-0000-0000-000000000006', '1b0d0000-0000-0000-0000-000000000011');
    raise exception 'a place somebody else is claiming was claimed twice';
  exception when unique_violation then null;
  end;
  perform public.claim_stay('1b0b0000-0000-0000-0000-000000000006', '1b0d0000-0000-0000-0000-000000000014');   -- the limit is per person
  begin
    perform public.claim_stay('1b0b0000-0000-0000-0000-000000000005', '1b0d0000-0000-0000-0000-000000000015');
    raise exception 'claimed for a business I am not in';
  exception when insufficient_privilege then null;
  end;
end $$;
-- once a claim is rejected the person can claim again
:as_service
select public.review_business_listing(id, 'reject', 'not the owner') from public.business_listings
where claim_stay_id = '1b0d0000-0000-0000-0000-000000000011';
:as_u12
select public.claim_stay('1b0b0000-0000-0000-0000-000000000005', '1b0d0000-0000-0000-0000-000000000015') is not null;
-- the limit can be tuned without a migration
:as_postgres
update public.app_config set value = '1' where key = 'max_open_stay_claims';
:as_u13
do $$ begin
  begin
    perform public.claim_stay('1b0b0000-0000-0000-0000-000000000006', '1b0d0000-0000-0000-0000-000000000018');
    raise exception 'max_open_stay_claims = 1 was ignored';
  exception when check_violation then null;
  end;
end $$;
:as_postgres
update public.app_config set value = '3' where key = 'max_open_stay_claims';

-- 4.2 labels: the owner chooses from the allowed ones; `partner` and `verified_owner` are the team's
:as_u13
do $$ begin
  insert into public.business_listings (id, business_id, category, name, location, labels, website, booking_url)
  values ('1b0c0000-0000-0000-0000-000000000020', '1b0b0000-0000-0000-0000-000000000006', 'hostel', 'Hostel Labels',
          'SRID=4326;POINT(-5.2 42.3)', '{partner,pet_friendly,verified_owner,not_a_label}', 'https://casa.example/home', 'https://book.example/casa');
  assert (select labels = '{pet_friendly}' from public.business_listings where id = '1b0c0000-0000-0000-0000-000000000020'),
         'a client wrote server-only labels into its listing';
end $$;
:as_service
select public.review_business_listing('1b0c0000-0000-0000-0000-000000000020', 'approve');
:as_postgres
do $$
declare sid uuid := (select stay_id from public.business_listings where id = '1b0c0000-0000-0000-0000-000000000020');
begin
  assert (select labels = '{pet_friendly,verified_owner}' from public.stays where id = sid), 'owner-chosen label published, partner not';
  assert (select verification_level = 'owner' and verified_at is not null and owner_verified_at is not null from public.stays where id = sid),
         'an approved listing is "owner" verified (it said "Not verified yet")';
  assert public.verification_label('owner', now()) like 'Verified by owner%', 'verification label';
end $$;
-- the server labels of a claimed place survive; the owner starts from, and decides, the rest
:as_u13
select public.claim_stay('1b0b0000-0000-0000-0000-000000000006', '1b0d0000-0000-0000-0000-000000000018');
do $$ begin
  assert (select labels = '{pilgrims_only}' from public.business_listings where claim_stay_id = '1b0d0000-0000-0000-0000-000000000018'),
         'the claimed listing starts with the labels the owner may choose (not partner)';
end $$;
update public.business_listings set labels = labels || '{bike_friendly,partner}'::text[]
where claim_stay_id = '1b0d0000-0000-0000-0000-000000000018';
do $$ begin
  assert (select labels = '{bike_friendly,pilgrims_only}' from public.business_listings where claim_stay_id = '1b0d0000-0000-0000-0000-000000000018'),
         'listing labels after a client edit';
end $$;
:as_service
select public.review_business_listing(id, 'approve') from public.business_listings where claim_stay_id = '1b0d0000-0000-0000-0000-000000000018';
:as_postgres
do $$ begin
  assert (select labels = '{bike_friendly,partner,pilgrims_only,verified_owner}' from public.stays where id = '1b0d0000-0000-0000-0000-000000000018'),
         'server label kept, owner labels published';
end $$;
:as_u13
update public.business_listings set labels = '{}' where claim_stay_id = '1b0d0000-0000-0000-0000-000000000018';
:as_postgres
do $$ begin
  assert (select labels = '{partner,verified_owner}' from public.stays where id = '1b0d0000-0000-0000-0000-000000000018'),
         'an owner can drop their own labels but never the server label';
end $$;

-- 4.3 web addresses: no javascript:, a NEW web address needs review, another page on the same site does not
:as_u13
do $$ begin
  begin
    update public.business_listings set website = 'javascript:alert(1)' where id = '1b0c0000-0000-0000-0000-000000000020';
    raise exception 'a javascript: link was accepted';
  exception when check_violation then null;
  end;
  begin
    update public.business_listings set booking_url = 'intent://x#Intent;end' where id = '1b0c0000-0000-0000-0000-000000000020';
    raise exception 'an intent: link was accepted';
  exception when check_violation then null;
  end;
  update public.business_listings set website = 'https://www.casa.example/about?x=1', description = 'New text'
  where id = '1b0c0000-0000-0000-0000-000000000020';
  assert (select status = 'approved' from public.business_listings where id = '1b0c0000-0000-0000-0000-000000000020'), 'same site, other page: still a safe edit';
  assert (select website = 'https://www.casa.example/about?x=1' and description = 'New text' from public.stays
          where id = (select stay_id from public.business_listings where id = '1b0c0000-0000-0000-0000-000000000020')), 'and it went live';
  update public.business_listings set booking_url = 'https://pay.evil.example/casa' where id = '1b0c0000-0000-0000-0000-000000000020';
  assert (select status = 'submitted' from public.business_listings where id = '1b0c0000-0000-0000-0000-000000000020'), 'a new booking site goes back to review';
  assert (select booking_url = 'https://book.example/casa' from public.stays
          where id = (select stay_id from public.business_listings where id = '1b0c0000-0000-0000-0000-000000000020')), 'the reviewed link stays live meanwhile';
end $$;

-- 4.4 taking a listing down removes the team's hold on the place; a suspended business cannot act
:as_u12
insert into public.business_listings (id, business_id, category, name, address, location, phone)
values ('1b0c0000-0000-0000-0000-000000000030', '1b0b0000-0000-0000-0000-000000000005', 'hotel', 'Hotel Treinta', 'Calle 30',
        'SRID=4326;POINT(-5.3 42.3)', '+34 600 000 030');
:as_service
select public.review_business_listing('1b0c0000-0000-0000-0000-000000000030', 'approve');
:as_u12
do $$
declare sid uuid := (select stay_id from public.business_listings where id = '1b0c0000-0000-0000-0000-000000000030');
begin
  insert into public.stay_availability (stay_id, day, status, beds_free) values (sid, current_date, 'few_left', 3);   -- the team may
end $$;
:as_service
select public.review_business_listing('1b0c0000-0000-0000-0000-000000000030', 'suspend', 'policy breach');
:as_u12
do $$
declare
  sid uuid := (select stay_id from public.business_listings where id = '1b0c0000-0000-0000-0000-000000000030');
  n   integer;
begin
  begin
    insert into public.stay_availability (stay_id, day, status) values (sid, current_date + 1, 'full');
    raise exception 'a suspended team kept editing availability';
  exception when insufficient_privilege then null;
  end;
  update public.stay_availability set status = 'full' where stay_id = sid;
  get diagnostics n = row_count;
  assert n = 0, 'a suspended team changed existing availability';
end $$;
:as_postgres
do $$
declare sid uuid := (select stay_id from public.business_listings where id = '1b0c0000-0000-0000-0000-000000000030');
begin
  assert (select business_id is null from public.stays where id = sid), 'stays.business_id was not cleared on suspend';
  assert (select status = 'few_left' from public.stay_availability where stay_id = sid and day = current_date), 'availability untouched';
end $$;
-- approve again: the team is back
:as_service
select public.review_business_listing('1b0c0000-0000-0000-0000-000000000030', 'approve');
:as_u12
do $$
declare sid uuid := (select stay_id from public.business_listings where id = '1b0c0000-0000-0000-0000-000000000030');
begin
  update public.stay_availability set status = 'full' where stay_id = sid and day = current_date;
  assert (select status = 'full' from public.stay_availability where stay_id = sid and day = current_date), 'the re-approved team edits availability again';
end $$;

-- business suspended by the team: members can read but not act; its listings come down; no approvals
:as_postgres
update public.businesses set status = 'suspended' where id = '1b0b0000-0000-0000-0000-000000000005';
do $$ begin
  assert (select status = 'suspended' from public.business_listings where id = '1b0c0000-0000-0000-0000-000000000030'), 'listings of a suspended business come down';
  assert (select business_id is null from public.stays where id = (select stay_id from public.business_listings where id = '1b0c0000-0000-0000-0000-000000000030')),
         'and the stay is released';
end $$;
:as_u12
do $$
declare n integer;
begin
  assert (select count(*) from public.businesses where id = '1b0b0000-0000-0000-0000-000000000005') = 1, 'a suspended team can still read its business';
  assert (select count(*) from public.business_listings where business_id = '1b0b0000-0000-0000-0000-000000000005') >= 1, 'and its listings';
  update public.business_listings set description = 'edited while suspended' where business_id = '1b0b0000-0000-0000-0000-000000000005';
  get diagnostics n = row_count;
  assert n = 0, 'a suspended team edited a listing';
  update public.businesses set name = 'Renamed' where id = '1b0b0000-0000-0000-0000-000000000005';
  get diagnostics n = row_count;
  assert n = 0, 'a suspended team renamed its business';
  begin
    insert into public.business_listings (business_id, category, name) values ('1b0b0000-0000-0000-0000-000000000005', 'cafe', 'New');
    raise exception 'a suspended team created a listing';
  exception when insufficient_privilege then null;
  end;
end $$;
:as_service
do $$ begin
  begin
    perform public.review_business_listing('1b0c0000-0000-0000-0000-000000000030', 'approve');
    raise exception 'a listing of a suspended business was approved';
  exception when sqlstate '22023' then null;
  end;
end $$;
:as_postgres
update public.businesses set status = 'active' where id = '1b0b0000-0000-0000-0000-000000000005';
do $$ begin
  assert (select status = 'suspended' from public.business_listings where id = '1b0c0000-0000-0000-0000-000000000030'),
         'reactivating a business does not republish anything on its own';
end $$;
:as_service
select public.review_business_listing('1b0c0000-0000-0000-0000-000000000030', 'approve');
:as_postgres
do $$ begin
  assert (select business_id = '1b0b0000-0000-0000-0000-000000000005' from public.stays
          where id = (select stay_id from public.business_listings where id = '1b0c0000-0000-0000-0000-000000000030')), 'approved again after the review';
end $$;

-- 4.4b a live listing that waits for its second review comes down too: suspend, reject, or closing the business
--      (the old version of such a listing is still live, so the take-down must not depend on the previous status)
:as_u13
insert into public.businesses (id, name) values ('1b0b0000-0000-0000-0000-000000000009', 'Hosts Nueve');
insert into public.business_listings (id, business_id, category, name, address, location, phone, website)
values ('1b0c0000-0000-0000-0000-000000000040', '1b0b0000-0000-0000-0000-000000000009', 'hostel', 'Hostel Cuarenta', 'Calle 40',
        'SRID=4326;POINT(-5.4 42.3)', '+34 600 000 040', 'https://cuarenta.example/');
:as_service
select public.review_business_listing('1b0c0000-0000-0000-0000-000000000040', 'approve');
:as_u13
update public.business_listings set website = 'https://nuevo.example/' where id = '1b0c0000-0000-0000-0000-000000000040';
do $$
declare sid uuid := (select stay_id from public.business_listings where id = '1b0c0000-0000-0000-0000-000000000040');
begin
  assert (select status = 'submitted' from public.business_listings where id = '1b0c0000-0000-0000-0000-000000000040'), 'a new website waits for review';
  assert (select business_id is not null and website = 'https://cuarenta.example/' and deleted_at is null from public.stays where id = sid),
         'the verified version stays live meanwhile';
end $$;
:as_service
select public.review_business_listing('1b0c0000-0000-0000-0000-000000000040', 'suspend', 'policy breach');
:as_postgres
do $$
declare sid uuid := (select stay_id from public.business_listings where id = '1b0c0000-0000-0000-0000-000000000040');
begin
  assert (select business_id is null and owner_verified_at is null and deleted_at is not null and verification_level = 'unverified'
                 and not labels @> '{verified_owner}' from public.stays where id = sid),
         'suspending a listing that waits for its second review left the place live and managed';
end $$;
-- approve again, wait for another review, this time the team rejects
:as_service
select public.review_business_listing('1b0c0000-0000-0000-0000-000000000040', 'approve');
:as_u13
update public.business_listings set website = 'https://tercero.example/' where id = '1b0c0000-0000-0000-0000-000000000040';
:as_service
select public.review_business_listing('1b0c0000-0000-0000-0000-000000000040', 'reject', 'not a hostel');
:as_postgres
do $$
declare sid uuid := (select stay_id from public.business_listings where id = '1b0c0000-0000-0000-0000-000000000040');
begin
  assert (select business_id is null and owner_verified_at is null and deleted_at is not null from public.stays where id = sid),
         'rejecting a live listing left the place managed';
end $$;
-- and the business is closed while a live listing waits for its second review
:as_service
select public.review_business_listing('1b0c0000-0000-0000-0000-000000000040', 'approve');
:as_u13
update public.business_listings set website = 'https://cuarto.example/' where id = '1b0c0000-0000-0000-0000-000000000040';
:as_postgres
update public.businesses set deleted_at = now() where id = '1b0b0000-0000-0000-0000-000000000009';
do $$
declare sid uuid := (select stay_id from public.business_listings where id = '1b0c0000-0000-0000-0000-000000000040');
begin
  assert (select status = 'suspended' and deleted_at is not null from public.business_listings where id = '1b0c0000-0000-0000-0000-000000000040'),
         'closing the business suspends its listings';
  assert (select business_id is null and owner_verified_at is null and deleted_at is not null from public.stays where id = sid),
         'closing a business left a live place behind';
end $$;

-- 4.5 proof of ownership: the team reads, managers upload and delete, strangers can do none of it.
--     (Inside a sub-select over `businesses` a bare `name` is the business name, not the file name: the
--     policies of migration 12 could never match, so nobody could upload, read or delete anything.
--     The upload policy is fixed in the integrity migration, which runs before this one.)
:as_postgres
insert into public.business_members (business_id, user_id, role) values ('1b0b0000-0000-0000-0000-000000000005', '1b000000-0000-0000-0000-000000000007', 'staff');
insert into storage.objects (bucket_id, name, metadata) values
  ('business-docs', '1b0b0000-0000-0000-0000-000000000005/proof-a.pdf', '{"size": 10}'),
  ('business-docs', '1b0b0000-0000-0000-0000-000000000005/proof-b.pdf', '{"size": 10}'),
  ('business-docs', '1b0b0000-0000-0000-0000-000000000005/proof-c.pdf', '{"size": 10}'),
  ('business-docs', '1b0b0000-0000-0000-0000-000000000006/proof-x.pdf', '{"size": 10}');
:as_u12
do $$ begin
  assert (select count(*) from storage.objects where bucket_id = 'business-docs') = 3, 'a manager reads the proof files of their business, and only those';
  insert into storage.objects (bucket_id, name, metadata)
  values ('business-docs', '1b0b0000-0000-0000-0000-000000000005/proof.pdf', '{"size": 10}');      -- a manager uploads
  assert (select count(*) from storage.objects where bucket_id = 'business-docs') = 4, 'and sees the new file';
  begin
    insert into storage.objects (bucket_id, name, metadata)
    values ('business-docs', '1b0b0000-0000-0000-0000-000000000006/proof.pdf', '{"size": 10}');
    raise exception 'a manager uploaded into the folder of another business';
  exception when insufficient_privilege then null;
  end;
end $$;
:as_u7
do $$
declare n integer;
begin
  assert (select count(*) from storage.objects where bucket_id = 'business-docs') = 4, 'a plain member reads the proof files';
  delete from storage.objects where bucket_id = 'business-docs' and name = '1b0b0000-0000-0000-0000-000000000005/proof-a.pdf';
  get diagnostics n = row_count;
  assert n = 0, 'a plain member deleted a proof file';
  begin
    insert into storage.objects (bucket_id, name, metadata)
    values ('business-docs', '1b0b0000-0000-0000-0000-000000000005/staff.pdf', '{"size": 10}');
    raise exception 'a plain member uploaded a proof file';
  exception when insufficient_privilege then null;
  end;
end $$;
:as_u3
do $$
declare n integer;
begin
  assert (select count(*) from storage.objects where bucket_id = 'business-docs') = 0, 'a stranger reads proof files';
  delete from storage.objects where bucket_id = 'business-docs';
  get diagnostics n = row_count;
  assert n = 0, 'a stranger deleted proof files';
  begin
    insert into storage.objects (bucket_id, name, metadata)
    values ('business-docs', '1b0b0000-0000-0000-0000-000000000005/stranger.pdf', '{"size": 10}');
    raise exception 'a stranger uploaded a proof file';
  exception when insufficient_privilege then null;
  end;
end $$;
:as_anon
do $$ begin
  assert (select count(*) from storage.objects where bucket_id = 'business-docs') = 0, 'anon reads proof files';
end $$;
:as_u12
do $$
declare n integer;
begin
  delete from storage.objects where bucket_id = 'business-docs' and name = '1b0b0000-0000-0000-0000-000000000005/proof-a.pdf';
  get diagnostics n = row_count;
  assert n = 1, 'a manager can delete their proof file';
  delete from storage.objects where bucket_id = 'business-docs' and name = '1b0b0000-0000-0000-0000-000000000006/proof-x.pdf';
  get diagnostics n = row_count;
  assert n = 0, 'a manager deleted the proof of another business';
end $$;
-- a suspended team keeps reading, and can neither upload nor delete
:as_postgres
update public.businesses set status = 'suspended' where id = '1b0b0000-0000-0000-0000-000000000005';
:as_u12
do $$
declare n integer;
begin
  assert (select count(*) from storage.objects where bucket_id = 'business-docs') = 3, 'a suspended team can still read its proof files';
  delete from storage.objects where bucket_id = 'business-docs' and name = '1b0b0000-0000-0000-0000-000000000005/proof-b.pdf';
  get diagnostics n = row_count;
  assert n = 0, 'a suspended team deleted a proof file';
  begin
    insert into storage.objects (bucket_id, name, metadata)
    values ('business-docs', '1b0b0000-0000-0000-0000-000000000005/late.pdf', '{"size": 10}');
    raise exception 'a suspended team uploaded a proof file';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- ============================================================================
-- 5. Grants, Pilgrim Plus, offline pack URLs
-- ============================================================================
begin;
:as_postgres
insert into auth.users (id, email) values
  ('1b000000-0000-0000-0000-000000000003', 'ph.grants@example.test'),
  ('1b000000-0000-0000-0000-00000000000e', 'ph.plus.subject@example.test');

-- 5.1 TRUNCATE / REFERENCES / TRIGGER
do $$
declare bad text;
begin
  select string_agg(c.relname || ':' || r.rolname || ':' || p.priv, ', ') into bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  cross join (values ('anon'), ('authenticated')) r(rolname)
  cross join (select 'truncate' union all select 'references' union all select 'trigger'
              union all select 'maintain' where current_setting('server_version_num')::integer >= 170000) p(priv)
  where n.nspname = 'public' and c.relkind in ('r', 'p') and has_table_privilege(r.rolname, c.oid, p.priv);
  assert bad is null, 'TRUNCATE / REFERENCES / TRIGGER (MAINTAIN) still granted to API roles: ' || coalesce(left(bad, 300), '');
  assert has_table_privilege('service_role', 'public.posts', 'truncate'), 'service_role keeps its privileges';
  assert has_table_privilege('authenticated', 'public.posts', 'select') and has_table_privilege('authenticated', 'public.posts', 'insert'),
         'authenticated keeps the normal table privileges (RLS decides the rest)';
end $$;
:as_u3
do $$ begin
  begin
    truncate public.app_config;       -- TRUNCATE ignores RLS
    raise exception 'authenticated truncated app_config';
  exception when insufficient_privilege then null;
  end;
  begin
    truncate public.posts, public.profiles cascade;
    raise exception 'authenticated truncated posts';
  exception when insufficient_privilege then null;
  end;
end $$;
:as_anon
do $$ begin
  begin
    truncate public.app_config;
    raise exception 'anon truncated app_config';
  exception when insufficient_privilege then null;
  end;
end $$;
-- a table created later gets the same
:as_postgres
create table public.zz_probe_tbl (id int);
do $$ begin
  assert not has_table_privilege('authenticated', 'public.zz_probe_tbl', 'truncate')
     and not has_table_privilege('anon', 'public.zz_probe_tbl', 'references')
     and not has_table_privilege('authenticated', 'public.zz_probe_tbl', 'trigger'), 'a new table is open to TRUNCATE / REFERENCES / TRIGGER';
  if current_setting('server_version_num')::integer >= 170000 then
    assert not has_table_privilege('authenticated', 'public.zz_probe_tbl', 'maintain')
       and not has_table_privilege('anon', 'public.zz_probe_tbl', 'maintain'), 'a new table is open to MAINTAIN';
  end if;
  assert has_table_privilege('authenticated', 'public.zz_probe_tbl', 'select'), 'a new table is still readable through RLS';
end $$;

-- 5.2 who counts as Pilgrim Plus
do $$
declare u uuid := '1b000000-0000-0000-0000-00000000000e';
begin
  assert coalesce((select value from public.app_config where key = 'allow_sandbox_purchases'), 'null'::jsonb) = 'false'::jsonb,
         'sandbox purchases are off by default';

  update public.subscriptions set status = 'active', environment = 'production', expires_at = now() + interval '1 year', grace_expires_at = null where user_id = u;
  assert private.has_plus(u), 'active production subscription';

  update public.subscriptions set environment = 'sandbox' where user_id = u;
  assert not private.has_plus(u), 'a sandbox purchase unlocked Plus in production';
  update public.app_config set value = 'true' where key = 'allow_sandbox_purchases';
  assert private.has_plus(u), 'sandbox purchases count while the flag is on (testing, App Review)';
  update public.app_config set value = 'false' where key = 'allow_sandbox_purchases';
  assert not private.has_plus(u), 'sandbox off again';
  update public.app_config set value = '"banana"' where key = 'allow_sandbox_purchases';
  assert not private.has_plus(u), 'a garbage flag value means off, and does not raise';
  update public.app_config set value = 'false' where key = 'allow_sandbox_purchases';

  -- a grace date left over from an old billing problem must not lock out someone who renewed
  update public.subscriptions set environment = 'production', status = 'active', expires_at = now() + interval '200 days',
         grace_expires_at = now() - interval '30 days' where user_id = u;
  assert private.has_plus(u), 'stale grace_expires_at locked out an active subscriber';

  update public.subscriptions set status = 'grace', expires_at = now() - interval '1 day', grace_expires_at = now() + interval '3 days' where user_id = u;
  assert private.has_plus(u), 'inside the grace period';
  update public.subscriptions set status = 'billing_issue', expires_at = now() - interval '10 days', grace_expires_at = now() - interval '1 day' where user_id = u;
  assert not private.has_plus(u), 'grace period over';
  update public.subscriptions set status = 'grace', expires_at = now() + interval '10 days', grace_expires_at = null where user_id = u;
  assert private.has_plus(u), 'grace without a grace date falls back to the paid period';

  update public.subscriptions set status = 'cancelled', expires_at = now() + interval '10 days', grace_expires_at = null where user_id = u;
  assert private.has_plus(u), 'cancelled but paid until the end of the period';
  update public.subscriptions set status = 'cancelled', expires_at = now() - interval '1 day' where user_id = u;
  assert not private.has_plus(u), 'cancelled and expired';
  update public.subscriptions set status = 'expired', expires_at = now() + interval '10 days' where user_id = u;
  assert not private.has_plus(u), 'expired status';
  update public.subscriptions set status = 'paused', expires_at = now() + interval '10 days' where user_id = u;
  assert not private.has_plus(u), 'paused';
  update public.subscriptions set status = 'active', store = 'promotional', expires_at = null where user_id = u;
  assert private.has_plus(u), 'promotional access without an end date';
  update public.subscriptions set status = 'none' where user_id = u;
  assert not private.has_plus(u), 'no subscription';
end $$;
-- RLS and the entitlement RPC follow has_plus
update public.subscriptions set status = 'active', store = 'app_store', environment = 'sandbox', expires_at = now() + interval '1 year'
where user_id = '1b000000-0000-0000-0000-00000000000e';
:as_u14
do $$ begin
  assert (public.get_my_entitlements() ->> 'plan') = 'free', 'sandbox purchase: free plan in production';
  assert (public.get_my_entitlements() ->> 'can_download_routes')::boolean = false, 'sandbox purchase cannot download routes';
end $$;

-- 5.3 offline pack urls
:as_postgres
insert into public.route_networks (id, slug, name, is_published) values ('1b010000-0000-0000-0000-000000000001', '1b-net-5', '1b Net 5', true);
insert into public.routes (id, network_id, slug, name, is_published)
values ('1b020000-0000-0000-0000-000000000009', '1b010000-0000-0000-0000-000000000001', '1b-route-5', '1b Route 5', true);
do $$ begin
  begin
    insert into public.offline_packs (route_id, kind, format, version, url, size_bytes)
    values ('1b020000-0000-0000-0000-000000000009', 'tiles', 'pmtiles', 1, 'https://evil.example/pack.pmtiles', 100);
    raise exception 'an https:// pack url was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.offline_packs (route_id, kind, format, version, url, size_bytes)
    values ('1b020000-0000-0000-0000-000000000009', 'tiles', 'pmtiles', 2, 'file:///etc/passwd', 100);
    raise exception 'a file:// pack url was accepted';
  exception when check_violation then null;
  end;
  insert into public.offline_packs (route_id, kind, format, version, url, size_bytes, is_current)
  values ('1b020000-0000-0000-0000-000000000009', 'tiles', 'pmtiles', 3, 'r2://caminoplus-packs/k/tiles.pmtiles', 100, false),
         ('1b020000-0000-0000-0000-000000000009', 'data', 'sqlite', 3, 'supabase://offline-packs/k/data.sqlite', 100, false);
end $$;
rollback;

-- ============================================================================
-- 6. Operations: housekeeping, indexes, sync cursors, schedule
-- ============================================================================
begin;
:as_postgres
insert into auth.users (id, email) values
  ('1b000000-0000-0000-0000-00000000000a', 'ph.ops.recent@example.test'),
  ('1b000000-0000-0000-0000-00000000000b', 'ph.ops.drift@example.test'),
  ('1b000000-0000-0000-0000-00000000000c', 'ph.ops.claimant@example.test');

-- 6.1 every foreign key has an index (a migration that adds a table with foreign keys indexes them itself)
do $$
declare bad text;
begin
  select string_agg(t.relname || '(' || (select string_agg(a.attname, ',') from pg_attribute a
                                          where a.attrelid = c.conrelid and a.attnum = any (c.conkey)) || ')', ', ') into bad
  from pg_constraint c join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace
  where c.contype = 'f' and n.nspname in ('public', 'private')
    and not exists (
      select 1 from pg_index i
      where i.indrelid = c.conrelid and i.indisvalid
        and (i.indpred is null or pg_get_expr(i.indpred, i.indrelid) ~ '^\(?[a-z_]+ IS NOT NULL\)?$')
        and (select array_agg(x order by x) from unnest((i.indkey::int2[])[0:array_length(c.conkey, 1) - 1]) x)
          = (select array_agg(x order by x) from unnest(c.conkey) x));
  assert bad is null, 'foreign keys without an index: ' || coalesce(bad, '');
  -- the hot ones named in the audit
  assert exists (select 1 from pg_indexes where tablename = 'post_saves' and indexdef ~ '\(user_id\)'), 'post_saves.user_id';
  assert exists (select 1 from pg_indexes where tablename = 'post_comments' and indexdef ~ '\(parent_id\)'), 'post_comments.parent_id';
  assert exists (select 1 from pg_indexes where tablename = 'crowd_report_votes' and indexdef ~ '\(user_id\)'), 'crowd_report_votes.user_id';
  assert exists (select 1 from pg_indexes where tablename = 'posts' and indexdef ~ '\(stay_id\)'), 'posts.stay_id';
  assert exists (select 1 from pg_indexes where tablename = 'user_stamps' and indexdef ~ '\(poi_id\)'), 'user_stamps.poi_id';
end $$;

-- 6.2 catalog link tables are sync-able: touch trigger + tombstone
insert into public.route_networks (id, slug, name, is_published) values ('1b010000-0000-0000-0000-000000000002', '1b-net-6', '1b Net 6', true);
insert into public.routes (id, network_id, slug, name, is_published)
values ('1b020000-0000-0000-0000-000000000010', '1b010000-0000-0000-0000-000000000002', '1b-route-6', '1b Route 6', true);
insert into public.places (id, name, kind, location) values ('1b030000-0000-0000-0000-000000000010', 'Syncville', 'town', 'SRID=4326;POINT(-3 42)');
insert into public.stages (id, route_id, stage_number, name, distance_km, is_published)
values ('1b040000-0000-0000-0000-000000000010', '1b020000-0000-0000-0000-000000000010', 1, 'Sync stage', 10, true);
insert into public.pois (id, source, category, name, location) values ('1b050000-0000-0000-0000-000000000010', 'editorial', 'church', 'Sync church', 'SRID=4326;POINT(-3 42)');
insert into public.stays (id, source, category, name, location) values ('1b0d0000-0000-0000-0000-000000000020', 'osm', 'cafe', 'Sync cafe', 'SRID=4326;POINT(-3 42)');
insert into public.route_places (route_id, place_id, seq, km_from_start, km_to_end, updated_at)
values ('1b020000-0000-0000-0000-000000000010', '1b030000-0000-0000-0000-000000000010', 1, 0, 10, '2020-01-01');
insert into public.stage_pois (stage_id, poi_id, updated_at) values ('1b040000-0000-0000-0000-000000000010', '1b050000-0000-0000-0000-000000000010', '2020-01-01');
insert into public.stage_stays (stage_id, stay_id, updated_at) values ('1b040000-0000-0000-0000-000000000010', '1b0d0000-0000-0000-0000-000000000020', '2020-01-01');
insert into public.stay_labels (slug, name, updated_at) values ('1b_sync_label', 'Sync label', '2020-01-01');
update public.route_places set km_to_end = 11 where route_id = '1b020000-0000-0000-0000-000000000010';
update public.stage_pois set detour_m = 5 where stage_id = '1b040000-0000-0000-0000-000000000010';
update public.stage_stays set detour_m = 5 where stage_id = '1b040000-0000-0000-0000-000000000010';
update public.stay_labels set name = 'Sync label 2' where slug = '1b_sync_label';
do $$ begin
  assert (select updated_at > '2021-01-01' from public.route_places where route_id = '1b020000-0000-0000-0000-000000000010'), 'route_places touch trigger';
  assert (select updated_at > '2021-01-01' from public.stage_pois where stage_id = '1b040000-0000-0000-0000-000000000010'), 'stage_pois touch trigger';
  assert (select updated_at > '2021-01-01' from public.stage_stays where stage_id = '1b040000-0000-0000-0000-000000000010'), 'stage_stays touch trigger';
  assert (select updated_at > '2021-01-01' from public.stay_labels where slug = '1b_sync_label'), 'stay_labels touch trigger';
  -- removing a link is a tombstone offline copies can see
  update public.stage_stays set deleted_at = now() where stage_id = '1b040000-0000-0000-0000-000000000010';
  update public.route_places set deleted_at = now() where route_id = '1b020000-0000-0000-0000-000000000010';
  update public.stage_pois set deleted_at = now() where stage_id = '1b040000-0000-0000-0000-000000000010';
  update public.stay_labels set deleted_at = now() where slug = '1b_sync_label';
end $$;

-- 6.3 housekeeping
do $$ begin
  assert (select proname from pg_proc where oid = 'private.housekeeping()'::regprocedure) = 'housekeeping', 'private.housekeeping exists';
end $$;
-- the de-duplication log keeps today and yesterday only
insert into public.businesses (id, name, created_by) values ('1b0b0000-0000-0000-0000-000000000007', 'Casa Ops', '1b000000-0000-0000-0000-00000000000c');
insert into public.stays (id, source, category, name, location, business_id)
values ('1b0d0000-0000-0000-0000-000000000030', 'owner', 'cafe', 'Ops stay', 'SRID=4326;POINT(-3 42)', '1b0b0000-0000-0000-0000-000000000007');
insert into private.stay_event_log (user_id, stay_id, event, day) values
  ('1b000000-0000-0000-0000-00000000000c', '1b0d0000-0000-0000-0000-000000000030', 'view', (now() at time zone 'utc')::date - 3),
  ('1b000000-0000-0000-0000-00000000000c', '1b0d0000-0000-0000-0000-000000000030', 'save', (now() at time zone 'utc')::date - 1),
  ('1b000000-0000-0000-0000-00000000000c', '1b0d0000-0000-0000-0000-000000000030', 'booking', (now() at time zone 'utc')::date);
-- claims nobody followed up on are released; fresh ones and the team's turn (submitted) are not
insert into public.stays (id, source, category, name, location) values
  ('1b0d0000-0000-0000-0000-000000000031', 'osm', 'cafe', 'Old claim', 'SRID=4326;POINT(-3.1 42)'),
  ('1b0d0000-0000-0000-0000-000000000032', 'osm', 'cafe', 'Fresh claim', 'SRID=4326;POINT(-3.2 42)'),
  ('1b0d0000-0000-0000-0000-000000000033', 'osm', 'cafe', 'In review claim', 'SRID=4326;POINT(-3.3 42)');
insert into public.business_listings (id, business_id, claim_stay_id, category, name, status, created_by, updated_at) values
  ('1b0c0000-0000-0000-0000-000000000041', '1b0b0000-0000-0000-0000-000000000007', '1b0d0000-0000-0000-0000-000000000031', 'cafe', 'Old', 'draft', '1b000000-0000-0000-0000-00000000000c', now() - interval '61 days'),
  ('1b0c0000-0000-0000-0000-000000000042', '1b0b0000-0000-0000-0000-000000000007', '1b0d0000-0000-0000-0000-000000000032', 'cafe', 'Fresh', 'draft', '1b000000-0000-0000-0000-00000000000c', now() - interval '5 days'),
  ('1b0c0000-0000-0000-0000-000000000043', '1b0b0000-0000-0000-0000-000000000007', '1b0d0000-0000-0000-0000-000000000033', 'cafe', 'Review', 'submitted', '1b000000-0000-0000-0000-00000000000c', now() - interval '90 days');
-- storage usage: recount people who uploaded recently, and a slice of the ones not counted for a day.
-- (storage.objects has created_at / updated_at on Supabase; the local stub has not, so add them here.)
do $$ begin
  if (select count(*) from pg_attribute where attrelid = 'storage.objects'::regclass and attname in ('created_at', 'updated_at') and not attisdropped) < 2 then
    alter table storage.objects add column if not exists created_at timestamptz not null default now();
    alter table storage.objects add column if not exists updated_at timestamptz not null default now();
  end if;
end $$;
insert into storage.objects (bucket_id, name, metadata, created_at, updated_at) values
  ('user-media', '1b000000-0000-0000-0000-00000000000a/posts/a.jpg', '{"size": 100}', now(), now()),
  ('user-media', '1b000000-0000-0000-0000-00000000000a/posts/b.jpg', '{"size": 250}', now(), now()),
  ('user-media', '1b000000-0000-0000-0000-00000000000b/posts/c.jpg', '{"size": 40}', now() - interval '3 days', now() - interval '3 days'),
  ('user-media', '1b000000-0000-0000-0000-00000000000c/posts/d.jpg', '{"size": 70}', now() - interval '3 days', now() - interval '3 days'),
  ('avatars',    '1b000000-0000-0000-0000-00000000000a/me.png', '{"size": 999999}', now(), now());
update public.storage_usage set used_bytes = 0, object_count = 0, last_calculated_at = now()
where user_id = '1b000000-0000-0000-0000-00000000000a';                                              -- fresh count, wrong, recent uploads
update public.storage_usage set used_bytes = 5, object_count = 9, last_calculated_at = now() - interval '2 days'
where user_id = '1b000000-0000-0000-0000-00000000000b';                                              -- old count, wrong, no recent uploads
update public.storage_usage set used_bytes = 7, object_count = 7, last_calculated_at = now()
where user_id = '1b000000-0000-0000-0000-00000000000c';                                              -- fresh count, wrong, no recent uploads
select private.housekeeping();
do $$ begin
  assert not exists (select 1 from private.stay_event_log where stay_id = '1b0d0000-0000-0000-0000-000000000030' and event = 'view'),
         'old de-duplication rows are pruned';
  assert (select count(*) from private.stay_event_log where stay_id = '1b0d0000-0000-0000-0000-000000000030' and event in ('save', 'booking')) = 2,
         'yesterday and today are kept';
  assert (select deleted_at is not null from public.business_listings where id = '1b0c0000-0000-0000-0000-000000000041'), 'a stale draft claim is released';
  assert (select deleted_at is null from public.business_listings where id = '1b0c0000-0000-0000-0000-000000000042'), 'a fresh claim is kept';
  assert (select deleted_at is null from public.business_listings where id = '1b0c0000-0000-0000-0000-000000000043'), 'a claim in review is kept';
  assert (select used_bytes = 350 and object_count = 2 from public.storage_usage where user_id = '1b000000-0000-0000-0000-00000000000a'),
         'storage usage is recounted for people who uploaded recently (user-media only)';
  assert (select used_bytes = 40 and object_count = 1 from public.storage_usage where user_id = '1b000000-0000-0000-0000-00000000000b'),
         'storage usage is recounted when the last count is a day old';
  assert (select used_bytes = 7 from public.storage_usage where user_id = '1b000000-0000-0000-0000-00000000000c'),
         'nobody else is recounted';
end $$;
select private.housekeeping();     -- twice in a row is harmless
-- the release frees the place for the real owner
update public.stays set business_id = null where id = '1b0d0000-0000-0000-0000-000000000030';
do $$ begin
  assert not exists (select 1 from public.business_listings where claim_stay_id = '1b0d0000-0000-0000-0000-000000000031' and deleted_at is null),
         'the released place can be claimed again';
end $$;

-- 6.4 scheduled where pg_cron exists (Supabase); a plain Postgres has nothing to check
do $$ begin
  if to_regclass('cron.job') is not null then
    assert exists (select 1 from cron.job where jobname = 'caminoplus-housekeeping' and schedule = '*/15 * * * *'
                   and command ilike '%private.housekeeping()%'), 'housekeeping is scheduled every 15 minutes';
  else
    raise notice 'pg_cron not installed: schedule check skipped';
  end if;
end $$;
rollback;

-- ============================================================================
-- 7. RPCs: start_journey and register_offline_pack
-- ============================================================================
begin;
:as_postgres
insert into auth.users (id, email) values
  ('1b000000-0000-0000-0000-000000000008', 'ph.walker.a@example.test'),
  ('1b000000-0000-0000-0000-000000000009', 'ph.walker.b@example.test'),
  ('1b000000-0000-0000-0000-00000000000a', 'ph.pack.reader@example.test');
-- catalog fixture: a route with four main stages (+ a variant and an unpublished stage that must be skipped),
-- a route without stages, and a stage that belongs to another route
insert into public.route_networks (id, slug, name, is_published) values ('1b010000-0000-0000-0000-000000000003', '1b-net-7', '1b Net 7', true);
insert into public.routes (id, network_id, slug, name, is_published) values
  ('1b020000-0000-0000-0000-000000000001', '1b010000-0000-0000-0000-000000000003', '1b-route-main',  '1b Test Camino', true),
  ('1b020000-0000-0000-0000-000000000002', '1b010000-0000-0000-0000-000000000003', '1b-route-empty', '1b Empty Camino', true),
  ('1b020000-0000-0000-0000-000000000003', '1b010000-0000-0000-0000-000000000003', '1b-route-other', '1b Other Camino', true),
  ('1b020000-0000-0000-0000-000000000004', '1b010000-0000-0000-0000-000000000003', '1b-route-draft', '1b Draft Camino', false);
insert into public.places (id, name, kind, location) values
  ('1b030000-0000-0000-0000-000000000001', 'Alpha',   'town', 'SRID=4326;POINT(-1 43)'),
  ('1b030000-0000-0000-0000-000000000002', 'Bravo',   'town', 'SRID=4326;POINT(-2 43)'),
  ('1b030000-0000-0000-0000-000000000003', 'Charlie', 'town', 'SRID=4326;POINT(-3 43)'),
  ('1b030000-0000-0000-0000-000000000004', 'Delta',   'town', 'SRID=4326;POINT(-4 43)'),
  ('1b030000-0000-0000-0000-000000000005', 'Echo',    'town', 'SRID=4326;POINT(-5 43)');
insert into public.stages (id, route_id, stage_number, variant_of, name, start_place_id, end_place_id, distance_km, is_published) values
  ('1b040000-0000-0000-0000-000000000001', '1b020000-0000-0000-0000-000000000001', 1, null, 'Alpha to Bravo',   '1b030000-0000-0000-0000-000000000001', '1b030000-0000-0000-0000-000000000002', 20.50, true),
  ('1b040000-0000-0000-0000-000000000002', '1b020000-0000-0000-0000-000000000001', 2, null, 'Bravo to Charlie', '1b030000-0000-0000-0000-000000000002', '1b030000-0000-0000-0000-000000000003', 18.25, true),
  ('1b040000-0000-0000-0000-000000000003', '1b020000-0000-0000-0000-000000000001', 3, null, 'Charlie to Delta', '1b030000-0000-0000-0000-000000000003', '1b030000-0000-0000-0000-000000000004', 22.00, true),
  ('1b040000-0000-0000-0000-000000000004', '1b020000-0000-0000-0000-000000000001', 4, null, 'Delta to Echo',    '1b030000-0000-0000-0000-000000000004', '1b030000-0000-0000-0000-000000000005', 15.00, true),
  ('1b040000-0000-0000-0000-000000000005', '1b020000-0000-0000-0000-000000000001', 5, null, 'Not published yet', '1b030000-0000-0000-0000-000000000005', null, 9.00, false),
  ('1b040000-0000-0000-0000-000000000006', '1b020000-0000-0000-0000-000000000001', 2, '1b040000-0000-0000-0000-000000000002', 'Variant via the hills', '1b030000-0000-0000-0000-000000000002', '1b030000-0000-0000-0000-000000000003', 99.00, true),
  ('1b040000-0000-0000-0000-000000000007', '1b020000-0000-0000-0000-000000000003', 1, null, 'Other route stage', '1b030000-0000-0000-0000-000000000001', '1b030000-0000-0000-0000-000000000002', 5.00, true);

-- 7.1 start_journey
:as_anon
do $$ begin
  begin
    perform public.start_journey(gen_random_uuid(), '1b020000-0000-0000-0000-000000000001');
    raise exception 'anon started a journey';
  exception when insufficient_privilege then null;
  end;
end $$;

:as_u8
do $$
declare jid uuid;
begin
  jid := public.start_journey('1b0e0000-0000-0000-0000-000000000001', '1b020000-0000-0000-0000-000000000001', null, '2027-03-01');
  assert jid = '1b0e0000-0000-0000-0000-000000000001', 'returns the journey id';
  assert (select title = '1b Test Camino' and status = 'planning' and user_id = auth.uid()
                 and route_id = '1b020000-0000-0000-0000-000000000001'
                 and planned_start_date = '2027-03-01' and planned_end_date = '2027-03-04'
                 and planned_distance_km = 75.75
                 and start_place_id = '1b030000-0000-0000-0000-000000000001' and end_place_id = '1b030000-0000-0000-0000-000000000005'
          from public.journeys where id = jid), 'journey row';
  assert (select count(*) from public.journey_days where journey_id = jid) = 4, 'four days: variants and unpublished stages are skipped';
  assert (select array_agg(day_number order by day_number) = array[1, 2, 3, 4] from public.journey_days where journey_id = jid), 'day numbers 1..n';
  assert (select array_agg(planned_date order by day_number) = array['2027-03-01', '2027-03-02', '2027-03-03', '2027-03-04']::date[]
          from public.journey_days where journey_id = jid), 'planned dates start_date + day - 1';
  assert (select array_agg(from_name || '>' || to_name order by day_number) = array['Alpha>Bravo', 'Bravo>Charlie', 'Charlie>Delta', 'Delta>Echo']
          from public.journey_days where journey_id = jid), 'from / to names come from the stage places';
  assert (select array_agg(planned_distance_km order by day_number) = array[20.50, 18.25, 22.00, 15.00]::numeric[]
          from public.journey_days where journey_id = jid), 'planned distances';
  assert (select bool_and(user_id = auth.uid() and status = 'planned' and stage_id is not null) from public.journey_days where journey_id = jid), 'days belong to me';

  -- the same request again (outbox replay, double tap): one journey, one set of days
  assert public.start_journey('1b0e0000-0000-0000-0000-000000000001', '1b020000-0000-0000-0000-000000000001', null, '2027-03-01') = jid, 'replay returns the same id';
  assert public.start_journey('1b0e0000-0000-0000-0000-000000000001', '1b020000-0000-0000-0000-000000000001', '1b040000-0000-0000-0000-000000000003', null) = jid,
         'a replay with other arguments still changes nothing';
  assert (select count(*) from public.journeys where id = jid) = 1 and (select count(*) from public.journey_days where journey_id = jid) = 4, 'replay created nothing';

  -- start at a later stage, no date
  jid := public.start_journey('1b0e0000-0000-0000-0000-000000000002', '1b020000-0000-0000-0000-000000000001', '1b040000-0000-0000-0000-000000000003');
  assert (select start_stage_id = '1b040000-0000-0000-0000-000000000003' and planned_start_date is null and planned_end_date is null
                 and planned_distance_km = 37.00 and start_place_id = '1b030000-0000-0000-0000-000000000003'
          from public.journeys where id = jid), 'journey from stage 3';
  assert (select array_agg(day_number order by day_number) = array[1, 2] and bool_and(planned_date is null) from public.journey_days where journey_id = jid),
         'days restart at 1 from the chosen stage, without dates';
  assert (select array_agg(from_name order by day_number) = array['Charlie', 'Delta'] from public.journey_days where journey_id = jid), 'names from the chosen stage';

  -- a route without stages: the journey only
  jid := public.start_journey('1b0e0000-0000-0000-0000-000000000003', '1b020000-0000-0000-0000-000000000002', null, '2027-04-01');
  assert (select count(*) from public.journeys where id = jid) = 1 and (select count(*) from public.journey_days where journey_id = jid) = 0, 'no stages, no days';
  assert (select planned_start_date = '2027-04-01' and planned_end_date is null and planned_distance_km is null from public.journeys where id = jid), 'no stages: dates and km stay open';

  -- bad input
  begin perform public.start_journey(gen_random_uuid(), gen_random_uuid()); raise exception 'unknown route accepted';
  exception when sqlstate '22023' then null; end;
  begin perform public.start_journey(gen_random_uuid(), '1b020000-0000-0000-0000-000000000004'); raise exception 'unpublished route accepted';
  exception when sqlstate '22023' then null; end;
  begin perform public.start_journey(gen_random_uuid(), '1b020000-0000-0000-0000-000000000001', '1b040000-0000-0000-0000-000000000007'); raise exception 'stage of another route accepted';
  exception when sqlstate '22023' then null; end;
  begin perform public.start_journey(gen_random_uuid(), '1b020000-0000-0000-0000-000000000001', '1b040000-0000-0000-0000-000000000006'); raise exception 'variant stage accepted as a start';
  exception when sqlstate '22023' then null; end;
  begin perform public.start_journey(gen_random_uuid(), '1b020000-0000-0000-0000-000000000001', '1b040000-0000-0000-0000-000000000005'); raise exception 'unpublished stage accepted as a start';
  exception when sqlstate '22023' then null; end;
  begin perform public.start_journey(null, '1b020000-0000-0000-0000-000000000001'); raise exception 'null id accepted';
  exception when sqlstate '22023' then null; end;
end $$;

-- somebody else's journey id cannot be taken over, and nothing leaks into their journey
:as_u9
do $$ begin
  begin
    perform public.start_journey('1b0e0000-0000-0000-0000-000000000001', '1b020000-0000-0000-0000-000000000001');
    raise exception 'a journey id of another pilgrim was accepted';
  exception when unique_violation then null;
  end;
  assert (select count(*) from public.journeys where user_id = auth.uid()) = 0, 'no journey for the second pilgrim';
end $$;
:as_postgres
do $$ begin
  assert (select count(*) from public.journey_days where journey_id = '1b0e0000-0000-0000-0000-000000000001') = 4, 'the first pilgrim''s days are untouched';
end $$;

-- a deleted journey is not resurrected by an old outbox replay
:as_u8
update public.journeys set deleted_at = now() where id = '1b0e0000-0000-0000-0000-000000000002';
do $$ begin
  assert public.start_journey('1b0e0000-0000-0000-0000-000000000002', '1b020000-0000-0000-0000-000000000001', '1b040000-0000-0000-0000-000000000003') = '1b0e0000-0000-0000-0000-000000000002', 'replay after delete';
  assert (select deleted_at is not null from public.journeys where id = '1b0e0000-0000-0000-0000-000000000002'), 'still deleted';
  assert (select count(*) from public.journey_days where journey_id = '1b0e0000-0000-0000-0000-000000000002') = 2, 'no new days';
end $$;

-- one transaction: a failure on the third day leaves no journey and no days behind
:as_postgres
create function public.zz_fail_day() returns trigger language plpgsql as $f$
begin
  if new.day_number = 3 then raise exception 'zz: simulated failure on day 3'; end if;
  return new;
end $f$;
create trigger zz_fail_day before insert on public.journey_days for each row execute function public.zz_fail_day();
:as_u8
do $$ begin
  begin
    perform public.start_journey('1b0e0000-0000-0000-0000-000000000004', '1b020000-0000-0000-0000-000000000001');
    raise exception 'the simulated failure did not happen';
  exception when raise_exception then
    assert sqlerrm like 'zz:%', 'unexpected error: ' || sqlerrm;
  end;
  assert not exists (select 1 from public.journeys where id = '1b0e0000-0000-0000-0000-000000000004'), 'journey left behind after a failed start';
  assert not exists (select 1 from public.journey_days where journey_id = '1b0e0000-0000-0000-0000-000000000004'), 'days left behind after a failed start';
end $$;
:as_postgres
drop trigger zz_fail_day on public.journey_days;

-- 7.2 register_offline_pack
:as_anon
do $$ begin
  begin
    perform public.register_offline_pack('1b020000-0000-0000-0000-000000000001', null, 'bundle', 'zip', 1, 'supabase://offline-packs/x/y.zip', 1000, null);
    raise exception 'anon registered a pack';
  exception when insufficient_privilege then null;
  end;
end $$;
:as_u8
do $$ begin
  begin
    perform public.register_offline_pack('1b020000-0000-0000-0000-000000000001', null, 'bundle', 'zip', 1, 'supabase://offline-packs/x/y.zip', 1000, null);
    raise exception 'a signed-in user registered a pack';
  exception when insufficient_privilege then null;
  end;
end $$;

:as_service
do $$
declare
  p1 uuid; p2 uuid; p2b uuid; p3 uuid;
  r  uuid := '1b020000-0000-0000-0000-000000000001';
  s1 uuid := '1b040000-0000-0000-0000-000000000001';
  s2 uuid := '1b040000-0000-0000-0000-000000000002';
  sha text := repeat('ab', 32);
begin
  p1 := public.register_offline_pack(r, s1, 'tiles', 'pmtiles', 1, 'supabase://offline-packs/1b/s1-v1.pmtiles', 1000, sha);
  assert (select is_current and version = 1 and stage_id = s1 and size_bytes = 1000 from public.offline_packs where id = p1), 'v1 is current';

  p2 := public.register_offline_pack(r, s1, 'tiles', 'pmtiles', 2, 'supabase://offline-packs/1b/s1-v2.pmtiles', 2000, sha);
  assert p2 <> p1, 'a new version is a new row';
  assert (select not is_current from public.offline_packs where id = p1) and (select is_current from public.offline_packs where id = p2), 'v2 replaced v1 as the current pack';
  assert (select count(*) from public.offline_packs where route_id = r and stage_id = s1 and kind = 'tiles' and is_current) = 1, 'exactly one current pack';

  -- the same version again updates it in place
  p2b := public.register_offline_pack(r, s1, 'tiles', 'pmtiles', 2, 'r2://caminoplus-packs/1b/s1-v2.pmtiles', 2500, sha);
  assert p2b = p2, 'idempotent on (route, stage, kind, version)';
  assert (select size_bytes = 2500 and url like 'r2://%' and is_current from public.offline_packs where id = p2), 'updated in place';
  assert (select count(*) from public.offline_packs where route_id = r and stage_id = s1 and kind = 'tiles') = 2, 'no extra row';

  -- other keys do not interfere: another kind, another stage, the whole route
  p3 := public.register_offline_pack(r, s1, 'data', 'sqlite', 1, 'supabase://offline-packs/1b/s1-data.sqlite', 500, null);
  perform public.register_offline_pack(r, s2, 'tiles', 'pmtiles', 1, 'supabase://offline-packs/1b/s2-v1.pmtiles', 700, sha);
  perform public.register_offline_pack(r, null, 'bundle', 'zip', 1, 'supabase://offline-packs/1b/route.zip', 9000, sha);
  assert (select count(*) from public.offline_packs where route_id = r and is_current) = 4, 'four keys, four current packs';
  assert (select is_current from public.offline_packs where id = p2), 'registering other keys left v2 current';

  -- rolling back to an older version is a registration too
  perform public.register_offline_pack(r, s1, 'tiles', 'pmtiles', 1, 'supabase://offline-packs/1b/s1-v1.pmtiles', 1000, sha);
  assert (select is_current from public.offline_packs where id = p1) and (select not is_current from public.offline_packs where id = p2), 'rollback to v1';
  perform public.register_offline_pack(r, s1, 'tiles', 'pmtiles', 2, 'supabase://offline-packs/1b/s1-v2.pmtiles', 2000, sha);

  -- atomic: a registration that fails after the old pack was retired puts it back
  begin
    perform public.register_offline_pack(r, s1, 'tiles', 'exe', 3, 'supabase://offline-packs/1b/s1-v3.exe', 100, sha);   -- format check fails
    raise exception 'an invalid format was accepted';
  exception when check_violation then null; end;
  assert (select is_current from public.offline_packs where id = p2), 'the old pack is still current after a failed registration (format)';
  assert not exists (select 1 from public.offline_packs where route_id = r and stage_id = s1 and kind = 'tiles' and version = 3), 'no half-registered row';

  begin
    perform public.register_offline_pack(r, s1, 'bogus', 'pmtiles', 3, 'supabase://offline-packs/1b/s1-v3.pmtiles', 100, sha);   -- kind check fails
    raise exception 'an invalid kind was accepted';
  exception when check_violation then null; end;
  assert (select is_current from public.offline_packs where id = p2), 'the old pack is still current after a failed registration (kind)';

  begin
    perform public.register_offline_pack(r, s1, 'tiles', 'pmtiles', 3, 'ftp://evil.example/x.pmtiles', 100, sha);
    raise exception 'a bad url was accepted';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.register_offline_pack(r, s1, 'tiles', 'pmtiles', 3, 'supabase://offline-packs/1b/s1-v3.pmtiles', 100, 'not-a-hash');
    raise exception 'a bad sha256 was accepted';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.register_offline_pack(r, s1, 'tiles', 'pmtiles', 0, 'supabase://offline-packs/1b/s1-v0.pmtiles', 100, sha);
    raise exception 'version 0 was accepted';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.register_offline_pack(r, '1b040000-0000-0000-0000-000000000007', 'tiles', 'pmtiles', 3, 'supabase://offline-packs/1b/other.pmtiles', 100, sha);
    raise exception 'a stage of another route was accepted';
  exception when sqlstate '22023' then null; end;
  assert (select is_current from public.offline_packs where id = p2), 'the old pack is still current after every failed registration';
  assert (select count(*) from public.offline_packs where route_id = r and stage_id = s1 and kind = 'tiles' and is_current) = 1, 'still exactly one current pack';
end $$;

-- the database itself refuses a second current pack for one (route, stage, kind), also for the whole-route key
:as_postgres
do $$ begin
  begin
    insert into public.offline_packs (route_id, stage_id, kind, format, version, url, size_bytes, is_current)
    values ('1b020000-0000-0000-0000-000000000001', '1b040000-0000-0000-0000-000000000001', 'tiles', 'pmtiles', 77, 'supabase://offline-packs/1b/dup.pmtiles', 1, true);
    raise exception 'two current packs for one stage and kind';
  exception when unique_violation then null; end;
  begin
    insert into public.offline_packs (route_id, stage_id, kind, format, version, url, size_bytes, is_current)
    values ('1b020000-0000-0000-0000-000000000001', null, 'bundle', 'zip', 78, 'supabase://offline-packs/1b/dup.zip', 1, true);
    raise exception 'two current packs for the whole route';
  exception when unique_violation then null; end;
end $$;

-- catalog for the upgrade screen: current packs only, whole route first, no URLs
:as_u10
do $$ begin
  assert (select count(*) from public.offline_pack_catalog('1b020000-0000-0000-0000-000000000001')) = 4, 'catalog lists the current packs';
  assert (select array_agg(kind || '/' || version order by ord) = array['bundle/1', 'data/1', 'tiles/2', 'tiles/1']
          from (select row_number() over () as ord, kind, version from public.offline_pack_catalog('1b020000-0000-0000-0000-000000000001')) c),
         'catalog order: route level first, then stage, kind, newest version';
  assert (select count(*) from public.offline_packs) = 0, 'a free user still cannot read pack urls';
end $$;
rollback;

-- ============================================================================
-- 8. Naming and reference data
-- ============================================================================
begin;
:as_postgres
do $$ begin
  assert not exists (select 1 from public.billing_products where id = 'plus_yearly' and name <> 'Pilgrim Plus yearly'), 'the paid plan is called Pilgrim Plus';
  assert not exists (select 1 from public.offline_packs where url = 'supabase://offline-packs/camino-frances/stage-01/tiles-v1.pmtiles'),
         'no demo offline pack that points at a missing file';
  assert exists (select 1 from pg_policies where tablename = 'offline_packs' and policyname = 'offline packs need Pilgrim Plus'), 'policy name';
  assert exists (select 1 from public.app_config where key = 'allow_sandbox_purchases') and exists (select 1 from public.app_config where key = 'max_open_stay_claims')
     and exists (select 1 from public.app_config where key = 'stale_claim_days'), 'config keys';
  assert (select not owner_assignable from public.stay_labels where slug = 'verified_owner'), 'verified_owner is server-only';
  assert coalesce((select not owner_assignable from public.stay_labels where slug = 'partner'), true), 'partner is server-only';
  assert coalesce((select owner_assignable from public.stay_labels where slug = 'pet_friendly'), true), 'pet_friendly can be chosen by owners';
end $$;
rollback;

\echo 'platform_hardening_smoke: all assertions passed'
