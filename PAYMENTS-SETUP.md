# Payment Setup — Complete Guide

Covers Stripe, PayPal, automatic login email delivery, and subscription renewal reminders for all 6 Oli Tools.

---

## Overview of the payment + login flow

```
Customer enters email on buy page → pays via Stripe or PayPal
           │
           ▼
  PayPal: paypal-sdk.js fires onApprove
  Stripe: customer redirected to thank-you page (manual step — see Part 3)
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

---

## Part 0 — 14-Day Free Trial (applies to all 6 tools)

Every buy page now advertises "$0 today, then $X/mo after a 14-day free trial." This is a copy-only promise until the trial is actually configured on the Stripe/PayPal side — the HTML has no ability to delay a charge by itself. Set this up once per plan:

**Stripe:**
1. When creating each Price under Payments → Payment Links (or Products), open **Advanced settings** → **Free trial** → set to **14 days**.
2. This must be repeated for every tier × billing-cycle Price you create (see Part 2's table) — trial length isn't automatically shared between prices.

**PayPal:**
1. When creating a subscription Plan under **Products & Plans**, add a **trial billing cycle** before the regular cycle: Billing cycle 1 = Trial, Frequency: Day, `14`, Price: `$0.00`. Billing cycle 2 = Regular, your normal monthly/yearly price.
2. Do this for every Plan ID you create (see Part 1b/1c below and PLAN_IDS in `shared/paypal-sdk.js`).

**Cancellation during trial:** both Stripe and PayPal let a customer cancel during the trial with zero charge — this happens automatically via their standard subscription-cancel flow (the "Manage in PayPal" / Stripe customer portal links already on each `account/` page). No extra code needed.

**Testing:** always test the full trial-to-first-charge flow in Stripe Test mode / PayPal Sandbox before going live — advance the test clock (Stripe has a "Test clock" feature for this) to confirm the trial actually converts to a real charge after 14 days instead of silently expiring.

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

**This single change activates PayPal buttons on all 6 tools' entry-tier plans automatically.** OliOps ($39/mo or $348/yr), OliCommerce ($29/mo or $264/yr), OliFlow ($35/mo or $312/yr), and OliConnect ($19/mo or $168/yr) all use `paypal-sdk.js` directly. Each also has higher Pro/Agency/Business tiers configurable the same way (see Part 2's table below for the full tier list per tool).

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

## Part 2 — Stripe Payment Links (for all 6 tools)

Stripe Payment Links are fully hosted checkout pages — no code, just a URL.

### Create one link per tool

1. Go to **[dashboard.stripe.com/payment-links](https://dashboard.stripe.com/payment-links)**
2. Click **+ New** → Add a product:

All 6 tools are recurring subscriptions. Each Stripe Payment Link only supports one fixed Price, so create a **separate Payment Link per tier × billing cycle** (e.g. OliOps needs 6 links: Starter/Pro/Agency × monthly/yearly). For the initial launch, it's fine to wire only the entry-tier monthly link into each buy page's `stripeBtn` — the on-page plan selector already lets buyers pick a tier, but actually charging a different tier/cycle via Stripe requires either the matching Payment Link swapped in via JS, or (better, once you have bandwidth) a small serverless function that creates a Stripe Checkout Session dynamically based on the selected plan.

| Tool | Product Name | Tiers (monthly / yearly) | Billing |
|---|---|---|---|
| OliOps Suite | `OliOps Suite` | Starter $39/mo·$348/yr, Pro $69/mo·$612/yr, Agency $119/mo·$1068/yr | Recurring |
| OliCommerce Stack | `OliCommerce Stack` | Basic $29/mo·$264/yr, Growth $49/mo·$444/yr, Scale $89/mo·$804/yr | Recurring |
| OliFlow Engine | `OliFlow Automation Engine` | Solo $35/mo·$312/yr, Pro $59/mo·$528/yr, Business $99/mo·$888/yr | Recurring |
| OliConnect | `OliConnect` | Solo $19/mo·$168/yr, Agency $39/mo·$348/yr, Enterprise $79/mo·$708/yr | Recurring |
| Oli-Locator | `Oli-Locator` | Solo Agent $59/mo·$516/yr, Team $119/mo·$1068/yr | Recurring |
| OliSalesTrack | `OliSalesTrack Pro` | $24/mo·$204/yr (single tier) | Recurring |

3. In **After payment** settings → choose **Redirect to URL** → enter:
   ```
   https://olielicz.github.io/marketing/account/
   ```
4. Copy the generated URL (e.g. `https://buy.stripe.com/xxxxxxxxxxxx`)
5. Open the matching `buy/index.html` and replace the placeholder:

| File | Placeholder to replace |
|---|---|
| `oliops/buy/index.html` | `REPLACE_WITH_YOUR_OLIOPS_PAYMENT_LINK` |
| `olicommerce/buy/index.html` | `REPLACE_WITH_YOUR_OLICOMMERCE_PAYMENT_LINK` |
| `oliflow/buy/index.html` | `REPLACE_WITH_YOUR_OLIFLOW_PAYMENT_LINK` |
| `oliconnect/buy/index.html` | `REPLACE_WITH_YOUR_OLICONNECT_PAYMENT_LINK` |
| `oli-locator/buy/index.html` | `REPLACE_WITH_YOUR_OLILOCATOR_PAYMENT_LINK` |
| `olisalestrack/buy/index.html` | `REPLACE_WITH_OLISALESTRACK_MONTHLY_STRIPE_LINK` |
| `olisalestrack/buy/index.html` | `REPLACE_WITH_OLISALESTRACK_YEARLY_STRIPE_LINK` |

### Stripe → send login email after payment

PayPal fires the welcome email automatically via `paypal-sdk.js`. Stripe does not — you need one of these two options:

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

## Part 3 — Automatic Login Email Delivery

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

When a customer pays via **Stripe**, they need the Zapier/webhook setup above (Part 2, Stripe section).

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

## Part 4 — Subscription Renewal Reminders

Oli-Locator and OliSalesTrack are recurring subscriptions. Customers receive an automatic reminder email **2-3 days before each renewal**.

### Auto-charge (you don't do anything)

PayPal Subscriptions and Stripe Recurring billing charge the customer's card automatically each period. If a payment fails, PayPal/Stripe retry automatically and email the customer. You don't need to do anything manually.

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

## Part 5 — Testing Before Going Live

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

### Stripe Test Mode
1. Stripe Dashboard has a **Test mode** toggle (top-left)
2. Use test card: `4242 4242 4242 4242`, any future date, any CVC
3. Confirm end-to-end checkout flow

---

## Pricing Reference

| Tool | Price | Billing | Stripe file | PayPal |
|---|---|---|---|---|
| OliOps Suite | $39/mo or $348/yr | Monthly/Annual | `oliops/buy/index.html` | PayPal subscription |
| OliCommerce Stack | $29/mo or $264/yr | Monthly/Annual | `olicommerce/buy/index.html` | PayPal subscription |
| OliFlow Engine | $35/mo or $312/yr | Monthly/Annual | `oliflow/buy/index.html` | PayPal subscription |
| OliConnect | $19/mo or $168/yr | Monthly/Annual | `oliconnect/buy/index.html` | PayPal subscription |
| Oli-Locator | $59/mo or $516/yr | Monthly/Annual | `oli-locator/buy/index.html` | PayPal subscription plan |
| OliSalesTrack | $24/mo or $204/yr | Monthly/Annual | `olisalestrack/buy/index.html` | PayPal subscription plan |


> **Important:** if you change a price anywhere, update it in THREE places: the landing page, the buy page, and the actual Stripe Payment Link / PayPal plan (which has the price baked in — changing the HTML does NOT change what is charged).
