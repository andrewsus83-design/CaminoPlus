"""The SQL that goes with the importer: its migration and its smoke test. The smoke test runs on a real Postgres in
supabase/dev/validate.sh (and the ci job `supabase`); these checks need no database and keep the two in step with
the importer. Run: python -m unittest discover -s tests"""
import json
import re
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

from regen_smoke_fixture import SQL, documents, read_block  # noqa: E402
from support_import import MIGRATIONS  # noqa: E402

MIGRATION = MIGRATIONS / "20261110000000_osm_import_keys.sql"


class SmokeTest(unittest.TestCase):
    def test_the_rows_in_the_smoke_test_are_what_the_importer_makes(self):
        self.assertEqual(read_block(SQL.read_text(encoding="utf-8")), json.loads(json.dumps(documents())),
                         "supabase/dev/osm_import_smoke.sql is out of date: run  python tools/poi-audit/tests/regen_smoke_fixture.py")

    def test_the_sample_covers_every_category_present_in_the_fixture_and_the_odd_cases(self):
        docs = read_block(SQL.read_text(encoding="utf-8"))
        cats = {r["category"] for r in docs["stays"]}
        self.assertTrue({"hotel", "albergue_municipal", "hostel", "restaurant", "cafe", "bakery"} <= cats, cats)
        self.assertTrue({"church", "water", "cross", "toilet", "atm"} <= {r["category"] for r in docs["pois"]})
        self.assertTrue(any(r["tags"].get("name_default") for r in docs["pois"]), "a place with a default name")
        self.assertTrue(any(r["osm_type"] == "way" for r in docs["pois"]), "a way")
        self.assertEqual(len(docs["stage_stays"]), len(docs["stays"]))
        self.assertEqual(len(docs["stage_pois"]), len(docs["pois"]))

    def test_it_is_a_smoke_file_validate_sh_runs_and_it_cleans_up_after_itself(self):
        self.assertRegex(SQL.name, r"smoke.*\.sql$")
        text = SQL.read_text(encoding="utf-8")
        body = re.sub(r"--[^\n]*", "", text)
        self.assertEqual(len(re.findall(r"^begin;", body, re.M)), len(re.findall(r"^rollback;", body, re.M)), "every transaction is rolled back")
        self.assertIn(f"\\ir ../migrations/{MIGRATION.name}", text, "it applies the migration itself, so it tests the file that ships")
        self.assertEqual(text.count(f"\\ir ../migrations/{MIGRATION.name}"), 4, "twice in section 1 and twice in section 2: it must be re-runnable")
        self.assertTrue(text.rstrip().endswith("\\echo 'osm_import_smoke: all assertions passed'"))
        self.assertNotRegex(body, r"(?im)^\s*(drop table|truncate|delete from)\b", "it must not remove anybody's rows")


class Migration(unittest.TestCase):
    def test_the_version_is_the_next_free_one_and_unique(self):
        versions = [p.name.split("_", 1)[0] for p in sorted(MIGRATIONS.glob("*.sql"))]
        self.assertEqual(len(versions), len(set(versions)), "every migration has its own version")
        self.assertEqual(sorted(versions), versions)
        self.assertEqual(versions[-1], MIGRATION.name.split("_", 1)[0], "it is the last one")
        self.assertGreater(MIGRATION.name.split("_", 1)[0], "20261109000000")

    def test_it_only_adds_a_key_when_there_is_none_and_never_removes_anything(self):
        text = re.sub(r"--[^\n]*", "", MIGRATION.read_text(encoding="utf-8"))
        self.assertIn("if found is not null then", text)
        self.assertEqual(len(re.findall(r"\balter table\b", text, re.I)), 1)
        self.assertRegex(text, r"add constraint %I unique \(osm_type, osm_id\)")
        self.assertNotRegex(text, r"(?i)\b(drop|delete|truncate|update)\b")
        for needle in ("indisunique", "indisvalid", "indpred is null", "indexprs is null", "indnkeyatts = 2"):
            self.assertIn(needle, text, "a partial, invalid or wider index must not count as the key")

    def test_both_tables_are_covered_and_the_first_migrations_really_have_the_key(self):
        text = MIGRATION.read_text(encoding="utf-8")
        self.assertIn("array['pois', 'stays']", text)
        for name in ("20261104150200_routes_maps.sql", "20261104150300_stays.sql"):
            self.assertIn("unique (osm_type, osm_id)", (MIGRATIONS / name).read_text(encoding="utf-8"), name)


if __name__ == "__main__":
    unittest.main()
