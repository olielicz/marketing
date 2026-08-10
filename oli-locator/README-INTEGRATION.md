# Oli-Locator — connecting the real app (lead-gen)

## Why there's no `app/` directory here

Every other tool in this repo (OliOps, OliCommerce, OliSalesTrack,
OliExplore) has its real app vendored in as a static `app/` folder that
runs on the same GitHub Pages deployment as this marketing site. Oli-Locator
is the one exception, and it's an architectural constraint, not an
oversight:

The real Oli-Locator app lives in a separate repository,
[`olielicz/lead-gen`](https://github.com/olielicz/lead-gen), and it is
built to run on **Vercel** as a mix of static files plus real **serverless
functions** under `/api/*` (leads, opt-in storage, and auth), backed
optionally by **Vercel KV** for durable, cross-device storage. GitHub Pages
(what this marketing repo deploys to — see
`.github/workflows/deploy-pages.yml`) only serves static files; it cannot
run `/api/*` serverless functions or provision KV storage. Copying
`lead-gen`'s files into `marketing/oli-locator/app/` the way the other four
tools' apps were vendored would silently break every one of its real,
working backend features (opt-in lead capture, the cross-device Inbox, and
real owner/subscriber auth) — falling back to the app's `file://`/static-
only demo mode, which is real too, but is not the product being sold.

**The correct integration is a link to a separately deployed instance,**
the same pattern the other tools already use for pointing their `app/` at
a self-hosted backend (see e.g. `../oliops-backend/README.md`'s "Configure
server URL" step) — just one level up, since the whole app here (not only
its backend) has to be deployed separately.

## What Oli-Locator actually is (read this before deploying anything)

Oli-Locator is a **home-improvement lead-generation tool** — cleaning,
pest control, renovation, roofing, painting, plumbing, electrical,
landscaping, HVAC, flooring, and handyman — across the USA, UK, and
Australia. It is **not** a real-estate tool. An earlier version of
`lead-gen` also included a "Property Locator" feature (house/apartment
listings for sale or rent); that feature has been **removed entirely**
from `lead-gen` because there is no free, self-serve, nationwide
real-estate listings API in any of the three countries — every real
MLS/Rightmove/Domain feed requires a signed business/licensing agreement,
which isn't something this app could honestly ship with by default. If
you're looking for property-search functionality, it no longer exists in
this codebase, and this marketing site no longer markets it.

## How to actually deploy and connect it

1. **Deploy `lead-gen` to Vercel** (own account, own URL):
   - Go to [vercel.com/new](https://vercel.com/new), sign in, and import
     the `olielicz/lead-gen` repository (Option A in
     [`lead-gen/README.md`](https://github.com/olielicz/lead-gen#-deploy-to-vercel)),
     or use the Vercel CLI (Option B, same README). No build step, no
     framework config needed — it deploys as-is.
   - You'll get a live URL like `https://lead-gen-<hash>.vercel.app`, or
     attach a custom domain (`leads.yourdomain.com`) from the Vercel
     dashboard — no code changes needed for that part.

2. **Add Vercel KV for real, durable, cross-device storage** (strongly
   recommended for anything beyond a demo):
   - In the Vercel project: **Storage → Create → KV**, then redeploy.
     Vercel injects `KV_REST_API_URL` / `KV_REST_API_TOKEN` automatically;
     `lib/optinStore.js` and `lib/authStore.js` pick them up with no code
     changes. Without KV, opt-in leads and accounts are only held
     in-memory per serverless instance — fine for a demo, not for real
     customers.

3. **Seed a real owner account, server-side only** (per
   `lead-gen/README.md`'s "Accounts, subscription & access" section):
   - In the Vercel project: **Settings → Environment Variables**, set
     `OWNER_EMAIL` and `OWNER_PASSWORD` to your own values. Redeploy. The
     account is created automatically, server-side, the first time
     anyone hits `/api/auth/login` — only the salted password **hash**
     is ever stored. Rotate the password immediately after first login
     via **⚙ Account → Change password**, so the value you put in an
     environment variable isn't your long-term password.
   - Set a strong `AUTH_SECRET` environment variable too (signs session
     tokens).

4. **Point this marketing site at your deployed URL.** There is currently
   no `?backend=` query param or `LL.config.apiBaseUrl`-style setting
   wired up on this marketing site's side to do this automatically — the
   real, working mechanism today lives in
   `oli-locator/account/index.html`'s `OLI_LOCATOR_APP_URL` constant:
   - **Local/dev default (already working):** when the marketing site is
     viewed from `localhost`/`127.0.0.1`, this constant automatically
     points at `http://localhost:5100/` (where `lead-gen`'s own static
     server is expected to be running per its README's "Run it"
     instructions) — the "Open Oli-Locator →" button on the account page
     genuinely navigates there, no manual edit needed for local testing.
   - **Production deployment:** once you deploy `lead-gen` to Vercel (or
     anywhere else) and have a real URL, replace that same constant's
     fallback value (currently an empty string for any non-localhost
     host) with your real deployed URL. Until you do, real (non-
     localhost) visitors see an honest "not deployed yet" state instead
     of a broken or fake link.
   - A cleaner long-term fix (not done in this pass — a real, scoped
     follow-up): factor `OLI_LOCATOR_APP_URL` out into a tiny, shared
     `oli-locator/config.js` so it's edited in one place instead of only
     `account/index.html`, and reuse it for a similar "Open App" link on
     `oli-locator/index.html`'s hero/nav, matching the pattern used by
     OliOps/OliCommerce/OliSalesTrack/OliExplore's landing pages.

## Billing/subscription status — real, server-side enforced

- Every new account gets a **real, server-side-enforced 7-day trial**
  (`subscriptionStatus: "trialing"` + a real `trialEndsAt` timestamp).
- `GET /api/leads` — both the Vercel functions and the local Express
  server — calls `requireActiveSubscription()`, which checks this
  **real, stored status server-side** on every request. A valid session
  token alone is not sufficient once a trial genuinely expires.
- Real **Stripe Checkout** session creation and real **Stripe webhook
  signature verification** (`lib/billing.js`) turn `subscriptionStatus`
  into `"active"` only from a genuine, cryptographically-verified Stripe
  event — never a client-side flag.

**What this means concretely, once Stripe is configured** (see
`lead-gen/README.md`'s "Real billing enforcement" section for the exact
env vars): a customer who hasn't paid and whose trial has expired is
genuinely blocked from `/api/leads` at the API layer, not just hidden by
client-side UI. Two things remain outside this scope, and are documented
as such in `lead-gen`'s own README:
1. **Native iOS/Android app-store billing** needs a separate RevenueCat +
   StoreKit/Play Billing integration — Stripe alone doesn't cover mobile
   in-app purchase flows.
2. **Test against a live Stripe test-mode account** before going live —
   run one real test checkout end-to-end, the same way you'd test any
   new payment integration.

**Before selling subscriptions to Oli-Locator:** deploy `lead-gen`,
configure the `STRIPE_*` environment variables, add your webhook endpoint
in the Stripe Dashboard, and run one real test checkout end-to-end
against your own Stripe test-mode account.
