import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { startFakeSmtpServer } from "./fakeSmtpServer.js";

const tmpDir = mkdtempSync(path.join(os.tmpdir(), "olicommerce-backend-test-"));
process.env.OLICOMMERCE_DATA_DIR = tmpDir;
process.env.PORT = "0";

const { server } = await import("../server/index.js");
const { createOwner } = await import("../server/store.js");
const { hashPassword } = await import("../server/auth.js");

let baseUrl;
let fakeSmtp;

test.before(async () => {
  const { salt, hash } = hashPassword("test-owner-password-123456");
  await createOwner({ username: "merchant@shop.example.com", salt, hash });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  fakeSmtp = await startFakeSmtpServer();
});
test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fakeSmtp.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function request(method, urlPath, { token, body, headers } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const reqHeaders = { "Content-Type": "application/json", ...(headers || {}) };
    if (token) reqHeaders.Authorization = `Bearer ${token}`;
    const req = http.request(`${baseUrl}${urlPath}`, { method, headers: reqHeaders }, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => {
        let json;
        try { json = JSON.parse(raw); } catch { json = raw; }
        resolve({ status: res.statusCode, body: json });
      });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

let ownerToken;

test("login works with the seeded owner account", async () => {
  const res = await request("POST", "/api/login", { body: { username: "merchant@shop.example.com", password: "test-owner-password-123456" } });
  assert.equal(res.status, 200);
  ownerToken = res.body.token;
});

test("protected /api/carts rejects requests with no token", async () => {
  const res = await request("GET", "/api/carts");
  assert.equal(res.status, 401);
});

test("cart-abandoned webhook is public (no owner auth) but requires externalId", async () => {
  const res = await request("POST", "/api/webhooks/cart-abandoned", { body: { customerEmail: "x@example.com" } });
  assert.equal(res.status, 400);
});

test("cart-abandoned webhook captures a new cart with real item-total math", async () => {
  const res = await request("POST", "/api/webhooks/cart-abandoned", {
    body: {
      externalId: "shopify-checkout-abc123",
      source: "shopify",
      customerEmail: "jane@example.com",
      customerName: "Jane Doe",
      items: [{ title: "Blue T-Shirt", quantity: 2, priceCents: 2500 }],
      checkoutUrl: "https://shop.example.com/checkout/abc123",
    },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.isNew, true);
  assert.equal(res.body.cart.cartValueCents, 5000);
  assert.equal(res.body.cart.status, "abandoned");
});

test("a repeated webhook fire for the SAME externalId updates the existing cart instead of duplicating it", async () => {
  const res = await request("POST", "/api/webhooks/cart-abandoned", {
    body: {
      externalId: "shopify-checkout-abc123", // same as above
      customerEmail: "jane@example.com",
      items: [{ title: "Blue T-Shirt", quantity: 3, priceCents: 2500 }], // quantity changed
    },
  });
  assert.equal(res.status, 200); // not 201 - this is an update, not a new record
  assert.equal(res.body.isNew, false);
  assert.equal(res.body.cart.cartValueCents, 7500); // updated total

  const listed = await request("GET", "/api/carts", { token: ownerToken });
  assert.equal(listed.body.carts.length, 1); // still just one cart, not two
});

test("owner can list carts once authenticated", async () => {
  const res = await request("GET", "/api/carts", { token: ownerToken });
  assert.equal(res.status, 200);
  assert.equal(res.body.carts.length, 1);
});

test("preview-email returns a real, non-AI template by default", async () => {
  const listed = await request("GET", "/api/carts", { token: ownerToken });
  const cartId = listed.body.carts[0].id;
  const res = await request("POST", `/api/carts/${cartId}/preview-email`, { token: ownerToken, body: { tone: "friendly" } });
  assert.equal(res.status, 200);
  assert.equal(res.body.email.aiRewriteAttempted, false);
  assert.match(res.body.email.html, /Blue T-Shirt/);
});

test("send-recovery fails clearly when SMTP is not configured", async () => {
  const listed = await request("GET", "/api/carts", { token: ownerToken });
  const cartId = listed.body.carts[0].id;
  // SMTP_HOST is intentionally unset in this test's env at this point.
  const res = await request("POST", `/api/carts/${cartId}/send-recovery`, { token: ownerToken, body: { tone: "friendly" } });
  assert.equal(res.status, 503);
  assert.match(res.body.error, /SMTP is not configured/);
});

test("send-recovery actually sends a real email via SMTP once configured, and updates cart status", async () => {
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = String(fakeSmtp.port);
  process.env.SMTP_REJECT_UNAUTHORIZED = "false"; // fake server uses a self-signed test cert
  process.env.SMTP_FROM = "noreply@shop.example.com";

  try {
    const listed = await request("GET", "/api/carts", { token: ownerToken });
    const cartId = listed.body.carts[0].id;

    const res = await request("POST", `/api/carts/${cartId}/send-recovery`, { token: ownerToken, body: { tone: "discount" } });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.cart.status, "recovery_sent");
    assert.equal(res.body.cart.recoveryEmailsSent.length, 1);

    // Confirm the fake SMTP server genuinely received the email.
    assert.equal(fakeSmtp.receivedMail.length, 1);
    assert.equal(fakeSmtp.receivedMail[0].from, "noreply@shop.example.com");
    assert.deepEqual(fakeSmtp.receivedMail[0].to, ["jane@example.com"]);
    assert.match(fakeSmtp.receivedMail[0].data, /off/i); // discount tone
  } finally {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_REJECT_UNAUTHORIZED;
    delete process.env.SMTP_FROM;
  }
});

test("mark-recovered updates cart status", async () => {
  const listed = await request("GET", "/api/carts", { token: ownerToken });
  const cartId = listed.body.carts[0].id;
  const res = await request("POST", `/api/carts/${cartId}/mark-recovered`, { token: ownerToken });
  assert.equal(res.status, 200);
  assert.equal(res.body.cart.status, "recovered");
});

test("deleting a cart removes it from the list", async () => {
  const listed = await request("GET", "/api/carts", { token: ownerToken });
  const cartId = listed.body.carts[0].id;
  const res = await request("DELETE", `/api/carts/${cartId}`, { token: ownerToken });
  assert.equal(res.status, 200);
  const listedAfter = await request("GET", "/api/carts", { token: ownerToken });
  assert.equal(listedAfter.body.carts.length, 0);
});


test("AI support chat answers confidently from the knowledge base with zero configuration", async () => {
  const res = await request("POST", "/api/support/chat", { body: { message: "how do I connect my shopify abandoned cart webhook" } });
  assert.equal(res.status, 200);
  assert.equal(res.body.source, "knowledge_base");
  assert.equal(res.body.confident, true);
  assert.equal(res.body.ticketId, null);
});

test("AI support chat escalates an unanswerable question to a real support ticket", async () => {
  const res = await request("POST", "/api/support/chat", { body: { message: "does olicommerce predict tomorrow's lottery numbers", contactEmail: "merchant2@example.com" } });
  assert.equal(res.status, 200);
  assert.equal(res.body.shouldEscalate, true);
  assert.ok(res.body.ticketId);

  const tickets = await request("GET", "/api/support/tickets", { token: ownerToken });
  assert.equal(tickets.status, 200);
  const found = tickets.body.tickets.find((t) => t.id === res.body.ticketId);
  assert.ok(found);
  assert.equal(found.contactEmail, "merchant2@example.com");
});

test("support ticket lifecycle: manual create, close, reopen, delete", async () => {
  const created = await request("POST", "/api/support/tickets", { body: { subject: "Manual test ticket" } });
  assert.equal(created.status, 201);
  const id = created.body.ticket.id;

  const closed = await request("POST", `/api/support/tickets/${id}/close`, { token: ownerToken });
  assert.equal(closed.body.ticket.status, "closed");

  const reopened = await request("POST", `/api/support/tickets/${id}/reopen`, { token: ownerToken });
  assert.equal(reopened.body.ticket.status, "open");

  const deleted = await request("DELETE", `/api/support/tickets/${id}`, { token: ownerToken });
  assert.equal(deleted.status, 200);
});

test("support ticket management endpoints require owner auth", async () => {
  const res = await request("GET", "/api/support/tickets");
  assert.equal(res.status, 401);
});


test("order-paid webhook fails clearly when supplier email is not configured", async () => {
  // OLICOMMERCE_SUPPLIER_EMAIL is read once at module-load time in
  // server/index.js (same pattern as OLICOMMERCE_WEBHOOK_SECRET — see
  // webhookSecret.test.js's header comment), so it's genuinely unset in
  // THIS already-imported server instance — the real, intended test of
  // the unconfigured-server code path. Tests that need it actually SET
  // live in orderPaidWebhook.test.js's own isolated process instead.
  const res = await request("POST", "/api/webhooks/order-paid", { body: { name: "#9001", line_items: [{ sku: "X", title: "Widget", quantity: 1, price: "9.99" }] } });
  assert.equal(res.status, 503);
  assert.match(res.body.error, /OLICOMMERCE_SUPPLIER_EMAIL/);
});



test("product catalog management requires owner auth", async () => {
  const res = await request("GET", "/api/products");
  assert.equal(res.status, 401);
});

test("product catalog lifecycle: create, list, update, delete", async () => {
  const created = await request("POST", "/api/products", { token: ownerToken, body: { title: "Green Hoodie", description: "Cozy fleece hoodie.", priceCents: 4500, tags: ["hoodie", "green"] } });
  assert.equal(created.status, 201);
  const id = created.body.product.id;

  const listed = await request("GET", "/api/products", { token: ownerToken });
  assert.equal(listed.status, 200);
  assert.ok(listed.body.products.some((p) => p.id === id));

  const updated = await request("PUT", `/api/products/${id}`, { token: ownerToken, body: { priceCents: 4000 } });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.product.priceCents, 4000);

  const deleted = await request("DELETE", `/api/products/${id}`, { token: ownerToken });
  assert.equal(deleted.status, 200);
});

test("storefront AI shopping assistant is public and answers only from the real catalog", async () => {
  const created = await request("POST", "/api/products", { token: ownerToken, body: { title: "Purple Scarf", description: "Soft knit scarf.", priceCents: 1999, tags: ["scarf", "winter"] } });
  const productId = created.body.product.id;

  try {
    const res = await request("POST", "/api/storefront/chat", { body: { message: "do you have a scarf" } });
    assert.equal(res.status, 200);
    assert.equal(res.body.source, "catalog");
    assert.equal(res.body.confident, true);
    assert.match(res.body.answer, /Purple Scarf/);
    // FIX: this used to hardcode "$" with no way to configure it - now
    // this real /api/storefront/chat route passes OLICOMMERCE_STORE_CURRENCY
    // (default "USD" out of the box, but genuinely configurable to
    // GBP/EUR/AUD/PHP/etc.) through to formatMoney() - see
    // storefrontAssistant.test.js's dedicated multi-currency tests.
    assert.match(res.body.answer, /\$19\.99/);
  } finally {
    await request("DELETE", `/api/products/${productId}`, { token: ownerToken });
  }
});

test("storefront AI shopping assistant is honest when the catalog is empty or has no match", async () => {
  const res = await request("POST", "/api/storefront/chat", { body: { message: "do you sell spaceships" } });
  assert.equal(res.status, 200);
  assert.equal(res.body.confident, false);
  assert.equal(res.body.recommendedProducts.length, 0);
});

test("storefront widget script is served as real, embeddable JavaScript", async () => {
  const res = await request("GET", "/api/storefront/widget.js");
  assert.equal(res.status, 200);
  assert.match(res.body, /api\/storefront\/chat/);
});
