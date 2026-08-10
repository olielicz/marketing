/**
 * Resolves the `{{variable}}` template syntax the OliFlow app's config
 * panel UI already documents (see oliflow/app/index.html's
 * `getAvailableVars()` and per-node-type config hints, e.g. http_request's
 * "Use {{variable}} or {{node.output.field}} for dynamic values").
 *
 * Supported paths:
 *   {{now}}                     -> current ISO timestamp
 *   {{date}}                    -> current date, YYYY-MM-DD
 *   {{workflow_id}}             -> the workflow's id
 *   {{execution_id}}            -> this run's id
 *   {{trigger.body.foo.bar}}    -> dot-path into the trigger payload
 *   {{vars.someVariable}}       -> a workflow-level variable
 *   {{Node Label.output}}       -> another node's last output (by its
 *                                  label, matching what getAvailableVars()
 *                                  in the frontend actually generates)
 *
 * This is intentionally a small, string-substitution templating engine —
 * not a general expression language (no arithmetic, no conditionals
 * inside `{{ }}`). That matches what the existing UI promises; anything
 * more would be a scope increase beyond porting the documented behavior.
 */

function getPath(obj, pathStr) {
  if (obj === undefined || obj === null) return undefined;
  const parts = pathStr.split(".");
  let current = obj;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }
  return current;
}

/**
 * @param {string} template - a string possibly containing {{...}} placeholders
 * @param {object} context - { now, date, workflowId, executionId, trigger, vars, nodeOutputsByLabel }
 * @returns {string}
 */
export function resolveTemplate(template, context) {
  if (typeof template !== "string") return template;

  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, rawPath) => {
    const path = rawPath.trim();

    if (path === "now") return context.now;
    if (path === "date") return context.date;
    if (path === "workflow_id") return context.workflowId ?? "";
    if (path === "execution_id") return context.executionId ?? "";
    // Real (not decorative) support for the "loop" node's per-iteration
    // index — see handlers/logicNodes.js's runLoopNode(), which sets
    // context.index for each item it processes. Absent outside a loop
    // iteration (undefined), matching every other "unknown path" case
    // below rather than silently returning 0.
    if (path === "index" && context.index !== undefined) return String(context.index);

    if (path.startsWith("trigger.")) {
      const value = getPath(context.trigger, path.slice("trigger.".length));
      return value === undefined ? match : stringifyValue(value);
    }

    if (path.startsWith("vars.")) {
      const key = path.slice("vars.".length);
      const value = context.vars ? context.vars[key] : undefined;
      return value === undefined ? match : stringifyValue(value);
    }

    // {{Some Node Label.output}} or {{Some Node Label.someField}} — looked
    // up by label to match exactly what the frontend's getAvailableVars()
    // generates for the user to click-to-copy.
    const dotIndex = path.indexOf(".");
    if (dotIndex > 0) {
      const label = path.slice(0, dotIndex);
      const rest = path.slice(dotIndex + 1);
      const nodeOutput = context.nodeOutputsByLabel ? context.nodeOutputsByLabel[label] : undefined;
      if (nodeOutput !== undefined) {
        const value = rest === "output" ? nodeOutput : getPath(nodeOutput, rest);
        return value === undefined ? match : stringifyValue(value);
      }
    }

    // Unknown path — leave the placeholder as-is rather than silently
    // dropping it, so a misconfigured node produces an obviously wrong
    // ("{{typo.path}}" showing up literally) result instead of quietly
    // sending empty strings to a real HTTP request/email/Slack message.
    return match;
  });
}

function stringifyValue(value) {
  if (value === null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Recursively resolves template placeholders in every string value of an
 * object/array (used for e.g. HTTP request headers/body JSON where any
 * field might contain a {{...}} placeholder).
 */
export function resolveTemplateDeep(value, context) {
  if (typeof value === "string") return resolveTemplate(value, context);
  if (Array.isArray(value)) return value.map((v) => resolveTemplateDeep(v, context));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveTemplateDeep(v, context);
    return out;
  }
  return value;
}

/**
 * Node types with no dedicated config-panel UI in the frontend (see
 * oliflow/app/index.html's renderCpSettings() `default:` case) get a
 * generic "Configuration (JSON)" textarea instead, saved as
 * node.config.json (a JSON STRING, since saveNodeConfig() just copies
 * every cp-* input's raw .value). Every new node type added in this pass
 * uses that same generic fallback (no new frontend config panel was
 * built for each of the 37 new types individually — that would be a
 * much larger frontend change). This helper makes every new handler
 * tolerant of BOTH shapes: a real structured config object (e.g. if a
 * future dedicated panel is added, or a workflow JSON is authored/
 * imported directly with a proper object), or today's generic
 * `{ json: '{"...": "..."}' }` string fallback — never crashes on
 * invalid JSON, just falls back to an empty object so a handler's own
 * field-specific validation can produce an honest, specific error
 * instead of an opaque parse exception.
 */
export function normalizeNodeConfig(config) {
  if (!config) return {};
  if (typeof config.json === "string" && config.json.trim()) {
    try {
      const parsed = JSON.parse(config.json);
      if (parsed && typeof parsed === "object") return { ...config, ...parsed };
    } catch {
      // Invalid JSON in the fallback textarea — fall through and let the
      // caller's own required-field checks produce a specific, honest
      // error rather than throwing here.
    }
  }
  return config;
}

export function buildBaseContext({ workflowId, executionId, trigger, vars, nodeOutputsByLabel }) {
  const now = new Date();
  return {
    now: now.toISOString(),
    date: now.toISOString().slice(0, 10),
    workflowId,
    executionId,
    trigger: trigger || {},
    vars: vars || {},
    nodeOutputsByLabel: nodeOutputsByLabel || {},
  };
}
