const baseConfig = require("./app.json");

const expo = baseConfig.expo || {};
const DEFAULT_ADMOB_ANDROID_APP_ID = "ca-app-pub-3940256099942544~3347511713";
const DEFAULT_ADMOB_IOS_APP_ID = "ca-app-pub-3940256099942544~1458002511";
const basePlugins = Array.isArray(expo.plugins) ? expo.plugins : [];
const pluginsWithoutAdmob = basePlugins.filter((plugin) => {
  if (typeof plugin === "string") return plugin !== "react-native-google-mobile-ads";
  if (Array.isArray(plugin)) return plugin[0] !== "react-native-google-mobile-ads";
  return true;
});

module.exports = () => ({
  ...expo,
  owner: expo.owner || "butsejens",
  plugins: [
    ...pluginsWithoutAdmob,
    [
      "react-native-google-mobile-ads",
      {
        androidAppId: process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID || DEFAULT_ADMOB_ANDROID_APP_ID,
        iosAppId: process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID || DEFAULT_ADMOB_IOS_APP_ID,
      },
    ],
  ],
});