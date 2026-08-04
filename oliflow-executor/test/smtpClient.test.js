import { test } from "node:test";
import assert from "node:assert/strict";
import { sendMail } from "../server/smtpClient.js";
import { startFakeSmtpServer } from "./fakeSmtpServer.js";

test("sends a plain-text email with no auth, over STARTTLS, and the fake server receives it correctly", async () => {
  const fake = await startFakeSmtpServer();
  try {
    // rejectUnauthorized:false is used throughout this test file ONLY
    // because the fake test server uses a from-scratch self-signed cert
    // (see selfSignedCert.js) with no real CA behind it. Production use
    // should leave this at its safe default (true) unless intentionally
    // connecting to a self-hosted server with a self-signed cert.
    const result = await sendMail({
      host: "127.0.0.1",
      port: fake.port,
      rejectUnauthorized: false,
      from: "sender@example.com",
      to: "recipient@example.com",
      subject: "Test Subject",
      text: "Hello, this is a real test email body.",
    });
    assert.deepEqual(result, { ok: true });
    assert.equal(fake.receivedMail.length, 1);
    assert.equal(fake.receivedMail[0].from, "sender@example.com");
    assert.deepEqual(fake.receivedMail[0].to, ["recipient@example.com"]);
    assert.match(fake.receivedMail[0].data, /Subject: Test Subject/);
    assert.match(fake.receivedMail[0].data, /Hello, this is a real test email body\./);
  } finally {
    await fake.close();
  }
});

test("sends an HTML email correctly", async () => {
  const fake = await startFakeSmtpServer();
  try {
    const result = await sendMail({
      host: "127.0.0.1",
      port: fake.port,
      rejectUnauthorized: false,
      from: "a@example.com",
      to: "b@example.com",
      subject: "HTML test",
      html: "<h1>Hello</h1><p>World</p>",
    });
    assert.equal(result.ok, true);
    assert.match(fake.receivedMail[0].data, /Content-Type: text\/html/);
    assert.match(fake.receivedMail[0].data, /<h1>Hello<\/h1>/);
  } finally {
    await fake.close();
  }
});

test("authenticates via AUTH LOGIN with correct credentials", async () => {
  const fake = await startFakeSmtpServer({ requireAuth: { user: "realuser", pass: "realpass" } });
  try {
    const result = await sendMail({
      host: "127.0.0.1",
      port: fake.port,
      rejectUnauthorized: false,
      user: "realuser",
      pass: "realpass",
      from: "a@example.com",
      to: "b@example.com",
      subject: "Auth test",
      text: "body",
    });
    assert.equal(result.ok, true);
    assert.equal(fake.receivedMail.length, 1);
  } finally {
    await fake.close();
  }
});

test("reports a clear error when authentication fails", async () => {
  const fake = await startFakeSmtpServer({ requireAuth: { user: "realuser", pass: "realpass" } });
  try {
    const result = await sendMail({
      host: "127.0.0.1",
      port: fake.port,
      rejectUnauthorized: false,
      user: "realuser",
      pass: "wrong-password",
      from: "a@example.com",
      to: "b@example.com",
      subject: "Should fail",
      text: "body",
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /unexpected response/);
    assert.equal(fake.receivedMail.length, 0);
  } finally {
    await fake.close();
  }
});

test("refuses to send without STARTTLS if the server doesn't advertise it and 'secure' wasn't requested", async () => {
  const fake = await startFakeSmtpServer({ advertiseStartTls: false });
  try {
    const result = await sendMail({
      host: "127.0.0.1",
      port: fake.port,
      from: "a@example.com",
      to: "b@example.com",
      subject: "Should refuse",
      text: "body",
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /STARTTLS/);
  } finally {
    await fake.close();
  }
});

test("correctly dot-stuffs a body line that starts with a literal period", async () => {
  const fake = await startFakeSmtpServer();
  try {
    const result = await sendMail({
      host: "127.0.0.1",
      port: fake.port,
      rejectUnauthorized: false,
      from: "a@example.com",
      to: "b@example.com",
      subject: "Dot test",
      text: ".this line starts with a period\nnormal line",
    });
    assert.equal(result.ok, true);
    // The fake server undoes dot-stuffing on receipt, so the ORIGINAL
    // leading-dot line should survive the round trip intact.
    assert.match(fake.receivedMail[0].data, /^\.this line starts with a period$/m);
  } finally {
    await fake.close();
  }
});

test("reports a connection error clearly when the host is unreachable", async () => {
  const result = await sendMail({
    host: "127.0.0.1",
    port: 1, // nothing listens on port 1
    from: "a@example.com",
    to: "b@example.com",
    subject: "x",
    text: "x",
  });
  assert.equal(result.ok, false);
  assert.ok(result.error.length > 0);
});
