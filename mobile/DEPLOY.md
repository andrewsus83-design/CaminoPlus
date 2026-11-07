# From a merge to a phone

What reaches users when you merge to `main`, what does not, and how to check what a phone is really running.

## What goes where

| Change | How it gets out | How long |
|---|---|---|
| Website (`web/`) and design page (`design/`) | Vercel deploys by itself on every merge to `main` | about 1 minute |
| Database (`supabase/migrations`) and edge functions | Applied to the live Supabase project (not by the merge) | when you or Claude apply them |
| The app: screens, text, images, logic (JavaScript) | An **over-the-air update** (EAS Update), published by `.github/workflows/eas-update.yml` after a green merge | a few minutes, no new build |
| The app: anything native (a new native module, permissions, the Expo SDK, the app icon or name) | A **new build** (`eas build`) and, for the stores, a release | 15 to 30 minutes plus review |

A merge never changes an app that is already installed on a phone. Only a new build or an update does.

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

1. Link the project to your Expo account, once, in this folder:

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

   Until the variable is `true` the workflow is skipped, so nothing turns red before this is set up.

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
