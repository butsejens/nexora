import assert from "node:assert/strict";
import { canRelease } from "./pipeline-policy.mjs";

const uiChange = canRelease({ ciPassed: true, envPassed: true, route: "ota" });
assert.equal(uiChange.allowed, true);

const nativeChange = canRelease({ ciPassed: true, envPassed: true, route: "apk" });
assert.equal(nativeChange.allowed, true);

const serverChange = canRelease({ ciPassed: true, envPassed: true, route: "server" });
assert.equal(serverChange.allowed, true);

const mixedChange = canRelease({ ciPassed: true, envPassed: true, route: "ota+server" });
assert.equal(mixedChange.allowed, true);

const lintTypeFail = canRelease({ ciPassed: false, envPassed: true, route: "ota" });
assert.equal(lintTypeFail.allowed, false);
assert.equal(lintTypeFail.reason, "ci-failed");

const envMissing = canRelease({ ciPassed: true, envPassed: false, route: "apk" });
assert.equal(envMissing.allowed, false);
assert.equal(envMissing.reason, "env-failed");

console.log("pipeline policy tests: all scenarios passed");
