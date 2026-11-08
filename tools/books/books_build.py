"""What a recipe fills while it reads one text: parts, chapters and blocks, with the checks that make a bad text a hard error."""
from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass, field

from books_clean import Block, BookError, check_text, count_words, tidy, unwrap

KINDS = ("p", "h", "q", "li", "hr")
_RULE = re.compile(r"^[\s*]+$")
# A short block that looks like a heading must be taken by a rule of the recipe; if it reaches paragraph() it is an error.
_HEADING_WORD = re.compile(r"^_?(chapter|book|part|section|letter|canto|preface|introduction|appendix|contents|notes|footnotes|the end|finis)\b", re.I)


@dataclass
class Chapter:
    title: str
    part: str | None
    line: int
    blocks: list[dict] = field(default_factory=list)


class Collector:
    """The recipes call part(), chapter(), paragraph() and friends in reading order; the result is `chapters`, `stats` and `words`."""

    def __init__(self, book: str):
        self.book = book
        self.chapters: list[Chapter] = []
        self.stats: Counter = Counter()
        self._part: str | None = None

    # ---------------------------------------------------------------- structure
    def part(self, name: str, line: int | None = None) -> None:
        name = tidy(name)
        check_text(self.book, line, "h", name)
        self._part = name

    def chapter(self, title: str, line: int | None = None) -> None:
        title = tidy(title)
        check_text(self.book, line, "h", title)
        if self.chapters and not self.chapters[-1].blocks:
            raise BookError(self.book, line, f"chapter {self.chapters[-1].title!r} has no text")
        self.chapters.append(Chapter(title, self._part, line or 0))

    def _current(self, line: int | None) -> Chapter:
        if not self.chapters:
            raise BookError(self.book, line, "text before the first chapter heading")
        return self.chapters[-1]

    # ------------------------------------------------------------------- blocks
    def add(self, kind: str, text: str, line: int | None = None) -> None:
        """One block of text that is already one clean string ("q" blocks keep "\\n" between lines)."""
        assert kind in KINDS and kind != "hr"
        check_text(self.book, line, kind, text)
        self._current(line).blocks.append({"k": kind, "t": text})

    def rule(self, line: int | None = None) -> None:
        self._current(line).blocks.append({"k": "hr"})

    def paragraph(self, block: Block, *, markers: re.Pattern[str] | None = None, allow_quote: bool = True,
                  verse: bool = False, kind: str | None = None, base: int = 0) -> list[int]:
        """The block as the edition set it: a row of asterisks is a break, an indented block is a quotation (a poem keeps its lines when
        `verse` is true), anything else is a paragraph. `markers` is the footnote mark to take out of the text; the numbers found are
        returned in order."""
        if _RULE.match(block.text) and block.text.count("*") >= 3:
            self.rule(block.no)
            return []
        flat = block.flat()
        if len(flat.split()) <= 12 and (_HEADING_WORD.match(flat) or (sum(ch.isalpha() for ch in flat) >= 2 and not any(ch.islower() for ch in flat))):
            raise BookError(self.book, block.no, f"a heading that no rule of the recipe takes: {flat[:80]!r}")
        quote = block.indent >= base + 2 and kind is None  # `base` is the indent of the paragraphs of the file (3 in a CCEL text)
        if quote and not allow_quote:
            raise BookError(self.book, block.no, f"an indented block where none is expected: {block.text[:60]!r}")
        numbers: list[int] = []
        if quote and verse:
            lines = [tidy(unwrap([line], self.stats)) for line in block.lines]
            if markers is not None:
                lines = [markers_out(self, ln, markers, numbers) for ln in lines]
            text = "\n".join(lines)
            self.add("q", text, block.no)
            return numbers
        text = tidy(unwrap(block.lines, self.stats))
        if markers is not None:
            text = markers_out(self, text, markers, numbers)
        self.add(kind or ("q" if quote else "p"), text, block.no)
        return numbers

    # ------------------------------------------------------------------- result
    def finish(self) -> None:
        if not self.chapters:
            raise BookError(self.book, None, "no chapter was found")
        for ch in self.chapters:
            if not ch.blocks:
                raise BookError(self.book, ch.line, f"chapter {ch.title!r} has no text")

    @property
    def words(self) -> int:
        return sum(count_words(ch.blocks) for ch in self.chapters)


def markers_out(col: Collector, text: str, pattern: re.Pattern[str], numbers: list[int]) -> str:
    from books_clean import strip_markers

    cleaned, found = strip_markers(text, pattern)
    numbers.extend(found)
    if found:
        col.stats["footnote marks"] += len(found)
    return tidy(cleaned)
