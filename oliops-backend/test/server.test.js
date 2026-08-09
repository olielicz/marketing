import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";

const tmpDir = mkdtempSync(path.join(os.tmpdir(), "oliops-backend-test-"));
process.env.OLIOPS_DATA_DIR = tmpDir;
process.env.PORT = "0"; // let the OS pick a free port

const { server } = await import("../server/index.js");
const { createOwner } = await import("../server/store.js");
const { hashPassword } = await import("../server/auth.js");

let baseUrl;
test.before(async () => {
  const { salt, hash } = hashPassword("test-owner-password-123456");
  await createOwner({ username: "owner@example.com", salt, hash });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(tmpDir, { recursive: true, force: true });
});

function request(method, path, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const req = http.request(`${baseUrl}${path}`, { method, headers }, (res) => {
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

test("health check reports owner configured", async () => {
  const res = await request("GET", "/api/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.ownerConfigured, true);
});

test("login fails with wrong password", async () => {
  const res = await request("POST", "/api/login", { body: { username: "owner@example.com", password: "wrong" } });
  assert.equal(res.status, 401);
});

test("login succeeds with correct credentials and issues a token", async () => {
  const res = await request("POST", "/api/login", { body: { username: "owner@example.com", password: "test-owner-password-123456" } });
  assert.equal(res.status, 200);
  assert.ok(res.body.token);
  ownerToken = res.body.token;
});

test("protected routes reject requests with no token", async () => {
  const res = await request("GET", "/api/contacts");
  assert.equal(res.status, 401);
});

test("full contact lifecycle: create, list, update, delete", async () => {
  const created = await request("POST", "/api/contacts", { token: ownerToken, body: { name: "Jane Doe", email: "jane@example.com", company: "Acme" } });
  assert.equal(created.status, 201);
  assert.equal(created.body.contact.name, "Jane Doe");
  const id = created.body.contact.id;

  const listed = await request("GET", "/api/contacts", { token: ownerToken });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.contacts.length, 1);

  const updated = await request("PUT", `/api/contacts/${id}`, { token: ownerToken, body: { company: "Acme Corp" } });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.contact.company, "Acme Corp");
  assert.equal(updated.body.contact.name, "Jane Doe"); // unspecified fields preserved

  const deleted = await request("DELETE", `/api/contacts/${id}`, { token: ownerToken });
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.ok, true);

  const listedAfter = await request("GET", "/api/contacts", { token: ownerToken });
  assert.equal(listedAfter.body.contacts.length, 0);
});

test("creating a contact without a name is rejected", async () => {
  const res = await request("POST", "/api/contacts", { token: ownerToken, body: { email: "x@example.com" } });
  assert.equal(res.status, 400);
});

test("full task lifecycle: create, list, update status, delete", async () => {
  const created = await request("POST", "/api/tasks", { token: ownerToken, body: { title: "Follow up with Jane", dueDate: "2026-09-01" } });
  assert.equal(created.status, 201);
  const id = created.body.task.id;
  assert.equal(created.body.task.status, "open");

  const updated = await request("PUT", `/api/tasks/${id}`, { token: ownerToken, body: { status: "done" } });
  assert.equal(updated.body.task.status, "done");

  const deleted = await request("DELETE", `/api/tasks/${id}`, { token: ownerToken });
  assert.equal(deleted.status, 200);
});

test("invoice lifecycle: create with real line-item math, list, mark paid, render HTML", async () => {
  const created = await request("POST", "/api/invoices", {
    token: ownerToken,
    body: {
      contactName: "Acme Corp",
      items: [
        { description: "Consulting", quantity: 3, unitPriceCents: 15000 },
        { description: "Setup fee", quantity: 1, unitPriceCents: 5000 },
      ],
      dueDate: "2026-09-15",
    },
  });
  assert.equal(created.status, 201);
  const invoice = created.body.invoice;
  assert.equal(invoice.totalCents, 3 * 15000 + 5000); // 50000 = $500.00
  assert.match(invoice.invoiceNumber, /^INV-\d{5}$/);
  assert.equal(invoice.status, "unpaid");

  const listed = await request("GET", "/api/invoices", { token: ownerToken });
  assert.equal(listed.body.invoices.length, 1);

  const paid = await request("POST", `/api/invoices/${invoice.id}/mark-paid`, { token: ownerToken });
  assert.equal(paid.status, 200);
  assert.equal(paid.body.invoice.status, "paid");
  assert.ok(paid.body.invoice.paidAt);

  const html = await request("GET", `/api/invoices/${invoice.id}/html`, { token: ownerToken });
  assert.equal(html.status, 200);
  assert.match(html.body, /INV-\d{5}/);
  // FIX: this now genuinely uses the real currency from tax settings
  // (see store.js's TAX_SETTINGS_DEFAULTS) instead of a hardcoded "$" -
  // the default is USD out of the box, but every other real currency
  // (GBP/EUR/AUD/PHP/etc.) is fully supported too - see
  // payroll.test.js's dedicated multi-currency tests for that coverage.
  assert.match(html.body, /\$500\.00/);
  assert.match(html.body, /PAID/);
});

test("creating an invoice with no line items is rejected", async () => {
  const res = await request("POST", "/api/invoices", { token: ownerToken, body: { contactName: "X", items: [] } });
  assert.equal(res.status, 400);
});

test("invoice numbers are sequential and never reused, even after deletion", async () => {
  const inv1 = await request("POST", "/api/invoices", { token: ownerToken, body: { items: [{ description: "A", quantity: 1, unitPriceCents: 100 }] } });
  const num1 = inv1.body.invoice.invoiceNumber;
  await request("DELETE", `/api/invoices/${inv1.body.invoice.id}`, { token: ownerToken });
  const inv2 = await request("POST", "/api/invoices", { token: ownerToken, body: { items: [{ description: "B", quantity: 1, unitPriceCents: 100 }] } });
  const num2 = inv2.body.invoice.invoiceNumber;
  assert.notEqual(num1, num2);
  const seq1 = parseInt(num1.split("-")[1], 10);
  const seq2 = parseInt(num2.split("-")[1], 10);
  assert.ok(seq2 > seq1);
});

test("change-password revokes all sessions and requires the new password to log in again", async () => {
  const loginRes = await request("POST", "/api/login", { body: { username: "owner@example.com", password: "test-owner-password-123456" } });
  const freshToken = loginRes.body.token;

  const changeRes = await request("POST", "/api/change-password", {
    token: freshToken,
    body: { currentPassword: "test-owner-password-123456", newPassword: "a-new-strong-password-999" },
  });
  assert.equal(changeRes.status, 200);
  assert.ok(changeRes.body.sessionsRevoked >= 1);

  const oldTokenStillWorks = await request("GET", "/api/contacts", { token: freshToken });
  assert.equal(oldTokenStillWorks.status, 401);

  const oldPasswordLogin = await request("POST", "/api/login", { body: { username: "owner@example.com", password: "test-owner-password-123456" } });
  assert.equal(oldPasswordLogin.status, 401);

  const newPasswordLogin = await request("POST", "/api/login", { body: { username: "owner@example.com", password: "a-new-strong-password-999" } });
  assert.equal(newPasswordLogin.status, 200);
  ownerToken = newPasswordLogin.body.token; // subsequent tests (if any ran after) would need this
});

test("logout revokes the session", async () => {
  const loginRes = await request("POST", "/api/login", { body: { username: "owner@example.com", password: "a-new-strong-password-999" } });
  const token = loginRes.body.token;
  const logoutRes = await request("POST", "/api/logout", { token });
  assert.equal(logoutRes.status, 200);
  const afterLogout = await request("GET", "/api/contacts", { token });
  assert.equal(afterLogout.status, 401);
});


test("AI support chat answers confidently from the knowledge base with zero configuration", async () => {
  const res = await request("POST", "/api/support/chat", { body: { message: "I forgot my password and can't log in" } });
  assert.equal(res.status, 200);
  assert.equal(res.body.source, "knowledge_base");
  assert.equal(res.body.confident, true);
  assert.equal(res.body.ticketId, null);
});

test("AI support chat escalates an unanswerable question to a real support ticket", async () => {
  const res = await request("POST", "/api/support/chat", { body: { message: "does oliops predict lottery numbers", contactEmail: "user@example.com" } });
  assert.equal(res.status, 200);
  assert.equal(res.body.shouldEscalate, true);
  assert.ok(res.body.ticketId);

  const tickets = await request("GET", "/api/support/tickets", { token: ownerToken });
  assert.equal(tickets.status, 200);
  const found = tickets.body.tickets.find((t) => t.id === res.body.ticketId);
  assert.ok(found);
  assert.equal(found.contactEmail, "user@example.com");
  assert.equal(found.status, "open");
});

test("support ticket lifecycle: manual create, close, reopen, delete", async () => {
  const created = await request("POST", "/api/support/tickets", { body: { subject: "Manual test ticket", contactEmail: "manual@example.com" } });
  assert.equal(created.status, 201);
  const id = created.body.ticket.id;

  const closed = await request("POST", `/api/support/tickets/${id}/close`, { token: ownerToken });
  assert.equal(closed.status, 200);
  assert.equal(closed.body.ticket.status, "closed");

  const reopened = await request("POST", `/api/support/tickets/${id}/reopen`, { token: ownerToken });
  assert.equal(reopened.body.ticket.status, "open");

  const deleted = await request("DELETE", `/api/support/tickets/${id}`, { token: ownerToken });
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.ok, true);
});

test("support ticket endpoints require owner auth to view/manage (but not to create)", async () => {
  const res = await request("GET", "/api/support/tickets");
  assert.equal(res.status, 401);
});
