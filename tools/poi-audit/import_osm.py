#!/usr/bin/env python3
"""Turn the OpenStreetMap places along one Camino stage into rows for Supabase: stays, pois and the
links to the stage. A dry run is the default and needs no database.

    python import_osm.py --stage ../offline-maps/stages/camino-frances-01.json --out out/import/camino-frances-01
    python import_osm.py ... --offline                    # replay from cache/, no network
    python import_osm.py ... --audit out/camino-frances-01/entities.json    # data_confidence from an audit run
    python import_osm.py ... --apply                      # also send the rows (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    python import_osm.py --stage ... --from-ndjson DIR --apply   # send the files of an earlier dry run, no OSM access
    python import_osm.py --expand-stages 1-3,7            # the stage files a workflow input stands for

Outputs in --out (always, byte-identical when the input is the same): stays.ndjson, pois.ndjson,
stage_stays.ndjson, stage_pois.ndjson (one JSON object per line, database column names), skipped.ndjson
(places that were left out and why), summary.json and summary.md.

Exit code 1: the OSM route or places could not be read, the rows are not valid, or --apply refused or
did not read back what it wrote. Exit code 2: wrong command line.
"""
from __future__ import annotations

import argparse
import itertools
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import audit  # noqa: E402  (load_route and BUFFER_M, exactly as the audit uses them)
from poi_audit import apply as applying  # noqa: E402
from poi_audit import export, route, sources  # noqa: E402
from poi_audit.normalize import from_osm  # noqa: E402

STAGES_DIR = HERE.parent / "offline-maps" / "stages"
STAGE_FILE = "camino-frances-{:02d}.json"
STAGE_SPEC = re.compile(r"[0-9]+(-[0-9]+)?(,[0-9]+(-[0-9]+)?)*")
OLD_DATA_DAYS = 60


class ImportFailed(Exception):
    pass


def expand_stages(spec: str, available: list[int]) -> list[int]:
    """"1-3,7" -> [1, 2, 3, 7]. Only digits, commas and dashes; every number must be a stage that has a file."""
    if not STAGE_SPEC.fullmatch(spec or ""):
        raise ValueError("stages must be numbers, ranges and commas only, like 1-3 or 1,5,9")
    have = set(available)
    chosen: set[int] = set()
    for part in spec.split(","):
        lo, _, hi = part.partition("-")
        first, last = int(lo), int(hi or lo)
        if first > last:
            raise ValueError(f"the range {part} runs backwards")
        # lazily, so that 1-99999999999 is refused at once instead of being counted
        missing = list(itertools.islice((n for n in range(first, last + 1) if n not in have), 5))
        if missing:
            raise ValueError("no stage file for " + ", ".join(map(str, missing)) + f" (stages {min(available)}-{max(available)} exist)")
        chosen.update(range(first, last + 1))
    return sorted(chosen)


def available_stages() -> list[int]:
    found = []
    for p in STAGES_DIR.glob("camino-frances-*.json"):
        m = re.fullmatch(r"camino-frances-([0-9]{2})\.json", p.name)
        if m:
            found.append(int(m.group(1)))
    return sorted(found)


def load_stage(path: Path) -> dict:
    try:
        stage = json.loads(path.read_text(encoding="utf-8"))
        for key in ("slug", "name", "stage_number", "stage_id", "route_id", "search_bbox", "route_name_regex", "fallback_route"):
            stage[key]
        for key in ("stage_id", "route_id"):
            if not export.UUID_OK.match(str(stage[key])):
                raise ValueError(f"{key} is not a uuid")
    except (OSError, ValueError, KeyError, TypeError) as e:
        raise ImportFailed(f"cannot use the stage file {path}: {e}") from None
    return stage


def generate(stage: dict, stage_path: Path, args) -> export.Plan:
    cache = sources.Cache(args.cache, offline=args.offline)
    bbox = stage["search_bbox"]
    print(f"Stage {stage['slug']}: {stage['name']}  bbox={bbox}")

    route_query = sources.overpass_route_query(bbox, stage["route_name_regex"])
    poi_query = sources.overpass_poi_query(bbox)
    both_online = not cache.path("route", route_query).exists() and not cache.path("osm", poi_query).exists()

    lines, route_src, problem = audit.load_route(stage, stage_path, cache)
    if problem:
        raise ImportFailed(f"no OSM route for this stage ({problem}). The hand-drawn fallback line is not good enough to say which "
                           "places belong to the stage, so nothing was imported")
    try:
        start, end = route.stage_ends(stage, stage_path)
        line = route.build_stage_line(lines, start, end)
    except route.RouteError as e:
        raise ImportFailed(f"no line for this stage: {e}") from None
    print(f"route: {route_src}: stage line of {line.length_km:.1f} km ({len(line.points)} points; start {line.start_snap_m:.0f} m and "
          f"end {line.end_snap_m:.0f} m from the stage towns, {line.joined_gaps} gaps joined)")

    if both_online and args.pause > 0:
        print(f"waiting {args.pause:g} s between the two Overpass requests")
        time.sleep(args.pause)
    raw = sources.fetch_overpass(cache, poi_query)
    records = [r for r in map(from_osm, raw.get("elements") or []) if r]
    timestamp = (raw.get("osm3s") or {}).get("timestamp_osm_base")
    print(f"osm: {len(raw.get('elements') or [])} elements, {len(records)} places we know the category of; data of {timestamp or 'unknown date'}")
    try:
        age = (datetime.now(timezone.utc) - datetime.strptime(timestamp, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)).days
    except (TypeError, ValueError):
        age = None
    if age is not None and age > OLD_DATA_DAYS:
        print(f"warning: the Overpass data is {age} days old; another mirror may be fresher", file=sys.stderr)

    info = export.load_audit(args.audit, stage["slug"]) if args.audit else None
    plan = export.build_plan(stage, records, line, audit.BUFFER_M, info)
    plan.meta["route"] = {"source": route_src, "length_km": round(line.length_km, 3), "points": len(line.points),
                          "start_snap_m": round(line.start_snap_m), "end_snap_m": round(line.end_snap_m), "joined_gaps": line.joined_gaps}
    plan.meta["osm_timestamp"] = timestamp
    return plan


def print_plan(plan: export.Plan) -> None:
    s = export.summarize(plan)
    skipped = ", ".join(f"{n} {why}" for why, n in s["skipped"].items()) or "none"
    print(f"rows: {s['rows']['stays']} stays, {s['rows']['pois']} pois; links: {s['rows']['stage_stays']} stage_stays, "
          f"{s['rows']['stage_pois']} stage_pois; skipped: {skipped}; "
          f"outside the corridor: {sum((plan.meta.get('outside_corridor') or {}).values())}")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--stage", type=Path, help="stage file (tools/offline-maps/stages/camino-frances-NN.json)")
    ap.add_argument("--out", type=Path, help="folder for the NDJSON files and the summary")
    ap.add_argument("--cache", type=Path, default=HERE / "cache")
    ap.add_argument("--offline", action="store_true", help="use cached Overpass answers only")
    ap.add_argument("--audit", type=Path, help="entities.json of an audit.py run for the same stage: its score becomes data_confidence "
                                               "and its CLOSED_SIGNAL places are left out")
    ap.add_argument("--pause", type=float, default=10.0, help="seconds to wait between the route and the places request (Overpass etiquette)")
    ap.add_argument("--apply", action="store_true", help="send the rows to Supabase (default: dry run)")
    ap.add_argument("--from-ndjson", type=Path, metavar="DIR", help="use the files of an earlier dry run instead of reading OSM")
    ap.add_argument("--expand-stages", metavar="SPEC", help="print the stage files for e.g. 1-3,7 and exit")
    args = ap.parse_args(argv)

    if args.expand_stages is not None:
        try:
            for n in expand_stages(args.expand_stages, available_stages()):
                print(STAGE_FILE.format(n))
        except ValueError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            return 2
        return 0
    if not args.stage:
        ap.error("--stage is required")
    if args.from_ndjson and (args.audit or args.offline):
        ap.error("--from-ndjson reads rows from files: --audit and --offline only apply when reading OSM")
    if not args.from_ndjson and not args.out:
        ap.error("--out is required")
    out = args.out or args.from_ndjson

    try:
        stage = load_stage(args.stage)
        client = None
        if args.apply:    # fail before the slow part when the secrets are missing
            client = applying.Client.from_env(os.environ)
        if args.from_ndjson:
            plan = export.read_plan(args.from_ndjson, stage)
            print(f"Stage {stage['slug']}: {len(plan.stays)} stays and {len(plan.pois)} pois read from {args.from_ndjson}")
        else:
            plan = generate(stage, args.stage, args)
            export.write_plan(plan, out)
            print_plan(plan)
            print(f"wrote {out}")
        if not args.apply:
            print("dry run: nothing was sent to a database (add --apply to send the rows)")
            return 0
        # What is sent is what the files say: the files are read back and checked once more.
        plan = export.read_plan(out, stage) if not args.from_ndjson else plan
        report = applying.apply_plan(client, plan, print)
        Path(out).mkdir(parents=True, exist_ok=True)
        (Path(out) / "apply_report.json").write_text(json.dumps(report, indent=1) + "\n", encoding="utf-8")
        for problem in report["problems"]:
            print(f"ERROR: {problem}", file=sys.stderr)
        return 0 if report["ok"] else 1
    except (ImportFailed, export.PlanError, export.AuditError, applying.ApplyError) as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1
    except RuntimeError as e:   # sources: offline without a cache, every Overpass mirror failed
        print(f"ERROR: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
