# Place and POI audit (prototype)

Nobody on the team has walked every stage, so we need a repeatable way to tell
which albergues, cafes, churches and sites in our data are probably right, and
which ones a human should look at. This tool cross-checks four open sources
against each other, scores every place, and writes a review queue.

Pilot: **Camino Francés stage 1, Saint-Jean-Pied-de-Port to Roncesvalles**
(same stage file as `tools/offline-maps`). Any stage file works, on any route.

The same folder holds the importer that turns the OSM places along a stage into database rows
(`import_osm.py`): see [Import to Supabase](#import-to-supabase-osm-importer), and the generator of the route line
the Maps tab draws (`build_route_lines.py`): see [Route lines for the Maps tab](#route-lines-for-the-maps-tab-build_route_linespy).

```
 OSM (Overpass) ─┐
 Overture places ┼─► normalise to CaminoPlus categories ─► keep what is near the route
 Wikidata        ┘                                              │
                                                                ▼
                         link records that are the same place (ids, then name + distance)
                                                                │
          rule checks ◄─────────────────────────────────────────┤
          Commons photo licence + location ◄────────────────────┤
          Claude (optional): description draft, photo plausibility
                                                                ▼
              score 0-100 + "Data cross-checked" label + review queue (CSV / Supabase)
                                                                │
                                         human decides: accept / fix / reject
```

## Run it

```bash
cd tools/poi-audit
pip install -r requirements.txt       # pinned lock (see below)
python audit.py --stage ../offline-maps/stages/camino-frances-01.json --out out/camino-frances-01
python audit.py ... --ai              # + Claude drafts and photo checks (needs ANTHROPIC_API_KEY)
python audit.py ... --offline         # replay from cache/, no network
python audit.py ... --strict          # what CI uses: any source that failed or was skipped fails the run
python -m unittest discover -s tests  # offline tests
```

CI (`.github/workflows/poi-audit.yml`) runs it with `--strict` on pull requests, monthly, and by
hand (pick any stage file). The report shows on the run page and the full output (including the
cached source responses) is attached as an artifact. AI steps run only when the repo has an
`ANTHROPIC_API_KEY` secret, and the key is visible to the audit step only (never to `pip install`).

Output in `--out`: `report.md` (summary, starting with **Run status**), `review_queue.csv` (one row
per place and check, most important first, with empty `decision` / `reviewer_note` columns),
`entities.json` (everything), `places.geojson` (drop on a map).

### When a source fails

| Source | If it fails | Exit code |
|---|---|---|
| OpenStreetMap places, or the OSM route relations | the run is useless without them: `report.md` says **Run status: FAILED**. A hand-drawn fallback line is still drawn so the files can be inspected, but it is never presented as the route | 1 |
| Overture, Wikidata, Commons | **DEGRADED**: a warning at the top of `report.md` and in the Sources table, the checks that need that source are weaker (for example no `ONLY_IN_OVERTURE`) | 0, but 1 with `--strict` |
| Claude (`--ai`) | a warning, the drafts are incomplete | always 0 |

The outputs are written in every case, so CI can show the report before it fails the job.

**Overture release.** Old releases are removed from the bucket, so the audit asks the STAC catalog
(https://stac.overturemaps.org/catalog.json) for the latest one (then the S3 listing as a second
way) and prints it in the Sources table. Set `OVERTURE_RELEASE=2026-10-21.0` to pin one and repeat
a run. `--offline` reuses the release of the last online run (stored in `cache/`).

**Dependencies.** `requirements.in` lists what we use; `requirements.txt` is the exact lock
(`uv pip compile requirements.in --python-version 3.12 --python-platform x86_64-manylinux_2_28 -o requirements.txt`).
Dependabot proposes updates to the lock.

## Sources and licences

| Source | What we use | Licence | Notes |
|---|---|---|---|
| OpenStreetMap (Overpass API) | stays, food, churches, heritage, services; last edit date, `check_date` | ODbL, attribution | Backbone: same data as the offline map |
| Overture Maps places | second opinion on location, name, category, open/closed, phone, website | CDLA-Permissive-2.0 | Read from the public S3 bucket; includes some closed places |
| Wikidata | notable churches and sites, heritage status, photo, OSM ids, Wikipedia links | CC0 | Good for iconic places, thin for albergues |
| Wikimedia Commons | photo licence, author, where the photo was taken | per file (CC0, CC BY, CC BY-SA ok) | NC / ND / unknown are rejected |
| Gobierno de Navarra open data (datos.gob.es, datosabiertos.navarra.es) | the albergue registry, the Camino fountains, the waymarks | CC BY 4.0, attribution and a note of changes | Not wired yet: see the section below. The credit line is "Contains public sector information of Gobierno de Navarra, CC BY 4.0" |

Other datos.gob.es datasets are not used until their own licence has been read from their catalogue entry: the licence is
per dataset, and the adapter refuses anything that is not CC BY 4.0 or CC0.

No scraping of Google, TripAdvisor, Booking, Gronze.com or social media. Gronze.com in particular is not used: its content is
copyrighted and its robots.txt blocks automated access, so it would need the owner's written permission first. Wikipedia and
Wikivoyage text is CC BY-SA (a share-alike duty): the audit links to them and reads Wikidata facts, it does not copy their text.

## Spanish open data (datos.gob.es): Navarra

The Gobierno de Navarra publishes three tables about the Camino as open data. They are found through the
datos.gob.es catalogue API and downloaded from the publisher's portal (datosabiertos.navarra.es).
`poi_audit/opendata_navarra.py` reads them and `poi_audit/navarra_compare.py` measures them against OSM.
**Not wired into `audit.py`, the importer or the database yet.**

| Table (catalogue slug, `a15002917-...`) | Rows on 2026-11-07 | What is in it |
|---|---|---|
| Albergues turísticos en activo del Registro de Turismo de Navarra (`albergues-turisticos-en-activo-del-registro-de-turismo-de-navarra1`) | 115 | registry id (`UAB00062`), name, street, postcode, village, beds, "del Camino de Santiago" flag, owner contact only where the owner agreed |
| Fuentes del Camino de Santiago (`fuentes-del-camino-de-santiago1`) | 32 (20 Francés, 12 Aragonés) | a UTM position, the stage (F1 to F7, A1 to A3) and the municipality; no name. Surveyed 2012 to 2023, updated yearly |
| Señales del camino de Santiago (`senales-del-camino-de-santiago`) | 735 | waymarks (mojón, arrow, panel ...): position, type, stage. Not places |

**Licence, exactly as published** (read on 2026-11-07): `http://publications.europa.eu/resource/authority/licence/CC_BY_4_0`,
that is CC BY 4.0, for all three. Read in two places: the `license` field of the catalogue entry
(`https://datos.gob.es/apidata/catalog/dataset/title/<title>`), and the publisher's own CKAN API
(`https://datosabiertos.navarra.es/api/3/action/package_show?id=<name>`: `license_id` "CC-BY-4.0",
`license_title` "Creative Commons Attribution 4.0", `license_url` the same URI, organisation "Gobierno de
Navarra"). The datos.gob.es page of the fountains says "Condiciones de uso" with the same URI. The same value
is on every Navarra dataset we looked at (7 in the catalogue, all 13 the portal lists for "albergue").
`resolve_licence` refuses to run when the entry has no licence, an unknown one, or one that is not CC BY 4.0
or CC0 (BY-NC, BY-SA and BY-ND are named in the refusal), and it does so before a data file is requested.
`--licence CC-BY-4.0` fills a gap only; it never overrides a published value.

```bash
cd tools/poi-audit
python -m poi_audit.opendata_navarra --cache cache              # 5 requests, 2 s apart, then everything is cached
python -m poi_audit.opendata_navarra --cache cache --offline    # replay only; prints licence, credit and skipped rows
python -m poi_audit.navarra_compare --stage ../offline-maps/stages/camino-frances-01.json \
    --osm-cache cache --cache cache --offline                   # the measurement below, from caches (never asks Overpass)
```

In code: `data = opendata_navarra.load(sources.Cache(cache_dir))` gives `data.fountains` (`normalize.Record`,
source `navarra`, category `fountain`), `data.lodgings` (`Lodging`: a registry row without a position,
`.to_record(lat, lon)` once an OSM match gives one), `data.waymarks`, `data.skipped` (row and reason),
`data.attributions` and `data.status()` for the Sources table. A server that answers 403, 429 or 5xx is asked
twice more (30 s and 90 s later); after that `SourceBlocked` (403, 429) or `SourceError` is raised and nothing
tries to get around it.

**What it adds** (stage-1 OSM cache of 2026-11-06, tables of 2026-11-07). Less than hoped. The registry
confirms that an albergue exists and how many beds it has (115 rows, 4,470 beds; 64 rows and 2,407 beds in the
villages of stages 1 to 7). On stage 1, 4 of the 5 official albergues (Luzaide, Roncesvalles, Burguete, Espinal)
are in OSM and 1 is not (Lorentx Aterpea, 42 beds); the bed counts agree in 1 of the 4 (Roncesvalles: 223
official, 183 in OSM). It adds almost no contact data: owners refused publication for 108 of 115 rows (6 phones,
9 emails and 5 websites in all), and OSM already has a phone and an email for the 4 matches. No prices, season or
operator. The official fountain list is short (20 on the whole Camino Francés); of the 4 on stage 1, two are
within 7 m of an OSM water point and two have none within 220 m, and OSM has 16 water points there. Drinkability
is not stated. The waymarks are the most useful table: they can check a route line (the hand-drawn stage-1 line
is 576 m from them at the median, and the stage-6 line keeps only 1 of 3 official fountains inside the 500 m
corridor) and mark 86 safety posts and 102 road crossings. Their stage label is wrong for about 10 of the 735 rows.

| Stage | Albergues | Beds | Flagged Camino | Official fountains | Waymarks |
|---|---|---|---|---|---|
| 1 Saint-Jean to Roncesvalles | 2 | 247 | 2 | 4 | 140 |
| 2 Roncesvalles to Zubiri | 12 | 391 | 3 | 2 | 64 |
| 3 Zubiri to Pamplona | 13 | 467 | 10 | 3 | 40 |
| 4 Pamplona to Puente la Reina | 11 | 396 | 5 | 1 | 47 |
| 5 Puente la Reina to Estella | 10 | 386 | 8 | 5 | 76 |
| 6 Estella to Los Arcos | 9 | 244 | 8 | 3 | 124 |
| 7 Los Arcos to Logroño (Navarra part) | 7 | 276 | 5 | 2 | 78 |

Albergues are counted by village (the registry has no coordinates), from the stage names, approximately.
Only stage 1 could be compared with OSM: there is no OSM cache for stages 2 to 7.

**What it does not do.**
- The registry has **no coordinates** (its XSD lists 15 columns, none a position), no prices, no season, no
  operator. A row can be placed only through an OSM match (address, then name; `navarra_compare`).
- Fountain and waymark coordinates say "UTM" and nothing else. They are **ED50 / UTM 30N** (EPSG:23030):
  read as ETRS89 only 24 of the 140 stage-1 waymarks are within 30 m of the OSM route (median 104 m, against
  2.6 m as ED50), and every point would be 235 m off. This is inferred, not published; `utm.py` converts
  without pyproj (ED50 with the EPSG:1588 shift, about 1 to 3 m), `crs_evidence` repeats the check.
- Hotels, hostals, casas rurales, campings and apartments are other registries of the same portal with the same 15
  columns and the same refusal text (one table, "Alojamientos inscritos", has all 2,846 rows). Not read.
- The official track (SHP from IDENA, `Camino de Santiago. Trazado oficial / real`) is not read: no
  pure-Python shapefile reader is in the requirements. The waymarks stand in for it.
- The pilgrim credentials of Orreaga/Roncesvalles (monthly counts since 2017 by age, gender, country, region,
  motive and mode, CC BY 4.0) are statistics, not places. Not read; they could drive a "busy season" hint.
- The catalogue API sits behind a firewall that answered 403 to 6 of 9 requests on 2026-11-07 (three in a row
  to the adapter), while the publisher's portal never refused one. The cache makes a second run independent of
  the catalogue; a fresh CI checkout is not.

**Credit text.** Every record carries it (`tags["attribution"]["credit"]`, or `.attribution.credit` on a waymark):
`Contains public sector information of Gobierno de Navarra, CC BY 4.0`. CC BY 4.0 also asks for the licence
link and a note that the data was changed, which `Attribution.credit_full` adds: "... (https://creativecommons.org/licenses/by/4.0/).
Dataset: Albergues turísticos en activo del Registro de Turismo de Navarra,
https://datosabiertos.navarra.es/dataset/albergues-turisticos-en-activo-del-registro-de-turismo-de-navarra,
retrieved 2026-11-07. Changed by CaminoPlus: names and contact fields normalised, categories mapped; the source
has no coordinates." The "Sources and licences" table above lists this source.

## Checks

| Code | Severity | What it means |
|---|---|---|
| `CLOSED_SIGNAL` | high | OSM has `disused:` / `abandoned:` / `was:` tags (the query asks for them, otherwise closed places never arrive), or Overture says closed |
| `PHOTO_LICENCE` | high | linked photo has a licence we cannot use |
| `DUPLICATE` | medium | two OSM features look like the same place |
| `COORD_DISAGREE` | medium | sources put the same place more than 100 m apart (250 m for churches and sites) |
| `ONLY_IN_OVERTURE` | medium / low | Overture has it, OSM does not: missing from our map, or closed |
| `ONLY_IN_WIKIDATA` | medium / low | notable place with no OSM feature nearby |
| `STALE` | medium | stay or cafe not edited or checked in OSM for 3+ years |
| `MISSING_FIELDS` | medium / low | no contact, hours, beds or price (stays); no hours (cafes); no Wikidata link (churches) |
| `PHOTO_FAR`, `PHOTO_UNKNOWN_LICENCE`, `PHOTO_AI_MISMATCH` | medium | photo may show another place, or its licence is unknown |
| `NAME_DISAGREE`, `CATEGORY_DISAGREE`, `GENERIC_NAME`, `NO_PHOTO`, `STALE_OVERTURE` | low | worth a glance |

## Score and label

Score 0-100: base 20, +20 / +30 when 2 / 3 sources agree, +10 when their
location and name agree, up to +20 for complete pilgrim fields, up to +15 for
recent edits, +5 for a Wikidata link, minus 25 / 10 / 3 per high / medium / low
finding. Bands: 75+ high, 50-74 medium, under 50 low.

**Linking records.** Generic words ("albergue", "hostal", "de", "municipal" ...) are ignored when two
names are compared, so a name that is only the village still matches "Albergue de Peregrinos de
Roncesvalles". Two names that both say what they are but disagree (albergue vs hostal, municipal vs
parroquial) never match on the village alone: "Albergue Municipal de Zubiri" and "Hostal Zubiri" stay
two places.

What the app may show, strongest first (`verification_level` in the database):

| Level | Label in the app | Who sets it |
|---|---|---|
| `owner` | Verified by owner · Nov 2026 | business owner flow (Settings > List your business) |
| `pilgrim` | Confirmed by pilgrims · Nov 2026 | recent pilgrim reports / reviews agree |
| `editor` | Checked by CaminoPlus · Nov 2026 | a team member checked it by hand |
| `data_check` | Data cross-checked · Nov 2026 | this tool, only when the score is **75 or more and no open high or medium finding** is left |
| `unverified` | Not verified yet | default, and what this tool writes for every other place |

**A data check is never shown as "verified".** It means open sources agree,
not that the albergue is open tonight, has beds, or is clean.

The level is in `entities.json` (`verification.level`). It is a proposal: nothing is written to
the database from here yet.

## Where AI helps (and where it does not)

Claude (`claude-sonnet-5-5` by default, `CAMINOPLUS_AI_MODEL` to change) is used for two
narrow jobs, both drafts for a human:

1. **Description drafts** for churches and sites: written only from the Wikidata
   entry and the Wikipedia summary we pass in, in its own words, with sources and
   an "unsure" list for the editor. Stored as `pois.description_draft`, never
   published automatically.
2. **Photo plausibility**: "does this Commons photo plausibly show *Real Colegiata
   de Roncesvalles*, a collegiate church?" Answers `matches` / `does_not_match` /
   `unsure`. A mismatch becomes a finding.

AI does not decide whether a place exists, is open, or is good. Rules and source
agreement do the auditing; owners and pilgrims are the ground truth.

Rough cost (estimate, not measured): about 2 calls per important place, around
1 cent each, so the 33 Francés stages (~2,000 churches and sites) would be
roughly $20-40 per full run. Stays and cafes need no AI calls.

## Review workflow

1. CI runs the audit (monthly, and when someone asks).
2. Findings go to `review_queue.csv` now, and to `data_audit_findings` once the
   loader exists (migration `20261106100000_data_audit.sql`). That table has one row per
   `entity_key` + `code`, so the outputs are **aggregated the same way**: a place that triggers
   `COORD_DISAGREE` three times has one finding with `count: 3` and the three messages listed
   in `details.occurrences` (and one CSV row with a `count` column). A loader can insert them as they are.
3. A reviewer works top-down: fix OSM (good for everyone), mark `fixed`, or
   `rejected` when the finding is wrong. A place whose findings are all low or fixed and whose
   score is 75+ gets `verification_level = 'data_check'`.
4. Owner claims and pilgrim reports upgrade the level; a new `CLOSED_SIGNAL` or
   `STALE` finding downgrades it.

## Rollout

1. Pilot stage 1 (this PR): check the report by eye, tune thresholds.
2. Write stage files for the other 32 Francés stages (also needed for offline packs).
3. Loader: write findings and scores into Supabase with the service role.
4. Small admin screen for the review queue (no admin screen exists yet).
5. Same pipeline for other routes: only the stage file changes.

## Import to Supabase (OSM importer)

`import_osm.py` turns the OpenStreetMap places along one stage into rows for the Supabase tables `stays`, `pois`,
`stage_stays` and `stage_pois`. It reuses what the audit does (the same Overpass requests and cache, `normalize.from_osm`
for the CaminoPlus categories, `audit.load_route` for the real route, `audit.BUFFER_M` for how far from the route a place
may be) and adds what the audit never did: rows. **A dry run is the default.** It writes files and needs no database;
`--apply` sends them.

```
 stage file ─► OSM route ways (Overpass) ─► ONE ordered line, start town to end town
 OSM places (Overpass) ─► from_osm: CaminoPlus categories ─► keep what is within the corridor of THIS line
        closed, or a stay / cafe without a name ─► skipped.ndjson
        the rest ─► stays + pois rows, and stage_stays + stage_pois rows (km along the stage, metres off it)
                          │  NDJSON files in --out: read them, edit them if you must
                          ▼  --apply: service role, PostgREST upsert on (osm_type, osm_id), then read back and count
                  Supabase: new rows, refreshed rows, links
```

### Run it

```bash
cd tools/poi-audit
pip install -r requirements.txt
python import_osm.py --stage ../offline-maps/stages/camino-frances-01.json --out out/import/camino-frances-01
python import_osm.py ... --offline              # replay from cache/, no network
python import_osm.py ... --audit out/camino-frances-01/entities.json   # data_confidence from an audit.py run of the same stage
# look at out/import/camino-frances-01/summary.md and the files, then send exactly those files:
export SUPABASE_URL=...  SUPABASE_SERVICE_ROLE_KEY=...      # the service role key: server side only, never in the app
python import_osm.py --stage ... --from-ndjson out/import/camino-frances-01 --apply
python import_osm.py ... --apply                # or: read OSM and send in one go (the files are written first and read back)
python import_osm.py --expand-stages 1-3,7      # the stage files a list of stage numbers stands for
python -m unittest discover -s tests            # offline tests (trimmed real OSM answers, a mock PostgREST)
```

Exit code 0: done. 1: the OSM route or places could not be read (or came back partial), no line could be drawn through the
route, the rows are not valid, or `--apply` refused something or did not read back what it wrote. 2: wrong command line.
Overpass etiquette: stages are imported one at a time, `--pause` (10 s) waits between the route request and the places request
of a stage, and the workflow waits between stages. overpass-api.de, overpass.kumi.systems and overpass.private.coffee are tried
in that order, as the audit does.

### What comes out

| File in `--out` | What it is |
|---|---|
| `stays.ndjson` | one JSON object per line = one row of `public.stays`, with the database's column names, in column order |
| `pois.ndjson` | the same for `public.pois` |
| `stage_stays.ndjson`, `stage_pois.ndjson` | link rows: `stage_id`, `osm_type`, `osm_id`, `km_from_stage_start`, `detour_m`. They carry the place's OSM key instead of `stay_id` / `poi_id`, because those uuids are made by the database when the place is inserted; `--apply` swaps the key for the id |
| `skipped.ndjson` | the places that were left out, with `reason` (`closed` or `unnamed`) and the `detail` |
| `summary.md`, `summary.json` | counts per table and category, how many stays have an address, phone, email, website, beds and hours, what was skipped, the length of the stage line and how far the start and end towns are from it, and the date of the OSM data |
| `apply_report.json` | only after `--apply`: counts and problems, never a secret |

The files do not depend on the clock or on the order OSM happened to answer in: the same input gives byte-identical files
(rows are sorted node, way, relation and then by id; links in stage order). A row, taken from stage 1:

```json
{"source":"osm","osm_type":"node","osm_id":1896340970,"category":"hotel","name":"Erromesen aterpetxea","route_id":"20000000-0000-0000-0000-000000000001","address":"Carretera Francia, 31650 Roncesvalles","country_code":null,"location":"SRID=4326;POINT(-1.3192808 43.0103845)","phone":"+34 948 76 00 00","email":"info@alberguederoncesvalles.com","whatsapp":null,"website":"https://alberguederoncesvalles.com/","beds":183,"opening_hours":"Mar-Oct: 13:00-22:00","data_confidence":null,"verification_level":"unverified"}
{"stage_id":"40000000-0000-0000-0000-000000000001","osm_type":"node","osm_id":1896340970,"km_from_stage_start":24.12,"detour_m":112}
```

Measured on real Overpass answers cached on 2026-11-07 (OSM data of 2026-06 and 2026-07: the mirrors that answered lag behind
the live map, and the importer warns when the data is more than 60 days old):

| Stage | Line | In the search box | In the stage corridor | Stays + food | Pois | Skipped |
|---|---|---|---|---|---|---|
| 1 Saint-Jean-Pied-de-Port to Roncesvalles | 24.1 km | 768 | 194 | 81 | 109 | 4 unnamed |
| 8 Logroño to Nájera (a city start) | 29.0 km | 1957 | 819 | 436 | 356 | 7 closed, 20 unnamed |
| 15 Castrojeriz to Frómista | 24.6 km | 464 | 160 | 76 | 83 | 1 unnamed |
| 22 Villadangos del Páramo to Astorga | 27.2 km | 607 | 200 | 91 | 105 | 2 closed, 2 unnamed |
| 29 Sarria to Portomarín | 22.1 km | 1044 | 376 | 204 | 154 | 15 closed, 3 unnamed |

The audit's own corridor (every route way in the search box) keeps 307 places for stage 1, the importer's 194: the rest lies
along the next stage and the Valcarlos variant, and linking those places to stage 1 would put the albergues of Burguete on it.

### The rules

**Which places.** A place becomes a row when it is within `audit.BUFFER_M` of the line of *this* stage (stays 1500 m, cafes and
restaurants 1000 m, churches and sites 1000 m, services 500 m). The line is the shortest way through the OSM route ways from the
stage's start town to its end town (the first and last point of the stage's `fallback_route`: the catalog's coordinates). Route
pieces that stop up to 50 m short of each other are joined. The importer refuses, and writes nothing, when the route came from
the hand-drawn fallback, when a town is more than 1.5 km from every route way, when the ways do not connect the two towns, or when
the line is more than twice as long as the towns are apart: a guess cannot say which places belong to a stage.

**Closed and unnamed.** A place is skipped as closed when `closed_signal_keys` says so (`disused:amenity=cafe`,
`abandoned:tourism=hostel`, `was:shop=bakery`, `disused=yes` ...), when `opening_hours` is `closed` or `off` (the audit calls that
CLOSED_SIGNAL too), or, with `--audit`, when the audit has a CLOSED_SIGNAL finding for it (for example Overture says closed). An
old `disused:phone` or a bar that became a supermarket is not a closure. Stays and food places without a `name` are skipped
(`name` is NOT NULL and an unnamed albergue cannot be told from another). Unnamed pois get a neutral name from their category
("Drinking water", "Wayside cross", "Viewpoint"...) and `tags: {"name_default": true}`, so the app can show its own translation.

**Columns.** Only what OSM says, cleaned but not rewritten:

| Column | From |
|---|---|
| `stays.category`, `pois.category` | `normalize.from_osm` (the tests prove every category is accepted by the CHECK lists in the migrations) |
| `name` | the `name` tag (non-breaking hyphens and invisible characters removed) |
| `address` | `addr:street` (or `addr:place`), `addr:housenumber` (before the street for French streets), `addr:postcode`, `addr:city`; `addr:full` only when none of those exists |
| `country_code` | `addr:country`, when it is two letters |
| `location` | `'SRID=4326;POINT(lon lat)'`; the centre of an outline for ways and relations |
| `phone` | the first usable number of `phone`, `contact:phone`, `mobile`, `contact:mobile` (several numbers in one tag are separated by `;`; "3631" is not a number) |
| `email`, `whatsapp` | `email` / `contact:email`; `contact:whatsapp` |
| `website` | `website`, `contact:website`, `url`: http or https only (a bare domain gets `https://`); anything else is dropped because the app opens it |
| `beds` | `beds` as a whole number; `capacity` only for albergues and hostels (for a hotel or a camp site it can mean rooms or pitches) |
| `opening_hours` | as written, in OSM syntax (`Mar-Oct: 13:00-22:00`) |
| `pois.wikidata_id` | `wikidata`, when it is `Q` and digits |
| `stays.route_id` | the route of the stage file |
| `source`, `verification_level` | always `osm` and `unverified`: an import never proposes a higher level |
| `data_confidence` | the audit score of the place when `--audit` gives one, else null |

`km_from_stage_start` is the distance along the line from its start, in km with two decimals; `detour_m` is the distance from the
line in metres. A place before the start of the line gets km 0, one beyond the end gets the length of the line, each with its distance to that
end (in stage 1, 41 of the 81 stays are in or beside Saint-Jean-Pied-de-Port, before the point where the OSM route way begins,
so they all have km 0).

### Writing to the database

`--apply` reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the environment before it does anything slow. They are never
printed, never written to a file and never put into an error: messages carry the HTTP status and the database's own error, never
the address or the key (an address that is not `https://` is refused unless it is localhost). In order:

1. **Read first.** The stage row (it must exist for this route and number), the route row (the stays point at it, so a missing
   route stops everything before any write), and which of these places already exist. Nothing is written when a read fails.
2. **Places**, `stays` then `pois`: `POST /rest/v1/<table>?on_conflict=osm_type,osm_id` with `Prefer: resolution=merge-duplicates`,
   batches of 500, the ids read from the answer. A busy server (429, 5xx, no answer) is tried up to three times, a 4xx is not.
3. **Links**, `stage_stays` then `stage_pois`, with those ids: `on_conflict=stage_id,stay_id` (or `poi_id`).
4. **Read back.** Every place is there and the number of link rows the database holds for the stage equals the number written.

An upsert overwrites every column it sends and leaves the others alone, so what is sent depends on what is already there:

| Row in the database | What `--apply` does |
|---|---|
| none | inserts the whole row, including `source`, `route_id`, `data_confidence` and `verification_level` |
| from OSM, unverified or `data_check`, not claimed | refreshes the OSM columns only (name, category, address, location, contact, beds, hours; a phone that is gone from OSM is removed), and leaves `source`, `route_id`, `data_confidence` and `verification_level` as they are |
| verified by an owner, a pilgrim or an editor (`verification_level` or `verified_at`), claimed by a business (`business_id`, `owner_verified_at`: the owner edits the phone, the hours and the beds there) or owned by another `source` | not sent at all; the place is still linked to the stage |
| deleted (`deleted_at`) | left deleted and not linked |

So a re-run never lowers a trust level, never overwrites what an owner entered and never brings a deleted place back.

**A stage that is missing in the database.** Its link rows are refused, the message names the stage and how many rows were held
back, and the run exits 1. The places themselves are still written (they do not need a stage); add the stage row (it can stay
unpublished) and run again. The seed data has the stages 1 to 3 only, and when this was written the live database had 3 of the 33
Camino Francés stages.

**Cost of a re-run.** The database's touch trigger bumps `updated_at` on every update, so every row a second run writes is one
more change for the apps' sync, although nothing in it differs. Apply when OSM data changed, not on a timer.

**Never deleted.** The importer only adds and refreshes. A place that closes in OSM later is skipped on the next run, but its old
row (and its link) stays until someone removes it.

### The workflow

[`osm-import.yml`](../../.github/workflows/osm-import.yml) is started by hand (Actions > osm-import > Run workflow) with `stages`
(digits, commas and dashes only: `1-3`, `1,5,9`) and `apply` (false by default).

* Job **import** (no secret anywhere) runs the unit tests, then the importer for the stages one at a time with pauses (30 s
  between stages, 15 s between the two requests of a stage), writes one summary per stage to the run page, and attaches the files
  as the artifact `osm-import-files`. A stage that fails does not stop the others; the job is red at the end and names it.
  Allow 2 to 5 minutes per stage.
* Job **apply** runs only when `apply` is true and the import job is green, in the GitHub Environment **`osm-import`**. It
  downloads that artifact (the files that were attached for review) and sends them with `--from-ndjson --apply`. The two secrets
  are set on that one step, not on `pip install` or the download.

One-time setup, by the repository owner: Settings > Environments > New environment `osm-import`; add the secrets `SUPABASE_URL`
and `SUPABASE_SERVICE_ROLE_KEY` there (repository secrets are not read); add required reviewers, so that the apply job waits until
somebody has looked at the summary and the files. The workflow does not run the audit, so `data_confidence` stays null there; run
`audit.py` and the importer by hand with `--audit` to fill it for new rows.

### The database side

The upsert needs a **full** unique key on `(osm_type, osm_id)`: PostgREST cannot send the `WHERE` of a partial index, and
Postgres answers 42P10 without a matching key. Both tables already have one, as the table-level `unique (osm_type, osm_id)` of the
first migrations, so
[`20261110000000_osm_import_keys.sql`](../../supabase/migrations/20261110000000_osm_import_keys.sql) changes nothing on a database
built from the migrations (it says so in a NOTICE) and adds the key to one that was built or edited by hand. Rows without an OSM
key (editorial, partner, user, owner) may repeat. [`osm_import_smoke.sql`](../../supabase/dev/osm_import_smoke.sql) proves it on a
real Postgres with PostGIS, with the importer's own rows: EWKT text goes into the geography columns, the upsert statement works,
every category is accepted, a refresh leaves the trust columns alone. `supabase/dev/validate.sh` runs it.

### Data from OpenStreetMap: attribution and ODbL

The data is (c) OpenStreetMap contributors, available under the [ODbL](https://opendatacommons.org/licenses/odbl/1-0/). The rows
of `stays`, `pois` and their stage links that come from this importer are a **derived database**: show "Data (c) OpenStreetMap
contributors" with a link to https://www.openstreetmap.org/copyright wherever they are shown, and be ready to publish an export of
them under the ODbL (share-alike) when the database, or a substantial part of it, is made available. Every imported row keeps
`osm_type` and `osm_id` and `source = 'osm'`, which is what makes "the OSM-derived part" easy to select. The importer never copies
who edited a place in OSM (the `user`, `uid` and `changeset` of an element). This is a description, not legal advice.

### What it does not do

* **Prices, ratings, reviews: never.** OSM has none (`price_*`, `rating_*`, `review_count` are not written, nothing is invented).
* **Photos.** `image` and `wikimedia_commons` are not turned into `image_url`: their licence is not checked yet (the audit checks
  Commons licences; the importer waits for that). No `description`, `story`, `cover_url`, `amenities`, `labels`, `mass_times`
  or `place_id` either.
* **Opening hours of most places.** Few places have `opening_hours` in OSM and the rest stay null. Seasons, beds and phone numbers
  are as complete as the mappers made them (stage 1, stays and food places together: address 75%, phone 77%, email 43%, website
  43%, beds 30%, hours 26%).
* **Verification.** Every row is `unverified`; `data_confidence` is only a copy of the audit score, and only when a row is created.
* **Deleting.** Nothing is ever removed or hidden (see above), and a place that moved is a new row only if OSM gave it a new id.
* **Variants.** A place along a variant (the Valcarlos route) is not linked to the main stage; a variant needs its own stage row.

## Route lines for the Maps tab (build_route_lines.py)

The line the Maps tab draws for a stage is the line the importer measures that stage's places against: the OSM route ways of the
stage's search box (`audit.load_route`: the walking-route relations whose name matches the stage file's regex), joined into one
ordered line from the start town to the end town (`route.build_stage_line`: the shortest way through those ways). `build_route_lines.py`
runs exactly that, thins the line, and writes the files the app bundles, so the red pin, the stays and the line agree.

```
 stage file ─► audit.load_route (the importer's Overpass request and cache) ─► route.build_stage_line: ONE ordered line
        ─► Douglas-Peucker, 5 m: first and last point kept, every kept point is an OSM node, nothing moved or rounded
        ─► the end of stage N and the start of stage N+1 made one point
        ─► mobile/assets/map/lines/camino-frances-NN.json (a GeoJSON LineString, [lng, lat]) + manifest.json
```

```bash
cd tools/poi-audit
python build_route_lines.py                                   # stages 1-3 into mobile/assets/map/lines
python build_route_lines.py --stages 1-3 --offline            # replay the Overpass answers in cache/ (the importer's cache)
python build_route_lines.py --overpass https://overpass.openstreetmap.fr/api/interpreter   # ask one server instead of the three mirrors
python build_route_lines.py --verify                          # only check the bundled files against their manifest
python -m unittest discover -s tests                          # offline tests, among them test_route_lines.py
```

**What comes out.** One file a stage on a single line (a GeoJSON `LineString`, 5 to 7 kB for the first three stages, where the
unthinned lines are 25 to 30 kB) and `manifest.json`: the date of the OSM data (`timestamp_osm_base` of the Overpass answer: no clock is
written, so the same answers give the same bytes), per stage the relations the line runs along (id, name, share of the line), points and
bytes before and after thinning, length before and after, how far the first and last point are from the two towns, the gaps between
OSM ways that were closed, and the sha256 of the file, and the joins between stages. `generator_version` is raised whenever the same OSM
answer would give other files; a test (`BundledFiles`) and the app's `routeLines.test.ts` fail when a bundled file is not what the
manifest says, so a line cannot be edited by hand or the generator changed without the files being made again.

**The rules.** An end of the line more than 200 m from its town, a gap of more than 200 m between the end of a stage and the start of the
next, a thinning that changes the length by more than 3 percent, an Overpass answer with a runtime-error remark, and no OSM route at all
are errors (exit code 1): the hand-drawn fallback line the audit would fall back to is never written. A gap of up to 50 m between two
stages is closed (the end of the stage before is put in front of the next stage, so every OSM point stays); one between 50 and 200 m is
left and reported as not closed. The first three stages meet exactly (0 m), because the importer snaps the town two stages share to the same OSM node.
The OSM data the mirror reachable from a sandbox serves can be old (the tool warns above 60 days): another mirror may be fresher.

**Attribution.** The files are a derived database of OpenStreetMap: data © OpenStreetMap contributors, [ODbL](https://opendatacommons.org/licenses/odbl/1-0/).
The manifest says so, the app's Licences screen lists OpenStreetMap for "routes" and the route sheet of the Maps tab names OpenStreetMap
and carries the credit. See [Data from OpenStreetMap: attribution and ODbL](#data-from-openstreetmap-attribution-and-odbl).

## Pilot result (stage 1, CI run 42194220473, 2026-11-06)

Sample output in [`samples/camino-frances-01/`](samples/camino-frances-01/report.md), AI steps off
(no API key yet). The sample files come from this first run and were converted to the aggregated format
(one row per place and check, with a `count` column); the numbers below count findings the way the first run did. Route taken from the OSM relations; 448 places in the corridor
(OSM 308, Overture 223, Wikidata 57 records).

- 127 stays, 98 cafes/bars/restaurants, 21 churches and chapels, 117 sites, 85 services.
- 6 closed signals (for example Overture says *Ultreïa* in Saint-Jean is permanently closed while OSM still has it),
  8 likely duplicates, 8 coordinate disagreements, 93 places only in Overture, 27 stale stays/cafes.
- 39 linked Commons photos, all with usable licences and taken near the place.
- Most stays score low because OSM lacks beds, season and price: exactly the fields owners and pilgrims fill best.
- Noise to tune: some Wikidata mountain passes and razed redoubts land in "sites"; `NO_PHOTO` is chatty.
