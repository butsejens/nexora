import assert from "node:assert/strict";
import fs from "node:fs";
import { execSync, spawnSync } from "node:child_process";

const manifestPath = "server/update-manifest.json";
const appVersionPath = "server/app-version.json";
const reportPath = "server/release-report.json";

const manifestOriginal = fs.readFileSync(manifestPath, "utf8");
const appVersionOriginal = fs.existsSync(appVersionPath) ? fs.readFileSync(appVersionPath, "utf8") : null;
const reportOriginal = fs.existsSync(reportPath) ? fs.readFileSync(reportPath, "utf8") : null;

function cleanup() {
  fs.writeFileSync(manifestPath, manifestOriginal);
  if (appVersionOriginal == null) {
    if (fs.existsSync(appVersionPath)) fs.unlinkSync(appVersionPath);
  } else {
    fs.writeFileSync(appVersionPath, appVersionOriginal);
  }
  if (reportOriginal == null) {
    if (fs.existsSync(reportPath)) fs.unlinkSync(reportPath);
  } else {
    fs.writeFileSync(reportPath, reportOriginal);
  }
}

try {
  execSync("node scripts/release/update-release-metadata.mjs ota 2.6.27 abcdef123456 ota", { stdio: "inherit" });
  const manifestOta = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(typeof manifestOta.ota.releasedAt, "string");

  execSync("node scripts/release/update-release-metadata.mjs apk 2.6.99 deadbeef apk https://github.com/butsejens/nexora/releases/download/v2.6.99/nexora-v2.6.99.apk", { stdio: "inherit" });
  const manifestApk = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const appVersionApk = JSON.parse(fs.readFileSync(appVersionPath, "utf8"));
  assert.equal(manifestApk.native.version, "2.6.99");
  assert.equal(appVersionApk.version, "2.6.99");
  assert.match(String(appVersionApk.apkUrl || ""), /nexora-v2\.6\.99\.apk/);

  execSync("node scripts/release/update-release-metadata.mjs server 2.6.99 0123456789 server", { stdio: "inherit" });
  const manifestServer = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(manifestServer.server.version, "2.6.99");

  const envCheck = spawnSync("node", ["scripts/release/validate-release-env.mjs", "release", "server"], {
    stdio: "pipe",
    env: {
      ...process.env,
      RENDER_DEPLOY_HOOK_URL: "",
    },
  });
  assert.notEqual(envCheck.status, 0, "missing release env vars must fail validation");

  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  assert.equal(Array.isArray(report.runs), true);
  assert.equal(report.runs.length > 0, true);

  console.log("release metadata tests: all scenarios passed");
} catch (error) {
  cleanup();
  throw error;
}

cleanup();
