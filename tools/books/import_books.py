#!/usr/bin/env python3
"""Import the texts of the Books tab: download (or read) the editions, check their sha256, clean them, write the app's assets.

    python3 tools/books/import_books.py                         # every book that is public domain everywhere -> mobile/assets/books
    python3 tools/books/import_books.py --book confessions      # only this book is rebuilt; the others stay as the manifest has them
    python3 tools/books/import_books.py --raw-dir DIR           # read (and keep) the downloads in DIR; DIR is a cache and a record
    python3 tools/books/import_books.py --check                 # write nothing; exit 1 if any asset differs from what the recipes make
    python3 tools/books/import_books.py --list                  # the books, their verdicts and what is left out

Standard library only. The recipes (books_recipes.py) hold the source, the sha256 the download must have and the rules that clean it;
a download with another hash is refused. Every rule that could lose text raises an error that names the book and the raw line: there is
no lenient mode. The output is deterministic: running it twice gives the same bytes. See tools/books/README.md.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import sys
import time
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from books_build import Collector  # noqa: E402
from books_clean import BookError, decode, gutenberg_body  # noqa: E402
import books_recipes as recipes  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[2]
DEFAULT_OUT = ROOT / "mobile" / "assets" / "books"
DEFAULT_TS = ROOT / "mobile" / "src" / "features" / "library" / "books" / "books.generated.ts"
USER_AGENT = "CaminoPlus-books-importer/1.0 (+https://camino.plus; hello@camino.plus)"


class HashMismatch(Exception):
    pass


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def dumps(obj: object) -> str:
    """Compact, deterministic JSON with a final newline: the same bytes on every run and every machine."""
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n"


# ----------------------------------------------------------------------------------------------------------------------- fetching

def fetch(recipe: recipes.Recipe, raw_dir: pathlib.Path | None, offline: bool = False) -> bytes:
    """The raw bytes of the edition. A copy in raw_dir is used when there is one; otherwise the file is downloaded (and kept in raw_dir
    when given). Either way the bytes must have the recipe's sha256: a different file is refused, never cleaned."""
    data: bytes | None = None
    cached = raw_dir / recipe.raw_file if raw_dir else None
    if cached is not None and cached.is_file():
        data = cached.read_bytes()
    elif offline:
        raise HashMismatch(f"{recipe.id}: {recipe.raw_file} is not in the raw directory and --offline was given")
    else:
        req = urllib.request.Request(recipe.raw_url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=120) as resp:  # noqa: S310 (a fixed https URL from the recipe)
            data = resp.read()
        time.sleep(1)  # one request a second at most: the sources are volunteers' servers
        if cached is not None:
            cached.parent.mkdir(parents=True, exist_ok=True)
            cached.write_bytes(data)
    got = sha256(data)
    if got != recipe.raw_sha256:
        raise HashMismatch(
            f"{recipe.id}: {recipe.raw_file} has sha256 {got}, the recipe expects {recipe.raw_sha256}: refusing to clean a file that is "
            "not the one the recipe was written for (the source may have been corrected: read the new text, then update the recipe)")
    return data


# ----------------------------------------------------------------------------------------------------------------------- building

class Built:
    def __init__(self, recipe: recipes.Recipe, text: str, chapters: int, words: int, stats: dict[str, int]):
        self.recipe, self.text, self.chapters, self.words, self.stats = recipe, text, chapters, words, stats
        self.data = text.encode("utf-8")
        self.sha256 = sha256(self.data)


def build(recipe: recipes.Recipe, raw: bytes) -> Built:
    """Raw bytes of an edition -> the BookText JSON of the book. Raises BookError when the text is not what the recipe expects."""
    lines = decode(raw)
    if recipe.raw_kind == "gutenberg":
        lines, first = gutenberg_body(lines)
    else:
        first = 1
    out = Collector(recipe.id)
    recipe.parse(lines, first, out)
    out.finish()
    if len(out.chapters) != recipe.chapters:
        raise BookError(recipe.id, None, f"the recipe expects {recipe.chapters} chapters, the text has {len(out.chapters)}")
    chapters = []
    for n, ch in enumerate(out.chapters, 1):
        entry: dict = {"id": f"c{n}", "title": ch.title}
        if ch.part:
            entry["part"] = ch.part
        entry["blocks"] = ch.blocks
        chapters.append(entry)
    book: dict = {"id": recipe.id, "title": recipe.title, "author": recipe.author}
    if recipe.translator:
        book["translator"] = recipe.translator
    book["credit"] = recipe.credit
    book["chapters"] = chapters
    return Built(recipe, dumps(book), len(chapters), out.words, dict(out.stats))


def manifest_entry(b: Built) -> dict:
    r = b.recipe
    return {
        "id": r.id, "title": r.title, "author": r.author, "translator": r.translator, "translatorDied": r.translator_died,
        "translatorSource": r.translator_source, "firstPublished": r.first_published, "edition": r.edition, "source": r.source,
        "rawUrl": r.raw_url, "rawSha256": r.raw_sha256, "outputSha256": b.sha256, "chapters": b.chapters, "words": b.words,
        "verdict": r.verdict, "basis": r.basis, "credit": r.credit, "leftOut": list(r.dropped), "counts": dict(sorted(b.stats.items())),
    }


def generated_ts(ids: list[str]) -> str:
    rows = "".join(f"  '{i}': () => require('../../../../assets/books/{i}.json') as BookText,\n" for i in ids)
    return (
        "// Generated by tools/books/import_books.py: do not edit by hand (python3 tools/books/import_books.py rewrites it, --check compares it).\n"
        "// One lazy loader for every book that has text, in the order of the catalogue. Metro needs the literal path in every require().\n"
        "import type { BookText } from './bookTextTypes';\n\n"
        "export const BOOK_TEXT_LOADERS: Readonly<Record<string, () => BookText>> = {\n" + rows + "};\n"
    )


def ordered(ids) -> list[str]:
    return sorted(ids, key=recipes.CATALOGUE_ORDER.index)


def left_out_entries() -> list[dict]:
    rows = [{"id": r.id, "verdict": r.verdict, "why": r.why} for r in recipes.LEFT_OUT]
    rows += [{"id": r.id, "verdict": r.verdict, "why": r.why_not} for r in recipes.RECIPES if r.verdict != recipes.PD]
    return sorted(rows, key=lambda row: recipes.CATALOGUE_ORDER.index(row["id"]))


# ----------------------------------------------------------------------------------------------------------------------------- main

def plan(args: argparse.Namespace) -> tuple[list[recipes.Recipe], list[recipes.Recipe]]:
    """(recipes to build, recipes asked for but left out because their verdict is not public domain everywhere)"""
    by_id = {r.id: r for r in recipes.RECIPES}
    wanted = args.book or [r.id for r in recipes.RECIPES]
    for i in wanted:
        if i not in by_id and i not in {x.id for x in recipes.LEFT_OUT}:
            raise SystemExit(f"unknown book {i!r}; the books are: {', '.join(recipes.CATALOGUE_ORDER)}")
    chosen = [by_id[i] for i in wanted if i in by_id]
    return [r for r in chosen if r.verdict == recipes.PD], [r for r in chosen if r.verdict != recipes.PD]


def load_manifest(out: pathlib.Path) -> dict[str, dict]:
    path = out / "manifest.json"
    if not path.is_file():
        return {}
    return {e["id"]: e for e in json.loads(path.read_text(encoding="utf-8")).get("books", [])}


def run(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0], formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__)
    ap.add_argument("--book", action="append", metavar="ID", help="rebuild only this book (repeatable); the others keep their manifest entries")
    ap.add_argument("--out", type=pathlib.Path, default=DEFAULT_OUT, help="where the assets go (default: mobile/assets/books)")
    ap.add_argument("--ts-out", type=pathlib.Path, help="where books.generated.ts goes (default: its place in mobile/src, or OUT when --out is given)")
    ap.add_argument("--raw-dir", type=pathlib.Path, help="a directory with the downloads; missing files are downloaded into it")
    ap.add_argument("--offline", action="store_true", help="never download: every file must be in --raw-dir")
    ap.add_argument("--check", action="store_true", help="write nothing; exit 1 if an asset is not what the recipes make")
    ap.add_argument("--list", action="store_true", help="list the books, their verdicts and what is left out, and stop")
    args = ap.parse_args(argv)
    ts_out = args.ts_out or (DEFAULT_TS if args.out == DEFAULT_OUT else args.out / "books.generated.ts")

    if args.list:
        for i in recipes.CATALOGUE_ORDER:
            r = next((x for x in recipes.RECIPES if x.id == i), None)
            left = next((x for x in recipes.LEFT_OUT if x.id == i), None)
            verdict = r.verdict if r else (left.verdict if left else "no recipe")
            print(f"{i:28} {verdict:26} {r.edition if r else (left.why if left else '')}")
        return 0

    build_these, skipped = plan(args)
    for r in skipped:
        print(f"left out: {r.id}: {r.verdict}. {r.why_not}")
    for x in recipes.LEFT_OUT:
        if not args.book or x.id in args.book:
            print(f"left out: {x.id}: {x.verdict}. {x.why}")
    existing = load_manifest(args.out)
    entries: dict[str, dict] = {i: e for i, e in existing.items() if i not in {r.id for r in build_these}}
    problems: list[str] = []
    for r in build_these:
        try:
            raw = fetch(r, args.raw_dir, args.offline)
            b = build(r, raw)
        except (BookError, HashMismatch) as e:
            print(f"error: {e}", file=sys.stderr)
            return 1
        entries[r.id] = manifest_entry(b)
        path = args.out / f"{r.id}.json"
        if args.check:
            if not path.is_file() or path.read_bytes() != b.data:
                problems.append(f"{path} is not what the recipe makes")
        else:
            args.out.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b.data)
        print(f"{'checked' if args.check else 'wrote'} {r.id}: {b.chapters} chapters, {b.words} words, sha256 {b.sha256[:12]}"
              + (f", counts {b.stats}" if b.stats else ""))
    # Only the books the manifest holds have text; the files that list them follow the catalogue order.
    ids = ordered(entries)
    index = [{"id": i, "chapters": entries[i]["chapters"], "words": entries[i]["words"]} for i in ids]
    manifest = {"books": [entries[i] for i in ids], "leftOut": left_out_entries()}
    outputs = {
        args.out / "index.json": dumps(index),
        args.out / "manifest.json": dumps(manifest),
        ts_out: generated_ts(ids),
    }
    for path, text in outputs.items():
        if args.check:
            if not path.is_file() or path.read_text(encoding="utf-8") != text:
                problems.append(f"{path} is not what the recipes make")
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(text.encode("utf-8"))
    if args.check:
        for p in problems:
            print(f"differs: {p}", file=sys.stderr)
        print("check: ok" if not problems else f"check: {len(problems)} file(s) differ; run python3 tools/books/import_books.py")
        return 1 if problems else 0
    return 0


if __name__ == "__main__":
    sys.exit(run(sys.argv[1:]))
