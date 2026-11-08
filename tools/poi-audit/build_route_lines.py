#!/usr/bin/env python3
"""The real line of each Camino stage, from OpenStreetMap, for the Maps tab to draw.

    python build_route_lines.py                                   # stages 1-3 into mobile/assets/map/lines
    python build_route_lines.py --stages 1-3 --out DIR --offline  # replay the Overpass answers in cache/, no network
    python build_route_lines.py --overpass https://overpass.openstreetmap.fr/api/interpreter   # one server of your choice
    python build_route_lines.py --verify                          # only check the files in --out against their manifest

For each stage it does what import_osm.py does to decide which places belong to the stage, and keeps the line: the route
ways of the stage's search box (audit.load_route: the walking-route relations whose name matches the stage file's regex)
are joined into ONE ordered line from the start town to the end town, the shortest way through them
(route.build_stage_line). So the line the map draws is the line the stays and points of interest of the stage were
measured against. Nothing is read from the hand-placed fallback line except the two town coordinates the importer also
uses to find the ends.

The line is then thinned with Douglas-Peucker (--tolerance-m, 5 m): a point is dropped only when it lies within the
tolerance of the line through its neighbours, every point that stays is an OpenStreetMap node (nothing is moved or
rounded) and the first and the last point are never dropped. Where the end of stage N and the start of stage N+1 are the
same town they are made one exact point (a gap up to 50 m is closed with a short connector; more than 200 m is an error).

Outputs in --out (byte-identical when the OSM answers are the same: no clock is written):
    camino-frances-NN.json   a GeoJSON LineString, [longitude, latitude], start town to end town
    manifest.json            per stage: relations the line runs along, OSM data date, points and bytes before and after,
                             length, distance of the ends from the towns, sha256 of the file; and the joins between stages

Exit code 1: the OSM route could not be read, or it does not make a sane line (an end more than 200 m from its town, a
join gap, a length that simplifying changed by more than 3 %), or --verify found a problem. Exit code 2: wrong command line.

Data (c) OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright). The files are a derived database:
show the credit wherever the line is shown, and see "Data from OpenStreetMap: attribution and ODbL" in README.md.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import audit  # noqa: E402  (load_route, exactly as the importer calls it)
import import_osm  # noqa: E402  (load_stage, check_answer, the stage files)
from poi_audit import route, sources  # noqa: E402
from poi_audit.normalize import distance_m  # noqa: E402

GENERATOR = "tools/poi-audit/build_route_lines.py"
GENERATOR_VERSION = 1                     # raise it whenever the same OSM answer would give other files
DEFAULT_OUT = HERE.parent.parent / "mobile" / "assets" / "map" / "lines"
FILE = "camino-frances-{:02d}.json"
MANIFEST = "manifest.json"
LICENCE = "Data (c) OpenStreetMap contributors, ODbL 1.0, https://www.openstreetmap.org/copyright"
FORMAT = "One GeoJSON LineString per stage, [longitude, latitude] in WGS 84, from the start town to the end town of the stage."

DEFAULT_TOLERANCE_M = 5.0
MAX_END_SNAP_M = 200.0        # the first / last point of a line may be this far from its start / end town
EXACT_JOIN_M = 50.0           # the end of stage N and the start of N+1 this close are made one point
MAX_JOIN_GAP_M = 200.0        # further apart than this, the two lines are not at the same town
MAX_LENGTH_CHANGE = 0.03      # thinning may not change the length of a line by more than this
MIN_RELATION_SHARE = 0.01     # a relation is listed when this much of the line runs along its ways
LNG_LAT_BOX = (-180.0, -90.0, 180.0, 90.0)


class LineError(Exception):
    """The OSM route does not make a sane stage line (or the files are not what the manifest says). The message says why."""


@dataclass
class StageLineResult:
    number: int
    slug: str
    name: str
    full: list                       # every point of the importer's stage line, (lon, lat)
    points: list                     # what is kept: thinned, and joined to the stage before
    start_snap_m: float
    end_snap_m: float
    mapping_gaps_joined: int         # gaps of up to 50 m between OSM ways that build_stage_line closed
    relations: list                  # [{"id", "name", "share"}] the relations the line runs along, biggest share first
    osm_timestamp: str | None
    joined_to_previous_m: float | None = None
    file_bytes: bytes = field(default=b"", repr=False)


# ---------------------------------------------------------------------------
# thinning
# ---------------------------------------------------------------------------
def simplify(points, tolerance_m: float) -> list:
    """Douglas-Peucker on (lon, lat) points: the first and the last point stay, and so does every point that lies more than
    `tolerance_m` metres from the line through the points kept around it. Only original points are returned, in order.
    Distances are measured on a flat projection of the line (the same sphere as route.StageLine, cos(latitude) taken at
    the line's mean latitude), which is exact enough for a line that is a few tens of kilometres long."""
    n = len(points)
    if n <= 2 or tolerance_m <= 0:
        return list(points)
    kx = route.M_PER_DEG * math.cos(math.radians(sum(p[1] for p in points) / n))
    xy = [(p[0] * kx, p[1] * route.M_PER_DEG) for p in points]
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]                                  # no recursion: a line can have thousands of points
    while stack:
        a, b = stack.pop()
        if b - a < 2:
            continue
        ax, ay = xy[a]
        dx, dy = xy[b][0] - ax, xy[b][1] - ay
        ll = dx * dx + dy * dy
        far, far_d = -1, tolerance_m
        for i in range(a + 1, b):
            px, py = xy[i][0] - ax, xy[i][1] - ay
            t = 0.0 if ll == 0 else max(0.0, min(1.0, (px * dx + py * dy) / ll))
            d = math.hypot(px - t * dx, py - t * dy)
            if d > far_d:
                far, far_d = i, d
        if far >= 0:
            keep[far] = True
            stack.append((a, far))
            stack.append((far, b))
    return [p for p, k in zip(points, keep) if k]


def length_km(points) -> float:
    """Length measured as import_osm.py reports it (route.StageLine), so the numbers can be put side by side."""
    return route.StageLine(points).length_km


def linestring_bytes(points) -> bytes:
    """The file of one stage: a GeoJSON LineString on one line, UTF-8, with the final newline."""
    doc = {"type": "LineString", "coordinates": [[lon, lat] for lon, lat in points]}
    return (json.dumps(doc, separators=(",", ":")) + "\n").encode("utf-8")


# ---------------------------------------------------------------------------
# one stage, the way the importer reads it
# ---------------------------------------------------------------------------
def _node_key(lon: float, lat: float) -> tuple[int, int]:
    return round(lon * route.NODE_KEY), round(lat * route.NODE_KEY)       # as route.py: the same OSM node, the same key


def relation_shares(raw: dict, points) -> list:
    """The relations of the Overpass answer that the line runs along: which share of the line's points is a node of one of
    the relation's ways. The relations are long (the one that holds stage 1 runs on to Logroño) and the search box takes in
    variants, so this says which of them the line is really made of. Relations under MIN_RELATION_SHARE are left out."""
    on_line = {_node_key(lon, lat) for lon, lat in points}
    out = []
    for rel in raw.get("elements") or []:
        if rel.get("type") != "relation":
            continue
        nodes = {_node_key(g["lon"], g["lat"]) for m in rel.get("members") or [] if m.get("type") == "way" for g in m.get("geometry") or []}
        share = len(on_line & nodes) / len(on_line)
        if share >= MIN_RELATION_SHARE:
            out.append({"id": rel["id"], "name": (rel.get("tags") or {}).get("name"), "share": round(share, 3)})
    return sorted(out, key=lambda r: (-r["share"], r["id"]))


def build_stage(stage_path: Path, cache: sources.Cache, tolerance_m: float, max_snap_m: float = MAX_END_SNAP_M) -> StageLineResult:
    """The stage line of import_osm.generate (audit.load_route, then route.build_stage_line between the two towns of the
    stage file), thinned. Raises LineError when OSM gives no route, or a line that is not the stage."""
    stage = import_osm.load_stage(stage_path)
    n = stage["stage_number"]
    lines, _, problem = audit.load_route(stage, stage_path, cache)
    if problem:
        raise LineError(f"stage {n}: no OSM route ({problem}). The hand-drawn fallback line is not what this tool is for")
    raw = sources.fetch_overpass(cache, sources.overpass_route_query(stage["search_bbox"], stage["route_name_regex"]), "route")
    try:
        import_osm.check_answer(raw, "route", need_elements=True)
        start, end = route.stage_ends(stage, stage_path)
        line = route.build_stage_line(lines, start, end)
    except (import_osm.ImportFailed, route.RouteError) as e:
        raise LineError(f"stage {n}: {e}") from None
    for what, snap in (("start", line.start_snap_m), ("end", line.end_snap_m)):
        if snap > max_snap_m:
            raise LineError(f"stage {n}: the {what} of the OSM line is {snap:.0f} m from the {what} town (limit {max_snap_m:.0f} m)")
    full = list(line.points)
    kept = simplify(full, tolerance_m)
    before, after = line.length_km, length_km(kept)
    if abs(after - before) > MAX_LENGTH_CHANGE * before:
        raise LineError(f"stage {n}: thinning with {tolerance_m:g} m changed the length from {before:.2f} to {after:.2f} km (limit {MAX_LENGTH_CHANGE:.0%})")
    return StageLineResult(
        number=n, slug=stage["slug"], name=stage["name"], full=full, points=kept,
        start_snap_m=line.start_snap_m, end_snap_m=line.end_snap_m, mapping_gaps_joined=line.joined_gaps,
        relations=relation_shares(raw, full), osm_timestamp=(raw.get("osm3s") or {}).get("timestamp_osm_base"),
    )


# ---------------------------------------------------------------------------
# the joins between stages, the files, the manifest
# ---------------------------------------------------------------------------
def join_stages(results: list[StageLineResult]) -> list[dict]:
    """Stage N+1 starts where stage N ends. Both are measured from the same town, so the importer's lines meet at the same OSM
    node and nothing changes; when they do not (another town coordinate, another node) a gap up to EXACT_JOIN_M is closed by
    putting the end of stage N in front of stage N+1 (every OSM point stays, a short connector is added), a gap up to
    MAX_JOIN_GAP_M is left and reported, and a bigger one is an error. Only neighbouring stage numbers are joined."""
    report = []
    for a, b in zip(results, results[1:]):
        if b.number != a.number + 1:
            continue
        end, start = a.points[-1], b.points[0]
        gap = distance_m(end[1], end[0], start[1], start[0])
        if gap > MAX_JOIN_GAP_M:
            raise LineError(f"stage {a.number} ends {gap:.0f} m from where stage {b.number} starts (limit {MAX_JOIN_GAP_M:.0f} m): they are not at the same town")
        closed = gap <= EXACT_JOIN_M
        if 0 < gap and closed:
            b.points = [end] + b.points
            b.joined_to_previous_m = round(gap, 1)
        report.append({"from": a.number, "to": b.number, "gap_m": round(gap, 1), "closed": closed})
    return report


def manifest_document(results: list[StageLineResult], joins: list[dict], tolerance_m: float) -> dict:
    stamps = [r.osm_timestamp for r in results if r.osm_timestamp]
    stages = []
    for r in results:
        entry = {
            "stage": r.number,
            "slug": r.slug,
            "name": r.name,
            "file": FILE.format(r.number),
            "osm_timestamp": r.osm_timestamp,
            "relations": r.relations,
            "start": list(r.points[0]),
            "end": list(r.points[-1]),
            "start_snap_m": round(r.start_snap_m),
            "end_snap_m": round(r.end_snap_m),
            "mapping_gaps_joined": r.mapping_gaps_joined,
            "length_km_full": round(length_km(r.full), 3),
            "length_km": round(length_km(r.points), 3),
            "points_full": len(r.full),
            "points": len(r.points),
            "bytes_full": len(linestring_bytes(r.full)),
            "bytes": len(r.file_bytes),
            "sha256": hashlib.sha256(r.file_bytes).hexdigest(),
        }
        if r.joined_to_previous_m is not None:
            entry["joined_to_previous_m"] = r.joined_to_previous_m
        stages.append(entry)
    return {
        "generator": GENERATOR,
        "generator_version": GENERATOR_VERSION,
        "format": FORMAT,
        "licence": LICENCE,
        "osm_timestamp": min(stamps) if stamps else None,       # the oldest of the stages: the data is at least this new
        "tolerance_m": tolerance_m,
        "stages": stages,
        "joins": joins,
    }


def manifest_bytes(doc) -> bytes:
    """The manifest as JSON that is easy to read in a review: one field per line, but a position, a relation or a join on
    one line each (indent=1 would put every number of every position on a line of its own)."""
    def dump(v, depth=0) -> str:
        if not isinstance(v, (dict, list)):
            return json.dumps(v, ensure_ascii=False)
        is_dict = isinstance(v, dict)
        children = list(v.values()) if is_dict else v
        parts = [f"{json.dumps(k)}: {dump(x, depth + 1)}" for k, x in v.items()] if is_dict else [dump(x, depth + 1) for x in v]
        opening, closing = ("{", "}") if is_dict else ("[", "]")
        if not any(isinstance(x, (dict, list)) for x in children):
            return opening + ", ".join(parts) + closing
        pad = " " * (depth + 1)
        return opening + "\n" + ",\n".join(pad + p for p in parts) + "\n" + " " * depth + closing
    return (dump(doc) + "\n").encode("utf-8")


def generate(stage_paths: list[Path], cache: sources.Cache, tolerance_m: float = DEFAULT_TOLERANCE_M,
             max_snap_m: float = MAX_END_SNAP_M) -> tuple[dict[str, bytes], list[StageLineResult], list[dict], dict]:
    """(files, results, joins, manifest): the bytes of every file for --out, keyed by file name."""
    results = [build_stage(p, cache, tolerance_m, max_snap_m) for p in stage_paths]
    results.sort(key=lambda r: r.number)
    if len({r.number for r in results}) != len(results):
        raise LineError("two stage files for the same stage number")
    joins = join_stages(results)
    files: dict[str, bytes] = {}
    for r in results:
        r.file_bytes = linestring_bytes(r.points)
        files[FILE.format(r.number)] = r.file_bytes
    manifest = manifest_document(results, joins, tolerance_m)
    files[MANIFEST] = manifest_bytes(manifest)
    return files, results, joins, manifest


def write_files(files: dict[str, bytes], out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    for name, data in files.items():
        (out / name).write_bytes(data)


# ---------------------------------------------------------------------------
# checking the files that are in the app
# ---------------------------------------------------------------------------
def read_line(data: bytes) -> list:
    """The (lon, lat) points of one stage file; raises LineError when it is not a LineString of at least two real positions."""
    try:
        doc = json.loads(data.decode("utf-8"))
        if doc["type"] != "LineString":
            raise ValueError(f"type is {doc['type']!r}, not LineString")
        pts = [(p[0], p[1]) for p in doc["coordinates"]]
        if len(pts) < 2:
            raise ValueError("fewer than two points")
        w, s, e, n = LNG_LAT_BOX
        for lon, lat in pts:
            if isinstance(lon, bool) or isinstance(lat, bool) or not all(isinstance(v, (int, float)) and math.isfinite(v) for v in (lon, lat)):
                raise ValueError("a position that is not a pair of numbers")
            if not (w <= lon <= e and s <= lat <= n):
                raise ValueError(f"the position {lon}, {lat} is not on Earth: longitude and latitude swapped?")
    except (ValueError, KeyError, TypeError, IndexError) as e:
        raise LineError(str(e)) from None
    return pts


def verify(out: Path) -> list[str]:
    """What is wrong with the files in `out`, as sentences (empty when they are what the manifest says): every stage file
    exists and has the sha256, the bytes, the number of points and the ends the manifest records, the lines of neighbouring
    stages meet (a gap of up to 50 m would have been closed, one of more than 200 m is another town), and no line file is
    left over that the manifest does not list."""
    problems: list[str] = []
    try:
        manifest = json.loads((Path(out) / MANIFEST).read_text(encoding="utf-8"))
        entries = [e for e in manifest["stages"] if isinstance(e, dict)]
    except (OSError, ValueError, KeyError, TypeError) as e:
        return [f"cannot read {MANIFEST} in {out}: {e}"]
    listed = set()
    lines: dict[int, list] = {}
    for entry in entries:
        name = entry.get("file")
        listed.add(name)
        try:
            data = (Path(out) / name).read_bytes()
        except (OSError, TypeError) as e:
            problems.append(f"{name}: cannot be read ({e})")
            continue
        if hashlib.sha256(data).hexdigest() != entry.get("sha256"):
            problems.append(f"{name}: sha256 is not the one in the manifest (edited by hand? run build_route_lines.py again)")
        if entry.get("bytes") != len(data):
            problems.append(f"{name}: {len(data)} bytes, the manifest says {entry.get('bytes')}")
        try:
            pts = read_line(data)
        except LineError as e:
            problems.append(f"{name}: {e}")
            continue
        lines[entry.get("stage")] = pts
        if len(pts) != entry.get("points"):
            problems.append(f"{name}: {len(pts)} points, the manifest says {entry.get('points')}")
        if list(pts[0]) != entry.get("start") or list(pts[-1]) != entry.get("end"):
            problems.append(f"{name}: the first or the last point is not the start / end in the manifest")
    numbers = sorted(n for n in lines if isinstance(n, int))
    for a, b in zip(numbers, numbers[1:]):
        if b != a + 1:
            continue
        gap = distance_m(lines[a][-1][1], lines[a][-1][0], lines[b][0][1], lines[b][0][0])
        if 0 < gap <= EXACT_JOIN_M:
            problems.append(f"stage {a} ends {gap:.1f} m from where stage {b} starts: a gap this small is closed by the generator")
        elif gap > MAX_JOIN_GAP_M:
            problems.append(f"stage {a} ends {gap:.0f} m from where stage {b} starts (limit {MAX_JOIN_GAP_M:.0f} m): not the same town")
    left_over = sorted(p.name for p in Path(out).glob("camino-frances-*.json") if p.name not in listed)
    if left_over:
        problems.append("not in the manifest: " + ", ".join(left_over))
    return problems


# ---------------------------------------------------------------------------
# command line
# ---------------------------------------------------------------------------
def stage_numbers_in(stages_dir: Path) -> list[int]:
    return sorted(int(m.group(1)) for p in Path(stages_dir).glob("camino-frances-*.json") if (m := re.fullmatch(r"camino-frances-([0-9]{2})\.json", p.name)))


def data_age_days(timestamp: str | None, now: datetime | None = None) -> int | None:
    """Days between an Overpass `timestamp_osm_base` and now, or None when there is no readable timestamp."""
    try:
        then = datetime.strptime(timestamp, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None
    return ((now or datetime.now(timezone.utc)) - then).days


def describe(r: StageLineResult) -> str:
    rels = ", ".join(f"{x['id']} {x['name']} {x['share']:.0%}" for x in r.relations) or "none"
    return (f"stage {r.number} {r.slug}: {len(r.full)} -> {len(r.points)} points, {len(linestring_bytes(r.full))} -> {len(r.file_bytes)} bytes, "
            f"{length_km(r.full):.3f} -> {length_km(r.points):.3f} km; start {r.start_snap_m:.0f} m and end {r.end_snap_m:.0f} m from the towns, "
            f"{r.mapping_gaps_joined} mapping gaps closed; OSM data of {r.osm_timestamp}; relations: {rels}")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--stages", default="1-3", metavar="SPEC", help="stage numbers, like 1-3 or 1,5,9 (default 1-3)")
    ap.add_argument("--stages-dir", type=Path, default=import_osm.STAGES_DIR, help="where camino-frances-NN.json are (default tools/offline-maps/stages)")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT, help="folder for the line files and the manifest (default mobile/assets/map/lines)")
    ap.add_argument("--cache", type=Path, default=HERE / "cache", help="the Overpass answers (the importer's cache: the same route request is reused)")
    ap.add_argument("--offline", action="store_true", help="use cached Overpass answers only")
    ap.add_argument("--overpass", action="append", metavar="URL", help="ask this Overpass server (repeat to try several) instead of the mirrors in poi_audit/sources.py")
    ap.add_argument("--tolerance-m", type=float, default=DEFAULT_TOLERANCE_M, help="Douglas-Peucker tolerance in metres (default 5)")
    ap.add_argument("--verify", action="store_true", help="only check the files in --out against their manifest, and exit")
    args = ap.parse_args(argv)

    if args.verify:
        problems = verify(args.out)
        for p in problems:
            print(f"ERROR: {p}", file=sys.stderr)
        print(f"{args.out}: {'ok' if not problems else str(len(problems)) + ' problem(s)'}")
        return 1 if problems else 0
    if not (0 <= args.tolerance_m <= 50):
        ap.error("--tolerance-m must be between 0 and 50")
    try:
        numbers = import_osm.expand_stages(args.stages, stage_numbers_in(args.stages_dir))
    except ValueError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 2
    if args.overpass:
        sources.OVERPASS_URLS = list(args.overpass)           # fetch_overpass reads the list when it is called
    try:
        cache = sources.Cache(args.cache, offline=args.offline)
        files, results, joins, manifest = generate([Path(args.stages_dir) / FILE.format(n) for n in numbers], cache, args.tolerance_m)
    except (LineError, import_osm.ImportFailed, RuntimeError) as e:     # RuntimeError: every Overpass mirror failed
        print(f"ERROR: {e}", file=sys.stderr)
        return 1
    for r in results:
        print(describe(r))
        age = data_age_days(r.osm_timestamp)
        if age is not None and age > import_osm.OLD_DATA_DAYS:
            print(f"warning: the Overpass data of stage {r.number} is {age} days old; another mirror may be fresher (--overpass URL)", file=sys.stderr)
    for j in joins:
        print(f"join {j['from']} -> {j['to']}: {j['gap_m']} m" + ("" if j["gap_m"] == 0 else " (closed)" if j["closed"] else " (NOT closed: more than 50 m)"))
    write_files(files, args.out)
    total = sum(len(v) for v in files.values())
    print(f"wrote {len(files)} files, {total} bytes, to {args.out} (OSM data of {manifest['osm_timestamp']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
