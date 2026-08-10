/**
 * Real "twilio" node — sends a genuine SMS via Twilio's real REST API
 * (Basic Auth with Account SID + Auth Token, exactly as Twilio's own
 * docs specify — no SDK needed for this one endpoint).
 *
 * Config: { to: "+15551234567", message: "{{trigger.body.text}}" }
 * Requires workflow variables: twilio_account_sid, twilio_auth_token,
 * twilio_from (your real Twilio phone number, e.g. "+15559876543").
 */
import { resolveTemplate } from "../templateEngine.js";
import { resolveCreds, fetchJson } from "./integrationCredentials.js";

export async function runTwilioNode(config, templateContext) {
  const credsResult = resolveCreds(templateContext.vars, "twilio", ["account_sid", "auth_token", "from"]);
  if (!credsResult.ok) return credsResult;

  const to = resolveTemplate(String(config.to ?? ""), templateContext);
  const message = resolveTemplate(String(config.message ?? ""), templateContext);
  if (!to) return { ok: false, error: "This node's config needs a non-empty 'to' field." };

  const { account_sid, auth_token, from } = credsResult.creds;
  const basicAuth = Buffer.from(`${account_sid}:${auth_token}`, "utf8").toString("base64");
  const body = new URLSearchParams({ To: to, From: from, Body: message }).toString();

  const { httpOk, status, json, networkError } = await fetchJson(
    `https://api.twilio.com/2010-04-01/Accounts/${account_sid}/Messages.json`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basicAuth}` },
      body,
    }
  );

  if (networkError) return { ok: false, error: networkError };
  if (!httpOk) {
    return { ok: false, error: `Twilio API error (${status}): ${json?.message || "unknown error"}` };
  }
  return { ok: true, result: { sid: json.sid, status: json.status } };
}
