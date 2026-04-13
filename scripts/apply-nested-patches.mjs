/**
 * Applies patches that target packages nested inside other packages,
 * which patch-package cannot handle directly.
 *
 * This script is called from the root postinstall hook.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");

/**
 * Patch 1: @expo/cli > BundlerDevServer — use WsTunnel on port 8081
 *
 * The package is nested at node_modules/expo/node_modules/@expo/cli
 * and cannot be patched by patch-package directly.
 */
function patchExpoCliBundlerDevServer() {
  const filePath = resolve(
    rootDir,
    "node_modules/expo/node_modules/@expo/cli/build/src/start/server/BundlerDevServer.js"
  );

  if (!existsSync(filePath)) {
    console.log("[nested-patches] BundlerDevServer.js not found, skipping.");
    return;
  }

  const content = readFileSync(filePath, "utf8");

  const ALREADY_PATCHED = "port === 8081";
  if (content.includes(ALREADY_PATCHED)) {
    console.log("[nested-patches] @expo/cli BundlerDevServer already patched.");
    return;
  }

  const ORIGINAL = "this.tunnel = (0, _env.envIsWebcontainer)() ? new _AsyncWsTunnel.AsyncWsTunnel(this.projectRoot, port) : new _AsyncNgrok.AsyncNgrok(this.projectRoot, port);";
  const PATCHED =
    "const useWsTunnel = (0, _env.envIsWebcontainer)() || port === 8081;\n        this.tunnel = useWsTunnel ? new _AsyncWsTunnel.AsyncWsTunnel(this.projectRoot, port) : new _AsyncNgrok.AsyncNgrok(this.projectRoot, port);";

  if (!content.includes(ORIGINAL)) {
    console.warn(
      "[nested-patches] @expo/cli BundlerDevServer: original string not found. " +
        "The package may have been updated. Patch skipped."
    );
    return;
  }

  const patched = content.replace(ORIGINAL, PATCHED);
  writeFileSync(filePath, patched, "utf8");
  console.log("[nested-patches] @expo/cli BundlerDevServer patched successfully.");
}

patchExpoCliBundlerDevServer();
