#!/usr/bin/env python3
"""Turn the World English Bible, Catholic edition (eBible.org id eng-web-c, public domain), from USFM into the JSON the app reads.

    python3 tools/bible/import_webc.py                 download the pinned zip, write the assets of the app
    python3 tools/bible/import_webc.py --zip PATH      use a copy of the zip you already have
    python3 tools/bible/import_webc.py --check         write nothing; exit 1 if the committed assets are not what the zip makes

What it writes (all of it generated: never edit by hand, run this again):
  mobile/assets/bible/webc/<CODE>.json   one file per book, in the format of mobile/src/features/library/bible/textTypes.ts
  mobile/assets/bible/webc/index.json    the translation and the 73 books in the order of the app
  mobile/assets/bible/webc/manifest.json where it came from, a hash of every file, the counts, and what was left out
  mobile/src/features/library/bible/webc.generated.ts   73 lazy `require`s (Metro needs literal paths)

The words of the World English Bible must stay exactly as they are: eBible.org lets anyone use the text, and asks that a text that
CHANGES the words is no longer called the World English Bible. So the importer only takes markup away. It leaves out the apparatus
(Strong's numbers, footnotes, cross references, the preface and the titles of the files) and it says so, with counts, in manifest.json.
It is strict on purpose: a marker it does not know, a note that is not closed, a verse out of order, a character nobody has looked at
is an error that names the book and the line, so nothing is dropped or mangled without somebody seeing it. Standard library only.

How the markers of the source become the format (README.md next to this file has the long version):
  \\id \\ide \\h \\toc1 \\toc2 \\toc3     the head of a book. \\toc2 is the name of the book; the others are only checked
  \\mt1 \\mt2 \\mt3                      the long title of the book: left out
  \\ip \\is1                            an introduction written by the translators (and the prologue of Sirach): left out, counted
  \\cl                                 the word that goes with a chapter number ("Psalm"): left out
  \\c N                                a chapter
  \\v N, \\v N-M                         a verse; the label is kept as it is printed ("15-16")
  \\d                                  the title of a psalm: `title` of the chapter. A chapter with several (Psalm 119: the letters of the
                                      Hebrew alphabet) has them all as headings of the verse they stand before
  \\ms1 \\s1 \\sp                        a heading: `h` of the verse it stands before
  \\mr \\r                              a reference line: left out
  \\p \\m \\mi \\pi1                     a paragraph of prose: `p` on the verse that starts it, a "\\n" when it starts inside a verse
  \\nb                                 no break: nothing (the verse goes on in the paragraph before it)
  \\q1 \\q2 \\q3 \\li1                    a line of poetry or a list item, as a line of its own with 1, 2, 3 and 1 tabs in front
  \\b                                  a blank line: `b` on the verse after it, an empty line when it is inside a verse
  \\pc                                 a centred line; only a rule of dashes exists (2 Maccabees 2:18/19): left out
  \\w word|strong="H1234"\\w*  \\+w      the word; Strong's number left out, counted
  \\wj \\qs \\bk \\nd \\add               the words inside (the words of Jesus, Selah, a name of a book): the words stay
  \\f ... \\f*   \\x ... \\x*            footnote and cross reference: left out, counted
A verse that starts when no paragraph or line marker came before it goes on in the line or paragraph before it: its text has no tab
in front and the verse has no `p`.
"""
from __future__ import annotations

import argparse
import collections
import dataclasses
import hashlib
import json
import pathlib
import re
import shutil
import sys
import tempfile
import urllib.error
import urllib.request
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
DEFAULT_OUT = ROOT / "mobile" / "assets" / "bible" / "webc"
DEFAULT_TS = ROOT / "mobile" / "src" / "features" / "library" / "bible" / "webc.generated.ts"

# The books in the order of the app: the Old Testament (Esther where the Hebrew Bible has it, Daniel after Ezekiel, both from the
# Greek: ESG and DAG), the Deuterocanon, the New Testament.
ORDER = tuple((
    "GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH ESG JOB PSA PRO ECC SNG ISA JER LAM EZK DAG HOS JOL AMO OBA JON MIC "
    "NAM HAB ZEP HAG ZEC MAL TOB JDT WIS SIR BAR 1MA 2MA MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB "
    "JAS 1PE 2PE 1JN 2JN 3JN JUD REV"
).split())


@dataclasses.dataclass(frozen=True)
class Source:
    """The one zip this importer is written for. The hash pins it: another file is refused, not guessed at."""

    url: str
    sha256: str
    #: The day the zip was downloaded and read through. It goes into manifest.json, so it is pinned with the hash (a date that came
    #: from the clock would make every run different).
    date: str
    order: tuple[str, ...]
    #: (books, chapters, verses) the zip must hold; None skips the check (the tests use small zips).
    totals: tuple[int, int, int] | None


PINNED = Source(
    url="https://ebible.org/Scriptures/eng-web-c_usfm.zip",
    sha256="85a6599ccd65c8d71a62fb0d7e1739e4c776a970e05f25d5f881684550e7620c",
    date="2026-11-08",
    order=ORDER,
    totals=(73, 1328, 35408),
)

# What the screens print for the translation (textTypes.ts TranslationInfo).
TRANSLATION = {
    "id": "eng-web-c",
    "name": "World English Bible, Catholic edition",
    "short": "WEB",
    "licence": "Public domain",
    "credit": 'World English Bible, Catholic edition (eBible.org). Public domain. The name "World English Bible" is a trademark of eBible.org.',
    "source": "https://ebible.org/eng-web-c/",
}

FORMAT = 1
MAX_ZIP_BYTES = 16 * 1024 * 1024
MAX_MEMBER_BYTES = 8 * 1024 * 1024
MAX_TOTAL_BYTES = 40 * 1024 * 1024
USFM_NAME = re.compile(r"^[0-9]{2}-([0-9A-Z]{3})eng-web-c\.usfm$")
FRONT_MATTER = "FRT"
LICENCE_PAGE = "copr.htm"


class ImportProblem(Exception):
    """The source is not what this importer was written for. The message names the book and the line."""


# ------------------------------------------------------------------------------------------------------------- the words of a line

MARKER = re.compile(r"\\(\+?)([a-z][a-z0-9]*)(\*?)")
WORD = re.compile(r'([^|\\]+)\|strong="[HG][0-9]+"\\(\+?)w\*')
STYLES = frozenset({"wj", "qs", "bk", "nd", "add"})
NOTES = ("f", "x")
NOTE_START = {"f": re.compile(r" \+ \\fr "), "x": re.compile(r" \+ \\xo ")}  # the space after \f is the one that ends the marker
NOTE_MARKERS = {
    "f": frozenset({"fr", "ft", "fqa", "fq", "fl", "+bk", "+bk*", "+wh", "+wh*"}),
    "x": frozenset({"xo", "xt"}),
}
# The only characters the words of this edition use: printable ASCII, the curly quotes, the two dashes, and the no-break space (three
# times, between a closing single and a closing double quote). Another character is not wrong, but somebody has to look at it.
ALLOWED = frozenset(chr(c) for c in range(0x20, 0x7F)) | frozenset("\u2018\u2019\u201c\u201d\u2013\u2014\u00a0")
LEFT_OVER = '\\|"'  # what is left of markup when something went wrong


def clean_text(raw: str, where: str, stats: collections.Counter, notes: list[str] | None = None) -> str:
    """The words of the rest of one line of USFM: footnotes, cross references and Strong's numbers gone, the markers of styles gone
    (their words stay), runs of spaces made one, the ends trimmed. `where` ("GEN line 12") is for the messages. When `notes` is a
    list, the words of every footnote that was left out are appended to it (the manifest tells what a verse that is only a note says)."""
    out: list[str] = []
    open_styles: list[str] = []
    i, n = 0, len(raw)
    while i < n:
        j = raw.find("\\", i)
        if j < 0:
            out.append(raw[i:])
            break
        out.append(raw[i:j])
        m = MARKER.match(raw, j)
        if not m:
            raise ImportProblem(f"{where}: a backslash that starts no marker: {raw[j:j + 24]!r}")
        plus, name, star = m.groups()
        i = m.end()
        if name in NOTES and not plus and not star:
            close = f"\\{name}*"
            k = raw.find(close, i)
            if k < 0:
                raise ImportProblem(f"{where}: \\{name} is never closed on its line")
            check_note(name, raw[i:k], where)
            stats["footnotes" if name == "f" else "crossReferences"] += 1
            if notes is not None and name == "f":
                notes.append(note_words(raw[i:k]))
            i = k + len(close)
        elif name == "w" and not star:
            if raw[i:i + 1] != " " or bool(plus) != bool(open_styles):
                raise ImportProblem(f"{where}: a \\{plus}w that is not placed the way every word is in this edition: {raw[j:j + 40]!r}")
            w = WORD.match(raw, i + 1)
            if not w or w.group(2) != plus:
                raise ImportProblem(f'{where}: a word tag that is not \\w word|strong="H1234"\\w*: {raw[j:j + 60]!r}')
            out.append(w.group(1))
            stats["strongsTags"] += 1
            i = w.end()
        elif name in STYLES and not plus:
            if star:
                if not open_styles or open_styles[-1] != name:
                    raise ImportProblem(f"{where}: \\{name}* closes nothing that is open")
                open_styles.pop()
            else:
                if raw[i:i + 1] != " ":
                    raise ImportProblem(f"{where}: \\{name} is not followed by a space")
                i += 1
                open_styles.append(name)
                stats["kept:" + name] += 1
        else:
            raise ImportProblem(f"{where}: the marker \\{plus}{name}{star} is not one this importer knows. Decide what it should become, then teach the importer")
    if open_styles:
        raise ImportProblem(f"{where}: \\{open_styles[-1]} is never closed on its line")
    text = re.sub(r" +", " ", "".join(out)).strip(" ")
    check_chars(text, where)
    return text


def check_note(name: str, body: str, where: str) -> None:
    """A footnote or cross reference is dropped whole, but only after it is seen to be the kind this edition has."""
    if not NOTE_START[name].match(body):
        raise ImportProblem(f"{where}: a \\{name} note that does not start the way all of them do in this edition: {body[:40]!r}")
    found = [m.group(1) + m.group(2) + m.group(3) for m in MARKER.finditer(body)]
    if body.count("\\") != len(found):
        raise ImportProblem(f"{where}: a backslash inside a \\{name} note that starts no marker: {body[:60]!r}")
    for marker in found:
        if marker not in NOTE_MARKERS[name]:
            raise ImportProblem(f"{where}: the marker \\{marker} inside a \\{name} note is not one this importer knows")


def note_words(body: str) -> str:
    """The words of a footnote, without its caller (+), its markers and the reference at its start (which is the label of the verse)."""
    body = re.sub(r"^ \+ \\fr [^\\]*", "", body)
    return re.sub(r" +", " ", MARKER.sub("", body)).strip(" ")


def check_chars(text: str, where: str) -> None:
    odd = sorted({c for c in text if c not in ALLOWED})
    if odd:
        raise ImportProblem(f"{where}: unexpected character {', '.join('U+%04X' % ord(c) for c in odd)} in {text[:60]!r}")
    left = sorted({c for c in text if c in LEFT_OVER})
    if left:
        raise ImportProblem(f"{where}: {' '.join(left)} left in the words ({text[:60]!r}): markup that was not understood")


# ------------------------------------------------------------------------------------------------------------------- one book

#: The lines that start a paragraph or a line, and what each does: (kind, tabs in front of the line).
LINES = {
    "p": ("paragraph", 0), "m": ("paragraph", 0), "mi": ("paragraph", 0), "pi1": ("paragraph", 0),
    "nb": ("no break", 0),
    "q1": ("line", 1), "q2": ("line", 2), "q3": ("line", 3), "li1": ("line", 1),
}
HEADINGS = frozenset({"ms1", "s1", "sp"})
REFERENCES = frozenset({"mr", "r"})
HEAD_REQUIRED = ("id", "h", "toc1", "toc2", "toc3")
HEAD_TITLES = ("mt1", "mt2", "mt3")
HEAD_INTRODUCTION = ("ip", "is1")
LINE = re.compile(r"\\([a-z][a-z0-9]*)(?: (.*))?\Z")
VERSE = re.compile(r"([0-9]+)(?:-([0-9]+))?(?: (.*))?\Z")


@dataclasses.dataclass
class Pending:
    """A paragraph or line marker that has no words after it: the next verse starts the paragraph or the line."""

    marker: str
    kind: str
    tabs: int
    line: int


@dataclasses.dataclass
class Head:
    text: str
    line: int
    inside: bool = False  # it stands in the middle of a verse: more words of that verse come after it


@dataclasses.dataclass
class Verse:
    n: str
    line: int  # where it starts in the file, for messages
    lines: list[tuple[int, str]]  # (tabs, words); an empty line has no words
    notes: list[str]  # the words of the footnotes that were left out of it
    p: bool = False
    b: bool = False
    h: str | None = None


class Book:
    """Reads the lines of one book of USFM in order and builds its chapters. What it cannot place is an ImportProblem."""

    def __init__(self, code: str):
        self.code = code
        self.stats: collections.Counter = collections.Counter()
        self.head: dict[str, str] = {}
        self.chapters: list[dict] = []
        self.chapter: dict | None = None
        self.verse: Verse | None = None
        self.last_end = 0  # the last verse number of the chapter so far
        self.pending: Pending | None = None
        self.blank = False  # a \b, waiting for its verse (or for the next words of the verse in progress)
        self.heads: list[Head] = []
        self.dropped: list[dict] = []  # headings that could not be kept, for manifest.json
        self.moved: list[dict] = []  # headings in the middle of a verse, put before the next one
        self.empty: list[dict] = []  # verses that have no words, only a note under their number
        self.introduction_words = 0

    # -- helpers
    def where(self, no: int) -> str:
        return f"{self.code} line {no}"

    def fail(self, no: int, message: str) -> ImportProblem:
        return ImportProblem(f"{self.where(no)}: {message}")

    def words(self, rest: str, no: int, notes: list[str] | None = None) -> str:
        return clean_text(rest, self.where(no), self.stats, notes)

    def title(self, no: int, text: str) -> None:
        if "title" in self.chapter:
            raise self.fail(no, f"a second line over chapter {self.chapter['c']}: the format has room for one title")
        self.chapter["title"] = text

    def required(self, no: int, marker: str, rest: str) -> str:
        text = self.words(rest, no)
        if not text:
            raise self.fail(no, f"a \\{marker} with no words")
        return text

    # -- the file
    def read(self, text: str) -> dict:
        if "\r" in text:
            raise ImportProblem(f"{self.code}: a carriage return in the file; the importer expects \\n line ends")
        if "\t" in text:
            raise ImportProblem(f"{self.code}: a tab in the file; tabs are what the output uses for indentation")
        lines: list[tuple[int, str, str]] = []
        for no, raw in enumerate(text.split("\n"), 1):
            if not raw.strip(" "):
                continue
            m = LINE.match(raw.rstrip(" "))
            if not m:
                raise ImportProblem(f"{self.where(no)}: a line that does not start with a marker and a space: {raw[:40]!r}")
            lines.append((no, m.group(1), m.group(2) or ""))
        if not lines or lines[0][1] != "id":
            raise ImportProblem(f"{self.code}: the file does not start with \\id")
        # How many \d each chapter has: one is the title of the chapter, several are headings (Psalm 119).
        titles: collections.Counter = collections.Counter()
        chapter = 0
        for _, marker, _ in lines:
            if marker == "c":
                chapter += 1
            elif marker == "d":
                titles[chapter] += 1
        chapter = 0
        for no, marker, rest in lines:
            if marker == "c":
                chapter += 1
            self.line(no, marker, rest, titles[chapter])
        return self.finish()

    def line(self, no: int, marker: str, rest: str, titles: int) -> None:
        if marker == "c":
            self.begin_chapter(no, rest)
        elif self.chapter is None:
            self.head_line(no, marker, rest)
        elif marker == "v":
            self.begin_verse(no, rest)
        elif marker in LINES:
            self.paragraph(no, marker, rest)
        elif marker == "b":
            if rest:
                raise self.fail(no, "a \\b with words after it")
            self.blank = True
        elif marker == "d" and titles == 1 and self.verse is None:
            self.title(no, self.required(no, marker, rest))
        elif marker in HEADINGS or marker == "d":
            self.heads.append(Head(self.required(no, marker, rest), no))
        elif marker in REFERENCES:
            self.stats["references"] += 1
        elif marker == "pc":
            text = self.words(rest, no)
            if not re.fullmatch("\u2014+", text):
                raise self.fail(no, f"a centred line (\\pc) that is not a rule of dashes: {text[:40]!r}")
            self.stats["separatorLines"] += 1
        else:
            raise self.fail(no, f"the marker \\{marker} is not one this importer knows in the middle of a book")

    # -- the head of the book
    def head_line(self, no: int, marker: str, rest: str) -> None:
        if marker == "id":
            if "id" in self.head:
                raise self.fail(no, "\\id twice")
            self.head["id"] = rest
            if rest.split(" ")[0] != self.code:
                raise self.fail(no, f"\\id says {rest.split(' ')[0]!r}, but the file is for {self.code}")
        elif marker in HEAD_REQUIRED or marker == "ide":
            if marker in self.head:
                raise self.fail(no, f"\\{marker} twice")
            text = self.words(rest, no)
            self.head[marker] = text
            if marker != "toc2":
                self.stats["bookHeaders"] += 1  # \toc2 is the name of the book, the rest is only read
            if marker == "ide" and text != "UTF-8":
                raise self.fail(no, f"\\ide says {text!r}, not UTF-8")
        elif marker in HEAD_TITLES:
            self.words(rest, no)
            self.stats["bookTitles"] += 1
        elif marker in HEAD_INTRODUCTION:
            text = self.words(rest, no)
            self.stats["introductionLines"] += 1
            self.introduction_words += len(text.split())
        elif marker == "cl":
            self.words(rest, no)
            self.stats["chapterLabels"] += 1
        else:
            raise self.fail(no, f"the marker \\{marker} before the first chapter is not one this importer knows")

    # -- chapters and verses
    def begin_chapter(self, no: int, rest: str) -> None:
        missing = [k for k in HEAD_REQUIRED if k not in self.head]
        if missing:
            raise self.fail(no, f"the first chapter starts before the head of the book is complete (missing \\{', \\'.join(missing)})")
        self.end_verse()
        number = rest.strip(" ")
        if not number.isdigit() or int(number) != len(self.chapters) + 1:
            raise self.fail(no, f"chapter {number!r} where {len(self.chapters) + 1} was expected")
        if self.pending:
            raise self.fail(no, f"the \\{self.pending.marker} on line {self.pending.line} has no verse after it")
        if self.blank:
            self.stats["blankLinesAtChapterEnd"] += 1  # the chapter break is a break already
            self.blank = False
        if any(not h.inside for h in self.heads):
            raise self.fail(no, "a heading right before a chapter")
        self.chapter = {"c": len(self.chapters) + 1, "verses": []}
        self.chapters.append(self.chapter)
        self.last_end = 0

    def paragraph(self, no: int, marker: str, rest: str) -> None:
        kind, tabs = LINES[marker]
        text = self.words(rest, no, self.verse.notes if self.verse else None)
        if not text:
            if self.pending:
                raise self.fail(no, f"two paragraph or line markers in a row (\\{self.pending.marker} on line {self.pending.line}, then \\{marker}): which one counts?")
            self.pending = Pending(marker, kind, tabs, no)
            return
        if kind == "no break":
            raise self.fail(no, "\\nb with words after it")
        if self.pending:
            raise self.fail(no, f"\\{marker} with words after a bare \\{self.pending.marker} (line {self.pending.line})")
        if self.verse is None:
            # Words of a paragraph over the first verse of a chapter ("A Prayer of Jesus the son of Sirach."): the line over the chapter.
            if kind != "paragraph":
                raise self.fail(no, f"words outside a verse after \\{marker}")
            self.title(no, text)
            return
        # More words of the verse in progress, on a line of their own.
        if self.blank:
            self.verse.lines.append((0, ""))
            self.blank = False
        self.verse.lines.append((tabs, text))
        for h in self.heads:
            h.inside = True

    def begin_verse(self, no: int, rest: str) -> None:
        m = VERSE.match(rest)
        if not m:
            raise self.fail(no, f"a verse label that is not a number, or two numbers joined by a hyphen: {rest[:20]!r}")
        first = int(m.group(1))
        last = int(m.group(2)) if m.group(2) else first
        label = m.group(1) + ("-" + m.group(2) if m.group(2) else "")
        if first <= self.last_end or last < first or (m.group(2) is not None and last == first):
            raise self.fail(no, f"verse {label} after verse {self.last_end}: the verses are not in order")
        self.end_verse()
        notes: list[str] = []
        text = self.words(m.group(3) or "", no, notes)
        verse = Verse(label, no, [(self.pending.tabs if self.pending else 0, text)], notes, p=bool(self.pending and self.pending.kind == "paragraph"))
        if self.blank and self.chapter["verses"]:
            verse.b = True
        elif self.blank:
            self.stats["blankLinesAtChapterStart"] += 1  # nothing to break from at the top of a chapter
        if self.heads:
            keep = self.heads[-1]
            for h in self.heads[:-1]:
                if not h.inside:
                    raise self.fail(h.line, f"two headings before verse {label}: the format has room for one")
                self.dropped.append({"before": f"{self.code} {len(self.chapters)}:{label}", "line": h.line, "text": h.text})
            if keep.inside:
                self.moved.append({"before": f"{self.code} {len(self.chapters)}:{label}", "line": keep.line, "text": keep.text})
            verse.h = keep.text
        self.pending, self.blank, self.heads = None, False, []
        self.verse = verse
        self.last_end = last

    def end_verse(self) -> None:
        v = self.verse
        if v is None:
            return
        self.verse = None
        lines = list(v.lines)
        while lines and not lines[0][1]:
            lines.pop(0)  # a verse that opens with a note only: its first line has no words
        text = "\n".join(("\t" * tabs + words) if words else "" for tabs, words in lines)
        verse: dict = {"n": v.n, "t": text}
        if v.p:
            verse["p"] = True
        if v.b:
            verse["b"] = True
        if v.h:
            verse["h"] = v.h
        if not text:
            # The edition prints a number and a note, no words (the verse is left out of the best manuscripts). The verse stays, with
            # no words; manifest.json keeps what the note says.
            note = " ".join(n for n in v.notes if n)
            if not note:
                raise self.fail(v.line, f"verse {v.n} has no words and no note")
            check_chars(note, self.where(v.line))
            self.empty.append({"note": note, "verse": f"{self.code} {self.chapter['c']}:{v.n}"})
        self.chapter["verses"].append(verse)

    def finish(self) -> dict:
        self.end_verse()
        if self.pending:
            raise ImportProblem(f"{self.code}: the \\{self.pending.marker} on line {self.pending.line} has no verse after it")
        if self.heads:
            raise ImportProblem(f"{self.code}: a heading (line {self.heads[0].line}) with no verse after it")
        if self.blank:
            self.stats["blankLinesAtChapterEnd"] += 1
            self.blank = False
        if not self.chapters:
            raise ImportProblem(f"{self.code}: no chapters")
        for chapter in self.chapters:
            if not chapter["verses"]:
                raise ImportProblem(f"{self.code} {chapter['c']}: a chapter with no verses")
        if not self.head["toc2"]:
            raise ImportProblem(f"{self.code}: \\toc2 is empty, so the book has no name")
        return {"code": self.code, "name": self.head["toc2"], "chapters": self.chapters}


# --------------------------------------------------------------------------------------------------------------- the whole edition


def dumps(obj) -> bytes:
    """Compact, sorted, UTF-8, one trailing newline. A no-break space is written as \\u00a0, so that it shows in a diff."""
    text = json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":")).replace("\u00a0", "\\u00a0")
    return (text + "\n").encode("utf-8")


def dumps_readable(obj) -> bytes:
    """The same for manifest.json, which people read: one value to a line."""
    text = json.dumps(obj, ensure_ascii=False, sort_keys=True, indent=1).replace("\u00a0", "\\u00a0")
    return (text + "\n").encode("utf-8")


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


@dataclasses.dataclass
class Build:
    files: dict[str, bytes]  # name inside the assets folder -> content
    ts: str  # webc.generated.ts
    summary: str


def quote_key(code: str) -> str:
    return code if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", code) else f"'{code}'"


def generated_ts(order: tuple[str, ...]) -> str:
    rows = "".join(f"  {quote_key(c)}: () => require('../../../../assets/bible/webc/{c}.json') as BookText,\n" for c in order)
    return (
        "// GENERATED by tools/bible/import_webc.py from the World English Bible, Catholic edition. Do not edit: run the importer again.\n"
        "// One lazy `require` for each book. Metro needs a literal path in every `require`, and a book is read from its file only when its\n"
        "// function is called, so only the book that is opened costs anything at run time. text.ts is the only file that uses this.\n"
        "import type { BookText } from './textTypes';\n\n"
        f"export const WEBC_LOADERS: Readonly<Record<string, () => BookText>> = {{\n{rows}}};\n"
    )


def build(members: dict[str, bytes], zip_sha256: str, zip_bytes: int, source: Source = PINNED) -> Build:
    """Everything the importer writes, in memory. `members` are the files of the zip that matter (read_zip)."""
    usfm: dict[str, tuple[str, bytes]] = {}
    for name, data in members.items():
        m = USFM_NAME.match(name)
        if m:
            if m.group(1) in usfm:
                raise ImportProblem(f"two files for {m.group(1)}: {usfm[m.group(1)][0]} and {name}")
            usfm[m.group(1)] = (name, data)
    wanted = set(source.order) | {FRONT_MATTER}
    if set(usfm) != wanted:
        missing, extra = sorted(wanted - set(usfm)), sorted(set(usfm) - wanted)
        raise ImportProblem(f"the zip does not hold the books this importer expects (missing: {' '.join(missing) or 'none'}; unexpected: {' '.join(extra) or 'none'})")
    if LICENCE_PAGE not in members:
        raise ImportProblem(f"the zip has no {LICENCE_PAGE}: the licence statement has to travel with the text")

    # The preface is left out whole. It is only checked to be the preface.
    front_name, front = usfm[FRONT_MATTER]
    front_text = front.decode("utf-8-sig")
    if not re.match(r"\\id FRT(\s|$)", front_text):
        raise ImportProblem(f"{front_name} does not start with \\id FRT")
    dropped_front = {"bytes": len(front), "file": front_name, "lines": sum(1 for line in front_text.split("\n") if line.strip())}

    files: dict[str, bytes] = {}
    entries: list[dict] = []
    index_books: list[dict] = []
    totals: collections.Counter = collections.Counter()
    stats: collections.Counter = collections.Counter()
    moved: list[dict] = []
    dropped: list[dict] = []
    empty: list[dict] = []
    introductions: dict[str, dict] = {}
    for code in source.order:
        name, data = usfm[code]
        try:
            text = data.decode("utf-8-sig")
        except UnicodeDecodeError as e:
            raise ImportProblem(f"{name}: not UTF-8 ({e})") from None
        book = Book(code)
        result = book.read(text)
        chapters = len(result["chapters"])
        verses = sum(len(c["verses"]) for c in result["chapters"])
        encoded = dumps(result)
        files[f"{code}.json"] = encoded
        index_books.append({"chapters": chapters, "code": code, "name": result["name"], "verses": verses})
        entries.append({
            "bytes": len(encoded), "chapters": chapters, "code": code, "file": f"{code}.json", "name": result["name"],
            "sha256": sha256_hex(encoded), "sourceFile": name, "sourceSha256": sha256_hex(data), "verses": verses,
        })
        totals["books"] += 1
        totals["chapters"] += chapters
        totals["verses"] += verses
        totals["bytes"] += len(encoded)
        stats.update(book.stats)
        moved += book.moved
        dropped += book.dropped
        empty += book.empty
        if book.stats["introductionLines"]:
            introductions[code] = {"lines": book.stats["introductionLines"], "words": book.introduction_words}
    if source.totals is not None and (totals["books"], totals["chapters"], totals["verses"]) != source.totals:
        raise ImportProblem(
            f"the zip holds {totals['books']} books, {totals['chapters']} chapters, {totals['verses']} verses; this importer expects "
            f"{source.totals[0]}, {source.totals[1]}, {source.totals[2]}"
        )

    index = {"books": index_books, "translation": TRANSLATION}
    files["index.json"] = dumps(index)
    manifest = {
        "books": entries,
        "dropped": {
            "blankLinesAtChapterEnd": stats["blankLinesAtChapterEnd"],
            "blankLinesAtChapterStart": stats["blankLinesAtChapterStart"],
            "bookHeaders": stats["bookHeaders"],
            "bookTitles": stats["bookTitles"],
            "chapterLabels": stats["chapterLabels"],
            "crossReferences": stats["crossReferences"],
            "footnotes": stats["footnotes"],
            "frontMatter": dropped_front,
            "headingsInTheMiddleOfAVerse": {"dropped": dropped, "movedToTheNextVerse": moved},
            "introductions": {
                "byBook": introductions,
                "lines": stats["introductionLines"],
                "words": sum(i["words"] for i in introductions.values()),
            },
            "references": stats["references"],
            "separatorLines": stats["separatorLines"],
            "strongsTags": stats["strongsTags"],
        },
        "emptyVerses": empty,
        "files": {"index.json": {"bytes": len(files["index.json"]), "sha256": sha256_hex(files["index.json"])}},
        "format": FORMAT,
        "generator": "tools/bible/import_webc.py",
        "kept": {"bookNames": stats["kept:bk"], "selah": stats["kept:qs"], "wordsOfJesus": stats["kept:wj"]},
        "source": {
            "bytes": zip_bytes,
            "date": source.date,
            "licencePage": {"file": LICENCE_PAGE, "sha256": sha256_hex(members[LICENCE_PAGE])},
            "sha256": zip_sha256,
            "url": source.url,
        },
        "totals": {"books": totals["books"], "bytes": totals["bytes"], "chapters": totals["chapters"], "verses": totals["verses"]},
        "translation": TRANSLATION,
    }
    files["manifest.json"] = dumps_readable(manifest)
    summary = f"{totals['books']} books, {totals['chapters']:,} chapters, {totals['verses']:,} verses, {totals['bytes']:,} bytes of JSON"
    return Build(files, generated_ts(source.order), summary)


# ---------------------------------------------------------------------------------------------------------------- the zip, the disk


def sha256_file(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def download(url: str, directory: pathlib.Path) -> pathlib.Path:
    request = urllib.request.Request(url, headers={"User-Agent": "CaminoPlus-bible-import (https://camino.plus)"})
    target = directory / "eng-web-c_usfm.zip"
    total = 0
    try:
        with urllib.request.urlopen(request, timeout=60) as response, open(target, "wb") as fh:
            for chunk in iter(lambda: response.read(1 << 16), b""):
                total += len(chunk)
                if total > MAX_ZIP_BYTES:
                    raise ImportProblem(f"{url} is bigger than {MAX_ZIP_BYTES:,} bytes: not the file this importer was written for")
                fh.write(chunk)
    except (urllib.error.URLError, OSError) as e:
        raise ImportProblem(f"could not download {url}: {e}") from None
    return target


def read_zip(path: pathlib.Path, sha256: str) -> tuple[dict[str, bytes], str, int]:
    """The files of the zip that matter, read into memory with limits. The zip is refused unless it is the pinned file."""
    try:
        size = path.stat().st_size
        if size <= MAX_ZIP_BYTES:
            digest = sha256_file(path)
    except OSError as e:
        raise ImportProblem(f"cannot read {path}: {e.strerror or e}") from None
    if size > MAX_ZIP_BYTES:
        raise ImportProblem(f"{path} is {size:,} bytes, more than {MAX_ZIP_BYTES:,}: not the file this importer was written for")
    if digest != sha256:
        raise ImportProblem(
            f"{path} is not the zip this importer is pinned to.\n  its sha256:    {digest}\n  pinned sha256: {sha256}\n"
            "If eBible.org published a new edition, read the section 'Bumping the pin' of tools/bible/README.md first."
        )
    members: dict[str, bytes] = {}
    try:
        with zipfile.ZipFile(path) as zf:
            infos = zf.infolist()
            if sum(i.file_size for i in infos) > MAX_TOTAL_BYTES:
                raise ImportProblem(f"{path} holds more than {MAX_TOTAL_BYTES:,} bytes once unpacked")
            for info in infos:
                name = info.filename
                if name.startswith("/") or "\\" in name or ".." in name.split("/"):
                    raise ImportProblem(f"{path} holds a file with an unsafe name: {name!r}")
                if info.is_dir() or not (USFM_NAME.match(name) or name == LICENCE_PAGE):
                    continue
                if info.file_size > MAX_MEMBER_BYTES:
                    raise ImportProblem(f"{name} is {info.file_size:,} bytes, more than {MAX_MEMBER_BYTES:,}")
                with zf.open(info) as fh:
                    data = fh.read(MAX_MEMBER_BYTES + 1)
                if len(data) > MAX_MEMBER_BYTES:
                    raise ImportProblem(f"{name} is more than {MAX_MEMBER_BYTES:,} bytes")
                members[name] = data
    except zipfile.BadZipFile as e:
        raise ImportProblem(f"{path} is not a readable zip: {e}") from None
    return members, digest, size


def differences(built: Build, out: pathlib.Path, ts_path: pathlib.Path) -> list[str]:
    """What is different between what the zip makes and what is on disk."""
    problems: list[str] = []
    for name, data in sorted(built.files.items()):
        path = out / name
        if not path.is_file():
            problems.append(f"missing: {path}")
        elif path.read_bytes() != data:
            problems.append(f"differs: {path}")
    if out.is_dir():
        for path in sorted(out.iterdir()):
            if path.name not in built.files:
                problems.append(f"not made by the importer: {path}")
    if not ts_path.is_file():
        problems.append(f"missing: {ts_path}")
    elif ts_path.read_bytes() != built.ts.encode("utf-8"):
        problems.append(f"differs: {ts_path}")
    return problems


def write(built: Build, out: pathlib.Path, ts_path: pathlib.Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    for stale in sorted(out.glob("*.json")):
        if stale.name not in built.files:
            stale.unlink()
            print(f"removed {stale}")
    for name, data in built.files.items():
        (out / name).write_bytes(data)
    ts_path.parent.mkdir(parents=True, exist_ok=True)
    ts_path.write_bytes(built.ts.encode("utf-8"))


def main(argv: list[str] | None = None, source: Source = PINNED) -> int:
    ap = argparse.ArgumentParser(description="World English Bible, Catholic edition: USFM zip to the JSON of the app.")
    ap.add_argument("--zip", type=pathlib.Path, help="a copy of the zip (default: download it from the pinned address into a fresh temporary folder)")
    ap.add_argument("--out", type=pathlib.Path, default=DEFAULT_OUT, help="where the JSON files go (default: mobile/assets/bible/webc)")
    ap.add_argument("--ts", type=pathlib.Path, default=DEFAULT_TS, help="where webc.generated.ts goes (default: next to text.ts)")
    ap.add_argument("--sha256", default=source.sha256, help="the hash the zip must have (default: the pinned one)")
    ap.add_argument("--check", action="store_true", help="write nothing; exit 1 if the files on disk are not what the zip makes")
    args = ap.parse_args(argv)
    if not re.fullmatch(r"[0-9a-f]{64}", args.sha256):
        print("import_webc: --sha256 must be 64 lower-case hex digits", file=sys.stderr)
        return 2
    scratch = None
    try:
        zip_path = args.zip
        if zip_path is None:
            scratch = pathlib.Path(tempfile.mkdtemp(prefix="webc-"))
            print(f"downloading {source.url}")
            zip_path = download(source.url, scratch)
        members, digest, size = read_zip(zip_path, args.sha256)
        built = build(members, digest, size, source)
    except ImportProblem as e:
        print(f"import_webc: {e}", file=sys.stderr)
        return 2
    finally:
        if scratch is not None:
            shutil.rmtree(scratch, ignore_errors=True)
    if args.check:
        problems = differences(built, args.out, args.ts)
        if problems:
            print("\n".join(problems[:20]) + (f"\n... and {len(problems) - 20} more" if len(problems) > 20 else ""))
            print("import_webc: the committed assets are not what the zip makes. Run tools/bible/import_webc.py and commit the result.", file=sys.stderr)
            return 1
        print(f"ok: the committed assets are exactly what the zip makes ({built.summary})")
        return 0
    write(built, args.out, args.ts)
    print(f"wrote {len(built.files)} files to {args.out} and {args.ts.name}: {built.summary}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
