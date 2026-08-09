/**
 * smtpClient.js
 * ==============
 * Ported from ../oliflow-executor/server/smtpClient.js — a minimal, real
 * SMTP client implementing enough of RFC 5321/4954 to send a plain-text/
 * HTML email via STARTTLS + AUTH LOGIN (Gmail, Sendgrid, Mailgun, SES's
 * SMTP interface, or any self-hosted SMTP server). Zero npm dependencies
 * — only Node's built-in `net`/`tls`.
 *
 * Kept as an independent copy rather than a shared import, matching this
 * repo's convention of every backend service being independently
 * deployable with zero shared runtime code between services. If you find
 * a bug in one copy, check the other (../oliflow-executor/server/
 * smtpClient.js) — they started identical and should probably stay that
 * way unless one service's needs diverge.
 *
 * What this does NOT implement: OAuth2 XOAUTH2 auth, DKIM signing,
 * bounce/DSN handling, connection pooling/retry, attachments.
 */
import net from "node:net";
import tls from "node:tls";

function readLine(socket) {
  return new Promise((resolve, reject) => {
    let buf = "";
    const onData = (chunk) => {
      buf += chunk.toString("utf8");
      const lines = buf.split("\r\n").filter((l) => l.length > 0);
      const lastLine = lines[lines.length - 1];
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

export async function sendMail(opts) {
  const {
    host, port = 587, secure = false, user, pass, from, to, subject, html, text, timeoutMs = 15000,
    rejectUnauthorized = true, attachments,
  } = opts;

  if (!host) return { ok: false, error: "SMTP host is required." };
  if (!from || !to) return { ok: false, error: "Both 'from' and 'to' are required." };

  let socket;
  try {
    socket = await connectSocket(host, port, secure, timeoutMs, rejectUnauthorized);
    socket.setEncoding("utf8");

    checkCode(await readLine(socket), ["220"]);

    writeCommand(socket, `EHLO olicommerce-backend`);
    let ehloResponse = await readLine(socket);
    checkCode(ehloResponse, ["250"]);

    if (!secure) {
      if (!/STARTTLS/i.test(ehloResponse)) {
        socket.destroy();
        return { ok: false, error: "Server does not advertise STARTTLS and 'secure' was not set — refusing to send credentials/mail in plaintext." };
      }
      writeCommand(socket, "STARTTLS");
      checkCode(await readLine(socket), ["220"]);
      socket = await upgradeToTls(socket, host, timeoutMs, rejectUnauthorized);
      socket.setEncoding("utf8");
      writeCommand(socket, `EHLO olicommerce-backend`);
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

    const escapedBody = buildMessage({ from, to: recipients, subject, html, text, attachments }).replace(/^\./gm, "..");
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

/**
 * Builds the full RFC 5322 message body. When `attachments` is given,
 * this builds a real `multipart/mixed` MIME message with the HTML/text
 * body as one part and each attachment (base64-encoded, per RFC 2045)
 * as a subsequent part — added to support the real supplier CSV
 * forwarding feature (see orderCsv.js). Ported/adapted from the same
 * multipart structure any real mail client would produce; kept
 * dependency-free by hand-building the MIME boundaries rather than
 * pulling in a mail-builder library.
 */
function buildMessage({ from, to, subject, html, text, attachments }) {
  const headers = [`From: ${from}`, `To: ${to.join(", ")}`, `Subject: ${subject || ""}`, `MIME-Version: 1.0`];

  if (!attachments || !attachments.length) {
    if (html) return [...headers, `Content-Type: text/html; charset=utf-8`, "", html].join("\r\n");
    return [...headers, `Content-Type: text/plain; charset=utf-8`, "", text || ""].join("\r\n");
  }

  const boundary = `----olicommerce-boundary-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const parts = [];

  parts.push(`--${boundary}`);
  if (html) {
    parts.push(`Content-Type: text/html; charset=utf-8`, "", html);
  } else {
    parts.push(`Content-Type: text/plain; charset=utf-8`, "", text || "");
  }

  for (const att of attachments) {
    const contentBuffer = Buffer.isBuffer(att.content) ? att.content : Buffer.from(String(att.content), "utf8");
    const base64 = contentBuffer.toString("base64").replace(/(.{76})/g, "$1\r\n");
    parts.push(
      `--${boundary}`,
      `Content-Type: ${att.contentType || "application/octet-stream"}; name="${att.filename}"`,
      `Content-Disposition: attachment; filename="${att.filename}"`,
      `Content-Transfer-Encoding: base64`,
      "",
      base64
    );
  }
  parts.push(`--${boundary}--`);

  return [...headers, `Content-Type: multipart/mixed; boundary="${boundary}"`, "", parts.join("\r\n")].join("\r\n");
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
