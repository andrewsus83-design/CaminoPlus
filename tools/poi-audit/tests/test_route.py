"""The stage line and the along-route position. Synthetic lines for the arithmetic, trimmed real OSM routes
for the joining. No network. Run: python -m unittest discover -s tests"""
import math
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

import audit  # noqa: E402
from poi_audit import route  # noqa: E402
from poi_audit.normalize import distance_m  # noqa: E402
from poi_audit.route import RouteError, StageLine, build_stage_line  # noqa: E402
from support_import import load_fixture_stage, replay_cache  # noqa: E402

LAT = 43.0
KX = route.M_PER_DEG * math.cos(math.radians(LAT))      # metres per degree of longitude on the 43rd parallel


def east(lon0: float, metres: float) -> float:
    return lon0 + metres / KX


def north(lat0: float, metres: float) -> float:
    return lat0 + metres / route.M_PER_DEG


class Locate(unittest.TestCase):
    def setUp(self):
        # 10 km due east along the parallel
        self.line = StageLine([(-1.5, LAT), (east(-1.5, 4000), LAT), (east(-1.5, 10000), LAT)])

    def test_position_and_distance_on_a_straight_line(self):
        km, off = self.line.locate_km(north(LAT, 250), east(-1.5, 6000))
        self.assertAlmostEqual(km, 6.0, delta=0.002)
        self.assertAlmostEqual(off, 250, delta=0.5)
        self.assertAlmostEqual(self.line.length_km, 10.0, delta=0.002)

    def test_a_point_on_the_line_is_zero_metres_off(self):
        km, off = self.line.locate_km(LAT, east(-1.5, 4000))
        self.assertAlmostEqual(km, 4.0, delta=0.001)
        self.assertLess(off, 0.01)

    def test_before_the_start_and_after_the_end_it_is_the_end_of_the_line(self):
        km, off = self.line.locate_km(LAT, east(-1.5, -500))
        self.assertEqual(km, 0.0)
        self.assertAlmostEqual(off, 500, delta=0.5)
        km, off = self.line.locate_km(north(LAT, 300), east(-1.5, 10400))
        self.assertAlmostEqual(km, 10.0, delta=0.002)
        self.assertAlmostEqual(off, 500, delta=1)                  # 400 m east and 300 m north of the end

    def test_a_bent_line_adds_the_legs_up(self):
        bend = StageLine([(-1.5, LAT), (east(-1.5, 3000), LAT), (east(-1.5, 3000), north(LAT, 4000))])
        km, off = bend.locate_km(north(LAT, 1000), east(-1.5, 3200))     # 200 m east of the second leg, 1 km up it
        self.assertAlmostEqual(km, 4.0, delta=0.005)
        self.assertAlmostEqual(off, 200, delta=0.5)
        self.assertAlmostEqual(bend.length_km, 7.0, delta=0.005)

    def test_the_length_is_what_haversine_says(self):
        pts = [(-1.2376, 43.1636), (-1.2310, 43.1480), (-1.2250, 43.1300), (-1.3195, 43.0094)]
        line = StageLine(pts)
        hav = sum(distance_m(a[1], a[0], b[1], b[0]) for a, b in zip(pts, pts[1:]))
        self.assertAlmostEqual(line.length_m, hav, delta=hav * 0.0005)

    def test_when_the_line_doubles_back_the_earlier_point_wins(self):
        out_and_back = StageLine([(-1.5, LAT), (east(-1.5, 2000), LAT), (east(-1.5, 2000), north(LAT, 20)), (-1.5, north(LAT, 20))])
        km, _ = out_and_back.locate_km(north(LAT, 10), east(-1.5, 1000))      # exactly between the two passes
        self.assertAlmostEqual(km, 1.0, delta=0.002)

    def test_repeated_points_are_dropped_and_two_different_points_are_needed(self):
        self.assertEqual(len(StageLine([(0, 0), (0, 0), (1, 1)]).points), 2)
        with self.assertRaises(RouteError):
            StageLine([(0, 0), (0, 0)])


def way(*metres, lat=LAT):
    """A way along the parallel through the given eastings (metres from lon -1.5)."""
    return [(east(-1.5, m), lat) for m in metres]


class BuildLine(unittest.TestCase):
    def test_the_shortest_way_through_the_ways_wins_and_the_direction_is_start_to_end(self):
        main_a = way(0, 1000, 2000)
        main_b = way(2000, 3000, 4000)
        detour = [(east(-1.5, 2000), LAT), (east(-1.5, 3000), north(LAT, 900)), (east(-1.5, 4000), LAT)]
        start, end = (east(-1.5, 0), LAT), (east(-1.5, 4000), LAT)
        for lines in ([main_a, main_b, detour], [detour, main_b[::-1], main_a[::-1]]):      # order and direction of the ways do not matter
            line = build_stage_line(lines, start, end)
            self.assertAlmostEqual(line.length_km, 4.0, delta=0.005)
            self.assertAlmostEqual(line.points[0][0], start[0], places=6)
            self.assertAlmostEqual(line.points[-1][0], end[0], places=6)

    def test_the_start_and_the_end_are_snapped_to_the_route_and_the_snap_is_reported(self):
        line = build_stage_line([way(0, 2000, 4000)], (east(-1.5, -100), north(LAT, 60)), (east(-1.5, 4050), LAT))
        self.assertAlmostEqual(line.start_snap_m, math.hypot(100, 60), delta=1)
        self.assertAlmostEqual(line.end_snap_m, 50, delta=1)

    def test_a_small_gap_between_two_ways_is_joined_and_counted(self):
        lines = [way(0, 1000, 2000), way(2030, 3000, 4000)]                # 30 m apart
        line = build_stage_line(lines, (east(-1.5, 0), LAT), (east(-1.5, 4000), LAT))
        self.assertEqual(line.joined_gaps, 1)
        self.assertAlmostEqual(line.length_km, 4.0, delta=0.005)

    def test_a_big_gap_is_an_error_that_says_so(self):
        lines = [way(0, 1000, 2000), way(2300, 3000, 4000)]                # 300 m apart
        with self.assertRaisesRegex(RouteError, "do not connect"):
            build_stage_line(lines, (east(-1.5, 0), LAT), (east(-1.5, 4000), LAT))

    def test_the_ends_of_one_winding_way_close_to_each_other_are_not_a_gap(self):
        # A way that loops back to 30 m from where it started, and the road goes on from its far end. Joining
        # the two ends would cut the loop off (30 m instead of 2 km); the line must follow the way.
        loop = [(east(-1.5, 0), LAT), (east(-1.5, 500), LAT), (east(-1.5, 500), north(LAT, 500)),
                (east(-1.5, 0), north(LAT, 500)), (east(-1.5, 0), north(LAT, 30))]
        onward = [(east(-1.5, 0), north(LAT, 30)), (east(-1.5, -2000), north(LAT, 30))]
        line = build_stage_line([loop, onward], (east(-1.5, 0), LAT), (east(-1.5, -2000), north(LAT, 30)))
        self.assertAlmostEqual(line.length_m, 500 + 500 + 500 + 470 + 2000, delta=8)
        self.assertEqual(line.joined_gaps, 0)

    def test_a_start_town_far_from_every_way_is_refused(self):
        with self.assertRaisesRegex(RouteError, "start is .* from the nearest OSM route way"):
            build_stage_line([way(0, 1000, 2000)], (east(-1.5, 0), north(LAT, 3000)), (east(-1.5, 2000), LAT))

    def test_a_line_that_winds_far_more_than_the_stage_ends_are_apart_is_refused(self):
        u = [(east(-1.5, 0), LAT), (east(-1.5, 0), north(LAT, 6000)), (east(-1.5, 1200), north(LAT, 6000)), (east(-1.5, 1200), LAT)]
        with self.assertRaisesRegex(RouteError, "not the route of this stage"):
            build_stage_line([u], (east(-1.5, 0), LAT), (east(-1.5, 1200), LAT))

    def test_no_ways_and_start_equal_end_are_errors(self):
        with self.assertRaises(RouteError):
            build_stage_line([], (0, 0), (1, 1))
        with self.assertRaisesRegex(RouteError, "same point"):
            build_stage_line([way(0, 1000)], (east(-1.5, 0), LAT), (east(-1.5, 10), LAT))

    def test_building_twice_gives_the_same_line(self):
        lines = [way(0, 1000, 2000), way(2000, 3000, 4000)]
        a = build_stage_line(lines, (east(-1.5, 0), LAT), (east(-1.5, 4000), LAT))
        b = build_stage_line(list(reversed(lines)), (east(-1.5, 0), LAT), (east(-1.5, 4000), LAT))
        self.assertEqual(a.points, b.points)


class RealRoutes(unittest.TestCase):
    """The route answers of the two real stages in the fixtures (a trimmed copy of what Overpass returned)."""

    def line_for(self, num: str):
        stage, stage_path = load_fixture_stage(num)
        with tempfile.TemporaryDirectory() as tmp:
            cache = audit.sources.Cache(replay_cache(tmp, num), offline=True)
            lines, _, problem = audit.load_route(stage, stage_path, cache)
        self.assertIsNone(problem)
        start, end = route.stage_ends(stage, stage_path)
        return build_stage_line(lines, start, end), start, end

    def test_stage_1_saint_jean_to_roncesvalles(self):
        line, start, end = self.line_for("01")
        self.assertAlmostEqual(line.length_km, 24.116, delta=0.01)       # the Napoleon route: 24.2 km in the seed data
        self.assertLess(line.start_snap_m, 200)
        self.assertLess(line.end_snap_m, 100)
        self.assertEqual(line.joined_gaps, 0)

    def test_stage_29_sarria_to_portomarin(self):
        line, start, end = self.line_for("29")
        self.assertAlmostEqual(line.length_km, 22.091, delta=0.01)
        self.assertLess(line.start_snap_m, 200)
        self.assertLess(line.end_snap_m, 300)

    def test_every_point_of_the_line_is_zero_metres_from_itself_and_the_positions_never_go_backwards(self):
        line, _, _ = self.line_for("29")
        last = -1.0
        for lon, lat in line.points[:: max(1, len(line.points) // 60)]:
            km, off = line.locate_km(lat, lon)
            self.assertLess(off, 0.5)
            self.assertGreaterEqual(km, last - 0.001)
            last = km


if __name__ == "__main__":
    unittest.main()
