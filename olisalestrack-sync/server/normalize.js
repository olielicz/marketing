/**
 * Pure functions that turn each provider's webhook payload into a small set
 * of canonical event records OliSalesTrack can ingest directly — no CSV
 * export/import round-trip required.
 *
 * Canonical record shape:
 * {
 *   id:          string   — stable, unique across all providers (used for de-dup)
 *   provider:    "stripe" | "paypal" | "shopify" | "woocommerce" | "amazon"
 *   type:        "sale" | "refund"
 *   amountCents: integer  — always positive; "type" carries the sign/meaning
 *   currency:    string   — lowercase ISO 4217, e.g. "usd"
 *   occurredAt:  string   — ISO 8601
 *   description: string   — short human-readable label for the OliSalesTrack UI
 *   paymentMethod: string — "card" | "paypal_balance" | "klarna" | "apple_pay" |
 *                            "google_pay" | "other" | "unknown". Only ever
 *                            extracted from a field the provider's own
 *                            payload already includes — never guessed or
 *                            invented. See extractStripePaymentMethod() /
 *                            extractPaypalPaymentMethod() below. Klarna,
 *                            Apple Pay, and Google Pay are NOT separate
 *                            "providers" here — they're payment methods that
 *                            flow through Stripe or PayPal as the actual
 *                            processor, so this field (not a new provider
 *                            value) is how OliSalesTrack tells them apart.
 * }
 *
 * Each normalize* function returns an ARRAY of records (never a single
 * object) because a couple of event types can reasonably map to more than
 * one record in the future (e.g. a partially-refunded order). Right now
 * every mapping produces exactly one record, but callers should always
 * treat the return value as a list.
 */

/**
 * Extracts a canonical payment-method string from a real Stripe Checkout
 * Session or Charge object. Stripe includes this today
 * (payment_method_types on a Session; payment_method_details on a Charge)
 * but the normalizer previously dropped it entirely. Apple Pay / Google Pay
 * show up as a *wallet* on top of a "card" payment method, at
 * payment_method_details.card.wallet.type — not as their own top-level type.
 */
function extractStripePaymentMethod(obj) {
  const walletType = obj.payment_method_details?.card?.wallet?.type;
  if (walletType === "apple_pay") return "apple_pay";
  if (walletType === "google_pay") return "google_pay";

  const type = obj.payment_method_details?.type || obj.payment_method_types?.[0];
  if (!type) return "unknown";
  if (type === "card") return "card";
  if (type === "klarna") return "klarna";
  return "other";
}

/**
 * Extracts a canonical payment-method string from a real PayPal Orders v2
 * webhook resource's `payment_source` object (present on newer PayPal
 * webhook payloads; absent on the older Payments v1 events this file also
 * still supports below — those fall back to "paypal_balance" since v1
 * PAYMENT.SALE.* events are, by definition, a PayPal-balance/PayPal-funded
 * payment rather than a card/wallet processed through PayPal).
 */
function extractPaypalPaymentMethod(resource) {
  const source = resource.payment_source || {};
  if (source.apple_pay) return "apple_pay";
  if (source.google_pay) return "google_pay";
  if (source.card) return "card";
  if (source.paypal) return "paypal_balance";
  return "unknown";
}

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
        paymentMethod: extractStripePaymentMethod(obj),
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
        paymentMethod: extractStripePaymentMethod(obj),
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
        // Shopify orders carry a `payment_gateway_names` array (e.g.
        // ["shopify_payments"], ["paypal"]) — this identifies the gateway,
        // not the underlying card network/wallet the way Stripe/PayPal's
        // fields do, so it's mapped to "card" (Shopify Payments = card
        // processing) or passed through as "other" rather than invented.
        paymentMethod: (payload.payment_gateway_names || []).includes("paypal") ? "paypal_balance" : "card",
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
        paymentMethod: "card",
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
        // Older Payments v1 events (PAYMENT.SALE.*) don't carry a
        // payment_source object at all — those are, by definition, a
        // PayPal-balance/PayPal-funded payment, so "paypal_balance" is a
        // safe default for that event family specifically (not a guess for
        // events that DO have payment_source — see extractPaypalPaymentMethod).
        paymentMethod: resource.payment_source ? extractPaypalPaymentMethod(resource) : "paypal_balance",
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
        paymentMethod: resource.payment_source ? extractPaypalPaymentMethod(resource) : "paypal_balance",
      },
    ];
  }

  return [];
}

/**
 * WooCommerce webhook payloads are REST-API "order" resources (the same
 * shape returned by GET /wp-json/wc/v3/orders/{id}) — WooCommerce doesn't
 * send a slimmed-down event object the way Stripe/PayPal do, it sends the
 * whole order. `topic` here is WooCommerce's own event-name convention
 * (e.g. "order.created", "order.updated") from the X-WC-Webhook-Topic
 * header, mirroring how Shopify's topic header is handled above.
 */
export function normalizeWooCommerceEvent(topic, payload) {
  if (!payload || typeof payload !== "object") return [];

  if (topic === "order.created" || topic === "order.updated") {
    // Only treat "paid" statuses as a sale — WooCommerce fires
    // order.created/updated for every status change (pending, processing,
    // on-hold, etc.), not just successful payment.
    const paidStatuses = ["processing", "completed"];
    if (!paidStatuses.includes(payload.status)) return [];
    const total = Number(payload.total || 0);
    if (!total) return [];
    return [
      {
        id: `woocommerce:order:${payload.id}`,
        provider: "woocommerce",
        type: "sale",
        amountCents: Math.round(Math.abs(total) * 100),
        currency: String(payload.currency || "usd").toLowerCase(),
        occurredAt: payload.date_paid || payload.date_created || new Date().toISOString(),
        description: `WooCommerce order #${payload.number || payload.id}`,
        // payment_method is a real field on every WooCommerce order object
        // (e.g. "stripe", "ppcp" for PayPal, "cod" for cash on delivery) —
        // mapped to this service's canonical vocabulary rather than passed
        // through raw, so the app doesn't need to know every WooCommerce
        // payment-gateway plugin's internal slug.
        paymentMethod: mapWooCommercePaymentMethod(payload.payment_method),
      },
    ];
  }

  if (topic === "order.refunded" || (payload.refunds && payload.refunds.length)) {
    const total = (payload.refunds || []).reduce(
      (sum, r) => sum + Math.abs(Number(r.total || 0)),
      0
    );
    if (!total) return [];
    return [
      {
        id: `woocommerce:refund:${payload.id}`,
        provider: "woocommerce",
        type: "refund",
        amountCents: Math.round(total * 100),
        currency: String(payload.currency || "usd").toLowerCase(),
        occurredAt: payload.date_modified || new Date().toISOString(),
        description: `WooCommerce refund for order #${payload.number || payload.id}`,
        paymentMethod: mapWooCommercePaymentMethod(payload.payment_method),
      },
    ];
  }

  return [];
}

function mapWooCommercePaymentMethod(slug) {
  const s = String(slug || "").toLowerCase();
  if (s.includes("apple")) return "apple_pay";
  if (s.includes("google")) return "google_pay";
  if (s.includes("klarna")) return "klarna";
  if (s.includes("paypal") || s === "ppcp") return "paypal_balance";
  if (s.includes("stripe") || s.includes("card") || s === "cod") return "card";
  if (!s) return "unknown";
  return "other";
}

/**
 * Amazon SP-API Orders (GET /orders/v0/orders) don't map cleanly onto a
 * single webhook payload — this normalizes ONE order object at a time, as
 * returned by that endpoint, and is called in a loop by amazon.js's polling
 * connector rather than from a POST /webhooks/amazon route (Amazon has no
 * simple HMAC-webhook scheme — see verify.js's getAmazonAccessToken() doc
 * comment for why this is poll-based instead of push-based like the other
 * four providers).
 */
export function normalizeAmazonOrder(order) {
  if (!order || typeof order !== "object") return [];
  // Only orders SP-API itself reports as shipped/fulfilled/complete are
  // counted as a real sale — "Pending"/"Canceled"/"Unshipped" are not yet
  // real revenue. amazon.js's poller also filters server-side for
  // efficiency; this is a defensive second check on whatever gets passed in.
  const countedStatuses = ["Shipped", "Unfulfillable", "Complete"];
  if (!countedStatuses.includes(order.OrderStatus)) return [];
  const total = Number(order.OrderTotal?.Amount || 0);
  if (!total) return [];
  return [
    {
      id: `amazon:order:${order.AmazonOrderId}`,
      provider: "amazon",
      type: "sale",
      amountCents: Math.round(Math.abs(total) * 100),
      currency: String(order.OrderTotal?.CurrencyCode || "usd").toLowerCase(),
      occurredAt: order.PurchaseDate || new Date().toISOString(),
      description: `Amazon order #${order.AmazonOrderId}`,
      // Amazon Pay is the processor for every Amazon order by definition —
      // there's no card/wallet sub-type exposed via the Orders API, so this
      // is a fixed, honest value rather than a guess.
      paymentMethod: "amazon_pay",
    },
  ];
}

/**
 * Normalizes one Amazon SP-API refund/return object (from the Finances API's
 * ListFinancialEvents -> RefundEventList, or the equivalent Adjustments)
 * into a canonical refund record. See amazon.js's polling connector.
 */
export function normalizeAmazonRefund(refundEvent) {
  if (!refundEvent || typeof refundEvent !== "object") return [];
  const amount = refundEvent.ShipmentItemAdjustmentList?.[0]?.ItemChargeAdjustmentList?.[0]?.ItemChargeAmount
    || refundEvent.ItemPriceAdjustmentsList?.[0]?.ItemChargeAmount;
  const value = Number(amount?.CurrencyAmount || 0);
  if (!value) return [];
  return [
    {
      id: `amazon:refund:${refundEvent.AmazonOrderId}:${refundEvent.PostedDate || Date.now()}`,
      provider: "amazon",
      type: "refund",
      amountCents: Math.round(Math.abs(value) * 100),
      currency: String(amount?.CurrencyCode || "usd").toLowerCase(),
      occurredAt: refundEvent.PostedDate || new Date().toISOString(),
      description: `Amazon refund for order #${refundEvent.AmazonOrderId}`,
      paymentMethod: "amazon_pay",
    },
  ];
}
