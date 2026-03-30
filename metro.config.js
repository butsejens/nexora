/**
 * Monorepo root Metro config — used by expo-updates when building Android APK.
 *
 * The expo-updates Gradle plugin determines projectRoot as:
 *   project.rootProject.projectDir.parentFile  =>  nexora/android/../  =>  nexora/
 *
 * findUpProjectRoot(nexora/) finds nexora/package.json and returns nexora/ as
 * the project root, so Metro loads THIS file instead of app/metro.config.js.
 *
 * We delegate to the app workspace config so that:
 *  - The @/ alias resolves to nexora/app/ (not nexora/)
 *  - hashAssetFiles and all other Expo Metro plugins are correctly configured
 */
module.exports = require("./app/metro.config");
