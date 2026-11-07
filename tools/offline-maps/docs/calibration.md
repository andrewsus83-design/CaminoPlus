# Calibrating a stage: from the first real build to the gates

A new stage file starts in **measure mode**: no `quality` band, and `render_checks` views whose `min_features` and
`min_labels` are empty. A stage like that builds and renders in CI, but it cannot be published (a stage without a
`quality` band never is, see "Quality gates" in the [README](../README.md#quality-gates)). This page is the procedure
that turns it into a gated stage, and the reasons for the numbers.

The rule: **floors and bands come from a real build, with margin, and a broken build never becomes the baseline.**
`scripts/calibrate_stage.mjs` does the arithmetic and the refusing, so nobody types a number in from a guess.

## The stage-1 lesson

The floors in stage 1's `render_checks` were guesses made before any real build: the first real CI render counted 12
building features in Saint-Jean z15 where 30 were expected and 4 in Roncesvalles where 5 were expected, on a healthy pack,
so CI failed. They are now 6 and 2, and every floor since comes from a real build through this tool.

## Procedure

1. **Measure.** Run CI on the stage while it is in measure mode: a pull request that touches the stage file, or Actions,
   offline-maps, Run workflow, without "publish". CI builds the default pack (3 km corridor, z15), checks it, and renders it
   twice, once with the outside network blocked and once with the device offline. With empty floors the render step fails
   only for real defects (an error, a request that left the device, nothing drawn).
2. **Download the reports.** CI uploads JSON only, never the pack, as the artifact `offline-pack-reports-<slug>`. It
   expires after a few days, so calibrate soon or re-run CI.
   ```bash
   cd tools/offline-maps
   gh run download <run-id> --name offline-pack-reports-camino-frances-02 --dir dist
   ls dist dist/render     # camino-frances-02-3km-z15.json   render/camino-frances-02-3km-z15.report.json
   ```
   Use the default pack, `<slug>-3km-z15`. The other corridor widths and zooms of a pull request run have a manifest but no
   render report.
3. **Calibrate**, first as a dry run, per stage:
   ```bash
   node scripts/calibrate_stage.mjs stages/camino-frances-02.json \
     --manifest dist/camino-frances-02-3km-z15.json \
     --report dist/render/camino-frances-02-3km-z15.report.json --dry-run
   ```
   Read the table: every number is printed next to the value it came from. Check that no line says `NOT calibrated` and that
   the `warning:` lines make sense (for example a standard layer the pack lacks). Then run it again without `--dry-run`.
4. **Commit.** `git diff stages/<slug>.json` shows only the `quality` block and the floors; every other byte of the file is
   as it was. The tool puts `quality` right after `maxzoom`, exactly where `scripts/make_stages.py` writes it, so
   `python3 scripts/make_stages.py --check` passes on the raw output (a test compares the patcher's output with the committed
   stage 7 byte for byte). Commit it.
5. **CI must be green.** The pull request run now enforces the numbers it just produced (band, floors, empty error lists).
   Only a green run on the committed stage file means the stage is calibrated, and only then can it be published.

Running the tool twice changes nothing, so a repeated or interrupted step is safe.

## What it writes

| Where | Rule | Stage 1 (real numbers) |
|---|---|---|
| `quality.min_size_mb`, `max_size_mb` | 0.6x and 1.6x of the pack size, rounded outward to 0.1 MB | 4.58 MB gives 2.7 and 7.4 |
| `quality.min_tiles`, `max_tiles` | 0.6x and 1.6x of the addressed tiles, rounded outward to 10 | 1,536 gives 920 and 2,460 |
| `quality.required_layers` | the standard layers (building, place, poi, transportation, transportation_name) that the pack really has; a layer the pack lacks is never required | all five |
| `quality.max_change_ratio`, `max_osm_age_days` | policy, not measurement: 1.5 and 45 | 1.5 and 45 |
| `min_features` of a view | floor(0.4 x measured) for poi, transportation, building, mountain_peak; only when measured is 5 or more | Saint-Jean z15: poi 570 gives 228, transportation 322 gives 128, building 12 gives 4. Roncesvalles z15: building 4 gives no floor |
| `min_labels` of a view | 1 for the style layers `place` and `peak` when the view drew at least one | place 10 gives 1 |

A view in the report is matched to a `render_checks` entry by **name and coordinates**. A view that was renamed or moved
since the run is not calibrated (its numbers describe another place) and the tool says so. The tool never adds or removes
views, and it never touches `render_allow_errors`.

## Why 40 percent, and why 0.6x to 1.6x

A floor is a smoke alarm, not a measurement. It proves a layer is drawn at that place and fails a build that lost most of
its data; it is not a claim about how many buildings OpenStreetMap has there. The counts come from MapLibre's
`queryRenderedFeatures` in a software-rendered headless browser, so they move with the monthly OSM data, with the Planetiler
version, and a little with label placement.

- **40 percent of the measurement.** A floor at or near the measurement fails a healthy build as soon as the data moves a
  little; stage 1's guesses were even above it (30 against 12). A floor far below it lets a pack that lost most of its data
  pass. At 40 percent a healthy build has 2.5x of room, and a build that kept less than 40 percent of what the baseline
  rendered still fails.
- **Only counts of 5 or more.** 40 percent of 4 is 1.6, of 3 is 1.2: a floor of 1 on such a count cannot tell a healthy
  build from a broken one (the difference is one building) and can fail a healthy one. A layer that small just has no
  floor in that view. Roncesvalles has 4 buildings; that is fine.
- **Labels: 1.** What the check has to prove is that text is drawn at all, because a missing glyph range ships a map with no
  names. The exact count depends on label collision, so no more is asked.
- **The lower of the two render phases.** Floors are enforced with the network blocked and with the device offline, so the
  tool uses the lower number of the two. If they differ, it says so.
- **0.6x to 1.6x for size and tiles.** Corridor width barely changes a pack (stage 1: 4.54, 4.59 and 4.67 MB for 2, 3 and
  5 km), but zoom does: z14 is 2.60 MB, 0.57x of z15, so an accidental z14 build falls under the minimum. Growth of OSM data
  is slow, and the change against the pack that is live is checked separately at publish time (`max_change_ratio`, 1.5x). The
  band only answers "is this still the same kind of pack". It is rounded outward so the build it came from always passes.

These factors are judgement, not statistics: there is one real stage so far. When several stages have a few monthly
rebuilds, look at how much the real numbers move and change the factors in `scripts/lib/calibrate.mjs` (the tests pin them).

## When a build is refused

The tool exits 1 and changes nothing when the build must not be a baseline. There is deliberately no flag to override it:
fix the cause, rebuild, and calibrate from the new run.

| The message says | What it means, what to do |
|---|---|
| `route_source is 'fallback', not 'osm'` | The OSM extract had too little of the route, so the hand-drawn route was used and the corridor may be in the wrong place. Fix the route (the OSM relation, `route_name_regex`, `search_bbox`, see the `route_from_osm.py` log) and rebuild. |
| `the render report says ok: false`, `console, page or map error(s)`, `request(s) tried to leave the device`, `request(s) failed` | A real defect: a missing glyph range, a request to the internet, a console error. The message quotes the first one. Fix it and re-run CI. Add `render_allow_errors` only for a message a real run proves harmless (README). |
| `no usable size_bytes`, `no usable tile count` | The pack is empty, or the manifest came from an old `build_stage.sh`. Look at the Planetiler log and the corridor. |
| `view "<name>" rendered 0 features` | The view is over an empty part of the pack or outside it (the route and corridor lines drawn on top do not count). Fix its `at` in the stage file (it must lie inside the corridor) and re-run CI. |
| `the pack stops at zN but zM was requested` | Planetiler ended early. Read the build log. |
| `the render report is for <pack>`, `saw a pack of N bytes`, `saw N tiles` | The manifest and the report are from different builds. Download both from the same run. |

Two more refusals come before these, with their own message: the manifest is of another stage (`slug` differs), or the stage
file changed after the build (`stage_id` differs).

## When the stage file already has numbers

By default the tool **fills only what is empty** and keeps every number that is there, printing both next to each other.
It never lowers or replaces anything silently.

- **A kept number contradicts the build** (a floor above what the view rendered, or a band that does not hold the pack): CI would
  fail on it, so the tool prints `CONFLICT`, writes nothing and exits 1. This is stage 1's mistake caught before it reaches CI.
- **`--recalibrate`** replaces the numbers the tool derives (the band's measured keys, the floors for poi, transportation,
  building, mountain_peak, place, peak). It prints `old -> new` for every change and marks each floor that goes down with
  `LOWERED`. Floors for other layers and the policy keys of the band stay. Use it after a Planetiler upgrade or a deliberate
  change of corridor or zoom, after you have looked at why the numbers moved. It does not bless a broken build: the
  refusals above still apply.
- **`--force-keep-existing`** keeps a contradicted number anyway and exits 0, still filling what is empty. It is for the rare
  case where you know why this build differs and will fix the build.
- **A floor in the file is too high for a healthy pack** (what happened to stage 1): the CI report is `ok: false` because of
  the floors, so the tool refuses it, and it must, because a broken build fails the same way. If the pack is healthy (its
  size and tiles match the last good build, the failure lines are only floors), set the `min_features` and `min_labels` of the
  failing views to `{}` in a branch (the whole object: one that still holds a floor counts as "has floors" and is kept), let
  CI produce a clean report, then calibrate.

## Reference

```
node scripts/calibrate_stage.mjs <stage.json> --manifest <dist/pack.json> --report <dist/render/pack.report.json>
                                 [--dry-run] [--recalibrate | --force-keep-existing]
```

Exit codes: 0 done (or nothing to change), 1 refused, contradicted or unreadable input, 2 wrong usage.
Code: `scripts/lib/calibrate.mjs` (pure functions `proposeQuality`, `proposeFloors`, `refuseReason`). Tests:
`test/calibrate.test.mjs` (`npm test`), including a golden test with the real stage-1 numbers.
