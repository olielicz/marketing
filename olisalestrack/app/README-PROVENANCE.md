# Where this app came from

This is the real, working OliSalesTrack app — vendored from the
[olielicz/SalesTrack](https://github.com/olielicz/SalesTrack) repository
(`refund-tracker/`, since renamed OliSalesTrack in that repo's own
history).

**Why it's here:** a repo-wide audit found `../index.html` had rewritten
its marketing copy to honestly say correlation analysis, expense
tracking, and P&L reports weren't implemented — because the `marketing`
repo had no code for them. That was true of `marketing` alone, but a
real, working implementation of exactly those features already existed
in this separate repo. This copy connects the two: the honest marketing
claims can now be restored, because real code backs them.

## What's real here

- **Correlation Analysis** (`CorrelationsPage`) — a genuine Pearson
  correlation coefficient computed from your real sales/refunds/expenses
  data across the last 12 months, with plain-English insight text for
  each pairing (Sales↔Refunds, Sales↔Expenses, Refunds↔Profit,
  Expenses→Revenue).
- **Sales / Refunds / Expenses tracking** — full CRUD, categorized,
  with dispute-portal quick-links for 10 real payment processors
  (PayPal, Stripe, Klarna, Shopify Payments, Square, Amazon Pay,
  Afterpay, Adyen, Authorize.Net, Braintree).
- **CSV import** — real Shopify/WooCommerce/Stripe column auto-detection
  and mapping.
- **Live sync bridge** (new — added when vendoring this app into
  `marketing`, not present upstream) — pulls real, signature-verified
  events directly from your `../../olisalestrack-sync` deployment
  (Settings → "Live sync"), so correlation analysis can run against
  live transaction data instead of only CSV imports. See the
  `LiveSyncSection` component and `syncEventToRecord()` in `index.html`.
- **Local-first storage** — everything lives in `localStorage` by
  default; JSON export/import for backup.
- **Installable PWA** — works offline, installs on Windows/Android/iOS.

## What was corrected when vendoring this in

The upstream `UpgradePage` advertised a $19/mo "Pro" tier and a $149
lifetime tier gating "AI business insights," "PDF report generation,"
and "multiple business profiles" — none of which exist anywhere in this
codebase, and neither price matched this deployment's real $24/mo
single-tier plan (see `../buy/`). That page has been corrected to
honestly state every real feature is already included with the one real
subscription — see the `FIX` comment in `index.html` for the exact
change.

## Keeping this in sync with the upstream repo

This is a vendored copy, not a git submodule. If
[olielicz/SalesTrack](https://github.com/olielicz/SalesTrack) gets real
fixes or features, they need to be manually re-copied here (except the
Live Sync bridge and Upgrade-page fix above, which are specific to this
deployment and shouldn't be overwritten by a naive re-copy).
