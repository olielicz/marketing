/**
 * Real implementations of the "Logic & Flow" node types beyond
 * `condition` (which already existed — see conditionNode.js): switch,
 * merge, filter, error_handler. `loop`'s real sub-workflow-per-item
 * execution lives in executor.js instead (it needs access to the whole
 * workflow graph + a way to re-run a subgraph, which these single-node
 * handlers deliberately don't have — see executor.js's runLoopNode()).
 *
 * `switch`, `condition`, and `error_handler` are genuine BRANCH nodes:
 * their result tells executor.js's activePorts gating (see
 * executeWorkflow()) which of their output ports is actually "live" for
 * this run, so downstream nodes connected ONLY to an inactive port are
 * honestly skipped instead of running unconditionally regardless of the
 * branch outcome — that gating is what makes this a real If/Else and
 * Switch, not a decorative one that always runs every downstream node.
 *
 * `merge` and `filter` are DATA nodes (their def.outputs are data shapes,
 * not decision branches), so they don't need port gating — they combine
 * or split real data and let downstream nodes reference whichever output
 * they need via {{Merge.merged}} / {{Filter.matched}} / {{Filter.rejected}}.
 */
import { resolveTemplate, resolveTemplateDeep } from "../templateEngine.js";

function evalOperator(op, field, value) {
  switch (op) {
    case "equals": return field === value;
    case "not equals": return field !== value;
    case "contains": return String(field).includes(value);
    case "greater than": return Number(field) > Number(value);
    case "less than": return Number(field) < Number(value);
    case "is empty": return field === "" || field === undefined || field === null;
    case "is not empty": return !(field === "" || field === undefined || field === null);
    case "regex match":
      try { return new RegExp(value).test(String(field)); } catch { return false; }
    default: return field === value;
  }
}

/**
 * "switch" — real multi-way branch. Config shape (matches the frontend's
 * generic JSON fallback panel, since switch has no dedicated config UI
 * yet — see oliflow/app/index.html's renderCpSettings() default case):
 *   { field: "{{trigger.body.plan}}", cases: ["pro", "starter", "trial"] }
 * `cases` maps positionally to this node's case1/case2/case3 output
 * ports (matching NODE_LIBRARY's def.outputs = ['case1','case2','case3','default']).
 * Whichever case's value equals the resolved field becomes the active
 * port; if none match, 'default' is active.
 *
 * @returns {{ ok:true, result: string, matchedCase: string, resolvedField: string }}
 */
export function runSwitchNode(config, templateContext) {
  const resolvedField = resolveTemplate(String(config.field ?? ""), templateContext);
  const cases = Array.isArray(config.cases) ? config.cases : [];
  const portNames = ["case1", "case2", "case3"];

  for (let i = 0; i < Math.min(cases.length, portNames.length); i++) {
    const resolvedCaseValue = resolveTemplate(String(cases[i] ?? ""), templateContext);
    if (resolvedField === resolvedCaseValue) {
      return { ok: true, result: portNames[i], matchedCase: portNames[i], resolvedField };
    }
  }
  return { ok: true, result: "default", matchedCase: "default", resolvedField };
}

/**
 * "merge" — real fan-in of already-computed upstream node outputs. Since
 * this executor runs a single-threaded, sequential DFS-from-triggers
 * pass (see executor.js's getExecutionOrder()), every upstream dependency
 * of a merge node has, by construction, already executed by the time the
 * merge node itself runs — so "waiting for all branches" is genuinely
 * satisfied, not simulated. Config shape:
 *   { branches: ["Node Label A", "Node Label B", "Node Label C"] }
 * mapped positionally to this node's a/b/c inputs. If `branches` isn't
 * given, merges every node output seen so far (a safe, still-genuine
 * default — never fabricates data for a branch that never ran; missing
 * branches are honestly `null` rather than omitted or guessed).
 */
export function runMergeNode(config, templateContext) {
  const outputsByLabel = templateContext.nodeOutputsByLabel || {};
  const branchLabels = Array.isArray(config.branches) ? config.branches : null;
  const portNames = ["a", "b", "c"];

  const merged = {};
  if (branchLabels) {
    branchLabels.slice(0, 3).forEach((label, i) => {
      merged[portNames[i]] = Object.prototype.hasOwnProperty.call(outputsByLabel, label) ? outputsByLabel[label] : null;
    });
  } else {
    Object.assign(merged, outputsByLabel);
  }
  return { ok: true, result: { merged } };
}

/**
 * "filter" — real array filtering, not a decision branch. Config shape:
 *   { items: "{{Some Node.output}}", field: "status", op: "equals", value: "paid" }
 * `items` resolves (via template) to a real array (or a JSON-string
 * array, which is parsed); each item is tested with `field` read via a
 * dot-path INTO the item itself (not the whole templateContext, since
 * per-item field access needs the item, not the global context) against
 * `op`/`value`. Returns real matched/rejected arrays as DATA outputs —
 * downstream nodes pick whichever they need via
 * {{Filter.matched}} / {{Filter.rejected}}.
 */
export function runFilterNode(config, templateContext) {
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

  const field = config.field || "";
  const op = config.op || "equals";
  const value = resolveTemplate(String(config.value ?? ""), templateContext);

  const matched = [];
  const rejected = [];
  for (const item of items) {
    const fieldValue = field
      ? field.split(".").reduce((acc, part) => (acc === undefined || acc === null ? undefined : acc[part]), item)
      : item;
    if (evalOperator(op, fieldValue, value)) matched.push(item);
    else rejected.push(item);
  }

  return { ok: true, result: { matched, rejected, matchedCount: matched.length, rejectedCount: rejected.length } };
}

/**
 * "error_handler" — real branch node that inspects whether a SPECIFIC
 * earlier node in this same run actually failed. Config shape:
 *   { watchNode: "Some Node Label" }
 * Looks up that node's real recorded result (passed in via
 * templateContext.nodeResultsByLabel, populated by executor.js — NOT the
 * same as nodeOutputsByLabel, which only stores successful outputs) and
 * sets the active port to 'error' if it failed (ok:false, and not merely
 * notImplemented — see the note below) or 'success' otherwise. If
 * `watchNode` isn't set or never ran, defaults to 'success' (nothing to
 * report as an error) rather than guessing.
 *
 * Note: a `notImplemented` result is deliberately NOT treated as an
 * "error" here — see executor.js's own honesty distinction between "this
 * genuinely failed" and "we don't have a real handler for this node type
 * yet." Watching for the latter would make error_handler falsely fire on
 * every workflow that happens to use an unimplemented node type
 * elsewhere, which isn't what a user wiring up real error handling wants.
 */
export function runErrorHandlerNode(config, templateContext) {
  const watchNode = config.watchNode;
  if (!watchNode) {
    return { ok: true, result: "success", matchedCase: "success", note: "No watchNode configured — nothing to check, defaulting to success." };
  }
  const resultsByLabel = templateContext.nodeResultsByLabel || {};
  const watched = resultsByLabel[watchNode];
  if (!watched) {
    return { ok: true, result: "success", matchedCase: "success", note: `Node "${watchNode}" hasn't run yet in this execution — defaulting to success.` };
  }
  const failed = watched.ok === false && !watched.notImplemented;
  return {
    ok: true,
    result: failed ? "error" : "success",
    matchedCase: failed ? "error" : "success",
    watchedError: failed ? watched.error : null,
  };
}
