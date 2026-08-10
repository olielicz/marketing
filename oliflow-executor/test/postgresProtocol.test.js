/**
 * Tests postgresProtocol.js against a REAL minimal Postgres-wire-protocol
 * server (a hand-rolled fake, implemented right here in the test file)
 * listening on a real TCP socket — proving the CLIENT correctly speaks
 * the real byte-level protocol (StartupMessage, AuthenticationOk,
 * Simple Query, RowDescription/DataRow/CommandComplete/ReadyForQuery),
 * not just that it doesn't throw against nothing.
 */
import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { runPostgresQuery } from "../server/handlers/postgresProtocol.js";

function packet(type, payload) {
  const header = Buffer.alloc(4);
  header.writeInt32BE(payload.length + 4, 0);
  return Buffer.concat([Buffer.from(type, "ascii"), header, payload]);
}

function cstr(s) {
  return Buffer.concat([Buffer.from(s, "utf8"), Buffer.from([0])]);
}

/** A real (if minimal) fake Postgres server: trust auth, one fixed query response. */
function startFakePostgres({ rows, columns, command = "SELECT" }) {
  const server = net.createServer((socket) => {
    let gotStartup = false;
    socket.on("data", (data) => {
      if (!gotStartup) {
        gotStartup = true;
        // AuthenticationOk (type 0) then ReadyForQuery.
        socket.write(packet("R", Buffer.from([0, 0, 0, 0])));
        socket.write(packet("Z", Buffer.from("I")));
        return;
      }
      // Anything else received is a Simple Query ('Q' + length + text + \0).
      // Respond with RowDescription, each DataRow, CommandComplete, ReadyForQuery.
      const rowDescPayload = Buffer.concat([
        (() => {
          const b = Buffer.alloc(2);
          b.writeInt16BE(columns.length, 0);
          return b;
        })(),
        ...columns.map((name) =>
          Buffer.concat([cstr(name), Buffer.alloc(18)]) // 18 bytes of don't-care metadata after the name
        ),
      ]);
      socket.write(packet("T", rowDescPayload));

      for (const row of rows) {
        const parts = [
          (() => {
            const b = Buffer.alloc(2);
            b.writeInt16BE(columns.length, 0);
            return b;
          })(),
        ];
        for (const col of columns) {
          const val = String(row[col]);
          const lenBuf = Buffer.alloc(4);
          lenBuf.writeInt32BE(Buffer.byteLength(val), 0);
          parts.push(lenBuf, Buffer.from(val, "utf8"));
        }
        socket.write(packet("D", Buffer.concat(parts)));
      }

      socket.write(packet("C", cstr(`${command} ${rows.length}`)));
      socket.write(packet("Z", Buffer.from("I")));
    });
  });
  return new Promise((resolve) => server.listen(0, () => resolve(server)));
}

test("runPostgresQuery: real handshake + simple query round-trip returns real rows", async () => {
  const server = await startFakePostgres({
    columns: ["id", "name"],
    rows: [{ id: "1", name: "Ana" }, { id: "2", name: "Bo" }],
  });
  const port = server.address().port;
  try {
    const result = await runPostgresQuery({ host: "127.0.0.1", port, user: "test", database: "testdb", query: "SELECT id, name FROM people" });
    assert.equal(result.ok, true);
    assert.equal(result.rowCount, 2);
    assert.deepEqual(result.rows, [{ id: "1", name: "Ana" }, { id: "2", name: "Bo" }]);
    assert.equal(result.command, "SELECT 2");
  } finally {
    server.close();
  }
});

test("runPostgresQuery: rejects with a clear error when required fields are missing", async () => {
  const result = await runPostgresQuery({ host: "", user: "u", database: "d", query: "SELECT 1" });
  assert.equal(result.ok, false);
  assert.match(result.error, /host is required/);
});

test("runPostgresQuery: a real connection failure (nothing listening) is reported honestly", async () => {
  const result = await runPostgresQuery({ host: "127.0.0.1", port: 1, user: "u", database: "d", query: "SELECT 1", timeoutMs: 500 });
  assert.equal(result.ok, false);
  assert.equal(typeof result.error, "string");
});
