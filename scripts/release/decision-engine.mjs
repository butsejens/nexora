import fs from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const NATIVE_PATTERNS = [
  /^android\//,
  /^ios\//,
  /^app\/android\//,
  /^app\/ios\//,
  /^app\/app\.json$/,
  /^app\/app\.config\.(js|ts)$/,
  /^app\/eas\.json$/,
  /^eas\.json$/,
  /^app\/plugins\//,
  /^patches\//,
  /^app\/patches\//,
  /^metro\.config\.js$/,
  /^react-native\.config\.js$/,
];

const OTA_PATTERNS = [
  /^app\/app\//,
  /^app\/components\//,
  /^app\/features\//,
  /^app\/hooks\//,
  /^app\/services\//,
  /^app\/store\//,
  /^app\/context\//,
  /^app\/constants\//,
  /^app\/types\//,
  /^app\/locales\//,
  /^app\/api\//,
  /^app\/assets\//,
  /^app\/lib\//,
  /^app\/index\.js$/,
  /^app\/babel\.config\.js$/,
  /^app\/metro\.config\.js$/,
  /^app\/tsconfig\.json$/,
  /^app\/eslint\.config\.js$/,
  /^app\/package\.json$/,
  /^app\/package-lock\.json$/,
];

const SERVER_PATTERNS = [
  /^server\//,
  /^render\.ya?ml$/,
  /^cloudflare\//,
  /^wrangler\.toml$/,
];

const SHARED_PATTERNS = [
  /^package\.json$/,
  /^package-lock\.json$/,
  /^README\.md$/,
  /^\.github\/workflows\//,
  /^scripts\//,
];

function matches(file, patterns) {
  return patterns.some((pattern) => pattern.test(file));
}

export function classify(files) {
  const normalized = [...new Set((files || []).filter(Boolean).map((file) => String(file).trim().replace(/^\.\//, "")))];
  const categories = {
    native: [],
    ota: [],
    server: [],
    shared: [],
    unknown: [],
  };

  for (const file of normalized) {
    if (matches(file, NATIVE_PATTERNS)) {
      categories.native.push(file);
      continue;
    }
    if (matches(file, SERVER_PATTERNS)) {
      categories.server.push(file);
      continue;
    }
    if (matches(file, OTA_PATTERNS)) {
      categories.ota.push(file);
      continue;
    }
    if (matches(file, SHARED_PATTERNS)) {
      categories.shared.push(file);
      continue;
    }
    categories.unknown.push(file);
  }

  return categories;
}

export function decideRoutes(categories, force = "auto") {
  if (["ota", "apk", "server"].includes(force)) {
    return {
      route: force,
      ota: force === "ota",
      apk: force === "apk",
      server: force === "server",
      reason: `Forced route: ${force}`,
    };
  }

  const hasNative = categories.native.length > 0;
  const hasOta = categories.ota.length > 0;
  const hasServer = categories.server.length > 0;
  const hasShared = categories.shared.length > 0;
  const hasUnknown = categories.unknown.length > 0;

  // Native changes supersede OTA because JS bundle is included in native builds.
  const apk = hasNative;
  const ota = !hasNative && hasOta;
  const server = hasServer;

  let route = "none";
  if (apk && server) route = "apk+server";
  else if (apk) route = "apk";
  else if (ota && server) route = "ota+server";
  else if (ota) route = "ota";
  else if (server) route = "server";
  else if (hasShared || hasUnknown) route = "manual-review";

  let reason = "No releasable changes detected.";
  if (route === "apk+server") reason = "Mixed native + server changes.";
  else if (route === "apk") reason = "Native-impacting changes detected.";
  else if (route === "ota+server") reason = "JS/UI + server changes detected.";
  else if (route === "ota") reason = "JS/UI/data mapping changes detected (OTA eligible).";
  else if (route === "server") reason = "Backend-only changes detected.";
  else if (route === "manual-review") reason = "Only shared/unknown files changed.";

  return { route, ota, apk, server, reason };
}

function parseArgs(argv) {
  const args = {
    from: "",
    to: "",
    files: [],
    force: "auto",
    jsonOnly: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--from") {
      args.from = String(argv[i + 1] || "").trim();
      i += 1;
    } else if (token === "--to") {
      args.to = String(argv[i + 1] || "").trim();
      i += 1;
    } else if (token === "--files") {
      args.files = String(argv[i + 1] || "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
      i += 1;
    } else if (token === "--force") {
      args.force = String(argv[i + 1] || "auto").trim();
      i += 1;
    } else if (token === "--json") {
      args.jsonOnly = true;
    }
  }

  return args;
}

function readChangedFilesFromGit(from, to) {
  const base = from || "HEAD~1";
  const head = to || "HEAD";
  const command = `git diff --name-only ${base} ${head}`;
  const output = execSync(command, { encoding: "utf8" }).trim();
  return output ? output.split("\n").map((entry) => entry.trim()).filter(Boolean) : [];
}

function writeGithubOutputs(result) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (!outputFile) return;

  fs.appendFileSync(outputFile, `route=${result.route}\n`);
  fs.appendFileSync(outputFile, `route_ota=${result.ota}\n`);
  fs.appendFileSync(outputFile, `route_apk=${result.apk}\n`);
  fs.appendFileSync(outputFile, `route_server=${result.server}\n`);
  fs.appendFileSync(outputFile, `reason=${result.reason.replace(/\n/g, " ")}\n`);
  fs.appendFileSync(outputFile, `result_json=${JSON.stringify(result)}\n`);
}

export function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = args.files.length > 0 ? args.files : readChangedFilesFromGit(args.from, args.to);
  const categories = classify(files);
  const decision = decideRoutes(categories, args.force);

  const result = {
    from: args.from || "HEAD~1",
    to: args.to || "HEAD",
    changedFiles: files,
    categories,
    ...decision,
  };

  writeGithubOutputs(result);

  if (args.jsonOnly) {
    console.log(JSON.stringify(result));
    return;
  }

  console.log("=== NEXORA RELEASE DECISION ===");
  console.log(`Route: ${result.route}`);
  console.log(`Reason: ${result.reason}`);
  console.log(`Changed files: ${result.changedFiles.length}`);
  console.log(`Native: ${result.categories.native.length}`);
  console.log(`OTA: ${result.categories.ota.length}`);
  console.log(`Server: ${result.categories.server.length}`);
  console.log(`Shared: ${result.categories.shared.length}`);
  console.log(`Unknown: ${result.categories.unknown.length}`);
  console.log(JSON.stringify(result, null, 2));
}

const currentFile = fileURLToPath(import.meta.url);
const entryFile = process.argv[1] ? String(process.argv[1]) : "";

if (entryFile && currentFile === entryFile) {
  main();
}
