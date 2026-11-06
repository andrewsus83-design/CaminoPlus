#!/usr/bin/env python3
"""Generate the stage files of the offline map packs from the human-checked catalog.

    python3 scripts/make_stages.py            write stages/<slug>.json and stages/<slug>.route.geojson
    python3 scripts/make_stages.py --check    write nothing; exit 1 if a generated file would change
                                              or a catalog entry is invalid (the CI guard)

Input (tools/offline-maps/catalog/, described in catalog/README.md):
    <route>/route.json   settings shared by every stage of a route (regexes, clip_km, buffer_km, ...)
    <route>/<NN>.json    one stage: from, via, to, extracts, coastal, ...
    scripts/geofabrik_extracts.json   the allowlist: extract id -> download URL

Output, for every catalog stage except the hand-written stage 1 of the Camino Francés:
    stages/<route_slug>-<NN>.json           what build_stage.sh and route_from_osm.py read
    stages/<route_slug>-<NN>.route.geojson  straight lines through from, via..., to: the hand-placed
                                            fallback route, and the line route_from_osm.py clips to

A regenerated stage file keeps what calibration added after the first build: `quality`,
`render_allow_errors`, the `min_features` / `min_labels` of the render_checks, and any render view
added after the first two. Everything else is rewritten from the catalog, so edit the catalog and
run this script again, never the generated fields.

The catalog is checked before anything is written. If anything is wrong, nothing is written and
every problem is listed. Only the Python standard library is needed.
"""
import argparse
import copy
import difflib
import json
import math
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent  # tools/offline-maps
DEFAULT_CATALOG = ROOT / "catalog"
DEFAULT_STAGES = ROOT / "stages"
DEFAULT_EXTRACTS = HERE / "geofabrik_extracts.json"

# (route_slug, stage number) of stage files that were written by hand and are not generated.
HAND_WRITTEN = {("camino-frances", 1)}

EARTH_RADIUS_KM = 6371.0
KM_PER_DEGREE = math.pi * EARTH_RADIUS_KM / 180  # of latitude; of longitude it is this times cos(latitude)
MAX_JOIN_KM = 1.5  # a stage starts within this distance of where the previous one ended
MAX_VIA = 6
MAX_HOP_KM = 60  # straight line between two neighbouring waypoints; a stage is a day's walk
MIN_SPAN_KM = 1  # from and to are at least this far apart
MAX_BBOX_DEGREES = 1.2  # per side of search_bbox, also enforced by check_stages.py
MIN_ROUTE_FLOOR_KM = 3
MIN_ROUTE_SHARE = 0.4  # of the straight-line length of the polyline
RENDER_ZOOM = 15

# Generous boxes (west, south, east, north) around the mainland of the countries the app covers
# (the Balearics are inside Spain's box). They catch swapped or mistyped coordinates, nothing finer.
COUNTRY_BOUNDS = {
    "Spain": (-9.6, 35.9, 4.5, 43.9),
    "France": (-5.3, 41.3, 9.6, 51.2),
    "Portugal": (-9.6, 36.8, -6.1, 42.2),
}

SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
STAGE_FILE_RE = re.compile(r"^(\d{2})\.json$")

ROUTE_KEYS = {"route_slug", "route_index", "route_id", "route_name_regex", "route_exclude_regex",
              "clip_km", "buffer_km", "maxzoom", "margin_km"}
ROUTE_REQUIRED = ROUTE_KEYS - {"route_exclude_regex"}
ENTRY_REQUIRED = {"n", "name", "from", "to", "extracts", "coastal"}
ENTRY_OPTIONAL = {"via", "distance_km", "distance_source", "notes"}
POINT_KEYS = {"name", "lat", "lng", "source"}


class Report:
    """Problems found while reading the catalog. Errors stop the run, warnings are only printed."""

    def __init__(self):
        self.errors = []
        self.warnings = []

    def error(self, where, message):
        self.errors.append(f"{where}: {message}")

    def warn(self, where, message):
        self.warnings.append(f"{where}: {message}")


def is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def is_finite(value):
    return is_number(value) and math.isfinite(value)


def km_between(a, b):
    """Great-circle distance in km between two (lat, lng) pairs."""
    lat1, lng1, lat2, lng2 = (math.radians(x) for x in (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(h)))


def country_of(lat, lng):
    for country, (west, south, east, north) in COUNTRY_BOUNDS.items():
        if west <= lng <= east and south <= lat <= north:
            return country
    return None


def no_duplicate_keys(pairs):
    seen = {}
    for key, value in pairs:
        if key in seen:
            raise ValueError(f"the key {key!r} appears twice in one object")
        seen[key] = value
    return seen


def load_json(path, where, report):
    """Parse a JSON file (UTF-8, no repeated keys); None, with an error recorded, when that fails."""
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"), object_pairs_hook=no_duplicate_keys)
    except OSError as e:
        report.error(where, f"cannot read the file: {e.strerror or e}")
    except ValueError as e:  # json.JSONDecodeError is one
        report.error(where, f"not valid JSON: {e}")
    return None


def dumps(obj):
    return json.dumps(obj, indent=2, ensure_ascii=False) + "\n"


def rounded(x, digits=2):
    return round(x, digits) + 0.0  # + 0.0 turns -0.0 into 0.0


# ---- reading and checking the catalog ----------------------------------------------------------

def load_allowlist(path, report):
    where = path.name
    data = load_json(path, where, report)
    if data is None:
        return {}
    if not isinstance(data, dict) or not data:
        report.error(where, "must be a JSON object that maps an extract id to its download URL")
        return {}
    allow = {}
    for key, url in data.items():
        if not isinstance(url, str) or not url.startswith("https://download.geofabrik.de/") or not url.endswith(".osm.pbf"):
            report.error(where, f"{key}: {url!r} is not an https://download.geofabrik.de/ ... .osm.pbf URL")
        else:
            allow[key] = url
    return allow


def check_route(cfg, route_dir, where, report):
    """Validate route.json. True when every generated stage of this route can rely on it."""
    if not isinstance(cfg, dict):
        report.error(where, "must be a JSON object")
        return False
    before = len(report.errors)
    for key in sorted(ROUTE_REQUIRED - cfg.keys()):
        report.error(where, f"missing key {key!r}")
    for key in sorted(cfg.keys() - ROUTE_KEYS):
        report.error(where, f"unknown key {key!r} (route.json has: {', '.join(sorted(ROUTE_KEYS))})")
    slug = cfg.get("route_slug")
    if "route_slug" in cfg:
        if not isinstance(slug, str) or not SLUG_RE.match(slug):
            report.error(where, f"route_slug {slug!r} must be lower case letters, digits and hyphens")
        elif slug != route_dir.name:
            report.error(where, f"route_slug {slug!r} must equal the folder name {route_dir.name!r}")
    index = cfg.get("route_index")
    if "route_index" in cfg and (isinstance(index, bool) or not isinstance(index, int) or not 0 <= index <= 9999):
        report.error(where, f"route_index {index!r} must be a whole number from 0 to 9999")
    if "route_id" in cfg and not (isinstance(cfg["route_id"], str) and UUID_RE.match(cfg["route_id"])):
        report.error(where, f"route_id {cfg['route_id']!r} is not a lower case UUID")
    for key in ("route_name_regex", "route_exclude_regex"):
        if key in cfg:
            pattern = cfg[key]
            if not isinstance(pattern, str) or (key == "route_name_regex" and not pattern):
                report.error(where, f"{key} must be a non-empty string" if key == "route_name_regex" else f"{key} must be a string")
                continue
            try:
                re.compile(pattern, re.IGNORECASE)
            except re.error as e:
                report.error(where, f"{key} is not a valid regular expression ({e}): {pattern!r}")
    ranges = {"clip_km": (0, 30, False), "buffer_km": (1, 10, True), "margin_km": (0, 30, True)}
    for key, (low, high, low_ok) in ranges.items():
        if key in cfg:
            v = cfg[key]
            if not is_finite(v) or v > high or v < low or (v == low and not low_ok):
                report.error(where, f"{key} {v!r} must be a number {'from' if low_ok else 'above'} {low} {'to' if low_ok else 'and up to'} {high}")
    if "maxzoom" in cfg:
        z = cfg["maxzoom"]
        if isinstance(z, bool) or not isinstance(z, int) or not 1 <= z <= 15:
            report.error(where, f"maxzoom {z!r} must be a whole number from 1 to 15 (OpenMapTiles stops at 15)")
    return len(report.errors) == before


def check_point(point, label, where, report):
    """Validate {name, lat, lng, source}; returns (name, lat, lng) or None."""
    if not isinstance(point, dict):
        report.error(where, f"{label} must be an object with name, lat, lng and source")
        return None
    before = len(report.errors)
    for key in sorted(POINT_KEYS - point.keys()):
        report.error(where, f"{label}: missing {key!r}")
    for key in sorted(point.keys() - POINT_KEYS):
        report.error(where, f"{label}: unknown key {key!r} (a point has: {', '.join(sorted(POINT_KEYS))})")
    for key in ("name", "source"):
        if key in point and not (isinstance(point[key], str) and point[key].strip()):
            report.error(where, f"{label}: {key} must be a non-empty string" + (' ("unverified" is allowed)' if key == "source" else ""))
    lat, lng = point.get("lat"), point.get("lng")
    for key, value in (("lat", lat), ("lng", lng)):
        if key in point and not is_finite(value):
            report.error(where, f"{label}: {key} {value!r} must be a finite number")
    if is_finite(lat) and is_finite(lng) and country_of(lat, lng) is None:
        hint = " They look swapped (lat and lng)." if country_of(lng, lat) else ""
        report.error(where, f"{label}: lat {lat}, lng {lng} is outside Spain, France and Portugal.{hint}")
    if len(report.errors) > before:
        return None
    return (point["name"], float(lat), float(lng))


def check_entry(entry, number, where, allow, report):
    """Validate one stage entry. Returns {"n", "data", "points", "ok"} or None when it is not even an object.

    points are (name, lat, lng) from `from` to `to` (None if any point is unusable); ok is False when
    anything in the entry was wrong."""
    if not isinstance(entry, dict):
        report.error(where, "must be a JSON object")
        return None
    before = len(report.errors)
    for key in sorted(ENTRY_REQUIRED - entry.keys()):
        report.error(where, f"missing key {key!r}")
    for key in sorted(entry.keys() - ENTRY_REQUIRED - ENTRY_OPTIONAL):
        report.error(where, f"unknown key {key!r} (a stage has: {', '.join(sorted(ENTRY_REQUIRED | ENTRY_OPTIONAL))})")

    n = entry.get("n")
    if "n" in entry and (isinstance(n, bool) or n != number or not isinstance(n, int)):
        report.error(where, f"n is {n!r} but the file name says stage {number}: they must match")
    if number < 1:
        report.error(where, "stage numbers start at 1")
    if "name" in entry and not (isinstance(entry["name"], str) and entry["name"].strip()):
        report.error(where, "name must be a non-empty string")
    if "coastal" in entry and not isinstance(entry["coastal"], bool):
        report.error(where, f"coastal must be true or false, got {entry['coastal']!r}")
    if entry.get("notes") is not None and not isinstance(entry.get("notes"), str):
        report.error(where, "notes must be text or null")

    extracts = entry.get("extracts")
    if "extracts" in entry:
        if not isinstance(extracts, list) or not extracts:
            report.error(where, "extracts must be a non-empty list of extract ids from scripts/geofabrik_extracts.json")
        else:
            for ident in extracts:
                if not isinstance(ident, str) or ident not in allow:
                    report.error(where, f"extract {ident!r} is not in scripts/geofabrik_extracts.json (known ids: {', '.join(sorted(allow))})")
            if len(set(map(str, extracts))) != len(extracts):
                report.error(where, "extracts lists the same id twice")

    distance, source = entry.get("distance_km"), entry.get("distance_source")
    if distance is not None:
        if not is_finite(distance) or not 0 < distance <= 80:
            report.error(where, f"distance_km {distance!r} must be a number above 0 (and not more than 80) or null")
        if not (isinstance(source, str) and source.strip()):
            report.error(where, "distance_km is a number, so distance_source must say where it comes from (otherwise distance_km must be null)")
    elif source is not None:
        report.warn(where, "distance_source is set but distance_km is null")

    start = check_point(entry.get("from"), "from", where, report) if "from" in entry else None
    end = check_point(entry.get("to"), "to", where, report) if "to" in entry else None
    via_raw = entry.get("via", [])
    via = []
    if not isinstance(via_raw, list):
        report.error(where, "via must be a list (use [] for none)")
    elif len(via_raw) > MAX_VIA:
        report.error(where, f"via has {len(via_raw)} points, the most allowed is {MAX_VIA}")
    else:
        via = [check_point(p, f"via[{i}]", where, report) for i, p in enumerate(via_raw)]

    points = [start, *via, end]
    complete = all(points)
    if complete:
        for before_point, after_point in zip(points, points[1:]):
            hop = km_between(before_point[1:], after_point[1:])
            if hop > MAX_HOP_KM:
                report.error(where, f"{before_point[0]} to {after_point[0]} is {hop:.0f} km in a straight line (limit {MAX_HOP_KM}): "
                                    "wrong coordinates, or a via point is missing")
        if km_between(start[1:], end[1:]) < MIN_SPAN_KM:
            report.error(where, f"from and to are less than {MIN_SPAN_KM} km apart: copied by mistake?")
    # Kept even when another field is wrong, so the join with the neighbouring stages is still checked.
    return {"n": number, "data": entry, "points": points if complete else None, "ok": len(report.errors) == before}


def read_catalog(catalog, allow, report):
    """Every route folder of the catalog, validated: [{"dir", "cfg", "stages": {n: stage}}]. Records problems."""
    routes = []
    if not catalog.is_dir():
        report.error(catalog.name, "catalog folder not found")
        return routes
    for route_dir in sorted(p for p in catalog.iterdir() if p.is_dir()):
        route_file = route_dir / "route.json"
        if not route_file.exists():
            continue  # not a route folder
        where_route = f"{catalog.name}/{route_dir.name}/route.json"
        cfg = load_json(route_file, where_route, report)
        route_ok = cfg is not None and check_route(cfg, route_dir, where_route, report)
        stages = {}
        numbers = set()
        for path in sorted(route_dir.glob("*.json")):
            if path.name == "route.json":
                continue
            where = f"{catalog.name}/{route_dir.name}/{path.name}"
            match = STAGE_FILE_RE.match(path.name)
            if not match:
                report.error(where, "unexpected file name: a stage file is named NN.json (two digits, for example 07.json)")
                continue
            numbers.add(int(match.group(1)))
            entry = load_json(path, where, report)
            if entry is None:
                continue
            checked = check_entry(entry, int(match.group(1)), where, allow, report)
            if checked:
                checked["where"] = where
                checked["file"] = path.name
                stages[checked["n"]] = checked
        routes.append({"dir": route_dir, "cfg": cfg, "ok": route_ok, "stages": stages, "numbers": sorted(numbers),
                       "where": where_route})
    if not routes:
        report.error(catalog.name, "no route folder with a route.json in the catalog")
    return routes


def check_chain(route, report):
    """Each stage starts where the previous one ended (when both are in the catalog)."""
    for n, stage in sorted(route["stages"].items()):
        prev = route["stages"].get(n - 1)
        if not prev or not prev["points"] or not stage["points"]:
            continue  # the entry that is wrong has its own error
        end, start = prev["points"][-1], stage["points"][0]
        gap = km_between(end[1:], start[1:])
        if gap > MAX_JOIN_KM:
            report.error(stage["where"],
                         f"from ({start[0]}) is {gap:.1f} km from the end of stage {n - 1} ({end[0]}); "
                         f"consecutive stages must join within {MAX_JOIN_KM} km")
    numbers = route["numbers"]
    if numbers:
        missing = [n for n in range(numbers[0], numbers[-1] + 1) if n not in numbers]
        if missing:
            report.warn(route["where"], f"no catalog file yet for stage(s) {', '.join(map(str, missing))}")


def check_duplicates(routes, report):
    seen = {"route_slug": {}, "route_index": {}, "route_id": {}, "slug": {}, "stage_id": {}}

    def note(kind, value, owner, where):
        if value in seen[kind]:
            report.error(where, f"{kind} {value!r} is already used by {seen[kind][value]}")
        else:
            seen[kind][value] = owner

    for route in routes:
        cfg = route["cfg"]
        if not route["ok"]:
            continue
        for kind in ("route_slug", "route_index", "route_id"):
            note(kind, cfg[kind], route["where"], route["where"])
        for n, stage in sorted(route["stages"].items()):
            note("slug", stage_slug(cfg, n), stage["where"], stage["where"])
            note("stage_id", stage_id(cfg, n), stage["where"], stage["where"])


# ---- generating the stage files ----------------------------------------------------------------

def stage_slug(cfg, n):
    return f"{cfg['route_slug']}-{n:02d}"


def stage_id(cfg, n):
    return f"40000000-0000-0000-{cfg['route_index']:04d}-{n:012d}"


def polyline_km(points):
    return sum(km_between(a[1:], b[1:]) for a, b in zip(points, points[1:]))


def search_bbox(points, expand_km):
    """[west, south, east, north] of the points, widened by expand_km on every side, to 2 decimals."""
    lats = [p[1] for p in points]
    lngs = [p[2] for p in points]
    dlat = expand_km / KM_PER_DEGREE
    south, north = min(lats) - dlat, max(lats) + dlat
    # A degree of longitude is shortest at the highest latitude, so the margin is measured there:
    # it is then at least expand_km everywhere in the box.
    dlng = expand_km / (KM_PER_DEGREE * math.cos(math.radians(max(abs(south), abs(north)))))
    return [rounded(min(lngs) - dlng), rounded(south), rounded(max(lngs) + dlng), rounded(north)]


def keep_calibration(stage_file):
    """The parts of an existing stage file that calibration (not the catalog) put there."""
    kept = {"quality": None, "render_allow_errors": None, "views": []}
    if not isinstance(stage_file, dict):
        return kept
    if "quality" in stage_file:
        kept["quality"] = copy.deepcopy(stage_file["quality"])
    if "render_allow_errors" in stage_file:
        kept["render_allow_errors"] = copy.deepcopy(stage_file["render_allow_errors"])
    if isinstance(stage_file.get("render_checks"), list):
        kept["views"] = copy.deepcopy(stage_file["render_checks"])
    return kept


def plan_stage(route, stage, existing, catalog_name):
    """The two generated files for one stage as (stage dict, route geojson dict)."""
    cfg, entry, points = route["cfg"], stage["data"], stage["points"]
    n = stage["n"]
    slug = stage_slug(cfg, n)
    start, end = points[0], points[-1]
    kept = keep_calibration(existing)

    views = [{"name": f"{p[0]} z{RENDER_ZOOM}", "at": [p[2], p[1], RENDER_ZOOM], "min_features": {}, "min_labels": {}}
             for p in (start, end)]
    for view, old in zip(views, kept["views"]):  # the first two views are always from and to
        if isinstance(old, dict):
            for key in ("min_features", "min_labels"):
                if isinstance(old.get(key), dict):
                    view[key] = old[key]
    views.extend(kept["views"][len(views):])  # views calibration added by hand

    doc = {
        "slug": slug,
        "name": entry["name"],
        "route_slug": cfg["route_slug"],
        "stage_number": n,
        "route_id": cfg["route_id"],
        "stage_id": stage_id(cfg, n),
        "osm_extracts": [route["allow"][ident] for ident in entry["extracts"]],
        "search_bbox": search_bbox(points, cfg["clip_km"] + cfg["margin_km"]),
        "coastal": entry["coastal"],
        "route_name_regex": cfg["route_name_regex"],
    }
    if cfg.get("route_exclude_regex"):
        doc["route_exclude_regex"] = cfg["route_exclude_regex"]
    doc["fallback_route"] = f"{slug}.route.geojson"
    doc["clip_km"] = cfg["clip_km"]
    doc["min_route_km"] = max(MIN_ROUTE_FLOOR_KM, round(MIN_ROUTE_SHARE * polyline_km(points), 1))
    doc["buffer_km"] = cfg["buffer_km"]
    doc["maxzoom"] = cfg["maxzoom"]
    if kept["quality"] is not None:
        doc["quality"] = kept["quality"]
    doc["waypoints"] = [{"name": p[0], "at": [p[2], p[1]]} for p in points]
    doc["render_checks"] = views
    if kept["render_allow_errors"] is not None:
        doc["render_allow_errors"] = kept["render_allow_errors"]
    doc["generated_from"] = f"{catalog_name}/{route['dir'].name}/{stage['file']}"

    geojson = {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "properties": {
                "name": f"{entry['name']}: straight lines through the catalog waypoints",
                "note": "Generated by scripts/make_stages.py from the catalog. A stand-in for the OSM route "
                        "in measurement builds only: a build that used it is never published.",
            },
            "geometry": {"type": "LineString", "coordinates": [[p[2], p[1]] for p in points]},
        }],
    }
    return doc, geojson


def check_bbox(doc, where, report):
    west, south, east, north = doc["search_bbox"]
    for side, size in (("wide", east - west), ("high", north - south)):
        if size >= MAX_BBOX_DEGREES:
            report.error(where, f"the search bbox would be {size:.2f} degrees {side} (limit {MAX_BBOX_DEGREES}): "
                                "the waypoints are too far apart for one stage")


def plan_all(routes, stages_dir, catalog_name, report):
    """{path: text} for every generated file. Problems with existing stage files go to the report."""
    plan = {}
    for route in routes:
        if not route["ok"]:
            continue
        for n, stage in sorted(route["stages"].items()):
            if (route["cfg"]["route_slug"], n) in HAND_WRITTEN:
                continue
            slug = stage_slug(route["cfg"], n)
            stage_path = stages_dir / f"{slug}.json"
            existing = None
            if stage_path.exists():
                existing = load_json(stage_path, f"{stages_dir.name}/{stage_path.name}", report)
                if existing is not None and not isinstance(existing, dict):
                    report.error(f"{stages_dir.name}/{stage_path.name}", "must be a JSON object")
                    existing = None
            doc, geojson = plan_stage(route, stage, existing, catalog_name)
            check_bbox(doc, stage["where"], report)
            plan[stage_path] = dumps(doc)
            plan[stages_dir / doc["fallback_route"]] = dumps(geojson)
    return plan


def find_orphans(stages_dir, planned_paths):
    """Stage files that say they were generated, but whose catalog entry is gone."""
    orphans = []
    for path in sorted(stages_dir.glob("*.json")):
        if path in planned_paths:
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8-sig"))
        except (OSError, ValueError):
            continue
        if isinstance(data, dict) and "generated_from" in data:
            orphans.append((path, data["generated_from"]))
    return orphans


def read_text(path):
    try:
        return path.read_text(encoding="utf-8").replace("\r\n", "\n")
    except FileNotFoundError:
        return None


def run(args):
    report = Report()
    allow = load_allowlist(args.extracts, report)
    routes = read_catalog(args.catalog, allow, report)
    for route in routes:
        route["allow"] = allow
        if route["ok"]:
            check_chain(route, report)
    check_duplicates(routes, report)
    plan = plan_all(routes, args.stages, args.catalog.name, report) if not report.errors else {}

    stages_name = args.stages.name
    orphans = find_orphans(args.stages, set(plan)) if args.stages.is_dir() and not report.errors else []
    for path, source in orphans:
        message = f"was generated from {source}, which is not in the catalog any more: delete it (or restore the catalog entry)"
        (report.errors if args.check else report.warnings).append(f"{stages_name}/{path.name}: {message}")

    for warning in report.warnings:
        print(f"warning: {warning}", file=sys.stderr)
    if report.errors:
        for error in report.errors:
            print(f"ERROR: {error}", file=sys.stderr)
        print(f"make_stages: {len(report.errors)} problem(s); nothing was written", file=sys.stderr)
        return 1

    changed = []
    for path, text in plan.items():
        before = read_text(path)
        if before != text:
            changed.append((path, before, text))

    generated = sum(1 for p in plan if p.suffix == ".json")
    if args.check:
        for path, before, text in changed:
            print(f"ERROR: {stages_name}/{path.name} {'does not exist' if before is None else 'is out of date'}", file=sys.stderr)
            diff = list(difflib.unified_diff((before or "").splitlines(), text.splitlines(), "on disk", "generated", lineterm="", n=1))
            for line in diff[:40]:
                print(f"    {line}", file=sys.stderr)
            if len(diff) > 40:
                print(f"    ... {len(diff) - 40} more diff lines", file=sys.stderr)
        if changed:
            print(f"make_stages: {len(changed)} generated file(s) differ from the catalog. "
                  "Run `npm run stages` in tools/offline-maps and commit the result.", file=sys.stderr)
            return 1
        print(f"make_stages: {generated} generated stage file(s) match the catalog")
        return 0

    args.stages.mkdir(parents=True, exist_ok=True)
    for path, before, text in changed:
        if path.suffix == ".json" and before is not None:
            old = json.loads(before)
            if isinstance(old, dict) and "generated_from" not in old:
                print(f"note: {stages_name}/{path.name} was not generated before: its quality, render floors and "
                      "render_allow_errors were kept, everything else was replaced", file=sys.stderr)
        path.write_text(text, encoding="utf-8", newline="\n")
        print(f"wrote {stages_name}/{path.name}")
    print(f"make_stages: {generated} stage file(s) generated, {len(changed)} file(s) written, "
          f"{len(plan) - len(changed)} unchanged")
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description="Generate the stage files from the catalog.")
    parser.add_argument("--check", action="store_true",
                        help="write nothing; exit 1 if a generated file would change or the catalog is invalid")
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG, help="catalog folder (default: catalog/)")
    parser.add_argument("--stages", type=Path, default=DEFAULT_STAGES, help="where the stage files go (default: stages/)")
    parser.add_argument("--extracts", type=Path, default=DEFAULT_EXTRACTS,
                        help="allowlist of OSM extracts (default: scripts/geofabrik_extracts.json)")
    return run(parser.parse_args(argv))


if __name__ == "__main__":
    sys.exit(main())
