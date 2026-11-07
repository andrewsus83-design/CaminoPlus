"""Shared helpers of the Navarra tests (not a test module: unittest does not collect it).

The files in tests/fixtures/navarra are trimmed REAL downloads of 2026-11-07: the two catalogue API answers,
32 of the 115 albergue rows (JSON and CSV), the 32 fountains (JSON and CSV), 26 of the 735 waymarks, and
46 OpenStreetMap elements of the Navarra side of stage 1 (from the Overpass answer of 2026-11-06)."""
import json
import sys
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from poi_audit import opendata_navarra as nav, sources  # noqa: E402

FIX = Path(__file__).resolve().parent / "fixtures" / "navarra"
RETRIEVED = "2026-11-07T06:22:00+00:00"
CREDIT = "Contains public sector information of Gobierno de Navarra, CC BY 4.0"


def read(name: str) -> str:
    return (FIX / name).read_bytes().decode("utf-8-sig")


def catalogues() -> tuple[dict, dict]:
    return json.loads(read("catalogue_albergues.json")), json.loads(read("catalogue_camino.json"))


def seed(cache_dir, albergues=None, fuentes=None, senales=None, cat_albergues=None, cat_camino=None) -> sources.Cache:
    """A cache holding what a real run would have stored (same kinds and keys): no network is needed."""
    cache = sources.Cache(Path(cache_dir))
    a, c = catalogues()
    a, c = cat_albergues or a, cat_camino or c

    def put(kind, key, obj):
        cache.path(kind, key).write_text(json.dumps(obj))

    put("navarra-catalogue", f"{nav.DATASETS['albergues'].query}|size=50|page=0", a)
    put("navarra-catalogue", f"{nav.DATASETS['fuentes'].query}|size=50|page=0", c)
    for key, text in (("albergues", albergues or read("albergues.json")), ("fuentes", fuentes or read("fuentes.json")),
                      ("senales", senales or read("senales.json"))):
        spec = nav.DATASETS[key]
        url = nav.pick_distribution(nav.find_item(nav.catalogue_items(cache, spec.query), spec.slug)).url
        put("navarra-data", url, {"url": url, "retrieved_at": RETRIEVED, "text": text})
    return cache


def no_network():
    return mock.patch.object(nav, "_get", side_effect=AssertionError("the network must not be used here"))


def attribution() -> nav.Attribution:
    return nav.Attribution(publisher="Gobierno de Navarra", dataset="x", dataset_url="https://datos.gob.es/catalogo/x", portal_url=None,
                           download_url="https://example.org/x.json", licence="CC-BY-4.0", licence_label="CC BY 4.0",
                           licence_url="https://creativecommons.org/licenses/by/4.0/", licence_published="p", retrieved="2026-11-07",
                           modified=None, changes="c")


def albergue_row(**over) -> dict:
    """A clean registry row (made up: the values are not those of a real albergue) to spoil one field at a time."""
    row = {"COD_INSCRIPCION": "UAB00099", "NOMBRE": "Albergue de Prueba", "MODALIDAD": "Albergue turístico",
           "CATEGORIA": "del Camino de Santiago", "DIRECCION": "Mayor 2", "CODIGO_POSTAL": "31100", "LOCALIDAD": "Puente la Reina / Gares",
           "MUNICIPIO": "Puente la Reina / Gares", "SUB_ZONA": "Zona Media", "PLAZAS": "20", "SUPLETORIAS": "0",
           "FECHA_DE_INSCRIPCION": "01/02/2020", "EMAIL": None, "WEB": None, "TELEFONO_RESERVAS_1": None}
    row.update(over)
    return row
