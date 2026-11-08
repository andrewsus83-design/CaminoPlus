"""Tests for tools/passage.py (copying a passage out of a source text). Run from the repository root:  python3 -m unittest discover -s tools/tests -v"""
import pathlib
import subprocess
import sys
import tempfile
import unittest

TOOLS = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(TOOLS))

import passage  # noqa: E402

SOURCE = """The Project Gutenberg eBook of A Test
*** START OF THE PROJECT GUTENBERG EBOOK A TEST ***

THE FIRST BOOK

CHAPTER I

He who follows Me, walketh not in darkness, saith the Lord. These are the words
of Christ, by which we are admonished how we ought to imitate His life--and
manners, if we would be truly enlightened.

CHAPTER II

Every man naturally desireth to know(1); but what availeth knowledge without
the fear of God? 2. A humble husbandman who serves God is better than a proud
philosopher. “Quiet your soul and listen. The _small_ voice is enough.

THE SECOND BOOK

CHAPTER I

Let us rest here, in the _quiet_ of the evening.
*** END OF THE PROJECT GUTENBERG EBOOK A TEST ***
"""
WEB = """*** START OF THE PROJECT GUTENBERG EBOOK WEB ***
121:001 <<A Song of Ascents.>> I will lift up my eyes to the hills.
        Where does my help come from?
121:002 My help comes from Yahweh, who made heaven and earth.
*** END OF THE PROJECT GUTENBERG EBOOK WEB ***
"""


class Extract(unittest.TestCase):
    def test_the_stretch_is_copied_across_hard_wrapped_lines_and_says_where_it_is(self):
        e = passage.extract(SOURCE, "He who follows Me", "truly enlightened.")
        self.assertEqual(e.text, "He who follows Me, walketh not in darkness, saith the Lord. These are the words of Christ, by which we are admonished "
                                 "how we ought to imitate His life--and manners, if we would be truly enlightened.")
        self.assertEqual(e.where, ["THE FIRST BOOK", "CHAPTER I"])
        self.assertEqual(e.warnings, [])
        self.assertEqual(e.words, 37)

    def test_where_follows_the_book_and_chapter_the_stretch_is_in(self):
        e = passage.extract(SOURCE, "Let us rest here", "evening.")
        self.assertEqual(e.where, ["THE SECOND BOOK", "CHAPTER I"])      # the nearest book and the nearest chapter, not the chapter of the book before
        self.assertEqual(e.text, "Let us rest here, in the *quiet* of the evening.")                      # _italic_ became *italic*

    def test_conversations_and_letters_are_chapter_level_headings(self):
        src = "*** START OF THE PROJECT GUTENBERG EBOOK X ***\nFIRST CONVERSATION.\n\nHe walked a long way.\n\nSEVENTH LETTER.\n\nYou ask how to begin, and so I say: begin.\n*** END OF THE PROJECT GUTENBERG EBOOK X ***\n"
        self.assertEqual(passage.extract(src, "You ask how", "begin.").where, ["SEVENTH LETTER."])
        self.assertEqual(passage.extract(src, "He walked", "long way.").where, ["FIRST CONVERSATION."])

    def test_what_a_copied_stretch_can_carry_that_is_not_text_is_reported(self):
        e = passage.extract(SOURCE, "Every man naturally", "proud philosopher.")
        text = " ".join(e.warnings)
        self.assertIn("a footnote marker inside the stretch ((1))", text)
        self.assertIn("a paragraph number inside the stretch ('2.')", text)
        clean = passage.extract(SOURCE, "But what availeth".replace("But", "but"), "fear of God?")
        self.assertEqual(clean.warnings, [])
        quote = passage.extract(SOURCE, "“Quiet your soul", "is enough.")
        self.assertTrue(any("quotation mark is opened and not closed" in w for w in quote.warnings))

    def test_a_phrase_that_is_not_there_is_an_error_not_a_guess(self):
        with self.assertRaises(passage.NotFound):
            passage.extract(SOURCE, "Not in this book at all", "anywhere.")
        with self.assertRaises(passage.NotFound):
            passage.extract(SOURCE, "He who follows Me", "an end that comes only before the start")
        with self.assertRaises(passage.NotFound):
            passage.extract(SOURCE, "   ", "x")

    def test_the_bible_text_loses_its_verse_numbers_and_headings(self):
        e = passage.extract(WEB, "I will lift up my eyes", "heaven and earth.", web=True)
        self.assertEqual(e.text, "I will lift up my eyes to the hills. Where does my help come from? My help comes from Yahweh, who made heaven and earth.")

    def test_the_bible_stretch_says_which_verses_it_covers(self):
        self.assertEqual(passage.extract(WEB, "I will lift up my eyes", "heaven and earth.", web=True).where, ["121:1 to 2"])
        self.assertEqual(passage.extract(WEB, "My help comes from Yahweh", "heaven and earth.", web=True).where, ["121:2"])
        self.assertEqual(passage.extract(WEB, "Where does my help come from?", "who made heaven", web=True).where, ["121:1 to 2"])

    def test_straight_quotation_marks_are_counted_too(self):
        src = '*** START OF THE PROJECT GUTENBERG EBOOK X ***\nHe said, "Come here and rest, and I will give you peace." Then he left.\n*** END OF THE PROJECT GUTENBERG EBOOK X ***\n'
        self.assertTrue(any("quotation mark" in w for w in passage.extract(src, "Come here and rest", 'peace." Then').warnings))   # the opening mark is outside, the closing one inside
        self.assertEqual(passage.extract(src, "Come here and rest", "give you peace.").warnings, [])    # neither mark inside: a balanced stretch
        self.assertEqual(passage.extract(src, '"Come here', 'peace."').warnings, [])                    # both inside: balanced

    def test_the_command_line_joins_stretches_and_its_output_passes_the_checker(self):
        with tempfile.TemporaryDirectory() as t:
            src = pathlib.Path(t) / "pg1.txt"
            src.write_text(SOURCE, encoding="utf-8")
            r = subprocess.run([sys.executable, str(TOOLS / "passage.py"), str(src), "--from", "He who follows Me", "--to", "saith the Lord.",
                                "--from", "Let us rest here", "--to", "evening."], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertEqual(r.stdout.strip(), "> He who follows Me, walketh not in darkness, saith the Lord. … Let us rest here, in the *quiet* of the evening.")
            bad = subprocess.run([sys.executable, str(TOOLS / "passage.py"), str(src), "--from", "Nothing like it", "--to", "at all"], capture_output=True, text=True)
            self.assertEqual(bad.returncode, 1)
            self.assertIn("start not found", bad.stderr)


if __name__ == "__main__":
    unittest.main()
