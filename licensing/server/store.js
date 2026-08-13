/**
 * Tiny JSON-file-backed data store for licenses and their activated devices.
 *
 * This is intentionally simple — a single JSON file with an in-process write
 * queue to avoid concurrent-write corruption. At the scale of "a few hundred
 * to a few thousand license keys for an indie product line," this is more
 * than sufficient and avoids requiring a database (and its hosting cost) for
 * something this small. If this product line ever needs real concurrent-write
 * scale, swap this module for a real database — every other module in this
 * server talks to it through the functions exported here, so that's the only
 * file that would need to change.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { TIER_LIMITS, resolveTierLimits } from "./tierLimits.js";

const DATA_DIR = process.env.OLI_LICENSE_DATA_DIR || path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "licenses.json");

function ensureDb() {
  mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(DB_FILE)) {
    writeFileSync(DB_FILE, JSON.stringify({ licenses: {} }, null, 2));
  }
}

function readDb() {
  ensureDb();
  try {
    return JSON.parse(readFileSync(DB_FILE, "utf8"));
  } catch (err) {
    throw new Error(`License database at ${DB_FILE} is corrupted: ${err.message}`);
  }
}

// A very small async write queue so concurrent requests don't interleave
// writes and corrupt the file. Good enough for a single-process Node server.
let writeQueue = Promise.resolve();
function writeDb(db) {
  writeQueue = writeQueue.then(
    () => writeFileSync(DB_FILE, JSON.stringify(db, null, 2)),
    () => writeFileSync(DB_FILE, JSON.stringify(db, null, 2))
  );
  return writeQueue;
}

/**
 * FIX: tier-based real enforcement. Every one of the 4 self-hosted products
 * (OliOps/OliCommerce/OliFlow/OliExplore) sells 3 priced tiers (e.g.
 * Starter/Pro/Agency) but, before this change, every license everywhere
 * used the exact same DEFAULT_MAX_DEVICES regardless of what a customer
 * paid — there was no `tier` concept on a license at all, so "Pro" and
 * "Agency" were pure marketing text with nothing enforced server-side.
 *
 * `tier` is now a REQUIRED field on every license, and `maxDevices` /
 * `maxUsers` are looked up from TIER_LIMITS (tierLimits.js) for that
 * product+tier — an explicit `maxDevices`/`maxUsers` override is still
 * accepted (e.g. for a hand-negotiated enterprise deal) but the normal
 * path is "buy Pro, get Pro's real limits," not "buy Pro, get whatever
 * the global default happens to be today."
 */
export async function createLicense({ key, product, tier, email, maxDevices, maxUsers, note }) {
  const db = readDb();
  if (db.licenses[key]) {
    throw new Error(`License key ${key} already exists`);
  }
  const limits = resolveTierLimits(product, tier);
  db.licenses[key] = {
    key,
    product, // "OPS" | "COM" | "FLW" | "EXP" | "ALL"
    tier: limits.tier, // e.g. "starter" | "pro" | "agency" — drives the real limits below
    email: email || null,
    note: note || null,
    maxDevices: Number(maxDevices) > 0 ? Number(maxDevices) : limits.maxDevices,
    maxUsers: Number(maxUsers) > 0 ? Number(maxUsers) : limits.maxUsers,
    createdAt: new Date().toISOString(),
    revoked: false,
    devices: {}, // deviceId -> { activatedAt, lastSeenAt }
    users: {}, // userId -> { email, role, addedAt } — staff/team seats under this license (see maxUsers)
  };
  await writeDb(db);
  return db.licenses[key];
}

export async function getLicense(key) {
  const db = readDb();
  return db.licenses[key] || null;
}

export async function listLicenses() {
  const db = readDb();
  return Object.values(db.licenses);
}

export async function revokeLicense(key) {
  const db = readDb();
  const lic = db.licenses[key];
  if (!lic) return null;
  lic.revoked = true;
  await writeDb(db);
  return lic;
}

/**
 * Registers (or re-confirms) a device against a license.
 * Returns { ok: true, license } or { ok: false, reason }.
 * reason is one of: "not_found" | "revoked" | "device_limit_reached"
 */
export async function activateDevice({ key, deviceId }) {
  const db = readDb();
  const lic = db.licenses[key];
  if (!lic) return { ok: false, reason: "not_found" };
  if (lic.revoked) return { ok: false, reason: "revoked" };

  const alreadyRegistered = Object.prototype.hasOwnProperty.call(lic.devices, deviceId);
  const distinctDeviceCount = Object.keys(lic.devices).length;

  if (!alreadyRegistered && distinctDeviceCount >= lic.maxDevices) {
    return { ok: false, reason: "device_limit_reached", license: lic };
  }

  const now = new Date().toISOString();
  lic.devices[deviceId] = {
    activatedAt: lic.devices[deviceId]?.activatedAt || now,
    lastSeenAt: now,
  };
  await writeDb(db);
  return { ok: true, license: lic };
}

export async function deactivateDevice({ key, deviceId }) {
  const db = readDb();
  const lic = db.licenses[key];
  if (!lic) return { ok: false, reason: "not_found" };
  delete lic.devices[deviceId];
  await writeDb(db);
  return { ok: true, license: lic };
}

/**
 * Adds a staff/team seat (OliOps/OliFlow), a connected store (OliCommerce),
 * or a connected social account (OliExplore) under a license — the exact
 * meaning of "user" is product-specific (see tierLimits.js's per-product
 * comments) but the enforcement mechanism is identical everywhere: count
 * how many distinct userId values are already registered, and refuse a
 * NEW one once `maxUsers` is reached. Re-adding an already-registered
 * userId is always allowed (e.g. the product re-syncing on startup),
 * exactly mirroring activateDevice()'s existing behavior for devices.
 * Returns { ok: true, license } or { ok: false, reason }.
 * reason is one of: "not_found" | "revoked" | "user_limit_reached"
 */
export async function addUser({ key, userId, email, role }) {
  const db = readDb();
  const lic = db.licenses[key];
  if (!lic) return { ok: false, reason: "not_found" };
  if (lic.revoked) return { ok: false, reason: "revoked" };
  if (!lic.users) lic.users = {}; // back-compat for licenses created before this field existed

  const alreadyRegistered = Object.prototype.hasOwnProperty.call(lic.users, userId);
  const distinctUserCount = Object.keys(lic.users).length;

  if (!alreadyRegistered && distinctUserCount >= lic.maxUsers) {
    return { ok: false, reason: "user_limit_reached", license: lic };
  }

  lic.users[userId] = {
    email: email || lic.users[userId]?.email || null,
    role: role || lic.users[userId]?.role || "member",
    addedAt: lic.users[userId]?.addedAt || new Date().toISOString(),
  };
  await writeDb(db);
  return { ok: true, license: lic };
}

export async function removeUser({ key, userId }) {
  const db = readDb();
  const lic = db.licenses[key];
  if (!lic) return { ok: false, reason: "not_found" };
  if (lic.users) delete lic.users[userId];
  await writeDb(db);
  return { ok: true, license: lic };
}
