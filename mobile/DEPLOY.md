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

## Release 1.2.0: the store build

**1.2.0 is the first build for the App Store and Google Play.** What is in it: [CHANGELOG.md](../CHANGELOG.md). It has new native code, so **it needs the 1.2.0 build**. An update cannot carry it.

- Sign in with Apple on iPhone (`expo-apple-authentication` and its entitlement). Setup and tests: [docs/APPLE-SIGN-IN.md](docs/APPLE-SIGN-IN.md).
- Photos are made smaller, and the place where they were taken is removed, before upload (`expo-image-manipulator`). How to check: [docs/MEDIA.md](docs/MEDIA.md).
- The brand icon and launch screen, true permission texts, unused permissions removed, iPhone only (the table below).

The native fingerprint of **release 1.2.0** is **`465f1376ea7633771b17d62fb0c15fb76f34de00`**. Release 1.1.0 had `ef37d5816b2829366ff35defbb05f59fb13c3705`. The fingerprint moved on purpose: the two new modules and the new app config each move it. The version number is not part of it.
A phone with a 1.1.0 build takes no update made for 1.2.0, and the other way round.
Builds older than 1.2.0 keep working. They show no Apple button, and they send photos as the picker gives them.

To read the fingerprint again, in `mobile/`:

```bash
node -e "require('@expo/fingerprint').createFingerprintAsync(process.cwd(),{silent:true}).then(f=>console.log(f.hash))"
```

### The checklist, in order

Do the steps in this order. Each command runs in `mobile/` unless the step says something else.

#### 1. Before the build

1. **Apple Developer Program.** You need a paid membership. Write down your **Team ID** ([developer.apple.com/account](https://developer.apple.com/account) > Membership details).
2. **The App ID.** Certificates, Identifiers & Profiles > Identifiers > `plus.camino.app`. If it is not there, make it: App IDs > App > Bundle ID Explicit `plus.camino.app`. Tick **Sign In with Apple**. Save.
3. **The Sign in with Apple key.** Keys > + > tick Sign in with Apple > Primary App ID `plus.camino.app` > Register. Download the `.p8` file (only once). Write down the **Key ID**. Keep the file in your password manager, never in the repository or a chat.
4. **Supabase, the Apple provider.** Dashboard > Authentication > Sign In / Providers > Apple. Enable it. **Client IDs** = `plus.camino.app`. Leave the **secret key empty**. Save.
5. **Supabase, the four function secrets.** Dashboard > Edge Functions > Secrets. Set these four (names here, the values are yours):
   - `APPLE_TEAM_ID`: the Team ID of step 1.
   - `APPLE_KEY_ID`: the Key ID of step 3.
   - `APPLE_PRIVATE_KEY`: the whole `.p8` file, with the `BEGIN` and `END` lines.
   - `APPLE_BUNDLE_ID`: `plus.camino.app`.
6. **Supabase, the table and the functions.** When you agree, apply the migration `supabase/migrations/20261114020100_apple_sign_in_tokens.sql` (it is not applied yet). Then deploy the two functions, from the root of the repository:

   ```bash
   supabase functions deploy apple-link
   ```

   ```bash
   supabase functions deploy delete-account
   ```

7. **App Store Connect.** Make the app with the bundle identifier `plus.camino.app`.
8. **EAS.** Sign in once:

   ```bash
   npx eas-cli login
   ```

   The first iOS build asks for your Apple account. It makes the certificate and the profile itself. When it asks to sync capabilities or to make a new profile, say **yes** (Sign in with Apple needs it). To see what EAS keeps:

   ```bash
   npx eas-cli credentials
   ```

9. **Your iPhone, for a test build.** Register it once:

   ```bash
   npx eas-cli device:create
   ```

10. **Google Play (only for Android).** A Google Play developer account, the app made in Play Console with the package name `plus.camino.app`, and a service account with a JSON key ([docs.expo.dev/submit/android](https://docs.expo.dev/submit/android/)). The key stays on your computer or in EAS, never in this repository.

Without the secrets of step 5, Sign in with Apple still works, but deleting an account cannot revoke the sign-in at Apple. So finish steps 4 to 6 before App Review.

#### 2. The commands

1. Get the newest `main` and install:

   ```bash
   git pull
   ```

   ```bash
   npm ci
   ```

2. Check the fingerprint. It must be `465f1376ea7633771b17d62fb0c15fb76f34de00` (or newer if native code changed after this release):

   ```bash
   node -e "require('@expo/fingerprint').createFingerprintAsync(process.cwd(),{silent:true}).then(f=>console.log(f.hash))"
   ```

3. Optional, with no Apple account: prove that the iOS project compiles (a Simulator build is not signed):

   ```bash
   npx eas-cli build --platform ios --profile development-simulator
   ```

4. Make the test build for your iPhone:

   ```bash
   npx eas-cli build --profile preview --platform ios
   ```

   And for Android (an APK):

   ```bash
   npx eas-cli build --profile preview --platform android
   ```

5. Open the link that EAS prints. Install the build on the phone.

#### 3. Test on a real iPhone

Nobody has done these on a phone yet. Do all of them on the preview build of step 2.

1. **Settings > This build** says `CaminoPlus 1.2.0` and the commit you built.
2. **The icon.** The home screen shows the shell on blue, not the Expo icon.
3. **The launch screen.** Opening the app shows a parchment screen with the blue circle and the gold shell. Not a white screen.
4. **Sign in with Apple.** Signed out, Welcome shows **Continue with Apple** above Continue with Google, the same size. Tap it.
5. **Hide my email.** In Apple's sheet choose **Hide My Email**. You land in onboarding with your Apple name, not the relay name.
6. **Sign out, sign in again** with Apple. The same account opens. Your name stays.
7. **Before 8 and 9: cloud storage.** Today a Free account has no cloud storage. This build does not switch it on. On such an account the app says "Cloud storage is switched off for now. Photos and videos cannot be saved yet." That is the right answer, not a bug. For steps 8 and 9 use an account that has storage (set for testing in the database), or wait for the storage plan change.
8. **A photo post.** Write a journey post with a large photo. Share it. In Supabase > Storage > `user-media` the photo is at most 1,280 px on its long side (3,840 px on Pilgrim Plus), with a `-thumb.jpg` next to it. Download it: it has no location.
9. **A video post.** Add a short clip filmed with location on. Share it. Download it from Storage: it plays and has no location. A clip over 60 seconds is refused with a message.
10. **The permission texts.** The first time Maps asks for the location, the text is the one of `locationWhenInUsePermission` in `app.json`. Phone Settings > CaminoPlus shows Location and Photos, no Camera, no Microphone, no Motion.
11. **Delete account.** Me > gear > Settings > Account > Delete account. Then iPhone Settings > your name > Sign-In & Security > Sign in with Apple: CaminoPlus is gone from the list.

On Android, look at the icon (and a one-colour shell with themed icons on Android 13 or newer), the launch screen, the photo and video post, and Settings > Apps > CaminoPlus > Permissions (Location only). Android has no Apple button.

More checks, if you have time: [docs/APPLE-SIGN-IN.md](docs/APPLE-SIGN-IN.md) "Test it on a phone" and [docs/MEDIA.md](docs/MEDIA.md) "How to test on a phone".

#### 4. Then submit

1. Make the store builds. The build number goes up by itself.

   ```bash
   npx eas-cli build --profile production --platform ios
   ```

   ```bash
   npx eas-cli build --profile production --platform android
   ```

2. Android: check the bundle before it goes up ("The first Android bundle", below).
3. Send them:

   ```bash
   npx eas-cli submit --profile production --platform ios
   ```

   ```bash
   npx eas-cli submit --profile production --platform android
   ```

   If iOS asks for the app's numeric Apple ID (App Store Connect > the app > App Information), it can go in `eas.json` as `submit.production.ios.ascAppId`. A first Android submission lands on the internal testing track.
4. **The privacy manifest.** Apple reads `PrivacyInfo.xcprivacy`, which is made when the pods are installed on the build machine. Nobody has seen ours yet. If you have a Mac, look at it once after `npx expo prebuild` and `pod install` in a scratch copy. If Apple's email after the upload lists a missing reason, add `ios.privacyManifests` to `app.json` with that reason, and build again.
5. In the review notes you may write: "Sign in with Apple is on the Welcome, Sign in and Create account screens. Deleting the account (Settings > Account > Delete account) also revokes the Sign in with Apple token."

A personal Google Play developer account made after 13 November 2023 must run a closed test with at least 12 testers, for at least 14 days, before it can ask for production access (Google's rule, [support.google.com/googleplay/android-developer/answer/14151465](https://support.google.com/googleplay/android-developer/answer/14151465)). The listing, the Data safety form and the review notes are not part of this build.

`eas.json` has no `submit` details on purpose: an id made up to fill the file would send a build to the wrong place.

### What changed natively, and why

| Part | In 1.1.0 | In 1.2.0 | Why |
|---|---|---|---|
| Sign in with Apple | None | `expo-apple-authentication`, iOS only, and the entitlement `com.apple.developer.applesignin` | The app offers Google sign-in, so the App Store asks for Apple too (Guideline 4.8). |
| Photo resizing | None | `expo-image-manipulator` (it brings `expo-image-loader` on Android) | Photos are made smaller and saved again before upload. That also removes their location. |
| iOS app icon (`assets/icon.png`) | The blue chevron of the Expo template | The brand shell on Atlantic Blue, 1024 x 1024, no alpha channel, square corners | A template icon is a review risk. App Store Connect refuses an icon with transparency, and iOS rounds the corners itself. |
| Android icon (`assets/android-icon-*.png`) | The template | An adaptive icon: the shell in front, a blue layer behind, and a one-colour shell for Android 13 themed icons. The art stays inside the safe circle (66 dp of 108). | The launcher cuts the icon to its own shape and keeps only the middle. |
| Launch screen | White, no picture | The shell in its blue circle (the picture is 200 wide, the circle in it about 117) on parchment (`#F6EFE2`, the colour of `role.bg`). On Android, when the phone is in dark mode, the page colour of dark mode (`#0F1A2B`). | The first thing a person sees. The iPhone has no dark launch screen: the app is pinned to light (`userInterfaceStyle`), so it would never show. |
| Play Store icon | None | `brand/store/play-store-icon-512.png`, not in the app | Play Console asks for a 512 x 512 PNG with alpha. |
| Devices | iPhone and iPad | iPhone only (`supportsTablet: false`) | The layouts are phone layouts, stretched on an iPad. People with an iPad can still install the app and use it in an iPhone-size window. To offer a real iPad version later, set it back to `true` after the screens have been looked at on an iPad. |
| iOS permission texts | Generic ("Allow CaminoPlus to access your location", camera, microphone, motion) | The location texts say what the app does (the map, the distance, what is near, the place of a diary page, the help bell) and that it never tracks in the background. No microphone key, no motion key. The camera key says CaminoPlus does not use the camera. | Apple asks for accurate purpose strings. The texts are in `app.json` and pinned by `tools/tests/test_store_config.py`. |
| Android permissions | CAMERA, RECORD_AUDIO, SYSTEM_ALERT_WINDOW, VIBRATE, READ_EXTERNAL_STORAGE and WRITE_EXTERNAL_STORAGE came in from the template and from libraries | All six are blocked in `app.json` (`blockedPermissions`, and the plugins' own switches), so no library can bring them back. Left: location, internet, and the state of the network and of Wi-Fi. | Nothing in the app uses them. People see the list when they install. |
| Location on Android | Two services of expo-location, declared with `foregroundServiceType="location"` | Removed from the merged manifest, and GPS is declared as wanted, not required (`plugins/withStoreManifest.js`) | The app never tracks in the background. Those services bring Google Play's foreground-service questions with them. Without the GPS line, Google Play hides the app from tablets without GPS. |
| Auto Backup (Android) | On | Off (`allowBackup: false`) | It would copy the diary on the phone to the cloud and put it on another phone, where the keys of `expo-secure-store` do not exist. The price: a new phone starts without the diary pages that were never published (what was published is in the cloud). |
| Android build | The EAS default | `production` builds an app bundle (`app-bundle`), `preview` stays an APK | Google Play takes bundles. |

A known small thing: on Android the launch screen follows the phone's dark mode (`values-night`), even when the person chose light in the app. It is shown for a moment only, so it stays as it is.

### What depends on what

- **The storage permissions and the photo picker.** READ_EXTERNAL_STORAGE and WRITE_EXTERNAL_STORAGE can only be blocked when no screen asks for the media-library permission. Before 1.2.0 three places did (`app/write.tsx`, `src/features/social/pick.ts`, `src/lib/avatar.ts`). On Android 12 and older, with the permission removed, that question is answered "no" and the picker never opens. The picker itself needs no permission (it is the system's photo picker). The media change of 1.2.0 deleted those three questions, so both changes are in the same build. `tools/tests/test_store_config.py` allows no file to ask again.
- **The camera.** CAMERA is blocked on Android. On iOS the camera key stays (with its true text) because the picker library contains a camera permission helper that the app never calls, and App Store Connect reads the binary, not the code that runs: it asks for a purpose string for every protected API a library mentions. If the store build is still refused with "Missing Purpose String" for another key (for example `NSMicrophoneUsageDescription`), add that key with a true text as a plugin option in `app.json` and build again with a new build number.
- **Photos.** `NSPhotoLibraryUsageDescription` stays, for the same reason.
- **A new feature that uses the camera, the microphone or the background** has to change `app.json` first. The tests fail until it does.

### See it before a store sees it

On a scratch copy of what is committed, never in the repository: `ios/` and `android/` are generated and are not committed.

```bash
mkdir /tmp/store-check && git archive HEAD mobile | tar -x -C /tmp/store-check && cd /tmp/store-check/mobile
npm ci
npx expo prebuild --no-install --clean
grep -A1 UsageDescription ios/CaminoPlus/Info.plist                    # no microphone, no motion; the location texts; the camera text
grep TARGETED_DEVICE_FAMILY ios/CaminoPlus.xcodeproj/project.pbxproj   # "1" (iPhone only)
grep -A3 applesignin ios/CaminoPlus/CaminoPlus.entitlements            # Sign in with Apple
grep -E "uses-permission|uses-feature|allowBackup|<service" android/app/src/main/AndroidManifest.xml
npx expo-doctor                                                         # every check passes
```

The simulator build of step 2.3 builds the development client in the Debug configuration, so it shows a compile error in the native code now and not on the day of the store build. The Release configuration (optimised, and the one that removes the dev launcher's local-network keys) is first built by the production build.

### The first Android bundle: check it before it goes up

Nobody has run these on a real bundle yet. You need `bundletool` (the jar from Google's GitHub releases), `zipalign` from Android build-tools 35 or newer, and `objdump`. Download the `.aab` from the page of the build on expo.dev.

```bash
# 1. The bundle is well formed, and the manifest in it is the one you expect
java -jar bundletool.jar validate --bundle=app.aab
java -jar bundletool.jar dump manifest --bundle=app.aab | grep -E "uses-permission|uses-feature|allowBackup|targetSdkVersion|foregroundServiceType"
#    Expected: location, internet, and the state of the network and of Wi-Fi (and AndroidX's own DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION, which
#    every app has). No CAMERA, RECORD_AUDIO, SYSTEM_ALERT_WINDOW, VIBRATE, READ/WRITE_EXTERNAL_STORAGE, FOREGROUND_SERVICE*. allowBackup false.
#    targetSdkVersion 36. The GPS feature with required false. No foregroundServiceType.

# 2. A universal APK made from the bundle, for the next two checks
java -jar bundletool.jar build-apks --bundle=app.aab --mode=universal --output=app.apks
unzip -o app.apks universal.apk -d check

# 3. Native libraries aligned for 16 KB memory pages (Google requires it now for apps that target Android 15 or newer, so for the first upload)
zipalign -c -P 16 -v 4 check/universal.apk

# 4. And inside each 64-bit library: a line is printed only for a library with a segment smaller than 16 KB (align 2**13 and below)
unzip -o check/universal.apk 'lib/arm64-v8a/*.so' 'lib/x86_64/*.so' -d check/libs
for f in check/libs/lib/*/*.so; do objdump -p "$f" | grep -q 'LOAD.*align 2\*\*1[0-3]' && echo "not 16 KB: $f"; done
```

The two 32-bit ABIs (`armeabi-v7a`, `x86`) may stay at 4 KB: the rule is for 64-bit libraries. Check 4 prints nothing when all is well. Google's page: [developer.android.com/guide/practices/page-sizes](https://developer.android.com/guide/practices/page-sizes).

## Release 1.1.0: what to build and how to see it

What is in the release: [CHANGELOG.md](../CHANGELOG.md). It changes the app's JavaScript and assets (and, around the app, data, tools and documents), with no new native module, permission or icon, so **the native fingerprint did not move:
`ef37d5816b2829366ff35defbb05f59fb13c3705`**. It is the same at pull request #85 (the one that made the fingerprint ignore the npm scripts), at the Library v2 merge (#88) and at release 1.1.0 (release 1.2.0 moved it on purpose, see above), and the version
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
