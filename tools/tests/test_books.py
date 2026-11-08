"""Tests for tools/book_kit.py, tools/check_books.py and tools/build_books.py (the book-writer and book-publisher skills).
Run from the repository root:  python3 -m unittest discover -s tools/tests -v
"""
import json
import pathlib
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
import zipfile

TOOLS = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(TOOLS))

import book_kit as bk  # noqa: E402
import build_books as bb  # noqa: E402
import check_books as cb  # noqa: E402

SERIES = {
    "name": "Test Library", "publisher": "Test Press", "author": "Test Author", "language": "en",
    "rights": "© 2026 Test. All rights reserved.", "ai_disclosure": "Written with AI assistance.",
}
LONG = ("A guide for the pilgrim who wants to know the shape of the walk before the first step. " * 9).strip()   # 600 to 2,500 characters
SOURCE_TEXT = """*** START OF THE PROJECT GUTENBERG EBOOK TEST ***
CHAPTER I

He who follows Me, walketh not in darkness, saith the Lord. These are the words
of Christ, by which we are admonished how we ought to imitate His life--and
manners, if we would be truly enlightened.

CHAPTER II

Every man naturally desireth to know; but what availeth knowledge without the fear of God?
*** END OF THE PROJECT GUTENBERG EBOOK TEST ***
"""
WEB_TEXT = """*** START OF THE PROJECT GUTENBERG EBOOK WEB ***
121:001 <<A Song of Ascents.>> I will lift up my eyes to the hills.
        Where does my help come from?
121:002 My help comes from Yahweh, who made heaven and earth.
*** END OF THE PROJECT GUTENBERG EBOOK WEB ***
"""


def guide_meta(**over):
    m = {"id": "demo-guide", "kind": "guide", "order": 1, "title": "Demo", "subtitle": "A Demo Guide", "route_slug": "camino-ingles",
         "description_short": "A short line.", "description_long": LONG, "keywords": ["camino", "guide"],
         "categories": ["Travel / Europe / Spain"], "cover": {"colour": "goldSoft", "icon": "library"}, "version": "1.0.0", "date": "2026-11"}
    m.update(over)
    return m


def reflection_meta(**over):
    m = guide_meta(id="demo-reflection", kind="reflection", title="Readings", subtitle="Thirty Readings")
    del m["route_slug"]
    m["days"] = 21
    m["sources"] = [{"id": "gutenberg-9999", "work": "The Imitation of Christ", "author": "Thomas à Kempis", "translator": "William Benham",
                     "year": "1886", "licence": "Public domain", "url": "https://example.org"}]
    m.update(over)
    return m


def write_book(root: pathlib.Path, meta: dict, chapters: dict, facts: str | None = None) -> pathlib.Path:
    root.mkdir(parents=True, exist_ok=True)
    (root / "series.json").write_text(json.dumps(SERIES), encoding="utf-8")
    d = root / meta["id"]
    (d / "chapters").mkdir(parents=True)
    (d / "book.json").write_text(json.dumps(meta), encoding="utf-8")
    for name, text in chapters.items():
        (d / "chapters" / name).write_text(text, encoding="utf-8")
    if facts is not None:
        (d / "facts.md").write_text(facts, encoding="utf-8")
    return d


FACTS = "| Fact | Value | Source | Checked |\n|---|---|---|---|\n" + "\n".join(f"| f{i} | v | s | yes |" for i in range(20)) + "\n"


def reading(n: int, passage: str = "He who follows Me, walketh not in darkness, saith the Lord.") -> str:
    body = "A reflection that begins with a road and a bell and a tired afternoon. " * 12
    return (f"# Day {n}. Reading {n}\n\n*A theme.*\n\n## The passage\n\n> {passage}\n>\n> — Thomas à Kempis, *The Imitation of Christ*, "
            f"Book 1, chapter 1 (tr. William Benham, 1886)\n\n## Reflection\n\n{body}\n\n## For the walk\n\n- One question.\n\n"
            f"## At the end of the day\n\nThe day is done and the feet are tired.\n\n- What was hard?\n\n## A short prayer\n\nGive us enough light for the next step.\n")


class Parser(unittest.TestCase):
    def test_blocks(self):
        blocks = bk.parse_markdown("# T\n\nHello *world*, **bold** and [a link](https://x.y).\n\n> Line one\n> two\n>\n> — A, *B*\n\n"
                                   "- one\n- two\n  wrapped\n\n1. first\n2. second\n\n---\n\n## S\n")
        self.assertEqual([b["t"] for b in blocks], ["h", "p", "quote", "ul", "ol", "hr", "h"])
        self.assertEqual(blocks[1]["spans"][1], {"t": "world", "i": 1})
        self.assertEqual(blocks[1]["spans"][5], {"t": "a link", "href": "https://x.y"})
        self.assertEqual(bk.plain(blocks[2]["paras"][0]), "Line one two")
        self.assertEqual(bk.plain(blocks[2]["cite"]), "— A, B")
        self.assertEqual(bk.plain(blocks[3]["items"][1]), "two wrapped")

    def test_unclosed_emphasis_is_reported_not_swallowed(self):
        self.assertTrue(bk.parse_markdown("A *broken line\n")[0]["unbalanced"])
        self.assertNotIn("unbalanced", bk.parse_markdown("A *fine* line\n")[0])

    def test_words_and_time(self):
        self.assertEqual(bk.count_words("Don't stop-and-go, it's ~25 km."), 5)
        self.assertEqual(bk.reading_minutes(220), 1)
        self.assertEqual(bk.reading_minutes(221), 2)
        self.assertEqual(bk.format_minutes(144), "2 h 24 min")
        self.assertEqual(bk.format_minutes(180), "3 h")


class Guide(unittest.TestCase):
    def check(self, chapters, meta=None, facts=FACTS):
        with tempfile.TemporaryDirectory() as t:
            d = write_book(pathlib.Path(t) / "books", meta or guide_meta(), chapters, facts)
            return cb.check_book(d)

    def test_a_clean_guide_has_no_errors(self):
        rep = self.check({"00-welcome.md": "# Welcome\n\nA walk of ~120 km, in a calm voice.\n"})
        self.assertEqual(rep.errors, [])

    def test_rejects_what_a_book_may_not_contain(self):
        bad = {
            "00-a.md": "# A\n\n| a | b |\n|---|---|\n| 1 | 2 |\n",
            "01-b.md": "# B\n\nA <b>tag</b>, an emoji 🐚 and ![img](x.png).\n",
            "02-c.md": "# C\n\nThe bed costs €15 a night. Call +34 981 123 456. At 42.87821 and -8.54451.\n",
            "03-d.md": "# D\n\nAn *unclosed emphasis.\n\n#### Too deep\n",
        }
        text = "\n".join(self.check(bad).errors)
        for needle in ("a table", "raw HTML", "an emoji", "an image", "a price", "a phone number", "coordinates", "unclosed", "heading level 4"):
            self.assertIn(needle, text)

    def test_needs_the_fact_ledger_and_the_limit(self):
        self.assertIn("facts.md: a guide needs its fact ledger", "\n".join(self.check({"00-a.md": "# A\n\nx\n"}, facts=None).errors))
        big = "# A\n\n" + ("word " * 12_100) + "\n"
        self.assertIn("a guide is at most 12,000", "\n".join(self.check({"00-a.md": big}).errors))

    def test_distances_without_tilde_warn_and_web_addresses_belong_in_sources(self):
        rep = self.check({"00-a.md": "# A\n\nA 25 km day, then ~12 km. See https://example.org now.\n",
                          "01-sources-and-thanks.md": "# Sources and thanks\n\nSee https://example.org.\n"})
        self.assertEqual(rep.errors, [])
        text = "\n".join(rep.warnings)
        self.assertIn("1 figure(s) without '~'", text)
        self.assertIn("00-a.md: a web address outside the sources chapter", text)
        self.assertNotIn("01-sources", text)

    def test_the_ledger_counts_facts_not_headers_and_notices_unchecked_ones(self):
        two = ("| Fact | Value | Source | Checked |\n|---|---|---|---|\n" + "\n".join(f"| a{i} | v | s | yes |" for i in range(8)) + "\n\n"
               "| Fact | Value | Source | Checked |\n|---|---|---|---|\n" + "\n".join(f"| b{i} | v | s | computed |" for i in range(7)) + "\n")
        rep = self.check({"00-a.md": "# A\n\nx\n"}, facts=two)       # 15 facts in two tables, 17 table lines
        self.assertNotIn("rows;", "\n".join(rep.warnings))
        short = two.replace("| b6 | v | s | computed |\n", "")        # 14 facts: one short, though 16 lines would pass the old count
        self.assertIn("only 14 rows", "\n".join(self.check({"00-a.md": "# A\n\nx\n"}, facts=short).warnings))
        bad = two.replace("| a0 | v | s | yes |", "| a0 | v | s | no |").replace("| a1 | v | s | yes |", "| a1 | v | s |  |")
        self.assertIn("2 row(s) are not marked checked", "\n".join(self.check({"00-a.md": "# A\n\nx\n"}, facts=bad).warnings))
        removed = two.replace("| a0 | v | s | yes |", "| a0 | v | s | removed |")
        self.assertNotIn("not marked checked", "\n".join(self.check({"00-a.md": "# A\n\nx\n"}, facts=removed).warnings))

    def test_the_author_never_says_i_but_a_numeral_is_not_the_author(self):
        rep = self.check({"00-a.md": "# A\n\nI walked this road in May. Manuel I and Pope John Paul I came to it. Part I of the book. My feet hurt.\n"})
        errors = "\n".join(rep.errors)
        self.assertIn("first person ('I')", errors)
        clean = self.check({"00-a.md": "# A\n\nManuel I of Portugal came here, and so did Alfonso II. See Part I of the book.\n"})
        self.assertNotIn("first person", "\n".join(clean.errors))

    def test_altitudes_and_temperatures_need_a_tilde_and_business_names_are_noticed(self):
        rep = self.check({"00-a.md": "# A\n\nThe pass is 1,100 m high and it can be 35°C. A day of ~25 km. Sleep at the Hostal Don Pedro tonight.\n"})
        text = "\n".join(rep.warnings)
        self.assertIn("2 figure(s) without '~'", text)
        self.assertIn("'Hostal D...' looks like a business name", text)
        self.assertEqual(self.check({"00-a.md": "# A\n\nThe pass is ~1,100 m high and ~35°C. ~25 km.\n"}).warnings, [w for w in self.check({"00-a.md": "# A\n\nThe pass is ~1,100 m high and ~35°C. ~25 km.\n"}).warnings if "figure" not in w])

    def test_about_marks_an_approximation_like_a_tilde(self):
        rep = self.check({"00-a.md": "# A\n\nThe record low is about \u22126 °C, a pass of about 1,100 m, and roughly 25 km. But 30 km is bare.\n"})
        self.assertIn("1 figure(s) without '~'", "\n".join(rep.warnings))

    def test_a_chapter_that_is_too_long_is_noticed(self):
        rep = self.check({"00-a.md": "# A\n\n" + ("word " * 1900) + "\n"})
        self.assertIn("a chapter is at most 1,800", "\n".join(rep.warnings))

    def test_metadata_is_checked(self):
        rep = self.check({"00-a.md": "# A\n\nx\n"}, meta=guide_meta(id="demo-guide", description_short="x" * 201, keywords=["k"] * 8,
                                                                     cover={"colour": "pink", "icon": "library"}))
        text = "\n".join(rep.errors)
        self.assertIn("description_short is 201", text)
        self.assertIn("keywords must be", text)
        self.assertIn("cover.colour", text)


class Reflection(unittest.TestCase):
    def sources(self, t):
        folder = pathlib.Path(t) / "src"
        folder.mkdir()
        (folder / "pg9999.txt").write_text(SOURCE_TEXT, encoding="utf-8")
        return folder

    def book(self, t, n=21, passage=None):
        chapters = {"00-how.md": "# How\n\nx\n"}
        for i in range(1, n + 1):
            chapters[f"{i:02d}-reading-{i}.md"] = reading(i, passage) if passage else reading(i)
        return write_book(pathlib.Path(t) / "books", reflection_meta(), chapters)

    def test_passages_are_verified_against_the_source(self):
        with tempfile.TemporaryDirectory() as t:
            rep = cb.check_book(self.book(t), self.sources(t))
            self.assertEqual(rep.errors, [])

    def test_a_passage_not_in_the_source_is_an_error(self):
        with tempfile.TemporaryDirectory() as t:
            rep = cb.check_book(self.book(t, passage="He who follows Me walks always in the light of day."), self.sources(t))
            self.assertIn("is not in the source text", "\n".join(rep.errors))

    def test_exact_loose_and_missing(self):
        pair = [(cb._strict(SOURCE_TEXT), cb._loose(SOURCE_TEXT))]
        self.assertEqual(cb.verify_passage("walketh not in darkness, saith the Lord.", pair), "exact")
        self.assertEqual(cb.verify_passage("we ought to imitate His life—and manners", pair), "exact")   # -- is a dash; the source wraps lines
        self.assertEqual(cb.verify_passage("we ought to imitate His life and manners", pair), "loose")   # a dash became a space: same words
        self.assertEqual(cb.verify_passage("Walketh not in darkness saith the lord", pair), "loose")    # punctuation and capitals differ
        self.assertEqual(cb.verify_passage("walketh not in darkness … every man naturally desireth to know", pair), "loose")
        self.assertEqual(cb.verify_passage("walketh always in the light", pair), "missing")

    def test_world_english_bible_verse_numbers_are_not_text(self):
        with tempfile.TemporaryDirectory() as t:
            folder = pathlib.Path(t)
            (folder / "pg8294.txt").write_text(WEB_TEXT, encoding="utf-8")
            src = {"id": "gutenberg-8294", "work": "The World English Bible (WEB)"}
            pair = cb.Sources(folder).get(src)
            self.assertEqual(cb.verify_passage("I will lift up my eyes to the hills. Where does my help come from? My help comes from Yahweh", [pair]), "exact")

    def test_the_bible_is_recognised_by_its_translation_or_its_id_not_only_by_the_work_title(self):
        with tempfile.TemporaryDirectory() as t:
            folder = pathlib.Path(t)
            (folder / "pg8294.txt").write_text(WEB_TEXT, encoding="utf-8")
            for src in ({"id": "gutenberg-8294", "work": "The Psalms of Ascent (Psalms 120 to 134)", "translator": "World English Bible"},
                        {"id": "gutenberg-8294", "work": "The Psalms of Ascent", "translator": "someone"}):
                pair = cb.Sources(folder).get(src)
                self.assertEqual(cb.verify_passage("I will lift up my eyes to the hills. Where does my help come from?", [pair]), "exact", src)

    def test_the_count_the_parts_and_their_order(self):
        with tempfile.TemporaryDirectory() as t:
            rep = cb.check_book(self.book(t, n=20), self.sources(t))
            self.assertIn("20 day chapters found, book.json says 21 days", "\n".join(rep.errors))
        with tempfile.TemporaryDirectory() as t:
            d = self.book(t)
            f = d / "chapters" / "05-reading-5.md"
            f.write_text(f.read_text(encoding="utf-8").replace("## For the walk", "## Something else"), encoding="utf-8")
            rep = cb.check_book(d, self.sources(t))
            self.assertIn("exactly one '## For the walk'", "\n".join(rep.errors))
        with tempfile.TemporaryDirectory() as t:      # the five parts are all there but not in order
            d = self.book(t)
            f = d / "chapters" / "07-reading-7.md"
            txt = f.read_text(encoding="utf-8")
            f.write_text(txt.replace("## For the walk", "## TMP").replace("## Reflection", "## For the walk").replace("## TMP", "## Reflection"), encoding="utf-8")
            self.assertIn("the parts of a day come in this order", "\n".join(cb.check_book(d, self.sources(t)).errors))

    def test_days_are_declared_and_can_differ_from_book_to_book(self):
        with tempfile.TemporaryDirectory() as t:
            d, src = self.book(t, n=6), self.sources(t)
            meta = json.loads((d / "book.json").read_text(encoding="utf-8"))
            meta["days"] = 6
            (d / "book.json").write_text(json.dumps(meta), encoding="utf-8")
            self.assertEqual(cb.check_book(d, src).errors, [])           # a short book for a short Camino is fine
            meta["days"] = 22
            (d / "book.json").write_text(json.dumps(meta), encoding="utf-8")
            self.assertIn("'days' must be a whole number from 3 to 21", "\n".join(cb.check_book(d, src).errors))
            del meta["days"]
            (d / "book.json").write_text(json.dumps(meta), encoding="utf-8")
            self.assertIn("'days' must be a whole number", "\n".join(cb.check_book(d, src).errors))

    def test_the_end_of_day_questions_are_a_list_the_app_can_show(self):
        with tempfile.TemporaryDirectory() as t:
            d = self.book(t)
            f = d / "chapters" / "03-reading-3.md"
            f.write_text(f.read_text(encoding="utf-8").replace("- What was hard?\n", "Just a paragraph here.\n"), encoding="utf-8")
            self.assertIn("needs its questions as a '-' list", "\n".join(cb.check_book(d, self.sources(t)).errors))

    def test_a_day_is_a_five_minute_morning_and_a_three_minute_evening(self):
        with tempfile.TemporaryDirectory() as t:
            rep = cb.check_book(self.book(t), self.sources(t))
            text = "\n".join(rep.warnings)
            self.assertIn("the morning reading is", text)          # the fixture's days are far shorter than 5 and 3 minutes
            self.assertIn("the end-of-day reflection is", text)
            self.assertIn("(aim for 5 min: 850 to 1,350 words)", text)
            self.assertIn("(aim for 3 min: 450 to 800 words)", text)

    def test_an_almost_right_quotation_in_the_prose_is_found_and_the_authors_own_words_are_not(self):
        with tempfile.TemporaryDirectory() as t:
            d, src = self.book(t), self.sources(t)
            f = d / "chapters" / "04-reading-4.md"
            txt = f.read_text(encoding="utf-8")
            f.write_text(txt.replace("A reflection that begins with a road", 'As he says, *walketh not in darkness, sayeth the Lord*, and I think "this is today\'s weight for me" is a fair thing to say. A reflection that begins with a road', 1), encoding="utf-8")
            text = "\n".join(cb.check_book(d, src).warnings)
            self.assertIn("'walketh not in darkness, sayeth the Lord' is almost, but not exactly, in the source", text)
            self.assertNotIn("today's weight", text)           # the writer's own words in quotation marks are not quotations of the classic
            f.write_text(txt.replace("A reflection that begins with a road", "As he says, *walketh not in darkness, saith the Lord*, and a reflection that begins with a road", 1), encoding="utf-8")
            self.assertNotIn("almost, but not exactly", "\n".join(cb.check_book(d, src).warnings))   # an exact quotation is fine

    def test_straight_quotation_marks_are_paired_in_order(self):
        self.assertEqual(cb._double_quoted('The word "saunter" is old, and "this is the longer quotation that matters" is his.'),
                         ["this is the longer quotation that matters"])      # not the text between the two
        self.assertEqual(cb._double_quoted("A “short” word and “a longer curly quotation here”."), ["a longer curly quotation here"])
        self.assertEqual(cb._double_quoted('One stray " mark and nothing else'), [])                                       # an odd one out pairs with nothing

    def test_a_repeated_formula_is_noticed_and_a_prayer_in_italics_is_not_a_quotation(self):
        with tempfile.TemporaryDirectory() as t:
            d, src = self.book(t), self.sources(t)
            for g in (d / "chapters").glob("[0-9][0-9]-reading-*.md"):
                g.write_text(g.read_text(encoding="utf-8").replace("A reflection that begins", "Look back over the day and notice. A reflection that begins"), encoding="utf-8")
            text = "\n".join(cb.check_book(d, src).warnings)
            self.assertIn("the sentence opening 'look back over the day ...' recurs in 21 chapters", text)
            f = d / "chapters" / "05-reading-5.md"
            f.write_text(f.read_text(encoding="utf-8").replace("Give us enough light for the next step.", "*Give us enough light for the next step, and let us rest.*"), encoding="utf-8")
            self.assertNotIn("almost, but not exactly", "\n".join(cb.check_book(d, src).warnings))

    def test_the_walk_part_has_a_size(self):
        with tempfile.TemporaryDirectory() as t:
            text = "\n".join(cb.check_book(self.book(t), self.sources(t)).warnings)
            self.assertIn("'For the walk' is 2 words", text)

    def test_text_from_keeps_an_editors_introduction_out_of_the_source(self):
        intro_src = SOURCE_TEXT.replace("CHAPTER I\n", "INTRODUCTION\n\nThe editor says: Walketh not in the dark, saith the Lord, about this.\n\nTHE WORK BEGINS\n\nCHAPTER I\n", 1)
        with tempfile.TemporaryDirectory() as t:
            folder = pathlib.Path(t) / "src"
            folder.mkdir()
            (folder / "pg9999.txt").write_text(intro_src, encoding="utf-8")
            d = self.book(t, passage="Walketh not in the dark, saith the Lord, about this.")
            self.assertIn("is not in the source text", "\n".join(cb.check_book(d, folder).errors) or "is not in the source text")     # control: with no text_from the editor's line counts
            meta = json.loads((d / "book.json").read_text(encoding="utf-8"))
            self.assertEqual([e for e in cb.check_book(d, folder).errors if "not in the source" in e], [])
            meta["sources"][0]["text_from"] = "He who follows Me"
            (d / "book.json").write_text(json.dumps(meta), encoding="utf-8")
            self.assertTrue([e for e in cb.check_book(d, folder).errors if "not in the source" in e])      # now only the work's own text counts
            meta["sources"][0]["text_from"] = "Words that are nowhere in the file"
            (d / "book.json").write_text(json.dumps(meta), encoding="utf-8")
            self.assertIn("text_from 'Words that are nowhere in the file' is not in the file", "\n".join(cb.check_book(d, folder).errors))

    def test_quoted_passages_must_stay_a_minority(self):
        passage = "These are the words of Christ, by which we are admonished how we ought to imitate His life—and manners, if we would be truly enlightened."
        with tempfile.TemporaryDirectory() as t:
            src = self.sources(t)
            self.assertNotIn("quoted passages are", "\n".join(cb.check_book(self.book(t, passage=passage), src).warnings))
        with tempfile.TemporaryDirectory() as t:
            d, src = self.book(t, passage=passage), self.sources(t)
            for g in (d / "chapters").glob("[0-9][0-9]-reading-*.md"):    # a book that is mostly quotation: shrink every reflection
                txt = g.read_text(encoding="utf-8")
                start, end = txt.index("## Reflection"), txt.index("## For the walk")
                g.write_text(txt[:start] + "## Reflection\n\nShort.\n\n" + txt[end:], encoding="utf-8")
            self.assertIn("quoted passages are", "\n".join(cb.check_book(d, src).warnings))

    def test_without_source_files_it_says_so(self):
        with tempfile.TemporaryDirectory() as t:
            rep = cb.check_book(self.book(t))
            self.assertIn("no source text to verify", "\n".join(rep.errors))


class Build(unittest.TestCase):
    def make(self, t):
        root = pathlib.Path(t) / "books"
        write_book(root, guide_meta(), {"00-welcome.md": "# Welcome\n\nA walk of ~120 km.\n\n## A section\n\n- one\n- two\n\n> A quote\n>\n> — Someone\n",
                                        "01-end.md": "# The end\n\nBuen Camino.\n"}, FACTS)
        return root

    def load(self, root):
        return bk.load_book(root / "demo-guide")

    def test_epub_is_a_valid_zip_with_every_file_listed(self):
        with tempfile.TemporaryDirectory() as t:
            data = bb.epub_bytes(self.load(self.make(t)), None)
            z = zipfile.ZipFile(__import__("io").BytesIO(data))
            names = z.namelist()
            self.assertEqual(names[0], "mimetype")
            self.assertEqual(z.getinfo("mimetype").compress_type, zipfile.ZIP_STORED)
            self.assertEqual(z.read("mimetype"), b"application/epub+zip")
            opf = ET.fromstring(z.read("OEBPS/content.opf"))
            ns = {"o": "http://www.idpf.org/2007/opf"}
            hrefs = [i.get("href") for i in opf.findall(".//o:item", ns)]
            for h in hrefs:
                self.assertIn(f"OEBPS/{h}", names)
            ids = {i.get("id") for i in opf.findall(".//o:item", ns)}
            self.assertTrue({r.get("idref") for r in opf.findall(".//o:itemref", ns)} <= ids)
            self.assertEqual(opf.find(".//o:spine", ns).get("toc"), "ncx")
            for n in names:
                if n.endswith((".xhtml", ".ncx", ".opf")):
                    ET.fromstring(z.read(n))    # well-formed XML

    def test_epub_with_a_cover_marks_the_cover_image(self):
        with tempfile.TemporaryDirectory() as t:
            png = pathlib.Path(t) / "c.png"
            png.write_bytes(b"\x89PNG\r\n\x1a\n")
            z = zipfile.ZipFile(__import__("io").BytesIO(bb.epub_bytes(self.load(self.make(t)), png)))
            self.assertIn('properties="cover-image"', z.read("OEBPS/content.opf").decode())
            self.assertIn("OEBPS/cover.xhtml", z.namelist())

    def test_the_build_is_deterministic(self):
        with tempfile.TemporaryDirectory() as t:
            b = self.load(self.make(t))
            self.assertEqual(bb.epub_bytes(b, None), bb.epub_bytes(b, None))
            self.assertEqual(bb.app_bundle([b]), bb.app_bundle([b]))

    def test_app_bundle_and_its_sync_check(self):
        with tempfile.TemporaryDirectory() as t:
            b = self.load(self.make(t))
            out = pathlib.Path(t) / "app"
            bb.write_app_bundle([b], out)
            cat = json.loads((out / "catalog.json").read_text(encoding="utf-8"))
            self.assertEqual(cat["books"][0]["id"], "demo-guide")
            self.assertEqual(cat["books"][0]["route_slug"], "camino-ingles")
            self.assertEqual([c["id"] for c in cat["books"][0]["chapters"]], ["00-welcome", "01-end"])
            book = json.loads((out / "books" / "demo-guide.json").read_text(encoding="utf-8"))
            self.assertEqual(book["chapters"][0]["title"], "Welcome")
            self.assertEqual(book["chapters"][0]["blocks"][0]["t"], "p")      # the # title is the chapter title, not a block
            self.assertEqual(bb.check_app_bundle([b], out), [])
            (out / "books" / "demo-guide.json").write_text("{}\n", encoding="utf-8")
            (out / "books" / "old.json").write_text("{}\n", encoding="utf-8")
            self.assertEqual(sorted(bb.check_app_bundle([b], out)), ["differs: books/demo-guide.json", "stale (no such book): books/old.json"])
            bb.write_app_bundle([b], out)    # rewriting removes the stale file and repairs the other
            self.assertEqual(bb.check_app_bundle([b], out), [])

    def test_the_app_module_loads_each_book_lazily_and_is_kept_in_sync(self):
        with tempfile.TemporaryDirectory() as t:
            b = self.load(self.make(t))
            out, index = pathlib.Path(t) / "mobile" / "assets" / "library", pathlib.Path(t) / "mobile" / "src" / "features" / "library" / "bookBundle.ts"
            bb.write_app_bundle([b], out, index)
            text = index.read_text(encoding="utf-8")
            self.assertIn("GENERATED by tools/build_books.py", text)
            self.assertIn("require('../../../assets/library/catalog.json')", text)
            self.assertIn("'demo-guide': () => require('../../../assets/library/books/demo-guide.json') as BookContent,", text)
            self.assertNotIn("import catalog", text, "the books must not be imported (parsed) when the module loads")
            self.assertEqual(bb.check_app_bundle([b], out, index), [])
            index.write_text("// edited by hand\n", encoding="utf-8")
            self.assertEqual(bb.check_app_bundle([b], out, index), ["differs: bookBundle.ts"])

    def test_the_credit_of_a_source_reads_well_whatever_the_translator_field_holds(self):
        base = {"work": "The Work", "author": "An Author", "year": "1900", "licence": "Public domain"}
        self.assertEqual(bb.source_credit({**base, "translator": "William Benham", "year": "1886"}), "The Work, An Author. Translated by William Benham (1886). Public domain.")
        self.assertEqual(bb.source_credit({**base, "translator": "none (English original)", "year": "1862"}), "The Work, An Author. English original, 1862. Public domain.")
        self.assertEqual(bb.source_credit({**base, "translator": "anonymous translation from the French, Fleming H. Revell Company edition", "year": "undated old print edition"}),
                         "The Work, An Author. Anonymous translation from the French, Fleming H. Revell Company edition, undated old print edition. Public domain.")
        self.assertEqual(bb.source_credit({**base, "translator": "World English Bible contributors", "year": "public domain, modern translation"}),
                         "The Work, An Author. World English Bible contributors, public domain, modern translation. Public domain.")

    def test_the_app_book_carries_its_credit_line(self):
        with tempfile.TemporaryDirectory() as t:
            root = pathlib.Path(t) / "books"
            meta = reflection_meta(id="demo-reflection")
            d = write_book(root, meta, {"00-a.md": "# A\n\nx\n"})
            book = bk.load_book(d)
            self.assertEqual(bb.app_book(book)["credit"], "The Imitation of Christ, Thomas à Kempis. Translated by William Benham (1886). Public domain.")
            g = write_book(root, guide_meta(), {"00-a.md": "# A\n\nx\n"}, FACTS)
            self.assertEqual(bb.app_book(bk.load_book(g))["credit"], "By Test Author.")

    def test_store_json_leaves_isbn_and_price_to_the_publisher(self):
        with tempfile.TemporaryDirectory() as t:
            s = bb.store_json(self.load(self.make(t)), None)
            self.assertIsNone(s["isbn"])
            self.assertIsNone(s["price"])
            self.assertIn("AI assistance", s["ai_disclosure"])
            self.assertTrue(s["description_long_html"].startswith("<p>"))


if __name__ == "__main__":
    unittest.main()
