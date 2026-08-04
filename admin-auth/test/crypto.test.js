import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = mkdtempSync(path.join(os.tmpdir(), "oli-admin-crypto-test-"));
process.env.OLI_ADMIN_DATA_DIR = tmpDir;

const { hashPassword, verifyPassword, signSessionToken, verifySessionTokenSignature, getPublicKeyPem } = await import("../server/crypto.js");

test("hashPassword produces a different salt each time, verifyPassword accepts the correct password", () => {
  const a = hashPassword("correct-password-123");
  const b = hashPassword("correct-password-123");
  assert.notEqual(a.salt, b.salt, "salts should be random per call");
  assert.notEqual(a.hash, b.hash, "hashes should differ because salts differ");
  assert.ok(verifyPassword("correct-password-123", a.salt, a.hash));
});

test("verifyPassword rejects an incorrect password", () => {
  const { salt, hash } = hashPassword("correct-password-123");
  assert.equal(verifyPassword("wrong-password", salt, hash), false);
});

test("verifyPassword rejects a correct password checked against the wrong hash", () => {
  const a = hashPassword("password-a");
  const b = hashPassword("password-b");
  assert.equal(verifyPassword("password-a", b.salt, b.hash), false);
});

test("signSessionToken + verifySessionTokenSignature round-trip", () => {
  const token = signSessionToken({ sessionId: "abc123", username: "owner@example.com" });
  const payload = verifySessionTokenSignature(token);
  assert.deepEqual(payload, { sessionId: "abc123", username: "owner@example.com" });
});

test("verifySessionTokenSignature rejects a tampered token", () => {
  const token = signSessionToken({ sessionId: "abc123", username: "owner@example.com" });
  const [payloadB64, sig] = token.split(".");
  const forgedPayload = Buffer.from(JSON.stringify({ sessionId: "abc123", username: "attacker@example.com" }), "utf8").toString("base64url");
  const tampered = `${forgedPayload}.${sig}`;
  assert.equal(verifySessionTokenSignature(tampered), null);
});

test("verifySessionTokenSignature rejects garbage input", () => {
  assert.equal(verifySessionTokenSignature("not-a-real-token"), null);
  assert.equal(verifySessionTokenSignature(""), null);
  assert.equal(verifySessionTokenSignature(undefined), null);
});

test("getPublicKeyPem returns a usable PEM", () => {
  const pem = getPublicKeyPem();
  assert.match(pem, /BEGIN PUBLIC KEY/);
});

test.after(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});
