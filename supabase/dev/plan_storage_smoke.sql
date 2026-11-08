-- Plan numbers and cloud storage quota smoke test (migration 20261114030000). Runs after migrations + seed (validate.sh).
--
-- This is the quota enforcement test that must exist before free uploads are switched on: Free 500 MB, Pilgrim Plus
-- 10 GB, one add-on of +10 GB for Plus members only. Self-contained: it creates its own users (ids start with 1d) and
-- every section is one transaction that is rolled back, so nothing is left behind for other smoke files.
--
-- The upload policy cannot see the size of the file being uploaded, so it asks "is there room left" (remaining > 0):
-- the last file may overshoot the quota by its own size, and a quota that is used up to the last byte (remaining = 0)
-- refuses the next upload. The checks below pin exactly that.
\set ON_ERROR_STOP 1

\set as_postgres 'reset role; select set_config(''request.jwt.claims'', ''{}'', true);'
\set as_u1 'reset role; select set_config(''request.jwt.claims'', ''{"sub": "1d000000-0000-0000-0000-000000000001", "role": "authenticated"}'', true); set local role authenticated;'
\set as_u2 'reset role; select set_config(''request.jwt.claims'', ''{"sub": "1d000000-0000-0000-0000-000000000002", "role": "authenticated"}'', true); set local role authenticated;'
\set as_u3 'reset role; select set_config(''request.jwt.claims'', ''{"sub": "1d000000-0000-0000-0000-000000000003", "role": "authenticated"}'', true); set local role authenticated;'
\set as_u4 'reset role; select set_config(''request.jwt.claims'', ''{"sub": "1d000000-0000-0000-0000-000000000004", "role": "authenticated"}'', true); set local role authenticated;'

-- ============================================================================
-- 1. The numbers in the database, and the quota of every kind of account
-- ============================================================================
begin;
:as_postgres
insert into auth.users (id, email) values
  ('1d000000-0000-0000-0000-000000000001', 'ps.free@example.test'),
  ('1d000000-0000-0000-0000-000000000002', 'ps.plus@example.test'),
  ('1d000000-0000-0000-0000-000000000003', 'ps.plus-addon@example.test'),
  ('1d000000-0000-0000-0000-000000000004', 'ps.free-addon@example.test'),
  ('1d000000-0000-0000-0000-000000000005', 'ps.lapsed-addon@example.test'),
  ('1d000000-0000-0000-0000-000000000006', 'ps.cancelled-addon@example.test');
-- 2: Plus.  3: Plus + add-on.  4: free + an add-on row (must count for nothing).
-- 5: Plus that ended yesterday + an add-on row (nothing counts, the add-on went with it).
-- 6: cancelled but paid until later (still Plus) + add-on.
update public.subscriptions set status = 'active', product_id = 'plus_yearly', store = 'app_store', will_renew = true,
  expires_at = now() + interval '1 year' where user_id in ('1d000000-0000-0000-0000-000000000002', '1d000000-0000-0000-0000-000000000003');
update public.subscriptions set status = 'expired', product_id = 'plus_yearly', store = 'app_store', will_renew = false,
  expires_at = now() - interval '1 day' where user_id = '1d000000-0000-0000-0000-000000000005';
update public.subscriptions set status = 'cancelled', product_id = 'plus_yearly', store = 'app_store', will_renew = false,
  expires_at = now() + interval '10 days' where user_id = '1d000000-0000-0000-0000-000000000006';
insert into public.storage_addons (user_id, product_id, storage_bytes, transaction_id, status, expires_at) values
  ('1d000000-0000-0000-0000-000000000003', 'storage_addon_yearly', 10000000000, 'ps-tx-3', 'active', now() + interval '1 year'),
  ('1d000000-0000-0000-0000-000000000004', 'storage_addon_yearly', 10000000000, 'ps-tx-4', 'active', now() + interval '1 year'),
  ('1d000000-0000-0000-0000-000000000005', 'storage_addon_yearly', 10000000000, 'ps-tx-5', 'active', now() + interval '1 year'),
  ('1d000000-0000-0000-0000-000000000006', 'storage_addon_yearly', 10000000000, 'ps-tx-6', 'active', now() + interval '1 year');

do $$
begin
  -- the products: decimal bytes, no size in the add-on id, the old 5 GB product is gone
  assert (select storage_bytes from public.billing_products where id = 'plus_yearly') = 10000000000, 'Plus is 10 GB (decimal bytes)';
  assert (select price_cents from public.billing_products where id = 'plus_yearly') = 1200, 'Plus costs $12 a year';
  assert (select storage_bytes from public.billing_products where id = 'storage_addon_yearly') = 10000000000, 'the add-on is +10 GB';
  assert (select price_cents from public.billing_products where id = 'storage_addon_yearly') = 500, 'the add-on costs $5 a year';
  assert (select kind from public.billing_products where id = 'storage_addon_yearly') = 'storage_addon', 'the add-on is an add-on';
  assert not exists (select 1 from public.billing_products where id = 'storage_5gb_yearly'), 'the 5 GB add-on product is gone';
  assert (select count(*) from public.billing_products) = 2, 'two products: Plus and the add-on';
  assert not exists (select 1 from public.billing_products where store_product_ids::text ~ '[0-9]gb'), 'no store product id carries a size';
  assert private.config_bigint('free_storage_bytes', -1) = 500000000, 'Free is 500 MB (decimal bytes)';

  -- the quota of every kind of account
  assert private.storage_quota_bytes('1d000000-0000-0000-0000-000000000001') = 500000000,   'free: 500 MB';
  assert private.storage_quota_bytes('1d000000-0000-0000-0000-000000000002') = 10000000000, 'Plus: 10 GB';
  assert private.storage_quota_bytes('1d000000-0000-0000-0000-000000000003') = 20000000000, 'Plus + add-on: 20 GB';
  assert private.storage_quota_bytes('1d000000-0000-0000-0000-000000000004') = 500000000,   'free + an add-on row: the add-on counts for nothing';
  assert private.storage_quota_bytes('1d000000-0000-0000-0000-000000000005') = 500000000,   'Plus that ended + an add-on row: back to 500 MB';
  assert private.storage_quota_bytes('1d000000-0000-0000-0000-000000000006') = 20000000000, 'cancelled but still paid: still Plus, the add-on counts';
  assert private.storage_quota_bytes('1d000000-0000-0000-0000-0000000000ff') = 500000000,   'somebody without a profile row is on the free quota';
end $$;

-- the same numbers through what the app calls
:as_u1
do $$
declare s jsonb := public.get_my_storage();
begin
  assert (s ->> 'has_plus')::boolean = false and (s ->> 'quota_bytes')::bigint = 500000000 and (s ->> 'remaining_bytes')::bigint = 500000000,
         'get_my_storage, free: ' || s::text;
end $$;
:as_u3
do $$
declare s jsonb := public.get_my_storage();
begin
  assert (s ->> 'has_plus')::boolean and (s ->> 'quota_bytes')::bigint = 20000000000 and (s ->> 'remaining_bytes')::bigint = 20000000000,
         'get_my_storage, Plus + add-on: ' || s::text;
  assert (public.get_my_entitlements() ->> 'storage_quota_bytes')::bigint = 20000000000, 'get_my_entitlements agrees';
end $$;
rollback;

-- ============================================================================
-- 2. One add-on at a time, by the database and by the quota function
-- ============================================================================
begin;
:as_postgres
insert into auth.users (id, email) values ('1d000000-0000-0000-0000-000000000003', 'ps.plus-addon@example.test');
update public.subscriptions set status = 'active', product_id = 'plus_yearly', store = 'app_store', will_renew = true,
  expires_at = now() + interval '1 year' where user_id = '1d000000-0000-0000-0000-000000000003';
insert into public.storage_addons (user_id, product_id, storage_bytes, transaction_id, status, expires_at)
values ('1d000000-0000-0000-0000-000000000003', 'storage_addon_yearly', 10000000000, 'ps-tx-3', 'active', now() + interval '1 year');

do $$
begin
  -- a second active add-on is refused
  begin
    insert into public.storage_addons (user_id, product_id, storage_bytes, transaction_id, status, expires_at)
    values ('1d000000-0000-0000-0000-000000000003', 'storage_addon_yearly', 10000000000, 'ps-tx-3b', 'active', now() + interval '1 year');
    raise exception 'a second active add-on was accepted';
  exception when unique_violation then null;
  end;
  -- so is a quantity other than 1
  begin
    update public.storage_addons set quantity = 2 where transaction_id = 'ps-tx-3';
    raise exception 'quantity 2 was accepted';
  exception when check_violation then null;
  end;
  -- and the product that was replaced does not exist any more
  begin
    insert into public.storage_addons (user_id, product_id, storage_bytes, transaction_id, status, expires_at)
    values ('1d000000-0000-0000-0000-000000000003', 'storage_5gb_yearly', 5368709120, 'ps-tx-old', 'expired', now() - interval '1 day');
    raise exception 'the old 5 GB product was accepted';
  exception when foreign_key_violation then null;
  end;
  assert private.storage_quota_bytes('1d000000-0000-0000-0000-000000000003') = 20000000000, 'still one add-on';

  -- a renewal: the row that ended is retired first, then a new one is allowed, and the quota is still +10 GB, not +20 GB
  update public.storage_addons set status = 'expired' where transaction_id = 'ps-tx-3';
  assert private.storage_quota_bytes('1d000000-0000-0000-0000-000000000003') = 10000000000, 'an expired add-on counts for nothing';
  insert into public.storage_addons (user_id, product_id, storage_bytes, transaction_id, status, expires_at)
  values ('1d000000-0000-0000-0000-000000000003', 'storage_addon_yearly', 10000000000, 'ps-tx-3c', 'active', now() + interval '1 year');
  assert private.storage_quota_bytes('1d000000-0000-0000-0000-000000000003') = 20000000000, 'the renewed add-on counts once';
  -- an add-on whose own date has passed counts for nothing, whatever its status says
  update public.storage_addons set expires_at = now() - interval '1 minute' where transaction_id = 'ps-tx-3c';
  assert private.storage_quota_bytes('1d000000-0000-0000-0000-000000000003') = 10000000000, 'a lapsed add-on date counts for nothing';
end $$;

-- the quota function does not stack even when the table rules are out of the way (belt and braces)
drop index public.storage_addons_one_active_per_user;
alter table public.storage_addons drop constraint storage_addons_one_unit;
update public.storage_addons set expires_at = now() + interval '1 year' where transaction_id = 'ps-tx-3c';
insert into public.storage_addons (user_id, product_id, quantity, storage_bytes, transaction_id, status, expires_at)
values ('1d000000-0000-0000-0000-000000000003', 'storage_addon_yearly', 3, 10000000000, 'ps-tx-3d', 'active', now() + interval '1 year');
do $$
begin
  assert (select count(*) from public.storage_addons where user_id = '1d000000-0000-0000-0000-000000000003' and status = 'active') = 2, 'two active rows, one with quantity 3';
  assert private.storage_quota_bytes('1d000000-0000-0000-0000-000000000003') = 20000000000, 'two rows and quantity 3 still give +10 GB once';
end $$;
rollback;

-- a pilgrim cannot give themselves an add-on, and cannot read other people's rows
begin;
:as_postgres
insert into auth.users (id, email) values ('1d000000-0000-0000-0000-000000000001', 'ps.free@example.test'), ('1d000000-0000-0000-0000-000000000002', 'ps.plus@example.test');
update public.subscriptions set status = 'active', product_id = 'plus_yearly', store = 'app_store', will_renew = true,
  expires_at = now() + interval '1 year' where user_id = '1d000000-0000-0000-0000-000000000002';
insert into public.storage_addons (user_id, product_id, storage_bytes, transaction_id, status, expires_at)
values ('1d000000-0000-0000-0000-000000000002', 'storage_addon_yearly', 10000000000, 'ps-tx-2', 'active', now() + interval '1 year');
:as_u1
do $$
begin
  begin
    insert into public.storage_addons (user_id, product_id, storage_bytes, transaction_id, status, expires_at)
    values (auth.uid(), 'storage_addon_yearly', 10000000000, 'ps-self', 'active', now() + interval '1 year');
    raise exception 'a pilgrim wrote their own add-on';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from public.storage_addons) = 0, 'nobody else''s add-on is visible';
  begin
    update public.billing_products set storage_bytes = 99000000000 where id = 'plus_yearly';
    raise exception 'a pilgrim changed a product';
  exception when insufficient_privilege then null;
  end;
  assert (select storage_bytes from public.billing_products where id = 'plus_yearly') = 10000000000, 'products are readable and unchanged';
end $$;
rollback;

-- ============================================================================
-- 3. The upload policy "upload own media within quota"
-- ============================================================================
begin;
:as_postgres
insert into auth.users (id, email) values
  ('1d000000-0000-0000-0000-000000000001', 'ps.free@example.test'),
  ('1d000000-0000-0000-0000-000000000002', 'ps.plus@example.test'),
  ('1d000000-0000-0000-0000-000000000003', 'ps.plus-addon@example.test'),
  ('1d000000-0000-0000-0000-000000000004', 'ps.free-addon@example.test');
update public.subscriptions set status = 'active', product_id = 'plus_yearly', store = 'app_store', will_renew = true,
  expires_at = now() + interval '1 year' where user_id in ('1d000000-0000-0000-0000-000000000002', '1d000000-0000-0000-0000-000000000003');
insert into public.storage_addons (user_id, product_id, storage_bytes, transaction_id, status, expires_at) values
  ('1d000000-0000-0000-0000-000000000003', 'storage_addon_yearly', 10000000000, 'ps-tx-3', 'active', now() + interval '1 year'),
  ('1d000000-0000-0000-0000-000000000004', 'storage_addon_yearly', 10000000000, 'ps-tx-4', 'active', now() + interval '1 year');

-- Free (500 MB): a small file gets in; somebody else's folder never; the file that starts while there is room may overshoot;
-- then the next upload is refused by the policy; deleting a file brings the room back
:as_u1
do $$
declare msg text;
begin
  insert into storage.objects (bucket_id, name, metadata) values ('user-media', auth.uid()::text || '/posts/a.jpg', '{"size": 1000}');
  begin
    insert into storage.objects (bucket_id, name, metadata) values ('user-media', '1d000000-0000-0000-0000-000000000002/posts/not-mine.jpg', '{"size": 1000}');
    raise exception 'a free pilgrim wrote into somebody else''s folder';
  exception when insufficient_privilege then null;
  end;
  insert into storage.objects (bucket_id, name, metadata) values ('user-media', auth.uid()::text || '/posts/b.mp4', '{"size": 499999000}');   -- 1,000 + 499,999,000 = exactly 500,000,000
  assert (public.get_my_storage() ->> 'remaining_bytes')::bigint = 0, 'used to the last byte: remaining is 0';
  begin
    insert into storage.objects (bucket_id, name, metadata) values ('user-media', auth.uid()::text || '/posts/c.jpg', '{"size": 1}');
    raise exception 'a free pilgrim uploaded with no room left';
  exception when insufficient_privilege then
    get stacked diagnostics msg = message_text;
    assert msg like 'new row violates row-level security policy%', 'refused for the wrong reason: ' || msg;
  end;
  delete from storage.objects where name = auth.uid()::text || '/posts/b.mp4';
  insert into storage.objects (bucket_id, name, metadata) values ('user-media', auth.uid()::text || '/posts/c.jpg', '{"size": 1000}');   -- room again
  insert into storage.objects (bucket_id, name, metadata) values ('user-media', auth.uid()::text || '/posts/big.mp4', '{"size": 600000000}');   -- overshoot: 600,002,000 of 500,000,000
  assert (public.get_my_storage() ->> 'remaining_bytes')::bigint < 0, 'over the quota by the last file';
  begin
    insert into storage.objects (bucket_id, name, metadata) values ('user-media', auth.uid()::text || '/posts/d.jpg', '{"size": 1}');
    raise exception 'a free pilgrim uploaded over the quota';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Free with an add-on row: the add-on gives nothing, so the next upload is refused (with the old rule the quota was 10.5 GB)
:as_u4
do $$
begin
  insert into storage.objects (bucket_id, name, metadata) values ('user-media', auth.uid()::text || '/posts/big.mp4', '{"size": 600000000}');
  begin
    insert into storage.objects (bucket_id, name, metadata) values ('user-media', auth.uid()::text || '/posts/next.jpg', '{"size": 1}');
    raise exception 'an add-on gave a free pilgrim more room';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Plus (10 GB): the last byte of the quota is usable, then the policy refuses
:as_u2
do $$
begin
  insert into storage.objects (bucket_id, name, metadata) values ('user-media', auth.uid()::text || '/posts/a.mp4', '{"size": 9999999999}');
  insert into storage.objects (bucket_id, name, metadata) values ('user-media', auth.uid()::text || '/posts/b.jpg', '{"size": 1}');
  assert (public.get_my_storage() ->> 'remaining_bytes')::bigint = 0, 'Plus: used to the last byte of 10 GB';
  begin
    insert into storage.objects (bucket_id, name, metadata) values ('user-media', auth.uid()::text || '/posts/c.jpg', '{"size": 1}');
    raise exception 'a Plus pilgrim uploaded past 10 GB';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Plus with the add-on (20 GB): room up to 20 GB, then the policy refuses
:as_u3
do $$
begin
  insert into storage.objects (bucket_id, name, metadata) values ('user-media', auth.uid()::text || '/posts/a.mp4', '{"size": 15000000000}');
  insert into storage.objects (bucket_id, name, metadata) values ('user-media', auth.uid()::text || '/posts/b.mp4', '{"size": 4999999999}');
  insert into storage.objects (bucket_id, name, metadata) values ('user-media', auth.uid()::text || '/posts/c.jpg', '{"size": 1}');
  assert (public.get_my_storage() ->> 'remaining_bytes')::bigint = 0, 'Plus + add-on: used to the last byte of 20 GB';
  begin
    insert into storage.objects (bucket_id, name, metadata) values ('user-media', auth.uid()::text || '/posts/d.jpg', '{"size": 1}');
    raise exception 'a Plus pilgrim uploaded past 20 GB';
  exception when insufficient_privilege then null;
  end;
end $$;

-- The switch: free_storage_bytes = 0 closes free uploads at once and does not touch Plus
:as_postgres
update public.app_config set value = '0' where key = 'free_storage_bytes';
do $$
begin
  assert private.storage_quota_bytes('1d000000-0000-0000-0000-000000000001') = 0, 'switched off: free quota is 0';
  assert private.storage_quota_bytes('1d000000-0000-0000-0000-000000000002') = 10000000000, 'switched off: Plus is not affected';
end $$;
rollback;

-- ============================================================================
-- 4. Running the migration again changes nothing (it is written to be safe to repeat)
-- ============================================================================
begin;
:as_postgres
\ir ../migrations/20261114030000_plan_storage.sql
\ir ../migrations/20261114030000_plan_storage.sql
do $$
begin
  assert (select count(*) from public.billing_products) = 2, 'a second run leaves two products';
  assert (select storage_bytes from public.billing_products where id = 'plus_yearly') = 10000000000, 'Plus is still 10 GB';
  assert (select price_cents from public.billing_products where id = 'plus_yearly') = 1200, 'the price was not touched';
  assert private.config_bigint('free_storage_bytes', -1) = 500000000, 'Free is still 500 MB';
  assert (select count(*) from pg_indexes where indexname = 'storage_addons_one_active_per_user') = 1, 'one unique index';
  assert (select count(*) from pg_constraint where conname = 'storage_addons_one_unit') = 1, 'one check constraint';
end $$;
rollback;
