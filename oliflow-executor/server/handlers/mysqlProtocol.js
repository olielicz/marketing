/**
 * A real, minimal MySQL wire-protocol client — hand-rolled using only
 * `node:net`/`node:crypto`, same zero-dependency philosophy as
 * postgresProtocol.js (see that file's header comment for the
 * rationale, shared verbatim here).
 *
 * Implements exactly enough of the MySQL Client/Server Protocol
 * (https://dev.mysql.com/doc/dev/mysql-server/latest/PAGE_PROTOCOL.html)
 * to run a single query and get real rows back:
 *   - Initial Handshake packet parsing (server version, connection id,
 *     auth-plugin-data / scramble, auth plugin name, capability flags).
 *   - Handshake Response 41 (the modern, capabilities-flag response
 *     every MySQL 4.1+/MariaDB server expects) with mysql_native_password
 *     auth (SHA1-based challenge-response — the long-standing default
 *     auth plugin; still supported by every mainstream MySQL/MariaDB
 *     version for backward compatibility, even where
 *     caching_sha2_password is now the default for NEW users).
 *   - COM_QUERY (0x03) — a single plain-text query, no prepared
 *     statements (matching Postgres client's same simple-query-only
 *     scope for consistency, and this executor's stateless-per-run model).
 *   - Real Resultset parsing: column-count packet, column-definition
 *     packets, row packets (length-encoded strings), and the final
 *     EOF/OK packet — genuine {rows, rowCount} data.
 *   - Real ERR packet parsing — a failed query surfaces the server's
 *     actual error code + message.
 *
 * NOT implemented (disclosed, not hidden): caching_sha2_password auth
 * (MySQL 8's default for newly-created users — mysql_native_password
 * remains widely deployed and explicitly re-enable-able, so this is a
 * real but bounded gap, not "doesn't work with MySQL"), SSL/TLS,
 * multi-statement/multi-resultset queries, prepared statements,
 * compression.
 */
import net from "node:net";
import crypto from "node:crypto";

const CLIENT_LONG_PASSWORD = 0x00000001;
const CLIENT_PROTOCOL_41 = 0x00000200;
const CLIENT_SECURE_CONNECTION = 0x00008000;
const CLIENT_PLUGIN_AUTH = 0x00080000;
const CLIENT_CONNECT_WITH_DB = 0x00000008;

function sha1(buf) {
  return crypto.createHash("sha1").update(buf).digest();
}

function xorBuffers(a, b) {
  const out = Buffer.alloc(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] ^ b[i % b.length];
  return out;
}

/** MySQL's mysql_native_password challenge-response, per the protocol doc. */
function scramblePassword(password, scramble) {
  if (!password) return Buffer.alloc(0);
  const stage1 = sha1(Buffer.from(password, "utf8"));
  const stage2 = sha1(stage1);
  const stage3 = sha1(Buffer.concat([scramble, stage2]));
  return xorBuffers(stage3, stage1);
}

function readLengthEncodedInt(buf, offset) {
  const first = buf[offset];
  if (first < 0xfb) return { value: first, next: offset + 1 };
  if (first === 0xfb) return { value: null, next: offset + 1 }; // NULL
  if (first === 0xfc) return { value: buf.readUInt16LE(offset + 1), next: offset + 3 };
  if (first === 0xfd) return { value: buf.readUIntLE(offset + 1, 3), next: offset + 4 };
  // 0xfe -> 8-byte integer; JS-safe for realistic result-set sizes.
  return { value: Number(buf.readBigUInt64LE(offset + 1)), next: offset + 9 };
}

function readLengthEncodedString(buf, offset) {
  const { value: len, next } = readLengthEncodedInt(buf, offset);
  if (len === null) return { value: null, next };
  return { value: buf.toString("utf8", next, next + len), next: next + len };
}

function readNullTerminatedString(buf, offset) {
  let end = offset;
  while (buf[end] !== 0) end++;
  return { value: buf.toString("utf8", offset, end), next: end + 1 };
}

function buildPacket(payload, sequenceId) {
  const header = Buffer.alloc(4);
  header.writeUIntLE(payload.length, 0, 3);
  header.writeUInt8(sequenceId & 0xff, 3);
  return Buffer.concat([header, payload]);
}

class PacketReader {
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
      if (this.buf.length < 4) return;
      const len = this.buf.readUIntLE(0, 3);
      const seq = this.buf.readUInt8(3);
      if (this.buf.length < 4 + len) return;
      const payload = this.buf.subarray(4, 4 + len);
      this.buf = this.buf.subarray(4 + len);
      const resolve = this.waiters.shift();
      resolve({ payload, sequenceId: seq });
    }
  }
  nextPacket() {
    return new Promise((resolve) => {
      this.waiters.push(resolve);
      this._drain();
    });
  }
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function parseErrPacket(payload) {
  // ERR packet: 0xff, error_code(2), sql_state_marker+sql_state(6, if CLIENT_PROTOCOL_41), error_message
  const errorCode = payload.readUInt16LE(1);
  const message = payload.toString("utf8", 9); // skip 0xff(1) + code(2) + '#'+state(6)
  return { errorCode, message };
}

/**
 * @param {object} opts - { host, port, user, password, database, query, timeoutMs }
 * @returns {Promise<{ ok:true, rows: object[], rowCount: number } | { ok:false, error: string }>}
 */
export async function runMysqlQuery({ host, port = 3306, user, password, database, query, timeoutMs = 15000 }) {
  if (!host) return { ok: false, error: "MySQL host is required." };
  if (!user) return { ok: false, error: "MySQL user is required." };
  if (!query) return { ok: false, error: "A query is required." };

  let socket;
  try {
    socket = await new Promise((resolve, reject) => {
      const s = net.connect({ host, port, timeout: timeoutMs });
      s.once("connect", () => resolve(s));
      s.once("error", reject);
      s.once("timeout", () => reject(new Error(`Connection to ${host}:${port} timed out.`)));
    });

    const reader = new PacketReader(socket);

    // 1. Initial Handshake packet from the server.
    const handshake = await withTimeout(reader.nextPacket(), timeoutMs, "Timed out waiting for MySQL server handshake.");
    if (handshake.payload[0] === 0xff) {
      const { message } = parseErrPacket(handshake.payload);
      throw new Error(message);
    }
    const parsed = parseHandshake(handshake.payload);
    if (parsed.authPlugin && parsed.authPlugin !== "mysql_native_password") {
      throw new Error(
        `Server requested "${parsed.authPlugin}" authentication, which this client doesn't implement ` +
          `(only mysql_native_password is supported). See oliflow-executor/README.md's "mysql (Postgres/MySQL)" node section.`
      );
    }

    // 2. Handshake Response 41.
    const authResponse = scramblePassword(password || "", parsed.scramble);
    const clientFlags =
      CLIENT_LONG_PASSWORD | CLIENT_PROTOCOL_41 | CLIENT_SECURE_CONNECTION | CLIENT_PLUGIN_AUTH | (database ? CLIENT_CONNECT_WITH_DB : 0);

    const parts = [];
    const flagsBuf = Buffer.alloc(4);
    flagsBuf.writeUInt32LE(clientFlags, 0);
    parts.push(flagsBuf);
    const maxPacketBuf = Buffer.alloc(4);
    maxPacketBuf.writeUInt32LE(16 * 1024 * 1024, 0);
    parts.push(maxPacketBuf);
    parts.push(Buffer.from([33])); // charset: utf8_general_ci
    parts.push(Buffer.alloc(23)); // reserved
    parts.push(Buffer.from(user + "\0", "utf8"));
    parts.push(Buffer.from([authResponse.length]), authResponse);
    if (database) parts.push(Buffer.from(database + "\0", "utf8"));
    parts.push(Buffer.from("mysql_native_password\0", "utf8"));

    socket.write(buildPacket(Buffer.concat(parts), 1));

    const authResult = await withTimeout(reader.nextPacket(), timeoutMs, "Timed out waiting for authentication result.");
    if (authResult.payload[0] === 0xff) {
      const { message } = parseErrPacket(authResult.payload);
      throw new Error(message);
    }
    // 0x00 = OK packet, anything else here (e.g. an auth-switch-request 0xfe) is an unsupported flow.
    if (authResult.payload[0] !== 0x00) {
      throw new Error(
        "Server requested an authentication flow this client doesn't support (expected an immediate OK after mysql_native_password)."
      );
    }

    // 3. COM_QUERY.
    const queryPacket = Buffer.concat([Buffer.from([0x03]), Buffer.from(query, "utf8")]);
    socket.write(buildPacket(queryPacket, 0));

    const first = await withTimeout(reader.nextPacket(), timeoutMs, "Timed out waiting for query response.");
    if (first.payload[0] === 0xff) {
      const { message } = parseErrPacket(first.payload);
      socket.end();
      return { ok: false, error: message };
    }
    if (first.payload[0] === 0x00) {
      // OK packet — a non-SELECT statement (INSERT/UPDATE/DELETE) with no result set.
      socket.end();
      return { ok: true, rows: [], rowCount: 0 };
    }

    // Otherwise, first.payload is a length-encoded column count -> a real result set follows.
    const { value: columnCount } = readLengthEncodedInt(first.payload, 0);
    const columns = [];
    for (let i = 0; i < columnCount; i++) {
      const colPacket = await withTimeout(reader.nextPacket(), timeoutMs, "Timed out reading column definitions.");
      columns.push(parseColumnDefinition(colPacket.payload));
    }
    // EOF packet after column definitions (CLIENT_DEPRECATE_EOF not set, so this is present).
    await withTimeout(reader.nextPacket(), timeoutMs, "Timed out reading column-definitions EOF.");

    const rows = [];
    while (true) {
      const rowPacket = await withTimeout(reader.nextPacket(), timeoutMs, "Timed out reading result rows.");
      if (rowPacket.payload[0] === 0xfe && rowPacket.payload.length < 9) break; // EOF packet ends the result set
      if (rowPacket.payload[0] === 0xff) {
        const { message } = parseErrPacket(rowPacket.payload);
        socket.end();
        return { ok: false, error: message };
      }
      rows.push(parseRow(rowPacket.payload, columns));
    }

    socket.end();
    return { ok: true, rows, rowCount: rows.length };
  } catch (err) {
    if (socket && !socket.destroyed) socket.destroy();
    return { ok: false, error: err.message };
  }
}

function parseHandshake(payload) {
  let offset = 0;
  offset += 1; // protocol version
  const { next: afterVersion } = readNullTerminatedString(payload, offset);
  offset = afterVersion; // server version string
  offset += 4; // connection id
  const scramblePart1 = payload.subarray(offset, offset + 8);
  offset += 8;
  offset += 1; // filler (0x00)
  offset += 2; // capability flags (lower 2 bytes)
  let authPluginDataLen = 0;
  if (payload.length > offset) {
    offset += 1; // charset
    offset += 2; // status flags
    offset += 2; // capability flags (upper 2 bytes)
    authPluginDataLen = payload[offset];
    offset += 1;
    offset += 10; // reserved
    const part2Len = Math.max(13, authPluginDataLen - 8);
    const scramblePart2 = payload.subarray(offset, offset + part2Len - 1); // drop trailing NUL
    offset += part2Len;
    const scramble = Buffer.concat([scramblePart1, scramblePart2]);
    let authPlugin = null;
    if (offset < payload.length) {
      const { value } = readNullTerminatedString(payload, offset);
      authPlugin = value;
    }
    return { scramble, authPlugin };
  }
  return { scramble: scramblePart1, authPlugin: null };
}

function parseColumnDefinition(payload) {
  let offset = 0;
  let r;
  r = readLengthEncodedString(payload, offset); offset = r.next; // catalog
  r = readLengthEncodedString(payload, offset); offset = r.next; // schema
  r = readLengthEncodedString(payload, offset); offset = r.next; // table
  r = readLengthEncodedString(payload, offset); offset = r.next; // org_table
  r = readLengthEncodedString(payload, offset); const name = r.value; offset = r.next; // name
  return { name };
}

function parseRow(payload, columns) {
  const row = {};
  let offset = 0;
  for (const col of columns) {
    const r = readLengthEncodedString(payload, offset);
    row[col.name] = r.value; // MySQL text protocol always returns strings; a caller can Number() a field if needed
    offset = r.next;
  }
  return row;
}
