/**
 * Tests the real $fetch capability added to the JavaScript "code" node
 * path (previously a stub that always threw — see codeNode.js's header
 * comment for the change). Reuses the exact same SSRF guard as the
 * "http_request" node.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { runCodeNode } from "../server/handlers/codeNode.js";

test("javascript $fetch: blocks a private/internal address by default", async () => {
  const result = await runCodeNode('const r = await $fetch("http://localhost:1"); return r;', {}, {});
  assert.equal(result.ok, false);
  assert.match(result.error, /private\/internal address/);
});

test("javascript $fetch: genuinely reaches a real local server when allowed", async () => {
  const server = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ hello: "world" }));
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const originalEnv = process.env.OLIFLOW_ALLOW_PRIVATE_NETWORK_REQUESTS;
  process.env.OLIFLOW_ALLOW_PRIVATE_NETWORK_REQUESTS = "1";
  try {
    const result = await runCodeNode(
      `const res = await $fetch("http://localhost:${port}/test"); return { status: res.status, body: res.body };`,
      {},
      {}
    );
    assert.equal(result.ok, true);
    assert.equal(result.result.status, 200);
    assert.match(result.result.body, /hello/);
  } finally {
    process.env.OLIFLOW_ALLOW_PRIVATE_NETWORK_REQUESTS = originalEnv;
    server.close();
  }
});

test("javascript $fetch: a real per-run call-count cap is enforced", async () => {
  const server = createServer((req, res) => res.end("ok"));
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const originalEnv = process.env.OLIFLOW_ALLOW_PRIVATE_NETWORK_REQUESTS;
  process.env.OLIFLOW_ALLOW_PRIVATE_NETWORK_REQUESTS = "1";
  try {
    const result = await runCodeNode(
      `for (let i = 0; i < 15; i++) { await $fetch("http://localhost:${port}/"); } return { done: true };`,
      {},
      {}
    );
    assert.equal(result.ok, false);
    assert.match(result.error, /call limit/);
  } finally {
    process.env.OLIFLOW_ALLOW_PRIVATE_NETWORK_REQUESTS = originalEnv;
    server.close();
  }
});

test("javascript: existing synchronous code (no $fetch) still works exactly as before", async () => {
  const result = await runCodeNode("return { x: $input.a + 1 };", { a: 5 }, {});
  assert.equal(result.ok, true);
  assert.deepEqual(result.result, { x: 6 });
});

test("javascript: a real infinite loop is still caught (sync path, unaffected by async changes)", async () => {
  const result = await runCodeNode("while(true){}", {}, {});
  assert.equal(result.ok, false);
  assert.match(result.error, /timed out/);
});
