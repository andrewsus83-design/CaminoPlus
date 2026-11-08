"""Generic cleaning of plain-text editions into the blocks of a BookText (see tools/books/README.md).

Nothing here reads a file or the network: the functions take lines of text and give blocks. The recipes (books_recipes.py) say which
rule applies where; this module is the rules. Every rule that can lose or garble text raises BookError, which names the book and the
raw line, so nothing is dropped silently.
"""
from __future__ import annotations

import re
import unicodedata
from collections import Counter
from dataclasses import dataclass


class BookError(Exception):
    """A text did not look the way its recipe expects. The message names the book and, when known, the raw line."""

    def __init__(self, book: str, line: int | None, message: str):
        self.book, self.line, self.message = book, line, message
        super().__init__(f"{book}: line {line}: {message}" if line else f"{book}: {message}")


@dataclass(frozen=True)
class Block:
    """Lines of the raw text between blank lines. `no` is the raw line number of the first line (1-based)."""

    no: int
    lines: tuple[str, ...]
    gap: int  # blank lines before it

    @property
    def text(self) -> str:
        return "\n".join(self.lines)

    @property
    def indent(self) -> int:
        return min(len(line) - len(line.lstrip(" ")) for line in self.lines)

    def flat(self) -> str:
        """The lines stripped and joined with one space, nothing else changed."""
        return " ".join(line.strip() for line in self.lines)


def decode(raw: bytes) -> list[str]:
    """UTF-8 bytes to right-stripped lines (a BOM and CR LF line ends are handled; a form feed is a hard error: it is a page break)."""
    text = raw.decode("utf-8")
    if text.startswith("\ufeff"):
        text = text[1:]
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    return [line.rstrip() for line in text.split("\n")]


RULE_LINE = re.compile(r"^\s*_{20,}\s*$")  # the horizontal rule of the plain-text files of CCEL


def blocks_of(lines: list[str], first_no: int = 1, isolate: re.Pattern[str] | None = None) -> list[Block]:
    """Split lines into blocks at blank lines. `first_no` is the raw line number of lines[0]. A line that matches `isolate` is a block of its
    own, with or without blank lines around it (the rules of the CCEL files stand right under the last line of a section)."""
    blocks: list[Block] = []
    cur: list[str] = []
    start = first_no
    gap = 0
    pending_gap = 0
    for i, line in enumerate(lines):
        if isolate is not None and isolate.match(line):
            if cur:
                blocks.append(Block(start, tuple(cur), pending_gap))
                cur = []
            blocks.append(Block(first_no + i, (line,), gap))
            gap = 0
        elif line.strip():
            if not cur:
                start = first_no + i
                pending_gap = gap
            cur.append(line)
            gap = 0
        else:
            if cur:
                blocks.append(Block(start, tuple(cur), pending_gap))
                cur = []
            gap += 1
    if cur:
        blocks.append(Block(start, tuple(cur), pending_gap))
    return blocks


def gutenberg_body(lines: list[str]) -> tuple[list[str], int]:
    """The lines between the START and END marks of a Project Gutenberg text, and the raw line number of the first of them."""
    starts = [i for i, line in enumerate(lines) if line.startswith("*** START OF")]
    ends = [i for i, line in enumerate(lines) if line.startswith("*** END OF")]
    if len(starts) != 1 or len(ends) != 1 or starts[0] > ends[0]:
        raise BookError("gutenberg", None, f"expected one START and one END mark, found {len(starts)} and {len(ends)}")
    return lines[starts[0] + 1:ends[0]], starts[0] + 2


# ---------------------------------------------------------------------------------------------------------------- text of a block

_ITALIC = re.compile(r"_([^_]+)_")
_SMALL_WORDS = {"a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "into", "nor", "of", "on", "or", "the", "to", "with"}
_ROMAN = re.compile(r"^[IVXLCDM]+$")


def unwrap(lines: list[str] | tuple[str, ...], stats: Counter | None = None) -> str:
    """Join the hard-wrapped lines of one paragraph. A hyphen at the end of a line stays and the next word is glued to it ("seed-" and
    "plots" make "seed-plots"); a dash made of two hyphens that touches a word is glued on that side ("she--" and "began" make "she--began",
    but a dash with a space before it keeps the space)."""
    out = ""
    for raw in lines:
        s = raw.strip()
        if not s:
            continue
        if not out:
            out = s
        elif (out.endswith("--") and not out.endswith(" --")) or (s.startswith("--") and not out.endswith(" ")):
            out += s
        elif out.endswith("-") and not out.endswith("--") and out[-2:-1].isalpha() and s[:1].islower():
            out += s
            if stats is not None:
                stats["hyphen joins"] += 1
        else:
            out += " " + s
    return out


def tidy(text: str, *, italics: bool = True) -> str:
    """One paragraph, one line: no-break spaces and runs of spaces become one space, "--" and "---" become an em dash, the _underscores_ the
    plain-text editions use for italics are removed (the words stay), and the text is in Unicode normal form."""
    t = unicodedata.normalize("NFC", text.replace("\u00a0", " ").replace("\t", " "))
    if italics:
        t = _ITALIC.sub(r"\1", t)
    t = re.sub(r"(?<!-)-{2,3}(?!-)", "\u2014", t)  # "--" and "---" are dashes; a longer run is not (the blank lines of a form)
    t = re.sub(r" {2,}", " ", t)
    return t.strip()


def strip_markers(text: str, pattern: re.Pattern[str]) -> tuple[str, list[int]]:
    """Remove the footnote marks the pattern finds (group 1 is the number, and the pattern takes the spaces around the mark) and return
    the numbers in the order they stood. A space on both sides leaves one space, a space on one side only is dropped with the mark
    unless it is the one after, which keeps the words apart ("darkness,(1) saith" gives "darkness, saith")."""
    numbers: list[int] = []

    def drop(m: re.Match[str]) -> str:
        numbers.append(int(m.group(1)))
        full = m.group(0)
        # "my life [1] to keep" and "darkness,(1) saith" keep one space; "Christian. [1]" and "word(1)." keep none
        return " " if full != full.rstrip() else ""

    cleaned = pattern.sub(drop, text)
    return cleaned, numbers


def title_case(s: str) -> str:
    """A heading the edition prints in capitals set in title case ("OF THE SAINT'S MOTHER" gives "Of the Saint's Mother"). Text that has
    lower case letters in it is returned as it is."""
    if not any(ch.isalpha() for ch in s) or any(ch.islower() for ch in s):
        return s
    words = s.split(" ")
    out = []
    for i, w in enumerate(words):
        core = re.sub(r"[^A-Za-z]", "", w)
        starts_sentence = i == 0 or words[i - 1].endswith((".", "?", "!"))
        if _ROMAN.match(core) and len(core) > 1 or core == "I":
            out.append(w)
        elif not starts_sentence and core.lower() in _SMALL_WORDS:
            out.append(w.lower())
        else:
            out.append(re.sub(r"[A-Za-z][A-Za-z']*", lambda m: m.group(0)[:1].upper() + m.group(0)[1:].lower(), w))
    return " ".join(out)


_CONNECTIVES = {"A", "AN", "AND", "AS", "AT", "BE", "BY", "FOR", "FROM", "IN", "IS", "IT", "OF", "ON", "OR", "THE", "THEN", "TO", "WHEN", "WILL", "WITH"}


def is_caps(s: str) -> bool:
    """A heading line in capitals: at least two letters and no lower case letter."""
    return sum(ch.isalpha() for ch in s) >= 2 and not any(ch.islower() for ch in s)


def join_heading(parts: list[str]) -> str:
    """The lines of a heading that the edition broke over several lines, as one title: a line that ends with a comma or a connecting word
    ("IT IS ON" and "THE INCARNATION") runs on into the next, and a line that starts with one ("AND FIRST ON THE COMMANDMENTS") joins the line
    before it; otherwise the lines are sentences of their own and are joined with a full stop."""
    out = parts[0].strip()
    for nxt in parts[1:]:
        nxt = nxt.strip()
        last = re.sub(r"[^A-Za-z]", "", out.split()[-1]).upper() if out.split() else ""
        first = re.sub(r"[^A-Za-z]", "", nxt.split()[0]).upper() if nxt.split() else ""
        if out.endswith((",", ";", ":")) or last in _CONNECTIVES or first in {"AND", "OR", "TO", "WHICH", "WHEN", "FOR", "IS", "WILL", "OF"}:
            out += " " + nxt
        elif out.endswith((".", "?", "!")):
            out += " " + nxt
        else:
            out += ". " + nxt
    return out


# ------------------------------------------------------------------------------------------------------------- checks and counts

ROMAN_VALUES = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}


def roman(s: str) -> int:
    total = 0
    for ch, nxt in zip(s, s[1:] + " "):
        v = ROMAN_VALUES[ch]
        total += -v if nxt in ROMAN_VALUES and ROMAN_VALUES[nxt] > v else v
    return total


FORBIDDEN = [
    (re.compile(r"[<>]"), "an angle bracket (markup that was left in)"),
    (re.compile(r"_"), "an underscore (an emphasis mark that was left in)"),
    (re.compile(r"\[(?:Illustration|Footnote|Sidenote|Transcriber|Note)", re.I), "a bracketed note of the digital edition"),
    (re.compile(r"[{}]"), "a curly bracket (a mark of the digital edition)"),
    (re.compile(r"gutenberg", re.I), "the name of the digital library"),
    (re.compile(r"\u00a0|\t|\u200b|\ufeff|\x0c"), "a no-break space, tab or invisible character"),
    (re.compile(r" {2}"), "a double space"),
    (re.compile(r"^\s|\s$"), "a space at an end"),
    (re.compile(r"^[\[(]?(?:[0-9]+|[IVXLCDM]+)[\])]?\.?$"), "a page or section number on its own"),
]


def check_text(book: str, line: int | None, kind: str, text: str) -> None:
    """The text of one block must be clean: nothing that looks like markup, a page number or the digital library. A "q" block is checked
    line by line (its lines are separated by "\\n"); every other block must be one line."""
    if not text:
        raise BookError(book, line, f"an empty {kind} block")
    if kind != "q" and "\n" in text:
        raise BookError(book, line, f"a line break inside a {kind} block: {text[:80]!r}")
    for part in text.split("\n"):
        if not part:
            raise BookError(book, line, f"an empty line in a {kind} block: {text[:80]!r}")
        for pattern, what in FORBIDDEN:
            if pattern.search(part):
                raise BookError(book, line, f"{what} in a {kind} block: {text[:80]!r}")


def count_words(blocks: list[dict]) -> int:
    return sum(len(b["t"].split()) for b in blocks if "t" in b)
