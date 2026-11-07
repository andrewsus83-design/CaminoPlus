# Catalog of stages

The catalog is the human-checked list of walking stages: where each one starts, passes and ends, and
which OpenStreetMap extracts cover it. [`scripts/make_stages.py`](../scripts/make_stages.py) turns it
into the stage files in [`stages/`](../stages) that [`build_stage.sh`](../scripts/build_stage.sh) builds
into one offline pack per stage. Edit the catalog, never the generated fields of a stage file.

```
catalog/<route>/route.json        settings shared by every stage of the route
catalog/<route>/<NN>.json         one stage, NN = two digits (07.json is stage 7)
scripts/geofabrik_extracts.json   allowlist: extract id -> Geofabrik download URL
stages/<route_slug>-<NN>.json             generated (calibration keys excepted, see below)
stages/<route_slug>-<NN>.route.geojson    generated: straight lines through from, via..., to
```

Every stage also needs a row in `public.stages` before its pack can be published (`publish_pack.mjs` refuses
without one) or its places imported. The Camino Francés has them: stages 1 to 3 in `supabase/seed.sql`, stages 4 to 33
in the migration `20261112000000_camino_frances_stages.sql`, which copies the ids, numbers and names from this catalog,
leaves the stages hidden and has no distance (the catalog has none). `test/test_stage_rows.py` fails when a stage file
has no row or a name differs. A new route adds its rows the same way, in a migration of its own.

Stage 1 of the Camino Francés is hand-written and not managed by the generator; it needs no catalog entry.
If `catalog/camino-frances/01.json` exists, it is checked (stage 2 must start where it ends) but nothing is
written for it.

## Stage entry

```json
{
  "n": 7,
  "name": "Los Arcos to Logroño",
  "from": {"name": "Los Arcos", "lat": 42.5683, "lng": -2.1893, "source": "nominatim node/<id> place=village"},
  "to": {"name": "Logroño", "lat": 42.4668, "lng": -2.4456, "source": "unverified"},
  "via": [{"name": "Viana", "lat": 42.5156, "lng": -2.3705, "source": "nominatim node/<id> place=town"}],
  "extracts": ["navarra", "la-rioja"],
  "coastal": false,
  "distance_km": null,
  "distance_source": null,
  "notes": "free text for the next person"
}
```

This only shows the shape. The coordinates are illustrative and the `<id>` stand for real OSM ids; copy none of it.

| Key | Rule |
|---|---|
| `n` | Whole number, equal to the file name. |
| `name` | Text, "<from town> to <to town>". |
| `from`, `to` | A point (below). `from` is within 1.5 km of the previous stage's `to` when both are in the catalog. |
| `via` | 0 to 6 points in walking order. See "Choosing via points". Optional, `[]` when none. |
| `extracts` | One or more ids from `scripts/geofabrik_extracts.json`, every region the stage touches. Each id once. A region that is not in the allowlist is added to it (same pull request); only `https://download.geofabrik.de/` `.osm.pbf` URLs are accepted. The build merges them with [`scripts/merge_extracts.sh`](../scripts/merge_extracts.sh), also when the regions are in two countries (Portugal and Galicia); an object that is in both with two versions keeps the newer one. |
| `coastal` | `true` when the stage reaches the sea (the build then refuses to use a placeholder for the ocean polygons). |
| `distance_km` | A number only together with a cited `distance_source`; otherwise `null`. Above 0 and at most 80. |
| `distance_source` | Where the number comes from; `null` when `distance_km` is `null`. |
| `notes` | Free text. Optional. |

A **point** has exactly `name`, `lat`, `lng` (decimal degrees, WGS 84) and `source`. `source` says where the
coordinate came from, for example `nominatim node/123 place=village`, or `unverified`. Latitude and longitude must be
finite and inside Spain, France or Portugal (a rough box, so a swapped or mistyped pair fails).
Unknown keys are errors, so a misspelt `vias` cannot silently drop the via points.

A distance, a coordinate or a name that was not looked up does not belong in the catalog: use `null` or
`"unverified"`. Nothing downstream needs a distance, and an invented one is worse than none.

### Choosing via points

`route_from_osm.py` keeps only the parts of the OSM route within `clip_km` (6 km for the Camino Francés) of the straight lines
through `from`, `via...`, `to`. Add a via point wherever the real path leaves that line by more than a few
kilometres (a river crossing, a pass, a long detour into a town). The generator also refuses two neighbouring points more
than 60 km apart and a stage whose search area would be 1.2 degrees or more across.

## route.json

| Key | Meaning |
|---|---|
| `route_slug` | Equals the folder name. Stage files are `<route_slug>-<NN>`. |
| `route_index` | Whole number, 0 to 9999, unique per route. Part of the stage id: `40000000-0000-0000-<index, 4 digits>-<n, 12 digits>`, so the Camino Francés (index 0) keeps the ids seeded for stages 1 to 3. |
| `route_id` | The `routes.id` of the route (a UUID). |
| `route_name_regex` | A relation is a candidate when its label matches. Case-insensitive. The label is `name`, `name:es`, `name:fr`, `name:en` and `ref` of the relation, joined with spaces. |
| `route_exclude_regex` | Optional. A relation whose label matches is dropped even if it matches the regex above, and so are its child relations unless something else reaches them. Local `SL-` and `PR-` trails are dropped this way. |
| `clip_km` | The OSM route is kept within this distance of the straight lines through the stage's points. |
| `buffer_km` | Corridor width each side of the route (1 to 10). |
| `maxzoom` | At most 15. |
| `margin_km` | The search bbox is the stage's points widened by `clip_km + margin_km`. |

## Add a stage

1. Look the places up (Nominatim or OSM) and write `catalog/<route>/<NN>.json`. Put the real source in each `source`.
2. From `tools/offline-maps`: `npm run stages`. This validates the whole catalog first; if anything is wrong, it lists every problem and writes nothing.
3. `npm run check-stages`. This checks the stage files, including the ones you did not touch.
4. Commit the catalog entry and the two generated files. `npm run stages -- --check` is the guard to run in CI: it writes nothing and exits 1 if a generated file differs from what the catalog gives (or the catalog is invalid).

The generated stage file has no `quality` key, so it builds in **measure mode** and can never be published.

## Generation and calibration

```
catalog entry ──► npm run stages ──► stage file (measure mode: no quality, empty render floors)
                                         │ build in CI (or build_stage.sh locally)
                                         ▼
                      real size, tile count, layers, render counts
                                         │ a person reads them and sets floors
                                         ▼
          quality band + render floors + render_allow_errors in the stage file
                                         │ npm run stages (puts them in place), commit
                                         ▼
                                  can be published
```

Do not estimate: measure the first real build, then set the floors from it (see "Quality gates" in the
[README](../README.md#quality-gates); stage 1's first floors were guesses and one was wrong).

What a regenerated stage file **keeps** from the file already on disk:

- `quality`,
- `render_allow_errors`,
- `min_features` and `min_labels` of `render_checks`. The first two views are always `from` and `to`, matched by position, so a
  renamed or slightly moved town keeps its floors,
- any view after the first two (for example a peak view you added).

Everything else is rewritten from the catalog, including `name`, the bbox, the regexes and `clip_km`; a hand edit of those is lost.
Any other key in the file is dropped. If a stage file was not generated before, its calibration is kept and the script says so.

`npm run stages -- --check` compares the exact text, so after you edit calibration keys by hand, run `npm run stages`
once: it moves the keys to their place (`quality` after `maxzoom`, `render_allow_errors` after `render_checks`) without
changing a value. After you change `from`, `via` or `to` of a stage that is calibrated, build it again and re-check its floors:
they were measured on the old place.

`--check` also fails for a stage file that says it was generated from a catalog entry that no longer exists
(delete the file). A plain run only warns, because that file may hold calibration somebody wants to see.

## What the generator writes

| Key | Value |
|---|---|
| `slug`, `stage_number`, `stage_id` | `<route_slug>-<NN>`, `n`, the id formula above |
| `osm_extracts` | The allowlist URLs of `extracts`, in the catalog's order |
| `search_bbox` | `[west, south, east, north]` of from, via..., to, widened by `clip_km + margin_km`, rounded to 2 decimals |
| `fallback_route` | `<slug>.route.geojson`, a LineString through from, via..., to |
| `min_route_km` | `max(3, round(0.4 * straight-line km of that polyline, 1))`. With less OSM route than this, `route_from_osm.py` exits with code 2: the build then uses the fallback route (measurement builds) or stops (`ROUTE_FALLBACK=deny`, the publishing build) |
| `waypoints` | from, via..., to as `{name, at: [lng, lat]}` |
| `render_checks` | Two views, `from` and `to`, zoom 15, named `<town> z15`, with empty floors (measure only) |
| `generated_from` | The catalog file of the stage |
| the rest | `route_slug`, `route_id`, `coastal`, `route_name_regex`, `route_exclude_regex`, `clip_km`, `buffer_km`, `maxzoom` from the catalog |

Files are UTF-8 JSON, 2-space indent, trailing newline, always in the same key order.

## What the build does with `route_exclude_regex`, `clip_km` and `min_route_km`

[`route_from_osm.py`](../scripts/route_from_osm.py) prints the relations it kept (`relation`, and `child relation` for
those reached through a super-route) and the ones it dropped (`excluded relation`, `excluded child relation`), then how much
route `clip_km` removed:

```
route_from_osm: clip_km 6: 89.0 km of route inside the search bbox, 48.4 km of it within 6 km of the fallback route
```

Read this line in the first measurement build. A stage file without these keys (stage 1) behaves exactly as before.
