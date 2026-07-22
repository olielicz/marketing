import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = mkdtempSync(path.join(os.tmpdir(), "oli-license-keys-test-"));

test("generate-keys.js produces a usable Ed25519 keypair", () => {
  execFileSync(process.execPath, [path.join(__dirname, "..", "scripts", "generate-keys.js")], {
    env: { ...process.env, OLI_LICENSE_DATA_DIR: tmpDir },
  });
  assert.equal(existsSync(path.join(tmpDir, "keys", "private.pem")), true);
  assert.equal(existsSync(path.join(tmpDir, "keys", "public.pem")), true);
});

test("signToken/verifyToken round-trip with the generated keypair", async () => {
  process.env.OLI_LICENSE_DATA_DIR = tmpDir;
  const { signToken, verifyToken, getPublicKeyPem } = await import("../server/keys.js");
  const token = signToken({ licenseKey: "OLI-OPS-ABCD-1234-X", deviceId: "device-1" });
  const publicKeyPem = getPublicKeyPem();
  const payload = verifyToken(token, publicKeyPem);
  assert.equal(payload.licenseKey, "OLI-OPS-ABCD-1234-X");
  assert.equal(payload.deviceId, "device-1");
});

test("verifyToken rejects a tampered token", async () => {
  process.env.OLI_LICENSE_DATA_DIR = tmpDir;
  const { signToken, verifyToken, getPublicKeyPem } = await import("../server/keys.js");
  const token = signToken({ licenseKey: "OLI-OPS-ABCD-1234-X" });
  const [payloadB64, signatureB64] = token.split(".");
  const tampered = `${payloadB64}extra.${signatureB64}`;
  const publicKeyPem = getPublicKeyPem();
  assert.equal(verifyToken(tampered, publicKeyPem), null);
});

test.after(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});
