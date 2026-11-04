# Offline map packs (prototype)

One small vector-tile file per Camino stage that the app downloads before walking,
so the map works for 6 to 8 hours with no signal. This folder builds, tests and
publishes that file. The first stage done end to end is **Camino Francés stage 1,
Saint-Jean-Pied-de-Port to Roncesvalles**.

Nothing here touches the mobile app (not scaffolded yet). The "client side" part
below only describes how the app will use the pack.

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
| `stages/camino-frances-01.json` | Stage config: ids from the `stages`/`routes` tables, OSM extracts, search bbox, corridor width, max zoom |
| `stages/camino-frances-01.route.geojson` | Hand-placed fallback route (Napoleon + Valcarlos), used only if OSM lookup fails |
| `scripts/build_stage.sh` | Whole build: download, cut, route, corridor, Planetiler, manifest |
| `scripts/route_from_osm.py` | Takes the real route from OSM hiking relations (Camino de Santiago / GR 65) |
| `scripts/corridor.py` | Buffers the route (default 3 km each side) into the `.poly` Planetiler uses |
| `scripts/publish_pack.mjs` | Uploads to Supabase Storage (or R2 with `--target r2`) and registers the `offline_packs` row (or writes the SQL) |
| `viewer/` | MapLibre GL JS page that opens a `.pmtiles` with no network; CaminoPlus palette |
| `test/render_offline.mjs` | Playwright test: renders with all outside requests blocked, then with the browser offline |
| `../../supabase/functions/offline-pack-url/` | Edge function: signed download link only for CaminoPlus subscribers |
| `../../supabase/migrations/20261104170000_offline_packs_bucket.sql` | Private Storage bucket `offline-packs` |
| `../../.github/workflows/offline-maps.yml` | Builds + measures on PRs, rebuilds monthly, publishes when secrets exist |

## Run it locally

```bash
cd tools/offline-maps
pip install -r requirements.txt          # osmium, shapely, pyproj
sudo apt install osmium-tool             # or: brew install osmium-tool
npm install && npm run setup             # MapLibre, pmtiles, glyphs into viewer/
scripts/build_stage.sh stages/camino-frances-01.json          # needs Docker
#   or with a local jar (Java 25+): PLANETILER="java -jar planetiler.jar" scripts/build_stage.sh ...
npm run viewer                            # http://localhost:8787/viewer/  then "Open a .pmtiles file"
node test/render_offline.mjs dist/camino-frances-01-3km-z15.pmtiles
```

First run downloads ~1 GB of Planetiler sources (ocean polygons, Natural Earth) into
`data/sources`, plus the two Geofabrik extracts (Aquitaine and Navarra).

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

## Publishing (Supabase Storage now, Cloudflare R2 later)

Decision 2026-11-04: packs live in **Supabase Storage** for now and move to Cloudflare R2
later. `offline_packs.url` says where each file is, so the move needs no app change:

| url | Storage |
|---|---|
| `supabase://offline-packs/<key>` | private Supabase Storage bucket `offline-packs` (now) |
| `r2://<bucket>/<key>` | private Cloudflare R2 bucket (later) |

`publish_pack.mjs [--target supabase|r2]` (and the scheduled workflow) do:

1. Check the file against its manifest (size + sha256).
2. Upload to `<route_slug>/stage-<NN>/tiles-v<YYYYMMDD>.pmtiles`.
   Version = date of the OSM data, so each monthly build gets a new immutable key
   (`Cache-Control: immutable`). Old versions can be deleted after 60 days, once no app
   still points at them.
3. Upsert the `offline_packs` row: `kind 'tiles'`, `format 'pmtiles'`, `version`, `url`,
   `size_bytes`, `sha256`, `is_current true`, and set `is_current = false` on older
   versions of that stage.
4. Always writes `<pack>.offline_packs.sql` with the same statements so the row can be
   applied by hand.

**Moving to R2 later:** create the bucket and tokens, set the R2 secrets (GitHub + Supabase),
set the repo variable `PACK_TARGET=r2`, run the workflow once. New rows point at `r2://`;
the edge function signs both kinds, so old rows keep working until they are retired.

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

## Client side (for later, when the app exists)

- **Storage**: download the presigned URL to app storage, verify `sha256`, then move it
  into place atomically. Keep the previous version until the new one is verified.
- **Rendering**: MapLibre Native (via `@maplibre/maplibre-react-native`) reads the file
  directly as a vector source. Two options to confirm when we scaffold:
  `pmtiles://file:///…/stage-01.pmtiles` (PMTiles support in recent MapLibre Native) or
  convert to MBTiles at build time (`pmtiles convert`) and use `mbtiles:///…`. Planetiler can
  write either; `offline_packs.format` already allows both.
- **Style**: the same layers as `viewer/style.js`, shipped inside the app as JSON.
  One style, many packs: the app adds one source per downloaded stage, or merges them.
- **Fonts (glyphs)**: bundle Noto Sans Regular, Medium and Italic, ranges `0-255`,
  `256-511`, `8192-8447` (Latin + accents for French, Spanish, Basque, Galician, plus
  typographic punctuation), about 0.8 MB total. Point `glyphs` at the bundled folder
  (`asset://` on Android, bundle path on iOS). Source: Protomaps basemaps-assets, OFL licence.
  Add more ranges only if we add languages with other scripts (Japanese for Shikoku etc.).
- **Sprites (icons)**: build our own sprite (albergue, church, fountain, café, pharmacy,
  stamp, viewpoint) from the design-system icons with `spreet` into `sprite.png/.json`
  plus `@2x`, and bundle it. The prototype uses circles, so it needs no sprite.
- **Elevation**: OpenMapTiles has no contour lines or hillshade. Stage 1 climbs 1,390 m,
  so a later pack should add contours (e.g. from Copernicus DEM, 20 m interval) as a
  separate layer or file.

## Attribution (required by ODbL)

Show on the map, always visible or one tap away (MapLibre's compact attribution "i" is fine):

> © OpenMapTiles © OpenStreetMap contributors

with links to https://www.openstreetmap.org/copyright and https://openmaptiles.org/.
Also list OSM (ODbL 1.0), OpenMapTiles schema (CC-BY 4.0), Natural Earth (public domain)
and Noto Sans (OFL) on the app's "Licences" screen. Under ODbL the tiles are a "produced
work", so we do not need to publish them, but if we ever share the underlying extracted
database we must do so under ODbL.

## Monthly rebuild

`.github/workflows/offline-maps.yml` runs at 03:17 UTC on the 2nd of every month and on demand
(**Actions → offline-maps → Run workflow → publish**). It downloads fresh Geofabrik
extracts, rebuilds, runs the offline render test, and publishes if the secrets below are set.
The app checks `offline_packs` (version / `is_current`) when online and offers
"Map update available (3.1 MB)" for stages the user already downloaded.

## What the owner needs to provide

| Item | Where | Notes |
|---|---|---|
| Supabase URL + service role key | GitHub secrets `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Lets the monthly build upload packs and register rows |
| Later, for Cloudflare: R2 bucket `caminoplus-packs` (private) + tokens | GitHub secrets `R2_*`, Supabase function secrets `R2_*`, repo variable `PACK_TARGET=r2` | Read-only token for the function, read/write for the build |
| Deploy the function | `supabase functions deploy offline-pack-url` | Needs no extra secrets for Supabase Storage |
