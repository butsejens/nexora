import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const smartDeployScript = path.join(repoRoot, "scripts", "smart-deploy.mjs");

const forwardedArgs = process.argv.slice(2);
const fallbackArgs = ["commit-upload", "--message", "chore(release): smart release", ...forwardedArgs];

const result = spawnSync("node", [smartDeployScript, ...fallbackArgs], {
  cwd: repoRoot,
  stdio: "inherit",
  env: process.env,
});

if (typeof result.status === "number") {
  process.exit(result.status);
}

process.exit(1);
