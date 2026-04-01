const NATIVE_HINTS = [
  /^android\//,
  /^ios\//,
  /^app\/android\//,
  /^app\/ios\//,
  /^app\/app\.config\.(js|ts)$/,
  /^app\/app\.json$/,
  /^app\/eas\.json$/,
  /^eas\.json$/,
  /^android\/gradle\.properties$/,
  /^android\/app\/src\/main\/AndroidManifest\.xml$/,
  /^ios\/Podfile/,
  /^app\/plugins\//,
  /^app\/patches\//,
  /^patches\//,
];

const SERVER_HINTS = [
  /^server\//,
  /^render\.ya?ml$/,
  /^cloudflare\//,
  /^wrangler\.toml$/,
  /^server\/app-version\.json$/,
];

const OTA_HINTS = [
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
  /^package-lock\.json$/,
];

const SHARED_HINTS = [
  /^package\.json$/,
  /^README\.md$/,
  /^scripts\//,
  /^\.github\/workflows\//,
  /^app\.json$/,
];

function matches(path, patterns) {
  return patterns.some((pattern) => pattern.test(path));
}

export function classifyChangedFiles(files) {
  const uniqueFiles = [...new Set(files.filter(Boolean))].map((value) => value.trim()).filter(Boolean);

  const categories = {
    ota: [],
    native: [],
    server: [],
    shared: [],
    unknown: [],
  };

  for (const file of uniqueFiles) {
    const normalized = file.replace(/^\.\//, "");

    if (matches(normalized, NATIVE_HINTS)) {
      categories.native.push(normalized);
      continue;
    }

    if (matches(normalized, SERVER_HINTS)) {
      categories.server.push(normalized);
      continue;
    }

    if (matches(normalized, OTA_HINTS)) {
      categories.ota.push(normalized);
      continue;
    }

    if (matches(normalized, SHARED_HINTS)) {
      categories.shared.push(normalized);
      continue;
    }

    categories.unknown.push(normalized);
  }

  return categories;
}

export function chooseRoutes(categories, forceTarget = "auto") {
  const hasServer = categories.server.length > 0;
  const hasNative = categories.native.length > 0;
  const hasOta = categories.ota.length > 0;
  const hasSharedOrUnknown = categories.shared.length > 0 || categories.unknown.length > 0;

  const suggested = [];

  if (hasNative) suggested.push("apk");
  if (hasOta && !hasNative) suggested.push("ota");
  if (hasServer) suggested.push("server");

  if (!hasNative && !hasOta && !hasServer && hasSharedOrUnknown) {
    suggested.push("manual-review");
  }

  if (suggested.length === 0) {
    suggested.push("no-op");
  }

  if (forceTarget === "auto") {
    return suggested;
  }

  if (forceTarget === "apk") return ["apk"];
  if (forceTarget === "ota") return ["ota"];
  if (forceTarget === "server") return ["server"];

  return suggested;
}

export function estimatePayloadMb(files) {
  // Conservative baseline estimate when exact file stats are unavailable.
  const scorePerFileMb = 0.08;
  return Number((files.length * scorePerFileMb).toFixed(2));
}
