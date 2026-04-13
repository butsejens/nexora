import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const appJsonPath = path.join(repoRoot, "app", "app.json");

function readCurrentVersion() {
  try {
    const raw = fs.readFileSync(appJsonPath, "utf8");
    const json = JSON.parse(raw);
    return String(json?.expo?.version || "").trim();
  } catch {
    return "";
  }
}

function removeOldVersionedApks(baseDir, currentVersion) {
  if (!fs.existsSync(baseDir)) return [];
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  const deleted = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const name = entry.name;
    if (!/^nexora-v.+\.apk$/i.test(name)) continue;
    if (currentVersion && name.toLowerCase() === `nexora-v${currentVersion}.apk`.toLowerCase()) continue;

    const fullPath = path.join(baseDir, name);
    fs.rmSync(fullPath, { force: true });
    deleted.push(path.relative(repoRoot, fullPath));
  }

  return deleted;
}

function main() {
  const currentVersion = readCurrentVersion();
  const targets = [repoRoot, path.join(repoRoot, "app")];
  const removed = targets.flatMap((dir) => removeOldVersionedApks(dir, currentVersion));

  if (removed.length === 0) {
    console.log("APK cleanup: no old versioned APK files found.");
    return;
  }

  console.log("APK cleanup: removed old APK files:");
  for (const file of removed) {
    console.log(`- ${file}`);
  }
}

main();
