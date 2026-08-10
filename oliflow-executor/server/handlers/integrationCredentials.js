/**
 * Shared credential-resolution helper for every third-party integration
 * node (slack, notion, airtable, openai, twilio, stripe, shopify,
 * supabase, paypal_node, whatsapp, calendar, google_sheets). Same
 * principle as emailSendNode.js/databaseNode.js: real API
 * keys/tokens/secrets are read from WORKFLOW VARIABLES, never from the
 * node's own config JSON (which is part of the workflow definition
 * itself — the same object a user might export/share/commit) or hardcoded
 * anywhere in this codebase. Each integration has its own documented
 * variable-name prefix (see README.md's "Integration nodes" section)
 * so a single workflow can hold e.g. both `slack_token` and
 * `notion_token` as separate, clearly-scoped variables.
 */

/**
 * @param {object} vars - templateContext.vars
 * @param {string} prefix - e.g. "slack", "stripe"
 * @param {string[]} required - variable name suffixes that MUST be
 *   present, e.g. ["token"] -> requires vars[`${prefix}_token`]
 * @returns {{ ok:true, creds: object } | { ok:false, error:string }}
 */
export function resolveCreds(vars, prefix, required) {
  const creds = {};
  const missing = [];
  for (const key of required) {
    const varName = `${prefix}_${key}`;
    const value = vars ? vars[varName] : undefined;
    if (!value) missing.push(varName);
    creds[key] = value;
  }
  if (missing.length) {
    return {
      ok: false,
      error: `Missing required workflow variable(s): ${missing.join(", ")}. Set these in the Variables tab — see README.md's "Integration nodes" section for what each integration needs.`,
    };
  }
  return { ok: true, creds };
}

/** Real outbound fetch with a timeout, shared by every integration node — same AbortController pattern as httpRequestNode.js, applied to fixed, known API hosts rather than a user-supplied URL. */
export async function fetchJson(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // Non-JSON response (some APIs return plain text on certain
      // errors) — surfaced via `raw` so a handler can still report the
      // real response body rather than silently swallowing it.
    }
    return { httpOk: res.ok, status: res.status, json, raw: text };
  } catch (err) {
    if (err.name === "AbortError") {
      return { httpOk: false, status: 0, json: null, raw: "", networkError: `Request timed out after ${timeoutMs}ms.` };
    }
    return { httpOk: false, status: 0, json: null, raw: "", networkError: err.message };
  } finally {
    clearTimeout(timer);
  }
}
