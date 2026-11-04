-- =============================================================================
-- CaminoPlus 07: posts, media, likes, comments, reports
-- One `posts` table feeds both the Me "Self journey" feed (own posts, any
-- kind) and the Explore tab (public reels / photos / stories).
-- Offline flow: the post row is created with status 'uploading', media files
-- upload from the outbox, then the post is set to 'published'.
-- =============================================================================

create table public.posts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind              text not null check (kind in ('journal', 'photo', 'video', 'reel', 'story')),
  visibility        public.visibility not null default 'private',
  status            text not null default 'published' check (status in ('draft', 'uploading', 'published')),
  body              text check (char_length(body) <= 5000),
  journey_id        uuid references public.journeys (id) on delete set null,
  journey_day_id    uuid references public.journey_days (id) on delete set null,
  route_id          uuid references public.routes (id),
  stage_id          uuid references public.stages (id),
  poi_id            uuid references public.pois (id) on delete set null,
  stay_id           uuid references public.stays (id) on delete set null,
  place_name        text,
  location          extensions.geography(Point, 4326),
  health_summary    jsonb,           -- shared snapshot, e.g. {"steps": 31000, "km": 24.3}
  client_created_at timestamptz,
  published_at      timestamptz,
  expires_at        timestamptz,     -- stories: published_at + 24h
  -- server maintained
  like_count        integer not null default 0,
  comment_count     integer not null default 0,
  media_count       integer not null default 0,
  moderation_status text not null default 'ok' check (moderation_status in ('ok', 'pending', 'hidden', 'removed')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
create index posts_user_idx on public.posts (user_id, updated_at);
create index posts_feed_idx on public.posts (published_at desc)
  where deleted_at is null and status = 'published' and visibility = 'public' and moderation_status = 'ok';
create index posts_kind_feed_idx on public.posts (kind, published_at desc)
  where deleted_at is null and status = 'published';
create index posts_location_idx on public.posts using gist (location);
create index posts_stage_idx on public.posts (stage_id) where stage_id is not null;

create table public.post_media (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid not null references public.posts (id) on delete cascade,
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  sort_order    smallint not null default 0,
  media_type    text not null check (media_type in ('image', 'video')),
  storage_path  text not null unique,    -- user-media/<user_id>/posts/<id>.jpg
  thumb_path    text,
  width         integer,
  height        integer,
  duration_ms   integer,
  size_bytes    bigint,
  blurhash      text,
  upload_status text not null default 'pending' check (upload_status in ('pending', 'uploaded', 'failed')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index post_media_post_idx on public.post_media (post_id, sort_order);
create index post_media_thumb_idx on public.post_media (thumb_path) where thumb_path is not null;

create table public.post_likes (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index post_likes_user_idx on public.post_likes (user_id, created_at desc);

create table public.post_comments (
  id                uuid primary key default gen_random_uuid(),
  post_id           uuid not null references public.posts (id) on delete cascade,
  user_id           uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  parent_id         uuid references public.post_comments (id) on delete cascade,
  body              text not null check (char_length(body) between 1 and 1000),
  client_created_at timestamptz,
  moderation_status text not null default 'ok' check (moderation_status in ('ok', 'pending', 'hidden', 'removed')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
create index post_comments_post_idx on public.post_comments (post_id, created_at);

-- Saved posts (bookmarks in Explore).
create table public.post_saves (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- User reports for moderation (moderation workflow itself is still open;
-- moderators work through service_role tools).
create table public.content_reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('post', 'comment', 'profile', 'crowd_report', 'stay_review', 'stay_photo')),
  target_id   uuid not null,
  reason      text not null check (reason in ('spam', 'nudity', 'harassment', 'violence', 'hate', 'misinformation', 'privacy', 'other')),
  details     text check (char_length(details) <= 1000),
  status      text not null default 'open' check (status in ('open', 'reviewing', 'actioned', 'dismissed')),
  resolved_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);
create index content_reports_open_idx on public.content_reports (status, created_at) where status in ('open', 'reviewing');

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------
create trigger posts_touch           before update on public.posts           for each row execute function private.touch_row();
create trigger post_media_touch      before update on public.post_media      for each row execute function private.touch_row();
create trigger post_comments_touch   before update on public.post_comments   for each row execute function private.touch_row();
create trigger content_reports_touch before update on public.content_reports for each row execute function private.touch_row();

create trigger posts_guard before insert or update on public.posts
  for each row execute function private.guard_columns(
    '{"like_count": 0, "comment_count": 0, "media_count": 0, "moderation_status": "ok"}');
create trigger post_comments_guard before insert or update on public.post_comments
  for each row execute function private.guard_columns('{"moderation_status": "ok"}');
create trigger content_reports_guard before insert or update on public.content_reports
  for each row execute function private.guard_columns('{"status": "open", "resolved_at": null}');

-- published_at and story expiry
create or replace function private.posts_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  if new.kind = 'story' and new.published_at is not null then
    new.expires_at := new.published_at + interval '24 hours';
  elsif new.kind <> 'story' then
    new.expires_at := null;
  end if;
  return new;
end;
$$;
create trigger posts_before_write before insert or update on public.posts
  for each row execute function private.posts_before_write();

create or replace function private.posts_counter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := coalesce(new.user_id, old.user_id);
begin
  update public.profiles set posts_count = (
    select count(*) from public.posts
    where user_id = uid and deleted_at is null and status = 'published' and kind <> 'story'
  ) where id = uid;
  return null;
end;
$$;
create trigger posts_counter after insert or update of status, deleted_at, kind or delete on public.posts
  for each row execute function private.posts_counter();

create or replace function private.post_children_counters()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := coalesce(new.post_id, old.post_id);
begin
  if tg_table_name = 'post_likes' then
    update public.posts set like_count = (select count(*) from public.post_likes where post_id = pid) where id = pid;
  elsif tg_table_name = 'post_comments' then
    update public.posts set comment_count = (
      select count(*) from public.post_comments where post_id = pid and deleted_at is null and moderation_status = 'ok'
    ) where id = pid;
  elsif tg_table_name = 'post_media' then
    update public.posts set media_count = (
      select count(*) from public.post_media where post_id = pid and deleted_at is null
    ) where id = pid;
  end if;
  return null;
end;
$$;
create trigger post_likes_counter    after insert or delete on public.post_likes
  for each row execute function private.post_children_counters();
create trigger post_comments_counter after insert or update or delete on public.post_comments
  for each row execute function private.post_children_counters();
create trigger post_media_counter    after insert or update or delete on public.post_media
  for each row execute function private.post_children_counters();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.posts           enable row level security;
alter table public.post_media      enable row level security;
alter table public.post_likes      enable row level security;
alter table public.post_comments   enable row level security;
alter table public.post_saves      enable row level security;
alter table public.content_reports enable row level security;

create policy "posts by visibility" on public.posts for select to authenticated
  using (
    user_id = (select auth.uid())
    or (deleted_at is null
        and status = 'published'
        and moderation_status = 'ok'
        and (expires_at is null or expires_at > now())
        and private.can_see(user_id, visibility))
  );
create policy "post as yourself" on public.posts for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "edit own posts" on public.posts for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Child rows are visible when their post is visible (posts RLS applies
-- inside the sub-select).
create policy "media of visible posts" on public.post_media for select to authenticated
  using (user_id = (select auth.uid())
         or (deleted_at is null and exists (select 1 from public.posts p where p.id = post_id)));
create policy "add media to own posts" on public.post_media for insert to authenticated
  with check (user_id = (select auth.uid())
              and exists (select 1 from public.posts p where p.id = post_id and p.user_id = (select auth.uid()))
              and storage_path like (select auth.uid())::text || '/%');
create policy "edit own media" on public.post_media for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and storage_path like (select auth.uid())::text || '/%');

create policy "likes of visible posts" on public.post_likes for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));
create policy "like as yourself" on public.post_likes for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.posts p where p.id = post_id));
create policy "unlike" on public.post_likes for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "comments of visible posts" on public.post_comments for select to authenticated
  using (user_id = (select auth.uid())
         or (deleted_at is null and moderation_status = 'ok'
             and not private.is_blocked(user_id, (select auth.uid()))
             and exists (select 1 from public.posts p where p.id = post_id)));
create policy "comment as yourself" on public.post_comments for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.posts p where p.id = post_id));
create policy "edit own comments" on public.post_comments for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own saves" on public.post_saves for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own reports" on public.content_reports for select to authenticated
  using (reporter_id = (select auth.uid()));
create policy "report as yourself" on public.content_reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));

revoke delete on public.posts, public.post_media, public.post_comments, public.content_reports from anon, authenticated;
revoke update on public.content_reports from anon, authenticated;
revoke all on public.posts, public.post_media, public.post_likes, public.post_comments,
  public.post_saves, public.content_reports from anon;
