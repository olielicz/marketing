import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";

const tmpDir = mkdtempSync(path.join(os.tmpdir(), "oliflow-executor-test-"));
process.env.OLIFLOW_EXECUTOR_DATA_DIR = tmpDir;
process.env.PORT = "0";
process.env.ADMIN_TOKEN = "test-admin-token-for-support-tests";
delete process.env.OLI_ADMIN_AUTH_URL; // force the break-glass ADMIN_TOKEN path for this test file

const { server } = await import("../server/index.js");

let baseUrl;
test.before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(tmpDir, { recursive: true, force: true });
});

function request(method, urlPath, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const req = http.request(`${baseUrl}${urlPath}`, { method, headers }, (res) => {
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

const ADMIN_TOKEN = "test-admin-token-for-support-tests";

test("AI support chat is public and answers confidently from the knowledge base with zero configuration", async () => {
  const res = await request("POST", "/api/support/chat", { body: { message: "why is my workflow not triggering" } });
  assert.equal(res.status, 200);
  assert.equal(res.body.source, "knowledge_base");
  assert.equal(res.body.confident, true);
  assert.equal(res.body.ticketId, null);
});

test("AI support chat escalates an unanswerable question to a real, persisted support ticket", async () => {
  const res = await request("POST", "/api/support/chat", { body: { message: "can oliflow write me a poem about the ocean", contactEmail: "user@example.com" } });
  assert.equal(res.status, 200);
  assert.equal(res.body.shouldEscalate, true);
  assert.ok(res.body.ticketId);

  const tickets = await request("GET", "/api/support/tickets", { token: ADMIN_TOKEN });
  assert.equal(tickets.status, 200);
  const found = tickets.body.tickets.find((t) => t.id === res.body.ticketId);
  assert.ok(found);
  assert.equal(found.contactEmail, "user@example.com");
});

test("public ticket creation works without any auth", async () => {
  const res = await request("POST", "/api/support/tickets", { body: { subject: "Manually filed ticket" } });
  assert.equal(res.status, 201);
  assert.ok(res.body.ticket.id);
});

test("ticket management (list/close/reopen/delete) requires a real admin token", async () => {
  const noAuth = await request("GET", "/api/support/tickets");
  assert.equal(noAuth.status, 401);

  const listed = await request("GET", "/api/support/tickets", { token: ADMIN_TOKEN });
  assert.equal(listed.status, 200);
  const id = listed.body.tickets[0].id;

  const closed = await request("POST", `/api/support/tickets/${id}/close`, { token: ADMIN_TOKEN });
  assert.equal(closed.status, 200);
  assert.equal(closed.body.ticket.status, "closed");

  const reopened = await request("POST", `/api/support/tickets/${id}/reopen`, { token: ADMIN_TOKEN });
  assert.equal(reopened.body.ticket.status, "open");

  const deleted = await request("DELETE", `/api/support/tickets/${id}`, { token: ADMIN_TOKEN });
  assert.equal(deleted.status, 200);
});

test("health check still works alongside the new support endpoints", async () => {
  const res = await request("GET", "/api/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});
