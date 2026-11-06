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
