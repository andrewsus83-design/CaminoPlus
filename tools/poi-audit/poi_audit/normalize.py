"""Turn raw source records into one shape, with CaminoPlus categories.

Categories are the ones the database already uses (``stays.category`` and
``pois.category``), so a cleaned record can be written straight into
``stays`` / ``pois``. Nothing here is Camino specific: the same mapping works
for any pilgrimage route.
"""
from __future__ import annotations

import math
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

# category -> family. A family is what we compare across sources
# (OSM "hostel" vs Overture "lodging" are both "stay").
STAY = {"albergue_municipal", "albergue_parochial", "albergue_private", "hostel", "hotel",
        "pension", "guesthouse", "casa_rural", "apartment", "camping"}
FOOD = {"cafe", "bar", "restaurant", "bakery"}
WORSHIP = {"cathedral", "church", "chapel", "monastery"}
HERITAGE = {"cross", "monument", "museum", "bridge", "viewpoint", "milestone"}
SERVICE = {"fountain", "water", "pharmacy", "hospital", "atm", "supermarket", "bike_shop",
           "post_office", "tourist_info", "toilet"}


def family(cat: str | None) -> str:
    if cat in STAY:
        return "stay"
    if cat in FOOD:
        return "food"
    if cat in WORSHIP:
        return "worship"
    if cat in HERITAGE:
        return "heritage"
    if cat in SERVICE:
        return "service"
    return "other"


@dataclass
class Record:
    source: str                  # osm | overture | wikidata
    source_id: str               # node/123, overture uuid, Q123
    name: str | None
    category: str
    lat: float
    lon: float
    tags: dict[str, Any] = field(default_factory=dict)
    last_edit: datetime | None = None

    @property
    def family(self) -> str:
        return family(self.category)

    @property
    def key(self) -> str:
        return f"{self.source}:{self.source_id}"


# ---------------------------------------------------------------------------
# names
# ---------------------------------------------------------------------------
# Words that say what a place is, not which place it is. Removed before
# comparing names ("Albergue de Peregrinos de Roncesvalles" ~ "Roncesvalles").
GENERIC_WORDS = {
    "albergue", "auberge", "gite", "gîte", "refugio", "aterpetxea", "hostel", "hostal", "hotel",
    "pension", "pensión", "casa", "rural", "peregrinos", "pelerins", "pèlerins", "pilgrim",
    "pilgrims", "municipal", "parroquial", "privado", "de", "del", "la", "las", "los", "el", "le",
    "les", "du", "des", "d", "l", "y", "et", "and", "the", "of", "san", "santa", "santo", "st",
    "saint", "sainte", "iglesia", "eglise", "église", "church", "capilla", "chapelle", "ermita",
    "parroquia", "cafe", "café", "bar", "restaurante", "restaurant", "cafeteria", "cafetería",
}
CATEGORY_ONLY_NAMES = {"albergue", "hostel", "hotel", "bar", "cafe", "café", "restaurante",
                       "restaurant", "iglesia", "church", "fuente", "fountain", "ermita", "capilla"}


def fold(s: str) -> str:
    s = unicodedata.normalize("NFKD", s.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def name_tokens(s: str | None) -> set[str]:
    if not s:
        return set()
    toks = set(fold(s).split())
    core = {t for t in toks if t not in {fold(w) for w in GENERIC_WORDS} and len(t) > 1}
    return core or toks


# Generic words are dropped before comparing, so "Albergue Municipal de Zubiri" and "Hostal Zubiri"
# both shrink to {"zubiri"}: the village, not the business. Two names that only share the village
# must not be merged when they name DIFFERENT kinds of place or DIFFERENT operators. These are the
# words that carry that information. One group = one kind of place (an albergue is a hostel).
KIND_GROUPS = {
    "albergue": {"albergue", "auberge", "gite", "gîte", "refugio", "aterpetxea", "hostel", "peregrinos",
                 "pelerins", "pèlerins", "pilgrim", "pilgrims"},
    "hostal": {"hostal", "pension", "pensión"},
    "hotel": {"hotel"},
    "casa_rural": {"rural"},  # not "casa": "Casa Sabina" is a name, "Casa Rural X" is a kind
    "food": {"cafe", "café", "bar", "restaurante", "restaurant", "cafeteria", "cafetería"},
    "church": {"iglesia", "eglise", "église", "church", "capilla", "chapelle", "ermita", "parroquia"},
}
OPERATOR_WORDS = {"municipal", "parroquial", "privado"}
CONFLICT_CAP = 0.3  # below every match threshold (0.55 to 0.6) and below the NAME_DISAGREE limit (0.4)
_KIND_FOLDED = {k: {fold(w) for w in ws} for k, ws in KIND_GROUPS.items()}
_OPERATOR_FOLDED = {fold(w) for w in OPERATOR_WORDS}


def _kinds(tokens: set[str]) -> set[str]:
    return {k for k, ws in _KIND_FOLDED.items() if tokens & ws}


def names_conflict(a: str | None, b: str | None) -> bool:
    """True when both names say what they are and disagree: albergue vs hostal, municipal vs parroquial."""
    ta, tb = set(fold(a or "").split()), set(fold(b or "").split())
    ka, kb = _kinds(ta), _kinds(tb)
    if ka and kb and ka.isdisjoint(kb):
        return True
    oa, ob = ta & _OPERATOR_FOLDED, tb & _OPERATOR_FOLDED
    return bool(oa and ob and oa.isdisjoint(ob))


def name_similarity(a: str | None, b: str | None) -> float:
    """0..1. Token overlap on the distinctive words, plus a containment bonus.

    Sharing only the village name is not enough: names that disagree on the kind of place or the
    operator ("Albergue Municipal de Zubiri" vs "Hostal Zubiri") score at most CONFLICT_CAP. A name
    that is only the place ("Roncesvalles") still matches "Albergue de Peregrinos de Roncesvalles":
    one side says nothing about the kind, so there is no conflict.
    """
    ta, tb = name_tokens(a), name_tokens(b)
    if not ta or not tb:
        return 0.0
    inter = len(ta & tb)
    jacc = inter / len(ta | tb)
    contain = inter / min(len(ta), len(tb))
    score = round(max(jacc, 0.85 * contain), 3)
    if names_conflict(a, b):
        return min(score, CONFLICT_CAP)
    return score


def is_generic_name(s: str | None) -> bool:
    return bool(s) and fold(s) in {fold(w) for w in CATEGORY_ONLY_NAMES}


# ---------------------------------------------------------------------------
# geometry (small distances, so an equirectangular approximation is enough)
# ---------------------------------------------------------------------------
def distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371008.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


class Corridor:
    """Distance from a point to the route line(s), in metres."""

    def __init__(self, lines: list[list[tuple[float, float]]]):
        self.lines = [ln for ln in lines if len(ln) >= 2]
        lat0 = sum(p[1] for ln in self.lines for p in ln) / max(1, sum(len(ln) for ln in self.lines))
        self.kx = 111320.0 * math.cos(math.radians(lat0))
        self.ky = 110540.0
        self.segs = [((a[0] * self.kx, a[1] * self.ky), (b[0] * self.kx, b[1] * self.ky))
                     for ln in self.lines for a, b in zip(ln, ln[1:])]

    def distance(self, lat: float, lon: float) -> float:
        px, py = lon * self.kx, lat * self.ky
        best = float("inf")
        for (ax, ay), (bx, by) in self.segs:
            dx, dy = bx - ax, by - ay
            ll = dx * dx + dy * dy
            t = 0.0 if ll == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / ll))
            cx, cy = ax + t * dx, ay + t * dy
            best = min(best, math.hypot(px - cx, py - cy))
        return best


# ---------------------------------------------------------------------------
# OSM -> Record
# ---------------------------------------------------------------------------
ALBERGUE_RX = re.compile(r"albergue|auberge|g[iî]te|refugio|aterpetxe|pilgrim|p[eè]lerin|peregrin", re.I)


def osm_category(t: dict[str, str]) -> str | None:
    tourism, amenity, historic = t.get("tourism"), t.get("amenity"), t.get("historic")
    building, shop, name = t.get("building"), t.get("shop"), t.get("name", "")
    if tourism in {"hostel", "guest_house", "alpine_hut", "wilderness_hut"} or t.get("hostel") == "pilgrim":
        if ALBERGUE_RX.search(name) or t.get("hostel") == "pilgrim" or t.get("pilgrimage") == "yes":
            op = (t.get("operator:type") or "").lower()
            low = fold(name + " " + t.get("operator", ""))
            if op in {"public", "government", "municipal"} or "municipal" in low:
                return "albergue_municipal"
            if op in {"religious", "parish"} or "parroquial" in low or "paroiss" in low:
                return "albergue_parochial"
            return "albergue_private"
        return "hostel" if tourism == "hostel" else "guesthouse"
    if tourism in {"hotel", "motel"}:
        return "hotel"
    if tourism == "apartment":
        return "apartment"
    if tourism in {"camp_site"}:
        return "camping"
    if tourism == "chalet":
        return "casa_rural"
    if amenity in {"cafe"}:
        return "cafe"
    if amenity in {"bar", "pub"}:
        return "bar"
    if amenity in {"restaurant", "fast_food"}:
        return "restaurant"
    if shop == "bakery":
        return "bakery"
    if amenity == "monastery" or building == "monastery" or historic == "monastery":
        return "monastery"
    if building == "cathedral" or t.get("place_of_worship") == "cathedral":
        return "cathedral"
    if amenity == "place_of_worship" or building in {"church", "chapel"} or historic in {"church", "chapel", "wayside_chapel"}:
        if building == "chapel" or historic in {"chapel", "wayside_chapel"} or t.get("place_of_worship") == "chapel":
            return "chapel"
        return "church"
    if historic in {"wayside_cross", "cross"} or t.get("man_made") == "cross" or historic == "wayside_shrine":
        return "cross"
    if historic == "milestone":
        return "milestone"
    if historic == "bridge" or (historic and t.get("bridge")):
        return "bridge"
    if tourism == "museum":
        return "museum"
    if tourism == "viewpoint":
        return "viewpoint"
    if historic in {"monument", "memorial", "castle", "ruins", "archaeological_site", "fort",
                    "city_gate", "building", "tower", "manor"} or tourism in {"attraction", "artwork"}:
        return "monument"
    if amenity == "drinking_water":
        return "water"
    if amenity == "fountain":
        return "fountain"
    if amenity in {"pharmacy"}:
        return "pharmacy"
    if amenity in {"hospital", "clinic"}:
        return "hospital"
    if amenity in {"atm", "bank"}:
        return "atm"
    if shop in {"supermarket", "convenience"}:
        return "supermarket"
    if shop == "bicycle":
        return "bike_shop"
    if amenity == "post_office":
        return "post_office"
    if tourism == "information" and t.get("information") == "office":
        return "tourist_info"
    if amenity == "toilets":
        return "toilet"
    return None


# Mappers do not delete a place that closed, they prefix its tags: "disused:amenity=cafe",
# "abandoned:tourism=hostel", "was:shop=bakery". The audit asks Overpass for these too (otherwise the
# closed places never arrive) and keeps the original tags on the record, which is how CLOSED_SIGNAL
# sees them.
LIFECYCLE_PREFIXES = ("disused", "abandoned", "was", "demolished")
PRIMARY_KEYS = ("tourism", "amenity", "shop", "historic", "building", "man_made")
BUSINESS_KEYS = ("tourism", "amenity", "shop", "historic", "man_made")  # a live one means "still a place"


def strip_lifecycle(tags: dict) -> dict:
    """Tags as they were while the place was open: "disused:amenity=cafe" gives "amenity=cafe".
    Live tags always win, so a supermarket that used to be a bar stays a supermarket."""
    out = dict(tags)
    for k, v in tags.items():
        prefix, _, key = k.partition(":")
        if prefix in LIFECYCLE_PREFIXES and key in PRIMARY_KEYS and key not in tags:
            out[key] = v
    return out


def closed_signal_keys(tags: dict) -> list[str]:
    """Tag keys that say the place is closed: a lifecycle prefix on a primary key while the place has
    no live business tag ("disused:amenity=cafe" and no amenity / tourism / shop left), or
    disused=yes / abandoned=yes. Not closures: "disused:phone" (an old number), or "disused:amenity=bar"
    on a place that is a live "shop=supermarket" today (a bar that was replaced). A bare building=yes
    does not count as live: closed cafes keep their building outline."""
    live = any(k in tags for k in BUSINESS_KEYS)
    keys = []
    for k, v in tags.items():
        prefix, _, key = k.partition(":")
        if prefix in LIFECYCLE_PREFIXES and key in PRIMARY_KEYS and not live:
            keys.append(k)
        elif k in ("disused", "abandoned") and str(v).lower() == "yes":
            keys.append(k)
    return keys


def from_osm(el: dict) -> Record | None:
    t = el.get("tags") or {}
    cat = osm_category(t)
    if not cat:
        cat = osm_category(strip_lifecycle(t))  # a place that only has disused: / abandoned: tags left
    if not cat:
        return None
    if el["type"] == "node":
        lat, lon = el["lat"], el["lon"]
    else:
        c = el.get("center") or {}
        if "lat" not in c:
            return None
        lat, lon = c["lat"], c["lon"]
    ts = el.get("timestamp")
    return Record(
        source="osm", source_id=f"{el['type']}/{el['id']}", name=t.get("name"), category=cat,
        lat=lat, lon=lon, tags=dict(t, **{"_version": el.get("version")}),
        last_edit=datetime.fromisoformat(ts.replace("Z", "+00:00")) if ts else None,
    )


# ---------------------------------------------------------------------------
# Overture -> Record
# ---------------------------------------------------------------------------
OVERTURE_MAP = {
    # basic_category or taxonomy.primary -> CaminoPlus category
    "hostel": "hostel", "hotel": "hotel", "inn": "pension", "motel": "hotel",
    "bed_and_breakfast": "guesthouse", "lodging": "guesthouse", "private_lodging": "apartment",
    "guest_house": "guesthouse", "campground": "camping", "rv_park": "camping", "resort": "hotel",
    "cafe": "cafe", "coffee_shop": "cafe", "bar": "bar", "pub": "bar", "restaurant": "restaurant",
    "casual_eatery": "restaurant", "fast_food_restaurant": "restaurant", "bakery": "bakery",
    "christian_place_of_worship": "church", "church_cathedral": "church", "cathedral": "cathedral",
    "monastery": "monastery", "chapel": "chapel",
    "monument": "monument", "historic_site": "monument", "castle": "monument",
    "sculpture_statue": "monument", "museum": "museum", "bridge": "bridge",
    "public_fountain": "fountain", "pharmacy_and_drug_store": "pharmacy", "pharmacy": "pharmacy",
    "hospital": "hospital", "atm": "atm", "bank_or_credit_union": "atm",
    "supermarket": "supermarket", "grocery_store": "supermarket", "convenience_store": "supermarket",
    "bicycle_shop": "bike_shop", "post_office": "post_office", "tourist_information_center": "tourist_info",
}


def from_overture(r: dict) -> Record | None:
    cat = OVERTURE_MAP.get(r.get("taxonomy") or "") or OVERTURE_MAP.get(r.get("basic_category") or "")
    if not cat:
        return None
    if cat in {"hostel", "guesthouse"} and r.get("name") and ALBERGUE_RX.search(r["name"]):
        cat = "albergue_private"
    ut = r.get("update_time")
    try:
        last = datetime.fromisoformat(ut.replace("Z", "+00:00")) if ut else None
    except ValueError:
        last = None
    return Record(
        source="overture", source_id=r["id"], name=r.get("name"), category=cat,
        lat=r["lat"], lon=r["lon"], last_edit=last,
        tags={k: r.get(k) for k in ("confidence", "operating_status", "websites", "phones",
                                    "datasets", "address", "basic_category", "taxonomy")},
    )


# ---------------------------------------------------------------------------
# Wikidata -> Record
# ---------------------------------------------------------------------------
WD_KEYWORDS = [
    ("cathedral", "cathedral"), ("monastery", "monastery"), ("abbey", "monastery"),
    ("collegiate", "church"), ("convent", "monastery"), ("chapel", "chapel"), ("hermitage", "chapel"),
    ("church", "church"), ("shrine", "chapel"), ("cross", "cross"), ("bridge", "bridge"),
    ("museum", "museum"), ("castle", "monument"), ("monument", "monument"), ("memorial", "monument"),
    ("tower", "monument"), ("fort", "monument"), ("ruin", "monument"), ("palace", "monument"),
    ("archaeological", "monument"), ("hospital", "monument"), ("pilgrim", "monument"),
    ("fountain", "fountain"), ("viewpoint", "viewpoint"), ("hostel", "hostel"), ("hotel", "hotel"),
]
# Wikidata items we never want as POIs (settlements, rivers, people ...).
WD_SKIP = re.compile(r"municipality|village|human settlement|commune|town|city|river|mountain|"
                     r"stream|lake|hill|mountain pass|valley|forest|road|street|railway|"
                     r"administrative|census|parish of|electoral|council|cave|peak|summit|cadastral",
                     re.I)


def from_wikidata(it: dict) -> Record | None:
    inst = " | ".join(it.get("instances") or [])
    cat = None
    for kw, c in WD_KEYWORDS:
        if kw in inst.lower():
            cat = c
            break
    if not cat:
        if WD_SKIP.search(inst) or not it.get("heritage"):
            return None
        cat = "monument"  # heritage-listed thing we cannot classify: still worth a look
    return Record(
        source="wikidata", source_id=it["qid"], name=it.get("label"), category=cat,
        lat=it["lat"], lon=it["lon"],
        tags={k: it.get(k) for k in ("description", "instances", "images", "heritage", "osm",
                                     "website", "commons_category", "sitelinks", "enwiki", "eswiki")},
    )


def now_utc() -> datetime:
    return datetime.now(timezone.utc)
