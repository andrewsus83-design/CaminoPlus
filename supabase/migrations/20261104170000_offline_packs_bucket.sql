-- =============================================================================
-- CaminoPlus 11: private Storage bucket for offline packs (map tiles, data, audio)
-- For now packs live in Supabase Storage; later they move to Cloudflare R2.
-- offline_packs.url says where a file is:
--   supabase://offline-packs/<key>   this bucket
--   r2://<bucket>/<key>              Cloudflare R2 (later)
-- No storage policies on purpose: clients never read this bucket directly.
-- The offline-pack-url edge function checks the plan, then signs a short-lived
-- URL with the service role. Uploads come from the build pipeline (service role).
-- Not counted in the user storage quota (that only counts user-media).
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('offline-packs', 'offline-packs', false, 524288000,
        array['application/vnd.pmtiles', 'application/octet-stream', 'application/x-sqlite3',
              'application/json', 'application/zip', 'audio/mpeg', 'audio/mp4'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
