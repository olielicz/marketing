/**
 * Tests the real Python execution path added to the "code" node
 * (server/handlers/codeNode.js's runPython()) — a genuine child
 * `python3` process, not JavaScript pretending to be Python. Skipped
 * entirely if python3 isn't installed on the machine running these
 * tests, since this feature has an honest, disclosed hard dependency on
 * a real Python 3 interpreter being present on the server (see
 * README.md's "Code node" section).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { createServer } from "node:http";
import { runCodeNode } from "../server/handlers/codeNode.js";

let pythonAvailable = true;
try {
  execSync("python3 --version", { stdio: "ignore" });
} catch {
  pythonAvailable = false;
}

const maybeTest = pythonAvailable ? test : test.skip;

maybeTest("python: runs real code and returns a real result", async () => {
  const result = await runCodeNode('return {"x": input["a"] + vars["b"]}', { a: 5 }, { b: 7 }, "python");
  assert.equal(result.ok, true);
  assert.deepEqual(result.result, { x: 12 });
});

maybeTest("python: a real syntax/name error is surfaced honestly", async () => {
  const result = await runCodeNode("this is not python", {}, {}, "python");
  assert.equal(result.ok, false);
  assert.match(result.error, /NameError|SyntaxError/);
});

maybeTest("python: a real infinite loop is genuinely killed by the timeout", async () => {
  const start = Date.now();
  const result = await runCodeNode("while True:\n    pass", {}, {}, "python");
  const elapsed = Date.now() - start;
  assert.equal(result.ok, false);
  assert.match(result.error, /timed out/);
  // Real timeout enforcement, not instant — proves the process actually
  // ran until killed rather than the check being a no-op.
  assert.ok(elapsed > 1000, `expected a real multi-second wait, got ${elapsed}ms`);
});

maybeTest("python: fetch() is real and blocks private/internal addresses by default", async () => {
  const result = await runCodeNode('fetch("http://localhost:1")\nreturn {}', {}, {}, "python");
  assert.equal(result.ok, false);
  assert.match(result.error, /private\/internal address/);
});

maybeTest("python: fetch() genuinely reaches a real local server when allowed", async () => {
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
      `res = fetch("http://localhost:${port}/test")\nreturn {"status": res["status"], "body": res["body"]}`,
      {},
      {},
      "python"
    );
    assert.equal(result.ok, true);
    assert.equal(result.result.status, 200);
    assert.match(result.result.body, /hello/);
  } finally {
    process.env.OLIFLOW_ALLOW_PRIVATE_NETWORK_REQUESTS = originalEnv;
    server.close();
  }
});

maybeTest("python: an unknown language falls through to an honest error", async () => {
  const result = await runCodeNode("code", {}, {}, "ruby");
  assert.equal(result.ok, false);
  assert.match(result.error, /Unknown Code node language/);
});
