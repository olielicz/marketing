import test from "node:test";
import assert from "node:assert/strict";
import { runJsonParseNode, runTemplateNode, runAggregateNode, runSplitNode, runFormatDateNode } from "../server/handlers/dataNodes.js";
import { buildBaseContext } from "../server/templateEngine.js";

function ctx(overrides = {}) {
  return { ...buildBaseContext({ trigger: {}, vars: {}, nodeOutputsByLabel: {} }), ...overrides };
}

test("json_parse: parses real JSON from a template-resolved string", () => {
  const result = runJsonParseNode({ text: '{{vars.raw}}' }, ctx({ vars: { raw: '{"a":1,"b":[1,2,3]}' } }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.result, { a: 1, b: [1, 2, 3] });
});

test("json_parse: returns an honest error for malformed JSON", () => {
  const result = runJsonParseNode({ text: "{not json" }, ctx());
  assert.equal(result.ok, false);
  assert.match(result.error, /not valid JSON/);
});

test("template: resolves multiple placeholders in free text", () => {
  const result = runTemplateNode({ template: "Hi {{vars.name}}, id {{vars.id}}." }, ctx({ vars: { name: "Ana", id: 42 } }));
  assert.equal(result.result, "Hi Ana, id 42.");
});

test("aggregate: sum/avg/min/max over a real numeric field", () => {
  const items = [{ amount: 10 }, { amount: 20 }, { amount: 30 }];
  assert.equal(runAggregateNode({ items, op: "sum", field: "amount" }, ctx()).result, 60);
  assert.equal(runAggregateNode({ items, op: "avg", field: "amount" }, ctx()).result, 20);
  assert.equal(runAggregateNode({ items, op: "min", field: "amount" }, ctx()).result, 10);
  assert.equal(runAggregateNode({ items, op: "max", field: "amount" }, ctx()).result, 30);
  assert.equal(runAggregateNode({ items, op: "count" }, ctx()).result, 3);
});

test("aggregate: group partitions real items by distinct field value", () => {
  const items = [{ status: "paid" }, { status: "pending" }, { status: "paid" }];
  const result = runAggregateNode({ items, op: "group", field: "status" }, ctx());
  assert.equal(result.result.paid.length, 2);
  assert.equal(result.result.pending.length, 1);
});

test("split: chunk:N splits a real array into groups", () => {
  const result = runSplitNode({ input: [1, 2, 3, 4, 5], by: "chunk:2" }, ctx());
  assert.deepEqual(result.result, [[1, 2], [3, 4], [5]]);
});

test("split: plain delimiter splits a real string", () => {
  const result = runSplitNode({ input: "a,b,c", by: "," }, ctx());
  assert.deepEqual(result.result, ["a", "b", "c"]);
});

test("format_date: formats a real date with common tokens", () => {
  const result = runFormatDateNode({ date: "2026-03-05T14:30:00Z", format: "YYYY-MM-DD HH:mm:ss" }, ctx());
  assert.equal(result.result, "2026-03-05 14:30:00");
});

test("format_date: honest error on an unparseable date", () => {
  const result = runFormatDateNode({ date: "not-a-date", format: "YYYY-MM-DD" }, ctx());
  assert.equal(result.ok, false);
  assert.match(result.error, /could not be parsed/);
});
