"""Official open data of Navarra (Gobierno de Navarra) as a source next to OpenStreetMap.

Found through the datos.gob.es catalogue API (two title searches), downloaded from the publisher's own
portal (datosabiertos.navarra.es): five requests in all, 2 s apart, every answer cached with
``sources.Cache`` so a run can be replayed with ``--offline``. Three tables are read (rows as of 2026-11-07):

* ``albergues``: a15002917-albergues-turisticos-en-activo-del-registro-de-turismo-de-navarra1, the
  Registro de Turismo de Navarra, 115 rows: registry id, name, address, beds, and the owner's contact
  where consent was given.
* ``fuentes``: a15002917-fuentes-del-camino-de-santiago1, 32 rows (20 on the Camino Frances, 12 on the
  Aragones): a position and a stage, nothing else.
* ``senales``: a15002917-senales-del-camino-de-santiago ("Donejakue bidearen seinaleak"), 735 waymarks.
  Not places: position, type and stage.

What the tables do NOT have (read on 2026-11-07, repeated in the README):

* The albergue registry has **no coordinates** (its XSD lists 15 columns, none of them a position) and
  **no prices, no opening season, no operator**. So an albergue row is a ``Lodging``, not a ``Record``: it
  becomes a ``Record`` only once something gives it a position (``Lodging.to_record(lat, lon)``, for
  example the OSM place it matches in ``navarra_compare``).
* Contact fields are filled for a handful of rows only. For every owner who did not consent the table
  says "No se consiente la publicacion" (106 of 115 emails, 108 of 115 phones). That text is never kept as
  data: the value is None and ``tags["contact_withheld"]`` says why.
* The fountains table lists "all fountains, those with sanitary guarantee and those without" and does
  not say which is which. They are therefore category ``fountain`` (never ``water``, our drinking-water
  category) and ``tags["potable"] == "unknown"``.

Coordinates of fountains and waymarks are UTM 30N metres in **ED50** (EPSG:23030), not ETRS89. Neither the
catalogue nor the portal says so ("coordenadas UTM"); it was found by reading them both ways: read as ED50,
134 of the 140 stage-1 waymarks lie within 30 m of the real OSM route (median 2.6 m); read as ETRS89 only 24
do (median 104 m), and two fountains land within 10 m of OSM drinking-water points instead of 235 m. See
``navarra_compare.crs_evidence`` to repeat the check. ``utm.py`` converts without pyproj.

Licence: every dataset's catalogue entry carries ``license``; the publisher's CKAN API says the same
(``license_id`` CC-BY-4.0). ``resolve_licence`` refuses to run when the licence is missing, unknown or not
on ``ACCEPTED_LICENCES`` (see ``LicenceError``), before a single data file is downloaded. Every record
carries an ``Attribution`` (``tags["attribution"]``) with the credit line the importer shows.

    python -m poi_audit.opendata_navarra --cache cache            # fetch (or reuse) and print a summary
    python -m poi_audit.opendata_navarra --cache cache --offline  # replay only
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
import time
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote

import requests

from .normalize import ALBERGUE_RX, Record, fold
from .sources import Cache
from .utm import utm_to_wgs84

SOURCE = "navarra"
PUBLISHER = "Gobierno de Navarra"
PUBLISHER_ID = "A15002917"  # DIR3 code in the catalogue ("Organismo/A15002917")
USER_AGENT = "CaminoPlus-POI-audit/0.1 (https://camino.plus; open data import from datos.gob.es and datosabiertos.navarra.es)"
CATALOG_API = "https://datos.gob.es/apidata/catalog/dataset/title/"
CATALOG_PAGE_SIZE = 50
CATALOG_MAX_PAGES = 10
PAUSE_S = 2.0                # between two requests (to any host)
RETRY_WAITS_S = (30, 90)     # after a 403 / 429 / 5xx: wait, try again, give up (3 requests at most per URL)
MAX_BYTES = 5_000_000        # the three tables are 3 to 70 KB; anything near this is not what we think
NAVARRA_BBOX = (-2.55, 41.90, -0.68, 43.35)  # west, south, east, north: a converted point outside is a wrong zone or datum


class SourceError(RuntimeError):
    """The catalogue or the portal could not be read."""


class SourceBlocked(SourceError):
    """HTTP 403 / 429 from a firewall. The adapter waits and retries twice, then stops: it never tries to get around a block."""


class LicenceError(ValueError):
    """The licence is missing, unknown or not accepted: nothing is downloaded."""


class RowError(ValueError):
    """A row that cannot be used. The message is the reason shown in the skipped list."""


# ---------------------------------------------------------------------------
# licences
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class Licence:
    id: str       # SPDX style id
    label: str    # what the credit line says
    url: str      # the licence text
    published: str = ""  # exactly the value read in the catalogue (set by resolve_licence)


_EU = "http://publications.europa.eu/resource/authority/licence/"
KNOWN_LICENCES: dict[str, tuple[Licence, tuple[str, ...]]] = {}


def _register(lic: Licence, *aliases: str) -> None:
    KNOWN_LICENCES[lic.id] = (lic, aliases)


_register(Licence("CC-BY-4.0", "CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/"),
          _EU + "CC_BY_4_0", "https://creativecommons.org/licenses/by/4.0/", "CC BY 4.0", "CC_BY_4_0")
_register(Licence("CC0-1.0", "CC0 1.0", "https://creativecommons.org/publicdomain/zero/1.0/"),
          _EU + "CC0_1_0", "https://creativecommons.org/publicdomain/zero/1.0/", "CC0", "CC0 1.0")
# Known on purpose, so that the refusal can say what it is. Share-alike would reach the CaminoPlus
# database, non-commercial and no-derivatives cannot be used in a paid app.
_register(Licence("CC-BY-SA-4.0", "CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/"),
          _EU + "CC_BYSA_4_0", "https://creativecommons.org/licenses/by-sa/4.0/", "CC BY-SA 4.0")
_register(Licence("CC-BY-NC-4.0", "CC BY-NC 4.0", "https://creativecommons.org/licenses/by-nc/4.0/"),
          _EU + "CC_BYNC_4_0", "https://creativecommons.org/licenses/by-nc/4.0/", "CC BY-NC 4.0")
_register(Licence("CC-BY-ND-4.0", "CC BY-ND 4.0", "https://creativecommons.org/licenses/by-nd/4.0/"),
          _EU + "CC_BYND_4_0", "https://creativecommons.org/licenses/by-nd/4.0/", "CC BY-ND 4.0")
ACCEPTED_LICENCES = frozenset({"CC-BY-4.0", "CC0-1.0"})


def _licence_key(s: str) -> str:
    return re.sub(r"^https?://", "", s.strip().lower()).rstrip("/")


_ALIAS = {_licence_key(a): lic for lic, aliases in KNOWN_LICENCES.values() for a in (lic.id, lic.label, *aliases)}


def resolve_licence(published: Any, explicit: str | None = None, accepted: frozenset[str] = ACCEPTED_LICENCES) -> Licence:
    """The licence of a dataset, or LicenceError.

    `published` is the catalogue's ``license`` value (a URI, a list of URIs, or None). `explicit` is a
    value the operator passes when the catalogue has none; it can never override a published one that says
    something else. The result carries the published value exactly as read."""
    values = [published] if isinstance(published, str) else [v for v in (published or []) if isinstance(v, str)]
    values = [v.strip() for v in values if v.strip()]
    if not values and not explicit:
        raise LicenceError("the catalogue entry has no licence and none was passed explicitly: refusing to use the data "
                           "(pass licence='CC-BY-4.0' only after reading the terms on the publisher's page)")
    found: dict[str, Licence] = {}
    for v in values:
        lic = _ALIAS.get(_licence_key(v))
        if lic is None:
            raise LicenceError(f"unknown licence {v!r}: refusing. Add it to KNOWN_LICENCES after a human has read its terms")
        found[lic.id] = Licence(lic.id, lic.label, lic.url, v)
    if len(found) > 1:
        raise LicenceError(f"the catalogue lists several different licences ({', '.join(sorted(found))}): refusing")
    if explicit:
        lic = _ALIAS.get(_licence_key(explicit))
        if lic is None:
            raise LicenceError(f"unknown licence {explicit!r}: refusing")
        if found and lic.id not in found:
            raise LicenceError(f"the catalogue says {next(iter(found))}, the caller says {lic.id}: refusing to guess")
        chosen = next(iter(found.values())) if found else Licence(lic.id, lic.label, lic.url, "")
    else:
        chosen = next(iter(found.values()))
    if chosen.id not in accepted:
        raise LicenceError(f"{chosen.label} is not on the accepted list ({', '.join(sorted(accepted))}): refusing")
    return chosen


# ---------------------------------------------------------------------------
# attribution
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class Attribution:
    publisher: str
    dataset: str                 # title as published
    dataset_url: str             # catalogue page on datos.gob.es
    portal_url: str | None       # the publisher's own page for the dataset
    download_url: str
    licence: str                 # CC-BY-4.0
    licence_label: str           # CC BY 4.0
    licence_url: str             # text of the licence
    licence_published: str       # as read in the catalogue
    retrieved: str               # YYYY-MM-DD (UTC), the day the file was downloaded
    modified: str | None         # YYYY-MM-DD, when the catalogue says the dataset last changed
    changes: str                 # CC BY 4.0 asks us to say that we changed the data

    @property
    def credit(self) -> str:
        """The line the app shows."""
        return f"Contains public sector information of {self.publisher}, {self.licence_label}"

    @property
    def credit_full(self) -> str:
        """The longer notice for a credits page: who, which dataset, which licence, what we changed."""
        return (f"{self.credit} ({self.licence_url}). Dataset: {self.dataset}, {self.portal_url or self.dataset_url}, "
                f"retrieved {self.retrieved}. {self.changes}")

    def as_dict(self) -> dict[str, Any]:
        return {"publisher": self.publisher, "dataset": self.dataset, "dataset_url": self.dataset_url,
                "portal_url": self.portal_url, "download_url": self.download_url, "licence": self.licence,
                "licence_label": self.licence_label, "licence_url": self.licence_url,
                "licence_published": self.licence_published, "retrieved": self.retrieved, "modified": self.modified,
                "changes": self.changes, "credit": self.credit}


# ---------------------------------------------------------------------------
# datasets
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class DatasetSpec:
    key: str
    slug: str     # last part of the catalogue URL (_about)
    query: str    # words of the Spanish title, as the catalogue's title search wants them (one phrase, accents matter)
    kind: str     # lodging | fountain | waymark
    crs: str | None = None  # EPSG code of the COORD_X / COORD_Y columns
    changes: str = ""


DATASETS: dict[str, DatasetSpec] = {s.key: s for s in (
    DatasetSpec("albergues", "a15002917-albergues-turisticos-en-activo-del-registro-de-turismo-de-navarra1",
                "Albergues turísticos en activo del Registro de Turismo de Navarra", "lodging",
                changes="Changed by CaminoPlus: names and contact fields normalised, categories mapped; the source has no coordinates."),
    DatasetSpec("fuentes", "a15002917-fuentes-del-camino-de-santiago1", "Camino de Santiago", "fountain", crs="EPSG:23030",
                changes="Changed by CaminoPlus: UTM 30N coordinates (ED50) converted to WGS84."),
    DatasetSpec("senales", "a15002917-senales-del-camino-de-santiago", "Camino de Santiago", "waymark", crs="EPSG:23030",
                changes="Changed by CaminoPlus: UTM 30N coordinates (ED50) converted to WGS84."),
)}
DEFAULT_DATASETS = tuple(DATASETS)


# ---------------------------------------------------------------------------
# HTTP and cache
# ---------------------------------------------------------------------------
_last_request = 0.0


def _log(message: str) -> None:
    print(message, file=sys.stderr)


def _get(url: str, accept: str) -> requests.Response:
    """One polite GET: at least PAUSE_S after the previous request, a descriptive User-Agent, a timeout."""
    global _last_request
    wait = PAUSE_S - (time.monotonic() - _last_request)
    if wait > 0:
        time.sleep(wait)
    try:
        return requests.get(url, headers={"User-Agent": USER_AGENT, "Accept": accept}, timeout=60)
    finally:
        _last_request = time.monotonic()


def _request(url: str, accept: str) -> bytes:
    """The body of `url`. 403 / 429 / 5xx are retried twice after a pause, then SourceBlocked / SourceError."""
    status = None
    for attempt in range(len(RETRY_WAITS_S) + 1):
        if attempt:
            _log(f"  {url} answered {status}: waiting {RETRY_WAITS_S[attempt - 1]} s before asking again")
            time.sleep(RETRY_WAITS_S[attempt - 1])
        try:
            r = _get(url, accept)
        except requests.RequestException as e:
            raise SourceError(f"{url}: {e}") from e
        status = r.status_code
        if status == 200:
            if len(r.content) > MAX_BYTES:
                raise SourceError(f"{url}: {len(r.content)} bytes is far more than this table should be: refusing")
            return r.content
        if status not in (403, 429, 500, 502, 503, 504):
            raise SourceError(f"{url}: HTTP {status}")
    if status in (403, 429):
        raise SourceBlocked(f"{url}: HTTP {status} {len(RETRY_WAITS_S) + 1} times. The server is blocking us; not trying to get "
                            "around it. Run again later, or from the cache (--offline)")
    raise SourceError(f"{url}: HTTP {status} {len(RETRY_WAITS_S) + 1} times")


def _catalogue_page(query: str, page: int) -> dict:
    url = f"{CATALOG_API}{quote(query, safe='')}?_pageSize={CATALOG_PAGE_SIZE}&_page={page}"
    try:
        return json.loads(_request(url, "application/json").decode("utf-8-sig"))
    except ValueError as e:
        raise SourceError(f"{url}: not JSON ({e})") from e


def catalogue_items(cache: Cache, query: str) -> list[dict]:
    """Datasets whose title contains `query` (the catalogue's title search), all pages, from the cache when there."""
    items: list[dict] = []
    for page in range(CATALOG_MAX_PAGES):
        data = cache.get_or_fetch("navarra-catalogue", f"{query}|size={CATALOG_PAGE_SIZE}|page={page}",
                                  lambda p=page: _catalogue_page(query, p))
        batch = (data.get("result") or {}).get("items") or []
        items.extend(batch)
        if len(batch) < CATALOG_PAGE_SIZE:
            break
    return items


def find_item(items: list[dict], slug: str) -> dict:
    for it in items:
        if str(it.get("_about", "")).rstrip("/").endswith("/" + slug):
            return it
    near = sorted({str(it.get("_about", "")).rsplit("/", 1)[-1] for it in items})[:8]
    raise SourceError(f"the catalogue has no dataset {slug!r} for that title search (it lists: {', '.join(near) or 'nothing'})")


_ES_MONTHS = {m: i for i, m in enumerate(["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"], 1)}


def catalogue_date(text: Any) -> str | None:
    """'vie, 09 oct 2026 09:14:39 GMT+0000' (the catalogue's Spanish format) to '2026-10-09', or None."""
    m = re.search(r"(\d{1,2})\s+([a-z]{3})[a-z]*\.?\s+(\d{4})", str(text or "").lower())
    if m and m.group(2) in _ES_MONTHS:
        return f"{int(m.group(3)):04d}-{_ES_MONTHS[m.group(2)]:02d}-{int(m.group(1)):02d}"
    m = re.match(r"(\d{4}-\d{2}-\d{2})", str(text or ""))
    return m.group(1) if m else None


def item_title(item: dict, lang: str = "es") -> str:
    titles = item.get("title") or []
    if isinstance(titles, dict):
        titles = [titles]
    if isinstance(titles, str):
        return titles
    by_lang = {t.get("_lang"): t.get("_value") for t in titles if isinstance(t, dict)}
    return by_lang.get(lang) or next(iter(by_lang.values()), "") or item.get("_about", "")


@dataclass(frozen=True)
class Distribution:
    url: str
    format: str  # json | csv | xml | shp | html | other


def _format_of(dist: dict) -> str:
    fmt = dist.get("format")
    if isinstance(fmt, dict):
        fmt = fmt.get("value") or fmt.get("_about") or ""
    tail = str(fmt or "").lower().rsplit("/", 1)[-1]
    url = str(dist.get("accessURL") or "").lower()
    for name in ("json", "csv", "xml", "shp", "html"):
        if name in tail:
            return name
    if "format=json" in url:
        return "json"
    if "format=csv" in url:
        return "csv"
    return "other"


def distributions(item: dict) -> list[Distribution]:
    raw = item.get("distribution") or []
    if isinstance(raw, dict):
        raw = [raw]
    out, seen = [], set()
    for d in raw:
        url = d.get("accessURL")
        if url and url not in seen:
            seen.add(url)
            out.append(Distribution(url, _format_of(d)))
    return out


def pick_distribution(item: dict, prefer: tuple[str, ...] = ("json", "csv")) -> Distribution:
    """JSON first, then CSV (never SHP, XML or the HTML table). The portal's /datastore/dump/ link is the stable one."""
    dists = distributions(item)
    for fmt in prefer:
        of = [d for d in dists if d.format == fmt]
        if of:
            return next((d for d in of if "/datastore/dump/" in d.url), of[0])
    have = ", ".join(sorted({d.format for d in dists})) or "no distribution"
    raise SourceError(f"{item_title(item)}: no {' or '.join(prefer)} distribution (the catalogue lists: {have})")


@dataclass(frozen=True)
class Download:
    url: str
    retrieved_at: str  # ISO 8601, UTC
    text: str


def fetch_download(cache: Cache, url: str) -> Download:
    def go() -> dict:
        body = _request(url, "application/json, text/csv, */*")
        try:
            text = body.decode("utf-8-sig")
        except UnicodeDecodeError as e:
            raise SourceError(f"{url}: not UTF-8 ({e})") from e
        return {"url": url, "retrieved_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "text": text}

    raw = cache.get_or_fetch("navarra-data", url, go)
    return Download(raw["url"], raw["retrieved_at"], raw["text"])


def parse_table(text: str) -> list[dict[str, str | None]]:
    """Rows of a portal download as dicts of cleaned strings. Reads the datastore JSON ({"fields": [...],
    "records": [[...]]}) and CSV (comma, semicolon or tab). Empty cells are None."""
    t = text.lstrip("\ufeff")
    if t.lstrip().startswith("{"):
        obj = json.loads(t)
        cols = [f["id"] if isinstance(f, dict) else f for f in obj.get("fields", [])]
        rows = [r if isinstance(r, dict) else dict(zip(cols, r)) for r in obj.get("records", [])]
    else:
        first = t.splitlines()[0] if t.strip() else ""
        delim = max(",;\t", key=first.count)
        rows = list(csv.DictReader(io.StringIO(t), delimiter=delim))
    return [{str(k).strip(): _clean(v) for k, v in r.items() if k is not None} for r in rows]


def _clean(v: Any) -> str | None:
    s = re.sub(r"\s+", " ", str(v)).strip() if v is not None else ""
    return s or None


# ---------------------------------------------------------------------------
# lodgings (the registry: no coordinates)
# ---------------------------------------------------------------------------
REFUSED_TEXT = fold("No se consiente la publicación")


@dataclass
class Lodging:
    """One row of the albergue registry. It has no position: see the module docstring."""
    source_id: str          # COD_INSCRIPCION in upper case, e.g. UAB00062
    name: str
    category: str           # a CaminoPlus category (albergue_municipal, albergue_parochial, albergue_private, hostel)
    tags: dict[str, Any] = field(default_factory=dict)
    source: str = SOURCE

    @property
    def key(self) -> str:
        return f"{self.source}:{self.source_id}"

    @property
    def family(self) -> str:
        return "stay"

    def to_record(self, lat: float, lon: float) -> Record:
        """The same place as a normalize.Record, once a position is known (for example from the OSM place it matches)."""
        return Record(source=self.source, source_id=self.source_id, name=self.name, category=self.category,
                      lat=lat, lon=lon, tags=dict(self.tags))

    def as_dict(self) -> dict[str, Any]:
        return {"key": self.key, "name": self.name, "category": self.category, **self.tags}


def split_address(text: str | None) -> tuple[str | None, str | None]:
    """('Elizaldea', '52') from 'Elizaldea 52'. The registry writes the street without its type and uses 0 for
    'no number', which is returned as None. Text before the first standalone number is the street."""
    if not text:
        return None, None
    tokens = text.split()
    for i, tok in enumerate(tokens):
        if re.fullmatch(r"\d{1,4}[A-Za-z]?", tok):
            street = " ".join(tokens[:i]) or None
            return street, (None if int(re.sub(r"\D", "", tok)) == 0 else tok)
    return text, None


def contact_state(value: str | None) -> str:
    """ok | refused ("No se consiente la publicación") | unknown ("Desconocido...") | empty."""
    if not value:
        return "empty"
    f = fold(value)
    if f == REFUSED_TEXT:
        return "refused"
    if f.startswith("desconocido"):
        return "unknown"
    return "ok"


def normalise_phone(value: str) -> str | None:
    """+34948203090 for a Spanish number written with or without spaces and country code, else None."""
    digits = re.sub(r"\D", "", value)
    if value.strip().startswith("+") and 8 <= len(digits) <= 15:
        return "+" + digits
    if len(digits) == 11 and digits.startswith("34") and digits[2] in "6789":
        return "+" + digits
    if len(digits) == 9 and digits[0] in "6789":
        return "+34" + digits
    return None


def normalise_website(value: str) -> str | None:
    v = value.strip().rstrip("/")
    if " " in v or "." not in v:
        return None
    return v if re.match(r"https?://", v, re.I) else "https://" + v


def normalise_email(value: str) -> str | None:
    v = value.strip().lower()
    return v if re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", v) else None


def lodging_category(name: str, registry_category: str | None) -> str:
    """Our category for a registry row. The registry names no operator, so the name decides (as in
    normalize.osm_category). A row "del Camino de Santiago", or a name that says albergue, is a pilgrim hostel;
    anything else ("1ª / 2ª Categoria") is a plain hostel."""
    low = fold(name)
    on_camino = "camino de santiago" in fold(registry_category or "")
    if on_camino or ALBERGUE_RX.search(name):
        if "municipal" in low:
            return "albergue_municipal"
        if "parroquial" in low or "parroquia" in low:
            return "albergue_parochial"
        return "albergue_private"
    return "hostel"


def lodging_from_row(row: dict[str, str | None], attribution: Attribution, issues: Counter | None = None) -> Lodging:
    """A Lodging from one registry row, or RowError. Unusable single fields become None and are counted in `issues`."""
    issues = issues if issues is not None else Counter()
    rid = (row.get("COD_INSCRIPCION") or "").upper()
    if not rid:
        raise RowError("no registry id (COD_INSCRIPCION)")
    if not re.fullmatch(r"[A-Z]{1,5}\d+", rid):
        raise RowError(f"registry id {rid!r} is not of the form UAB00062")
    name = row.get("NOMBRE")
    if not name:
        raise RowError(f"{rid}: no name")

    def number(col: str, low: int, high: int) -> int | None:
        v = row.get(col)
        if v is None:
            return None
        if not re.fullmatch(r"\d+", v) or not low <= int(v) <= high:
            issues[f"{col}: not a number between {low} and {high}"] += 1
            return None
        return int(v)

    beds = number("PLAZAS", 1, 3000)
    extra = number("SUPLETORIAS", 0, 3000)
    registered = None
    if row.get("FECHA_DE_INSCRIPCION"):
        try:
            registered = datetime.strptime(row["FECHA_DE_INSCRIPCION"], "%d/%m/%Y").date().isoformat()
        except ValueError:
            issues["FECHA_DE_INSCRIPCION: not dd/mm/yyyy"] += 1
    postcode = row.get("CODIGO_POSTAL")
    if postcode and not re.fullmatch(r"\d{5}", postcode):
        issues["CODIGO_POSTAL: not 5 digits"] += 1
        postcode = None

    contact: dict[str, str | None] = {}
    states = {}
    for col, key, norm in (("TELEFONO_RESERVAS_1", "phone", normalise_phone), ("EMAIL", "email", normalise_email),
                           ("WEB", "website", normalise_website)):
        raw = row.get(col)
        states[key] = contact_state(raw)
        if states[key] == "ok":
            contact[key] = norm(raw)
            if contact[key] is None:
                issues[f"{col}: not usable ({key})"] += 1
        else:
            contact[key] = None
    street, housenumber = split_address(row.get("DIRECCION"))
    registry_category = row.get("CATEGORIA")
    if contact_state(registry_category) == "unknown":  # "Desconocido" is a placeholder, not a category
        registry_category = None
    tags = {
        "registry_id": rid, "modality": row.get("MODALIDAD"), "registry_category": registry_category,
        "on_camino": "camino de santiago" in fold(registry_category or ""),
        "address": row.get("DIRECCION"), "street": street, "housenumber": housenumber, "postcode": postcode,
        "locality": row.get("LOCALIDAD"), "municipality": row.get("MUNICIPIO"), "subzone": row.get("SUB_ZONA"),
        "capacity": beds, "extra_beds": extra, "registered": registered,
        **contact,
        # "No se consiente la publicación": the owner did not consent, so an empty field here is not "no phone"
        "contact_withheld": "refused" in states.values(),
        "attribution": attribution.as_dict(),
    }
    return Lodging(source_id=rid, name=name, category=lodging_category(name, registry_category), tags=tags)


# ---------------------------------------------------------------------------
# fountains and waymarks (UTM columns)
# ---------------------------------------------------------------------------
@dataclass
class Waymark:
    """A sign on the way (mojon, arrow, panel ...). Not a place: it is only useful as geometry and as a count."""
    source_id: str
    camino: str          # Francés | Aragonés | Lepoeder | Zaraputz
    stage: str | None    # F1 ... F7, A1 ... A3
    stage_label: str | None
    kind: str            # mojon | flecha | cruce_carretera | poste_seguridad | panel | pintura | otros
    kind_raw: str | None
    lat: float
    lon: float
    utm_x: int           # the numbers as published, and the system they are read in
    utm_y: int
    crs: str
    attribution: Attribution
    source: str = SOURCE

    @property
    def key(self) -> str:
        return f"{self.source}:{self.source_id}"


WAYMARK_KINDS = {"mojon": "mojon", "flecha direccional": "flecha", "senal cruce carretera": "cruce_carretera",
                 "poste de seguridad": "poste_seguridad", "panel informativo": "panel", "pinturas": "pintura", "otros": "otros"}


def _stage(label: str | None) -> tuple[str | None, str | None]:
    """('F1', 'F1 (Francia-Orreaga/Roncesvalles)') from the ETAPA column."""
    if not label:
        return None, None
    m = re.match(r"([A-Z]\d+)\b", label)
    return (m.group(1) if m else None), label


def _utm_point(row: dict[str, str | None], crs: str) -> tuple[float, float, str, str]:
    """(lat, lon, x, y) of a COORD_X / COORD_Y row in `crs`, or RowError."""
    xs, ys = row.get("COORD_X"), row.get("COORD_Y")
    try:
        x, y = float(str(xs).replace(",", ".")), float(str(ys).replace(",", "."))
    except (TypeError, ValueError):
        raise RowError(f"coordinates missing or not numbers (COORD_X={xs!r}, COORD_Y={ys!r})") from None
    lat, lon = utm_to_wgs84(x, y, crs)
    w, s, e, n = NAVARRA_BBOX
    if not (s <= lat <= n and w <= lon <= e):
        raise RowError(f"({x:.0f}, {y:.0f}) is at {lat:.4f}, {lon:.4f}, outside Navarra: wrong zone or datum?")
    return lat, lon, f"{x:.0f}", f"{y:.0f}"


def fountain_from_row(row: dict[str, str | None], attribution: Attribution, crs: str = "EPSG:23030") -> Record:
    lat, lon, x, y = _utm_point(row, crs)
    stage, label = _stage(row.get("ETAPA"))
    return Record(
        source=SOURCE, source_id=f"fuente-{x}-{y}", name=None, category="fountain", lat=lat, lon=lon,
        tags={"camino": row.get("CAMINO"), "stage": stage, "stage_label": label, "municipality": row.get("MUNICIPIO"),
              # the table lists fountains with and without sanitary guarantee and does not say which
              "potable": "unknown", "utm_x": int(x), "utm_y": int(y), "crs": crs, "row_id": row.get("_id"),
              "attribution": attribution.as_dict()})


def waymark_from_row(row: dict[str, str | None], attribution: Attribution, crs: str = "EPSG:23030") -> Waymark:
    code = row.get("CODIGO")
    if not code:
        raise RowError("no waymark code (CODIGO)")
    lat, lon, x, y = _utm_point(row, crs)
    stage, label = _stage(row.get("ETAPA"))
    raw = row.get("TIPO_SENAL")
    return Waymark(source_id=f"senal-{code}", camino=row.get("CAMINO") or "", stage=stage, stage_label=label,
                   kind=WAYMARK_KINDS.get(fold(raw or ""), "otros"), kind_raw=raw, lat=lat, lon=lon,
                   utm_x=int(x), utm_y=int(y), crs=crs, attribution=attribution)


# ---------------------------------------------------------------------------
# loading
# ---------------------------------------------------------------------------
@dataclass
class Skipped:
    dataset: str
    ref: str       # registry id, waymark code or row number
    reason: str


@dataclass
class NavarraData:
    lodgings: list[Lodging] = field(default_factory=list)
    fountains: list[Record] = field(default_factory=list)
    waymarks: list[Waymark] = field(default_factory=list)
    skipped: list[Skipped] = field(default_factory=list)
    issues: Counter = field(default_factory=Counter)          # "albergues: PLAZAS: not a number ..." -> rows
    attributions: dict[str, Attribution] = field(default_factory=dict)

    def __len__(self) -> int:
        """Rows kept. audit.collect() prints len(result), so load() can be wrapped by it as it is."""
        return len(self.lodgings) + len(self.fountains) + len(self.waymarks)

    def status(self) -> str:
        """One line for the Sources table of report.md."""
        text = f"{len(self.lodgings)} lodgings (no positions), {len(self.fountains)} fountains, {len(self.waymarks)} waymarks"
        return f"ok ({text}; {len(self.skipped)} rows skipped)"


def load(cache: Cache, datasets: tuple[str, ...] = DEFAULT_DATASETS, licence: str | None = None,
         accepted: frozenset[str] = ACCEPTED_LICENCES) -> NavarraData:
    """Read the datasets. Licences are settled for every dataset first: a refusal raises LicenceError before any
    data file is requested. SourceError / SourceBlocked when the catalogue or the portal cannot be read."""
    specs = [DATASETS[k] for k in datasets]
    items: dict[str, dict] = {}
    catalogue: dict[str, list[dict]] = {}
    for spec in specs:
        if spec.query not in catalogue:
            catalogue[spec.query] = catalogue_items(cache, spec.query)
        items[spec.key] = find_item(catalogue[spec.query], spec.slug)
        publisher = items[spec.key].get("publisher") or ""
        publisher = str(publisher[0] if isinstance(publisher, list) and publisher else publisher).rsplit("/", 1)[-1].upper()
        if publisher != PUBLISHER_ID:  # the credit line says who published it: do not print the wrong name
            raise SourceError(f"{spec.slug}: the catalogue names {publisher or 'no publisher'}, not {PUBLISHER} ({PUBLISHER_ID})")
    licences = {spec.key: resolve_licence(items[spec.key].get("license"), licence, accepted) for spec in specs}

    data = NavarraData()
    for spec in specs:
        item, lic = items[spec.key], licences[spec.key]
        dist = pick_distribution(item)
        dl = fetch_download(cache, dist.url)
        attribution = Attribution(
            publisher=PUBLISHER, dataset=item_title(item), dataset_url=str(item.get("_about")),
            portal_url=item.get("identifier") if str(item.get("identifier", "")).startswith("http") else None,
            download_url=dist.url, licence=lic.id, licence_label=lic.label, licence_url=lic.url,
            licence_published=lic.published, retrieved=dl.retrieved_at[:10], modified=catalogue_date(item.get("modified")),
            changes=spec.changes)
        data.attributions[spec.key] = attribution
        seen: set[str] = set()
        for n, row in enumerate(parse_table(dl.text), 1):
            ref = row.get("COD_INSCRIPCION") or row.get("CODIGO") or f"row {n}"
            local: Counter = Counter()
            try:
                if spec.kind == "lodging":
                    lodging = lodging_from_row(row, attribution, local)
                    if lodging.source_id in seen:
                        raise RowError(f"{lodging.source_id}: duplicate registry id (first row kept)")
                    seen.add(lodging.source_id)
                    data.lodgings.append(lodging)
                elif spec.kind == "fountain":
                    data.fountains.append(fountain_from_row(row, attribution, spec.crs or "EPSG:23030"))
                else:
                    way = waymark_from_row(row, attribution, spec.crs or "EPSG:23030")
                    if way.source_id in seen:
                        raise RowError(f"{way.source_id}: duplicate waymark code (first row kept)")
                    seen.add(way.source_id)
                    data.waymarks.append(way)
            except RowError as e:
                data.skipped.append(Skipped(spec.key, str(ref), str(e)))
                continue
            for k, v in local.items():
                data.issues[f"{spec.key}: {k}"] += v
    return data


# ---------------------------------------------------------------------------
# command line
# ---------------------------------------------------------------------------
def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Fetch (or replay from the cache) the Navarra open data and print what it holds.")
    ap.add_argument("--cache", type=Path, default=Path("cache"), help="cache directory (shared with audit.py)")
    ap.add_argument("--offline", action="store_true", help="use cached responses only")
    ap.add_argument("--only", default=",".join(DEFAULT_DATASETS), help="comma list of: " + ", ".join(DATASETS))
    ap.add_argument("--licence", help="licence to assume ONLY when the catalogue entry has none (never overrides a published one)")
    ap.add_argument("--json", type=Path, help="write the parsed rows to this file")
    args = ap.parse_args(argv)
    keys = tuple(k.strip() for k in args.only.split(",") if k.strip())
    unknown = [k for k in keys if k not in DATASETS]
    if unknown:
        ap.error(f"unknown dataset {unknown}; choose from {', '.join(DATASETS)}")
    try:
        data = load(Cache(args.cache, offline=args.offline), keys, licence=args.licence)
    except (LicenceError, SourceError, RuntimeError) as e:
        print(f"REFUSED/FAILED: {e}", file=sys.stderr)
        return 1
    print(data.status())
    for key, a in data.attributions.items():
        print(f"- {key}: {a.dataset}\n    licence {a.licence_label} (published as {a.licence_published}), retrieved {a.retrieved}, "
              f"catalogue says modified {a.modified}\n    {a.credit}")
    for s in data.skipped:
        print(f"skipped {s.dataset} {s.ref}: {s.reason}")
    for k, v in sorted(data.issues.items()):
        print(f"field issue ({v} rows): {k}")
    if args.json:
        args.json.write_text(json.dumps({
            "lodgings": [x.as_dict() for x in data.lodgings],
            "fountains": [{"key": r.key, "category": r.category, "lat": r.lat, "lon": r.lon, **r.tags} for r in data.fountains],
            "waymarks": [{"key": w.key, "camino": w.camino, "stage": w.stage, "kind": w.kind, "lat": w.lat, "lon": w.lon} for w in data.waymarks],
            "skipped": [vars(s) for s in data.skipped]}, ensure_ascii=False, indent=1))
        print(f"wrote {args.json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
