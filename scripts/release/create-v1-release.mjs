#!/usr/bin/env node
/**
 * Wait for the EAS build to finish, download the APK, and publish it as
 * GitHub release v1.0.0.
 *
 * Usage:  node scripts/release/create-v1-release.mjs
 */
import { execSync, spawnSync } from "child_process";
import { createWriteStream, existsSync } from "fs";
import { get as httpsGet } from "https";
import { get as httpGet } from "http";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const BUILD_ID = "55592b73-400f-4c52-832c-3fde883222a9";
const APK_PATH = path.join(ROOT, "releases", "nexora-v1.0.0.apk");
const TAG = "v1.0.0";
const TITLE = "Nexora v1.0.0";
const NOTES = "First clean release — all history squashed into a single commit.";

function eas(args) {
  const r = spawnSync("npx", ["eas", ...args], {
    cwd: path.join(ROOT, "app"),
    encoding: "utf8",
  });
  return r.stdout + r.stderr;
}

function fetchBuildUrl() {
  const out = eas(["build:view", BUILD_ID, "--json"]);
  // Look for Application Archive URL line
  const urlMatch = out.match(/Application Archive URL\s+(https?:\/\/\S+)/);
  if (urlMatch) return urlMatch[1];
  // Fallback: any .apk URL
  const apkMatch = out.match(/https:\/\/[^\s"]+\.apk/);
  return apkMatch ? apkMatch[0] : null;
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const getter = url.startsWith("https") ? httpsGet : httpGet;
    const file = createWriteStream(dest);
    getter(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on("finish", () => { file.close(); resolve(); });
    }).on("error", reject);
  });
}

async function waitForBuild(maxMinutes = 60) {
  const deadline = Date.now() + maxMinutes * 60 * 1000;
  process.stdout.write("Waiting for EAS build");
  while (Date.now() < deadline) {
    const out = eas(["build:list", "--platform", "android", "--limit", "1"]);
    const statusMatch = out.match(/Status\s+([^\n]+)/);
    const status = (statusMatch?.[1] ?? "").trim().toLowerCase();
    process.stdout.write(` [${status}]`);
    if (status === "finished") { process.stdout.write("\n"); return true; }
    if (status.includes("error") || status.includes("cancel")) {
      process.stdout.write("\n");
      throw new Error(`Build ${status}`);
    }
    await new Promise((r) => setTimeout(r, 30_000));
  }
  throw new Error("Build timed out");
}

async function main() {
  await waitForBuild();

  const url = fetchBuildUrl();
  if (!url) throw new Error("Could not find APK download URL in EAS output");
  console.log("Downloading APK from:", url);
  await download(url, APK_PATH);
  console.log("APK saved to:", APK_PATH);

  // Create the GitHub release and upload the APK
  execSync(
    `gh release create ${TAG} "${APK_PATH}" --title "${TITLE}" --notes "${NOTES}" --latest`,
    { cwd: ROOT, stdio: "inherit" },
  );
  console.log("✓ GitHub release", TAG, "created with APK.");
}

main().catch((e) => { console.error(e); process.exit(1); });
