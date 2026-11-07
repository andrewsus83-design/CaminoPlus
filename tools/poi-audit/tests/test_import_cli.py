"""import_osm.py as a command: the dry run, the files it writes, its refusals, --apply end to end against a mock
PostgREST in a child process (so a key printed to stdout, stderr or a file is really seen), and the stage list
the workflow uses. No network beyond 127.0.0.1. Run: python -m unittest discover -s tests"""
import contextlib
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(HERE))

import import_osm  # noqa: E402
from poi_audit import export, sources  # noqa: E402
from support_import import fixture_dir, load_fixture_stage, replay_cache  # noqa: E402
from support_postgrest import SERVICE_KEY, MockSupabase  # noqa: E402
from test_apply import ROUTE_ID, STAGE_ID, STAGE_ROW  # noqa: E402

SCRIPT = ROOT / "import_osm.py"
FILES = ["stays.ndjson", "pois.ndjson", "stage_stays.ndjson", "stage_pois.ndjson", "skipped.ndjson", "summary.json", "summary.md"]


def run_main(argv):
    """import_osm.main in this process, with every outgoing HTTP request forbidden. (code, stdout, stderr)"""
    out, err = io.StringIO(), io.StringIO()
    with mock.patch("requests.Session.request", side_effect=AssertionError("the dry run must not use the network")), \
            contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        try:
            code = import_osm.main(argv)
        except SystemExit as e:          # argparse
            code = e.code
    return code, out.getvalue(), err.getvalue()


def child(argv, env_extra=None):
    """import_osm.py in a child process with a clean environment (no proxy, no inherited secrets)."""
    env = {"PATH": os.environ.get("PATH", ""), "HOME": os.environ.get("HOME", ""), "PYTHONDONTWRITEBYTECODE": "1", **(env_extra or {})}
    return subprocess.run([sys.executable, str(SCRIPT), *map(str, argv)], capture_output=True, text=True, env=env, timeout=120)


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.stage_dir = fixture_dir("29")
        self.stage = self.stage_dir / "stage.json"
        self.cache = replay_cache(self.tmp, "29")

    def argv(self, out="out", *extra):
        return ["--stage", str(self.stage), "--out", str(self.tmp / out), "--cache", str(self.cache), "--offline", *extra]


class DryRun(Base):
    def test_a_dry_run_writes_the_files_and_says_nothing_was_sent(self):
        code, out, err = run_main(self.argv())
        self.assertEqual(code, 0, err)
        self.assertEqual(sorted(p.name for p in (self.tmp / "out").iterdir()), sorted(FILES))
        self.assertIn("route: OSM route relations:", out)
        self.assertIn("stage line of 22.1 km", out)
        self.assertIn("dry run: nothing was sent to a database", out)
        self.assertNotIn("apply:", out)

    def test_old_overpass_data_is_called_old_on_stderr_and_nowhere_else(self):
        from datetime import datetime

        class On(datetime):
            day = datetime(2026, 11, 7)

            @classmethod
            def now(cls, tz=None):
                return cls.day.replace(tzinfo=tz)

        with mock.patch("import_osm.datetime", On):                    # the fixture's data is of 2026-06-01
            code, out, err = run_main(self.argv("late"))
            On.day = datetime(2026, 6, 10)
            code2, out2, err2 = run_main(self.argv("early"))
        self.assertEqual((code, code2), (0, 0))
        self.assertIn("warning: the Overpass data is 158 days old", err)
        self.assertNotIn("warning", err2)
        for name in FILES:
            self.assertEqual((self.tmp / "late" / name).read_bytes(), (self.tmp / "early" / name).read_bytes(), "the files do not depend on the clock")

    def test_the_files_hold_the_rows_the_library_makes(self):
        from test_export import fixture_plan
        run_main(self.argv())
        plan, _ = fixture_plan("29")
        stage, _ = load_fixture_stage("29")
        back = export.read_plan(self.tmp / "out", stage)
        for table in ("stays", "pois", "stage_stays", "stage_pois"):
            self.assertEqual(getattr(back, table), getattr(plan, table), table)
        s = json.loads((self.tmp / "out" / "summary.json").read_text(encoding="utf-8"))
        self.assertEqual(s["meta"]["osm_timestamp"], "2026-06-01T08:52:28Z")
        self.assertAlmostEqual(s["meta"]["route"]["length_km"], 22.091, delta=0.01)
        self.assertEqual(s["skipped"], {"closed": 9, "unnamed": 3})

    def test_running_it_twice_gives_byte_identical_files(self):
        run_main(self.argv("a"))
        run_main(self.argv("b"))
        for name in FILES:
            self.assertEqual((self.tmp / "a" / name).read_bytes(), (self.tmp / "b" / name).read_bytes(), name)

    def test_the_same_files_come_out_of_a_child_process_and_a_different_hash_seed(self):
        run_main(self.argv("a"))
        r = child(self.argv("b"), {"PYTHONHASHSEED": "12345"})
        self.assertEqual(r.returncode, 0, r.stderr)
        for name in FILES:
            self.assertEqual((self.tmp / "a" / name).read_bytes(), (self.tmp / "b" / name).read_bytes(), name)

    def test_with_an_audit_run_the_score_becomes_data_confidence_and_its_closed_places_are_left_out(self):
        run_main(self.argv("plain"))
        stays = [json.loads(l) for l in (self.tmp / "plain" / "stays.ndjson").read_text(encoding="utf-8").splitlines()]
        keep, drop = stays[0], stays[1]
        audit_file = self.tmp / "entities.json"
        audit_file.write_text(json.dumps({"stage": "camino-frances-29", "entities": [
            {"id": f"osm:{keep['osm_type']}/{keep['osm_id']}", "score": 77, "findings": []},
            {"id": f"osm:{drop['osm_type']}/{drop['osm_id']}", "score": 20,
             "findings": [{"code": "CLOSED_SIGNAL", "message": "Overture says permanently closed"}]}]}), encoding="utf-8")
        code, out, err = run_main(self.argv("with", "--audit", str(audit_file)))
        self.assertEqual(code, 0, err)
        with_audit = [json.loads(l) for l in (self.tmp / "with" / "stays.ndjson").read_text(encoding="utf-8").splitlines()]
        by = {(r["osm_type"], r["osm_id"]): r for r in with_audit}
        self.assertEqual(by[(keep["osm_type"], keep["osm_id"])]["data_confidence"], 77)
        self.assertNotIn((drop["osm_type"], drop["osm_id"]), by)
        skipped = (self.tmp / "with" / "skipped.ndjson").read_text(encoding="utf-8")
        self.assertIn("audit: Overture says permanently closed", skipped)
        self.assertEqual(len(with_audit), len(stays) - 1)

    def test_an_audit_of_another_stage_is_refused_before_anything_is_written(self):
        audit_file = self.tmp / "entities.json"
        audit_file.write_text(json.dumps({"stage": "camino-frances-01", "entities": []}), encoding="utf-8")
        code, out, err = run_main(self.argv("with", "--audit", str(audit_file)))
        self.assertEqual(code, 1)
        self.assertIn("is for stage 'camino-frances-01'", err)
        self.assertFalse((self.tmp / "with").exists())


class Refusals(Base):
    def cache_with(self, route=None, places=None) -> Path:
        stage, _ = load_fixture_stage("29")
        cache_dir = self.tmp / "other-cache"
        cache_dir.mkdir()
        cache = sources.Cache(cache_dir, offline=True)
        (cache.path("route", sources.overpass_route_query(stage["search_bbox"], stage["route_name_regex"]))).write_text(json.dumps(route), encoding="utf-8")
        (cache.path("osm", sources.overpass_poi_query(stage["search_bbox"]))).write_text(
            json.dumps(places or json.loads((self.stage_dir / "overpass-places.json").read_text(encoding="utf-8"))), encoding="utf-8")
        return cache_dir

    def test_no_osm_route_means_no_rows_not_a_guess_from_the_hand_drawn_line(self):
        self.cache = self.cache_with(route={"elements": []})
        code, out, err = run_main(self.argv())
        self.assertEqual(code, 1)
        self.assertIn("no OSM route for this stage", err)
        self.assertIn("nothing was imported", err)
        self.assertFalse((self.tmp / "out").exists())

    def test_ways_that_do_not_connect_the_two_towns_mean_no_rows(self):
        full = json.loads((self.stage_dir / "overpass-route.json").read_text(encoding="utf-8"))
        rel = dict(full["elements"][1])
        rel["members"] = rel["members"][:30] + rel["members"][50:]             # a hole in the middle of the route
        self.cache = self.cache_with(route={"elements": [rel]})
        code, out, err = run_main(self.argv())
        self.assertEqual(code, 1)
        self.assertIn("no line for this stage", err)
        self.assertIn("do not connect the start and the end of the stage", err)
        self.assertFalse((self.tmp / "out").exists())

    def test_offline_without_a_cache_is_an_error_that_says_so(self):
        self.cache = self.tmp / "empty"
        code, out, err = run_main(self.argv())
        self.assertEqual(code, 1)
        self.assertIn("offline mode and no cache", err)

    def test_a_stage_file_without_what_the_importer_needs_is_refused(self):
        bad = self.tmp / "stage.json"
        stage = json.loads(self.stage.read_text(encoding="utf-8"))
        del stage["route_id"]
        bad.write_text(json.dumps(stage), encoding="utf-8")
        self.stage = bad
        code, out, err = run_main(self.argv())
        self.assertEqual((code, "cannot use the stage file" in err), (1, True))
        stage["route_id"] = "not-a-uuid"
        bad.write_text(json.dumps(stage), encoding="utf-8")
        code, out, err = run_main(self.argv())
        self.assertEqual((code, "route_id is not a uuid" in err), (1, True))

    def test_the_command_line(self):
        for argv, text in (([], "--stage is required"),
                           (["--stage", "x.json"], "--out is required"),
                           (["--stage", "x.json", "--from-ndjson", "d", "--audit", "a.json"], "--from-ndjson reads rows from files")):
            code, out, err = run_main(argv)
            self.assertEqual(code, 2, argv)
            self.assertIn(text, err)

    def test_apply_without_the_secrets_stops_before_the_slow_part(self):
        with mock.patch.dict(os.environ, {}, clear=False) as env:
            env.pop("SUPABASE_URL", None)
            env.pop("SUPABASE_SERVICE_ROLE_KEY", None)
            with mock.patch("poi_audit.sources.fetch_overpass", side_effect=AssertionError("it started reading OSM")):
                code, out, err = run_main(self.argv("out", "--apply"))
        self.assertEqual(code, 1)
        self.assertIn("--apply needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment", err)
        self.assertFalse((self.tmp / "out").exists())


class Pause(Base):
    """Overpass etiquette: wait between the route and the places request, but only when both go to the network."""

    def run_with_fake_overpass(self, cache_dir):
        route_answer = json.loads((self.stage_dir / "overpass-route.json").read_text(encoding="utf-8"))
        places_answer = json.loads((self.stage_dir / "overpass-places.json").read_text(encoding="utf-8"))
        sleeps = []

        def fake(cache, query, kind="osm"):
            return route_answer if kind == "route" else places_answer
        with mock.patch("poi_audit.sources.fetch_overpass", side_effect=fake), mock.patch("time.sleep", side_effect=sleeps.append):
            code, out, err = run_main(["--stage", str(self.stage), "--out", str(self.tmp / "out"), "--cache", str(cache_dir), "--pause", "7"])
        return code, sleeps, out

    def test_it_waits_once_between_the_two_requests_when_nothing_is_cached(self):
        code, sleeps, out = self.run_with_fake_overpass(self.tmp / "fresh-cache")
        self.assertEqual((code, sleeps), (0, [7.0]))
        self.assertIn("waiting 7 s between the two Overpass requests", out)

    def test_it_does_not_wait_when_the_answers_come_from_the_cache(self):
        code, sleeps, _ = self.run_with_fake_overpass(self.cache)
        self.assertEqual((code, sleeps), (0, []))


class ApplyEndToEnd(Base):
    """The whole command against a mock server, in a child process."""

    def mock(self, **kw):
        return MockSupabase(stages={STAGE_ID: dict(STAGE_ROW)}, routes={ROUTE_ID}, **kw)

    def everything_written(self, out: Path):
        return b"".join(p.read_bytes() for p in sorted(out.rglob("*")) if p.is_file())

    def test_the_rows_arrive_and_neither_the_key_nor_the_address_appears_anywhere(self):
        with self.mock() as m:
            r = child(self.argv("out", "--apply"), {"SUPABASE_URL": m.url, "SUPABASE_SERVICE_ROLE_KEY": m.key})
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(len(m.places["stays"]), 29)
        self.assertEqual(len(m.links["stage_pois"]), 49)
        self.assertIn("apply: stays: 29 new, 0 refreshed", r.stdout)
        self.assertIn("apply: counts read back match what was sent", r.stdout)
        report = json.loads((self.tmp / "out" / "apply_report.json").read_text(encoding="utf-8"))
        self.assertTrue(report["ok"] and report["verified"])
        host = m.url.split("//")[1]
        for where, text in (("stdout", r.stdout), ("stderr", r.stderr), ("the files in --out", self.everything_written(self.tmp / "out").decode("utf-8"))):
            for secret in (m.key, m.url, host):
                self.assertNotIn(secret, text, f"{secret!r} found in {where}")
        self.assertTrue(all(c["headers"]["authorization"] == f"Bearer {m.key}" for c in m.calls))

    def test_a_server_that_echoes_the_key_in_its_error_still_does_not_get_it_printed(self):
        with self.mock(fail={("POST", "stays"): [(400, "no good: {key} at {url}")]}) as m:
            r = child(self.argv("out", "--apply"), {"SUPABASE_URL": m.url, "SUPABASE_SERVICE_ROLE_KEY": m.key})
        self.assertEqual(r.returncode, 1)
        self.assertIn("ERROR: writing stays: HTTP 400", r.stderr)
        self.assertIn("[hidden]", r.stderr)
        self.assertNotIn("Traceback", r.stderr)
        for text in (r.stdout, r.stderr, self.everything_written(self.tmp / "out").decode("utf-8")):
            self.assertNotIn(m.key, text)
            self.assertNotIn(m.url, text)

    def test_a_stage_that_is_missing_exits_1_and_names_it_after_writing_the_places(self):
        with MockSupabase(routes={ROUTE_ID}) as m:
            r = child(self.argv("out", "--apply"), {"SUPABASE_URL": m.url, "SUPABASE_SERVICE_ROLE_KEY": m.key})
        self.assertEqual(r.returncode, 1)
        self.assertIn(f"ERROR: stage camino-frances-29 ({STAGE_ID}) is not in the database", r.stderr)
        self.assertEqual((len(m.places["stays"]), len(m.links["stage_stays"])), (29, 0))
        self.assertFalse(json.loads((self.tmp / "out" / "apply_report.json").read_text(encoding="utf-8"))["ok"])

    def test_the_address_must_be_https(self):
        r = child(self.argv("out", "--apply"), {"SUPABASE_URL": "http://some-project.supabase.co", "SUPABASE_SERVICE_ROLE_KEY": SERVICE_KEY})
        self.assertEqual(r.returncode, 1)
        self.assertIn("SUPABASE_URL must be an https:// address", r.stderr)
        self.assertNotIn("some-project", r.stdout + r.stderr)
        self.assertNotIn(SERVICE_KEY, r.stdout + r.stderr)

    def test_apply_sends_the_files_so_a_reviewed_edit_is_what_arrives(self):
        run_main(self.argv("dry"))
        path = self.tmp / "dry" / "stays.ndjson"
        rows = [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines()]
        rows[0]["name"] = "Reviewed by a person"
        path.write_text("".join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) + "\n" for r in rows), encoding="utf-8")
        with self.mock() as m:
            r = child(["--stage", self.stage, "--from-ndjson", self.tmp / "dry", "--apply"], {"SUPABASE_URL": m.url, "SUPABASE_SERVICE_ROLE_KEY": m.key})
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(m.places["stays"][(rows[0]["osm_type"], rows[0]["osm_id"])]["name"], "Reviewed by a person")
        self.assertTrue((self.tmp / "dry" / "apply_report.json").exists())
        self.assertNotIn("route:", r.stdout, "it did not read OSM")

    def test_a_file_that_is_no_longer_valid_sends_nothing(self):
        run_main(self.argv("dry"))
        path = self.tmp / "dry" / "pois.ndjson"
        rows = [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines()]
        rows[0]["category"] = "spaceship"
        path.write_text("".join(json.dumps(r) + "\n" for r in rows), encoding="utf-8")
        with self.mock() as m:
            r = child(["--stage", self.stage, "--from-ndjson", self.tmp / "dry", "--apply"], {"SUPABASE_URL": m.url, "SUPABASE_SERVICE_ROLE_KEY": m.key})
        self.assertEqual(r.returncode, 1)
        self.assertIn("category 'spaceship' is not allowed in pois", r.stderr)
        self.assertEqual(m.calls, [], "not one request")

    def test_a_dry_run_in_a_child_with_the_secrets_set_still_sends_nothing(self):
        with self.mock() as m:
            r = child(self.argv("out"), {"SUPABASE_URL": m.url, "SUPABASE_SERVICE_ROLE_KEY": m.key})
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(m.calls, [])
        self.assertFalse((self.tmp / "out" / "apply_report.json").exists())


class StageList(unittest.TestCase):
    """What the workflow's `stages` input expands to."""

    def expand(self, spec):
        return import_osm.expand_stages(spec, list(range(1, 34)))

    def test_ranges_and_lists(self):
        self.assertEqual(self.expand("1-3"), [1, 2, 3])
        self.assertEqual(self.expand("1,5,9"), [1, 5, 9])
        self.assertEqual(self.expand("9,1-2,2,5-6"), [1, 2, 5, 6, 9])
        self.assertEqual(self.expand("33"), [33])
        self.assertEqual(len(self.expand("1-33")), 33)

    def test_everything_else_is_refused(self):
        for bad in ("", " ", "1 2", "1;2", "1,,2", ",1", "1,", "1-", "-1", "1--3", "a", "1-a", "0", "34", "3-1", "1-34", "١", "1\n2", "$(id)", "1-3 ", "1-2-3", "1-99999999999999999999", "5-" + "9" * 5000):
            with self.assertRaises(ValueError, msg=repr(bad)):
                self.expand(bad)

    def test_the_command_prints_the_stage_file_names_and_exits_2_on_a_bad_list(self):
        code, out, err = run_main(["--expand-stages", "1-3,7"])
        self.assertEqual((code, out.split()), (0, ["camino-frances-01.json", "camino-frances-02.json", "camino-frances-03.json", "camino-frances-07.json"]))
        for name in out.split():
            self.assertTrue((import_osm.STAGES_DIR / name).is_file(), name)
        code, out, err = run_main(["--expand-stages", "1-3;rm"])
        self.assertEqual((code, out), (2, ""))
        self.assertIn("stages must be numbers, ranges and commas only", err)
        code, out, err = run_main(["--expand-stages", "99"])
        self.assertEqual(code, 2)
        self.assertIn("no stage file for 99 (stages 1-33 exist)", err)

    def test_the_real_stage_files_are_the_ones_listed(self):
        self.assertEqual(import_osm.available_stages(), list(range(1, 34)))


if __name__ == "__main__":
    unittest.main()
