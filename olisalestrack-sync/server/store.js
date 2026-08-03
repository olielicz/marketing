/**
 * Tiny JSON-file-backed event store, following the same pattern as
 * licensing/server/store.js in this repo. Good enough for a single-tenant
 * indie deployment; swap for a real database if this ever needs to handle
 * genuinely concurrent multi-tenant write volume.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.OLI_SYNC_DATA_DIR || path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "events.json");
const MAX_EVENTS = 20000; // simple retention cap so the file can't grow unbounded

function ensureDb() {
  mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(DB_FILE)) {
    writeFileSync(DB_FILE, JSON.stringify({ events: [], seenIds: {} }, null, 2));
  }
}

function readDb() {
  ensureDb();
  try {
    return JSON.parse(readFileSync(DB_FILE, "utf8"));
  } catch (err) {
    throw new Error(`Event database at ${DB_FILE} is corrupted: ${err.message}`);
  }
}

let writeQueue = Promise.resolve();
function writeDb(db) {
  writeQueue = writeQueue.then(
    () => writeFileSync(DB_FILE, JSON.stringify(db, null, 2)),
    () => writeFileSync(DB_FILE, JSON.stringify(db, null, 2))
  );
  return writeQueue;
}

/**
 * Appends new normalized records, skipping any whose `id` has already been
 * stored (webhooks are frequently retried/redelivered by every provider, so
 * de-duplication by id is required for accurate totals).
 * Returns the records that were actually newly inserted (i.e. not duplicates).
 */
export async function appendEvents(records) {
  if (!records || !records.length) return [];
  const db = readDb();
  const inserted = [];
  for (const record of records) {
    if (db.seenIds[record.id]) continue;
    db.seenIds[record.id] = true;
    db.events.push(record);
    inserted.push(record);
  }
  if (db.events.length > MAX_EVENTS) {
    const overflow = db.events.length - MAX_EVENTS;
    const dropped = db.events.splice(0, overflow);
    for (const d of dropped) delete db.seenIds[d.id];
  }
  if (inserted.length) await writeDb(db);
  return inserted;
}

/**
 * Returns events, optionally filtered by a minimum occurredAt (ISO string)
 * and/or provider. Used by GET /api/events for OliSalesTrack to pull new
 * records since its last sync.
 */
export async function listEvents({ since, provider } = {}) {
  const db = readDb();
  let events = db.events;
  if (since) {
    const sinceTime = new Date(since).getTime();
    events = events.filter((e) => new Date(e.occurredAt).getTime() >= sinceTime);
  }
  if (provider) {
    events = events.filter((e) => e.provider === provider);
  }
  return events.slice().sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt));
}
