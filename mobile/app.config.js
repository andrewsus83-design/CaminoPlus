// app.json stays the one place for the app's settings. This file adds what is only known when the app is built:
//   1. extra.build: which commit and when. Settings > This build shows it.
//   2. Over-the-air updates, switched on by themselves once the project is linked to EAS (`eas init` puts
//      extra.eas.projectId into app.json). Before that nothing about updates changes and the app builds as before.
// How to set it up and use it: DEPLOY.md.
const { buildStamp } = require('./scripts/build-stamp');

module.exports = ({ config }, stamp = buildStamp) => {
  const projectId = config.extra && config.extra.eas && config.extra.eas.projectId;
  return {
    ...config,
    ...(projectId
      ? {
          // A phone only takes an update made for the same native code. The fingerprint changes when native code does.
          runtimeVersion: { policy: 'fingerprint' },
          updates: { ...(config.updates || {}), url: `https://u.expo.dev/${projectId}` },
        }
      : {}),
    extra: { ...(config.extra || {}), build: stamp() },
  };
};
