# Maps tab: real MapLibre map, offline packs, GPS

The Maps tab now uses **MapLibre Native** (`@maplibre/maplibre-react-native` 11).
MapLibre is a native module, so it does **not** run in Expo Go. You need a
*development build* (your own Expo Go-like app with MapLibre inside), made once with EAS.
In Expo Go and on web the tab shows the old SVG preview map with a red notice.

## 1. One-time setup (owner)

1. Create a free Expo account: https://expo.dev/signup
2. On your computer, in `mobile/`:
   ```bash
   npm install
   npx eas-cli login
   npx eas-cli init          # links the app to your Expo account (writes the projectId into app.json)
   cp .env.example .env.local   # only needed for the MapTiler key
   ```
3. Keys. The Supabase URL and publishable key are already built in (`src/lib/config.ts`), so
   you only need the optional MapTiler key:
   | Key | Where to get it |
   |---|---|
   | `EXPO_PUBLIC_MAPTILER_KEY` | https://cloud.maptiler.com → Account → API keys (optional; restrict it to bundle id `plus.camino.app`). Leave empty to use OpenFreeMap's keyless tiles online (offline always uses the packs). |

   For EAS cloud builds add it as an EAS environment variable
   (`npx eas-cli env:create --name EXPO_PUBLIC_MAPTILER_KEY --value … --environment development`)
   or on expo.dev → Project → Environment variables.

## 2. Build and install the dev build

```bash
npm run build:dev:android     # eas build --profile development --platform android → APK link / QR
npm run build:dev:ios         # needs an Apple Developer account ($99/yr) and your device registered
```

- Android: open the link on the phone, install the APK.
- iOS: `npx eas-cli device:create` first to register your iPhone, then build. (Simulator: `--profile development-simulator`.)
- Then run `npx expo start` on the computer and open the project from the dev build app (scan the QR).
  JavaScript changes reload instantly; a new build is only needed when native modules change.

## 3. How the map works

| Piece | File |
|---|---|
| Screen (layers, status pill, GPS toggle, sheet) | `app/(tabs)/maps.tsx` |
| Offline maps manager | `app/offline-maps.tsx` |
| MapLibre map (route, pins, walker) | `src/features/map/LiveMap.tsx` |
| Expo Go / web fallback | `src/features/map/MapView.tsx` |
| Style (CaminoPlus palette, OpenMapTiles schema) | `src/features/map/style.ts` |
| Pack download / verify / delete / update | `src/features/map/packs/store.ts` |
| Supabase calls (catalog RPC + `offline-pack-url`) | `src/features/map/packs/api.ts` |
| Battery-saving GPS | `src/features/map/useWalkerLocation.ts` |
| Login token interface | `src/features/map/session.ts` |
| Walk view: pure logic (bearing, next corner, ETA, sunrise/sunset) | `src/features/map/nav.ts` |
| Walk view: map layers (3D buildings, dotted route, puck, pins) | `src/features/map/walkLayers.ts`, `walkScene.ts` |
| Walk view: banner, buttons, bottom card, Re-center pill | `src/features/map/WalkUi.tsx` |
| Walk view settings (3D buildings, day/night) saved on the phone | `src/features/map/walkSettings.ts` |
| The line of each stage from OpenStreetMap (stages 1 to 3): the bundled files, read and checked | `src/features/map/routeLines.ts`, `assets/map/lines/` (made by `tools/poi-audit/build_route_lines.py`) |
| Sample route: the stages and the route (the OSM lines joined, the hand-placed lines only as the fallback, straight lines between towns after Pamplona), the towns, the sample pins and position (approximate) | `src/features/map/sampleRoute.ts` |
| Pins: real stays and points of interest of the stage (`rpc list_stage_stays` / `list_stage_pois`), a saved copy, the sample pins as the fallback | `src/features/places/` (`useStagePois`, `useStageStays`, `choosePins`) |

**Online vs offline.** One style draws both. Online (internet): MapTiler `v3` tiles with a key,
OpenFreeMap's keyless tiles without one. Offline: our own OSM `.pmtiles` packs for the current stage ±1.
MapTiler's terms forbid offline caching, so MapTiler tiles are never put in a pack;
only MapLibre's normal temporary cache is used. Labels use bundled Noto Sans glyphs
(`assets/glyphs`, copied to the device on first launch), so text renders offline.

**Packs.** `Offline maps` lists stages. Download = `rpc offline_pack_catalog` (sizes and
versions) → `functions/v1/offline-pack-url` (server checks login and Pilgrim Plus, returns a
15-minute signed link) → download with progress → check size and sha256 → move into
place → old version deleted. Free users get `403 subscription_required` and see the
Pilgrim Plus prompt. "Update" appears when the monthly rebuild publishes a newer version.
Files live in `<documents>/offline-packs/<stage_id>/`, index in `registry.json`.

**Where packs come from.** `tools/offline-maps` builds one `.pmtiles` per stage every month and publishes it only
after its quality gates pass (OSM route, fresh data, size and tile count in the expected band, labels still drawn
offline). Registering a new version is one database call, `register_offline_pack` (service role only), which
makes the new row current and retires the old ones in a single transaction, so a stage always has exactly one
current pack and "Update" never points at nothing. Only map tiles exist today: there are no stay-detail or audio packs
yet, so those screens need a connection. **No pack is published yet**: `offline_packs` is empty until the first publish run (an owner step,
"First publish, step by step" in `tools/offline-maps/README.md`), so the Offline maps screen says "Map not published yet" and the offline items of the checklist
below cannot be run. See `tools/offline-maps/README.md`.

**Where the route line comes from.** The line the map draws for stages 1 to 3 is OpenStreetMap's. `tools/poi-audit/build_route_lines.py`
joins the OSM route ways of each stage into one ordered line from the start town to the end town (the line `import_osm.py` measures the
stage's stays and points of interest against, so the line, the pins and the red end pin agree), thins it to within 5 m, and writes
`assets/map/lines/camino-frances-0N.json` (a GeoJSON LineString) and `manifest.json` (date of the OSM data, the relations the line runs
along, points and bytes before and after, sha256). The app bundles those files (about 19 kB for the three stages) and `routeLines.ts` reads
them, so the line draws offline and without the database. `sampleRoute.ts` draws a stage with its OSM line and falls back to the old
hand-placed line only for a stage that has none (or whose file is not a usable line). The tests fail when a file is not what its
manifest says, or when a stage that has a line is drawn with the hand-placed one. To refresh the lines or add stages run
`python tools/poi-audit/build_route_lines.py --stages 1-3` (see `tools/poi-audit/README.md`) and commit the files; a new stage also needs
its file in `routeLines.ts` and its entry in `sampleRoute.ts`. Data © OpenStreetMap contributors, ODbL: credited on the Licences
screen ("routes") and in the route sheet of the Maps tab.

**What is OpenStreetMap, and what is still a sample.**

| | Where it comes from |
|---|---|
| Base map tiles | OpenStreetMap data: MapTiler tiles (with a key) or OpenFreeMap tiles online, our own `.pmtiles` packs offline |
| The line of stages 1 to 3 (Saint-Jean-Pied-de-Port to Pamplona) | OpenStreetMap, bundled with the app (`assets/map/lines`); `manifest.json` has the date of the data |
| Stays and points of interest of a stage | The database: OpenStreetMap places imported by `import_osm.py`. The twelve bundled sample pins (`pois` in `sampleRoute.ts`) are drawn only while the database has none for the stage |
| The route after Pamplona (stage 4 on) | Still a sample: straight lines between hand-placed towns. Do not navigate with it |
| The hand-placed lines of stages 1 to 3 | The fallback only; they are 20, 17 and 17 km long where the real stages are 24, 21 and 20 |
| The coordinates of the towns, the sample position (9 km into stage 1), the stage distances (24.2, 21.4, 20.4 km) and the pack size estimates | Written by hand. The four towns of stages 1 to 3 are within 160 m of the new line, and a test fails above 300 m |

The route sheet of the Maps tab says the same, from what is really drawn (`routeNotice` in `sampleRoute.ts`).

**Login.** The map module does not own auth. `app/_layout.tsx` registers the Supabase token once
with `setMapSession({ getAccessToken })`. Signed out, downloads show "Sign in to download offline
maps"; downloaded packs still work.

**GPS and battery (target < 15% in 7 h).** Default *Battery saver*: Balanced accuracy, one
fix per 20 s and only after 25 m of movement, map at 30 fps. *Precise GPS* (tap the pill)
is High accuracy, 5 m / 3 s, and switches back to saver after 10 minutes. Location stops
when the Maps tab is hidden or the app is in the background (foreground permission only).
The real number has to be measured on a phone during a walk (see checklist below).

**Layers.** *Whole route* (helicopter) = overview, towns, done (gold) and remaining (dashed).
*Near me* opens the **Walk view**, a navigation-style screen made for walking the Camino:

- Camera tilted 60 degrees and turned to your direction of travel (heading-up), you in the lower part of the
  screen. Moving the map by hand detaches the camera and shows **Re-center**; the compass button switches
  between heading-up and north-up.
- 3D buildings (from the OpenMapTiles `building` layer, up to the z15 in the packs; a switch turns them off for
  older phones), a bold dotted route with a white halo, a thin gold line for what you already walked, a red pin at
  the end of the stage, a heading arrow with the accuracy disc, and the POI pins (church, albergue, water, café,
  quest, stamp). Tap a pin for its card; "What is near" filters the kinds.
- Top banner: the next real turn ("Bear right in 350 m") or "toward <next town>" with the distance. Only real turns are named, about one
  in 1 to 2 km on stages 1 and 2 (the OSM line winds, and a bend every 350 m is noise): a turn is the change of bearing between the route
  30 m before a point and 30 m after it, at least 40 degrees; turns within 100 m of each other are one (the net turn, at the first: a bend and
  its counter-bend cancel); a smooth curve, and a bend the path goes back from within 80 m, count for less than a corner of the same angle;
  a turn behind you is never named again (`nextManeuver` in `nav.ts`, its rules are in the comment above it). Bottom card: time
  left to the end of the stage (your own pace, else 4 km/h), distance and arrival time, the stage, and **Exit**.
  Without a real GPS fix on the route it says so ("Waiting for your position", "You are not on the Camino yet")
  and shows "--" instead of inventing an ETA from the sample position.
- **Night style**: automatic from sunrise and sunset at your position (30 minutes of twilight), with a button
  that cycles Auto, Day, Night. Pilgrims start before dawn, so the whole-route layer follows it too.
- Precise GPS is never switched on by itself: the GPS button shows the mode and the 10 minute fallback to Battery
  saver still applies. The Walk view works offline (packs, bundled glyphs, GPS only). Street names exist only where
  the pack has them; the banner says "toward <town>", not a street.

On the web and in Expo Go the same screen draws a stylised SVG instead of the native map (only the route and the
pins are real there).

## 4. Device test checklist

- [ ] Maps tab opens, Whole route shows the route, Near me (Walk view) shows pins at Roncesvalles / St-Jean.
- [ ] Walk view on a phone: 3D buildings and the heading arrow render on iOS and Android (not testable on the web
      preview), the camera turns with you, hand gestures show Re-center, Exit returns to the whole route.
- [ ] Walk view frame rate with 3D buildings at pitch 60 on a mid-range phone; if it drops, make the buildings
      switch default off on that class of device. Measure battery for a 1 h walk with the Walk view on.
- [ ] Night style switches at dusk on its own and the Day / Night button overrides it.
- [ ] Tap a pin → sheet opens; tap the map → sheet closes.
- [ ] Walk view, a real walk on stage 1 or 2 (or at least a drive along the road): the banner names the turns you really make ("Turn left in
      200 m" where the Camino leaves the road) and about one in 1 to 2 km, not every bend; no turn you already made comes back, and a hairpin
      road is not announced bend by bend. The counts were made on the map data, not on the ground: this needs a pair of boots.
- [ ] Whole route: the line leaves Saint-Jean on the real path (it winds along the base map's trail, it is not the old straight zigzag), and
      Route details says stages 1 to 3 follow OpenStreetMap, with the credit.
- [ ] Walk view at Refuge Orisson (km 7.4 of stage 1) and at the Trinidad de Arre albergue (km 15.8 of stage 3): the dotted route runs along the
      trail drawn on the base map and through those places, not beside them.
- [ ] Offline maps → Download stage 1 (signed in, Pilgrim Plus) → progress → "Ready offline" (this one and the next two need a published pack: none is yet).
- [ ] Airplane mode → map still draws stage 1 with labels; pill says "Offline pack ready".
- [ ] Free account → Download shows the Pilgrim Plus prompt.
- [ ] Battery: 1 h walk with screen mostly off in Battery saver; expect ≤ 2% for location.
- [ ] Confirm `pmtiles://file://…` renders on both platforms (MapLibre Native 13 / iOS 6.x).
      If one platform refuses, publish `.mbtiles` (Planetiler can write it; `format` column
      already allows it) and the app switches to `mbtiles://` automatically.

Run checks: `npm run typecheck`, `npm run test:map`, `npx expo export --platform android`, and for the route lines
`python -m unittest discover -s tools/poi-audit/tests` (the generator) and `python tools/poi-audit/build_route_lines.py --verify` (the bundled files).
