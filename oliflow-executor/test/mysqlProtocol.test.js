/**
 * Tests mysqlProtocol.js against a real minimal MySQL-wire-protocol
 * server (hand-rolled here), same rationale as postgresProtocol.test.js —
 * proving the client speaks the real byte-level handshake + COM_QUERY
 * protocol, not just that it doesn't throw.
 */
import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import crypto from "node:crypto";
import { runMysqlQuery } from "../server/handlers/mysqlProtocol.js";

function mysqlPacket(payload, seq) {
  const header = Buffer.alloc(4);
  header.writeUIntLE(payload.length, 0, 3);
  header.writeUInt8(seq & 0xff, 3);
  return Buffer.concat([header, payload]);
}

function lengthEncodedString(str) {
  // Only need to support short strings for this fake server.
  return Buffer.concat([Buffer.from([Buffer.byteLength(str)]), Buffer.from(str, "utf8")]);
}

function startFakeMysql({ rows, columns }) {
  const scramble = crypto.randomBytes(20);
  const server = net.createServer((socket) => {
    let stage = "handshake";

    // Initial Handshake packet: protocol version(1)=10, server version\0,
    // connection id(4), scramble part1(8), filler(1)=0, capability_flags_1(2),
    // charset(1), status(2), capability_flags_2(2), auth_plugin_data_len(1),
    // reserved(10), scramble part2(rest, NUL-terminated), auth plugin name\0.
    const versionStr = Buffer.concat([Buffer.from("8.0.0-fake", "utf8"), Buffer.from([0])]);
    const part1 = scramble.subarray(0, 8);
    const part2 = Buffer.concat([scramble.subarray(8, 20), Buffer.from([0])]); // 12 bytes + NUL = 13
    const handshake = Buffer.concat([
      Buffer.from([10]),
      versionStr,
      Buffer.from([1, 0, 0, 0]), // connection id
      part1,
      Buffer.from([0]), // filler
      Buffer.from([0xff, 0xf7]), // capability flags lower 2 bytes (arbitrary non-zero)
      Buffer.from([33]), // charset
      Buffer.from([2, 0]), // status flags
      Buffer.from([0x00, 0x00]), // capability flags upper 2 bytes (keep CLIENT_PLUGIN_AUTH bit pattern simple)
      Buffer.from([21]), // auth_plugin_data_len
      Buffer.alloc(10), // reserved
      part2,
      Buffer.concat([Buffer.from("mysql_native_password", "utf8"), Buffer.from([0])]),
    ]);
    socket.write(mysqlPacket(handshake, 0));

    socket.on("data", () => {
      if (stage === "handshake") {
        stage = "authed";
        // OK packet: 0x00, affected_rows(1)=0, last_insert_id(1)=0, status(2), warnings(2)
        socket.write(mysqlPacket(Buffer.from([0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00]), 2));
        return;
      }
      // COM_QUERY received -> respond with a real result set.
      const colCountPacket = Buffer.from([columns.length]);
      socket.write(mysqlPacket(colCountPacket, 3));
      let seq = 4;
      for (const name of columns) {
        // Minimal column definition: catalog, schema, table, org_table, name, org_name...
        // Client only reads name (5th length-encoded string) — pad the rest with empty strings.
        const colDef = Buffer.concat([
          lengthEncodedString("def"),
          lengthEncodedString(""),
          lengthEncodedString(""),
          lengthEncodedString(""),
          lengthEncodedString(name),
        ]);
        socket.write(mysqlPacket(colDef, seq++));
      }
      // EOF after column defs.
      socket.write(mysqlPacket(Buffer.from([0xfe, 0x00, 0x00, 0x02, 0x00]), seq++));
      for (const row of rows) {
        const rowPayload = Buffer.concat(columns.map((c) => lengthEncodedString(String(row[c]))));
        socket.write(mysqlPacket(rowPayload, seq++));
      }
      // Final EOF ends the result set.
      socket.write(mysqlPacket(Buffer.from([0xfe, 0x00, 0x00, 0x02, 0x00]), seq++));
    });
  });
  return new Promise((resolve) => server.listen(0, () => resolve(server)));
}

test("runMysqlQuery: real handshake + COM_QUERY round-trip returns real rows", async () => {
  const server = await startFakeMysql({ columns: ["id", "name"], rows: [{ id: "1", name: "Ana" }, { id: "2", name: "Bo" }] });
  const port = server.address().port;
  try {
    const result = await runMysqlQuery({ host: "127.0.0.1", port, user: "test", password: "pw", database: "testdb", query: "SELECT id, name FROM people" });
    assert.equal(result.ok, true);
    assert.equal(result.rowCount, 2);
    assert.deepEqual(result.rows, [{ id: "1", name: "Ana" }, { id: "2", name: "Bo" }]);
  } finally {
    server.close();
  }
});

test("runMysqlQuery: rejects with a clear error when required fields are missing", async () => {
  const result = await runMysqlQuery({ host: "", user: "u", query: "SELECT 1" });
  assert.equal(result.ok, false);
  assert.match(result.error, /host is required/);
});
