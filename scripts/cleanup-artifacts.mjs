import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);

const targets = [
  "android/app/build",
  "android/app/.cxx",
  "android/.gradle",
  "android/build",
  "dist",
  "app/dist",
  ".expo",
  "app/.expo",
  "android/java_pid64310.hprof",
];

const removed = [];

for (const rel of targets) {
  const full = path.join(repoRoot, rel);
  if (!fs.existsSync(full)) continue;
  fs.rmSync(full, { recursive: true, force: true });
  removed.push(rel);
}

if (removed.length === 0) {
  console.log("No cleanup targets found.");
  process.exit(0);
}

console.log("Removed artifacts:");
for (const rel of removed) {
  console.log(`- ${rel}`);
}
