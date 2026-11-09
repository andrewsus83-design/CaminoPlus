-- Sign in with Apple: where the Apple refresh token of a pilgrim is kept, so the account can be revoked at Apple when it
-- is deleted (App Store 5.1.1(v)). Written by the apple-link edge function, read by delete-account; both use the service
-- role. No app and no signed-in user can read or write this table: RLS is on and there is deliberately NO policy, and
-- the anon and authenticated roles have no privileges on it at all.
-- One row per user; the row goes with the user (on delete cascade).
-- Not destructive: creates one new table, touches nothing that exists. Idempotent (safe to run twice).

create table if not exists public.apple_sign_in_tokens (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  apple_sub     text not null,
  refresh_token text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.apple_sign_in_tokens is
  'Sign in with Apple refresh tokens, only for revoking them when an account is deleted. Service role only: RLS on, no policies, on purpose.';

alter table public.apple_sign_in_tokens enable row level security;
alter table public.apple_sign_in_tokens force row level security;

revoke all on table public.apple_sign_in_tokens from anon, authenticated, public;
grant select, insert, update, delete on table public.apple_sign_in_tokens to service_role;
