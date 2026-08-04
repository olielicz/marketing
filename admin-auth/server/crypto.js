/**
 * Password hashing + session-token signing for the single-owner admin
 * account. Zero external dependencies — only Node's built-in `crypto`.
 *
 * Password hashing: scrypt (Node's built-in, memory-hard KDF) with a
 * random 16-byte salt per account. This replaces the trivial
 * non-cryptographic hash used by shared/auth.js (see that file's
 * `hashPassword` — explicitly marked there as a placeholder "for when
 * adding a backend"). This IS that backend.
 *
 * Session tokens: Ed25519-signed, same compact
 * base64url(payload).base64url(signature) shape as licensing/server/keys.js,
 * for consistency across this repo's backend services. Unlike the
 * licensing service's *product-activation* tokens (which are designed to
 * be verified fully offline, for up to weeks, because they run on a
 * customer's own machine with no guaranteed connectivity), admin session
 * tokens are verified against a server-side revocation list on every
 * check (see store.js's sessions table) — an admin session must be
 * instantly killable (logout, password change, suspected compromise),
 * which a purely-offline-verifiable token could never support.
 */
import { randomBytes, scryptSync, timingSafeEqual, generateKeyPairSync, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.OLI_ADMIN_DATA_DIR || path.join(process.cwd(), "data");
const KEYS_DIR = path.join(DATA_DIR, "keys");
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, "private.pem");
const PUBLIC_KEY_PATH = path.join(KEYS_DIR, "public.pem");

const SCRYPT_KEYLEN = 64;
const SCRYPT_SALT_BYTES = 16;

/** Hash a plaintext password. Returns { salt, hash } (both hex strings). */
export function hashPassword(password) {
  const salt = randomBytes(SCRYPT_SALT_BYTES).toString("hex");
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return { salt, hash };
}

/** Constant-time password check against a stored { salt, hash } pair. */
export function verifyPassword(password, salt, storedHashHex) {
  const candidate = scryptSync(password, salt, SCRYPT_KEYLEN);
  const stored = Buffer.from(storedHashHex, "hex");
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}

/**
 * Generates the Ed25519 signing keypair used for session tokens, if one
 * doesn't already exist. Safe to call on every server startup (unlike
 * licensing's generate-keys.js, which is a one-time manual CLI step) —
 * idempotent, and rotating this key just invalidates outstanding sessions
 * (everyone has to log in again), which is a safe failure mode, not a
 * destructive one like rotating the *license signing* key would be.
 */
export function ensureKeysExist() {
  if (existsSync(PRIVATE_KEY_PATH) && existsSync(PUBLIC_KEY_PATH)) return;
  mkdirSync(KEYS_DIR, { recursive: true });
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  writeFileSync(PRIVATE_KEY_PATH, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  writeFileSync(PUBLIC_KEY_PATH, publicKey.export({ type: "spki", format: "pem" }));
}

export function getPublicKeyPem() {
  ensureKeysExist();
  return readFileSync(PUBLIC_KEY_PATH, "utf8");
}

export function signSessionToken(payload) {
  ensureKeysExist();
  const privateKey = createPrivateKey(readFileSync(PRIVATE_KEY_PATH, "utf8"));
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = sign(null, Buffer.from(payloadB64, "utf8"), privateKey);
  return `${payloadB64}.${signature.toString("base64url")}`;
}

/**
 * Verifies signature + shape only (no expiry/revocation check — see
 * store.js's isSessionActive() for that, which callers MUST also check).
 * Returns the parsed payload, or null if malformed/tampered.
 */
export function verifySessionTokenSignature(token) {
  try {
    ensureKeysExist();
    const [payloadB64, signatureB64] = String(token).split(".");
    if (!payloadB64 || !signatureB64) return null;
    const publicKey = createPublicKey(getPublicKeyPem());
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
