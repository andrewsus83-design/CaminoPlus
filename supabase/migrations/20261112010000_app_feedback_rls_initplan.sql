-- app_feedback: look up the signed-in person once per statement, not once per row.
--
-- The Supabase performance advisor (lint 0003, auth_rls_initplan) flagged both policies of public.app_feedback: a bare
-- auth.uid() in a policy is called again for every row it checks, while (select auth.uid()) is evaluated once.
-- The rule is the same, for the same people and the same rows; only the query plan changes. alter policy keeps each
-- policy's name, roles and command. Safe to run twice.

alter policy app_feedback_insert_own on public.app_feedback
  with check (user_id = (select auth.uid()));

alter policy app_feedback_select_own on public.app_feedback
  using (user_id = (select auth.uid()));
