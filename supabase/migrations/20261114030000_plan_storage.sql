-- =============================================================================
-- Plan numbers, version 1 (owner decision 2026-11-08)
--
--   Free          500 MB cloud storage                          (today: 0, so free accounts cannot upload at all)
--   Pilgrim Plus  $12 a year: 10 GB, offline maps, higher resolution photos and video
--   Add-on        +10 GB for $5 a year. Pilgrim Plus only, ONE at a time, no stacking.
--
-- !!! THIS MIGRATION OPENS CLOUD UPLOADS TO FREE ACCOUNTS !!!
-- Until now a free account has a quota of 0 bytes, and the policy "upload own media within quota" refuses
-- every upload. After this migration every signed-in account can put up to about 500 MB of photos and
-- videos on our servers, for nothing. Do NOT apply it until the owner has agreed AND all of this is in place:
--   1. Moderation and a report back office. Pilgrims will be able to upload pictures that other pilgrims see
--      (posts, chat). Somebody must read reports and be able to hide a post and remove a file, within a day.
--      Today "the moderation workflow is still an open decision" (supabase/README.md).
--   2. A quota enforcement test. This pull request adds one: supabase/dev/plan_storage_smoke.sql (it runs
--      in CI with every other smoke test) and updates the smoke tests that assumed "free = 0 GB".
--   3. The app side of free uploads is in the build people have: photos made smaller on the phone
--      (Free 1,280 px) and the per-plan file caps. Without it a free account uploads full-size photos.
--   4. The per-file cap of the bucket is decided (see the proposal at the end of this file). The quota
--      is checked as "is there room left", so the LAST file can overshoot by its own size.
--   5. Sign-up abuse is considered: every account is 500 MB for free. Email confirmation and a captcha on
--      sign-up are settings in the Supabase dashboard (Auth) that this repository cannot see or change.
-- Apply this migration BEFORE the app build and the website that say "500 MB" go out: an older database
-- still has 0 for free accounts and the screens would promise storage the server refuses.
--
-- To close free uploads again at once (an abuse wave, a cost problem), nothing needs a deploy:
--     update public.app_config set value = '0' where key = 'free_storage_bytes';
-- Files already uploaded stay; people over their quota simply cannot add more.
--
-- Units. The app prints sizes in DECIMAL units (mobile/src/lib/format.ts: 1 GB = 1,000,000,000 bytes), so
-- the quota is stored in decimal bytes: 500000000 prints "500 MB" and 10000000000 prints "10 GB", the words
-- of the marketing. (0.5 GiB = 536870912 would print "537 MB" and 10 GiB would print "11 GB".) The one place
-- the app takes these numbers from is mobile/src/lib/plan.ts; tools/tests/test_plan_numbers.py fails when
-- this file, the app constants, the seed and the website disagree.
--
-- What this migration does
--   * plus_yearly.storage_bytes = 10000000000. Price (1200 cents) and name are not touched.
--   * the add-on product is now `storage_addon_yearly` ($5 a year, +10 GB). The id carries no size on
--     purpose: an App Store or Google Play product id can never be renamed, so a later change of size
--     needs no new product. The old row `storage_5gb_yearly` is deleted.
--       Checked on the live database on 2026-11-08 with SELECTs: billing_products has exactly these two
--       rows; storage_addons has 0 rows; subscriptions has 4 rows, all status 'none', none with a
--       product_id; revenuecat_events has 0 rows. So no purchase refers to `storage_5gb_yearly`. The guard
--       below stops the migration (nothing is changed) if that is no longer true when it runs.
--   * app_config free_storage_bytes = 500000000 (was 0).
--   * private.storage_quota_bytes(): the add-on counts ONLY while the person has Pilgrim Plus
--     (private.has_plus), and at most ONE add-on counts. Before, add-ons also counted for free accounts
--     and every active row was summed, multiplied by its quantity.
--   * storage_addons: quantity must be 1, and a person can have only one active add-on row.
--
-- Rules for the billing webhook (not built yet, no purchase module exists in the app)
--   * A renewal must UPDATE the person's active add-on row (new expires_at), not insert a second one: the
--     unique index below refuses a second active row. A row that ended is set to 'expired' or 'cancelled'
--     first, then a new row may be inserted.
--   * The add-on counts only while Plus is active. If Plus lapses while the store keeps billing the add-on,
--     the person pays for bytes that do not count. When the purchase module is built, the add-on must only
--     be offered to Plus members, and ending Plus must also end the add-on in the store. The owner decides
--     how; this file only makes the server count it right.
--
-- Is anything destructive? One row is deleted (`storage_5gb_yearly`, unreferenced, see above). Two product
-- rows and one config value change, one function is replaced, one check constraint and one unique index
-- are added to an empty table. No user data is changed or deleted. Safe to run again.
--
-- To undo (by hand): restore free_storage_bytes to 0, set plus_yearly.storage_bytes back to 5368709120,
-- drop the constraint and the index named below, and put the old function body back from
-- 20261104150700_billing_storage.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Guard: stop, changing nothing, if the premises of this migration are not true any more
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.storage_addons where product_id = 'storage_5gb_yearly')
     or exists (select 1 from public.subscriptions where product_id = 'storage_5gb_yearly') then
    raise exception 'plan_storage: a purchase refers to storage_5gb_yearly. Nothing was changed. Decide by hand what that purchase becomes, then run this again.';
  end if;
  if exists (select 1 from public.storage_addons where quantity <> 1) then
    raise exception 'plan_storage: a storage_addons row has a quantity other than 1 (one add-on at a time). Nothing was changed.';
  end if;
  if exists (select 1 from public.storage_addons where status = 'active' group by user_id having count(*) > 1) then
    raise exception 'plan_storage: a person has more than one active storage add-on (one at a time). Nothing was changed.';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1. Products. On a database that was never seeded the rows are created here; on the live one only
--    storage_bytes changes (price, name and store ids stay as they are).
-- -----------------------------------------------------------------------------
insert into public.billing_products (id, kind, name, price_cents, currency, billing_period, storage_bytes, revenuecat_entitlement, store_product_ids)
values
  ('plus_yearly', 'subscription', 'Pilgrim Plus yearly', 1200, 'USD', 'year', 10000000000, 'plus',
     '{"app_store": "caminoplus_plus_yearly", "play_store": "caminoplus_plus_yearly"}'),
  ('storage_addon_yearly', 'storage_addon', 'Extra storage yearly', 500, 'USD', 'year', 10000000000, null,
     '{"app_store": "caminoplus_storage_addon_yearly", "play_store": "caminoplus_storage_addon_yearly"}')
on conflict (id) do update set storage_bytes = excluded.storage_bytes;

delete from public.billing_products where id = 'storage_5gb_yearly';

-- -----------------------------------------------------------------------------
-- 2. The free quota (read live by private.storage_quota_bytes, so a change needs no deploy)
-- -----------------------------------------------------------------------------
insert into public.app_config (key, value, description)
values ('free_storage_bytes', '500000000',
        'Cloud storage for free accounts, in bytes (decimal: 500000000 is shown as 500 MB). 0 closes free uploads at once; files already uploaded stay.')
on conflict (key) do update set value = excluded.value, description = excluded.description, updated_at = now();

-- -----------------------------------------------------------------------------
-- 3. One add-on at a time, enforced by the database
-- -----------------------------------------------------------------------------
alter table public.storage_addons drop constraint if exists storage_addons_one_unit;
alter table public.storage_addons add constraint storage_addons_one_unit check (quantity = 1);

create unique index if not exists storage_addons_one_active_per_user
  on public.storage_addons (user_id) where status = 'active';

-- -----------------------------------------------------------------------------
-- 4. The quota
--      Pilgrim Plus   plus_yearly.storage_bytes (10 GB) + the biggest ONE active, unexpired add-on
--      anybody else   app_config free_storage_bytes (500 MB); an add-on row counts for nothing
--    max(), not sum(): even if two active rows ever existed (the index above forbids it) only one counts.
--    The fallback numbers are used only if a row is missing; they are the same decimal numbers.
--    Grants are not touched: create or replace keeps them (the policy reaches this through
--    private.storage_remaining_bytes, both security definer).
-- -----------------------------------------------------------------------------
create or replace function private.storage_quota_bytes(p_user uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.has_plus(p_user) then
      coalesce((select storage_bytes from public.billing_products where id = 'plus_yearly'), 10000000000)
      + coalesce((
          select max(a.storage_bytes)
          from public.storage_addons a
          where a.user_id = p_user and a.status = 'active'
            and coalesce(a.expires_at, 'infinity'::timestamptz) > now()
        ), 0)
    else private.config_bigint('free_storage_bytes', 500000000)
  end;
$$;

-- -----------------------------------------------------------------------------
-- 5. PROPOSAL, NOT APPLIED: the per-file cap of the user-media bucket
--    Today (read from the live database on 2026-11-08): file_size_limit = 209715200 (200 MiB); allowed types
--    jpeg, png, webp, heic, mp4, quicktime. The app's own caps per plan are in mobile/src/lib/media/limits.ts
--    (on the media branch of the repository): the biggest are 45 MB for a Plus video and 20 MB for a Plus photo, and its
--    author assumes the project-wide Storage file limit is 50 MB (a dashboard setting that SQL cannot read).
--    The quota check cannot see the size of the file being uploaded, so the last file can overshoot the quota
--    by up to the bucket cap: with 200 MiB a free account can end near 700 MB of its 500 MB. Proposed value:
--    50 MiB = 52428800. It is above the biggest legitimate file (45 MB), equals the project limit the app
--    already assumes, and cuts the worst overshoot of a free account to about 10 % of its quota.
--    Raise it again when 4K video and server-side transcoding exist. To apply it, the owner runs:
--
--      update storage.buckets set file_size_limit = 52428800 where id = 'user-media';
--
--    (Left out of this migration on purpose: it changes what the upload API accepts, which is a decision of
--    its own, and the app side must have the same number first.)
-- -----------------------------------------------------------------------------
