"""Tests for scripts/route_from_osm.py on a made-up OpenStreetMap extract.

The extract is written at test time with osmium.SimpleWriter (no binary fixture in the repository)
and the script is run the way build_stage.sh runs it, as a separate process, so the exit codes are
the real ones. Needs the packages in requirements.txt; on a machine without them the tests are
skipped, but under CI (the CI variable is set) a missing package is an error.

Run from tools/offline-maps:  python3 -m unittest discover -s test
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

try:
    import osmium
    from osmium.osm import mutable
    from shapely.geometry import Point, shape
    HAVE_GEO = True
except ImportError:
    HAVE_GEO = False
    if os.environ.get("CI"):
        raise  # CI installs requirements.txt; a missing package must not turn into silent skips

HERE = Path(__file__).resolve().parent
SCRIPT = HERE.parent / "scripts" / "route_from_osm.py"

# The made-up area sits at 43 N, 1.0 to 1.3 W. One degree of longitude is about 81 km there,
# one degree of latitude about 111 km.
SEARCH_BBOX = [-1.45, 42.85, -0.85, 43.25]
FALLBACK = [[-1.00, 43.00], [-1.30, 43.00]]  # the hand-placed line, 24 km long

# way id -> (start, end) as (lon, lat); every way gets a node about every 1 km
WAYS = {
    1001: ((-1.00, 43.000), (-1.15, 43.000)),  # section A of the route, 12 km
    1002: ((-1.15, 43.000), (-1.30, 43.000)),  # section B, 12 km
    1003: ((-1.05, 43.009), (-1.25, 43.009)),  # alternative variant, 1 km north, 16 km
    1004: ((-1.10, 43.012), (-1.14, 43.012)),  # local trail "Camino de las Bordas SL-NA 53B"
    1005: ((-1.20, 43.015), (-1.22, 43.015)),  # local branch "PR-NA 120" (name also says Camino Francés)
    1006: ((-1.18, 43.020), (-1.22, 43.020)),  # trail that only hangs under the excluded super-route
    1007: ((-1.00, 43.180), (-1.30, 43.180)),  # far section, 20 km north of the line, 24 km long
    1008: ((-1.02, 42.997), (-1.28, 42.997)),  # bicycle route, just south of the line
    1009: ((-1.00, 42.990), (-1.30, 42.990)),  # GR 10, matches nothing
    1010: ((-1.07, 43.020), (-1.09, 43.020)),  # "PR-NA 9", child of a relation that is kept
    1011: ((-1.10, 43.005), (-1.12, 43.005)),  # links, 2 km
    1012: ((-1.40, 42.900), (-1.43, 42.900)),  # a short route, 2.4 km
    1013: ((-1.15, 43.000), (-1.15, 43.200)),  # spur that runs 22 km north: clip_km must cut it
    1014: ((-1.26, 43.018), (-1.28, 43.018)),  # local branch with a lower-case "pr-na 77"
    1015: ((-0.95, 42.880), (-1.10, 42.880)),  # a medium route, 12.3 km: under the default minimum of 15
    1016: ((-0.95, 42.990), (-0.70, 42.990)),  # runs out of the search bbox (its east edge is at -0.85)
}

# relation id -> (tags, members). type "route" or "superroute" is added below.
RELATIONS = {
    100: ("Camino Francés (A)", [("w", 1001)]),
    101: ("Camino Francés (B)", [("w", 1002)]),
    102: ("Camino Francés", [("r", 100), ("r", 101)]),  # super-route: its children are reached through it
    103: ("Camino Francés (Alternative)", [("w", 1003)]),
    104: ("Camino de las Bordas SL-NA 53B", [("w", 1004)]),
    105: ("Camino Francés - Ramal PR-NA 120", [("w", 1005)]),
    106: ("Camino Francés PR-LR 7 (comarca)", [("r", 107), ("r", 103)]),  # excluded; 103 is also kept on its own
    107: ("Sendero local de prueba", [("w", 1006)]),  # only reachable through 106
    108: ("Camino Francés (far)", [("w", 1007)]),
    109: ("Camino Francés bici", [("w", 1008)]),  # route=bicycle
    110: ("GR 10", [("w", 1009)]),
    112: ("Short test route", [("w", 1012)]),
    113: ("Camino Francés (links)", [("w", 1011), ("r", 114)]),  # kept; its child 114 is a PR trail
    114: ("Local PR-NA 9", [("w", 1010)]),
    115: ("Camino Francés (spur)", [("w", 1013)]),
    116: ("Camino Francés - ramal pr-na 77", [("w", 1014)]),
    117: ("Medium test route", [("w", 1015)]),
    118: ("Camino de Santiago (beyond the bbox)", [("w", 1016)]),  # only the broad regex of stage 1 matches this
}
SUPER_ROUTES = {102, 106}
BICYCLE = {109}

# Stage 1 is written like this: the broad regex, none of the newer keys.
STAGE1_STYLE = {
    "slug": "synthetic-legacy",
    "route_name_regex": "camino|santiago|compostel|saint[- ]jacques|jacquaire|\\bgr ?65\\b|jakobsweg|done jakue",
    "search_bbox": SEARCH_BBOX,
    "fallback_route": "fallback.route.geojson",
}
# The generated stages (catalog/camino-frances/route.json).
NEW_STYLE = {
    "slug": "synthetic-new",
    "route_name_regex": "camino franc[eé]s|camiño franc[eé]s|chemin navarrais|nafar bidea",
    "route_exclude_regex": "\\b(SL|PR)-[A-Z]{1,3} ?\\d",
    "clip_km": 6,
    "search_bbox": SEARCH_BBOX,
    "fallback_route": "fallback.route.geojson",
}


def nodes_between(a, b, step=0.01):
    n = max(1, round(max(abs(b[0] - a[0]), abs(b[1] - a[1])) / step))
    return [(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n) for i in range(n + 1)]


def write_extract(path):
    """Write the made-up area as a PBF: nodes, then ways, then relations."""
    node_id = 0
    nodes, way_nodes = {}, {}
    for way_id, (a, b) in WAYS.items():
        way_nodes[way_id] = []
        for location in nodes_between(a, b):
            node_id += 1
            nodes[node_id] = location
            way_nodes[way_id].append(node_id)
    with osmium.SimpleWriter(str(path)) as writer:
        for nid, location in nodes.items():
            writer.add_node(mutable.Node(id=nid, location=location))
        for way_id, ids in way_nodes.items():
            writer.add_way(mutable.Way(id=way_id, nodes=ids, tags={"highway": "path"}))
        for rel_id, (name, members) in RELATIONS.items():
            tags = {"type": "superroute" if rel_id in SUPER_ROUTES else "route",
                    "route": "bicycle" if rel_id in BICYCLE else "hiking",
                    "name": name}
            writer.add_relation(mutable.Relation(id=rel_id, members=[(t, ref, "") for t, ref in members], tags=tags))


def middle(way_id):
    (x1, y1), (x2, y2) = WAYS[way_id]
    return Point((x1 + x2) / 2, (y1 + y2) / 2)


@unittest.skipUnless(HAVE_GEO, "needs the packages in requirements.txt (pip install -r requirements.txt)")
class RouteFromOsm(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._tmp = tempfile.TemporaryDirectory()
        cls.dir = Path(cls._tmp.name)
        cls.pbf = cls.dir / "area.osm.pbf"
        write_extract(cls.pbf)
        (cls.dir / "fallback.route.geojson").write_text(json.dumps({
            "type": "FeatureCollection",
            "features": [{"type": "Feature", "properties": {}, "geometry": {"type": "LineString", "coordinates": FALLBACK}}],
        }))

    @classmethod
    def tearDownClass(cls):
        cls._tmp.cleanup()

    def run_script(self, stage, *, drop=()):
        """Run route_from_osm.py on a stage file. Returns (exit code, stdout, stderr, feature or None)."""
        stage = {k: v for k, v in stage.items() if k not in drop}
        stage_path = self.dir / "stage.json"
        out_path = self.dir / "route.geojson"
        stage_path.write_text(json.dumps(stage, ensure_ascii=False), encoding="utf-8")
        out_path.unlink(missing_ok=True)
        proc = subprocess.run([sys.executable, str(SCRIPT), str(stage_path), str(self.pbf), str(out_path)],
                              capture_output=True, text=True, encoding="utf-8")
        feature = json.loads(out_path.read_text())["features"][0] if out_path.exists() else None
        return proc.returncode, proc.stdout, proc.stderr, feature

    def assertCovers(self, feature, way_id, expected=True):
        distance = shape(feature["geometry"]).distance(middle(way_id))
        if expected:
            self.assertLess(distance, 1e-6, f"way {way_id} should be part of the route")
        else:
            self.assertGreater(distance, 1e-4, f"way {way_id} should not be part of the route")

    # ---- a stage file like stage 1 behaves as it always did --------------------------------

    def test_stage_one_style_file_is_unchanged(self):
        rc, out, _, feature = self.run_script(STAGE1_STYLE)
        self.assertEqual(rc, 0)
        # These numbers come from the script as it was before the new keys existed, run on this same extract.
        self.assertEqual(feature["properties"], {
            "source": "OpenStreetMap",
            "relations": [100, 101, 102, 103, 104, 105, 106, 108, 113, 115, 116, 118],
            "length_km": 108.6,
        })
        self.assertIn("route_from_osm: 12 matching relations, 12 member ways, 12 segments in bbox, 108.6 km", out)
        self.assertIn("  relation 104: Camino de Santiago".replace("Santiago", "las Bordas SL-NA 53B"), out)
        # The broad regex over-selects: local trails, the children of a super-route, a far section.
        for way in (1004, 1005, 1006, 1007, 1010, 1014):
            self.assertCovers(feature, way)
        for way in (1008, 1009, 1012, 1015):  # bicycle route, GR 10, two unrelated routes
            self.assertCovers(feature, way, expected=False)
        self.assertNotIn("excluded_relations", feature["properties"])
        self.assertNotIn("clip_km", feature["properties"])

    def test_without_clip_km_the_search_bbox_cuts_ways(self):
        rc, _, _, feature = self.run_script(STAGE1_STYLE)
        self.assertEqual(rc, 0)
        geometry = shape(feature["geometry"])
        self.assertLess(geometry.distance(Point(-0.90, 42.99)), 1e-6)  # inside the bbox (east edge at -0.85)
        self.assertLess(geometry.distance(Point(-0.851, 42.99)), 1e-3)
        self.assertGreater(geometry.distance(Point(-0.80, 42.99)), 1e-3)  # outside: cut off
        self.assertGreater(geometry.bounds[2], -0.86)  # the route reaches the edge but not past it
        self.assertLessEqual(geometry.bounds[2], -0.85 + 1e-9)

    def test_default_minimum_is_15_km(self):
        # lengths as the script measures them, in metres in ETRS89 / UTM 30N
        for regex, km in (("short test", 2.4), ("medium test", 12.3)):
            with self.subTest(regex):
                rc, out, _, feature = self.run_script(dict(STAGE1_STYLE, route_name_regex=regex))
                self.assertEqual(rc, 2)
                self.assertIsNone(feature)
                self.assertIn(f"{km:.1f} km", out)
                self.assertIn("route_from_osm: under 15 km, not using OSM geometry", out)

    def test_nothing_matching_exits_2(self):
        rc, _, _, feature = self.run_script(dict(STAGE1_STYLE, route_name_regex="no such relation"))
        self.assertEqual(rc, 2)
        self.assertIsNone(feature)

    # ---- route_exclude_regex -----------------------------------------------------------------

    def test_excluded_relations_are_dropped_even_when_they_match_the_include_regex(self):
        stage = dict(NEW_STYLE)
        rc, out, _, feature = self.run_script(stage, drop=("clip_km",))
        self.assertEqual(rc, 0)
        props = feature["properties"]
        # 105, 106 and 116 match the include regex and the exclude regex (116 only in lower case)
        self.assertEqual(props["relations"], [100, 101, 102, 103, 108, 113, 115])
        for rid in (104, 105, 106, 116):
            self.assertNotIn(rid, props["relations"])
        for way in (1005, 1014, 1004):  # their ways are gone
            self.assertCovers(feature, way, expected=False)
        for way in (1001, 1002, 1003, 1007, 1011, 1013):
            self.assertCovers(feature, way)
        self.assertNotIn("clip_km", props)  # opt in per key

    def test_children_of_an_excluded_relation_are_dropped_unless_reached_another_way(self):
        rc, _, _, feature = self.run_script(NEW_STYLE, drop=("clip_km",))
        self.assertEqual(rc, 0)
        # 107 only hangs under the excluded super-route 106: dropped. 103 hangs under 106 too, but it
        # matches the include regex itself (and is a member of nothing excluded alone): kept.
        self.assertCovers(feature, 1006, expected=False)
        self.assertCovers(feature, 1003)

    def test_a_child_that_matches_the_exclude_regex_is_dropped_under_a_kept_parent(self):
        rc, _, _, feature = self.run_script(NEW_STYLE, drop=("clip_km",))
        self.assertEqual(rc, 0)
        self.assertCovers(feature, 1011)  # 113 is kept
        self.assertCovers(feature, 1010, expected=False)  # its child 114 "Local PR-NA 9" is not

    def test_excluded_relations_are_listed_in_the_output_and_the_log(self):
        rc, out, _, feature = self.run_script(NEW_STYLE)
        self.assertEqual(rc, 0)
        self.assertEqual(feature["properties"]["excluded_relations"], [105, 106, 114, 116])
        self.assertIn("  relation 100: Camino Francés (A)", out)
        self.assertIn("  excluded relation 105: Camino Francés - Ramal PR-NA 120", out)
        self.assertIn("  excluded relation 106: Camino Francés PR-LR 7 (comarca)", out)
        self.assertIn("  excluded relation 116: Camino Francés - ramal pr-na 77", out)
        self.assertIn("  excluded child relation 114: Local PR-NA 9", out)
        self.assertNotIn("relation 107", out)  # never reached: it only hangs under an excluded relation

    def test_an_empty_exclude_regex_excludes_nothing(self):
        stage = dict(NEW_STYLE, route_exclude_regex="")
        rc, _, _, feature = self.run_script(stage, drop=("clip_km",))
        self.assertEqual(rc, 0)
        self.assertIn(105, feature["properties"]["relations"])
        self.assertNotIn("excluded_relations", feature["properties"])

    # ---- clip_km -----------------------------------------------------------------------------

    def test_clip_km_drops_a_way_far_from_the_fallback_line(self):
        _, _, _, unclipped = self.run_script(NEW_STYLE, drop=("clip_km",))
        self.assertCovers(unclipped, 1007)  # inside the bbox, 20 km from the line
        rc, _, _, feature = self.run_script(NEW_STYLE)
        self.assertEqual(rc, 0)
        self.assertCovers(feature, 1007, expected=False)
        for way in (1001, 1002, 1003, 1011):
            self.assertCovers(feature, way)
        self.assertEqual(feature["properties"]["clip_km"], 6)
        # 12.2 + 12.2 + 16.3 + 1.6 km of ways, plus the first 6 km of the spur (22 km long)
        self.assertAlmostEqual(feature["properties"]["length_km"], 48.4, delta=1.0)
        self.assertGreater(unclipped["properties"]["length_km"], feature["properties"]["length_km"] + 20)

    def test_clip_km_cuts_a_way_at_the_boundary_and_keeps_the_part_inside(self):
        rc, _, _, feature = self.run_script(NEW_STYLE)
        self.assertEqual(rc, 0)
        geometry = shape(feature["geometry"])
        # The spur leaves the line at 43.000 N going north. 6 km is 0.054 degrees of latitude.
        self.assertLess(geometry.distance(Point(-1.15, 43.03)), 1e-6)
        self.assertLess(geometry.distance(Point(-1.15, 43.05)), 1e-6)
        self.assertGreater(geometry.distance(Point(-1.15, 43.07)), 1e-3)
        self.assertGreater(geometry.distance(Point(-1.15, 43.15)), 1e-3)

    def test_clip_km_width_decides_what_stays(self):
        # 1.5 km: the variant is 1 km from the line (kept), the link at 0.5 km (kept), the spur is cut after 1.5 km
        rc, _, _, narrow = self.run_script(dict(NEW_STYLE, clip_km=1.5))
        self.assertEqual(rc, 0)
        self.assertCovers(narrow, 1003)
        self.assertLess(shape(narrow["geometry"]).distance(Point(-1.15, 43.012)), 1e-6)
        self.assertGreater(shape(narrow["geometry"]).distance(Point(-1.15, 43.02)), 1e-3)
        self.assertEqual(narrow["properties"]["clip_km"], 1.5)

    def test_clip_km_log_says_how_much_was_clipped(self):
        rc, out, _, _ = self.run_script(NEW_STYLE)
        self.assertEqual(rc, 0)
        self.assertIn("segments in clip area", out)
        self.assertIn("route_from_osm: clip_km 6: 89.0 km of route inside the search bbox, 48.4 km of it within 6 km of the fallback route", out)

    # ---- min_route_km ------------------------------------------------------------------------

    def test_min_route_km_can_raise_the_minimum(self):
        rc, out, _, feature = self.run_script(dict(NEW_STYLE, min_route_km=60))
        self.assertEqual(rc, 2)  # 48 km of route is under 60
        self.assertIsNone(feature)
        self.assertIn("route_from_osm: under 60 km, not using OSM geometry", out)
        rc, _, _, feature = self.run_script(dict(NEW_STYLE, min_route_km=40))
        self.assertEqual(rc, 0)
        self.assertIsNotNone(feature)

    def test_min_route_km_can_lower_the_minimum(self):
        stage = dict(STAGE1_STYLE, route_name_regex="short test")
        self.assertEqual(self.run_script(stage)[0], 2)
        rc, _, _, feature = self.run_script(dict(stage, min_route_km=2))
        self.assertEqual(rc, 0)
        self.assertAlmostEqual(feature["properties"]["length_km"], 2.4, delta=0.2)

    def test_min_route_km_is_compared_with_the_length_of_the_route(self):
        stage = dict(STAGE1_STYLE, route_name_regex="medium test")  # 12.3 km
        self.assertEqual(self.run_script(dict(stage, min_route_km=12))[0], 0)
        self.assertEqual(self.run_script(dict(stage, min_route_km=12.5))[0], 2)
        self.assertEqual(self.run_script(dict(stage, min_route_km=5.5))[0], 0)

    # ---- bad stage files are not "too little route" ------------------------------------------

    def test_a_bad_stage_file_never_uses_exit_code_2(self):
        # build_stage.sh falls back to the hand-placed route on exit code 2 only; a mistake in the stage file must stop the build.
        cases = {
            "clip_km without fallback_route": (dict(NEW_STYLE), ("fallback_route",), "clip_km needs fallback_route"),
            "fallback_route that does not exist": (dict(NEW_STYLE, fallback_route="missing.geojson"), (), "cannot use fallback_route"),
            "fallback_route that is not GeoJSON": (dict(NEW_STYLE, fallback_route="stage.json"), (), "cannot use fallback_route"),
            "invalid route_exclude_regex": (dict(NEW_STYLE, route_exclude_regex="(unclosed"), (), "route_exclude_regex is not a valid regular expression"),
            "negative clip_km": (dict(NEW_STYLE, clip_km=-3), (), "clip_km must be a number above 0, got -3"),
            "clip_km as text": (dict(NEW_STYLE, clip_km="6"), (), "clip_km must be a number above 0, got '6'"),
            "zero min_route_km": (dict(NEW_STYLE, min_route_km=0), (), "min_route_km must be a number above 0"),
            "route_exclude_regex that is not text": (dict(NEW_STYLE, route_exclude_regex=5), (), "route_exclude_regex must be a string"),
        }
        for label, (stage, drop, message) in cases.items():
            with self.subTest(label):
                rc, _, stderr, feature = self.run_script(stage, drop=drop)
                self.assertEqual(rc, 1, stderr)
                self.assertIn(message, stderr)
                self.assertNotIn("Traceback", stderr)  # a plain message, not a crash
                self.assertIsNone(feature)
        # a stage file without route_name_regex was always an error (a KeyError), and still is
        rc, _, stderr, _ = self.run_script(NEW_STYLE, drop=("route_name_regex",))
        self.assertEqual(rc, 1)
        self.assertIn("route_name_regex", stderr)

    def test_fallback_route_may_be_a_feature_or_a_bare_geometry(self):
        for name, content in {
            "feature.geojson": {"type": "Feature", "properties": {}, "geometry": {"type": "LineString", "coordinates": FALLBACK}},
            "geometry.geojson": {"type": "LineString", "coordinates": FALLBACK},
        }.items():
            with self.subTest(name):
                (self.dir / name).write_text(json.dumps(content))
                rc, _, stderr, feature = self.run_script(dict(NEW_STYLE, fallback_route=name))
                self.assertEqual(rc, 0, stderr)
                self.assertCovers(feature, 1007, expected=False)

    def test_usage_message_on_wrong_arguments(self):
        proc = subprocess.run([sys.executable, str(SCRIPT)], capture_output=True, text=True)
        self.assertEqual(proc.returncode, 1)
        self.assertIn("Usage: route_from_osm.py", proc.stderr)


if __name__ == "__main__":
    unittest.main()
