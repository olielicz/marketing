/**
 * JSON-file-backed persistence for the admin-auth service. Same pattern
 * as licensing/server/store.js and olisalestrack-sync/server/store.js —
 * a single JSON file with an in-process write queue. This service only
 * ever holds ONE owner account by design (see "Why exactly one account"
 * in README.md), so file-based storage is not just "fine at this scale,"
 * it's the entire scale.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.OLI_ADMIN_DATA_DIR || path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "admin.json");

function ensureDb() {
  mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(DB_FILE)) {
    writeFileSync(DB_FILE, JSON.stringify({ owner: null, sessions: {}, failedAttempts: {} }, null, 2), { mode: 0o600 });
  }
}

function readDb() {
  ensureDb();
  try {
    return JSON.parse(readFileSync(DB_FILE, "utf8"));
  } catch (err) {
    throw new Error(`Admin database at ${DB_FILE} is corrupted: ${err.message}`);
  }
}

let writeQueue = Promise.resolve();
function writeDb(db) {
  writeQueue = writeQueue.then(
    () => writeFileSync(DB_FILE, JSON.stringify(db, null, 2), { mode: 0o600 }),
    () => writeFileSync(DB_FILE, JSON.stringify(db, null, 2), { mode: 0o600 })
  );
  return writeQueue;
}

/** Returns the owner account record, or null if one has never been created. */
export async function getOwner() {
  const db = readDb();
  return db.owner;
}

/**
 * Creates the ONE owner account. Refuses if one already exists — use
 * changeOwnerPassword() to rotate credentials instead of ever deleting
 * and recreating this record, so session/audit history isn't lost.
 */
export async function createOwner({ username, salt, hash }) {
  const db = readDb();
  if (db.owner) {
    throw new Error("An owner account already exists. Use changeOwnerPassword() to update it instead of creating a new one.");
  }
  db.owner = {
    username,
    salt,
    hash,
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
    lastLoginIp: null,
  };
  await writeDb(db);
  return db.owner;
}

export async function updateOwnerPassword({ salt, hash }) {
  const db = readDb();
  if (!db.owner) throw new Error("No owner account exists yet.");
  db.owner.salt = salt;
  db.owner.hash = hash;
  db.owner.passwordChangedAt = new Date().toISOString();
  await writeDb(db);
  return db.owner;
}

export async function recordSuccessfulLogin({ ip }) {
  const db = readDb();
  if (!db.owner) return;
  db.owner.lastLoginAt = new Date().toISOString();
  db.owner.lastLoginIp = ip || null;
  await writeDb(db);
}

/* -------------------------------------------------------------------- */
/* Sessions — every issued token has a matching row here. A token whose  */
/* sessionId isn't in this table (or is past its expiresAt, or has been  */
/* explicitly revoked) is rejected even if its signature is valid — this */
/* is what makes logout / password-change / "kill all sessions" actually */
/* work, unlike a purely offline-verifiable token.                       */
/* -------------------------------------------------------------------- */

export async function createSession({ sessionId, expiresAt, ip, userAgent }) {
  const db = readDb();
  db.sessions[sessionId] = {
    createdAt: new Date().toISOString(),
    expiresAt,
    revoked: false,
    ip: ip || null,
    userAgent: userAgent || null,
    lastSeenAt: new Date().toISOString(),
  };
  await writeDb(db);
}

export async function isSessionActive(sessionId) {
  const db = readDb();
  const session = db.sessions[sessionId];
  if (!session) return false;
  if (session.revoked) return false;
  if (new Date(session.expiresAt).getTime() < Date.now()) return false;
  return true;
}

export async function touchSession(sessionId) {
  const db = readDb();
  if (db.sessions[sessionId]) {
    db.sessions[sessionId].lastSeenAt = new Date().toISOString();
    await writeDb(db);
  }
}

export async function revokeSession(sessionId) {
  const db = readDb();
  if (db.sessions[sessionId]) {
    db.sessions[sessionId].revoked = true;
    await writeDb(db);
    return true;
  }
  return false;
}

/** Revokes every active session — used after a password change, so a
 * stolen-but-not-yet-detected old session is killed immediately. */
export async function revokeAllSessions() {
  const db = readDb();
  let count = 0;
  for (const session of Object.values(db.sessions)) {
    if (!session.revoked) { session.revoked = true; count++; }
  }
  await writeDb(db);
  return count;
}

export async function listActiveSessions() {
  const db = readDb();
  const now = Date.now();
  return Object.entries(db.sessions)
    .filter(([, s]) => !s.revoked && new Date(s.expiresAt).getTime() >= now)
    .map(([sessionId, s]) => ({ sessionId, ...s }));
}

/* -------------------------------------------------------------------- */
/* Failed-login lockout — keyed by a client identifier (IP address).     */
/* -------------------------------------------------------------------- */

export async function recordFailedAttempt(key) {
  const db = readDb();
  const now = Date.now();
  if (!db.failedAttempts[key]) db.failedAttempts[key] = [];
  db.failedAttempts[key].push(now);
  await writeDb(db);
}

export async function clearFailedAttempts(key) {
  const db = readDb();
  delete db.failedAttempts[key];
  await writeDb(db);
}

/** Returns the count of failed attempts for `key` within the last `windowMs`. */
export async function countRecentFailedAttempts(key, windowMs) {
  const db = readDb();
  const attempts = db.failedAttempts[key] || [];
  const cutoff = Date.now() - windowMs;
  const recent = attempts.filter((t) => t > cutoff);
  if (recent.length !== attempts.length) {
    // Opportunistically prune old entries so this file doesn't grow forever.
    db.failedAttempts[key] = recent;
    await writeDb(db);
  }
  return recent.length;
}
