"""Tests for scripts/check_stages.py, the validator for every stages/*.json.

The valid files these tests start from are what scripts/make_stages.py writes for test/fixtures/catalog,
so the two scripts are also tested against each other. Standard library only.
Run from tools/offline-maps:  python3 -m unittest discover -s test
"""
import contextlib
import io
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
OFFLINE_MAPS = HERE.parent
sys.path.insert(0, str(OFFLINE_MAPS / "scripts"))

import check_stages  # noqa: E402
import make_stages  # noqa: E402

CATALOG = HERE / "fixtures" / "catalog"
ALLOWLIST = HERE / "fixtures" / "geofabrik_extracts.json"
SCRIPT = OFFLINE_MAPS / "scripts" / "check_stages.py"
STAGE = "camino-frances-03"  # no calibration, two waypoints
OTHER = "demo-route-01"


class Base(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = Path(self._tmp.name)
        self.stages = self.root / "stages"
        self.allowlist = self.root / "geofabrik_extracts.json"
        self.fresh()

    def fresh(self):
        shutil.rmtree(self.stages, ignore_errors=True)
        shutil.copy(ALLOWLIST, self.allowlist)
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            rc = make_stages.main(["--catalog", str(CATALOG), "--stages", str(self.stages), "--extracts", str(self.allowlist)])
        assert rc == 0

    def load(self, slug=STAGE):
        return json.loads((self.stages / f"{slug}.json").read_text(encoding="utf-8"))

    def save(self, doc, slug=STAGE):
        (self.stages / f"{slug}.json").write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    def problems(self):
        return check_stages.check_all(self.stages, self.allowlist)[0]

    def change(self, mutate, slug=STAGE):
        doc = self.load(slug)
        mutate(doc)
        self.save(doc, slug)

    def assertProblem(self, text, label=""):
        found = self.problems()
        self.assertTrue(any(text in p for p in found), f"{label}: expected a problem containing {text!r}, got {found}")


class ValidFiles(Base):
    def test_generated_files_pass(self):
        problems, count = check_stages.check_all(self.stages, self.allowlist)
        self.assertEqual(problems, [])
        self.assertEqual(count, 5)

    def test_calibrated_generated_file_passes(self):
        def calibrate(doc):
            doc["quality"] = {"min_tiles": 400, "max_tiles": 1500, "min_size_mb": 1, "max_size_mb": 6,
                              "required_layers": ["building", "place"], "max_change_ratio": 1.5, "max_osm_age_days": 45}
            doc["render_checks"][0]["min_features"] = {"poi": 12, "building": 4}
            doc["render_checks"][0]["min_labels"] = {"place": 1}
            doc["render_allow_errors"] = ["^console: Failed to load resource"]
            doc["render_checks"].append({"name": "A pass z13", "at": [-2.6, 42.5, 13], "min_features": {"mountain_peak": 4}})
        self.change(calibrate)
        self.assertEqual(self.problems(), [])

    def test_committed_stage_1_passes_with_the_real_allowlist(self):
        # The hand-written stage has none of the newer keys. Copy it so other stage files do not matter here.
        shutil.rmtree(self.stages)
        self.stages.mkdir()
        for name in ("camino-frances-01.json", "camino-frances-01.route.geojson"):
            shutil.copy(OFFLINE_MAPS / "stages" / name, self.stages / name)
        problems, count = check_stages.check_all(self.stages, OFFLINE_MAPS / "scripts" / "geofabrik_extracts.json")
        self.assertEqual((problems, count), ([], 1))

    def test_stage_1_urls_are_accepted_even_if_the_allowlist_lacks_them(self):
        shutil.rmtree(self.stages)
        self.stages.mkdir()
        for name in ("camino-frances-01.json", "camino-frances-01.route.geojson"):
            shutil.copy(OFFLINE_MAPS / "stages" / name, self.stages / name)
        self.allowlist.write_text(json.dumps({"portugal": "https://download.geofabrik.de/europe/portugal-latest.osm.pbf"}), encoding="utf-8")
        self.assertEqual(self.problems(), [])


def doc_set(key, value):
    return lambda doc: doc.__setitem__(key, value)


def doc_drop(key):
    return lambda doc: doc.pop(key)


def view(i, key, value):
    return lambda doc: doc["render_checks"][i].__setitem__(key, value)


UUID_CAPS = "40000000-0000-0000-0000-00000000000A"
CASES = [
    # slug, numbers, ids
    ("slug without a number", doc_set("slug", "camino-frances"), "slug 'camino-frances' must look like <route_slug>-<NN>"),
    ("slug with capitals", doc_set("slug", "Camino_Frances-03"), "must look like <route_slug>-<NN>"),
    ("slug with one digit", doc_set("slug", "camino-frances-3"), "must look like <route_slug>-<NN>"),
    ("slug of another stage", doc_set("slug", "camino-frances-04"), "slug 'camino-frances-04' does not match route_slug 'camino-frances' and stage_number 3"),
    ("slug of another route", doc_set("route_slug", "demo-route"), "does not match route_slug 'demo-route'"),
    ("route_slug with capitals", doc_set("route_slug", "Camino"), "route_slug 'Camino' must be lower case"),
    ("stage_number 0", doc_set("stage_number", 0), "stage_number 0 must be a whole number from 1 to 99"),
    ("stage_number 100", doc_set("stage_number", 100), "stage_number 100 must be a whole number from 1 to 99"),
    ("stage_number as text", doc_set("stage_number", "3"), "stage_number '3' must be a whole number"),
    ("stage_number as boolean", doc_set("stage_number", True), "must be a whole number"),
    ("route_id in capitals", doc_set("route_id", "20000000-0000-0000-0000-00000000000A"), "is not a lower case UUID"),
    ("stage_id too short", doc_set("stage_id", "40000000-0000-0000-0000-00000003"), "stage_id '40000000-0000-0000-0000-00000003' is not a lower case UUID"),
    ("stage_id in capitals", doc_set("stage_id", UUID_CAPS), "is not a lower case UUID"),
    ("stage_id of another stage", doc_set("stage_id", "40000000-0000-0000-0000-000000000009"), "does not follow 40000000-0000-0000-<route index>-<stage number> for stage 3"),
    ("name empty", doc_set("name", " "), "name must be a non-empty string"),
    ("coastal as text", doc_set("coastal", "no"), "coastal must be true or false"),
    # extracts
    ("extract not in the allowlist", doc_set("osm_extracts", ["https://example.com/spain.osm.pbf"]), "osm_extracts: https://example.com/spain.osm.pbf is not in scripts/geofabrik_extracts.json"),
    ("extract of a region that is not in the fixture allowlist", doc_set("osm_extracts", ["https://download.geofabrik.de/europe/spain/galicia-latest.osm.pbf"]), "galicia-latest.osm.pbf is not in"),
    ("extracts empty", doc_set("osm_extracts", []), "osm_extracts must be a non-empty list of URLs"),
    ("extracts a string", doc_set("osm_extracts", "navarra"), "osm_extracts must be a non-empty list of URLs"),
    ("extract listed twice", lambda d: d.__setitem__("osm_extracts", d["osm_extracts"] * 2), "osm_extracts lists the same URL twice"),
    # bbox
    ("bbox west of east swapped", lambda d: d.__setitem__("search_bbox", [d["search_bbox"][2], d["search_bbox"][1], d["search_bbox"][0], d["search_bbox"][3]]), "is not ordered"),
    ("bbox south above north", lambda d: d.__setitem__("search_bbox", [d["search_bbox"][0], d["search_bbox"][3], d["search_bbox"][2], d["search_bbox"][1]]), "is not ordered"),
    ("bbox with 3 numbers", doc_set("search_bbox", [-2.9, 42.3, -2.3]), "search_bbox must be a list of 4 numbers"),
    ("bbox with text", doc_set("search_bbox", [-2.9, "42.3", -2.3, 42.6]), "search_bbox must be a list of 4 numbers"),
    ("bbox with NaN", doc_set("search_bbox", [-2.9, 42.3, float("nan"), 42.6]), "search_bbox must be a list of 4 numbers"),
    ("bbox latitude beyond 90", doc_set("search_bbox", [-2.9, 42.3, -2.3, 95]), "is not ordered"),
    ("bbox 1.2 degrees wide", doc_set("search_bbox", [-3.0, 42.3, -1.8, 42.6]), "search_bbox is 1.20 degrees wide; the limit is 1.2"),
    ("bbox 1.5 degrees high", doc_set("search_bbox", [-2.9, 41.3, -2.3, 42.8]), "degrees high; the limit is 1.2"),
    # zoom, buffer, clip, minimum
    ("maxzoom 16", doc_set("maxzoom", 16), "maxzoom 16 must be a whole number from 1 to 15"),
    ("maxzoom 0", doc_set("maxzoom", 0), "maxzoom 0 must be a whole number from 1 to 15"),
    ("maxzoom as text", doc_set("maxzoom", "15"), "maxzoom '15' must be a whole number"),
    ("maxzoom fractional", doc_set("maxzoom", 14.5), "maxzoom 14.5 must be a whole number"),
    ("buffer_km 0.5", doc_set("buffer_km", 0.5), "buffer_km 0.5 must be a number from 1 to 10"),
    ("buffer_km 11", doc_set("buffer_km", 11), "buffer_km 11 must be a number from 1 to 10"),
    ("buffer_km as text", doc_set("buffer_km", "3"), "buffer_km '3' must be a number from 1 to 10"),
    ("clip_km 0", doc_set("clip_km", 0), "clip_km 0 must be a number above 0 and up to 30"),
    ("clip_km 40", doc_set("clip_km", 40), "clip_km 40 must be a number above 0"),
    ("min_route_km 0", doc_set("min_route_km", 0), "min_route_km 0 must be a number above 0"),
    # regexes
    ("name regex does not compile", doc_set("route_name_regex", "camino (franc"), "route_name_regex is not a valid regular expression"),
    ("name regex empty", doc_set("route_name_regex", ""), "route_name_regex must be a non-empty string"),
    ("exclude regex does not compile", doc_set("route_exclude_regex", "[SL"), "route_exclude_regex is not a valid regular expression"),
    ("exclude regex not text", doc_set("route_exclude_regex", 3), "route_exclude_regex must be a string"),
    # keys
    ("a misspelt optional key", lambda d: d.__setitem__("clip_kn", d.pop("clip_km")), "unknown key 'clip_kn'"),
    ("an unknown key", doc_set("notes", "x"), "unknown key 'notes'"),
    ("generated_from empty", doc_set("generated_from", ""), "generated_from must be a non-empty string"),
    # render checks
    ("no render views", doc_set("render_checks", []), "render_checks must be a non-empty list of views"),
    ("render views not a list", doc_set("render_checks", {}), "render_checks must be a non-empty list of views"),
    ("a view that is not an object", doc_set("render_checks", ["x"]), "render_checks[0] must be an object"),
    ("a view outside the bbox", view(0, "at", [10.0, 50.0, 15]), "render_checks[0]: at [10.0, 50.0] is outside search_bbox"),
    ("a view with a bad position", view(0, "at", [-2.5]), "render_checks[0]: at must be [longitude, latitude]"),
    ("a view with text coordinates", view(0, "at", ["-2.5", "42.5", 15]), "at must be [longitude, latitude]"),
    ("a view at zoom 30", view(1, "at", [-2.75, 42.45, 30]), "zoom 30 must be from 0 to 22"),
    ("a view with an unknown key", view(0, "min_feature", {"poi": 1}), "render_checks[0]: unknown key 'min_feature'"),
    ("a view with no name", view(0, "name", ""), "render_checks[0]: name must be a non-empty string"),
    ("a negative floor", view(0, "min_features", {"poi": -1}), "render_checks[0]: min_features must map layer names to whole numbers"),
    ("a fractional floor", view(1, "min_labels", {"place": 1.5}), "render_checks[1]: min_labels must map layer names to whole numbers"),
    ("floors as a list", view(0, "min_features", ["poi"]), "min_features must map layer names"),
    # quality
    ("quality not an object", doc_set("quality", [1]), "quality must be an object"),
    ("quality with a misspelt gate", doc_set("quality", {"min_tile": 1}), "quality: unknown key 'min_tile'"),
    ("quality with min above max (tiles)", doc_set("quality", {"min_tiles": 900, "max_tiles": 100}), "quality.min_tiles (900) is above quality.max_tiles (100)"),
    ("quality with min above max (size)", doc_set("quality", {"min_size_mb": 9, "max_size_mb": 2}), "quality.min_size_mb (9) is above quality.max_size_mb (2)"),
    ("quality with a negative number", doc_set("quality", {"min_tiles": -5}), "quality.min_tiles must be a number above 0"),
    ("quality with layers not a list", doc_set("quality", {"required_layers": "poi"}), "quality.required_layers must be a list of layer names"),
    # allowed console errors
    ("allowed errors not a list", doc_set("render_allow_errors", "x"), "render_allow_errors must be a list of regular expressions"),
    ("allowed error that is not a regex", doc_set("render_allow_errors", ["("]), "render_allow_errors entry is not a valid regular expression"),
    # waypoints
    ("one waypoint", lambda d: d.__setitem__("waypoints", d["waypoints"][:1]), "waypoints must be a list of at least 2"),
    ("a waypoint outside the bbox", lambda d: d["waypoints"][0].__setitem__("at", [10.0, 50.0]), "waypoints[0] (Fixture Charlie) is outside search_bbox"),
    ("a waypoint without a name", lambda d: d["waypoints"][1].pop("name"), 'waypoints[1] must be {"name": text, "at": [longitude, latitude]}'),
]
# Written out here, not read from check_stages, so that the tests pin the rule instead of repeating it.
# These are the keys stage 1 (hand-written) has, minus the optional `quality`.
REQUIRED_KEYS = ["buffer_km", "coastal", "fallback_route", "maxzoom", "name", "osm_extracts", "render_checks", "route_id",
                 "route_name_regex", "route_slug", "search_bbox", "slug", "stage_id", "stage_number"]
# What a generated stage (one with generated_from) must also have, because stage 1 does not.
GENERATED_KEYS = ["clip_km", "min_route_km", "waypoints"]
for key in REQUIRED_KEYS:
    CASES.append((f"{key} missing", doc_drop(key), f"missing key '{key}'"))
for key in GENERATED_KEYS:
    CASES.append((f"{key} missing from a generated stage", doc_drop(key), f"missing key '{key}' (every generated stage has it"))


class InvalidFiles(Base):
    # Giving stage 3 another route's slug also makes that route's own files disagree with it, which is
    # correct to report; every other case concerns one file only.
    TOUCHES_OTHER_FILES = {"slug of another route"}

    def test_the_key_lists_are_the_agreed_ones(self):
        self.assertEqual(sorted(check_stages.REQUIRED), REQUIRED_KEYS)
        self.assertEqual(sorted(check_stages.GENERATED_REQUIRE), GENERATED_KEYS)
        # the optional keys: the newer ones that stage 1 lacks, quality, and the render error allowlist
        self.assertEqual(sorted(check_stages.OPTIONAL), sorted([
            "route_exclude_regex", "clip_km", "min_route_km", "quality", "waypoints", "render_allow_errors", "generated_from"]))
        # the keys the build reads from a generated file are the ones the generator writes
        doc = self.load()
        self.assertEqual(set(doc) - set(check_stages.OPTIONAL), set(check_stages.REQUIRED))

    def test_every_rule_reports_a_problem_naming_the_file(self):
        for label, mutate, expected in CASES:
            with self.subTest(label):
                self.fresh()
                self.change(mutate)
                found = self.problems()
                self.assertTrue(any(expected in p for p in found), f"expected {expected!r} in {found}")
                self.assertTrue(any(p.startswith(f"{self.stages.name}/{STAGE}.json: ") for p in found if expected in p), found)
                if label not in self.TOUCHES_OTHER_FILES:
                    self.assertFalse([p for p in found if f"/{OTHER}.json" in p], found)  # the other stage files are still fine

    def test_a_stage_file_without_generated_from_does_not_need_the_generated_keys(self):
        # stage 1 is written by hand: no clip_km, min_route_km or waypoints
        def hand_written(doc):
            for key in ("generated_from", "clip_km", "min_route_km", "waypoints", "route_exclude_regex"):
                doc.pop(key)
        self.change(hand_written)
        self.assertEqual(self.problems(), [])

    def test_file_name_must_be_the_slug(self):
        (self.stages / f"{STAGE}.json").rename(self.stages / "stage-three.json")
        self.assertProblem(f"the file must be named {STAGE}.json", "renamed file")

    def test_duplicate_slug(self):
        shutil.copy(self.stages / f"{STAGE}.json", self.stages / "copy.json")
        self.assertProblem(f"slug {STAGE} is already used by {STAGE}.json")

    def test_duplicate_stage_id(self):
        doc = self.load()
        doc.update(slug="camino-frances-05", stage_number=5)  # keeps the stage_id of stage 3
        self.save(doc, "camino-frances-05")
        self.assertProblem("stage_id 40000000-0000-0000-0000-000000000003 is already used by")

    def test_one_route_slug_has_one_route_id(self):
        self.change(doc_set("route_id", "20000000-0000-0000-0000-0000000000aa"))
        self.assertProblem("differs from 20000000-0000-0000-0000-000000000001 of the other camino-frances stages")

    def test_one_route_id_belongs_to_one_route_slug(self):
        self.change(doc_set("route_id", "20000000-0000-0000-0000-000000000001"), OTHER)
        self.assertProblem("is also used by route camino-frances")

    def test_stage_file_that_is_not_json(self):
        (self.stages / f"{STAGE}.json").write_text("{ not json", encoding="utf-8")
        self.assertProblem(f"{STAGE}.json: not valid JSON")

    def test_stage_file_with_a_repeated_key(self):
        (self.stages / f"{STAGE}.json").write_text('{"slug": "a", "slug": "b"}', encoding="utf-8")
        self.assertProblem("the key 'slug' appears twice in one object")

    def test_stage_file_that_is_a_list(self):
        (self.stages / f"{STAGE}.json").write_text("[]", encoding="utf-8")
        self.assertProblem("must be a JSON object")

    def test_no_stage_files_is_a_problem(self):
        for path in self.stages.glob("*.json"):
            path.unlink()
        self.assertProblem("no stage files (*.json) found")
        shutil.rmtree(self.stages)
        self.assertProblem("no stage files (*.json) found")

    def test_allowlist_that_cannot_be_read(self):
        self.allowlist.write_text("{", encoding="utf-8")
        self.assertProblem("geofabrik_extracts.json: not valid JSON")
        self.allowlist.write_text("[]", encoding="utf-8")
        self.assertProblem("must map extract ids to URLs")
        self.allowlist.unlink()
        self.assertProblem("cannot read the file")

    def test_all_problems_are_listed_not_just_the_first(self):
        def many(doc):
            doc["maxzoom"] = 18
            doc["buffer_km"] = 20
            doc["coastal"] = "x"
        self.change(many)
        found = self.problems()
        self.assertEqual(len([p for p in found if p.startswith(f"{self.stages.name}/{STAGE}.json")]), 3)


class Fallback(Base):
    BBOX = (-2.9, 42.3, -2.3, 42.6)

    def check(self, content, name="route.geojson", bbox=BBOX):
        if content is not None:
            (self.stages / name).write_text(content if isinstance(content, str) else json.dumps(content), encoding="utf-8")
        errors = []
        check_stages.check_fallback(errors, self.stages, name, bbox)
        return errors

    def test_missing_file(self):
        self.assertEqual(self.check(None, "nothing.geojson"), ["fallback_route nothing.geojson does not exist"])

    def test_not_json(self):
        self.assertIn("not valid JSON", self.check("{")[0])

    def test_not_geojson(self):
        self.assertIn("is not GeoJSON with coordinates", self.check({"type": "Feature", "properties": {}})[0])
        self.assertIn("is not GeoJSON with coordinates", self.check([1, 2])[0])
        self.assertIn("is not GeoJSON with coordinates", self.check({"type": "LineString", "coordinates": []})[0])

    def test_needs_two_points_inside_the_bbox(self):
        line = lambda *pts: {"type": "LineString", "coordinates": [list(p) for p in pts]}
        self.assertEqual(self.check(line((-2.5, 42.4), (-2.4, 42.5))), [])
        self.assertIn("has 1 point(s) inside search_bbox, at least 2 are needed", self.check(line((-2.5, 42.4), (5.0, 50.0)))[0])
        self.assertIn("has 0 point(s) inside", self.check(line((5.0, 50.0), (6.0, 51.0)))[0])
        self.assertEqual(self.check(line((-2.9, 42.3), (-2.3, 42.6))), [])  # the corners count

    def test_every_kind_of_geojson_is_read(self):
        coords = [[-2.5, 42.4], [-2.4, 42.5]]
        line = {"type": "LineString", "coordinates": coords}
        forms = {
            "geometry": line,
            "feature": {"type": "Feature", "properties": {}, "geometry": line},
            "collection": {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {}, "geometry": line}]},
            "two features": {"type": "FeatureCollection", "features": [
                {"type": "Feature", "properties": {}, "geometry": {"type": "Point", "coordinates": coords[0]}},
                {"type": "Feature", "properties": {}, "geometry": {"type": "Point", "coordinates": coords[1]}}]},
            "multiline": {"type": "MultiLineString", "coordinates": [[coords[0]], [coords[1]]]},
            "polygon": {"type": "Polygon", "coordinates": [[[-2.5, 42.4], [-2.4, 42.4], [-2.4, 42.5], [-2.5, 42.4]]]},
            "geometry collection": {"type": "GeometryCollection", "geometries": [line]},
            "three-dimensional positions": {"type": "LineString", "coordinates": [[-2.5, 42.4, 300], [-2.4, 42.5, 310]]},
        }
        for label, geo in forms.items():
            with self.subTest(label):
                self.assertEqual(self.check(geo), [])

    def test_name_must_be_a_file_next_to_the_stage_file(self):
        for name in ("../route.geojson", "sub/route.geojson", "/etc/passwd", "", None):
            with self.subTest(name):
                errors = []
                check_stages.check_fallback(errors, self.stages, name, self.BBOX)
                self.assertIn("fallback_route must be a file name next to the stage file", errors[0])

    def test_in_a_whole_stage_file(self):
        (self.stages / f"{STAGE}.route.geojson").write_text("{}", encoding="utf-8")
        self.assertProblem("is not GeoJSON with coordinates")
        (self.stages / f"{STAGE}.route.geojson").unlink()
        self.assertProblem(f"fallback_route {STAGE}.route.geojson does not exist")
        self.change(doc_set("fallback_route", "../x.geojson"))
        self.assertProblem("fallback_route must be a file name next to the stage file")


class CommandLine(Base):
    def run_script(self, *args):
        return subprocess.run([sys.executable, str(SCRIPT), "--stages", str(self.stages), "--extracts", str(self.allowlist), *args],
                              capture_output=True, text=True, encoding="utf-8", cwd=self.root)

    def test_exit_code_0_and_a_one_line_summary(self):
        proc = self.run_script()
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual(proc.stdout, "check_stages: 5 stage file(s) OK\n")
        self.assertEqual(proc.stderr, "")

    def test_exit_code_1_and_every_problem_on_stderr(self):
        self.change(doc_set("maxzoom", 16))
        self.change(doc_set("buffer_km", 0), OTHER)
        proc = self.run_script()
        self.assertEqual(proc.returncode, 1)
        self.assertIn(f"ERROR: {self.stages.name}/{STAGE}.json: maxzoom 16", proc.stderr)
        self.assertIn(f"ERROR: {self.stages.name}/{OTHER}.json: buffer_km 0", proc.stderr)
        self.assertIn("check_stages: 2 problem(s)", proc.stderr)
        self.assertEqual(proc.stdout, "")

    def test_unknown_option_is_a_usage_error(self):
        self.assertEqual(self.run_script("--nope").returncode, 2)

    def test_default_folder_is_stages_next_to_the_scripts(self):
        proc = subprocess.run([sys.executable, str(SCRIPT)], capture_output=True, text=True, encoding="utf-8", cwd=self.root)
        self.assertNotIn("no stage files", proc.stderr)  # found the committed stage 1 from another working directory


if __name__ == "__main__":
    unittest.main()
