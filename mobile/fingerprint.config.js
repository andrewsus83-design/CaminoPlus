// Expo's fingerprint decides whether an over-the-air update fits the native code installed on a phone (DEPLOY.md).
// Everything Expo skips by default stays skipped, and so does the `extra` section of the app config: app.config.js puts
// the build stamp (commit and time) there, which changes on every build without touching native code. If it counted,
// every build and every update would get a different fingerprint and no phone would ever accept an update.
// scripts/build-stamp.test.js fails if that ever happens again.
const fingerprint = require('@expo/fingerprint');

module.exports = {
  sourceSkips: fingerprint.DEFAULT_SOURCE_SKIPS | fingerprint.SourceSkips.ExpoConfigExtraSection,
};
