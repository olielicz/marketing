import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";

// OLICOMMERCE_WEBHOOK_SECRET is read once at module load time in
// server/index.js, so it must be set BEFORE that module is imported -
// this needs its own isolated test file/process rather than sharing
// server.test.js's already-imported instance (which was imported before
// this secret was ever set).
const tmpDir = mkdtempSync(path.join(os.tmpdir(), "olicommerce-webhook-secret-test-"));
process.env.OLICOMMERCE_DATA_DIR = tmpDir;
process.env.OLICOMMERCE_WEBHOOK_SECRET = "test-secret-abc";
process.env.PORT = "0";

const { server } = await import("../server/index.js");

let baseUrl;
test.before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  delete process.env.OLICOMMERCE_WEBHOOK_SECRET;
  rmSync(tmpDir, { recursive: true, force: true });
});

function post(urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(`${baseUrl}${urlPath}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers } }, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => { let json; try { json = JSON.parse(raw); } catch { json = raw; } resolve({ status: res.statusCode, body: json }); });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

test("webhook is rejected when the shared secret is missing", async () => {
  const res = await post("/api/webhooks/cart-abandoned", { externalId: "cart-1" });
  assert.equal(res.status, 401);
  assert.equal(res.body.error, "invalid_secret");
});

test("webhook is rejected when the shared secret is wrong", async () => {
  const res = await post("/api/webhooks/cart-abandoned", { externalId: "cart-1" }, { "X-Webhook-Secret": "wrong-secret" });
  assert.equal(res.status, 401);
});

test("webhook succeeds when the correct shared secret is provided via header", async () => {
  const res = await post("/api/webhooks/cart-abandoned", { externalId: "cart-1", customerEmail: "a@example.com" }, { "X-Webhook-Secret": "test-secret-abc" });
  assert.equal(res.status, 201);
});

test("webhook succeeds when the correct shared secret is provided via query param", async () => {
  const data = JSON.stringify({ externalId: "cart-2", customerEmail: "b@example.com" });
  const result = await new Promise((resolve, reject) => {
    const req = http.request(`${baseUrl}/api/webhooks/cart-abandoned?secret=test-secret-abc`, { method: "POST", headers: { "Content-Type": "application/json" } }, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => { let json; try { json = JSON.parse(raw); } catch { json = raw; } resolve({ status: res.statusCode, body: json }); });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
  assert.equal(result.status, 201);
});
