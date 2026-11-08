// Two edits to the Android manifest that app.json cannot say, for the store build (DEPLOY.md, "Release 1.2.0: the store build").
//
//  1. <uses-feature android:name="android.hardware.location.gps" android:required="false"/>
//     The location permission makes Google Play treat a GPS chip as required, and then it hides the app from phones and tablets without
//     one. The app works without a position (diary, library, maps by hand), so GPS is wanted, not required.
//  2. The two services of expo-location that only tracking in the background starts (LocationTaskService and LocationForegroundService),
//     each declared with foregroundServiceType="location", are removed from the merged manifest (tools:node="remove"). The app never
//     tracks in the background and has no task manager; a service declared with that type brings Google Play's foreground-service
//     questions with it and has no permission to start (app.json leaves FOREGROUND_SERVICE_LOCATION out on purpose).
//
// Plain JavaScript, no dependency: the only things it imports come with Expo. tools/tests/test_store_config.py checks that app.json lists it.
const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

const GPS = 'android.hardware.location.gps';
const UNUSED_SERVICES = [
  'expo.modules.location.services.LocationTaskService',
  'expo.modules.location.next.locationForegroundService.LocationForegroundService',
];
const TOOLS = 'http://schemas.android.com/tools';

// The order of the children of <manifest> as the files of Android Studio have it: features before <application>.
const ORDER = ['$', 'uses-permission', 'uses-permission-sdk-23', 'uses-feature', 'queries', 'application'];

function withStoreManifest(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    manifest.$['xmlns:tools'] = manifest.$['xmlns:tools'] || TOOLS;

    const features = manifest['uses-feature'] || [];
    if (!features.some((f) => f.$['android:name'] === GPS)) {
      features.push({ $: { 'android:name': GPS, 'android:required': 'false' } });
    }
    manifest['uses-feature'] = features;

    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    const services = application.service || [];
    for (const name of UNUSED_SERVICES) {
      if (!services.some((s) => s.$['android:name'] === name)) {
        services.push({ $: { 'android:name': name, 'tools:node': 'remove' } });
      }
    }
    application.service = services;

    const sorted = {};
    for (const key of ORDER) if (manifest[key] !== undefined) sorted[key] = manifest[key];
    for (const key of Object.keys(manifest)) if (!(key in sorted)) sorted[key] = manifest[key];
    config.modResults.manifest = sorted;
    return config;
  });
}

module.exports = withStoreManifest;
