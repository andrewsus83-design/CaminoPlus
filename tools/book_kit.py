"""Shared code of the book tools (tools/check_books.py, tools/build_books.py): reading a book folder, parsing the
small Markdown subset the books are written in, counting words and reading time.

Standard library only, so it runs anywhere the other tools in this folder run.

The books are written in one Markdown subset and read by three consumers (the app's reader, the EPUB, the PDF), so the
parser is the single place that says what that subset is:

    # Chapter title            exactly one, first in the file
    ## Section, ### Subsection
    paragraphs
    - bullet list, 1. numbered list
    > quote paragraph(s); a last quote paragraph that starts with an em dash is the attribution
    ---                        a break
    *italic*, **bold**, [text](https://link)

No tables, images, raw HTML or emoji (tools/check_books.py reports them). The result of parsing is plain data
(dicts and lists) so the same blocks go to the app as JSON and to the EPUB and PDF as HTML.
"""
from __future__ import annotations

import dataclasses
import json
import math
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
BOOKS_DIR = ROOT / "books"

WORDS_PER_MINUTE = 220
COVER_COLOURS = ("goldSoft", "blue100", "successWash", "red100", "sand300", "goldWash")
COVER_ICONS = ("library", "book", "chat")
KINDS = ("guide", "reflection")

# ---------------------------------------------------------------------------------------------------------------------
# Words and reading time

_WORD = re.compile(r"[^\W_]+(?:['’\-][^\W_]+)*")


def count_words(text: str) -> int:
    """Words as a reader would count them: letters and numbers, with an inner apostrophe or hyphen kept inside the word."""
    return len(_WORD.findall(text))


def reading_minutes(words: int) -> int:
    """Minutes to read `words` words at WORDS_PER_MINUTE, rounded up (a text is never 'zero minutes')."""
    return max(1, math.ceil(words / WORDS_PER_MINUTE)) if words else 0


def format_minutes(minutes: int) -> str:
    """'25 min', '2 h 40 min', '3 h'."""
    h, m = divmod(minutes, 60)
    if h == 0:
        return f"{m} min"
    return f"{h} h" if m == 0 else f"{h} h {m} min"


# ---------------------------------------------------------------------------------------------------------------------
# Inline text: *italic*, **bold**, [text](url). A span is {"t": text} plus "b": 1, "i": 1 or "href": url when set.

_LINK = re.compile(r"\[([^\]]+)\]\(([^)\s]+)\)")


def parse_inline(text: str) -> tuple[list[dict], bool]:
    """Spans of `text`, and whether every * and ** was closed. An unclosed marker stays as plain text in the last span."""
    spans: list[dict] = []
    buf: list[str] = []
    bold = italic = False
    i = 0

    def flush() -> None:
        if buf:
            s: dict = {"t": "".join(buf)}
            if bold:
                s["b"] = 1
            if italic:
                s["i"] = 1
            spans.append(s)
            buf.clear()

    while i < len(text):
        ch = text[i]
        if ch == "\\" and i + 1 < len(text) and text[i + 1] in "*[]\\":
            buf.append(text[i + 1])
            i += 2
        elif text.startswith("**", i):
            flush()
            bold = not bold
            i += 2
        elif ch == "*":
            flush()
            italic = not italic
            i += 1
        elif ch == "[":
            m = _LINK.match(text, i)
            if m:
                flush()
                inner, _ = parse_inline(m.group(1))
                for s in inner:
                    s = dict(s)
                    s["href"] = m.group(2)
                    if bold:
                        s["b"] = 1
                    if italic:
                        s["i"] = 1
                    spans.append(s)
                i = m.end()
            else:
                buf.append(ch)
                i += 1
        else:
            buf.append(ch)
            i += 1
    flush()
    return spans, not (bold or italic)


def plain(spans: list[dict]) -> str:
    """The text of spans, without any markup."""
    return "".join(s["t"] for s in spans)


# ---------------------------------------------------------------------------------------------------------------------
# Blocks

_HEADING = re.compile(r"^(#{1,6})\s+(.*?)\s*#*\s*$")
_ULI = re.compile(r"^[-*+]\s+(.*)$")
_OLI = re.compile(r"^\d+[.)]\s+(.*)$")
_HR = re.compile(r"^(-{3,}|\*{3,}|_{3,})\s*$")


def parse_markdown(text: str) -> list[dict]:
    """Blocks of a chapter file. Block types:

    {"t": "h", "level": 1..6, "spans": [...]}
    {"t": "p", "spans": [...]}
    {"t": "ul" | "ol", "items": [[spans], ...]}
    {"t": "quote", "paras": [[spans], ...], "cite": [spans] | None}      (cite: the last paragraph when it starts with "—")
    {"t": "hr"}
    """
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    blocks: list[dict] = []
    para: list[str] = []
    i = 0
    unclosed: list[bool] = []   # set by inl() when a * or ** is left open; moved onto the block that holds it

    def inl(t: str) -> list[dict]:
        spans, ok = parse_inline(t)
        if not ok:
            unclosed.append(True)
        return spans

    def add(block: dict) -> None:
        if unclosed:
            block["unbalanced"] = True
            unclosed.clear()
        blocks.append(block)

    def flush_para() -> None:
        if para:
            add({"t": "p", "spans": inl(" ".join(s.strip() for s in para))})
            para.clear()

    while i < len(lines):
        raw = lines[i]
        line = raw.strip()
        if not line:
            flush_para()
            i += 1
            continue
        m = _HEADING.match(line)
        if m:
            flush_para()
            add({"t": "h", "level": len(m.group(1)), "spans": inl(m.group(2))})
            i += 1
        elif _HR.match(line):
            flush_para()
            add({"t": "hr"})
            i += 1
        elif line.startswith(">"):
            flush_para()
            quote_lines: list[str] = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                quote_lines.append(lines[i].strip()[1:].lstrip(" ") if lines[i].strip() != ">" else "")
                i += 1
            paras: list[list[dict]] = []
            current: list[str] = []
            for ql in quote_lines + [""]:
                if ql.strip():
                    current.append(ql.strip())
                elif current:
                    paras.append(inl(" ".join(current)))
                    current = []
            cite = None
            if paras and plain(paras[-1]).startswith("—"):
                cite = paras.pop()
            add({"t": "quote", "paras": paras, "cite": cite})
        elif _ULI.match(line) or _OLI.match(line):
            flush_para()
            ordered = bool(_OLI.match(line))
            items: list[list[dict]] = []
            while i < len(lines):
                cur = lines[i].strip()
                mm = (_OLI if ordered else _ULI).match(cur)
                if mm:
                    items.append([mm.group(1)])
                    i += 1
                elif cur and items and lines[i].startswith((" ", "\t")):
                    items[-1].append(cur)  # a wrapped list line
                    i += 1
                else:
                    break
            add({"t": "ol" if ordered else "ul", "items": [inl(" ".join(it)) for it in items]})
        else:
            para.append(line)
            i += 1
    flush_para()
    return blocks


def block_text(block: dict) -> str:
    """All the visible text of a block, one string."""
    t = block["t"]
    if t in ("h", "p"):
        return plain(block["spans"])
    if t in ("ul", "ol"):
        return "\n".join(plain(it) for it in block["items"])
    if t == "quote":
        parts = [plain(p) for p in block["paras"]]
        if block["cite"]:
            parts.append(plain(block["cite"]))
        return "\n".join(parts)
    return ""


# ---------------------------------------------------------------------------------------------------------------------
# A book on disk

@dataclasses.dataclass
class Chapter:
    file: str                 # "03-the-way-in-brief.md"
    id: str                   # "03-the-way-in-brief"
    title: str                # the text of the one # heading
    blocks: list[dict]        # without the # heading
    all_blocks: list[dict]    # as parsed, with it
    words: int

    @property
    def minutes(self) -> int:
        return reading_minutes(self.words)


@dataclasses.dataclass
class Book:
    dir: pathlib.Path
    meta: dict
    chapters: list[Chapter]
    series: dict

    @property
    def id(self) -> str:
        return self.meta["id"]

    @property
    def words(self) -> int:
        return sum(c.words for c in self.chapters)

    @property
    def minutes(self) -> int:
        return reading_minutes(self.words)


def load_series(books_dir: pathlib.Path = BOOKS_DIR) -> dict:
    p = books_dir / "series.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def load_chapter(path: pathlib.Path) -> Chapter:
    text = path.read_text(encoding="utf-8")
    blocks = parse_markdown(text)
    title = ""
    body = blocks
    if blocks and blocks[0]["t"] == "h" and blocks[0]["level"] == 1:
        title = plain(blocks[0]["spans"])
        body = blocks[1:]
    words = sum(count_words(block_text(b)) for b in blocks)
    return Chapter(path.name, path.stem, title, body, blocks, words)


def load_book(book_dir: pathlib.Path, series: dict | None = None) -> Book:
    book_dir = pathlib.Path(book_dir)
    meta = json.loads((book_dir / "book.json").read_text(encoding="utf-8"))
    files = sorted((book_dir / "chapters").glob("*.md"))
    chapters = [load_chapter(f) for f in files]
    return Book(book_dir, meta, chapters, series if series is not None else load_series(book_dir.parent))


def find_books(books_dir: pathlib.Path = BOOKS_DIR) -> list[pathlib.Path]:
    """Every folder in books/ that holds a book.json, in the order of `order` (then by name)."""
    found = []
    for p in sorted(books_dir.iterdir()) if books_dir.exists() else []:
        if (p / "book.json").is_file():
            try:
                order = json.loads((p / "book.json").read_text(encoding="utf-8")).get("order", 999)
            except (ValueError, OSError):
                order = 999
            found.append((order, p.name, p))
    return [p for _, _, p in sorted(found)]
