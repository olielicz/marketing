import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const tmpDir = mkdtempSync(path.join(os.tmpdir(), "oli-license-users-test-"));
process.env.OLI_LICENSE_DATA_DIR = tmpDir;

const { createLicense, addUser, removeUser } = await import("../server/store.js");

test("createLicense with a real tier sets real, correct maxUsers (not a placeholder)", async () => {
  const lic = await createLicense({ key: "OLI-OPS-USRT-0001-A", product: "OPS", tier: "pro" });
  assert.equal(lic.tier, "pro");
  assert.equal(lic.maxUsers, 5);
  assert.equal(lic.maxDevices, 5);
});

test("addUser registers a new seat and enforces maxUsers from the real tier", async () => {
  // solo tier => maxUsers 1 (see tierLimits.js)
  const lic = await createLicense({ key: "OLI-FLW-USRT-0002-B", product: "FLW", tier: "solo" });
  assert.equal(lic.maxUsers, 1);

  const first = await addUser({ key: lic.key, userId: "user-1", email: "owner@example.com", role: "owner" });
  assert.equal(first.ok, true);
  assert.equal(Object.keys(first.license.users).length, 1);

  // Solo only allows 1 seat -- a 2nd DISTINCT user must be refused.
  const second = await addUser({ key: lic.key, userId: "user-2", email: "teammate@example.com" });
  assert.equal(second.ok, false);
  assert.equal(second.reason, "user_limit_reached");
});

test("addUser allows up to maxUsers seats for a higher tier", async () => {
  // business tier => maxUsers 25
  const lic = await createLicense({ key: "OLI-FLW-USRT-0003-C", product: "FLW", tier: "business" });
  assert.equal(lic.maxUsers, 25);

  for (let i = 0; i < 25; i++) {
    const result = await addUser({ key: lic.key, userId: `user-${i}` });
    assert.equal(result.ok, true, `seat ${i} should be allowed under a 25-seat Business license`);
  }
  const overCap = await addUser({ key: lic.key, userId: "user-26" });
  assert.equal(overCap.ok, false);
  assert.equal(overCap.reason, "user_limit_reached");
});

test("re-adding an already-registered userId is always allowed, even at the cap", async () => {
  const lic = await createLicense({ key: "OLI-OPS-USRT-0004-D", product: "OPS", tier: "starter" });
  assert.equal(lic.maxUsers, 1);
  await addUser({ key: lic.key, userId: "owner" });

  const again = await addUser({ key: lic.key, userId: "owner", role: "owner" });
  assert.equal(again.ok, true);
  assert.equal(Object.keys(again.license.users).length, 1);
});

test("removeUser frees a seat for a new user", async () => {
  const lic = await createLicense({ key: "OLI-OPS-USRT-0005-E", product: "OPS", tier: "starter" });
  await addUser({ key: lic.key, userId: "old-user" });

  const blocked = await addUser({ key: lic.key, userId: "new-user" });
  assert.equal(blocked.ok, false);

  await removeUser({ key: lic.key, userId: "old-user" });

  const nowAllowed = await addUser({ key: lic.key, userId: "new-user" });
  assert.equal(nowAllowed.ok, true);
});

test("addUser refuses a revoked license", async () => {
  const { revokeLicense } = await import("../server/store.js");
  const lic = await createLicense({ key: "OLI-OPS-USRT-0006-F", product: "OPS", tier: "starter" });
  await revokeLicense(lic.key);
  const result = await addUser({ key: lic.key, userId: "someone" });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "revoked");
});

test("addUser returns not_found for an unknown key", async () => {
  const result = await addUser({ key: "OLI-OPS-NOPE-0000-Z", userId: "someone" });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "not_found");
});

test.after(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});
