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

export async function createLicense({ key, product, email, maxDevices, note }) {
  const db = readDb();
  if (db.licenses[key]) {
    throw new Error(`License key ${key} already exists`);
  }
  db.licenses[key] = {
    key,
    product, // "OPS" | "COM" | "FLW" | "CNT" | "ALL"
    email: email || null,
    note: note || null,
    maxDevices,
    createdAt: new Date().toISOString(),
    revoked: false,
    devices: {}, // deviceId -> { activatedAt, lastSeenAt }
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
