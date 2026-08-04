import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { executeWorkflow, getExecutionOrder } from "../server/executor.js";

// Mirrors the frontend's `getNodeDef(n.type).inputs.length === 0` check
// for trigger nodes, restricted to the trigger types this executor
// actually cares about ordering from.
const isTriggerType = (type) => type === "webhook";

test("getExecutionOrder follows connections from a trigger node in the right order", () => {
  const wf = {
    nodes: [
      { id: "n1", type: "webhook" },
      { id: "n2", type: "log" },
      { id: "n3", type: "log" },
    ],
    connections: [
      { fromId: "n1", toId: "n2" },
      { fromId: "n2", toId: "n3" },
    ],
  };
  const order = getExecutionOrder(wf, isTriggerType);
  assert.deepEqual(order.map((n) => n.id), ["n1", "n2", "n3"]);
});

test("getExecutionOrder appends orphan nodes not reachable from any trigger", () => {
  const wf = {
    nodes: [
      { id: "n1", type: "webhook" },
      { id: "n2", type: "log" },
      { id: "orphan", type: "log" },
    ],
    connections: [{ fromId: "n1", toId: "n2" }],
  };
  const order = getExecutionOrder(wf, isTriggerType);
  assert.deepEqual(order.map((n) => n.id), ["n1", "n2", "orphan"]);
});

test("a full webhook -> condition -> log workflow executes real nodes end-to-end", async () => {
  const wf = {
    id: "wf1",
    nodes: [
      { id: "n1", type: "webhook", label: "Webhook Trigger" },
      { id: "n2", type: "condition", label: "Check Status", config: { field: "{{trigger.body.status}}", op: "equals", value: "active" } },
      { id: "n3", type: "log", label: "Log It", config: { message: "Status check: {{Check Status.result}}" } },
    ],
    connections: [
      { fromId: "n1", toId: "n2" },
      { fromId: "n2", toId: "n3" },
    ],
  };

  const result = await executeWorkflow(wf, {
    triggerPayload: { status: "active" },
    vars: {},
    isTriggerType,
    executionId: "ex1",
  });

  assert.equal(result.nodeResults.length, 3);
  assert.equal(result.nodeResults[1].result, true); // condition matched
  assert.equal(result.nodeResults[2].ok, true);
});

test("set_variable output is threaded into a later node's {{vars.X}} lookup within the same run", async () => {
  const wf = {
    id: "wf2",
    nodes: [
      { id: "n1", type: "webhook" },
      { id: "n2", type: "set_variable", config: { name: "orderId", value: "{{trigger.body.id}}" } },
      { id: "n3", type: "get_variable", config: { name: "orderId" } },
    ],
    connections: [
      { fromId: "n1", toId: "n2" },
      { fromId: "n2", toId: "n3" },
    ],
  };

  const result = await executeWorkflow(wf, { triggerPayload: { id: 555 }, vars: {}, isTriggerType, executionId: "ex2" });
  assert.equal(result.nodeResults[2].ok, true);
  assert.equal(result.nodeResults[2].value, "555");
});

test("respond_webhook's output is surfaced as respondWith on the overall result", async () => {
  const wf = {
    id: "wf3",
    nodes: [
      { id: "n1", type: "webhook" },
      { id: "n2", type: "respond_webhook", config: { statusCode: 201, body: { received: true } } },
    ],
    connections: [{ fromId: "n1", toId: "n2" }],
  };

  const result = await executeWorkflow(wf, { triggerPayload: {}, vars: {}, isTriggerType, executionId: "ex3" });
  assert.deepEqual(result.respondWith, { statusCode: 201, body: { received: true } });
});

test("an unimplemented node type (e.g. openai, slack) is reported honestly and does NOT halt execution", async () => {
  const wf = {
    id: "wf4",
    nodes: [
      { id: "n1", type: "webhook" },
      { id: "n2", type: "openai", config: { prompt: "hello" } },
      { id: "n3", type: "log", config: { message: "after openai" } },
    ],
    connections: [
      { fromId: "n1", toId: "n2" },
      { fromId: "n2", toId: "n3" },
    ],
  };

  const result = await executeWorkflow(wf, { triggerPayload: {}, vars: {}, isTriggerType, executionId: "ex4" });
  assert.equal(result.nodeResults[1].ok, false);
  assert.equal(result.nodeResults[1].notImplemented, true);
  assert.match(result.nodeResults[1].error, /not yet implemented/);
  // Execution continued past the unimplemented node to the real log node:
  assert.equal(result.nodeResults.length, 3);
  assert.equal(result.nodeResults[2].ok, true);
});

test("a real error in an IMPLEMENTED node halts execution rather than silently continuing", async () => {
  const wf = {
    id: "wf5",
    nodes: [
      { id: "n1", type: "webhook" },
      { id: "n2", type: "condition", config: { field: "not-a-number", op: "greater than", value: "5" } }, // real error: non-numeric comparison
      { id: "n3", type: "log", config: { message: "should never run" } },
    ],
    connections: [
      { fromId: "n1", toId: "n2" },
      { fromId: "n2", toId: "n3" },
    ],
  };

  const result = await executeWorkflow(wf, { triggerPayload: {}, vars: {}, isTriggerType, executionId: "ex5" });
  assert.equal(result.nodeResults.length, 2); // n3 never ran
  assert.equal(result.nodeResults[1].ok, false);
  assert.equal(result.nodeResults[1].notImplemented, undefined);
});

test("a real http_request node genuinely calls out and its response is available to a later node via {{Node.output}}", async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ echoedMethod: req.method }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  try {
    const wf = {
      id: "wf6",
      nodes: [
        { id: "n1", type: "webhook" },
        { id: "n2", type: "http_request", label: "Call API", config: { method: "GET", url: `http://127.0.0.1:${port}/` } },
        { id: "n3", type: "log", config: { message: "status was {{Call API.statusCode}}" } },
      ],
      connections: [
        { fromId: "n1", toId: "n2" },
        { fromId: "n2", toId: "n3" },
      ],
    };
    process.env.OLIFLOW_ALLOW_PRIVATE_NETWORK_REQUESTS = "1"; // this test's own local server IS localhost, intentionally
    const result = await executeWorkflow(wf, { triggerPayload: {}, vars: {}, isTriggerType, executionId: "ex6" });
    assert.equal(result.nodeResults[1].ok, true);
    // http_request's handler returns {ok, statusCode, headers, body}
    // directly (no nested "result" field) - see httpRequestNode.js.
    assert.equal(result.nodeResults[1].statusCode, 200);
    assert.equal(result.nodeResults[2].ok, true);
    assert.equal(result.nodeResults[2].logged, "status was 200");
  } finally {
    delete process.env.OLIFLOW_ALLOW_PRIVATE_NETWORK_REQUESTS;
    await new Promise((resolve) => server.close(resolve));
  }
});
