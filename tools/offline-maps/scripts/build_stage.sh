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
# Planetiler's own sources (ocean polygons ~750 MB, Natural Earth ~240 MB) are
# downloaded once into $DATA_DIR/sources (step 5) and reused.
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
STAGE_JSON="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
STAGE_DIR="$(dirname "$STAGE_JSON")"
DATA_DIR="${DATA_DIR:-$HERE/data}"
OUT_DIR="${OUT_DIR:-$HERE/dist}"
PLANETILER_VERSION="${PLANETILER_VERSION:-0.10.2}"
PY="${PYTHON:-python3}"

jqr() { "$PY" -c "import json,sys; v=json.load(open('$STAGE_JSON'))$1; print(' '.join(map(str,v)) if isinstance(v,list) else v)"; }

SLUG="$(jqr "['slug']")"
BUFFER_KM="${2:-$(jqr "['buffer_km']")}"
MAXZOOM="${3:-$(jqr "['maxzoom']")}"
SEARCH_BBOX="$(jqr "['search_bbox']" | tr ' ' ',')"
NAME="${SLUG}-${BUFFER_KM}km-z${MAXZOOM}"

mkdir -p "$DATA_DIR/osm" "$DATA_DIR/sources" "$DATA_DIR/tmp" "$OUT_DIR"
WORK="$DATA_DIR/work/$SLUG"
mkdir -p "$WORK"

# 1-2. OSM extract for the stage area ------------------------------------------
STAGE_PBF="$WORK/stage.osm.pbf"
if [[ ! -s "$STAGE_PBF" ]]; then
  parts=()
  for url in $(jqr "['osm_extracts']"); do
    f="$DATA_DIR/osm/$(basename "$url")"
    [[ -s "$f" ]] || curl -fsSL --retry 3 -o "$f" "$url"
    parts+=("$f")
  done
  # Geofabrik headers carry the replication timestamp (the data's "as of" date).
  osmium fileinfo -g header.option.osmosis_replication_timestamp "${parts[0]}" > "$WORK/osm_timestamp" || true
  [[ -s "$WORK/osm_timestamp" ]] || date -u +%Y-%m-%dT%H:%M:%SZ > "$WORK/osm_timestamp"
  osmium merge --overwrite -o "$WORK/merged.osm.pbf" "${parts[@]}"
  osmium extract --overwrite --strategy=smart -b "$SEARCH_BBOX" -o "$STAGE_PBF" "$WORK/merged.osm.pbf"
  rm -f "$WORK/merged.osm.pbf"
fi
OSM_TS="$(cat "$WORK/osm_timestamp")"

# 3. route geometry ------------------------------------------------------------
ROUTE="$WORK/route.geojson"
if "$PY" "$HERE/scripts/route_from_osm.py" "$STAGE_JSON" "$STAGE_PBF" "$ROUTE"; then
  ROUTE_SOURCE=osm
else
  cp "$STAGE_DIR/$(jqr "['fallback_route']")" "$ROUTE"
  ROUTE_SOURCE=fallback
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
fetch_source() { # <file> <url>
  [[ -s "$DATA_DIR/sources/$1" ]] && return 0
  curl -fSL --retry 5 --retry-all-errors --retry-delay 10 --connect-timeout 60 \
    -o "$DATA_DIR/sources/$1.part" "$2" && mv "$DATA_DIR/sources/$1.part" "$DATA_DIR/sources/$1"
}
fetch_source water-polygons-split-3857.zip https://osmdata.openstreetmap.de/download/water-polygons-split-3857.zip
fetch_source natural_earth_vector.sqlite.zip https://naciscdn.org/naturalearth/packages/natural_earth_vector.sqlite.zip
fetch_source lake_centerline.shp.zip https://github.com/acalcutt/osm-lakelines/releases/download/v12/lake_centerline.shp.zip

# Paths are relative to $DATA_DIR, which is mounted at /data in the container.
cp "$WORK/corridor-${BUFFER_KM}km.poly" "$DATA_DIR/tmp/corridor.poly"
cp "$STAGE_PBF" "$DATA_DIR/tmp/stage.osm.pbf"
args=(
  --osm-path=/data/tmp/stage.osm.pbf
  --water-polygons-path=/data/sources/water-polygons-split-3857.zip
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
if [[ -n "${PLANETILER:-}" ]]; then
  # Local jar: map /data back to the real directory.
  # shellcheck disable=SC2086
  $PLANETILER "${args[@]//\/data/$DATA_DIR}"
else
  docker run --rm -e JAVA_TOOL_OPTIONS="-Xmx2g" -v "$DATA_DIR":/data \
    "ghcr.io/onthegomap/planetiler:$PLANETILER_VERSION" "${args[@]}"
fi
mv "$DATA_DIR/tmp/out.pmtiles" "$OUT_DIR/${NAME}.pmtiles"

# 6. manifest --------------------------------------------------------------------
SIZE=$(stat -c %s "$OUT_DIR/${NAME}.pmtiles")
SHA=$(sha256sum "$OUT_DIR/${NAME}.pmtiles" | cut -d' ' -f1)
"$PY" - "$STAGE_JSON" "$OUT_DIR/${NAME}.json" <<EOF
import json, sys
stage = json.load(open(sys.argv[1]))
json.dump({
  "file": "${NAME}.pmtiles",
  "slug": stage["slug"],
  "route_id": stage["route_id"],
  "stage_id": stage["stage_id"],
  "route_slug": stage["route_slug"],
  "stage_number": stage["stage_number"],
  "kind": "tiles",
  "format": "pmtiles",
  "size_bytes": $SIZE,
  "sha256": "$SHA",
  "buffer_km": float("$BUFFER_KM"),
  "maxzoom": int("$MAXZOOM"),
  "bounds": [float(x) for x in "$BOUNDS".split(",")],
  "route_source": "$ROUTE_SOURCE",
  "osm_timestamp": "$OSM_TS",
  "planetiler": "$PLANETILER_VERSION",
  "schema": "openmaptiles",
  "attribution": "© OpenMapTiles © OpenStreetMap contributors"
}, open(sys.argv[2], "w"), indent=2)
EOF
"$PY" -c "print(f'${NAME}.pmtiles\t$SIZE bytes\t{$SIZE/1048576:.2f} MB')"
