#!/usr/bin/env python3
"""Builds the books of books/ into everything that is published (see .claude/skills/book-publisher).

    python3 tools/build_books.py                          every book: EPUB, PDF, cover, store metadata, app bundle
    python3 tools/build_books.py --only camino-ingles-guide
    python3 tools/build_books.py --no-render              no browser: EPUB without a cover image, no PDF, no cover PNG
    python3 tools/build_books.py --check                  fail if the app bundle in mobile/assets/library is out of date

Per book, into books/dist/<id>/ (git-ignored: these are build products):
    <id>.epub        EPUB 3, own fonts embedded (Fraunces, SIL OFL), accessibility metadata, series position
    <id>.pdf         the reading PDF, 6 x 9 in, page numbers
    <id>.cover.png   1600 x 2560, the store cover
    store.json       what a store form asks for: title, descriptions, keywords, categories, rights, AI disclosure, word count
And, committed because the app imports it (mobile/assets/library/):
    catalog.json     the list of books the Library shows
    books/<id>.json  one book as blocks (see tools/book_kit.py), read by the app's reader
    ../src/features/library/bookBundle.ts   the one typed module the app imports (catalog + a lazy loader per book)

The same chapter blocks feed all three, so the app, the EPUB and the PDF can never disagree. Output is deterministic:
building twice gives the same bytes (so --check and CI can compare). Standard library only; Chromium (Playwright) is
needed only for the cover and the PDF, through tools/render_books.mjs.
"""
from __future__ import annotations

import argparse
import html
import io
import json
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import uuid
import zipfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

import book_kit as bk  # noqa: E402

ROOT = bk.ROOT
FONTS = ROOT / "web" / "assets" / "fonts"
MARKS = ROOT / "brand" / "svg" / "mark"
DEFAULT_OUT = bk.BOOKS_DIR / "dist"
DEFAULT_APP_OUT = ROOT / "mobile" / "assets" / "library"
DEFAULT_APP_INDEX = ROOT / "mobile" / "src" / "features" / "library" / "bookBundle.ts"
ZIP_TIME = (2026, 1, 1, 0, 0, 0)
NAMESPACE = uuid.UUID("5f0c2f4e-7c3a-4f3e-9a55-3a1c0c0a11b0")   # book ids -> stable EPUB identifiers

INK, GOLD, GOLD_INK, PARCHMENT, SAND, STONE = "#14365D", "#D9A21B", "#7A5A0C", "#F6EFE2", "#E4D7BF", "#556274"


# ---------------------------------------------------------------------------------------------------------------------
# Blocks to HTML

def esc(s: str) -> str:
    return html.escape(s, quote=True)


def spans_html(spans: list[dict]) -> str:
    out = []
    for s in spans:
        t = esc(s["t"])
        if s.get("i"):
            t = f"<em>{t}</em>"
        if s.get("b"):
            t = f"<strong>{t}</strong>"
        if s.get("href"):
            t = f'<a href="{esc(s["href"])}">{t}</a>'
        out.append(t)
    return "".join(out)


def blocks_html(blocks: list[dict]) -> str:
    out = []
    for b in blocks:
        t = b["t"]
        if t == "h":
            lvl = min(max(b["level"], 2), 4)
            out.append(f"<h{lvl}>{spans_html(b['spans'])}</h{lvl}>")
        elif t == "p":
            out.append(f"<p>{spans_html(b['spans'])}</p>")
        elif t in ("ul", "ol"):
            items = "".join(f"<li>{spans_html(it)}</li>" for it in b["items"])
            out.append(f"<{t}>{items}</{t}>")
        elif t == "quote":
            paras = "".join(f"<p>{spans_html(p)}</p>" for p in b["paras"])
            cite = f'<p class="cite">{spans_html(b["cite"])}</p>' if b["cite"] else ""
            out.append(f"<blockquote>{paras}{cite}</blockquote>")
        elif t == "hr":
            out.append("<hr/>")
    return "\n".join(out)


def font_face(prefix: str) -> str:
    """@font-face rules for Fraunces; `prefix` is the path or URL the files are found under."""
    return (
        "@font-face{font-family:'Fraunces';font-style:normal;font-weight:100 900;"
        f"src:url('{prefix}fraunces-normal.woff2') format('woff2');}}\n"
        "@font-face{font-family:'Fraunces';font-style:italic;font-weight:100 900;"
        f"src:url('{prefix}fraunces-italic.woff2') format('woff2');}}\n"
    )


BASE_CSS = f"""
body{{font-family:'Fraunces',Georgia,serif;font-size:1em;line-height:1.55;color:#14202e;margin:0;}}
h1,h2,h3,h4{{font-family:'Fraunces',Georgia,serif;color:{INK};line-height:1.2;}}
h1{{font-size:1.8em;margin:0 0 1.2em;font-weight:700;}}
h2{{font-size:1.25em;margin:1.8em 0 .5em;}}
h3{{font-size:1.05em;margin:1.4em 0 .4em;}}
p{{margin:0 0 .9em;}}
ul,ol{{margin:0 0 1em 1.2em;padding:0;}}
li{{margin:0 0 .35em;}}
blockquote{{margin:1.2em 0;padding:.1em 0 .1em 1em;border-left:3px solid {GOLD};background:#FBF3DC;}}
blockquote p{{margin:.6em .8em .6em 0;font-style:italic;}}
blockquote p.cite{{font-style:normal;font-size:.85em;color:{STONE};}}
hr{{border:0;border-top:1px solid {SAND};margin:2em auto;width:40%;}}
a{{color:{INK};}}
.eyebrow{{font-size:.75em;letter-spacing:.14em;text-transform:uppercase;color:{GOLD_INK};margin:0 0 .5em;}}
.meta{{font-size:.85em;color:{STONE};}}
"""


# ---------------------------------------------------------------------------------------------------------------------
# Title page text, shared by EPUB and PDF

def title_page(book: bk.Book) -> str:
    m, s = book.meta, book.series
    kind = "A pilgrim's guide" if m["kind"] == "guide" else "Readings for the Way"
    lines = [
        f'<p class="eyebrow">{esc(kind)}</p>',
        f"<h1>{esc(m['title'])}</h1>",
        f'<p class="meta">{esc(m["subtitle"])}</p>',
        f'<p class="meta">{esc(s.get("name", ""))}</p>',
    ]
    return "\n".join(lines)


def rights_page(book: bk.Book) -> str:
    m, s = book.meta, book.series
    parts = [f"<h1>About this edition</h1>", f"<p>{esc(s.get('rights', ''))}</p>"]
    for src in m.get("sources", []):
        parts.append(
            f"<p>{esc(src['work'])} by {esc(src['author'])}, translated by {esc(src['translator'])} ({esc(src['year'])}). "
            f"{esc(src['licence'])}.</p>"
        )
    parts.append(f"<p>{esc(s.get('ai_disclosure', ''))}</p>")
    parts.append(f'<p class="meta">Version {esc(m.get("version", "1.0.0"))} · {esc(m.get("date", ""))} · '
                 f'{book.words:,} words · about {esc(bk.format_minutes(book.minutes))} to read.</p>')
    return "\n".join(parts)


# ---------------------------------------------------------------------------------------------------------------------
# EPUB

def xhtml(title: str, body: str, lang: str) -> str:
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n'
        f'<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="{lang}" xml:lang="{lang}">\n'
        f'<head><meta charset="utf-8"/><title>{esc(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>\n'
        f"<body>\n{body}\n</body>\n</html>\n"
    )


def epub_bytes(book: bk.Book, cover_png: pathlib.Path | None) -> bytes:
    m, s = book.meta, book.series
    lang = s.get("language", "en")
    ident = f"urn:uuid:{uuid.uuid5(NAMESPACE, book.id)}"
    modified = f"{m.get('date', '2026-01')[:7]}-01T00:00:00Z"
    files: list[tuple[str, bytes, str]] = []   # path, data, media type

    def add(path: str, data: str | bytes, mt: str) -> None:
        files.append((path, data.encode("utf-8") if isinstance(data, str) else data, mt))

    add("OEBPS/style.css", font_face("fonts/") + BASE_CSS + "body{margin:0 5%;}\nh1{page-break-before:always;}\n", "text/css")
    add("OEBPS/fonts/fraunces-normal.woff2", (FONTS / "fraunces-latin-opsz-normal.woff2").read_bytes(), "font/woff2")
    add("OEBPS/fonts/fraunces-italic.woff2", (FONTS / "fraunces-latin-opsz-italic.woff2").read_bytes(), "font/woff2")
    add("OEBPS/fonts/OFL-Fraunces.txt", (FONTS / "OFL-Fraunces.txt").read_bytes(), "text/plain")

    pages: list[tuple[str, str, str]] = []     # file name, nav title, properties-free body
    if cover_png:
        add("OEBPS/cover.png", cover_png.read_bytes(), "image/png")
        pages.append(("cover.xhtml", "Cover", f'<section epub:type="cover"><img src="cover.png" alt="Cover of {esc(m["title"])}" style="max-width:100%"/></section>'))
    pages.append(("title.xhtml", "Title page", f'<section epub:type="titlepage">{title_page(book)}</section>'))
    pages.append(("rights.xhtml", "About this edition", f'<section epub:type="copyright-page">{rights_page(book)}</section>'))
    for ch in book.chapters:
        body = f'<section epub:type="chapter" id="{ch.id}"><h1>{esc(ch.title)}</h1>\n{blocks_html(ch.blocks)}</section>'
        pages.append((f"{ch.id}.xhtml", ch.title, body))

    for name, title, body in pages:
        add(f"OEBPS/{name}", xhtml(title, body, lang), "application/xhtml+xml")

    nav_items = "\n".join(f'<li><a href="{n}">{esc(t)}</a></li>' for n, t, _ in pages if n not in ("cover.xhtml",))
    add("OEBPS/nav.xhtml", xhtml("Contents", f'<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>\n{nav_items}\n</ol></nav>', lang), "application/xhtml+xml")
    ncx_points = "\n".join(
        f'<navPoint id="n{i}" playOrder="{i}"><navLabel><text>{esc(t)}</text></navLabel><content src="{n}"/></navPoint>'
        for i, (n, t, _) in enumerate([p for p in pages if p[0] != "cover.xhtml"], 1))
    add("OEBPS/toc.ncx",
        '<?xml version="1.0" encoding="utf-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">\n'
        f'<head><meta name="dtb:uid" content="{ident}"/><meta name="dtb:depth" content="1"/></head>\n'
        f"<docTitle><text>{esc(m['title'])}</text></docTitle>\n<navMap>\n{ncx_points}\n</navMap>\n</ncx>\n", "application/x-dtbncx+xml")

    manifest, spine = [], []
    n = 0
    for path, _, mt in files:
        if path.startswith("OEBPS/") and not path.endswith("content.opf"):
            href = path[len("OEBPS/"):]
            n += 1
            props = ""
            if href == "nav.xhtml":
                props = ' properties="nav"'
            elif href == "cover.png":
                props = ' properties="cover-image"'
            iid = "ncx" if href == "toc.ncx" else f"i{n}"
            manifest.append(f'<item id="{iid}" href="{href}" media-type="{mt}"{props}/>')
            if href in {p[0] for p in pages}:
                spine.append((href, iid))
    spine_xml = "\n".join(f'<itemref idref="{iid}"/>' for _, iid in spine)
    subjects = "\n".join(f"<dc:subject>{esc(k)}</dc:subject>" for k in m.get("keywords", []))
    opf = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" '
        f'xml:lang="{lang}" prefix="schema: http://schema.org/">\n'
        '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n'
        f'<dc:identifier id="bookid">{ident}</dc:identifier>\n'
        f"<dc:title>{esc(m['title'])}: {esc(m['subtitle'])}</dc:title>\n"
        f'<dc:creator>{esc(s.get("author", ""))}</dc:creator>\n'
        f'<dc:publisher>{esc(s.get("publisher", ""))}</dc:publisher>\n'
        f"<dc:language>{lang}</dc:language>\n"
        f'<dc:rights>{esc(s.get("rights", ""))}</dc:rights>\n'
        f"<dc:description>{esc(m['description_short'])}</dc:description>\n"
        f"{subjects}\n"
        f'<meta property="dcterms:modified">{modified}</meta>\n'
        f'<meta property="belongs-to-collection" id="series">{esc(s.get("name", ""))}</meta>\n'
        '<meta refines="#series" property="collection-type">series</meta>\n'
        f'<meta refines="#series" property="group-position">{m.get("order", 1)}</meta>\n'
        '<meta property="schema:accessMode">textual</meta>\n'
        '<meta property="schema:accessModeSufficient">textual</meta>\n'
        '<meta property="schema:accessibilityFeature">structuralNavigation</meta>\n'
        '<meta property="schema:accessibilityFeature">tableOfContents</meta>\n'
        '<meta property="schema:accessibilityHazard">none</meta>\n'
        '<meta property="schema:accessibilitySummary">Text only, in reading order, with a table of contents and one heading '
        'level per chapter. No images carry information.</meta>\n'
        "</metadata>\n"
        f"<manifest>\n{chr(10).join(manifest)}\n</manifest>\n"
        f'<spine toc="ncx">\n{spine_xml}\n</spine>\n</package>\n'
    )
    container = ('<?xml version="1.0" encoding="utf-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n'
                 '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>\n</container>\n')

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        def put(name: str, data: bytes, compress: int) -> None:
            zi = zipfile.ZipInfo(name, ZIP_TIME)
            zi.compress_type = compress
            zi.external_attr = 0o644 << 16
            z.writestr(zi, data)
        put("mimetype", b"application/epub+zip", zipfile.ZIP_STORED)
        put("META-INF/container.xml", container.encode(), zipfile.ZIP_DEFLATED)
        put("OEBPS/content.opf", opf.encode(), zipfile.ZIP_DEFLATED)
        for path, data, _ in sorted(files, key=lambda f: f[0]):
            put(path, data, zipfile.ZIP_DEFLATED)
    return buf.getvalue()


# ---------------------------------------------------------------------------------------------------------------------
# PDF and cover (HTML for the browser)

def pdf_html(book: bk.Book) -> str:
    toc = "\n".join(f'<li><a href="#{ch.id}">{esc(ch.title)}</a></li>' for ch in book.chapters)
    chapters = "\n".join(f'<section id="{ch.id}" class="chapter"><h1>{esc(ch.title)}</h1>\n{blocks_html(ch.blocks)}</section>' for ch in book.chapters)
    css = (font_face(FONTS.as_uri() + "/").replace("fraunces-normal.woff2", "fraunces-latin-opsz-normal.woff2")
           .replace("fraunces-italic.woff2", "fraunces-latin-opsz-italic.woff2")) + BASE_CSS + f"""
@page{{size:6in 9in;}}
body{{font-size:10.5pt;line-height:1.5;}}
.chapter{{break-before:page;}}
.front{{break-after:page;}}
.front.title{{padding-top:2.2in;text-align:center;}}
.front.title h1{{font-size:2.4em;}}
.toc ol{{list-style:none;margin:0;}}
.toc li{{margin:0 0 .5em;}}
.toc a{{text-decoration:none;}}
h1{{break-after:avoid;}} h2,h3{{break-after:avoid;}} blockquote{{break-inside:avoid;}}
p{{orphans:3;widows:3;}}
"""
    return (
        f'<!DOCTYPE html>\n<html lang="{esc(book.series.get("language", "en"))}"><head><meta charset="utf-8"/>'
        f"<title>{esc(book.meta['title'])}</title><style>{css}</style></head><body>\n"
        f'<section class="front title">{title_page(book)}</section>\n'
        f'<section class="front">{rights_page(book)}</section>\n'
        f'<section class="front toc"><h1>Contents</h1><ol>\n{toc}\n</ol></section>\n'
        f"{chapters}\n</body></html>\n"
    )


def cover_html(book: bk.Book) -> str:
    m, s = book.meta, book.series
    guide = m["kind"] == "guide"
    bg, fg, sub, accent = (INK, PARCHMENT, "#C9D6E6", GOLD) if guide else (PARCHMENT, INK, STONE, GOLD_INK)
    mark = (MARKS / ("camino-plus-mark-gold.svg" if guide else "camino-plus-mark-navy.svg")).read_text(encoding="utf-8")
    mark = re.sub(r'width="40" height="40"', 'width="220" height="220"', mark)
    eyebrow = "A PILGRIM’S GUIDE" if guide else "READINGS FOR THE WAY"
    if guide:
        foot = "Camino de Santiago"
    else:
        src = (m.get("sources") or [{}])[0]
        foot = f"From {src.get('author', '')}" if src else ""
    title = esc(m["title"])
    size = 220 if len(m["title"]) <= 14 else 180 if len(m["title"]) <= 24 else 150
    fonts = font_face(FONTS.as_uri() + "/").replace("fraunces-normal.woff2", "fraunces-latin-opsz-normal.woff2").replace(
        "fraunces-italic.woff2", "fraunces-latin-opsz-italic.woff2")
    inter = f"@font-face{{font-family:'Inter';font-weight:100 900;src:url('{FONTS.as_uri()}/inter-latin-wght-normal.woff2') format('woff2');}}\n"
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"/><title>{title}</title><style>
{fonts}{inter}
html,body{{margin:0;padding:0;}}
.cover{{width:1600px;height:2560px;background:{bg};color:{fg};position:relative;overflow:hidden;box-sizing:border-box;padding:170px 150px;
  display:flex;flex-direction:column;justify-content:space-between;}}
.cover:before{{content:"";position:absolute;inset:60px;border:4px solid {accent};opacity:.7;}}
.top{{display:flex;flex-direction:column;align-items:center;gap:70px;}}
.eyebrow{{font-family:Inter,sans-serif;font-weight:600;font-size:46px;letter-spacing:.28em;color:{accent};}}
.mid{{text-align:center;}}
h1{{font-family:Fraunces,serif;font-weight:700;font-size:{size}px;line-height:1.05;margin:0 0 70px;color:{fg};}}
.sub{{font-family:Fraunces,serif;font-style:italic;font-size:70px;line-height:1.25;color:{sub};}}
.bottom{{text-align:center;font-family:Inter,sans-serif;font-weight:600;font-size:44px;letter-spacing:.22em;color:{sub};}}
.rule{{width:220px;height:6px;background:{accent};margin:0 auto 60px;}}
</style></head><body><div class="cover">
<div class="top">{mark}<div class="eyebrow">{eyebrow}</div></div>
<div class="mid"><h1>{title}</h1><div class="rule"></div><div class="sub">{esc(m["subtitle"])}</div></div>
<div class="bottom">{esc(foot.upper())}<br/><span style="font-size:36px;letter-spacing:.3em">{esc(s.get("name", "").upper())}</span></div>
</div></body></html>
"""


# ---------------------------------------------------------------------------------------------------------------------
# Store metadata and the app bundle

def store_json(book: bk.Book, pdf_pages: int | None) -> dict:
    m, s = book.meta, book.series
    return {
        "id": book.id,
        "title": m["title"],
        "subtitle": m["subtitle"],
        "series": {"name": s.get("name"), "position": m.get("order")},
        "author": s.get("author"),
        "publisher": s.get("publisher"),
        "language": s.get("language", "en"),
        "description_short": m["description_short"],
        "description_long": m["description_long"],
        "description_long_html": "".join(f"<p>{esc(p.strip())}</p>" for p in m["description_long"].split("\n\n") if p.strip()),
        "keywords": m["keywords"],
        "categories": m["categories"],
        "rights": s.get("rights"),
        "ai_disclosure": s.get("ai_disclosure"),
        "words": book.words,
        "reading_minutes": book.minutes,
        "pdf_pages": pdf_pages,
        "version": m.get("version", "1.0.0"),
        "date": m.get("date"),
        "isbn": None,
        "price": None,
        "notes": "isbn and price are decisions for the publisher: leave null until they are made. Disclose the AI assistance "
                 "(ai_disclosure) where the store asks about AI-generated content.",
    }


def app_book(book: bk.Book) -> dict:
    m, s = book.meta, book.series
    out = {
        "id": book.id, "kind": m["kind"], "title": m["title"], "subtitle": m["subtitle"], "author": s.get("author"),
        "rights": s.get("rights"), "ai_disclosure": s.get("ai_disclosure"),
        "chapters": [{"id": ch.id, "title": ch.title, "blocks": ch.blocks} for ch in book.chapters],
    }
    if m.get("sources"):
        out["sources"] = [{k: v for k, v in src.items() if k in ("work", "author", "translator", "year", "licence")} for src in m["sources"]]
    return out


def app_catalog_entry(book: bk.Book) -> dict:
    m = book.meta
    e = {
        "id": book.id, "kind": m["kind"], "order": m.get("order", 999), "title": m["title"], "subtitle": m["subtitle"],
        "description": m["description_short"], "words": book.words, "minutes": book.minutes, "cover": m["cover"],
        "chapters": [{"id": ch.id, "title": ch.title, "minutes": ch.minutes} for ch in book.chapters],
    }
    if m.get("route_slug"):
        e["route_slug"] = m["route_slug"]
    return e


def dumps(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n"


def app_bundle(books: list[bk.Book]) -> dict[str, str]:
    """The files of the app bundle, as {relative path: text}."""
    files = {"catalog.json": json.dumps({"version": 1, "books": [app_catalog_entry(b) for b in books]}, ensure_ascii=False, indent=1) + "\n"}
    for b in books:
        files[f"books/{b.id}.json"] = dumps(app_book(b))
    return files


def app_index(books: list[bk.Book], app_out: pathlib.Path, index_path: pathlib.Path) -> str:
    """The TypeScript module the app imports: the catalog, and a loader per book that reads the text only when it is called."""
    rel = pathlib.Path(__import__("os").path.relpath(app_out, index_path.parent)).as_posix()
    loaders = "\n".join(f"  '{b.id}': () => require('{rel}/books/{b.id}.json') as BookContent," for b in books)
    return (
        "// GENERATED by tools/build_books.py from books/. Do not edit: run `python3 tools/build_books.py --no-render` and commit.\n"
        "// The books of the Library as the app reads them. The catalog is small and is read when the Library opens. A book's text is read\n"
        "// (and parsed) only when someone opens it: each require() below runs when its function is called, not when this file is imported.\n"
        "import type { BookContent, CatalogBook } from './books';\n\n"
        f"export const CATALOG: readonly CatalogBook[] = (require('{rel}/catalog.json') as {{ books: CatalogBook[] }}).books;\n\n"
        "const CONTENT: Record<string, () => BookContent> = {\n"
        f"{loaders}\n"
        "};\n\n"
        "/** The text of a book, or null when the catalog has no such book. */\n"
        "export const loadBookContent = (id: string): BookContent | null => (CONTENT[id] ? CONTENT[id]() : null);\n"
    )


def write_app_bundle(books: list[bk.Book], app_out: pathlib.Path, index_path: pathlib.Path | None = None) -> None:
    files = app_bundle(books)
    if index_path is not None:
        index_path.parent.mkdir(parents=True, exist_ok=True)
        index_path.write_text(app_index(books, app_out, index_path), encoding="utf-8")
    (app_out / "books").mkdir(parents=True, exist_ok=True)
    for stale in (app_out / "books").glob("*.json"):
        if f"books/{stale.name}" not in files:
            stale.unlink()
    for rel, text in files.items():
        (app_out / rel).write_text(text, encoding="utf-8")


def check_app_bundle(books: list[bk.Book], app_out: pathlib.Path, index_path: pathlib.Path | None = None) -> list[str]:
    """What differs between the bundle books/ would make and the one committed: an empty list means in sync."""
    want = app_bundle(books)
    have = {str(p.relative_to(app_out)): p.read_text(encoding="utf-8") for p in app_out.rglob("*.json")} if app_out.exists() else {}
    problems = []
    for rel in sorted(set(want) | set(have)):
        if rel not in have:
            problems.append(f"missing: {rel}")
        elif rel not in want:
            problems.append(f"stale (no such book): {rel}")
        elif want[rel] != have[rel]:
            problems.append(f"differs: {rel}")
    if index_path is not None:
        text = index_path.read_text(encoding="utf-8") if index_path.exists() else None
        if text is None:
            problems.append(f"missing: {index_path.name}")
        elif text != app_index(books, app_out, index_path):
            problems.append(f"differs: {index_path.name}")
    return problems


# ---------------------------------------------------------------------------------------------------------------------

def pdf_page_count(path: pathlib.Path) -> int | None:
    try:
        return len(re.findall(rb"/Type\s*/Page(?![s\w])", path.read_bytes()))
    except OSError:
        return None


def build(book_dirs: list[pathlib.Path], out: pathlib.Path, app_out: pathlib.Path, render: bool, index_path: pathlib.Path | None = None) -> int:
    series = bk.load_series()
    books = [bk.load_book(d, series) for d in book_dirs]
    out.mkdir(parents=True, exist_ok=True)
    jobs = []
    for b in books:
        d = out / b.id
        d.mkdir(parents=True, exist_ok=True)
        (d / "cover.html").write_text(cover_html(b), encoding="utf-8")
        (d / "book.pdf.html").write_text(pdf_html(b), encoding="utf-8")
        jobs.append({"title": b.id, "cover_html": str(d / "cover.html"), "cover_png": str(d / f"{b.id}.cover.png"),
                     "pdf_html": str(d / "book.pdf.html"), "pdf": str(d / f"{b.id}.pdf")})
    rendered = False
    if render and jobs:
        node = shutil.which("node")
        if not node:
            print("node not found: building without cover images and PDFs (use --no-render to silence this)", file=sys.stderr)
        else:
            with tempfile.TemporaryDirectory() as t:
                jf = pathlib.Path(t) / "jobs.json"
                jf.write_text(json.dumps(jobs), encoding="utf-8")
                r = subprocess.run([node, str(ROOT / "tools" / "render_books.mjs"), str(jf)])
                rendered = r.returncode == 0
                if not rendered:
                    print("the browser step failed: EPUBs are built, but the covers or PDFs may be missing", file=sys.stderr)
    for b in books:
        d = out / b.id
        cover = d / f"{b.id}.cover.png"
        (d / f"{b.id}.epub").write_bytes(epub_bytes(b, cover if cover.is_file() else None))
        pages = pdf_page_count(d / f"{b.id}.pdf")
        (d / "store.json").write_text(json.dumps(store_json(b, pages), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"built {b.id:<36} {b.words:>7,} words  {bk.format_minutes(b.minutes):>9}  epub{' + cover' if cover.is_file() else ''}"
              f"{' + pdf (%s pages)' % pages if pages else ''}")
    write_app_bundle(books, app_out, index_path)
    print(f"app bundle: {app_out.relative_to(ROOT) if app_out.is_relative_to(ROOT) else app_out} ({len(books)} books)")
    return 0 if (rendered or not render) else 1


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Build the books of books/ (EPUB, PDF, cover, store metadata, app bundle).")
    ap.add_argument("--only", nargs="*", default=[], metavar="ID", help="build only these books")
    ap.add_argument("--out", type=pathlib.Path, default=DEFAULT_OUT, help="where the EPUB, PDF, cover and store.json go (default books/dist)")
    ap.add_argument("--app-out", type=pathlib.Path, default=DEFAULT_APP_OUT, help="where the app bundle goes (default mobile/assets/library)")
    ap.add_argument("--app-index", type=pathlib.Path, default=DEFAULT_APP_INDEX, help="the TypeScript module the app imports (default mobile/src/features/library/bookBundle.ts)")
    ap.add_argument("--no-render", action="store_true", help="no browser: no PDF, no cover PNG")
    ap.add_argument("--check", action="store_true", help="only verify that the app bundle is in sync with books/ (exit 1 if not)")
    args = ap.parse_args(argv)
    dirs = bk.find_books()
    if args.only:
        dirs = [d for d in dirs if d.name in args.only]
        missing = set(args.only) - {d.name for d in dirs}
        if missing:
            print(f"no such book: {', '.join(sorted(missing))}", file=sys.stderr)
            return 2
    if args.check:
        books = [bk.load_book(d, bk.load_series()) for d in bk.find_books()]
        problems = check_app_bundle(books, args.app_out, args.app_index)
        for p in problems:
            print(f"app bundle {p}")
        if problems:
            print("Run: python3 tools/build_books.py --no-render, then commit mobile/assets/library and mobile/src/features/library/bookBundle.ts", file=sys.stderr)
            return 1
        print(f"app bundle in sync ({len(books)} books)")
        return 0
    return build(dirs, args.out, args.app_out, render=not args.no_render, index_path=args.app_index)


if __name__ == "__main__":
    sys.exit(main())
