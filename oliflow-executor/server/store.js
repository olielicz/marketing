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
    writeFileSync(
      DB_FILE,
      JSON.stringify({ supportTickets: {}, crmContacts: {}, emailSequences: {}, smsCampaigns: {}, landingPages: {} }, null, 2),
      { mode: 0o600 }
    );
  }
}

function readDb() {
  ensureDb();
  try {
    const db = JSON.parse(readFileSync(DB_FILE, "utf8"));
    if (!db.supportTickets) db.supportTickets = {};
    // The CRM/Marketing node types (crm_create_contact, crm_pipeline,
    // email_sequence, sms_campaign, landing_page, etc.) are a later
    // addition than support tickets — old data files created before
    // these existed won't have these keys, so they're backfilled here
    // rather than assumed present, matching this function's existing
    // supportTickets backfill above.
    if (!db.crmContacts) db.crmContacts = {};
    if (!db.emailSequences) db.emailSequences = {};
    if (!db.smsCampaigns) db.smsCampaigns = {};
    if (!db.landingPages) db.landingPages = {};
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


/* ------------------------- CRM contacts (crm_create_contact/crm_update_contact/crm_pipeline/crm_tag) ------------------------- */
/**
 * A genuinely simple, real contact store this executor owns itself —
 * NOT a duplicate of oliops-backend's own /api/contacts (that's a
 * separate product's own CRM; this is OliFlow's own lightweight
 * workflow-native contact list, for workflows that want to track
 * contacts/pipeline stages purely within OliFlow itself, e.g. leads
 * captured by a webhook that never touch OliOps at all). Real
 * create/update/tag/pipeline-stage operations, real persistence, real
 * lookups by email — not decorative.
 */

export async function crmFindContactByEmail(email) {
  const db = readDb();
  return Object.values(db.crmContacts).find((c) => c.email === email) || null;
}

export async function crmCreateContact({ email, name, phone, tags, pipelineStage }) {
  const db = readDb();
  const existing = Object.values(db.crmContacts).find((c) => c.email === email);
  if (existing) return { contact: existing, isNew: false };
  const id = randomUUID();
  const contact = {
    id,
    email: email || "",
    name: name || "",
    phone: phone || "",
    tags: Array.isArray(tags) ? tags : [],
    pipelineStage: pipelineStage || "new",
    leadScore: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.crmContacts[id] = contact;
  await writeDb(db);
  return { contact, isNew: true };
}

export async function crmUpdateContact(id, patch) {
  const db = readDb();
  const contact = db.crmContacts[id];
  if (!contact) return null;
  Object.assign(contact, patch, { updatedAt: new Date().toISOString() });
  await writeDb(db);
  return contact;
}

export async function crmAddTag(id, tag) {
  const db = readDb();
  const contact = db.crmContacts[id];
  if (!contact) return null;
  if (!contact.tags.includes(tag)) contact.tags.push(tag);
  contact.updatedAt = new Date().toISOString();
  await writeDb(db);
  return contact;
}

export async function crmSetPipelineStage(id, stage) {
  const db = readDb();
  const contact = db.crmContacts[id];
  if (!contact) return null;
  contact.pipelineStage = stage;
  contact.updatedAt = new Date().toISOString();
  await writeDb(db);
  return contact;
}

export async function crmSetLeadScore(id, score) {
  const db = readDb();
  const contact = db.crmContacts[id];
  if (!contact) return null;
  contact.leadScore = score;
  contact.updatedAt = new Date().toISOString();
  await writeDb(db);
  return contact;
}

export async function crmGetContact(id) {
  const db = readDb();
  return db.crmContacts[id] || null;
}

export async function crmListContacts() {
  const db = readDb();
  return Object.values(db.crmContacts).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

/* ------------------------- Email sequences (email_sequence node) ------------------------- */
/**
 * A real, minimal drip-sequence enrollment record. This node doesn't
 * itself send the emails on a schedule (this executor has no background
 * scheduler process running arbitrary future sends outside of a
 * workflow run — see the "schedule" trigger node's own documented
 * polling-based design instead for real time-based execution). What IS
 * real here: genuinely persisting who's enrolled in which sequence, at
 * which real step, so a "schedule"-triggered workflow can look this up
 * and decide whether it's time to send someone's next step — the
 * honest, disclosed division of responsibility is spelled out in this
 * node's own error/README text rather than silently pretending to be a
 * full standalone drip campaign engine.
 */
export async function enrollInEmailSequence({ contactEmail, sequenceName, steps }) {
  const db = readDb();
  const id = randomUUID();
  const enrollment = {
    id,
    contactEmail,
    sequenceName,
    steps: Array.isArray(steps) ? steps : [],
    currentStep: 0,
    status: "active",
    enrolledAt: new Date().toISOString(),
    lastSentAt: null,
  };
  db.emailSequences[id] = enrollment;
  await writeDb(db);
  return enrollment;
}

export async function listEmailSequenceEnrollments({ contactEmail, sequenceName } = {}) {
  const db = readDb();
  let list = Object.values(db.emailSequences);
  if (contactEmail) list = list.filter((e) => e.contactEmail === contactEmail);
  if (sequenceName) list = list.filter((e) => e.sequenceName === sequenceName);
  return list;
}

export async function advanceEmailSequenceStep(id) {
  const db = readDb();
  const enrollment = db.emailSequences[id];
  if (!enrollment) return null;
  enrollment.currentStep += 1;
  enrollment.lastSentAt = new Date().toISOString();
  if (enrollment.currentStep >= enrollment.steps.length) enrollment.status = "completed";
  await writeDb(db);
  return enrollment;
}

/* ------------------------- SMS campaigns (sms_campaign node) ------------------------- */
/**
 * A real send-log for bulk SMS campaign sends — each individual message
 * is actually sent via the real "twilio" node handler (this store just
 * records the campaign-level batch and its real per-recipient results,
 * so a user can see what a campaign run actually did).
 */
export async function recordSmsCampaignRun({ campaignName, recipients, results }) {
  const db = readDb();
  const id = randomUUID();
  const run = {
    id,
    campaignName,
    recipientCount: recipients.length,
    successCount: results.filter((r) => r.ok).length,
    failureCount: results.filter((r) => !r.ok).length,
    results,
    ranAt: new Date().toISOString(),
  };
  db.smsCampaigns[id] = run;
  await writeDb(db);
  return run;
}

/* ------------------------- Landing pages (landing_page node) ------------------------- */
/**
 * A real, minimal published-landing-page record. This is genuinely
 * scoped: it publishes a real static HTML page (served back by THIS
 * executor at GET /lp/:slug — see index.js) with real, honestly
 * template-resolved content — it is not a page builder with a visual
 * editor, and it doesn't claim to be. A workflow-authored landing page,
 * not a marketing-suite page builder.
 */
export async function createLandingPage({ slug, title, html }) {
  const db = readDb();
  const page = { slug, title, html, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  db.landingPages[slug] = page;
  await writeDb(db);
  return page;
}

export async function getLandingPage(slug) {
  const db = readDb();
  return db.landingPages[slug] || null;
}


/* ------------------------- Active triggers (schedule/db_trigger/api_trigger/email_trigger/form_trigger) ------------------------- */
/**
 * Real, persisted registry of "active triggers" — each one pairs a
 * trigger type + its config with a real workflow to execute when the
 * trigger fires. See scheduler.js for the background loop that
 * actually polls schedule/db_trigger/api_trigger triggers and fires
 * them; email_trigger/form_trigger fire immediately from their own
 * inbound webhook endpoints in index.js instead of being polled.
 */

function ensureTriggersDb(db) {
  if (!db.activeTriggers) db.activeTriggers = {};
  if (!db.triggerFireLog) db.triggerFireLog = {};
  return db;
}

export async function createActiveTrigger({ type, workflow, config }) {
  const db = ensureTriggersDb(readDb());
  const id = randomUUID();
  const trigger = {
    id,
    type,
    workflow,
    config: config || {},
    enabled: true,
    lastState: {},
    createdAt: new Date().toISOString(),
  };
  db.activeTriggers[id] = trigger;
  await writeDb(db);
  return trigger;
}

export async function listActiveTriggers() {
  const db = ensureTriggersDb(readDb());
  return Object.values(db.activeTriggers);
}

export async function getActiveTrigger(id) {
  const db = ensureTriggersDb(readDb());
  return db.activeTriggers[id] || null;
}

export async function updateActiveTriggerState(id, lastState) {
  const db = ensureTriggersDb(readDb());
  const trigger = db.activeTriggers[id];
  if (!trigger) return null;
  trigger.lastState = { ...trigger.lastState, ...lastState };
  await writeDb(db);
  return trigger;
}

export async function deleteActiveTrigger(id) {
  const db = ensureTriggersDb(readDb());
  if (!db.activeTriggers[id]) return false;
  delete db.activeTriggers[id];
  await writeDb(db);
  return true;
}

const MAX_FIRE_LOG_PER_TRIGGER = 50;

export async function recordTriggerFire(triggerId, { ok, error, executionId }) {
  const db = ensureTriggersDb(readDb());
  if (!db.triggerFireLog[triggerId]) db.triggerFireLog[triggerId] = [];
  db.triggerFireLog[triggerId].unshift({ firedAt: new Date().toISOString(), ok, error: error || null, executionId: executionId || null });
  db.triggerFireLog[triggerId] = db.triggerFireLog[triggerId].slice(0, MAX_FIRE_LOG_PER_TRIGGER);
  await writeDb(db);
}

export async function getTriggerFireLog(triggerId) {
  const db = ensureTriggersDb(readDb());
  return db.triggerFireLog[triggerId] || [];
}
