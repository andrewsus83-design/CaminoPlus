# Place and POI audit (prototype)

Nobody on the team has walked every stage, so we need a repeatable way to tell
which albergues, cafes, churches and sites in our data are probably right, and
which ones a human should look at. This tool cross-checks four open sources
against each other, scores every place, and writes a review queue.

Pilot: **Camino Francés stage 1, Saint-Jean-Pied-de-Port to Roncesvalles**
(same stage file as `tools/offline-maps`). Any stage file works, on any route.

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

No scraping of Google, TripAdvisor, Booking or social media.

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
has no coordinates." The "Sources and licences" table above does not list this source yet.

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
