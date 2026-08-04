/**
 * OliCommerce Backend — a real, self-hosted abandoned-cart recovery
 * server. Zero external dependencies (only Node's built-in `http`,
 * `crypto`, `net`, `tls`).
 *
 * Explicit scope (read before selling this as "OliCommerce"):
 *   ✅ Real: abandoned-cart capture via storefront webhook, cart
 *      listing, recovery email sending via a real SMTP client.
 *   ✅ Real (opt-in, honest): AI-rewritten recovery emails — ONLY when
 *      you configure a real OPENAI_API_KEY. Without one, every email
 *      uses a real (non-AI) template — never a fabricated "AI" result.
 *      See recoveryEmail.js's header comment.
 *   ❌ NOT implemented: browse-abandonment tracking (as opposed to
 *      cart/checkout abandonment), automated multi-step drip sequences
 *      (this sends one recovery email per trigger call, not a
 *      time-delayed series), and any payment-gateway-specific webhook
 *      signature verification beyond what's documented in README.md
 *      (you're responsible for pointing your Shopify/WooCommerce/custom
 *      storefront's abandoned-checkout webhook at this service's
 *      /api/webhooks/cart-abandoned endpoint — see README.md for the
 *      expected payload shape).
 *
 * Start with:  node server/index.js
 * Create the owner account first with:  node scripts/create-owner.js
 */
import { createServer } from "node:http";
import {
  getOwner, createSession, isSessionActive, revokeSession, revokeAllSessions,
  recordSuccessfulLogin, recordFailedAttempt, clearFailedAttempts, countRecentFailedAttempts,
  updateOwnerPassword,
  listCarts, getCart, upsertCart, markCartStatus, recordRecoveryEmailSent, deleteCart,
} from "./store.js";
import { verifyPassword, hashPassword, signSessionToken, verifySessionTokenSignature, newSessionId } from "./auth.js";
import { generateRecoveryEmail } from "./recoveryEmail.js";
import { sendMail } from "./smtpClient.js";

const PORT = Number(process.env.PORT) || 4600;
const SESSION_TTL_MS = (Number(process.env.OLICOMMERCE_SESSION_TTL_HOURS) || 12) * 60 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = Number(process.env.OLICOMMERCE_MAX_FAILED_ATTEMPTS) || 5;
const LOCKOUT_WINDOW_MS = (Number(process.env.OLICOMMERCE_LOCKOUT_WINDOW_MINUTES) || 15) * 60 * 1000;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const STORE_NAME = process.env.OLICOMMERCE_STORE_NAME || "your store";
const WEBHOOK_SHARED_SECRET = process.env.OLICOMMERCE_WEBHOOK_SECRET || "";

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

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(json),
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(json);
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

    /* ------------------------------ Storefront webhook (public, secret-gated) ------------------------------ */
    // See README.md for the exact payload shape a Shopify/WooCommerce/
    // custom storefront integration should POST here. Gated by a shared
    // secret (query param or header) rather than owner session auth,
    // since the caller is your storefront platform, not a logged-in
    // human — matches how Shopify/Stripe/PayPal webhooks are typically
    // verified elsewhere in this repo (see ../olisalestrack-sync).
    if (req.method === "POST" && url.pathname === "/api/webhooks/cart-abandoned") {
      if (WEBHOOK_SHARED_SECRET) {
        const providedSecret = req.headers["x-webhook-secret"] || url.searchParams.get("secret") || "";
        if (providedSecret !== WEBHOOK_SHARED_SECRET) return send(res, 401, { error: "invalid_secret" });
      }
      const body = await readJsonBody(req);
      if (!body.externalId) return send(res, 400, { error: "externalId is required (your platform's own cart/checkout id, used to de-duplicate repeated webhook fires)" });
      const { cart, isNew } = await upsertCart(body);
      return send(res, isNew ? 201 : 200, { ok: true, cart, isNew });
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
      return send(res, 200, { ok: true, token, expiresAt, storeName: STORE_NAME });
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

    // Everything below requires a valid owner session.
    const auth = await requireAuth(req);
    if (!auth) return send(res, 401, { error: "unauthorized" });

    /* -------------------------------- Carts -------------------------------- */

    if (req.method === "GET" && url.pathname === "/api/carts") {
      const status = url.searchParams.get("status") || undefined;
      return send(res, 200, { carts: await listCarts({ status }) });
    }
    if (req.method === "DELETE" && url.pathname.startsWith("/api/carts/")) {
      const id = url.pathname.split("/")[3];
      const deleted = await deleteCart(id);
      return send(res, deleted ? 200 : 404, { ok: deleted });
    }

    /* ------------------------------ Recovery email preview ------------------------------ */
    // Builds (but does not send) a recovery email — used by the frontend
    // to preview what will be sent, including whether AI rewrite is
    // actually available server-side, before the merchant clicks "Send."
    if (req.method === "POST" && /^\/api\/carts\/[^/]+\/preview-email$/.test(url.pathname)) {
      const id = url.pathname.split("/")[3];
      const cart = await getCart(id);
      if (!cart) return send(res, 404, { error: "not_found" });
      const body = await readJsonBody(req);
      const email = await generateRecoveryEmail(cart, {
        storeName: STORE_NAME,
        tone: body.tone || "friendly",
        useAi: Boolean(body.useAi),
        openaiApiKey: process.env.OPENAI_API_KEY,
        openaiApiBaseUrl: process.env.OPENAI_API_BASE_URL,
        openaiModel: process.env.OPENAI_MODEL,
      });
      return send(res, 200, { email });
    }

    /* ------------------------------ Send recovery email ------------------------------ */

    if (req.method === "POST" && /^\/api\/carts\/[^/]+\/send-recovery$/.test(url.pathname)) {
      const id = url.pathname.split("/")[3];
      const cart = await getCart(id);
      if (!cart) return send(res, 404, { error: "not_found" });
      if (!cart.customerEmail) return send(res, 400, { error: "This cart has no customer email on file — cannot send a recovery email." });

      const smtpHost = process.env.SMTP_HOST;
      if (!smtpHost) return send(res, 503, { error: "SMTP is not configured on this server. Set SMTP_HOST (and SMTP_PORT/SMTP_USER/SMTP_PASS) in your environment — see README.md." });

      const body = await readJsonBody(req);
      const email = await generateRecoveryEmail(cart, {
        storeName: STORE_NAME,
        tone: body.tone || "friendly",
        useAi: Boolean(body.useAi),
        openaiApiKey: process.env.OPENAI_API_KEY,
        openaiApiBaseUrl: process.env.OPENAI_API_BASE_URL,
        openaiModel: process.env.OPENAI_MODEL,
      });

      const sendResult = await sendMail({
        host: smtpHost,
        port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined,
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
        rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED !== "false",
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: cart.customerEmail,
        subject: email.subject,
        html: email.html,
      });

      if (!sendResult.ok) return send(res, 502, { error: `Failed to send email: ${sendResult.error}` });

      const updatedCart = await recordRecoveryEmailSent(id, { subject: email.subject, tone: body.tone || "friendly" });
      return send(res, 200, { ok: true, cart: updatedCart, aiRewriteAttempted: email.aiRewriteAttempted, aiRewriteUsed: email.aiRewriteUsed, aiRewriteNote: email.aiRewriteNote });
    }

    if (req.method === "POST" && /^\/api\/carts\/[^/]+\/mark-recovered$/.test(url.pathname)) {
      const id = url.pathname.split("/")[3];
      const cart = await markCartStatus(id, "recovered");
      if (!cart) return send(res, 404, { error: "not_found" });
      return send(res, 200, { cart });
    }

    return send(res, 404, { error: "not_found" });
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: "internal_error", message: err.message });
  }
});

if (import.meta.url === `file://${process.argv[1]}`) {
  server.listen(PORT, () => console.log(`OliCommerce Backend listening on http://localhost:${PORT}`));
}

export { server };
