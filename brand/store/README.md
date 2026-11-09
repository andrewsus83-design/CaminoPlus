# Store files

Files for the app stores that are not part of the app. The icons inside the app are in `mobile/assets/`.

| File | What it is | Where it goes |
|---|---|---|
| `play-store-icon-512.png` | The store icon of Google Play: 512 x 512, 32-bit PNG with alpha, a full square without rounded corners (Google Play puts its own mask on it) | Play Console > Store listing > App icon |
| `exported-icons.json` | The SHA-256 of every exported PNG and of the SVG it was made from, and of the script that made it | Read by `tools/tests/test_store_assets.py`, not by a person |

Both are made by `node tools/export_app_icons.mjs` from the brand SVG files in [brand/svg/app-icon](../svg/README.md). The same run writes the iOS icon, the Android icon layers and the launch mark into `mobile/assets/`. How to run it, and why each file has the size and colour type it has: the header of [tools/export_app_icons.mjs](../../tools/export_app_icons.mjs).

Never edit one of these PNG files by hand. Change the SVG, run the script, commit the result. The test fails when a PNG or an SVG does not match what the script wrote.

The iOS icon of the App Store listing is `mobile/assets/icon.png` (1024 x 1024, no alpha): Xcode puts it in the build, so there is nothing more to upload for it.
