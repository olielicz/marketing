#!/usr/bin/env node
/**
 * One-time setup: creates the SINGLE owner admin account. Refuses to run
 * if an owner already exists (use change-password via the API instead of
 * re-running this, so session/login history isn't lost — see store.js's
 * createOwner()).
 *
 * Usage:
 *   node scripts/create-owner.js --username you@example.com
 *   node scripts/create-owner.js --username you@example.com --password "a-password-you-chose"
 *
 * If --password is omitted, a strong random password is generated for you
 * and printed ONCE. This is the recommended way to run it — it means no
 * plaintext password ever has to be typed into a shell history file or a
 * command you might paste into the wrong place.
 *
 * ⚠️ The password is printed to your terminal exactly once, right after
 * this script runs, and is never stored anywhere in plaintext — only its
 * scrypt hash is persisted (see server/crypto.js). If you lose it, you
 * cannot recover it — you can only set a new one, either by logging in
 * and calling POST /api/change-password, or (if you're locked out
 * entirely) by deleting data/admin.json and re-running this script.
 */
import { randomBytes } from "node:crypto";
import { getOwner, createOwner } from "../server/store.js";
import { hashPassword } from "../server/crypto.js";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--username") args.username = argv[++i];
    else if (argv[i] === "--password") args.password = argv[++i];
  }
  return args;
}

function generateStrongPassword() {
  // 20 random bytes -> base64url is a clean, copy-pasteable, high-entropy
  // password (~26-27 chars, well over the 12-char minimum this service
  // enforces on password *changes* — this initial one is stronger by
  // default specifically because it's the one credential every other
  // admin surface in this repo will ultimately trust).
  return randomBytes(20).toString("base64url");
}

const args = parseArgs(process.argv.slice(2));

if (!args.username || !args.username.includes("@")) {
  console.error('Usage: node scripts/create-owner.js --username you@example.com [--password "..."]');
  process.exit(1);
}

const existing = await getOwner();
if (existing) {
  console.error(
    `An owner account already exists (username: ${existing.username}, created ${existing.createdAt}).\n` +
    "Refusing to overwrite it. To change the password, log in and call POST /api/change-password,\n" +
    "or delete data/admin.json yourself first if you really intend to start over from scratch\n" +
    "(this also revokes every session and forgets login history)."
  );
  process.exit(1);
}

const password = args.password || generateStrongPassword();
const { salt, hash } = hashPassword(password);
const owner = await createOwner({ username: args.username.trim(), salt, hash });

console.log("\n" + "=".repeat(70));
console.log("  OLI ADMIN ACCOUNT CREATED");
console.log("=".repeat(70));
console.log(`  Username:  ${owner.username}`);
console.log(`  Password:  ${password}`);
console.log("=".repeat(70));
console.log("\n⚠️  This password is shown ONLY this once and is not stored anywhere");
console.log("   in plaintext — save it in a password manager right now.");
console.log("\nNext steps:");
console.log("  1. Start the server:  npm start");
console.log("  2. Log in:  POST /api/login  { \"username\": \"" + owner.username + "\", \"password\": \"<the password above>\" }");
console.log("  3. See README.md for how other Oli services should verify tokens");
console.log("     issued by this server before trusting a request as \"the owner\".\n");
