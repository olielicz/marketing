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

## Part 1 — PayPal Setup (handles 5 of 6 tools automatically)

### Step 1a — Get your Live Client ID

1. Go to **[developer.paypal.com](https://developer.paypal.com)** → log in
2. Click **Apps & Credentials** → **Live** tab
3. Click **Create App** → name: `Oli Tools` → type: `Merchant` → Create
4. Copy the **Client ID**
5. Open `shared/paypal-sdk.js` and replace line 23:
   ```js
   var PAYPAL_CLIENT_ID = 'YOUR_PAYPAL_CLIENT_ID_HERE';
   ```

**This single change activates PayPal buttons on all 6 tools' entry-tier plans automatically.** OliOps ($39/mo or $348/yr), OliCommerce ($29/mo or $264/yr), OliFlow ($35/mo or $312/yr), and OliExplore ($27/mo or $252/yr) all use `paypal-sdk.js` directly. Each also has higher Pro/Agency/Business tiers configurable the same way (see Part 2's table below for the full tier list per tool).

### Step 1b — Oli-Locator Subscription Plans ($59/mo Solo Agent, $119/mo Team)

1. PayPal Dashboard → **Products & Plans** → **Create Product**
   - Name: `Oli-Locator — Agency Plan`
   - Product ID: `OLI-LOCATOR-AGENCY-V1`
   - Type: `SERVICE` · Category: `SOFTWARE`
   - Home URL: `https://olielicz.github.io/marketing/oli-locator/`
   - Image URL: `https://olielicz.github.io/marketing/assets/oli-locator-product.png`
2. Click **Create Plan** under that product (create one plan per tier × billing cycle — 4 plans total):
   - `Oli-Locator Solo Agent Monthly` → **$59.00 USD/month**
   - `Oli-Locator Solo Agent Yearly` → **$516.00 USD/year**
   - `Oli-Locator Team Monthly` → **$119.00 USD/month**
   - `Oli-Locator Team Yearly` → **$1068.00 USD/year**
   - Status: **Active** → Save each
3. Copy each **Plan ID** (starts with `P-`)
4. Open `shared/paypal-sdk.js` and replace line 26 (and add the additional tier/yearly plan IDs the same way):
   ```js
   var LOCATOR_PLAN_ID = 'P-YOUR_ACTUAL_PLAN_ID';
   ```

### Step 1c — OliSalesTrack Subscription ($24/mo or $204/yr)

OliSalesTrack uses its own subscription script (separate from paypal-sdk.js because it has monthly + yearly plans).

1. Create a PayPal product (same steps as above):
   - Name: `OliSalesTrack Pro`
   - Product ID: `OLISALESTRACK-PRO`
   - Home URL: `https://olielicz.github.io/marketing/olisalestrack/`

2. Create **two plans** under that product:
   - Plan 1: `OliSalesTrack Monthly` → $24.00/month → copy Plan ID
   - Plan 2: `OliSalesTrack Yearly` → $204.00/year → copy Plan ID

3. Open `olisalestrack/buy/index.html` and add this script before `</body>`:

```html
<script>
(function() {
  var clientId  = 'YOUR_PAYPAL_CLIENT_ID_HERE'; // same ID from Step 1a
  var monthlyId = 'P-YOUR_MONTHLY_PLAN_ID'; // $24/month
  var yearlyId  = 'P-YOUR_YEARLY_PLAN_ID'; // $204/year

  function renderSalestrackBtn(containerId, planId, toolKey) {
    var s = document.createElement('script');
    s.src = 'https://www.paypal.com/sdk/js?client-id=' + clientId
          + '&vault=true&intent=subscription&currency=USD';
    s.onload = function() {
      paypal.Buttons({
        style: { layout:'vertical', color:'gold', shape:'rect', label:'subscribe', height:45 },
        createSubscription: function(d, a) {
          return a.subscription.create({ plan_id: planId });
        },
        onApprove: function(d) {
          // Create account + send welcome email
          var email = document.getElementById('buyerEmailCapture').value
                   || document.querySelector('input[type=email]')?.value || '';
          if (email && window.OliAuth) OliAuth.createAccount(email, toolKey, d.subscriptionID);
          // Show success
          var box = document.getElementById('paypal-success-box');
          if (box) { box.style.display='block'; var r=document.getElementById('paypal-ref-id'); if(r) r.textContent=d.subscriptionID; }
        },
        onError: function() {
          var e=document.getElementById('paypal-error-note'); if(e) e.style.display='block';
        }
      }).render('#' + containerId);
    };
    document.head.appendChild(s);
  }

  document.addEventListener('DOMContentLoaded', function() {
    renderSalestrackBtn('paypal-button-container',        monthlyId, 'olisalestrack');
    renderSalestrackBtn('paypal-button-container-yearly', yearlyId,  'olisalestrack');
  });
})();
</script>
```

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

### Step 2b — Create one Price per tool

All 6 tools are recurring subscriptions. Each Paddle Price is fixed to one
tier × billing cycle, same limitation as PayPal's Plan IDs — so create a
**separate Price per tier × billing cycle** (e.g. OliOps needs 6 Prices:
Starter/Pro/Agency × monthly/yearly) if you want every tier to actually
charge correctly, not just display correctly. For the initial launch,
it's fine to wire only the entry-tier monthly Price into `PRICE_IDS` in
`shared/paddle-sdk.js` — the on-page plan selector already lets buyers
pick a tier for display purposes.

| Tool | Product Name | Tiers (monthly / yearly) | Billing |
|---|---|---|---|
| OliOps Suite | `OliOps Suite` | Starter $39/mo·$348/yr, Pro $69/mo·$612/yr, Agency $119/mo·$1068/yr | Recurring |
| OliCommerce Stack | `OliCommerce Stack` | Basic $29/mo·$264/yr, Growth $49/mo·$444/yr, Scale $89/mo·$804/yr | Recurring |
| OliFlow Engine | `OliFlow Automation Engine` | Solo $35/mo·$312/yr, Pro $59/mo·$528/yr, Business $99/mo·$888/yr | Recurring |
| OliExplore | `OliExplore` | Creator $27/mo·$252/yr, Team $49/mo·$468/yr, Agency $89/mo·$828/yr | Recurring |
| Oli-Locator | `Oli-Locator` | Solo Agent $59/mo·$516/yr, Team $119/mo·$1068/yr | Recurring |
| OliSalesTrack | `OliSalesTrack Pro` | $24/mo·$204/yr (single tier) | Recurring |

1. Paddle Dashboard → **Catalog → Products** → **Create Product** (one per tool)
2. Under each Product → **Add Price** → enter the entry-tier monthly amount
   → set billing period to **Monthly** → Save
3. Copy the Price ID (starts with `pri_`)
4. Open `shared/paddle-sdk.js` and paste it into the matching `PRICE_IDS` entry:
   ```js
   var PRICE_IDS = {
     'oliops':        'pri_YOUR_REAL_ID',
     'olicommerce':   'pri_YOUR_REAL_ID',
     'oliflow':       'pri_YOUR_REAL_ID',
     'oliexplore':    'pri_YOUR_REAL_ID',
     'oli-locator':   'pri_YOUR_REAL_ID',
     'olisalestrack': 'pri_YOUR_REAL_ID',
   };
   ```

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
2. Email Services → Add Service → Gmail → connect `workitlikeapr01@gmail.com`
3. Create template `oli_welcome` (see README.md for full template copy)
4. Create template `oli_renewal` (see README.md for full template copy)
5. Create template `oli_reset` (see README.md for full template copy)
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

**Testing:** before going live, use the EmailJS dashboard to send a test email and confirm it arrives in `workitlikeapr01@gmail.com`.

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
5. Switch back to Live Client ID

### Paddle Sandbox
1. Paddle Dashboard has a separate **Sandbox** environment (switch via account settings)
2. Use Paddle's test card numbers (documented in their Sandbox dashboard)
3. Confirm end-to-end checkout flow, then switch `PADDLE_ENVIRONMENT` to `'production'` in `shared/paddle-sdk.js`

### Stripe Test Mode (whenever you activate it — not needed for launch)
1. Stripe Dashboard has a **Test mode** toggle (top-left)
2. Use test card: `4242 4242 4242 4242`, any future date, any CVC
3. Confirm end-to-end checkout flow once you've wired up the webhook from Part 3

---

## Pricing Reference

| Tool | Price | Billing | Buy page file | PayPal | Paddle | Stripe |
|---|---|---|---|---|---|---|
| OliOps Suite | $39/mo or $348/yr | Monthly/Annual | `oliops/buy/index.html` | PayPal subscription | Paddle Price | Payment Link (set up later) |
| OliCommerce Stack | $29/mo or $264/yr | Monthly/Annual | `olicommerce/buy/index.html` | PayPal subscription | Paddle Price | Payment Link (set up later) |
| OliFlow Engine | $35/mo or $312/yr | Monthly/Annual | `oliflow/buy/index.html` | PayPal subscription | Paddle Price | Payment Link (set up later) |
| OliExplore | $27/mo or $252/yr | Monthly/Annual | `oliexplore/buy/index.html` | PayPal subscription | Paddle Price | Payment Link (set up later) |
| Oli-Locator | $59/mo or $516/yr | Monthly/Annual | `oli-locator/buy/index.html` | PayPal subscription plan | Paddle Price | Payment Link (set up later) |
| OliSalesTrack | $24/mo or $204/yr | Monthly/Annual | `olisalestrack/buy/index.html` | PayPal subscription plan | Paddle Price | Payment Link (set up later) |


> **Important:** if you change a price anywhere, update it in ALL the places it's baked in: the landing page, the buy page, and each actual payment platform's own record of the price (PayPal Plan, Paddle Price, and eventually the Stripe Payment Link) — changing the HTML alone does NOT change what is actually charged on any of the three.
