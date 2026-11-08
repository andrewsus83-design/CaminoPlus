#!/usr/bin/env python3
"""Quality gate for the books in books/. Run it before a book goes to tools/build_books.py (and CI runs it on all of them).

    python3 tools/check_books.py                         every book in books/
    python3 tools/check_books.py books/camino-ingles-guide
    python3 tools/check_books.py books/imitation-of-christ-reflections --sources /tmp/book-sources
    python3 tools/check_books.py --strict                warnings fail too

What it checks (the rules are in .claude/skills/book-writer):
  * book.json is complete (kind, title, description lengths, keywords, cover, sources of a reflection book);
  * chapters are numbered, start with one `#` title, and use only the Markdown subset (no tables, images, HTML, emoji);
  * length: a guide is at most 12,000 words; a reflection book is about 1,400 to 2,000 words a day and never over 3 hours of reading;
  * a guide has its fact ledger and states no price, phone number, coordinate or web address outside "Sources";
  * a reflection book has the number of days its book.json says (3 to 21), each with its five parts (passage, reflection, for the walk, end of the day, prayer) in order, a 5-minute
    morning and a 3-minute evening, and **every quoted passage is found, word for word, in the
    public-domain source named in book.json** (the source files are given with --sources; they are not in the repository).

Exit status 1 when there is any error (or any warning with --strict).
"""
from __future__ import annotations

import argparse
import dataclasses
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

import book_kit as bk  # noqa: E402

GUIDE_MAX_WORDS = 12_000
GUIDE_MIN_WORDS = 9_000
REFLECTION_HARD_MAX_WORDS = 39_000          # 3 hours at 220 words a minute is 39,600
DAYS = (3, 21)                              # a reflection book has as many days as suits its classic and its Camino, never more than three weeks
DAY_WORDS_MIN, DAY_WORDS_MAX = 1400, 2000   # one day: a 5-minute morning reading and a 3-minute evening reflection
FRONT_BACK_WORDS_MAX = 3500                 # how to use the book, about the author, carry it with you
MAX_QUOTED_SHARE = 0.30                     # the classic is the guest: quoted passages are a minority of the book
READING_PARTS = ("The passage", "Reflection", "For the walk", "At the end of the day", "A short prayer")
MORNING_PARTS = READING_PARTS[:3]           # about 5 minutes
EVENING_PARTS = READING_PARTS[3:]           # about 3 minutes
MORNING_WORDS = (850, 1350)
EVENING_WORDS = (450, 800)
READING_WORDS = (DAY_WORDS_MIN, DAY_WORDS_MAX)      # one whole day
DESCRIPTION_SHORT_MAX = 200
DESCRIPTION_LONG = (600, 2500)
KEYWORDS_MAX = 7
KEYWORD_CHARS = 50

AVOID_WORDS = ("bucket list", "must-see", "must see", "game-changing", "game changing", "revolutionary", "crush it",
               "ai-powered", "tour package", "life hack", "life-hack")
EMOJI = re.compile("[\U0001F300-\U0001FAFF☀-➿⬀-⯿️]")
HTML = re.compile(r"<\s*[A-Za-z/!][^>]*>")
PRICE = re.compile(r"[€$£]\s?\d|\b\d[\d.,]*\s?(?:€|euros?|EUR|USD|dollars?|GBP)\b", re.I)
PHONE = re.compile(r"(?<!\d)(?<!\d\.)\+?\d(?:[\d ().-]{7,})\d(?!\d|\.\d)")   # a full stop after the number is a sentence end, not a decimal
COORD = re.compile(r"(?<!\d)-?\d{1,3}\.\d{4,}(?!\d)")
URL = re.compile(r"https?://|www\.", re.I)
KM_NO_TILDE = re.compile(r"(?<![~\d.,])\b\d+(?:[.,]\d+)?\s?(?:km|kilometres|kilometers)\b", re.I)
HOURS = re.compile(r"\b(?:opens?|closes?|closed|open)\b[^.;\n]{0,40}?\b\d{1,2}(?:[:.]\d{2})?\s?(?:am|pm|h)\b", re.I)
SOURCES_CHAPTER = re.compile(r"source|thanks|credit", re.I)


@dataclasses.dataclass
class Report:
    book: str
    kind: str = "?"
    words: int = 0
    errors: list[str] = dataclasses.field(default_factory=list)
    warnings: list[str] = dataclasses.field(default_factory=list)

    def error(self, msg: str) -> None:
        self.errors.append(msg)

    def warn(self, msg: str) -> None:
        self.warnings.append(msg)


# ---------------------------------------------------------------------------------------------------------------------
# Comparing a passage with its source

def _strict(s: str) -> str:
    """Whitespace, quote marks, dashes and the underscores of a plain-text italic made equal; punctuation and case kept."""
    s = s.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    s = re.sub(r"\s*(?:--|—|–)\s*", " — ", s)
    s = s.replace("_", "")
    return re.sub(r"\s+", " ", s).strip()


def _loose(s: str) -> str:
    """Only the words, lower case: a passage whose words are in the source in the same order, with any punctuation."""
    s = re.sub(r"[^\w\s]", " ", _strict(s).lower())
    return re.sub(r"\s+", " ", s).strip()


def _clean_source(text: str, web: bool) -> str:
    m = re.search(r"\*\*\* START OF .*?\*\*\*", text)
    n = re.search(r"\*\*\* END OF ", text)
    if m and n:
        text = text[m.end():n.start()]
    if web:   # the World English Bible: verse numbers like 121:001 and <<headings>> are not text
        text = re.sub(r"<<[^>]*>>", " ", text)
        text = re.sub(r"(?<!\d)\d{1,3}:\d{3}(?!\d)", " ", text)
    return text


class Sources:
    """The source texts of a reflection book, read from a folder holding pg<number>.txt files (Project Gutenberg plain text)."""

    def __init__(self, folder: pathlib.Path | None):
        self.folder = folder
        self._cache: dict[str, tuple[str, str]] = {}

    def get(self, source: dict) -> tuple[str, str] | None:
        sid = source.get("id", "")
        if sid in self._cache:
            return self._cache[sid]
        m = re.fullmatch(r"gutenberg-(\d+)", sid)
        if not (self.folder and m):
            return None
        path = self.folder / f"pg{m.group(1)}.txt"
        if not path.is_file():
            return None
        web = "world english bible" in source.get("work", "").lower()
        text = _clean_source(path.read_text(encoding="utf-8", errors="replace"), web)
        pair = (_strict(text), _loose(text))
        self._cache[sid] = pair
        return pair


def verify_passage(text: str, sources: list[tuple[str, str]]) -> str:
    """'exact' | 'loose' | 'missing'. `…` between stretches means each stretch is looked for on its own."""
    segments = [s for s in re.split(r"\s*(?:…|\.\.\.|\[\.\.\.\])\s*", text) if s.strip()]
    if not segments or not sources:
        return "missing"
    verdict = "exact"
    for seg in segments:
        strict, loose = _strict(seg), _loose(seg)
        if any(strict in s for s, _ in sources):
            continue
        if loose and any(loose in l for _, l in sources):
            verdict = "loose"
            continue
        return "missing"
    return verdict


# ---------------------------------------------------------------------------------------------------------------------
# The checks

def _meta(book: bk.Book, rep: Report, series: dict) -> None:
    m = book.meta
    for key in ("id", "kind", "title", "subtitle", "description_short", "description_long", "keywords", "categories", "cover"):
        if key not in m:
            rep.error(f"book.json: missing '{key}'")
    if m.get("id") != book.dir.name:
        rep.error(f"book.json: id '{m.get('id')}' must equal the folder name '{book.dir.name}'")
    if m.get("kind") not in bk.KINDS:
        rep.error(f"book.json: kind must be one of {bk.KINDS}")
    if len(m.get("description_short", "")) > DESCRIPTION_SHORT_MAX:
        rep.error(f"book.json: description_short is {len(m['description_short'])} characters, the limit is {DESCRIPTION_SHORT_MAX}")
    n = len(m.get("description_long", ""))
    if "description_long" in m and not DESCRIPTION_LONG[0] <= n <= DESCRIPTION_LONG[1]:
        rep.error(f"book.json: description_long is {n} characters, it must be {DESCRIPTION_LONG[0]} to {DESCRIPTION_LONG[1]}")
    kw = m.get("keywords", [])
    if not isinstance(kw, list) or len(kw) > KEYWORDS_MAX or any(not isinstance(k, str) or len(k) > KEYWORD_CHARS for k in kw):
        rep.error(f"book.json: keywords must be a list of at most {KEYWORDS_MAX}, each {KEYWORD_CHARS} characters or fewer")
    cover = m.get("cover", {})
    if cover.get("colour") not in bk.COVER_COLOURS:
        rep.error(f"book.json: cover.colour must be one of {bk.COVER_COLOURS}")
    if cover.get("icon") not in bk.COVER_ICONS:
        rep.error(f"book.json: cover.icon must be one of {bk.COVER_ICONS}")
    if m.get("kind") == "guide" or (m.get("kind") == "reflection" and m.get("route_slug")):
        slug = m.get("route_slug")
        if not slug:
            rep.error("book.json: a guide needs route_slug (the app's route, for example camino-ingles)")
        else:
            catalog = "\n".join(p.read_text(encoding="utf-8", errors="replace") for p in (bk.ROOT / "supabase" / "migrations").glob("*.sql"))
            if f"'{slug}'" not in catalog:
                rep.warn(f"book.json: route_slug '{slug}' is not in the app's catalog (supabase/migrations)")
    if m.get("kind") == "reflection":
        srcs = m.get("sources")
        if not srcs:
            rep.error("book.json: a reflection book needs 'sources' (id, work, author, translator, year, licence, url)")
        else:
            for s in srcs:
                miss = [k for k in ("id", "work", "author", "translator", "year", "licence", "url") if not s.get(k)]
                if miss:
                    rep.error(f"book.json: source '{s.get('id', '?')}' lacks {', '.join(miss)}")
    for key in ("publisher", "rights", "ai_disclosure", "language"):
        if not series.get(key):
            rep.error(f"books/series.json: missing '{key}'")


def _raw_lines(chapter_path: pathlib.Path, rep: Report, cid: str) -> None:
    in_fence = False
    for n, line in enumerate(chapter_path.read_text(encoding="utf-8").splitlines(), 1):
        if line.strip().startswith("```"):
            in_fence = not in_fence
        s = line.strip()
        if re.match(r"^\|.*\|$", s) or re.match(r"^\|?\s*:?-{3,}:?\s*\|", s):
            rep.error(f"{cid}:{n}: a table (use a list: tables do not fit a phone or an EPUB)")
        if HTML.search(line):
            rep.error(f"{cid}:{n}: raw HTML ({HTML.search(line).group(0)[:30]!r})")
        if "![" in line:
            rep.error(f"{cid}:{n}: an image (books have none yet)")
        if EMOJI.search(line):
            rep.error(f"{cid}:{n}: an emoji (none in books)")


def _chapters(book: bk.Book, rep: Report) -> None:
    if not book.chapters:
        rep.error("no chapters in chapters/*.md")
    seen = set()
    for ch in book.chapters:
        cid = ch.file
        if not re.fullmatch(r"\d\d-[a-z0-9][a-z0-9-]*\.md", ch.file):
            rep.error(f"{cid}: file names are two digits, a dash and lower-case words, for example 03-the-way-in-brief.md")
        if ch.id in seen:
            rep.error(f"{cid}: duplicate chapter")
        seen.add(ch.id)
        h1 = [b for b in ch.all_blocks if b["t"] == "h" and b["level"] == 1]
        if not ch.all_blocks or ch.all_blocks[0]["t"] != "h" or ch.all_blocks[0]["level"] != 1 or len(h1) != 1:
            rep.error(f"{cid}: the file must start with one '# Title' and have no other '#' heading")
        for b in ch.all_blocks:
            if b["t"] == "h" and b["level"] > 3:
                rep.error(f"{cid}: heading level {b['level']} ('{bk.plain(b['spans'])[:30]}'): use ## and ### only")
            if b.get("unbalanced"):
                rep.error(f"{cid}: an unclosed * or ** near '{bk.block_text(b)[:40]}'")
        _raw_lines(book.dir / "chapters" / ch.file, rep, cid)
        text = " ".join(bk.block_text(b) for b in ch.all_blocks).lower()
        for w in AVOID_WORDS:
            if w in text:
                rep.warn(f"{cid}: brand word to avoid: '{w}'")
        if re.search(r"\bcaminoplus plan\b", text):
            rep.error(f"{cid}: the paid plan is called 'Pilgrim Plus', never 'CaminoPlus plan'")
        if re.search(r"\b(?:users?|customers?)\b", text) and book.meta.get("kind") == "guide":
            rep.warn(f"{cid}: say 'pilgrim', not 'user' or 'customer'")


def _guide(book: bk.Book, rep: Report) -> None:
    w = book.words
    if w > GUIDE_MAX_WORDS:
        rep.error(f"{w:,} words: a guide is at most {GUIDE_MAX_WORDS:,}")
    elif w < GUIDE_MIN_WORDS:
        rep.warn(f"{w:,} words: a guide is usually {GUIDE_MIN_WORDS:,} to {GUIDE_MAX_WORDS:,}")
    facts = book.dir / "facts.md"
    if not facts.is_file():
        rep.error("facts.md: a guide needs its fact ledger (see reference/guidebook.md)")
    else:
        rows = [ln for ln in facts.read_text(encoding="utf-8").splitlines() if ln.startswith("|") and not re.match(r"^\|\s*-", ln)]
        if len(rows) - 1 < 15:
            rep.warn(f"facts.md: only {max(len(rows) - 1, 0)} rows; a guide of this size states more facts than that")
    km_hits: list[str] = []
    for ch in book.chapters:
        in_sources = bool(SOURCES_CHAPTER.search(ch.title))
        for b in ch.blocks:
            t = bk.block_text(b)
            for line in t.splitlines():
                if PRICE.search(line):
                    rep.error(f"{ch.file}: a price ('{PRICE.search(line).group(0)}'): books state no prices, send the reader to the app")
                if COORD.search(line):
                    rep.error(f"{ch.file}: coordinates ('{COORD.search(line).group(0)}'): books state none")
                p = PHONE.search(line)
                if p and sum(c.isdigit() for c in p.group(0)) >= 9:
                    rep.error(f"{ch.file}: a phone number ('{p.group(0)}')")
                if URL.search(line) and not in_sources:
                    rep.warn(f"{ch.file}: a web address outside the sources chapter")
                if HOURS.search(line):
                    rep.warn(f"{ch.file}: an opening time ('{HOURS.search(line).group(0)[:40]}'): hours change, send the reader to the app")
                for km in KM_NO_TILDE.finditer(line):
                    km_hits.append(f"{ch.file}: '{km.group(0)}'")
    if km_hits:
        rep.warn(f"{len(km_hits)} distance(s) without '~' (approximate figures are marked with ~), e.g. " + "; ".join(km_hits[:4]))


def _section(ch: bk.Chapter, name: str) -> list[dict]:
    """The blocks under the '## name' heading of a chapter, up to the next '##'."""
    out, inside = [], False
    for b in ch.all_blocks:
        if b["t"] == "h" and b["level"] == 2:
            inside = bk.plain(b["spans"]) == name
        elif inside:
            out.append(b)
    return out


def _reflection(book: bk.Book, rep: Report, sources_dir: pathlib.Path | None) -> None:
    w = book.words
    days = book.meta.get("days")
    if not isinstance(days, int) or not DAYS[0] <= days <= DAYS[1]:
        rep.error(f"book.json: 'days' must be a whole number from {DAYS[0]} to {DAYS[1]} (the number of days of the book)")
        days = None
    if w > REFLECTION_HARD_MAX_WORDS:
        rep.error(f"{w:,} words is {bk.format_minutes(book.minutes)} of reading: the ceiling is 3 hours ({REFLECTION_HARD_MAX_WORDS:,} words)")
    elif days:
        lo, hi = days * DAY_WORDS_MIN, days * DAY_WORDS_MAX + FRONT_BACK_WORDS_MAX
        if not lo <= w <= hi:
            rep.warn(f"{w:,} words for {days} days: expect {lo:,} to {hi:,} (a day is {DAY_WORDS_MIN:,} to {DAY_WORDS_MAX:,} words)")
    srcs = Sources(sources_dir)
    loaded: list[tuple[str, str]] = []
    for s in book.meta.get("sources", []):
        pair = srcs.get(s)
        if pair:
            loaded.append(pair)
    if not loaded:
        rep.error("no source text to verify the passages against: pass --sources <folder with pg<number>.txt> "
                  "(see reference/reflection.md for how to fetch them)")
    readings = 0
    for ch in book.chapters:
        sections: dict[str, int] = {}
        current = None
        has_cite = False
        for b in ch.all_blocks:
            if b["t"] == "h" and b["level"] == 2:
                current = bk.plain(b["spans"])
                sections[current] = sections.get(current, 0) + 1
            if b["t"] == "quote":
                text = " ".join(bk.plain(p) for p in b["paras"])
                n = bk.count_words(text)
                if loaded:
                    v = verify_passage(text, loaded)
                    if v == "missing":
                        rep.error(f"{ch.file}: a quoted passage is not in the source text: '{text[:70]}…'")
                    elif v == "loose":
                        rep.warn(f"{ch.file}: a passage matches its source in words but not in punctuation or capitals: '{text[:50]}…'")
                if current == "The passage":
                    has_cite = has_cite or bool(b["cite"])
                    if not b["cite"]:
                        rep.error(f"{ch.file}: the passage has no attribution line (a last quote paragraph starting with an em dash)")
                    else:
                        cite = bk.plain(b["cite"]).lower()
                        if not any(s["work"].lower() in cite or s["author"].split()[-1].lower() in cite for s in book.meta.get("sources", [])):
                            rep.warn(f"{ch.file}: the attribution does not name the work or the author of a source in book.json")
                    if not 25 <= n <= 300:
                        rep.warn(f"{ch.file}: the passage is {n} words (aim for 40 to 250)")
        if "The passage" in sections:
            readings += 1
            for part in READING_PARTS:
                if sections.get(part) != 1:
                    rep.error(f"{ch.file}: a day has exactly one '## {part}' (found {sections.get(part, 0)})")
            order = [bk.plain(b["spans"]) for b in ch.all_blocks if b["t"] == "h" and b["level"] == 2 and bk.plain(b["spans"]) in READING_PARTS]
            if order != list(READING_PARTS) and all(sections.get(p) == 1 for p in READING_PARTS):
                rep.error(f"{ch.file}: the parts of a day come in this order: {', '.join(READING_PARTS)}")
            part_words: dict[str, int] = {}
            cur = None
            for b in ch.all_blocks:
                if b["t"] == "h" and b["level"] == 2:
                    cur = bk.plain(b["spans"])
                elif cur:
                    part_words[cur] = part_words.get(cur, 0) + bk.count_words(bk.block_text(b))
            evening_list = next((b for b in _section(ch, "At the end of the day") if b["t"] == "ul"), None)
            if evening_list is None:
                rep.error(f"{ch.file}: '## At the end of the day' needs its questions as a '-' list: the app shows them as the reflection prompt")
            elif not 2 <= len(evening_list["items"]) <= 4:
                rep.warn(f"{ch.file}: {len(evening_list['items'])} end-of-day questions (aim for 2 or 3)")
            morning = sum(part_words.get(p, 0) for p in MORNING_PARTS)
            evening = sum(part_words.get(p, 0) for p in EVENING_PARTS)
            if not MORNING_WORDS[0] <= morning <= MORNING_WORDS[1]:
                rep.warn(f"{ch.file}: the morning reading is {morning:,} words, about {bk.reading_minutes(morning)} min (aim for 5 min: {MORNING_WORDS[0]:,} to {MORNING_WORDS[1]:,} words)")
            if not EVENING_WORDS[0] <= evening <= EVENING_WORDS[1]:
                rep.warn(f"{ch.file}: the end-of-day reflection is {evening:,} words, about {bk.reading_minutes(evening)} min (aim for 3 min: {EVENING_WORDS[0]:,} to {EVENING_WORDS[1]:,} words)")
            if not has_cite:
                rep.error(f"{ch.file}: no quoted, attributed passage under '## The passage'")
            if not READING_WORDS[0] <= ch.words <= READING_WORDS[1]:
                rep.warn(f"{ch.file}: {ch.words:,} words (a day is {READING_WORDS[0]:,} to {READING_WORDS[1]:,})")
    if days is not None and readings != days:
        rep.error(f"{readings} day chapters found, book.json says {days} days")
    if readings == 0:
        rep.error("no day chapters found (a day has a '## The passage' section)")
    quoted = sum(bk.count_words(" ".join(bk.plain(p) for p in b["paras"])) for ch in book.chapters for b in ch.all_blocks if b["t"] == "quote")
    if book.words and quoted / book.words > MAX_QUOTED_SHARE:
        rep.warn(f"quoted passages are {quoted / book.words:.0%} of the words: the reflections are the book, keep the quotes under {MAX_QUOTED_SHARE:.0%}")


def check_book(book_dir: pathlib.Path, sources_dir: pathlib.Path | None = None) -> Report:
    book_dir = pathlib.Path(book_dir)
    rep = Report(book_dir.name)
    if not (book_dir / "book.json").is_file():
        rep.error("book.json not found")
        return rep
    try:
        book = bk.load_book(book_dir)
    except ValueError as e:
        rep.error(f"book.json is not valid JSON: {e}")
        return rep
    rep.kind, rep.words = book.meta.get("kind", "?"), book.words
    _meta(book, rep, book.series)
    _chapters(book, rep)
    if rep.kind == "guide":
        _guide(book, rep)
    elif rep.kind == "reflection":
        _reflection(book, rep, sources_dir)
    return rep


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Check the books in books/ against the rules of the book-writer skill.")
    ap.add_argument("books", nargs="*", type=pathlib.Path, help="book folders (default: every book in books/)")
    ap.add_argument("--sources", type=pathlib.Path, help="folder with the source texts (pg<number>.txt) of the reflection books")
    ap.add_argument("--strict", action="store_true", help="warnings are errors")
    ap.add_argument("--quiet", action="store_true", help="only print books with errors or warnings")
    args = ap.parse_args(argv)
    dirs = args.books or bk.find_books()
    if not dirs:
        print("no books found")
        return 0
    failed = 0
    for d in dirs:
        rep = check_book(d, args.sources)
        bad = bool(rep.errors) or (args.strict and bool(rep.warnings))
        failed += bad
        if args.quiet and not rep.errors and not rep.warnings:
            continue
        mins = bk.format_minutes(bk.reading_minutes(rep.words))
        print(f"{'FAIL' if bad else 'ok  '} {rep.book:<36} {rep.kind:<10} {rep.words:>7,} words  {mins:>9}  "
              f"{len(rep.errors)} errors  {len(rep.warnings)} warnings")
        for e in rep.errors:
            print(f"      error: {e}")
        for w in rep.warnings:
            print(f"      warning: {w}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
