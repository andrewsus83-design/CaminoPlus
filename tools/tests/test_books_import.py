"""Tests for tools/books/: the importer that turns public domain editions into the text assets of the Books tab.

No network: every text below is a few paragraphs written here, in the shapes the editions have. What is checked is each cleaning rule (wrapped
lines, boilerplate, chapter headings in the styles the books use, footnotes, a poem, a numbered list), that a file with the wrong hash is refused,
that a line no rule takes is a hard error, that the output is deterministic, that --check notices a changed asset, and that the assets in the
repository are exactly what the recipes make (hashes, order, index, generated TypeScript).
Run from the repository root:  python3 -m unittest discover -s tools/tests -v"""
import contextlib
import dataclasses
import hashlib
import io
import json
import os
import pathlib
import re
import subprocess
import sys
import tempfile
import unittest
import unittest.mock

TOOLS = pathlib.Path(__file__).resolve().parent.parent
ROOT = TOOLS.parent
sys.path.insert(0, str(TOOLS / "books"))

import books_build as B  # noqa: E402
import books_clean as C  # noqa: E402
import books_recipes as R  # noqa: E402
import import_books as I  # noqa: E402


def raw(text: str) -> bytes:
    return text.encode("utf-8")


def lines_of(text: str) -> list[str]:
    return C.decode(raw(text))


def gutenberg(body: str) -> str:
    return ("Title: A Book\n\n*** START OF THE PROJECT GUTENBERG EBOOK A BOOK ***\n" + body +
            "\n*** END OF THE PROJECT GUTENBERG EBOOK A BOOK ***\n\nThe Full Project Gutenberg License ...\n")


def parse(fn, text: str, book: str = "fixture") -> B.Collector:
    out = B.Collector(book)
    fn(lines_of(text), 1, out)
    out.finish()
    return out


def blocks_of_chapter(out: B.Collector, n: int) -> list[dict]:
    return out.chapters[n].blocks


# ---- reading the raw file ------------------------------------------------------------------------------------------
class Reading(unittest.TestCase):
    def test_decode_drops_a_bom_and_reads_cr_lf_and_right_strips(self):
        self.assertEqual(C.decode(b"\xef\xbb\xbfone  \r\ntwo\rthree\n"), ["one", "two", "three", ""])

    def test_blocks_keep_the_raw_line_number_and_the_blank_lines_before_them(self):
        blocks = C.blocks_of(lines_of("a\nb\n\n\n\nc\n"), 10)
        self.assertEqual([(b.no, b.lines, b.gap) for b in blocks], [(10, ("a", "b"), 0), (15, ("c",), 3)])

    def test_the_boilerplate_before_and_after_the_text_is_cut_and_the_first_line_number_is_kept(self):
        body, first = C.gutenberg_body(lines_of(gutenberg("\nBOOK I\n\nText.\n")))
        self.assertEqual(body, ["", "BOOK I", "", "Text.", ""])
        self.assertEqual(first, 4, "the START mark is on line 3 of the raw text")

    def test_a_text_without_one_start_and_one_end_mark_is_refused(self):
        for text in ("no marks at all\n", "*** START OF A\n*** START OF B\n*** END OF A\n", "*** END OF A\n*** START OF A\n"):
            with self.assertRaises(C.BookError):
                C.gutenberg_body(lines_of(text))

    def test_indent_is_that_of_the_least_indented_line_so_a_first_line_indent_is_not_a_quotation(self):
        first_line_indented, whole_block_indented = C.blocks_of(lines_of("  An indented first line\nthen flush\n\n      verse one\n      verse two\n"))
        self.assertEqual(first_line_indented.indent, 0)
        self.assertEqual(whole_block_indented.indent, 6)


# ---- cleaning one paragraph ----------------------------------------------------------------------------------------
class Cleaning(unittest.TestCase):
    def test_hard_wrapped_lines_become_one_paragraph(self):
        self.assertEqual(C.unwrap(["Great art Thou, O Lord, and greatly", "to be praised;  great is Thy power,", "and Thy wisdom infinite."]),
                         "Great art Thou, O Lord, and greatly to be praised;  great is Thy power, and Thy wisdom infinite.")
        self.assertEqual(C.tidy("to be praised;  great"), "to be praised; great", "tidy collapses the double space")

    def test_a_hyphen_at_the_end_of_a_line_stays_and_the_two_halves_are_glued_and_counted(self):
        from collections import Counter
        stats = Counter()
        self.assertEqual(C.unwrap(["into more and more fruitless seed-", "plots of sorrow"], stats), "into more and more fruitless seed-plots of sorrow")
        self.assertEqual(stats["hyphen joins"], 1)
        self.assertEqual(C.unwrap(["a word --", "next"]), "a word -- next", "a dash with a space before it keeps its space")

    def test_a_dash_made_of_two_hyphens_becomes_an_em_dash_also_across_a_line_end(self):
        self.assertEqual(C.tidy(C.unwrap(["the Saints--and", "she--", "began"])), "the Saints\u2014and she\u2014began")

    def test_a_run_of_hyphens_is_a_dash_when_it_is_two_or_three_and_a_blank_line_when_it_is_longer(self):
        self.assertEqual(C.tidy("love,---turtle-doves; yes--no"), "love,\u2014turtle-doves; yes\u2014no")
        self.assertEqual(C.tidy("the first line of the G------- as many"), "the first line of the G------- as many")

    def test_underscores_for_italics_are_removed_and_the_words_stay(self):
        self.assertEqual(C.tidy("_He that followeth me shall not walk in darkness_, saith the Lord. _i.e._, so"),
                         "He that followeth me shall not walk in darkness, saith the Lord. i.e., so")

    def test_no_break_spaces_tabs_and_runs_of_spaces_are_one_space_and_the_text_is_in_normal_form(self):
        self.assertEqual(C.tidy("a\u00a0b\t c   d"), "a b c d")
        self.assertEqual(C.tidy("e\u0301"), "\u00e9")

    def test_footnote_marks_in_square_brackets_are_removed_with_the_space_they_took(self):
        pattern = re.compile(r"\s*\[(\d{1,2})\]\s*")
        self.assertEqual(C.strip_markers("read this story of my life [1] to keep in mind", pattern), ("read this story of my life to keep in mind", [1]))
        self.assertEqual(C.strip_markers("her death most Christian. [2]", pattern), ("her death most Christian.", [2]))
        self.assertEqual(C.strip_markers("with the tomb[3], then", pattern), ("with the tomb, then", [3]))
        self.assertEqual(C.strip_markers("a [4] b [5] c", pattern), ("a b c", [4, 5]))

    def test_footnote_marks_in_round_brackets_glued_to_the_word_are_removed_too(self):
        pattern = re.compile(r"\s*\((\d{1,2})\)\s*")
        self.assertEqual(C.strip_markers("walk in darkness,(1) saith the Lord. Amen.(2)", pattern), ("walk in darkness, saith the Lord. Amen.", [1, 2]))

    def test_a_heading_in_capitals_is_set_in_title_case_and_other_text_is_left_alone(self):
        self.assertEqual(C.title_case("THE FIRST BOOK OF THE SAINT'S LIFE"), "The First Book of the Saint's Life")
        self.assertEqual(C.title_case("A PRAYER FOR THE SPIRIT OF DEVOTION"), "A Prayer for the Spirit of Devotion")
        self.assertEqual(C.title_case("A PRAYER TO DO GOD\u2019S WILL"), "A Prayer to Do God\u2019s Will", "a curly apostrophe does not start a word")
        self.assertEqual(C.title_case("PART II OF I AND THE LORD"), "Part II of I and the Lord")
        self.assertEqual(C.title_case("Of thinking humbly of oneself"), "Of thinking humbly of oneself")
        self.assertEqual(C.title_case("1234"), "1234")

    def test_roman_numerals(self):
        self.assertEqual([C.roman(s) for s in ("I", "IV", "IX", "XIV", "XL", "XCIX", "CXIV")], [1, 4, 9, 14, 40, 99, 114])


# ---- the guards on the text of a block -----------------------------------------------------------------------------
class Guards(unittest.TestCase):
    def reject(self, kind, text, what):
        with self.assertRaisesRegex(C.BookError, what):
            C.check_text("fixture", 7, kind, text)

    def test_text_that_looks_like_markup_the_library_or_a_page_number_is_refused_naming_book_and_line(self):
        self.reject("p", "a <b>bold</b> word", "angle bracket")
        self.reject("p", "an _emphasised_ word", "underscore")
        self.reject("p", "text [Illustration: a coat of arms] text", "bracketed note")
        self.reject("p", "text [Footnote 3: see] text", "bracketed note")
        self.reject("p", "This is a Project Gutenberg text", "digital library")
        self.reject("p", "two  spaces", "double space")
        self.reject("p", " leading", "space at an end")
        self.reject("p", "a\u00a0b", "no-break")
        self.reject("p", "12", "page or section number")
        self.reject("p", "IV.", "page or section number")
        self.reject("p", "[27]", "page or section number")
        self.reject("p", "", "empty")
        self.reject("p", "one\ntwo", "line break")
        self.reject("q", "one\n two", "space at an end")
        self.reject("q", "one\n\ntwo", "empty line")
        try:
            C.check_text("fixture", 7, "p", "bad _text_")
        except C.BookError as e:
            self.assertEqual((e.book, e.line), ("fixture", 7))
            self.assertTrue(str(e).startswith("fixture: line 7: "))

    def test_brackets_the_translator_wrote_are_text_and_pass(self):
        C.check_text("fixture", 1, "p", "that I may be able very often to [celebrate, and] receive to my health")
        C.check_text("fixture", 1, "q", "a line\nand another line")


# ---- what a recipe may do with a block -----------------------------------------------------------------------------
class Collecting(unittest.TestCase):
    def collector(self):
        out = B.Collector("fixture")
        out.part("Book One", 1)
        out.chapter("Chapter I. Of things", 2)
        return out

    def test_a_row_of_asterisks_is_a_break_an_indented_block_a_quotation_and_the_rest_paragraphs(self):
        out = self.collector()
        for block in C.blocks_of(lines_of("Plain text that was\nwrapped.\n\n       *       *       *       *\n\n      Maker of all, the Lord,\n        And Ruler of the height,\n")):
            out.paragraph(block, verse=True)
        self.assertEqual(out.chapters[0].blocks, [
            {"k": "p", "t": "Plain text that was wrapped."}, {"k": "hr"}, {"k": "q", "t": "Maker of all, the Lord,\nAnd Ruler of the height,"}])
        self.assertEqual(out.chapters[0].part, "Book One")

    def test_an_indented_block_is_prose_when_the_recipe_does_not_ask_for_verse_and_an_error_when_quotations_are_not_expected(self):
        block = C.blocks_of(lines_of("    a quoted passage that was\n    wrapped in the edition\n"))[0]
        out = self.collector()
        out.paragraph(block)
        self.assertEqual(out.chapters[0].blocks, [{"k": "q", "t": "a quoted passage that was wrapped in the edition"}])
        with self.assertRaisesRegex(C.BookError, "line 1: an indented block where none is expected"):
            self.collector().paragraph(block, allow_quote=False)

    def test_a_block_that_looks_like_a_heading_and_no_rule_took_is_an_error_not_a_paragraph(self):
        for text in ("CHAPTER IX.", "_CHAPTER IX._", "A PRAYER FOR PEACE", "Book Third.", "NOTES", "I.H.S."):
            with self.assertRaisesRegex(C.BookError, "heading that no rule"):
                self.collector().paragraph(C.blocks_of(lines_of(text + "\n"))[0])

    def test_text_before_the_first_chapter_and_a_chapter_without_text_are_errors(self):
        with self.assertRaisesRegex(C.BookError, "before the first chapter"):
            B.Collector("fixture").add("p", "orphan")
        out = B.Collector("fixture")
        out.chapter("Chapter I", 1)
        with self.assertRaisesRegex(C.BookError, "has no text"):
            out.chapter("Chapter II", 5)
        with self.assertRaisesRegex(C.BookError, "has no text"):
            out.finish()

    def test_the_marks_taken_out_of_a_paragraph_are_counted_and_returned(self):
        out = self.collector()
        found = out.paragraph(C.blocks_of(lines_of("one [1] and\ntwo [2]. End.\n"))[0], markers=re.compile(r"\s*\[(\d)\]\s*"))
        self.assertEqual(found, [1, 2])
        self.assertEqual(out.chapters[0].blocks[0]["t"], "one and two. End.")
        self.assertEqual(out.stats["footnote marks"], 2)

    def test_words_are_counted_over_every_text_block(self):
        out = self.collector()
        out.add("p", "one two three")
        out.add("q", "four five\nsix")
        out.rule()
        out.add("h", "seven")
        self.assertEqual(out.words, 7)


# ---- the recipes, on fixtures in the shapes of the editions -------------------------------------------------------
IMITATION = """THE IMITATION OF CHRIST

Contents

 THE FIRST BOOK ADMONITIONS PROFITABLE FOR THE SPIRITUAL LIFE
 CHAPTER I Of the imitation of Christ

THE FIRST BOOK
ADMONITIONS PROFITABLE FOR THE SPIRITUAL LIFE




CHAPTER I

Of the imitation of Christ, and of contempt of the world and all its
vanities


_He that followeth me shall not walk in darkness_,(1) saith the Lord.
These are the words of Christ.

2. His teaching surpasseth all teaching of holy men.(2) But there are
many who feel little longing.

(1) John viii. 12. (2) Revelations ii. 17.




CHAPTER II

Of thinking humbly of oneself


There is naturally in every man a desire to know.

The Voice of Christ


2. Rest from inordinate desire of knowledge.

A PRAYER FOR THE SPIRIT OF DEVOTION


3. O Lord my God, Thou art all my good.




THE SECOND BOOK
ADMONITIONS CONCERNING THE INNER LIFE




CHAPTER I

Of the inward life


The kingdom of God is within you.(1)

(1) St. Luke xvii. 21.
"""


class Imitation(unittest.TestCase):
    def test_parts_chapters_headings_and_numbered_paragraphs_with_the_footnotes_dropped_and_counted(self):
        out = parse(R.parse_imitation, gutenberg(IMITATION).split("\n*** END")[0].split("***\n", 1)[1])
        self.assertEqual([(c.part, c.title) for c in out.chapters], [
            ("The First Book. Admonitions Profitable for the Spiritual Life", "Chapter I. Of the imitation of Christ, and of contempt of the world and all its vanities"),
            ("The First Book. Admonitions Profitable for the Spiritual Life", "Chapter II. Of thinking humbly of oneself"),
            ("The Second Book. Admonitions Concerning the Inner Life", "Chapter I. Of the inward life")])
        self.assertEqual(blocks_of_chapter(out, 0), [
            {"k": "p", "t": "He that followeth me shall not walk in darkness, saith the Lord. These are the words of Christ."},
            {"k": "p", "t": "2. His teaching surpasseth all teaching of holy men. But there are many who feel little longing."}])
        self.assertEqual([b["k"] for b in blocks_of_chapter(out, 1)], ["p", "h", "p", "h", "p"])
        self.assertEqual(blocks_of_chapter(out, 1)[1], {"k": "h", "t": "The Voice of Christ"})
        self.assertEqual(blocks_of_chapter(out, 1)[3], {"k": "h", "t": "A Prayer for the Spirit of Devotion"})
        self.assertEqual(out.stats["footnotes"], 3)
        self.assertEqual(out.stats["footnote marks"], 3)

    def test_a_footnote_mark_without_its_note_or_a_note_without_its_mark_is_an_error(self):
        missing_note = IMITATION.replace("(1) John viii. 12. (2) Revelations ii. 17.", "(1) John viii. 12.")
        with self.assertRaisesRegex(C.BookError, "do not match"):
            parse(R.parse_imitation, missing_note)
        missing_mark = IMITATION.replace("holy men.(2) But", "holy men. But")
        with self.assertRaisesRegex(C.BookError, "do not match"):
            parse(R.parse_imitation, missing_mark)

    def test_a_heading_the_recipe_does_not_know_is_a_hard_error_with_the_line(self):
        odd = IMITATION.replace("A PRAYER FOR THE SPIRIT OF DEVOTION", "AN UNKNOWN SHOUTING HEADING")
        with self.assertRaisesRegex(C.BookError, r"fixture: line \d+: a heading that no rule of the recipe takes: 'AN UNKNOWN SHOUTING HEADING'"):
            parse(R.parse_imitation, odd)

    def test_the_text_must_start_where_the_recipe_says(self):
        with self.assertRaisesRegex(C.BookError, "was not found"):
            parse(R.parse_imitation, "no books here\n\nonly prose\n")


CONFESSIONS = """THE CONFESSIONS OF SAINT AUGUSTINE

By Saint Augustine

Translated by E. B. Pusey (Edward Bouverie)


AD 401




BOOK I


Great art Thou, O Lord, and greatly to be praised; great is Thy power,
and Thy wisdom infinite.

  As a boy, then, I had already heard of an eternal life, promised
us through the humility of the Lord our God.

         "Viewing a picture, where the tale was drawn,
         Of Jove's descending in a golden shower
         To Danae's lap a woman to beguile."

And then mark how he excites himself.




BOOK II


I will now call to mind my past foulness--and the carnal corruptions
of my soul.

                         GRATIAS TIBI DOMINE
"""


class Confessions(unittest.TestCase):
    def test_books_are_chapters_verse_keeps_its_lines_and_the_title_page_is_left_out(self):
        out = parse(R.parse_confessions, CONFESSIONS)
        self.assertEqual([c.title for c in out.chapters], ["Book I", "Book II"])
        first = blocks_of_chapter(out, 0)
        self.assertEqual([b["k"] for b in first], ["p", "p", "q", "p"])
        self.assertTrue(first[1]["t"].startswith("As a boy, then"), "a two-space first-line indent does not make a quotation")
        self.assertEqual(first[2]["t"], '"Viewing a picture, where the tale was drawn,\nOf Jove\'s descending in a golden shower\nTo Danae\'s lap a woman to beguile."')
        second = blocks_of_chapter(out, 1)
        self.assertEqual(second[0]["t"], "I will now call to mind my past foulness\u2014and the carnal corruptions of my soul.")
        self.assertEqual(second[1], {"k": "q", "t": "Gratias Tibi Domine"})

    def test_a_text_with_no_book_one_is_refused(self):
        with self.assertRaisesRegex(C.BookError, "BOOK I"):
            parse(R.parse_confessions, "Just prose.\n")


LIFE = """Front matter and the contents, left out.

Chapter I

Prologue


Prologue.


As I have been commanded and left at liberty to describe at
length my way of prayer, I beg of every one who shall read this story of my
life [1] to keep in mind how wicked it has been.

May He be blessed for ever! Amen.


1. The Saint, in a letter written in 1581, calls it the book "Of the
compassions of God."




Chapter I.


Childhood and Early Impressions.  The Blessing of Pious Parents.


1. I had a father and mother, who were devout. [1]

2. My mother also was a woman of great goodness. [2]  She was calm.

I.H.S.


1. See ch. xxxvii. § 1.

2. Alfonso Sanchez de Cepeda, father of the Saint, married first
Catalina del Peso.




Chapter II.


Of Certain Outward Temptations and Appearances of Satan.  Counsels for Those Who Go on

Unto Perfection.

1. Now that I have described certain temptations, I will speak of others. [1]

NOTES

1. Ch. x. § 1.

The
Relations or Manifestations
of Her
Spiritual State
"""


class LifeOfTeresa(unittest.TestCase):
    def test_prologue_and_chapters_titles_that_run_over_two_blocks_numbered_paragraphs_and_the_notes_dropped(self):
        with unittest.mock.patch.object(R, "LIFE_HEADINGS", 3):
            out = parse(R.parse_life_of_teresa, LIFE)
        self.assertEqual([c.title for c in out.chapters], [
            "Prologue", "Chapter I. Childhood and Early Impressions. The Blessing of Pious Parents.",
            "Chapter II. Of Certain Outward Temptations and Appearances of Satan. Counsels for Those Who Go on Unto Perfection."])
        self.assertEqual(blocks_of_chapter(out, 0)[0]["t"].endswith("story of my life to keep in mind how wicked it has been."), True)
        self.assertEqual([b["t"][:3] for b in blocks_of_chapter(out, 1)], ["1. ", "2. ", "I.H"], "the monogram is kept, the notes are not")
        self.assertEqual(blocks_of_chapter(out, 1)[2]["k"], "q")
        self.assertEqual(out.stats["footnotes"], 1 + 2 + 1)
        self.assertEqual(out.stats["footnote marks"], 1 + 2 + 1)

    def test_marks_and_notes_that_do_not_agree_are_an_error(self):
        broken = LIFE.replace("2. Alfonso Sanchez de Cepeda, father of the Saint, married first\nCatalina del Peso.\n", "")
        with unittest.mock.patch.object(R, "LIFE_HEADINGS", 3), self.assertRaisesRegex(C.BookError, "do not match"):
            parse(R.parse_life_of_teresa, broken)

    def test_the_number_of_headings_is_checked(self):
        with self.assertRaisesRegex(C.BookError, "expected the Prologue and 40 chapters, found 3 headings"):
            parse(R.parse_life_of_teresa, LIFE)


ABANDONMENT = """CONTENTS.

  APPENDIX.

Book First.

The Nature and Excellence of the Virtue of Holy Abandonment.




_CHAPTER I._

 The Sanctity of the Righteous of the Old Law, and of Joseph and of
 Mary herself.


God speaks to-day as He spoke to our fathers. All their spirituality
consisted in simple _fidelity_.

       *       *       *       *       *

More text of the chapter.




CHAPTER II.

 The Duties of each Moment.


Text of the second chapter.


Book Second.

The Divine Action.


_CHAPTER I._

 The divine action is everywhere.


Text of the third.

APPENDIX.

I. A very easy means of acquiring peace of heart.
"""


class Abandonment(unittest.TestCase):
    def test_books_parts_chapters_an_irregular_heading_a_break_and_the_appendix_left_out(self):
        out = parse(R.parse_abandonment, ABANDONMENT)
        self.assertEqual([(c.part, c.title) for c in out.chapters], [
            ("Book First. The Nature and Excellence of the Virtue of Holy Abandonment.", "Chapter I. The Sanctity of the Righteous of the Old Law, and of Joseph and of Mary herself."),
            ("Book First. The Nature and Excellence of the Virtue of Holy Abandonment.", "Chapter II. The Duties of each Moment."),
            ("Book Second. The Divine Action.", "Chapter I. The divine action is everywhere.")])
        self.assertEqual(blocks_of_chapter(out, 0), [
            {"k": "p", "t": "God speaks to-day as He spoke to our fathers. All their spirituality consisted in simple fidelity."},
            {"k": "hr"}, {"k": "p", "t": "More text of the chapter."}])


# ---- the plain texts of CCEL: rules of underscores between sections, headings at the margin or centred, paragraphs indented by three ---------------
RULE = "     " + "_" * 66

EXERCISES = "\n".join([
    "                                   CONTENTS", "", "   Approbation of the Latin Text", "", RULE, "",
    "                                  GENERAL NOTE", "", "   In the reproduction of the text in English:", RULE, "",
    "                                   ANNOTATIONS", "", "        TO GIVE SOME UNDERSTANDING OF THE SPIRITUAL EXERCISES WHICH FOLLOW", "",
    "   First Annotation. The first Annotation is that by this name of Spiritual",
    "   Exercises is meant every way of examining one's conscience. [1]", "",
    "   Second Annotation. The second: He who gives the Exercises. [1]", RULE, "",
    "   [1] The word Annotation does not occur in the original after the first time.", RULE, "",
    "                                   FIRST WEEK", RULE, "",
    "PRINCIPLE AND FOUNDATION", "", "   Man is created to praise, reverence, and serve God our Lord.", "",
    "   G", "", "   G", RULE, "",
    "FIRST EXERCISE", "", "  IT IS A MEDITATION ON THE FIRST SIN", "",
    "   Prayer. The Preparatory Prayer is to ask grace of God our Lord.", "",
    "  THE SECOND DAY", "", "   A paragraph under a heading that stands inside the chapter. [2]", RULE, "",
    "   [2] A second note.", RULE, "",
    "                                SECOND WEEK", RULE, "",
    "THE CALL OF THE TEMPORAL KING", "", "  IT HELPS TO CONTEMPLATE THE LIFE OF THE KING ETERNAL", "", "   The text of the call.", RULE, "",
    "                                 GENERAL INDEX", "", "   Index entries, left out.", ""])


class ExercisesRecipe(unittest.TestCase):
    def test_sections_are_chapters_the_weeks_are_parts_inner_headings_are_headings_and_the_notes_and_the_grid_are_dropped(self):
        out = parse(R.parse_exercises, EXERCISES)
        self.assertEqual([(c.part, c.title) for c in out.chapters], [
            (None, "Annotations. To Give Some Understanding of the Spiritual Exercises Which Follow"),
            ("First Week", "Principle and Foundation"),
            ("First Week", "First Exercise. It Is a Meditation on the First Sin"),
            ("Second Week", "The Call of the Temporal King. It Helps to Contemplate the Life of the King Eternal")])
        self.assertEqual([b["k"] for b in blocks_of_chapter(out, 2)], ["p", "h", "p"])
        self.assertEqual(blocks_of_chapter(out, 2)[1], {"k": "h", "t": "The Second Day"})
        self.assertEqual(blocks_of_chapter(out, 0)[0]["t"], "First Annotation. The first Annotation is that by this name of Spiritual Exercises is meant every way of examining one's conscience.")
        self.assertEqual((out.stats["footnotes"], out.stats["figure lines"], out.stats["footnote marks"]), (2, 2, 3))
        self.assertNotIn("Approbation", json.dumps(out.chapters[0].blocks), "what comes before ANNOTATIONS is left out")
        self.assertNotIn("Index entries", json.dumps([c.blocks for c in out.chapters]), "what comes after the GENERAL INDEX is left out")

    def test_a_mark_without_its_note_or_a_note_without_its_mark_is_an_error(self):
        with self.assertRaisesRegex(C.BookError, "do not match"):
            parse(R.parse_exercises, EXERCISES.replace("   [2] A second note.", "   [3] A note for nothing."))
        with self.assertRaisesRegex(C.BookError, "do not match"):
            parse(R.parse_exercises, EXERCISES.replace("inside the chapter. [2]", "inside the chapter."))

    def test_a_note_may_be_cited_twice_and_a_text_that_does_not_start_where_the_recipe_says_is_refused(self):
        parse(R.parse_exercises, EXERCISES.replace("serve God our Lord.", "serve God our Lord. [1]"))
        with self.assertRaisesRegex(C.BookError, "ANNOTATIONS"):
            parse(R.parse_exercises, "just text\n")

    def test_a_centred_title_cut_by_a_rule_is_one_title_and_a_chapter_that_repeats_its_heading_is_not_split(self):
        text = EXERCISES.replace("                                 GENERAL INDEX", "\n".join([
            "                                   RULES", RULE, "", "FOR PERCEIVING AND KNOWING THE MOVEMENTS", "", "  THE GOOD, TO RECEIVE THEM", "",
            "   First Rule. The first Rule.", RULE, "", "                                 GENERAL INDEX"]))
        out = parse(R.parse_exercises, text)
        self.assertEqual((out.chapters[-1].part, out.chapters[-1].title), ("Rules", "Rules for Perceiving and Knowing the Movements. The Good, to Receive Them"))
        repeated = EXERCISES.replace("                                 GENERAL INDEX", "\n".join([
            "                           CONTEMPLATION TO GAIN LOVE", "", "   Note. First, it is well to remark two things.", "",
            "CONTEMPLATION TO GAIN LOVE", "", "   Prayer. The usual Prayer.", RULE, "", "                                 GENERAL INDEX"]))
        out = parse(R.parse_exercises, repeated)
        self.assertEqual(out.chapters[-1].title, "Contemplation to Gain Love")
        self.assertEqual(len(blocks_of_chapter(out, len(out.chapters) - 1)), 2)
        self.assertEqual(out.stats["repeated headings"], 1)


DEVOUT = "\n".join([
    "Preface by the Author", "", "   DEAR reader, I request you to read this Preface for your own",
    "   satisfaction as well as mine. [1]", RULE, "", "   [1] Pausias of Sicyon.", RULE, RULE, "",
    "  CONTENTS.", "", "   Contents text that is skipped.", RULE, "",
    " PART I. COUNSELS AND PRACTICES SUITABLE FOR THE SOUL'S", "    GUIDANCE FROM THE FIRST ASPIRATION", RULE, "",
    "CHAPTER I. What true Devotion is.", "", "   YOU aim at a devout life, dear child, because as a Christian you",
    "   know that it is a thing pleasing to God. [2]", "",
    "CHAPTER IV. The Need of a Guide for those who would enter upon and advance in", "the Devout Life.", "",
    "   1. PLACE yourself in the presence of God. 2. Ask Him to inspire your heart.", "", "   Preparation.", "",
    "   3. A numbered paragraph stays a paragraph with its number.", "", "   Beware of self-accusations such as: I have not prayed as much as I", "",
    "   ought; I have not loved my neighbour.", "", "   Amen.", RULE, "",
    "   [2] A footnote of the chapter.", "", "   A second paragraph of the same footnote.", RULE, "",
    "                   PART II. CONTAINING SUNDRY COUNSELS AS TO UPLIFTING THE SOUL.", RULE, "",
    "CHAPTER IX. FIRST MEDITATION.", "", "   BEGIN with an act of faith.", RULE, "",
    "INDEX.", "", "   ABJECTION, 153", ""])


class DevoutLifeRecipe(unittest.TestCase):
    def test_preface_parts_chapters_points_headings_first_words_and_the_footnotes_dropped(self):
        out = parse(R.parse_devout_life, DEVOUT)
        self.assertEqual([(c.part, c.title) for c in out.chapters], [
            (None, "Preface by the Author"),
            ("Part I. Counsels and Practices Suitable for the Soul's Guidance from the First Aspiration", "Chapter I. What true Devotion is."),
            ("Part I. Counsels and Practices Suitable for the Soul's Guidance from the First Aspiration",
             "Chapter IV. The Need of a Guide for those who would enter upon and advance in the Devout Life."),
            ("Part II. Containing Sundry Counsels as to Uplifting the Soul.", "Chapter IX. First Meditation.")])
        self.assertEqual(blocks_of_chapter(out, 0), [{"k": "p", "t": "Dear reader, I request you to read this Preface for your own satisfaction as well as mine."}])
        self.assertEqual(blocks_of_chapter(out, 1)[0]["t"], "You aim at a devout life, dear child, because as a Christian you know that it is a thing pleasing to God.")
        self.assertEqual(blocks_of_chapter(out, 2), [
            {"k": "li", "t": "1. Place yourself in the presence of God."}, {"k": "li", "t": "2. Ask Him to inspire your heart."}, {"k": "h", "t": "Preparation"},
            {"k": "p", "t": "3. A numbered paragraph stays a paragraph with its number."},
            {"k": "p", "t": "Beware of self-accusations such as: I have not prayed as much as I ought; I have not loved my neighbour."}, {"k": "p", "t": "Amen."}])
        self.assertEqual(blocks_of_chapter(out, 3)[0]["t"], "Begin with an act of faith.")
        self.assertEqual((out.stats["footnotes"], out.stats["footnote marks"], out.stats["points split"], out.stats["first words set in lower case"], out.stats["footnote lines"]), (2, 2, 1, 4, 1))
        self.assertEqual(out.stats["paragraphs rejoined after a page break"], 1)
        self.assertNotIn("Contents text", json.dumps([c.blocks for c in out.chapters]))
        self.assertNotIn("ABJECTION", json.dumps([c.blocks for c in out.chapters]))

    def test_a_mark_without_its_note_is_an_error_and_so_is_a_text_with_no_preface(self):
        with self.assertRaisesRegex(C.BookError, "do not match"):
            parse(R.parse_devout_life, DEVOUT.replace("   [2] A footnote of the chapter.", "   [3] A footnote of the chapter."))
        with self.assertRaisesRegex(C.BookError, "Preface by the Author"):
            parse(R.parse_devout_life, "CHAPTER I. Nothing.\n")

    def test_unshout_sets_a_first_word_in_capitals_as_a_word_and_leaves_the_rest(self):
        self.assertEqual(R.unshout("YOU aim at a devout life"), "You aim at a devout life")
        self.assertEqual(R.unshout("1. PRAYER opens the understanding"), "1. Prayer opens the understanding")
        self.assertEqual(R.unshout("AMEN and amen"), "AMEN and amen")
        self.assertEqual(R.unshout("GOD ALMIGHTY and the saints"), "GOD ALMIGHTY and the saints", "two words in capitals: not a first word, a name")
        self.assertEqual(R.unshout("I am here"), "I am here")

    def test_numbered_points_are_split_only_when_the_numbers_run_on(self):
        self.assertEqual(R.split_points("1. One thing. 2. Another thing."), ["1. One thing.", "2. Another thing."])
        self.assertEqual(R.split_points("1. One thing. 3. Another thing."), ["1. One thing. 3. Another thing."])
        self.assertEqual(R.split_points("In 1876. 2. a date"), ["In 1876. 2. a date"])

    def test_a_short_capitalised_line_with_a_full_stop_is_a_heading_and_a_sentence_is_not(self):
        self.assertTrue(R.subheading("Affections and Resolutions."))
        self.assertTrue(R.subheading("Of Creation."))
        self.assertFalse(R.subheading("Amen."))
        self.assertFalse(R.subheading("God is good and He is near."))
        self.assertFalse(R.subheading("1. Consider."))


DIALOGUE = "\n".join([
    "   CONTENTS", "", "   A TREATISE OF DIVINE PROVIDENCE", "", "   A TREATISE OF OBEDIENCE", RULE, "",
    "A TREATISE OF DIVINE PROVIDENCE", RULE, "",
    "      How a soul, elevated by desire of the honor of God, and of the salvation", "      of her neighbors, asked of God four requests.", "",
    "   The soul, who is lifted by a very great and yearning desire for the", "   honor of God, begins by exercising herself.", "",
    "   A second paragraph.", RULE, "", "      How the desire of this soul grew.", "", "   This desire was great and continuous.", RULE, "",
    "A TREATISE OF OBEDIENCE", RULE, "", "      Letter of Ser Barduccio.", "", "   Oh! had you seen with what humility.", RULE, "",
    "            This document is from the Christian Classics Ethereal", "               Library at Calvin College, http://www.ccel.org", ""])


class DialogueRecipe(unittest.TestCase):
    def test_treatises_are_parts_each_heading_indented_by_six_is_a_chapter_and_the_front_and_back_are_left_out(self):
        out = parse(R.parse_dialogue, DIALOGUE)
        self.assertEqual([(c.part, c.title) for c in out.chapters], [
            ("A Treatise of Divine Providence", "How a soul, elevated by desire of the honor of God, and of the salvation of her neighbors, asked of God four requests."),
            ("A Treatise of Divine Providence", "How the desire of this soul grew."),
            ("A Treatise of Obedience", "Letter of Ser Barduccio.")])
        self.assertEqual([b["t"] for b in blocks_of_chapter(out, 0)], [
            "The soul, who is lifted by a very great and yearning desire for the honor of God, begins by exercising herself.", "A second paragraph."])
        self.assertNotIn("Christian Classics", json.dumps([c.blocks for c in out.chapters]))

    def test_a_text_without_its_first_treatise_is_refused(self):
        with self.assertRaisesRegex(C.BookError, "A TREATISE OF DIVINE PROVIDENCE"):
            parse(R.parse_dialogue, "   A TREATISE OF DIVINE PROVIDENCE\n")


# ---- the whole pipeline: hash, build, write, check --------------------------------------------------------------------
def fake_recipe(text: str = gutenberg(CONFESSIONS), **kw) -> tuple[R.Recipe, bytes]:
    data = raw(text)
    base = dict(
        id="confessions", title="Confessions", author="Augustine of Hippo", translator="E. B. Pusey", translator_died=1882, translator_source="https://example.org/pusey",
        first_published=1838, edition="Pusey, 1838", source="https://example.org/3296", raw_url="https://example.org/pg3296.txt", raw_file="pg3296.txt",
        raw_kind="gutenberg", raw_sha256=hashlib.sha256(data).hexdigest(), basis="translator died 1882, first published 1838", verdict=R.PD,
        why_not="", credit="Pusey's Confessions. Public domain.",
        chapters=2, dropped=("title page",), parse=R.parse_confessions)
    base.update(kw)
    return R.Recipe(**base), data


class Pipeline(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = pathlib.Path(self.tmp.name)
        (self.dir / "raw").mkdir()
        self.recipe, self.data = fake_recipe()
        (self.dir / "raw" / "pg3296.txt").write_bytes(self.data)
        patches = [unittest.mock.patch.object(R, "RECIPES", (self.recipe,)), unittest.mock.patch.object(R, "CATALOGUE_ORDER", ("confessions",)),
                   unittest.mock.patch.object(R, "LEFT_OUT", ())]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)

    def run_cli(self, *args):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = I.run(["--raw-dir", str(self.dir / "raw"), "--offline", "--out", str(self.dir / "out"), *args])
        return code, out.getvalue(), err.getvalue()

    def test_a_download_with_another_hash_is_refused_and_nothing_is_written(self):
        (self.dir / "raw" / "pg3296.txt").write_bytes(self.data + b"\nan edit")
        code, _, err = self.run_cli()
        self.assertEqual(code, 1)
        self.assertIn("refusing to clean a file that is not the one the recipe was written for", err)
        self.assertFalse((self.dir / "out").exists())

    def test_offline_with_a_missing_raw_file_is_an_error_not_a_download(self):
        (self.dir / "raw" / "pg3296.txt").unlink()
        code, _, err = self.run_cli()
        self.assertEqual(code, 1)
        self.assertIn("--offline", err)

    def test_the_assets_are_written_in_the_shape_of_the_contract_with_ids_c1_to_cn(self):
        code, out, _ = self.run_cli()
        self.assertEqual(code, 0, out)
        book = json.loads((self.dir / "out" / "confessions.json").read_text(encoding="utf-8"))
        self.assertEqual(list(book), ["id", "title", "author", "translator", "credit", "chapters"])
        self.assertEqual([c["id"] for c in book["chapters"]], ["c1", "c2"])
        self.assertEqual(list(book["chapters"][0]), ["id", "title", "blocks"], "no part when the book has none")
        index = json.loads((self.dir / "out" / "index.json").read_text(encoding="utf-8"))
        self.assertEqual(index, [{"id": "confessions", "chapters": 2, "words": sum(len(b.get("t", "").split()) for c in book["chapters"] for b in c["blocks"])}])
        manifest = json.loads((self.dir / "out" / "manifest.json").read_text(encoding="utf-8"))
        entry = manifest["books"][0]
        self.assertEqual(entry["rawSha256"], self.recipe.raw_sha256)
        self.assertEqual(entry["outputSha256"], hashlib.sha256((self.dir / "out" / "confessions.json").read_bytes()).hexdigest())
        self.assertEqual((entry["verdict"], entry["translatorDied"], entry["firstPublished"]), (R.PD, 1882, 1838))
        self.assertEqual(manifest["leftOut"], [])
        ts = (self.dir / "out" / "books.generated.ts").read_text(encoding="utf-8")
        self.assertIn("'confessions': () => require('../../../../assets/books/confessions.json') as BookText,", ts)

    def test_the_output_is_deterministic_compact_utf8_with_one_final_newline(self):
        self.run_cli()
        first = {p.name: p.read_bytes() for p in (self.dir / "out").iterdir()}
        self.run_cli()
        self.assertEqual({p.name: p.read_bytes() for p in (self.dir / "out").iterdir()}, first)
        text = (self.dir / "out" / "confessions.json").read_bytes().decode("utf-8")
        self.assertTrue(text.endswith("}\n") and not text.endswith("\n\n"))
        self.assertNotIn("\n", text[:-1])
        self.assertNotIn(", ", text.split('"credit"')[0], "compact separators")
        self.assertNotIn("\\u2014", text, "characters are written as they are, not as escapes")

    def test_check_passes_on_fresh_assets_and_names_the_file_that_changed(self):
        self.run_cli()
        code, out, _ = self.run_cli("--check")
        self.assertEqual((code, "check: ok" in out), (0, True))
        for name in ("confessions.json", "index.json", "manifest.json", "books.generated.ts"):
            path = self.dir / "out" / name
            good = path.read_bytes()
            path.write_bytes(good.replace(b"a", b"b", 1))
            code, _, err = self.run_cli("--check")
            self.assertEqual(code, 1, name)
            self.assertIn(f"differs: {path}", err)
            path.write_bytes(good)
        (self.dir / "out" / "index.json").unlink()
        self.assertEqual(self.run_cli("--check")[0], 1, "a missing file is a difference")

    def test_check_writes_nothing(self):
        code, _, _ = self.run_cli("--check")
        self.assertEqual(code, 1)
        self.assertFalse((self.dir / "out").exists())

    def test_the_chapter_count_of_the_recipe_is_a_hard_check(self):
        recipe, _ = fake_recipe(chapters=3)
        with unittest.mock.patch.object(R, "RECIPES", (recipe,)):
            code, _, err = self.run_cli()
        self.assertEqual(code, 1)
        self.assertIn("expects 3 chapters, the text has 2", err)

    def test_a_book_whose_verdict_is_not_public_domain_everywhere_is_never_written_and_is_listed_as_left_out(self):
        recipe, _ = fake_recipe(verdict="unclear", why_not="the translator's death year is not known")
        with unittest.mock.patch.object(R, "RECIPES", (recipe,)):
            code, out, _ = self.run_cli()
            self.assertEqual(code, 0)
            self.assertIn("left out: confessions: unclear. the translator's death year is not known", out)
            self.assertFalse((self.dir / "out" / "confessions.json").exists())
            manifest = json.loads((self.dir / "out" / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["books"], [])
            self.assertEqual(manifest["leftOut"], [{"id": "confessions", "verdict": "unclear", "why": "the translator's death year is not known"}])
            self.assertEqual(json.loads((self.dir / "out" / "index.json").read_text(encoding="utf-8")), [])

    def test_rebuilding_one_book_keeps_the_manifest_entries_of_the_others(self):
        other, _ = fake_recipe(id="imitation-of-christ", title="The Imitation of Christ", raw_file="pg3296.txt")
        with unittest.mock.patch.object(R, "RECIPES", (self.recipe, other)), unittest.mock.patch.object(R, "CATALOGUE_ORDER", ("imitation-of-christ", "confessions")):
            self.assertEqual(self.run_cli()[0], 0)
            before = json.loads((self.dir / "out" / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual([b["id"] for b in before["books"]], ["imitation-of-christ", "confessions"], "the order of the catalogue")
            self.assertEqual(self.run_cli("--book", "confessions")[0], 0)
            after = json.loads((self.dir / "out" / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(after, before)
            with self.assertRaises(SystemExit):
                self.run_cli("--book", "no-such-book")

    def test_a_rule_that_cannot_take_a_block_stops_the_whole_run_naming_book_and_line(self):
        text = gutenberg(CONFESSIONS.replace("And then mark how he excites himself.", "AN UNEXPECTED HEADING"))
        recipe, data = fake_recipe(text)
        (self.dir / "raw" / "pg3296.txt").write_bytes(data)
        with unittest.mock.patch.object(R, "RECIPES", (recipe,)):
            code, _, err = self.run_cli()
        self.assertEqual(code, 1)
        self.assertRegex(err, r"error: confessions: line \d+: a heading that no rule of the recipe takes: 'AN UNEXPECTED HEADING'")

    def test_a_download_is_kept_in_the_raw_directory_and_the_user_agent_names_the_project(self):
        (self.dir / "raw" / "pg3296.txt").unlink()

        class Resp:
            def __enter__(self_inner):
                return self_inner

            def __exit__(self_inner, *a):
                return False

            def read(self_inner):
                return self.data

        seen = {}

        def fake_urlopen(req, timeout):
            seen["url"], seen["agent"] = req.full_url, req.get_header("User-agent")
            return Resp()

        with unittest.mock.patch.object(I.urllib.request, "urlopen", fake_urlopen), unittest.mock.patch.object(I.time, "sleep"):
            got = I.fetch(self.recipe, self.dir / "raw")
        self.assertEqual(got, self.data)
        self.assertEqual(seen["url"], "https://example.org/pg3296.txt")
        self.assertIn("CaminoPlus", seen["agent"])
        self.assertEqual((self.dir / "raw" / "pg3296.txt").read_bytes(), self.data)


# ---- the recipes of the repository and the assets they made ------------------------------------------------------
ASSETS = ROOT / "mobile" / "assets" / "books"
HEX64 = re.compile(r"^[0-9a-f]{64}$")


class Repository(unittest.TestCase):
    def test_every_recipe_is_a_book_of_the_catalogue_with_one_recipe_or_one_reason(self):
        ids = [r.id for r in R.RECIPES] + [x.id for x in R.LEFT_OUT]
        self.assertEqual(sorted(ids, key=R.CATALOGUE_ORDER.index), sorted(R.CATALOGUE_ORDER, key=R.CATALOGUE_ORDER.index), "all twelve books, each once")
        self.assertEqual(len(ids), len(set(ids)))
        catalog = (ROOT / "mobile/src/features/library/books/catalog.ts").read_text(encoding="utf-8")
        self.assertEqual(re.findall(r"\bid: '([a-z0-9-]+)'", catalog), list(R.CATALOGUE_ORDER), "the order of catalog.ts")

    def test_a_recipe_states_its_evidence_and_only_a_text_that_is_public_domain_everywhere_may_be_written(self):
        for r in R.RECIPES:
            self.assertRegex(r.raw_sha256, HEX64, r.id)
            self.assertIn(r.verdict, (R.PD, "US only", "unclear"), r.id)
            self.assertTrue(r.credit.strip() and r.edition.strip() and r.basis.strip() and r.source.startswith("https://"), r.id)
            self.assertLessEqual(r.first_published, 1930, f"{r.id}: first published after 1930 is not public domain in the US in 2026")
            if r.verdict == R.PD:
                if r.translator is None:  # the second way in: an anonymous translator and an edition older than 1900
                    self.assertLess(r.first_published, 1900, f"{r.id}: an anonymous translation must be older than 1900")
                    self.assertIsNone(r.translator_died, r.id)
                    self.assertIn("not named", r.basis + r.credit, r.id)
                else:
                    self.assertIsNotNone(r.translator_died, f"{r.id}: a death year is needed for 'public domain everywhere'")
                    self.assertLessEqual(r.translator_died, 1955, f"{r.id}: the translator died after 1955")
                    self.assertIn(r.translator, r.credit, r.id)
                    self.assertIn(str(r.translator_died), r.credit, r.id)
                self.assertIn(str(r.first_published), r.credit, r.id)
                self.assertRegex(r.credit, r"Public domain\.$", r.id)
                self.assertNotIn("gutenberg", r.credit.replace("gutenberg.org/ebooks/", "").lower(), f"{r.id}: the name of the library is not used as a stamp")
                self.assertRegex(r.credit, r"(gutenberg\.org/ebooks/\d+|ccel\.org/ccel/[a-z_/]+)", f"{r.id}: the credit names the source")
                self.assertEqual(r.why_not, "", r.id)
            else:
                self.assertTrue(r.why_not.strip(), f"{r.id}: a book that is left out says why")

    def test_the_assets_in_the_repository_are_what_the_recipes_say(self):
        manifest = json.loads((ASSETS / "manifest.json").read_text(encoding="utf-8"))
        index = json.loads((ASSETS / "index.json").read_text(encoding="utf-8"))
        by_id = {r.id: r for r in R.RECIPES}
        self.assertEqual([b["id"] for b in manifest["books"]], [e["id"] for e in index])
        self.assertEqual([e["id"] for e in index], sorted((e["id"] for e in index), key=R.CATALOGUE_ORDER.index), "catalogue order")
        self.assertEqual({r.id for r in R.RECIPES if r.verdict == R.PD}, {e["id"] for e in index}, "exactly the books that are public domain everywhere")
        for b in manifest["books"]:
            r = by_id[b["id"]]
            data = (ASSETS / f"{b['id']}.json").read_bytes()
            self.assertEqual(hashlib.sha256(data).hexdigest(), b["outputSha256"], b["id"])
            self.assertEqual(b["rawSha256"], r.raw_sha256, b["id"])
            self.assertEqual((b["credit"], b["translator"], b["translatorDied"], b["firstPublished"], b["verdict"]),
                             (r.credit, r.translator, r.translator_died, r.first_published, r.verdict), b["id"])
            self.assertEqual(sorted(x for x in ASSETS.glob("*.json")), sorted([ASSETS / "index.json", ASSETS / "manifest.json", *(ASSETS / f"{x['id']}.json" for x in manifest["books"])]))
        self.assertEqual([x["id"] for x in manifest["leftOut"]], [i for i in R.CATALOGUE_ORDER if i not in {e["id"] for e in index}])

    def test_the_generated_typescript_is_what_the_importer_makes_from_the_index(self):
        index = json.loads((ASSETS / "index.json").read_text(encoding="utf-8"))
        ts = (ROOT / "mobile/src/features/library/books/books.generated.ts").read_text(encoding="utf-8")
        self.assertEqual(ts, I.generated_ts([e["id"] for e in index]))

    def test_the_importer_runs_on_every_book_of_the_repository_from_the_list_option(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(I.run(["--list"]), 0)
        for book_id in R.CATALOGUE_ORDER:
            self.assertIn(book_id, out.getvalue())

    def test_the_python_files_of_the_tool_are_what_ci_compiles(self):
        import py_compile
        for path in sorted((TOOLS / "books").glob("*.py")):
            py_compile.compile(str(path), doraise=True, cfile=str(pathlib.Path(tempfile.gettempdir()) / "books_check.pyc"))

    @unittest.skipIf(os.environ.get("BREAKAGE_CHECK_RUNNING"), "a breakage is in place: the breakage check says itself when a text is not found exactly once")
    def test_every_breakage_of_the_breakage_check_still_finds_its_text_exactly_once_and_there_are_enough_of_them(self):
        import breakage_check as BC
        self.assertGreaterEqual(len(BC.MUTATIONS), 30)
        self.assertEqual(len({m[0] for m in BC.MUTATIONS}), len(BC.MUTATIONS), "each breakage has its own name")
        for name, runner, rel, old, new in BC.MUTATIONS:
            text = (ROOT / rel).read_text(encoding="utf-8")
            self.assertEqual(text.count(old), 1, f"{name}: the text to break is not in {rel} exactly once")
            self.assertNotEqual(old, new, name)

    def test_a_breakage_is_red_when_the_runner_fails_green_when_it_does_not_skipped_when_its_text_is_not_there_once_and_the_file_always_comes_back(self):
        import breakage_check as BC
        with tempfile.TemporaryDirectory() as d:
            path = pathlib.Path(d) / "m.py"
            path.write_text("A = 1\nB = 2\nB = 2\n", encoding="utf-8")
            before = path.read_bytes()
            green = [sys.executable, "-c", "pass"]
            red = [sys.executable, "-c", "raise SystemExit(1)"]
            self.assertEqual(BC.try_breakage(d, "m.py", "A = 1", "A = 9", green)[0], "STILL GREEN")
            self.assertEqual(BC.try_breakage(d, "m.py", "A = 1", "A = 9", red)[0], "RED")
            self.assertEqual(BC.try_breakage(d, "m.py", "B = 2", "B = 9", red)[0], "SKIPPED: the text to break was found 2 times")
            self.assertEqual(BC.try_breakage(d, "m.py", "C = 3", "C = 9", red)[0], "SKIPPED: the text to break was found 0 times")
            self.assertEqual(path.read_bytes(), before, "the file is back, byte for byte")
            with self.assertRaises(FileNotFoundError):
                BC.try_breakage(d, "m.py", "A = 1", "A = 9", ["no-such-program-for-the-breakage-check"])
            self.assertEqual(path.read_bytes(), before, "the file is back even when the runner could not start")

    def test_a_breakage_put_back_within_the_same_second_leaves_no_bytecode_of_the_breakage_behind(self):
        import breakage_check as BC
        with tempfile.TemporaryDirectory() as d, unittest.mock.patch.dict(os.environ):
            os.environ.pop("PYTHONDONTWRITEBYTECODE", None)  # whoever runs these tests (the breakage check does) must not decide what is tested
            module = pathlib.Path(d) / "m.py"
            (pathlib.Path(d) / "t.py").write_text("import m\nassert m.X == 1882, m.X\n", encoding="utf-8")
            runner = [sys.executable, "t.py"]
            for attempt in range(5):  # a breakage and its undoing fall in one second nearly every time: one attempt in five is enough to show it
                module.write_text("X = 1882\n", encoding="utf-8")
                long_ago = module.stat().st_mtime - 3600
                os.utime(module, (long_ago, long_ago))
                self.assertEqual(subprocess.run(runner, cwd=d, capture_output=True, text=True).returncode, 0, "the file as it is, with its bytecode as in a checkout")
                outcome, why = BC.try_breakage(d, "m.py", "1882", "1960", runner)  # the same size, so only the time tells the files apart
                self.assertEqual(outcome, "RED", why)
                after = subprocess.run(runner, cwd=d, capture_output=True, text=True)
                self.assertEqual(after.returncode, 0, f"attempt {attempt}: the file is back, but Python runs the breakage ({after.stderr.strip()[-60:]})")

    def test_dataclass_is_frozen(self):
        with self.assertRaises(dataclasses.FrozenInstanceError):
            R.RECIPES[0].id = "x"  # type: ignore[misc]


if __name__ == "__main__":
    unittest.main()
