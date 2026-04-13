import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import crypto from "node:crypto";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const cryptoScript = path.join(repoRoot, "scripts", "secrets-crypto.mjs");
const serviceName = "nexora-secrets-passphrase";

const targets = [
  { label: "app", plain: path.join(repoRoot, "app", ".env"), enc: path.join(repoRoot, "app", ".env.enc") },
  { label: "server", plain: path.join(repoRoot, "server", ".env"), enc: path.join(repoRoot, "server", ".env.enc") },
];

function run(command, env = process.env) {
  execSync(command, { cwd: repoRoot, stdio: "inherit", env });
}

function tryReadKeychainPassphrase() {
  try {
    const value = execSync(`security find-generic-password -a \"${process.env.USER || ""}\" -s \"${serviceName}\" -w`, {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString("utf8")
      .trim();
    return value || "";
  } catch {
    return "";
  }
}

function saveKeychainPassphrase(passphrase) {
  try {
    execSync(`security add-generic-password -a \"${process.env.USER || ""}\" -s \"${serviceName}\" -w \"${passphrase}\" -U`, {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function resolvePassphrase({ createIfMissing = false } = {}) {
  const fromEnv = String(process.env.NEXORA_SECRETS_PASSPHRASE || "").trim();
  if (fromEnv) return fromEnv;

  const fromKeychain = tryReadKeychainPassphrase();
  if (fromKeychain) return fromKeychain;

  if (!createIfMissing) return "";
  const generated = crypto.randomBytes(48).toString("base64url");
  saveKeychainPassphrase(generated);
  return generated;
}

function removePlainEnvFiles() {
  for (const target of targets) {
    if (!fs.existsSync(target.plain)) continue;
    fs.rmSync(target.plain, { force: true });
    console.log(`🧹 verwijderd: ${path.relative(repoRoot, target.plain)}`);
  }
}

function ensureDecryptedFiles() {
  const passphrase = resolvePassphrase({ createIfMissing: false });
  if (!passphrase) {
    console.warn("⚠️ Geen passphrase in ENV/Keychain. Auto-decrypt overgeslagen.");
    return;
  }

  for (const target of targets) {
    if (fs.existsSync(target.plain)) continue;
    if (!fs.existsSync(target.enc)) continue;

    run(`node ${JSON.stringify(cryptoScript)} decrypt ${JSON.stringify(target.enc)} ${JSON.stringify(target.plain)}`, {
      ...process.env,
      NEXORA_SECRETS_PASSPHRASE: passphrase,
    });
  }
}

function encryptAndLock() {
  const passphrase = resolvePassphrase({ createIfMissing: true });
  if (!passphrase) {
    throw new Error("Kon geen passphrase initialiseren.");
  }

  for (const target of targets) {
    if (!fs.existsSync(target.plain)) continue;
    run(`node ${JSON.stringify(cryptoScript)} encrypt ${JSON.stringify(target.plain)} ${JSON.stringify(target.enc)}`, {
      ...process.env,
      NEXORA_SECRETS_PASSPHRASE: passphrase,
    });
  }

  removePlainEnvFiles();
  console.log("✅ Secrets encrypted + plaintext verwijderd.");
}

function initPassphrase() {
  const existing = resolvePassphrase({ createIfMissing: false });
  if (existing) {
    console.log("✅ Passphrase bestaat al in ENV/Keychain.");
    return;
  }
  const generated = resolvePassphrase({ createIfMissing: true });
  if (!generated) throw new Error("Kon passphrase niet genereren.");
  console.log("✅ Nieuwe passphrase opgeslagen in macOS Keychain.");
}

function main() {
  const command = String(process.argv[2] || "ensure").toLowerCase();

  if (command === "init") {
    initPassphrase();
    return;
  }
  if (command === "ensure") {
    ensureDecryptedFiles();
    return;
  }
  if (command === "lock") {
    encryptAndLock();
    return;
  }

  console.log("Usage: node scripts/secrets-auto.mjs <init|ensure|lock>");
  process.exit(1);
}

main();
