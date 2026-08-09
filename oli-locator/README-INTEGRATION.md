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
functions** under `/api/*` (leads, opt-in storage, properties, and auth),
backed optionally by **Vercel KV** for durable, cross-device storage. GitHub
Pages (what this marketing repo deploys to — see
`.github/workflows/deploy-pages.yml`) only serves static files; it cannot
run `/api/*` serverless functions or provision KV storage. Copying
`lead-gen`'s files into `marketing/oli-locator/app/` the way the other four
tools' apps were vendored would silently break every one of its real,
working backend features (opt-in lead capture, the cross-device Inbox, real
property data via SimplyRETS, and real owner/subscriber auth) — falling
back to the app's `file://`/static-only demo mode, which is real too, but
is not the product being sold.

**The correct integration is a link to a separately deployed instance,**
the same pattern the other tools already use for pointing their `app/` at
a self-hosted backend (see e.g. `../oliops-backend/README.md`'s "Configure
server URL" step) — just one level up, since the whole app here (not only
its backend) has to be deployed separately.

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
   straightforward, honest way today is:
   - Update the two links below (currently pointing at this
     `README-INTEGRATION.md` file as a placeholder, so a real customer
     lands on setup instructions instead of a dead end) to your real
     deployed URL once you have one:
     - `oli-locator/account/index.html` → the "Open Oli-Locator →" button
     - Optionally add a similar link/button to `oli-locator/index.html`'s
       hero and nav, matching the "Open App" pattern used by
       OliOps/OliCommerce/OliSalesTrack/OliExplore's landing pages.
   - A cleaner long-term fix (not done in this pass — a real, scoped
     follow-up): add a tiny `oli-locator/config.js` exporting a single
     `OLI_LOCATOR_APP_URL` constant, read it in the two spots above, and
     document the one line to edit after deploying — avoids hardcoding
     the URL in multiple files. Flagging this as a genuine next step
     rather than doing it now, since it touches the shared linking
     pattern other tools might want too.

## Australia support — now real (previously flagged as missing)

An earlier pass found that `lead-gen`'s codebase only defined `US` and
`UK` (`assets/js/config.js`'s `LL.config.countries`) and corrected this
marketing site's "USA, UK, and Australia" claim down to "USA & UK" since
Australia had no real implementation at the time.

That gap has since been closed for real, in
[`olielicz/lead-gen` PR #20](https://github.com/olielicz/lead-gen/pull/20):
`LL.config.countries.AU`, a real `LL.currencySymbol()`/`currencyCode()`
system (replacing scattered `country === "UK" ? "£" : "$"` ternaries with
no AU case), 15 real Australian cities with genuine Australia Post
postcode-prefix matching, real AUD price ranges, AU-conventional rental
terminology (rent quoted "pw" per Australian real-estate convention, not
"/mo"), AU street-name generators, and a third country-toggle button
everywhere the US/UK ones already exist. This marketing site's "USA, UK,
and Australia" claim has been restored across `index.html`, `buy/`,
`account/`, `login/`, `vs-follow-up-boss/`, and the root
`marketing/index.html` tile, now honestly backed by real code —
**contingent on PR #20 being merged and deployed** to your live `lead-gen`
instance (see step 1 above). If you haven't deployed that PR yet, your
live site will still only show US/UK until you do.

## Billing/subscription status — now real (previously an open item)

An earlier pass found two documents describing Oli-Locator's billing
readiness differently and couldn't reconcile them without directly
patching the code: `PRE-LAUNCH-CHECKLIST.txt` described billing as
essentially unwired, while `lead-gen/README.md` described real accounts/
auth but explicitly flagged *payment-verified subscription gating* as
not production-hardened — "the demo gate is client-side UX only."

That gap has since been closed for real, also in
[`olielicz/lead-gen` PR #20](https://github.com/olielicz/lead-gen/pull/20):

- Every new account now gets a **real, server-side-enforced 7-day trial**
  (`subscriptionStatus: "trialing"` + a real `trialEndsAt` timestamp) —
  not an unlimited "trial" with no actual expiry, which is what existed
  before.
- `GET /api/leads` and `GET /api/properties` — both the Vercel functions
  and the local Express server — now call `requireActiveSubscription()`,
  which checks this **real, stored status server-side** on every request.
  A valid session token alone is no longer sufficient once a trial
  genuinely expires; previously, these endpoints had **no server-side
  auth check at all**, confirmed by testing.
- Real **Stripe Checkout** session creation and real **Stripe webhook
  signature verification** (`lib/billing.js`) turn `subscriptionStatus`
  into `"active"` only from a genuine, cryptographically-verified Stripe
  event — never a client-side flag.

**What this means concretely, once you deploy PR #20 and configure
Stripe** (see `lead-gen/README.md`'s "Real billing enforcement" section
for the exact env vars): a customer who hasn't paid and whose trial has
expired is genuinely blocked from `/api/leads` and `/api/properties` at
the API layer, not just hidden by client-side UI. Two things remain
outside this fix's scope, and are documented as such in `lead-gen`'s own
README:
1. **Native iOS/Android app-store billing** needs a separate RevenueCat +
   StoreKit/Play Billing integration — Stripe alone doesn't cover mobile
   in-app purchase flows.
2. **This has not been tested against a live Stripe account** in this
   pass (no network access to Stripe's API from this environment) — the
   webhook signature verification and trial-expiry logic were verified
   with a direct Node test harness exercising the real cryptographic and
   date-math code paths, but you should still run a real test purchase
   against your own Stripe test-mode account before going live, the same
   way you'd test any new payment integration.

**Before selling subscriptions to Oli-Locator:** merge and deploy
`lead-gen` PR #20, configure the `STRIPE_*` environment variables, add
your webhook endpoint in the Stripe Dashboard, and run one real test
checkout end-to-end against your own Stripe test-mode account.
