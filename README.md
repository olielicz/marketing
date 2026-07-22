# Marketing — 30-Day Go-to-Market Sprint

Everything needed to launch and sell 5 product lines bundled from olielicz's tool portfolio, executed in a 30-day sprint using entirely free tools.

**Start here:** [`00-master-calendar.md`](./00-master-calendar.md) — the day-by-day plan.
**Then:** [`STEP-BY-STEP-INSTRUCTIONS.md`](./STEP-BY-STEP-INSTRUCTIONS.md) — exact click-by-click steps for every external tool (Brevo, Product Hunt, AppSumo, GitHub Pages, directories, outreach).
**For payments:** [`PAYMENTS-SETUP.md`](./PAYMENTS-SETUP.md) — exact steps to wire up real Stripe + PayPal checkout on every Buy Now page.
**For AppSumo research:** [`appsumo-alternatives-research.md`](./appsumo-alternatives-research.md) — why lifetime pricing was chosen and what alternatives exist.

## The 5 product lines

| Line | Clean URL (once Pages is live) | Repos bundled | Pricing |
|---|---|---|---|
| Hub / all tools | `/` | — | — |
| OliOps Suite | `/oliops/` | OliCRM, OliCompute, automate-CSR | **$299 lifetime**, up to 5 devices |
| OliCommerce Stack | `/olicommerce/` | ecomm-automation, project-2 | **$199 lifetime**, up to 5 devices |
| OliFlow Automation Engine | `/oliflow/` | project-3, auto-tools | **$249 lifetime**, up to 5 devices |
| OliConnect | `/oliconnect/` | oliconnect | **$89 lifetime**, up to 5 devices |
| Oli-Locator | `/oli-locator/` | lead-gen | **$49/month** (hosted SaaS, no device cap — log in from anywhere) |

Each product folder has its own `index.html` plus a `buy/index.html` checkout page, so once GitHub Pages is live the URLs are clean — e.g. `olielicz.github.io/marketing/oliops/` and `olielicz.github.io/marketing/oliops/buy/` — no `.html` extension, no `landing-pages/` prefix.

**Pricing model:** the 4 self-hosted products (OliOps, OliCommerce, OliFlow, OliConnect) are **one-time lifetime purchases** — pay once, own it forever, each license comes with one serial code activatable on up to 5 devices. See [`licensing/README.md`](./licensing/README.md) for the license server that enforces this. Oli-Locator is hosted SaaS with its own login and a monthly subscription, so it has no device cap or serial code.

**Why lifetime instead of annual:** AppSumo and every comparable marketplace (Dealify, PitchGround, DealMirror, StackSocial) only supports lifetime-deal listings — there's no annual-subscription equivalent in that category. Full research in `appsumo-alternatives-research.md`.

**Payments:** every product's `buy/index.html` page has Stripe and PayPal buttons already built — see `PAYMENTS-SETUP.md` for the exact steps to swap in your real payment links.

## File map

```
00-master-calendar.md                    ← the 30-day plan
STEP-BY-STEP-INSTRUCTIONS.md             ← exactly what to click, per tool
PAYMENTS-SETUP.md                        ← wire up real Stripe + PayPal checkout
appsumo-alternatives-research.md         ← AppSumo alternative research + lifetime pricing rationale

index.html                                ← hub homepage linking to all 5 tools
oliops/index.html                         ← OliOps Suite landing page
oliops/buy/index.html                     ← OliOps Suite checkout page
olicommerce/index.html                    ← OliCommerce Stack landing page
olicommerce/buy/index.html                ← OliCommerce Stack checkout page
oliflow/index.html                        ← OliFlow Automation Engine landing page
oliflow/buy/index.html                    ← OliFlow Automation Engine checkout page
oliconnect/index.html                     ← OliConnect landing page
oliconnect/buy/index.html                 ← OliConnect checkout page
oli-locator/index.html                    ← Oli-Locator landing page
oli-locator/buy/index.html                ← Oli-Locator subscription checkout page

launch-checklists/                        ← one plain-text, start-to-finish launch checklist per tool
  oliops-suite-launch-checklist.txt
  olicommerce-stack-launch-checklist.txt
  oliflow-engine-launch-checklist.txt
  oliconnect-launch-checklist.txt
  oli-locator-launch-checklist.txt

security/index.html                       ← Trust & Security Center (honest disclosure, no SOC2/ISO overclaiming)
privacy/index.html                        ← GDPR-compliant Privacy Policy
terms/index.html                          ← Terms of Service (license terms, refund policy, liability limits)
contact/index.html                        ← Contact Us page, routed by category (support/billing/security/partnerships/pre-sale)
support/index.html                        ← Troubleshooting & Support hub, general + per-tool FAQs
shared/cookie-consent.js                  ← GDPR/ePrivacy cookie notice banner, included on every page

product-hunt-oliops-suite.md             ← PH launch copy per line
product-hunt-olicommerce-stack.md
product-hunt-oliflow-engine.md
product-hunt-oliconnect.md

email-sequence-oliops-suite.md           ← 5-email Brevo nurture sequence per line
email-sequence-olicommerce-stack.md
email-sequence-oliflow-engine.md
email-sequence-oliconnect.md

appsumo-pitch-oliops-suite.md            ← AppSumo LTD submission pitch per line
appsumo-pitch-oliflow-engine.md
appsumo-pitch-oliconnect.md

outreach-oli-locator.md                  ← cold outreach playbooks (no PH launch for these)
outreach-oliconnect.md

directory-submission-list.md             ← 40+ free directory/backlink submissions, tracked
competitor-comparison.md                 ← pros/cons table: all 5 tools vs. named competitors

licensing/                                ← shared serial-code / 5-device activation server
  README.md                               ← full docs: how it works, deployment, honest DRM caveat
  server/                                 ← zero-dependency Node activation API
  client/                                 ← drop-in client library for each product to embed
  scripts/                                ← CLI: generate-keys.js, generate-license.js
  test/                                   ← unit tests (node --test), all passing
```

## Trust & Compliance

- `security/`, `privacy/`, `terms/`, `contact/`, and `support/` are linked from the nav and footer of the hub page, all 5 product pages, and all 5 buy pages.
- `shared/cookie-consent.js` is a lightweight, no-tracking-by-default cookie notice (informational, not a hard consent gate — the site itself sets no cookies; only third-party widgets like Brevo/Stripe/PayPal do on interaction).
- Each self-hosted product repo (`OliCompute`, `OliCRM`, `project-3`, `oliconnect`) has its own `SECURITY.md` disclosing what's actually implemented (password hashing, timing-safe comparison) vs. not implemented (no encryption at rest, no built-in TLS/rate-limiting, no SOC2/pen-testing) — no unverifiable claims.
- Contact email across the whole site is `workitlikeapr01@gmail.com` (company: **WorkItLikeAPro**). The `/contact/` page form posts directly to that address via [FormSubmit.co](https://formsubmit.co/) — no third-party marketing platform, no account/API key needed. **The first submission triggers a one-time confirmation email from FormSubmit.co to that inbox — open it and click "Confirm" once**, and every submission after that arrives automatically.
- **Before going live**, still need to fill in:
  - `terms/index.html`: `[Insert your jurisdiction here before publishing]` (governing law, section 10)
  - `privacy/index.html` and `terms/index.html`: `[insert date before publishing]` (Last updated)
  - `contact/index.html`: the `_next` redirect URL currently points to a relative path — update it to your real live domain once deployed
  - Each product page's Brevo waitlist form (`<!-- BREVO_FORM -->` comment blocks) currently all point at the same OliOps list/form — create a dedicated Brevo list+form per product and swap in the real embed code (see `STEP-BY-STEP-INSTRUCTIONS.md` section 3, or each tool's file in `launch-checklists/`)
  - All 5 `buy/index.html` pages' Stripe/PayPal placeholder links (see `PAYMENTS-SETUP.md` and `launch-checklists/`)
- **Testimonials on each product page are illustrative placeholders, not real customer quotes** — each testimonials section has a visible disclaimer saying so. Replace them with real customer feedback once you have paying customers willing to share it. Publishing fabricated reviews as if real can violate consumer-protection rules (e.g. FTC guidance in the US).

## Status

- [ ] Repo made public (required for free GitHub Pages — see STEP-BY-STEP-INSTRUCTIONS.md #1)
- [ ] Landing pages deployed (GitHub Pages / Vercel)
- [ ] Stripe payment links created for all 5 products (4 one-time + 1 recurring) — see PAYMENTS-SETUP.md
- [ ] PayPal buttons created for all 5 products (4 Buy Now + 1 Subscribe) — see PAYMENTS-SETUP.md
- [ ] Buy Now pages' placeholder links replaced with real Stripe/PayPal links
- [ ] Serial-code delivery automation wired up (webhook -> license server, see PAYMENTS-SETUP.md)
- [ ] Brevo account + 5 waitlist lists + 5 automation sequences live
- [ ] Analytics installed on all 5 pages
- [ ] Directory submissions complete
- [ ] Licensing server deployed + Ed25519 keys generated (see `licensing/README.md`)
- [ ] AppSumo submissions filed (OliOps, OliCommerce, OliFlow, OliConnect) — now lifetime-deal compatible
- [ ] Product Hunt launch — OliOps Suite
- [ ] Product Hunt launch — OliFlow Automation Engine
- [ ] Product Hunt launch — OliCommerce Stack
- [ ] Oli-Locator outreach (Week 3 + Week 4 batches)
- [ ] OliConnect outreach + community posts (Week 3 + Week 4 batches)

Update this checklist as you complete each phase — it's your fastest way to see progress at a glance.
