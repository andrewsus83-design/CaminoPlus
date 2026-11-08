"""The generator of the route lines of the Maps tab (build_route_lines.py): the thinning, the line of one stage, the joins
between stages, the files and the manifest, and a check of the files that are bundled in the app. Small synthetic ways for
the arithmetic, the trimmed real stage 1 answer of the importer's fixtures for the real thing. No network.
Run: python -m unittest discover -s tests"""
import contextlib
import hashlib
import io
import json
import math
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

import build_route_lines as brl  # noqa: E402
from poi_audit import route, sources  # noqa: E402
from poi_audit.normalize import distance_m  # noqa: E402
from support_import import load_fixture_stage, replay_cache  # noqa: E402

LAT = 43.0
KX = route.M_PER_DEG * math.cos(math.radians(LAT))           # metres per degree of longitude on the 43rd parallel
BBOX = [-1.6, 42.9, -1.3, 43.1]
ROUTE_ID = "20000000-0000-0000-0000-000000000001"


def east(lon0: float, metres: float) -> float:
    return round(lon0 + metres / KX, 7)                         # OSM keeps 7 decimals


def north(lat0: float, metres: float) -> float:
    return round(lat0 + metres / route.M_PER_DEG, 7)


def at(x: float, y: float = 0.0) -> tuple[float, float]:
    """(lon, lat) of the place x metres east and y metres north of (-1.5, 43.0)."""
    return east(-1.5, x), north(LAT, y)


def way(*xs, y=0.0) -> list:
    return [at(x, y) for x in xs]


def answer(ways=None, timestamp="2026-08-19T03:16:35Z", relations=None) -> dict:
    """What Overpass says to the route request: relations with their ways and the geometry of every way."""
    relations = relations or [(1, "Camino test", ways)]
    return {"version": 0.6, "osm3s": {"timestamp_osm_base": timestamp}, "elements": [
        {"type": "relation", "id": rid, "tags": {"name": name, "route": "hiking"}, "members": [
            {"type": "way", "ref": i, "role": "", "geometry": [{"lat": lat, "lon": lon} for lon, lat in w]} for i, w in enumerate(rel_ways, 1)]}
        for rid, name, rel_ways in relations]}


def make_stage(tmp: Path, number: int, start, end, ans: dict | None, bbox=None) -> Path:
    """A stage file with the hand-drawn line next to it (only its first and last point are read: the two towns), and the
    Overpass answer in the cache, where the importer's tests put one too."""
    folder = Path(tmp) / "stages"
    folder.mkdir(exist_ok=True)
    slug = f"camino-frances-{number:02d}"
    bbox = bbox or BBOX
    stage = {"slug": slug, "name": f"Town {number} to Town {number + 1}", "stage_number": number, "route_slug": "camino-frances",
             "stage_id": f"40000000-0000-0000-0000-{number:012d}", "route_id": ROUTE_ID, "search_bbox": bbox,
             "route_name_regex": "camino", "fallback_route": f"{slug}.route.geojson"}
    path = folder / f"{slug}.json"
    path.write_text(json.dumps(stage), encoding="utf-8")
    (folder / f"{slug}.route.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {}, "geometry": {"type": "LineString", "coordinates": [list(start), list(end)]}}]}), encoding="utf-8")
    if ans is not None:
        sources.Cache(Path(tmp) / "cache").path("route", sources.overpass_route_query(bbox, "camino")).write_text(json.dumps(ans), encoding="utf-8")
    return path


def offline_cache(tmp: Path) -> sources.Cache:
    return sources.Cache(Path(tmp) / "cache", offline=True)


def distance_to_line(p, line) -> float:
    """Metres from p to the nearest point of the polyline."""
    return route.StageLine(line).locate(p[1], p[0])[1]


def wiggly(n=400):
    return [at(i * 25, 40 * math.sin(i / 7) + 9 * math.sin(i * 1.3)) for i in range(n)]


class Simplify(unittest.TestCase):
    def test_a_straight_line_is_its_two_ends(self):
        pts = way(*range(0, 3000, 50))
        self.assertEqual(brl.simplify(pts, 5), [pts[0], pts[-1]])

    def test_a_bump_larger_than_the_tolerance_is_kept_and_a_smaller_one_is_dropped(self):
        pts = [at(0), at(500), at(1000, 8), at(1500), at(2000)]           # the middle point is 8 m off the line through the others
        self.assertEqual(brl.simplify(pts, 5), [pts[0], pts[2], pts[-1]])
        self.assertEqual(brl.simplify(pts, 7.9), [pts[0], pts[2], pts[-1]])
        self.assertEqual(brl.simplify(pts, 8.5), [pts[0], pts[-1]])

    def test_the_tolerance_is_in_metres_east_west_as_well_as_north_south(self):
        self.assertEqual(len(brl.simplify([at(0), at(1500, 8), at(3000)], 5)), 3, "8 m north of an east-west line")
        self.assertEqual(len(brl.simplify([at(0), at(1500, 4), at(3000)], 5)), 2, "4 m north of it")
        self.assertEqual(len(brl.simplify([at(0, 0), at(8, 1500), at(0, 3000)], 5)), 3, "8 m east of a north-south line")
        self.assertEqual(len(brl.simplify([at(0, 0), at(4, 1500), at(0, 3000)], 5)), 2, "4 m east of it")

    def test_the_ends_and_the_order_are_kept_and_only_original_points_come_back(self):
        pts = wiggly()
        kept = brl.simplify(pts, 5)
        self.assertLess(len(kept), len(pts))
        self.assertIs(kept[0], pts[0])
        self.assertIs(kept[-1], pts[-1])
        positions = [pts.index(p) for p in kept]
        self.assertEqual(positions, sorted(set(positions)))

    def test_every_point_that_was_dropped_is_within_the_tolerance_of_the_thinned_line(self):
        pts = wiggly()
        for tol in (2, 5, 12):
            kept = brl.simplify(pts, tol)
            worst = max(distance_to_line(p, kept) for p in pts)
            self.assertLessEqual(worst, tol + 0.05, f"tolerance {tol}")
            self.assertGreater(worst, tol * 0.4, "and the tolerance is used, not a much finer one")

    def test_nothing_is_dropped_without_a_tolerance_and_a_short_line_stays(self):
        pts = [at(i * 25, 3 * math.sin(i)) for i in range(50)]
        self.assertEqual(brl.simplify(pts, 0), pts)
        self.assertEqual(brl.simplify(pts[:2], 5), pts[:2])
        self.assertEqual(brl.simplify(pts[:1], 5), pts[:1])

    def test_a_line_that_comes_back_to_where_it_started_is_not_collapsed(self):
        loop = [at(0, 0), at(1000, 0), at(1000, 1000), at(0, 1000), at(0, 0)]
        self.assertEqual(brl.simplify(loop, 5), loop)

    def test_a_long_line_does_not_run_into_the_recursion_limit(self):
        pts = [at(i * 5.0, (-1) ** (i // 3) * 30 + i % 3) for i in range(6000)]
        kept = brl.simplify(pts, 5)
        self.assertIs(kept[0], pts[0])
        self.assertIs(kept[-1], pts[-1])


class OneStage(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)

    def build(self, ways, start, end, tolerance=5.0, **kw):
        path = make_stage(self.tmp, 1, start, end, answer(ways, **kw))
        return brl.build_stage(path, offline_cache(self.tmp), tolerance)

    def test_the_line_is_one_way_from_the_start_town_to_the_end_town_through_the_shortest_ways(self):
        main_a, main_b = way(0, 1000, 2000), way(2000, 3000, 4000)
        detour = [at(2000), at(3000, 900), at(4000)]
        r = self.build([detour, main_b[::-1], main_a], at(-20, 30), at(4010, -5))        # order and direction of the ways do not matter
        self.assertEqual(r.number, 1)
        self.assertEqual(r.full[0], at(0))
        self.assertEqual(r.full[-1], at(4000))
        self.assertAlmostEqual(route.StageLine(r.full).length_km, 4.0, delta=0.005)
        self.assertEqual(r.points, [at(0), at(4000)], "a straight line is its two ends")
        self.assertAlmostEqual(r.start_snap_m, math.hypot(20, 30), delta=1)
        self.assertAlmostEqual(r.end_snap_m, math.hypot(10, 5), delta=1)
        self.assertEqual(r.mapping_gaps_joined, 0)
        self.assertEqual(r.osm_timestamp, "2026-08-19T03:16:35Z")

    def test_a_gap_of_a_few_metres_between_two_ways_is_closed_and_counted(self):
        r = self.build([way(0, 1000, 2000), way(2030, 3000, 4000)], at(0), at(4000))
        self.assertEqual(r.mapping_gaps_joined, 1)
        self.assertAlmostEqual(route.StageLine(r.full).length_km, 4.0, delta=0.005)

    def test_the_relations_the_line_runs_along_are_listed_with_their_share(self):
        along = way(0, 1000, 2000, 3000, 4000)
        side = [at(2000), at(2000, 700), at(2500, 900)]                       # joins the line at one point only
        ans = answer(relations=[(11, "Main way", [along]), (22, "Side way", [side]), (33, "Elsewhere", [way(0, 800, y=5000)])])
        path = make_stage(self.tmp, 1, at(0), at(4000), ans)
        r = brl.build_stage(path, offline_cache(self.tmp), 5)
        shares = {x["id"]: x for x in r.relations}
        self.assertEqual(r.relations[0]["id"], 11, "the biggest share first")
        self.assertEqual(shares[11]["name"], "Main way")
        self.assertEqual(shares[11]["share"], 1.0)
        self.assertIn(22, shares)
        self.assertLess(shares[22]["share"], 0.3)
        self.assertNotIn(33, shares, "a relation that has no node on the line is not listed")

    def test_an_end_further_from_its_town_than_the_limit_is_refused_with_the_stage_in_the_message(self):
        with self.assertRaisesRegex(brl.LineError, r"stage 1: the end of the OSM line is 400 m from the end town"):
            self.build([way(0, 1000, 2000)], at(0), at(2400))
        r = self.build([way(0, 1000, 2000)], at(0), at(2150))           # 150 m: fine
        self.assertAlmostEqual(r.end_snap_m, 150, delta=1)

    def test_no_osm_route_is_an_error_and_the_hand_drawn_line_is_never_used(self):
        path = make_stage(self.tmp, 1, at(0), at(2000), None)               # nothing in the cache, and offline
        with contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(brl.LineError, r"stage 1: no OSM route .*hand-drawn fallback"):
                brl.build_stage(path, offline_cache(self.tmp), 5)

    def test_an_answer_with_a_runtime_error_remark_is_refused(self):
        ans = answer([way(0, 1000, 2000)])
        ans["remark"] = 'runtime error: Query timed out in "query" at line 3 after 181 seconds.'
        path = make_stage(self.tmp, 1, at(0), at(2000), ans)
        with self.assertRaisesRegex(brl.LineError, "runtime error"):
            brl.build_stage(path, offline_cache(self.tmp), 5)

    def test_a_tolerance_that_would_shorten_the_line_by_more_than_three_percent_is_refused(self):
        zigzag = [at(i * 20, 20 if i % 2 else 0) for i in range(60)]         # 28 m of path for every 20 m of the way
        start, end = zigzag[0], zigzag[-1]
        r = self.build([zigzag], start, end, tolerance=5.0)                  # at 5 m the zig-zag stays
        self.assertGreater(len(r.points), 50)
        with self.assertRaisesRegex(brl.LineError, "changed the length"):
            self.build([zigzag], start, end, tolerance=40.0)                 # at 40 m it is a straight line, 29 % shorter


class Stages(unittest.TestCase):
    """Several stages: the joins, the files, the manifest and the check of the files."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)

    def stages(self, gap_m: float = 0.0, stamps=("2026-08-19T03:16:35Z", "2026-08-11T23:57:10Z")):
        """Stage 1 runs from 0 to 3000 m east and stage 2 from 3000 + gap_m to 6000 m: the two towns are one town, which the two
        stage files (and the two OSM answers) place `gap_m` metres apart."""
        def wave(x0, x1):
            return [at(x, 12 * math.sin(math.pi * (x - x0) / 300)) for x in range(x0, x1 + 1, 30)]
        first, second = wave(0, 3000), wave(3000 + int(gap_m), 6000)
        return [make_stage(self.tmp, 1, first[0], at(3000), answer([first], timestamp=stamps[0])),
                make_stage(self.tmp, 2, at(3000 + gap_m), second[-1], answer([second], timestamp=stamps[1]), bbox=[-1.59, 42.9, -1.3, 43.1])]

    def generate(self, gap_m=0.0, paths=None, tolerance=5.0):
        return brl.generate(paths or self.stages(gap_m), offline_cache(self.tmp), tolerance)

    def test_stages_that_end_and_start_at_the_same_node_meet_exactly(self):
        files, results, joins, manifest = self.generate(0.0)
        self.assertEqual(results[0].points[-1], results[1].points[0])
        self.assertEqual(joins, [{"from": 1, "to": 2, "gap_m": 0.0, "closed": True}])
        self.assertNotIn("joined_to_previous_m", manifest["stages"][1])

    def test_a_gap_up_to_50_m_is_closed_by_putting_the_end_of_the_stage_before_in_front(self):
        files, results, joins, manifest = self.generate(30.0)
        a, b = results
        self.assertEqual(a.points[-1], b.points[0])
        self.assertEqual(len(b.points), len(brl.simplify(b.full, 5)) + 1, "every OSM point stays and one point is put in front")
        self.assertEqual(b.points[1], b.full[0])
        self.assertTrue(joins[0]["closed"])
        self.assertAlmostEqual(joins[0]["gap_m"], 30, delta=0.5)
        self.assertEqual(manifest["stages"][1]["joined_to_previous_m"], joins[0]["gap_m"])
        self.assertEqual(manifest["stages"][1]["start"], list(a.points[-1]))

    def test_a_gap_between_50_and_200_m_is_left_as_it_is_and_reported_as_not_closed(self):
        files, results, joins, manifest = self.generate(120.0)
        a, b = results
        self.assertNotEqual(a.points[-1], b.points[0])
        self.assertEqual(len(b.points), len(brl.simplify(b.full, 5)))
        self.assertEqual(joins[0]["closed"], False)
        self.assertAlmostEqual(joins[0]["gap_m"], 120, delta=0.5)

    def test_a_gap_over_200_m_is_an_error(self):
        with self.assertRaisesRegex(brl.LineError, r"stage 1 ends 300 m from where stage 2 starts"):
            self.generate(300.0)

    def test_stages_that_are_not_neighbours_are_not_joined(self):
        paths = self.stages(0.0)
        far = make_stage(self.tmp, 5, at(9000), at(9500), answer([way(9000, 9500)]), bbox=[-1.58, 42.9, -1.3, 43.1])
        files, results, joins, manifest = self.generate(paths=[paths[0], far])
        self.assertEqual([r.number for r in results], [1, 5])
        self.assertEqual(joins, [])
        self.assertEqual(sorted(files), ["camino-frances-01.json", "camino-frances-05.json", "manifest.json"])

    def test_the_files_and_the_manifest_say_the_same(self):
        files, results, joins, manifest = self.generate(0.0)
        self.assertEqual(sorted(files), ["camino-frances-01.json", "camino-frances-02.json", "manifest.json"])
        self.assertEqual(json.loads(files["manifest.json"]), manifest)
        self.assertEqual(manifest["generator"], "tools/poi-audit/build_route_lines.py")
        self.assertEqual(manifest["generator_version"], brl.GENERATOR_VERSION)
        self.assertIn("OpenStreetMap contributors", manifest["licence"])
        self.assertIn("ODbL", manifest["licence"])
        self.assertEqual(manifest["tolerance_m"], 5.0)
        self.assertEqual(manifest["osm_timestamp"], "2026-08-11T23:57:10Z", "the oldest data of the stages")
        self.assertEqual([e["stage"] for e in manifest["stages"]], [1, 2])
        for entry in manifest["stages"]:
            data = files[entry["file"]]
            doc = json.loads(data)
            self.assertEqual(doc["type"], "LineString")
            self.assertEqual(len(doc["coordinates"]), entry["points"])
            self.assertEqual(entry["bytes"], len(data))
            self.assertEqual(entry["sha256"], hashlib.sha256(data).hexdigest())
            self.assertGreater(entry["points_full"], entry["points"])
            self.assertGreater(entry["bytes_full"], entry["bytes"])
            self.assertEqual(entry["start"], doc["coordinates"][0])
            self.assertEqual(entry["end"], doc["coordinates"][-1])
            self.assertTrue(data.endswith(b"}\n") and data.count(b"\n") == 1, "one line and a final newline")
            self.assertEqual(entry["relations"][0]["id"], 1)

    def test_the_same_answers_give_the_same_bytes_whatever_the_order_of_the_stage_files(self):
        paths = self.stages(0.0)
        self.assertEqual(self.generate(paths=paths)[0], self.generate(paths=paths[::-1])[0])

    def test_a_longer_tolerance_keeps_fewer_points(self):
        paths = self.stages(0.0)
        fine = self.generate(paths=paths, tolerance=1.0)[3]
        coarse = self.generate(paths=paths, tolerance=10.0)[3]
        self.assertGreater(fine["stages"][0]["points"], coarse["stages"][0]["points"])
        self.assertEqual(fine["stages"][0]["points_full"], coarse["stages"][0]["points_full"])

    def test_written_files_pass_the_check_and_every_kind_of_damage_is_found(self):
        files = self.generate(30.0)[0]
        out = self.tmp / "lines"
        brl.write_files(files, out)
        self.assertEqual(brl.verify(out), [])

        edited = json.loads((out / "camino-frances-01.json").read_text())
        edited["coordinates"][5][0] += 0.0001
        (out / "camino-frances-01.json").write_text(json.dumps(edited, separators=(",", ":")) + "\n")
        self.assertTrue(any("sha256" in p for p in brl.verify(out)))
        (out / "camino-frances-01.json").write_bytes(files["camino-frances-01.json"])
        self.assertEqual(brl.verify(out), [])

        (out / "camino-frances-07.json").write_bytes(files["camino-frances-01.json"])
        self.assertEqual(brl.verify(out), ["not in the manifest: camino-frances-07.json"])
        (out / "camino-frances-07.json").unlink()

        (out / "camino-frances-02.json").unlink()
        self.assertTrue(any("camino-frances-02.json: cannot be read" in p for p in brl.verify(out)))
        (out / "camino-frances-02.json").write_bytes(files["camino-frances-02.json"])

        (out / "manifest.json").write_text("{")
        self.assertTrue(brl.verify(out)[0].startswith("cannot read manifest.json"))
        for empty in ('{"stages": []}', '{"stages": {}}', '{"stages": [5, "x"]}'):
            (out / "manifest.json").write_text(empty)
            self.assertEqual(len(brl.verify(out)), 1, empty)
            self.assertIn("lists no stage", brl.verify(out)[0])
        (out / "manifest.json").write_text('{"nothing": 1}')
        self.assertTrue(brl.verify(out)[0].startswith("cannot read manifest.json"))
        (out / "manifest.json").unlink()
        self.assertTrue(brl.verify(out)[0].startswith("cannot read manifest.json"))

    def test_the_check_finds_two_stages_that_do_not_meet_and_lets_a_gap_of_a_few_hundred_metres_through_only_up_to_200_m(self):
        files = self.generate(0.0)[0]
        out = self.tmp / "lines"
        brl.write_files(files, out)
        manifest = json.loads((out / "manifest.json").read_text())
        for gap, expected in ((20.0, "closed by the generator"), (150.0, None), (400.0, "not the same town")):
            doc = json.loads(files["camino-frances-02.json"])
            first = doc["coordinates"][0]
            doc["coordinates"][0] = [east(first[0], gap), first[1]]
            data = (json.dumps(doc, separators=(",", ":")) + "\n").encode()
            (out / "camino-frances-02.json").write_bytes(data)
            manifest["stages"][1].update(sha256=hashlib.sha256(data).hexdigest(), bytes=len(data), start=doc["coordinates"][0])
            (out / "manifest.json").write_text(json.dumps(manifest))
            problems = brl.verify(out)
            if expected:
                self.assertEqual(len(problems), 1, problems)
                self.assertIn(expected, problems[0])
            else:
                self.assertEqual(problems, [], "between 50 and 200 m is allowed: the generator reports it as not closed")

    def test_the_command_line_writes_the_files_prints_what_it_did_and_a_second_run_changes_nothing(self):
        paths = self.stages(0.0)
        out = self.tmp / "out"
        argv = ["--stages", "1-2", "--stages-dir", str(paths[0].parent), "--out", str(out), "--cache", str(self.tmp / "cache"), "--offline"]
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(brl.main(argv), 0)
        text = buf.getvalue()
        self.assertIn("stage 1 camino-frances-01:", text)
        self.assertIn("join 1 -> 2: 0.0 m", text)
        self.assertIn("wrote 3 files", text)
        self.assertEqual(sorted(p.name for p in out.iterdir()), ["camino-frances-01.json", "camino-frances-02.json", "manifest.json"])
        first = {p.name: p.read_bytes() for p in out.iterdir()}
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(brl.main(argv), 0)
            self.assertEqual({p.name: p.read_bytes() for p in out.iterdir()}, first)
            self.assertEqual(brl.main(["--verify", "--out", str(out)]), 0)
        (out / "camino-frances-01.json").write_text("[]")
        err = io.StringIO()
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(err):
            self.assertEqual(brl.main(["--verify", "--out", str(out)]), 1)
        self.assertIn("ERROR:", err.getvalue())

    def test_the_command_line_refuses_what_it_cannot_do_and_writes_nothing(self):
        paths = self.stages(0.0)
        out = self.tmp / "out"
        base = ["--stages-dir", str(paths[0].parent), "--out", str(out)]
        cached = ["--cache", str(self.tmp / "cache"), "--offline"]
        err = io.StringIO()
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(err):
            self.assertEqual(brl.main(["--stages", "1-9"] + base + cached), 2, "stage files that do not exist")
            self.assertEqual(brl.main(["--stages", "abc"] + base + cached), 2)
            self.assertEqual(brl.main(["--stages", "1"] + base + ["--cache", str(self.tmp / "empty"), "--offline"]), 1, "offline and nothing cached")
            with self.assertRaises(SystemExit) as stop:
                brl.main(["--tolerance-m", "-1"] + base + cached)
            self.assertEqual(stop.exception.code, 2)
        self.assertFalse(out.exists())
        self.assertIn("no stage file for", err.getvalue())


class Format(unittest.TestCase):
    def test_a_file_is_a_geojson_linestring_on_one_line_with_the_positions_as_they_are(self):
        data = brl.linestring_bytes([(-1.2372336, 43.1623398), (-1.3192037, 43.0093793)])
        self.assertEqual(data, b'{"type":"LineString","coordinates":[[-1.2372336,43.1623398],[-1.3192037,43.0093793]]}\n')

    def test_read_line_accepts_a_linestring_and_refuses_everything_else(self):
        good = b'{"type":"LineString","coordinates":[[-1.2,43.1],[-1.3,43.0],[-1.31,43.01,950]]}'
        self.assertEqual(brl.read_line(good), [(-1.2, 43.1), (-1.3, 43.0), (-1.31, 43.01)], "an elevation is ignored")
        for bad in (b"", b"{", b"[]", b'{"type":"Point","coordinates":[-1.2,43.1]}', b'{"type":"LineString","coordinates":[[-1.2,43.1]]}',
                    b'{"type":"LineString","coordinates":[[-1.2,43.1],[-1.3,"43.0"]]}', b'{"type":"LineString","coordinates":[[-1.2,43.1],[null,43.0]]}',
                    b'{"type":"LineString","coordinates":[[-1.2,43.1],[43.0,-1.3e3]]}', b'{"type":"LineString","coordinates":[[-1.2,43.1],[true,false]]}',
                    b'{"type":"LineString","coordinates":[[-1.2,43.1],[NaN,43.0]]}', b'{"type":"LineString","coordinates":5}', b'{"type":"LineString"}'):
            with self.assertRaises(brl.LineError, msg=bad):
                brl.read_line(bad)

    def test_the_manifest_is_valid_json_with_one_line_for_a_position_a_relation_or_a_join(self):
        doc = {"a": 1, "s": [{"n": 1, "start": [-1.5, 43.0], "rel": [{"id": 5, "name": "Camino Francés", "share": 1.0}]}], "joins": [{"from": 1, "to": 2}], "e": []}
        text = brl.manifest_bytes(doc).decode("utf-8")
        self.assertEqual(json.loads(text), doc)
        self.assertIn('"start": [-1.5, 43.0]', text)
        self.assertIn('{"id": 5, "name": "Camino Francés", "share": 1.0}', text)
        self.assertIn('{"from": 1, "to": 2}', text)
        self.assertIn('"e": []', text)
        self.assertTrue(text.endswith("}\n"))

    def test_the_age_of_the_data(self):
        now = datetime(2026, 11, 8, 12, 0, tzinfo=timezone.utc)
        self.assertEqual(brl.data_age_days("2026-08-19T03:16:35Z", now), 81)
        self.assertIsNone(brl.data_age_days(None, now))
        self.assertIsNone(brl.data_age_days("yesterday", now))


class RealStage1(unittest.TestCase):
    """The importer's fixture: the real Overpass answer for stage 1, cut down to the ways on the stage line."""

    @classmethod
    def setUpClass(cls):
        cls._tmp = tempfile.TemporaryDirectory()
        _, path = load_fixture_stage("01")
        cls.result = brl.build_stage(path, sources.Cache(replay_cache(cls._tmp.name, "01"), offline=True), 5.0)
        cls.full = route.StageLine(cls.result.full)

    @classmethod
    def tearDownClass(cls):
        cls._tmp.cleanup()

    def test_it_is_the_napoleon_route_as_the_importer_draws_it(self):
        self.assertAlmostEqual(self.full.length_km, 24.116, delta=0.01)          # the importer's number; 24.2 km in the seed data
        self.assertLess(self.result.start_snap_m, 200)
        self.assertLess(self.result.end_snap_m, 100)
        self.assertEqual(self.result.mapping_gaps_joined, 0)
        self.assertEqual(self.result.relations[0]["id"], 2163569, "Camino Francés - 01, the relation that holds the Napoleon route")
        self.assertGreater(self.result.relations[0]["share"], 0.95)

    def test_the_thinned_line_keeps_the_ends_and_stays_within_five_metres_of_every_osm_point(self):
        kept = self.result.points
        self.assertEqual(kept[0], self.result.full[0])
        self.assertEqual(kept[-1], self.result.full[-1])
        self.assertTrue(set(kept) <= set(self.result.full), "every point is an OSM node")
        self.assertLess(len(kept), len(self.result.full) / 2)
        self.assertGreater(len(kept), 150)
        self.assertLessEqual(max(distance_to_line(p, kept) for p in self.result.full), 5.05)

    def test_thinning_shortens_the_line_a_little_and_the_file_is_small(self):
        thin = route.StageLine(self.result.points).length_km
        self.assertLess(thin, self.full.length_km)
        self.assertGreater(thin, self.full.length_km * 0.99)
        self.assertLess(len(brl.linestring_bytes(self.result.points)), 12_000)

    def test_the_line_goes_by_the_refuge_orisson(self):
        km, off = route.StageLine(self.result.points).locate_km(43.1087778, -1.2392608)         # OSM node 3337547778, Le Refuge Orisson
        self.assertLess(off, 40)
        self.assertAlmostEqual(km, 7.4, delta=0.3)


class BundledFiles(unittest.TestCase):
    """The files that are in the app (mobile/assets/map/lines) are what the manifest says, and were made by this version."""

    def test_the_bundle_passes_the_check(self):
        self.assertEqual(brl.verify(brl.DEFAULT_OUT), [])

    def test_the_manifest_is_of_this_generator_and_names_stages_1_to_3(self):
        manifest = json.loads((brl.DEFAULT_OUT / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["generator_version"], brl.GENERATOR_VERSION, "the generator changed: run it again and commit the files")
        self.assertEqual([e["stage"] for e in manifest["stages"]], [1, 2, 3])
        self.assertIn("OpenStreetMap contributors", manifest["licence"])
        self.assertRegex(manifest["osm_timestamp"], r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$")
        self.assertEqual(manifest["tolerance_m"], brl.DEFAULT_TOLERANCE_M)
        for e in manifest["stages"]:
            self.assertLessEqual(e["start_snap_m"], brl.MAX_END_SNAP_M)
            self.assertLessEqual(e["end_snap_m"], brl.MAX_END_SNAP_M)
            self.assertLess(e["bytes"], 20_000)
        for j in manifest["joins"]:
            self.assertEqual(j["gap_m"], 0.0, "the stages of the bundle are one line")

    def test_the_bundled_lines_run_from_st_jean_to_pamplona(self):
        manifest = json.loads((brl.DEFAULT_OUT / "manifest.json").read_text(encoding="utf-8"))
        first, last = manifest["stages"][0]["start"], manifest["stages"][-1]["end"]
        self.assertLess(distance_m(43.1636, -1.2376, first[1], first[0]), 200)        # Saint-Jean-Pied-de-Port
        self.assertLess(distance_m(42.8169, -1.6432, last[1], last[0]), 200)          # Pamplona


if __name__ == "__main__":
    unittest.main()
