module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
    plugins: [
      // Keep tsconfig "paths" working at runtime (web + native)
      [
        "module-resolver",
        {
          root: [require("path").resolve(__dirname)],
          alias: {
            "@": require("path").resolve(__dirname),
          },
          extensions: [
            ".ios.ts",
            ".android.ts",
            ".ts",
            ".ios.tsx",
            ".android.tsx",
            ".tsx",
            ".js",
            ".jsx",
            ".json",
          ],
        },
      ],
      "react-native-reanimated/plugin",
    ],
  };
};
