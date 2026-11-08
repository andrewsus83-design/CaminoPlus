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

- the tab bar shows Me, Stays, Maps, Discover and Library, and each tab opens;
- the gear on Me opens `/settings` (no tab bar there) and Back returns to `/me`, also when Settings was opened from a link;
- switching light/dark on Settings returns to Settings, and Back goes to Me;
- Library: its top row is a search field and the Bookmarks button (no title, no diary button); directly under it, before any banner, the two tabs
  Bible and Books, in that order, and no Notes tab and no gold pen; Bible and Books each have a banner, Books has the Preview notice (its twelve books
  are examples), Bible has none (its text is real); the Books tab lists twelve books marked Free and Soon and shows nothing that is only data (links,
  licence notes, groups); the banner of the Bible tab (the whole card and its "Read today" button) opens `/library/daily`; a search lists what it
  finds in Bible, Books and Verses (and says "Nothing found for ..." with a way back); the Bookmarks button opens `/library/bookmarks` with the
  bookmarked rows of both tabs, a verse and the bookmarked post (the full account has one bookmarked post); bookmarks kept before the tabs changed (a
  Music row, the old example rows, `notes:` keys, the two Bible rows that were taken out) or kept for a verse that is not in the text are ignored
  without an error;
- Bible ([bible.scenarios.mjs](bible.scenarios.mjs), the same walks on the real text): the daily banner is compact (at most 120 high at 390
  wide, 140 at 320) and is one button; the three parts (Old Testament, Deuterocanon, New Testament) are a segmented control under the banner
  that scrolls with the page, and each shows its books as three square tiles in a row; all 73 book names fit their tile at 320, 390 and 430, the
  short ones at 22 or more on a phone of 390 and every one at 15 or more from 390 up (the two Thessalonians 14); a Chromium that hints the glyphs (CI's does)
  lays a name wider than one that does not, so the fit counts every letter rounded up to a pixel (tried with --font-render-hinting set to none, slight, medium and full);
  a tile opens the numbers of the chapters, a number opens the words, and Previous and Next name where they go, cross the books and the
  parts (Malachi 4 to Tobit 1) and are disabled at Genesis 1 and Revelation 22; prose is paragraphs, a psalm is stanzas, and the end of a
  chapter has the credit and says it is not the translation read at Mass; a touch chooses a verse and raises Bookmark, Copy and Share, a
  bookmarked verse is listed on Bookmarks and opens the reader at it; the three actions are big (a glyph of 30, a word of 16 in Inter
  SemiBold, each at least 88 by 68, the reference 17) at 320, 390 and 430 wide, the bar clears the bottom edge, and a verse touched low on a
  short phone (568 high) is brought above the bar; a link to a verse (`?v=105`) opens the chapter with that verse chosen,
  and an address that leads nowhere is a calm "Not found"; the search finds verses after the keystroke (typing is never blocked), marks the
  match and offers "Go to" for a typed reference; "Continue reading" shows only when something was read, reopens that chapter and is ignored
  when the place kept no longer exists;
- Me: the strip is Notes, Journey, Plan, Health, in that order, and Me opens on Journey with its one gold pen, "Write a journey post"; at 320 px
  wide the four labels are one row, each on one line, none clipped; Notes is the first sub-tab: it shows the feed ("Notes stay on this phone.",
  "No notes yet" for the new account) with one gold pen, "Write a note", and not the journey pen; Plan and Health have no pen; Journey has its
  own again; the note pen opens `/diary/new`, and a note written there is in the feed after Back;
- Stays lists the stays of the stage and one opens with its details;
- logging out from Settings lands on Welcome;
- launching the app lands on Welcome (signed out), Onboarding (signed in, no journey) or Me;
- with an expired login the session is renewed online; offline the account saved on the phone opens on Me and says it is offline,
  and with an expired login (also with nothing saved: "No signal right now") the app does not wait for the network.

The diary screens, the Notes feed (the first sub-tab of Me) and the daily reading belong to their own features: they are swept (they must load
without errors), and the scenarios only check where the pen and the banner lead, that Notes is the first sub-tab and that a note written there
shows up, never what those screens contain. The Bible screens are the Bible feature's own, and they run on the real text (Psalm 121, John 1,
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
npm run smoke                      # about 3 minutes: about 375 checks at the time of writing, 4 pages at a time
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
| [bible.scenarios.mjs](bible.scenarios.mjs) | the walks of the Bible tab and the reader (kept apart so the other walks stay short) |
| [fixtures.mjs](fixtures.mjs) | the Supabase project, the saved state of the phone, the realtime socket |
| [collector.mjs](collector.mjs) | what counts as a failure; the console allow-list |
| [server.mjs](server.mjs) | a static server with single-page-app fallback, on a free port |
