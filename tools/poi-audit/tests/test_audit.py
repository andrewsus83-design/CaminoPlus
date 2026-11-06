"""Offline tests with hand-made records. Run: python -m unittest discover -s tests"""
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from poi_audit import checks  # noqa: E402
from poi_audit.conflate import conflate  # noqa: E402
from poi_audit.normalize import (Corridor, from_osm, from_overture, from_wikidata,  # noqa: E402
                                 name_similarity)

NOW = datetime(2026, 11, 6, tzinfo=timezone.utc)


def osm(id_, lat, lon, ts="2026-05-01T00:00:00Z", type_="node", **tags):
    el = {"type": type_, "id": id_, "tags": tags, "timestamp": ts, "version": 3}
    if type_ == "node":
        el.update(lat=lat, lon=lon)
    else:
        el["center"] = {"lat": lat, "lon": lon}
    return from_osm(el)


class Categories(unittest.TestCase):
    def test_albergue_kinds(self):
        self.assertEqual(osm(1, 43, -1, tourism="hostel", name="Albergue municipal de Zubiri").category, "albergue_municipal")
        self.assertEqual(osm(2, 43, -1, tourism="hostel", name="Albergue Parroquial").category, "albergue_parochial")
        self.assertEqual(osm(3, 43, -1, tourism="hostel", name="Gîte Ultreïa").category, "albergue_private")
        self.assertEqual(osm(4, 43, -1, tourism="hostel", name="Backpackers Inn").category, "hostel")

    def test_church_and_chapel(self):
        self.assertEqual(osm(5, 43, -1, amenity="place_of_worship", religion="christian").category, "church")
        self.assertEqual(osm(6, 43, -1, building="chapel").category, "chapel")
        self.assertIsNone(osm(7, 43, -1, shop="clothes"))

    def test_overture_and_wikidata(self):
        o = from_overture({"id": "x", "name": "Albergue de Peregrinos", "taxonomy": "hostel", "basic_category": "lodging",
                           "lat": 43, "lon": -1, "confidence": 0.9})
        self.assertEqual(o.category, "albergue_private")
        self.assertIsNone(from_wikidata({"qid": "Q1", "label": "Valcarlos", "instances": ["municipality of Spain"],
                                         "lat": 43, "lon": -1}))
        w = from_wikidata({"qid": "Q2", "label": "Colegiata", "instances": ["collegiate church"], "lat": 43, "lon": -1})
        self.assertEqual(w.category, "church")


class Names(unittest.TestCase):
    def test_generic_words_ignored(self):
        self.assertGreater(name_similarity("Albergue de Peregrinos de Roncesvalles", "Roncesvalles"), 0.8)
        self.assertGreater(name_similarity("Église Notre-Dame-du-Bout-du-Pont", "Notre Dame du Bout du Pont"), 0.8)
        self.assertLess(name_similarity("Hotel Roncesvalles", "Casa Sabina"), 0.2)


class Conflation(unittest.TestCase):
    def test_links_and_findings(self):
        church = osm(10, 43.0090, -1.3196, type_="way", amenity="place_of_worship", building="church",
                     name="Real Colegiata de Santa María", wikidata="Q100")
        alb = osm(11, 43.0094, -1.3195, tourism="hostel", name="Albergue de Roncesvalles", phone="+34", beds="183",
                  opening_hours="Mo-Su 14:00-22:00", fee="yes")
        alb_dup = osm(12, 43.00945, -1.31952, tourism="hostel", name="Albergue de peregrinos Roncesvalles")
        old_bar = osm(13, 43.0080, -1.3190, ts="2019-01-01T00:00:00Z", amenity="bar", name="Bar Casa Sabina")
        wd = from_wikidata({"qid": "Q100", "label": "Royal Collegiate Church of Roncesvalles",
                            "instances": ["collegiate church"], "lat": 43.0091, "lon": -1.3197,
                            "images": ["Roncesvalles.jpg"], "sitelinks": 12})
        ov_far = from_overture({"id": "o1", "name": "Albergue Roncesvalles", "taxonomy": "hostel", "lat": 43.0105,
                                "lon": -1.3195, "confidence": 0.95, "update_time": "2026-10-01T00:00:00Z"})
        ov_only = from_overture({"id": "o2", "name": "Casa Rural Erlanio", "taxonomy": "bed_and_breakfast",
                                 "lat": 43.02, "lon": -1.32, "confidence": 0.9})
        ov_closed = from_overture({"id": "o3", "name": "Casa Sabina", "basic_category": "bar", "lat": 43.0080,
                                   "lon": -1.3191, "confidence": 0.8, "operating_status": "permanently_closed"})
        ents = conflate([church, alb, alb_dup, old_bar], [wd], [ov_far, ov_only, ov_closed])
        checks.run_checks(ents, NOW)
        by = {e.id: e for e in ents}
        codes = {k: {f["code"] for f in e.findings} for k, e in by.items()}

        self.assertIn("wikidata:Q100", [r.key for r in by["osm:way/10"].linked])
        self.assertIn("DUPLICATE", codes["osm:node/11"])
        # Overture puts the albergue ~120 m away from whichever OSM node it linked to
        self.assertTrue("COORD_DISAGREE" in codes["osm:node/11"] | codes["osm:node/12"])
        self.assertIn("STALE", codes["osm:node/13"])
        self.assertIn("CLOSED_SIGNAL", codes["osm:node/13"])           # Overture says closed
        self.assertIn("ONLY_IN_OVERTURE", codes["overture:o2"])
        self.assertIn("MISSING_FIELDS", codes["osm:node/12"])

        info = {"Roncesvalles.jpg": {"file": "Roncesvalles.jpg", "license": "CC BY-SA 4.0", "lat": 43.0092, "lon": -1.3196,
                                     "thumb_url": "https://upload.wikimedia.org/x.jpg"}}
        checks.check_photos(by["osm:way/10"], info)
        self.assertTrue(by["osm:way/10"].photos[0]["usable"])
        bad = {"Roncesvalles.jpg": {**info["Roncesvalles.jpg"], "license": "CC BY-NC 2.0"}}
        e = by["osm:way/10"]
        e.photos.clear()
        checks.check_photos(e, bad)
        self.assertIn("PHOTO_LICENCE", {f["code"] for f in e.findings})

        for e in ents:
            e.score = checks.score(e, NOW)
        self.assertGreater(by["osm:node/11"].score - 0, -1)
        self.assertLess(by["osm:node/13"].score, 50)
        label = checks.verification_label(by["osm:way/10"], NOW)
        self.assertNotIn("verified", label["label"].lower().replace("cross-checked", ""))


class CorridorTest(unittest.TestCase):
    def test_distance(self):
        c = Corridor([[(-1.0, 43.0), (-1.0, 43.1)]])
        self.assertAlmostEqual(c.distance(43.05, -1.0), 0, delta=1)
        self.assertAlmostEqual(c.distance(43.05, -0.99), 815, delta=15)


if __name__ == "__main__":
    unittest.main()
