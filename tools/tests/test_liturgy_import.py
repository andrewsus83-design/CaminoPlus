"""Tests for tools/liturgy/import_readings.py. Run from the repository root:  python3 -m unittest discover -s tools/tests -v

No network and nothing outside the repository: the exports are made here, small, in the shape of the real one, and one class checks that the committed
assets (mobile/assets/library/daily) are exactly what the committed export makes of itself, so nobody edits a generated file by hand."""
import contextlib
import io
import json
import pathlib
import sys
import tempfile
import unittest

TOOLS = pathlib.Path(__file__).resolve().parent.parent
ROOT = TOOLS.parent
sys.path.insert(0, str(TOOLS / "liturgy"))

import import_readings as imp  # noqa: E402


def row(date="2026-11-08", **kw):
    base = {
        "date": date, "liturgical_day": "Thirty-second Sunday in Ordinary Time", "feast": "Thirty-second Sunday in Ordinary Time", "liturgical_color": "Green",
        "first_reading_ref": "Wisdom 6:12-16", "psalm_ref": "Psalm 63:2, 3-4, 5-6, 7-8", "second_reading_ref": "1 Thessalonians 4:13-18", "gospel_ref": "Matthew 25:1-13",
    }
    base.update(kw)
    return base


def convert(rows):
    return imp.convert(rows, {})


class CleanRef(unittest.TestCase):
    def test_what_is_no_part_of_a_reference_goes(self):
        self.assertEqual(imp.clean_ref("Jeremiah 14:17-22 [^1]", "x"), "Jeremiah 14:17-22")
        self.assertEqual(imp.clean_ref("Psalm 79:8,9,11,13 [^2] [^11]", "x"), "Psalm 79:8,9,11,13")
        self.assertEqual(imp.clean_ref("  Psalm   87 \n", "x"), "Psalm 87")
        self.assertEqual(imp.clean_ref("Psalm/Deuteronomy 32", "x"), "Deuteronomy 32", "the book of a canticle in the place of the psalm")
        self.assertEqual(imp.clean_ref("Psalm 4:2-4:3, 4:4-4:5", "x"), "Psalm 4:2-4:3, 4:4-4:5", "the forms of the source are the parser's business, not the importer's")

    def test_a_psalm_with_a_run_of_four_numbers_joined_by_hyphens_is_the_psalm_alone(self):
        notes = []
        self.assertEqual(imp.clean_ref("Psalm 85:9-10-11-12, 13-14", "2026-12-06 psalm_ref", notes), "Psalm 85", "no lectionary writes 9-10-11-12: the verses cannot be told, the psalm can")
        self.assertEqual(len(notes), 1)
        self.assertIn("2026-12-06 psalm_ref", notes[0])
        self.assertIn("'Psalm 85'", notes[0], "the change is said")
        self.assertEqual(imp.clean_ref("Psalm 23:1-2-3-4 [^2]", "x", notes), "Psalm 23", "after the footnote marker is gone")
        self.assertEqual(imp.clean_ref("Psalm 118:1-2-3-4-5", "x"), "Psalm 118", "a longer chain too, and with no list to write to it still works")
        for fine in ("Psalm 85:9-10, 11-12, 13-14", "Psalm 85:9ab and 10, 11-12, 13-14", "Psalm 4:2-4:3, 4:4-4:5", "Psalm 85", "Isaiah 52:13—53:12", "Psalm 90:3-4, 5-6, 12-13, 14 and 17"):
            before = len(notes)
            self.assertEqual(imp.clean_ref(fine, "x", notes), fine, fine)
            self.assertEqual(len(notes), before, f"{fine}: nothing changed, nothing said")
        self.assertEqual(imp.clean_ref("Isaiah 5:1-2-3-4", "x", notes), "Isaiah 5:1-2-3-4", "a book that is not the Psalms is left as it is: the app shows it as written, with no words, and says so")

    def test_nothing_is_nothing(self):
        for empty in (None, "", "   ", "[^3]"):
            self.assertIsNone(imp.clean_ref(empty, "x"), repr(empty))

    def test_what_is_not_a_reference_is_refused(self):
        for bad in (5, ["John 1:1"], "x" * 500, "John 1:1\x00", "John\n\x07 1:1"):
            with self.assertRaises(imp.Refused, msg=repr(bad)):
                imp.clean_ref(bad, "x")

    def test_a_name_is_trimmed_and_an_empty_one_is_none(self):
        self.assertEqual(imp.clean_name("  Saint   Leo the Great,  Pope ", "x"), "Saint Leo the Great, Pope")
        self.assertIsNone(imp.clean_name("", "x"))
        self.assertIsNone(imp.clean_name(None, "x"))
        with self.assertRaises(imp.Refused):
            imp.clean_name("x" * 300, "x")


class Convert(unittest.TestCase):
    def test_a_day_keeps_four_references_and_its_name(self):
        years = convert([row()])
        self.assertEqual(list(years), [2026])
        day = years[2026]["2026-11-08"]
        self.assertEqual(day["r"], ["Wisdom 6:12-16", "Psalm 63:2, 3-4, 5-6, 7-8", "1 Thessalonians 4:13-18", "Matthew 25:1-13"])
        self.assertEqual(day["n"], "Thirty-second Sunday in Ordinary Time")
        self.assertEqual(day["o"], 1, "the source calls the day by the name of the celebration")
        self.assertEqual(set(day), {"r", "n", "o"})

    def test_a_memorial_beside_a_weekday_is_not_the_day(self):
        day = convert([row("2026-05-27", liturgical_day="Wednesday of the eighth week of Ordinary Time", feast="Saint Augustine of Canterbury, Bishop", second_reading_ref=None)])[2026]["2026-05-27"]
        self.assertEqual(day["n"], "Saint Augustine of Canterbury, Bishop")
        self.assertNotIn("o", day)
        self.assertIsNone(day["r"][2])

    def test_a_plain_weekday_has_no_name_and_the_empty_text_is_none(self):
        day = convert([row("2026-05-28", liturgical_day="Thursday of the eighth week of Ordinary Time", feast="", second_reading_ref="")])[2026]["2026-05-28"]
        self.assertEqual(set(day), {"r"})
        self.assertIsNone(day["r"][2])

    def test_the_name_is_compared_without_case_or_spacing(self):
        day = convert([row(liturgical_day="thirty-second  SUNDAY in ordinary time")])[2026]["2026-11-08"]
        self.assertEqual(day["o"], 1)

    def test_a_day_that_is_not_the_general_calendars_is_left_out_and_listed(self):
        left = sorted(imp.NOT_GENERAL)
        self.assertEqual(left, ["2026-06-04", "2026-06-07", "2026-11-26", "2026-12-12"], "what a reviewer found, and nothing else")
        years = convert([row("2026-06-03"), row("2026-06-04"), row("2026-11-26"), row("2026-11-27"), row("2027-01-01")])
        self.assertEqual(sorted(years[2026]), ["2026-06-03", "2026-11-27"], "the days that differ are not days with readings")
        self.assertEqual(years.differ, {2026: ["2026-06-04", "2026-11-26"]}, "they are listed, in order, for their year")
        self.assertEqual(years[2027].keys(), {"2027-01-01"})
        self.assertNotIn(2027, years.differ)

    def test_a_listed_day_that_the_export_does_not_have_is_ignored_and_a_listed_day_is_still_checked(self):
        years = convert([row("2026-05-25")])
        self.assertEqual(years.differ, {}, "the list is of the dates of one export: another export has its own days to look at")
        for bad in (row("2026-06-04", first_reading_ref=None, psalm_ref=None, second_reading_ref=None, gospel_ref=None), row("2026-11-26", gospel_ref=5)):
            with self.assertRaises(imp.Refused, msg="a listed day is refused when it is not a day with a reading"):
                convert([bad])
        with self.assertRaises(imp.Refused):
            convert([row("2026-06-04"), row("2026-06-04")])

    def test_days_are_grouped_by_year(self):
        years = convert([row("2026-12-31"), row("2027-01-01"), row("2027-01-02")])
        self.assertEqual({y: sorted(d) for y, d in years.items()}, {2026: ["2026-12-31"], 2027: ["2027-01-01", "2027-01-02"]})

    def test_a_row_that_is_not_a_day_is_refused(self):
        for bad in (row(date=None), row(date="2026-02-30"), row(date="2026-2-3"), row(date=20261108), row(date="Sunday")):
            with self.assertRaises(imp.Refused, msg=repr(bad["date"])):
                convert([bad])
        with self.assertRaises(imp.Refused):
            convert(["not a row"])

    def test_a_day_twice_is_refused(self):
        with self.assertRaises(imp.Refused) as e:
            convert([row(), row()])
        self.assertIn("2026-11-08", str(e.exception))

    def test_a_day_with_no_reading_is_refused(self):
        with self.assertRaises(imp.Refused):
            convert([row(first_reading_ref=None, psalm_ref="", second_reading_ref=None, gospel_ref=" ")])

    def test_one_reading_is_enough(self):
        day = convert([row("2026-12-24", first_reading_ref=None, psalm_ref=None, second_reading_ref=None)])[2026]["2026-12-24"]
        self.assertEqual(day["r"], [None, None, None, "Matthew 25:1-13"])


class Files(unittest.TestCase):
    def make(self, rows, about=None, as_list=False):
        d = pathlib.Path(tempfile.mkdtemp())
        export = d / "export.json"
        export.write_text(json.dumps(rows if as_list else {"about": about or {"read": "2026-11-08", "source": "a test"}, "rows": rows}), encoding="utf8")
        return d, export

    def test_the_output_is_deterministic_sorted_and_one_day_to_a_line(self):
        d, export = self.make([row("2026-11-09", feast=None), row("2026-11-08")])
        a, _ = imp.outputs(export, d / "out", d / "x.ts")
        b, _ = imp.outputs(export, d / "out", d / "x.ts")
        self.assertEqual(a, b)
        text = a[d / "out" / "readings-2026.json"]
        data = json.loads(text)
        self.assertEqual(list(data["days"]), ["2026-11-08", "2026-11-09"], "sorted by date, whatever the order of the export")
        self.assertEqual(data["v"], imp.FORMAT_VERSION)
        self.assertEqual(data["year"], 2026)
        self.assertEqual(len(text.strip().split("\n")), 2 + 2, "the head, the two days, the end")
        self.assertTrue(text.endswith("}}\n"))

    def test_the_header_says_where_the_data_comes_from_when_it_was_read_and_that_pascua_s_words_are_not_used(self):
        d, export = self.make([row()], about={"read": "2026-11-08", "source": "Pascua, table public.pascua_daily_readings"})
        about = json.loads(imp.outputs(export, d / "out", d / "x.ts")[0][d / "out" / "readings-2026.json"])["about"]
        self.assertEqual(about["read"], "2026-11-08")
        self.assertIn("Pascua", about["source"])
        self.assertIn("facts of the Lectionary for Mass used in the United States", about["nature"], "the lectionary of one country is not called the Roman one")
        self.assertNotIn("facts of the Roman Lectionary", about["nature"])
        self.assertIn("left out and listed in 'differ'", about["nature"])
        self.assertIn("not used", about["nature"])
        self.assertIn("Bible inside the app", about["nature"])

    def test_the_days_that_differ_are_in_the_file_sorted_and_not_among_the_days(self):
        d, export = self.make([row("2026-12-12"), row("2026-11-27"), row("2026-06-04"), row("2026-11-26")])
        text = imp.outputs(export, d / "out", d / "x.ts")[0][d / "out" / "readings-2026.json"]
        data = json.loads(text)
        self.assertEqual(data["differ"], ["2026-06-04", "2026-11-26", "2026-12-12"])
        self.assertEqual(list(data["days"]), ["2026-11-27"])
        self.assertEqual(list(data), ["about", "differ", "v", "year", "days"], "sorted keys, the days last")
        plain = json.loads(imp.outputs(self.make([row("2026-11-27")])[1], d / "out", d / "x.ts")[0][d / "out" / "readings-2026.json"])
        self.assertNotIn("differ", plain, "a year with none has no key for it")

    def test_both_modes_print_the_days_that_are_left_out_and_what_was_changed(self):
        d, export = self.make([row("2026-06-04"), row("2026-12-12"), row("2026-12-06", psalm_ref="Psalm 85:9-10-11-12, 13-14")])
        out, ts = d / "out", d / "x.ts"
        code, text, _ = self.run_main("--export", str(export), "--out", str(out), "--ts", str(ts))
        self.assertEqual(code, 0)
        for must in ("left out (2 days)", "2026-06-04", "2026-12-12", "Corpus Christi", "Guadalupe", "only what a reviewer found", "changed in a reference (1)", "'Psalm 85'"):
            self.assertIn(must, text, "the write says: " + must)
        code, text, _ = self.run_main("--export", str(export), "--out", str(out), "--ts", str(ts), "--check")
        self.assertEqual(code, 0)
        for must in ("ok: the committed files are what the export makes", "2026-06-04", "2026-12-12", "left out (2 days)", "a person with a lectionary has to check every day of the export", "changed in a reference (1)"):
            self.assertIn(must, text, "the check says: " + must)
        (out / "readings-2026.json").write_text("edited by hand\n", encoding="utf8")
        code, text, _ = self.run_main("--export", str(export), "--out", str(out), "--ts", str(ts), "--check")
        self.assertEqual(code, 1)
        self.assertIn("2026-06-04", text, "a red check prints the list too")
        quiet = self.make([row("2026-11-27")])[1]
        code, text, _ = self.run_main("--export", str(quiet), "--out", str(d / "out2"), "--ts", str(d / "y.ts"))
        self.assertEqual(code, 0)
        self.assertNotIn("left out", text, "nothing is said when nothing was left out")
        self.assertNotIn("changed in a reference", text)
        self.assertFalse(text.endswith("\n\n"), "and no empty line")

    def test_a_plain_list_is_an_export_too(self):
        d, export = self.make([row()], as_list=True)
        files, years = imp.outputs(export, d / "out", d / "x.ts")
        self.assertEqual(list(years), [2026])
        self.assertEqual(json.loads(files[d / "out" / "readings-2026.json"])["about"]["read"], "")

    def test_one_file_for_each_year_and_one_lazy_require_for_each(self):
        d, export = self.make([row("2026-12-31"), row("2027-01-01")])
        files, _ = imp.outputs(export, d / "out", d / "x.ts")
        self.assertEqual(sorted(p.name for p in files), ["readings-2026.json", "readings-2027.json", "x.ts"])
        ts = files[d / "x.ts"]
        self.assertIn("require('../../../../assets/library/daily/readings-2026.json')", ts)
        self.assertIn("require('../../../../assets/library/daily/readings-2027.json')", ts)
        self.assertLess(ts.index("2026.json"), ts.index("2027.json"))
        self.assertTrue(ts.startswith("// GENERATED"))

    def test_an_export_that_is_nothing_is_refused(self):
        d, export = self.make([])
        with self.assertRaises(imp.Refused):
            imp.outputs(export, d / "out", d / "x.ts")
        bad = d / "bad.json"
        bad.write_text("{not json", encoding="utf8")
        with self.assertRaises(imp.Refused):
            imp.outputs(bad, d / "out", d / "x.ts")
        bad.write_text('{"rows": 5}', encoding="utf8")
        with self.assertRaises(imp.Refused):
            imp.outputs(bad, d / "out", d / "x.ts")

    def run_main(self, *args):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = imp.main(list(args))
        return code, out.getvalue(), err.getvalue()

    def test_write_then_check_is_green_and_a_change_is_red(self):
        d, export = self.make([row(), row("2026-11-09")])
        out, ts = d / "out", d / "x.ts"
        self.assertEqual(self.run_main("--export", str(export), "--out", str(out), "--ts", str(ts), "--check")[0], 1, "nothing written yet: the check is red")
        self.assertEqual(self.run_main("--export", str(export), "--out", str(out), "--ts", str(ts))[0], 0)
        self.assertEqual(self.run_main("--export", str(export), "--out", str(out), "--ts", str(ts), "--check")[0], 0)
        (out / "readings-2026.json").write_text("edited by hand\n", encoding="utf8")
        code, text, _ = self.run_main("--export", str(export), "--out", str(out), "--ts", str(ts), "--check")
        self.assertEqual(code, 1)
        self.assertIn("not what the export makes", text)
        (out / "readings-2030.json").write_text("{}", encoding="utf8")
        self.assertIn("readings-2030.json is not made by this export", self.run_main("--export", str(export), "--out", str(out), "--ts", str(ts), "--check")[1])

    def test_a_refusal_is_exit_2_and_names_the_row(self):
        d, export = self.make([row(), row()])
        code, _, err = self.run_main("--export", str(export), "--out", str(d / "out"), "--ts", str(d / "x.ts"))
        self.assertEqual(code, 2)
        self.assertIn("2026-11-08", err)
        self.assertFalse((d / "out").exists(), "a refused export writes nothing")


class CommittedFiles(unittest.TestCase):
    """The repository's own export and what was made of it."""

    @classmethod
    def setUpClass(cls):
        cls.rows, cls.about = imp.read_export(imp.DEFAULT_EXPORT)

    def test_the_export_holds_the_facts_columns_and_nothing_of_pascuas_own_writing(self):
        self.assertGreater(len(self.rows), 200)
        for r in self.rows:
            self.assertEqual(set(r), set(imp.COLUMNS), r.get("date"))
        banned = {"first_reading_title", "first_reading_snippet", "psalm_title", "psalm_snippet", "gospel_title", "gospel_snippet", "first_reading_full", "psalm_full", "gospel_full",
                  "second_reading_full", "second_reading_title", "second_reading_snippet", "reflection", "family_story", "closing_prayer", "audio_url", "psalm_response", "saint_name", "saint_short"}
        self.assertFalse(banned & {k for r in self.rows for k in r})

    def test_the_export_says_where_it_comes_from_and_when_it_was_read(self):
        self.assertEqual(self.about["read"], "2026-11-08")
        self.assertIn("pascua_daily_readings", self.about["source"])
        self.assertIn("select", self.about["query"])
        self.assertEqual(self.about["rowsHere"], len(self.rows))
        self.assertEqual(self.about["tableRows"], len(self.rows) + 1, "one row of the table has no date and is not here")

    def test_the_committed_assets_are_exactly_what_the_export_makes(self):
        files, years = imp.outputs(imp.DEFAULT_EXPORT, imp.DEFAULT_OUT, imp.DEFAULT_TS)
        for path, text in files.items():
            self.assertTrue(path.exists(), f"{path} is missing: run python3 tools/liturgy/import_readings.py")
            self.assertEqual(path.read_text(encoding="utf8"), text, f"{path} is not what the export makes: run python3 tools/liturgy/import_readings.py")
        on_disk = sorted(p.name for p in imp.DEFAULT_OUT.glob("readings-*.json"))
        self.assertEqual(on_disk, sorted(f"readings-{y}.json" for y in years))

    def test_the_days_run_from_25_may_to_31_december_2026_without_a_gap(self):
        import datetime
        days = sorted(r["date"] for r in self.rows)
        first, last = datetime.date.fromisoformat(days[0]), datetime.date.fromisoformat(days[-1])
        self.assertEqual((days[0], days[-1]), ("2026-05-25", "2026-12-31"))
        self.assertEqual(len(days), (last - first).days + 1, "every day between the first and the last is there")
        self.assertEqual(len(set(days)), len(days))

    def test_the_days_left_out_are_the_listed_ones_and_they_are_in_the_export(self):
        dates = {r["date"] for r in self.rows}
        self.assertTrue(set(imp.NOT_GENERAL) <= dates, "every day of the list is a day of the committed export")
        data = json.loads((imp.DEFAULT_OUT / "readings-2026.json").read_text(encoding="utf8"))
        self.assertEqual(data["differ"], sorted(imp.NOT_GENERAL))
        self.assertFalse(set(data["differ"]) & set(data["days"]), "a day that differs has no readings in the file")
        self.assertEqual(len(data["days"]) + len(data["differ"]), len(self.rows), "every day of the export is one or the other")
        for key, reason in imp.NOT_GENERAL.items():
            self.assertGreater(len(reason), 40, key)
            self.assertTrue(any(w in reason for w in ("United States", "Thanksgiving")), f"{key}: the reason says whose readings these are")
        by_date = {r["date"]: r for r in self.rows}
        self.assertEqual(by_date["2026-11-26"]["second_reading_ref"], "1 Corinthians 1:3-9", "Thanksgiving: four readings on a weekday")
        self.assertEqual(by_date["2026-06-07"]["gospel_ref"], "John 6:51-58", "the Gospel of Corpus Christi on the 10th Sunday")

    def test_the_committed_asset_has_no_run_of_four_numbers_and_the_psalm_the_export_wrote_that_way_is_the_psalm_alone(self):
        raw = {r["date"]: r["psalm_ref"] for r in self.rows}
        self.assertEqual(raw["2026-12-06"], "Psalm 85:9-10-11-12, 13-14", "the export keeps what the source wrote")
        data = json.loads((imp.DEFAULT_OUT / "readings-2026.json").read_text(encoding="utf8"))
        self.assertEqual(data["days"]["2026-12-06"]["r"][1], "Psalm 85")
        for key, day in data["days"].items():
            for ref in day["r"]:
                if ref is not None:
                    self.assertIsNone(imp.RUN_OF_FOUR.search(ref), f"{key}: {ref}")

    def test_no_reference_of_the_asset_has_a_footnote_marker_or_a_slash_book(self):
        data = json.loads((imp.DEFAULT_OUT / "readings-2026.json").read_text(encoding="utf8"))
        for key, day in data["days"].items():
            self.assertEqual(len(day["r"]), 4, key)
            for ref in day["r"]:
                if ref is not None:
                    self.assertNotIn("[^", ref, key)
                    self.assertFalse(ref.startswith("Psalm/"), key)
                    self.assertEqual(ref, " ".join(ref.split()), key)


if __name__ == "__main__":
    unittest.main()
