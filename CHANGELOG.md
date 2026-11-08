# Changelog

What changed in CaminoPlus, release by release, newest first, in the shape of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) but shorter.
The app's version is the `version` in [`mobile/app.json`](mobile/app.json) (Settings > This build shows it). How a release reaches a phone: [`mobile/DEPLOY.md`](mobile/DEPLOY.md).
There was no changelog before this one, so it starts after the Library v2 (pull requests #87 and #88).

## 1.1.0 (2026-11-08)

The Library has the Bible and 26 books; Notes moved to Me; the tab bar, the Back button and Me follow one standard; stage 3 of the Camino Francés has real places.
Added, Changed, Fixed, Removed and Data list what is on `main`.
The native fingerprint is `ef37d5816b2829366ff35defbb05f59fb13c3705`, the same as before this release
(no new native module, permission or icon): a development build made from `main` at or after #85 shows this release from Metro with no new build, and a preview build needs one new build while updates are off (`mobile/DEPLOY.md`, "Release 1.1.0").
**Nothing here has been tried on a phone by us**: see "Not checked on a device".

### Added

- **The Bible** (#94): the World English Bible, Catholic edition (73 books, public domain), read inside the app; nothing is fetched while reading. A tile for each book, the numbers of its chapters,
  a reader with Previous and Next across the books and poetry set as stanzas, a chosen verse with Bookmark, Copy and Share, search, verse bookmarks, and the credit on the Licences screen.
  `tools/bible/import_webc.py` makes the files and is pinned to the eBible.org download by its sha256. Left out, and counted in `manifest.json`: Strong's numbers, footnotes, cross references and the
  translators' introductions (Prologue of Sirach included); 29 verses have a number and no words; the Psalms use the edition's (Hebrew) numbering. The 73 books are 5.4 MB of JSON and make the app's JavaScript bundle 7.5 MB bigger.
- **Books** (#98): the Books tab, the book page and the reader run on the 26 books of `books/`: 14 route guides (one for every route of the catalog) and 12 books of readings, each paired with a Camino
  (a passage from a public-domain classic, an original reflection, a question for the walk). A cover grid in two columns, a book page with the notice of its kind above "Start reading", a reader with Previous and Next in a bar
  at the bottom; the place you stopped and the text size are kept on the phone. A passage can be bookmarked, copied, shared and **noted** (Note starts a diary note with the passage quoted); a chosen Bible verse can be noted too.
  The Licences screen names the reading sources of each book. The books come from `books/` through `python3 tools/build_books.py --no-render`, committed as `mobile/assets/library/` and `bookBundle.ts`.
  The first 20 books and their tools are #90; the six guides that complete the set (Aragonés, Salvador, Sanabrés, Madrid, Baztanes, Portugués from Lisbon) are #92, with two new checks in `tools/check_books.py`.
- **Me** (#99): one gold chat button at the bottom right of all four sub-tabs, with the unread badge the bell had (`99+` above 99); it opens the inbox on Messages, or on Notifications when only those are unread.
  Journey starts with a "Write a journey post" card (the size of a post tile) and Notes with one "Write a note" card.
- **The "All" highlight** (#106): the first item of the highlights row under the My Camino card is "All" (72 wide, pinned at the left while the destinations scroll beside it; alone in the row when the plan has no destination yet). A tap opens the Journey area as stamps in the look of the passport: a card "All places" with "N of 34 places" and a progress bar, then three stamps to a row, each filled (a turned shell and a count badge with the number of your posts there) or dashed. A tap on a stamp shows your own posts at that place in the Journey grid, with Back and the place name above it; a place with no post says "No journeys at <place> yet". The points are the start of the first stage and the end of every stage, read from the linked places or, where a stage has none, from the second half of its name. **The stamps are the published stages**, and only stages 1 to 3 of the Camino Francés are published (read on 8 November 2026), so All shows 4 points ("0 of 4 places") until stages 4 to 33 are published; with them it shows 34.
- **A Continue reading bar** (#101): one bar above the tab bar of the Library (Bible and Books tabs), "Continue reading" over the place ("Genesis 3", "<Book title> · Chapter N"); a tap opens the reader where you stopped. A close button (48 px) hides it, kept on the phone until the saved place is another one. It is not drawn on the readers, on the other tabs, while the tab bar is hidden or while you type. It replaces the Bible's Continue card and the continue part of the Books banner (the banner now only says "Start reading").
- **Design tokens and design-lint** (#105): icon sizes 20 and 28 join the scale (18, 20, 24, 28, 32); touch targets are 48 hard and 56 for the main action (`layout.touchHard`, `layout.touchPrimary`; `touchMin` stays as the old name of the 56); the theme exports every token scale (`icon`, `border`, `z`, `motion`, `text`, and a `SpaceStep` type). `tools/design-audit/scan.py` fails CI (the job `design-lint`) when new app code goes off the design tokens: spacing, type sizes, icon sizes, radius, raw colours, tap targets under 48, text closer than 8 px to the edge of a card. Its baseline may only go down. The rules for a screen in plain words: `mobile/docs/DESIGN-RULES.md`.

### Changed

- **Library** (#95): two tabs, Bible and Books. **Me** has Notes, Journey, Plan and Health, in that order, and still opens on Journey; the top right of Me is the gear alone (#99).
- **Daily reading** (#96): the title sits beside Back, with Calendar and Bookmark buttons; the month calendar is a sheet; a 7-day strip shows the liturgical colour of each day; the liturgical day
  (General Roman Calendar) is worked out on the phone. The readings and the reflection are **samples and say so**. A bookmarked day is a row on Bookmarks and opens `/library/daily?date=YYYY-MM-DD`.
- **Tab bar** (#91, #93, #97, #100): inactive tabs are lighter and quieter, 4.5 : 1 or more in both modes, with Light labels and an icon drawn as thin as the stems of its label (stroke 0.8, which is 0.93 px at 28 px;
  the stems measure 0.93 to 0.97 px); the dark bar is darker than the page and every card, with a 1 px hairline; the active tab is drawn heavier in light mode (stroke 3, Bold) than in dark mode (2.6, SemiBold).
  The numbers are tokens in `design/tokens.json`.
- **One standard Back button** (#100): `components/BackButton.tsx`, round, 48 by 48, used at 34 places in 30 files; the hand-built backs are gone (the Books reader's "Contents" pill, the Daily header's own, the offline-maps,
  planner and write chevrons, the flat backs of business, chat and the register wizard). A screen opened by a link or after a reload has a home to go back to (`/settings`, `/me`, `/stays`, `/maps`).
- **Books reader bar**: the title is 19 on 28 (it was 18 on 24), the largest size of the type scale that keeps all 26 titles on one line at 390 px (#100).
- **Diary editor** (#104): a note begun in the editor is a **draft** until it is **published**; both states stay only on the phone and nothing is sent anywhere. The marks bar (bold, italic, heading, bullets, quote, photo, pin) is inside
  the text box, under the text; one row at the bottom has Read (Edit while reading) as a third and Publish as two thirds; Save draft at the top right replaces Read. Save draft and Publish write first and then go back; if the write fails the page
  stays, with the reason, and is not shown as published. Notes and the list of pages show a Draft tag. A page with no status (every page of an earlier build) counts as published, so nothing needs migrating.
- **Bible tiles and Books covers** (#102): the Bible's book tiles are two columns, 173 by 124 at 390 px (140 by 116 at 320), with 16 px between the words and the outline (12 under 352 px; it was 4 px across and 7 down) and names on the type scale only (24, 17, 15; the smallest was 11 px at 320). The Old Testament grid is 71 percent longer (2,708 px at 390). The Books covers lose the kind line (the book page and the screen-reader label keep it) and the reading time is 15 px mono. New title tokens `text.h5` (17 on 22) and `text.h6` (15 on 21) are in `design/tokens.json` and `AppText`, and `sync_tokens.py` now compares letter spacing too. The design page's type-scale table was stale (7 of 12 rows wrong); its rows come from `tokens.json` now and `tools/tests/test_type_scale.py` reads the table back and compares every row.
- **Maps** (#103): the route line of Camino Francés stages 1 to 3 is the real OpenStreetMap route, bundled in the app (three GeoJSON files of 19 KB in all, and a manifest, made by `python tools/poi-audit/build_route_lines.py`; every point is an OSM node). It was hand-placed points (10, 5 and 5), up to 1.5 km off the real path and 17 to 20 km long on stages of 24, 21 and 20 km. Kept lengths: stage 1 24.0 km (seed value 24.2), stage 2 21.4 (21.4), stage 3 20.3 (20.4). The Walk view announces real turns only (at least 40 degrees, a bend and its counter-bend merged): 15, 20 and 19 announcements on stages 1 to 3, one every 1.0 to 1.6 km, where the old rule on the real line would have announced one every 350 to 460 m (52 on stage 1). The route beyond Pamplona is still straight lines between towns, and the route sheet says so, with the OSM credit and the date of the data.
- The design page, the website text and its pictures follow (#94, #95, #98, #99); the pictures of #100 were not re-rendered (`node tools/render_screens.mjs` does it).

### Fixed

- Plan tracker: the number of the next day was drawn in blue on the gold circle, 1.06 : 1 in dark mode; it uses the colour made for it now and a test pins 4.5 : 1 in both modes (#99).
- The Bible tiles cut the last letters of a name ("1 Corinthians") in a browser that hints glyphs, which draws a name up to 3.7 px wider than the font file says; the fit counts every letter rounded up to a whole pixel (#94).
- On the web, a selected or expanded item was not marked for a screen reader; the web now gets `aria-selected` and `aria-expanded` (#96).
- Seven route guides called a passport in any app a keepsake, but the Pilgrim's Office has a digital credential of its own. They say "in CaminoPlus, or in any app other than the Office's own digital credential", and the checker refuses the old wording (#92).
- The Library search lost the keyboard from the first letter on the Notes tab (#89). That tab has since moved to Me.

### Removed

- The Notes tab of the Library (its feed is in Me > Notes now), and the three Notes filter tabs, All, Photos and videos, and Places, with everything only they used (#95, #99).
- The bell at the top right of Me (the chat button has its unread badge now) and the round pen buttons that wrote a journey post or a note (the two cards write them now) (#99).
- The twelve example classics of the earlier Books plan, and the tall Books banner code (#98).

### Data (live database)

Applied to the live Supabase project, not through a migration. **No migration holds these rows**: a database built from `supabase/migrations` and `seed.sql` has only the seed sample.

- **Camino Francés stage 3, Zubiri to Pamplona, was loaded from OpenStreetMap**: 498 stays and 374 places of interest. Stage 1 has 84 and 111, stage 2 has 71 and 71. Checksums verified.
- The database now holds 628 stays and 526 places in all; the three stages list 653 stays and 556 places, because a place near where two stages meet is one row linked to both.
- The stage functions `list_stage_stays` and `list_stage_pois` return at most **500 rows** each. Stage 3 returns 498 stays, two under the cap. Details: [`supabase/README.md`](supabase/README.md#openstreetmap-places-in-the-live-database).

### Known limits

- **Offline map packs are not published yet.** The table `offline_packs` is empty and the `offline-maps` workflow has never run, so no stage can be downloaded and the screen says "Map not published yet". Publishing needs the GitHub Environment `pack-publish` with the secrets
  `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`: an owner step ([`tools/offline-maps/README.md`](tools/offline-maps/README.md#first-publish-step-by-step)).
- **Updates over the air are off.** The `eas-update` workflow is skipped until the secret `EXPO_TOKEN` and the variable `EAS_UPDATE_ENABLED` = `true` are set (an owner step, [`mobile/DEPLOY.md`](mobile/DEPLOY.md)), so a merge reaches no phone by itself and a preview build runs the JavaScript it was built with.
- **The readings and the reflection of the Daily reading are labelled samples.** The liturgical day (its name and colour) is worked out for real; the texts are not.
- **The books are AI-assisted** (every book page says so) and **no person has checked the facts of the 14 guides**: `books/series.md` lists what to look at first. The app's route note for the Camino de Madrid still says the road crosses
  the Navacerrada pass; the Madrid guide's sources say the crossing is the Puerto de la Fuenfría (`mobile/src/data/routeGuide.ts`, not changed). Nothing is uploaded, priced or published as an EPUB.
- Stages 4 to 33 of the Camino Francés, and the Portugués Central and Inglés stages, are hidden and have no places and no distance. `stages.geom` is a 3-point hand-placed line on stages 1 to 3 only and nothing reads it.
- A stage with more than 500 stays or places would lose the rest, from the end of the walk, and the app would not say so.
- Notes has no Draft filter (drafts are in the one feed, with their tag), and the time on a row is the day the note was begun, not the day it was published (#104).
- **All shows 4 points, not the whole route.** It draws the published stages, and stages 4 to 33 (and the Portugués and Inglés stages) are hidden until their distances are sourced. Publishing them is one statement, in migration `20261112000000`; it needs no new migration (#106).
- The bundled route lines come from OSM data of 19 August 2026, 81 days old when they were made (the tool warns above 60). Run `python tools/poi-audit/build_route_lines.py` again, from a fresher Overpass mirror, before a release (#103).
- The 12 sample pins in `sampleRoute.ts` are still hand-placed (Orisson is 926 m off the line); they show only while the database has no places for a stage, and stage 3 has real ones now. With no pack installed the offline map shows no attribution (MapLibre RN 11.5.1 has no attribution prop on its GeoJSON source); the credit is in the route sheet and on the Licences screen (#103).

### Not checked on a device

Nothing in this release was run by us on a phone or with VoiceOver or TalkBack. It was measured in the web export (Chromium with the real fonts, at 320, 390 and 430 px, light and dark, online and offline) and by unit tests.
The owner built the diary change (#104) on a phone; what it did there has not been reported. Not looked at: the screens on iOS and Android text engines; large system text; a real 320 px phone; tablets and landscape;
how a 0.93 px stroke looks at 2.625x; the keyboard-up layouts (the web has no such events); the native map.
Also not looked at: whether the Walk view's turns fall where a walker needs them on a real walk (the rule knows no real junctions, so a straight-on fork is not named), and the native map over the new line, its frame rate and battery.

### Decisions still open for the owner

The questions each pull request left to the owner, in the pull request's own words.

- **#98 Books**: (1) Is the AI-assisted wording in `books/notices.ts` right for you and for the stores? (2) Who checks the facts of the route guides, and when does the notice change? (3) Are you sure of the rights to the original text (the "Original text written for CaminoPlus" line)?
- **#99 Me**: (1) A group-only unread opens Messages (as decided), although that unread sits under Groups. (2) The Journey card is the first grid tile, so at scroll 0 on a 390 x 844 phone it sits partly behind the tab bar (the grid starts under the profile and the highlights). The old pen was always visible. (3) Ten sample posts plus the card leave one lone last tile.
- **#100 Standard chrome**: (1) 19 is only +1 px. Clearly bigger needs 22: two lines (bar 28 px taller for 5 of 26 books at 390, 18 of 26 at 320), or cut titles with an ellipsis (5 at 390), or a separate title row (+32 px for every book). (2) The website pictures were not re-rendered (only the thin inactive icons change; a fresh render also shows 0.4 to 5 percent renderer noise on other screens); `node tools/render_screens.mjs` redoes them. (3) Screens that only called `router.back()` now have a home fallback (/settings, /me, /stays, /maps) for a reload or a deep link.
- **#101 Continue reading bar**: (1) Narrow phones: with the chapter protected, most titles show cut ("The Mountain o… · Chapter 12"; at 320 about six letters). Alternative: the chapter on the first line beside "Continue reading", the title alone on line two (every title whole at 390). One small change. (2) "Chapter N" counts front matter like the reader's own header, so Day 1 of a book of readings reads "Chapter 3". Prefer the chapter's own title ("Day 1")? (3) Dead continue code remains in `books/copy.ts` and `useBooksReading().last` (PR #98's files, pinned by its tests): delete in a follow-up?
- **#102 Tiles and covers**: (1) At 351 px wide the words have 129 px (padding 12), at 352 only 120 (padding 16): a few names drop one size between 352 and 359. Everything still fits. (2) The chapter grid is unchanged: its number is 20 px mono against the token 15 (a token swap would look smaller). (3) Tile names do not grow with the phone's text size (a fixed 124-high tile). (4) At 320 px, 9 of 26 cover titles are 15 px; a side padding of 8 would give more, but the owner chose space.3.
- **#103 Route line**: (1) Data age: the only reachable Overpass mirror served OSM data of 2026-08-19 (81 days; the tool warns above 60). Re-run `python tools/poi-audit/build_route_lines.py` from a fresher mirror before a release. (2) `stages.geom` in the database is still a 3-point hand-placed line per stage and nothing reads it; a migration from these files would make it consistent when something starts to read it. Not done. (3) The 12 sample pins in `sampleRoute.ts` are still hand-placed (Orisson 926 m off the line); they show only while the database has none for a stage (stage 3 now has real ones). (4) Offline with no pack installed, the map shows no attribution (no source on the parchment background); MapLibre RN 11.5.1 has no `attribution` prop on `GeoJSONSource`. The credit is in the route sheet and the Licences screen. (5) Corners: 40 degrees is the one knob if the owner wants them sparser or denser.
- **#106 The "All" highlight**: (1) Publish stages 4 to 33 (and the other routes' stages) so that All shows the whole route; until then it shows 4 points. (2) "N of 34 places" for the Camino Francés (33 stages = 34 points: the start plus 33 ends; the passport counts the same towns). (3) All as a switch (a second tap closes the stamps), or never close? (4) Towns between stage ends (Hontanas is not the end of a Camino Francés stage) are not points; a post typed "Hontanas, Burgos" lands under Burgos, "Hontanas" alone under nothing. A richer places list would be separate work. (5) The passport still builds its towns from linked places only, so it shows fewer towns than All; it could share `routePoints`. (6) A destination highlight and a stamp use two partitions (plan destinations vs route points): equal for normal plans, different only for custom stops.
- **#105 Design tokens and design-lint**: (1) `c.*` where an identical `role.*` exists is counted apart and does not fail the check. Say if it should. (2) The inset rule counts all of its boxes and some are badge-like; they need an ignore with a reason or a decision to exclude badges. (3) Most of the raw colours are the map palettes: tokenise them in the map phase or ignore them with a reason. (4) Border widths and icon stroke widths are not gated. (5) Remove the `touchMin` alias once every branch has merged. (6) Ignores are per line only; there is no block form. (The numbers are in the pull request.)
