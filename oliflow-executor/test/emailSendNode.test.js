import { test } from "node:test";
import assert from "node:assert/strict";
import { runEmailSendNode } from "../server/handlers/emailSendNode.js";
import { buildBaseContext } from "../server/templateEngine.js";
import { startFakeSmtpServer } from "./fakeSmtpServer.js";

test("sends a real email using SMTP creds from workflow variables, with templates resolved", async () => {
  const fake = await startFakeSmtpServer();
  try {
    const ctx = buildBaseContext({
      trigger: { body: { name: "Jane" } },
      // smtp_reject_unauthorized=false is the documented escape hatch for
      // a self-hosted/self-signed SMTP server - used here only because
      // the fake test server has no real CA behind its cert.
      vars: { smtp_host: "127.0.0.1", smtp_port: String(fake.port), smtp_reject_unauthorized: "false" },
    });
    const result = await runEmailSendNode(
      { from: "noreply@example.com", to: "jane@example.com", subject: "Hi {{trigger.body.name}}", body: "Hello {{trigger.body.name}}, welcome!" },
      ctx
    );
    assert.deepEqual(result, { ok: true });
    assert.equal(fake.receivedMail.length, 1);
    assert.equal(fake.receivedMail[0].from, "noreply@example.com");
    assert.match(fake.receivedMail[0].data, /Subject: Hi Jane/);
    assert.match(fake.receivedMail[0].data, /Hello Jane, welcome!/);
    assert.match(fake.receivedMail[0].data, /Content-Type: text\/plain/);
  } finally {
    await fake.close();
  }
});

test("reports a clear error when no SMTP host variable is configured", async () => {
  const ctx = buildBaseContext({ vars: {} });
  const result = await runEmailSendNode({ from: "a@example.com", to: "b@example.com", subject: "x", body: "y" }, ctx);
  assert.equal(result.ok, false);
  assert.match(result.error, /No SMTP host configured/);
});

test("detects an HTML body (containing tags) and sends it as text/html", async () => {
  const fake = await startFakeSmtpServer();
  try {
    const ctx = buildBaseContext({ vars: { smtp_host: "127.0.0.1", smtp_port: String(fake.port), smtp_reject_unauthorized: "false" } });
    const result = await runEmailSendNode(
      { from: "a@example.com", to: "b@example.com", subject: "HTML", body: "<p>Hello <b>World</b></p>" },
      ctx
    );
    assert.equal(result.ok, true);
    assert.match(fake.receivedMail[0].data, /Content-Type: text\/html/);
    assert.match(fake.receivedMail[0].data, /<p>Hello <b>World<\/b><\/p>/);
  } finally {
    await fake.close();
  }
});

test("real SMTP providers with valid certs are still verified by default (rejectUnauthorized defaults true)", async () => {
  const fake = await startFakeSmtpServer(); // self-signed, no reject_unauthorized override this time
  try {
    const ctx = buildBaseContext({ vars: { smtp_host: "127.0.0.1", smtp_port: String(fake.port) } });
    const result = await runEmailSendNode({ from: "a@example.com", to: "b@example.com", subject: "x", body: "y" }, ctx);
    assert.equal(result.ok, false);
    assert.match(result.error, /certificate|verify/i);
  } finally {
    await fake.close();
  }
});
