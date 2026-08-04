/**
 * smtpClient.js
 * ==============
 * A minimal, real SMTP client implementing just enough of RFC 5321/4954 to
 * send a plain-text/HTML email via STARTTLS + AUTH LOGIN — the combination
 * every mainstream SMTP provider (Gmail, Sendgrid, Mailgun, SES's SMTP
 * interface, custom SMTP) supports, matching the "SMTP Provider" dropdown
 * options the frontend's config panel already shows for the 'email_send'
 * node type (see oliflow/app/index.html).
 *
 * Zero npm dependencies — uses only Node's built-in `net`/`tls`, matching
 * this repo's established pattern elsewhere (Ed25519 signing in
 * licensing/admin-auth, HMAC webhook verification in olisalestrack-sync).
 *
 * What this does NOT implement (be honest about scope):
 *  - No OAuth2 XOAUTH2 auth (Gmail app-specific passwords or a
 *    provider's SMTP-specific credentials work fine with AUTH LOGIN;
 *    full OAuth2 SMTP would be a real follow-up).
 *  - No DKIM signing, no bounce/DSN handling, no connection pooling/retry.
 *  - Attachments are not supported (the frontend's config panel doesn't
 *    collect one for this node type either, so this matches scope).
 * This is a genuine, working plain-text/HTML email sender — not a stub —
 * but it is intentionally minimal, matching exactly what the existing UI
 * promises rather than over-building unrequested features.
 */
import net from "node:net";
import tls from "node:tls";

/**
 * Reads one full SMTP response, which may span multiple lines (e.g.
 * EHLO's reply: "250-first\r\n250-second\r\n250 last\r\n" — every line
 * except the last uses a hyphen after the 3-digit code; the LAST line
 * uses a space). Returns the full multi-line response joined by "\n" so
 * callers can grep it for e.g. "STARTTLS" regardless of which line it's on.
 *
 * ⚠️ The original version of this function returned as soon as it saw
 * ANY single "\r\n" — which happened to work for single-line responses
 * (AUTH LOGIN's "334 ...", "250 OK" for MAIL FROM, etc.) but silently
 * truncated EHLO's multi-line reply to just its first line, meaning the
 * "250-STARTTLS" advertisement was never actually seen — every
 * STARTTLS-capable server would incorrectly be treated as not
 * supporting it. Caught by testing against a real (if minimal) fake
 * SMTP server, not by reading the code alone.
 */
function readLine(socket) {
  return new Promise((resolve, reject) => {
    let buf = "";
    const onData = (chunk) => {
      buf += chunk.toString("utf8");
      const lines = buf.split("\r\n").filter((l) => l.length > 0);
      const lastLine = lines[lines.length - 1];
      // A response is complete once its last received line has a SPACE
      // (not a hyphen) after the 3-digit code - that marks the final line
      // of a (possibly multi-line) reply, per RFC 5321 §4.2.1.
      if (lastLine && /^\d{3} /.test(lastLine) && buf.endsWith("\r\n")) {
        socket.removeListener("data", onData);
        resolve(lines.join("\n"));
      }
    };
    const onError = (err) => {
      socket.removeListener("data", onData);
      reject(err);
    };
    socket.on("data", onData);
    socket.once("error", onError);
  });
}

function checkCode(response, expectedPrefixes) {
  const firstLine = response.split("\n")[0];
  const code = firstLine.slice(0, 3);
  if (!expectedPrefixes.includes(code)) {
    throw new Error(`SMTP server returned unexpected response: ${response.trim()}`);
  }
  return response;
}

function writeCommand(socket, command) {
  socket.write(command + "\r\n");
}

/**
 * @param {object} opts
 *   host, port, secure (true = implicit TLS on connect, false = plaintext
 *     then STARTTLS), user, pass, from, to, subject, html or text,
 *     timeoutMs (default 15000)
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
export async function sendMail(opts) {
  const {
    host, port = 587, secure = false, user, pass, from, to, subject, html, text, timeoutMs = 15000,
    // Defaults to true (verify the server's TLS certificate) — the
    // correct, safe default for real providers (Gmail, Sendgrid,
    // Mailgun, SES all present valid certs). Only set this to false if
    // you're intentionally connecting to a self-hosted SMTP server with
    // a self-signed certificate, and you understand that disables
    // protection against a MITM intercepting your credentials/mail.
    rejectUnauthorized = true,
  } = opts;

  if (!host) return { ok: false, error: "SMTP host is required." };
  if (!from || !to) return { ok: false, error: "Both 'from' and 'to' are required." };

  let socket;
  try {
    socket = await connectSocket(host, port, secure, timeoutMs, rejectUnauthorized);
    socket.setEncoding("utf8");

    checkCode(await readLine(socket), ["220"]); // server greeting

    writeCommand(socket, `EHLO oliflow-executor`);
    let ehloResponse = await readLine(socket);
    checkCode(ehloResponse, ["250"]);

    if (!secure) {
      // Upgrade to TLS via STARTTLS if the server advertises it (it
      // should — refuse to send credentials/mail in the clear otherwise).
      if (!/STARTTLS/i.test(ehloResponse)) {
        socket.destroy();
        return { ok: false, error: "Server does not advertise STARTTLS and 'secure' was not set — refusing to send credentials/mail in plaintext." };
      }
      writeCommand(socket, "STARTTLS");
      checkCode(await readLine(socket), ["220"]);
      socket = await upgradeToTls(socket, host, timeoutMs, rejectUnauthorized);
      socket.setEncoding("utf8");
      writeCommand(socket, `EHLO oliflow-executor`);
      checkCode(await readLine(socket), ["250"]);
    }

    if (user && pass) {
      writeCommand(socket, "AUTH LOGIN");
      checkCode(await readLine(socket), ["334"]);
      writeCommand(socket, Buffer.from(user, "utf8").toString("base64"));
      checkCode(await readLine(socket), ["334"]);
      writeCommand(socket, Buffer.from(pass, "utf8").toString("base64"));
      checkCode(await readLine(socket), ["235"]);
    }

    writeCommand(socket, `MAIL FROM:<${from}>`);
    checkCode(await readLine(socket), ["250"]);

    const recipients = Array.isArray(to) ? to : [to];
    for (const recipient of recipients) {
      writeCommand(socket, `RCPT TO:<${recipient}>`);
      checkCode(await readLine(socket), ["250", "251"]);
    }

    writeCommand(socket, "DATA");
    checkCode(await readLine(socket), ["354"]);

    const boundary = `oliflow-${Date.now()}`;
    const bodyLines = [
      `From: ${from}`,
      `To: ${recipients.join(", ")}`,
      `Subject: ${subject || ""}`,
      `MIME-Version: 1.0`,
    ];
    if (html) {
      bodyLines.push(`Content-Type: text/html; charset=utf-8`, "", html);
    } else {
      bodyLines.push(`Content-Type: text/plain; charset=utf-8`, "", text || "");
    }
    // RFC 5321 dot-stuffing: a line consisting of a single "." must be
    // escaped as ".." so the SMTP server doesn't treat it as the
    // end-of-DATA terminator prematurely.
    const escapedBody = bodyLines.join("\r\n").replace(/^\./gm, "..");
    writeCommand(socket, escapedBody + "\r\n.");
    checkCode(await readLine(socket), ["250"]);

    writeCommand(socket, "QUIT");
    socket.end();

    return { ok: true };
  } catch (err) {
    if (socket && !socket.destroyed) socket.destroy();
    return { ok: false, error: err.message };
  }
}

function connectSocket(host, port, secure, timeoutMs, rejectUnauthorized) {
  return new Promise((resolve, reject) => {
    const socket = secure
      ? tls.connect({ host, port, timeout: timeoutMs, rejectUnauthorized })
      : net.connect({ host, port, timeout: timeoutMs });
    socket.once("connect", () => resolve(socket));
    socket.once("secureConnect", () => resolve(socket));
    socket.once("error", reject);
    socket.once("timeout", () => reject(new Error(`Connection to ${host}:${port} timed out.`)));
  });
}

function upgradeToTls(socket, host, timeoutMs, rejectUnauthorized) {
  return new Promise((resolve, reject) => {
    const tlsSocket = tls.connect({ socket, host, timeout: timeoutMs, rejectUnauthorized });
    tlsSocket.once("secureConnect", () => resolve(tlsSocket));
    tlsSocket.once("error", reject);
  });
}
