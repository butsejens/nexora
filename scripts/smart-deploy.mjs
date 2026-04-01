import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyChangedFiles, chooseRoutes, estimatePayloadMb } from "./smart-deploy-core.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const options = {
    intent: "auto",
    dryRun: false,
    skipChecks: false,
    push: false,
    commit: false,
    message: "",
    files: [],
    fromRef: "",
  };

  const [intent, ...rest] = argv;
  if (intent && !intent.startsWith("--")) options.intent = intent;

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token === "--dry-run") options.dryRun = true;
    else if (token === "--skip-checks") options.skipChecks = true;
    else if (token === "--push") options.push = true;
    else if (token === "--commit") options.commit = true;
    else if (token === "--message") {
      options.message = String(rest[i + 1] || "");
      i += 1;
    }
    else if (token === "--files") {
      const raw = String(rest[i + 1] || "");
      options.files = raw.split(",").map((value) => value.trim()).filter(Boolean);
      i += 1;
    } else if (token === "--from-ref") {
      options.fromRef = String(rest[i + 1] || "").trim();
      i += 1;
    }
  }

  return options;
}

function run(command, cwd = repoRoot, silent = false) {
  if (!silent) {
    console.log(`[smart-deploy] ${command}`);
  }
  return execSync(command, {
    cwd,
    encoding: "utf8",
    stdio: silent ? ["ignore", "pipe", "pipe"] : "inherit",
    env: { ...process.env, EXPO_METRO_NO_CACHE: "1" },
  });
}

function gitOutput(command) {
  try {
    return run(command, repoRoot, true).trim();
  } catch {
    return "";
  }
}

function getCurrentBranch() {
  return gitOutput("git rev-parse --abbrev-ref HEAD") || "main";
}

function getChangedFiles(options) {
  if (options.files.length > 0) {
    return options.files;
  }

  if (options.fromRef) {
    const result = gitOutput(`git diff --name-only ${options.fromRef}...HEAD`);
    return result ? result.split("\n").filter(Boolean) : [];
  }

  const staged = gitOutput("git diff --name-only --cached");
  const unstaged = gitOutput("git diff --name-only");
  const local = `${staged}\n${unstaged}`.split("\n").map((line) => line.trim()).filter(Boolean);

  if (local.length > 0) {
    return [...new Set(local)];
  }

  const lastCommit = gitOutput("git rev-list --max-count=1 HEAD~1");
  if (lastCommit) {
    const recent = gitOutput("git diff --name-only HEAD~1..HEAD");
    if (recent) return recent.split("\n").filter(Boolean);
  }

  return [];
}

function hasPendingChanges() {
  return Boolean(gitOutput("git status --porcelain"));
}

function assertCleanForPush(pushRequested) {
  if (!pushRequested) return;
  if (hasPendingChanges()) {
    throw new Error("Push gevraagd met uncommitted wijzigingen. Gebruik --commit of commit eerst handmatig.");
  }
}

function runSanityChecks(routes) {
  const needsAppChecks = routes.includes("ota") || routes.includes("apk");
  const needsServerChecks = routes.includes("server");

  if (needsAppChecks) {
    run("npm -w app run lint");
    run("npx tsc -p app/tsconfig.json --noEmit");
  }

  if (needsServerChecks) {
    run("node --check server/index.js");
  }

  if (routes.includes("apk")) {
    run("npm run release:ci");
    verifyApkSanity();
  }
}

function verifyApkSanity() {
  const apkPath = path.join(repoRoot, "android", "app", "build", "outputs", "apk", "release", "app-release.apk");
  if (!fs.existsSync(apkPath)) {
    throw new Error("Release sanity mislukt: app-release.apk ontbreekt na build.");
  }

  const sizeBytes = fs.statSync(apkPath).size;
  const sizeMb = sizeBytes / (1024 * 1024);
  if (sizeMb < 60) {
    throw new Error(`Release sanity mislukt: APK lijkt te klein (${sizeMb.toFixed(1)}MB).`);
  }

  console.log(`[smart-deploy] Release sanity OK: APK ${sizeMb.toFixed(1)}MB`);
}

function commitAndPush(options) {
  const branch = getCurrentBranch();
  let didPush = false;

  if (options.commit) {
    run("git add -A");
    const status = gitOutput("git status --porcelain");
    if (status) {
      const message = options.message || "chore(release): smart deploy commit";
      run(`git commit -m ${JSON.stringify(message)}`);
    } else {
      console.log("[smart-deploy] Geen wijzigingen om te committen.");
    }
  }

  if (options.push || options.commit) {
    assertCleanForPush(true);
    run(`git push origin ${branch}`);
    didPush = true;
  }

  return { didPush, branch };
}

function executeRoutes(routes, options, context) {
  if (options.dryRun) {
    console.log("[smart-deploy] Dry run actief. Geen deploy commando's uitgevoerd.");
    return;
  }

  for (const route of routes) {
    if (route === "ota") {
      run("npm run ota:production", path.join(repoRoot, "app"));
      continue;
    }

    if (route === "apk") {
      run("npm run release:apk");
      continue;
    }

    if (route === "server") {
      if (!context.didPush) {
        run(`git push origin ${context.branch}`);
      } else {
        console.log("[smart-deploy] Server deploy gebruikt reeds uitgevoerde push.");
      }
      continue;
    }

    if (route === "manual-review" || route === "no-op") {
      console.log(`[smart-deploy] Route ${route}: geen automatische actie.`);
    }
  }
}

function mapIntentToForcedRoute(intent) {
  if (["ota", "apk", "server"].includes(intent)) return intent;
  return "auto";
}

function normalizeIntent(intent) {
  if (["push", "commit-upload", "maak-apk", "in-app-update", "naar-server"].includes(intent)) {
    return intent;
  }
  if (["apk", "ota", "server", "auto"].includes(intent)) return intent;
  return "auto";
}

function applyIntentSideEffects(options) {
  const intent = normalizeIntent(options.intent);
  if (intent === "push") options.push = true;
  if (intent === "commit-upload") {
    options.commit = true;
    options.push = true;
  }
  if (intent === "maak-apk") options.intent = "apk";
  if (intent === "in-app-update") options.intent = "ota";
  if (intent === "naar-server") options.intent = "server";
}

function printReport(files, categories, routes, options) {
  console.log("\n=== NEXORA SMART DEPLOY REPORT ===");
  console.log(`Intent: ${options.intent}`);
  console.log(`Changed files: ${files.length}`);
  console.log(`Estimated minimal payload: ~${estimatePayloadMb(files)} MB (delta strategy)`);
  console.log(`Route: ${routes.join(" + ")}`);
  console.log(`- OTA files: ${categories.ota.length}`);
  console.log(`- Native files: ${categories.native.length}`);
  console.log(`- Server files: ${categories.server.length}`);
  console.log(`- Shared files: ${categories.shared.length}`);
  console.log(`- Unknown files: ${categories.unknown.length}`);

  if (categories.unknown.length > 0) {
    console.log("Unknown paths:");
    for (const file of categories.unknown) {
      console.log(`  - ${file}`);
    }
  }
}

function ensureDependenciesAvailable() {
  const result = spawnSync("npm", ["-v"], { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error("npm is niet beschikbaar in PATH.");
  }
}

function main() {
  ensureDependenciesAvailable();

  const options = parseArgs(process.argv.slice(2));
  applyIntentSideEffects(options);

  const files = getChangedFiles(options);
  const categories = classifyChangedFiles(files);

  const forcedRoute = mapIntentToForcedRoute(options.intent);
  const routes = chooseRoutes(categories, forcedRoute);

  printReport(files, categories, routes, options);

  if (!options.skipChecks) {
    runSanityChecks(routes);
  }

  const pushContext = commitAndPush(options);
  executeRoutes(routes, options, pushContext);

  console.log("\n[smart-deploy] Klaar.");
}

main();
