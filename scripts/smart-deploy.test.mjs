import assert from "node:assert/strict";
import { classifyChangedFiles, chooseRoutes } from "./smart-deploy-core.mjs";

function routeFor(files) {
  const categories = classifyChangedFiles(files);
  return chooseRoutes(categories, "auto");
}

function expectEqual(actual, expected, label) {
  assert.deepEqual(actual, expected, `${label}\nExpected: ${expected.join(",")}\nActual: ${actual.join(",")}`);
}

expectEqual(
  routeFor(["app/app/index.tsx", "app/components/Header.tsx"]),
  ["ota"],
  "Small JS/UI change should use OTA",
);

expectEqual(
  routeFor(["android/app/src/main/AndroidManifest.xml", "app/app.json"]),
  ["apk"],
  "Native change should require APK rebuild",
);

expectEqual(
  routeFor(["server/index.js", "render.yaml"]),
  ["server"],
  "Server-only change should use server deploy only",
);

expectEqual(
  routeFor(["server/index.js", "app/app/index.tsx"]),
  ["ota", "server"],
  "Mixed server+JS changes should use OTA + server",
);

console.log("All smart deploy routing tests passed.");
