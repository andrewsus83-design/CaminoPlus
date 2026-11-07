"""What the Navarra open data adds to OpenStreetMap along a route, measured.

Pure functions over the records of ``opendata_navarra`` and of ``normalize.from_osm``, plus a command line
that REPLAYS caches. It never asks Overpass or any other server for OSM: point ``--osm-cache`` at a cache
that ``audit.py`` already wrote (the stage-1 pilot one, for example).

    python -m poi_audit.navarra_compare --stage ../offline-maps/stages/camino-frances-01.json \\
        --osm-cache /path/to/osm-pilot/cache --cache cache

Matching an albergue of the registry with an OSM place cannot use distance: the registry has no
coordinates. ``match_lodgings`` uses, in this order:

1. the address: the same postcode, the same street words (street types such as calle / kalea / carretera
   are ignored) and, when both sides have one, a shared house number; a match on street and postcode
   alone counts only when it is the only candidate;
2. the name, with ``normalize.name_similarity`` (which ignores "albergue", "de", "municipal" ...) when OSM's
   own postcode or town agrees with the registry's, or OSM has neither. A registry name that is only the
   village ("Albergue de Roncesvalles") has nothing in it that tells two places of that village apart, so for
   such rows a name match counts only when OSM's name says albergue / aterpe / refugio itself and it is the
   only one.

The OSM place then supplies the position. Fountains do have positions and are matched by distance.
"""
from __future__ import annotations

import argparse
import json
import re
import statistics
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

from . import opendata_navarra as nav
from . import sources
from .normalize import ALBERGUE_RX, Corridor, Record, distance_m, fold, from_osm, name_similarity, name_tokens
from .utm import utm_to_wgs84

NAME_MATCH = 0.6          # the threshold conflate.py uses for Wikidata (Overture uses 0.55)
STAY_BUFFER_M = 1500      # the same corridors as audit.BUFFER_M (a test keeps them equal)
SERVICE_BUFFER_M = 500
STAGE1_NAVARRA_MAX_LAT = 43.098  # on stage 1 every French place is north of this (>= 43.1014), every Navarra one south (<= 43.0953)
FOUNTAIN_RADII_M = (25, 100)
WATER_CATEGORIES = {"water", "fountain"}

STREET_WORDS = {"calle", "c", "kalea", "karrika", "plaza", "pza", "plz", "avenida", "avda", "av", "paseo", "pso", "travesia",
                "camino", "carretera", "ctra", "bidea", "auzunea", "etorbidea", "barrio", "bo"}
STREET_FILLER = {"de", "del", "la", "las", "el", "los", "y", "s", "n", "sn", "bajo", "bis"}

# Where the Camino Frances goes through the villages of the registry, by stage of this repo (the stage that
# ENDS in a town is the one it is counted in). From the stage names and the route, not from geometry (the
# registry has no coordinates): approximate. Spelled as the registry's LOCALIDAD column.
STAGE_LOCALITIES: dict[int, tuple[str, ...]] = {
    1: ("Luzaide / Valcarlos", "Orreaga / Roncesvalles"),
    2: ("Auritz / Burguete", "Aurizberri / Espinal", "Bizkarreta-Gerendiain", "Zubiri"),
    3: ("Larrasoaña", "Zuriain", "Urdaitz / Urdániz", "Arre", "Villava / Atarrabia", "Huarte / Uharte", "Pamplona / Iruña"),
    4: ("Zariquiegui", "Uterga", "Muruzábal", "Obanos", "Puente la Reina / Gares"),
    5: ("Mañeru", "Cirauqui / Zirauki", "Lorca / Lorka", "Villatuerta", "Estella-Lizarra"),
    6: ("Ayegui / Aiegi", "Villamayor de Monjardín", "Luquin", "Los Arcos"),
    7: ("Sansol", "Torres del Río", "Viana"),
}
_STAGE_OF_LOCALITY = {fold(loc): stage for stage, locs in STAGE_LOCALITIES.items() for loc in locs}


# ---------------------------------------------------------------------------
# matching registry rows with OSM places
# ---------------------------------------------------------------------------
def street_tokens(text: str | None) -> frozenset[str]:
    return frozenset(t for t in fold(text or "").split() if t not in STREET_WORDS and t not in STREET_FILLER and not t.isdigit())


def _ints(text: str | None) -> set[int]:
    return {int(n) for n in re.findall(r"\d+", text or "")} - {0}


def address_match(lodging: nav.Lodging, osm: Record) -> str | None:
    """'address' (street, postcode and a house number agree), 'address (no number)' (street and postcode agree and
    one side has no number) or None."""
    pc, street = lodging.tags.get("postcode"), street_tokens(lodging.tags.get("street"))
    o_pc, o_street = (osm.tags.get("addr:postcode") or "").strip(), street_tokens(osm.tags.get("addr:street"))
    if not (pc and street and o_pc and o_street) or pc != o_pc or street != o_street:
        return None
    a, b = _ints(lodging.tags.get("housenumber")), _ints(osm.tags.get("addr:housenumber"))
    if a and b:
        return "address" if a & b else None
    return "address (no number)"


def locality_tokens(lodging: nav.Lodging) -> set[str]:
    return {t for v in (lodging.tags.get("locality"), lodging.tags.get("municipality")) for t in fold(v or "").split() if len(t) > 2}


def village_only(lodging: nav.Lodging) -> bool:
    """True when the registry name has nothing in it but the village ("Albergue de Roncesvalles")."""
    return not (name_tokens(lodging.name) - locality_tokens(lodging))


def name_match(lodging: nav.Lodging, osm: Record) -> float | None:
    """The name similarity when it reaches NAME_MATCH and OSM's postcode or town does not contradict the registry's."""
    score = name_similarity(lodging.name, osm.name)
    if score < NAME_MATCH:
        return None
    o_pc, o_city = (osm.tags.get("addr:postcode") or "").strip(), osm.tags.get("addr:city")
    if o_pc and lodging.tags.get("postcode"):
        return score if o_pc == lodging.tags["postcode"] else None
    if o_city:
        return score if locality_tokens(lodging) & {t for t in fold(o_city).split() if len(t) > 2} else None
    return score


@dataclass
class Match:
    lodging: nav.Lodging
    osm: Record | None = None
    how: str = "none"          # address | address (no number) | name | none
    name_score: float = 0.0
    others: list[Record] = field(default_factory=list)  # more OSM places that fit the same row: duplicates in OSM

    @property
    def osm_beds(self) -> int | None:
        if not self.osm:
            return None
        nums = [int(v) for k in ("beds", "capacity", "capacity:persons") if (v := self.osm.tags.get(k)) and str(v).isdigit()]
        return nums[0] if nums else None


def match_lodgings(lodgings: Iterable[nav.Lodging], osm_records: Iterable[Record]) -> list[Match]:
    stays = [r for r in osm_records if r.family == "stay"]
    out = []
    for l in lodgings:
        addr = [(r, how) for r in stays if (how := address_match(l, r))]
        numbered = [x for x in addr if x[1] == "address"]
        loose = [x for x in addr if x[1] != "address"]
        by_address = numbered or (loose if len(loose) == 1 else [])
        only_village = village_only(l)
        by_name = [(r, s) for r in stays if (s := name_match(l, r)) is not None and (not only_village or ALBERGUE_RX.search(r.name or ""))]
        if only_village and len(by_name) != 1:
            by_name = []  # a name that is only the village cannot tell two places of that village apart
        scores = {id(r): s for r, s in by_name}
        if by_address:
            best, how = max(by_address, key=lambda x: scores.get(id(x[0]), 0.0))
        elif by_name:
            (best, _), how = max(by_name, key=lambda x: x[1]), "name"
        else:
            out.append(Match(l))
            continue
        fits = {id(r): r for r, _ in by_address} | {id(r): r for r, _ in by_name}
        out.append(Match(l, best, how, round(scores.get(id(best), name_similarity(l.name, best.name)), 3),
                         [r for k, r in fits.items() if k != id(best)]))
    return out


def albergue_like(r: Record) -> bool:
    return r.category.startswith("albergue_") or r.category == "hostel"


# ---------------------------------------------------------------------------
# selections and counts
# ---------------------------------------------------------------------------
def osm_along_route(records: Iterable[Record], corridor: Corridor, max_lat: float | None = None) -> tuple[list[Record], list[Record]]:
    """(stays, water and fountain points) near the route, with the audit's corridor widths."""
    stays, water = [], []
    for r in records:
        if max_lat is not None and r.lat >= max_lat:
            continue
        if r.family == "stay" and corridor.distance(r.lat, r.lon) <= STAY_BUFFER_M:
            stays.append(r)
        elif r.category in WATER_CATEGORIES and corridor.distance(r.lat, r.lon) <= SERVICE_BUFFER_M:
            water.append(r)
    return stays, water


def stage_of(lodging: nav.Lodging) -> int | None:
    return _STAGE_OF_LOCALITY.get(fold(lodging.tags.get("locality") or ""))


def field_counts(lodgings: list[nav.Lodging]) -> dict[str, int]:
    return {"lodgings": len(lodgings),
            "with_capacity": sum(l.tags.get("capacity") is not None for l in lodgings),
            "beds": sum(l.tags.get("capacity") or 0 for l in lodgings),
            "with_phone": sum(bool(l.tags.get("phone")) for l in lodgings),
            "with_email": sum(bool(l.tags.get("email")) for l in lodgings),
            "with_website": sum(bool(l.tags.get("website")) for l in lodgings),
            "contact_withheld": sum(bool(l.tags.get("contact_withheld")) for l in lodgings),
            "on_camino": sum(bool(l.tags.get("on_camino")) for l in lodgings)}


def stage_table(data: nav.NavarraData, stages: Iterable[int] = range(1, 8)) -> list[dict]:
    rows = []
    for s in stages:
        lodgings = [l for l in data.lodgings if stage_of(l) == s]
        # by the table's stage code (F1 ... F7), whatever variant of the Camino the row is filed under:
        # stage 1 has the Valcarlos and the Lepoeder (Napoleon) waymarks, stage 6 the Zaraputz ones
        fountains = [r for r in data.fountains if r.tags.get("stage") == f"F{s}"]
        waymarks = [w for w in data.waymarks if w.stage == f"F{s}"]
        per_town = Counter(l.tags["locality"] for l in lodgings)
        rows.append({"stage": s, "localities": dict(per_town), **field_counts(lodgings),
                     "fountains": len(fountains), "waymarks": len(waymarks)})
    return rows


def unassigned_localities(data: nav.NavarraData) -> dict[str, int]:
    """Registry villages that no Frances stage claims: other branches, Pyrenean valleys, the Ribera ..."""
    return dict(Counter(l.tags.get("locality") for l in data.lodgings if stage_of(l) is None).most_common())


# ---------------------------------------------------------------------------
# fountains
# ---------------------------------------------------------------------------
def match_fountains(official: list[Record], osm_water: list[Record]) -> list[dict]:
    """For every official fountain, the nearest OSM water / fountain point and its distance (None when OSM has none)."""
    rows = []
    for f in official:
        best = min(osm_water, key=lambda r: distance_m(f.lat, f.lon, r.lat, r.lon), default=None)
        rows.append({"fountain": f, "osm": best, "distance_m": None if best is None else distance_m(f.lat, f.lon, best.lat, best.lon)})
    return rows


def fountain_summary(rows: list[dict], osm_water: list[Record], radii: tuple[int, ...] = FOUNTAIN_RADII_M) -> dict:
    out: dict = {"official": len(rows), "osm_points": len(osm_water)}
    for radius in radii:
        out[f"official_with_osm_within_{radius}m"] = sum(r["distance_m"] is not None and r["distance_m"] <= radius for r in rows)
        out[f"osm_with_official_within_{radius}m"] = sum(
            any(distance_m(w.lat, w.lon, r["fountain"].lat, r["fountain"].lon) <= radius for r in rows) for w in osm_water)
    return out


# ---------------------------------------------------------------------------
# geometry checks with the waymarks
# ---------------------------------------------------------------------------
def distances_to_route(points: Iterable[tuple[float, float]], corridor: Corridor) -> list[float]:
    return sorted(corridor.distance(lat, lon) for lat, lon in points)


def describe(distances: list[float]) -> dict:
    n = len(distances)
    if not n:
        return {"n": 0}
    return {"n": n, "median_m": round(statistics.median(distances), 1), "p90_m": round(distances[min(n - 1, int(n * 0.9))], 1),
            "max_m": round(distances[-1]), "within_30m": sum(d <= 30 for d in distances), "within_100m": sum(d <= 100 for d in distances)}


def crs_evidence(waymarks: Iterable[nav.Waymark], corridor: Corridor, candidates: tuple[str, ...] = ("EPSG:23030", "EPSG:25830")) -> dict:
    """How far the waymarks are from a route that has nothing to do with them (the OSM route), when their published
    numbers are read in each candidate system. The right datum puts them on the way: a median of a few metres."""
    waymarks = list(waymarks)
    return {crs: describe(distances_to_route((utm_to_wgs84(w.utm_x, w.utm_y, crs) for w in waymarks), corridor)) for crs in candidates}


def route_lines(overpass_route_answer: dict) -> list[list[tuple[float, float]]]:
    """(lon, lat) lines of the route relations in a cached Overpass answer (what audit.load_route reads)."""
    return [[(g["lon"], g["lat"]) for g in m["geometry"]]
            for rel in overpass_route_answer.get("elements", []) for m in rel.get("members", [])
            if m.get("type") == "way" and m.get("geometry")]


def rough_lines(path: Path) -> list[list[tuple[float, float]]]:
    return [f["geometry"]["coordinates"] for f in json.loads(path.read_text())["features"]]


def rough_line_deviation(waymarks: list[nav.Waymark], fountains: list[Record], stages_dir: Path,
                         stages: Iterable[int] = range(1, 8)) -> dict[int, dict]:
    """Per stage and per variant of the Camino: how far the official waymarks are from the repo's hand-drawn route line
    of that stage, and how many official fountains that line would keep inside the 500 m service corridor."""
    out = {}
    for s in stages:
        line = stages_dir / f"camino-frances-{s:02d}.route.geojson"
        if not line.exists():
            continue
        corridor = Corridor(rough_lines(line))
        ways = [w for w in waymarks if w.stage == f"F{s}"]
        fnt = [r for r in fountains if r.tags.get("stage") == f"F{s}"]
        out[s] = {"variants": {v: describe(distances_to_route([(w.lat, w.lon) for w in ways if w.camino == v], corridor))
                               for v in sorted({w.camino for w in ways})},
                  "fountains": len(fnt),
                  "fountains_within_service_corridor": sum(corridor.distance(f.lat, f.lon) <= SERVICE_BUFFER_M for f in fnt)}
    return out


def stage_label_conflicts(waymarks: Iterable[nav.Waymark], stages_dir: Path, far_m: float = 3000, near_m: float = 300) -> list[dict]:
    """Waymarks whose ETAPA says one stage while they stand far from that stage's line (more than far_m) and close to
    another's (less than near_m). The lines are rough, so the two limits are wide: these are mistakes in the table."""
    corridors = {s: Corridor(rough_lines(stages_dir / f"camino-frances-{s:02d}.route.geojson")) for s in range(1, 8)
                 if (stages_dir / f"camino-frances-{s:02d}.route.geojson").exists()}
    out = []
    for w in waymarks:
        own = int(w.stage[1:]) if w.stage and re.fullmatch(r"F[1-7]", w.stage) else None
        if own not in corridors:
            continue
        d = {s: c.distance(w.lat, w.lon) for s, c in corridors.items()}
        nearest = min(d, key=d.get)
        if nearest != own and d[own] > far_m and d[nearest] < near_m:
            out.append({"waymark": w.source_id, "filed_under": w.stage, "near_stage": nearest,
                        "metres_from_filed_stage": round(d[own]), "metres_from_near_stage": round(d[nearest])})
    return out


# ---------------------------------------------------------------------------
# the report
# ---------------------------------------------------------------------------
def stage1_comparison(data: nav.NavarraData, osm: list[Record], corridor: Corridor, max_lat: float | None = STAGE1_NAVARRA_MAX_LAT) -> dict:
    stays, water = osm_along_route(osm, corridor, max_lat)
    area = {fold(loc) for loc in ("Luzaide / Valcarlos", "Orreaga / Roncesvalles", "Auritz / Burguete", "Aurizberri / Espinal")}
    official = [l for l in data.lodgings if fold(l.tags.get("locality") or "") in area]
    matches = match_lodgings(official, stays)
    matched = [m for m in matches if m.osm]
    fountains = [r for r in data.fountains if r.tags.get("stage") == "F1"]
    frows = match_fountains(fountains, water)
    albergues = [r for r in stays if albergue_like(r)]
    linked = {id(m.osm) for m in matched} | {id(o) for m in matched for o in m.others}
    both_beds = [m for m in matched if m.osm_beds is not None and m.lodging.tags.get("capacity") is not None]
    return {
        "osm_stays": len(stays), "osm_albergue_like": len(albergues),
        "osm_albergue_like_with_official": sum(id(r) in linked for r in albergues),
        "osm_albergue_categories": dict(Counter(r.category for r in albergues)),
        "official_lodgings": len(official), "official_matched": len(matched),
        "matched_by": dict(Counter(m.how for m in matched)),
        "official_unmatched": [(m.lodging.source_id, m.lodging.name, m.lodging.tags.get("locality")) for m in matches if not m.osm],
        "matched_with_a_second_osm_place": [(m.lodging.source_id, m.osm.key, [o.key for o in m.others]) for m in matched if m.others],
        "beds_compared": len(both_beds),
        "beds_equal": sum(m.osm_beds == m.lodging.tags["capacity"] for m in both_beds),
        "beds_pairs": [(m.lodging.source_id, m.lodging.tags["capacity"], m.osm_beds) for m in both_beds],
        "matched_pairs": [(m.lodging.source_id, m.lodging.name, m.osm.key, m.osm.name, m.osm.category, m.how, m.name_score) for m in matched],
        "osm_phone_email_in_matched": {"phone": sum(bool(m.osm.tags.get("phone") or m.osm.tags.get("contact:phone")) for m in matched),
                                       "email": sum(bool(m.osm.tags.get("email") or m.osm.tags.get("contact:email")) for m in matched)},
        "fountains": fountain_summary(frows, water),
        "fountain_rows": [(r["fountain"].tags["municipality"], r["fountain"].source_id,
                           None if r["osm"] is None else round(r["distance_m"]), None if r["osm"] is None else r["osm"].key) for r in frows],
    }


def build_report(data: nav.NavarraData, osm: list[Record] | None = None, corridor: Corridor | None = None,
                 stages_dir: Path | None = None, max_lat: float | None = STAGE1_NAVARRA_MAX_LAT) -> dict:
    rep: dict = {"registry": field_counts(data.lodgings), "stages": stage_table(data), "other_localities": unassigned_localities(data),
                 "fountains": {"total": len(data.fountains), "by_branch": dict(Counter(r.tags.get("camino") for r in data.fountains))},
                 "waymarks": {"total": len(data.waymarks), "by_branch": dict(Counter(w.camino for w in data.waymarks)),
                              "by_kind": dict(Counter(w.kind for w in data.waymarks))},
                 "skipped": len(data.skipped), "attributions": {k: a.as_dict() for k, a in data.attributions.items()}}
    if stages_dir:
        rep["rough_line_deviation"] = rough_line_deviation(data.waymarks, data.fountains, stages_dir)
        rep["waymark_stage_label_conflicts"] = stage_label_conflicts(data.waymarks, stages_dir)
    if osm is not None and corridor is not None:
        rep["stage1"] = stage1_comparison(data, osm, corridor, max_lat)
        rep["crs_evidence_stage1"] = crs_evidence([w for w in data.waymarks if w.stage == "F1"], corridor)
    return rep


def format_markdown(rep: dict) -> str:
    L = ["# Navarra open data against OSM", ""]
    r = rep["registry"]
    L += [f"Registry: {r['lodgings']} albergues turisticos, capacity for {r['with_capacity']} ({r['beds']} beds), phone {r['with_phone']}, "
          f"email {r['with_email']}, website {r['with_website']}, contact withheld by the owner {r['contact_withheld']}, "
          f"flagged del Camino de Santiago {r['on_camino']}.", "",
          "| Stage | Albergues | Beds | On the Camino | Phone | Email | Official fountains | Waymarks | Villages (albergues) |", "|---|---|---|---|---|---|---|---|---|"]
    for s in rep["stages"]:
        towns = ", ".join(f"{k} {v}" for k, v in s["localities"].items())
        L.append(f"| {s['stage']} | {s['lodgings']} | {s['beds']} | {s['on_camino']} | {s['with_phone']} | {s['with_email']} | "
                 f"{s['fountains']} | {s['waymarks']} | {towns} |")
    L += ["", "Registry villages on no Frances stage: " + ", ".join(f"{k} {v}" for k, v in rep["other_localities"].items()), ""]
    if "rough_line_deviation" in rep:
        L += ["Official waymarks against the repo's hand-drawn route line of the stage (a variant of the Camino the line does not "
              "follow is far from it by definition), and official fountains kept inside its 500 m service corridor:", "",
              "| Stage | Variant | Waymarks | Median | p90 | Max | Fountains in the corridor |", "|---|---|---|---|---|---|---|"]
        for s, d in rep["rough_line_deviation"].items():
            for variant, v in d["variants"].items():
                L.append(f"| {s} | {variant} | {v['n']} | {v['median_m']} m | {v['p90_m']} m | {v['max_m']} m | "
                         f"{d['fountains_within_service_corridor']} of {d['fountains']} |")
        L.append("")
        bad = rep.get("waymark_stage_label_conflicts", [])
        L += [f"Waymarks filed under a stage they are not on (more than 3 km from its line, less than 300 m from another's): {len(bad)}: "
              + ", ".join(f"{b['waymark']} ({b['filed_under']} but near stage {b['near_stage']})" for b in bad), ""]
    if "crs_evidence_stage1" in rep:
        L += ["Which datum are the waymark numbers in? All stage-1 waymarks against the real OSM route of stage 1:", ""]
        for crs, d in rep["crs_evidence_stage1"].items():
            L.append(f"- read as {crs}: median {d['median_m']} m, p90 {d['p90_m']} m, {d['within_30m']} of {d['n']} within 30 m")
        L.append("")
    if "stage1" in rep:
        s = rep["stage1"]
        L += ["## Stage 1, Navarra side, against the OSM cache", "",
              f"- OSM stays near the route: {s['osm_stays']} ({s['osm_albergue_like']} albergue-like: {s['osm_albergue_categories']})",
              f"- Official albergues in Luzaide, Roncesvalles, Burguete, Espinal: {s['official_lodgings']}; matched to an OSM place: "
              f"{s['official_matched']} ({s['matched_by']}); not in OSM: {s['official_unmatched']}",
              f"- OSM albergue-like places with an official counterpart: {s['osm_albergue_like_with_official']} of {s['osm_albergue_like']}",
              f"- Two OSM places for one registered albergue: {s['matched_with_a_second_osm_place']}",
              f"- Beds, official vs OSM, where both exist: {s['beds_equal']} of {s['beds_compared']} equal {s['beds_pairs']}",
              f"- Fountains: {s['fountains']}", f"- Official fountains, nearest OSM water point: {s['fountain_rows']}", ""]
    return "\n".join(L)


# ---------------------------------------------------------------------------
# command line
# ---------------------------------------------------------------------------
def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Compare the Navarra open data with an OSM cache along a stage (replay only).")
    ap.add_argument("--stage", required=True, type=Path, help="stage file, for example ../offline-maps/stages/camino-frances-01.json")
    ap.add_argument("--osm-cache", required=True, type=Path, help="a cache directory that audit.py wrote (never queried online)")
    ap.add_argument("--cache", type=Path, default=Path("cache"), help="cache of opendata_navarra")
    ap.add_argument("--offline", action="store_true", help="do not fetch the Navarra tables either")
    ap.add_argument("--max-lat", type=float, default=STAGE1_NAVARRA_MAX_LAT,
                    help="ignore OSM places north of this latitude (the France / Navarra border on stage 1); 90 for none")
    ap.add_argument("--json", type=Path, help="write the numbers to this file")
    args = ap.parse_args(argv)

    stage = json.loads(args.stage.read_text())
    bbox = stage["search_bbox"]
    data = nav.load(sources.Cache(args.cache, offline=args.offline))
    osm_cache = sources.Cache(args.osm_cache, offline=True)  # replay only
    route = sources.fetch_overpass(osm_cache, sources.overpass_route_query(bbox, stage["route_name_regex"]), "route")
    corridor = Corridor(route_lines(route))
    elements = sources.fetch_overpass(osm_cache, sources.overpass_poi_query(bbox))["elements"]
    records = [r for r in map(from_osm, elements) if r]
    rep = build_report(data, records, corridor, args.stage.parent, args.max_lat)
    print(format_markdown(rep))
    if args.json:
        args.json.write_text(json.dumps(rep, ensure_ascii=False, indent=1, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
