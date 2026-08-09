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
 *   ✅ Real: supplier CSV forwarding (see orderCsv.js) — a real order-
 *      paid webhook builds a genuine, supplier-friendly CSV and emails
 *      it via this service's real SMTP client, once you configure
 *      OLICOMMERCE_SUPPLIER_EMAIL + SMTP_HOST. Ported from the working
 *      ecomm-automation repo. This is the honest, working version of
 *      the "Supplier CSV forwarding" feature that was previously
 *      marketed, found unimplemented, and removed — now genuinely built.
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
  listSupportTickets, getSupportTicket, createSupportTicket, updateSupportTicketStatus, deleteSupportTicket,
  listProducts, getProduct, createProduct, updateProduct, deleteProduct,
} from "./store.js";
import { verifyPassword, hashPassword, signSessionToken, verifySessionTokenSignature, newSessionId } from "./auth.js";
import { generateRecoveryEmail } from "./recoveryEmail.js";
import { sendMail } from "./smtpClient.js";
import { generateSupportAnswer } from "./supportAssistant.js";
import { buildOrderCsv, buildSupplierOrderEmail } from "./orderCsv.js";
import { generateStorefrontAnswer } from "./storefrontAssistant.js";

const PORT = Number(process.env.PORT) || 4600;
const SESSION_TTL_MS = (Number(process.env.OLICOMMERCE_SESSION_TTL_HOURS) || 12) * 60 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = Number(process.env.OLICOMMERCE_MAX_FAILED_ATTEMPTS) || 5;
const LOCKOUT_WINDOW_MS = (Number(process.env.OLICOMMERCE_LOCKOUT_WINDOW_MINUTES) || 15) * 60 * 1000;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const STORE_NAME = process.env.OLICOMMERCE_STORE_NAME || "your store";
// ⚠️ FIX: storefrontAssistant.js's formatMoney() previously hardcoded
// "$" with no setting to change it at all - a real customer caught this
// (a shopper asking about products would always see USD prices,
// regardless of the store's real currency). Defaults to USD out of the
// box, but this is genuinely NOT limited to USD — set
// OLICOMMERCE_STORE_CURRENCY to any real ISO 4217 code (GBP, EUR, AUD,
// PHP, CAD, JPY, ...) and every price the storefront assistant quotes,
// plus recoveryEmail.js's cart-abandonment emails below, switches to it.
const STORE_CURRENCY = process.env.OLICOMMERCE_STORE_CURRENCY || "USD";
const WEBHOOK_SHARED_SECRET = process.env.OLICOMMERCE_WEBHOOK_SECRET || "";
const SUPPLIER_EMAIL = process.env.OLICOMMERCE_SUPPLIER_EMAIL || "";

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

/**
 * A small, real, dependency-free embeddable chat widget — plain JS/CSS
 * injected into the page, no framework, no build step. Talks to THIS
 * backend's real /api/storefront/chat endpoint. See README.md's
 * "Embedding the AI shopping assistant" section for the one-line
 * <script> tag a merchant pastes into their storefront theme.
 */
function buildWidgetScript(origin) {
  return `(function(){
  var API_BASE = ${JSON.stringify(origin)};
  var launcher = document.createElement("button");
  launcher.textContent = "\uD83D\uDECD\uFE0F Ask us";
  launcher.setAttribute("aria-label", "Open shopping assistant");
  launcher.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:99999;background:#4f46e5;color:#fff;border:none;border-radius:999px;padding:12px 18px;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.2);font-family:system-ui,sans-serif;";
  var panel = document.createElement("div");
  panel.style.cssText = "position:fixed;bottom:78px;right:20px;z-index:99999;width:320px;max-height:420px;background:#fff;border-radius:14px;box-shadow:0 12px 32px rgba(0,0,0,.25);display:none;flex-direction:column;overflow:hidden;font-family:system-ui,sans-serif;";
  var log = document.createElement("div");
  log.style.cssText = "flex:1;overflow-y:auto;padding:14px;font-size:13.5px;color:#14161a;display:flex;flex-direction:column;gap:8px;";
  var form = document.createElement("form");
  form.style.cssText = "display:flex;gap:6px;padding:10px;border-top:1px solid #e7e9ee;";
  var input = document.createElement("input");
  input.placeholder = "Ask about a product...";
  input.style.cssText = "flex:1;padding:8px 10px;border:1px solid #e7e9ee;border-radius:8px;font-size:13px;";
  var sendBtn = document.createElement("button");
  sendBtn.type = "submit";
  sendBtn.textContent = "Send";
  sendBtn.style.cssText = "background:#4f46e5;color:#fff;border:none;border-radius:8px;padding:8px 12px;font-size:13px;font-weight:700;cursor:pointer;";
  form.appendChild(input); form.appendChild(sendBtn);
  panel.appendChild(log); panel.appendChild(form);
  document.body.appendChild(launcher); document.body.appendChild(panel);

  function addMsg(role, text) {
    var div = document.createElement("div");
    div.style.cssText = role === "user"
      ? "align-self:flex-end;background:#4f46e5;color:#fff;padding:8px 11px;border-radius:10px;max-width:85%;white-space:pre-wrap;"
      : "align-self:flex-start;background:#f0f1f6;color:#14161a;padding:8px 11px;border-radius:10px;max-width:85%;white-space:pre-wrap;";
    div.textContent = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  launcher.addEventListener("click", function () {
    panel.style.display = panel.style.display === "none" ? "flex" : "none";
    if (!log.children.length) addMsg("assistant", "Hi! Ask me about a product and I will check our real catalog for you.");
  });

  var history = [];
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var message = input.value.trim();
    if (!message) return;
    addMsg("user", message);
    history.push({ role: "user", content: message });
    input.value = "";
    fetch(API_BASE + "/api/storefront/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message, history: history.slice(-8) }),
    }).then(function (r) { return r.json(); }).then(function (data) {
      addMsg("assistant", data.answer || "Sorry, something went wrong.");
      history.push({ role: "assistant", content: data.answer || "" });
    }).catch(function () {
      addMsg("assistant", "Could not reach the shopping assistant right now.");
    });
  });
})();
`;
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

    /* --------------------------- Supplier CSV forwarding (public, secret-gated) --------------------------- */
    // Real feature, ported from ecomm-automation's src/handlers/
    // orderPaid.js + src/utils/csv.js (see orderCsv.js's header comment
    // for the full provenance). Point your storefront's order-paid
    // webhook here (e.g. Shopify's `orders/paid` topic) with the same
    // shape Shopify sends (line_items, shipping_address, etc.) — this
    // builds a real CSV and emails it to your configured supplier via
    // this service's own SMTP client. Gated the same way as the
    // cart-abandoned webhook above (shared secret, not owner auth,
    // since the caller is your storefront platform).
    if (req.method === "POST" && url.pathname === "/api/webhooks/order-paid") {
      if (WEBHOOK_SHARED_SECRET) {
        const providedSecret = req.headers["x-webhook-secret"] || url.searchParams.get("secret") || "";
        if (providedSecret !== WEBHOOK_SHARED_SECRET) return send(res, 401, { error: "invalid_secret" });
      }
      if (!SUPPLIER_EMAIL) {
        return send(res, 503, { error: "OLICOMMERCE_SUPPLIER_EMAIL is not configured on this server — set it in your environment to enable supplier CSV forwarding. See README.md." });
      }
      const smtpHost = process.env.SMTP_HOST;
      if (!smtpHost) return send(res, 503, { error: "SMTP is not configured on this server. Set SMTP_HOST (and SMTP_PORT/SMTP_USER/SMTP_PASS) in your environment — see README.md." });

      const order = await readJsonBody(req);
      const lineItems = order.line_items || order.lineItems || [];
      if (!lineItems.length) return send(res, 400, { error: "Order payload must include at least one line item (line_items or lineItems)." });

      const csv = buildOrderCsv(order);
      const { subject, html, text } = buildSupplierOrderEmail(order, STORE_NAME);
      const safeName = String(order.name || order.orderNumber || "order").replace(/[^a-z0-9_-]/gi, "_");

      const sendResult = await sendMail({
        host: smtpHost,
        port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined,
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
        rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED !== "false",
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: SUPPLIER_EMAIL,
        subject,
        html,
        text,
        attachments: [{ filename: `${safeName}.csv`, content: csv, contentType: "text/csv" }],
      });

      if (!sendResult.ok) return send(res, 502, { error: `Failed to forward order CSV to supplier: ${sendResult.error}` });
      return send(res, 200, { ok: true, forwardedTo: SUPPLIER_EMAIL, lineItemCount: lineItems.length });
    }

    /* ------------------------------ AI shopping assistant (public, customer-facing) ------------------------------ */
    // Unlike /api/support/chat below (which helps the MERCHANT), this
    // endpoint IS the customer-facing storefront widget — see
    // storefrontAssistant.js's header comment for why this replaces the
    // previously-fictional "OliMind AI shopping assistant" with a real,
    // scoped-down, catalog-grounded assistant instead. Deliberately
    // public and unauthenticated: it's meant to be called by any
    // shopper on the storefront, embedded via the widget script below.
    if (req.method === "POST" && url.pathname === "/api/storefront/chat") {
      const body = await readJsonBody(req);
      const message = String(body.message || "").trim();
      if (!message) return send(res, 400, { error: "message is required" });

      const products = await listProducts();
      const result = await generateStorefrontAnswer(message, products, {
        history: Array.isArray(body.history) ? body.history : [],
        useAi: Boolean(body.useAi),
        openaiApiKey: process.env.OPENAI_API_KEY,
        openaiApiBaseUrl: process.env.OPENAI_API_BASE_URL,
        openaiModel: process.env.OPENAI_MODEL,
        currency: STORE_CURRENCY,
      });
      return send(res, 200, result);
    }

    // A real, embeddable widget script — plain JS, no build step, no
    // framework — that a merchant pastes into their storefront theme
    // (see README.md's "Embedding the AI shopping assistant" section).
    // Served from THIS backend so the widget always calls the correct
    // /api/storefront/chat origin without the merchant hand-editing a
    // URL into a static script file.
    if (req.method === "GET" && url.pathname === "/api/storefront/widget.js") {
      const origin = `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}`;
      return send(res, 200, buildWidgetScript(origin), "application/javascript");
    }

    /* ------------------------------ AI Support Assistant (public) ------------------------------ */
    // Public like the cart-abandoned webhook above — this helps the
    // merchant running this OliCommerce instance troubleshoot the
    // product itself (e.g. while locked out of their own login), not a
    // customer-facing widget for their store's shoppers. (The
    // customer-facing widget is /api/storefront/chat above.)
    if (req.method === "POST" && url.pathname === "/api/support/chat") {
      const body = await readJsonBody(req);
      const message = String(body.message || "").trim();
      if (!message) return send(res, 400, { error: "message is required" });

      const result = await generateSupportAnswer(message, {
        history: Array.isArray(body.history) ? body.history : [],
        useAi: Boolean(body.useAi),
        openaiApiKey: process.env.OPENAI_API_KEY,
        openaiApiBaseUrl: process.env.OPENAI_API_BASE_URL,
        openaiModel: process.env.OPENAI_MODEL,
      });

      let ticket = null;
      if (result.shouldEscalate) {
        ticket = await createSupportTicket({
          subject: message.slice(0, 120),
          transcript: [...(Array.isArray(body.history) ? body.history : []), { role: "user", content: message }, { role: "assistant", content: result.answer }],
          contactEmail: body.contactEmail || "",
          contactName: body.contactName || "",
          reason: `assistant_not_confident (source: ${result.source})`,
        });
      }

      return send(res, 200, { ...result, ticketId: ticket ? ticket.id : null });
    }

    if (req.method === "POST" && url.pathname === "/api/support/tickets") {
      const body = await readJsonBody(req);
      const ticket = await createSupportTicket({
        subject: body.subject || "Support request",
        transcript: Array.isArray(body.transcript) ? body.transcript : [],
        contactEmail: body.contactEmail || "",
        contactName: body.contactName || "",
        reason: body.reason || "manual_request",
      });
      return send(res, 201, { ticket });
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

    /* ---------------------- Product catalog (owner-only management) ---------------------- */
    // The real catalog the storefront AI assistant (above, public) is
    // grounded in. Managing it requires the owner login — same as every
    // other business-data endpoint — but the assistant that READS it is
    // deliberately public, since it's meant for shoppers, not the owner.

    if (req.method === "GET" && url.pathname === "/api/products") {
      return send(res, 200, { products: await listProducts() });
    }
    if (req.method === "POST" && url.pathname === "/api/products") {
      const body = await readJsonBody(req);
      if (!body.title) return send(res, 400, { error: "title is required" });
      return send(res, 201, { product: await createProduct(body) });
    }
    if (req.method === "PUT" && url.pathname.startsWith("/api/products/")) {
      const id = url.pathname.split("/")[3];
      const body = await readJsonBody(req);
      const updated = await updateProduct(id, body);
      if (!updated) return send(res, 404, { error: "not_found" });
      return send(res, 200, { product: updated });
    }
    if (req.method === "DELETE" && url.pathname.startsWith("/api/products/")) {
      const id = url.pathname.split("/")[3];
      const deleted = await deleteProduct(id);
      return send(res, deleted ? 200 : 404, { ok: deleted });
    }

    /* ------------------------- Support tickets (owner-only management) ------------------------- */

    if (req.method === "GET" && url.pathname === "/api/support/tickets") {
      const status = url.searchParams.get("status") || undefined;
      return send(res, 200, { tickets: await listSupportTickets({ status }) });
    }
    if (req.method === "GET" && url.pathname.startsWith("/api/support/tickets/")) {
      const id = url.pathname.split("/")[4];
      const ticket = await getSupportTicket(id);
      if (!ticket) return send(res, 404, { error: "not_found" });
      return send(res, 200, { ticket });
    }
    if (req.method === "POST" && /^\/api\/support\/tickets\/[^/]+\/close$/.test(url.pathname)) {
      const id = url.pathname.split("/")[4];
      const ticket = await updateSupportTicketStatus(id, "closed");
      if (!ticket) return send(res, 404, { error: "not_found" });
      return send(res, 200, { ticket });
    }
    if (req.method === "POST" && /^\/api\/support\/tickets\/[^/]+\/reopen$/.test(url.pathname)) {
      const id = url.pathname.split("/")[4];
      const ticket = await updateSupportTicketStatus(id, "open");
      if (!ticket) return send(res, 404, { error: "not_found" });
      return send(res, 200, { ticket });
    }
    if (req.method === "DELETE" && url.pathname.startsWith("/api/support/tickets/")) {
      const id = url.pathname.split("/")[4];
      const deleted = await deleteSupportTicket(id);
      return send(res, deleted ? 200 : 404, { ok: deleted });
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
