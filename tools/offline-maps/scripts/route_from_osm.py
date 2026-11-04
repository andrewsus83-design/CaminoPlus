#!/usr/bin/env python3
"""Pull the stage's walking route out of an OSM extract.

Finds route relations (route=hiking|foot, including super-routes) whose name or
ref matches the stage's regex, collects every member way, and keeps the parts
inside the stage search bbox. Writes a GeoJSON MultiLineString.

If too little matches (for example the relation was renamed in OSM), the script
exits with code 2 so the build falls back to the hand-placed route file.

Usage: route_from_osm.py <stage.json> <extract.osm.pbf> <out.geojson>
"""
import json
import re
import sys

import osmium
import numpy as np
import shapely
from pyproj import Transformer
from shapely.geometry import LineString, MultiLineString, box, mapping
from shapely.ops import linemerge

MIN_KM = 15  # the stage is ~24 km; anything shorter means we found the wrong thing


def transform(fn, geom):
    """Reproject a shapely geometry with a pyproj transform function."""
    return shapely.transform(geom, lambda c: np.column_stack(fn(c[:, 0], c[:, 1])))


def main(stage_path, pbf_path, out_path):
    stage = json.load(open(stage_path))
    name_re = re.compile(stage["route_name_regex"], re.IGNORECASE)
    bbox = box(*stage["search_bbox"])

    # Pass 1: relations. Relations come last in a PBF, so ways need a second pass.
    rel_members = {}  # relation id -> (way ids, child relation ids)
    matched = set()
    names = {}
    for rel in osmium.FileProcessor(pbf_path, osmium.osm.RELATION):
        tags = rel.tags
        if tags.get("type") not in ("route", "superroute"):
            continue
        if tags.get("route") not in ("hiking", "foot", None):
            continue  # skips bicycle (EuroVelo), road, bus, ... super-routes too
        ways = [m.ref for m in rel.members if m.type == "w"]
        rels = [m.ref for m in rel.members if m.type == "r"]
        rel_members[rel.id] = (ways, rels)
        label = " ".join(filter(None, [tags.get("name"), tags.get("name:es"), tags.get("name:fr"),
                                        tags.get("name:en"), tags.get("ref")]))
        if label and name_re.search(label):
            matched.add(rel.id)
            names[rel.id] = label

    way_ids, seen, stack = set(), set(), list(matched)
    while stack:
        rid = stack.pop()
        if rid in seen or rid not in rel_members:
            continue
        seen.add(rid)
        ways, rels = rel_members[rid]
        way_ids.update(ways)
        stack.extend(rels)

    # Pass 2: way geometry (needs node locations).
    lines = []
    fp = osmium.FileProcessor(pbf_path, osmium.osm.WAY | osmium.osm.NODE).with_locations()
    for obj in fp:
        if not isinstance(obj, osmium.osm.Way) or obj.id not in way_ids:
            continue
        try:
            coords = [(n.lon, n.lat) for n in obj.nodes]
        except osmium.InvalidLocationError:
            continue
        if len(coords) >= 2:
            part = LineString(coords).intersection(bbox)
            if not part.is_empty:
                lines.append(part)

    flat = []
    for g in lines:
        flat.extend(getattr(g, "geoms", [g]))
    flat = [g for g in flat if g.geom_type == "LineString"]
    merged = linemerge(MultiLineString(flat)) if flat else MultiLineString()

    to_m = Transformer.from_crs(4326, 25830, always_xy=True).transform
    km = transform(to_m, merged).length / 1000 if flat else 0.0
    print(f"route_from_osm: {len(matched)} matching relations, {len(way_ids)} member ways, "
          f"{len(flat)} segments in bbox, {km:.1f} km")
    for rid in sorted(matched)[:20]:
        print(f"  relation {rid}: {names[rid]}")
    if km < MIN_KM:
        print(f"route_from_osm: under {MIN_KM} km, not using OSM geometry")
        sys.exit(2)

    json.dump({"type": "FeatureCollection", "features": [{
        "type": "Feature",
        "properties": {"source": "OpenStreetMap", "relations": sorted(matched), "length_km": round(km, 1)},
        "geometry": mapping(merged),
    }]}, open(out_path, "w"))


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(*sys.argv[1:])
