const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // ESLint's static resolver doesn't understand Babel's @/ alias (resolved at
    // build time by babel-plugin-module-resolver). Disable the rule to avoid
    // false positives — imports are validated by the TypeScript/Metro compilers.
    rules: {
      "import/no-unresolved": "off",
    },
  },
]);
