#!/usr/bin/env python3
"""Audit stays, cafes, churches and sites along one route stage.

    python audit.py --stage ../offline-maps/stages/camino-frances-01.json --out out/camino-frances-01
    python audit.py ... --offline          # replay from cache/, no network
    python audit.py ... --ai --ai-limit 15 # add Claude description drafts + photo checks
    python audit.py ... --strict           # CI: any source that failed or was skipped fails the run

Outputs in --out:
    report.md          human summary (what is good, what needs a look)
    review_queue.csv   one row per (place, check), highest priority first, for a human reviewer
    entities.json      every place with sources, findings, score, label, photos, AI drafts
    places.geojson     same places as points, to drop on a map

Exit code: 1 when OpenStreetMap (places or route) failed, because nothing else is worth reading
without it. Overture, Wikidata and Commons failures degrade the run: a warning at the top of
report.md, exit 0, but exit 1 with --strict. The outputs are written either way.
Findings are aggregated per (place, check code), matching data_audit_findings unique (entity_key, code).
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


def load_route(stage: dict, stage_path: Path, cache: sources.Cache) -> tuple[list, str, str | None]:
    """Route line from the OSM route relations. Returns (lines, description, problem).

    problem is None when the OSM relations were used. Otherwise it says why the hand-drawn fallback
    line was used instead: the run goes on (a rough corridor still shows something) but the caller
    must report it and fail, because the corridor filter and every distance depend on this line."""
    problem = None
    try:
        raw = sources.fetch_overpass(cache, sources.overpass_route_query(stage["search_bbox"], stage["route_name_regex"]), "route")
        lines = []
        for rel in raw.get("elements", []):
            for m in rel.get("members", []):
                if m.get("type") == "way" and m.get("geometry"):
                    lines.append([(g["lon"], g["lat"]) for g in m["geometry"]])
        if lines:
            names = sorted({r.get("tags", {}).get("name", "?") for r in raw["elements"]})
            return lines, f"OSM route relations: {'; '.join(names)}", None
        problem = "OSM has no route relation for this stage (the name regex matched nothing)"
    except Exception as e:  # network blocked, mirror down ...
        problem = f"the route request to OSM failed: {e}"
    print(f"route problem: {problem}; using the hand-drawn fallback line")
    fb = json.loads((stage_path.parent / stage["fallback_route"]).read_text())
    return [f["geometry"]["coordinates"] for f in fb["features"]], "hand-drawn fallback line (approximate)", problem


# What each source means for the exit code. OSM is the backbone: without its places or its route
# the report is meaningless, so a failure is an error. The others only add a second opinion.
HARD_SOURCES = {"osm", "route"}


def judge(status: dict[str, str], strict: bool) -> tuple[list[str], list[str]]:
    """(errors, warnings) from the per-source status strings. `strict` turns warnings into errors."""
    errors, warnings = [], []
    for name, text in status.items():
        if name == "ai":  # optional drafts: a problem is shown, never fatal
            if text.startswith(("FAILED", "skipped")):
                warnings.append(f"ai: {text}")
            continue
        if text.startswith("FAILED"):
            msg = f"{name}: {text}"
        elif text == "skipped":
            msg = f"{name}: skipped with --skip"
        elif name == "osm" and text.startswith("ok (0 raw records"):
            msg = "osm: OpenStreetMap returned no places at all"
        else:
            continue
        (errors if name in HARD_SOURCES else warnings).append(msg)
    if strict:  # CI: a degraded run is a failed run (the AI drafts stay optional)
        errors = errors + [w for w in warnings if not w.startswith("ai:")]
        warnings = [w for w in warnings if w.startswith("ai:")]
    return errors, warnings


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--stage", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--cache", type=Path, default=HERE / "cache")
    ap.add_argument("--offline", action="store_true", help="use cached responses only")
    ap.add_argument("--skip", default="", help="comma list of sources to skip: osm,overture,wikidata,commons")
    ap.add_argument("--strict", action="store_true", help="exit 1 when any source failed or was skipped (CI)")
    ap.add_argument("--ai", action="store_true", help="Claude drafts + photo checks (needs ANTHROPIC_API_KEY)")
    ap.add_argument("--ai-limit", type=int, default=15)
    ap.add_argument("--now", help="pretend today is this date (tests)")
    args = ap.parse_args(argv)

    stage = json.loads(args.stage.read_text())
    bbox = stage["search_bbox"]
    skip = {s.strip() for s in args.skip.split(",") if s.strip()}
    now = datetime.fromisoformat(args.now).replace(tzinfo=timezone.utc) if args.now else datetime.now(timezone.utc)
    cache = sources.Cache(args.cache, offline=args.offline)
    status: dict[str, str] = {}

    print(f"Stage {stage['slug']}: {stage['name']}  bbox={bbox}")
    route_lines, route_src, route_problem = load_route(stage, args.stage, cache)
    status["route"] = "ok (OSM route relations)" if route_problem is None else f"FAILED: {route_problem}; used the hand-drawn fallback line"
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

    ov_release: list[str] = []

    def fetch_ov():
        ov_release.append(sources.resolve_overture_release(cache))
        return sources.fetch_overture(cache, bbox, ov_release[0])

    osm_raw = collect("osm", lambda: sources.fetch_overpass(cache, sources.overpass_poi_query(bbox))["elements"])
    ov_raw = collect("overture", fetch_ov)
    wd_raw = collect("wikidata", lambda: sources.fetch_wikidata(cache, bbox))
    if ov_release and status["overture"].startswith("ok"):
        status["overture"] = status["overture"][:-1] + f", release {ov_release[0]})"

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
    ai_failed = 0
    if args.ai:
        if not ai.available():
            status["ai"] = "skipped: no ANTHROPIC_API_KEY or anthropic package"
        else:
            todo = sorted((e for e in entities if e.primary.family in {"worship", "heritage"} and e.by_source("wikidata")),
                          key=lambda e: -(e.by_source("wikidata")[0].tags.get("sitelinks") or 0))
            for e in todo:
                if ai_used + ai_failed >= args.ai_limit:
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
                    ai_failed += 1
                    print(f"ai failed for {e.id}: {ex}")
            status["ai"] = f"ok ({ai_used} places, model {ai.MODEL})" if not ai_failed else \
                f"FAILED for {ai_failed} of {ai_used + ai_failed} places (model {ai.MODEL}): drafts are incomplete"

    errors, warnings = judge(status, args.strict)
    write_outputs(args.out, stage, entities, now, status, route_src, errors=errors, warnings=warnings)
    print(f"wrote {args.out}")
    for m in errors:
        print(f"ERROR: {m}", file=sys.stderr)
    for m in warnings:
        print(f"warning: {m}", file=sys.stderr)
    return 1 if errors else 0


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
        "findings": checks.aggregate_findings(e.findings),  # one per code: see aggregate_findings
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


def corridor_note() -> str:
    """The corridor sentence of report.md, built from BUFFER_M so it cannot drift from the code."""
    by_m: dict[int, list[str]] = {}
    for family, metres in BUFFER_M.items():
        by_m.setdefault(metres, []).append(FAMILY_WORDS[family])
    def join(names):
        return names[0] if len(names) == 1 else ", ".join(names[:-1]) + " and " + names[-1]

    parts = [f"{join(names)} within {metres} m" for metres, names in sorted(by_m.items(), reverse=True)]
    return "- Corridor: only places near the route are audited: " + "; ".join(parts) + "."


FAMILY_WORDS = {"stay": "stays", "food": "cafes and restaurants", "worship": "churches", "heritage": "sites",
                "service": "water and services", "other": "other places"}


def write_outputs(out: Path, stage: dict, entities, now, status, route_src, errors=(), warnings=()) -> None:
    out.mkdir(parents=True, exist_ok=True)
    rows = sorted((entity_json(e, now) for e in entities), key=lambda x: (-x["review_priority"], x["score"]))
    (out / "entities.json").write_text(json.dumps({
        "stage": stage["slug"], "generated_at": now.isoformat(timespec="seconds"),
        "route": route_src, "sources": status, "errors": list(errors), "warnings": list(warnings),
        "entities": rows}, indent=1, ensure_ascii=False, default=str))

    (out / "places.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": {"type": "Point", "coordinates": [r["lon"], r["lat"]]},
         "properties": {"id": r["id"], "name": r["name"], "category": r["category"], "score": r["score"],
                        "findings": len(r["findings"])}} for r in rows]}, ensure_ascii=False))

    with (out / "review_queue.csv").open("w", newline="") as f:
        w = csv.writer(f)
        # One row per (place, code): the same unique key as data_audit_findings. "count" says how many
        # times the check fired for the place (for example 3 sources far away), "message" lists them.
        w.writerow(["priority", "entity_id", "name", "category", "score", "severity", "code", "count", "message",
                    "lat", "lon", "sources", "decision", "reviewer_note"])
        for r in rows:
            for fd in r["findings"]:  # already aggregated and sorted worst first
                if fd["severity"] == "info":
                    continue
                w.writerow([r["review_priority"], r["id"], r["name"] or "", r["category"], r["score"],
                            fd["severity"], fd["code"], fd["count"], fd["message"], r["lat"], r["lon"],
                            "+".join(sorted({s["source"] for s in r["sources"]})), "", ""])

    # ---- markdown report ----
    fam_names = {"stay": "Stays (albergues, hotels ...)", "food": "Cafes, bars, restaurants",
                 "worship": "Churches, chapels, monasteries", "heritage": "Sites and monuments",
                 "service": "Water, pharmacy, ATM ...", "other": "Other"}
    by_fam = Counter(r["family"] for r in rows)
    L = [f"# Place audit: {stage['name']}", "",
         f"Stage `{stage['slug']}` · generated {now:%Y-%m-%d %H:%M} UTC · route: {route_src}", ""]
    if errors:
        L += ["## Run status: FAILED", "",
              "Do not use these results. At least one required source did not deliver:", ""]
        L += [f"- **{m}**" for m in errors]
        L += [f"- warning: {m}" for m in warnings]
        L.append("")
    elif warnings:
        L += ["## Run status: DEGRADED", "",
              "The run finished, but a source is missing, so some checks are weaker than usual:", ""]
        L += [f"- **{m}**" for m in warnings]
        L.append("")
    else:
        L += ["## Run status: OK", "", "Every source answered.", ""]
    L += ["## Sources", "", "| Source | Status |", "|---|---|"]
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
    n_check = sum(r["verification"]["level"] == "data_check" for r in rows)
    L += ["", f"Data check proposed for {n_check} of {len(rows)} places (score {checks.DATA_CHECK_MIN_SCORE}+ and no open high or "
          "medium finding). Every other place stays \"Not verified yet\"."]

    codes = Counter(f["code"] for r in rows for f in r["findings"])
    L += ["", "## Findings by type", "", "| Code | Places | Meaning |", "|---|---|---|"]
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

    good = sorted((r for r in rows if r["family"] in {"stay", "worship", "heritage"} and r["verification"]["level"] == "data_check"),
                  key=lambda x: -x["score"])[:10]
    if good:
        L += ["", "## Looks solid (examples)", "", "| Place | Type | Score | Label | Sources |", "|---|---|---|---|---|"]
        for r in good:
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
          corridor_note()]
    (out / "report.md").write_text("\n".join(L) + "\n")


if __name__ == "__main__":
    raise SystemExit(main())
