"""The stage rows of the Camino Inglés in the database and the stage files here agree.

A pack cannot be published for a stage that has no row (scripts/publish_pack.mjs refuses before it uploads anything), and
the OpenStreetMap places cannot be linked to one either. So every stage file of the route needs a row, in the migration
20261113010000_camino_ingles_stages.sql, and that migration must say what the catalog says: the same ids, numbers and
names, and no distance, because the catalog has none (an invented number is worse than none, see catalog/README.md).

This is test_stage_rows.py (the Camino Francés) for the other route, in a file of its own. No database is needed: the
rows are read out of the SQL text. supabase/dev/stages_ingles_smoke.sql runs the same migration on a real Postgres.
Run: python -m unittest discover -s test
"""
import json
import re
import unittest
from pathlib import Path

OM = Path(__file__).resolve().parent.parent
ROOT = OM.parent.parent
MIGRATIONS = ROOT / "supabase" / "migrations"
MIGRATION = MIGRATIONS / "20261113010000_camino_ingles_stages.sql"
FRANCES_MIGRATION = MIGRATIONS / "20261112000000_camino_frances_stages.sql"  # made distance_km nullable
ROUTES_MIGRATION = MIGRATIONS / "20261106120000_more_caminos.sql"  # the route row, the foreign key's target
CATALOG = OM / "catalog" / "camino-ingles"
INGLES = "20000000-0000-0000-0000-000000000006"
STAGES = 6

# ('40000000-…0005-…0001', '20000000-…0006', 1, 'Ferrol to Neda')
MIGRATION_ROW = re.compile(r"\('(?P<id>[0-9a-f-]{36})', '(?P<route>[0-9a-f-]{36})',\s*(?P<n>\d+), '(?P<name>[^']+)'\)")
# ('20000000-…0006', '10000000-…0001', 'camino-ingles', 'Camino Ingles', …
ROUTE_ROW = re.compile(r"\('(?P<id>[0-9a-f-]{36})', '[0-9a-f-]{36}', '(?P<slug>[a-z-]+)'")


def sql_without_comments(path: Path) -> str:
    return re.sub(r"--[^\n]*", "", path.read_text(encoding="utf-8"))


def migration_rows() -> dict:
    return {int(m["n"]): m.groupdict() for m in MIGRATION_ROW.finditer(sql_without_comments(MIGRATION))}


def route_config() -> dict:
    return json.loads((CATALOG / "route.json").read_text(encoding="utf-8"))


def stage_id(n: int) -> str:
    return f"40000000-0000-0000-{route_config()['route_index']:04d}-{n:012d}"


def catalog(n: int) -> dict:
    return json.loads((CATALOG / f"{n:02d}.json").read_text(encoding="utf-8"))


class StageRowsIngles(unittest.TestCase):
    def test_the_migration_adds_stages_1_to_6_once_each(self):
        rows = migration_rows()
        self.assertEqual(sorted(rows), list(range(1, STAGES + 1)), "stages 1 to 6, no gap, none twice")
        self.assertEqual(len(MIGRATION_ROW.findall(sql_without_comments(MIGRATION))), STAGES)
        self.assertEqual({r["route"] for r in rows.values()}, {INGLES})
        self.assertEqual(len({r["id"] for r in rows.values()}), STAGES, "every id once")

    def test_the_route_is_the_one_in_the_database_and_in_the_catalog(self):
        routes = {m["slug"]: m["id"] for m in ROUTE_ROW.finditer(sql_without_comments(ROUTES_MIGRATION))}
        self.assertEqual(routes.get("camino-ingles"), INGLES, "the routes row of the Camino Inglés is the foreign key's target")
        cfg = route_config()
        self.assertEqual(cfg["route_slug"], "camino-ingles")
        self.assertEqual(cfg["route_id"], INGLES, "route.json is on the same route as the rows")

    def test_every_stage_file_has_a_row_with_its_id_and_number(self):
        rows = migration_rows()
        files = sorted((OM / "stages").glob("camino-ingles-[0-9][0-9].json"))
        self.assertEqual(len(files), STAGES)
        for f in files:
            stage = json.loads(f.read_text(encoding="utf-8"))
            n = stage["stage_number"]
            self.assertIn(n, rows, f"{f.name}: no stage row in the migration, so its pack could not be published")
            self.assertEqual(rows[n]["id"], stage["stage_id"], f"{f.name}: the row has another id")
            self.assertEqual(rows[n]["id"], stage_id(n),
                             f"stage {n}: ids are 40000000-0000-0000-<route_index as 4 digits>-<number as 12 digits>")
            self.assertEqual(rows[n]["route"], stage["route_id"], f"{f.name}: the row is on another route")

    def test_the_migration_says_what_the_catalog_says(self):
        for n, row in migration_rows().items():
            self.assertEqual(row["name"], catalog(n)["name"], f"stage {n}: the name differs from catalog/camino-ingles/{n:02d}.json")

    def test_the_stages_meet_end_to_start_from_ferrol_to_santiago(self):
        # The names carry it, so the database and the catalog cannot drift apart without this failing.
        rows = migration_rows()
        for n in range(2, STAGES + 1):
            self.assertEqual(rows[n]["name"].split(" to ")[0], rows[n - 1]["name"].split(" to ")[1],
                             f"stage {n} starts where stage {n - 1} ends")
            self.assertEqual(catalog(n)["from"], catalog(n - 1)["to"], f"catalog: stage {n} starts at the point stage {n - 1} ends")
        self.assertEqual(rows[1]["name"].split(" to ")[0], "Ferrol", "the route starts in Ferrol (routes.start_name)")
        self.assertEqual(rows[STAGES]["name"].split(" to ")[1], "Santiago de Compostela", "and ends in Santiago de Compostela (routes.end_name)")

    def test_it_carries_no_distance_because_the_catalog_has_none(self):
        text = sql_without_comments(MIGRATION)
        self.assertRegex(text, r"insert into public\.stages \(id, route_id, stage_number, name\) values",
                         "the only columns it fills are the ones the catalog knows")
        for n in range(1, STAGES + 1):
            self.assertIsNone(catalog(n)["distance_km"],
                              f"stage {n} has a cited distance in the catalog now: put it in the database with a migration (an update of public.stages.distance_km) and then change this test")
        # The column is nullable because the Francés migration made it so: this one must not repeat that, and must come after it.
        self.assertIn("alter column distance_km drop not null", sql_without_comments(FRANCES_MIGRATION))
        self.assertGreater(MIGRATION.name.split("_", 1)[0], FRANCES_MIGRATION.name.split("_", 1)[0],
                           "the rows are inserted without a distance, so the migration that allows that has to run first")
        self.assertNotRegex(text, r"(?i)\balter table\b", "the column is already nullable")

    def test_it_stays_hidden_until_somebody_opens_it(self):
        text = sql_without_comments(MIGRATION)
        self.assertNotIn("is_published", text, "the stages are inserted with the column default, false")
        raw = MIGRATION.read_text(encoding="utf-8")
        self.assertIn("update public.stages set is_published = true", raw, "the file says how to open them")
        self.assertIn(f"route_id = '{INGLES}' and stage_number between 1 and {STAGES}", raw, "and which rows that statement opens")

    def test_it_changes_nothing_that_exists(self):
        text = sql_without_comments(MIGRATION)
        self.assertIn("on conflict (id) do nothing", text)
        self.assertNotRegex(text, r"(?i)\b(delete|truncate|update|drop\s+(table|column|index|policy))\b")
        self.assertEqual(len(re.findall(r"(?i)\binsert into\b", text)), 1, "one insert, into public.stages, and nothing else")
        self.assertNotRegex(text, r"(?i)\bpublic\.routes\b", "the route row is not touched")


if __name__ == "__main__":
    unittest.main()
