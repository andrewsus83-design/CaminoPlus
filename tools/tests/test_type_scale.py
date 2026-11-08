"""The type scale is one thing in four places: design/tokens.json (the source), design/tokens.css, the table of the design page and the app.

The table of the design page ("Type scale", section 02) had drifted: seven of its twelve rows showed an old size or line height, so the page told designers a
body text of 17 when the app draws 19. These tests read the table back from the page and compare every row, in order, with tokens.json, and compare tokens.css
with tokens.json for size, line height and letter spacing, so that none of the four can change alone. The app side (AppText variants, textStyle) is checked in
mobile/src/lib/__tests__/themeScheme.test.ts.

Run from the repository root:  python3 -m unittest discover -s tools/tests -v
"""
import json
import pathlib
import re
import sys
import unittest

TOOLS = pathlib.Path(__file__).resolve().parent.parent
ROOT = TOOLS.parent
sys.path.insert(0, str(TOOLS))

import sync_tokens  # noqa: E402

TOKENS = json.loads((ROOT / "design" / "tokens.json").read_text(encoding="utf-8"))
PAGE = (ROOT / "design" / "index.html").read_text(encoding="utf-8")
CSS = sync_tokens.css_vars((ROOT / "design" / "tokens.css").read_text(encoding="utf-8"))

ROW = re.compile(r'<div class="type-row"[^>]*><div class="spec">([a-z0-9]+)<br>([^<]*)<br>([^<]*)</div><div style="([^"]*)">')


def num(v) -> str:
    """12 for 12.0, -0.25 for -0.25: the way the page writes a number."""
    return "%g" % v


def label(t: dict) -> str:
    """The second line of a row: "24 / 30", "28 / 34 · -0.25", "15 / 21 · +0.4"."""
    out = f"{num(t['size'])} / {num(t['lineHeight'])}"
    ls = t.get("letterSpacing", 0)
    if ls:
        out += " · " + ("+" if ls > 0 else "") + num(ls)
    return out


def table() -> list:
    start = PAGE.index("<h3>Type scale</h3>")
    end = PAGE.index("</section>", start)
    return ROW.findall(PAGE[start:end])


def style_of(css: str) -> dict:
    return dict(p.split(":", 1) for p in css.split(";") if p)


class TypeScaleTable(unittest.TestCase):
    def test_one_row_for_every_token_in_the_order_of_the_file(self):
        self.assertEqual([r[0] for r in table()], list(TOKENS["text"]))

    def test_the_figures_of_every_row_are_the_token(self):
        problems = []
        for name, shown, family, _ in table():
            t = TOKENS["text"][name]
            if shown != label(t):
                problems.append(f"{name}: the page says {shown}, tokens.json says {label(t)}")
            want = f"{TOKENS['font'][t['font']].split(' ')[0]} {t['weight']}"
            if family != want:
                problems.append(f"{name}: the page says {family}, tokens.json says {want}")
        self.assertEqual(problems, [])

    def test_every_specimen_is_drawn_with_the_variables_of_its_token(self):
        """The specimen reads tokens.css, so the sample the eye sees is the token too, not a second copy of its numbers."""
        problems = []
        for name, _, _, style in table():
            t = TOKENS["text"][name]
            s = style_of(style)
            want = {
                "font-family": f"var(--cp-font-{t['font']})",
                "font-weight": t["weight"],
                "font-size": f"var(--cp-text-{name}-size)",
                "line-height": f"var(--cp-text-{name}-lh)",
            }
            if "letterSpacing" in t:
                want["letter-spacing"] = f"var(--cp-text-{name}-ls)"
            for prop, value in want.items():
                if s.get(prop) != value:
                    problems.append(f"{name}: {prop} is {s.get(prop)!r}, should be {value!r}")
            for prop in ("font-size", "line-height", "letter-spacing"):
                if prop in s and not s[prop].startswith("var(--cp-text-"):
                    problems.append(f"{name}: {prop} is a literal ({s[prop]}), not a token")
            if "letterSpacing" not in t and "letter-spacing" in s:
                problems.append(f"{name}: the page letter-spaces a token that has no letterSpacing")
        self.assertEqual(problems, [])

    def test_the_two_small_titles_are_there(self):
        self.assertEqual({k: (v["size"], v["lineHeight"], v["letterSpacing"], v["font"], v["weight"]) for k, v in TOKENS["text"].items() if k in ("h5", "h6")},
                         {"h5": (17, 22, 0, "title", "600"), "h6": (15, 21, 0, "title", "600")})

    def test_the_parser_notices_a_stale_row(self):
        """The check above would pass on an empty table: make sure it can fail."""
        stale = '<div class="type-row"><div class="spec">h4<br>22 / 28<br>Fraunces 600</div><div style="font-size:22px">x</div></div>'
        (name, shown, _, _), = ROW.findall(stale)
        self.assertNotEqual(shown, label(TOKENS["text"][name]))
        self.assertGreaterEqual(len(table()), 14)


class TokensCss(unittest.TestCase):
    def test_every_text_token_has_its_size_line_height_and_letter_spacing_in_the_css(self):
        problems = []
        for name, t in TOKENS["text"].items():
            for suffix, key in (("size", "size"), ("lh", "lineHeight"), ("ls", "letterSpacing")):
                var = f"--cp-text-{name}-{suffix}"
                if key not in t:
                    continue
                have = CSS.get(var)
                if have is None or sync_tokens.px(have) != float(t[key]):
                    problems.append(f"{var}: css {have}, json {t[key]}")
        self.assertEqual(problems, [])

    def test_the_css_has_no_text_token_the_json_does_not_have(self):
        names = {m.group(1) for var in CSS for m in [re.fullmatch(r"--cp-text-([a-z0-9]+)-(?:size|lh|ls)", var)] if m}
        self.assertEqual(names - set(TOKENS["text"]), set())

    def test_the_letter_spacing_of_the_json_is_compared_by_sync_tokens(self):
        css = dict(CSS, **{"--cp-text-h4-ls": "-1px"})
        self.assertEqual(sync_tokens.compare_css_json(css, TOKENS), ["--cp-text-h4-ls: css -1px, json 0"])

    def test_the_website_copy_has_the_two_small_titles(self):
        web = (ROOT / "web" / "assets" / "tokens.css").read_text(encoding="utf-8")
        for var in ("--cp-text-h5-size", "--cp-text-h5-lh", "--cp-text-h6-size", "--cp-text-h6-lh"):
            self.assertIn(var, web)


if __name__ == "__main__":
    unittest.main()
