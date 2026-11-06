"""Fetch raw records from open data sources, with an on-disk cache.

Sources (all open, no scraping of Google or social media):
- OpenStreetMap via the Overpass API (ODbL)
- Overture Maps places, read straight from the public S3 bucket (CDLA-Permissive-2.0)
- Wikidata via the SPARQL endpoint (CC0)
- Wikimedia Commons via the MediaWiki API (per-file licences)

Every fetch is cached as JSON under ``cache_dir`` so a run can be replayed
offline (``--offline``) and so CI only hits the public APIs once.
"""
from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path
from typing import Any, Iterable

import requests

USER_AGENT = "CaminoPlus-POI-audit/0.1 (https://camino.plus; data quality checks)"
OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
WIKIDATA_SPARQL = "https://query.wikidata.org/sparql"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
OVERTURE_BUCKET = "overturemaps-us-west-2"
OVERTURE_RELEASE = os.environ.get("OVERTURE_RELEASE", "2026-10-21.0")


class Cache:
    def __init__(self, cache_dir: Path, offline: bool = False):
        self.dir = Path(cache_dir)
        self.dir.mkdir(parents=True, exist_ok=True)
        self.offline = offline

    def path(self, kind: str, key: str) -> Path:
        h = hashlib.sha1(key.encode()).hexdigest()[:16]
        return self.dir / f"{kind}-{h}.json"

    def get_or_fetch(self, kind: str, key: str, fetch):
        p = self.path(kind, key)
        if p.exists():
            return json.loads(p.read_text())
        if self.offline:
            raise RuntimeError(f"offline mode and no cache for {kind} ({p.name})")
        data = fetch()
        p.write_text(json.dumps(data))
        return data


def _session() -> requests.Session:
    s = requests.Session()
    s.headers["User-Agent"] = USER_AGENT
    return s


def _retry(fn, tries: int = 4):
    delay = 5
    for i in range(tries):
        try:
            return fn()
        except (requests.RequestException, ValueError) as e:  # ValueError: bad JSON
            if i == tries - 1:
                raise
            print(f"  retry in {delay}s after: {e}")
            time.sleep(delay)
            delay *= 2


# ---------------------------------------------------------------------------
# OpenStreetMap
# ---------------------------------------------------------------------------
def overpass_poi_query(bbox: list[float]) -> str:
    w, s, e, n = bbox
    b = f"({s},{w},{n},{e})"
    return f"""
[out:json][timeout:180];
(
  nwr["tourism"~"^(hostel|guest_house|hotel|motel|apartment|camp_site|alpine_hut|wilderness_hut|chalet|attraction|museum|viewpoint|artwork|information)$"]{b};
  nwr["amenity"~"^(place_of_worship|monastery|cafe|bar|pub|restaurant|fast_food|drinking_water|fountain|pharmacy|hospital|clinic|atm|bank|post_office|toilets|shelter)$"]{b};
  nwr["historic"]{b};
  nwr["building"~"^(church|cathedral|chapel|monastery)$"]{b};
  nwr["shop"~"^(supermarket|bakery|convenience|bicycle)$"]{b};
  nwr["man_made"="cross"]{b};
);
out center tags meta;
"""


def overpass_route_query(bbox: list[float], name_regex: str) -> str:
    w, s, e, n = bbox
    rx = name_regex.replace('"', '\\"').replace("\\b", "")
    return f"""
[out:json][timeout:180];
relation["route"~"^(hiking|foot)$"]["name"~"{rx}",i]({s},{w},{n},{e});
out geom;
"""


def fetch_overpass(cache: Cache, query: str, kind: str = "osm") -> dict:
    def go():
        last = None
        for url in OVERPASS_URLS:
            try:
                r = _session().post(url, data={"data": query}, timeout=240)
                r.raise_for_status()
                return r.json()
            except Exception as e:  # try the next mirror
                last = e
                print(f"  overpass {url} failed: {e}")
        raise RuntimeError(f"all Overpass mirrors failed: {last}")

    return cache.get_or_fetch(kind, query, lambda: _retry(go, 2))


# ---------------------------------------------------------------------------
# Overture Maps places (GeoParquet on public S3, bbox pushdown)
# ---------------------------------------------------------------------------
OVERTURE_COLUMNS = [
    "id", "names", "basic_category", "taxonomy", "confidence", "operating_status",
    "websites", "phones", "sources", "bbox", "addresses",
]


def fetch_overture(cache: Cache, bbox: list[float]) -> list[dict]:
    key = f"{OVERTURE_RELEASE}:{bbox}"

    def go():
        import pyarrow.compute as pc
        import pyarrow.dataset as ds
        import pyarrow.fs as pfs

        proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
        kw = {"proxy_options": proxy} if proxy else {}
        fs = pfs.S3FileSystem(anonymous=True, region="us-west-2", **kw)
        d = ds.dataset(
            f"{OVERTURE_BUCKET}/release/{OVERTURE_RELEASE}/theme=places/type=place/",
            filesystem=fs, format="parquet",
        )
        w, s, e, n = bbox
        f = ((pc.field("bbox", "xmin") > w) & (pc.field("bbox", "xmax") < e)
             & (pc.field("bbox", "ymin") > s) & (pc.field("bbox", "ymax") < n))
        rows = d.to_table(filter=f, columns=OVERTURE_COLUMNS).to_pylist()
        out = []
        for r in rows:
            bb = r["bbox"]
            srcs = r.get("sources") or []
            out.append({
                "id": r["id"],
                "name": (r.get("names") or {}).get("primary"),
                "basic_category": r.get("basic_category"),
                "taxonomy": (r.get("taxonomy") or {}).get("primary"),
                "confidence": r.get("confidence"),
                "operating_status": r.get("operating_status"),
                "websites": r.get("websites") or [],
                "phones": r.get("phones") or [],
                "datasets": sorted({x.get("dataset") for x in srcs if x.get("dataset")}),
                "update_time": max((x.get("update_time") or "" for x in srcs), default="") or None,
                "lat": (bb["ymin"] + bb["ymax"]) / 2,
                "lon": (bb["xmin"] + bb["xmax"]) / 2,
                "address": ((r.get("addresses") or [{}])[0] or {}).get("freeform"),
            })
        return out

    return cache.get_or_fetch("overture", key, go)


# ---------------------------------------------------------------------------
# Wikidata
# ---------------------------------------------------------------------------
def wikidata_box_query(bbox: list[float]) -> str:
    w, s, e, n = bbox
    return f"""
SELECT ?item ?itemLabel ?itemDescription ?coord ?image ?inst ?instLabel ?heritage
       ?osmNode ?osmWay ?osmRel ?website ?commonsCat ?sitelinks ?enwiki ?eswiki WHERE {{
  SERVICE wikibase:box {{
    ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:cornerSouthWest "Point({w} {s})"^^geo:wktLiteral .
    bd:serviceParam wikibase:cornerNorthEast "Point({e} {n})"^^geo:wktLiteral .
  }}
  OPTIONAL {{ ?item wdt:P31 ?inst . }}
  OPTIONAL {{ ?item wdt:P18 ?image . }}
  OPTIONAL {{ ?item wdt:P1435 ?heritage . }}
  OPTIONAL {{ ?item wdt:P11693 ?osmNode . }}
  OPTIONAL {{ ?item wdt:P10689 ?osmWay . }}
  OPTIONAL {{ ?item wdt:P402 ?osmRel . }}
  OPTIONAL {{ ?item wdt:P856 ?website . }}
  OPTIONAL {{ ?item wdt:P373 ?commonsCat . }}
  OPTIONAL {{ ?item wikibase:sitelinks ?sitelinks . }}
  OPTIONAL {{ ?enwiki schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . }}
  OPTIONAL {{ ?eswiki schema:about ?item ; schema:isPartOf <https://es.wikipedia.org/> . }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en,es,fr,eu,gl,pt". }}
}}
"""


def fetch_wikidata(cache: Cache, bbox: list[float]) -> list[dict]:
    q = wikidata_box_query(bbox)

    def go():
        r = _session().get(WIKIDATA_SPARQL, params={"query": q, "format": "json"},
                           headers={"Accept": "application/sparql-results+json"}, timeout=120)
        r.raise_for_status()
        return r.json()

    raw = cache.get_or_fetch("wikidata", q, lambda: _retry(go))
    items: dict[str, dict] = {}
    for b in raw["results"]["bindings"]:
        v = {k: x["value"] for k, x in b.items()}
        qid = v["item"].rsplit("/", 1)[-1]
        it = items.setdefault(qid, {
            "qid": qid, "label": v.get("itemLabel"), "description": v.get("itemDescription"),
            "instances": set(), "images": set(), "heritage": set(), "osm": set(),
            "website": v.get("website"), "commons_category": v.get("commonsCat"),
            "sitelinks": int(v.get("sitelinks", 0) or 0),
            "enwiki": v.get("enwiki"), "eswiki": v.get("eswiki"), "lat": None, "lon": None,
        })
        if v.get("coord", "").startswith("Point(") and it["lat"] is None:
            lon, lat = v["coord"][6:-1].split()
            it["lat"], it["lon"] = float(lat), float(lon)
        if v.get("instLabel"):
            it["instances"].add(v["instLabel"])
        if v.get("image"):
            it["images"].add(requests.utils.unquote(v["image"].rsplit("/", 1)[-1]))
        if v.get("heritage"):
            it["heritage"].add(v["heritage"].rsplit("/", 1)[-1])
        for k, t in (("osmNode", "node"), ("osmWay", "way"), ("osmRel", "relation")):
            if v.get(k):
                it["osm"].add(f"{t}/{v[k]}")
    out = []
    for it in items.values():
        if it["lat"] is None:
            continue
        for k in ("instances", "images", "heritage", "osm"):
            it[k] = sorted(it[k])
        out.append(it)
    return out


# ---------------------------------------------------------------------------
# Wikimedia Commons
# ---------------------------------------------------------------------------
def fetch_commons_info(cache: Cache, filenames: Iterable[str]) -> dict[str, dict]:
    """Licence, author, coordinates and a 640px thumbnail for each Commons file."""
    names = sorted({n.replace("_", " ") for n in filenames if n})
    out: dict[str, dict] = {}
    for i in range(0, len(names), 40):
        chunk = names[i:i + 40]
        titles = "|".join(f"File:{n}" for n in chunk)
        params = {
            "action": "query", "format": "json", "formatversion": "2", "titles": titles,
            "prop": "imageinfo|coordinates", "iiprop": "url|extmetadata|size",
            "iiurlwidth": "640", "colimit": "max",
        }

        def go(params=params):
            r = _session().get(COMMONS_API, params=params, timeout=60)
            r.raise_for_status()
            return r.json()

        raw = cache.get_or_fetch("commons", titles, lambda: _retry(go))
        for page in raw.get("query", {}).get("pages", []):
            name = page["title"].split(":", 1)[1]
            ii = (page.get("imageinfo") or [{}])[0]
            md = ii.get("extmetadata", {})

            def m(k):
                return (md.get(k) or {}).get("value")

            coords = (page.get("coordinates") or [{}])[0]
            out[name] = {
                "file": name,
                "missing": page.get("missing", False),
                "page_url": ii.get("descriptionurl"),
                "thumb_url": ii.get("thumburl"),
                "license": m("LicenseShortName"),
                "license_url": m("LicenseUrl"),
                "attribution_required": m("AttributionRequired"),
                "artist": _strip_html(m("Artist")),
                "credit": _strip_html(m("Credit")),
                "lat": coords.get("lat"),
                "lon": coords.get("lon"),
                "width": ii.get("width"),
                "height": ii.get("height"),
            }
    return out


def fetch_commons_nearby(cache: Cache, lat: float, lon: float, radius_m: int = 150, limit: int = 8) -> list[str]:
    """Geotagged Commons files near a point (candidate photos for places without one)."""
    params = {
        "action": "query", "format": "json", "formatversion": "2", "list": "geosearch",
        "gscoord": f"{lat:.6f}|{lon:.6f}", "gsradius": str(radius_m), "gsnamespace": "6",
        "gslimit": str(limit),
    }

    def go():
        r = _session().get(COMMONS_API, params=params, timeout=60)
        r.raise_for_status()
        return r.json()

    raw = cache.get_or_fetch("commons-geo", json.dumps(params, sort_keys=True), lambda: _retry(go))
    return [g["title"].split(":", 1)[1] for g in raw.get("query", {}).get("geosearch", [])]


def _strip_html(s: Any) -> str | None:
    if not s:
        return None
    import re
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", str(s))).strip() or None
