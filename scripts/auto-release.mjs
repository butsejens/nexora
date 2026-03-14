import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const appJsonPath = path.join(repoRoot, "app", "app.json");
const serverVersionPath = path.join(repoRoot, "server", "app-version.json");
const androidGradlePath = path.join(repoRoot, "app", "android", "app", "build.gradle");
const appPkgPath = path.join(repoRoot, "app", "package.json");
const serverPkgPath = path.join(repoRoot, "server", "package.json");
const releaseApkPath = path.join(repoRoot, "app", "android", "app", "build", "outputs", "apk", "mobile", "release", "app-mobile-release.apk");

function run(command, cwd = repoRoot) {
  execSync(command, { cwd, stdio: "inherit", env: process.env });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function bumpPatch(version) {
  const parts = String(version || "0.0.0").split(".").map((part) => Number(part || 0));
  const major = Number.isFinite(parts[0]) ? parts[0] : 0;
  const minor = Number.isFinite(parts[1]) ? parts[1] : 0;
  const patch = Number.isFinite(parts[2]) ? parts[2] : 0;
  return `${major}.${minor}.${patch + 1}`;
}

function updateGradleVersion(version) {
  const text = fs.readFileSync(androidGradlePath, "utf8");
  const codeMatch = text.match(/versionCode\s+(\d+)/);
  const currentCode = codeMatch ? Number(codeMatch[1]) : 1;
  const nextCode = Number.isFinite(currentCode) ? currentCode + 1 : 1;

  const updated = text
    .replace(/versionCode\s+\d+/, `versionCode ${nextCode}`)
    .replace(/versionName\s+"[^"]+"/, `versionName "${version}"`);

  fs.writeFileSync(androidGradlePath, updated, "utf8");
}

function hasEncryptedEnvPair() {
  return fs.existsSync(path.join(repoRoot, "app", ".env.enc")) && fs.existsSync(path.join(repoRoot, "server", ".env.enc"));
}

function buildApk() {
  const androidCwd = path.join(repoRoot, "app", "android");
  run("./gradlew assembleRelease --rerun-tasks", androidCwd);
  if (!fs.existsSync(releaseApkPath)) {
    throw new Error("APK build voltooid zonder release artifact: app-release.apk ontbreekt");
  }
}

function publishGithubRelease(version) {
  run(`gh release create "v${version}" "${releaseApkPath}" --title "v${version}" --notes "Nexora v${version}" --latest --repo butsejens/nexora`);
}

function main() {
  const appJson = readJson(appJsonPath);
  const currentVersion = String(appJson?.expo?.version || "0.0.0");
  const nextVersion = bumpPatch(currentVersion);

  appJson.expo.version = nextVersion;
  appJson.expo.runtimeVersion = nextVersion;
  writeJson(appJsonPath, appJson);

  const serverVersion = readJson(serverVersionPath);
  serverVersion.version = nextVersion;
  serverVersion.apkUrl = `https://github.com/butsejens/nexora/releases/download/v${nextVersion}/app-release.apk`;
  writeJson(serverVersionPath, serverVersion);

  const appPkg = readJson(appPkgPath);
  appPkg.version = nextVersion;
  writeJson(appPkgPath, appPkg);

  const serverPkg = readJson(serverPkgPath);
  serverPkg.version = nextVersion;
  writeJson(serverPkgPath, serverPkg);

  updateGradleVersion(nextVersion);

  run("npm -w app run lint");
  run("node --check server/index.js");
  buildApk();

  run("git add app/app.json server/app-version.json app/package.json server/package.json");
  run("git add -f app/android/app/build.gradle");

  try {
    run(`git commit -m \"chore(release): auto bump to ${nextVersion} [auto-release]\"`);
  } catch {
    console.log("Geen release wijzigingen om te committen.");
    return;
  }

  run("git push");

  publishGithubRelease(nextVersion);

  const appCwd = path.join(repoRoot, "app");
  const policyCommand = hasEncryptedEnvPair()
    ? "node ../scripts/require-macbook.mjs && node ../scripts/enforce-env-policy.mjs release"
    : "NEXORA_ALLOW_PLAINTEXT_ONLY=1 node ../scripts/require-macbook.mjs && NEXORA_ALLOW_PLAINTEXT_ONLY=1 node ../scripts/enforce-env-policy.mjs release";

  run(policyCommand, appCwd);
  process.env.EXPO_METRO_NO_CACHE = "1";
  run(`command -v eas >/dev/null 2>&1 && eas update --branch production --message \"auto release ${nextVersion}\" --non-interactive || npx eas-cli update --branch production --message \"auto release ${nextVersion}\" --non-interactive`, appCwd);

  console.log(`✅ Auto release klaar: ${nextVersion}`);
}

main();
