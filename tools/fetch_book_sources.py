#!/usr/bin/env python3
"""Download the public-domain source texts that the reflection books are verified against (tools/check_books.py --sources DIR).

    python3 tools/fetch_book_sources.py DIR              # every source named in books/*/book.json, into DIR as pg<number>.txt
    python3 tools/fetch_book_sources.py DIR --list       # only print what would be fetched
    python3 tools/fetch_book_sources.py DIR --force      # fetch again even if the file is there

The list comes from the books themselves (the `sources[].id` of each book.json, of the form `gutenberg-<number>`), so a new book can never be left out of
CI by a list that was not updated. Each file is checked to look like a Project Gutenberg text (not an error page) and is retried with a pause. Exit status
1 if any source could not be fetched. Standard library only. The files are not kept in the repository.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
BOOKS_DIR = ROOT / "books"
URL = "https://www.gutenberg.org/cache/epub/{n}/pg{n}.txt"
MIN_BYTES = 8_000


def source_numbers(books_dir: pathlib.Path = BOOKS_DIR) -> dict[int, list[str]]:
    """{ebook number: the books that name it}, from every books/*/book.json."""
    found: dict[int, list[str]] = {}
    for p in sorted(books_dir.glob("*/book.json")):
        try:
            meta = json.loads(p.read_text(encoding="utf-8"))
        except ValueError:
            continue
        for src in meta.get("sources", []) or []:
            m = re.fullmatch(r"gutenberg-(\d+)", str(src.get("id", "")))
            if m:
                found.setdefault(int(m.group(1)), []).append(p.parent.name)
    return dict(sorted(found.items()))


def looks_like_gutenberg(data: bytes) -> bool:
    head = data[:4000].decode("utf-8", errors="replace")
    return len(data) >= MIN_BYTES and "Project Gutenberg" in head and "<html" not in head.lower()[:300]


def fetch(n: int, dest: pathlib.Path, tries: int = 4, pause: float = 4.0) -> bytes:
    last: Exception | None = None
    for i in range(tries):
        try:
            req = urllib.request.Request(URL.format(n=n), headers={"User-Agent": "caminoplus-book-tools/1.0"})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            if not looks_like_gutenberg(data):
                raise ValueError(f"ebook {n}: the answer does not look like a Project Gutenberg text ({len(data)} bytes)")
            dest.write_bytes(data)
            return data
        except (urllib.error.URLError, TimeoutError, ValueError, OSError) as e:
            last = e
            if i + 1 < tries:
                time.sleep(pause * (i + 1))
    raise RuntimeError(f"ebook {n}: not fetched after {tries} tries: {last}")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Download the source texts named by the books.")
    ap.add_argument("out", type=pathlib.Path, help="the folder for the pg<number>.txt files (outside the repository)")
    ap.add_argument("--books-dir", type=pathlib.Path, default=BOOKS_DIR)
    ap.add_argument("--list", action="store_true", help="only print the list")
    ap.add_argument("--force", action="store_true", help="fetch again even if the file exists")
    args = ap.parse_args(argv)
    wanted = source_numbers(args.books_dir)
    if not wanted:
        print("no gutenberg sources named by any book")
        return 0
    args.out.mkdir(parents=True, exist_ok=True)
    bad = 0
    for n, books in wanted.items():
        dest = args.out / f"pg{n}.txt"
        if args.list:
            print(f"pg{n}.txt  <- {', '.join(books)}")
            continue
        if dest.is_file() and not args.force and looks_like_gutenberg(dest.read_bytes()):
            print(f"have  pg{n}.txt  ({', '.join(books)})")
            continue
        try:
            data = fetch(n, dest)
            print(f"fetched pg{n}.txt  {len(data):,} bytes  sha256 {hashlib.sha256(data).hexdigest()[:12]}  ({', '.join(books)})")
        except RuntimeError as e:
            bad += 1
            print(f"FAILED {e}", file=sys.stderr)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
