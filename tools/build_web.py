"""Generates the static pages in web/ (shared head, header, footer) and web/sitemap.xml.

Usage: python3 tools/build_web.py web [--previous DIR]
Edit the content here, re-run, and commit both this file and the output. CI runs the generator
into a temporary folder and fails if it differs from web/ (the "web-sync" job), so a page can
never be edited by hand and forgotten here.

Related: tools/sync_tokens.py keeps web/assets/tokens.css in step with design/tokens.css, and
tools/render_screens.mjs re-renders web/assets/screens from design/index.html.
"""
import datetime
import hashlib
import html
import json
import os
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
WEB = ROOT / "web"  # the committed site: asset hashes and the previous sitemap dates come from here
SITE = "https://camino.plus"
LEGAL_UPDATED = "8 November 2026"  # bump by hand whenever the Privacy Policy or Terms change
PAGES = {}  # file name -> html, filled by page()
# The share-link page (/s) calls the database with the same PUBLIC config the app embeds (mobile/src/lib/config.ts):
# the project URL and the publishable key. Neither is a secret: row level security and the get_shared() function decide
# what a link shows. tools/tests/test_web.py fails if these drift from the app's.
SHARE_SUPABASE_URL = "https://xgikdabgdqmbdgagowva.supabase.co"
SHARE_SUPABASE_KEY = "sb_publishable_tM2U4JVCBMgnMZ86-_DM0g_KxYFGNVQ"
# No inline script or style on that page: everything it runs is /assets/share.js, and it may talk to the database only.
SHARE_CSP = ("default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; "
             f"connect-src {SHARE_SUPABASE_URL}; base-uri 'none'; form-action 'none'")


def esc(s):
    """Text for an HTML attribute or a title (the page bodies below are written as HTML on purpose)."""
    return html.escape(s, quote=True)


def asset_url(name):
    """/assets/site.css?v=<hash of the file>: the address changes whenever the file does, so a
    browser or CDN never serves an old stylesheet next to new pages."""
    digest = hashlib.sha256((WEB / "assets" / name).read_bytes()).hexdigest()[:10]
    return f"/assets/{name}?v={digest}"


def ld_json(obj):
    """JSON for a <script type="application/ld+json"> block: "<" is escaped so a "</script>"
    inside a string cannot end the block."""
    return json.dumps(obj, ensure_ascii=False).replace("<", "\\u003c")


I = {
 "user": '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
 "bed": '<path d="M3 6v13M3 15h18v4M21 15v-3a3 3 0 0 0-3-3h-8v6"/><circle cx="6.5" cy="11" r="2"/>',
 "map": '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
 "play": '<rect x="3" y="5" width="13" height="14" rx="3"/><path d="m16 10 5-3v10l-5-3"/>',
 "sliders": '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
 "wifioff": '<path d="M3 3l18 18"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M5 12.5a10 10 0 0 1 5-2.7M19 12.5a10 10 0 0 0-2.4-1.7"/><path d="M2 8.8a15 15 0 0 1 4.3-2.7M22 8.8A15 15 0 0 0 10.6 5"/><circle cx="12" cy="20" r=".8"/>',
 "route": '<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19h9a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7h9"/>',
 "watch": '<rect x="6" y="6" width="12" height="12" rx="3"/><path d="M9 6V2.5h6V6M9 18v3.5h6V18M12 10v2.2l1.3 1.3"/>',
 "tag": '<path d="M3 12V4h8l10 10-8 8L3 12z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
 "battery": '<rect x="2" y="7" width="17" height="10" rx="2.5"/><path d="M22 11v2M6 10.5v3M10 10.5v3"/>',
 "cloud": '<path d="M7 18a5 5 0 1 1 1-9.9A6 6 0 0 1 19.5 10 4 4 0 0 1 18 18H7z"/>',
 "download": '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
 "shield": '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3z"/><path d="m9 12 2 2 4-4"/>',
 "sync": '<path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4"/>',
 "users": '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M22 20c0-3-2-5-5-5.4"/>',
 "stamp": '<circle cx="12" cy="12" r="9"/><path d="M12 6.5v11M7.5 10.5h9"/>',
 "book": '<path d="M12 7.5C10.7 6.3 8.7 5.5 6.2 5.5H3.5v12h2.7c2.5 0 4.5.8 5.8 2 1.3-1.2 3.3-2 5.8-2h2.7v-12h-2.7c-2.5 0-4.5.8-5.8 2Z"/><path d="M12 7.5v12"/>',
 "headphones": '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><rect x="3" y="14" width="4" height="7" rx="2"/><rect x="17" y="14" width="4" height="7" rx="2"/>',
 "trophy": '<path d="M8 4h8v5a4 4 0 0 1-8 0V4zM8 6H4.5a3.5 3.5 0 0 0 4 4.5M16 6h3.5a3.5 3.5 0 0 1-4 4.5M12 13v4M8 21h8M9.5 17h5"/>',
 "sun": '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>',
 "mail": '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 7 9 6 9-6"/>',
 "pen": '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="m13.5 6.5 4 4"/>',
 "bell": '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
 "pin": '<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
 "coffee": '<path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9zM17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 3v3M12 3v3"/>',
 "camera": '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
 "lock": '<rect x="4" y="10" width="16" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
 "card": '<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 10h19M6 15h4"/>',
 "heart": '<path d="M12 20s-8-4.8-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6.2-8 11-8 11z"/>',
 "compass": '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
 "menu": '<path d="M4 7h16M4 12h16M4 17h16"/>',
 "globe": '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
}

def icon(name, cls=""):
    c = f' class="{cls}"' if cls else ""
    return f'<svg{c} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{I[name]}</svg>'

MARK = ('<svg class="brand-mark" viewBox="0 0 40 40" aria-hidden="true">'
        '<circle cx="20" cy="20" r="20" fill="#14365D"/>'
        '<g transform="translate(0 -2.12)"><path d="M20 28.5L5.84 22.20A2.84 2.84 0 0 1 8.64 17.96A2.84 2.84 0 0 1 12.66 14.85A2.84 2.84 0 0 1 17.46 13.21A2.84 2.84 0 0 1 22.54 13.21A2.84 2.84 0 0 1 27.34 14.85A2.84 2.84 0 0 1 31.36 17.96A2.84 2.84 0 0 1 34.16 22.20z" fill="#D9A21B"/><path d="M20 29.0Q14.09 22.35 8.49 17.82M20 29.0Q16.22 20.86 12.56 14.67M20 29.0Q18.70 20.07 17.43 13.01M20 29.0Q21.30 20.07 22.57 13.01M20 29.0Q23.78 20.86 27.44 14.67M20 29.0Q25.91 22.35 31.51 17.82" stroke="#14365D" stroke-width="1.15" stroke-linecap="round" fill="none"/><path d="M15.2 31.4Q18 30.6 18.4 28.3H21.6Q22 30.6 24.8 31.4Q24.6 32.6 20 32.6Q15.4 32.6 15.2 31.4z" fill="#D9A21B"/></g>'
        '</svg>')

def stores():
    """Plain text buttons until the apps are in the stores. No Apple / Google logos or badge
    artwork: those are trademarks with their own usage rules, so the official badges are added at
    launch (see web/README.md, "Before launch")."""
    return ('<div class="stores">'
            '<span class="store" aria-disabled="true">iOS: coming soon</span>'
            '<span class="store" aria-disabled="true">Android: coming soon</span>'
            '</div>')

def shot(name, alt, lazy=True):
    l = ' loading="lazy" decoding="async"' if lazy else ' fetchpriority="high"'
    return f'<div class="shot"><img src="/assets/screens/{name}.webp" width="600" height="1300" alt="{alt}"{l}></div>'

NAV = [("features", "Features"), ("routes", "Routes"), ("offline-maps", "Offline maps"),
       ("pricing", "Pricing"), ("faq", "FAQ"), ("about", "About"), ("contact", "Contact")]

def header(active):
    def li(slug, label):
        cur = ' aria-current="page"' if slug == active else ""
        return f'<li><a href="/{slug}"{cur}>{label}</a></li>'
    links = "".join(li(s, l) for s, l in NAV)
    return f'''<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap">
    <nav class="nav" aria-label="Main">
      <a class="brand" href="/" aria-label="CaminoPlus home">{MARK}<span>Camino<span class="plus">+</span></span></a>
      <ul class="nav-links">{links}</ul>
      <a class="btn btn-primary nav-cta" href="/#download">Get the app</a>
      <button class="menu-btn" type="button" aria-expanded="false" aria-controls="mobile-nav" aria-label="Open menu">{icon("menu")}</button>
    </nav>
    <div class="mobile-nav" id="mobile-nav">
      <ul>{links}</ul>
      <a class="btn btn-gold" href="/#download">Get the app</a>
    </div>
  </div>
</header>'''

FOOTER = f'''<footer class="site-footer">
  <div class="wrap">
    <div class="foot-grid">
      <div class="stack">
        <a class="brand" href="/">{MARK}<span>Camino<span class="plus">+</span></span></a>
        <p>The offline-first companion for every Camino de Santiago route. Maps, stays, stamps and stories, in one app.</p>
        <div class="on-dark">{stores()}</div>
      </div>
      <div><h4>Product</h4><ul>
        <li><a href="/features">Features</a></li><li><a href="/routes">Routes</a></li>
        <li><a href="/offline-maps">Offline maps</a></li><li><a href="/pricing">Pricing</a></li></ul></div>
      <div><h4>Help</h4><ul>
        <li><a href="/faq">FAQ</a></li><li><a href="/contact">Contact</a></li>
        <li><a href="mailto:hello@camino.plus">hello@camino.plus</a></li></ul></div>
      <div><h4>Company</h4><ul>
        <li><a href="/about">About</a></li><li><a href="/privacy">Privacy</a></li>
        <li><a href="/terms">Terms</a></li><li><a href="/licences">Licences</a></li></ul></div>
    </div>
    <p class="foot-credit">Photos and backgrounds on this site are AI-generated illustrations, not photographs. Landmarks may differ from the real thing.</p>
    <div class="foot-bottom">
      <span>© 2026 CaminoPlus. Map data © <a href="https://www.openstreetmap.org/copyright" rel="noopener">OpenStreetMap contributors</a>.</span>
      <span class="script">Buen Camino</span>
    </div>
  </div>
</footer>
<script src="{asset_url("site.js")}" defer></script>'''

# Preloaded because every page draws its text with them above the fold (Inter) or in the heading (Fraunces).
FONT_PRELOADS = "".join(
    f'<link rel="preload" href="/assets/fonts/{f}" as="font" type="font/woff2" crossorigin>\n'
    for f in ("inter-latin-wght-normal.woff2", "fraunces-latin-opsz-normal.woff2"))


def page(slug, title, desc, body, active=None, jsonld=None):
    path = "/" if slug == "index" else f"/{slug}"
    url = SITE + path
    full = esc(title if slug == "index" else f"{title} · CaminoPlus")
    desc = esc(desc)
    canon = '<meta name="robots" content="noindex">' if slug == "404" else f'<link rel="canonical" href="{url}">'
    ld = f'\n<script type="application/ld+json">{ld_json(jsonld)}</script>' if jsonld else ""
    html_doc = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{full}</title>
<meta name="description" content="{desc}">
{canon}
<meta name="theme-color" content="#F6EFE2">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="CaminoPlus">
<meta property="og:title" content="{full}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{SITE}/assets/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="CaminoPlus app screens on the Camino de Santiago">
<meta property="og:locale" content="en_US">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{full}">
<meta name="twitter:description" content="{desc}">
<meta name="twitter:image" content="{SITE}/assets/og.png">
{FONT_PRELOADS}<link rel="stylesheet" href="{asset_url("tokens.css")}">
<link rel="stylesheet" href="{asset_url("site.css")}">{ld}
</head>
<body>
{header(active)}
<main id="main">
{body}
</main>
{FOOTER}
</body>
</html>
'''
    PAGES["index.html" if slug == "index" else f"{slug}.html"] = html_doc

# The background photos are AI-generated (see web/README.md). Every place that shows one carries a
# visible credit saying so, and the footer says it on every page.
PHOTOS = {
    "meseta-wheat": "a path through wheat fields at sunset",
    "pyrenees-ridge": "a walker on a mountain ridge path",
    "santiago-cathedral": "Santiago Cathedral and the Obradoiro square",
    "santiago-street": "pilgrims walking a street in Santiago",
    "coast-boardwalk": "a wooden boardwalk through coastal dunes",
    "galician-galleries": "the glazed galleries of a Galician town",
    "offline-waymarker-hiker": "a pilgrim and a waymarker above the clouds",
    "faq-boots-arrow": "hiking boots on a cobbled lane",
    "waymarker": "a scallop waymarker with a yellow arrow",
    "contact-backpack-church": "a backpack with a scallop shell, a church tower behind",
}


def ai_credit(photo):
    return f'<p class="ai-credit"><b>AI-generated illustration:</b> {esc(PHOTOS[photo])}</p>'


def cta(title="Your Camino starts with one download.", sub="CaminoPlus launches on iPhone and Android. Leave your email with us and we will tell you the day it is live."):
    return f'''<section class="section" id="download">
  <div class="wrap"><div class="band band-cathedral cta">
    <p class="script" style="color:var(--cp-color-gold-bright)">Buen Camino</p>
    <h2 style="margin-top:12px">{title}</h2>
    <p class="lead" style="margin:16px auto 0">{sub}</p>
    <div class="on-dark">{stores()}</div>
    <p style="margin-top:24px"><a class="btn btn-gold" href="mailto:hello@camino.plus?subject=Tell%20me%20when%20CaminoPlus%20launches">Notify me at launch</a></p>
    {ai_credit("santiago-cathedral")}
  </div></div>
</section>'''

def head(eyebrow, h, lead, extra="", photo=None, pos="center", posm=None):
    cls, st = ("page-head has-photo", f' style="--photo:url(/assets/photos/{photo}.webp);--pos:{pos};--pos-m:{posm or pos}"') if photo else ("page-head", "")
    credit = ai_credit(photo) if photo else ""
    return f'''<section class="{cls}"{st}><div class="wrap">
  <p class="eyebrow">{eyebrow}</p>
  <h1>{h}</h1>
  <p class="lead">{lead}</p>{extra}
</div>{credit}</section>'''


# ---------------------------------------------------------------- data
# What exists today, said plainly: the app is in development. Offline packs hold the map (roads,
# paths, towns, water, churches and albergues from OpenStreetMap), stage by stage. Stay details,
# audio stories and elevation are not in the packs yet and are marked "coming".
COMING = '<span class="tag gold">Coming</span>'

TABS = [
 ("me", "user", "Me", "Your Camino, your story.",
  "A profile that feels like Instagram and a timeline like Facebook, built around the walk. Post your day, collect stamps in a digital credencial and keep track of every stage.",
  ["Notes: a private notebook, the first tab under your profile. Tap the card at the top, Write a note, and the page is saved on your phone as you type. Make words bold or italic, add headings and lists, and attach photos, videos and the place you are at",
   "Nothing in Notes is uploaded unless you share one note by link, so it is not backed up either. It works without a signal and stays on your phone when you log out",
   "Your journey as a grid of posts: tap the first card, Write a journey post, pick photos, write a caption, post",
   "All places: the first item in the row under your Camino card opens a stamp for every place of your route, filled where you have posted. Tap a stamp to see your own journeys there",
   "Passport &amp; stamps: a digital credencial, each stamp with its story",
   "Plan: a stage-by-stage tracker for where you sleep tonight and tomorrow",
   "Health from your smartwatch: steps, distance and heart rate",
   "Friends, notifications and messages behind the chat button at the bottom right: friend requests, notifications, chats and group chats with pilgrims",
   "A friend's profile: tap a friend's name or picture to see the journeys they shared, in the same grid and full-screen view with love, bookmark, comments and share; their notes, plan and health are never shown, and a private profile shows only a name until you are friends",
   "Settings behind the gear at the top right: subscription and storage, account and password, light or dark mode, your smartwatch and your business listing"],
  [("me-journey", "Me tab, Journey: your posts in a grid, the first card writes a new one, and the chat button at the bottom right opens friends, notifications and messages"), ("me-notes", "Me tab, Notes: the card that writes a note, then your private notes, and the chat button at the bottom right")]),
 ("stays", "bed", "Stays", "Albergues, hostels and cafés on your stage.",
  "Search and filter places to sleep and eat along the way, then open a detail page with photos, beds, reviews and opening hours, the way you know from travel apps.",
  ["Filter by category, review score, distance, price and labels",
   "Bookmark favourites for the days ahead",
   "Detail pages with beds, amenities, reviews and popular times",
   "Clear labels on what you can book in the app and what is walk-in only"],
  [("stays", "Stays list with filters"), ("stay-detail", "Stay detail page")]),
 ("maps", "map", "Maps", "Navigation that feels like an adventure.",
  "A clear, Waze-style map with a touch of RPG. Zoom out to see the whole route from above, then pinch in to walk the streets of each town.",
  ["Two layers: helicopter view of the route and city view at street level",
   f"Churches, fountains and points of interest from OpenStreetMap. History pop-ups and audio stories {COMING}",
   "Scavenger hunts, achievements and XP as you walk",
   "Crowd updates from other pilgrims, and the weather ahead",
   "Offline map for every stage you download with Pilgrim Plus: route, towns, water, churches and albergues"],
  [("maps-helicopter", "Maps helicopter view of the whole route"), ("maps-city", "Maps city view at street level")]),
 ("discover", "play", "Discover", "Stories from the trail, full screen.",
  "Swipe through short, full-screen stories from pilgrims and places along the Way. Small tabs at the top switch topics, and a quick tutorial shows you how on your first visit.",
  ["Full-screen photo and video stories, swipe left and right",
   "Topic tabs at the top for the kind of stories you want",
   "Photos of you: buy shots other pilgrims took of you on the way <span class=\"tag gold\">Coming later</span>"],
  [("discover", "Discover full-screen stories"), ("discover-photos", "Photos of you marketplace")]),
 ("library", "book", "Library", "Scripture and books for the road.",
  "A search field and your bookmarks along the top, then two tabs: Bible and Books. The Bible tab is real: all 73 books of the World English Bible, Catholic edition, a modern English translation in the public domain, are in the app, so you can read with no signal. It is not the translation read at Mass. A small banner for the daily reading comes first, then a pill to pick the part (Old Testament, Deuterocanon or New Testament) and the books of that part as compact tiles, two in a row. Tap a book, tap a chapter number and read; Previous and Next carry on across the books. The daily reading is an example today, and the app says so. The Books tab holds the books written for the app, as covers two in a row: pilgrim's guides to the Caminos, and books of readings, each a famous book of the past, a few pages a day, paired with a Camino. They were written with AI assistance, and no person has checked the facts of the guides yet: the page of every book says so. Tap a cover and then Start reading, with a table of contents, Previous and Next, a text size you choose and your place kept on your phone only. Your own notes are not here: they are the first tab of Me.",
  ["The whole Bible in the app: 73 books of the World English Bible, Catholic edition (public domain), readable with no signal",
   "Pick a part, tap a book, tap a chapter number and read. Previous and Next name where they go and carry on from book to book. A Continue reading bar above the tab bar takes you back to the chapter or the book you left, and its X hides it until you read again (remembered only on your phone)",
   "Tap a verse to bookmark it or share it. The search finds verses by their words and opens the chapter at that verse",
   f"The daily reading is an example for now {COMING}",
   "The Books tab: pilgrim's guides and books of readings, as covers. Every book is in the app, so you can read it with no signal: Previous and Next name where they go, you choose the size of the text, and your place is kept only on your phone",
   "The books were written with AI assistance. No person has checked the facts of the guides yet, and each page says so: confirm distances, water and services before you walk",
   "Bookmarks also keep the posts you bookmark on your journey"],
  [("library", "Library tab with a search field and a bookmarks button on top, the tabs Bible and Books, a small banner for the daily reading, the pill that picks Old Testament, Deuterocanon or New Testament, and the books of the Bible as compact tiles, two in a row"), ("library-books", "Library, Books tab: the books written for the app as covers on two shelves, pilgrim's guides and readings, each cover with its title and how long it takes to read")]),
]

# The routes of the route picker, in the order of the database (supabase/migrations/..._more_caminos.sql).
# Kilometres are the database values; None where the database has none yet. Stage ranges are
# editorial (the database only knows 33 stages for the Francés and 12 for the Portugués so far).
# tools/tests/test_web.py keeps this list and the database in step.
# Francés: the site, the design and the social posts all say ~780 km; the database says 773.
ROUTES = [
 ("camino-frances", "Camino Francés", "Saint-Jean-Pied-de-Port, France", 780, "31–35", "The classic. Across the Pyrenees, the Meseta and into Galicia.", "Most walked"),
 ("camino-portugues", "Camino Portugués (Central)", "Porto, Portugal", 240, "10–13", "Through northern Portugal's villages and vineyards.", "Popular"),
 ("camino-portugues-costero", "Camino Portugués (Coastal)", "Porto, Portugal", 260, "11–13", "Atlantic beaches and fishing towns, joining the Central route at Redondela.", None),
 ("camino-del-norte", "Camino del Norte", "Irún, Spain", 820, "33–38", "Along the Bay of Biscay through San Sebastián, Bilbao and Cantabria.", None),
 ("camino-primitivo", "Camino Primitivo", "Oviedo, Spain", 320, "12–15", "The original route. Mountains, quiet paths and big climbs.", None),
 ("camino-ingles", "Camino Inglés", "Ferrol or A Coruña, Spain", 120, "5–6", "Short and green, the route of pilgrims who arrived by sea.", None),
 ("via-de-la-plata", "Vía de la Plata", "Seville, Spain", 1000, "38–42", "The longest in Spain, following an old Roman road north.", None),
 ("camino-finisterre-muxia", "Camino Finisterre &amp; Muxía", "Santiago de Compostela", 90, "3–5", "Keep walking past Santiago to the coast at the 'end of the world'.", None),
 ("camino-aragones", "Camino Aragonés", "Somport, Spain", 160, "6–7", "Down from the Pyrenees to meet the Francés at Puente la Reina.", None),
 ("camino-de-invierno", "Camino de Invierno", "Ponferrada, Spain", 260, "10–12", "The winter route through the Sil valley and Ribeira Sacra.", None),
 ("camino-del-salvador", "Camino del Salvador", "León, Spain", 120, "4–5", "Over the Cantabrian mountains from León to Oviedo, where it joins the Primitivo.", None),
 ("camino-sanabres", "Camino Sanabrés", "Granja de Moreruela, Spain", 370, "15–17", "The Vía de la Plata's branch through Ourense and its hot springs.", None),
 ("camino-de-madrid", "Camino de Madrid", "Madrid, Spain", 320, "12–14", "From the capital over the Guadarrama to join the Francés at Sahagún.", None),
 ("camino-baztanes", "Camino Baztanés", "Bayonne, France", None, None, "From the French Basque coast through the Baztan valley to join the Francés at Pamplona.", None),
 ("camino-portugues-lisboa", "Camino Portugués from Lisbon", "Lisbon, Portugal", 620, "25–29", "The long way along the Portuguese Central route, from the capital to Santiago.", None),
]

# (group id, title, [(question id, question, answer HTML)]). Pages pick questions by id, never by position.
FAQ = [
 ("start", "Getting started", [
  ("what-is", "What is CaminoPlus?", "<p>CaminoPlus is a mobile app for pilgrims walking the Camino de Santiago. It brings together offline maps, places to stay and eat, a digital pilgrim passport, a journal you can share, and stories from the trail, so you only need one app on the Way.</p>"),
  ("when", "When can I download it?", "<p>The app is in development for iPhone and Android. The iOS and Android buttons on this site will turn into the store links at launch. <a href=\"/contact\">Contact us</a> or tap “Notify me at launch” and we will email you on the day.</p>"),
  ("phones", "Which phones are supported?", "<p>CaminoPlus is built for recent iPhones and Android phones. We will publish the exact minimum iOS and Android versions with the store listings.</p>"),
  ("language", "What language is the app in?", "<p>English for now. More languages are planned.</p>"),
  ("account", "Do I need an account?", "<p>Yes, a free account lets you save your plan, passport and journal. You can sign up with email or with Google.</p>"),
 ]),
 ("offline", "Offline &amp; maps", [
  ("offline-works", "Does CaminoPlus work without signal?", "<p>The map does, if you have Pilgrim Plus. Offline maps are only available to paying members. With Pilgrim Plus you download your route stage by stage, and the map and your GPS position keep working for a full walking day without signal. The map shows roads, paths, towns, water, churches and albergues as they are mapped in OpenStreetMap. Details of stays, audio stories and elevation lines still need a connection for now; offline versions are coming. Anything you post while offline waits in a queue and syncs when you are back online.</p>"),
  ("offline-size", "How big are the offline downloads?", "<p>A typical stage pack is about 4 MB, and most are between 1 and 6 MB. Stages through big cities such as Pamplona and Burgos are larger, up to about 11 MB. The first stage of the Camino Francés, Saint-Jean to Roncesvalles, is about 4.6 MB. You can download only the stages you need.</p>"),
  ("battery", "Will GPS drain my battery?", "<p>GPS works without mobile data, and CaminoPlus uses a battery-saving location mode built for long days on foot. Our target is under 15% battery over a 7-hour walk. Real numbers depend on your phone, screen use and cold weather, so carrying a small power bank is still wise.</p>"),
  ("map-data", "Where does the map data come from?", "<p>Offline maps are built from <a href=\"https://www.openstreetmap.org/copyright\" rel=\"noopener\">OpenStreetMap</a>, the free map made by a worldwide community. Map data © OpenStreetMap contributors. See <a href=\"/licences\">Licences</a> for everything the app is built on.</p>"),
  ("fresh", "How fresh is information like crowds and opening hours?", "<p>Live information such as crowd updates is shown with a “updated X ago” label, so you always know how old it is. When you are offline you see the last version you downloaded.</p>"),
 ]),
 ("pricing", "Pricing &amp; billing", [
  ("offline-plus", "Is offline mode only for paying members?", "<p>Yes. Offline maps are part of Pilgrim Plus (<b>$12 per year</b>) and are not available on the free plan. With Pilgrim Plus you download your stages over Wi-Fi, and the map and your GPS position keep working without signal. Without it the map needs a connection: your GPS dot still works without signal, but the base map under it only loads when you are online. See <a href=\"/pricing\">Pricing</a> for everything Pilgrim Plus includes.</p>"),
  ("cost", "How much does CaminoPlus cost?", "<p>The basic app is free. Pilgrim Plus costs <b>$12 per year</b> and adds offline route downloads and 5 GB of cloud storage. See <a href=\"/pricing\">Pricing</a> for details.</p>"),
  ("free-plan", "What can I do on the free plan?", "<p>You can use the basic app with a connection: browse routes and stages, look up stays and cafés, watch stories in Discover and keep your passport and journal on your phone. The free plan has no offline maps (route downloads) and no cloud storage. Both come with Pilgrim Plus.</p>"),
  ("pay", "How do I pay?", "<p>Subscriptions are bought through the App Store or Google Play, using the payment method on your store account. Prices may be shown in your local currency.</p>"),
  ("renew", "Does the subscription renew automatically?", "<p>Yes, yearly, until you cancel. You can turn off auto-renew at any time in your App Store or Google Play subscription settings, and you keep access until the end of the paid year.</p>"),
  ("refund", "Can I get a refund?", "<p>Because payments go through Apple or Google, refunds follow their policies. On iPhone, request one at reportaproblem.apple.com. On Android, request one from your Google Play order history. If something went wrong, <a href=\"/contact\">tell us</a> and we will help.</p>"),
 ]),
 ("storage", "Cloud storage", [
  ("storage-what", "What is the 5 GB of cloud storage for?", "<p>It backs up your journal posts, photos, passport stamps and plan, so nothing is lost if your phone is lost or broken, and you can open your journey on a new phone.</p>"),
  ("storage-more", "What happens if I need more space?", "<p>Add 5 GB more for $5 per year, as many times as you need.</p>"),
  ("storage-end", "What happens to my photos if my subscription ends?", "<p>Your posts stay on your phone. We will remind you before anything in cloud storage changes, and you can export your data at any time.</p>"),
 ]),
 ("watch", "Smartwatch &amp; health", [
  ("watch-which", "Which smartwatches work with CaminoPlus?", "<p>Apple Watch and Garmin. Connect them in Settings.</p>"),
  ("watch-data", "What health data does it use?", "<p>With your permission, CaminoPlus reads walking data such as steps, distance and heart rate to show your daily progress on your profile. You choose what to share, and you can disconnect at any time.</p>"),
 ]),
 ("privacy", "Privacy &amp; data", [
  ("gdpr", "Is CaminoPlus GDPR compliant?", "<p>We design CaminoPlus around the EU General Data Protection Regulation (GDPR). You can see, export, correct and delete your data, and we only use processors that offer GDPR-ready data processing terms. Read the <a href=\"/privacy\">Privacy Policy</a>.</p>"),
  ("who-sees", "Who can see my journey?", "<p>You choose who sees each post you share. Friends and followers see your journey: the posts you share with them, your profile card and its counts. Your plan, the notes of each day, your stamps, GPS tracks, health data and your notes are only for you. On a public profile anyone can follow you without asking; on a private profile you approve each follower.</p>"),
  ("share-link", "Can I show my plan or a note to someone?", "<p>Yes, with a link that opens just that one plan or that one note. Anyone who has the link can see it until you stop sharing it. A plan link shows the route, the dates and where each day starts and ends (the place you sleep only if you choose); never notes, bookings, health or GPS. A note link carries a copy of the words of that one note; photos and videos are not included. Details are in the <a href=\"/privacy\">Privacy Policy</a>.</p>"),
  ("chat-privacy", "Are my messages private?", "<p>Messages in chats and group chats are only shown to the people in the chat, but they are stored on our servers and are <b>not end-to-end encrypted</b>. Do not send passwords or card numbers in chat. You can unsend your own messages, and they are deleted with your account. Details are in the <a href=\"/privacy\">Privacy Policy</a>.</p>"),
  ("sell", "Do you sell my data?", "<p>No. We do not sell personal data, and we do not run third-party ad tracking in the app.</p>"),
  ("delete", "How do I delete my account?", "<p>In the app, go to Settings (the gear at the top right of Me), then Account, then Delete account. That button is being finished and will be in the first release; until it is in your version, email <a href=\"mailto:privacy@camino.plus\">privacy@camino.plus</a> from the address you signed up with and we will do it for you. We delete your account and your data, including your messages, within 30 days, apart from what we must keep by law, such as billing records.</p>"),
 ]),
 ("routes", "Routes", [
  ("routes-which", "Which Camino routes are included?", "<p>All the main Camino de Santiago routes, including the Francés, Portugués (Central, Coastal and from Lisbon), del Norte, Primitivo, Vía de la Plata, Inglés, Finisterre and Muxía, and more. Stage plans and offline maps arrive route by route, starting with the Francés. See <a href=\"/routes\">Routes</a> for the full list.</p>"),
  ("start-anywhere", "Can I start anywhere?", "<p>Yes. Pick your route and the town where you start, and CaminoPlus builds your stages from there. You can change the plan as you go.</p>"),
  ("compostela", "Does CaminoPlus give me a Compostela?", "<p>No. The Compostela is issued by the Pilgrim's Office in Santiago, based on the stamps in your paper credencial. To qualify you must walk at least the last 100 km (or cycle 200 km). The digital passport in CaminoPlus is a keepsake of your journey and does not replace the paper credencial.</p>"),
  ("more-routes", "Will other pilgrimage routes be added?", "<p>That is the plan. CaminoPlus is built so new routes can be added over time.</p>"),
 ]),
 ("community", "Community &amp; safety", [
  ("friendly", "How do you keep the community friendly?", "<p>You can report and block users, posts and messages, and our team reviews reports. Our <a href=\"/terms\">Terms</a> explain what is not allowed.</p>"),
  ("trail-info", "Is the trail information always right?", "<p>We work hard to keep it accurate, but paths, opening hours and conditions change. Always check signs on the ground, follow local advice and use your own judgement, especially in bad weather.</p>"),
 ]),
]


def faq_group(gid):
    return next(qs for k, _, qs in FAQ if k == gid)


def faq_item(qid):
    """(question, answer) of one FAQ entry, looked up by its id."""
    for _, _, qs in FAQ:
        for i, q, a in qs:
            if i == qid:
                return q, a
    raise KeyError(qid)


# ---------------------------------------------------------------- pages
def home():
    tabs = "".join(f'''<article class="card pad-lg stack">
      <span class="ic">{icon(ic)}</span>
      <h3>{label}</h3><p class="muted">{tag}</p>
      <a href="/features#{key}" style="font-weight:600">See {label} →</a>
    </article>''' for key, ic, label, tag, *_ in TABS)
    routes = "".join(f'<li><a class="btn btn-ghost" href="/routes">{r[1]}</a></li>' for r in ROUTES[:8])
    faq_short = [faq_item(i) for i in ("offline-works", "cost", "offline-size", "start-anywhere")]
    qa = "".join(f'<details class="qa"><summary>{q}</summary><div class="ans">{a}</div></details>' for q, a in faq_short)
    body = f'''<section class="hero hero-photo"><div class="wrap hero-grid">
  <div class="hero-copy">
    <p class="script">Buen Camino</p>
    <h1 class="display">Every step of the Way, <em>even offline.</em></h1>
    <p class="lead">CaminoPlus is the pilgrim's companion for the Camino de Santiago. Maps that work without signal, places to sleep and eat, a digital passport for your stamps, and a journal to share the journey. Every route, starting wherever you start.</p>
    {stores()}
    <p class="hero-note">Launching on iPhone and Android. Free to start, $12 a year for offline maps.</p>
  </div>
  <div class="phones" aria-label="App screens">
    {shot("me-journey", "Me tab with journey feed", False)}
    {shot("maps-helicopter", "Map of the Camino Francés in helicopter view", False)}
    {shot("stays", "Stays and cafés list", False)}
  </div>
</div>{ai_credit("meseta-wheat")}</section>

<section class="strip" aria-label="Highlights"><div class="wrap"><ul>
  <li>{icon("route")}All Camino routes, start anywhere</li>
  <li>{icon("wifioff")}Offline maps for 6–8 hour walking days</li>
  <li>{icon("watch")}Apple Watch &amp; Garmin</li>
  <li>{icon("tag")}$12 a year, 5 GB cloud included</li>
</ul></div></section>

<section class="section"><div class="wrap">
  <div class="head center"><p class="eyebrow">Five tabs, one app</p><h2>Everything a pilgrim needs, in the bottom bar.</h2>
  <p class="lead" style="margin-top:16px">No more switching between a map app, a booking site, a notes app and a photo album. CaminoPlus keeps the whole Camino in five tabs.</p></div>
  <div class="grid c3">{tabs}
    <article class="card pad-lg stack" style="background:var(--cp-color-gold-wash);border-color:var(--cp-color-gold-soft)">
      <span class="ic blue">{icon("compass")}</span>
      <h3>See it in action</h3><p class="muted">Screens, details and what is coming next.</p>
      <a class="btn btn-primary" href="/features">See all features</a>
    </article>
  </div>
</div></section>

<section class="section tight"><div class="wrap">
  <article class="feature">
    <div class="feature-media">{shot("me-passport", "Digital passport with stamps")}{shot("me-plan", "Stage plan tracker")}</div>
    <div class="feature-copy">
      <span class="tab-pill">{icon("user")}Me</span>
      <h2>Your credencial, your journal, your plan.</h2>
      <p class="lead">Collect a stamp in every town, write the day down while it is fresh, and know exactly where tonight's bed is.</p>
      <ul class="ticks"><li>Digital passport with the story behind every stamp</li><li>Instagram-style posts: pick photos, add a caption, post</li><li>Stage tracker from your start town to Santiago</li></ul>
    </div>
  </article>
  <article class="feature flip">
    <div class="feature-media">{shot("maps-city", "City view map")}{shot("maps-article", "Church history pop-up on the map")}</div>
    <div class="feature-copy">
      <span class="tab-pill">{icon("map")}Maps</span>
      <h2>A map that turns the Way into an adventure.</h2>
      <p class="lead">See the whole route from above, then drop into each town street by street. Find churches and landmarks, and pick up achievements as you go. Audio stories are coming.</p>
      <ul class="ticks"><li>Helicopter view and city view</li><li>Scavenger hunts and XP, audio stories coming</li><li>Crowd updates and weather, Waze style</li></ul>
    </div>
  </article>
</div></section>

<section class="section tight"><div class="wrap"><div class="band band-hills"><div class="band-grid">
  <div class="stack-lg">
    <p class="eyebrow">Offline-first</p>
    <h2>Built for the hills where your signal disappears.</h2>
    <p class="lead">Download your stages over Wi-Fi at the albergue. Out on the trail, the map and your GPS position keep working: roads, paths, towns, water, churches and albergues. Your posts wait in a queue and go up the moment you are back online.</p>
    <a class="btn btn-gold" href="/offline-maps">How offline maps work</a>
  </div>
  <div class="stat-row">
    <div class="stat"><b>6–8 h</b><span>walking days the offline map is built for</span></div>
    <div class="stat"><b>~4 MB</b><span>for a typical stage</span></div>
    <div class="stat"><b>&lt;15%</b><span>battery target for a 7-hour day</span></div>
    <div class="stat"><b>$12</b><span>a year for offline downloads</span></div>
  </div>
</div>{ai_credit("pyrenees-ridge")}</div></div></section>

<section class="section"><div class="wrap">
  <div class="head center"><p class="eyebrow">Routes</p><h2>Every Camino. Start wherever you start.</h2>
  <p class="lead" style="margin-top:16px">From Saint-Jean, Porto, Oviedo, Seville or your own front door. Pick a route and a starting town, and CaminoPlus plans the stages from there.</p></div>
  <ul class="btn-row" style="list-style:none;padding:0;margin:0;justify-content:center">{routes}<li><a class="btn btn-primary" href="/routes">All routes →</a></li></ul>
</div></section>

<section class="section tight"><div class="wrap">
  <div class="plans">
    <article class="card pad-lg plan">
      <div><h3>Free</h3><p class="muted" style="margin-top:6px">The basic app, online.</p></div>
      <p class="price">$0</p>
      <ul class="ticks"><li>Routes, stays, cafés and Discover</li><li>Passport and journal on your phone</li></ul>
      <a class="btn btn-ghost" href="/pricing">Compare plans</a>
    </article>
    <article class="card pad-lg plan featured">
      <span class="badge-best">For the walk</span>
      <div><h3>Pilgrim Plus</h3><p class="muted" style="margin-top:6px">Everything, offline.</p></div>
      <p class="price">$12<small> / year</small></p>
      <div class="on-dark"><ul class="ticks"><li>Offline route downloads, stage by stage</li><li>5 GB cloud storage for photos and journal</li><li>Extra storage: $5 per 5 GB a year</li></ul></div>
      <a class="btn btn-gold" href="/pricing">See pricing</a>
    </article>
  </div>
</div></section>

<section class="section"><div class="wrap" style="max-width:860px">
  <div class="head center"><p class="eyebrow">Questions</p><h2>Good to know before you go.</h2></div>
  {qa}
  <p class="center" style="margin-top:32px"><a class="btn btn-ghost" href="/faq">Read all FAQs</a></p>
</div></section>

{cta()}'''
    ld = {"@context": "https://schema.org", "@graph": [
        {"@type": "Organization", "name": "CaminoPlus", "url": SITE, "email": "hello@camino.plus"},
        {"@type": "WebSite", "name": "CaminoPlus", "url": SITE},
        {"@type": "MobileApplication", "name": "CaminoPlus", "operatingSystem": "iOS, Android",
         "applicationCategory": "TravelApplication",
         "description": "Offline-first companion app for the Camino de Santiago.",
         "offers": [{"@type": "Offer", "price": "0", "priceCurrency": "USD", "name": "Free"},
                    {"@type": "Offer", "price": "12.00", "priceCurrency": "USD", "name": "Pilgrim Plus (yearly)"}]}]}
    page("index", "CaminoPlus · The offline Camino de Santiago app",
         "Offline maps, stays, a digital pilgrim passport and a shareable journal for every Camino de Santiago route. Works without signal. Free to start, $12 a year.",
         body, None, ld)

def features():
    nav = "".join(f'<a href="#{k}">{icon(ic)}{l}</a>' for k, ic, l, *_ in TABS) + f'<a href="#offline">{icon("wifioff")}Offline</a>'
    rows = ""
    for i, (k, ic, l, tag, intro, ticks, shots) in enumerate(TABS):
        flip = " flip" if i % 2 else ""
        t = "".join(f"<li>{x}</li>" for x in ticks)
        s = "".join(shot(n, a) for n, a in shots)
        rows += f'''<article class="feature{flip}" id="{k}">
    <div class="feature-media">{s}</div>
    <div class="feature-copy">
      <span class="tab-pill">{icon(ic)}{l}</span>
      <h2>{tag}</h2>
      <p class="lead">{intro}</p>
      <ul class="ticks">{t}</ul>
    </div>
  </article>'''
    extra = [("wifioff", "Offline-first", "With Pilgrim Plus, downloaded stages keep the map and your GPS position working for a full day without signal. Details of stays and audio stories need a connection for now."),
             ("sync", "Syncs when you are back", "Posts and stamps go into an outbox and upload automatically when you reconnect."),
             ("battery", "Easy on battery", "A location mode tuned for long walking days. Target: under 15% over 7 hours."),
             ("users", "Crowd updates", "Pilgrims share how busy the trail, albergues and cafés are, with an “updated X ago” label."),
             ("sun", "Weather ahead", "See the forecast for where you will be this afternoon, not just where you are now."),
             ("headphones", f"Audio stories {COMING}", "Listen to the history of churches, bridges and villages as you walk past."),
             ("trophy", "Hunts &amp; achievements", "Scavenger hunts, XP and levels add a little play to every stage."),
             ("watch", "Apple Watch &amp; Garmin", "Steps, distance and heart rate on your profile, with your permission."),
             ("shield", "Private by design", "You choose who sees each post. Export or delete your data any time.")]
    cards = "".join(f'<article class="card"><span class="ic">{icon(a)}</span><h4>{b}</h4><p>{c}</p></article>' for a, b, c in extra)
    body = head("Features", "Five tabs. One Camino.",
        "Me, Stays, Maps, Discover and Library. Here is what each tab does, with screens from our app design.",
        f'<nav class="tabs-nav" aria-label="Jump to" style="margin-top:32px;margin-bottom:0">{nav}</nav>', photo="santiago-street", pos="center 62%")
    body += f'''<section class="section" style="padding-top:24px"><div class="wrap">{rows}
  <p class="muted" style="margin-top:8px;font-size:15px">The screens are previews rendered from our app design. The app is still in development, so details can change before launch.</p>
</div></section>
<section class="section tight" id="offline"><div class="wrap">
  <div class="head"><p class="eyebrow">Under the hood</p><h2>Made for real days on the trail.</h2></div>
  <div class="grid c3">{cards}</div>
</div></section>
{cta()}'''
    page("features", "Features", "Me, Stays, Maps, Discover and Library: see every feature of the CaminoPlus app, from offline maps and stamps to stays, stories and smartwatch sync.", body, "features")

def routes():
    cards = ""
    for _slug, n, frm, km, st, d, badge in ROUTES:
        b = f'<span class="tag gold">{badge}</span>' if badge else ""
        if km is None:
            meta, bar = '<span>Distance to be confirmed</span>', 0
        else:
            meta, bar = f"<span>~{km:,} km</span><span>{st} stages</span>", min(100, km / 10)
        cards += f'''<article class="card route">
      <div class="route-top"><h3>{n}</h3>{b}</div>
      <p class="from">From {frm}</p>
      <p class="muted">{d}</p>
      <div class="route-line" aria-hidden="true"><i style="width:{bar:.0f}%"></i></div>
      <div class="route-meta">{meta}</div>
    </article>'''
    body = head("Routes", "Every Camino, from wherever you start.",
        "CaminoPlus covers the Camino de Santiago routes across Spain, Portugal and France. Choose a route, choose your starting town, and the app builds your stages.", photo="coast-boardwalk", pos="center 58%")
    body += f'''<section class="section" style="padding-top:24px"><div class="wrap">
  <div class="grid c3">{cards}</div>
  <p class="muted" style="margin-top:24px;font-size:15px">Distances and stage counts are approximate and depend on where you start and how far you walk each day. Stage plans and offline maps arrive route by route, starting with the Camino Francés.</p>
</div></section>
<section class="section tight"><div class="wrap"><div class="grid c3">
  <article class="card"><span class="ic">{icon("pin")}</span><h4>Start anywhere</h4><p>Begin in Saint-Jean, Sarria, Porto or any town on the route. Your stages, distances and stays adjust to you.</p></article>
  <article class="card"><span class="ic blue">{icon("download")}</span><h4>Download stage by stage</h4><p>Only take what you need. A typical offline stage pack is about 4 MB.</p></article>
  <article class="card"><span class="ic red">{icon("stamp")}</span><h4>The last 100 km</h4><p>For a Compostela you must walk at least the final 100 km, so plan your start town with that in mind.</p></article>
</div></div></section>
<section class="section"><div class="wrap" style="max-width:860px">
  <div class="head center"><p class="eyebrow">Coming next</p><h2>More pilgrim routes later.</h2>
  <p class="lead" style="margin-top:16px">CaminoPlus is built so new routes can be added over time, including other pilgrimages beyond Santiago. <a href="/contact">Tell us</a> which one you want next.</p></div>
</div></section>
{cta()}'''
    page("routes", "Routes", "All Camino de Santiago routes in one app: Francés, Portugués, del Norte, Primitivo, Vía de la Plata, Inglés, Finisterre and more. Start anywhere.", body, "routes")

def pricing():
    rows = [("Routes and stages (online)", True, True), ("Stays and cafés, with filters", True, True),
            ("Discover stories", True, True), ("Passport, stamps and journal on your phone", True, True),
            ("Offline route downloads", False, True), ("Offline map and GPS position", False, True),
            ("Cloud backup of photos and journal", "—", "5 GB"), ("Extra cloud storage", "—", "$5 / 5 GB / year")]
    def cell(v):
        if v is True: return '<td class="yes">✓<span class="sr-only">Included</span></td>'
        if v is False: return '<td class="no">—<span class="sr-only">Not included</span></td>'
        return f"<td>{v}</td>"
    tr = "".join(f"<tr><td>{a}</td>{cell(b)}{cell(c)}</tr>" for a, b, c in rows)
    qa = "".join(f'<details class="qa"><summary>{q}</summary><div class="ans">{a}</div></details>'
                 for _, q, a in faq_group("pricing") + faq_group("storage"))
    body = head("Pricing", "Less than a café con leche a month.",
        "Start free. When you are ready to walk, Pilgrim Plus unlocks offline maps and cloud storage for a whole year.", photo="galician-galleries", pos="center 18%")
    body += f'''<section class="section" style="padding-top:32px"><div class="wrap">
  <div class="plans">
    <article class="card pad-lg plan">
      <div><h3>Free</h3><p class="muted" style="margin-top:6px">The basic app, with a connection.</p></div>
      <p class="price">$0</p>
      <ul class="ticks"><li>Browse every route and stage</li><li>Stays and cafés with filters</li><li>Discover stories</li><li>Passport and journal on your phone</li></ul>
      <p class="muted" style="font-size:15px">No offline route downloads. No cloud storage.</p>
      <span class="btn btn-ghost" aria-disabled="true">Free at launch</span>
    </article>
    <article class="card pad-lg plan featured">
      <span class="badge-best">For the walk</span>
      <div><h3>Pilgrim Plus</h3><p class="muted" style="margin-top:6px">Everything in Free, plus offline.</p></div>
      <p class="price">$12<small> / year</small></p>
      <div class="on-dark"><ul class="ticks"><li>Download your route stage by stage</li><li>Offline map and GPS position for walking days without signal</li><li>5 GB cloud storage for photos, posts and stamps</li><li>Syncs automatically when you are back online</li></ul></div>
      <a class="btn btn-gold" href="/#download">Get notified at launch</a>
    </article>
  </div>
  <div class="card addon">
    <div><h3>Extra storage</h3><p class="muted" style="margin-top:6px">Taking a lot of photos? Add space in blocks of 5 GB, as many as you need.</p></div>
    <p class="price">$5<small> per 5 GB / year</small></p>
  </div>
  <p class="muted center" style="margin-top:20px;font-size:15px">Prices in US dollars. The App Store and Google Play may show the price in your local currency. Subscriptions renew yearly until cancelled.</p>
</div></section>
<section class="section tight"><div class="wrap" style="max-width:980px">
  <h2 style="margin-bottom:24px">Compare plans</h2>
  <div class="table-scroll"><table class="compare">
    <thead><tr><th scope="col">Feature</th><th scope="col">Free</th><th scope="col">Pilgrim Plus</th></tr></thead>
    <tbody>{tr}</tbody>
  </table></div>
</div></section>
<section class="section"><div class="wrap" style="max-width:860px">
  <div class="head center"><p class="eyebrow">Billing questions</p><h2>Pricing FAQ</h2></div>
  {qa}
</div></section>
{cta()}'''
    ld = {"@context": "https://schema.org", "@type": "Product", "name": "Pilgrim Plus",
          "description": "Yearly subscription with offline route downloads and 5 GB cloud storage.",
          "offers": {"@type": "Offer", "price": "12.00", "priceCurrency": "USD"}}
    page("pricing", "Pricing", "CaminoPlus is free to start. Pilgrim Plus is $12 a year with offline route downloads and 5 GB of cloud storage. Extra storage is $5 per 5 GB a year.", body, "pricing", ld)

def offline():
    steps = [("Pick your route", "Choose a Camino and the town you start from. CaminoPlus lists your stages."),
             ("Download over Wi-Fi", "At home or at the albergue, download the next stages. A typical pack is about 4 MB."),
             ("Walk without signal", "The map and your GPS position work offline: roads, paths, towns, water, churches and albergues."),
             ("Sync when you're back", "Posts and stamps you made offline upload on their own when you reconnect.")]
    st = "".join(f'<article class="card"><h4>{a}</h4><p>{b}</p></article>' for a, b in steps)
    inside = [("map", "Vector map", "Roads, paths, buildings, towns, villages and water, crisp at every zoom level, with place names that are drawn offline too."),
              ("route", "Stage by stage", "Each pack covers one stage and a few kilometres either side of the route, so you only download what you walk."),
              ("pin", "Churches, albergues and water", "Churches, albergues and drinking-water points, as they are mapped in OpenStreetMap."),
              ("bed", f"Stays, stories, elevation {COMING}", "Details of stays, audio stories and elevation lines are not in the packs yet. They need a connection for now; we will add them.")]
    ins = "".join(f'<article class="card"><span class="ic">{icon(a)}</span><h4>{b}</h4><p>{c}</p></article>' for a, b, c in inside)
    body = head("Offline maps", "Signal drops. Your map doesn't.",
        "Large parts of the Camino have weak or no mobile signal. CaminoPlus is built offline-first, so the map and your position keep working with your phone in airplane mode.", photo="offline-waymarker-hiker", pos="center 78%", posm="72% center")
    body += f'''<section class="section" style="padding-top:32px"><div class="wrap">
  <div class="head"><p class="eyebrow">How it works</p><h2>Four steps, then just walk.</h2></div>
  <div class="steps">{st}</div>
</div></section>
<section class="section tight"><div class="wrap"><div class="band"><div class="band-grid">
  <div class="stack-lg">
    <p class="eyebrow">Small downloads</p>
    <h2>A whole stage in a few megabytes.</h2>
    <p class="lead">Stage packs are compact vector maps, not heavy images, so they download quickly even on albergue Wi-Fi and barely touch your phone storage. Stage 1 of the Camino Francés, Saint-Jean-Pied-de-Port to Roncesvalles over the Pyrenees, is about 4.6 MB. Measured over the whole Camino Francés, a typical stage is about 4 MB and most are between 1 and 6 MB; stages through big cities such as Pamplona and Burgos are larger, up to about 11 MB. More stages are being added.</p>
  </div>
  <div class="stat-row">
    <div class="stat"><b>~4 MB</b><span>typical stage pack</span></div>
    <div class="stat"><b>4.6 MB</b><span>Saint-Jean → Roncesvalles</span></div>
    <div class="stat"><b>6–8 h</b><span>walking days it is built for</span></div>
    <div class="stat"><b>&lt;15%</b><span>battery target over 7 hours</span></div>
  </div>
</div></div></div></section>
<section class="section"><div class="wrap">
  <div class="head"><p class="eyebrow">Inside each pack</p><h2>What works offline.</h2></div>
  <div class="grid c4">{ins}</div>
</div></section>
<section class="section tight"><div class="wrap"><div class="grid c3">
  <article class="card"><span class="ic blue">{icon("battery")}</span><h4>Battery-saving GPS</h4><p>GPS needs no mobile data. CaminoPlus uses a location mode tuned for walking, with a target of under 15% battery over a 7-hour day.</p></article>
  <article class="card"><span class="ic blue">{icon("sync")}</span><h4>Outbox that syncs itself</h4><p>Anything you post, stamp or plan offline is saved on your phone and uploaded in order when you have signal again.</p></article>
  <article class="card"><span class="ic blue">{icon("cloud")}</span><h4>“Updated X ago”</h4><p>Live info like crowds always shows when it was last refreshed, so you know how fresh it is.</p></article>
</div></div></section>
<section class="section"><div class="wrap" style="max-width:860px"><div class="card pad-lg stack">
  <span class="ic">{icon("globe")}</span>
  <h3>Built on OpenStreetMap</h3>
  <p class="muted">Offline maps are made from OpenStreetMap, the free, community-built map of the world, which is especially detailed along the Camino. Map data © <a href="https://www.openstreetmap.org/copyright" rel="noopener">OpenStreetMap contributors</a>, available under the Open Database License. See <a href="/licences">Licences</a> for the full list.</p>
  <p class="muted">Offline downloads are part of <a href="/pricing">Pilgrim Plus</a> ($12 a year).</p>
</div></div></section>
{cta()}'''
    page("offline-maps", "Offline maps", "How CaminoPlus offline maps work: download each Camino stage (about 4 MB) and keep the map and your GPS position working without signal.", body, "offline-maps")

def faq():
    toc = "".join(f'<li><a href="#{k}">{t}</a></li>' for k, t, _ in FAQ)
    groups = ""
    for k, t, qs in FAQ:
        q = "".join(f'<details class="qa" id="{i}"><summary>{a}</summary><div class="ans">{b}</div></details>' for i, a, b in qs)
        groups += f'<section class="faq-group" id="{k}"><h2>{t}</h2>{q}</section>'
    ld = {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
        {"@type": "Question", "name": a.replace("&amp;", "&"), "acceptedAnswer": {"@type": "Answer", "text": re.sub("<[^>]+>", "", b).replace("&amp;", "&")}}
        for _, _, qs in FAQ for _, a, b in qs]}
    body = head("FAQ", "Questions, answered.",
        "Offline use, pricing, storage, privacy, smartwatches, routes and more. Can't find yours? <a href=\"/contact\">Ask us</a>.", photo="faq-boots-arrow", pos="center 60%", posm="40% center")
    body += f'''<section class="section" style="padding-top:24px"><div class="wrap faq-layout">
  <nav class="faq-toc" aria-label="FAQ topics"><ul>{toc}</ul></nav>
  <div>{groups}</div>
</div></section>
{cta("Still wondering?", "Write to hello@camino.plus and a real person will answer.")}'''
    page("faq", "FAQ", "Answers about CaminoPlus: offline maps, pricing and refunds, cloud storage, privacy and GDPR, Apple Watch and Garmin, routes and the Compostela.", body, "faq", ld)

def about():
    vals = [("wifioff", "Offline first", "The Camino is not a city. We design for the hill with no signal, not the café with Wi-Fi."),
            ("heart", "Respect the Way", "The Camino is a pilgrimage before it is a trip. The app should help you walk, then get out of the way."),
            ("globe", "Open map data", "Our maps are built on OpenStreetMap, made by volunteers, and we credit them everywhere."),
            ("shield", "Your journey is yours", "You choose who sees what. We do not sell data and you can take your data with you.")]
    v = "".join(f'<article class="card"><span class="ic">{icon(a)}</span><h4>{b}</h4><p>{c}</p></article>' for a, b, c in vals)
    body = head("About", "Made for pilgrims, by people who love the Way.",
        "CaminoPlus started from a simple wish: one app that works on the trail, keeps the memories, and helps you find a bed at the end of the day.", photo="waymarker", pos="0% center", posm="64% center")
    body += f'''<section class="section" style="padding-top:24px"><div class="wrap">
  <div class="grid c2" style="align-items:center;gap:48px">
    <div class="prose">
      <p>Walking to Santiago today often means juggling a guidebook, a map app that needs signal, a booking site, a notes app and a camera roll full of photos you never sort. Each one does part of the job. None of them were made for the Camino.</p>
      <p>CaminoPlus brings it together. The map works when the signal doesn't. Stays and cafés are on the same screen as your route. Your stamps live in a digital passport next to the story of each place. And at the end of the day, you can post your journey the way you already know how.</p>
      <p>We start with the Camino de Santiago, every route, starting wherever you choose. Later we want to bring CaminoPlus to other pilgrim routes around the world.</p>
    </div>
    <div class="feature-media">{shot("me-write-caption", "Writing a journey post")}{shot("cafe-detail", "Café detail page")}</div>
  </div>
</div></section>
<section class="section tight"><div class="wrap">
  <div class="head"><p class="eyebrow">What we believe</p><h2>Our principles.</h2></div>
  <div class="grid c4">{v}</div>
</div></section>
<section class="section"><div class="wrap"><div class="grid c2">
  <article class="card pad-lg stack"><span class="ic">{icon("coffee")}</span><h3>Run an albergue or café?</h3><p class="muted">We want every place on the Way to be easy to find. Get in touch to check or update your listing.</p><a class="btn btn-ghost" href="/contact">Contact us</a></article>
  <article class="card pad-lg stack"><span class="ic blue">{icon("pen")}</span><h3>Press &amp; partners</h3><p class="muted">Writing about the Camino or working with pilgrims? We would love to hear from you.</p><a class="btn btn-ghost" href="mailto:hello@camino.plus?subject=Press">hello@camino.plus</a></article>
</div></div></section>
{cta()}'''
    page("about", "About", "Why we built CaminoPlus: one offline-first app for the Camino de Santiago, made with respect for the Way and for your privacy.", body, "about")

def contact():
    body = head("Contact", "Say hola.",
        "Questions, feedback, a listing to fix or a partnership idea. We read everything.", photo="contact-backpack-church", pos="center 40%", posm="70% center")
    body += f'''<section class="section" style="padding-top:24px"><div class="wrap">
  <div class="grid c2" style="gap:32px;align-items:start">
    <form class="card pad-lg stack-lg" id="contact-form">
      <div class="field"><label for="name">Your name</label><input id="name" name="name" autocomplete="name" required></div>
      <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required></div>
      <div class="field"><label for="topic">Topic</label>
        <select id="topic" name="topic"><option>General</option><option>Support</option><option>Billing</option><option>Albergue or café listing</option><option>Press</option><option>Partnership</option><option>Privacy</option></select></div>
      <div class="field"><label for="message">Message</label><textarea id="message" name="message" required></textarea></div>
      <button class="btn btn-primary" type="submit">Send message</button>
      <p class="muted" style="font-size:14px">This opens your email app with the message ready to send.</p>
    </form>
    <div class="stack">
      <article class="card"><span class="ic">{icon("mail")}</span><h4>General &amp; support</h4><p><a href="mailto:hello@camino.plus">hello@camino.plus</a></p></article>
      <article class="card"><span class="ic blue">{icon("lock")}</span><h4>Privacy &amp; data requests</h4><p><a href="mailto:privacy@camino.plus">privacy@camino.plus</a></p></article>
      <article class="card"><span class="ic red">{icon("coffee")}</span><h4>Albergues, hostels &amp; cafés</h4><p>Add or correct your listing, or ask about partnering. Choose “Albergue or café listing” in the form.</p></article>
      <article class="card"><span class="ic">{icon("compass")}</span><h4>Check the FAQ first</h4><p>Most answers about offline use, pricing and refunds are in the <a href="/faq">FAQ</a>.</p></article>
    </div>
  </div>
</div></section>'''
    page("contact", "Contact", "Contact the CaminoPlus team for support, billing, albergue and café listings, press or partnerships.", body, "contact")

LEGAL_NOTE = '<p class="notice">Draft for launch. This text is a plain-language summary of how we intend to operate and will be reviewed by legal counsel before the app is released.</p>'

def privacy():
    body = head("Privacy", "Privacy Policy", f"Last updated {LEGAL_UPDATED}.", f'<div style="max-width:760px">{LEGAL_NOTE}</div>')
    body += '''<section class="section" style="padding-top:8px"><div class="wrap"><div class="prose">
<h2>Who we are</h2>
<p>CaminoPlus (“we”, “us”) makes the CaminoPlus app and this website. We are the controller of the personal data described here. Contact us at <a href="mailto:privacy@camino.plus">privacy@camino.plus</a>.</p>
<h2>What we collect</h2>
<ul>
<li><b>Account data:</b> your email address, name and profile photo, or the basic profile Google shares if you sign in with Google.</li>
<li><b>Content you create:</b> journal posts, photos, captions, comments, passport stamps and your stage plan.</li>
<li><b>Friends and messages:</b> your friend list and friend requests (who asked whom, and when), the people you block, the messages you send in direct chats and group chats (including photos you attach), and the names and members of your groups.</li>
<li><b>Location:</b> your device location while you use the map, to show where you are and to record your route. You can turn location off at any time in your phone settings.</li>
<li><b>Health and fitness data:</b> only if you connect Apple Watch or Garmin, and only the data you allow, such as steps, distance and heart rate.</li>
<li><b>Purchase data:</b> your subscription status from the App Store or Google Play. We never see your card details.</li>
<li><b>Technical data:</b> device type and app version, and crash reports once crash reporting is switched on, so we can fix problems.</li>
</ul>
<h2>How we use it</h2>
<ul>
<li>To run the app: your account, your journey, offline downloads and sync (contract).</li>
<li>To show your posts to the people you choose (contract, and your choices).</li>
<li>To deliver your messages and friend requests to the people you send them to (contract).</li>
<li>To process health data you connect (your explicit consent, which you can withdraw).</li>
<li>To keep the service secure, prevent abuse and fix bugs (legitimate interests).</li>
<li>To send service emails such as sign-in links and receipts, and launch news if you ask for it (contract or consent).</li>
</ul>
<p>We do not sell personal data and we do not use third-party advertising trackers in the app.</p>
<h2>Friends</h2>
<p>Friends are mutual: you become friends when you send a request and the other person accepts. We store the request, who sent it and when. Declining or cancelling a request deletes it, and so does removing a friend. People you block cannot send you friend requests or messages, and you do not appear in their search. A post you share with “Friends” is shown to your accepted friends and to your followers. On a public profile anyone can follow you without asking; on a private profile you approve each follower.</p>
<h2>Who sees what</h2>
<ul>
<li><b>Your journey</b> (the posts you share, your profile card and its counts, and your route with its status, its planned start and end dates and its distance) is shown to the people each post or setting allows: only you, your friends and followers, or everyone.</li>
<li><b>Only for you:</b> your plan day by day (the date of each day, where it starts and ends, stays, bookings and the notes of each day), your passport stamps (their notes, places and photos), your GPS tracks and your health data. Friends and followers do not see them.</li>
<li><b>Your notes</b> in the app stay on your phone and are not uploaded.</li>
</ul>
<h2>Share links</h2>
<p>You can share one plan or one note through a link. Anyone who has the link can see what it shows, until you stop sharing it in the app. Links can also be made to expire.</p>
<ul>
<li>A <b>plan link</b> shows your plan as it is when the link is opened: the route, the start date, the distance, and for each day the date, where it starts and ends, its distance and whether it is walked. The name of the place you sleep is shown only if you choose. It never shows the notes of a day, bookings, contact details, health, GPS tracks or stamps.</li>
<li>A <b>note link</b> carries a copy of the words of that one note (its title, text and date), made when you share it and stored on our servers until you stop sharing it. Photos, videos and the place of the note are not included.</li>
<li>We store only a fingerprint (a hash) of each link, not the link itself, so we cannot give a lost link back; make a new one instead. We count how often a link is opened and when it was last opened, and show you both.</li>
<li>The link page on this website reads the link only in your browser and does not use cookies or analytics. When you delete your account, your links stop working and are deleted.</li>
</ul>
<h2>Chat messages and groups</h2>
<ul>
<li>Messages you send in direct chats and group chats are stored on our servers so they can reach the other people in the chat and appear on your other devices.</li>
<li>Only the people in a chat can read its messages in the app. Group members can also see each other's names and photos, and whether a message has been read.</li>
<li>Messages are protected in transit and at rest by our hosting provider, but they are <b>not end-to-end encrypted</b>. That means our team and our provider are technically able to read them. We only look at messages to investigate a report, to keep the service secure, or when the law requires it. If someone reports a message, our team can read that message.</li>
<li>Please do not send passwords, card numbers or other secrets in chat.</li>
<li>You can unsend your own messages; they disappear for everyone in the chat. When you delete your account your messages are deleted too.</li>
<li>If you use the help bell, your position is sent only to the friends and groups you choose, as a chat message stored like any other message.</li>
</ul>
<h2>Who processes data for us</h2>
<p>We use trusted service providers that act on our instructions under data processing agreements. In use today:</p>
<ul>
<li>Supabase: accounts and sign-in, the database, and file storage (photos, chat images and the offline map downloads)</li>
<li>Vercel: hosting of this website</li>
<li>MapTiler and OpenFreeMap: the map tiles your phone loads while it is online. They receive your IP address and the area you are looking at. Offline maps come from our own storage, not from them.</li>
<li>Apple and Google: app distribution and payments, and Google sign-in if you choose it</li>
</ul>
<p>Planned, and only used once switched on (we will update this page and its date first):</p>
<ul>
<li>RevenueCat: subscription status, when enabled</li>
<li>Sentry: crash and error reports, when enabled</li>
<li>Resend: sign-in and service emails from our own domain, when enabled</li>
</ul>
<p>Some of these providers may process data outside the European Economic Area. Where they do, we rely on safeguards such as the EU Standard Contractual Clauses.</p>
<h2>How long we keep it</h2>
<p>We keep your data while your account is active. When you delete your account we delete your data, including your messages, within 30 days, except records we must keep by law, such as billing records.</p>
<h2>Deleting your account</h2>
<p>In the app, open Settings, then Account, then Delete account. That button is being finished and will be in the first release. Until it is in your version, email <a href="mailto:privacy@camino.plus">privacy@camino.plus</a> from the address you signed up with and we will delete your account for you within 30 days.</p>
<h2>Your rights</h2>
<p>Under the GDPR and similar laws you can access, correct, export or delete your data, object to or restrict some processing, and withdraw consent at any time. Most of this you can do in the app. For anything else, write to <a href="mailto:privacy@camino.plus">privacy@camino.plus</a>. You can also complain to your local data protection authority, in Spain the Agencia Española de Protección de Datos (AEPD).</p>
<h2>Children</h2>
<p>CaminoPlus is not intended for children under 16 without a parent or guardian's consent.</p>
<h2>This website</h2>
<p>This website does not use cookies, advertising trackers or analytics. Its fonts are served from our own server, not from Google Fonts. Our host, Vercel, processes technical request data such as your IP address to deliver the pages. The contact form only opens your email app with the message ready; nothing is sent until you send it from there. If we add privacy-friendly analytics, we will list them here.</p>
<h2>Changes</h2>
<p>If we make important changes, we will tell you in the app or by email before they take effect.</p>
</div></div></section>'''
    page("privacy", "Privacy Policy", "How CaminoPlus collects, uses and protects your personal data, including messages and friends, and your rights under the GDPR.", body, None)

def terms():
    body = head("Terms", "Terms of Service", f"Last updated {LEGAL_UPDATED}.", f'<div style="max-width:760px">{LEGAL_NOTE}</div>')
    body += '''<section class="section" style="padding-top:8px"><div class="wrap"><div class="prose">
<h2>1. Agreement</h2>
<p>By creating an account or using CaminoPlus you agree to these Terms and to our <a href="/privacy">Privacy Policy</a>. If you do not agree, please do not use the app.</p>
<h2>2. Your account</h2>
<p>Keep your sign-in details safe and tell us if you think someone else is using your account. You are responsible for activity on your account.</p>
<h2>3. Subscriptions and payment</h2>
<ul>
<li>The basic app is free. Pilgrim Plus is a yearly subscription (currently US$12 a year) that includes offline route downloads and 5 GB of cloud storage. Extra storage is sold in blocks of 5 GB for US$5 a year.</li>
<li>Subscriptions are bought and managed through the App Store or Google Play and renew automatically each year until you cancel in your store account settings. Cancelling stops the next renewal; you keep access until the end of the paid period.</li>
<li>Refunds are handled by Apple or Google under their policies. Local consumer rights are not affected.</li>
<li>We may change prices for future periods. We will tell you in advance, and the store will ask for your consent where required.</li>
</ul>
<h2>4. Your content</h2>
<p>You own what you post. You give us a licence to store, process and display it only to run CaminoPlus and to show it to the audience you choose. You can delete it at any time.</p>
<h2>5. Community rules</h2>
<p>Be kind. Do not post anything illegal, hateful, harassing, sexually explicit, or that shares someone else's private information. Only upload photos you have the right to share, and respect people who do not want to be photographed. We may remove content or suspend accounts that break these rules.</p>
<h2>6. Friends, messages and groups</h2>
<ul>
<li>Friends are mutual: you can message someone directly once you are friends. Do not send unwanted, repeated or abusive messages, and do not add people to groups to spam them.</li>
<li>You can block and report people and messages. Our team reviews reports and may remove content or suspend accounts.</li>
<li>Messages are stored on our servers and are not end-to-end encrypted; see the <a href="/privacy">Privacy Policy</a>. Do not share passwords or payment details in chat, and do not share your live location with people you do not know.</li>
</ul>
<h2>7. Safety on the trail</h2>
<p>CaminoPlus is a guide, not a guarantee. Paths, opening hours, prices, availability and conditions change, and information may be incomplete or out of date. Follow waymarks and local advice, check the weather, and use your own judgement. You are responsible for your own safety while walking.</p>
<h2>8. Third-party services</h2>
<p>Some stays or services may be booked with third parties. Those bookings are between you and that provider, under their terms. Listings that can be booked are labelled in the app.</p>
<h2>9. Map data</h2>
<p>Maps use data from OpenStreetMap. Map data © <a href="https://www.openstreetmap.org/copyright" rel="noopener">OpenStreetMap contributors</a>, available under the Open Database License (ODbL). The full list of data and software we build on is on the <a href="/licences">Licences</a> page.</p>
<h2>10. Liability</h2>
<p>To the extent the law allows, CaminoPlus is provided “as is”, and we are not liable for indirect losses or for losses caused by relying on trail information. Nothing in these Terms limits liability that cannot be limited by law.</p>
<h2>11. Ending your use</h2>
<p>You can stop using CaminoPlus and delete your account at any time (in the app: Settings, Account, Delete account; see the <a href="/privacy">Privacy Policy</a>). We may suspend accounts that seriously or repeatedly break these Terms.</p>
<h2>12. Changes and contact</h2>
<p>We may update these Terms and will tell you about important changes in advance. Questions: <a href="mailto:hello@camino.plus">hello@camino.plus</a>.</p>
</div></div></section>'''
    page("terms", "Terms of Service", "The terms for using the CaminoPlus app, subscriptions, friends and messaging.", body, None)

# (name, what we use it for, licence, link). Mirrors the app's Licences screen (mobile/app/licences.tsx).
LICENCES_DATA = [
 ("OpenStreetMap", "Map data: routes, towns, water, churches, albergues", "Open Database Licence (ODbL) 1.0. © OpenStreetMap contributors", "https://www.openstreetmap.org/copyright"),
 ("OpenMapTiles", "The vector tile schema behind our offline maps", "CC BY 4.0. © OpenMapTiles", "https://openmaptiles.org/"),
 ("Natural Earth", "World map data for the lowest zoom levels", "Public domain", "https://www.naturalearthdata.com/about/terms-of-use/"),
 ("OpenFreeMap and MapTiler", "Online base map tiles, only while you are online", "Their terms of use. Data © OpenStreetMap contributors; MapTiler tiles © MapTiler", "https://openfreemap.org/"),
 ("Overture Maps", "Cross-checking places in our data audit", "CDLA-Permissive-2.0", "https://overturemaps.org/"),
 ("Wikidata", "Facts about notable places", "CC0 (public domain dedication)", "https://www.wikidata.org/wiki/Wikidata:Licensing"),
 ("Wikipedia", "Text summaries of places, where we use them", "CC BY-SA 4.0 (credited and linked where shown)", "https://creativecommons.org/licenses/by-sa/4.0/"),
 ("Wikimedia Commons", "Photos of places, where we use them", "Each file has its own licence (CC0, CC BY, CC BY-SA ...); the author and licence are credited where a photo is shown", "https://commons.wikimedia.org/wiki/Commons:Licensing"),
 ("AI-generated sample pictures and clips", "The sample journey in the app, shown before you have posts of your own", "Made by CaminoPlus with Google Nano Banana 2 and Veo 3.1 through OpenArt. AI-generated, not photographs of real places or people", "https://openart.ai/"),
]
def reading_sources():
    """The passages of the books of readings are word for word from public-domain editions: one row for each edition named in the `sources` of a books/<id>/book.json (in the order of
    the books), with the page of the edition, as the Licences screen of the app lists them (mobile/src/features/library/books/sources.ts keeps the app's copy, and a test keeps that copy
    equal to these files)."""
    books = [json.loads(f.read_text(encoding="utf-8")) for f in (ROOT / "books").glob("*/book.json")]
    rows = []
    for b in sorted((b for b in books if b.get("sources")), key=lambda b: (b.get("order", 999), b["id"])):
        for src in b["sources"]:
            translator = src.get("translator")
            by = " · ".join(x for x in (src["author"], translator if translator and not re.match(r"none\b", translator, re.I) else None, src.get("year")) if x)
            rows.append((src["work"], f"{by}. Quoted word for word in “{b['title']}”.", src["licence"], src["url"]))
    return rows


LICENCES_TEXT = [
 ("World English Bible, Catholic edition", "The text of the Bible in the Library: 73 books, kept in the app, so it reads without a signal. Strong’s numbers, footnotes and cross references are not included", "Public domain. The name “World English Bible” is a trademark of eBible.org", "https://ebible.org/eng-web-c/"),
]
LICENCES_SOFTWARE = [
 ("Noto Sans", "Map label glyphs, bundled in the app so labels work offline", "SIL Open Font License 1.1", "https://openfontlicense.org/"),
 ("Fraunces", "Headlines in the app and on this website", "SIL Open Font License 1.1", "/assets/fonts/OFL-Fraunces.txt"),
 ("Inter", "Body text in the app and on this website", "SIL Open Font License 1.1", "/assets/fonts/OFL-Inter.txt"),
 ("JetBrains Mono", "Numbers and labels in the app and on this website", "SIL Open Font License 1.1", "/assets/fonts/OFL-JetBrainsMono.txt"),
 ("Caveat", "Handwritten accents in the app and on this website", "SIL Open Font License 1.1", "/assets/fonts/OFL-Caveat.txt"),
 ("MapLibre", "The map engine: MapLibre Native in the app, MapLibre GL JS in our build tools", "BSD-2-Clause (MapLibre Native), BSD-3-Clause (MapLibre GL JS)", "https://maplibre.org/"),
 ("PMTiles", "The file format of the offline map packs", "BSD-3-Clause", "https://github.com/protomaps/PMTiles"),
 ("Planetiler", "Builds the offline map packs from OpenStreetMap", "Apache-2.0", "https://github.com/onthegomap/planetiler"),
 ("Expo, React Native and React", "The app framework", "MIT", "https://github.com/expo/expo/blob/main/LICENSE"),
 ("Supabase", "Database, sign-in and file storage (the supabase-js library is MIT licensed)", "MIT (client library); Supabase is also one of our processors, see the Privacy Policy", "https://supabase.com/"),
]

def licences():
    def table(rows):
        tr = "".join(
            f'<tr><th scope="row"><a href="{esc(u)}" rel="noopener">{esc(n)}</a></th><td>{esc(w)}</td><td>{esc(l)}</td></tr>'
            for n, w, l, u in rows)
        return (f'<div class="table-scroll"><table class="compare licences"><thead><tr><th scope="col">Name</th>'
                f'<th scope="col">What we use it for</th><th scope="col">Licence</th></tr></thead><tbody>{tr}</tbody></table></div>')
    body = head("Licences", "Licences and credits",
        "CaminoPlus stands on the shoulders of many open projects. Thank you to everyone who maps the Way.")
    body += f'''<section class="section" style="padding-top:8px"><div class="wrap"><div class="prose">
<p>Map data © <a href="https://www.openstreetmap.org/copyright" rel="noopener">OpenStreetMap contributors</a>, available under the Open Database Licence (ODbL). Map design © <a href="https://openmaptiles.org/" rel="noopener">OpenMapTiles</a>. The app shows the same list on its Licences screen.</p>
<h2>Map and place data</h2>
</div>
{table(LICENCES_DATA)}
<div class="prose">
<h2>The Bible text</h2>
</div>
{table(LICENCES_TEXT)}
<div class="prose">
<h2>Software and fonts</h2>
</div>
{table(LICENCES_SOFTWARE)}
<div class="prose">
<h2>Books in the Library</h2>
<p>The passages of the books of readings are word for word from the public-domain editions below, each with the page of the edition. The rest of the text of the books is original text written for CaminoPlus.</p>
</div>
{table(reading_sources())}
<div class="prose">
<h2>Photos on this website</h2>
<p>The background photos on this website are AI-generated illustrations, not photographs, and are marked as such wherever they appear. App screens are rendered from our own design.</p>
<h2>Questions</h2>
<p>If we have missed a credit or got a licence wrong, please write to <a href="mailto:hello@camino.plus">hello@camino.plus</a> and we will fix it.</p>
</div></div></section>'''
    page("licences", "Licences", "The open data, fonts and software CaminoPlus is built on, with their licences and credits: OpenStreetMap, OpenMapTiles, Natural Earth, Overture, Wikidata and more.", body, None)


def share():
    """/s#<token>: one plan or one note somebody shared by link. The token is in the FRAGMENT of the address, so it never
    reaches a server log or a Referer; /assets/share.js reads it, asks get_shared() and draws the answer with textContent only.
    Every address on the page is relative, so it works on whatever host serves web/ (vercel.json adds the same CSP as a header,
    with frame-ancestors). Not indexed, no referrer, no cookies, no analytics, no canonical and no preview card."""
    title = "Shared with you · CaminoPlus"
    body = f'''<section class="page-head share-head"><div class="wrap">
  <p class="eyebrow">Shared with you</p>
  <div id="share" class="share" data-api="{SHARE_SUPABASE_URL}" data-key="{SHARE_SUPABASE_KEY}" aria-live="polite" aria-busy="true">
    <p class="lead share-loading">Opening the link…</p>
    <noscript><h1>Turn on JavaScript</h1><p class="lead">This page needs JavaScript to open a shared plan or note.</p></noscript>
  </div>
</div></section>
<template id="t-unavailable">
  <h1>This link is not available</h1>
  <p class="lead">It may have been stopped by the person who shared it, or it may have expired. Ask them for a new link.</p>
</template>
<template id="t-failed">
  <h1>We could not open the link</h1>
  <p class="lead">Check your connection and try again.</p>
  <p class="share-actions"><button class="btn btn-primary" type="button" data-retry>Try again</button></p>
</template>
<template id="t-plan">
  <h1 data-f="route"></h1>
  <p class="lead">Shared by <b data-f="owner"></b></p>
  <ul class="share-facts" data-f="facts"></ul>
  <div class="card share-box">
    <h2 class="share-box-title">What this link shows</h2>
    <p data-f="shows"></p>
    <h2 class="share-box-title">What it does not show</h2>
    <p>Notes, bookings, contact details, health, GPS tracks, stamps and photos.</p>
    <p class="share-small">This plan is live: you see the latest version each time you open the link. <span data-f="owner"></span> can stop sharing it at any time.</p>
  </div>
  <ol class="share-days" data-f="days"></ol>
</template>
<template id="t-day">
  <li class="share-day">
    <p class="share-day-head"><span class="share-day-n" data-f="n"></span><span class="share-day-date" data-f="date"></span><span class="share-status" data-f="status"></span></p>
    <p class="share-day-way" data-f="way"></p>
    <p class="share-day-meta" data-f="meta"></p>
  </li>
</template>
<template id="t-note">
  <h1 data-f="title"></h1>
  <p class="lead">Shared by <b data-f="owner"></b></p>
  <p class="share-day-meta" data-f="meta"></p>
  <div class="card share-note" data-f="body"></div>
  <div class="card share-box">
    <h2 class="share-box-title">What this link shows</h2>
    <p>A copy of this one note, made when it was shared.</p>
    <h2 class="share-box-title">What it does not show</h2>
    <p>Photos, videos, the other notes and the rest of the journey.</p>
    <p class="share-small"><span data-f="owner"></span> can stop sharing it at any time.</p>
  </div>
</template>'''
    PAGES["s/index.html"] = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="{SHARE_CSP}">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex,nofollow">
<title>{esc(title)}</title>
<meta name="description" content="A Camino plan or note somebody shared with you.">
<meta name="theme-color" content="#F6EFE2">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
{FONT_PRELOADS}<link rel="stylesheet" href="{asset_url("tokens.css")}">
<link rel="stylesheet" href="{asset_url("site.css")}">
<script src="{asset_url("share.js")}" defer></script>
</head>
<body>
{header(None)}
<main id="main">
{body}
</main>
{FOOTER}
</body>
</html>
'''


def notfound():
    body = head("404", "You've wandered off the Way.", "This page doesn't exist. Follow the yellow arrows back home.",
                '<p style="margin-top:32px"><a class="btn btn-primary" href="/">Back to home</a></p>')
    page("404", "Page not found", "This page does not exist.", body, None)

PAGE_FUNCS = (home, features, routes, pricing, offline, faq, about, contact, privacy, terms, licences, notfound, share)
SITEMAP_ORDER = ("index", "features", "routes", "offline-maps", "pricing", "faq", "about", "contact", "privacy", "terms", "licences")


def sitemap(previous_dir):
    """sitemap.xml. A page's <lastmod> is the day its content last changed: the date of the previous
    sitemap when the generated page is identical to the committed one, otherwise the build day
    (SITEMAP_LASTMOD, or today). So re-running the generator on unchanged content changes nothing,
    which is what lets CI compare the output with the committed files."""
    today = os.environ.get("SITEMAP_LASTMOD") or datetime.date.today().isoformat()
    old = {}
    prev = pathlib.Path(previous_dir) / "sitemap.xml"
    if prev.exists():
        old = dict(re.findall(r"<loc>([^<]+)</loc><lastmod>([^<]+)</lastmod>", prev.read_text(encoding="utf-8")))
    urls = []
    for slug in SITEMAP_ORDER:
        name = "index.html" if slug == "index" else f"{slug}.html"
        loc = SITE + ("/" if slug == "index" else f"/{slug}")
        before = pathlib.Path(previous_dir) / name
        same = before.exists() and before.read_text(encoding="utf-8") == PAGES[name]
        urls.append(f"  <url><loc>{loc}</loc><lastmod>{old.get(loc, today) if same else today}</lastmod></url>")
    return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "\n".join(urls) + "\n</urlset>\n"


def build_all(previous_dir=WEB):
    """Generate every page in memory: {file name: content}, including sitemap.xml."""
    PAGES.clear()
    for f in PAGE_FUNCS:
        f()
    PAGES["sitemap.xml"] = sitemap(previous_dir)
    return dict(PAGES)


def main(argv):
    args = argv[1:]
    previous = WEB
    if "--previous" in args:  # compare with another copy of the site (an empty folder: every page counts as changed)
        i = args.index("--previous")
        previous = pathlib.Path(args[i + 1])
        del args[i:i + 2]
    if len(args) != 1:
        sys.exit(__doc__)
    out = pathlib.Path(args[0])
    out.mkdir(parents=True, exist_ok=True)
    for name, content in build_all(previous).items():
        (out / name).parent.mkdir(parents=True, exist_ok=True)
        (out / name).write_text(content, encoding="utf-8")
    print("ok")


if __name__ == "__main__":
    main(sys.argv)
