# CaminoPlus

The offline-first companion app for pilgrims walking the Camino de Santiago (iOS and Android, React Native).
Maps that work without signal, stays and cafés, a digital pilgrim passport with stamps, a journal to share, and
friends, chat and group chat. Website: [camino.plus](https://camino.plus). The app is in development.

**Plans.** The basic app is free. The paid plan is called **Pilgrim Plus**: US$12 a year, with offline route
downloads and 5 GB of cloud storage (extra storage US$5 per 5 GB a year). Use the name "Pilgrim Plus" everywhere,
never "CaminoPlus plan".

## Repository layout

| Folder | What is in it | Start here |
|---|---|---|
| `mobile/` | The app: Expo SDK 58, React Native 0.88, TypeScript (strict), Expo Router, supabase-js, MapLibre Native | [`mobile/AUTH.md`](mobile/AUTH.md) (sign-in, owner setup), [`mobile/docs/MAPS.md`](mobile/docs/MAPS.md) (maps, offline packs, GPS) |
| `supabase/` | Postgres schema with row level security, storage buckets, RPCs, seed data, edge functions (Deno): `offline-pack-url`, and more | [`supabase/README.md`](supabase/README.md) |
| `design/` | The design system: `tokens.css` and `tokens.json` are the single source of truth for colour, type, spacing; `index.html` shows the screens | open `design/index.html` |
| `web/` | The camino.plus site: plain HTML and CSS, **generated** by `tools/build_web.py` | [`web/README.md`](web/README.md) |
| `brand/` | Brand guideline, SVG logo and icon pack, the social content factory (plans, templates, QA checklist) | [`brand/README.md`](brand/README.md) |
| `books/` | The CaminoPlus Library: 20 books (8 route guidebooks and 12 reflection books on famous public-domain books), written and published with the two skills in `.claude/skills/` (`book-writer`, `book-publisher`) | [`books/series.md`](books/series.md) |
| `tools/` | `offline-maps/` builds, tests and publishes the offline map packs; `poi-audit/` cross-checks places from open data; scripts for the site, tokens, screenshots and brand SVGs | [`tools/offline-maps/README.md`](tools/offline-maps/README.md), [`tools/poi-audit/README.md`](tools/poi-audit/README.md) |
| `.github/` | CI, the two pipelines (offline maps, POI audit), Dependabot | [`.github/workflows/ci.yml`](.github/workflows/ci.yml) |

## Run it

**The app** (Node 22):

```bash
cd mobile
npm ci
npx expo start          # Expo Go works for everything except the real map (MapLibre is native code)
npm run build:dev:android   # a development build with MapLibre: see mobile/docs/MAPS.md
```

**The database** (Postgres 16 with PostGIS; no Docker needed): `supabase/dev/validate.sh` applies every migration and the
seed to a throwaway server and runs the SQL smoke tests. Hosted project: `supabase db push`, details in `supabase/README.md`.

**Edge functions**: `deno test --allow-net --allow-env --allow-run --allow-read supabase/functions`;
deploy with `supabase functions deploy <name>`.

**The website**: `python3 tools/build_web.py web` regenerates the pages and `sitemap.xml`;
`python3 tools/sync_tokens.py` copies the design tokens into `web/assets/tokens.css`;
`node tools/render_screens.mjs` (from `tools/offline-maps` after `npm ci`) re-renders the app screenshots from `design/index.html`.
Preview with any static server, for example `npx serve web`. Deploys from Vercel with Root Directory `web`.

**Offline map packs**: `cd tools/offline-maps && npm ci && npm run setup`, then see its README (needs Docker for Planetiler).

**POI audit**: `cd tools/poi-audit && pip install -r requirements.txt && python audit.py --stage ../offline-maps/stages/camino-frances-01.json --out out/stage-1`.

**The books**: `python3 tools/fetch_book_sources.py /tmp/book-sources` downloads the public-domain texts the reflection books quote; `python3 tools/check_books.py --strict --sources /tmp/book-sources` checks every book; `python3 tools/check_series.py` checks that the books are exactly the planned ones (`books/plan.json`); `python3 tools/build_books.py` builds the EPUB, PDF, cover and store metadata into `books/dist/` (and an app bundle, which is not part of the repository yet: see `books/series.md`).

**Brand SVGs**: `pip install fonttools && python3 tools/build_brand_svg.py` (`--icons-only` after a design change that only touches icons).

## Checks

CI (`.github/workflows/ci.yml`) runs these on every pull request and every push to main. Run the same locally:

| Area | Command |
|---|---|
| App | `cd mobile && npm ci && npm run typecheck && npm test && npx expo export --platform android` |
| Database | `supabase/dev/validate.sh` (set `PG_BIN=/usr/lib/postgresql/16/bin` if needed) |
| Edge functions | `deno test --allow-net --allow-env --allow-run --allow-read supabase/functions` |
| Books | `python3 tools/fetch_book_sources.py <folder>`, then `python3 tools/check_books.py --strict --sources <folder>` and `python3 tools/check_series.py` |
| Website in sync | `python3 tools/build_web.py /tmp/web-gen` and `diff -r` against `web/` (the generated files); `python3 tools/sync_tokens.py --check` |
| Python tools | `python -m unittest discover -s tools/poi-audit/tests`, `python -m unittest discover -s tools/tests`, `python3 tools/check_docs_links.py` |
| Offline map scripts | `cd tools/offline-maps && npm ci && npm test && npm run test:python && npm run test:render-fixture` |
| Web smoke (every screen of the web export, light and dark, signed in and out, online and offline: nothing may throw) | `cd mobile && npx expo export --platform web --output-dir ../tools/web-smoke/dist/app`, then `cd tools/web-smoke && npm ci && npm test && npm run smoke` (needs Chromium: `npx playwright install chromium`); see `tools/web-smoke/README.md` |
| Workflows | `pip install actionlint-py && actionlint` |

The two pipelines run on their own schedule: `offline-maps` (monthly pack build and publish, publishing waits for approval in the
GitHub Environment `pack-publish`) and `poi-audit` (monthly place audit, report and review queue only).

## Conventions and where they live

- **Database**: schemas `public` (exposed API) and `private` (helpers, not exposed); every function sets `search_path = ''`
  and grants execute explicitly; RLS on every `public` table; server-owned columns are protected by guard triggers;
  client-writable tables use client-generated ids and soft deletes so the app can sync after hours offline. See
  `supabase/README.md` and the comments at the top of each migration. Migrations that have been applied are never edited: add a new one.
- **Design**: tokens in `design/tokens.json` / `design/tokens.css`. `mobile/src/theme/tokens.json` and `web/assets/tokens.css`
  are copies, kept in step by `tools/sync_tokens.py`. The audience includes older pilgrims: body text at least 17 px, touch targets at least 48 dp.
- **Voice and naming**: `brand/BRAND_GUIDELINE.md` (warm, second person, short sentences, "pilgrim" not "user", English first).
  The app's fourth tab is **Discover**.
- **Honesty about what exists**: the website and posts say "coming soon" for anything not built; offline packs hold map tiles only
  (no stay-detail or audio packs yet); photos on the site that are AI-generated are labelled as such.
- **Secrets**: none in the repository (it is public). The app ships only the Supabase URL and publishable key. The service role key lives in the
  GitHub Environment `pack-publish`; `ANTHROPIC_API_KEY` (optional, for the POI audit) is a repository secret.
- **Public repository, paid content**: never upload offline map packs as workflow artifacts; the pipelines upload JSON reports only.
