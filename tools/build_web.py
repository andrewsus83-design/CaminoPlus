"""Generates the static pages in web/ (shared head, header, footer).

Usage: python3 tools/build_web.py web
Edit the content here, re-run, and commit both this file and the output.
"""
import json, sys, pathlib

OUT = pathlib.Path(sys.argv[1])
SITE = "https://camino.plus"

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

APPLE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8s2 .8 3.4.8c1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.7-1-2.7-4.1zM13.9 4.9c.7-.9 1.2-2 1-3.2-1 0-2.3.7-3 1.6-.7.8-1.2 2-1.1 3.1 1.2.1 2.3-.6 3.1-1.5z"/></svg>'
PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 2.8v18.4c0 .5.5.8.9.6L15 12 4.9 2.2c-.4-.2-.9.1-.9.6z" fill="#E8B53A"/><path d="m15 12 3.3-3.3 2.9 1.7c1 .6 1 2.6 0 3.2l-2.9 1.7z" fill="#F6EFE2"/><path d="M4.9 2.2 15 12l3.3-3.3L6.2 1.9c-.5-.3-1-.1-1.3.3z" fill="#A63D2F" opacity=".9"/><path d="M4.9 21.8 15 12l3.3 3.3-12.1 6.8c-.5.3-1 .1-1.3-.3z" fill="#DCE5EF"/></svg>'

def stores():
    return ('<div class="stores">'
            f'<span class="store" role="img" aria-label="Download on the App Store, coming soon">{APPLE}<span><small>Download on the</small><b>App Store</b></span><span class="soon">Soon</span></span>'
            f'<span class="store" role="img" aria-label="Get it on Google Play, coming soon">{PLAY}<span><small>Get it on</small><b>Google Play</b></span><span class="soon">Soon</span></span>'
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
        <li><a href="/terms">Terms</a></li></ul></div>
    </div>
    <div class="foot-bottom">
      <span>© 2026 CaminoPlus. Map data © <a href="https://www.openstreetmap.org/copyright" rel="noopener">OpenStreetMap contributors</a>.</span>
      <span class="script">Buen Camino</span>
    </div>
  </div>
</footer>
<script src="/assets/site.js" defer></script>'''

def page(slug, title, desc, body, active=None, jsonld=None):
    path = "/" if slug == "index" else f"/{slug}"
    url = SITE + path
    full = title if slug == "index" else f"{title} · CaminoPlus"
    canon = '<meta name="robots" content="noindex">' if slug == "404" else f'<link rel="canonical" href="{url}">'
    ld = f'\n<script type="application/ld+json">{json.dumps(jsonld, ensure_ascii=False)}</script>' if jsonld else ""
    html = f'''<!doctype html>
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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="/assets/tokens.css">
<link rel="stylesheet" href="/assets/site.css">{ld}
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
    name = "index.html" if slug == "index" else f"{slug}.html"
    (OUT / name).write_text(html)

def cta(title="Your Camino starts with one download.", sub="CaminoPlus launches on iPhone and Android. Leave your email with us and we will tell you the day it is live."):
    return f'''<section class="section" id="download">
  <div class="wrap"><div class="band band-cathedral cta">
    <p class="script" style="color:var(--cp-color-gold-bright)">Buen Camino</p>
    <h2 style="margin-top:12px">{title}</h2>
    <p class="lead" style="margin:16px auto 0">{sub}</p>
    <div class="on-dark">{stores()}</div>
    <p style="margin-top:24px"><a class="btn btn-gold" href="mailto:hello@camino.plus?subject=Tell%20me%20when%20CaminoPlus%20launches">Notify me at launch</a></p>
  </div></div>
</section>'''

def head(eyebrow, h, lead, extra="", photo=None, pos="center", posm=None):
    cls, st = ("page-head has-photo", f' style="--photo:url(/assets/photos/{photo}.webp);--pos:{pos};--pos-m:{posm or pos}"') if photo else ("page-head", "")
    return f'''<section class="{cls}"{st}><div class="wrap">
  <p class="eyebrow">{eyebrow}</p>
  <h1>{h}</h1>
  <p class="lead">{lead}</p>{extra}
</div></section>'''

# ---------------------------------------------------------------- data
TABS = [
 ("me", "user", "Me", "Your Camino, your story.",
  "A profile that feels like Instagram and a timeline like Facebook, built around the walk. Post your day, collect stamps in a digital credencial and keep track of every stage.",
  ["Self journey feed: tap the pen button, pick photos, write a caption, post",
   "Passport &amp; stamps: a digital credencial, each stamp with its story",
   "Plan: a stage-by-stage tracker for where you sleep tonight and tomorrow",
   "Health from your smartwatch: steps, distance and heart rate",
   "Inbox behind the bell: notifications and messages with hosts and pilgrims"],
  [("me-journey", "Me tab: profile and journey feed"), ("me-passport", "Passport with collected stamps")]),
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
   "Churches, history and points of interest, with audio stories",
   "Scavenger hunts, achievements and XP as you walk",
   "Crowd updates from other pilgrims, and the weather ahead",
   "Works offline with downloaded stage packs"],
  [("maps-helicopter", "Maps helicopter view of the whole route"), ("maps-city", "Maps city view at street level")]),
 ("explore", "play", "Explore", "Stories from the trail, full screen.",
  "Swipe through short, full-screen stories from pilgrims and places along the Way. Small tabs at the top switch topics, and a quick tutorial shows you how on your first visit.",
  ["Full-screen photo and video stories, swipe left and right",
   "Topic tabs at the top for the kind of stories you want",
   "Photos of you: buy shots other pilgrims took of you on the way <span class=\"tag gold\">Coming later</span>"],
  [("explore", "Explore full-screen stories"), ("explore-photos", "Photos of you marketplace")]),
 ("settings", "sliders", "Settings", "Everything else, kept simple.",
  "Manage your subscription and storage, change your password and connect your watch. No clutter.",
  ["Billing and subscription, with extra storage when you need it",
   "Account and password, sign in with email or Google",
   "Connect Apple Watch or Garmin"],
  [("settings", "Settings screen"), ("me-plan", "Plan stage tracker")]),
]

ROUTES = [
 ("Camino Francés", "Saint-Jean-Pied-de-Port, France", 780, "31–35", "The classic. Across the Pyrenees, the Meseta and into Galicia.", "Most walked"),
 ("Camino Portugués (Central)", "Porto (or Lisbon), Portugal", 240, "10–13", "Through northern Portugal's villages and vineyards. About 620 km and 25–29 stages if you start in Lisbon.", "Popular"),
 ("Camino Portugués (Coastal)", "Porto, Portugal", 260, "11–13", "Atlantic beaches and fishing towns, joining the Central route at Redondela.", None),
 ("Camino del Norte", "Irún, Spain", 825, "33–38", "Along the Bay of Biscay through San Sebastián, Bilbao and Cantabria.", None),
 ("Camino Primitivo", "Oviedo, Spain", 310, "12–15", "The original route. Mountains, quiet paths and big climbs.", None),
 ("Vía de la Plata", "Seville, Spain", 1000, "38–42", "The longest in Spain, following an old Roman road north.", None),
 ("Camino Inglés", "Ferrol or A Coruña, Spain", 120, "5–6", "Short and green, the route of pilgrims who arrived by sea.", None),
 ("Camino Finisterre &amp; Muxía", "Santiago de Compostela", 120, "3–5", "Keep walking past Santiago to the coast at the 'end of the world'.", None),
 ("Camino Sanabrés", "Granja de Moreruela, Spain", 370, "15–17", "The Vía de la Plata's branch through Ourense and its hot springs.", None),
 ("Camino de Invierno", "Ponferrada, Spain", 265, "10–12", "The winter route through the Sil valley and Ribeira Sacra.", None),
 ("Camino de Madrid", "Madrid, Spain", 320, "12–14", "From the capital over the Guadarrama to join the Francés at Sahagún.", None),
 ("Camino Aragonés", "Somport, Spain", 160, "6–7", "Down from the Pyrenees to meet the Francés at Puente la Reina.", None),
 ("Via Podiensis (Le Puy)", "Le Puy-en-Velay, France", 740, "28–32", "France's best-known route, ending at Saint-Jean-Pied-de-Port.", None),
]

FAQ = [
 ("start", "Getting started", [
  ("What is CaminoPlus?", "<p>CaminoPlus is a mobile app for pilgrims walking the Camino de Santiago. It brings together offline maps, places to stay and eat, a digital pilgrim passport, a journal you can share, and stories from the trail, so you only need one app on the Way.</p>"),
  ("When can I download it?", "<p>The app is in development for iPhone and Android. The App Store and Google Play buttons on this site will go live at launch. <a href=\"/contact\">Contact us</a> or tap “Notify me at launch” and we will email you on the day.</p>"),
  ("Which phones are supported?", "<p>CaminoPlus is built for recent iPhones and Android phones. We will publish the exact minimum iOS and Android versions with the store listings.</p>"),
  ("What language is the app in?", "<p>English for now. More languages are planned.</p>"),
  ("Do I need an account?", "<p>Yes, a free account lets you save your plan, passport and journal. You can sign up with email or with Google.</p>"),
 ]),
 ("offline", "Offline &amp; maps", [
  ("Does CaminoPlus work without signal?", "<p>Yes. CaminoPlus is offline-first. With a subscription you download your route stage by stage, and the map, your position, stays, cafés and points of interest keep working for a full walking day without signal. Anything you post while offline waits in a queue and syncs when you are back online.</p>"),
  ("How big are the offline downloads?", "<p>Each stage pack is roughly 2–5 MB. The first stage of the Camino Francés, Saint-Jean to Roncesvalles, is about 4.6 MB. You can download only the stages you need, and the app itself is designed to stay under 80 MB to install.</p>"),
  ("Will GPS drain my battery?", "<p>GPS works without mobile data, and CaminoPlus uses a battery-saving location mode built for long days on foot. Our target is under 15% battery over a 7-hour walk. Real numbers depend on your phone, screen use and cold weather, so carrying a small power bank is still wise.</p>"),
  ("Where does the map data come from?", "<p>Offline maps are built from <a href=\"https://www.openstreetmap.org/copyright\" rel=\"noopener\">OpenStreetMap</a>, the free map made by a worldwide community. Map data © OpenStreetMap contributors.</p>"),
  ("How fresh is information like crowds and opening hours?", "<p>Live information such as crowd updates is shown with a “updated X ago” label, so you always know how old it is. When you are offline you see the last version you downloaded.</p>"),
 ]),
 ("pricing", "Pricing &amp; billing", [
  ("How much does CaminoPlus cost?", "<p>The basic app is free. Pilgrim Plus costs <b>$11.99 per year</b> and adds offline route downloads and 5 GB of cloud storage. See <a href=\"/pricing\">Pricing</a> for details.</p>"),
  ("What can I do on the free plan?", "<p>You can use the basic app with a connection: browse routes and stages, look up stays and cafés, watch stories in Explore and keep your passport and journal on your phone. The free plan has no offline route downloads and no cloud storage.</p>"),
  ("How do I pay?", "<p>Subscriptions are bought through the App Store or Google Play, using the payment method on your store account. Prices may be shown in your local currency.</p>"),
  ("Does the subscription renew automatically?", "<p>Yes, yearly, until you cancel. You can turn off auto-renew at any time in your App Store or Google Play subscription settings, and you keep access until the end of the paid year.</p>"),
  ("Can I get a refund?", "<p>Because payments go through Apple or Google, refunds follow their policies. On iPhone, request one at reportaproblem.apple.com. On Android, request one from your Google Play order history. If something went wrong, <a href=\"/contact\">tell us</a> and we will help.</p>"),
 ]),
 ("storage", "Cloud storage", [
  ("What is the 5 GB of cloud storage for?", "<p>It backs up your journal posts, photos, passport stamps and plan, so nothing is lost if your phone is lost or broken, and you can open your journey on a new phone.</p>"),
  ("What happens if I need more space?", "<p>Add 5 GB more for $5 per year, as many times as you need.</p>"),
  ("What happens to my photos if my subscription ends?", "<p>Your posts stay on your phone. We will remind you before anything in cloud storage changes, and you can export your data at any time.</p>"),
 ]),
 ("watch", "Smartwatch &amp; health", [
  ("Which smartwatches work with CaminoPlus?", "<p>Apple Watch and Garmin. Connect them in Settings.</p>"),
  ("What health data does it use?", "<p>With your permission, CaminoPlus reads walking data such as steps, distance and heart rate to show your daily progress on your profile. You choose what to share, and you can disconnect at any time.</p>"),
 ]),
 ("privacy", "Privacy &amp; data", [
  ("Is CaminoPlus GDPR compliant?", "<p>We design CaminoPlus around the EU General Data Protection Regulation (GDPR). You can see, export, correct and delete your data, and we only use processors that offer GDPR-ready data processing terms. Read the <a href=\"/privacy\">Privacy Policy</a>.</p>"),
  ("Who can see my journey?", "<p>You choose who sees each post you share. Your journey is yours.</p>"),
  ("Do you sell my data?", "<p>No. We do not sell personal data, and we do not run third-party ad tracking in the app.</p>"),
  ("How do I delete my account?", "<p>From Settings in the app, or by emailing <a href=\"mailto:privacy@camino.plus\">privacy@camino.plus</a>. Deleting your account removes your data from our systems, apart from what we must keep by law, such as billing records.</p>"),
 ]),
 ("routes", "Routes", [
  ("Which Camino routes are included?", "<p>All the main Camino de Santiago routes, including the Francés, Portugués (Central and Coastal), del Norte, Primitivo, Vía de la Plata, Inglés, Finisterre and Muxía, and more. See <a href=\"/routes\">Routes</a> for the full list.</p>"),
  ("Can I start anywhere?", "<p>Yes. Pick your route and the town where you start, and CaminoPlus builds your stages from there. You can change the plan as you go.</p>"),
  ("Does CaminoPlus give me a Compostela?", "<p>No. The Compostela is issued by the Pilgrim's Office in Santiago, based on the stamps in your paper credencial. To qualify you must walk at least the last 100 km (or cycle 200 km). The digital passport in CaminoPlus is a keepsake of your journey and does not replace the paper credencial.</p>"),
  ("Will other pilgrimage routes be added?", "<p>That is the plan. CaminoPlus is built so new routes can be added over time.</p>"),
 ]),
 ("community", "Community &amp; safety", [
  ("How do you keep the community friendly?", "<p>You can report and block users and posts, and our team reviews reports. Our <a href=\"/terms\">Terms</a> explain what is not allowed.</p>"),
  ("Is the trail information always right?", "<p>We work hard to keep it accurate, but paths, opening hours and conditions change. Always check signs on the ground, follow local advice and use your own judgement, especially in bad weather.</p>"),
 ]),
]

# ---------------------------------------------------------------- pages
def home():
    tabs = "".join(f'''<article class="card pad-lg stack">
      <span class="ic">{icon(ic)}</span>
      <h3>{label}</h3><p class="muted">{tag}</p>
      <a href="/features#{key}" style="font-weight:600">See {label} →</a>
    </article>''' for key, ic, label, tag, *_ in TABS)
    routes = "".join(f'<li><a class="btn btn-ghost" href="/routes">{n}</a></li>' for n, *_ in ROUTES[:8])
    faq_short = [FAQ[1][2][0], FAQ[2][2][0], FAQ[1][2][1], FAQ[6][2][1]]
    qa = "".join(f'<details class="qa"><summary>{q}</summary><div class="ans">{a}</div></details>' for q, a in faq_short)
    body = f'''<section class="hero hero-photo"><div class="wrap hero-grid">
  <div class="hero-copy">
    <p class="script">Buen Camino</p>
    <h1 class="display">Every step of the Way, <em>even offline.</em></h1>
    <p class="lead">CaminoPlus is the pilgrim's companion for the Camino de Santiago. Maps that work without signal, places to sleep and eat, a digital passport for your stamps, and a journal to share the journey. Every route, starting wherever you start.</p>
    {stores()}
    <p class="hero-note">Launching on iPhone and Android. Free to start, $11.99 a year for offline maps.</p>
  </div>
  <div class="phones" aria-label="App screens">
    {shot("me-journey", "Me tab with journey feed", False)}
    {shot("maps-helicopter", "Map of the Camino Francés in helicopter view", False)}
    {shot("stays", "Stays and cafés list", False)}
  </div>
</div></section>

<section class="strip" aria-label="Highlights"><div class="wrap"><ul>
  <li>{icon("route")}All Camino routes, start anywhere</li>
  <li>{icon("wifioff")}Works 6–8 hours with no signal</li>
  <li>{icon("watch")}Apple Watch &amp; Garmin</li>
  <li>{icon("tag")}$11.99 a year, 5 GB cloud included</li>
</ul></div></section>

<section class="section"><div class="wrap">
  <div class="head center"><p class="eyebrow">Five tabs, one app</p><h2>Everything a pilgrim needs, in the bottom bar.</h2>
  <p class="lead" style="margin-top:16px">No more switching between a map app, a booking site, a notes app and a photo album. CaminoPlus keeps the whole Camino in five tabs.</p></div>
  <div class="grid c3">{tabs}
    <article class="card pad-lg stack" style="background:var(--cp-color-gold-wash);border-color:var(--cp-color-gold-soft)">
      <span class="ic blue">{icon("compass")}</span>
      <h3>See it in action</h3><p class="muted">Screens, details and what is coming next.</p>
      <a class="btn btn-primary" href="/features">Explore all features</a>
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
      <p class="lead">See the whole route from above, then drop into each town street by street. Find churches, hear their stories, and pick up achievements as you go.</p>
      <ul class="ticks"><li>Helicopter view and city view</li><li>Audio stories, scavenger hunts and XP</li><li>Crowd updates and weather, Waze style</li></ul>
    </div>
  </article>
</div></section>

<section class="section tight"><div class="wrap"><div class="band band-hills"><div class="band-grid">
  <div class="stack-lg">
    <p class="eyebrow">Offline-first</p>
    <h2>Built for the hills where your signal disappears.</h2>
    <p class="lead">Download your stages over Wi-Fi at the albergue. Out on the trail, the map, your GPS position, stays and points of interest all keep working. Your posts wait in a queue and go up the moment you are back online.</p>
    <a class="btn btn-gold" href="/offline-maps">How offline maps work</a>
  </div>
  <div class="stat-row">
    <div class="stat"><b>6–8 h</b><span>of walking with no signal</span></div>
    <div class="stat"><b>2–5 MB</b><span>per downloaded stage</span></div>
    <div class="stat"><b>&lt;15%</b><span>battery target for a 7-hour day</span></div>
    <div class="stat"><b>&lt;80 MB</b><span>to install the app</span></div>
  </div>
</div></div></div></section>

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
      <ul class="ticks"><li>Routes, stays, cafés and Explore</li><li>Passport and journal on your phone</li></ul>
      <a class="btn btn-ghost" href="/pricing">Compare plans</a>
    </article>
    <article class="card pad-lg plan featured">
      <span class="badge-best">For the walk</span>
      <div><h3>Pilgrim Plus</h3><p class="muted" style="margin-top:6px">Everything, offline.</p></div>
      <p class="price">$11.99<small> / year</small></p>
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
                    {"@type": "Offer", "price": "11.99", "priceCurrency": "USD", "name": "Pilgrim Plus (yearly)"}]}]}
    page("index", "CaminoPlus · The offline Camino de Santiago app",
         "Offline maps, stays, a digital pilgrim passport and a shareable journal for every Camino de Santiago route. Works without signal. Free to start, $11.99 a year.",
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
    extra = [("wifioff", "Offline-first", "Downloaded stages keep the map, GPS, stays and POIs working for a full day without signal."),
             ("sync", "Syncs when you are back", "Posts and stamps go into an outbox and upload automatically when you reconnect."),
             ("battery", "Easy on battery", "A location mode tuned for long walking days. Target: under 15% over 7 hours."),
             ("users", "Crowd updates", "Pilgrims share how busy the trail, albergues and cafés are, with an “updated X ago” label."),
             ("sun", "Weather ahead", "See the forecast for where you will be this afternoon, not just where you are now."),
             ("headphones", "Audio stories", "Listen to the history of churches, bridges and villages as you walk past."),
             ("trophy", "Hunts &amp; achievements", "Scavenger hunts, XP and levels add a little play to every stage."),
             ("watch", "Apple Watch &amp; Garmin", "Steps, distance and heart rate on your profile, with your permission."),
             ("shield", "Private by design", "You choose who sees each post. Export or delete your data any time.")]
    cards = "".join(f'<article class="card"><span class="ic">{icon(a)}</span><h4>{b}</h4><p>{c}</p></article>' for a, b, c in extra)
    body = head("Features", "Five tabs. One Camino.",
        "Me, Stays, Maps, Explore and Settings. Here is what each tab does, with real screens from the app design.",
        f'<nav class="tabs-nav" aria-label="Jump to" style="margin-top:32px;margin-bottom:0">{nav}</nav>', photo="santiago-street", pos="center 62%")
    body += f'''<section class="section" style="padding-top:24px"><div class="wrap">{rows}</div></section>
<section class="section tight" id="offline"><div class="wrap">
  <div class="head"><p class="eyebrow">Under the hood</p><h2>Made for real days on the trail.</h2></div>
  <div class="grid c3">{cards}</div>
</div></section>
{cta()}'''
    page("features", "Features", "Me, Stays, Maps, Explore and Settings: see every feature of the CaminoPlus app, from offline maps and stamps to stays, stories and smartwatch sync.", body, "features")

def routes():
    cards = ""
    for n, frm, km, st, d, badge in ROUTES:
        b = f'<span class="tag gold">{badge}</span>' if badge else ""
        cards += f'''<article class="card route">
      <div class="route-top"><h3>{n}</h3>{b}</div>
      <p class="from">From {frm}</p>
      <p class="muted">{d}</p>
      <div class="route-line" aria-hidden="true"><i style="width:{min(100, km/10):.0f}%"></i></div>
      <div class="route-meta"><span>~{km:,} km</span><span>{st} stages</span></div>
    </article>'''
    body = head("Routes", "Every Camino, from wherever you start.",
        "CaminoPlus covers the Camino de Santiago routes across Spain, Portugal and France. Choose a route, choose your starting town, and the app builds your stages.", photo="coast-boardwalk", pos="center 58%")
    body += f'''<section class="section" style="padding-top:24px"><div class="wrap">
  <div class="grid c3">{cards}</div>
  <p class="muted" style="margin-top:24px;font-size:15px">Distances and stage counts are approximate and depend on where you start and how far you walk each day.</p>
</div></section>
<section class="section tight"><div class="wrap"><div class="grid c3">
  <article class="card"><span class="ic">{icon("pin")}</span><h4>Start anywhere</h4><p>Begin in Saint-Jean, Sarria, Porto or any town on the route. Your stages, distances and stays adjust to you.</p></article>
  <article class="card"><span class="ic blue">{icon("download")}</span><h4>Download stage by stage</h4><p>Only take what you need. Each offline stage pack is about 2–5 MB.</p></article>
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
            ("Explore stories", True, True), ("Passport, stamps and journal on your phone", True, True),
            ("Offline route downloads", False, True), ("Offline GPS navigation", False, True),
            ("Cloud backup of photos and journal", "—", "5 GB"), ("Extra cloud storage", "—", "$5 / 5 GB / year")]
    def cell(v):
        if v is True: return '<td class="yes">✓<span class="sr-only">Included</span></td>'
        if v is False: return '<td class="no">—<span class="sr-only">Not included</span></td>'
        return f"<td>{v}</td>"
    tr = "".join(f"<tr><td>{a}</td>{cell(b)}{cell(c)}</tr>" for a, b, c in rows)
    qa = "".join(f'<details class="qa"><summary>{q}</summary><div class="ans">{a}</div></details>' for q, a in FAQ[2][2] + FAQ[3][2])
    body = head("Pricing", "Less than a café con leche a month.",
        "Start free. When you are ready to walk, Pilgrim Plus unlocks offline maps and cloud storage for a whole year.", photo="galician-galleries", pos="center 18%")
    body += f'''<section class="section" style="padding-top:32px"><div class="wrap">
  <div class="plans">
    <article class="card pad-lg plan">
      <div><h3>Free</h3><p class="muted" style="margin-top:6px">The basic app, with a connection.</p></div>
      <p class="price">$0</p>
      <ul class="ticks"><li>Browse every route and stage</li><li>Stays and cafés with filters</li><li>Explore stories</li><li>Passport and journal on your phone</li></ul>
      <p class="muted" style="font-size:15px">No offline route downloads. No cloud storage.</p>
      <span class="btn btn-ghost" aria-disabled="true">Free at launch</span>
    </article>
    <article class="card pad-lg plan featured">
      <span class="badge-best">For the walk</span>
      <div><h3>Pilgrim Plus</h3><p class="muted" style="margin-top:6px">Everything in Free, plus offline.</p></div>
      <p class="price">$11.99<small> / year</small></p>
      <div class="on-dark"><ul class="ticks"><li>Download your route stage by stage</li><li>Offline map and GPS for 6–8 hours without signal</li><li>5 GB cloud storage for photos, posts and stamps</li><li>Syncs automatically when you are back online</li></ul></div>
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
          "offers": {"@type": "Offer", "price": "11.99", "priceCurrency": "USD"}}
    page("pricing", "Pricing", "CaminoPlus is free to start. Pilgrim Plus is $11.99 a year with offline route downloads and 5 GB of cloud storage. Extra storage is $5 per 5 GB a year.", body, "pricing", ld)

def offline():
    steps = [("Pick your route", "Choose a Camino and the town you start from. CaminoPlus lists your stages."),
             ("Download over Wi-Fi", "At home or at the albergue, download the next stages. Each pack is about 2–5 MB."),
             ("Walk without signal", "Map, GPS position, stays, cafés and points of interest all work offline."),
             ("Sync when you're back", "Posts and stamps you made offline upload on their own when you reconnect.")]
    st = "".join(f'<article class="card"><h4>{a}</h4><p>{b}</p></article>' for a, b in steps)
    inside = [("map", "Vector map", "Paths, roads, buildings, water and terrain, crisp at every zoom level."),
              ("route", "Your route line", "The waymarked route, stage start and end points and distances."),
              ("bed", "Stays &amp; cafés", "Albergues, hostels and cafés on that stage, with the details you need."),
              ("pin", "Points of interest", "Churches, fountains, pharmacies and more, with their stories.")]
    ins = "".join(f'<article class="card"><span class="ic">{icon(a)}</span><h4>{b}</h4><p>{c}</p></article>' for a, b, c in inside)
    body = head("Offline maps", "Signal drops. Your map doesn't.",
        "Large parts of the Camino have weak or no mobile signal. CaminoPlus is built offline-first, so a full walking day works with your phone in airplane mode.")
    body += f'''<section class="section" style="padding-top:32px"><div class="wrap">
  <div class="head"><p class="eyebrow">How it works</p><h2>Four steps, then just walk.</h2></div>
  <div class="steps">{st}</div>
</div></section>
<section class="section tight"><div class="wrap"><div class="band"><div class="band-grid">
  <div class="stack-lg">
    <p class="eyebrow">Small downloads</p>
    <h2>A whole stage in a few megabytes.</h2>
    <p class="lead">Stage packs are compact vector maps, not heavy images, so they download quickly even on albergue Wi-Fi and barely touch your phone storage. Stage 1 of the Camino Francés, Saint-Jean-Pied-de-Port to Roncesvalles over the Pyrenees, is about 4.6 MB.</p>
  </div>
  <div class="stat-row">
    <div class="stat"><b>2–5 MB</b><span>per stage pack</span></div>
    <div class="stat"><b>4.6 MB</b><span>Saint-Jean → Roncesvalles</span></div>
    <div class="stat"><b>6–8 h</b><span>fully offline</span></div>
    <div class="stat"><b>&lt;80 MB</b><span>app install size</span></div>
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
  <p class="muted">Offline maps are made from OpenStreetMap, the free, community-built map of the world, which is especially detailed along the Camino. Map data © <a href="https://www.openstreetmap.org/copyright" rel="noopener">OpenStreetMap contributors</a>, available under the Open Database License.</p>
  <p class="muted">Offline downloads are part of <a href="/pricing">Pilgrim Plus</a> ($11.99 a year).</p>
</div></div></section>
{cta()}'''
    page("offline-maps", "Offline maps", "How CaminoPlus offline maps work: download each Camino stage (about 2–5 MB) and walk 6–8 hours without signal with GPS, stays and points of interest.", body, "offline-maps")

def faq():
    toc = "".join(f'<li><a href="#{k}">{t}</a></li>' for k, t, _ in FAQ)
    groups = ""
    for k, t, qs in FAQ:
        q = "".join(f'<details class="qa"><summary>{a}</summary><div class="ans">{b}</div></details>' for a, b in qs)
        groups += f'<section class="faq-group" id="{k}"><h2>{t}</h2>{q}</section>'
    import re
    ld = {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
        {"@type": "Question", "name": a, "acceptedAnswer": {"@type": "Answer", "text": re.sub("<[^>]+>", "", b).replace("&amp;", "&")}}
        for _, _, qs in FAQ for a, b in qs]}
    body = head("FAQ", "Questions, answered.",
        "Offline use, pricing, storage, privacy, smartwatches, routes and more. Can't find yours? <a href=\"/contact\">Ask us</a>.")
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
        "Questions, feedback, a listing to fix or a partnership idea. We read everything.")
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
    body = head("Privacy", "Privacy Policy", "Last updated 4 November 2026.", f'<div style="max-width:760px">{LEGAL_NOTE}</div>')
    body += '''<section class="section" style="padding-top:8px"><div class="wrap"><div class="prose">
<h2>Who we are</h2>
<p>CaminoPlus (“we”, “us”) makes the CaminoPlus app and this website. We are the controller of the personal data described here. Contact us at <a href="mailto:privacy@camino.plus">privacy@camino.plus</a>.</p>
<h2>What we collect</h2>
<ul>
<li><b>Account data:</b> your email address, name and profile photo, or the basic profile Google shares if you sign in with Google.</li>
<li><b>Content you create:</b> journal posts, photos, captions, comments, passport stamps and your stage plan.</li>
<li><b>Location:</b> your device location while you use the map, to show where you are and to record your route. You can turn location off at any time in your phone settings.</li>
<li><b>Health and fitness data:</b> only if you connect Apple Watch or Garmin, and only the data you allow, such as steps, distance and heart rate.</li>
<li><b>Purchase data:</b> your subscription status from the App Store or Google Play. We never see your card details.</li>
<li><b>Technical data:</b> device type, app version and crash reports, so we can fix problems.</li>
</ul>
<h2>How we use it</h2>
<ul>
<li>To run the app: your account, your journey, offline downloads and sync (contract).</li>
<li>To show your posts to the people you choose (contract, and your choices).</li>
<li>To process health data you connect (your explicit consent, which you can withdraw).</li>
<li>To keep the service secure, prevent abuse and fix bugs (legitimate interests).</li>
<li>To send service emails such as sign-in links and receipts, and launch news if you ask for it (contract or consent).</li>
</ul>
<p>We do not sell personal data and we do not use third-party advertising trackers in the app.</p>
<h2>Who processes data for us</h2>
<p>We use trusted service providers that act on our instructions under data processing agreements:</p>
<ul>
<li>Supabase: accounts, database and authentication</li>
<li>Cloudflare: file storage, map downloads and content delivery</li>
<li>Vercel: hosting of this website</li>
<li>RevenueCat: subscription status</li>
<li>Sentry: crash and error reports</li>
<li>Resend: transactional email</li>
<li>Apple and Google: app distribution, payments and sign-in</li>
</ul>
<p>Some of these providers may process data outside the European Economic Area. Where they do, we rely on safeguards such as the EU Standard Contractual Clauses.</p>
<h2>How long we keep it</h2>
<p>We keep your data while your account is active. When you delete your account we delete your data within 30 days, except records we must keep by law, such as billing records.</p>
<h2>Your rights</h2>
<p>Under the GDPR and similar laws you can access, correct, export or delete your data, object to or restrict some processing, and withdraw consent at any time. Most of this you can do in the app. For anything else, write to <a href="mailto:privacy@camino.plus">privacy@camino.plus</a>. You can also complain to your local data protection authority, in Spain the Agencia Española de Protección de Datos (AEPD).</p>
<h2>Children</h2>
<p>CaminoPlus is not intended for children under 16 without a parent or guardian's consent.</p>
<h2>This website</h2>
<p>This website does not use advertising cookies. If we add privacy-friendly analytics, we will list them here.</p>
<h2>Changes</h2>
<p>If we make important changes, we will tell you in the app or by email before they take effect.</p>
</div></div></section>'''
    page("privacy", "Privacy Policy", "How CaminoPlus collects, uses and protects your personal data, and your rights under the GDPR.", body, None)

def terms():
    body = head("Terms", "Terms of Service", "Last updated 4 November 2026.", f'<div style="max-width:760px">{LEGAL_NOTE}</div>')
    body += '''<section class="section" style="padding-top:8px"><div class="wrap"><div class="prose">
<h2>1. Agreement</h2>
<p>By creating an account or using CaminoPlus you agree to these Terms and to our <a href="/privacy">Privacy Policy</a>. If you do not agree, please do not use the app.</p>
<h2>2. Your account</h2>
<p>Keep your sign-in details safe and tell us if you think someone else is using your account. You are responsible for activity on your account.</p>
<h2>3. Subscriptions and payment</h2>
<ul>
<li>The basic app is free. Pilgrim Plus is a yearly subscription (currently US$11.99 a year) that includes offline route downloads and 5 GB of cloud storage. Extra storage is sold in blocks of 5 GB for US$5 a year.</li>
<li>Subscriptions are bought and managed through the App Store or Google Play and renew automatically each year until you cancel in your store account settings. Cancelling stops the next renewal; you keep access until the end of the paid period.</li>
<li>Refunds are handled by Apple or Google under their policies. Local consumer rights are not affected.</li>
<li>We may change prices for future periods. We will tell you in advance, and the store will ask for your consent where required.</li>
</ul>
<h2>4. Your content</h2>
<p>You own what you post. You give us a licence to store, process and display it only to run CaminoPlus and to show it to the audience you choose. You can delete it at any time.</p>
<h2>5. Community rules</h2>
<p>Be kind. Do not post anything illegal, hateful, harassing, sexually explicit, or that shares someone else's private information. Only upload photos you have the right to share, and respect people who do not want to be photographed. We may remove content or suspend accounts that break these rules.</p>
<h2>6. Safety on the trail</h2>
<p>CaminoPlus is a guide, not a guarantee. Paths, opening hours, prices, availability and conditions change, and information may be incomplete or out of date. Follow waymarks and local advice, check the weather, and use your own judgement. You are responsible for your own safety while walking.</p>
<h2>7. Third-party services</h2>
<p>Some stays or services may be booked with third parties. Those bookings are between you and that provider, under their terms. Listings that can be booked are labelled in the app.</p>
<h2>8. Map data</h2>
<p>Maps use data from OpenStreetMap. Map data © <a href="https://www.openstreetmap.org/copyright" rel="noopener">OpenStreetMap contributors</a>, available under the Open Database License (ODbL).</p>
<h2>9. Liability</h2>
<p>To the extent the law allows, CaminoPlus is provided “as is”, and we are not liable for indirect losses or for losses caused by relying on trail information. Nothing in these Terms limits liability that cannot be limited by law.</p>
<h2>10. Ending your use</h2>
<p>You can stop using CaminoPlus and delete your account at any time. We may suspend accounts that seriously or repeatedly break these Terms.</p>
<h2>11. Changes and contact</h2>
<p>We may update these Terms and will tell you about important changes in advance. Questions: <a href="mailto:hello@camino.plus">hello@camino.plus</a>.</p>
</div></div></section>'''
    page("terms", "Terms of Service", "The terms for using the CaminoPlus app and subscriptions.", body, None)

def notfound():
    body = head("404", "You've wandered off the Way.", "This page doesn't exist. Follow the yellow arrows back home.",
                '<p style="margin-top:32px"><a class="btn btn-primary" href="/">Back to home</a></p>')
    page("404", "Page not found", "This page does not exist.", body, None)

for f in (home, features, routes, pricing, offline, faq, about, contact, privacy, terms, notfound):
    f()
print("ok")
