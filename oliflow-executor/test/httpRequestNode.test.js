import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { runHttpRequestNode } from "../server/handlers/httpRequestNode.js";
import { buildBaseContext } from "../server/templateEngine.js";

// A tiny real HTTP server this test hits for real, to prove
// runHttpRequestNode() genuinely makes an outbound request rather than
// simulating one.
let server;
let baseUrl;

test.before(async () => {
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ method: req.method, path: req.url, receivedBody: raw, gotAuthHeader: req.headers.authorization || null }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => new Promise((resolve) => server.close(resolve)));

// These two tests legitimately need to reach the local test server at
// 127.0.0.1, which the SSRF guard now correctly blocks by default (see
// the dedicated SSRF-guard tests below, which confirm that's the right
// default) — so they explicitly opt in via the same escape hatch a real
// user would use to intentionally call an internal service.
test("makes a real GET request and returns the real response", async () => {
  process.env.OLIFLOW_ALLOW_PRIVATE_NETWORK_REQUESTS = "1";
  try {
    const ctx = buildBaseContext({});
    const result = await runHttpRequestNode({ method: "GET", url: `${baseUrl}/test-path` }, ctx);
    assert.equal(result.ok, true);
    assert.equal(result.statusCode, 200);
    const parsed = JSON.parse(result.body);
    assert.equal(parsed.method, "GET");
    assert.equal(parsed.path, "/test-path");
  } finally {
    delete process.env.OLIFLOW_ALLOW_PRIVATE_NETWORK_REQUESTS;
  }
});

test("makes a real POST request with a JSON body and headers, both template-resolved", async () => {
  process.env.OLIFLOW_ALLOW_PRIVATE_NETWORK_REQUESTS = "1";
  try {
    const ctx = buildBaseContext({ vars: { token: "secret-abc" } });
    const result = await runHttpRequestNode(
      {
        method: "POST",
        url: baseUrl,
        headers: '{"Authorization":"Bearer {{vars.token}}"}',
        body: '{"hello":"world"}',
      },
      ctx
    );
    assert.equal(result.ok, true);
    const parsed = JSON.parse(result.body);
    assert.equal(parsed.gotAuthHeader, "Bearer secret-abc");
    assert.deepEqual(JSON.parse(parsed.receivedBody), { hello: "world" });
  } finally {
    delete process.env.OLIFLOW_ALLOW_PRIVATE_NETWORK_REQUESTS;
  }
});

test("rejects an invalid URL with a clear error, doesn't throw", async () => {
  const ctx = buildBaseContext({});
  const result = await runHttpRequestNode({ method: "GET", url: "not a url at all" }, ctx);
  assert.equal(result.ok, false);
  assert.match(result.error, /not a valid URL/);
});

test("blocks requests to localhost/private addresses by default (SSRF guard)", async () => {
  const ctx = buildBaseContext({});
  const result = await runHttpRequestNode({ method: "GET", url: "http://169.254.169.254/latest/meta-data" }, ctx);
  assert.equal(result.ok, false);
  assert.match(result.error, /private\/internal/);

  const result2 = await runHttpRequestNode({ method: "GET", url: "http://localhost:9999/" }, ctx);
  assert.equal(result2.ok, false);
});

test("still allows localhost when the escape hatch env var is set", async () => {
  process.env.OLIFLOW_ALLOW_PRIVATE_NETWORK_REQUESTS = "1";
  try {
    const ctx = buildBaseContext({});
    const result = await runHttpRequestNode({ method: "GET", url: baseUrl }, ctx);
    assert.equal(result.ok, true);
  } finally {
    delete process.env.OLIFLOW_ALLOW_PRIVATE_NETWORK_REQUESTS;
  }
});

test("reports a malformed headers JSON field clearly instead of crashing", async () => {
  const ctx = buildBaseContext({});
  process.env.OLIFLOW_ALLOW_PRIVATE_NETWORK_REQUESTS = "1";
  try {
    const result = await runHttpRequestNode({ method: "GET", url: baseUrl, headers: "{not valid json" }, ctx);
    assert.equal(result.ok, false);
    assert.match(result.error, /not valid JSON/);
  } finally {
    delete process.env.OLIFLOW_ALLOW_PRIVATE_NETWORK_REQUESTS;
  }
});
