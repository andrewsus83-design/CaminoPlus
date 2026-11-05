#!/usr/bin/env python3
"""Export the Camino+ brand as standalone SVG files into brand/svg/.

Everything is vector and font-free: the "Camino+" wordmark is converted to
outlines (Fraunces Bold 28pt for "Camino", Inter Bold for "+"), so the files
open the same in Figma, Illustrator, Canva or a browser without any fonts.

Sources of truth:
  - logo mark: web/favicon.svg (locked in PR #9)
  - logo layout: .brand / .brand-mark / .brand .plus in web/assets/site.css
  - UI icons: the <symbol id="i-..."> sprite in design/index.html

Usage:
  pip install fonttools
  python3 tools/build_brand_svg.py            # downloads the fonts from Google Fonts
  python3 tools/build_brand_svg.py --fonts DIR  # or use Fraunces-Bold-28pt.ttf + Inter-Bold.ttf in DIR
"""
import argparse
import os
import re
import shutil
import tempfile
import urllib.request

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "brand", "svg")

# Brand palette (design/tokens.css)
NAVY = "#14365D"       # Atlantic Blue
NAVY_DEEP = "#0C2340"  # ink-strong, headlines
GOLD = "#D9A21B"       # Shell Gold
PARCHMENT = "#F6EFE2"
BLACK = "#000000"
WHITE = "#FFFFFF"

# Shell geometry from web/favicon.svg (40x40 box, shell group shifted up 2.12)
SHELL_BODY = ("M20 28.5L5.84 22.20A2.84 2.84 0 0 1 8.64 17.96A2.84 2.84 0 0 1 12.66 14.85"
              "A2.84 2.84 0 0 1 17.46 13.21A2.84 2.84 0 0 1 22.54 13.21A2.84 2.84 0 0 1 27.34 14.85"
              "A2.84 2.84 0 0 1 31.36 17.96A2.84 2.84 0 0 1 34.16 22.20z")
SHELL_RIBS = ("M20 29.0Q14.09 22.35 8.49 17.82M20 29.0Q16.22 20.86 12.56 14.67M20 29.0Q18.70 20.07 17.43 13.01"
              "M20 29.0Q21.30 20.07 22.57 13.01M20 29.0Q23.78 20.86 27.44 14.67M20 29.0Q25.91 22.35 31.51 17.82")
SHELL_HINGE = "M15.2 31.4Q18 30.6 18.4 28.3H21.6Q22 30.6 24.8 31.4Q24.6 32.6 20 32.6Q15.4 32.6 15.2 31.4z"
SHELL_SHIFT = "translate(0 -2.12)"

FONT_URLS = {
    "Fraunces-Bold-28pt.ttf": "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@30,700",
    "Inter-Bold.ttf": "https://fonts.googleapis.com/css2?family=Inter:wght@700",
}


def fetch_fonts(dest):
    for name, css_url in FONT_URLS.items():
        path = os.path.join(dest, name)
        if os.path.exists(path):
            continue
        # An old user agent makes Google Fonts serve plain TTF.
        req = urllib.request.Request(css_url, headers={"User-Agent": "Mozilla/4.0"})
        css = urllib.request.urlopen(req).read().decode()
        ttf = re.search(r"url\((https://[^)]+\.ttf)\)", css).group(1)
        with urllib.request.urlopen(ttf) as r, open(path, "wb") as f:
            shutil.copyfileobj(r, f)


def svg(view_w, view_h, body, title):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {fmt(view_w)} {fmt(view_h)}" '
            f'width="{fmt(view_w)}" height="{fmt(view_h)}" role="img" aria-label="{title}">\n'
            f'<title>{title}</title>\n{body}\n</svg>\n')


def fmt(v):
    return f"{v:.2f}".rstrip("0").rstrip(".")


def mark_body(circle, shell, ribs, x=0.0, y=0.0, scale=1.0, mono=None):
    """The shell-in-circle mark in its 40x40 box. mono=color draws a one-colour
    shell (ribs cut out) with no circle."""
    t = f' transform="translate({fmt(x)} {fmt(y)}) scale({fmt(scale)})"' if (x or y or scale != 1) else ""
    if mono:
        mid = "ribs-cutout"
        return (f'<g{t}><defs><mask id="{mid}" maskUnits="userSpaceOnUse" x="0" y="0" width="40" height="40">'
                f'<rect width="40" height="40" fill="#fff"/><g transform="{SHELL_SHIFT}">'
                f'<path d="{SHELL_RIBS}" stroke="#000" stroke-width="1.15" stroke-linecap="round" fill="none"/></g></mask></defs>'
                f'<g transform="{SHELL_SHIFT}" fill="{mono}" mask="url(#{mid})"><path d="{SHELL_BODY}"/><path d="{SHELL_HINGE}"/></g></g>')
    c = f'<circle cx="20" cy="20" r="20" fill="{circle}"/>' if circle else ""
    return (f'<g{t}>{c}<g transform="{SHELL_SHIFT}"><path d="{SHELL_BODY}" fill="{shell}"/>'
            f'<path d="{SHELL_RIBS}" stroke="{ribs}" stroke-width="1.15" stroke-linecap="round" fill="none"/>'
            f'<path d="{SHELL_HINGE}" fill="{shell}"/></g></g>')


def mark_knockout(color, x=0.0, y=0.0, scale=1.0, mid="shell-knockout"):
    """One-colour circular mark: a solid circle with the shell cut out (ribs stay)."""
    t = f' transform="translate({fmt(x)} {fmt(y)}) scale({fmt(scale)})"'
    return (f'<g{t}><defs><mask id="{mid}" maskUnits="userSpaceOnUse" x="0" y="0" width="40" height="40">'
            f'<rect width="40" height="40" fill="#fff"/><g transform="{SHELL_SHIFT}">'
            f'<path d="{SHELL_BODY}" fill="#000"/><path d="{SHELL_HINGE}" fill="#000"/>'
            f'<path d="{SHELL_RIBS}" stroke="#fff" stroke-width="1.15" stroke-linecap="round" fill="none"/></g></mask></defs>'
            f'<circle cx="20" cy="20" r="20" fill="{color}" mask="url(#{mid})"/></g>')


class Wordmark:
    """'Camino' + '+' as outlines, laid out like the website header:
    font-size 30px, letter-spacing -0.02em, '+' at 1.12em, 1px margin,
    raised 0.12em, with a 0.9px outline stroke to make it bolder."""

    SIZE = 30.0

    def __init__(self, font_dir):
        self.title = TTFont(os.path.join(font_dir, "Fraunces-Bold-28pt.ttf"))
        self.plus = TTFont(os.path.join(font_dir, "Inter-Bold.ttf"))

    @staticmethod
    def _run(font, text, size, x0, baseline, tracking=0.0):
        gs = font.getGlyphSet()
        cmap = font.getBestCmap()
        upm = font["head"].unitsPerEm
        s = size / upm
        pen = SVGPathPen(gs)
        x = x0
        for ch in text:
            g = cmap[ord(ch)]
            tp = TransformPen(pen, (s, 0, 0, -s, x, baseline))
            gs[g].draw(tp)
            x += gs[g].width * s + tracking
        return pen.getCommands(), x

    @staticmethod
    def _bbox(font, ch, size):
        from fontTools.pens.boundsPen import BoundsPen
        gs = font.getGlyphSet()
        bp = BoundsPen(gs)
        gs[font.getBestCmap()[ord(ch)]].draw(bp)
        s = size / font["head"].unitsPerEm
        return [v * s for v in bp.bounds]

    def build(self, x0, baseline):
        """Returns (camino_path, plus_path, right_edge, top, bottom) in px."""
        size = self.SIZE
        camino, x = self._run(self.title, "Camino", size, x0, baseline, tracking=-0.02 * size)
        # undo the trailing letter-spacing after the last letter, then 1px margin
        x += 0.02 * size + 1
        psize = size * 1.12
        plus, x_end = self._run(self.plus, "+", psize, x, baseline - 0.12 * psize)
        c_top = self._bbox(self.title, "C", size)[3]
        b = self._bbox(self.plus, "+", psize)
        plus_right = x + b[2] + 0.45
        top = min(baseline - c_top, baseline - 0.12 * psize - b[3] - 0.45)
        return camino, plus, plus_right, top, baseline - self._bbox(self.title, "C", size)[1]

    def cap_height(self):
        b = self._bbox(self.title, "C", self.SIZE)
        return b[3] - b[1]


def write(rel, content):
    path = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(content)


def build_logos(wm):
    pad = 4.0
    # Same proportions as the header: 42px mark, 10px gap, 30px type.
    mark = 42.0
    gap = 10.0
    cap = wm.cap_height()
    baseline = pad + mark / 2 + cap / 2  # cap height centred on the mark
    camino, plus, right, _, _ = wm.build(pad + mark + gap, baseline)
    w = right + pad
    h = mark + 2 * pad

    # name: (circle, shell, ribs, text, plus, note)
    variants = {
        "light": (NAVY, GOLD, NAVY, NAVY_DEEP, GOLD, "for light / parchment backgrounds"),
        "dark": (NAVY, GOLD, NAVY, PARCHMENT, GOLD, "for dark navy backgrounds (website footer)"),
        "gold": (GOLD, NAVY, GOLD, GOLD, GOLD, "all gold, for navy or photo backgrounds"),
        "navy": (NAVY, PARCHMENT, NAVY, NAVY, NAVY, "one colour navy"),
        "black": (BLACK, WHITE, BLACK, BLACK, BLACK, "one colour black (print, fax, engraving)"),
        "white": (WHITE, BLACK, WHITE, WHITE, WHITE, "one colour white on dark photos"),
    }
    for name, (circle, shell, ribs, text, plus_c, _note) in variants.items():
        if name in ("navy", "black", "white"):
            m = mark_knockout(text, pad, pad, mark / 40)
        else:
            m = mark_body(circle, shell, ribs, pad, pad, mark / 40)
        body = (f'{m}\n<path d="{camino}" fill="{text}"/>\n'
                f'<path d="{plus}" fill="{plus_c}" stroke="{plus_c}" stroke-width="0.9" stroke-linejoin="round"/>')
        write(f"logo/camino-plus-logo-{name}.svg", svg(w, h, body, "Camino+"))

    # Wordmark only
    _, _, _, top, bottom = wm.build(0, 0)
    camino, plus, right, top, bottom = wm.build(pad, pad - top)
    ww = right + pad
    wh = (bottom - top) + 2 * pad
    for name, (_c, _s, _r, text, plus_c, _n) in variants.items():
        body = (f'<path d="{camino}" fill="{text}"/>\n'
                f'<path d="{plus}" fill="{plus_c}" stroke="{plus_c}" stroke-width="0.9" stroke-linejoin="round"/>')
        write(f"wordmark/camino-plus-wordmark-{name}.svg", svg(ww, wh, body, "Camino+"))

    # Stacked logo (mark above wordmark), for splash screens and square spots
    smark, k, gap_s, p3 = 96.0, 1.6, 16.0, pad * 3
    camino, plus, right, top, bottom = wm.build(0, 0)
    tw, th = right * k, (bottom - top) * k
    sw = max(smark, tw) + 2 * p3
    sh = p3 + smark + gap_s + th + p3
    tx, ty = (sw - tw) / 2, p3 + smark + gap_s - top * k
    for name in ("light", "dark", "gold"):
        circle, shell, ribs, text, plus_c, _n = variants[name]
        m = mark_body(circle, shell, ribs, (sw - smark) / 2, p3, smark / 40)
        body = (f'{m}\n<g transform="translate({fmt(tx)} {fmt(ty)}) scale({k})">'
                f'<path d="{camino}" fill="{text}"/>'
                f'<path d="{plus}" fill="{plus_c}" stroke="{plus_c}" stroke-width="0.9" stroke-linejoin="round"/></g>')
        write(f"logo/camino-plus-logo-stacked-{name}.svg", svg(sw, sh, body, "Camino+"))
    return variants


def build_marks():
    marks = {
        "navy": (NAVY, GOLD, NAVY),          # primary, = favicon
        "gold": (GOLD, NAVY, GOLD),
        "parchment": (PARCHMENT, GOLD, NAVY),
        "white": (WHITE, GOLD, NAVY),
    }
    for name, (c, s, r) in marks.items():
        write(f"mark/camino-plus-mark-{name}.svg", svg(40, 40, mark_body(c, s, r), "Camino+ mark"))
    for name, col in (("mono-navy", NAVY), ("mono-black", BLACK), ("mono-white", WHITE)):
        write(f"mark/camino-plus-mark-{name}.svg", svg(40, 40, mark_knockout(col), "Camino+ mark"))
    # Shell only (no circle), one colour, ribs cut out
    for name, col in (("shell-gold", GOLD), ("shell-navy", NAVY), ("shell-black", BLACK), ("shell-white", WHITE)):
        write(f"mark/camino-plus-{name}.svg", svg(40, 40, mark_body(None, None, None, mono=col), "Camino+ shell"))


def build_app_icons():
    S = 1024
    # iOS / store icon: full-bleed navy square (iOS rounds the corners itself).
    shell = f'<g transform="translate(112 112) scale(20)"><g transform="{SHELL_SHIFT}">' \
            f'<path d="{SHELL_BODY}" fill="{GOLD}"/><path d="{SHELL_RIBS}" stroke="{NAVY}" stroke-width="1.15" ' \
            f'stroke-linecap="round" fill="none"/><path d="{SHELL_HINGE}" fill="{GOLD}"/></g></g>'
    write("app-icon/app-icon-ios-1024.svg",
          svg(S, S, f'<rect width="{S}" height="{S}" fill="{NAVY}"/>\n{shell}', "Camino+ app icon"))
    # Rounded preview (for decks, website, store mockups)
    write("app-icon/app-icon-rounded-1024.svg",
          svg(S, S, f'<rect width="{S}" height="{S}" rx="228" fill="{NAVY}"/>\n{shell}', "Camino+ app icon"))
    # Android adaptive: foreground keeps the shell inside the 66% safe zone.
    fg = f'<g transform="translate(232 232) scale(14)"><g transform="{SHELL_SHIFT}">' \
         f'<path d="{SHELL_BODY}" fill="{GOLD}"/><path d="{SHELL_RIBS}" stroke="{NAVY}" stroke-width="1.15" ' \
         f'stroke-linecap="round" fill="none"/><path d="{SHELL_HINGE}" fill="{GOLD}"/></g></g>'
    write("app-icon/android-adaptive-foreground.svg", svg(S, S, fg, "Camino+ adaptive foreground"))
    write("app-icon/android-adaptive-background.svg",
          svg(S, S, f'<rect width="{S}" height="{S}" fill="{NAVY}"/>', "Camino+ adaptive background"))
    mono = mark_body(None, None, None, 232, 232, 14, mono=BLACK)
    write("app-icon/android-adaptive-monochrome.svg", svg(S, S, mono, "Camino+ monochrome icon"))
    # Splash: shell on parchment
    write("app-icon/splash-icon.svg", svg(S, S, mark_body(NAVY, GOLD, NAVY, 312, 312, 10), "Camino+ splash"))


def build_icons():
    html = open(os.path.join(ROOT, "design", "index.html"), encoding="utf-8").read()
    sym = re.findall(r'<symbol id="i-([\w-]+)" viewBox="([^"]+)">(.*?)</symbol>', html, re.S)
    names = []
    for name, vb, inner in sym:
        body = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="24" height="24" fill="none" '
                f'stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">'
                f'{inner.strip()}</svg>\n')
        write(f"icons/{name}.svg", body)
        names.append(name)
    # Store badges' glyphs used on the website (filled, own colours)
    web = open(os.path.join(ROOT, "web", "index.html"), encoding="utf-8").read()
    apple = re.search(r'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">(<path d="M16\.4[^"]+"/>)</svg>', web)
    gplay = re.search(r'<svg viewBox="0 0 24 24" aria-hidden="true">((?:<path[^>]+/>){4})</svg>', web)
    if apple:
        write("icons/store/apple.svg", f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">{apple.group(1)}</svg>\n')
    if gplay:
        write("icons/store/google-play.svg", f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">{gplay.group(1)}</svg>\n')
    return names


def build_preview(icon_names):
    files = []
    for d in ("logo", "wordmark", "mark", "app-icon"):
        for f in sorted(os.listdir(os.path.join(OUT, d))):
            files.append(f"{d}/{f}")
    dark = ("dark", "gold", "white", "parchment", "shell-white")
    cells = []
    for f in files:
        bg = NAVY_DEEP if any(k in f for k in dark) else PARCHMENT
        cells.append(f'<figure style="background:{bg}"><img src="{f}" alt=""><figcaption>{f}</figcaption></figure>')
    icons = "".join(f'<figure class="i"><img src="icons/{n}.svg" alt=""><figcaption>{n}</figcaption></figure>'
                    for n in icon_names)
    page = f"""<!doctype html><html lang="en"><meta charset="utf-8"><title>Camino+ SVG pack</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{{font:14px Inter,system-ui,sans-serif;background:#fff;color:{NAVY_DEEP};margin:32px}}
h2{{margin:32px 0 12px}}.g{{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}}
figure{{margin:0;border-radius:16px;padding:20px;display:flex;flex-direction:column;align-items:center;gap:10px;border:1px solid #e6dcc8}}
figure img{{max-width:100%;height:80px}}figcaption{{font:11px ui-monospace,monospace;color:#556274;background:#fff;padding:2px 6px;border-radius:6px}}
.gi{{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px}}
.i{{background:{PARCHMENT};padding:12px}}.i img{{height:28px}}</style>
<h1>Camino+ SVG pack</h1><h2>Logo, wordmark, mark, app icon</h2><div class="g">{''.join(cells)}</div>
<h2>UI icons ({len(icon_names)})</h2><div class="gi">{icons}</div></html>
"""
    with open(os.path.join(OUT, "preview.html"), "w") as f:
        f.write(page)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fonts", help="folder with Fraunces-Bold-28pt.ttf and Inter-Bold.ttf")
    a = ap.parse_args()
    font_dir = a.fonts or tempfile.mkdtemp()
    fetch_fonts(font_dir)
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    wm = Wordmark(font_dir)
    build_logos(wm)
    build_marks()
    build_app_icons()
    names = build_icons()
    build_preview(names)
    print(f"wrote {sum(len(f) for _, _, f in os.walk(OUT))} files to {OUT}")


if __name__ == "__main__":
    main()
