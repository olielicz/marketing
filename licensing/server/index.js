/**
 * Oli License Server — activation API for OliOps, OliCommerce, OliFlow, and
 * OliExplore. Zero external dependencies (uses only Node's built-in `http`
 * and `crypto`), so it runs comfortably on any free Node hosting tier.
 *
 * Start with:  node server/index.js
 * See README.md in this directory for full setup + API documentation.
 */
import { createServer } from "node:http";
import {
  createLicense,
  getLicense,
  listLicenses,
  revokeLicense,
  activateDevice,
  deactivateDevice,
  addUser,
  removeUser,
} from "./store.js";
import { getPublicKeyPem, signToken } from "./keys.js";
import { generateSerialCode, isWellFormedSerialCode, productCodeFromSerialCode, PRODUCT_CODES } from "./licenseKey.js";
import { requireAdmin } from "./adminAuth.js";
import { tierKeysFor } from "./tierLimits.js";

const PORT = Number(process.env.PORT) || 4100;
// FIX: DEFAULT_MAX_DEVICES used to be the SAME number for every tier of
// every product — Starter, Pro, and Agency all got whatever this one
// global env var said (default 5), which is exactly the "tiers are pure
// marketing text" problem this file now fixes. createLicense() now looks
// up real, product+tier-specific limits from tierLimits.js instead; this
// constant is kept only as the last-resort fallback inside
// resolveTierLimits() when an unrecognized tier is passed (see that
// file), never as the normal path.
// NOTE: admin authentication (requireAdmin, imported above) now verifies
// against the shared admin-auth service (../admin-auth) by default instead
// of a static ADMIN_TOKEN shared secret. See adminAuth.js and
// ../admin-auth/README.md for the security rationale and setup. The old
// ADMIN_TOKEN env var still works as an explicit break-glass fallback.

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(json),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(json);
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") return send(res, 204, {});

    const url = new URL(req.url, `http://localhost:${PORT}`);

    // GET /api/health — no auth, used by hosting platforms' health checks
    if (req.method === "GET" && url.pathname === "/api/health") {
      return send(res, 200, { ok: true });
    }

    // GET /api/public-key — no auth. Clients fetch this once and cache it,
    // so they can verify tokens offline without hitting the server again.
    if (req.method === "GET" && url.pathname === "/api/public-key") {
      return send(res, 200, { publicKeyPem: getPublicKeyPem() });
    }

    // POST /api/licenses  { product, tier, email?, maxDevices?, maxUsers?, note? }  [admin]
    // -> full license record, with maxDevices/maxUsers now REAL per-tier
    // numbers (see tierLimits.js) rather than one global default for
    // every tier. `tier` is required — this is the fix for tiers being
    // pure marketing text with nothing enforced server-side.
    if (req.method === "POST" && url.pathname === "/api/licenses") {
      if (!(await requireAdmin(req))) return send(res, 401, { error: "unauthorized" });
      const body = await readJsonBody(req);
      const product = String(body.product || "").toUpperCase();
      if (!PRODUCT_CODES.includes(product)) {
        return send(res, 400, { error: `product must be one of: ${PRODUCT_CODES.join(", ")}` });
      }
      if (product !== "ALL") {
        const validTiers = tierKeysFor(product);
        const tier = String(body.tier || "").toLowerCase();
        if (!validTiers.includes(tier)) {
          return send(res, 400, { error: `tier is required for ${product} and must be one of: ${validTiers.join(", ")}` });
        }
      }
      let key;
      // Regenerate on the (astronomically unlikely) chance of a collision.
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = generateSerialCode(product);
        if (!(await getLicense(candidate))) {
          key = candidate;
          break;
        }
      }
      if (!key) return send(res, 500, { error: "failed to generate a unique license key, try again" });
      const license = await createLicense({
        key,
        product,
        tier: body.tier,
        email: body.email,
        maxDevices: body.maxDevices,
        maxUsers: body.maxUsers,
        note: body.note,
      });
      return send(res, 201, license);
    }

    // GET /api/licenses/:key  [admin] -> license record incl. device list
    if (req.method === "GET" && url.pathname.startsWith("/api/licenses/")) {
      if (!(await requireAdmin(req))) return send(res, 401, { error: "unauthorized" });
      const key = decodeURIComponent(url.pathname.slice("/api/licenses/".length));
      const license = await getLicense(key);
      if (!license) return send(res, 404, { error: "not_found" });
      return send(res, 200, license);
    }

    // POST /api/licenses/:key/revoke  [admin]
    if (req.method === "POST" && /^\/api\/licenses\/[^/]+\/revoke$/.test(url.pathname)) {
      if (!(await requireAdmin(req))) return send(res, 401, { error: "unauthorized" });
      const key = decodeURIComponent(url.pathname.split("/")[3]);
      const license = await revokeLicense(key);
      if (!license) return send(res, 404, { error: "not_found" });
      return send(res, 200, license);
    }

    // GET /api/licenses  [admin] -> list all (for a tiny internal dashboard, if wanted)
    if (req.method === "GET" && url.pathname === "/api/licenses") {
      if (!(await requireAdmin(req))) return send(res, 401, { error: "unauthorized" });
      return send(res, 200, await listLicenses());
    }

    // POST /api/activate  { licenseKey, deviceId, product }  [public]
    // -> { ok, token? , reason?, devicesUsed?, maxDevices? }
    if (req.method === "POST" && url.pathname === "/api/activate") {
      const body = await readJsonBody(req);
      const licenseKey = String(body.licenseKey || "").trim().toUpperCase();
      const deviceId = String(body.deviceId || "").trim();
      const product = String(body.product || "").trim().toUpperCase();

      if (!isWellFormedSerialCode(licenseKey)) {
        return send(res, 400, { ok: false, reason: "invalid_format" });
      }
      if (!deviceId || deviceId.length < 8) {
        return send(res, 400, { ok: false, reason: "invalid_device_id" });
      }

      const codeProduct = productCodeFromSerialCode(licenseKey);
      if (codeProduct !== "ALL" && product && codeProduct !== product) {
        return send(res, 403, { ok: false, reason: "wrong_product" });
      }

      const result = await activateDevice({ key: licenseKey, deviceId });
      if (!result.ok) {
        const status = result.reason === "not_found" ? 404 : result.reason === "revoked" ? 403 : 409;
        return send(res, status, {
          ok: false,
          reason: result.reason,
          devicesUsed: result.license ? Object.keys(result.license.devices).length : undefined,
          maxDevices: result.license ? result.license.maxDevices : undefined,
        });
      }

      // FIX: the signed token now carries tier + maxUsers (not just
      // maxDevices) so a product's OWN backend can enforce its
      // real per-tier seat/store/account cap purely from the token it
      // already has cached, without needing a live round-trip to this
      // license server for every seat-add/store-connect/account-connect
      // action. verifyTokenOffline() in the client already verifies the
      // signature the same way it does today — this just adds fields.
      const token = signToken({
        licenseKey,
        deviceId,
        product: result.license.product,
        tier: result.license.tier,
        maxUsers: result.license.maxUsers,
        issuedAt: new Date().toISOString(),
      });

      return send(res, 200, {
        ok: true,
        token,
        tier: result.license.tier,
        devicesUsed: Object.keys(result.license.devices).length,
        maxDevices: result.license.maxDevices,
        maxUsers: result.license.maxUsers,
      });
    }

    // POST /api/deactivate  { licenseKey, deviceId }  [public — anyone holding
    // the serial code can free up their own device slots; this mirrors how
    // most consumer software licensing works and keeps support-burden low]
    if (req.method === "POST" && url.pathname === "/api/deactivate") {
      const body = await readJsonBody(req);
      const licenseKey = String(body.licenseKey || "").trim().toUpperCase();
      const deviceId = String(body.deviceId || "").trim();
      const result = await deactivateDevice({ key: licenseKey, deviceId });
      if (!result.ok) return send(res, 404, { ok: false, reason: result.reason });
      return send(res, 200, {
        ok: true,
        devicesUsed: Object.keys(result.license.devices).length,
        maxDevices: result.license.maxDevices,
      });
    }

    // POST /api/users/add  { licenseKey, userId, email?, role? }  [public —
    // same "anyone holding the serial code" model as /api/activate; the
    // PRODUCT's own login/admin screen is what actually decides who's
    // allowed to invite a teammate, this just enforces the seat COUNT]
    // -> { ok, usersUsed?, maxUsers?, reason? }
    if (req.method === "POST" && url.pathname === "/api/users/add") {
      const body = await readJsonBody(req);
      const licenseKey = String(body.licenseKey || "").trim().toUpperCase();
      const userId = String(body.userId || "").trim();
      if (!isWellFormedSerialCode(licenseKey)) return send(res, 400, { ok: false, reason: "invalid_format" });
      if (!userId) return send(res, 400, { ok: false, reason: "invalid_user_id" });

      const result = await addUser({ key: licenseKey, userId, email: body.email, role: body.role });
      if (!result.ok) {
        const status = result.reason === "not_found" ? 404 : result.reason === "revoked" ? 403 : 409;
        return send(res, status, {
          ok: false,
          reason: result.reason,
          usersUsed: result.license ? Object.keys(result.license.users || {}).length : undefined,
          maxUsers: result.license ? result.license.maxUsers : undefined,
        });
      }
      return send(res, 200, {
        ok: true,
        usersUsed: Object.keys(result.license.users).length,
        maxUsers: result.license.maxUsers,
      });
    }

    // POST /api/users/remove  { licenseKey, userId }  [public]
    if (req.method === "POST" && url.pathname === "/api/users/remove") {
      const body = await readJsonBody(req);
      const licenseKey = String(body.licenseKey || "").trim().toUpperCase();
      const userId = String(body.userId || "").trim();
      const result = await removeUser({ key: licenseKey, userId });
      if (!result.ok) return send(res, 404, { ok: false, reason: result.reason });
      return send(res, 200, {
        ok: true,
        usersUsed: Object.keys(result.license.users || {}).length,
        maxUsers: result.license.maxUsers,
      });
    }

    return send(res, 404, { error: "not_found" });
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: "internal_error", message: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Oli License Server listening on http://localhost:${PORT}`);
});
