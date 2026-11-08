# From a merge to a phone

What reaches users when you merge to `main`, what does not, and how to check what a phone is really running.

## What goes where

| Change | How it gets out | How long |
|---|---|---|
| Website (`web/`) and design page (`design/`) | Vercel deploys by itself on every merge to `main` | about 1 minute |
| Database (`supabase/migrations`) and edge functions | Applied to the live Supabase project (not by the merge) | when you or Claude apply them |
| The app: screens, text, images, logic (JavaScript) | An **over-the-air update** (EAS Update), published by `.github/workflows/eas-update.yml` after a green merge, **once it is switched on** (step 3 of the setup below; today it is not) | a few minutes, no new build |
| The app: anything native (a new native module, permissions, the Expo SDK, the app icon or name) | A **new build** (`eas build`) and, for the stores, a release | 15 to 30 minutes plus review |

A merge never changes an app that is already installed on a phone. Only a new build or an update does.

## Release 1.1.0: what to build and how to see it

What is in the release: [CHANGELOG.md](../CHANGELOG.md). It changes the app's JavaScript and assets (and, around the app, data, tools and documents), with no new native module, permission or icon, so **the native fingerprint did not move:
`ef37d5816b2829366ff35defbb05f59fb13c3705`**. It is the same at pull request #85 (the one that made the fingerprint ignore the npm scripts), at the Library v2 merge (#88) and on `main` now, and the version
number is not part of it. To read it again, in `mobile/`:

```bash
node -e "require('@expo/fingerprint').createFingerprintAsync(process.cwd(),{silent:true}).then(f=>console.log(f.hash))"
```

| You have | What to do | Why |
|---|---|---|
| A development build made from `main` at or after #85 | **No build.** On the computer, in `mobile/`: `git pull`, then `npx expo start -c --dev-client`; open the app on the phone and connect it to the computer. | A development build takes its JavaScript from Metro, and nothing native changed. `-c` clears Metro's cache so the bundle is made again from what you just pulled. |
| A preview build (the one for testers) | **One new build** from an up-to-date `main` (`git pull` first): `npx eas-cli build --profile preview --platform android` (or `ios`). | A preview build runs the JavaScript it was built with, and **updates are off**: `eas-update` needs the secret `EXPO_TOKEN` and the variable `EAS_UPDATE_ENABLED` = `true` ("Still to do by the owner", below). The runs after the latest merges to `main` all show `skipped`, so a merge reaches no phone by itself yet. |
| A build made before the map (MapLibre) was added: the Maps tab shows a red "Preview map. The real map needs the dev build." | **Build again**: `npx eas-cli build --profile development --platform android` (or `npm run build:dev:android`; iOS: `npm run build:dev:ios`). | That build has no MapLibre inside, and an update cannot add native code. |

Not sure when a build was made? Build again: it costs one build and removes the doubt. A build made before #85 worked out its fingerprint with the old rules and never matches (see below).

No migration and no edge function changed since the Library v2 merge, so there is nothing to apply to the database for this release (the places of stage 3 were loaded separately: CHANGELOG, "Data").

### The builds (the profiles of `eas.json`)

Run these in `mobile/`, after `git pull` on `main`, signed in with `npx eas-cli login`. When a build is done, EAS prints the link of its page on expo.dev; for `development` and `preview` (internal distribution) that page has the link and the QR code to install it on a phone.

| Profile | Command | What it is | Notes |
|---|---|---|---|
| `development` | `npx eas-cli build --profile development --platform android` (or `ios`); the same as `npm run build:dev:android` and `npm run build:dev:ios` | The developer build: the dev client and MapLibre inside, its JavaScript comes from Metro on a computer, not from updates. Channel `development`. | Android installs an APK from the link. iOS needs an Apple Developer account and your iPhone registered first: `npx eas-cli device:create`. |
| `development-simulator` | `npx eas-cli build --profile development-simulator --platform ios` | The same as `development`, for the iOS Simulator on a Mac. | No device to register. |
| `preview` | `npx eas-cli build --profile preview --platform android` (an APK) or `ios` | The testers' build: it carries the JavaScript it was built with, channel `preview`, and takes updates once they are switched on (see "Still to do by the owner"). | iOS needs registered devices, as above. |
| `production` | `npx eas-cli build --profile production --platform ios` (or `android`), then `npx eas-cli submit --profile production` | The store build: channel `production`, and its build number goes up by itself (`autoIncrement`). | Not needed to look at 1.1.0. This repository does not say whether the store accounts, listings and review are ready. |

After any of them, open Settings > This build on the phone (next section) and check the commit.

### Reading Settings > This build

Me > the gear at the top right > Settings > This build. Tap the card to copy its text for a bug report (the copy adds a line `Platform: ios` or `android`). Three lines:

| Line | It says | It means |
|---|---|---|
| Version | `CaminoPlus 1.1.0` | The `version` of `mobile/app.json`: the release. Every build of the release says the same, so the version tells you which release, not which build. |
| Code | `Build 3f9a1c2 · committed 8 Nov 2026, 14:05 UTC` | The commit the JavaScript was made from (its first 7 letters) and when it was committed, always in UTC. In a development session it is the commit of the computer's checkout, so after `git pull` and a restart of Metro it moves. |
| | `Build 3f9a1c2 + local changes` | Development session only: the checkout has changes that are not committed. |
| | `Build 3f9a1c2 · built 8 Nov 2026, 14:20 UTC` | A build made by EAS or by CI: they pass the commit (`EAS_BUILD_GIT_COMMIT_HASH`, `GITHUB_SHA`) but not its time, so the time of the build is shown. |
| | `Build: commit unknown` | There was no git folder and nobody gave a commit. A commit is never made up. |
| Update | `Updates: off in this build` | A development build, a build made before updates existed, or a build without the project id (see "What is this phone running?" below). |
| | `Update: none yet, this is the installed version · channel preview` | Updates are on and nothing newer was downloaded. |
| | `Update a1b2c3d4 · channel preview` | An update is running: the first 8 letters of its id, and the channel it came from. |

To check that a phone runs the code you expect, compare the 7 letters of the Code line with `git rev-parse --short=7 origin/main` after `git fetch` (or with the newest commit of `main` on GitHub): they must be the same for a build made from `main` just now.

### What to look at in 1.1.0

Once the build runs and the Code line says the commit you expect, these are the changes to look for. They are what the unit tests and the web export show; **nobody has looked at them on a phone yet**, so what you see there is news (CHANGELOG, "Not checked on a device").

| Where | What you should see |
|---|---|
| Every screen with a Back | The same round Back button at the top left (48 by 48), also in the Bible and Books readers (#100) |
| Tab bar | Inactive tabs thin and quiet, the active one heavier (heavier still in light mode); a darker bar with a hairline in dark mode (#91, #93, #97, #100) |
| Me | The gear alone at the top right; one gold chat button at the bottom right of all four sub-tabs, with the unread badge (#99) |
| Me > Journey | "All" is the first item of the highlights row: a tap shows stamps for the places of the route, and **4 of them, not 34**, until stages 4 to 33 are published (#106); the first tile of the grid is the "Write a journey post" card (#99) |
| Me > Notes | One "Write a note" card; a new note is a Draft until you press Publish, with the marks inside the text box and Read and Publish in one row at the bottom (#99, #104) |
| Library | Two tabs, Bible and Books. Bible: two book tiles to a row (#102). Books: 26 covers (#98). After you read something, a "Continue reading" bar with an X above the tab bar (#101) |
| Daily reading (the banner of the Bible tab) | A 7-day strip, the liturgical day, and readings and a reflection that say they are samples (#96) |
| Maps > Whole route, Near me | The route line follows the real path from Saint-Jean-Pied-de-Port to Pamplona; the Walk view names a turn about once in 1 to 2 km; after Pamplona the line is still straight between towns (#103) |
| Settings > This build | `CaminoPlus 1.1.0` and the commit of the build |

### Still to do by the owner

Two things only the owner can do, in the GitHub settings of the repository (and, for the token, on expo.dev). Neither is done yet; until they are, the app works as described above, without these two features.

| What | To do | Until then |
|---|---|---|
| **Offline map packs** | Settings > Environments > New environment `pack-publish`; limit its deployment branches to `main`; put the secrets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` into **that environment** (not into the repository secrets). Then Actions > offline-maps > Run workflow: branch `main`, tick `publish`, `stages` = `camino-frances-01`, and check that `offline_packs` has one current row. The whole sequence: [tools/offline-maps/README.md](../tools/offline-maps/README.md#first-publish-step-by-step). | `offline_packs` is empty (read on 8 November 2026) and the `offline-maps` workflow has never run, by hand or on its schedule, so no stage can be downloaded and the Offline maps screen says "Map not published yet". |
| **Updates over the air** | Settings > Secrets and variables > Actions: the secret `EXPO_TOKEN` (made at expo.dev > Account settings > Access tokens) and the variable `EAS_UPDATE_ENABLED` with the value `true`. A preview build made now already carries the update address, so it takes the updates that follow. | The `eas-update` runs after the latest merges to `main` all show `skipped`: a merge reaches no phone by itself, and every JavaScript change needs a new build. |

## How a phone knows an update fits

Every build carries the **fingerprint** of its native code (Expo computes it from the native modules, permissions and
other native settings). An update is published for the fingerprint of the code it was made from, and a phone only takes
updates with its own fingerprint. So a phone with an older build quietly does not get an update that needs newer native
code, instead of crashing on it. If "This build" (Me > the gear at the top right > Settings) says `Update: none yet` while updates exist, that phone needs a new build.

`fingerprint.config.js` tells Expo to ignore two things that change without touching native code: the build stamp (the
commit and time that `app.config.js` writes into the app), which changes on every build, and the npm scripts of
`package.json`, which Expo would otherwise hash, so that registering a test script in a pull request (most of them do)
gave every phone a different fingerprint and no update would have fitted. `npm run test:config` fails if either starts
counting again, and if `package.json` gets a script that runs on install or build (`postinstall`, `prebuild`,
`eas-build-*`), because then ignoring scripts has to be decided again. **A build made before this change** worked out its
fingerprint with the old rules: make a new build from `main` before switching updates on, or it will not match.

## One-time setup

1. Link the project to your Expo account, once, in this folder. **Done** (pull request #78): `app.json` has `extra.eas.projectId`, so every build made since then carries the update address,
   and the fingerprint is its runtime version. Another Expo account would repeat it:

   ```bash
   npx eas-cli login
   npx eas-cli init
   ```

   `init` adds `extra.eas.projectId` to `app.json`. Commit and push that change. The moment it is there,
   `app.config.js` switches updates on by itself (the update address and the fingerprint policy); nothing else to edit.
   If `init` says it cannot edit the config, add the lines it prints to `app.json` by hand.

2. Make one build that contains updates. For testers:

   ```bash
   npx eas-cli build --profile preview --platform ios
   npx eas-cli build --profile preview --platform android
   ```

   (iOS needs an Apple Developer account and your iPhone registered with `npx eas-cli device:create`.) Install it.
   The `development` profile is for developers: it loads its JavaScript from Metro on a computer, not from updates.

3. Let GitHub publish for you, in the repository settings:
   - **Settings > Secrets and variables > Actions > Secrets**: new secret `EXPO_TOKEN`, a token made at
     expo.dev > Account settings > Access tokens.
   - **Settings > Secrets and variables > Actions > Variables**: new variable `EAS_UPDATE_ENABLED` with the value `true`.

   Until the variable is `true` the workflow is skipped, so nothing turns red before this is set up. **This step is still to do**: the `eas-update` runs after the latest merges to `main` all show `skipped`.

## Every day

1. Merge to `main`. The `ci` workflow runs.
2. When `ci` is green, `eas-update` publishes to the `preview` channel.
3. On the phone, open the app. An update downloads on launch and runs the next time the app starts. To take it at once:
   **Me > the gear at the top right > This build > Check for updates**.

To publish by hand, or to the store apps (`production`): **Actions > eas-update > Run workflow**, pick the channel.
To undo a bad update, open the project on expo.dev > Updates and roll back or re-publish an earlier one.

## What is this phone running?

**Me > the gear at the top right > Settings > This build** shows the app version, the commit and its time, and the update (if any) on top of the installed
build. Tap it to copy the text for a bug report. In a development session it also says `+ local changes` when the code on
the computer has changes that are not committed.

| It says | It means |
|---|---|
| `Updates: off in this build` | A development build, a build made before updates existed, or a project not linked to EAS yet |
| `Update: none yet, this is the installed version` | Updates are on, nothing newer was downloaded: either you are current or nothing was published for this build's fingerprint |
| `Update a1b2c3d4 · channel preview` | An update is running |

## When nothing arrives

- The workflow was skipped: check the variable `EAS_UPDATE_ENABLED` and the secret `EXPO_TOKEN` (step 3).
- The build is older than the native code: the fingerprints differ. Make a new build (step 2).
- The phone and the update use different channels: a `preview` build only gets `preview` updates.
- `npm run test:config` fails: something in the app config changes on every build. Read its message.
