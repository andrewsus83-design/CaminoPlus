"""Tests for tools/check_series.py (the gate of a batch of books) and tools/fetch_book_sources.py. Run from the repository root:
python3 -m unittest discover -s tools/tests -v
"""
import json
import pathlib
import sys
import tempfile
import unittest

TOOLS = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(TOOLS))

import check_series as cs  # noqa: E402
import fetch_book_sources as fb  # noqa: E402

ROUTES = {"camino-a", "camino-b", "camino-c"}
PLAN = {
    "version": 1,
    "books": [
        {"id": "a-guide", "kind": "guide", "order": 1, "route_slug": "camino-a"},
        {"id": "b-guide", "kind": "guide", "order": 2, "route_slug": "camino-b"},
        {"id": "x-readings", "kind": "reflection", "order": 3, "route_slug": "camino-a", "days": 6, "sources": ["gutenberg-1"]},
    ],
    "routes_without_guide": ["camino-c"],
}


def write(root: pathlib.Path, plan=None, skip=(), extra=(), meta_over=None):
    root.mkdir(parents=True, exist_ok=True)
    plan = plan or PLAN
    (root / "plan.json").write_text(json.dumps(plan), encoding="utf-8")
    (root / "sources").mkdir(exist_ok=True)
    (root / "sources" / "SOURCES.md").write_text("| `gutenberg-1` | A Work | A Translator | free |\n", encoding="utf-8")
    for b in list(plan["books"]) + [{"id": e, "kind": "guide", "order": 99, "route_slug": "camino-a"} for e in extra]:
        if b["id"] in skip:
            continue
        meta = {"id": b["id"], "kind": b["kind"], "order": b["order"], "route_slug": b["route_slug"]}
        if b["kind"] == "reflection":
            meta["days"] = b.get("days")
            meta["sources"] = [{"id": s} for s in b.get("sources", [])]
        meta.update((meta_over or {}).get(b["id"], {}))
        (root / b["id"]).mkdir(exist_ok=True)
        (root / b["id"] / "book.json").write_text(json.dumps(meta), encoding="utf-8")
    return root


class Gate(unittest.TestCase):
    def run_gate(self, **kw):
        with tempfile.TemporaryDirectory() as t:
            root = write(pathlib.Path(t) / "books", **{k: v for k, v in kw.items() if k in ("plan", "skip", "extra", "meta_over")})
            bundle = kw.get("bundle")
            if bundle is not None:
                bpath = pathlib.Path(t) / "catalog.json"
                bpath.write_text(json.dumps({"books": [{"id": i} for i in bundle]}), encoding="utf-8")
            else:
                bpath = None
            return cs.check(root, routes=kw.get("routes", ROUTES), bundle=bpath)

    def test_a_complete_batch_has_no_problem(self):
        errors, rows = self.run_gate()
        self.assertEqual(errors, [])
        self.assertEqual([r["id"] for r in rows], ["a-guide", "b-guide", "x-readings"])

    def test_a_skipped_book_is_found(self):
        errors, _ = self.run_gate(skip={"b-guide"})
        self.assertIn("books/b-guide: planned but missing (skipped?)", errors)

    def test_a_stray_book_is_found(self):
        errors, _ = self.run_gate(extra=["z-guide"])
        self.assertTrue(any("books/z-guide: has a book.json but is not in plan.json" in e for e in errors))

    def test_a_book_that_disagrees_with_the_plan_is_found(self):
        errors, _ = self.run_gate(meta_over={"x-readings": {"days": 7, "order": 9}, "a-guide": {"route_slug": "camino-b"}})
        text = "\n".join(errors)
        self.assertIn("days is 7, the plan says 6", text)
        self.assertIn("order is 9, the plan says 3", text)
        self.assertIn("route_slug is 'camino-b', the plan says 'camino-a'", text)

    def test_the_sources_of_a_reflection_book_must_match_and_be_documented(self):
        errors, _ = self.run_gate(meta_over={"x-readings": {"sources": [{"id": "gutenberg-2"}]}})
        self.assertIn("sources are ['gutenberg-2'], the plan says ['gutenberg-1']", "\n".join(errors))
        plan = json.loads(json.dumps(PLAN))
        plan["books"][2]["sources"] = ["gutenberg-9"]
        errors, _ = self.run_gate(plan=plan)
        self.assertIn("source gutenberg-9 is not documented in books/sources/SOURCES.md", "\n".join(errors))

    def test_a_route_without_a_guide_must_be_a_decision_in_the_plan(self):
        plan = json.loads(json.dumps(PLAN))
        plan["routes_without_guide"] = []
        errors, _ = self.run_gate(plan=plan)
        self.assertIn("the catalog route camino-c has no guide in the plan (add one, or list it in routes_without_guide on purpose)", errors)
        plan["routes_without_guide"] = ["camino-c", "camino-zzz"]
        errors, _ = self.run_gate(plan=plan)
        self.assertIn("plan.json: routes_without_guide names camino-zzz, which is not a route of the catalog", errors)

    def test_orders_and_the_guide_first_rule(self):
        plan = json.loads(json.dumps(PLAN))
        plan["books"][1]["order"] = 1
        errors, _ = self.run_gate(plan=plan)
        self.assertIn("plan.json: two books have the same order", errors)
        plan = json.loads(json.dumps(PLAN))
        plan["books"][2]["order"], plan["books"][1]["order"] = 2, 3
        errors, _ = self.run_gate(plan=plan)
        self.assertTrue(any("every guide comes before every reflection book" in e for e in errors))

    def test_the_app_bundle_must_list_the_planned_books(self):
        self.assertEqual(self.run_gate(bundle=["a-guide", "b-guide", "x-readings"])[0], [])
        errors, _ = self.run_gate(bundle=["a-guide", "x-readings"])
        self.assertTrue(any("bundle lists other books than the plan" in e for e in errors))

    def test_the_real_repository_agrees_with_its_plan(self):
        errors, rows = cs.check()
        self.assertEqual(errors, [], "books/ and books/plan.json disagree")
        self.assertGreaterEqual(len(rows), 20)

    def test_the_catalog_routes_are_read_from_the_migration(self):
        routes = cs.catalog_routes()
        self.assertIn("camino-frances", routes)
        self.assertIn("camino-de-invierno", routes)
        self.assertNotIn("camino-de-santiago", routes)      # the network, not a route
        self.assertEqual(len(routes), 14)


class Fetch(unittest.TestCase):
    def test_the_source_list_comes_from_the_books_themselves(self):
        with tempfile.TemporaryDirectory() as t:
            root = pathlib.Path(t)
            for name, srcs in (("one", ["gutenberg-1653", "gutenberg-8294"]), ("two", ["gutenberg-1653"]), ("guide", [])):
                (root / name).mkdir()
                (root / name / "book.json").write_text(json.dumps({"id": name, "sources": [{"id": s} for s in srcs]}), encoding="utf-8")
            (root / "broken").mkdir()
            (root / "broken" / "book.json").write_text("{not json", encoding="utf-8")
            (root / "other").mkdir()
            (root / "other" / "book.json").write_text(json.dumps({"id": "other", "sources": [{"id": "ccel-x"}]}), encoding="utf-8")
            self.assertEqual(fb.source_numbers(root), {1653: ["one", "two"], 8294: ["one"]})

    def test_a_download_must_look_like_a_gutenberg_text(self):
        good = b"The Project Gutenberg eBook of A Test\n" + b"word " * 5000
        self.assertTrue(fb.looks_like_gutenberg(good))
        self.assertFalse(fb.looks_like_gutenberg(b"<html><body>Project Gutenberg 404</body></html>" + b" " * 9000))
        self.assertFalse(fb.looks_like_gutenberg(b"Project Gutenberg"))                      # too short
        self.assertFalse(fb.looks_like_gutenberg(b"just some other text " * 1000))           # no Gutenberg header

    def test_list_mode_prints_and_fetches_nothing(self):
        with tempfile.TemporaryDirectory() as t:
            root = pathlib.Path(t) / "books"
            (root / "one").mkdir(parents=True)
            (root / "one" / "book.json").write_text(json.dumps({"id": "one", "sources": [{"id": "gutenberg-1653"}]}), encoding="utf-8")
            out = pathlib.Path(t) / "out"
            self.assertEqual(fb.main([str(out), "--books-dir", str(root), "--list"]), 0)
            self.assertEqual(list(out.glob("*")), [])


if __name__ == "__main__":
    unittest.main()
