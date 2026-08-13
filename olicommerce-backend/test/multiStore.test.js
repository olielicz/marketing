import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";

// FIX: this test file verifies the real multi-store enforcement added to
// OliCommerce — Scale tier's advertised "multi-store operations" is now
// backed by a real license-verified store-count cap, not marketing text.
// Uses a fresh temp data dir + a fake in-process license server (no real
// network call to the shared licensing service needed for this test).

const tmpDir = mkdtempSync(path.join(os.tmpdir(), "olicommerce-multistore-test-"));
process.env.OLICOMMERCE_DATA_DIR = tmpDir;
process.env.PORT = "0";

// A minimal fake license server: always returns a fixed tier/maxUsers for
// whatever licenseKey is requested, so this test doesn't depend on the
// real licensing service being deployed anywhere.
//
// IMPORTANT: this must be started, and OLI_LICENSE_SERVER_URL set, BEFORE
// the dynamic `import("../server/index.js")` below — that import reads
// the env var into a module-level constant AT IMPORT TIME, which runs
// immediately (top-level await), not inside a later test.before() hook.
const FAKE_LICENSE_TIER = "growth";
const FAKE_LICENSE_MAX_STORES = 3;

const fakeLicenseServer = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, tier: FAKE_LICENSE_TIER, maxUsers: FAKE_LICENSE_MAX_STORES, token: "fake-token" }));
  });
});
await new Promise((resolve) => fakeLicenseServer.listen(0, "127.0.0.1", resolve));
process.env.OLI_LICENSE_SERVER_URL = `http://127.0.0.1:${fakeLicenseServer.address().port}`;

const { server } = await import("../server/index.js");
const { createOwner } = await import("../server/store.js");
const { hashPassword } = await import("../server/auth.js");

let baseUrl;

test.before(async () => {
  const { salt, hash } = hashPassword("test-owner-password-123456");
  await createOwner({ username: "merchant@multistore.example.com", salt, hash });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => fakeLicenseServer.close(resolve));
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
  const res = await request("POST", "/api/login", { body: { username: "merchant@multistore.example.com", password: "test-owner-password-123456" } });
  assert.equal(res.status, 200);
  ownerToken = res.body.token;
});

test("without any license activated, connecting a 2nd store is refused (unlicensed default is 1 store)", async () => {
  const first = await request("POST", "/api/stores", { token: ownerToken, body: { name: "Store One" } });
  assert.equal(first.status, 201);

  const second = await request("POST", "/api/stores", { token: ownerToken, body: { name: "Store Two" } });
  assert.equal(second.status, 403);
  assert.equal(second.body.maxStores, 1);
});

test("each created store gets its own distinct webhook secret", async () => {
  const stores = await request("GET", "/api/stores", { token: ownerToken });
  assert.equal(stores.body.stores.length, 1);
  assert.ok(stores.body.stores[0].webhookSecret);
  assert.ok(stores.body.stores[0].webhookSecret.length > 10);
});

test("activating a real license raises the real store cap to what that tier actually grants", async () => {
  const res = await request("POST", "/api/license/activate", { token: ownerToken, body: { licenseKey: "OLI-COM-FAKE-0000-X" } });
  assert.equal(res.status, 200);
  assert.equal(res.body.license.tier, FAKE_LICENSE_TIER);
  assert.equal(res.body.license.maxStores, FAKE_LICENSE_MAX_STORES);
});

test("after activating a Growth-tier license (3 stores), 2 more stores can now be connected", async () => {
  const second = await request("POST", "/api/stores", { token: ownerToken, body: { name: "Store Two" } });
  assert.equal(second.status, 201);
  const third = await request("POST", "/api/stores", { token: ownerToken, body: { name: "Store Three" } });
  assert.equal(third.status, 201);

  // 4th store must be refused -- Growth caps at 3.
  const fourth = await request("POST", "/api/stores", { token: ownerToken, body: { name: "Store Four" } });
  assert.equal(fourth.status, 403);
  assert.equal(fourth.body.maxStores, 3);
});

test("a webhook using Store One's secret tags the resulting cart with Store One's id", async () => {
  const stores = await request("GET", "/api/stores", { token: ownerToken });
  const storeOne = stores.body.stores.find((s) => s.name === "Store One");

  const res = await request("POST", "/api/webhooks/cart-abandoned", {
    headers: { "X-Webhook-Secret": storeOne.webhookSecret },
    body: { externalId: "checkout-store-one-1", customerEmail: "a@example.com", items: [{ title: "Widget", quantity: 1, priceCents: 1000 }] },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.cart.storeId, storeOne.id);
});

test("a webhook using a WRONG secret (once real stores exist) is rejected", async () => {
  const res = await request("POST", "/api/webhooks/cart-abandoned", {
    headers: { "X-Webhook-Secret": "not-a-real-secret" },
    body: { externalId: "checkout-bad-secret", customerEmail: "b@example.com" },
  });
  assert.equal(res.status, 401);
});

test("GET /api/carts?storeId=X only returns that store's carts", async () => {
  const stores = await request("GET", "/api/stores", { token: ownerToken });
  const storeOne = stores.body.stores.find((s) => s.name === "Store One");
  const storeTwo = stores.body.stores.find((s) => s.name === "Store Two");

  await request("POST", "/api/webhooks/cart-abandoned", {
    headers: { "X-Webhook-Secret": storeTwo.webhookSecret },
    body: { externalId: "checkout-store-two-1", customerEmail: "c@example.com", items: [{ title: "Gadget", quantity: 1, priceCents: 2000 }] },
  });

  const storeOneCarts = await request("GET", `/api/carts?storeId=${storeOne.id}`, { token: ownerToken });
  assert.ok(storeOneCarts.body.carts.every((c) => c.storeId === storeOne.id));
  assert.ok(storeOneCarts.body.carts.length >= 1);

  const storeTwoCarts = await request("GET", `/api/carts?storeId=${storeTwo.id}`, { token: ownerToken });
  assert.ok(storeTwoCarts.body.carts.every((c) => c.storeId === storeTwo.id));
  assert.ok(storeTwoCarts.body.carts.length >= 1);
});
