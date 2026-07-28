# Oli Tools — Marketing & Product Suite

A portfolio of **6 business tools** built by **WorkItLikeAPro**. Each tool solves one expensive business problem at a fraction of the cost of the established alternatives.

**Live site (after merging PR #2 + enabling GitHub Pages):**
`https://olielicz.github.io/marketing/`

---

## The 6 Products

| Tool | URL | Pricing | Type |
|---|---|---|---|
| 💎 **OliOps Suite** | `/oliops/` | **$299 lifetime** | Self-hosted, up to 5 devices |
| 💎 **OliCommerce Stack** | `/olicommerce/` | **$199 lifetime** | Self-hosted, up to 5 devices |
| 💎 **OliFlow Automation Engine** | `/oliflow/` | **$249 lifetime** | Self-hosted, up to 5 devices |
| 💎 **OliConnect** | `/oliconnect/` | **$89 lifetime** | Self-hosted, up to 5 devices |
| 💎 **Oli-Locator** | `/oli-locator/` | **$49/month** | Hosted SaaS, login-based |
| 📊 **OliSalesTrack** | `/olisalestrack/` | **$19/mo or $148/yr** | Hosted SaaS, login-based |

**Contact:** workitlikeapr01@gmail.com · Company: **WorkItLikeAPro**

---

## Quick Start — Deploy & Go Live

**Step 1 — Merge PR #2** on GitHub (contains all current work)
**Step 2 — Enable GitHub Pages:** repo Settings → Pages → Branch: `main` → `/(root)` → Save
**Step 3 — Wire payments:** see `PAYMENTS-SETUP.md`
**Step 4 — Set up EmailJS** (for login emails): see [Login System](#login-system) below

---

## File Map

```
index.html                          ← Hub homepage — all 6 tools grid

── Tool folders ────────────────────────────────────────────────────────────
oliops/
  index.html                        ← OliOps Suite landing page
  buy/index.html                    ← Checkout page (Stripe + PayPal + email capture)
olicommerce/
  index.html                        ← OliCommerce Stack landing page
  buy/index.html                    ← Checkout page
oliflow/
  index.html                        ← OliFlow Automation Engine landing page
  buy/index.html                    ← Checkout page
oliconnect/
  index.html                        ← OliConnect landing page
  buy/index.html                    ← Checkout page
oli-locator/
  index.html                        ← Oli-Locator landing page (USA/UK/Australia)
  buy/index.html                    ← Subscription checkout page
olisalestrack/
  index.html                        ← OliSalesTrack landing page
  buy/index.html                    ← Monthly / Yearly checkout page

── Authentication ──────────────────────────────────────────────────────────
login/
  index.html                        ← Shared login portal for ALL 6 tools
account/
  index.html                        ← Customer account dashboard (profile, password, subscriptions, order history)
shared/
  auth.js                           ← Auth engine: login, logout, createAccount, changePassword,
  │                                     requestPasswordReset, requireLogin, sendWelcomeEmail (EmailJS),
  │                                     sendRenewalReminderEmail
  paypal-sdk.js                     ← PayPal JS SDK: detects product, creates account + sends welcome email on payment
  cookie-consent.js                 ← GDPR cookie banner (all pages)

── Legal & Support ─────────────────────────────────────────────────────────
privacy/index.html                  ← GDPR Privacy Policy (updated July 2025, covers all 6 tools)
terms/index.html                    ← Terms of Service (governing law: Queensland, Australia)
security/index.html                 ← Trust & Security Center
support/index.html                  ← Troubleshooting hub (per-tool FAQs)
contact/index.html                  ← Contact form → workitlikeapr01@gmail.com via FormSubmit.co
assets/README.md                    ← Where to upload product images (for PayPal dashboard)

── SEO ─────────────────────────────────────────────────────────────────────
sitemap.xml                         ← 19-URL sitemap (submit to Google Search Console)
robots.txt                          ← Points to sitemap, allows all crawlers

── Marketing docs ──────────────────────────────────────────────────────────
PAYMENTS-SETUP.md                   ← Complete payment wiring guide (Stripe + PayPal + renewal reminders)
STEP-BY-STEP-INSTRUCTIONS.md       ← Click-by-click external tool setup (Brevo, PH, AppSumo, directories)
00-master-calendar.md               ← 30-day go-to-market sprint calendar
launch-checklists/                  ← Per-tool launch checklists (txt)
email-sequence-*.md                 ← 5-email Brevo nurture sequences (per tool)
product-hunt-*.md                   ← Product Hunt launch copy (per tool)
appsumo-pitch-*.md                  ← AppSumo lifetime deal pitch (per tool)
outreach-*.md                       ← Cold outreach playbooks (Oli-Locator, OliConnect)
directory-submission-list.md        ← 40+ free directory submissions
competitor-comparison.md            ← Pros/cons vs. named competitors
appsumo-alternatives-research.md    ← Lifetime pricing rationale

── Licensing server ────────────────────────────────────────────────────────
licensing/                          ← Serial-code / 5-device activation server (Node.js, zero deps)
  README.md
  server/
  client/
  scripts/
  test/
```

---

## Login System

Every tool now has a **full login system** so customers access their purchased tools using their own email address and password. No serial codes required as a primary delivery mechanism — login credentials are emailed automatically on purchase.

### How it works end-to-end

```
Customer buys tool (PayPal or Stripe)
        │
        ▼
paypal-sdk.js fires onApprove
        │
        ├─► OliAuth.createAccount(email, toolKey, orderId)
        │         │
        │         ├─► Creates account in localStorage (upgradeable to real DB)
        │         ├─► Generates temporary password
        │         └─► Sends welcome email via EmailJS with:
        │               • Temporary password
        │               • Direct login link (/login/?tool=TOOLKEY)
        │               • Order reference
        │
        └─► Shows success modal with "Sign In to Your Account →" button

Customer clicks login link in email
        │
        ▼
/login/?tool=TOOLKEY
        │
        ├─► Signs in with email + temp password
        ├─► Forced to set new password on first login
        └─► Redirected to /account/ dashboard
                  │
                  ├─► "Open Tool →" button for each purchased tool
                  ├─► Change password (any time)
                  ├─► View order history
                  └─► Manage subscriptions (link to PayPal autopay)
```

### EmailJS Setup (free — 5 minutes)

EmailJS sends the automatic emails from your Gmail. **No backend server required.**

1. Go to **[emailjs.com](https://www.emailjs.com)** → Sign up free (200 emails/month on free tier)
2. **Add a service:** Email Services → Add Service → Gmail → connect `workitlikeapr01@gmail.com`
3. **Create 3 email templates:**

**Template 1 — `oli_welcome` (sent after every purchase)**
```
Subject: Your {{tool_name}} login details
Body:
Hi {{to_name}},

Your purchase of {{tool_name}} is confirmed! 🎉

Here are your login details:

Email:    {{to_email}}
Password: {{temp_password}}

Sign in here: {{login_url}}

You'll be asked to set your own password on first login.

Order reference: {{order_ref}}
Questions? Email workitlikeapr01@gmail.com

— Oli Tools Team
```

**Template 2 — `oli_renewal` (sent 2-3 days before subscription renewal)**
```
Subject: Reminder: Your {{tool_name}} subscription renews on {{renewal_date}}
Body:
Hi {{to_name}},

Just a heads-up — your {{tool_name}} subscription (${{amount}}/month)
will automatically renew on {{renewal_date}}.

No action needed if you'd like to continue.
To cancel before renewal: {{cancel_url}}

Sign in to your account: {{login_url}}

— Oli Tools Team
```

**Template 3 — `oli_reset` (sent when customer clicks "Forgot Password")**
```
Subject: Reset your Oli Tools password
Body:
Hi {{to_name}},

Click the link below to reset your password (valid for 1 hour):

{{reset_url}}

If you didn't request this, ignore this email.

— Oli Tools Team
```

4. Go to **Account → General → Public Key** — copy it
5. Open `shared/auth.js` and fill in your values (lines 28–32):

```js
var EMAILJS_CONFIG = {
  publicKey:       'YOUR_ACTUAL_PUBLIC_KEY',   // ← paste here
  serviceId:       'YOUR_ACTUAL_SERVICE_ID',   // ← from Email Services tab
  welcomeTemplate: 'oli_welcome',
  renewalTemplate: 'oli_renewal',
};
```

6. Commit + push — all welcome emails now send automatically.

### Renewal Reminder Emails (subscriptions only)

Oli-Locator ($49/mo) and OliSalesTrack ($19/mo or $148/yr) send renewal reminder emails automatically 2-3 days before each billing date.

**How to trigger them (two options):**

**Option A — PayPal Webhook (recommended)**
1. In PayPal Developer Dashboard → Webhooks → Add webhook
2. URL: a simple serverless function (Vercel/Netlify free tier) that calls `OliAuth.sendRenewalReminderEmail(email, toolKey, date, amount)`
3. Event: `BILLING.SUBSCRIPTION.PAYMENT.SUCCEEDED` — fires 2-3 days before renewal

**Option B — Zapier (no code, free tier)**
1. Trigger: PayPal → New Sale/Payment (connect your PayPal account)
2. Filter: only subscription payments
3. Action: EmailJS → Send Email (use the `oli_renewal` template)
4. Set delay: 3 days before the next renewal date

**Auto-charge:** handled entirely by PayPal Subscriptions and Stripe recurring billing. Once a customer subscribes, PayPal/Stripe charges their card automatically each period — you don't do anything. The customer can cancel from their PayPal account or from the `/account/` page.

### Upgrading from localStorage to a Real Database

`shared/auth.js` currently stores users in the browser's `localStorage`. This works perfectly on GitHub Pages with no backend. When you're ready to scale:

| Step | Replace | With |
|---|---|---|
| User storage | `getUser() / saveUser()` in auth.js | `fetch('/api/users', ...)` calls to your backend |
| Password hashing | Client-side hash in auth.js | `bcrypt` on your server |
| Email sending | EmailJS | Brevo API, SendGrid, Postmark |
| Session | `sessionStorage` | Server-side sessions or JWTs |

Recommended backend: **Supabase** (free tier, PostgreSQL, auth built-in) or **Firebase** (free tier, real-time).

---

## Trust & Compliance

| Item | Status |
|---|---|
| Privacy Policy | ✅ GDPR-aligned, last updated July 2025, covers all 6 tools |
| Terms of Service | ✅ Governing law: Queensland, Australia. Covers all 6 tools |
| Cookie consent banner | ✅ `shared/cookie-consent.js` on every page |
| Security disclosure | ✅ `/security/` — honest, no SOC2 overclaiming |
| Contact form | ✅ FormSubmit.co → workitlikeapr01@gmail.com (activate with first submission) |
| Open Graph tags | ✅ All 6 tool pages |
| JSON-LD structured data | ✅ Homepage (WebSite + ItemList) |
| Sitemap | ✅ `sitemap.xml` — 19 URLs |
| Robots.txt | ✅ Points to sitemap |
| Testimonial disclaimers | ✅ Each page flags illustrative examples — replace with real reviews |

---

## Pre-Launch Status

### Must do before launch
- [ ] **Merge PR #2** on `github.com/olielicz/marketing`
- [ ] **Enable GitHub Pages:** Settings → Pages → Branch: `main` → `/(root)`
- [ ] **Activate FormSubmit contact form** — submit the form once, click the confirmation email
- [ ] **PayPal Client ID** → paste in `shared/paypal-sdk.js` line 23
- [ ] **Stripe Payment Links** → paste into each `buy/index.html` (see `PAYMENTS-SETUP.md`)
- [ ] **Oli-Locator PayPal Plan ID** → paste in `shared/paypal-sdk.js` line 26
- [ ] **OliSalesTrack PayPal Subscription** → add script block to `olisalestrack/buy/index.html`
- [ ] **EmailJS setup** → fill in `shared/auth.js` lines 28-32 (see Login System above)
- [ ] **Submit sitemap** to Google Search Console: `https://search.google.com/search-console`

### Marketing
- [ ] Product Hunt launches (OliOps, OliFlow, OliCommerce) — see `product-hunt-*.md`
- [ ] AppSumo submissions (OliOps, OliCommerce, OliFlow, OliConnect) — see `appsumo-pitch-*.md`
- [ ] Directory submissions (40+ sites) — see `directory-submission-list.md`
- [ ] Brevo email sequences (5-email nurture per tool) — see `email-sequence-*.md`
- [ ] Cold outreach (Oli-Locator, OliConnect) — see `outreach-*.md`
- [ ] Analytics (GA4 / Plausible) — add `<script>` to `<head>` of all pages

---

## Payments Reference

| Tool | Price | Stripe file to edit | PayPal |
|---|---|---|---|
| OliOps Suite | $299 one-time | `oliops/buy/index.html` | Auto via `paypal-sdk.js` |
| OliCommerce Stack | $199 one-time | `olicommerce/buy/index.html` | Auto via `paypal-sdk.js` |
| OliFlow Engine | $249 one-time | `oliflow/buy/index.html` | Auto via `paypal-sdk.js` |
| OliConnect | $89 one-time | `oliconnect/buy/index.html` | Auto via `paypal-sdk.js` |
| Oli-Locator | $49/month | `oli-locator/buy/index.html` | Needs Plan ID in `paypal-sdk.js` |
| OliSalesTrack | $19/mo or $148/yr | `olisalestrack/buy/index.html` | Needs separate subscription script |

See `PAYMENTS-SETUP.md` for the full step-by-step.
