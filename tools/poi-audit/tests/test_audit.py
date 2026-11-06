"""Offline tests with hand-made records. Run: python -m unittest discover -s tests"""
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from poi_audit import checks  # noqa: E402
from poi_audit.conflate import Entity, conflate  # noqa: E402
from poi_audit.normalize import (Corridor, from_osm, from_overture, from_wikidata,  # noqa: E402
                                 name_similarity, names_conflict)

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

    def test_sharing_only_the_village_is_not_a_match(self):
        # Both shrink to {"zubiri"} once the generic words go: they used to score 1.00.
        self.assertLessEqual(name_similarity("Albergue Municipal de Zubiri", "Hostal Zubiri"), 0.3)
        self.assertLessEqual(name_similarity("Albergue Municipal de Zubiri", "Albergue Parroquial de Zubiri"), 0.3)
        self.assertLessEqual(name_similarity("Hotel Roncesvalles", "Albergue Roncesvalles"), 0.3)
        self.assertTrue(names_conflict("Albergue Municipal de Zubiri", "Hostal Zubiri"))

    def test_same_place_written_differently_still_matches(self):
        for a, b in [("Albergue de Roncesvalles", "Albergue de peregrinos Roncesvalles"),
                     ("Bar Casa Sabina", "Casa Sabina"),
                     ("Hostel Casa Ignacio", "Albergue Casa Ignacio"),          # an albergue is a hostel
                     ("Albergue de Zubiri", "Albergue Municipal de Zubiri"),    # one side names no operator
                     ("Hotel Rural Casa Sabina", "Casa Rural Sabina")]:
            self.assertGreater(name_similarity(a, b), 0.8, (a, b))
            self.assertFalse(names_conflict(a, b), (a, b))

    def test_conflate_does_not_merge_two_businesses_of_one_village(self):
        municipal = osm(20, 42.9300, -1.5036, tourism="hostel", name="Albergue Municipal de Zubiri", phone="+34 948 000 000")
        hostal = from_overture({"id": "zub1", "name": "Hostal Zubiri", "taxonomy": "inn", "basic_category": "lodging",
                                "lat": 42.9301, "lon": -1.5037, "confidence": 0.9})
        ents = conflate([municipal], [], [hostal])
        self.assertEqual(len(ents), 2, "the hostal must stay its own entity (and show as ONLY_IN_OVERTURE)")
        checks.run_checks(ents, NOW)
        by = {e.id: e for e in ents}
        self.assertEqual(by["osm:node/20"].linked, [])
        self.assertIn("ONLY_IN_OVERTURE", {f["code"] for f in by["overture:zub1"].findings})

    def test_two_conflicting_osm_names_are_not_flagged_as_duplicates(self):
        a = osm(21, 42.9300, -1.5036, tourism="hostel", name="Albergue Municipal de Zubiri")
        b = osm(22, 42.9300, -1.50362, tourism="hostel", name="Hostal Zubiri")
        ents = conflate([a, b], [], [])
        checks.run_checks(ents, NOW)
        self.assertNotIn("DUPLICATE", {f["code"] for e in ents for f in e.findings})


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
        # The complete albergue (contact, hours, beds, price) must outscore its sparse duplicate, and the
        # one with a high CLOSED_SIGNAL plus STALE must be the worst of the OSM places.
        self.assertGreater(by["osm:node/11"].score, by["osm:node/12"].score)
        self.assertGreater(by["osm:node/12"].score, by["osm:node/13"].score)
        self.assertLess(by["osm:node/13"].score, 50)
        # None of these may call itself "data cross-checked": each has an open medium or high finding.
        for e in ents:
            self.assertEqual(checks.verification_label(e, NOW)["level"], "unverified", e.id)
        label = checks.verification_label(by["osm:way/10"], NOW)
        self.assertNotIn("verified", label["label"].lower().replace("not verified", "").replace("cross-checked", ""))


def entity(score, severities=(), sources=("osm",)):
    """An Entity with a given score and findings, for the label gate."""
    recs = [from_osm({"type": "node", "id": 900, "lat": 43, "lon": -1, "tags": {"amenity": "cafe", "name": "X"}})]
    e = Entity(primary=recs[0])
    if "overture" in sources:
        e.linked.append(from_overture({"id": "x", "name": "X", "basic_category": "cafe", "lat": 43, "lon": -1}))
    e.score = score
    e.findings = [{"code": f"C{i}", "severity": s, "message": s, "details": {}} for i, s in enumerate(severities)]
    return e


class VerificationGate(unittest.TestCase):
    def level(self, e):
        return checks.verification_label(e, NOW)["level"]

    def test_high_score_without_blocking_findings_earns_data_check(self):
        e = entity(80, sources=("osm", "overture"))
        label = checks.verification_label(e, NOW)
        self.assertEqual(label["level"], "data_check")
        self.assertEqual(label["label"], "Data cross-checked Nov 2026 · 2 open sources")
        self.assertEqual(self.level(entity(75)), "data_check")                    # the threshold itself
        self.assertEqual(self.level(entity(95, severities=("low", "info"))), "data_check")  # low / info do not block

    def test_everything_else_stays_unverified(self):
        self.assertEqual(self.level(entity(74)), "unverified")                    # just under
        self.assertEqual(self.level(entity(10)), "unverified")
        self.assertEqual(self.level(entity(95, severities=("medium",))), "unverified")
        self.assertEqual(self.level(entity(95, severities=("high",))), "unverified")
        self.assertEqual(self.level(entity(95, severities=("low", "medium"))), "unverified")

    def test_unverified_label_never_claims_a_check(self):
        label = checks.verification_label(entity(95, severities=("high",)), NOW)
        self.assertEqual(label["label"], "Not verified yet")
        self.assertNotIn("cross-checked", label["label"].lower())
        self.assertIn("review", label["note"])

    def test_a_clean_complete_place_really_reaches_it(self):
        # End to end through the real checks and score: complete OSM stay, confirmed by Overture.
        a = osm(30, 43.0, -1.0, ts="2026-09-01T00:00:00Z", tourism="hostel", name="Albergue Casa Ignacio", phone="+34 1",
                opening_hours="Mo-Su 12:00-22:00", beds="30", fee="yes")
        o = from_overture({"id": "o30", "name": "Albergue Casa Ignacio", "taxonomy": "hostel", "lat": 43.00001, "lon": -1.00001,
                           "confidence": 0.9, "update_time": "2026-09-01T00:00:00Z"})
        ents = conflate([a], [], [o])
        checks.run_checks(ents, NOW)
        ents[0].score = checks.score(ents[0], NOW)
        self.assertEqual(ents[0].findings, [])
        self.assertGreaterEqual(ents[0].score, 75)
        self.assertEqual(checks.verification_label(ents[0], NOW)["level"], "data_check")


class Aggregation(unittest.TestCase):
    def test_one_finding_per_code_worst_severity_first(self):
        raw = [
            {"code": "COORD_DISAGREE", "severity": "medium", "message": "overture puts it 150 m away", "details": {"distance_m": 150}},
            {"code": "COORD_DISAGREE", "severity": "medium", "message": "wikidata puts it 300 m away", "details": {"distance_m": 300}},
            {"code": "MISSING_FIELDS", "severity": "low", "message": "Missing: price", "details": {"fields": ["price"]}},
            {"code": "CLOSED_SIGNAL", "severity": "high", "message": "Overture says permanently closed", "details": {}},
            {"code": "CLOSED_SIGNAL", "severity": "high", "message": "OSM marks it as disused or abandoned", "details": {"tags": ["disused:amenity"]}},
        ]
        out = checks.aggregate_findings(raw)
        self.assertEqual([f["code"] for f in out], ["CLOSED_SIGNAL", "COORD_DISAGREE", "MISSING_FIELDS"])
        self.assertEqual(len({f["code"] for f in out}), len(out), "codes must be unique (data_audit_findings unique (entity_key, code))")
        coord = out[1]
        self.assertEqual(coord["count"], 2)
        self.assertEqual(coord["severity"], "medium")
        self.assertIn("150 m", coord["message"])
        self.assertIn("300 m", coord["message"])
        self.assertEqual([o["distance_m"] for o in coord["details"]["occurrences"]], [150, 300])
        self.assertEqual(out[0]["details"]["occurrences"][1]["tags"], ["disused:amenity"])

    def test_severity_is_the_worst_of_the_group(self):
        out = checks.aggregate_findings([
            {"code": "ONLY_IN_OVERTURE", "severity": "low", "message": "a", "details": {}},
            {"code": "ONLY_IN_OVERTURE", "severity": "medium", "message": "b", "details": {}},
        ])
        self.assertEqual(out[0]["severity"], "medium")

    def test_empty(self):
        self.assertEqual(checks.aggregate_findings([]), [])


class CorridorTest(unittest.TestCase):
    def test_distance(self):
        c = Corridor([[(-1.0, 43.0), (-1.0, 43.1)]])
        self.assertAlmostEqual(c.distance(43.05, -1.0), 0, delta=1)
        self.assertAlmostEqual(c.distance(43.05, -0.99), 815, delta=15)


if __name__ == "__main__":
    unittest.main()
