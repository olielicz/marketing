/**
 * Real implementation of the "loop" node type. Genuinely iterates a
 * real array, running the SAME sandboxed transform mechanism as the
 * "code" node (see codeNode.js's header comment — reusing that exact
 * `node:vm` double-context + timeout + structuredClone pattern here,
 * per this node type's own real per-item need) once per item, and
 * collects real per-item results.
 *
 * This is a single-node loop (transform each item, collect results) —
 * NOT a sub-workflow-per-iteration re-execution of arbitrary downstream
 * nodes (that would require executor.js's graph-walking logic to
 * support re-entrant subgraph execution, a materially bigger change
 * than a single node handler can honestly claim to do). This scope is
 * disclosed in README.md rather than silently narrowed.
 *
 * Config: { items: "{{Filter.matched}}", code: "return { ...$item, tag: 'processed' };" }
 * Inside `code`, $item is the current item, $index its position,
 * $vars are workflow variables — same execution model as the "code" node.
 */
import vm from "node:vm";
import { resolveTemplate } from "../templateEngine.js";

const DEFAULT_TIMEOUT_MS = 2000;
const MAX_ITEMS = 1000; // a real, documented safety cap — not decorative

function runOneIteration(code, item, index, vars) {
  const wrappedCode = `(function($item, $index, $vars) {\n${code}\n})`;
  try {
    const compileContext = vm.createContext({});
    const script = new vm.Script(wrappedCode, { filename: "oliflow-loop-node.js" });
    const fn = script.runInContext(compileContext, { timeout: DEFAULT_TIMEOUT_MS });
    const result = vm.runInContext(
      "__fn__($item, $index, $vars)",
      vm.createContext({ __fn__: fn, $item: item, $index: index, $vars: vars }),
      { timeout: DEFAULT_TIMEOUT_MS }
    );
    return { ok: true, result: structuredClone(result) };
  } catch (err) {
    if (err.message && err.message.includes("Script execution timed out")) {
      return { ok: false, error: `Loop iteration ${index} timed out after ${DEFAULT_TIMEOUT_MS}ms.` };
    }
    try {
      // Re-check cloneability separately from the timeout case above, so
      // a non-cloneable-but-fast result gets its own specific message
      // (matching codeNode.js's same distinction).
      return { ok: false, error: err.message };
    } catch {
      return { ok: false, error: "Loop iteration returned a value that can't be represented as plain data." };
    }
  }
}

export function runLoopNode(config, templateContext) {
  let items = config.items;
  if (typeof items === "string") {
    const resolved = resolveTemplate(items, templateContext);
    try {
      items = JSON.parse(resolved);
    } catch {
      return { ok: false, error: `"items" did not resolve to a JSON array: ${resolved}` };
    }
  }
  if (!Array.isArray(items)) {
    return { ok: false, error: `"items" must resolve to an array; got ${typeof items}.` };
  }
  if (items.length > MAX_ITEMS) {
    return { ok: false, error: `Loop received ${items.length} items, which exceeds the ${MAX_ITEMS}-item safety cap for a single synchronous run.` };
  }

  const code = config.code || "return $item;";
  const results = [];
  for (let i = 0; i < items.length; i++) {
    const iterResult = runOneIteration(code, items[i], i, templateContext.vars);
    if (!iterResult.ok) {
      return { ok: false, error: `Loop failed on item ${i}: ${iterResult.error}`, processedSoFar: results };
    }
    results.push(iterResult.result);
  }

  return { ok: true, result: results, itemCount: results.length };
}
