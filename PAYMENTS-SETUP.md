# Payment Setup — Stripe + PayPal

Every product's `buy/index.html` page has two payment buttons already built and styled — they just have **placeholder links** that need to be swapped for your real ones. This doc walks through exactly how to do that, for both Stripe and PayPal, for all 5 tools.

**Why Stripe + PayPal specifically:** together they cover roughly 60-65%+ of global online payment processing (PayPal ~43-45% market share, Stripe ~18-22%), and between them support virtually every major card network, digital wallet, and dozens of local payment methods across 100+ countries. This is the most broadly compatible combination available to a business selling internationally, without requiring a merchant-of-record service (see the note at the bottom on when you *might* want one of those instead).

---

## Part 1 — Stripe Payment Links (no code required)

Stripe Payment Links let you create a fully hosted checkout page in a few clicks, with zero backend code.

1. Go to [dashboard.stripe.com](https://dashboard.stripe.com) and sign in (or create a Stripe account — takes a few minutes, requires basic business info for verification).
2. In the left sidebar, go to **Payments → Payment Links** (or click the **+** icon → **Payment link**).
3. Click **Create a new product** (or reuse one if you've already made it):
   - **Name:** e.g. "OliOps Suite — Lifetime License"
   - **Price:** $299 (or whatever the current price is for that product — see table below)
   - **Billing:** select **One time** for the 4 lifetime products, or **Recurring → Monthly** for Oli-Locator only
4. Click **Create link**. Stripe gives you a URL like `https://buy.stripe.com/xxxxxxxxxxxx`.
5. Copy that URL.
6. Open the matching `buy/index.html` file in this repo (see table below), find the line:
   ```html
   <a class="pay-btn stripe" href="https://buy.stripe.com/REPLACE_WITH_YOUR_..._PAYMENT_LINK" ...>
   ```
   and replace the placeholder URL with your real one.
7. Repeat for all 5 products.

**Optional but recommended:** in the Payment Link settings, enable **"Collect customer's billing address"** and turn on **automatic tax calculation** (Stripe Tax) if you plan to sell in regions with VAT/sales tax obligations — this keeps you compliant without manual tax lookups.

**Delivering the serial code after payment:** Stripe Payment Links can redirect to a custom "thank you" page and/or trigger a webhook. The simplest no-code option: in the Payment Link's **After payment** settings, choose **"Show a confirmation page"** and add instructions there (e.g. "check your email in the next few minutes for your serial code"), then set up a Stripe **email receipt** or a simple **Zapier/OliFlow automation** (fitting, since you own an automation tool!) that listens for the `checkout.session.completed` webhook and calls the license server's `POST /api/licenses` endpoint (see `licensing/README.md`) to auto-generate and email a serial code. This is the one piece that needs actual wiring — happy to help build that automation next if you want it.

---

## Part 2 — PayPal Buy Now / Subscribe buttons (no code required)

### For the 4 one-time-payment products (OliOps, OliCommerce, OliFlow, OliConnect)

1. Go to [paypal.com](https://www.paypal.com) and log in with your **Business** account (create one if you only have a personal account — it's free and takes a few minutes).
2. Go to the Button Builder: [developer.paypal.com/payment-links-buttons/create-buy-button](https://developer.paypal.com/payment-links-buttons/create-buy-button)
3. Choose **Buy Now** as the button type.
4. Fill in:
   - **Item name:** e.g. "OliOps Suite — Lifetime License"
   - **Price:** $299 (match the product)
   - **Currency:** USD (or your preferred base currency — PayPal converts automatically for international buyers)
5. Click **Create Button**. PayPal gives you an embed snippet containing a `hosted_button_id` value like `hosted_button_id="ABC123XYZ"`.
6. Copy just that ID value (the part in quotes).
7. Open the matching `buy/index.html` file, find:
   ```html
   <input type="hidden" name="hosted_button_id" value="REPLACE_WITH_YOUR_HOSTED_BUTTON_ID">
   ```
   and replace the placeholder with your real ID.
8. Repeat for OliCommerce, OliFlow, and OliConnect.

### For Oli-Locator (recurring monthly subscription)

PayPal's recurring billing uses a different button type — a **Subscribe** button, not Buy Now.

1. In your PayPal Business account, go to **Products & Services → Subscriptions** (or search "Subscriptions" in the PayPal dashboard).
2. Create a new subscription plan:
   - **Product name:** "Oli-Locator — Agency Plan"
   - **Billing cycle:** Monthly
   - **Price:** $49/month
3. Once the plan is created, PayPal will generate a **Subscribe button** with its own `hosted_button_id`.
4. Open `oli-locator/buy/index.html`, find the same `hosted_button_id` placeholder, and swap it in.

**Delivering serial codes for PayPal payments:** same idea as Stripe — set up an **IPN (Instant Payment Notification)** or use a no-code connector (Zapier, Make, or your own OliFlow instance) that listens for "Payment Completed" and triggers the license server. PayPal's IPN docs: [developer.paypal.com/api/nvp-soap/ipn](https://developer.paypal.com/api/nvp-soap/ipn/).

---

## Current pricing reference (keep this in sync with the actual landing pages)

| Product | Price | Billing | File to edit |
|---|---|---|---|
| OliOps Suite | $299 | One-time | `oliops/buy/index.html` |
| OliCommerce Stack | $199 | One-time | `olicommerce/buy/index.html` |
| OliFlow Automation Engine | $249 | One-time | `oliflow/buy/index.html` |
| OliConnect | $89 | One-time | `oliconnect/buy/index.html` |
| Oli-Locator | $49 | Monthly (recurring) | `oli-locator/buy/index.html` |

If you change a price on a landing page, update it in three places: the landing page itself, the matching `buy/index.html` page, and the actual Stripe/PayPal link/button (which has its own price baked in — editing the landing page text does NOT change what Stripe/PayPal actually charges).

---

## A note on merchant-of-record alternatives (Paddle, Lemon Squeezy, etc.)

Stripe and PayPal are **payment processors** — you (as the seller) remain legally responsible for calculating, collecting, and remitting sales tax/VAT in every jurisdiction you sell into. For a small number of lifetime-deal sales, this is usually manageable manually or via Stripe Tax (built into Stripe, low monthly cost).

If sales volume grows and cross-border tax compliance becomes a real burden, **merchant-of-record (MoR) platforms** like Paddle, Lemon Squeezy, or FastSpring take on that legal/tax responsibility for you in exchange for a higher fee (typically 5-8% vs. Stripe's ~2.9%+30¢). That's a reasonable thing to revisit once you have real sales volume — not necessary to start.

---

## Testing before going live

1. Stripe has a **test mode** toggle in the dashboard — use a test card (`4242 4242 4242 4242`, any future expiry, any CVC) to confirm the full checkout flow works before switching to live mode.
2. PayPal has a full **Sandbox** environment ([developer.paypal.com/tools/sandbox](https://developer.paypal.com/tools/sandbox/)) with fake buyer/seller accounts for the same purpose.
3. Test both buttons on each `buy/index.html` page end to end — including that the confirmation page/email actually appears — before announcing any tool as "for sale."
