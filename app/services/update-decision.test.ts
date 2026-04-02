import assert from "node:assert/strict";

import {
  resolveUpdateDecision,
  type ResolveUpdateDecisionInput,
  type UpdateManifest,
} from "./update-decision";

function compareVersions(left: string, right: string): number {
  const leftParts = left.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = right.split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const diff = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

const baseManifest: UpdateManifest = {
  schemaVersion: 2,
  endpoints: {
    manifestUrl: "https://example.com/api/app-updates/manifest",
    otaUrl: "https://example.com/api/app-updates/ota",
    nativeUrl: "https://example.com/api/app-updates/native",
    apkDownloadUrl: null,
  },
  native: {
    version: "2.6.27",
    versionCode: 20627,
    buildId: "android-2.6.27",
    required: false,
    releasedAt: "2026-04-02T00:00:00.000Z",
    notes: [],
    apk: {
      available: false,
      provider: "github-releases",
      source: "missing",
      fileName: null,
      contentType: null,
      fileSizeBytes: 0,
      fileSizeLabel: null,
      versionName: null,
      versionCode: 0,
      buildId: null,
      checksumSha256: null,
      signature: null,
      downloadUrl: null,
      validatedAt: null,
      unavailableReason: null,
      fallbackMessage: "APK nog niet gepubliceerd.",
    },
  },
  ota: {
    channel: "production",
    runtimeVersion: "2.6.27",
    strategy: "expo-updates",
    releasedAt: "2026-04-02T00:00:00.000Z",
  },
  server: {
    version: "2.6.27",
    releasedAt: "2026-04-02T00:00:00.000Z",
    requiresAppUpdate: false,
    message: "Server-only deploy, geen app-update nodig.",
  },
};

function runCase(name: string, overrides: Partial<ResolveUpdateDecisionInput>, expectedKind: string) {
  const input: ResolveUpdateDecisionInput = {
    manifest: baseManifest,
    currentVersion: "2.6.27",
    currentNativeVersion: "2.6.27",
    currentRuntimeVersion: "2.6.27",
    serverChanged: false,
    otaAvailable: false,
    manifestError: null,
    compareVersions,
    ...overrides,
  };

  const result = resolveUpdateDecision(input);
  assert.equal(result.kind, expectedKind, `${name}: expected ${expectedKind}, received ${result.kind}`);
  return result;
}

const otaResult = runCase("OTA update available", { otaAvailable: true }, "ota");
assert.match(otaResult.headline, /OTA/i);

runCase(
  "APK update available",
  {
    manifest: {
      ...baseManifest,
      endpoints: { ...baseManifest.endpoints, apkDownloadUrl: "https://example.com/downloads/apk/nexora-v2.6.28.apk" },
      native: {
        ...baseManifest.native,
        version: "2.6.28",
        versionCode: 20628,
        buildId: "android-2.6.28",
        apk: {
          ...baseManifest.native.apk,
          available: true,
          source: "configured",
          contentType: "application/vnd.android.package-archive",
          fileSizeBytes: 96256000,
          fileSizeLabel: "91.8 MB",
          versionName: "2.6.28",
          versionCode: 20628,
          buildId: "android-2.6.28",
          downloadUrl: "https://example.com/downloads/apk/nexora-v2.6.28.apk",
          validatedAt: "2026-04-02T00:00:00.000Z",
        },
      },
    },
    currentNativeVersion: "2.6.27",
  },
  "apk",
);

runCase(
  "APK unavailable fallback",
  {
    manifest: {
      ...baseManifest,
      native: {
        ...baseManifest.native,
        version: "2.6.28",
      },
    },
    currentNativeVersion: "2.6.27",
  },
  "apk-unavailable",
);

runCase("No OTA update", {}, "none");

const serverOnly = runCase("Server-only update", { serverChanged: true }, "server");
assert.match(serverOnly.detail, /geen app-update nodig/i);

const networkError = runCase(
  "Bad network",
  {
    manifest: null,
    manifestError: "Netwerkfout: server niet bereikbaar",
  },
  "error",
);
assert.match(networkError.detail, /netwerkprobleem/i);

console.log("update decision tests: all scenarios passed");