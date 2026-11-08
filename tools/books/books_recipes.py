"""One recipe per book: where its text comes from, the sha256 the download must have, how front and back matter are cut, how
chapters and parts are found, and what is done with footnotes, poems and lists. The evidence for each licence verdict is in
tools/books/README.md; the facts that the app shows (credit line, translator) are here, next to the code that produced the text.

A recipe's parse function reads the raw lines of the download and fills a Collector. It must account for every block of the body:
a block that matches none of its rules is a BookError, never a silent drop.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Callable

from books_build import Collector
from books_clean import Block, BookError, blocks_of, title_case

PD = "public domain everywhere"

# The twelve books of mobile/src/features/library/books/catalog.ts, in the order of the catalogue. The index of the app follows it.
CATALOGUE_ORDER = (
    "way-of-a-pilgrim", "life-of-st-teresa", "little-flowers", "dark-night", "interior-castle", "spiritual-exercises",
    "imitation-of-christ", "devout-life", "abandonment-to-providence", "confessions", "dialogue-of-st-catherine", "story-of-a-soul",
)

Parse = Callable[[list[str], int, Collector], None]


@dataclass(frozen=True)
class Recipe:
    id: str
    title: str
    author: str
    translator: str | None
    translator_died: int | None    # None when it could not be found
    translator_source: str         # the page where the translator's dates were read
    first_published: int           # the year this translation first appeared
    edition: str                   # the edition the text was taken from
    source: str                    # a page where the edition can be read
    raw_url: str                   # the file that is downloaded
    raw_file: str                  # its name inside --raw-dir
    raw_kind: str                  # "gutenberg" (the text between the START and END marks is parsed) or "plain"
    raw_sha256: str
    verdict: str                   # PD, "US only" or "unclear": only PD books are written
    why_not: str                   # for a book that is not PD: why, in one or two sentences
    credit: str                    # the line the reader and the licences screen print
    chapters: int                  # how many chapters the text must have: a mismatch is a hard error
    dropped: tuple[str, ...]       # what the recipe leaves out of the edition, in words
    parse: Parse


@dataclass(frozen=True)
class Left:
    """A book of the catalogue that has no recipe: no edition could be used. `why` says why, in one or two sentences."""

    id: str
    verdict: str
    why: str


# --------------------------------------------------------------------------------------------------------------- shared pieces

def numbered(block: Block) -> int | None:
    """The number a paragraph starts with ("12. Then ..."), or None."""
    m = re.match(r"(\d{1,3})\. ", block.lines[0].strip())
    return int(m.group(1)) if m else None


def need(out: Collector, ok: bool, line: int | None, message: str) -> None:
    if not ok:
        raise BookError(out.book, line, message)


def start_at(blocks: list[Block], book: str, accept: Callable[[Block], bool], what: str, after: int = 0) -> int:
    """The index of the first block from `after` on that `accept` takes; the text is not what the recipe expects if there is none."""
    for i in range(after, len(blocks)):
        if accept(blocks[i]):
            return i
    raise BookError(book, None, f"the start or end of the text ({what}) was not found")


# ------------------------------------------------------------------------------------------------------ The Imitation of Christ

_IMITATION_MARK = re.compile(r"\s*\((\d{1,2})\)\s*")
_IMITATION_BOOKS = {"FIRST": "First", "SECOND": "Second", "THIRD": "Third", "FOURTH": "Fourth"}


def parse_imitation(body: list[str], first_no: int, out: Collector) -> None:
    """Gutenberg 1653. After a contents list and a short introductory note (both left out) come four books ("THE FIRST BOOK" and its
    title on two lines), each with chapters ("CHAPTER I", then the title, then paragraphs numbered 2., 3., ...). Footnotes are marked
    (1) in the text and gathered in one paragraph "(1) John viii. 12. (2) ..." at the end of the chapter: they are dropped."""
    blocks = blocks_of(body, first_no)
    is_part = lambda b: re.fullmatch(r"THE (FIRST|SECOND|THIRD|FOURTH) BOOK\n[^\n]+", b.text) is not None  # noqa: E731
    i = start_at(blocks, out.book, is_part, "THE FIRST BOOK")
    state = "body"
    marks: list[int] = []
    notes: list[int] = []

    def close_chapter(line: int) -> None:
        if out.chapters:
            need(out, sorted(marks) == list(range(1, len(notes) + 1)) and notes == list(range(1, len(notes) + 1)), line,
                 f"footnote marks {marks} and notes {notes} of {out.chapters[-1].title!r} do not match")
            out.stats["footnotes"] += len(notes)
        marks.clear()
        notes.clear()

    for b in blocks[i:]:
        flat = b.flat()
        if is_part(b):
            close_chapter(b.no)
            word, title = b.lines[0].split()[1], b.lines[1].strip()
            out.part(f"The {_IMITATION_BOOKS[word]} Book. {title_case(title)}", b.no)
            state = "body"
            continue
        m = re.fullmatch(r"CHAPTER ([IVXLC]+)", b.text)
        if m:
            close_chapter(b.no)
            state = "title:" + m.group(1)
            continue
        if state.startswith("title:"):
            out.chapter(f"Chapter {state[6:]}. {flat}", b.no)
            state = "body"
            continue
        if state == "notes" or (state == "body" and flat.startswith("(1) ")):
            state = "notes"
            found = [int(n) for n in re.findall(r"(?:^|(?<=\s))\((\d{1,2})\) ", flat)]
            notes.extend(found)
            continue
        if len(b.lines) == 1 and (re.fullmatch(r"The Voice of [A-Za-z ]+", flat) or re.fullmatch(r"A PRAYER [A-Z\u2019' ]+", flat)):
            out.add("h", title_case(flat), b.no)  # a heading inside a chapter: "The Voice of Christ", "A PRAYER FOR ..."
            continue
        marks.extend(out.paragraph(b, markers=_IMITATION_MARK, allow_quote=False))
    close_chapter(0)


# ---------------------------------------------------------------------------------------------------------------- Confessions

def parse_confessions(body: list[str], first_no: int, out: Collector) -> None:
    """Gutenberg 3296 (Pusey). Thirteen books, each headed "BOOK I" and not divided into chapters in this edition: a book is a chapter.
    The title page before BOOK I is left out. There are no footnotes; the few indented blocks are verse (a line of Terence, a hymn of
    Ambrose) and keep their lines, and the closing line GRATIAS TIBI DOMINE is set in title case."""
    blocks = blocks_of(body, first_no)
    i = start_at(blocks, out.book, lambda b: b.text == "BOOK I", "BOOK I")
    for b in blocks[i:]:
        m = re.fullmatch(r"BOOK ([IVX]+)", b.text)
        if m:
            out.chapter(f"Book {m.group(1)}", b.no)
        elif b.indent >= 2 and b.flat() == "GRATIAS TIBI DOMINE":
            out.add("q", title_case(b.flat()), b.no)
        else:
            out.paragraph(b, verse=True)


# --------------------------------------------------------------------------------------------------------- Life of St. Teresa

_LIFE_MARK = re.compile(r"\s*\[(\d{1,2})\]\s*")
LIFE_HEADINGS = 41  # the Prologue and chapters I to XL


def parse_life_of_teresa(body: list[str], first_no: int, out: Collector) -> None:
    """Gutenberg 8120 (Lewis, third edition 1904). Left out: the title pages, the introductions, the contents, the arguments of the
    chapters, the Relations and the index. The Life is the Prologue and chapters I to XL; each is headed "Chapter I." with its argument
    on the next lines (kept in the title), paragraphs are numbered "1." and the footnotes (marked [1]) come after the last paragraph as
    "1. ...": they are dropped, with the label NOTES that stands over them in one chapter."""
    blocks = blocks_of(body, first_no)
    i = start_at(blocks, out.book, lambda b: b.text == "Prologue.", "Prologue.")
    end = start_at(blocks, out.book, lambda b: b.text.startswith("The\nRelations or Manifestations"), "The Relations or Manifestations", i)
    text = blocks[i:end]
    heads = [(m, b) for b in text if (m := re.fullmatch(r"(Prologue|Chapter ([IVXL]+))\.", b.text))]
    need(out, len(heads) == LIFE_HEADINGS, None, f"expected the Prologue and {LIFE_HEADINGS - 1} chapters, found {len(heads)} headings")
    for k, (m, head) in enumerate(heads):
        stop = heads[k + 1][1].no if k + 1 < len(heads) else None
        mine = [b for b in text if head.no < b.no and (stop is None or b.no < stop)]
        name = m.group(1)
        if name == "Prologue":
            title, rest = name, mine
        else:
            # the argument is one block or two (a blank line stands in the middle of the title of chapter XXXI): up to paragraph 1.
            n = next((j for j, b in enumerate(mine) if numbered(b) == 1), 0)
            need(out, 1 <= n <= 2, head.no, f"{name}: the title and paragraph 1. were not found where expected")
            title = f"{name}. " + " ".join(title_case(b.flat()) for b in mine[:n])
            rest = mine[n:]
        out.chapter(title, head.no)
        # The footnotes start at the first later block that begins "1. " (or at the label NOTES). The Prologue has no numbered paragraphs.
        cut = len(rest)
        seen_one = name == "Prologue"
        for j, b in enumerate(rest):
            if b.text == "NOTES" or (numbered(b) == 1 and seen_one):
                cut = j
                break
            seen_one = seen_one or numbered(b) == 1
        marks: list[int] = []
        for b in rest[:cut]:
            if b.text == "I.H.S.":  # the monogram that heads the letter at the end of the Life
                out.add("q", b.text, b.no)
                continue
            marks.extend(out.paragraph(b, markers=_LIFE_MARK, allow_quote=False))
        notes = [n for b in rest[cut:] if (n := numbered(b)) is not None]
        need(out, sorted(marks) == notes == list(range(1, len(notes) + 1)), head.no,
             f"footnote marks {sorted(marks)} and notes {notes} of {name} do not match")
        out.stats["footnotes"] += len(notes)


# ------------------------------------------------------------------------------------------------------------- Abandonment

def parse_abandonment(body: list[str], first_no: int, out: Collector) -> None:
    """Gutenberg 52057 (McMahon, 1887). Left out: the title page, the long preface by the editor, the contents and the appendix. The text is
    three books ("Book First." and its title), each with chapters ("_CHAPTER I._" and its title); rows of asterisks are breaks."""
    blocks = blocks_of(body, first_no)
    i = start_at(blocks, out.book, lambda b: b.text.startswith("Book First.\n") or b.text == "Book First.", "Book First.")
    end = start_at(blocks, out.book, lambda b: b.flat().startswith("APPENDIX"), "APPENDIX", i)
    state = "body"
    pending_part: str | None = None
    for b in blocks[i:end]:
        flat = b.flat()
        m = re.fullmatch(r"Book (First|Second|Third)\.", flat)
        if m:
            pending_part = f"Book {m.group(1)}."
            state = "part"
            continue
        if state == "part":
            out.part(f"{pending_part} {flat}", b.no)
            state = "body"
            continue
        m = re.fullmatch(r"_?CHAPTER ([IVXL]+)\.?_?", flat)
        if m:
            state = "title:" + m.group(1)
            continue
        if state.startswith("title:"):
            out.chapter(f"Chapter {state[6:]}. {flat}", b.no)
            state = "body"
            continue
        out.paragraph(b, allow_quote=True)


PG = "https://www.gutenberg.org/ebooks/"
PG_RAW = "https://www.gutenberg.org/cache/epub/"

RECIPES: tuple[Recipe, ...] = (
    Recipe(
        id="imitation-of-christ", title="The Imitation of Christ", author="Thomas à Kempis", translator="William Benham", translator_died=1910,
        translator_source=PG + "1653", first_published=1874,
        edition="William Benham's translation (London: Macmillan, 1874), the text of Gutenberg ebook 1653",
        source=PG + "1653", raw_url=PG_RAW + "1653/pg1653.txt", raw_file="pg1653.txt", raw_kind="gutenberg",
        raw_sha256="7e9f72139575c267b0e65dd1c9665cc8541a289538fda4cff370dedd0cc83a74", verdict=PD, why_not="",
        credit="The Imitation of Christ by Thomas à Kempis. Translated by William Benham (1831–1910), first published 1874. Text from "
               "gutenberg.org/ebooks/1653, cleaned for this app (the introductory note and the Bible references in the footnotes are left out). Public domain.",
        chapters=114,
        dropped=("contents list", "introductory note of the edition", "footnotes (Bible references, one paragraph at the end of a chapter)"),
        parse=parse_imitation,
    ),
    Recipe(
        id="confessions", title="Confessions", author="Augustine of Hippo", translator="E. B. Pusey", translator_died=1882,
        translator_source=PG + "3296", first_published=1838,
        edition="E. B. Pusey's translation (Oxford: Parker, 1838; Library of the Fathers), the text of Gutenberg ebook 3296",
        source=PG + "3296", raw_url=PG_RAW + "3296/pg3296.txt", raw_file="pg3296.txt", raw_kind="gutenberg",
        raw_sha256="ef3fa6267968c875def9091a1882d14b525a85bbf6996a3e2f130a775b2e22d2", verdict=PD, why_not="",
        credit="The Confessions of St. Augustine. Translated by E. B. Pusey (1800–1882), first published 1838. Text from "
               "gutenberg.org/ebooks/3296, cleaned for this app (the title page is left out). Public domain.",
        chapters=13, dropped=("title page",),
        parse=parse_confessions,
    ),
    Recipe(
        id="life-of-st-teresa", title="The Life of St. Teresa of Jesus", author="Teresa of Ávila", translator="David Lewis", translator_died=1895,
        translator_source=PG + "8120", first_published=1870,
        edition="David Lewis's translation, third edition with additional notes by Benedict Zimmerman (London: Thomas Baker, 1904), the text of Gutenberg ebook 8120",
        source=PG + "8120", raw_url=PG_RAW + "8120/pg8120.txt", raw_file="pg8120.txt", raw_kind="gutenberg",
        raw_sha256="3420485ba9b861cc44ac80833e3d9864683784e93e0f68f6ba5fc44c407a33bc", verdict=PD, why_not="",
        credit="The Life of St. Teresa of Jesus, written by herself. Translated by David Lewis (1814–1895), first published 1870; the third "
               "edition of 1904. Text from gutenberg.org/ebooks/8120, cleaned for this app (the introductions, the footnotes, the Relations and "
               "the index are left out). Public domain.",
        chapters=41,
        dropped=("title pages, contents, annals of the saint's life and the arguments of the chapters",
                 "preface by David Lewis and introduction by Benedict Zimmerman",
                 "footnotes (the translator's and the editor's notes at the end of each chapter)",
                 "the eleven Relations that follow the Life", "index"),
        parse=parse_life_of_teresa,
    ),
    Recipe(
        id="abandonment-to-providence", title="Abandonment to Divine Providence", author="Jean-Pierre de Caussade", translator="Ella McMahon",
        translator_died=None, translator_source="https://onlinebooks.library.upenn.edu/webbin/who/McMahon%2c%20Ella", first_published=1887,
        edition="Ella McMahon's translation of the eighth French edition, revised by H. Ramière (New York: Benziger Brothers, 1887), the text of Gutenberg ebook 52057",
        source=PG + "52057", raw_url=PG_RAW + "52057/pg52057.txt", raw_file="pg52057.txt", raw_kind="gutenberg",
        raw_sha256="6c157eaaae913f11e814d61bc78c303f44644c535456acfdb0fadfa30f5c2b23", verdict="unclear",
        why_not="Published in 1887, so public domain in the US, but no source gives the death year of the translator, Ella McMahon (the catalogues "
                "of Gutenberg, the Online Books Page and the Library of Congress list her with no dates), and the one namesake with dates, the "
                "novelist Ella MacMahon (1864-1956), is another person according to the Ricorso reference: if the translator turned out to have "
                "died after 1955 the text would still be protected in countries with life plus 70 years.",
        credit="Abandonment to Divine Providence by Jean-Pierre de Caussade. Translated by Ella McMahon, first published 1887. Text from "
               "gutenberg.org/ebooks/52057, cleaned for this app (the editor's preface and the appendix are left out).",
        chapters=33,
        dropped=("title page, contents", "the long preface by the editor, H. Ramière", "the appendix (five pieces by other authors)"),
        parse=parse_abandonment,
    ),
)

LEFT_OUT: tuple[Left, ...] = (
    Left("way-of-a-pilgrim", "US only",
         "The only English translation found, by the Revd R. M. French (first impression September 1930, Philip Allan; on CCEL), is public domain in "
         "the US since 1 January 2026, but the translator, Reginald Michael French, died in 1969 according to CCEL and the library catalogues (1961 "
         "according to LibraryThing): after 1955, so it is protected in countries with life plus 70 years."),
    Left("story-of-a-soul", "US only",
         "The translation on Gutenberg (ebook 16772) is by Thomas N. Taylor (1873-1963), published in 1912: public domain in the US, but the "
         "translator died in 1963, so it is protected in countries with life plus 70 years until the end of 2033."),
    Left("little-flowers", "unclear", "Edition still being researched at this checkpoint."),
    Left("dark-night", "unclear", "Edition still being researched at this checkpoint."),
    Left("interior-castle", "unclear", "Edition still being researched at this checkpoint."),
    Left("spiritual-exercises", "unclear", "Edition still being researched at this checkpoint."),
    Left("devout-life", "unclear", "Edition still being researched at this checkpoint."),
    Left("dialogue-of-st-catherine", "unclear", "Edition still being researched at this checkpoint."),
)
