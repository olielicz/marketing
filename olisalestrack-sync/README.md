# OliSalesTrack Live Sync Server

A small, self-hosted webhook-ingestion service that replaces OliSalesTrack's CSV-export/import workflow
with **live, real-time sync** from Stripe, PayPal, Shopify, WooCommerce, and Amazon. This directly addresses
the disadvantage called out in `competitor-comparison.md` and the OliSalesTrack landing page FAQ: *"No live
API integrations yet — Baremetrics/HubSpot connect directly to Stripe, onboarding friction is higher."*

Every normalized sale/refund record also carries a **`paymentMethod`** field (`card`, `paypal_balance`,
`klarna`, `apple_pay`, `google_pay`, `amazon_pay`, `other`, or `unknown`) — extracted only from fields each
provider's own payload already includes (Stripe's `payment_method_details`/`payment_method_types`, PayPal's
`payment_source`, WooCommerce's `payment_method` slug), never guessed. Klarna, Apple Pay, and Google Pay are
**not** separate providers here — they're payment methods that flow through Stripe or PayPal as the actual
processor, so this field is how OliSalesTrack tells them apart from a plain card charge.

---

## What this does

```
Stripe / PayPal / Shopify
        │  (webhook fires on every sale/refund)
        ▼
POST /webhooks/{stripe,paypal,shopify}
        │
        ├─► verify the request is genuinely from that provider (signature check)
        ├─► normalize the payload into a canonical { type: "sale"|"refund", amountCents, ... } record
        └─► de-duplicate by a stable id and persist it
        │
        ▼
GET /api/events?since=<ISO date>   ← OliSalesTrack polls this instead of asking the user for a CSV export
        │
        ▼
OliSalesTrack's correlation analysis, P&L reports, and dashboards
```

No CSV export/import round trip, no manually re-uploading a file every time the user wants fresh numbers —
sales and refunds show up automatically as they happen.

**What this does NOT do:** it doesn't calculate correlation analysis, render charts, or store expenses —
that logic lives in the OliSalesTrack app itself (a separate repo, per `README.md`'s "OliSalesTrack — Quick
Reference" section). This service's only job is turning provider webhooks into clean, de-duplicated sale/refund
records that the app can pull and feed into its existing analysis.

---

## Why webhooks (push) instead of polling each provider's API (pull)

Polling Stripe/PayPal/Shopify's transaction-list APIs on a timer works, but webhooks are the standard,
lower-latency, lower-rate-limit-risk approach every one of these providers recommends for "notify me when
a sale/refund happens" — and it's what Baremetrics, Profitwell, and every other real competitor in this
space actually uses. This service receives their webhooks; it does not need any additional polling.

---

## Setup

```bash
cd olisalestrack-sync
npm install    # no external dependencies — this just registers the "type": "module" package
cp .env.example .env
```

Fill in `.env`:

1. **`ACCESS_TOKEN`** — a long random string protecting `GET /api/events`. Generate one with:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. **`STRIPE_WEBHOOK_SECRET`** — Stripe Dashboard → Developers → Webhooks → add an endpoint pointing at
   `https://your-deployed-url/webhooks/stripe`, subscribe to `checkout.session.completed` and
   `charge.refunded` (add `charge.succeeded` too if you don't use Checkout), then copy the endpoint's
   **Signing secret**.
3. **`SHOPIFY_WEBHOOK_SECRET`** — Shopify Admin → Settings → Notifications → scroll to Webhooks, or your
   custom app's API secret if using the Admin API to register webhooks. Register `orders/paid` and
   `refunds/create` pointing at `https://your-deployed-url/webhooks/shopify`.
4. **`PAYPAL_WEBHOOK_ID` / `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`** — PayPal Developer Dashboard → your
   app → Webhooks → add a webhook at `https://your-deployed-url/webhooks/paypal`, subscribe to
   `PAYMENT.SALE.COMPLETED` and `PAYMENT.SALE.REFUNDED`, then copy the generated webhook's ID and your
   app's Client ID/Secret. Set `PAYPAL_API_BASE` to the live API (`https://api-m.paypal.com`) once you're
   out of sandbox testing.
5. **`WOOCOMMERCE_WEBHOOK_SECRET`** — WooCommerce Admin → Settings → Advanced → Webhooks → Add webhook,
   pointing at `https://your-deployed-url/webhooks/woocommerce`, topic `Order updated` (and `Order refunded`
   if your WooCommerce version splits that out), then copy the webhook's **Secret**.
6. **`AMAZON_CLIENT_ID` / `AMAZON_CLIENT_SECRET` / `AMAZON_REFRESH_TOKEN` / `AMAZON_MARKETPLACE_ID`** —
   register an SP-API application in Amazon's [Developer Central](https://developer.amazonservices.com/),
   complete the Login-With-Amazon (LWA) authorization flow to get a long-lived refresh token, and note your
   target marketplace's ID. Unlike the other four providers, **Amazon has no webhook endpoint** here — it's
   polled on a timer instead (default every 5 minutes, `AMAZON_POLL_INTERVAL_MS`) since Amazon's real-time
   order notifications require its own SQS/EventBridge infrastructure rather than a simple signed webhook —
   see `server/amazon.js`'s header comment for the full reasoning.

Start it:

```bash
node server/index.js     # listens on PORT (default 4200)
```

Deploy to any of the free/cheap Node hosts already recommended elsewhere in this repo (Render free tier,
Railway, Fly.io) — zero npm dependencies, tiny memory footprint, fits comfortably on a free tier, same as
`../licensing/server/index.js`.

**⚠️ Never skip signature verification.** Each webhook route rejects the request with `401` if its secret
is unset or the signature doesn't match — this is intentional and must not be bypassed, since an
unauthenticated webhook endpoint would let anyone inject fake sales/refunds into a customer's numbers.

---

## Wiring this into the OliSalesTrack app

The OliSalesTrack app (separate repo — see main `README.md`'s "OliSalesTrack — Quick Reference" section)
should poll `GET /api/events?since=<last sync timestamp>` on load and on a periodic refresh (e.g. every few
minutes while the tab is open), instead of only accepting a CSV upload. A minimal client-side integration:

```js
async function fetchNewEvents(sinceIso, accessToken) {
  const res = await fetch(`https://your-deployed-sync-url/api/events?since=${encodeURIComponent(sinceIso)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Sync fetch failed: ${res.status}`);
  const { events } = await res.json();
  return events; // [{ id, provider, type, amountCents, currency, occurredAt, description }, ...]
}
```

Each `type: "sale"` record maps to a sales-tracker entry; each `type: "refund"` record maps to a refund
entry — exactly the two categories OliSalesTrack's correlation analysis already expects. CSV import remains
available as a fallback for historical backfill or providers not covered here.

---

## API reference

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /webhooks/stripe` | Stripe signature (`Stripe-Signature` header) | Ingest a Stripe event |
| `POST /webhooks/shopify` | Shopify signature (`X-Shopify-Hmac-Sha256` header) | Ingest a Shopify webhook |
| `POST /webhooks/woocommerce` | WooCommerce signature (`X-WC-Webhook-Signature` header) | Ingest a WooCommerce order/refund webhook |
| `POST /webhooks/paypal` | PayPal signature (verified via PayPal's own API) | Ingest a PayPal event |
| — (none — polled) | Amazon LWA refresh token | Amazon orders/refunds are pulled from the SP-API Orders API on a timer, not pushed via a webhook — see `server/amazon.js` |
| `GET /api/events` | `ACCESS_TOKEN` (Bearer) | Pull normalized sale/refund records, optional `?since=`, `?provider=` (now also `woocommerce`/`amazon`) filters |
| `GET /api/health` | none (public) | Health check |

Full request/response shapes and the normalization rules for each provider are documented as comments
directly in `server/normalize.js` and above each route in `server/index.js`.

---

## Testing

```bash
npm test    # node --test — covers normalization, signature verification, and the event store
```

Before going live, send a real test webhook from each provider's dashboard (Stripe has a "Send test webhook"
button; Shopify and PayPal have equivalents) and confirm it shows up via `GET /api/events`.
