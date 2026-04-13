import assert from "node:assert/strict";
import { classify, decideRoutes } from "./decision-engine.mjs";

function decide(files, force = "auto") {
  const categories = classify(files);
  return decideRoutes(categories, force);
}

const otaCase = decide(["app/app/index.tsx", "app/components/NexoraHeader.tsx"]);
assert.equal(otaCase.route, "ota");
assert.equal(otaCase.ota, true);
assert.equal(otaCase.apk, false);
assert.equal(otaCase.server, false);

const nativeCase = decide(["android/app/build.gradle", "app/app/index.tsx"]);
assert.equal(nativeCase.route, "apk");
assert.equal(nativeCase.apk, true);
assert.equal(nativeCase.ota, false);

const serverCase = decide(["server/index.js", "server/update-manifest.js"]);
assert.equal(serverCase.route, "server");
assert.equal(serverCase.server, true);

const mixedCase = decide(["server/index.js", "app/components/NexoraHeader.tsx"]);
assert.equal(mixedCase.route, "ota+server");
assert.equal(mixedCase.ota, true);
assert.equal(mixedCase.server, true);

const mixedNativeCase = decide(["server/index.js", "ios/Podfile"]);
assert.equal(mixedNativeCase.route, "apk+server");
assert.equal(mixedNativeCase.apk, true);
assert.equal(mixedNativeCase.server, true);

const manualCase = decide(["README.md"]);
assert.equal(manualCase.route, "manual-review");

const forcedApk = decide(["server/index.js"], "apk");
assert.equal(forcedApk.route, "apk");
assert.equal(forcedApk.apk, true);

console.log("decision engine tests: all scenarios passed");
