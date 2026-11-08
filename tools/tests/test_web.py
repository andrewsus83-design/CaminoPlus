"""Tests for tools/build_web.py: the generated site must be consistent with the rest of the repo.
Run from the repository root:  python3 -m unittest discover -s tools/tests -v"""
import html
import json
import os
import pathlib
import re
import sys
import tempfile
import unicodedata
import unittest
import unittest.mock

TOOLS = pathlib.Path(__file__).resolve().parent.parent
ROOT = TOOLS.parent
sys.path.insert(0, str(TOOLS))

import build_web  # noqa: E402

PAGES = build_web.build_all()
HTML = {k: v for k, v in PAGES.items() if k.endswith(".html")}


# ---- the database --------------------------------------------------------------------------
def sql_groups(text):
    """Top-level (...) groups of a VALUES list, quote aware (names contain parentheses and commas)."""
    i = 0
    while i < len(text):
        if text[i] != "(":
            i += 1
            continue
        j, depth, quoted = i + 1, 1, False
        while depth:
            ch = text[j]
            if quoted:
                if ch == "'" and text[j + 1:j + 2] == "'":
                    j += 1
                elif ch == "'":
                    quoted = False
            elif ch == "'":
                quoted = True
            elif ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
            j += 1
        yield text[i + 1:j - 1]
        i = j


def sql_values(group):
    out, cur, quoted, k = [], "", False, 0
    while k < len(group):
        ch = group[k]
        if quoted:
            if ch == "'" and group[k + 1:k + 2] == "'":
                cur += "'"
                k += 1
            elif ch == "'":
                quoted = False
            else:
                cur += ch
        elif ch == "'":
            quoted = True
        elif ch == ",":
            out.append(cur.strip())
            cur = ""
        else:
            cur += ch
        k += 1
    out.append(cur.strip())
    return [None if v == "null" else True if v == "true" else False if v == "false" else int(v) if re.fullmatch(r"-?\d+", v) else v for v in out]


def database_routes():
    sql = (ROOT / "supabase" / "migrations" / "20261106120000_more_caminos.sql").read_text(encoding="utf-8")
    routes = {}
    for stmt in re.finditer(r"insert into public\.routes \(([^)]*)\) values(.*?)on conflict", sql, re.S):
        cols = [c.strip() for c in stmt.group(1).split(",")]
        for g in sql_groups(stmt.group(2)):
            row = dict(zip(cols, sql_values(g)))
            routes[row["slug"]] = row
    return routes


class RoutesMatchTheDatabase(unittest.TestCase):
    # The site, the design and the social posts all say ~780 km for the Francés; the database has 773.
    KNOWN_ROUNDING = {"camino-frances": 780}

    def test_parser_reads_every_route(self):
        db = database_routes()
        self.assertGreaterEqual(len(db), 15)
        self.assertEqual(db["camino-portugues-costero"]["name"], "Camino Portugues Costero (Coastal)")
        self.assertEqual(db["camino-frances"]["countries"], "{FR,ES}")

    def test_same_routes_same_order(self):
        db = database_routes()
        site = [r[0] for r in build_web.ROUTES]
        self.assertEqual(set(site), set(db), "the site lists a route the database does not publish, or misses one")
        self.assertEqual(site, sorted(db, key=lambda s: db[s]["sort_order"]))
        self.assertNotIn("Podiensis", json.dumps(build_web.ROUTES))

    def test_distances_are_the_database_values(self):
        db = database_routes()
        for slug, name, _from, km, _stages, _desc, _badge in build_web.ROUTES:
            want = db[slug]["distance_km"]
            if slug in self.KNOWN_ROUNDING:
                self.assertEqual(km, self.KNOWN_ROUNDING[slug])
                self.assertLessEqual(abs(km - want) / want, 0.02, f"{name}: rounding is more than 2% off the database")
            elif want is None:
                continue  # the database has no distance yet: the site keeps its own figure (or none)
            else:
                self.assertEqual(km, want, f"{name}: site says {km} km, database says {want}")

    def test_start_towns_match(self):
        fold = lambda s: re.sub(r"[^a-z]", "", unicodedata.normalize("NFKD", s.lower()).encode("ascii", "ignore").decode())
        english = {"sevilla": "seville", "lisboa": "lisbon"}  # the database uses the local spelling
        db = database_routes()
        for slug, name, frm, *_ in build_web.ROUTES:
            start = fold(db[slug]["start_name"])
            self.assertIn(english.get(start, start), fold(frm), f"{name}: starts in {db[slug]['start_name']} in the database")


# ---- claims --------------------------------------------------------------------------------
class Claims(unittest.TestCase):
    def all_text(self):
        return "\n".join(HTML.values())

    def test_the_fourth_tab_is_called_discover(self):
        text = self.all_text()
        self.assertNotIn("Explore", text)
        self.assertIn("Discover", text)
        self.assertTrue((ROOT / "web" / "assets" / "screens" / "discover.webp").exists())

    def test_nothing_the_app_does_not_have_yet(self):
        text = self.all_text().lower()
        self.assertNotIn("terrain", text)               # OpenMapTiles has no contours or hillshade
        self.assertNotIn("80 mb", text)                 # design target, not a measurement
        self.assertNotIn("&lt;80", text)
        self.assertNotIn("via podiensis", text)
        for page, content in HTML.items():
            self.assertNotRegex(content, r"keep working[^.]*stays", page)  # offline stays do not exist yet

    def test_the_me_section_names_the_chat_button_and_the_cards_not_the_gold_button_the_pen_or_the_bell(self):
        # Me has ONE gold button, the chat button at the bottom right (it opens friends, notifications and messages); writing is a card (the first tile of Journey,
        # the top of Notes). The bell, the pen button and the gold button that writes are gone from the app, so they must be gone from the words about it.
        text = html.unescape(re.sub(r"<[^>]+>", " ", self.all_text()))
        for stale in ("gold button", "pen button", "behind the bell", "gold pen", "Photos and videos"):
            self.assertNotIn(stale, text, f"the site still says \"{stale}\", which is no longer how Me works")
        features = HTML["features.html"]
        for words in ("Tap the card at the top, Write a note,", "tap the first card, Write a journey post,", "behind the chat button at the bottom right: friend requests, notifications, chats and group chats"):
            self.assertIn(words, features)
        for alt in ("Me tab, Journey: your posts in a grid, the first card writes a new one, and the chat button at the bottom right opens friends, notifications and messages",
                    "Me tab, Notes: the card that writes a note, then your private notes, and the chat button at the bottom right"):
            self.assertIn(f'alt="{alt}"', features)

    def test_store_buttons_are_plain_text_without_third_party_logos(self):
        for page, content in HTML.items():
            self.assertIn("iOS: coming soon", content, page)
            self.assertIn("Android: coming soon", content, page)
            self.assertNotIn("Download on the", content, page)
            self.assertNotIn("Get it on", content, page)
            self.assertNotIn("M16.4 12.6c0-2.6", content, page)  # the Apple glyph path
        self.assertFalse((ROOT / "brand" / "svg" / "icons" / "store").exists())

    def test_every_page_says_its_photos_are_ai_generated(self):
        for page, content in HTML.items():
            self.assertIn("AI-generated illustrations, not photographs", content, page)
            for name in re.findall(r"/assets/photos/([\w-]+)\.webp", content):
                self.assertIn(f"<b>AI-generated illustration:</b> {build_web.PHOTOS[name]}", content, f"{page}: no credit for {name}")
            if "band-cathedral" in content:
                self.assertIn("Santiago Cathedral", re.search(r'<p class="ai-credit">.*?Cathedral.*?</p>', content).group(0), page)
            if "hero-photo" in content:
                self.assertIn("a path through wheat fields", content, page)

    def test_every_photo_file_has_a_caption(self):
        files = {p.stem for p in (ROOT / "web" / "assets" / "photos").glob("*.webp")}
        self.assertEqual(files, set(build_web.PHOTOS), "PHOTOS (the AI credits) and assets/photos must list the same files")

    def test_legal_pages(self):
        privacy, terms = HTML["privacy.html"], HTML["terms.html"]
        for content in (privacy, terms):
            self.assertIn("Last updated 8 November 2026.", content)   # bumped with the plan numbers in the Terms (LEGAL_UPDATED is shared by both pages)
            self.assertIn("Draft for launch", content)
        for needle in ("not end-to-end encrypted", "Settings, then Account, then Delete account", "Supabase", "MapTiler and OpenFreeMap",
                       "friend requests", "within 30 days", "when enabled"):
            self.assertIn(needle, privacy)
        self.assertNotIn("Cloudflare", privacy)         # packs are in Supabase Storage for now
        self.assertIn("served from our own server", privacy)
        self.assertIn("Friends, messages and groups", terms)

    def test_the_site_makes_no_request_to_google(self):
        for page, content in {**HTML, "tokens.css": (ROOT / "web/assets/tokens.css").read_text(), "site.css": (ROOT / "web/assets/site.css").read_text()}.items():
            self.assertNotRegex(content, r"fonts\.(googleapis|gstatic)\.com", page)

    def test_licences_page_lists_what_the_brief_requires(self):
        content = HTML["licences.html"]
        for needle in ("OpenStreetMap", "ODbL", "OpenMapTiles", "CC BY 4.0", "Natural Earth", "Public domain", "Overture", "CDLA-Permissive-2.0",
                       "Wikidata", "CC0", "Wikipedia", "CC BY-SA", "Wikimedia Commons", "Noto Sans", "Fraunces", "Inter", "JetBrains Mono", "Caveat",
                       "SIL Open Font License", "MapLibre", "BSD-3-Clause", "Expo", "MIT", "Supabase",
                       "World English Bible, Catholic edition", "https://ebible.org/eng-web-c/", "is a trademark of eBible.org",
                       "Strong’s numbers, footnotes and cross references are not included"):
            self.assertIn(needle, content)
        for page, c in HTML.items():
            self.assertIn('href="/licences"', c, f"{page}: footer must link to the licences page")

    def test_licences_page_lists_the_editions_of_the_books_of_readings_and_where_the_rest_of_the_text_comes_from(self):
        """Like the Licences screen of the app: one row for every edition named in the sources of a books/<id>/book.json, with its page and its licence, and the words about the
        original text. The page is made from those files, so a book of readings added to the Library is on it the day the generator runs."""
        content = HTML["licences.html"]
        books = [json.loads(f.read_text(encoding="utf-8")) for f in sorted((ROOT / "books").glob("*/book.json"))]
        seen = 0
        for b in books:
            for src in b.get("sources", []):
                seen += 1
                self.assertIn(html.escape(src["work"], quote=True), content, b["id"])
                self.assertIn(f'href="{html.escape(src["url"], quote=True)}"', content, b["id"])
                self.assertIn(html.escape(f"Quoted word for word in “{b['title']}”.", quote=True), content, b["id"])
        self.assertGreaterEqual(seen, 12, "the books of readings are there")
        self.assertIn("<h2>Books in the Library</h2>", content)
        self.assertIn("original text written for CaminoPlus", content)
        self.assertNotRegex(content, r"(?i)verified|official")


# ---- markup --------------------------------------------------------------------------------
class Markup(unittest.TestCase):
    def test_meta_text_is_escaped(self):
        build_web.PAGES.clear()
        build_web.page("x", 'Q&A "quoted" <b>', 'Say "hi" & <script>alert(1)</script>', "<p>body</p>")
        doc = build_web.PAGES["x.html"]
        self.assertIn('<meta name="description" content="Say &quot;hi&quot; &amp; &lt;script&gt;alert(1)&lt;/script&gt;">', doc)
        self.assertIn("<title>Q&amp;A &quot;quoted&quot; &lt;b&gt; · CaminoPlus</title>", doc)
        self.assertNotIn("<script>alert(1)", doc)
        build_web.build_all()

    def test_json_ld_cannot_close_its_script_block(self):
        self.assertNotIn("</script>", build_web.ld_json({"a": "x</script><script>alert(1)</script>"}))
        self.assertEqual(json.loads(build_web.ld_json({"a": "x</b>"}))["a"], "x</b>")
        for page, content in HTML.items():
            for block in re.findall(r'<script type="application/ld\+json">(.*?)</script>', content, re.S):
                json.loads(block)

    def test_faq_is_picked_by_id_and_ids_are_unique(self):
        ids = [i for _, _, qs in build_web.FAQ for i, _, _ in qs]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(build_web.faq_item("cost")[0], "How much does CaminoPlus cost?")
        with self.assertRaises(KeyError):
            build_web.faq_item("no-such-question")
        self.assertIn(build_web.faq_item("offline-works")[0], HTML["index.html"])
        self.assertIn(build_web.faq_item("start-anywhere")[0], HTML["index.html"])
        for gid in ("pricing", "storage"):
            for _, q, _ in build_web.faq_group(gid):
                self.assertIn(q, HTML["pricing.html"])

    def test_assets_are_versioned_by_content(self):
        for page, content in HTML.items():
            self.assertRegex(content, r'href="/assets/tokens\.css\?v=[0-9a-f]{10}"', page)
            self.assertRegex(content, r'href="/assets/site\.css\?v=[0-9a-f]{10}"', page)
            self.assertRegex(content, r'src="/assets/site\.js\?v=[0-9a-f]{10}"', page)
        self.assertEqual(build_web.asset_url("site.css"), build_web.asset_url("site.css"))

    def test_internal_links_and_assets_exist(self):
        web = ROOT / "web"
        for page, content in HTML.items():
            targets = re.findall(r'(?:href|src)="(/[^"]*)"', content) + re.findall(r"url\((/[^)]+)\)", content)
            for t in targets:
                path, _, frag = t.partition("#")
                path = path.split("?")[0]
                if path in ("", "/"):
                    name = "index.html"
                elif "." not in path.rsplit("/", 1)[-1]:
                    name = path.lstrip("/") + ".html"
                else:
                    name = None
                if name:
                    self.assertIn(name, PAGES, f"{page}: link to {t} has no page")
                    if frag:
                        self.assertIn(f'id="{frag}"', PAGES[name], f"{page}: {t} points at a missing anchor")
                else:
                    self.assertTrue((web / path.lstrip("/")).exists(), f"{page}: missing file {t}")

    def test_images_have_alt_text_and_titles_are_unique(self):
        titles = []
        for page, content in HTML.items():
            for img in re.findall(r"<img [^>]*>", content):
                self.assertRegex(img, r'alt="', f"{page}: {img}")
            titles.append(re.search(r"<title>(.*?)</title>", content).group(1))
        self.assertEqual(len(titles), len(set(titles)))

    def test_reduced_motion_is_handled(self):
        css = (ROOT / "web" / "assets" / "site.css").read_text()
        self.assertIn("prefers-reduced-motion: reduce", css)
        self.assertIn("scroll-behavior: auto", css)


class VercelHeaders(unittest.TestCase):
    def test_css_and_js_rule_does_not_overlap_the_assets_rule(self):
        cfg = json.loads((ROOT / "web" / "vercel.json").read_text())
        rules = {h["source"]: h["headers"][0]["value"] for h in cfg["headers"] if h["source"].startswith("/assets/")}
        self.assertEqual(len(rules), 2)
        generic = next(s for s in rules if "?!" in s)       # the one with a negative lookahead
        for name in ("site.css", "site.js", "tokens.css"):
            self.assertIn(name.replace(".", "\\."), generic)  # excluded from the week-long rule
        self.assertIn("must-revalidate", next(v for s, v in rules.items() if s != generic))
        self.assertIn("max-age=604800", rules[generic])


# ---- sitemap -------------------------------------------------------------------------------
class Sitemap(unittest.TestCase):
    def setUp(self):
        env = unittest.mock.patch.dict(os.environ, {"SITEMAP_LASTMOD": "2030-01-02"})
        env.start()
        self.addCleanup(env.stop)

    def test_lists_every_public_page_but_not_404(self):
        sm = PAGES["sitemap.xml"]
        for loc in ("https://camino.plus/", "https://camino.plus/features", "https://camino.plus/licences", "https://camino.plus/privacy"):
            self.assertIn(f"<loc>{loc}</loc>", sm)
        self.assertNotIn("404", sm)

    def test_lastmod_changes_only_when_the_page_does(self):
        with tempfile.TemporaryDirectory() as prev:
            prev = pathlib.Path(prev)
            # previous site: identical pages, an old sitemap, except /faq which differs
            for name, content in HTML.items():
                (prev / name).write_text(content if name != "faq.html" else content + "<!-- old -->", encoding="utf-8")
            old = build_web.sitemap(prev)  # no previous sitemap yet: everything is "today"
            self.assertEqual(old.count("2030-01-02"), len(build_web.SITEMAP_ORDER))
            (prev / "sitemap.xml").write_text(old.replace("2030-01-02", "2026-11-04"), encoding="utf-8")
            os.environ["SITEMAP_LASTMOD"] = "2031-05-06"
            new = build_web.sitemap(prev)
            self.assertIn("<loc>https://camino.plus/faq</loc><lastmod>2031-05-06</lastmod>", new)       # changed page: build day
            self.assertIn("<loc>https://camino.plus/pricing</loc><lastmod>2026-11-04</lastmod>", new)   # unchanged: kept

    def test_regenerating_unchanged_content_is_stable(self):
        with tempfile.TemporaryDirectory() as out:
            out = pathlib.Path(out)
            for name, content in PAGES.items():
                (out / name).write_text(content, encoding="utf-8")
            os.environ["SITEMAP_LASTMOD"] = "2099-01-01"
            self.assertEqual(build_web.sitemap(out), PAGES["sitemap.xml"])


class CommittedSite(unittest.TestCase):
    def test_web_folder_matches_the_generator(self):
        """The committed pages are what the generator makes (CI runs the same check in its own job)."""
        for name, content in build_web.build_all().items():
            self.assertEqual((ROOT / "web" / name).read_text(encoding="utf-8"), content, f"web/{name} is stale: run python3 tools/build_web.py web")


if __name__ == "__main__":
    unittest.main()
