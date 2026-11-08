// Expo's fingerprint decides whether an over-the-air update fits the native code installed on a phone (DEPLOY.md).
// Everything Expo skips by default stays skipped, and so do two more things that change without touching native code:
//  - the `extra` section of the app config: app.config.js puts the build stamp (commit and time) there, which changes
//    on every build. If it counted, every build and every update would get a different fingerprint and no phone would
//    ever accept an update.
//  - the npm scripts of package.json. Expo hashes them (the source `packageJson:scripts`), so every pull request that
//    registers a test script, which is most of them, moved the fingerprint with no native change at all, and a phone
//    would not have taken an update made after it. The scripts have no hook that runs on install or build (no
//    postinstall, prebuild or eas-build-*), so a script cannot change native code here; scripts/build-stamp.test.js
//    fails if such a hook is added, because then this skip has to be decided again.
// scripts/build-stamp.test.js also fails if either of the two starts to count again.
const fingerprint = require('@expo/fingerprint');

module.exports = {
  sourceSkips:
    fingerprint.DEFAULT_SOURCE_SKIPS |
    fingerprint.SourceSkips.ExpoConfigExtraSection |
    fingerprint.SourceSkips.PackageJsonScriptsAll,
};
