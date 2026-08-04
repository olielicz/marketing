#!/usr/bin/env node
/**
 * One-time setup: creates the ONE owner/operator account for this
 * self-hosted OliOps instance. Refuses to run if an owner already
 * exists — see server/store.js's createOwner().
 *
 * Usage:
 *   node scripts/create-owner.js --username you@yourbusiness.com
 *   node scripts/create-owner.js --username you@yourbusiness.com --password "a-password-you-chose"
 *
 * If --password is omitted, a strong random password is generated and
 * printed ONCE. It is never stored in plaintext — only its scrypt hash
 * is persisted.
 */
import { randomBytes } from "node:crypto";
import { getOwner, createOwner } from "../server/store.js";
import { hashPassword } from "../server/auth.js";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--username") args.username = argv[++i];
    else if (argv[i] === "--password") args.password = argv[++i];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (!args.username || !args.username.includes("@")) {
  console.error('Usage: node scripts/create-owner.js --username you@yourbusiness.com [--password "..."]');
  process.exit(1);
}

const existing = await getOwner();
if (existing) {
  console.error(
    `An owner account already exists (username: ${existing.username}, created ${existing.createdAt}).\n` +
    "Refusing to overwrite it. Log in and use the change-password flow instead, or delete data/oliops.json\n" +
    "yourself first if you really intend to start over (this also deletes every contact/task/invoice)."
  );
  process.exit(1);
}

const password = args.password || randomBytes(20).toString("base64url");
const { salt, hash } = hashPassword(password);
const owner = await createOwner({ username: args.username.trim(), salt, hash });

console.log("\n" + "=".repeat(70));
console.log("  OLIOPS OWNER ACCOUNT CREATED");
console.log("=".repeat(70));
console.log(`  Username:  ${owner.username}`);
console.log(`  Password:  ${password}`);
console.log("=".repeat(70));
console.log("\nSave this password now — it is not stored anywhere in plaintext.");
console.log("\nNext: npm start, then open ../app/index.html and log in.\n");
