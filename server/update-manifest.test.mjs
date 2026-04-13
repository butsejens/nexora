import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { buildUpdateManifestResponse } from "./update-manifest.js";

const root = process.cwd();
const manifestPath = join(root, "server", "update-manifest.json");
const downloadsDir = join(root, "server", "public", "downloads");
const testApk = join(downloadsDir, "nexora-test.apk");

const originalManifest = readFileSync(manifestPath, "utf8");

function fakeReq() {
  return {
    headers: { "x-forwarded-proto": "https", "x-forwarded-host": "nexora-api-8xxb.onrender.com" },
    protocol: "https",
    get(name) {
      if (name.toLowerCase() === "host") return "nexora-api-8xxb.onrender.com";
      return "";
    },
  };
}

function writeManifest(next) {
  writeFileSync(manifestPath, JSON.stringify(next, null, 2));
}

function loadManifest() {
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

function cleanup() {
  writeFileSync(manifestPath, originalManifest);
  if (existsSync(testApk)) unlinkSync(testApk);
}

try {
  mkdirSync(downloadsDir, { recursive: true });

  const base = loadManifest();

  if (existsSync(testApk)) unlinkSync(testApk);
  writeManifest({
    ...base,
    native: {
      ...base.native,
      version: "2.6.28",
      apk: { ...base.native.apk, url: null, fileName: null, fileSizeBytes: 0 },
    },
  });

  const missing = buildUpdateManifestResponse(fakeReq());
  assert.equal(missing.native.apk.available, false);

  writeManifest({
    ...base,
    native: {
      ...base.native,
      apk: { ...base.native.apk, url: "/api/app-updates/native" },
    },
  });

  const wrongUrl = buildUpdateManifestResponse(fakeReq());
  assert.equal(wrongUrl.native.apk.available, false);
  assert.match(String(wrongUrl.native.apk.unavailableReason || ""), /not a file endpoint/i);

  writeFileSync(testApk, Buffer.alloc(2 * 1024 * 1024, 1));
  writeManifest({
    ...base,
    native: {
      ...base.native,
      apk: { ...base.native.apk, url: null, fileName: null, fileSizeBytes: 0 },
    },
  });

  const valid = buildUpdateManifestResponse(fakeReq());
  assert.equal(valid.native.apk.available, true);
  assert.match(String(valid.native.apk.downloadUrl || ""), /\/downloads\/apk\/nexora-test\.apk/i);
  assert.equal(valid.native.apk.contentType, "application/vnd.android.package-archive");
  assert.equal(Number(valid.native.apk.fileSizeBytes) > 0, true);

  console.log("update manifest tests: all scenarios passed");
} finally {
  cleanup();
}
