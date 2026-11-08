"""Contrast of every text and icon pair a screen can draw, in light and in dark mode (WCAG 2.2).

Text needs 4.5:1 (success criterion 1.4.3), icons and other graphics 3:1 (1.4.11). The light palette is
design/tokens.json "color" and "role"; the dark palette is its "dark" section (see the design page, Dark mode).
The app builds its dark theme from the same file (mobile/src/theme/index.ts), and
mobile/src/lib/__tests__/themeScheme.test.ts checks that it does.

Run from the repository root:  python3 -m unittest discover -s tools/tests -v
"""
import json
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
TOKENS = json.loads((ROOT / "design" / "tokens.json").read_text(encoding="utf-8"))
HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")


def palette(mode: str) -> dict:
    colors = dict(TOKENS["color"])
    if mode == "dark":
        colors.update(TOKENS["dark"]["color"])
    return colors


def roles(mode: str) -> dict:
    """Role -> hex. A dark role value that starts with # is a literal; anything else names a color."""
    colors = palette(mode)
    out = {name: colors[ref] for name, ref in TOKENS["role"].items()}
    if mode == "dark":
        for name, value in TOKENS["dark"]["role"].items():
            out[name] = value if value.startswith("#") else colors[value]
    return out


def luminance(hex_color: str) -> float:
    def channel(v: int) -> float:
        s = v / 255
        return s / 12.92 if s <= 0.03928 else ((s + 0.055) / 1.055) ** 2.4

    h = hex_color.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)


def contrast(a: str, b: str) -> float:
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


TEXT, GRAPHIC, PLACEHOLDER = 4.5, 3.0, 3.0
# On the tab bar the active tab has at least this many times the contrast of an inactive one (light mode: 2.6, dark mode: 2.8)
ACTIVE_OVER_INACTIVE = 1.5

# (foreground role, background role, needed ratio, where it is drawn)
ROLE_PAIRS = [
    ("text", "bg", TEXT, "body text on the screen"),
    ("text", "surface", TEXT, "text on a card"),
    ("text", "surfaceSunken", TEXT, "text on a sunken field"),
    ("textMuted", "bg", TEXT, "secondary text on the screen"),
    ("textMuted", "surface", TEXT, "secondary text on a card"),
    ("textMuted", "surfaceSunken", TEXT, "secondary text on a sunken field"),
    ("textPlaceholder", "surface", PLACEHOLDER, "placeholder text in a field"),
    ("textAccent", "bg", TEXT, "gold text on the screen"),
    ("textAccent", "surface", TEXT, "gold text on a card"),
    ("action", "bg", TEXT, "links and the labels of ghost buttons"),
    ("action", "surface", TEXT, "links and icons on a card"),
    # the tab bar has roles of its own, so that what it needs never changes a caption or a link
    ("tabInactive", "surface", TEXT, "the inactive tab icon and label on the tab bar"),
    ("tabActive", "surface", TEXT, "the active tab icon and label on the tab bar"),
    ("danger", "bg", TEXT, "error text on the screen"),
    ("danger", "surface", TEXT, "error text on a card"),
    ("onAction", "action", TEXT, "label of a primary button"),
    ("onHighlight", "highlight", TEXT, "text and icons on gold (badges, the gold button)"),
    ("onDanger", "danger", TEXT, "label of a danger button"),
    ("textInverse", "surfaceInverse", TEXT, "text on a hero card (journey card, Connect your smartwatch)"),
    ("textInverseAccent", "surfaceInverse", TEXT, "pale gold text on a hero card"),
    ("highlight", "surfaceInverse", GRAPHIC, "gold icons on a hero card"),
]

# (foreground color, background color, needed ratio, where it is drawn): pairs of palette entries
COLOR_PAIRS = [
    ("success", "white", TEXT, "success text on a card"),
    ("success", "successWash", TEXT, "success text on its wash"),
    ("goldInk", "goldWash", TEXT, "gold text on its wash"),
    ("red700", "red100", TEXT, "error text on its wash"),
    ("blue", "blue100", TEXT, "action color on its tint"),
    ("blue", "blue50", TEXT, "action color on its faint tint"),
    ("ink", "blue100", TEXT, "text on the tint"),
]


class Contrast(unittest.TestCase):
    def check(self, mode: str):
        r, c = roles(mode), palette(mode)
        for fg, bg, need, where in ROLE_PAIRS:
            with self.subTest(mode=mode, pair=f"{fg} on {bg}"):
                got = contrast(r[fg], r[bg])
                self.assertGreaterEqual(got, need, f"{mode}: {fg} {r[fg]} on {bg} {r[bg]} is {got:.2f}:1, needs {need}:1 ({where})")
        for fg, bg, need, where in COLOR_PAIRS:
            with self.subTest(mode=mode, pair=f"{fg} on {bg}"):
                got = contrast(c[fg], c[bg])
                self.assertGreaterEqual(got, need, f"{mode}: {fg} {c[fg]} on {bg} {c[bg]} is {got:.2f}:1, needs {need}:1 ({where})")

    def test_light(self):
        self.check("light")

    def test_dark(self):
        self.check("dark")

    def test_a_hero_card_is_still_a_card_in_dark_mode(self):
        r = roles("dark")
        for other in ("bg", "surface"):
            self.assertGreaterEqual(contrast(r["surfaceInverse"], r[other]), 1.5, f"surfaceInverse must stand out from {other}")

    def test_the_inactive_tab_is_readable_on_the_tab_bar(self):
        # the tab bar is a surface; the inactive tab is tabInactive. This pair was invisible in dark mode once (a fixed navy).
        for mode in ("light", "dark"):
            r = roles(mode)
            self.assertGreaterEqual(contrast(r["tabInactive"], r["surface"]), TEXT, mode)

    def test_the_active_tab_stands_out_from_the_inactive_ones(self):
        # In dark mode the active tab used to be the action blue (7.0:1 on the bar) and the inactive ones muted text (7.4:1):
        # the active tab was the quieter of the two. It must beat an inactive tab by a clear margin in both modes, so a
        # lighter inactive tab can never make the active one hard to find.
        for mode in ("light", "dark"):
            r = roles(mode)
            active, inactive = contrast(r["tabActive"], r["surface"]), contrast(r["tabInactive"], r["surface"])
            self.assertGreaterEqual(active, ACTIVE_OVER_INACTIVE * inactive, f"{mode}: active {active:.2f}:1, inactive {inactive:.2f}:1 on the bar")

    def test_the_inactive_tab_is_quieter_than_muted_text_but_readable(self):
        # the owner asked (2026-11-08) for inactive tabs that are lighter and more transparent in both modes, so the active tab stands
        # out; they still pass the text floor, so they can never vanish again (a fixed navy at 42% was 1.1:1 on the dark bar)
        for mode in ("light", "dark"):
            r = roles(mode)
            inactive = contrast(r["tabInactive"], r["surface"])
            self.assertGreaterEqual(inactive, TEXT, f"{mode}: {inactive:.2f}:1")
            self.assertLessEqual(inactive, contrast(r["textMuted"], r["surface"]), f"{mode}: quieter than muted text")

    def test_light_mode_tab_colours(self):
        # the active tab is the action blue it always was; the inactive tabs are a lighter stone (stone550) than textMuted
        r = roles("light")
        self.assertEqual(r["tabActive"], r["action"])
        self.assertNotEqual(r["tabInactive"], r["textMuted"])
        self.assertEqual((r["tabActive"], r["tabInactive"]), ("#14365D", "#697584"), "the light tab colours as they are published")

    def test_the_tab_roles_have_a_dark_value_of_their_own(self):
        # without one, dark mode would fall back to the light mapping (blue, stone600) and the tab bar would look as before
        for name in ("tabActive", "tabInactive"):
            self.assertIn(name, TOKENS["role"], name)
            self.assertIn(name, TOKENS["dark"]["role"], f"dark.role.{name}")


class Shape(unittest.TestCase):
    def test_every_dark_color_is_a_known_color_with_a_hex_value(self):
        for name, value in TOKENS["dark"]["color"].items():
            self.assertIn(name, TOKENS["color"], f"dark.color.{name} is not a color")
            self.assertRegex(value, HEX, f"dark.color.{name}")

    def test_every_dark_role_is_a_known_role(self):
        for name, value in TOKENS["dark"]["role"].items():
            self.assertIn(name, TOKENS["role"], f"dark.role.{name} is not a role")
            self.assertTrue(HEX.match(value) or value in TOKENS["color"], f"dark.role.{name}")

    def test_gold_stays_gold(self):
        for name in ("gold", "goldBright"):
            self.assertNotIn(name, TOKENS["dark"]["color"], f"{name} must not change in dark mode")

    def test_every_role_resolves_in_both_modes(self):
        for mode in ("light", "dark"):
            for name, value in roles(mode).items():
                self.assertRegex(value, HEX, f"{mode} role {name}")


class DesignPage(unittest.TestCase):
    def test_the_design_page_shows_every_dark_value(self):
        # design/index.html, section Dark mode, is written from these tokens; a value that is not on the page means the page is stale
        page = (ROOT / "design" / "index.html").read_text(encoding="utf-8")
        self.assertIn('id="dark"', page)
        for name, value in {**TOKENS["dark"]["color"], **TOKENS["dark"]["role"]}.items():
            if value.startswith("#"):
                self.assertIn(value, page, f"dark value {name} {value} is not on the design page")


class Helpers(unittest.TestCase):
    def test_known_ratios(self):
        self.assertAlmostEqual(contrast("#000000", "#FFFFFF"), 21.0, places=2)
        self.assertAlmostEqual(contrast("#777777", "#FFFFFF"), 4.48, places=2)
        self.assertAlmostEqual(contrast("#123456", "#123456"), 1.0, places=6)

    def test_the_old_inactive_tab_would_fail(self):
        # rgba(20,54,93,0.42) over the dark tab bar: the colour the tab bar used to draw in dark mode
        bar = TOKENS["dark"]["color"]["white"]
        a = 0.42
        navy = (20, 54, 93)
        blended = "#" + "".join(f"{round(n * a + int(bar[i:i + 2], 16) * (1 - a)):02X}" for n, i in zip(navy, (1, 3, 5)))
        self.assertLess(contrast(blended, bar), 1.5)


if __name__ == "__main__":
    unittest.main()
