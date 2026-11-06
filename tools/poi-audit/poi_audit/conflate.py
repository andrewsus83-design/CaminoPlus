"""Link records from different sources that describe the same real place.

OSM is the backbone (it is what the offline map shows). Wikidata and Overture
records are attached to an OSM record when:
  1. an explicit id link exists (OSM ``wikidata=Q..`` tag, or Wikidata P11693/P10689/P402), or
  2. the names match and the points are close, or
  3. the points are very close and the category family is the same.
Anything left over becomes its own entity ("only in Overture", "only in Wikidata"),
which is how we find places OSM may be missing.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .normalize import Record, distance_m, name_similarity

# How far apart two sources may put the same place before we call it a match
# at all (bigger for big things like monasteries).
MATCH_RADIUS = {"stay": 150, "food": 120, "worship": 300, "heritage": 400, "service": 80, "other": 150}


@dataclass
class Entity:
    primary: Record
    linked: list[Record] = field(default_factory=list)
    link_reason: dict[str, str] = field(default_factory=dict)  # record key -> how it was linked
    distance_to_route_m: float | None = None
    findings: list[dict] = field(default_factory=list)
    score: int = 0
    photos: list[dict] = field(default_factory=list)
    ai: dict = field(default_factory=dict)

    @property
    def records(self) -> list[Record]:
        return [self.primary, *self.linked]

    def by_source(self, src: str) -> list[Record]:
        return [r for r in self.records if r.source == src]

    @property
    def id(self) -> str:
        return self.primary.key

    @property
    def name(self) -> str | None:
        for r in self.records:
            if r.name:
                return r.name
        return None


def _compatible(a: Record, b: Record) -> bool:
    fa, fb = a.family, b.family
    if fa == fb:
        return True
    # Overture often files churches as historic sites and vice versa.
    return {fa, fb} <= {"worship", "heritage"}


def conflate(osm: list[Record], wikidata: list[Record], overture: list[Record]) -> list[Entity]:
    entities = [Entity(primary=r) for r in osm]
    by_osm = {e.primary.source_id: e for e in entities}
    by_qid: dict[str, Entity] = {}
    for e in entities:
        q = e.primary.tags.get("wikidata")
        if q:
            by_qid.setdefault(q, e)

    def best_match(rec: Record, pool: list[Entity], min_name: float) -> tuple[Entity | None, str]:
        radius = MATCH_RADIUS.get(rec.family, 150)
        best, best_s, reason = None, 0.0, ""
        for e in pool:
            p = e.primary
            if not _compatible(rec, p):
                continue
            d = distance_m(rec.lat, rec.lon, p.lat, p.lon)
            if d > radius:
                continue
            ns = name_similarity(rec.name, p.name)
            if ns >= min_name:
                s = ns + (1 - d / radius) * 0.3
                why = f"name {ns:.2f} at {d:.0f} m"
            elif d <= 35 and rec.family == p.family and (not rec.name or not p.name):
                s = 0.5
                why = f"same type at {d:.0f} m"
            else:
                continue
            if s > best_s:
                best, best_s, reason = e, s, why
        return best, reason

    # Wikidata: explicit links first, then name + distance.
    for w in wikidata:
        target = by_qid.get(w.source_id)
        reason = "OSM wikidata tag" if target else ""
        if not target:
            for ref in w.tags.get("osm") or []:
                if ref in by_osm:
                    target, reason = by_osm[ref], "Wikidata OSM id"
                    break
        if not target:
            target, reason = best_match(w, entities, 0.6)
        if target:
            target.linked.append(w)
            target.link_reason[w.key] = reason
        else:
            entities.append(Entity(primary=w))

    # Overture: name + distance only (it has no OSM ids for places).
    # Overture-only places are added to the pool too, so Overture's own
    # duplicates (it often has the same albergue 2 or 3 times) collapse into one.
    pool = list(entities)
    for o in sorted(overture, key=lambda r: -(r.tags.get("confidence") or 0)):
        target, reason = best_match(o, pool, 0.55)
        if target:
            target.linked.append(o)
            target.link_reason[o.key] = reason
        else:
            e = Entity(primary=o)
            entities.append(e)
            pool.append(e)
    return entities
