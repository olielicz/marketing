/**
 * Oli License Client — drop this file into any of the 4 self-hosted products
 * (OliOps, OliCommerce, OliFlow, OliConnect) to check a customer's serial
 * code against the shared license server, and enforce the per-license
 * device limit (default 5) on their behalf.
 *
 * This file has ZERO npm dependencies — only Node's built-in `crypto` and
 * `fs` modules — matching the zero-dependency philosophy of these products'
 * core repos (see e.g. project-3/OliFlow's own package.json).
 *
 * ---------------------------------------------------------------------------
 * USAGE (from the product's own startup code):
 *
 *   import { verifyCachedToken, activateLicense } from "./oliLicenseClient.js";
 *
 *   const cached = await verifyCachedToken({ product: "OPS", licenseServerUrl });
 *   if (!cached.valid) {
 *     const code = await promptUserForSerialCode(); // your own UI
 *     const result = await activateLicense({ product: "OPS", licenseKey: code, licenseServerUrl });
 *     if (!result.ok) {
 *       // show result.reason to the user: "device_limit_reached", "invalid_format",
 *       // "not_found", "revoked", "wrong_product", or "network_error"
 *     }
 *   }
 * ---------------------------------------------------------------------------
 */
import { randomBytes, createPublicKey, verify as cryptoVerify } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const DEFAULT_OFFLINE_GRACE_DAYS = 14;

function stateDir(product) {
  // Stored alongside other app data, not inside the repo — survives updates,
  // isn't accidentally committed to git.
  const base = process.env.OLI_LICENSE_STATE_DIR || path.join(os.homedir(), ".oli-tools", "license");
  const dir = path.join(base, product.toLowerCase());
  mkdirSync(dir, { recursive: true });
  return dir;
}

function getOrCreateDeviceId(product) {
  const file = path.join(stateDir(product), "device-id");
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  const id = randomBytes(16).toString("hex"); // random, NOT a hardware fingerprint — see server README
  writeFileSync(file, id);
  return id;
}

function tokenCachePath(product) {
  return path.join(stateDir(product), "token.json");
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

/**
 * Activates this device against a serial code. Call this the first time a
 * customer enters their code, or whenever they want to add this machine to
 * their license (e.g. after moving to a new computer).
 */
export async function activateLicense({ product, licenseKey, licenseServerUrl }) {
  const deviceId = getOrCreateDeviceId(product);
  try {
    const { status, body } = await fetchJson(`${licenseServerUrl}/api/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ licenseKey, deviceId, product }),
    });
    if (status === 200 && body?.ok) {
      writeFileSync(tokenCachePath(product), JSON.stringify({ token: body.token, cachedAt: Date.now() }));
      return { ok: true, devicesUsed: body.devicesUsed, maxDevices: body.maxDevices };
    }
    return { ok: false, reason: body?.reason || "unknown_error", devicesUsed: body?.devicesUsed, maxDevices: body?.maxDevices };
  } catch (err) {
    return { ok: false, reason: "network_error", message: err.message };
  }
}

/**
 * Frees up this device's slot on the license (e.g. before decommissioning a
 * machine, so the customer can activate a replacement without hitting the
 * device cap).
 */
export async function deactivateThisDevice({ product, licenseKey, licenseServerUrl }) {
  const deviceId = getOrCreateDeviceId(product);
  try {
    const { status, body } = await fetchJson(`${licenseServerUrl}/api/deactivate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ licenseKey, deviceId }),
    });
    return status === 200 ? { ok: true, ...body } : { ok: false, reason: body?.reason || "unknown_error" };
  } catch (err) {
    return { ok: false, reason: "network_error", message: err.message };
  }
}

let cachedPublicKeyPem = null;
async function getPublicKeyPem(licenseServerUrl) {
  if (cachedPublicKeyPem) return cachedPublicKeyPem;
  const keyFile = path.join(os.homedir(), ".oli-tools", "license", "server-public-key.pem");
  try {
    const { status, body } = await fetchJson(`${licenseServerUrl}/api/public-key`);
    if (status === 200 && body?.publicKeyPem) {
      mkdirSync(path.dirname(keyFile), { recursive: true });
      writeFileSync(keyFile, body.publicKeyPem);
      cachedPublicKeyPem = body.publicKeyPem;
      return cachedPublicKeyPem;
    }
  } catch {
    // fall through to cached-on-disk copy below (offline support)
  }
  if (existsSync(keyFile)) {
    cachedPublicKeyPem = readFileSync(keyFile, "utf8");
    return cachedPublicKeyPem;
  }
  return null;
}

function verifyTokenOffline(token, publicKeyPem) {
  try {
    const [payloadB64, signatureB64] = token.split(".");
    if (!payloadB64 || !signatureB64) return null;
    const publicKey = createPublicKey(publicKeyPem);
    const isValid = cryptoVerify(null, Buffer.from(payloadB64, "utf8"), publicKey, Buffer.from(signatureB64, "base64url"));
    if (!isValid) return null;
    return JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * Checks whether this device already has a valid, cached activation token.
 * Verifies the signature offline (no network call needed) as long as the
 * token was issued within the last `offlineGraceDays` days. This is what a
 * product should call on every startup — it only needs to call
 * activateLicense() again if this returns { valid: false }.
 */
export async function verifyCachedToken({ product, licenseServerUrl, offlineGraceDays = DEFAULT_OFFLINE_GRACE_DAYS }) {
  const cacheFile = tokenCachePath(product);
  if (!existsSync(cacheFile)) return { valid: false, reason: "no_cached_token" };

  let cached;
  try {
    cached = JSON.parse(readFileSync(cacheFile, "utf8"));
  } catch {
    return { valid: false, reason: "corrupt_cache" };
  }

  const publicKeyPem = await getPublicKeyPem(licenseServerUrl);
  if (!publicKeyPem) return { valid: false, reason: "no_public_key_available" };

  const payload = verifyTokenOffline(cached.token, publicKeyPem);
  if (!payload) return { valid: false, reason: "invalid_signature" };
  if (payload.product !== product) return { valid: false, reason: "wrong_product" };

  const ageDays = (Date.now() - cached.cachedAt) / (1000 * 60 * 60 * 24);
  if (ageDays > offlineGraceDays) {
    return { valid: false, reason: "offline_grace_expired", licenseKey: payload.licenseKey };
  }

  return { valid: true, licenseKey: payload.licenseKey, issuedAt: payload.issuedAt };
}
