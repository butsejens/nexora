import { existsSync, copyFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = process.cwd();

function info(message) {
  console.log(`ℹ️  ${message}`);
}

function ok(message) {
  console.log(`✅ ${message}`);
}

function warn(message) {
  console.log(`⚠️  ${message}`);
}

function fail(message) {
  console.error(`❌ ${message}`);
}

function ensureEnvFile(relPath) {
  const target = resolve(root, relPath);
  const example = `${target}.example`;

  if (existsSync(target)) {
    ok(`${relPath} gevonden`);
    return;
  }

  if (!existsSync(example)) {
    fail(`${relPath} ontbreekt en ${relPath}.example bestaat niet`);
    process.exitCode = 1;
    return;
  }

  copyFileSync(example, target);
  ok(`${relPath} aangemaakt vanuit ${relPath}.example`);
}

function checkJava() {
  const result = spawnSync("java", ["-version"], { encoding: "utf8" });

  if (result.error || result.status !== 0) {
    warn("Java niet gevonden. Android builds/emulator kunnen falen zonder JDK 17+.");
    return;
  }

  const versionOutput = `${result.stderr || ""}${result.stdout || ""}`;
  const firstLine = versionOutput.split("\n").find(Boolean)?.trim() || "Java gevonden";
  ok(`Java beschikbaar: ${firstLine}`);
}

function checkNode() {
  const major = Number(process.versions.node.split(".")[0]);
  if (Number.isFinite(major) && major >= 18) {
    ok(`Node ${process.version} is ondersteund`);
  } else {
    warn(`Node ${process.version} gedetecteerd. Gebruik bij voorkeur Node 18+.`);
  }
}

info("Nexora doctor draait checks...");
checkNode();
ensureEnvFile("app/.env");
ensureEnvFile("server/.env");
checkJava();

if (process.exitCode && process.exitCode !== 0) {
  fail("Doctor afgerond met fouten.");
  process.exit(process.exitCode);
}

ok("Doctor afgerond. Je kunt nu npm run dev uitvoeren.");
