-- public.app_feedback (migration 20261108000000, tuned by 20261112010000_app_feedback_rls_initplan):
-- a signed-in pilgrim writes and reads their own rows only, and the tuning did not change who can do what.
-- Runs on any database that has the migrations; every write is inside a transaction that is rolled back.
--
--   1. the tuning can be run again; both policies now look the person up once (a sub-select), and keep their
--      command and role
--   2. a pilgrim inserts a row of their own (user_id defaults to them); not one for somebody else
--   3. they read their own rows and nobody else's; another pilgrim reads none of them
--   4. anon cannot read or write
\set ON_ERROR_STOP 1

\ir ../migrations/20261112010000_app_feedback_rls_initplan.sql
\ir ../migrations/20261112010000_app_feedback_rls_initplan.sql

do $$
declare p record;
begin
  assert (select count(*) from pg_policies where schemaname = 'public' and tablename = 'app_feedback') = 2, 'two policies';
  select * into p from pg_policies where schemaname = 'public' and tablename = 'app_feedback' and policyname = 'app_feedback_insert_own';
  assert p.cmd = 'INSERT' and p.roles = '{authenticated}' and p.with_check ~* 'select auth\.uid\(\)', 'insert policy: command, role, sub-select';
  select * into p from pg_policies where schemaname = 'public' and tablename = 'app_feedback' and policyname = 'app_feedback_select_own';
  assert p.cmd = 'SELECT' and p.roles = '{authenticated}' and p.qual ~* 'select auth\.uid\(\)', 'select policy: command, role, sub-select';
end $$;

begin;
reset role;
insert into auth.users (id, email) values
  ('fb000000-0000-0000-0000-000000000001', 'fb.a@example.test'),
  ('fb000000-0000-0000-0000-000000000002', 'fb.b@example.test');

-- pilgrim A
select set_config('request.jwt.claims', '{"sub": "fb000000-0000-0000-0000-000000000001", "role": "authenticated"}', true);
set local role authenticated;
insert into public.app_feedback (kind, message) values ('feedback', 'A says hello');
do $$
begin
  assert (select count(*) from public.app_feedback) = 1, 'A reads the one row they wrote';
  assert (select user_id from public.app_feedback) = 'fb000000-0000-0000-0000-000000000001', 'it is theirs (user_id defaulted to them)';
  begin
    insert into public.app_feedback (user_id, kind, message) values ('fb000000-0000-0000-0000-000000000002', 'feedback', 'pretending to be B');
    raise exception 'A wrote a row for B';
  exception when insufficient_privilege then null;
  end;
end $$;

-- pilgrim B: A's row is not theirs
reset role;
select set_config('request.jwt.claims', '{"sub": "fb000000-0000-0000-0000-000000000002", "role": "authenticated"}', true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.app_feedback) = 0, 'B reads none of A''s rows';
end $$;
insert into public.app_feedback (kind, message) values ('idea', 'B has an idea');
do $$
begin
  assert (select count(*) from public.app_feedback) = 1 and (select message from public.app_feedback) = 'B has an idea', 'B reads only their own';
end $$;

-- anon: nothing
reset role;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
do $$
begin
  -- either the table is not granted to anon at all, or row level security shows it nothing
  begin
    assert (select count(*) from public.app_feedback) = 0, 'anon read a row of app_feedback';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.app_feedback (user_id, kind, message) values ('fb000000-0000-0000-0000-000000000001', 'feedback', 'anon was here');
    raise exception 'anon wrote to app_feedback';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

do $$ begin
  assert (select count(*) from public.app_feedback where user_id::text like 'fb00%') = 0, 'nothing stayed';
end $$;
\echo 'app_feedback_smoke: all assertions passed'
