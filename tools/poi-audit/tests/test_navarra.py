"""The Navarra open data adapter, offline. The fixtures in tests/fixtures/navarra are trimmed REAL downloads
(2026-11-07): the catalogue API answers, 32 of the 115 albergue rows, all 32 fountains, 26 of the 735 waymarks.
Run: python -m unittest discover -s tests"""
import contextlib
import copy
import io
import json
import tempfile
import unittest
from collections import Counter
from pathlib import Path
from unittest import mock

from navarra_fixtures import (CREDIT, FIX, albergue_row, attribution, catalogues, no_network, read,  # noqa: E402
                              seed)  # (this import also puts poi_audit on sys.path)
from poi_audit import opendata_navarra as nav, sources  # noqa: E402
from poi_audit.normalize import Record  # noqa: E402

_quiet = mock.patch.object(nav, "_log")  # the retry messages would only clutter the test output


def setUpModule():
    _quiet.start()


def tearDownModule():
    _quiet.stop()


# ---------------------------------------------------------------------------
class Licences(unittest.TestCase):
    URI = "http://publications.europa.eu/resource/authority/licence/CC_BY_4_0"

    def test_the_published_licence_is_accepted_and_kept_exactly_as_published(self):
        lic = nav.resolve_licence(self.URI)
        self.assertEqual((lic.id, lic.label), ("CC-BY-4.0", "CC BY 4.0"))
        self.assertEqual(lic.published, self.URI)
        self.assertEqual(lic.url, "https://creativecommons.org/licenses/by/4.0/")

    def test_every_navarra_catalogue_entry_we_read_says_cc_by_4(self):
        a, c = catalogues()
        published = {it["_about"].rsplit("/", 1)[-1]: it.get("license") for it in a["result"]["items"] + c["result"]["items"]}
        for slug in (nav.DATASETS[k].slug for k in nav.DATASETS):
            self.assertEqual(published[slug], self.URI, slug)

    def test_no_licence_means_refusal(self):
        for missing in (None, "", [], "   "):
            with self.assertRaisesRegex(nav.LicenceError, "no licence"):
                nav.resolve_licence(missing)

    def test_an_unknown_licence_is_refused(self):
        with self.assertRaisesRegex(nav.LicenceError, "unknown licence"):
            nav.resolve_licence("http://example.org/licence/our-own-terms")

    def test_known_licences_we_cannot_use_are_refused_by_name(self):
        for tail, label in (("CC_BYNC_4_0", "CC BY-NC 4.0"), ("CC_BYSA_4_0", "CC BY-SA 4.0"), ("CC_BYND_4_0", "CC BY-ND 4.0")):
            with self.assertRaisesRegex(nav.LicenceError, f"{label} is not on the accepted list"):
                nav.resolve_licence("http://publications.europa.eu/resource/authority/licence/" + tail)

    def test_cc0_is_accepted(self):
        self.assertEqual(nav.resolve_licence("http://publications.europa.eu/resource/authority/licence/CC0_1_0").id, "CC0-1.0")

    def test_an_explicit_value_fills_a_gap_but_never_overrides_what_is_published(self):
        self.assertEqual(nav.resolve_licence(None, "CC-BY-4.0").id, "CC-BY-4.0")
        self.assertEqual(nav.resolve_licence(None, "CC-BY-4.0").published, "")  # nothing was published: say so
        self.assertEqual(nav.resolve_licence(self.URI, "CC BY 4.0").published, self.URI)
        with self.assertRaisesRegex(nav.LicenceError, "refusing to guess"):
            nav.resolve_licence(self.URI, "CC0-1.0")
        with self.assertRaisesRegex(nav.LicenceError, "unknown licence"):
            nav.resolve_licence(None, "whatever I like")
        with self.assertRaisesRegex(nav.LicenceError, "not on the accepted list"):
            nav.resolve_licence(None, "CC-BY-NC-4.0")

    def test_several_different_published_licences_are_refused(self):
        with self.assertRaisesRegex(nav.LicenceError, "several different licences"):
            nav.resolve_licence([self.URI, "http://publications.europa.eu/resource/authority/licence/CC0_1_0"])

    def test_load_refuses_before_any_data_is_requested(self):
        a, c = catalogues()
        for it in c["result"]["items"]:
            it.pop("license", None)
        with tempfile.TemporaryDirectory() as tmp:
            cache = sources.Cache(Path(tmp))
            cache.path("navarra-catalogue", f"{nav.DATASETS['albergues'].query}|size=50|page=0").write_text(json.dumps(a))
            cache.path("navarra-catalogue", f"{nav.DATASETS['fuentes'].query}|size=50|page=0").write_text(json.dumps(c))
            with mock.patch.object(nav, "_request", side_effect=AssertionError("a data file was requested")) as req:
                with self.assertRaisesRegex(nav.LicenceError, "no licence"):
                    nav.load(cache)
                req.assert_not_called()
            self.assertEqual([p for p in Path(tmp).iterdir() if p.name.startswith("navarra-data")], [])

    def test_load_refuses_a_licence_we_cannot_use(self):
        a, c = catalogues()
        c["result"]["items"][0]["license"] = "http://publications.europa.eu/resource/authority/licence/CC_BYNC_4_0"
        slug_item = [it for it in c["result"]["items"] if it["_about"].endswith("fuentes-del-camino-de-santiago1")]
        slug_item[0]["license"] = "http://publications.europa.eu/resource/authority/licence/CC_BYNC_4_0"
        with tempfile.TemporaryDirectory() as tmp, no_network():
            with self.assertRaisesRegex(nav.LicenceError, "CC BY-NC 4.0 is not on the accepted list"):
                nav.load(seed(tmp, cat_albergues=a, cat_camino=c))

    def test_the_credit_line_names_the_publisher_so_another_publisher_is_refused(self):
        a, c = catalogues()
        a["result"]["items"][0]["publisher"] = "http://datos.gob.es/recurso/sector-publico/org/Organismo/A16003011"
        with tempfile.TemporaryDirectory() as tmp, no_network():
            with self.assertRaisesRegex(nav.SourceError, r"names A16003011, not Gobierno de Navarra \(A15002917\)"):
                nav.load(seed(tmp, cat_albergues=a), ("albergues",))
        a["result"]["items"][0].pop("publisher")
        with tempfile.TemporaryDirectory() as tmp, no_network():
            with self.assertRaisesRegex(nav.SourceError, "names no publisher"):
                nav.load(seed(tmp, cat_albergues=a), ("albergues",))

    def test_load_takes_an_explicit_licence_only_when_the_catalogue_has_none(self):
        a, c = catalogues()
        for it in a["result"]["items"] + c["result"]["items"]:
            it.pop("license", None)
        with tempfile.TemporaryDirectory() as tmp, no_network():
            cache = seed(tmp, cat_albergues=a, cat_camino=c)
            with self.assertRaises(nav.LicenceError):
                nav.load(cache)
            data = nav.load(cache, licence="CC-BY-4.0")
        self.assertEqual(data.attributions["albergues"].licence_published, "")


# ---------------------------------------------------------------------------
class Catalogue(unittest.TestCase):
    def test_the_dataset_is_found_by_slug_among_other_publishers(self):
        _, c = catalogues()
        item = nav.find_item(c["result"]["items"], "a15002917-senales-del-camino-de-santiago")
        self.assertEqual(nav.item_title(item), "Señales del camino de Santiago")  # as published, lower-case c
        self.assertEqual(nav.item_title(item, "eu"), "Donejakue bidearen seinaleak")
        with self.assertRaisesRegex(nav.SourceError, "no dataset 'a15002917-nothing'"):
            nav.find_item(c["result"]["items"], "a15002917-nothing")

    def test_json_dump_first_then_csv_dump_never_the_html_table_or_shapefile(self):
        a, c = catalogues()
        item = nav.find_item(a["result"]["items"], nav.DATASETS["albergues"].slug)
        self.assertEqual(nav.pick_distribution(item).url,
                         "https://datosabiertos.navarra.es/datastore/dump/95ca4059-d22d-4dbe-86d8-f05dc5a20c3f?format=json&bom=True")
        no_json = copy.deepcopy(item)
        no_json["distribution"] = [d for d in no_json["distribution"] if "format=json" not in d["accessURL"]]
        for order in (1, -1):  # the legacy download .csv comes before the dump in the catalogue: try both orders
            no_json["distribution"] = no_json["distribution"][::order]
            picked = nav.pick_distribution(no_json)
            self.assertEqual((picked.format, "/datastore/dump/" in picked.url, "format=csv" in picked.url), ("csv", True, True))
        track = nav.find_item(c["result"]["items"], "a15002917-camino-de-santiago-trazado-oficial1")
        with self.assertRaisesRegex(nav.SourceError, "no json or csv distribution .*shp"):
            nav.pick_distribution(track)

    def test_format_comes_from_a_uri_a_mime_type_or_the_url(self):
        self.assertEqual(nav._format_of({"format": "http://publications.europa.eu/resource/authority/file-type/JSON"}), "json")
        self.assertEqual(nav._format_of({"format": {"value": "text/csv"}}), "csv")  # the shape other portals use
        self.assertEqual(nav._format_of({"format": "x", "accessURL": "https://h/dump/1?format=csv&bom=True"}), "csv")
        self.assertEqual(nav._format_of({"format": "http://publications.europa.eu/resource/authority/file-type/SHP"}), "shp")

    def test_dates_in_the_catalogues_spanish_format(self):
        self.assertEqual(nav.catalogue_date("vie, 09 oct 2026 09:14:39 GMT+0000"), "2026-10-09")
        self.assertEqual(nav.catalogue_date("mié, 15 abr 2026 11:21:16 GMT+0000"), "2026-04-15")
        self.assertEqual(nav.catalogue_date("2026-11-07T00:30:06"), "2026-11-07")
        self.assertIsNone(nav.catalogue_date("sometime"))
        self.assertIsNone(nav.catalogue_date(None))

    def test_pages_are_followed_until_a_short_page_and_cached(self):
        pages = [{"result": {"items": [{"_about": f"https://datos.gob.es/catalogo/x{i}"} for i in range(nav.CATALOG_PAGE_SIZE)]}},
                 {"result": {"items": [{"_about": "https://datos.gob.es/catalogo/last"}]}}]
        with tempfile.TemporaryDirectory() as tmp:
            cache = sources.Cache(Path(tmp))
            with mock.patch.object(nav, "_catalogue_page", side_effect=lambda q, p: pages[p]) as page:
                self.assertEqual(len(nav.catalogue_items(cache, "Camino de Santiago")), nav.CATALOG_PAGE_SIZE + 1)
                self.assertEqual(page.call_count, 2)
                self.assertEqual(len(nav.catalogue_items(cache, "Camino de Santiago")), nav.CATALOG_PAGE_SIZE + 1)
                self.assertEqual(page.call_count, 2, "the second run must come from the cache")

    def test_the_catalogue_request_is_polite_and_encoded(self):
        resp = mock.Mock(status_code=200, content=b'{"result": {"items": []}}')
        with mock.patch.object(nav.requests, "get", return_value=resp) as get:
            nav._catalogue_page("Camino de Santiago", 0)
        url, kwargs = get.call_args.args[0], get.call_args.kwargs
        self.assertEqual(url, "https://datos.gob.es/apidata/catalog/dataset/title/Camino%20de%20Santiago?_pageSize=50&_page=0")
        self.assertIn("CaminoPlus", kwargs["headers"]["User-Agent"])
        self.assertIn("camino.plus", kwargs["headers"]["User-Agent"])
        self.assertTrue(kwargs["timeout"])


class Politeness(unittest.TestCase):
    def test_two_requests_are_at_least_two_seconds_apart(self):
        sleeps = []
        resp = mock.Mock(status_code=200, content=b"{}")
        nav._last_request = 0.0
        with mock.patch.object(nav.requests, "get", return_value=resp), mock.patch.object(nav.time, "sleep", side_effect=sleeps.append):
            nav._get("https://example.org/a", "application/json")
            nav._get("https://example.org/b", "application/json")
        self.assertEqual(len(sleeps), 1, "no pause before the first request, one before the second")
        self.assertTrue(1.0 < sleeps[0] <= nav.PAUSE_S, sleeps)

    def test_a_firewall_403_is_retried_twice_after_a_pause_then_reported_not_bypassed(self):
        sleeps, resp = [], mock.Mock(status_code=403, content=b"<html>Incapsula</html>")
        with mock.patch.object(nav, "_get", return_value=resp) as get, mock.patch.object(nav.time, "sleep", side_effect=sleeps.append):
            with self.assertRaisesRegex(nav.SourceBlocked, "blocking us; not trying to get around it"):
                nav._request("https://datos.gob.es/apidata/x", "application/json")
        self.assertEqual(get.call_count, 3)
        self.assertEqual(sleeps, list(nav.RETRY_WAITS_S))
        for call in get.call_args_list:  # the same plain request every time: no other headers, no other address
            self.assertEqual(call.args, ("https://datos.gob.es/apidata/x", "application/json"))

    def test_a_404_is_not_retried_and_a_503_that_clears_is(self):
        with mock.patch.object(nav, "_get", return_value=mock.Mock(status_code=404, content=b"")) as get:
            with self.assertRaisesRegex(nav.SourceError, "HTTP 404"):
                nav._request("https://h/x", "*/*")
            self.assertEqual(get.call_count, 1)
        replies = [mock.Mock(status_code=503, content=b""), mock.Mock(status_code=200, content=b"ok")]
        with mock.patch.object(nav, "_get", side_effect=replies), mock.patch.object(nav.time, "sleep"):
            self.assertEqual(nav._request("https://h/x", "*/*"), b"ok")

    def test_a_huge_answer_is_refused(self):
        with mock.patch.object(nav, "_get", return_value=mock.Mock(status_code=200, content=b"x" * (nav.MAX_BYTES + 1))):
            with self.assertRaisesRegex(nav.SourceError, "far more than this table"):
                nav._request("https://h/x", "*/*")


# ---------------------------------------------------------------------------
class Parsing(unittest.TestCase):
    def test_json_and_csv_downloads_give_the_same_rows(self):
        j, c = nav.parse_table(read("albergues.json")), nav.parse_table(read("albergues.csv"))
        self.assertEqual(len(j), 32)
        self.assertEqual(len(c), 32)
        self.assertIn("_id", j[0])
        self.assertNotIn("_id", c[0])
        for rj, rc in zip(j, c):
            self.assertEqual({k: v for k, v in rj.items() if k != "_id"}, rc)

    def test_a_byte_order_mark_is_ignored_even_when_it_reaches_the_parser(self):
        raw = (FIX / "albergues.csv").read_bytes()
        self.assertTrue(raw.startswith(b"\xef\xbb\xbf"), "the fixture keeps the BOM the portal sends")
        self.assertEqual(nav.parse_table(raw.decode("utf-8"))[0]["COD_INSCRIPCION"], "UAB00136")

    def test_other_delimiters_and_empty_cells(self):
        rows = nav.parse_table("A;B;C\n1;;3\n")
        self.assertEqual(rows, [{"A": "1", "B": None, "C": "3"}])
        self.assertEqual(nav.parse_table("A\tB\n x  y \t2\n"), [{"A": "x y", "B": "2"}])
        self.assertEqual(nav.parse_table(""), [])

    def test_datastore_json_with_records_as_dicts(self):
        self.assertEqual(nav.parse_table('{"fields": [{"id": "a"}], "records": [{"a": 1}, {"a": null}]}'), [{"a": "1"}, {"a": None}])


# ---------------------------------------------------------------------------
class Lodgings(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with tempfile.TemporaryDirectory() as tmp, no_network():
            cls.data = nav.load(seed(tmp))
        cls.by_id = {x.source_id: x for x in cls.data.lodgings}

    def test_all_fixture_rows_become_lodgings_without_a_position(self):
        self.assertEqual(len(self.data.lodgings), 32)
        self.assertEqual(self.data.skipped, [])
        for x in self.data.lodgings:
            self.assertFalse(hasattr(x, "lat"), "the registry has no coordinates: a Lodging must not pretend to have one")
            self.assertEqual((x.source, x.family), ("navarra", "stay"))
            self.assertEqual(x.key, f"navarra:{x.source_id}")

    def test_field_mapping_for_the_roncesvalles_albergue(self):
        x = self.by_id["UAB00062"]
        self.assertEqual(x.name, "Albergue de Roncesvalles")
        self.assertEqual(x.category, "albergue_private")  # the registry names no operator
        t = x.tags
        self.assertEqual((t["capacity"], t["extra_beds"], t["registered"]), (223, 0, "2012-12-05"))
        self.assertEqual((t["street"], t["housenumber"], t["postcode"]), ("Francia", None, "31650"))  # "Francia 0": 0 is "no number"
        self.assertEqual((t["locality"], t["subzone"]), ("Orreaga / Roncesvalles", "Pirineo"))
        self.assertEqual(t["municipality"], "Orrega / Roncesvalles", "kept as published, typo included")
        self.assertEqual((t["modality"], t["registry_category"], t["on_camino"]), ("Albergue turístico", "del Camino de Santiago", True))
        self.assertEqual((t["phone"], t["email"], t["website"], t["contact_withheld"]), (None, None, None, True))
        self.assertEqual(t["registry_id"], "UAB00062")

    def test_contact_fields_are_normalised_when_the_owner_published_them(self):
        t = self.by_id["UAB00136"].tags
        self.assertEqual(t["phone"], "+34948203090")
        self.assertEqual(t["email"], "info@iratikokabiak.com")
        self.assertEqual(t["website"], "https://www.iratikokabiak.com")  # the registry has no scheme
        self.assertFalse(t["contact_withheld"])
        self.assertEqual((t["street"], t["housenumber"]), ("NA-2030 Pk 8.370", None))

    def test_a_refusal_is_never_stored_as_data(self):
        withheld = [x for x in self.data.lodgings if x.tags["contact_withheld"]]
        self.assertGreater(len(withheld), 20)
        for x in self.data.lodgings:
            for k in ("phone", "email", "website"):
                self.assertNotIn("consiente", str(x.tags[k]).lower(), x.key)
                self.assertNotIn("desconocido", str(x.tags[k]).lower(), x.key)

    def test_desconocido_as_a_category_is_not_kept_as_one(self):
        t = self.by_id["UAB00097"].tags  # Haizea: the registry's category is "Desconocido"
        self.assertIsNone(t["registry_category"])
        self.assertFalse(t["on_camino"])

    def test_desconocido_is_unknown_not_withheld(self):
        t = self.by_id["UAB00135"].tags  # public council: email and phone given, web "Desconocido"
        self.assertEqual((t["email"], t["phone"], t["website"], t["contact_withheld"]),
                         ("concejodeeugi@gmail.com", "+34948304047", None, False))

    def test_registry_ids_are_upper_cased(self):
        self.assertIn("UAB00016", self.by_id)
        self.assertIn("UAB00003", self.by_id)
        self.assertNotIn("uab00016", self.by_id)

    def test_category_mapping(self):
        cat = {k: v.category for k, v in self.by_id.items()}
        self.assertEqual(cat["UAB00070"], "albergue_municipal")  # Albergue Municipal de Zubiri
        self.assertEqual(cat["UAB00068"], "albergue_municipal")  # Albergue Municipal de Huarte
        self.assertEqual(cat["UAB00134"], "albergue_municipal")  # "Albergue" in the name, 2ª Categoria
        self.assertEqual(cat["UAB00062"], "albergue_private")
        self.assertEqual(cat["UAB00117"], "albergue_private")  # "Ágora Hostel", but flagged "2ª del Camino de Santiago"
        self.assertEqual(cat["UAB00126"], "hostel")  # "Hostel la Huertica", 2ª Categoria, not on the Camino
        self.assertEqual(cat["UAB00136"], "hostel")  # Iratiko Kabiak, 2ª Categoria
        self.assertEqual(cat["UAB00097"], "hostel")  # category "Desconocido": the name decides
        self.assertTrue(set(cat.values()) <= {"albergue_municipal", "albergue_parochial", "albergue_private", "hostel"})

    def test_category_function(self):
        f = nav.lodging_category
        self.assertEqual(f("Albergue Parroquial San Nicolás", None), "albergue_parochial")
        self.assertEqual(f("Albergue de la Parroquia", "2ª Categoria"), "albergue_parochial")
        self.assertEqual(f("Casa Mariela", "del Camino de Santiago"), "albergue_private")
        self.assertEqual(f("Casa Mariela", "1ª Categoria"), "hostel")
        self.assertEqual(f("Gîte Ultreïa", "1ª Categoria"), "albergue_private")  # same word list as the OSM mapping

    def test_to_record_gives_a_normalize_record_once_a_position_is_known(self):
        rec = self.by_id["UAB00062"].to_record(43.0094, -1.3195)
        self.assertIsInstance(rec, Record)
        self.assertEqual((rec.source, rec.source_id, rec.category, rec.family, rec.key),
                         ("navarra", "UAB00062", "albergue_private", "stay", "navarra:UAB00062"))
        self.assertEqual((rec.lat, rec.lon), (43.0094, -1.3195))
        self.assertEqual(rec.tags["capacity"], 223)

    def test_address_splitting(self):
        for text, expected in (("Elizaldea 52", ("Elizaldea", "52")), ("Francia 0", ("Francia", None)), ("Mayor 2", ("Mayor", "2")),
                               ("Camino de Santiago 4", ("Camino de Santiago", "4")), ("Soraundi 5 -7", ("Soraundi", "5")),
                               ("Los Bodegones 0 s/n", ("Los Bodegones", None)), ("Plaza", ("Plaza", None)), (None, (None, None))):
            self.assertEqual(nav.split_address(text), expected, text)

    def test_phone_email_and_website_cleaning(self):
        self.assertEqual(nav.normalise_phone("948 20 30 90"), "+34948203090")
        self.assertEqual(nav.normalise_phone("+34 948 76 00 00"), "+34948760000")
        self.assertEqual(nav.normalise_phone("0034948203090"), None)  # not guessed
        self.assertEqual(nav.normalise_phone("+33 5 59 37 03 66"), "+33559370366")
        self.assertIsNone(nav.normalise_phone("12345"))
        self.assertEqual(nav.normalise_website("www.arantza.net/"), "https://www.arantza.net")
        self.assertEqual(nav.normalise_website("http://x.es"), "http://x.es")
        self.assertIsNone(nav.normalise_website("sin web"))
        self.assertEqual(nav.normalise_email(" Aterpe@Arantza.NET "), "aterpe@arantza.net")
        self.assertIsNone(nav.normalise_email("not an email"))
        self.assertEqual([nav.contact_state(v) for v in (None, "No se consiente la publicación", "Desconocido-No interactuado", "x")],
                         ["empty", "refused", "unknown", "ok"])


class BadRows(unittest.TestCase):
    """Rows derived from real ones and spoiled on purpose (marked in the test) must be skipped with a reason."""

    def test_unusable_registry_rows_are_skipped_with_a_reason(self):
        issues = Counter()
        a = attribution()
        for row, reason in ((albergue_row(COD_INSCRIPCION=None), "no registry id"),
                            (albergue_row(COD_INSCRIPCION="12345"), "not of the form"),
                            (albergue_row(NOMBRE=None), "UAB00099: no name")):
            with self.assertRaisesRegex(nav.RowError, reason):
                nav.lodging_from_row(row, a, issues)
        self.assertEqual(issues, Counter())

    def test_a_bad_single_field_is_dropped_and_counted_but_the_row_stays(self):
        issues = Counter()
        x = nav.lodging_from_row(albergue_row(PLAZAS="muchas", FECHA_DE_INSCRIPCION="2020-02-01", CODIGO_POSTAL="3110",
                                              EMAIL="not an email", TELEFONO_RESERVAS_1="12345"), attribution(), issues)
        t = x.tags
        self.assertEqual((t["capacity"], t["registered"], t["postcode"], t["email"], t["phone"]), (None, None, None, None, None))
        self.assertEqual(sorted(issues), ["CODIGO_POSTAL: not 5 digits", "EMAIL: not usable (email)", "FECHA_DE_INSCRIPCION: not dd/mm/yyyy",
                                          "PLAZAS: not a number between 1 and 3000", "TELEFONO_RESERVAS_1: not usable (phone)"])

    def test_load_skips_and_reports_spoiled_rows_of_every_table(self):
        j = json.loads(read("albergues.json"))
        cols = [f["id"] for f in j["fields"]]

        def spoiled(**over):  # a copy of the Roncesvalles row with a few fields changed
            row = next(r for r in j["records"] if r[cols.index("COD_INSCRIPCION")] == "UAB00062")[:]
            for k, v in over.items():
                row[cols.index(k)] = v
            return row

        j["records"] += [spoiled(),                                           # duplicate id: the first row is kept
                         spoiled(COD_INSCRIPCION="UAB09001", NOMBRE=""),      # no name
                         spoiled(COD_INSCRIPCION="UAB09002", PLAZAS="n/a")]   # kept, capacity None
        f = json.loads(read("fuentes.json"))
        fcols = [x["id"] for x in f["fields"]]
        f["records"] += [[900, "Francés", "F1 (x)", "Luzaide/Valcarlos", "", "4765575"],      # no X
                         [901, "Francés", "F1 (x)", "Luzaide/Valcarlos", "6358", "476557"],   # a typo: lands far outside Navarra
                         [902, "Francés", "F1 (x)", "Luzaide/Valcarlos", "635886", "4765575"]]  # same place again: fine, kept
        w = json.loads(read("senales.json"))
        w["records"] += [[900, "", "Francés", "F1 (x)", "637741", "4770519", "Mojón"],        # no code
                         w["records"][0][:]]                                                  # duplicate code
        self.assertEqual(len(fcols), 6)
        with tempfile.TemporaryDirectory() as tmp, no_network():
            data = nav.load(seed(tmp, albergues=json.dumps(j), fuentes=json.dumps(f), senales=json.dumps(w)))
        reasons = {(s.dataset, s.ref): s.reason for s in data.skipped}
        self.assertEqual(len(data.skipped), 6, reasons)
        self.assertIn("duplicate registry id", reasons[("albergues", "UAB00062")])
        self.assertIn("no name", reasons[("albergues", "UAB09001")])
        self.assertIn("coordinates missing or not numbers", reasons[("fuentes", "row 33")])
        self.assertIn("outside Navarra: wrong zone or datum?", reasons[("fuentes", "row 34")])
        self.assertIn("no waymark code", reasons[("senales", "row 27")])
        self.assertIn("duplicate waymark code", reasons[("senales", "1")])
        self.assertEqual(len(data.lodgings), 33)  # 32 + the spoiled row that only lost its capacity
        self.assertEqual(len(data.fountains), 33)
        self.assertEqual(data.issues, Counter({"albergues: PLAZAS: not a number between 1 and 3000": 1}))
        self.assertIn("6 rows skipped", data.status())


# ---------------------------------------------------------------------------
class Fountains(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with tempfile.TemporaryDirectory() as tmp, no_network():
            cls.data = nav.load(seed(tmp), ("fuentes",))

    def test_all_32_fountains_are_records_in_navarra(self):
        self.assertEqual(len(self.data.fountains), 32)
        for r in self.data.fountains:
            self.assertIsInstance(r, Record)
            self.assertEqual((r.source, r.category, r.family, r.name), ("navarra", "fountain", "service", None))
            self.assertTrue(41.9 < r.lat < 43.35 and -2.55 < r.lon < -0.68, r.key)
        self.assertEqual(len({r.source_id for r in self.data.fountains}), 32)

    def test_the_table_does_not_say_which_fountains_are_drinkable_so_none_is_water(self):
        for r in self.data.fountains:
            self.assertEqual(r.tags["potable"], "unknown")
            self.assertNotEqual(r.category, "water")  # our drinking-water category

    def test_branches_and_stages(self):
        camino = Counter(r.tags["camino"] for r in self.data.fountains)
        self.assertEqual(camino, Counter({"Francés": 20, "Aragonés": 12}))
        stages = Counter(r.tags["stage"] for r in self.data.fountains if r.tags["camino"] == "Francés")
        self.assertEqual(stages, Counter({"F1": 4, "F2": 2, "F3": 3, "F4": 1, "F5": 5, "F6": 3, "F7": 2}))
        f1 = next(r for r in self.data.fountains if r.tags["stage"] == "F1" and r.tags["municipality"] == "Roncesvalles/Orreaga")
        self.assertEqual(f1.tags["stage_label"], "F1 (Francia-Orreaga/Roncesvalles)")
        self.assertEqual((f1.tags["utm_x"], f1.tags["utm_y"], f1.tags["crs"]), (637061, 4763565, "EPSG:23030"))
        self.assertEqual(f1.source_id, "fuente-637061-4763565")

    def test_coordinates_are_read_as_ed50(self):
        f1 = next(r for r in self.data.fountains if r.source_id == "fuente-637061-4763565")
        self.assertAlmostEqual(f1.lat, 43.010534108, places=6)  # PROJ, EPSG:1588 pipeline (see test_utm)
        self.assertAlmostEqual(f1.lon, -1.319429226, places=6)

    def test_the_csv_download_gives_the_same_fountains(self):
        with tempfile.TemporaryDirectory() as tmp, no_network():
            from_csv = nav.load(seed(tmp, fuentes=read("fuentes.csv")), ("fuentes",))
        self.assertEqual([(r.source_id, r.lat, r.lon) for r in from_csv.fountains],
                         [(r.source_id, r.lat, r.lon) for r in self.data.fountains])


class Waymarks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with tempfile.TemporaryDirectory() as tmp, no_network():
            cls.data = nav.load(seed(tmp), ("senales",))

    def test_waymarks_are_not_places(self):
        self.assertEqual(len(self.data.waymarks), 26)
        self.assertEqual((self.data.lodgings, self.data.fountains), ([], []))
        self.assertNotIsInstance(self.data.waymarks[0], Record)

    def test_kinds_branches_and_stages(self):
        self.assertEqual({w.camino for w in self.data.waymarks}, {"Francés", "Aragonés", "Lepoeder", "Zaraputz"})
        self.assertEqual({w.kind for w in self.data.waymarks},
                         {"mojon", "flecha", "cruce_carretera", "poste_seguridad", "panel", "pintura", "otros"})
        first = self.data.waymarks[0]
        self.assertEqual((first.source_id, first.stage, first.kind, first.kind_raw), ("senal-1", "F1", "flecha", "Flecha Direccional"))
        self.assertEqual({w.kind for w in self.data.waymarks if w.kind_raw in ("Panel informativo", "Panel Informativo")}, {"panel"})

    def test_the_published_numbers_and_their_system_are_kept(self):
        first = self.data.waymarks[0]
        self.assertEqual((first.utm_x, first.utm_y, first.crs), (640771, 4775444, "EPSG:23030"))

    def test_positions_are_in_navarra_and_carry_the_attribution(self):
        for w in self.data.waymarks:
            self.assertTrue(41.9 < w.lat < 43.35 and -2.55 < w.lon < -0.68, w.key)
            self.assertEqual(w.attribution.credit, CREDIT)


# ---------------------------------------------------------------------------
class Attribution(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with tempfile.TemporaryDirectory() as tmp, no_network():
            cls.data = nav.load(seed(tmp))

    def test_every_record_carries_who_which_licence_and_when(self):
        everything = [(x.key, x.tags["attribution"]) for x in self.data.lodgings]
        everything += [(r.key, r.tags["attribution"]) for r in self.data.fountains]
        everything += [(w.key, w.attribution.as_dict()) for w in self.data.waymarks]
        self.assertEqual(len(everything), 32 + 32 + 26)
        for key, a in everything:
            self.assertEqual(a["publisher"], "Gobierno de Navarra", key)
            self.assertEqual(a["credit"], CREDIT, key)
            self.assertEqual((a["licence"], a["licence_label"]), ("CC-BY-4.0", "CC BY 4.0"), key)
            self.assertEqual(a["licence_published"], "http://publications.europa.eu/resource/authority/licence/CC_BY_4_0", key)
            self.assertEqual(a["retrieved"], "2026-11-07", key)
            self.assertTrue(a["dataset_url"].startswith("https://datos.gob.es/catalogo/a15002917-"), key)
            self.assertTrue(a["download_url"].startswith("https://datosabiertos.navarra.es/"), key)
            self.assertTrue(a["changes"], key)

    def test_details_per_dataset(self):
        a = self.data.attributions
        self.assertEqual(a["albergues"].dataset, "Albergues turísticos en activo del Registro de Turismo de Navarra")
        self.assertEqual(a["albergues"].portal_url,
                         "https://datosabiertos.navarra.es/dataset/albergues-turisticos-en-activo-del-registro-de-turismo-de-navarra")
        self.assertEqual(a["albergues"].modified, "2026-10-15")
        self.assertEqual(a["fuentes"].modified, "2026-10-09")
        self.assertEqual(a["fuentes"].dataset, "Fuentes del Camino de Santiago")
        self.assertIn("ED50", a["fuentes"].changes)
        self.assertIn("no coordinates", a["albergues"].changes)

    def test_credit_texts(self):
        a = self.data.attributions["albergues"]
        self.assertEqual(a.credit, CREDIT)
        self.assertIn("https://creativecommons.org/licenses/by/4.0/", a.credit_full)
        self.assertIn("retrieved 2026-11-07", a.credit_full)
        self.assertIn("Changed by CaminoPlus", a.credit_full)


# ---------------------------------------------------------------------------
class Loading(unittest.TestCase):
    def test_a_full_load_from_the_cache_uses_no_network(self):
        with tempfile.TemporaryDirectory() as tmp, no_network():
            data = nav.load(seed(tmp))
        self.assertEqual((len(data.lodgings), len(data.fountains), len(data.waymarks), len(data.skipped)), (32, 32, 26, 0))
        self.assertEqual(data.status(), "ok (32 lodgings (no positions), 32 fountains, 26 waymarks; 0 rows skipped)")
        self.assertEqual(len(data), 32 + 32 + 26, "audit.collect() prints len(result): without it a wrapped load() would count as FAILED")
        self.assertEqual(set(data.attributions), {"albergues", "fuentes", "senales"})
        self.assertEqual(data.issues, Counter())

    def test_only_the_requested_datasets_are_read(self):
        with tempfile.TemporaryDirectory() as tmp, no_network():
            data = nav.load(seed(tmp), ("fuentes",))
        self.assertEqual((len(data.lodgings), len(data.fountains), len(data.waymarks)), (0, 32, 0))
        self.assertEqual(set(data.attributions), {"fuentes"})

    def test_offline_without_a_cache_says_so(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(RuntimeError, "offline mode and no cache"):
                nav.load(sources.Cache(Path(tmp), offline=True))

    def test_the_first_run_downloads_once_and_the_second_reads_the_cache(self):
        a, c = catalogues()
        url_of = {k: nav.pick_distribution(nav.find_item((a if k == "albergues" else c)["result"]["items"], nav.DATASETS[k].slug)).url
                  for k in nav.DATASETS}
        body = {url_of["albergues"]: read("albergues.json"), url_of["fuentes"]: read("fuentes.json"), url_of["senales"]: read("senales.json")}
        requested = []

        def fake_request(url, accept):
            requested.append(url)
            if url.startswith(nav.CATALOG_API):
                return json.dumps(a if "Albergues" in url else c).encode()
            return body[url].encode()

        with tempfile.TemporaryDirectory() as tmp:
            cache = sources.Cache(Path(tmp))
            with mock.patch.object(nav, "_request", side_effect=fake_request):
                first = nav.load(cache)
                n = len(requested)
                second = nav.load(cache)
        self.assertEqual(n, 5, "2 catalogue searches and 3 data files, nothing else")
        self.assertEqual(len(requested), n, "the second run must not request anything")
        self.assertEqual(sum(u.startswith(nav.CATALOG_API) for u in requested), 2)
        self.assertEqual(len(first.lodgings), len(second.lodgings))
        self.assertEqual(second.attributions["albergues"].retrieved, first.attributions["albergues"].retrieved)

    def test_a_blocked_catalogue_stops_the_run_with_a_clear_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.object(nav, "_get", return_value=mock.Mock(status_code=403, content=b"blocked")), \
                 mock.patch.object(nav.time, "sleep"):
                with self.assertRaises(nav.SourceBlocked):
                    nav.load(sources.Cache(Path(tmp)))


class CommandLine(unittest.TestCase):
    def run_main(self, argv):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = nav.main(argv)
        return code, out.getvalue(), err.getvalue()

    def test_summary_from_a_cache(self):
        with tempfile.TemporaryDirectory() as tmp, no_network():
            seed(tmp)
            code, out, err = self.run_main(["--cache", tmp, "--offline", "--json", str(Path(tmp) / "out.json")])
            written = json.loads((Path(tmp) / "out.json").read_text())
        self.assertEqual(code, 0, err)
        self.assertIn("ok (32 lodgings (no positions), 32 fountains, 26 waymarks; 0 rows skipped)", out)
        self.assertIn("licence CC BY 4.0 (published as http://publications.europa.eu/resource/authority/licence/CC_BY_4_0)", out)
        self.assertIn(CREDIT, out)
        self.assertEqual((len(written["lodgings"]), len(written["fountains"]), len(written["waymarks"])), (32, 32, 26))

    def test_refusal_prints_why_and_exits_1(self):
        a, c = catalogues()
        for it in a["result"]["items"]:
            it.pop("license")
        with tempfile.TemporaryDirectory() as tmp, no_network():
            seed(tmp, cat_albergues=a)
            code, out, err = self.run_main(["--cache", tmp, "--offline", "--only", "albergues"])
        self.assertEqual(code, 1)
        self.assertIn("REFUSED/FAILED", err)
        self.assertIn("no licence", err)


if __name__ == "__main__":
    unittest.main()
