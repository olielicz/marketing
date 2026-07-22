/**
 * Serial-code format + checksum, e.g.  OLI-OPS-7F3K-9QZX-M
 *
 * Layout: OLI-<PRODUCT>-<GROUP1>-<GROUP2>-<CHECKSUM>
 *   PRODUCT   3-letter code: OPS | COM | FLW | CNT | ALL
 *   GROUP1/2  4 random base32 (Crockford-style, no I/L/O/U to avoid confusion) chars each
 *   CHECKSUM  1 character, a simple mod-37 checksum over the rest of the code
 *
 * The checksum lets the client (and support staff) catch an obviously
 * mistyped code instantly, before ever calling the server — it is NOT a
 * security mechanism, just a typo-catcher.
 */
import { randomInt } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // 32 chars, no I/L/O/U

export const PRODUCT_CODES = ["OPS", "COM", "FLW", "CNT", "ALL"];

function randomGroup(length) {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

function checksumChar(input) {
  let sum = 0;
  for (const ch of input) {
    sum = (sum * 31 + ch.charCodeAt(0)) % 37;
  }
  return ALPHABET[sum % ALPHABET.length];
}

export function generateSerialCode(productCode) {
  if (!PRODUCT_CODES.includes(productCode)) {
    throw new Error(`Unknown product code "${productCode}". Expected one of: ${PRODUCT_CODES.join(", ")}`);
  }
  const group1 = randomGroup(4);
  const group2 = randomGroup(4);
  const body = `${productCode}${group1}${group2}`;
  const checksum = checksumChar(body);
  return `OLI-${productCode}-${group1}-${group2}-${checksum}`;
}

/**
 * Validates the FORMAT and checksum of a serial code (does not check the
 * database — that's a separate, server-side step). Useful for client-side
 * "does this look like a real code" validation before even calling the API.
 */
export function isWellFormedSerialCode(code) {
  if (typeof code !== "string") return false;
  const match = /^OLI-([A-Z]{3})-([0-9A-HJKMNP-TV-Z]{4})-([0-9A-HJKMNP-TV-Z]{4})-([0-9A-HJKMNP-TV-Z])$/.exec(
    code.trim().toUpperCase()
  );
  if (!match) return false;
  const [, product, group1, group2, checksum] = match;
  if (!PRODUCT_CODES.includes(product)) return false;
  const body = `${product}${group1}${group2}`;
  return checksumChar(body) === checksum;
}

export function productCodeFromSerialCode(code) {
  const match = /^OLI-([A-Z]{3})-/.exec(code.trim().toUpperCase());
  return match ? match[1] : null;
}
