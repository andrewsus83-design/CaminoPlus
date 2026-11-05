// Metro config: default Expo config plus .pbf so the map glyphs (SDF fonts) can be
// bundled as assets and used offline.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('pbf');

module.exports = config;
