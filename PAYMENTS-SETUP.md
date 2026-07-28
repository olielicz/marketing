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

**This single change activates PayPal buttons on OliOps ($299), OliCommerce ($199), OliFlow ($249), and OliConnect ($89) automatically.** No other PayPal config needed for those four.

### Step 1b — Oli-Locator Subscription Plan ($49/month)

1. PayPal Dashboard → **Products & Plans** → **Create Product**
   - Name: `Oli-Locator — Agency Plan`
   - Product ID: `OLI-LOCATOR-AGENCY-V1`
   - Type: `SERVICE` · Category: `SOFTWARE`
   - Home URL: `https://olielicz.github.io/marketing/oli-locator/`
   - Image URL: `https://olielicz.github.io/marketing/assets/oli-locator-product.png`
2. Click **Create Plan** under that product:
   - Plan Name: `Oli-Locator Monthly`
   - Billing: **Monthly** · Price: **$49.00 USD**
   - Status: **Active** → Save
3. Copy the **Plan ID** (starts with `P-`)
4. Open `shared/paypal-sdk.js` and replace line 26:
   ```js
   var LOCATOR_PLAN_ID = 'P-YOUR_ACTUAL_PLAN_ID';
   ```

### Step 1c — OliSalesTrack Subscription ($19/mo + $148/yr)

OliSalesTrack uses its own subscription script (separate from paypal-sdk.js because it has two plans).

1. Create a PayPal product (same steps as above):
   - Name: `OliSalesTrack Pro`
   - Product ID: `OLISALESTRACK-PRO`
   - Home URL: `https://olielicz.github.io/marketing/olisalestrack/`

2. Create **two plans** under that product:
   - Plan 1: `OliSalesTrack Monthly` → $19.00/month → copy Plan ID
   - Plan 2: `OliSalesTrack Yearly` → $148.00/year → copy Plan ID

3. Open `olisalestrack/buy/index.html` and add this script before `</body>`:

```html
<script>
(function() {
  var clientId  = 'YOUR_PAYPAL_CLIENT_ID_HERE'; // same ID from Step 1a
  var monthlyId = 'P-YOUR_MONTHLY_PLAN_ID';
  var yearlyId  = 'P-YOUR_YEARLY_PLAN_ID';

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

| Tool | Product Name | Price | Billing |
|---|---|---|---|
| OliOps Suite | `OliOps Suite — Lifetime License` | $299 | One time |
| OliCommerce Stack | `OliCommerce Stack — Lifetime License` | $199 | One time |
| OliFlow Engine | `OliFlow Automation Engine — Lifetime` | $249 | One time |
| OliConnect | `OliConnect — Lifetime License` | $89 | One time |
| Oli-Locator | `Oli-Locator — Agency Plan` | $49 | Recurring / Monthly |
| OliSalesTrack Monthly | `OliSalesTrack Pro — Monthly` | $19 | Recurring / Monthly |
| OliSalesTrack Yearly | `OliSalesTrack Pro — Annual` | $148 | Recurring / Yearly |

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
| OliOps Suite | $299 | One-time | `oliops/buy/index.html` | Auto (paypal-sdk.js) |
| OliCommerce Stack | $199 | One-time | `olicommerce/buy/index.html` | Auto (paypal-sdk.js) |
| OliFlow Engine | $249 | One-time | `oliflow/buy/index.html` | Auto (paypal-sdk.js) |
| OliConnect | $89 | One-time | `oliconnect/buy/index.html` | Auto (paypal-sdk.js) |
| Oli-Locator | $49/month | Monthly recurring | `oli-locator/buy/index.html` | Plan ID in paypal-sdk.js |
| OliSalesTrack | $19/month | Monthly recurring | `olisalestrack/buy/index.html` | Custom script (see Part 1c) |
| OliSalesTrack | $148/year | Yearly recurring | `olisalestrack/buy/index.html` | Custom script (see Part 1c) |

> **Important:** if you change a price anywhere, update it in THREE places: the landing page, the buy page, and the actual Stripe Payment Link / PayPal plan (which has the price baked in — changing the HTML does NOT change what is charged).
