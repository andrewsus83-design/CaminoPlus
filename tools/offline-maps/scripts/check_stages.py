#!/usr/bin/env python3
"""Check every stage file in stages/ before CI spends an hour building it.

    python3 scripts/check_stages.py [--stages DIR] [--extracts FILE]

Looks at every stages/*.json (the hand-written stage 1 and the generated ones) and exits 1, listing
every problem, if any file would make a build fail late or build the wrong thing:

  - the keys: all required ones present, none unknown (a misspelt optional key such as `clip_kn`
    would silently switch a feature off), the right types
  - slug is <route_slug>-<NN>, matches stage_number and the file name; slug and stage_id are unique;
    route_id and stage_id look like UUIDs; one route_slug has one route_id
  - every extract URL is in scripts/geofabrik_extracts.json (or is one of stage 1's two URLs)
  - search_bbox is [west, south, east, north], ordered, and under 1.2 degrees per side
  - the fallback route file exists, is GeoJSON and has at least 2 points inside the bbox
  - maxzoom is at most 15 and buffer_km is from 1 to 10
  - the regexes compile, the render views lie inside the bbox, the quality band is consistent

It does not run a build and needs only the Python standard library.
"""
import argparse
import json
import math
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent  # tools/offline-maps
DEFAULT_STAGES = ROOT / "stages"
DEFAULT_EXTRACTS = HERE / "geofabrik_extracts.json"

# Stage 1 is written by hand and builds from these two extracts; they stay valid even if the allowlist is edited.
STAGE1_EXTRACTS = {
    "https://download.geofabrik.de/europe/france/aquitaine-latest.osm.pbf",
    "https://download.geofabrik.de/europe/spain/navarra-latest.osm.pbf",
}
MAX_BBOX_DEGREES = 1.2  # per side; make_stages.py enforces the same limit on what it generates

REQUIRED = {"slug", "name", "route_slug", "stage_number", "route_id", "stage_id", "osm_extracts", "search_bbox",
            "coastal", "route_name_regex", "fallback_route", "buffer_km", "maxzoom", "render_checks"}
OPTIONAL = {"route_exclude_regex", "clip_km", "min_route_km", "quality", "waypoints", "render_allow_errors",
            "generated_from"}
GENERATED_REQUIRE = {"clip_km", "min_route_km", "waypoints"}  # a generated stage without them over-selects or is unchecked
QUALITY_KEYS = {"min_tiles", "max_tiles", "min_size_mb", "max_size_mb", "required_layers", "max_change_ratio",
                "max_osm_age_days"}
VIEW_KEYS = {"name", "at", "min_features", "min_labels"}

SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
STAGE_SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*-(\d{2})$")
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


def is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def is_finite(value):
    return is_number(value) and math.isfinite(value)


def is_int(value):
    return isinstance(value, int) and not isinstance(value, bool)


def non_empty_text(value):
    return isinstance(value, str) and bool(value.strip())


def positions(coords):
    """Every (x, y) position in a GeoJSON `coordinates` value, whatever the nesting."""
    if isinstance(coords, list):
        if len(coords) >= 2 and all(is_number(v) for v in coords[:2]):
            yield coords[0], coords[1]
        else:
            for item in coords:
                yield from positions(item)


def geometry_positions(obj):
    """Every position in a GeoJSON FeatureCollection, Feature, geometry or GeometryCollection."""
    if not isinstance(obj, dict):
        return
    kind = obj.get("type")
    if kind == "FeatureCollection":
        for feature in obj.get("features") or []:
            yield from geometry_positions(feature)
    elif kind == "Feature":
        yield from geometry_positions(obj.get("geometry"))
    elif kind == "GeometryCollection":
        for geometry in obj.get("geometries") or []:
            yield from geometry_positions(geometry)
    else:
        yield from positions(obj.get("coordinates"))


def no_duplicate_keys(pairs):
    seen = {}
    for key, value in pairs:
        if key in seen:
            raise ValueError(f"the key {key!r} appears twice in one object")
        seen[key] = value
    return seen


def read_json(path):
    """(data, None) or (None, problem text)."""
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"), object_pairs_hook=no_duplicate_keys), None
    except OSError as e:
        return None, f"cannot read the file: {e.strerror or e}"
    except ValueError as e:
        return None, f"not valid JSON: {e}"


def check_regex(errors, key, value, required=False):
    if not isinstance(value, str) or (required and not value):
        errors.append(f"{key} must be {'a non-empty ' if required else 'a '}string")
        return
    try:
        re.compile(value, re.IGNORECASE)
    except re.error as e:
        errors.append(f"{key} is not a valid regular expression ({e}): {value!r}")


def check_bbox(errors, bbox):
    """Returns the bbox as four floats when it is usable, else None."""
    if not (isinstance(bbox, list) and len(bbox) == 4 and all(is_finite(v) for v in bbox)):
        errors.append("search_bbox must be a list of 4 numbers [west, south, east, north]")
        return None
    west, south, east, north = bbox
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        errors.append(f"search_bbox {bbox} is not ordered: it must be [west, south, east, north] with west < east and south < north")
        return None
    for side, size in (("wide", east - west), ("high", north - south)):
        if size >= MAX_BBOX_DEGREES:
            errors.append(f"search_bbox is {size:.2f} degrees {side}; the limit is {MAX_BBOX_DEGREES} (a typo in a coordinate would "
                          "make the OSM extract and the build far too big)")
    return west, south, east, north


def inside(bbox, lng, lat):
    west, south, east, north = bbox
    return west <= lng <= east and south <= lat <= north


def check_fallback(errors, stage_dir, name, bbox):
    if not non_empty_text(name) or Path(name).name != name:
        errors.append(f"fallback_route must be a file name next to the stage file, got {name!r}")
        return
    path = stage_dir / name
    if not path.is_file():
        errors.append(f"fallback_route {name} does not exist")
        return
    data, problem = read_json(path)
    if problem:
        errors.append(f"fallback_route {name}: {problem}")
        return
    if not isinstance(data, dict) or not any(True for _ in geometry_positions(data)):
        errors.append(f"fallback_route {name} is not GeoJSON with coordinates")
        return
    if bbox:
        count = sum(1 for lng, lat in geometry_positions(data) if inside(bbox, lng, lat))
        if count < 2:
            errors.append(f"fallback_route {name} has {count} point(s) inside search_bbox, at least 2 are needed "
                          "(the route and the bbox are in different places)")


def check_views(errors, views, bbox):
    if not isinstance(views, list) or not views:
        errors.append("render_checks must be a non-empty list of views")
        return
    for i, view in enumerate(views):
        label = f"render_checks[{i}]"
        if not isinstance(view, dict):
            errors.append(f"{label} must be an object")
            continue
        for key in sorted(view.keys() - VIEW_KEYS):
            errors.append(f"{label}: unknown key {key!r}")
        if not non_empty_text(view.get("name")):
            errors.append(f"{label}: name must be a non-empty string")
        at = view.get("at")
        if not (isinstance(at, list) and len(at) in (2, 3) and all(is_finite(v) for v in at)):
            errors.append(f"{label}: at must be [longitude, latitude] or [longitude, latitude, zoom]")
        else:
            if bbox and not inside(bbox, at[0], at[1]):
                errors.append(f"{label}: at {at[:2]} is outside search_bbox, so the pack has no map there")
            if len(at) == 3 and not 0 <= at[2] <= 22:
                errors.append(f"{label}: zoom {at[2]} must be from 0 to 22")
        for key in ("min_features", "min_labels"):
            floors = view.get(key, {})
            if not isinstance(floors, dict) or not all(isinstance(k, str) and is_int(v) and v >= 0 for k, v in floors.items()):
                errors.append(f"{label}: {key} must map layer names to whole numbers of 0 or more")


def check_quality(errors, quality):
    if not isinstance(quality, dict):
        errors.append("quality must be an object")
        return
    for key in sorted(quality.keys() - QUALITY_KEYS):
        errors.append(f"quality: unknown key {key!r} (a misspelt gate is not applied)")
    for key in QUALITY_KEYS - {"required_layers"}:
        if key in quality and not (is_finite(quality[key]) and quality[key] > 0):
            errors.append(f"quality.{key} must be a number above 0")
    for low, high in (("min_tiles", "max_tiles"), ("min_size_mb", "max_size_mb")):
        if is_finite(quality.get(low)) and is_finite(quality.get(high)) and quality[low] > quality[high]:
            errors.append(f"quality.{low} ({quality[low]}) is above quality.{high} ({quality[high]})")
    layers = quality.get("required_layers")
    if "required_layers" in quality and not (isinstance(layers, list) and all(non_empty_text(x) for x in layers)):
        errors.append("quality.required_layers must be a list of layer names")


def check_waypoints(errors, waypoints, bbox):
    if not isinstance(waypoints, list) or len(waypoints) < 2:
        errors.append("waypoints must be a list of at least 2 {name, at} points")
        return
    for i, point in enumerate(waypoints):
        at = point.get("at") if isinstance(point, dict) else None
        if not (isinstance(point, dict) and non_empty_text(point.get("name")) and isinstance(at, list)
                and len(at) == 2 and all(is_finite(v) for v in at)):
            errors.append(f"waypoints[{i}] must be {{\"name\": text, \"at\": [longitude, latitude]}}")
        elif bbox and not inside(bbox, at[0], at[1]):
            errors.append(f"waypoints[{i}] ({point['name']}) is outside search_bbox")


def check_stage(path, data, allowed_urls):
    """Problems of one stage file, as a list of texts."""
    errors = []
    if not isinstance(data, dict):
        return ["must be a JSON object"]
    for key in sorted(REQUIRED - data.keys()):
        errors.append(f"missing key {key!r}")
    for key in sorted(data.keys() - REQUIRED - OPTIONAL):
        errors.append(f"unknown key {key!r} (not read by any build step; a misspelt option is silently ignored)")
    generated = "generated_from" in data
    if generated:
        for key in sorted(GENERATED_REQUIRE - data.keys()):
            errors.append(f"missing key {key!r} (every generated stage has it; run scripts/make_stages.py)")

    slug, route_slug, number = data.get("slug"), data.get("route_slug"), data.get("stage_number")
    if "route_slug" in data and not (isinstance(route_slug, str) and SLUG_RE.match(route_slug)):
        errors.append(f"route_slug {route_slug!r} must be lower case letters, digits and hyphens")
    if "stage_number" in data and not (is_int(number) and 1 <= number <= 99):
        errors.append(f"stage_number {number!r} must be a whole number from 1 to 99")
    if "slug" in data:
        if not (isinstance(slug, str) and STAGE_SLUG_RE.match(slug)):
            errors.append(f"slug {slug!r} must look like <route_slug>-<NN>, for example camino-frances-07")
        else:
            if isinstance(route_slug, str) and is_int(number) and slug != f"{route_slug}-{number:02d}":
                errors.append(f"slug {slug!r} does not match route_slug {route_slug!r} and stage_number {number}")
            if path.name != f"{slug}.json":
                errors.append(f"the file must be named {slug}.json (publish_pack.mjs and check_pack.mjs find it by slug)")
    for key in ("route_id", "stage_id"):
        if key in data and not (isinstance(data[key], str) and UUID_RE.match(data[key])):
            errors.append(f"{key} {data[key]!r} is not a lower case UUID")
    stage_id = data.get("stage_id")
    if generated and isinstance(stage_id, str) and is_int(number) and UUID_RE.match(stage_id):
        if not (stage_id.startswith("40000000-0000-0000-") and stage_id.endswith(f"-{number:012d}")):
            errors.append(f"stage_id {stage_id} does not follow 40000000-0000-0000-<route index>-<stage number> for stage {number}")
    if "name" in data and not non_empty_text(data["name"]):
        errors.append("name must be a non-empty string")
    if "coastal" in data and not isinstance(data["coastal"], bool):
        errors.append("coastal must be true or false")

    extracts = data.get("osm_extracts")
    if "osm_extracts" in data:
        if not (isinstance(extracts, list) and extracts and all(isinstance(u, str) for u in extracts)):
            errors.append("osm_extracts must be a non-empty list of URLs")
        else:
            for url in extracts:
                if url not in allowed_urls:
                    errors.append(f"osm_extracts: {url} is not in scripts/geofabrik_extracts.json")
            if len(set(extracts)) != len(extracts):
                errors.append("osm_extracts lists the same URL twice")

    bbox = check_bbox(errors, data["search_bbox"]) if "search_bbox" in data else None
    if "fallback_route" in data:
        check_fallback(errors, path.parent, data["fallback_route"], bbox)

    if "route_name_regex" in data:
        check_regex(errors, "route_name_regex", data["route_name_regex"], required=True)
    if "route_exclude_regex" in data:
        check_regex(errors, "route_exclude_regex", data["route_exclude_regex"])
    if "buffer_km" in data and not (is_finite(data["buffer_km"]) and 1 <= data["buffer_km"] <= 10):
        errors.append(f"buffer_km {data['buffer_km']!r} must be a number from 1 to 10")
    if "maxzoom" in data and not (is_int(data["maxzoom"]) and 1 <= data["maxzoom"] <= 15):
        errors.append(f"maxzoom {data['maxzoom']!r} must be a whole number from 1 to 15 (OpenMapTiles stops at z15)")
    if "clip_km" in data and not (is_finite(data["clip_km"]) and 0 < data["clip_km"] <= 30):
        errors.append(f"clip_km {data['clip_km']!r} must be a number above 0 and up to 30")
    if "min_route_km" in data and not (is_finite(data["min_route_km"]) and data["min_route_km"] > 0):
        errors.append(f"min_route_km {data['min_route_km']!r} must be a number above 0")

    if "render_checks" in data:
        check_views(errors, data["render_checks"], bbox)
    if "render_allow_errors" in data:
        allow = data["render_allow_errors"]
        if not isinstance(allow, list):
            errors.append("render_allow_errors must be a list of regular expressions")
        else:
            for pattern in allow:
                check_regex(errors, "render_allow_errors entry", pattern, required=True)
    if "quality" in data:
        check_quality(errors, data["quality"])
    if "waypoints" in data:
        check_waypoints(errors, data["waypoints"], bbox)
    if "generated_from" in data and not non_empty_text(data["generated_from"]):
        errors.append("generated_from must be a non-empty string")
    return errors


def check_all(stages_dir, extracts_path):
    """Every problem found, as 'stages/<file>: text' lines, and how many stage files were looked at."""
    problems = []
    allowed = set(STAGE1_EXTRACTS)
    allowlist, problem = read_json(extracts_path)
    if problem:
        problems.append(f"{extracts_path.name}: {problem}")
    elif not isinstance(allowlist, dict) or not all(isinstance(u, str) for u in allowlist.values()):
        problems.append(f"{extracts_path.name}: must map extract ids to URLs")
    else:
        allowed |= set(allowlist.values())

    files = sorted(stages_dir.glob("*.json")) if stages_dir.is_dir() else []
    if not files:
        problems.append(f"{stages_dir.name}: no stage files (*.json) found in {stages_dir}")
    seen = {"slug": {}, "stage_id": {}}
    route_ids, route_slugs = {}, {}
    for path in files:
        where = f"{stages_dir.name}/{path.name}"
        data, problem = read_json(path)
        if problem:
            problems.append(f"{where}: {problem}")
            continue
        problems.extend(f"{where}: {e}" for e in check_stage(path, data, allowed))
        if not isinstance(data, dict):
            continue
        for key in ("slug", "stage_id"):
            value = data.get(key)
            if isinstance(value, str):
                if value in seen[key]:
                    problems.append(f"{where}: {key} {value} is already used by {seen[key][value]}")
                else:
                    seen[key][value] = path.name
        route_slug, route_id = data.get("route_slug"), data.get("route_id")
        if isinstance(route_slug, str) and isinstance(route_id, str):
            if route_ids.setdefault(route_slug, route_id) != route_id:
                problems.append(f"{where}: route_id {route_id} differs from {route_ids[route_slug]} of the other {route_slug} stages")
            if route_slugs.setdefault(route_id, route_slug) != route_slug:
                problems.append(f"{where}: route_id {route_id} is also used by route {route_slugs[route_id]}")
    return problems, len(files)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Check every stage file in stages/.")
    parser.add_argument("--stages", type=Path, default=DEFAULT_STAGES, help="folder with the stage files (default: stages/)")
    parser.add_argument("--extracts", type=Path, default=DEFAULT_EXTRACTS,
                        help="allowlist of OSM extracts (default: scripts/geofabrik_extracts.json)")
    args = parser.parse_args(argv)
    problems, count = check_all(args.stages, args.extracts)
    if problems:
        for problem in problems:
            print(f"ERROR: {problem}", file=sys.stderr)
        print(f"check_stages: {len(problems)} problem(s) in {args.stages}", file=sys.stderr)
        return 1
    print(f"check_stages: {count} stage file(s) OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
