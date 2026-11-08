"""The version of the app is written in several places. This keeps them the same, and keeps the release notes at the same number.
Run from the repository root:  python3 -m unittest discover -s tools/tests -v

mobile/app.json is the source: Settings > This build shows its `version`. mobile/package.json and the root of mobile/package-lock.json carry the same
number (npm's own files; the native fingerprint ignores all of them, see mobile/DEPLOY.md), mobile/src/lib/support.ts has a fallback for a run where Expo
gives no config, CHANGELOG.md starts with the entry of this version, and mobile/DEPLOY.md has the section that says how to build and see it.
"""
import datetime
import json
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
SEMVER = re.compile(r"\b\d+\.\d+\.\d+\b")
ENTRY = re.compile(r"^## (\d+\.\d+\.\d+) \((\d{4}-\d{2}-\d{2})\)\s*$", re.M)


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def app_version() -> str:
    return json.loads(read("mobile/app.json"))["expo"]["version"]


class AppVersion(unittest.TestCase):
    def test_app_json_has_a_plain_version(self):
        self.assertRegex(app_version(), r"^\d+\.\d+\.\d+$")

    def test_package_json_and_the_lockfile_say_the_same(self):
        v = app_version()
        self.assertEqual(json.loads(read("mobile/package.json"))["version"], v)
        lock = json.loads(read("mobile/package-lock.json"))
        self.assertEqual(lock["version"], v, "package-lock.json: the version at the top")
        self.assertEqual(lock["packages"][""]["version"], v, 'package-lock.json: packages[""].version')

    def test_the_fallback_in_support_ts_says_the_same(self):
        found = SEMVER.findall(read("mobile/src/lib/support.ts"))
        self.assertEqual(found, [app_version()], "support.ts has exactly one version, the fallback of appVersion(), and it is app.json's")

    def test_the_build_card_reads_the_version_from_the_app_config(self):
        src = read("mobile/src/lib/useBuildInfo.ts")
        self.assertIn("Constants.expoConfig?.version", src)
        self.assertEqual(SEMVER.findall(src), [], "useBuildInfo.ts must not carry a copy of the version")

    def test_the_changelog_starts_with_this_version(self):
        text = read("CHANGELOG.md")
        entries = ENTRY.findall(text)
        self.assertTrue(entries, "CHANGELOG.md has no '## x.y.z (yyyy-mm-dd)' entry")
        version, date = entries[0]
        self.assertEqual(version, app_version(), "the newest entry of CHANGELOG.md is not the version of app.json: bump one or write the other")
        datetime.date.fromisoformat(date)
        before = text[: text.index(f"## {version} (")]
        self.assertNotRegex(before, r"(?m)^## (?!Unreleased\b)", "only an 'Unreleased' entry may come before the newest version")

    def test_every_entry_of_the_changelog_is_newer_than_the_one_below_it(self):
        versions = [tuple(int(n) for n in v.split(".")) for v, _ in ENTRY.findall(read("CHANGELOG.md"))]
        self.assertEqual(versions, sorted(versions, reverse=True))

    def test_deploy_md_has_the_section_for_this_version(self):
        v = app_version()
        self.assertRegex(read("mobile/DEPLOY.md"), rf"(?m)^## Release {re.escape(v)}: ", f"mobile/DEPLOY.md has no '## Release {v}: ...' section: write it for this release")


if __name__ == "__main__":
    unittest.main()
