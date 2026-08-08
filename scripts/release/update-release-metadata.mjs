import fs from "node:fs";
import crypto from "node:crypto";

const mode = String(process.argv[2] || "").trim();
const version = String(process.argv[3] || "").trim();
const commitSha = String(process.argv[4] || "").trim();
const route = String(process.argv[5] || "").trim();
const apkUrl = String(process.argv[6] || "").trim() || null;

if (!mode || !version) {
  console.error("Usage: node scripts/release/update-release-metadata.mjs <ota|apk|server> <version> <sha> <route> [apkUrl]");
  process.exit(1);
}

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function readJsonIfExists(path, fallback) {
  if (!fs.existsSync(path)) return fallback;
  return readJson(path);
}

function writeJson(path, data) {
  fs.writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

function nowIso() {
  return new Date().toISOString();
}

function formatFileSizeLabel(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

// Reads the locally built APK (releases/cinelog-v<version>.apk) to compute real size/checksum,
// so manifest metadata never drifts from the actual uploaded artifact.
function readLocalApkStats(version) {
  const localPath = `releases/cinelog-v${version}.apk`;
  if (!fs.existsSync(localPath)) return null;
  const buffer = fs.readFileSync(localPath);
  return {
    fileSizeBytes: buffer.length,
    fileSizeLabel: formatFileSizeLabel(buffer.length),
    checksumSha256: crypto.createHash("sha256").update(buffer).digest("hex"),
  };
}

function buildVersionCode(versionString) {
  const [major = "0", minor = "0", patch = "0"] = versionString.split(".");
  const code = Number(major) * 10000 + Number(minor) * 100 + Number(patch);
  return Number.isFinite(code) ? code : 0;
}

function main() {
  const manifest = readJson("server/update-manifest.json");
  const appVersion = readJsonIfExists("server/app-version.json", {
    version,
    apkUrl: null,
  });
  const timestamp = nowIso();

  if (mode === "ota") {
    manifest.ota.channel = "production";
    manifest.ota.runtimeVersion = version;
    manifest.ota.strategy = "expo-updates";
    manifest.ota.releasedAt = timestamp;
    manifest.server.message =
      "Server deploys are independent from OTA bundles and APK releases.";
  } else if (mode === "apk") {
    const fileName = apkUrl ? String(apkUrl).split("/").pop() : `cinelog-v${version}.apk`;
    const versionCode = buildVersionCode(version);
    manifest.native.version = version;
    manifest.native.versionCode = versionCode;
    manifest.native.buildId = `android-${version}`;
    manifest.native.required = false;
    manifest.native.releasedAt = timestamp;
    manifest.native.notes = [
      `Native build published for ${version}`,
      `Commit: ${commitSha}`,
      `Runtime/OTA channel aligned for automatic Expo Updates`,
    ];
    if (!manifest.native.apk || typeof manifest.native.apk !== "object") {
      manifest.native.apk = {};
    }
    const localStats = readLocalApkStats(version);
    Object.assign(manifest.native.apk, {
      available: Boolean(apkUrl),
      provider: "github-releases",
      source: "github",
      downloadUrl: apkUrl,
      // keep legacy key for older consumers
      url: apkUrl,
      fileName,
      contentType: "application/vnd.android.package-archive",
      versionName: version,
      versionCode,
      buildId: `android-${version}`,
      validatedAt: timestamp,
      unavailableReason: apkUrl ? null : "APK URL ontbreekt",
      fallbackMessage:
        "Download de nieuwste APK via de GitHub releases pagina als de download niet werkt.",
      ...(localStats ?? {}),
    });
    if (!manifest.endpoints || typeof manifest.endpoints !== "object") {
      manifest.endpoints = {};
    }
    manifest.endpoints.apkDownloadUrl = apkUrl;
    appVersion.version = version;
    appVersion.apkUrl = apkUrl;
  } else if (mode === "server") {
    manifest.server.version = version;
    manifest.server.releasedAt = timestamp;
    manifest.server.requiresAppUpdate = false;
    manifest.server.message = `Server release for ${version} (${commitSha.slice(0, 8)})`;
  } else {
    console.error(`Unknown metadata mode: ${mode}`);
    process.exit(1);
  }

  const reportPath = "server/release-report.json";
  const existingReport = fs.existsSync(reportPath) ? readJson(reportPath) : null;
  const report =
    existingReport && typeof existingReport === "object" && Array.isArray(existingReport.runs)
      ? existingReport
      : { runs: [] };
  report.runs.unshift({
    at: timestamp,
    mode,
    route,
    version,
    commitSha,
    apkUrl,
  });
  report.runs = report.runs.slice(0, 30);

  writeJson("server/update-manifest.json", manifest);
  writeJson("server/app-version.json", appVersion);
  writeJson(reportPath, report);

  console.log(`release metadata updated (${mode})`);
}

main();
