#!/usr/bin/env python3
"""Audit stays, cafes, churches and sites along one route stage.

    python audit.py --stage ../offline-maps/stages/camino-frances-01.json --out out/camino-frances-01
    python audit.py ... --offline          # replay from cache/, no network
    python audit.py ... --ai --ai-limit 15 # add Claude description drafts + photo checks

Outputs in --out:
    report.md          human summary (what is good, what needs a look)
    review_queue.csv   one row per finding, highest priority first, for a human reviewer
    entities.json      every place with sources, findings, score, label, photos, AI drafts
    places.geojson     same places as points, to drop on a map
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from poi_audit import ai, checks, sources  # noqa: E402
from poi_audit.conflate import conflate  # noqa: E402
from poi_audit.normalize import Corridor, from_osm, from_overture, from_wikidata  # noqa: E402

BUFFER_M = {"stay": 1500, "food": 1000, "worship": 1000, "heritage": 1000, "service": 500, "other": 500}


def load_route(stage: dict, stage_path: Path, cache: sources.Cache) -> tuple[list, str]:
    """Route line from the OSM route relations; hand-drawn fallback if Overpass fails."""
    try:
        raw = sources.fetch_overpass(cache, sources.overpass_route_query(stage["search_bbox"], stage["route_name_regex"]), "route")
        lines = []
        for rel in raw.get("elements", []):
            for m in rel.get("members", []):
                if m.get("type") == "way" and m.get("geometry"):
                    lines.append([(g["lon"], g["lat"]) for g in m["geometry"]])
        if lines:
            names = sorted({r.get("tags", {}).get("name", "?") for r in raw["elements"]})
            return lines, f"OSM route relations: {'; '.join(names)}"
    except Exception as e:  # network blocked, mirror down ...
        print(f"route from OSM failed ({e}); using fallback line")
    fb = json.loads((stage_path.parent / stage["fallback_route"]).read_text())
    return [f["geometry"]["coordinates"] for f in fb["features"]], "hand-drawn fallback line (approximate)"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--stage", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--cache", type=Path, default=HERE / "cache")
    ap.add_argument("--offline", action="store_true", help="use cached responses only")
    ap.add_argument("--skip", default="", help="comma list of sources to skip: osm,overture,wikidata,commons")
    ap.add_argument("--ai", action="store_true", help="Claude drafts + photo checks (needs ANTHROPIC_API_KEY)")
    ap.add_argument("--ai-limit", type=int, default=15)
    ap.add_argument("--now", help="pretend today is this date (tests)")
    args = ap.parse_args()

    stage = json.loads(args.stage.read_text())
    bbox = stage["search_bbox"]
    skip = {s.strip() for s in args.skip.split(",") if s.strip()}
    now = datetime.fromisoformat(args.now).replace(tzinfo=timezone.utc) if args.now else datetime.now(timezone.utc)
    cache = sources.Cache(args.cache, offline=args.offline)
    status: dict[str, str] = {}

    print(f"Stage {stage['slug']}: {stage['name']}  bbox={bbox}")
    route_lines, route_src = load_route(stage, args.stage, cache)
    corridor = Corridor(route_lines)
    print(f"route: {route_src} ({sum(len(l) for l in route_lines)} points)")

    def collect(name, fn):
        if name in skip:
            status[name] = "skipped"
            return []
        try:
            out = fn()
            status[name] = f"ok ({len(out)} raw records)"
            return out
        except Exception as e:
            status[name] = f"FAILED: {e}"
            print(f"{name} failed: {e}")
            return []

    osm_raw = collect("osm", lambda: sources.fetch_overpass(cache, sources.overpass_poi_query(bbox))["elements"])
    ov_raw = collect("overture", lambda: sources.fetch_overture(cache, bbox))
    wd_raw = collect("wikidata", lambda: sources.fetch_wikidata(cache, bbox))

    osm = [r for r in map(from_osm, osm_raw) if r]
    ov = [r for r in map(from_overture, ov_raw) if r]
    wd = [r for r in map(from_wikidata, wd_raw) if r]

    def near(r):
        return corridor.distance(r.lat, r.lon) <= BUFFER_M[r.family]

    osm, ov, wd = [r for r in osm if near(r)], [r for r in ov if near(r)], [r for r in wd if near(r)]
    print(f"in corridor: osm={len(osm)} overture={len(ov)} wikidata={len(wd)}")

    entities = conflate(osm, wd, ov)
    for e in entities:
        e.distance_to_route_m = round(corridor.distance(e.primary.lat, e.primary.lon))
    checks.run_checks(entities, now, {k for k, v in status.items() if v.startswith("ok")})

    # photos (Commons licence + location), and candidate photos for important places without one
    if "commons" not in skip:
        try:
            files = {f for e in entities for f in checks.photo_candidates(e)}
            info = sources.fetch_commons_info(cache, files)
            for e in entities:
                checks.check_photos(e, info)
            status["commons"] = f"ok ({len(info)} files checked)"
        except Exception as ex:
            status["commons"] = f"FAILED: {ex}"
            print(f"commons failed: {ex}")
    else:
        status["commons"] = "skipped"

    for e in entities:
        e.score = checks.score(e, now)

    # optional AI steps, most important places first
    ai_used = 0
    if args.ai:
        if not ai.available():
            status["ai"] = "skipped: no ANTHROPIC_API_KEY or anthropic package"
        else:
            todo = sorted((e for e in entities if e.primary.family in {"worship", "heritage"} and e.by_source("wikidata")),
                          key=lambda e: -(e.by_source("wikidata")[0].tags.get("sitelinks") or 0))
            for e in todo:
                if ai_used >= args.ai_limit:
                    break
                try:
                    d = ai.draft_description(cache, e)
                    if d:
                        e.ai["description"] = d
                    for ph in [p for p in e.photos if p.get("usable")][:1]:
                        v = ai.check_photo(e, ph)
                        if v:
                            ph["ai_check"] = v
                            if v["verdict"] == "does_not_match":
                                e.findings.append({"code": "PHOTO_AI_MISMATCH", "severity": "medium",
                                                   "message": f"AI thinks the photo shows: {v['shows']}",
                                                   "details": {"file": ph["file"], "reason": v["reason"]}})
                                e.score = checks.score(e, now)
                    ai_used += 1
                except Exception as ex:
                    print(f"ai failed for {e.id}: {ex}")
            status["ai"] = f"ok ({ai_used} places, model {ai.MODEL})"

    write_outputs(args.out, stage, entities, now, status, route_src)
    print(f"wrote {args.out}")
    return 0


# ---------------------------------------------------------------------------
# outputs
# ---------------------------------------------------------------------------
def entity_json(e, now) -> dict:
    return {
        "id": e.id,
        "name": e.name,
        "category": e.primary.category,
        "family": e.primary.family,
        "lat": round(e.primary.lat, 6),
        "lon": round(e.primary.lon, 6),
        "distance_to_route_m": e.distance_to_route_m,
        "sources": [{"source": r.source, "id": r.source_id, "name": r.name, "category": r.category,
                     "lat": round(r.lat, 6), "lon": round(r.lon, 6),
                     "last_edit": r.last_edit.date().isoformat() if r.last_edit else None,
                     "linked_by": e.link_reason.get(r.key, "primary")} for r in e.records],
        "score": e.score,
        "band": checks.band(e.score),
        "verification": checks.verification_label(e, now),
        "findings": e.findings,
        "photos": e.photos,
        "ai": e.ai,
        "review_priority": checks.review_priority(e),
    }


def link(src_id: str) -> str:
    src, _, sid = src_id.partition(":")
    if src == "osm":
        return f"[{sid}](https://www.openstreetmap.org/{sid})"
    if src == "wikidata":
        return f"[{sid}](https://www.wikidata.org/wiki/{sid})"
    return f"overture `{sid[:8]}`"


def write_outputs(out: Path, stage: dict, entities, now, status, route_src) -> None:
    out.mkdir(parents=True, exist_ok=True)
    rows = sorted((entity_json(e, now) for e in entities), key=lambda x: (-x["review_priority"], x["score"]))
    (out / "entities.json").write_text(json.dumps({
        "stage": stage["slug"], "generated_at": now.isoformat(timespec="seconds"),
        "route": route_src, "sources": status, "entities": rows}, indent=1, ensure_ascii=False, default=str))

    (out / "places.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": {"type": "Point", "coordinates": [r["lon"], r["lat"]]},
         "properties": {"id": r["id"], "name": r["name"], "category": r["category"], "score": r["score"],
                        "findings": len(r["findings"])}} for r in rows]}, ensure_ascii=False))

    with (out / "review_queue.csv").open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["priority", "entity_id", "name", "category", "score", "severity", "code", "message",
                    "lat", "lon", "sources", "decision", "reviewer_note"])
        for r in rows:
            for fd in sorted(r["findings"], key=lambda x: -checks.SEVERITY_WEIGHT[x["severity"]]):
                if fd["severity"] == "info":
                    continue
                w.writerow([r["review_priority"], r["id"], r["name"] or "", r["category"], r["score"],
                            fd["severity"], fd["code"], fd["message"], r["lat"], r["lon"],
                            "+".join(sorted({s["source"] for s in r["sources"]})), "", ""])

    # ---- markdown report ----
    fam_names = {"stay": "Stays (albergues, hotels ...)", "food": "Cafes, bars, restaurants",
                 "worship": "Churches, chapels, monasteries", "heritage": "Sites and monuments",
                 "service": "Water, pharmacy, ATM ...", "other": "Other"}
    by_fam = Counter(r["family"] for r in rows)
    L = [f"# Place audit: {stage['name']}", "",
         f"Stage `{stage['slug']}` · generated {now:%Y-%m-%d %H:%M} UTC · route: {route_src}", "",
         "## Sources", "", "| Source | Status |", "|---|---|"]
    L += [f"| {k} | {v} |" for k, v in status.items()]
    L += ["", "## What we found", "",
          "| Group | Places | 2+ sources | Score high / medium / low | With findings |", "|---|---|---|---|---|"]
    for fam in ["stay", "food", "worship", "heritage", "service", "other"]:
        rs = [r for r in rows if r["family"] == fam]
        if not rs:
            continue
        multi = sum(len({s["source"] for s in r["sources"]}) > 1 for r in rs)
        b = Counter(r["band"] for r in rs)
        L.append(f"| {fam_names[fam]} | {len(rs)} | {multi} | {b['high']} / {b['medium']} / {b['low']} | "
                 f"{sum(bool(r['findings']) for r in rs)} |")
    L.append(f"| **All** | **{len(rows)}** | | | |")

    codes = Counter(f["code"] for r in rows for f in r["findings"])
    L += ["", "## Findings by type", "", "| Code | Count | Meaning |", "|---|---|---|"]
    meaning = {
        "CLOSED_SIGNAL": "a source says closed or disused", "DUPLICATE": "two OSM features look like the same place",
        "COORD_DISAGREE": "sources put the place far apart", "NAME_DISAGREE": "linked by id but names differ",
        "CATEGORY_DISAGREE": "sources disagree on what it is", "ONLY_IN_OVERTURE": "missing in OSM, or closed",
        "ONLY_IN_WIKIDATA": "notable place with no OSM feature nearby", "MISSING_FIELDS": "pilgrim-relevant info missing",
        "STALE": "no OSM edit or check_date for 3+ years", "STALE_OVERTURE": "Overture source data 3+ years old",
        "NO_NAME": "no name anywhere", "GENERIC_NAME": "name is just 'Albergue', 'Bar' ...",
        "PHOTO_LICENCE": "photo licence not allowed", "PHOTO_UNKNOWN_LICENCE": "photo not on Commons",
        "PHOTO_FAR": "photo taken far from the place", "PHOTO_MISSING": "linked photo missing",
        "NO_PHOTO": "no open-licence photo yet", "PHOTO_AI_MISMATCH": "AI thinks the photo shows something else",
    }
    L += [f"| `{c}` | {n} | {meaning.get(c, '')} |" for c, n in codes.most_common()]

    L += ["", "## Review first (top 25)", "",
          "| # | Place | Type | Score | Why | Sources |", "|---|---|---|---|---|---|"]
    for i, r in enumerate([r for r in rows if r["review_priority"] > 0][:25], 1):
        worst = sorted(r["findings"], key=lambda x: -checks.SEVERITY_WEIGHT[x["severity"]])[:2]
        why = "; ".join(f"**{f['severity']}** {f['message']}" for f in worst).replace("|", "/")
        srcs = " ".join(link(f"{s['source']}:{s['id']}") for s in r["sources"])
        L.append(f"| {i} | {r['name'] or '(no name)'} | {r['category']} | {r['score']} | {why} | {srcs} |")

    good = [r for r in rows if r["family"] in {"stay", "worship", "heritage"} and r["band"] == "high"][:10]
    if good:
        L += ["", "## Looks solid (examples)", "", "| Place | Type | Score | Label | Sources |", "|---|---|---|---|---|"]
        for r in sorted(good, key=lambda x: -x["score"]):
            srcs = " ".join(link(f"{s['source']}:{s['id']}") for s in r["sources"])
            L.append(f"| {r['name']} | {r['category']} | {r['score']} | {r['verification']['label']} | {srcs} |")

    photos = [p for r in rows for p in r["photos"]]
    if photos:
        lic = Counter(p.get("license") or "unknown" for p in photos)
        L += ["", "## Photos", "",
              f"{len(photos)} linked Commons photos, {sum(p['usable'] for p in photos)} usable "
              "(open licence and taken near the place). Licences: " + ", ".join(f"{k} ({v})" for k, v in lic.most_common()) + "."]

    drafts = [r for r in rows if r["ai"].get("description")]
    if drafts:
        L += ["", "## AI description drafts (need human review)", ""]
        for r in drafts:
            d = r["ai"]["description"]
            L += [f"**{r['name']}** ({r['category']}) · sources: " + ", ".join(d["sources"]), "",
                  f"> {d['description']}", ""]
            if d.get("unsure"):
                L.append("Check: " + "; ".join(d["unsure"]))
                L.append("")
    checked = [p for p in photos if p.get("ai_check")]
    if checked:
        v = Counter(p["ai_check"]["verdict"] for p in checked)
        L += ["", f"AI photo check: {v['matches']} match, {v['does_not_match']} do not match, {v['unsure']} unsure."]

    L += ["", "## Limits", "",
          "- This compares open data sources. It does not visit places: a high score means the sources agree and look recent, "
          "not that an albergue is open, has beds, or is clean. Owners and pilgrim reports stay the ground truth.",
          "- OSM and Overture both miss places, and Overture includes some closed businesses. `ONLY_IN_OVERTURE` is a lead, not a fact.",
          "- AI output (descriptions, photo checks) is a draft for a human and is never published automatically.",
          f"- Corridor: stays within {BUFFER_M['stay']} m of the route, other places within {BUFFER_M['worship']} m."]
    (out / "report.md").write_text("\n".join(L) + "\n")


if __name__ == "__main__":
    raise SystemExit(main())
