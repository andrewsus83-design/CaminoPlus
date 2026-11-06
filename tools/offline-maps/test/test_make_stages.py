"""Tests for scripts/make_stages.py, the generator that turns the catalog into stage files.

The catalog used here is test/fixtures/catalog (made-up places). Every test works on a copy in a
temporary folder, so nothing in the repository is touched. Standard library only.
Run from tools/offline-maps:  python3 -m unittest discover -s test
"""
import contextlib
import io
import json
import math
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
OFFLINE_MAPS = HERE.parent
sys.path.insert(0, str(OFFLINE_MAPS / "scripts"))

import make_stages  # noqa: E402

CATALOG = HERE / "fixtures" / "catalog"
ALLOWLIST = HERE / "fixtures" / "geofabrik_extracts.json"
SCRIPT = OFFLINE_MAPS / "scripts" / "make_stages.py"

NAVARRA = "https://download.geofabrik.de/europe/spain/navarra-latest.osm.pbf"
LA_RIOJA = "https://download.geofabrik.de/europe/spain/la-rioja-latest.osm.pbf"
INCLUDE_REGEX = "camino franc[eé]s|camiño franc[eé]s|chemin navarrais|nafar bidea"
EXCLUDE_REGEX = "\\b(SL|PR)-[A-Z]{1,3} ?\\d"

# What the generator must write for fixture stage 2. The numbers were checked with another library
# (pyproj on a sphere of the same radius): polyline 21.32 km, 0.4 of it is 8.5 km; the bbox is the
# three waypoints widened by clip_km + margin_km = 10 km on each side, rounded to 2 decimals.
EXPECTED_STAGE_2 = {
    "slug": "camino-frances-02",
    "name": "Fixture Bravo to Fixture Charlie",
    "route_slug": "camino-frances",
    "stage_number": 2,
    "route_id": "20000000-0000-0000-0000-000000000001",
    "stage_id": "40000000-0000-0000-0000-000000000002",
    "osm_extracts": [NAVARRA, LA_RIOJA],
    "search_bbox": [-2.62, 42.41, -2.13, 42.64],
    "coastal": False,
    "route_name_regex": INCLUDE_REGEX,
    "route_exclude_regex": EXCLUDE_REGEX,
    "fallback_route": "camino-frances-02.route.geojson",
    "clip_km": 6,
    "min_route_km": 8.5,
    "buffer_km": 3,
    "maxzoom": 15,
    "waypoints": [
        {"name": "Fixture Bravo", "at": [-2.2495, 42.5505]},
        {"name": "Fixture Mid", "at": [-2.38, 42.53]},
        {"name": "Fixture Charlie", "at": [-2.5, 42.5]},
    ],
    "render_checks": [
        {"name": "Fixture Bravo z15", "at": [-2.2495, 42.5505, 15], "min_features": {}, "min_labels": {}},
        {"name": "Fixture Charlie z15", "at": [-2.5, 42.5, 15], "min_features": {}, "min_labels": {}},
    ],
    "generated_from": "catalog/camino-frances/02.json",
}
EXPECTED_FILES = sorted([
    "camino-frances-02.json", "camino-frances-02.route.geojson",
    "camino-frances-03.json", "camino-frances-03.route.geojson",
    "camino-frances-04.json", "camino-frances-04.route.geojson",
    "demo-route-01.json", "demo-route-01.route.geojson",
    "demo-route-02.json", "demo-route-02.route.geojson",
])
# slug -> (search_bbox, min_route_km), verified like EXPECTED_STAGE_2
OTHER_STAGES = {
    "camino-frances-03": ([-2.87, 42.36, -2.38, 42.59], 8.5),
    "camino-frances-04": ([-3.12, 42.31, -2.63, 42.54], 8.5),
    "demo-route-01": ([-1.82, 41.7, -1.43, 41.85], 8.6),
    "demo-route-02": ([-2.07, 41.65, -1.68, 41.8], 8.6),
}


def haversine_km(lat1, lng1, lat2, lng2):
    """Written out again here, so the tests do not trust the code they test."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lng2 - lng1) / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(a))


class Base(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = Path(self._tmp.name)
        self.catalog = self.root / "catalog"
        self.stages = self.root / "stages"
        self.allowlist = self.root / "geofabrik_extracts.json"
        self.fresh()

    def fresh(self):
        """A pristine copy of the fixture catalog and no stage files."""
        shutil.rmtree(self.catalog, ignore_errors=True)
        shutil.rmtree(self.stages, ignore_errors=True)
        shutil.copytree(CATALOG, self.catalog)
        shutil.copy(ALLOWLIST, self.allowlist)

    def run_tool(self, *flags):
        argv = ["--catalog", str(self.catalog), "--stages", str(self.stages), "--extracts", str(self.allowlist), *flags]
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            rc = make_stages.main(argv)
        return rc, out.getvalue(), err.getvalue()

    def generate(self):
        rc, out, err = self.run_tool()
        self.assertEqual(rc, 0, err)
        return out

    def edit(self, rel, change):
        path = self.catalog / rel
        data = json.loads(path.read_text(encoding="utf-8"))
        change(data)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    def write(self, rel, text):
        (self.catalog / rel).write_text(text, encoding="utf-8")

    def stage(self, slug):
        return json.loads((self.stages / f"{slug}.json").read_text(encoding="utf-8"))

    def save_stage(self, slug, doc):
        (self.stages / f"{slug}.json").write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    def snapshot(self):
        return {p.name: p.read_bytes() for p in sorted(self.stages.glob("*"))} if self.stages.exists() else {}

    def assertNothingWritten(self):
        self.assertEqual(self.snapshot(), {})


class GeneratedFiles(Base):
    def test_one_stage_file_and_one_route_file_per_stage_except_the_hand_written_stage_1(self):
        self.generate()
        self.assertEqual(sorted(p.name for p in self.stages.iterdir()), EXPECTED_FILES)
        # catalog/camino-frances/01.json exists and is validated, but camino-frances-01 is hand-written
        self.assertFalse((self.stages / "camino-frances-01.json").exists())
        self.assertFalse((self.stages / "camino-frances-01.route.geojson").exists())

    def test_stage_file_content_and_key_order(self):
        self.generate()
        doc = self.stage("camino-frances-02")
        self.assertEqual(doc, EXPECTED_STAGE_2)
        self.assertEqual(list(doc), list(EXPECTED_STAGE_2))
        self.assertNotIn("quality", doc)  # a new stage builds in measure mode and cannot be published

    def test_other_stages_have_the_right_bbox_and_minimum(self):
        self.generate()
        for slug, (bbox, min_km) in OTHER_STAGES.items():
            with self.subTest(slug):
                doc = self.stage(slug)
                self.assertEqual(doc["search_bbox"], bbox)
                self.assertEqual(doc["min_route_km"], min_km)

    def test_bbox_is_the_waypoints_widened_by_clip_and_margin(self):
        self.generate()
        for slug, expand in (("camino-frances-02", 10), ("camino-frances-04", 10), ("demo-route-01", 6)):
            with self.subTest(slug):
                doc = self.stage(slug)
                west, south, east, north = doc["search_bbox"]
                points = [tuple(w["at"]) for w in doc["waypoints"]]  # (lng, lat)
                lats = [p[1] for p in points]
                # rounding to 2 decimals moves an edge by at most 0.005 degrees, about 0.55 km
                self.assertGreaterEqual(haversine_km(min(lats), points[0][0], south, points[0][0]), expand - 0.6)
                self.assertGreaterEqual(haversine_km(max(lats), points[0][0], north, points[0][0]), expand - 0.6)
                westmost, eastmost = min(points), max(points)
                self.assertGreaterEqual(haversine_km(westmost[1], westmost[0], westmost[1], west), expand - 0.6)
                self.assertGreaterEqual(haversine_km(eastmost[1], eastmost[0], eastmost[1], east), expand - 0.6)
                self.assertLess(haversine_km(min(lats), points[0][0], south, points[0][0]), expand + 0.6)  # and not wider than asked

    def test_minimum_route_length_has_a_floor_of_3_km(self):
        # 41.75,-1.75 to 41.73,-1.77 is about 2.9 km in a straight line: 40 % of it is 1.2 km
        self.edit("demo-route/02.json", lambda d: d["to"].update(lat=41.73, lng=-1.77))
        self.generate()
        self.assertEqual(self.stage("demo-route-02")["min_route_km"], 3)

    def test_minimum_route_length_is_40_percent_of_the_polyline_to_one_decimal(self):
        self.generate()
        for slug in ("camino-frances-02", "camino-frances-04", "demo-route-01"):
            doc = self.stage(slug)
            points = [tuple(w["at"]) for w in doc["waypoints"]]
            length = sum(haversine_km(a[1], a[0], b[1], b[0]) for a, b in zip(points, points[1:]))
            self.assertEqual(doc["min_route_km"], max(3, round(0.4 * length, 1)), slug)

    def test_stage_ids_follow_the_route_index(self):
        self.generate()
        self.assertEqual(self.stage("camino-frances-04")["stage_id"], "40000000-0000-0000-0000-000000000004")
        self.assertEqual(self.stage("demo-route-01")["stage_id"], "40000000-0000-0000-0007-000000000001")
        self.assertEqual(self.stage("demo-route-02")["stage_id"], "40000000-0000-0000-0007-000000000002")
        self.assertEqual(self.stage("demo-route-02")["route_id"], "20000000-0000-0000-0000-000000000009")

    def test_stage_1_of_a_route_that_is_not_hand_written_is_generated(self):
        self.generate()
        self.assertEqual(self.stage("demo-route-01")["stage_number"], 1)

    def test_exclude_regex_is_left_out_when_the_route_has_none(self):
        self.generate()
        doc = self.stage("demo-route-01")
        self.assertNotIn("route_exclude_regex", doc)
        self.assertEqual(doc["route_name_regex"], "demo way")
        self.assertEqual((doc["clip_km"], doc["buffer_km"], doc["maxzoom"]), (4, 2, 14))
        self.assertTrue(self.stage("demo-route-02")["coastal"])
        self.assertFalse(self.stage("demo-route-01")["coastal"])

    def test_extract_urls_come_from_the_allowlist_in_catalog_order(self):
        self.generate()
        self.assertEqual(self.stage("camino-frances-02")["osm_extracts"], [NAVARRA, LA_RIOJA])
        self.edit("camino-frances/02.json", lambda d: d.update(extracts=["la-rioja", "navarra"]))
        self.generate()
        self.assertEqual(self.stage("camino-frances-02")["osm_extracts"], [LA_RIOJA, NAVARRA])

    def test_render_checks_are_two_views_at_from_and_to_in_measure_only_mode(self):
        self.generate()
        for slug in ("camino-frances-03", "demo-route-02"):
            doc = self.stage(slug)
            first, last = doc["waypoints"][0], doc["waypoints"][-1]
            self.assertEqual(doc["render_checks"], [
                {"name": f"{first['name']} z15", "at": [*first["at"], 15], "min_features": {}, "min_labels": {}},
                {"name": f"{last['name']} z15", "at": [*last["at"], 15], "min_features": {}, "min_labels": {}},
            ])

    def test_route_file_is_a_linestring_through_from_via_to(self):
        self.generate()
        geojson = json.loads((self.stages / "camino-frances-02.route.geojson").read_text(encoding="utf-8"))
        self.assertEqual(geojson["type"], "FeatureCollection")
        (feature,) = geojson["features"]
        self.assertEqual(feature["geometry"], {"type": "LineString", "coordinates": [[-2.2495, 42.5505], [-2.38, 42.53], [-2.5, 42.5]]})
        # no via points: just two
        no_via = json.loads((self.stages / "camino-frances-03.route.geojson").read_text(encoding="utf-8"))
        self.assertEqual(no_via["features"][0]["geometry"]["coordinates"], [[-2.5, 42.5], [-2.75, 42.45]])
        # corridor.py reads this file as a FeatureCollection of geometries
        self.assertEqual(self.stage("camino-frances-02")["fallback_route"], "camino-frances-02.route.geojson")

    def test_files_are_two_space_json_with_a_trailing_newline_and_readable_non_ascii(self):
        self.edit("camino-frances/03.json", lambda d: d["to"].update(name="Nájera"))
        self.edit("camino-frances/04.json", lambda d: d["from"].update(name="Nájera"))
        self.generate()
        for path in self.stages.iterdir():
            text = path.read_text(encoding="utf-8")
            self.assertTrue(text.endswith("}\n") and not text.endswith("\n\n"), path.name)
            self.assertEqual(text, json.dumps(json.loads(text), indent=2, ensure_ascii=False) + "\n", path.name)
            self.assertNotIn("\t", text)
            self.assertNotIn("\r", text)
        text = (self.stages / "camino-frances-03.json").read_text(encoding="utf-8")
        self.assertIn('"name": "Nájera z15"', text)
        self.assertIn("franc[eé]s", text)
        self.assertTrue(text.startswith('{\n  "slug": "camino-frances-03",\n'))

    def test_output_does_not_depend_on_the_order_files_are_listed(self):
        self.generate()
        first = self.snapshot()
        self.fresh()
        self.generate()
        self.assertEqual(self.snapshot(), first)

    def test_write_log_lists_what_was_written_in_order(self):
        out = self.generate()
        wrote = [line.split(" ", 1)[1] for line in out.splitlines() if line.startswith("wrote ")]
        self.assertEqual(wrote, [f"{self.stages.name}/{name}" for name in EXPECTED_FILES])
        self.assertIn("5 stage file(s) generated, 10 file(s) written, 0 unchanged", out)


class Idempotence(Base):
    def test_second_run_changes_nothing(self):
        self.generate()
        first = self.snapshot()
        out = self.generate()
        self.assertEqual(self.snapshot(), first)
        self.assertIn("0 file(s) written, 10 unchanged", out)
        self.assertNotIn("wrote ", out)

    def test_check_passes_when_the_files_are_in_step(self):
        self.generate()
        rc, out, err = self.run_tool("--check")
        self.assertEqual((rc, err), (0, ""))
        self.assertIn("5 generated stage file(s) match the catalog", out)

    def test_check_writes_nothing_and_fails_when_files_are_missing(self):
        rc, out, err = self.run_tool("--check")
        self.assertEqual(rc, 1)
        self.assertFalse(self.stages.exists())  # not even the folder
        self.assertIn("camino-frances-02.json does not exist", err)
        self.assertIn("Run `npm run stages`", err)

    def test_check_fails_when_a_generated_file_was_edited_and_shows_the_difference(self):
        self.generate()
        path = self.stages / "camino-frances-03.json"
        doc = self.stage("camino-frances-03")
        doc["clip_km"] = 9
        self.save_stage("camino-frances-03", doc)
        before = self.snapshot()
        rc, _, err = self.run_tool("--check")
        self.assertEqual(rc, 1)
        self.assertIn("camino-frances-03.json is out of date", err)
        self.assertIn('-  "clip_km": 9', err)
        self.assertIn('+  "clip_km": 6', err)
        self.assertEqual(self.snapshot(), before)  # --check never repairs
        self.assertNotEqual(path.read_text(encoding="utf-8"), "")

    def test_check_fails_when_the_route_geojson_was_edited(self):
        self.generate()
        (self.stages / "demo-route-01.route.geojson").write_text("{}\n", encoding="utf-8")
        rc, _, err = self.run_tool("--check")
        self.assertEqual(rc, 1)
        self.assertIn("demo-route-01.route.geojson is out of date", err)

    def test_check_fails_when_the_catalog_changed_after_generation(self):
        self.generate()
        self.edit("camino-frances/04.json", lambda d: d.update(name="Fixture Delta to Fixture Echo, shorter name"))
        rc, _, err = self.run_tool("--check")
        self.assertEqual(rc, 1)
        self.assertIn("camino-frances-04.json is out of date", err)
        self.assertNotIn("camino-frances-03.json", err)

    def test_files_with_windows_line_endings_count_as_in_step(self):
        self.generate()
        path = self.stages / "camino-frances-02.json"
        path.write_bytes(path.read_bytes().replace(b"\n", b"\r\n"))
        rc, _, err = self.run_tool("--check")
        self.assertEqual((rc, err), (0, ""))

    def test_a_generated_file_whose_catalog_entry_is_gone_is_an_orphan(self):
        self.generate()
        (self.catalog / "camino-frances" / "04.json").unlink()
        rc, _, err = self.run_tool("--check")
        self.assertEqual(rc, 1)
        self.assertIn("camino-frances-04.json: was generated from catalog/camino-frances/04.json, which is not in the catalog any more", err)
        # writing only warns (the file may hold calibration somebody wants to look at) and leaves it alone
        before = self.snapshot()
        rc, _, err = self.run_tool()
        self.assertEqual(rc, 0)
        self.assertIn("warning: stages/camino-frances-04.json".replace("stages", self.stages.name), err)
        self.assertEqual(self.snapshot(), before)

    def test_hand_written_files_are_never_orphans_or_touched(self):
        self.stages.mkdir()
        stage_one = self.stages / "camino-frances-01.json"
        shutil.copy(OFFLINE_MAPS / "stages" / "camino-frances-01.json", stage_one)
        original = stage_one.read_bytes()
        self.generate()
        self.assertEqual(stage_one.read_bytes(), original)
        rc, _, err = self.run_tool("--check")
        self.assertEqual((rc, err), (0, ""))
        self.assertFalse((self.stages / "camino-frances-01.route.geojson").exists())


class Calibration(Base):
    CALIBRATED_QUALITY = {"min_tiles": 400, "max_tiles": 1500, "min_size_mb": 1, "max_size_mb": 6,
                          "required_layers": ["building", "place"], "max_change_ratio": 1.5, "max_osm_age_days": 45}

    def calibrate(self, slug="camino-frances-02", normalise=True):
        """What a person does after the first real build: set the band and the render floors.

        The keys are added at the end of the file here, wherever an editor would put them. The
        README says to run the generator once afterwards, which moves them to their place."""
        doc = self.stage(slug)
        doc["quality"] = json.loads(json.dumps(self.CALIBRATED_QUALITY))
        doc["render_checks"][0]["min_features"] = {"poi": 12, "transportation": 40, "building": 4}
        doc["render_checks"][0]["min_labels"] = {"place": 1}
        doc["render_checks"][1]["min_features"] = {"building": 2}
        doc["render_allow_errors"] = ["^console: Failed to load resource: .*glyphs"]
        self.save_stage(slug, doc)
        if normalise:
            self.generate()
        return doc

    def test_calibration_survives_regeneration_and_the_catalog_changes_are_applied(self):
        self.generate()
        calibrated = self.calibrate()
        self.edit("camino-frances/02.json", lambda d: d.update(name="Fixture Bravo to Fixture Charlie, renamed"))
        self.generate()
        doc = self.stage("camino-frances-02")
        self.assertEqual(doc["name"], "Fixture Bravo to Fixture Charlie, renamed")  # the catalog wins
        self.assertEqual(doc["quality"], calibrated["quality"])
        self.assertEqual(doc["render_allow_errors"], calibrated["render_allow_errors"])
        self.assertEqual(doc["render_checks"], calibrated["render_checks"])
        # quality sits after maxzoom (as in stage 1), the allowed errors after the views
        self.assertEqual(list(doc), [
            "slug", "name", "route_slug", "stage_number", "route_id", "stage_id", "osm_extracts", "search_bbox", "coastal",
            "route_name_regex", "route_exclude_regex", "fallback_route", "clip_km", "min_route_km", "buffer_km", "maxzoom",
            "quality", "waypoints", "render_checks", "render_allow_errors", "generated_from"])

    def test_check_passes_on_a_calibrated_file(self):
        self.generate()
        self.calibrate()
        rc, _, err = self.run_tool("--check")
        self.assertEqual((rc, err), (0, ""))

    def test_calibration_keys_in_the_wrong_place_are_moved_without_changing_a_value(self):
        # --check wants the exact text the generator writes (like the web/ sync check), so keys that an
        # editor appended at the end make it fail until the generator is run once.
        self.generate()
        calibrated = self.calibrate(normalise=False)
        rc, _, err = self.run_tool("--check")
        self.assertEqual(rc, 1)
        self.assertIn("camino-frances-02.json is out of date", err)
        self.generate()
        self.assertEqual(self.run_tool("--check")[0], 0)
        doc = self.stage("camino-frances-02")
        self.assertEqual({k: doc[k] for k in ("quality", "render_checks", "render_allow_errors")},
                         {k: calibrated[k] for k in ("quality", "render_checks", "render_allow_errors")})

    def test_calibration_is_per_stage(self):
        self.generate()
        self.calibrate("camino-frances-02")
        self.generate()
        self.assertNotIn("quality", self.stage("camino-frances-03"))
        self.assertEqual(self.stage("camino-frances-03")["render_checks"][0]["min_features"], {})

    def test_floors_stay_with_the_view_position_when_a_town_is_renamed_or_moved(self):
        self.generate()
        calibrated = self.calibrate()
        self.edit("camino-frances/03.json", lambda d: d["from"].update(name="Fixture Charlie, renamed"))
        self.edit("camino-frances/02.json", lambda d: d["to"].update(name="Fixture Charlie, renamed", lat=42.5005))
        self.edit("camino-frances/03.json", lambda d: d["from"].update(lat=42.5005))
        self.generate()
        doc = self.stage("camino-frances-02")
        self.assertEqual(doc["render_checks"][1]["name"], "Fixture Charlie, renamed z15")
        self.assertEqual(doc["render_checks"][1]["at"], [-2.5, 42.5005, 15])
        self.assertEqual(doc["render_checks"][1]["min_features"], calibrated["render_checks"][1]["min_features"])
        self.assertEqual(doc["render_checks"][0]["min_labels"], {"place": 1})

    def test_views_added_after_the_first_two_are_kept(self):
        self.generate()
        doc = self.calibrate()
        extra = {"name": "A pass z13", "at": [-2.4, 42.52, 13], "min_features": {"mountain_peak": 4}, "min_labels": {"peak": 1}}
        doc["render_checks"].append(extra)
        self.save_stage("camino-frances-02", doc)
        self.edit("camino-frances/02.json", lambda d: d.update(notes="changed"))
        self.generate()
        self.assertEqual(self.stage("camino-frances-02")["render_checks"][2:], [extra])
        self.assertEqual(self.run_tool("--check")[0], 0)

    def test_keys_the_generator_does_not_manage_are_not_kept(self):
        self.generate()
        doc = self.stage("camino-frances-02")
        doc["clip_km"] = 99  # a hand edit of a generated field
        doc["hand_added"] = True
        self.save_stage("camino-frances-02", doc)
        self.generate()
        doc = self.stage("camino-frances-02")
        self.assertEqual(doc["clip_km"], 6)
        self.assertNotIn("hand_added", doc)

    def test_a_file_that_was_hand_written_before_keeps_its_calibration_and_the_user_is_told(self):
        self.stages.mkdir()
        old = {"slug": "camino-frances-03", "name": "by hand", "quality": self.CALIBRATED_QUALITY,
               "render_checks": [{"name": "x", "at": [0, 0, 15], "min_features": {"poi": 7}}], "render_allow_errors": ["x"]}
        self.save_stage("camino-frances-03", old)
        rc, _, err = self.run_tool()
        self.assertEqual(rc, 0, err)
        self.assertIn("camino-frances-03.json was not generated before", err)
        doc = self.stage("camino-frances-03")
        self.assertEqual(doc["quality"], self.CALIBRATED_QUALITY)
        self.assertEqual(doc["render_checks"][0]["min_features"], {"poi": 7})
        self.assertEqual(doc["render_checks"][0]["min_labels"], {})
        self.assertEqual(doc["name"], "Fixture Charlie to Fixture Delta")
        self.assertEqual(doc["generated_from"], "catalog/camino-frances/03.json")

    def test_an_existing_stage_file_that_is_not_json_stops_the_run(self):
        self.stages.mkdir()
        (self.stages / "camino-frances-03.json").write_text("{ half a file", encoding="utf-8")
        rc, _, err = self.run_tool()
        self.assertEqual(rc, 1)
        self.assertIn("camino-frances-03.json: not valid JSON", err)
        self.assertEqual(sorted(p.name for p in self.stages.iterdir()), ["camino-frances-03.json"])  # nothing else written

    def test_a_garbled_calibration_does_not_crash_the_generator(self):
        self.generate()
        doc = self.stage("camino-frances-02")
        doc["render_checks"] = ["not a view", {"min_features": "nope"}]
        self.save_stage("camino-frances-02", doc)
        self.generate()
        self.assertEqual(self.stage("camino-frances-02")["render_checks"], EXPECTED_STAGE_2["render_checks"])


# Each case: (what is wrong, what to do to the fresh catalog, text the error must contain)
def set_(rel, key, value):
    return lambda t: t.edit(rel, lambda d: d.__setitem__(key, value))


def drop(rel, key):
    return lambda t: t.edit(rel, lambda d: d.pop(key))


def point(rel, which, **fields):
    return lambda t: t.edit(rel, lambda d: d[which].update(fields))


def via_point(rel, **fields):
    return lambda t: t.edit(rel, lambda d: d["via"][0].update(fields))


S2, S3, S4 = "camino-frances/02.json", "camino-frances/03.json", "camino-frances/04.json"
ROUTE, DEMO = "camino-frances/route.json", "demo-route/route.json"


def rename(old, new):
    return lambda t: (t.catalog / old).rename(t.catalog / new)


def many_via(t):
    t.edit(S2, lambda d: d.update(via=[{"name": f"V{i}", "lat": 42.53, "lng": -2.38 + i * 0.001, "source": "fixture"} for i in range(7)]))


def spread_out(t):
    # every hop is under 60 km, but the stage is more than 1.2 degrees wide
    t.edit(S2, lambda d: d.update(via=[
        {"name": "West One", "lat": 42.55, "lng": -2.9, "source": "fixture"},
        {"name": "West Two", "lat": 42.55, "lng": -3.22, "source": "fixture"}]))


def bad_allowlist(t):
    t.allowlist.write_text(json.dumps({"navarra": "http://example.com/navarra.osm.pbf"}), encoding="utf-8")


def no_routes(t):
    (t.catalog / "camino-frances" / "route.json").unlink()
    (t.catalog / "demo-route" / "route.json").unlink()


def missing_catalog(t):
    shutil.rmtree(t.catalog)


VALIDATION_ERRORS = [
    # the stage number
    ("n differs from the file name", set_(S3, "n", 4), "n is 4 but the file name says stage 3"),
    ("n is text", set_(S3, "n", "3"), "n is '3' but the file name says stage 3"),
    ("file is not named NN.json", rename(S3, "camino-frances/3.json"), "unexpected file name"),
    ("a stray json file", lambda t: t.write("camino-frances/notes.json", "{}"), "camino-frances/notes.json: unexpected file name"),
    ("stage 0", lambda t: (rename(S4, "camino-frances/00.json")(t), t.edit("camino-frances/00.json", lambda d: d.update(n=0))), "stage numbers start at 1"),
    # from and to
    ("from is missing", drop(S3, "from"), "missing key 'from'"),
    ("to is missing", drop(S3, "to"), "missing key 'to'"),
    ("name is missing", drop(S3, "name"), "missing key 'name'"),
    ("extracts is missing", drop(S3, "extracts"), "missing key 'extracts'"),
    ("coastal is missing", drop(S3, "coastal"), "missing key 'coastal'"),
    ("coastal is text", set_(S3, "coastal", "false"), "coastal must be true or false"),
    ("a key that is not in the schema", set_(S3, "vias", []), "unknown key 'vias'"),
    ("from is not an object", set_(S3, "from", "Charlie"), "from must be an object with name, lat, lng and source"),
    ("latitude is NaN", point(S3, "to", lat=float("nan")), "to: lat nan must be a finite number"),
    ("longitude is infinite", point(S3, "to", lng=float("inf")), "to: lng inf must be a finite number"),
    ("latitude is text", point(S3, "to", lat="42.45"), "to: lat '42.45' must be a finite number"),
    ("latitude is a boolean", point(S3, "to", lat=True), "must be a finite number"),
    ("longitude is missing", lambda t: t.edit(S3, lambda d: d["to"].pop("lng")), "to: missing 'lng'"),
    ("source is missing", lambda t: t.edit(S3, lambda d: d["to"].pop("source")), "to: missing 'source'"),
    ("source is blank", point(S3, "to", source="  "), 'to: source must be a non-empty string ("unverified" is allowed)'),
    ("point name is empty", point(S3, "to", name=""), "to: name must be a non-empty string"),
    ("a key in a point that is not in the schema", point(S3, "to", elevation=3), "to: unknown key 'elevation'"),
    ("point in the sea off Africa", point(S3, "to", lat=0.0, lng=0.0), "outside Spain, France and Portugal"),
    ("point in Italy", point(S3, "to", lat=45.4, lng=12.3), "outside Spain, France and Portugal"),
    ("latitude and longitude swapped", point(S3, "to", lat=-2.75, lng=42.45), "They look swapped"),
    ("a via point has no longitude", lambda t: t.edit(S2, lambda d: d["via"][0].pop("lng")), "via[0]: missing 'lng'"),
    ("a via point is outside the countries", via_point(S2, lat=10.0), "via[0]: lat 10.0, lng -2.38 is outside"),
    ("via is not a list", set_(S2, "via", "Mid"), "via must be a list"),
    ("seven via points", many_via, "via has 7 points, the most allowed is 6"),
    ("two waypoints more than 60 km apart", via_point(S2, lat=43.8, lng=-2.4), "km in a straight line (limit 60)"),
    ("from and to are the same place", point(S3, "to", lat=42.5, lng=-2.5), "less than 1 km apart"),
    ("waypoints spread over more than 1.2 degrees", spread_out, "the search bbox would be"),
    # extracts
    ("extract id is not in the allowlist", set_(S3, "extracts", ["navara"]), "extract 'navara' is not in scripts/geofabrik_extracts.json"),
    ("extract id in the real list but not the test list", set_(S3, "extracts", ["galicia"]), "extract 'galicia' is not in"),
    ("extracts is empty", set_(S3, "extracts", []), "extracts must be a non-empty list"),
    ("extracts is a string", set_(S3, "extracts", "navarra"), "extracts must be a non-empty list"),
    ("an extract twice", set_(S3, "extracts", ["navarra", "navarra"]), "extracts lists the same id twice"),
    ("extract id is a number", set_(S3, "extracts", [7]), "extract 7 is not in"),
    # stages join
    ("stage 3 starts 2.2 km from where stage 2 ends", point(S3, "from", lat=42.52), "from (Fixture Charlie) is 2.2 km from the end of stage 2"),
    ("stage 2 starts 2.2 km from where the hand-written stage 1 ends", point(S2, "from", lat=42.5705), "end of stage 1 (Fixture Bravo)"),
    # distance
    ("distance without a source", set_(S2, "distance_source", None), "distance_source must say where it comes from"),
    ("distance with a blank source", set_(S2, "distance_source", " "), "distance_source must say where it comes from"),
    ("distance without the key", lambda t: t.edit(S2, lambda d: d.pop("distance_source")), "distance_source must say where it comes from"),
    ("negative distance", set_(S2, "distance_km", -3), "distance_km -3 must be a number above 0"),
    ("distance of 500 km", set_(S2, "distance_km", 500), "distance_km 500 must be a number above 0"),
    ("distance as text", set_(S2, "distance_km", "21.4"), "distance_km '21.4' must be a number"),
    # duplicates
    ("two routes with one route_index", set_(DEMO, "route_index", 0), "is already used by"),
    ("two routes with one route_id", set_(DEMO, "route_id", "20000000-0000-0000-0000-000000000001"), "route_id '20000000-0000-0000-0000-000000000001' is already used by"),
    # files
    ("stage file is not JSON", lambda t: t.write(S3, "{ not json"), "03.json: not valid JSON"),
    ("stage file repeats a key", lambda t: t.write(S3, '{"n": 3, "n": 3}'), "the key 'n' appears twice in one object"),
    ("stage file is a list", lambda t: t.write(S3, "[]"), "03.json: must be a JSON object"),
    ("route.json is not JSON", lambda t: t.write(ROUTE, "nope"), "route.json: not valid JSON"),
    # route.json
    ("route.json lacks a key", drop(ROUTE, "clip_km"), "missing key 'clip_km'"),
    ("route.json has a key that is not in the schema", set_(ROUTE, "clipp_km", 6), "unknown key 'clipp_km'"),
    ("route_slug differs from the folder", set_(ROUTE, "route_slug", "camino-frances-2"), "must equal the folder name 'camino-frances'"),
    ("route_slug has capitals", set_(DEMO, "route_slug", "Demo_Route"), "route_slug 'Demo_Route' must be lower case"),
    ("route_index is negative", set_(ROUTE, "route_index", -1), "route_index -1 must be a whole number from 0 to 9999"),
    ("route_index is text", set_(ROUTE, "route_index", "0"), "route_index '0' must be a whole number"),
    ("route_id is not a UUID", set_(ROUTE, "route_id", "20000000-0000-0000-0000-00000000000"), "is not a lower case UUID"),
    ("name regex does not compile", set_(ROUTE, "route_name_regex", "camino (franc"), "route_name_regex is not a valid regular expression"),
    ("name regex is empty", set_(ROUTE, "route_name_regex", ""), "route_name_regex must be a non-empty string"),
    ("exclude regex does not compile", set_(ROUTE, "route_exclude_regex", "[SL"), "route_exclude_regex is not a valid regular expression"),
    ("exclude regex is a number", set_(ROUTE, "route_exclude_regex", 5), "route_exclude_regex must be a string"),
    ("buffer_km is 0", set_(ROUTE, "buffer_km", 0), "buffer_km 0 must be a number from 1 to 10"),
    ("buffer_km is 11", set_(ROUTE, "buffer_km", 11), "buffer_km 11 must be a number from 1 to 10"),
    ("clip_km is 0", set_(ROUTE, "clip_km", 0), "clip_km 0 must be a number above 0 and up to 30"),
    ("clip_km is 50", set_(ROUTE, "clip_km", 50), "clip_km 50 must be a number above 0"),
    ("margin_km is negative", set_(ROUTE, "margin_km", -1), "margin_km -1 must be a number from 0 to 30"),
    ("maxzoom is 16", set_(ROUTE, "maxzoom", 16), "maxzoom 16 must be a whole number from 1 to 15"),
    ("maxzoom is 15.5", set_(ROUTE, "maxzoom", 15.5), "maxzoom 15.5 must be a whole number"),
    # the rest of the catalog
    ("allowlist has a URL that is not Geofabrik's", bad_allowlist, "is not an https://download.geofabrik.de/"),
    ("catalog folder is missing", missing_catalog, "catalog folder not found"),
    ("catalog has no route.json", no_routes, "no route folder with a route.json"),
]


class Validation(Base):
    def test_every_validation_error_is_reported_and_nothing_is_written(self):
        for label, break_it, expected in VALIDATION_ERRORS:
            with self.subTest(label):
                self.fresh()
                break_it(self)
                rc, out, err = self.run_tool()
                self.assertEqual(rc, 1, f"exit code; stderr: {err}")
                self.assertIn(expected, err)
                self.assertIn("nothing was written", err)
                self.assertNothingWritten()
                # --check says the same and writes nothing either
                rc, _, err = self.run_tool("--check")
                self.assertEqual(rc, 1)
                self.assertIn(expected, err)
                self.assertNothingWritten()

    def test_all_problems_are_listed_at_once(self):
        self.edit(S3, lambda d: d.update(n=9, extracts=["nope"]))
        self.edit(S4, lambda d: d["to"].update(lat=0.0))
        rc, _, err = self.run_tool()
        self.assertEqual(rc, 1)
        self.assertIn("catalog/camino-frances/03.json: n is 9", err)
        self.assertIn("catalog/camino-frances/03.json: extract 'nope'", err)
        self.assertIn("catalog/camino-frances/04.json: to: lat 0.0, lng -3.0 is outside", err)
        self.assertIn("3 problem(s)", err)

    def test_a_wrong_entry_still_has_its_neighbours_checked(self):
        # stage 3 has a bad extract, and stage 4 starts nowhere near where it ends: both are reported
        self.edit(S3, lambda d: d.update(extracts=["nope"]))
        self.edit(S4, lambda d: d["from"].update(lat=42.6))
        rc, _, err = self.run_tool()
        self.assertEqual(rc, 1)
        self.assertIn("extract 'nope'", err)
        self.assertIn("from (Fixture Delta) is", err)
        self.assertNotIn("no catalog file yet", err)

    def test_a_valid_catalog_has_no_warnings(self):
        rc, out, err = self.run_tool("--check")
        self.assertEqual(rc, 1)  # no stage files yet
        self.assertNotIn("warning", err)
        self.generate()
        rc, _, err = self.run_tool("--check")
        self.assertEqual((rc, err), (0, ""))

    def test_a_distance_source_without_a_distance_is_only_a_warning(self):
        self.edit(S3, lambda d: d.update(distance_source="unverified"))
        rc, _, err = self.run_tool()
        self.assertEqual(rc, 0, err)
        self.assertIn("03.json: distance_source is set but distance_km is null", err)

    def test_a_gap_in_the_stage_numbers_is_only_a_warning(self):
        (self.catalog / "camino-frances" / "03.json").unlink()
        rc, _, err = self.run_tool()
        self.assertEqual(rc, 0, err)
        self.assertIn("no catalog file yet for stage(s) 3", err)
        # stage 4 is generated although 3 is missing; its join with stage 3 cannot be checked yet
        self.assertTrue((self.stages / "camino-frances-04.json").exists())

    def test_a_stage_beyond_the_hand_written_stage_1_is_checked_against_it(self):
        # stage 1 is validated like the others even though no file is written for it
        self.edit("camino-frances/01.json", lambda d: d["to"].update(lat=42.53))  # 2.3 km from where stage 2 starts
        rc, _, err = self.run_tool()
        self.assertEqual(rc, 1)
        self.assertIn("02.json: from (Fixture Bravo) is 2.3 km from the end of stage 1", err)

    def test_duplicate_slugs_and_stage_ids_are_caught(self):
        # Not reachable through the files (route_slug must equal its folder name), so exercise the check itself.
        cfg = {"route_slug": "r", "route_index": 1, "route_id": "20000000-0000-0000-0000-000000000005"}
        route = lambda: {"cfg": cfg, "ok": True, "where": "catalog/r/route.json", "stages": {2: {"where": "catalog/r/02.json"}}}
        report = make_stages.Report()
        make_stages.check_duplicates([route(), route()], report)
        joined = "\n".join(report.errors)
        for kind in ("route_slug", "route_index", "route_id", "slug", "stage_id"):
            self.assertIn(f"{kind} ", joined)
        self.assertIn("already used by", joined)

    def test_hand_written_stage_set_is_the_first_stage_of_the_camino_frances_only(self):
        self.assertEqual(make_stages.HAND_WRITTEN, {("camino-frances", 1)})


class CommittedFiles(unittest.TestCase):
    """The route settings and the allowlist that the real pipeline uses."""

    def test_route_json_is_valid_and_matches_stage_1(self):
        route_dir = OFFLINE_MAPS / "catalog" / "camino-frances"
        cfg = json.loads((route_dir / "route.json").read_text(encoding="utf-8"))
        report = make_stages.Report()
        self.assertTrue(make_stages.check_route(cfg, route_dir, "route.json", report), report.errors)
        stage_one = json.loads((OFFLINE_MAPS / "stages" / "camino-frances-01.json").read_text(encoding="utf-8"))
        self.assertEqual(cfg["route_id"], stage_one["route_id"])
        self.assertEqual(make_stages.stage_id(cfg, 1), stage_one["stage_id"])  # stages 1 to 3 keep the ids of supabase/seed.sql
        self.assertEqual(make_stages.stage_id(cfg, 2), "40000000-0000-0000-0000-000000000002")
        self.assertEqual(make_stages.stage_id(cfg, 3), "40000000-0000-0000-0000-000000000003")

    def test_route_regexes_pick_the_francés_and_not_the_local_trails(self):
        import re
        cfg = json.loads((OFFLINE_MAPS / "catalog" / "camino-frances" / "route.json").read_text(encoding="utf-8"))
        include = re.compile(cfg["route_name_regex"], re.IGNORECASE)
        exclude = re.compile(cfg["route_exclude_regex"], re.IGNORECASE)
        for label in ("Camino Francés", "Camiño Francés", "camino frances", "Chemin Navarrais", "Nafar Bidea", "Camino Francés (Alternative)"):
            self.assertTrue(include.search(label), label)
            self.assertFalse(exclude.search(label), label)
        for label in ("Camino de las Bordas SL-NA 53B", "Camino Francés PR-NA 12", "pr-lr 7", "Variante SL-M 3"):
            self.assertTrue(exclude.search(label), label)
        for label in ("GR 65", "Camino Navarro", "Voie de la Nive", "Camino de las Bordas SL-NA 53B"):
            self.assertFalse(include.search(label), label)  # the over-selection of stage 1

    def test_allowlist_is_exactly_the_agreed_extracts(self):
        allow = json.loads((OFFLINE_MAPS / "scripts" / "geofabrik_extracts.json").read_text(encoding="utf-8"))
        spain = ["navarra", "la-rioja", "pais-vasco", "castilla-y-leon", "galicia", "cantabria", "asturias", "aragon"]
        expected = {f"{i}": f"https://download.geofabrik.de/europe/spain/{i}-latest.osm.pbf" for i in spain}
        expected["aquitaine"] = "https://download.geofabrik.de/europe/france/aquitaine-latest.osm.pbf"
        expected["portugal"] = "https://download.geofabrik.de/europe/portugal-latest.osm.pbf"
        self.assertEqual(allow, expected)
        report = make_stages.Report()
        self.assertEqual(make_stages.load_allowlist(OFFLINE_MAPS / "scripts" / "geofabrik_extracts.json", report), expected)
        self.assertEqual(report.errors, [])

    def test_stage_1_urls_are_in_the_allowlist(self):
        allow = json.loads((OFFLINE_MAPS / "scripts" / "geofabrik_extracts.json").read_text(encoding="utf-8"))
        stage_one = json.loads((OFFLINE_MAPS / "stages" / "camino-frances-01.json").read_text(encoding="utf-8"))
        self.assertTrue(set(stage_one["osm_extracts"]) <= set(allow.values()))

    def test_the_catalog_that_is_committed_is_valid(self):
        # Whatever stage entries are in catalog/ right now must pass the same checks as the fixture.
        report = make_stages.Report()
        allow = make_stages.load_allowlist(OFFLINE_MAPS / "scripts" / "geofabrik_extracts.json", report)
        routes = make_stages.read_catalog(OFFLINE_MAPS / "catalog", allow, report)
        for route in routes:
            if route["ok"]:
                make_stages.check_chain(route, report)
        make_stages.check_duplicates(routes, report)
        self.assertEqual(report.errors, [])


class CommandLine(Base):
    def run_script(self, *flags, cwd=None):
        return subprocess.run([sys.executable, str(SCRIPT), "--catalog", str(self.catalog), "--stages", str(self.stages),
                               "--extracts", str(self.allowlist), *flags],
                              capture_output=True, text=True, encoding="utf-8", cwd=cwd or self.root)

    def test_exit_codes_as_a_script(self):
        proc = self.run_script("--check")
        self.assertEqual(proc.returncode, 1)  # nothing generated yet
        self.assertIn("does not exist", proc.stderr)
        proc = self.run_script()
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("wrote ", proc.stdout)
        proc = self.run_script("--check")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual(proc.stderr, "")

    def test_invalid_catalog_exits_1_without_writing(self):
        self.edit(S3, lambda d: d.update(extracts=["nope"]))
        proc = self.run_script()
        self.assertEqual(proc.returncode, 1)
        self.assertIn("ERROR: catalog/camino-frances/03.json", proc.stderr)
        self.assertFalse(self.stages.exists())

    def test_unknown_option_is_a_usage_error(self):
        self.assertEqual(self.run_script("--nope").returncode, 2)

    def test_default_paths_are_found_from_any_working_directory(self):
        proc = subprocess.run([sys.executable, str(SCRIPT), "--check"], capture_output=True, text=True, encoding="utf-8", cwd=self.root)
        self.assertNotIn("catalog folder not found", proc.stderr)
        self.assertNotIn("cannot read the file", proc.stderr)


if __name__ == "__main__":
    unittest.main()
