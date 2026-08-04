/**
 * JSON-file-backed persistence for OliCommerce. Same intentionally-simple
 * pattern as every other backend service in this repo — a single JSON
 * file with an in-process write queue.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const DATA_DIR = process.env.OLICOMMERCE_DATA_DIR || path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "olicommerce.json");

function ensureDb() {
  mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(DB_FILE)) {
    writeFileSync(
      DB_FILE,
      JSON.stringify({ owner: null, sessions: {}, failedAttempts: {}, carts: {}, seenCartIds: {} }, null, 2),
      { mode: 0o600 }
    );
  }
}

function readDb() {
  ensureDb();
  try {
    return JSON.parse(readFileSync(DB_FILE, "utf8"));
  } catch (err) {
    throw new Error(`OliCommerce database at ${DB_FILE} is corrupted: ${err.message}`);
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

/* ------------------------- Owner + sessions (identical pattern to admin-auth/oliops-backend) ------------------------- */

export async function getOwner() { return readDb().owner; }

export async function createOwner({ username, salt, hash }) {
  const db = readDb();
  if (db.owner) throw new Error("An owner account already exists for this OliCommerce instance.");
  db.owner = { username, salt, hash, createdAt: new Date().toISOString(), lastLoginAt: null, lastLoginIp: null };
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

export async function createSession({ sessionId, expiresAt, ip, userAgent }) {
  const db = readDb();
  db.sessions[sessionId] = { createdAt: new Date().toISOString(), expiresAt, revoked: false, ip: ip || null, userAgent: userAgent || null, lastSeenAt: new Date().toISOString() };
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

export async function revokeSession(sessionId) {
  const db = readDb();
  if (db.sessions[sessionId]) {
    db.sessions[sessionId].revoked = true;
    await writeDb(db);
    return true;
  }
  return false;
}

export async function revokeAllSessions() {
  const db = readDb();
  let count = 0;
  for (const session of Object.values(db.sessions)) {
    if (!session.revoked) { session.revoked = true; count++; }
  }
  await writeDb(db);
  return count;
}

export async function recordFailedAttempt(key) {
  const db = readDb();
  if (!db.failedAttempts[key]) db.failedAttempts[key] = [];
  db.failedAttempts[key].push(Date.now());
  await writeDb(db);
}

export async function clearFailedAttempts(key) {
  const db = readDb();
  delete db.failedAttempts[key];
  await writeDb(db);
}

export async function countRecentFailedAttempts(key, windowMs) {
  const db = readDb();
  const attempts = db.failedAttempts[key] || [];
  const cutoff = Date.now() - windowMs;
  const recent = attempts.filter((t) => t > cutoff);
  if (recent.length !== attempts.length) {
    db.failedAttempts[key] = recent;
    await writeDb(db);
  }
  return recent.length;
}

/* ------------------------------------- Abandoned carts ------------------------------------- */

export async function listCarts({ status } = {}) {
  const db = readDb();
  let carts = Object.values(db.carts);
  if (status) carts = carts.filter((c) => c.status === status);
  return carts.sort((a, b) => new Date(b.abandonedAt) - new Date(a.abandonedAt));
}

export async function getCart(id) {
  const db = readDb();
  return db.carts[id] || null;
}

/**
 * Captures (or updates) an abandoned cart from a storefront webhook. Uses
 * the source platform's own cart/checkout id (externalId) to de-dupe —
 * a Shopify "checkout was updated" webhook re-firing for the same
 * checkout should update the existing record, not create a duplicate.
 */
export async function upsertCart({ externalId, source, customerEmail, customerName, items, cartValueCents, currency, checkoutUrl }) {
  const db = readDb();
  const existingId = db.seenCartIds[externalId];

  const normalizedItems = (items || []).map((item) => ({
    title: item.title || item.name || "Item",
    quantity: Number(item.quantity) || 1,
    priceCents: Math.round(Number(item.priceCents ?? item.price_cents ?? (item.price ? item.price * 100 : 0)) || 0),
  }));
  const computedValueCents = cartValueCents != null
    ? Math.round(Number(cartValueCents))
    : normalizedItems.reduce((sum, i) => sum + i.quantity * i.priceCents, 0);

  if (existingId && db.carts[existingId]) {
    const cart = db.carts[existingId];
    cart.customerEmail = customerEmail || cart.customerEmail;
    cart.customerName = customerName || cart.customerName;
    cart.items = normalizedItems.length ? normalizedItems : cart.items;
    cart.cartValueCents = computedValueCents;
    cart.currency = currency || cart.currency;
    cart.checkoutUrl = checkoutUrl || cart.checkoutUrl;
    cart.updatedAt = new Date().toISOString();
    await writeDb(db);
    return { cart, isNew: false };
  }

  const id = randomUUID();
  const cart = {
    id,
    externalId,
    source: source || "unknown",
    customerEmail: customerEmail || "",
    customerName: customerName || "",
    items: normalizedItems,
    cartValueCents: computedValueCents,
    currency: currency || "USD",
    checkoutUrl: checkoutUrl || "",
    status: "abandoned", // abandoned | recovery_sent | recovered
    abandonedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    recoveryEmailsSent: [],
  };
  db.carts[id] = cart;
  db.seenCartIds[externalId] = id;
  await writeDb(db);
  return { cart, isNew: true };
}

export async function markCartStatus(id, status) {
  const db = readDb();
  const cart = db.carts[id];
  if (!cart) return null;
  cart.status = status;
  cart.updatedAt = new Date().toISOString();
  await writeDb(db);
  return cart;
}

export async function recordRecoveryEmailSent(id, { subject, tone }) {
  const db = readDb();
  const cart = db.carts[id];
  if (!cart) return null;
  cart.recoveryEmailsSent.push({ sentAt: new Date().toISOString(), subject, tone });
  if (cart.status === "abandoned") cart.status = "recovery_sent";
  cart.updatedAt = new Date().toISOString();
  await writeDb(db);
  return cart;
}

export async function deleteCart(id) {
  const db = readDb();
  if (!db.carts[id]) return false;
  delete db.carts[id];
  for (const [extId, mappedId] of Object.entries(db.seenCartIds)) {
    if (mappedId === id) delete db.seenCartIds[extId];
  }
  await writeDb(db);
  return true;
}
