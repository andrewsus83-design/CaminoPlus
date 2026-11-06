"""The files audit.py writes, and its exit code. No network: every source is replaced by a fake.
Run: python -m unittest discover -s tests"""
import contextlib
import csv
import io
import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

import audit  # noqa: E402
from poi_audit import checks, sources  # noqa: E402
from poi_audit.conflate import conflate  # noqa: E402
from poi_audit.normalize import from_overture, from_wikidata  # noqa: E402
from test_audit import osm  # noqa: E402

NOW = datetime(2026, 11, 6, tzinfo=timezone.utc)
STAGE = HERE.parents[1] / "offline-maps" / "stages" / "camino-frances-01.json"


def church_with_two_far_sources():
    """One place whose position two other sources disagree about: COORD_DISAGREE fires twice."""
    church = osm(10, 43.0090, -1.3196, type_="way", amenity="place_of_worship", building="church",
                 name="Real Colegiata de Santa María", wikidata="Q100")
    wd = from_wikidata({"qid": "Q100", "label": "Real Colegiata", "instances": ["collegiate church"],
                        "lat": 43.0145, "lon": -1.3196, "sitelinks": 12})              # about 600 m north
    ov = from_overture({"id": "o1", "name": "Real Colegiata de Santa Maria", "taxonomy": "church_cathedral",
                        "lat": 43.0115, "lon": -1.3196, "confidence": 0.9, "update_time": "2026-10-01T00:00:00Z"})  # about 280 m
    return conflate([church], [wd], [ov])


class WriteOutputs(unittest.TestCase):
    def write(self, **kw):
        ents = church_with_two_far_sources()
        checks.run_checks(ents, NOW)
        for e in ents:
            e.score = checks.score(e, NOW)
        out = Path(tempfile.mkdtemp()) / "out"
        stage = {"slug": "mini", "name": "Mini stage"}
        status = kw.pop("status", {"route": "ok (OSM route relations)", "osm": "ok (1 raw records)"})
        audit.write_outputs(out, stage, ents, NOW, status, "OSM route relations: test", **kw)
        return out, ents

    def test_files_exist_and_findings_are_unique_per_code(self):
        out, ents = self.write()
        for name in ("entities.json", "places.geojson", "review_queue.csv", "report.md"):
            self.assertTrue((out / name).exists(), name)
        data = json.loads((out / "entities.json").read_text())
        for row in data["entities"]:
            codes = [f["code"] for f in row["findings"]]
            self.assertEqual(len(codes), len(set(codes)), f"{row['id']} has a code twice: a loader would collapse it silently")
        church = next(r for r in data["entities"] if r["id"] == "osm:way/10")
        coord = next(f for f in church["findings"] if f["code"] == "COORD_DISAGREE")
        self.assertEqual(coord["count"], 2)
        self.assertEqual(len(coord["details"]["occurrences"]), 2)
        raw = [f for f in ents[0].findings if f["code"] == "COORD_DISAGREE"]
        self.assertEqual(len(raw), 2, "the scenario must really fire the check twice")

    def test_review_queue_has_one_row_per_entity_and_code(self):
        out, _ = self.write()
        with (out / "review_queue.csv").open(newline="") as f:
            rows = list(csv.DictReader(f))
        keys = [(r["entity_id"], r["code"]) for r in rows]
        self.assertEqual(len(keys), len(set(keys)))
        self.assertEqual(list(rows[0].keys()), ["priority", "entity_id", "name", "category", "score", "severity", "code", "count",
                                                 "message", "lat", "lon", "sources", "decision", "reviewer_note"])
        coord = next(r for r in rows if r["code"] == "COORD_DISAGREE")
        self.assertEqual(coord["count"], "2")
        self.assertEqual(coord["severity"], "medium")
        self.assertEqual(coord["decision"], "")

    def test_places_geojson_points(self):
        out, ents = self.write()
        fc = json.loads((out / "places.geojson").read_text())
        self.assertEqual(len(fc["features"]), len(ents))
        self.assertEqual(fc["features"][0]["geometry"]["type"], "Point")

    def test_report_run_status(self):
        out, _ = self.write()
        self.assertIn("## Run status: OK", (out / "report.md").read_text())
        out, _ = self.write(errors=["osm: FAILED: all Overpass mirrors failed"], warnings=["overture: FAILED: x"])
        text = (out / "report.md").read_text()
        self.assertIn("## Run status: FAILED", text)
        self.assertIn("Do not use these results", text)
        self.assertIn("**osm: FAILED: all Overpass mirrors failed**", text)
        out, _ = self.write(warnings=["wikidata: FAILED: timeout"])
        text = (out / "report.md").read_text()
        self.assertIn("## Run status: DEGRADED", text)
        self.assertIn("**wikidata: FAILED: timeout**", text)
        self.assertEqual(json.loads((out / "entities.json").read_text())["warnings"], ["wikidata: FAILED: timeout"])

    def test_corridor_note_matches_the_buffers(self):
        out, _ = self.write()
        text = (out / "report.md").read_text()
        note = next(line for line in text.splitlines() if line.startswith("- Corridor:"))
        self.assertIn("stays within 1500 m", note)
        self.assertIn("within 1000 m", note)
        self.assertIn("within 500 m", note)
        # It used to say "other places within 1000 m" although services and "other" use 500 m.
        for family, metres in audit.BUFFER_M.items():
            self.assertIn(f"{metres} m", note, family)
        self.assertIn("water and services", note)

    def test_findings_table_counts_places(self):
        out, _ = self.write()
        text = (out / "report.md").read_text()
        self.assertIn("| Code | Places | Meaning |", text)
        self.assertRegex(text, r"\| `COORD_DISAGREE` \| 1 \|")


class Judge(unittest.TestCase):
    OK = {"route": "ok (OSM route relations)", "osm": "ok (120 raw records)", "overture": "ok (80 raw records, release 2026-10-21.0)",
          "wikidata": "ok (50 raw records)", "commons": "ok (3 files checked)"}

    def judge(self, strict=False, **changes):
        return audit.judge({**self.OK, **changes}, strict)

    def test_all_ok(self):
        self.assertEqual(self.judge(), ([], []))
        self.assertEqual(self.judge(strict=True), ([], []))

    def test_osm_and_route_failures_are_errors(self):
        errors, warnings = self.judge(osm="FAILED: all Overpass mirrors failed")
        self.assertEqual((len(errors), warnings), (1, []))
        errors, _ = self.judge(route="FAILED: the route request to OSM failed: x; used the hand-drawn fallback line")
        self.assertIn("route: FAILED", errors[0])
        errors, _ = self.judge(osm="ok (0 raw records)")
        self.assertEqual(errors, ["osm: OpenStreetMap returned no places at all"])
        errors, _ = self.judge(osm="skipped")
        self.assertEqual(errors, ["osm: skipped with --skip"])

    def test_other_sources_only_degrade_unless_strict(self):
        for name in ("overture", "wikidata", "commons"):
            errors, warnings = self.judge(**{name: "FAILED: timeout"})
            self.assertEqual(errors, [], name)
            self.assertEqual(warnings, [f"{name}: FAILED: timeout"], name)
            errors, warnings = self.judge(strict=True, **{name: "FAILED: timeout"})
            self.assertEqual(errors, [f"{name}: FAILED: timeout"], name)
            self.assertEqual(warnings, [], name)
        errors, warnings = self.judge(overture="skipped")
        self.assertEqual((errors, warnings), ([], ["overture: skipped with --skip"]))

    def test_ai_never_fails_the_run(self):
        errors, warnings = self.judge(strict=True, ai="skipped: no ANTHROPIC_API_KEY or anthropic package")
        self.assertEqual(errors, [])
        self.assertEqual(len(warnings), 1)
        self.assertEqual(self.judge(strict=True, ai="ok (3 places, model m)"), ([], []))


def overpass_for(route_fails=False, osm_fails=False, osm_empty=False):
    route = {"elements": [{"type": "relation", "tags": {"name": "Camino Francés - 01"}, "members": [
        {"type": "way", "geometry": [{"lat": 43.1636, "lon": -1.2376}, {"lat": 43.0094, "lon": -1.3195}]}]}]}
    places = {"elements": [
        {"type": "node", "id": 1, "lat": 43.1630, "lon": -1.2370, "timestamp": "2026-09-01T10:00:00Z", "version": 2,
         "tags": {"amenity": "cafe", "name": "Cafe Uno", "opening_hours": "Mo-Su 08:00-20:00", "phone": "+34 1"}},
        {"type": "node", "id": 2, "lat": 43.1620, "lon": -1.2380, "timestamp": "2022-09-01T10:00:00Z", "version": 2,
         "tags": {"disused:amenity": "cafe", "name": "Cafe Cerrado"}}]}

    def fake(cache, query, kind="osm"):
        if kind == "route":
            if route_fails:
                raise RuntimeError("all Overpass mirrors failed")
            return route
        if osm_fails:
            raise RuntimeError("all Overpass mirrors failed")
        return {"elements": []} if osm_empty else places
    return fake


class Main(unittest.TestCase):
    def run_main(self, *, strict=False, extra=(), overture_error=None, wikidata_error=None, release_error=None, **overpass):
        tmp = Path(tempfile.mkdtemp())
        out = tmp / "out"
        args = ["--stage", str(STAGE), "--out", str(out), "--cache", str(tmp / "cache"), "--now", "2026-11-06", *extra]
        if strict:
            args.append("--strict")
        patches = [
            mock.patch.object(sources, "fetch_overpass", side_effect=overpass_for(**overpass)),
            mock.patch.object(sources, "resolve_overture_release",
                              side_effect=RuntimeError(release_error) if release_error else None, return_value="2026-10-21.0"),
            mock.patch.object(sources, "fetch_overture", side_effect=RuntimeError(overture_error) if overture_error else None, return_value=[]),
            mock.patch.object(sources, "fetch_wikidata", side_effect=RuntimeError(wikidata_error) if wikidata_error else None, return_value=[]),
            mock.patch.object(sources, "fetch_commons_info", return_value={}),
        ]
        with contextlib.ExitStack() as stack:
            for p in patches:
                stack.enter_context(p)
            stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
            stderr = stack.enter_context(contextlib.redirect_stderr(io.StringIO()))
            code = audit.main(args)
        report = (out / "report.md").read_text()
        data = json.loads((out / "entities.json").read_text())
        return code, report, data, stderr.getvalue()

    def test_healthy_run_exits_zero_even_when_strict(self):
        code, report, data, _ = self.run_main(strict=True)
        self.assertEqual(code, 0)
        self.assertIn("## Run status: OK", report)
        self.assertEqual(data["sources"]["route"], "ok (OSM route relations)")
        self.assertIn("release 2026-10-21.0", data["sources"]["overture"])
        closed = [e for e in data["entities"] if any(f["code"] == "CLOSED_SIGNAL" for f in e["findings"])]
        self.assertEqual([e["name"] for e in closed], ["Cafe Cerrado"], "disused:amenity places must reach the report")

    def test_route_failure_is_an_error_and_is_visible(self):
        code, report, data, stderr = self.run_main(route_fails=True)
        self.assertEqual(code, 1)
        self.assertIn("## Run status: FAILED", report)
        self.assertIn("hand-drawn fallback", report)
        self.assertTrue(data["sources"]["route"].startswith("FAILED"))
        self.assertIn("ERROR: route: FAILED", stderr)
        self.assertGreater(len(data["entities"]), 0, "outputs are still written for debugging")

    def test_osm_failure_is_an_error(self):
        code, report, data, _ = self.run_main(osm_fails=True)
        self.assertEqual(code, 1)
        self.assertIn("## Run status: FAILED", report)
        self.assertTrue(data["sources"]["osm"].startswith("FAILED"))

    def test_osm_with_no_places_is_an_error(self):
        code, report, _, _ = self.run_main(osm_empty=True)
        self.assertEqual(code, 1)
        self.assertIn("OpenStreetMap returned no places at all", report)

    def test_overture_failure_degrades_and_fails_only_in_strict_mode(self):
        code, report, data, stderr = self.run_main(overture_error="S3 unreachable")
        self.assertEqual(code, 0)
        self.assertIn("## Run status: DEGRADED", report)
        self.assertIn("overture: FAILED: S3 unreachable", report)
        self.assertIn("warning: overture", stderr)
        code, report, _, stderr = self.run_main(overture_error="S3 unreachable", strict=True)
        self.assertEqual(code, 1)
        self.assertIn("## Run status: FAILED", report)
        self.assertIn("ERROR: overture: FAILED: S3 unreachable", stderr)

    def test_unresolvable_overture_release_is_a_failed_source_with_the_hint(self):
        code, report, _, _ = self.run_main(release_error="could not find the latest Overture release (STAC catalog: down). Set OVERTURE_RELEASE=YYYY-MM-DD.N to pin one.")
        self.assertEqual(code, 0)
        self.assertIn("Set OVERTURE_RELEASE=YYYY-MM-DD.N", report)
        code, _, _, _ = self.run_main(release_error="x", strict=True)
        self.assertEqual(code, 1)

    def test_wikidata_failure_degrades(self):
        code, report, _, _ = self.run_main(wikidata_error="HTTP 429")
        self.assertEqual(code, 0)
        self.assertIn("wikidata: FAILED: HTTP 429", report)
        self.assertEqual(self.run_main(wikidata_error="HTTP 429", strict=True)[0], 1)

    def test_skipping_a_source_is_not_clean_in_strict_mode(self):
        self.assertEqual(self.run_main(extra=["--skip", "wikidata"])[0], 0)
        self.assertEqual(self.run_main(extra=["--skip", "wikidata"], strict=True)[0], 1)
        self.assertEqual(self.run_main(extra=["--skip", "osm"])[0], 1)


if __name__ == "__main__":
    unittest.main()
