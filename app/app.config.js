const baseConfig = require("./app.json");

const expo = baseConfig.expo || {};
const basePlugins = Array.isArray(expo.plugins) ? expo.plugins : [];
const pluginsWithoutAdmob = basePlugins.filter((plugin) => {
  if (typeof plugin === "string") return plugin !== "react-native-google-mobile-ads";
  if (Array.isArray(plugin)) return plugin[0] !== "react-native-google-mobile-ads";
  return true;
});

module.exports = () => ({
  ...expo,
  plugins: [
    ...pluginsWithoutAdmob,
    [
      "react-native-google-mobile-ads",
      {
        androidAppId: process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID || undefined,
        iosAppId: process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID || undefined,
      },
    ],
  ],
});