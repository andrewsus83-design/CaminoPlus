-- =============================================================================
-- CaminoPlus: a moderation queue for the owner (reports pilgrims send from the app)
--
-- WHAT
--   private.moderation_queue: one row per OPEN or REVIEWING report in public.content_reports, oldest first,
--   with
--     age_hours            how long the report has waited
--     open_reports_on_target / all_reports_on_target   how many people reported the same thing
--     target_owner_id + target_owner_username           whose content it is
--     target_moderation    the moderation_status of the reported row (posts, comments, reviews, photos,
--                          crowd reports); null for a profile or a message
--     preview              a short text of the reported thing: the post text, the comment, the review,
--                          the crowd report note, the photo path, '@username (display name): bio' for a
--                          profile, and for a message the evidence the report captured when it was sent
--                          (content_reports.evidence: body, or 'Photo: <media_path>')
--   Plus the reporter (id, username), reason and details.
--   How to act on a row (hide, ban, resolve) and how to be alerted: supabase/MODERATION.md.
--
-- WHY
--   content_reports had only "report as yourself" (INSERT) and "own reports" (SELECT). Nothing showed the
--   reports to anybody. The App Store (guideline 1.2, user-generated content) and Google Play (UGC policy)
--   expect a way to report AND timely action by the developer (within 24 hours).
--
-- WHO CAN READ IT
--   Only the dashboard SQL editor (postgres) and the service role. The view is in the private schema (not
--   exposed by the API), SELECT is revoked from public, anon and authenticated, and it is
--   security_invoker so it never runs with more rights than the reader has.
--
-- DESTRUCTIVE?  No. One view; no table, policy or row changes.
--
-- UNDO   drop view if exists private.moderation_queue;
--
-- Re-runnable: create or replace view. Proof: dev/backend_hardening_smoke.sql.
-- =============================================================================

create or replace view private.moderation_queue
with (security_invoker = true)
as
select
  r.id                                                            as report_id,
  r.created_at                                                    as reported_at,
  round((extract(epoch from (now() - r.created_at)) / 3600.0)::numeric, 1) as age_hours,
  r.status,
  r.target_type,
  r.target_id,
  r.reason,
  left(r.details, 300)                                            as details,
  count(*) over (partition by r.target_type, r.target_id)         as open_reports_on_target,
  (select count(*) from public.content_reports a
   where a.target_type = r.target_type and a.target_id = r.target_id) as all_reports_on_target,
  owner.id                                                        as target_owner_id,
  owner.username                                                  as target_owner_username,
  coalesce(p.moderation_status, c.moderation_status, sr.moderation_status, sp.moderation_status,
           cr.moderation_status)                                  as target_moderation,
  left(regexp_replace(coalesce(
    case r.target_type
      when 'post'         then p.body
      when 'comment'      then c.body
      when 'stay_review'  then sr.rating::text || '/5 ' || coalesce(sr.body, '')
      when 'stay_photo'   then coalesce(sp.storage_bucket || '/' || sp.storage_path, sp.url)
      when 'crowd_report' then cr.kind || coalesce(': ' || cr.note, '')
      when 'profile'      then '@' || pr.username || coalesce(' (' || pr.display_name || ')', '') || coalesce(': ' || pr.bio, '')
      when 'message'      then case when r.evidence ->> 'kind' = 'image'
                                    then 'Photo: ' || coalesce(r.evidence ->> 'media_path', '') || coalesce(' ' || (r.evidence ->> 'body'), '')
                                    else r.evidence ->> 'body' end
    end, '(gone: deleted after the report)'), '\s+', ' ', 'g'), 200) as preview,
  r.reporter_id,
  reporter.username                                               as reporter_username
from public.content_reports r
left join public.posts p            on r.target_type = 'post'         and p.id  = r.target_id
left join public.post_comments c    on r.target_type = 'comment'      and c.id  = r.target_id
left join public.stay_reviews sr    on r.target_type = 'stay_review'  and sr.id = r.target_id
left join public.stay_photos sp     on r.target_type = 'stay_photo'   and sp.id = r.target_id
left join public.crowd_reports cr   on r.target_type = 'crowd_report' and cr.id = r.target_id
left join public.profiles pr        on r.target_type = 'profile'      and pr.id = r.target_id
left join public.profiles owner     on owner.id = case r.target_type
                                         when 'post'         then p.user_id
                                         when 'comment'      then c.user_id
                                         when 'stay_review'  then sr.user_id
                                         when 'stay_photo'   then sp.user_id
                                         when 'crowd_report' then cr.user_id
                                         when 'profile'      then pr.id
                                         -- a safe cast: one odd evidence row must never break the whole queue
                                         when 'message'      then case when (r.evidence ->> 'sender_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                                                                       then (r.evidence ->> 'sender_id')::uuid end
                                       end
left join public.profiles reporter  on reporter.id = r.reporter_id
where r.status in ('open', 'reviewing')
order by r.created_at, r.id;

comment on view private.moderation_queue is
  'Open and reviewing content reports, oldest first, with a preview. Service role / SQL editor only. See supabase/MODERATION.md.';

revoke all on private.moderation_queue from public, anon, authenticated;
grant select on private.moderation_queue to service_role;
