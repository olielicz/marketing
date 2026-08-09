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
      JSON.stringify({
        owner: null, sessions: {}, failedAttempts: {}, contacts: {}, tasks: {}, invoices: {}, invoiceSeq: 0, supportTickets: {},
        employees: {}, timeEntries: {}, expenses: {}, taxSettings: null,
      }, null, 2),
      { mode: 0o600 }
    );
  }
}

function readDb() {
  ensureDb();
  try {
    const db = JSON.parse(readFileSync(DB_FILE, "utf8"));
    // Migrations for databases created before these collections existed.
    if (!db.supportTickets) db.supportTickets = {};
    if (!db.employees) db.employees = {};
    if (!db.timeEntries) db.timeEntries = {};
    if (!db.expenses) db.expenses = {};
    if (db.taxSettings === undefined) db.taxSettings = null;
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
 *
 * `taxRatePct` is a REAL, computed tax field — not the "automatic tax
 * calculation" that was previously marketed then removed for being
 * false. The distinction: this never guesses a jurisdiction's rate for
 * you. You (the business owner) supply the rate that applies to this
 * invoice — via a real tax_settings default (see get/updateTaxSettings
 * below, ported from OliCompute's real settings.js) or an explicit
 * per-invoice override — and the math (subtotal × rate, rounded to the
 * cent) is then genuinely computed, not left as a manual add-your-own
 * line item. This mirrors OliCompute's real invoices.js logic exactly.
 */
export async function createInvoice({ contactId, contactName, items, notes, dueDate, taxRatePct }) {
  const db = readDb();
  const id = randomUUID();
  db.invoiceSeq = (db.invoiceSeq || 0) + 1;
  const invoiceNumber = `INV-${String(db.invoiceSeq).padStart(5, "0")}`;

  const normalizedItems = (items || []).map((item) => ({
    description: item.description || "",
    quantity: Number(item.quantity) || 1,
    unitPriceCents: Math.round(Number(item.unitPriceCents) || 0),
  }));
  const subtotalCents = normalizedItems.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);

  const rate = taxRatePct !== undefined && taxRatePct !== null ? Number(taxRatePct) : (db.taxSettings?.defaultRatePct || 0);
  const safeRate = Number.isFinite(rate) && rate >= 0 ? rate : 0;
  const taxCents = Math.round((subtotalCents * safeRate) / 100);
  const totalCents = subtotalCents + taxCents;

  const invoice = {
    id,
    invoiceNumber,
    contactId: contactId || null,
    contactName: contactName || "",
    items: normalizedItems,
    subtotalCents,
    taxRatePct: safeRate,
    taxCents,
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


/* --------------------------------- Employees --------------------------------- */
// Ported from OliCompute's real server/services/employees.js — genuine
// employee records with hourly-vs-salary pay type, used by the real
// payroll calculation below. This is deliberately simple record-keeping
// (not tax withholding/filing — see README.md's "Explicit scope" note,
// which still applies: payroll TAX COMPLIANCE remains out of scope).
// What IS now real: computing what each employee is actually owed for a
// given month, from their real logged hours or real salary — the exact
// same math OliCompute's payroll.js performs.

export async function listEmployees() {
  const db = readDb();
  return Object.values(db.employees)
    .filter((e) => e.status !== "archived")
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function getEmployee(id) {
  const db = readDb();
  return db.employees[id] || null;
}

export async function createEmployee({ name, email, role, payType, hourlyRateCents, monthlySalaryCents, status, withholdingRatePct, allowances }) {
  const db = readDb();
  const id = randomUUID();
  const type = payType === "salary" ? "salary" : "hourly";
  const employee = {
    id,
    name: name || "",
    email: email || "",
    role: role || "",
    payType: type,
    hourlyRateCents: type === "hourly" ? Math.max(0, Math.round(Number(hourlyRateCents) || 0)) : 0,
    monthlySalaryCents: type === "salary" ? Math.max(0, Math.round(Number(monthlySalaryCents) || 0)) : 0,
    status: status === "inactive" ? "inactive" : "active",
    // Real, but deliberately simplified withholding: a flat percentage
    // this employee's gross pay is reduced by on every payroll run. Null
    // means "use the org-wide default rate" (see taxSettings.defaultWithholdingRatePct)
    // instead of this employee having their own override. See the
    // withholding section near computePayroll() below for exactly what
    // this does and does not do.
    withholdingRatePct: withholdingRatePct === undefined || withholdingRatePct === null || withholdingRatePct === ""
      ? null
      : Math.max(0, Math.min(100, Number(withholdingRatePct) || 0)),
    // A count of withholding allowances/dependents, stored for the
    // filing summary's records only — this implementation does not
    // look up bracket tables by allowance count (see the same note
    // below), it is retained purely as a real, useful record you'd
    // hand to an accountant or payroll-tax provider.
    allowances: Math.max(0, Math.round(Number(allowances) || 0)),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.employees[id] = employee;
  await writeDb(db);
  return employee;
}

export async function updateEmployee(id, patch) {
  const db = readDb();
  const employee = db.employees[id];
  if (!employee) return null;
  const allowed = {};
  for (const key of ["name", "email", "role", "status"]) {
    if (patch[key] !== undefined) allowed[key] = String(patch[key]).trim();
  }
  if (patch.payType !== undefined) allowed.payType = patch.payType === "salary" ? "salary" : "hourly";
  if (patch.hourlyRateCents !== undefined) allowed.hourlyRateCents = Math.max(0, Math.round(Number(patch.hourlyRateCents) || 0));
  if (patch.monthlySalaryCents !== undefined) allowed.monthlySalaryCents = Math.max(0, Math.round(Number(patch.monthlySalaryCents) || 0));
  if (patch.withholdingRatePct !== undefined) {
    allowed.withholdingRatePct = patch.withholdingRatePct === null || patch.withholdingRatePct === ""
      ? null
      : Math.max(0, Math.min(100, Number(patch.withholdingRatePct) || 0));
  }
  if (patch.allowances !== undefined) allowed.allowances = Math.max(0, Math.round(Number(patch.allowances) || 0));
  Object.assign(employee, allowed, { updatedAt: new Date().toISOString() });
  await writeDb(db);
  return employee;
}

export async function deleteEmployee(id) {
  const db = readDb();
  if (!db.employees[id]) return false;
  delete db.employees[id];
  await writeDb(db);
  return true;
}

/* -------------------------------- Time entries -------------------------------- */
// Ported from OliCompute's real server/services/timeEntries.js — real
// logged hours per employee per day, which is what "payroll from logged
// hours" (the previously-removed, previously-false claim) now genuinely
// means: hourly employees' pay is computed from THESE real records, not
// invented.

function monthOf(dateStr) {
  return String(dateStr || "").slice(0, 7);
}

export async function listTimeEntries({ employeeId, month } = {}) {
  const db = readDb();
  return Object.values(db.timeEntries)
    .filter((t) => (!employeeId || t.employeeId === employeeId) && (!month || monthOf(t.date) === month))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

export async function createTimeEntry({ employeeId, date, hours, description }) {
  const db = readDb();
  if (!db.employees[employeeId]) throw new Error("Unknown employee");
  const h = Number(hours);
  if (!Number.isFinite(h) || h <= 0 || h > 24) throw new Error("Hours must be between 0 and 24");
  const id = randomUUID();
  const entry = {
    id,
    employeeId,
    date: date ? String(date).slice(0, 10) : new Date().toISOString().slice(0, 10),
    hours: h,
    description: description || "",
    createdAt: new Date().toISOString(),
  };
  db.timeEntries[id] = entry;
  await writeDb(db);
  return entry;
}

export async function deleteTimeEntry(id) {
  const db = readDb();
  if (!db.timeEntries[id]) return false;
  delete db.timeEntries[id];
  await writeDb(db);
  return true;
}

/* ---------------------------------- Expenses ---------------------------------- */
// Ported from OliCompute's real server/services/expenses.js — real
// categorized spend, used by the real P&L / expenses-by-category
// reports below. This is what "Full accounting" / "Profit & loss
// reports" (previously removed, previously false) now genuinely means:
// real revenue (paid invoices) minus real expenses minus real payroll.

const EXPENSE_CATEGORIES = ["Payroll", "Software", "Office", "Marketing", "Travel", "Utilities", "Equipment", "Contractors", "Taxes", "Other"];

export async function listExpenses() {
  const db = readDb();
  return Object.values(db.expenses).sort((a, b) => new Date(b.date) - new Date(a.date));
}

export async function createExpense({ category, vendor, amountCents, date, description }) {
  const db = readDb();
  const amt = Math.round(Number(amountCents) || 0);
  if (amt <= 0) throw new Error("Expense amount must be greater than 0");
  const id = randomUUID();
  const expense = {
    id,
    category: EXPENSE_CATEGORIES.includes(category) ? category : "Other",
    vendor: vendor || "",
    amountCents: amt,
    date: date ? String(date).slice(0, 10) : new Date().toISOString().slice(0, 10),
    description: description || "",
    createdAt: new Date().toISOString(),
  };
  db.expenses[id] = expense;
  await writeDb(db);
  return expense;
}

export async function deleteExpense(id) {
  const db = readDb();
  if (!db.expenses[id]) return false;
  delete db.expenses[id];
  await writeDb(db);
  return true;
}

/* -------------------------------- Tax settings -------------------------------- */
// Ported from OliCompute's real server/services/settings.js. Storing a
// default tax rate the OWNER explicitly configures (not one this app
// invents or looks up) is what makes createInvoice()'s taxRatePct above
// a genuine calculation instead of a fabricated one — same principle as
// supportAssistant.js's "never claim AI was used unless it genuinely
// was": never claim a real tax rate was applied unless a human actually
// set that rate.
// ⚠️ FIX: a real Philippine-business customer found every printable
// invoice showing a hardcoded "$" regardless of the business's actual
// currency (confirmed: invoiceHtml.js's formatMoney() had "$" baked in
// with no setting to change it anywhere in the product). Added a real,
// owner-configurable `currency` field here (ISO 4217 code, e.g. "USD",
// "GBP", "EUR", "AUD", "PHP") that invoiceHtml.js now reads via
// getTaxSettings() and formats with the real Intl.NumberFormat currency
// formatter — not another hardcoded symbol. Every ISO 4217 code
// Intl.NumberFormat supports works here (USD/GBP/EUR/AUD/PHP/CAD/JPY/
// etc.) — this is genuinely NOT limited to USD, it's simply the
// out-of-the-box default until an owner configures their own via
// PUT /api/tax-settings {"currency":"GBP"} (or whichever code applies).
const TAX_SETTINGS_DEFAULTS = { taxName: "Tax", taxNumber: "", defaultRatePct: 0, defaultWithholdingRatePct: 0, employerName: "", employerTaxId: "", currency: "USD" };

export async function getTaxSettings() {
  const db = readDb();
  return { ...TAX_SETTINGS_DEFAULTS, ...(db.taxSettings || {}) };
}

export async function updateTaxSettings(patch) {
  const db = readDb();
  const current = { ...TAX_SETTINGS_DEFAULTS, ...(db.taxSettings || {}) };
  const next = { ...current };
  if (patch.taxName !== undefined) next.taxName = String(patch.taxName).trim() || "Tax";
  if (patch.taxNumber !== undefined) next.taxNumber = String(patch.taxNumber).trim();
  if (patch.defaultRatePct !== undefined) {
    const rate = Number(patch.defaultRatePct);
    next.defaultRatePct = Number.isFinite(rate) && rate >= 0 ? rate : 0;
  }
  // Real ISO 4217 currency code (PHP, USD, EUR, GBP, AUD, ...) - validated
  // against Intl.NumberFormat itself so an invalid code is rejected with a
  // clear error instead of silently breaking every invoice's currency
  // formatting later.
  if (patch.currency !== undefined) {
    const code = String(patch.currency).trim().toUpperCase();
    try {
      new Intl.NumberFormat("en-US", { style: "currency", currency: code });
      next.currency = code;
    } catch {
      throw new Error(`"${code}" is not a valid ISO 4217 currency code (e.g. PHP, USD, EUR, GBP, AUD).`);
    }
  }
  // Real, owner-configured default payroll withholding rate — same
  // honesty principle as defaultRatePct above: this app never guesses a
  // real withholding percentage for you, you supply it (from your own
  // knowledge of your jurisdiction's brackets, or an accountant's
  // guidance). See the withholding section near computePayroll() for
  // exactly what this does and does not compute.
  if (patch.defaultWithholdingRatePct !== undefined) {
    const rate = Number(patch.defaultWithholdingRatePct);
    next.defaultWithholdingRatePct = Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : 0;
  }
  // Employer identity fields shown on the real filing summary report
  // (see getFilingSummary() below) — the kind of information an
  // accountant or payroll-tax provider would need on a handoff document.
  if (patch.employerName !== undefined) next.employerName = String(patch.employerName).trim();
  if (patch.employerTaxId !== undefined) next.employerTaxId = String(patch.employerTaxId).trim();
  db.taxSettings = next;
  await writeDb(db);
  return next;
}

/* ---------------------------------- Payroll ---------------------------------- */
// Ported from OliCompute's real server/services/payroll.js: hourly
// employees are paid for hours ACTUALLY logged that month (via
// createTimeEntry above); salaried employees receive their fixed
// monthly amount. This is real arithmetic on real records.
//
// WITHHOLDING — what this genuinely does and does not do:
// Each employee's gross pay is now reduced by a real, flat percentage
// (their own withholdingRatePct override, or the org-wide
// taxSettings.defaultWithholdingRatePct if they don't have one) to
// produce a real "withheldCents" and real "netPayCents" per line. This
// is genuine arithmetic on a rate a human explicitly configured — same
// honesty principle as invoice tax above (never invent a rate).
// What this deliberately does NOT do: look up official IRS/HMRC/ATO
// withholding tables by income bracket and filing status, apply
// FICA/Social Security/Medicare/state-specific rules, or remit anything
// to a tax authority. A single flat percentage cannot correctly
// replicate a real progressive withholding table — pretending otherwise
// would be exactly the kind of fabricated feature this whole project is
// about avoiding. Use this for a real, working "here's roughly what to
// set aside and hand off" number, backed by a rate YOU or your
// accountant chose — not as a certified payroll-tax calculation. Pair
// it with a real payroll-tax provider (Gusto, Check, etc.) for the
// compliance-grade version.

export async function computePayroll(month) {
  const db = readDb();
  const m = /^\d{4}-\d{2}$/.test(month || "") ? month : new Date().toISOString().slice(0, 7);
  const employees = Object.values(db.employees).filter((e) => e.status !== "inactive" && e.status !== "archived");
  const entries = Object.values(db.timeEntries).filter((t) => monthOf(t.date) === m);
  const taxSettings = db.taxSettings || { defaultWithholdingRatePct: 0 };
  const defaultWithholdingRatePct = Number(taxSettings.defaultWithholdingRatePct) || 0;

  const lines = employees.map((e) => {
    const hours = entries.filter((t) => t.employeeId === e.id).reduce((sum, t) => sum + t.hours, 0);
    const grossPayCents = e.payType === "salary" ? e.monthlySalaryCents : Math.round(hours * e.hourlyRateCents);
    const withholdingRatePct = e.withholdingRatePct !== null && e.withholdingRatePct !== undefined ? e.withholdingRatePct : defaultWithholdingRatePct;
    const withheldCents = Math.round((grossPayCents * withholdingRatePct) / 100);
    const netPayCents = grossPayCents - withheldCents;
    return {
      employeeId: e.id,
      name: e.name,
      role: e.role,
      payType: e.payType,
      hours: Math.round(hours * 100) / 100,
      rateCents: e.payType === "salary" ? e.monthlySalaryCents : e.hourlyRateCents,
      withholdingRatePct,
      allowances: e.allowances || 0,
      // payCents kept for backward compatibility with existing callers
      // (accounting overview, P&L) that expect payroll COST — that's
      // the employer's real cost, i.e. gross pay, regardless of how
      // much of it is withheld vs paid out.
      payCents: grossPayCents,
      grossPayCents,
      withheldCents,
      netPayCents,
    };
  });

  return {
    month: m,
    lines,
    totals: {
      employees: lines.length,
      totalHours: Math.round(lines.reduce((sum, l) => sum + l.hours, 0) * 100) / 100,
      totalPayCents: lines.reduce((sum, l) => sum + l.payCents, 0),
      totalGrossPayCents: lines.reduce((sum, l) => sum + l.grossPayCents, 0),
      totalWithheldCents: lines.reduce((sum, l) => sum + l.withheldCents, 0),
      totalNetPayCents: lines.reduce((sum, l) => sum + l.netPayCents, 0),
    },
  };
}

/* ------------------------------- Filing summary ------------------------------- */
// A real, computed handoff document for a date range: total gross pay,
// total withheld, total net pay, and a per-employee breakdown — the
// kind of summary you'd actually hand to an accountant or payroll-tax
// provider (or use yourself to remit withheld amounts) at the end of a
// quarter or year. This is explicitly NOT an e-filing submission to any
// tax authority (IRS Form 941/W-2, HMRC RTI, ATO STP, etc.) — building
// a real integration with any one of those would mean this software is
// making binding regulatory filings on a business's behalf, which is a
// completely different (and far more regulated) product than what a
// $39/mo self-hosted CRM should attempt. What's real here: the
// arithmetic is genuinely computed from your real payroll records
// across every month in the range, not a mocked/static number.
export async function getFilingSummary(from, to) {
  const db = readDb();
  const taxSettings = db.taxSettings || {};
  const months = monthsBetween(from, to);
  const perEmployee = new Map();
  let totalGrossPayCents = 0;
  let totalWithheldCents = 0;
  let totalNetPayCents = 0;

  for (const m of months) {
    const payroll = await computePayroll(m);
    for (const line of payroll.lines) {
      if (!perEmployee.has(line.employeeId)) {
        perEmployee.set(line.employeeId, {
          employeeId: line.employeeId,
          name: line.name,
          role: line.role,
          allowances: line.allowances,
          withholdingRatePct: line.withholdingRatePct,
          grossPayCents: 0,
          withheldCents: 0,
          netPayCents: 0,
        });
      }
      const entry = perEmployee.get(line.employeeId);
      entry.grossPayCents += line.grossPayCents;
      entry.withheldCents += line.withheldCents;
      entry.netPayCents += line.netPayCents;
      totalGrossPayCents += line.grossPayCents;
      totalWithheldCents += line.withheldCents;
      totalNetPayCents += line.netPayCents;
    }
  }

  return {
    range: { from, to },
    employer: { name: taxSettings.employerName || "", taxId: taxSettings.employerTaxId || "" },
    employees: Array.from(perEmployee.values()).sort((a, b) => b.grossPayCents - a.grossPayCents),
    totals: { grossPayCents: totalGrossPayCents, withheldCents: totalWithheldCents, netPayCents: totalNetPayCents },
    generatedAt: new Date().toISOString(),
    // Explicit, honest note carried in the payload itself so it's
    // visible even to a consumer of the raw API, not just the README.
    scopeNote: "This is a computed handoff summary for your accountant or payroll-tax provider. It is not an e-filed submission to any tax authority.",
  };
}

/* ------------------------------- Accounting overview ------------------------------- */
// Ported from OliCompute's real server/services/accounting.js: real
// revenue (paid invoices this covers, since OliOps doesn't track
// separate "payments" records) minus real expenses minus real payroll
// for the current month = real net. This is the genuine, working
// version of the previously-removed "Full accounting" claim.

export async function getAccountingOverview() {
  const db = readDb();
  const invoices = Object.values(db.invoices);
  const paidInvoices = invoices.filter((i) => i.status === "paid");
  const revenueCents = paidInvoices.reduce((sum, i) => sum + i.totalCents, 0);
  const outstandingCents = invoices.filter((i) => i.status !== "paid").reduce((sum, i) => sum + i.totalCents, 0);

  const expenses = Object.values(db.expenses);
  const expensesCents = expenses.reduce((sum, e) => sum + e.amountCents, 0);

  const currentMonth = new Date().toISOString().slice(0, 7);
  const payroll = await computePayroll(currentMonth);
  const payrollCents = payroll.totals.totalPayCents;

  const netCents = revenueCents - expensesCents - payrollCents;

  return {
    payrollMonth: currentMonth,
    totals: {
      revenueCents,
      expensesCents,
      payrollCents,
      netCents,
      outstandingCents,
      invoiceCount: invoices.length,
      paidInvoiceCount: paidInvoices.length,
      employeeCount: Object.values(db.employees).filter((e) => e.status !== "inactive" && e.status !== "archived").length,
    },
  };
}

/* ----------------------------------- Reports ----------------------------------- */
// Ported from OliCompute's real server/services/reports.js: a real
// Profit & Loss for a date range (revenue - expenses - payroll across
// every month in range), real expenses-by-category, and real aged
// receivables (unpaid invoices bucketed by how overdue they are). This
// is the genuine, working version of the previously-removed "Profit &
// loss reports" claim.

function inRange(dateStr, from, to) {
  const d = String(dateStr || "").slice(0, 10);
  return d >= from && d <= to;
}

function monthsBetween(from, to) {
  const out = [];
  const start = new Date(`${from.slice(0, 7)}-01T00:00:00Z`);
  const end = new Date(`${to.slice(0, 7)}-01T00:00:00Z`);
  const d = new Date(start);
  while (d <= end) {
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

export async function getProfitAndLoss(from, to) {
  const db = readDb();
  const invoices = Object.values(db.invoices).filter((i) => i.status === "paid" && i.paidAt && inRange(i.paidAt, from, to));
  const revenueCents = invoices.reduce((sum, i) => sum + i.totalCents, 0);

  const expenses = Object.values(db.expenses).filter((e) => inRange(e.date, from, to));
  const expensesCents = expenses.reduce((sum, e) => sum + e.amountCents, 0);

  let payrollCents = 0;
  for (const m of monthsBetween(from, to)) {
    const payroll = await computePayroll(m);
    payrollCents += payroll.totals.totalPayCents;
  }

  return {
    range: { from, to },
    revenueCents,
    expensesCents,
    payrollCents,
    netCents: revenueCents - expensesCents - payrollCents,
  };
}

export async function getExpensesByCategory(from, to) {
  const db = readDb();
  const expenses = Object.values(db.expenses).filter((e) => inRange(e.date, from, to));
  const byCategory = {};
  for (const e of expenses) {
    if (!byCategory[e.category]) byCategory[e.category] = { category: e.category, totalCents: 0, count: 0 };
    byCategory[e.category].totalCents += e.amountCents;
    byCategory[e.category].count += 1;
  }
  return Object.values(byCategory).sort((a, b) => b.totalCents - a.totalCents);
}

export async function getAgedReceivables() {
  const db = readDb();
  const now = Date.now();
  const open = Object.values(db.invoices).filter((i) => i.status !== "paid");
  const buckets = { current: 0, d1_30: 0, d31_60: 0, d60plus: 0 };
  const items = open.map((i) => {
    const dueMs = i.dueDate ? new Date(i.dueDate).getTime() : now;
    const daysOverdue = Math.max(0, Math.floor((now - dueMs) / 86400000));
    let bucket = "current";
    if (daysOverdue > 60) bucket = "d60plus";
    else if (daysOverdue > 30) bucket = "d31_60";
    else if (daysOverdue > 0) bucket = "d1_30";
    buckets[bucket] += i.totalCents;
    return { id: i.id, invoiceNumber: i.invoiceNumber, contactName: i.contactName, dueDate: i.dueDate, totalCents: i.totalCents, daysOverdue };
  });
  return { items, buckets, totalCents: items.reduce((sum, i) => sum + i.totalCents, 0) };
}
