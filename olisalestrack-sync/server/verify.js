/**
 * Webhook signature verification for each provider. Every webhook endpoint
 * in this service MUST verify its signature before trusting the payload —
 * an unauthenticated webhook endpoint lets anyone inject fake sales/refunds
 * into your OliSalesTrack numbers.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies a Stripe webhook signature (the "Stripe-Signature" header) using
 * the same HMAC-SHA256 scheme Stripe's own SDKs use, re-implemented here
 * with zero dependencies so this whole service stays dependency-free.
 * See: https://docs.stripe.com/webhooks/signatures
 */
export function verifyStripeSignature(rawBody, signatureHeader, secret) {
  if (!secret) return false;
  if (!signatureHeader) return false;

  const parts = Object.fromEntries(
    signatureHeader
      .split(",")
      .map((kv) => kv.split("="))
      .filter((pair) => pair.length === 2)
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");

  return safeCompare(expected, signature);
}

/**
 * Verifies a Shopify webhook signature (the "X-Shopify-Hmac-Sha256" header),
 * which is a base64-encoded HMAC-SHA256 of the raw request body.
 * See: https://shopify.dev/docs/apps/build/webhooks/subscribe/https#step-3-verify-the-webhook
 */
export function verifyShopifySignature(rawBody, signatureHeader, secret) {
  if (!secret) return false;
  if (!signatureHeader) return false;

  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  return safeCompare(expected, signatureHeader);
}

/**
 * Verifies a PayPal webhook by calling PayPal's own verify-webhook-signature
 * API (PayPal doesn't use a simple local-HMAC scheme like Stripe/Shopify —
 * their signatures are verified server-side against PayPal's own service).
 * Requires an OAuth2 access token, fetched via clientId/clientSecret.
 * See: https://developer.paypal.com/api/rest/webhooks/rest/#link-verifywebhooksignature
 */
export async function verifyPaypalSignature({
  headers,
  rawBody,
  webhookId,
  clientId,
  clientSecret,
  apiBase,
}) {
  if (!webhookId || !clientId || !clientSecret) return false;

  const authRes = await fetch(`${apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!authRes.ok) return false;
  const { access_token } = await authRes.json();
  if (!access_token) return false;

  const verifyRes = await fetch(`${apiBase}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      transmission_id: headers["paypal-transmission-id"],
      transmission_time: headers["paypal-transmission-time"],
      cert_url: headers["paypal-cert-url"],
      auth_algo: headers["paypal-auth-algo"],
      transmission_sig: headers["paypal-transmission-sig"],
      webhook_id: webhookId,
      webhook_event: JSON.parse(rawBody),
    }),
  });
  if (!verifyRes.ok) return false;
  const { verification_status } = await verifyRes.json();
  return verification_status === "SUCCESS";
}

function safeCompare(a, b) {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
