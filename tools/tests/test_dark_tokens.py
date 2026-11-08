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
# On the tab bar the active tab has at least this many times the contrast of an inactive one (light mode: 2.6, dark mode: 4.0)
ACTIVE_OVER_INACTIVE = 1.5
# The inactive tabs recede: at most this strong on the bar in both modes (light mode 4.6:1, dark mode 4.7:1). The owner asked on 2026-11-08 for
# inactive tabs that are lighter and more transparent, and again for dark mode once the bar was darker (the same stone would have been 6.7:1).
INACTIVE_MAX = 5.0
# In dark mode the hairline around the tab bar is at least this visible against the bar (it is 1.8:1)
HAIRLINE = 1.5

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
    # the tab bar has roles of its own (the bar, its hairline and the two kinds of tab), so that what it needs never changes a card, a caption or a link
    ("tabInactive", "tabBar", TEXT, "the inactive tab icon and label on the tab bar"),
    ("tabActive", "tabBar", TEXT, "the active tab icon and label on the tab bar"),
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
        # the tab bar is tabBar; the inactive tab is tabInactive. This pair was invisible in dark mode once (a fixed navy).
        for mode in ("light", "dark"):
            r = roles(mode)
            self.assertGreaterEqual(contrast(r["tabInactive"], r["tabBar"]), TEXT, mode)

    def test_the_active_tab_stands_out_from_the_inactive_ones(self):
        # In dark mode the active tab used to be the action blue (7.0:1 on the bar) and the inactive ones muted text (7.4:1):
        # the active tab was the quieter of the two. It must beat an inactive tab by a clear margin in both modes, so a
        # lighter inactive tab can never make the active one hard to find.
        for mode in ("light", "dark"):
            r = roles(mode)
            active, inactive = contrast(r["tabActive"], r["tabBar"]), contrast(r["tabInactive"], r["tabBar"])
            self.assertGreaterEqual(active, ACTIVE_OVER_INACTIVE * inactive, f"{mode}: active {active:.2f}:1, inactive {inactive:.2f}:1 on the bar")

    def test_the_inactive_tab_is_quieter_than_muted_text_but_readable(self):
        # the owner asked (2026-11-08) for inactive tabs that are lighter and more transparent in both modes, so the active tab stands
        # out; they still pass the text floor, so they can never vanish again (a fixed navy at 42% was 1.1:1 on the dark bar)
        for mode in ("light", "dark"):
            r = roles(mode)
            inactive = contrast(r["tabInactive"], r["tabBar"])
            self.assertGreaterEqual(inactive, TEXT, f"{mode}: {inactive:.2f}:1")
            self.assertLessEqual(inactive, INACTIVE_MAX, f"{mode}: {inactive:.2f}:1 is not receding (at most {INACTIVE_MAX}:1)")
            self.assertLessEqual(inactive, contrast(r["textMuted"], r["tabBar"]), f"{mode}: quieter than muted text")

    def test_light_mode_tab_colours(self):
        # the active tab is the action blue it always was; the inactive tabs are a lighter stone (stone550) than textMuted
        r = roles("light")
        self.assertEqual(r["tabActive"], r["action"])
        self.assertNotEqual(r["tabInactive"], r["textMuted"])
        self.assertEqual((r["tabActive"], r["tabInactive"]), ("#14365D", "#697584"), "the light tab colours as they are published")
        # the owner liked light mode as it was (2026-11-08): the bar is still the card white and has no visible edge (the shadow does the work)
        self.assertEqual(r["tabBar"], r["surface"])
        self.assertEqual(r["tabBarBorder"], r["tabBar"])

    def test_the_dark_tab_bar_is_the_darkest_thing_and_has_a_hairline(self):
        # The bar floats over the cards. In dark mode it was the card colour (role surface) with only a shadow, and a shadow cannot be seen on a
        # dark screen: a card scrolling under the bar swallowed it. The owner chose (2026-11-08) a darker bar with a hairline.
        r = roles("dark")
        self.assertLess(luminance(r["tabBar"]), luminance(r["bg"]), "the bar is darker than the page")
        self.assertLess(luminance(r["bg"]), luminance(r["surface"]), "...and so darker than every card")
        self.assertLess(luminance(r["tabBar"]), luminance(r["surfaceSunken"]))
        self.assertNotEqual(r["tabBar"], r["surface"], "a bar in the card colour is swallowed by a card behind it")
        self.assertGreaterEqual(contrast(r["tabBarBorder"], r["tabBar"]), HAIRLINE, "the hairline is visible against the bar")
        self.assertNotEqual(r["tabBarBorder"], r["surface"])

    def test_the_tab_roles_have_a_dark_value_of_their_own(self):
        # without one, dark mode would fall back to the light mapping (blue, stone600) and the tab bar would look as before
        for name in ("tabActive", "tabInactive", "tabBar", "tabBarBorder"):
            self.assertIn(name, TOKENS["role"], name)
            self.assertIn(name, TOKENS["dark"]["role"], f"dark.role.{name}")


# The stem of Inter in font units (of 2048 per em): the width of the ink of the glyph "l" (lower case) and "I" (capital) in the static files of
# @expo-google-fonts/inter that the app loads, by weight. Taken with fontTools and again by drawing the glyphs at 2048 px and counting the ink;
# themeScheme.test.ts (npm run test:lib) reads them from the font files themselves, and so does the last test of TabWeight when fontTools is installed.
INTER_UNITS = 2048
INTER_STEM = {300: (136, 142), 400: (180, 190), 600: (260, 267), 700: (300, 305)}
INTER_FILE = {300: "300Light/Inter_300Light.ttf", 400: "400Regular/Inter_400Regular.ttf", 600: "600SemiBold/Inter_600SemiBold.ttf", 700: "700Bold/Inter_700Bold.ttf"}
# What the tab bar draws (mobile/src/components/TabBar.tsx; .cp-tab in design/index.html): a 28 px icon in a 24 unit box and a 14 px label
TAB_ICON_PX, ICON_BOX, TAB_LABEL_PX = 28, 24, 14
# The owner saw the inactive icons thicker than the inactive labels (2026-11-08): the stroke and the stem of the label are within this share of each other
STROKE_OFF_STEM = 0.10


class TabWeight(unittest.TestCase):
    def drawn(self, mode: str):
        """(the stroke of the inactive icon in px, [the stems of its label in px: lower case, capital])"""
        tab = TOKENS["tab"]
        stroke = tab["inactiveStroke"][mode] * TAB_ICON_PX / ICON_BOX
        return stroke, [units / INTER_UNITS * TAB_LABEL_PX for units in INTER_STEM[tab["inactiveLabelWeight"][mode]]]

    def test_the_inactive_icon_is_as_thin_as_the_stem_of_its_label_in_light_and_in_dark(self):
        for mode in ("light", "dark"):
            stroke, stems = self.drawn(mode)
            for stem, what in zip(stems, ("lower case", "capital")):
                off = stroke / stem - 1
                self.assertLessEqual(abs(off), STROKE_OFF_STEM, f"{mode}: the icon is {stroke:.3f} px thick, the {what} stem of its label {stem:.3f} px ({off * 100:+.1f} percent)")

    def test_the_inactive_tabs_stay_thin_and_light(self):
        # the owner's wish: both thin and Light. A heavier label with a matching stroke would pass the test above and still be a different design.
        for mode in ("light", "dark"):
            self.assertEqual(TOKENS["tab"]["inactiveLabelWeight"][mode], 300, mode)
            self.assertLess(TOKENS["tab"]["inactiveStroke"][mode], 1.0, mode)
            self.assertGreaterEqual(TOKENS["tab"]["activeStroke"][mode], 1.5 * TOKENS["tab"]["inactiveStroke"][mode], f"{mode}: the active icon is much heavier")

    def test_the_old_stroke_would_fail(self):
        # 1.3 was drawn until 2026-11-08: 1.517 px against a stem of 0.930 px
        stroke = 1.3 * TAB_ICON_PX / ICON_BOX
        self.assertGreater(stroke / self.drawn("light")[1][0], 1.5)

    def test_the_sizes_the_stroke_is_worked_out_for_are_the_sizes_that_are_drawn(self):
        app = (ROOT / "mobile" / "src" / "components" / "TabBar.tsx").read_text(encoding="utf-8")
        self.assertRegex(app, rf"<Icon name=\{{route\.name as IconName\}} color=\{{color\}} size=\{{{TAB_ICON_PX}\}}")
        self.assertRegex(app, rf"fontFamily: weight\.font, fontSize: {TAB_LABEL_PX},")
        icon = (ROOT / "mobile" / "src" / "components" / "Icon.tsx").read_text(encoding="utf-8")
        self.assertIn(f'viewBox="0 0 {ICON_BOX} {ICON_BOX}"', icon)
        page = (ROOT / "design" / "index.html").read_text(encoding="utf-8")
        self.assertRegex(page, rf"\.cp-tab \{{[^}}]*font-size: {TAB_LABEL_PX}px")
        self.assertRegex(page, rf"\.cp-tab \.cp-icon \{{[^}}]*width: {TAB_ICON_PX}px; height: {TAB_ICON_PX}px")

    def test_the_design_page_draws_the_tokens(self):
        tab = TOKENS["tab"]
        css = (ROOT / "design" / "tokens.css").read_text(encoding="utf-8")
        self.assertRegex(css, rf"--cp-tab-inactive-stroke:\s*{tab['inactiveStroke']['light']}px;")
        self.assertRegex(css, rf"--cp-tab-inactive-weight:\s*{tab['inactiveLabelWeight']['light']};")
        page = (ROOT / "design" / "index.html").read_text(encoding="utf-8")
        self.assertRegex(page, r"\.cp-tab \{[^}]*font-weight: var\(--cp-tab-inactive-weight\)")
        self.assertRegex(page, r"\.cp-tab \.cp-icon \{[^}]*stroke-width: var\(--cp-tab-inactive-stroke\)")
        self.assertIn(f"--cp-tab-inactive-stroke:{tab['inactiveStroke']['dark']}px;--cp-tab-inactive-weight:{tab['inactiveLabelWeight']['dark']};", page, "the dark phones carry the dark values")

    def test_the_stems_are_the_fonts_own(self):
        try:
            from fontTools.ttLib import TTFont
        except ImportError:
            self.skipTest("fontTools is not installed (the numbers are checked from the font files by themeScheme.test.ts)")
        base = ROOT / "mobile" / "node_modules" / "@expo-google-fonts" / "inter"
        if not base.exists():
            self.skipTest("mobile/node_modules is not installed")
        for weight, rel in INTER_FILE.items():
            font = TTFont(base / rel)
            self.assertEqual(font["head"].unitsPerEm, INTER_UNITS)
            glyphs = font.getGlyphSet()
            cmap = font.getBestCmap()
            from fontTools.pens.boundsPen import BoundsPen
            got = []
            for ch in "lI":
                pen = BoundsPen(glyphs)
                glyphs[cmap[ord(ch)]].draw(pen)
                got.append(pen.bounds[2] - pen.bounds[0])
            self.assertEqual(tuple(got), INTER_STEM[weight], f"Inter {weight}")


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
        bar = TOKENS["dark"]["role"]["tabBar"]
        a = 0.42
        navy = (20, 54, 93)
        blended = "#" + "".join(f"{round(n * a + int(bar[i:i + 2], 16) * (1 - a)):02X}" for n, i in zip(navy, (1, 3, 5)))
        self.assertLess(contrast(blended, bar), 1.5)


if __name__ == "__main__":
    unittest.main()
