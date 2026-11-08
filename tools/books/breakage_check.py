#!/usr/bin/env python3
"""Do the guards of tools/books and of the book tests really guard? Each entry below breaks one thing in one place (a rule of the cleaning, a hash, a
verdict, a path, a character in a text) and runs the tests: every breakage must turn something red, and every file is put back byte for byte (its sha256 is
compared at the end). It edits the files in place and restores them in a `finally`, so run it on a clean working tree:

    python3 tools/books/breakage_check.py                 # all breakages (about 5 minutes: the mobile ones compile the library tests)
    python3 tools/books/breakage_check.py licences        # only the breakages whose name contains "licences"

Exit code 1 if a breakage stayed green, was skipped because its text is not unique, or a file was not restored. Needs mobile/node_modules.
"""
import hashlib
import os
import pathlib
import subprocess
import sys

ROOT = str(pathlib.Path(__file__).resolve().parents[2])
PY = ["python3", "-m", "unittest", "discover", "-s", "tools/tests"]
TS = ["sh", "-c", "cd mobile && npx tsc -p tsconfig.librarytest.json && node node_modules/.cache/library-test/features/library/__tests__/library.test.js"]
B = "tools/books/"
M = "mobile/src/features/library/books/"
A = "mobile/assets/books/"

# (name, runner, file, old, new)
MUTATIONS = [
    ("tidy keeps _italics_", PY, B + "books_clean.py", 't = _ITALIC.sub(r"\\1", t)', "t = t"),
    ("tidy turns only -- into a dash", PY, B + "books_clean.py", "(?<!-)-{2,3}(?!-)", "(?<!-)-{2}(?!-)"),
    ("unwrap glues a hyphen only before a capital", PY, B + "books_clean.py", "and out[-2:-1].isalpha() and s[:1].islower():", "and out[-2:-1].isalpha() and s[:1].isupper():"),
    ("strip_markers leaves no space", PY, B + "books_clean.py", 'return " " if full != full.rstrip() else ""', 'return ""'),
    ("the library's name is no longer refused", PY, B + "books_clean.py", '(re.compile(r"gutenberg", re.I), "the name of the digital library"),', '(re.compile(r"(?!x)x"), "x"),'),
    ("an underscore is no longer refused", PY, B + "books_clean.py", '(re.compile(r"_"), "an underscore (an emphasis mark that was left in)"),', '(re.compile(r"(?!x)x"), "x"),'),
    ("a double space is allowed", PY, B + "books_clean.py", '(re.compile(r" {2}"), "a double space"),', '(re.compile(r" {3}"), "a double space"),'),
    ("a page number alone is allowed", PY, B + "books_clean.py", '(re.compile(r"^[\\[(]?(?:[0-9]+|[IVXLCDM]+)[\\])]?\\.?$"), "a page or section number on its own"),', '(re.compile(r"(?!x)x"), "x"),'),
    ("two START marks are accepted", PY, B + "books_clean.py", "if len(starts) != 1 or len(ends) != 1 or starts[0] > ends[0]:", "if len(starts) < 1 or len(ends) != 1 or starts[0] > ends[0]:"),
    ("a loose heading is a paragraph", PY, B + "books_build.py", "if len(flat.split()) <= 12 and (", "if len(flat.split()) <= 0 and ("),
    ("a chapter without text is accepted", PY, B + "books_build.py", "        for ch in self.chapters:\n            if not ch.blocks:\n                raise BookError(self.book, ch.line, f\"chapter {ch.title!r} has no text\")", "        for ch in self.chapters:\n            pass"),
    ("text before the first chapter is accepted", PY, B + "books_build.py", "        if not self.chapters:\n            raise BookError(self.book, line, \"text before the first chapter heading\")", "        if not self.chapters:\n            self.chapters.append(Chapter('x', None, 0))"),
    ("the sha256 of the download is not checked", PY, B + "import_books.py", "    if got != recipe.raw_sha256:", "    if False:"),
    ("the chapter count is not checked", PY, B + "import_books.py", "    if len(out.chapters) != recipe.chapters:", "    if False:"),
    ("the JSON is written with \\u escapes", PY, B + "import_books.py", "ensure_ascii=False", "ensure_ascii=True"),
    ("a book that is not public domain everywhere is written", PY, B + "import_books.py", "return [r for r in chosen if r.verdict == recipes.PD], [r for r in chosen if r.verdict != recipes.PD]", "return list(chosen), []"),
    ("the index loses the catalogue order", PY, B + "import_books.py", "return sorted(ids, key=recipes.CATALOGUE_ORDER.index)", "return list(ids)"),
    ("the generated TypeScript changes its name", PY, B + "import_books.py", "export const BOOK_TEXT_LOADERS", "export const BOOK_LOADERS"),
    ("a mark without a note passes (Imitation)", PY, B + "books_recipes.py", "need(out, sorted(marks) == list(range(1, len(notes) + 1)) and notes == list(range(1, len(notes) + 1)), line,", "need(out, True, line,"),
    ("verse loses its lines (Confessions)", PY, B + "books_recipes.py", "            out.paragraph(b, verse=True)", "            out.paragraph(b, verse=False)"),
    ("the Life expects 40 headings", PY, B + "books_recipes.py", "LIFE_HEADINGS = 41", "LIFE_HEADINGS = 40"),
    ("the rules part is misnamed (Exercises)", PY, B + "books_recipes.py", '"RULES FOR PERCEIVING": "Rules"}', '"RULES FOR PERCEIVING": "Rulez"}'),
    ("AMEN is set as a word (unshout)", PY, B + "books_recipes.py", 'not in {"AMEN", "OF", "IN", "TO"}', 'not in {"OF", "IN", "TO"}'),
    ("points are split whatever their numbers", PY, B + "books_recipes.py", "if values == list(range(values[0], values[0] + len(values))):", "if True:"),
    ("a footnote is read as a paragraph (CCEL)", PY, B + "books_recipes.py", 'if re.match(r"\\[\\d{1,3}\\] ", flat) and b.indent == body:', "if False:"),
    ("the sha256 of a recipe is wrong", PY, B + "books_recipes.py", 'raw_sha256="7e9f72139575c267b0e65dd1c9665cc8541a289538fda4cff370dedd0cc83a74",', 'raw_sha256="7e9f72139575c267b0e65dd1c9665cc8541a289538fda4cff370dedd0cc83a74"[:-1] + "5",'),
    ("a translator who died in 1960", PY, B + "books_recipes.py", "translator_died=1910,", "translator_died=1960,"),
    ("a translation first published in 1931", PY, B + "books_recipes.py", "first_published=1874,", "first_published=1931,"),
    ("a credit that does not say Public domain", PY, B + "books_recipes.py", '"gutenberg.org/ebooks/3296, cleaned for this app (the title page is left out). Public domain.",', '"gutenberg.org/ebooks/3296, cleaned for this app (the title page is left out).",'),
    ("Confessions turns unclear", PY, B + "books_recipes.py", 'raw_sha256="ef3fa6267968c875def9091a1882d14b525a85bbf6996a3e2f130a775b2e22d2",\n        basis="translator died 1882, translation first published 1838", verdict=PD,', 'raw_sha256="ef3fa6267968c875def9091a1882d14b525a85bbf6996a3e2f130a775b2e22d2",\n        basis="translator died 1882, translation first published 1838", verdict="unclear",'),
    ("two books swap places in the catalogue order", PY, B + "books_recipes.py", '"imitation-of-christ", "devout-life", "abandonment-to-providence", "confessions",', '"devout-life", "imitation-of-christ", "abandonment-to-providence", "confessions",'),
    # the mobile side
    ("hasBookText ignores the loaders", TS, M + "bookTextApi.ts", "ids.has(id) && Object.prototype.hasOwnProperty.call(loaders, id);", "ids.has(id);"),
    ("the error message changes", TS, M + "bookTextApi.ts", "throw new Error(`no text for ${id}`);", "throw new Error(`no text: ${id}`);"),
    ("a loader points at another file", TS, M + "books.generated.ts", "assets/books/confessions.json'", "assets/books/confessions2.json'"),
    ("a loader is missing", TS, M + "books.generated.ts", "  'dialogue-of-st-catherine': () => require('../../../../assets/books/dialogue-of-st-catherine.json') as BookText,\n", ""),
    ("the glue reads another index", TS, M + "bookText.ts", "assets/books/index.json", "assets/books/indexx.json"),
    ("the types file changes a kind", TS, M + "bookTextTypes.ts", "| { k: 'hr' };", "| { k: 'rule' };"),
    ("a word count is wrong in the index", TS, A + "index.json", '"words":138690', '"words":138691'),
    ("the manifest says US only", TS, A + "manifest.json", '"verdict":"public domain everywhere","basis":"translator died 1895', '"verdict":"US only","basis":"translator died 1895'),
    ("the manifest has a wrong output hash", TS, A + "manifest.json", '"outputSha256":"fae2df58798363c8', '"outputSha256":"fae2df58798363c9'),
    ("an underscore in a paragraph", TS, A + "confessions.json", "great is Thy power", "great _is_ Thy power"),
    ("the library's name in a paragraph", TS, A + "confessions.json", "and Thy wisdom infinite", "and Thy Project Gutenberg wisdom infinite"),
    ("a double space in a paragraph", TS, A + "imitation-of-christ.json", "deliverance from all blindness of heart", "deliverance from all  blindness of heart"),
    ("an angle bracket in a paragraph", TS, A + "imitation-of-christ.json", "He that followeth me", "He that <followeth me"),
    ("a chapter id is out of order", TS, A + "life-of-st-teresa.json", '"id":"c2","title"', '"id":"c3","title"'),
    ("a footnote mark is left in the text", TS, A + "life-of-st-teresa.json", "story of my life to keep", "story of my life [1] to keep"),
    ("a credit forgets that the translator is not named", TS, A + "devout-life.json", "the translator not named", "the translator is unknown"),
    ("a block has a kind that is not in the contract", TS, A + "spiritual-exercises.json", '{"k":"h","t":"Thought"}', '{"k":"z","t":"Thought"}'),
    ("a line break inside a paragraph", TS, A + "dialogue-of-st-catherine.json", "The soul, who is lifted", "The soul,\\nwho is lifted"),
    ("a book loses its first chapter's opening", TS, A + "confessions.json", "Great art Thou, O Lord, and greatly to be praised", "Small art Thou, O Lord, and greatly to be praised"),
    ("the licences screen misspells the licence", TS, "mobile/app/licences.tsx", "  licence: 'Public domain',\n  url: b.source,", "  licence: 'Public Domain',\n  url: b.source,"),
    ("the licences screen links the wrong page", TS, "mobile/app/licences.tsx", "url: b.source,", "url: b.title,"),
    ("the licences screen forgets to say translator not named", TS, "mobile/app/licences.tsx", "'translator not named'", "'translator unknown'"),
]


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def try_breakage(root, rel, old, new, runner):
    """Break `old` into `new` in root/rel, run `runner` in root and put the file back byte for byte. Returns ("RED" | "STILL GREEN", why), or
    ("SKIPPED: ...", "") when `old` is not in the file exactly once.

    Python is told not to write bytecode while the file is broken. A breakage of a Python file that keeps its size, put back within the same second
    (the tests take a fraction of one), would otherwise leave a .pyc that the next run takes for the restored file's own: the next breakage, or
    the next ordinary run of the tests, would run the code of this one.

    The runner also gets BREAKAGE_CHECK_RUNNING=1, which skips the one test that is about this file's own list (every breakage finds its text exactly
    once): with a breakage in place that test is red for every breakage, and a red that does not come from the guard under test proves nothing."""
    path = pathlib.Path(root) / rel
    raw = path.read_bytes()
    text = raw.decode("utf8")
    if text.count(old) != 1:
        return "SKIPPED: the text to break was found %d times" % text.count(old), ""
    try:
        path.write_bytes(text.replace(old, new, 1).encode("utf8"))
        proc = subprocess.run(runner, cwd=root, capture_output=True, text=True, timeout=300,
                              env=dict(os.environ, PYTHONDONTWRITEBYTECODE="1", BREAKAGE_CHECK_RUNNING="1"))
        tail = (proc.stdout + proc.stderr).strip().splitlines()
        why = next((l.strip() for l in reversed(tail) if "Error" in l or "FAIL" in l or "error" in l), tail[-1] if tail else "")
        return ("RED" if proc.returncode != 0 else "STILL GREEN"), why[:110]
    finally:
        path.write_bytes(raw)


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else ""
    before = {}
    results = []
    for name, runner, rel, old, new in MUTATIONS:
        if only and only not in name:
            continue
        before.setdefault(rel, sha(os.path.join(ROOT, rel)))
        outcome, why = try_breakage(ROOT, rel, old, new, runner)
        results.append((name, outcome, why))
        print(results[-1], flush=True)
    bad = [r for r in results if r[1] != "RED"]
    restored = all(sha(os.path.join(ROOT, rel)) == h for rel, h in before.items())
    print()
    print(f"{len(results)} breakages, {len(results) - len(bad)} turned something red, {len(bad)} did not; files restored byte for byte: {restored} ({len(before)} files)")
    for r in bad:
        print("NOT RED:", r)
    sys.exit(1 if bad or not restored else 0)


if __name__ == "__main__":
    main()
