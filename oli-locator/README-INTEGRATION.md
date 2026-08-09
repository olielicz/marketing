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

## Corrected: no Australia support

While investigating this integration, the real `lead-gen` codebase
(`assets/js/config.js`'s `LL.config.countries`) was checked directly: it
defines **only `US` and `UK`** — there is no Australia entry in the
config, city/postcode datasets, or UI anywhere in the repo. This
marketing site previously claimed "USA, UK, and Australia" coverage
across `index.html`, `buy/`, `account/`, `login/`, `vs-follow-up-boss/`,
and the root `marketing/index.html` tile — a marketed feature with no
real implementation, the mirror image of the "removed real features"
problem elsewhere in this repo, but the same honesty rule applies. All
six of those references have been corrected to "USA & UK" in this pass.
If Australia coverage is added to `lead-gen` in the future (its own
`countries` config, plus AU city/postcode data), restore the claim then
— not before.

## Billing/subscription status — needs your own verification

There are two documents in this repo that describe Oli-Locator's billing
readiness differently, and this integration pass could not fully
reconcile them without direct access to the current `lead-gen` Vercel
deployment:

- **`../PRE-LAUNCH-CHECKLIST.txt`** (older, repo-wide checklist) describes
  Oli-Locator's billing/subscription enforcement as essentially unwired.
- **`lead-gen/README.md`** (the app's own, more detailed and more
  recently written docs) describes real, working pieces: a seeded owner
  account driven by env vars (no hardcoded credentials — a past incident
  where a real password was hardcoded in client-side code has already
  been fixed and is documented in the README with a permanent-compromise
  warning), a real forgot-password / change-password flow backed by
  signed, single-use tokens, and scrypt-hashed password storage. It also
  explicitly states, in its own words, that **"the demo gate is
  client-side UX only"** and that production use still needs a real IdP
  (Auth0/Firebase/Supabase/Cognito) and server-side payment enforcement
  (Stripe or RevenueCat) wired in — i.e., accounts and auth are real, but
  *subscription-gating tied to actual payment* is explicitly flagged by
  the app's own maintainers as not production-hardened yet.

**What this means concretely:** logging in, changing your password, and
resetting a forgotten password against a real deployed `lead-gen`
instance are real, working, tested flows. Whether a customer who *hasn't
paid* can be reliably blocked from the Pro Dashboard in a live deployment
depends on how (or whether) you've since wired in real payment
enforcement server-side — the README says this explicitly still needs
doing, and this marketing-repo pass has no way to check the live
Vercel deployment's actual current state from here. **Before selling
subscriptions to Oli-Locator, verify directly against your own deployed
instance** (e.g. try accessing dashboard data via `/api/leads/opt-in`
with no valid session and confirm it's actually rejected) rather than
trusting either document at face value — they disagree, and only a check
against the live deployment can settle which is current.
