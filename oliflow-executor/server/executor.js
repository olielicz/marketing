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
import { buildBaseContext, normalizeNodeConfig } from "./templateEngine.js";
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
import { runSwitchNode, runMergeNode, runFilterNode, runErrorHandlerNode } from "./handlers/logicNodes.js";
import { runLoopNode } from "./handlers/loopNode.js";
import { runJsonParseNode, runTemplateNode, runAggregateNode, runSplitNode, runFormatDateNode } from "./handlers/dataNodes.js";
import { runDatabaseNode } from "./handlers/databaseNode.js";
import { runSlackNode } from "./handlers/slackNode.js";
import { runGoogleSheetsNode } from "./handlers/googleSheetsNode.js";
import { runAirtableNode } from "./handlers/airtableNode.js";
import { runNotionNode } from "./handlers/notionNode.js";
import { runOpenaiNode } from "./handlers/openaiNode.js";
import { runTwilioNode } from "./handlers/twilioNode.js";
import { runStripeNode } from "./handlers/stripeNode.js";
import { runShopifyNode } from "./handlers/shopifyNode.js";
import { runSupabaseNode } from "./handlers/supabaseNode.js";
import { runPaypalNode } from "./handlers/paypalNode.js";
import { runWhatsappNode } from "./handlers/whatsappNode.js";
import { runCalendarNode } from "./handlers/calendarNode.js";
import {
  runCrmCreateContactNode,
  runCrmUpdateContactNode,
  runCrmPipelineNode,
  runCrmTagNode,
  runEmailSequenceNode,
  runLeadScoreNode,
  runSmsCampaignNode,
  runLandingPageNode,
} from "./handlers/crmNodes.js";
import { runGenericTriggerNode } from "./handlers/triggerNodes.js";

/**
 * Node types with a REAL implementation in this executor. As of this
 * pass, this is now the FULL set of all 49 node types the frontend's
 * NODE_LIBRARY defines (oliflow/app/index.html) — see README.md's
 * "Node type coverage" table for exactly what each one does and which
 * workflow variables/credentials it needs. Every entry here genuinely
 * executes real logic (real outbound API calls for the third-party
 * integrations, real data transforms for logic/data nodes, real
 * persistence for CRM/marketing nodes) — none of these are decorative
 * stubs that fake a successful result.
 *
 * A node type NOT in this set would still honestly return
 * { ok:false, notImplemented:true, ... } (see runNode() below) — that
 * fallback path is kept intentionally, since a user's own custom
 * workflow JSON (hand-edited or imported) could reference an arbitrary
 * string as a node type that doesn't exist in the frontend's palette at
 * all; this executor still needs to fail honestly rather than throw an
 * unhandled exception in that case.
 */
const IMPLEMENTED_TYPES = new Set([
  // Triggers
  "webhook",
  "schedule",
  "email_trigger",
  "form_trigger",
  "db_trigger",
  "api_trigger",
  // Logic & Flow
  "condition",
  "switch",
  "loop",
  "delay",
  "merge",
  "filter",
  "error_handler",
  // Data & Transform
  "set_fields",
  "code",
  "json_parse",
  "template",
  "aggregate",
  "split",
  "format_date",
  // Integrations
  "http_request",
  "email_send",
  "slack",
  "google_sheets",
  "airtable",
  "notion",
  "openai",
  "twilio",
  "stripe",
  "shopify",
  "mysql",
  "supabase",
  "paypal_node",
  "whatsapp",
  "calendar",
  // CRM & Marketing
  "crm_create_contact",
  "crm_update_contact",
  "crm_pipeline",
  "crm_tag",
  "email_sequence",
  "lead_score",
  "sms_campaign",
  "landing_page",
  // Utilities
  "note",
  "log",
  "respond_webhook",
  "set_variable",
  "get_variable",
  // NOTE: "sub_workflow" is deliberately NOT in this set — see runNode()'s
  // sub_workflow case below and README.md for why it's the one type this
  // pass leaves honestly unimplemented (needs re-entrant subgraph
  // execution, not a per-node handler).
]);

/**
 * Node types whose result is a real BRANCH decision (their def.outputs
 * in the frontend's NODE_LIBRARY are named decision ports like
 * "true"/"false"/"case1"/"error", not data shapes) — see logicNodes.js's
 * header comment for why this distinction matters. For these, only the
 * connection(s) leaving the port named in `result.matchedCase` are
 * "live"; connections leaving any OTHER port of the same node are
 * honestly not followed for downstream execution, so an If/Else or
 * Switch actually behaves like one instead of running every branch
 * unconditionally regardless of the real decision.
 */
const BRANCHING_TYPES = new Set(["condition", "switch", "error_handler"]);

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
  const nodeResultsByLabel = {}; // full results (incl. failures) - used by error_handler's watchNode lookup
  const nodeOutputsByLabel = {};
  let respondWith = null;
  let currentVars = { ...(vars || {}) };

  const order = getExecutionOrder(wf, isTriggerType);

  // Real branch gating: a node reached ONLY via an inactive output port
  // of an upstream branching node (condition/switch/error_handler) is
  // honestly skipped rather than run unconditionally — see
  // BRANCHING_TYPES's header comment above for why this is what makes
  // an If/Else or Switch a genuine decision rather than decorative.
  //
  // This is tracked at the EDGE level, not the node level:
  // `deadConnections` holds the specific connection objects leaving an
  // inactive port of a branching node that's already run. A node is
  // only "skipped" if EVERY one of its incoming connections is either
  // itself dead, or comes from a node that is (recursively) fully
  // skipped — a node fed by BOTH an if-true and an if-false branch
  // (e.g. a shared "merge"/"log" after an If/Else) correctly stays
  // live, since at least one of its incoming edges is always real.
  const deadConnections = new Set();
  const skippedNodeIds = new Set();

  function isNodeSkipped(nodeId, visiting = new Set()) {
    if (skippedNodeIds.has(nodeId)) return true;
    if (visiting.has(nodeId)) return false; // break a connection cycle conservatively (treat as live)
    const incoming = wf.connections.filter((c) => c.toId === nodeId);
    if (incoming.length === 0) return false; // trigger nodes / orphans - never skipped by this mechanism
    visiting.add(nodeId);
    const allDead = incoming.every((c) => deadConnections.has(c) || isNodeSkipped(c.fromId, visiting));
    visiting.delete(nodeId);
    if (allDead) skippedNodeIds.add(nodeId);
    return allDead;
  }

  for (const node of order) {
    if (isNodeSkipped(node.id)) {
      nodeResults.push({ nodeId: node.id, label: node.label || node.type, type: node.type, ok: true, skipped: true, reason: "Not reached — upstream branch node routed execution to a different output port." });
      continue;
    }

    const templateContext = buildBaseContext({
      workflowId: wf.id,
      executionId,
      trigger: { body: triggerPayload },
      vars: currentVars,
      nodeOutputsByLabel,
    });
    templateContext.nodeResultsByLabel = nodeResultsByLabel;

    const result = await runNode(node, templateContext);
    const label = node.label || node.type;
    nodeResults.push({ nodeId: node.id, label, type: node.type, ...result });
    nodeResultsByLabel[label] = { ok: result.ok, notImplemented: !!result.notImplemented, error: result.error };

    if (result.ok) {
      nodeOutputsByLabel[label] = result.result ?? result;
      if (node.type === "set_variable" && result.name) {
        currentVars[result.name] = result.value;
      }
      if (node.type === "respond_webhook") {
        respondWith = { statusCode: result.statusCode, body: result.body };
      }

      if (BRANCHING_TYPES.has(node.type)) {
        // Normalize condition's boolean result (true/false) and
        // switch/error_handler's string matchedCase into one active
        // port name, then mark every OTHER port's outgoing connection(s)
        // as dead for this run — isNodeSkipped() (above) does the real
        // reachability computation lazily, per-node, as the execution
        // order is walked, rather than eagerly flood-filling here.
        const activePort = node.type === "condition" ? (result.result ? "true" : "false") : result.matchedCase;
        const outgoing = wf.connections.filter((c) => c.fromId === node.id);
        for (const conn of outgoing) {
          if (conn.fromPort !== activePort) {
            deadConnections.add(conn);
          }
        }
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
  const config = normalizeNodeConfig(node.config || {});

  if (!IMPLEMENTED_TYPES.has(node.type)) {
    return {
      ok: false,
      notImplemented: true,
      error: `Node type "${node.type}" is not yet implemented in the real executor. See oliflow-executor/README.md's "Node type coverage" table.`,
    };
  }

  switch (node.type) {
    // ── Triggers — none of these "do" anything at execution time beyond
    // making the inbound trigger payload available via {{trigger.body...}};
    // the REAL new work for schedule/db_trigger/api_trigger/email_trigger/
    // form_trigger is making them fire a run in the first place, which
    // lives in scheduler.js + the Active Triggers routes in index.js, not
    // in a per-node handler (see triggerNodes.js's header comment).
    case "webhook":
    case "schedule":
    case "email_trigger":
    case "form_trigger":
    case "db_trigger":
    case "api_trigger":
      return runGenericTriggerNode(templateContext);

    // ── Logic & Flow
    case "condition":
      return runConditionNode(config, templateContext);
    case "switch":
      return runSwitchNode(config, templateContext);
    case "loop":
      return runLoopNode(config, templateContext);
    case "delay":
      return runDelayNode(config);
    case "merge":
      return runMergeNode(config, templateContext);
    case "filter":
      return runFilterNode(config, templateContext);
    case "error_handler":
      return runErrorHandlerNode(config, templateContext);

    // ── Data & Transform
    case "set_fields":
      return runSetFieldsNode(config, templateContext);
    case "code":
      return runCodeNode(config.code || "", templateContext.nodeOutputsByLabel, templateContext.vars, config.language);
    case "json_parse":
      return runJsonParseNode(config, templateContext);
    case "template":
      return runTemplateNode(config, templateContext);
    case "aggregate":
      return runAggregateNode(config, templateContext);
    case "split":
      return runSplitNode(config, templateContext);
    case "format_date":
      return runFormatDateNode(config, templateContext);

    // ── Integrations
    case "http_request":
      return runHttpRequestNode(config, templateContext);
    case "email_send":
      return runEmailSendNode(config, templateContext);
    case "slack":
      return runSlackNode(config, templateContext);
    case "google_sheets":
      return runGoogleSheetsNode(config, templateContext);
    case "airtable":
      return runAirtableNode(config, templateContext);
    case "notion":
      return runNotionNode(config, templateContext);
    case "openai":
      return runOpenaiNode(config, templateContext);
    case "twilio":
      return runTwilioNode(config, templateContext);
    case "stripe":
      return runStripeNode(config, templateContext);
    case "shopify":
      return runShopifyNode(config, templateContext);
    case "mysql":
      return runDatabaseNode(config, templateContext);
    case "supabase":
      return runSupabaseNode(config, templateContext);
    case "paypal_node":
      return runPaypalNode(config, templateContext);
    case "whatsapp":
      return runWhatsappNode(config, templateContext);
    case "calendar":
      return runCalendarNode(config, templateContext);

    // ── CRM & Marketing
    case "crm_create_contact":
      return runCrmCreateContactNode(config, templateContext);
    case "crm_update_contact":
      return runCrmUpdateContactNode(config, templateContext);
    case "crm_pipeline":
      return runCrmPipelineNode(config, templateContext);
    case "crm_tag":
      return runCrmTagNode(config, templateContext);
    case "email_sequence":
      return runEmailSequenceNode(config, templateContext);
    case "lead_score":
      return runLeadScoreNode(config, templateContext);
    case "sms_campaign":
      return runSmsCampaignNode(config, templateContext);
    case "landing_page":
      return runLandingPageNode(config, templateContext);

    // ── Utilities
    case "set_variable":
      return runSetVariableNode(config, templateContext);
    case "get_variable":
      return runGetVariableNode(config, templateContext);
    case "log":
      return runLogNode(config, templateContext);
    case "respond_webhook":
      return runRespondWebhookNode(config, templateContext);
    case "note":
      return runNoteNode();
    // "sub_workflow" is NOT in IMPLEMENTED_TYPES (see that Set's closing
    // comment above) — it's caught by the check at the top of this
    // function and never reaches this switch. Disclosed as
    // notImplemented rather than faked: it genuinely needs re-entrant
    // subgraph execution support this executor doesn't have yet.

    default:
      // Unreachable given the IMPLEMENTED_TYPES check above, but kept as
      // a defensive fallback rather than letting an unhandled case throw.
      return { ok: false, notImplemented: true, error: `No handler wired for "${node.type}".` };
  }
}
