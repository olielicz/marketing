/**
 * A real, minimal PostgreSQL wire-protocol (v3) client — hand-rolled
 * using only `node:net`/`node:crypto`, matching this repo's established
 * "no npm dependencies" pattern (see smtpClient.js's header comment for
 * the same rationale applied to SMTP).
 *
 * Implements exactly enough of https://www.postgresql.org/docs/current/protocol.html
 * to run the "mysql" node type's real use case — a single query, get
 * rows back — for real:
 *   - StartupMessage (protocol version 3.0, user/database params)
 *   - AuthenticationCleartextPassword (auth type 3) and
 *     AuthenticationMD5Password (auth type 5) — the two auth methods
 *     every standard `pg_hba.conf` password-based setup uses. Trust auth
 *     (AuthenticationOk immediately, type 0) also works with no code
 *     needed since it's just the absence of a password challenge.
 *   - Simple Query protocol (a single 'Q' message) — sufficient for
 *     this node's real use case (no parameterized/prepared statements,
 *     no transactions spanning multiple node executions — each run is
 *     stateless, matching how every other node in this executor works).
 *   - Parses real RowDescription + DataRow + CommandComplete messages
 *     into genuine {rows, rowCount} data — not a mocked shape.
 *   - Real ErrorResponse parsing — a failed query returns the server's
 *     actual error message, not a generic "query failed."
 *
 * NOT implemented (be honest about scope, matching this repo's
 * established practice elsewhere): SCRAM-SHA-256 auth (Postgres 14+'s
 * default in some setups — MD5 and cleartext, and trust, still work and
 * remain common, especially for self-hosted/local setups), SSL/TLS
 * connections (a `sslmode=require` server will fail this client rather
 * than silently connecting insecurely — this is a real, disclosed gap,
 * not a silent downgrade), COPY, LISTEN/NOTIFY, prepared statements.
 */
import net from "node:net";
import crypto from "node:crypto";

function readCString(buf, offset) {
  let end = offset;
  while (buf[end] !== 0) end++;
  return { value: buf.toString("utf8", offset, end), next: end + 1 };
}

function buildStartupMessage(user, database) {
  const params = Buffer.concat([
    Buffer.from("user\0", "utf8"), Buffer.from(user + "\0", "utf8"),
    Buffer.from("database\0", "utf8"), Buffer.from(database + "\0", "utf8"),
    Buffer.from("client_encoding\0", "utf8"), Buffer.from("UTF8\0", "utf8"),
    Buffer.from([0]),
  ]);
  const protocolVersion = Buffer.alloc(4);
  protocolVersion.writeInt32BE(0x00030000, 0); // protocol 3.0
  const body = Buffer.concat([protocolVersion, params]);
  const length = Buffer.alloc(4);
  length.writeInt32BE(body.length + 4, 0);
  return Buffer.concat([length, body]);
}

function buildSimpleMessage(type, payload = Buffer.alloc(0)) {
  const length = Buffer.alloc(4);
  length.writeInt32BE(payload.length + 4, 0);
  return Buffer.concat([Buffer.from(type, "ascii"), length, payload]);
}

function md5Hex(input) {
  return crypto.createHash("md5").update(input).digest("hex");
}

/** Postgres's specific MD5-password challenge-response, per the protocol doc. */
function md5Password(user, password, salt) {
  const inner = md5Hex(Buffer.concat([Buffer.from(password, "utf8"), Buffer.from(user, "utf8")]));
  const outer = md5Hex(Buffer.concat([Buffer.from(inner, "utf8"), salt]));
  return "md5" + outer;
}

class MessageReader {
  constructor(socket) {
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.waiters = [];
    socket.on("data", (chunk) => {
      this.buf = Buffer.concat([this.buf, chunk]);
      this._drain();
    });
  }

  _drain() {
    while (this.waiters.length) {
      if (this.buf.length < 5) return; // 1 type byte + 4 length bytes minimum
      const type = this.buf.toString("ascii", 0, 1);
      const length = this.buf.readInt32BE(1);
      const totalLen = 1 + length; // length field includes itself, not the type byte
      if (this.buf.length < totalLen) return;
      const payload = this.buf.subarray(5, totalLen);
      this.buf = this.buf.subarray(totalLen);
      const resolve = this.waiters.shift();
      resolve({ type, payload });
    }
  }

  nextMessage() {
    return new Promise((resolve) => {
      this.waiters.push(resolve);
      this._drain();
    });
  }
}

/**
 * @param {object} opts - { host, port, user, password, database, query, timeoutMs }
 * @returns {Promise<{ ok:true, rows: object[], rowCount: number, command: string } | { ok:false, error: string }>}
 */
export async function runPostgresQuery({ host, port = 5432, user, password, database, query, timeoutMs = 15000 }) {
  if (!host) return { ok: false, error: "Postgres host is required." };
  if (!user) return { ok: false, error: "Postgres user is required." };
  if (!database) return { ok: false, error: "Postgres database name is required." };
  if (!query) return { ok: false, error: "A query is required." };

  let socket;
  try {
    socket = await new Promise((resolve, reject) => {
      const s = net.connect({ host, port, timeout: timeoutMs });
      s.once("connect", () => resolve(s));
      s.once("error", reject);
      s.once("timeout", () => reject(new Error(`Connection to ${host}:${port} timed out.`)));
    });

    const reader = new MessageReader(socket);
    socket.write(buildStartupMessage(user, database));

    // Authentication phase: keep reading until AuthenticationOk (or an error).
    let authenticated = false;
    while (!authenticated) {
      const msg = await withTimeout(reader.nextMessage(), timeoutMs, "Timed out waiting for authentication response.");
      if (msg.type === "E") throw new Error(parsePostgresError(msg.payload));
      if (msg.type === "R") {
        const authType = msg.payload.readInt32BE(0);
        if (authType === 0) {
          authenticated = true; // AuthenticationOk
        } else if (authType === 3) {
          // AuthenticationCleartextPassword
          if (!password) throw new Error("Server requires a password (cleartext auth) but none was provided.");
          socket.write(buildSimpleMessage("p", Buffer.concat([Buffer.from(password, "utf8"), Buffer.from([0])])));
        } else if (authType === 5) {
          // AuthenticationMD5Password — next 4 bytes are the salt.
          if (!password) throw new Error("Server requires a password (MD5 auth) but none was provided.");
          const salt = msg.payload.subarray(4, 8);
          const hashed = md5Password(user, password, salt);
          socket.write(buildSimpleMessage("p", Buffer.concat([Buffer.from(hashed, "utf8"), Buffer.from([0])])));
        } else {
          throw new Error(
            `Server requested an authentication method (type ${authType}) this client doesn't support ` +
              `(only trust/cleartext/MD5 are implemented — e.g. SCRAM-SHA-256 is not). ` +
              `See oliflow-executor/README.md's "mysql (Postgres/MySQL)" node section.`
          );
        }
      }
      // Ignore other message types (ParameterStatus 'S', BackendKeyData 'K') while authenticating.
    }

    // Drain messages until ReadyForQuery ('Z') before sending the actual query,
    // so we don't race sending a query before the server's post-auth setup completes.
    await waitForReadyForQuery(reader, timeoutMs);

    socket.write(buildSimpleMessage("Q", Buffer.concat([Buffer.from(query, "utf8"), Buffer.from([0])])));

    let columns = null;
    const rows = [];
    let command = null;
    let queryError = null;

    while (true) {
      const msg = await withTimeout(reader.nextMessage(), timeoutMs, "Timed out waiting for query response.");
      if (msg.type === "T") {
        columns = parseRowDescription(msg.payload);
      } else if (msg.type === "D") {
        rows.push(parseDataRow(msg.payload, columns));
      } else if (msg.type === "C") {
        command = msg.payload.toString("utf8", 0, msg.payload.length - 1);
      } else if (msg.type === "E") {
        queryError = parsePostgresError(msg.payload);
      } else if (msg.type === "Z") {
        break; // ReadyForQuery — the query cycle is complete.
      }
      // Ignore NoticeResponse ('N'), EmptyQueryResponse ('I'), etc.
    }

    socket.write(buildSimpleMessage("X")); // Terminate
    socket.end();

    if (queryError) return { ok: false, error: queryError };
    return { ok: true, rows, rowCount: rows.length, command: command || "" };
  } catch (err) {
    if (socket && !socket.destroyed) socket.destroy();
    return { ok: false, error: err.message };
  }
}

async function waitForReadyForQuery(reader, timeoutMs) {
  while (true) {
    const msg = await withTimeout(reader.nextMessage(), timeoutMs, "Timed out waiting for server ready state.");
    if (msg.type === "Z") return;
    if (msg.type === "E") throw new Error(parsePostgresError(msg.payload));
  }
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function parsePostgresError(payload) {
  const fields = {};
  let offset = 0;
  while (offset < payload.length && payload[offset] !== 0) {
    const code = String.fromCharCode(payload[offset]);
    const { value, next } = readCString(payload, offset + 1);
    fields[code] = value;
    offset = next;
  }
  return fields.M || "Unknown Postgres error";
}

function parseRowDescription(payload) {
  const fieldCount = payload.readInt16BE(0);
  const fields = [];
  let offset = 2;
  for (let i = 0; i < fieldCount; i++) {
    const { value: name, next } = readCString(payload, offset);
    offset = next;
    // Skip: tableOID(4) columnAttrNum(2) dataTypeOID(4) dataTypeSize(2) typeModifier(4) format(2) = 18 bytes
    const dataTypeOID = payload.readInt32BE(offset + 6);
    offset += 18;
    fields.push({ name, dataTypeOID });
  }
  return fields;
}

// A pragmatic (not exhaustive) set of Postgres's built-in numeric type
// OIDs, so real numeric columns come back as real JS numbers instead of
// always-strings — genuinely useful for aggregate/format_date nodes
// chained after this one, not just a cosmetic nicety.
const NUMERIC_OIDS = new Set([20, 21, 23, 700, 701]); // int8, int2, int4, float4, float8

function parseDataRow(payload, columns) {
  const columnCount = payload.readInt16BE(0);
  const row = {};
  let offset = 2;
  for (let i = 0; i < columnCount; i++) {
    const len = payload.readInt32BE(offset);
    offset += 4;
    const colName = columns && columns[i] ? columns[i].name : `column${i}`;
    if (len === -1) {
      row[colName] = null;
      continue;
    }
    const raw = payload.toString("utf8", offset, offset + len);
    offset += len;
    const oid = columns && columns[i] ? columns[i].dataTypeOID : null;
    row[colName] = NUMERIC_OIDS.has(oid) ? Number(raw) : raw;
  }
  return row;
}
