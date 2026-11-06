# Offline packs in CI: one matrix job per stage

[`offline-maps.yml`](../../../.github/workflows/offline-maps.yml) builds, tests and publishes any number of
stages. A small `plan` job decides which stages to run, then the `build` or `publish` job runs one job per
stage, a few at a time. This page says how the jobs fit together, what a run costs, how to run every stage
by hand, how we stay gentle with Geofabrik, and what a red job means.

```
 pull_request ──┐
 manual run ────┼─►  plan  ──►  matrix: [{stage, slug, pack}, ...]  ──►  build     6 at a time   no secrets
 monthly cron ──┘    │                                             └─►  publish   2 at a time   secrets, pack-publish
                     └─ scripts/list_stages.mjs
```

## What runs when

| Trigger | Plan mode | Stages planned | Runs |
|---|---|---|---|
| pull request touching `tools/offline-maps/**`, the workflow or its action | `pr` | the stage files the PR changed, plus stage 1 (the canary) if the PR touched the build tooling; at most 12 | `build` |
| manual run, `publish` off | `all` | the `stages` input: `all` or slugs | `build` |
| manual run, `publish` on | `publish` | the `stages` input (default `all`), only stages with a `quality` band | `publish` |
| monthly, 03:17 UTC on the 2nd | `publish` | every stage with a `quality` band | `publish` |

`build` never uploads a pack and never sees a secret. `publish` is the only job with secrets, runs in the
GitHub Environment `pack-publish`, and publishes only calibrated stages: a stage without a `quality` key can
never be published, so the planner never lists it (and `check_pack.mjs` / `publish_pack.mjs` would refuse it
anyway).

## The plan job

[`scripts/list_stages.mjs`](../scripts/list_stages.mjs) prints one line of JSON and nothing else on stdout:

```
{"include":[{"stage":"stages/camino-frances-01.json","slug":"camino-frances-01","pack":"camino-frances-01-3km-z15"}],"count":1}
```

sorted by stage number, then slug. The plan job passes the `include` list on as the matrix and `count` as a
separate output. Notes for people (a cap that cut the list, a stage left out of a publish) go to stderr and
show up as warnings on the run.

Rules of the `pr` mode, in the order they matter:

1. Only `tools/offline-maps/stages/<slug>.json` counts as a stage file. The `.route.geojson` next to it and
   everything under `catalog/` do not. A PR that only edits those builds nothing; touch the stage file or run
   the workflow by hand for that stage.
2. The canary `camino-frances-01` is added when any other file under `tools/offline-maps/` (outside `stages/`
   and `catalog/`), the workflow, or `.github/actions/build-offline-pack/` changed. That includes docs and
   tests: the canary is the cheap proof that the tooling still builds a pack.
3. At most `PR_STAGE_CAP` stages (40, set at the top of the workflow: enough for every stage of one route).
   The canary always stays in, the rest are taken in stage order, and the run warns which stages were not built.

Every stage file is checked, whichever mode runs, because its values end up in file names, an artifact name
and the cache key: `slug` equals the file name, `stage_number` is a whole number, `buffer_km` and `maxzoom` are
plain numbers (the pack is `<slug>-<buffer_km>km-z<maxzoom>`, and `3.0` would not match the file that
`build_stage.sh` writes, so write `3`), and `osm_extracts` lists at least one URL. One broken file fails the
plan with every problem listed, before any runner spends minutes on it.

Empty plans:

- `build`: nothing to build (for example a catalog-only PR). The job is skipped and the run is green.
- `publish`: the plan job fails on purpose. A monthly run that quietly publishes nothing would be a bug, and a
  manual publish of a stage without a `quality` band should say so.

Try it locally (no network, no Docker):

```bash
cd tools/offline-maps
node scripts/list_stages.mjs --mode all
node scripts/list_stages.mjs --mode publish --only camino-frances-01
git diff --name-only origin/main...HEAD > /tmp/changed.txt
node scripts/list_stages.mjs --mode pr --changed-file /tmp/changed.txt
```

`--stages-dir <folder>` reads stage files from another folder (tests and dry runs); the printed paths stay
`stages/<file>`. The tests are in [`test/list_stages.test.mjs`](../test/list_stages.test.mjs) and also guard the
workflow's safety rules (JSON-only artifacts, secrets only in the publish job, `max-parallel`).

## Build jobs

Each job gets `STAGE`, `SLUG` and `PACK` from its matrix entry and runs the composite action
[`build-offline-pack`](../../../.github/actions/build-offline-pack/action.yml): install tools, restore the
caches, build the pack (corridor width and zoom come from the stage file), quality gates, the offline render
test, and a render summary. Stage 1 alone gets two more steps: `Size report` (a table of every pack built in the
job) and, on pull requests, `Measure other corridor widths and zooms` (five more builds of stage 1). The sizes in
the README come from there.

A stage without a `quality` band is still built and rendered. The quality gates only warn for it, and the
warning is the reminder to calibrate it (see the header of [`quality.mjs`](../scripts/lib/quality.mjs)).

Reports are uploaded as `offline-pack-reports-<slug>` (manifest and render report, JSON only, 3 days). Never
upload `.pmtiles` files: the repository is public, so an artifact is downloadable by anyone and would bypass the
paywall. The pack stays on the runner.

## Publish jobs

Same build, with `route-fallback: deny` and `publishing: 'true'` (route must come from OSM, OSM data must be
fresh, size and tile count inside the band and close to the live pack), then `publish_pack.mjs` uploads and
registers the pack in one database transaction. Without the Supabase secrets the step runs the quality gates
as a dry run and uploads nothing.

Two at a time, and each stage on its own: one red stage does not stop the others, and a red stage keeps its
previous pack as the current one. Concurrent runs queue per stage (`offline-maps-publish-<slug>`).

Each job is its own deployment to `pack-publish`. If the owner adds required reviewers there, GitHub will ask
for approval for the jobs as they start, which can mean many approvals for a full run. A wait timer plus a
deployment branch rule (only the default branch may deploy, so a manual publish cannot run code from a feature
branch) gates just as well without the clicks. This was not tested (the workflow cannot run outside GitHub), so
check it on the first full publish.

## Cost and the cap

A stage takes 5 to 10 minutes of runner time, plus the download of Geofabrik extracts (Aquitaine about 290 MB,
Navarra 60 MB, Castilla y León 340 MB, Galicia 270 MB, and so on) and the Planetiler sources (about 1.2 GB,
cached). The table is derived from that 5 to 10 minutes per stage; setup and queueing come on top, and nothing
here has been measured on the matrix yet.

| Run | Jobs | Runner time | Wall clock |
|---|---|---|---|
| PR changing one stage | 1 | 5 to 10 min | 5 to 10 min |
| PR touching the tooling only | 1: the canary, which builds 6 packs (see above), so longer than the others | longer | longer |
| PR changing 33 stages | 33, six at a time (the cap is 40) | 3 to 5.5 h | 30 to 60 min |
| manual `stages=all`, 33 stages | 33, six at a time | 3 to 5.5 h | 30 to 60 min |
| monthly publish, 33 stages | 33, two at a time | 3 to 5.5 h | 1.5 to 3 h |

The caps live in two places: `PR_STAGE_CAP` and the `max-parallel` of each job in the workflow. Lower them if
runs queue behind other work, raise them with care (see the Geofabrik section).

## Running every stage by hand

The cap only limits pull requests (40 stages). To build everything by hand, for example after a change to the
build tooling, or when a pull request changed more stage files than the cap:

- GitHub: **Actions → offline-maps → Run workflow**, pick the branch, leave `publish` off, `stages` = `all`
  (or slugs separated by commas, no spaces: `camino-frances-07,camino-frances-08`).
- Command line:

```bash
gh workflow run offline-maps.yml --ref my-branch -f stages=all
gh workflow run offline-maps.yml --ref my-branch -f stages=camino-frances-07,camino-frances-08
gh workflow run offline-maps.yml --ref main -f publish=true -f stages=all    # calibrated stages only
```

A typo in a slug fails the plan job at once and names the unknown slug. Do not start `stages=all` twice in a
row: the second run starts over (a newer run on the same branch cancels the older run's build jobs).

## Being gentle with Geofabrik

Geofabrik asks its users to be gentle, and 33 jobs would otherwise download the same extracts 33 times. What
we do:

- **Cache the extracts.** `build_stage.sh` keeps them in `data/osm` and skips files that exist. The action
  caches that folder under `osm-extracts-v1-<hash of the stage's extract URLs>-<ISO year-week>`. Stages with the
  same extract list share an entry, so an extract is downloaded about once a week per cache scope, not once
  per stage, and the data is never older than the week (publishing also refuses OSM data older than the stage's
  `max_osm_age_days`).
- **No `restore-keys` on purpose.** A fallback to an older week would restore an old extract, `build_stage.sh`
  would reuse it, and the cache would save it again under this week's key: the data would never refresh.
- **Six at a time** (`max-parallel: 6`) for builds, two for publishing.
- **Retries are bounded**: curl retries a failed download three times, ten seconds apart, and stops.

What this does not do:

- Stages whose extract lists differ (for example Navarra alone, and Aquitaine plus Navarra) each download their
  own copy.
- A cache entry is written when a job ends green, so the first wave of up to six jobs on a cold cache can
  download the same extract at the same time, and a red job's re-run downloads again. If that matters, run one
  stage per region first (`stages=` a short list), wait for green, then run `all`.
- The Planetiler sources are cached under `planetiler-sources-v2`, but GitHub drops cache entries nobody used for
  7 days, so the first run after a quiet week downloads them again in every job of its first wave.
- If you need a different shape (one job that downloads once and hands the files on), that is a bigger change
  than the matrix.

## What a red job means

One red leg never hides the others (`fail-fast: false`). Re-run only the failed jobs from the run page.

| Red job | Step | Usually means | Look at |
|---|---|---|---|
| `plan` | Plan the stages | A stage file is broken, the `stages` input has a bad slug or characters, or (publish) no selected stage has a `quality` band | The error lists each problem with its file |
| `build <slug>` | Install tools | Runner, apt or registry hiccup | Re-run |
| | Build the pack | A download failed (re-run; if it repeats, check the URL in the stage file), the OSM route is too short for `route_from_osm.py`, or Planetiler failed | The step log; `build_stage.sh` header for exit codes |
| | Quality gates | The pack is outside the band of its stage file (size, tiles, layers). Either the build lost data or the band needs recalibrating | `check_pack.mjs` message and the manifest in `offline-pack-reports-<slug>` |
| | Render test | A view is below its floor, a console or map error, or a request tried to leave the device | `dist/render/<pack>.report.json` in the artifact (screenshots stay on the runner, like the pack) |
| `publish <slug>` | Build steps | Same as above, with stricter gates: the route must come from OSM and the OSM data must be fresh | The same logs |
| | Publish | Size or tile count jumped against the live pack, Storage upload or read-back failed, or `register_offline_pack` is missing | `publish_pack.mjs` output; nothing was registered |

Warnings, not failures: `list_stages: pr: capped at 40 ...` means the PR changed more stages than it built, and
`publish: N stage(s) have no quality band ...` lists the stages waiting for calibration.

Skipped `build` or `publish` jobs mean the plan found nothing to run.

## Changing the knobs

- `PR_STAGE_CAP`, and `max-parallel` in `build` and `publish`: top of the workflow and the job's `strategy`.
- The extract cache key (`osm-extracts-v1-...`): bump the `v1` in the action to throw all entries away.
- The canary: `CANARY` in `list_stages.mjs`, and the two `matrix.slug == 'camino-frances-01'` conditions in the
  workflow.
- GitHub allows at most 256 jobs in one matrix; a plan that large would need splitting.
