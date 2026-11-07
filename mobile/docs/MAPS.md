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
   | `EXPO_PUBLIC_MAPTILER_KEY` | https://cloud.maptiler.com → Account → API keys (optional; restrict it to bundle id `plus.camino.app`). Leave empty to use the OSM offline style everywhere. |

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
| Sample route, stages, POIs (approximate) | `src/features/map/sampleRoute.ts` |
| Pins: real stays and points of interest of the stage (`rpc list_stage_stays` / `list_stage_pois`), a saved copy, the sample pins as the fallback | `src/features/places/` (`useStagePois`, `useStageStays`, `choosePins`) |

**Online vs offline.** One style draws both. Online (internet + MapTiler key): MapTiler
`v3` tiles. Offline, or no key: our own OSM `.pmtiles` packs for the current stage ±1.
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
yet, so those screens need a connection. See `tools/offline-maps/README.md`.

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
- Top banner: the next corner ("Bear right in 350 m") or "toward <next town>" with the distance. Bottom card: time
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
- [ ] Offline maps → Download stage 1 (signed in, Pilgrim Plus) → progress → "Ready offline".
- [ ] Airplane mode → map still draws stage 1 with labels; pill says "Offline pack ready".
- [ ] Free account → Download shows the Pilgrim Plus prompt.
- [ ] Battery: 1 h walk with screen mostly off in Battery saver; expect ≤ 2% for location.
- [ ] Confirm `pmtiles://file://…` renders on both platforms (MapLibre Native 13 / iOS 6.x).
      If one platform refuses, publish `.mbtiles` (Planetiler can write it; `format` column
      already allows it) and the app switches to `mbtiles://` automatically.

Run checks: `npm run typecheck`, `npm run test:map`, `npx expo export --platform android`.
