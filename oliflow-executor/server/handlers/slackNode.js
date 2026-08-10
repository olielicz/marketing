/**
 * Real "slack" node — posts a genuine message to a Slack channel via
 * Slack's real Web API (chat.postMessage), using a bot token the user
 * provides as a workflow variable. See integrationCredentials.js's
 * header comment for why credentials never live in node config.
 *
 * Config: { channel: "#general", message: "{{trigger.body.text}}" }
 * Requires workflow variable: slack_token (a real Slack Bot token,
 * starts with "xoxb-", from https://api.slack.com/apps -> OAuth & Permissions).
 */
import { resolveTemplate } from "../templateEngine.js";
import { resolveCreds, fetchJson } from "./integrationCredentials.js";

export async function runSlackNode(config, templateContext) {
  const credsResult = resolveCreds(templateContext.vars, "slack", ["token"]);
  if (!credsResult.ok) return credsResult;

  const channel = resolveTemplate(String(config.channel ?? ""), templateContext);
  const message = resolveTemplate(String(config.message ?? ""), templateContext);
  if (!channel) return { ok: false, error: "This node's config needs a non-empty 'channel' field." };

  const { httpOk, json, networkError } = await fetchJson("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${credsResult.creds.token}` },
    body: JSON.stringify({ channel, text: message }),
  });

  if (networkError) return { ok: false, error: networkError };
  // Slack's Web API always returns HTTP 200 even on failure, with a real
  // ok:false + error field in the body — checking json.ok (not just the
  // HTTP status) is required for a genuinely honest result here.
  if (!json || json.ok !== true) {
    return { ok: false, error: `Slack API error: ${json?.error || "unknown error"}` };
  }
  return { ok: true, result: { ts: json.ts, channel: json.channel } };
}
