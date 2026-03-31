import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const appJsonPath = path.join(repoRoot, "app", "app.json");
const serverVersionPath = path.join(repoRoot, "server", "app-version.json");
const androidGradlePath = path.join(repoRoot, "android", "app", "build.gradle");
const rootPkgPath = path.join(repoRoot, "package.json");
const appPkgPath = path.join(repoRoot, "app", "package.json");
const serverPkgPath = path.join(repoRoot, "server", "package.json");
const releaseApkPath = path.join(repoRoot, "android", "app", "build", "outputs", "apk", "release", "app-release.apk");

function run(command, cwd = repoRoot) {
  console.log(`\n[auto-release] Running: ${command} (cwd: ${cwd})`);
  try {
    execSync(command, {
      cwd,
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "production" },
    });
    console.log(`[auto-release] Command succeeded: ${command}`);
  } catch (err) {
    if (err && typeof err === "object" && (err.status !== undefined || err.code !== undefined)) {
      console.error(`[auto-release] Command failed with exit code: ${err.status ?? err.code}`);
    }
    console.error(`[auto-release] Error running command: ${command}`);
    throw err;
  }
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

function getAaptPath() {
  const configuredSdk = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME || path.join(os.homedir(), "Library", "Android", "sdk");
  const buildToolsDir = path.join(configuredSdk, "build-tools");
  if (!fs.existsSync(buildToolsDir)) {
    throw new Error(`Android build-tools map ontbreekt: ${buildToolsDir}`);
  }

  const versions = fs.readdirSync(buildToolsDir).sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
  for (const version of versions) {
    const candidate = path.join(buildToolsDir, version, "aapt");
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Kon geen aapt binary vinden in ${buildToolsDir}`);
}

function verifyReleaseApk(expectedVersion, expectedPackage) {
  const aaptPath = getAaptPath();
  const badging = execSync(`"${aaptPath}" dump badging "${releaseApkPath}"`, {
    cwd: repoRoot,
    encoding: "utf8",
    env: process.env,
  });
  const packageLine = badging.split("\n").find((line) => line.startsWith("package:"));
  if (!packageLine) {
    throw new Error("Kon package metadata niet uitlezen uit release APK.");
  }

  const packageMatch = packageLine.match(/name='([^']+)'/);
  const versionMatch = packageLine.match(/versionName='([^']+)'/);
  const actualPackage = packageMatch?.[1] || "";
  const actualVersion = versionMatch?.[1] || "";

  if (actualPackage !== expectedPackage) {
    throw new Error(`Release APK package mismatch: verwacht ${expectedPackage}, kreeg ${actualPackage || "onbekend"}.`);
  }

  if (actualVersion !== expectedVersion) {
    throw new Error(`Release APK version mismatch: verwacht ${expectedVersion}, kreeg ${actualVersion || "onbekend"}.`);
  }
}

function buildApk(expectedVersion, expectedPackage) {
  const androidCwd = path.join(repoRoot, "android");
  run("./gradlew assembleRelease --rerun-tasks -x externalNativeBuildCleanRelease", androidCwd);
  if (!fs.existsSync(releaseApkPath)) {
    throw new Error("APK build voltooid zonder release artifact: app-release.apk ontbreekt");
  }

  verifyReleaseApk(expectedVersion, expectedPackage);
}

function publishGithubRelease(version) {
  // Upload APK with a versioned filename so users see "Nexora-v2.6.x.apk" in the release assets
  run(`gh release create "v${version}" "${releaseApkPath}#Nexora-v${version}.apk" --title "v${version}" --notes "Nexora v${version}" --latest --draft=false --repo butsejens/nexora`);
}

function main() {
  // Prevent Metro cache usage during CI/release builds to avoid ENOTEMPTY cache errors
  process.env.EXPO_METRO_NO_CACHE = "1";
  const appJson = readJson(appJsonPath);
  const currentVersion = String(appJson?.expo?.version || "0.0.0");
  const nextVersion = bumpPatch(currentVersion);
  const expectedAndroidPackage = String(appJson?.expo?.android?.package || "");

  appJson.expo.version = nextVersion;
  appJson.expo.runtimeVersion = nextVersion;
  writeJson(appJsonPath, appJson);

  const serverVersion = readJson(serverVersionPath);
  serverVersion.version = nextVersion;
  serverVersion.apkUrl = `https://github.com/butsejens/nexora/releases/download/v${nextVersion}/app-release.apk`;
  writeJson(serverVersionPath, serverVersion);

  const rootPkg = readJson(rootPkgPath);
  rootPkg.version = nextVersion;
  writeJson(rootPkgPath, rootPkg);

  const appPkg = readJson(appPkgPath);
  appPkg.version = nextVersion;
  writeJson(appPkgPath, appPkg);

  const serverPkg = readJson(serverPkgPath);
  serverPkg.version = nextVersion;
  writeJson(serverPkgPath, serverPkg);

  updateGradleVersion(nextVersion);

  run("npm -w app run lint");
  run("node --check server/index.js");
  buildApk(nextVersion, expectedAndroidPackage);

  run("git add package.json app/app.json server/app-version.json app/package.json server/package.json android/app/build.gradle");

  try {
    run(`git commit -m \"chore(release): auto bump to ${nextVersion} [auto-release]\"`);
  } catch {
    console.log("Geen release wijzigingen om te committen.");
    return;
  }

  run("git push --set-upstream origin main");

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
