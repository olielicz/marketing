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
import { generateSupportAnswer } from "./supportAssistant.js";
import {
  listSupportTickets,
  getSupportTicket,
  createSupportTicket,
  updateSupportTicketStatus,
  deleteSupportTicket,
  createActiveTrigger,
  listActiveTriggers,
  getActiveTrigger,
  deleteActiveTrigger,
  getTriggerFireLog,
  getLandingPage,
  recordTriggerFire,
} from "./store.js";
import { startScheduler } from "./scheduler.js";

const PORT = Number(process.env.PORT) || 4400;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

// Mirrors the frontend's own trigger-type detection
// (`getNodeDef(n.type).inputs.length === 0`). All 6 trigger types the
// frontend's NODE_LIBRARY defines now have a real backend implementation
// — see executor.js's IMPLEMENTED_TYPES and scheduler.js for how
// schedule/db_trigger/api_trigger actually fire a run on their own
// (webhook/email_trigger/form_trigger fire from an inbound HTTP request
// instead — see the /api/hooks/* and /api/triggers/*/email|form routes
// below).
const TRIGGER_TYPES = new Set(["webhook", "schedule", "email_trigger", "form_trigger", "db_trigger", "api_trigger"]);
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

    /* ------------------------------ AI Support Assistant (public) ------------------------------ */
    // Public, unlike POST /api/execute — a user asking "why is my
    // workflow not triggering" needs to be able to get help even if
    // their admin-auth token is expired or misconfigured, which is
    // often exactly the problem they're asking about. See
    // supportAssistant.js's header comment for the three-tier honesty
    // pattern (knowledge base -> optional real AI -> real ticket
    // escalation) shared with oliops-backend and olicommerce-backend.
    if (req.method === "POST" && url.pathname === "/api/support/chat") {
      const body = await readJsonBody(req);
      const message = String(body.message || "").trim();
      if (!message) return send(res, 400, { error: "message is required" });

      const result = await generateSupportAnswer(message, {
        history: Array.isArray(body.history) ? body.history : [],
        useAi: Boolean(body.useAi),
        openaiApiKey: process.env.OPENAI_API_KEY,
        openaiApiBaseUrl: process.env.OPENAI_API_BASE_URL,
        openaiModel: process.env.OPENAI_MODEL,
      });

      let ticket = null;
      if (result.shouldEscalate) {
        ticket = await createSupportTicket({
          subject: message.slice(0, 120),
          transcript: [...(Array.isArray(body.history) ? body.history : []), { role: "user", content: message }, { role: "assistant", content: result.answer }],
          contactEmail: body.contactEmail || "",
          contactName: body.contactName || "",
          reason: `assistant_not_confident (source: ${result.source})`,
        });
      }

      return send(res, 200, { ...result, ticketId: ticket ? ticket.id : null });
    }

    // Creating a ticket is deliberately PUBLIC (mirrors /api/support/chat's
    // escalation path above — a user locked out of admin-auth still needs
    // to be able to reach a human). Every other ticket operation below
    // (list/view/close/reopen/delete) requires a real admin-auth session.
    if (req.method === "POST" && url.pathname === "/api/support/tickets") {
      const body = await readJsonBody(req);
      const ticket = await createSupportTicket({
        subject: body.subject || "Support request",
        transcript: Array.isArray(body.transcript) ? body.transcript : [],
        contactEmail: body.contactEmail || "",
        contactName: body.contactName || "",
        reason: body.reason || "manual_request",
      });
      return send(res, 201, { ticket });
    }

    if (url.pathname === "/api/support/tickets" || url.pathname.startsWith("/api/support/tickets/")) {
      if (!(await requireAdmin(req))) return send(res, 401, { error: "unauthorized" });

      if (req.method === "GET" && url.pathname === "/api/support/tickets") {
        const status = url.searchParams.get("status") || undefined;
        return send(res, 200, { tickets: await listSupportTickets({ status }) });
      }
      if (req.method === "GET" && url.pathname.startsWith("/api/support/tickets/")) {
        const id = url.pathname.split("/")[4];
        const ticket = await getSupportTicket(id);
        if (!ticket) return send(res, 404, { error: "not_found" });
        return send(res, 200, { ticket });
      }
      if (req.method === "POST" && /^\/api\/support\/tickets\/[^/]+\/close$/.test(url.pathname)) {
        const id = url.pathname.split("/")[4];
        const ticket = await updateSupportTicketStatus(id, "closed");
        if (!ticket) return send(res, 404, { error: "not_found" });
        return send(res, 200, { ticket });
      }
      if (req.method === "POST" && /^\/api\/support\/tickets\/[^/]+\/reopen$/.test(url.pathname)) {
        const id = url.pathname.split("/")[4];
        const ticket = await updateSupportTicketStatus(id, "open");
        if (!ticket) return send(res, 404, { error: "not_found" });
        return send(res, 200, { ticket });
      }
      if (req.method === "DELETE" && url.pathname.startsWith("/api/support/tickets/")) {
        const id = url.pathname.split("/")[4];
        const deleted = await deleteSupportTicket(id);
        return send(res, deleted ? 200 : 404, { ok: deleted });
      }
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

    /* ------------------------------ Active Triggers (schedule/db_trigger/api_trigger/email_trigger/form_trigger) ------------------------------ */
    // These make a workflow whose ONLY trigger is one of the 5 new
    // trigger types actually run on its own — see scheduler.js's header
    // comment for the real (disclosed, zero-dependency) polling design
    // behind schedule/db_trigger/api_trigger, and the dedicated
    // email/form webhook routes further below for the other two.
    // Registering/managing a trigger is gated behind admin auth (it can
    // make this server poll arbitrary URLs/databases and execute
    // arbitrary workflows on a timer — the same sensitivity as
    // POST /api/execute itself).
    if (req.method === "POST" && url.pathname === "/api/triggers") {
      if (!(await requireAdmin(req))) return send(res, 401, { error: "unauthorized" });
      const body = await readJsonBody(req);
      if (!TRIGGER_TYPES.has(body.type) || body.type === "webhook") {
        return send(res, 400, { error: `type must be one of: schedule, email_trigger, form_trigger, db_trigger, api_trigger.` });
      }
      if (!body.workflow || !Array.isArray(body.workflow.nodes)) {
        return send(res, 400, { error: "Request body must include a 'workflow' object with a 'nodes' array." });
      }
      const trigger = await createActiveTrigger({ type: body.type, workflow: body.workflow, config: body.config || {} });
      return send(res, 201, { trigger });
    }

    if (req.method === "GET" && url.pathname === "/api/triggers") {
      if (!(await requireAdmin(req))) return send(res, 401, { error: "unauthorized" });
      return send(res, 200, { triggers: await listActiveTriggers() });
    }

    if (req.method === "GET" && /^\/api\/triggers\/[^/]+\/log$/.test(url.pathname)) {
      if (!(await requireAdmin(req))) return send(res, 401, { error: "unauthorized" });
      const id = url.pathname.split("/")[3];
      return send(res, 200, { log: await getTriggerFireLog(id) });
    }

    if (req.method === "DELETE" && /^\/api\/triggers\/[^/]+$/.test(url.pathname)) {
      if (!(await requireAdmin(req))) return send(res, 401, { error: "unauthorized" });
      const id = url.pathname.split("/")[3];
      const deleted = await deleteActiveTrigger(id);
      return send(res, deleted ? 200 : 404, { ok: deleted });
    }

    // Real inbound entry points for email_trigger/form_trigger — these
    // fire IMMEDIATELY on request (not polled), exactly like the
    // existing generic webhook flow, but as their own semantically
    // distinct URL so e.g. Mailgun's inbound-parse webhook or a
    // Formspree/Netlify Forms submission hook can target this trigger
    // specifically. PUBLIC (no admin auth) — an inbound email/form
    // provider can't complete an OAuth-style login dance; matches how
    // the general webhook flow (POST /api/execute for a "webhook" node)
    // is reached via a real per-workflow secret instead (see the
    // workflow-level auth already documented for that flow).
    if (req.method === "POST" && /^\/api\/triggers\/[^/]+\/(email|form)$/.test(url.pathname)) {
      // url.pathname.split("/") on "/api/triggers/<id>/<kind>" yields
      // ["", "api", "triggers", "<id>", "<kind>"] — indices 3 and 4.
      const parts = url.pathname.split("/");
      const id = parts[3];
      const kind = parts[4];
      const trigger = await getActiveTrigger(id);
      if (!trigger) return send(res, 404, { error: "not_found" });
      if (trigger.type !== `${kind}_trigger`) {
        return send(res, 400, { error: `This trigger is registered as "${trigger.type}", not "${kind}_trigger".` });
      }
      const body = await readJsonBody(req);
      const executionId = randomUUID();
      const result = await executeWorkflow(trigger.workflow, {
        triggerPayload: body,
        vars: trigger.workflow.vars || {},
        isTriggerType: (type) => type === trigger.type,
        executionId,
      });
      // Recorded in the SAME real fire log GET /api/triggers/:id/log
      // reads (see scheduler.js's recordTriggerFire) — an inbound
      // email/form submission is a genuine "fire" of this trigger, same
      // as a scheduler-polled one, so it belongs in the same log rather
      // than being invisible there.
      const anyFailed = result.nodeResults.some((r) => r.ok === false && !r.notImplemented);
      await recordTriggerFire(id, { ok: !anyFailed, executionId });
      if (result.respondWith) {
        return send(res, result.respondWith.statusCode, result.respondWith.body);
      }
      return send(res, 200, result);
    }

    /* ------------------------------ Landing pages (landing_page node) ------------------------------ */
    // Real, publicly-servable pages a workflow published via the
    // "landing_page" node (see crmNodes.js's runLandingPageNode()) — see
    // store.js's createLandingPage()/getLandingPage() for the honest,
    // disclosed scope (one static HTML page per slug, no page builder).
    if (req.method === "GET" && /^\/lp\/[a-z0-9-]+$/.test(url.pathname)) {
      const slug = url.pathname.split("/")[2];
      const page = await getLandingPage(slug);
      if (!page) return send(res, 404, { error: "not_found" });
      const html = page.html;
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Length": Buffer.byteLength(html) });
      return res.end(html);
    }

    return send(res, 404, { error: "not_found" });
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: "internal_error", message: err.message });
  }
});

// Guarded the same way as ../oliops-backend/server/index.js and
// ../olicommerce-backend/server/index.js: only auto-listen when this
// file is run directly (`node server/index.js`), not when imported by
// a test file that wants to control its own listen()/close() lifecycle
// (see test/supportServer.test.js).
if (import.meta.url === `file://${process.argv[1]}`) {
  server.listen(PORT, () => {
    console.log(`OliFlow Executor Server listening on http://localhost:${PORT}`);
  });
  // Real background polling for schedule/db_trigger/api_trigger active
  // triggers — see scheduler.js's header comment. Not started when this
  // module is only imported by a test file (matching the same
  // listen()-guard pattern above), so tests control their own lifecycle
  // and don't leave a stray interval timer running after the test
  // process's assertions finish.
  startScheduler();
}

export { server };
