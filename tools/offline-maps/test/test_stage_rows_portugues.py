"""The stage rows of the Camino Portugués Central in the database and the stage files here agree.

A pack cannot be published for a stage that has no row (scripts/publish_pack.mjs refuses before it uploads anything), and
the OpenStreetMap places cannot be linked to one either. So every stage file of this route needs a row, and the seed has
none for it: all eleven come from the migration 20261113000000_camino_portugues_stages.sql. That migration must say what
the catalog says: the same ids, numbers and names, and no distance, because the catalog has none (an invented number is
worse than none, see catalog/README.md).

No database is needed: the rows are read out of the SQL text. supabase/dev/stages_portugues_smoke.sql runs the same
migration on a real Postgres. It is a file of its own on purpose (test_stage_rows.py does the same for the Camino Francés).
Run: python -m unittest discover -s test
"""
import json
import re
import unittest
from pathlib import Path

OM = Path(__file__).resolve().parent.parent
ROOT = OM.parent.parent
MIGRATION = ROOT / "supabase" / "migrations" / "20261113000000_camino_portugues_stages.sql"
FRANCES_MIGRATION = ROOT / "supabase" / "migrations" / "20261112000000_camino_frances_stages.sql"
SEED = ROOT / "supabase" / "seed.sql"
PORTUGUES = "20000000-0000-0000-0000-000000000002"
ROUTE_INDEX = 1  # catalog/camino-portugues/route.json; the Camino Francés is 0
STAGE_ID = "40000000-0000-0000-{:04d}-{{:012d}}".format(ROUTE_INDEX)
STAGES = 11

# ('40000000-…0001-…01', '20000000-…0002',  1, 'Porto to Vilarinho')
MIGRATION_ROW = re.compile(r"\('(?P<id>[0-9a-f-]{36})', '(?P<route>[0-9a-f-]{36})',\s*(?P<n>\d+), '(?P<name>[^']+)'\)")
# the seed's rows start the same way and carry more columns (the same pattern as test_stage_rows.py)
SEED_ROW = re.compile(r"\('(?P<id>40000000-[0-9a-f-]{27})', '(?P<route>[0-9a-f-]{36})', (?P<n>\d+),\s*\n?\s*'(?P<name>[^']+)'")


def sql_without_comments(path: Path) -> str:
    return re.sub(r"--[^\n]*", "", path.read_text(encoding="utf-8"))


def migration_rows() -> dict:
    return {int(m["n"]): m.groupdict() for m in MIGRATION_ROW.finditer(sql_without_comments(MIGRATION))}


def catalog(n: int) -> dict:
    return json.loads((OM / "catalog" / "camino-portugues" / f"{n:02d}.json").read_text(encoding="utf-8"))


class StageRowsPortugues(unittest.TestCase):
    def test_the_migration_adds_stages_1_to_11_once_each(self):
        rows = migration_rows()
        self.assertEqual(sorted(rows), list(range(1, STAGES + 1)), "stages 1 to 11, no gap, none twice")
        self.assertEqual(len(MIGRATION_ROW.findall(sql_without_comments(MIGRATION))), STAGES)
        self.assertEqual({r["route"] for r in rows.values()}, {PORTUGUES})
        self.assertEqual(len({r["id"] for r in rows.values()}), STAGES, "every id once")

    def test_the_seed_has_no_stage_of_this_route(self):
        seed = SEED.read_text(encoding="utf-8")
        rows = [m.groupdict() for m in SEED_ROW.finditer(seed)]
        self.assertTrue(rows, "the pattern still finds the seed's stages (those of the Camino Francés)")
        self.assertEqual([r for r in rows if r["route"] == PORTUGUES], [], "the seed has no stage on this route")
        self.assertNotIn("'40000000-0000-0000-0001-", seed, "and none in this route's id range")

    def test_every_stage_file_has_a_row_with_its_id_and_number(self):
        rows = migration_rows()
        files = sorted((OM / "stages").glob("camino-portugues-[0-9][0-9].json"))
        self.assertEqual(len(files), STAGES)
        for f in files:
            stage = json.loads(f.read_text(encoding="utf-8"))
            n = stage["stage_number"]
            self.assertIn(n, rows, f"{f.name}: no stage row in the migration, so its pack could not be published")
            self.assertEqual(rows[n]["id"], stage["stage_id"], f"{f.name}: the row has another id")
            self.assertEqual(rows[n]["id"], STAGE_ID.format(n), f"stage {n}: ids are 40000000-0000-0000-{ROUTE_INDEX:04d}-<number as 12 digits>")
            self.assertEqual(rows[n]["route"], stage["route_id"], f"{f.name}: the row is on another route")

    def test_the_catalog_route_is_this_route(self):
        cfg = json.loads((OM / "catalog" / "camino-portugues" / "route.json").read_text(encoding="utf-8"))
        self.assertEqual(cfg["route_id"], PORTUGUES)
        self.assertEqual(cfg["route_index"], ROUTE_INDEX)
        self.assertEqual(cfg["route_slug"], "camino-portugues")
        self.assertIn("'camino-portugues'", SEED.read_text(encoding="utf-8"), "the seed knows the route")
        self.assertIn(PORTUGUES, SEED.read_text(encoding="utf-8"))

    def test_the_migration_says_what_the_catalog_says(self):
        for n, row in migration_rows().items():
            self.assertEqual(row["name"], catalog(n)["name"], f"stage {n}: the name differs from catalog/camino-portugues/{n:02d}.json")

    def test_every_stage_starts_where_the_one_before_ends(self):
        names = {n: row["name"] for n, row in migration_rows().items()}
        for n in range(2, STAGES + 1):
            self.assertEqual(names[n].split(" to ")[0], names[n - 1].split(" to ")[1], f"stage {n} starts elsewhere than stage {n - 1} ends")
        self.assertTrue(names[1].startswith("Porto to "))
        self.assertTrue(names[STAGES].endswith(" to Santiago de Compostela"))

    def test_it_carries_no_distance_because_the_catalog_has_none(self):
        text = sql_without_comments(MIGRATION)
        self.assertRegex(text, r"insert into public\.stages \(id, route_id, stage_number, name\) values",
                         "the only columns it fills are the ones the catalog knows")
        self.assertNotIn("distance_km", text)
        for n in range(1, STAGES + 1):
            self.assertIsNone(catalog(n)["distance_km"],
                              f"stage {n} has a sourced distance in the catalog now: put it in the database with a migration (an update of public.stages.distance_km) and then change this test")

    def test_it_needs_no_alter_table_because_distance_is_nullable_since_the_frances_migration(self):
        self.assertNotRegex(sql_without_comments(MIGRATION), r"(?i)\balter table\b")
        self.assertIn("alter column distance_km drop not null", sql_without_comments(FRANCES_MIGRATION))
        self.assertLess(FRANCES_MIGRATION.name, MIGRATION.name, "the migration that makes distance_km nullable runs first")

    def test_it_stays_hidden_until_somebody_opens_it(self):
        text = sql_without_comments(MIGRATION)
        self.assertNotIn("is_published", text, "the stages are inserted with the column default, false")
        raw = MIGRATION.read_text(encoding="utf-8")
        self.assertIn("update public.stages set is_published = true", raw, "the file says how to open them")
        self.assertIn(f"route_id = '{PORTUGUES}' and stage_number between 1 and {STAGES}", raw)

    def test_it_changes_nothing_that_exists(self):
        text = sql_without_comments(MIGRATION)
        self.assertIn("on conflict (id) do nothing", text)
        self.assertNotRegex(text, r"(?i)\b(delete|truncate|drop\s+(table|column|index|policy)|update)\b")
        self.assertEqual(len(re.findall(r"(?i)\binsert into\b", text)), 1)

    def test_the_routes_row_is_left_alone(self):
        text = sql_without_comments(MIGRATION)
        self.assertNotRegex(text, r"(?i)public\.routes", "the migration adds stages and does not touch the routes row (stage_count stays as it is)")


if __name__ == "__main__":
    unittest.main()
