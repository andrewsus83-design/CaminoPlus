-- =============================================================================
-- CaminoPlus: feedback and rating from Settings
--
--   app_feedback   one row per message or star rating a signed-in pilgrim sends
--                  from Settings > Support (Send feedback, Rate CaminoPlus).
--
-- Pilgrims can insert and read their own rows only. The team reads them with the
-- service role. A trigger caps each pilgrim at 20 rows per day so the table cannot
-- be flooded. Re-runnable.
-- =============================================================================

create table if not exists public.app_feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('feedback', 'idea', 'problem', 'rating')),
  rating      smallint check (rating between 1 and 5),
  message     text not null default '' check (char_length(message) <= 2000),
  app_version text check (char_length(app_version) <= 40),
  platform    text check (platform in ('ios', 'android', 'web')),
  created_at  timestamptz not null default now(),
  constraint app_feedback_rating_needed check (kind <> 'rating' or rating is not null),
  constraint app_feedback_message_needed check (kind = 'rating' or char_length(btrim(message)) >= 3)
);

create index if not exists app_feedback_user_idx on public.app_feedback (user_id, created_at desc);
create index if not exists app_feedback_kind_idx on public.app_feedback (kind, created_at desc);

alter table public.app_feedback enable row level security;

drop policy if exists app_feedback_insert_own on public.app_feedback;
create policy app_feedback_insert_own on public.app_feedback
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists app_feedback_select_own on public.app_feedback;
create policy app_feedback_select_own on public.app_feedback
  for select to authenticated using (user_id = auth.uid());

create or replace function private.app_feedback_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.app_feedback
       where user_id = new.user_id and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Too many messages today. Please try again tomorrow.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists app_feedback_limit on public.app_feedback;
create trigger app_feedback_limit before insert on public.app_feedback
  for each row execute function private.app_feedback_limit();

-- Repo rule for client-writable tables: the server sets created_at, not the phone.
select private.attach_server_time_triggers();
