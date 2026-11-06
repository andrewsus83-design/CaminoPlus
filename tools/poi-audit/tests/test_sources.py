"""Source helpers without a network: the Overpass query, closed-place records, the Overture release.
Run: python -m unittest discover -s tests"""
import json
import os
import re
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from poi_audit import checks, sources  # noqa: E402
from poi_audit.conflate import conflate  # noqa: E402
from poi_audit.normalize import closed_signal_keys, from_osm, strip_lifecycle  # noqa: E402

FIXTURES = Path(__file__).resolve().parent / "fixtures"
NOW = datetime(2026, 11, 6, tzinfo=timezone.utc)


class OverpassQuery(unittest.TestCase):
    def test_lifecycle_spellings_are_requested(self):
        q = sources.overpass_poi_query([-1.42, 42.97, -1.15, 43.2])
        # Before, only live tags were selected: disused: / abandoned: places never arrived.
        for key in ("tourism", "amenity", "shop"):
            for prefix in ("", "disused:", "abandoned:", "was:", "demolished:"):
                self.assertRegex(q, rf'nwr\["{re.escape(prefix)}{key}"~"\^\(')
        self.assertIn("(42.97,-1.42,43.2,-1.15)", q)               # bbox order: south, west, north, east
        self.assertIn('nwr["historic"]', q)
        self.assertTrue(q.strip().endswith("out center tags meta;"))

    def test_query_is_balanced(self):
        q = sources.overpass_poi_query([0, 0, 1, 1])
        self.assertEqual(q.count("("), q.count(")"))
        self.assertEqual(q.count("["), q.count("]"))


class ClosedPlaces(unittest.TestCase):
    def setUp(self):
        self.elements = json.loads((FIXTURES / "overpass_lifecycle.json").read_text())["elements"]
        self.records = {el["id"]: from_osm(el) for el in self.elements}

    def test_closed_places_become_records_with_their_original_category(self):
        self.assertEqual(self.records[1].category, "cafe")
        self.assertEqual(self.records[2].category, "cafe")                  # disused:amenity=cafe
        self.assertEqual(self.records[3].category, "albergue_private")      # abandoned:tourism=hostel + "Albergue"
        self.assertEqual(self.records[5].category, "restaurant")            # was:amenity=restaurant
        self.assertEqual(self.records[6].category, "cafe")
        self.assertEqual(self.records[4].category, "supermarket")           # the live tag wins
        self.assertIsNone(self.records[7], "disused:railway is not a place we audit")

    def test_original_tags_stay_on_the_record(self):
        self.assertIn("disused:amenity", self.records[2].tags)
        self.assertEqual(self.records[2].name, "Cafe Cerrado")

    def test_strip_lifecycle_keeps_live_tags(self):
        self.assertEqual(strip_lifecycle({"shop": "supermarket", "disused:amenity": "bar"})["shop"], "supermarket")
        self.assertEqual(strip_lifecycle({"disused:amenity": "cafe"})["amenity"], "cafe")
        self.assertNotIn("phone", strip_lifecycle({"disused:phone": "1"}))   # only primary keys

    def test_closed_signal_keys(self):
        self.assertEqual(closed_signal_keys({"disused:amenity": "cafe"}), ["disused:amenity"])
        self.assertEqual(closed_signal_keys({"was:amenity": "restaurant"}), ["was:amenity"])
        self.assertEqual(closed_signal_keys({"disused": "yes", "amenity": "cafe"}), ["disused"])
        # not closures: a live place that used to be something else, or an old phone number
        self.assertEqual(closed_signal_keys({"shop": "supermarket", "disused:shop": "bar", "amenity": "cafe", "disused:amenity": "bar"}), [])
        self.assertEqual(closed_signal_keys({"amenity": "cafe", "disused:phone": "+34 1"}), [])
        self.assertEqual(closed_signal_keys({"disused": "no", "amenity": "cafe"}), [])

    def test_closed_places_raise_closed_signal_and_live_ones_do_not(self):
        recs = [r for r in self.records.values() if r]
        ents = conflate(recs, [], [])
        checks.run_checks(ents, NOW)
        closed = {e.id for e in ents if any(f["code"] == "CLOSED_SIGNAL" for f in e.findings)}
        self.assertEqual(closed, {"osm:node/2", "osm:node/3", "osm:node/5", "osm:node/6"})
        for e in ents:
            if e.id in closed:
                finding = next(f for f in e.findings if f["code"] == "CLOSED_SIGNAL")
                self.assertEqual(finding["severity"], "high")
        # live cafe, live supermarket that used to be a bar, live cafe with an old phone number
        for live in ("osm:node/1", "osm:node/4", "osm:node/8"):
            self.assertNotIn("CLOSED_SIGNAL", {f["code"] for e in ents if e.id == live for f in e.findings}, live)


def fake_response(payload):
    resp = mock.Mock()
    resp.json.return_value = payload
    resp.raise_for_status.return_value = None
    return resp


class OvertureRelease(unittest.TestCase):
    def setUp(self):
        env = mock.patch.dict(os.environ)  # restores the environment after each test
        env.start()
        self.addCleanup(env.stop)
        os.environ.pop("OVERTURE_RELEASE", None)

    def cache(self, offline=False):
        return sources.Cache(Path(tempfile.mkdtemp()), offline=offline)

    def test_env_override_wins_and_is_validated(self):
        os.environ["OVERTURE_RELEASE"] = "2026-09-23.1"
        self.assertEqual(sources.resolve_overture_release(self.cache()), "2026-09-23.1")
        os.environ["OVERTURE_RELEASE"] = "latest"
        with self.assertRaisesRegex(RuntimeError, "not a release name"):
            sources.resolve_overture_release(self.cache())

    def test_latest_comes_from_the_stac_catalog_and_is_remembered(self):
        catalog = {"latest": "2026-10-21.0", "links": [{"rel": "child", "href": "https://stac.overturemaps.org/2026-09-23.0/catalog.json"}]}
        cache = self.cache()
        with mock.patch.object(sources, "_session") as sess:
            sess.return_value.get.return_value = fake_response(catalog)
            self.assertEqual(sources.resolve_overture_release(cache), "2026-10-21.0")
            sess.return_value.get.assert_called_once()
        # an --offline replay reuses what the last online run found
        offline = sources.Cache(cache.dir, offline=True)
        self.assertEqual(sources.resolve_overture_release(offline), "2026-10-21.0")

    def test_without_a_latest_field_the_newest_child_is_used(self):
        catalog = {"links": [
            {"rel": "root", "href": "https://stac.overturemaps.org/catalog.json"},
            {"rel": "child", "href": "https://stac.overturemaps.org/2026-09-23.0/catalog.json"},
            {"rel": "child", "href": "https://stac.overturemaps.org/2026-10-21.0/catalog.json"},
            {"rel": "child", "href": "https://stac.overturemaps.org/2026-09-23.1/catalog.json"},
        ]}
        with mock.patch.object(sources, "_session") as sess:
            sess.return_value.get.return_value = fake_response(catalog)
            self.assertEqual(sources.resolve_overture_release(self.cache()), "2026-10-21.0")

    def test_release_order_is_by_date_then_number(self):
        names = ["2026-09-23.0", "2026-10-21.0", "2026-10-21.1", "2026-10-21.10", "2026-10-21.2"]
        self.assertEqual(max(names, key=sources._release_key), "2026-10-21.10")

    def test_falls_back_to_the_s3_listing(self):
        with mock.patch.object(sources, "_latest_from_stac", side_effect=RuntimeError("catalog down")), \
             mock.patch.object(sources, "_latest_from_s3", return_value="2026-10-21.0"):
            self.assertEqual(sources.resolve_overture_release(self.cache()), "2026-10-21.0")

    def test_clear_failure_message_when_nothing_works(self):
        with mock.patch.object(sources, "_latest_from_stac", side_effect=RuntimeError("catalog down")), \
             mock.patch.object(sources, "_latest_from_s3", side_effect=RuntimeError("bucket unreachable")):
            with self.assertRaises(RuntimeError) as ctx:
                sources.resolve_overture_release(self.cache())
        msg = str(ctx.exception)
        self.assertIn("STAC catalog: catalog down", msg)
        self.assertIn("S3 listing: bucket unreachable", msg)
        self.assertIn("OVERTURE_RELEASE=YYYY-MM-DD.N", msg)

    def test_offline_without_a_remembered_release_says_how_to_fix_it(self):
        with self.assertRaisesRegex(RuntimeError, "offline mode and no cached Overture release"):
            sources.resolve_overture_release(self.cache(offline=True))


if __name__ == "__main__":
    unittest.main()
