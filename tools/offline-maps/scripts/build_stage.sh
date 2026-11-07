#!/usr/bin/env bash
# Build the offline vector-tile pack for one stage.
#
#   scripts/build_stage.sh stages/camino-frances-01.json [buffer_km] [maxzoom]
#
# Steps
#   1. download the OSM extracts the stage needs (Geofabrik) and merge them
#   2. cut them down to the stage's search bbox (osmium)
#   3. take the stage route from OSM route relations (fallback: the hand-placed file)
#   4. buffer the route into a corridor polygon (default 3 km each side)
#   5. run Planetiler (OpenMapTiles schema) limited to that corridor, up to z15
#   6. write <slug>-<buffer>km-z<maxzoom>.pmtiles and a .json manifest next to it
#
# Needs: curl, osmium-tool, python3 with requirements.txt, and docker (or a
# planetiler.jar with Java 25+ via PLANETILER="java -jar planetiler.jar").
# Planetiler's own sources (ocean polygons ~750 MB, Natural Earth ~430 MB, lake centerlines
# ~80 MB) are downloaded once into $DATA_DIR/sources (step 5) and reused.
#
# Environment
#   ROUTE_FALLBACK  allow (default) | deny. Whether the hand-placed route may replace the OSM route
#                   when the OSM extract has too little of it. Measurement builds allow it; a
#                   build that will be published must say deny (the workflow does). Only exit code 2
#                   of route_from_osm.py means "too little route"; any other failure always stops
#                   the build, because a crash is a bug, not a reason to ship a different route.
#   DATA_DIR, OUT_DIR, PLANETILER_VERSION, PLANETILER_IMAGE, PYTHON, FETCH_RETRIES
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
STAGE_JSON="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
STAGE_DIR="$(dirname "$STAGE_JSON")"
DATA_DIR="${DATA_DIR:-$HERE/data}"
OUT_DIR="${OUT_DIR:-$HERE/dist}"
PLANETILER_VERSION="${PLANETILER_VERSION:-0.10.2}"
PY="${PYTHON:-python3}"
ROUTE_FALLBACK="${ROUTE_FALLBACK:-allow}"
case "$ROUTE_FALLBACK" in allow|deny) ;; *) echo "ROUTE_FALLBACK must be allow or deny" >&2; exit 2 ;; esac

# jqr "['slug']": one value (or a space separated list) out of the stage file.
jqr() { "$PY" -c "import json,sys; v=json.load(open(sys.argv[1]))$1; print(' '.join(map(str,v)) if isinstance(v,list) else v)" "$STAGE_JSON"; }

SLUG="$(jqr "['slug']")"
BUFFER_KM="${2:-$(jqr "['buffer_km']")}"
MAXZOOM="${3:-$(jqr "['maxzoom']")}"
SEARCH_BBOX="$(jqr "['search_bbox']" | tr ' ' ',')"
NAME="${SLUG}-${BUFFER_KM}km-z${MAXZOOM}"

mkdir -p "$DATA_DIR/osm" "$DATA_DIR/sources" "$DATA_DIR/tmp" "$OUT_DIR"
WORK="$DATA_DIR/work/$SLUG"
mkdir -p "$WORK"

# Download to a .part file and move it into place, so an interrupted run never leaves a
# truncated file that the next run would reuse.
download() { # <url> <dest>
  curl -fSL --retry "${FETCH_RETRIES:-3}" --retry-all-errors --retry-delay 10 --connect-timeout 30 \
    -o "$2.part" "$1" && mv "$2.part" "$2"
}
sha_ok() { # <file> <sha256>
  [[ "$(sha256sum "$1" | cut -d' ' -f1)" == "$2" ]]
}

# 1-2. OSM extract for the stage area ------------------------------------------
# Geofabrik's "latest" files change daily, so they cannot be pinned; the pack records the
# extract's replication timestamp (osm_timestamp) and publish_pack.mjs refuses stale data.
STAGE_PBF="$WORK/stage.osm.pbf"
if [[ ! -s "$STAGE_PBF" ]]; then
  parts=()
  for url in $(jqr "['osm_extracts']"); do
    f="$DATA_DIR/osm/$(basename "$url")"
    [[ -s "$f" ]] || download "$url" "$f"
    parts+=("$f")
  done
  # Geofabrik headers carry the replication timestamp (the data's "as of" date).
  osmium fileinfo -g header.option.osmosis_replication_timestamp "${parts[0]}" > "$WORK/osm_timestamp" || true
  [[ -s "$WORK/osm_timestamp" ]] || date -u +%Y-%m-%dT%H:%M:%SZ > "$WORK/osm_timestamp"
  # Extracts of two regions come from two snapshots of OSM: merge_extracts.sh keeps the newest version of an object
  # that is in both (a plain `osmium merge` keeps both versions, and osmium extract then refuses the file).
  "$HERE/scripts/merge_extracts.sh" "$WORK/merged.osm.pbf" "${parts[@]}"
  osmium extract --overwrite --strategy=smart -b "$SEARCH_BBOX" -o "$STAGE_PBF" "$WORK/merged.osm.pbf"
  rm -f "$WORK/merged.osm.pbf"
fi
OSM_TS="$(cat "$WORK/osm_timestamp")"

# 3. route geometry ------------------------------------------------------------
ROUTE="$WORK/route.geojson"
rc=0
"$PY" "$HERE/scripts/route_from_osm.py" "$STAGE_JSON" "$STAGE_PBF" "$ROUTE" || rc=$?
if [[ $rc -eq 0 ]]; then
  ROUTE_SOURCE=osm
elif [[ $rc -eq 2 && "$ROUTE_FALLBACK" == allow ]]; then
  echo "route_from_osm.py found too little route in the extract: using the hand-placed fallback (ROUTE_FALLBACK=allow). Do not publish this build." >&2
  cp "$STAGE_DIR/$(jqr "['fallback_route']")" "$ROUTE"
  ROUTE_SOURCE=fallback
else
  echo "route_from_osm.py failed (exit $rc, ROUTE_FALLBACK=$ROUTE_FALLBACK): refusing to continue with a route that is not from OSM" >&2
  exit 3
fi
echo "route source: $ROUTE_SOURCE"

# 4. corridor --------------------------------------------------------------------
"$PY" "$HERE/scripts/corridor.py" "$ROUTE" "$BUFFER_KM" "$WORK/corridor-${BUFFER_KM}km"
BOUNDS="$(cat "$WORK/corridor-${BUFFER_KM}km.bbox")"
cp "$WORK/corridor-${BUFFER_KM}km.geojson" "$OUT_DIR/${NAME}.corridor.geojson"
cp "$ROUTE" "$OUT_DIR/${SLUG}.route.geojson"

# 5. Planetiler --------------------------------------------------------------------
# Fetch Planetiler's sources ourselves with retries (its own downloader gives up
# after a 10 s HEAD timeout, which osmdata.openstreetmap.de sometimes needs).
# Every file that does not change upstream is pinned by SHA-256 (also when it comes from the
# CI cache), so a swapped download or a poisoned cache fails the build instead of the pack.
SHA_NATURAL_EARTH=375da61836d4779dffa8b87887bc4faa94dac77745ba0ee3914bd7cbedf40a02  # Natural Earth 5.1.2 package, last modified 2022-05-14
SHA_LAKE_CENTERLINES=6c900507c88fc9f5b5a386f90fd0a42d0495e8755a03d075538fb9a6801a3192 # osm-lakelines release v12
SHA_WATER_PLACEHOLDER=a5a703fc72209e0f9b73a121bf31b3e5945794b244749ff87d99d91264d94b2b # Planetiler v0.10.2 test resource
fetch_source() { # <file> <url> [sha256]
  local dest="$DATA_DIR/sources/$1"
  if [[ -s "$dest" ]]; then
    if [[ -z "${3:-}" ]] || sha_ok "$dest" "$3"; then return 0; fi
    echo "cached $1 does not match its pinned SHA-256: downloading it again" >&2
    rm -f "$dest"
  fi
  download "$2" "$dest" || return 1
  if [[ -n "${3:-}" ]] && ! sha_ok "$dest" "$3"; then
    echo "$1 does not match its pinned SHA-256 (upstream changed?): $(sha256sum "$dest" | cut -d' ' -f1)" >&2
    rm -f "$dest"
    return 2
  fi
}
zip_ok() { "$PY" -c "import sys,zipfile; sys.exit(0 if zipfile.ZipFile(sys.argv[1]).testzip() is None else 1)" "$1"; }
# Ocean polygons only matter for stages that touch the sea. For inland stages, if
# osmdata.openstreetmap.de is unreachable (it often is from GitHub runners), use
# Planetiler's tiny test file (Monaco coast only), which adds nothing to the pack.
# The real ocean file is rebuilt upstream every day, so it cannot be pinned by hash; it is
# only checked to be a complete zip.
OCEAN=osmdata
if [[ -f "$DATA_DIR/tmp/water-placeholder.zip" ]] || \
   ! fetch_source water-polygons-split-3857.zip https://osmdata.openstreetmap.de/download/water-polygons-split-3857.zip; then
  if [[ "$(jqr ".get('coastal', False)")" == "True" ]]; then
    echo "ocean polygons unavailable and this stage is coastal: stopping" >&2; exit 1
  fi
  echo "ocean polygons unavailable; inland stage, using placeholder (no sea in this corridor)"
  if [[ ! -f "$DATA_DIR/tmp/water-placeholder.zip" ]]; then
    download "https://raw.githubusercontent.com/onthegomap/planetiler/v${PLANETILER_VERSION}/planetiler-core/src/test/resources/water-polygons-split-3857.zip" "$DATA_DIR/tmp/water-placeholder.zip"
  fi
  if ! sha_ok "$DATA_DIR/tmp/water-placeholder.zip" "$SHA_WATER_PLACEHOLDER"; then
    echo "water placeholder does not match its pinned SHA-256 (is PLANETILER_VERSION still ${PLANETILER_VERSION}?)" >&2
    rm -f "$DATA_DIR/tmp/water-placeholder.zip"; exit 1
  fi
  OCEAN=placeholder
else
  zip_ok "$DATA_DIR/sources/water-polygons-split-3857.zip" || { echo "ocean polygons zip is damaged" >&2; rm -f "$DATA_DIR/sources/water-polygons-split-3857.zip"; exit 1; }
fi
WATER=/data/sources/water-polygons-split-3857.zip
[[ "$OCEAN" == placeholder ]] && WATER=/data/tmp/water-placeholder.zip
fetch_source natural_earth_vector.sqlite.zip https://naciscdn.org/naturalearth/packages/natural_earth_vector.sqlite.zip "$SHA_NATURAL_EARTH"
fetch_source lake_centerline.shp.zip https://github.com/acalcutt/osm-lakelines/releases/download/v12/lake_centerline.shp.zip "$SHA_LAKE_CENTERLINES"

# Paths are relative to $DATA_DIR, which is mounted at /data in the container.
cp "$WORK/corridor-${BUFFER_KM}km.poly" "$DATA_DIR/tmp/corridor.poly"
cp "$STAGE_PBF" "$DATA_DIR/tmp/stage.osm.pbf"
# shellcheck disable=SC2054  # the commas belong to Planetiler's --languages=en,es,fr,eu
args=(
  --osm-path=/data/tmp/stage.osm.pbf
  --water-polygons-path="$WATER"
  --natural-earth-path=/data/sources/natural_earth_vector.sqlite.zip
  --lake-centerlines-path=/data/sources/lake_centerline.shp.zip
  --download-osm-tile-weights=false
  --tmpdir=/data/tmp/planetiler
  --polygon=/data/tmp/corridor.poly
  --bounds="$BOUNDS"
  --maxzoom="$MAXZOOM"
  --output=/data/tmp/out.pmtiles
  --force
  --nodemap-type=sparsearray
  # Pilgrims read labels in many languages; keep name, name:en, name:es, name:fr, name:eu only.
  --languages=en,es,fr,eu
)
PLANETILER_IMAGE="$(PLANETILER_VERSION="$PLANETILER_VERSION" "$HERE/scripts/planetiler_image.sh")"
if [[ -n "${PLANETILER:-}" ]]; then
  # Local jar: map /data back to the real directory.
  # shellcheck disable=SC2086
  $PLANETILER "${args[@]//\/data/$DATA_DIR}"
else
  docker run --rm -e JAVA_TOOL_OPTIONS="-Xmx2g" -v "$DATA_DIR":/data "$PLANETILER_IMAGE" "${args[@]}"
fi
mv "$DATA_DIR/tmp/out.pmtiles" "$OUT_DIR/${NAME}.pmtiles"

# 6. manifest --------------------------------------------------------------------
# Size and hash come from the file; tile count, zoom range and layer names come from the PMTiles
# header and metadata (scripts/pmtiles_info.py), so check_pack.mjs can judge the build.
SIZE=$(stat -c %s "$OUT_DIR/${NAME}.pmtiles")
SHA=$(sha256sum "$OUT_DIR/${NAME}.pmtiles" | cut -d' ' -f1)
INFO="$("$PY" "$HERE/scripts/pmtiles_info.py" "$OUT_DIR/${NAME}.pmtiles")"
"$PY" - "$STAGE_JSON" "$OUT_DIR/${NAME}.json" "$NAME" "$SIZE" "$SHA" "$BUFFER_KM" "$MAXZOOM" "$BOUNDS" \
  "$ROUTE_SOURCE" "$OCEAN" "$OSM_TS" "$PLANETILER_VERSION" "$PLANETILER_IMAGE" "$INFO" <<'PY'
import json, sys
(stage_path, out_path, name, size, sha, buffer_km, maxzoom, bounds,
 route_source, ocean, osm_ts, planetiler, image, info) = sys.argv[1:]
stage = json.load(open(stage_path))
manifest = {
  "file": f"{name}.pmtiles",
  "slug": stage["slug"],
  "route_id": stage["route_id"],
  "stage_id": stage["stage_id"],
  "route_slug": stage["route_slug"],
  "stage_number": stage["stage_number"],
  "kind": "tiles",
  "format": "pmtiles",
  "size_bytes": int(size),
  "sha256": sha,
  "buffer_km": float(buffer_km),
  "maxzoom": int(maxzoom),
  "bounds": [float(x) for x in bounds.split(",")],
  "route_source": route_source,
  "ocean_polygons": ocean,
  "osm_timestamp": osm_ts,
  "planetiler": planetiler,
  "planetiler_image": image,
  "schema": "openmaptiles",
  "attribution": "© OpenMapTiles © OpenStreetMap contributors",
}
manifest.update(json.loads(info))  # tiles, tile_contents, pack_min_zoom, pack_max_zoom, pack_bounds, tile_type, layers
json.dump(manifest, open(out_path, "w"), indent=2)
PY
"$PY" -c "import sys; n, s = sys.argv[1], int(sys.argv[2]); print(f'{n}.pmtiles\t{s} bytes\t{s/1048576:.2f} MB')" "$NAME" "$SIZE"
