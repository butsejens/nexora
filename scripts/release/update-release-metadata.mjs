import fs from "node:fs";

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
    manifest.ota.releasedAt = timestamp;
    manifest.server.message = "Server deploys are independent from OTA bundles and APK releases.";
  } else if (mode === "apk") {
    manifest.native.version = version;
    manifest.native.versionCode = buildVersionCode(version);
    manifest.native.buildId = `android-${version}`;
    manifest.native.releasedAt = timestamp;
    manifest.native.apk.url = apkUrl;
    manifest.native.apk.fileName = apkUrl ? String(apkUrl).split("/").pop() : null;
    manifest.native.apk.provider = "github-releases";
    manifest.native.notes = [
      `Native build published for ${version}`,
      `Commit: ${commitSha}`,
    ];
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
  const report = fs.existsSync(reportPath) ? readJson(reportPath) : { runs: [] };
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
