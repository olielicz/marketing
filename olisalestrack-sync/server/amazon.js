/**
 * Amazon Selling Partner API (SP-API) polling connector.
 *
 * Unlike Stripe/PayPal/Shopify/WooCommerce, Amazon has no simple
 * "POST a webhook, verify an HMAC header" scheme this service could receive
 * and check the same way (see verify.js's getAmazonAccessToken() doc
 * comment) — real-time order notifications are delivered via Amazon's own
 * SQS/EventBridge infrastructure, which is a materially bigger integration
 * (AWS credentials, a queue, a subscriber process) than this zero-dependency
 * service takes on for any other provider.
 *
 * Instead, this connector POLLS the SP-API Orders API on an interval,
 * fetching orders updated since the last successful poll, normalizing them
 * with normalizeAmazonOrder()/normalizeAmazonRefund() (see normalize.js),
 * and appending them exactly like a webhook delivery would. This trades a
 * small amount of latency (poll interval, default 5 minutes) for an
 * integration that fits this service's "no SDKs, no message queues, direct
 * REST calls" design — the same tradeoff already made for the same reason
 * elsewhere in this codebase (see marketing/lead-gen's Twilio integration
 * for another example of a REST-direct-call-only external integration).
 */
import { getAmazonAccessToken } from "./verify.js";
import { normalizeAmazonOrder, normalizeAmazonRefund } from "./normalize.js";
import { appendEvents } from "./store.js";

const AMAZON_CLIENT_ID = process.env.AMAZON_CLIENT_ID || "";
const AMAZON_CLIENT_SECRET = process.env.AMAZON_CLIENT_SECRET || "";
const AMAZON_REFRESH_TOKEN = process.env.AMAZON_REFRESH_TOKEN || "";
const AMAZON_SP_API_BASE = process.env.AMAZON_SP_API_BASE || "https://sellingpartnerapi-na.amazon.com";
const AMAZON_MARKETPLACE_ID = process.env.AMAZON_MARKETPLACE_ID || "";
const AMAZON_POLL_INTERVAL_MS = Number(process.env.AMAZON_POLL_INTERVAL_MS) || 5 * 60 * 1000;

export const HAS_AMAZON = Boolean(
  AMAZON_CLIENT_ID && AMAZON_CLIENT_SECRET && AMAZON_REFRESH_TOKEN && AMAZON_MARKETPLACE_ID
);

let lastPolledAt = null;

/**
 * Fetches orders updated since `sinceIso`, normalizes each into a sale
 * record, and appends any new ones. Called on a timer by startAmazonPolling()
 * below, and exported standalone so tests (and a manual "poll now" admin
 * action, if ever added) can call it directly without waiting for the timer.
 */
export async function pollAmazonOnce() {
  if (!HAS_AMAZON) return { polled: false, reason: "not_configured" };

  const accessToken = await getAmazonAccessToken({
    clientId: AMAZON_CLIENT_ID,
    clientSecret: AMAZON_CLIENT_SECRET,
    refreshToken: AMAZON_REFRESH_TOKEN,
  });
  if (!accessToken) return { polled: false, reason: "auth_failed" };

  const since = lastPolledAt || new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const params = new URLSearchParams({
    MarketplaceIds: AMAZON_MARKETPLACE_ID,
    LastUpdatedAfter: since,
  });

  const res = await fetch(`${AMAZON_SP_API_BASE}/orders/v0/orders?${params.toString()}`, {
    headers: { "x-amz-access-token": accessToken },
  });
  if (!res.ok) {
    console.error(`[amazon] Orders API request failed: ${res.status}`);
    return { polled: false, reason: "api_error", status: res.status };
  }
  const data = await res.json();
  const orders = data?.payload?.Orders || [];

  const records = orders.flatMap((order) => normalizeAmazonOrder(order));
  const inserted = await appendEvents(records);

  lastPolledAt = new Date().toISOString();
  return { polled: true, ordersSeen: orders.length, inserted: inserted.length };
}

/**
 * Starts the recurring poll timer. No-op (with a console.warn) if Amazon
 * credentials aren't configured — mirrors the other providers' "loud
 * warning, never silently fail" convention (see index.js's startup checks).
 */
export function startAmazonPolling() {
  if (!HAS_AMAZON) {
    console.warn("⚠️  Amazon SP-API credentials incomplete — Amazon order polling is disabled.");
    return null;
  }
  console.log(`Amazon SP-API polling enabled (every ${AMAZON_POLL_INTERVAL_MS / 1000}s).`);
  const timer = setInterval(() => {
    pollAmazonOnce().catch((err) => console.error("[amazon] poll failed:", err.message));
  }, AMAZON_POLL_INTERVAL_MS);
  // Run one poll immediately on startup rather than waiting a full interval.
  pollAmazonOnce().catch((err) => console.error("[amazon] initial poll failed:", err.message));
  return timer;
}
