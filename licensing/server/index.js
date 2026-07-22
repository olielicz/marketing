/**
 * Oli License Server — activation API for OliOps, OliCommerce, OliFlow, and
 * OliConnect. Zero external dependencies (uses only Node's built-in `http`
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
} from "./store.js";
import { getPublicKeyPem, signToken } from "./keys.js";
import { generateSerialCode, isWellFormedSerialCode, productCodeFromSerialCode, PRODUCT_CODES } from "./licenseKey.js";

const PORT = Number(process.env.PORT) || 4100;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const DEFAULT_MAX_DEVICES = Number(process.env.OLI_LICENSE_DEFAULT_MAX_DEVICES) || 5;

if (!ADMIN_TOKEN) {
  console.warn(
    "\n⚠️  ADMIN_TOKEN is not set. License-creation endpoints are effectively open to anyone.\n" +
      "   Set ADMIN_TOKEN in your .env before deploying this anywhere reachable from the internet.\n"
  );
}

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

function requireAdmin(req) {
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return Boolean(ADMIN_TOKEN) && token === ADMIN_TOKEN;
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

    // POST /api/licenses  { product, email?, maxDevices?, note? }  [admin]
    // -> { key, product, maxDevices }
    if (req.method === "POST" && url.pathname === "/api/licenses") {
      if (!requireAdmin(req)) return send(res, 401, { error: "unauthorized" });
      const body = await readJsonBody(req);
      const product = String(body.product || "").toUpperCase();
      if (!PRODUCT_CODES.includes(product)) {
        return send(res, 400, { error: `product must be one of: ${PRODUCT_CODES.join(", ")}` });
      }
      const maxDevices = Number(body.maxDevices) > 0 ? Number(body.maxDevices) : DEFAULT_MAX_DEVICES;
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
      const license = await createLicense({ key, product, email: body.email, maxDevices, note: body.note });
      return send(res, 201, license);
    }

    // GET /api/licenses/:key  [admin] -> license record incl. device list
    if (req.method === "GET" && url.pathname.startsWith("/api/licenses/")) {
      if (!requireAdmin(req)) return send(res, 401, { error: "unauthorized" });
      const key = decodeURIComponent(url.pathname.slice("/api/licenses/".length));
      const license = await getLicense(key);
      if (!license) return send(res, 404, { error: "not_found" });
      return send(res, 200, license);
    }

    // POST /api/licenses/:key/revoke  [admin]
    if (req.method === "POST" && /^\/api\/licenses\/[^/]+\/revoke$/.test(url.pathname)) {
      if (!requireAdmin(req)) return send(res, 401, { error: "unauthorized" });
      const key = decodeURIComponent(url.pathname.split("/")[3]);
      const license = await revokeLicense(key);
      if (!license) return send(res, 404, { error: "not_found" });
      return send(res, 200, license);
    }

    // GET /api/licenses  [admin] -> list all (for a tiny internal dashboard, if wanted)
    if (req.method === "GET" && url.pathname === "/api/licenses") {
      if (!requireAdmin(req)) return send(res, 401, { error: "unauthorized" });
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

      const token = signToken({
        licenseKey,
        deviceId,
        product: result.license.product,
        issuedAt: new Date().toISOString(),
      });

      return send(res, 200, {
        ok: true,
        token,
        devicesUsed: Object.keys(result.license.devices).length,
        maxDevices: result.license.maxDevices,
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

    return send(res, 404, { error: "not_found" });
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: "internal_error", message: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Oli License Server listening on http://localhost:${PORT}`);
});
