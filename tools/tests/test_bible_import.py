"""Tests for tools/bible/import_webc.py. Run from the repository root:  python3 -m unittest discover -s tools/tests -v

No network: the zips are made here, small, in the shape of the real one (USFM files with Strong's numbers, notes, poetry, headings ...), and
the download is a file:// address. One class reads the real zip when WEBC_ZIP points at a copy of it (CI has none, so it is skipped there)."""
import contextlib
import hashlib
import io
import json
import os
import pathlib
import re
import sys
import tempfile
import unittest
import zipfile
from unittest import mock

TOOLS = pathlib.Path(__file__).resolve().parent.parent
ROOT = TOOLS.parent
sys.path.insert(0, str(TOOLS / "bible"))

import import_webc as imp  # noqa: E402

NBSP = "\xa0"
HEAD = r"""\id {code} Fixture
\ide UTF-8
\h {name}
\toc1 The Book of {name}
\toc2 {name}
\toc3 Fix
"""


def usfm(body, code="PSA", name="Psalms", before=""):
    """A book: the head every book has (six lines), what goes between the head and the first chapter, and the body."""
    return HEAD.format(code=code, name=name) + before + body


def read(body, code="PSA", name="Psalms", before=""):
    book = imp.Book(code)
    return book, book.read(usfm(body, code, name, before))


def verses(result, chapter=1):
    return result["chapters"][chapter - 1]["verses"]


def sha(data):
    return hashlib.sha256(data).hexdigest()


# ---------------------------------------------------------------------------------------------------------- the words of a line
class CleanText(unittest.TestCase):
    def clean(self, raw, notes=None):
        stats = imp.collections.Counter()
        return imp.clean_text(raw, "PSA line 7", stats, notes), stats

    def test_a_word_with_its_strongs_number_is_the_word(self):
        text, stats = self.clean(r'\w In|strong="H8064"\w* \w the|strong="H1254"\w* beginning, \w God|strong="G2316"\w*.')
        self.assertEqual(text, "In the beginning, God.")
        self.assertEqual(stats["strongsTags"], 3)

    def test_the_words_of_jesus_keep_every_word_and_the_nested_word_tags_go(self):
        text, stats = self.clean(r'\wj “\+w Follow|strong="G190"\+w* \+w me|strong="G3427"\+w*\wj*,” he said.')
        self.assertEqual(text, "“Follow me,” he said.")
        self.assertEqual(stats["strongsTags"], 2)
        self.assertEqual(stats["kept:wj"], 1)

    def test_the_marker_of_a_style_takes_one_space_with_it_and_the_closing_marker_none(self):
        self.assertEqual(self.clean(r"He said. \qs Selah.\qs*")[0], "He said. Selah.")
        self.assertEqual(self.clean(r"Lord—\qs Selah—\qs*")[0], "Lord—Selah—", "no space is made up")
        self.assertEqual(self.clean(r"\wj ? \wj*")[0], "?")
        self.assertEqual(self.clean(r'in \bk \+w The|strong="H1"\+w* \+w Book|strong="H2"\+w*\bk* of')[0], "in The Book of")
        text, stats = self.clean(r"a \nd Lord\nd* and \add words\add* b")
        self.assertEqual(text, "a Lord and words b")
        self.assertEqual((stats["kept:qs"], stats["kept:nd"], stats["kept:add"]), (0, 1, 1))

    def test_footnotes_and_cross_references_are_left_out_and_counted(self):
        text, stats = self.clean(r"Behold,\f + \fr 1:15 \ft “Behold” means \+wh הִנֵּה\+wh* look at.\f* your sister.")
        self.assertEqual(text, "Behold, your sister.")
        text, stats2 = self.clean(r"a \x + \xo 1:1 \xt Gen 1:1\x* b\f + \fr 1:1 \ft n \fqa m \fl l \fq q \+bk B\+bk*.\f*")
        self.assertEqual(text, "a b")
        self.assertEqual((stats["footnotes"], stats["crossReferences"]), (1, 0))
        self.assertEqual((stats2["footnotes"], stats2["crossReferences"]), (1, 1))

    def test_hebrew_in_a_note_is_not_checked_because_the_note_is_left_out(self):
        self.assertEqual(self.clean(r"x\f + \fr 1:1 \ft \+wh אֱלֹהִ֑ים\+wh* (Elohim)\f*")[0], "x")

    def test_the_words_of_a_note_can_be_asked_for(self):
        notes = []
        text, _ = self.clean(r"\f + \fr 1:5 \ft Verse 5 is omitted: \fqa The words.\f*", notes)
        self.assertEqual((text, notes), ("", ["Verse 5 is omitted: The words."]))
        notes = []
        self.clean(r"a\f + \fr 2:3 \ft one\f* b\f + \fr 2:3 \ft two \+bk Tobit\+bk*\f*", notes)
        self.assertEqual(notes, ["one", "two Tobit"])
        notes = []
        self.clean(r"a \x + \xo 1:1 \xt Gen 1:1\x* b", notes)
        self.assertEqual(notes, [], "a cross reference is not a note of the verse")
        self.assertEqual(imp.note_words(" + \\fr 1:5 \\ft A  \\fqa  b \\+wh x\\+wh*"), "A b x")

    def test_spaces_become_one_the_ends_are_trimmed_and_a_no_break_space_stays(self):
        self.assertEqual(self.clean("  a   b  ")[0], "a b")
        self.assertEqual(self.clean("a" + NBSP + " b")[0], "a" + NBSP + " b")
        self.assertEqual(self.clean(NBSP + "a" + NBSP)[0], NBSP + "a" + NBSP, "only ASCII spaces are trimmed: the no-break space is a character of the edition")
        self.assertEqual(self.clean("‘It’s” — “a–b”")[0], "‘It’s” — “a–b”")
        self.assertEqual(self.clean("")[0], "")
        self.assertEqual(self.clean("   ")[0], "")

    def refuses(self, raw, pattern):
        with self.assertRaisesRegex(imp.ImportProblem, r"^PSA line 7: .*" + pattern):
            self.clean(raw)

    def test_what_it_does_not_know_it_refuses_with_the_place(self):
        self.refuses(r"a \sc small\sc* b", r"marker \\sc is not one this importer knows")
        self.refuses(r"a \+wj x\+wj* b", r"marker \\\+wj is not one this importer knows")
        self.refuses(r"a \wj x\wj*\k b", r"marker \\k is not one this importer knows")
        self.refuses(r"a \ b", r"a backslash that starts no marker")
        self.refuses("a \\", r"a backslash that starts no marker")
        self.refuses(r"a \f + \fr 1:1 \ft never closed", r"\\f is never closed")
        self.refuses(r"a \x + \xo 1:1 \xt never closed", r"\\x is never closed")
        self.refuses(r"a \f - \fr 1:1 \ft x\f* b", r"does not start the way all of them do")
        self.refuses(r"a \f + \ft x\f* b", r"does not start the way all of them do")
        self.refuses(r"a \x + \xt x\x* b", r"does not start the way all of them do")
        self.refuses(r"a \f + \fr 1:1 \ft x \zz y\f* b", r"marker \\zz inside a \\f note")
        self.refuses(r"a \x + \xo 1:1 \ft x\x* b", r"marker \\ft inside a \\x note")
        self.refuses(r"a \f + \fr 1:1 \ft x \ y\f* b", r"backslash inside a \\f note")
        self.refuses(r"a \f + \fr 1:1 \ft x \f + \fr 1:1 \ft y\f* z\f*", r"marker \\f inside a \\f note")

    def test_a_word_tag_that_is_not_the_one_shape_of_this_edition_is_refused(self):
        self.refuses(r"\w word\w*", r"a word tag that is not")
        self.refuses(r'\w word|lemma="x"\w*', r"a word tag that is not")
        self.refuses(r'\w word|strong="X12"\w*', r"a word tag that is not")
        self.refuses(r'\w |strong="H1"\w*', r"a word tag that is not")
        self.refuses(r'\w word|strong="H1"\+w*', r"a word tag that is not")
        self.refuses(r'\w word|strong="H1"', r"a word tag that is not")
        self.refuses(r'\wword|strong="H1"\w*', r"marker \\wword is not one this importer knows")
        self.refuses(r'\+w word|strong="H1"\+w*', r"not placed the way every word is")
        self.refuses(r'\wj \w word|strong="H1"\w*\wj*', r"not placed the way every word is")
        self.refuses(r"\w", r"not placed the way every word is")

    def test_styles_must_be_opened_and_closed_on_their_line(self):
        self.refuses(r"\wj words", r"\\wj is never closed on its line")
        self.refuses(r"words\wj*", r"\\wj\* closes nothing that is open")
        self.refuses(r"\wj a\qs b\wj*\qs*", r"\\wj\* closes nothing that is open")
        self.refuses("\\qs", r"\\qs is not followed by a space")
        self.refuses(r"\wj a\wj* b\qs*", r"\\qs\* closes nothing")

    def test_a_character_nobody_has_looked_at_and_markup_left_in_the_words_are_refused(self):
        self.refuses("a " + chr(0x2026) + " b", r"unexpected character U\+2026")
        self.refuses("a " + chr(0x00e9) + " b", r"unexpected character U\+00E9")
        self.refuses("a" + chr(0x200B) + "b", r"unexpected character U\+200B")
        self.refuses("a | b", r"\| left in the words")
        self.refuses('say "hi"', r'" left in the words')
        self.refuses("a" + chr(7), r"unexpected character U\+0007")


# ------------------------------------------------------------------------------------------------ paragraphs, lines, blank lines
class Layout(unittest.TestCase):
    def test_a_paragraph_of_prose_is_p_on_the_verse_that_starts_it(self):
        _, r = read(r"""\c 1
\p
\v 1 In the beginning.
\v 2 Second verse.
\p
\v 3 Third verse.
\m
\v 4 Margin.
\mi
\v 5 Indented.
\pi1
\v 6 Indented once.
\nb
\v 7 No break.
""")
        self.assertEqual(verses(r), [
            {"n": "1", "p": True, "t": "In the beginning."},
            {"n": "2", "t": "Second verse."},
            {"n": "3", "p": True, "t": "Third verse."},
            {"n": "4", "p": True, "t": "Margin."},
            {"n": "5", "p": True, "t": "Indented."},
            {"n": "6", "p": True, "t": "Indented once."},
            {"n": "7", "t": "No break."},
        ])

    def test_a_line_of_poetry_has_tabs_in_front_one_two_three_and_a_list_item_one(self):
        _, r = read(r"""\c 1
\q1
\v 1 One.
\q2 Two.
\q3 Three.
\li1 Item.
\q1
\v 2 Next.
\q2
\v 3 Deep.
\q3
\v 4 Deeper.
\li1
\v 5 Listed.
\li1 Another.
""")
        self.assertEqual([v["t"] for v in verses(r)], [
            "\tOne.\n\t\tTwo.\n\t\t\tThree.\n\tItem.", "\tNext.", "\t\tDeep.", "\t\t\tDeeper.", "\tListed.\n\tAnother.",
        ])
        self.assertTrue(all("p" not in v and "b" not in v for v in verses(r)))

    def test_a_verse_that_starts_inside_a_line_of_poetry_goes_on_in_that_line(self):
        _, r = read(r"""\c 1
\q1
\v 1 First half
\q2 second line
\v 2 continues here,
\q2 and more.
\q1
\v 3 A new line.
""")
        self.assertEqual(verses(r), [
            {"n": "1", "t": "\tFirst half\n\t\tsecond line"},
            {"n": "2", "t": "continues here,\n\t\tand more."},
            {"n": "3", "t": "\tA new line."},
        ])

    def test_a_paragraph_that_starts_inside_a_verse_is_a_new_line_without_tabs(self):
        _, r = read(r"""\c 1
\p
\v 1 First paragraph.
\p Second paragraph of the verse.
\m Third, flush left.
\pi1 Fourth.
\v 2 Next.
""")
        self.assertEqual(verses(r), [
            {"n": "1", "p": True, "t": "First paragraph.\nSecond paragraph of the verse.\nThird, flush left.\nFourth."},
            {"n": "2", "t": "Next."},
        ])

    def test_a_blank_line_is_b_on_the_verse_after_it_an_empty_line_inside_a_verse_and_nothing_at_the_ends_of_a_chapter(self):
        book, r = read(r"""\c 1
\b
\q1
\v 1 Top of the chapter.
\b
\q1
\v 2 After a blank line.
\q2 A line.
\b
\q2 After a blank inside the verse.
\v 3 Goes on.
\b
\c 2
\q1
\v 1 Second chapter.
\b
""")
        self.assertEqual(verses(r), [
            {"n": "1", "t": "\tTop of the chapter."},
            {"b": True, "n": "2", "t": "\tAfter a blank line.\n\t\tA line.\n\n\t\tAfter a blank inside the verse."},
            {"n": "3", "t": "Goes on."},
        ])
        self.assertEqual(verses(r, 2), [{"n": "1", "t": "\tSecond chapter."}])
        self.assertEqual((book.stats["blankLinesAtChapterStart"], book.stats["blankLinesAtChapterEnd"]), (1, 2))

    def test_a_blank_line_and_a_paragraph_marker_together_give_both_flags(self):
        _, r = read("\\c 1\n\\p\n\\v 1 One.\n\\b\n\\p\n\\v 2 Two.\n\\p\n\\b\n\\v 3 Three.\n")
        self.assertEqual(verses(r)[1], {"b": True, "n": "2", "p": True, "t": "Two."})
        self.assertEqual(verses(r)[2], {"b": True, "n": "3", "p": True, "t": "Three."})

    def test_a_rule_of_dashes_in_a_centred_line_is_left_out_and_counted(self):
        book, r = read("\\c 1\n\\p\n\\v 1 One.\n\\b\n\\pc ———————\n\\b\n\\p\n\\v 2 Two.\n")
        self.assertEqual(verses(r)[1], {"b": True, "n": "2", "p": True, "t": "Two."})
        self.assertEqual(book.stats["separatorLines"], 1)
        with self.assertRaisesRegex(imp.ImportProblem, r"PSA line 10: a centred line \(\\pc\) that is not a rule of dashes: 'Real words'"):
            read("\\c 1\n\\p\n\\v 1 One.\n\\pc Real words\n")

    def test_lines_of_references_are_left_out_and_counted(self):
        book, r = read("\\c 1\n\\mr (Psalms 1-41)\n\\r (Genesis 1)\n\\q1\n\\v 1 One.\n")
        self.assertEqual(verses(r), [{"n": "1", "t": "\tOne."}])
        self.assertEqual(book.stats["references"], 2)

    def test_the_no_break_space_and_the_curly_quotes_stay_in_a_verse(self):
        _, r = read("\\c 1\n\\p\n\\v 1 ‘Take up your mat.’" + NBSP + "”   \n")
        self.assertEqual(verses(r)[0]["t"], "‘Take up your mat.’" + NBSP + "”")


# ------------------------------------------------------------------------------------------------------ titles and headings
class Headings(unittest.TestCase):
    def test_d_over_the_first_verse_is_the_title_ms1_s1_and_sp_are_headings_of_the_verse_they_stand_before(self):
        _, r = read(r"""\c 1
\ms1 BOOK 1
\d A Psalm by \w David|strong="H1732"\w*.
\q1
\v 1 One.
\s1 A section
\p
\v 2 Two.
\sp Beloved
\q1
\v 3 Three.
""")
        self.assertEqual(r["chapters"][0]["title"], "A Psalm by David.")
        self.assertEqual(verses(r), [
            {"h": "BOOK 1", "n": "1", "t": "\tOne."},
            {"h": "A section", "n": "2", "p": True, "t": "Two."},
            {"h": "Beloved", "n": "3", "t": "\tThree."},
        ])

    def test_several_d_in_a_chapter_are_all_headings_and_the_chapter_has_no_title(self):
        _, r = read(r"""\c 1
\d ALEPH
\q1
\v 1 One.
\d BETH
\q1
\v 2 Two.
""")
        self.assertNotIn("title", r["chapters"][0])
        self.assertEqual([(v["n"], v["h"]) for v in verses(r)], [("1", "ALEPH"), ("2", "BETH")])

    def test_a_d_after_the_first_verse_is_a_heading_even_when_it_is_the_only_one(self):
        _, r = read("\\c 1\n\\q1\n\\v 1 One.\n\\d Only one.\n\\q1\n\\v 2 Two.\n")
        self.assertNotIn("title", r["chapters"][0])
        self.assertEqual(verses(r)[1]["h"], "Only one.")

    def test_a_note_in_a_heading_is_left_out(self):
        _, r = read("\\c 1\n\\s1 THE SONG\\f + \\fr 3:24 \\ft A note.\\f*\n\\p\n\\v 1 One.\n")
        self.assertEqual(verses(r)[0]["h"], "THE SONG")

    def test_a_paragraph_of_words_over_the_first_verse_is_the_title_of_the_chapter(self):
        _, r = read("\\c 1\n\\p A Prayer of Jesus the son of Sirach.\n\\q1\n\\v 1 I give thanks.\n")
        self.assertEqual(r["chapters"][0]["title"], "A Prayer of Jesus the son of Sirach.")
        self.assertEqual(verses(r), [{"n": "1", "t": "\tI give thanks."}])

    def test_only_one_line_over_a_chapter_and_only_a_paragraph_of_prose(self):
        with self.assertRaisesRegex(imp.ImportProblem, r"PSA line 9: a second line over chapter 1: the format has room for one title"):
            read("\\c 1\n\\d A title.\n\\p And another.\n\\v 1 One.\n")
        with self.assertRaisesRegex(imp.ImportProblem, r"PSA line 8: words outside a verse after \\q1"):
            read("\\c 1\n\\q1 Poetry over a verse.\n\\v 1 One.\n")

    def test_a_heading_in_the_middle_of_a_verse_belongs_to_the_next_verse_and_the_last_one_wins(self):
        book, r = read(r"""\c 1
\sp Beloved
\q1
\v 1 Take me away.
\q2 Hurry.
\sp Friends
\q1 We will be glad.
\sp Beloved
\q1 They are right.
\q1
\v 2 I am dark.
\sp Friends
\q1 Eat.
\sp Beloved
\q1
\v 3 I was asleep.
\c 2
\q1
\v 1 First of two.
\sp Lover
\q1 More of it.
\c 3
\q1
\v 1 Carried over a chapter.
""")
        self.assertEqual(verses(r), [
            {"h": "Beloved", "n": "1", "t": "\tTake me away.\n\t\tHurry.\n\tWe will be glad.\n\tThey are right."},
            {"h": "Beloved", "n": "2", "t": "\tI am dark.\n\tEat."},
            {"h": "Beloved", "n": "3", "t": "\tI was asleep."},
        ])
        self.assertEqual(verses(r, 2), [{"n": "1", "t": "\tFirst of two.\n\tMore of it."}])
        self.assertEqual(verses(r, 3), [{"h": "Lover", "n": "1", "t": "\tCarried over a chapter."}])
        self.assertEqual(book.moved, [
            {"before": "PSA 1:2", "line": 14, "text": "Beloved"},
            {"before": "PSA 3:1", "line": 26, "text": "Lover"},
        ])
        self.assertEqual(book.dropped, [
            {"before": "PSA 1:2", "line": 12, "text": "Friends"},
            {"before": "PSA 1:3", "line": 18, "text": "Friends"},
        ])

    def test_two_headings_before_one_verse_are_refused_unless_one_stands_inside_a_verse(self):
        with self.assertRaisesRegex(imp.ImportProblem, r"PSA line 8: two headings before verse 1: the format has room for one"):
            read("\\c 1\n\\s1 A\n\\s1 B\n\\p\n\\v 1 One.\n")

    def test_a_heading_with_no_verse_after_it_is_refused(self):
        with self.assertRaisesRegex(imp.ImportProblem, r"PSA: a heading \(line 10\) with no verse after it"):
            read("\\c 1\n\\p\n\\v 1 One.\n\\s1 Late\n")
        with self.assertRaisesRegex(imp.ImportProblem, r"PSA line 11: a heading right before a chapter"):
            read("\\c 1\n\\p\n\\v 1 One.\n\\s1 Late\n\\c 2\n\\p\n\\v 1 Two.\n")
        with self.assertRaisesRegex(imp.ImportProblem, r"PSA line 8: a \\s1 with no words"):
            read("\\c 1\n\\s1\n\\p\n\\v 1 One.\n")


# ----------------------------------------------------------------------------------------------------------------- verses
class Verses(unittest.TestCase):
    def test_a_joined_label_is_kept_as_it_is_printed(self):
        _, r = read("\\c 1\n\\p\n\\v 1 One.\n\\v 2-3 Two and three.\n\\v 4 Four.\n\\v 15-16 Far on.\n")
        self.assertEqual([v["n"] for v in verses(r)], ["1", "2-3", "4", "15-16"])

    def test_labels_must_grow_inside_a_chapter(self):
        for body, pattern in [
            ("\\v 1 a\n\\v 1 b\n", r"PSA line 10: verse 1 after verse 1: the verses are not in order"),
            ("\\v 2 a\n\\v 1 b\n", r"PSA line 10: verse 1 after verse 2: the verses are not in order"),
            ("\\v 3-2 a\n", r"PSA line 9: verse 3-2 after verse 0: the verses are not in order"),
            ("\\v 2-2 a\n", r"PSA line 9: verse 2-2 after verse 0: the verses are not in order"),
            ("\\v 1-3 a\n\\v 3 b\n", r"PSA line 10: verse 3 after verse 3: the verses are not in order"),
            ("\\v one a\n", r"PSA line 9: a verse label that is not a number"),
            ("\\v 1a text\n", r"PSA line 9: a verse label that is not a number"),
            ("\\v\n", r"PSA line 9: a verse label that is not a number"),
        ]:
            with self.subTest(body=body), self.assertRaisesRegex(imp.ImportProblem, pattern):
                read("\\c 1\n\\p\n" + body)

    def test_a_verse_may_start_again_at_one_in_the_next_chapter(self):
        _, r = read("\\c 1\n\\p\n\\v 1 a\n\\v 2 b\n\\c 2\n\\p\n\\v 1 c\n")
        self.assertEqual([len(c["verses"]) for c in r["chapters"]], [2, 1])

    def test_chapters_must_be_one_two_three_with_verses_in_them(self):
        for body, pattern in [
            ("\\c 2\n\\p\n\\v 1 a\n", r"PSA line 7: chapter '2' where 1 was expected"),
            ("\\c 1\n\\p\n\\v 1 a\n\\c 3\n\\p\n\\v 1 b\n", r"PSA line 10: chapter '3' where 2 was expected"),
            ("\\c 1\n\\p\n\\v 1 a\n\\c 1\n\\p\n\\v 1 b\n", r"PSA line 10: chapter '1' where 2 was expected"),
            ("\\c x\n\\p\n\\v 1 a\n", r"PSA line 7: chapter 'x' where 1 was expected"),
            ("\\c 1\n\\c 2\n\\p\n\\v 1 a\n", r"PSA 1: a chapter with no verses"),
            ("", r"PSA: no chapters"),
        ]:
            with self.subTest(body=body), self.assertRaisesRegex(imp.ImportProblem, pattern):
                read(body)

    def test_a_verse_with_only_a_note_is_kept_with_no_words_and_the_note_goes_to_the_list(self):
        book, r = read(r"""\c 1
\q1
\v 1 One.
\q1
\v 2 \f + \fr 1:2 \ft Verse 2 is omitted by the best authorities: \fqa The omitted words.\f*
\q1
\v 3 Three.
\p
\v 4-5 \f + \fr 1:4-5 \ft Verses 4 and 5 are omitted.\f*
""")
        self.assertEqual(verses(r)[1], {"n": "2", "t": ""})
        self.assertEqual(verses(r)[3], {"n": "4-5", "p": True, "t": ""})
        self.assertEqual(book.empty, [
            {"note": "Verse 2 is omitted by the best authorities: The omitted words.", "verse": "PSA 1:2"},
            {"note": "Verses 4 and 5 are omitted.", "verse": "PSA 1:4-5"},
        ])

    def test_a_verse_with_no_words_and_no_note_is_refused(self):
        with self.assertRaisesRegex(imp.ImportProblem, r"PSA line 9: verse 1 has no words and no note"):
            read("\\c 1\n\\p\n\\v 1\n\\v 2 Two.\n")

    def test_a_verse_that_opens_with_a_note_goes_on_with_the_words_of_its_next_line(self):
        book, r = read("\\c 1\n\\q1\n\\v 1 \\f + \\fr 1:1 \\ft A note.\\f*\n\\q2 The real words.\n")
        self.assertEqual(verses(r), [{"n": "1", "t": "\t\tThe real words."}])
        self.assertEqual(book.empty, [])

    def test_a_note_at_the_start_of_a_verse_leaves_the_words_after_it(self):
        _, r = read("\\c 1\n\\p\n\\v 1 \\f + \\fr 1:1 \\ft Note.\\f*And it came to pass\\f + \\fr 1:1 \\fl Greek \\ft words.\\f* in the days.\n")
        self.assertEqual(verses(r)[0]["t"], "And it came to pass in the days.")


# ------------------------------------------------------------------------------------------------------ the head of a book
class Head(unittest.TestCase):
    def test_what_the_head_has_is_read_and_checked_and_toc2_is_the_name(self):
        book, r = read("\\c 1\n\\p\n\\v 1 One.\n", name="Song of Solomon", before="\\mt2 The Book of\n\\mt1 Songs\n\\mt3 x\n\\cl Psalm\n\\ip An introduction of four words.\n\\is1 A heading\n\\ip More words here.\n")
        self.assertEqual(r["name"], "Song of Solomon")
        self.assertEqual(r["code"], "PSA")
        self.assertEqual(set(r), {"code", "name", "chapters"})
        s = book.stats
        self.assertEqual((s["bookTitles"], s["chapterLabels"], s["introductionLines"], book.introduction_words, s["bookHeaders"]), (3, 1, 3, 10, 4))
        self.assertEqual(r["chapters"][0], {"c": 1, "verses": [{"n": "1", "p": True, "t": "One."}]})

    def refuses(self, text, pattern, code="PSA"):
        with self.assertRaisesRegex(imp.ImportProblem, pattern):
            imp.Book(code).read(text)

    def test_a_head_that_is_not_right_is_refused(self):
        body = "\\c 1\n\\p\n\\v 1 One.\n"
        self.refuses("\\h Psalms\n" + body, r"^PSA: the file does not start with \\id")
        self.refuses("", r"^PSA: the file does not start with \\id")
        self.refuses(usfm(body, code="GEN"), r"PSA line 1: \\id says 'GEN', but the file is for PSA")
        self.refuses(usfm(body).replace("\\ide UTF-8", "\\ide ISO-8859-1"), r"PSA line 2: \\ide says 'ISO-8859-1', not UTF-8")
        self.refuses(usfm(body).replace("\\toc3 Fix\n", ""), r"PSA line 6: the first chapter starts before the head of the book is complete \(missing \\toc3\)")
        self.refuses(usfm(body).replace("\\h Psalms\n", "\\h Psalms\n\\h Again\n"), r"PSA line 4: \\h twice")
        self.refuses(usfm(body).replace("\\ide UTF-8", "\\id PSA Again\n\\ide UTF-8"), r"PSA line 2: \\id twice")
        self.refuses(usfm(body) + "\\id PSA\n", r"PSA line 10: the marker \\id is not one this importer knows in the middle of a book")
        self.refuses(usfm(body).replace("\\toc2 Psalms", "\\toc2"), r"^PSA: \\toc2 is empty, so the book has no name$")
        self.refuses(usfm(body, before="\\v 1 Early\n"), r"PSA line 7: the marker \\v before the first chapter is not one this importer knows")
        self.refuses(usfm(body, before="\\zz what\n"), r"PSA line 7: the marker \\zz before the first chapter is not one this importer knows")
        self.refuses(usfm(body, before="Plain text.\n"), r"PSA line 7: a line that does not start with a marker and a space: 'Plain text\.'")

    def test_the_id_line_may_say_anything_after_the_code(self):
        for rest in ("DEU 1World English Bible (WEB)", "ISA 23-ISA-web.sfm World English Bible (WEB)", "TOB - Tobit", "ESG", "1MA"):
            code = rest.split(" ")[0]
            text = usfm("\\c 1\n\\p\n\\v 1 One.\n", code=code).replace(f"\\id {code} Fixture", f"\\id {rest}")
            self.assertEqual(imp.Book(code).read(text)["code"], code)

    def test_markers_of_the_head_are_refused_inside_the_book(self):
        for marker in ("mt1", "ip", "is1", "cl", "h", "toc2", "ide"):
            with self.subTest(marker=marker), self.assertRaisesRegex(imp.ImportProblem, rf"PSA line 10: the marker \\{marker} is not one this importer knows in the middle of a book"):
                read(f"\\c 1\n\\p\n\\v 1 One.\n\\{marker} text\n")

    def test_an_unknown_marker_in_a_book_stops_everything_and_names_the_book_and_the_line(self):
        with self.assertRaisesRegex(imp.ImportProblem, r"^PSA line 10: the marker \\qr is not one this importer knows in the middle of a book$"):
            read("\\c 1\n\\p\n\\v 1 One.\n\\qr Right-aligned\n")
        with self.assertRaisesRegex(imp.ImportProblem, r"^GEN line 9: the marker \\sc is not one this importer knows\. Decide"):
            read("\\c 1\n\\p\n\\v 1 One \\sc small\\sc*.\n", code="GEN", name="Genesis")

    def test_the_file_itself_must_be_plain(self):
        with self.assertRaisesRegex(imp.ImportProblem, r"PSA: a carriage return in the file"):
            imp.Book("PSA").read(usfm("\\c 1\n\\p\n\\v 1 One.\n").replace("\n", "\r\n"))
        with self.assertRaisesRegex(imp.ImportProblem, r"PSA: a tab in the file"):
            read("\\c 1\n\\p\n\\v 1 One.\tTwo.\n")

    def test_markers_that_stand_wrong_are_refused(self):
        for body, pattern in [
            ("\\c 1\n\\p\n\\p\n\\v 1 One.\n", r"PSA line 9: two paragraph or line markers in a row \(\\p on line 8, then \\p\)"),
            ("\\c 1\n\\p\n\\q1\n\\v 1 One.\n", r"PSA line 9: two paragraph or line markers in a row \(\\p on line 8, then \\q1\)"),
            ("\\c 1\n\\p\n\\v 1 One.\n\\q1\n\\c 2\n\\p\n\\v 1 Two.\n", r"PSA line 11: the \\q1 on line 10 has no verse after it"),
            ("\\c 1\n\\p\n\\v 1 One.\n\\q1\n", r"PSA: the \\q1 on line 10 has no verse after it"),
            ("\\c 1\n\\q1\n\\p Words after a bare marker.\n\\v 1 One.\n", r"PSA line 9: \\p with words after a bare \\q1 \(line 8\)"),
            ("\\c 1\n\\p\n\\v 1 One.\n\\nb Words after nb.\n", r"PSA line 10: \\nb with words after it"),
            ("\\c 1\n\\b More\n\\p\n\\v 1 One.\n", r"PSA line 8: a \\b with words after it"),
            ("\\c 1\n\\p Text before any verse and then a second.\n\\q1 More.\n\\v 1 One.\n", r"PSA line 9: words outside a verse after \\q1"),
        ]:
            with self.subTest(body=body), self.assertRaisesRegex(imp.ImportProblem, pattern):
                read(body)

    def test_the_one_book_that_has_no_chapter_label_before_the_first_chapter_is_fine(self):
        _, r = read("\\c 1\n\\p\n\\v 1 One.\n")
        self.assertEqual(len(r["chapters"]), 1)


# --------------------------------------------------------------------------------------------------------------- the files
PSALMS = r"""\c 1
\ms1 BOOK 1
\q1
\v 1 Blessed \w is|strong="H1870"\w* the man\f + \fr 1:1 \ft A note.\f*,
\q2 nor stand\x + \xo 1:1 \xt Gen 1:1\x*,
\q3 nor sit.
\b
\q1
\v 2 But his delight.
\q2 On his law
\v 3 he meditates. \qs Selah\qs*
\c 2
\d A Psalm by \w David|strong="H1732"\w*.
\q1
\v 1 Why do the nations rage?
\v 2-3 Joined.
"""
SONG = r"""\c 1
\p
\v 1 The Song of songs.
\sp Beloved
\q1
\v 2 Let him kiss me.
\sp Friends
\q1 We will be glad.
\q1
\v 3 Next.
"""
MATTHEW = r"""\c 1
\p
\v 1 The book.
\v 2 He said, \wj “\+w Follow|strong="G190"\+w* me\wj*”.
\p
\v 3 Sure.{NBSP}”
\v 4 \f + \fr 1:4 \ft Some manuscripts add: Four.\f*
"""
PREFACE = r"""\id FRT Preface to the Fixture
\h Preface
\mt1 Preface
\ip A preface line.\f + \fr 1:0 \ft A note.\f*
\ip Another line.
"""
LICENCE = b"<html>Public domain</html>"
BOOKS = {"PSA": ("Psalms", PSALMS, "\\mt1 The Psalms\n\\cl Psalm\n"), "SNG": ("Song of Solomon", SONG, ""), "MAT": ("Matthew", MATTHEW, "")}
NUMBERS = {"PSA": "20", "SNG": "23", "MAT": "70"}


def fixture_members(**changes):
    members = {"00-FRTeng-web-c.usfm": PREFACE.encode(), "copr.htm": LICENCE}
    for code, (name, body, before) in BOOKS.items():
        members[f"{NUMBERS[code]}-{code}eng-web-c.usfm"] = usfm(body.replace("{NBSP}", NBSP), code, name, before).encode()
    for key, value in changes.items():
        file = next(k for k in members if key in k)
        if value is None:
            del members[file]
        else:
            members[file] = value
    return members


def write_zip(path, members):
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, data in members.items():
            zf.writestr(name, data)
    return sha(pathlib.Path(path).read_bytes())


def small(sha256, totals=(3, 4, 12), date="2026-01-02", url="https://example.invalid/fixture.zip"):
    return imp.Source(url=url, sha256=sha256, date=date, order=("PSA", "SNG", "MAT"), totals=totals)


class Whole(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = pathlib.Path(self.tmp.name)
        self.zip = self.dir / "fixture.zip"
        self.sha = write_zip(self.zip, fixture_members())
        self.source = small(self.sha)
        self.out = self.dir / "webc"
        self.ts = self.dir / "webc.generated.ts"

    def built(self, members=None, source=None):
        members = members if members is not None else imp.read_zip(self.zip, self.sha)[0]
        return imp.build(members, self.sha, self.zip.stat().st_size, source or self.source)

    def run_main(self, *args, source=None):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = imp.main([*args], source or self.source)
        return code, out.getvalue(), err.getvalue()

    def paths(self):
        return ["--zip", str(self.zip), "--out", str(self.out), "--ts", str(self.ts)]

    def test_it_writes_a_file_for_every_book_the_index_the_manifest_and_the_typescript_map(self):
        b = self.built()
        self.assertEqual(sorted(b.files), ["MAT.json", "PSA.json", "SNG.json", "index.json", "manifest.json"])
        self.assertEqual(b.summary, "3 books, 4 chapters, 12 verses, " + f"{sum(len(b.files[f'{c}.json']) for c in BOOKS):,} bytes of JSON")
        psalms = json.loads(b.files["PSA.json"])
        self.assertEqual(psalms["code"], "PSA")
        self.assertEqual(psalms["name"], "Psalms")
        self.assertEqual(psalms["chapters"][0]["verses"][0], {"h": "BOOK 1", "n": "1", "t": "\tBlessed is the man,\n\t\tnor stand,\n\t\t\tnor sit."})
        self.assertEqual(psalms["chapters"][0]["verses"][1], {"b": True, "n": "2", "t": "\tBut his delight.\n\t\tOn his law"})
        self.assertEqual(psalms["chapters"][0]["verses"][2], {"n": "3", "t": "he meditates. Selah"})
        self.assertEqual(psalms["chapters"][1], {"c": 2, "title": "A Psalm by David.", "verses": [{"n": "1", "t": "\tWhy do the nations rage?"}, {"n": "2-3", "t": "Joined."}]})
        song = json.loads(b.files["SNG.json"])
        self.assertEqual(song["chapters"][0]["verses"][2], {"h": "Friends", "n": "3", "t": "\tNext."})
        self.assertEqual(json.loads(b.files["SNG.json"])["chapters"][0]["verses"][1]["t"], "\tLet him kiss me.\n\tWe will be glad.")
        matthew = json.loads(b.files["MAT.json"])
        self.assertEqual([v["t"] for v in matthew["chapters"][0]["verses"]], ["The book.", "He said, “Follow me”.", "Sure." + NBSP + "”", ""])
        index = json.loads(b.files["index.json"])
        self.assertEqual(index["translation"], imp.TRANSLATION)
        self.assertEqual(index["books"], [
            {"chapters": 2, "code": "PSA", "name": "Psalms", "verses": 5},
            {"chapters": 1, "code": "SNG", "name": "Song of Solomon", "verses": 3},
            {"chapters": 1, "code": "MAT", "name": "Matthew", "verses": 4},
        ])

    def test_the_text_of_a_book_is_compact_sorted_and_utf_8_with_the_no_break_space_written_out(self):
        b = self.built()
        raw = b.files["MAT.json"]
        self.assertTrue(raw.endswith(b"}\n"))
        self.assertEqual(raw.count(b"\n"), 1)
        self.assertIn(b"\\u00a0", raw)
        self.assertNotIn(NBSP.encode(), raw)
        self.assertIn("“Follow me”".encode(), raw, "the curly quotes are UTF-8, not escapes")
        for name, data in b.files.items():
            if name != "manifest.json":
                expected = json.dumps(json.loads(data), ensure_ascii=False, sort_keys=True, separators=(",", ":")).replace(NBSP, "\\u00a0") + "\n"
                self.assertEqual(data, expected.encode("utf-8"), name)
        self.assertEqual(imp.dumps({"b": 1, "a": NBSP}), b'{"a":"\\u00a0","b":1}\n')
        self.assertEqual(imp.dumps({"a": ["x", {"d": 1, "c": 2}]}), b'{"a":["x",{"c":2,"d":1}]}\n')
        self.assertEqual(imp.dumps_readable({"b": [1], "a": NBSP}), b'{\n "a": "\\u00a0",\n "b": [\n  1\n ]\n}\n')
        self.assertTrue(raw.startswith(b'{"chapters":[{"c":1,"verses":[{"n":"1","p":true,"t":"The book."}'), "keys are sorted: chapters, code, name; c, verses; n, p, t")

    def test_the_manifest_says_where_it_came_from_hashes_every_file_and_counts_what_was_left_out(self):
        b = self.built()
        m = json.loads(b.files["manifest.json"])
        self.assertEqual(m["format"], 1)
        self.assertEqual(m["generator"], "tools/bible/import_webc.py")
        self.assertEqual(m["translation"], imp.TRANSLATION)
        self.assertEqual(m["source"], {
            "bytes": self.zip.stat().st_size, "date": "2026-01-02", "licencePage": {"file": "copr.htm", "sha256": sha(LICENCE)},
            "sha256": self.sha, "url": "https://example.invalid/fixture.zip",
        })
        self.assertEqual(m["totals"], {"books": 3, "bytes": sum(len(b.files[f"{c}.json"]) for c in BOOKS), "chapters": 4, "verses": 12})
        self.assertEqual([e["code"] for e in m["books"]], ["PSA", "SNG", "MAT"])
        for e in m["books"]:
            data = b.files[e["file"]]
            self.assertEqual((e["bytes"], e["sha256"]), (len(data), sha(data)))
            self.assertEqual(e["sourceSha256"], sha(fixture_members()[e["sourceFile"]]))
            self.assertEqual(e["sourceFile"], f"{NUMBERS[e['code']]}-{e['code']}eng-web-c.usfm")
        self.assertEqual([(e["code"], e["chapters"], e["verses"]) for e in m["books"]], [("PSA", 2, 5), ("SNG", 1, 3), ("MAT", 1, 4)])
        self.assertEqual(m["files"], {"index.json": {"bytes": len(b.files["index.json"]), "sha256": sha(b.files["index.json"])}})
        d = m["dropped"]
        self.assertEqual((d["footnotes"], d["crossReferences"], d["strongsTags"]), (2, 1, 3))
        self.assertEqual(d["frontMatter"], {"bytes": len(PREFACE.encode()), "file": "00-FRTeng-web-c.usfm", "lines": 5})
        self.assertEqual((d["bookTitles"], d["chapterLabels"], d["bookHeaders"]), (1, 1, 12))
        self.assertEqual(d["introductions"], {"byBook": {}, "lines": 0, "words": 0})
        self.assertEqual((d["blankLinesAtChapterStart"], d["blankLinesAtChapterEnd"], d["separatorLines"], d["references"]), (0, 0, 0, 0))
        mid = d["headingsInTheMiddleOfAVerse"]
        self.assertEqual(mid["dropped"], [])
        self.assertEqual([(e["text"], e["before"]) for e in mid["movedToTheNextVerse"]], [("Friends", "SNG 1:3")])
        self.assertEqual(m["kept"], {"bookNames": 0, "selah": 1, "wordsOfJesus": 1})
        self.assertEqual(m["emptyVerses"], [{"note": "Some manuscripts add: Four.", "verse": "MAT 1:4"}])
        self.assertTrue(b.files["manifest.json"].startswith(b'{\n "books": [\n  {\n   "bytes"'), "the manifest is made to be read: one value to a line")

    def test_the_same_zip_makes_the_same_bytes_every_time_and_nothing_depends_on_the_clock_or_the_folder(self):
        first = self.built()
        second = self.built()
        self.assertEqual(first.files, second.files)
        self.assertEqual(first.ts, second.ts)
        other = self.dir / "other"
        other.mkdir()
        copy = other / "copy.zip"
        copy.write_bytes(self.zip.read_bytes())
        for args in (["--zip", str(self.zip), "--out", str(self.out), "--ts", str(self.ts)], ["--zip", str(copy), "--out", str(other / "webc"), "--ts", str(other / "map.ts")]):
            self.assertEqual(self.run_main(*args)[0], 0)
        for name in first.files:
            self.assertEqual((self.out / name).read_bytes(), (other / "webc" / name).read_bytes(), name)
        self.assertEqual(self.ts.read_bytes(), (other / "map.ts").read_bytes())
        before = {p.name: p.read_bytes() for p in self.out.iterdir()}
        self.assertEqual(self.run_main(*self.paths())[0], 0)
        self.assertEqual({p.name: p.read_bytes() for p in self.out.iterdir()}, before, "a second run changes nothing")

    def test_the_typescript_map_has_a_lazy_require_for_every_book_with_a_literal_path(self):
        ts = imp.generated_ts(("PSA", "1SA", "SNG"))
        self.assertEqual(ts.count("require("), 3)
        self.assertIn("  PSA: () => require('../../../../assets/bible/webc/PSA.json') as BookText,\n", ts)
        self.assertIn("  '1SA': () => require('../../../../assets/bible/webc/1SA.json') as BookText,\n", ts, "a code that starts with a digit is quoted")
        self.assertIn("import type { BookText } from './textTypes';", ts)
        self.assertIn("export const WEBC_LOADERS: Readonly<Record<string, () => BookText>> = {\n", ts)
        self.assertTrue(ts.startswith("// GENERATED by tools/bible/import_webc.py"))
        self.assertTrue(ts.endswith("};\n"))
        self.assertEqual(imp.quote_key("GEN"), "GEN")
        self.assertEqual(imp.quote_key("2KI"), "'2KI'")
        self.assertEqual(self.built().ts, imp.generated_ts(("PSA", "SNG", "MAT")))

    def test_write_mode_writes_the_files_and_removes_a_json_file_the_importer_does_not_make(self):
        self.out.mkdir()
        (self.out / "OLD.json").write_text("{}")
        (self.out / "README.txt").write_text("keep")
        code, out, err = self.run_main(*self.paths())
        self.assertEqual((code, err), (0, ""))
        self.assertIn("removed", out)
        self.assertIn("wrote 5 files", out)
        self.assertFalse((self.out / "OLD.json").exists())
        self.assertTrue((self.out / "README.txt").exists())
        self.assertTrue(self.ts.is_file())

    def test_check_passes_on_what_the_zip_makes_and_says_how_much_it_looked_at(self):
        self.assertEqual(self.run_main(*self.paths())[0], 0)
        code, out, err = self.run_main(*self.paths(), "--check")
        self.assertEqual((code, err), (0, ""))
        self.assertIn("ok: the committed assets are exactly what the zip makes", out)
        self.assertIn("3 books, 4 chapters, 12 verses", out)

    def test_check_finds_a_changed_asset_a_missing_one_an_extra_one_and_a_changed_map(self):
        self.assertEqual(self.run_main(*self.paths())[0], 0)
        changes = {
            "a changed book": (lambda: (self.out / "PSA.json").write_bytes((self.out / "PSA.json").read_bytes().replace(b"Blessed", b"Cursed")), "differs: " + str(self.out / "PSA.json")),
            "a changed manifest": (lambda: (self.out / "manifest.json").write_bytes(b"{}\n"), "differs: " + str(self.out / "manifest.json")),
            "a missing index": (lambda: (self.out / "index.json").unlink(), "missing: " + str(self.out / "index.json")),
            "an extra file": (lambda: (self.out / "XXX.json").write_text("{}"), "not made by the importer: " + str(self.out / "XXX.json")),
            "a changed map": (lambda: self.ts.write_text(self.ts.read_text() + "// edited\n"), "differs: " + str(self.ts)),
            "a missing map": (lambda: self.ts.unlink(), "missing: " + str(self.ts)),
        }
        for name, (change, line) in changes.items():
            with self.subTest(name):
                self.assertEqual(self.run_main(*self.paths())[0], 0)  # back to what the zip makes
                for stray in self.out.glob("XXX.json"):
                    stray.unlink()
                change()
                code, out, err = self.run_main(*self.paths(), "--check")
                self.assertEqual(code, 1)
                self.assertIn(line, out)
                self.assertIn("the committed assets are not what the zip makes", err)

    def test_check_on_a_folder_that_is_not_there_says_everything_is_missing(self):
        code, out, _ = self.run_main(*self.paths(), "--check")
        self.assertEqual(code, 1)
        self.assertEqual(out.count("missing:"), 6)
        self.assertEqual(len(list(self.out.parent.glob("webc"))), 0, "--check writes nothing")

    def test_check_writes_nothing(self):
        self.assertEqual(self.run_main(*self.paths(), "--check")[0], 1)
        self.assertFalse(self.out.exists())
        self.assertFalse(self.ts.exists())

    def test_check_lists_twenty_differences_and_counts_the_rest(self):
        with mock.patch.object(imp, "differences", return_value=[f"differs: {i}" for i in range(25)]):
            code, out, err = self.run_main(*self.paths(), "--check")
        self.assertEqual(code, 1)
        self.assertEqual(out.count("differs:"), 20)
        self.assertIn("... and 5 more", out)

    def test_a_zip_that_is_not_the_pinned_file_is_refused_with_both_hashes_and_nothing_is_written(self):
        code, out, err = self.run_main(*self.paths(), "--sha256", "0" * 64)
        self.assertEqual(code, 2)
        self.assertIn("is not the zip this importer is pinned to", err)
        self.assertIn(self.sha, err)
        self.assertIn("0" * 64, err)
        self.assertIn("Bumping the pin", err)
        self.assertFalse(self.out.exists())
        self.assertFalse(self.ts.exists())
        changed = self.dir / "changed.zip"
        changed.write_bytes(self.zip.read_bytes() + b"\0")
        code, _, err = self.run_main("--zip", str(changed), "--out", str(self.out), "--ts", str(self.ts))
        self.assertEqual(code, 2)
        self.assertIn("is not the zip this importer is pinned to", err)
        self.assertFalse(self.out.exists())
        code, _, err = self.run_main(*self.paths(), "--check", "--sha256", "f" * 64)
        self.assertEqual(code, 2, "--check refuses a zip it is not pinned to too")

    def test_the_hash_has_to_be_64_lower_case_hex_digits(self):
        for bad in ("", "abc", "G" * 64, self.sha.upper(), self.sha + "0"):
            code, _, err = self.run_main(*self.paths(), "--sha256", bad)
            self.assertEqual(code, 2, bad)
            self.assertIn("--sha256 must be 64 lower-case hex digits", err)

    def test_a_missing_zip_is_an_error_not_a_crash_and_a_file_that_is_not_a_zip_is_refused(self):
        code, _, err = self.run_main("--zip", str(self.dir / "nope.zip"), "--out", str(self.out), "--ts", str(self.ts))
        self.assertEqual(code, 2)
        self.assertIn("cannot read", err)
        self.assertIn("nope.zip", err)
        junk = self.dir / "junk.zip"
        junk.write_bytes(b"not a zip at all")
        code, _, err = self.run_main("--zip", str(junk), "--sha256", sha(b"not a zip at all"), "--out", str(self.out), "--ts", str(self.ts))
        self.assertEqual(code, 2)
        self.assertIn("is not a readable zip", err)

    def test_the_zip_is_downloaded_into_a_fresh_temporary_folder_that_is_removed_afterwards(self):
        source = small(self.sha, url=self.zip.as_uri())
        made = []
        real = tempfile.mkdtemp
        with mock.patch.object(tempfile, "mkdtemp", side_effect=lambda *a, **k: made.append(real(*a, **k)) or made[-1]):
            code, out, err = self.run_main("--out", str(self.out), "--ts", str(self.ts), source=source)
        self.assertEqual((code, err), (0, ""))
        self.assertIn("downloading " + self.zip.as_uri(), out)
        self.assertEqual(len(made), 1)
        self.assertFalse(pathlib.Path(made[0]).exists(), "the temporary folder is gone")
        self.assertTrue((self.out / "PSA.json").is_file())
        # and a download that cannot be had is an error with the address, not a traceback
        gone = small(self.sha, url=(self.dir / "gone.zip").as_uri())
        code, _, err = self.run_main("--out", str(self.dir / "x"), "--ts", str(self.dir / "x.ts"), source=gone)
        self.assertEqual(code, 2)
        self.assertIn("could not download", err)
        self.assertIn("gone.zip", err)

    def test_a_download_bigger_than_the_limit_is_refused(self):
        with mock.patch.object(imp, "MAX_ZIP_BYTES", 100):
            code, _, err = self.run_main("--out", str(self.out), "--ts", str(self.ts), source=small(self.sha, url=self.zip.as_uri()))
            self.assertEqual(code, 2)
            self.assertIn("is bigger than 100 bytes", err)
            code, _, err = self.run_main(*self.paths())
            self.assertEqual(code, 2)
            self.assertIn("more than 100", err)

    def test_a_zip_with_the_wrong_books_is_refused(self):
        for name, members, pattern in [
            ("a book missing", fixture_members(SNG=None), r"missing: SNG; unexpected: none"),
            ("a book too many", {**fixture_members(), "30-GENeng-web-c.usfm": usfm("\\c 1\n\\p\n\\v 1 x\n", "GEN", "Genesis").encode()}, r"missing: none; unexpected: GEN"),
            ("a book twice", {**fixture_members(), "21-PSAeng-web-c.usfm": b"x"}, r"two files for PSA"),
            ("no preface", fixture_members(FRT=None), r"missing: FRT"),
            ("no licence page", fixture_members(copr=None), r"the zip has no copr\.htm"),
            ("a preface that is not one", fixture_members(FRT=b"\\id GEN Not the preface\n"), r"does not start with \\id FRT"),
        ]:
            with self.subTest(name), self.assertRaisesRegex(imp.ImportProblem, pattern):
                self.built(members)

    def test_a_book_that_says_it_is_another_book_is_refused(self):
        members = fixture_members(PSA=usfm(PSALMS, "SNG", "Psalms", "\\mt1 x\n").encode())
        with self.assertRaisesRegex(imp.ImportProblem, r"^PSA line 1: \\id says 'SNG', but the file is for PSA$"):
            self.built(members)

    def test_totals_that_are_not_the_expected_ones_are_refused(self):
        for totals in ((4, 4, 12), (3, 5, 12), (3, 4, 11)):
            with self.subTest(totals=totals), self.assertRaisesRegex(imp.ImportProblem, r"the zip holds 3 books, 4 chapters, 12 verses; this importer expects"):
                self.built(source=small(self.sha, totals=totals))
        self.assertTrue(self.built(source=small(self.sha, totals=None)).files)

    def test_a_book_that_the_importer_cannot_read_is_refused_with_its_name_and_nothing_is_written(self):
        zip2 = self.dir / "bad.zip"
        bad = write_zip(zip2, fixture_members(SNG=usfm("\\c 1\n\\p\n\\v 1 One \\k odd\\k*.\n", "SNG", "Song of Solomon").encode()))
        code, out, err = self.run_main("--zip", str(zip2), "--sha256", bad, "--out", str(self.out), "--ts", str(self.ts))
        self.assertEqual(code, 2)
        self.assertIn("import_webc: SNG line 9: the marker \\k is not one this importer knows", err)
        self.assertFalse(self.out.exists(), "nothing is written when one book is refused")
        self.assertFalse(self.ts.exists())

    def test_a_file_that_is_not_utf_8_is_refused(self):
        with self.assertRaisesRegex(imp.ImportProblem, r"20-PSAeng-web-c\.usfm: not UTF-8"):
            self.built(fixture_members(PSA=b"\\id PSA \xff\xfe\n"))

    def test_a_byte_order_mark_at_the_start_of_a_file_is_ignored(self):
        members = fixture_members()
        name = next(k for k in members if "PSA" in k)
        members[name] = b"\xef\xbb\xbf" + members[name]
        self.assertEqual(self.built(members).files["PSA.json"], self.built().files["PSA.json"])

    def test_the_zip_is_read_with_limits_and_nothing_is_unpacked(self):
        for name in ("../evil.usfm", "/etc/passwd", "a\\b.usfm", "dir/../x.usfm"):
            path = self.dir / "unsafe.zip"
            digest = write_zip(path, {**fixture_members(), name: b"x"})
            with self.subTest(name), self.assertRaisesRegex(imp.ImportProblem, r"holds a file with an unsafe name"):
                imp.read_zip(path, digest)
        with mock.patch.object(imp, "MAX_MEMBER_BYTES", 50), self.assertRaisesRegex(imp.ImportProblem, r"is [\d,]+ bytes, more than 50"):
            imp.read_zip(self.zip, self.sha)
        with mock.patch.object(imp, "MAX_TOTAL_BYTES", 50), self.assertRaisesRegex(imp.ImportProblem, r"holds more than 50 bytes once unpacked"):
            imp.read_zip(self.zip, self.sha)
        members, digest, size = imp.read_zip(self.zip, self.sha)
        self.assertEqual((digest, size), (self.sha, self.zip.stat().st_size))
        self.assertEqual(sorted(members), sorted(fixture_members()), "the preface, the licence page and the books; not the other files")
        extra = self.dir / "extra.zip"
        digest = write_zip(extra, {**fixture_members(), "keys.asc": b"key", "gentiumplus.css": b"css", "signature.txt.asc": b"sig"})
        self.assertEqual(sorted(imp.read_zip(extra, digest)[0]), sorted(fixture_members()))
        before = sorted(os.listdir(self.dir))
        imp.read_zip(self.zip, self.sha)
        self.assertEqual(sorted(os.listdir(self.dir)), before, "nothing is written to disk")

    def test_the_default_source_is_pinned_and_complete(self):
        p = imp.PINNED
        self.assertEqual(p.url, "https://ebible.org/Scriptures/eng-web-c_usfm.zip")
        self.assertEqual(p.sha256, "85a6599ccd65c8d71a62fb0d7e1739e4c776a970e05f25d5f881684550e7620c")
        self.assertRegex(p.date, r"^\d{4}-\d{2}-\d{2}$")
        self.assertEqual(p.totals, (73, 1328, 35408))
        self.assertEqual(len(p.order), 73)
        self.assertEqual(len(set(p.order)), 73)
        self.assertEqual(p.order[:3] + p.order[16:19] + p.order[26:28], ("GEN", "EXO", "LEV", "ESG", "JOB", "PSA", "DAG", "HOS"))
        self.assertEqual(p.order[39:46], ("TOB", "JDT", "WIS", "SIR", "BAR", "1MA", "2MA"))
        self.assertEqual(p.order[46], "MAT")
        self.assertEqual(p.order[-1], "REV")
        self.assertNotIn("EST", p.order)
        self.assertNotIn("DAN", p.order)
        self.assertEqual(imp.TRANSLATION["id"], "eng-web-c")
        self.assertEqual(imp.TRANSLATION["name"], "World English Bible, Catholic edition")
        self.assertEqual(imp.TRANSLATION["short"], "WEB")
        self.assertEqual(imp.TRANSLATION["licence"], "Public domain")
        self.assertEqual(imp.TRANSLATION["credit"], 'World English Bible, Catholic edition (eBible.org). Public domain. The name "World English Bible" is a trademark of eBible.org.')
        self.assertEqual(imp.TRANSLATION["source"], "https://ebible.org/eng-web-c/")
        self.assertEqual(imp.FORMAT, 1)


# ------------------------------------------------------------------------------------------------------- what is committed
ASSETS = ROOT / "mobile" / "assets" / "bible" / "webc"
GENERATED = ROOT / "mobile" / "src" / "features" / "library" / "bible" / "webc.generated.ts"


class Committed(unittest.TestCase):
    """The files in the repository agree with the importer and with each other. (That they are what the zip makes is `--check`, which needs the zip.)"""

    def test_the_typescript_map_is_what_the_importer_writes(self):
        self.assertEqual(GENERATED.read_text(encoding="utf-8"), imp.generated_ts(imp.PINNED.order))

    def test_the_folder_holds_exactly_the_files_of_the_importer(self):
        self.assertEqual(sorted(p.name for p in ASSETS.iterdir()), sorted([f"{c}.json" for c in imp.PINNED.order] + ["index.json", "manifest.json"]))

    def test_the_manifest_matches_the_pin_and_every_file_matches_the_manifest(self):
        m = json.loads((ASSETS / "manifest.json").read_text(encoding="utf-8"))
        p = imp.PINNED
        self.assertEqual((m["source"]["url"], m["source"]["sha256"], m["source"]["date"], m["source"]["bytes"]), (p.url, p.sha256, p.date, 3090996))
        self.assertEqual((m["totals"]["books"], m["totals"]["chapters"], m["totals"]["verses"]), p.totals)
        self.assertEqual(m["translation"], imp.TRANSLATION)
        self.assertEqual([e["code"] for e in m["books"]], list(p.order))
        for e in m["books"]:
            data = (ASSETS / e["file"]).read_bytes()
            self.assertEqual((len(data), sha(data)), (e["bytes"], e["sha256"]), e["file"])
        index = (ASSETS / "index.json").read_bytes()
        self.assertEqual(m["files"]["index.json"], {"bytes": len(index), "sha256": sha(index)})
        self.assertEqual(json.loads(index), {"books": [{"chapters": e["chapters"], "code": e["code"], "name": e["name"], "verses": e["verses"]} for e in m["books"]], "translation": imp.TRANSLATION})

    def test_the_files_are_in_the_form_the_importer_writes(self):
        for code in imp.PINNED.order:
            raw = (ASSETS / f"{code}.json").read_bytes()
            self.assertEqual(raw, imp.dumps(json.loads(raw)), f"{code}.json is not what the importer's writer makes of its own content")

    def test_no_file_holds_markup_or_a_character_the_importer_would_have_refused(self):
        for code in imp.PINNED.order:
            book = json.loads((ASSETS / f"{code}.json").read_text(encoding="utf-8"))
            for chapter in book["chapters"]:
                for text in [chapter.get("title", "")] + [x for v in chapter["verses"] for x in (v["t"].replace("\n", "").replace("\t", ""), v.get("h", ""))]:
                    imp.check_chars(text, f"{code} {chapter['c']}")


# ------------------------------------------------------------------------------------------------------------- the real zip
@unittest.skipUnless(os.environ.get("WEBC_ZIP"), "set WEBC_ZIP to a copy of eng-web-c_usfm.zip to run the importer on the real zip")
class RealZip(unittest.TestCase):
    def test_the_real_zip_makes_exactly_what_is_committed_and_twice_the_same(self):
        path = pathlib.Path(os.environ["WEBC_ZIP"])
        members, digest, size = imp.read_zip(path, imp.PINNED.sha256)
        built = imp.build(members, digest, size)
        self.assertEqual(imp.differences(built, ASSETS, GENERATED), [])
        self.assertEqual(imp.build(members, digest, size).files, built.files)
        self.assertEqual(built.summary, "73 books, 1,328 chapters, 35,408 verses, 5,389,017 bytes of JSON")

    def test_every_verse_has_the_words_of_an_independent_reading_of_the_zip(self):
        """The words of each verse are read again here with regular expressions and no state (the importer reads line by line with a tokenizer), and the two
        readings have the same words in all of the 35,408 verses, whitespace aside. This is how it was checked that the importer takes only markup away."""
        members, digest, size = imp.read_zip(pathlib.Path(os.environ["WEBC_ZIP"]), imp.PINNED.sha256)
        built = imp.build(members, digest, size)

        def words(s):
            s = re.sub(r"\\f\s.*?\\f\*", "", s, flags=re.S)  # footnotes
            s = re.sub(r"\\x\s.*?\\x\*", "", s, flags=re.S)  # cross references
            s = re.sub(r"\\\+?w\s+([^|\\]*)\|[^\\]*?\\\+?w\*", r"\1", s)  # a word and its Strong's number
            s = re.sub(r"\\(?:wj|qs|bk|nd|add)\*", "", s)
            return re.sub(r"\\(?:wj|qs|bk|nd|add) ", "", s)

        checked = 0
        for code in imp.PINNED.order:
            name = next(n for n in members if n.endswith(f"-{code}eng-web-c.usfm"))
            expected, chapter, verse = {}, 0, None
            for line in members[name].decode("utf-8-sig").split("\n"):
                if not line.strip():
                    continue
                m = re.match(r"\\([a-z0-9]+)(?: (.*))?$", line.rstrip(" "))
                marker, rest = m.group(1), m.group(2) or ""
                if marker == "c":
                    chapter, verse = int(rest), None
                elif marker == "v" and chapter:
                    label, _, text = rest.partition(" ")
                    verse = (chapter, label)
                    expected[verse] = [words(text)]
                elif marker in ("p", "m", "mi", "pi1", "q1", "q2", "q3", "li1", "nb") and verse is not None:
                    expected[verse].append(words(rest))
            book = json.loads(built.files[f"{code}.json"])
            got = {(c["c"], v["n"]): v["t"] for c in book["chapters"] for v in c["verses"]}
            self.assertEqual(list(got), list(expected), f"{code}: the same verses in the same order")
            for key, parts in expected.items():
                flat = lambda t: re.sub(r"[ \t\n\r]+", " ", t).strip(" ")
                self.assertEqual(flat(got[key]), flat(" ".join(parts)), f"{code} {key}")
                checked += 1
        self.assertEqual(checked, 35408)


if __name__ == "__main__":
    unittest.main()
