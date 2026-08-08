/**
 * JSON-file-backed persistence for OliOps. Same intentionally-simple
 * pattern as every other backend service in this repo (licensing,
 * admin-auth, olisalestrack-sync) — a single JSON file with an
 * in-process write queue. Swap this module for a real database if/when
 * a customer's data volume genuinely outgrows it; every other file in
 * this service talks to storage only through the functions exported
 * here, so that's the one place such a swap would happen.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const DATA_DIR = process.env.OLIOPS_DATA_DIR || path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "oliops.json");

function ensureDb() {
  mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(DB_FILE)) {
    writeFileSync(
      DB_FILE,
      JSON.stringify({ owner: null, sessions: {}, failedAttempts: {}, contacts: {}, tasks: {}, invoices: {}, invoiceSeq: 0, supportTickets: {} }, null, 2),
      { mode: 0o600 }
    );
  }
}

function readDb() {
  ensureDb();
  try {
    const db = JSON.parse(readFileSync(DB_FILE, "utf8"));
    // Migration for databases created before supportTickets existed.
    if (!db.supportTickets) db.supportTickets = {};
    return db;
  } catch (err) {
    throw new Error(`OliOps database at ${DB_FILE} is corrupted: ${err.message}`);
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

/* ------------------------- Owner + sessions (identical pattern to admin-auth) ------------------------- */

export async function getOwner() {
  return readDb().owner;
}

export async function createOwner({ username, salt, hash }) {
  const db = readDb();
  if (db.owner) throw new Error("An owner account already exists for this OliOps instance.");
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

/* ------------------------------------- Contacts (CRM) ------------------------------------- */

export async function listContacts() {
  const db = readDb();
  return Object.values(db.contacts).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function getContact(id) {
  const db = readDb();
  return db.contacts[id] || null;
}

export async function createContact({ name, email, phone, company, notes, tags }) {
  const db = readDb();
  const id = randomUUID();
  const contact = {
    id,
    name: name || "",
    email: email || "",
    phone: phone || "",
    company: company || "",
    notes: notes || "",
    tags: Array.isArray(tags) ? tags : [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.contacts[id] = contact;
  await writeDb(db);
  return contact;
}

export async function updateContact(id, patch) {
  const db = readDb();
  const contact = db.contacts[id];
  if (!contact) return null;
  Object.assign(contact, patch, { updatedAt: new Date().toISOString() });
  await writeDb(db);
  return contact;
}

export async function deleteContact(id) {
  const db = readDb();
  if (!db.contacts[id]) return false;
  delete db.contacts[id];
  await writeDb(db);
  return true;
}

/* --------------------------------------- Tasks --------------------------------------- */

export async function listTasks() {
  const db = readDb();
  return Object.values(db.tasks).sort((a, b) => new Date(a.dueDate || "9999") - new Date(b.dueDate || "9999"));
}

export async function createTask({ title, description, dueDate, contactId, status }) {
  const db = readDb();
  const id = randomUUID();
  const task = {
    id,
    title: title || "",
    description: description || "",
    dueDate: dueDate || null,
    contactId: contactId || null,
    status: status || "open",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.tasks[id] = task;
  await writeDb(db);
  return task;
}

export async function updateTask(id, patch) {
  const db = readDb();
  const task = db.tasks[id];
  if (!task) return null;
  Object.assign(task, patch, { updatedAt: new Date().toISOString() });
  await writeDb(db);
  return task;
}

export async function deleteTask(id) {
  const db = readDb();
  if (!db.tasks[id]) return false;
  delete db.tasks[id];
  await writeDb(db);
  return true;
}

/* -------------------------------------- Invoices -------------------------------------- */

export async function listInvoices() {
  const db = readDb();
  return Object.values(db.invoices).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function getInvoice(id) {
  const db = readDb();
  return db.invoices[id] || null;
}

/**
 * Invoice numbers are sequential and gapless-per-instance (invoiceSeq is
 * a monotonically increasing counter, never reused even if an invoice is
 * later deleted) — matches standard bookkeeping practice where invoice
 * numbers should never repeat, even for voided/deleted invoices.
 */
export async function createInvoice({ contactId, contactName, items, notes, dueDate }) {
  const db = readDb();
  const id = randomUUID();
  db.invoiceSeq = (db.invoiceSeq || 0) + 1;
  const invoiceNumber = `INV-${String(db.invoiceSeq).padStart(5, "0")}`;

  const normalizedItems = (items || []).map((item) => ({
    description: item.description || "",
    quantity: Number(item.quantity) || 1,
    unitPriceCents: Math.round(Number(item.unitPriceCents) || 0),
  }));
  const totalCents = normalizedItems.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);

  const invoice = {
    id,
    invoiceNumber,
    contactId: contactId || null,
    contactName: contactName || "",
    items: normalizedItems,
    totalCents,
    notes: notes || "",
    dueDate: dueDate || null,
    status: "unpaid",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    paidAt: null,
  };
  db.invoices[id] = invoice;
  await writeDb(db);
  return invoice;
}

export async function markInvoicePaid(id) {
  const db = readDb();
  const invoice = db.invoices[id];
  if (!invoice) return null;
  invoice.status = "paid";
  invoice.paidAt = new Date().toISOString();
  invoice.updatedAt = new Date().toISOString();
  await writeDb(db);
  return invoice;
}

export async function deleteInvoice(id) {
  const db = readDb();
  if (!db.invoices[id]) return false;
  delete db.invoices[id];
  await writeDb(db);
  return true;
}


/* --------------------------------- Support tickets --------------------------------- */
// Created by the real AI Support Assistant (see supportAssistant.js) when
// it can't confidently answer a question from the knowledge base or AI,
// or when a customer explicitly asks to talk to a human. This is the
// real implementation of the escalation behavior already documented on
// the public /support/ page ("escalates anything it's not confident
// about to a real support ticket automatically").

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
    status: "open", // open | closed
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
