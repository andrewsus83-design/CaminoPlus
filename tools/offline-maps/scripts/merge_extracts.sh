#!/usr/bin/env bash
# Merge the OSM extracts of one stage into a single file that holds every object once.
#
#   scripts/merge_extracts.sh <out.osm.pbf> <extract.osm.pbf>...
#
# One extract needs no care: it is copied through `osmium merge`, as before.
#
# Several extracts (a stage that crosses a border, or the edge between two regions) are the reason this
# script exists. Geofabrik cuts every extract from its own snapshot of OpenStreetMap, so the objects near
# the border are in both files, and one of them may have been edited between the two snapshots: node 7 is
# at version 3 in one file and at version 4 in the other. `osmium merge` drops a copy only when type, id AND
# version are the same, so both versions stay, and `osmium extract` then stops with
#   "Node ID twice in input. Maybe you are using a history or change file?"
# (this is what failed camino-portugues-05 and -06, Portugal + Galicia). Here the extracts are merged as if
# they were history files, which keeps every version, and `osmium time-filter` then keeps the newest version of
# each object. An object that is the same in both files (the usual case) comes out once, as before.
set -euo pipefail

if (( $# < 2 )); then
  echo "usage: merge_extracts.sh <out.osm.pbf> <extract.osm.pbf>..." >&2
  exit 2
fi
out="$1"
shift

if (( $# == 1 )); then
  osmium merge --overwrite -o "$out" "$1"
  exit 0
fi

# The format is spelled out, so the name of the temporary file does not matter.
history="$out.history"
trap 'rm -f "$history"' EXIT
osmium merge --overwrite --with-history -f osh.pbf -o "$history" "$@"

# The newest version of every object: a time after any object in the files (the clock of the machine plays no part).
osmium time-filter --overwrite -F osh.pbf -f pbf -o "$out" "$history" 2100-01-01T00:00:00Z
