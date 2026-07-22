#!/usr/bin/env node
/**
 * CLI for minting a new serial code, without needing the server to be
 * running — writes directly to the same JSON data file the server reads.
 *
 * Usage:
 *   node scripts/generate-license.js --product oliops --email jane@example.com
 *   node scripts/generate-license.js --product all --max-devices 10 --note "AppSumo bundle buyer"
 *
 * --product accepts: oliops | olicommerce | oliflow | oliconnect | all
 */
import { createLicense, getLicense } from "../server/store.js";
import { generateSerialCode } from "../server/licenseKey.js";

const PRODUCT_MAP = {
  oliops: "OPS",
  olicommerce: "COM",
  oliflow: "FLW",
  oliconnect: "CNT",
  all: "ALL",
};

function parseArgs(argv) {
  const args = { maxDevices: 5 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--product") args.product = argv[++i];
    else if (arg === "--email") args.email = argv[++i];
    else if (arg === "--max-devices") args.maxDevices = Number(argv[++i]);
    else if (arg === "--note") args.note = argv[++i];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const productCode = PRODUCT_MAP[String(args.product || "").toLowerCase()];

if (!productCode) {
  console.error(
    `Usage: node scripts/generate-license.js --product <oliops|olicommerce|oliflow|oliconnect|all> [--email you@example.com] [--max-devices 5] [--note "..."]`
  );
  process.exit(1);
}

let key;
for (let attempt = 0; attempt < 5; attempt++) {
  const candidate = generateSerialCode(productCode);
  if (!(await getLicense(candidate))) {
    key = candidate;
    break;
  }
}
if (!key) {
  console.error("Failed to generate a unique license key after 5 attempts — try again.");
  process.exit(1);
}

const license = await createLicense({
  key,
  product: productCode,
  email: args.email || null,
  maxDevices: args.maxDevices > 0 ? args.maxDevices : 5,
  note: args.note || null,
});

console.log("\n✅ New license created:\n");
console.log("   Serial code:  " + license.key);
console.log("   Product:      " + license.product);
console.log("   Max devices:  " + license.maxDevices);
if (license.email) console.log("   Email:        " + license.email);
console.log("\nSend the serial code above to the customer. They enter it once per device on first run.\n");
