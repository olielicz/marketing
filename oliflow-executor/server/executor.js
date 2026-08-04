/**
 * The core workflow executor. Consumes the EXACT workflow JSON shape the
 * frontend already saves (oliflow/app/index.html's `wf.nodes` /
 * `wf.connections` — see that file's addNode()/finishConn() for the
 * canonical shape), replicates its `getExecutionOrder()` DFS-from-
 * triggers traversal (ported here, not re-invented), and for each node
 * either runs REAL logic (the node types listed in IMPLEMENTED_TYPES
 * below) or returns an honest "not implemented" result — never a fake
 * success, unlike the frontend's own simulated engine.
 */
import { buildBaseContext } from "./templateEngine.js";
import { runHttpRequestNode } from "./handlers/httpRequestNode.js";
import { runConditionNode } from "./handlers/conditionNode.js";
import { runCodeNode } from "./handlers/codeNode.js";
import { runEmailSendNode } from "./handlers/emailSendNode.js";
import {
  runDelayNode,
  runSetFieldsNode,
  runSetVariableNode,
  runGetVariableNode,
  runLogNode,
  runRespondWebhookNode,
  runNoteNode,
} from "./handlers/simpleNodes.js";

/**
 * Node types with a REAL implementation in this executor. Every other
 * type recognized by the frontend's NODE_LIBRARY (webhook trigger itself
 * is handled specially - see below - schedule, openai, slack, stripe,
 * shopify, etc.) returns { ok: false, notImplemented: true, ... } rather
 * than faking success, so a user building a workflow with those node
 * types gets an honest, actionable result instead of a misleading green
 * checkmark. See README.md's "Node type coverage" table for the full
 * list and why each unimplemented type needs real third-party
 * credentials/API integration work beyond this pass's scope.
 */
const IMPLEMENTED_TYPES = new Set([
  "webhook", // trigger only - see note in runNode()
  "http_request",
  "condition",
  "delay",
  "code",
  "set_fields",
  "set_variable",
  "get_variable",
  "log",
  "respond_webhook",
  "email_send",
  "note",
]);

/** Ports getExecutionOrder() from oliflow/app/index.html verbatim (same DFS-from-triggers logic, same fallback for orphan nodes), operating on the same wf.nodes/wf.connections shape. */
export function getExecutionOrder(wf, isTriggerType) {
  const triggers = wf.nodes.filter((n) => isTriggerType(n.type));
  const visited = new Set();
  const order = [];
  const traverse = (nodeId) => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    const n = wf.nodes.find((n) => n.id === nodeId);
    if (n) {
      order.push(n);
      wf.connections.filter((c) => c.fromId === nodeId).forEach((c) => traverse(c.toId));
    }
  };
  triggers.forEach((t) => traverse(t.id));
  wf.nodes.forEach((n) => {
    if (!visited.has(n.id)) order.push(n);
  });
  return order;
}

/**
 * @param {object} wf - the workflow object, matching the frontend's shape
 * @param {object} options
 *   - triggerPayload: the inbound trigger data (e.g. webhook body)
 *   - vars: workflow variables ({name: value} map, from wf.variables or
 *     the app's Variables tab)
 *   - isTriggerType: (nodeType) => boolean — the frontend determines this
 *     via `getNodeDef(n.type).inputs.length === 0`; since this executor
 *     doesn't have the frontend's NODE_LIBRARY definitions loaded, the
 *     caller (server/index.js) passes this in, built from a small
 *     mirrored trigger-type list — see server/index.js's TRIGGER_TYPES.
 * @returns {Promise<{executionId, nodeResults: Array, respondWith: {statusCode, body} | null}>}
 */
export async function executeWorkflow(wf, { triggerPayload, vars, isTriggerType, executionId }) {
  const nodeResults = [];
  const nodeOutputsByLabel = {};
  let respondWith = null;
  let currentVars = { ...(vars || {}) };

  const order = getExecutionOrder(wf, isTriggerType);

  for (const node of order) {
    const def = { label: node.label || node.type };
    const templateContext = buildBaseContext({
      workflowId: wf.id,
      executionId,
      trigger: { body: triggerPayload },
      vars: currentVars,
      nodeOutputsByLabel,
    });

    const result = await runNode(node, templateContext);
    nodeResults.push({ nodeId: node.id, label: node.label || node.type, type: node.type, ...result });

    if (result.ok) {
      nodeOutputsByLabel[node.label || node.type] = result.result ?? result;
      if (node.type === "set_variable" && result.name) {
        currentVars[result.name] = result.value;
      }
      if (node.type === "respond_webhook") {
        respondWith = { statusCode: result.statusCode, body: result.body };
      }
    } else if (!result.notImplemented) {
      // A real error in an IMPLEMENTED node stops the run — matches how
      // any real workflow engine behaves (n8n/Zapier/Make all halt a run
      // on an unhandled node error) and is more honest than silently
      // continuing past a failure.
      break;
    }
    // notImplemented results do NOT halt the run - they're recorded and
    // execution continues to downstream nodes, since "we don't have a
    // real handler for this yet" is different from "this genuinely
    // failed." This matches what a user testing a partially-implemented
    // workflow would want: see how far real execution gets.
  }

  return { executionId, nodeResults, respondWith, finalVars: currentVars };
}

async function runNode(node, templateContext) {
  const config = node.config || {};

  if (!IMPLEMENTED_TYPES.has(node.type)) {
    return {
      ok: false,
      notImplemented: true,
      error: `Node type "${node.type}" is not yet implemented in the real executor — it needs real third-party API/OAuth integration. See oliflow-executor/README.md's "Node type coverage" table.`,
    };
  }

  switch (node.type) {
    case "webhook":
      // The trigger node itself doesn't "do" anything at execution time —
      // its job is just to be the entry point; the actual inbound payload
      // is already available to every downstream node via
      // {{trigger.body...}}. Matches the frontend, which also never
      // executes trigger-node-specific logic at run time.
      return { ok: true, result: templateContext.trigger };
    case "http_request":
      return runHttpRequestNode(config, templateContext);
    case "condition":
      return runConditionNode(config, templateContext);
    case "delay":
      return runDelayNode(config);
    case "code":
      return runCodeNode(config.code || "", templateContext.nodeOutputsByLabel, templateContext.vars);
    case "set_fields":
      return runSetFieldsNode(config, templateContext);
    case "set_variable":
      return runSetVariableNode(config, templateContext);
    case "get_variable":
      return runGetVariableNode(config, templateContext);
    case "log":
      return runLogNode(config, templateContext);
    case "respond_webhook":
      return runRespondWebhookNode(config, templateContext);
    case "email_send":
      return runEmailSendNode(config, templateContext);
    case "note":
      return runNoteNode();
    default:
      // Unreachable given the IMPLEMENTED_TYPES check above, but kept as
      // a defensive fallback rather than letting an unhandled case throw.
      return { ok: false, notImplemented: true, error: `No handler wired for "${node.type}".` };
  }
}
