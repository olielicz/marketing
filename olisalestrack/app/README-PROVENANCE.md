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

## Real features added since vendoring (previously documented as missing)

A follow-up pass built genuine implementations of three features that
were previously listed as honest gaps in this deployment:

- **AI-generated insights** (`InsightsPanel`, `generateInsightsNarrative()`) —
  a real, optional AI narrative of this month's already-computed
  correlation/P&L numbers. The AI is grounded strictly in numbers this
  app itself already calculated (never raw transactions, never asked to
  compute anything new), and a numeric honesty guard
  (`responseCitesOnlyRealNumbers()`) rejects any AI response that cites
  a figure outside that real dataset, falling back to a genuine
  deterministic, rule-based narrative (`buildRuleBasedNarrative()`) —
  which is what runs by default with no AI key configured at all. Same
  honesty pattern as `olicommerce-backend/server/storefrontAssistant.js`
  and `oliops-backend/server/supportAssistant.js` elsewhere in this
  project, adapted to run client-side with a user-supplied API key
  (never sent anywhere but the AI provider you configure).
- **PDF report export** (`buildSimplePdf()`, `downloadCorrelationsPdf()`) —
  a real, dependency-free PDF generator (hand-built PDF objects + cross-
  reference table, same technique as OliCompute's server-side
  `services/pdf.js`, adapted to run entirely in the browser) exporting
  the Correlations page's real numbers to a downloadable PDF. Nothing is
  sent to a server — the PDF bytes are assembled and downloaded via a
  `Blob`, client-side only.
- **Multiple business profiles** (`loadProfiles()`/`createProfile()`/
  `switchProfile()`/etc., `ProfileSwitcher` component, "Business
  profiles" card in Settings) — real, separate `localStorage`-scoped
  datasets per business, with a working switcher in the sidebar/top bar
  and full profile management (create/rename/delete, always keeping at
  least one). The original single-profile user's existing real data is
  preserved under its original storage key (`olisalestrack:v2`) as the
  first "My Business" profile — nothing is migrated or lost.

`UpgradePage` has been updated again to list these three as included,
now that they're real.

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
