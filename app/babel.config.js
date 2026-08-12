module.exports = function (api) {
  api.cache(true);
  const projectRoot = __dirname;

  return {
    presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
    plugins: [
      // Keep tsconfig "paths" working at runtime (web + native)
      [
        "module-resolver",
        {
          root: [projectRoot],
          alias: {
            "@": projectRoot,
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
