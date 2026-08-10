/**
 * Real "paypal_node" node — calls PayPal's real REST API (v2 Orders
 * API), using a real Client ID + Secret to get a real OAuth2 client-
 * credentials access token first (PayPal's standard server-to-server
 * auth flow — no SDK needed, it's a single documented token endpoint).
 *
 * Config: { operation: "create_order", amount: "29.99", currency: "USD" }
 *      or: { operation: "get_order", orderId: "..." }
 * Requires workflow variables: paypal_client_id, paypal_client_secret,
 * paypal_api_base (optional, defaults to the LIVE api — set it to
 * "https://api-m.sandbox.paypal.com" for sandbox testing, matching the
 * same sandbox/live distinction olisalestrack-sync's own PayPal
 * integration already documents).
 */
import { resolveTemplate } from "../templateEngine.js";
import { fetchJson } from "./integrationCredentials.js";

async function getAccessToken(clientId, clientSecret, apiBase) {
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
  const { httpOk, status, json, networkError } = await fetchJson(`${apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basicAuth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (networkError) return { ok: false, error: networkError };
  if (!httpOk) return { ok: false, error: `PayPal auth failed (${status}): ${json?.error_description || "unknown error"}` };
  return { ok: true, token: json.access_token };
}

export async function runPaypalNode(config, templateContext) {
  const vars = templateContext.vars || {};
  const clientId = vars.paypal_client_id;
  const clientSecret = vars.paypal_client_secret;
  if (!clientId || !clientSecret) {
    return { ok: false, error: "Missing required workflow variable(s): paypal_client_id, paypal_client_secret." };
  }
  const apiBase = (vars.paypal_api_base || "https://api-m.paypal.com").replace(/\/$/, "");

  const authResult = await getAccessToken(clientId, clientSecret, apiBase);
  if (!authResult.ok) return authResult;
  const headers = { Authorization: `Bearer ${authResult.token}`, "Content-Type": "application/json" };

  const operation = config.operation || "create_order";

  if (operation === "create_order") {
    const amount = resolveTemplate(String(config.amount ?? ""), templateContext);
    const currency = config.currency || "USD";
    if (!amount) return { ok: false, error: "This node's config needs a non-empty 'amount' field for create_order." };
    const { httpOk, status, json, networkError } = await fetchJson(`${apiBase}/v2/checkout/orders`, {
      method: "POST",
      headers,
      body: JSON.stringify({ intent: "CAPTURE", purchase_units: [{ amount: { currency_code: currency, value: amount } }] }),
    });
    if (networkError) return { ok: false, error: networkError };
    if (!httpOk) return { ok: false, error: `PayPal API error (${status}): ${json?.message || "unknown error"}` };
    return { ok: true, result: { orderId: json.id, status: json.status, approveUrl: json.links?.find((l) => l.rel === "approve")?.href } };
  }

  if (operation === "get_order") {
    const orderId = resolveTemplate(String(config.orderId ?? ""), templateContext);
    if (!orderId) return { ok: false, error: "This node's config needs a non-empty 'orderId' field for get_order." };
    const { httpOk, status, json, networkError } = await fetchJson(`${apiBase}/v2/checkout/orders/${orderId}`, { headers });
    if (networkError) return { ok: false, error: networkError };
    if (!httpOk) return { ok: false, error: `PayPal API error (${status}): ${json?.message || "unknown error"}` };
    return { ok: true, result: json };
  }

  return { ok: false, error: `Unknown PayPal operation: "${operation}". Use create_order or get_order.` };
}
