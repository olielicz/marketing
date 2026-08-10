import test from "node:test";
import assert from "node:assert/strict";
import { runSwitchNode, runMergeNode, runFilterNode, runErrorHandlerNode } from "../server/handlers/logicNodes.js";
import { buildBaseContext } from "../server/templateEngine.js";

function ctx(overrides = {}) {
  return { ...buildBaseContext({ trigger: {}, vars: {}, nodeOutputsByLabel: {} }), ...overrides };
}

test("switch: matches the correct case and reports it", () => {
  const result = runSwitchNode({ field: "{{vars.plan}}", cases: ["starter", "pro", "agency"] }, ctx({ vars: { plan: "pro" } }));
  assert.equal(result.ok, true);
  assert.equal(result.result, "case2");
  assert.equal(result.matchedCase, "case2");
});

test("switch: falls to default when nothing matches", () => {
  const result = runSwitchNode({ field: "{{vars.plan}}", cases: ["starter", "pro"] }, ctx({ vars: { plan: "trial" } }));
  assert.equal(result.result, "default");
});

test("merge: merges named branch outputs positionally into a/b/c", () => {
  const result = runMergeNode(
    { branches: ["Node A", "Node B"] },
    ctx({ nodeOutputsByLabel: { "Node A": { x: 1 }, "Node B": { y: 2 } } })
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.result.merged, { a: { x: 1 }, b: { y: 2 } });
});

test("merge: honestly reports null for a branch that never ran", () => {
  const result = runMergeNode({ branches: ["Ran", "Never Ran"] }, ctx({ nodeOutputsByLabel: { Ran: { ok: true } } }));
  assert.equal(result.result.merged.a.ok, true);
  assert.equal(result.result.merged.b, null);
});

test("filter: splits a real array into matched/rejected", () => {
  const items = [{ status: "paid", amount: 10 }, { status: "pending", amount: 5 }, { status: "paid", amount: 20 }];
  const result = runFilterNode({ items, field: "status", op: "equals", value: "paid" }, ctx());
  assert.equal(result.ok, true);
  assert.equal(result.result.matched.length, 2);
  assert.equal(result.result.rejected.length, 1);
});

test("filter: rejects a non-array items input with a specific error", () => {
  const result = runFilterNode({ items: "not-json-array", field: "x", op: "equals", value: "y" }, ctx());
  assert.equal(result.ok, false);
  assert.match(result.error, /did not resolve to a JSON array/);
});

test("error_handler: reports 'success' when the watched node succeeded", () => {
  const result = runErrorHandlerNode({ watchNode: "Some Node" }, ctx({ nodeResultsByLabel: { "Some Node": { ok: true } } }));
  assert.equal(result.result, "success");
  assert.equal(result.matchedCase, "success");
});

test("error_handler: reports 'error' when the watched node genuinely failed", () => {
  const result = runErrorHandlerNode(
    { watchNode: "Some Node" },
    ctx({ nodeResultsByLabel: { "Some Node": { ok: false, notImplemented: false, error: "boom" } } })
  );
  assert.equal(result.result, "error");
  assert.equal(result.watchedError, "boom");
});

test("error_handler: does NOT treat notImplemented as an error", () => {
  const result = runErrorHandlerNode(
    { watchNode: "Some Node" },
    ctx({ nodeResultsByLabel: { "Some Node": { ok: false, notImplemented: true, error: "not implemented" } } })
  );
  assert.equal(result.result, "success");
});

test("error_handler: defaults to success when watchNode hasn't run yet", () => {
  const result = runErrorHandlerNode({ watchNode: "Never Ran" }, ctx({ nodeResultsByLabel: {} }));
  assert.equal(result.result, "success");
});
