/**
 * A minimal, real fake SMTP server used ONLY by tests. Ported verbatim
 * from ../oliflow-executor/test/fakeSmtpServer.js — see that file for
 * the full rationale. Not part of the shipped product.
 */
import net from "node:net";
import tls from "node:tls";
import selfsigned from "./selfSignedCert.js";

export async function startFakeSmtpServer(opts = {}) {
  const receivedMail = [];
  const { cert, key } = opts.secure || opts.advertiseStartTls !== false ? selfsigned() : { cert: null, key: null };

  function handleConnection(socket, isEncrypted, sendGreeting = true) {
    let buf = "";
    let currentMail = null;
    let authenticated = !opts.requireAuth;
    let awaitingAuthStep = null;
    let pendingUser = null;
    let upgraded = false;

    const write = (line) => socket.write(line + "\r\n");
    if (sendGreeting) write(isEncrypted ? "220 fake-smtp ready (TLS)" : "220 fake-smtp ready");

    function handleLine(line) {
      const upper = line.toUpperCase();

      if (awaitingAuthStep === "user") {
        pendingUser = Buffer.from(line.trim(), "base64").toString("utf8");
        awaitingAuthStep = "pass";
        write("334 UGFzc3dvcmQ6");
        return;
      }
      if (awaitingAuthStep === "pass") {
        const pass = Buffer.from(line.trim(), "base64").toString("utf8");
        awaitingAuthStep = null;
        if (opts.requireAuth && pendingUser === opts.requireAuth.user && pass === opts.requireAuth.pass) {
          authenticated = true;
          write("235 2.7.0 Authentication successful");
        } else {
          write("535 5.7.8 Authentication failed");
        }
        return;
      }

      if (currentMail && currentMail.inData) {
        if (line === ".") {
          currentMail.inData = false;
          receivedMail.push({ from: currentMail.from, to: currentMail.to, data: currentMail.dataLines.join("\n") });
          currentMail = null;
          write("250 2.0.0 OK: queued");
        } else {
          currentMail.dataLines.push(line.replace(/^\.\./, "."));
        }
        return;
      }

      if (upper.startsWith("EHLO")) {
        write("250-fake-smtp greets you");
        if (!isEncrypted && opts.advertiseStartTls !== false) write("250-STARTTLS");
        write("250 AUTH LOGIN");
        return;
      }
      if (upper === "STARTTLS" && !isEncrypted) {
        write("220 2.0.0 Ready to start TLS");
        upgraded = true;
        return;
      }
      if (upper === "AUTH LOGIN") {
        awaitingAuthStep = "user";
        write("334 VXNlcm5hbWU6");
        return;
      }
      if (upper.startsWith("MAIL FROM:")) {
        if (opts.requireAuth && !authenticated) {
          write("530 5.7.0 Authentication required");
          return;
        }
        currentMail = { from: line.match(/<(.+)>/)?.[1], to: [], dataLines: [], inData: false };
        write("250 2.1.0 OK");
        return;
      }
      if (upper.startsWith("RCPT TO:")) {
        currentMail.to.push(line.match(/<(.+)>/)?.[1]);
        write("250 2.1.5 OK");
        return;
      }
      if (upper === "DATA") {
        currentMail.inData = true;
        write("354 Start mail input; end with <CRLF>.<CRLF>");
        return;
      }
      if (upper === "QUIT") {
        write("221 2.0.0 Bye");
        socket.end();
        return;
      }
      write("500 5.5.1 Unrecognized command");
    }

    const onData = (chunk) => {
      if (upgraded) return;
      buf += chunk.toString("utf8");
      let idx;
      while ((idx = buf.indexOf("\r\n")) !== -1) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        handleLine(line);
        if (upgraded) break;
      }

      if (upgraded) {
        socket.removeListener("data", onData);
        const secureSocket = new tls.TLSSocket(socket, { isServer: true, cert, key });
        secureSocket.on("secureConnect", () => {});
        secureSocket.on("secure", () => {
          handleConnection(secureSocket, true, false);
        });
      }
    };

    socket.on("data", onData);
  }

  const server = net.createServer((socket) => handleConnection(socket, false));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  return {
    server,
    port,
    receivedMail,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
