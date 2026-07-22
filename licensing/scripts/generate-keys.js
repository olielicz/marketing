#!/usr/bin/env node
/**
 * One-time setup: generates the Ed25519 signing keypair used to sign
 * activation tokens. Run this once, ever, per license server deployment.
 *
 * Usage: node scripts/generate-keys.js
 */
import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.OLI_LICENSE_DATA_DIR || path.join(__dirname, "..", "data");
const keysDir = path.join(dataDir, "keys");

if (existsSync(path.join(keysDir, "private.pem"))) {
  console.error(
    "A keypair already exists at " +
      path.join(keysDir, "private.pem") +
      ".\nRefusing to overwrite it — doing so would invalidate every token you've already issued.\n" +
      "Delete that file yourself first if you really intend to rotate keys."
  );
  process.exit(1);
}

mkdirSync(keysDir, { recursive: true });

const { publicKey, privateKey } = generateKeyPairSync("ed25519");

writeFileSync(path.join(keysDir, "private.pem"), privateKey.export({ type: "pkcs8", format: "pem" }));
writeFileSync(path.join(keysDir, "public.pem"), publicKey.export({ type: "spki", format: "pem" }));

console.log("Generated a new Ed25519 keypair:");
console.log("  " + path.join(keysDir, "private.pem") + "  (keep this SECRET — never commit it)");
console.log("  " + path.join(keysDir, "public.pem") + "   (safe to distribute — clients use this to verify tokens offline)");
