-- =============================================================================
-- CaminoPlus: engagement counters for posts (bookmarks and shares)
--
--   posts.save_count    how many pilgrims bookmarked the post (rows of post_saves)
--   posts.share_count   how many pilgrims shared the post out of the app (rows of post_shares)
--   post_shares         one row per pilgrim and post, written by record_post_share() only
--
-- Why counters: post_saves can only be read by the pilgrim who saved, so an author could never
-- count other people's bookmarks. Like like_count and comment_count, the two new counters are kept
-- by triggers: whoever can read a post can read them, and nobody but the server can write them
-- (the guard trigger below ignores what a client sends).
--
-- record_post_share(post) is the one way a share gets in. It needs a signed-in pilgrim who can see
-- the post (the same rule as the policy "posts by visibility"), it is safe to call again (a pilgrim
-- counts once per post) and it answers with the new share_count.
--
-- Re-runnable: columns, table, index and triggers are created idempotently, functions are
-- create or replace, and the backfill only touches posts whose count is wrong.
-- supabase/dev/post_engagement_smoke.sql runs this file a second time on purpose.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The counters on posts
-- -----------------------------------------------------------------------------
alter table public.posts add column if not exists save_count  integer not null default 0;
alter table public.posts add column if not exists share_count integer not null default 0;

-- Clients cannot write them: an insert starts at 0, an update keeps the old value. This is the
-- trigger from the social migration with the two new keys (the existing keys are unchanged).
drop trigger if exists posts_guard on public.posts;
create trigger posts_guard before insert or update on public.posts
  for each row execute function private.guard_columns(
    '{"like_count": 0, "comment_count": 0, "media_count": 0, "save_count": 0, "share_count": 0, "moderation_status": "ok"}');

-- -----------------------------------------------------------------------------
-- 2. post_shares: a pilgrim who shared a post out of the app (WhatsApp, a message, ...)
--    The primary key is what makes the counter "distinct pilgrims". No policy and no client
--    grants: only record_post_share() (security definer) and the server touch this table.
-- -----------------------------------------------------------------------------
create table if not exists public.post_shares (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists post_shares_user_idx on public.post_shares (user_id);

alter table public.post_shares enable row level security;
revoke all on public.post_shares from anon, authenticated;
grant all on public.post_shares to service_role;

-- -----------------------------------------------------------------------------
-- 3. Counters follow the rows of post_saves and post_shares
--    Same idea as private.post_children_counters (a recount, so a missed event heals at the next
--    one) with one addition: the post row is locked first. A recount that started before another
--    pilgrim's row was committed would not see it and could write a count that is one too low;
--    waiting for the lock first means the recount below runs on a fresh snapshot. FOR NO KEY UPDATE
--    is the lock the update itself takes, so this adds no new way to deadlock.
--    A bookmark row can be moved to another post (its owner could, until 20261108030000_post_saves_visibility.sql
--    took UPDATE away; the server still can), so an update of post_id recounts both posts, in a fixed order.
-- -----------------------------------------------------------------------------
create or replace function private.post_engagement_counters()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid;
begin
  for pid in
    select distinct x
    from unnest(array[
      case when tg_op in ('INSERT', 'UPDATE') then new.post_id end,
      case when tg_op in ('DELETE', 'UPDATE') then old.post_id end]) as t(x)
    where x is not null
    order by x
  loop
    perform 1 from public.posts p where p.id = pid for no key update;
    if not found then
      continue;   -- the post is gone (deleted with its author), nothing to count
    end if;
    if tg_table_name = 'post_saves' then
      update public.posts p set save_count = (select count(*) from public.post_saves s where s.post_id = pid)
      where p.id = pid;
    elsif tg_table_name = 'post_shares' then
      update public.posts p set share_count = (select count(*) from public.post_shares s where s.post_id = pid)
      where p.id = pid;
    end if;
  end loop;
  return null;
end;
$$;

drop trigger if exists post_saves_counter on public.post_saves;
create trigger post_saves_counter after insert or update of post_id or delete on public.post_saves
  for each row execute function private.post_engagement_counters();
drop trigger if exists post_shares_counter on public.post_shares;
create trigger post_shares_counter after insert or update of post_id or delete on public.post_shares
  for each row execute function private.post_engagement_counters();

-- Bookmarks that exist today (the counter did not). New posts and posts without bookmarks are right
-- at 0 already, so only posts whose count is wrong are touched; a second run changes nothing.
update public.posts p set save_count = s.n
from (select post_id, count(*)::integer as n from public.post_saves group by post_id) s
where p.id = s.post_id and p.save_count <> s.n;

-- -----------------------------------------------------------------------------
-- 4. record_post_share(post): the share was done, count it once for this pilgrim
--    Security definer because clients have no access to post_shares. The test of "can this pilgrim
--    see the post" is the policy "posts by visibility" of public.posts, written out (your own post;
--    or published, not deleted, not hidden by moderation, not an expired story, and private.can_see
--    agrees). dev/post_engagement_smoke.sql compares this function with the policy for every kind of
--    post and viewer, so the two cannot drift apart unnoticed.
--    A post that does not exist and a post you cannot see answer the same way, so nobody learns that
--    a private post exists.
-- -----------------------------------------------------------------------------
create or replace function public.record_post_share(p_post_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  n  integer;
begin
  if me is null then
    raise exception 'Sign in to continue.' using errcode = '42501', hint = 'not_signed_in';
  end if;
  if not exists (
    select 1 from public.posts p
    where p.id = p_post_id
      and (p.user_id = me
           or (p.deleted_at is null
               and p.status = 'published'
               and p.moderation_status = 'ok'
               and (p.expires_at is null or p.expires_at > now())
               and private.can_see(p.user_id, p.visibility)))
  ) then
    raise exception 'We could not find that post.' using errcode = 'P0002', hint = 'not_found';
  end if;

  -- a second share by the same pilgrim is not a new row, so the trigger does not run and nothing is counted
  insert into public.post_shares (post_id, user_id) values (p_post_id, me)
  on conflict (post_id, user_id) do nothing;

  select p.share_count into n from public.posts p where p.id = p_post_id;
  return n;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Grants (explicit, nothing relies on default privileges)
-- -----------------------------------------------------------------------------
-- the trigger function: nobody calls it directly
revoke execute on function private.post_engagement_counters() from public, anon, authenticated;
-- signed-in pilgrims only
revoke execute on function public.record_post_share(uuid) from public, anon;
grant execute on function public.record_post_share(uuid) to authenticated;
