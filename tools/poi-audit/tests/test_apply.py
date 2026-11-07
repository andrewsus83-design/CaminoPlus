"""--apply against a mock PostgREST: what is written, what is refused, what is left alone, and that the
service key and the address never leave the process. No network beyond 127.0.0.1. Run: python -m unittest discover -s tests"""
import copy
import re
import sys
import unittest
import uuid
from pathlib import Path

import requests

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

from poi_audit import apply as applying  # noqa: E402
from poi_audit import export, route  # noqa: E402
from poi_audit.apply import ApplyError, Client  # noqa: E402
from support_postgrest import SERVICE_KEY, MockSupabase  # noqa: E402
from test_export import ROUTE_ID, STAGE_ID, fixture_plan, node  # noqa: E402

STAGE_ROW = {"route_id": ROUTE_ID, "stage_number": 29, "deleted_at": None}
FIXTURE_STAGE = {"slug": "camino-frances-29", "name": "Sarria to Portomarín", "stage_number": 29, "stage_id": STAGE_ID, "route_id": ROUTE_ID}


def client_for(mock: MockSupabase, **kw) -> Client:
    session = requests.Session()
    session.trust_env = False                                   # no proxy for 127.0.0.1
    return Client.from_env({"SUPABASE_URL": mock.url, "SUPABASE_SERVICE_ROLE_KEY": mock.key}, session=session, sleep=lambda s: None, **kw)


def healthy(**kw) -> MockSupabase:
    return MockSupabase(stages={STAGE_ID: dict(STAGE_ROW)}, routes={ROUTE_ID}, **kw)


def writes(mock, table=None):
    return [c for c in mock.calls if c["method"] == "POST" and (table is None or c["path"].endswith("/" + table))]


class FirstRun(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.plan, _ = fixture_plan("29")

    def run_apply(self, mock=None, plan=None):
        mock = mock or healthy()
        log = []
        with mock:
            report = applying.apply_plan(client_for(mock), plan or self.plan, log.append)
        return mock, report, log

    def test_every_place_and_every_link_is_written_and_read_back(self):
        mock, report, log = self.run_apply()
        self.assertTrue(report["ok"], report)
        self.assertTrue(report["verified"])
        self.assertEqual(report["places"]["stays"], {"new": len(self.plan.stays), "refreshed": 0, "left_alone": 0, "deleted": 0})
        self.assertEqual(report["places"]["pois"]["new"], len(self.plan.pois))
        self.assertEqual(report["links"], {"stage_stays": len(self.plan.stage_stays), "stage_pois": len(self.plan.stage_pois)})
        self.assertEqual(len(mock.places["stays"]), len(self.plan.stays))
        self.assertEqual(len(mock.places["pois"]), len(self.plan.pois))
        self.assertEqual(len(mock.links["stage_stays"]), len(self.plan.stage_stays))
        self.assertEqual(len(mock.links["stage_pois"]), len(self.plan.stage_pois))
        self.assertIn("apply: counts read back match what was sent", log)

    def test_the_link_rows_point_at_the_ids_the_database_made(self):
        mock, _, _ = self.run_apply()
        stay_ids = mock.place_ids("stays")
        for (stage_id, stay_id), row in mock.links["stage_stays"].items():
            self.assertEqual(stage_id, STAGE_ID)
            self.assertIn(stay_id, stay_ids)
        sample = next(l for l in self.plan.stage_stays if l["osm_id"] == 470350604)
        stay = mock.places["stays"][("node", 470350604)]
        link = mock.links["stage_stays"][(STAGE_ID, stay["id"])]
        self.assertEqual((link["km_from_stage_start"], link["detour_m"]), (sample["km_from_stage_start"], sample["detour_m"]))

    def test_the_stored_rows_are_what_the_plan_says_and_new_rows_are_unverified_osm_rows(self):
        mock, _, _ = self.run_apply()
        for row in self.plan.stays:
            stored = mock.places["stays"][(row["osm_type"], row["osm_id"])]
            for column in export.STAY_COLUMNS:
                self.assertEqual(stored[column], row[column], f"{row['osm_id']} {column}")
            self.assertEqual((stored["source"], stored["verification_level"], stored["route_id"]), ("osm", "unverified", ROUTE_ID))

    def test_requests_are_what_postgrest_documents(self):
        mock, _, _ = self.run_apply()
        for call in writes(mock):
            self.assertEqual(call["headers"]["prefer"], "resolution=merge-duplicates,return=representation")
            self.assertEqual(call["headers"]["apikey"], mock.key)
            self.assertEqual(call["headers"]["authorization"], f"Bearer {mock.key}")
            self.assertEqual(call["headers"]["content-type"], "application/json")
            self.assertLessEqual(len(call["json"]), 500)
        for table in ("stays", "pois"):
            call = writes(mock, table)[0]
            self.assertEqual(call["query"]["on_conflict"], "osm_type,osm_id")
            self.assertEqual(call["query"]["columns"], ",".join(export.COLUMNS[table]))
            self.assertNotIn("kind", call["json"][0], "stays.kind is generated: the database refuses a value")
        self.assertEqual(writes(mock, "stage_stays")[0]["query"]["on_conflict"], "stage_id,stay_id")
        self.assertEqual(writes(mock, "stage_pois")[0]["query"]["on_conflict"], "stage_id,poi_id")

    def test_everything_is_read_before_anything_is_written(self):
        mock, _, _ = self.run_apply()
        order = [(c["method"], c["path"].rsplit("/", 1)[1]) for c in mock.calls]
        first_write = next(i for i, (m, _) in enumerate(order) if m == "POST")
        self.assertTrue(all(m == "GET" for m, _ in order[:first_write]))
        self.assertEqual(order[0], ("GET", "stages"))
        self.assertIn(("GET", "routes"), order[:first_write])
        self.assertEqual([t for m, t in order if m == "POST"], ["stays", "pois", "stage_stays", "stage_pois"])

    def test_batches_are_at_most_500_rows(self):
        line = route.StageLine([(-1.5, 43.0), (-1.3, 43.0)])
        records = [node(1000 + i, 43.0 + (i % 7) * 1e-4, -1.5 + i * 1e-5, tourism="hostel", name=f"Albergue {i}") for i in range(1203)]
        big = export.build_plan(FIXTURE_STAGE, records, line, {"stay": 1500, "food": 1000, "worship": 1000, "heritage": 1000, "service": 500, "other": 500})
        self.assertEqual(len(big.stays), 1203)
        mock, report, _ = self.run_apply(plan=big)
        self.assertTrue(report["ok"], report)
        self.assertEqual([len(c["json"]) for c in writes(mock, "stays")], [500, 500, 203])
        self.assertEqual([len(c["json"]) for c in writes(mock, "stage_stays")], [500, 500, 203])
        self.assertEqual(len(mock.places["stays"]), 1203)
        # the read filters stay short: ids per GET are limited
        for c in mock.calls:
            if c["method"] == "GET":
                self.assertLess(len(c["query"].get("osm_id", "")), 2000)


class SecondRun(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.plan, _ = fixture_plan("29")

    def test_running_again_refreshes_the_osm_columns_and_nothing_else(self):
        mock = healthy()
        with mock:
            first = applying.apply_plan(client_for(mock), self.plan, lambda m: None)
            ids = {k: dict(v) for k, v in mock.places["stays"].items()}
            before = len(mock.calls)
            second = applying.apply_plan(client_for(mock), self.plan, lambda m: None)
        self.assertTrue(first["ok"] and second["ok"])
        self.assertEqual(second["places"]["stays"], {"new": 0, "refreshed": len(self.plan.stays), "left_alone": 0, "deleted": 0})
        for call in writes(mock, "stays")[1:]:
            self.assertEqual(sorted(call["json"][0]), sorted(c for c in export.STAY_COLUMNS if c not in export.INSERT_ONLY["stays"]))
            for insert_only in export.INSERT_ONLY["stays"]:
                self.assertNotIn(insert_only, call["json"][0])
        for call in writes(mock, "pois")[1:]:
            for insert_only in export.INSERT_ONLY["pois"]:
                self.assertNotIn(insert_only, call["json"][0])
        for key, row in mock.places["stays"].items():
            self.assertEqual(row["id"], ids[key]["id"], "an id never changes")
        self.assertEqual(len(mock.places["stays"]), len(self.plan.stays))
        self.assertGreater(len(mock.calls), before)
        # Documented cost: the database's touch trigger bumps updated_at on every update, so every row the second
        # run writes is one more change that apps will sync, although nothing in it differs.
        self.assertTrue(all(n == 1 for (t, _), n in mock.touches.items() if t == "stays"))

    def test_a_phone_that_osm_no_longer_has_is_removed_from_the_row_it_refreshes(self):
        mock = healthy()
        plan = copy.deepcopy(self.plan)
        with mock:
            applying.apply_plan(client_for(mock), plan, lambda m: None)
            row = next(r for r in plan.stays if r["phone"])
            key = (row["osm_type"], row["osm_id"])
            self.assertIsNotNone(mock.places["stays"][key]["phone"])
            row["phone"] = None
            applying.apply_plan(client_for(mock), plan, lambda m: None)
        self.assertIsNone(mock.places["stays"][key]["phone"])


class RowsSomebodyElseLooksAfter(unittest.TestCase):
    """A re-import must not undo what an owner, a pilgrim or an editor did, and must not bring a deleted place back."""

    @classmethod
    def setUpClass(cls):
        cls.plan, _ = fixture_plan("29")

    def setUp(self):
        self.mock = healthy()
        rows = [r for r in self.plan.stays if r["osm_type"] == "node"][:8]
        self.keys = [(r["osm_type"], r["osm_id"]) for r in rows]
        k = self.keys
        m = self.mock
        self.ids = {
            "editor": m.add_place("stays", *k[0], verification_level="editor", name="Edited by hand", phone="+34 111 111 111"),
            "owner": m.add_place("stays", *k[1], verification_level="owner", name="Owner's name"),
            "editorial": m.add_place("stays", *k[2], source="editorial", name="Editorial row"),
            "claimed": m.add_place("stays", *k[3], business_id="b0000000-0000-0000-0000-000000000001",
                                   owner_verified_at="2026-10-01T00:00:00Z", verified_at="2026-10-01T00:00:00Z", name="Claimed by a business"),
            "verified_at": m.add_place("stays", *k[4], verified_at="2026-09-01T00:00:00Z", name="Checked"),
            "data_check": m.add_place("stays", *k[5], verification_level="data_check", data_confidence=88, name="Old OSM name"),
            "deleted": m.add_place("stays", *k[6], deleted_at="2026-08-01T00:00:00Z", name="Deleted by an editor"),
        }

    def apply(self):
        with self.mock:
            return applying.apply_plan(client_for(self.mock), self.plan, lambda m: None)

    def stored(self, i):
        return self.mock.places["stays"][self.keys[i]]

    def test_rows_that_people_or_other_sources_look_after_are_not_written_at_all(self):
        report = self.apply()
        for i, name in ((0, "Edited by hand"), (1, "Owner's name"), (2, "Editorial row"), (3, "Claimed by a business"), (4, "Checked")):
            self.assertEqual(self.stored(i)["name"], name, "the importer must not overwrite it")
        self.assertEqual(self.stored(0)["phone"], "+34 111 111 111")
        self.assertEqual(self.stored(0)["verification_level"], "editor")
        self.assertEqual(report["places"]["stays"]["left_alone"], 5)

    def test_but_they_are_still_on_the_stage(self):
        self.apply()
        for i in range(5):
            self.assertIn((STAGE_ID, self.stored(i)["id"]), self.mock.links["stage_stays"], f"row {i} is on the stage whoever looks after it")

    def test_a_row_the_audit_checked_is_refreshed_but_keeps_its_trust_columns(self):
        report = self.apply()
        row = self.stored(5)
        self.assertNotEqual(row["name"], "Old OSM name")
        self.assertEqual((row["verification_level"], row["data_confidence"]), ("data_check", 88))
        self.assertEqual(self.ids["data_check"], row["id"])
        self.assertGreaterEqual(report["places"]["stays"]["refreshed"], 1)

    def test_a_deleted_place_stays_deleted_and_is_not_linked(self):
        report = self.apply()
        row = self.stored(6)
        self.assertEqual((row["deleted_at"], row["name"]), ("2026-08-01T00:00:00Z", "Deleted by an editor"))
        self.assertNotIn((STAGE_ID, self.ids["deleted"]), self.mock.links["stage_stays"])
        self.assertEqual(report["places"]["stays"]["deleted"], 1)
        self.assertTrue(report["ok"], report)

    def test_the_rest_of_the_places_are_new(self):
        report = self.apply()
        self.assertEqual(report["places"]["stays"]["new"], len(self.plan.stays) - 7)
        self.assertTrue(report["verified"])


class StageProblems(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.plan, _ = fixture_plan("29")

    def apply(self, mock):
        log = []
        with mock:
            return applying.apply_plan(client_for(mock), self.plan, log.append), log

    def check_refused(self, mock, text):
        report, log = self.apply(mock)
        self.assertFalse(report["ok"])
        self.assertEqual(report["links"]["stage_stays"] + report["links"]["stage_pois"], 0)
        self.assertEqual(writes(mock, "stage_stays") + writes(mock, "stage_pois"), [], "not one link row may be sent")
        self.assertTrue(any(text in p for p in report["problems"]), report["problems"])
        self.assertTrue(any(f"stage camino-frances-29 ({STAGE_ID})" in p for p in report["problems"]), "it says WHICH stage")
        self.assertTrue(any(f"{len(self.plan.stage_stays)} stage_stays and {len(self.plan.stage_pois)} stage_pois" in p for p in report["problems"]))
        self.assertEqual(len(mock.places["stays"]), len(self.plan.stays), "the places themselves are still written")
        self.assertIn("apply: counts read back match what was sent (the places only: no link rows were written)", log)
        return report

    def test_a_stage_that_is_not_in_the_database_gets_no_link_rows(self):
        self.check_refused(MockSupabase(routes={ROUTE_ID}), "is not in the database")

    def test_a_deleted_stage_gets_no_link_rows(self):
        self.check_refused(MockSupabase(stages={STAGE_ID: {**STAGE_ROW, "deleted_at": "2026-10-01T00:00:00Z"}}, routes={ROUTE_ID}), "is in the database but deleted")

    def test_a_stage_of_another_route_or_number_gets_no_link_rows(self):
        self.check_refused(MockSupabase(stages={STAGE_ID: {**STAGE_ROW, "route_id": "20000000-0000-0000-0000-000000000002"}}, routes={ROUTE_ID}),
                           "belongs to route 20000000-0000-0000-0000-000000000002")
        self.check_refused(MockSupabase(stages={STAGE_ID: {**STAGE_ROW, "stage_number": 9}}, routes={ROUTE_ID}), "is stage number 9")

    def test_a_missing_route_stops_everything_before_a_single_write(self):
        mock = MockSupabase(stages={STAGE_ID: dict(STAGE_ROW)}, routes=set())
        with mock:
            with self.assertRaisesRegex(ApplyError, f"route {ROUTE_ID} is not in the database.*nothing was written"):
                applying.apply_plan(client_for(mock), self.plan, lambda m: None)
        self.assertEqual(writes(mock), [])

    def test_a_database_that_loses_a_link_is_caught_by_the_read_back(self):
        report, log = self.apply(healthy(lose_links={"stage_stays": True}))
        self.assertFalse(report["ok"])
        self.assertFalse(report["verified"])
        n = len(self.plan.stage_stays)
        self.assertIn(f"stage_stays: wrote {n} rows, the database has {n - 1} of them for this stage", report["problems"])
        self.assertTrue(any("READ-BACK MISMATCH" in line for line in log))


class ReadBack(unittest.TestCase):
    def test_places_the_database_does_not_know_and_links_it_does_not_have_are_reported(self):
        plan, _ = fixture_plan("29")

        class Empty:                                    # a database that answers every read with nothing
            def select(self, table, params, what, count=False):
                return [], 0 if count else None

        ids = {t: {(r["osm_type"], r["osm_id"]): str(uuid.uuid4()) for r in getattr(plan, t)} for t in ("stays", "pois")}
        links = {"stage_stays": len(plan.stage_stays), "stage_pois": len(plan.stage_pois)}
        bad = applying.verify(Empty(), plan, ids, links, True)
        self.assertEqual(len(bad), 4, bad)
        self.assertTrue(any(f"{len(plan.stays)} of {len(plan.stays)} stays are not in the database after writing, for example node/" in p for p in bad), bad)
        self.assertTrue(any(f"stage_pois: wrote {len(plan.stage_pois)} rows, the database has 0 of them" in p for p in bad), bad)
        self.assertEqual(applying.verify(Empty(), plan, ids, links, False)[2:], [], "without links written, no link is expected")


class Failures(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.plan, _ = fixture_plan("29")

    def test_a_busy_server_is_retried_and_a_rejection_is_not(self):
        mock = healthy(fail={("POST", "stays"): [503, 502]})
        with mock:
            report = applying.apply_plan(client_for(mock), self.plan, lambda m: None)
        self.assertTrue(report["ok"], report)
        self.assertEqual(len(writes(mock, "stays")), 3, "two refusals, then the batch")
        mock = healthy(fail={("POST", "stays"): [(400, "no, thank you")]})
        with mock, self.assertRaisesRegex(ApplyError, "writing stays: HTTP 400 XX000 no, thank you"):
            applying.apply_plan(client_for(mock), self.plan, lambda m: None)
        self.assertEqual(len(writes(mock, "stays")), 1, "a 400 is not retried")

    def test_a_server_that_stays_down_gives_up_with_its_status(self):
        mock = healthy(fail={("POST", "stays"): [503, 503, 503, 503]})
        with mock, self.assertRaisesRegex(ApplyError, "writing stays: HTTP 503"):
            applying.apply_plan(client_for(mock), self.plan, lambda m: None)

    def test_nothing_is_written_when_the_first_read_fails(self):
        mock = healthy(fail={("GET", "stages"): [500, 500, 500]})
        with mock, self.assertRaisesRegex(ApplyError, "reading the stage row: HTTP 500"):
            applying.apply_plan(client_for(mock), self.plan, lambda m: None)
        self.assertEqual(writes(mock), [])

    def test_the_key_and_the_address_are_never_in_an_error(self):
        mock = healthy(fail={("POST", "stays"): [(400, "bad row; key was {key} sent to {url}")]})
        with mock:
            with self.assertRaises(ApplyError) as caught:
                applying.apply_plan(client_for(mock), self.plan, lambda m: None)
            text = str(caught.exception)
            self.assertIn("[hidden]", text)
            self.assertNotIn(mock.key, text)
            self.assertNotIn(mock.url, text)
            self.assertNotIn(mock.url.split("//")[1], text)

    def test_a_wrong_key_is_refused_and_is_not_echoed(self):
        mock = healthy()
        with mock:
            client = Client(mock.url, "some-other-key-1234567890", session=requests.Session(), sleep=lambda s: None)
            client.session.trust_env = False
            with self.assertRaises(ApplyError) as caught:
                applying.apply_plan(client, self.plan, lambda m: None)
        self.assertIn("HTTP 401", str(caught.exception))
        self.assertNotIn("some-other-key-1234567890", str(caught.exception))

    def test_an_unreachable_server_is_reported_without_the_address(self):
        client = Client("http://127.0.0.1:1", SERVICE_KEY, session=requests.Session(), sleep=lambda s: None, tries=2)
        client.session.trust_env = False
        with self.assertRaises(ApplyError) as caught:
            applying.apply_plan(client, self.plan, lambda m: None)
        self.assertEqual(str(caught.exception), "reading the stage row: could not reach the database (ConnectionError)")
        self.assertIsNone(caught.exception.__cause__, "no traceback chain that would print the address")
        self.assertTrue(caught.exception.__suppress_context__)


class Environment(unittest.TestCase):
    def test_both_variables_are_needed_and_only_their_names_are_printed(self):
        with self.assertRaises(ApplyError) as e:
            Client.from_env({})
        self.assertEqual(str(e.exception), "--apply needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment")
        with self.assertRaises(ApplyError) as e:
            Client.from_env({"SUPABASE_URL": "https://abc.supabase.co", "SUPABASE_SERVICE_ROLE_KEY": "  "})
        self.assertEqual(str(e.exception), "--apply needs SUPABASE_SERVICE_ROLE_KEY in the environment")

    def test_the_address_must_be_https_the_project_address_only_or_localhost(self):
        ok = Client.from_env({"SUPABASE_URL": "https://abc.supabase.co/", "SUPABASE_SERVICE_ROLE_KEY": "k" * 20})
        self.assertEqual(ok.base, "https://abc.supabase.co/rest/v1")
        Client.from_env({"SUPABASE_URL": "http://127.0.0.1:54321", "SUPABASE_SERVICE_ROLE_KEY": "k" * 20})
        Client.from_env({"SUPABASE_URL": "http://localhost:54321", "SUPABASE_SERVICE_ROLE_KEY": "k" * 20})
        host = "secret-host-name.example"
        for url in (f"http://{host}", f"ftp://{host}", host, f"https://user:pw@{host}", f"https://{host}/rest/v1", f"https://{host}?x=1", "https://"):
            with self.assertRaises(ApplyError, msg=url) as e:
                Client.from_env({"SUPABASE_URL": url, "SUPABASE_SERVICE_ROLE_KEY": "k" * 20})
            self.assertNotIn(host, str(e.exception))
            self.assertNotIn("pw", str(e.exception).replace("password", ""))

    def test_clean_takes_the_key_and_the_address_out_of_any_text(self):
        c = Client("https://abc.supabase.co", "super-secret-key-value")
        text = c.clean("failed for https://abc.supabase.co/rest/v1/stays with Bearer super-secret-key-value on abc.supabase.co")
        self.assertNotRegex(text, r"super-secret|abc\.supabase")
        self.assertEqual(len(re.findall(r"\[hidden\]", text)), 3)


if __name__ == "__main__":
    unittest.main()
