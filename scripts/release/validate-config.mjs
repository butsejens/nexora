import fs from "node:fs";

const files = [
  "app/app.json",
  "app/eas.json",
  "server/update-manifest.json",
  "package.json",
  "app/package.json",
  "server/package.json",
];

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function main() {
  for (const filePath of files) {
    readJson(filePath);
  }

  const rootPkg = readJson("package.json");
  const appPkg = readJson("app/package.json");
  const serverPkg = readJson("server/package.json");
  const appConfig = readJson("app/app.json");
  const manifest = readJson("server/update-manifest.json");

  if (fs.existsSync("server/app-version.json")) {
    readJson("server/app-version.json");
  }

  assert(Boolean(appConfig?.expo?.version), "app/app.json missing expo.version");
  assert(rootPkg.version === appPkg.version, "root package version must match app/package.json version");
  assert(rootPkg.version === serverPkg.version, "root package version must match server/package.json version");
  assert(String(manifest?.schemaVersion || "") === "2", "server/update-manifest.json schemaVersion must be 2");
  assert(Boolean(manifest?.native?.version), "update-manifest.native.version missing");
  assert(Boolean(manifest?.ota?.channel), "update-manifest.ota.channel missing");
  assert(Boolean(manifest?.server?.version), "update-manifest.server.version missing");

  console.log("config validation: OK");
}

main();
