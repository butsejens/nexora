import os from "node:os";

const bypass = String(process.env.NEXORA_ALLOW_NON_MACBOOK || "").toLowerCase();
if (bypass === "1" || bypass === "true" || bypass === "yes") {
  process.exit(0);
}

const defaultHosts = [
  "MacBook-Pro-van-jens",
  "MacBook-Pro-van-jens.local",
];

const configured = String(process.env.NEXORA_ALLOWED_HOSTS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const allowedHosts = configured.length > 0 ? configured : defaultHosts;
const currentHost = os.hostname();

if (!allowedHosts.includes(currentHost)) {
  console.error("⛔ Beveiliging: deze actie is alleen toegestaan vanaf je geautoriseerde MacBook.");
  console.error(`Host: ${currentHost}`);
  console.error(`Toegestaan: ${allowedHosts.join(", ")}`);
  console.error("Gebruik NEXORA_ALLOWED_HOSTS om hostnamen te beheren of NEXORA_ALLOW_NON_MACBOOK=1 als tijdelijke override.");
  process.exit(1);
}

console.log(`✅ MacBook check geslaagd (${currentHost})`);
