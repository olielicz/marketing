/**
 * Real "shopify" node — calls a real Shopify Admin REST API endpoint on
 * a merchant's own store (their own store domain + a real Admin API
 * access token — no OAuth flow needed for a private/custom app token,
 * matching how olicommerce-backend's own Shopify integration already
 * documents its own scope).
 *
 * Config: { operation: "get_order", orderId: "..." }
 *      or: { operation: "list_products", limit: 10 }
 *      or: { operation: "create_order", email: "...", lineItems: [{variantId:"...",quantity:1}] }
 * Requires workflow variables: shopify_shop_domain (e.g. "my-store.myshopify.com"),
 * shopify_access_token (a real Admin API access token, "shpat_...").
 */
import { resolveTemplate, resolveTemplateDeep } from "../templateEngine.js";
import { resolveCreds, fetchJson } from "./integrationCredentials.js";

const API_VERSION = "2024-01";

export async function runShopifyNode(config, templateContext) {
  const credsResult = resolveCreds(templateContext.vars, "shopify", ["shop_domain", "access_token"]);
  if (!credsResult.ok) return credsResult;
  const { shop_domain, access_token } = credsResult.creds;
  const base = `https://${shop_domain}/admin/api/${API_VERSION}`;
  const headers = { "X-Shopify-Access-Token": access_token, "Content-Type": "application/json" };

  const operation = config.operation || "list_products";

  if (operation === "get_order") {
    const orderId = resolveTemplate(String(config.orderId ?? ""), templateContext);
    if (!orderId) return { ok: false, error: "This node's config needs a non-empty 'orderId' field for get_order." };
    const { httpOk, status, json, networkError } = await fetchJson(`${base}/orders/${orderId}.json`, { headers });
    if (networkError) return { ok: false, error: networkError };
    if (!httpOk) return { ok: false, error: `Shopify API error (${status}): ${json?.errors || "unknown error"}` };
    return { ok: true, result: json.order };
  }

  if (operation === "list_products") {
    const limit = Number(config.limit ?? 10);
    const { httpOk, status, json, networkError } = await fetchJson(`${base}/products.json?limit=${limit}`, { headers });
    if (networkError) return { ok: false, error: networkError };
    if (!httpOk) return { ok: false, error: `Shopify API error (${status}): ${json?.errors || "unknown error"}` };
    return { ok: true, result: { products: json.products, count: json.products?.length ?? 0 } };
  }

  if (operation === "create_order") {
    const email = resolveTemplate(String(config.email ?? ""), templateContext);
    const lineItems = resolveTemplateDeep(config.lineItems || [], templateContext);
    const { httpOk, status, json, networkError } = await fetchJson(`${base}/orders.json`, {
      method: "POST",
      headers,
      body: JSON.stringify({ order: { email, line_items: lineItems, financial_status: "pending" } }),
    });
    if (networkError) return { ok: false, error: networkError };
    if (!httpOk) return { ok: false, error: `Shopify API error (${status}): ${JSON.stringify(json?.errors) || "unknown error"}` };
    return { ok: true, result: { orderId: json.order?.id, orderNumber: json.order?.order_number } };
  }

  return { ok: false, error: `Unknown Shopify operation: "${operation}". Use get_order, list_products, or create_order.` };
}
