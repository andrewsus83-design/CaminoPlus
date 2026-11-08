"""One recipe per book: where its text comes from, the sha256 the download must have, how front and back matter are cut, how
chapters and parts are found, and what is done with footnotes, poems and lists. The evidence for each licence verdict is in
tools/books/README.md; the facts that the app shows (credit line, translator) are here, next to the code that produced the text.

A recipe's parse function reads the raw lines of the download and fills a Collector. It must account for every block of the body:
a block that matches none of its rules is a BookError, never a silent drop.
"""
from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass
from typing import Callable

from books_build import Collector
from books_clean import RULE_LINE, Block, BookError, blocks_of, is_caps, join_heading, strip_markers, title_case

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
    basis: str                     # why the text may go in (or what is missing): the rule of the README applied to this book
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


# --------------------------------------------------------------------------------------------------------- the plain texts of CCEL
# CCEL's .txt files are made from its markup: sections are cut by a line of underscores, a heading stands at the left margin or centred, the
# paragraphs are indented by three spaces, footnotes ("[12] Ps. cxix. 93.") come after the last paragraph of a section, and their marks "[12]"
# stand in the text. Footnotes are dropped (counted), as in every book here.

def ccel_kind(b: Block, body: int = 3) -> str:
    """rule, foot (a footnote), head (a heading line) or body (text) for a block of a CCEL text."""
    if RULE_LINE.match(b.lines[0]):
        return "rule"
    flat = b.flat()
    if re.match(r"\[\d{1,3}\] ", flat) and b.indent == body:
        return "foot"
    if is_caps(flat) and len(flat.split()) <= 30:
        return "head"
    if b.indent != body and len(flat.split()) <= 30 and not flat.endswith((".", "?", "!", '"', ":", ";", ",")):
        return "head"
    return "body"


def ccel_footnotes(blocks: list[Block]) -> list[int]:
    return [int(re.match(r"\[(\d{1,3})\]", b.flat()).group(1)) for b in blocks]  # type: ignore[union-attr]


_EXERCISES_MARK = re.compile(r"\s*\[(\d{1,3})\]\s*")
_WEEK = re.compile(r"(FIRST|SECOND|THIRD|FOURTH) WEEK")
# Parts that are not weeks: a centred title with nothing under it, and the chapters that open a part of their own.
_PART_OF_TITLE = {"THREE METHODS OF PRAYER AND FIRST ON THE COMMANDMENTS": "Three Methods of Prayer"}
_MYSTERIES = "The Mysteries of the Life of Christ Our Lord"
_PART_BEFORE_CHAPTER = {"THE MYSTERIES OF THE LIFE OF CHRIST OUR LORD": _MYSTERIES, "RULES FOR PERCEIVING": "Rules"}


def heading_text(parts: list[str], centred: bool) -> str:
    """The title a heading cluster makes: when the first line is a centred title ("ANNOTATIONS") the lines under it are its subtitle, a sentence of
    its own; otherwise the lines run on into one another where the edition broke them."""
    if centred and len(parts) > 1 and not parts[1].upper().startswith(("FOR ", "AND ")):
        return parts[0].strip() + (" " if parts[1][:1].islower() else ". ") + join_heading(parts[1:])
    return join_heading(parts)


def parse_exercises(lines: list[str], first_no: int, out: Collector) -> None:
    """CCEL exercises.txt (Mullan, 1914). The text starts at ANNOTATIONS and stops before the GENERAL INDEX; the approbations, the preface, the
    general note and the contents before it are left out, and so are the index and the indexes of Scripture and of pages after it. The sections
    cut by the rules of the file are the chapters: a heading (one line or several) that stands right after a rule, or has a line at the left
    margin, opens one; any other heading is a heading inside a chapter. FIRST WEEK to FOURTH WEEK and the centred titles with nothing under
    them are parts. The textual notes of the translator ([1] to [42], e.g. "Offering is in St. Ignatius' handwriting") are dropped; a mark may
    stand at several places (the same note); the grid of the Particular Examen is six lines of the letter G, dropped and counted."""
    blocks = blocks_of(lines, first_no, isolate=RULE_LINE)
    i = start_at(blocks, out.book, lambda b: b.flat() == "ANNOTATIONS", "ANNOTATIONS")
    end = start_at(blocks, out.book, lambda b: b.flat() == "GENERAL INDEX", "GENERAL INDEX", i)
    items = [(ccel_kind(b), b) for b in blocks[i:end]]
    marks: list[int] = []
    notes: list[int] = []
    pending_title: str | None = None
    after_rule = True
    k = 0
    while k < len(items):
        kind, b = items[k]
        if kind == "rule":
            after_rule = True
            k += 1
        elif kind == "foot":
            notes.extend(ccel_footnotes([b]))
            k += 1
        elif kind == "head":
            # a cluster: the heading lines in a row; a line "FIRST WEEK" stands alone
            j = k + 1
            if not _WEEK.fullmatch(b.flat()):
                while j < len(items) and items[j][0] == "head" and not _WEEK.fullmatch(items[j][1].flat()):
                    j += 1
            cluster = [x for _, x in items[k:j]]
            centred = cluster[0].indent >= 18
            nxt = items[j][0] if j < len(items) else "rule"
            parts = [c.flat() for c in cluster]
            # a centred title cut in two by a rule ("RULES", then "FOR PERCEIVING ...") is one title
            if centred and nxt == "rule" and not _WEEK.fullmatch(parts[0]) and j + 1 < len(items) and items[j + 1][0] == "head":
                if items[j + 1][1].flat().split()[0].upper() in {"FOR", "AND", "OF", "TO"}:
                    more = j + 1
                    while more < len(items) and items[more][0] == "head":
                        parts.append(items[more][1].flat())
                        more += 1
                    j = more
                    nxt = items[j][0] if j < len(items) else "rule"
            text, found = strip_marks(out, heading_text(parts, centred), _EXERCISES_MARK)
            marks.extend(found)
            upper = text.upper().rstrip(".")
            if _WEEK.fullmatch(upper):
                out.part(title_case(text), cluster[0].no)
            elif centred and nxt == "rule" and upper in _PART_OF_TITLE:
                out.part(_PART_OF_TITLE[upper], cluster[0].no)
            elif centred and nxt == "rule" and upper.startswith("SPIRITUAL EXERCISES"):
                pending_title = title_case(parts[0]) + " " + strip_markers(" ".join(parts[1:]), _EXERCISES_MARK)[0]  # the formal title, over the Presupposition
            elif out.chapters and title_case(text) == out.chapters[-1].title:
                out.stats["repeated headings"] += 1  # CONTEMPLATION TO GAIN LOVE stands twice, over the note and over the text
            elif after_rule or any(c.indent == 0 for c in cluster) or centred or out._part == _MYSTERIES:
                for prefix, part in _PART_BEFORE_CHAPTER.items():
                    if upper.startswith(prefix):
                        out.part(part, cluster[0].no)
                out.chapter(title_case(text), cluster[0].no)
                if pending_title:
                    out.add("h", pending_title, cluster[0].no)
                    pending_title = None
            else:
                out.add("h", title_case(text), cluster[0].no)
            after_rule = False
            k = j
        else:
            if b.flat() == "G":  # the grid of letters that stands for the days of the Particular Examen
                out.stats["figure lines"] += 1
            else:
                marks.extend(out.paragraph(b, markers=_EXERCISES_MARK, allow_quote=True, base=3))
            after_rule = False
            k += 1
    # a note may be cited more than once ([7] stands at three places), but every note is cited and every mark has its note
    need(out, set(marks) == set(notes) and len(set(notes)) == len(notes), None, f"marks {sorted(set(marks))} and notes {sorted(notes)} do not match")
    out.stats["footnotes"] += len(notes)


def strip_marks(out: Collector, text: str, pattern: re.Pattern[str]) -> tuple[str, list[int]]:
    from books_clean import strip_markers, tidy

    cleaned, found = strip_markers(text, pattern)
    out.stats["footnote marks"] += len(found)
    return tidy(cleaned), found


_SHOUT = re.compile(r"^((?:\d{1,3}\. )?)([A-Z][A-Z'\u2019]+)(?= [a-z\"\u201c\u2018(])")


def unshout(text: str, stats: "Counter | None" = None) -> str:
    """The first word of a section is printed in capitals in some editions ("DEAR reader, I request you"): set it as an ordinary word."""
    m = _SHOUT.match(text)
    if m and len(m.group(2)) >= 2 and m.group(2) not in {"AMEN", "OF", "IN", "TO"}:
        if stats is not None:
            stats["first words set in lower case"] += 1
        return m.group(1) + m.group(2)[:1] + m.group(2)[1:].lower() + text[m.end():]
    return text


_SMALL = {"a", "an", "and", "as", "at", "by", "for", "from", "in", "of", "on", "or", "the", "to", "with"}


def subheading(flat: str) -> bool:
    """A short line of capitalised words that ends with a full stop and stands alone ("Preparation.", "Affections and Resolutions.") is a
    heading inside a chapter, as the edition sets it: a few words, no digit, each word that is not a small connecting word capitalised."""
    words = flat.split()
    return (1 <= len(words) <= 6 and flat.endswith(".") and not any(ch.isdigit() for ch in flat) and flat != "Amen."
            and all(w[:1].isupper() or w.lower().strip(".,") in _SMALL for w in words))


def split_points(text: str) -> list[str]:
    """"1. Place yourself ... 2. Ask Him ..." in one paragraph is two points: split where the numbers run on from each other, else keep it whole."""
    parts = re.split(r"(?<=[.!?;:)\u201d\"\u2019]) (?=\d{1,2}\. )", text)
    nums = [re.match(r"(\d{1,2})\. ", p) for p in parts]
    if len(parts) > 1 and all(nums):
        values = [int(m.group(1)) for m in nums if m]
        if values == list(range(values[0], values[0] + len(values))):
            return parts
    return [text]


def ccel_paragraph(out: Collector, b: Block, marks: list[int], pattern: re.Pattern[str]) -> None:
    """A paragraph of a CCEL text (indented by three): footnote marks out, a first word in capitals set as a word, a short heading line of the
    edition set as a heading (without its full stop), and a paragraph that runs several numbered points together ("1. ... 2. ...") split into
    one list point (li) each. A single numbered paragraph stays a paragraph, with its number."""
    flat = b.flat()
    if len(b.lines) == 1 and subheading(flat):
        out.add("h", flat[:-1], b.no)
        return
    before = len(out.chapters[-1].blocks) if out.chapters else 0
    marks.extend(out.paragraph(b, markers=pattern, allow_quote=True, base=3))
    if out.chapters and len(out.chapters[-1].blocks) > before:
        blk = out.chapters[-1].blocks[-1]
        if blk["k"] == "p":
            blk["t"] = unshout(blk["t"], out.stats)
            points = split_points(blk["t"])
            if len(points) > 1:
                out.chapters[-1].blocks[-1:] = [{"k": "li", "t": t} for t in points]
                out.stats["points split"] += len(points) - 1


_DEVOUT_MARK = re.compile(r"\s*\[(\d{1,3})\]\s*")


def parse_devout_life(lines: list[str], first_no: int, out: Collector) -> None:
    """CCEL devout_life.txt (the translation of Rivingtons, 1876). Left out: the title lines, the contents (with the five long headings of the
    parts, which come again where each part starts), the index of the printed edition and everything after it. The Preface by the Author is the
    first chapter; then five parts ("PART I. ..." gives `part`), each with chapters ("CHAPTER I. What true Devotion is."). The footnotes of the
    edition ([1] to about 540, one block or more after a rule) are dropped, with their marks; the first word of a section, printed in capitals,
    is set as an ordinary word."""
    blocks = blocks_of(lines, first_no, isolate=RULE_LINE)
    i0 = start_at(blocks, out.book, lambda b: b.flat() == "Preface by the Author", "Preface by the Author")
    i1 = start_at(blocks, out.book, lambda b: b.flat() == "CONTENTS.", "CONTENTS.", i0)
    i2 = start_at(blocks, out.book, lambda b: b.flat().startswith("PART I. COUNSELS AND PRACTICES"), "PART I.", i1)
    end = start_at(blocks, out.book, lambda b: b.flat() == "INDEX." and b.indent == 0, "INDEX.", i2)
    marks: list[int] = []
    notes: list[int] = []
    for span in (blocks[i0:i1], blocks[i2:end]):
        in_notes = False
        for b in span:
            kind = ccel_kind(b)
            flat = b.flat()
            m_part = re.match(r"PART ([IVXL]+)\. (.+)", flat)
            m_chap = re.match(r"CHAPTER ([IVXL]+)\. (.+)", flat)
            if kind == "rule":
                in_notes = False
            elif kind == "foot":
                in_notes = True
                notes.extend(ccel_footnotes([b]))
            elif in_notes:
                out.stats["footnote lines"] += 1  # a footnote of more than one paragraph
            elif b.indent == 0 and flat == "Preface by the Author":
                out.chapter(flat, b.no)
            elif m_part and is_caps(m_part.group(2)):
                out.part(f"Part {m_part.group(1)}. {title_case(m_part.group(2))}", b.no)
            elif m_chap and b.indent == 0:
                title, found = strip_marks(out, m_chap.group(2), _DEVOUT_MARK)
                marks.extend(found)
                out.chapter(f"Chapter {m_chap.group(1)}. {title_case(title)}", b.no)
            else:
                ccel_paragraph(out, b, marks, _DEVOUT_MARK)
    need(out, set(marks) == set(notes) and len(set(notes)) == len(notes), None, f"{len(set(marks))} marks and {len(notes)} notes do not match: {sorted(set(marks) ^ set(notes))[:10]}")
    out.stats["footnotes"] += len(notes)


def parse_dialogue(lines: list[str], first_no: int, out: Collector) -> None:
    """CCEL dialog.txt (Thorold's translation, the abridged edition of 1907). Left out: the title pages, the contents and the long introduction
    by the translator (dated Viareggio, September 1906). Four treatises ("A TREATISE OF DIVINE PROVIDENCE" at the left margin gives `part`);
    each chapter of the edition is a heading of its own, indented by six (the argument of the chapter, as the edition prints it; the chapter
    numbers are not in the file), over one long paragraph or several. The last chapter is the letter of Ser Barduccio Canigiani on her
    death. The notes and indexes of the printed edition are not in the file."""
    blocks = blocks_of(lines, first_no, isolate=RULE_LINE)
    i = start_at(blocks, out.book, lambda b: b.flat() == "A TREATISE OF DIVINE PROVIDENCE" and b.indent == 0, "A TREATISE OF DIVINE PROVIDENCE")
    end = start_at(blocks, out.book, lambda b: b.flat().startswith("This document is from the Christian Classics Ethereal"), "the CCEL footer", i)
    for b in blocks[i:end]:
        flat = b.flat()
        if RULE_LINE.match(b.lines[0]):
            continue
        if b.indent == 0 and is_caps(flat):
            out.part(title_case(flat), b.no)
        elif b.indent == 6:
            out.chapter(flat, b.no)
        else:
            ccel_paragraph(out, b, [], re.compile(r"(?!x)x"))


PG = "https://www.gutenberg.org/ebooks/"
PG_RAW = "https://www.gutenberg.org/cache/epub/"

RECIPES: tuple[Recipe, ...] = (
    Recipe(
        id="imitation-of-christ", title="The Imitation of Christ", author="Thomas à Kempis", translator="William Benham", translator_died=1910,
        translator_source=PG + "1653", first_published=1874,
        edition="William Benham's translation (London: Macmillan, 1874), the text of Gutenberg ebook 1653",
        source=PG + "1653", raw_url=PG_RAW + "1653/pg1653.txt", raw_file="pg1653.txt", raw_kind="gutenberg",
        raw_sha256="7e9f72139575c267b0e65dd1c9665cc8541a289538fda4cff370dedd0cc83a74",
        basis="translator died 1910 (after 1955 is the limit), translation first published 1874 (1930 is the limit)", verdict=PD, why_not="",
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
        raw_sha256="ef3fa6267968c875def9091a1882d14b525a85bbf6996a3e2f130a775b2e22d2",
        basis="translator died 1882, translation first published 1838", verdict=PD, why_not="",
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
        raw_sha256="3420485ba9b861cc44ac80833e3d9864683784e93e0f68f6ba5fc44c407a33bc",
        basis="translator died 1895 and the editor whose notes and introduction are left out died 1937, translation first published 1870", verdict=PD, why_not="",
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
        id="spiritual-exercises", title="The Spiritual Exercises", author="Ignatius of Loyola", translator="Elder Mullan", translator_died=1925,
        translator_source="https://onlinebooks.library.upenn.edu/webbin/book/lookupname?key=Mullan%2C%20Elder%2C%201865%2D1925", first_published=1914,
        edition="Elder Mullan's translation from the Spanish autograph (New York: P. J. Kenedy & Sons, 1914; the preface is dated 1909), the text of CCEL",
        source="https://ccel.org/ccel/ignatius/exercises", raw_url="https://ccel.org/ccel/i/ignatius/exercises/cache/exercises.txt", raw_file="exercises.txt",
        raw_kind="plain", raw_sha256="a2914792b4234cd61e5aaf2ea774aa652d226ebeb4caea347a36c2ddf7d6ffcb",
        basis="translator died 1925, translation published 1914 (copyright notice and imprimaturs of 1914)", verdict=PD, why_not="",
        credit="The Spiritual Exercises of St. Ignatius of Loyola. Translated from the Spanish autograph by Elder Mullan, S.J. (1865–1925), "
               "New York 1914. Text from ccel.org/ccel/ignatius/exercises, cleaned for this app (the approbations, the preface, the translator's "
               "textual notes and the indexes are left out). Public domain.",
        chapters=88,
        dropped=("approbations, preface and general note of the edition, the prayer of Father Diertins, contents",
                 "the translator's textual notes (42, e.g. \"Offering is in St. Ignatius' handwriting\")", "the general index and the indexes of Scripture and pages",
                 "the grid of six letters G that stands for the days of the Particular Examen"),
        parse=parse_exercises,
    ),
    Recipe(
        id="devout-life", title="Introduction to the Devout Life", author="Francis de Sales", translator=None, translator_died=None,
        translator_source="https://archive.org/details/introductiontod00salegoog", first_published=1876,
        edition="\"A New Translation\" in the Library of Spiritual Works for English Catholics (London, Oxford and Cambridge: Rivingtons, 1876), the text of CCEL",
        source="https://ccel.org/ccel/desales/devout_life", raw_url="https://ccel.org/ccel/d/desales/devout_life/cache/devout_life.txt", raw_file="devout_life.txt",
        raw_kind="plain", raw_sha256="72a199c7f1b656efc22c53ef67cd11df4573067cda3ba38191cd1b4156a903b4",
        basis="the translator is not named on the title page of the edition of 1876 (anonymous, and the edition is older than 1900)", verdict=PD, why_not="",
        credit="Introduction to the Devout Life by Francis de Sales. \"A New Translation\", the translator not named, first published by Rivingtons, "
               "London, 1876. Text from ccel.org/ccel/desales/devout_life, cleaned for this app (the footnotes and the index are left out). Public domain.",
        chapters=120,
        dropped=("title lines, contents", "footnotes (213: the translator's and editor's notes)", "the index and everything after it"),
        parse=parse_devout_life,
    ),
    Recipe(
        id="dialogue-of-st-catherine", title="The Dialogue of Saint Catherine of Siena", author="Catherine of Siena", translator="Algar Thorold",
        translator_died=1936,
        translator_source="https://onlinebooks.library.upenn.edu/webbin/book/lookupname?key=Thorold%2C%20Algar%2C%201866%2D1936", first_published=1896,
        edition="Algar Thorold's translation, the new and abridged edition (London: Kegan Paul, Trench, Trübner, 1907; the full translation appeared in 1896), the text of CCEL",
        source="https://ccel.org/ccel/catherine/dialog", raw_url="https://ccel.org/ccel/c/catherine/dialog/cache/dialog.txt", raw_file="dialog.txt",
        raw_kind="plain", raw_sha256="79c7374b4ba14986017f343d1401e9fbff269f54e2f306f3d94922019a662546",
        basis="translator died 1936, translation first published 1896 (the Spectator reviewed it on 24 October 1896)", verdict=PD, why_not="",
        credit="The Dialogue of St. Catherine of Siena. Translated by Algar Thorold (1866–1936), first published 1896; the new and abridged edition of "
               "1907. Text from ccel.org/ccel/catherine/dialog, cleaned for this app (the translator's introduction is left out). Public domain.",
        chapters=94,
        dropped=("title pages and contents", "the translator's long introduction (dated 1906)", "the chapters that the abridged edition of 1907 does not have"),
        parse=parse_dialogue,
    ),
    Recipe(
        id="abandonment-to-providence", title="Abandonment to Divine Providence", author="Jean-Pierre de Caussade", translator="Ella McMahon",
        translator_died=None, translator_source="https://onlinebooks.library.upenn.edu/webbin/who/McMahon%2c%20Ella", first_published=1887,
        edition="Ella McMahon's translation of the eighth French edition, revised by H. Ramière (New York: Benziger Brothers, 1887), the text of Gutenberg ebook 52057",
        source=PG + "52057", raw_url=PG_RAW + "52057/pg52057.txt", raw_file="pg52057.txt", raw_kind="gutenberg",
        raw_sha256="6c157eaaae913f11e814d61bc78c303f44644c535456acfdb0fadfa30f5c2b23",
        basis="first published 1887, but the death year of the translator is not known", verdict="unclear",
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
)
