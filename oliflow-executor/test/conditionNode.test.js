import { test } from "node:test";
import assert from "node:assert/strict";
import { runConditionNode } from "../server/handlers/conditionNode.js";
import { buildBaseContext } from "../server/templateEngine.js";

test("equals operator", () => {
  const ctx = buildBaseContext({ trigger: { body: { status: "active" } } });
  assert.equal(runConditionNode({ field: "{{trigger.body.status}}", op: "equals", value: "active" }, ctx).result, true);
  assert.equal(runConditionNode({ field: "{{trigger.body.status}}", op: "equals", value: "inactive" }, ctx).result, false);
});

test("not equals operator", () => {
  const ctx = buildBaseContext({ trigger: { body: { status: "active" } } });
  assert.equal(runConditionNode({ field: "{{trigger.body.status}}", op: "not equals", value: "inactive" }, ctx).result, true);
});

test("contains operator", () => {
  const ctx = buildBaseContext({ trigger: { body: { text: "hello world" } } });
  assert.equal(runConditionNode({ field: "{{trigger.body.text}}", op: "contains", value: "world" }, ctx).result, true);
  assert.equal(runConditionNode({ field: "{{trigger.body.text}}", op: "contains", value: "xyz" }, ctx).result, false);
});

test("greater than / less than operators with numeric coercion", () => {
  const ctx = buildBaseContext({ trigger: { body: { amount: 100 } } });
  assert.equal(runConditionNode({ field: "{{trigger.body.amount}}", op: "greater than", value: "50" }, ctx).result, true);
  assert.equal(runConditionNode({ field: "{{trigger.body.amount}}", op: "less than", value: "50" }, ctx).result, false);
});

test("greater than reports a clear error for non-numeric input instead of silently returning false", () => {
  const ctx = buildBaseContext({ trigger: { body: { amount: "not-a-number" } } });
  const result = runConditionNode({ field: "{{trigger.body.amount}}", op: "greater than", value: "50" }, ctx);
  assert.equal(result.ok, false);
  assert.match(result.error, /numeric/);
});

test("is empty / is not empty operators", () => {
  const ctxEmpty = buildBaseContext({ trigger: { body: { val: "" } } });
  assert.equal(runConditionNode({ field: "{{trigger.body.val}}", op: "is empty" }, ctxEmpty).result, true);
  const ctxFilled = buildBaseContext({ trigger: { body: { val: "x" } } });
  assert.equal(runConditionNode({ field: "{{trigger.body.val}}", op: "is not empty" }, ctxFilled).result, true);
});

test("regex match operator", () => {
  const ctx = buildBaseContext({ trigger: { body: { email: "jane@example.com" } } });
  const result = runConditionNode({ field: "{{trigger.body.email}}", op: "regex match", value: "^[^@]+@[^@]+\\.[^@]+$" }, ctx);
  assert.equal(result.ok, true);
  assert.equal(result.result, true);
});

test("regex match with invalid pattern reports a clear error", () => {
  const ctx = buildBaseContext({});
  const result = runConditionNode({ field: "x", op: "regex match", value: "(unclosed" }, ctx);
  assert.equal(result.ok, false);
});

test("unknown operator reports a clear error", () => {
  const ctx = buildBaseContext({});
  const result = runConditionNode({ field: "x", op: "made up operator", value: "y" }, ctx);
  assert.equal(result.ok, false);
  assert.match(result.error, /Unknown condition operator/);
});
