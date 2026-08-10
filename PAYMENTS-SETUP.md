# Payment Setup — Complete Guide

Covers PayPal, Paddle, Stripe, automatic login email delivery, and
subscription renewal reminders for all 6 Oli Tools.

**Current status:** every buy page has 3 payment buttons — **Paddle**,
**PayPal**, and **Stripe**. Set up **Paddle and PayPal first** (Parts 1–2
below) — those are the two being activated now. The Stripe button
remains in place as a placeholder link to be wired up later; leave it
as-is (`REPLACE_WITH_..._STRIPE_LINK`) until you're ready for it — it
won't do anything or show any error to customers until it has a real
Stripe Payment Link pasted in, since it's a plain link element, not a
script that runs on page load.

**Why Paddle in addition to Stripe:** Stripe does not support businesses
based in the Philippines as of 2026 (confirmed — Stripe only supports
sellers from 46 countries, and the Philippines is not one of them). If
you eventually register a business entity in a Stripe-supported country,
the Stripe button here is ready to activate — but for now, as a
Philippines-based seller, Paddle is the one that can actually process
card payments for you. Paddle acts as a Merchant of Record — it legally
sells on your behalf and pays you out afterward — which is why it can
support sellers from far more countries (200+) than Stripe, and it
automatically handles international sales tax/VAT for you too, something
you'd otherwise have to deal with yourself.

**Getting paid into a Philippine bank account:**
- **PayPal** lets you link a PH bank account directly (BDO, BPI,
  UnionBank, Metrobank, etc.) and withdraw via PESONet, typically 3-5
  business days.
- **Paddle** pays out via bank wire or PayPal on a schedule you choose.
  Since direct-to-PH-bank-account wire fees can be high, most Filipino
  sellers route Paddle payouts through a free Wise Business account
  (holds USD, converts to PHP more cheaply than a bank does), then
  withdraw from Wise to their local PH bank.
- Before either can pay you, register a business name with DTI
  (`bnrs.dti.gov.ph`, ~₱200-500, same-day online) if you haven't
  already — both PayPal Business and Paddle's manual seller review ask
  for this.

---

## Overview of the payment + login flow

```
Customer enters email on buy page → pays via Paddle, PayPal, or Stripe
           │
           ▼
  PayPal:  paypal-sdk.js fires onApprove
  Paddle:  paddle-sdk.js's Checkout.open() overlay fires checkout.completed
  Stripe:  customer redirected to thank-you page (needs its own webhook
           setup once you activate it — see Part 3 below; not needed yet
           for Paddle/PayPal)
           │
           ▼
  OliAuth.createAccount(email, toolKey, orderId)  [shared/auth.js]
           │
           ├─► Account created with temporary password
           └─► Welcome email sent via EmailJS with login link + temp password
                       │
                       ▼
              Customer signs in at /login/?tool=TOOLKEY
              Sets own password on first login
              Lands on /account/ dashboard
              Clicks "Open Tool →" to access purchased tool
```

Paddle and PayPal both fire the welcome email automatically client-side —
no separate Zapier/webhook step needed for either one. Stripe is
different: because it redirects to Stripe's own hosted checkout page
instead of staying on-page, it needs a webhook (or Zapier automation) to
trigger the welcome email — see Part 3 below, whenever you're ready to
activate the Stripe button.

---

## Part 0 — 14-Day Free Trial (applies to all 6 tools)

Every buy page now advertises "$0 today, then $X/mo after a 14-day free trial." This is a copy-only promise until the trial is actually configured on the Paddle/PayPal side — the HTML has no ability to delay a charge by itself. Set this up once per plan:

**Paddle:**
1. When creating each Price under Catalog → Products → Prices, open **Billing** → **Free trial** → set to **14 days**.
2. This must be repeated for every tier × billing-cycle Price you create (see Part 2's table) — trial length isn't automatically shared between prices.

**PayPal:**
1. When creating a subscription Plan under **Products & Plans**, add a **trial billing cycle** before the regular cycle: Billing cycle 1 = Trial, Frequency: Day, `14`, Price: `$0.00`. Billing cycle 2 = Regular, your normal monthly/yearly price.
2. Do this for every Plan ID you create (see Part 1b/1c below and PLAN_IDS in `shared/paypal-sdk.js`).

**Cancellation during trial:** both Paddle and PayPal let a customer cancel during the trial with zero charge — this happens automatically via their standard subscription-cancel flow (the "Manage in PayPal" / Paddle customer portal links already on each `account/` page). No extra code needed.

**Testing:** always test the full trial-to-first-charge flow in Paddle Sandbox mode / PayPal Sandbox before going live to confirm the trial actually converts to a real charge after 14 days instead of silently expiring.

---

## Part 1 — PayPal Setup (all 6 tools, every tier × billing period)

### Step 1a — Get your Live Client ID

1. Go to **[developer.paypal.com](https://developer.paypal.com)** → log in
2. Click **Apps & Credentials** → **Live** tab
3. Click **Create App** → name: `Oli Tools` → type: `Merchant` → Create
4. Copy the **Client ID**
5. Open `shared/paypal-sdk.js` and replace the `PAYPAL_CLIENT_ID` line
   (this one has already been done — a real Client ID is filled in):
   ```js
   var PAYPAL_CLIENT_ID = 'YOUR_PAYPAL_CLIENT_ID_HERE';
   ```

**This single change activates the PayPal Client ID for all 6 tools** —
but a real Client ID alone isn't enough to charge correctly. Every buy
page lets a customer pick a tier (e.g. Starter/Pro/Agency) AND a
monthly/yearly toggle, and PayPal requires a **separate Plan ID for
every exact amount/interval combination**. `shared/paypal-sdk.js`'s
`PLAN_IDS` is structured as `PLAN_IDS[toolKey][tierKey][period]` for
exactly this reason — it re-renders the on-page Subscribe button
whenever the customer changes their selection, always pointing at the
Plan ID that matches what's actually on screen. **You must create one
PayPal Plan for every tier × billing period shown in the table in Part
2 below**, for all 6 tools — there is no shortcut tier that "activates
automatically"; each amount needs its own real Plan ID or that specific
selection will show a "not yet configured" notice instead of a working
button.

### Step 1b — Create every tier × period Plan, for every tool

Repeat this once per tool (6 tools), and once per tier × billing period
within each tool (see the table in Part 2 for the exact tier list and
amounts per tool — e.g. OliOps needs 6 Plans: Starter/Pro/Agency ×
monthly/yearly; Oli-Locator needs 6 (Starter/Pro/Agency × monthly/yearly,
same structure as OliOps); OliSalesTrack needs 2):

1. PayPal Dashboard → **Products & Plans** → **Create Product**
   - Name: e.g. `OliOps Suite`, `Oli-Locator`, `OliSalesTrack Pro`, etc.
   - Type: `SERVICE` · Category: `SOFTWARE`
   - Home URL: the tool's live marketing page, e.g.
     `https://olielicz.github.io/marketing/oli-locator/`
2. Under that product, click **Create Plan** once per tier × billing
   period, e.g. for Oli-Locator:
   - `Oli-Locator Starter Monthly` → **$29.00 USD/month**
   - `Oli-Locator Starter Yearly` → **$290.00 USD/year**
   - `Oli-Locator Pro Monthly` → **$79.00 USD/month**
   - `Oli-Locator Pro Yearly` → **$790.00 USD/year**
   - `Oli-Locator Agency Monthly` → **$199.00 USD/month**
   - `Oli-Locator Agency Yearly` → **$1990.00 USD/year**
   - Status: **Active** → Save each
3. Copy each **Plan ID** (starts with `P-`)
4. Open `shared/paypal-sdk.js` and paste each into the matching
   `PLAN_IDS[toolKey][tierKey][period]` slot. Tier keys must match the
   `key` field on that tool's buy page's `PLANS` array exactly (visible
   in the bottom `<script>` block of each `buy/index.html` — e.g.
   `'starter'`, `'pro'`, and `'agency'` for Oli-Locator):
   ```js
   var PLAN_IDS = {
     'oli-locator': {
       'solo-agent': { monthly: 'P-YOUR_REAL_ID', yearly: 'P-YOUR_REAL_ID' },
       'team':       { monthly: 'P-YOUR_REAL_ID', yearly: 'P-YOUR_REAL_ID' },
     },
     // ...repeat for every tool
   };
   ```

You don't have to configure every single tier × period before launch —
`paypal-sdk.js` shows the PayPal button as long as AT LEAST ONE tier for
that tool has a real Plan ID; if a customer picks a tier/period you
haven't configured yet, they see a clear "not yet configured, try a
different plan" notice instead of a broken button or being charged the
wrong amount.

### Step 1c — Apple Pay & Google Pay via PayPal (no extra Plan setup needed)

Every buy page already has an `#applepay-button-container` and
`#googlepay-button-container` div right next to the PayPal button (see
`shared/paypal-sdk.js`'s `renderWalletButtons()`). These reuse the exact
same Plan IDs you just configured above — a subscription created via the
Apple Pay or Google Pay button is a completely normal PayPal subscription
server-side, so there is nothing new to create in PayPal's Products &
Plans for this step.

To turn them on:
1. In your PayPal Business account, check whether Apple Pay / Google Pay
   are available to you (PayPal Dashboard → look for wallet payment
   method settings; availability can vary by country and account type —
   as of 2026 this is broadly available for US-based Business accounts,
   more limited elsewhere).
2. That's it on PayPal's side — `paypal-sdk.js` already requests
   `enable-funding=applepay,googlepay` from the JS SDK. Each button only
   actually renders when PayPal's own `isEligible()` check confirms BOTH
   your account supports it AND the current buyer's device/browser does
   (Apple Pay: Safari on a supported Apple device with a card in Wallet;
   Google Pay: Chrome/Android with a card saved to Google Pay).
3. Test with a real Apple/Android device + Safari/Chrome — the sandbox
   PayPal environment supports test wallet payments; see PayPal's
   [Apple Pay](https://developer.paypal.com/apple-pay/integrate) and
   [Google Pay](https://developer.paypal.com/google-pay/integrate)
   integration docs if a button unexpectedly doesn't appear.

Nothing to configure in `shared/paypal-sdk.js` itself for this — it's
already wired up; the only "setup" is whatever PayPal's own account
settings require, and having a device that's actually eligible to test
with.

---

## Part 2 — Paddle Checkout (for all 6 tools)

Paddle uses an overlay checkout — customers stay on your buy page, no
redirect to a separate hosted page like Stripe Payment Links used.

### Step 2a — Apply as a Paddle seller

1. Go to **[paddle.com](https://paddle.com)** → apply as a seller
2. Fill in your business details — a DTI/SEC-registered business name
   helps here, though Paddle does accept individual/sole-proprietor
   sellers in many cases; this is a manual review, budget **1-3 business
   days** for approval, so start this early
3. Once approved: Paddle Dashboard → **Developer Tools → Authentication**
   → copy your **Client-side Token**
4. Open `shared/paddle-sdk.js` and replace:
   ```js
   var PADDLE_CLIENT_TOKEN = 'YOUR_PADDLE_CLIENT_TOKEN_HERE';
   var PADDLE_ENVIRONMENT = 'sandbox'; // change to 'production' once live
   ```

### Step 2b — Create every tier × period Price, for every tool

All 6 tools are recurring subscriptions, and every buy page has an
on-page tier selector plus a monthly/yearly toggle — exactly like
PayPal's Plan IDs, a Paddle Price is fixed to ONE exact tier × billing
cycle, so you need a **separate Price per tier × billing cycle** for
every tool (e.g. OliOps needs 6 Prices: Starter/Pro/Agency × monthly/
yearly) for every tier to charge correctly, not just display correctly.
`shared/paddle-sdk.js`'s `PRICE_IDS` is structured as
`PRICE_IDS[toolKey][tierKey][period]` for this exact reason — the
"Pay with Card" button resolves the real Price to charge fresh, at the
moment it's clicked, from whatever tier/period is currently selected on
the page.

| Tool | Product Name | Tiers (monthly / yearly) | Billing |
|---|---|---|---|
| OliOps Suite | `OliOps Suite` | Starter $39/mo·$348/yr, Pro $69/mo·$612/yr, Agency $119/mo·$1068/yr | Recurring |
| OliCommerce Stack | `OliCommerce Stack` | Basic $29/mo·$264/yr, Growth $49/mo·$444/yr, Scale $89/mo·$804/yr | Recurring |
| OliFlow Engine | `OliFlow Automation Engine` | Solo $35/mo·$312/yr, Pro $59/mo·$528/yr, Business $99/mo·$888/yr | Recurring |
| OliExplore | `OliExplore` | Creator $27/mo·$252/yr, Team $49/mo·$468/yr, Agency $89/mo·$828/yr | Recurring |
| Oli-Locator | `Oli-Locator` | Starter $29/mo·$290/yr, Pro $79/mo·$790/yr, Agency $199/mo·$1990/yr | Recurring |
| OliSalesTrack | `OliSalesTrack Pro` | Pro $24/mo·$204/yr (single tier) | Recurring |

1. Paddle Dashboard → **Catalog → Products** → **Create Product** (one per tool)
2. Under each Product → **Add Price** → repeat once per tier × billing
   period from the table above (e.g. 6 Prices for OliOps, 4 for
   Oli-Locator, 2 for OliSalesTrack) → set billing period to **Monthly**
   or **Yearly** accordingly → Save each
3. Copy each Price ID (starts with `pri_`)
4. Open `shared/paddle-sdk.js` and paste each into the matching
   `PRICE_IDS[toolKey][tierKey][period]` slot. Tier keys must match the
   `key` field on that tool's buy page's `PLANS` array exactly (e.g.
   `'starter'`, `'pro'`, `'agency'` for OliOps):
   ```js
   var PRICE_IDS = {
     'oliops': {
       'starter': { monthly: 'pri_YOUR_REAL_ID', yearly: 'pri_YOUR_REAL_ID' },
       'pro':     { monthly: 'pri_YOUR_REAL_ID', yearly: 'pri_YOUR_REAL_ID' },
       'agency':  { monthly: 'pri_YOUR_REAL_ID', yearly: 'pri_YOUR_REAL_ID' },
     },
     // ...repeat for every tool
   };
   ```

Same as PayPal (Part 1b): you don't need every slot filled before
launch. The Paddle button shows as long as at least one tier for that
tool is configured; if a customer's specific selection isn't configured
yet, they see a clear inline error instead of being charged incorrectly.

### Step 2c — Apple Pay & Google Pay via Paddle (zero code changes)

Unlike the PayPal wallet buttons above, Paddle's overlay checkout handles
Apple Pay and Google Pay entirely on its own — there is **no code in
this repo to touch at all** for this one:

1. Paddle Dashboard → **Checkout → Checkout settings**
2. Turn on **Apple Pay** and **Google Pay** (a couple of clicks each —
   no separate Apple/Google developer account needed; Paddle handles the
   merchant validation for both)
3. Save. That's it — the exact same `Paddle.Checkout.open({...})` call
   already in `shared/paddle-sdk.js` (unchanged) will now automatically
   present whichever wallet is available on the buyer's device (Apple
   Pay on Safari/iPhone/iPad/Mac; Google Pay on Chrome/Android/
   Chromebook) alongside the regular card fields, with no `variant`
   parameter needed for this basic behavior. If neither wallet is
   available on a given buyer's device, checkout falls back to the
   regular payment methods automatically.

Do this in Sandbox first (Step 2, above) so you can see it working with
Paddle's test wallet flow before flipping to Production.

### Paddle → login email after payment

Unlike Stripe, Paddle's overlay checkout fires a `checkout.completed`
JavaScript event directly in the browser — `shared/paddle-sdk.js` already
listens for this and calls `OliAuth.createAccount()` immediately, the
same way `paypal-sdk.js` does for PayPal. **No separate webhook or
Zapier step is needed for the welcome email to fire** — this is simpler
than the old Stripe setup, which needed a webhook because Stripe
redirects to a separate hosted page instead of staying on-page.

### Payouts to your Philippine bank account

1. Paddle Dashboard → **Payouts** → choose payout method: bank wire or PayPal
2. If using bank wire directly to a PH bank, expect higher fees on the
   currency conversion than routing through Wise
3. Recommended: set payout method to a **Wise Business account** (free to
   open, holds USD) → then transfer from Wise to your PH bank when ready
   — Wise's conversion rate is typically much closer to the real
   mid-market rate than a direct bank wire

### Testing before going live

Paddle Dashboard has a **Sandbox** environment completely separate from
Production, with its own test Products/Prices and test card numbers.
Test the full checkout → account creation → welcome email flow in
Sandbox before switching `PADDLE_ENVIRONMENT` to `'production'` and
swapping in your live Client-side Token and Price IDs.

---

## Part 3 — Stripe Payment Links (set up later, not needed for launch)

Every buy page already has a Stripe button (`id="stripeBtn"`) sitting
next to the Paddle and PayPal ones, currently pointing at a placeholder
link (`REPLACE_WITH_..._STRIPE_LINK`). It's safe to leave as-is
indefinitely — it's a plain `<a>` link, not a script, so it doesn't run
any code or show any error on page load the way Paddle/PayPal do when
unconfigured. Activate this whenever you're ready (e.g. once you have a
Stripe-supported business entity set up).

### Create one link per tool

1. Go to **[dashboard.stripe.com/payment-links](https://dashboard.stripe.com/payment-links)**
2. Click **+ New** → Add a product using the same tier table from Part 2 above
3. In **After payment** settings → choose **Redirect to URL** → enter:
   ```
   https://olielicz.github.io/marketing/account/
   ```
4. Copy the generated URL (e.g. `https://buy.stripe.com/xxxxxxxxxxxx`)
5. Open the matching `buy/index.html` and replace the placeholder in the
   `stripeBtn` link's `href`:

| File | Placeholder to replace |
|---|---|
| `oliops/buy/index.html` | `REPLACE_WITH_OLIOPS_STRIPE_LINK` |
| `olicommerce/buy/index.html` | `REPLACE_WITH_OLICOMMERCE_STRIPE_LINK` |
| `oliflow/buy/index.html` | `REPLACE_WITH_OLIFLOW_STRIPE_LINK` |
| `oliexplore/buy/index.html` | `REPLACE_WITH_OLIEXPLORE_STRIPE_LINK` |
| `oli-locator/buy/index.html` | `REPLACE_WITH_OLI_LOCATOR_STRIPE_LINK` |
| `olisalestrack/buy/index.html` | `REPLACE_WITH_OLISALESTRACK_STRIPE_LINK` |

### Stripe → send login email after payment

Unlike Paddle and PayPal, Stripe Payment Links redirect the customer to a
separate hosted page instead of staying on your buy page, so it can't
call `OliAuth.createAccount()` directly from JavaScript the way the other
two do. You'll need one of these two options once you activate Stripe:

**Option A — Stripe Webhook + Zapier (no code, ~10 minutes)**
1. In Stripe Dashboard → Developers → Webhooks → Add endpoint
2. URL: your Zapier catch webhook URL
3. Event: `checkout.session.completed`
4. In Zapier:
   - Trigger: Webhooks by Zapier → Catch Hook
   - Filter: `metadata.source` = `stripe`
   - Action: EmailJS → Send Email (template: `oli_welcome`)
   - Map fields: `customer_email` → `to_email`, product name → `tool_name`, etc.

**Option B — Stripe Webhook + Vercel Serverless (recommended for scale)**
Deploy a tiny Vercel function that:
1. Receives `checkout.session.completed` webhook
2. Calls `OliAuth.createAccount()` logic server-side
3. Sends email via Brevo API (more reliable than EmailJS at scale)

---

## Part 4 — Automatic Login Email Delivery (Paddle & PayPal)

### How it works

When a customer pays via **PayPal**, the flow is fully automatic:

```
PayPal payment success
  → paypal-sdk.js fires onApprove
  → getBuyerEmail() reads the email input on the buy page
  → OliAuth.createAccount(email, toolKey, orderId)
  → Generates temp password, stores account, sends EmailJS welcome email
  → Success modal shows with "Sign In to Your Account →" button
```

When a customer pays via **Paddle**, the flow is also fully automatic — the same `checkout.completed` event handled in Part 2 above.

### EmailJS Setup (required for emails to send)

1. Go to **[emailjs.com](https://www.emailjs.com)** → Sign up free
2. Email Services → Add Service → Gmail → connect `YOUR_SUPPORT_GMAIL_ADDRESS`
3. Create template `oli_welcome` (full copy-paste HTML in `EMAILJS-TEMPLATES.md`)
4. Create template `oli_renewal` (full copy-paste HTML in `EMAILJS-TEMPLATES.md`)
5. Create template `oli_reset` (full copy-paste HTML in `EMAILJS-TEMPLATES.md`)
6. Copy your **Public Key** (Account → General) and **Service ID**
7. Open `shared/auth.js` lines 28-32 and fill in:
   ```js
   var EMAILJS_CONFIG = {
     publicKey:       'your_real_public_key',
     serviceId:       'your_real_service_id',
     welcomeTemplate: 'oli_welcome',
     renewalTemplate: 'oli_renewal',
   };
   ```

**Testing:** before going live, use the EmailJS dashboard to send a test email and confirm it arrives in `YOUR_SUPPORT_GMAIL_ADDRESS`.

---

## Part 5 — Subscription Renewal Reminders

Oli-Locator and OliSalesTrack are recurring subscriptions. Customers receive an automatic reminder email **2-3 days before each renewal**.

### Auto-charge (you don't do anything)

PayPal Subscriptions and Paddle's recurring billing charge the customer's card automatically each period. If a payment fails, PayPal/Paddle retry automatically and email the customer. You don't need to do anything manually.

### Renewal reminder email trigger

**Option A — Zapier (free tier, no code)**
1. Trigger: PayPal → Successful Sale / subscription payment
2. Filter: payment type is recurring
3. Delay: wait until 2 days before next renewal date
4. Action: EmailJS → Send Email (`oli_renewal` template)

**Option B — PayPal Webhook**
1. PayPal Dashboard → Webhooks → event: `BILLING.SUBSCRIPTION.RENEWED`
2. In your webhook handler, call:
   ```js
   OliAuth.sendRenewalReminderEmail(email, toolKey, renewalDate, amount);
   ```

**What the renewal email contains:**
- Tool name + renewal amount
- Renewal date
- Link to cancel via PayPal (`https://www.paypal.com/myaccount/autopay/`)
- Link to sign in to account (`/login/?tool=TOOLKEY`)
- Support email

---

## Part 6 — Testing Before Going Live

### PayPal Sandbox
1. Go to **[developer.paypal.com/tools/sandbox](https://developer.paypal.com/tools/sandbox)**
2. Create a sandbox buyer account
3. Temporarily swap your Client ID with your **Sandbox Client ID** in `paypal-sdk.js`
4. Make a test payment end-to-end — confirm:
   - ✅ PayPal button appears
   - ✅ Payment processes
   - ✅ Success box shows with "Sign In to Your Account" button
   - ✅ Welcome email arrives (if EmailJS is configured)
   - ✅ Login works with temp password
   - ✅ Password change works on first login
   - ✅ (If testing on a real Apple/Android device) the Apple Pay /
     Google Pay button appears next to the regular PayPal button and
     completes a subscription the same way — see Part 1c
5. Switch back to Live Client ID

### Paddle Sandbox
1. Paddle Dashboard has a separate **Sandbox** environment (switch via account settings)
2. Use Paddle's test card numbers (documented in their Sandbox dashboard)
3. Confirm end-to-end checkout flow, then switch `PADDLE_ENVIRONMENT` to `'production'` in `shared/paddle-sdk.js`
4. If you enabled Apple Pay / Google Pay (Part 2c), open the checkout on
   a real Apple/Android test device to confirm the wallet option appears
   — Paddle's Sandbox supports test wallet payments the same way it
   supports test cards

### Stripe Test Mode (whenever you activate it — not needed for launch)
1. Stripe Dashboard has a **Test mode** toggle (top-left)
2. Use test card: `4242 4242 4242 4242`, any future date, any CVC
3. Confirm end-to-end checkout flow once you've wired up the webhook from Part 3

---

## Pricing Reference

| Tool | Price | Billing | Buy page file | PayPal | Apple/Google Pay (PayPal) | Paddle | Apple/Google Pay (Paddle) | Stripe |
|---|---|---|---|---|---|---|---|---|
| OliOps Suite | $39/mo or $348/yr | Monthly/Annual | `oliops/buy/index.html` | PayPal subscription | ✅ Wallet buttons (Part 1c) | Paddle Price | ✅ Auto in overlay (Part 2c) | Payment Link (set up later) |
| OliCommerce Stack | $29/mo or $264/yr | Monthly/Annual | `olicommerce/buy/index.html` | PayPal subscription | ✅ Wallet buttons (Part 1c) | Paddle Price | ✅ Auto in overlay (Part 2c) | Payment Link (set up later) |
| OliFlow Engine | $35/mo or $312/yr | Monthly/Annual | `oliflow/buy/index.html` | PayPal subscription | ✅ Wallet buttons (Part 1c) | Paddle Price | ✅ Auto in overlay (Part 2c) | Payment Link (set up later) |
| OliExplore | $27/mo or $252/yr | Monthly/Annual | `oliexplore/buy/index.html` | PayPal subscription plan | ✅ Wallet buttons (Part 1c) | Paddle Price | ✅ Auto in overlay (Part 2c) | Payment Link (set up later) |
| Oli-Locator | $29/mo or $290/yr | Monthly/Annual | `oli-locator/buy/index.html` | PayPal subscription plan | ✅ Wallet buttons (Part 1c) | Paddle Price | ✅ Auto in overlay (Part 2c) | Payment Link (set up later) |
| OliSalesTrack | $24/mo or $204/yr | Monthly/Annual | `olisalestrack/buy/index.html` | PayPal subscription plan | ✅ Wallet buttons (Part 1c) | Paddle Price | ✅ Auto in overlay (Part 2c) | Payment Link (set up later) |

Apple Pay / Google Pay is available on **every** tool through both
payment providers as of this update — see Part 1c (PayPal wallet
buttons, requires the container divs already added to every buy page)
and Part 2c (Paddle, a dashboard toggle with zero code changes). Neither
requires setting up a new payment processor.


> **Important:** if you change a price anywhere, update it in ALL the places it's baked in: the landing page, the buy page, and each actual payment platform's own record of the price (PayPal Plan, Paddle Price, and eventually the Stripe Payment Link) — changing the HTML alone does NOT change what is actually charged on any of the three.
