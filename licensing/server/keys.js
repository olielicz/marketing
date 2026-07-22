/**
 * Loads the Ed25519 signing keypair from disk and exposes sign/verify
 * helpers used to issue and validate offline-verifiable activation tokens.
 */
import { readFileSync, existsSync } from "node:fs";
import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import path from "node:path";

const DATA_DIR = process.env.OLI_LICENSE_DATA_DIR || path.join(process.cwd(), "data");
const PRIVATE_KEY_PATH = path.join(DATA_DIR, "keys", "private.pem");
const PUBLIC_KEY_PATH = path.join(DATA_DIR, "keys", "public.pem");

function requireKeysExist() {
  if (!existsSync(PRIVATE_KEY_PATH) || !existsSync(PUBLIC_KEY_PATH)) {
    throw new Error(
      "No signing keypair found. Run `node scripts/generate-keys.js` once before starting the server."
    );
  }
}

export function getPublicKeyPem() {
  requireKeysExist();
  return readFileSync(PUBLIC_KEY_PATH, "utf8");
}

/**
 * Signs a plain-object payload and returns a compact "token" string:
 * base64url(payloadJson) + "." + base64url(signature)
 */
export function signToken(payload) {
  requireKeysExist();
  const privateKey = createPrivateKey(readFileSync(PRIVATE_KEY_PATH, "utf8"));
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadJson, "utf8").toString("base64url");
  const signature = sign(null, Buffer.from(payloadB64, "utf8"), privateKey);
  return `${payloadB64}.${signature.toString("base64url")}`;
}

/**
 * Verifies a token produced by signToken(). Returns the parsed payload if
 * valid, or null if the signature doesn't check out / token is malformed.
 * This can run entirely offline given only the public key PEM — this is
 * the function every product's client uses to check a cached token without
 * calling the server every time it starts up.
 */
export function verifyToken(token, publicKeyPem) {
  try {
    const [payloadB64, signatureB64] = token.split(".");
    if (!payloadB64 || !signatureB64) return null;
    const publicKey = createPublicKey(publicKeyPem);
    const isValid = verify(
      null,
      Buffer.from(payloadB64, "utf8"),
      publicKey,
      Buffer.from(signatureB64, "base64url")
    );
    if (!isValid) return null;
    return JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}
