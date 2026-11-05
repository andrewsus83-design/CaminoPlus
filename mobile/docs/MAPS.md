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
   cp .env.example .env      # then fill in the values below
   ```
3. `.env` values (all public keys, safe inside the app):
   | Key | Where to get it |
   |---|---|
   | `EXPO_PUBLIC_SUPABASE_URL` | already filled (EU project) |
   | `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase dashboard → Project settings → API → `anon` / publishable key |
   | `EXPO_PUBLIC_MAPTILER_KEY` | https://cloud.maptiler.com → Account → API keys (optional; restrict it to bundle id `plus.camino.app`) |

   For EAS cloud builds also add them as EAS environment variables
   (`npx eas-cli env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value … --environment development`)
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
| Sample route, stages, POIs (approximate) | `src/features/map/sampleRoute.ts` |

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

**Login.** The map module does not own auth. The auth module registers a token once:
```ts
import { setMapSession } from '@/features/map';
setMapSession({ getAccessToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null });
```
Until then downloads show "Sign in to download offline maps"; downloaded packs still work.

**GPS and battery (target < 15% in 7 h).** Default *Battery saver*: Balanced accuracy, one
fix per 20 s and only after 25 m of movement, map at 30 fps. *Precise GPS* (tap the pill)
is High accuracy, 5 m / 3 s, and switches back to saver after 10 minutes. Location stops
when the Maps tab is hidden or the app is in the background (foreground permission only).
The real number has to be measured on a phone during a walk (see checklist below).

**Layers.** *Helicopter* = whole route overview, towns, done (gold) and remaining (dashed).
*City* = 3D tilt, POI pins (church, albergue, water, café, quest with gold glow, stamp),
walker dot with accuracy circle. Tap a pin for the bottom sheet.

## 4. Device test checklist

- [ ] Maps tab opens, Helicopter shows the route, City shows pins at Roncesvalles / St-Jean.
- [ ] Tap a pin → sheet opens; tap the map → sheet closes.
- [ ] Offline maps → Download stage 1 (signed in, Pilgrim Plus) → progress → "Ready offline".
- [ ] Airplane mode → map still draws stage 1 with labels; pill says "Offline pack ready".
- [ ] Free account → Download shows the Pilgrim Plus prompt.
- [ ] Battery: 1 h walk with screen mostly off in Battery saver; expect ≤ 2% for location.
- [ ] Confirm `pmtiles://file://…` renders on both platforms (MapLibre Native 13 / iOS 6.x).
      If one platform refuses, publish `.mbtiles` (Planetiler can write it; `format` column
      already allows it) and the app switches to `mbtiles://` automatically.

Run checks: `npm run typecheck`, `npm run test:map`, `npx expo export --platform android`.
