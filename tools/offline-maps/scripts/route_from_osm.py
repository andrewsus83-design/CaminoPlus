#!/usr/bin/env python3
"""Pull the stage's walking route out of an OSM extract.

Finds route relations (route=hiking|foot, including super-routes) whose name or
ref matches the stage's regex, collects every member way, and keeps the parts
inside the stage search bbox. Writes a GeoJSON MultiLineString.

Optional stage keys. A stage file without them behaves exactly as it always did
(stage 1 has none of them):
  route_exclude_regex  A relation whose label matches is dropped even if it also matches
                       route_name_regex. The child relations of a dropped relation are only kept
                       when something else reaches them: they match route_name_regex themselves or
                       hang under a relation that is kept. Both regexes are case-insensitive and
                       are searched in the label: name, name:es, name:fr, name:en and ref, joined.
  clip_km              Keep only the parts of the route within this many km of the fallback_route
                       polyline (measured in a metric projection) instead of everything inside
                       search_bbox. This is what stops a long super-route from pulling in a whole
                       province.
  min_route_km         Under this many km of route the script exits 2 (default 15).

If too little matches (for example the relation was renamed in OSM), the script
exits with code 2 so the build falls back to the hand-placed route file. Every other
failure (a bad stage file, a crash) ends with another code on purpose: build_stage.sh
only treats 2 as "too little route" and stops the build for anything else.

Usage: route_from_osm.py <stage.json> <extract.osm.pbf> <out.geojson>
"""
import json
import math
import re
import sys
from pathlib import Path

import osmium
import numpy as np
import shapely
from pyproj import Transformer
from shapely.geometry import LineString, MultiLineString, box, mapping, shape
from shapely.ops import linemerge, unary_union

MIN_KM = 15  # default of min_route_km: the stage is ~24 km; anything shorter means we found the wrong thing
METRIC_CRS = 25830  # ETRS89 / UTM 30N, the same metric projection corridor.py buffers in
LIST_MAX = 20  # relations printed per group; the rest is counted


def transform(fn, geom):
    """Reproject a shapely geometry with a pyproj transform function."""
    return shapely.transform(geom, lambda c: np.column_stack(fn(c[:, 0], c[:, 1])))


def optional_regex(stage, key):
    """The case-insensitive regex in stage[key], or None when the key is absent or empty."""
    pattern = stage.get(key)
    if pattern is None or pattern == "":
        return None
    if not isinstance(pattern, str):
        sys.exit(f"route_from_osm: {key} must be a string, got {pattern!r}")
    try:
        return re.compile(pattern, re.IGNORECASE)
    except re.error as e:
        sys.exit(f"route_from_osm: {key} is not a valid regular expression ({e}): {pattern!r}")


def optional_km(stage, key, default=None):
    """stage[key] as a number of km above zero, or `default` when the key is absent."""
    value = stage.get(key, default)
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
        sys.exit(f"route_from_osm: {key} must be a number above 0, got {value!r}")
    return value


def read_fallback_line(stage_path, stage):
    """The stage's fallback_route (a path next to the stage file, as build_stage.sh reads it) as one geometry."""
    name = stage.get("fallback_route")
    if not name:
        sys.exit("route_from_osm: clip_km needs fallback_route in the stage file (the line the route is kept near)")
    path = Path(stage_path).resolve().parent / name
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        if data.get("type") == "FeatureCollection":
            geoms = [feature["geometry"] for feature in data["features"]]
        elif data.get("type") == "Feature":
            geoms = [data["geometry"]]
        else:
            geoms = [data]
        line = unary_union([shape(g) for g in geoms])
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as e:
        sys.exit(f"route_from_osm: cannot use fallback_route {path}: {e}")
    if line.is_empty:
        sys.exit(f"route_from_osm: fallback_route {path} has no geometry")
    return line


def flatten(parts):
    """The LineStrings inside a list of intersection results (which can be collections)."""
    flat = []
    for g in parts:
        flat.extend(getattr(g, "geoms", [g]))
    return [g for g in flat if g.geom_type == "LineString"]


def listed(prefix, ids, labels, note=""):
    """Print up to LIST_MAX relations, then how many were left out."""
    for rid in sorted(ids)[:LIST_MAX]:
        print(f"  {prefix} {rid}: {labels.get(rid, '(no name)')}{note}")
    if len(ids) > LIST_MAX:
        print(f"  ... and {len(ids) - LIST_MAX} more {prefix}s")


def main(stage_path, pbf_path, out_path):
    with open(stage_path, encoding="utf-8") as f:
        stage = json.load(f)
    name_re = re.compile(stage["route_name_regex"], re.IGNORECASE)
    exclude_re = optional_regex(stage, "route_exclude_regex")
    min_km = optional_km(stage, "min_route_km", MIN_KM)
    clip_km = optional_km(stage, "clip_km")
    bbox = box(*stage["search_bbox"])

    to_m = Transformer.from_crs(4326, METRIC_CRS, always_xy=True).transform
    clip_area = None
    if clip_km is not None:
        to_deg = Transformer.from_crs(METRIC_CRS, 4326, always_xy=True).transform
        fallback_m = transform(to_m, read_fallback_line(stage_path, stage))
        clip_area = transform(to_deg, fallback_m.buffer(clip_km * 1000, quad_segs=16))
    keep_area = bbox if clip_area is None else clip_area

    # Pass 1: relations. Relations come last in a PBF, so ways need a second pass.
    rel_members = {}  # relation id -> (way ids, child relation ids)
    matched = set()  # label matches route_name_regex
    excluded = set()  # label matches route_exclude_regex
    labels = {}
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
        if label:
            labels[rel.id] = label
            if name_re.search(label):
                matched.add(rel.id)
            if exclude_re and exclude_re.search(label):
                excluded.add(rel.id)

    # An excluded relation is never entered, so its children only come in when another kept
    # relation (or their own label) reaches them.
    seeds = matched - excluded
    way_ids, seen, stack = set(), set(), list(seeds)
    not_followed = set()  # excluded relations met as children of a kept relation
    while stack:
        rid = stack.pop()
        if rid in seen or rid not in rel_members:
            continue
        seen.add(rid)
        ways, rels = rel_members[rid]
        way_ids.update(ways)
        for child in rels:
            if child in excluded:
                not_followed.add(child)
            else:
                stack.append(child)

    # Pass 2: way geometry (needs node locations).
    lines = []
    in_bbox = []  # only to tell how much clip_km removed
    fp = osmium.FileProcessor(pbf_path, osmium.osm.WAY | osmium.osm.NODE).with_locations()
    for obj in fp:
        if not isinstance(obj, osmium.osm.Way) or obj.id not in way_ids:
            continue
        try:
            coords = [(n.lon, n.lat) for n in obj.nodes]
        except osmium.InvalidLocationError:
            continue
        if len(coords) >= 2:
            line = LineString(coords)
            part = line.intersection(keep_area)
            if not part.is_empty:
                lines.append(part)
            if clip_area is not None:
                inside = line.intersection(bbox)
                if not inside.is_empty:
                    in_bbox.append(inside)

    flat = flatten(lines)
    merged = linemerge(MultiLineString(flat)) if flat else MultiLineString()

    km = transform(to_m, merged).length / 1000 if flat else 0.0
    print(f"route_from_osm: {len(seeds)} matching relations, {len(way_ids)} member ways, "
          f"{len(flat)} segments in {'bbox' if clip_area is None else 'clip area'}, {km:.1f} km")
    listed("relation", seeds, labels)
    listed("child relation", seen - seeds, labels)
    dropped = (matched & excluded) | not_followed
    listed("excluded relation", matched & excluded, labels, "  (matches route_exclude_regex)")
    listed("excluded child relation", not_followed - matched, labels, "  (matches route_exclude_regex)")
    if clip_area is not None:
        flat_bbox = flatten(in_bbox)
        km_bbox = transform(to_m, MultiLineString(flat_bbox)).length / 1000 if flat_bbox else 0.0
        print(f"route_from_osm: clip_km {clip_km:g}: {km_bbox:.1f} km of route inside the search bbox, "
              f"{km:.1f} km of it within {clip_km:g} km of the fallback route")
    if km < min_km:
        print(f"route_from_osm: under {min_km:g} km, not using OSM geometry")
        sys.exit(2)

    properties = {"source": "OpenStreetMap", "relations": sorted(seeds), "length_km": round(km, 1)}
    if exclude_re is not None:
        properties["excluded_relations"] = sorted(dropped)
    if clip_km is not None:
        properties["clip_km"] = clip_km
    with open(out_path, "w") as out:
        json.dump({"type": "FeatureCollection", "features": [{
            "type": "Feature",
            "properties": properties,
            "geometry": mapping(merged),
        }]}, out)


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(*sys.argv[1:])
