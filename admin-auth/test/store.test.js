import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = mkdtempSync(path.join(os.tmpdir(), "oli-admin-store-test-"));
process.env.OLI_ADMIN_DATA_DIR = tmpDir;

const store = await import("../server/store.js");

test("getOwner returns null before any account is created", async () => {
  assert.equal(await store.getOwner(), null);
});

test("createOwner creates the account, and refuses a second creation", async () => {
  const owner = await store.createOwner({ username: "owner@example.com", salt: "s", hash: "h" });
  assert.equal(owner.username, "owner@example.com");
  assert.equal(await (await store.getOwner()).username, "owner@example.com");

  await assert.rejects(
    () => store.createOwner({ username: "someone-else@example.com", salt: "s2", hash: "h2" }),
    /already exists/
  );
});

test("updateOwnerPassword changes the stored hash", async () => {
  await store.updateOwnerPassword({ salt: "new-salt", hash: "new-hash" });
  const owner = await store.getOwner();
  assert.equal(owner.salt, "new-salt");
  assert.equal(owner.hash, "new-hash");
});

test("session lifecycle: create -> active -> revoke -> inactive", async () => {
  const sessionId = "session-1";
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  await store.createSession({ sessionId, expiresAt, ip: "127.0.0.1", userAgent: "test" });
  assert.equal(await store.isSessionActive(sessionId), true);

  await store.revokeSession(sessionId);
  assert.equal(await store.isSessionActive(sessionId), false);
});

test("expired sessions are inactive even if never explicitly revoked", async () => {
  const sessionId = "session-expired";
  const expiresAt = new Date(Date.now() - 1000).toISOString(); // already in the past
  await store.createSession({ sessionId, expiresAt, ip: "127.0.0.1", userAgent: "test" });
  assert.equal(await store.isSessionActive(sessionId), false);
});

test("revokeAllSessions revokes every currently-active session", async () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  await store.createSession({ sessionId: "s-a", expiresAt: future });
  await store.createSession({ sessionId: "s-b", expiresAt: future });
  const count = await store.revokeAllSessions();
  assert.ok(count >= 2);
  assert.equal(await store.isSessionActive("s-a"), false);
  assert.equal(await store.isSessionActive("s-b"), false);
});

test("failed-attempt lockout counting respects the time window", async () => {
  const key = "login:1.2.3.4";
  await store.recordFailedAttempt(key);
  await store.recordFailedAttempt(key);
  await store.recordFailedAttempt(key);
  const countWithinWindow = await store.countRecentFailedAttempts(key, 60_000);
  assert.equal(countWithinWindow, 3);

  const countWithZeroWindow = await store.countRecentFailedAttempts(key, 0);
  assert.equal(countWithZeroWindow, 0, "a zero-width window should not count attempts made just now, since Date.now() - 0 = now (strictly greater-than comparison)");

  await store.clearFailedAttempts(key);
  assert.equal(await store.countRecentFailedAttempts(key, 60_000), 0);
});

test.after(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});
