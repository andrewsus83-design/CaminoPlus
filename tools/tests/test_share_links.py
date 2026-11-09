"""Static checks of the privacy migrations: the plan, stamps and tracks are owner only, and share links show a whitelist.
They read the SQL files (no Postgres needed). The behaviour itself is tested on a real Postgres by
supabase/dev/plan_private_smoke.sql and supabase/dev/share_links_smoke.sql (CI job "supabase").
Run from the repository root:  python3 -m unittest discover -s tools/tests -v"""
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
MIGRATIONS = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))
CLOSE = ROOT / "supabase" / "migrations" / "20261114100000_plan_private.sql"
SHARE = ROOT / "supabase" / "migrations" / "20261114100100_share_links.sql"
PRIVATE_TABLES = ("journey_days", "user_stamps", "tracks")


def strip_comments(sql: str) -> str:
    return re.sub(r"--[^\n]*", "", sql)


def function_body(sql: str, name: str) -> str:
    m = re.search(r"create or replace function public\." + name + r"\((.*?)\$\$;", sql, re.S)
    assert m, f"{name} is defined"
    return m.group(0)


class PrivateTablesAreOwnerOnly(unittest.TestCase):
    def test_the_last_select_policy_of_each_private_table_is_owner_only(self):
        """Whatever migration comes later, the SELECT policies that are left on the three tables read the owner's rows only."""
        for table in PRIVATE_TABLES:
            alive = {}
            for f in MIGRATIONS:
                sql = strip_comments(f.read_text(encoding="utf-8"))
                for m in re.finditer(r'(drop policy if exists|create policy) "([^"]+)" on public\.' + table + r"\b(.*?);", sql, re.S):
                    verb, name, rest = m.groups()
                    if verb == "drop policy if exists":
                        alive.pop(name, None)
                    elif re.search(r"for (select|all)\b", rest):
                        alive[name] = (f.name, " ".join(rest.split()))
            self.assertEqual(len(alive), 1, f"{table}: one policy that reads, got {alive}")
            (origin, text), = alive.values()
            self.assertRegex(text, r"for select to authenticated using \(user_id = \(select auth\.uid\(\)\)\)$", f"{table}: owner only ({origin})")
            self.assertNotIn("can_see", text)

    def test_the_close_migration_touches_only_select(self):
        sql = strip_comments(CLOSE.read_text(encoding="utf-8"))
        for m in re.finditer(r"create policy \"[^\"]+\" on public\.(\w+) for (\w+)", sql):
            self.assertIn(m.group(1), PRIVATE_TABLES)
            self.assertEqual(m.group(2), "select", "INSERT / UPDATE / DELETE policies are not changed")
        for old in ("plan follows journey visibility", "passport follows journey visibility", "tracks follow journey visibility"):
            self.assertIn(f'drop policy if exists "{old}"', sql)
        self.assertNotRegex(sql, r"\b(delete from|drop table|alter table .* drop|truncate)\b", "nothing destructive")

    def test_the_audit_is_written_down(self):
        head = CLOSE.read_text(encoding="utf-8")
        for word in ("AUDIT", "NOT COVERED", "can_read_user_media", "profiles", "journey_private", "health_daily"):
            self.assertIn(word, head)
        doc = (ROOT / "supabase" / "README.md").read_text(encoding="utf-8")
        self.assertIn("Who can read what", doc)
        self.assertIn("20261114100000_plan_private", doc)


class ShareLinks(unittest.TestCase):
    sql = strip_comments(SHARE.read_text(encoding="utf-8"))

    def test_the_token_is_never_stored(self):
        table = re.search(r"create table if not exists public\.shared_links \((.*?)\n\);", self.sql, re.S).group(1)
        cols = [line.split()[0] for line in table.splitlines() if line.strip() and not line.strip().startswith(("constraint", "(", "or "))]
        self.assertIn("token_hash", cols)
        self.assertNotIn("token", cols)
        self.assertIn("references auth.users (id) on delete cascade", table, "account deletion removes the links")
        self.assertRegex(self.sql, r"revoke all on public\.shared_links from public, anon, authenticated;")

    def test_every_function_is_definer_with_an_empty_search_path_and_exact_grants(self):
        for name in ("create_share_link", "list_share_links", "revoke_share_link", "get_shared", "export_my_data"):
            body = function_body(self.sql, name)
            self.assertIn("security definer", body, name)
            self.assertIn("set search_path = ''", body, name)
        self.assertRegex(self.sql, r"grant execute on function public\.get_shared\(text\) to anon, authenticated")
        for name in ("create_share_link", "list_share_links", "revoke_share_link"):
            self.assertRegex(self.sql, r"revoke all on function public\." + name + r"\([^)]*\) from public, anon;")
            self.assertNotRegex(self.sql, r"grant execute on function public\." + name + r"\([^)]*\) to[^;]*\banon\b")

    def test_a_plan_link_shows_only_the_whitelist(self):
        body = function_body(self.sql, "get_shared")
        plan = body[body.index("if v_link.kind = 'plan'"):body.index("elsif v_link.snapshot is null")]
        keys = re.findall(r"'(\w+)', (?!jsonb_build_object)", plan)
        self.assertEqual(sorted(set(keys)), sorted({
            "route_name", "start_date", "total_km", "stays_included", "days",
            "day_number", "planned_date", "from_name", "to_name", "planned_distance_km", "status", "stay_name"}))
        for secret in ("notes", "booking_status", "location", "geom", "health", "note", "phone", "email", "user_id"):
            self.assertNotRegex(plan, r"\b[ds]\." + secret + r"\b", f"the plan link never reads {secret}")
        self.assertIn("case when v_stays then s.name end", plan, "the stay only when asked")
        self.assertIn("'stays', coalesce((p_options ->> 'stays')::boolean, false)", function_body(self.sql, "create_share_link"))

    def test_a_note_link_keeps_four_fields_and_the_limits(self):
        body = function_body(self.sql, "create_share_link")
        self.assertIn("jsonb_build_object('title', v_title, 'body', v_body, 'place', v_place, 'written_at', v_written)", body)
        for limit in ("> 20000", "> 200", ">= 50", "gen_random_bytes(32)", "sha256(convert_to(v_token, 'UTF8'))"):
            self.assertIn(limit, body)
        self.assertRegex(function_body(self.sql, "get_shared"), r"\^\[A-Za-z0-9_-\]\{43\}\$")

    def test_the_export_lists_links_without_token(self):
        body = function_body(self.sql, "export_my_data")
        part = body[body.index("'shared_links'"):]
        self.assertNotIn("token", part)
        self.assertNotIn("to_jsonb(t)", part, "a whitelist of fields, not the whole row")
        # the export of 20261109000000 is kept in full: every key it had is still there
        old = (ROOT / "supabase" / "migrations" / "20261109000000_export_my_data.sql").read_text(encoding="utf-8")
        for key in re.findall(r"^\s+'(\w+)',\s", old, re.M):
            self.assertIn(f"'{key}',", body, key)


if __name__ == "__main__":
    unittest.main()
