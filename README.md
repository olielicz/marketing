# Oli Tools — Marketing & Product Suite

A portfolio of **6 business tools** built by **WorkItLikeAPro**.
Each tool solves one expensive business problem at a fraction of the cost.
Each product is sold, hosted, and logged into **completely separately**.

**Live site:** `https://workitlikeapro.com/` (custom domain via GitHub Pages or Cloudflare)
**Contact:** contact@workitlikeapro.com

---

## The 6 Products

| Tool | Price | Type | Login | Account |
|---|---|---|---|---|
| 💼 **OliOps Suite** | $39/mo or $348/yr | Self-hosted | `/oliops/login/` | `/oliops/account/` |
| 🛒 **OliCommerce Stack** | $29/mo or $264/yr | Self-hosted | `/olicommerce/login/` | `/olicommerce/account/` |
| ⚙️ **OliFlow Automation Engine** | $35/mo or $312/yr | Self-hosted | `/oliflow/login/` | `/oliflow/account/` |
| 🧭 **OliExplore** | $27/mo or $252/yr | Self-hosted | `/oliexplore/login/` | `/oliexplore/account/` |
| 🏡 **Oli-Locator** | $29/mo or $290/yr | Hosted SaaS | `/oli-locator/login/` | `/oli-locator/account/` |
| 📊 **OliSalesTrack** | $24/mo or $204/yr | Hosted SaaS | `/olisalestrack/login/` | `/olisalestrack/account/` |

---


## Architecture — Separate Login Per Product

Each product has its own fully independent login system:

```
Each tool folder contains:
├── index.html          ← Landing page (public)
├── buy/
│   └── index.html      ← Checkout page (email capture + PayPal/Paddle/Stripe)
├── login/
│   └── index.html      ← Tool-specific login page (branded per tool)
└── account/
    └── index.html      ← Tool-specific account dashboard (requires login)
```

**Why separate?** A customer who buys OliOps and OliSalesTrack has two completely independent accounts — separate passwords, separate sessions, separate dashboards. There is no single "Oli Tools account."

### Shared hub pages (redirectors)
- `/login/` — shows a grid of all 6 tools, links to each tool's login
- `/account/` — shows a grid of all 6 tools, links to each tool's account

---

## File Map

```
index.html                      ← Hub homepage
sitemap.xml                     ← SEO: 19+ page sitemap
robots.txt                      ← Points to sitemap
_headers                        ← Security headers (Netlify/Cloudflare Pages)
_redirects                      ← Netlify URL shorthand routes
.htaccess                       ← Apache security (InfinityFree/Hostinger)
.nojekyll                       ← GitHub Pages: disables Jekyll processing
HOSTING-GUIDE.md                ← Free & cheap hosting options (see below)
PAYMENTS-SETUP.md               ← PayPal + Paddle + Stripe wiring guide
GO-LIVE-CHECKLIST.md            ← Pre-launch checklist
00-master-calendar.md           ← 30-day GTM sprint with OliSalesTrack

── Shared code ─────────────────────────────────────────────────────────────
shared/
  auth.js                       ← Auth engine (per-tool namespaced)
  paypal-sdk.js                 ← PayPal JS SDK (auto-detects tool, creates account)
  security.js                   ← Security layer (right-click, DevTools, watermark)
  security-check.js             ← Runtime self-test (run in browser console)
  cookie-consent.js             ← GDPR cookie banner

── Backend services (Node, zero dependencies) ──────────────────────────────
licensing/                      ← Serial-code activation server (OliOps/OliCommerce/OliFlow/OliExplore)
olisalestrack-sync/             ← Live PayPal/Stripe/Shopify webhook sync server for OliSalesTrack
oliexplore-trends/              ← Trend Radar aggregator (GIPHY + YouTube) powering oliexplore/trends/

── 6 Tool folders (identical structure) ────────────────────────────────────
{tool}/
  index.html                    ← Landing page
  buy/index.html                ← Checkout (email capture + PayPal + Paddle + Stripe)
  login/index.html              ← Per-tool login page (branded)
  account/index.html            ← Per-tool account dashboard

── Hub redirectors ─────────────────────────────────────────────────────────
login/index.html                ← Tool selector → links to all 6 logins
account/index.html              ← Tool selector → links to all 6 accounts

── Legal & support ─────────────────────────────────────────────────────────
privacy/index.html              ← GDPR Privacy Policy (covers all 6 tools)
terms/index.html                ← Terms of Service (Queensland, Australia)
security/index.html             ← Trust & Security Center
support/index.html              ← Troubleshooting (per-tool FAQs)
contact/index.html              ← Contact form → YOUR_SUPPORT_GMAIL_ADDRESS
assets/README.md                ← Product image URLs for PayPal dashboard
```

---

## Login System

### How it works end-to-end

```
1. Customer enters email on buy page → pays via PayPal, Paddle, or Stripe
2. PayPal: paypal-sdk.js fires onApprove
   Paddle: paddle-sdk.js's overlay checkout fires checkout.completed
   → both call OliAuth.createAccount(email, toolKey, orderId) automatically
   Stripe: customer redirected to Stripe's hosted checkout, needs its own
   webhook/Zapier step to trigger account creation — see PAYMENTS-SETUP.md
   Part 3 whenever you activate it (not needed for launch)
   - Creates account in localStorage (scoped to that tool only)
   - Generates temporary password
   - Sends welcome email via EmailJS with:
       • Tool-specific login link (/TOOL/login/)
       • Temporary password
       • Order reference
   (Paddle was added alongside Stripe because Stripe does not support
   Philippines-based sellers — see PAYMENTS-SETUP.md for the full
   reasoning. The Stripe button remains in place as a placeholder for
   later, e.g. if you register a business entity in a Stripe-supported
   country down the line.)
4. Customer clicks link in email → lands on /TOOL/login/
5. Signs in with temp password → forced to set own permanent password
6. Lands on /TOOL/account/ dashboard:
   • Change password (any time)
   • View order history
   • Manage subscriptions (Oli-Locator + OliSalesTrack)
   • Contact support
```

### Per-tool storage namespacing

| Storage key | Contains |
|---|---|
| `oli_users_oliops` | OliOps Suite user accounts |
| `oli_users_olicommerce` | OliCommerce Stack user accounts |
| `oli_users_oliflow` | OliFlow user accounts |
| `oli_users_oliexplore` | OliExplore user accounts |
| `oli_users_oli-locator` | Oli-Locator user accounts |
| `oli_users_olisalestrack` | OliSalesTrack user accounts |
| `oli_session_oliops` | OliOps active session |
| `oli_session_olisalestrack` | OliSalesTrack active session |
| *(etc.)* | All sessions are independent |

### EmailJS Setup (required for automatic login emails)

1. Sign up free at **[emailjs.com](https://emailjs.com)** (200 emails/mo free)
2. Add service: Gmail → connect `YOUR_SUPPORT_GMAIL_ADDRESS`
3. Create 2 templates: `oli_welcome`, `oli_notice` (the free EmailJS plan caps at 2 templates — `oli_notice` is reused for both password resets and renewal reminders; see `EMAILJS-TEMPLATES.md` and `PAYMENTS-SETUP.md`)
4. Open `shared/auth.js` lines 7–13 → paste your Public Key + Service ID

---

## Security

The repo is public but the content is protected at multiple layers:

| Layer | What it does |
|---|---|
| `shared/security.js` | Right-click disable, Ctrl+U/S/A/P block, DevTools detection, text-select CSS, print blocking, image drag prevention, console copyright watermark |
| `_headers` | CSP, X-Frame-Options, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy (Netlify/CF Pages) |
| `.htaccess` | All of the above + bot blocking, hotlink protection, no directory listing (Apache hosts) |
| Login gates | account/ pages require `OliAuth.requireLogin(toolKey)` — unauthorized users are redirected |
| `meta[name=robots]` | `noindex,nofollow` on all login/ and account/ pages |
| HTTP no-cache | Login and account pages have `Cache-Control: no-store` |
| Copyright meta | `<meta name="copyright" content="© 2025 WorkItLikeAPro">` on every page |

**Important:** No client-side JS protection is unbreakable. Real protection = Terms of Service (✅ done) + copyright registration + actual tool functionality behind auth gates (✅ done for login/account pages).

### Running the security self-test

Open any page in a browser → open DevTools console → run:
```js
// Either include the script tag, or paste security-check.js contents directly
```
Or load it on a page during development:
```html
<script src="../../shared/security-check.js"></script>
```
Expected output: 6/6 checks passed (green).

---

## Hosting Options

See **`HOSTING-GUIDE.md`** for full step-by-step setup on all 6 platforms.

### Quick summary

| Platform | Cost | Best for | `_headers` | `.htaccess` |
|---|---|---|---|---|
| **GitHub Pages** | Free | Current setup | ❌ (use Cloudflare proxy) | ❌ |
| **Netlify** | Free | Recommended upgrade | ✅ native | ❌ |
| **Cloudflare Pages** | Free | Best performance | ✅ native | ❌ |
| **Vercel** | Free | Future dynamic features | ✅ vercel.json | ❌ |
| **InfinityFree** | Free | Apache/.htaccess | ❌ | ✅ |
| **Hostinger** | ~$2–3/mo | Most professional | ❌ | ✅ |

**Recommended path:**
1. **Today:** GitHub Pages (already live, merge PR #2)
2. **First sale:** Migrate to Netlify (5 minutes, `_headers` activates automatically)
3. **First $100:** Buy domain + Hostinger for real email address

---

## OliSalesTrack — Quick Reference

| Item | Value |
|---|---|
| Repo | `github.com/olielicz/SalesTrack` |
| App folder | `refund-tracker/` (PWA, single-file React) |
| Login page | `/olisalestrack/login/` |
| Account page | `/olisalestrack/account/` |
| Buy page | `/olisalestrack/buy/` |
| Landing page | `/olisalestrack/` |
| Monthly price | $24/month |
| Yearly price | $204/year (save 29%) |
| Payment | PayPal subscription + Paddle recurring (Stripe placeholder, set up later) |
| Competitors | Baremetrics ($49+/mo), Profitwell, Google Sheets |
| Key differentiator | Pearson correlation analysis: Sales ↔ Refunds ↔ Expenses |
| Target buyer | Shopify/WooCommerce/Amazon sellers, SaaS founders, freelancers |
| Marketing angle | "Your real profit after refunds and expenses — not the number you think" |

---

## Pre-Launch Checklist

### Must-do before launch
- [ ] Merge PR #2 on `github.com/olielicz/marketing`
- [ ] Enable GitHub Pages: Settings → Pages → Branch: `main` → `/` (root)
- [ ] Activate FormSubmit: submit contact form once → click confirmation email
- [ ] PayPal Client ID → paste in `shared/paypal-sdk.js`
- [ ] Paddle Client-side Token + Price IDs → paste in `shared/paddle-sdk.js`
- [ ] PayPal Plan IDs (all 6 tools) → `shared/paypal-sdk.js` PLAN_IDS object
- [ ] EmailJS setup → `shared/auth.js` (Public Key + Service ID — already done)
- [ ] Stripe Payment Links → set up later, not needed for launch (see PAYMENTS-SETUP.md Part 3)
- [ ] Submit sitemap → Google Search Console
- [ ] Add Cloudflare in front of GitHub Pages (for `_headers` + DDoS protection)

### Payments reference

| Tool | Buy page | Price | PayPal | Paddle | Stripe |
|---|---|---|---|---|---|
| OliOps | `oliops/buy/index.html` | $39/mo or $348/yr | PayPal subscription | Paddle Price | Later |
| OliCommerce | `olicommerce/buy/index.html` | $29/mo or $264/yr | PayPal subscription | Paddle Price | Later |
| OliFlow | `oliflow/buy/index.html` | $35/mo or $312/yr | PayPal subscription | Paddle Price | Later |
| OliExplore | `oliexplore/buy/index.html` | $27/mo or $252/yr | PayPal subscription | Paddle Price | Later |
| Oli-Locator | `oli-locator/buy/index.html` | $29/mo or $290/yr | PayPal subscription plan | Paddle Price | Later |
| OliSalesTrack | `olisalestrack/buy/index.html` | $24/mo or $204/yr | PayPal subscription plan | Paddle Price | Later |

See `PAYMENTS-SETUP.md` for the full step-by-step.
