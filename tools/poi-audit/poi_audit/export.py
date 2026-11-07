"""Rows for the Supabase tables stays, pois, stage_stays and stage_pois, from OpenStreetMap places along one stage.

Nothing here touches a network or a database: records in (poi_audit.normalize.Record, already given
CaminoPlus categories by from_osm), rows out. Writing the rows to files is write_plan(); sending them
to Supabase is poi_audit.apply.

The rules, in short (the README has the full list):

* A place becomes a row when it lies within the corridor of THIS stage's line (route.StageLine), is not
  marked closed, and, for stays and food places, has a name.
* stays take the STAY and FOOD families, pois take WORSHIP, HERITAGE and SERVICE. Categories are the
  ones the database CHECK lists allow (the tests parse the migrations to prove it).
* Only what OSM says is written: no prices, ratings, reviews or photos, ever.
* Column names are the database's own. The link rows (stage_stays, stage_pois) cannot carry stay_id /
  poi_id before the places exist in the database, so they carry the place's OSM key instead.
"""
from __future__ import annotations

import json
import re
import unicodedata
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

from .normalize import FOOD, HERITAGE, SERVICE, STAY, WORSHIP, Record, closed_signal_keys
from .route import StageLine

STAY_FAMILIES = ("stay", "food")
POI_FAMILIES = ("worship", "heritage", "service")
STAY_CATEGORIES = tuple(sorted(STAY | FOOD))
POI_CATEGORIES = tuple(sorted(WORSHIP | HERITAGE | SERVICE))
OSM_TYPES = ("node", "way", "relation")

# What an unnamed place is called (pois.name is NOT NULL). Neutral, English, and flagged with
# tags.name_default so the app can show its own translation instead.
DEFAULT_NAMES = {
    "cathedral": "Cathedral", "church": "Church", "chapel": "Chapel", "monastery": "Monastery",
    "cross": "Wayside cross", "monument": "Monument", "museum": "Museum", "bridge": "Bridge",
    "viewpoint": "Viewpoint", "milestone": "Milestone",
    "fountain": "Fountain", "water": "Drinking water", "pharmacy": "Pharmacy", "hospital": "Hospital",
    "atm": "ATM", "supermarket": "Supermarket", "bike_shop": "Bike shop", "post_office": "Post office",
    "tourist_info": "Tourist information", "toilet": "Toilets",
}

# Column order of every row, so a file reads the same on every run. Only database columns.
STAY_COLUMNS = ("source", "osm_type", "osm_id", "category", "name", "route_id", "address", "country_code", "location",
                "phone", "email", "whatsapp", "website", "beds", "opening_hours", "data_confidence", "verification_level")
POI_COLUMNS = ("source", "osm_type", "osm_id", "category", "name", "location", "phone", "website", "opening_hours",
               "wikidata_id", "data_confidence", "verification_level", "tags")
LINK_COLUMNS = ("stage_id", "osm_type", "osm_id", "km_from_stage_start", "detour_m")
COLUMNS = {"stays": STAY_COLUMNS, "pois": POI_COLUMNS, "stage_stays": LINK_COLUMNS, "stage_pois": LINK_COLUMNS}
# Written when a row is created, never changed by a later import: provenance and trust belong to the audit
# loader, to editors and to owners, and route_id to whoever curates the row afterwards.
INSERT_ONLY = {"stays": ("source", "route_id", "data_confidence", "verification_level"),
               "pois": ("source", "data_confidence", "verification_level")}
FILES = {"stays": "stays.ndjson", "pois": "pois.ndjson", "stage_stays": "stage_stays.ndjson",
         "stage_pois": "stage_pois.ndjson", "skipped": "skipped.ndjson"}

ALBERGUE_LIKE = {"albergue_municipal", "albergue_parochial", "albergue_private", "hostel"}


class PlanError(Exception):
    """Rows (or files) that the database would refuse, or that do not belong together."""

    def __init__(self, problems):
        self.problems = list(problems)
        shown = "; ".join(self.problems[:8])
        more = f" (and {len(self.problems) - 8} more)" if len(self.problems) > 8 else ""
        super().__init__(f"{len(self.problems)} problem(s): {shown}{more}")


# ---------------------------------------------------------------------------
# cleaning single values
# ---------------------------------------------------------------------------
_SPACES = re.compile(r"\s+")
_HYPHENS = {0x2010: "-", 0x2011: "-"}   # OSM has non-breaking hyphens in names: they break search
PHONE_OK = re.compile(r"^\+?[0-9][0-9 ()./-]*$")
EMAIL_OK = re.compile(r"^[^@\s,;<>]+@[^@\s,;<>]+\.[A-Za-z]{2,}$")
HOST_OK = re.compile(r"^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$")
QID_OK = re.compile(r"^Q[1-9][0-9]*$")
UUID_OK = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
EWKT_OK = re.compile(r"^SRID=4326;POINT\((-?[0-9]+(?:\.[0-9]+)?) (-?[0-9]+(?:\.[0-9]+)?)\)$")
# A French street starts with its type and the house number comes first: "12 Rue de la Citadelle".
FRENCH_STREET = re.compile(r"^(rue|route|avenue|chemin|place|impasse|all[ée]e|boulevard|quai|cours|ruelle|sentier|passage|"
                           r"faubourg|hameau|lieu-dit|esplanade|square|r[ée]sidence|cit[ée])\b", re.I)


def clean_text(value) -> str | None:
    """NFC, no control or invisible characters, one space between words, None when nothing is left."""
    if value is None:
        return None
    s = unicodedata.normalize("NFC", str(value)).translate(_HYPHENS)
    s = "".join(" " if unicodedata.category(c) == "Zs" else c for c in s
                if unicodedata.category(c) not in ("Cc", "Cf", "Cs") or c in "\t\n")
    return _SPACES.sub(" ", s).strip() or None


def clean_name(value) -> str | None:
    s = clean_text(value)
    return s[:200] if s else None


def _candidates(raw, separators: str):
    for part in re.split(f"[{separators}]", clean_text(raw) or ""):
        part = part.strip()
        if part:
            yield part


def clean_phone(raw) -> str | None:
    """The first usable number of an OSM value ("+34 948 76 00 31;+34 657 86 63 61" gives the first).
    Short codes such as "3631" are not numbers a pilgrim can call and are dropped."""
    for cand in _candidates(raw, ";,"):
        digits = re.sub(r"\D", "", cand)
        if PHONE_OK.match(cand) and 6 <= len(digits) <= 16:
            return cand
    return None


def clean_email(raw) -> str | None:
    for cand in _candidates(raw, ";,\\s"):
        cand = re.sub(r"^mailto:", "", cand, flags=re.I)
        if EMAIL_OK.match(cand):
            return cand
    return None


def clean_website(raw) -> str | None:
    """An http(s) address. A bare domain ("www.refuge.com") gets https://; anything else (javascript:, mailto:,
    free text) is dropped, because the app opens this value."""
    for cand in _candidates(raw, ";\\s"):
        if re.match(r"^https?://", cand, re.I):
            url = cand
        elif HOST_OK.match(cand.split("/", 1)[0]):
            url = "https://" + cand
        else:
            continue
        authority = url.split("://", 1)[1].split("/", 1)[0].split("?", 1)[0].split("#", 1)[0]
        if "@" not in authority and HOST_OK.match(authority.split(":", 1)[0]) and len(url) <= 500:
            return url
    return None


def clean_hours(raw) -> str | None:
    """opening_hours stays in OSM syntax, as written ("Mo-Su 08:00-22:00; Tu off")."""
    s = clean_text(raw)
    return s if s and len(s) <= 500 else None


def clean_country(raw) -> str | None:
    s = clean_text(raw)
    return s.upper() if s and re.fullmatch(r"[A-Za-z]{2}", s) else None


def clean_qid(raw) -> str | None:
    s = clean_text(raw)
    return s if s and QID_OK.match(s) else None


def clean_beds(tags: dict, category: str) -> int | None:
    """beds=* as a whole number. capacity=* counts people only for places that sleep pilgrims in dorms;
    for a hotel or a camp site it can mean rooms or pitches, so it is not used there."""
    raw = tags.get("beds")
    if raw is None and category in ALBERGUE_LIKE:
        raw = tags.get("capacity")
    s = clean_text(raw)
    return int(s) if s and re.fullmatch(r"[0-9]{1,4}", s) and 1 <= int(s) <= 2000 else None


def first_of(tags: dict, keys, clean):
    """The first value that survives `clean`, looking at the keys in order (phone before contact:phone ...)."""
    for key in keys:
        value = clean(tags.get(key))
        if value:
            return value
    return None


def build_address(tags: dict) -> str | None:
    """"Calle Mayor 12, 31650 Roncesvalles" from addr:street / addr:place, addr:housenumber, addr:postcode
    and addr:city; addr:full only when none of those is there (it is free text and often sloppy)."""
    street = clean_text(tags.get("addr:street")) or clean_text(tags.get("addr:place"))
    number = clean_text(tags.get("addr:housenumber"))
    line = None
    if street:
        line = street if not number else (f"{number} {street}" if FRENCH_STREET.match(street) else f"{street} {number}")
    town = " ".join(x for x in (clean_text(tags.get("addr:postcode")), clean_text(tags.get("addr:city"))) if x) or None
    text = ", ".join(x for x in (line, town) if x) or clean_text(tags.get("addr:full"))
    return text if text and len(text) <= 300 else None


def ewkt_point(lon: float, lat: float) -> str:
    """'SRID=4326;POINT(lon lat)': what a geography column takes as text (the smoke test proves it)."""
    def num(v: float) -> str:
        s = f"{v:.7f}".rstrip("0").rstrip(".")
        return "0" if s in ("", "-0") else s
    return f"SRID=4326;POINT({num(lon)} {num(lat)})"


def split_key(rec: Record) -> tuple[str, int]:
    osm_type, _, number = rec.source_id.partition("/")
    if rec.source != "osm" or osm_type not in OSM_TYPES or not number.isdigit():
        raise ValueError(f"not an OSM record: {rec.key}")
    return osm_type, int(number)


# ---------------------------------------------------------------------------
# rows
# ---------------------------------------------------------------------------
def stay_row(rec: Record, route_id: str, confidence: int | None) -> dict:
    t = rec.tags
    osm_type, osm_id = split_key(rec)
    return {
        "source": "osm",
        "osm_type": osm_type,
        "osm_id": osm_id,
        "category": rec.category,
        "name": clean_name(rec.name),
        "route_id": route_id,
        "address": build_address(t),
        "country_code": clean_country(t.get("addr:country")),
        "location": ewkt_point(rec.lon, rec.lat),
        "phone": first_of(t, ("phone", "contact:phone", "mobile", "contact:mobile"), clean_phone),
        "email": first_of(t, ("email", "contact:email"), clean_email),
        "whatsapp": first_of(t, ("contact:whatsapp",), clean_phone),
        "website": first_of(t, ("website", "contact:website", "url"), clean_website),
        "beds": clean_beds(t, rec.category),
        "opening_hours": clean_hours(t.get("opening_hours")),
        "data_confidence": confidence,
        "verification_level": "unverified",
    }


def poi_row(rec: Record, confidence: int | None) -> dict:
    t = rec.tags
    osm_type, osm_id = split_key(rec)
    name = clean_name(rec.name)
    return {
        "source": "osm",
        "osm_type": osm_type,
        "osm_id": osm_id,
        "category": rec.category,
        "name": name or DEFAULT_NAMES[rec.category],
        "location": ewkt_point(rec.lon, rec.lat),
        "phone": first_of(t, ("phone", "contact:phone", "mobile", "contact:mobile"), clean_phone),
        "website": first_of(t, ("website", "contact:website", "url"), clean_website),
        "opening_hours": clean_hours(t.get("opening_hours")),
        "wikidata_id": clean_qid(t.get("wikidata")),
        "data_confidence": confidence,
        "verification_level": "unverified",
        "tags": {} if name else {"name_default": True},
    }


def link_row(stage_id: str, row: dict, km: float, detour_m: float) -> dict:
    return {"stage_id": stage_id, "osm_type": row["osm_type"], "osm_id": row["osm_id"],
            "km_from_stage_start": round(km, 2), "detour_m": int(round(detour_m))}


def record_sort_key(rec: Record):
    osm_type, osm_id = split_key(rec)
    return OSM_TYPES.index(osm_type), osm_id


# ---------------------------------------------------------------------------
# the optional audit run
# ---------------------------------------------------------------------------
class AuditError(Exception):
    pass


@dataclass
class AuditInfo:
    """What the import takes from an audit.py run (entities.json): the score, and the closed signals."""
    stage: str | None = None
    scores: dict = field(default_factory=dict)     # "osm:node/123" -> 0..100
    closed: dict = field(default_factory=dict)     # "osm:node/123" -> message of its CLOSED_SIGNAL finding


def load_audit(path: Path, stage_slug: str) -> AuditInfo:
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        entities = data["entities"]
        info = AuditInfo(stage=data.get("stage"))
        for e in entities:
            key, score = e["id"], e["score"]
            if isinstance(score, bool) or not isinstance(score, int) or not 0 <= score <= 100:
                raise ValueError(f"{key}: score {score!r} is not a whole number from 0 to 100")
            info.scores[key] = score
            for f in e.get("findings") or []:
                if f.get("code") == "CLOSED_SIGNAL":
                    info.closed[key] = clean_text(f.get("message")) or "CLOSED_SIGNAL"
                    break
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as e:
        raise AuditError(f"cannot use the audit file {path}: {e}") from None
    if info.stage != stage_slug:
        raise AuditError(f"the audit file is for stage {info.stage!r}, this run is for {stage_slug!r}")
    return info


# ---------------------------------------------------------------------------
# the plan: every row of one stage
# ---------------------------------------------------------------------------
@dataclass
class Plan:
    stage: dict                                   # slug, name, stage_number, stage_id, route_id
    stays: list = field(default_factory=list)
    pois: list = field(default_factory=list)
    stage_stays: list = field(default_factory=list)
    stage_pois: list = field(default_factory=list)
    skipped: list = field(default_factory=list)
    meta: dict = field(default_factory=dict)      # how it was made: route line, OSM data date, counts of what fell outside


def stage_meta(stage: dict) -> dict:
    return {k: stage[k] for k in ("slug", "name", "stage_number", "stage_id", "route_id")}


def skip_reason(rec: Record, audit: AuditInfo | None):
    """(code, detail) when the place must not be imported, else None."""
    keys = closed_signal_keys(rec.tags)
    if keys:
        return "closed", "OSM tags: " + ", ".join(sorted(keys))
    hours = str(rec.tags.get("opening_hours", "")).strip().lower()
    if hours in ("closed", "off"):                       # the audit calls this CLOSED_SIGNAL too
        return "closed", f"opening_hours={hours}"
    if audit and rec.key in audit.closed:
        return "closed", "audit: " + audit.closed[rec.key]
    if rec.family in STAY_FAMILIES and not clean_name(rec.name):
        return "unnamed", f"{rec.family} place without a name"
    return None


def build_plan(stage: dict, records, line: StageLine, buffers: dict, audit: AuditInfo | None = None) -> Plan:
    """Rows for every record within the corridor of `line`. `buffers` is audit.BUFFER_M (metres per family)."""
    plan = Plan(stage=stage_meta(stage))
    sid, rid = plan.stage["stage_id"], plan.stage["route_id"]
    seen: set = set()
    outside = Counter()
    links: dict[str, list] = {"stays": [], "pois": []}
    for rec in sorted(records, key=record_sort_key):
        if rec.key in seen:
            continue
        seen.add(rec.key)
        km, detour = line.locate_km(rec.lat, rec.lon)
        if detour > buffers[rec.family]:
            outside[rec.family] += 1
            continue
        why = skip_reason(rec, audit)
        osm_type, osm_id = split_key(rec)
        if why:
            plan.skipped.append({"osm_type": osm_type, "osm_id": osm_id, "name": clean_name(rec.name), "category": rec.category,
                                 "reason": why[0], "detail": why[1]})
            continue
        score = audit.scores.get(rec.key) if audit else None
        if rec.family in STAY_FAMILIES:
            row = stay_row(rec, rid, score)
            plan.stays.append(row)
            links["stays"].append(link_row(sid, row, km, detour))
        elif rec.family in POI_FAMILIES:
            row = poi_row(rec, score)
            plan.pois.append(row)
            links["pois"].append(link_row(sid, row, km, detour))
        else:
            raise ValueError(f"{rec.key}: category {rec.category!r} belongs to no table")
    by_km = lambda r: (r["km_from_stage_start"], OSM_TYPES.index(r["osm_type"]), r["osm_id"])   # noqa: E731
    plan.stage_stays = sorted(links["stays"], key=by_km)
    plan.stage_pois = sorted(links["pois"], key=by_km)
    plan.meta = {"records": len(seen), "outside_corridor": dict(sorted(outside.items())),
                 "audit": None if audit is None else {"scores": len(audit.scores)}}
    problems = check_plan(plan)
    if problems:
        raise PlanError(problems)
    return plan


# ---------------------------------------------------------------------------
# checks: what the database would refuse, and what must hold across the files
# ---------------------------------------------------------------------------
def check_row(table: str, row: dict) -> list[str]:
    """Problems with one row, in the words of the database. Used on every export and on every file that is read."""
    cols = COLUMNS[table]
    if not isinstance(row, dict) or list(row) != list(cols):
        got = list(row) if isinstance(row, dict) else type(row).__name__
        return [f"{table}: columns must be exactly {list(cols)}, got {got}"]
    who = f"{table} {row.get('osm_type')}/{row.get('osm_id')}"
    bad: list[str] = []

    def need(ok: bool, what: str) -> None:
        if not ok:
            bad.append(f"{who}: {what}")

    def optional_text(key: str, limit: int) -> None:
        v = row[key]
        need(v is None or (isinstance(v, str) and 0 < len(v) <= limit and v == v.strip()), f"{key} must be null or a trimmed text of at most {limit} characters")

    need(row["osm_type"] in OSM_TYPES, "osm_type must be node, way or relation")
    need(isinstance(row["osm_id"], int) and not isinstance(row["osm_id"], bool) and row["osm_id"] > 0, "osm_id must be a positive whole number")
    if table in ("stage_stays", "stage_pois"):
        need(isinstance(row["stage_id"], str) and bool(UUID_OK.match(row["stage_id"])), "stage_id must be a uuid")
        km, detour = row["km_from_stage_start"], row["detour_m"]
        need(isinstance(km, (int, float)) and not isinstance(km, bool) and 0 <= km < 10000 and round(km, 2) == km,
             "km_from_stage_start must be from 0 to 9999.99 with two decimals (numeric(6,2))")
        need(isinstance(detour, int) and not isinstance(detour, bool) and detour >= 0, "detour_m must be a whole number, 0 or more")
        return bad
    allowed = STAY_CATEGORIES if table == "stays" else POI_CATEGORIES
    need(row["source"] == "osm", "source must be 'osm'")
    need(row["category"] in allowed, f"category {row['category']!r} is not allowed in {table}")
    need(isinstance(row["name"], str) and 0 < len(row["name"]) <= 200 and row["name"] == row["name"].strip(), "name must be a trimmed text (the column is NOT NULL)")
    m = EWKT_OK.match(row["location"]) if isinstance(row["location"], str) else None
    need(bool(m) and abs(float(m.group(1))) <= 180 and abs(float(m.group(2))) <= 90, "location must be 'SRID=4326;POINT(lon lat)' with lon, lat in range")
    need(row["verification_level"] == "unverified", "an import only writes verification_level 'unverified'")
    score = row["data_confidence"]
    need(score is None or (isinstance(score, int) and not isinstance(score, bool) and 0 <= score <= 100), "data_confidence must be null or 0..100")
    optional_text("opening_hours", 500)
    if table == "stays":
        need(isinstance(row["route_id"], str) and bool(UUID_OK.match(row["route_id"])), "route_id must be a uuid")
        optional_text("address", 300)
        need(row["country_code"] is None or (isinstance(row["country_code"], str) and re.fullmatch(r"[A-Z]{2}", row["country_code"]) is not None),
             "country_code must be null or two capital letters")
        need(row["phone"] is None or clean_phone(row["phone"]) == row["phone"], "phone must be null or a callable number")
        need(row["whatsapp"] is None or clean_phone(row["whatsapp"]) == row["whatsapp"], "whatsapp must be null or a callable number")
        need(row["email"] is None or clean_email(row["email"]) == row["email"], "email must be null or one address")
        need(row["website"] is None or clean_website(row["website"]) == row["website"], "website must be null or an http(s) address")
        need(row["beds"] is None or (isinstance(row["beds"], int) and not isinstance(row["beds"], bool) and 1 <= row["beds"] <= 2000), "beds must be null or 1..2000")
    else:
        need(row["phone"] is None or clean_phone(row["phone"]) == row["phone"], "phone must be null or a callable number")
        need(row["website"] is None or clean_website(row["website"]) == row["website"], "website must be null or an http(s) address")
        need(row["wikidata_id"] is None or (isinstance(row["wikidata_id"], str) and QID_OK.match(row["wikidata_id"]) is not None), "wikidata_id must be null or Q and digits")
        need(isinstance(row["tags"], dict), "tags must be an object")
    return bad


def check_plan(plan: Plan) -> list[str]:
    """Every row valid, keys unique, every link pointing at a row of its table and at this stage."""
    bad: list[str] = []
    keys = {}
    for table in ("stays", "pois", "stage_stays", "stage_pois"):
        rows = getattr(plan, table)
        for row in rows:
            bad.extend(check_row(table, row))
        ids = [(r.get("osm_type"), r.get("osm_id")) for r in rows if isinstance(r, dict)]
        dup = [k for k, n in Counter(ids).items() if n > 1]
        bad.extend(f"{table}: {t}/{i} appears more than once" for t, i in dup[:5])
        keys[table] = set(ids)
    both = keys["stays"] & keys["pois"]
    bad.extend(f"{t}/{i} is in stays and in pois" for t, i in sorted(both)[:5])
    for table, parent in (("stage_stays", "stays"), ("stage_pois", "pois")):
        for row in getattr(plan, table):
            if not isinstance(row, dict):
                continue
            key = (row.get("osm_type"), row.get("osm_id"))
            if key not in keys[parent]:
                bad.append(f"{table}: {key[0]}/{key[1]} has no row in {parent}")
            if row.get("stage_id") != plan.stage["stage_id"]:
                bad.append(f"{table}: {key[0]}/{key[1]} belongs to stage {row.get('stage_id')}, this plan is for {plan.stage['stage_id']}")
    for row in plan.stays:
        if isinstance(row, dict) and row.get("route_id") != plan.stage["route_id"]:
            bad.append(f"stays {row.get('osm_type')}/{row.get('osm_id')}: route_id is not the route of this stage")
    return bad


# ---------------------------------------------------------------------------
# files
# ---------------------------------------------------------------------------
def dumps(row: dict) -> str:
    """One line of NDJSON. Non-ASCII stays readable; the two Unicode line separators are escaped, because line
    based tools (and str.splitlines) would cut a line at them."""
    return json.dumps(row, ensure_ascii=False, separators=(",", ":")).replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")


def write_plan(plan: Plan, out: Path) -> None:
    """NDJSON per table, always all five files (empty when there is nothing), plus summary.json and summary.md.
    Nothing in them depends on the clock, so the same input gives byte-identical files."""
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    tables = {"stays": plan.stays, "pois": plan.pois, "stage_stays": plan.stage_stays, "stage_pois": plan.stage_pois,
              "skipped": sorted(plan.skipped, key=lambda r: (r["reason"], OSM_TYPES.index(r["osm_type"]), r["osm_id"]))}
    for name, rows in tables.items():
        (out / FILES[name]).write_bytes("".join(dumps(r) + "\n" for r in rows).encode("utf-8"))
    summary = summarize(plan)
    (out / "summary.json").write_bytes((json.dumps(summary, indent=1, ensure_ascii=False) + "\n").encode("utf-8"))
    (out / "summary.md").write_bytes(summary_markdown(plan, summary).encode("utf-8"))


def read_ndjson(path: Path) -> list[dict]:
    rows = []
    try:
        text = Path(path).read_text(encoding="utf-8")
    except OSError as e:
        raise PlanError([f"cannot read {path}: {e.strerror or e}"]) from None
    for n, line in enumerate(text.split("\n"), 1):          # not splitlines(): U+2028 and friends are not line ends here
        if not line.strip():
            continue
        try:
            rows.append(json.loads(line))
        except ValueError:
            raise PlanError([f"{Path(path).name} line {n} is not JSON"]) from None
    return rows


def read_plan(directory: Path, stage: dict) -> Plan:
    """The rows of an earlier run, checked again as strictly as when they were made (files can be edited by hand)."""
    directory = Path(directory)
    plan = Plan(stage=stage_meta(stage))
    for name in ("stays", "pois", "stage_stays", "stage_pois"):
        setattr(plan, name, read_ndjson(directory / FILES[name]))
    problems = check_plan(plan)
    if problems:
        raise PlanError(problems)
    return plan


# ---------------------------------------------------------------------------
# what a person reads: counts and coverage
# ---------------------------------------------------------------------------
def summarize(plan: Plan) -> dict:
    stays, pois = plan.stays, plan.pois
    have = lambda rows, key: sum(r[key] is not None for r in rows)   # noqa: E731
    return {
        "stage": plan.stage,
        "rows": {"stays": len(stays), "pois": len(pois), "stage_stays": len(plan.stage_stays), "stage_pois": len(plan.stage_pois)},
        "categories": {"stays": dict(sorted(Counter(r["category"] for r in stays).items())),
                       "pois": dict(sorted(Counter(r["category"] for r in pois).items()))},
        "stays_with": {k: have(stays, k) for k in ("address", "phone", "email", "whatsapp", "website", "opening_hours", "beds", "country_code")},
        "pois_with": {k: have(pois, k) for k in ("phone", "website", "opening_hours", "wikidata_id")},
        "pois_with_default_name": sum(bool(r["tags"].get("name_default")) for r in pois),
        "skipped": dict(sorted(Counter(r["reason"] for r in plan.skipped).items())),
        "meta": plan.meta,
    }


def summary_markdown(plan: Plan, s: dict) -> str:
    rows, meta = s["rows"], s["meta"]
    route, n_stays = meta.get("route") or {}, max(1, rows["stays"])
    pct = lambda n, of: f"{round(100 * n / of)}%" if of else "-"   # noqa: E731
    lines = [f"### {plan.stage['slug']}: {plan.stage['name']}", ""]
    if route:
        lines += [f"Stage line: {route['length_km']:.1f} km of OSM route ways ({route['source']}); the start town is {route['start_snap_m']:.0f} m "
                  f"and the end town {route['end_snap_m']:.0f} m from it. OSM data of {meta.get('osm_timestamp') or 'unknown date'}.", ""]
    outside = sum((meta.get("outside_corridor") or {}).values())
    lines += [f"{meta.get('records', 0)} OSM places in the search box, {outside} outside this stage's corridor, "
              f"{sum(s['skipped'].values())} skipped ({', '.join(f'{n} {why}' for why, n in s['skipped'].items()) or 'none'}).", "",
              "| Table | Rows | Linked to the stage |", "|---|---|---|",
              f"| stays (sleep and eat) | {rows['stays']} | {rows['stage_stays']} |",
              f"| pois (churches, sites, services) | {rows['pois']} | {rows['stage_pois']} |", ""]
    if rows["stays"]:
        w = s["stays_with"]
        lines += ["Stays with: " + ", ".join(f"{k.replace('_', ' ')} {pct(w[k], n_stays)}" for k in
                                             ("address", "phone", "email", "website", "beds", "opening_hours")) + ".", ""]
    lines += ["Categories: " + "; ".join(f"{t} " + ", ".join(f"{c} {n}" for c, n in cats.items()) for t, cats in s["categories"].items() if cats) + ".", ""]
    if s["pois_with_default_name"]:
        lines += [f"{s['pois_with_default_name']} pois had no name and got a neutral one (tags.name_default).", ""]
    lines += ["No prices, ratings, reviews or photos: OSM has none. Data (c) OpenStreetMap contributors, ODbL.", ""]
    return "\n".join(lines)
