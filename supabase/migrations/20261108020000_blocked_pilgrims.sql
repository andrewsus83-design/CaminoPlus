-- =============================================================================
-- CaminoPlus: the list of pilgrims you blocked (Settings > Privacy and safety > Blocked pilgrims)
--
--   public.list_blocked_pilgrims()   who the caller blocked, newest first
--
-- Why a function: the "profiles readable unless blocked" policy hides a profile from BOTH sides of a
-- block (private.is_blocked looks both ways). So once you block somebody you can no longer read their
-- name or picture, and a plain select on profiles cannot show you who you blocked. This function reads
-- the caller's own rows of `blocks` and the profile behind each one as the table owner. It returns
-- nothing else: only blocks made by auth.uid(), never the other direction, so nobody learns who
-- blocked them.
--
-- A profile that was deleted is returned without its name and picture (like list_conversations).
-- Unblocking stays what it was: delete the row from `blocks` (policy "blocks owner only").
--
-- Re-runnable: create or replace, grants are idempotent. Nothing else changes: the trigger and the
-- policies of content_reports already accept reports of a post, a comment and a profile, so reporting
-- needs no schema change (dev/blocked_pilgrims_smoke.sql proves it).
-- =============================================================================

create or replace function public.list_blocked_pilgrims()
returns table (user_id uuid, username text, display_name text, avatar_url text, blocked_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select b.blocked_id,
         case when p.deleted_at is null then p.username end,
         case when p.deleted_at is null then p.display_name end,
         case when p.deleted_at is null then p.avatar_url end,
         b.created_at
  from public.blocks b
  left join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc, b.blocked_id
  limit 500;
$$;

-- Signed-in people only (the function answers nothing without a session anyway).
revoke execute on function public.list_blocked_pilgrims() from public, anon;
grant execute on function public.list_blocked_pilgrims() to authenticated, service_role;
