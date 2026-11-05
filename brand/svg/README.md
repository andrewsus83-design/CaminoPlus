# Camino+ SVG pack

All files are pure vector. The "Camino+" text is converted to outlines, so no fonts are needed.
Open `preview.html` in a browser to see everything at once.

| Folder | What | Use |
|---|---|---|
| `logo/` | Shell mark + "Camino+" (horizontal and stacked) | `light` on light/parchment, `dark` on navy, `gold` all gold, `navy` / `black` / `white` one colour |
| `wordmark/` | "Camino+" text only, outlined | same colour names as `logo/` |
| `mark/` | Shell in circle (`navy` is primary = favicon), `mono-*` one colour, `shell-*` shell without circle | avatars, favicons, stamps, watermark |
| `app-icon/` | iOS 1024 (square, iOS rounds it), rounded preview, Android adaptive foreground/background/monochrome, splash | app stores, Expo `app.json` |
| `icons/` | 75 UI icons from the design system (24x24, stroke 1.75, `currentColor`), `store/` Apple + Google Play glyphs | app and website |

Colours: Atlantic Blue `#14365D`, ink `#0C2340`, Shell Gold `#D9A21B`, Parchment `#F6EFE2`.
Fonts used for the outlines: Fraunces Bold (28pt optical size) for "Camino", Inter Bold for "+".

Regenerate: `pip install fonttools && python3 tools/build_brand_svg.py`
