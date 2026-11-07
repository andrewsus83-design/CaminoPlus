"""The rows the importer makes: categories against the database CHECK lists, closed and unnamed places,
position along the stage, files that are the same every time. Real trimmed OSM answers for the data,
small synthetic lines for the arithmetic. No network, no database. Run: python -m unittest discover -s tests"""
import ast
import inspect
import json
import math
import random
import re
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

import audit  # noqa: E402
from poi_audit import export, normalize, route, sources  # noqa: E402
from poi_audit.export import AuditError, PlanError  # noqa: E402
from poi_audit.normalize import from_osm  # noqa: E402
from support_import import FIXTURES, load_fixture_stage, replay_cache, table_definition  # noqa: E402

STAGE_ID = "40000000-0000-0000-0000-000000000029"
ROUTE_ID = "20000000-0000-0000-0000-000000000001"


def fixture_plan(num: str, audit_info=None, shuffle: bool = False):
    """Plan for a fixture stage, built the way import_osm.py builds it."""
    stage, stage_path = load_fixture_stage(num)
    with tempfile.TemporaryDirectory() as tmp:
        cache = sources.Cache(replay_cache(tmp, num), offline=True)
        lines, _, problem = audit.load_route(stage, stage_path, cache)
        assert problem is None, problem
        line = route.build_stage_line(lines, *route.stage_ends(stage, stage_path))
        raw = sources.fetch_overpass(cache, sources.overpass_poi_query(stage["search_bbox"]))
    records = [r for r in map(from_osm, raw["elements"]) if r]
    if shuffle:
        random.Random(7).shuffle(records)
    return export.build_plan(stage, records, line, audit.BUFFER_M, audit_info), raw


def node(id_, lat, lon, **tags):
    return from_osm({"type": "node", "id": id_, "lat": lat, "lon": lon, "timestamp": "2026-05-01T00:00:00Z", "version": 1, "tags": tags})


LAT = 43.0
KX = route.M_PER_DEG * math.cos(math.radians(LAT))


def east(metres):
    return -1.5 + metres / KX


def north(metres):
    return LAT + metres / route.M_PER_DEG


STAGE = {"slug": "mini", "name": "Mini", "stage_number": 1, "stage_id": STAGE_ID, "route_id": ROUTE_ID}


class Categories(unittest.TestCase):
    """A category the database would reject must fail here, not in the night."""

    def test_every_category_the_importer_can_emit_is_accepted_by_the_check_lists_in_the_migrations(self):
        stays_ok = set(table_definition("stays")["checks"]["category"])
        pois_ok = set(table_definition("pois")["checks"]["category"])
        self.assertEqual(sorted(set(export.STAY_CATEGORIES) - stays_ok), [], "stays.category would reject these")
        self.assertEqual(sorted(set(export.POI_CATEGORIES) - pois_ok), [], "pois.category would reject these")
        self.assertGreaterEqual(len(export.STAY_CATEGORIES), 14)
        self.assertGreaterEqual(len(export.POI_CATEGORIES), 20)

    def test_the_check_list_of_stays_is_the_latest_one_not_the_first(self):
        # 20261105100000_business_owners.sql replaces stays_category_check with a longer list
        self.assertIn("other_service", table_definition("stays")["checks"]["category"])
        self.assertIn("owner", table_definition("stays")["checks"]["source"])

    def test_every_category_osm_can_produce_has_a_table_and_the_tables_do_not_overlap(self):
        tree = ast.parse(inspect.getsource(normalize.osm_category).lstrip())

        def returned(node_):
            if isinstance(node_, ast.Constant):
                yield node_.value
            elif isinstance(node_, ast.IfExp):          # return "hostel" if ... else "guesthouse"
                yield from returned(node_.body)
                yield from returned(node_.orelse)

        produced = {v for n in ast.walk(tree) if isinstance(n, ast.Return) and n.value is not None for v in returned(n.value)} - {None}
        self.assertIn("albergue_municipal", produced)
        self.assertEqual(sorted(produced - set(export.STAY_CATEGORIES) - set(export.POI_CATEGORIES)), [])
        self.assertEqual(set(export.STAY_CATEGORIES) & set(export.POI_CATEGORIES), set())

    def test_no_emitted_stay_category_is_a_service_kind(self):
        # stays.kind is generated: cafe, bar, restaurant, bakery -> food; shop, pharmacy ... -> service; the rest -> stay
        service = {"shop", "pharmacy", "bike_service", "luggage_service", "tour_operator", "other_service"}
        self.assertEqual(set(export.STAY_CATEGORIES) & service, set())

    def test_every_poi_category_has_a_default_name(self):
        for cat in export.POI_CATEGORIES:
            self.assertTrue(export.DEFAULT_NAMES[cat].strip(), cat)

    def test_every_row_column_is_a_real_insertable_column(self):
        for table, cols in (("stays", export.STAY_COLUMNS), ("pois", export.POI_COLUMNS)):
            d = table_definition(table)
            self.assertEqual(sorted(set(cols) - set(d["columns"])), [], f"{table}: columns the table does not have")
            self.assertEqual(sorted(set(cols) & d["generated"]), [], f"{table}: generated columns cannot be written (kind)")
        self.assertEqual(sorted(set(export.INSERT_ONLY["stays"]) - set(export.STAY_COLUMNS)), [])
        self.assertEqual(sorted(set(export.INSERT_ONLY["pois"]) - set(export.POI_COLUMNS)), [])
        for table in ("stage_stays", "stage_pois"):     # the link rows carry the place's OSM key until the ids exist
            self.assertEqual(sorted(set(export.LINK_COLUMNS) - set(table_definition(table)["columns"]) - {"osm_type", "osm_id"}), [])

    def test_nothing_we_do_not_have_is_ever_written(self):
        forbidden = {"image_url", "cover_url", "stamp_image_url", "image_license", "image_attribution", "image_source_url", "price_from", "price_to",
                     "price_updated_at", "currency", "rating_avg", "review_count", "favorite_count", "description", "story", "description_draft",
                     "verified_at", "data_checked_at", "labels", "amenities", "is_partner"}
        for cols in (export.STAY_COLUMNS, export.POI_COLUMNS, export.LINK_COLUMNS):
            self.assertEqual(sorted(set(cols) & forbidden), [])


class Cleaning(unittest.TestCase):
    def test_phone_takes_the_first_usable_number(self):
        c = export.clean_phone
        self.assertEqual(c("+34 982530412; +34 660396814"), "+34 982530412")            # real, stage 29
        self.assertEqual(c("+33559370232;+33661902921"), "+33559370232")                # real
        self.assertEqual(c("+34 979810284;"), "+34 979810284")                          # real: trailing ;
        self.assertEqual(c("3631;+34 948 76 00 00"), "+34 948 76 00 00")                # a short code is skipped
        self.assertIsNone(c("3631"))                                                    # real: not a number a pilgrim can call
        self.assertIsNone(c("ask at the bar"))
        self.assertIsNone(c(None))
        self.assertEqual(c("  +34\u00a0948\u00a076 00 00 "), "+34 948 76 00 00")

    def test_email_takes_the_first_address_and_drops_the_rest(self):
        c = export.clean_email
        self.assertEqual(c("info@portomino.com, portominho@hotmail.com"), "info@portomino.com")     # real
        self.assertEqual(c("mailto:Info@Hotel.example"), "Info@Hotel.example")
        self.assertIsNone(c("not an address"))
        self.assertIsNone(c("a@b"))

    def test_website_is_http_or_https_and_nothing_else(self):
        c = export.clean_website
        self.assertEqual(c("https://laposada.roncesvalles.es/?lang=en"), "https://laposada.roncesvalles.es/?lang=en")
        self.assertEqual(c("www.refuge-orisson.com"), "https://www.refuge-orisson.com")
        self.assertEqual(c("refuge.example/camino"), "https://refuge.example/camino")
        self.assertEqual(c("http://a.example; http://b.example"), "http://a.example")
        for bad in ("javascript:alert(1)", "mailto:a@b.example", "ftp://x.example", "https://user:pw@evil.example/", "just words", "localhost", ""):
            self.assertIsNone(c(bad), bad)

    def test_beds_is_a_whole_number_and_capacity_counts_only_for_dormitories(self):
        self.assertEqual(export.clean_beds({"beds": "183"}, "hotel"), 183)
        self.assertIsNone(export.clean_beds({"beds": "24;104"}, "hostel"))             # real
        self.assertIsNone(export.clean_beds({"beds": "0"}, "hostel"))
        self.assertIsNone(export.clean_beds({"beds": "many"}, "hostel"))
        self.assertEqual(export.clean_beds({"capacity": "20"}, "albergue_private"), 20)
        self.assertIsNone(export.clean_beds({"capacity": "20"}, "camping"))              # pitches, not beds
        self.assertIsNone(export.clean_beds({"capacity": "20"}, "hotel"))

    def test_address_from_the_parts_in_the_order_of_the_country(self):
        a = export.build_address
        self.assertEqual(a({"addr:street": "Calle Nuestra Señora de Roncesvalles", "addr:housenumber": "14", "addr:postcode": "31650",
                            "addr:city": "Roncesvalles"}), "Calle Nuestra Señora de Roncesvalles 14, 31650 Roncesvalles")
        self.assertEqual(a({"addr:street": "Rue d'Espagne", "addr:housenumber": "43", "addr:postcode": "64420", "addr:city": "Saint-Jean-Pied-de-Port"}),
                         "43 Rue d'Espagne, 64420 Saint-Jean-Pied-de-Port")
        self.assertEqual(a({"addr:street": "San Nicolas karrika", "addr:housenumber": "3"}), "San Nicolas karrika 3")
        self.assertEqual(a({"addr:place": "Fontao", "addr:postcode": "27616", "addr:city": "Portomarín"}), "Fontao, 27616 Portomarín")
        self.assertEqual(a({"addr:postcode": "64220", "addr:city": "Saint-Jean-Pied-de-Port"}), "64220 Saint-Jean-Pied-de-Port")
        self.assertEqual(a({"addr:housenumber": "5"}), None)                              # a number alone says nothing
        self.assertEqual(a({"addr:full": "Pl. Mayor 16, Castrojeriz, 09110"}), "Pl. Mayor 16, Castrojeriz, 09110")
        self.assertEqual(a({"addr:full": "x", "addr:street": "Calle Mayor"}), "Calle Mayor")      # the parts win over addr:full
        self.assertIsNone(a({}))

    def test_text_is_cleaned_but_not_rewritten(self):
        self.assertEqual(export.clean_text("Saint\u2011Jean\u2011Pied\u2011de\u2011Port"), "Saint-Jean-Pied-de-Port")   # non-breaking hyphens
        self.assertEqual(export.clean_text("  Casa \u200bRural\t Sabina \n"), "Casa Rural Sabina")
        self.assertEqual(export.clean_text("Mo-Su 08:00-22:00; Tu off"), "Mo-Su 08:00-22:00; Tu off")                    # opening_hours syntax kept
        self.assertIsNone(export.clean_text("  \u00a0 "))
        self.assertIsNone(export.clean_text("\ud800"))                                                                    # a lone surrogate cannot be written
        self.assertEqual(export.clean_country("fr"), "FR")
        self.assertIsNone(export.clean_country("France"))
        self.assertIsNone(export.clean_qid("Q0"))
        self.assertEqual(export.clean_qid("Q2984058"), "Q2984058")

    def test_location_is_ewkt_with_longitude_first(self):
        self.assertEqual(export.ewkt_point(-1.3194285, 43.0083493), "SRID=4326;POINT(-1.3194285 43.0083493)")
        self.assertEqual(export.ewkt_point(-1.5, 43.0), "SRID=4326;POINT(-1.5 43)")
        self.assertEqual(export.ewkt_point(0.00000001, -0.00000001), "SRID=4326;POINT(0 0)")
        self.assertEqual(export.ewkt_point(-1.123456789, 43.987654321), "SRID=4326;POINT(-1.1234568 43.9876543)")


class RealRows(unittest.TestCase):
    """Rows for real OSM places of the fixtures, written out in full so a change of any rule shows."""

    @classmethod
    def setUpClass(cls):
        cls.p1, cls.raw1 = fixture_plan("01")
        cls.p29, cls.raw29 = fixture_plan("29")

    def row(self, plan, table, osm_type, osm_id):
        return next(r for r in getattr(plan, table) if (r["osm_type"], r["osm_id"]) == (osm_type, osm_id))

    def test_a_stay_with_phone_email_website_beds_hours_and_a_street(self):
        self.assertEqual(self.row(self.p1, "stays", "node", 1896340970), {
            "source": "osm", "osm_type": "node", "osm_id": 1896340970, "category": "hotel", "name": "Erromesen aterpetxea",
            "route_id": "20000000-0000-0000-0000-000000000001", "address": "Carretera Francia, 31650 Roncesvalles", "country_code": None,
            "location": "SRID=4326;POINT(-1.3192808 43.0103845)", "phone": "+34 948 76 00 00", "email": "info@alberguederoncesvalles.com",
            "whatsapp": None, "website": "https://alberguederoncesvalles.com/", "beds": 183, "opening_hours": "Mar-Oct: 13:00-22:00",
            "data_confidence": None, "verification_level": "unverified"})

    def test_a_french_stay_with_contact_tags_and_a_country(self):
        r = self.row(self.p1, "stays", "node", 2408296585)
        self.assertEqual((r["category"], r["country_code"], r["address"]), ("albergue_municipal", "FR", "64220 Saint-Jean-Pied-de-Port"))
        self.assertEqual((r["phone"], r["email"], r["website"], r["beds"]),                       # all from contact:* tags
                         ("+33 5 5937 0509", "caminopa@hotmail.com", "http://www.aucoeurduchemin.org", 32))

    def test_two_phone_numbers_become_the_first_one(self):
        self.assertEqual(self.row(self.p29, "stays", "node", 470350604)["phone"], "+34 982530412")

    def test_a_church_drawn_as_a_way_keeps_its_wikidata_id_and_not_its_photo(self):
        r = self.row(self.p1, "pois", "way", 42798242)
        self.assertEqual((r["category"], r["wikidata_id"], r["tags"]), ("church", "Q2984058", {}))
        self.assertEqual(r["location"], "SRID=4326;POINT(-1.3194942 43.0099518)")                 # the centre of the outline

    def test_a_relation_is_a_row_too(self):
        r = self.row(self.p29, "pois", "relation", 8703029)
        self.assertEqual((r["category"], r["name"]), ("monastery", "Mosteiro de Santa María Madalena"))

    def test_an_unnamed_drinking_water_point_gets_a_neutral_name_and_a_flag(self):
        r = self.row(self.p1, "pois", "node", 535186152)
        self.assertEqual((r["name"], r["category"], r["tags"]), ("Drinking water", "water", {"name_default": True}))

    def test_a_named_place_has_no_flag(self):
        self.assertEqual(self.row(self.p1, "pois", "node", 2319749136)["tags"], {})

    def test_photos_are_never_imported_even_when_osm_names_one(self):
        for raw, plan in ((self.raw1, self.p1), (self.raw29, self.p29)):
            with_photo = [e for e in raw["elements"] if "image" in e["tags"] or "wikimedia_commons" in e["tags"]]
            self.assertTrue(with_photo, "the fixture should hold places that name a photo")
            text = "".join(export.dumps(r) for t in ("stays", "pois") for r in getattr(plan, t))
            for e in with_photo:
                for key in ("image", "wikimedia_commons"):
                    if key in e["tags"]:
                        self.assertNotIn(e["tags"][key], text)
                        self.assertNotIn(e["tags"][key].rsplit("File:", 1)[-1], text)

    def test_the_link_row_has_the_stage_the_position_along_it_and_the_detour(self):
        link = next(l for l in self.p1.stage_pois if l["osm_id"] == 535186152)
        self.assertEqual(link, {"stage_id": "40000000-0000-0000-0000-000000000001", "osm_type": "node", "osm_id": 535186152,
                                "km_from_stage_start": 24.05, "detour_m": 92})
        link = next(l for l in self.p29.stage_stays if l["osm_id"] == 470350604)
        self.assertEqual((link["stage_id"], link["km_from_stage_start"], link["detour_m"]), (STAGE_ID, 4.26, 14))

    def test_every_row_passes_the_checks_and_has_a_link_and_the_other_way_round(self):
        for plan in (self.p1, self.p29):
            self.assertEqual(export.check_plan(plan), [])
            self.assertEqual(len(plan.stays), len(plan.stage_stays))
            self.assertEqual(len(plan.pois), len(plan.stage_pois))
            self.assertEqual({(r["osm_type"], r["osm_id"]) for r in plan.stays}, {(l["osm_type"], l["osm_id"]) for l in plan.stage_stays})

    def test_links_are_in_stage_order(self):
        for plan in (self.p1, self.p29):
            kms = [l["km_from_stage_start"] for l in plan.stage_stays]
            self.assertEqual(kms, sorted(kms))
            self.assertLessEqual(max(kms), 30)

    def test_the_corridor_is_the_stage_line_not_the_whole_search_box(self):
        self.assertEqual(sum(self.p1.meta["outside_corridor"].values()), 8)       # in the box, near other stages or variants
        self.assertEqual(self.p1.meta["records"], 82)
        for plan in (self.p1, self.p29):
            self.assertLessEqual(max(l["detour_m"] for l in plan.stage_stays), audit.BUFFER_M["stay"])
            self.assertLessEqual(max(l["detour_m"] for l in plan.stage_pois), audit.BUFFER_M["worship"])

    def test_no_row_carries_who_edited_the_place_in_osm(self):
        for plan in (self.p1, self.p29):
            text = "".join(export.dumps(r) for t in ("stays", "pois", "stage_stays", "stage_pois", "skipped") for r in getattr(plan, t))
            for word in ('"user"', '"uid"', '"changeset"', "timestamp"):
                self.assertNotIn(word, text)

    def test_the_fixtures_themselves_hold_no_osm_user_data(self):
        for path in FIXTURES.glob("stage-*/*.json"):
            text = path.read_text(encoding="utf-8")
            for word in ('"user"', '"uid"', '"changeset"'):
                self.assertNotIn(word, text, path.name)


class ClosedAndUnnamed(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.plan, cls.raw = fixture_plan("29")

    def keys(self, rows):
        return {(r["osm_type"], r["osm_id"]) for r in rows}

    def test_places_osm_marks_closed_are_left_out_and_say_why(self):
        closed = [s for s in self.plan.skipped if s["reason"] == "closed"]
        self.assertEqual(len(closed), 9)
        self.assertIn(("node", 3712307147), self.keys(closed))                    # real: a disused cafe in Sarria
        rows = self.keys(self.plan.stays) | self.keys(self.plan.pois)
        self.assertEqual(self.keys(closed) & rows, set(), "a closed place must not become a row")
        self.assertTrue(all(s["detail"].startswith("OSM tags: disused") for s in closed), [s["detail"] for s in closed])
        self.assertEqual(self.keys(closed) & (self.keys(self.plan.stage_stays) | self.keys(self.plan.stage_pois)), set(), "nor a link")

    def test_every_closed_place_of_the_answer_inside_the_corridor_is_skipped(self):
        for el in self.raw["elements"]:
            rec = from_osm(el)
            if rec and normalize.closed_signal_keys(rec.tags):
                key = (el["type"], el["id"])
                in_rows = key in self.keys(self.plan.stays) | self.keys(self.plan.pois)
                self.assertFalse(in_rows, f"{key} is marked closed but was imported")

    def test_unnamed_stays_and_food_are_skipped_not_named(self):
        unnamed = [s for s in self.plan.skipped if s["reason"] == "unnamed"]
        self.assertEqual(len(unnamed), 3)
        self.assertEqual({s["category"] for s in unnamed}, {"cafe", "restaurant", "hostel"})
        self.assertTrue(all(r["name"] for r in self.plan.stays))

    def test_unnamed_service_and_site_points_get_a_neutral_name_from_the_category(self):
        defaulted = [r for r in self.plan.pois if r["tags"].get("name_default")]
        self.assertTrue(defaulted)
        for r in defaulted:
            self.assertEqual(r["name"], export.DEFAULT_NAMES[r["category"]])
        self.assertTrue(all(r["name"] for r in self.plan.pois))

    def test_edge_cases_of_the_closed_rule(self):
        live_old_phone = node(1, 43.0, -1.5, amenity="cafe", name="Cafe", **{"disused:phone": "+34 600 111 111"})
        replaced = node(2, 43.0, -1.5, shop="supermarket", name="Super", **{"disused:amenity": "bar"})
        hours_off = node(3, 43.0, -1.5, amenity="cafe", name="Cafe Off", opening_hours="off")
        hours_closed = node(4, 43.0, -1.5, amenity="cafe", name="Cafe Closed", opening_hours=" Closed ")
        seasonal = node(5, 43.0, -1.5, amenity="cafe", name="Cafe Seasonal", opening_hours="Apr-Oct")
        flagged = node(6, 43.0, -1.5, amenity="cafe", name="Cafe Disused", disused="yes")
        self.assertIsNone(export.skip_reason(live_old_phone, None))     # an old phone number is not a closure
        self.assertIsNone(export.skip_reason(replaced, None))           # a bar that became a supermarket is a supermarket
        self.assertEqual(export.skip_reason(hours_off, None)[0], "closed")
        self.assertEqual(export.skip_reason(hours_closed, None)[0], "closed")
        self.assertIsNone(export.skip_reason(seasonal, None))
        self.assertEqual(export.skip_reason(flagged, None)[0], "closed")
        self.assertEqual(export.skip_reason(node(7, 43.0, -1.5, amenity="cafe", name="  "), None)[0], "unnamed")
        self.assertIsNone(export.skip_reason(node(8, 43.0, -1.5, amenity="drinking_water"), None))   # unnamed water is fine


class AlongTheStage(unittest.TestCase):
    """km_from_stage_start and detour_m on a synthetic line: 10 km due east along the 43rd parallel."""

    def plan(self, *records, audit_info=None):
        line = route.StageLine([(east(0), LAT), (east(10000), LAT)])
        return export.build_plan(STAGE, list(records), line, audit.BUFFER_M, audit_info)

    def at(self, id_, metres_east, metres_north, **tags):
        return node(id_, north(metres_north), east(metres_east), **tags)

    def test_km_is_along_the_line_and_detour_is_the_distance_from_it(self):
        plan = self.plan(self.at(1, 2500, 300, tourism="hostel", name="A"), self.at(2, 7000, 0, amenity="drinking_water"),
                         self.at(3, 4000, -120, tourism="hotel", name="B"))
        by_id = {l["osm_id"]: l for l in plan.stage_stays + plan.stage_pois}
        self.assertEqual((by_id[1]["km_from_stage_start"], by_id[1]["detour_m"]), (2.5, 300))
        self.assertEqual((by_id[3]["km_from_stage_start"], by_id[3]["detour_m"]), (4.0, 120))
        self.assertEqual((by_id[2]["km_from_stage_start"], by_id[2]["detour_m"]), (7.0, 0))
        self.assertEqual([l["osm_id"] for l in plan.stage_stays], [1, 3])                      # in stage order
        self.assertEqual({l["stage_id"] for l in plan.stage_stays}, {STAGE_ID})

    def test_the_corridor_depends_on_the_kind_of_place_like_in_the_audit(self):
        near_stay = self.at(1, 5000, 1400, tourism="hostel", name="stay 1.4 km away")             # stays: 1500 m
        far_stay = self.at(2, 5000, 1600, tourism="hostel", name="stay 1.6 km away")
        near_food = self.at(3, 5000, 900, amenity="cafe", name="cafe 0.9 km")                      # food: 1000 m
        far_food = self.at(4, 5000, 1100, amenity="cafe", name="cafe 1.1 km")
        near_water = self.at(5, 5000, 450, amenity="drinking_water")                              # services: 500 m
        far_water = self.at(6, 5000, 550, amenity="drinking_water")
        plan = self.plan(near_stay, far_stay, near_food, far_food, near_water, far_water)
        self.assertEqual({r["osm_id"] for r in plan.stays} | {r["osm_id"] for r in plan.pois}, {1, 3, 5})
        self.assertEqual(plan.meta["outside_corridor"], {"food": 1, "service": 1, "stay": 1})

    def test_a_place_beyond_the_end_of_the_line_is_linked_at_the_end_with_its_distance_to_it(self):
        plan = self.plan(self.at(1, 10600, 0, amenity="cafe", name="after the end"), self.at(2, 11200, 0, amenity="cafe", name="too far"))
        self.assertEqual([(l["osm_id"], l["km_from_stage_start"], l["detour_m"]) for l in plan.stage_stays], [(1, 10.0, 600)])

    def test_one_place_seen_twice_is_one_row(self):
        a = self.at(1, 100, 0, tourism="hostel", name="A")
        plan = self.plan(a, a)
        self.assertEqual(len(plan.stays), 1)

    def test_an_audit_run_gives_data_confidence_and_hides_what_it_calls_closed(self):
        info = export.AuditInfo(stage="mini", scores={"osm:node/1": 83, "osm:node/2": 40}, closed={"osm:node/2": "Overture says permanently closed"})
        plan = self.plan(self.at(1, 100, 0, tourism="hostel", name="A"), self.at(2, 200, 0, tourism="hostel", name="B"),
                         self.at(3, 300, 0, tourism="hostel", name="C"), audit_info=info)
        self.assertEqual({r["osm_id"]: r["data_confidence"] for r in plan.stays}, {1: 83, 3: None})
        self.assertEqual([(s["osm_id"], s["reason"], s["detail"]) for s in plan.skipped], [(2, "closed", "audit: Overture says permanently closed")])
        self.assertTrue(all(r["verification_level"] == "unverified" for r in plan.stays), "an import never proposes a higher level")


class AuditFile(unittest.TestCase):
    def write(self, data) -> Path:
        path = Path(tempfile.mkdtemp()) / "entities.json"
        path.write_text(json.dumps(data), encoding="utf-8")
        return path

    def test_scores_and_closed_signals_are_read_from_entities_json(self):
        path = self.write({"stage": "mini", "entities": [
            {"id": "osm:node/1", "score": 71, "findings": [{"code": "STALE", "message": "old"}]},
            {"id": "osm:node/2", "score": 12, "findings": [{"code": "STALE", "message": "old"}, {"code": "CLOSED_SIGNAL", "message": "OSM marks it as disused"}]},
            {"id": "overture:abc", "score": 33, "findings": []}]})
        info = export.load_audit(path, "mini")
        self.assertEqual(info.scores["osm:node/1"], 71)
        self.assertEqual(info.closed, {"osm:node/2": "OSM marks it as disused"})

    def test_the_file_audit_py_really_writes_is_understood(self):
        # not a hand-made imitation: audit.write_outputs on one place with a closed signal and one without
        from datetime import datetime, timezone
        from poi_audit import checks
        from poi_audit.conflate import conflate
        from test_audit import osm
        now = datetime(2026, 11, 6, tzinfo=timezone.utc)
        open_cafe = osm(1, 43.1630, -1.2370, amenity="cafe", name="Cafe Abierto", opening_hours="Mo-Su 08:00-20:00")
        closed_cafe = osm(2, 43.1631, -1.2372, ts="2022-02-01T10:00:00Z", **{"disused:amenity": "cafe", "name": "Cafe Cerrado"})
        ents = conflate([open_cafe, closed_cafe], [], [])
        checks.run_checks(ents, now)
        for e in ents:
            e.score = checks.score(e, now)
        out = Path(tempfile.mkdtemp()) / "out"
        audit.write_outputs(out, {"slug": "mini", "name": "Mini"}, ents, now, {"route": "ok", "osm": "ok"}, "test")
        info = export.load_audit(out / "entities.json", "mini")
        self.assertEqual(set(info.scores), {"osm:node/1", "osm:node/2"})
        self.assertEqual(info.scores["osm:node/1"], ents[0].score)
        self.assertEqual(list(info.closed), ["osm:node/2"])

    def test_an_audit_of_another_stage_or_a_broken_file_is_refused(self):
        with self.assertRaisesRegex(AuditError, "is for stage 'other'"):
            export.load_audit(self.write({"stage": "other", "entities": []}), "mini")
        with self.assertRaisesRegex(AuditError, "score"):
            export.load_audit(self.write({"stage": "mini", "entities": [{"id": "osm:node/1", "score": 140}]}), "mini")
        with self.assertRaisesRegex(AuditError, "cannot use the audit file"):
            export.load_audit(self.write({"stage": "mini"}), "mini")
        with self.assertRaisesRegex(AuditError, "cannot use the audit file"):
            export.load_audit(Path("/nonexistent/entities.json"), "mini")


class Checks(unittest.TestCase):
    """check_row says what the database would say."""

    def good(self):
        return export.stay_row(node(1, 43.0, -1.5, tourism="hostel", name="A", phone="+34 948 76 00 00"), ROUTE_ID, None)

    def test_a_good_row_passes(self):
        self.assertEqual(export.check_row("stays", self.good()), [])

    def test_each_kind_of_bad_row_is_named(self):
        cases = [
            ("category", "restaurant_bar", "category 'restaurant_bar' is not allowed"),
            ("name", None, "name must be a trimmed text"),
            ("name", " padded ", "name must be a trimmed text"),
            ("location", "POINT(-1.5 43)", "location must be 'SRID=4326;POINT(lon lat)'"),
            ("verification_level", "data_check", "only writes verification_level 'unverified'"),
            ("data_confidence", 101, "data_confidence must be null or 0..100"),
            ("osm_type", "area", "osm_type must be node, way or relation"),
            ("osm_id", 0, "osm_id must be a positive whole number"),
            ("beds", 0, "beds must be null or 1..2000"),
            ("email", "a@b", "email must be null or one address"),
            ("website", "javascript:alert(1)", "website must be null or an http(s) address"),
            ("phone", "3631", "phone must be null or a callable number"),
            ("country_code", "France", "country_code must be null or two capital letters"),
            ("route_id", "not-a-uuid", "route_id must be a uuid"),
        ]
        for column, value, text in cases:
            row = self.good()
            row[column] = value
            problems = export.check_row("stays", row)
            self.assertTrue(any(text in p for p in problems), f"{column}={value!r}: {problems}")

    def test_latitude_out_of_range_is_caught(self):
        row = self.good()
        row["location"] = "SRID=4326;POINT(-1.5 143)"
        self.assertTrue(export.check_row("stays", row))

    def test_extra_and_missing_columns_are_named(self):
        row = self.good()
        row["kind"] = "stay"                      # a generated column: the database refuses a value
        self.assertTrue(any("columns must be exactly" in p for p in export.check_row("stays", row)))
        row = self.good()
        del row["whatsapp"]
        self.assertTrue(any("columns must be exactly" in p for p in export.check_row("stays", row)))

    def test_a_poi_in_a_stay_category_and_the_other_way_round_are_refused(self):
        poi = export.poi_row(node(2, 43.0, -1.5, amenity="drinking_water"), None)
        poi["category"] = "hostel"
        self.assertTrue(any("not allowed in pois" in p for p in export.check_row("pois", poi)))

    def test_link_rows(self):
        link = {"stage_id": STAGE_ID, "osm_type": "node", "osm_id": 1, "km_from_stage_start": 12.34, "detour_m": 50}
        self.assertEqual(export.check_row("stage_stays", link), [])
        for key, value, text in (("km_from_stage_start", 12.345, "two decimals"), ("km_from_stage_start", -1.0, "km_from_stage_start"),
                                 ("km_from_stage_start", 10000.0, "km_from_stage_start"), ("detour_m", -1, "detour_m"),
                                 ("detour_m", 1.5, "detour_m"), ("stage_id", "40", "stage_id must be a uuid")):
            bad = dict(link)
            bad[key] = value
            self.assertTrue(any(text in p for p in export.check_row("stage_stays", bad)), f"{key}={value}")

    def test_a_plan_whose_rows_do_not_belong_together_is_refused(self):
        plan = export.Plan(stage=dict(STAGE))
        a = node(1, 43.0, -1.5, tourism="hostel", name="A")
        plan.stays = [export.stay_row(a, ROUTE_ID, None)]
        plan.stage_stays = [export.link_row(STAGE_ID, plan.stays[0], 1.0, 10), export.link_row(STAGE_ID, {"osm_type": "node", "osm_id": 99}, 1.0, 10)]
        problems = export.check_plan(plan)
        self.assertTrue(any("node/99 has no row in stays" in p for p in problems), problems)
        plan.stage_stays = [export.link_row("40000000-0000-0000-0000-000000000099", plan.stays[0], 1.0, 10)]
        self.assertTrue(any("belongs to stage" in p for p in export.check_plan(plan)))
        plan.stage_stays = []
        plan.stays = [plan.stays[0], dict(plan.stays[0])]
        self.assertTrue(any("appears more than once" in p for p in export.check_plan(plan)))
        plan.stays = [dict(export.stay_row(a, "20000000-0000-0000-0000-000000000002", None))]
        self.assertTrue(any("route_id is not the route of this stage" in p for p in export.check_plan(plan)))


class Files(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.plan, _ = fixture_plan("01")
        cls.plan.meta["route"] = {"source": "test", "length_km": 24.1, "points": 1, "start_snap_m": 1, "end_snap_m": 2, "joined_gaps": 0}
        cls.plan.meta["osm_timestamp"] = "2026-06-01T08:52:28Z"

    def write(self, plan) -> Path:
        out = Path(tempfile.mkdtemp()) / "out"
        export.write_plan(plan, out)
        return out

    def test_all_the_files_are_written_one_json_object_per_line_in_utf8(self):
        out = self.write(self.plan)
        self.assertEqual(sorted(p.name for p in out.iterdir()), ["pois.ndjson", "skipped.ndjson", "stage_pois.ndjson", "stage_stays.ndjson",
                                                                 "stays.ndjson", "summary.json", "summary.md"])
        for name, table in (("stays", "stays"), ("pois", "pois"), ("stage_stays", "stage_stays"), ("stage_pois", "stage_pois")):
            lines = (out / f"{name}.ndjson").read_bytes().decode("utf-8").split("\n")
            self.assertEqual(lines[-1], "", "the last line ends with a newline")
            rows = [json.loads(l) for l in lines[:-1]]
            self.assertEqual(len(rows), len(getattr(self.plan, table)))
            for row in rows:
                self.assertEqual(list(row), list(export.COLUMNS[table]), "the keys are in the order of the columns")
        text = (out / "pois.ndjson").read_text(encoding="utf-8")
        self.assertIn("Orreagako Andre Mariaren eliza", text)            # not \u-escaped

    def test_the_same_input_gives_the_same_bytes_in_any_order(self):
        a = self.write(self.plan)
        shuffled, _ = fixture_plan("01", shuffle=True)
        shuffled.meta = dict(self.plan.meta)
        b = self.write(shuffled)
        for name in sorted(p.name for p in a.iterdir()):
            self.assertEqual((a / name).read_bytes(), (b / name).read_bytes(), name)

    def test_rows_are_in_a_fixed_order(self):
        for rows in (self.plan.stays, self.plan.pois):
            ranks = [(export.OSM_TYPES.index(r["osm_type"]), r["osm_id"]) for r in rows]
            self.assertEqual(ranks, sorted(ranks))

    def test_what_is_written_can_be_read_back_and_equals_the_plan(self):
        out = self.write(self.plan)
        stage, _ = load_fixture_stage("01")
        back = export.read_plan(out, stage)
        for table in ("stays", "pois", "stage_stays", "stage_pois"):
            self.assertEqual(getattr(back, table), getattr(self.plan, table), table)

    def test_a_file_edited_into_something_the_database_would_refuse_is_refused_on_reading(self):
        out = self.write(self.plan)
        stage, _ = load_fixture_stage("01")
        path = out / "stays.ndjson"
        lines = path.read_text(encoding="utf-8").splitlines()
        first = json.loads(lines[0])
        first["category"] = "spaceship"
        path.write_text("\n".join([json.dumps(first)] + lines[1:]) + "\n", encoding="utf-8")
        with self.assertRaisesRegex(PlanError, "category 'spaceship' is not allowed"):
            export.read_plan(out, stage)
        path.write_text("\n".join(lines[1:]) + "\n", encoding="utf-8")                  # a row removed: its link now points at nothing
        with self.assertRaisesRegex(PlanError, "has no row in stays"):
            export.read_plan(out, stage)
        path.write_text("not json\n", encoding="utf-8")
        with self.assertRaisesRegex(PlanError, "line 1 is not JSON"):
            export.read_plan(out, stage)
        path.unlink()
        with self.assertRaisesRegex(PlanError, "cannot read"):
            export.read_plan(out, stage)

    def test_the_summary_says_what_was_found_and_what_is_missing(self):
        out = self.write(self.plan)
        s = json.loads((out / "summary.json").read_text(encoding="utf-8"))
        self.assertEqual(s["rows"]["stays"], len(self.plan.stays))
        self.assertEqual(s["skipped"], {"unnamed": 4})
        md = (out / "summary.md").read_text(encoding="utf-8")
        self.assertIn("camino-frances-01", md)
        self.assertIn("No prices, ratings, reviews or photos", md)
        self.assertIn("OpenStreetMap contributors", md)
        self.assertNotRegex(md, r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d+")           # no wall-clock time anywhere

    def test_the_stage_files_of_the_repository_have_what_the_importer_needs(self):
        stages = HERE.parents[1] / "offline-maps" / "stages"
        files = sorted(p for p in stages.glob("camino-frances-*.json"))
        self.assertGreaterEqual(len(files), 33)
        for path in files:
            stage = json.loads(path.read_text(encoding="utf-8"))
            for key in ("slug", "name", "stage_number", "stage_id", "route_id", "search_bbox", "route_name_regex", "fallback_route"):
                self.assertIn(key, stage, path.name)
            self.assertRegex(stage["stage_id"], export.UUID_OK)
            self.assertRegex(stage["route_id"], export.UUID_OK)
            start, end = route.stage_ends(stage, path)
            self.assertNotEqual(start, end, path.name)
            w, s_, e, n = stage["search_bbox"]
            self.assertTrue(w < start[0] < e and s_ < start[1] < n and w < end[0] < e and s_ < end[1] < n, f"{path.name}: the stage ends are outside the search box")


if __name__ == "__main__":
    unittest.main()
