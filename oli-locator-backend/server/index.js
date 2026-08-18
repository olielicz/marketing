/**
 * Oli-Locator Backend — a home-improvement lead finder covering USA,
 * UK, and Australia. Zero external dependencies (only Node's built-in
 * `http`, `crypto`, `fs`, `path`). JSON-file persistence.
 *
 * Start with:  node server/index.js
 * Create the owner account first with:  node scripts/create-owner.js
 */
import { createServer } from "node:http";
import {
  getOwner, createSession, isSessionActive, revokeSession, revokeAllSessions,
  recordSuccessfulLogin, recordFailedAttempt, clearFailedAttempts, countRecentFailedAttempts,
  updateOwnerPassword,
  getLead, getSavedLeads, saveLead, unsaveLead,
  listInbox, createInboxSubmission, updateInboxStatus,
  listCalls, createCall,
  getSettings, updateSettings,
} from "./store.js";
import { verifyPassword, hashPassword, signSessionToken, verifySessionTokenSignature, newSessionId } from "./auth.js";
import { filterLeads } from "./leadSearch.js";

const PORT = Number(process.env.PORT) || 4700;
const SESSION_TTL_MS = (Number(process.env.OLI_LOCATOR_SESSION_TTL_HOURS) || 12) * 60 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = Number(process.env.OLI_LOCATOR_MAX_FAILED_ATTEMPTS) || 5;
const LOCKOUT_WINDOW_MS = (Number(process.env.OLI_LOCATOR_LOCKOUT_WINDOW_MINUTES) || 15) * 60 * 1000;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

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
    // CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      });
      return res.end();
    }

    const url = new URL(req.url, `http://localhost:${PORT}`);

    /* ========================= Public Endpoints ========================= */

    // Health check
    if (req.method === "GET" && url.pathname === "/api/health") {
      const owner = await getOwner();
      return send(res, 200, { ok: true, ownerConfigured: Boolean(owner) });
    }

    // Login
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
      return send(res, 200, { ok: true, token, expiresAt });
    }

    // Logout (graceful — works even with invalid/expired token)
    if (req.method === "POST" && url.pathname === "/api/logout") {
      const header = req.headers["authorization"] || "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : "";
      const payload = verifySessionTokenSignature(token);
      if (payload && payload.sessionId) await revokeSession(payload.sessionId);
      return send(res, 200, { ok: true });
    }

    // Inbox POST — PUBLIC endpoint (no auth) for the Request-a-Quote form
    if (req.method === "POST" && url.pathname === "/api/inbox") {
      const body = await readJsonBody(req);
      if (!body.customerName && !body.customerEmail) {
        return send(res, 400, { error: "customerName or customerEmail is required" });
      }
      const submission = await createInboxSubmission(body);
      return send(res, 201, { submission });
    }

    /* ========================= Auth Required ========================= */

    // Change password
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

    // Everything below requires a valid session
    const auth = await requireAuth(req);
    if (!auth) return send(res, 401, { error: "unauthorized" });

    /* ========================= Leads ========================= */

    // Search leads with filters
    if (req.method === "GET" && url.pathname === "/api/leads") {
      const country = url.searchParams.get("country") || "US";
      const trade = url.searchParams.get("trade") || "";
      const city = url.searchParams.get("city") || "";
      const page = Number(url.searchParams.get("page")) || 1;
      const pageSize = Number(url.searchParams.get("pageSize")) || 10;
      const result = await filterLeads({ country, trade, city, page, pageSize });
      return send(res, 200, result);
    }

    // Get saved leads
    if (req.method === "GET" && url.pathname === "/api/leads/saved") {
      const saved = await getSavedLeads();
      return send(res, 200, { leads: saved });
    }

    // Save a lead
    if (req.method === "POST" && /^\/api\/leads\/[^/]+\/save$/.test(url.pathname)) {
      const id = url.pathname.split("/")[3];
      const lead = await saveLead(id);
      if (!lead) return send(res, 404, { error: "Lead not found" });
      return send(res, 200, { ok: true, lead });
    }

    // Unsave a lead
    if (req.method === "DELETE" && /^\/api\/leads\/[^/]+\/save$/.test(url.pathname)) {
      const id = url.pathname.split("/")[3];
      const removed = await unsaveLead(id);
      if (!removed) return send(res, 404, { error: "Lead not in saved list" });
      return send(res, 200, { ok: true });
    }

    /* ========================= Inbox ========================= */

    // List inbox submissions
    if (req.method === "GET" && url.pathname === "/api/inbox") {
      const submissions = await listInbox();
      return send(res, 200, { submissions });
    }

    // Update inbox submission status
    if (req.method === "PUT" && url.pathname.startsWith("/api/inbox/")) {
      const id = url.pathname.split("/")[3];
      const body = await readJsonBody(req);
      if (!body.status) return send(res, 400, { error: "status is required (new/contacted/quoted/won/lost)" });
      const updated = await updateInboxStatus(id, body.status);
      if (!updated) return send(res, 404, { error: "Submission not found or invalid status" });
      return send(res, 200, { submission: updated });
    }

    /* ========================= Calls ========================= */

    // List call log entries
    if (req.method === "GET" && url.pathname === "/api/calls") {
      const calls = await listCalls();
      return send(res, 200, { calls });
    }

    // Create a call log entry
    if (req.method === "POST" && url.pathname === "/api/calls") {
      const body = await readJsonBody(req);
      if (!body.leadName && !body.phone) return send(res, 400, { error: "leadName or phone is required" });
      const call = await createCall(body);
      return send(res, 201, { call });
    }

    /* ========================= Settings ========================= */

    // Get user settings
    if (req.method === "GET" && url.pathname === "/api/settings") {
      const settings = await getSettings();
      return send(res, 200, { settings });
    }

    // Update user settings
    if (req.method === "PUT" && url.pathname === "/api/settings") {
      const body = await readJsonBody(req);
      const settings = await updateSettings(body);
      return send(res, 200, { settings });
    }

    /* ========================= 404 ========================= */

    return send(res, 404, { error: "not_found" });

  } catch (err) {
    console.error(`[${new Date().toISOString()}] Unhandled error:`, err);
    if (!res.headersSent) {
      send(res, 500, { error: "internal_server_error" });
    }
  }
});

server.listen(PORT, () => {
  console.log(`Oli-Locator backend running on http://localhost:${PORT}`);
  console.log(`CORS allowed origin: ${ALLOWED_ORIGIN}`);
});

export { server };
