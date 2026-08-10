import test from "node:test";
import assert from "node:assert/strict";
import { runLoopNode } from "../server/handlers/loopNode.js";
import { buildBaseContext } from "../server/templateEngine.js";

function ctx(overrides = {}) {
  return { ...buildBaseContext({ trigger: {}, vars: {}, nodeOutputsByLabel: {} }), ...overrides };
}

test("loop: genuinely runs sandboxed code once per real item and collects results", () => {
  const result = runLoopNode({ items: [1, 2, 3], code: "return $item * 10;" }, ctx());
  assert.equal(result.ok, true);
  assert.deepEqual(result.result, [10, 20, 30]);
  assert.equal(result.itemCount, 3);
});

test("loop: $index is real and matches each item's position", () => {
  const result = runLoopNode({ items: ["a", "b"], code: "return { item: $item, index: $index };" }, ctx());
  assert.deepEqual(result.result, [{ item: "a", index: 0 }, { item: "b", index: 1 }]);
});

test("loop: an honest error on a non-array items input", () => {
  const result = runLoopNode({ items: "not an array", code: "return $item;" }, ctx());
  assert.equal(result.ok, false);
  assert.match(result.error, /did not resolve to a JSON array/);
});

test("loop: a real per-iteration failure stops the loop with a specific error", () => {
  const result = runLoopNode({ items: [1, 0, 2], code: "if ($item === 0) throw new Error('boom'); return $item;" }, ctx());
  assert.equal(result.ok, false);
  assert.match(result.error, /Loop failed on item 1/);
  assert.deepEqual(result.processedSoFar, [1]);
});

test("loop: rejects an item count above the safety cap", () => {
  const items = new Array(1001).fill(1);
  const result = runLoopNode({ items, code: "return $item;" }, ctx());
  assert.equal(result.ok, false);
  assert.match(result.error, /exceeds the 1000-item safety cap/);
});
