/**
 * Real implementation of the "code" node type. Runs user-supplied
 * JavaScript in a sandboxed `node:vm` context — a REAL execution, not a
 * simulation, but deliberately restricted:
 *
 *  - No access to `require`, `process`, `fs`, or any Node built-in.
 *  - No access to the executor process's own globals/closures.
 *  - A hard timeout (default 2000ms) to prevent an infinite loop from
 *    hanging a workflow run forever.
 *  - The ONLY things exposed to the user's code are `$input` (the
 *    upstream node's output) and `$vars` (workflow variables) — matching
 *    exactly what the frontend's config panel hint already documents
 *    ("Available: $input, $vars, $fetch(url)").
 *
 * $fetch is intentionally NOT implemented in this pass — see the
 * "Known limitations" note in README.md. Exposing an unrestricted
 * outbound-fetch capability to arbitrary user-supplied code run on your
 * server is a meaningfully bigger security decision (SSRF risk: user
 * code could make the server hit http://169.254.169.254/ or an internal
 * network address) than the other node types implemented in this pass,
 * and deserves its own deliberate design (an allowlist? a proxy with
 * private-IP blocking?) rather than being bolted on as a side effect of
 * implementing everything else. A `code` node that references `$fetch`
 * gets a clear runtime error telling the user it's not available yet,
 * rather than either faking success or silently doing nothing.
 */
import vm from "node:vm";

const DEFAULT_TIMEOUT_MS = 2000;

/**
 * @param {string} code - user-supplied JS. Expected to `return` a value,
 *   matching the frontend's default placeholder code
 *   ("// Return your output\nreturn {\n  result: $input.data\n};").
 * @param {*} input - the upstream node's last output, exposed as $input.
 * @param {object} vars - workflow variables, exposed as $vars.
 * @returns {{ ok: true, result: * } | { ok: false, error: string }}
 */
export function runCodeNode(code, input, vars) {
  const wrappedCode = `(function($input, $vars, $fetch) {\n${code}\n})`;

  const sandbox = {
    // Nothing else is exposed. In particular: no `require`, no
    // `process`, no `global`, no access to this file's own imports.
  };
  const context = vm.createContext(sandbox);

  const fetchStub = () => {
    throw new Error(
      "$fetch is not available in this version of the OliFlow executor. " +
        "Use an 'HTTP Request' node instead for real outbound calls, or see " +
        "oliflow-executor/README.md's 'Known limitations' section."
    );
  };

  try {
    const script = new vm.Script(wrappedCode, { filename: "oliflow-code-node.js" });
    const fn = script.runInContext(context, { timeout: DEFAULT_TIMEOUT_MS });
    const result = vm.runInContext(
      "__fn__($input, $vars, $fetch)",
      vm.createContext({ __fn__: fn, $input: input, $vars: vars, $fetch: fetchStub }),
      { timeout: DEFAULT_TIMEOUT_MS }
    );
    // vm.createContext runs code in a separate V8 "realm" — plain objects
    // returned from inside it have a DIFFERENT Object.prototype than this
    // file's own realm, even though they look identical. That's invisible
    // for JSON serialization (JSON.stringify doesn't care), but would
    // surprise anything doing strict prototype/instanceof checks on the
    // result later in the pipeline. Round-tripping through
    // structuredClone() re-creates the value using THIS realm's built-ins,
    // eliminating that cross-realm quirk. Functions/symbols can't survive
    // structuredClone, but a workflow node's output is expected to be
    // plain JSON-shaped data anyway (it gets stored, templated into
    // {{Node.output}} elsewhere, etc.) — this is the correct boundary.
    try {
      return { ok: true, result: structuredClone(result) };
    } catch {
      // Result contains something non-cloneable (a function, a Symbol,
      // etc.) — report that clearly rather than crashing or silently
      // returning the cross-realm value with its prototype mismatch.
      return {
        ok: false,
        error: "Code node returned a value that can't be represented as plain data (e.g. a function) — return a plain object, array, string, number, or boolean.",
      };
    }
  } catch (err) {
    if (err.message && err.message.includes("Script execution timed out")) {
      return { ok: false, error: `Code node timed out after ${DEFAULT_TIMEOUT_MS}ms (possible infinite loop).` };
    }
    return { ok: false, error: err.message };
  }
}
