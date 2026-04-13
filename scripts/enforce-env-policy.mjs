import fs from "node:fs";
import path from "node:path";

const mode = String(process.argv[2] || "dev").toLowerCase();
const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);

const entries = [
  { name: "app", plain: path.join(repoRoot, "app", ".env"), encrypted: path.join(repoRoot, "app", ".env.enc") },
  { name: "server", plain: path.join(repoRoot, "server", ".env"), encrypted: path.join(repoRoot, "server", ".env.enc") },
];

const allowPlain = ["1", "true", "yes"].includes(String(process.env.NEXORA_ALLOW_PLAINTEXT_ONLY || "").toLowerCase());
const strictEverywhere = ["1", "true", "yes"].includes(String(process.env.NEXORA_STRICT_ENV_POLICY || "").toLowerCase());
const strictMode = strictEverywhere || mode === "release";

const failures = [];
const warnings = [];

for (const entry of entries) {
  const hasPlain = fs.existsSync(entry.plain);
  const hasEncrypted = fs.existsSync(entry.encrypted);

  if (hasPlain && !hasEncrypted) {
    const message = `${entry.name}: ${path.relative(repoRoot, entry.plain)} bestaat, maar ${path.relative(repoRoot, entry.encrypted)} ontbreekt.`;
    if (strictMode && !allowPlain) failures.push(message);
    else warnings.push(message);
  }

  if (hasEncrypted && !hasPlain && !process.env.NEXORA_SECRETS_PASSPHRASE) {
    warnings.push(`${entry.name}: encrypted secrets aanwezig zonder plaintext .env. Draai \`npm run secrets:decrypt\` met NEXORA_SECRETS_PASSPHRASE.`);
  }
}

if (warnings.length > 0) {
  console.warn("⚠️ Env policy waarschuwingen:");
  for (const warning of warnings) console.warn(`- ${warning}`);
}

if (failures.length > 0) {
  console.error("⛔ Env policy blokkering:");
  for (const failure of failures) console.error(`- ${failure}`);
  console.error("Gebruik \`npm run secrets:encrypt\` om .env.enc te maken of tijdelijke override: NEXORA_ALLOW_PLAINTEXT_ONLY=1");
  process.exit(1);
}

console.log(`✅ Env policy check OK (${mode})`);
