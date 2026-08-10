/**
 * Real "whatsapp" node — sends a genuine WhatsApp message via Meta's
 * real WhatsApp Cloud API (the standard, documented way to send
 * WhatsApp messages programmatically without a third-party BSP —
 * requires the sender to have set up a real WhatsApp Business
 * Platform phone number).
 *
 * Config: { to: "15551234567", message: "{{trigger.body.text}}" }
 *   (note: `to` is a phone number in international format WITHOUT a
 *   leading "+", per the Cloud API's own documented format)
 * Requires workflow variables: whatsapp_phone_number_id (from Meta's
 * WhatsApp Business Platform dashboard), whatsapp_access_token (a real
 * Meta access token with whatsapp_business_messaging permission).
 */
import { resolveTemplate } from "../templateEngine.js";
import { resolveCreds, fetchJson } from "./integrationCredentials.js";

export async function runWhatsappNode(config, templateContext) {
  const credsResult = resolveCreds(templateContext.vars, "whatsapp", ["phone_number_id", "access_token"]);
  if (!credsResult.ok) return credsResult;
  const { phone_number_id, access_token } = credsResult.creds;

  const to = resolveTemplate(String(config.to ?? ""), templateContext);
  const message = resolveTemplate(String(config.message ?? ""), templateContext);
  if (!to) return { ok: false, error: "This node's config needs a non-empty 'to' field." };

  const { httpOk, status, json, networkError } = await fetchJson(
    `https://graph.facebook.com/v18.0/${phone_number_id}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${access_token}` },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: message },
      }),
    }
  );

  if (networkError) return { ok: false, error: networkError };
  if (!httpOk) return { ok: false, error: `WhatsApp Cloud API error (${status}): ${json?.error?.message || "unknown error"}` };
  return { ok: true, result: { messageId: json.messages?.[0]?.id } };
}
