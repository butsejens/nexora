import test from "node:test";
import assert from "node:assert/strict";

import { buildCorsOptions, parseAllowedOrigins } from "./shared/cors-policy.js";

function checkOrigin(options, origin) {
  return new Promise((resolve, reject) => {
    options.origin(origin, (err, allowed) => (err ? reject(err) : resolve(allowed)));
  });
}

test("parseAllowedOrigins splits, trims and drops trailing slashes", () => {
  assert.deepEqual(parseAllowedOrigins(" https://a.app/ , https://b.app ,,"), [
    "https://a.app",
    "https://b.app",
  ]);
  assert.deepEqual(parseAllowedOrigins(undefined), []);
});

test("development without ALLOWED_ORIGIN allows every origin", () => {
  assert.equal(buildCorsOptions({ allowedOrigin: "", nodeEnv: "development" }), undefined);
});

test("production without ALLOWED_ORIGIN fails fast", () => {
  assert.throws(
    () => buildCorsOptions({ allowedOrigin: undefined, nodeEnv: "production" }),
    /ALLOWED_ORIGIN/,
  );
});

test("configured origins are allowed and others are refused without an error", async () => {
  const options = buildCorsOptions({
    allowedOrigin: "https://cinelog.app,https://www.cinelog.app",
    nodeEnv: "production",
  });
  assert.equal(await checkOrigin(options, "https://www.cinelog.app"), true);
  assert.equal(await checkOrigin(options, "https://evil.example"), false);
});

test("requests without an Origin header (native app, curl) are allowed", async () => {
  const options = buildCorsOptions({ allowedOrigin: "https://cinelog.app", nodeEnv: "production" });
  assert.equal(await checkOrigin(options, undefined), true);
});
