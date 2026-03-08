import fs from "node:fs";
import crypto from "node:crypto";

function usage() {
  console.log("Usage:");
  console.log("  node scripts/secrets-crypto.mjs encrypt <inputFile> <outputFile>");
  console.log("  node scripts/secrets-crypto.mjs decrypt <inputFile> <outputFile>");
  console.log("Requires: NEXORA_SECRETS_PASSPHRASE");
}

function getPassphrase() {
  const passphrase = String(process.env.NEXORA_SECRETS_PASSPHRASE || "");
  if (!passphrase) {
    throw new Error("NEXORA_SECRETS_PASSPHRASE ontbreekt.");
  }
  return passphrase;
}

function deriveKey(passphrase, salt) {
  return crypto.scryptSync(passphrase, salt, 32);
}

function encryptText(plainText, passphrase) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveKey(passphrase, salt);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return JSON.stringify({
    version: 1,
    algorithm: "aes-256-gcm",
    kdf: "scrypt",
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
  }, null, 2);
}

function decryptText(payloadText, passphrase) {
  const payload = JSON.parse(payloadText);
  const salt = Buffer.from(String(payload.salt || ""), "base64");
  const iv = Buffer.from(String(payload.iv || ""), "base64");
  const tag = Buffer.from(String(payload.tag || ""), "base64");
  const data = Buffer.from(String(payload.data || ""), "base64");

  const key = deriveKey(passphrase, salt);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]);
  return plain.toString("utf8");
}

function run() {
  const [, , mode, inputFile, outputFile] = process.argv;
  if (!mode || !inputFile || !outputFile) {
    usage();
    process.exit(1);
  }

  const passphrase = getPassphrase();

  if (!fs.existsSync(inputFile)) {
    throw new Error(`Bestand niet gevonden: ${inputFile}`);
  }

  const source = fs.readFileSync(inputFile, "utf8");

  if (mode === "encrypt") {
    const encrypted = encryptText(source, passphrase);
    fs.writeFileSync(outputFile, encrypted, "utf8");
    console.log(`🔐 Versleuteld: ${inputFile} -> ${outputFile}`);
    return;
  }

  if (mode === "decrypt") {
    const plain = decryptText(source, passphrase);
    fs.writeFileSync(outputFile, plain, "utf8");
    console.log(`🔓 Ontsleuteld: ${inputFile} -> ${outputFile}`);
    return;
  }

  usage();
  process.exit(1);
}

run();
