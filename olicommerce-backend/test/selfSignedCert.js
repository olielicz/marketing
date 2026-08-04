/**
 * A minimal, from-scratch self-signed X.509 certificate generator, used
 * ONLY by test/fakeSmtpServer.js to exercise smtpClient.js's real TLS
 * upgrade path. Not part of the shipped product.
 *
 * Ported verbatim from ../oliflow-executor/test/selfSignedCert.js — see
 * that file's header comment for the full rationale (no openssl binary
 * or network access to install one in this sandbox, so cert generation
 * is done by hand via the minimal DER-encoded X.509 structure Node's
 * `tls` module will accept).
 */
import { generateKeyPairSync, createSign, randomBytes } from "node:crypto";

function derLength(len) {
  if (len < 0x80) return Buffer.from([len]);
  const bytes = [];
  let n = len;
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function derTag(tag, contentBuf) {
  return Buffer.concat([Buffer.from([tag]), derLength(contentBuf.length), contentBuf]);
}

function derSeq(...parts) {
  return derTag(0x30, Buffer.concat(parts));
}

function derSet(...parts) {
  return derTag(0x31, Buffer.concat(parts));
}

function derInt(n) {
  if (n === 0) return derTag(0x02, Buffer.from([0]));
  const bytes = [];
  let v = n;
  while (v > 0) {
    bytes.unshift(v & 0xff);
    v = Math.floor(v / 256);
  }
  if (bytes[0] & 0x80) bytes.unshift(0);
  return derTag(0x02, Buffer.from(bytes));
}

function derIntFromBuffer(buf) {
  const needsPad = buf[0] & 0x80;
  return derTag(0x02, needsPad ? Buffer.concat([Buffer.from([0]), buf]) : buf);
}

function derOid(dotted) {
  const parts = dotted.split(".").map(Number);
  const bytes = [parts[0] * 40 + parts[1]];
  for (const part of parts.slice(2)) {
    if (part < 128) {
      bytes.push(part);
    } else {
      const chunk = [];
      let v = part;
      chunk.unshift(v & 0x7f);
      v >>= 7;
      while (v > 0) {
        chunk.unshift((v & 0x7f) | 0x80);
        v >>= 7;
      }
      bytes.push(...chunk);
    }
  }
  return derTag(0x06, Buffer.from(bytes));
}

function derNull() {
  return Buffer.from([0x05, 0x00]);
}

function derUtf8String(str) {
  return derTag(0x0c, Buffer.from(str, "utf8"));
}

function derBitStringFromBuffer(buf) {
  return derTag(0x03, Buffer.concat([Buffer.from([0x00]), buf]));
}

function derUtcTime(date) {
  const pad = (n) => String(n).padStart(2, "0");
  const yy = pad(date.getUTCFullYear() % 100);
  const mm = pad(date.getUTCMonth() + 1);
  const dd = pad(date.getUTCDate());
  const hh = pad(date.getUTCHours());
  const mi = pad(date.getUTCMinutes());
  const ss = pad(date.getUTCSeconds());
  return derTag(0x17, Buffer.from(`${yy}${mm}${dd}${hh}${mi}${ss}Z`, "ascii"));
}

function derContextExplicit(tagNumber, contentBuf) {
  return derTag(0xa0 | tagNumber, contentBuf);
}

const OID_COMMON_NAME = "2.5.4.3";
const OID_SHA256_WITH_RSA = "1.2.840.113549.1.1.11";

function rdnSequence(commonName) {
  const attr = derSeq(derOid(OID_COMMON_NAME), derUtf8String(commonName));
  return derSeq(derSet(attr));
}

function algorithmIdentifierRsaSha256() {
  return derSeq(derOid(OID_SHA256_WITH_RSA), derNull());
}

export default function generateSelfSignedCert() {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  const notBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const notAfter = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000);

  const serialNumber = derIntFromBuffer(randomBytes(8));
  const signatureAlgo = algorithmIdentifierRsaSha256();
  const issuer = rdnSequence("Oli Test SMTP CA");
  const subject = rdnSequence("localhost");
  const validity = derSeq(derUtcTime(notBefore), derUtcTime(notAfter));
  const subjectPublicKeyInfo = publicKey;

  const tbsCertificate = derSeq(
    derContextExplicit(0, derInt(2)),
    serialNumber,
    signatureAlgo,
    issuer,
    validity,
    subject,
    subjectPublicKeyInfo
  );

  const sign = createSign("RSA-SHA256");
  sign.update(tbsCertificate);
  sign.end();
  const signatureValue = sign.sign(privateKey);

  const certificate = derSeq(tbsCertificate, signatureAlgo, derBitStringFromBuffer(signatureValue));

  const certPem = toPem(certificate, "CERTIFICATE");
  return { cert: certPem, key: privateKey };
}

function toPem(derBuffer, label) {
  const b64 = derBuffer.toString("base64");
  const lines = [];
  for (let i = 0; i < b64.length; i += 64) lines.push(b64.slice(i, i + 64));
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}
