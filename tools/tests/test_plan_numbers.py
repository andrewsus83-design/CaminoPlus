"""Drift guard for the plan numbers (owner decision 2026-11-08).

    Free 500 MB cloud storage.
    Pilgrim Plus US$12 a year: 10 GB, offline maps, higher resolution photos and video.
    Extra storage +10 GB for US$5 a year: Pilgrim Plus only, ONE at a time.

The same numbers are written in five places: the newest database migration (what the server enforces), the seed, the app
(mobile/src/lib/plan.ts), the website (tools/build_web.py and the pages it generates) and the design page (design/index.html).
This test reads all of them and fails when they disagree, when an old number is still in a copy surface, when the add-on is
described as stackable, or when a comparison ("more than", "best", "unlimited") stands next to a plan claim.

Bytes are DECIMAL (500000000, 10000000000): the app prints sizes in decimal units, so the screens say "500 MB" and "10 GB".
What the app's own formatter prints for each constant is checked in mobile/src/lib/__tests__/plan.test.ts.

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

import build_web  # noqa: E402

MIGRATIONS = ROOT / "supabase" / "migrations"
PLAN_TS = ROOT / "mobile" / "src" / "lib" / "plan.ts"
DESIGN = ROOT / "design" / "index.html"
PAGES = {k: v for k, v in build_web.build_all().items() if k.endswith(".html")}


# ---- reading the sources -----------------------------------------------------------------------------------------------------
def read(path):
    return pathlib.Path(path).read_text(encoding="utf-8")


def newest_plan_migration():
    """The newest migration file that sets the plan numbers (the one that writes free_storage_bytes and the plus_yearly row)."""
    found = [p for p in sorted(MIGRATIONS.glob("*.sql")) if "free_storage_bytes" in read(p) and "plus_yearly" in read(p)]
    assert found, "no migration sets the plan numbers"
    return found[-1]


def newest_quota_function_migration():
    """The newest migration that defines private.storage_quota_bytes (what the server really counts)."""
    found = [p for p in sorted(MIGRATIONS.glob("*.sql")) if "create or replace function private.storage_quota_bytes" in read(p)]
    assert found, "no migration defines private.storage_quota_bytes"
    return found[-1]


def quota_function_body(sql):
    return re.search(r"create or replace function private\.storage_quota_bytes.*?\$\$;", sql, re.S).group(0)


def sql_numbers(text):
    """The plan numbers of an SQL text (a migration or the seed): free quota, and the two product rows."""
    free = re.search(r"\(\s*'free_storage_bytes'\s*,\s*'(\d+)'", text)
    plus = re.search(r"\(\s*'plus_yearly'\s*,\s*'subscription'\s*,\s*'[^']*'\s*,\s*(\d+)\s*,\s*'USD'\s*,\s*'year'\s*,\s*(\d+)\s*,", text)
    addon = re.search(r"\(\s*'(storage_addon_yearly)'\s*,\s*'storage_addon'\s*,\s*'[^']*'\s*,\s*(\d+)\s*,\s*'USD'\s*,\s*'year'\s*,\s*(\d+)\s*,", text)
    assert free and plus and addon, "cannot read the plan rows"
    return {"free_bytes": int(free.group(1)), "plus_cents": int(plus.group(1)), "plus_bytes": int(plus.group(2)),
            "addon_id": addon.group(1), "addon_cents": int(addon.group(2)), "addon_bytes": int(addon.group(3))}


def ts_numbers(text):
    """`export const NAME = 500_000_000;` of mobile/src/lib/plan.ts, as ints."""
    return {m.group(1): int(m.group(2).replace("_", "")) for m in re.finditer(r"^export const ([A-Z_]+) = ([0-9_]+);", text, re.M)}


def ts_sentence(text, name, nums):
    """Renders `export const NAME = `...${...}...`;` of plan.ts with the numbers of the file (the template literals it uses)."""
    m = re.search(rf"^export const {name} = `(.*)`;", text, re.M)
    assert m, f"{name} is not a template literal in plan.ts"
    out = re.sub(r"\$\{withCommas\((\w+)\)\}", lambda g: f"{nums[g.group(1)]:,}", m.group(1))
    return re.sub(r"\$\{(\w+)\}", lambda g: str(nums[g.group(1)]), out)


def label(n):
    """What mobile/src/lib/format.ts formatBytes prints (decimal units); checked against the real formatter in plan.test.ts."""
    if n >= 1_000_000_000:
        return f"{n / 1_000_000_000:.{0 if n >= 10_000_000_000 else 1}f} GB"
    if n >= 1_000_000:
        return f"{round(n / 1_000_000)} MB"
    return f"{n} B"


# ---- turning pages into sentences ----------------------------------------------------------------------------------------------
def sentences(raw):
    """Plain sentences of an HTML (or any) text: block elements and table rows break lines, meta descriptions and JSON-LD strings
    are included, and a table row is ONE sentence (its cells together)."""
    extra = re.findall(r'<meta[^>]+content="([^"]*)"', raw)
    for block in re.findall(r'<script type="application/ld\+json">(.*?)</script>', raw, re.S):
        def walk(o):
            if isinstance(o, str):
                extra.append(o)
            elif isinstance(o, dict):
                for v in o.values():
                    walk(v)
            elif isinstance(o, list):
                for v in o:
                    walk(v)
        walk(json.loads(block))
    body = re.sub(r"(?s)<(script|style)[^>]*>.*?</\1>", " ", raw)
    body = re.sub(r"(?i)</(tr|p|li|h\d|div|summary|details|section|article|ul|ol|table)>|<br\s*/?>", "\n", body)
    body = re.sub(r"<[^>]+>", " ", body)
    text = "\n".join([body] + extra)
    text = text.replace("&amp;", "&").replace("&nbsp;", " ").replace("&#39;", "'").replace("&quot;", '"')
    out = []
    for line in text.splitlines():
        for part in re.split(r"(?<=[.!?])\s+", line):
            part = re.sub(r"\s+", " ", part).strip()
            if part:
                out.append(part)
    return out


SIZE = re.compile(r"(?<![\w.])(\d[\d,]*(?:\.\d+)?)\s?(GB|MB)\b(?!\s+used)")
STORAGE_CLAIM = re.compile(r"storage|cloud|add-on|add \d|\bextra\b|\bspace\b", re.I)
PLAN_CLAIM = re.compile(r"Pilgrim Plus|cloud storage|\bstorage\b|add-on|\bextra\b|\$\s?\d+\s?(?:a|per|/)\s?year|US\$\d+|resolution|\bper year\b|\ba year\b", re.I)
# a comparison next to a plan claim is a claim about somebody else's product or about "no limit": never made here
BANNED = re.compile(r"\b(more than|less than|better than|bigger than|larger than|higher than|best|unlimited|cheaper|cheapest|biggest|largest|no limit)\b", re.I)
STACKING = re.compile(r"\bstack(?:s|ed|able|ing)?\b|as many (?:as|times)|blocks of|each additional|multiple add-ons|more add-ons", re.I)


def size_problems(sents, allowed):
    """Every size in a sentence about storage must be one of the plan's sizes (a size that is only 'used' is an example)."""
    bad = []
    for s in sents:
        if not STORAGE_CLAIM.search(s):
            continue
        for m in SIZE.finditer(s):
            if f"{m.group(1)} {m.group(2)}" not in allowed:
                bad.append(f"{m.group(0)!r} in: {s}")
    return bad


def comparison_problems(sents):
    return [f"{m.group(0)!r} in: {s}" for s in sents if PLAN_CLAIM.search(s) for m in [BANNED.search(s)] if m]


def price_problems(sents, allowed_usd):
    bad = []
    for s in sents:
        if not re.search(r"\byear\b", s, re.I):
            continue
        for m in re.finditer(r"(?<![\w.])(?:US)?\$\s?(\d+(?:\.\d+)?)", s):
            if float(m.group(1)) not in allowed_usd:
                bad.append(f"{m.group(0)!r} in: {s}")
    return bad


def video_problems(sents):
    bad = []
    for s in sents:
        for m in re.finditer(r"\b(720p|1080p|2160p)\b", s, re.I):
            if not re.search(r"on iPhone", s[max(0, m.start() - 40):m.end() + 40], re.I):
                bad.append(f"{m.group(0)!r} as a rule of the app, in: {s}")
        for m in re.finditer(r"\b4K\b", s):
            if not re.search(r"4K video is planned", s):
                bad.append(f"4K outside '4K video is planned' in: {s}")
    return bad


class Numbers:
    """The numbers every test compares: one reading of the migration, the seed, the app and the site."""
    migration = newest_plan_migration()
    fn_migration = newest_quota_function_migration()
    mig = sql_numbers(read(migration))
    seed = sql_numbers(read(ROOT / "supabase" / "seed.sql"))
    ts_text = read(PLAN_TS)
    ts = ts_numbers(ts_text)


class PlanNumbers(unittest.TestCase):
    # ---- the database -----------------------------------------------------------------------------------------------------------
    def test_the_newest_migration_has_the_decimal_marketing_numbers(self):
        m = Numbers.mig
        self.assertEqual(m["free_bytes"], 500_000_000, "Free is 500 MB")
        self.assertEqual(m["plus_bytes"], 10_000_000_000, "Pilgrim Plus is 10 GB")
        self.assertEqual(m["addon_bytes"], 10_000_000_000, "the add-on is +10 GB")
        self.assertEqual(m["plus_cents"], 1200, "Pilgrim Plus is $12 a year")
        self.assertEqual(m["addon_cents"], 500, "the add-on is $5 a year")
        self.assertEqual(m["addon_id"], "storage_addon_yearly", "a store product id must never carry a size")
        self.assertNotRegex(m["addon_id"], r"\d")
        for n in (m["free_bytes"], m["plus_bytes"], m["addon_bytes"]):
            self.assertNotIn(n, (536_870_912, 5_368_709_120, 10_737_418_240), "binary byte counts print as 537 MB, 5.4 GB, 11 GB")

    def test_the_function_fallbacks_are_the_same_numbers(self):
        body = quota_function_body(read(Numbers.fn_migration))
        self.assertIn(f"'plus_yearly'), {Numbers.mig['plus_bytes']})", body, "fallback for a missing Plus row")
        self.assertIn(f"private.config_bigint('free_storage_bytes', {Numbers.mig['free_bytes']})", body, "fallback for a missing free quota row")

    def test_the_migration_counts_one_add_on_and_only_for_plus(self):
        sql = read(Numbers.fn_migration)
        body = quota_function_body(sql)
        self.assertRegex(body, r"when private\.has_plus\(p_user\) then", "the quota is decided by has_plus")
        plus_branch, free_branch = body.split("else", 1)
        self.assertIn("storage_addons", plus_branch, "the add-on is counted inside the Plus branch")
        self.assertNotIn("storage_addons", free_branch, "never for a free account")
        self.assertIn("max(a.storage_bytes)", body, "at most ONE add-on counts")
        self.assertNotRegex(body, r"\bsum\(", "no sum over add-on rows (they would stack)")
        self.assertNotIn("a.quantity", body, "quantity does not multiply")
        self.assertRegex(sql, r"check \(quantity = 1\)", "the table refuses a quantity other than 1")
        self.assertRegex(sql, r"create unique index if not exists storage_addons_one_active_per_user\s+on public\.storage_addons \(user_id\) where status = 'active'",
                         "the table refuses a second active add-on")

    def test_the_migration_says_loudly_that_it_opens_uploads_to_free_accounts(self):
        head = read(Numbers.migration).split("do $$", 1)[0]
        self.assertIn("OPENS CLOUD UPLOADS TO FREE ACCOUNTS", head)
        for needle in ("Moderation", "report back office", "quota enforcement test", "update public.app_config set value = '0' where key = 'free_storage_bytes'"):
            self.assertIn(needle, head, f"the header lists: {needle}")

    def test_the_seed_has_the_same_numbers_as_the_migration(self):
        self.assertEqual(Numbers.seed, Numbers.mig)

    # ---- the app ----------------------------------------------------------------------------------------------------------------
    def test_the_app_constants_are_the_database_numbers(self):
        ts, m = Numbers.ts, Numbers.mig
        self.assertEqual(ts["FREE_STORAGE_BYTES"], m["free_bytes"])
        self.assertEqual(ts["PLUS_STORAGE_BYTES"], m["plus_bytes"])
        self.assertEqual(ts["ADDON_STORAGE_BYTES"], m["addon_bytes"])
        self.assertEqual(ts["PLUS_PRICE_USD"] * 100, m["plus_cents"])
        self.assertEqual(ts["ADDON_PRICE_USD"] * 100, m["addon_cents"])

    def test_the_app_labels_are_what_the_formatter_prints(self):
        # plan.ts builds its labels with formatBytes; this is the same rule in Python (plan.test.ts runs the real formatter)
        self.assertEqual(label(Numbers.ts["FREE_STORAGE_BYTES"]), "500 MB")
        self.assertEqual(label(Numbers.ts["PLUS_STORAGE_BYTES"]), "10 GB")
        self.assertEqual(label(Numbers.ts["ADDON_STORAGE_BYTES"]), "10 GB")
        self.assertRegex(Numbers.ts_text, r"FREE_STORAGE_LABEL = formatBytes\(FREE_STORAGE_BYTES\)")

    def test_no_plan_number_is_typed_by_hand_in_a_screen(self):
        # every screen takes a size from lib/plan.ts: a line about cloud storage or the add-on that carries its own size is a copy that can drift
        skip = {"plan.ts"}
        offenders = []
        for base in (ROOT / "mobile" / "app", ROOT / "mobile" / "src"):
            for p in base.rglob("*.ts*"):
                if p.name in skip or "__tests__" in p.parts or p.suffix not in (".ts", ".tsx"):
                    continue
                for n, line in enumerate(read(p).splitlines(), 1):
                    if line.lstrip().startswith(("//", "/*", "*")):
                        continue   # a comment is not a screen
                    if re.search(r"cloud storage|Extra storage|add-on", line, re.I) and SIZE.search(line):
                        offenders.append(f"{p.relative_to(ROOT)}:{n}: {line.strip()[:120]}")
        self.assertEqual(offenders, [], "a size typed by hand; import it from lib/plan.ts")

    # ---- the website and the design page ------------------------------------------------------------------------------------------
    def test_the_site_constants_are_the_app_constants(self):
        ts, w = Numbers.ts, build_web
        self.assertEqual((w.FREE_STORAGE, w.PLUS_STORAGE, w.ADDON_STORAGE), (label(ts["FREE_STORAGE_BYTES"]), label(ts["PLUS_STORAGE_BYTES"]), label(ts["ADDON_STORAGE_BYTES"])))
        self.assertEqual((w.PLUS_PRICE, w.ADDON_PRICE), (ts["PLUS_PRICE_USD"], ts["ADDON_PRICE_USD"]))
        self.assertEqual((w.FREE_PHOTO_PX, w.PLUS_PHOTO_PX, w.VIDEO_SECONDS, w.FREE_VIDEO_MB, w.PLUS_VIDEO_MB),
                         (ts["FREE_PHOTO_PX"], ts["PLUS_PHOTO_PX"], ts["VIDEO_SECONDS"], ts["FREE_VIDEO_MB"], ts["PLUS_VIDEO_MB"]))

    def test_the_photo_and_video_sentences_are_word_for_word_the_same_in_the_app_and_on_the_site(self):
        self.assertEqual(ts_sentence(Numbers.ts_text, "FREE_MEDIA_FACTS", Numbers.ts), build_web.FREE_MEDIA)
        self.assertEqual(ts_sentence(Numbers.ts_text, "PLUS_MEDIA_FACTS", Numbers.ts), build_web.PLUS_MEDIA)
        headline = re.search(r"^export const MEDIA_HEADLINE = '([^']*)';", Numbers.ts_text, re.M).group(1)
        self.assertEqual(headline, build_web.MEDIA_HEADLINE)
        self.assertEqual(headline, "Higher resolution photos and video", "the owner's headline")

    def test_the_site_says_the_plan_in_the_plan_numbers(self):
        w = build_web
        pricing, home, faq, terms = (PAGES[f"{n}.html"] for n in ("pricing", "index", "faq", "terms"))
        for needle in (f"{w.FREE_STORAGE} cloud storage", f"{w.PLUS_STORAGE} cloud storage", w.MEDIA_HEADLINE, w.FREE_MEDIA, w.PLUS_MEDIA,
                       f"Pilgrim Plus members can add {w.ADDON_STORAGE}", "One add-on at a time"):
            self.assertIn(needle, pricing, f"pricing: {needle}")
        self.assertIn(f"${w.PLUS_PRICE} a year, {w.PLUS_STORAGE} cloud included", home)
        self.assertIn(f"Add {w.ADDON_STORAGE} for ${w.ADDON_PRICE} a year, one at a time", home)
        self.assertIn(w.TERMS_PLAN, terms)
        self.assertIn("one add-on at a time", terms)
        for q in ("What is cloud storage for?", "What happens if I need more space?", "How big can my photos and videos be?"):
            self.assertIn(q, faq)

    def test_every_storage_size_on_the_site_and_the_design_page_is_a_plan_size(self):
        allowed = {build_web.FREE_STORAGE, build_web.PLUS_STORAGE, build_web.ADDON_STORAGE}
        for name, raw in {**PAGES, "design/index.html": read(DESIGN)}.items():
            self.assertEqual(size_problems(sentences(raw), allowed), [], name)

    def test_every_yearly_price_on_the_site_and_the_design_page_is_a_plan_price(self):
        allowed = {float(build_web.PLUS_PRICE), float(build_web.ADDON_PRICE)}
        for name, raw in {**PAGES, "design/index.html": read(DESIGN)}.items():
            self.assertEqual(price_problems(sentences(raw), allowed), [], name)

    def test_the_design_page_phone_says_the_plan(self):
        raw = read(DESIGN)
        self.assertIn(f"Offline maps, every route and {build_web.PLUS_STORAGE} photo storage", raw)
        self.assertIn(f"Extra {build_web.ADDON_STORAGE}: ${build_web.ADDON_PRICE} / year, for Pilgrim Plus only, one at a time", raw)

    # ---- old numbers, the add-on rule, comparisons, video words ---------------------------------------------------------------------
    def copy_files(self):
        """Every file whose words reach a person or describe the plan, except history (older migrations) and the files that name the old numbers on purpose."""
        files = [ROOT / "README.md", ROOT / "supabase" / "README.md", ROOT / "supabase" / "seed.sql", ROOT / "tools" / "build_web.py", DESIGN]
        files += [p for p in (ROOT / "supabase" / "dev").glob("*.sql") if p.name != "plan_storage_smoke.sql"]
        files += sorted((ROOT / "web").glob("*.html"))
        for base in (ROOT / "mobile" / "app", ROOT / "mobile" / "src"):
            files += [p for p in base.rglob("*.ts*") if p.suffix in (".ts", ".tsx") and p.name != "plan.test.ts"]
        return files

    def test_no_old_number_is_left_in_any_copy_or_doc(self):
        old = re.compile(r"storage_5gb|(?<![\d.])5 ?GB\b|5368709120|10737418240|536870912\b|Stack as many|as many as you need|as many times as you need|blocks of 5|per 5 GB", re.I)
        offenders = []
        for p in self.copy_files():
            for n, line in enumerate(read(p).splitlines(), 1):
                if old.search(line):
                    offenders.append(f"{p.relative_to(ROOT)}:{n}: {line.strip()[:130]}")
        self.assertEqual(offenders, [])

    def test_the_add_on_is_never_called_stackable(self):
        for name, raw in {**PAGES, "design/index.html": read(DESIGN)}.items():
            hits = [s for s in sentences(raw) if STACKING.search(s) and re.search(r"storage|add-on|\bextra\b|\badd\b", s, re.I)]
            self.assertEqual(hits, [], name)
        # and every page that talks about the add-on says it is one at a time (and, on the pages about prices, that it is for Pilgrim Plus members)
        for name in ("pricing.html", "index.html", "faq.html", "terms.html"):
            self.assertRegex(PAGES[name], r"(?i)one (add-on )?at a time", f"{name} mentions the add-on without the one-at-a-time rule")
        for name in ("pricing.html", "faq.html", "terms.html"):
            self.assertRegex(PAGES[name], r"Pilgrim Plus members can add|for Pilgrim Plus only", f"{name} mentions the add-on without saying it is for Plus members")
        self.assertIn("One add-on at a time", read(ROOT / "mobile" / "src" / "components" / "PlanCarousel.tsx"))
        self.assertIn("For Pilgrim Plus only", read(ROOT / "mobile" / "src" / "components" / "PlanCarousel.tsx"))

    def test_no_comparison_stands_next_to_a_plan_claim(self):
        for name, raw in {**PAGES, "design/index.html": read(DESIGN)}.items():
            self.assertEqual(comparison_problems(sentences(raw)), [], name)
        offenders = []
        for p in self.copy_files():
            if p.suffix in (".ts", ".tsx"):
                for n, line in enumerate(read(p).splitlines(), 1):
                    if PLAN_CLAIM.search(line) and BANNED.search(line) and not line.lstrip().startswith(("//", "*", "/*")):
                        offenders.append(f"{p.relative_to(ROOT)}:{n}: {line.strip()[:130]}")
        self.assertEqual(offenders, [])

    def test_video_words_say_only_what_holds_on_every_phone(self):
        for name, raw in {**PAGES, "design/index.html": read(DESIGN)}.items():
            self.assertEqual(video_problems(sentences(raw)), [], name)
        said = [ts_sentence(Numbers.ts_text, "FREE_MEDIA_FACTS", Numbers.ts), ts_sentence(Numbers.ts_text, "PLUS_MEDIA_FACTS", Numbers.ts), build_web.MEDIA_HEADLINE]
        self.assertEqual(video_problems(said), [], "what plan.ts says about video")

    # ---- the guard itself goes red on planted failures ---------------------------------------------------------------------------
    def test_the_guard_catches_what_it_is_for(self):
        allowed = {"500 MB", "10 GB"}
        self.assertTrue(size_problems(["Pilgrim Plus has 5 GB of cloud storage."], allowed))
        self.assertTrue(size_problems(["Free: 0.5 GB cloud storage."], allowed), "a different spelling of a plan size is a drift too")
        self.assertTrue(size_problems(["Add 5 GB for $5 a year."], allowed))
        self.assertEqual(size_problems(["Pilgrim Plus has 10 GB of cloud storage (1.2 GB used)."], allowed), [])
        self.assertEqual(size_problems(["Video up to 60 seconds, up to 25 MB."], allowed), [], "a video limit is not a storage claim")
        self.assertTrue(comparison_problems(["Pilgrim Plus gives you more than other apps."]))
        self.assertTrue(comparison_problems(["Unlimited cloud storage."]))
        self.assertTrue(comparison_problems(["Less than a coffee a month for Pilgrim Plus."]))
        self.assertTrue(comparison_problems(["The best storage for pilgrims."]))
        self.assertEqual(comparison_problems(["It was more than 100 km that day."]), [], "not a plan claim")
        self.assertTrue(price_problems(["Pilgrim Plus is $11.99 a year."], {12.0, 5.0}))
        self.assertEqual(price_problems(["Pilgrim Plus is $12 a year."], {12.0, 5.0}), [])
        self.assertTrue(STACKING.search("Stack as many as you need"))
        self.assertTrue(STACKING.search("Add space in blocks of 10 GB"))
        self.assertTrue(video_problems(["Video up to 4K."]))
        self.assertTrue(video_problems(["Video up to 1080p."]))
        self.assertEqual(video_problems(["On iPhone a clip is also exported at 1080p."]), [])
        self.assertEqual(video_problems(["4K video is planned."]), [])

    def test_the_guard_reads_html_the_way_a_person_does(self):
        raw = ('<meta name="description" content="Free has 5 GB of cloud storage."><table><tr><td>Cloud storage</td><td>500 MB</td><td>12 GB</td></tr></table>'
               '<script type="application/ld+json">{"description": "Plus: 7 GB cloud storage."}</script><p>Fine.</p>')
        bad = size_problems(sentences(raw), {"500 MB", "10 GB"})
        self.assertEqual(len(bad), 3, bad)   # the meta text, the table row (one sentence) and the JSON-LD string

    # ---- the media numbers also have to match the upload rules, once they are in this tree ------------------------------------------
    def test_the_media_numbers_match_the_upload_rules_when_that_file_is_here(self):
        limits = ROOT / "mobile" / "src" / "lib" / "media" / "limits.ts"
        if not limits.exists():
            self.skipTest("mobile/src/lib/media/limits.ts is not in this tree yet (it is on the media branch); extend nothing, this test starts working on its own after the merge")
        text = read(limits)

        def num(name):
            m = re.search(rf"^export const {name} = ([0-9_]+)(?: \* MB)?;", text, re.M)
            self.assertTrue(m, f"cannot read {name} from limits.ts: update test_plan_numbers.py to the new shape of that file")
            return int(m.group(1).replace("_", ""))
        ts = Numbers.ts
        self.assertEqual(num("FREE_PHOTO_EDGE"), ts["FREE_PHOTO_PX"])
        self.assertEqual(num("PLUS_PHOTO_EDGE"), ts["PLUS_PHOTO_PX"])
        self.assertEqual(num("MAX_VIDEO_SECONDS"), ts["VIDEO_SECONDS"])
        self.assertEqual(num("FREE_VIDEO_CAP_BYTES"), ts["FREE_VIDEO_MB"])
        self.assertEqual(num("PLUS_VIDEO_CAP_BYTES"), ts["PLUS_VIDEO_MB"])


if __name__ == "__main__":
    unittest.main()
