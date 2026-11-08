#!/usr/bin/env python3
"""Copy a passage out of a source text exactly, and say where it is. For the reflection books (see .claude/skills/book-writer).

    python3 tools/passage.py /tmp/book-sources/pg1653.txt --from "If thou wilt stand fast" --to "an exile and a pilgrim upon the earth."
    python3 tools/passage.py pg1653.txt --from "We ought daily" --to "done nothing!" --from "If thou canst not" --to "thy neighbour."
    python3 tools/passage.py pg8294.txt --web --from "I will lift up my eyes" --to "heaven and earth."

Each --from/--to pair is one stretch: the text from the first words to the last words, in the source's own words. Several pairs are joined with " … ". It prints the
passage ready to paste into a `>` blockquote, its length, and the nearest headings above it (for example "THE FIRST BOOK" and "CHAPTER XVII"), so the citation is
read from the source and not from memory. It warns about what a copied stretch can carry that is not text:

  * a footnote marker such as (3) or [3] inside the stretch (end the stretch before it, or start after it);
  * a paragraph number such as "2." (the same);
  * a quotation mark opened and not closed in the stretch, or the reverse (end where the quotation ends);
  * `_italic_` marks, which are turned into *italic*.

The same cleaning as tools/check_books.py is used (the Project Gutenberg header and footer are dropped; for the World English Bible the verse numbers and headings).
The checker is still the judge: run it afterwards.
"""
from __future__ import annotations

import argparse
import dataclasses
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

import book_kit as bk  # noqa: E402
import check_books as cb  # noqa: E402

BOOK_HEADING = re.compile(
    r"^\s*(?:THE (?:FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|SEVENTH|EIGHTH|NINTH|TENTH) BOOK.*|BOOK [IVXLC\d]+\b.*|PART [IVXLC\d]+\b.*|"
    r"(?:First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth|Ninth|Tenth) (?:Book|Part).*)\s*$"
)
CHAPTER_HEADING = re.compile(r"^\s*(?:CHAPTER [IVXLC\d]+\b.*|CANTO [IVXLC]+\b.*|PSALM \d+.*|[IVXLC]+\.\s*$)\s*$")
FOOTNOTE = re.compile(r"\(\d+\)|\[\d+\]")
PARAGRAPH_NUMBER = re.compile(r"(?<=\s)\d{1,2}\. (?=[A-Z“‘\"'])")


@dataclasses.dataclass
class Extract:
    text: str
    where: list[str]
    warnings: list[str]

    @property
    def words(self) -> int:
        return bk.count_words(self.text)


class NotFound(Exception):
    pass


def _pattern(phrase: str) -> re.Pattern[str]:
    """The phrase with any run of white space between its words (the source is hard-wrapped)."""
    parts = phrase.split()
    if not parts:
        raise NotFound("an empty phrase")
    return re.compile(r"\s+".join(re.escape(p) for p in parts))


def extract(source: str, start: str, end: str, web: bool = False) -> Extract:
    """The stretch of `source` from `start` to the end of `end`, as one line of its own words."""
    body = cb._clean_source(source, web)
    a = _pattern(start).search(body)
    if not a:
        raise NotFound(f"start not found: {start!r}")
    b = _pattern(end).search(body, a.start())
    if not b:
        raise NotFound(f"end not found after the start: {end!r}")
    raw = body[a.start():b.end()]
    text = re.sub(r"\s+", " ", raw).strip()
    warnings: list[str] = []
    if FOOTNOTE.search(text):
        warnings.append(f"a footnote marker inside the stretch ({FOOTNOTE.search(text).group(0)}): end the stretch before it or start after it")
    if PARAGRAPH_NUMBER.search(text):
        warnings.append(f"a paragraph number inside the stretch ({PARAGRAPH_NUMBER.search(text).group(0).strip()!r}): end the stretch before it or start after it")
    if text.count("“") != text.count("”"):
        warnings.append("a quotation mark is opened and not closed in the stretch (or the reverse): end the stretch where the quotation ends, or start before it opens")
    text = re.sub(r"(?<![\w])_([^_]+)_(?![\w])", r"*\1*", text)
    book = chapter = None                # the nearest book-level and chapter-level headings above the stretch
    for line in body[:a.start()].splitlines()[::-1]:
        if chapter is None and CHAPTER_HEADING.match(line):
            chapter = line.strip()
        elif book is None and BOOK_HEADING.match(line):
            book = line.strip()
        if book and chapter:
            break
    where = [h for h in (book, chapter) if h]
    return Extract(text, where, warnings)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Copy a passage out of a source text exactly, and say where it is.")
    ap.add_argument("source", type=pathlib.Path, help="the source text, for example /tmp/book-sources/pg1653.txt")
    ap.add_argument("--from", dest="starts", action="append", required=True, metavar="WORDS", help="the first words of a stretch")
    ap.add_argument("--to", dest="ends", action="append", required=True, metavar="WORDS", help="the last words of the stretch")
    ap.add_argument("--web", action="store_true", help="the source is the World English Bible (drop verse numbers and headings)")
    args = ap.parse_args(argv)
    if len(args.starts) != len(args.ends):
        print("every --from needs a --to", file=sys.stderr)
        return 2
    source = args.source.read_text(encoding="utf-8", errors="replace")
    stretches, failed = [], False
    for start, end in zip(args.starts, args.ends):
        try:
            e = extract(source, start, end, args.web or "world english bible" in source[:3000].lower())
        except NotFound as err:
            print(f"error: {err}", file=sys.stderr)
            failed = True
            continue
        stretches.append(e)
        for w in e.warnings:
            print(f"warning: {w}", file=sys.stderr)
    if failed:
        return 1
    text = " … ".join(e.text for e in stretches)
    print(f"> {text}")
    print(f"\n({bk.count_words(text)} words; from: {' / '.join(stretches[0].where) or 'no heading found above it'})", file=sys.stderr)
    return 1 if any(e.warnings for e in stretches) else 0


if __name__ == "__main__":
    sys.exit(main())
