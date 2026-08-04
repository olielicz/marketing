/**
 * OliOps Backend — a real, self-hosted CRM + invoicing server. Zero
 * external dependencies (only Node's built-in `http`, `crypto`).
 *
 * Explicit scope (read this before selling this as "OliOps"):
 *   ✅ Real: contacts (CRM), tasks, invoices (create/list/mark paid/print).
 *   ❌ NOT implemented: payroll, and any "AI support router." Building
 *      payroll correctly (tax withholding tables, filings, multi-state
 *      compliance) is a serious regulated-domain undertaking, not a
 *      feature you bolt onto a CRM in a single pass — shipping a fake
 *      version of it would be actively harmful to a real customer's
 *      business. An "AI support router" that isn't wired to a real
 *      model would be exactly the kind of fabricated capability this
 *      whole effort has been about NOT doing. Both are left out
 *      entirely rather than faked. See README.md's "Scope" section.
 *
 * Start with:  node server/index.js
 * Create the owner account first with:  node scripts/create-owner.js
 */
import { createServer } from "node:http";
import {
  getOwner, createSession, isSessionActive, revokeSession, revokeAllSessions,
  recordSuccessfulLogin, recordFailedAttempt, clearFailedAttempts, countRecentFailedAttempts,
  updateOwnerPassword,
  listContacts, getContact, createContact, updateContact, deleteContact,
  listTasks, createTask, updateTask, deleteTask,
  listInvoices, getInvoice, createInvoice, markInvoicePaid, deleteInvoice,
} from "./store.js";
import { verifyPassword, hashPassword, signSessionToken, verifySessionTokenSignature, newSessionId } from "./auth.js";
import { renderInvoiceHtml } from "./invoiceHtml.js";

const PORT = Number(process.env.PORT) || 4500;
const SESSION_TTL_MS = (Number(process.env.OLIOPS_SESSION_TTL_HOURS) || 12) * 60 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = Number(process.env.OLIOPS_MAX_FAILED_ATTEMPTS) || 5;
const LOCKOUT_WINDOW_MS = (Number(process.env.OLIOPS_LOCKOUT_WINDOW_MINUTES) || 15) * 60 * 1000;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const BUSINESS_NAME = process.env.OLIOPS_BUSINESS_NAME || "Your Business";
const BUSINESS_EMAIL = process.env.OLIOPS_BUSINESS_EMAIL || "";

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 2_000_000) { reject(new Error("Request body too large")); req.destroy(); }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new Error("Invalid JSON body")); }
    });
    req.on("error", reject);
  });
}

function send(res, status, body, contentType = "application/json") {
  const payload = contentType === "application/json" ? JSON.stringify(body) : body;
  res.writeHead(status, {
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(payload),
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(payload);
}

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return String(forwarded).split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}

async function requireAuth(req) {
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const payload = verifySessionTokenSignature(token);
  if (!payload || !payload.sessionId) return null;
  const active = await isSessionActive(payload.sessionId);
  if (!active) return null;
  return payload;
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      });
      return res.end();
    }

    const url = new URL(req.url, `http://localhost:${PORT}`);

    if (req.method === "GET" && url.pathname === "/api/health") {
      const owner = await getOwner();
      return send(res, 200, { ok: true, ownerConfigured: Boolean(owner) });
    }

    /* -------------------------------- Auth -------------------------------- */

    if (req.method === "POST" && url.pathname === "/api/login") {
      const ip = clientIp(req);
      const lockoutKey = `login:${ip}`;
      const recentFailures = await countRecentFailedAttempts(lockoutKey, LOCKOUT_WINDOW_MS);
      if (recentFailures >= MAX_FAILED_ATTEMPTS) {
        return send(res, 429, { ok: false, error: `Too many failed login attempts. Try again in ${Math.ceil(LOCKOUT_WINDOW_MS / 60000)} minutes.` });
      }

      const body = await readJsonBody(req);
      const username = String(body.username || "").trim().toLowerCase();
      const password = String(body.password || "");

      const owner = await getOwner();
      if (!owner) return send(res, 503, { ok: false, error: "No owner account has been created yet. Run scripts/create-owner.js first." });

      const usernameMatches = username === owner.username.toLowerCase();
      const passwordMatches = usernameMatches && verifyPassword(password, owner.salt, owner.hash);
      if (!usernameMatches || !passwordMatches) {
        await recordFailedAttempt(lockoutKey);
        return send(res, 401, { ok: false, error: "Invalid username or password." });
      }

      await clearFailedAttempts(lockoutKey);
      const sessionId = newSessionId();
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
      await createSession({ sessionId, expiresAt, ip, userAgent: req.headers["user-agent"] });
      await recordSuccessfulLogin({ ip });
      const token = signSessionToken({ sessionId, username: owner.username, issuedAt: new Date().toISOString() });
      return send(res, 200, { ok: true, token, expiresAt, businessName: BUSINESS_NAME });
    }

    if (req.method === "POST" && url.pathname === "/api/logout") {
      const header = req.headers["authorization"] || "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : "";
      const payload = verifySessionTokenSignature(token);
      if (payload && payload.sessionId) await revokeSession(payload.sessionId);
      return send(res, 200, { ok: true });
    }

    if (req.method === "POST" && url.pathname === "/api/change-password") {
      const auth = await requireAuth(req);
      if (!auth) return send(res, 401, { ok: false, error: "Not authenticated." });
      const body = await readJsonBody(req);
      const owner = await getOwner();
      if (!verifyPassword(String(body.currentPassword || ""), owner.salt, owner.hash)) {
        return send(res, 401, { ok: false, error: "Current password is incorrect." });
      }
      if (String(body.newPassword || "").length < 12) {
        return send(res, 400, { ok: false, error: "New password must be at least 12 characters." });
      }
      const { salt, hash } = hashPassword(body.newPassword);
      await updateOwnerPassword({ salt, hash });
      const revoked = await revokeAllSessions();
      return send(res, 200, { ok: true, sessionsRevoked: revoked });
    }

    // Everything below requires a valid session.
    const auth = await requireAuth(req);
    if (!auth) return send(res, 401, { error: "unauthorized" });

    /* ------------------------------ Contacts ------------------------------ */

    if (req.method === "GET" && url.pathname === "/api/contacts") {
      return send(res, 200, { contacts: await listContacts() });
    }
    if (req.method === "POST" && url.pathname === "/api/contacts") {
      const body = await readJsonBody(req);
      if (!body.name) return send(res, 400, { error: "name is required" });
      return send(res, 201, { contact: await createContact(body) });
    }
    if (req.method === "PUT" && url.pathname.startsWith("/api/contacts/")) {
      const id = url.pathname.split("/")[3];
      const body = await readJsonBody(req);
      const updated = await updateContact(id, body);
      if (!updated) return send(res, 404, { error: "not_found" });
      return send(res, 200, { contact: updated });
    }
    if (req.method === "DELETE" && url.pathname.startsWith("/api/contacts/")) {
      const id = url.pathname.split("/")[3];
      const deleted = await deleteContact(id);
      return send(res, deleted ? 200 : 404, { ok: deleted });
    }

    /* -------------------------------- Tasks -------------------------------- */

    if (req.method === "GET" && url.pathname === "/api/tasks") {
      return send(res, 200, { tasks: await listTasks() });
    }
    if (req.method === "POST" && url.pathname === "/api/tasks") {
      const body = await readJsonBody(req);
      if (!body.title) return send(res, 400, { error: "title is required" });
      return send(res, 201, { task: await createTask(body) });
    }
    if (req.method === "PUT" && url.pathname.startsWith("/api/tasks/")) {
      const id = url.pathname.split("/")[3];
      const body = await readJsonBody(req);
      const updated = await updateTask(id, body);
      if (!updated) return send(res, 404, { error: "not_found" });
      return send(res, 200, { task: updated });
    }
    if (req.method === "DELETE" && url.pathname.startsWith("/api/tasks/")) {
      const id = url.pathname.split("/")[3];
      const deleted = await deleteTask(id);
      return send(res, deleted ? 200 : 404, { ok: deleted });
    }

    /* ------------------------------ Invoices ------------------------------ */

    if (req.method === "GET" && url.pathname === "/api/invoices") {
      return send(res, 200, { invoices: await listInvoices() });
    }
    if (req.method === "POST" && url.pathname === "/api/invoices") {
      const body = await readJsonBody(req);
      if (!body.items || !body.items.length) return send(res, 400, { error: "at least one line item is required" });
      return send(res, 201, { invoice: await createInvoice(body) });
    }
    if (req.method === "POST" && /^\/api\/invoices\/[^/]+\/mark-paid$/.test(url.pathname)) {
      const id = url.pathname.split("/")[3];
      const invoice = await markInvoicePaid(id);
      if (!invoice) return send(res, 404, { error: "not_found" });
      return send(res, 200, { invoice });
    }
    if (req.method === "GET" && /^\/api\/invoices\/[^/]+\/html$/.test(url.pathname)) {
      const id = url.pathname.split("/")[3];
      const invoice = await getInvoice(id);
      if (!invoice) return send(res, 404, { error: "not_found" });
      return send(res, 200, renderInvoiceHtml(invoice, { name: BUSINESS_NAME, email: BUSINESS_EMAIL }), "text/html");
    }
    if (req.method === "DELETE" && url.pathname.startsWith("/api/invoices/")) {
      const id = url.pathname.split("/")[3];
      const deleted = await deleteInvoice(id);
      return send(res, deleted ? 200 : 404, { ok: deleted });
    }

    return send(res, 404, { error: "not_found" });
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: "internal_error", message: err.message });
  }
});

if (import.meta.url === `file://${process.argv[1]}`) {
  server.listen(PORT, () => console.log(`OliOps Backend listening on http://localhost:${PORT}`));
}

export { server };
