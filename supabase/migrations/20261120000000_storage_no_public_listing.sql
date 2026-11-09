-- =============================================================================
-- CaminoPlus: nobody can list the public buckets any more (avatars, business-media, public-media)
--
-- WHAT
--   Drops the three policies that gave anon AND authenticated SELECT on every row of storage.objects
--   in a public bucket:
--     "avatars are public"        (avatars)
--     "business media is public"  (business-media)
--     "public media is public"    (public-media)
--   and puts back only the SELECT that an upload with upsert needs, scoped to the owner:
--     "read own avatars"               authenticated, avatars, first folder = auth.uid()
--     "business media: members read"   authenticated, business-media, a member of that business
--   public-media gets no SELECT policy at all: no client can write to it (no INSERT/UPDATE policy),
--   only the service role does, and the service role bypasses RLS.
--
-- WHY
--   POST /storage/v1/object/list/avatars without signing in answered one entry per pilgrim folder,
--   and the folder name is the pilgrim's user id: anybody could enumerate every user id. Listing goes
--   through storage.objects with the caller's role, so RLS decides. Showing a picture does NOT need
--   any policy: the three buckets are public (storage.buckets.public = true), and the public URL
--   /storage/v1/object/public/<bucket>/<path> that getPublicUrl() builds is served without an RLS
--   check. So every avatar, cover and business photo keeps loading for everybody.
--   The app's avatar upload (mobile/src/lib/avatar.ts) uses upload(..., { upsert: true }) to
--   <uid>/avatar.<ext>; an upsert is INSERT ... ON CONFLICT DO UPDATE, which must SELECT the existing
--   row, hence the owner-scoped SELECT. The app has no business photo upload yet; the business web
--   tools (managers replace) get the same members-only SELECT.
--
-- WHO IS AFFECTED
--   Strangers and signed-in pilgrims can no longer list other people's folders (they never needed
--   to). Owners still list, upload, replace and delete their own avatars. Business members still read
--   their business folder. Public picture URLs: unchanged.
--
-- DESTRUCTIVE?  No data is touched. Three policies are replaced by narrower ones.
--
-- UNDO
--   drop policy if exists "read own avatars" on storage.objects;
--   drop policy if exists "business media: members read" on storage.objects;
--   create policy "avatars are public" on storage.objects for select to anon, authenticated using (bucket_id = 'avatars');
--   create policy "business media is public" on storage.objects for select to anon, authenticated using (bucket_id = 'business-media');
--   create policy "public media is public" on storage.objects for select to anon, authenticated using (bucket_id = 'public-media');
--
-- Re-runnable: drop policy if exists before each create. Proof: dev/backend_hardening_smoke.sql.
-- =============================================================================

drop policy if exists "avatars are public" on storage.objects;
drop policy if exists "business media is public" on storage.objects;
drop policy if exists "public media is public" on storage.objects;

drop policy if exists "read own avatars" on storage.objects;
create policy "read own avatars" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "business media: members read" on storage.objects;
create policy "business media: members read" on storage.objects for select to authenticated
  using (bucket_id = 'business-media' and exists (
    select 1 from public.businesses b
    where b.id::text = (storage.foldername(objects.name))[1] and private.is_business_viewer(b.id)));
-- objects.name, written out: inside the sub-select a bare `name` would be businesses.name (see the note
-- in 20261107000100_platform_hardening.sql, 4i).
