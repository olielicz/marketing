/**
 * Oli Admin Auth Server — issues and verifies sessions for the ONE owner
 * account that should have admin access across all 6 Oli tools. Zero
 * external dependencies (only Node's built-in `http` and `crypto`).
 *
 * Start with:  node server/index.js
 * Create the owner account first with:  node scripts/create-owner.js
 * See README.md for full setup + how other services should verify tokens
 * issued by this one.
 */
import { createServer } from "node:http";
import {
  getOwner,
  updateOwnerPassword,
  recordSuccessfulLogin,
  createSession,
  isSessionActive,
  touchSession,
  revokeSession,
  revokeAllSessions,
  listActiveSessions,
  recordFailedAttempt,
  clearFailedAttempts,
  countRecentFailedAttempts,
} from "./store.js";
import { verifyPassword, hashPassword, signSessionToken, verifySessionTokenSignature, getPublicKeyPem, newSessionId } from "./crypto.js";

const PORT = Number(process.env.PORT) || 4300;
const SESSION_TTL_MS = (Number(process.env.OLI_ADMIN_SESSION_TTL_HOURS) || 12) * 60 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = Number(process.env.OLI_ADMIN_MAX_FAILED_ATTEMPTS) || 5;
const LOCKOUT_WINDOW_MS = (Number(process.env.OLI_ADMIN_LOCKOUT_WINDOW_MINUTES) || 15) * 60 * 1000;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 100_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(json),
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(json);
}

function clientIp(req) {
  // Trust X-Forwarded-For only if you know your deployment sits behind a
  // reverse proxy that sets it (Render, Fly.io, etc. do). If you expose
  // this server directly to the internet with no proxy, remove this
  // header check — an attacker could otherwise spoof their lockout key.
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return String(forwarded).split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}

/**
 * Full verification of a bearer token: signature AND active-session check.
 * This is the function every other Oli backend service should call (via
 * GET /api/verify, see below) before trusting a request claims to be the
 * owner. Returns the session payload if valid, or null.
 */
async function verifyBearerToken(token) {
  const payload = verifySessionTokenSignature(token);
  if (!payload || !payload.sessionId) return null;
  const active = await isSessionActive(payload.sessionId);
  if (!active) return null;
  return payload;
}

function extractBearer(req) {
  const header = req.headers["authorization"] || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") return send(res, 204, {});

    const url = new URL(req.url, `http://localhost:${PORT}`);

    // GET /api/health — no auth
    if (req.method === "GET" && url.pathname === "/api/health") {
      const owner = await getOwner();
      return send(res, 200, { ok: true, ownerConfigured: Boolean(owner) });
    }

    // GET /api/public-key — no auth. Other Oli backend services (e.g. the
    // OliSalesTrack dashboard API, OliFlow's executor) can fetch this once
    // and verify a token's SIGNATURE themselves offline — but per this
    // server's own README, they should still call GET /api/verify for the
    // revocation check unless they've deliberately chosen to accept the
    // (small, documented) risk of trusting a revoked-but-not-yet-expired
    // token for up to their own cache TTL.
    if (req.method === "GET" && url.pathname === "/api/public-key") {
      return send(res, 200, { publicKeyPem: getPublicKeyPem() });
    }

    // POST /api/login  { username, password }
    // -> { ok:true, token, expiresAt } or { ok:false, error, lockedOutUntil? }
    if (req.method === "POST" && url.pathname === "/api/login") {
      const ip = clientIp(req);
      const lockoutKey = `login:${ip}`;

      const recentFailures = await countRecentFailedAttempts(lockoutKey, LOCKOUT_WINDOW_MS);
      if (recentFailures >= MAX_FAILED_ATTEMPTS) {
        return send(res, 429, {
          ok: false,
          error: `Too many failed login attempts. Try again in ${Math.ceil(LOCKOUT_WINDOW_MS / 60000)} minutes.`,
        });
      }

      const body = await readJsonBody(req);
      const username = String(body.username || "").trim().toLowerCase();
      const password = String(body.password || "");

      const owner = await getOwner();
      if (!owner) {
        return send(res, 503, { ok: false, error: "No owner account has been created yet. Run scripts/create-owner.js first." });
      }

      const usernameMatches = username === owner.username.toLowerCase();
      const passwordMatches = usernameMatches && verifyPassword(password, owner.salt, owner.hash);

      if (!usernameMatches || !passwordMatches) {
        await recordFailedAttempt(lockoutKey);
        // Deliberately identical error for "unknown username" and "wrong
        // password" — this service has exactly one valid username, so a
        // distinct "no such user" error would leak nothing an attacker
        // doesn't already know, but keeping the messages identical costs
        // nothing and matches good practice elsewhere in this repo.
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

    // GET /api/verify — Authorization: Bearer <token>
    // -> { ok:true, username, sessionId } or { ok:false }
    // This is the endpoint every OTHER Oli backend service should call to
    // check "is this really the owner, right now" — it's the only place
    // that can see live revocation state, unlike a purely-offline check.
    if (req.method === "GET" && url.pathname === "/api/verify") {
      const token = extractBearer(req);
      const payload = await verifyBearerToken(token);
      if (!payload) return send(res, 401, { ok: false });
      await touchSession(payload.sessionId);
      return send(res, 200, { ok: true, username: payload.username, sessionId: payload.sessionId });
    }

    // POST /api/logout — Authorization: Bearer <token> — revokes just this session
    if (req.method === "POST" && url.pathname === "/api/logout") {
      const token = extractBearer(req);
      const payload = verifySessionTokenSignature(token);
      if (!payload || !payload.sessionId) return send(res, 200, { ok: true }); // already invalid, nothing to do
      await revokeSession(payload.sessionId);
      return send(res, 200, { ok: true });
    }

    // POST /api/change-password  Authorization: Bearer <token>  { currentPassword, newPassword }
    // Revokes ALL sessions (including the one making this request) on
    // success, forcing a fresh login with the new password — the standard,
    // safe behavior after a credential change.
    if (req.method === "POST" && url.pathname === "/api/change-password") {
      const token = extractBearer(req);
      const payload = await verifyBearerToken(token);
      if (!payload) return send(res, 401, { ok: false, error: "Not authenticated." });

      const body = await readJsonBody(req);
      const currentPassword = String(body.currentPassword || "");
      const newPassword = String(body.newPassword || "");
      if (newPassword.length < 12) {
        return send(res, 400, { ok: false, error: "New password must be at least 12 characters." });
      }

      const owner = await getOwner();
      if (!verifyPassword(currentPassword, owner.salt, owner.hash)) {
        return send(res, 401, { ok: false, error: "Current password is incorrect." });
      }

      const { salt, hash } = hashPassword(newPassword);
      await updateOwnerPassword({ salt, hash });
      const revokedCount = await revokeAllSessions();

      return send(res, 200, { ok: true, message: "Password changed. All sessions (including this one) have been signed out — log in again with your new password.", sessionsRevoked: revokedCount });
    }

    // GET /api/sessions — Authorization: Bearer <token> — lists active sessions
    // (so the owner can see "am I logged in on some other device/browser
    // I forgot about" and revoke it — see POST /api/sessions/:id/revoke).
    if (req.method === "GET" && url.pathname === "/api/sessions") {
      const token = extractBearer(req);
      const payload = await verifyBearerToken(token);
      if (!payload) return send(res, 401, { ok: false });
      const sessions = await listActiveSessions();
      return send(res, 200, { ok: true, sessions });
    }

    // POST /api/sessions/:id/revoke — Authorization: Bearer <token>
    if (req.method === "POST" && /^\/api\/sessions\/[^/]+\/revoke$/.test(url.pathname)) {
      const token = extractBearer(req);
      const payload = await verifyBearerToken(token);
      if (!payload) return send(res, 401, { ok: false });
      const targetSessionId = decodeURIComponent(url.pathname.split("/")[3]);
      const revoked = await revokeSession(targetSessionId);
      return send(res, revoked ? 200 : 404, { ok: revoked });
    }

    return send(res, 404, { error: "not_found" });
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: "internal_error", message: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Oli Admin Auth Server listening on http://localhost:${PORT}`);
});
