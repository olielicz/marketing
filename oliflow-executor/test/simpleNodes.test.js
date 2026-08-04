import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runDelayNode,
  runSetFieldsNode,
  runSetVariableNode,
  runGetVariableNode,
  runLogNode,
  runRespondWebhookNode,
  runNoteNode,
} from "../server/handlers/simpleNodes.js";
import { buildBaseContext } from "../server/templateEngine.js";

test("runDelayNode waits approximately the configured number of seconds", async () => {
  const start = Date.now();
  const result = await runDelayNode({ duration: 0.05, unit: "seconds" });
  const elapsed = Date.now() - start;
  assert.equal(result.ok, true);
  assert.ok(elapsed >= 40, `expected to wait at least ~50ms, only waited ${elapsed}ms`);
});

test("runDelayNode refuses a delay longer than the sync max instead of hanging the request", async () => {
  const result = await runDelayNode({ duration: 10, unit: "days" });
  assert.equal(result.ok, false);
  assert.match(result.error, /exceeds/);
});

test("runSetFieldsNode resolves templates in a fields object", () => {
  const ctx = buildBaseContext({ trigger: { body: { name: "Jane" } } });
  const result = runSetFieldsNode({ fields: { greeting: "Hi {{trigger.body.name}}" } }, ctx);
  assert.equal(result.ok, true);
  assert.deepEqual(result.result, { greeting: "Hi Jane" });
});

test("runSetVariableNode resolves a template value and returns name+value", () => {
  const ctx = buildBaseContext({ trigger: { body: { id: 42 } } });
  const result = runSetVariableNode({ name: "orderId", value: "{{trigger.body.id}}" }, ctx);
  assert.deepEqual(result, { ok: true, name: "orderId", value: "42" });
});

test("runSetVariableNode requires a name", () => {
  const ctx = buildBaseContext({});
  const result = runSetVariableNode({ value: "x" }, ctx);
  assert.equal(result.ok, false);
});

test("runGetVariableNode reads an existing variable", () => {
  const ctx = buildBaseContext({ vars: { apiKey: "secret" } });
  const result = runGetVariableNode({ name: "apiKey" }, ctx);
  assert.deepEqual(result, { ok: true, name: "apiKey", value: "secret" });
});

test("runGetVariableNode reports a missing variable clearly", () => {
  const ctx = buildBaseContext({ vars: {} });
  const result = runGetVariableNode({ name: "doesNotExist" }, ctx);
  assert.equal(result.ok, false);
  assert.match(result.error, /not set/);
});

test("runLogNode logs to the real console and reports what it logged", () => {
  const ctx = buildBaseContext({ workflowId: "wf1", executionId: "ex1" });
  const result = runLogNode({ message: "hello {{workflow_id}}" }, ctx);
  assert.deepEqual(result, { ok: true, logged: "hello wf1" });
});

test("runRespondWebhookNode resolves templates in the body and returns a status code", () => {
  const ctx = buildBaseContext({ trigger: { body: { id: 7 } } });
  const result = runRespondWebhookNode({ statusCode: 201, body: { received: "{{trigger.body.id}}" } }, ctx);
  assert.deepEqual(result, { ok: true, statusCode: 201, body: { received: "7" } });
});

test("runNoteNode is a documented no-op", () => {
  const result = runNoteNode();
  assert.equal(result.ok, true);
  assert.equal(result.skipped, true);
});
