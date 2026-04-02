import assert from "node:assert/strict";

import {
  getDownloadUrl,
  type LatestApkMetadata,
  validateApkAvailability,
} from "./native-apk-flow";

function buildMetadata(overrides?: Partial<LatestApkMetadata>): LatestApkMetadata {
  return {
    versionName: "2.6.28",
    versionCode: 20628,
    buildId: "android-2.6.28",
    fileName: "nexora-v2.6.28.apk",
    fileSizeBytes: 96 * 1024 * 1024,
    fileSizeLabel: "96 MB",
    contentType: "application/vnd.android.package-archive",
    downloadUrl: "https://example.com/downloads/apk/nexora-v2.6.28.apk",
    changelog: ["Native update"],
    checksumSha256: "abc",
    signature: null,
    ...overrides,
  };
}

async function testValidApk() {
  const originalFetch = global.fetch;
  global.fetch = (async () => {
    return {
      ok: true,
      status: 200,
      headers: {
        get(name: string) {
          if (name.toLowerCase() === "content-type") return "application/vnd.android.package-archive";
          if (name.toLowerCase() === "content-length") return String(96 * 1024 * 1024);
          return null;
        },
      },
    } as any;
  }) as any;

  const metadata = buildMetadata();
  const validation = await validateApkAvailability(metadata);
  const downloadUrl = getDownloadUrl(metadata, validation);
  assert.equal(validation.ok, true);
  assert.equal(typeof downloadUrl, "string");

  global.fetch = originalFetch;
}

async function testMissingApkUrl() {
  const metadata = buildMetadata({ downloadUrl: "https://example.com/api/some-json-endpoint" });
  const validation = await validateApkAvailability(metadata);
  assert.equal(validation.ok, false);
  assert.match(String(validation.reason), /file endpoint/i);
}

async function testBadConnection() {
  const originalFetch = global.fetch;
  global.fetch = (async () => {
    throw new Error("network down");
  }) as any;

  const metadata = buildMetadata();
  const validation = await validateApkAvailability(metadata);
  assert.equal(validation.ok, false);
  assert.match(String(validation.reason), /unreachable/i);

  global.fetch = originalFetch;
}

async function testFileTooLarge() {
  const metadata = buildMetadata({ fileSizeBytes: 800 * 1024 * 1024, fileSizeLabel: "800 MB" });
  const validation = await validateApkAvailability(metadata);
  assert.equal(validation.ok, false);
  assert.match(String(validation.reason), /too large/i);
}

async function run() {
  await testValidApk();
  await testMissingApkUrl();
  await testBadConnection();
  await testFileTooLarge();
  console.log("update service tests: all scenarios passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
