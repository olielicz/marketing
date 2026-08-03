# 30-Day Go-to-Market Sprint — Master Calendar

**Sprint window:** Day 1 = Wed, Jul 22, 2026 → Day 30 = Thu, Aug 20, 2026
**Owner:** olielicz (solo execution, $0 ad budget, free tools only)
**Goal:** Visible, measurable commercial traction on all **6 product lines** by Day 30 — not just "launched," but *selling*.

---

## The 6 Product Lines

**Pricing model (updated):** All 6 products are monthly/yearly subscriptions (no one-time/lifetime pricing) — billed via Stripe or PayPal, cancel anytime. Every plan includes a **14-day free trial** ($0 due at signup; first real charge happens automatically 14 days later unless cancelled — see `PAYMENTS-SETUP.md` Part 0 for how to configure this on the Stripe/PayPal side). Entry-tier price shown below; each product also has Pro/Agency/Team-level tiers on its `buy/` page.

| # | Product | Repos | Target Buyer | Price (entry tier) | Login |
|---|---|---|---|---|---|
| 1 | **OliOps Suite** | OliCRM, OliCompute, automate-CSR | Solo founders / small service businesses — CRM + invoicing/payroll + AI support in one | $39/mo or $348/yr | `/oliops/login/` |
| 2 | **OliCommerce Stack** | ecomm-automation, project-2 (OliMind AI) | Shopify store owners — cart recovery + AI shopping assistant | $29/mo or $264/yr | `/olicommerce/login/` |
| 3 | **OliFlow Automation Engine** | project-3 (OliFlow), auto-tools | Agencies / ops teams — self-hosted Zapier with prebuilt templates | $35/mo or $312/yr | `/oliflow/login/` |
| 4 | **OliExplore** | oliexplore | Social media managers / agencies — collect, recycle & publish posts across all platforms | $27/mo or $252/yr | `/oliexplore/login/` |
| 5 | **Oli-Locator** | lead-gen | Solo real estate agents / small teams — leads + property search + call center + inbox | $59/mo or $516/yr | `/oli-locator/login/` |
| 6 | **OliSalesTrack** | SalesTrack (refund-tracker) | Small business owners / e-commerce sellers — track sales, refunds & expenses with correlation analysis | $24/mo or $204/yr | `/olisalestrack/login/` |

> **Note:** Each product has its **own separate login page, account dashboard, and user store**. A customer who buys both OliOps and OliSalesTrack has two completely separate accounts — one per product. This is by design.

---

## What "visible results by Day 30" concretely means

- [ ] **6 live landing pages** with working email capture
- [ ] **6 working login pages** — one per product (already built ✅)
- [ ] **6 working account dashboards** — one per product (already built ✅)
- [ ] **3 completed Product Hunt launches** (OliOps, OliFlow, OliCommerce)
- [ ] **40+ live directory/backlink listings** across the 6 lines
- [ ] **3 AppSumo submissions** filed (OliOps, OliCommerce, OliFlow)
- [ ] **100+ real estate agents** directly emailed (Oli-Locator)
- [ ] **50+ social media managers** directly emailed (OliExplore)
- [ ] **OliSalesTrack listed** on SaaS comparison sites (AlternativeTo, SaaSHub vs Baremetrics)
- [ ] A tracked email list (Brevo) with subscriber count and open/click rates
- [ ] At least the **first dollar of real revenue**
- [ ] A reusable playbook you can repeat every 30 days

---

## Pre-Sprint Checklist (Do Before Day 1)

These are technical prerequisites. **None of these block marketing work** — do them in parallel.

| Task | Where | Status |
|---|---|---|
| Merge PR #2 on marketing repo | github.com/olielicz/marketing | ☐ |
| Enable GitHub Pages (main branch, root) | Repo Settings → Pages | ☐ |
| Activate FormSubmit contact form (first submit confirms email) | Live contact page | ☐ |
| Paste PayPal Client ID into `shared/paypal-sdk.js` | GitHub editor or local | ☐ |
| Create Stripe Payment Links (all 6 tools) | dashboard.stripe.com/payment-links | ☐ |
| Set up EmailJS (welcome + renewal + reset templates) | emailjs.com | ☐ |
| Submit sitemap to Google Search Console | search.google.com/search-console | ☐ |
| Set up Cloudflare (free) in front of GitHub Pages | cloudflare.com | ☐ |
| (Optional) Migrate to Netlify for native `_headers` support | app.netlify.com | ☐ |

---

## Week 1 (Days 1–7) — Foundation

| Day | Task | Tool | Notes |
|---|---|---|---|
| 1 | Confirm all 6 landing pages live, all 6 login pages working | Browser test | Run `security-check.js` in console on each |
| 1 | Create Brevo account, verify sending domain | Brevo (free) | 300 emails/day free forever |
| 2 | Build 6 Brevo signup forms (one per product) — embed in each landing page | Brevo | Separate list per product for segmentation |
| 2 | Install Plausible (14-day free trial) or GA4 (free) on all 6 pages | Plausible / GA4 | |
| 3 | Load 5-email nurture sequences into Brevo Automation (one per product) | Brevo | Templates in `email-sequence-*.md` |
| 3 | **OliSalesTrack — Brevo sequence:** Write 5-email sequence targeting e-commerce sellers and SaaS founders who track revenue | Brevo | Use "refund rate is eating your profit" angle |
| 4 | Submit all 6 products to the directory list in `directory-submission-list.md` | AlternativeTo, SaaSHub, etc. | Add OliSalesTrack as alternative to Baremetrics, Profitwell |
| 5 | File AppSumo submissions for OliOps Suite, OliCommerce Stack, OliFlow Engine | sell.appsumo.com | Review takes 1–3 weeks |
| 6 | Write and schedule Week 2–4 social posts for all 6 products in Buffer | Buffer free plan | OliSalesTrack angle: "finally know if refunds are killing you" |
| 7 | **Checkpoint:** 6 pages live + logins working + forms capturing + directories submitted |  | |

---

## Week 2 (Days 8–14) — OliOps Suite goes loud

| Day | Task |
|---|---|
| 8–9 | Recruit 15–20 launch supporters, send them the PH link privately the morning of launch |
| 9 | **PRODUCT HUNT LAUNCH — OliOps Suite.** 12:01am PST. Reply to every comment within 5 minutes for 6 hours |
| 9 | Cross-post to r/SaaS, r/Entrepreneur, r/smallbusiness, Indie Hackers |
| 10 | Send Email #1 of OliOps nurture sequence to waitlist |
| 11–12 | Reply to every comment/DM — treat as a part-time job for 48 hours |
| 12 | **OliSalesTrack — submit to:** AlternativeTo (vs Baremetrics), SaaSHub, GetApp, Capterra (free listing) |
| 13 | Publish a "we launched" recap post, tag supporters |
| 14 | **Checkpoint:** log actual numbers — visitors, signups, sales |

---

## Week 3 (Days 15–21) — OliFlow launches + niche outreach begins

| Day | Task |
|---|---|
| 15 | Recruit launch supporters for OliFlow |
| 16 | **PRODUCT HUNT LAUNCH — OliFlow Automation Engine.** Cross-post to r/nocode, r/automation, r/SaaS, Indie Hackers |
| 16–17 | Reply to every comment for 48 hours |
| 17 | **Begin Oli-Locator outreach** — 20 emails/day to real estate agents using `outreach-oli-locator.md`, 100 by end of week |
| 18 | **Begin OliExplore outreach** — 50 social media managers/agencies + Reddit posts using `outreach-oliexplore.md` |
| 18 | **OliSalesTrack Reddit launch post:** r/ecommerce, r/shopify, r/Entrepreneur — "Show Reddit: OliSalesTrack — see how refunds correlate with your sales for free" |
| 19 | **OliSalesTrack — submit to Product Hunt** as a separate product launch (stagger from OliOps/OliFlow to avoid cannibalising votes) |
| 20 | Send OliSalesTrack waitlist Email #1 — subject: "Your refund rate is probably higher than you think" |
| 21 | **Checkpoint:** OliFlow PH badge, 100 real estate emails sent, 50 OliExplore outreach done, OliSalesTrack PH submitted |

---

## Week 4 (Days 22–30) — OliCommerce launches + conversion push

| Day | Task |
|---|---|
| 22 | Recruit OliCommerce launch supporters; post in Shopify community + r/shopify + r/ecommerce |
| 23 | **PRODUCT HUNT LAUNCH — OliCommerce Stack.** Reply to every comment for 48 hours |
| 24 | Send LTD urgency email to OliOps + OliFlow + OliSalesTrack waitlists |
| 25 | Follow up on all 3 AppSumo submissions — reply same-day to any reviewer questions |
| 26 | **OliSalesTrack — write 1 SEO blog post** on Medium/Substack: "How to find your true profit margin (refunds + expenses)" — link back to landing page |
| 26 | Collect testimonials from early users; add to all 6 landing pages |
| 27 | Second round: Oli-Locator (50 new contacts) + OliExplore (25 new contacts) outreach |
| 27 | **OliSalesTrack — AppSumo submission:** pitch "the only tracker that shows how refunds eat your profit" |
| 28 | Re-share best PH launches on LinkedIn/X with "1 month later" framing |
| 29 | Audit all 6 directory listings from Week 1 — confirm live, fix broken links |
| 30 | **Final scoreboard day.** Fill in every checkbox. Identify best-performing channel per product for Month 2 |

---

## OliSalesTrack — Specific Marketing Plan

OliSalesTrack targets a different buyer than the other 5 tools — focus the messaging accordingly.

### Target audiences (in priority order)
1. **Shopify / WooCommerce store owners** — feel the pain of refunds appearing after profitable weeks
2. **Amazon / eBay sellers** — expense tracking is a constant headache
3. **SaaS founders** — churn-adjusted revenue visibility
4. **Freelancers & agencies** — need simple P&L without full accounting software

### Key message
> "You think you made $8,000 last month. After refunds and ad spend — you actually made $4,800. OliSalesTrack shows you the real number in 30 seconds."

### Positioning vs competitors

| Competitor | Their price | OliSalesTrack advantage |
|---|---|---|
| Baremetrics | $49+/mo | 2× cheaper + includes expense tracking + correlation analysis + live Stripe/PayPal/Shopify sync |
| Profitwell | Free–$499/mo | Much simpler, no complexity, browser-based |
| Google Sheets | Free but manual | Automatic, visual, no formula maintenance |
| QuickBooks | $25+/mo | Not a P&L tool — complementary, not competing |

**Live sync (new):** the `olisalestrack-sync/` service in this repo receives Stripe/PayPal/Shopify webhooks directly — sales and refunds now sync in automatically, closing the "CSV-only, no live API" gap noted in earlier competitor research.

### Best channels for OliSalesTrack
1. **r/ecommerce, r/shopify** — post case study: "I finally tracked refunds vs sales for 90 days — here's what I found"
2. **AlternativeTo** (list as alternative to Baremetrics)
3. **IndieHackers** — "Show IH" post with correlation chart screenshot
4. **Twitter/X thread** — before/after P&L numbers
5. **YouTube Shorts** — 60-second demo: add a sale, add a refund, see the correlation chart update

---

## The free tools doing all the heavy lifting

| Tool | Free tier | What it does |
|---|---|---|
| **Brevo** | 300 emails/day, unlimited contacts, forever | Waitlist capture + all 6 nurture sequences |
| **Product Hunt** | 100% free | 3–4 launches = biggest traffic spikes |
| **AppSumo** | Free to submit | Deprioritized — AppSumo's native model is lifetime deals, which no longer matches our subscription pricing (see `appsumo-alternatives-research.md`) |
| **Reddit / Indie Hackers** | Free | Where actual buyers already hang out |
| **GitHub Pages + Cloudflare** | Free | Hosting + CDN + security headers |
| **Netlify** | Free (100GB/mo) | Recommended upgrade — `_headers` native |
| **EmailJS** | 200 emails/mo free | Automatic purchase welcome + password reset emails |
| **FormSubmit.co** | Free | Contact form → Gmail, no backend needed |

---

## Honest expectations

- Product Hunt, AppSumo, and direct outreach are proven channels — not guaranteed 30-day results, but the correct free channels to maximise odds.
- OliSalesTrack has the clearest before/after story of all 6 products — lean into the "real profit vs perceived profit" angle hard.
- If Week 2's OliOps launch underperforms, diagnose before Week 3 — don't repeat the same mistake twice.
- The login system is live for all 6 tools. **First priority after launch: get the EmailJS welcome email working** so every buyer automatically receives their login details.
