import { test } from "node:test";
import assert from "node:assert/strict";
import { runCodeNode } from "../server/handlers/codeNode.js";

test("executes real JS and returns the result", () => {
  const result = runCodeNode("return { result: $input.data };", { data: "hello" }, {});
  assert.deepEqual(result, { ok: true, result: { result: "hello" } });
});

test("$vars is accessible", () => {
  const result = runCodeNode("return $vars.foo;", {}, { foo: "bar" });
  assert.deepEqual(result, { ok: true, result: "bar" });
});

test("has no access to process, require, or other Node built-ins", () => {
  assert.equal(runCodeNode("return typeof process;", {}, {}).result, "undefined");
  assert.equal(runCodeNode("return typeof require;", {}, {}).result, "undefined");
  assert.equal(runCodeNode("return typeof global;", {}, {}).result, "undefined");
});

test("an infinite loop is killed by the timeout instead of hanging forever", () => {
  const result = runCodeNode("while(true){}", {}, {});
  assert.equal(result.ok, false);
  assert.match(result.error, /timed out/);
});

test("$fetch throws a clear 'not available' error rather than silently doing nothing", () => {
  const result = runCodeNode("return $fetch('http://example.com');", {}, {});
  assert.equal(result.ok, false);
  assert.match(result.error, /not available/);
});

test("a syntax error is reported, not thrown uncaught", () => {
  const result = runCodeNode("this is not valid js{{{", {}, {});
  assert.equal(result.ok, false);
  assert.ok(result.error.length > 0);
});

test("a runtime error inside the user code is caught and reported", () => {
  const result = runCodeNode("return undefinedVariable.someProp;", {}, {});
  assert.equal(result.ok, false);
  assert.match(result.error, /undefinedVariable/);
});

test("the returned object is a plain, host-realm object (not a cross-realm vm object with a mismatched prototype)", () => {
  const result = runCodeNode("return { a: 1, nested: { b: 2 } };", {}, {});
  assert.equal(result.ok, true);
  // This is the actual regression this test guards: vm.createContext()
  // objects have a different Object.prototype than the host realm's,
  // which silently breaks strict deep-equality/prototype checks anywhere
  // downstream that isn't just JSON-serializing the result.
  assert.equal(Object.getPrototypeOf(result.result), Object.prototype);
  assert.deepEqual(result.result, { a: 1, nested: { b: 2 } });
});

test("returning a function is reported as an error instead of leaking a cross-realm value", () => {
  const result = runCodeNode("return function(){};", {}, {});
  assert.equal(result.ok, false);
  assert.match(result.error, /plain data/);
});
