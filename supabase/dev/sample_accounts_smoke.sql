-- Smoke test for dev/sample_accounts.sql: loads it twice (it must be re-runnable) and checks
-- the three demo pilgrims came out complete. Local only (validate.sh).

-- The local stub's auth.users is minimal; give it the columns and table the seed writes to
-- (Supabase has these already).
create extension if not exists pgcrypto with schema extensions;
alter table auth.users
  add column if not exists instance_id uuid, add column if not exists aud text, add column if not exists role text,
  add column if not exists encrypted_password text, add column if not exists email_confirmed_at timestamptz,
  add column if not exists raw_app_meta_data jsonb, add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz, add column if not exists confirmation_token text,
  add column if not exists recovery_token text, add column if not exists email_change_token_new text,
  add column if not exists email_change text;
create table if not exists auth.identities (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null, user_id uuid not null references auth.users (id) on delete cascade,
  identity_data jsonb not null, provider text not null,
  last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz,
  unique (provider_id, provider)
);

\i dev/sample_accounts.sql
\i dev/sample_accounts.sql

do $$
declare
  r record;
begin
  if (select count(*) from public.profiles where username in ('maria.walks', 'budi.camino', 'emma.pilgrim')) <> 3 then
    raise exception 'expected 3 sample profiles';
  end if;
  if (select count(*) from auth.identities where provider = 'email'
      and user_id in (select id from public.profiles where username in ('maria.walks', 'budi.camino', 'emma.pilgrim'))) <> 3 then
    raise exception 'expected 3 email identities (re-run must not duplicate)';
  end if;
  if (select count(distinct j.route_id) from public.journeys j join public.profiles p on p.id = j.user_id
      where p.username in ('maria.walks', 'budi.camino', 'emma.pilgrim') and j.deleted_at is null) <> 3 then
    raise exception 'expected one journey each on 3 different Caminos';
  end if;
  for r in
    select p.username, p.km_walked, p.stamps_count, p.friends_count, j.walked_km, j.status,
           (select count(*) from public.posts x where x.user_id = p.id and x.deleted_at is null) as posts,
           (select extensions.crypt('CaminoDemo-Maria1', u.encrypted_password) = u.encrypted_password from auth.users u where u.id = p.id) as maria_pw
    from public.profiles p join public.journeys j on j.user_id = p.id
    where p.username in ('maria.walks', 'budi.camino', 'emma.pilgrim')
  loop
    if r.walked_km <= 0 or r.km_walked <= 0 then raise exception '% has no walked km', r.username; end if;
    if r.stamps_count < 5 then raise exception '% has % stamps, expected at least 5', r.username, r.stamps_count; end if;
    if r.posts < 3 then raise exception '% has % posts', r.username, r.posts; end if;
    if r.friends_count <> 2 then raise exception '% has % friends, expected 2', r.username, r.friends_count; end if;
    if r.username = 'emma.pilgrim' and r.status <> 'completed' then raise exception 'emma should be completed'; end if;
    if r.username = 'maria.walks' and not r.maria_pw then raise exception 'maria password does not verify'; end if;
  end loop;
  raise notice 'sample accounts smoke: ok';
end $$;
