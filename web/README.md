# camino.plus website

Static marketing site for camino.plus (plain HTML/CSS, no build step on Vercel).

- Pages: `/`, `/features`, `/routes`, `/offline-maps`, `/pricing`, `/faq`, `/about`, `/contact`, `/privacy`, `/terms`, `/licences`, plus `404.html`. `sitemap.xml` is generated with them.
- **Generated, do not edit by hand:** the pages and `sitemap.xml` come from `tools/build_web.py`. Edit the content there, run `python3 tools/build_web.py web`, and commit both the script and the output. CI (job `web-sync`) generates the site into a temporary folder and fails if it differs from `web/`.
- Styles: `assets/tokens.css` is **generated** from `design/tokens.css` by `python3 tools/sync_tokens.py` (it only drops the Google Fonts `@import`). `python3 tools/sync_tokens.py --check` (also run in CI) fails when the copy is stale or when `design/tokens.json` and `mobile/src/theme/tokens.json` differ. Site styles live in `assets/site.css`. Both stylesheets are linked with a `?v=<content hash>` so a browser never mixes old CSS with new pages.
- Fonts are self-hosted (`assets/fonts`, latin subsets of Fraunces, Inter, JetBrains Mono and Caveat, SIL OFL; licence texts and sources are in that folder). The site makes no request to Google, so the Privacy Policy can say so.
- App screenshots in `assets/screens/` are previews rendered from the phone mock-ups in `design/index.html`. Re-render them whenever the design changes: `cd tools/offline-maps && npm ci && node ../render_screens.mjs` (needs Pillow for the WebP step). The features page says they are design previews. The social share image `assets/og.png` is rendered from those screens by `node tools/render_og.mjs` (run it after the screenshots).
- Background photos in `assets/photos/` are **AI-generated** (OpenArt), resized to WebP. Every place that shows one carries a visible "AI-generated illustration" credit, and the footer of every page says so (see `PHOTOS` in `tools/build_web.py`). Add a credit there when you add a photo.
- The route list on `/routes` mirrors the published routes of the database (`supabase/migrations/..._more_caminos.sql`); `tools/tests/test_web.py` fails when they drift apart.

## Deploy on Vercel

Create a separate Vercel project from this repo with **Root Directory = `web`**, Framework preset **Other**, no build command. `vercel.json` turns on clean URLs (`/pricing` serves `pricing.html`) and sets the headers: CSS and JS revalidate on every load, everything else under `/assets` is cached for a week. The two cache rules do not overlap on purpose (an `/assets/(.*)` rule written after the CSS rule used to win and cache the stylesheet for a week). Then add the domain `camino.plus`.

## Before launch (checklist)

- [ ] **Store buttons:** the site shows plain "iOS: coming soon" / "Android: coming soon" buttons, with no Apple or Google logos, because those badges have their own usage rules. At launch replace them with the official App Store and Google Play badges and the real links (`stores()` in `tools/build_web.py`), following Apple's and Google's badge guidelines.
- [ ] **AI photos:** check OpenArt's commercial-use terms for the images in `assets/photos/` (still open). Replace `santiago-cathedral.webp` (the call-to-action background on seven pages) and other famous landmarks with real, licensed photographs, as `brand/BRAND_GUIDELINE.md` requires. Keep the AI credit for any image that stays AI-generated.
- [ ] Have Privacy and Terms reviewed by legal counsel (they are marked as drafts; the processors list says "when enabled" for RevenueCat, Sentry and Resend, update it when they go live) and bump `LEGAL_UPDATED` in `tools/build_web.py` with every change.
- [ ] Set up the `hello@` and `privacy@camino.plus` mailboxes.
- [ ] Re-render the screenshots from the final design and check the "coming soon" claims on `/offline-maps` and `/features` against what the app really does.
