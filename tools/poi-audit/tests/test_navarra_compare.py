"""The Navarra open data against OSM, offline: matching without coordinates, counts, fountains, route checks.
The OSM side is tests/fixtures/navarra/osm_stage1_navarra.json (46 real elements of stage 1, Navarra side);
the registry side is the trimmed real albergue table. Run: python -m unittest discover -s tests"""
import contextlib
import io
import json
import math
import tempfile
import unittest
from pathlib import Path

from navarra_fixtures import albergue_row, attribution, no_network, read, seed  # noqa: E402  (also puts poi_audit on sys.path)
import audit  # noqa: E402
from poi_audit import navarra_compare as cmp, opendata_navarra as nav, sources  # noqa: E402
from poi_audit.normalize import Corridor, Record, from_osm  # noqa: E402
from poi_audit.utm import utm_to_wgs84  # noqa: E402


def osm_records() -> list[Record]:
    return [r for r in map(from_osm, json.loads(read("osm_stage1_navarra.json"))["elements"]) if r]


def osm(id_, name, category="hostel", lat=43.0, lon=-1.3, **tags) -> Record:
    return Record("osm", f"node/{id_}", name, category, lat, lon, tags)


def lodging(**over) -> nav.Lodging:
    return nav.lodging_from_row(albergue_row(**over), attribution())


class OnRoute:
    """A corridor everything is on: for tests that only need the filters by category and latitude."""

    def distance(self, lat, lon):
        return 0.0


def navarra_data() -> nav.NavarraData:
    with tempfile.TemporaryDirectory() as tmp, no_network():
        return nav.load(seed(tmp))


STAGE1_AREA = {"UAB00033", "UAB00062", "UAB00066", "UAB00097", "UAB00133"}  # Luzaide, Roncesvalles, Espinal x2, Burguete


# ---------------------------------------------------------------------------
class Addresses(unittest.TestCase):
    def test_street_types_accents_and_basque_spellings_are_ignored(self):
        self.assertEqual(cmp.street_tokens("Calle San Nicolás"), cmp.street_tokens("San Nicolas karrika"))
        self.assertEqual(cmp.street_tokens("San Nicolás"), frozenset({"san", "nicolas"}))
        self.assertEqual(cmp.street_tokens("Elizaldea"), cmp.street_tokens("Calle Elizaldea"))
        self.assertEqual(cmp.street_tokens("Elizaldea"), cmp.street_tokens("Elizaldea kalea"))
        self.assertEqual(cmp.street_tokens("Francia"), cmp.street_tokens("Ctra. Francia"))
        self.assertEqual(cmp.street_tokens("Camino de Santiago"), frozenset({"santiago"}))
        self.assertEqual(cmp.street_tokens(None), frozenset())

    def test_postcode_street_and_number_must_agree(self):
        row = dict(DIRECCION="Elizaldea 52", CODIGO_POSTAL="31660")
        place = dict(**{"addr:street": "Calle Elizaldea", "addr:housenumber": "52", "addr:postcode": "31660"})
        self.assertEqual(cmp.address_match(lodging(**row), osm(1, "x", **place)), "address")
        self.assertIsNone(cmp.address_match(lodging(**row), osm(1, "x", **{**place, "addr:housenumber": "54"})))
        self.assertIsNone(cmp.address_match(lodging(**row), osm(1, "x", **{**place, "addr:postcode": "31640"})))
        self.assertIsNone(cmp.address_match(lodging(**row), osm(1, "x", **{**place, "addr:street": "Calle Mayor"})))
        without_postcode = {k: v for k, v in place.items() if k != "addr:postcode"}
        self.assertIsNone(cmp.address_match(lodging(**row), osm(1, "x", **without_postcode)))

    def test_a_missing_number_on_either_side_is_a_weaker_match(self):
        place = {"addr:street": "Carretera Francia", "addr:postcode": "31650"}
        self.assertEqual(cmp.address_match(lodging(DIRECCION="Francia 0", CODIGO_POSTAL="31650"), osm(1, "x", **place)), "address (no number)")
        self.assertEqual(cmp.address_match(lodging(DIRECCION="Francia 2", CODIGO_POSTAL="31650"), osm(1, "x", **place)), "address (no number)")
        self.assertEqual(cmp.address_match(lodging(DIRECCION="Francia 0", CODIGO_POSTAL="31650"),
                                           osm(1, "x", **place, **{"addr:housenumber": "7"})), "address (no number)")

    def test_a_street_and_postcode_shared_by_several_places_is_not_enough_without_numbers(self):
        row = lodging(NOMBRE="Casa Distinta", DIRECCION="Francia 0", CODIGO_POSTAL="31650", LOCALIDAD="Orreaga / Roncesvalles")
        a = osm(1, "Alfa", **{"addr:street": "Carretera Francia", "addr:postcode": "31650"})
        b = osm(2, "Beta", **{"addr:street": "Carretera Francia", "addr:postcode": "31650"})
        self.assertIsNone(cmp.match_lodgings([row], [a, b])[0].osm)
        self.assertEqual(cmp.match_lodgings([row], [a])[0].osm, a)  # alone, it is the one


class Names(unittest.TestCase):
    ESPINAL = dict(LOCALIDAD="Aurizberri / Espinal", MUNICIPIO="Erro", CODIGO_POSTAL="31694")

    def test_a_distinctive_name_matches_when_the_postcode_does_not_contradict(self):
        row = lodging(NOMBRE="Irugoienea", DIRECCION="Oihanilun 2", **self.ESPINAL)
        same = osm(1, "Irugoienea", **{"addr:postcode": "31694", "addr:street": "Oianilun auzunea"})
        m = cmp.match_lodgings([row], [same])[0]
        self.assertEqual((m.osm, m.how), (same, "name"))
        self.assertIsNone(cmp.match_lodgings([row], [osm(2, "Irugoienea", **{"addr:postcode": "31640"})])[0].osm)

    def test_the_town_is_checked_when_osm_has_no_postcode(self):
        row = lodging(NOMBRE="Irugoienea", **self.ESPINAL)
        self.assertEqual(cmp.match_lodgings([row], [osm(1, "Irugoienea", **{"addr:city": "Aurizberri/Espinal"})])[0].how, "name")
        self.assertEqual(cmp.match_lodgings([row], [osm(1, "Irugoienea", **{"addr:city": "Pamplona"})])[0].how, "none")
        self.assertEqual(cmp.match_lodgings([row], [osm(1, "Irugoienea")])[0].how, "name")  # OSM says nothing about where

    def test_a_name_that_is_only_the_village_does_not_link_look_alikes(self):
        """Found on the real stage-1 data: 'Albergue de Roncesvalles' used to link to La Posada de Roncesvalles."""
        row = lodging(NOMBRE="Albergue de Roncesvalles", LOCALIDAD="Orreaga / Roncesvalles", MUNICIPIO="Orrega / Roncesvalles",
                      CODIGO_POSTAL="31650", DIRECCION="Francia 0")
        self.assertTrue(cmp.village_only(row))
        posada = osm(1, "La Posada de Roncesvalles", **{"addr:postcode": "31650"})
        self.assertEqual(cmp.match_lodgings([row], [posada])[0].how, "none")
        pilgrims = osm(2, "Albergue de Peregrinos de Roncesvalles", **{"addr:postcode": "31650"})
        self.assertEqual(cmp.match_lodgings([row], [posada, pilgrims])[0].osm, pilgrims)  # one place says albergue itself
        other = osm(3, "Albergue Roncesvalles", **{"addr:postcode": "31650"})
        self.assertEqual(cmp.match_lodgings([row], [pilgrims, other])[0].how, "none", "two candidates: ambiguous")

    def test_kinds_that_disagree_never_match_on_the_village(self):
        row = lodging(NOMBRE="Albergue Municipal de Zubiri", LOCALIDAD="Zubiri", MUNICIPIO="Esteribar", CODIGO_POSTAL="31630")
        self.assertEqual(cmp.match_lodgings([row], [osm(1, "Hostal Zubiri", **{"addr:postcode": "31630"})])[0].how, "none")
        self.assertEqual(cmp.match_lodgings([row], [osm(2, "Zubiri", category="cafe", **{"addr:postcode": "31630"})])[0].how, "none")

    def test_the_audits_name_folding_is_what_is_used(self):
        self.assertFalse(cmp.village_only(lodging(NOMBRE="Haizea", **self.ESPINAL)))
        self.assertTrue(cmp.village_only(lodging(NOMBRE="Albergue de Luzaide/Valcarlos", LOCALIDAD="Luzaide / Valcarlos",
                                                 MUNICIPIO="Luzaide / Valcarlos")))
        self.assertFalse(cmp.village_only(lodging(NOMBRE="Lorentx Aterpea", LOCALIDAD="Auritz / Burguete", MUNICIPIO="Auritz / Burguete")))


class RealStage1(unittest.TestCase):
    """The five official albergues of Luzaide, Roncesvalles, Burguete and Espinal against the real OSM places there."""

    @classmethod
    def setUpClass(cls):
        cls.data = navarra_data()
        cls.osm = osm_records()
        cls.official = [l for l in cls.data.lodgings if l.source_id in STAGE1_AREA]
        cls.matches = {m.lodging.source_id: m for m in cmp.match_lodgings(cls.official, cls.osm)}

    def test_four_of_five_are_found_and_one_is_not_in_osm(self):
        self.assertEqual(len(self.official), 5)
        found = {k: (m.osm.key if m.osm else None, m.how) for k, m in self.matches.items()}
        self.assertEqual(found, {
            "UAB00033": ("osm:node/2417877410", "address"),               # Luzaideko aterpea, Calle Elizaldea 52
            "UAB00062": ("osm:node/1896340970", "address (no number)"),   # Erromesen aterpetxea, Carretera Francia: OSM says hotel
            "UAB00066": ("osm:way/383789070", "name"),                    # Irugoienea (the street is spelled differently)
            "UAB00097": ("osm:node/2418091631", "address (no number)"),   # Hostal Haizea
            "UAB00133": (None, "none"),                                   # Lorentx Aterpea, San Nicolas 56: not in OSM
        })

    def test_lookalikes_of_the_village_name_are_not_linked(self):
        linked = {m.osm.key for m in self.matches.values() if m.osm} | {o.key for m in self.matches.values() for o in m.others}
        self.assertNotIn("osm:node/535186143", linked)  # La Posada de Roncesvalles
        self.assertNotIn("osm:node/7818267722", linked)  # a guesthouse called Roncesvalles, in Espinal
        self.assertEqual(self.matches["UAB00062"].others, [])

    def test_osm_has_two_objects_for_the_valcarlos_albergue(self):
        self.assertEqual([o.key for o in self.matches["UAB00033"].others], ["osm:way/383757927"])  # Albergue de Peregrinos de Valcarlos

    def test_beds_official_against_osm(self):
        beds = {k: (m.lodging.tags["capacity"], m.osm_beds) for k, m in self.matches.items() if m.osm}
        self.assertEqual(beds, {"UAB00033": (24, 24), "UAB00062": (223, 183), "UAB00066": (22, 24), "UAB00097": (28, 57)})

    def test_the_stage_summary(self):
        s = cmp.stage1_comparison(self.data, self.osm, OnRoute())
        self.assertEqual((s["official_lodgings"], s["official_matched"]), (5, 4))
        self.assertEqual(s["matched_by"], {"address": 1, "address (no number)": 2, "name": 1})
        self.assertEqual(s["official_unmatched"], [("UAB00133", "Lorentx Aterpea", "Auritz / Burguete")])
        self.assertEqual((s["osm_stays"], s["osm_albergue_like"], s["osm_albergue_like_with_official"]), (30, 13, 4))
        self.assertEqual(s["osm_albergue_categories"], {"hostel": 11, "albergue_private": 2})
        self.assertEqual((s["beds_compared"], s["beds_equal"]), (4, 1))
        self.assertEqual(s["matched_with_a_second_osm_place"], [("UAB00033", "osm:node/2417877410", ["osm:way/383757927"])])

    def test_places_north_of_the_border_line_are_left_out(self):
        osm_fr = osm(99, "Gîte en France", lat=43.12, lon=-1.24)
        stays, water = cmp.osm_along_route(self.osm + [osm_fr], OnRoute(), cmp.STAGE1_NAVARRA_MAX_LAT)
        self.assertNotIn(osm_fr, stays)
        self.assertEqual((len(stays), len(water)), (30, 16))
        stays, _ = cmp.osm_along_route(self.osm + [osm_fr], OnRoute(), None)
        self.assertIn(osm_fr, stays)


class Fountains(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = navarra_data()
        cls.water = [r for r in osm_records() if r.category in cmp.WATER_CATEGORIES]
        cls.f1 = [r for r in cls.data.fountains if r.tags["stage"] == "F1"]

    def test_two_of_the_four_official_fountains_of_stage_1_are_in_osm(self):
        self.assertEqual((len(self.f1), len(self.water)), (4, 16))
        rows = cmp.match_fountains(self.f1, self.water)
        by_id = {r["fountain"].source_id: r for r in rows}
        self.assertLess(by_id["fuente-635886-4765575"]["distance_m"], 10)
        self.assertEqual(by_id["fuente-635886-4765575"]["osm"].key, "osm:node/4984656415")
        self.assertLess(by_id["fuente-641441-4767692"]["distance_m"], 10)
        self.assertGreater(by_id["fuente-637061-4763565"]["distance_m"], 100)  # the Roncesvalles one: OSM has none within 220 m
        self.assertGreater(by_id["fuente-638220-4772411"]["distance_m"], 1000)  # the Luzaide one: none within 2 km
        s = cmp.fountain_summary(rows, self.water)
        self.assertEqual((s["official"], s["osm_points"]), (4, 16))
        self.assertEqual((s["official_with_osm_within_25m"], s["official_with_osm_within_100m"]), (2, 2))
        self.assertEqual(s["osm_with_official_within_25m"], 3, "OSM has two points on one of the official fountains")

    def test_nothing_to_match_against(self):
        rows = cmp.match_fountains(self.f1, [])
        self.assertEqual([r["distance_m"] for r in rows], [None] * 4)
        self.assertEqual(cmp.fountain_summary(rows, [])["official_with_osm_within_100m"], 0)


class Counts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = navarra_data()
        cls.by_id = {l.source_id: l for l in cls.data.lodgings}

    def test_field_counts_of_the_fixture_rows(self):
        c = cmp.field_counts(self.data.lodgings)
        self.assertEqual((c["lodgings"], c["with_capacity"], c["beds"]), (32, 32, sum(l.tags["capacity"] for l in self.data.lodgings)))
        self.assertEqual((c["with_phone"], c["with_email"], c["with_website"]), (4, 5, 3))
        self.assertEqual(c["contact_withheld"], sum(1 for l in self.data.lodgings if l.tags["contact_withheld"]))
        self.assertEqual(c["on_camino"], sum(1 for l in self.data.lodgings if "camino" in (l.tags["registry_category"] or "").lower()))
        self.assertEqual(cmp.field_counts([])["lodgings"], 0)

    def test_villages_are_assigned_to_the_stage_that_ends_or_passes_there(self):
        stage = {k: cmp.stage_of(v) for k, v in self.by_id.items()}
        self.assertEqual(stage["UAB00033"], 1)   # Luzaide / Valcarlos
        self.assertEqual(stage["UAB00062"], 1)   # Roncesvalles
        self.assertEqual(stage["UAB00133"], 2)   # Burguete
        self.assertEqual(stage["UAB00070"], 2)   # Zubiri
        self.assertEqual(stage["UAB00103"], 3)   # Pamplona
        self.assertEqual(stage["UAB00144"], 6)   # Villamayor de Monjardin
        self.assertEqual(stage["UAB00043"], 7)   # Torres del Rio
        self.assertIsNone(stage["UAB00136"])     # Orbaizeta, a Pyrenean valley
        self.assertIsNone(stage["UAB00139"])     # Tudela

    def test_a_village_counts_for_one_stage_only(self):
        folded = [cmp.fold(v) for vs in cmp.STAGE_LOCALITIES.values() for v in vs]
        self.assertEqual(len(folded), len(set(folded)))

    def test_stage_table_and_the_villages_left_over(self):
        table = {r["stage"]: r for r in cmp.stage_table(self.data)}
        # the fixture has 14 waymarks of stage 1: 10 filed as Frances (the Valcarlos road) and 4 as Lepoeder (the Napoleon route)
        self.assertEqual((table[1]["lodgings"], table[1]["beds"], table[1]["fountains"], table[1]["waymarks"]), (2, 247, 4, 14))
        self.assertEqual(table[1]["localities"], {"Luzaide / Valcarlos": 1, "Orreaga / Roncesvalles": 1})
        self.assertEqual(sum(r["lodgings"] for r in table.values()), sum(1 for v in self.by_id.values() if cmp.stage_of(v)))
        self.assertEqual(sum(r["fountains"] for r in table.values()), 20)  # the Frances fountains: 4 + 2 + 3 + 1 + 5 + 3 + 2
        left = cmp.unassigned_localities(self.data)
        self.assertEqual(left["Orbaizeta"], 2)
        self.assertNotIn("Zubiri", left)
        self.assertEqual(sum(left.values()) + sum(r["lodgings"] for r in table.values()), 32)


class RouteChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = navarra_data()
        cls.f1 = [w for w in cls.data.waymarks if w.stage == "F1"]

    def test_the_datum_that_puts_a_waymark_on_the_route_is_ed50(self):
        """The mechanics of the check, on a route drawn on purpose: a line through the waymark as ED50 puts it on
        the line, and as ETRS89 it lands ~235 m to the side (the line is drawn across the direction of the shift;
        along it the shift would not show). The check on the real OSM route is in the report."""
        w = self.f1[0]
        lat0, lon0 = utm_to_wgs84(w.utm_x, w.utm_y, "EPSG:23030")
        lat1, lon1 = utm_to_wgs84(w.utm_x, w.utm_y, "EPSG:25830")
        kx, ky = 111320 * math.cos(math.radians(lat0)), 110540
        sx, sy = (lon1 - lon0) * kx, (lat1 - lat0) * ky  # the shift, in metres
        norm = math.hypot(sx, sy)
        px, py = -sy / norm * 1000, sx / norm * 1000  # 1 km across the shift
        route = Corridor([[(lon0 - px / kx, lat0 - py / ky), (lon0 + px / kx, lat0 + py / ky)]])
        ev = cmp.crs_evidence([w], route)
        self.assertEqual((ev["EPSG:23030"]["within_30m"], ev["EPSG:23030"]["n"]), (1, 1))
        self.assertLess(ev["EPSG:23030"]["median_m"], 1)
        self.assertEqual(ev["EPSG:25830"]["within_30m"], 0)
        self.assertTrue(220 < ev["EPSG:25830"]["median_m"] < 250, ev)

    def test_describe(self):
        self.assertEqual(cmp.describe([]), {"n": 0})
        d = cmp.describe([1.0, 2.0, 3.0, 40.0, 200.0])
        self.assertEqual((d["n"], d["median_m"], d["max_m"], d["within_30m"], d["within_100m"]), (5, 3.0, 200, 3, 4))

    def test_route_lines_from_a_cached_overpass_answer(self):
        answer = {"elements": [{"type": "relation", "members": [
            {"type": "way", "geometry": [{"lat": 43.0, "lon": -1.3}, {"lat": 43.1, "lon": -1.3}]},
            {"type": "node", "lat": 1, "lon": 1},
            {"type": "way"}]}]}
        self.assertEqual(cmp.route_lines(answer), [[(-1.3, 43.0), (-1.3, 43.1)]])

    def test_rough_lines_and_the_waymarks_that_do_not_fit_their_stage(self):
        def stage_file(d, n, lon):
            (d / f"camino-frances-{n:02d}.route.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": [
                {"type": "Feature", "geometry": {"type": "LineString", "coordinates": [[lon, 43.0], [lon, 43.1]]}, "properties": {}}]}))

        def way(code, stage, lon, lat=43.05):
            return nav.Waymark(f"senal-{code}", "Francés", stage, stage, "mojon", "Mojón", lat, lon, 0, 0, "EPSG:23030", attribution())

        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp)
            stage_file(d, 1, -1.30)
            stage_file(d, 2, -1.28)   # 1.6 km east of stage 1's line
            stage_file(d, 3, -1.20)   # 8 km east of it
            ways = [way(1, "F1", -1.30), way(2, "F2", -1.28),
                    way(3, "F1", -1.2005),                  # filed under stage 1, stands on stage 3's line: a mistake
                    way(4, "F2", -1.2795, lat=43.4),        # far from every line: not a clear mix-up
                    way(5, "A1", -1.2),                     # another branch: not judged
                    way(6, "F1", -1.2795, lat=43.05),       # 1.6 km from its stage, on the next one's: the lines are rough, so no
                    way(7, "F1", -1.12)]                    # far from its stage and from every other one: not a clear mix-up
            bad = cmp.stage_label_conflicts(ways, d)
            self.assertEqual([(b["waymark"], b["filed_under"], b["near_stage"]) for b in bad], [("senal-3", "F1", 3)])
            self.assertEqual((bad[0]["metres_from_filed_stage"] > 7000, bad[0]["metres_from_near_stage"] < 100), (True, True))
            fountains = [Record("navarra", "f1", None, "fountain", 43.05, -1.2995, {"stage": "F1"}),   # 40 m from stage 1's line
                         Record("navarra", "f2", None, "fountain", 43.05, -1.2900, {"stage": "F1"}),   # 700 m from it
                         Record("navarra", "f3", None, "fountain", 43.05, -1.2800, {"stage": "F2"})]
            dev = cmp.rough_line_deviation(ways, fountains, d, stages=[1, 2, 3, 4])
            self.assertEqual(sorted(dev), [1, 2, 3], "stage 4 has no line")
            self.assertEqual(dev[1]["variants"]["Francés"]["n"], 4)
            self.assertEqual((dev[1]["fountains"], dev[1]["fountains_within_service_corridor"]), (2, 1))
            self.assertEqual((dev[2]["fountains"], dev[2]["fountains_within_service_corridor"]), (1, 1))
            self.assertEqual(dev[3]["variants"], {})

    def test_stays_and_water_are_taken_inside_the_audits_corridors_only(self):
        line = Corridor([[(-1.30, 43.0), (-1.30, 43.1)]])  # 1 degree of longitude is about 81 km here: 0.01 is 800 m
        stays = [osm(1, "near", lon=-1.2875), osm(2, "far", lon=-1.27)]               # 1.0 km and 2.4 km east
        water = [osm(3, "w", category="water", lon=-1.2955), osm(4, "w", category="fountain", lon=-1.29)]  # 360 m and 800 m
        other = [osm(5, "cafe", category="cafe", lon=-1.2999)]
        got_stays, got_water = cmp.osm_along_route(stays + water + other, line)
        self.assertEqual([r.source_id for r in got_stays], ["node/1"])
        self.assertEqual([r.source_id for r in got_water], ["node/3"])

    def test_the_corridor_widths_are_the_audits(self):
        self.assertEqual((cmp.STAY_BUFFER_M, cmp.SERVICE_BUFFER_M), (audit.BUFFER_M["stay"], audit.BUFFER_M["service"]))


class Report(unittest.TestCase):
    def test_the_report_without_an_osm_cache_has_the_registry_parts_only(self):
        rep = cmp.build_report(navarra_data())
        self.assertEqual(rep["registry"]["lodgings"], 32)
        self.assertEqual(len(rep["stages"]), 7)
        self.assertEqual(rep["fountains"], {"total": 32, "by_branch": {"Francés": 20, "Aragonés": 12}})
        self.assertNotIn("stage1", rep)
        text = cmp.format_markdown(rep)
        self.assertIn("| 1 | 2 | 247 |", text)
        self.assertNotIn("Stage 1, Navarra side", text)

    def test_the_command_line_replays_caches_and_never_asks_overpass(self):
        stage = {"slug": "camino-frances-01", "name": "Test", "search_bbox": [-1.42, 42.97, -1.15, 43.2], "route_name_regex": "camino"}
        route = [(-1.3012, 43.0953), (-1.3195, 43.0094), (-1.3365, 42.9885), (-1.3700, 42.9790)]
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp)
            stage_path = d / "camino-frances-01.json"
            stage_path.write_text(json.dumps(stage))
            seed(d / "navarra")
            osm_cache = sources.Cache(d / "osm")
            osm_cache.path("osm", sources.overpass_poi_query(stage["search_bbox"])).write_text(read("osm_stage1_navarra.json"))
            osm_cache.path("route", sources.overpass_route_query(stage["search_bbox"], stage["route_name_regex"])).write_text(json.dumps(
                {"elements": [{"type": "relation", "members": [{"type": "way", "geometry": [{"lat": la, "lon": lo} for lo, la in route]}]}]}))
            out, err = io.StringIO(), io.StringIO()
            with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err), no_network():
                code = cmp.main(["--stage", str(stage_path), "--osm-cache", str(d / "osm"), "--cache", str(d / "navarra"), "--offline",
                                 "--json", str(d / "report.json")])
            text, saved = out.getvalue(), json.loads((d / "report.json").read_text())
            self.assertEqual(code, 0, err.getvalue())
            self.assertIn("## Stage 1, Navarra side, against the OSM cache", text)
            self.assertIn("matched to an OSM place: 4", text)
            self.assertEqual(saved["stage1"]["official_matched"], 4)
            self.assertEqual(saved["crs_evidence_stage1"]["EPSG:23030"]["n"], 14)  # the stage-1 waymarks of the fixture
            # a stage whose OSM answers are not in the cache is an error, not a request
            osm_cache.path("osm", sources.overpass_poi_query(stage["search_bbox"])).unlink()
            with no_network(), self.assertRaisesRegex(RuntimeError, "offline mode and no cache"):
                cmp.main(["--stage", str(stage_path), "--osm-cache", str(d / "osm"), "--cache", str(d / "navarra"), "--offline"])


if __name__ == "__main__":
    unittest.main()
