#!/usr/bin/env python3
"""The gate of a batch of books: is every planned book there, and nothing else? Run it before a commit that adds books, and CI runs it on every pull request.

    python3 tools/check_series.py              # exit 1 if the books in books/ and books/plan.json do not agree
    python3 tools/check_series.py --status     # also print the table: planned, present, route, words

books/plan.json is the plan, in machine-readable form (books/series.md is the same plan for people). It says which books exist: id, kind, order, the Camino each
is for (`route_slug`), and for a reflection book its number of days and the ids of its sources. This script fails when

  * a planned book is missing (skipped), or a folder with a book.json is not in the plan (stray, or forgotten in the plan);
  * a book.json disagrees with the plan about its id, kind, order, route_slug, days or sources;
  * orders are not unique, or a reflection book comes before a guide;
  * a Camino of the app's catalog has no guide and the plan does not say so on purpose (`routes_without_guide`);
  * a reflection book is for a route that is not in the catalog, or uses a source that books/sources/SOURCES.md does not document;
  * the app's Library bundle (when there is one) lists other books than the plan.

It checks the SET of books. What is inside each book is tools/check_books.py. Standard library only.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
BOOKS_DIR = ROOT / "books"
CATALOG_FILES = [ROOT / "supabase" / "migrations" / "20261106120000_more_caminos.sql", ROOT / "supabase" / "seed.sql"]
NETWORK_SLUGS = {"camino-de-santiago"}      # the network the routes belong to, not a route
BUNDLE = ROOT / "mobile" / "assets" / "library" / "catalog.json"


def catalog_routes(files: list[pathlib.Path] = CATALOG_FILES) -> set[str]:
    """The route slugs of the app's catalog (a `camino-...` slug that is not the network)."""
    slugs: set[str] = set()
    for f in files:
        if f.is_file():
            slugs |= set(re.findall(r"'(camino-[a-z0-9]+(?:-[a-z0-9]+)*)'", f.read_text(encoding="utf-8", errors="replace")))
    return slugs - NETWORK_SLUGS


def check(books_dir: pathlib.Path = BOOKS_DIR, routes: set[str] | None = None, bundle: pathlib.Path | None = BUNDLE,
          sources_md: pathlib.Path | None = None) -> tuple[list[str], list[dict]]:
    """(errors, rows): the problems, and one row per planned book for the status table."""
    errors: list[str] = []
    routes = catalog_routes() if routes is None else routes
    sources_md = sources_md or (books_dir / "sources" / "SOURCES.md")
    plan_path = books_dir / "plan.json"
    if not plan_path.is_file():
        return [f"{plan_path}: the plan is missing"], []
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    planned = plan.get("books", [])
    ids = [b["id"] for b in planned]
    if len(set(ids)) != len(ids):
        errors.append("plan.json: a book id is listed twice: " + ", ".join(sorted({i for i in ids if ids.count(i) > 1})))
    orders = [b["order"] for b in planned]
    if len(set(orders)) != len(orders):
        errors.append("plan.json: two books have the same order")
    guides = [b["order"] for b in planned if b["kind"] == "guide"]
    readings = [b["order"] for b in planned if b["kind"] == "reflection"]
    if guides and readings and max(guides) > min(readings):
        errors.append("plan.json: every guide comes before every reflection book (the Library lists them in that order)")

    on_disk = {p.parent.name: p for p in sorted(books_dir.glob("*/book.json"))}
    for extra in sorted(set(on_disk) - set(ids)):
        errors.append(f"books/{extra}: has a book.json but is not in plan.json (a stray, or a book forgotten in the plan)")

    sources_text = sources_md.read_text(encoding="utf-8") if sources_md.is_file() else ""
    rows: list[dict] = []
    for b in planned:
        row = {"id": b["id"], "kind": b["kind"], "order": b["order"], "route": b.get("route_slug", ""), "present": b["id"] in on_disk, "words": None}
        rows.append(row)
        if b["id"] not in on_disk:
            errors.append(f"books/{b['id']}: planned but missing (skipped?)")
            continue
        meta = json.loads(on_disk[b["id"]].read_text(encoding="utf-8"))
        for key in ("id", "kind", "order", "route_slug"):
            if key in b and meta.get(key) != b[key]:
                errors.append(f"books/{b['id']}/book.json: {key} is {meta.get(key)!r}, the plan says {b[key]!r}")
        if b["kind"] == "reflection":
            if meta.get("days") != b.get("days"):
                errors.append(f"books/{b['id']}/book.json: days is {meta.get('days')!r}, the plan says {b.get('days')!r}")
            have = [s.get("id") for s in meta.get("sources", [])]
            if have != b.get("sources", []):
                errors.append(f"books/{b['id']}/book.json: sources are {have}, the plan says {b.get('sources', [])}")
            for sid in b.get("sources", []):
                if f"`{sid}`" not in sources_text:
                    errors.append(f"books/{b['id']}: source {sid} is not documented in books/sources/SOURCES.md (read its header before it is used)")
            if b.get("route_slug") not in routes:
                errors.append(f"books/{b['id']}: route_slug {b.get('route_slug')!r} is not a route of the catalog")
        else:
            if b.get("route_slug") not in routes:
                errors.append(f"books/{b['id']}: route_slug {b.get('route_slug')!r} is not a route of the catalog")
    skipped_on_purpose = set(plan.get("routes_without_guide", []))
    guided = {b.get("route_slug") for b in planned if b["kind"] == "guide"}
    for r in sorted(routes - guided - skipped_on_purpose):
        errors.append(f"the catalog route {r} has no guide in the plan (add one, or list it in routes_without_guide on purpose)")
    for r in sorted(skipped_on_purpose - routes):
        errors.append(f"plan.json: routes_without_guide names {r}, which is not a route of the catalog")
    if bundle is not None and bundle.is_file():
        listed = [x["id"] for x in json.loads(bundle.read_text(encoding="utf-8")).get("books", [])]
        if listed != [i for _, i in sorted((b["order"], b["id"]) for b in planned)]:
            errors.append("the app's Library bundle lists other books than the plan: run python3 tools/build_books.py --no-render")
    return errors, rows


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Check that the books in books/ are exactly the books of books/plan.json.")
    ap.add_argument("--status", action="store_true", help="print the table of planned books")
    args = ap.parse_args(argv)
    errors, rows = check()
    if args.status:
        sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
        import book_kit as bk  # noqa: E402
        for r in rows:
            if r["present"]:
                try:
                    r["words"] = bk.load_book(BOOKS_DIR / r["id"]).words
                except (OSError, ValueError, KeyError):
                    r["words"] = None
            print(f"{r['order']:>3}  {r['kind']:<10} {r['id']:<34} {r['route']:<28} {'present' if r['present'] else 'MISSING':<8} "
                  f"{'' if r['words'] is None else format(r['words'], ',') + ' words'}")
    for e in errors:
        print(f"error: {e}")
    print(f"{len(rows)} books planned, {sum(r['present'] for r in rows)} present, {len(errors)} problem(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
