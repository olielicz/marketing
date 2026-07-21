# 30-Day Go-to-Market Sprint — Master Calendar

**Sprint window:** Day 1 = Wed, Jul 22, 2026 → Day 30 = Thu, Aug 20, 2026
**Owner:** olielicz (solo execution, $0 ad budget, free tools only)
**Goal:** Visible, measurable commercial traction on all 5 product lines by Day 30 — not just "launched," but *selling*.

---

## The 5 product lines (final)

| # | Line | Repos bundled | Who buys it | Price |
|---|---|---|---|---|
| 1 | **OliOps Suite** | OliCRM, OliCompute, automate-CSR | Solo founders / small service businesses who want CRM + invoicing/payroll/accounting + AI customer support in one place instead of 4 subscriptions | $79 LTD or $19/mo |
| 2 | **OliCommerce Stack** | ecomm-automation, project-2 (OliMind AI) | Shopify store owners who want order automation (abandoned cart, thank-you emails) + an AI shopping assistant | $59 LTD or $15/mo |
| 3 | **OliFlow Automation Engine** | project-3 (OliFlow), auto-tools | Agencies/ops teams who want a self-hosted Zapier alternative with prebuilt n8n/Make/Zapier templates | $99 LTD or $0 self-hosted |
| 4 | **OliConnect** | oliconnect | Social media managers, agencies, solo creators who want to recycle top-performing posts across all their accounts from one login | $29 LTD or $9/mo |
| 5 | **Oli-Locator** | lead-gen | Solo real estate agents / small teams who want leads + property search + call center + inbox in one app | $39/mo (recurring — niche vertical tools retain better as subscriptions, not LTDs) |

*(oliexplore excluded per instruction — not part of this campaign.)*

**Why 5 lines instead of 10 tools:** every hour spent writing copy, running outreach, or answering PH comments covers 2 repos at once. This doubles output for the same time cost, which is the entire point of a 30-day sprint with no ad budget.

---

## What "visible results by Day 30" concretely means

- [ ] 5 live landing pages with working email capture
- [ ] 3 completed Product Hunt launches (OliOps, OliFlow, OliCommerce)
- [ ] 40+ live directory/backlink listings across the 5 lines
- [ ] 3 AppSumo submissions filed (OliOps, OliCommerce, OliFlow)
- [ ] 100+ real estate agents and 50+ social media managers/agencies directly emailed (Oli-Locator, OliConnect)
- [ ] A tracked email list (Brevo) with subscriber count and open/click rates
- [ ] At least the first dollar of real revenue (LTD sale, subscription, or AppSumo pre-order)
- [ ] A reusable playbook you can repeat every 30 days without needing this rebuilt

---

## Week 1 (Days 1–7) — Foundation

| Day | Task | Tool |
|---|---|---|
| 1 | Deploy all 5 landing pages to GitHub Pages or Vercel free tier | GitHub Pages / Vercel (free) |
| 1 | Create Brevo account, verify sending domain | Brevo (free, 300 emails/day) |
| 2 | Build 5 Brevo signup forms, embed into each landing page (swap `<!-- BREVO_FORM -->` block) | Brevo |
| 2 | Install Plausible (14-day free trial) or GA4 (free forever) on all 5 pages | Plausible / GA4 |
| 3 | Load the OliOps 5-email nurture sequence into Brevo Automation; duplicate the pattern for the other 4 lines | Brevo |
| 4 | Submit all 5 lines to the directory list in `directory-submission-list.md` | AlternativeTo, SaaSHub, etc. |
| 5 | File AppSumo submissions for OliOps Suite, OliCommerce Stack, OliFlow Engine — review takes 1–3 weeks | sell.appsumo.com |
| 6 | Write and schedule Week 2–4 social posts in Buffer free plan | Buffer |
| 7 | **Checkpoint:** all 5 pages live, forms capturing emails, directories submitted, 3 AppSumo pitches filed. |

---

## Week 2 (Days 8–14) — OliOps Suite goes loud

| Day | Task |
|---|---|
| 8–9 | Recruit 15–20 launch-day supporters, send them the PH link privately the morning of launch. |
| 9 | **PRODUCT HUNT LAUNCH — OliOps Suite.** Launch at 12:01am PST. Reply to every comment within 5 minutes for 6 hours. |
| 9 | Cross-post to r/SaaS, r/Entrepreneur, r/smallbusiness, Indie Hackers. |
| 10 | Send Email #1 of nurture sequence to the OliOps waitlist. |
| 11–12 | Respond to every comment/reply/DM — treat as a part-time job for 48 hours. |
| 13 | Publish a "we launched" recap post, tag supporters. |
| 14 | **Checkpoint:** log actual numbers (visitors, signups, sales) in a spreadsheet. |

---

## Week 3 (Days 15–21) — OliFlow launches, niche outreach begins

| Day | Task |
|---|---|
| 15 | Recruit launch-day supporters for OliFlow. |
| 16 | **PRODUCT HUNT LAUNCH — OliFlow Automation Engine.** Cross-post to r/nocode, r/automation, r/SaaS, Indie Hackers. |
| 16–17 | Reply to every comment for 48 hours. |
| 17 | **Begin Oli-Locator direct outreach** using `outreach-oli-locator.md` — 20 emails/day to real estate agents, 100 by end of week. |
| 18 | **Begin OliConnect direct outreach** using `outreach-oliconnect.md` — 50 social media managers/agencies + Reddit posts. |
| 19–20 | Continue outreach cadence for both niche tools. |
| 21 | **Checkpoint:** OliFlow PH badge earned, 100 real estate emails sent, 50 social-media outreach sent. Log reply rates. |

---

## Week 4 (Days 22–30) — OliCommerce launches, conversion push, close the loop

| Day | Task |
|---|---|
| 22 | Recruit launch-day supporters for OliCommerce Stack; post in Shopify community forums + r/shopify + r/ecommerce. |
| 23 | **PRODUCT HUNT LAUNCH — OliCommerce Stack.** Reply to every comment for 48 hours. |
| 24 | Send LTD urgency email to full OliOps + OliFlow waitlists. |
| 25 | Follow up on all 3 AppSumo submissions — reply same-day to reviewer questions. |
| 26 | Collect testimonials from anyone who's bought/signed up; add to all 5 landing pages. |
| 27 | Second round of Oli-Locator + OliConnect outreach (fresh batch of 50 + 25 contacts). |
| 28 | Re-share best-performing PH launch on LinkedIn/X with "1 month later" framing. |
| 29 | Audit every directory listing from Week 1 — confirm live, fix broken links. |
| 30 | **Final scoreboard day.** Fill in every checkbox above with real numbers. Identify best-performing channel for Month 2. |

---

## The free tools doing all the heavy lifting

| Tool | Free tier | What it's doing in this plan |
|---|---|---|
| **Brevo** | 300 emails/day, unlimited contacts, forever free | Waitlist capture + all 5 nurture sequences |
| **Product Hunt** | 100% free | 3 launches = biggest traffic spikes of the month |
| **AppSumo** | Free to submit | Fastest path to real one-time-payment revenue if accepted |
| **Reddit / Indie Hackers / niche communities** | 100% free | Where actual buyers already hang out |
| **GitHub Pages / Vercel** | 100% free | Hosting for all 5 landing pages |

---

## Honest expectations

- Product Hunt, AppSumo, and cold outreach are proven channels — not guaranteed to produce sales in 30 days, but correct free channels to maximize odds.
- "Nearly 100% profit" is true on **margin** (self-hosted/free-tier infra = almost no cost per sale after ~3% payment processing). It is not guaranteed on **volume**.
- If Week 2's OliOps launch underperforms, diagnose before Week 3 launch — don't repeat the same mistake twice.
