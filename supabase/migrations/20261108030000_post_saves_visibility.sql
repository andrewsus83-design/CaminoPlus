-- =============================================================================
-- CaminoPlus: a bookmark needs a post you can see, and is never moved
--
-- post_saves had one rule, "own saves", for every command: your own rows. It never asked whether
-- the pilgrim could see the post. Anyone who knew a post id could bookmark somebody's private post
-- (and since migration 20261108010000 that also adds one to the post's save_count, which everyone
-- who can read the post can read), and an update could point a bookmark at any post.
--
-- It is replaced by the rules a like has (see post_likes in 20261104150600_social.sql):
--   read     your own bookmarks, nobody else's (the author reads the number, posts.save_count)
--   add      as yourself, for a post you can see. This is the insert test of "like as yourself": the
--            exists() over public.posts runs with the pilgrim's own row level security, so "can see"
--            means exactly what the policy "posts by visibility" says
--   remove   your own bookmarks, also when you can no longer see the post
-- and no update at all: UPDATE is taken away from the API roles. A bookmark is added or removed,
-- never moved to another post. (The server, service_role, keeps every right. The counter trigger of
-- 20261108010000 still recounts both posts when a row is moved, which only the server can do now.)
--
-- Bookmarks that exist stay as they are. Re-runnable: every policy is dropped before it is created.
-- supabase/dev/post_engagement_smoke.sql runs this file a second time on purpose.
-- =============================================================================

drop policy if exists "own saves" on public.post_saves;

drop policy if exists "read own saves" on public.post_saves;
create policy "read own saves" on public.post_saves for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "save as yourself" on public.post_saves;
create policy "save as yourself" on public.post_saves for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.posts p where p.id = post_id));

drop policy if exists "unsave" on public.post_saves;
create policy "unsave" on public.post_saves for delete to authenticated
  using (user_id = (select auth.uid()));

-- With RLS on and no update policy an update would change nothing and say nothing. Without the privilege
-- it is an error, so nobody thinks a bookmark was moved. (An upsert that updates on conflict needs it too:
-- save with insert ... on conflict do nothing.)
revoke update on public.post_saves from anon, authenticated;
