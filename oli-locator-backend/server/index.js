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
  getSubscription, updateSubscription, recordSearch, canSearch,
  listTeamMembers, addTeamMember, removeTeamMember, getTeamMember,
  TIER_LIMITS,
} from "./store.js";
import { verifyPassword, hashPassword, signSessionToken, verifySessionTokenSignature, newSessionId } from "./auth.js";
import { filterLeads } from "./leadSearch.js";
import { searchGovContracts, clearGovCache } from "./govContracts.js";
import { searchFundedStartups, clearStartupCache } from "./fundedStartups.js";

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

    // Clear lead cache (useful after updating search config)
    if (req.method === "POST" && url.pathname === "/api/leads/clear-cache") {
      const { clearCache } = await import("./leadSearch.js");
      if (clearCache) clearCache();
      if (clearGovCache) clearGovCache();
      if (clearStartupCache) clearStartupCache();
      return send(res, 200, { ok: true, message: "All caches cleared" });
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

      // Check owner account first
      const ownerMatches = username === owner.username.toLowerCase();
      let authenticated = false;
      let loginAs = "owner";
      let loginUsername = owner.username;

      if (ownerMatches) {
        authenticated = verifyPassword(password, owner.salt, owner.hash);
      } else {
        // Check team members (Agency tier)
        const teamMember = await getTeamMember(username);
        if (teamMember) {
          authenticated = verifyPassword(password, teamMember.salt, teamMember.hash);
          if (authenticated) {
            loginAs = "team_member";
            loginUsername = teamMember.username;
          }
        }
      }

      if (!authenticated) {
        await recordFailedAttempt(lockoutKey);
        return send(res, 401, { ok: false, error: "Invalid username or password." });
      }

      await clearFailedAttempts(lockoutKey);
      const sessionId = newSessionId();
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
      await createSession({ sessionId, expiresAt, ip, userAgent: req.headers["user-agent"] });
      if (loginAs === "owner") await recordSuccessfulLogin({ ip });
      const token = signSessionToken({ sessionId, username: loginUsername, role: loginAs, issuedAt: new Date().toISOString() });
      return send(res, 200, { ok: true, token, expiresAt, role: loginAs, username: loginUsername });
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

    /* ========================= Subscription ========================= */

    // GET /api/subscription — view current tier and usage
    if (req.method === "GET" && url.pathname === "/api/subscription") {
      const sub = await getSubscription();
      const limits = TIER_LIMITS[sub.tier] || TIER_LIMITS.starter;
      return send(res, 200, { subscription: { ...sub, limits } });
    }

    // PUT /api/subscription — update tier (owner only)
    if (req.method === "PUT" && url.pathname === "/api/subscription") {
      if (auth.role && auth.role !== "owner") {
        return send(res, 403, { error: "Only the account owner can change the subscription tier." });
      }
      const body = await readJsonBody(req);
      if (!body.tier) return send(res, 400, { error: "tier is required (starter, pro, or agency)" });
      try {
        const sub = await updateSubscription(body.tier);
        const limits = TIER_LIMITS[sub.tier] || TIER_LIMITS.starter;
        return send(res, 200, { subscription: { ...sub, limits } });
      } catch (err) {
        return send(res, 400, { error: err.message });
      }
    }

    /* ========================= Team Members (Agency Only) ========================= */

    // GET /api/team — list team members
    if (req.method === "GET" && url.pathname === "/api/team") {
      const sub = await getSubscription();
      if (sub.tier !== "agency") {
        return send(res, 403, { error: "Team members are only available on the Agency plan. Upgrade to access this feature." });
      }
      const members = await listTeamMembers();
      return send(res, 200, { teamMembers: members, maxMembers: TIER_LIMITS.agency.maxTeamMembers });
    }

    // POST /api/team — add team member (owner only)
    if (req.method === "POST" && url.pathname === "/api/team") {
      if (auth.role && auth.role !== "owner") {
        return send(res, 403, { error: "Only the account owner can add team members." });
      }
      const sub = await getSubscription();
      if (sub.tier !== "agency") {
        return send(res, 403, { error: "Team members are only available on the Agency plan. Upgrade to access this feature." });
      }
      const body = await readJsonBody(req);
      if (!body.username || !body.password) {
        return send(res, 400, { error: "username and password are required" });
      }
      if (String(body.password).length < 12) {
        return send(res, 400, { error: "Password must be at least 12 characters." });
      }
      const { salt, hash } = hashPassword(body.password);
      try {
        const member = await addTeamMember({
          username: body.username,
          salt,
          hash,
          name: body.name || body.username,
        });
        return send(res, 201, { teamMember: member });
      } catch (err) {
        return send(res, 400, { error: err.message });
      }
    }

    // DELETE /api/team/:username — remove team member (owner only)
    if (req.method === "DELETE" && url.pathname.startsWith("/api/team/")) {
      if (auth.role && auth.role !== "owner") {
        return send(res, 403, { error: "Only the account owner can remove team members." });
      }
      const username = decodeURIComponent(url.pathname.split("/")[3]);
      if (!username) return send(res, 400, { error: "username is required in URL path" });
      const removed = await removeTeamMember(username);
      if (!removed) return send(res, 404, { error: "Team member not found" });
      return send(res, 200, { ok: true, removed: username });
    }

    /* ========================= Search Quota Enforcement ========================= */

    // Check search quota before leads, contracts, and startups endpoints
    const isSearchEndpoint =
      (req.method === "GET" && url.pathname === "/api/leads") ||
      (req.method === "GET" && url.pathname === "/api/contracts") ||
      (req.method === "GET" && url.pathname === "/api/startups");

    if (isSearchEndpoint) {
      const searchCheck = await canSearch();
      if (!searchCheck.allowed) {
        return send(res, 429, { error: "Daily search limit reached. Upgrade to Pro for unlimited searches.", remaining: 0, tier: searchCheck.tier });
      }
      await recordSearch();
    }

    /* ========================= Government Contracts ========================= */

    if (req.method === "GET" && url.pathname === "/api/contracts") {
      const country = url.searchParams.get("country") || "ALL";
      const keyword = url.searchParams.get("keyword") || "";
      const page = Number(url.searchParams.get("page")) || 1;
      const pageSize = Number(url.searchParams.get("pageSize")) || 20;
      const result = await searchGovContracts({ country, keyword, page, pageSize });
      return send(res, 200, result);
    }

    /* ========================= Funded Startups ========================= */

    if (req.method === "GET" && url.pathname === "/api/startups") {
      const keyword = url.searchParams.get("keyword") || "startup";
      const page = Number(url.searchParams.get("page")) || 1;
      const pageSize = Number(url.searchParams.get("pageSize")) || 20;
      const result = await searchFundedStartups({ keyword, page, pageSize });
      return send(res, 200, result);
    }

    /* ========================= Leads ========================= */

    // Search leads with filters (supports map-based lat/lng/radius search)
    if (req.method === "GET" && url.pathname === "/api/leads") {
      const country = url.searchParams.get("country") || "US";
      const trade = url.searchParams.get("trade") || "";
      const city = url.searchParams.get("city") || "";
      const lat = url.searchParams.get("lat") ? Number(url.searchParams.get("lat")) : undefined;
      const lng = url.searchParams.get("lng") ? Number(url.searchParams.get("lng")) : undefined;
      const radius = url.searchParams.get("radius") ? Number(url.searchParams.get("radius")) : undefined;
      const page = Number(url.searchParams.get("page")) || 1;
      const pageSize = Number(url.searchParams.get("pageSize")) || 20;
      const result = await filterLeads({ country, trade, city, lat, lng, radius, page, pageSize });
      return send(res, 200, result);
    }

    // Get saved leads
    if (req.method === "GET" && url.pathname === "/api/leads/saved") {
      const saved = await getSavedLeads();
      return send(res, 200, { leads: saved });
    }

    // Save a lead (accepts lead data in body for live API leads not in local store)
    if (req.method === "POST" && /^\/api\/leads\/[^/]+\/save$/.test(url.pathname)) {
      const id = url.pathname.split("/")[3];
      const body = await readJsonBody(req);
      const lead = await saveLead(id, body.lead || body);
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
