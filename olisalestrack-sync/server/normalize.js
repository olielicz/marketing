/**
 * Pure functions that turn each provider's webhook payload into a small set
 * of canonical event records OliSalesTrack can ingest directly — no CSV
 * export/import round-trip required.
 *
 * Canonical record shape:
 * {
 *   id:          string   — stable, unique across all providers (used for de-dup)
 *   provider:    "stripe" | "paypal" | "shopify"
 *   type:        "sale" | "refund"
 *   amountCents: integer  — always positive; "type" carries the sign/meaning
 *   currency:    string   — lowercase ISO 4217, e.g. "usd"
 *   occurredAt:  string   — ISO 8601
 *   description: string   — short human-readable label for the OliSalesTrack UI
 * }
 *
 * Each normalize* function returns an ARRAY of records (never a single
 * object) because a couple of event types can reasonably map to more than
 * one record in the future (e.g. a partially-refunded order). Right now
 * every mapping produces exactly one record, but callers should always
 * treat the return value as a list.
 */

export function normalizeStripeEvent(event) {
  if (!event || typeof event !== "object") return [];
  const obj = event.data && event.data.object ? event.data.object : {};

  if (event.type === "charge.succeeded" || event.type === "checkout.session.completed") {
    const amount = obj.amount_total ?? obj.amount ?? 0;
    if (!amount) return [];
    return [
      {
        id: `stripe:${event.id}`,
        provider: "stripe",
        type: "sale",
        amountCents: Math.abs(amount),
        currency: String(obj.currency || "usd").toLowerCase(),
        occurredAt: new Date((event.created || Date.now() / 1000) * 1000).toISOString(),
        description: obj.description || `Stripe charge ${obj.id || ""}`.trim(),
      },
    ];
  }

  if (event.type === "charge.refunded" || event.type === "refund.created") {
    const amount = obj.amount_refunded ?? obj.amount ?? 0;
    if (!amount) return [];
    return [
      {
        id: `stripe:${event.id}`,
        provider: "stripe",
        type: "refund",
        amountCents: Math.abs(amount),
        currency: String(obj.currency || "usd").toLowerCase(),
        occurredAt: new Date((event.created || Date.now() / 1000) * 1000).toISOString(),
        description: obj.description || `Stripe refund ${obj.id || ""}`.trim(),
      },
    ];
  }

  // Unrecognized event type — ignored, not an error. Stripe sends many event
  // types we don't care about (customer.updated, invoice.paid, etc.).
  return [];
}

export function normalizeShopifyEvent(topic, payload) {
  if (!payload || typeof payload !== "object") return [];

  if (topic === "orders/create" || topic === "orders/paid") {
    const total = Number(payload.total_price || payload.current_total_price || 0);
    if (!total) return [];
    return [
      {
        id: `shopify:order:${payload.id}`,
        provider: "shopify",
        type: "sale",
        amountCents: Math.round(Math.abs(total) * 100),
        currency: String(payload.currency || "usd").toLowerCase(),
        occurredAt: payload.created_at || new Date().toISOString(),
        description: `Shopify order #${payload.order_number || payload.id}`,
      },
    ];
  }

  if (topic === "refunds/create") {
    const total = (payload.transactions || []).reduce(
      (sum, t) => sum + Number(t.amount || 0),
      0
    );
    if (!total) return [];
    return [
      {
        id: `shopify:refund:${payload.id}`,
        provider: "shopify",
        type: "refund",
        amountCents: Math.round(Math.abs(total) * 100),
        currency: String(payload.currency || payload.transactions?.[0]?.currency || "usd").toLowerCase(),
        occurredAt: payload.created_at || payload.processed_at || new Date().toISOString(),
        description: `Shopify refund for order #${payload.order_id}`,
      },
    ];
  }

  return [];
}

export function normalizePaypalEvent(event) {
  if (!event || typeof event !== "object") return [];
  const resource = event.resource || {};

  if (event.event_type === "PAYMENT.SALE.COMPLETED" || event.event_type === "CHECKOUT.ORDER.APPROVED") {
    const amount = resource.amount || {};
    const value = Number(amount.total ?? amount.value ?? 0);
    if (!value) return [];
    return [
      {
        id: `paypal:${event.id}`,
        provider: "paypal",
        type: "sale",
        amountCents: Math.round(Math.abs(value) * 100),
        currency: String(amount.currency ?? amount.currency_code ?? "usd").toLowerCase(),
        occurredAt: event.create_time || new Date().toISOString(),
        description: `PayPal payment ${resource.id || ""}`.trim(),
      },
    ];
  }

  if (event.event_type === "PAYMENT.SALE.REFUNDED" || event.event_type === "PAYMENT.CAPTURE.REFUNDED") {
    const amount = resource.amount || {};
    const value = Number(amount.total ?? amount.value ?? 0);
    if (!value) return [];
    return [
      {
        id: `paypal:${event.id}`,
        provider: "paypal",
        type: "refund",
        amountCents: Math.round(Math.abs(value) * 100),
        currency: String(amount.currency ?? amount.currency_code ?? "usd").toLowerCase(),
        occurredAt: event.create_time || new Date().toISOString(),
        description: `PayPal refund ${resource.id || ""}`.trim(),
      },
    ];
  }

  return [];
}
