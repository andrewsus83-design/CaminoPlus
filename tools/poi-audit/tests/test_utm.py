"""UTM to WGS84 without pyproj. Run: python -m unittest discover -s tests"""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from poi_audit.normalize import distance_m  # noqa: E402
from poi_audit.utm import datum_and_zone, utm_to_wgs84  # noqa: E402

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "navarra"

# Reference values computed with PROJ (pyproj 3.8.0) on 2026-11-07: EPSG:25830 -> 4326 for ETRS89, and the
# EPSG:1588 "ED50 to ETRS89 (1)" pipeline from UTM 30N on the International 1924 ellipsoid for ED50.
# (easting, northing): ((ETRS89 lat, lon), (ED50 lat, lon))
PROJ = {
    (500000, 0): ((0.0, -3.0), (-0.001270050, -3.000820174)),
    (637061, 4763565): ((43.012406542, -1.318120997), (43.010534108, -1.319429226)),  # official fountain, Roncesvalles
    (603259, 4732522): ((42.738267211, -1.738497703), (42.736391939, -1.739784124)),  # official fountain, Cizur
    (550315, 4705408): ((42.499399055, -2.387649979), (42.497518269, -2.388906883)),  # official fountain, Viana
    (645107, 4714328): ((42.567726328, -1.232095528), (42.565858172, -1.233397437)),  # official fountain, Sangüesa
}


class Conversion(unittest.TestCase):
    def test_etrs89_matches_proj_to_a_centimetre(self):
        for (e, n), ((lat, lon), _) in PROJ.items():
            got = utm_to_wgs84(e, n, "EPSG:25830")
            self.assertAlmostEqual(got[0], lat, places=7, msg=(e, n))
            self.assertAlmostEqual(got[1], lon, places=7, msg=(e, n))

    def test_ed50_matches_the_same_pipeline_in_proj_to_a_centimetre(self):
        for (e, n), (_, (lat, lon)) in PROJ.items():
            got = utm_to_wgs84(e, n, "EPSG:23030")
            self.assertAlmostEqual(got[0], lat, places=7, msg=(e, n))
            self.assertAlmostEqual(got[1], lon, places=7, msg=(e, n))

    def test_wgs84_and_etrs89_agree_to_a_millimetre(self):
        a, b = utm_to_wgs84(637061, 4763565, "EPSG:25830"), utm_to_wgs84(637061, 4763565, "EPSG:32630")
        self.assertLess(distance_m(*a, *b), 0.001)

    def test_the_central_meridian_of_zone_30_is_3_degrees_west(self):
        lat, lon = utm_to_wgs84(500000, 0, "EPSG:25830")
        self.assertAlmostEqual(lat, 0.0, places=9)
        self.assertAlmostEqual(lon, -3.0, places=9)
        self.assertAlmostEqual(utm_to_wgs84(500000, 4700000, 25830)[1], -3.0, places=9)  # an int code works too

    def test_the_zone_comes_from_the_epsg_code(self):
        lat, lon = utm_to_wgs84(400000, 4600000, "EPSG:25831")  # zone 31, central meridian 3 degrees east
        self.assertAlmostEqual(lat, 41.545413661, places=7)
        self.assertAlmostEqual(lon, 1.801033713, places=7)

    def test_only_utm_systems_are_accepted(self):
        self.assertEqual(datum_and_zone("EPSG:25830"), ("ETRS89", 30, True))
        self.assertEqual(datum_and_zone("EPSG:23030"), ("ED50", 30, True))
        self.assertEqual(datum_and_zone(32630), ("WGS84", 30, True))
        for bad in ("EPSG:4326", "EPSG:27700", "EPSG:32730", "nonsense"):
            with self.assertRaises(ValueError, msg=bad):
                utm_to_wgs84(600000, 4700000, bad)


class KnownPlace(unittest.TestCase):
    """The datum matters: the Navarra tables say 'UTM' only. Two official fountains of stage 1 land on OSM
    drinking-water points when the numbers are read as ED50, and 235 m away when read as ETRS89."""

    def setUp(self):
        elements = json.loads((FIXTURES / "osm_stage1_navarra.json").read_text())["elements"]
        self.osm = {f"{e['type']}/{e['id']}": e for e in elements}

    def check(self, x, y, osm_key):
        e = self.osm[osm_key]
        as_ed50 = distance_m(*utm_to_wgs84(x, y, "EPSG:23030"), e["lat"], e["lon"])
        as_etrs89 = distance_m(*utm_to_wgs84(x, y, "EPSG:25830"), e["lat"], e["lon"])
        self.assertLess(as_ed50, 10, "the official fountain should sit on the OSM water point")
        self.assertGreater(as_etrs89, 200, "read as ETRS89 it is a different place")

    def test_fountain_on_the_valcarlos_road(self):
        self.check(635886, 4765575, "node/4984656415")  # drinking_water + water_tap

    def test_fountain_near_errolan(self):
        self.check(641441, 4767692, "node/7725253918")  # drinking_water

    def test_the_two_readings_are_about_235_m_apart_in_navarra(self):
        for (e, n) in PROJ:
            if n < 1000:
                continue
            d = distance_m(*utm_to_wgs84(e, n, "EPSG:23030"), *utm_to_wgs84(e, n, "EPSG:25830"))
            self.assertTrue(200 < d < 260, (e, n, d))


if __name__ == "__main__":
    unittest.main()
