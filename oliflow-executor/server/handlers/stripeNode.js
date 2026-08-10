/**
 * Real "stripe" node — calls Stripe's real REST API directly (no SDK
 * needed; Stripe's API is plain form-encoded REST with Basic Auth using
 * the secret key as the username, exactly per Stripe's own docs).
 *
 * Config: { operation: "create_customer", email: "{{trigger.body.email}}", name: "{{trigger.body.name}}" }
 *      or: { operation: "create_payment_link", priceId: "price_...", quantity: 1 }
 *      or: { operation: "get_customer", customerId: "cus_..." }
 * Requires workflow variable: stripe_secret_key (a real Stripe secret key, "sk_...").
 */
import { resolveTemplate } from "../templateEngine.js";
import { resolveCreds, fetchJson } from "./integrationCredentials.js";

async function stripeRequest(secretKey, method, path, formBody) {
  const basicAuth = Buffer.from(`${secretKey}:`, "utf8").toString("base64");
  const options = { method, headers: { Authorization: `Basic ${basicAuth}` } };
  if (formBody) {
    options.headers["Content-Type"] = "application/x-www-form-urlencoded";
    options.body = formBody;
  }
  return fetchJson(`https://api.stripe.com/v1${path}`, options);
}

export async function runStripeNode(config, templateContext) {
  const credsResult = resolveCreds(templateContext.vars, "stripe", ["secret_key"]);
  if (!credsResult.ok) return credsResult;
  const { secret_key } = credsResult.creds;

  const operation = config.operation || "create_customer";

  if (operation === "create_customer") {
    const email = resolveTemplate(String(config.email ?? ""), templateContext);
    const name = resolveTemplate(String(config.name ?? ""), templateContext);
    const body = new URLSearchParams({ ...(email && { email }), ...(name && { name }) }).toString();
    const { httpOk, status, json, networkError } = await stripeRequest(secret_key, "POST", "/customers", body);
    if (networkError) return { ok: false, error: networkError };
    if (!httpOk) return { ok: false, error: `Stripe API error (${status}): ${json?.error?.message || "unknown error"}` };
    return { ok: true, result: { customerId: json.id, email: json.email } };
  }

  if (operation === "get_customer") {
    const customerId = resolveTemplate(String(config.customerId ?? ""), templateContext);
    if (!customerId) return { ok: false, error: "This node's config needs a non-empty 'customerId' field for get_customer." };
    const { httpOk, status, json, networkError } = await stripeRequest(secret_key, "GET", `/customers/${customerId}`);
    if (networkError) return { ok: false, error: networkError };
    if (!httpOk) return { ok: false, error: `Stripe API error (${status}): ${json?.error?.message || "unknown error"}` };
    return { ok: true, result: json };
  }

  if (operation === "create_payment_link") {
    const priceId = resolveTemplate(String(config.priceId ?? ""), templateContext);
    const quantity = Number(config.quantity ?? 1);
    if (!priceId) return { ok: false, error: "This node's config needs a non-empty 'priceId' field for create_payment_link." };
    const body = new URLSearchParams({ "line_items[0][price]": priceId, "line_items[0][quantity]": String(quantity) }).toString();
    const { httpOk, status, json, networkError } = await stripeRequest(secret_key, "POST", "/payment_links", body);
    if (networkError) return { ok: false, error: networkError };
    if (!httpOk) return { ok: false, error: `Stripe API error (${status}): ${json?.error?.message || "unknown error"}` };
    return { ok: true, result: { paymentLinkId: json.id, url: json.url } };
  }

  return { ok: false, error: `Unknown Stripe operation: "${operation}". Use create_customer, get_customer, or create_payment_link.` };
}
