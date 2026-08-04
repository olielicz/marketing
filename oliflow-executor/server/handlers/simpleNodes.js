/**
 * Real implementations of the remaining "simple" node types that need no
 * third-party credentials: delay, set_fields, get_variable/set_variable,
 * log, respond_webhook, note. Each config shape matches exactly what the
 * frontend's config panel already collects/documents (see
 * oliflow/app/index.html) except where noted.
 */
import { resolveTemplate, resolveTemplateDeep } from "../templateEngine.js";

const UNIT_TO_MS = { seconds: 1000, minutes: 60000, hours: 3600000, days: 86400000 };

/** Real implementation of "delay" — genuinely waits, doesn't just simulate a log line about waiting. */
export async function runDelayNode(config) {
  const duration = Number(config.duration) || 60;
  const unitMs = UNIT_TO_MS[config.unit] || UNIT_TO_MS.seconds;
  const totalMs = duration * unitMs;

  // Real safety cap: an executor process holding a request open for days
  // is not viable for a synchronous HTTP-triggered run (see
  // server/index.js's own timeout). Anything longer than 5 minutes in a
  // single synchronous execution is almost certainly a workflow that
  // should be scheduled instead (see the "schedule" trigger type, not yet
  // implemented — see README's Known limitations) rather than blocking a
  // live request.
  const MAX_SYNC_DELAY_MS = 5 * 60 * 1000;
  if (totalMs > MAX_SYNC_DELAY_MS) {
    return {
      ok: false,
      error: `Delay of ${duration} ${config.unit || "seconds"} (${totalMs}ms) exceeds the ${MAX_SYNC_DELAY_MS / 1000}s max for a single synchronous execution. Split this into a scheduled/multi-step workflow instead.`,
    };
  }

  await new Promise((resolve) => setTimeout(resolve, totalMs));
  return { ok: true, waitedMs: totalMs };
}

/**
 * "set_fields" — the frontend's default UI for unrecognized/generic node
 * types falls back to a raw JSON config textarea (see index.html's
 * `default:` case in renderCpSettings — "Configuration (JSON)... Use
 * {{variable}} for dynamic values"), which is exactly what set_fields
 * uses in practice. This resolves every {{...}} placeholder in that JSON
 * object and returns the result as this node's output — i.e. it "sets"
 * output fields from a template.
 */
export function runSetFieldsNode(config, templateContext) {
  const fields = config.fields || config; // tolerate either a `fields` sub-object or the whole config being the field map
  try {
    return { ok: true, result: resolveTemplateDeep(fields, templateContext) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/** "set_variable" — writes a workflow-level variable, returned to the caller to persist. */
export function runSetVariableNode(config, templateContext) {
  const name = config.name;
  if (!name) return { ok: false, error: "set_variable requires a 'name' in its config." };
  const value = resolveTemplate(String(config.value ?? ""), templateContext);
  return { ok: true, name, value };
}

/** "get_variable" — reads a workflow-level variable. */
export function runGetVariableNode(config, templateContext) {
  const name = config.name;
  if (!name) return { ok: false, error: "get_variable requires a 'name' in its config." };
  const value = templateContext.vars ? templateContext.vars[name] : undefined;
  if (value === undefined) {
    return { ok: false, error: `Variable "${name}" is not set.` };
  }
  return { ok: true, name, value };
}

/** "log" — writes a real server-side log line (visible in the executor's own process logs), not a simulated UI-only entry. */
export function runLogNode(config, templateContext) {
  const message = resolveTemplate(config.message || "", templateContext);
  const line = `[oliflow:${templateContext.workflowId || "?"}:${templateContext.executionId || "?"}] ${message}`;
  console.log(line);
  return { ok: true, logged: message };
}

/**
 * "respond_webhook" — for workflows triggered by an inbound webhook (see
 * server/index.js's POST /api/execute), this node's config becomes the
 * HTTP response sent back to whoever called the webhook, instead of the
 * generic default response every workflow would otherwise get.
 */
export function runRespondWebhookNode(config, templateContext) {
  const statusCode = Number(config.statusCode) || 200;
  let body = config.body;
  if (typeof body === "string") body = resolveTemplate(body, templateContext);
  else if (body && typeof body === "object") body = resolveTemplateDeep(body, templateContext);
  return { ok: true, statusCode, body };
}

/** "note" — a pure documentation node; it does nothing at execution time by design (matches the frontend, which never executes note nodes for real either). */
export function runNoteNode() {
  return { ok: true, skipped: true, reason: "Note nodes are documentation-only and are not executed." };
}
