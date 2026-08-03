/**
 * OliSalesTrack Live Sync Server — receives Stripe, PayPal, and Shopify
 * webhooks, verifies their signatures, normalizes each event into a sale or
 * refund record, and exposes a simple pull API (GET /api/events) for the
 * OliSalesTrack app to fetch new records since its last sync.
 *
 * This replaces the CSV-export/import round trip described on the
 * OliSalesTrack landing page FAQ with a real, always-on live sync path.
 * Zero external dependencies (built-in `http`, `crypto`, `fetch`), so it
 * runs comfortably on any free Node hosting tier — same approach as
 * ../licensing/server/index.js elsewhere in this repo.
 *
 * Start with:  node server/index.js
 * See README.md in this directory for full setup + API documentation.
 */
import { createServer } from "node:http";
import { appendEvents, listEvents } from "./store.js";
import { normalizeStripeEvent, normalizeShopifyEvent, normalizePaypalEvent } from "./normalize.js";
import { verifyStripeSignature, verifyShopifySignature, verifyPaypalSignature } from "./verify.js";

const PORT = Number(process.env.PORT) || 4200;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET || "";
const PAYPAL_WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID || "";
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || "";
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || "";
const PAYPAL_API_BASE = process.env.PAYPAL_API_BASE || "https://api-m.sandbox.paypal.com";

if (!ACCESS_TOKEN) {
  console.warn(
    "\n⚠️  ACCESS_TOKEN is not set. GET /api/events is effectively open to anyone.\n" +
      "   Set ACCESS_TOKEN in your .env before deploying this anywhere reachable from the internet.\n"
  );
}
if (!STRIPE_WEBHOOK_SECRET) {
  console.warn("⚠️  STRIPE_WEBHOOK_SECRET not set — POST /webhooks/stripe will reject all requests.");
}
if (!SHOPIFY_WEBHOOK_SECRET) {
  console.warn("⚠️  SHOPIFY_WEBHOOK_SECRET not set — POST /webhooks/shopify will reject all requests.");
}
if (!PAYPAL_WEBHOOK_ID || !PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
  console.warn("⚠️  PayPal credentials incomplete — POST /webhooks/paypal will reject all requests.");
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 2_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(json),
  });
  res.end(json);
}

function requireAccess(req) {
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return Boolean(ACCESS_TOKEN) && token === ACCESS_TOKEN;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    // GET /api/health — no auth, used by hosting platforms' health checks
    if (req.method === "GET" && url.pathname === "/api/health") {
      return send(res, 200, { ok: true });
    }

    // GET /api/events?since=ISO_DATE&provider=stripe|paypal|shopify  [auth required]
    // -> [{ id, provider, type, amountCents, currency, occurredAt, description }, ...]
    // OliSalesTrack calls this on a poll/refresh instead of asking the user to export a CSV.
    if (req.method === "GET" && url.pathname === "/api/events") {
      if (!requireAccess(req)) return send(res, 401, { error: "unauthorized" });
      const since = url.searchParams.get("since") || undefined;
      const provider = url.searchParams.get("provider") || undefined;
      const events = await listEvents({ since, provider });
      return send(res, 200, { events });
    }

    // POST /webhooks/stripe — verified with Stripe-Signature header
    if (req.method === "POST" && url.pathname === "/webhooks/stripe") {
      const rawBody = await readRawBody(req);
      const sigHeader = req.headers["stripe-signature"];
      if (!verifyStripeSignature(rawBody, sigHeader, STRIPE_WEBHOOK_SECRET)) {
        return send(res, 401, { error: "invalid_signature" });
      }
      let event;
      try {
        event = JSON.parse(rawBody);
      } catch {
        return send(res, 400, { error: "invalid_json" });
      }
      const records = normalizeStripeEvent(event);
      const inserted = await appendEvents(records);
      return send(res, 200, { ok: true, inserted: inserted.length });
    }

    // POST /webhooks/shopify — verified with X-Shopify-Hmac-Sha256 header.
    // Topic comes from the X-Shopify-Topic header (e.g. "orders/paid").
    if (req.method === "POST" && url.pathname === "/webhooks/shopify") {
      const rawBody = await readRawBody(req);
      const sigHeader = req.headers["x-shopify-hmac-sha256"];
      if (!verifyShopifySignature(rawBody, sigHeader, SHOPIFY_WEBHOOK_SECRET)) {
        return send(res, 401, { error: "invalid_signature" });
      }
      let payload;
      try {
        payload = JSON.parse(rawBody);
      } catch {
        return send(res, 400, { error: "invalid_json" });
      }
      const topic = req.headers["x-shopify-topic"] || "";
      const records = normalizeShopifyEvent(topic, payload);
      const inserted = await appendEvents(records);
      return send(res, 200, { ok: true, inserted: inserted.length });
    }

    // POST /webhooks/paypal — verified via PayPal's verify-webhook-signature API
    if (req.method === "POST" && url.pathname === "/webhooks/paypal") {
      const rawBody = await readRawBody(req);
      const verified = await verifyPaypalSignature({
        headers: req.headers,
        rawBody,
        webhookId: PAYPAL_WEBHOOK_ID,
        clientId: PAYPAL_CLIENT_ID,
        clientSecret: PAYPAL_CLIENT_SECRET,
        apiBase: PAYPAL_API_BASE,
      });
      if (!verified) return send(res, 401, { error: "invalid_signature" });
      let event;
      try {
        event = JSON.parse(rawBody);
      } catch {
        return send(res, 400, { error: "invalid_json" });
      }
      const records = normalizePaypalEvent(event);
      const inserted = await appendEvents(records);
      return send(res, 200, { ok: true, inserted: inserted.length });
    }

    return send(res, 404, { error: "not_found" });
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: "internal_error", message: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`OliSalesTrack Sync Server listening on http://localhost:${PORT}`);
});
