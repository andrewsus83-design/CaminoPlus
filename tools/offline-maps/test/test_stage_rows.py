"""The stage rows of the Camino Francés in the database and the stage files here agree.

A pack cannot be published for a stage that has no row (scripts/publish_pack.mjs refuses before it uploads anything), and
the OpenStreetMap places cannot be linked to one either. So every stage file needs a row, either in supabase/seed.sql
(stages 1 to 3) or in the migration that adds the other thirty (20261112000000_camino_frances_stages.sql), and that
migration must say what the catalog says: the same ids, numbers and names, and no distance, because the catalog has none
(an invented number is worse than none, see catalog/README.md).

No database is needed: the rows are read out of the SQL text. supabase/dev/stages_smoke.sql runs the same migration
on a real Postgres. Run: python -m unittest discover -s test
"""
import json
import re
import unittest
from pathlib import Path

OM = Path(__file__).resolve().parent.parent
ROOT = OM.parent.parent
MIGRATION = ROOT / "supabase" / "migrations" / "20261112000000_camino_frances_stages.sql"
SEED = ROOT / "supabase" / "seed.sql"
FRANCES = "20000000-0000-0000-0000-000000000001"
STAGE_ID = "40000000-0000-0000-0000-{:012d}"

# ('40000000-…0004', '20000000-…0001',  4, 'Pamplona to Puente la Reina')
MIGRATION_ROW = re.compile(r"\('(?P<id>[0-9a-f-]{36})', '(?P<route>[0-9a-f-]{36})',\s*(?P<n>\d+), '(?P<name>[^']+)'\)")
# the seed's rows start the same way and carry more columns
SEED_ROW = re.compile(r"\('(?P<id>40000000-[0-9a-f-]{27})', '(?P<route>[0-9a-f-]{36})', (?P<n>\d+),\s*\n?\s*'(?P<name>[^']+)'")


def sql_without_comments(path: Path) -> str:
    return re.sub(r"--[^\n]*", "", path.read_text(encoding="utf-8"))


def migration_rows() -> dict:
    return {int(m["n"]): m.groupdict() for m in MIGRATION_ROW.finditer(sql_without_comments(MIGRATION))}


def seed_rows() -> dict:
    return {int(m["n"]): m.groupdict() for m in SEED_ROW.finditer(SEED.read_text(encoding="utf-8")) if m["route"] == FRANCES}


def catalog(n: int) -> dict:
    return json.loads((OM / "catalog" / "camino-frances" / f"{n:02d}.json").read_text(encoding="utf-8"))


class StageRows(unittest.TestCase):
    def test_the_migration_adds_stages_4_to_33_once_each(self):
        rows = migration_rows()
        self.assertEqual(sorted(rows), list(range(4, 34)), "stages 4 to 33, no gap, none twice")
        self.assertEqual(len(MIGRATION_ROW.findall(sql_without_comments(MIGRATION))), 30)
        self.assertEqual({r["route"] for r in rows.values()}, {FRANCES})
        self.assertEqual(len({r["id"] for r in rows.values()}), 30, "every id once")

    def test_the_seed_has_stages_1_to_3(self):
        self.assertEqual(sorted(seed_rows()), [1, 2, 3])

    def test_every_stage_file_has_a_row_with_its_id_and_number(self):
        rows = {**seed_rows(), **migration_rows()}
        files = sorted((OM / "stages").glob("camino-frances-[0-9][0-9].json"))
        self.assertEqual(len(files), 33)
        for f in files:
            stage = json.loads(f.read_text(encoding="utf-8"))
            n = stage["stage_number"]
            self.assertIn(n, rows, f"{f.name}: no stage row in seed.sql or the migration, so its pack could not be published")
            self.assertEqual(rows[n]["id"], stage["stage_id"], f"{f.name}: the row has another id")
            self.assertEqual(rows[n]["id"], STAGE_ID.format(n), f"stage {n}: ids are 40000000-0000-0000-0000-<number as 12 digits>")
            self.assertEqual(rows[n]["route"], stage["route_id"], f"{f.name}: the row is on another route")

    def test_the_migration_says_what_the_catalog_says(self):
        for n, row in migration_rows().items():
            self.assertEqual(row["name"], catalog(n)["name"], f"stage {n}: the name differs from catalog/camino-frances/{n:02d}.json")

    def test_it_carries_no_distance_because_the_catalog_has_none(self):
        text = sql_without_comments(MIGRATION)
        self.assertRegex(text, r"insert into public\.stages \(id, route_id, stage_number, name\) values",
                         "the only columns it fills are the ones the catalog knows")
        for n in range(4, 34):
            self.assertIsNone(catalog(n)["distance_km"],
                              f"stage {n} has a sourced distance in the catalog now: put it in the database with a migration (an update of public.stages.distance_km) and then change this test")
        self.assertIn("alter column distance_km drop not null", text)

    def test_it_stays_hidden_until_somebody_opens_it(self):
        text = sql_without_comments(MIGRATION)
        self.assertNotIn("is_published", text, "the stages are inserted with the column default, false")
        raw = MIGRATION.read_text(encoding="utf-8")
        self.assertIn("update public.stages set is_published = true", raw, "the file says how to open them")

    def test_it_changes_nothing_that_exists(self):
        text = sql_without_comments(MIGRATION)
        self.assertIn("on conflict (id) do nothing", text)
        self.assertNotRegex(text, r"(?i)\b(delete|truncate|drop\s+(table|column|index|policy))\b")
        self.assertEqual(len(re.findall(r"(?i)\balter table\b", text)), 1)


if __name__ == "__main__":
    unittest.main()
