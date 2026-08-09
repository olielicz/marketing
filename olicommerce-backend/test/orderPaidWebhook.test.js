import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { startFakeSmtpServer } from "./fakeSmtpServer.js";

// OLICOMMERCE_SUPPLIER_EMAIL and SMTP_* are read once at module-load
// time in server/index.js, so — same reasoning as webhookSecret.test.js
// — this needs its own isolated process where they're set BEFORE the
// server module is ever imported, rather than sharing server.test.js's
// already-imported instance.
const tmpDir = mkdtempSync(path.join(os.tmpdir(), "olicommerce-order-paid-test-"));
process.env.OLICOMMERCE_DATA_DIR = tmpDir;
process.env.PORT = "0";

// server/index.js reads OLICOMMERCE_SUPPLIER_EMAIL/SMTP_* into
// module-level consts at import time, so the fake SMTP server must be
// started AND every env var set BEFORE the dynamic import below runs.
const fakeSmtp = await startFakeSmtpServer();
process.env.OLICOMMERCE_SUPPLIER_EMAIL = "supplier@example.com";
process.env.SMTP_HOST = "127.0.0.1";
process.env.SMTP_PORT = String(fakeSmtp.port);
process.env.SMTP_REJECT_UNAUTHORIZED = "false";
process.env.SMTP_FROM = "noreply@shop.example.com";

const { server } = await import("../server/index.js");

let baseUrl;
test.before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fakeSmtp.close();
  delete process.env.OLICOMMERCE_SUPPLIER_EMAIL;
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.SMTP_REJECT_UNAUTHORIZED;
  delete process.env.SMTP_FROM;
  rmSync(tmpDir, { recursive: true, force: true });
});

function post(urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(`${baseUrl}${urlPath}`, { method: "POST", headers: { "Content-Type": "application/json" } }, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => { let json; try { json = JSON.parse(raw); } catch { json = raw; } resolve({ status: res.statusCode, body: json }); });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

test("order-paid webhook rejects an order with no line items", async () => {
  const res = await post("/api/webhooks/order-paid", { name: "#9002", line_items: [] });
  assert.equal(res.status, 400);
});

test("order-paid webhook genuinely forwards a real CSV attachment to the supplier via SMTP", async () => {
  const mailCountBefore = fakeSmtp.receivedMail.length;

  const res = await post("/api/webhooks/order-paid", {
    name: "#9003",
    line_items: [
      { sku: "SKU-A", title: "Green Mug", quantity: 2, price: "12.00" },
      { sku: "SKU-B", title: "Yellow Plate", quantity: 1, price: "8.00" },
    ],
    shipping_address: { name: "Test Customer", address1: "1 Test Way", city: "Testopolis", country: "US" },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.forwardedTo, "supplier@example.com");
  assert.equal(res.body.lineItemCount, 2);

  assert.equal(fakeSmtp.receivedMail.length, mailCountBefore + 1);
  const mail = fakeSmtp.receivedMail[fakeSmtp.receivedMail.length - 1];
  assert.deepEqual(mail.to, ["supplier@example.com"]);
  // A real multipart MIME message with a base64-encoded CSV attachment
  // must contain the attachment's filename and the multipart marker —
  // confirms this genuinely built a multipart email, not just plain text.
  assert.match(mail.data, /multipart\/mixed/);
  assert.match(mail.data, /filename="_9003\.csv"/);
  assert.match(mail.data, /Content-Transfer-Encoding: base64/i);
});
