# Camino+ SVG pack

All files are pure vector. The "Camino+" text is converted to outlines, so no fonts are needed.
Open `preview.html` in a browser to see everything at once.

| Folder | What | Use |
|---|---|---|
| `logo/` | Shell mark + "Camino+" (horizontal and stacked) | `light` on light/parchment, `dark` on navy, `gold` all gold, `navy` / `black` / `white` one colour |
| `wordmark/` | "Camino+" text only, outlined | same colour names as `logo/` |
| `mark/` | Shell in circle (`navy` is primary = favicon), `mono-*` one colour, `shell-*` shell without circle | avatars, favicons, stamps, watermark |
| `app-icon/` | iOS 1024 (square, iOS rounds it), rounded preview, Android adaptive foreground/background/monochrome, splash | app stores, Expo `app.json` |
| `icons/` | 77 UI icons from the design system (24x24, stroke 1.75, `currentColor`) | app and website |

The app icons need PNG files, which this pack does not make: `node tools/export_app_icons.mjs` turns `app-icon/` into `mobile/assets/*.png` and the Play Store icon (see [brand/store](../store/README.md)).

Colours: Atlantic Blue `#14365D`, ink `#0C2340`, Shell Gold `#D9A21B`, Parchment `#F6EFE2`.
Fonts used for the outlines: Fraunces Bold (28pt optical size) for "Camino", Inter Bold for "+".

Regenerate everything: `pip install fonttools && python3 tools/build_brand_svg.py` (downloads Fraunces and Inter once;
`--fonts DIR` uses local copies). After a design change that only adds or edits UI icons,
`python3 tools/build_brand_svg.py --icons-only` rebuilds `icons/` and `preview.html` without fonts or network.
`--out DIR` writes elsewhere. The script replaces only the folders listed above and `preview.html`; this README is never touched.

There is no Apple or Google badge in this pack on purpose: their logos and "Download on" badges have their own usage rules.
Add the official badges from Apple's and Google's marketing pages at launch.
