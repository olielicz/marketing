import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";

// Point the store at a fresh temp directory for every test file run, so
// tests never touch real license data and are safe to run repeatedly.
const tmpDir = mkdtempSync(path.join(os.tmpdir(), "oli-license-test-"));
process.env.OLI_LICENSE_DATA_DIR = tmpDir;

const { createLicense, activateDevice, deactivateDevice, getLicense, revokeLicense } = await import("../server/store.js");

test("createLicense then activateDevice registers a new device", async () => {
  const lic = await createLicense({ key: "OLI-OPS-TEST-0001-A", product: "OPS", maxDevices: 5 });
  assert.equal(lic.maxDevices, 5);

  const result = await activateDevice({ key: lic.key, deviceId: "device-1" });
  assert.equal(result.ok, true);
  assert.equal(Object.keys(result.license.devices).length, 1);
});

test("activateDevice enforces the device limit", async () => {
  const lic = await createLicense({ key: "OLI-OPS-TEST-0002-B", product: "OPS", maxDevices: 2 });

  const first = await activateDevice({ key: lic.key, deviceId: "device-a" });
  assert.equal(first.ok, true);

  const second = await activateDevice({ key: lic.key, deviceId: "device-b" });
  assert.equal(second.ok, true);
  assert.equal(Object.keys(second.license.devices).length, 2);

  // A 3rd DISTINCT device should be refused once the cap (2) is reached.
  const third = await activateDevice({ key: lic.key, deviceId: "device-c" });
  assert.equal(third.ok, false);
  assert.equal(third.reason, "device_limit_reached");
});

test("re-activating an already-registered device is always allowed, even at the cap", async () => {
  const lic = await createLicense({ key: "OLI-OPS-TEST-0003-C", product: "OPS", maxDevices: 1 });
  await activateDevice({ key: lic.key, deviceId: "device-x" });

  // Same device re-activating (e.g. app restarted) should succeed, not count
  // as a "new" device against the cap.
  const again = await activateDevice({ key: lic.key, deviceId: "device-x" });
  assert.equal(again.ok, true);
  assert.equal(Object.keys(again.license.devices).length, 1);
});

test("deactivateDevice frees a slot for a new device", async () => {
  const lic = await createLicense({ key: "OLI-OPS-TEST-0004-D", product: "OPS", maxDevices: 1 });
  await activateDevice({ key: lic.key, deviceId: "device-old" });

  const blocked = await activateDevice({ key: lic.key, deviceId: "device-new" });
  assert.equal(blocked.ok, false);

  await deactivateDevice({ key: lic.key, deviceId: "device-old" });

  const nowAllowed = await activateDevice({ key: lic.key, deviceId: "device-new" });
  assert.equal(nowAllowed.ok, true);
});

test("activateDevice refuses a revoked license", async () => {
  const lic = await createLicense({ key: "OLI-OPS-TEST-0005-E", product: "OPS", maxDevices: 5 });
  await revokeLicense(lic.key);
  const result = await activateDevice({ key: lic.key, deviceId: "device-1" });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "revoked");
});

test("activateDevice returns not_found for an unknown key", async () => {
  const result = await activateDevice({ key: "OLI-OPS-NOPE-0000-Z", deviceId: "device-1" });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "not_found");
});

test.after(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});
