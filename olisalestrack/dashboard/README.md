# OliSalesTrack Dashboard

A real, working dashboard that shows live sales/refund data from Stripe,
PayPal, and Shopify — no CSV export/import needed. This is what actually
renders the data `../../olisalestrack-sync` collects; before this existed,
that service had zero UI anywhere consuming it (confirmed by checking the
rest of this repo — it was a headless API with nowhere for a customer to
actually see their numbers).

## What's real here (and what to verify yourself before selling this)

- ✅ Real login against `../../admin-auth` (scrypt-hashed password, signed
  session, live server-side revocation) — verified end-to-end with a
  headless browser: login, page-reload session persistence, and logout
  (which genuinely kills the session server-side, not just hides the UI)
  all tested and passing.
- ✅ Real data from `../../olisalestrack-sync` — verified by sending an
  actually-signed Stripe webhook (`checkout.session.completed` +
  `charge.refunded`) through the real HMAC verification path and
  confirming the dashboard renders the correct revenue/refund/net totals
  computed from that real data ($49.00 sale − $15.00 refund = $34.00 net,
  matching what was sent).
- ✅ CORS was fixed as part of building this — `olisalestrack-sync`
  previously had no `Access-Control-Allow-Origin` header at all (it was
  designed to be called from OliSalesTrack's own backend, never a
  browser), which silently broke every request from this dashboard until
  fixed. If you fork `olisalestrack-sync` further, don't remove those
  headers.

## What this is NOT

- Not a multi-tenant hosted SaaS. This is a single-tenant, self-hosted
  dashboard, matching every other product in this repo — you deploy your
  own copies of `admin-auth` and `olisalestrack-sync`, and this page
  talks only to the URLs you configure (stored in `localStorage` on your
  own browser, nothing sent anywhere else).
- Not connected to any correlation-analysis or expense-tracking logic —
  per `olisalestrack-sync/README.md`, that's explicitly out of scope for
  the sync service and would be a separate feature to add here later if
  you want it (e.g. an "add manual expense" form alongside the real
  synced sales/refunds).

## Setup

1. Deploy `../../admin-auth` and create your one owner account (see its
   README). Note its URL.
2. Deploy `../../olisalestrack-sync` and connect it to your real
   Stripe/PayPal/Shopify webhooks (see its README). Note its URL.
3. Deploy this `dashboard/` folder as a static site (or just open
   `index.html` directly, or serve it with any static file host —
   Netlify, GitHub Pages, `python3 -m http.server`, etc.)
4. Open the dashboard, click "⚙ Configure server URLs," enter both URLs
   from steps 1–2, then sign in with your admin-auth owner credentials.

## Known limitations

- No pagination — `GET /api/events` returns everything matching the
  filter in one response, capped at 20,000 events total by
  `olisalestrack-sync`'s own retention limit (see its `store.js`). Fine
  for an indie/small-business sales volume; would need real pagination
  before this could handle high-volume merchants.
- No auto-refresh/polling — the "↻ Refresh" button is manual. Adding a
  `setInterval` poll (e.g. every 2–5 minutes while the tab is open) would
  be a reasonable, small follow-up if you want it to feel more "live."
