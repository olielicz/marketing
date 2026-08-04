/**
 * Owner authentication for a single self-hosted OliCommerce deployment.
 * Zero external dependencies — only Node's built-in `crypto`. Identical
 * pattern to ../oliops-backend/server/auth.js and ../admin-auth/server/
 * crypto.js (scrypt password hashing + Ed25519-signed, server-revocable
 * session tokens) — see either for the full rationale. Kept as an
 * independent copy per this repo's convention of zero shared runtime
 * code between independently-deployable services.
 *
 * Scope note: this is the merchant's OWN login for their OWN OliCommerce
 * instance — not the cross-tool admin-auth service, and not the same
 * account as their oliops-backend login (a merchant using both OliOps
 * and OliCommerce has two separate logins, one per self-hosted product,
 * matching how every other tool in this repo works).
 */
import { randomBytes, scryptSync, timingSafeEqual, generateKeyPairSync, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.OLICOMMERCE_DATA_DIR || path.join(process.cwd(), "data");
const KEYS_DIR = path.join(DATA_DIR, "keys");
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, "private.pem");
const PUBLIC_KEY_PATH = path.join(KEYS_DIR, "public.pem");

const SCRYPT_KEYLEN = 64;
const SCRYPT_SALT_BYTES = 16;

export function hashPassword(password) {
  const salt = randomBytes(SCRYPT_SALT_BYTES).toString("hex");
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return { salt, hash };
}

export function verifyPassword(password, salt, storedHashHex) {
  const candidate = scryptSync(password, salt, SCRYPT_KEYLEN);
  const stored = Buffer.from(storedHashHex, "hex");
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}

export function ensureKeysExist() {
  if (existsSync(PRIVATE_KEY_PATH) && existsSync(PUBLIC_KEY_PATH)) return;
  mkdirSync(KEYS_DIR, { recursive: true });
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  writeFileSync(PRIVATE_KEY_PATH, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  writeFileSync(PUBLIC_KEY_PATH, publicKey.export({ type: "spki", format: "pem" }));
}

export function signSessionToken(payload) {
  ensureKeysExist();
  const privateKey = createPrivateKey(readFileSync(PRIVATE_KEY_PATH, "utf8"));
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = sign(null, Buffer.from(payloadB64, "utf8"), privateKey);
  return `${payloadB64}.${signature.toString("base64url")}`;
}

export function verifySessionTokenSignature(token) {
  try {
    ensureKeysExist();
    const [payloadB64, signatureB64] = String(token).split(".");
    if (!payloadB64 || !signatureB64) return null;
    const publicKey = createPublicKey(readFileSync(PUBLIC_KEY_PATH, "utf8"));
    const isValid = verify(null, Buffer.from(payloadB64, "utf8"), publicKey, Buffer.from(signatureB64, "base64url"));
    if (!isValid) return null;
    return JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export function newSessionId() {
  return randomBytes(24).toString("hex");
}
