# Offline map packs (prototype)

One small vector-tile file per Camino stage that the app downloads before walking,
so the map works for 6 to 8 hours with no signal. This folder builds, tests and
publishes that file. The first stage done end to end is **Camino Francés stage 1,
Saint-Jean-Pied-de-Port to Roncesvalles**.

The app already reads these packs (`mobile/src/features/map`, see "The app side" below). This
folder is the producer: it builds, tests and publishes the files, and registers them in the
`offline_packs` table through one database function.

```
OSM extracts ──► osmium (merge + cut) ──► route from OSM ──► corridor (buffer)
 (Geofabrik)                                              │
                                                          ▼
          Planetiler, OpenMapTiles schema, --polygon corridor, z0 to z15
                                                          │
                                                          ▼
               stage.pmtiles + manifest ──► Storage (private) + offline_packs row
                                                          │
 app ── POST offline-pack-url {pack_id} ──► entitlement check ──► presigned URL (15 min)
```

## Measured sizes

<!-- SIZES -->
Real build, GitHub Actions run 41858545167 (2026-11-04), OSM data of 2026-11-03,
route taken from the OSM Camino relations (Napoleon + Valcarlos variants):

| Corridor each side | Max zoom 14 | Max zoom 15 |
|---|---|---|
| 2 km | 2.58 MB | 4.54 MB |
| **3 km (default)** | 2.60 MB | **4.59 MB** |
| 5 km | 2.64 MB | 4.67 MB |

- The default pack (3 km, z15) has 1,536 tiles and is inside the 2 to 5 MB target.
- Width barely matters: the mountains outside the villages hold little data. Zoom 15
  roughly doubles the size, mainly from buildings, paths and POIs in Saint-Jean.
- If we need it smaller, z14 + overzoom still looks fine for walking (2.6 MB).
- Render test on the same run: map drew with every outside request blocked (0 tried
  to leave) and again with the browser offline, e.g. 570 POIs and 322 road/path
  features at z15 in Saint-Jean, 12 mountain peaks around Orisson at z13.
<!-- /SIZES -->

## Why we build our own tiles (and not MapTiler for offline)

Online maps can use MapTiler Cloud styles, but MapTiler's Cloud terms
(https://www.maptiler.com/terms/cloud/, checked 2026-11-04) do not allow
building an offline pack from their tiles:

- 6.3 Bulk Downloading: "it is prohibited to batch or excessive bulk download of
  map tiles". The only exception is the Geocoding API.
- 6.2 Export Usage: "prohibited to export map content for usage outside the Service".
- 7.2 Server-side Proxy & Caching: no storing or redistributing map content from a
  server-side cache.
- 5.7 End-user Device Caching *is* allowed, but only as "a temporary personal
  cache ... for use by a single end-user". A pre-downloaded stage pack is not that.
- MapTiler's own self-hosting product (Server & Data, https://www.maptiler.com/terms/server-data/)
  caps standard licences at 100 to 500 MAU and forbids hosting on a public cloud, so it
  does not fit either without a custom deal.

So offline packs are built from OpenStreetMap (ODbL) with Planetiler, which is free
and open source. Recommendation: ask MapTiler sales in writing only if we want their
exact style offline; otherwise keep the online style visually close to our own
offline style (same palette, same layers) so switching is not jarring.

## What is in here

| Path | What it does |
|---|---|
| `stages/camino-frances-01.json` | Stage config: ids from the `stages`/`routes` tables, OSM extracts, search bbox, corridor width, max zoom, and the **quality band** and **render checks** every build must meet |
| `stages/camino-frances-01.route.geojson` | Hand-placed fallback route (Napoleon + Valcarlos). Measurement builds may use it; a build that gets published may not |
| `scripts/build_stage.sh` | Whole build: download (checksummed), cut, route, corridor, Planetiler (image pinned by digest), manifest |
| `scripts/route_from_osm.py` | Takes the real route from OSM hiking relations (Camino de Santiago / GR 65) |
| `scripts/corridor.py` | Buffers the route (default 3 km each side) into the `.poly` Planetiler uses |
| `scripts/pmtiles_info.py` | Reads tile count, zoom range and layer names from the PMTiles header (stdlib only) for the manifest |
| `scripts/check_pack.mjs` + `scripts/lib/quality.mjs` | Quality gates: size, tile count, layers, route source, OSM age, change against the previous pack |
| `scripts/publish_pack.mjs` | Gates, upload, read-back check, then ONE call to `register_offline_pack` (or R2 with `--target r2`) |
| `scripts/planetiler_image.sh` | Prints the pinned Planetiler image reference |
| `viewer/` | MapLibre GL JS page that opens a `.pmtiles` with no network; CaminoPlus palette |
| `test/render_offline.mjs` | Playwright test: renders with all outside requests blocked, then with the device offline; checks feature counts, labels and console errors |
| `test/*.test.mjs`, `test/test_pmtiles_info.py` | Unit tests: quality gates, publish against a mock Supabase, dev server, PMTiles header |
| `test/fixtures/` | A tiny made-up pack (`mini.pmtiles`, 8 KB) + its stage file, so the render test runs in seconds without Planetiler |
| `../../supabase/functions/offline-pack-url/` | Edge function: signed download link only for Pilgrim Plus subscribers |
| `../../supabase/migrations/20261104170000_offline_packs_bucket.sql` | Private Storage bucket `offline-packs` |
| `../../.github/workflows/offline-maps.yml` + `../../.github/actions/build-offline-pack/` | Builds + measures on PRs; rebuilds monthly and publishes (after approval) |

## Run it locally

```bash
cd tools/offline-maps
pip install -r requirements.txt          # osmium, shapely, pyproj, numpy (pinned lock of requirements.in)
sudo apt install osmium-tool             # or: brew install osmium-tool
npm ci && npm run setup                  # MapLibre, pmtiles, glyphs into viewer/ (glyphs are pinned and hash-checked)
scripts/build_stage.sh stages/camino-frances-01.json          # needs Docker
#   or with a local jar (Java 25+): PLANETILER="java -jar planetiler.jar" scripts/build_stage.sh ...
npm run check-pack -- dist/camino-frances-01-3km-z15.json     # quality gates (add --publishing for the strict ones)
npm run viewer                            # http://localhost:8787/viewer/  then "Open a .pmtiles file"
node test/render_offline.mjs dist/camino-frances-01-3km-z15.pmtiles --stage stages/camino-frances-01.json
npm test && npm run test:python           # unit tests
npm run test:render-fixture               # render test on the committed fixture pack (needs: npx playwright install chromium)
```

First run downloads ~1 GB of Planetiler sources (ocean polygons, Natural Earth) into
`data/sources`, plus the two Geofabrik extracts (Aquitaine and Navarra). The files that never change upstream are
checked against a pinned SHA-256 (Natural Earth, lake centerlines, Planetiler's placeholder water file); the ocean polygons are
rebuilt upstream every day, so they cannot be pinned and are only checked to be a complete zip. The Planetiler image is pinned by
digest (`scripts/planetiler_image.sh`). Set `ROUTE_FALLBACK=deny` to make the build fail instead of using the hand-placed route.

Flags: `scripts/build_stage.sh <stage.json> [buffer_km] [maxzoom]`.

### Corridor and zoom

- The corridor is a buffer around **every** OSM route variant in the area, so both the
  Napoleon route and the Valcarlos winter route are covered.
- Planetiler's `--polygon` keeps every tile that touches the corridor, so the real
  covered area is a bit wider than the buffer.
- `z15` is the most detail the OpenMapTiles schema has. MapLibre overzooms beyond it
  (we allow zoom 18 in the viewer) and vector tiles stay sharp, so there is no need
  to ship z16+.
- At low zooms (z0 to z9) the pack holds the few tiles that touch the corridor, so the
  "helicopter view" shows context, but the whole-route overview should come from a
  separate tiny low-zoom pack (z0 to z10 for the whole Camino, likely 2 to 4 MB). That is the
  next step after this prototype.

## Quality gates

A pack is only published if all of these hold (`stages/<slug>.json`, key `quality`; code in
`scripts/lib/quality.mjs`, tests in `test/quality.test.mjs`). A failure stops the run with a plain message and
nothing is uploaded or registered:

| Gate | Where it runs |
|---|---|
| size in MB and addressed tiles inside the band (stage 1: 2 to 9 MB, 900 to 2,600 tiles; measured 4.6 MB, 1,536 tiles) | every default build (PR and publish) |
| required vector layers present (building, place, poi, transportation, transportation_name) | every default build |
| render test: with outside requests blocked and with the device offline, each view in `render_checks` has at least the stated number of features per source layer (`min_features`) and of drawn labels per style layer (`min_labels`), **and the console, page and map error lists are empty** | every default build |
| `route_source` is `osm` (the hand-drawn fallback is never published) | publish only |
| the OSM extract is at most 45 days old | publish only |
| size and tile count within 1.5x of the pack that is live now (read from `offline_packs`) | publish only |
| the uploaded object is read back and its SHA-256 matches | publish only |

If a real build logs a console message that is known to be harmless, list its text as a regex in `render_allow_errors` of the
stage file (empty today; add one only after a real run shows the need).

The numbers in `quality` and `render_checks` come from the 2026-11-04 measurement (see "Measured sizes");
the first monthly run on the real pack confirms them. After a Planetiler upgrade re-measure and edit the stage
file in the same pull request. A stage without a `quality` band cannot be published.

## Publishing (Supabase Storage now, Cloudflare R2 later)

Decision 2026-11-04: packs live in **Supabase Storage** for now and move to Cloudflare R2
later. `offline_packs.url` says where each file is, so the move needs no app change:

| url | Storage |
|---|---|
| `supabase://offline-packs/<key>` | private Supabase Storage bucket `offline-packs` (now) |
| `r2://<bucket>/<key>` | private Cloudflare R2 bucket (later) |

`publish_pack.mjs [--target supabase|r2]` (and the monthly workflow) do:

1. Check the file against its manifest (size + sha256) and run the quality gates above.
2. Compare with the live pack (size), still before anything is uploaded.
3. Upload to `<route_slug>/stage-<NN>/tiles-v<YYYYMMDD>.pmtiles`.
   Version = date of the OSM data, so each monthly build gets a new immutable key
   (`Cache-Control: immutable`). Old versions can be deleted after 60 days, once no app
   still points at them. Read the object back and compare its SHA-256.
4. Register it with **one call**: `POST /rest/v1/rpc/register_offline_pack` (service role only) =
   `public.register_offline_pack(route, stage, 'tiles', 'pmtiles', version, url, size_bytes, sha256)`. The function runs in one
   transaction: the new row becomes the current one and every other current row of that stage is retired, and a
   partial unique index allows only one current pack per (route, stage, kind). The old script retired the old rows first and
   inserted the new one second, so a failure or a cancelled run in between left the stage with no current pack.
5. Always writes `<pack>.offline_packs.sql`: a single `select public.register_offline_pack(...)` that can be run by hand
   (SQL editor, as postgres) when the API keys are not set.

**Moving to R2 later:** create the bucket and tokens, set the R2 secrets (GitHub + Supabase),
set the repo variable `PACK_TARGET=r2`, run the workflow once. New rows point at `r2://`;
the edge function signs both kinds, so old rows keep working until they are retired.

### Artifacts: never the packs

This repository is public, so a GitHub Actions artifact can be downloaded by anyone with a GitHub account, and a
`.pmtiles` pack in an artifact would bypass the Pilgrim Plus paywall. The workflows therefore upload **JSON only**
(manifest, measurements, render report) with `retention-days: 3`. Do not add `dist/*.pmtiles` to any
`upload-artifact` step, and delete old runs' artifacts if one ever slipped through (Actions, the run, "Delete").

## Download links only for subscribers

`supabase/functions/offline-pack-url` (Deno):

- Requires a signed-in user (JWT). Runs queries **as that user**.
- Gate 1: `rpc('get_my_entitlements').can_download_routes` (which is `private.has_plus`).
  Free users get `403 {"error":"subscription_required"}`, so the app can show the upgrade screen.
- Gate 2: reads the pack row through RLS (`offline packs need CaminoPlus`), so even a bug
  in gate 1 cannot leak a URL.
- Returns a signed `GET` (Supabase Storage signed URL, or SigV4 presign for `r2://`), valid 15 minutes
  (`PACK_URL_TTL_SECONDS`, 60 to 3600), plus `size_bytes` and `sha256`. A download that
  starts in time finishes; a resume after expiry asks for a new link.
- `503 storage_not_configured` if a pack is on R2 but the R2 secrets are not set.
- Tested against a mock Supabase: `deno test --allow-net --allow-env --allow-run --allow-read supabase/functions/offline-pack-url/index.test.ts`.

The bucket is never public and never has a custom domain for packs, so a link cannot be
reused after it expires. Free users still see pack sizes through `rpc('offline_pack_catalog')`.

## The app side (`mobile/src/features/map`, details in `mobile/docs/MAPS.md`)

- **Catalog and download**: `rpc offline_pack_catalog` lists sizes and versions (free users see them too), then
  `functions/v1/offline-pack-url` returns the signed link (Pilgrim Plus only, see below). The download goes to
  `<documents>/offline-packs/<stage_id>/`, is checked against `size_bytes` and `sha256`, moved into place, and the previous
  version is deleted (`packs/api.ts`, `packs/store.ts`). "Update available" appears when a newer `version` is current.
- **Rendering**: MapLibre Native (`@maplibre/maplibre-react-native`) reads the file as a vector source,
  `pmtiles://file:///.../stage-01.pmtiles`. Whether both platforms accept that still has to be confirmed on devices
  (checklist in `mobile/docs/MAPS.md`); the fallback is MBTiles (`pmtiles convert`), which `offline_packs.format` already allows.
- **Style**: `src/features/map/style.ts` draws the same OpenMapTiles layers as `viewer/style.js`. Online it uses MapTiler
  or OpenFreeMap tiles in the same schema; offline, our packs. MapTiler tiles are never put in a pack.
- **Fonts (glyphs)**: Noto Sans Regular, Medium and Italic, ranges `0-255`, `256-511`, `8192-8447` (Latin + accents for French,
  Spanish, Basque, Galician, plus typographic punctuation), bundled in the app (`mobile/assets/glyphs`, byte for byte the files
  `npm run setup` fetches, pinned by commit and SHA-256). Every other range is an empty file, so MapLibre does not log an error
  for characters we do not ship; the viewer server and the render test do the same.
- **Not built yet**: sprites (POIs are circles), elevation (OpenMapTiles has no contour lines or hillshade; stage 1 climbs 1,390 m,
  so a later pack should add contours, for example from Copernicus DEM, 20 m interval), and any non-map offline data
  (stay details, audio stories). There are no data or audio packs yet, only map tile packs.

## Attribution (required by ODbL)

Show on the map, always visible or one tap away (MapLibre's compact attribution "i" is fine):

> © OpenMapTiles © OpenStreetMap contributors

with links to https://www.openstreetmap.org/copyright and https://openmaptiles.org/.
Also list OSM (ODbL 1.0), OpenMapTiles schema (CC-BY 4.0), Natural Earth (public domain)
and Noto Sans (OFL) on the app's "Licences" screen. Under ODbL the tiles are a "produced
work", so we do not need to publish them, but if we ever share the underlying extracted
database we must do so under ODbL.

## Monthly rebuild

`.github/workflows/offline-maps.yml` has two jobs that share one composite action
(`.github/actions/build-offline-pack`), so a published pack is built and tested exactly like a measured one:

- **build** (pull requests touching this folder, or a manual run without "publish"): builds stage 1 in several corridor widths
  and zooms, reports the real sizes, runs the quality gates and the offline render test. The hand-drawn route is allowed, nothing is
  uploaded, no secret is available.
- **publish** (03:17 UTC on the 2nd of every month, or **Actions, offline-maps, Run workflow, publish**): downloads fresh Geofabrik
  extracts, rebuilds with `ROUTE_FALLBACK=deny`, runs the strict gates and the render test, then uploads and registers.
  It runs in the GitHub Environment **`pack-publish`**, and its concurrency group never cancels a run in progress.

The app checks `offline_packs` (version / `is_current`) when online and offers
"Map update available (3.1 MB)" for stages the user already downloaded.

## What the owner needs to provide

| Item | Where | Notes |
|---|---|---|
| GitHub Environment `pack-publish` | Settings, Environments | Add yourself as a required reviewer: the monthly publish then waits for your approval. Move the secrets below into this environment so no other workflow can read them |
| Supabase URL + service role key | secrets `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (environment `pack-publish`) | Lets the publish job upload packs and call `register_offline_pack`. Only the last step of the job sees them |
| Latest migrations applied | `supabase db push` | The migration that adds `public.register_offline_pack` (service role only) must be in the database before the first publish |
| Later, for Cloudflare: R2 bucket `caminoplus-packs` (private) + tokens | secrets `R2_*`, Supabase function secrets `R2_*`, repo variable `PACK_TARGET=r2` | Read-only token for the function, read/write for the build |
| Deploy the function | `supabase functions deploy offline-pack-url` | Needs no extra secrets for Supabase Storage |
