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
