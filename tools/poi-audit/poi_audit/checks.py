"""Rule-based checks, photo licence checks, confidence score and label.

Every finding has a stable ``code`` so the review queue (and the
``data_audit_findings`` table) can track it across runs.

Honest limit: these checks tell us whether open data sources *agree* and look
complete and recent. They cannot tell us that an albergue is open today, clean,
or friendly. Only an owner confirmation or recent pilgrim reports can do that,
which is why the label from this tool says "cross-checked", never "verified".
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from .conflate import Entity
from .normalize import Record, distance_m, is_generic_name, name_similarity

SEVERITY_WEIGHT = {"high": 25, "medium": 10, "low": 3, "info": 0}

# Fields a pilgrim needs, per family. Each item is (label, list of OSM keys, any of which counts).
REQUIRED = {
    "stay": [("contact (phone or website)", ["phone", "contact:phone", "website", "contact:website", "email", "contact:email"]),
             ("opening hours or season", ["opening_hours", "seasonal", "open_months"]),
             ("beds", ["beds", "capacity"]),
             ("price", ["fee", "charge", "price"])],
    "food": [("opening hours", ["opening_hours"]),
             ("contact (phone or website)", ["phone", "contact:phone", "website", "contact:website"])],
    "worship": [("opening hours or service times", ["opening_hours", "service_times"]),
                ("wikidata link", ["wikidata"])],
    "heritage": [("wikidata link", ["wikidata"])],
    "service": [],
    "other": [],
}

# Licences we can show in the app (with attribution where required).
OK_LICENCES = ("cc0", "public domain", "pd", "cc by ", "cc by-sa", "cc-by", "cc-by-sa", "attribution")
BAD_LICENCE_HINTS = ("nc", "nd", "fair use", "non-commercial", "noncommercial", "noderivs")

ROUTE_IMPORTANT = {"stay", "worship", "heritage"}


def _f(e: Entity, code: str, severity: str, msg: str, **details) -> None:
    e.findings.append({"code": code, "severity": severity, "message": msg, "details": details})


def _has(tags: dict, keys: list[str]) -> bool:
    return any(tags.get(k) not in (None, "", []) for k in keys)


def _age_days(dt: datetime | None, now: datetime) -> int | None:
    return None if dt is None else (now - dt).days


def _check_date(tags: dict) -> datetime | None:
    for k in ("check_date", "survey:date", "check_date:opening_hours"):
        v = tags.get(k)
        if v:
            try:
                return datetime.fromisoformat(v[:10]).replace(tzinfo=timezone.utc)
            except ValueError:
                pass
    return None


def run_checks(entities: list[Entity], now: datetime, sources_ok: set[str] | None = None) -> None:
    """sources_ok: which sources loaded; 'only in X' checks need the others to be present."""
    ok = sources_ok if sources_ok is not None else {"osm", "overture", "wikidata"}
    osm_entities = [e for e in entities if e.primary.source == "osm"]
    _duplicates(osm_entities)
    for e in entities:
        p = e.primary
        fam = p.family

        # --- closed / disused signals -------------------------------------------------
        closed_keys = [k for k in p.tags if k.split(":", 1)[0] in {"disused", "abandoned", "was", "demolished"}]
        if closed_keys:
            _f(e, "CLOSED_SIGNAL", "high", "OSM marks it as disused or abandoned", tags=closed_keys)
        if str(p.tags.get("opening_hours", "")).strip().lower() in {"closed", "off"}:
            _f(e, "CLOSED_SIGNAL", "high", "OSM opening_hours says closed")
        for o in e.by_source("overture"):
            st = o.tags.get("operating_status")
            if st and st != "open":
                _f(e, "CLOSED_SIGNAL", "high", f"Overture says {st.replace('_', ' ')}", overture_id=o.source_id)

        # --- names ------------------------------------------------------------------
        if not e.name and fam in {"stay", "food", "worship"}:
            _f(e, "NO_NAME", "medium", "No name in any source")
        elif is_generic_name(e.name):
            _f(e, "GENERIC_NAME", "low", f"Name is only a category word: '{e.name}'")

        # --- agreement between sources ------------------------------------------------
        for r in e.linked:
            d = distance_m(p.lat, p.lon, r.lat, r.lon)
            limit = 250 if fam in {"worship", "heritage"} else 100
            if d > limit:
                _f(e, "COORD_DISAGREE", "medium",
                   f"{r.source} puts it {d:.0f} m away from {p.source}", other=r.key, distance_m=round(d))
            if r.name and p.name and e.link_reason.get(r.key, "").startswith(("OSM", "Wikidata")):
                ns = name_similarity(r.name, p.name)
                if ns < 0.4:
                    _f(e, "NAME_DISAGREE", "low", f"Linked by id but names differ: '{p.name}' vs '{r.name}'",
                       other=r.key, similarity=ns)
            if r.family != fam and {r.family, fam} - {"worship", "heritage"}:
                _f(e, "CATEGORY_DISAGREE", "low", f"{p.source} says {p.category}, {r.source} says {r.category}",
                   other=r.key)

        # --- single-source entities ----------------------------------------------------
        if p.source == "overture" and "osm" in ok:
            conf = p.tags.get("confidence") or 0
            if fam in {"stay", "food", "worship"}:
                sev = "medium" if conf >= 0.7 else "low"
                _f(e, "ONLY_IN_OVERTURE", sev,
                   f"In Overture (confidence {conf:.2f}) but not in OSM: missing from the map, or closed?",
                   datasets=p.tags.get("datasets"))
        if p.source == "wikidata" and "osm" in ok:
            important = (p.tags.get("sitelinks") or 0) >= 3 or p.tags.get("heritage")
            _f(e, "ONLY_IN_WIKIDATA", "medium" if important else "low",
               "In Wikidata but no matching OSM feature nearby", sitelinks=p.tags.get("sitelinks"))

        # --- completeness ---------------------------------------------------------------
        if p.source == "osm":
            tags = dict(p.tags)
            if e.by_source("wikidata"):
                tags.setdefault("wikidata", e.by_source("wikidata")[0].source_id)
            missing = [label for label, keys in REQUIRED.get(fam, []) if not _has(tags, keys)]
            if missing:
                sev = "medium" if fam == "stay" and len(missing) >= 2 else "low"
                _f(e, "MISSING_FIELDS", sev, "Missing: " + ", ".join(missing), fields=missing)

        # --- freshness ------------------------------------------------------------------
        if p.source == "osm" and fam in {"stay", "food"}:
            age = _age_days(p.last_edit, now)
            chk = _age_days(_check_date(p.tags), now)
            fresh = min(x for x in (age, chk, 10**6) if x is not None)
            if fresh > 3 * 365:
                _f(e, "STALE", "medium", f"Not edited or checked in OSM for {fresh // 365} years",
                   last_edit=p.last_edit.date().isoformat() if p.last_edit else None)
        for o in e.by_source("overture"):
            age = _age_days(o.last_edit, now)
            if age is not None and age > 3 * 365 and fam in {"stay", "food"}:
                _f(e, "STALE_OVERTURE", "low", f"Overture source data is {age // 365} years old",
                   overture_id=o.source_id)


def _duplicates(entities: list[Entity]) -> None:
    for i, a in enumerate(entities):
        for b in entities[i + 1:]:
            pa, pb = a.primary, b.primary
            if pa.family != pb.family or pa.family in {"service", "other"} and pa.category != pb.category:
                continue
            if pa.family == "service":
                continue  # fountains and ATMs next to each other are normal
            d = distance_m(pa.lat, pa.lon, pb.lat, pb.lon)
            if d > 80:
                continue
            ns = name_similarity(pa.name, pb.name)
            # A node inside a building drawn as a way, both named: classic OSM duplicate.
            if (ns >= 0.85 and d <= 80) or (ns >= 0.6 and d <= 30):
                for x, y in ((a, pb), (b, pa)):
                    _f(x, "DUPLICATE", "medium", f"Possible duplicate of {y.source_id} '{y.name}' ({d:.0f} m)",
                       other=y.key, distance_m=round(d), similarity=ns)


# ---------------------------------------------------------------------------
# photos
# ---------------------------------------------------------------------------
def photo_candidates(e: Entity) -> list[str]:
    """Commons file names referenced by the sources for this entity."""
    files: list[str] = []
    for r in e.records:
        if r.source == "wikidata":
            files += r.tags.get("images") or []
        if r.source == "osm":
            wc = r.tags.get("wikimedia_commons", "")
            if wc.startswith("File:"):
                files.append(wc[5:])
            img = r.tags.get("image", "")
            if "commons.wikimedia.org" in img and "File:" in img:
                files.append(img.split("File:", 1)[1])
    return list(dict.fromkeys(f.replace("_", " ") for f in files))


def check_photos(e: Entity, info: dict[str, dict]) -> None:
    p = e.primary
    for r in e.by_source("osm"):
        img = r.tags.get("image", "")
        if img and "wikimedia.org" not in img:
            _f(e, "PHOTO_UNKNOWN_LICENCE", "medium",
               "OSM image is not on Wikimedia Commons: licence unknown, do not use", url=img)
    for name in photo_candidates(e):
        meta = info.get(name)
        if not meta or meta.get("missing"):
            _f(e, "PHOTO_MISSING", "low", f"Linked photo not found on Commons: {name}")
            continue
        lic = (meta.get("license") or "").lower()
        ok = any(x in lic for x in OK_LICENCES) and not any(f" {h}" in f" {lic.replace('-', ' ')}" for h in BAD_LICENCE_HINTS)
        photo = {**meta, "usable": ok, "source": "commons"}
        if not ok:
            _f(e, "PHOTO_LICENCE", "high", f"Photo licence '{meta.get('license')}' is not allowed for the app", file=name)
        if meta.get("lat") is not None:
            d = distance_m(p.lat, p.lon, meta["lat"], meta["lon"])
            photo["distance_m"] = round(d)
            limit = 600 if p.family in {"worship", "heritage"} else 250
            if d > limit:
                photo["usable"] = False
                _f(e, "PHOTO_FAR", "medium", f"Photo was taken {d:.0f} m from the place: may show something else",
                   file=name, distance_m=round(d))
        e.photos.append(photo)
    if not e.photos and p.family in {"worship", "heritage"} and e.distance_to_route_m is not None:
        _f(e, "NO_PHOTO", "low", "No open-licence photo linked yet")


# ---------------------------------------------------------------------------
# score + label
# ---------------------------------------------------------------------------
def score(e: Entity, now: datetime) -> int:
    p = e.primary
    sources = {r.source for r in e.records}
    s = 20
    s += {1: 0, 2: 20, 3: 30}.get(len(sources), 30)
    if len(sources) > 1 and not any(f["code"] in {"COORD_DISAGREE", "NAME_DISAGREE"} for f in e.findings):
        s += 10
    req = REQUIRED.get(p.family, [])
    if p.source == "osm" and req:
        tags = dict(p.tags)
        if e.by_source("wikidata"):
            tags["wikidata"] = "x"
        s += round(20 * sum(_has(tags, keys) for _, keys in req) / len(req))
    elif p.source == "osm":
        s += 15
    newest = max((r.last_edit for r in e.records if r.last_edit), default=None)
    chk = _check_date(p.tags) if p.source == "osm" else None
    newest = max(x for x in (newest, chk, datetime(1970, 1, 1, tzinfo=timezone.utc)) if x is not None)
    age = (now - newest).days
    s += 15 if age < 365 else 10 if age < 730 else 5 if age < 1095 else 0
    if "wikidata" in sources:
        s += 5
    s -= sum(SEVERITY_WEIGHT[f["severity"]] for f in e.findings)
    return max(0, min(100, s))


def band(s: int) -> str:
    return "high" if s >= 75 else "medium" if s >= 50 else "low"


def verification_label(e: Entity, run_date: datetime) -> dict:
    """What the app may show. A data check never claims a place is open or good."""
    n = len({r.source for r in e.records})
    names = {"osm": "OpenStreetMap", "overture": "Overture", "wikidata": "Wikidata"}
    srcs = ", ".join(names[s] for s in sorted({r.source for r in e.records}))
    return {
        "level": "data_check",            # owner > pilgrim > editor > data_check > unverified
        "checked_at": run_date.date().isoformat(),
        "label": f"Data cross-checked {run_date:%b %Y} · {n} open source{'s' if n > 1 else ''}",
        "sources": srcs,
        "note": "Not a visit. Opening, beds and cleanliness are confirmed only by owners and pilgrims.",
    }


def review_priority(e: Entity) -> int:
    """Higher = look at it first. Important, low-confidence places near the route win."""
    if not e.findings:
        return 0
    worst = max(SEVERITY_WEIGHT[f["severity"]] for f in e.findings)
    importance = 3 if e.primary.family in ROUTE_IMPORTANT else 2 if e.primary.family == "food" else 1
    near = 1.5 if (e.distance_to_route_m or 0) < 300 else 1.0
    return round(worst * importance * near * (1 + (100 - e.score) / 100))
