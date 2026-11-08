"""Tests for tools/design-audit/scan.py, the design-lint scanner (the `design-lint` job of CI). Run from the repository root:
python3 -m unittest discover -s tools/tests -v

Offline. Tiny TSX fixtures live in a throwaway repository root that has the real design/tokens.json and the real theme files, one fixture for
every category, the ignore comment, and the ratchet (a total that goes up and down, a new file, code that only moves). The precision work of the
audit is kept: its self-test (a fixture with module-scope colour reads, apostrophes in JSX text, constants, hitSlop) and its cross-check against
the TypeScript compiler's own AST (tools/design-audit/oracle.js), which runs when node and the typescript package are installed.
"""
import collections
import contextlib
import io
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
import unittest

TOOLS = pathlib.Path(__file__).resolve().parent.parent
ROOT = TOOLS.parent
AUDIT = TOOLS / "design-audit"
sys.path.insert(0, str(AUDIT))

import lexer  # noqa: E402
import scan  # noqa: E402

TOKENS = json.loads((ROOT / "design" / "tokens.json").read_text(encoding="utf-8"))

HEADER = """import { Pressable, Text, TextInput, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon, MapIcon } from '@/components/Icon';
import { c, fixed, fonts, icon, layout, radius, role, shadowStyle, space, text } from '@/theme';

export function Demo({ n }: { n: 3 | 4 }) {
  return (
    <View>
"""
FOOTER = """    </View>
  );
}
"""


def tsx(*body):
    """A screen with the given JSX lines in it."""
    return HEADER + "\n".join("      " + line for line in body) + "\n" + FOOTER


class Repo:
    """A throwaway repository root: the real tokens and theme files, and the app files a test writes."""

    def __init__(self, case, files=None, tokens=None):
        self.root = pathlib.Path(tempfile.mkdtemp(prefix="design_lint_"))
        case.addCleanup(shutil.rmtree, self.root, ignore_errors=True)
        (self.root / "design").mkdir()
        if tokens is None:
            shutil.copy(ROOT / "design" / "tokens.json", self.root / "design" / "tokens.json")
        else:
            (self.root / "design" / "tokens.json").write_text(json.dumps(tokens), encoding="utf-8")
        for rel in ("src/theme/index.ts", "src/components/fixedColors.ts"):
            dst = self.root / "mobile" / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(ROOT / "mobile" / rel, dst)
        for rel, body in (files or {}).items():
            self.write(rel, body)

    def write(self, rel, body):
        path = self.root / "mobile" / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(body, encoding="utf-8")

    def delete(self, rel):
        (self.root / "mobile" / rel).unlink()

    def scan(self):
        return scan.scan(str(self.root))

    @property
    def baseline(self):
        return self.root / "tools" / "design-audit" / "baseline.json"

    def run(self, *args):
        """The command line: (exit code, stdout, stderr)."""
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            try:
                code = scan.main(["--root", str(self.root), *args])
            except SystemExit as e:
                code = e.code
        return code, out.getvalue(), err.getvalue()


def vals(res, cat, kind=None):
    return sorted(str(v["value"]) for v in res.violations if v["cat"] == cat and (kind is None or v["kind"] == kind))


def apart(res, key):
    return sorted(str(a["value"]) for a in res.apart[key])


class Standard(unittest.TestCase):
    def test_the_scales_are_read_from_tokens_json(self):
        std = Repo(self).scan().std
        self.assertEqual(std.space_vals, sorted(set(TOKENS["space"].values())))
        self.assertEqual(std.font_sizes, sorted({t["size"] for t in TOKENS["text"].values()}))
        self.assertEqual(std.radius_vals, sorted(set(TOKENS["radius"].values())))
        self.assertEqual(std.icon_sizes, [18, 20, 24, 28, 32], "the icon scale is 18, 20, 24, 28, 32")
        self.assertEqual(std.touch_hard, 48)
        self.assertEqual(std.touch_primary, 56)
        self.assertEqual(std.smallest_font, min(t["size"] for t in TOKENS["text"].values()), "the smallest text size is the smallest token, not a number written in the scanner")

    def test_a_scale_changed_in_tokens_json_changes_the_verdict(self):
        body = tsx("<View style={{ padding: 6, gap: 4 }} />", "<Icon name='pin' size={22} />")
        before = Repo(self, {"app/x.tsx": body}).scan()
        self.assertEqual(vals(before, "spacing"), ["6"])
        self.assertEqual(vals(before, "size", "icon"), ["22"])
        tokens = json.loads(json.dumps(TOKENS))
        tokens["space"]["1.5"] = 6
        tokens["icon"]["big"] = 22
        after = Repo(self, {"app/x.tsx": body}, tokens=tokens).scan()
        self.assertEqual(vals(after, "spacing"), [], "6 is a space step now")
        self.assertEqual(vals(after, "size", "icon"), [], "22 is an icon size now")

    def test_the_real_tokens_have_the_two_touch_numbers_and_the_five_icon_sizes(self):
        self.assertEqual((TOKENS["layout"]["touchHard"], TOKENS["layout"]["touchPrimary"], TOKENS["layout"]["touchMin"]), (48, 56, 56))
        self.assertEqual(sorted(v for k, v in TOKENS["icon"].items() if k != "stroke"), [18, 20, 24, 28, 32])


class Colour(unittest.TestCase):
    def test_raw_literals_and_names_are_violations_roles_and_the_palette_are_not(self):
        res = Repo(self, {"app/x.tsx": tsx(
            "<View style={{ backgroundColor: '#E9C987', borderColor: 'rgba(12,35,64,0.35)', color: 'white' }} />",
            "<View style={{ backgroundColor: role.surface, borderColor: c.goldWash, color: fixed.white }} />",
            "<View style={{ backgroundColor: 'transparent' }} />",
        )}).scan()
        self.assertEqual(vals(res, "color", "raw"), ["#E9C987", "rgba(12,35,64,0.35)", "white"])

    def test_the_message_names_the_role_to_use(self):
        res = Repo(self, {"app/x.tsx": tsx("<View style={{ backgroundColor: '#EFE5D2' }} />")}).scan()
        self.assertIn("role.sunken", res.violations[0]["msg"])

    def test_a_palette_colour_where_a_role_exists_is_counted_apart_and_is_not_a_violation(self):
        res = Repo(self, {"app/x.tsx": tsx(
            "<View style={{ backgroundColor: c.sand200, borderColor: c.goldWash }} />",   # sand200 = role.sunken; goldWash has no role
        )}).scan()
        self.assertEqual(res.totals()["color"], 0)
        self.assertEqual(apart(res, "color/role-first"), ["c.sand200"])

    def test_the_google_g_is_the_one_built_in_exception(self):
        g = tsx("<View style={{ backgroundColor: '#4285F4' }} />")
        res = Repo(self, {"src/components/auth/GoogleButton.tsx": g, "src/components/Other.tsx": g}).scan()
        self.assertEqual([v["file"] for v in res.violations if v["cat"] == "color"], ["src/components/Other.tsx"])


class Font(unittest.TestCase):
    def test_sizes_line_heights_and_tracking_off_the_text_scale(self):
        res = Repo(self, {"app/x.tsx": tsx(
            "<AppText style={{ fontSize: 13, lineHeight: 20, letterSpacing: 1.2 }}>a</AppText>",
            "<AppText style={{ fontSize: 16 }}>b</AppText>",
            "<AppText style={{ fontSize: 17, lineHeight: 25, letterSpacing: 0.4 }}>c</AppText>",
            "<AppText style={{ fontSize: text.small.size, lineHeight: text.small.lineHeight, letterSpacing: 0 }}>d</AppText>",
        )}).scan()
        self.assertEqual(vals(res, "font", "small"), ["13"], "under 15, the smallest text size")
        self.assertEqual(vals(res, "font", "size"), ["16"])
        self.assertEqual(vals(res, "font", "line-height"), ["20"])
        self.assertEqual(vals(res, "font", "letter-spacing"), ["1.2"])
        self.assertEqual(res.totals()["font"], 4)

    def test_a_font_family_that_is_not_a_brand_font(self):
        res = Repo(self, {"app/x.tsx": tsx(
            "<AppText style={{ fontFamily: 'Arial' }}>a</AppText>",
            "<AppText style={{ fontFamily: 'Inter_400Regular' }}>b</AppText>",
            "<AppText style={{ fontFamily: fonts.body }}>c</AppText>",
        )}).scan()
        self.assertEqual(vals(res, "font", "family"), ["Arial"])

    def test_a_text_that_draws_the_system_font(self):
        alone = Repo(self, {"app/x.tsx": "import { Text, TextInput, View } from 'react-native';\nexport function A() { return <View><Text>a</Text><TextInput /></View>; }\n"}).scan()
        self.assertEqual(vals(alone, "font", "system-font"), ["Text", "TextInput"])
        inline = Repo(self, {"app/x.tsx": tsx("<AppText>a <Text>b</Text></AppText>")}).scan()
        self.assertEqual(vals(inline, "font", "system-font"), [], "a <Text> in a file that draws AppText is an inline span")


class Spacing(unittest.TestCase):
    def test_padding_margin_and_gap_off_the_space_scale(self):
        res = Repo(self, {"app/x.tsx": tsx(
            "<View style={{ padding: 14, paddingTop: 16, gap: 10, marginBottom: 6, margin: 0 }} />",
            "<View style={{ gap: space[3], padding: space[4], margin: layout.screenMargin, rowGap: space[n] }} />",
        )}).scan()
        self.assertEqual(vals(res, "spacing", "padding"), ["14"])
        self.assertEqual(vals(res, "spacing", "gap"), ["10"])
        self.assertEqual(vals(res, "spacing", "margin"), ["6"])

    def test_a_named_constant_and_a_computed_value_are_read(self):
        res = Repo(self, {"app/x.tsx": "import { View } from 'react-native';\nimport { layout } from '@/theme';\nconst SIDE = 14;\nexport function A({ inset }: { inset: number }) {\n  return <View style={{ paddingHorizontal: SIDE, paddingBottom: inset + 18, paddingTop: layout.screenTop + 3 }} />;\n}\n"}).scan()
        self.assertEqual(vals(res, "spacing"), ["14", "18", "3"])

    def test_offsets_and_negative_margins_are_counted_apart(self):
        res = Repo(self, {"app/x.tsx": tsx("<View style={{ position: 'absolute', top: 7, left: 8, marginTop: -6 }} />")}).scan()
        self.assertEqual(res.totals()["spacing"], 0)
        self.assertEqual(apart(res, "spacing/offset"), ["7"])
        self.assertEqual(apart(res, "spacing/negative"), ["-6"])

    def test_the_message_names_the_steps_around_the_value(self):
        res = Repo(self, {"app/x.tsx": tsx("<View style={{ padding: 14 }} />")}).scan()
        self.assertIn("space[3] (12) or space[4] (16)", res.violations[0]["msg"])


class Size(unittest.TestCase):
    def test_radius(self):
        res = Repo(self, {"app/x.tsx": tsx(
            "<View style={{ borderRadius: 14 }} />",
            "<View style={{ borderRadius: radius.md }} />",
            "<View style={{ borderRadius: 20 }} />",
            "<View style={{ width: 44, height: 44, borderRadius: 22 }} />",
        )}).scan()
        self.assertEqual(vals(res, "size", "radius"), ["14"])

    def test_icon_sizes_are_18_20_24_28_32(self):
        res = Repo(self, {"app/x.tsx": tsx(
            "<Icon name='pin' size={18} /><Icon name='pin' size={20} /><Icon name='pin' size={28} /><Icon name='pin' size={32} />",
            "<Icon name='pin' size={icon.md} /><Icon name='pin' />",
            "<Icon name='pin' size={22} /><Icon name='pin' size={26} /><MapIcon name='pin' />",
        )}).scan()
        self.assertEqual(vals(res, "size", "icon"), ["22", "26", "default"])

    def test_tap_targets_under_48_hitslop_counted(self):
        res = Repo(self, {"app/x.tsx": tsx(
            "<Pressable style={{ width: 44, height: 44 }}><Icon name='pin' /></Pressable>",
            "<Pressable hitSlop={12} style={{ width: 44, height: 44 }}><Icon name='pin' /></Pressable>",
            "<Pressable style={{ width: 48, height: 52 }}><Icon name='pin' /></Pressable>",
            "<Pressable style={{ minHeight: layout.touchHard }}><AppText>a</AppText></Pressable>",
            "<Pressable style={{ width: layout.touchMin - 8, height: layout.touchPrimary }}><Icon name='pin' /></Pressable>",
        )}).scan()
        self.assertEqual(vals(res, "size", "touch"), ["44"], "only the first is under 48 with its hitSlop")
        self.assertEqual(len(res.apart["size/touch-below-primary"]), 3, "48 to 55 is reported apart, never failing")

    def test_a_hand_made_shadow(self):
        res = Repo(self, {"app/x.tsx": tsx(
            "<View style={{ shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } }} />",
            "<View style={{ ...shadowStyle('md'), elevation: 0 }} />",
            "<View style={{ elevation: 3 }} />",
        )}).scan()
        self.assertEqual(vals(res, "size", "shadow"), ["elevation_only", "hand"])


class Inset(unittest.TestCase):
    def test_text_near_the_outline_of_a_bordered_or_filled_box(self):
        box = "<View style={{ backgroundColor: role.surface, borderWidth: 1, borderColor: role.border, borderRadius: radius.md, padding: %s }}><AppText>x</AppText></View>"
        res = Repo(self, {"app/x.tsx": tsx(box % 3, box % 12)}).scan()
        self.assertEqual(vals(res, "inset"), ["3"])
        self.assertIn("at least 8 px", [v for v in res.violations if v["cat"] == "inset"][0]["msg"])

    def test_a_centred_pill_with_a_height_has_room_and_a_bare_box_is_not_checked(self):
        res = Repo(self, {"app/x.tsx": tsx(
            "<Pressable style={{ height: 44, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: role.action, alignItems: 'center', justifyContent: 'center' }}><AppText>Go</AppText></Pressable>",
            "<View style={{ padding: 0 }}><AppText>plain</AppText></View>",
        )}).scan()
        self.assertEqual(res.totals()["inset"], 0)


class Duplicates(unittest.TestCase):
    def test_hand_made_components_are_reported_and_never_counted(self):
        res = Repo(self, {"app/x.tsx": tsx(
            "<Pressable accessibilityRole='button' style={{ borderRadius: radius.pill, backgroundColor: role.action, paddingHorizontal: 16, paddingVertical: 8 }}><AppText>Go</AppText></Pressable>",
            "<Pressable accessibilityRole='button' style={{ width: 48, height: 48, borderRadius: radius.pill }}><Icon name='pin' /></Pressable>",
        )}).scan()
        self.assertEqual(len(res.dups["pill"]), 1)
        self.assertEqual(len(res.dups["icon_button"]), 1)
        self.assertEqual(sum(res.totals().values()), 0, "duplicates are a heuristic: they never add to a total")
        self.assertEqual(sorted(scan.build_baseline(res, None)["totals"]), sorted(scan.CATEGORIES), "and the baseline has no total for them")


class Ignores(unittest.TestCase):
    def scan(self, *body):
        return Repo(self, {"app/x.tsx": tsx(*body)}).scan()

    def test_a_comment_on_the_line_or_on_the_line_above_excuses_it(self):
        res = self.scan(
            "<View style={{ padding: 14 }} />{/* design-lint-ignore: spacing optical alignment with the avatar */}",
            "{/* design-lint-ignore: spacing,size the grid of the calendar is 10 */}",
            "<View style={{ gap: 10, borderRadius: 14 }} />",
            "<View style={{ gap: 6 }} />",
        )
        self.assertEqual(vals(res, "spacing"), ["6"], "only the line nobody excused is left")
        self.assertEqual(res.totals()["size"], 0)
        self.assertEqual([(i["cats"], i["hits"]) for i in res.ignores], [(["spacing"], 1), (["spacing", "size"], 2)])
        self.assertEqual(res.totals()["ignore"], 0)

    def test_a_comment_in_a_jsx_tag_and_a_trailing_comment_work_too(self):
        res = self.scan(
            "<View",
            "  // design-lint-ignore: spacing the tile is as wide as the photo",
            "  style={{ padding: 14 }}",
            "/>",
            "<View style={{ gap: 10 }} /> {/* design-lint-ignore: spacing same gap as the rail next to it */}",
        )
        self.assertEqual(res.totals()["spacing"], 0)

    def test_an_ignore_needs_a_reason(self):
        res = self.scan("<View style={{ padding: 14 }} />{/* design-lint-ignore: spacing */}")
        self.assertEqual(vals(res, "ignore", "no-reason"), ["spacing"])
        self.assertEqual(vals(res, "spacing"), ["14"], "and it excuses nothing")

    def test_an_ignore_needs_a_known_category(self):
        res = self.scan("<View style={{ padding: 14 }} />{/* design-lint-ignore: whatever because I say so */}")
        self.assertEqual(vals(res, "ignore", "unknown-category"), ["whatever"])
        self.assertEqual(vals(res, "spacing"), ["14"])

    def test_an_ignore_that_excuses_nothing_is_a_violation(self):
        res = self.scan("<View style={{ padding: 16 }} />{/* design-lint-ignore: spacing nothing here breaks the rule */}")
        self.assertEqual(vals(res, "ignore", "unused"), ["spacing"])

    def test_the_ignores_are_listed_in_the_report(self):
        repo = Repo(self, {"app/x.tsx": tsx("<View style={{ padding: 14 }} />{/* design-lint-ignore: spacing optical alignment with the avatar */}")})
        code, out, _ = repo.run("--report")
        self.assertEqual(code, 0)
        self.assertIn("Exceptions: 1 design-lint-ignore comment(s)", out)
        self.assertIn("optical alignment with the avatar", out)
        self.assertIn("`app/x.tsx:", out)


class Ratchet(unittest.TestCase):
    DIRTY = tsx("<View style={{ padding: 14 }} />", "<View style={{ gap: 10 }} />")

    def repo(self, files=None):
        repo = Repo(self, files if files is not None else {"app/a.tsx": self.DIRTY, "app/clean.tsx": tsx("<View style={{ padding: space[4] }} />")})
        code, out, _ = repo.run("--update-baseline")
        self.assertEqual(code, 0, out)
        return repo

    def test_the_baseline_records_the_totals_and_the_dirty_files_only(self):
        repo = self.repo()
        doc = json.loads(repo.baseline.read_text(encoding="utf-8"))
        self.assertEqual(doc["totals"], {"color": 0, "font": 0, "spacing": 2, "size": 0, "inset": 0, "ignore": 0})
        self.assertEqual(list(doc["files"]), ["app/a.tsx"])
        self.assertEqual(doc["files"]["app/a.tsx"]["counts"], {"spacing": 2})
        self.assertEqual(len(doc["files"]["app/a.tsx"]["fp"].split()), 2)

    def test_the_baseline_is_deterministic(self):
        a = self.repo()
        b = self.repo()
        self.assertEqual(scan.dump_baseline(scan.build_baseline(a.scan(), None)), scan.dump_baseline(scan.build_baseline(b.scan(), None)))

    def test_check_passes_on_the_tree_the_baseline_was_made_from(self):
        code, out, _ = self.repo().run("--check")
        self.assertEqual(code, 0, out)
        self.assertIn("design-lint: ok", out)

    def test_check_without_a_baseline_says_how_to_make_one(self):
        code, _, err = Repo(self, {"app/a.tsx": self.DIRTY}).run("--check")
        self.assertEqual(code, 2)
        self.assertIn("--update-baseline", err)

    def test_a_new_violation_in_a_file_that_has_some_fails_and_is_named(self):
        repo = self.repo()
        repo.write("app/a.tsx", tsx("<View style={{ padding: 14 }} />", "<View style={{ gap: 10 }} />", "<View style={{ margin: 6 }} />"))
        code, out, _ = repo.run("--check")
        self.assertEqual(code, 1)
        self.assertIn("spacing went up: 2 -> 3 (+1)", out)
        self.assertIn("app/a.tsx:", out)
        self.assertIn("margin: 6 is not on the space scale", out)
        self.assertNotIn("padding: 14", out, "the old violations are not listed, only the new one")

    def test_a_violation_fixed_passes_and_the_note_says_to_lock_it_in(self):
        repo = self.repo()
        repo.write("app/a.tsx", tsx("<View style={{ padding: space[3] }} />", "<View style={{ gap: 10 }} />"))
        code, out, _ = repo.run("--check")
        self.assertEqual(code, 0, out)
        self.assertIn("spacing 2 -> 1", out)
        self.assertIn("--update-baseline", out)

    def test_a_new_file_must_be_clean(self):
        repo = self.repo()
        repo.write("src/features/NewThing.tsx", tsx("<View style={{ gap: 18 }} />"))
        code, out, _ = repo.run("--check")
        self.assertEqual(code, 1)
        self.assertIn("src/features/NewThing.tsx has no baseline entry", out)
        self.assertIn("gap: 18", out)
        repo.write("src/features/NewThing.tsx", tsx("<View style={{ gap: space[2] }} />"))
        self.assertEqual(repo.run("--check")[0], 0, "a clean new file is fine")

    def test_a_file_that_was_clean_must_stay_clean(self):
        repo = self.repo()
        repo.write("app/clean.tsx", tsx("<View style={{ padding: space[4], gap: 10 }} />"))
        code, out, _ = repo.run("--check")
        self.assertEqual(code, 1)
        self.assertIn("app/clean.tsx has no baseline entry (it is new, or it was clean)", out)

    def test_code_that_moves_between_files_is_not_punished(self):
        repo = self.repo({"app/a.tsx": self.DIRTY, "app/b.tsx": tsx("<View style={{ padding: 22 }} />")})
        # a violation moves from a.tsx to b.tsx (both have entries): the totals are the same
        repo.write("app/a.tsx", tsx("<View style={{ padding: 14 }} />"))
        repo.write("app/b.tsx", tsx("<View style={{ padding: 22 }} />", "<View style={{ gap: 10 }} />"))
        code, out, _ = repo.run("--check")
        self.assertEqual(code, 0, out)

    def test_code_that_moves_to_a_new_file_is_not_punished_either(self):
        repo = self.repo()
        # a.tsx is split: its two lines now live in two files, one of them new. Nothing was added, so nothing fails.
        repo.write("app/a.tsx", tsx("<View style={{ padding: 14 }} />"))
        repo.write("app/split.tsx", tsx("<View style={{ gap: 10 }} />"))
        code, out, _ = repo.run("--check")
        self.assertEqual(code, 0, out)
        self.assertIn("code that moved", out)

    def test_a_new_violation_in_a_new_file_is_not_hidden_by_a_fix_elsewhere(self):
        repo = self.repo()
        repo.write("app/a.tsx", tsx("<View style={{ padding: 14 }} />"))          # one fixed: the total would allow one new
        repo.write("app/split.tsx", tsx("<View style={{ gap: 18 }} />"))           # a different violation, in a new file
        code, out, _ = repo.run("--check")
        self.assertEqual(code, 1)
        self.assertIn("app/split.tsx has no baseline entry", out)

    def test_update_baseline_refuses_a_rise_unless_allowed(self):
        repo = self.repo()
        before = repo.baseline.read_text(encoding="utf-8")
        repo.write("app/a.tsx", tsx("<View style={{ padding: 14 }} />", "<View style={{ gap: 10 }} />", "<View style={{ margin: 6 }} />"))
        code, out, _ = repo.run("--update-baseline")
        self.assertEqual(code, 1)
        self.assertIn("baseline NOT written", out)
        self.assertEqual(repo.baseline.read_text(encoding="utf-8"), before, "the file is untouched")
        code, out, _ = repo.run("--update-baseline", "--allow-increase")
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(repo.baseline.read_text(encoding="utf-8"))["totals"]["spacing"], 3)
        self.assertEqual(repo.run("--check")[0], 0)

    def test_update_baseline_lowers_and_prints_the_diff(self):
        repo = self.repo()
        repo.write("app/a.tsx", tsx("<View style={{ padding: 14 }} />"))
        code, out, _ = repo.run("--update-baseline")
        self.assertEqual(code, 0)
        self.assertIn("spacing", out)
        self.assertIn("2 -> 1", out)
        self.assertEqual(json.loads(repo.baseline.read_text(encoding="utf-8"))["totals"]["spacing"], 1)

    def test_update_baseline_accepts_a_move_to_a_new_file(self):
        repo = self.repo()
        repo.write("app/a.tsx", tsx("<View style={{ padding: 14 }} />"))
        repo.write("app/split.tsx", tsx("<View style={{ gap: 10 }} />"))
        self.assertEqual(repo.run("--update-baseline")[0], 0, "the totals are equal")
        doc = json.loads(repo.baseline.read_text(encoding="utf-8"))
        self.assertEqual(sorted(doc["files"]), ["app/a.tsx", "app/split.tsx"])

    def test_an_ignore_problem_is_a_failure_on_its_own(self):
        repo = self.repo()
        repo.write("app/a.tsx", tsx("<View style={{ padding: 14 }} />", "<View style={{ gap: 10 }} />{/* design-lint-ignore: spacing */}"))
        code, out, _ = repo.run("--check")
        self.assertEqual(code, 1)
        self.assertIn("ignore went up", out)

    def test_counted_apart_never_fails(self):
        repo = self.repo()
        repo.write("app/clean.tsx", tsx("<View style={{ padding: space[4], marginTop: -4, position: 'absolute', top: 7 }} />", "<View style={{ backgroundColor: c.sand200 }} />"))
        code, out, _ = repo.run("--check")
        self.assertEqual(code, 0, out)
        self.assertIn("counted apart, does not fail: spacing/negative", out)
        self.assertIn("color/role-first", out)

    def test_a_file_the_scanner_cannot_read_fails(self):
        repo = self.repo()
        repo.write("app/broken.tsx", "export function A() { return <View style={{ padding: 3 ;\n")
        code, out, _ = repo.run("--check")
        self.assertEqual(code, 1)
        self.assertIn("the scanner cannot read app/broken.tsx", out)


class Commands(unittest.TestCase):
    def test_explain_lists_the_violations_of_one_file(self):
        repo = Repo(self, {"app/a.tsx": tsx("<View style={{ padding: 14 }} />")})
        repo.run("--update-baseline")
        code, out, _ = repo.run("--explain", "app/a.tsx")
        self.assertEqual(code, 0)
        self.assertIn("app/a.tsx: 1 violation(s); baseline: spacing 1", out)
        self.assertIn("spacing/padding: padding: 14 is not on the space scale", out)
        self.assertIn("<View style={{ padding: 14 }} />", out)
        self.assertEqual(repo.run("--explain", "mobile/app/a.tsx")[0], 0, "the path may start with mobile/")
        self.assertEqual(repo.run("--explain", "a.tsx")[0], 0, "or be the end of it")
        code, out, _ = repo.run("--explain", "app/nope.tsx")
        self.assertEqual(code, 1)
        self.assertIn("not scanned", out)

    def test_report_has_the_totals_the_percentages_and_the_top_files_and_writes_json(self):
        repo = Repo(self, {"app/a.tsx": tsx("<View style={{ padding: 14, gap: space[2] }} />")})
        target = repo.root / "report.json"
        code, out, _ = repo.run("--report", "--json", str(target))
        self.assertEqual(code, 0)
        for text in ("# Design lint report", "| spacing | 1 |", "conforming", "Top 15 files", "`app/a.tsx`", "Counted apart", "Hand-made components"):
            self.assertIn(text, out)
        doc = json.loads(target.read_text(encoding="utf-8"))
        self.assertEqual(doc["totals"]["spacing"], 1)
        self.assertEqual(doc["violations"][0]["file"], "app/a.tsx")
        self.assertEqual(doc["conforming_pct"]["spacing"], 50.0, "one of the two spacing values is off the scale")

    def test_the_excluded_files_are_not_read(self):
        bad = tsx("<View style={{ padding: 14 }} />")
        res = Repo(self, {"app/__tests__/t.tsx": bad, "app/x.test.tsx": bad, "src/features/library/bookBundle.ts": bad, "src/data/mock.ts": bad, "src/theme/extra.ts": bad,
                          "src/features/library/bible/webc.generated.ts": bad, "src/features/y.generated.ts": bad, "app/seen.tsx": bad}).scan()
        self.assertEqual(sorted(res.project.by_rel), ["app/seen.tsx"])

    def test_a_usage_error_exits_2(self):
        self.assertEqual(Repo(self).run()[0], 2)


class SelfTest(unittest.TestCase):
    """The controls of the audit's self-test: a fixture with the cases the app's own code does not have, and the engine must find exactly those."""

    FIXTURE = r'''
import { Pressable, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { c, layout, radius, role } from '@/theme';

const STALE = { color: role.text, backgroundColor: c.blue };            // module scope: never follows dark mode
const LATER = () => ({ color: role.text });                              // function: follows the mode
const GETTER = { get color() { return role.text; } };                    // getter: follows the mode
const TONES = (): Record<string, { bg: string }> => ({ a: { bg: c.red } }); // typed arrow: follows the mode
const SIDE = 14;

export function Demo({ narrow }: { narrow: boolean }) {
  return (
    <View style={{ padding: 14, gap: narrow ? 10 : 12, margin: -4, borderRadius: 18, backgroundColor: '#14365D', borderWidth: 1, borderColor: role.border }}>
      <AppText style={{ fontSize: 15, lineHeight: 20, letterSpacing: 1.2 }}>Don't {"{"} break on apostrophes</AppText>
      <Pressable hitSlop={12} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center' }}>
        <AppText>x</AppText>
      </Pressable>
      <Pressable style={{ width: layout.touchMin - 8, height: layout.touchMin - 8 }}><AppText>y</AppText></Pressable>
      <View style={{ paddingHorizontal: SIDE, paddingTop: layout.screenTop + 3, backgroundColor: role.surface, borderWidth: 1, borderColor: role.border, borderRadius: radius.md }}>
        <AppText>hug</AppText>
      </View>
      <View style={{ backgroundColor: role.surface, borderWidth: 1, borderColor: role.border, borderRadius: radius.md, padding: 3 }}>
        <AppText>tight</AppText>
      </View>
    </View>
  );
}
'''

    def setUp(self):
        self.repo = Repo(self, {"app/x.tsx": self.FIXTURE})
        self.res = self.repo.scan()
        self.fx = next(iter(self.res.project.fi.values()))
        self.by = collections.defaultdict(list)
        for e in self.res.events:
            self.by[(e["cat"], e["bucket"])].append(e)

    def test_the_fixture_lexes_with_no_error_and_balanced_brackets(self):
        self.assertEqual((self.fx.lex_errors, self.fx.bad), ([], []))

    def test_module_scope_reads_are_the_two_in_STALE(self):
        ms = [e for e in self.res.events if e["cat"] in ("color.c", "color.role") and e.get("module_scope")]
        self.assertEqual(sorted(e["name"] for e in ms), ["blue", "text"])

    def test_raw_colour(self):
        self.assertEqual(len(self.by[("color.raw", "on_palette")]), 1)
        self.assertEqual(vals(self.res, "color", "raw"), ["#14365D"])

    def test_spacing(self):
        sp = [e for e in self.res.events if e["cat"] == "spacing"]
        got = sorted((e["key"], e["bucket"], str(e["val"])) for e in sp)
        for want in (("padding", "literal_off", "14"), ("gap", "literal_off", "10"), ("gap", "literal_on", "12"), ("padding", "literal_off", "3")):
            self.assertIn(want, got)
        self.assertEqual(len(self.by[("spacing.negative", "negative")]), 1, "margin -4 is a negative margin")
        self.assertTrue(any(e["bucket"] == "const_off" and e["val"] == 14 for e in sp), "the SIDE constant resolves to 14, off the scale")
        self.assertTrue(any(e["bucket"] == "token" for e in sp), "layout.screenTop is a token use")

    def test_font(self):
        self.assertEqual(len(self.by[("font.size", "literal_on")]), 1, "15 is a text size")
        self.assertEqual(len(self.by[("font.lineHeight", "literal_off")]), 1)
        self.assertEqual(len(self.by[("font.letterSpacing", "literal_off")]), 1)
        self.assertEqual(len(self.by[("font.textel", "AppText_override")]), 1)

    def test_radius(self):
        self.assertEqual(len(self.by[("size.radius", "literal_off")]), 1, "18")
        self.assertEqual(len(self.by[("size.radius", "circle")]), 1, "22 on a 44 box is a circle")
        self.assertEqual(len(self.by[("size.radius", "token")]), 2, "radius.md twice")

    def test_touch(self):
        self.assertEqual(len(self.by[("touch", "lt48_rescued_by_hitSlop")]), 1, "44 x 44 with hitSlop 12")
        self.assertEqual([e["smallest"] for e in self.by[("touch", "lt56")]], [48], "layout.touchMin - 8 is 48, not below it")

    def test_inset(self):
        got = sorted((e["line"], e["min_inset"]) for e in self.by[("inset", "L1_direct_text")])
        self.assertEqual(got, [(20, 0), (23, 3)], "padding 3 and a box with no paddingBottom; padding 14 and a centred 44 x 44 button are fine")

    def test_the_evaluator(self):
        rec = [r for r in self.fx.recs if not r.is_attr and r.key == "width" and "layout.touchMin - 8" in self.fx.src_lines[r.line - 1]][0]
        self.assertEqual(self.fx.eval_expr(rec.vs, rec.ve, self.res.project), frozenset([48.0]))

    def test_a_space_step_is_a_token_and_is_evaluated(self):
        repo = Repo(self, {"app/y.tsx": "import { Pressable } from 'react-native';\nimport { space } from '@/theme';\nexport const A = () => <Pressable style={{ padding: space[3], minHeight: space[12] }} />;\n"})
        res = repo.scan()
        sp = [e for e in res.events if e["cat"] == "spacing"]
        self.assertEqual([e["bucket"] for e in sp], ["token"], "space[3] is a token use")
        touch = [e for e in res.events if e["cat"] == "touch"]
        self.assertEqual([(e["bucket"], e["smallest"]) for e in touch], [("lt56", 48)], "space[12] is 48")


class Lexer(unittest.TestCase):
    def test_comments_are_returned_apart_with_their_lines(self):
        toks, errors, comments = lexer.lex("const a = 1; // one\n/* two\n three */\n<View style={{ padding: 3 }} />", True)
        self.assertEqual(errors, [])
        self.assertEqual([(a, b) for a, b, _ in comments], [(1, 1), (2, 3)])
        self.assertTrue(all(t.v not in ("one", "two") for t in toks))

    def test_a_directive_in_a_string_is_not_a_comment(self):
        _, _, comments = lexer.lex("const s = 'design-lint-ignore: spacing nope';\n", False)
        self.assertEqual(comments, [])


class Cost(unittest.TestCase):
    def test_the_whole_app_is_read_in_under_ten_seconds_and_the_baseline_is_well_formed(self):
        res = scan.scan(str(ROOT))
        self.assertLess(res.seconds, 10)
        self.assertGreater(res.files, 100)
        path = AUDIT / "baseline.json"
        if path.exists():
            doc = scan.load_baseline(str(path))
            self.assertEqual(list(doc["totals"]), list(scan.CATEGORIES))
            for rel, entry in doc["files"].items():
                self.assertEqual(sum(entry["counts"].values()), len(entry["fp"].split()), rel)


def have_typescript():
    try:
        r = subprocess.run(["node", "-e", "require(require('path').join(%r, 'mobile', 'node_modules', 'typescript'))" % str(ROOT)], capture_output=True, timeout=60)
        return r.returncode == 0
    except (OSError, subprocess.SubprocessError):
        return False


@unittest.skipUnless(have_typescript(), "node and mobile/node_modules/typescript are needed for the cross-check")
class CrossCheck(unittest.TestCase):
    """The scanner against the TypeScript compiler's own AST, file by file: the audit matched 5,633 of 5,634 counts, the one difference being the
    <Text> inside AppText.tsx, which the scanner skips on purpose."""

    def test_per_file_counts_match_the_typescript_ast(self):
        res = scan.scan(str(ROOT))
        r = subprocess.run(["node", str(AUDIT / "oracle.js"), str(ROOT / "mobile")], capture_output=True, text=True, timeout=300)
        self.assertEqual(r.returncode, 0, r.stderr)
        oracle = json.loads(r.stdout)
        mine = collections.defaultdict(collections.Counter)
        for e in res.events:
            cat, b, f = e["cat"], e["bucket"], e["file"]
            if cat == "font.size" and b in ("literal_on", "literal_off"):
                mine[f]["fontSize"] += 1
            elif cat == "font.lineHeight" and b in ("literal_on", "literal_off"):
                mine[f]["lineHeight"] += 1
            elif cat == "font.letterSpacing" and b in ("literal_on", "literal_off", "zero"):
                mine[f]["letterSpacing"] += 1
            elif cat == "font.family" and b == "literal":
                mine[f]["fontFamilyStr"] += 1
            elif cat == "spacing" and b in ("literal_on", "literal_off", "zero"):
                mine[f]["spacingNum"] += 1
                mine[f]["spacingNumNonZero"] += b != "zero"
            elif cat == "spacing.negative":
                mine[f]["spacingNum"] += 1
                mine[f]["spacingNumNonZero"] += 1
            elif cat == "size.radius" and b in ("literal_on", "literal_off", "circle", "zero", "pill_literal") and isinstance(e.get("val"), (int, float)):
                mine[f]["radiusNum"] += 1
            elif cat == "size.border" and b in ("literal_on", "literal_off", "zero"):
                mine[f]["borderWNum"] += 1
            elif cat == "color.raw":
                mine[f]["rawColor"] += 1
            elif cat == "size.icon" and b in ("literal_on", "literal_off"):
                mine[f]["iconSizeNum"] += 1
            elif cat == "font.textel" and b.startswith("AppText"):
                mine[f]["appText"] += 1
            elif cat == "font.textel" and b.startswith("Text_"):
                mine[f]["text"] += 1
            elif cat == "font.textel" and b.startswith("TextInput"):
                mine[f]["textInput"] += 1
            elif cat == "size.shadow" and b == "token":
                mine[f]["shadowStyleCalls"] += 1
            elif cat == "color.c":
                mine[f]["cDot"] += 1
            elif cat == "color.role":
                mine[f]["roleDot"] += 1
            elif cat == "color.fixed" and b == "ok":
                mine[f]["fixedDot"] += 1
            elif cat == "color.opacity":
                mine[f]["opacityNum"] += 1
        keys = ["fontSize", "lineHeight", "letterSpacing", "fontFamilyStr", "spacingNum", "spacingNumNonZero", "radiusNum", "borderWNum", "rawColor", "iconSizeNum",
                "appText", "text", "textInput", "shadowStyleCalls", "cDot", "roleDot", "fixedDot", "opacityNum"]
        self.assertEqual(sorted(oracle), sorted(res.project.by_rel), "both read the same files")
        diffs = [(k, f, oc.get(k, 0), mine[f].get(k, 0)) for f, oc in oracle.items() for k in keys if oc.get(k, 0) != mine[f].get(k, 0)]
        self.assertEqual(diffs, [("text", "src/components/AppText.tsx", 1, 0)], "the only difference is the <Text> inside AppText.tsx, skipped on purpose")


if __name__ == "__main__":
    unittest.main()
