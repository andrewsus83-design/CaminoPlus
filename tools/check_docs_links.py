#!/usr/bin/env python3
"""Check the relative links and #anchors in the repository's Markdown docs.

    python3 tools/check_docs_links.py            # every README and doc in the repo
    python3 tools/check_docs_links.py brand      # only below one folder

Checks `[text](path)` and `[text](path#anchor)`: the file must exist, and for a Markdown target the
heading the anchor points to must exist (GitHub's slug rules: lower case, punctuation dropped,
spaces become hyphens). Web links (http, https, mailto) are not fetched. Code blocks are skipped.
Exits 1 and lists every broken link, so CI catches a renamed file or heading.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SKIP_DIRS = {"node_modules", ".git", "dist", "data", ".expo", "out", "cache"}
LINK = re.compile(r"(?<!\!)\[(?:[^\]\\]|\\.)*\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
IMAGE = re.compile(r"\!\[(?:[^\]\\]|\\.)*\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
HEADING = re.compile(r"^(#{1,6})\s+(.*?)\s*#*\s*$")


def md_files(base: pathlib.Path):
    for p in sorted(base.rglob("*.md")):
        if not (set(p.relative_to(ROOT).parts) & SKIP_DIRS):
            yield p


def strip_code(text: str) -> str:
    """Blank out fenced code blocks and inline code so links inside them are ignored."""
    out, fenced = [], False
    for line in text.split("\n"):
        if line.lstrip().startswith(("```", "~~~")):
            fenced = not fenced
            out.append("")
        elif fenced:
            out.append("")
        else:
            out.append(re.sub(r"`[^`]*`", "", line))
    return "\n".join(out)


def slug(heading: str) -> str:
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", heading)  # [text](url) -> text
    text = re.sub(r"[`*~]", "", text).lower()
    text = re.sub(r"[^\w\- ]", "", text)
    return text.replace(" ", "-")


def anchors(path: pathlib.Path) -> set[str]:
    found, seen = set(), {}
    for line in strip_code(path.read_text(encoding="utf-8")).split("\n"):
        m = HEADING.match(line)
        if not m:
            continue
        s = slug(m.group(2))
        n = seen.get(s, 0)
        seen[s] = n + 1
        found.add(s if n == 0 else f"{s}-{n}")
    return found


def check(base: pathlib.Path) -> list[str]:
    problems = []
    cache: dict[pathlib.Path, set[str]] = {}
    for md in md_files(base):
        text = strip_code(md.read_text(encoding="utf-8"))
        for target in LINK.findall(text) + IMAGE.findall(text):
            if re.match(r"^(https?:|mailto:|tel:|data:)", target):
                continue
            path_part, _, anchor = target.partition("#")
            dest = md if not path_part else (md.parent / path_part.split("?")[0]).resolve()
            rel = md.relative_to(ROOT)
            if not dest.exists():
                problems.append(f"{rel}: link to missing file: {target}")
                continue
            if anchor and dest.suffix == ".md":
                if dest not in cache:
                    cache[dest] = anchors(dest)
                if anchor.lower() not in cache[dest]:
                    problems.append(f"{rel}: no heading #{anchor} in {dest.relative_to(ROOT)}")
    return problems


def main(argv: list[str]) -> int:
    base = (ROOT / argv[1]).resolve() if len(argv) > 1 else ROOT
    problems = check(base)
    for p in problems:
        print("ERROR:", p, file=sys.stderr)
    if problems:
        print(f"{len(problems)} broken link(s)", file=sys.stderr)
        return 1
    print("docs links ok")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
