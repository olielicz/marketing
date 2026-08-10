import { test } from "node:test";
import assert from "node:assert/strict";
import { runCodeNode } from "../server/handlers/codeNode.js";

// runCodeNode is now async (it needs to `await` a possible $fetch call
// inside the user's code — see codeNode.js's header comment) — every
// test below awaits it, unlike the pre-this-pass version.

test("executes real JS and returns the result", async () => {
  const result = await runCodeNode("return { result: $input.data };", { data: "hello" }, {});
  assert.deepEqual(result, { ok: true, result: { result: "hello" } });
});

test("$vars is accessible", async () => {
  const result = await runCodeNode("return $vars.foo;", {}, { foo: "bar" });
  assert.deepEqual(result, { ok: true, result: "bar" });
});

test("has no access to process, require, or other Node built-ins", async () => {
  assert.equal((await runCodeNode("return typeof process;", {}, {})).result, "undefined");
  assert.equal((await runCodeNode("return typeof require;", {}, {})).result, "undefined");
  assert.equal((await runCodeNode("return typeof global;", {}, {})).result, "undefined");
});

test("an infinite loop is killed by the timeout instead of hanging forever", async () => {
  const result = await runCodeNode("while(true){}", {}, {});
  assert.equal(result.ok, false);
  assert.match(result.error, /timed out/);
});

// NOTE: $fetch used to be a permanent stub that always threw "not
// available" — see codeNode.fetch.test.js for the real $fetch tests
// (guarded outbound requests, the SSRF block, the per-run call cap).
// This file keeps the general JS-sandbox tests; codeNode.fetch.test.js
// and codeNode.python.test.js cover the two newer capabilities.

test("a syntax error is reported, not thrown uncaught", async () => {
  const result = await runCodeNode("this is not valid js{{{", {}, {});
  assert.equal(result.ok, false);
  assert.ok(result.error.length > 0);
});

test("a runtime error inside the user code is caught and reported", async () => {
  const result = await runCodeNode("return undefinedVariable.someProp;", {}, {});
  assert.equal(result.ok, false);
  assert.match(result.error, /undefinedVariable/);
});

test("the returned object is a plain, host-realm object (not a cross-realm vm object with a mismatched prototype)", async () => {
  const result = await runCodeNode("return { a: 1, nested: { b: 2 } };", {}, {});
  assert.equal(result.ok, true);
  // This is the actual regression this test guards: vm.createContext()
  // objects have a different Object.prototype than the host realm's,
  // which silently breaks strict deep-equality/prototype checks anywhere
  // downstream that isn't just JSON-serializing the result.
  assert.equal(Object.getPrototypeOf(result.result), Object.prototype);
  assert.deepEqual(result.result, { a: 1, nested: { b: 2 } });
});

test("returning a function is reported as an error instead of leaking a cross-realm value", async () => {
  const result = await runCodeNode("return function(){};", {}, {});
  assert.equal(result.ok, false);
  assert.match(result.error, /plain data/);
});

test("an async function that awaits something that never resolves is caught by the async wall-clock timeout", async () => {
  const result = await runCodeNode("await new Promise(() => {}); return 1;", {}, {});
  assert.equal(result.ok, false);
  assert.match(result.error, /timed out/);
});
