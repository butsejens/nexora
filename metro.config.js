/**
 * Monorepo root Metro config — used by expo-updates when building the Android APK.
 *
 * The expo-updates Gradle plugin resolves the project root as
 * `android/../`, i.e. the monorepo root, so Metro loads this file rather than
 * app/metro.config.js. Delegating keeps the `@/` alias pointing at app/ and
 * keeps every Expo Metro plugin (hashAssetFiles and friends) configured.
 */
module.exports = require("./app/metro.config");
