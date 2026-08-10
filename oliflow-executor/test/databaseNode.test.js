import test from "node:test";
import assert from "node:assert/strict";
import { runDatabaseNode } from "../server/handlers/databaseNode.js";
import { buildBaseContext } from "../server/templateEngine.js";

function ctx(vars) {
  return { ...buildBaseContext({ trigger: {}, vars, nodeOutputsByLabel: {} }) };
}

test("mysql node: an honest error when no db_host var is configured", async () => {
  const result = await runDatabaseNode({ engine: "postgres", query: "SELECT 1" }, ctx({}));
  assert.equal(result.ok, false);
  assert.match(result.error, /db_host/);
});

test("mysql node: an honest error when the query is empty", async () => {
  const result = await runDatabaseNode({ engine: "postgres", query: "" }, ctx({ db_host: "localhost", db_user: "u", db_database: "d" }));
  assert.equal(result.ok, false);
  assert.match(result.error, /non-empty 'query'/);
});

test("mysql node: rejects an unknown engine honestly", async () => {
  const result = await runDatabaseNode(
    { engine: "oracle", query: "SELECT 1" },
    ctx({ db_host: "localhost", db_user: "u", db_database: "d" })
  );
  assert.equal(result.ok, false);
  assert.match(result.error, /Unknown database engine/);
});

test("mysql node: respects a custom varPrefix", async () => {
  const result = await runDatabaseNode({ engine: "postgres", varPrefix: "warehouse", query: "SELECT 1" }, ctx({}));
  assert.equal(result.ok, false);
  assert.match(result.error, /warehouse_host/);
});
