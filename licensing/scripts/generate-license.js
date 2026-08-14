#!/usr/bin/env node
/**
 * CLI for minting a new serial code, without needing the server to be
 * running — writes directly to the same JSON data file the server reads.
 *
 * Usage:
 *   node scripts/generate-license.js --product oliops --email jane@example.com
 *   node scripts/generate-license.js --product all --max-devices 10 --note "AppSumo bundle buyer"
 *
 * --product accepts: oliops | olicommerce | oliflow | oliexplore | all
 */
import { createLicense, getLicense } from "../server/store.js";
import { generateSerialCode } from "../server/licenseKey.js";
import { tierKeysFor } from "../server/tierLimits.js";

const PRODUCT_MAP = {
  oliops: "OPS",
  olicommerce: "COM",
  oliflow: "FLW",
  oliexplore: "EXP",
  all: "ALL",
};

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--product") args.product = argv[++i];
    else if (arg === "--tier") args.tier = argv[++i];
    else if (arg === "--email") args.email = argv[++i];
    else if (arg === "--max-devices") args.maxDevices = Number(argv[++i]);
    else if (arg === "--max-users") args.maxUsers = Number(argv[++i]);
    else if (arg === "--note") args.note = argv[++i];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const productCode = PRODUCT_MAP[String(args.product || "").toLowerCase()];

function usage() {
  console.error(
    `Usage: node scripts/generate-license.js --product <oliops|olicommerce|oliflow|oliexplore|all> --tier <tier> [--email you@example.com] [--max-devices N] [--max-users N] [--note "..."]`
  );
  console.error(`\nValid --tier values per product (from tierLimits.js — the REAL, enforced limits, not just a label):`);
  for (const [name, code] of Object.entries(PRODUCT_MAP)) {
    if (code === "ALL") continue;
    console.error(`  ${name.padEnd(12)} ${tierKeysFor(code).join(", ")}`);
  }
}

if (!productCode) {
  usage();
  process.exit(1);
}

// FIX: --tier used to not exist at all — every license, regardless of what
// a customer paid, got the exact same global default maxDevices (5) and
// nothing else varied. --tier is now REQUIRED (except for the "all"
// bundle code, which isn't sold at a specific price point) so a generated
// license's real limits (device cap AND user/seat/store/account cap —
// see tierLimits.js) actually match what the customer paid for.
if (productCode !== "ALL" && !args.tier) {
  console.error(`\n❌ --tier is required for product "${args.product}".\n`);
  usage();
  process.exit(1);
}
if (productCode !== "ALL" && !tierKeysFor(productCode).includes(String(args.tier).toLowerCase())) {
  console.error(`\n❌ "${args.tier}" is not a valid tier for ${args.product}.\n`);
  usage();
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
  tier: args.tier,
  email: args.email || null,
  maxDevices: args.maxDevices,
  maxUsers: args.maxUsers,
  note: args.note || null,
});

console.log("\n✅ New license created:\n");
console.log("   Serial code:  " + license.key);
console.log("   Product:      " + license.product);
console.log("   Tier:         " + license.tier);
console.log("   Max devices:  " + license.maxDevices);
console.log("   Max users:    " + license.maxUsers + "  (staff seats / stores / accounts — see tierLimits.js for what this means for this product)");
if (license.email) console.log("   Email:        " + license.email);
console.log("\nSend the serial code above to the customer. They enter it once per device on first run.\n");
