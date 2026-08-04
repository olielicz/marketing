/**
 * OliFlow Executor Server — a real backend that runs OliFlow workflows,
 * replacing the frontend's simulated engine (setTimeout + Math.random(),
 * see oliflow/app/index.html's runWorkflow()) for the node types listed
 * in executor.js's IMPLEMENTED_TYPES. Zero external dependencies (only
 * Node's built-in `http`, `crypto`, `net`, `tls`, `vm`), matching the
 * pattern of every other backend service in this repo.
 *
 * Start with:  node server/index.js
 * See README.md for setup, node-type coverage, and how to wire the
 * frontend's Run/Activate buttons to actually call this.
 */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { executeWorkflow } from "./executor.js";
import { requireAdmin } from "./adminAuth.js";

const PORT = Number(process.env.PORT) || 4400;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

// Mirrors the frontend's own trigger-type detection
// (`getNodeDef(n.type).inputs.length === 0`), restricted to trigger types
// this executor's inbound-webhook entry point actually originates from.
// If you add more trigger types to the frontend's NODE_LIBRARY (schedule,
// email_trigger, form_trigger, db_trigger, api_trigger - none of which
// have a real backend implementation yet, see README.md), add them here
// too once they have a real handler, so getExecutionOrder() recognizes
// them as valid starting points.
const TRIGGER_TYPES = new Set(["webhook"]);
const isTriggerType = (type) => TRIGGER_TYPES.has(type);

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 5_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(json),
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(json);
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      });
      return res.end();
    }

    const url = new URL(req.url, `http://localhost:${PORT}`);

    if (req.method === "GET" && url.pathname === "/api/health") {
      return send(res, 200, { ok: true });
    }

    // POST /api/execute  { workflow, triggerPayload?, vars? }  [admin]
    // -> { executionId, nodeResults, respondWith, finalVars }
    //
    // `workflow` is the EXACT object the frontend already has as
    // `currentWf()` — nodes/connections/etc — so the app's own "Save"
    // button output can be POSTed here as-is (see README.md's "Wiring
    // the frontend" section for the small change needed in
    // oliflow/app/index.html's runWorkflow() to call this instead of
    // simulating).
    //
    // ⚠️ Gated behind owner auth deliberately aggressively (see
    // adminAuth.js's comment) — a `code` node runs arbitrary JS (sandboxed,
    // see codeNode.js) and `http_request` can reach arbitrary URLs.
    if (req.method === "POST" && url.pathname === "/api/execute") {
      if (!(await requireAdmin(req))) return send(res, 401, { error: "unauthorized" });

      const body = await readJsonBody(req);
      const workflow = body.workflow;
      if (!workflow || !Array.isArray(workflow.nodes)) {
        return send(res, 400, { error: "Request body must include a 'workflow' object with a 'nodes' array." });
      }

      const executionId = body.executionId || randomUUID();
      const result = await executeWorkflow(workflow, {
        triggerPayload: body.triggerPayload || {},
        vars: body.vars || workflow.variables || {},
        isTriggerType,
        executionId,
      });

      if (result.respondWith) {
        // A respond_webhook node ran — its config determines what THIS
        // HTTP response looks like, not a generic wrapper. Matches how a
        // real webhook-triggered workflow (n8n, Zapier "Webhooks by
        // Zapier") lets the workflow itself shape the response.
        return send(res, result.respondWith.statusCode, result.respondWith.body);
      }

      return send(res, 200, result);
    }

    return send(res, 404, { error: "not_found" });
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: "internal_error", message: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`OliFlow Executor Server listening on http://localhost:${PORT}`);
});
