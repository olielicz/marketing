/**
 * JSON-file-backed persistence for OliFlow Executor's support tickets.
 * Same intentionally-simple pattern as every other backend service in
 * this repo (oliops-backend, olicommerce-backend, licensing) — a single
 * JSON file with an in-process write queue.
 *
 * This is the FIRST piece of real persistence oliflow-executor has ever
 * needed — every other endpoint in this service (POST /api/execute) is
 * stateless request/response by design (see index.js's header comment:
 * "No retry logic, no dead-letter queue, no execution history
 * persistence... every run is fire-and-forget"). Support tickets are a
 * genuinely different case: they need to survive past a single request/
 * response cycle so a human can follow up later, so a real (if tiny)
 * data store is the honest way to build that — not a workaround.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const DATA_DIR = process.env.OLIFLOW_EXECUTOR_DATA_DIR || path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "oliflow-executor.json");

function ensureDb() {
  mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(DB_FILE)) {
    writeFileSync(DB_FILE, JSON.stringify({ supportTickets: {} }, null, 2), { mode: 0o600 });
  }
}

function readDb() {
  ensureDb();
  try {
    const db = JSON.parse(readFileSync(DB_FILE, "utf8"));
    if (!db.supportTickets) db.supportTickets = {};
    return db;
  } catch (err) {
    throw new Error(`OliFlow Executor database at ${DB_FILE} is corrupted: ${err.message}`);
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

/* --------------------------------- Support tickets --------------------------------- */

export async function listSupportTickets({ status } = {}) {
  const db = readDb();
  let tickets = Object.values(db.supportTickets);
  if (status) tickets = tickets.filter((t) => t.status === status);
  return tickets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function getSupportTicket(id) {
  const db = readDb();
  return db.supportTickets[id] || null;
}

export async function createSupportTicket({ subject, transcript, contactEmail, contactName, reason }) {
  const db = readDb();
  const id = randomUUID();
  const ticket = {
    id,
    subject: subject || "Support request",
    transcript: transcript || [],
    contactEmail: contactEmail || "",
    contactName: contactName || "",
    reason: reason || "escalated_by_assistant",
    status: "open",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.supportTickets[id] = ticket;
  await writeDb(db);
  return ticket;
}

export async function updateSupportTicketStatus(id, status) {
  const db = readDb();
  const ticket = db.supportTickets[id];
  if (!ticket) return null;
  ticket.status = status;
  ticket.updatedAt = new Date().toISOString();
  await writeDb(db);
  return ticket;
}

export async function deleteSupportTicket(id) {
  const db = readDb();
  if (!db.supportTickets[id]) return false;
  delete db.supportTickets[id];
  await writeDb(db);
  return true;
}
