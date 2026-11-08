# Web smoke test

"Make sure nothing crashes", as a test that runs on every pull request. It opens **every screen** of the web export of the app in
a real browser (Chromium, through Playwright) and fails when any of them throws, logs an error, shows an error screen, or phones a
host nobody agreed to. A screen added tomorrow is swept the next time it runs, with no edit to the test.

It checks the web export, not the phone build: the native map, the camera and the file system are not there, and `expo-file-system`
prints a warning on web. What it does catch is the part that is the same everywhere: a screen that throws while it renders, a
navigation that goes nowhere, a promise nobody handles, a guard that bounces the wrong person.

## What it checks

Every route, in every account state that can open it, in **light and dark**, **online and offline**:

- no uncaught exception (`pageerror`), no `console.error` (except the [allow-list](#the-console-allow-list)), no unhandled promise rejection;
- the page is not blank (it shows text), and shows no error screen: expo-router's error boundary and "Unmatched Route", React's
  "Minified React error", the dev overlay's "Unhandled Runtime Error";
- the screen is still on its own address when it has settled: a guard or a redirect that took it elsewhere would mean the test never
  looked at it (the few screens that redirect on purpose are in `EXPECTED_REDIRECTS` in [plan.mjs](plan.mjs), each with a reason);
- every file the app asks for is in the export (a 404 is a failure; a missing script does not turn into HTML);
- **no request leaves the machine** except to the local server and to the Supabase project, which is answered from
  [fixtures.mjs](fixtures.mjs). Anything else is refused, recorded, and fails the check: nobody adds a silent third-party call.
  WebSockets (Supabase realtime) are intercepted as well.

Offline means `context.setOffline(true)`, the Supabase project out of reach, and `navigator.onLine === false` (the run fails if it
is not). The app's own files are handed to the browser by the test, because an offline browser cannot reach even localhost.
Online starts from nothing (a first launch after signing in); offline starts from a phone that has the account and the Me tab
saved, so the offline run shows the saved-copy screens.

A screen can break on a list with rows in it and on a list with nothing in it, so the signed-in states are swept with two kinds of
data: a **full** account (a walked day, stamps, posts, friends, chats, stays: every list has rows) in light and dark, and an
**empty** account (the account and the journey, nothing else: what a new pilgrim sees, and what the earlier hand-run sweeps used)
in light. Offline, the empty account has only the account saved, the Me tab never was.

Then the **scenarios** ([scenarios.mjs](scenarios.mjs)), each in light and dark, written the way a person would use the app:

- the tab bar shows Me, Stays, Maps, Discover and Library, and each tab opens; an inactive tab is thin and Light and its icon is drawn as thick as the stem of its label (0.8 of 24 units at 28 px, 0.93 px, within 10 percent of the 0.93 px of Inter Light at 14), the active tab heavier (the numbers of `tokens.tab`);
- the gear on Me opens `/settings` (no tab bar there) and Back returns to `/me`, also when Settings was opened from a link;
- switching light/dark on Settings returns to Settings, and Back goes to Me;
- Library: its top row is a search field and the Bookmarks button (no title, no diary button); directly under it, before any banner, the two tabs
  Bible and Books, in that order, and no Notes tab, no write card and no chat button; Bible and Books each have a banner, neither has a notice (the text of the Bible is real, and every book is in the app);
  the Books tab lists a cover for every book of the bundle, and shows nothing that is only
  data (rights, links, the id of a source); the banner of the Bible tab (the whole card
  and its "Read today" button) opens `/library/daily`; a search lists what it finds in Bible, Books and Verses (and says "Nothing found
  for ..." with a way back); the Bookmarks button opens `/library/bookmarks` with the bookmarked rows of both tabs, a verse and the
  bookmarked post (the full account has one bookmarked post); bookmarks kept before the tabs changed (a Music row, the old example rows, `notes:` keys, the
  two Bible rows that were taken out) or kept for a verse that is not in the text are ignored without an error;
- Bible ([bible.scenarios.mjs](bible.scenarios.mjs), the same walks on the real text): the daily banner is compact (at most 120 high at 390
  wide, 140 at 320) and is one button; the three parts (Old Testament, Deuterocanon, New Testament) are a segmented control under the banner
  that scrolls with the page, and each shows its books as compact tiles, two in a row (173 by 124 on a phone of 390, 140 by 116 on 320), the words 17 from the outline
  (13 under 352 wide) and the first row clear of the tab bar; all 73 book names fit their tile at 320, 360, 390 and 430, each at a size of the type scale (24, 17 or 15, in Fraunces;
  the 21 short ones the full 24; 17 or more from 390 up) with the count in JetBrains Mono at 15; a Chromium that hints the glyphs (CI's does)
  lays a name wider than one that does not, so the fit counts every letter rounded up to a pixel (tried with --font-render-hinting set to none, slight, medium and full);
  a tile opens the numbers of the chapters, a number opens the words, and Previous and Next name where they go, cross the books and the
  parts (Malachi 4 to Tobit 1) and are disabled at Genesis 1 and Revelation 22; prose is paragraphs, a psalm is stanzas, and the end of a
  chapter has the credit and says it is not the translation read at Mass; a touch chooses a verse and raises Bookmark, Copy and Share, a
  bookmarked verse is listed on Bookmarks and opens the reader at it; the three actions are big (a glyph of 30, a word of 16 in Inter
  SemiBold, each at least 88 by 68, the reference 17) at 320, 390 and 430 wide, the bar clears the bottom edge, and a verse touched low on a
  short phone (568 high) is brought above the bar; a link to a verse (`?v=105`) opens the chapter with that verse chosen,
  and an address that leads nowhere is a calm "Not found"; the search finds verses after the keystroke (typing is never blocked), marks the
  match and offers "Go to" for a typed reference (going back to the chapter read last is the Continue reading bar, below);
- Books ([books.scenarios.mjs](books.scenarios.mjs)): the Books tab is a compact banner and the covers, A5 (148 by 210) in two columns, 16 from the edge and 12 apart (173 by
  245 on a 390 phone, 138 by 196 on 320, 193 by 274 on 430, never wider than the screen), on a shelf for each kind of book (Pilgrim's guides, Readings for the Way) with its
  heading, each ONE button named "title, kind of book, time" with its own ribbon, a 44 by 44 button that bookmarks the book, in the four fonts of the brand (Fraunces,
  Inter, JetBrains Mono, and at most one handwritten Caveat note on the screen); a cover prints its title and its time (JetBrains Mono at 15, on one line, 12 clear of the
  sides) and no kind of book (the label still says it); no cover says Soon or Free; a cover opens the book page (the cover, the title, the subtitle,
  the kind, the facts, THE NOTICE OF ITS KIND above the button, "Start reading", the contents with the minutes of each chapter, the credit) and Back returns to the tab; the
  first and the last book of each kind show the wording of `notices.ts`; the reader opens at chapter 1, Next and Previous (named by where they go, in the bar at the bottom)
  go through the chapters, are off at the first and at the last chapter, the browser's Back goes to the page and not through the chapters, and the Back button of the reader (the round 48 one of every screen, in a row with the two round 48 size buttons, 16 from the edge; there is no "Contents" pill) goes to the contents; the title of the book in the bar is one line of 19 px in Inter SemiBold (the longest titles whole on 390 and 430, cut with an ellipsis on 320, the bar as tall for every book); the reader keeps
  where you stopped (Continue on the page and the Continue reading bar above the tab bar, the same line, with the time) and the size of the text (five steps), and a damaged place opens
  the book at its start; a link with `?c=`, a chapter and a book that do not exist (and one of the twelve classics of an earlier plan); the ribbon, Bookmarks and the search
  (title, subtitle, chapters); and the same with no signal. The books are read from `mobile/assets/library/catalog.json` (the bundle of `tools/build_books.py`), so every
  scenario works with however many there are; the banner of the tab only ever says "Start reading";
- Continue reading ([continue.scenarios.mjs](continue.scenarios.mjs)): one bar floats above the tab bar of the Library, on the Bible tab and on the Books tab, and only when
  something was read: nothing read, no bar and no card in the page. It is 8 above the tab bar (never touching it), 64 high, the tab bar's width, with the X a button of its own,
  at least 44 by 44, after it; scrolled to the end of the Bible tab the last tile ends above it; it is a hero card (Fraunces for the place, Inter over it, no handwriting, 4.5 : 1
  for the words and 3 : 1 for the glyphs, in light and in dark); it is not on Me, not on a reader, and it steps aside while the search field has the focus or something is typed.
  Tapping it opens the reader at the place (a chapter of the Bible, or the book where you stopped); the X hides it, keeps what was hidden on the phone, and it stays hidden
  after a restart until another place is read (or the same one is saved later). The most recent place wins, the Bible or a book: a book is named by its title and the chapter
  the reader will open; the book with the longest title of the Library has its title cut with an ellipsis and its chapter never cut, on one line with the X inside the bar, at 390
  and at 320 wide, and the shortest title is drawn whole at 430. A stored mark that does not read (not JSON, another version, a wrong type, a time that is no time) hides
  nothing; a place that no longer exists (a chapter past the last, a book that is not in the Library, a damaged store of the books) gives no bar and no error, and never
  hides the Bible's place;
- Me ([scenarios.mjs](scenarios.mjs) and [me.scenarios.mjs](me.scenarios.mjs)): the strip is Notes, Journey, Plan, Health, in that order, and Me opens on Journey, with the card of the
  journey and not the card of Notes; at 320 px wide the four labels are one row, each on one line, none clipped;
  - the header: the right half of the top row of Me has the gear and nothing else (no bell, no inbox button, no badge);
  - the chat button: ONE gold round button, 60 by 60, floats 16 from the right edge, above the tab bar, on Notes, Journey, Plan and Health, labelled
    "Inbox, 3 unread" for the full account with its badge ("3") inside the screen; it opens `/inbox` on Messages (a chat is unread) and Back returns to
    Me; with the unread totals made up in the walk it opens on Messages for a chat or a group, on Notifications when only notifications wait, and on Messages
    when nothing does, the label has the real number and the badge stops at "99+" (and shows "99" at 99); with no signal it is just "Inbox" with no badge;
    the Library has neither a chat button nor a write card;
  - Journey: the first tile of the grid is the card "Write a journey post": one button in the top left, 2 px from the screen edge and from the next tile,
    the size of a post tile (192 by 341 on a 390 screen, 9:16), its words at least 16 px; the posts follow it (the second post is under the card, in the
    left column), the second post opens the viewer on that post and the first on the first (the page that is on the screen, never one above or below it),
    and the card opens `/write`; a pilgrim with no post yet (the account with nothing in it) has the sample journey, whose banner says to tap the first card,
    with the card in front of the ten samples (the last sample is alone on its row);
  - Notes is the first sub-tab: its feed starts, right under the strip, with ONE card, "Write a note" (full width, at least 64 high, "Notes stay on this
    phone." under its title); there is no filter row (no tab named All, Photos and videos or Places, none of those words except the All item of the highlights row, no tab list); the empty diary says
    "No notes yet" with no button of its own; Plan and Health have no card; Journey has its own; the card opens `/diary/new`, and a note written there is
    in the feed after Back;
  - All places ([allplaces.scenarios.mjs](allplaces.scenarios.mjs), on the 33 stages of the Camino Francés and six posts made up in the walk): the highlights row starts with "All" (the
    shell, pinned at the left, the leftmost button of the row, 72 wide, selected only while its stamps are open), then the destinations of the plan; a tap opens one stamp for every place of
    the route (33 stages are 34 places), three in a row, each a button of at least 48 named "<place>, N journeys" or "<place>, no journeys yet", a filled one with its number, and the line
    "3 of 34 places"; a stamp shows exactly the posts at that place with the card that writes a post once, the app's one Back button over it goes back to the stamps (not to all the posts), and
    All again closes the stamps; a place with no post says "No journeys at <place> yet" over the card alone; from Plan and Health All opens the stamps of Journey, and a destination of the row
    still shows its posts (the same one again clears it); a plan with no destination still has the All item, alone in the row; an account whose route has no places has no All item;
- Maps ([maps.scenarios.mjs](maps.scenarios.mjs), the round controls of the Maps tab, on 320 x 568, 360 x 640, 390 x 844 and 430 x 932 with the safe area of a phone where Chromium can add it): every round
  control, on the whole route and in the Walk view, is 56 by 56 with a 28 icon, 16 from the right edge and 12 apart, the zoom pair one capsule 56 wide and 112 high whose halves touch; the Re-center pill
  (the map is dragged by hand first) is 56 high with a 24 arrow and "Re-center" in Inter SemiBold at 17, 16 from the left edge, level with the bottom of the column and 12 or more from it; the Walk view
  column ends 12 above the bottom card and the whole route column 16 above the tab bar; the top row ("Whole route / Near me", 56 high, and the offline maps button) never touches at 320 wide; nothing on
  the screen overlaps (banner, chips, notices, column, pill, card, tab bar) and no text is under 15 px; a short phone folds what does not fit into the "Map options" rows of the sheet of the flag button
  (named "Route details and map options"), which work there, while the zoom pair and the help bell (in the column, or in the row of buttons of the card) are always there; and with the text 1.5 and 2 times
  as big (the page's text and line heights scaled, as a phone does: the web has no such setting) nothing overlaps and the zoom pair is still reachable. The check fails on the build before the family existed
  (the help bell was 48 wide);
- Notes, a page is a draft until it is published: on a blank page Read and Publish are off and there is no Save draft; with words in it Save draft is at the
  top right and the date says Draft; the marks (Bold, Italic, Heading, Bulleted list, Quote) sit inside the text box, under the text and above the bottom
  row; Read is a third and Publish two thirds of one row at the bottom (margin to margin, at least 48 high); Read turns into Edit in the same place; Save draft
  goes back to the feed with a Draft tag on the note; opened again the draft is read, with Edit and Publish; Publish takes the tag away; a published note that
  is read has Edit alone across the row, and written it has Read and Done and no Save draft;
- Pilgrim profile ([pilgrim.scenarios.mjs](pilgrim.scenarios.mjs), the profile of ANOTHER pilgrim and their journey, `/pilgrim/<id>`): a friend opens from the friends list (the picture and
  the name; the round chat button and the three dots stay on the row) with Back at the left and the three dots at the right (both at least 48), the card (name, @username, what they wrote, km,
  posts, stamps), Message (56 high) and their journey as the grid of Me with NO card that writes a post (the first tile top left and the second on its row, 9:16, 2 px apart); a tile opens the
  viewer with the action rail (love, bookmark, comments, share) and their name beside the close button, which closes it; Message opens the chat, and Back returns to the profile and then to the
  list. **Nothing private**: no tab, no text or button named Notes, Plan or Health and no write card on the profile or in its viewer (the check is proved to fail on Me, where they are). The share
  button of the viewer sends the invitation to the app, never their words, and counts nothing. The three dots: Unfriend, Report (with the reasons of the chat) and Block for a friend, no Unfriend
  for anybody else; blocking makes the profile "not available" at once. A stranger found in the Find tab: Add friend (the request goes out, the button says Requested), and the journey says
  "Journeys shared with friends are not shown here". A private stranger is a minimal card: the name and the button, none of the numbers or the words they wrote, no journey. An id nobody has, a link
  that is not an id: one calm card, "This profile is not available", with Go to Friends; your own id goes to Me. With no signal it says you are offline, with Try again. The name of the author
  of a comment opens that pilgrim (here Lucas, whose request is waiting: Accept and Decline), and the name in the header of a direct chat opens the friend. The route sweep draws the profile of
  the friend in `routes.mjs` (SAMPLE_OVERRIDES); the people are in fixtures.mjs (Hannah the friend with three posts, Lucas with a request, Marta a public stranger, Ines a private one);
- Stays lists the stays of the stage and one opens with its details;
- logging out from Settings lands on Welcome;
- launching the app lands on Welcome (signed out), Onboarding (signed in, no journey) or Me;
- with an expired login the session is renewed online; offline the account saved on the phone opens on Me and says it is offline,
  and with an expired login (also with nothing saved: "No signal right now") the app does not wait for the network.

The diary screens and the Notes feed (the first sub-tab of Me) belong to their own features: they are swept (they must load without errors),
and the scenarios only check where the card leads, that Notes is the first sub-tab, that its feed has the one card and no filter tabs, that a note written there
shows up, and the draft/publish row of the editor (above), never what the notes themselves contain. The Bible screens are the Bible feature's own, and they run on the real text (Psalm 121, John 1, Psalm 119, Malachi 4, Tobit 1),
so those walks fail when the text is missing or the import is wrong. The daily reading has scenarios of its own ([daily.scenarios.mjs](daily.scenarios.mjs)),
which never name a date (the browser's clock is the phone's, and "today" is found as a person finds it, by the day that says "today"):

- the header is one row (Back, the title, the Calendar button, the Bookmark button), every button at least 44 by 44 (they are 48); the strip has exactly seven
  days, each at least 44 by 44; a tap on a day picks it and changes the liturgical title, Today brings it back, the arrows move a week; under it
  the card, the notice, and the readings and the reflection tagged as samples (the Psalm is the only citation, a reading opens and closes);
- the Calendar button opens the sheet; Escape, Close and a tap outside close it; a day chosen in it closes it and moves the strip to its week; its
  Today picks today;
- the Bookmark button toggles and is kept; the day is a row of Bookmarks ("Daily reading", the date, the liturgical title) that opens
  `/library/daily?date=YYYY-MM-DD`; taking it off there removes the row;
- `?date=` opens that day (also one far outside the five years) and anything that is not a day opens today.

The Bible screens are the Bible feature's own, and they run on the real text (Psalm 121, John 1,
Psalm 119, Malachi 4, Tobit 1), so those walks fail when the text is missing or the import is wrong.

### Routes and account states come from the source

- **Routes**: every file of `mobile/app` is a route (expo-router), except `_layout`, `+not-found`/`+html`, API routes and files for
  another platform. `(group)` folders vanish from the address, `index` is the folder, `[param]` gets a fixed sample value
  (`SAMPLE_PARAM` in [routes.mjs](routes.mjs); `SAMPLE_OVERRIDES` there if a screen needs a specific one to show itself).
- **Account states**: the `<Stack.Protected guard={...}>` blocks of [`mobile/app/_layout.tsx`](../../mobile/app/_layout.tsx) are read
  and evaluated for three states: signed out, signed in without a journey (onboarding), signed in with a journey. A route is swept
  in every state its guards let it be opened in. A guard the test cannot read (anything but names, `!`, `&&`, `||`) stops the run
  and says so, instead of silently leaving routes out. A screen no layout mentions is open to everyone and is swept in all three.
- The run also fails if a layout declares a screen that has no file, or a route no account state can reach.

`npm run smoke -- --list` prints the routes and the states that reach them.

## Run it

```bash
cd mobile && npm ci && npx expo export --platform web --output-dir ../tools/web-smoke/dist/app
cd ../tools/web-smoke && npm ci
npx playwright install chromium    # once; CI uses --with-deps
npm test                           # the self-test: the harness against an app built to misbehave (about 25 s)
npm run smoke                      # about 3 minutes: 460 checks at the time of writing (npm run smoke -- --list counts them), 4 pages at a time
```

`npm run build:app` runs the export command for you. Use the normal (production) export, as CI does: a development export (`--dev`)
opens Metro's hot-reload sockets to its own server, which the test refuses like any other unexpected call, and never goes idle.
Options (`node smoke.mjs --help` is this list):

| Option | |
|---|---|
| `--app <dir>` | the web export (default `dist/app`) |
| `--only <text>` | only the checks whose name contains the text, e.g. `--only "/settings"` or `--only "dark, offline"` |
| `--verbose` | print every check, the allow-listed console errors, and the Supabase endpoints no fixture answers |
| `--concurrency <n>`, `--timeout <ms>` | pages at once (4), limit per page load or scenario (20000) |
| `--artifacts <dir>`, `--trace` | where failed checks leave screenshot, report and trace; `--trace` records every check (on in CI) |
| `--bail <n>` | stop after n failed checks (25), so a broken build does not burn the time limit |
| `--list` | print the routes and the plan, run nothing |

If the export was built with another Supabase project (`EXPO_PUBLIC_SUPABASE_URL`), set `SMOKE_SUPABASE_URL` to the same URL.

### When it fails

Each failed check prints its route, scheme, mode and account state, then its first five errors with their stacks:

```
FAIL  /settings  [dark, offline, signed in, with a journey]
      [pageerror] TypeError: Cannot read properties of undefined (reading 'name')
          at http://127.0.0.1:41141/_expo/static/js/web/settings-….js:1:1234
```

and the exit code is 1. The screenshot, a text report and (with `--trace`) a Playwright trace of every failed check are in
`artifacts/` (CI uploads them as the `web-smoke-failures` artifact; open a trace with `npx playwright show-trace <file>.trace.zip`).
To rerun one check: `npm run smoke -- --only "/settings  [dark, offline"`.

## Keeping it honest

### The console allow-list

`CONSOLE_ALLOW_LIST` in [collector.mjs](collector.mjs) holds the `console.error` messages that are **not** failures. It starts with
one entry (in the offline runs the test cuts requests on purpose and Chromium reports each one). To add an entry:

```js
{
  pattern: /^the text of the message/,        // a RegExp tested against the message
  reason: 'One line: why this message is harmless and cannot be fixed in the app.',
  offlineOnly: true,                           // optional: only the offline runs
},
```

**Every entry needs a one-line reason.** The reason is the review: someone reading the list in a year must see why each message was
let through, and whether it can go. An entry with no reason, a reason that is not one line, or a pattern that is not a RegExp is
refused when the test starts (`checkAllowList`), and the self-test proves it. Prefer fixing the message in the app. `--verbose` prints
what the list let through, so it can be audited.

### The Supabase fixtures

[fixtures.mjs](fixtures.mjs) is the whole outside world. A screen that asks for something it does not model gets an empty list
(`--verbose` names those endpoints); to give a screen rows to draw, add a table to `tables()` or a function to `RPC`. To let the
app talk to a new host, mock it there with a reason, or it fails as `unexpected-host`.

### The self-test

`npm test` runs the harness against an export that misbehaves on purpose (an exception, a dropped promise, a console error, a blank
page, an error screen, a call to a stranger over http and over a WebSocket, a missing file, a screen that redirects) and checks
that each is reported, that a clean screen is not, and that the command line exits 1 or 0 accordingly. Unit tests cover the error
collector, the route and guard reader, the plan, and the fixtures. CI runs it before the sweep, so a harness that cannot fail never
gets to say "green".

Playwright is pinned to one exact version, the same as [tools/offline-maps](../offline-maps/package.json) (both fetch the same
Chromium; a test checks they agree). Bump both on purpose, with the tests looked at.

## Files

| | |
|---|---|
| [smoke.mjs](smoke.mjs) | the command: reads the routes, runs the plan 4 at a time, prints the report, sets the exit code |
| [harness.mjs](harness.mjs) | one browser context per check: seeds the phone, closes off the network, watches the page, keeps evidence of a failure |
| [routes.mjs](routes.mjs) | routes from `mobile/app`, account states from the guards |
| [plan.mjs](plan.mjs) | which checks exist (route x state x scheme x mode, then the scenarios), the redirect list |
| [scenarios.mjs](scenarios.mjs) | the walks a person does |
| [me.scenarios.mjs](me.scenarios.mjs) | the walks of Me: the header with the gear alone, the chat button and where it opens, the card of Journey (also in the sample journey), the card of Notes |
| [pilgrim.scenarios.mjs](pilgrim.scenarios.mjs) | the walks of the profile of another pilgrim: a friend, a stranger, a private one, one that is not there, no signal, the name of a comment author, and that nothing private is on it |
| [allplaces.scenarios.mjs](allplaces.scenarios.mjs) | the walks of the All item of Me: the row, the stamps of the route, the journeys at a place, the way back, Plan and Health, no destination, no places |
| [maps.scenarios.mjs](maps.scenarios.mjs) | the walks of the Maps tab: the round controls as one family, nothing overlapping, the folded controls in Map options, large text |
| [bible.scenarios.mjs](bible.scenarios.mjs) | the walks of the Bible tab and the reader (kept apart so the other walks stay short) |
| [books.scenarios.mjs](books.scenarios.mjs) | the walks of the Books tab: the covers, a book page, the reader, the place kept on the phone, the notice of each kind |
| [continue.scenarios.mjs](continue.scenarios.mjs) | the walks of the Continue reading bar above the tab bar of the Library: where it sits, closing it, the most recent place, a mark that does not read |
| [fixtures.mjs](fixtures.mjs) | the Supabase project, the saved state of the phone, the realtime socket |
| [collector.mjs](collector.mjs) | what counts as a failure; the console allow-list |
| [server.mjs](server.mjs) | a static server with single-page-app fallback, on a free port |
